// Two real Socket.IO clients against a real server instance.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as connect } from 'socket.io-client';
import { createGameServer } from '../server/index.js';
import { localProvider } from '../server/ai/local.js';
import { solutionFor, stageId } from './helpers.js';

let srv;
let url;

before(async () => {
  srv = createGameServer({ dbFile: ':memory:', provider: localProvider, rateLimit: 1000 });
  const port = await srv.listen(0, '127.0.0.1');
  url = `http://127.0.0.1:${port}`;
});

after(async () => {
  await srv.close();
});

function client() {
  const socket = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  const c = {
    socket,
    state: null,
    fx: [],
    emit: (ev, payload = {}) => new Promise((res) => socket.emit(ev, payload, res)),
    waitFor(pred, ms = 3000) {
      return new Promise((resolve, reject) => {
        if (c.state && pred(c.state)) return resolve(c.state);
        const t = setTimeout(() => reject(new Error('timeout waiting for state')), ms);
        const on = (s) => {
          if (pred(s)) {
            clearTimeout(t);
            socket.off('state', on);
            resolve(s);
          }
        };
        socket.on('state', on);
      });
    },
  };
  socket.on('state', (s) => (c.state = s));
  socket.on('fx', (e) => c.fx.push(e));
  return new Promise((resolve) => socket.on('connect', () => resolve(c)));
}

async function setupPair() {
  const a = await client();
  const b = await client();
  const created = await a.emit('room:create', { name: 'سارة' });
  assert.ok(created.ok, created.error);
  const joined = await b.emit('room:join', { code: created.code.toLowerCase(), name: 'خالد' });
  assert.ok(joined.ok, joined.error);
  return { a, b, code: created.code, tokens: { a: created.token, b: joined.token } };
}

test('rooms: unique code, two seats only, bad codes rejected', async () => {
  const { a, b, code } = await setupPair();
  const c = await client();
  const full = await c.emit('room:join', { code, name: 'ثالث' });
  assert.equal(full.ok, false);
  assert.match(full.error, /ممتلئة/);
  const missing = await c.emit('room:join', { code: 'ZZZZZ', name: 'ثالث' });
  assert.equal(missing.ok, false);
  const badName = await c.emit('room:create', { name: ' ' });
  assert.equal(badName.ok, false);
  const forged = await c.emit('room:resume', { code, token: 'x'.repeat(48) });
  assert.equal(forged.ok, false);
  // Not in a room → cannot act.
  const act = await c.emit('game:action', { type: 'cut', payload: { index: 0 } });
  assert.equal(act.ok, false);
  const s = await a.waitFor((st) => st.room.players.length === 2);
  assert.deepEqual(s.room.players.map((p) => p.role).sort(), ['archivist', 'explorer']);
  assert.ok(!JSON.stringify(s).includes('token'), 'tokens are never broadcast');
  [a, b, c].forEach((x) => x.socket.close());
});

test('full online round: secrecy, sync, chat, echo flag, release ending, rematch', async () => {
  const { a, b, code } = await setupPair();
  // b takes the explorer role (swap), host sets difficulty.
  assert.ok((await b.emit('lobby:update', { role: 'explorer' })).ok);
  assert.equal((await b.emit('lobby:update', { difficulty: 'hard' })).ok, false, 'only host sets difficulty');
  assert.ok((await a.emit('lobby:update', { difficulty: 'normal' })).ok);
  await a.emit('lobby:update', { ready: true });
  await b.emit('lobby:update', { ready: true });
  const sa = await a.waitFor((s) => s.room.phase === 'playing');
  const sb = await b.waitFor((s) => s.room.phase === 'playing');
  assert.equal(sa.you.role, 'archivist');
  assert.equal(sb.you.role, 'explorer');
  assert.equal(sa.game.id, sb.game.id);
  assert.ok(Math.abs(sa.game.remainingMs - sb.game.remainingMs) < 1500, 'timers in sync');

  const room = srv.rooms.rooms.get(code);
  const game = room.game;
  // Secrecy: each payload lacks the other side's information and the answer.
  const ex = JSON.stringify(sb.game.stage);
  const ar = JSON.stringify(sa.game.stage);
  assert.ok(ex.includes('wires') && !ex.includes('manual') && !ex.includes('answer'));
  assert.ok(ar.includes('manual') && !ar.includes('wires') && !ar.includes('serial') && !ar.includes('answer'));
  assert.equal(sb.game.docs, undefined, 'explorer has no archive documents');
  assert.ok(sa.game.docs.length >= 2);

  // Role enforcement: the archivist cannot cut wires.
  assert.equal((await a.emit('game:action', { type: 'cut', payload: { index: 0 } })).ok, false);
  // Malformed payloads are rejected, not crashing the server.
  assert.equal((await b.emit('game:action', { type: 'cut', payload: { index: 'x' } })).ok, false);
  assert.equal((await b.emit('game:action', { type: '__proto__', payload: {} })).ok, false);

  // Chat reaches the partner.
  await b.emit('chat:send', { text: 'نجمة: أرى رمزًا يشبه عينًا' });
  await a.waitFor((s) => s.game.chat.some((m) => m.from === 'partner' && m.text.includes('عينًا')));

  // Force an Echo impersonation now and flag it.
  const entry = game.echoQueue.find((e) => e.stageIndex === 0);
  entry.at = Date.now() - 1;
  entry.to = 'archivist';
  const withFake = await a.waitFor((s) => s.game.chat.some((m) => m.from === 'partner' && m.canFlag && !m.text.includes('عينًا')), 4000);
  const fake = withFake.game.chat.find((m) => m.from === 'partner' && m.canFlag && !m.text.includes('عينًا'));
  assert.ok(!('fake' in fake));
  const bView = await b.waitFor(() => true);
  assert.ok(!bView.game.chat.some((m) => m.id === fake.id), 'the impersonated player never sees the fake');
  assert.ok((await a.emit('chat:flag', { id: fake.id })).ok);
  await a.waitFor((s) => s.game.chat.some((m) => m.id === fake.id && m.flag === 'echo'));

  // Play the whole mission with the right moves.
  const sock = { explorer: b, archivist: a };
  for (let guard = 0; game.status === 'playing' && guard < 12; guard++) {
    if (stageId(game) === 'pressure') {
      // Real-time stage: fast-forward the boiler to the edge of completion
      // and let the server clock finish it.
      const st = game.stage;
      Object.assign(st, { startAt: 0, lastTick: Date.now(), drift: 0, surge: 0, p: (st.lo + st.hi) / 2, progress: st.goal - 0.2 });
      await a.waitFor((s) => s.game.stageId !== 'pressure', 4000);
      continue;
    }
    if (stageId(game) === 'chase') {
      const offered = await a.waitFor((s) => s.game.deal === 'offered');
      assert.equal(offered.game.deal, 'offered');
      assert.equal(b.state.game.deal, undefined, 'the explorer never sees the offer');
      assert.equal((await b.emit('game:deal', { accept: true })).ok, false, 'only the archivist can answer');
      assert.ok((await a.emit('game:deal', { accept: false })).ok);
    }
    for (const step of solutionFor(game)) {
      const res = await sock[step.role].emit('game:action', { type: step.type, payload: step.payload });
      assert.ok(res.ok, `${step.type}: ${res.error}`);
    }
  }
  const ended = await a.waitFor((s) => s.room.phase === 'ended');
  assert.equal(ended.game.ending.key, 'release');
  assert.equal(ended.game.result.fragments, 3);
  assert.ok(ended.game.result.fakes.some((f) => f.caught));
  assert.ok(ended.game.result.badges.some((x) => x.title === 'لا للصفقة'));
  assert.ok((await a.emit('game:ping')).ok === false, 'no pings after the round ends');
  await a.waitFor((s) => s.game.result.epilogue != null);
  const board = await (await fetch(`${url}/api/leaderboard`)).json();
  assert.ok(board.results.some((r) => r.ending === 'release'));

  // Rematch requires both, and returns to a clean lobby.
  await a.emit('game:rematch');
  let s = await a.waitFor((st) => st.room.rematch.length === 1);
  assert.equal(s.room.phase, 'ended');
  await b.emit('game:rematch');
  s = await a.waitFor((st) => st.room.phase === 'lobby');
  assert.equal(s.game, null);
  assert.ok(s.room.players.every((p) => !p.ready));
  await a.emit('lobby:update', { ready: true });
  await b.emit('lobby:update', { ready: true });
  const fresh = await a.waitFor((st) => st.room.phase === 'playing');
  assert.notEqual(fresh.game.id, game.id);
  assert.equal(fresh.game.stageIndex, 0);
  assert.equal(fresh.game.fragmentsFound, 0);
  assert.equal(fresh.game.stats.mistakes, 0);
  assert.ok(!fresh.game.chat.some((m) => m.from !== 'system'), 'no chat carried over');
  a.socket.close();
  b.socket.close();
});

test('disconnect pauses the clock; resume with token restores the seat and progress', async () => {
  const { a, b, code, tokens } = await setupPair();
  await a.emit('lobby:update', { ready: true });
  await b.emit('lobby:update', { ready: true });
  await b.waitFor((s) => s.room.phase === 'playing');
  const game = srv.rooms.rooms.get(code).game;
  // Explorer (a, the creator) makes a mistake so there is progress to keep.
  const wrong = game.stage.answer === 0 ? 1 : 0;
  await a.emit('game:action', { type: 'cut', payload: { index: wrong } });
  a.socket.close();
  const paused = await b.waitFor((s) => s.game.paused, 7000);
  const frozen = paused.game.remainingMs;
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(srv.rooms.stateFor(srv.rooms.rooms.get(code), paused.you.id).game.remainingMs, frozen, 'clock frozen while paused');

  const a2 = await client();
  const res = await a2.emit('room:resume', { code, token: tokens.a });
  assert.ok(res.ok, res.error);
  const back = await a2.waitFor((s) => s.game && !s.game.paused);
  assert.equal(back.you.role, 'explorer');
  assert.deepEqual(back.game.stage.burned, [wrong]);
  assert.equal(back.game.stats.mistakes, 1);
  a2.socket.close();
  b.socket.close();
});

test('flooding a socket is rate limited', async () => {
  const limited = createGameServer({ dbFile: ':memory:', provider: localProvider, rateLimit: 5 });
  const port = await limited.listen(0, '127.0.0.1');
  const socket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise((r) => socket.on('connect', r));
  const replies = await Promise.all(Array.from({ length: 8 }, () => new Promise((r) => socket.emit('chat:send', { text: 'x' }, r))));
  assert.ok(replies.some((r) => /تمهّل/.test(r.error)));
  socket.close();
  await limited.close();
});

test('a newer tab takes over the seat; the old socket is kicked', async () => {
  const { a, b, code, tokens } = await setupPair();
  let kicked = false;
  a.socket.on('kicked', () => (kicked = true));
  const a2 = await client();
  assert.ok((await a2.emit('room:resume', { code, token: tokens.a })).ok);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(kicked);
  const s = await a2.waitFor((st) => st.room.players.every((p) => p.connected));
  assert.equal(s.room.players.length, 2);
  a2.socket.close();
  b.socket.close();
});

test('rooms survive a server restart (SQLite)', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'dsms-'));
  const dbFile = join(dir, 'g.sqlite');
  const s1 = createGameServer({ dbFile, provider: localProvider });
  const { player, room } = s1.rooms.create('سارة');
  s1.rooms.join(room.code, 'خالد');
  s1.rooms.updateLobby(room, room.players[0].id, { ready: true });
  s1.rooms.updateLobby(room, room.players[1].id, { ready: true });
  const answer = room.game.stage.answer;
  await s1.close();
  const s2 = createGameServer({ dbFile, provider: localProvider });
  const restored = s2.rooms.rooms.get(room.code);
  assert.ok(restored, 'room restored');
  assert.equal(restored.game.stage.answer, answer);
  assert.ok(restored.game.pausedAt, 'restored games start paused until both return');
  assert.ok(s2.rooms.resume(room.code, player.token));
  await s2.close();
  rmSync(dir, { recursive: true, force: true });
});
