import { h } from '../dom.js';

const CHOICES = {
  release: { title: 'التحرير', desc: 'إنهاء البث بإرادة سلمى. يحتاج العبارة الكاملة.' },
  shutdown: { title: 'الإطفاء', desc: 'إسكات الصدى إلى الأبد. يحتاج رمز الإيقاف.' },
};

// Secret ballot: you see your own vote and whether your partner has voted.
export function voteBlock(ctx, v) {
  const status =
    v.phase === 'input'
      ? `القرار: ${CHOICES[v.chosen].title}`
      : v.myVote && v.partnerVoted
        ? '…'
        : v.myVote
          ? 'صوّتّ. بانتظار تصويت شريكك (تصويته سري حتى يكتمل).'
          : v.partnerVoted
            ? 'شريكك صوّت بالفعل — لكنك لا تعرف بماذا. تأكدا في المحادثة.'
            : 'التصويت سري. تحدّثا أولًا.';
  return h(
    'div',
    { style: { display: 'grid', gap: '10px' } },
    h(
      'div',
      { class: 'vote-row' },
      Object.entries(CHOICES).map(([k, c]) =>
        h(
          'button',
          {
            type: 'button',
            class: `vote-card ${(v.phase === 'input' ? v.chosen : v.myVote) === k ? 'on' : ''}`,
            disabled: v.phase !== 'vote',
            'aria-pressed': String(v.myVote === k),
            onclick: () => ctx.act('vote', { choice: k }),
          },
          h('b', {}, c.title),
          h('span', {}, c.desc),
        ),
      ),
    ),
    h('div', { class: 'vote-status' }, status),
    v.mismatches ? h('div', { class: 'vote-status', style: { color: 'var(--danger)' } }, 'اختلفتما مرة. اختلاف آخر يعني أن النواة تقرر عنكما.') : null,
    v.wrongInputs ? h('div', { class: 'vote-status', style: { color: 'var(--danger)' } }, `محاولات خاطئة: ${v.wrongInputs}/3`) : null,
  );
}
