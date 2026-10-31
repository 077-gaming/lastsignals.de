// Anzeige im Flug (HUD) als Cockpit in klaren Zonen: unten mittig die Konsole aus Schiff (Hülle, Schild, Tempo,
// Generatoren) über der frei belegbaren Schnellleiste (hud-bar.js, Tasten 1–0), oben rechts Ziel und Mission,
// unten rechts die Karte, unten links Funk, oben links Pilot und Konto als leise Nebenebene.
// Kampf-Lesbarkeit (Trefferzeichen, Serie, Angriffswarnungen) in hud-combat.js.
// Jedes Element bleibt ein eigenes Fenster (verschiebbar, zuklappbar, Balken/Werte, hud-win.js).
// Oben mittig die Fensterleiste: ein Symbol je Fenster schaltet es ein oder aus (auch Shift+1 bis Shift+9).
// Liest die Welt jedes Bild, schreibt nur geänderte Werte ins DOM. Keine Speicher-Neuanlage pro Bild.
import './hud.css';
import {
  FACTIONS, RANKS, xpForLevel, MAX_LEVEL, SHIPS, LASERS, GENERATORS,
  REPAIR, BACKDROPS, ORES, ENEMIES,
} from '../core/data.js';
import { PLAYER_RANGE } from '../sim/config.js';
import { HudWindows } from './hud-win.js';
import {
  fmt, clamp01, TextSlot, ClassSlot, Counter, Bar, Gauge, gaugeHtml,
} from './hud-parts.js';
import { HudMid } from './hud-mid.js';
import { HudBar, quickBody } from './hud-bar.js';
import { HudCombat } from './hud-combat.js';
import { HudMap } from './hud-map.js';
import { HudMenu, menuHtml } from './hud-menu.js';
import { questText, radioText } from './hud-text.js';

// ---------- gemeinsame Helfer (auch von station.js genutzt) ----------
export { fmt };
const NF2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function satOf(hex) {
  const n = parseInt(String(hex).slice(1), 16) || 0;
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}
// Einziger Farbakzent: die buntere der beiden Fraktionsfarben (Europa Gold, Saturn Orange, Eris Violett).
export function factionAccent(id) {
  const f = FACTIONS[id];
  if (!f) return '#ffffff';
  return satOf(f.css.main) >= satOf(f.css.accent) ? f.css.main : f.css.accent;
}
export function rankFor(level) {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, Math.floor(((level || 1) - 1) / 3)))];
}
export function repairCost(where, profile) {
  const lvl = profile?.level || 1;
  if (lvl <= REPAIR.freeUntilLevel) return { free: true, credits: 0, tritium: 0 };
  const no = SHIPS[profile?.ship]?.no || 1;
  const base = REPAIR[where] || {};
  return { free: false, credits: (base.credits || 0) * no, tritium: (base.tritium || 0) * no };
}
function clock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? (h < 10 ? '0' : '') + h + ':' : '') + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

const KIND_CLASS = { crate: 'CRATE', wreck: 'WRACK', station: 'STATION', portal: 'SPRUNGTOR', ore: 'ERZ', player: 'PILOT' };
const GROUP_CLASS = { pirate: 'PIRAT', swarm: 'SCHWARM' };
const BEHAVIOR = { aggressive: 'AGGRESSIV', passive: 'PASSIV', opportunist: 'LAUERT', thief: 'PLÜNDERER' };
const MSG_TAGS = { radio: 'FUNK', warn: 'WARN', quest: 'AUFTR', loot: 'BEUTE', info: 'SYS' };
const FLOAT_POOL = 48;
const MSG_MAX = 7;
const MSG_OLD = 14;      // Sekunden, dann gedimmt
const MSG_MERGE = 10;    // gleiche Meldung innerhalb dieser Sekunden wird zusammengefasst
// Bekannte Systemtexte der Simulation (Anfang des Satzes) -> Cockpit-Kurzform, optional andere Art
const SYS_TEXT = [
  ['Ziel ist zu weit weg für eine Rakete', 'AUSSER RAKETENREICHWEITE', 'range'],
  ['Ziel ist zu weit weg', 'AUSSER REICHWEITE', 'range'],
  ['Achtung: Du bist außerhalb der Karte', 'SEKTORRAND ÜBERSCHRITTEN · HÜLLE NIMMT SCHADEN · UMKEHREN', 'warn'],
  ['In der sicheren Zone kannst du nicht schießen', 'SICHERE ZONE · WAFFEN GESPERRT'],
  ['Keine Munition mehr', 'MUNITION LEER · NACHSCHUB AN DER STATION', 'warn'],
  ['Der Gegner hat keinen Schild mehr', 'ZIELSCHILD 0 · SAB OHNE WIRKUNG'],
  ['Laderaum voll', 'LADERAUM VOLL · ERZ AN DER STATION VERKAUFEN', 'warn'],
  ['Eine Falle', 'FALLE · PIRATEN IM ANFLUG', 'warn'],
  ['Kein Ziel ausgewählt', 'KEIN ZIEL ERFASST · TAB FÜR NÄCHSTEN GEGNER'],
  ['Keine SAL-Munition', 'SAL LEER · NACHSCHUB AN DER STATION', 'warn'],
  ['Keine Raketen mehr', 'R1 LEER · NACHSCHUB AN DER STATION', 'warn'],
  ['Flieg näher an ein Sprungtor', 'KEIN TOR IN REICHWEITE · 150 M'],
  ['Sprung abgebrochen', 'SPRUNG ABGEBROCHEN · TOR AUSSER REICHWEITE', 'warn'],
  ['In diesem Sektor gibt es keine Station', 'KEINE STATION IM SEKTOR'],
  ['Flieg in die sichere Zone der Station', 'ANDOCKEN NUR IN SICHERER ZONE · 400 M'],
  ['Dein Schiff wurde zerstört', 'SCHIFF ZERSTÖRT · REPARATURORT WÄHLEN', 'warn'],
  ['Kein Erz an Bord', 'KEIN ERZ AN BORD'],
  ['Alle Aufträge erledigt', 'ALLE AUFTRÄGE ERLEDIGT', 'quest'],
  ['Reparatur nicht möglich', 'REPARATUR NICHT MÖGLICH', 'warn'],
];
// Meldungen mit Werten: Muster -> Versalien-Kurzform ($1, $2 … aus dem Muster), optional andere Art
const SYS_RX = [
  [/^Stufe (\d+) erreicht/, 'STUFE $1 · FREIGABE ERTEILT'],
  [/^(.+?) zerstört: \+([\d.]+) Erfahrung, \+([\d.]+) Ehre/, '$1 ZERSTÖRT · +$2 EP · +$3 EHRE'],
  [/^Beute: \+([\d.]+) Credits, \+([\d.]+) Tritium/, 'BEUTE · +$1 CR · +$2 T'],
  [/^Beute: \+([\d.]+) Credits/, 'BEUTE · +$1 CR'],
  [/^Crate: \+([\d.]+) Credits/, 'CRATE · +$1 CR'],
  [/^Crate: \+([\d.]+) Tritium/, 'CRATE · +$1 T'],
  [/^Crate: \+([\d.]+) (\S+)-Munition/, 'CRATE · +$1 $2'],
  [/^\+(\d+) (\S+)$/, 'ERZ GEBORGEN · +$1 $2'],
  [/^Ein (.+?) hat ein Wrack geklaut/, 'WRACK GEPLÜNDERT · $1', 'warn'],
  [/^Auftrag erledigt: (.+?)\. Belohnung/, 'AUFTRAG ERFÜLLT · $1'],
  [/^Keine (\S+)-Munition mehr/, '$1 LEER · ZURÜCK AUF L1'],
  [/^Keine (\S+)-Munition\./, '$1 LEER · NACHSCHUB AN DER STATION'],
  [/^SAL lädt noch \(([\d,]+) s\)/, 'SAL LÄDT · $1 S'],
  [/^Rakete lädt noch \(([\d,]+) s\)/, 'R1 LÄDT · $1 S'],
  [/^Nach der Reparatur kurz kein Schießen \(([\d,]+) s\)/, 'WAFFEN GESPERRT · SCHUTZZEIT $1 S'],
  [/^Sprung nach (.+?) wird geladen/, 'SPRUNG NACH $1 · TOR LÄDT'],
  [/^Willkommen in (.+?) \((.+?)\)/, 'SEKTOR $2 · $1 · KURS FREI'],
  [/^Angedockt an (.+?)\.?$/, 'ANGEDOCKT · $1'],
  [/^Zu wenig (\S+) für diese Reparatur \(([\d.]+) nötig\)/, 'REPARATUR ABGELEHNT · $2 $1 NÖTIG'],
  [/^Schiff repariert \(kostenlos/, 'SCHIFF REPARIERT · KOSTENLOS · 5 S SCHUTZ'],
  [/^Schiff repariert für ([\d.]+) (\S+)\./, 'SCHIFF REPARIERT · −$1 $2 · 5 S SCHUTZ'],
  [/^([\d.]+) Erz verkauft: \+([\d.]+) Credits/, 'ERZ VERKAUFT · $1 E · +$2 CR'],
];
// Fächer für Trefferzahlen am selben Ziel (px seitlich / höher), Stufen nach Anteil am Gesamtleben des Ziels
const LANES_X = [0, 30, -30, 12, -12, 42, -42];
const LANES_Y = [0, -14, -14, -30, -30, -46, -46];
const TIER2 = 0.06, TIER3 = 0.15;
const FEED_MAX_H = 196;  // px, wie .hm-list max-height
const HIT_MERGE = 0.22;  // s: Treffer derselben Salve (Laser feuern ca. 133 ms versetzt) aufs selbe Ziel werden eine Zahl
const MAP_HZ = 15;
const EDGE_WARN = 320;   // Meter vor dem Kartenrand

// Schiff links neben der Schnellleiste nur, wenn daneben noch Funk und Karte Platz haben (sehr breite Schirme);
// sonst sitzt es mittig darüber. Beide bilden die Konsole unten mittig.
function shipBeside(ws, W) {
  const a = ws.get('quick'), s = ws.get('ship');
  if (!a || a.hidden || !a.w || !s || !s.w) return false;
  const c = ws.get('comms'), m = ws.get('map');
  const side = Math.max(c && !c.hidden ? c.w : 0, m && !m.hidden ? m.w : 0);
  return W / 2 - a.w / 2 - 8 - s.w >= 12 + side + 16;
}

// ---------- Fenster-Gerüst ----------
// stat: Statusanzeige rechts in der Kopfleiste; vstat: Status im Leerzustand (Fenster zeigt nur die Kopfleiste)
function win(id, code, title, body, { toggle = false, stat = '', vstat = '', cls = '' } = {}) {
  return `<section class="hw ls-panel ${cls}" data-win="${id}" aria-label="${title}">
  <span class="ls-corners"></span>
  <header class="ls-head hw-head">
    <span class="ls-code">${code}</span><span class="ls-title">${title}</span><span class="ls-spacer"></span>${stat}${vstat ? `<span class="hw-vstat">${vstat}</span>` : ''}
    <span class="hw-tools">${toggle ? '<button class="hw-btn hw-mode" type="button" data-wact="mode"><i class="hw-gl-bar"></i><i class="hw-gl-num">#</i></button>' : ''}<button class="hw-btn hw-min" type="button" data-wact="min">–</button><button class="hw-btn hw-x" type="button" data-wact="close" title="Ausblenden (über die Leiste oben wieder einblenden)" aria-label="${title} ausblenden"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2 L8 8 M8 2 L2 8"/></svg></button></span>
  </header>
  <div class="hw-body">${body}</div>
</section>`;
}

const W_NAV = win('nav', 'NAV·00', 'SEKTOR', `
  <div class="hn-row">
    <b class="hn-id" data-r="secid"></b><span class="hn-name" data-r="secname"></span>
    <span class="hn-sep"></span>
    <span class="ls-label">STUFE</span><span class="ls-num hn-lv" data-r="seclv"></span>
    <span class="hg-sp"></span>
    <span class="hn-state" data-r="state"><i></i><span data-r="statetext"></span></span>
  </div>`, { stat: '<span class="hw-stat ls-num" data-r="clock">00:00</span>' });

const W_PILOT = win('pilot', 'PIL·01', 'PILOT', `
  <div class="hp-top">
    <span class="hp-fx" data-r="faction"></span>
    <b class="hp-call" data-r="callsign"></b>
    <span class="hg-sp"></span>
    <span class="ls-label">ST</span><b class="ls-num hp-lv" data-r="level">1</b>
  </div>
  <div class="hg-gauge hp-xp" data-r="xp">
    <div class="hg-row"><span class="hp-rank" data-r="rank"></span><span class="hg-sp"></span><span class="hg-num num-only" data-r="xpnum"><b class="ls-num" data-g="v">0</b><i>/</i><span class="ls-num" data-g="m">0</span><i>EP</i></span><span class="hg-max num-only" data-r="xpmax">MAX</span></div>
    <div class="ls-bar"></div>
  </div>`, { toggle: true, cls: 'hw-quiet' });

const W_WALLET = win('wallet', 'FIN·02', 'KONTO', `
  <div class="hk-row hk-cr"><span class="ls-label">CREDITS</span><span class="hg-sp"></span><b class="ls-num hk-v" data-r="credits">0</b><span class="hk-u">CR</span></div>
  <div class="hk-pair">
    <div class="hk-row hk-tri"><span class="ls-label">TRITIUM</span><span class="hg-sp"></span><b class="ls-num hk-v" data-r="tritium">0</b></div>
    <div class="hk-row"><span class="ls-label">EHRE</span><span class="hg-sp"></span><b class="ls-num hk-v" data-r="honor">0</b><span class="hk-u">PKT</span></div>
  </div>`, { cls: 'hw-quiet' });

// Zentrales Instrumentenbrett: links Abwehr, Mitte Waffen, rechts Antrieb
const CS_GAUGE = (r, label, cls) => `<div class="cs-g ${cls}" data-r="${r}">
  <div class="cs-gh"><span class="ls-label">${label}</span><span class="hg-sp"></span><span class="cs-gv num-only"><b class="ls-num" data-g="v">0</b><i>/</i><span class="ls-num" data-g="m">0</span></span></div>
  <div class="ls-bar"></div><div class="ls-tick"></div>
</div>`;
const W_SHIP = win('ship', 'SYS·03', 'SCHIFF', `
  <div class="cs">
    <div class="cs-col cs-def">
      ${CS_GAUGE('hull', 'HÜLLE', 'is-hull')}
      ${CS_GAUGE('shield', 'SCHILD', 'is-shield')}
    </div>
    <div class="cs-col cs-drv">
      <div class="cs-gh"><span class="ls-label">TEMPO</span><span class="hg-sp"></span><span class="cs-gv num-only"><b class="ls-num" data-r="spd">0</b><i>/</i><span class="ls-num" data-r="spdmax">0</span><i>M/S</i></span></div>
      <div class="ls-bar is-thin" data-r="spdbar"></div><div class="ls-tick"></div>
      <div class="cs-gens" data-r="gens"></div>
    </div>
  </div>`, { toggle: true, stat: '<span class="hw-stat" data-r="shipname"></span>', cls: 'hw-console' });

// Schnellleiste: zehn frei belegbare Plätze (Tasten 1–0), vier Leisten; Laser und Feuerstatus in der Kopfleiste
const W_QUICK = win('quick', 'AKT·08', 'SCHNELLLEISTE', quickBody(), {
  toggle: true,
  stat: '<span class="hw-stat cs-las" data-r="wlas"></span><span class="cs-fire" data-r="wfire"><i></i><span data-r="wfiretext">BEREIT</span></span>',
  cls: 'hw-console hw-wpn hw-quick',
});

const W_TARGET = win('target', 'TGT·04', 'ZIEL', `
  <div class="ht-top">
    <span class="ht-class" data-r="tclass"></span>
    <b class="ht-name" data-r="tname"></b>
    <span class="hg-sp"></span>
    <span class="ht-dist"><b class="ls-num" data-r="tdist">0</b><span class="hk-u">M</span></span>
  </div>
  <div class="ht-sub"><span data-r="tbeh"></span><span class="hg-sp"></span><span class="ht-rng" data-r="trng"></span></div>
  ${gaugeHtml('thull', 'HÜLLE', 'ht-g')}
  ${gaugeHtml('tshield', 'SCHILD', 'ht-g is-shield')}
  <div class="ht-scale" aria-hidden="true">
    <div class="ls-tick"></div>
    <i class="ht-zone"></i><i class="ht-mark" data-r="tmark"></i><i class="ht-far"></i>
    <span class="ht-s0">0</span><span class="ht-s1">650</span><span class="ht-s2">1.300 M</span>
  </div>`, {
  toggle: true,
  stat: '<span class="hw-stat ht-atk"><i></i><span data-r="tatktext"></span></span>',
  vstat: 'KEIN ZIEL <span class="ls-key">TAB</span>',
  cls: 'is-void',
});

const W_QUEST = win('quest', 'MSN·05', 'MISSION', `
  <div class="hq-top"><b class="hq-title" data-r="qtitle"></b><span class="hg-sp"></span><span class="ls-num hq-prog" data-r="qprog"></span></div>
  <p class="hq-text num-only" data-r="qtext"></p>
  <div class="ls-bar hq-bar" data-r="qbar"></div>
  <div class="hq-reward num-only"><span class="ls-label">LOHN</span><span data-r="qreward"></span></div>`,
{ toggle: true, cls: 'hw-quiet is-void', vstat: 'KEIN AUFTRAG' });

const W_COMMS = win('comms', 'COM·06', 'FUNK', `<div class="hm-list" data-r="feed" aria-live="polite"></div>`,
  { stat: '<span class="hw-stat" data-r="chan"></span>', vstat: 'KEIN FUNKVERKEHR', cls: 'is-void' });

const W_MAP = win('map', 'NAV·07', 'KARTE', `
  <canvas class="hmap" data-r="map" aria-label="Minikarte, klicken zum Hinfliegen"></canvas>
  <div class="hmap-foot"><span class="hmap-leg"><i class="lg-st"></i>STATION<i class="lg-tor"></i>TOR<i class="lg-en"></i>FEIND<i class="lg-grp"></i>GRUPPE</span></div>`,
{ stat: '<span class="hw-stat ls-num" data-r="coords"></span>' });

// Linien-Symbole der Fensterleiste (16er Raster, 1,25 px Strich, eckig, keine Füllung)
const ICON = {
  pilot: '<path d="M5.5 2.5 H10.5 L11.5 4.5 V7 L10 8.5 H6 L4.5 7 V4.5 Z"/><path d="M4.5 5.5 H11.5"/><path d="M2.5 14 V12 L5 10 H11 L13.5 12 V14"/>',
  wallet: '<path d="M2.5 4.5 H13.5 V12 H2.5 Z"/><path d="M2.5 7 H13.5"/><path d="M5 9.5 H8"/><path d="M11 9.5 H11.5"/>',
  ship: '<path d="M8 1.8 L10.4 8 L13.8 12.6 L8 11 L2.2 12.6 L5.6 8 Z"/><path d="M8 5.5 V11"/><path d="M6.4 13.2 L8 14.4 L9.6 13.2"/>',
  target: '<path d="M2.5 5.5 V2.5 H5.5"/><path d="M10.5 2.5 H13.5 V5.5"/><path d="M13.5 10.5 V13.5 H10.5"/><path d="M5.5 13.5 H2.5 V10.5"/><path d="M7.25 7.25 H8.75 V8.75 H7.25 Z"/>',
  quest: '<path d="M4 14.5 V2"/><path d="M4 2.5 H12.5 L10.8 5.25 L12.5 8 H4"/>',
  comms: '<path d="M8 8.5 V14.5"/><path d="M6 14.5 H10"/><path d="M5.6 4.6 A3.4 3.4 0 0 0 5.6 9.4"/><path d="M10.4 4.6 A3.4 3.4 0 0 1 10.4 9.4"/><path d="M3.6 2.6 A6.2 6.2 0 0 0 3.6 11.4"/><path d="M12.4 2.6 A6.2 6.2 0 0 1 12.4 11.4"/><path d="M7.4 6.4 H8.6 V7.6 H7.4 Z"/>',
  map: '<path d="M2.5 2.5 H13.5 V13.5 H2.5 Z"/><path d="M8 2.5 V4 M8 12 V13.5 M2.5 8 H4 M12 8 H13.5"/><path d="M8 6 L10 10 L8 9 L6 10 Z"/>',
  weapons: '<path d="M3 13.5 V6.5 L4.5 4 L6 6.5 V13.5 Z"/><path d="M7 13.5 V6.5 L8.5 4 L10 6.5 V13.5 Z"/><path d="M11 13.5 V6.5 L12.5 4 L14 6.5 V13.5"/><path d="M2 13.5 H14.5"/>',
  nav: '<path d="M8 1.8 L13.4 4.9 V11.1 L8 14.2 L2.6 11.1 V4.9 Z"/><path d="M8 5 V11 M5.4 6.5 L10.6 9.5 M10.6 6.5 L5.4 9.5"/>',
  menu: '<path d="M3 4.5 H13"/><path d="M3 8 H13"/><path d="M3 11.5 H9.5"/>',
};
const svgIcon = (k) => `<svg class="hb-ic" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;

// Fenster in Leisten-Reihenfolge: id, Code, Titel. Kurztaste ist Shift + Position (1 bis 9).
const WIN_LIST = [
  ['pilot', 'PIL·01', 'PILOT'], ['wallet', 'FIN·02', 'KONTO'], ['ship', 'SYS·03', 'SCHIFF'],
  ['target', 'TGT·04', 'ZIEL'], ['quest', 'MSN·05', 'MISSION'], ['comms', 'COM·06', 'FUNK'],
  ['map', 'NAV·07', 'KARTE'], ['quick', 'AKT·08', 'SCHNELLLEISTE'], ['nav', 'NAV·00', 'SEKTOR'],
];
const WIN_BY_DIGIT = {};
WIN_LIST.forEach(([id], i) => { WIN_BY_DIGIT['Digit' + (i + 1)] = id; });

const BAR = `<nav class="hd-bar" data-r="bar" aria-label="Fensterleiste">
  <span class="hb-code" aria-hidden="true">HUD</span>
  ${WIN_LIST.map(([id, , title], i) => `<button class="hb-b" type="button" data-act="wintog" data-id="${id}" aria-label="${title} ein- oder ausblenden, Shift ${i + 1}" aria-pressed="true">${svgIcon(id === 'quick' ? 'weapons' : id)}<span class="hb-tip"><b>${title}</b><i class="hb-st"></i><span class="ls-key">⇧${i + 1}</span></span></button>`).join('')}
  <i class="hb-sep" aria-hidden="true"></i>
  <button class="hb-b hb-menu" type="button" data-act="menu" aria-label="Bordmenü, Escape" aria-pressed="false">${svgIcon('menu')}<span class="hb-tip"><b>MENÜ</b><span class="ls-key">ESC</span></span></button>
</nav>`;

const TEMPLATE = `
<div class="hd-layer" data-r="layer">
${W_NAV}${W_PILOT}${W_WALLET}${W_SHIP}${W_QUICK}${W_TARGET}${W_QUEST}${W_COMMS}${W_MAP}
</div>
${BAR}
<div class="hd-mid" data-r="mid"></div>

<div class="hd-prompts" data-r="prompts">
  <div class="hx hx-warn hd-hide" data-r="hazard"><span class="hx-code">WARN</span><span data-r="hazardtext"></span></div>
  <button class="hx hd-hide" type="button" data-act="jump" data-r="hjump"><span class="ls-key">J</span><span class="hx-t">SPRINGEN</span><span class="hx-s" data-r="hjumptext"></span></button>
  <button class="hx hd-hide" type="button" data-act="dock" data-r="hdock"><span class="ls-key">E</span><span class="hx-t">ANDOCKEN</span><span class="hx-s" data-r="hdocktext"></span></button>
  <div class="hx hx-jump hd-hide" data-r="jumpbox">
    <span class="hx-code">SPRUNG</span><span class="hx-s" data-r="jumpto"></span><span class="hg-sp"></span><b class="ls-num" data-r="jumppct">0</b><span class="hk-u">%</span>
    <div class="ls-bar is-shield hx-bar" data-r="jumpbar"></div>
  </div>
</div>

<div class="hd-floats" data-r="floats" aria-hidden="true"></div>

<div class="hd-banner ls-panel" data-r="toast" aria-live="polite">
  <span class="ls-corners"></span>
  <div class="hb-cap ls-label" data-r="toastcap"></div>
  <div class="hb-main" data-r="toastmain"></div>
  <div class="hb-sub" data-r="toastsub"></div>
</div>
<div class="hd-lootline" data-r="loot" aria-live="polite"></div>

<div class="hd-danger" aria-hidden="true"><i></i><i></i><i></i><i></i></div>

<div class="hd-modal hd-modal-dead" data-r="dead" role="dialog" aria-modal="true" aria-label="Schiff zerstört">
  <div class="hd-dlg ls-panel dd">
    <span class="ls-corners"></span>
    <header class="ls-head"><span class="ls-code">SYS·ERR</span><span class="ls-title">SCHIFF ZERSTÖRT</span><span class="ls-spacer"></span><span class="ls-num dd-clock" data-r="deadclock"></span></header>
    <div class="dd-body">
      <div class="dd-alert"><i></i><span>HÜLLE 0 %</span><span class="hg-sp"></span><span data-r="deadsec"></span></div>
      <div class="dd-big">Verbindung zum Schiff verloren</div>
      <p class="dd-sub" data-r="deadtext"></p>
      <div class="dd-opts">
        <button class="dd-opt" type="button" data-act="repair" data-where="station"><span class="dd-oh"><span class="ls-key">1</span><span class="ls-code">REP·A</span></span><b>STATION</b><small>Werft der Heimatstation</small><span class="dd-cost ls-num" data-r="rc-station"></span></button>
        <button class="dd-opt" type="button" data-act="repair" data-where="portal"><span class="dd-oh"><span class="ls-key">2</span><span class="ls-code">REP·B</span></span><b>SPRUNGTOR</b><small>Nächstes Tor im Sektor</small><span class="dd-cost ls-num" data-r="rc-portal"></span></button>
        <button class="dd-opt" type="button" data-act="repair" data-where="here"><span class="dd-oh"><span class="ls-key">3</span><span class="ls-code">REP·C</span></span><b>VOR ORT</b><small>Notreparatur an dieser Position</small><span class="dd-cost ls-num" data-r="rc-here"></span></button>
      </div>
      <div class="dd-foot"><span class="ls-label">VERLUSTE</span><b class="ls-num" data-r="deaths">0</b><span class="ls-label">ABSCHÜSSE</span><b class="ls-num" data-r="kills">0</b><span class="hg-sp"></span><span class="ls-label">FLUGZEIT</span><b class="ls-num" data-r="ftime">0</b></div>
    </div>
  </div>
</div>
${menuHtml(WIN_LIST)}`;

export class Hud {
  constructor(root, bus, world) {
    this.root = root;
    this.bus = bus;
    this.world = null;
    this.renderer = null;
    this._t = 0;
    this._mapAcc = 1;
    this._menuOpen = false;
    this._deadShown = false;
    this._mark = null;

    const el = document.createElement('div');
    el.className = 'hd hd-boot'; // bis zum ersten echten Datensatz verborgen, keine Rohwerte 0 / 0
    this._boot = true;
    el.innerHTML = TEMPLATE;
    root.appendChild(el);
    this.el = el;
    const q = (r) => el.querySelector(`[data-r="${r}"]`);
    this.$ = q;

    // Fenster
    const layer = q('layer');
    const W = (id) => layer.querySelector(`[data-win="${id}"]`);
    this.wins = new HudWindows(layer, [
      // Zonen: Konsole unten mittig (Schnellleiste, darüber das Schiff; auf sehr breiten Schirmen links daneben),
      // Ziel und Mission oben rechts, Karte unten rechts, Funk unten links, Pilot und Konto oben links (leise)
      { id: 'quick', el: W('quick'), ax: 'c', ay: 'b', oy: 12, toggle: true },
      { id: 'ship', el: W('ship'), ax: 'c', ay: 'b', ox: (ws, W) => shipBeside(ws, W) ? -Math.round(ws.get('quick').w / 2 + 8 + ws.get('ship').w / 2) : 0, oy: (ws, W) => { const a = ws.get('quick'); return a && !a.hidden && a.h && !shipBeside(ws, W) ? 12 + a.h + 8 : 12; }, toggle: true },
      { id: 'target', el: W('target'), ax: 'r', ay: 't', ox: 12, oy: 12, toggle: true },
      { id: 'quest', el: W('quest'), ax: 'r', ay: 't', ox: 12, after: 'target', toggle: true },
      { id: 'map', el: W('map'), ax: 'r', ay: 'b', ox: 12, oy: 12 },
      { id: 'nav', el: W('nav'), ax: 'c', ay: 't', ox: 0, oy: 12 },
      { id: 'pilot', el: W('pilot'), ax: 'l', ay: 't', ox: 12, oy: 12, toggle: true, mode: 'num' },
      { id: 'wallet', el: W('wallet'), ax: 'l', ay: 't', ox: 12, after: 'pilot' },
      { id: 'comms', el: W('comms'), ax: 'l', ay: 'b', ox: 12, oy: 12 },
    ], (id) => this._onWinChange(id), q('bar'));
    this.barBtns = el.querySelectorAll('.hb-b[data-act="wintog"]');
    this.barMenu = el.querySelector('.hb-menu');
    this.wTarget = W('target');
    this.wins.setVoid('target', true);
    this.wins.setVoid('quest', true);

    // Sektor
    this.sSecId = new TextSlot(q('secid'));
    this.sSecName = new TextSlot(q('secname'));
    this.sSecLv = new TextSlot(q('seclv'));
    this.sState = new TextSlot(q('statetext'));
    this.sStateCls = q('state');
    this._stateKey = '';
    this.sClock = new TextSlot(q('clock'));
    this._clockS = -1;

    // Pilot
    this.sFaction = new TextSlot(q('faction'));
    this.sCallsign = new TextSlot(q('callsign'));
    this.sRank = new TextSlot(q('rank'));
    this.sLevel = new TextSlot(q('level'));
    this.gXp = new Gauge(q('xp'));
    this.sXpMax = new ClassSlot(W('pilot'), 'is-maxlv');
    this._accent = '';

    // Konto
    this.mid = new HudMid(q('mid'));
    this.sMenuCls = new ClassSlot(el, 'hd-menu');
    this.sTFlash = new ClassSlot(W('target'), 'is-flash');
    this._tFlash = 0;
    this.cCredits = new Counter(q('credits'), fmt, 9);
    this.cTritium = new Counter(q('tritium'), fmt, 9);
    this.cHonor = new Counter(q('honor'), fmt, 9);

    // Schiff
    this.gHull = new Gauge(q('hull'));
    this.gShield = new Gauge(q('shield'));
    this.sHullDanger = new ClassSlot(q('hull'), 'is-danger');
    this.sShipName = new TextSlot(q('shipname'));
    this.gensEl = q('gens');
    this.gens = [];
    this._gensKey = '';
    this.cSpd = new Counter(q('spd'), fmt, 18);
    this.sSpdMax = new TextSlot(q('spdmax'));
    this.bSpd = new Bar(q('spdbar'));
    this.sLowHp = new ClassSlot(el, 'hd-lowhp');

    // Ziel
    this.sTargetOn = new ClassSlot(W('target'), 'has-target');
    this._voidT = true; this._voidQ = true; this._voidC = true;
    this.sTargetEnemy = new ClassSlot(W('target'), 'is-enemy');
    this.sTargetAtk = new ClassSlot(W('target'), 'is-atk');
    this.sTargetNoSh = new ClassSlot(W('target'), 'no-shield');
    this.sTClass = new TextSlot(q('tclass'));
    this.sTName = new TextSlot(q('tname'));
    this.sTBeh = new TextSlot(q('tbeh'));
    this.sTRng = new TextSlot(q('trng'));
    this.sTInRange = new ClassSlot(W('target'), 'in-range');
    this.cTDist = new Counter(q('tdist'), fmt, 20);
    this.gTHull = new Gauge(q('thull'));
    this.gTShield = new Gauge(q('tshield'));
    this.tMark = q('tmark');
    this._tMarkQ = -1;
    this.sTFar = new ClassSlot(W('target'), 'is-far');
    this.sTAtkText = new TextSlot(q('tatktext'));
    this._tId = null;

    // Mission
    this.sQuestOn = new ClassSlot(W('quest'), 'has-quest');
    this.sQTitle = new TextSlot(q('qtitle'));
    this.sQText = new TextSlot(q('qtext'));
    this.sQProg = new TextSlot(q('qprog'));
    this.sQReward = new TextSlot(q('qreward'));
    this.bQuest = new Bar(q('qbar'), 200);
    this.qBarEl = q('qbar');
    this._qDef = null; this._qProg = -1; this._qCount = -1;

    // Hinweise
    this.sHaz = new ClassSlot(q('hazard'), 'hd-hide');
    this.sHazText = new TextSlot(q('hazardtext'));
    this.sHJump = new ClassSlot(q('hjump'), 'hd-hide');
    this.sHJumpText = new TextSlot(q('hjumptext'));
    this.sHDock = new ClassSlot(q('hdock'), 'hd-hide');
    this.sHDockText = new TextSlot(q('hdocktext'));
    this.sJumpBox = new ClassSlot(q('jumpbox'), 'hd-hide');
    this.sJumpTo = new TextSlot(q('jumpto'));
    this.bJump = new Bar(q('jumpbar'));
    this.cJumpPct = new Counter(q('jumppct'), fmt, 30);
    this._jPortal = null;

    // Zustände am Wurzelelement
    this.sDocked = new ClassSlot(el, 'hd-docked');
    this.sDeadCls = new ClassSlot(el, 'hd-dead');

    // Schnellleiste (Tasten 1–0 in der Capture-Phase vor input.js) und Kampf-Lesbarkeit
    this.bar = new HudBar(this, W('quick'), el);
    this.combat = new HudCombat(q('mid'));
    this._zoneAcc = 1;
    this._promptB = NaN; this._comboY = NaN;
    this.sWLas = new TextSlot(q('wlas'));
    this._lasKey = '';
    this.sWFire = new ClassSlot(q('wfire'), 'on');
    this.sWFireText = new TextSlot(q('wfiretext'));
    this.sWFireLock = new ClassSlot(q('wfire'), 'is-lock');

    // Minikarte
    this.map = q('map');
    this.mapView = new HudMap(this.map);
    this._mapPt = { x: 0, z: 0 };
    this.sCoords = new TextSlot(q('coords'));

    // Funk
    this.feed = q('feed');
    this.msgs = [];
    this.msgFree = [];
    this.sChan = new TextSlot(q('chan'));
    this._voidC = true;
    this.wins.setVoid('comms', true);

    // Schwebende Zahlen
    const floats = q('floats');
    this._scr = { x: 0, y: 0, visible: false };
    this.floats = [];
    for (let i = 0; i < FLOAT_POOL; i++) {
      const n = document.createElement('span');
      n.className = 'hf';
      n.innerHTML = '<small></small><b></b>';
      floats.appendChild(n);
      this.floats.push({ el: n, tag: n.firstChild, val: n.lastChild, on: false, age: 0, life: 1, x: 0, z: 0, id: null, jx: 0, jy: 0, rise: 0, big: false, tx: NaN, ty: NaN, ts: NaN, op: -1, kind: '', sum: 0, tier: 1 });
    }

    // Einblendungen
    this.lootEl = q('loot');
    this._lootT = 0;
    this._lootAcc = { credits: 0, tritium: 0, xp: 0, honor: 0, extra: new Map() };
    this.toastEl = q('toast');
    this.toastCap = q('toastcap');
    this.toastMain = q('toastmain');
    this.toastSub = q('toastsub');
    this._toastT = 0;
    this._toastQueue = [];
    this._toastNext = null;

    // Modale Fenster
    this.deadEl = q('dead');
    this.menuEl = q('menu');
    this.menu = new HudMenu(this.menuEl, this.wins, el);
    this._menuInfo = { clock: '', pos: '', state: '', hostiles: 0, quest: '', kills: '', deaths: '', ftime: '', rank: '', store: '' };
    this._syncLockBtn();

    // Eingaben auf dem HUD nicht an das Spiel durchreichen
    this._stop = (e) => { e.stopPropagation(); };
    this._noFocus = (e) => { if (e.target.closest('button,[data-act],[data-wact]')) e.preventDefault(); };
    for (const t of ['pointerdown', 'click', 'dblclick', 'contextmenu', 'wheel']) el.addEventListener(t, this._stop, t === 'wheel' ? { passive: true } : false);
    el.addEventListener('mousedown', this._noFocus);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);

    this._onMapDown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this._mapDrag = true;
      try { this.map.setPointerCapture(e.pointerId); } catch { /* egal */ }
      this._mapMove(e);
    };
    this._onMapMove = (e) => { if (this._mapDrag) this._mapMove(e); };
    this._onMapUp = () => { this._mapDrag = false; };
    this.map.addEventListener('pointerdown', this._onMapDown);
    this.map.addEventListener('pointermove', this._onMapMove);
    this.map.addEventListener('pointerup', this._onMapUp);
    this.map.addEventListener('pointercancel', this._onMapUp);

    this._onKey = (e) => {
      if (e.repeat) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (this._deadShown) {
        const where = e.code === 'Digit1' ? 'station' : e.code === 'Digit2' ? 'portal' : e.code === 'Digit3' ? 'here' : null;
        if (where) this._repair(where);
        return;
      }
      if (e.key !== 'Escape') return;
      if (this.world && this.world.docked) return;
      this.toggleMenu();
    };
    window.addEventListener('keydown', this._onKey);
    // Shift+1 bis Shift+9: Fenster ein/aus. Läuft in der Capture-Phase vor der Spielsteuerung (input.js),
    // damit Shift+Zahl nicht zusätzlich die Munition wechselt. Ohne Shift bleibt alles beim Spiel.
    this._onWinKey = (e) => {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const id = WIN_BY_DIGIT[e.code];
      if (!id) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!this.world || this.world.docked || this.world.playerDead) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.wins.toggleHidden(id);
    };
    window.addEventListener('keydown', this._onWinKey, true);
    this._onResize = () => this._sizeMap();
    window.addEventListener('resize', this._onResize);

    // Ereignisse der Simulation
    this._offs = [
      bus.on('damage', (p) => { this._onDamage(p); this.combat.onDamage(this.world, p); }),
      bus.on('explode', (p) => this.combat.onExplode(this.world, p)),
      bus.on('combo', (p) => this.combat.onCombo(p)),
      bus.on('telegraph', (p) => this.combat.onTelegraph(this.world, p)),
      bus.on('special', (p) => this.combat.onSpecial(p)),
      bus.on('shot', (p) => this._onShot(p)),
      bus.on('loot', (p) => this._onLoot(p)),
      bus.on('levelup', (p) => this._onLevel(p)),
      bus.on('message', (p) => this._pushMsg(p)),
      bus.on('quest', (p) => this._onQuest(p)),
      bus.on('playerDead', () => this._showDead(true)),
      bus.on('respawn', () => this._showDead(false)),
      bus.on('heal', (p) => {
        // Heilzahlen (VMP, FIX, RSV) am eigenen Schiff
        if (!p) return;
        if (p.hull > 0) this._spawnFloat('+' + fmt(p.hull), 'HÜLLE', 'hf-heal', p.x, p.z, 'player', 1.1, false);
        if (p.shield > 0) this._spawnFloat('+' + fmt(p.shield), 'SCHILD', 'hf-heal hf-heal-sh', p.x, p.z, 'player', 1.1, false);
      }),
      bus.on('trap', (p) => { if (p) this._spawnFloat('FALLE', 'PIRATEN', 'hf-warn', p.x, p.z, null, 1.8, true, 'loot'); }),
      bus.on('docked', () => { if (this._menuOpen) this.toggleMenu(false); }),
      bus.on('undocked', () => { requestAnimationFrame(() => { this.wins.layout(); this._sizeMap(); }); }),
    ];

    this._sizeMap();
    this.wins.layout();
    this._syncBar();
    if (world) this.setWorld(world);
    if (import.meta.env && import.meta.env.DEV) window.__lsHud = this; // nur Entwicklung: Prüfzugriff
  }

  // ---------- öffentliche API ----------
  setWorld(world) {
    this.world = world || null;
    for (const f of this.floats) this._hideFloat(f);
    this._mark = null;
    this._secObj = null; this._hazSec = null; this._jPortal = null;
    this._qDef = null; this._qProg = -1;
    this._tId = null;
    this._gensKey = ''; this._lasKey = '';
    this._mapAcc = 1;
    this.gHull.reset(); this.gShield.reset();
    this.mid.reset();
    if (this.combat) this.combat.reset();
    if (world && !!world.playerDead !== this._deadShown) this._showDead(!!world.playerDead);
  }

  setRenderer(renderer) { this.renderer = renderer || null; }

  toggleMenu(force) {
    const open = force === undefined ? !this._menuOpen : !!force;
    if (open === this._menuOpen) return;
    this._menuOpen = open;
    this.menuEl.classList.toggle('show', open);
    this.sMenuCls.set(open);
    if (open) { this.menu.syncWins(); this.menu._acc = 1; }
    this.barMenu.classList.toggle('on', open);
    this.barMenu.setAttribute('aria-pressed', open ? 'true' : 'false');
  }

  update(dt) {
    const w = this.world;
    if (!w) return;
    dt = dt > 0.25 ? 0.25 : dt > 0 ? dt : 0;
    this._t += dt;
    const p = w.profile;
    const pl = w.player;

    this.sDocked.set(w.docked);
    if (!!w.playerDead !== this._deadShown) this._showDead(!!w.playerDead);
    this._updateFeed(dt);
    this._updateFloats(dt);
    this._updateToasts(dt);
    if (w.docked) return; // Station deckt alles ab, Flug-HUD ruht
    if (this._menuOpen) this._updateMenu(w, dt);

    if (p) this._updateProfile(p, dt);
    this._updateSector(w, pl, p);
    if (pl) this._updateShip(w, pl, p, dt);
    if (p) this._updateWeapons(w, p, pl, dt);
    this._updateHints(w, dt);
    this._updateTarget(w, pl, dt);
    this._updateQuest(w, dt);
    this.mid.update(w, this.renderer, dt, !!w.playerDead, this.wins.occluders);
    this._zoneAcc += dt;
    if (this._zoneAcc >= 0.2) { this._zoneAcc = 0; this._updateZones(); }
    this.combat.update(w, this.renderer, dt, !!w.playerDead || this._menuOpen, this.wins.occluders, this._comboY);

    this._mapAcc += dt;
    if (this._mapAcc >= 1 / MAP_HZ) {
      this._mapAcc = 0;
      this._drawMap(w);
    }
    if (this._boot && p && pl && w.sector) {
      this._boot = false;
      this.el.classList.remove('hd-boot');
      this.wins.layout();
    }
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.wins.dispose();
    this.bar.dispose();
    this.combat.dispose();
    this.mid.dispose();
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keydown', this._onWinKey, true);
    window.removeEventListener('resize', this._onResize);
    this.el.remove();
    if (window.__lsHud === this) window.__lsHud = null;
    this.world = null;
    this.renderer = null;
  }

  // ---------- Aufbau ----------
  _sizeMap() {
    if (this.mapView.size()) this._mapAcc = 1;
  }

  _onWinChange(id) {
    if (id === 'map') requestAnimationFrame(() => this._sizeMap());
    if (id === 'comms') requestAnimationFrame(() => this._trimFeed());
    if (this._menuOpen) this.menu.syncWins();
    this._syncBar();
  }

  _syncBar() {
    for (const b of this.barBtns) {
      const on = !this.wins.isHidden(b.dataset.id);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  _syncLockBtn() {
    const b = this.$('lockbtn');
    const on = this.wins.locked;
    b.textContent = on ? 'LAYOUT GESPERRT' : 'LAYOUT SPERREN';
    b.classList.toggle('is-on', on);
  }

  // ---------- Klicks ----------
  _click(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const w = this.world;
    switch (t.dataset.act) {
      case 'jump': if (w && w.tryJump) w.tryJump(); break;
      case 'dock': if (w && w.dock) w.dock(); break;
      case 'repair': this._repair(t.dataset.where); break;
      case 'resume': this.toggleMenu(false); break;
      case 'lock': this.wins.setLocked(!this.wins.locked); this._syncLockBtn(); break;
      case 'reset': this.wins.reset(); this._syncLockBtn(); this._syncBar(); this.menu.syncWins(); requestAnimationFrame(() => this._sizeMap()); break;
      case 'wintog': this.wins.toggleHidden(t.dataset.id); break;
      case 'menu': this.toggleMenu(); break;
      case 'allbar': this.wins.setAllModes(false); break;
      case 'allnum': this.wins.setAllModes(true); break;
      case 'hub': this.toggleMenu(false); this.bus.emit('toHub', {}); break;
      case 'tab': this.menu.setTab(t.dataset.tab); break;
      case 'winvis': this.wins.toggleHidden(t.dataset.id); this.menu.syncWins(); break;
      case 'calm': this.menu.setCalm(!this.menu.calm); break;
      case 'save':
        if (w && w.save) { w.save(); this._saved = this._t; this.menu._acc = 1; }
        break;
      default: break;
    }
  }

  _repair(where) {
    const w = this.world;
    if (!w || !this._deadShown) return;
    const btn = this.deadEl.querySelector(`[data-where="${where}"]`);
    if (btn && btn.disabled) return;
    const res = w.repair && w.repair(where);
    if (res === false) this._pushMsg({ text: 'Reparatur nicht möglich.', kind: 'warn' });
  }

  _mapMove(e) {
    const w = this.world;
    if (!w || !w.sector || w.playerDead) return;
    const pt = this.mapView.toWorld(e.clientX, e.clientY, w.sector.size, this._mapPt);
    const cx = pt.x, cz = pt.z;
    if (w.moveTo) w.moveTo(cx, cz);
    if (!this._mark) this._mark = { x: 0, z: 0, t: 0 };
    this._mark.x = cx; this._mark.z = cz; this._mark.t = this._t;
    this._mapAcc = 1;
  }

  // ---------- Teil-Updates ----------
  _updateProfile(p, dt) {
    const f = FACTIONS[p.faction];
    if (f) {
      this.sFaction.set(f.name);
      if (this._accent !== p.faction) {
        this._accent = p.faction;
        const c = factionAccent(p.faction);
        this.el.style.setProperty('--fx', c);
        this._accentColor = c;
        this.sChan.set('KANAL ' + f.prefix);
      }
    }
    this.sCallsign.set(p.callsign || '');
    const lvl = p.level || 1;
    this.sLevel.set(String(lvl));
    this.sRank.set(rankFor(lvl));
    const xp = p.xp || 0;
    if (lvl >= MAX_LEVEL) { this.sXpMax.set(true); this.gXp.set(1, 1, dt); }
    else {
      this.sXpMax.set(false);
      const a = xpForLevel(lvl), b = xpForLevel(lvl + 1);
      this.gXp.set(xp - a, b - a, dt);
    }
    this.cCredits.set(p.credits, dt);
    this.cTritium.set(p.tritium, dt);
    this.cHonor.set(p.honor, dt);
  }

  _updateSector(w, pl, p) {
    const s = w.sector;
    if (s && s !== this._secObj) {
      this._secObj = s;
      this.sSecId.set(s.id);
      this.sSecName.set((s.name || '').toUpperCase());
      this.sSecLv.set(s.levelMin + '–' + s.levelMax);
    }
    const sec = Math.floor(w.time || 0);
    if (sec !== this._clockS) { this._clockS = sec; this.sClock.set('T+' + clock(sec)); }
    let st = 'open';
    if (w.inSafeZone) st = 'safe';
    else if (w.inCombat) st = 'combat';
    if (st !== this._stateKey) {
      this._stateKey = st;
      this.sStateCls.className = 'hn-state is-' + st;
      this.sState.set(st === 'safe' ? 'SICHERE ZONE' : st === 'combat' ? 'IM KAMPF' : 'OFFENER RAUM');
    }

    let haz = false;
    if (s && pl) {
      const m = Math.max(Math.abs(pl.x), Math.abs(pl.z));
      haz = m > s.size - EDGE_WARN;
      if (haz && this._hazSec !== s) {
        this._hazSec = s;
        const bd = BACKDROPS[p && p.faction];
        this.sHazText.set('SEKTORRAND' + (bd ? ' · ' + bd.hazard.toUpperCase() : '') + ' · UMKEHREN');
      }
    }
    this.sHaz.set(!haz);
  }

  _updateShip(w, pl, p, dt) {
    const hpMax = pl.hpMax || 1;
    const hp = Math.max(0, pl.hp || 0);
    this.gHull.set(hp, hpMax, dt);
    const shMax = pl.shieldMax || 0;
    const sh = Math.max(0, pl.shield || 0);
    this.gShield.set(sh, shMax, dt);
    const low = pl.alive !== false && hp / hpMax < 0.3;
    this.sHullDanger.set(low);
    this.sLowHp.set(low);

    const ship = SHIPS[p && p.ship] || SHIPS.s1;
    this.sShipName.set(ship.name.toUpperCase() + ' · NR ' + ship.no);

    // Generatoren einzeln (Liste nur bei Ausrüstungswechsel neu bauen)
    const gens = p && p.loadout && p.loadout.gens;
    const key = gens ? gens.join(',') : '';
    if (key !== this._gensKey) this._buildGens(gens || []);
    const vmax = w.playerSpeed || ship.speed;
    const spd = Math.hypot(pl.vx || 0, pl.vz || 0);
    const shFrac = shMax ? sh / shMax : 0;
    const thrust = vmax ? spd / vmax : 0;
    for (let i = 0; i < this.gens.length; i++) {
      const g = this.gens[i];
      // Schild-Generator: Ladestand des Schilds; Antrieb: Leistung liegt voll an
      g.bar.set(g.kind === 'shield' ? shFrac : 1, dt);
    }
    this.cSpd.set(spd, dt);
    this.sSpdMax.set(fmt(vmax));
    this.bSpd.set(thrust, dt);
  }

  _buildGens(gens) {
    this._gensKey = gens.join(',');
    this.gens.length = 0;
    let html = '';
    for (let i = 0; i < gens.length; i++) {
      const d = GENERATORS[gens[i]];
      if (!d) continue;
      const sh = d.kind === 'shield';
      const model = String(d.name || '').split('-').pop();
      html += `<div class="hs-gen ${sh ? 'is-sh' : 'is-dr'}" data-i="${i}">
        <span class="hs-gtag">${sh ? 'SH' : 'DR'}<b>${esc(model)}</b></span>
        <div class="ls-bar"></div>
        <span class="hs-gv ls-num num-only">+${fmt(d.value)}${sh ? '' : ' M/S'}</span>
      </div>`;
    }
    if (!html) html = '<div class="hs-gen is-none"><span class="hs-gtag">–</span><span class="hs-gname">KEIN GENERATOR</span></div>';
    this.gensEl.classList.toggle('is-many', gens.length > 2);
    this.gensEl.innerHTML = html;
    const rows = this.gensEl.querySelectorAll('.hs-gen[data-i]');
    for (const r of rows) {
      const d = GENERATORS[gens[+r.dataset.i]];
      this.gens.push({ kind: d.kind === 'shield' ? 'shield' : 'speed', value: d.value, bar: new Bar(r.querySelector('.ls-bar')) });
    }
    this.wins.refit('ship');
  }

  _updateWeapons(w, p, pl, dt) {
    this.bar.update(w, p, dt, this.wins.isNum('quick'));
    const las = p.loadout && p.loadout.lasers;
    const lk = las ? las.join(',') : '';
    if (lk !== this._lasKey) {
      this._lasKey = lk;
      const count = new Map();
      if (las) for (const l of las) count.set(l, (count.get(l) || 0) + 1);
      const parts = [];
      for (const [id, n] of count) parts.push(n + '× ' + ((LASERS[id] && LASERS[id].name) || id).replace(' Laser', '').toUpperCase());
      this.sWLas.set(parts.length ? parts.join(' · ') : 'KEIN LASER');
    }
    const firing = !!(pl && pl.attacking && pl.alive !== false);
    const locked = !firing && !!w.inSafeZone;
    this.sWFire.set(firing);
    this.sWFireLock.set(locked);
    this.sWFireText.set(firing ? 'FEUER' : locked ? 'GESPERRT' : 'BEREIT');
  }

  // Hinweise und Beutezeile sitzen über der Konsole (Schiff + Schnellleiste), Serie unter der Sektor-Anzeige.
  // Alle 0,2 s aus den Fensterlagen, schreibt nur bei Änderung.
  _updateZones() {
    const W = window.innerWidth, H = window.innerHeight, cx = W / 2;
    let top = H;
    for (const id of ['quick', 'ship']) {
      const o = this.wins.get(id);
      if (o && !o.hidden && o.placed && o.w && o.x < cx + 40 && o.x + o.w > cx - 40 && o.y > H * 0.45) top = Math.min(top, o.y);
    }
    const pb = top < H ? Math.round(H - top + 14) : 24;
    if (pb !== this._promptB) {
      this._promptB = pb;
      this.$('prompts').style.bottom = pb + 'px';
      this.lootEl.style.bottom = (pb + 44) + 'px';
    }
    const nav = this.wins.get('nav');
    let y = 48;
    if (nav && !nav.hidden && nav.placed && nav.h && nav.y < H * 0.3 && nav.x < cx && nav.x + nav.w > cx) y = nav.y + nav.h + 10;
    else { const b = this.wins.barBox; if (b && b.placed) y = b.y + b.h + 10; }
    this._comboY = y;
  }

  _updateHints(w, dt) {
    const dead = !!w.playerDead;
    const jump = w.jump;
    const portal = w.nearPortal;
    this.sHJump.set(!(portal && !jump && !dead));
    if (portal && portal !== this._jPortal) {
      this._jPortal = portal;
      const to = w.sectors && w.sectors[portal.type];
      const label = portal.type ? portal.type + (to && to.name ? ' ' + to.name.toUpperCase() : '') : '';
      this.sHJumpText.set(label);
      this.sJumpTo.set(label);
    }
    const st = w.sector && w.sector.station;
    this.sHDock.set(!(w.inSafeZone && !dead && !jump && st));
    if (st) this.sHDockText.set((st.name || '').toUpperCase());
    this.sJumpBox.set(!jump);
    if (jump) {
      const pr = clamp01(jump.progress || 0);
      this.bJump.set(pr, dt);
      this.cJumpPct.set(pr * 100, dt);
    }
  }

  _updateTarget(w, pl, dt) {
    const id = pl && pl.targetId;
    const e = id != null && w.entities ? w.entities.get(id) : null;
    if (!e || e.alive === false) {
      this.sTargetOn.set(false);
      this.sTargetAtk.set(false);
      this.sTAtkText.set('');
      this._tId = null;
      if (this._voidT !== true) { this._voidT = true; this.wins.setVoid('target', true); }
      return;
    }
    this.sTargetOn.set(true);
    if (this._voidT !== false) { this._voidT = false; this.wins.setVoid('target', false); }
    if (id !== this._tId) {
      this._tId = id;
      this.gTHull.reset(); this.gTShield.reset(); this.cTDist.snap();
      const def = e.kind === 'enemy' ? ENEMIES[e.type] : null;
      this.sTargetEnemy.set(!!def);
      this.sTClass.set(def ? (GROUP_CLASS[def.group] || 'FEIND') : (KIND_CLASS[e.kind] || 'OBJEKT'));
      this.sTName.set(e.name || (def && def.name) || KIND_CLASS[e.kind] || 'Unbekannt');
      this.sTBeh.set(def ? (BEHAVIOR[def.behavior] || '') + (def.pack ? ' · RUDEL' : ' · EINZELN') : '');
    }
    const atk = !!(pl.attacking && pl.targetId === id);
    this.sTargetAtk.set(atk);
    this.sTAtkText.set(atk ? 'ANGRIFF' : 'ERFASST');
    const dist = Math.hypot(e.x - pl.x, e.z - pl.z);
    this.cTDist.set(dist, dt);
    const inR = dist <= PLAYER_RANGE;
    this.sTInRange.set(inR);
    this.sTRng.set(inR ? 'IN REICHWEITE' : 'AUSSER REICHWEITE');
    const far = dist > PLAYER_RANGE * 2;
    this.sTFar.set(far);
    const mq = Math.round(clamp01(dist / (PLAYER_RANGE * 2)) * 200);
    if (mq !== this._tMarkQ) { this._tMarkQ = mq; this.tMark.style.left = (mq / 2) + '%'; }
    if (this._tFlash > 0) { this._tFlash -= dt; if (this._tFlash <= 0) this.sTFlash.set(false); }
    this.gTHull.set(e.hp || 0, e.hpMax || 0, dt);
    const shMax = e.shieldMax || 0;
    this.sTargetNoSh.set(!shMax);
    if (shMax) this.gTShield.set(e.shield || 0, shMax, dt);
  }

  _updateQuest(w, dt) {
    const q = w.quest;
    if (!q || !q.def) {
      this.sQuestOn.set(false); this._qDef = null;
      if (this._voidQ !== true) { this._voidQ = true; this.wins.setVoid('quest', true); }
      return;
    }
    this.sQuestOn.set(true);
    if (this._voidQ !== false) { this._voidQ = false; this.wins.setVoid('quest', false); }
    const goal = q.def.goal || {};
    const count = goal.count || 1;
    const prog = Math.min(count, q.progress || 0);
    if (q.def !== this._qDef || prog !== this._qProg) {
      const fresh = q.def !== this._qDef;
      this._qDef = q.def; this._qProg = prog;
      this.sQTitle.set((q.def.title || '').toUpperCase());
      this.sQText.set(questText(q.def, w.profile && w.profile.faction));
      this.sQProg.set(fmt(prog) + ' / ' + fmt(count));
      if (count !== this._qCount) {
        this._qCount = count;
        this.qBarEl.style.setProperty('--seg', count <= 24 ? 'calc(100% / ' + count + ' + 0.01px)' : '5px');
      }
      if (fresh) {
        const r = q.def.reward || {};
        const parts = [];
        if (r.credits) parts.push(fmt(r.credits) + ' CR');
        if (r.tritium) parts.push(fmt(r.tritium) + ' T');
        if (r.xp) parts.push(fmt(r.xp) + ' EP');
        if (r.honor) parts.push(fmt(r.honor) + ' EHRE');
        this.sQReward.set(parts.join(' · '));
        this.bQuest.reset();
        requestAnimationFrame(() => this.wins.refit('quest'));
      }
    }
    this.bQuest.set(prog / count, dt);
  }

  // ---------- Funk ----------
  _pushMsg(p) {
    const text = p && p.text;
    if (!text) return;
    let kind = p.kind;
    kind = MSG_TAGS[kind] ? kind : 'info';
    let from = p.from || '';
    let body = text;
    if (from && body.indexOf(from + ':') === 0) body = body.slice(from.length + 1).trim();
    if (from) body = radioText(body, this.world && this.world.profile && this.world.profile.faction);
    let terse = !!p.terse;
    if (!from && !terse) {
      // Systemmeldungen der Simulation in Cockpit-Sprache
      for (let i = 0; i < SYS_TEXT.length; i++) {
        const r = SYS_TEXT[i];
        if (body.indexOf(r[0]) !== 0) continue;
        if (r[2] === 'range') {
          // Reichweite: kurzes Blinken an Zielklammer und Zielfenster statt Funkzeile
          this.mid.flash(r[1]);
          this.sTFlash.set(true);
          this._tFlash = 1.6;
          return;
        }
        body = r[1]; terse = true;
        if (r[2]) kind = r[2];
        break;
      }
      if (!terse) {
        for (let i = 0; i < SYS_RX.length; i++) {
          const r = SYS_RX[i];
          const m = r[0].exec(body);
          if (!m) continue;
          body = r[1].replace(/\$(\d)/g, (_, n) => m[+n] || '').toUpperCase().replace(/ CREDITS\b/g, ' CR').replace(/ TRITIUM\b/g, ' T');
          terse = true;
          if (r[2]) kind = r[2];
          break;
        }
      }
    }
    // Gleiche Meldung innerhalb von 10 s: Zähler statt neuer Zeile
    for (let i = 0; i < this.msgs.length; i++) {
      const o = this.msgs[i];
      if (o.text !== body || o.from.textContent !== (from ? from.toUpperCase() : '')) continue;
      if (o.age > MSG_MERGE) break;
      o.n++;
      o.cnt.textContent = '×' + o.n;
      o.age = 0;
      if (o.old) { o.old = false; o.el.classList.remove('old'); }
      o.time.textContent = clock(this.world ? this.world.time : 0);
      if (i > 0) { this.msgs.splice(i, 1); this.msgs.unshift(o); this.feed.prepend(o.el); }
      return;
    }
    let m;
    if (this.msgs.length >= MSG_MAX) m = this.msgs.pop();
    else if (this.msgFree.length) m = this.msgFree.pop();
    else {
      const n = document.createElement('div');
      n.innerHTML = '<span class="hm-t ls-num"></span><span class="hm-k"></span><span class="hm-x"><span class="hm-f"></span><span class="hm-b"></span><span class="hm-n ls-num"></span></span>';
      const x = n.children[2];
      m = { el: n, time: n.children[0], tag: n.children[1], from: x.children[0], body: x.children[1], cnt: x.children[2], age: 0, old: false, text: '', n: 1 };
    }
    m.el.className = 'hm hm-' + kind + (terse ? ' is-terse' : '') + ' ls-enter';
    m.time.textContent = clock(this.world ? this.world.time : 0);
    m.tag.textContent = MSG_TAGS[kind];
    m.from.textContent = from ? from.toUpperCase() : '';
    m.body.textContent = body;
    m.cnt.textContent = '';
    m.text = body;
    m.n = 1;
    m.age = 0;
    m.old = false;
    this.feed.prepend(m.el);
    this.msgs.unshift(m);
    if (this._voidC !== false) { this._voidC = false; this.wins.setVoid('comms', false); }
    this._trimFeed();
  }

  // Nur ganze Einträge: älteste Zeilen entfernen, bis der Verlauf in seine Höhe passt (nur bei neuer Meldung).
  _trimFeed() {
    const f = this.feed;
    if (!f.offsetParent) return; // zugeklappt: beim Aufklappen erneut
    while (this.msgs.length > 1 && f.scrollHeight > FEED_MAX_H) {
      const o = this.msgs.pop();
      o.el.remove();
      this.msgFree.push(o);
    }
  }

  _updateFeed(dt) {
    for (let i = 0; i < this.msgs.length; i++) {
      const m = this.msgs[i];
      m.age += dt;
      if (!m.old && m.age > MSG_OLD) { m.old = true; m.el.classList.add('old'); }
    }
  }

  // ---------- schwebende Zahlen ----------
  // lane: '' = Treffer am Ziel (seitlich gestaffelt), 'loot' = eigene Spur über dem Schiff (gestapelt)
  _spawnFloat(text, tag, cls, x, z, id, life, big, lane = '') {
    if (x == null || z == null) return null;
    let f = null, oldest = null, stack = 0;
    for (let i = 0; i < this.floats.length; i++) {
      const it = this.floats[i];
      if (!it.on) { if (!f) f = it; continue; }
      if (!oldest || it.age > oldest.age) oldest = it;
      // noch junge Zahlen an derselben Stelle zählen, damit die neue daneben landet
      if (it.age < it.life * 0.6 && (lane === 'loot' ? it.kind === 'loot' : it.kind !== 'loot' && (id != null ? it.id === id : Math.abs(it.x - x) < 40 && Math.abs(it.z - z) < 40))) stack++;
    }
    if (!f) f = oldest;
    f.on = true;
    f.age = 0;
    f.life = life || 1.1;
    f.x = x; f.z = z; f.id = id;
    f.kind = lane || cls;
    f.sum = 0;
    if (lane === 'loot') {
      // Beute: feste Spur über dem Schiff, Einträge untereinander
      f.jx = 0; f.jy = -66 - (stack % 4) * 22;
      f.rise = 26;
    } else {
      // gestaffelt: feste Fächer-Plätze (Mitte, rechts, links, weiter außen), die nächste Zahl nie auf der vorigen
      const k = stack % LANES_X.length;
      f.jx = LANES_X[k]; f.jy = LANES_Y[k];
      f.rise = 40;
    }
    f.big = !!big;
    f.tx = NaN; f.ty = NaN; f.ts = NaN; f.op = -1;
    f.el.className = 'hf ' + cls;
    f.tier = 1;
    f.tag.textContent = tag || '';
    f.val.textContent = text;
    return f;
  }

  // Treffer derselben Salve (gleiches Ziel, < HIT_MERGE s) zu einer Zahl zusammenfassen.
  // kind: 'hit' (Gegner) oder 'hurt' (eigenes Schiff); hull: Salve hat die Hülle erreicht (Farbe wechselt auf Hülle)
  _mergeHit(id, kind, amount, crit, hull) {
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i];
      if (!f.on || f.id !== id || f.kind !== kind || f.age > HIT_MERGE) continue;
      f.sum += amount;
      f.val.textContent = (kind === 'hurt' ? '−' : '') + fmt(f.sum);
      if (hull) {
        const c = f.el.classList;
        if (c.contains('hf-sh')) { c.remove('hf-sh'); c.add('hf-hit'); }
        if (c.contains('hf-hurt-sh')) { c.remove('hf-hurt-sh'); f.tag.textContent = ''; }
      }
      if (crit && !f.big) { f.big = true; f.el.classList.add('hf-crit'); f.tag.textContent = 'KRITISCH'; f.life = 1.35; }
      if (kind === 'hit') this._tier(f);
      f.ts = NaN;
      return true;
    }
    return false;
  }

  _hideFloat(f) {
    f.on = false;
    f.id = null;
    f.op = 0;
    f.el.style.opacity = '0';
  }

  _updateFloats(dt) {
    const r = this.renderer;
    const w = this.world;
    for (let i = 0; i < this.floats.length; i++) {
      const f = this.floats[i];
      if (!f.on) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1 || !r) { this._hideFloat(f); continue; }
      if (f.id != null && w && w.entities) {
        const e = w.entities.get(f.id);
        if (e && e.alive !== false) { f.x = e.x; f.z = e.z; }
      }
      const s = r.toScreen(f.x, f.z, this._scr);
      if (!s || !s.visible) {
        if (f.op !== 0) { f.op = 0; f.el.style.opacity = '0'; }
        continue;
      }
      // kurzer Einschlag: breit und hell, dann ruhig nach oben
      const ease = 1 - (1 - t) * (1 - t) * (1 - t);
      const x = Math.round(s.x + f.jx);
      const y = Math.round(s.y - 30 + f.jy - f.rise * ease);
      const pop = t < 0.1 ? 1 - t / 0.1 : 0;
      const sc = Math.round((1 + pop * (f.big ? 0.5 : 0.22)) * 50) / 50;
      if (x !== f.tx || y !== f.ty || sc !== f.ts) {
        f.tx = x; f.ty = y; f.ts = sc;
        f.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%) scale(' + sc + ')';
      }
      const a = t < 0.05 ? t / 0.05 : t > 0.68 ? 1 - (t - 0.68) / 0.32 : 1;
      const op = Math.round(clamp01(a) * 20) / 20;
      if (op !== f.op) { f.op = op; f.el.style.opacity = String(op); }
    }
  }

  _onDamage(p) {
    if (!p) return;
    const hull = p.hull || 0, shield = p.shield || 0;
    const total = hull + shield;
    if (total <= 0) return;
    if (p.id === 'player') {
      this.mid.hitFrom(this.world, p);
      if (this._mergeHit(p.id, 'hurt', total, false, hull > 0)) return;
      const sh = shield && !hull;
      const f = this._spawnFloat('−' + fmt(total), sh ? 'SCHILD' : '', 'hf-hurt' + (sh ? ' hf-hurt-sh' : ''), p.x, p.z, p.id, 1.1, false);
      if (f) { f.kind = 'hurt'; f.sum = total; }
      return;
    }
    // nur eigene Treffer als Zahl (Piraten auf den Frachter usw. bleiben ruhig: weniger Chaos)
    if (p.from != null && p.from !== 'player') return;
    if (this._mergeHit(p.id, 'hit', total, !!p.crit, hull > 0)) return;
    const f = this._spawnFloat(fmt(total), p.crit ? 'KRITISCH' : '', (hull === 0 ? 'hf-sh' : 'hf-hit') + (p.crit ? ' hf-crit' : ''), p.x, p.z, p.id, p.crit ? 1.35 : 1.0, !!p.crit);
    if (f) { f.kind = 'hit'; f.sum = total; f.tier = 1; this._tier(f); }
  }

  // Größenstufe der Trefferzahl nach Anteil am Gesamtleben (Hülle + Schild) des Ziels
  _tier(f) {
    const e = this.world && this.world.entities && this.world.entities.get(f.id);
    const max = e ? (e.hpMax || 0) + (e.shieldMax || 0) : 0;
    const r = max > 0 ? f.sum / max : 0;
    const t = r >= TIER3 ? 3 : r >= TIER2 ? 2 : 1;
    if (t === f.tier) return;
    const c = f.el.classList;
    if (f.tier > 1) c.remove('hf-t' + f.tier);
    if (t > 1) c.add('hf-t' + t);
    f.tier = t;
  }

  _onShot(p) {
    if (!p || p.hit !== false || p.from !== 'player') return;
    const w = this.world;
    const e = w && w.entities && w.entities.get(p.to);
    if (e) this._spawnFloat('DANEBEN', '', 'hf-miss', e.x, e.z, p.to, 0.8, false);
  }

  // ---------- Beute ----------
  _onLoot(p) {
    if (!p) return;
    const a = this._lootAcc;
    if (this._lootT <= 0) { a.credits = 0; a.tritium = 0; a.xp = 0; a.honor = 0; a.extra.clear(); }
    a.credits += p.credits || 0;
    a.tritium += p.tritium || 0;
    a.xp += p.xp || 0;
    a.honor += p.honor || 0;
    addExtras(a.extra, p.ammo, null);
    addExtras(a.extra, p.ore, ORES);

    let html = '';
    if (a.credits) html += `<span><b>+${fmt(a.credits)}</b> CR</span>`;
    if (a.tritium) html += `<span class="is-tri"><b>+${fmt(a.tritium)}</b> TRITIUM</span>`;
    for (const [name, n] of a.extra) html += `<span><b>+${fmt(n)}</b> ${esc(String(name).toUpperCase())}</span>`;
    if (a.xp) html += `<span><b>+${fmt(a.xp)}</b> EP</span>`;
    if (a.honor) html += `<span><b>+${fmt(a.honor)}</b> EHRE</span>`;
    if (!html) return;
    this.lootEl.innerHTML = '<span class="hl-code">BEUTE</span>' + html;
    this.lootEl.classList.remove('show');
    void this.lootEl.offsetWidth;
    this.lootEl.classList.add('show');
    this._lootT = 3;

    // Beute auf eigener Spur über dem eigenen Schiff, Einträge gestapelt statt übereinander
    const pl = this.world && this.world.player;
    const lx = pl ? pl.x : p.x, lz = pl ? pl.z : p.z;
    const lid = pl ? 'player' : null;
    if (p.credits) this._spawnFloat('+' + fmt(p.credits), 'CR', 'hf-loot hf-cr', lx, lz, lid, 1.7, false, 'loot');
    if (p.tritium) this._spawnFloat('+' + fmt(p.tritium), 'TRITIUM', 'hf-loot hf-tri', lx, lz, lid, 1.9, false, 'loot');
    else if (!p.credits && (p.ore || p.ammo)) {
      const first = a.extra.size ? a.extra.keys().next().value : '';
      const n = first ? a.extra.get(first) : 0;
      this._spawnFloat(n ? '+' + fmt(n) : '+', String(first).toUpperCase(), 'hf-loot', lx, lz, lid, 1.6, false, 'loot');
    }
  }

  _onLevel(p) {
    const lvl = (p && p.level) || (this.world && this.world.profile && this.world.profile.level) || 1;
    const newRank = rankFor(lvl) !== rankFor(lvl - 1);
    this._toast('PIL·01 · AUFSTIEG', 'STUFE ' + lvl, newRank ? 'NEUER RANG · ' + rankFor(lvl).toUpperCase() : rankFor(lvl).toUpperCase(), 3.6);
  }

  _onQuest(p) {
    if (!p || !p.done || !p.quest) return;
    const r = p.quest.reward || {};
    const parts = [];
    if (r.credits) parts.push('+' + fmt(r.credits) + ' CR');
    if (r.tritium) parts.push('+' + fmt(r.tritium) + ' TRITIUM');
    if (r.xp) parts.push('+' + fmt(r.xp) + ' EP');
    if (r.honor) parts.push('+' + fmt(r.honor) + ' EHRE');
    this._toast('MSN·05 · AUFTRAG ERFÜLLT', (p.quest.title || '').toUpperCase(), parts.join('   '), 3.6);
  }

  _toast(cap, main, sub, secs) {
    if (this._toastT > 0 || this._toastNext) { this._toastQueue.push([cap, main, sub, secs]); return; }
    this.toastCap.textContent = cap;
    this.toastMain.textContent = main;
    this.toastSub.textContent = sub || '';
    this.toastEl.classList.add('show');
    this._toastT = secs;
  }

  _updateToasts(dt) {
    if (this._lootT > 0) {
      this._lootT -= dt;
      if (this._lootT <= 0) this.lootEl.classList.remove('show');
    }
    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) {
        this._toastT = 0;
        this.toastEl.classList.remove('show');
        if (this._toastQueue.length) { this._toastNext = this._toastQueue.shift(); this._toastDelay = 0.4; }
      }
    } else if (this._toastNext) {
      this._toastDelay -= dt;
      if (this._toastDelay <= 0) { const n = this._toastNext; this._toastNext = null; this._toast(n[0], n[1], n[2], n[3]); }
    }
  }

  // ---------- Abschuss ----------
  _showDead(show) {
    this._deadShown = show;
    this.sDeadCls.set(show);
    this.deadEl.classList.toggle('show', show);
    if (show) {
      if (this._menuOpen) this.toggleMenu(false);
      this._fillRepair();
    }
  }

  _fillRepair() {
    const w = this.world;
    const p = w && w.profile;
    if (!p) return;
    const free = (p.level || 1) <= REPAIR.freeUntilLevel;
    this.$('deadtext').textContent = free
      ? 'Rettungskapsel geborgen. Reparaturort wählen. Bis Stufe ' + REPAIR.freeUntilLevel + ' übernimmt die Werft die Kosten.'
      : 'Rettungskapsel geborgen. Reparaturort wählen.';
    this.$('deadclock').textContent = 'T+' + clock(w.time);
    const s = w.sector;
    this.$('deadsec').textContent = s ? s.id + ' · ' + (s.name || '').toUpperCase() : '';
    const st = p.stats || {};
    let kills = 0;
    if (st.kills) for (const k in st.kills) kills += st.kills[k] || 0;
    this.$('deaths').textContent = fmt(st.deaths || 0);
    this.$('kills').textContent = fmt(kills);
    this.$('ftime').textContent = clock(st.playSeconds || 0);
    for (const where of ['station', 'portal', 'here']) {
      let c = repairCost(where, p);
      if (w && typeof w.repairCost === 'function') {
        const r = w.repairCost(where);
        if (r) c = { free: !!r.free, credits: r.currency === 'credits' ? r.amount : 0, tritium: r.currency === 'tritium' ? r.amount : 0 };
      }
      const small = this.$('rc-' + where);
      const btn = small.closest('button');
      let txt, ok = true;
      if (c.free) txt = 'KOSTENLOS';
      else if (c.credits) { txt = fmt(c.credits) + ' CR'; ok = (p.credits || 0) >= c.credits; }
      else { txt = fmt(c.tritium) + ' TRITIUM'; ok = (p.tritium || 0) >= c.tritium; }
      if (!ok) txt += ' · FEHLT';
      small.textContent = txt;
      btn.disabled = !ok;
      btn.classList.toggle('is-tri', !c.free && !c.credits);
    }
  }

  // ---------- Minikarte ----------
  _drawMap(w) {
    const pl = w.player;
    const m = this._mark;
    if (m && pl) {
      const dx = m.x - pl.x, dz = m.z - pl.z;
      if (dx * dx + dz * dz < 40 * 40 || this._t - m.t > 12) this._mark = null;
    }
    this.mapView.draw(w, this.renderer, this._mark, this._accentColor, this._t);
    if (!pl) return;
    const cx = Math.round(pl.x / 10) * 10, cz = Math.round(pl.z / 10) * 10;
    const ck = cx * 100000 + cz;
    if (ck !== this._coordK) {
      this._coordK = ck;
      this._posText = NF2.format(cx / 1000) + ' / ' + NF2.format(cz / 1000) + ' KM';
      this.sCoords.set(this._posText);
    }
  }

  // ---------- Bordmenü ----------
  _updateMenu(w, dt) {
    const M = this.menu;
    M._acc += dt;
    if (M._acc < 0.25) return;
    M._acc = 0;
    const I = this._menuInfo;
    const p = w.profile || {};
    I.clock = 'T+' + clock(w.time);
    I.pos = this._posText || '';
    I.state = w.inSafeZone ? 'SICHERE ZONE' : w.inCombat ? 'IM KAMPF' : 'OFFENER RAUM';
    let n = 0;
    if (w.entities) for (const e of w.entities.values()) if (e.kind === 'enemy' && e.alive !== false) n++;
    I.hostiles = n;
    const q = w.quest;
    I.quest = q && q.def ? String(q.def.title || '').toUpperCase() + '  ' + fmt(Math.min(q.def.goal.count || 1, q.progress || 0)) + '/' + fmt(q.def.goal.count || 1) : 'KEINER';
    const st = p.stats || {};
    let kills = 0;
    if (st.kills) for (const k in st.kills) kills += st.kills[k] || 0;
    I.kills = fmt(kills);
    I.deaths = fmt(st.deaths || 0);
    I.ftime = clock(st.playSeconds || 0);
    I.rank = rankFor(p.level || 1).toUpperCase();
    I.store = this._saved != null && this._t - this._saved < 4 ? 'GESPEICHERT' : 'AUTOMATISCH';
    M.render(w, this.renderer, I);
  }
}

// Beute-Zusätze (Munition, Erz) in jeder sinnvollen Form zusammenzählen.
function addExtras(map, v, names) {
  if (!v) return;
  const add = (key, n) => {
    n = Math.round(n || 0);
    if (!n || !key) return;
    const name = (names && names[key] && names[key].name) || key;
    map.set(name, (map.get(name) || 0) + n);
  };
  if (Array.isArray(v)) { add(v[0], v[1]); return; }
  if (typeof v === 'number') { add(names ? 'Erz' : 'Munition', v); return; }
  if (typeof v === 'object') {
    if (v.type != null) { add(v.type, v.amount ?? v.count ?? v.n); return; }
    for (const key in v) add(key, v[key]);
  }
}
