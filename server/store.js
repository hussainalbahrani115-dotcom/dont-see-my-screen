// SQLite persistence (Node's built-in driver). Rooms are stored as JSON
// snapshots so a server restart resumes games where they stopped; finished
// rounds go to a results table that backs the leaderboard.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openStore(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT UNIQUE,
      team TEXT NOT NULL,
      ending TEXT NOT NULL,
      score INTEGER NOT NULL,
      grade TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const upsert = db.prepare(
    'INSERT INTO rooms (code, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at',
  );
  const del = db.prepare('DELETE FROM rooms WHERE code = ?');
  const loadSince = db.prepare('SELECT data, updated_at FROM rooms WHERE updated_at >= ?');
  const purge = db.prepare('DELETE FROM rooms WHERE updated_at < ?');
  const addResult = db.prepare(
    'INSERT OR IGNORE INTO results (game_id, team, ending, score, grade, difficulty, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const top = db.prepare('SELECT team, ending, score, grade, difficulty, duration_ms, created_at FROM results ORDER BY score DESC, duration_ms ASC LIMIT ?');

  return {
    saveRoom(room, now) {
      upsert.run(room.code, JSON.stringify(room), now);
    },
    deleteRoom(code) {
      del.run(code);
    },
    loadRooms(since) {
      purge.run(since);
      return loadSince.all(since).map((r) => ({ room: JSON.parse(r.data), savedAt: r.updated_at }));
    },
    addResult(r) {
      addResult.run(r.gameId, r.team, r.ending, r.score, r.grade, r.difficulty, r.durationMs, r.createdAt);
    },
    topResults(limit = 10) {
      return top.all(limit);
    },
    close() {
      db.close();
    },
  };
}
