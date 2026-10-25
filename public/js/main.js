// App controller: owns the connection, the session token and screen routing.
// The server is the source of truth; this file only renders what it sends.

import { net } from './net.js';
import { h, mount, toast } from './dom.js';
import { sfx } from './audio.js';
import { playFx } from './effects.js';
import { HomeScreen } from './screens/home.js';
import { LobbyScreen } from './screens/lobby.js';
import { GameScreen } from './screens/game.js';
import { ResultsScreen } from './screens/results.js';

const root = document.getElementById('app');

// sessionStorage keeps each tab its own seat (two tabs = two players while
// testing); localStorage remembers the last room for a manual "resume".
export const session = {
  get() {
    try {
      return JSON.parse(sessionStorage.getItem('dsms:session'));
    } catch {
      return null;
    }
  },
  set(s) {
    try {
      sessionStorage.setItem('dsms:session', JSON.stringify(s));
      localStorage.setItem('dsms:last', JSON.stringify(s));
    } catch {
      /* storage blocked */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem('dsms:session');
    } catch {
      /* storage blocked */
    }
  },
  last() {
    try {
      return JSON.parse(localStorage.getItem('dsms:last'));
    } catch {
      return null;
    }
  },
  forgetLast() {
    try {
      localStorage.removeItem('dsms:last');
    } catch {
      /* storage blocked */
    }
  },
};

const store = { state: null, receivedAt: 0 };
let current = { key: null, screen: null };

const appCtx = {
  net,
  session,
  sfx,
  get state() {
    return store.state;
  },
  // Server-relative elapsed time since the last snapshot.
  sinceSnapshot() {
    return Date.now() - store.receivedAt;
  },
  async act(type, payload) {
    const res = await net.emit('game:action', { type, payload });
    if (!res.ok) toast(res.error, 'error');
    return res;
  },
  async call(event, payload) {
    const res = await net.emit(event, payload);
    if (!res.ok) toast(res.error, 'error');
    return res;
  },
  async enter(event, payload) {
    const res = await net.emit(event, payload);
    if (!res.ok) {
      toast(res.error, 'error');
      return res;
    }
    session.set({ code: res.code, token: res.token ?? session.get()?.token ?? payload.token });
    return res;
  },
  async leave() {
    await net.emit('room:leave');
    session.clear();
    session.forgetLast();
    store.state = null;
    history.replaceState(null, '', location.pathname);
    render();
  },
};

function screenFor(state) {
  if (!state?.room || !state.you) return { name: 'home', key: 'home' };
  const phase = state.room.phase;
  if (phase === 'lobby') return { name: 'lobby', key: `lobby:${state.room.code}` };
  if (phase === 'ended') return { name: 'results', key: `results:${state.game.id}` };
  return { name: 'game', key: `game:${state.game.id}:${state.you.role}` };
}

const SCREENS = { home: HomeScreen, lobby: LobbyScreen, game: GameScreen, results: ResultsScreen };

function render() {
  const { name, key } = screenFor(store.state);
  if (current.key !== key) {
    current.screen?.destroy?.();
    current = { key, screen: SCREENS[name](appCtx) };
    mount(root, current.screen.el);
    window.scrollTo(0, 0);
  }
  current.screen.update?.(store.state);
}

async function resume() {
  const s = session.get();
  if (!s) return;
  const res = await net.emit('room:resume', s);
  if (!res.ok) {
    session.clear();
    if (res.code === 'no_room' || res.code === 'bad_token') session.forgetLast();
    store.state = null;
    toast(res.error, 'error');
    render();
  }
}

net.on('state', (s) => {
  store.state = s;
  store.receivedAt = Date.now();
  render();
});

net.on('fx', (e) => {
  playFx(e, store.state?.you?.role);
  current.screen?.fx?.(e);
});

net.on('kicked', ({ reason }) => {
  session.clear();
  store.state = null;
  render();
  toast(reason, 'error');
});

let banner = null;
net.onStatus((status) => {
  if (status === 'online') {
    banner?.remove();
    banner = null;
    resume();
    return;
  }
  if (!banner && store.state) {
    banner = h('div', { class: 'conn-banner', role: 'status' }, h('span', { class: 'dot wait' }), 'انقطع الاتصال… نحاول إعادة الربط دون فقدان تقدمكما');
    document.body.append(banner);
  }
});

document.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
render();
