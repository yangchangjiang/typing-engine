/* ime-jp.js — Japanese romaji-mode matcher (DOM-free, node-testable).
 * Turns a kana text into "units" (かな, digraphs, っ doubling) and consumes
 * romaji keystrokes greedily. All legal variants are accepted (し=shi/si).
 * The matcher keeps its own stats (units done, errors, elapsed) — it does NOT
 * use TypingEngine, because one kana unit = a variable-length keystroke run.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    const fs = require('fs');
    const path = require('path');
    module.exports = factory({
      load: function () {
        return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'kana_romaji.json'), 'utf-8'));
      }
    });
  } else {
    root.RomajiMatcher = factory({ load: function () { return window.__KANA_ROMAJI__ || { units: {}, katakana: {} }; } });
  }
})(typeof self !== 'undefined' ? self : this, function (loader) {
  'use strict';

  function buildDict(data) {
    var dict = {};
    Object.keys(data.units || {}).forEach(function (k) {
      dict[k] = data.units[k].split(/\s+/);
    });
    Object.keys(data.katakana || {}).forEach(function (k) {
      dict[k] = data.katakana[k].split(/\s+/);
    });
    // 促音规则:っ/ッ + 子音开头单元 → 合法输入 = 后一单元首字母双写 + 后一单元
    Object.keys(dict).forEach(function (k) {
      if (k === 'っ' || k === 'ッ') {
        dict[k] = ['ltu', 'xtu', '']; // '' handled contextually below
      }
    });
    return dict;
  }

  function isDigraphStart(ch) {
    return 'きしちにひみりぎじぢびぴキシチニヒミリギジヂビピ'.indexOf(ch) >= 0;
  }
  function isSmallYa(ch) { return 'ゃゅょャュョ'.indexOf(ch) >= 0; }

  function tokenize(text, dict) {
    var units = [];
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var two = ch + (text[i + 1] || '');
      if (isDigraphStart(ch) && isSmallYa(text[i + 1] || '') && dict[two]) {
        units.push(two); i++;
      } else if (ch === 'っ' || ch === 'ッ') {
        var nxt = text[i + 1] || '';
        var seqs = dict[nxt];
        if (seqs && seqs.length) {
          // 促音 + 后续单元:合法输入 = 首字母双写 + 后续单元原序列
          units.push('っ' + nxt);
          i++;
        } else {
          units.push(ch);
        }
      } else {
        units.push(ch);
      }
    }
    return units;
  }

  function sequencesFor(unit, dict) {
    if (unit.length === 2 && unit[0] === 'っ') {
      var base = dict[unit[1]] || [];
      return base.filter(function (s) { return s.length > 0; })
        .map(function (s) { return s[0] + s; });
    }
    return (dict[unit] || []).filter(function (s) { return s.length > 0; });
  }

  function Matcher(kanaText, opts) {
    this.now = (opts && opts.now) || Date.now;
    this.dictOverride = opts && opts.dict; /* test seam: inject a custom dict */
    this.setText(kanaText);
  }
  Matcher.prototype.setText = function (text) {
    this.text = text;
    if (this.dictOverride) {
      var d = {};
      Object.keys(this.dictOverride).forEach(function (k) {
        var v = this.dictOverride[k];
        d[k] = Array.isArray(v) ? v : String(v).split(/\s+/);
      }, this);
      this.dict = d;
    } else {
      this.dict = buildDict(loader.load());
    }
    this.units = tokenize(text, this.dict);
    this.unitPos = 0;
    this.buffer = '';
    this.errors = 0;
    this.errUnits = {};
    this.startedAt = null;
    this.finishedAt = null;
    this.finished = false;
  };
  Matcher.prototype.unitCount = function () { return this.units.length; };
  Matcher.prototype.elapsedMs = function () {
    var end = this.finishedAt !== null ? this.finishedAt : this.now();
    if (this.startedAt === null) return 0;
    return Math.max(0, end - this.startedAt);
  };
  Matcher.prototype.wpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round((this.unitPos - this.errors) / Math.max(m, 0.001));
  };
  Matcher.prototype.cpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round((this.unitPos - this.errors) / Math.max(m, 0.001));
  };
  Matcher.prototype.accuracy = function () {
    return this.unitPos > 0 ? Math.round((this.unitPos - this.errors) / this.unitPos * 100) : 100;
  };
  Matcher.prototype.progress = function () {
    return this.units.length ? Math.round(this.unitPos / this.units.length * 100) : 0;
  };
  Matcher.prototype.stateAt = function (i) {
    if (i === this.unitPos) return this.errUnits[i] ? 'wrong' : 'current';
    if (i < this.unitPos) return this.errUnits[i] ? 'wrong' : 'done';
    return 'pending';
  };
  Matcher.prototype.currentUnit = function () { return this.units[this.unitPos] || ''; };
  Matcher.prototype._nextStartsWithVowel = function () {
    var nu = this.units[this.unitPos + 1];
    if (!nu) return false;
    var s = sequencesFor(nu, this.dict);
    if (!s.length) return false; /* 空格/标点无序列 ≠ 元音开头 */
    var first = s[0][0] || '';
    return 'aiueoy'.indexOf(first) >= 0;
  };
  Matcher.prototype.unitAt = function (i) { return this.units[i] || ''; };
  Matcher.prototype.expectedKey = function () {
    var unit = this.units[this.unitPos] || '';
    var seqs = sequencesFor(unit, this.dict);
    if (!seqs.length) return unit || ' ';
    if (this.buffer) {
      for (var i = 0; i < seqs.length; i++) {
        if (seqs[i].indexOf(this.buffer) === 0) return seqs[i][this.buffer.length] || ' ';
      }
    }
    return seqs[0][0] || ' ';
  };

  /* feed one lowercase romaji char. Returns:
   * {event:'hold'}  — buffer still waiting for more chars
   * {event:'unit', correct} — a kana unit completed
   * {event:'error'} — buffer can never match; buffer cleared, error counted
   * {event:'done'}  — last unit completed
   * {event:'ignored'} — finished or non-letter input */
  Matcher.prototype.feed = function (ch) {
    if (this.finished) return { event: 'ignored' };
    if (typeof ch !== 'string' || ch.length !== 1) return { event: 'ignored' };
    if (this.startedAt === null) this.startedAt = this.now();
    if (this.unitPos >= this.units.length) {
      this.finished = true; this.finishedAt = this.now();
      return { event: 'done' };
    }
    var unit = this.units[this.unitPos];
    if (ch === unit) {
      /* 系统输入法合成的整字符直接接受(与罗马字模式并存) */
      this.buffer = '';
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
      return { event: 'unit', correct: true };
    }
    if (ch.charCodeAt(0) > 127) {
      /* 非 ASCII = 系统输入法合成字符:按单元逐字累积,兼容拗音合并单元(きょ = き+ょ) */
      this.imeBuf = (this.imeBuf || '') + ch;
      if (this.imeBuf === unit) {
        this.imeBuf = '';
        this.unitPos++;
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
        return { event: 'unit', correct: true };
      }
      if (unit.indexOf(this.imeBuf) === 0 && this.imeBuf.length < unit.length) {
        return { event: 'hold', correct: true };
      }
      this.errors++;
      this.errUnits[this.unitPos] = true;
      this.imeBuf = '';
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done', correct: false }; }
      return { event: 'error' };
    }
    this.imeBuf = '';
    var seqs = sequencesFor(unit, this.dict);
    if (!seqs.length) {
      // 无字典单元(空格、句号等):必须原字输入
      if (ch === unit) {
        this.unitPos++;
        if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
        return { event: 'unit', correct: true };
      }
      this.errors++;
      this.errUnits[this.unitPos] = true;
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done', correct: false }; }
      return { event: 'error' };
    }
    this.buffer += ch;
    var exact = seqs.indexOf(this.buffer) >= 0;
    var prefix = seqs.some(function (s) { return s.indexOf(this.buffer) === 0; }, this);
    if (exact) {
      /* 贪心:精确命中即完成单元。多读音(日=ni/nichi)取最短可用——真实输入法行为。
       * 唯一例外:ん 后接元音/y 开头单元时需要等第二个 n(ん 歧义)。 */
      var nAmbig = this.buffer === 'n' && (unit === 'ん' || unit === 'ン') && this._nextStartsWithVowel();
      if (nAmbig) return { event: 'hold' };
      this.unitPos++;
      this.buffer = '';
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
      return { event: 'unit', correct: true };
    }
    if (prefix) return { event: 'hold' };
    // impossible: count one error, burn the unit and advance (was: unit NOT consumed -> whole text soft-locked)
    this.errors++;
    this.errUnits[this.unitPos] = true;
    this.buffer = '';
    this.unitPos++;
    if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done', correct: false }; }
    return { event: 'error' };
  };
  /* static: full romaji sequence for a kana text (first valid variant per unit).
   * ん before a vowel-starting unit uses 'nn' to resolve the ambiguity. */
  Matcher.romajiFor = function (text) {
    var m = new Matcher(text, {});
    var out = '';
    for (var i = 0; i < m.units.length; i++) {
      var unit = m.units[i];
      if (unit === 'ん' || unit === 'ン') {
        var nu = m.units[i + 1];
        var s = nu ? sequencesFor(nu, m.dict) : [];
        out += s.length && 'aiueoy'.indexOf((s[0] || '')[0]) >= 0 ? 'nn' : 'n';
        continue;
      }
      var seqs = sequencesFor(unit, m.dict);
      out += seqs.length ? seqs[0] : unit;
    }
    return out;
  };
  Matcher.prototype.stop = function () {
    if (this.finished || this.startedAt === null) return;
    this.finished = true; this.finishedAt = this.now();
  };
  return Matcher;
});
