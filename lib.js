'use strict';
// Pure helpers (no Electron imports) so they can be tested with plain node.

const TRUSTED_SUFFIXES = [
  'xbox.com',
  'xboxlive.com',
  'live.com',
  'live.net',
  'microsoft.com',
  'microsoftonline.com',
  'msauth.net',
  'msftauth.net',
  'msecnd.net',
];

function hostMatches(host, suffix) {
  return host === suffix || host.endsWith('.' + suffix);
}

function isTrustedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    return TRUSTED_SUFFIXES.some((s) => hostMatches(u.hostname, s));
  } catch {
    return false;
  }
}

// Same pages Better xCloud's userscript header matches:
//   https://www.xbox.com/*/play*  and  https://www.xbox.com/*/auth/msa?*loggedIn*
function isBetterXcloudPage(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'www.xbox.com') return false;
    if (u.pathname.includes('/xbox-game-pass/play-day-one')) return false;
    if (/^\/[^/]+\/play/.test(u.pathname)) return true;
    if (/^\/[^/]+\/auth\/msa/.test(u.pathname) && u.search.includes('loggedIn')) return true;
    return false;
  } catch {
    return false;
  }
}

function parseUserscript(src) {
  if (typeof src !== 'string' || !src.startsWith('// ==UserScript==')) return null;
  const end = src.indexOf('// ==/UserScript==');
  const header = src.slice(0, end > 0 ? end : 4000);
  const name = (header.match(/^\/\/\s*@name\s+(.+)$/m) || [])[1];
  const version = (header.match(/^\/\/\s*@version\s+([\d.]+)\s*$/m) || [])[1];
  if (!name || !version || name.trim() !== 'Better xCloud') return null;
  return { version, src };
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function newest(...scripts) {
  return scripts
    .filter(Boolean)
    .reduce((best, s) => (!best || compareVersions(s.version, best.version) > 0 ? s : best), null);
}

function edgeUserAgent(chromeVersion) {
  const major = String(chromeVersion || '140').split('.')[0];
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`
  );
}

const DEFAULT_CONFIG = {
  // Remote Play only: start on your consoles, send every Cloud Gaming page back there.
  remotePlayOnly: true,
  // Connect straight to the console you played on last time.
  autoConnect: true,
  // Start page when remotePlayOnly is false.
  startUrl: 'https://www.xbox.com/play',
  // Start in fullscreen (same as --fullscreen).
  fullscreen: false,
  // Inject Better xCloud.
  betterXcloud: true,
  // Download the newest Better xCloud from GitHub on start (used from the next page load).
  autoUpdateBetterXcloud: true,
  // "edge-windows" (best quality on xCloud), "default", or any custom UA string.
  userAgent: 'edge-windows',
  // Hardware video decoding via VA-API (same as --vaapi). Off by default: software
  // decoding of 1080p60 H.264 is cheap and usually has the lowest latency.
  vaapi: false,
  // Hide scrollbars on Xbox pages (scrolling itself still works).
  hideScrollbars: true,
  // Mouse & keyboard -> pad mapper (toggle with F8).
  mapper: true,
  mouseSensitivity: 1,
  // Changes to the default key mapping, e.g. { "KeyG": "Y", "KeyE": "" } ("" removes a key).
  // Targets: A B X Y LB RB LT RT View Menu L3 R3 Up Down Left Right Xbox
  //          LS_Up LS_Down LS_Left LS_Right RS_Up RS_Down RS_Left RS_Right
  // Keys use KeyboardEvent.code names; mouse buttons are Mouse0 (left), Mouse1 (middle), Mouse2 (right).
  keyMapping: {},
  // Better xCloud settings applied once, only if you have not set them yourself.
  betterXcloudDefaults: {
    'stream.video.resolution': '1080p-hq',
    'xhome.video.resolution': '1080p-hq',
    'block.tracking': true,
    'ui.feedbackDialog.disabled': true,
    'ui.hideScrollbar': true,
  },
};

const DEFAULT_KEY_MAPPING = {
  KeyW: 'LS_Up', KeyS: 'LS_Down', KeyA: 'LS_Left', KeyD: 'LS_Right',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Digit1: 'Up', Digit2: 'Down', Digit3: 'Left', Digit4: 'Right',
  Space: 'A', KeyE: 'A', KeyC: 'B', Backspace: 'B', KeyR: 'X', KeyV: 'Y',
  KeyQ: 'LB', KeyF: 'RB', Mouse2: 'LT', Mouse0: 'RT',
  ShiftLeft: 'L3', KeyX: 'L3', KeyZ: 'R3', Mouse1: 'R3',
  Tab: 'View', Enter: 'Menu', Backquote: 'Xbox',
  KeyI: 'RS_Up', KeyK: 'RS_Down', KeyJ: 'RS_Left', KeyL: 'RS_Right',
};

const MAPPING_TARGETS = new Set([
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3',
  'Up', 'Down', 'Left', 'Right', 'Xbox',
  'LS_Up', 'LS_Down', 'LS_Left', 'LS_Right', 'RS_Up', 'RS_Down', 'RS_Left', 'RS_Right',
]);

function buildKeyMapping(changes) {
  const out = { ...DEFAULT_KEY_MAPPING };
  if (changes && typeof changes === 'object') {
    for (const [code, target] of Object.entries(changes)) {
      if (target === '' || target === null) delete out[code];
      else if (MAPPING_TARGETS.has(target)) out[code] = target;
    }
  }
  return out;
}

function mergeConfig(user) {
  const cfg = {
    ...DEFAULT_CONFIG,
    keyMapping: {},
    betterXcloudDefaults: { ...DEFAULT_CONFIG.betterXcloudDefaults },
  };
  if (!user || typeof user !== 'object') return cfg;
  for (const [k, v] of Object.entries(user)) {
    if (!(k in DEFAULT_CONFIG)) continue;
    if (k === 'betterXcloudDefaults' || k === 'keyMapping') {
      if (v && typeof v === 'object') Object.assign(cfg[k], v);
    } else if (typeof v === typeof DEFAULT_CONFIG[k]) {
      cfg[k] = v;
    }
  }
  return cfg;
}

// Small edits to Better xCloud's gamepad polling so the Xbox button can be held:
// expose the input sink, and skip Better xCloud's own tap after a long hold.
const BX_PATCHES = [
  {
    name: 'expose-input-sink',
    find: 'var currentGamepad=$gamepadVar$,btnHome=currentGamepad.buttons[16];',
    replace: 'window.__xpSink=self.inputSink;var currentGamepad=$gamepadVar$,btnHome=currentGamepad.buttons[16];',
  },
  {
    name: 'no-tap-after-long-hold',
    find: 'info.shortcutPressed===0)',
    replace: 'info.shortcutPressed===0&&!window.__xpLongHold)',
  },
];

function patchBetterXcloud(src) {
  const applied = [];
  for (const p of BX_PATCHES) {
    if (src.split(p.find).length !== 2) continue; // missing or ambiguous: leave Better xCloud as it is
    src = src.replace(p.find, () => p.replace);
    applied.push(p.name);
  }
  return { src, applied };
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === '--fullscreen') out.fullscreen = true;
    else if (a === '--windowed') out.fullscreen = false;
    else if (a === '--vaapi') out.vaapi = true;
    else if (a === '--no-bx') out.betterXcloud = false;
    else if (a === '--pick' || a === '--remote-play') out.pick = true;
    else if (a === '--cloud') out.remotePlayOnly = false;
    else if (a.startsWith('--url=')) out.url = a.slice(6);
  }
  return out;
}

// ---------- Remote Play routing ----------

const LOCALE_RE = /^[a-z]{2,3}-[a-z]{2,4}$/i;

// What kind of xbox.com page a URL is:
//   { type: 'launch', locale, consoleId }  streaming from a console
//   { type: 'consoles', locale }            the console list
//   { type: 'cloud', locale }               any other /play page (Cloud Gaming)
//   null                                    anything else (sign-in, other sites, …)
function classifyXboxUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.hostname !== 'www.xbox.com') return null;
  const m = u.pathname.match(/^\/([^/]+)\/play(\/.*)?$/);
  if (!m || !LOCALE_RE.test(m[1])) return null;
  const locale = m[1];
  const rest = m[2] || '';
  const launch = rest.match(/^\/consoles\/launch\/([^/?#]+)/);
  if (launch) return { type: 'launch', locale, consoleId: decodeURIComponent(launch[1]) };
  if (/^\/consoles(\/|$)/.test(rest)) return { type: 'consoles', locale };
  return { type: 'cloud', locale };
}

function consolesUrl(locale) {
  return locale && LOCALE_RE.test(locale)
    ? `https://www.xbox.com/${locale}/play/consoles`
    : 'https://www.xbox.com/play/consoles';
}

function launchUrl(locale, consoleId) {
  if (!LOCALE_RE.test(String(locale)) || !/^[A-Za-z0-9_-]{4,64}$/.test(String(consoleId))) return null;
  return `https://www.xbox.com/${locale}/play/consoles/launch/${consoleId}`;
}

function chooseStartUrl(cfg, state) {
  if (cfg.url) return cfg.url;
  if (!cfg.remotePlayOnly) return cfg.startUrl;
  const last = state && state.lastConsole;
  if (cfg.autoConnect && !cfg.pick && last) {
    const url = launchUrl(last.locale, last.consoleId);
    if (url) return url;
  }
  return consolesUrl(last && last.locale);
}

// ---------- evdev (reading the pad's Xbox button straight from Linux) ----------

const EV_KEY = 1;
const BTN_MODE = 0x13c; // Xbox / guide button
const INPUT_EVENT_SIZE = 24; // struct input_event on 64-bit Linux

// Is bit `bit` set in a /proc/bus/input/devices "B: KEY=" bitmap (hex words, most significant first)?
function keyBitSet(keyField, bit) {
  const words = String(keyField).trim().split(/\s+/).reverse();
  const word = words[Math.floor(bit / 64)];
  if (!word) return false;
  try {
    return ((BigInt('0x' + word) >> BigInt(bit % 64)) & 1n) === 1n;
  } catch {
    return false;
  }
}

// Gamepads (they have a jsN handler) that report an Xbox/guide button.
function findGuideButtonDevices(procDevicesText) {
  const out = [];
  for (const block of String(procDevicesText).split(/\n\s*\n/)) {
    const name = (block.match(/^N: Name="(.*)"$/m) || [])[1] || '';
    const handlers = (block.match(/^H: Handlers=(.*)$/m) || [])[1] || '';
    const keys = (block.match(/^B: KEY=(.*)$/m) || [])[1];
    const event = (handlers.match(/\bevent\d+\b/) || [])[0];
    if (!event || !/\bjs\d+\b/.test(handlers) || !keys) continue;
    if (keyBitSet(keys, BTN_MODE)) out.push({ name, event });
  }
  return out;
}

// Decode a buffer of input_event structs; returns [{type, code, value}] and leftover bytes.
function parseInputEvents(buf) {
  const events = [];
  let off = 0;
  for (; off + INPUT_EVENT_SIZE <= buf.length; off += INPUT_EVENT_SIZE) {
    events.push({
      type: buf.readUInt16LE(off + 16),
      code: buf.readUInt16LE(off + 18),
      value: buf.readInt32LE(off + 20),
    });
  }
  return { events, rest: buf.subarray(off) };
}

// Small self-contained page that shows what the browser sees from each pad.
const GAMEPAD_TESTER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Test pada</title><style>
body{margin:0;padding:20px;background:#111;color:#eee;font:15px/1.5 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 4px}p{color:#aaa;margin:0 0 16px}
.pad{background:#1c1f24;border-radius:10px;padding:14px;margin-bottom:14px}
.id{font-weight:600;margin-bottom:8px;word-break:break-all}
.btns{display:flex;flex-wrap:wrap;gap:6px}
.b{min-width:44px;padding:6px 8px;border-radius:6px;background:#2a2e35;text-align:center;font-variant-numeric:tabular-nums}
.b.on{background:#3ddc84;color:#000;font-weight:700}
.b small{display:block;font-size:11px;opacity:.75}
.axes{margin-top:8px;color:#bbb;font-variant-numeric:tabular-nums}
</style></head><body>
<h1>Test pada</h1>
<p>Naciśnij dowolny przycisk na padzie. Przycisk Xbox to nr <b>16</b> (Nexus). Zamknij okno, gdy skończysz.</p>
<div id="out">Brak pada — naciśnij przycisk, żeby go wykryć.</div>
<script>
var names={0:"A",1:"B",2:"X",3:"Y",4:"LB",5:"RB",6:"LT",7:"RT",8:"View",9:"Menu",10:"L3",11:"R3",12:"↑",13:"↓",14:"←",15:"→",16:"Xbox",17:"Share"};
function draw(){
  var pads=[].slice.call(navigator.getGamepads()).filter(Boolean),out=document.getElementById("out");
  if(pads.length){out.innerHTML=pads.map(function(g){
    return '<div class="pad"><div class="id">#'+g.index+' '+g.id+' — mapping: '+(g.mapping||"brak")+', przyciski: '+g.buttons.length+'</div><div class="btns">'+
      g.buttons.map(function(b,i){return '<div class="b'+(b.pressed?' on':'')+'">'+i+'<small>'+(names[i]||"")+'</small></div>';}).join("")+
      '</div><div class="axes">osie: '+g.axes.map(function(a){return a.toFixed(2);}).join("  ")+'</div></div>';
  }).join("");}
  requestAnimationFrame(draw);
}
draw();
</script></body></html>`;

module.exports = {
  DEFAULT_KEY_MAPPING,
  buildKeyMapping,
  patchBetterXcloud,
  classifyXboxUrl,
  consolesUrl,
  launchUrl,
  chooseStartUrl,
  EV_KEY,
  BTN_MODE,
  INPUT_EVENT_SIZE,
  keyBitSet,
  findGuideButtonDevices,
  parseInputEvents,
  GAMEPAD_TESTER_HTML,
  isTrustedUrl,
  isBetterXcloudPage,
  parseUserscript,
  compareVersions,
  newest,
  edgeUserAgent,
  DEFAULT_CONFIG,
  mergeConfig,
  parseArgs,
};
