// Stage — ممر الهوائيات (real time).
// The Echo now walks. It hunts the explorer along the shortest path through
// the walls. The archivist finally sees both dots live on the plan (plus the
// three safety fuses, the lockers and the core door); the explorer only sees
// their own cell and hears footsteps getting closer. Hiding in a locker makes
// the Echo lose the trail. At the start the Echo privately offers the
// archivist a bargain (see engine.answerDeal).

import { makeMaze, bfs, key, parse, DELTA } from './archive.js';
import { DIR_NAMES } from '../text.js';
import { countdownTick } from './pressure.js';

const FUSES = 3;
const START_DELAY_MS = 13_000;
const ACCURACY = [0.65, 0.8, 0.9];
const INTERVAL = [2600, 2000, 1500];

function neighborsOf(walls, k) {
  const [r, c] = parse(k);
  return ['n', 'e', 's', 'w'].filter((d) => !walls[r][c][d]).map((d) => key(r + DELTA[d][0], c + DELTA[d][1]));
}

export default {
  id: 'chase',
  title: 'ممر الهوائيات',
  targetSec: 180,
  realtime: true,

  generate({ rng, level }) {
    const size = level >= 2 ? 7 : 6;
    const walls = makeMaze(rng, size, size + 3);
    const cells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) cells.push(key(r, c));
    const start = rng.pick([key(0, 0), key(0, size - 1), key(size - 1, 0), key(size - 1, size - 1)]);
    const fromStart = bfs(walls, start);
    const maxD = Math.max(...fromStart.values());
    const door = rng.pick(cells.filter((k) => fromStart.get(k) === maxD));

    const fuses = [];
    for (const k of rng.shuffle(cells)) {
      if (fuses.length >= FUSES) break;
      if (k === door || fromStart.get(k) < 2) continue;
      const d = bfs(walls, k);
      if (fuses.every((f) => d.get(f) >= 3)) fuses.push(k);
    }
    const lockers = rng.shuffle(cells.filter((k) => k !== start && k !== door && !fuses.includes(k))).slice(0, size - 1);
    const far = cells.filter((k) => k !== door && fromStart.get(k) >= size);
    const echoSpawn = rng.pick(far.length ? far : cells.filter((k) => k !== start));

    return {
      size, walls, start, door, fuses, got: [], lockers,
      pos: start, echo: echoSpawn, echoSpawn, hidden: false,
      accuracy: ACCURACY[level], interval: INTERVAL[level],
      nextEcho: 0, startAt: 0, catches: 0, moves: 0, bump: null, doorLocked: false,
    };
  },

  validate(st) {
    if (st.fuses.length !== FUSES) throw new Error('not enough fuses');
    const reach = bfs(st.walls, st.start);
    if (![st.door, ...st.fuses].every((k) => reach.has(k))) throw new Error('unreachable');
    if (st.echo === st.start) throw new Error('echo on start');
  },

  onStart(st, api) {
    st.startAt = api.now + START_DELAY_MS;
    st.nextEcho = st.startAt;
    if (!api.game.deal) {
      api.game.deal = 'offered';
      api.fx('archivist', 'deal', {});
    }
  },

  shift(st, ms) {
    st.startAt += ms;
    st.nextEcho += ms;
  },

  tick(st, api) {
    if (api.now < st.startAt) return countdownTick(st, api.now);
    if (api.now < st.nextEcho) return false;
    const slow = api.game.deal === 'accepted' ? 1.8 : 1;
    st.nextEcho = api.now + st.interval * slow;
    const options = neighborsOf(st.walls, st.echo);
    let next;
    if (st.hidden || Math.random() > st.accuracy) {
      next = options[Math.floor(Math.random() * options.length)];
    } else {
      const dist = bfs(st.walls, st.pos);
      next = options.find((k) => dist.get(k) === dist.get(st.echo) - 1) ?? options[0];
    }
    st.echo = next;
    if (st.echo === st.pos && !st.hidden) caught(st, api);
    return true;
  },

  explorerView(st, game) {
    const [r, c] = parse(st.pos);
    const cell = st.walls[r][c];
    const d = bfs(st.walls, st.pos).get(st.echo);
    return {
      open: { n: !cell.n, e: !cell.e, s: !cell.s, w: !cell.w },
      lockerHere: st.lockers.includes(st.pos),
      hidden: st.hidden,
      atStart: st.pos === st.start,
      atDoor: st.pos === st.door,
      doorLocked: st.doorLocked,
      fuses: st.got.length,
      total: FUSES,
      proximity: d <= 1 ? 3 : d <= 3 ? 2 : d <= 5 ? 1 : 0,
      moves: st.moves,
      catches: st.catches,
      bump: st.bump,
      startsInMs: Math.max(0, st.startAt - (game.pausedAt ?? Date.now())),
    };
  },

  archivistView(st, game) {
    return {
      size: st.size,
      walls: st.walls.map((row) => row.map((c) => (c.n ? 1 : 0) | (c.e ? 2 : 0) | (c.s ? 4 : 0) | (c.w ? 8 : 0))),
      pos: st.pos,
      echo: st.echo,
      fuses: st.fuses.filter((f) => !st.got.includes(f)),
      got: st.got.length,
      total: FUSES,
      door: st.door,
      lockers: st.lockers,
      hidden: st.hidden,
      catches: st.catches,
      slowed: game.deal === 'accepted',
      startsInMs: Math.max(0, st.startAt - (game.pausedAt ?? Date.now())),
    };
  },

  actions: {
    explorer: {
      move(st, { dir }, api) {
        if (!DELTA[dir]) throw api.error('اتجاه غير معروف');
        const [r, c] = parse(st.pos);
        st.bump = null;
        st.doorLocked = false;
        if (st.walls[r][c][dir]) {
          st.bump = dir;
          return { moved: false };
        }
        st.pos = key(r + DELTA[dir][0], c + DELTA[dir][1]);
        st.hidden = false;
        st.moves++;
        if (st.pos === st.echo) {
          caught(st, api);
          return { moved: true, caught: true };
        }
        if (st.fuses.includes(st.pos) && !st.got.includes(st.pos)) {
          st.got.push(st.pos);
          api.fx('explorer', 'item', { name: `صمام أمان (${st.got.length}/${FUSES})` });
          api.log('explorer', `التقطت صمام أمان (${st.got.length}/${FUSES}).`);
          api.log('archivist', `شريكك التقط صمام أمان (${st.got.length}/${FUSES}).`);
        }
        if (st.pos === st.door) {
          if (st.got.length === FUSES) {
            api.log('explorer', 'ركّبت الصمامات الثلاثة. انفتح باب النواة وأُغلق خلفك قبل أن يصل الصدى.');
            api.log('archivist', 'نقطة شريكك اختفت خلف باب النواة. النقطة الحمراء توقفت أمامه.');
            api.complete();
          } else {
            st.doorLocked = true;
          }
        }
        return { moved: true };
      },
      hide(st, _p, api) {
        if (!st.lockers.includes(st.pos)) throw api.error('لا يوجد مكان للاختباء هنا');
        st.hidden = !st.hidden;
        return { hidden: st.hidden };
      },
    },
  },

  hint(st, role, tier) {
    if (role === 'explorer') {
      if (tier === 3) {
        const dist = bfs(st.walls, st.pos);
        const left = st.fuses.filter((f) => !st.got.includes(f));
        const target = left.length ? Math.min(...left.map((f) => dist.get(f))) : dist.get(st.door);
        return `${left.length ? 'أقرب صمام أمان' : 'باب النواة'} على بعد ${target} خطوات من مكانك.`;
      }
      return [
        'راقب مؤشر الخطوات: كلما اشتد، فالصدى أقرب. شريكك يرى أين هو بالضبط — اسأله قبل كل منعطف.',
        'الخزائن تخفيك: ادخل خزانة واضغط «اختبئ» فيفقد الصدى أثرك ويتجول عشوائيًا. أي خطوة تكشفك من جديد.',
      ][tier - 1];
    }
    if (tier === 3) return `الصدى يتحرك خطوة كل ${(st.interval / 1000).toFixed(1)} ثانية تقريبًا، وشريكك يتحرك بسرعة رسائلكما.`;
    return [
      'أعطِ أوامر قصيرة جدًا: «شمال، شمال، شرق». الصدى لا ينتظر الجمل الطويلة.',
      'الصدى يتبع أقصر طريق إلى شريكك. الممرات الدائرية تسمح بالالتفاف حوله، والخزائن تقطع أثره.',
    ][tier - 1];
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') {
      const d = rng.pick(['n', 'e', 's', 'w']);
      return { text: `الصدى بعيد عنك تمامًا، امشِ ${DIR_NAMES[d]} بثقة`, keys: [DIR_NAMES[d]] };
    }
    return { text: 'جمعت الصمامات الثلاثة، أنا عند الباب الحين', keys: ['الثلاثة'] };
  },
};

function caught(st, api) {
  st.catches++;
  api.stat('caught');
  st.pos = st.start;
  st.echo = st.echoSpawn;
  st.hidden = false;
  st.nextEcho = api.now + 3500;
  api.fx('explorer', 'caught', {});
  api.fx('archivist', 'static', { ms: 1400 });
  api.log('explorer', 'يد باردة على كتفك… ثم ظلام. استيقظت عند مدخل الممر. الصمامات التي جمعتها ما زالت معك.');
  api.log('archivist', 'النقطتان التقتا. شريكك عاد إلى مدخل الممر.');
  api.penalize(25, 'أمسك الصدى بالميداني');
}
