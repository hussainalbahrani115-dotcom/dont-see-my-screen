// Stage 3 — استوديو البث.
// A lamp blinks a word in the station's private code (regenerated every game).
// The explorer watches the lamp, the studio clock and the signal LED; the
// archivist holds the codebook, the frequency directory and correction rules.
// The explorer tunes the dial and transmits; the server checks the exact tenth.

import { fmtFreq } from '../text.js';

export const POOL = ['ا', 'ب', 'ت', 'ج', 'ح', 'د', 'ر', 'س', 'ش', 'ص', 'ط', 'ع', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
export const WORDS3 = ['قمر', 'بحر', 'نور', 'ملح', 'فجر', 'ليل', 'موج', 'رمل', 'برق', 'صمت', 'حلم', 'رعد', 'نجم', 'شمس', 'ريح', 'صدف', 'جسر', 'درب', 'نهر', 'برج', 'طيف', 'سحر', 'وتر', 'عطر', 'قلب', 'حبر'];
export const WORDS4 = ['منار', 'سراب', 'نسيم', 'شراع', 'قارب', 'بحار', 'نجوم', 'رصيف', 'فنار', 'سحاب', 'مركب', 'كوكب', 'طريق'];

const INDICATOR_NAME = { green: 'أخضر', red: 'أحمر', amber: 'كهرماني' };
const DIAL_MIN = 850;
const DIAL_MAX = 1100;

export function isValidWord(w, len) {
  return typeof w === 'string' && [...w].length === len && [...w].every((ch) => POOL.includes(ch));
}

function allPatterns() {
  const out = [];
  for (let len = 2; len <= 4; len++) {
    for (let n = 0; n < 2 ** len; n++) {
      out.push([...n.toString(2).padStart(len, '0')].map((b) => (b === '0' ? '.' : '-')).join(''));
    }
  }
  return out;
}

function modApplies(m, f) {
  switch (m.k) {
    case 'hourOdd': return f.hour % 2 === 1;
    case 'hourEven': return f.hour % 2 === 0;
    case 'hourAbove': return f.hour > m.h;
    case 'indicator': return f.indicator === m.color;
  }
  return false;
}

function signText(d) {
  return d > 0 ? `أضف ${fmtFreq(d)} ميغاهرتز` : `اطرح ${fmtFreq(-d)} ميغاهرتز`;
}

function modText(m) {
  switch (m.k) {
    case 'hourOdd': return `إذا كان عقرب الساعات في ساعة الاستوديو يشير إلى رقم فردي: ${signText(m.d)}`;
    case 'hourEven': return `إذا كان عقرب الساعات في ساعة الاستوديو يشير إلى رقم زوجي: ${signText(m.d)}`;
    case 'hourAbove': return `إذا كانت ساعة الاستوديو تشير إلى ما بعد الساعة ${m.h}: ${signText(m.d)}`;
    case 'indicator': return `إذا كان مؤشر الإشارة ${INDICATOR_NAME[m.color]}: ${signText(m.d)}`;
  }
  return '';
}

export function computeAnswer(st) {
  const entry = st.directory.find((e) => e.word === st.word);
  return entry.freq + st.mods.filter((m) => modApplies(m, st)).reduce((s, m) => s + m.d, 0);
}

export default {
  id: 'broadcast',
  title: 'استوديو البث',
  targetSec: 300,

  generate({ rng, level, game }) {
    const len = level >= 2 ? 4 : 3;
    const base = len === 4 ? WORDS4 : WORDS3;
    const aiWords = (game.ai?.words || []).filter((w) => isValidWord(w, len));
    const words = [...new Set([...base, ...aiWords])];
    const word = rng.pick(words);

    const patterns = rng.shuffle(allPatterns());
    const codebook = Object.fromEntries(POOL.map((l, i) => [l, patterns[i]]));

    // Directory: the target plus decoys, unique frequencies spaced apart.
    const decoys = rng.shuffle(words.filter((w) => w !== word)).slice(0, 9);
    const used = [];
    const freqFor = () => {
      for (;;) {
        const f = rng.int(880, 1070);
        if (used.every((u) => Math.abs(u - f) >= 4)) { used.push(f); return f; }
      }
    };
    const directory = rng.shuffle([word, ...decoys]).map((w) => ({ word: w, freq: freqFor() }));

    const hour = rng.int(1, 12);
    const indicator = rng.pick(['green', 'red', 'amber']);
    const deltas = [2, 4, 5, 10, 15, -3, -5, -10];
    const kinds = rng.shuffle(['hour', 'hourAbove', 'indicator']).slice(0, 2);
    const mods = kinds.map((k) => {
      const d = rng.pick(deltas);
      if (k === 'hour') return { k: rng.chance(0.5) ? 'hourOdd' : 'hourEven', d };
      if (k === 'hourAbove') return { k, h: rng.int(3, 9), d };
      return { k, color: rng.pick(['green', 'red', 'amber']), d };
    });

    const st = {
      word,
      letters: [...word],
      codebook,
      directory,
      hour,
      minute: rng.int(0, 11) * 5,
      indicator,
      mods,
      assist: ['tape', 'slow', 'slow'][level],
      cassetteTaken: false,
      attempts: [],
    };
    st.answer = computeAnswer(st);
    return st;
  },

  validate(st) {
    if (st.answer < DIAL_MIN || st.answer > DIAL_MAX) throw new Error('answer off the dial');
    if (st.directory.some((e) => e.word !== st.word && e.freq === st.answer)) throw new Error('ambiguous frequency');
    if (!st.directory.some((e) => e.word === st.word)) throw new Error('word missing from directory');
    const pats = Object.values(st.codebook);
    if (new Set(pats).size !== pats.length) throw new Error('duplicate patterns');
    if (!st.letters.every((l) => st.codebook[l])) throw new Error('letter without code');
  },

  explorerView(st) {
    return {
      pattern: st.letters.map((l) => st.codebook[l]),
      assist: st.assist,
      hour: st.hour,
      minute: st.minute,
      indicator: st.indicator,
      cassetteTaken: st.cassetteTaken,
      attempts: st.attempts.map(fmtFreq),
      dial: { min: DIAL_MIN, max: DIAL_MAX },
    };
  },

  archivistView(st) {
    return {
      codebook: POOL.map((l) => ({ l, p: st.codebook[l] })),
      directory: st.directory.map((e) => ({ word: e.word, freq: fmtFreq(e.freq) })).sort((a, b) => a.word.localeCompare(b.word, 'ar')),
      mods: st.mods.map(modText),
    };
  },

  actions: {
    explorer: {
      inspect(st, { id }, api) {
        if (id === 'cassette') {
          if (st.cassetteTaken) return { text: 'العلبة فارغة.' };
          st.cassetteTaken = true;
          api.fragment('f3');
          return { text: 'بين الكاسيتات ظرف مختوم مكتوب عليه «إلى من يجدني».' };
        }
        if (id === 'window') {
          const text = 'من نافذة الاستوديو ترى ضوء شاحنة شريكك خلف السور. الضوء يرتجف كلما ومض المصباح.';
          api.log('explorer', text);
          return { text };
        }
        throw api.error('لا شيء هنا');
      },
      transmit(st, { tenths }, api) {
        if (!Number.isInteger(tenths) || tenths < DIAL_MIN || tenths > DIAL_MAX) throw api.error('تردد خارج نطاق القرص');
        if (tenths === st.answer) {
          api.log('explorer', `بثثت على ${fmtFreq(tenths)} ميغاهرتز. البكرة تدور… والجدار خلفك يتحرك.`);
          api.log('archivist', `التقطت البث على ${fmtFreq(tenths)} ميغاهرتز. الإشارة واضحة لأول مرة.`);
          api.complete();
          return { correct: true };
        }
        st.attempts.push(tenths);
        api.fx('both', 'static', { ms: 1200 });
        api.penalize(30, `تشويش! ${fmtFreq(tenths)} ليس التردد الصحيح`);
        return { correct: false };
      },
    },
  },

  hint(st, role, tier) {
    if (role === 'explorer') {
      return [
        'راقب المصباح: ومضة قصيرة = نقطة، ومضة طويلة = شَرطة. الإطفاء الطويل يفصل بين الحروف، والأطول يعني بداية الكلمة من جديد.',
        'أخبر شريكك أيضًا بالوقت على ساعة الاستوديو ولون مؤشر الإشارة — التردد يتغير بهما.',
        `الكلمة المرسلة مكونة من ${st.letters.length} حروف.`,
      ][tier - 1];
    }
    return [
      'فك الحروف من كتاب الشفرة واحدًا واحدًا، ثم ابحث عن الكلمة في دليل الترددات.',
      'لا تنسَ التعديلات: طبّق كل تعديل تنطبق شروطه — قد ينطبق أكثر من تعديل، وقد لا ينطبق أي منها.',
      `الكلمة تبدأ بحرف «${st.letters[0]}».`,
    ][tier - 1];
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') {
      let f;
      do f = rng.int(880, 1080); while (f === st.answer);
      return { text: `حسبتها: التردد ${fmtFreq(f)} — اضبطه وابث بسرعة`, keys: [fmtFreq(f)] };
    }
    let h;
    do h = rng.int(1, 12); while (h === st.hour);
    const color = rng.pick(Object.keys(INDICATOR_NAME).filter((c) => c !== st.indicator));
    return { text: `الساعة عندي ${h} والمؤشر ${INDICATOR_NAME[color]}`, keys: [String(h), INDICATOR_NAME[color]] };
  },
};
