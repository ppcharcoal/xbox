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
  // Start page. Remote Play: Better xCloud adds a "Remote Play" button in the header.
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
  // Better xCloud settings applied once, only if you have not set them yourself.
  betterXcloudDefaults: {
    'mkb.enabled': true,
    'stream.video.resolution': '1080p-hq',
    'xhome.video.resolution': '1080p-hq',
    'block.tracking': true,
    'ui.feedbackDialog.disabled': true,
    'ui.hideScrollbar': true,
  },
};

function mergeConfig(user) {
  const cfg = { ...DEFAULT_CONFIG, betterXcloudDefaults: { ...DEFAULT_CONFIG.betterXcloudDefaults } };
  if (!user || typeof user !== 'object') return cfg;
  for (const [k, v] of Object.entries(user)) {
    if (!(k in DEFAULT_CONFIG)) continue;
    if (k === 'betterXcloudDefaults') {
      if (v && typeof v === 'object') Object.assign(cfg.betterXcloudDefaults, v);
    } else if (typeof v === typeof DEFAULT_CONFIG[k]) {
      cfg[k] = v;
    }
  }
  return cfg;
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === '--fullscreen') out.fullscreen = true;
    else if (a === '--windowed') out.fullscreen = false;
    else if (a === '--vaapi') out.vaapi = true;
    else if (a === '--no-bx') out.betterXcloud = false;
    else if (a === '--remote-play') out.startUrl = 'https://www.xbox.com/play/consoles';
    else if (a.startsWith('--url=')) out.startUrl = a.slice(6);
  }
  return out;
}

module.exports = {
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
