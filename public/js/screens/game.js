// In-game shell shared by both roles: HUD, timer, chat (with Echo flagging),
// log, hints, intro and pause overlays. The stage area is delegated to the
// role/stage component.

import { h, mount, fmtClock, fmtTime, toast, sameJson, ask } from '../dom.js';
import * as exJunction from '../stages/explorer/junction.js';
import * as exArchive from '../stages/explorer/archive.js';
import * as exBroadcast from '../stages/explorer/broadcast.js';
import * as exCore from '../stages/explorer/core.js';
import * as exPressure from '../stages/explorer/pressure.js';
import * as exChase from '../stages/explorer/chase.js';
import * as arPressure from '../stages/archivist/pressure.js';
import * as arChase from '../stages/archivist/chase.js';
import { ambience } from '../audio.js';
import * as arJunction from '../stages/archivist/junction.js';
import * as arArchive from '../stages/archivist/archive.js';
import * as arBroadcast from '../stages/archivist/broadcast.js';
import * as arCore from '../stages/archivist/core.js';
import { renderDocs } from '../stages/archivist/docs.js';

const STAGES = {
  explorer: { junction: exJunction, archive: exArchive, pressure: exPressure, broadcast: exBroadcast, chase: exChase, core: exCore },
  archivist: { junction: arJunction, archive: arArchive, pressure: arPressure, broadcast: arBroadcast, chase: arChase, core: arCore },
};
const ROLE_LABEL = { explorer: 'الميداني', archivist: 'المؤرشف' };
const QUICK = ['تمام ✔', 'أعد من فضلك', 'انتظر لحظة', 'صِف لي ما تراه', 'هل أرسلت الرسالة السابقة فعلًا؟'];

export function GameScreen(app) {
  const role = app.state.you.role;
  const gameId = app.state.game.id;
  let state = app.state;
  let stage = null; // { id, comp }
  let sideTab = 'chat';
  let sideOpen = false;
  let unread = 0;
  let seenChat = new Set();
  let lastHints = -1;
  let deskTab = 'stage';
  let docsSeen = Number(sessionStorage.getItem(`dsms:docs:${gameId}`) || 0);
  let lastDocs = null;
  let lastLogs = null;
  let interludeShown = null;

  // ---------------------------------------------------------- HUD
  const timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': 'الوقت المتبقي' }, '--:--');
  const pipsEl = h('nav', { class: 'stage-pips', 'aria-label': 'المراحل' });
  const soundBtn = h('button', { class: 'icon-btn', type: 'button', title: 'الصوت', 'aria-label': 'تشغيل/إيقاف الصوت' }, app.sfx.enabled ? '🔊' : '🔇');
  soundBtn.addEventListener('click', () => {
    soundBtn.textContent = app.sfx.toggle() ? '🔊' : '🔇';
    ambience.start();
  });
  const leaveBtn = h('button', { class: 'icon-btn', type: 'button', title: 'مغادرة', 'aria-label': 'مغادرة الغرفة' }, '⎋');
  leaveBtn.addEventListener('click', async () => (await ask('مغادرة الجولة؟ ستتوقف اللعبة حتى يعود أحد إلى مقعدك.', 'مغادرة')) && app.leave());
  const pingBtn = h('button', { class: 'icon-btn ping-btn', type: 'button', title: 'نداء عاجل لشريكك', 'aria-label': 'نداء عاجل لشريكك' }, '📣');
  pingBtn.addEventListener('click', async () => {
    const res = await app.call('game:ping');
    if (res.ok) toast('📣 أرسلت نداءً عاجلًا لشريكك', 'good');
  });
  const hud = h(
    'header',
    { class: 'hud' },
    h('div', { class: 'role-chip' }, role === 'explorer' ? '🔦' : '🗂', h('span', { class: 'rn' }, ROLE_LABEL[role])),
    pipsEl,
    h('div', { class: 'hud-right' }, timerEl, pingBtn, soundBtn, leaveBtn),
  );

  // ---------------------------------------------------------- stage area
  const stageHost = h('div');
  const deskTabs = h('div', { class: 'desk-tabs', role: 'tablist' });
  const docsHost = h('div', { class: 'doc-list' });
  const dealHost = h('div');
  const stageArea = h('main', { class: 'stage-area', id: 'stage' }, role === 'archivist' ? h('div', { class: 'ar-wrap' }, dealHost, deskTabs, stageHost, docsHost) : stageHost);

  // ---------------------------------------------------------- side panel
  const chatList = h('div', { class: 'chat-list', role: 'log', 'aria-label': 'المحادثة' });
  const chatInput = h('input', { class: 'input', maxlength: 280, placeholder: 'اكتب لشريكك…', autocomplete: 'off', 'aria-label': 'رسالة' });
  const chatForm = h('form', { class: 'chat-form' }, chatInput, h('button', { class: 'btn primary', type: 'submit' }, 'أرسل'));
  chatForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    app.sfx.send();
    const res = await app.call('chat:send', { text });
    if (!res.ok) chatInput.value = text;
  });
  const quick = h(
    'div',
    { class: 'quick' },
    QUICK.map((q) =>
      h('button', { type: 'button', onclick: () => { chatInput.value = q; chatInput.focus(); } }, q),
    ),
  );
  const chatPanel = h('section', { class: 'side-panel chat on' }, chatList, quick, chatForm);
  const logPanel = h('section', { class: 'side-panel scroll-pane' });
  const hintPanel = h('section', { class: 'side-panel scroll-pane' });
  const tabBtns = {};
  const chatBadge = h('span', { class: 'badge', hidden: true });
  const tabs = h(
    'div',
    { class: 'side-tabs', role: 'tablist' },
    [
      ['chat', 'المحادثة'],
      ['log', role === 'explorer' ? 'السجل والحقيبة' : 'السجل'],
      ['hints', 'التلميحات'],
    ].map(([k, label]) => {
      const b = h('button', { type: 'button', role: 'tab', onclick: () => setSideTab(k) }, label, k === 'chat' ? chatBadge : null);
      tabBtns[k] = b;
      return b;
    }),
  );
  const side = h('aside', { class: 'side' }, tabs, h('div', { style: { minHeight: 0, display: 'grid' } }, chatPanel, logPanel, hintPanel));
  const mobileBadge = h('span', { class: 'badge', hidden: true });
  const mobileBtn = h('button', { class: 'mobile-chat-btn', type: 'button', 'aria-label': 'المحادثة' }, '💬', mobileBadge);
  mobileBtn.addEventListener('click', () => {
    sideOpen = !sideOpen;
    side.classList.toggle('open', sideOpen);
    mobileBtn.firstChild.textContent = sideOpen ? '✕' : '💬';
    if (sideOpen && sideTab === 'chat') clearUnread();
  });

  const overlayHost = h('div');
  const el = h('div', { class: `game role-${role}` }, hud, h('div', { class: 'game-body' }, stageArea, side, mobileBtn), overlayHost);
  document.body.className = `role-${role}`;
  // Browsers only allow audio after a gesture (also covers resumed sessions).
  el.addEventListener('pointerdown', () => ambience.start(), { once: true });

  function setSideTab(k) {
    sideTab = k;
    for (const [key, b] of Object.entries(tabBtns)) b.classList.toggle('on', key === k);
    chatPanel.classList.toggle('on', k === 'chat');
    logPanel.classList.toggle('on', k === 'log');
    hintPanel.classList.toggle('on', k === 'hints');
    if (k === 'chat') {
      clearUnread();
      chatList.scrollTop = chatList.scrollHeight;
    }
  }
  setSideTab('chat');

  function chatVisible() {
    return sideTab === 'chat' && (sideOpen || window.matchMedia('(min-width: 981px)').matches);
  }
  function clearUnread() {
    unread = 0;
    chatBadge.hidden = mobileBadge.hidden = true;
  }

  // ---------------------------------------------------------- timer
  const timerLoop = setInterval(paintTimer, 250);
  function paintTimer() {
    const g = state.game;
    if (!g) return;
    const ms = g.paused ? g.remainingMs : g.remainingMs - app.sinceSnapshot();
    timerEl.textContent = fmtClock(ms);
    timerEl.classList.toggle('low', !g.paused && ms < 120_000);
    timerEl.classList.toggle('paused', g.paused);
    const progress = g.stageIndex / Math.max(1, g.stageTitles.length - 1);
    const late = ms < 180_000 ? 0.45 : ms < 420_000 ? 0.2 : 0;
    ambience.set(g.paused ? 0 : 0.1 + progress * 0.3 + late + (stage?.comp.tension?.() || 0) * 0.45);
  }

  // ---------------------------------------------------------- renderers
  function renderPips(g) {
    mount(
      pipsEl,
      g.stageTitles.map((t, i) =>
        h('span', { class: `pip ${i < g.stageIndex ? 'done' : i === g.stageIndex ? 'now' : ''}`, title: t }, h('i'), h('span', { class: 't' }, t)),
      ),
    );
  }

  function msgEl(m) {
    const cls = ['msg', m.from];
    if (m.flag === 'echo') cls.push('echo');
    if (m.flag === 'real') cls.push('real');
    const who = m.from === 'system' ? null : h('div', { class: 'who' }, h('span', {}, m.from === 'me' ? 'أنت' : ROLE_LABEL[role === 'explorer' ? 'archivist' : 'explorer']), h('time', {}, fmtTime(m.at)));
    const flagBtn = m.canFlag
      ? h(
          'button',
          {
            class: 'flag-btn',
            type: 'button',
            title: 'هذه ليست من شريكي — إنه الصدى',
            'aria-label': 'تبليغ: رسالة من الصدى',
            onclick: async () => {
              if (!(await ask('هل تظن أن هذه الرسالة من الصدى وليست من شريكك؟\nالتخمين الصحيح +100، والخاطئ −50.', '🚩 إنه الصدى'))) return;
              await app.call('chat:flag', { id: m.id });
            },
          },
          '🚩',
        )
      : null;
    if (who && flagBtn) who.append(flagBtn);
    const verdict = m.flag === 'echo' ? h('div', { class: 'verdict' }, '⚠ رسالة دخيلة — الصدى انتحل الصوت') : m.flag === 'real' ? h('div', { class: 'verdict' }, 'رسالة حقيقية (اتُّهمت خطأً)') : null;
    return h('div', { class: cls.join(' '), 'data-key': `${m.id}:${m.flag}:${m.canFlag}` }, who, h('div', { class: 'text' }, m.text), verdict);
  }

  function renderChat(chat) {
    const nearBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 80;
    const existing = new Map([...chatList.children].map((n) => [Number(n.dataset.key.split(':')[0]), n]));
    let fresh = 0;
    for (const m of chat) {
      const node = existing.get(m.id);
      const key = `${m.id}:${m.flag}:${m.canFlag}`;
      if (!node) {
        chatList.append(msgEl(m));
        if (!seenChat.has(m.id) && m.from === 'partner') fresh++;
      } else if (node.dataset.key !== key) node.replaceWith(msgEl(m));
      seenChat.add(m.id);
    }
    if (nearBottom || fresh) chatList.scrollTop = chatList.scrollHeight;
    if (fresh && !chatVisible()) {
      unread += fresh;
      chatBadge.textContent = mobileBadge.textContent = unread;
      chatBadge.hidden = mobileBadge.hidden = false;
    }
  }

  function renderLog(g) {
    const key = JSON.stringify([g.logs.length, g.logs.at(-1)?.at, g.inventory?.length, g.fragmentsFound]);
    if (key === lastLogs) return;
    lastLogs = key;
    const items = [...g.logs].reverse().map((l) => h('div', { class: 'log-item' }, h('time', {}, fmtTime(l.at)), l.text));
    const inv =
      role === 'explorer'
        ? [
            h('div', { class: 'section-title' }, 'INVENTORY · الحقيبة'),
            g.inventory.length
              ? g.inventory.map((i) => h('div', { class: 'inv-item' }, h('span', { style: { fontSize: '1.4rem' } }, i.id === 'reel' ? '🎞' : '📄'), h('div', {}, h('b', {}, i.name), h('span', {}, i.desc))))
              : h('div', { class: 'log-item' }, 'الحقيبة فارغة. افحص ما حولك — بعض الأشياء تكشف قصة المحطة.'),
          ]
        : [h('div', { class: 'section-title' }, `RECOVERED · ${g.fragmentsFound}/3 من أوراق سلمى`)];
    mount(logPanel, inv, h('div', { class: 'section-title' }, 'LOG · السجل'), items);
  }

  let hintCountdown = null;
  function renderHints(g) {
    const cards = g.hints.map((x) => h('div', { class: 'hint-card' }, h('div', { class: 'tier' }, `HINT ${x.tier}/3`), x.text));
    const btn = h('button', { class: 'btn small primary', type: 'button' }, 'اطلب تلميحًا');
    const note = h('div');
    const cta = h('div', { class: 'hint-cta' }, note, btn);
    const refresh = () => {
      const wait = g.nextHintInMs == null ? null : g.nextHintInMs - (g.paused ? 0 : app.sinceSnapshot());
      if (g.hintsLeft <= 0) {
        note.textContent = 'استخدمت كل تلميحات هذه المرحلة.';
        btn.disabled = true;
      } else if (wait > 0) {
        note.textContent = `التلميح التالي يُفتح بعد ${Math.ceil(wait / 1000)} ثانية (الأخطاء تفتحه أسرع).`;
        btn.disabled = true;
      } else {
        note.textContent = `متبقٍ ${g.hintsLeft} · كل تلميح يكلّف 60 نقطة. التلميحات مخصصة لدورك فقط.`;
        btn.disabled = false;
      }
    };
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await app.call('game:hint');
      if (res.ok) toast('وصل تلميح جديد', 'good');
    });
    refresh();
    clearInterval(hintCountdown);
    hintCountdown = setInterval(refresh, 1000);
    mount(hintPanel, cards.length ? cards : h('div', { class: 'log-item' }, 'لا تلميحات بعد. جرّبا التواصل أولًا — معظم الحلول في سؤال واحد صحيح.'), cta);
  }

  function renderStage(g) {
    if (!stage || stage.id !== g.stageId) {
      stage?.comp.destroy?.();
      const mod = STAGES[role][g.stageId];
      const comp = mod.create({ act: app.act, sfx: app.sfx, role, names: g.names, gameId });
      stage = { id: g.stageId, comp, view: null };
      mount(stageHost, comp.el);
      stageArea.scrollTop = 0;
    }
    if (!sameJson(stage.view, g.stage)) {
      stage.view = g.stage;
      stage.comp.update(g.stage, g);
    }
  }

  function renderDesk(g) {
    if (role !== 'archivist') return;
    const unseen = Math.max(0, g.docs.length - docsSeen);
    const tab = (k, label, badge) =>
      h('button', { type: 'button', role: 'tab', class: deskTab === k ? 'on' : '', onclick: () => { deskTab = k; renderDesk(state.game); } }, label, badge ? h('span', { class: 'badge' }, badge) : null);
    mount(deskTabs, tab('stage', `📂 ${g.stageTitle}`), tab('docs', '🗃 الملفات', deskTab === 'docs' ? 0 : unseen));
    stageHost.hidden = deskTab !== 'stage';
    docsHost.hidden = deskTab !== 'docs';
    if (deskTab === 'docs') {
      docsSeen = g.docs.length;
      sessionStorage.setItem(`dsms:docs:${gameId}`, String(docsSeen));
    }
    if (!sameJson(lastDocs, g.docs)) {
      lastDocs = g.docs;
      renderDocs(docsHost, g.docs);
    }
  }

  function renderDeal(g) {
    if (role !== 'archivist') return;
    if (g.deal !== 'offered') {
      dealHost.replaceChildren();
      return;
    }
    if (dealHost.firstChild) return;
    const answer = async (accept) => {
      if (accept && !(await ask('قبول صفقة الصدى؟ سيبطئ في هذا الممر، لكن لها ثمنًا لاحقًا… وشريكك لن يعرف إلا إن أخبرته.', 'أقبل'))) return;
      await app.call('game:deal', { accept });
    };
    mount(
      dealHost,
      h(
        'section',
        { class: 'deal-card', role: 'alertdialog', 'aria-label': 'عرض من الصدى' },
        h('div', { class: 'kicker' }, 'PRIVATE CHANNEL · قناة خاصة'),
        h('h3', {}, 'صوت في سماعتك فقط'),
        h('p', {}, '«شريكك لا يسمعني الآن. أنت فقط.»'),
        h('p', {}, '«أعطني صوتك — فقط أن أتعلمه — وسأمشي ببطء في هذا الممر.»'),
        h('p', {}, '«لن يعرف أحد. إلا إن أخبرته أنت.»'),
        h('div', { class: 'deal-actions' }, h('button', { class: 'btn danger', type: 'button', onclick: () => answer(true) }, '🤝 أقبل'), h('button', { class: 'btn primary', type: 'button', onclick: () => answer(false) }, '🛡 أرفض')),
      ),
    );
  }

  function showInterlude(g) {
    if (!g.interlude || interludeShown === g.stageId) return;
    interludeShown = g.stageId;
    const key = `dsms:interlude:${gameId}:${g.stageId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    const i = g.interlude;
    const close = () => card.remove();
    const card = h(
      'div',
      { class: 'interlude', role: 'dialog', 'aria-modal': 'true', onclick: close },
      h(
        'div',
        { class: 'interlude-inner' },
        h('div', { class: 'kicker' }, i.kicker),
        h('h2', {}, i.title),
        i.lines.map((l, n) => h('p', { style: { animationDelay: `${0.5 + n * 1.1}s` } }, l)),
        h('div', { class: 'skip' }, 'اضغط في أي مكان للمتابعة'),
      ),
    );
    document.body.append(card);
    setTimeout(close, 6500 + i.lines.length * 900);
  }

  // ---------------------------------------------------------- overlays
  // Overlays are rebuilt only when their kind changes, so clicks are never
  // lost to the frequent state updates of real-time stages.
  let overlayKind = null;
  function renderOverlays(s) {
    const g = s.game;
    const introKey = `dsms:intro:${gameId}`;
    let seen = false;
    try {
      seen = sessionStorage.getItem(introKey);
    } catch {
      /* ignore */
    }
    if (!seen) {
      if (overlayKind === 'intro') return;
      overlayKind = 'intro';
      const i = g.intro;
      mount(
        overlayHost,
        h(
          'div',
          { class: 'overlay' },
          h(
            'div',
            { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
            h('div', { class: 'kicker' }, 'ECHO STATION · BRIEFING'),
            h('h2', {}, i.title),
            h('p', {}, i.common),
            h('p', {}, i.body),
            h('div', { class: 'rule' }, i.rule),
            h('div', { class: 'warn' }, '⚠ الصدى يقلّد الأصوات: قد تصلك رسائل تبدو من شريكك وليست منه. اتفقا على طريقة للتحقق، واضغطا 🚩 على أي رسالة مشبوهة.'),
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  try {
                    sessionStorage.setItem(introKey, '1');
                  } catch {
                    /* ignore */
                  }
                  app.sfx.unlock();
                  ambience.start();
                  overlayKind = null;
                  overlayHost.replaceChildren();
                  renderOverlays(state);
                  showInterlude(state.game);
                },
              },
              'ادخل المحطة',
            ),
          ),
        ),
      );
      return;
    }
    if (g.paused) {
      const mate = s.room.players.find((p) => p.id !== s.you.id);
      const kind = `pause:${mate?.name ?? ''}`;
      if (overlayKind === kind) return;
      overlayKind = kind;
      mount(
        overlayHost,
        h(
          'div',
          { class: 'overlay' },
          h(
            'div',
            { class: 'modal pause-box' },
            h('div', { class: 'spinner' }),
            h('h2', {}, 'الإشارة معلّقة'),
            h('p', {}, mate ? `انقطع اتصال ${mate.name}. المؤقت متوقف ولن تخسرا أي تقدم.` : 'شريكك غادر. يمكن لأي لاعب الانضمام بالرمز ليأخذ مقعده.'),
            h('p', { class: 'mono', style: { color: 'var(--amber)' } }, s.room.code),
            h('button', { class: 'btn small ghost', type: 'button', onclick: () => app.leave() }, 'مغادرة الغرفة'),
          ),
        ),
      );
      return;
    }
    if (overlayKind === null) return;
    overlayKind = null;
    overlayHost.replaceChildren();
  }

  // ---------------------------------------------------------- update
  function update(s) {
    state = s;
    const g = s.game;
    renderPips(g);
    paintTimer();
    renderStage(g);
    renderDesk(g);
    renderDeal(g);
    if (sessionStorage.getItem(`dsms:intro:${gameId}`)) showInterlude(g);
    renderChat(g.chat);
    renderLog(g);
    const hk = JSON.stringify([g.hints, g.hintsLeft, g.paused, g.stageId, Math.round((g.nextHintInMs || 0) / 5000)]);
    if (hk !== lastHints) {
      lastHints = hk;
      renderHints(g);
    }
    renderOverlays(s);
  }

  function fx(e) {
    stage?.comp.fx?.(e);
    if (e.type === 'doc' && deskTab !== 'docs') renderDesk(state.game);
  }

  function destroy() {
    clearInterval(timerLoop);
    clearInterval(hintCountdown);
    stage?.comp.destroy?.();
    ambience.stop();
    document.querySelector('.interlude')?.remove();
    document.body.className = '';
  }

  return { el, update, fx, destroy };
}
