// Tastenhinweise für den Controller: Beschriftung je Bauart als Text-Glyphen (keine Emojis, keine Bilder).
// Xbox: A B X Y LB RB LT RT · PlayStation (Kennung 'Sony'/'DualSense'/'054c'): × ○ □ △ L1 R1 L2 R2 ·
// Nintendo Switch Pro: B A Y X L R ZL ZR (Standard-Mapping: Index 0 ist immer die untere Taste).
// Solange der Controller benutzt wird (html[data-input="pad"]), tauschen die Tastenkappen (.ls-key) im HUD, in der
// Station und in den Bildschirmen ihre Tastaturbeschriftung gegen das Controller-Symbol; bei Maus/Tastatur zurück.
import { pad } from './gamepad.js';

const GLYPHS = {
  xbox: { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT', VIEW: 'VIEW', MENU: 'MENU', L3: 'L3', R3: 'R3', LS: 'L-STICK', RS: 'R-STICK' },
  ps: { A: '\u00D7', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', VIEW: 'CREATE', MENU: 'OPTIONS', L3: 'L3', R3: 'R3', LS: 'L-STICK', RS: 'R-STICK' },
  nin: { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR', VIEW: '−', MENU: '+', L3: 'L3', R3: 'R3', LS: 'L-STICK', RS: 'R-STICK' },
};
// Steuerkreuz als kleine geometrische Dreiecke (U+25B4/25BE/25C2/25B8 haben keine Emoji-Darstellung); Kreuztaste ×
// (U+00D7) statt des Dingbat-Kreuzes und Steuerkreuz ╋ (U+254B): beide außerhalb der Dingbats, die die Textprüfung als Emoji wertet
const DPAD = { DU: '▴', DD: '▾', DL: '◂', DR: '▸', DLR: '◂▸', DUD: '▴▾', DPAD: '\u254B' };

/** Ein Controller-Name (A, B, LB, RT, L3, LS, DL …) oder eine Verbindung ('RB+A', 'LB/RB') als Text der Bauart */
export function glyph(name, style = pad.style) {
  const G = GLYPHS[style] || GLYPHS.xbox;
  return String(name).split(/([+/ ])/).map((p) => G[p] || DPAD[p] || p).join('');
}

// Tastatur-Beschriftung → Controller-Belegung (padflight.js, Planung/CONTROLLER.md)
const SAFE = { // gilt für alle Tastenkappen in HUD, Station und Bildschirmen
  ESC: 'MENU', Esc: 'MENU', E: 'Y', J: 'Y', TAB: 'RB', STRG: 'A', LEER: 'X', LEERTASTE: 'X', V: 'R3', ENTER: 'A', B: 'B', '↓': 'DUD', '↑': 'DUD',
};
const FULL = { // zusätzlich für Quest-Karten und Hinweise, die eine einzelne Handlung meinen
  ...SAFE, R: 'X', W: 'RT', S: 'LT', A: 'LS', D: 'LS', MAUS: 'LS', KLICK: 'RB', '2× KLICK': 'A', KARTE: 'VIEW', H: 'Y', G: 'MENU',
  'ALT+1': 'DUD', 'ALT+2': 'DUD', 'ALT+3': 'DUD', 'ALT+4': 'DUD', 'ALT+5': 'DUD',
  1: 'DLR RB+A', 2: 'DLR RB+A', 3: 'DLR RB+A', 4: 'DLR RB+A', 5: 'DLR RB+A', 6: 'DLR RB+A', 7: 'DLR RB+A', 8: 'DLR RB+A', 9: 'DLR RB+A', 0: 'DLR RB+A',
};

// 3D-Flug (html[data-flight="3d"]): andere Controller-Belegung (Planung/FLUGMODELL.md 5.3)
const SAFE3 = { ...SAFE, F: 'Y', E: 'Y', TAB: 'A', T: 'A', STRG: 'RT', LINKSKLICK: 'RT', R: 'X', LEER: 'X', LEERTASTE: 'X', X: 'B', UMSCHALT: 'L3', N: 'L3' };
const FULL3 = {
  ...FULL, ...SAFE3, W: 'LS', S: 'LS', A: 'LS', D: 'LS', MAUS: 'RS', KLICK: 'A', H: 'Y',
  1: 'DLR DU', 2: 'DLR DU', 3: 'DLR DU', 4: 'DLR DU', 5: 'DLR DU', 6: 'DLR DU', 7: 'DLR DU', 8: 'DLR DU', 9: 'DLR DU', 0: 'DLR DU',
  'ALT+1': 'DD', 'ALT+2': 'DD', 'ALT+3': 'DD', 'ALT+4': 'DD', 'ALT+5': 'DD',
};
const f3 = () => typeof document !== 'undefined' && document.documentElement.dataset.flight === '3d';

/** Hinweistext für eine Tastatur-Beschriftung: im Controller-Modus das Symbol, sonst unverändert */
export function keyHint(label, full = true) {
  if (pad.mode !== 'pad' || label == null) return label;
  const m = (f3() ? (full ? FULL3 : SAFE3) : (full ? FULL : SAFE))[String(label).trim()];
  return m ? glyph(m) : label;
}
export const padMode = () => pad.mode === 'pad';

// Tabellen und Grafiken, die bewusst die Tastatur zeigen (Steuerungsübersichten), bleiben unverändert
const KEEP = '.mc-kb, .hb-keys, .mp-ctrl, .gp-map, .qs-k, [data-nopad]';

/** Tastenkappen unter root auf die aktuelle Eingabeart umstellen (billig: nur geänderte Kappen werden geschrieben) */
export function applyKeyHints(root, force = false) {
  if (!root) return;
  const on = pad.mode === 'pad';
  const list = root.querySelectorAll('.ls-key');
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (el.children.length) continue;
    const ds = el.dataset;
    let cur = el.textContent;
    let ours = ds.pd !== undefined && cur === ds.pd; // steht gerade unser Symbol drin?
    if (ours && force) { el.textContent = cur = ds.kb; ours = false; } // Bauart gewechselt: neu beschriften
    if (!ours) { ds.kb = cur; delete ds.pd; el.classList.remove('is-pad'); }
    if (!on) { if (ours) { el.textContent = ds.kb; delete ds.pd; el.classList.remove('is-pad'); } continue; }
    if (ours || el.closest(KEEP)) continue;
    const k = String(ds.kb).trim();
    // Station und Fernhandel: Abdocken/Schließen liegt auf B (Zurück), nicht auf Y
    const m = (k === 'E' || k === 'Esc' || k === 'ESC') && el.closest('.sx') ? 'B' : (f3() ? SAFE3 : SAFE)[k];
    if (!m) continue;
    const t = glyph(m);
    ds.pd = t;
    el.textContent = t;
    el.classList.add('is-pad');
  }
}

// Laufend: bei Wechsel der Eingabeart sofort, im Controller-Modus alle 300 ms (neu gezeichnete Kappen)
const roots = () => [document.getElementById('hud'), document.getElementById('screens'), document.querySelector('.qb-confirm')];
function sweep(force) { for (const r of roots()) applyKeyHints(r, force === true); }
if (typeof window !== 'undefined') {
  window.addEventListener('ls:inputmode', () => sweep(true));
  window.addEventListener('ls:flightview', () => sweep(true)); // 3D-Flug ↔ Taktik: andere Controller-Belegung
  setInterval(() => { if (pad.mode === 'pad') sweep(); }, 300);
}
