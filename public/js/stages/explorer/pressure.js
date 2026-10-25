// Explorer · غرفة الضغط — valves in hand, no gauge. Updated in place so taps
// are never lost to the twice-a-second state stream.
import { h } from '../../dom.js';
import { stageHead } from './common.js';
import { valveSvg, HANDLE_LABEL, COLOR_LABEL } from '../valves.js';

const RUMBLE = ['صمت مريب في الأنابيب…', 'هدوء نسبي', 'هدير متصاعد', 'الأنابيب ترتجف بعنف!'];

export function create(ctx) {
  let buttons = [];
  const valvesBox = h('div', { class: 'valves' });
  const rumbleText = h('div', { class: 'rumble-text' });
  const bars = h('div', { class: 'rumble-bars' }, [0, 1, 2].map(() => h('i')));
  const fill = h('div', { class: 'charge-fill' });
  const chargeText = h('span');
  const countdown = h('div', { class: 'boiler-countdown' });
  const boiler = h(
    'div',
    { class: 'boiler' },
    countdown,
    h('div', { class: 'pipes', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    valvesBox,
    h('div', { class: 'rumble' }, bars, rumbleText),
  );
  const el = h(
    'div',
    { class: 'ex-wrap' },
    stageHead('غرفة الضغط', 'افتح وأغلق الصمامات بأوامر شريكك. هو يرى العدّاد — أنت لا تراه.'),
    boiler,
    h('div', { class: 'charge' }, h('div', { class: 'charge-label' }, '⚡ شحن المرسل', chargeText), h('div', { class: 'charge-track' }, fill)),
    h('div', { class: 'ex-note' }, 'الألوان تتكرر: صِف كل صمام بلونه وشكل مقبضه. الضغط يرتفع وحده، والهزّات تأتي بلا إنذار.'),
  );

  function build(valves) {
    buttons = valves.map((v, i) => {
      const b = h(
        'button',
        { type: 'button', class: 'valve', 'aria-pressed': 'false' },
        h('span', { class: 'valve-art' }, valveSvg(v.color, v.handle, 88)),
        h('b', {}, `${HANDLE_LABEL[v.handle]} ${COLOR_LABEL[v.color]}`),
        h('span', { class: 'state' }),
        h('span', { class: 'steam', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      );
      b.addEventListener('click', async () => {
        ctx.sfx.valve();
        b.classList.toggle('open'); // optimistic; the next state confirms
        await ctx.act('toggle', { index: i });
      });
      return b;
    });
    valvesBox.replaceChildren(...buttons);
  }

  return {
    el,
    update(v) {
      if (buttons.length !== v.valves.length) build(v.valves);
      v.valves.forEach((valve, i) => {
        const b = buttons[i];
        b.classList.toggle('open', valve.open);
        b.setAttribute('aria-pressed', String(valve.open));
        b.querySelector('.state').textContent = valve.open ? 'مفتوح' : 'مغلق';
      });
      boiler.className = `boiler rumble-${v.rumble}`;
      rumbleText.textContent = RUMBLE[v.rumble];
      [...bars.children].forEach((b, i) => b.classList.toggle('on', i < v.rumble));
      fill.style.width = `${(v.progress / v.goal) * 100}%`;
      chargeText.textContent = ` ${v.progress}/${v.goal} ث`;
      countdown.hidden = v.startsInMs <= 0;
      countdown.textContent = `المرجل يشتعل خلال ${Math.ceil(v.startsInMs / 1000)}…`;
    },
  };
}
