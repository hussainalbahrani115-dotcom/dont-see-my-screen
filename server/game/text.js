export const ORDINALS = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];

export const DIR_NAMES = { n: 'الشمال', e: 'الشرق', s: 'الجنوب', w: 'الغرب' };

export const ROLE_NAMES = { explorer: 'الميداني', archivist: 'المؤرشف' };

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigits(s) {
  return String(s ?? '').replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
}

// Loose comparison for spoken phrases: ignores diacritics, hamza forms,
// taa marbuta / alef maqsura differences, punctuation and extra spaces.
export function normalizeArabic(s) {
  return normalizeDigits(s)
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[«»"'.,،!?؟:;\-_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001F\u007F‎‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function fmtFreq(tenths) {
  return (tenths / 10).toFixed(1);
}
