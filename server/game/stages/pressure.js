// Stage — غرفة الضغط (real time).
// The boiler's pressure drifts upward and surges without warning. The
// explorer holds the valves but has no gauge; the archivist reads the live
// gauge and a valve chart keyed by colour + handle shape, but cannot touch
// anything. Keep the needle inside the safe band long enough to charge the
// transmitter. Leaving the band too long bursts a valve or stalls the pump.

const COLORS = ['red', 'blue', 'yellow', 'green'];
const COLOR_NAME = { red: 'الأحمر', blue: 'الأزرق', yellow: 'الأصفر', green: 'الأخضر' };
const HANDLES = ['round', 'lever', 'star', 'wheel'];
const HANDLE_NAME = { round: 'المقبض الدائري', lever: 'مقبض الذراع', star: 'المقبض النجمي', wheel: 'العجلة' };
const FLOWS = [
  [-3, -1.5, 2],
  [-3, -1.5, 2, 1],
  [-3.5, -1.5, 2.5, 1],
];
const TOLERANCE_S = 6;
const START_DELAY_MS = 10_000;
// A burst or stall costs this share of the charge already built.
const SETBACK = 0.3;

export const valveName = (v) => `${HANDLE_NAME[v.handle]} ${COLOR_NAME[v.color]}`;

function effectText(f) {
  if (f <= -3) return 'يخفض الضغط بسرعة كبيرة';
  if (f < 0) return 'يخفض الضغط ببطء';
  if (f >= 2) return 'يرفع الضغط بقوة';
  return 'يرفع الضغط قليلًا';
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// Push one state per second during the warm-up so the countdown moves.
export function countdownTick(st, now) {
  const sec = Math.ceil((st.startAt - now) / 1000);
  if (sec === st.cd) return false;
  st.cd = sec;
  return true;
}

export default {
  id: 'pressure',
  title: 'غرفة الضغط',
  targetSec: 200,
  realtime: true,

  generate({ rng, level }) {
    const flows = rng.shuffle(FLOWS[level]);
    // Colours repeat across valves on purpose: only colour + handle identifies one.
    const combos = rng.shuffle(COLORS.slice(0, 2 + Math.min(level, 1)).flatMap((c) => HANDLES.map((h) => [c, h])));
    const valves = flows.map((flow, i) => ({ color: combos[i][0], handle: combos[i][1], flow, open: false }));
    const decoys = combos.slice(valves.length, valves.length + 3).map(([color, handle]) => ({ color, handle, flow: rng.pick([-3, -1.5, 1, 2]) }));
    const width = [20, 16, 12][level];
    const lo = rng.int(30, 58);
    return {
      valves,
      manual: rng.shuffle([...valves, ...decoys].map((v) => ({ color: v.color, handle: v.handle, effect: effectText(v.flow) }))),
      lo,
      hi: lo + width,
      // Starts over-pressured: the team must act from the first second.
      p: lo + width + 3,
      goal: [25, 32, 40][level],
      progress: 0,
      drift: [0.8, 1, 1.3][level],
      surge: [6, 8, 10][level],
      outSince: null,
      startAt: 0,
      lastTick: 0,
      nextSurge: 0,
      nextDrift: 0,
      hist: [],
      bursts: 0,
    };
  },

  validate(st) {
    const down = st.valves.filter((v) => v.flow < 0).map((v) => v.flow);
    // Solvable: some valve set must overpower the worst drift.
    if (Math.min(...down) > -(st.drift + 0.6)) throw new Error('no valve strong enough');
    const keys = st.valves.map((v) => `${v.color}:${v.handle}`);
    if (new Set(keys).size !== keys.length) throw new Error('duplicate valves');
  },

  onStart(st, api) {
    st.startAt = api.now + START_DELAY_MS;
    st.lastTick = st.startAt;
    st.nextSurge = st.startAt + 15_000 + Math.random() * 8000;
    st.nextDrift = st.startAt + 22_000;
  },

  shift(st, ms) {
    for (const k of ['startAt', 'lastTick', 'nextSurge', 'nextDrift']) st[k] += ms;
    if (st.outSince) st.outSince += ms;
  },

  tick(st, api) {
    const now = api.now;
    if (now < st.startAt) return countdownTick(st, now);
    const dt = clamp((now - st.lastTick) / 1000, 0, 2);
    st.lastTick = now;
    if (!dt) return false;

    if (now >= st.nextDrift) {
      st.drift = clamp(st.drift + (Math.random() - 0.5), 0.5, 1.8);
      st.nextDrift = now + 20_000 + Math.random() * 10_000;
      api.fx('both', 'rumble', {});
    }
    if (now >= st.nextSurge) {
      st.p += st.surge;
      st.nextSurge = now + 18_000 + Math.random() * 10_000;
      api.fx('both', 'surge', {});
    }
    const flow = st.valves.reduce((s, v) => s + (v.open ? v.flow : 0), 0);
    st.p = clamp(st.p + (st.drift + flow + (Math.random() - 0.5) * 0.6) * dt, 0, 100);
    st.hist.push(Math.round(st.p * 10) / 10);
    if (st.hist.length > 60) st.hist.shift();

    const inBand = st.p >= st.lo && st.p <= st.hi;
    if (inBand) {
      st.outSince = null;
      st.progress = Math.min(st.goal, st.progress + dt);
      if (st.progress >= st.goal) {
        api.log('explorer', 'سكن المرجل وأضاءت لمبة «المرسل مشحون». الطريق إلى الاستوديو مفتوح.');
        api.log('archivist', 'استقر الضغط حتى اكتمل الشحن. المرسل جاهز.');
        api.complete();
      }
      return true;
    }
    st.outSince ??= now;
    if (now - st.outSince >= TOLERANCE_S * 1000) {
      const high = st.p > st.hi;
      st.bursts++;
      st.p = high ? st.hi + 3 : st.lo - 3;
      st.progress = Math.max(0, st.progress * (1 - SETBACK));
      st.outSince = null;
      st.valves.forEach((v) => (v.open = false));
      api.fx('both', high ? 'burst' : 'stall', {});
      api.penalize(15, high ? 'انفجر صمام أمان! ضاع جزء من الشحن وأُغلقت كل الصمامات' : 'توقفت المضخة! ضاع جزء من الشحن وأُغلقت كل الصمامات');
    }
    return true;
  },

  explorerView(st, game) {
    const mid = (st.lo + st.hi) / 2;
    const rumble = st.p > st.hi + 4 ? 3 : st.p > mid ? 2 : st.p > st.lo - 6 ? 1 : 0;
    return {
      valves: st.valves.map((v) => ({ color: v.color, handle: v.handle, open: v.open })),
      rumble,
      progress: Math.floor(st.progress),
      goal: st.goal,
      startsInMs: Math.max(0, st.startAt - (game.pausedAt ?? Date.now())),
    };
  },

  archivistView(st, game) {
    const out = st.outSince ? Math.max(0, ((game.pausedAt ?? Date.now()) - st.outSince) / 1000) : 0;
    return {
      p: Math.round(st.p * 10) / 10,
      lo: st.lo,
      hi: st.hi,
      progress: Math.floor(st.progress),
      goal: st.goal,
      hist: st.hist,
      out: st.outSince ? { side: st.p > st.hi ? 'high' : 'low', sec: Math.floor(out), limit: TOLERANCE_S } : null,
      manual: st.manual.map((m) => ({ ...m, name: valveName(m) })),
      startsInMs: Math.max(0, st.startAt - (game.pausedAt ?? Date.now())),
    };
  },

  actions: {
    explorer: {
      toggle(st, { index }, api) {
        if (!Number.isInteger(index) || !st.valves[index]) throw api.error('صمام غير موجود');
        st.valves[index].open = !st.valves[index].open;
        return { open: st.valves[index].open };
      },
    },
  },

  hint(st, role, tier) {
    const strong = st.valves.find((v) => v.flow === Math.min(...st.valves.map((x) => x.flow)));
    if (role === 'explorer') {
      return [
        'صِف لشريكك كل صمام: لونه وشكل مقبضه. الألوان تتكرر — المقبض هو ما يميزها.',
        'الضغط يرتفع وحده باستمرار. نفّذ أوامر شريكك فورًا: «افتح» و«أغلق» أسرع من أي شرح.',
        `أقوى صمام لخفض الضغط عندك هو ${valveName(strong)}.`,
      ][tier - 1];
    }
    return [
      'اطابق صمامات شريكك مع جدول الصمامات أولًا، ثم أعطه أوامر قصيرة: «افتح الأزرق النجمي»، «أغلقه».',
      'لا تنتظر الخروج من المنطقة الآمنة: عندما تقترب الإبرة من الحد الأعلى ابدأ بالخفض. الهزّات المفاجئة ترفع الضغط فجأة.',
      `المنطقة الآمنة ${st.lo}–${st.hi}. صمام بطيء الخفض مفتوحًا باستمرار يقارب التوازن غالبًا.`,
    ][tier - 1];
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') return { text: 'الإبرة تنهار! افتح كل الصمامات الآن بسرعة', keys: ['كل الصمامات'] };
    const v = rng.pick(st.valves);
    const name = valveName(v);
    return { text: `${v.open ? 'أغلقت' : 'فتحت'} ${name}`, keys: [name] };
  },
};
