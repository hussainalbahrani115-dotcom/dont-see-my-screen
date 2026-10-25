// Stage 4 — النواة (finale).
// Both players must vote the same fate. Each fate requires a secret the
// *other* player holds: shutdown needs the code shown only on the explorer's
// screen but typed by the archivist; release needs the phrase scattered in the
// archivist's recovered documents but spoken (typed) by the explorer.

import { normalizeArabic, normalizeDigits } from '../text.js';
import { defaultEchoLines } from '../story.js';

const CHOICES = ['release', 'shutdown'];
const CHOICE_NAME = { release: 'التحرير', shutdown: 'الإطفاء' };

function validLines(lines) {
  return Array.isArray(lines) && lines.length >= 3 && lines.every((l) => typeof l === 'string' && l.length > 0 && l.length <= 160);
}

function resolveVotes(st, api) {
  const { explorer, archivist } = st.votes;
  if (!explorer || !archivist) return;
  if (explorer === archivist) {
    st.chosen = explorer;
    st.phase = 'input';
    api.system(`اتفقتما على ${CHOICE_NAME[st.chosen]}. ${st.chosen === 'release' ? 'على الميداني أن ينطق العبارة أمام النواة.' : 'على المؤرشف إدخال رمز الإيقاف.'}`);
    return;
  }
  st.mismatches++;
  st.votes = { explorer: null, archivist: null };
  if (st.mismatches >= 2) {
    api.end('echo_wins');
    return;
  }
  api.fx('both', 'echoLaugh', {});
  api.penalize(60, 'اختلفتما! النواة تضحك… وتقترب من القرار بدلًا منكما');
}

export default {
  id: 'core',
  title: 'النواة',
  targetSec: 240,

  generate({ rng, game }) {
    return {
      code: `${rng.int(10, 99)}-${rng.int(10, 99)}-${rng.int(10, 99)}`,
      votes: { explorer: null, archivist: null },
      phase: 'vote',
      chosen: null,
      mismatches: 0,
      wrongInputs: 0,
      lines: validLines(game.ai?.echoLines) ? game.ai.echoLines : defaultEchoLines(game),
    };
  },

  validate(st) {
    if (!/^\d{2}-\d{2}-\d{2}$/.test(st.code)) throw new Error('bad code');
  },

  explorerView(st) {
    return {
      phase: st.phase,
      chosen: st.chosen,
      myVote: st.votes.explorer,
      partnerVoted: !!st.votes.archivist,
      code: st.code,
      lines: st.lines,
      mismatches: st.mismatches,
      wrongInputs: st.wrongInputs,
    };
  },

  archivistView(st) {
    return {
      phase: st.phase,
      chosen: st.chosen,
      myVote: st.votes.archivist,
      partnerVoted: !!st.votes.explorer,
      mismatches: st.mismatches,
      wrongInputs: st.wrongInputs,
      protocol: [
        'بروتوكول الطوارئ — النواة التجريبية «صدى-1»',
        'الإطفاء: يُدخل المشرف الخارجي رمز الإيقاف المكوّن من ستة أرقام. الرمز يظهر فقط على شاشة النواة من الداخل.',
        'التحرير (إجراء غير موثّق): كتبت سلمى بخط اليد: «العبارة في تسجيلاتي. يجب أن تُقال من الداخل».',
        'تحذير: إذا اختلف قرار الفريق مرتين، تعود النواة إلى البث الذاتي.',
        'ثلاث محاولات خاطئة للإدخال تعني فقدان السيطرة.',
      ],
    };
  },

  actions: {
    both: {
      vote(st, { choice }, api) {
        if (st.phase !== 'vote') throw api.error('التصويت مغلق الآن');
        if (!CHOICES.includes(choice)) throw api.error('خيار غير معروف');
        st.votes[api.role] = choice;
        resolveVotes(st, api);
        return { ok: true };
      },
      revote(st, _p, api) {
        if (st.phase !== 'input') throw api.error('لا يوجد قرار لإلغائه');
        st.phase = 'vote';
        st.chosen = null;
        st.votes = { explorer: null, archivist: null };
        api.penalize(20, 'تراجعتما عن القرار — النواة تستغل التردد');
        return { ok: true };
      },
    },
    explorer: {
      speak(st, { text }, api) {
        if (st.phase !== 'input' || st.chosen !== 'release') throw api.error('ليس هذا وقت العبارة');
        const said = normalizeArabic(text);
        if (said && said === normalizeArabic(api.game.phrase.join(' '))) {
          api.end('release');
          return { correct: true };
        }
        return wrong(st, api, 'النواة لم تتعرف على العبارة');
      },
    },
    archivist: {
      enterCode(st, { text }, api) {
        if (st.phase !== 'input' || st.chosen !== 'shutdown') throw api.error('ليس هذا وقت الرمز');
        const digits = normalizeDigits(text).replace(/\D/g, '');
        if (digits === st.code.replace(/\D/g, '')) {
          api.end('shutdown');
          return { correct: true };
        }
        return wrong(st, api, 'رمز الإيقاف مرفوض');
      },
    },
  },

  hint(st, role, tier) {
    const shared = [
      'القرار يحتاج تصويتكما معًا، والتصويت سري حتى يكتمل. اتفقا في المحادثة أولًا.',
      'التحرير يحتاج عبارة من كلمتين موجودة في تسجيلات سلمى لدى المؤرشف، والإطفاء يحتاج الرمز الظاهر على شاشة الميداني.',
    ];
    if (tier < 3) return shared[tier - 1];
    return role === 'explorer'
      ? 'إن لم يجد شريكك الكلمتين في وثائقه، فالإطفاء هو الطريق الآمن: اقرأ له الرمز رقمًا رقمًا.'
      : 'كلمة من العبارة في «شريط الطوارئ» والأخرى في «رسالة سلمى الأخيرة». إن نقصت إحداهما، فالإطفاء أضمن.';
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') {
      const c = rng.pick(CHOICES);
      return { text: `غيّرت رأيي — صوّت لـ«${CHOICE_NAME[c]}» بسرعة قبل ما تقرر النواة`, keys: [CHOICE_NAME[c]] };
    }
    let code;
    do code = `${rng.int(10, 99)}-${rng.int(10, 99)}-${rng.int(10, 99)}`; while (code === st.code);
    return { text: `الرمز اللي على شاشة النواة: ${code}`, keys: [code] };
  },
};

function wrong(st, api, reason) {
  st.wrongInputs++;
  if (st.wrongInputs >= 3) {
    api.end('echo_wins');
    return { correct: false };
  }
  api.fx('both', 'static', { ms: 900 });
  api.penalize(30, reason);
  return { correct: false };
}
