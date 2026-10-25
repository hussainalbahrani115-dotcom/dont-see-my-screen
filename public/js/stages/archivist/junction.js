// Archivist · دليل الصيانة — four panel models, each with ordered rules.
import { h, mount } from '../../dom.js';
import { glyph } from '../../glyphs.js';

export function create() {
  const struck = new Set();
  const body = h('div', { class: 'models' });
  const el = h(
    'article',
    { class: 'paper' },
    h('span', { class: 'stamp' }, 'صيانة'),
    h('h2', {}, 'دليل الصيانة — لوحات التوزيع'),
    h(
      'p',
      { class: 'sub' },
      'حدّد نموذج اللوحة من الرمز المحفور عليها. الأسلاك تُعدّ من الأعلى إلى الأسفل. اقرأ القواعد بالترتيب، ونفّذ أول قاعدة تنطبق فقط. (اضغط على قاعدة لشطبها أثناء التفكير.)',
    ),
    body,
  );

  return {
    el,
    update(v) {
      mount(
        body,
        v.manual.map((m, mi) =>
          h(
            'section',
            { class: 'model' },
            h('div', { class: 'model-head' }, h('div', { class: 'gl' }, m.glyphs.map((g) => glyph(g, '#efe6d0'))), h('b', {}, m.name)),
            h(
              'ol',
              {},
              m.rules.map((r, ri) => {
                const key = `${mi}:${ri}`;
                const li = h('li', { class: struck.has(key) ? 'done' : '' }, `${r.when}: `, h('span', { class: 'then' }, r.then), '.');
                li.addEventListener('click', () => {
                  struck.has(key) ? struck.delete(key) : struck.add(key);
                  li.classList.toggle('done');
                });
                return li;
              }),
            ),
          ),
        ),
      );
    },
  };
}
