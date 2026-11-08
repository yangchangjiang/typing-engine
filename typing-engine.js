/* typing-engine.js — DOM-free typing engine core.
 * UMD: usable in node (tests) and browser (window.TypingEngine).
 * Language-agnostic: the caller decides what "one character" means.
 * IME-aware usage: caller feeds COMPOSED characters; composition
 * intermediate keystrokes must be filtered by the caller (ime-*.js),
 * never passed into key().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TypingEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function Engine(text, opts) {
    if (typeof text !== 'string' || text.length === 0) {
      throw new Error('Engine requires a non-empty text string');
    }
    this.text = text;
    this.opts = opts || {};
    this.now = this.opts.now || Date.now;
    this.reset();
  }

  Engine.prototype.reset = function () {
    this.pos = 0;
    this.errors = 0;
    this.errMarks = {};      // index -> true (typo positions)
    this.startedAt = null;
    this.finishedAt = null;
    this.finished = false;
    this.lastEvent = null;
  };

  /* Feed one character. Returns {event:'ok'|'error'|'done'|'ignored', correct, pos}.
   * 'ignored' when: already finished, k is not a single printable char,
   * or pos already past the end. Timing starts on the first accepted key. */
  Engine.prototype.key = function (k) {
    if (this.finished) return { event: 'ignored', correct: null, pos: this.pos };
    if (typeof k !== 'string' || k.length !== 1) return { event: 'ignored', correct: null, pos: this.pos };
    if (this.pos >= this.text.length) return { event: 'ignored', correct: null, pos: this.pos };
    if (this.startedAt === null) this.startedAt = this.now();
    var correct = (k === this.text[this.pos]);
    if (!correct) { this.errors++; this.errMarks[this.pos] = true; }
    this.pos++;
    var done = this.pos >= this.text.length;
    if (done) { this.finished = true; this.finishedAt = this.now(); }
    var ev = { event: done ? 'done' : (correct ? 'ok' : 'error'), correct: correct, pos: this.pos };
    this.lastEvent = ev;
    return ev;
  };

  /* Stop the clock early (timer expiry). Idempotent. */
  Engine.prototype.stop = function () {
    if (this.finished || this.startedAt === null) return;
    this.finished = true;
    this.finishedAt = this.now();
  };

  Engine.prototype.elapsedMs = function () {
    var end = this.finishedAt !== null ? this.finishedAt : this.now();
    if (this.startedAt === null) return 0;
    return Math.max(0, end - this.startedAt);
  };

  Engine.prototype.correctCount = function () { return this.pos - this.errors; };

  /* Standard word-based WPM: 5 chars = 1 word. JP/KR use their own metric
   * (chars per minute) — callers can use correctCount()/elapsedMs() directly. */
  Engine.prototype.wpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round((this.correctCount() / 5) / Math.max(m, 0.001));
  };

  Engine.prototype.cpm = function () {
    var m = this.elapsedMs() / 60000;
    return Math.round(this.correctCount() / Math.max(m, 0.001));
  };

  Engine.prototype.accuracy = function () {
    return this.pos > 0 ? Math.round(this.correctCount() / this.pos * 100) : 100;
  };

  Engine.prototype.progress = function () {
    return Math.round(this.pos / this.text.length * 100);
  };

  /* char states for the renderer: 'pending' | 'current' | 'done' | 'wrong' */
  Engine.prototype.stateAt = function (i) {
    if (i < this.pos) return this.errMarks[i] ? 'wrong' : 'done';
    if (i === this.pos) return 'current';
    return 'pending';
  };

  /* unified adapter interface (shared with ime-jp/ime-kr matchers) */
  Engine.prototype.unitAt = function (i) { return this.text[i] || ''; };
  Engine.prototype.expectedKey = function () { return this.text[this.pos] || ' '; };

  return Engine;
});
