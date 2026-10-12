/* Unit tests for text-toolkit-bd - run with: node --test tests/test.js */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../app.js');

const PARA = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.\n\nSecond paragraph here.';

describe('case converter', () => {
  it('upper', () => assert.equal(L.changeCase('upper', 'Hello World'), 'HELLO WORLD'));
  it('lower', () => assert.equal(L.changeCase('lower', 'AbC xYz'), 'abc xyz'));
  it('title', () => assert.equal(L.changeCase('title', 'hello brave new world'), 'Hello Brave New World'));
  it('sentence capitalizes after . ! ?', () => {
    assert.equal(L.changeCase('sentence', 'hello. world! how are you?'), 'Hello. World! How are you?');
  });
  it('inverse swaps case, leaves digits/symbols', () => {
    assert.equal(L.changeCase('inverse', 'AbC 1!'), 'aBc 1!');
  });
  it('empty input stays empty for every mode', () => {
    for (const m of ['upper', 'lower', 'title', 'sentence', 'inverse']) {
      assert.equal(L.changeCase(m, ''), '');
    }
  });
});

describe('base64 (UTF-8 safe, manual implementation)', () => {
  it('encodes ASCII', () => assert.equal(L.b64EncodeText('Hello'), 'SGVsbG8='));
  it('encodes empty string', () => assert.equal(L.b64EncodeText(''), ''));
  it('encodes Bengali UTF-8 (cross-checked with node Buffer)', () => {
    // U+09A2 U+09BE U+0995 U+09BE -> bytes E0 A6 A2 E0 A6 BE E0 A6 95 E0 A6 BE
    // 56,10,26,34 -> 4 K a i | 56,10,26,62 -> 4 K a + | 56,10,26,21 -> 4 K a V | repeat
    assert.equal(L.b64EncodeText(decodeURI('%E0%A6%A2%E0%A6%BE%E0%A6%95%E0%A6%BE')), '4Kai4Ka+4KaV4Ka+');
  });
  it('round-trips Bengali', () => {
    const s = decodeURI('%E0%A6%A2%E0%A6%BE%E0%A6%95%E0%A6%BE');
    assert.equal(L.b64DecodeText(L.b64EncodeText(s)).text, s);
  });
  it('decodes ASCII', () => assert.equal(L.b64DecodeText('SGVsbG8=').text, 'Hello'));
  it('rejects bad alphabet', () => assert.equal(L.b64DecodeText('!!!').error, 'invalidB64'));
  it('rejects bad length', () => assert.equal(L.b64DecodeText('SGVsbG8').error, 'invalidB64'));
  it('rejects empty', () => assert.equal(L.b64DecodeText('   ').error, 'invalidB64'));
  it('rejects lone 0x80 byte (invalid UTF-8)', () => {
    assert.equal(L.b64DecodeText('gA==').error, 'invalidB64');
  });
  it('rejects misplaced padding', () => assert.equal(L.b64DecodeText('SG=V').error, 'invalidB64'));
});

describe('url encode/decode', () => {
  it('encodes spaces and &', () => assert.equal(L.urlEncodeText('a b&c'), 'a%20b%26c'));
  it('decodes percent sequences', () => assert.equal(L.urlDecodeText('a%20b').text, 'a b'));
  it('round-trips Bengali', () => {
    const s = decodeURI('%E0%A6%A2%E0%A6%BE%E0%A6%95%E0%A6%BE');
    assert.equal(L.urlDecodeText(L.urlEncodeText(s)).text, s);
  });
  it('rejects dangling %', () => assert.equal(L.urlDecodeText('%').error, 'invalidUrl'));
  it('rejects bad hex', () => assert.equal(L.urlDecodeText('%zz').error, 'invalidUrl'));
});

describe('morse (ITU)', () => {
  it('SOS encodes to ... --- ...', () => assert.equal(L.morseEncode('SOS'), '... --- ...'));
  it('... --- ... decodes to SOS', () => assert.equal(L.morseDecode('... --- ...'), 'SOS'));
  it('punctuation ! -> -.-.--', () => assert.equal(L.morseEncode('!'), '-.-.--'));
  it('words separated by 3 spaces', () => assert.equal(L.morseEncode('A B'), '.-   -...'));
  it('3 spaces decode back to word gap', () => assert.equal(L.morseDecode('.-   -...'), 'A B'));
  it('unknown char encodes to \\u2370 marker', () => {
    assert.equal(L.morseEncode('A~B'), '.- ' + L.UNKNOWN + ' -...');
  });
  it('unknown token decodes to \\u2370 marker', () => {
    assert.equal(L.morseDecode('......'), L.UNKNOWN);
  });
  it('digits encode', () => assert.equal(L.morseEncode('1'), '.----'));
  it('all 36 alphanumerics + punctuation round-trip', () => {
    const chars = Object.keys(L.MORSE);
    assert.ok(chars.length >= 50, 'expected >=50 morse symbols, got ' + chars.length);
    for (const ch of chars) {
      assert.equal(L.morseDecode(L.morseEncode(ch)), ch === ch.toUpperCase() ? ch : ch, ch);
    }
  });
  it('empty encodes to empty', () => assert.equal(L.morseEncode(''), ''));
});

describe('text stats (fixed paragraph)', () => {
  // line1 = 85 chars (17 words, 16 spaces), "\n\n" = 2, line3 = 22 -> 109 total
  // whitespace = 16 + 2 + 2 = 20 -> 89 non-space
  it('counts chars, non-space chars, words, sentences, lines, paragraphs', () => {
    const st = L.textStats(PARA);
    assert.equal(st.chars, 109);
    assert.equal(st.charsNoSpaces, 89);
    assert.equal(st.words, 20);
    assert.equal(st.sentences, 3);
    assert.equal(st.lines, 3);
    assert.equal(st.paragraphs, 2);
  });
  it('reading time @200wpm: 20 words -> 6 seconds', () => {
    assert.equal(L.textStats(PARA).readingSeconds, 6);
  });
  it('top-5 words: the x2 first, then alphabetical singles', () => {
    const top = L.textStats(PARA).topWords;
    assert.deepEqual(top, [
      { word: 'the', count: 2 },
      { word: 'box', count: 1 },
      { word: 'brown', count: 1 },
      { word: 'dog', count: 1 },
      { word: 'dozen', count: 1 },
    ]);
  });
  it('strips trailing punctuation before counting words', () => {
    const st = L.textStats('Hello, hello. HELLO!');
    assert.deepEqual(st.topWords, [{ word: 'hello', count: 3 }]);
    assert.equal(st.words, 3);
  });
  it('empty text zeroes everything', () => {
    assert.deepEqual(L.textStats(''), {
      chars: 0, charsNoSpaces: 0, words: 0, sentences: 0,
      lines: 0, paragraphs: 0, readingSeconds: 0, topWords: [],
    });
  });
  it('single word: 2 chars, 1 sentence, 1 line, 1 paragraph, 1 sec', () => {
    const st = L.textStats('Hi');
    assert.equal(st.chars, 2);
    assert.equal(st.words, 1);
    assert.equal(st.sentences, 1);
    assert.equal(st.lines, 1);
    assert.equal(st.paragraphs, 1);
    assert.equal(st.readingSeconds, 1);
  });
});

describe('find & replace', () => {
  it('literal find/replace with count', () => {
    const r = L.findReplace('foo bar foo', 'foo', 'baz', {});
    assert.equal(r.ok, true);
    assert.equal(r.count, 2);
    assert.equal(r.result, 'baz bar baz');
  });
  it('case-insensitive by default', () => {
    const r = L.findReplace('Foo FOO foo', 'foo', 'x', { caseSensitive: false });
    assert.equal(r.count, 3);
    assert.equal(r.result, 'x x x');
  });
  it('case-sensitive narrows matches', () => {
    const r = L.findReplace('Foo FOO foo', 'foo', 'x', { caseSensitive: true });
    assert.equal(r.count, 1);
  });
  it('regex mode: a+ in aaabaaa -> 2 matches, -b-', () => {
    const r = L.findReplace('aaabaaa', 'a+', '-', { regex: true });
    assert.ok(r.ok);
    assert.equal(r.count, 2);
    assert.equal(r.result, '-b-');
  });
  it('literal mode escapes regex chars', () => {
    const r = L.findReplace('a+b', 'a+b', 'c', {});
    assert.equal(r.count, 1);
    assert.equal(r.result, 'c');
  });
  it('invalid regex -> badRegex', () => {
    const r = L.findReplace('abc', '(', 'x', { regex: true });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'badRegex');
  });
  it('empty find -> emptyFind', () => {
    const r = L.findReplace('abc', '', 'x', {});
    assert.equal(r.ok, false);
    assert.equal(r.error, 'emptyFind');
  });
  it('literal $ in replacement is not expanded', () => {
    const r = L.findReplace('price 5', '5', '$5', {});
    assert.equal(r.result, 'price $5');
  });
});

describe('cleanup helpers', () => {
  it('trimLines', () => assert.equal(L.trimLines('  a  \n b \n'), 'a\nb\n'));
  it('removeBlankLines', () => assert.equal(L.removeBlankLines('a\n\nb\n  \nc'), 'a\nb\nc'));
  it('dedupeLines keeps first occurrence', () => {
    assert.equal(L.dedupeLines('a\nb\na\nb\nc'), 'a\nb\nc');
  });
  it('collapseSpaces', () => assert.equal(L.collapseSpaces('a  b\t\tc'), 'a b c'));
});

describe('Bengali digits & i18n', () => {
  it('toBnDigits converts 0-9', () => {
    assert.equal(L.toBnDigits('0123456789'), decodeURI('%E0%A7%A6%E0%A7%A7%E0%A7%A8%E0%A7%A9%E0%A7%AA%E0%A7%AB%E0%A7%AC%E0%A7%AD%E0%A7%AE%E0%A7%AF'));
  });
  it('fmtNum: bn uses Bengali digits, en uses Latin', () => {
    assert.equal(L.fmtNum(11034.82, 'bn'), decodeURI('%E0%A7%A7%E0%A7%A7%E0%A7%A6%E0%A7%A9%E0%A7%AA.%E0%A7%AE%E0%A7%A8'));
    assert.equal(L.fmtNum(11034.82, 'en'), '11034.82');
  });
  it('readingTimeStr en', () => assert.equal(L.readingTimeStr(6, 'en'), '0 min 6 sec'));
  it('readingTimeStr bn uses Bengali digits and units', () => {
    assert.equal(L.readingTimeStr(126, 'bn'), decodeURI('%E0%A7%A8%20%E0%A6%AE%E0%A6%BF%E0%A6%A8%E0%A6%BF%E0%A6%9F%20%E0%A7%AC%20%E0%A6%B8%E0%A7%87%E0%A6%95%E0%A7%87%E0%A6%A8%E0%A7%8D%E0%A6%A1'));
  });
  it('en and bn dictionaries have identical keys, all non-empty', () => {
    const enKeys = Object.keys(L.STR.en).sort();
    const bnKeys = Object.keys(L.STR.bn).sort();
    assert.deepEqual(bnKeys, enKeys);
    for (const k of enKeys) {
      assert.ok(L.t(k, 'en').length > 0, k);
      assert.ok(L.t(k, 'bn').length > 0, k);
    }
  });
  it('t falls back to en, then key', () => {
    assert.equal(L.t('__nope__', 'bn'), '__nope__');
    assert.equal(L.t('copyBtn', 'xx'), 'Copy');
  });
  it('LANG_KEY is namespaced', () => assert.equal(L.LANG_KEY, 'ttk-lang-v1'));
});
