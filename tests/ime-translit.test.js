'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const TranslitMatcher = require('../ime-translit.js');

function fakeClock() { let t = 0; return () => t += 10; }

// 代表性强例:声调符、无声 อ、重读符号、变音符、软硬音符号
const SAMPLES = {
  th: ['สวัสดี', 'กี่โมงแล้ว', 'ภาษาไทย', 'ขอบคุณมาก', 'ฉันรักประเทศไทย', 'อรุณสวัสดิ์'],
  ar: ['صَباح الخير', 'كيف حالك؟', 'السلام عليكم', 'مَدْرَسَة', 'شكرًا جزيلًا'],
  ru: ['привет', 'люблю', 'съезд', 'подъезд', 'щавель', 'русский язык']
};

for (const lang of ['th', 'ar', 'ru']) {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', lang + '.json'), 'utf-8'));

  test(`${lang}: keysFor roundtrip — representative samples feed back clean`, () => {
    for (const text of SAMPLES[lang]) {
      const m = new TranslitMatcher(text, { dict, now: fakeClock() });
      const seq = TranslitMatcher.keysFor(text, dict);
      for (const c of seq) { if (!m.finished) m.feed(c); }
      assert.strictEqual(m.finished, true, `${lang} not finished: ${JSON.stringify(text)} seq=${seq}`);
      assert.strictEqual(m.errors, 0, `${lang} errors on: ${JSON.stringify(text)}`);
    }
  });

  test(`${lang}: every distinct sample char has a mapping`, () => {
    const RANGE = { th: [/[\u0E00-\u0E7F]/], ar: [/[\u0600-\u06FF]/], ru: [/[\u0400-\u04FF]/] }[lang];
    const used = new Set();
    for (const text of SAMPLES[lang]) for (const c of text) if (RANGE.some(r => r.test(c))) used.add(c);
    const unmapped = [...used].filter(c => !(c in dict));
    assert.deepStrictEqual(unmapped, [], `${lang} unmapped: ${unmapped.join(' ')}`);
  });
}

test('th: tone marks auto-skip and long vowels work', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', 'th.json'), 'utf-8'));
  const m = new TranslitMatcher('กี่โมงแล้ว', { dict, now: fakeClock() }); // k+ี(tone skip)+m+o+ง+แ+l+้+ว
  const seq = TranslitMatcher.keysFor('กี่โมงแล้ว', dict);
  assert.strictEqual(seq, 'keeomngaelw');
  for (const c of seq) m.feed(c);
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('ar: case-sensitive emphatics + diacritic auto-skip', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', 'ar.json'), 'utf-8'));
  assert.strictEqual(TranslitMatcher.keysFor('صَباح', dict), 'SbaH'); // َ skip
  const m = new TranslitMatcher('ص', { dict, now: fakeClock() });
  assert.strictEqual(m.feed('s').event, 'done'); // lowercase s = error burn on ص
  assert.strictEqual(m.errors, 1);
  const m2 = new TranslitMatcher('ص', { dict, now: fakeClock() });
  assert.strictEqual(m2.feed('S').event, 'done');
  assert.strictEqual(m2.errors, 0);
});

test('ru: я/ю/щ multiletter + soft sign auto-skip', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', 'ru.json'), 'utf-8'));
  assert.strictEqual(TranslitMatcher.keysFor('я ю щ ь', dict), 'ya yu sch ');
  const m = new TranslitMatcher('люблю', { dict, now: fakeClock() });
  for (const c of TranslitMatcher.keysFor('люблю', dict)) m.feed(c);
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('OS-composed char accepted alongside translit (dual input)', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'translit', 'ru.json'), 'utf-8'));
  const m = new TranslitMatcher('привет', { dict, now: fakeClock() });
  for (const c of 'п') m.feed(c);
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.unitPos, 1);
});
