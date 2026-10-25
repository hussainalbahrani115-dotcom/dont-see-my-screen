import express from 'express';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { config } from './config.js';
import { openStore } from './store.js';
import { RoomService } from './rooms.js';
import { attachRealtime } from './realtime.js';
import { createProvider } from './ai/index.js';

export function createGameServer(options = {}) {
  const cfg = { ...config, ...options };
  const store = openStore(cfg.dbFile);
  const provider = options.provider ?? createProvider(cfg);
  const rooms = new RoomService({ store, provider, ttlMs: cfg.roomTtlMs });
  const restored = rooms.load();

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'",
    );
    next();
  });
  app.use(express.static(cfg.publicDir, { extensions: ['html'], maxAge: 0 }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size, ai: provider.name }));
  app.get('/api/leaderboard', (_req, res) => res.json({ results: store.topResults(10) }));

  const server = createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 16_000, pingInterval: 10_000, pingTimeout: 8_000 });
  attachRealtime(io, rooms, { rateLimit: cfg.rateLimit });
  const ticker = setInterval(() => rooms.tickAll(), 1000);

  return {
    app,
    server,
    io,
    rooms,
    store,
    provider,
    restored,
    listen(port = cfg.port, host = cfg.host) {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port)));
    },
    async close() {
      clearInterval(ticker);
      await new Promise((r) => io.close(() => r()));
      rooms.flush();
      store.close();
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const game = createGameServer();
  const port = await game.listen();
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${port}`);
  console.log(`لا تشوف شاشتي — running on http://localhost:${port}`);
  if (lan.length) console.log(`On your network: ${lan.join('  ')}`);
  console.log(`AI provider: ${game.provider.name}${game.provider.name === 'local' ? ' (set ANTHROPIC_API_KEY to enable Claude)' : ''}`);
  if (game.restored) console.log(`Restored ${game.restored} room(s) from the database.`);
  const shutdown = async () => {
    await game.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
