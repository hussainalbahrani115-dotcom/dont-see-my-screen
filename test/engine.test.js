import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/game/rng.js';
import junction, { solve } from '../server/game/stages/junction.js';
import archive, { bfs } from '../server/game/stages/archive.js';
import broadcast, { POOL, WORDS3, WORDS4, computeAnswer, isValidWord } from '../server/game/stages/broadcast.js';
import * as engine from '../server/game/engine.js';
import { mimic } from '../server/ai/local.js';
import { solutionFor, stageId, pressureToggles } from './helpers.js';
import pressure from '../server/game/stages/pressure.js';
import chase from '../server/game/stages/chase.js';

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

// Plays the current stage to completion. The boiler is solved by actually
// simulating it with a simple valve controller, proving it is controllable.
function solveCurrent(s) {
  if (stageId(s.game) === 'pressure') {
    const idx = s.game.stageIndex;
    for (let i = 0; i < 2000 && s.game.stageIndex === idx && s.game.status === 'playing'; i++) {
      s.tick(500);
      for (const t of pressureToggles(s.game.stage)) engine.handleAction(s.game, t.role, t.type, t.payload, s.now, engine.newCtx());
      engine.tick(s.game, s.now, engine.newCtx());
    }
    return;
  }
  for (const step of solutionFor(s.game)) {
    s.tick(1500);
    engine.handleAction(s.game, step.role, step.type, step.payload, s.now, engine.newCtx());
  }
}

function advanceTo(s, id) {
  for (let guard = 0; stageId(s.game) !== id && s.game.status === 'playing' && guard < 10; guard++) solveCurrent(s);
}

test('full playthrough of all six stages reaches the release ending', () => {
  const s = play();
  const seen = [];
  for (let guard = 0; s.game.status === 'playing' && guard < 12; guard++) {
    seen.push(stageId(s.game));
    solveCurrent(s);
  }
  assert.deepEqual(seen, ['junction', 'archive', 'pressure', 'broadcast', 'chase', 'core']);
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
  s.tick(27 * 60_000);
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
  advanceTo(s, 'core');
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
  advanceTo(s, 'core');
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

test('pressure: generated boilers are valid and neglect bursts a valve', () => {
  for (let seed = 1; seed <= 200; seed++) {
    for (const level of [0, 1, 2]) pressure.validate(pressure.generate({ rng: createRng(seed * 3 + level), level, game: fakeGame }));
  }
  const s = play();
  advanceTo(s, 'pressure');
  const st = s.game.stage;
  const av = engine.gameView(s.game, 'archivist', s.now).stage;
  const ev = engine.gameView(s.game, 'explorer', s.now).stage;
  assert.ok('p' in av && !('p' in ev), 'only the archivist reads the gauge');
  assert.ok(ev.valves.every((v) => !('flow' in v)), 'valve effects are never sent to the explorer');
  const before = s.game.stats.mistakes;
  for (let i = 0; i < 200 && st.bursts === 0; i++) {
    s.tick(500);
    engine.tick(s.game, s.now, engine.newCtx());
  }
  assert.equal(st.bursts, 1, 'drift alone eventually bursts');
  assert.equal(s.game.stats.mistakes, before + 1);
});

test('chase: the Echo hunts along the walls and catching costs time', () => {
  const s = play();
  advanceTo(s, 'chase');
  const st = s.game.stage;
  assert.equal(s.game.deal, 'offered');
  const ev = engine.gameView(s.game, 'explorer', s.now).stage;
  assert.ok(!('echo' in ev) && !('fuses' in ev && Array.isArray(ev.fuses)), 'explorer never sees the map');
  const av = engine.gameView(s.game, 'archivist', s.now).stage;
  assert.equal(av.pos, st.pos);
  assert.equal(av.echo, st.echo);
  st.accuracy = 1;
  const deadline = s.game.deadline;
  for (let i = 0; i < 200 && st.catches === 0; i++) {
    s.tick(st.interval);
    engine.tick(s.game, s.now, engine.newCtx());
  }
  assert.equal(st.catches, 1, 'a perfectly accurate Echo catches a still explorer');
  assert.equal(st.pos, st.start);
  assert.ok(s.game.deadline <= deadline - 25_000);
  for (let seed = 1; seed <= 150; seed++) chase.validate(chase.generate({ rng: createRng(seed), level: seed % 3, game: fakeGame }));
});

test('hiding in a locker shakes the Echo off', () => {
  const s = play();
  advanceTo(s, 'chase');
  const st = s.game.stage;
  st.pos = st.lockers[0];
  engine.handleAction(s.game, 'explorer', 'hide', {}, s.now, engine.newCtx());
  st.accuracy = 1;
  for (let i = 0; i < 60; i++) {
    s.tick(st.interval);
    engine.tick(s.game, s.now, engine.newCtx());
  }
  assert.equal(st.catches, 0);
  assert.throws(() => engine.handleAction(s.game, 'explorer', 'hide', {}, s.now, engine.newCtx()) && (st.pos = st.start) && engine.handleAction(s.game, 'explorer', 'hide', {}, s.now, engine.newCtx()));
});

test("the Echo's deal: slower hunter now, betrayal revealed and scored later", () => {
  const s = play();
  advanceTo(s, 'chase');
  assert.throws(() => engine.answerDeal(s.game, 'explorer', true, s.now, engine.newCtx()));
  const archivistView = engine.gameView(s.game, 'archivist', s.now);
  assert.equal(archivistView.deal, 'offered');
  assert.equal(engine.gameView(s.game, 'explorer', s.now).deal, undefined, 'the explorer is not told');
  engine.answerDeal(s.game, 'archivist', true, s.now, engine.newCtx());
  assert.throws(() => engine.answerDeal(s.game, 'archivist', false, s.now, engine.newCtx()));
  advanceTo(s, 'core');
  assert.ok(s.game.stage.lines[0].includes('باعني صوته'), 'the core tells the explorer');
  solveCurrent(s);
  assert.equal(s.game.ending, 'release');
  assert.ok(s.game.result.breakdown.some((b) => b.label === 'صفقة مع الصدى' && b.value === -250));
  assert.ok(s.game.result.badges.some((b) => b.title === 'صوت للبيع'));
});

test('urgent ping reaches the partner with a cooldown', () => {
  const s = play();
  const ctx = engine.newCtx();
  engine.ping(s.game, 'explorer', s.now, ctx);
  assert.deepEqual(ctx.fx, [{ to: 'archivist', type: 'ping', data: {} }]);
  assert.throws(() => engine.ping(s.game, 'explorer', s.now + 1000, engine.newCtx()), /انتظر/);
  s.tick(7000);
  engine.ping(s.game, 'explorer', s.now, engine.newCtx());
});

test('every stage has an interlude card or none, and badges are computed', () => {
  const s = play();
  for (let guard = 0; s.game.status === 'playing' && guard < 12; guard++) {
    const v = engine.gameView(s.game, 'explorer', s.now);
    if (v.stageId !== 'junction') assert.ok(v.interlude.lines.length >= 2, v.stageId);
    solveCurrent(s);
  }
  assert.ok(Array.isArray(s.game.result.badges));
});
