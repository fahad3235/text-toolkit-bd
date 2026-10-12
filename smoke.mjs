#!/usr/bin/env node
/* Headless-Chromium smoke test for text-toolkit-bd via raw CDP.
 * Usage: node smoke.mjs   (starts its own chrome on port 9323)
 * Exit 0 = all checks pass, 1 = any failure.
 */
'use strict';

const CHROME = '/opt/meta-chromium/chrome';
const PORT = 9323;
const DIR = '/home/hatch/workspace/muse-project-factory/builds/text-toolkit-bd';
const URL = 'file://' + DIR + '/index.html';

const { spawn } = await import('node:child_process');

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: cond ? undefined : detail });
  console.log((cond ? '  OK ' : '  FAIL ') + name + (cond || !detail ? '' : '  -> ' + detail));
}

const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--no-proxy-server',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/ttk-qa-profile',
  'about:blank',
], { stdio: 'ignore' });

async function waitForDebugger() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('chrome debugger never came up');
}

async function newTarget() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' });
  const j = await r.json();
  return j.webSocketDebuggerUrl;
}

let msgId = 0;
function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const onMsg = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id === id) {
        ws.removeEventListener('message', onMsg);
        if (m.error) reject(new Error(method + ': ' + JSON.stringify(m.error)));
        else resolve(m.result);
      }
    };
    ws.addEventListener('message', onMsg);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.removeEventListener('message', onMsg); reject(new Error('CDP timeout ' + method)); }, 15000);
  });
}

async function ev(ws, expr, awaitPromise = false) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error('JS exception: ' + r.exceptionDetails.text + ' ' + expr.slice(0, 120));
  return r.result.value;
}

function drainConsole(ws, errors) {
  ws.addEventListener('message', (evm) => {
    let m;
    try { m = JSON.parse(evm.data); } catch (e) { return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      const type = m.params.type;
      if (type === 'error') errors.push('console.error: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push('page exception: ' + (m.params.exceptionDetails.text || ''));
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      if (e.level === 'error') errors.push('log.error: ' + e.text);
    }
  });
}

function setIn(id, v) {
  return `document.getElementById('${id}').value = ${JSON.stringify(v)}; ` +
    `document.getElementById('${id}').dispatchEvent(new Event('input', {bubbles:true}));`;
}
function clickTab(id) {
  return `document.querySelector('[data-tab="${id}"]').click();`;
}

try {
  await waitForDebugger();
  const wsUrl = await newTarget();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  const consoleErrors = [];
  drainConsole(ws, consoleErrors);
  await send(ws, 'Runtime.enable');
  await send(ws, 'Log.enable');
  await send(ws, 'Page.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  await ev(ws, `new Promise(r => { const t = setInterval(() => { if (window.__ttk) { clearInterval(t); r(1); } }, 100); })`, true);

  console.log('DESKTOP (1280x800)');
  check('page title', (await ev(ws, 'document.title')).includes('Text Toolkit BD'));
  check('app booted (window.__ttk)', await ev(ws, '!!window.__ttk'));
  check('6 tabs present', await ev(ws, `document.querySelectorAll('[data-tab]').length`) === 6);
  check('footer disclaimer mentions browser-only', (await ev(ws, `document.querySelector('.foot').textContent`)).includes('browser'));

  // Case tab
  await ev(ws, setIn('in-case', 'hello world'));
  check('case UPPER -> HELLO WORLD', await ev(ws, `document.getElementById('out-case').value`) === 'HELLO WORLD');
  await ev(ws, `document.querySelector('input[name="caseMode"][value="inverse"]').click();`);
  await ev(ws, setIn('in-case', 'AbC'));
  check('case iNVERSE AbC -> aBc', await ev(ws, `document.getElementById('out-case').value`) === 'aBc');
  check('case copy button enabled', await ev(ws, `!document.getElementById('copy-case').disabled`));
  await ev(ws, `document.getElementById('copy-case').click();`);
  check('case copy click = no exception', true);

  // Base64 tab
  await ev(ws, clickTab('b64'));
  await ev(ws, setIn('in-b64', 'Hello'));
  await ev(ws, `document.getElementById('b64EncBtn').click();`);
  check('b64 encode Hello -> SGVsbG8=', await ev(ws, `document.getElementById('out-b64').value`) === 'SGVsbG8=');
  await ev(ws, setIn('in-b64', decodeURI('%E0%A6%A2%E0%A6%BE%E0%A6%95%E0%A6%BE')));
  await ev(ws, `document.getElementById('b64EncBtn').click();`);
  check('b64 encodes Bengali UTF-8', await ev(ws, `document.getElementById('out-b64').value`) === '4Kai4Ka+4KaV4Ka+');
  await ev(ws, setIn('in-b64', 'SGVsbG8='));
  await ev(ws, `document.getElementById('b64DecBtn').click();`);
  check('b64 decode SGVsbG8= -> Hello', await ev(ws, `document.getElementById('out-b64').value`) === 'Hello');
  await ev(ws, setIn('in-b64', '!!!'));
  await ev(ws, `document.getElementById('b64DecBtn').click();`);
  check('b64 invalid shows inline error', await ev(ws, `!document.getElementById('err-b64').hidden && document.getElementById('err-b64').textContent.length > 0`));

  // URL tab
  await ev(ws, clickTab('url'));
  await ev(ws, setIn('in-url', 'a b&c'));
  await ev(ws, `document.getElementById('urlEncBtn').click();`);
  check('url encode a b&c -> a%20b%26c', await ev(ws, `document.getElementById('out-url').value`) === 'a%20b%26c');
  await ev(ws, setIn('in-url', 'a%20b'));
  await ev(ws, `document.getElementById('urlDecBtn').click();`);
  check('url decode a%20b -> a b', await ev(ws, `document.getElementById('out-url').value`) === 'a b');
  await ev(ws, setIn('in-url', '%'));
  await ev(ws, `document.getElementById('urlDecBtn').click();`);
  check('url invalid shows inline error', await ev(ws, `!document.getElementById('err-url').hidden`));

  // Morse tab
  await ev(ws, clickTab('morse'));
  await ev(ws, setIn('in-morse', 'SOS'));
  await ev(ws, `document.getElementById('morseEncBtn').click();`);
  check('morse SOS -> ... --- ...', await ev(ws, `document.getElementById('out-morse').value`) === '... --- ...');
  await ev(ws, setIn('in-morse', '... --- ...'));
  await ev(ws, `document.getElementById('morseDecBtn').click();`);
  check('morse ... --- ... -> SOS', await ev(ws, `document.getElementById('out-morse').value`) === 'SOS');
  await ev(ws, setIn('in-morse', 'A~B'));
  await ev(ws, `document.getElementById('morseEncBtn').click();`);
  check('morse unknown char -> marker', (await ev(ws, `document.getElementById('out-morse').value`)).includes('\u2370'));

  // Stats tab
  await ev(ws, clickTab('stats'));
  const PARA = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.\n\nSecond paragraph here.';
  await ev(ws, setIn('in-stats', PARA));
  await ev(ws, `document.getElementById('statsBtn').click();`);
  const statsTxt = await ev(ws, `document.getElementById('statsRows').textContent`);
  check('stats words = 20', statsTxt.includes('Words') && statsTxt.includes('20'), statsTxt.slice(0, 80));
  check('stats chars = 109', statsTxt.includes('109'));
  check('stats reading time 0 min 6 sec', statsTxt.includes('0 min 6 sec'));
  const topTxt = await ev(ws, `document.getElementById('topWords').textContent`);
  check('stats top word the x2', topTxt.includes('the') && topTxt.includes('2'));

  // Find tab
  await ev(ws, clickTab('find'));
  await ev(ws, setIn('in-find', 'foo bar foo'));
  await ev(ws, `document.getElementById('findText').value = 'foo';`);
  await ev(ws, `document.getElementById('findBtn').click();`);
  check('find count shows 2 matches', await ev(ws, `document.getElementById('findCount').textContent`) === '2 matches found');
  await ev(ws, `document.getElementById('replText').value = 'baz';`);
  await ev(ws, `document.getElementById('replaceBtn').click();`);
  check('replace all -> baz bar baz', await ev(ws, `document.getElementById('in-find').value`) === 'baz bar baz');
  await ev(ws, setIn('in-find', 'aaabaaa'));
  await ev(ws, `document.getElementById('findText').value = 'a+'; document.getElementById('regexMode').checked = true;`);
  await ev(ws, `document.getElementById('findBtn').click();`);
  check('regex a+ count = 2', await ev(ws, `document.getElementById('findCount').textContent`) === '2 matches found');
  await ev(ws, `document.getElementById('findText').value = '(';`);
  await ev(ws, `document.getElementById('findBtn').click();`);
  check('bad regex shows inline error', await ev(ws, `!document.getElementById('err-find').hidden`));
  await ev(ws, `document.getElementById('regexMode').checked = false;`);
  await ev(ws, setIn('in-find', '  a  \n b '));
  await ev(ws, `document.getElementById('cleanTrim').click();`);
  check('cleanup trim lines', await ev(ws, `document.getElementById('in-find').value`) === 'a\nb');

  // BN toggle
  await ev(ws, `document.getElementById('langToggle').click();`);
  check('html lang=bn', await ev(ws, `document.documentElement.lang`) === 'bn');
  check('BN tab label non-ASCII', await ev(ws, `/[^\\x00-\\x7F]/.test(document.querySelector('[data-tab="case"]').textContent)`));
  await ev(ws, clickTab('stats'));
  const bnStats = await ev(ws, `document.getElementById('statsRows').textContent`);
  check('BN stats words = Bengali 20', bnStats.includes('\u09e8\u09e6'), bnStats.slice(0, 60));
  check('lang persisted ttk-lang-v1=bn', await ev(ws, `localStorage.getItem('ttk-lang-v1')`) === 'bn');

  // reload persistence
  await send(ws, 'Page.reload');
  await ev(ws, `new Promise(r => { const t = setInterval(() => { if (window.__ttk) { clearInterval(t); r(1); } }, 100); })`, true);
  check('language survives reload (bn)', await ev(ws, `document.documentElement.lang`) === 'bn');
  await ev(ws, `document.getElementById('langToggle').click();`);
  check('toggle back to en', await ev(ws, `document.documentElement.lang`) === 'en');

  // zero network requests
  check('zero network resource requests', await ev(ws, `performance.getEntriesByType('resource').length`) === 0);
  check('no horizontal overflow (desktop)', await ev(ws, `document.documentElement.scrollWidth <= window.innerWidth`));

  console.log('MOBILE (390px)');
  await send(ws, 'Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await new Promise((r) => setTimeout(r, 400));
  const tabs = ['case', 'b64', 'url', 'morse', 'stats', 'find'];
  let mobileOverflow = false;
  for (const t of tabs) {
    await ev(ws, clickTab(t));
    await new Promise((r) => setTimeout(r, 150));
    const sw = await ev(ws, `document.documentElement.scrollWidth`);
    if (sw > 390) { mobileOverflow = true; break; }
  }
  check('no horizontal overflow on any tab (390px)', !mobileOverflow);
  await ev(ws, clickTab('case'));
  await ev(ws, setIn('in-case', 'mobile test'));
  check('case works on mobile', await ev(ws, `document.getElementById('out-case').value`) === 'MOBILE TEST');

  await new Promise((r) => setTimeout(r, 500));
  check('zero console/page errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));

  ws.close();
} catch (e) {
  results.push({ name: 'smoke run completed', ok: false, detail: String(e && e.message || e) });
  console.log('  FAIL smoke run error: ' + (e && e.message || e));
} finally {
  try { chrome.kill(); } catch (e) { /* noop */ }
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nSMOKE: ${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
