/* engine.test.js — node:test unit tests for the typing engine core.
 * Run: node --test tests/engine.test.js
 * No dependencies. Time is injected (opts.now) so assertions are deterministic.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../typing-engine.js');

function fakeClock(start) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('correct keys produce ok events and zero errors', () => {
  const e = new Engine('abc', { now: fakeClock(1000000) });
  assert.strictEqual(e.key('a').event, 'ok');
  assert.strictEqual(e.key('b').event, 'ok');
  const last = e.key('c');
  assert.strictEqual(last.event, 'done');
  assert.strictEqual(e.errors, 0);
  assert.strictEqual(e.accuracy(), 100);
  assert.strictEqual(e.finished, true);
});

test('wrong keys are marked and counted, accuracy drops', () => {
  const e = new Engine('abc', { now: fakeClock(1000000) });
  const ev = e.key('x');
  assert.strictEqual(ev.event, 'error');
  assert.strictEqual(ev.correct, false);
  assert.strictEqual(e.errors, 1);
  assert.strictEqual(e.stateAt(0), 'wrong');
  e.key('b'); e.key('c');
  assert.strictEqual(e.accuracy(), 67); // 2/3
});

test('ignored keys: modifiers, after finish, overrun', () => {
  const e = new Engine('ab', { now: fakeClock(1000000) });
  assert.strictEqual(e.key('Shift').event, 'ignored');
  assert.strictEqual(e.key('a').event, 'ok');
  e.key('b'); // done
  assert.strictEqual(e.finished, true);
  assert.strictEqual(e.key('x').event, 'ignored');
  assert.strictEqual(e.pos, 2);
});

test('timer starts on first key, wpm uses elapsed', () => {
  const clock = fakeClock(1_000_000);
  const e = new Engine('aaaaa bbbbb', { now: clock }); // 11 chars
  e.key('a'); // starts clock
  clock.advance(30_000);
  for (const c of 'aaaa bbbbb') e.key(c);
  assert.strictEqual(e.finished, true);
  assert.strictEqual(e.elapsedMs(), 30_000);
  // 11 correct chars = 2.2 words in 0.5 min => 4 wpm
  assert.strictEqual(e.wpm(), 4);
  assert.strictEqual(e.cpm(), 22);
});

test('stop() freezes the clock once, wpm computable after timeout', () => {
  const clock = fakeClock(2_000_000);
  const e = new Engine('aaaaa', { now: clock });
  e.key('a');
  clock.advance(60_000);
  e.stop();
  assert.strictEqual(e.finished, true);
  assert.strictEqual(e.elapsedMs(), 60_000);
  clock.advance(999_999);
  assert.strictEqual(e.elapsedMs(), 60_000); // frozen
});

test('progress and stateAt coverage', () => {
  const e = new Engine('abcd', { now: fakeClock(1) });
  assert.strictEqual(e.stateAt(0), 'current');
  assert.strictEqual(e.stateAt(2), 'pending');
  e.key('a');
  assert.strictEqual(e.stateAt(0), 'done');
  assert.strictEqual(e.stateAt(1), 'current');
  assert.strictEqual(e.progress(), 25);
});

test('reset returns to initial state', () => {
  const e = new Engine('ab', { now: fakeClock(1) });
  e.key('a'); e.key('x');
  assert.strictEqual(e.errors, 1);
  e.reset();
  assert.strictEqual(e.pos, 0);
  assert.strictEqual(e.errors, 0);
  assert.strictEqual(e.finished, false);
  assert.strictEqual(e.startedAt, null);
});

test('empty text throws', () => {
  assert.throws(() => new Engine(''), /non-empty/);
});
