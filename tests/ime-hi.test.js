'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const HindiPhoneticMatcher = require('../ime-hi.js');

function fakeClock() { let t = 0; return () => t += 10; }

// 代表性强例:含合字、नुक्ता、长短元音、卷舌、chandrabindu、标点
const SAMPLES = [
  'नमस्ते', 'धन्यवाद', 'हिन्दी टाइपिंग', 'क्षमा', 'ज़रूरत',
  'बच्चे पढ़ते हैं.', 'आप कैसे हैं?', 'ठीक है, चलिए.', 'फ़ोन',
  'ट्रेन देर से आई', 'विश्वास', 'स्वास्थ्य अच्छा है', 'यहाँ रुकिए',
  'श्रद्धा और शांति', 'उसकी ढाई भाषाएँ', 'चाँद चमकता है'
];

test('keysFor roundtrip: representative samples feed back clean', () => {
  for (const text of SAMPLES) {
    const m = new HindiPhoneticMatcher(text, { now: fakeClock() });
    const seq = HindiPhoneticMatcher.keysFor(text);
    for (const c of seq) { if (!m.finished) m.feed(c); }
    assert.strictEqual(m.finished, true, `not finished: ${JSON.stringify(text)} seq=${seq}`);
    assert.strictEqual(m.errors, 0, `errors on: ${JSON.stringify(text)}`);
  }
});

test('every distinct sample char has a mapping', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', 'hi.json'), 'utf-8'));
  const used = new Set();
  for (const text of SAMPLES) for (const c of text) if (c.charCodeAt(0) >= 0x0900 && c.charCodeAt(0) <= 0x097F) used.add(c);
  const unmapped = [...used].filter(c => !(c in dict));
  assert.deepStrictEqual(unmapped, [], `unmapped chars: ${unmapped.join(' ')}`);
});

test('kh vs k prefix: hold then complete', () => {
  const m = new HindiPhoneticMatcher('ख', { now: fakeClock() });
  assert.strictEqual(m.feed('k').event, 'hold');
  assert.strictEqual(m.feed('h').event, 'done');
  assert.strictEqual(m.errors, 0);
});

test('retroflex case: ट=T not t', () => {
  const m = new HindiPhoneticMatcher('ट', { now: fakeClock() });
  assert.strictEqual(m.feed('t').event, 'done'); // 烧掉 ट → 文本结束
  assert.strictEqual(m.errors, 1);
  const m2 = new HindiPhoneticMatcher('ट', { now: fakeClock() });
  assert.strictEqual(m2.feed('T').event, 'done');
  assert.strictEqual(m2.errors, 0);
});

test('matra sequence: क+ा = ka across two units', () => {
  const m = new HindiPhoneticMatcher('का', { now: fakeClock() });
  assert.strictEqual(m.feed('k').event, 'unit'); // क done
  assert.strictEqual(m.feed('a').event, 'done'); // ा done
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(HindiPhoneticMatcher.keysFor('का'), 'ka');
});

test('halant conjunct auto-skips: क्ष = kSh', () => {
  const m = new HindiPhoneticMatcher('क्ष', { now: fakeClock() });
  assert.strictEqual(HindiPhoneticMatcher.keysFor('क्ष'), 'kSh');
  for (const c of 'kSh') m.feed(c);
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('nukta auto-skips: ज़ = j', () => {
  assert.strictEqual(HindiPhoneticMatcher.keysFor('ज़'), 'j');
  const m = new HindiPhoneticMatcher('ज़', { now: fakeClock() });
  m.feed('j');
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('wrong key burns the unit and the text still completes (no soft-lock)', () => {
  const m = new HindiPhoneticMatcher('नमस्ते', { now: fakeClock() });
  assert.strictEqual(m.feed('q').event, 'error'); // burn न
  assert.strictEqual(m.errors, 1);
  for (const c of 'maste') m.feed(c);
  assert.strictEqual(m.finished, true);
});

test('space and punctuation typed literally', () => {
  const m = new HindiPhoneticMatcher('हाँ.', { now: fakeClock() });
  assert.strictEqual(HindiPhoneticMatcher.keysFor('हाँ.'), 'haM.');
  for (const c of 'haM') m.feed(c);
  assert.strictEqual(m.feed('.').event, 'done');
  assert.strictEqual(m.errors, 0);
  const m2 = new HindiPhoneticMatcher('नमस्ते दुनिया', { now: fakeClock() });
  for (const c of HindiPhoneticMatcher.keysFor('नमस्ते दुनिया')) m2.feed(c);
  assert.strictEqual(m2.finished, true);
  assert.strictEqual(m2.errors, 0);
});
