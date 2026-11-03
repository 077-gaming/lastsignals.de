// Tastenbelegung als Datentabelle (Planung/FLUGMODELL.md 5.1): einzige Quelle für Flugsteuerung, Flug-Coach,
// SYSTEM-Quests, Einführungskarte, Bordmenü-Übersicht und Controller-Belegung. Ausgewertet wird e.code (physische
// Tastenlage); die Beschriftung kommt aus navigator.keyboard.getLayoutMap() (Chrome, Edge, Electron), sonst aus einer
// festen QWERTZ-Tabelle (auf QWERTZ heißt KeyZ „Y“).

// Hauptmodus (Verfolger und Cockpit, 3D-Flug)
export const FLIGHT = {
  fwd: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
  up: ['Space'], down: ['ControlLeft'],
  rollL: ['KeyQ'], rollR: ['KeyE'],
  boost: ['ShiftLeft'], brake: ['KeyX'], cruise: ['KeyC'], couple: ['Alt+KeyC'],
  mode: ['KeyB'], landing: ['KeyN'], context: ['KeyF'], aimTarget: ['KeyT'], next: ['Tab'], prev: ['Shift+Tab'],
  rocket: ['KeyR'], autofire: ['ControlRight'], home: ['KeyH'], camera: ['KeyV'], jump: ['KeyJ'],
  look: ['KeyZ'], free: ['AltLeft'], menu: ['Escape'],
  fire: ['Mouse0'], lock: ['Mouse2'], lookMouse: ['Mouse1'], limiter: ['Wheel'], camDist: ['Alt+Wheel'],
};
// Taktikmodus (unverändert)
export const TACTIC = {
  attack: ['ControlLeft'], rocket: ['Space'], dock: ['KeyE'], jump: ['KeyJ'], next: ['Tab'], home: ['KeyH'],
  camera: ['KeyV'], shop: ['KeyB'], fly: ['Mouse0'], zoom: ['Wheel'], steer: ['KeyW'],
};
// Controller (Hauptmodus), Glyphen-Schlüssel wie padglyph.js
export const PAD = {
  thrust: 'LS', aim: 'RS', rollL: 'LB', rollR: 'RB', vertical: 'LB+RB', boost: 'L3', landing: 'L3 HALTEN',
  fire: 'RT', precise: 'LT', target: 'A', cancel: 'B', brake: 'B HALTEN', rocket: 'X', couple: 'X HALTEN',
  context: 'Y', home: 'Y HALTEN', camera: 'R3', look: 'R3 HALTEN', barSel: 'DPAD ◂▸', barFire: 'DPAD ▴', barNext: 'DPAD ▾',
  menu: 'MENU', mode: 'MENU HALTEN', map: 'VIEW',
};

// Beschriftung je e.code (QWERTZ, Mac und Windows)
const QWERTZ = {
  KeyZ: 'Y', KeyY: 'Z', Space: 'LEERTASTE', ControlLeft: 'STRG', ControlRight: 'STRG RECHTS', ShiftLeft: 'UMSCHALT', ShiftRight: 'UMSCHALT',
  AltLeft: 'ALT', AltRight: 'ALT GR', Tab: 'TAB', Escape: 'ESC', Enter: 'ENTER', Backspace: 'RÜCK',
  ArrowUp: '▴', ArrowDown: '▾', ArrowLeft: '◂', ArrowRight: '▸', Mouse0: 'LINKSKLICK', Mouse1: 'MITTLERE MAUSTASTE', Mouse2: 'RECHTSKLICK',
  Wheel: 'MAUSRAD', Semicolon: 'Ö', Quote: 'Ä', BracketLeft: 'Ü', Minus: 'ß',
};
const isMac = () => { try { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''); } catch { return false; } };
let layout = null;
/** Tastatur-Layout des Systems laden (wo der Browser es kann). Danach liefern keyName/label die echte Beschriftung. */
export async function loadLayout() {
  try {
    if (typeof navigator !== 'undefined' && navigator.keyboard && navigator.keyboard.getLayoutMap) {
      const m = await navigator.keyboard.getLayoutMap();
      layout = new Map();
      m.forEach((v, k) => layout.set(k, String(v).toUpperCase()));
    }
  } catch { layout = null; }
  return layout;
}
/** Beschriftung einer einzelnen physischen Taste ('KeyW', 'Alt+KeyC', 'Mouse0') */
export function label(code) {
  if (code.includes('+')) return code.split('+').map(label).join('+');
  if (code === 'Shift') return 'UMSCHALT';
  if (code === 'Alt') return isMac() ? 'OPTION' : 'ALT';
  if (code === 'AltLeft' && isMac()) return 'OPTION';
  if (code === 'ControlLeft' && isMac()) return 'CTRL';
  if (layout && layout.has(code)) return layout.get(code);
  if (QWERTZ[code]) return QWERTZ[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code.toUpperCase();
}
/** Name der Taste für eine Aktion im Hauptmodus (bzw. Taktik mit mode = 'tactic') */
export function keyName(action, mode = 'flight') {
  const t = mode === 'tactic' ? TACTIC : FLIGHT;
  const c = t[action];
  return c ? label(c[0]) : action.toUpperCase();
}
/** Passt ein Tastenereignis zu einer Aktion? (Modifikatoren müssen stimmen, 'Alt+KeyC' ≠ 'KeyC') */
export function matches(e, action, table = FLIGHT) {
  const list = table[action];
  if (!list) return false;
  for (const c of list) {
    const parts = c.split('+'), key = parts[parts.length - 1];
    if (e.code !== key) continue;
    const alt = parts.includes('Alt'), shift = parts.includes('Shift');
    if (alt !== !!e.altKey && key !== 'AltLeft') continue;
    if (shift !== !!e.shiftKey && !key.startsWith('Shift')) continue;
    return true;
  }
  return false;
}
/** Ist die physische Taste einer Aktion zugeordnet (ohne Modifikator-Prüfung, für gehaltene Tasten)? */
export function codeOf(action, table = FLIGHT) { const c = table[action]; return c ? c[0].split('+').pop() : ''; }
/** Übersicht für Hilfe und Bordmenü: [Taste, Wirkung] */
export function flightHelp() {
  const k = (a) => keyName(a);
  return [
    ['MAUS', 'Zielen: Fadenkreuz sofort, das Schiff folgt'],
    [k('fire'), 'Laser feuern (halten)'],
    [`${k('lock')} HALTEN`, 'Rakete aufschalten, loslassen startet'],
    [`${k('fwd')} / ${k('back')}`, 'Schub vor / zurück'],
    [`${k('left')} / ${k('right')}`, 'seitlich schieben'],
    [`${k('up')} / ${k('down')}`, 'hoch / runter schieben'],
    [`${k('rollL')} / ${k('rollR')}`, 'rollen'],
    [k('boost'), 'Boost (Vorrat)'],
    [k('brake'), 'Raumbremse'],
    [k('cruise'), 'Tempomat'],
    [k('couple'), 'gekoppelt / entkoppelt'],
    [`${k('mode')} HALTEN`, 'KAMPF / REISE'],
    [k('landing'), 'Landemodus (Fahrwerk)'],
    [k('limiter'), 'Begrenzer'],
    [k('context'), 'andocken, springen, Beute anfliegen'],
    [`${k('aimTarget')} / ${k('next')}`, 'Ziel im Fadenkreuz / nächstes Ziel'],
    [k('rocket'), 'Rakete'],
    [k('autofire'), 'Feuerleitrechner (Autofeuer)'],
    [k('home'), 'Autopilot zur Station'],
    [`${k('free')} HALTEN`, 'Zeiger frei für die Fenster'],
    [k('camera'), 'Kamera: Verfolger → Cockpit → Taktisch'],
  ];
}
export function padHelp() {
  return [
    ['LS', 'Schub vor/zurück, seitlich'], ['RS', 'Zielen (Fadenkreuz im Lenkkegel), Schiff folgt'], ['LB / RB', 'rollen'],
    ['LB + RB', 'linker Stick ↕ = hoch/runter'], ['L3', 'Boost · halten: Landemodus'], ['RT', 'Laser feuern'],
    ['LT', 'Präzisionszielen, schaltet Raketen auf'], ['A', 'Ziel im Fadenkreuz / nächstes'], ['B', 'abbrechen · halten: Raumbremse'],
    ['X', 'Rakete · halten: gekoppelt/entkoppelt'], ['Y', 'Kontext · halten: Autopilot'], ['R3', 'Kamera · halten: umsehen'],
    ['▴ ◂ ▸ ▾', 'Schnellleiste: ◂▸ wählen, ▴ auslösen, ▾ Leiste'], ['MENU', 'Bordmenü · halten: KAMPF/REISE'], ['VIEW', 'Karte'],
  ];
}
