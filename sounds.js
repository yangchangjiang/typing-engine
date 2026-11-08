/* sounds.js — Web Audio synthesized typing sounds. Zero audio files, zero network.
 * - click: short mechanical-key tick (noise burst + pitch-drop blip, random pitch)
 * - error: dull low buzz (clearly different from click)
 * - done: three-note chime on completion
 * AudioContext is created lazily on first user gesture (keydown) — autoplay-safe. */
(function (root) {
  'use strict';
  var ctx = null;
  var enabled = true;
  try { enabled = localStorage.getItem('tp_sound') !== 'off'; } catch (e) {}

  function ensure() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(c, dur) {
    var n = Math.max(1, Math.floor(c.sampleRate * dur));
    var buf = c.createBuffer(1, n, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    return buf;
  }

  function click() {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    var t = c.currentTime;
    var f = 1500 + Math.random() * 900; /* pitch varies per key — organic */
    /* high tick: filtered noise burst */
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 0.03);
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
    var ng = c.createGain();
    ng.gain.setValueAtTime(0.09, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp); hp.connect(ng); ng.connect(c.destination);
    src.start(t);
    /* body: triangle blip with fast pitch drop */
    var o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.028);
    var g = c.createGain();
    g.gain.setValueAtTime(0.11, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.06);
  }

  function error() {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    var t = c.currentTime;
    var o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.08);
    var g = c.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.1);
  }

  function done() {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    [523.25, 659.25, 783.99].forEach(function (f, i) {
      var t = c.currentTime + i * 0.09;
      var o = c.createOscillator(); o.type = 'triangle';
      o.frequency.value = f;
      var g = c.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + 0.24);
    });
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem('tp_sound', enabled ? 'on' : 'off'); } catch (e) {}
    return enabled;
  }

  root.TypingSounds = {
    click: click, error: error, done: done, toggle: toggle,
    isOn: function () { return enabled; }
  };
})(typeof self !== 'undefined' ? self : this);
