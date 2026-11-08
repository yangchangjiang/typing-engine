/* keyboard.js — renders a REAL keyboard around a keymap (data/keymaps/*.json,
 * injected at build time as window.__KEYMAP__) and highlights the next expected key.
 *
 * Data rows are the typeable core only; the standard ANSI modifier frame
 * (Backspace/Tab/Caps/Enter/Shifts/Ctrl/Win/Alt/Space) is structural chrome
 * added here. Real widths (1.25u/1.5u/1.75u/2.25u/2.75u/6.25u) produce the
 * physical keyboard stagger automatically — no manual offsets. */
(function (root) {
  'use strict';

  var FINGER_CLASS = {
    'l-pinky': 'f1', 'l-ring': 'f2', 'l-mid': 'f3', 'l-index': 'f4',
    'r-index': 'f5', 'r-mid': 'f6', 'r-ring': 'f7', 'r-pinky': 'f8',
    'thumb': 'f9'
  };

  /* shift symbols for the ANSI number/symbol row (decorative, real keyboard look) */
  var SHIFT_SYM = { '`': '~', '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^',
    '7': '&', '8': '*', '9': '(', '0': ')', '-': '_', '=': '+', '[': '{', ']': '}',
    ';': ':', "'": '"', ',': '<', '.': '>', '/': '?', '\\': '|' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* one typeable key: optional shift-symbol on top, main glyph center */
  function keyHtml(k, keymap) {
    var f = FINGER_CLASS[keymap.fingers[k] || ''] || '';
    var label = keymap.labels && keymap.labels[k] ? keymap.labels[k] : k;
    var top = keymap.shift && keymap.shift[k] ? keymap.shift[k]
      : (keymap.labels && keymap.labels[k] ? k : (SHIFT_SYM[k] || ''));
    return '<div class="key ' + f + '" data-key="' + esc(k) + '">'
      + (top ? '<span class="k-top">' + esc(top) + '</span>' : '')
      + '<span class="k-main">' + esc(label) + '</span></div>';
  }

  /* structural modifier key — not typeable, not highlightable */
  function modHtml(cls, glyph, wide) {
    return '<div class="key mod ' + cls + ' ' + wide + '"><span class="k-main">' + glyph + '</span></div>';
  }

  function render(container, keymap) {
    if (!keymap) return;
    var rows = keymap.rows;
    var html = '';

    /* Row 0: numbers + Backspace (2u) */
    html += '<div class="kb-row">' + rows[0].map(function (k) { return keyHtml(k, keymap); }).join('')
      + modHtml('f8', '⌫', 'w2') + '</div>';

    /* Row 1: Tab (1.5u) + letters */
    html += '<div class="kb-row">' + modHtml('f1', 'Tab', 'w1-5')
      + rows[1].map(function (k) { return keyHtml(k, keymap); }).join('')
      + '</div>';

    /* Row 2: Caps (1.75u) + letters + Enter */
    var enterW = rows[2].length === 11 ? 'w2-25' : 'w1-25';
    html += '<div class="kb-row">' + modHtml('f1', 'Caps', 'w1-75')
      + rows[2].map(function (k) { return keyHtml(k, keymap); }).join('')
      + modHtml('f8', '⏎', enterW) + '</div>';

    /* Row 3: Shift (2.25u) + letters + Shift (2.75u) */
    html += '<div class="kb-row">' + modHtml('f1', '⇧', 'w2-25')
      + rows[3].map(function (k) { return keyHtml(k, keymap); }).join('')
      + modHtml('f8', '⇧', 'w2-75') + '</div>';

    /* Row 4: Ctrl/Win/Alt + space(s) from data + Alt/Win/Menu/Ctrl */
    var bottom = keymap.bottom && keymap.bottom.length ? keymap.bottom : [{ key: ' ', label: 'space', finger: 'thumb' }];
    var mid = bottom.map(function (b) {
      var f = FINGER_CLASS[b.finger] || '';
      return '<div class="key wide ' + f + '" data-key="' + esc(b.key) + '">'
        + '<span class="k-main">' + esc(b.label || b.key) + '</span></div>';
    }).join('');
    var midW = bottom.length === 1 ? 'w6-25' : 'w3-5';
    html += '<div class="kb-row">' + modHtml('f1', '⌃', 'w1-25') + modHtml('f9', '⊞', 'w1-25')
      + modHtml('f9', 'Alt', 'w1-25')
      + mid.replace('class="key wide ', 'class="key wide ' + midW + ' ')
      + modHtml('f9', 'Alt', 'w1-25') + modHtml('f9', '≣', 'w1-25')
      + modHtml('f9', '⌃', 'w1-25') + '</div>';

    container.innerHTML = html;
    container.__keys = {};
    container.__labels = {};
    container.__shift = {};
    container.querySelectorAll('.key:not(.mod)').forEach(function (el) {
      var dk = el.getAttribute('data-key');
      container.__keys[dk] = el;
      var main = el.querySelector('.k-main');
      var top = el.querySelector('.k-top');
      if (main && main.textContent !== dk) container.__labels[main.textContent] = el;
      if (top) container.__shift[top.textContent] = el;
    });
  }

  /* find the key element for a typed/expected char: physical key first,
   * then language label (th/ar/hi/ru), then shift symbol. */
  function findKey(container, ch) {
    if (ch === ' ') return container.__keys[' '] || null;
    var up = String(ch).toUpperCase();
    return container.__keys[up] || container.__keys[ch]
      || container.__labels[ch] || container.__labels[up]
      || container.__shift[ch] || container.__shift[up] || null;
  }

  function highlight(container, ch) {
    if (!container.__keys) return;
    Object.keys(container.__keys).forEach(function (x) {
      container.__keys[x].classList.remove('hit');
      container.__keys[x].classList.remove('heat');
    });
    var el = findKey(container, ch);
    if (el) el.classList.add('hit');
  }

  /* 弱键热区:errMap = {键: 错误次数},--hx = 0..1 强度(最高错键为 1) */
  function heat(container, errMap) {
    if (!container.__keys || !errMap) return;
    Object.keys(container.__keys).forEach(function (x) {
      var el = container.__keys[x];
      el.classList.remove('heat');
      el.style.removeProperty('--hx');
    });
    var max = 1;
    Object.keys(errMap).forEach(function (k) { if (errMap[k] > max) max = errMap[k]; });
    Object.keys(errMap).forEach(function (k) {
      var el = findKey(container, k);
      if (el) {
        el.classList.add('heat');
        el.style.setProperty('--hx', (0.35 + 0.65 * errMap[k] / max).toFixed(2));
      }
    });
  }

  /* physical press/release feedback on the key actually typed (not the next key) */
  function press(container, ch) {
    if (!container.__keys || typeof ch !== 'string' || ch.length !== 1) return;
    var el = findKey(container, ch);
    if (el) el.classList.add('pressed');
  }
  function release(container, ch) {
    if (!container.__keys || typeof ch !== 'string' || ch.length !== 1) return;
    var el = findKey(container, ch);
    if (el) el.classList.remove('pressed');
  }

  root.Keyboard = { render: render, highlight: highlight, press: press, release: release, heat: heat };
})(typeof self !== 'undefined' ? self : this);
