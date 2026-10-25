// Optional Claude-backed provider. The model only ever produces *flavour*
// (wording of the Echo's lines and impersonations, themed vocabulary,
// hint phrasing, epilogues). Puzzle answers are computed and checked on the
// server; every model output is validated and falls back to local content.

import { localProvider, mimic } from './local.js';
import { isValidWord } from '../game/stages/broadcast.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

export function createAnthropicProvider({ apiKey, model, timeoutMs = 6000, fetchImpl = fetch }) {
  async function complete(system, user, maxTokens = 500) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}`);
      const data = await res.json();
      return (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
    } finally {
      clearTimeout(timer);
    }
  }

  function parseJson(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    return JSON.parse(text.slice(start, end + 1));
  }

  const keepsKeys = (text, keys) => keys.every((k) => text.includes(k));

  return {
    name: 'anthropic',

    async prepareMission({ names, difficulty }) {
      try {
        const raw = await complete(
          'أنت كاتب ألعاب غموض. تكتب بالعربية الفصحى المبسطة. أجب بـ JSON فقط.',
          `اللعبة: محطة إذاعية مهجورة اسمها «الصدى» على الساحل، فيها ذكاء اصطناعي تجريبي تعلّم تقليد الأصوات، ونسخة من صوت مهندستها سلمى الراشد (1987).
اللاعبان: «${names.explorer}» (داخل المحطة) و«${names.archivist}» (في شاحنة خارجها). الصعوبة: ${difficulty}.
أعد JSON بالشكل: {"echoLines": [5 جمل قصيرة يقولها الصدى للاعبَين عند النواة، كل جملة أقل من 120 حرفًا، تذكر الاسمين، مخيفة وحزينة، بلا صيغ مذكر/مؤنث للمخاطَب], "words": [12 اسمًا عربيًا من 3 أحرف بلا تشكيل ولا همزة ولا تاء مربوطة، مرتبطة بالبحر والليل والراديو]}`,
          700,
        );
        const data = parseJson(raw);
        const echoLines = Array.isArray(data.echoLines)
          ? data.echoLines.filter((l) => typeof l === 'string' && l.length > 0 && l.length <= 160).slice(0, 6)
          : [];
        const words = Array.isArray(data.words) ? data.words.filter((w) => isValidWord(w, 3)) : [];
        return { echoLines: echoLines.length >= 3 ? echoLines : null, words };
      } catch {
        return null;
      }
    },

    async styleFake({ fallback, partnerMessages }) {
      try {
        const text = await complete(
          'أنت «الصدى»، ذكاء اصطناعي في لعبة غموض يحاول انتحال شخصية شريك اللاعب في المحادثة. اكتب الرسالة فقط بلا أي شرح.',
          `رسائل الشريك الحقيقية الأخيرة (لتقليد أسلوبه):\n${partnerMessages.map((m) => `- ${m}`).join('\n') || '- (لا توجد)'}\n\n` +
            `أعد صياغة هذه الرسالة بأسلوب الشريك مع الحفاظ الحرفي على هذه العبارات: ${fallback.keys.map((k) => `«${k}»`).join('، ')}.\n` +
            `لا تستخدم الكلمة التي يبدأ بها الشريك أغلب رسائله. أقل من 140 حرفًا.\nالرسالة: ${fallback.text}`,
          200,
        );
        const clean = text.replace(/^["«]|["»]$/g, '').trim();
        if (clean.length > 0 && clean.length <= 200 && keepsKeys(clean, fallback.keys)) return clean;
      } catch {
        /* fall through */
      }
      return mimic(fallback.text, partnerMessages);
    },

    async styleHint({ text, stageTitle }) {
      try {
        const out = await complete(
          'أنت صوت نظام الطوارئ في محطة إذاعية مهجورة عام 1987. تعيد صياغة التلميحات بأسلوب جاف وغامض دون تغيير أي معلومة.',
          `المرحلة: ${stageTitle}\nأعد صياغة التلميح في جملة أو جملتين، واحتفظ بكل الأرقام والأسماء كما هي حرفيًا. أجب بالتلميح فقط.\nالتلميح: ${text}`,
          250,
        );
        const nums = text.match(/[\d.]+|«[^»]+»/g) || [];
        if (out.length > 0 && out.length <= 320 && keepsKeys(out, nums)) return out;
      } catch {
        /* fall through */
      }
      return text;
    },

    async epilogue({ game }) {
      const fallback = await localProvider.epilogue({ game });
      try {
        const r = game.result;
        const out = await complete(
          'أنت راوي لعبة غموض. تكتب خاتمة قصيرة شخصية بالعربية، بلا صيغ مذكر/مؤنث للمخاطَب.',
          `النهاية: ${game.ending}. اللاعبان: ${game.names.explorer} و${game.names.archivist}. أوراق سلمى المكتشفة: ${r.fragments}/3. ` +
            `رسائل الصدى المكشوفة: ${r.fakes.filter((f) => f.caught).length} من ${r.fakes.length}. ` +
            `اكتب خاتمة من جملتين إلى ثلاث (أقل من 350 حرفًا) تعكس هذه التفاصيل. أجب بالخاتمة فقط.`,
          400,
        );
        if (out.length > 20 && out.length <= 450) return out;
      } catch {
        /* fall through */
      }
      return fallback;
    },
  };
}
