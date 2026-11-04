'use strict';

// Each watched pad keeps one blocking read open on a libuv worker thread.
if (!process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  net,
  powerSaveBlocker,
  session,
  shell,
} = require('electron');
const fs = require('fs');
const path = require('path');
const lib = require('./lib');

const APP_ID = 'xbox-play';
app.setName(APP_ID);
if (typeof app.setDesktopName === 'function') app.setDesktopName(`${APP_ID}.desktop`);

const BX_DOWNLOAD_URL =
  'https://github.com/redphx/better-xcloud/releases/latest/download/better-xcloud.user.js';
const BUNDLED_BX = path.join(__dirname, 'better-xcloud.user.js');
const USER_DIR = app.getPath('userData'); // ~/.config/xbox-play
const CACHED_BX = path.join(USER_DIR, 'better-xcloud.user.js');
const CONFIG_PATH = path.join(USER_DIR, 'config.json');
const STATE_PATH = path.join(USER_DIR, 'state.json');

// ---------- config ----------

function loadConfig() {
  let user = null;
  try {
    user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') {
      try {
        fs.mkdirSync(USER_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(lib.DEFAULT_CONFIG, null, 2) + '\n');
      } catch {}
    } else {
      console.warn(`[xbox-play] Cannot read ${CONFIG_PATH}: ${e.message} (using defaults)`);
    }
  }
  return { ...lib.mergeConfig(user), ...lib.parseArgs(process.argv.slice(1)) };
}

const cfg = loadConfig();

// Remembers the last console you streamed from (for autoConnect).
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) || {};
  } catch {
    return {};
  }
}
const state = loadState();
function saveState() {
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
  } catch (e) {
    console.warn(`[xbox-play] Cannot save ${STATE_PATH}: ${e.message}`);
  }
}

// ---------- Chromium switches (must be set before "ready") ----------

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (cfg.vaapi) {
  app.commandLine.appendSwitch(
    'enable-features',
    [
      'AcceleratedVideoDecodeLinuxGL',
      'AcceleratedVideoDecodeLinuxZeroCopyGL',
      'VaapiVideoDecoder',
      'VaapiIgnoreDriverChecks',
    ].join(',')
  );
}

// ---------- single instance ----------

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;

app.on('second-instance', (_e, argv) => {
  if (argv.includes('--editor')) return openEditor();
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

// ---------- Better xCloud ----------

function readScript(file) {
  try {
    return lib.parseUserscript(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

let betterXcloud = lib.newest(readScript(CACHED_BX), readScript(BUNDLED_BX));

async function updateBetterXcloud() {
  try {
    const res = await net.fetch(BX_DOWNLOAD_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const latest = lib.parseUserscript(await res.text());
    if (!latest) throw new Error('downloaded file is not Better xCloud');
    if (betterXcloud && lib.compareVersions(latest.version, betterXcloud.version) <= 0) return false;
    fs.mkdirSync(USER_DIR, { recursive: true });
    const tmp = `${CACHED_BX}.tmp`;
    fs.writeFileSync(tmp, latest.src);
    fs.renameSync(tmp, CACHED_BX);
    console.log(`[xbox-play] Better xCloud ${betterXcloud?.version ?? '-'} -> ${latest.version}`);
    betterXcloud = latest;
    return true;
  } catch (e) {
    console.warn(`[xbox-play] Better xCloud update failed: ${e.message}`);
    return false;
  }
}

// Better xCloud with the small patches that let the Xbox button be held (cached per version).
let patchedBx = null;
function getPatchedBetterXcloud() {
  if (!betterXcloud) return null;
  if (!patchedBx || patchedBx.version !== betterXcloud.version) {
    const { src, applied } = lib.patchBetterXcloud(betterXcloud.src);
    patchedBx = { version: betterXcloud.version, src };
    console.log(`[xbox-play] Better xCloud ${betterXcloud.version}, patches: ${applied.join(', ') || 'none'}`);
  }
  return patchedBx.src;
}

// ---------- control profiles (mappings.json) ----------

const MAPPINGS_PATH = path.join(USER_DIR, 'mappings.json');

function loadMappings() {
  try {
    return lib.sanitizeProfiles(JSON.parse(fs.readFileSync(MAPPINGS_PATH, 'utf8')), lib.defaultProfiles(cfg));
  } catch {
    const fresh = lib.defaultProfiles(cfg);
    writeMappings(fresh);
    return fresh;
  }
}

function writeMappings(data) {
  try {
    fs.mkdirSync(USER_DIR, { recursive: true });
    const tmp = `${MAPPINGS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    fs.renameSync(tmp, MAPPINGS_PATH);
  } catch (e) {
    console.warn(`[xbox-play] Cannot save ${MAPPINGS_PATH}: ${e.message}`);
  }
}

let mappings = loadMappings();

function pageProfile() {
  const p = lib.activeProfile(mappings);
  return {
    profileName: p.name,
    mouseSensitivity: p.sensitivity,
    invertY: p.invertY,
    smoothing: p.smoothing,
    deadzone: p.deadzone,
    acceleration: p.acceleration,
    keyMapping: cfg.mapper ? p.mapping : {},
  };
}

// Send the active profile to the game page right away (no reload needed).
function applyProfileToPage(announce) {
  const wc = mainWindow?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(
    `window.__xboxPlayInput && window.__xboxPlayInput.setProfile(${JSON.stringify(pageProfile())}, ${announce ? 'true' : 'false'})`
  ).catch(() => {});
}

function setMappings(data, announce) {
  mappings = lib.sanitizeProfiles(data, mappings);
  writeMappings(mappings);
  applyProfileToPage(announce);
  return mappings;
}

// ---------- controls editor window ----------

let editorWindow = null;

function openEditor() {
  if (editorWindow) {
    if (editorWindow.isMinimized()) editorWindow.restore();
    return editorWindow.focus();
  }
  editorWindow = new BrowserWindow({
    title: 'Xbox Play – sterowanie',
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#1d2230',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'editor-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  editorWindow.on('closed', () => (editorWindow = null));
  editorWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  editorWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  editorWindow.loadFile(path.join(__dirname, 'editor.html'));
}

function fromEditor(event) {
  return editorWindow && event.sender === editorWindow.webContents;
}

ipcMain.handle('mappings:get', (event) => {
  if (!fromEditor(event)) return null;
  return {
    data: mappings,
    defaultMapping: lib.DEFAULT_KEY_MAPPING,
    reserved: [...lib.RESERVED_CODES],
  };
});

ipcMain.handle('mappings:save', (event, data) => {
  if (!fromEditor(event)) return null;
  const before = mappings.active;
  const saved = setMappings(data, false);
  if (saved.active !== before) applyProfileToPage(true);
  return saved;
});

// Our own in-page input layer (Xbox button, mouse & keyboard -> pad).
const PAGE_INPUT_JS = fs.readFileSync(path.join(__dirname, 'page-input.js'), 'utf8');
function pagePrelude() {
  const pageCfg = { mapper: cfg.mapper, ...pageProfile() };
  return `window.__xboxPlayConfig = ${JSON.stringify(pageCfg)};\n${PAGE_INPUT_JS}\n`;
}

// The preload asks for the scripts synchronously so they run before any page script.
ipcMain.on('bx:get', (event, href) => {
  const ok = cfg.betterXcloud && betterXcloud && lib.isBetterXcloudPage(String(href));
  event.returnValue = ok
    ? {
        src: getPatchedBetterXcloud(),
        defaults: cfg.betterXcloudDefaults,
        // Better xCloud's own mouse & keyboard would fight with ours (and does not work in Remote Play).
        forced: cfg.mapper ? { 'mkb.enabled': false } : {},
        prelude: pagePrelude(),
      }
    : null;
});

// ---------- window ----------

const HIDE_SCROLLBARS_CSS = `
  * { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
`;

const ALLOWED_PERMISSIONS = new Set([
  'pointerLock',
  'keyboardLock',
  'fullscreen',
  'media', // microphone for party chat; camera is refused below
  'clipboard-sanitized-write',
]);

function setupSession(ses, userAgent) {
  ses.setUserAgent(userAgent);

  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = details.requestingUrl || wc.getURL();
    if (!ALLOWED_PERMISSIONS.has(permission) || !lib.isTrustedUrl(url)) return callback(false);
    if (permission === 'media') {
      const types = details.mediaTypes || [];
      return callback(types.length > 0 && types.every((t) => t === 'audio'));
    }
    callback(true);
  });

  ses.setPermissionCheckHandler((wc, permission, origin) => {
    return ALLOWED_PERMISSIONS.has(permission) && lib.isTrustedUrl(origin);
  });
}

function openExternal(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
  } catch {}
}

function attachNavigationGuards(wc) {
  wc.on('will-navigate', (event, url) => {
    if (!lib.isTrustedUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (lib.isTrustedUrl(url)) {
      // Microsoft sign-in popups stay inside the app (same session, same preload).
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: mainWindow,
          autoHideMenuBar: true,
          backgroundColor: '#101010',
          webPreferences: webPreferences(),
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  wc.on('did-create-window', (child) => attachNavigationGuards(child.webContents));
}

function webPreferences() {
  return {
    partition: 'persist:xbox',
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    spellcheck: false,
  };
}

let sleepBlocker = null;
function blockSleep(on) {
  if (on && sleepBlocker === null) {
    sleepBlocker = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!on && sleepBlocker !== null) {
    powerSaveBlocker.stop(sleepBlocker);
    sleepBlocker = null;
  }
}

let testerWindow = null;
function openGamepadTester() {
  if (testerWindow) return testerWindow.focus();
  testerWindow = new BrowserWindow({
    title: 'Test pada',
    width: 900,
    height: 520,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  testerWindow.on('closed', () => (testerWindow = null));
  testerWindow.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyUp' && input.key === 'Escape') testerWindow.close();
  });
  testerWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lib.GAMEPAD_TESTER_HTML));
}

// ---------- Xbox (guide) button ----------
// Presses come from F9 and from the pad itself (read from /dev/input, so it works
// even when the browser does not see the button). page-input.js turns them into
// a tap or a real hold on the console.

function setXboxButton(pressed) {
  const wc = mainWindow?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.executeJavaScript(`window.__xboxPlayHome && window.__xboxPlayHome(${pressed ? 'true' : 'false'})`)
    .catch(() => {});
}

const guideWatchers = new Map(); // /dev/input/eventN -> stream
const guideFailed = new Set();

function scanGuideButtons() {
  let text;
  try {
    text = fs.readFileSync('/proc/bus/input/devices', 'utf8');
  } catch {
    return;
  }
  const present = new Set();
  for (const dev of lib.findGuideButtonDevices(text)) {
    const node = `/dev/input/${dev.event}`;
    present.add(node);
    if (guideWatchers.has(node) || guideFailed.has(node)) continue;
    const stream = fs.createReadStream(node, { highWaterMark: lib.INPUT_EVENT_SIZE * 64 });
    guideWatchers.set(node, stream);
    let rest = Buffer.alloc(0);
    stream.on('open', () => console.log(`[xbox-play] Xbox button: watching ${dev.name} (${node})`));
    stream.on('data', (chunk) => {
      const parsed = lib.parseInputEvents(rest.length ? Buffer.concat([rest, chunk]) : chunk);
      rest = parsed.rest;
      for (const ev of parsed.events) {
        if (ev.type !== lib.EV_KEY || ev.code !== lib.BTN_MODE || ev.value === 2) continue;
        if (mainWindow?.isFocused()) setXboxButton(ev.value === 1);
      }
    });
    stream.on('error', (e) => {
      if (e.code === 'EACCES') console.warn(`[xbox-play] Xbox button: no access to ${node}`);
      guideFailed.add(node);
      guideWatchers.delete(node);
    });
    stream.on('close', () => guideWatchers.delete(node));
  }
  // Forget devices that went away so they are picked up again when they come back.
  for (const node of guideFailed) if (!present.has(node)) guideFailed.delete(node);
  for (const [node, stream] of guideWatchers) {
    if (!present.has(node)) {
      stream.destroy();
      guideWatchers.delete(node);
    }
  }
}

function handleShortcuts(win) {
  win.webContents.on('before-input-event', (event, input) => {
    // F9 (Xbox button) is handled inside the page: blocking a key here also hides its
    // release, so a held F9 would never be let go.
    if (input.type !== 'keyDown' && input.type !== 'rawKeyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key;
    const wc = win.webContents;
    const nav = wc.navigationHistory;
    let handled = true;

    if (key === 'F11') win.setFullScreen(!win.isFullScreen());
    else if (ctrl && input.shift && key.toLowerCase() === 'c') wc.loadURL(lib.consolesUrl(state.lastConsole?.locale));
    else if (key === 'F5' || (ctrl && !input.shift && key.toLowerCase() === 'r')) wc.reload();
    else if (ctrl && input.shift && key.toLowerCase() === 'r') wc.reloadIgnoringCache();
    else if (key === 'F12' || (ctrl && input.shift && key.toLowerCase() === 'i')) wc.toggleDevTools();
    else if (ctrl && key.toLowerCase() === 'q') app.quit();
    else if (input.alt && key === 'ArrowLeft' && nav?.canGoBack()) nav.goBack();
    else if (input.alt && key === 'ArrowRight' && nav?.canGoForward()) nav.goForward();
    else if (ctrl && input.shift && key.toLowerCase() === 'g') openGamepadTester();
    else if (ctrl && input.shift && key.toLowerCase() === 'm') openEditor();
    else if (key === 'F7') {
      // Next control profile, shown in the game and in the editor if it is open.
      if (!input.isAutoRepeat) {
        setMappings(lib.cycleProfile(mappings), true);
        editorWindow?.webContents.send('mappings:changed', mappings);
      }
    }
    else if (ctrl && input.shift && key.toLowerCase() === 'u') {
      updateBetterXcloud().then(() => wc.reload());
    } else handled = false;

    if (handled) event.preventDefault();
  });
}

function createWindow() {
  const userAgent =
    cfg.userAgent === 'edge-windows'
      ? lib.edgeUserAgent(process.versions.chrome)
      : cfg.userAgent === 'default'
        ? session.defaultSession.getUserAgent().replace(/\s*Electron\/\S+/, '').replace(/\s*xbox-play\/\S+/, '')
        : cfg.userAgent;

  setupSession(session.fromPartition('persist:xbox'), userAgent);

  mainWindow = new BrowserWindow({
    title: 'Xbox Play',
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#101010',
    autoHideMenuBar: true,
    fullscreen: cfg.fullscreen,
    show: false,
    webPreferences: webPreferences(),
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('focus', () => blockSleep(true));
  mainWindow.on('blur', () => blockSleep(false));
  mainWindow.on('closed', () => {
    blockSleep(false);
    mainWindow = null;
  });

  // Keep the window title stable so Hyprland rules can match it.
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  attachNavigationGuards(mainWindow.webContents);
  handleShortcuts(mainWindow);

  // No scrollbars on Xbox pages (scrolling with wheel / pad / drag still works).
  mainWindow.webContents.on('dom-ready', () => {
    if (cfg.hideScrollbars && lib.isTrustedUrl(mainWindow.webContents.getURL())) {
      mainWindow.webContents
        .insertCSS(HIDE_SCROLLBARS_CSS, { cssOrigin: 'user' })
        .catch(() => {});
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.warn(`[xbox-play] renderer gone (${details.reason}), reloading`);
    if (details.reason !== 'clean-exit') setTimeout(() => mainWindow?.reload(), 1500);
  });

  // Remote Play only: remember the console, send Cloud Gaming pages back to the console list.
  let lastRedirect = 0;
  const onNavigated = (url) => {
    const page = lib.classifyXboxUrl(url);
    if (!page) return;
    if (page.type === 'launch') {
      const last = state.lastConsole;
      if (!last || last.consoleId !== page.consoleId || last.locale !== page.locale) {
        state.lastConsole = { locale: page.locale, consoleId: page.consoleId };
        saveState();
      }
    } else if (page.type === 'cloud' && cfg.remotePlayOnly && !cfg.url) {
      if (Date.now() - lastRedirect < 3000) return; // never loop
      lastRedirect = Date.now();
      mainWindow.webContents.loadURL(lib.consolesUrl(page.locale));
    }
  };
  mainWindow.webContents.on('did-navigate', (_e, url) => onNavigated(url));
  mainWindow.webContents.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (isMainFrame) onNavigated(url);
  });

  mainWindow.loadURL(lib.chooseStartUrl(cfg, state), { userAgent });
}

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  const hadScript = Boolean(betterXcloud);
  createWindow();
  if (process.argv.includes('--editor')) openEditor();
  scanGuideButtons();
  setInterval(scanGuideButtons, 3000);
  if (cfg.betterXcloud && (cfg.autoUpdateBetterXcloud || !hadScript)) {
    // With no local copy at all, download it and reload so it is active right away.
    updateBetterXcloud().then((updated) => {
      if (updated && !hadScript) mainWindow?.reload();
    });
  }
});

app.on('window-all-closed', () => app.quit());
