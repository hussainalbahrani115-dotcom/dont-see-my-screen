// The Claude provider is exercised with a mocked fetch: no network, no key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicProvider } from '../server/ai/anthropic.js';

function providerReturning(text, capture = {}) {
  const fetchImpl = async (url, init) => {
    capture.url = url;
    capture.headers = init.headers;
    capture.body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }) };
  };
  return createAnthropicProvider({ apiKey: 'test-key', model: 'claude-haiku-5-5', fetchImpl });
}

test('prepareMission keeps only words valid for the codebook and sane lines', async () => {
  const cap = {};
  const p = providerReturning(
    JSON.stringify({ echoLines: ['سطر أول', 'سطر ثان', 'سطر ثالث', 'x'.repeat(400)], words: ['موج', 'ضوء', 'بحرية', 'رمل', 42] }),
    cap,
  );
  const ai = await p.prepareMission({ names: { explorer: 'أ', archivist: 'ب' }, difficulty: 'normal' });
  assert.deepEqual(ai.words, ['موج', 'رمل']);
  assert.equal(ai.echoLines.length, 3);
  assert.equal(cap.headers['x-api-key'], 'test-key');
  assert.equal(cap.body.model, 'claude-haiku-5-5');
});

test('styleFake falls back when the model drops the misleading key facts', async () => {
  const fallback = { text: 'اقطع السلك الثالث الآن', keys: ['الثالث'] };
  const bad = await providerReturning('اقطع السلك الأول يا صديقي').styleFake({ fallback, partnerMessages: [] });
  assert.equal(bad, fallback.text);
  const good = await providerReturning('طيب، اقطع السلك الثالث بسرعة').styleFake({ fallback, partnerMessages: [] });
  assert.equal(good, 'طيب، اقطع السلك الثالث بسرعة');
});

test('styleHint must preserve numbers and quoted names', async () => {
  const text = 'الكلمة تبدأ بحرف «ق». لديك 5 أسلاك.';
  assert.equal(await providerReturning('ابحث عن حرف آخر.').styleHint({ text, stageTitle: 'x' }), text);
  const ok = 'يهمس النظام: الكلمة تبدأ بـ«ق»، والأسلاك 5.';
  assert.equal(await providerReturning(ok).styleHint({ text, stageTitle: 'x' }), ok);
});

test('network failure never breaks the game', async () => {
  const p = createAnthropicProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(await p.prepareMission({ names: { explorer: 'a', archivist: 'b' }, difficulty: 'easy' }), null);
  const fallback = { text: 'رسالة', keys: ['رسالة'] };
  assert.equal(await p.styleFake({ fallback, partnerMessages: [] }), 'رسالة');
});
