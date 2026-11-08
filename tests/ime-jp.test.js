/* ime-jp.test.js — romaji matcher unit tests.
 * Run: node --test tests/ime-jp.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Matcher = require('../ime-jp.js');

function fakeClock() { let t = 0; const now = () => t; now.advance = ms => { t += ms; }; return now; }

test('basic kana: か→ka, さ→sa', () => {
  const m = new Matcher('かさ', { now: fakeClock() });
  assert.strictEqual(m.feed('k').event, 'hold');
  assert.strictEqual(m.feed('a').event, 'unit');
  assert.strictEqual(m.feed('s').event, 'hold');
  assert.strictEqual(m.feed('a').event, 'done');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('variant spellings accepted: し = shi or si; ふ = fu or hu; じ = ji or zi', () => {
  for (const seq of ['shi', 'si']) {
    const m = new Matcher('し', { now: fakeClock() });
    seq.split('').forEach(c => m.feed(c));
    assert.strictEqual(m.finished, true, seq);
    assert.strictEqual(m.errors, 0);
  }
  for (const seq of ['fu', 'hu']) {
    const m = new Matcher('ふ', { now: fakeClock() });
    seq.split('').forEach(c => m.feed(c));
    assert.strictEqual(m.finished, true, seq);
  }
});

test('digraph: きゃ = kya', () => {
  const m = new Matcher('きゃ', { now: fakeClock() });
  ['k', 'y', 'a'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.unitCount(), 1); // きゃ is ONE unit
});

test('ん ambiguity: n held before vowel, completes before consonant', () => {
  // ん+あ: ambiguous → nn or nna needed
  const m1 = new Matcher('んあ', { now: fakeClock() });
  assert.strictEqual(m1.feed('n').event, 'hold');   // ん or な…
  assert.strictEqual(m1.feed('n').event, 'unit');   // nn → ん
  assert.strictEqual(m1.feed('a').event, 'done');   // あ
  assert.strictEqual(m1.errors, 0);
  // ん+しゅ: single n completes immediately
  const m2 = new Matcher('んしゅ', { now: fakeClock() });
  assert.strictEqual(m2.feed('n').event, 'unit');   // ん done
  assert.strictEqual(m2.feed('s').event, 'hold');   // しゅ…
  assert.strictEqual(m2.feed('h').event, 'hold');
  assert.strictEqual(m2.feed('u').event, 'done');
  assert.strictEqual(m2.errors, 0);
  // れんしゅう: full word
  const m3 = new Matcher('れんしゅう', { now: fakeClock() });
  'renshuu'.split('').forEach(c => m3.feed(c));
  assert.strictEqual(m3.finished, true);
  assert.strictEqual(m3.errors, 0);
});

test('sokuon: っか = kka', () => {
  const m = new Matcher('っか', { now: fakeClock() });
  ['k', 'k', 'a'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.unitCount(), 1); // っか merged into one unit
  assert.strictEqual(m.errors, 0);
});

test('wrong key burns the unit and the text continues (no soft-lock)', () => {
  const m = new Matcher('かさ', { now: fakeClock() });
  assert.strictEqual(m.feed('x').event, 'error'); // burn か
  assert.strictEqual(m.errors, 1);
  assert.strictEqual(m.unitPos, 1, 'unit burned and advanced');
  assert.strictEqual(m.stateAt(0), 'wrong');
  assert.strictEqual(m.feed('s').event, 'hold'); // さ continues normally
  assert.strictEqual(m.feed('a').event, 'done');
  assert.strictEqual(m.finished, true);
});

test('stats: wpm over injected clock', () => {
  const clock = fakeClock();
  const m = new Matcher('あい', { now: clock });
  m.feed('a');          // あ done at t=0
  clock.advance(60000); // one minute passes
  m.feed('i');          // い done at t=60000
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.wpm(), 2); // 2 units / 1 min
});

test('spaces and punctuation must be typed literally', () => {
  // full mixed sentence, driven by the same romajiFor the browser path uses
  const text = 'わたしは まいにち タイピングの れんしゅうを しています。';
  const keys = Matcher.romajiFor(text);
  const m = new Matcher(text, { now: fakeClock() });
  keys.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'keys=' + keys);
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
  // typing a letter while on the space unit burns the space and advances
  const m2 = new Matcher('わ た', { now: fakeClock() });
  m2.feed('w'); m2.feed('a');           // わ
  assert.strictEqual(m2.feed('x').event, 'error'); // 'x' where ' ' expected -> burn
  assert.strictEqual(m2.unitPos, 2, 'space unit burned and advanced');
  assert.strictEqual(m2.feed('t').event, 'hold');  // た continues
  assert.strictEqual(m2.feed('a').event, 'done');
});

test('katakana: カナ = kana', () => {
  const m = new Matcher('カナ', { now: fakeClock() });
  ['k', 'a', 'n', 'a'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('composed chars from OS IME accepted directly (かな fed as-is)', () => {
  const m = new Matcher('わたし', { now: fakeClock() });
  ['わ', 'た', 'し'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'IME composed kana should consume units');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('composed digraph units: きょ fed as き+ょ', () => {
  const m = new Matcher('きょうと', { now: fakeClock() });
  ['き', 'ょ'].forEach(c => m.feed(c));  // きょ merged unit
  ['う', 'と'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'composed chars must reassemble merged digraph units');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('greedy: unit completes on shortest exact reading (日=ni/nichi via injected dict)', () => {
  const dict = { '日': ['nichi', 'ni'], '本': ['hon'], '語': ['go'] };
  const m = new Matcher('日本語', { now: fakeClock(), dict: dict });
  'nihongo'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'ni must complete 日 and let hon/go follow');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('wrong key burns the unit and the text still completes (no soft-lock)', () => {
  const dict = { '日': ['nichi', 'ni'], '本': ['hon'], '語': ['go'] };
  const m = new Matcher('日本語', { now: fakeClock(), dict: dict });
  m.feed('q'); // wrong for 日(ni) -> burn, advance
  assert.strictEqual(m.errors, 1);
  assert.strictEqual(m.unitPos, 1, 'unit burned and advanced');
  'hongo'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'remaining text must complete after an error');

  const m2 = new Matcher('本', { now: fakeClock(), dict: dict });
  const ev = m2.feed('q'); // burn the only unit -> done with error
  assert.strictEqual(ev.event, 'done', 'burning the last unit must end the text');
  assert.strictEqual(m2.finished, true);
  assert.strictEqual(m2.errors, 1);
});
