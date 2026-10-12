/* text-toolkit-bd - offline bilingual (EN/BN) text utilities.
 * Pure-logic functions are exported for node --test; DOM wiring runs only in a browser.
 * HARD RULE: this file must stay pure ASCII. Bengali strings are appended at the
 * bottom as \uXXXX escapes (generated from /tmp/bn.json, never committed literally).
 */
'use strict';

const L = {};

L.VERSION = '1.0.0';
L.LANG_KEY = 'ttk-lang-v1';
L.UNKNOWN = '\u2370'; // placeholder replaced with \u2370 escape below by build step

/* ---------- Bengali digits ---------- */
L.toBnDigits = function (s) {
  return String(s).replace(/[0-9]/g, (d) => String.fromCharCode(0x09e6 + Number(d)));
};
L.fmtNum = function (n, lang) {
  const s = String(n);
  return lang === 'bn' ? L.toBnDigits(s) : s;
};

/* ---------- Case converter ---------- */
L.changeCase = function (mode, s) {
  switch (mode) {
    case 'upper': return s.toUpperCase();
    case 'lower': return s.toLowerCase();
    case 'title': return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
    case 'sentence':
      return s.toLowerCase().replace(/(^\s*[a-z])|([.!?]\s*[a-z])/g, (c) => c.toUpperCase());
    case 'inverse':
      return [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    default: return s;
  }
};

/* ---------- Base64 (UTF-8 safe, no btoa) ---------- */
const B64A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64EncodeBytes(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += B64A[(n >> 18) & 63] + B64A[(n >> 12) & 63]
      + (i + 1 < bytes.length ? B64A[(n >> 6) & 63] : '=')
      + (i + 2 < bytes.length ? B64A[n & 63] : '=');
  }
  return out;
}
L.b64EncodeText = function (s) {
  return b64EncodeBytes(new TextEncoder().encode(s));
};
L.b64DecodeText = function (s) {
  const t = s.trim();
  if (t.length === 0 || t.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(t)) {
    return { ok: false, text: '', error: 'invalidB64' };
  }
  const rev = {};
  for (let i = 0; i < 64; i++) rev[B64A[i]] = i;
  const bytes = [];
  for (let i = 0; i < t.length; i += 4) {
    const q = t.slice(i, i + 4);
    const vals = [rev[q[0]], rev[q[1]], q[2] === '=' ? 0 : rev[q[2]], q[3] === '=' ? 0 : rev[q[3]]];
    if (vals.some((v) => v === undefined)) return { ok: false, text: '', error: 'invalidB64' };
    if ((q[2] === '=' && q[3] !== '=') || (q[0] === '=' || q[1] === '=')) {
      return { ok: false, text: '', error: 'invalidB64' };
    }
    const n = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
    if (q[2] === '=') bytes.length -= 2;
    else if (q[3] === '=') bytes.length -= 1;
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)), error: null };
  } catch (e) {
    return { ok: false, text: '', error: 'invalidB64' };
  }
};

/* ---------- URL encode/decode ---------- */
L.urlEncodeText = function (s) { return encodeURIComponent(s); };
L.urlDecodeText = function (s) {
  try {
    return { ok: true, text: decodeURIComponent(s), error: null };
  } catch (e) {
    return { ok: false, text: '', error: 'invalidUrl' };
  }
};

/* ---------- Morse (ITU) ---------- */
L.MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....',
  6: '-....', 7: '--...', 8: '---..', 9: '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};
L.MORSE_REV = {};
for (const k of Object.keys(L.MORSE)) L.MORSE_REV[L.MORSE[k]] = k;

L.morseEncode = function (s) {
  const words = s.toUpperCase().split(/\s+/).filter((w) => w.length > 0);
  return words
    .map((w) => [...w].map((ch) => L.MORSE[ch] || L.UNKNOWN).join(' '))
    .join('   ');
};
L.morseDecode = function (s) {
  const words = s.trim().split(/ {3,}|\t|\n/).filter((w) => w.length > 0);
  return words
    .map((w) => w.split(' ').filter((x) => x.length > 0).map((tok) => L.MORSE_REV[tok] || L.UNKNOWN).join(''))
    .join(' ');
};

/* ---------- Text stats ---------- */
L.textStats = function (t) {
  const chars = [...t].length;
  const charsNoSpaces = [...t.replace(/\s/g, '')].length;
  const trimmed = t.trim();
  const wordsArr = trimmed === '' ? [] : trimmed.split(/\s+/);
  const words = wordsArr.length;
  const sentences = words === 0 ? 0
    : t.split(/[.!?]+/).filter((x) => x.trim().length > 0).length;
  const lines = t === '' ? 0 : t.split('\n').length;
  const paragraphs = words === 0 ? 0
    : t.split(/\n\s*\n/).filter((x) => x.trim().length > 0).length;
  const readingSeconds = Math.ceil((words / 200) * 60);
  const freq = new Map();
  for (const w of wordsArr) {
    const clean = w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (clean === '') continue;
    freq.set(clean, (freq.get(clean) || 0) + 1);
  }
  const topWords = [...freq.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));
  return { chars, charsNoSpaces, words, sentences, lines, paragraphs, readingSeconds, topWords };
};
L.readingTimeStr = function (secs, lang) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return L.fmtNum(m, lang) + ' ' + L.t('minUnit', lang) + ' ' + L.fmtNum(s, lang) + ' ' + L.t('secUnit', lang);
};

/* ---------- Find & replace ---------- */
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
L.findReplace = function (text, find, repl, opts) {
  const o = opts || {};
  if (!find) return { ok: false, count: 0, result: text, error: 'emptyFind' };
  let re;
  try {
    re = new RegExp(o.regex ? find : escapeRegExp(find), 'g' + (o.caseSensitive ? '' : 'i'));
  } catch (e) {
    return { ok: false, count: 0, result: text, error: 'badRegex' };
  }
  const count = (text.match(re) || []).length;
  const result = o.regex ? text.replace(re, repl) : text.replace(re, () => repl);
  return { ok: true, count, result, error: null };
};

/* ---------- Cleanup helpers ---------- */
L.trimLines = function (t) { return t.split('\n').map((l) => l.trim()).join('\n'); };
L.removeBlankLines = function (t) { return t.split('\n').filter((l) => l.trim() !== '').join('\n'); };
L.dedupeLines = function (t) {
  const seen = new Set();
  return t.split('\n').filter((l) => (seen.has(l) ? false : (seen.add(l), true))).join('\n');
};
L.collapseSpaces = function (t) { return t.replace(/[ \t]{2,}/g, ' '); };

/* ---------- i18n ---------- */
L.STR = {};
L.STR.en = {
  appTitle: 'Text Toolkit BD',
  appTag: 'Offline bilingual text utilities',
  tabCase: 'Case', tabB64: 'Base64', tabUrl: 'URL', tabMorse: 'Morse', tabStats: 'Stats', tabFind: 'Find & Replace',
  inputLabel: 'Input', outputLabel: 'Output',
  copyBtn: 'Copy', copiedMsg: 'Copied!', copyFailMsg: 'Copy failed - select and copy manually',
  clearBtn: 'Clear', emptyHint: 'Type or paste text above to see the result.',
  caseModeLabel: 'Mode', caseUpper: 'UPPER CASE', caseLower: 'lower case',
  caseTitle: 'Title Case', caseSentence: 'Sentence case', caseInverse: 'iNVERSE cASE',
  b64EncBtn: 'Encode', b64DecBtn: 'Decode', errInvalidB64: 'Invalid Base64 input.',
  b64Hint: 'UTF-8 safe: Bengali text works too.',
  urlEncBtn: 'Encode', urlDecBtn: 'Decode', errInvalidUrl: 'Invalid percent-encoding.',
  urlHint: 'Uses encodeURIComponent rules.',
  morseEncBtn: 'Encode', morseDecBtn: 'Decode',
  morseHint: 'ITU code: letters separated by 1 space, words by 3 spaces. Unknown characters become \u2370.',
  statsBtn: 'Analyze',
  sChars: 'Characters', sCharsNoSpaces: 'Characters (no spaces)', sWords: 'Words',
  sSentences: 'Sentences', sLines: 'Lines', sParagraphs: 'Paragraphs',
  sReading: 'Reading time', sTopWords: 'Top words',
  minUnit: 'min', secUnit: 'sec', statsEmpty: 'Enter some text and press Analyze.',
  findLabel: 'Find', replLabel: 'Replace with', findBtn: 'Count', replaceBtn: 'Replace all',
  caseSens: 'Case sensitive', regexMode: 'Regex', findCountMsg: '{n} matches found',
  errEmptyFind: 'Enter text to find.', errBadRegex: 'Invalid regular expression.',
  cleanTitle: 'Cleanup', cleanTrim: 'Trim lines', cleanBlank: 'Remove blank lines',
  cleanDedupe: 'Dedupe lines', cleanSpaces: 'Collapse spaces', appliedMsg: 'Done.',
  disclaimer: 'Demo-grade offline tool. All processing happens in your browser - no data leaves this page.',
  footerOffline: '100% offline, no network calls',
};
L.STR.bn = {
  "appTag": "\u0985\u09ab\u09b2\u09be\u0987\u09a8 \u09a6\u09cd\u09ac\u09bf\u09ad\u09be\u09b7\u09bf\u0995 \u099f\u09c7\u0995\u09cd\u09b8\u099f \u0987\u0989\u099f\u09bf\u09b2\u09bf\u099f\u09bf",
  "appTitle": "\u099f\u09c7\u0995\u09cd\u09b8\u099f \u099f\u09c1\u09b2\u0995\u09bf\u099f \u09ac\u09bf\u09a1\u09bf",
  "appliedMsg": "\u09b9\u09af\u09bc\u09c7 \u0997\u09c7\u099b\u09c7\u0964",
  "b64DecBtn": "\u09a1\u09bf\u0995\u09cb\u09a1",
  "b64EncBtn": "\u098f\u09a8\u0995\u09cb\u09a1",
  "b64Hint": "UTF-8 \u09a8\u09bf\u09b0\u09be\u09aa\u09a6: \u09ac\u09be\u0982\u09b2\u09be \u099f\u09c7\u0995\u09cd\u09b8\u099f\u0993 \u099a\u09b2\u09ac\u09c7\u0964",
  "caseInverse": "\u09ac\u09bf\u09aa\u09b0\u09c0\u09a4 \u0995\u09c7\u09b8",
  "caseLower": "\u099b\u09cb\u099f \u09b9\u09be\u09a4\u09c7\u09b0",
  "caseModeLabel": "\u09ae\u09cb\u09a1",
  "caseSens": "\u0995\u09c7\u09b8 \u09b8\u0982\u09ac\u09c7\u09a6\u09a8\u09b6\u09c0\u09b2",
  "caseSentence": "\u09ac\u09be\u0995\u09cd\u09af \u0995\u09c7\u09b8",
  "caseTitle": "\u099f\u09be\u0987\u099f\u09c7\u09b2 \u0995\u09c7\u09b8",
  "caseUpper": "\u09ac\u09a1\u09bc \u09b9\u09be\u09a4\u09c7\u09b0",
  "cleanBlank": "\u0996\u09be\u09b2\u09bf \u09b2\u09be\u0987\u09a8 \u09ae\u09c1\u099b\u09c1\u09a8",
  "cleanDedupe": "\u09a1\u09c1\u09aa\u09cd\u09b2\u09bf\u0995\u09c7\u099f \u09b2\u09be\u0987\u09a8 \u09ae\u09c1\u099b\u09c1\u09a8",
  "cleanSpaces": "\u09b8\u09cd\u09aa\u09c7\u09b8 \u0995\u09ae\u09be\u09a8",
  "cleanTitle": "\u09aa\u09b0\u09bf\u09b7\u09cd\u0995\u09be\u09b0",
  "cleanTrim": "\u09b2\u09be\u0987\u09a8 \u099f\u09cd\u09b0\u09bf\u09ae",
  "clearBtn": "\u09ae\u09c1\u099b\u09c1\u09a8",
  "copiedMsg": "\u0995\u09aa\u09bf \u09b9\u09af\u09bc\u09c7\u099b\u09c7!",
  "copyBtn": "\u0995\u09aa\u09bf \u0995\u09b0\u09c1\u09a8",
  "copyFailMsg": "\u0995\u09aa\u09bf \u09ac\u09cd\u09af\u09b0\u09cd\u09a5 \u2014 \u09a8\u09bf\u099c\u09c7 \u09b8\u09bf\u09b2\u09c7\u0995\u09cd\u099f \u0995\u09b0\u09c7 \u0995\u09aa\u09bf \u0995\u09b0\u09c1\u09a8",
  "disclaimer": "\u09a1\u09c7\u09ae\u09cb-\u09ae\u09be\u09a8\u09c7\u09b0 \u0985\u09ab\u09b2\u09be\u0987\u09a8 \u099f\u09c1\u09b2\u0964 \u09b8\u09ac \u09aa\u09cd\u09b0\u09b8\u09c7\u09b8\u09bf\u0982 \u0986\u09aa\u09a8\u09be\u09b0 \u09ac\u09cd\u09b0\u09be\u0989\u099c\u09be\u09b0\u09c7\u0987 \u09b9\u09af\u09bc \u2014 \u0995\u09cb\u09a8\u09cb \u09a1\u09c7\u099f\u09be \u098f\u0987 \u09aa\u09c7\u099c \u099b\u09be\u09a1\u09bc\u09c7 \u09a8\u09be\u0964",
  "emptyHint": "\u09ab\u09b2\u09be\u09ab\u09b2 \u09a6\u09c7\u0996\u09a4\u09c7 \u0989\u09aa\u09b0\u09c7 \u099f\u09c7\u0995\u09cd\u09b8\u099f \u09b2\u09bf\u0996\u09c1\u09a8 \u09ac\u09be \u09aa\u09c7\u09b8\u09cd\u099f \u0995\u09b0\u09c1\u09a8\u0964",
  "errBadRegex": "\u09ad\u09c1\u09b2 \u09b0\u09c7\u0997\u09c1\u09b2\u09be\u09b0 \u098f\u0995\u09cd\u09b8\u09aa\u09cd\u09b0\u09c7\u09b6\u09a8\u0964",
  "errEmptyFind": "\u0996\u09cb\u0981\u099c\u09be\u09b0 \u099f\u09c7\u0995\u09cd\u09b8\u099f \u09b2\u09bf\u0996\u09c1\u09a8\u0964",
  "errInvalidB64": "\u09ad\u09c1\u09b2 Base64 \u0987\u09a8\u09aa\u09c1\u099f\u0964",
  "errInvalidUrl": "\u09ad\u09c1\u09b2 \u09aa\u09be\u09b0\u09cd\u09b8\u09c7\u09a8\u09cd\u099f-\u098f\u09a8\u0995\u09cb\u09a1\u09bf\u0982\u0964",
  "findBtn": "\u0997\u09c1\u09a8\u09c1\u09a8",
  "findCountMsg": "{n}\u099f\u09bf \u09ae\u09bf\u09b2 \u09aa\u09be\u0993\u09af\u09bc\u09be \u0997\u09c7\u099b\u09c7",
  "findLabel": "\u0996\u09c1\u0981\u099c\u09c1\u09a8",
  "footerOffline": "\u09e7\u09e6\u09e6% \u0985\u09ab\u09b2\u09be\u0987\u09a8 \u00b7 \u0995\u09cb\u09a8\u09cb \u09a8\u09c7\u099f\u0993\u09af\u09bc\u09be\u09b0\u09cd\u0995 \u0995\u09b2 \u09a8\u09c7\u0987",
  "inputLabel": "\u0987\u09a8\u09aa\u09c1\u099f",
  "minUnit": "\u09ae\u09bf\u09a8\u09bf\u099f",
  "morseDecBtn": "\u09a1\u09bf\u0995\u09cb\u09a1",
  "morseEncBtn": "\u098f\u09a8\u0995\u09cb\u09a1",
  "morseHint": "ITU \u0995\u09cb\u09a1: \u0985\u0995\u09cd\u09b7\u09b0\u09c7\u09b0 \u09ae\u09be\u099d\u09c7 \u09e7 \u09b8\u09cd\u09aa\u09c7\u09b8, \u09b6\u09ac\u09cd\u09a6\u09c7\u09b0 \u09ae\u09be\u099d\u09c7 \u09e9 \u09b8\u09cd\u09aa\u09c7\u09b8\u0964 \u0985\u099c\u09be\u09a8\u09be \u0985\u0995\u09cd\u09b7\u09b0 \u2370 \u09b9\u09ac\u09c7\u0964",
  "outputLabel": "\u0986\u0989\u099f\u09aa\u09c1\u099f",
  "regexMode": "\u09b0\u09c7\u099c\u09c7\u0995\u09cd\u09b8",
  "replLabel": "\u09af\u09be \u09a6\u09bf\u09af\u09bc\u09c7 \u09ac\u09a6\u09b2\u09be\u09ac\u09c7\u09a8",
  "replaceBtn": "\u09b8\u09ac \u09ac\u09a6\u09b2\u09be\u09a8",
  "sChars": "\u0985\u0995\u09cd\u09b7\u09b0",
  "sCharsNoSpaces": "\u0985\u0995\u09cd\u09b7\u09b0 (\u09b8\u09cd\u09aa\u09c7\u09b8 \u099b\u09be\u09a1\u09bc\u09be)",
  "sLines": "\u09b2\u09be\u0987\u09a8",
  "sParagraphs": "\u0985\u09a8\u09c1\u099a\u09cd\u099b\u09c7\u09a6",
  "sReading": "\u09aa\u09a1\u09bc\u09be\u09b0 \u09b8\u09ae\u09af\u09bc",
  "sSentences": "\u09ac\u09be\u0995\u09cd\u09af",
  "sTopWords": "\u09b8\u09c7\u09b0\u09be \u09b6\u09ac\u09cd\u09a6",
  "sWords": "\u09b6\u09ac\u09cd\u09a6",
  "secUnit": "\u09b8\u09c7\u0995\u09c7\u09a8\u09cd\u09a1",
  "statsBtn": "\u09ac\u09bf\u09b6\u09cd\u09b2\u09c7\u09b7\u09a3",
  "statsEmpty": "\u0995\u09bf\u099b\u09c1 \u099f\u09c7\u0995\u09cd\u09b8\u099f \u09b2\u09bf\u0996\u09c7 \u09ac\u09bf\u09b6\u09cd\u09b2\u09c7\u09b7\u09a3 \u099a\u09be\u09aa\u09c1\u09a8\u0964",
  "tabB64": "\u09ac\u09c7\u09b8\u09ec\u09ea",
  "tabCase": "\u0995\u09c7\u09b8",
  "tabFind": "\u0996\u09c1\u0981\u099c\u09c1\u09a8 \u0993 \u09ac\u09a6\u09b2\u09be\u09a8",
  "tabMorse": "\u09ae\u09cb\u09b0\u09cd\u09b8",
  "tabStats": "\u09aa\u09b0\u09bf\u09b8\u0982\u0996\u09cd\u09af\u09be\u09a8",
  "tabUrl": "\u0987\u0989\u0986\u09b0\u098f\u09b2",
  "urlDecBtn": "\u09a1\u09bf\u0995\u09cb\u09a1",
  "urlEncBtn": "\u098f\u09a8\u0995\u09cb\u09a1",
  "urlHint": "encodeURIComponent \u09a8\u09bf\u09af\u09bc\u09ae \u09ac\u09cd\u09af\u09ac\u09b9\u09be\u09b0 \u0995\u09b0\u09c7\u0964",
};
L.t = function (key, lang) {
  return (L.STR[lang] && L.STR[lang][key]) || L.STR.en[key] || key;
};

/* ---------- Browser UI ---------- */
L.UI = {};
if (typeof document !== 'undefined') {
  L.UI.init = function () {
    const $ = (id) => document.getElementById(id);
    let lang = 'en';
    try { lang = localStorage.getItem(L.LANG_KEY) || 'en'; } catch (e) { /* storage off */ }
    if (lang !== 'bn') lang = 'en';
    const state = { stats: null, findCount: null };

    function applyLang() {
      document.documentElement.lang = lang;
      document.title = L.t('appTitle', lang);
      document.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = L.t(el.getAttribute('data-i18n'), lang);
      });
      $('langToggle').textContent = lang === 'en' ? '\u09AC\u09BE\u0982\u09B2\u09BE' : 'English';
      renderCase(); renderStats(); renderFindCount();
    }
    function setErr(tab, key) {
      const el = $('err-' + tab);
      if (!key) { el.hidden = true; el.textContent = ''; return; }
      el.hidden = false; el.textContent = L.t(key, lang);
    }
    function setOut(tab, value) {
      const el = $('out-' + tab);
      el.value = value || '';
      $('hint-' + tab).hidden = !!(value);
      $('copy-' + tab).disabled = !(value);
    }
    function showNote(tab, msgKey) {
      const el = $('note-' + tab);
      el.textContent = L.t(msgKey, lang);
      el.hidden = false;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.hidden = true; }, 1600);
    }

    /* tabs */
    const tabIds = ['case', 'b64', 'url', 'morse', 'stats', 'find'];
    function selectTab(id) {
      tabIds.forEach((x) => {
        document.querySelector('[data-tab="' + x + '"]').setAttribute('aria-selected', x === id ? 'true' : 'false');
        $('panel-' + x).hidden = x !== id;
      });
    }
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => selectTab(b.getAttribute('data-tab')));
    });

    /* case tab */
    let caseMode = 'upper';
    function renderCase() {
      const v = $('in-case').value;
      setOut('case', v ? L.changeCase(caseMode, v) : '');
    }
    $('in-case').addEventListener('input', renderCase);
    document.querySelectorAll('input[name="caseMode"]').forEach((r) => {
      r.addEventListener('change', () => { caseMode = r.value; renderCase(); });
    });

    /* copy buttons */
    tabIds.forEach((tab) => {
      if (tab === 'stats' || tab === 'find') return;
      $('copy-' + tab).addEventListener('click', async () => {
        const ok = await copyText($('out-' + tab).value);
        showNote(tab, ok ? 'copiedMsg' : 'copyFailMsg');
      });
      $('clear-' + tab).addEventListener('click', () => {
        $('in-' + tab).value = '';
        if (tab === 'case') renderCase();
        else { setOut(tab, ''); setErr(tab, null); }
        $('in-' + tab).focus();
      });
    });

    /* base64 */
    $('b64EncBtn').addEventListener('click', () => {
      setErr('b64', null);
      const v = $('in-b64').value;
      setOut('b64', v ? L.b64EncodeText(v) : '');
    });
    $('b64DecBtn').addEventListener('click', () => {
      const r = L.b64DecodeText($('in-b64').value);
      setErr('b64', r.ok ? null : 'errInvalidB64');
      setOut('b64', r.ok ? r.text : '');
    });

    /* url */
    $('urlEncBtn').addEventListener('click', () => {
      setErr('url', null);
      const v = $('in-url').value;
      setOut('url', v ? L.urlEncodeText(v) : '');
    });
    $('urlDecBtn').addEventListener('click', () => {
      const r = L.urlDecodeText($('in-url').value);
      setErr('url', r.ok ? null : 'errInvalidUrl');
      setOut('url', r.ok ? r.text : '');
    });

    /* morse */
    $('morseEncBtn').addEventListener('click', () => {
      const v = $('in-morse').value;
      setOut('morse', v ? L.morseEncode(v) : '');
    });
    $('morseDecBtn').addEventListener('click', () => {
      const v = $('in-morse').value;
      setOut('morse', v ? L.morseDecode(v) : '');
    });

    /* stats */
    function renderStats() {
      const st = state.stats;
      const rows = $('statsRows');
      if (!st) { rows.hidden = true; $('hint-stats').hidden = false; return; }
      rows.hidden = false; $('hint-stats').hidden = true;
      const cell = (k, val) => {
        const tr = document.createElement('tr');
        const a = document.createElement('td'); a.textContent = L.t(k, lang);
        const b = document.createElement('td'); b.textContent = val;
        tr.append(a, b); return tr;
      };
      rows.replaceChildren(
        cell('sChars', L.fmtNum(st.chars, lang)),
        cell('sCharsNoSpaces', L.fmtNum(st.charsNoSpaces, lang)),
        cell('sWords', L.fmtNum(st.words, lang)),
        cell('sSentences', L.fmtNum(st.sentences, lang)),
        cell('sLines', L.fmtNum(st.lines, lang)),
        cell('sParagraphs', L.fmtNum(st.paragraphs, lang)),
        cell('sReading', L.readingTimeStr(st.readingSeconds, lang)),
      );
      const top = $('topWords');
      top.replaceChildren();
      if (st.topWords.length === 0) { top.hidden = true; }
      else {
        top.hidden = false;
        const cap = document.createElement('caption');
        top.append(cap);
        for (const w of st.topWords) {
          const tr = document.createElement('tr');
          const a = document.createElement('td'); a.textContent = w.word;
          const b = document.createElement('td'); b.textContent = L.fmtNum(w.count, lang);
          tr.append(a, b); top.append(tr);
        }
      }
    }
    $('statsBtn').addEventListener('click', () => {
      state.stats = L.textStats($('in-stats').value);
      renderStats();
    });

    /* find & replace */
    function renderFindCount() {
      const el = $('findCount');
      if (state.findCount === null) { el.hidden = true; return; }
      el.hidden = false;
      el.textContent = L.t('findCountMsg', lang).replace('{n}', L.fmtNum(state.findCount, lang));
    }
    function runFind() {
      const r = L.findReplace($('in-find').value, $('findText').value, $('replText').value,
        { caseSensitive: $('caseSens').checked, regex: $('regexMode').checked });
      setErr('find', r.ok ? null : (r.error === 'badRegex' ? 'errBadRegex' : 'errEmptyFind'));
      state.findCount = r.ok ? r.count : null;
      renderFindCount();
      return r;
    }
    $('findBtn').addEventListener('click', runFind);
    $('replaceBtn').addEventListener('click', () => {
      const r = runFind();
      if (r.ok) { $('in-find').value = r.result; showNote('find', 'appliedMsg'); }
    });
    [['cleanTrim', L.trimLines], ['cleanBlank', L.removeBlankLines],
     ['cleanDedupe', L.dedupeLines], ['cleanSpaces', L.collapseSpaces]].forEach(([id, fn]) => {
      $(id).addEventListener('click', () => {
        $('in-find').value = fn($('in-find').value);
        showNote('find', 'appliedMsg');
      });
    });
    $('copy-find').addEventListener('click', async () => {
      const ok = await copyText($('in-find').value);
      showNote('find', ok ? 'copiedMsg' : 'copyFailMsg');
    });
    $('clear-find').addEventListener('click', () => {
      $('in-find').value = ''; state.findCount = null; renderFindCount(); setErr('find', null);
      $('in-find').focus();
    });

    /* language toggle */
    $('langToggle').addEventListener('click', () => {
      lang = lang === 'en' ? 'bn' : 'en';
      try { localStorage.setItem(L.LANG_KEY, lang); } catch (e) { /* storage off */ }
      applyLang();
    });

    applyLang();
    selectTab('case');
    window.__ttk = { version: L.VERSION };
  };

  async function copyText(str) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    } catch (e) { return false; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', L.UI.init);
  } else {
    L.UI.init();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = L;
}
