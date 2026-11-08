/* ime-zh.js — ZhMatcher: 汉字文本 ↔ 拼音输入。
 * 显示汉字,用户敲该字的拼音字母(练习文本固定 → 无候选词歧义)。
 * 多音字所有读音都对(行 = xing / hang);固定练习取字典首读。
 * dict = window.__PINYIN__ (build-time injected; node 测试时读 data/pinyin.json)。 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('fs'), require('path'));
  } else {
    root.ZhMatcher = factory();
  }
})(typeof self !== 'undefined' ? self : this, function (fs, path) {
  'use strict';

  function loadDict() {
    if (fs && path) {
      try {
        var p = path.join(__dirname, 'data', 'pinyin.json');
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (e) { return {}; }
    }
    return root_self().__PINYIN__ || {};
  }
  function root_self() { return typeof self !== 'undefined' ? self : globalThis; }

  /* 中文全角标点 → 键盘物理键(中文输入法里句号就是按 . 键) */
  var PUNCT = {
    '。': '.', '，': ',', '、': '\\', '！': '!', '？': '?', '：': ':',
    '；': ';', '“': '"', '”': '"', '《': '<', '》': '>', '（': '(', '）': ')'
  };

  function sequencesFor(unit, dict) {
    var seqs = (dict && dict[unit]) || null;
    if (PUNCT[unit]) return [PUNCT[unit]];
    if (/^[A-Za-z0-9]$/.test(unit)) return [unit.toLowerCase()]; /* latin/digit typed as-is */
    if (!seqs) return [];
    /* v/ü 双写兼容:拼音输入法里敲 lv 和 lü 都出「绿」,字典存哪种都收两种 */
    var out = [];
    for (var i = 0; i < seqs.length; i++) {
      out.push(seqs[i]);
      if (seqs[i].indexOf('v') >= 0) out.push(seqs[i].replace(/v/g, 'ü'));
      else if (seqs[i].indexOf('ü') >= 0) out.push(seqs[i].replace(/ü/g, 'v'));
    }
    return out;
  }

  function Matcher(text, opts) {
    opts = opts || {};
    this.dict = opts.dict || loadDict();
    this.now = opts.now || Date.now;
    this.text = text;
    this.units = Array.from(text); /* each char is a unit */
    this.unitPos = 0;
    this.buffer = '';
    this.errors = 0;
    this.errUnits = {};
    this.totalKeys = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.finished = false;
  }

  Matcher.prototype.unitAt = function (i) { return this.units[i]; };
  Matcher.prototype.unitCount = function () { return this.units.length; };
  Matcher.prototype.expectedKey = function () {
    if (this.unitPos >= this.units.length) return ' ';
    var seqs = sequencesFor(this.units[this.unitPos], this.dict);
    return seqs.length ? seqs[0][0] : this.units[this.unitPos];
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
    var chars = [ch];
    var lastEvent = null;
    while (chars.length) {
      var c = chars.shift();
      var unit = this.units[this.unitPos];
      if (c === unit) {
        /* 系统输入法合成的整字符直接接受(与拼音模式并存) */
        this.buffer = '';
        this.unitPos++;
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); lastEvent = { event: 'done' }; continue; }
        lastEvent = { event: 'unit', correct: true };
        continue;
      }
      var seqs = sequencesFor(unit, this.dict);
      if (!seqs.length) {
        /* 无拼音单元(空格、标点):必须原字输入;打错=烧掉本单元推进(否则整篇软锁死) */
        this.errors++;
        this.errUnits[this.unitPos] = true;
        this.unitPos++;
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); lastEvent = { event: 'done', correct: false }; continue; }
        lastEvent = { event: 'error' };
        continue;
      }
      this.buffer += c.toLowerCase();
      var exact = seqs.indexOf(this.buffer) >= 0;
      var longer = seqs.some(function (s) { return s.length > this.buffer.length && s.indexOf(this.buffer) === 0; }, this);
      var anyPrefix = seqs.some(function (s) { return s.indexOf(this.buffer) === 0; }, this);
      if (exact && !longer) {
        /* 精确命中且不是更长读音的前缀 → 提交(蓝 lan 不在 la 截断,度 du/duo 取最长) */
        this.unitPos++;
        this.buffer = '';
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); lastEvent = { event: 'done' }; continue; }
        lastEvent = { event: 'unit', correct: true };
        continue;
      }
      if (anyPrefix) { lastEvent = { event: 'hold', correct: true }; continue; }
      /* buffer 不再是任何读音的前缀 → 用最长已匹配读音提交,余下字符回喂下一个单元
       * (速度自然 suduziran: du 遇到 z 溢出提交 度,自 接住 z) */
      var best = null;
      for (var j = 0; j < seqs.length; j++) {
        var R = seqs[j];
        if (this.buffer.indexOf(R) === 0 && (!best || R.length > best.length)) best = R;
      }
      if (best) {
        var rest = this.buffer.slice(best.length);
        this.buffer = '';
        this.unitPos++;
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); lastEvent = { event: 'done' }; }
        else lastEvent = { event: 'unit', correct: true };
        for (var k = rest.length - 1; k >= 0; k--) chars.unshift(rest[k]);
        continue;
      }
      this.errors++;
      this.errUnits[this.unitPos] = true;
      this.buffer = '';
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); lastEvent = { event: 'done', correct: false }; }
      else lastEvent = { event: 'error' };
    }
    /* 末字收尾:最后单元的 hold 若已精确命中读音,自动提交完成
     * (文本以 数(shu⊂shuo)收尾时,打完 shu 即结束,勿让用户永远等第四个键) */
    if (lastEvent && lastEvent.event === 'hold' && this.unitPos === this.units.length - 1) {
      var lu = this.units[this.unitPos];
      var lseqs = sequencesFor(lu, this.dict);
      if (lseqs.length && lseqs.indexOf(this.buffer) >= 0) {
        this.unitPos++;
        this.buffer = '';
        this.finished = true;
        this.finishedAt = this.now();
        return { event: 'done' };
      }
    }
    return lastEvent || { event: 'ignored' };
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

  /* static: 全文本拼音键序列(每个单元取首个读音)——测试/E2E 用,勿手写同款转换 */
  Matcher.keysFor = function (text) {
    var m = new Matcher(text, {});
    var out = '';
    for (var i = 0; i < m.units.length; i++) {
      var seqs = sequencesFor(m.units[i], m.dict);
      out += seqs.length ? seqs[0] : m.units[i];
    }
    return out;
  };

  return Matcher;
});
