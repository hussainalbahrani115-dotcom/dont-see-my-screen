// Explorer · ممر الهوائيات — one cell of torchlight, footsteps closing in.
import { h, mount } from '../../dom.js';
import { stageHead } from './common.js';
import { cellSvg } from './archive.js';

const DIRS = [
  ['n', 'شمال', '▲', 'ArrowUp'],
  ['s', 'جنوب', '▼', 'ArrowDown'],
  ['e', 'شرق', '▶', 'ArrowRight'],
  ['w', 'غرب', '◀', 'ArrowLeft'],
];
const DIR_NAME = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const STEPS = ['صمت… لا شيء يتحرك قريبًا.', 'خطوات بعيدة تتردد في الممرات.', 'خطوات ثقيلة… قريبة جدًا.', 'إنه خلفك تمامًا! تحرّك!'];

export function create(ctx) {
  let view = null;
  let busy = false;
  let lastProx = -1;
  const stageBox = h('div', { class: 'cell-stage chase-stage' });
  const sense = h('div', { class: 'sense', 'aria-live': 'polite' });
  const dread = h('div', { class: 'dread', 'aria-hidden': 'true' });
  const el = h(
    'div',
    { class: 'ex-wrap' },
    dread,
    stageHead('ممر الهوائيات', 'اجمع صمامات الأمان الثلاثة ثم اركض إلى باب النواة. الصدى يطاردك.'),
    h('div', { class: 'cell-view' }, stageBox, sense),
  );

  async function move(dir) {
    if (busy || !view || view.startsInMs > 0) return;
    if (!view.open[dir]) {
      ctx.sfx.bump();
      return;
    }
    busy = true;
    ctx.sfx.step();
    await ctx.act('move', { dir });
    busy = false;
  }

  const onKey = (e) => {
    if (e.target.closest('input, textarea')) return;
    const d = DIRS.find((x) => x[3] === e.key);
    if (d) {
      e.preventDefault();
      move(d[0]);
    }
    if (e.key === ' ' && view?.lockerHere) {
      e.preventDefault();
      ctx.act('hide', {});
    }
  };
  window.addEventListener('keydown', onKey);

  function render() {
    const v = view;
    const icon = v.atDoor ? '🚪' : v.lockerHere ? '🗄' : v.atStart ? '🪜' : '';
    const art = cellSvg({ ...v, icon, landmark: null, fragmentHere: false });
    mount(
      stageBox,
      art,
      v.hidden ? h('div', { class: 'hidden-veil' }, 'أنت داخل الخزانة… لا تتنفس.') : null,
      v.startsInMs > 0 ? h('div', { class: 'boiler-countdown' }, `الأضواء تنطفئ خلال ${Math.ceil(v.startsInMs / 1000)}…`) : null,
      DIRS.map(([d, label, arrow]) =>
        h('button', { class: `move-btn ${d}`, type: 'button', disabled: !v.open[d], 'aria-label': `تحرك نحو ${DIR_NAME[d]}`, onclick: () => move(d) }, arrow, h('span', { class: 'lbl' }, label)),
      ),
    );
    const open = Object.entries(v.open).filter(([, o]) => o).map(([d]) => DIR_NAME[d]);
    mount(
      sense,
      h('div', { class: `steps-meter p${v.proximity}` }, h('span', {}, '👣'), h('div', { class: 'bars' }, [0, 1, 2].map((i) => h('i', { class: i < v.proximity ? 'on' : '' }))), h('b', {}, STEPS[v.proximity])),
      h('div', { class: 'fuse-row' }, [0, 1, 2].map((i) => h('span', { class: `fuse ${i < v.fuses ? 'got' : ''}` }, '⚡')), h('span', {}, `صمامات الأمان ${v.fuses}/${v.total}`)),
      h('div', {}, h('b', {}, 'ممرات مفتوحة: '), open.join('، ') || 'لا شيء'),
      v.atDoor ? h('div', { class: v.doorLocked ? 'bump' : 'what' }, v.doorLocked ? `باب النواة مقفل: ينقصه ${v.total - v.fuses} صمامات.` : 'باب النواة أمامك.') : null,
      v.bump ? h('div', { class: 'bump' }, `اصطدمت بجدار نحو ${DIR_NAME[v.bump]}.`) : null,
      v.lockerHere
        ? h('button', { class: `btn block ${v.hidden ? '' : 'primary'}`, type: 'button', onclick: () => ctx.act('hide', {}) }, v.hidden ? '🚪 اخرج من الخزانة' : '🗄 اختبئ في الخزانة (مسافة)')
        : null,
      h('div', { class: 'counter-row' }, h('span', {}, `STEPS ${v.moves}`), h('span', {}, `CAUGHT ${v.catches}`)),
      h('div', { class: 'ex-note' }, 'الصمامات تُلتقط تلقائيًا حين تدخل خانتها. لا تعرف أين هي — شريكك يعرف.'),
    );
    dread.style.setProperty('--d', String(v.proximity / 3));
    if (v.proximity !== lastProx) {
      if (v.proximity >= 2 && v.proximity > lastProx) ctx.sfx.heart();
      lastProx = v.proximity;
    }
  }

  return {
    el,
    update(v) {
      view = v;
      render();
    },
    tension: () => (view ? view.proximity / 3 : 0),
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
