// Test-only "cheat" knowledge: reads the server's secret stage state and
// returns the actions that solve it. Never used by the game itself.
import { bfs } from '../server/game/stages/archive.js';

const DELTA = { n: [-1, 0], s: [1, 0], e: [0, 1], w: [0, -1] };

export function pathTo(st, target) {
  const blocked = new Set(st.hazards);
  const dist = bfs(st.walls, target, blocked);
  const steps = [];
  let cur = st.pos;
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

export function solutionFor(game) {
  const st = game.stage;
  switch (game.stageIndex) {
    case 0:
      return [
        { role: 'explorer', type: 'inspect', payload: { id: 'drawer' } },
        { role: 'explorer', type: 'cut', payload: { index: st.answer } },
      ];
    case 1: {
      const toFragment = pathTo(st, st.fragment);
      const sim = { ...st, pos: st.fragment };
      const toExit = pathTo(sim, st.exit);
      return [
        ...toFragment.map((dir) => ({ role: 'explorer', type: 'move', payload: { dir } })),
        { role: 'explorer', type: 'pickup', payload: {} },
        ...toExit.map((dir) => ({ role: 'explorer', type: 'move', payload: { dir } })),
      ];
    }
    case 2:
      return [
        { role: 'explorer', type: 'inspect', payload: { id: 'cassette' } },
        { role: 'explorer', type: 'transmit', payload: { tenths: st.answer } },
      ];
    case 3:
      return [
        { role: 'explorer', type: 'vote', payload: { choice: 'release' } },
        { role: 'archivist', type: 'vote', payload: { choice: 'release' } },
        { role: 'explorer', type: 'speak', payload: { text: game.phrase.join(' ') } },
      ];
  }
  return [];
}
