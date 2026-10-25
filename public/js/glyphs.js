// The eight engraved panel glyphs. Both roles render the same shapes from an
// id; neither side ever receives a name for them, so the explorer has to
// describe what they see.
import { svg } from './dom.js';

const PATHS = {
  g0: '<circle cx="50" cy="50" r="30"/><path d="M24 76L76 24"/>',
  g1: '<path d="M50 18L84 78H16Z"/><circle cx="50" cy="58" r="5" class="f"/>',
  g2: '<rect x="20" y="20" width="60" height="60"/><circle cx="50" cy="50" r="11"/>',
  g3: '<path d="M22 50h56M22 64h56M22 78h56"/><path d="M24 38Q50 8 76 38"/>',
  g4: '<path d="M50 14L60 40 88 40 65 56 74 84 50 67 26 84 35 56 12 40 40 40Z"/>',
  g5: '<path d="M12 50Q50 12 88 50Q50 88 12 50Z"/><circle cx="50" cy="50" r="11"/>',
  g6: '<path d="M18 38h58M64 26l12 12-12 12"/><path d="M82 64H24M36 52L24 64l12 12"/>',
  g7: '<path d="M60 18A32 32 0 1 0 60 82A24 24 0 1 1 60 18Z"/><circle cx="76" cy="40" r="4.5" class="f"/><circle cx="80" cy="58" r="4.5" class="f"/>',
};

export function glyph(id, color = '#f5a524') {
  return svg(
    `<svg viewBox="0 0 100 100" role="img" aria-label="رمز محفور"><g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${(PATHS[id] || '').replaceAll('class="f"', `fill="${color}" stroke="none"`)}</g></svg>`,
  );
}
