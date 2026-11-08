/* ime-kr.js — Korean dubeolsik (두벌식) matcher. DOM-free, node-testable.
 * A Hangul syllable decomposes into jamo; each jamo maps to one dubeolsik key.
 * The matcher consumes keystrokes against the expected key sequence, one
 * syllable at a time — display shows Hangul, matching runs on keys.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DubeolsikMatcher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
  var JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
  var CHO_KEY = {'ㄱ':'r','ㄲ':'R','ㄴ':'s','ㄷ':'e','ㄸ':'E','ㄹ':'f','ㅁ':'a','ㅂ':'q','ㅃ':'Q','ㅅ':'t','ㅆ':'T','ㅇ':'d','ㅈ':'w','ㅉ':'W','ㅊ':'c','ㅋ':'z','ㅌ':'x','ㅍ':'v','ㅎ':'g'};
  var JUNG_KEY = {'ㅏ':'k','ㅐ':'o','ㅑ':'i','ㅒ':'O','ㅓ':'j','ㅔ':'p','ㅕ':'u','ㅖ':'P','ㅗ':'h','ㅘ':'hk','ㅙ':'ho','ㅚ':'hl','ㅛ':'y','ㅜ':'n','ㅝ':'nj','ㅞ':'np','ㅟ':'nl','ㅠ':'b','ㅡ':'m','ㅢ':'ml','ㅣ':'l'};
  var JONG_KEY = {'ㄱ':'r','ㄲ':'R','ㄳ':'rt','ㄴ':'s','ㄵ':'st','ㄶ':'sw','ㄷ':'e','ㄹ':'f','ㄺ':'fr','ㄻ':'fa','ㄼ':'fq','ㄽ':'ft','ㄾ':'fx','ㄿ':'fv','ㅀ':'fg','ㅁ':'a','ㅂ':'q','ㅄ':'qt','ㅅ':'t','ㅆ':'T','ㅇ':'d','ㅈ':'w','ㅊ':'c','ㅋ':'z','ㅌ':'x','ㅍ':'v','ㅎ':'g'};

  function syllableKeys(syll) {
    var cp = syll.codePointAt(0);
    if (cp >= 0xAC00 && cp <= 0xD7A3) {
      var base = cp - 0xAC00;
      var cho = Math.floor(base / 588);
      var jung = Math.floor((base % 588) / 28);
      var jong = base % 28;
      return (CHO_KEY[CHO[cho]] || '') + (JUNG_KEY[JUNG[jung]] || '') + (jong > 0 ? (JONG_KEY[JONG[jong]] || '') : '');
    }
    // non-syllable (space, punctuation, latin) → typed directly
    return syll.toLowerCase();
  }

  function tokenize(text) {
    var keys = '';
    var units = []; // {char, keys}
    Array.from(text).forEach(function (ch) {
      var k = syllableKeys(ch);
      keys += k;
      units.push({ char: ch, keys: k });
    });
    return { keys: keys, units: units };
  }

  function Matcher(hangulText, opts) {
    this.now = (opts && opts.now) || Date.now;
    this.setText(hangulText);
  }
  Matcher.prototype.setText = function (text) {
    this.text = text;
    var t = tokenize(text);
    this.keys = t.keys;
    this.units = t.units;
    this.unitPos = 0;
    this.keyPos = 0;
    this.totalKeys = 0;
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
    return Math.round((this.totalKeys - this.errors) / Math.max(m, 0.001));
  };
  Matcher.prototype.accuracy = function () {
    return this.totalKeys > 0 ? Math.round((this.totalKeys - this.errors) / this.totalKeys * 100) : 100;
  };
  Matcher.prototype.progress = function () {
    return this.units.length ? Math.round(this.unitPos / this.units.length * 100) : 0;
  };
  Matcher.prototype.stateAt = function (i) {
    if (i === this.unitPos) return this.errUnits[i] ? 'wrong' : 'current';
    if (i < this.unitPos) return this.errUnits[i] ? 'wrong' : 'done';
    return 'pending';
  };
  Matcher.prototype.currentUnit = function () { return (this.units[this.unitPos] || {}).char || ''; };
  Matcher.prototype.unitAt = function (i) { return (this.units[i] || {}).char || ''; };
  Matcher.prototype.expectedKey = function () {
    var u = this.units[this.unitPos];
    if (!u) return ' ';
    if (!u.keys.length) return u.char.toLowerCase();
    return u.keys[Math.min(this.keyPos, u.keys.length - 1)] || ' ';
  };

  Matcher.prototype.feed = function (ch) {
    if (this.finished) return { event: 'ignored' };
    if (typeof ch !== 'string' || ch.length !== 1) return { event: 'ignored' };
    if (this.startedAt === null) this.startedAt = this.now();
    if (this.unitPos >= this.units.length) {
      this.finished = true; this.finishedAt = this.now();
      return { event: 'done' };
    }
    var unit = this.units[this.unitPos];
    if (ch === unit.char) {
      /* 系统输入法合成的整字符直接接受(与 두벌식 模式并存) */
      this.keyPos = 0;
      this.totalKeys++;
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
      return { event: 'unit', correct: true };
    }
    var expected = unit.keys;
    if (!expected.length) { // non-decomposable char typed directly
      this.unitPos++;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
      return { event: 'unit', correct: true };
    }
    var want = expected[Math.min(this.keyPos, expected.length - 1)];
    var correct = (ch.toLowerCase() === want.toLowerCase());
    this.keyPos++;
    this.totalKeys++;
    if (!correct) { this.errors++; this.errUnits[this.unitPos] = true; }
    if (this.keyPos >= expected.length) {
      this.unitPos++;
      this.keyPos = 0;
      if (this.unitPos >= this.units.length) { this.finished = true; this.finishedAt = this.now(); return { event: 'done' }; }
      return { event: 'unit', correct: correct };
    }
    return { event: 'key', correct: correct };
  };
  /* static: dubeolsik key sequence for a hangul text */
  Matcher.keysFor = function (text) { return new Matcher(text, {}).keys; };
  Matcher.prototype.stop = function () {
    if (this.finished || this.startedAt === null) return;
    this.finished = true; this.finishedAt = this.now();
  };
  return Matcher;
});
