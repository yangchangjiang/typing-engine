/* ime-kr.test.js — dubeolsik matcher unit tests.
 * Run: node --test tests/ime-kr.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Matcher = require('../ime-kr.js');

function fakeClock() { let t = 0; const now = () => t; now.advance = ms => { t += ms; }; return now; }

test('composed chars from OS IME accepted directly (한글 fed as-is)', () => {
  const m = new Matcher('한글타자', { now: fakeClock() });
  ['한', '글', '타', '자'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'IME composed hangul should consume units');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('syllable decomposition: 한글 = gksrmf', () => {
  const m = new Matcher('한글', { now: fakeClock() });
  assert.strictEqual(m.keys, 'gksrmf');
  assert.strictEqual(m.unitCount(), 2);
});

test('안녕 = dkssud, full run completes with zero errors', () => {
  const m = new Matcher('안녕', { now: fakeClock() });
  'dkssud'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('wrong key marks the syllable wrong but continues', () => {
  const m = new Matcher('한', { now: fakeClock() });
  m.feed('x'); // wrong instead of g
  assert.strictEqual(m.errors, 1);
  m.feed('k'); m.feed('s'); m.feed('r'); m.feed('m'); m.feed('f');
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.stateAt(0), 'wrong');
});

test('mixed text: space and latin pass through', () => {
  const m = new Matcher('한글 abc', { now: fakeClock() });
  assert.ok(m.keys.includes(' '));
  assert.ok(m.keys.endsWith('abc'));
});

test('stats: cpm over injected clock', () => {
  const clock = fakeClock();
  const m = new Matcher('한글', { now: clock });
  'gksrm'.split('').forEach(c => m.feed(c));
  clock.advance(60000); // one minute
  m.feed('f');
  assert.strictEqual(m.cpm(), 6);
});
