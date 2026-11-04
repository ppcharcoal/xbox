'use strict';
// Runs before any page script. On xbox.com/*/play pages it injects Better xCloud
// into the page (main world) the same way a userscript manager does with
// "@run-at document-start".

const { ipcRenderer, webFrame } = require('electron');

let payload = null;
try {
  payload = ipcRenderer.sendSync('bx:get', location.href);
} catch (e) {
  console.error('[xbox-play] could not get Better xCloud:', e);
}

if (payload && payload.src) {
  // Apply our recommended Better xCloud settings once, without touching
  // anything the user has already changed in its settings dialog.
  const seed =
    '(function (s) { try {' +
    ' var k = "BetterXcloud", c = JSON.parse(localStorage.getItem(k) || "{}"), d = false;' +
    ' for (var p in s) { if (!(p in c)) { c[p] = s[p]; d = true; } }' +
    ' if (d) localStorage.setItem(k, JSON.stringify(c));' +
    ' } catch (e) {} })(' +
    JSON.stringify(payload.defaults || {}) +
    ');\n';

  webFrame
    .executeJavaScript(seed + payload.src + '\n;void 0;\n//# sourceURL=better-xcloud.user.js\n')
    .catch((e) => console.error('[xbox-play] Better xCloud failed:', e));
}
