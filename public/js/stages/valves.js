// Valve artwork shared by both roles (the archivist's chart and the
// explorer's boiler draw the same handles so they can be matched).
import { svg } from '../dom.js';

export const VALVE_HEX = { red: '#d8443c', blue: '#3a78e0', yellow: '#e8c33a', green: '#3aa864' };

const HANDLE = {
  round: (c) => `<circle cx="50" cy="50" r="22" fill="${c}" stroke="#111" stroke-width="3"/><circle cx="50" cy="50" r="7" fill="#111" opacity=".5"/>`,
  lever: (c) => `<rect x="14" y="42" width="72" height="16" rx="8" fill="${c}" stroke="#111" stroke-width="3"/><circle cx="50" cy="50" r="9" fill="#222"/>`,
  star: (c) => `<path d="M50 18L58 40 82 40 63 54 70 78 50 64 30 78 37 54 18 40 42 40Z" fill="${c}" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`,
  wheel: (c) => `<circle cx="50" cy="50" r="30" fill="none" stroke="${c}" stroke-width="8"/><path d="M50 20V80M20 50H80M29 29L71 71M71 29L29 71" stroke="${c}" stroke-width="5"/><circle cx="50" cy="50" r="8" fill="#222"/>`,
};

export function valveSvg(color, handle, size = 100) {
  return svg(`<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><g class="handle">${HANDLE[handle](VALVE_HEX[color])}</g></svg>`);
}

export const HANDLE_LABEL = { round: 'مقبض دائري', lever: 'مقبض ذراع', star: 'مقبض نجمي', wheel: 'عجلة' };
export const COLOR_LABEL = { red: 'أحمر', blue: 'أزرق', yellow: 'أصفر', green: 'أخضر' };
