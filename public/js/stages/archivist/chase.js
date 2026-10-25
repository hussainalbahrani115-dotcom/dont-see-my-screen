// Archivist · جهاز التتبع — live plan with the partner, the Echo, the fuses.
import { h, mount, svg } from '../../dom.js';

export function create() {
  const mapBox = h('div');
  const status = h('div', { class: 'legend' });
  const el = h(
    'article',
    { class: 'paper' },
    h('span', { class: 'stamp' }, 'تتبع حي'),
    h('h2', {}, 'ممر الهوائيات — جهاز التتبع'),
    h('p', { class: 'sub' }, 'النقطة الكهرمانية شريكك، والحمراء الصدى. وجّه شريكك إلى الصمامات ⚡ ثم إلى الباب 🚪. الخزائن 🗄 تقطع أثر الصدى.'),
    h('div', { class: 'map-layout' }, mapBox, status),
  );

  return {
    el,
    update(v) {
      const n = v.size;
      const S = 60;
      const P = 24;
      const W = n * S + P * 2;
      const center = (k) => {
        const [r, c] = k.split(',').map(Number);
        return [P + c * S + S / 2, P + r * S + S / 2];
      };
      let cells = '';
      let walls = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const x = P + c * S;
          const y = P + r * S;
          cells += `<rect x="${x}" y="${y}" width="${S}" height="${S}" fill="rgba(255,255,255,.18)"/>`;
          const m = v.walls[r][c];
          if (m & 1) walls += `M${x} ${y}h${S}`;
          if (m & 2) walls += `M${x + S} ${y}v${S}`;
          if (m & 4) walls += `M${x} ${y + S}h${S}`;
          if (m & 8) walls += `M${x} ${y}v${S}`;
        }
      }
      const icon = (k, ch, size = 22) => {
        const [x, y] = center(k);
        return `<text x="${x}" y="${y + size / 3}" text-anchor="middle" font-size="${size}">${ch}</text>`;
      };
      const [ex, ey] = center(v.pos);
      const [cx, cy] = center(v.echo);
      const art = svg(`<svg class="map-svg" viewBox="0 0 ${W} ${W}" role="img" aria-label="مخطط التتبع">
        ${cells}
        ${v.lockers.map((k) => icon(k, '🗄', 18)).join('')}
        ${v.fuses.map((k) => icon(k, '⚡', 24)).join('')}
        ${icon(v.door, '🚪', 26)}
        <path d="${walls}" stroke="#2a241b" stroke-width="5" stroke-linecap="square" fill="none"/>
        <circle cx="${cx}" cy="${cy}" r="20" fill="none" stroke="#b3261e" stroke-width="2" class="echo-ring"/>
        <circle cx="${cx}" cy="${cy}" r="11" fill="#b3261e"/>
        <circle cx="${ex}" cy="${ey}" r="11" fill="#d97706" stroke="#2a241b" stroke-width="2.5" opacity="${v.hidden ? 0.45 : 1}"/>
        ${v.hidden ? `<text x="${ex}" y="${ey - 16}" text-anchor="middle" font-size="11" fill="#2a241b">مختبئ</text>` : ''}
        <text x="${W / 2}" y="15" text-anchor="middle" font-size="12" font-family="IBM Plex Mono" fill="#6b5f4b">N ▲ شمال</text>
      </svg>`);
      mount(mapBox, art);
      mount(
        status,
        v.startsInMs > 0 ? h('div', { class: 'gauge-warn' }, `الصدى يتحرك خلال ${Math.ceil(v.startsInMs / 1000)} ثوانٍ`) : null,
        h('div', {}, h('span', { class: 'sw', style: { background: '#d97706', borderRadius: '50%' } }), 'شريكك'),
        h('div', {}, h('span', { class: 'sw', style: { background: '#b3261e', borderRadius: '50%' } }), v.slowed ? 'الصدى (مُبطأ بالصفقة)' : 'الصدى'),
        h('div', {}, h('span', { class: 'sw' }, '⚡'), `صمامات متبقية: ${v.total - v.got}`),
        h('div', {}, h('span', { class: 'sw' }, '🗄'), 'خزانة للاختباء'),
        h('div', {}, h('span', { class: 'sw' }, '🚪'), 'باب النواة'),
        h('p', { class: 'sub', style: { marginTop: '8px' } }, `أمسك به الصدى: ${v.catches} ${v.catches === 1 ? 'مرة' : 'مرات'}`),
      );
    },
  };
}
