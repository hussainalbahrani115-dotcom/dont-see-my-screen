import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

export const config = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || join(root, 'data', 'game.sqlite'),
  publicDir: join(root, 'public'),
  // Server-side only. Never exposed to the browser.
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-haiku-5-5',
  roomTtlMs: 6 * 60 * 60_000,
  // Socket events allowed per player per 10 seconds.
  rateLimit: 80,
};
