// Runs inside the xbox.com page (main world) before Better xCloud and the
// Xbox web client. Everything here goes through the Gamepad API, which the
// Remote Play client polls, so it works where Better xCloud's own mouse &
// keyboard (which talks to an input channel) does not.
//
//  - Xbox button: window.__xboxPlayHome(pressed). Short press = tap. Holding
//    it is passed to the console as a real hold (needs the small Better xCloud
//    patch applied by the app, which exposes window.__xpSink).
//  - Mouse & keyboard -> pad mapper, toggled with F8. Keys and mouse are merged
//    into the real pad; with no pad connected a virtual one is shown instead.
(function () {
  'use strict';
  if (window.__xboxPlayHome || !window.Gamepad || !navigator.getGamepads) return;

  var CFG = window.__xboxPlayConfig || {};
  try { delete window.__xboxPlayConfig; } catch (e) {}

  var MAPPING = CFG.keyMapping || {};
  var SENS = typeof CFG.mouseSensitivity === 'number' ? CFG.mouseSensitivity : 1;
  var MAPPER_ENABLED = CFG.mapper !== false;
  var TOGGLE_KEY = CFG.mapperToggleKey || 'F8';

  var BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9,
    L3: 10, R3: 11, Up: 12, Down: 13, Left: 14, Right: 15 };
  // stick direction -> [axis index, sign]
  var STICK = { LS_Up: [1, -1], LS_Down: [1, 1], LS_Left: [0, -1], LS_Right: [0, 1],
    RS_Up: [3, -1], RS_Down: [3, 1], RS_Left: [2, -1], RS_Right: [2, 1] };

  var proto = Gamepad.prototype;
  var bDesc = Object.getOwnPropertyDescriptor(proto, 'buttons');
  var aDesc = Object.getOwnPropertyDescriptor(proto, 'axes');
  var tDesc = Object.getOwnPropertyDescriptor(proto, 'timestamp');
  if (!bDesc || !bDesc.get || !aDesc || !aDesc.get || !tDesc || !tDesc.get) return;
  var nativeGetGamepads = navigator.getGamepads.bind(navigator);

  var RELEASED = { pressed: false, touched: false, value: 0 };
  var PRESSED = { pressed: true, touched: true, value: 1 };
  var changedAt = 0;
  function touch() { changedAt = performance.now(); }

  function realPads() {
    var out = [], pads = nativeGetGamepads() || [];
    for (var i = 0; i < pads.length; i++) if (pads[i] instanceof Gamepad) out.push(pads[i]);
    return out;
  }

  // ---------------------------------------------------------------- Xbox button
  var home = { pressed: false, downAt: 0, long: false, longTimer: 0, longIv: 0, relTimer: 0 };
  var MIN_HOLD = 120;   // the page polls the pad; shorter taps would be missed
  var LONG_AFTER = 500; // from here on the console gets a real, continuous hold

  function padState(index, nexus) {
    return { GamepadIndex: index, A: 0, B: 0, X: 0, Y: 0, LeftShoulder: 0, RightShoulder: 0,
      LeftTrigger: 0, RightTrigger: 0, View: 0, Menu: 0, LeftThumb: 0, RightThumb: 0,
      DPadUp: 0, DPadDown: 0, DPadLeft: 0, DPadRight: 0, Nexus: nexus,
      LeftThumbXAxis: 0, LeftThumbYAxis: 0, RightThumbXAxis: 0, RightThumbYAxis: 0,
      PhysicalPhysicality: 0, VirtualPhysicality: 0, Dirty: true, Virtual: false };
  }
  function sinkSend(nexus) {
    var sink = window.__xpSink;
    if (!sink || typeof sink.onGamepadInput !== 'function') return false;
    var pads = realPads();
    try {
      sink.onGamepadInput(performance.now(), [padState(pads.length ? pads[0].index : 0, nexus)]);
      return true;
    } catch (e) { return false; }
  }
  function startLongHold() {
    if (!home.pressed || !window.__xpSink) return;
    home.long = true;
    window.__xpLongHold = true; // tells Better xCloud not to add its own tap on release
    sinkSend(1);
    home.longIv = setInterval(function () { sinkSend(1); }, 50);
  }
  function releaseHome() {
    home.pressed = false;
    touch();
    clearTimeout(home.longTimer);
    clearInterval(home.longIv);
    if (home.long) {
      home.long = false;
      sinkSend(0);
      setTimeout(function () { sinkSend(0); window.__xpLongHold = false; }, 400);
    }
  }
  function setHome(pressed) {
    pressed = !!pressed;
    clearTimeout(home.relTimer);
    if (pressed) {
      if (home.pressed) return;
      home.pressed = true;
      home.downAt = performance.now();
      touch();
      home.longTimer = setTimeout(startLongHold, LONG_AFTER);
    } else if (home.pressed) {
      var left = MIN_HOLD - (performance.now() - home.downAt);
      if (left > 0) home.relTimer = setTimeout(releaseHome, left);
      else releaseHome();
    }
  }
  Object.defineProperty(window, '__xboxPlayHome', {
    value: function (pressed) { setHome(pressed); return realPads().length > 0 || mapper.on; }
  });

  // ---------------------------------------------------------------- mapper state
  var mapper = { on: false, held: {}, mouseX: 0, mouseY: 0, mouseTimer: 0, virtualShown: false };

  function mappedButtons() {
    var out = null;
    for (var code in mapper.held) {
      var idx = BUTTON[MAPPING[code]];
      if (idx === undefined) continue;
      if (!out) out = {};
      out[idx] = true;
    }
    return out;
  }
  function mappedAxes() {
    var ax = [0, 0, 0, 0], any = false;
    for (var code in mapper.held) {
      var s = STICK[MAPPING[code]];
      if (!s) continue;
      ax[s[0]] += s[1];
      any = true;
    }
    for (var i = 0; i < 4; i++) ax[i] = Math.max(-1, Math.min(1, ax[i]));
    // diagonal on the left stick: keep it on the unit circle
    if (ax[0] && ax[1]) { ax[0] *= Math.SQRT1_2; ax[1] *= Math.SQRT1_2; }
    if (ax[2] && ax[3]) { ax[2] *= Math.SQRT1_2; ax[3] *= Math.SQRT1_2; }
    if (mapper.mouseX || mapper.mouseY) { ax[2] = mapper.mouseX; ax[3] = mapper.mouseY; any = true; }
    return any ? ax : null;
  }

  // ---------------------------------------------------------------- Gamepad API
  function mergeButtons(base) {
    var mb = mapper.on ? mappedButtons() : null;
    if (!home.pressed && !mb && base.length > 16) return base;
    var out = Array.prototype.slice.call(base);
    while (out.length < 17) out.push(RELEASED);
    if (mb) for (var i in mb) out[i] = PRESSED;
    if (home.pressed) out[16] = PRESSED;
    return out;
  }
  function mergeAxes(base) {
    var ma = mapper.on ? mappedAxes() : null;
    if (!ma) return base;
    var out = Array.prototype.slice.call(base);
    while (out.length < 4) out.push(0);
    if (ma[0] || ma[1]) { out[0] = ma[0]; out[1] = ma[1]; }
    if (ma[2] || ma[3]) { out[2] = ma[2]; out[3] = ma[3]; }
    return out;
  }

  Object.defineProperty(proto, 'buttons', { configurable: true, enumerable: bDesc.enumerable,
    get: function () { return mergeButtons(bDesc.get.call(this)); } });
  Object.defineProperty(proto, 'axes', { configurable: true, enumerable: aDesc.enumerable,
    get: function () { return mergeAxes(aDesc.get.call(this)); } });
  Object.defineProperty(proto, 'timestamp', { configurable: true, enumerable: tDesc.enumerable,
    get: function () { return Math.max(tDesc.get.call(this), changedAt); } });

  // Shown when the mapper is on and no real pad is connected.
  var EMPTY_BUTTONS = [];
  for (var i = 0; i < 17; i++) EMPTY_BUTTONS.push(RELEASED);
  var virtualPad = {
    id: 'Xbox Play Keyboard (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    index: 0, connected: true, mapping: 'standard', vibrationActuator: null, hapticActuators: [],
    get buttons() { return mergeButtons(EMPTY_BUTTONS); },
    get axes() { return mergeAxes([0, 0, 0, 0]); },
    get timestamp() { return changedAt; }
  };
  navigator.getGamepads = function () {
    var pads = Array.prototype.slice.call(nativeGetGamepads() || []);
    if (mapper.on && !pads.some(function (g) { return g instanceof Gamepad; })) {
      while (pads.length < 1) pads.push(null);
      pads[0] = virtualPad;
    }
    return pads;
  };
  function announceVirtual(show) {
    if (show === mapper.virtualShown) return;
    if (show && realPads().length) return;
    mapper.virtualShown = show;
    var ev = new Event(show ? 'gamepadconnected' : 'gamepaddisconnected');
    ev.gamepad = virtualPad;
    window.dispatchEvent(ev);
  }

  // ---------------------------------------------------------------- toast
  var toastEl = null, toastTimer = 0;
  function toast(text) {
    if (!document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('style', 'position:fixed;top:24px;left:50%;transform:translateX(-50%);' +
        'z-index:2147483647;padding:10px 18px;border-radius:10px;background:rgba(16,16,16,.88);' +
        'color:#fff;font:600 15px/1.4 system-ui,sans-serif;pointer-events:none;transition:opacity .3s;' +
        'box-shadow:0 4px 20px rgba(0,0,0,.4)');
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    if (!toastEl.isConnected) document.body.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.style.opacity = '0'; }, 2200);
  }

  // ---------------------------------------------------------------- input events
  function clearHeld() {
    var hadXbox = false;
    for (var code in mapper.held) if (MAPPING[code] === 'Xbox') hadXbox = true;
    mapper.held = {};
    mapper.mouseX = mapper.mouseY = 0;
    if (hadXbox) setHome(false);
    touch();
  }
  function setMapper(on) {
    mapper.on = on;
    clearHeld();
    if (on) {
      announceVirtual(true);
      toast('Mysz i klawiatura → pad: WŁ. Kliknij w obraz (F8 wyłącza, Esc zwalnia kursor)');
    } else {
      announceVirtual(false);
      if (document.pointerLockElement) document.exitPointerLock();
      toast('Mysz i klawiatura → pad: WYŁ.');
    }
  }
  function swallow(e) { e.preventDefault(); e.stopImmediatePropagation(); }

  function press(code, down) {
    var target = MAPPING[code];
    if (!target) return false;
    if (target === 'Xbox') { setHome(down); return true; }
    if (down) mapper.held[code] = true; else delete mapper.held[code];
    touch();
    return true;
  }

  window.addEventListener('keydown', function (e) {
    if (MAPPER_ENABLED && e.code === TOGGLE_KEY) {
      swallow(e);
      if (!e.repeat) setMapper(!mapper.on);
      return;
    }
    if (!mapper.on || !MAPPING[e.code]) return;
    swallow(e);
    if (!e.repeat) press(e.code, true);
  }, true);
  window.addEventListener('keyup', function (e) {
    if (MAPPER_ENABLED && e.code === TOGGLE_KEY) { swallow(e); return; }
    if (!mapper.on || !MAPPING[e.code]) return;
    swallow(e);
    press(e.code, false);
  }, true);

  function mouseCode(e) { return 'Mouse' + e.button; }
  window.addEventListener('mousedown', function (e) {
    if (!mapper.on) return;
    swallow(e);
    if (!document.pointerLockElement) {
      var el = document.body || document.documentElement;
      try {
        var p = el.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(function () { el.requestPointerLock(); });
      } catch (err) { el.requestPointerLock(); }
      return;
    }
    press(mouseCode(e), true);
  }, true);
  window.addEventListener('mouseup', function (e) {
    if (!mapper.on) return;
    swallow(e);
    if (document.pointerLockElement) press(mouseCode(e), false);
  }, true);
  window.addEventListener('contextmenu', function (e) { if (mapper.on) e.preventDefault(); }, true);

  var DEADZONE_COUNTERWEIGHT = 0.2; // small mouse moves still beat the game's stick deadzone
  window.addEventListener('mousemove', function (e) {
    if (!mapper.on || !document.pointerLockElement) return;
    var k = 0.045 * SENS;
    var x = e.movementX * k, y = e.movementY * k;
    var mag = Math.sqrt(x * x + y * y);
    if (mag > 0) {
      var shaped = Math.min(1, DEADZONE_COUNTERWEIGHT + mag * (1 - DEADZONE_COUNTERWEIGHT));
      mapper.mouseX = x / mag * shaped;
      mapper.mouseY = y / mag * shaped;
      touch();
    }
    clearTimeout(mapper.mouseTimer);
    mapper.mouseTimer = setTimeout(function () { mapper.mouseX = mapper.mouseY = 0; touch(); }, 40);
  }, true);

  document.addEventListener('pointerlockchange', function () {
    if (!document.pointerLockElement && mapper.on) {
      // Esc released the cursor: let go of everything the mouse was holding.
      for (var code in mapper.held) if (code.indexOf('Mouse') === 0) delete mapper.held[code];
      mapper.mouseX = mapper.mouseY = 0;
      touch();
    }
  });
  window.addEventListener('blur', function () { if (mapper.on) clearHeld(); if (home.pressed) setHome(false); });

  window.__xboxPlayInput = { setMapper: setMapper, isMapperOn: function () { return mapper.on; } };
})();
