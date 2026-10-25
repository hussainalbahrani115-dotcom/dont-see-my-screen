import { h, svg } from '../../dom.js';

// A dark room photographed by torchlight. The torch follows the pointer.
export function sceneBox(markup, onHotspot) {
  const art = svg(markup);
  const torch = h('div', { class: 'torch' });
  const box = h('div', { class: 'scene' }, art, torch);
  box.addEventListener('pointermove', (e) => {
    const r = box.getBoundingClientRect();
    box.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    box.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  for (const hs of art.querySelectorAll('.hotspot')) {
    hs.setAttribute('tabindex', '0');
    hs.setAttribute('role', 'button');
    const go = () => onHotspot(hs.dataset.id);
    hs.addEventListener('click', go);
    hs.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go()));
  }
  return { box, art };
}

export function hotspot(id, label, x, y, w, hgt, inner, labelPos = 'top') {
  const ly = labelPos === 'top' ? y - 10 : y + hgt + 22;
  return `<g class="hotspot" data-id="${id}" aria-label="${label}">
    ${inner}
    <rect class="hs-ring" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${hgt + 12}" rx="10"/>
    <circle class="hs-dot" cx="${x + w / 2}" cy="${y + hgt / 2}" r="5"/>
    <text class="hs-label" x="${x + w / 2}" y="${ly}" text-anchor="middle">${label}</text>
  </g>`;
}

export function stageHead(title, subtitle) {
  return h('div', { class: 'ex-head' }, h('div', {}, h('h2', {}, title), h('p', {}, subtitle)));
}
