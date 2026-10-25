// Stage 2 — الأرشيف المظلم.
// The explorer walks a dark maze and only perceives the current cell: open
// passages and a sensory landmark. The archivist holds the full floor plan
// (walls, landmarks, collapsed floors, the vault) but not the explorer's
// position — they must localise the explorer from descriptions, then guide.

import { DIR_NAMES } from '../text.js';

const DELTA = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

export const LANDMARKS = {
  clock: { map: 'ساعة الحائط', sense: 'تكتكة منتظمة فوق رأسك: ساعة حائط ما زالت تعمل رغم كل شيء.', short: 'تحت ساعة حائط شغالة' },
  puddle: { map: 'تسرّب مياه', sense: 'قدماك في بركة ماء باردة، والسقف يقطر فوقك.', short: 'واقف في بركة ماء' },
  cabinet: { map: 'خزائن مقلوبة', sense: 'خزانة ملفات معدنية ملقاة على جانبها، أدراجها مفتوحة.', short: 'جنب خزانة ملفات مقلوبة' },
  reels: { map: 'مخزن الأشرطة', sense: 'أشرطة مغناطيسية متشابكة على الأرض كأنها أعشاب بحرية.', short: 'عند أشرطة متشابكة على الأرض' },
  fan: { map: 'فتحة تهوية', sense: 'هواء بارد يهبّ من الأعلى، وصوت مروحة تدور ببطء.', short: 'تحت مروحة تهوية' },
  phone: { map: 'الهاتف الداخلي', sense: 'هاتف أسود معلّق على الجدار… سمّاعته تتأرجح وحدها.', short: 'عند هاتف معلّق على الجدار' },
  portrait: { map: 'صورة الطاقم', sense: 'صورة جماعية مؤطّرة؛ الوجوه كلها مخدوشة إلا وجهًا واحدًا.', short: 'قدام صورة جماعية مخدوشة' },
  piano: { map: 'غرفة التدريب', sense: 'بيانو قديم مغطى بقماش، أحد مفاتيحه ينزل وحده.', short: 'جنب بيانو قديم' },
  fuel: { map: 'المولّد الاحتياطي', sense: 'رائحة وقود قوية، وبقعة زيت تلمع تحت الضوء.', short: 'في مكان ريحته وقود' },
  radio: { map: 'جهاز الاستقبال', sense: 'راديو صغير على رف يهمس بتشويش متقطع.', short: 'عند راديو صغير يوشوش' },
};

const key = (r, c) => `${r},${c}`;
const parse = (k) => k.split(',').map(Number);

function neighbors(walls, k) {
  const [r, c] = parse(k);
  const out = [];
  for (const d of ['n', 'e', 's', 'w']) {
    if (walls[r][c][d]) continue;
    out.push({ d, k: key(r + DELTA[d][0], c + DELTA[d][1]) });
  }
  return out;
}

export function bfs(walls, from, blocked = new Set()) {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const { k } of neighbors(walls, cur)) {
      if (dist.has(k) || blocked.has(k)) continue;
      dist.set(k, dist.get(cur) + 1);
      queue.push(k);
    }
  }
  return dist;
}

function carve(walls, r, c, d) {
  const [dr, dc] = DELTA[d];
  walls[r][c][d] = false;
  walls[r + dr][c + dc][OPP[d]] = false;
}

function makeMaze(rng, size) {
  const walls = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ n: true, e: true, s: true, w: true })));
  const seen = new Set();
  const stack = [[rng.int(0, size - 1), rng.int(0, size - 1)]];
  seen.add(key(...stack[0]));
  while (stack.length) {
    const [r, c] = stack.at(-1);
    const options = rng.shuffle(['n', 'e', 's', 'w']).filter((d) => {
      const nr = r + DELTA[d][0];
      const nc = c + DELTA[d][1];
      return nr >= 0 && nc >= 0 && nr < size && nc < size && !seen.has(key(nr, nc));
    });
    if (!options.length) { stack.pop(); continue; }
    const d = options[0];
    carve(walls, r, c, d);
    const next = [r + DELTA[d][0], c + DELTA[d][1]];
    seen.add(key(...next));
    stack.push(next);
  }
  // A few loops so there is more than one route around collapsed floors.
  let loops = size - 1;
  for (let guard = 0; loops > 0 && guard < 200; guard++) {
    const r = rng.int(0, size - 1);
    const c = rng.int(0, size - 1);
    const d = rng.pick(['e', 's']);
    if ((d === 'e' && c === size - 1) || (d === 's' && r === size - 1) || !walls[r][c][d]) continue;
    carve(walls, r, c, d);
    loops--;
  }
  return walls;
}

export default {
  id: 'archive',
  title: 'الأرشيف المظلم',
  targetSec: 300,

  generate({ rng, level }) {
    const size = level >= 2 ? 6 : 5;
    const walls = makeMaze(rng, size);
    const cells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push(key(r, c));

    const exit = rng.pick(cells);
    const fromExit = bfs(walls, exit);
    const far = cells.filter((k) => fromExit.get(k) >= size + 1);
    const start = rng.pick(far.length ? far : cells.filter((k) => k !== exit));

    const lmIds = rng.shuffle(Object.keys(LANDMARKS)).slice(0, size + 2);
    const lmCells = rng.shuffle(cells.filter((k) => k !== exit)).slice(0, lmIds.length);
    const landmarks = Object.fromEntries(lmCells.map((k, i) => [k, lmIds[i]]));

    const fragment = rng.pick(cells.filter((k) => k !== exit && k !== start));

    const hazardCount = [1, 2, 3][level];
    const hazards = [];
    for (const k of rng.shuffle(cells)) {
      if (hazards.length >= hazardCount) break;
      if ([start, exit, fragment].includes(k)) continue;
      const blocked = new Set([...hazards, k]);
      const reach = bfs(walls, start, blocked);
      if (reach.has(exit) && reach.has(fragment)) hazards.push(k);
    }

    return { size, walls, start, exit, fragment, landmarks, hazards, pos: start, fragmentTaken: false, moves: 0, falls: 0, bump: null, nextBlackout: 0 };
  },

  validate(st) {
    const reach = bfs(st.walls, st.start, new Set(st.hazards));
    if (!reach.has(st.exit)) throw new Error('exit unreachable');
    if (!reach.has(st.fragment)) throw new Error('fragment unreachable');
    if (st.hazards.includes(st.start) || st.hazards.includes(st.exit)) throw new Error('hazard on start/exit');
  },

  onStart(st, api) {
    st.nextBlackout = st.level >= 1 ? api.now + 50_000 : 0;
  },

  shift(st, ms) {
    if (st.nextBlackout) st.nextBlackout += ms;
  },

  tick(st, api) {
    if (st.nextBlackout && api.now >= st.nextBlackout) {
      st.nextBlackout = api.now + 55_000 + Math.floor(Math.random() * 30_000);
      api.fx('explorer', 'blackout', { ms: 3500 });
      api.fx('archivist', 'static', { ms: 1500 });
    }
  },

  explorerView(st) {
    const [r, c] = parse(st.pos);
    const cell = st.walls[r][c];
    const lm = st.landmarks[st.pos];
    return {
      open: { n: !cell.n, e: !cell.e, s: !cell.s, w: !cell.w },
      landmark: lm ? { id: lm, text: LANDMARKS[lm].sense } : null,
      atStart: st.pos === st.start,
      fragmentHere: !st.fragmentTaken && st.pos === st.fragment,
      moves: st.moves,
      falls: st.falls,
      bump: st.bump,
    };
  },

  archivistView(st) {
    return {
      size: st.size,
      walls: st.walls.map((row) => row.map((c) => (c.n ? 1 : 0) | (c.e ? 2 : 0) | (c.s ? 4 : 0) | (c.w ? 8 : 0))),
      landmarks: Object.entries(st.landmarks).map(([k, id]) => ({ k, id, label: LANDMARKS[id].map })),
      hazards: st.hazards,
      exit: st.exit,
      fragment: st.fragmentTaken ? null : st.fragment,
    };
  },

  actions: {
    explorer: {
      move(st, { dir }, api) {
        if (!DELTA[dir]) throw api.error('اتجاه غير معروف');
        const [r, c] = parse(st.pos);
        st.bump = null;
        if (st.walls[r][c][dir]) {
          st.bump = dir;
          return { moved: false };
        }
        const next = key(r + DELTA[dir][0], c + DELTA[dir][1]);
        st.moves++;
        if (st.hazards.includes(next)) {
          st.falls++;
          st.pos = st.start;
          api.fx('explorer', 'fall', {});
          api.log('explorer', 'انهارت الأرضية تحتك! سقطت إلى القبو وصعدت من جديد عبر درج البداية.');
          api.log('archivist', 'دويّ ارتطام عبر اللاسلكي… شريكك سقط عبر أرضية متصدعة وعاد إلى درج البداية.');
          api.penalize(20, 'سقوط عبر أرضية متصدعة');
          return { moved: true, fell: true };
        }
        st.pos = next;
        if (next === st.exit) {
          api.log('explorer', 'وجدت خزنة الأشرطة! بداخلها بكرة مكتوب عليها «البث الأخير».');
          api.log('archivist', 'شريكك وصل إلى الخزنة واستعاد البكرة.');
          api.item('reel', 'بكرة «البث الأخير»', 'بكرة شريط ثقيلة. يجب تشغيلها في استوديو البث.');
          api.complete();
        }
        return { moved: true };
      },
      pickup(st, _payload, api) {
        if (st.fragmentTaken || st.pos !== st.fragment) throw api.error('لا شيء هنا لالتقاطه');
        st.fragmentTaken = true;
        api.fragment('f2');
        return { ok: true };
      },
    },
  },

  hint(st, role, tier) {
    if (role === 'explorer') {
      if (tier === 3) {
        const d = bfs(st.walls, st.pos, new Set(st.hazards)).get(st.exit);
        return `أقصر طريق آمن من مكانك إلى الخزنة: ${d} خطوات.`;
      }
      return [
        'صِف لشريكك الممرات المفتوحة حولك (شمال/جنوب/شرق/غرب) وأي شيء تسمعه أو تشمّه.',
        'تحرّك خطوة ثم صِف من جديد. تسلسل المعالم يكشف موقعك على الخريطة — ولا تمشِ وحدك: الأرضيات المتصدعة لا تُرى.',
      ][tier - 1];
    }
    if (tier === 3) return `شريكك الآن في الصف ${parse(st.pos)[0] + 1} من الأعلى.`;
    return [
      'شريكك لا يعرف مكانه. قارن ما يصفه من ممرات مفتوحة ومعالم بالخريطة.',
      'اضغط على الخانات لتضع دبابيس: علّم الاحتمالات واستبعدها مع كل خطوة يصفها شريكك.',
    ][tier - 1];
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') {
      const d = rng.pick(['n', 'e', 's', 'w']);
      return { text: `امشِ باتجاه ${DIR_NAMES[d]} مباشرة، الطريق آمن عندي على الخريطة`, keys: [DIR_NAMES[d]] };
    }
    const options = Object.entries(st.landmarks).filter(([k]) => k !== st.pos).map(([, id]) => id);
    const id = rng.pick(options);
    return { text: `أنا الحين ${LANDMARKS[id].short}`, keys: [LANDMARKS[id].short] };
  },
};
