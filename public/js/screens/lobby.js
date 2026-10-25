import { h, mount, brand, svg, toast, ask } from '../dom.js';

const ROLE_INFO = {
  explorer: {
    title: 'الميداني',
    desc: 'داخل المحطة. يستكشف، يلمس، يقطع الأسلاك، يمشي في الظلام. يرى كل شيء — ولا يملك أي دليل.',
    icon: '<svg viewBox="0 0 48 48" class="role-icon"><circle cx="24" cy="24" r="22" fill="#1d150a" stroke="#f5a524" stroke-width="2"/><path d="M14 30l8-12h4l8 12z" fill="#f5a524" opacity=".3"/><rect x="20" y="12" width="8" height="10" rx="2" fill="#f5a524"/><path d="M18 34h12" stroke="#f5a524" stroke-width="2"/></svg>',
  },
  archivist: {
    title: 'المؤرشف',
    desc: 'في شاحنة الرصد. يملك الأدلة والمخططات وكتب الشفرة. يفهم كل شيء — ولا يرى شيئًا.',
    icon: '<svg viewBox="0 0 48 48" class="role-icon"><circle cx="24" cy="24" r="22" fill="#2a251b" stroke="#efe6d0" stroke-width="2"/><rect x="14" y="12" width="20" height="25" rx="2" fill="#efe6d0"/><path d="M18 18h12M18 23h12M18 28h8" stroke="#2a241b" stroke-width="2"/></svg>',
  },
};

const DIFF = {
  easy: { label: 'هادئ', desc: '42 دقيقة · 6 مراحل · ألغاز أبسط وصدى نادر' },
  normal: { label: 'متوتر', desc: '34 دقيقة · 6 مراحل · الصدى يتدخل في كل مرحلة' },
  hard: { label: 'مرعب', desc: '26 دقيقة · 6 مراحل · صدى أسرع وأكثر جرأة' },
};

export function LobbyScreen(app) {
  const body = h('main', { class: 'lobby-main' });
  const leaveBtn = h('button', { class: 'btn small ghost', type: 'button', onclick: async () => (await ask('مغادرة الغرفة؟', 'مغادرة')) && app.leave() }, 'مغادرة');
  const el = h('div', { class: 'lobby' }, h('header', { class: 'topbar' }, brand(), leaveBtn), body);

  function update(state) {
    const { room, you } = state;
    const me = room.players.find((p) => p.id === you.id);
    const mate = room.players.find((p) => p.id !== you.id);
    const isHost = room.hostId === you.id;
    const link = `${location.origin}/?room=${room.code}`;

    const copy = async (text, msg) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(msg, 'good');
      } catch {
        prompt('انسخ:', text);
      }
    };

    const seat = (role) => {
      const occ = room.players.find((p) => p.role === role);
      const info = ROLE_INFO[role];
      return h(
        'section',
        { class: `seat ${occ?.id === you.id ? 'mine' : ''}` },
        svg(info.icon),
        h('h3', {}, info.title),
        h('p', {}, info.desc),
        occ
          ? h(
              'div',
              { class: 'occupant' },
              h('span', { class: `dot ${occ.connected ? 'on' : 'wait'}` }),
              occ.name,
              occ.id === you.id ? ' (أنت)' : '',
              occ.ready ? h('span', { class: 'ready-tag' }, 'جاهز ✓') : null,
            )
          : h('div', { class: 'occupant empty' }, 'بانتظار لاعب…'),
        occ?.id !== you.id
          ? h('button', { class: 'btn small', type: 'button', onclick: () => app.call('lobby:update', { role }) }, mate ? 'تبادل الأدوار' : 'اختر هذا الدور')
          : null,
      );
    };

    const diffSeg = h(
      'div',
      { class: 'seg', role: 'radiogroup', 'aria-label': 'الصعوبة' },
      Object.entries(DIFF).map(([k, d]) =>
        h(
          'button',
          {
            type: 'button',
            class: room.difficulty === k ? 'on' : '',
            role: 'radio',
            'aria-checked': String(room.difficulty === k),
            disabled: !isHost,
            onclick: () => app.call('lobby:update', { difficulty: k }),
          },
          d.label,
        ),
      ),
    );

    let status;
    if (!mate) status = 'شارك الرمز مع شريكك. اللعبة تبدأ عندما ينضم ويستعد كلاكما.';
    else if (!me.ready) status = 'عندما تكون جاهزًا، اضغط الزر. تحدّثا قبل البدء: اتفقا على كلمة سر ضد الصدى.';
    else if (!mate.ready) status = `بانتظار ${mate.name}…`;
    else status = 'جارٍ البدء…';

    mount(
      body,
      h(
        'div',
        { class: 'room-code-box' },
        h('div', { class: 'label' }, 'رمز الغرفة'),
        h('div', { class: 'room-code', 'aria-label': `رمز الغرفة ${room.code.split('').join(' ')}` }, room.code),
        h(
          'div',
          { class: 'share-row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => copy(room.code, 'نُسخ الرمز') }, 'نسخ الرمز'),
          h('button', { class: 'btn small', type: 'button', onclick: () => copy(link, 'نُسخ رابط الدعوة') }, 'نسخ رابط الدعوة'),
        ),
      ),
      room.lastResult
        ? h('p', { class: 'lobby-status', style: { textAlign: 'center' } }, `الجولة السابقة: ${room.lastResult.score} نقطة · تقدير ${room.lastResult.grade}. تبادلا الأدوار هذه المرة؟`)
        : null,
      h('div', { class: 'seats' }, seat('explorer'), seat('archivist')),
      h(
        'div',
        { class: 'lobby-actions' },
        h('div', {}, diffSeg),
        h('div', { class: 'diff-desc' }, DIFF[room.difficulty].desc, isHost ? '' : ' · يحددها صاحب الغرفة'),
        h(
          'button',
          {
            class: `btn ${me.ready ? '' : 'primary'}`,
            type: 'button',
            style: { minWidth: '220px' },
            onclick: () => app.call('lobby:update', { ready: !me.ready }),
          },
          me.ready ? 'إلغاء الاستعداد' : 'أنا جاهز',
        ),
        h('div', { class: 'lobby-status' }, status),
      ),
    );
  }

  return { el, update };
}
