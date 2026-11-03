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
  rocket: ['KeyR'], autofire: ['KeyK', 'ControlRight'], home: ['KeyH'], camera: ['KeyV'], jump: ['KeyJ'],
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

// Dieselben Handlungen mit Controller (Glyphen-Schlüssel für padglyph.glyph) und Touch (Knopfbeschriftung), damit
// Hilfetexte (SYSTEM-Karten, Coach, Funk) je Gerät die richtige Taste nennen statt „W“ oder „Klick“.
export const PAD_ACT = {
  flight: {
    fwd: 'LS', back: 'LS', left: 'LS', right: 'LS', up: 'LB+RB', down: 'LB+RB', rollL: 'LB', rollR: 'RB', boost: 'L3', brake: 'B HALTEN',
    couple: 'X HALTEN', mode: 'MENU HALTEN', landing: 'L3 HALTEN', context: 'Y', aimTarget: 'A', next: 'A', rocket: 'X', lock: 'LT',
    home: 'Y HALTEN', camera: 'R3', look: 'R3 HALTEN', fire: 'RT', menu: 'MENU', MAUS: 'RS',
  },
  tactic: { attack: 'A', rocket: 'X', dock: 'Y', jump: 'Y', next: 'RB', home: 'Y HALTEN', camera: 'R3', fly: 'LS', steer: 'RT', MAUS: 'LS', KLICK: 'LS' },
};
export const TOUCH_ACT = {
  flight: { fwd: 'SCHUB', brake: 'SCHUB', boost: 'BOOST', fire: 'LASER', autofire: 'LASER', next: 'ZIEL', aimTarget: 'ZIEL', rocket: 'RAKETE', home: 'HEIM', camera: 'ANSICHT', context: 'DOCK', MAUS: 'JOYSTICK' },
  tactic: { attack: 'LASER', rocket: 'RAKETE', next: 'ZIEL', home: 'HEIM', camera: 'ANSICHT', dock: 'DOCK', jump: 'SPRUNG', fly: 'JOYSTICK', KLICK: 'JOYSTICK' },
};
// Satzteile je Gerät ({aimDev} „die Maus“, {tacGo} „Klick in Richtung Wegpunkt“ …): Text oder Funktion (glyph)
const PHRASE = {
  aimDev: { kb: 'die Maus', pad: 'der rechte Stick', touch: 'der Joystick' },
  tacFly: { kb: 'per Klick', pad: 'mit dem linken Stick', touch: 'mit dem Joystick oder per Fingertipp' },
  tacGo: { kb: 'Klick in Richtung Wegpunkt', pad: 'Lenk mit dem linken Stick Richtung Wegpunkt', touch: 'Tipp in Richtung Wegpunkt' },
  thrustHow: { kb: () => `${keyName('fwd')} gibt Schub`, pad: 'Der linke Stick gibt Schub', touch: 'Der Knopf SCHUB gibt Schub' },
  stopHow: {
    kb: () => `Lass ${keyName('fwd')} los, der Flugrechner bremst von selbst ab. ${keyName('brake')} ist die Raumbremse und noch stärker.`,
    pad: (g) => `Lass den linken Stick los, der Flugrechner bremst von selbst ab. ${g('B')} halten ist die Raumbremse und noch stärker.`,
    touch: 'Schalt SCHUB aus, der Flugrechner bremst von selbst ab.',
  },
  targetHow: {
    kb: () => `${keyName('next')} erfasst den nächsten Gegner, ${keyName('aimTarget')} den unter dem Fadenkreuz.`,
    pad: (g) => `${g('A')} erfasst den Gegner im Fadenkreuz, sonst den nächsten.`,
    touch: 'Der Knopf ZIEL erfasst den nächsten Gegner.',
  },
  fireHow: {
    kb: () => `${keyName('fire')} feuert die Laser.`, pad: (g) => `${g('RT')} feuert die Laser.`, touch: 'Der Knopf LASER schaltet das Autofeuer an.',
  },
  autoHint: {
    kb: () => `${keyName('autofire')} schaltet den Feuerleitrechner zu, der trifft schlechter.`,
    pad: 'Nahe der Raute richtet die Zielhilfe die Laser selbst aus (Stufe in den Einstellungen).',
    touch: 'Der Feuerleitrechner trifft schlechter als eigenes Zielen.',
  },
  rocketHow: {
    kb: () => `${keyName('rocket')} oder ein kurzer Rechtsklick schickt eine R1 aufs Ziel, ${keyName('lock')} gehalten schaltet erst auf.`,
    pad: (g) => `${g('X')} schickt eine R1 aufs Ziel, ${g('LT')} gehalten schaltet erst auf.`,
    touch: 'Der Knopf RAKETE schickt eine R1 aufs Ziel.',
  },
};
/**
 * Name einer Handlung je Gerät für Hilfetexte: dev 'kb' (Tastatur/Maus), 'pad' (glyph: Controller-Symbol der Bauart),
 * 'touch' (Knopfbeschriftung). Unbekannt → Tastaturname.
 */
export function inputName(action, mode = 'flight', dev = 'kb', glyph = null) {
  if (PHRASE[action]) { const v = PHRASE[action][dev] ?? PHRASE[action].kb; return typeof v === 'function' ? v(glyph || ((x) => x)) : v; }
  if (dev === 'pad') { const g = PAD_ACT[mode === 'tactic' ? 'tactic' : 'flight'][action]; if (g) return glyph ? glyph(g) : g; }
  if (dev === 'touch') { const t = TOUCH_ACT[mode === 'tactic' ? 'tactic' : 'flight'][action]; if (t) return t; }
  if (action === 'MAUS' || action === 'KLICK') return action;
  return keyName(action, mode === 'tactic' ? 'tactic' : 'flight');
}

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
    [`${k('autofire')} / ${label('ControlRight')}`, 'Feuerleitrechner (Autofeuer)'],
    [k('home'), 'Autopilot zur Station'],
    [`${k('free')} HALTEN`, 'Zeiger frei für die Fenster'],
    [k('camera'), 'Kamera: Verfolger → Cockpit → Taktisch'],
  ];
}
/** Touch-Belegung (Knöpfe und Gesten) für Bordmenü und Mission Control: [[Gruppe, [[Knopf, Wirkung], …]], …] */
export function touchHelp() {
  return [
    ['TOUCH · FLUG 3D', [
      ['JOYSTICK', 'Zielen, das Schiff folgt'], ['SCHUB', 'Schub an, aus'], ['BOOST', 'halten: Boost'],
      ['LASER', 'Feuerleitrechner an, aus (führt die Zielrichtung)'], ['RAKETE', 'Rakete aufs Ziel'], ['ZIEL', 'Nächster Gegner'],
      ['DOCK', 'Andocken, springen, Beute'], ['HEIM', 'Autopilot zur Station'], ['ANSICHT', 'Verfolger, Cockpit, Taktik'],
    ]],
    ['TOUCH · TAKTIK', [['JOYSTICK', 'Fliegen'], ['TIPPEN', 'Hinfliegen, Gegner wählen'], ['2× TIPPEN', 'Angriff'], ['2 FINGER', 'Zoom']]],
  ];
}
/** Flugpraxis im 3D-Flug (Mission Control → STEUERUNG): Abläufe, die keine einzelne Taste sind */
export function flightPractice() {
  const k = (a) => keyName(a);
  return [
    [`${k('context')} AM TOR`, 'Springen: das Sprungfeld fängt das Schiff auch aus voller Fahrt und hält es beim Aufladen; Boost reißt heraus und bricht ab'],
    ['SEKTORRAND', 'Kein Schaden: ab 83 % warnt das HUD, jenseits bremst ein Navigationsfeld und schiebt zurück. Höhe ±4.000 m (Heimat), sonst ±4.500 m'],
    ['KURVENKAMPF', 'Gegner setzen sich ins Heck und weichen unter Beschuss aus: wenden, seitlich schieben, mit Boost aus dem Feuer'],
    [`${k('autofire')}`, 'Feuerleitrechner: feuert gewürfelt und führt die Zielrichtung, solange du nicht selbst zielst; Handzielen trifft stärker'],
    ['RAUTE', 'Vorhalt: dorthin zielen, wo der Gegner sein wird. Leuchtet sie, schwenken die Laser selbst auf die Marke'],
    ['HORIZONT', 'Am Controller richtet sich das Schiff in Ruhe waagrecht aus (abschaltbar), mit Maus zuschaltbar'],
  ];
}
export function padHelp() {
  return [
    ['LS', 'Schub vor/zurück, seitlich'], ['RS', 'Zielen: Fadenkreuz kurz vor dem Bug, das Schiff folgt'], ['LB / RB', 'rollen'],
    ['LB + RB', 'linker Stick ↕ = hoch/runter'], ['L3', 'Boost · halten: Landemodus'], ['RT', 'Laser feuern'],
    ['LT', 'Präzisionszielen, schaltet Raketen auf'], ['A', 'Ziel im Fadenkreuz / nächstes'], ['B', 'abbrechen · halten: Raumbremse'],
    ['X', 'Rakete · halten: gekoppelt/entkoppelt'], ['Y', 'Kontext · halten: Autopilot'], ['R3', 'Kamera · halten: umsehen'],
    ['▴ ◂ ▸ ▾', 'Schnellleiste: ◂▸ wählen, ▴ auslösen, ▾ Leiste'], ['MENU', 'Bordmenü · halten: KAMPF/REISE'], ['VIEW', 'Karte'],
  ];
}
