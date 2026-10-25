// Stage 1 — غرفة المولّد.
// The explorer sees a junction panel (glyph, wires, serial plate, lamps).
// The archivist holds a maintenance manual: four panel models identified by
// glyphs, each with ordered rules. Only together can they pick the one wire.

import { ORDINALS } from '../text.js';
import { GLYPH_IDS, GLYPH_DESC } from '../story.js';

export const COLORS = ['red', 'blue', 'yellow', 'white', 'black', 'green'];
const COLOR_NAME = { red: 'الأحمر', blue: 'الأزرق', yellow: 'الأصفر', white: 'الأبيض', black: 'الأسود', green: 'الأخضر' };
const MODEL_NAMES = ['النموذج «ألف»', 'النموذج «باء»', 'النموذج «جيم»', 'النموذج «دال»'];
const COND_KINDS = ['countGt', 'none', 'serialOdd', 'serialEven', 'lampsAtLeast', 'lastIs', 'firstIs', 'wiresExactly', 'stripedAtLeast'];
const MIN_WIRES = 4;

const countColor = (p, c) => p.wires.filter((w) => w.c === c).length;
const serialLast = (p) => Number(p.serial.at(-1));

function condTrue(cond, p) {
  switch (cond.k) {
    case 'countGt': return countColor(p, cond.color) > cond.n;
    case 'none': return countColor(p, cond.color) === 0;
    case 'serialOdd': return serialLast(p) % 2 === 1;
    case 'serialEven': return serialLast(p) % 2 === 0;
    case 'lampsAtLeast': return p.lamps >= cond.n;
    case 'lastIs': return p.wires.at(-1).c === cond.color;
    case 'firstIs': return p.wires[0].c === cond.color;
    case 'wiresExactly': return p.wires.length === cond.n;
    case 'stripedAtLeast': return p.wires.filter((w) => w.s).length >= cond.n;
    case 'always': return true;
  }
  throw new Error(`unknown condition ${cond.k}`);
}

function targetIndex(t, p) {
  switch (t.t) {
    case 'pos': return t.i < p.wires.length ? t.i : -1;
    case 'last': return p.wires.length - 1;
    case 'lastOf':
      for (let i = p.wires.length - 1; i >= 0; i--) if (p.wires[i].c === t.color) return i;
      return -1;
    case 'firstStriped': return p.wires.findIndex((w) => w.s);
  }
  return -1;
}

export function solve(model, panel) {
  for (let i = 0; i < model.rules.length; i++) {
    const r = model.rules[i];
    if (condTrue(r.cond, panel)) return { index: targetIndex(r.target, panel), rule: i };
  }
  return { index: -1, rule: -1 };
}

function makeRule(rng, k) {
  const color = rng.pick(COLORS);
  const pos = { t: 'pos', i: rng.int(0, MIN_WIRES - 1) };
  switch (k) {
    case 'countGt': return { cond: { k, color, n: rng.int(1, 2) }, target: rng.chance(0.6) ? { t: 'lastOf', color } : pos };
    case 'none': return { cond: { k, color }, target: rng.chance(0.3) ? { t: 'last' } : pos };
    case 'serialOdd':
    case 'serialEven': return { cond: { k }, target: rng.chance(0.3) ? { t: 'last' } : pos };
    case 'lampsAtLeast': return { cond: { k, n: rng.int(2, 3) }, target: pos };
    case 'lastIs': return { cond: { k, color }, target: pos };
    case 'firstIs': return { cond: { k, color }, target: rng.chance(0.5) ? { t: 'lastOf', color } : pos };
    case 'wiresExactly': return { cond: { k, n: rng.int(4, 6) }, target: rng.chance(0.4) ? { t: 'last' } : pos };
    case 'stripedAtLeast': return { cond: { k, n: rng.int(1, 2) }, target: { t: 'firstStriped' } };
  }
  throw new Error(`unknown kind ${k}`);
}

function makeModelRules(rng) {
  const kinds = rng.shuffle(COND_KINDS.filter((k) => k !== 'serialEven')).slice(0, 4);
  // Odd/even serial are complementary; swap one in sometimes for variety.
  if (rng.chance(0.4)) kinds[kinds.indexOf('serialOdd') >= 0 ? kinds.indexOf('serialOdd') : 0] = 'serialEven';
  const rules = kinds.map((k) => makeRule(rng, k));
  rules.push({ cond: { k: 'always' }, target: rng.chance(0.3) ? { t: 'last' } : { t: 'pos', i: rng.int(0, MIN_WIRES - 1) } });
  return rules;
}

function makePanel(rng, count) {
  return {
    glyph: rng.pick(GLYPH_IDS),
    wires: Array.from({ length: count }, () => ({ c: rng.pick(COLORS), s: rng.chance(0.25) })),
    serial: `${rng.pick(['SR', 'EC', 'NX', 'AL', 'QM'])}-${rng.int(10, 99)}-${rng.int(0, 9)}`,
    lamps: rng.int(0, 3),
  };
}

function condText(c) {
  const col = COLOR_NAME[c.color];
  switch (c.k) {
    case 'countGt': return c.n === 1 ? `إذا وُجد أكثر من سلك واحد باللون ${col}` : `إذا وُجد أكثر من سلكين باللون ${col}`;
    case 'none': return `إذا لم يوجد أي سلك باللون ${col}`;
    case 'serialOdd': return 'إذا كان آخر رقم في الرقم التسلسلي فرديًا';
    case 'serialEven': return 'إذا كان آخر رقم في الرقم التسلسلي زوجيًا';
    case 'lampsAtLeast': return `إذا كان عدد المصابيح المضاءة ${c.n} أو أكثر`;
    case 'lastIs': return `إذا كان السلك الأخير باللون ${col}`;
    case 'firstIs': return `إذا كان السلك الأول باللون ${col}`;
    case 'wiresExactly': return `إذا كان عدد الأسلاك ${c.n} بالضبط`;
    case 'stripedAtLeast': return c.n === 1 ? 'إذا وُجد سلك مخطّط واحد على الأقل' : 'إذا وُجد سلكان مخطّطان على الأقل';
    case 'always': return 'في جميع الحالات الأخرى';
  }
  return '';
}

function targetText(t) {
  switch (t.t) {
    case 'pos': return `اقطع السلك ${ORDINALS[t.i]}`;
    case 'last': return 'اقطع السلك الأخير';
    case 'lastOf': return `اقطع آخر سلك باللون ${COLOR_NAME[t.color]}`;
    case 'firstStriped': return 'اقطع أول سلك مخطّط';
  }
  return '';
}

export default {
  id: 'junction',
  title: 'غرفة المولّد',
  targetSec: 240,

  generate({ rng, level }) {
    const count = [4, 5, 6][level];
    const glyphs = rng.shuffle(GLYPH_IDS);
    const models = MODEL_NAMES.map((name, mi) => ({
      name,
      glyphs: glyphs.slice(mi * 2, mi * 2 + 2),
      rules: makeModelRules(rng),
    }));
    let panel;
    let sol;
    for (let attempt = 0; attempt < 40; attempt++) {
      panel = makePanel(rng, count);
      const model = models.find((m) => m.glyphs.includes(panel.glyph));
      sol = solve(model, panel);
      if (sol.index < 0) continue;
      // Prefer panels where a specific rule fires, not the fallback.
      if (sol.rule === model.rules.length - 1 && attempt < 30 && rng.chance(0.75)) continue;
      break;
    }
    return { panel, models, answer: sol.index, answerRule: sol.rule, drawerOpened: false, burned: [] };
  },

  validate(st) {
    const model = st.models.find((m) => m.glyphs.includes(st.panel.glyph));
    if (!model) throw new Error('panel glyph has no model');
    const sol = solve(model, st.panel);
    if (sol.index !== st.answer || sol.index < 0 || sol.index >= st.panel.wires.length) throw new Error('unsolvable panel');
    for (const m of st.models) if (m.rules.at(-1).cond.k !== 'always') throw new Error('model without fallback');
    const all = st.models.flatMap((m) => m.glyphs);
    if (new Set(all).size !== all.length) throw new Error('glyph used by two models');
  },

  explorerView(st) {
    return { panel: st.panel, drawerOpened: st.drawerOpened, burned: st.burned };
  },

  archivistView(st) {
    return {
      manual: st.models.map((m) => ({
        name: m.name,
        glyphs: m.glyphs,
        rules: m.rules.map((r) => ({ when: condText(r.cond), then: targetText(r.target) })),
      })),
    };
  },

  actions: {
    explorer: {
      inspect(st, { id }, api) {
        if (id === 'drawer') {
          if (st.drawerOpened) return { text: 'الدرج فارغ الآن.' };
          st.drawerOpened = true;
          api.fragment('f1');
          return { text: 'في الدرج دفتر صغير ملتصق الصفحات.' };
        }
        if (id === 'poster') {
          const text = 'ملصق سلامة باهت: «لا تقطع أي سلك قبل مراجعة دليل الصيانة». تحته بقلم أحمر: «لا تصدّق كل ما يصلك عبر اللاسلكي».';
          api.log('explorer', text);
          return { text };
        }
        if (id === 'door') return { text: 'الباب مقفل كهربائيًا. يحتاج إلى عودة التيار.' };
        throw api.error('لا شيء هنا');
      },
      cut(st, { index }, api) {
        if (!Number.isInteger(index) || index < 0 || index >= st.panel.wires.length) throw api.error('سلك غير موجود');
        if (st.burned.includes(index)) throw api.error('هذا السلك محترق بالفعل');
        if (index === st.answer) {
          api.log('explorer', `قطعت السلك ${ORDINALS[index]}. هدر المولّد وعادت الأضواء.`);
          api.log('archivist', 'عاد التيار إلى المحطة. أحسنتما.');
          api.complete();
          return { correct: true };
        }
        st.burned.push(index);
        api.fx('both', 'spark', {});
        api.penalize(30, `شرارة! السلك ${ORDINALS[index]} كان خاطئًا`);
        return { correct: false };
      },
    },
  },

  hint(st, role, tier) {
    const model = st.models.find((m) => m.glyphs.includes(st.panel.glyph));
    if (role === 'explorer') {
      return [
        'صِف لشريكك الرمز المحفور على اللوحة بدقة: الأشكال، النقاط، الاتجاه.',
        'شريكك يحتاج: ألوان الأسلاك من الأعلى للأسفل، وأيها مخطّط، وآخر رقم في الرقم التسلسلي، وعدد المصابيح المضاءة.',
        `لديك ${st.panel.wires.length} أسلاك. اطلب من شريكك أن يقرأ القواعد بالترتيب ويتوقف عند أول قاعدة تنطبق.`,
      ][tier - 1];
    }
    return [
      'ابدأ بتحديد النموذج: اطلب من شريكك وصف الرمز وقارنه بالرموز في الدليل.',
      'القواعد تُقرأ من الأعلى. أول قاعدة صحيحة هي الوحيدة التي تُنفّذ — تجاهل ما بعدها.',
      `اللوحة التي أمام شريكك من ${model.name}.`,
    ][tier - 1];
  },

  fakeFor(st, to, rng) {
    if (to === 'explorer') {
      const options = st.panel.wires.map((_, i) => i).filter((i) => i !== st.answer && !st.burned.includes(i));
      const i = rng.pick(options.length ? options : [0]);
      return { text: `راجعت الدليل مرتين: اقطع السلك ${ORDINALS[i]} الآن`, keys: [ORDINALS[i]] };
    }
    const g = rng.pick(GLYPH_IDS.filter((x) => x !== st.panel.glyph));
    return { text: `الرمز اللي على اللوحة عندي: ${GLYPH_DESC[g]}`, keys: [GLYPH_DESC[g]] };
  },
};
