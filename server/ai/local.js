// Offline content provider. Used when no API key is configured and as the
// fallback whenever the remote model is slow, fails, or returns content that
// does not pass validation.

import { localEpilogue } from '../game/story.js';

const FILLERS = ['طيب', 'تمام', 'اوكي', 'يلا', 'خلاص', 'اسمع', 'بسرعة'];
const EMOJI = /\p{Extended_Pictographic}/gu;

// The Echo imitates a partner's habits (filler words, emoji) but never the
// word they open most messages with — so an agreed password still works.
export function mimic(text, partnerMessages = []) {
  if (!partnerMessages.length) return text;
  let out = text;
  const firstWords = partnerMessages.map((m) => m.split(/\s+/)[0]);
  const password = firstWords.find((w) => firstWords.filter((x) => x === w).length >= Math.max(2, firstWords.length * 0.6));
  const filler = FILLERS.find((f) => f !== password && partnerMessages.some((m) => m.includes(f)));
  if (filler) out = `${filler}، ${out}`;
  const emojis = partnerMessages.join(' ').match(EMOJI) || [];
  if (emojis.length >= Math.ceil(partnerMessages.length / 3)) {
    const counts = new Map();
    for (const e of emojis) counts.set(e, (counts.get(e) || 0) + 1);
    out += ` ${[...counts].sort((a, b) => b[1] - a[1])[0][0]}`;
  }
  return out;
}

export const localProvider = {
  name: 'local',
  async prepareMission() {
    return null;
  },
  async styleFake({ fallback, partnerMessages }) {
    return mimic(fallback.text, partnerMessages);
  },
  async styleHint({ text }) {
    return text;
  },
  async epilogue({ game }) {
    return localEpilogue(game);
  },
};
