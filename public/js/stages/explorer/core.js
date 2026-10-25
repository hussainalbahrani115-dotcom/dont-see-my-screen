// Explorer · النواة — face the Echo, read the shutdown code, speak the phrase.
import { h, mount, ask } from '../../dom.js';
import { stageHead } from './common.js';
import { voteBlock } from '../shared.js';

export function create(ctx) {
  let view = null;
  const linesBox = h('div', { class: 'echo-lines' });
  const right = h('div', { style: { display: 'grid', gap: '14px' } });
  let linesShown = false;
  const el = h(
    'div',
    { class: 'ex-wrap' },
    stageHead('النواة', 'قرار واحد. يجب أن تتفقا عليه.'),
    h('div', { class: 'core-room' }, h('div', { style: { display: 'grid', gap: '16px' } }, h('div', { class: 'orb-wrap' }, h('div', { class: 'orb' })), linesBox), right),
  );

  function render() {
    const v = view;
    if (!linesShown) {
      linesShown = true;
      mount(linesBox, v.lines.map((l, i) => h('p', { style: { animationDelay: `${0.6 + i * 1.8}s` } }, `«${l}»`)));
    }
    let action = null;
    if (v.phase === 'input' && v.chosen === 'release') {
      const input = h('input', { class: 'input', maxlength: 60, placeholder: 'العبارة كاملة…', 'aria-label': 'عبارة التحرير' });
      const form = h('form', { style: { display: 'grid', gap: '8px' } }, h('label', {}, 'انطق العبارة أمام النواة (كلمتان من تسجيلات سلمى لدى شريكك):'), input, h('button', { class: 'btn primary', type: 'submit' }, '🗣 انطق العبارة'));
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        await ctx.act('speak', { text: input.value });
      });
      action = form;
    } else if (v.phase === 'input' && v.chosen === 'shutdown') {
      action = h('div', { class: 'ex-note' }, 'شريكك سيُدخل رمز الإيقاف من الخارج. اقرأ له الرمز من الشاشة رقمًا رقمًا.');
    }
    mount(
      right,
      h('div', {}, h('div', { class: 'section-title' }, 'CORE TERMINAL · رمز الإيقاف'), h('div', { class: 'code-screen' }, v.code)),
      voteBlock(ctx, v),
      action,
      v.phase === 'input' ? h('button', { class: 'btn small ghost', type: 'button', onclick: async () => (await ask('التراجع عن القرار؟ يكلّف 20 ثانية.')) && ctx.act('revote', {}) }, '↩ التراجع عن القرار') : null,
    );
  }

  return {
    el,
    update(v) {
      view = v;
      render();
    },
  };
}
