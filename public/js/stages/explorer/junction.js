// Explorer · غرفة المولّد — a torchlit room, then a close-up of the panel.
import { h, mount, ask } from '../../dom.js';
import { glyph } from '../../glyphs.js';
import { sceneBox, hotspot, stageHead } from './common.js';

const WIRE_HEX = { red: '#d8443c', blue: '#3a78e0', yellow: '#e8c33a', white: '#ece8de', black: '#1d1d1d', green: '#3aa864' };

const ROOM = `<svg viewBox="0 0 800 500" aria-label="غرفة المولّد">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a241b"/><stop offset="1" stop-color="#15110c"/></linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a150f"/><stop offset="1" stop-color="#0b0906"/></linearGradient>
    <pattern id="tiles" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#000" stroke-opacity=".35"/></pattern>
  </defs>
  <rect width="800" height="360" fill="url(#wall)"/><rect width="800" height="360" fill="url(#tiles)"/>
  <rect y="360" width="800" height="140" fill="url(#floor)"/>
  <path d="M0 360H800" stroke="#3a3124" stroke-width="3"/>
  <!-- pipes -->
  <path d="M0 60H800M0 74H800" stroke="#3b3326" stroke-width="8"/>
  <path d="M120 74V200" stroke="#3b3326" stroke-width="8"/>
  <!-- generator -->
  <g transform="translate(40 210)">
    <rect width="190" height="170" rx="10" fill="#2f3a33" stroke="#1a201c" stroke-width="4"/>
    <rect x="18" y="20" width="154" height="60" rx="6" fill="#1b221e"/>
    <circle cx="60" cy="125" r="28" fill="#1b221e" stroke="#46524a" stroke-width="4"/>
    <circle cx="140" cy="125" r="18" fill="#1b221e" stroke="#46524a" stroke-width="4"/>
    <text x="95" y="57" fill="#57695d" font-family="IBM Plex Mono" font-size="15" text-anchor="middle">GEN-02</text>
  </g>
  ${hotspot('panel', 'لوحة الكهرباء', 360, 110, 130, 170, `
    <rect x="360" y="110" width="130" height="170" rx="8" fill="#3a4049" stroke="#1c2026" stroke-width="5"/>
    <rect x="374" y="124" width="102" height="60" rx="4" fill="#20252b"/>
    <path d="M380 205h90M380 222h90M380 239h90M380 256h90" stroke="#555" stroke-width="5" stroke-linecap="round"/>
    <path d="M425 280V360" stroke="#22262b" stroke-width="10"/>
    <text x="425" y="160" fill="#f5a524" font-size="22" text-anchor="middle">⚡</text>`)}
  ${hotspot('drawer', 'مكتب قديم', 520, 300, 170, 80, `
    <rect x="510" y="290" width="190" height="16" fill="#4a3826"/>
    <rect x="520" y="306" width="170" height="80" fill="#3a2b1d" stroke="#24190f" stroke-width="3"/>
    <rect x="580" y="330" width="50" height="10" rx="3" fill="#8a6a3e"/>
    <path d="M520 386v40M690 386v40" stroke="#3a2b1d" stroke-width="10"/>
    <rect x="610" y="262" width="34" height="28" fill="#c9b98f" transform="rotate(-8 627 276)"/>`, 'bottom')}
  ${hotspot('poster', 'ملصق', 560, 110, 90, 120, `
    <rect x="560" y="110" width="90" height="120" fill="#b9ad8d" transform="rotate(3 605 170)"/>
    <path d="M572 132h66M572 146h50M572 160h60" stroke="#6b5f4b" stroke-width="4" transform="rotate(3 605 170)"/>
    <path d="M578 196l50 -6" stroke="#b3261e" stroke-width="3" transform="rotate(3 605 170)"/>`)}
  ${hotspot('door', 'باب مقفل', 712, 130, 72, 230, `
    <rect x="712" y="130" width="72" height="230" fill="#2b2f35" stroke="#15181c" stroke-width="5"/>
    <circle cx="726" cy="250" r="6" fill="#8a919a"/>
    <rect x="732" y="150" width="32" height="20" rx="3" fill="#3a0e0b"/>
    <circle cx="748" cy="160" r="5" fill="#ff3b30"/>`)}
</svg>`;

export function create(ctx) {
  let mode = 'scene';
  let selected = null;
  let view = null;
  const note = h('div', { class: 'ex-note' }, 'حرّك الكشاف وافحص ما حولك. اضغط على الأشياء المضيئة.');
  const { box } = sceneBox(ROOM, async (id) => {
    ctx.sfx.click();
    if (id === 'panel') {
      mode = 'panel';
      render();
      return;
    }
    const res = await ctx.act('inspect', { id });
    if (res.ok && res.text) note.textContent = res.text;
  });

  const body = h('div');
  const el = h('div', { class: 'ex-wrap' }, stageHead('غرفة المولّد', 'أعِد التيار إلى المحطة. سلك واحد فقط هو الصحيح.'), body);

  function wireRow(w, i) {
    const burned = view.burned.includes(i);
    const btn = h(
      'button',
      {
        type: 'button',
        class: `wire ${w.s ? 'striped' : ''} ${burned ? 'burned' : ''} ${selected === i ? 'selected' : ''}`,
        style: { '--c': WIRE_HEX[w.c] },
        disabled: burned,
        'aria-label': `السلك رقم ${i + 1}${w.s ? '، مخطط' : ''}`,
        onclick: () => {
          ctx.sfx.click();
          selected = selected === i ? null : i;
          render();
        },
      },
      h('span', { class: 'term a' }),
      h('span', { class: 'cable' }),
      h('span', { class: 'term b' }),
      h('span', { class: 'num' }, String(i + 1)),
    );
    return btn;
  }

  function render() {
    if (!view) return;
    if (mode === 'scene') {
      mount(body, box, note);
      return;
    }
    const p = view.panel;
    const cutBtn = h('button', { class: 'btn primary', type: 'button', disabled: selected == null }, selected == null ? 'اختر سلكًا' : `✂ اقطع السلك ${selected + 1}`);
    cutBtn.addEventListener('click', async () => {
      if (selected == null) return;
      if (!(await ask(`قطع السلك رقم ${selected + 1}؟ الخطأ يكلّف 30 ثانية.`, '✂ اقطع'))) return;
      cutBtn.disabled = true;
      const res = await ctx.act('cut', { index: selected });
      selected = null;
      if (res.ok && !res.correct) {
        steel.classList.remove('spark');
        void steel.offsetWidth;
        steel.classList.add('spark');
      }
      render();
    });
    const steel = h('div', { class: 'steel' }, h('div', { class: 'wires' }, p.wires.map(wireRow)));
    mount(
      body,
      h('div', { class: 'ex-tools' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { mode = 'scene'; render(); } }, '↩ العودة إلى الغرفة')),
      h(
        'div',
        { class: 'panel-closeup' },
        steel,
        h(
          'div',
          { class: 'panel-side' },
          h('div', { class: 'glyph-plate', title: 'رمز محفور' }, glyph(p.glyph)),
          h('div', { class: 'plate' }, h('small', {}, 'الرقم التسلسلي'), h('div', { class: 'serial' }, p.serial)),
          h('div', { class: 'lamps', 'aria-label': `المصابيح المضاءة: ${p.lamps} من 3` }, [0, 1, 2].map((i) => h('span', { class: `lamp ${i < p.lamps ? 'on' : ''}` }))),
        ),
      ),
      h('div', { class: 'cut-bar' }, h('span', {}, 'الأسلاك مرقّمة من الأعلى إلى الأسفل. صِفها لشريكك قبل أن تقطع.'), cutBtn),
    );
  }

  return {
    el,
    update(v) {
      view = v;
      render();
    },
  };
}
