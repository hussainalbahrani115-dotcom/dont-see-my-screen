// Room lifecycle: codes, seats, roles, readiness, reconnection, pausing,
// rematches and persistence. Game rules live in ./game/engine.js.

import crypto from 'node:crypto';
import * as engine from './game/engine.js';
import { GameError, ROLES, DIFFICULTIES, other } from './game/engine.js';
import { STAGES } from './game/stages/index.js';
import { cleanText } from './game/text.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DISCONNECT_GRACE_MS = 4000;
const LOBBY_SEAT_TIMEOUT_MS = 3 * 60_000;

export class RoomService {
  constructor({ store, provider, ttlMs, now = () => Date.now() }) {
    this.store = store;
    this.provider = provider;
    this.ttlMs = ttlMs;
    this.now = now;
    this.rooms = new Map();
    this.saveTimers = new Map();
    this.onChange = () => {};
  }

  // ------------------------------------------------------------ persistence

  load() {
    const now = this.now();
    for (const { room, savedAt } of this.store.loadRooms(now - this.ttlMs)) {
      for (const p of room.players) {
        p.connected = false;
        p.socketId = null;
        p.lastSeen = savedAt;
      }
      // Downtime does not eat into the team's clock.
      if (room.game?.status === 'playing' && !room.game.pausedAt) room.game.pausedAt = savedAt;
      this.rooms.set(room.code, room);
    }
    return this.rooms.size;
  }

  persist(room) {
    room.updatedAt = this.now();
    if (this.closed || this.saveTimers.has(room.code)) return;
    this.saveTimers.set(
      room.code,
      setTimeout(() => {
        this.saveTimers.delete(room.code);
        if (this.rooms.get(room.code) === room) this.store.saveRoom(serialize(room), room.updatedAt);
      }, 250),
    );
  }

  // Writes pending snapshots and stops further writes (server shutdown).
  flush() {
    this.closed = true;
    for (const [code, t] of this.saveTimers) {
      clearTimeout(t);
      const room = this.rooms.get(code);
      if (room) this.store.saveRoom(serialize(room), room.updatedAt);
    }
    this.saveTimers.clear();
  }

  changed(room, ctx = engine.newCtx()) {
    this.persist(room);
    this.onChange(room, ctx.fx);
    this.processRequests(room, ctx);
  }

  // ------------------------------------------------------------ rooms

  makeCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  get(code) {
    const room = this.rooms.get(String(code || '').toUpperCase().trim());
    if (!room) throw new GameError('الغرفة غير موجودة أو انتهت صلاحيتها', 'no_room');
    return room;
  }

  newPlayer(name, role) {
    const clean = cleanText(name, 20);
    if (clean.length < 2) throw new GameError('اكتب اسمًا من حرفين على الأقل', 'bad_name');
    return {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString('hex'),
      name: clean,
      role,
      ready: false,
      connected: false,
      lastSeen: this.now(),
      socketId: null,
    };
  }

  create(name) {
    const player = this.newPlayer(name, 'explorer');
    const room = {
      code: this.makeCode(),
      createdAt: this.now(),
      updatedAt: this.now(),
      hostId: player.id,
      difficulty: 'normal',
      players: [player],
      game: null,
      lastResult: null,
      rematch: [],
      rounds: 0,
    };
    this.rooms.set(room.code, room);
    this.persist(room);
    return { room, player };
  }

  join(code, name) {
    const room = this.get(code);
    if (room.players.length >= 2) throw new GameError('الغرفة ممتلئة — اللعبة لشخصين فقط', 'full');
    const taken = room.players[0]?.role;
    const player = this.newPlayer(name, taken ? other(taken) : 'explorer');
    if (room.players.some((p) => p.name === player.name)) player.name = `${player.name} ٢`;
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    // Someone left mid-game: the newcomer takes over the empty seat.
    if (room.game) room.game.names[player.role] = player.name;
    this.changed(room);
    return { room, player };
  }

  resume(code, token) {
    const room = this.get(code);
    const player = room.players.find((p) => typeof token === 'string' && safeEqual(p.token, token));
    if (!player) throw new GameError('انتهت جلستك في هذه الغرفة', 'bad_token');
    return { room, player };
  }

  playerOf(room, playerId) {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) throw new GameError('لست عضوًا في هذه الغرفة', 'not_member');
    return p;
  }

  connect(room, player, socketId) {
    player.connected = true;
    player.socketId = socketId;
    player.lastSeen = this.now();
    if (room.game && this.allPresent(room)) engine.resume(room.game, this.now());
    this.changed(room);
  }

  disconnect(room, playerId, socketId) {
    const p = room.players.find((x) => x.id === playerId);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.socketId = null;
    p.lastSeen = this.now();
    this.changed(room);
  }

  leave(room, playerId) {
    room.players = room.players.filter((p) => p.id !== playerId);
    room.rematch = room.rematch.filter((id) => id !== playerId);
    if (room.hostId === playerId) room.hostId = room.players[0]?.id ?? null;
    for (const p of room.players) p.ready = false;
    if (!room.players.length) {
      this.destroy(room);
      return;
    }
    if (room.game?.status === 'playing') engine.pause(room.game, this.now());
    this.changed(room);
  }

  destroy(room) {
    clearTimeout(this.saveTimers.get(room.code));
    this.saveTimers.delete(room.code);
    this.rooms.delete(room.code);
    this.store.deleteRoom(room.code);
  }

  allPresent(room) {
    return ROLES.every((r) => room.players.some((p) => p.role === r && p.connected));
  }

  // ------------------------------------------------------------ lobby

  updateLobby(room, playerId, { role, ready, difficulty }) {
    const me = this.playerOf(room, playerId);
    if (room.game) throw new GameError('الجولة جارية بالفعل');
    if (role !== undefined) {
      if (!ROLES.includes(role)) throw new GameError('دور غير معروف');
      if (me.role !== role) {
        const mate = room.players.find((p) => p.id !== me.id);
        if (mate) mate.role = me.role;
        me.role = role;
        room.players.forEach((p) => (p.ready = false));
      }
    }
    if (difficulty !== undefined) {
      if (room.hostId !== me.id) throw new GameError('صاحب الغرفة فقط يحدد الصعوبة');
      if (!DIFFICULTIES.includes(difficulty)) throw new GameError('مستوى صعوبة غير معروف');
      if (room.difficulty !== difficulty) {
        room.difficulty = difficulty;
        room.players.forEach((p) => (p.ready = false));
      }
    }
    if (ready !== undefined) me.ready = !!ready;

    const ctx = engine.newCtx();
    if (room.players.length === 2 && room.players.every((p) => p.ready) && room.players[0].role !== room.players[1].role) {
      this.startGame(room, ctx);
    }
    this.changed(room, ctx);
  }

  startGame(room, ctx) {
    const now = this.now();
    const names = Object.fromEntries(room.players.map((p) => [p.role, p.name]));
    const seed = crypto.randomInt(2 ** 31 - 1);
    room.game = engine.createGame({ seed, difficulty: room.difficulty, names, now, ctx });
    room.rematch = [];
    room.rounds++;
    const gameId = room.game.id;
    this.provider
      .prepareMission({ names, difficulty: room.difficulty })
      .then((ai) => {
        if (ai && room.game?.id === gameId) {
          room.game.ai = ai;
          this.persist(room);
        }
      })
      .catch(() => {});
  }

  // ------------------------------------------------------------ in game

  gameFor(room, playerId) {
    const me = this.playerOf(room, playerId);
    if (!room.game) throw new GameError('لا توجد جولة جارية');
    return { me, game: room.game };
  }

  action(room, playerId, type, payload) {
    const { me, game } = this.gameFor(room, playerId);
    const ctx = engine.newCtx();
    try {
      return engine.handleAction(game, me.role, type, payload, this.now(), ctx);
    } finally {
      this.changed(room, ctx);
    }
  }

  chat(room, playerId, text) {
    const { me, game } = this.gameFor(room, playerId);
    engine.sendChat(game, me.role, text, this.now());
    this.changed(room, { fx: [{ to: other(me.role), type: 'msg', data: {} }], requests: [] });
  }

  flag(room, playerId, id) {
    const { me, game } = this.gameFor(room, playerId);
    const ctx = engine.newCtx();
    engine.flagMessage(game, me.role, Number(id), this.now(), ctx);
    this.changed(room, ctx);
  }

  async hint(room, playerId) {
    const { me, game } = this.gameFor(room, playerId);
    const hint = engine.requestHint(game, me.role, this.now());
    this.changed(room);
    const styled = await this.provider.styleHint({ text: hint.text, stageTitle: STAGES[game.stageIndex].title }).catch(() => hint.text);
    if (styled && styled !== hint.text && room.game === game) {
      const stored = game.hints[me.role].find((h) => h.id === hint.id);
      if (stored) stored.text = styled;
      this.changed(room);
    }
    return { tier: hint.tier };
  }

  rematch(room, playerId) {
    this.playerOf(room, playerId);
    if (room.game?.status !== 'ended') throw new GameError('لا يمكن بدء جولة جديدة الآن');
    if (!room.rematch.includes(playerId)) room.rematch.push(playerId);
    if (room.players.length === 2 && room.players.every((p) => room.rematch.includes(p.id))) {
      // Back to the lobby with a clean slate; the next round gets a new seed.
      room.lastResult = { ...room.game.result, ending: room.game.ending };
      room.game = null;
      room.rematch = [];
      room.players.forEach((p) => (p.ready = false));
    }
    this.changed(room);
  }

  // ------------------------------------------------------------ async AI work

  processRequests(room, ctx) {
    const game = room.game;
    for (const req of ctx.requests) {
      if (req.kind === 'fake') {
        this.provider
          .styleFake({ fallback: req.fallback, partnerMessages: req.partnerMessages })
          .catch(() => req.fallback.text)
          .then((text) => {
            if (room.game === game && engine.injectFake(game, req.to, text, this.now(), req.stageIndex)) {
              this.changed(room, { fx: [{ to: req.to, type: 'msg', data: {} }], requests: [] });
            }
          });
      }
      if (req.kind === 'epilogue' && game?.result) {
        try {
          this.store.addResult({
            gameId: game.id,
            team: `${game.names.explorer} و${game.names.archivist}`,
            ending: game.ending,
            score: game.result.score,
            grade: game.result.grade,
            difficulty: game.difficulty,
            durationMs: game.result.durationMs,
            createdAt: this.now(),
          });
        } catch (e) {
          console.error('failed to record result', e);
        }
        this.provider
          .epilogue({ game })
          .catch(() => '')
          .then((text) => {
            if (room.game === game && game.result) {
              game.result.epilogue = text || '';
              this.changed(room);
            }
          });
      }
    }
  }

  // ------------------------------------------------------------ clock

  tickAll() {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const ctx = engine.newCtx();
      let dirty = false;
      const game = room.game;
      if (game?.status === 'playing') {
        const missing = ROLES.some((r) => {
          const p = room.players.find((x) => x.role === r);
          return !p || (!p.connected && now - p.lastSeen > DISCONNECT_GRACE_MS);
        });
        if (missing && engine.pause(game, now)) dirty = true;
        if (!missing && game.pausedAt && this.allPresent(room) && engine.resume(game, now)) dirty = true;
        if (engine.tick(game, now, ctx)) dirty = true;
      } else if (!game) {
        const stale = room.players.filter((p) => !p.connected && now - p.lastSeen > LOBBY_SEAT_TIMEOUT_MS);
        for (const p of stale) {
          this.leave(room, p.id);
          if (!this.rooms.has(room.code)) break;
        }
      }
      if (!this.rooms.has(room.code)) continue;
      if (!room.players.some((p) => p.connected) && now - room.updatedAt > this.ttlMs) {
        this.destroy(room);
        continue;
      }
      if (dirty || ctx.fx.length || ctx.requests.length) this.changed(room, ctx);
    }
  }

  // ------------------------------------------------------------ views

  stateFor(room, playerId) {
    const now = this.now();
    const me = room.players.find((p) => p.id === playerId);
    return {
      serverNow: now,
      room: {
        code: room.code,
        hostId: room.hostId,
        difficulty: room.difficulty,
        phase: room.game ? (room.game.status === 'ended' ? 'ended' : 'playing') : 'lobby',
        players: room.players.map((p) => ({ id: p.id, name: p.name, role: p.role, ready: p.ready, connected: p.connected })),
        rematch: room.rematch,
        lastResult: room.game ? null : room.lastResult && { score: room.lastResult.score, grade: room.lastResult.grade, ending: room.lastResult.ending },
      },
      you: me ? { id: me.id, role: me.role, name: me.name } : null,
      game: room.game && me ? engine.gameView(room.game, me.role, now) : null,
    };
  }
}

function serialize(room) {
  return { ...room, players: room.players.map(({ socketId, ...p }) => ({ ...p, connected: false })) };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
