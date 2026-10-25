// Archivist · كتاب الشفرة + دليل الترددات — with a tap-to-decode helper.
import { h, mount } from '../../dom.js';

function patternEl(p) {
  return h('span', { class: 'pattern', 'aria-label': p.replaceAll('.', 'نقطة ').replaceAll('-', 'شرطة ') }, [...p].map((s) => h('i', { class: s === '.' ? 'dot' : 'dash' })));
}

export function create(ctx) {
  let view = null;
  let buf = '';
  let word = '';
  const book = h('div', { class: 'codebook' });
  const out = h('span', { class: 'out' });
  const bufEl = h('span', { class: 'pattern' });
  const wordEl = h('b', { style: { fontSize: '1.5rem', minWidth: '3em', display: 'inline-block' } });
  const dirBox = h('div');

  const press = (s) => {
    ctx.sfx.click();
    buf = (buf + s).slice(0, 4);
    paint();
  };
  const commit = () => {
    const hit = view.codebook.find((e) => e.p === buf);
    if (hit) word += hit.l;
    buf = '';
    paint();
  };
  const decoder = h(
    'div',
    { class: 'decoder' },
    h('button', { class: 'btn small', type: 'button', onclick: () => press('.') }, '• نقطة'),
    h('button', { class: 'btn small', type: 'button', onclick: () => press('-') }, '— شرطة'),
    bufEl,
    out,
    h('button', { class: 'btn small', type: 'button', onclick: commit }, '+ أضف الحرف'),
    h('button', { class: 'btn small', type: 'button', onclick: () => { buf = ''; paint(); } }, '⌫'),
    h('span', {}, 'الكلمة: '),
    wordEl,
    h('button', { class: 'btn small', type: 'button', onclick: () => { word = ''; buf = ''; paint(); } }, 'مسح'),
  );

  function paint() {
    if (!view) return;
    mount(bufEl, [...buf].map((s) => h('i', { class: s === '.' ? 'dot' : 'dash' })));
    const hit = view.codebook.find((e) => e.p === buf);
    out.textContent = buf ? (hit ? `= ${hit.l}` : '= ؟') : '';
    wordEl.textContent = word || '—';
    for (const node of book.children) node.classList.toggle('hit', !!buf && node.dataset.p === buf);
  }

  const el = h(
    'div',
    { class: 'two-col' },
    h(
      'article',
      { class: 'paper' },
      h('span', { class: 'stamp' }, 'شفرة'),
      h('h2', {}, 'كتاب الشفرة الداخلية'),
      h('p', { class: 'sub' }, 'لغة المحطة الخاصة — ليست مورس. كل حرف نمط من نقاط وشرطات. استخدم الأداة أسفل الجدول لتفكّ ما يمليه شريكك.'),
      book,
      decoder,
    ),
    h('article', { class: 'paper' }, h('span', { class: 'stamp' }, 'ترددات'), h('h2', {}, 'دليل الترددات'), dirBox),
  );

  return {
    el,
    update(v) {
      view = v;
      mount(book, v.codebook.map((e) => h('div', { class: 'code-entry', 'data-p': e.p }, h('span', { class: 'l' }, e.l), patternEl(e.p))));
      mount(
        dirBox,
        h('p', { class: 'sub' }, 'لكل كلمة تردد أساسي. ثم طبّق كل التعديلات التي تنطبق شروطها (قد ينطبق أكثر من تعديل، وقد لا ينطبق أي منها).'),
        h(
          'table',
          { class: 'freq-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'الكلمة'), h('th', {}, 'التردد الأساسي (MHz)'))),
          h('tbody', {}, v.directory.map((d) => h('tr', {}, h('td', {}, d.word), h('td', { class: 'f' }, d.freq)))),
        ),
        h('h3', { style: { marginTop: '16px' } }, 'تعديلات المعايرة'),
        h('ol', { class: 'mods' }, v.mods.map((m) => h('li', {}, m))),
      );
      paint();
    },
  };
}
