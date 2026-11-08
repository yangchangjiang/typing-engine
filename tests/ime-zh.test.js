/* ime-zh.test.js — ZhMatcher pinyin tests (node:test, zero deps). */
const test = require('node:test');
const assert = require('node:assert');
const Matcher = require('../ime-zh.js');

function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms) => { t += ms; }
  };
}

test('basic chars: 我 = wo', () => {
  const m = new Matcher('我', { now: fakeClock().now });
  m.feed('w');
  assert.strictEqual(m.feed('o').event, 'done');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('composed chars from OS IME accepted directly (汉字 fed as-is)', () => {
  const m = new Matcher('你好世界', { now: fakeClock().now });
  ['你', '好', '世', '界'].forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'IME composed hanzi should consume units');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('multi-char: 中文 = zhong + wen', () => {
  const m = new Matcher('中文', { now: fakeClock().now });
  'zhongwen'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('greedy: 度 completes on du (not held by longer reading duo)', () => {
  const m = new Matcher('速度自然', { now: fakeClock().now });
  'suduziran'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'du must complete 度 and let 自 follow');
  assert.strictEqual(m.errors, 0);
  assert.strictEqual(m.accuracy(), 100);
});

test('multi-reading chars: all readings accepted (行 = xing / hang)', () => {
  const m1 = new Matcher('行', { now: fakeClock().now });
  'xing'.split('').forEach(c => m1.feed(c));
  assert.strictEqual(m1.finished, true, 'xing should complete 行');
  const m2 = new Matcher('行', { now: fakeClock().now });
  'hang'.split('').forEach(c => m2.feed(c));
  assert.strictEqual(m2.finished, true, 'hang should also complete 行');
});

test('spaces and punctuation typed literally', () => {
  const text = '你好 世界。';
  const keys = Matcher.keysFor(text);
  const m = new Matcher(text, { now: fakeClock().now });
  keys.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'keys=' + keys);
  assert.strictEqual(m.errors, 0);
  // wrong key on the space unit burns it and advances
  const m2 = new Matcher('你 好', { now: fakeClock().now });
  m2.feed('n'); m2.feed('i');           // 你
  assert.strictEqual(m2.feed('x').event, 'error');
  assert.strictEqual(m2.unitPos, 2, 'space unit burned and advanced');
  m2.feed('h'); m2.feed('a'); m2.feed('o'); // 好
  assert.strictEqual(m2.finished, true);
});

test('latin/digits in text typed as-is', () => {
  const m = new Matcher('A1', { now: fakeClock().now });
  m.feed('a');
  assert.strictEqual(m.feed('1').event, 'done');
  assert.strictEqual(m.errors, 0);
});

test('keysFor matches first reading and feeds clean', () => {
  const text = '春眠不觉晓';
  const keys = Matcher.keysFor(text);
  assert.strictEqual(keys, 'chunmianbujuexiao');
  const m = new Matcher(text, { now: fakeClock().now });
  keys.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);
});

test('stats: accuracy, cpm timing', () => {
  const clk = fakeClock();
  const m = new Matcher('你好', { now: clk.now });
  'ni'.split('').forEach(c => m.feed(c));
  clk.advance(30000);
  'hao'.split('').forEach(c => m.feed(c)); // totalKeys=5, 2 units, 30s
  m.stop();
  assert.strictEqual(m.accuracy(), 100);
  assert.strictEqual(m.cpm(), 10); // 5 keys / 0.5 min
});

test('fullwidth punctuation typed via physical keys (。->. ,，->, ,、->backslash)', () => {
  const m = new Matcher('打。', { now: fakeClock().now });
  m.feed('d'); m.feed('a');
  assert.strictEqual(m.feed('.').event, 'done', 'period key completes 。 (last unit)');
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0);

  const m2 = new Matcher('好，', { now: fakeClock().now });
  m2.feed('h'); m2.feed('a'); m2.feed('o');
  assert.strictEqual(m2.feed(',').event, 'done', 'comma key completes ， (last unit)');

  const m3 = new Matcher('你、我', { now: fakeClock().now });
  m3.feed('n'); m3.feed('i');
  assert.strictEqual(m3.feed('\\').event, 'unit', 'backslash key completes 、');
  m3.feed('w'); m3.feed('o');
  assert.strictEqual(m3.finished, true);
  assert.strictEqual(m3.errors, 0);
});

test('v/ü both accepted for ü-pinyin chars (lv as in real IMEs)', () => {
  const m = new Matcher('绿色', { now: fakeClock().now });
  m.feed('l'); m.feed('v'); m.feed('s'); m.feed('e');
  assert.strictEqual(m.finished, true, 'lvse completes 绿色');
  assert.strictEqual(m.errors, 0);

  const m2 = new Matcher('绿色', { now: fakeClock().now });
  m2.feed('l'); m2.feed('ü'); m2.feed('s'); m2.feed('e');
  assert.strictEqual(m2.finished, true, 'lüse also completes 绿色');
  assert.strictEqual(m2.errors, 0);

  const m3 = new Matcher('旅行', { now: fakeClock().now });
  m3.feed('l'); m3.feed('v'); m3.feed('x'); m3.feed('i'); m3.feed('n'); m3.feed('g');
  assert.strictEqual(m3.finished, true);
  assert.strictEqual(m3.errors, 0);
});

test('longest-match: 蓝 takes lan not la; 数 at text end auto-commits on shu', () => {
  const m = new Matcher('蓝色', { now: fakeClock().now });
  m.feed('l'); m.feed('a'); m.feed('n'); m.feed('s'); m.feed('e');
  assert.strictEqual(m.finished, true);
  assert.strictEqual(m.errors, 0, 'lanse must type 蓝色 cleanly (la must not steal 蓝)');

  const m2 = new Matcher('分数', { now: fakeClock().now });
  'fenshu'.split('').forEach(c => m2.feed(c));
  assert.strictEqual(m2.finished, true, 'shu at text end commits 数 immediately');
  assert.strictEqual(m2.errors, 0);

  const m3 = new Matcher('太阳', { now: fakeClock().now });
  'taiyang'.split('').forEach(c => m3.feed(c));
  assert.strictEqual(m3.finished, true, 'ta must not steal 太');
  assert.strictEqual(m3.errors, 0);

  const m4 = new Matcher('速度自然', { now: fakeClock().now });
  'suduziran'.split('').forEach(c => m4.feed(c));
  assert.strictEqual(m4.finished, true, 'du spills into 度 when z follows');
  assert.strictEqual(m4.errors, 0);
});

test('wrong key burns the unit and the text still completes (no soft-lock)', () => {
  const m = new Matcher('你好世界', { now: fakeClock().now });
  m.feed('q'); // wrong for 你(ni) -> burn 你, advance
  assert.strictEqual(m.errors, 1);
  assert.strictEqual(m.unitPos, 1, 'unit burned and advanced');
  'haoshijie'.split('').forEach(c => m.feed(c));
  assert.strictEqual(m.finished, true, 'remaining text must complete after an error');
  assert.ok(m.errors >= 1);

  const m2 = new Matcher('好', { now: fakeClock().now });
  const ev = m2.feed('q'); // burn the only unit -> done with error
  assert.strictEqual(ev.event, 'done', 'burning the last unit must end the text');
  assert.strictEqual(m2.finished, true);
  assert.strictEqual(m2.errors, 1);
});
