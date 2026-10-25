import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/game/rng.js';
import junction, { solve } from '../server/game/stages/junction.js';
import archive, { bfs } from '../server/game/stages/archive.js';
import broadcast, { POOL, WORDS3, WORDS4, computeAnswer, isValidWord } from '../server/game/stages/broadcast.js';
import * as engine from '../server/game/engine.js';
import { mimic } from '../server/ai/local.js';
import { solutionFor } from './helpers.js';

const fakeGame = { names: { explorer: 'أ', archivist: 'ب' }, ai: null, phrase: ['الموج', 'يعود'] };

test('junction: every generated panel has exactly the computed answer', () => {
  for (let seed = 1; seed <= 400; seed++) {
    for (const level of [0, 1, 2]) {
      const st = junction.generate({ rng: createRng(seed * 7 + level), level, game: fakeGame });
      junction.validate(st);
      const model = st.models.find((m) => m.glyphs.includes(st.panel.glyph));
      assert.equal(solve(model, st.panel).index, st.answer);
      assert.equal(st.panel.wires.length, [4, 5, 6][level]);
    }
  }
});

test('junction: views never leak the answer or the other side', () => {
  const st = junction.generate({ rng: createRng(42), level: 1, game: fakeGame });
  const ev = JSON.stringify(junction.explorerView(st));
  const av = JSON.stringify(junction.archivistView(st));
  assert.ok(!ev.includes('answer') && !ev.includes('rules') && !ev.includes('manual'));
  assert.ok(!av.includes('answer') && !av.includes('wires') && !av.includes('serial'));
});

test('archive: exit and fragment reachable around hazards; views split', () => {
  for (let seed = 1; seed <= 300; seed++) {
    for (const level of [0, 1, 2]) {
      const st = archive.generate({ rng: createRng(seed * 13 + level), level, game: fakeGame });
      archive.validate(st);
      assert.equal(st.hazards.length, [1, 2, 3][level]);
      const reach = bfs(st.walls, st.start, new Set(st.hazards));
      assert.ok(reach.has(st.exit));
    }
  }
  const st = archive.generate({ rng: createRng(5), level: 1, game: fakeGame });
  const ev = archive.explorerView(st);
  assert.equal(ev.pos, undefined);
  assert.ok(!JSON.stringify(ev).includes(st.pos));
  const av = archive.archivistView(st);
  assert.equal(av.pos, undefined);
  assert.equal(av.start, undefined);
});

test('broadcast: word lists use the codebook alphabet; answers are unique on the dial', () => {
  for (const w of WORDS3) assert.ok(isValidWord(w, 3), w);
  for (const w of WORDS4) assert.ok(isValidWord(w, 4), w);
  assert.equal(new Set(POOL).size, POOL.length);
  for (let seed = 1; seed <= 300; seed++) {
    for (const level of [0, 1, 2]) {
      let st;
      for (let attempt = 0; ; attempt++) {
        st = broadcast.generate({ rng: createRng(seed * 31 + attempt * 1000 + level), level, game: fakeGame });
        try { broadcast.validate(st); break; } catch (e) { if (attempt > 10) throw e; }
      }
      assert.equal(st.answer, computeAnswer(st));
      assert.ok(st.letters.every((l) => st.codebook[l]));
    }
  }
});

test('echo mimicry copies habits but never the opening password', () => {
  const partner = ['نجمة طيب شوف 😂', 'نجمة السلك الثاني 😂', 'نجمة تمام'];
  const out = mimic('اقطع السلك الأول', partner);
  assert.ok(!out.startsWith('نجمة'));
  assert.ok(out.includes('😂'));
});

function play(difficulty = 'normal') {
  let now = 1_000_000;
  const ctx = engine.newCtx();
  const game = engine.createGame({ seed: 12345, difficulty, names: { explorer: 'سارة', archivist: 'خالد' }, now, ctx });
  return { game, ctx, tick: (ms) => (now += ms), get now() { return now; } };
}

test('full playthrough reaches the release ending with all fragments', () => {
  const s = play();
  for (let guard = 0; s.game.status === 'playing' && guard < 10; guard++) {
    for (const step of solutionFor(s.game)) {
      s.tick(2000);
      engine.handleAction(s.game, step.role, step.type, step.payload, s.now, engine.newCtx());
    }
  }
  assert.equal(s.game.status, 'ended');
  assert.equal(s.game.ending, 'release');
  assert.equal(s.game.result.fragments, 3);
  assert.ok(s.game.result.won);
  assert.ok(s.game.result.score > 1500);
});

test('wrong answers cost time; timer runs out to the timeout ending', () => {
  const s = play('hard');
  const before = s.game.deadline;
  const wrong = s.game.stage.answer === 0 ? 1 : 0;
  engine.handleAction(s.game, 'explorer', 'cut', { index: wrong }, s.now, engine.newCtx());
  assert.equal(s.game.deadline, before - 30_000);
  assert.equal(s.game.stats.mistakes, 1);
  assert.throws(() => engine.handleAction(s.game, 'explorer', 'cut', { index: wrong }, s.now, engine.newCtx()), /محترق/);
  assert.throws(() => engine.handleAction(s.game, 'archivist', 'cut', { index: 0 }, s.now, engine.newCtx()), /غير مسموح/);
  s.tick(17 * 60_000);
  const ctx = engine.newCtx();
  engine.tick(s.game, s.now, ctx);
  assert.equal(s.game.ending, 'timeout');
  assert.ok(!s.game.result.won);
});

test('pausing freezes the clock and shifts it on resume', () => {
  const s = play();
  s.tick(10_000);
  const left = engine.remainingMs(s.game, s.now);
  engine.pause(s.game, s.now);
  s.tick(120_000);
  assert.equal(engine.remainingMs(s.game, s.now), left);
  assert.throws(() => engine.handleAction(s.game, 'explorer', 'cut', { index: 0 }, s.now, engine.newCtx()), /متوقفة/);
  engine.resume(s.game, s.now);
  assert.equal(engine.remainingMs(s.game, s.now), left);
});

test('echo fakes are delivered only to their target and can be flagged', () => {
  const s = play();
  const e = s.game.echoQueue[0];
  assert.ok(e, 'normal difficulty schedules an echo in stage 1');
  s.tick(e.at - s.now + 1);
  const ctx = engine.newCtx();
  engine.tick(s.game, s.now, ctx);
  const req = ctx.requests.find((r) => r.kind === 'fake');
  assert.ok(req);
  assert.ok(engine.injectFake(s.game, req.to, req.fallback.text, s.now, req.stageIndex));
  const target = engine.gameView(s.game, req.to, s.now);
  const victim = engine.other(req.to);
  const otherView = engine.gameView(s.game, victim, s.now);
  const fakeMsg = target.chat.find((m) => m.text === req.fallback.text);
  assert.equal(fakeMsg.from, 'partner');
  assert.ok(!('fake' in fakeMsg));
  assert.ok(!otherView.chat.some((m) => m.text === req.fallback.text));
  engine.flagMessage(s.game, req.to, fakeMsg.id, s.now, engine.newCtx());
  assert.equal(s.game.stats.correctFlags, 1);
  assert.throws(() => engine.flagMessage(s.game, victim, fakeMsg.id, s.now, engine.newCtx()));
});

test('core: two disagreements hand the ending to the Echo', () => {
  const s = play();
  while (s.game.stageIndex < 3) for (const step of solutionFor(s.game)) engine.handleAction(s.game, step.role, step.type, step.payload, s.now, engine.newCtx());
  const vote = (r, c) => engine.handleAction(s.game, r, 'vote', { choice: c }, s.now, engine.newCtx());
  vote('explorer', 'release');
  const view = engine.gameView(s.game, 'archivist', s.now);
  assert.equal(view.stage.partnerVoted, true);
  assert.equal(view.stage.myVote, null);
  assert.ok(!JSON.stringify(view.stage).includes(s.game.stage.code), 'archivist never sees the code');
  vote('archivist', 'shutdown');
  assert.equal(s.game.status, 'playing');
  vote('explorer', 'shutdown');
  vote('archivist', 'release');
  assert.equal(s.game.ending, 'echo_wins');
});

test('core: shutdown code typed by the archivist (Arabic digits accepted)', () => {
  const s = play();
  while (s.game.stageIndex < 3) for (const step of solutionFor(s.game)) engine.handleAction(s.game, step.role, step.type, step.payload, s.now, engine.newCtx());
  engine.handleAction(s.game, 'explorer', 'vote', { choice: 'shutdown' }, s.now, engine.newCtx());
  engine.handleAction(s.game, 'archivist', 'vote', { choice: 'shutdown' }, s.now, engine.newCtx());
  assert.throws(() => engine.handleAction(s.game, 'explorer', 'speak', { text: 'x' }, s.now, engine.newCtx()));
  const arabic = s.game.stage.code.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  engine.handleAction(s.game, 'archivist', 'enterCode', { text: arabic }, s.now, engine.newCtx());
  assert.equal(s.game.ending, 'shutdown');
});

test('hints unlock over time, max three per stage per role', () => {
  const s = play();
  const h1 = engine.requestHint(s.game, 'archivist', s.now);
  assert.equal(h1.tier, 1);
  assert.throws(() => engine.requestHint(s.game, 'archivist', s.now), /متاح بعد/);
  s.tick(61_000);
  engine.requestHint(s.game, 'archivist', s.now);
  s.tick(90_000);
  engine.requestHint(s.game, 'archivist', s.now);
  assert.throws(() => engine.requestHint(s.game, 'archivist', s.now), /استنفدت/);
  assert.equal(s.game.stats.hints, 3);
});
