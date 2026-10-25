// Socket.IO wiring. Each socket is bound to at most one (room, player) after
// create/join/resume; every event is re-authorised against that binding.
// Each player receives only their personalised state.

import { GameError } from './game/engine.js';

function rateLimiter(limit, windowMs = 10_000) {
  let stamps = [];
  return () => {
    const now = Date.now();
    stamps = stamps.filter((t) => now - t < windowMs);
    if (stamps.length >= limit) return false;
    stamps.push(now);
    return true;
  };
}

export function attachRealtime(io, rooms, { rateLimit = 80 } = {}) {
  const sendState = (room) => {
    for (const p of room.players) {
      if (p.socketId) io.to(p.socketId).emit('state', rooms.stateFor(room, p.id));
    }
  };

  rooms.onChange = (room, fx = []) => {
    sendState(room);
    for (const e of fx) {
      for (const p of room.players) {
        if (p.socketId && (e.to === 'both' || e.to === p.role)) io.to(p.socketId).emit('fx', { type: e.type, data: e.data });
      }
    }
  };

  io.on('connection', (socket) => {
    let session = null; // { code, playerId }
    const allow = rateLimiter(rateLimit);

    const bind = (room, player) => {
      if (session && (session.code !== room.code || session.playerId !== player.id)) unbind();
      // One live socket per player: a newer tab takes over the seat.
      if (player.socketId && player.socketId !== socket.id) {
        io.to(player.socketId).emit('kicked', { reason: 'فُتحت جلستك من نافذة أخرى' });
        io.sockets.sockets.get(player.socketId)?.disconnect(true);
      }
      session = { code: room.code, playerId: player.id };
      rooms.connect(room, player, socket.id);
    };

    const unbind = () => {
      if (!session) return;
      const room = rooms.rooms.get(session.code);
      if (room) rooms.disconnect(room, session.playerId, socket.id);
      session = null;
    };

    const current = () => {
      if (!session) throw new GameError('لست داخل غرفة', 'no_session');
      const room = rooms.rooms.get(session.code);
      if (!room || !room.players.some((p) => p.id === session.playerId)) {
        session = null;
        throw new GameError('الغرفة لم تعد متاحة', 'no_room');
      }
      return room;
    };

    const handle = (event, fn) => {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!allow()) return reply({ ok: false, error: 'تمهّل قليلًا…' });
        try {
          const result = await fn(payload && typeof payload === 'object' ? payload : {});
          reply({ ok: true, ...(result || {}) });
        } catch (e) {
          if (e instanceof GameError) reply({ ok: false, error: e.message, code: e.code });
          else {
            console.error(`[${event}]`, e);
            reply({ ok: false, error: 'خطأ غير متوقع في الخادم' });
          }
        }
      });
    };

    handle('room:create', ({ name }) => {
      const { room, player } = rooms.create(name);
      bind(room, player);
      return { code: room.code, token: player.token };
    });

    handle('room:join', ({ code, name }) => {
      const { room, player } = rooms.join(code, name);
      bind(room, player);
      return { code: room.code, token: player.token };
    });

    handle('room:resume', ({ code, token }) => {
      const { room, player } = rooms.resume(code, token);
      bind(room, player);
      return { code: room.code };
    });

    handle('room:leave', () => {
      const room = current();
      const id = session.playerId;
      session = null;
      rooms.leave(room, id);
    });

    handle('lobby:update', ({ role, ready, difficulty }) => {
      rooms.updateLobby(current(), session.playerId, { role, ready, difficulty });
    });

    handle('game:action', ({ type, payload }) => rooms.action(current(), session.playerId, type, payload));
    handle('chat:send', ({ text }) => rooms.chat(current(), session.playerId, text));
    handle('chat:flag', ({ id }) => rooms.flag(current(), session.playerId, id));
    handle('game:hint', () => rooms.hint(current(), session.playerId));
    handle('game:rematch', () => rooms.rematch(current(), session.playerId));

    socket.on('disconnect', unbind);
  });
}
