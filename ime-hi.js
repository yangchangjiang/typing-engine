/* ime-hi.js — HindiPhoneticMatcher: 天城文文本 ↔ 音译拉丁输入(ITRANS 风格)。
 * 用户敲每个字符下方标注的英文字母(क=k, ख=kh, ा=a, ट=T 卷舌大写),
 * 与中文拼音输入同构:显示天城文,打拉丁。无候选歧义(练习文本固定)。
 * ्(合字)/़(नुक्ता)自动跳过不敲;空格照敲;系统输入法合成的整字符也接受。
 * dict = window.__HIHINT__ (build-time injected; node 测试读 data/translit/hi.json) */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('fs'), require('path'));
  } else {
    root.HindiPhoneticMatcher = factory();
  }
})(typeof self !== 'undefined' ? self : this, function (fs, path) {
  'use strict';

  function loadDict() {
    if (fs && path) {
      try {
        var p = path.join(__dirname, 'data', 'translit', 'hi.json');
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (e) { return {}; }
    }
    return (typeof self !== 'undefined' ? self : globalThis).__HIHINT__ || {};
  }

  /* 每单元一个定长拉丁序列('' = 合字/नुक्ता,自动跳过不敲;未知字符=按原字输入) */
  function seqFor(unit, dict) {
    if (unit === ' ') return [' '];
    if (/^[A-Za-z0-9]$/.test(unit)) return [unit.toLowerCase()];
    var s = dict[unit];
    if (s === undefined || s === null) return [unit];
    return [s];
  }

  function Matcher(text, opts) {
    opts = opts || {};
    this.dict = opts.dict || loadDict();
    this.now = opts.now || Date.now;
    this.text = text;
    this.units = Array.from(text);
    this.unitPos = 0;
    this.buffer = '';
    this.errors = 0;
    this.errUnits = {};
    this.totalKeys = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.finished = false;
    this.skipEmpty();
  }

  /* 跳过零长单元(् ़):不占击键,自动算打对 */
  Matcher.prototype.skipEmpty = function () {
    while (this.unitPos < this.units.length &&
           seqFor(this.units[this.unitPos], this.dict)[0] === '') this.unitPos++;
    if (this.unitPos >= this.units.length) {
      this.finished = true;
      if (this.startedAt === null) this.startedAt = this.now();
      this.finishedAt = this.now();
    }
  };

  Matcher.prototype.unitAt = function (i) { return this.units[i]; };
  Matcher.prototype.unitCount = function () { return this.units.length; };
  Matcher.prototype.expectedKey = function () {
    if (this.unitPos >= this.units.length) return ' ';
    var seq = seqFor(this.units[this.unitPos], this.dict)[0];
    return seq ? seq[0] : this.units[this.unitPos];
  };
  Matcher.prototype.stateAt = function (i) {
    if (i < this.unitPos) return this.errUnits[i] ? 'wrong' : 'done';
    if (i === this.unitPos) return 'current';
    return 'pending';
  };
  Matcher.prototype.progress = function () {
    return Math.round(this.unitPos / Math.max(1, this.units.length) * 100);
  };

  Matcher.prototype.feed = function (ch) {
    if (this.finished) return { event: 'ignored' };
    if (typeof ch !== 'string' || ch.length !== 1) return { event: 'ignored' };
    if (this.startedAt === null) this.startedAt = this.now();
    this.totalKeys++;
    var unit = this.units[this.unitPos];
    if (ch === unit) {
      /* 系统输入法合成的整字符直接接受(与音译输入并存) */
      this.buffer = '';
      this.unitPos++;
      this.skipEmpty();
      return this.finished ? { event: 'done' } : { event: 'unit', correct: true };
    }
    var seq = seqFor(unit, this.dict)[0];
    this.buffer += ch; /* 区分大小写:ट=T vs त=t */
    if (this.buffer === seq) {
      this.unitPos++;
      this.buffer = '';
      this.skipEmpty();
      return this.finished ? { event: 'done' } : { event: 'unit', correct: true };
    }
    if (seq.indexOf(this.buffer) === 0) {
      /* 末单元收尾:精确命中即完成,勿永远等(ख 打 kh 即收) */
      if (this.buffer === seq && this.unitPos === this.units.length - 1) {
        this.unitPos++;
        this.buffer = '';
        this.finished = true;
        this.finishedAt = this.now();
        return { event: 'done' };
      }
      return { event: 'hold', correct: true };
    }
    /* 错键=烧掉本单元推进(与 zh/jp 一致,永不软锁死) */
    this.errors++;
    this.errUnits[this.unitPos] = true;
    this.buffer = '';
    this.unitPos++;
    this.skipEmpty();
    return this.finished ? { event: 'done', correct: false } : { event: 'error' };
  };

  Matcher.prototype.stop = function () {
    if (this.finished || this.startedAt === null) return;
    this.finished = true; this.finishedAt = this.now();
  };
  Matcher.prototype.elapsedMs = function () {
    return ((this.finishedAt !== null ? this.finishedAt : this.now()) - this.startedAt);
  };
  Matcher.prototype.accuracy = function () {
    var denom = Math.max(1, this.unitPos);
    return Math.round((denom - this.errors) / denom * 100);
  };
  Matcher.prototype.wpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round((this.unitPos - this.errors) / 5 / Math.max(m, 0.01));
  };
  Matcher.prototype.cpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round(this.totalKeys / Math.max(m, 0.01));
  };

  /* static: 全文拉丁键序列——测试/E2E 用 */
  Matcher.keysFor = function (text) {
    var m = new Matcher(text, {});
    var out = '';
    for (var i = 0; i < m.units.length; i++) {
      var seq = seqFor(m.units[i], m.dict)[0];
      out += seq !== '' ? seq : '';
    }
    return out;
  };

  return Matcher;
});
