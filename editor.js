'use strict';
// Controls editor: profiles, key/mouse bindings per pad control, mouse sensitivity.
// Data comes from and goes back to the app through window.xboxPlay (editor-preload.js).

const LAYOUT = {
  left: [
    { title: 'Spust i bumper', items: [['LT', 'LT (spust)'], ['LB', 'LB']] },
    { title: 'Lewa gałka', items: [['LS_Up', 'Do przodu ↑'], ['LS_Down', 'Do tyłu ↓'], ['LS_Left', 'W lewo ←'], ['LS_Right', 'W prawo →'], ['L3', 'L3 (wciśnięcie)']] },
    { title: 'Krzyżak', items: [['Up', 'Góra'], ['Down', 'Dół'], ['Left', 'Lewo'], ['Right', 'Prawo']] },
    { title: 'Środek', items: [['View', 'View']] },
  ],
  right: [
    { title: 'Spust i bumper', items: [['RT', 'RT (spust)'], ['RB', 'RB']] },
    { title: 'Przyciski', items: [['A', 'A'], ['B', 'B'], ['X', 'X'], ['Y', 'Y']] },
    { title: 'Prawa gałka (oprócz myszy)', items: [['RS_Up', 'Góra ↑'], ['RS_Down', 'Dół ↓'], ['RS_Left', 'Lewo ←'], ['RS_Right', 'Prawo →'], ['R3', 'R3 (wciśnięcie)']] },
    { title: 'Środek', items: [['Menu', 'Menu'], ['Xbox', 'Xbox']] },
  ],
};
const TARGET_NAME = {};
for (const side of Object.values(LAYOUT)) for (const g of side) for (const [t, n] of g.items) TARGET_NAME[t] = n;

const RESERVED_WHY = {
  F5: 'odświeża stronę', F7: 'zmienia profil', F8: 'włącza mysz i klawiaturę', F9: 'to przycisk Xbox',
  F11: 'przełącza pełny ekran', F12: 'otwiera narzędzia deweloperskie', Escape: 'zwalnia kursor',
};

const KEY_NAMES = {
  Space: 'Spacja', Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab', Backspace: 'Backspace',
  ShiftLeft: 'L Shift', ShiftRight: 'P Shift', ControlLeft: 'L Ctrl', ControlRight: 'P Ctrl',
  AltLeft: 'L Alt', AltRight: 'P Alt', MetaLeft: 'Super', MetaRight: 'P Super', CapsLock: 'Caps Lock',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', IntlBackslash: '<',
  Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Mouse0: 'Mysz lewy', Mouse1: 'Mysz środek', Mouse2: 'Mysz prawy', Mouse3: 'Mysz wstecz', Mouse4: 'Mysz dalej',
  WheelUp: 'Kółko ↑', WheelDown: 'Kółko ↓', WheelLeft: 'Kółko ←', WheelRight: 'Kółko →',
};
function keyName(code) {
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return m[1];
  if ((m = code.match(/^Digit(\d)$/))) return m[1];
  if ((m = code.match(/^Numpad(.+)$/))) return 'Num ' + m[1];
  return code;
}

// ---------- state ----------
let data = null;          // { version, active, profiles: [{ name, sensitivity, invertY, mapping }] }
let defaultMapping = {};
let reserved = new Set();
let listening = null;     // target being bound
let saveTimer = 0;

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');

function profile() {
  return data.profiles.find((p) => p.name === data.active) || data.profiles[0];
}

// A key drives one control ("A") or several at once (["LB", "RB"]).
function targetsOf(code) {
  const t = profile().mapping[code];
  return t ? (Array.isArray(t) ? t : [t]) : [];
}
function setTargets(code, targets) {
  const mapping = profile().mapping;
  if (!targets.length) delete mapping[code];
  else mapping[code] = targets.length === 1 ? targets[0] : targets;
}
function keysFor(target) {
  return Object.keys(profile().mapping).filter((code) => targetsOf(code).includes(target));
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = kind || '';
}

// ---------- saving ----------
function save(message) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const saved = await window.xboxPlay.save(data);
    if (saved) {
      data = saved;
      render();
    }
  }, 150);
  if (message) setStatus(message, 'ok');
}

// ---------- rendering ----------
function renderSide(el, groups) {
  el.replaceChildren();
  for (const group of groups) {
    const wrap = document.createElement('div');
    wrap.className = 'group';
    const h = document.createElement('h2');
    h.textContent = group.title;
    wrap.append(h);
    for (const [target, label] of group.items) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.target = target;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', `${label}: przypisz klawisz`);
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = label;
      const keys = document.createElement('span');
      keys.className = 'keys';
      const codes = keysFor(target);
      if (!codes.length) {
        const empty = document.createElement('span');
        empty.className = 'empty';
        empty.textContent = 'brak';
        keys.append(empty);
      }
      for (const code of codes) {
        const cap = document.createElement('span');
        cap.className = 'key';
        cap.textContent = keyName(code);
        const others = targetsOf(code).filter((t) => t !== target);
        if (others.length) {
          cap.classList.add('combo');
          const more = document.createElement('span');
          more.className = 'also';
          more.textContent = `+${others.length}`;
          cap.title = `${keyName(code)} naciska też: ${others.map((t) => TARGET_NAME[t]).join(', ')}`;
          cap.append(more);
        }
        const x = document.createElement('button');
        x.className = 'remove';
        x.type = 'button';
        x.textContent = '×';
        x.title = `Usuń ${keyName(code)}`;
        x.setAttribute('aria-label', `Usuń ${keyName(code)} z: ${label}`);
        x.addEventListener('click', (e) => {
          e.stopPropagation();
          setTargets(code, targetsOf(code).filter((t) => t !== target));
          save(`Usunięto ${keyName(code)} z: ${label}.`);
          render();
        });
        cap.append(x);
        keys.append(cap);
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'add';
      add.textContent = '+';
      add.title = 'Dodaj klawisz';
      add.setAttribute('aria-label', `Dodaj klawisz do: ${label}`);
      add.addEventListener('click', (e) => {
        e.stopPropagation();
        startListening(target);
      });
      keys.append(add);
      row.append(name, keys);
      row.addEventListener('click', () => startListening(target));
      row.addEventListener('keydown', (e) => {
        if (!listening && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          startListening(target);
        }
      });
      row.addEventListener('mouseenter', () => highlight(target, true));
      row.addEventListener('mouseleave', () => highlight(target, false));
      wrap.append(row);
    }
    el.append(wrap);
  }
}

function render() {
  const sel = $('#profile');
  sel.replaceChildren(...data.profiles.map((p) => new Option(p.name, p.name, false, p.name === data.active)));
  $('#delete').disabled = data.profiles.length < 2;

  const p = profile();
  $('#sens').value = p.sensitivity;
  $('#sens-value').textContent = `${p.sensitivity.toFixed(1)}×`;
  $('#invert').checked = p.invertY;

  renderSide($('#left'), LAYOUT.left);
  renderSide($('#right'), LAYOUT.right);

  for (const part of document.querySelectorAll('.part')) {
    const t = part.dataset.target;
    part.classList.toggle('bound', keysFor(t).length > 0);
    part.classList.toggle('listening', t === listening);
    const glyph = part.nextElementSibling;
    if (glyph && glyph.classList.contains('glyph')) glyph.classList.toggle('on-listen', t === listening);
    let title = part.querySelector('title');
    if (!title) {
      title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      part.append(title);
    }
    const codes = keysFor(t);
    title.textContent = `${TARGET_NAME[t]}: ${codes.length ? codes.map(keyName).join(', ') : 'brak'}`;
  }
  for (const row of document.querySelectorAll('.row')) {
    row.classList.toggle('listening', row.dataset.target === listening);
  }
}

function highlight(target, on) {
  for (const el of document.querySelectorAll(`[data-target="${target}"]`)) el.classList.toggle('hover', on);
}

// ---------- binding ----------
function startListening(target) {
  listening = target;
  setStatus(`Naciśnij klawisz, przycisk myszy albo przekręć kółko dla: ${TARGET_NAME[target]}. Esc anuluje.`, 'listen');
  $('#cancel-listen').hidden = false;
  render();
}

function stopListening(message, kind) {
  listening = null;
  $('#cancel-listen').hidden = true;
  setStatus(message || 'Zmiany zapisują się same i działają od razu w grze.', kind);
  render();
}

function bind(code) {
  if (reserved.has(code)) {
    setStatus(`${keyName(code)} jest zajęty: ${RESERVED_WHY[code] || 'używa go aplikacja'}. Wybierz inny klawisz.`, 'error');
    return;
  }
  const target = listening;
  const current = targetsOf(code);
  if (current.includes(target)) {
    stopListening(`${keyName(code)} już jest przypisany do: ${TARGET_NAME[target]}.`);
    return;
  }
  setTargets(code, [...current, target]);
  let msg = `${keyName(code)} → ${TARGET_NAME[target]}.`;
  if (current.length) {
    msg += ` Ten klawisz naciska teraz naraz: ${[...current, target].map((t) => TARGET_NAME[t]).join(' + ')}.` +
      ' Jeśli to pomyłka, usuń go ze starego miejsca (×).';
  } else {
    msg += ' Kliknij + przy tym przycisku, żeby dodać kolejny klawisz.';
  }
  stopListening(msg, 'ok');
  save();
}

window.addEventListener('keydown', (e) => {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (e.code === 'Escape') return stopListening('Anulowano.');
  bind(e.code);
}, true);

window.addEventListener('wheel', (e) => {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const delta = horizontal ? e.deltaX : e.deltaY;
  if (!delta) return;
  bind(horizontal ? (delta < 0 ? 'WheelLeft' : 'WheelRight') : (delta < 0 ? 'WheelUp' : 'WheelDown'));
}, { capture: true, passive: false });

// The click that completes a mouse binding (same press) must not start listening again.
let swallowClick = false;
let swallowTimer = 0;
window.addEventListener('mousedown', (e) => {
  if (!listening) return;
  if (e.target.closest('#cancel-listen')) return;
  e.preventDefault();
  e.stopPropagation();
  swallowClick = true;
  clearTimeout(swallowTimer);
  swallowTimer = setTimeout(() => (swallowClick = false), 300);
  bind('Mouse' + e.button);
}, true);
for (const type of ['click', 'auxclick']) {
  window.addEventListener(type, (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
}
window.addEventListener('contextmenu', (e) => e.preventDefault());

$('#cancel-listen').addEventListener('click', () => stopListening('Anulowano.'));
for (const part of document.querySelectorAll('.part')) {
  part.addEventListener('click', () => startListening(part.dataset.target));
  part.addEventListener('mouseenter', () => highlight(part.dataset.target, true));
  part.addEventListener('mouseleave', () => highlight(part.dataset.target, false));
}

// ---------- mouse settings ----------
$('#sens').addEventListener('input', (e) => {
  profile().sensitivity = Number(e.target.value);
  $('#sens-value').textContent = `${profile().sensitivity.toFixed(1)}×`;
  save();
});
$('#invert').addEventListener('change', (e) => {
  profile().invertY = e.target.checked;
  save(e.target.checked ? 'Oś Y myszy odwrócona.' : 'Oś Y myszy normalna.');
});

// ---------- profiles ----------
$('#profile').addEventListener('change', (e) => {
  data.active = e.target.value;
  save(`Aktywny profil: ${data.active}. Gra używa go od razu.`);
  render();
});

let nameMode = null; // 'new' | 'duplicate' | 'rename'
function askName(mode, suggestion) {
  nameMode = mode;
  const input = $('#name-input');
  input.value = suggestion;
  for (const id of ['#profile', '#profile-actions']) $(id).hidden = true;
  for (const id of ['#name-input', '#name-ok', '#name-cancel']) $(id).hidden = false;
  $('#name-ok').textContent = mode === 'rename' ? 'Zmień nazwę' : 'Utwórz profil';
  input.focus();
  input.select();
}
function closeName() {
  nameMode = null;
  for (const id of ['#profile', '#profile-actions']) $(id).hidden = false;
  for (const id of ['#name-input', '#name-ok', '#name-cancel']) $(id).hidden = true;
}
function uniqueName(base) {
  const taken = new Set(data.profiles.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`.toLowerCase())) return `${base} (${n})`;
}
function confirmName() {
  const name = $('#name-input').value.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return setStatus('Wpisz nazwę profilu, np. nazwę gry.', 'error');
  const clash = data.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase() && !(nameMode === 'rename' && p === profile()));
  if (clash) return setStatus(`Profil „${name}” już istnieje.`, 'error');
  if (nameMode === 'rename') {
    profile().name = name;
    data.active = name;
    save(`Zmieniono nazwę na: ${name}.`);
  } else {
    const base = nameMode === 'duplicate' ? profile() : { sensitivity: 1, invertY: false, mapping: defaultMapping };
    data.profiles.push({ name, sensitivity: base.sensitivity, invertY: base.invertY, mapping: { ...base.mapping } });
    data.active = name;
    save(`Utworzono profil: ${name}.`);
  }
  closeName();
  render();
}
$('#new').addEventListener('click', () => askName('new', uniqueName('Nowa gra')));
$('#duplicate').addEventListener('click', () => askName('duplicate', uniqueName(`${profile().name} (kopia)`)));
$('#rename').addEventListener('click', () => askName('rename', profile().name));
$('#name-ok').addEventListener('click', confirmName);
$('#name-cancel').addEventListener('click', () => { closeName(); setStatus('Anulowano.'); });
$('#name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmName();
  else if (e.key === 'Escape') { closeName(); setStatus('Anulowano.'); }
});

// Destructive actions ask for a second click.
function twoStep(button, question, action) {
  let armed = 0;
  const label = button.textContent;
  button.addEventListener('click', () => {
    if (armed) {
      clearTimeout(armed);
      armed = 0;
      button.textContent = label;
      button.classList.remove('confirm');
      action();
      return;
    }
    button.textContent = question;
    button.classList.add('confirm');
    armed = setTimeout(() => {
      armed = 0;
      button.textContent = label;
      button.classList.remove('confirm');
    }, 3000);
  });
}
twoStep($('#delete'), 'Na pewno usunąć?', () => {
  if (data.profiles.length < 2) return;
  const name = profile().name;
  data.profiles = data.profiles.filter((p) => p !== profile());
  data.active = data.profiles[0].name;
  save(`Usunięto profil: ${name}.`);
  render();
});
twoStep($('#reset'), 'Na pewno przywrócić?', () => {
  const p = profile();
  p.mapping = { ...defaultMapping };
  p.sensitivity = 1;
  p.invertY = false;
  save(`Przywrócono domyślne sterowanie w profilu: ${p.name}.`);
  render();
});

// ---------- start ----------
(async () => {
  const res = await window.xboxPlay.load();
  if (!res) return setStatus('Nie udało się wczytać profili.', 'error');
  data = res.data;
  defaultMapping = res.defaultMapping;
  reserved = new Set(res.reserved);
  render();
})();
window.xboxPlay.onChanged((fresh) => {
  data = fresh;
  if (!nameMode) render();
  setStatus(`Aktywny profil: ${data.active}.`, 'ok');
});
