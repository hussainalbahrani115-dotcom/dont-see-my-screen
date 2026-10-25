// Archivist · بروتوكول النواة — vote, and type the shutdown code if chosen.
import { h, mount, ask } from '../../dom.js';
import { voteBlock } from '../shared.js';

export function create(ctx) {
  const paper = h('article', { class: 'paper protocol' });
  const actions = h('div', { class: 'paper ar-actions' });
  const el = h('div', { class: 'two-col' }, paper, actions);

  return {
    el,
    update(v) {
      mount(paper, h('span', { class: 'stamp' }, 'طوارئ'), h('h2', {}, v.protocol[0]), v.protocol.slice(1).map((p) => h('p', {}, p)));
      let action = null;
      if (v.phase === 'input' && v.chosen === 'shutdown') {
        const input = h('input', { class: 'input', inputmode: 'numeric', maxlength: 12, placeholder: '00-00-00', style: { direction: 'ltr', background: '#fff', color: '#2a241b', borderColor: '#b8a983' }, 'aria-label': 'رمز الإيقاف' });
        const form = h('form', { style: { display: 'grid', gap: '8px' } }, h('label', {}, 'اطلب من شريكك قراءة الرمز من شاشة النواة:'), input, h('button', { class: 'btn primary', type: 'submit' }, '⏻ أدخل رمز الإيقاف'));
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          await ctx.act('enterCode', { text: input.value });
        });
        action = form;
      } else if (v.phase === 'input' && v.chosen === 'release') {
        action = h('p', {}, 'على شريكك أن ينطق العبارة أمام النواة. أعطه الكلمتين من وثائق سلمى في «الملفات».');
      }
      mount(
        actions,
        h('h2', {}, 'قرار الفريق'),
        voteBlock(ctx, v),
        action,
        v.phase === 'input' ? h('button', { class: 'btn small', type: 'button', style: { background: '#2a241b', color: '#efe6d0' }, onclick: async () => (await ask('التراجع عن القرار؟ يكلّف 20 ثانية.')) && ctx.act('revote', {}) }, '↩ التراجع عن القرار') : null,
      );
    },
  };
}
