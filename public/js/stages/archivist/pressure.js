// Archivist · عدّاد الضغط — live gauge, trend line and the valve chart.
import { h, svg, mount } from '../../dom.js';
import { valveSvg } from '../valves.js';

const angle = (p) => -90 + (p / 100) * 180;

function arc(from, to, r) {
  const pt = (p) => {
    const a = ((angle(p) - 90) * Math.PI) / 180;
    return [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
  };
  const [x1, y1] = pt(from);
  const [x2, y2] = pt(to);
  return `M${x1} ${y1}A${r} ${r} 0 0 1 ${x2} ${y2}`;
}

export function create() {
  let band = null;
  const gauge = svg(`<svg viewBox="0 0 300 170" class="gauge" role="img" aria-label="عدّاد الضغط">
    <path d="${arc(0, 100, 120)}" stroke="#d3c49e" stroke-width="18" fill="none"/>
    <path class="band" stroke="#3aa864" stroke-width="18" fill="none"/>
    <g font-family="IBM Plex Mono" font-size="11" fill="#6b5f4b" text-anchor="middle">
      <text x="30" y="160">0</text><text x="150" y="22">50</text><text x="270" y="160">100</text>
    </g>
    <g class="needle"><path d="M150 150L150 42" stroke="#b3261e" stroke-width="5" stroke-linecap="round"/></g>
    <circle cx="150" cy="150" r="10" fill="#2a241b"/>
  </svg>`);
  const reading = h('div', { class: 'gauge-reading' });
  const warn = h('div', { class: 'gauge-warn', role: 'alert' });
  const spark = svg('<svg viewBox="0 0 300 70" class="spark" preserveAspectRatio="none"><rect class="sband" x="0" width="300" fill="rgba(58,168,100,.18)"/><path class="sline" fill="none" stroke="#2a241b" stroke-width="2"/></svg>');
  const fill = h('div', { class: 'charge-fill paper-fill' });
  const chargeText = h('span');
  const countdown = h('div', { class: 'boiler-countdown paper-count' });
  const chart = h('div', { class: 'valve-chart' });

  const el = h(
    'div',
    { class: 'two-col' },
    h(
      'article',
      { class: 'paper' },
      h('span', { class: 'stamp' }, 'مباشر'),
      h('h2', {}, 'عدّاد ضغط المرجل'),
      h('p', { class: 'sub' }, 'أبقِ الإبرة داخل المنطقة الخضراء حتى يكتمل الشحن. خارجها 6 ثوانٍ = انفجار أو توقف.'),
      countdown,
      gauge,
      reading,
      warn,
      h('div', { class: 'section-title', style: { color: '#6b5f4b' } }, 'TREND · آخر 30 ثانية'),
      spark,
      h('div', { class: 'charge' }, h('div', { class: 'charge-label' }, '⚡ شحن المرسل', chargeText), h('div', { class: 'charge-track paper-track' }, fill)),
    ),
    h('article', { class: 'paper' }, h('span', { class: 'stamp' }, 'صمامات'), h('h2', {}, 'جدول الصمامات'), h('p', { class: 'sub' }, 'شريكك يرى الصمامات فقط. طابقها باللون وشكل المقبض — بعضها هنا ليس في غرفته.'), chart),
  );

  return {
    el,
    update(v) {
      if (!band) {
        band = true;
        gauge.querySelector('.band').setAttribute('d', arc(v.lo, v.hi, 120));
        mount(
          chart,
          v.manual.map((m) => h('div', { class: 'valve-row' }, valveSvg(m.color, m.handle, 44), h('b', {}, m.name), h('span', {}, m.effect))),
        );
      }
      gauge.querySelector('.needle').setAttribute('transform', `rotate(${angle(v.p)} 150 150)`);
      const inBand = v.p >= v.lo && v.p <= v.hi;
      reading.textContent = `${v.p.toFixed(1)}  ·  المنطقة الآمنة ${v.lo}–${v.hi}`;
      reading.className = `gauge-reading ${inBand ? 'ok' : 'bad'}`;
      warn.hidden = !v.out;
      if (v.out) warn.textContent = `${v.out.side === 'high' ? '▲ ضغط مرتفع' : '▼ ضغط منخفض'} — ${v.out.sec}/${v.out.limit} ثوانٍ قبل ${v.out.side === 'high' ? 'الانفجار' : 'توقف المضخة'}`;
      const pts = v.hist.slice(-60);
      const y = (p) => 70 - (p / 100) * 70;
      spark.querySelector('.sband').setAttribute('y', y(v.hi));
      spark.querySelector('.sband').setAttribute('height', y(v.lo) - y(v.hi));
      spark.querySelector('.sline').setAttribute('d', pts.map((p, i) => `${i ? 'L' : 'M'}${(i / 59) * 300} ${y(p)}`).join(''));
      fill.style.width = `${(v.progress / v.goal) * 100}%`;
      chargeText.textContent = ` ${v.progress}/${v.goal} ث`;
      countdown.hidden = v.startsInMs <= 0;
      countdown.textContent = `المرجل يشتعل خلال ${Math.ceil(v.startsInMs / 1000)}… طابقا الصمامات الآن`;
    },
  };
}
