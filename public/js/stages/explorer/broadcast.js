// Explorer · استوديو البث — watch the ON-AIR lamp, read the room, tune, transmit.
import { h, mount, svg, ask } from '../../dom.js';
import { stageHead } from './common.js';

const INDICATOR = { green: 'أخضر', red: 'أحمر', amber: 'كهرماني' };

function clockSvg(hour, minute) {
  const ha = ((hour % 12) + minute / 60) * 30;
  const ma = minute * 6;
  const nums = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const a = (n * 30 * Math.PI) / 180;
    return `<text x="${50 + Math.sin(a) * 36}" y="${54 + -Math.cos(a) * 36}" text-anchor="middle" font-size="9" fill="#d9c79c" font-family="IBM Plex Mono">${n}</text>`;
  }).join('');
  return svg(`<svg viewBox="0 0 100 100" role="img" aria-label="ساعة الاستوديو">
    <circle cx="50" cy="50" r="47" fill="#14100a" stroke="#6b5838" stroke-width="3"/>
    ${nums}
    <path d="M50 50L50 26" stroke="#f0e2bd" stroke-width="5" stroke-linecap="round" transform="rotate(${ha} 50 50)"/>
    <path d="M50 50L50 16" stroke="#f5a524" stroke-width="2.5" stroke-linecap="round" transform="rotate(${ma} 50 50)"/>
    <circle cx="50" cy="50" r="3.5" fill="#f5a524"/>
  </svg>`);
}

// Timeline of lamp on/off segments for the whole word.
function timeline(pattern) {
  const seq = [];
  pattern.forEach((letter, li) => {
    [...letter].forEach((sym, si) => {
      seq.push({ on: true, u: sym === '.' ? 1 : 3, sym, li });
      if (si < letter.length - 1) seq.push({ on: false, u: 1 });
    });
    seq.push({ on: false, u: li < pattern.length - 1 ? 4 : 10, letterEnd: true, wordEnd: li === pattern.length - 1 });
  });
  return seq;
}

export function create(ctx) {
  let view = null;
  let tenths = 980;
  let slow = false;
  let timer = null;
  let started = false;
  let step = 0;

  const lamp = h('div', { class: 'air-lamp', 'aria-hidden': 'true' }, 'ON AIR');
  const tape = h('div', { class: 'tape', 'aria-label': 'شريط الإشارة' });
  const display = h('div', { class: 'dial-display', 'aria-live': 'polite' });
  const range = h('input', { type: 'range', class: 'dial', step: 1, 'aria-label': 'قرص التردد' });
  range.addEventListener('input', () => setFreq(Number(range.value)));
  const attempts = h('div', { class: 'attempts' });
  const note = h('div', { class: 'ex-note' }, 'المصباح يومض بإشارة. ومضة قصيرة = نقطة، طويلة = شَرطة.');

  const slowBtn = h('button', { class: 'btn small', type: 'button' }, '🐢 إبطاء');
  slowBtn.addEventListener('click', () => {
    slow = !slow;
    slowBtn.textContent = slow ? '⚡ السرعة العادية' : '🐢 إبطاء';
    restart();
  });
  const replayBtn = h('button', { class: 'btn small', type: 'button', onclick: () => restart() }, '⟲ من البداية');

  const facts = h('div', { class: 'studio-facts' });
  const sendBtn = h('button', { class: 'btn primary block', type: 'button' }, '📡 بث على هذا التردد');
  sendBtn.addEventListener('click', async () => {
    if (!(await ask(`البث على ${(tenths / 10).toFixed(1)} ميغاهرتز؟ التردد الخاطئ يكلّف 30 ثانية.`, '📡 بث'))) return;
    sendBtn.disabled = true;
    await ctx.act('transmit', { tenths });
    sendBtn.disabled = false;
  });

  const fine = h(
    'div',
    { class: 'fine' },
    [-10, -1, 1, 10].map((d) => h('button', { class: 'btn small', type: 'button', onclick: () => setFreq(tenths + d) }, `${d > 0 ? '+' : '−'}${Math.abs(d / 10).toFixed(1)}`)),
  );

  const tools = h(
    'div',
    { class: 'ex-tools' },
    h('button', { class: 'btn small', type: 'button', onclick: () => inspect('cassette') }, '🗃 علبة الكاسيت'),
    h('button', { class: 'btn small', type: 'button', onclick: () => inspect('window') }, '🪟 النافذة'),
  );

  async function inspect(id) {
    ctx.sfx.click();
    const res = await ctx.act('inspect', { id });
    if (res.ok && res.text) note.textContent = res.text;
  }

  function setFreq(v) {
    tenths = Math.max(view.dial.min, Math.min(view.dial.max, Math.round(v)));
    range.value = String(tenths);
    display.replaceChildren((tenths / 10).toFixed(1), h('small', {}, ' MHz'));
  }

  function paintTape(upTo) {
    if (!view) return;
    if (view.assist === 'tape') {
      mount(
        tape,
        view.pattern.map((letter, i) => [
          i ? h('span', { class: 'gap' }) : null,
          [...letter].map((s) => h('span', { class: `sym ${s === '.' ? 'dot' : 'dash'}` })),
        ]),
      );
      return;
    }
    // Live tape: only what has blinked for the current letter.
    mount(tape, upTo.map((s) => h('span', { class: `sym ${s === '.' ? 'dot' : 'dash'}` })));
  }

  function restart() {
    clearTimeout(timer);
    step = 0;
    lamp.classList.remove('lit');
    paintTape([]);
    timer = setTimeout(run, 600);
  }

  let live = [];
  function run() {
    if (!view) return;
    const seq = timeline(view.pattern);
    const unit = slow ? 420 : 260;
    const seg = seq[step % seq.length];
    if (step % seq.length === 0) live = [];
    lamp.classList.toggle('lit', seg.on);
    if (seg.on) {
      live.push(seg.sym);
      if (ctx.sfx.enabled) beep(seg.u * unit);
      if (view.assist !== 'tape') paintTape(live);
    } else if (seg.letterEnd) {
      live = [];
      setTimeout(() => view?.assist !== 'tape' && paintTape([]), unit * 2);
    }
    step++;
    timer = setTimeout(run, seg.u * unit);
  }

  let actx = null;
  function beep(ms) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = 760;
      g.gain.setValueAtTime(0.0001, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.04, actx.currentTime + 0.01);
      g.gain.setValueAtTime(0.04, actx.currentTime + ms / 1000 - 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + ms / 1000);
      o.connect(g).connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + ms / 1000 + 0.02);
    } catch {
      /* audio unavailable */
    }
  }

  const el = h(
    'div',
    { class: 'ex-wrap' },
    stageHead('استوديو البث', 'شغّل البكرة على التردد الصحيح. المصباح يرسل كلمة — وشريكك يعرف لغته.'),
    h(
      'div',
      { class: 'console' },
      h('div', { class: 'box' }, h('h3', {}, 'مصباح «على الهواء»'), h('div', { class: 'on-air' }, lamp), tape, h('div', { class: 'ex-tools' }, replayBtn, slowBtn)),
      h('div', { class: 'box' }, h('h3', {}, 'الاستوديو'), facts, h('h3', {}, 'قرص التردد'), display, range, fine, sendBtn, attempts),
    ),
    tools,
    note,
  );

  return {
    el,
    update(v) {
      const firstPattern = !view || view.pattern.join() !== v.pattern.join();
      view = v;
      range.min = String(v.dial.min);
      range.max = String(v.dial.max);
      setFreq(tenths);
      mount(
        facts,
        h('div', { class: 'clock' }, clockSvg(v.hour, v.minute)),
        h('div', { class: 'indicator' }, h('span', { class: `led ${v.indicator}`, 'aria-hidden': 'true' }), `مؤشر الإشارة: ${INDICATOR[v.indicator]}`),
      );
      mount(attempts, v.attempts.length ? `محاولات فاشلة: ${v.attempts.join(' · ')}` : '');
      if (firstPattern || !started) {
        started = true;
        restart();
      }
    },
    destroy() {
      clearTimeout(timer);
      actx?.close?.();
    },
  };
}
