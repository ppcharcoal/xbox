'use strict';
// Runs before any page script. On xbox.com/*/play pages it injects, into the page
// itself (main world) and before the page's own scripts:
//   1. our input layer (Xbox button, mouse & keyboard -> pad), see page-input.js
//   2. Better xCloud, the way a userscript manager does with "@run-at document-start".

const { ipcRenderer, webFrame } = require('electron');

let payload = null;
try {
  payload = ipcRenderer.sendSync('bx:get', location.href);
} catch (e) {
  console.error('[xbox-play] could not get Better xCloud:', e);
}

function run(code, name) {
  webFrame
    .executeJavaScript(`${code}\n;void 0;\n//# sourceURL=${name}\n`)
    .catch((e) => console.error(`[xbox-play] ${name} failed:`, e));
}

if (payload && payload.src) {
  // Better xCloud settings: `defaults` only fill in what the user has not set,
  // `forced` are always applied.
  const settings =
    '(function (defaults, forced) { try {' +
    ' var k = "BetterXcloud", c = JSON.parse(localStorage.getItem(k) || "{}"), d = false, p;' +
    ' for (p in defaults) { if (!(p in c)) { c[p] = defaults[p]; d = true; } }' +
    ' for (p in forced) { if (c[p] !== forced[p]) { c[p] = forced[p]; d = true; } }' +
    ' if (d) localStorage.setItem(k, JSON.stringify(c));' +
    ' } catch (e) {} })(' +
    JSON.stringify(payload.defaults || {}) +
    ', ' +
    JSON.stringify(payload.forced || {}) +
    ');';

  if (payload.prelude) run(payload.prelude, 'xbox-play-input.js');
  run(settings + '\n' + payload.src, 'better-xcloud.user.js');
}
