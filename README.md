# typing-engine

Dependency-free JavaScript typing engine + input matchers for 14 languages.
This is the engine that powers [typingpractice.tools](https://typingpractice.tools) —
a free, no-account touch-typing practice site ([14-language demos →](https://typingpractice.tools/)).

## What's inside

| File | Purpose |
|------|---------|
| `typing-engine.js` | Core typing engine: per-keystroke matching, WPM/accuracy/CPM, per-key error tracking |
| `ime-zh.js` | Chinese pinyin matcher (polyphone-aware, buffer-based, subtitle-style annotation data) |
| `ime-jp.js` | Japanese romaji matcher (all valid variants accepted, ん/っ/拗音 rules) |
| `ime-kr.js` | Korean 두벌식 matcher (jamo decomposition + roman-keys fallback) |
| `ime-hi.js` | Hindi phonetic matcher (ITRANS-style: क=k, ख=kh, retroflex ट=T; halant/nukta auto-skip) |
| `ime-translit.js` | Generic transliteration matcher (Thai RTGS-style, Arabic Arabizi, Russian phonetic) |
| `keyboard.js` | On-screen keyboard renderer with finger zones + weak-key heatmap |
| `sounds.js` | Zero-asset Web Audio sound effects |
| `data/keymaps/*.json` | 9 keyboard layouts: QWERTY, AZERTY, QWERTZ, ЙЦУКЕН, JIS kana, 두벌식, Kedmanee, Arabic 101, InScript — verified against kbdlayout.info / official layout specs |
| `data/translit/*.json` | hi / th / ar / ru character→latin-sequence maps |
| `data/kana_romaji.json` | Kana→romaji variant table |
| `data/pinyin.json` | Hanzi→pinyin dictionary (derived from open pinyin datasets) |

## Design principles

- **Both input paths always work.** Every matcher accepts OS-composed characters
  (what a local-keyboard user produces) *and* its latin sequence (what a
  visitor without that keyboard types). `ch === unit` short-circuits the latin
  path — dual input is a core invariant, not a fallback.
- **No soft-locks.** A wrong key burns the current unit and advances — the text
  always completes, mirroring the latin engine's behavior.
- **Silent marks auto-skip.** Hindi halant/nukta, Thai tone marks, Arabic
  diacritics, Russian soft/hard signs never require a keystroke.
- **Deterministic per-unit sequences.** Practice texts are fixed, so each
  grapheme maps to exactly one latin string — no candidate disambiguation.
- **Zero dependencies, zero build step.** Plain ES5-compatible JS; works in a
  browser `<script>` tag or in Node via CommonJS.

## Usage

```js
const Matcher = require('./ime-hi.js'); // any matcher follows the same API

const m = new Matcher('नमस्ते दुनिया');
for (const ch of 'nmste duniya') m.feed(ch);
console.log(m.finished, m.errors); // true, 0

// static helper: full latin key sequence for a text (testing/E2E)
Matcher.keysFor('का'); // 'ka'
```

In a browser, load the file and construct with your text — the hindi/th/ar/ru
matchers read their character map from `window.__HIHINT__` / `window.__TRANSLIT__`
(or pass `{ dict }` explicitly).

## API (all matchers)

- `new Matcher(text, { dict?, now? })`
- `feed(ch)` → `{ event: 'done'|'unit'|'hold'|'error'|'ignored', correct? }`
- `unitAt(i)`, `unitCount()`, `stateAt(i)` ('done'|'current'|'pending'|'wrong')
- `progress()`, `accuracy()`, `wpm()`, `cpm()`, `elapsedMs()`, `stop()`
- `expectedKey()` — next physical key (for keyboard highlighting)

## Tests

```sh
node --test tests/
```

## License

MIT. The pinyin dictionary in `data/pinyin.json` derives from open pinyin
datasets and remains under its own permissive terms.
