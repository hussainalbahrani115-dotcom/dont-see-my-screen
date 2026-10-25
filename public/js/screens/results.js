import { h, mount, brand, fmtClock } from '../dom.js';

const ROLE = { explorer: 'الميداني', archivist: 'المؤرشف' };

export function ResultsScreen(app) {
  const body = h('div', { class: 'results-card' });
  const el = h('div', { class: 'results' }, body);

  function update(state) {
    const g = state.game;
    const r = g.result;
    const e = g.ending;
    el.className = `results ${e.tone}`;
    const me = state.you.id;
    const waiting = state.room.rematch.includes(me);
    const mateWants = state.room.rematch.some((id) => id !== me);

    mount(
      body,
      h('div', { style: { display: 'flex', justifyContent: 'center' } }, brand()),
      h(
        'div',
        { class: 'ending-title' },
        h('div', { class: 'kicker' }, r.won ? 'TRANSMISSION ENDED' : 'SIGNAL LOST'),
        h('h1', {}, e.title),
      ),
      h('p', { class: 'ending-text' }, e.text),
      r.epilogue == null ? h('p', { class: 'epilogue' }, '…الأرشيف يكتب خاتمتكما') : r.epilogue ? h('p', { class: 'epilogue' }, r.epilogue) : null,
      h(
        'div',
        { class: 'score-row' },
        h('div', { class: 'grade', 'aria-label': `التقدير ${r.grade}` }, r.grade),
        h(
          'div',
          { style: { display: 'grid', gap: '10px' } },
          h('div', { class: 'score-big' }, `${r.score}`, h('small', { style: { fontSize: '1rem', color: 'var(--muted)' } }, ` pts ×${r.multiplier}`)),
          h(
            'div',
            { class: 'breakdown' },
            r.breakdown.flatMap((b) => [h('span', {}, b.label), h('span', { class: `v ${b.value < 0 ? 'neg' : b.value > 0 ? 'pos' : ''}` }, b.value > 0 ? `+${b.value}` : b.value)]),
            h('span', {}, 'مدة اللعب'),
            h('span', { class: 'v' }, fmtClock(r.durationMs)),
          ),
        ),
      ),
      r.badges?.length
        ? h(
            'section',
            { class: 'badges' },
            r.badges.map((b) => h('div', { class: `badge-card ${b.tone}`, style: { animationDelay: `${Math.random() * 0.4}s` } }, h('span', { class: 'bi' }, b.icon), h('b', {}, b.title), h('span', {}, b.desc))),
          )
        : null,
      r.deal && r.deal !== 'offered'
        ? h('p', { class: `deal-reveal ${r.deal}` }, r.deal === 'accepted' ? '🤝 كشف الأرشيف: المؤرشف قبل صفقة الصدى في ممر الهوائيات.' : '🛡 المؤرشف رفض صفقة الصدى في ممر الهوائيات.')
        : null,
      h(
        'section',
        { class: 'reveal' },
        h('h3', {}, 'ما فعله الصدى خلف ظهريكما'),
        r.fakes.length
          ? r.fakes.map((f) =>
              h('div', { class: 'fake' }, h('span', { class: `tag ${f.caught ? 'caught' : 'missed'}` }, f.caught ? 'كُشفت' : 'لم تُكشف'), h('span', {}, `إلى ${ROLE[f.to]}: «${f.text}»`)),
            )
          : h('p', { style: { margin: 0, color: 'var(--muted)' } }, 'لم يتدخل الصدى في هذه الجولة.'),
      ),
      h(
        'div',
        { class: 'results-actions' },
        h(
          'button',
          { class: 'btn primary', type: 'button', disabled: waiting, onclick: () => app.call('game:rematch') },
          waiting ? 'بانتظار شريكك…' : mateWants ? 'شريكك يريد جولة أخرى — وافق' : 'جولة جديدة مع نفس الشريك',
        ),
        h('button', { class: 'btn', type: 'button', onclick: () => app.leave() }, 'الصفحة الرئيسية'),
      ),
      h('p', { style: { textAlign: 'center', color: 'var(--dim)', fontSize: '.85rem' } }, 'كل جولة جديدة تولّد ألغازًا وشفرات ومخططات مختلفة. جرّبا تبادل الأدوار.'),
    );
  }

  return { el, update };
}
