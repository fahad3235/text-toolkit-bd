# Text Toolkit BD

![offline](https://img.shields.io/badge/offline-100%25-brightgreen) ![bilingual](https://img.shields.io/badge/EN-BN-blue) ![tests](https://img.shields.io/badge/tests-56%2F56_passing-brightgreen) ![smoke](https://img.shields.io/badge/smoke-38%2F38_passing-brightgreen) ![license](https://img.shields.io/badge/license-MIT-lightgrey)

A free, fully offline, bilingual (English / Bangla) text utility web app - case conversion, Base64, URL encoding, Morse code, text statistics, and find & replace with cleanup tools.

## The problem

Everyday text chores (changing case, Base64-encoding a token, URL-encoding a query, counting words, cleaning pasted lines) usually mean reaching for a random online tool - which sends your text to someone's server. For students, developers, and content writers in Bangladesh working with both English and Bangla text, there was no single offline, bilingual toolkit.

## Features

1. **Case converter** - UPPER / lower / Title Case / Sentence case / iNVERSE, with live output and copy button.
2. **Base64** - UTF-8-safe encode/decode (manual implementation, no `btoa`); invalid input shows an inline error. Bengali text round-trips exactly.
3. **URL encode/decode** - `encodeURIComponent` rules; malformed percent-encoding shows an inline error.
4. **Morse code** - full ITU set (A-Z, 0-9, and `. , ? ' ! / ( ) & : ; = + - _ " $ @`); letters separated by 1 space, words by 3 spaces; unknown characters/tokens become a U+2370 marker.
5. **Text stats** - characters, characters without spaces, words, sentences, lines, paragraphs, reading time at 200 wpm, and top-5 words (case-insensitive, punctuation-stripped).
6. **Find & replace** - find/replace/count, case-sensitive toggle, regex toggle (invalid regex shows an inline error), plus one-click cleanup: trim lines, remove blank lines, dedupe lines, collapse spaces.
7. **EN/Bangla toggle** - persisted in `localStorage`; all numbers render in Bengali digits in Bangla mode.

## Stack

Vanilla HTML + CSS + JavaScript. No frameworks, no CDN, no network calls - a single-page app that runs from `file://` or any static host.

**ASCII-source guarantee:** every source file is pure ASCII (verified with `grep -P "[^\x00-\x7F]"`). All Bengali text is emitted as `\uXXXX` escapes generated from a build-time string table, and Bengali digits are generated with `String.fromCharCode(0x09E6 + i)`.

## Prerequisites

- Any modern browser (for the app)
- Node.js >= 18 (for the unit tests and the smoke test)

## Install & run

```bash
# just open it - no build step
open index.html            # or serve it:
npx serve .                # then visit http://localhost:3000
```

## Dev commands

```bash
node --test tests/test.js  # 56 unit tests (case, base64, url, morse, stats, find/replace, cleanup, digits/i18n)
node smoke.mjs             # 38 headless-Chromium checks (desktop 1280px + mobile 390px, zero console errors)
grep -P "[^\x00-\x7F]" -l *.js *.html *.css tests/*.js  # ASCII-source check (expect no output)
```

## Environment

No environment variables, no API keys, no backend. App state lives in one `localStorage` key: `ttk-lang-v1` (language choice).

## Deployment (GitHub Pages)

```bash
# push the repo, then: Settings -> Pages -> Deploy from branch -> main -> / (root)
```

The app is a static site - everything works over GitHub Pages with no configuration.

## Limitations

- **Demo-grade tool.** Outputs are computed locally and are correct for the documented algorithms, but this is not a certified text-processing library - verify critical encodings independently.
- Base64 decode rejects anything that is not canonical padded Base64 or not valid UTF-8.
- Morse follows ITU International Morse; prosigns and non-Latin scripts are out of scope (unknown characters -> U+2370).
- Sentence counting is heuristic (splits on `.`/`!`/`?`); abbreviations like "e.g." will over-count.
- Reading time assumes 200 words per minute.
- Data never leaves the browser; clearing site data resets the language choice.

## Status

Complete and verified: 56/56 unit tests and 38/38 headless-Chromium smoke checks pass with zero console/page errors on desktop and 390px mobile. See `TEST_RESULTS.md` for the full QA record.
