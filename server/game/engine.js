// Authoritative game engine. Pure functions over a plain JSON game object so
// the whole state can be persisted and restored. Side effects (socket
// effects, async AI work) are collected into `ctx` for the room layer.

import { createRng, hashString } from './rng.js';
import { STAGES } from './stages/index.js';
import * as story from './story.js';
import { cleanText, ROLE_NAMES } from './text.js';

export class GameError extends Error {
  constructor(message, code = 'game') {
    super(message);
    this.code = code;
  }
}

export const ROLES = ['explorer', 'archivist'];
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const other = (role) => (role === 'explorer' ? 'archivist' : 'explorer');

const LEVEL = { easy: 0, normal: 1, hard: 2 };
const DURATION_MS = { easy: 42 * 60_000, normal: 34 * 60_000, hard: 26 * 60_000 };
const MULTIPLIER = { easy: 0.8, normal: 1, hard: 1.3 };
// Echo impersonation attempts per stage, by base difficulty.
const FAKES = { easy: [0, 1, 0, 0, 1, 1], normal: [1, 1, 1, 1, 1, 1], hard: [1, 2, 1, 1, 2, 1] };
const PING_COOLDOWN_MS = 6000;
const DEAL_PENALTY = 250;
const HINT_UNLOCK_MS = [0, 60_000, 150_000];
const MAX_CHAT = 250;

export function newCtx() {
  return { fx: [], requests: [] };
}

export function createGame({ seed, difficulty, names, now, ctx = newCtx() }) {
  if (!DIFFICULTIES.includes(difficulty)) throw new GameError('مستوى صعوبة غير معروف');
  const rng = createRng(seed);
  const game = {
    id: `g${seed.toString(36)}${now.toString(36)}`,
    seed,
    difficulty,
    adapt: 0,
    startedAt: now,
    deadline: now + DURATION_MS[difficulty],
    pausedAt: null,
    pausedTotal: 0,
    stageIndex: 0,
    stage: null,
    stageStartedAt: now,
    stageMistakes: 0,
    stageLog: [],
    status: 'playing',
    ending: null,
    result: null,
    names,
    stats: { mistakes: 0, hints: 0, correctFlags: 0, wrongFlags: 0, penaltySec: 0, caught: 0 },
    // «صفقة الصدى»: offered privately to the archivist during the chase.
    deal: null,
    lastPing: { explorer: 0, archivist: 0 },
    fragments: { f1: false, f2: false, f3: false },
    inventory: [],
    phrase: [rng.pick(story.PHRASE_A), rng.pick(story.PHRASE_B)],
    docs: story.initialDocs(),
    logs: { explorer: [], archivist: [] },
    chat: [],
    hints: { explorer: [], archivist: [] },
    echoQueue: [],
    seq: 1,
    ai: null,
  };
  system(game, now, story.ECHO_WARNING);
  enterStage(game, 0, now, ctx);
  return game;
}

function effectiveLevel(game, index) {
  const base = LEVEL[game.difficulty];
  return Math.max(0, Math.min(2, base + (index === 0 ? 0 : game.adapt)));
}

function pushLog(game, role, text, now) {
  const list = game.logs[role];
  list.push({ at: now, text });
  if (list.length > 80) list.splice(0, list.length - 80);
}

function system(game, now, text) {
  game.chat.push({ id: game.seq++, from: 'system', text, at: now });
  trimChat(game);
}

function trimChat(game) {
  if (game.chat.length <= MAX_CHAT) return;
  // Never drop echo messages: they are revealed on the results screen.
  const excess = game.chat.length - MAX_CHAT;
  let dropped = 0;
  game.chat = game.chat.filter((m) => (dropped < excess && !m.fake ? (dropped++, false) : true));
}

function makeApi(game, now, ctx, role = null) {
  const api = {
    now,
    game,
    role,
    error: (msg) => new GameError(msg),
    fx: (to, type, data = {}) => ctx.fx.push({ to, type, data }),
    log: (r, text) => pushLog(game, r, text, now),
    system: (text) => system(game, now, text),
    penalize(sec, reason) {
      game.deadline -= sec * 1000;
      game.stats.mistakes++;
      game.stats.penaltySec += sec;
      game.stageMistakes++;
      system(game, now, `⚠ ${reason} (−${sec} ثانية)`);
      api.fx('both', 'penalty', { sec, reason });
      if (game.deadline <= now) endGame(game, 'timeout', now, ctx);
    },
    complete: () => completeStage(game, now, ctx),
    fragment: (id) => foundFragment(game, id, now, ctx),
    item(id, name, desc) {
      if (!game.inventory.some((i) => i.id === id)) game.inventory.push({ id, name, desc });
    },
    end: (ending) => endGame(game, ending, now, ctx),
    stat(key, inc = 1) {
      game.stats[key] = (game.stats[key] || 0) + inc;
    },
  };
  return api;
}

function generateStage(game, index) {
  const mod = STAGES[index];
  const level = effectiveLevel(game, index);
  let lastError;
  for (let attempt = 0; attempt < 15; attempt++) {
    const rng = createRng(hashString(`${game.seed}:${mod.id}:${attempt}`));
    try {
      const st = mod.generate({ rng, level, game });
      st.level = level;
      mod.validate(st, game);
      return st;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

function enterStage(game, index, now, ctx) {
  const mod = STAGES[index];
  game.stageIndex = index;
  game.stage = generateStage(game, index);
  game.stageStartedAt = now;
  game.stageMistakes = 0;
  planEcho(game, index, now);
  mod.onStart?.(game.stage, makeApi(game, now, ctx));
  for (const role of ROLES) pushLog(game, role, story.STAGE_ENTRY[mod.id][role], now);
  ctx.fx.push({ to: 'both', type: 'stage', data: { index, title: mod.title } });
}

function planEcho(game, index, now) {
  const rng = createRng(hashString(`${game.seed}:echo:${index}`));
  let count = FAKES[game.difficulty][index] ?? 0;
  if (index > 0 && game.adapt > 0) count = Math.min(2, count + 1);
  if (index > 0 && game.adapt < 0) count = Math.max(0, count - 1);
  let at = now;
  for (let i = 0; i < count; i++) {
    at += rng.int(35_000, 80_000);
    game.echoQueue.push({ at, to: rng.pick(ROLES), stageIndex: index, done: false });
  }
}

function completeStage(game, now, ctx) {
  const mod = STAGES[game.stageIndex];
  const ms = now - game.stageStartedAt;
  const hints = ROLES.reduce((n, r) => n + game.hints[r].filter((h) => h.stage === mod.id).length, 0);
  game.stageLog.push({ id: mod.id, ms, mistakes: game.stageMistakes, hints });

  // Adaptive difficulty: fast and clean pushes the next stage harder,
  // slow or error-prone eases it.
  const ratio = ms / (mod.targetSec * 1000);
  const before = game.adapt;
  if (ratio < 0.6 && game.stageMistakes === 0 && hints === 0) game.adapt = Math.min(1, game.adapt + 1);
  else if (ratio > 1.4 || game.stageMistakes >= 3) game.adapt = Math.max(-1, game.adapt - 1);
  if (game.adapt > before) system(game, now, '📡 المحطة رصدت سرعتكما… الإشارة القادمة أكثر تعقيدًا.');
  if (game.adapt < before) system(game, now, '📡 الإشارة تهدأ قليلًا. التقطا أنفاسكما.');

  ctx.fx.push({ to: 'both', type: 'stageComplete', data: { title: mod.title } });
  game.echoQueue = game.echoQueue.filter((e) => e.stageIndex > game.stageIndex);
  if (game.stageIndex + 1 < STAGES.length) enterStage(game, game.stageIndex + 1, now, ctx);
}

function foundFragment(game, id, now, ctx) {
  if (game.fragments[id]) return;
  game.fragments[id] = true;
  const doc = story.fragmentDoc(id, game);
  game.docs.push({ ...doc, isNew: true });
  const item = story.FRAGMENT_ITEMS[id];
  game.inventory.push({ id, ...item });
  pushLog(game, 'explorer', `التقطت: ${item.name}. ${item.desc}`, now);
  pushLog(game, 'archivist', `وصلتك وثيقة جديدة من شريكك: «${doc.title}».`, now);
  ctx.fx.push({ to: 'archivist', type: 'doc', data: { title: doc.title } });
  ctx.fx.push({ to: 'explorer', type: 'item', data: { name: item.name } });
}

export function endGame(game, ending, now, ctx) {
  if (game.status !== 'playing') return;
  game.status = 'ended';
  game.ending = ending;
  game.endedAt = now;
  game.result = computeResult(game, ending, now);
  ctx.fx.push({ to: 'both', type: 'ended', data: { ending } });
  ctx.requests.push({ kind: 'epilogue' });
}

// Developer shortcut (DEV_START_STAGE env only): jump a fresh game to a stage.
export function debugSkipTo(game, id, now, ctx) {
  const index = STAGES.findIndex((s) => s.id === id);
  if (index > 0) enterStage(game, index, now, ctx);
}

export function remainingMs(game, now) {
  if (game.status !== 'playing') return Math.max(0, game.deadline - (game.endedAt ?? now));
  return Math.max(0, game.deadline - (game.pausedAt ?? now));
}

export function computeResult(game, ending, now) {
  const remainingSec = Math.floor(Math.max(0, game.deadline - now) / 1000);
  const won = ending === 'release' || ending === 'shutdown';
  const fakes = game.chat.filter((m) => m.fake);
  const fooled = fakes.filter((m) => !m.flagResult).length;
  const frags = Object.values(game.fragments).filter(Boolean).length;
  const s = game.stats;
  const breakdown = [
    { label: 'النهاية', value: { release: 1500, shutdown: 1000, echo_wins: 250, timeout: 0 }[ending] },
    { label: 'الوقت المتبقي', value: won ? remainingSec * 2 : 0 },
    { label: 'أوراق سلمى', value: frags * 150 },
    { label: 'رسائل دخيلة كُشفت', value: s.correctFlags * 100 },
    { label: 'اتهام رسائل حقيقية', value: -s.wrongFlags * 50 },
    { label: 'خُدعتما بالصدى', value: -fooled * 75 },
    { label: 'الأخطاء', value: -s.mistakes * 40 },
    { label: 'التلميحات', value: -s.hints * 60 },
    { label: 'صفقة مع الصدى', value: game.deal === 'accepted' ? -DEAL_PENALTY : 0 },
  ];
  const raw = breakdown.reduce((sum, b) => sum + b.value, 0);
  const score = Math.max(0, Math.round(raw * MULTIPLIER[game.difficulty]));
  let grade = score >= 2600 ? 'S' : score >= 2000 ? 'A' : score >= 1400 ? 'B' : score >= 900 ? 'C' : 'D';
  if (!won) grade = score >= 500 ? 'D' : 'F';
  return {
    ending,
    won,
    score,
    grade,
    multiplier: MULTIPLIER[game.difficulty],
    breakdown,
    durationMs: now - game.startedAt - game.pausedTotal,
    remainingSec,
    fragments: frags,
    stages: game.stageLog,
    fakes: fakes.map((m) => ({ to: m.to, text: m.text, caught: m.flagResult === 'echo' })),
    deal: game.deal,
    badges: computeBadges(game, { won, fakes, fooled, frags, remainingSec }),
    epilogue: null,
  };
}

function computeBadges(game, { won, fakes, fooled, frags, remainingSec }) {
  const s = game.stats;
  const total = DURATION_MS[game.difficulty] / 1000;
  const reachedChase = game.stageLog.some((x) => x.id === 'chase');
  const list = [
    won && s.mistakes === 0 && ['ok', '🎯', 'يد ثابتة', 'أنهيتما المهمة بلا أي خطأ'],
    fakes.length > 0 && fooled === 0 && ['ok', '🦻', 'أذن لا تُخدع', 'كشفتما كل محاولات الصدى'],
    s.wrongFlags >= 2 && ['dark', '🌀', 'الشك القاتل', 'اتهمتما بعضكما أكثر من مرة'],
    frags === 3 && ['ok', '📜', 'حارسا الذاكرة', 'جمعتما كل أوراق سلمى'],
    won && remainingSec / total > 0.4 && ['ok', '⚡', 'أسرع من الإشارة', 'بقي أكثر من 40% من الوقت'],
    reachedChase && s.caught === 0 && ['ok', '👻', 'شبح الممرات', 'لم يمسك بكما الصدى في المطاردة'],
    won && s.hints === 0 && ['ok', '🧠', 'بلا مساعدة', 'لم تطلبا أي تلميح'],
    game.deal === 'accepted' && ['dark', '🤝', 'صوت للبيع', 'عقدتما صفقة مع الصدى'],
    game.deal === 'declined' && ['ok', '🛡', 'لا للصفقة', 'رفضتما عرض الصدى'],
  ];
  return list.filter(Boolean).map(([tone, icon, title, desc]) => ({ tone, icon, title, desc }));
}

// ---------------------------------------------------------------- actions

export function handleAction(game, role, type, payload, now, ctx) {
  assertPlaying(game);
  const mod = STAGES[game.stageIndex];
  const own = mod.actions?.[role] ?? {};
  const both = mod.actions?.both ?? {};
  const fn = typeof type !== 'string' ? null : Object.hasOwn(own, type) ? own[type] : Object.hasOwn(both, type) ? both[type] : null;
  if (!fn) throw new GameError('إجراء غير مسموح في هذه المرحلة');
  const p = payload && typeof payload === 'object' ? payload : {};
  return fn(game.stage, p, makeApi(game, now, ctx, role)) || {};
}

function assertPlaying(game) {
  if (game.status !== 'playing') throw new GameError('الجولة انتهت');
  if (game.pausedAt) throw new GameError('اللعبة متوقفة مؤقتًا بانتظار عودة شريكك');
}

export function sendChat(game, role, rawText, now) {
  const text = cleanText(rawText, 280);
  if (!text) throw new GameError('الرسالة فارغة');
  if (game.status === 'ended') throw new GameError('الجولة انتهت');
  game.chat.push({ id: game.seq++, from: role, text, at: now });
  trimChat(game);
}

export function injectFake(game, to, text, now, stageIndex) {
  if (game.status !== 'playing' || game.stageIndex !== stageIndex) return false;
  game.chat.push({ id: game.seq++, from: other(to), to, text: cleanText(text, 200), at: now, fake: true, flagResult: null });
  trimChat(game);
  return true;
}

export function flagMessage(game, role, id, now, ctx) {
  if (game.status !== 'playing') throw new GameError('الجولة انتهت');
  const msg = game.chat.find((m) => m.id === id);
  if (!msg || msg.from !== other(role) || (msg.fake && msg.to !== role)) throw new GameError('لا يمكنك التبليغ عن هذه الرسالة');
  if (msg.flagResult) throw new GameError('تم التبليغ عنها مسبقًا');
  if (msg.fake) {
    msg.flagResult = 'echo';
    game.stats.correctFlags++;
    system(game, now, `🚩 ${ROLE_NAMES[role]} كشف رسالة دخيلة انتحلت صوت ${ROLE_NAMES[other(role)]}: «${msg.text}»`);
    ctx.fx.push({ to: 'both', type: 'echoCaught', data: {} });
  } else {
    msg.flagResult = 'real';
    game.stats.wrongFlags++;
    system(game, now, `🚩 ${ROLE_NAMES[role]} شكّ في رسالة حقيقية من ${ROLE_NAMES[other(role)]}. الثقة تهتز…`);
    ctx.fx.push({ to: 'both', type: 'falseFlag', data: {} });
  }
}

// The Echo's private bargain with the archivist (see stages/chase.js).
export function answerDeal(game, role, accept, now, ctx) {
  assertPlaying(game);
  if (role !== 'archivist' || game.deal !== 'offered') throw new GameError('لا يوجد عرض بانتظار ردك');
  game.deal = accept ? 'accepted' : 'declined';
  pushLog(game, 'archivist', accept ? 'قبلت صفقة الصدى. لن يعرف شريكك… إلا إن أخبرته.' : 'رفضت صفقة الصدى. سمعت ضحكة قصيرة ثم صمت.', now);
  ctx.fx.push({ to: 'archivist', type: accept ? 'echoLaugh' : 'echoCaught', data: {} });
}

export function ping(game, role, now, ctx) {
  assertPlaying(game);
  if (now - game.lastPing[role] < PING_COOLDOWN_MS) throw new GameError('انتظر قليلًا قبل النداء التالي');
  game.lastPing[role] = now;
  ctx.fx.push({ to: other(role), type: 'ping', data: {} });
}

export function requestHint(game, role, now) {
  assertPlaying(game);
  const mod = STAGES[game.stageIndex];
  const given = game.hints[role].filter((h) => h.stage === mod.id).length;
  if (given >= 3) throw new GameError('استنفدت تلميحات هذه المرحلة');
  const wait = nextHintAt(game, role) - now;
  if (wait > 0) throw new GameError(`التلميح التالي متاح بعد ${Math.ceil(wait / 1000)} ثانية`);
  const tier = given + 1;
  const text = mod.hint(game.stage, role, tier, game);
  const hint = { id: game.seq++, stage: mod.id, tier, text, at: now };
  game.hints[role].push(hint);
  game.stats.hints++;
  return hint;
}

// Later hints unlock with time on the stage; mistakes unlock them sooner.
function nextHintAt(game, role) {
  const mod = STAGES[game.stageIndex];
  const given = game.hints[role].filter((h) => h.stage === mod.id).length;
  if (given >= 3) return null;
  return game.stageStartedAt + HINT_UNLOCK_MS[given] - game.stageMistakes * 30_000;
}

export function tick(game, now, ctx) {
  if (game.status !== 'playing' || game.pausedAt) return false;
  if (now >= game.deadline) {
    endGame(game, 'timeout', now, ctx);
    return true;
  }
  let changed = false;
  for (const e of game.echoQueue) {
    if (e.done || e.stageIndex !== game.stageIndex || now < e.at) continue;
    e.done = true;
    const mod = STAGES[game.stageIndex];
    const fake = mod.fakeFor(game.stage, e.to, createRng(hashString(`${game.seed}:fake:${e.at}`)), game);
    const partnerMessages = game.chat.filter((m) => m.from === other(e.to) && !m.fake).slice(-8).map((m) => m.text);
    ctx.requests.push({ kind: 'fake', to: e.to, stageIndex: game.stageIndex, fallback: fake, partnerMessages });
    changed = true;
  }
  const mod = STAGES[game.stageIndex];
  if (mod.tick && mod.tick(game.stage, makeApi(game, now, ctx))) changed = true;
  return changed;
}

export function pause(game, now) {
  if (game.status !== 'playing' || game.pausedAt) return false;
  game.pausedAt = now;
  return true;
}

export function resume(game, now) {
  if (!game.pausedAt) return false;
  const d = now - game.pausedAt;
  game.deadline += d;
  game.stageStartedAt += d;
  for (const e of game.echoQueue) e.at += d;
  STAGES[game.stageIndex].shift?.(game.stage, d);
  game.pausedTotal += d;
  game.pausedAt = null;
  return true;
}

// ---------------------------------------------------------------- views

function chatView(game, role) {
  return game.chat
    .filter((m) => !m.fake || m.to === role)
    .slice(-120)
    .map((m) => ({
      id: m.id,
      from: m.from === 'system' ? 'system' : m.from === role ? 'me' : 'partner',
      text: m.text,
      at: m.at,
      // A message's origin is only disclosed once it has been flagged.
      flag: m.flagResult ?? null,
      canFlag: m.from === other(role) && !m.flagResult && game.status === 'playing',
    }));
}

export function gameView(game, role, now) {
  const mod = STAGES[game.stageIndex];
  const playing = game.status === 'playing';
  const hintsHere = game.hints[role].filter((h) => h.stage === mod.id);
  const next = playing ? nextHintAt(game, role) : null;
  return {
    id: game.id,
    status: game.status,
    difficulty: game.difficulty,
    stageIndex: game.stageIndex,
    stageId: mod.id,
    stageTitle: mod.title,
    stageTitles: STAGES.map((s) => s.title),
    remainingMs: remainingMs(game, now),
    paused: !!game.pausedAt,
    names: game.names,
    intro: story.intro(role, game),
    interlude: story.INTERLUDES[mod.id]?.(role, game) ?? null,
    deal: role === 'archivist' ? game.deal : undefined,
    stage: playing ? mod[`${role}View`](game.stage, game) : null,
    logs: game.logs[role].slice(-60),
    docs: role === 'archivist' ? game.docs.map(({ isNew, ...d }) => d) : undefined,
    inventory: role === 'explorer' ? game.inventory : undefined,
    chat: chatView(game, role),
    hints: hintsHere.map((h) => ({ tier: h.tier, text: h.text })),
    hintsLeft: 3 - hintsHere.length,
    nextHintInMs: next == null ? null : Math.max(0, next - (game.pausedAt ?? now)),
    fragmentsFound: Object.values(game.fragments).filter(Boolean).length,
    stats: { mistakes: game.stats.mistakes, hints: game.stats.hints },
    result: game.result,
    ending: game.ending ? { key: game.ending, ...story.ENDINGS[game.ending] } : null,
  };
}
