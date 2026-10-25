// Archivist · مخطط الأرشيف السفلي — the full floor plan, minus the partner.
// Pins are a private deduction tool (kept in this tab only).
import { h, mount, svg } from '../../dom.js';

const ICON = { clock: '🕰', puddle: '💧', cabinet: '🗄', reels: '🎞', fan: '🌀', phone: '☎', portrait: '🖼', piano: '🎹', fuel: '⛽', radio: '📻' };
const PIN_FILL = { 1: 'rgba(245,165,36,.45)', 2: 'rgba(60,60,60,.25)' };

export function create(ctx) {
  const storeKey = `dsms:pins:${ctx.gameId}`;
  let pins = {};
  try {
    pins = JSON.parse(sessionStorage.getItem(storeKey)) || {};
  } catch {
    pins = {};
  }
  let view = null;
  const mapBox = h('div');
  const legend = h('div', { class: 'legend' });
  const el = h(
    'article',
    { class: 'paper' },
    h('span', { class: 'stamp' }, 'مخطط'),
    h('h2', {}, 'مخطط الأرشيف السفلي — 1985'),
    h('p', { class: 'sub' }, 'شريكك في مكان ما على هذا المخطط ولا يعرف أين. استنتج موقعه من وصفه للممرات والمعالم، ثم وجّهه إلى الخزنة متجنبًا الأرضيات المتصدعة.'),
    h('div', { class: 'map-layout' }, mapBox, legend),
  );

  function save() {
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(pins));
    } catch {
      /* ignore */
    }
  }

  function render() {
    const v = view;
    const n = v.size;
    const S = 64;
    const P = 26;
    const W = n * S + P * 2;
    const lm = Object.fromEntries(v.landmarks.map((l) => [l.k, l]));
    const hazards = new Set(v.hazards);
    let cells = '';
    let walls = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const k = `${r},${c}`;
        const x = P + c * S;
        const y = P + r * S;
        const pin = pins[k];
        cells += `<g class="cell" data-k="${k}"><rect x="${x}" y="${y}" width="${S}" height="${S}" fill="${pin ? PIN_FILL[pin] : 'rgba(255,255,255,.18)'}"/>`;
        if (hazards.has(k)) cells += `<rect x="${x + 4}" y="${y + 4}" width="${S - 8}" height="${S - 8}" fill="url(#hatch)"/><text x="${x + S / 2}" y="${y + S / 2 + 8}" text-anchor="middle" font-size="24" fill="#b3261e" font-weight="700">✕</text>`;
        if (k === v.exit) cells += `<rect x="${x + 6}" y="${y + 6}" width="${S - 12}" height="${S - 12}" fill="none" stroke="#2a241b" stroke-width="2" stroke-dasharray="4 3"/><text x="${x + S / 2}" y="${y + S / 2 + 4}" text-anchor="middle" font-size="22">🔒</text><text x="${x + S / 2}" y="${y + S - 6}" text-anchor="middle" font-size="9" fill="#2a241b">الخزنة</text>`;
        if (lm[k]) cells += `<text x="${x + S / 2}" y="${y + S / 2 + 2}" text-anchor="middle" font-size="22">${ICON[lm[k].id]}</text><text x="${x + S / 2}" y="${y + S - 5}" text-anchor="middle" font-size="8.5" fill="#2a241b">${lm[k].label}</text>`;
        if (k === v.fragment) cells += `<text x="${x + S - 12}" y="${y + 18}" text-anchor="middle" font-size="14">📄</text>`;
        if (pin === 2) cells += `<path d="M${x + 10} ${y + 10}L${x + S - 10} ${y + S - 10}" stroke="rgba(40,30,20,.35)" stroke-width="3"/>`;
        if (pin === 1) cells += `<circle cx="${x + 12}" cy="${y + 12}" r="6" fill="#d97706" stroke="#2a241b"/>`;
        cells += '</g>';
        const m = v.walls[r][c];
        if (m & 1) walls += `M${x} ${y}h${S}`;
        if (m & 2) walls += `M${x + S} ${y}v${S}`;
        if (m & 4) walls += `M${x} ${y + S}h${S}`;
        if (m & 8) walls += `M${x} ${y}v${S}`;
      }
    }
    const art = svg(`<svg class="map-svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="مخطط الأرشيف">
      <defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V8" stroke="#b3261e" stroke-width="2" opacity=".5"/></pattern></defs>
      ${cells}
      <path d="${walls}" stroke="#2a241b" stroke-width="5" stroke-linecap="square" fill="none"/>
      <text x="${W / 2}" y="16" text-anchor="middle" font-size="13" font-family="IBM Plex Mono" fill="#6b5f4b">N ▲ شمال</text>
    </svg>`);
    art.addEventListener('click', (e) => {
      const g = e.target.closest('.cell');
      if (!g) return;
      const k = g.dataset.k;
      pins[k] = ((pins[k] || 0) + 1) % 3;
      if (!pins[k]) delete pins[k];
      save();
      ctx.sfx.click();
      render();
    });
    mount(mapBox, art);
    mount(
      legend,
      h('h3', {}, 'مفتاح المخطط'),
      h('div', {}, h('span', { class: 'sw', style: { background: 'rgba(255,255,255,.4)', border: '2px solid #2a241b' } }), 'الخطوط السميكة جدران'),
      h('div', {}, h('span', { class: 'sw', style: { background: '#f3d2cf', color: '#b3261e' } }, '✕'), 'أرضية متصدعة — شريكك لا يراها'),
      h('div', {}, h('span', { class: 'sw' }, '🔒'), 'خزنة الأشرطة (الهدف)'),
      h('div', {}, h('span', { class: 'sw' }, '📄'), 'صفحة مفقودة من دفتر سلمى (اختياري)'),
      h('h3', { style: { marginTop: '10px' } }, 'الدبابيس'),
      h('div', {}, h('span', { class: 'sw', style: { background: PIN_FILL[1] } }, '●'), 'ضغطة: موقع محتمل'),
      h('div', {}, h('span', { class: 'sw', style: { background: PIN_FILL[2] } }, '╲'), 'ضغطتان: مستبعد'),
      h('button', { class: 'btn small', type: 'button', style: { background: '#2a241b', color: '#efe6d0' }, onclick: () => { pins = {}; save(); render(); } }, 'مسح الدبابيس'),
      h('p', { class: 'sub', style: { marginTop: '8px' } }, 'المعالم على المخطط مكتوبة بأسماء الأرشيف — شريكك يصفها بما يراه ويسمعه ويشمّه.'),
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
