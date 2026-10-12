# TEST_RESULTS.md — text-toolkit-bd (run #38, 2026-10-12 11:00 +06)

## Summary

- Unit tests: **56/56 pass** (`node --test tests/test.js`)
- Headless-Chrome smoke: **38/38 pass** (`node smoke.mjs`), desktop 1280px + mobile 390px, **zero console/page errors**
- ASCII-source check: `grep -P "[^\x00-\x7F]" -l` over all sources → **no matches**
- Zero network resource requests verified in the browser (`performance.getEntriesByType('resource')` = 0)

## Hand-verified values

| Case | Expected (hand-computed) | Result |
|---|---|---|
| Base64('Hello') | `SGVsbG8=` | pass |
| Base64('ঢাকা') | bytes E0 A6 A2 E0 A6 BE E0 A6 95 E0 A6 BE → 6-bit groups (56,10,26,34),(56,10,26,62),(56,10,26,21),(56,10,26,62) → `4Kai4Ka+4KaV4Ka+`; cross-checked against node's own `Buffer.from(s,'utf8').toString('base64')` → identical | pass |
| Base64 decode('gA==') | 0x80 alone is invalid UTF-8 → `invalidB64` | pass |
| URL encode('a b&c') | `a%20b%26c` | pass |
| URL decode('%') / ('%zz') | throws in decodeURIComponent → `invalidUrl` | pass |
| Morse('SOS') | `... --- ...` | pass |
| Morse('A B') | `.-   -...` (3-space word gap) | pass |
| Morse('A~B') | `.- ⍰ -...` (unknown → U+2370 marker) | pass |
| Morse decode('......') | `⍰` | pass |
| Stats of fixed paragraph (109 chars: line1=85 + 2 newlines + line3=22; whitespace 16+2+2=20) | chars 109, no-spaces 89, words 20, sentences 3, lines 3, paragraphs 2, reading 6s (ceil(20/200*60)), top5 = the×2, box, brown, dog, dozen | pass |
| Find/replace 'foo bar foo' find 'foo' → 'baz' | count 2, result `baz bar baz` | pass |
| Regex 'a+' in 'aaabaaa' → '-' | count 2, result `-b-` | pass |
| Case 'sentence' on 'hello. world! how are you?' | `Hello. World! How are you?` | pass |
| Case 'inverse' on 'AbC 1!' | `aBc 1!` | pass |
| toBnDigits('0123456789') | ০১২৩৪৫৬৭৮৯ (U+09E6+i) | pass |
| readingTimeStr(126, 'bn') | `২ মিনিট ৬ সেকেন্ড` | pass |

## Repairs log

1. **Test-side (expected value): Base64 Bengali.** My first hand computation wrote `4Kaa4Ka+4KaV4Ka+`; independent check with node `Buffer` gave `4Kai4Ka+4KaV4Ka+` (6-bit value 34 = `i`, not `a`). Implementation was correct; corrected the expected value. Verified by two independent methods.
2. **Test-side (encoding): readingTimeStr BN.** I hand-encoded ড (U+09A1) as `%E0%A1%A1`; correct UTF-8 is `%E0%A6%A1`. App output was right; fixed the test's expected bytes.
3. **Test-side (expectation): fmtNum grouping.** I expected a thousands comma (`১১,০৩৪.৮২`); `fmtNum` does plain digit conversion with no grouping (`১১০৩৪.৮২`). Corrected the expectation (also: `decodeURI` leaves `%2C` encoded, so no percent-encoded commas).
4. **Build hygiene (source ASCII):** em-dash in an app.js comment replaced with `-`; Bengali string table is generated as `\uXXXX` escapes (first generation pass double-escaped `\\u` — regenerated correctly); `L.UNKNOWN` literal replaced with `"\u2370"`; two literal-Bengali expressions in tests replaced with `decodeURI(...)` forms. Final `grep -P` clean.
5. **Smoke test: 38/38 on the first full run — 0 app bugs, 0 repairs.** (A pre-run edit pass fixed two literal non-ASCII chars I had typed into smoke.mjs assertions before running.)

## Not covered / known limits

- Clipboard content is not asserted in headless Chrome (permissions); the copy buttons are clicked and produce no errors, and the success/fail note path is exercised.
- Sentence counting is heuristic; reading time assumes 200 wpm (documented in README).
