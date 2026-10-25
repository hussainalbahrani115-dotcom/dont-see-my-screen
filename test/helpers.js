// Test-only "cheat" knowledge: reads the server's secret stage state and
// returns the actions that solve it. Never used by the game itself.
import { bfs } from '../server/game/stages/archive.js';
import { STAGES } from '../server/game/stages/index.js';

const DELTA = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };

export const stageId = (game) => STAGES[game.stageIndex].id;

export function pathTo(st, target, from = st.pos, avoid = []) {
  const blocked = new Set([...(st.hazards || []), ...avoid]);
  const dist = bfs(st.walls, target, blocked);
  const steps = [];
  let cur = from;
  while (cur !== target) {
    const [r, c] = cur.split(',').map(Number);
    const d = ['n', 'e', 's', 'w'].find((dir) => {
      if (st.walls[r][c][dir]) return false;
      const k = `${r + DELTA[dir][0]},${c + DELTA[dir][1]}`;
      return !blocked.has(k) && dist.get(k) === dist.get(cur) - 1;
    });
    steps.push(d);
    cur = `${r + DELTA[d][0]},${c + DELTA[d][1]}`;
  }
  return steps;
}

const moves = (dirs) => dirs.map((dir) => ({ role: 'explorer', type: 'move', payload: { dir } }));

// Bang-bang controller for the boiler: keep the strongest "down" valve open
// while the needle is above the middle of the safe band.
export function pressureToggles(st) {
  const strongest = st.valves.reduce((best, v, i) => (v.flow < st.valves[best].flow ? i : best), 0);
  const want = st.p > (st.lo + st.hi) / 2;
  const out = [];
  st.valves.forEach((v, i) => {
    const shouldOpen = i === strongest && want;
    if (v.open !== shouldOpen) out.push({ role: 'explorer', type: 'toggle', payload: { index: i } });
  });
  return out;
}

export function solutionFor(game) {
  const st = game.stage;
  switch (stageId(game)) {
    case 'junction':
      return [
        { role: 'explorer', type: 'inspect', payload: { id: 'drawer' } },
        { role: 'explorer', type: 'cut', payload: { index: st.answer } },
      ];
    case 'archive':
      // Detour for the page without stepping into the vault (that ends the stage).
      return [
        ...moves(pathTo(st, st.fragment, st.pos, [st.exit])),
        { role: 'explorer', type: 'pickup', payload: {} },
        ...moves(pathTo(st, st.exit, st.fragment)),
      ];
    case 'broadcast':
      return [
        { role: 'explorer', type: 'inspect', payload: { id: 'cassette' } },
        { role: 'explorer', type: 'transmit', payload: { tenths: st.answer } },
      ];
    case 'chase': {
      const dirs = [];
      const cells = [st.pos];
      let from = st.pos;
      for (const f of [...st.fuses.filter((x) => !st.got.includes(x)), st.door]) {
        for (const d of pathTo(st, f, from)) {
          dirs.push(d);
          const [r, c] = cells.at(-1).split(',').map(Number);
          cells.push(`${r + DELTA[d][0]},${c + DELTA[d][1]}`);
        }
        from = f;
      }
      // Test cheat: park the Echo somewhere off the route.
      if (cells.includes(st.echo)) {
        for (let r = 0; r < st.size; r++) for (let c = 0; c < st.size; c++) if (!cells.includes(`${r},${c}`)) st.echo = `${r},${c}`;
      }
      return moves(dirs);
    }
    case 'core':
      return [
        { role: 'explorer', type: 'vote', payload: { choice: 'release' } },
        { role: 'archivist', type: 'vote', payload: { choice: 'release' } },
        { role: 'explorer', type: 'speak', payload: { text: game.phrase.join(' ') } },
      ];
  }
  return [];
}
