// Controller-Belegung als Grafik und Tabelle (Einstellungen und Steuerung im Hub, Bordmenü STEUERUNG).
// Symbole werden je Bauart eingesetzt (Xbox, PlayStation, Switch): Elemente mit data-pk bekommen ihren Text über
// paintPadKeys(); bei Wechsel des Controllers neu beschriften. Inhalt wie Planung/CONTROLLER.md.
import { glyph } from '../input/padglyph.js';
import { pad } from '../input/gamepad.js';

export const PAD_ROWS = [
  ['FLUG', [
    ['LS', 'Lenken wie die Maus (taktisch: bildbezogen fliegen)'],
    ['RT', 'Schub, stufenlos'],
    ['LT', 'Bremsen'],
    ['L3', 'Dauerschub an, aus (wie W)'],
    ['RS', 'Kamera schwenken, im Cockpit umsehen, taktisch Zoom'],
    ['R3', 'Kamera wechseln (wie V)'],
    ['Y', 'Andocken, Springen, Beute anfliegen (wie E, J)'],
    ['Y', 'Halten: Autopilot zur Station (wie H)'],
  ]],
  ['KAMPF', [
    ['A', 'Angriff an, aus (ohne Ziel: nächster Gegner)'],
    ['X', 'Rakete'],
    ['RB', 'Nächstes Ziel (wie TAB)'],
    ['LB', 'Voriges Ziel'],
    ['B', 'Angriff aus, dann Ziel lösen, dann Kurs abbrechen'],
    ['DLR', 'Schnellleiste: Platz wählen'],
    ['DUD', 'Schnellleiste: Leiste wechseln'],
    ['RB+A', 'Gewählten Platz auslösen'],
  ]],
  ['SYSTEM', [
    ['MENU', 'Bordmenü (wie Esc)'],
    ['VIEW', 'Karte ein, aus'],
  ]],
  ['MENÜS', [
    ['DPAD', 'Auswahl bewegen (auch linker Stick)'],
    ['A', 'Bestätigen'],
    ['B', 'Zurück, Abbrechen'],
    ['LB/RB', 'Reiter wechseln'],
    ['LT/RT', 'Bereich wechseln (Mission Control)'],
    ['RS', 'Blättern'],
    ['MENU', 'Mission Control: abheben'],
  ]],
];

const K = (name, x, y, w = 26, h = 16) => `<rect class="gp-part" x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}"/><text class="gp-k" x="${x}" y="${y}" data-pk="${name}"></text>`;
const R = (name, x, y, r = 11) => `<circle class="gp-part" cx="${x}" cy="${y}" r="${r}"/><text class="gp-k" x="${x}" y="${y}" data-pk="${name}"></text>`;
// Beschriftung mit Führungslinie: (x1,y1) am Bauteil → Text links (r=false) bzw. rechts am Rand
const L = (x1, y1, y2, text, right) => {
  const xe = right ? 520 : 120;
  return `<path class="gp-lead" d="M${x1} ${y1}L${right ? xe - 20 : xe + 20} ${y2}H${xe}"/><text class="gp-t${right ? '' : ' r'}" x="${right ? xe + 6 : xe - 6}" y="${y2}">${text}</text>`;
};

/** Schema eines Controllers mit Beschriftung der Flugbelegung (SVG, monochrom, angeschnittene Form) */
export function padSvg() {
  const body = 'M230 70 L282 62 H358 L410 70 L452 92 L478 190 L468 236 L438 248 L404 214 H236 L202 248 L172 236 L162 190 L188 92 Z';
  return `<svg class="gp-svg" viewBox="0 0 640 270" role="img" aria-label="Controller-Belegung im Flug">
  <path class="gp-body" d="${body}"/>
  ${K('LT', 222, 40, 34)}${K('LB', 222, 60, 34)}${K('RT', 418, 40, 34)}${K('RB', 418, 60, 34)}
  <circle class="gp-part" cx="222" cy="116" r="15"/><text class="gp-k" x="222" y="116">L</text>
  <circle class="gp-part" cx="372" cy="170" r="15"/><text class="gp-k" x="372" y="170">R</text>
  <path class="gp-part" d="M252 156h12v-12h12v12h12v12h-12v12h-12v-12h-12z"/>
  ${K('VIEW', 290, 108, 44)}${K('MENU', 350, 108, 46)}
  ${R('Y', 420, 94, 10)}${R('X', 398, 116, 10)}${R('B', 442, 116, 10)}${R('A', 420, 138, 10)}
  ${L(205, 40, 26, 'BREMSEN', false)}${L(205, 60, 50, 'VORIGES ZIEL', false)}${L(207, 116, 92, 'LENKEN · L3 DAUERSCHUB', false)}
  ${L(252, 162, 150, 'SCHNELLLEISTE', false)}${L(268, 108, 120, 'KARTE', false)}
  ${L(435, 40, 26, 'SCHUB', true)}${L(435, 60, 50, 'NÄCHSTES ZIEL · +A PLATZ', true)}
  ${L(430, 94, 74, 'ANDOCKEN · SPRUNG · BEUTE', true)}${L(452, 116, 98, 'ABBRECHEN', true)}
  ${L(430, 138, 122, 'ANGRIFF', true)}${L(388, 116, 146, 'RAKETE', true)}
  ${L(387, 170, 170, 'KAMERA · R3 WECHSEL', true)}${L(373, 108, 194, 'BORDMENÜ', true)}
</svg>`;
}

/** Tabelle (Gruppen FLUG, KAMPF, SYSTEM, MENÜS) */
export function padTable(groups = PAD_ROWS) {
  return `<div class="gp-tab">${groups.map(([g, rows]) => `<div class="gp-grp"><b>${g}</b>${rows.map(([k, t]) => `<div class="gp-row"><span class="ls-key is-pad" data-pk="${k}"></span><span>${t}</span></div>`).join('')}</div>`).join('')}</div>`;
}

export function padMapHtml({ graphic = true } = {}) {
  return `<div class="gp-map" data-padmap>${graphic ? padSvg() : ''}${padTable()}</div>`;
}

/** Symbole der aktuellen Bauart in alle [data-pk] unter root schreiben */
export function paintPadKeys(root, style = pad.style) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-pk]')) {
    const t = glyph(el.dataset.pk, style);
    if (el.textContent !== t) el.textContent = t;
  }
}

/** Statuszeile: verbundener Controller */
export function padStatus() {
  if (!pad.connected) return 'KEIN CONTROLLER';
  const s = pad.index >= 0 ? pad.style : '';
  return `VERBUNDEN${s ? ' · ' + (s === 'ps' ? 'PLAYSTATION' : s === 'nin' ? 'SWITCH' : 'XBOX') : ' · TASTE DRÜCKEN'}`;
}
