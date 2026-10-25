// Explorer · الأرشيف المظلم — only the current cell exists in the torchlight.
import { h, mount, svg } from '../../dom.js';
import { stageHead } from './common.js';

const DIRS = [
  ['n', 'شمال', '▲', 'ArrowUp'],
  ['s', 'جنوب', '▼', 'ArrowDown'],
  ['e', 'شرق', '▶', 'ArrowRight'],
  ['w', 'غرب', '◀', 'ArrowLeft'],
];
const DIR_NAME = { n: 'الشمال', s: 'الجنوب', e: 'الشرق', w: 'الغرب' };
const ICON = { clock: '🕰', puddle: '💧', cabinet: '🗄', reels: '🎞', fan: '🌀', phone: '☎', portrait: '🖼', piano: '🎹', fuel: '⛽', radio: '📻' };

function cellSvg(v) {
  const wall = (d) => {
    const seg = { n: 'M60 60H340', s: 'M60 340H340', e: 'M340 60V340', w: 'M60 60V340' }[d];
    return v.open[d]
      ? ''
      : `<path d="${seg}" stroke="#4a3d28" stroke-width="22" stroke-linecap="square"/><path d="${seg}" stroke="#6b5838" stroke-width="4" stroke-dasharray="2 10"/>`;
  };
  const corridor = (d) => {
    if (!v.open[d]) return '';
    const r = { n: [140, 0, 120, 60], s: [140, 340, 120, 60], e: [340, 140, 60, 120], w: [0, 140, 60, 120] }[d];
    const grad = { n: 'gN', s: 'gS', e: 'gE', w: 'gW' }[d];
    return `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="url(#${grad})"/>`;
  };
  const icon = v.landmark ? ICON[v.landmark.id] : v.atStart ? '🪜' : '';
  return svg(`<svg viewBox="0 0 400 400" aria-hidden="true">
    <defs>
      <radialGradient id="light" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#3b2f1c"/><stop offset=".55" stop-color="#1a140c"/><stop offset="1" stop-color="#050403"/></radialGradient>
      <linearGradient id="gN" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2a2114"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2114"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="gE" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a2114"/><stop offset="1" stop-color="#000"/></linearGradient>
      <linearGradient id="gW" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#2a2114"/><stop offset="1" stop-color="#000"/></linearGradient>
    </defs>
    <rect width="400" height="400" fill="#000"/>
    ${['n', 's', 'e', 'w'].map(corridor).join('')}
    <rect x="60" y="60" width="280" height="280" fill="url(#light)"/>
    ${['n', 's', 'e', 'w'].map(wall).join('')}
    ${icon ? `<text x="200" y="222" font-size="72" text-anchor="middle">${icon}</text>` : ''}
    ${v.fragmentHere ? '<text x="270" y="300" font-size="38" text-anchor="middle">📄</text>' : ''}
    <g font-family="IBM Plex Mono" font-size="14" fill="#7a6a48" text-anchor="middle"><text x="200" y="100">N</text></g>
  </svg>`);
}

export function create(ctx) {
  let view = null;
  let busy = false;
  const stageBox = h('div', { class: 'cell-stage' });
  const sense = h('div', { class: 'sense', 'aria-live': 'polite' });
  const el = h(
    'div',
    { class: 'ex-wrap' },
    stageHead('الأرشيف المظلم', 'ابحث عن خزنة الأشرطة. لا ترى إلا ما حولك — وبعض الأرضيات متصدعة.'),
    h('div', { class: 'cell-view' }, stageBox, sense),
  );

  async function move(dir) {
    if (busy || !view) return;
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
  };
  window.addEventListener('keydown', onKey);

  function render() {
    const v = view;
    const art = cellSvg(v);
    art.style.animation = 'msg-in .25s ease';
    mount(
      stageBox,
      art,
      DIRS.map(([d, label, arrow]) =>
        h('button', { class: `move-btn ${d}`, type: 'button', disabled: !v.open[d], 'aria-label': `تحرك نحو ${DIR_NAME[d]}`, onclick: () => move(d) }, arrow, h('span', { class: 'lbl' }, label)),
      ),
    );
    const open = Object.entries(v.open).filter(([, o]) => o).map(([d]) => DIR_NAME[d]);
    const pickBtn = v.fragmentHere
      ? h('button', { class: 'btn primary block', type: 'button', onclick: () => ctx.act('pickup', {}) }, '📄 التقط الورقة من الأرض')
      : null;
    mount(
      sense,
      h('h3', {}, 'ما تلتقطه حواسك'),
      h('div', { class: 'what' }, v.landmark ? v.landmark.text : v.atStart ? 'درج حديدي يصعد إلى الأعلى — من هنا نزلت.' : 'لا شيء مميز. جدران رطبة وصمت.'),
      v.fragmentHere ? h('div', { class: 'what' }, 'على الأرض ورقة مطوية…') : null,
      h('div', {}, h('b', {}, 'ممرات مفتوحة: '), open.join('، ') || 'لا شيء'),
      v.bump ? h('div', { class: 'bump' }, `اصطدمت بجدار نحو ${DIR_NAME[v.bump]}.`) : null,
      pickBtn,
      h('div', { class: 'counter-row' }, h('span', {}, `STEPS ${v.moves}`), h('span', {}, `FALLS ${v.falls}`)),
      h('div', { class: 'ex-note' }, 'الأسهم في لوحة المفاتيح تعمل أيضًا. الشمال دائمًا للأعلى.'),
    );
  }

  return {
    el,
    update(v) {
      view = v;
      render();
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
