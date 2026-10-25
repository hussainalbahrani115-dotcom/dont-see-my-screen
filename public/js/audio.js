// Synthesised sound effects (no audio files). Optional: toggled from the HUD
// and remembered per browser.

let ctx = null;
let enabled = readPref();

function readPref() {
  try {
    return localStorage.getItem('dsms:sound') !== 'off';
  } catch {
    return true;
  }
}

function ac() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', gain = 0.08, when = 0, slide = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur = 0.4, gain = 0.06, filter = 1800) {
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filter;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start();
}

export const sfx = {
  get enabled() {
    return enabled;
  },
  toggle() {
    enabled = !enabled;
    try {
      localStorage.setItem('dsms:sound', enabled ? 'on' : 'off');
    } catch {
      /* private mode */
    }
    if (enabled) sfx.click();
    return enabled;
  },
  unlock() {
    ac();
  },
  click: () => tone(520, 0.05, 'square', 0.03),
  msg: () => { tone(880, 0.08, 'sine', 0.05); tone(1320, 0.1, 'sine', 0.04, 0.08); },
  send: () => tone(660, 0.06, 'triangle', 0.04),
  bump: () => tone(90, 0.15, 'square', 0.06),
  step: () => tone(140 + Math.random() * 40, 0.06, 'triangle', 0.05),
  beepOn: () => tone(740, 0.5, 'sine', 0.045),
  static: (ms = 900) => noise(ms / 1000, 0.08, 2400),
  spark: () => { noise(0.25, 0.15, 4000); tone(1800, 0.15, 'sawtooth', 0.05, 0, -1500); },
  fall: () => { tone(400, 0.7, 'sawtooth', 0.06, 0, -360); noise(0.5, 0.12, 300); },
  penalty: () => { tone(220, 0.2, 'square', 0.06); tone(160, 0.3, 'square', 0.06, 0.18); },
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.06, i * 0.09)),
  item: () => { tone(988, 0.1, 'sine', 0.05); tone(1480, 0.18, 'sine', 0.05, 0.1); },
  echo: () => { tone(110, 1.2, 'sine', 0.07, 0, 40); tone(113, 1.2, 'sine', 0.06, 0.05, -30); },
  good: () => [784, 1175].forEach((f, i) => tone(f, 0.2, 'sine', 0.06, i * 0.12)),
  end: () => [392, 330, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.06, i * 0.3)),
  valve: () => { noise(0.35, 0.05, 5200); tone(300, 0.08, 'square', 0.03); },
  heart: () => { tone(62, 0.12, 'sine', 0.16); tone(55, 0.14, 'sine', 0.13, 0.18); },
  surge: () => { tone(70, 0.9, 'sawtooth', 0.05, 0, 30); noise(0.6, 0.08, 400); },
  ping: () => [1200, 900, 1200, 900].forEach((f, i) => tone(f, 0.09, 'square', 0.05, i * 0.11)),
  caught: () => { tone(900, 0.5, 'sawtooth', 0.06, 0, -800); noise(0.8, 0.14, 700); },
};

// Background drone whose weight follows the tension of the moment, with a
// heartbeat that speeds up near the end or when the Echo is close.
let amb = null;
export const ambience = {
  start() {
    const c = ac();
    if (!c || amb) return;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;
    const oscs = [55, 55.7, 82.4].map((f) => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(gain).connect(c.destination);
    amb = { gain, filter, oscs, tension: 0, beat: null, lastBeat: 0 };
    amb.beat = setInterval(() => {
      if (!enabled || amb.tension < 0.55) return;
      const gap = 1400 - amb.tension * 800;
      if (Date.now() - amb.lastBeat >= gap) {
        amb.lastBeat = Date.now();
        sfx.heart();
      }
    }, 100);
  },
  set(t) {
    if (!amb || !ctx) return;
    amb.tension = Math.max(0, Math.min(1, t));
    const target = enabled ? 0.012 + amb.tension * 0.04 : 0.0001;
    amb.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.6);
    amb.filter.frequency.setTargetAtTime(160 + amb.tension * 520, ctx.currentTime, 0.6);
  },
  stop() {
    if (!amb) return;
    clearInterval(amb.beat);
    amb.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    const dead = amb;
    setTimeout(() => dead.oscs.forEach((o) => o.stop()), 800);
    amb = null;
  },
};
