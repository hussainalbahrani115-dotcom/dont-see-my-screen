import { h, brand, toast } from '../dom.js';

const ENDING_NAMES = { release: 'الوداع', shutdown: 'الصمت', echo_wins: 'البث المستمر', timeout: 'انقطاع الإشارة' };

function savedName() {
  try {
    return localStorage.getItem('dsms:name') || '';
  } catch {
    return '';
  }
}

export function HomeScreen(app) {
  const params = new URLSearchParams(location.search);
  const nameInput = h('input', { class: 'input', id: 'name', maxlength: 20, autocomplete: 'nickname', placeholder: 'مثلًا: سارة', value: savedName() });
  const codeInput = h('input', {
    class: 'input code',
    id: 'code',
    maxlength: 5,
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    placeholder: 'XXXXX',
    value: (params.get('room') || '').toUpperCase().slice(0, 5),
    'aria-label': 'رمز الغرفة',
  });
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  const readName = () => {
    const name = nameInput.value.trim();
    if (name.length < 2) {
      toast('اكتب اسمك أولًا (حرفان على الأقل)', 'error');
      nameInput.focus();
      return null;
    }
    try {
      localStorage.setItem('dsms:name', name);
    } catch {
      /* ignore */
    }
    return name;
  };

  const busy = async (btn, fn) => {
    btn.disabled = true;
    try {
      await fn();
    } finally {
      btn.disabled = false;
    }
  };

  const createBtn = h('button', { class: 'btn primary block', type: 'button' }, 'أنشئ غرفة جديدة');
  createBtn.addEventListener('click', () =>
    busy(createBtn, async () => {
      const name = readName();
      if (name) await app.enter('room:create', { name });
    }),
  );

  const joinBtn = h('button', { class: 'btn', type: 'submit' }, 'انضم');
  const joinForm = h('form', { class: 'join-row' }, codeInput, joinBtn);
  joinForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    busy(joinBtn, async () => {
      const name = readName();
      if (!name) return;
      if (codeInput.value.length !== 5) {
        toast('رمز الغرفة مكوّن من 5 خانات', 'error');
        return;
      }
      await app.enter('room:join', { code: codeInput.value, name });
    });
  });

  const last = app.session.last();
  const resumeBox =
    last && !app.session.get()
      ? h(
          'div',
          { class: 'resume-box' },
          h('span', {}, 'لديك غرفة سابقة: ', h('b', { class: 'mono' }, last.code)),
          h('button', { class: 'btn small', type: 'button', onclick: () => app.enter('room:resume', last) }, 'العودة إليها'),
        )
      : null;

  const board = h('div', { class: 'board' });
  fetch('/api/leaderboard')
    .then((r) => r.json())
    .then(({ results }) => {
      if (!results?.length) return;
      board.append(
        h('h3', {}, 'أفضل الفرق'),
        h(
          'ol',
          {},
          results.slice(0, 5).map((r) =>
            h('li', {}, h('span', { class: 'g' }, r.grade), h('span', {}, `${r.team} · ${ENDING_NAMES[r.ending] || ''}`), h('span', { class: 'mono' }, r.score)),
          ),
        ),
      );
    })
    .catch(() => {});

  const el = h(
    'div',
    { class: 'home' },
    h('header', { class: 'home-top' }, brand(), h('span', { class: 'mono', style: { color: 'var(--dim)', fontSize: '.8rem' } }, 'ECHO STATION · 1987')),
    h(
      'main',
      { class: 'home-main' },
      h(
        'section',
        { class: 'hero' },
        h('div', { class: 'hero-kicker' }, 'A TWO-PLAYER SIGNAL MYSTERY'),
        h('h1', {}, 'لا تشوف ', h('span', { class: 'split' }, 'شاشتي')),
        h(
          'p',
          { class: 'lead' },
          'محطة إذاعية مهجورة عادت تبث أسماءكما. واحد منكما في الداخل يرى كل شيء ولا يفهم شيئًا، والآخر في الخارج يفهم كل شيء ولا يرى شيئًا. ',
          h('b', {}, 'ولا أحد منكما يستطيع النجاة وحده.'),
        ),
        h(
          'div',
          { class: 'split-screens', 'aria-hidden': 'true' },
          h('div', { class: 'screen-card explorer' }, h('h3', {}, 'الميداني'), h('p', {}, 'كشاف، أسلاك، ممرات مظلمة، مصباح يومض.'), h('span', { class: 'eye' }, 'SEES · TOUCHES')),
          h('div', { class: 'screen-card archivist' }, h('h3', {}, 'المؤرشف'), h('p', {}, 'أدلة صيانة، مخططات، كتب شفرة، وثائق سرية.'), h('span', { class: 'eye' }, 'READS · DECODES')),
        ),
      ),
      h(
        'section',
        { class: 'join-card', 'aria-label': 'ابدأ اللعب' },
        h('h2', {}, 'ادخل الإشارة'),
        h('div', { class: 'field' }, h('label', { for: 'name' }, 'اسمك في اللعبة'), nameInput),
        createBtn,
        h('div', { class: 'or' }, 'أو انضم بالرمز'),
        joinForm,
        resumeBox,
        board,
      ),
    ),
    h(
      'section',
      { class: 'how', 'aria-label': 'كيف تلعب' },
      h('div', {}, h('b', {}, '١. غرفة لشخصين'), h('span', {}, 'أنشئ غرفة وأرسل الرمز لشريكك. كل واحد على جهازه.')),
      h('div', {}, h('b', {}, '٢. شاشتان مختلفتان'), h('span', {}, 'لا يرى أحدكما ما يراه الآخر. المحادثة هي جسركما الوحيد.')),
      h('div', {}, h('b', {}, '٣. الصدى يقلّدكما'), h('span', {}, 'رسائل مزيفة تنتحل صوت شريكك. اكشفها بالعلم 🚩.')),
      h('div', {}, h('b', {}, '٤. قرار أخير'), h('span', {}, 'نهايات مختلفة حسب ما جمعتما وما اتفقتما عليه.')),
    ),
  );

  return { el };
}
