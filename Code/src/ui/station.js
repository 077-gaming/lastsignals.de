// Station: Andock-Terminal mit Hangar, Shop, Erz. Öffnet sich bei 'docked', schließt bei 'undocked'.
// Wird nur bei Ereignissen, Klicks oder Größenänderung neu gezeichnet, nie pro Bild.
import './station.css';
import { LASERS, GENERATORS, AMMO, ROCKETS, SHIPS, ORES, FACTIONS, DRONES, DRONE_SHOP, DRONE_RULES } from '../core/data.js';
import { fmt, esc, rankFor } from './hud.js';
import { HangarBay } from './station-bay.js';

const CUR = { credits: 'Credits', tritium: 'Tritium' };
const U = '\u202f'; // schmaler Abstand zwischen Wert und Einheit

// Klassennamen der Schiffsreihe (Vorschlag für data.js, bis dort eigene Namen stehen)
const SHIP_CLASS = { s1: 'Kestrel', s2: 'Harrier', s3: 'Warden', s5: 'Bastion', s8: 'Sovereign' };
function shipCode(id) { return 'SF-0' + ((SHIPS[id] && SHIPS[id].no) || 1); }
function shipClass(id) { return SHIP_CLASS[id] || (SHIPS[id] ? SHIPS[id].name : ''); }
function shipLabel(id) { return shipCode(id) + ' ' + shipClass(id); }
function nameOf(kind, id) { return kind === 'ship' ? shipLabel(id) : tableOf(kind)[id].name; }

// Stationsname: ein einziger Name aus data.js (sector.station.name), wie HUD-Andockhinweis und Funk im All.
function stationNameOf(world) {
  const s = world && world.sector;
  return (s && s.station && s.station.name) || (s && s.name) || 'Station';
}
// Funkrufname der Station: Sprecher aus FACTIONS[].stationVoice („Gefängnisring Eris an Häftling“ → „Gefängnisring Eris“)
function stationVoiceOf(world) {
  const p = world && world.profile;
  const f = p && FACTIONS[p.faction];
  return f ? f.stationVoice.split(' an ')[0] : 'Station ' + stationNameOf(world);
}

// Protokolle je Pilot (bleiben über An- und Abdocken in dieser Sitzung erhalten)
const MOUNT_LOG = new Map();
const SHARED = { bay: null };
const SALES_LOG = new Map();
function logOf(map, key) { let a = map.get(key); if (!a) { a = []; map.set(key, a); } return a; }
function readView() { try { return localStorage.getItem('ls.station.view') === 'plan' ? 'plan' : 'werft'; } catch { return 'werft'; } }
function saveView(v) { try { localStorage.setItem('ls.station.view', v); } catch { /* egal */ } }
const SATURN_IMG = '/img/saturn-starter.png';

// Preis für eine Packung (für andere Module weiter verfügbar).
export function priceFor(kind, id, world) {
  if (world && typeof world.priceOf === 'function') {
    const r = world.priceOf(kind, id);
    if (r) return { amount: r.cost, currency: r.currency, qty: r.pack || 1 };
  }
  const t = tableOf(kind);
  const d = t && t[id];
  if (!d) return null;
  if (kind === 'ammo' || kind === 'rocket') {
    const per = id === 'L1' ? d.price / 1000 : d.price;
    return { amount: Math.round(per * d.pack), currency: d.currency, qty: d.pack };
  }
  return { amount: d.price, currency: d.currency, qty: 1 };
}

function tableOf(kind) {
  return kind === 'laser' ? LASERS : kind === 'gen' ? GENERATORS : kind === 'ammo' ? AMMO : kind === 'rocket' ? ROCKETS : kind === 'ship' ? SHIPS : kind === 'drone' ? DRONE_SHOP : null;
}

// ---------- Katalog (feste Reihenfolge, alles immer sichtbar) ----------
const CATS = [
  { id: 'laser', no: '01', name: 'Laser', items: Object.keys(LASERS) },
  { id: 'gen', no: '02', name: 'Generatoren', items: Object.keys(GENERATORS) },
  { id: 'ammo', no: '03', name: 'Munition', items: Object.keys(AMMO) },
  { id: 'rocket', no: '04', name: 'Raketen', items: Object.keys(ROCKETS) },
  { id: 'ship', no: '05', name: 'Schiffe', items: Object.keys(SHIPS) },
  { id: 'drone', no: '06', name: 'Drohnen', items: Object.keys(DRONE_SHOP) },
];
const LASER_TIER = {};
Object.keys(LASERS).forEach((id, i) => { LASER_TIER[id] = i + 1; });
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// Hersteller (Kürzel, Name) und Masse in Tonnen (Munition und Raketen je Packung)
const MAKER = {
  laser: { pulse: ['HLD', 'Halden Werke', 1.4], ion: ['OST', 'Ostrova Optik', 1.7], plasma: ['KSR', 'Kessler Ringwerft', 2.2], gamma: ['---', 'Wrackbergung', 2.6] },
  gen: { dr1: ['HLD', 'Halden Werke', 0.9], sh1: ['OST', 'Ostrova Optik', 1.3] },
  ammo: { L1: ['HLD', 'Halden Werke', 0.2], L2: ['HLD', 'Halden Werke', 0.2], L3: ['KSR', 'Kessler Ringwerft', 0.15], L4: ['KSR', 'Kessler Ringwerft', 0.12], SAB: ['OST', 'Ostrova Optik', 0.15], SAL: ['KSR', 'Kessler Ringwerft', 0.08] },
  rocket: { R1: ['KSR', 'Kessler Ringwerft', 0.6] },
};
function tons(v) { return String(v).replace('.', ',') + U + 't'; }

function codeOf(kind, id) {
  if (kind === 'laser') return 'LZ-0' + LASER_TIER[id];
  if (kind === 'gen') return 'GN-0' + (Object.keys(GENERATORS).indexOf(id) + 1);
  if (kind === 'ammo') return 'MU-' + id;
  if (kind === 'rocket') return 'RK-' + id;
  if (kind === 'ship') return 'SF-0' + SHIPS[id].no;
  if (kind === 'drone') return 'DR-' + (DRONE_SHOP[id].module === 'laser' ? 'L' : 'S') + '1';
  return id;
}

const DESC = {
  laser: {
    pulse: 'Standard-Pulslaser der Werft. Robust, billig, ein Schuss pro Sekunde.',
    ion: 'Ionen-Emitter mit höherer Energiedichte. Gleicher Takt, deutlich mehr Durchschlag.',
    plasma: 'Gekühlte Plasmakammer. Wird nur gegen Tritium abgegeben.',
    gamma: 'Gamma-Emitter aus Wracks. Nicht im Handel, nur als Beute.',
  },
  gen: {
    dr1: 'Antriebsverstärker. Mehr Schub, schneller an Ziel und Beute.',
    sh1: 'Schildgenerator. Erhöht die Schildkapazität des Schiffs.',
  },
  ammo: {
    L1: 'Standardladung für alle Laser.',
    L2: 'Verstärkte Ladung. Doppelter Schaden je Schuss.',
    L3: 'Hochenergie-Ladung. Dreifacher Schaden.',
    L4: 'Schwere Ladung. Vierfacher Schaden.',
    SAB: 'Schild-Absauger. Trifft nur Schilde, lädt deinen Schild mit auf.',
    SAL: 'Einzelschuss mit sechsfachem Schaden. Eigene Ladezeit 4 s.',
  },
  rocket: { R1: 'Lenkrakete. Feuert auf das aufgeschaltete Ziel.' },
  drone: {
    'pioneer-laser': 'Robuste Begleitdrohne mit Lasermodul. Feuert mit deinen Lasern auf dein Ziel, mit deiner Munition. Wird durch Kämpfen stärker (Stufe 1–10) und mehr wert.',
    'pioneer-shield': 'Robuste Begleitdrohne mit Schildmodul. Verstärkt den Schild deines Schiffs. Wird durch Kämpfen stärker (Stufe 1–10) und mehr wert.',
  },
  ship: {
    s1: 'Leichter Jäger der Werft. Zwei Laser, zwei Generatoren.',
    s2: 'Mittelschwerer Kampfrahmen. Doppelte Bewaffnung, dreifacher Laderaum.',
    s3: 'Schwerer Rahmen. In Erprobung, Freigabe folgt.',
    s5: 'Kreuzer-Klasse. In Erprobung, Freigabe folgt.',
    s8: 'Kampfschiff der Flotte. In Erprobung, Freigabe folgt.',
  },
};

// ---------- Schiffsbilder und Montagepunkte (Anteile an Breite/Höhe, Bild 1280 × 1000) ----------
const HP_IMG = {
  laser: [[0.163, 0.668], [0.289, 0.772], [0.24, 0.55], [0.4, 0.66], [0.648, 0.8]],
  gen: [[0.6, 0.262], [0.735, 0.292], [0.272, 0.37], [0.8, 0.62], [0.53, 0.4]],
};
const HP_SVG = {
  laser: [[0.148, 0.344], [0.148, 0.656], [0.234, 0.32], [0.234, 0.68], [0.273, 0.5]],
  gen: [[0.719, 0.31], [0.719, 0.69], [0.594, 0.5], [0.781, 0.5], [0.61, 0.16]],
};
const HP_SVG_BIG = {
  laser: [[0.148, 0.344], [0.148, 0.656], [0.56, 0.16], [0.56, 0.84], [0.273, 0.5]],
  gen: [[0.719, 0.31], [0.719, 0.69], [0.594, 0.5], [0.781, 0.5], [0.234, 0.32]],
};

// Technische Draufsicht, Bug links. viewBox 640 × 500 (gleiches Seitenverhältnis wie das Werftbild).
const SVG_VB = [45, 35, 550, 430]; // Ausschnitt der Hangar-Zeichnung (Seitenverhältnis 1,28 wie das Werftbild)
function shipSvg(no, mini) {
  const big = no >= 2;
  const wings = big
    ? `<path class="b f" d="M300 164 L350 64 L412 64 L424 160 Z"/><path class="b f" d="M300 336 L350 436 L412 436 L424 340 Z"/>
       <path class="p" d="M330 120 H414 M330 380 H414 M362 64 V150 M362 436 V350 M318 150 L356 76 M318 350 L356 424"/>
       <path class="g" d="M352 70 H410 M352 430 H410"/>`
    : '';
  const top = big ? 64 : 118, bot = big ? 436 : 382;
  const dims = mini ? '' : `
    <g class="dim">
      <path d="M70 446 V458 M545 446 V458 M70 452 H545"/>
      <text x="307" y="446">L ${big ? '58,2' : '42,6'} M</text>
      <path d="M572 ${top} H584 M572 ${bot} H584 M578 ${top} V${bot}"/>
      <text x="578" y="${top - 8}">B ${big ? '39,8' : '26,4'} M</text>
    </g>`;
  const vents = (y) => `M408 ${y} H470 M408 ${y + 8} H470 M408 ${y + 16} H470 M408 ${y + 24} H470`;
  return `<svg class="sx-schem" viewBox="${mini ? '60 56 500 390' : SVG_VB.join(' ')}" aria-hidden="true">
    <path class="cl" d="M24 250 H616"/>
    ${wings}
    <path class="b" d="M398 118 H498 L522 142 V192 H398 Z"/>
    <path class="b" d="M398 382 H498 L522 358 V308 H398 Z"/>
    <path class="p" d="M420 118 V192 M484 118 V192 M420 382 V308 M484 382 V308 M372 190 V214 M440 192 V205 M372 310 V286 M440 308 V295 ${vents(132)} ${vents(338)}"/>
    <path class="b f" d="M70 168 L120 150 L330 158 L348 205 L190 214 L86 190 Z"/>
    <path class="b f" d="M70 332 L120 350 L330 342 L348 295 L190 286 L86 310 Z"/>
    <path class="h" d="M78 182 L96 156 M92 190 L112 152 M108 190 L126 160 M78 318 L96 344 M92 310 L112 348 M108 310 L126 340"/>
    <path class="p" d="M228 164 H262 V180 H228 Z M228 336 H262 V320 H228 Z M140 158 L150 196 M140 342 L150 304"/>
    <path class="b f2" d="M180 214 L345 200 L470 206 L515 226 V274 L470 294 L345 300 L180 286 L152 250 Z"/>
    <path class="p" d="M195 222 L345 210 L465 215 L505 232 V268 L465 285 L345 290 L195 278 L170 250 Z"/>
    <path class="p" d="M200 156 L206 212 M268 157 L274 206 M330 158 L300 202 M200 344 L206 288 M268 343 L274 294 M330 342 L300 298 M345 200 V300 M410 203 V297 M470 206 V294 M360 236 H396 V264 H360 Z M420 240 H456 M420 250 H456 M420 260 H456"/>
    <path class="c" d="M200 233 L288 225 L302 250 L288 275 L200 267 L186 250 Z"/>
    <path class="p" d="M232 230 L236 270 M262 227 L266 273"/>
    <path class="b" d="M522 150 H538 V184 H522 Z M522 316 H538 V350 H522 Z M515 236 H534 V264 H515 Z"/>
    <path class="g" d="M546 156 V178 M546 322 V344 M542 240 V260"/>
    ${mini ? '' : `<text x="214" y="190" class="lbl">S-0${no}</text><text x="214" y="322" class="lbl">S-0${no}</text><text x="420" y="113" class="lbl">A-01</text><text x="420" y="398" class="lbl">A-02</text>`}
    ${dims}
  </svg>`;
}
// Montagepunkt (Anteil an 640 × 500) in Anteil am Bildausschnitt umrechnen
function svgHp(h) {
  return [(h[0] * 640 - SVG_VB[0]) / SVG_VB[2], (h[1] * 500 - SVG_VB[1]) / SVG_VB[3]];
}

// Technische Zeichnungen für das Datenblatt (viewBox 300 × 104, füllt 60–70 % des Bildfelds).
// Haarlinien, Bemaßung, Akzent nur am Bauteil, das die Stufe unterscheidet.
const LASER_LEN = { pulse: '2,1', ion: '2,6', plasma: '2,4', gamma: '2,9' };
function dimH(x1, x2, y, label) {
  const m = (x1 + x2) / 2;
  return `<g class="dim"><path d="M${x1} ${y - 5} V${y + 5} M${x2} ${y - 5} V${y + 5} M${x1} ${y} H${m - 22} M${m + 22} ${y} H${x2} M${x1} ${y} l5 -2.5 M${x1} ${y} l5 2.5 M${x2} ${y} l-5 -2.5 M${x2} ${y} l-5 2.5"/><text x="${m}" y="${y + 3}">${label}</text></g>`;
}
function dimV(x, y1, y2, label) {
  return `<g class="dim"><path d="M${x - 5} ${y1} H${x + 5} M${x - 5} ${y2} H${x + 5} M${x} ${y1} V${y2} M${x} ${y1} l-2.5 5 M${x} ${y1} l2.5 5 M${x} ${y2} l-2.5 -5 M${x} ${y2} l2.5 -5"/><text class="v" x="${x + 9}" y="${(y1 + y2) / 2 + 3}">${label}</text></g>`;
}
function callout(x, y, tx, ty, label, anchor = 'start') {
  return `<path class="co" d="M${x} ${y} L${tx} ${ty} H${anchor === 'end' ? tx - 4 : tx + 4}"/><circle class="co-d" cx="${x}" cy="${y}" r="1.6"/><text class="co-t" x="${anchor === 'end' ? tx - 7 : tx + 7}" y="${ty + 3}" text-anchor="${anchor}">${label}</text>`;
}
// Je Laserklasse eine eigene Silhouette: Lauflänge, Emitterform, Kühlkörper, Energiezellen.
// Akzent (Klasse .a) in der Strahlfarbe der Klasse, alles andere Haarlinie.
function cells(n, x0, y, w = 12, h = 6, gap = 3) {
  let o = '';
  for (let i = 0; i < n; i++) o += `<path class="a" d="M${x0 + i * (w + gap)} ${y} h${w} v${h} h-${w} Z"/>`;
  return o;
}
function finsAt(x0, x1, y0, y1, n) {
  let d = '';
  for (let i = 0; i < n; i++) { const x = (x0 + (x1 - x0) * (i + 0.5) / n).toFixed(1); d += `M${x} ${y0} V${y1} `; }
  return `<path class="p" d="${d}"/>`;
}
function laserShape(id) {
  const mount = `<path class="b" d="M36 40 H66 V64 H36 Z"/><path class="p" d="M42 40 V64 M60 40 V64 M36 70 H66 M40 64 V70 M62 64 V70"/><circle class="p" cx="51" cy="46" r="2"/><circle class="p" cx="51" cy="58" r="2"/>`;
  if (id === 'pulse') return { len: 214, feat: 'KÜHLRIPPEN ×4', fx: 110, fy: 30, ex: 214, ey: 46, cellN: 1, cx: 86, cy: 72, g: `${mount}
    <path class="b" d="M66 40 H150 L156 44 V60 L150 64 H66 Z"/>
    <path class="b" d="M92 30 H132 V40 H92 Z"/>${finsAt(92, 132, 30, 40, 4)}
    <path class="p" d="M76 46 H146 M76 58 H146 M110 40 V64"/>
    <path class="b" d="M156 47 H204 V57 H156 Z"/><path class="p" d="M172 47 V57 M188 47 V57"/>
    <path class="a" d="M204 46 L214 43 V61 L204 58 Z"/>
    ${cells(1, 80, 66)}<path class="beam ab" d="M218 52 H240"/>` };
  if (id === 'ion') return { len: 268, feat: 'BESCHLEUNIGER ×6', fx: 196, fy: 40, ex: 268, ey: 45, cellN: 2, cx: 82, cy: 72, g: `${mount}
    <path class="b" d="M66 42 H128 L134 46 V58 L128 62 H66 Z"/>
    <path class="p" d="M76 48 H124 M76 56 H124 M100 42 V62"/>
    <path class="b" d="M134 49 H258 V55 H134 Z"/>
    ${[148, 166, 184, 202, 220, 238].map((x) => `<path class="b" d="M${x} 42 H${x + 6} V62 H${x} Z"/>`).join('')}
    <path class="p" d="M148 40 H244 M148 64 H244"/>
    <circle class="a" cx="266" cy="52" r="7"/><circle class="p" cx="266" cy="52" r="3"/>
    ${cells(2, 76, 66)}<path class="beam ab" d="M275 52 H294"/>` };
  if (id === 'plasma') return { len: 272, feat: 'PLASMAKAMMER', fx: 140, fy: 41, ex: 270, ey: 42, cellN: 3, cx: 201, cy: 72, g: `${mount}
    <path class="b" d="M66 34 H186 L196 42 V62 L186 70 H66 Z"/>
    <path class="b" d="M78 20 H182 V34 H78 Z"/>${finsAt(78, 182, 20, 34, 13)}
    <path class="b" d="M78 70 H182 V76 H78 Z"/>${finsAt(78, 182, 70, 76, 13)}
    <ellipse class="a" cx="140" cy="52" rx="34" ry="11"/><path class="p" d="M110 52 H170"/>
    <path class="b" d="M196 44 H238 V60 H196 Z"/><path class="p" d="M210 44 V60 M224 44 V60"/>
    <path class="b" d="M238 40 H266 L272 44 H238 Z M238 64 H266 L272 60 H238 Z"/>
    <circle class="a" cx="258" cy="52" r="5"/>
    ${cells(3, 196, 66, 10, 6, 3)}<path class="beam ab" d="M274 52 H294"/>` };
  return { len: 290, feat: 'KÜHLKÖRPER ×10', fx: 210, fy: 38, ex: 290, ey: 46, cellN: 4, cx: 75, cy: 76, g: `${mount}
    <path class="b" d="M66 38 H168 L176 44 V60 L168 66 H66 Z"/>
    <path class="p" d="M66 32 H172 M80 32 V38 M156 32 V38 M76 46 H164 M76 58 H164 M100 38 V66 M134 38 V66"/>
    <path class="b" d="M176 48 H280 V56 H176 Z"/>
    ${Array.from({ length: 10 }, (_, i) => { const x = 182 + i * 9.6; return `<path class="b" d="M${x.toFixed(1)} 38 L${(x + 5).toFixed(1)} 48 M${x.toFixed(1)} 66 L${(x + 5).toFixed(1)} 56"/>`; }).join('')}
    <path class="p" d="M182 38 H278 M182 66 H278"/>
    <path class="a" d="M280 44 L292 52 L280 60 Z"/>
    ${cells(4, 70, 70, 10, 6, 3)}<path class="beam ab" d="M294 52 H299"/>` };
}

// Ausschnitt je Art für die Mini-Zeichnung im Katalog
const MINI_VB = { laser: '30 16 268 64', gen: '56 18 196 72', ammo: '104 6 92 92', rocket: '24 18 232 68', drone: '70 10 160 92' };
function itemSvg(kind, id, mini) {
  let g = '';
  let style = '';
  if (kind === 'laser') {
    const tier = LASER_TIER[id];
    const col = '#' + LASERS[id].color.toString(16).padStart(6, '0');
    const L = laserShape(id);
    style = ` style="--ac:${col}"`;
    g = `
      <path class="cl" d="M30 52 H296"/>
      ${L.g}
      ${callout(L.ex - 4, L.ey, L.ex - 22, 12, 'EMITTER', 'end')}
      ${callout(L.fx, L.fy, 120, 12, L.feat, 'end')}
      ${callout(L.cx, L.cy, id === 'plasma' ? 236 : 40, 88, 'ZELLEN ×' + L.cellN, id === 'plasma' ? 'start' : 'end')}
      ${dimH(36, L.len, 98, 'L ' + LASER_LEN[id] + ' M')}
      ${dimV(18, 30, 74, '')}
      <text class="lbl" x="6" y="56">0,6</text>
      <text class="lbl r" x="296" y="104">KL ${ROMAN[tier]}</text>`;
  } else if (kind === 'gen') {
    const d = GENERATORS[id];
    const sh = d.kind === 'shield';
    const core = sh
      ? `<circle class="c" cx="150" cy="50" r="17"/><circle class="c" cx="150" cy="50" r="10"/><circle class="b" cx="150" cy="50" r="4"/>`
      : `<path class="c" d="M132 36 L176 44 V56 L132 64 Z"/><path class="p" d="M140 38 V62 M152 40 V60 M164 42 V58"/>`;
    g = `
      <path class="b" d="M84 22 H208 L222 36 V78 H84 Z"/>
      <path class="p" d="M84 30 H214 M84 70 H222 M100 22 V30 M120 22 V30 M190 22 V30 M100 70 V78 M190 70 V78"/>
      <path class="b" d="M108 32 H196 V68 H108 Z"/>
      ${core}
      <path class="b" d="M64 40 H84 V60 H64 Z M222 42 H242 V58 H222 Z"/>
      <path class="p" d="M58 44 H64 M58 50 H64 M58 56 H64 M242 46 H248 M242 54 H248"/>
      <path class="b" d="M96 78 V86 H112 V78 M194 78 V86 H210 V78"/>
      ${callout(sh ? 167 : 176, sh ? 38 : 44, 236, 16, sh ? 'FELDSPULE' : 'SCHUBVEKTOR')}
      ${callout(64, 50, 40, 22, 'BUS', 'end')}
      ${dimH(64, 242, 96, 'B 1,8 M')}
      ${dimV(262, 22, 86, 'H 0,7')}
      <text class="lbl" x="6" y="102">${esc(d.name)} · ${sh ? 'SCHILD' : 'ANTRIEB'}</text>`;
  } else if (kind === 'ammo') {
    const d = AMMO[id];
    const n = Math.min(6, Math.max(1, Math.round(d.mult)));
    const top = 72 - n * 8;
    let cells = '';
    for (let i = 0; i < 6; i++) cells += `<path class="p" d="M118 ${72 - (i + 1) * 8} H182"/>`;
    g = `
      <path class="cl" d="M150 8 V100"/>
      <path class="b" d="M112 18 H188 V80 L180 88 H120 L112 80 Z"/>
      <path class="b" d="M118 24 H182 V72 H118 Z"/>
      <path class="c hatch" d="M118 ${top} H182 V72 H118 Z"/>
      ${cells}
      <path class="b" d="M126 10 H174 V18 H126 Z"/>
      <path class="p" d="M134 10 V18 M166 10 V18 M130 88 V94 H170 V88"/>
      ${d.shieldOnly ? '<path class="b" d="M138 48 A12 12 0 0 1 162 48"/>' : ''}
      ${callout(182, top + 4, 214, 22, 'LADUNG ×' + d.mult)}
      ${callout(118, 80, 86, 92, 'ZÜNDKONTAKT', 'end')}
      ${dimV(206, 18, 88, 'H 0,24 M')}
      ${dimH(112, 188, 100, 'Ø 0,1')}
      <text class="lbl" x="6" y="16">${esc(d.name)}</text>
      <text class="lbl" x="6" y="30">${fmt(d.pack)} SCHUSS</text>`;
  } else if (kind === 'rocket') {
    g = `
      <path class="cl" d="M20 52 H290"/>
      <path class="b" d="M44 42 H210 V62 H44 Z"/>
      <path class="c" d="M210 42 L252 52 L210 62 Z"/>
      <path class="b" d="M28 46 H44 V58 H28 Z"/>
      <path class="b" d="M58 42 L44 22 H70 L84 42 M58 62 L44 82 H70 L84 62"/>
      <path class="p" d="M96 42 V62 M150 42 V62 M190 42 V62 M100 46 H146 M100 58 H146"/>
      ${callout(232, 47, 250, 22, 'GEFECHTSKOPF')}
      ${callout(120, 62, 120, 84, 'TREIBSATZ')}
      ${dimH(28, 252, 98, 'L 3,2 M')}
      <text class="lbl" x="6" y="16">R1 · LENKFLUGKÖRPER</text>`;
  }
  if (kind === 'drone') {
    // Pioneer von oben: kompakter Kern, zwei Schalen, vier Steuerdüsen, vorn das Modul (Laser-Optik oder Schildkuppel)
    const sh = DRONE_SHOP[id].module === 'shield';
    g = `
      <path class="cl" d="M150 8 V100"/>
      <path class="b" d="M132 30 H168 L176 46 V74 L168 88 H132 L124 74 V46 Z"/>
      <path class="p" d="M124 40 C98 42 88 56 92 76 L108 80 L118 52 Z M176 40 C202 42 212 56 208 76 L192 80 L182 52 Z"/>
      <path class="b" d="M126 84 h8 v8 h-8 Z M166 84 h8 v8 h-8 Z M116 34 h8 v8 h-8 Z M176 34 h8 v8 h-8 Z"/>
      ${sh ? '<path class="c" d="M138 30 A12 12 0 0 1 162 30 Z"/><path class="p" d="M142 22 A8 8 0 0 1 158 22"/>' : '<path class="c" d="M146 12 H154 V30 H146 Z"/><path class="p" d="M150 12 V4"/>'}
      ${callout(sh ? 162 : 154, sh ? 24 : 16, 222, 14, sh ? 'SCHILDKUPPEL' : 'LASEROPTIK')}
      ${callout(208, 70, 230, 92, 'SCHALE')}
      ${callout(126, 88, 80, 100, 'DÜSEN ×4', 'end')}
      ${dimH(92, 208, 104, 'B 0,8 M')}
      <text class="lbl" x="6" y="16">PIONEER · ${sh ? 'SCHILD' : 'LASER'}</text>`;
  }
  if (mini) return `<svg class="sx-mini${kind === 'laser' ? ' is-l' : ''}" viewBox="${MINI_VB[kind]}"${style} aria-hidden="true">${g.replace(/<text[^>]*>[^<]*<\/text>/g, '')}</svg>`;
  // zweite Zeile: Nebenansicht links, Klassenvergleich rechts (echte Werte aus data.js)
  g += `<path class="cl" d="M6 110 H294"/>` + itemSub(kind, id);
  return `<svg class="sx-schem sx-item-svg" viewBox="0 0 300 198" preserveAspectRatio="xMidYMid meet"${style} aria-hidden="true">${g}</svg>`;
}

// Säulenvergleich: list = [[Beschriftung, Wert, aktiv, Anzeige]], Skala = max
function bars(x0, title, list, max) {
  const n = list.length, w = Math.min(22, 128 / n - 6), gap = (142 - n * w) / Math.max(1, n - 1);
  let o = `<text class="lbl" x="${x0}" y="124">${title}</text><path class="p" d="M${x0 - 4} 178 H${x0 + 146}"/>`;
  list.forEach(([lab, v, on, show], i) => {
    const x = x0 + i * (w + gap), h = Math.max(2, (v / max) * 40);
    o += `<path class="${on ? 'c' : 'b'}" d="M${x.toFixed(1)} 178 V${(178 - h).toFixed(1)} H${(x + w).toFixed(1)} V178"/>`;
    o += `<text class="lbl c${on ? ' on' : ''}" x="${(x + w / 2).toFixed(1)}" y="${(174 - h).toFixed(1)}">${show}</text>`;
    o += `<text class="lbl c${on ? ' on' : ''}" x="${(x + w / 2).toFixed(1)}" y="190">${lab}</text>`;
  });
  return o;
}
function itemSub(kind, id) {
  if (kind === 'laser') {
    const tier = LASER_TIER[id];
    let rings = '';
    for (let i = 1; i <= tier; i++) rings += `<circle class="p" cx="64" cy="152" r="${6 + i * 3.4}"/>`;
    const list = Object.keys(LASERS).map((k) => [ROMAN[LASER_TIER[k]], LASERS[k].damage, k === id, fmt(LASERS[k].damage)]);
    return `<text class="lbl" x="6" y="124">ANSICHT A</text>
      <path class="cl" d="M64 120 V186 M28 152 H100"/>
      <path class="b" d="M42 130 H86 L92 136 V168 L86 174 H42 L36 168 V136 Z"/>
      <path class="p" d="M44 124 H84 V130 H44 Z"/>
      ${rings}<circle class="a" cx="64" cy="152" r="5"/>
      ${dimV(104, 130, 174, '0,6')}
      ${bars(150, 'SCHADEN JE KLASSE', list, 200)}`;
  }
  if (kind === 'gen') {
    const d = GENERATORS[id];
    const sh = d.kind === 'shield';
    const list = [];
    for (let n = 1; n <= 5; n++) list.push([n + ' G', d.value * n, n === 1, (sh ? '' : '+') + fmt(d.value * n)]);
    const core = sh
      ? '<circle class="c" cx="64" cy="152" r="11"/><circle class="b" cx="64" cy="152" r="4"/>'
      : '<path class="c" d="M50 144 L82 148 V156 L50 160 Z"/>';
    return `<text class="lbl" x="6" y="124">ANSICHT OBEN</text>
      <path class="cl" d="M64 126 V182 M18 152 H110"/>
      <path class="b" d="M26 136 H96 L102 142 V168 H26 Z"/>
      <path class="p" d="M34 136 V168 M94 142 V168 M26 162 H102"/>${core}
      ${dimV(112, 136, 168, '0,6')}
      ${bars(150, sh ? 'SCHILD BEI N GENERATOREN' : 'TEMPO BEI N GENERATOREN', list, d.value * 5)}`;
  }
  if (kind === 'ammo') {
    const list = Object.keys(AMMO).map((k) => [k, AMMO[k].mult, k === id, '×' + AMMO[k].mult]);
    return `<text class="lbl" x="6" y="124">ANSICHT OBEN</text>
      <path class="cl" d="M64 122 V184 M30 152 H98"/>
      <circle class="b" cx="64" cy="152" r="22"/><circle class="p" cx="64" cy="152" r="16"/>
      <circle class="c hatch" cx="64" cy="152" r="${(6 + Math.min(6, AMMO[id].mult) * 1.6).toFixed(1)}"/>
      ${dimH(42, 86, 188, 'Ø 0,1')}
      ${bars(150, 'SCHADENSFAKTOR', list, 6)}`;
  }
  const list = [['R1', ROCKETS.R1.damage, true, fmt(ROCKETS.R1.damage)]].concat(Object.keys(LASERS).map((k) => [ROMAN[LASER_TIER[k]], LASERS[k].damage, false, fmt(LASERS[k].damage)]));
  return `<text class="lbl" x="6" y="124">ANSICHT A</text>
    <path class="cl" d="M64 122 V184 M30 152 H98"/>
    <path class="b" d="M64 128 V176 M40 152 H88"/>
    <circle class="b" cx="64" cy="152" r="9"/><circle class="c" cx="64" cy="152" r="4"/>
    ${dimH(40, 88, 188, 'SPANNWEITE 0,9')}
    ${bars(150, 'SCHADEN JE TREFFER', list, 1000)}`;
}

function curLabel(c, cls = '') {
  if (!c) return '';
  return `<i class="sx-cur${c === 'tritium' ? ' is-tri' : ''}${cls}">${CUR[c]}</i>`;
}
function signed(n) {
  if (n > 0) return '+' + fmt(n);
  if (n < 0) return '−' + fmt(-n);
  return '±0';
}
function clock() {
  const d = new Date();
  const p2 = (n) => (n < 10 ? '0' : '') + n;
  return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

export class StationUI {
  constructor(root, bus, world) {
    this.root = root;
    this.bus = bus;
    this.world = world || null;
    this.tab = 'hangar';
    this.sel = { kind: 'laser', index: 0 };
    this.pick = null;          // { kind, id } im Shop
    this.qty = {};             // Packungen je Munition/Rakete
    this.receipt = null;       // letzte Transaktion im Shop
    this.sale = null;          // letzter Erzverkauf
    this.isOpen = false;
    this._sig = '';
    this._shown = { credits: null, tritium: null };
    this._anim = 0;
    this._timer = 0;
    this.bay = null;           // 3D-Hangar (lazy)
    this.view = readView();    // 'werft' | 'plan'
    this._rcTimer = 0;

    const el = document.createElement('div');
    el.className = 'sx';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Station');
    el.innerHTML = `
      <div class="sx-term ls-panel">
        <i class="ls-corners"></i>
        <div class="sx-scan"></div>
        <header class="sx-top">
          <div class="sx-id">
            <div class="sx-id-code"><span data-r="code">DOCK</span></div>
            <div class="sx-id-name" data-r="name">Station</div>
            <div class="sx-id-sub" data-r="sub"></div>
          </div>
          <nav class="sx-tabs" role="tablist">
            <button class="sx-tab" type="button" role="tab" data-act="tab" data-tab="hangar"><span class="sx-tab-no">01</span><span class="sx-tab-t">Hangar</span><span class="sx-tab-v" data-r="tv-hangar"></span><span class="ls-key">1</span></button>
            <button class="sx-tab" type="button" role="tab" data-act="tab" data-tab="shop"><span class="sx-tab-no">02</span><span class="sx-tab-t">Shop</span><span class="sx-tab-v" data-r="tv-shop"></span><span class="ls-key">2</span></button>
            <button class="sx-tab" type="button" role="tab" data-act="tab" data-tab="ore"><span class="sx-tab-no">03</span><span class="sx-tab-t">Erz</span><span class="sx-tab-v" data-r="tv-ore"></span><span class="ls-key">3</span></button>
          </nav>
          <div class="sx-wallet">
            <div class="sx-coin"><span class="ls-label">Credits</span><b class="ls-num" data-r="cr">0</b><span class="sx-dl" data-r="dcr"></span></div>
            <div class="sx-coin is-tri"><span class="ls-label">Tritium</span><b class="ls-num" data-r="tri">0</b><span class="sx-dl" data-r="dtri"></span></div>
          </div>
          <button class="ls-btn sx-undock" type="button" data-act="undock"><span class="ls-key">E</span>Abdocken</button>
        </header>
        <div class="sx-body" data-r="body"></div>
        <footer class="sx-foot">
          <span class="sx-foot-t ls-num" data-r="logt">00:00:00</span>
          <span class="sx-foot-src" data-r="logsrc">DOCK</span>
          <span class="sx-foot-msg" data-r="log" aria-live="polite"></span>
          <span class="ls-spacer"></span>
          <span class="sx-foot-keys"><span class="ls-key">Esc</span>Abdocken<span class="ls-key">1</span><span class="ls-key">2</span><span class="ls-key">3</span>Reiter<span class="ls-key">↑</span><span class="ls-key">↓</span>Auswahl</span>
          <span class="sx-foot-clock ls-num" data-r="clock">00:00:00</span>
        </footer>
      </div>`;
    root.appendChild(el);
    this.el = el;
    const q = (r) => el.querySelector(`[data-r="${r}"]`);
    this.term = el.querySelector('.sx-term');
    this.body = q('body');
    this.codeEl = q('code');
    this.nameEl = q('name');
    this.subEl = q('sub');
    this.crEl = q('cr');
    this.triEl = q('tri');
    this.dcrEl = q('dcr');
    this.dtriEl = q('dtri');
    this.logEl = q('log');
    this.logTEl = q('logt');
    this.logSrcEl = q('logsrc');
    this.clockEl = q('clock');
    this.tvEls = { hangar: q('tv-hangar'), shop: q('tv-shop'), ore: q('tv-ore') };
    this.tabBtns = [...el.querySelectorAll('[data-act="tab"]')];

    this._stop = (e) => e.stopPropagation();
    for (const t of ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu']) el.addEventListener(t, this._stop);
    el.addEventListener('wheel', this._stop, { passive: true });
    this._onClick = (e) => this._click(e);
    el.addEventListener('click', this._onClick);

    // Tasten vor Eingabe und HUD abfangen, solange das Terminal offen ist
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);

    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { this._layoutBay(); this._queueLeaders(); }) : null;
    this._leaderRaf = 0;
    this._scrollRaf = 0;
    this._onListScroll = () => {
      if (this._scrollRaf) return;
      this._scrollRaf = requestAnimationFrame(() => { this._scrollRaf = 0; this._syncCats(); });
    };

    this._offs = [
      bus.on('docked', () => this.open()),
      bus.on('undocked', () => this.close()),
      bus.on('profile', () => { if (this.isOpen) this.render(); }),
      bus.on('message', (m) => { if (this.isOpen && m && m.text) this.log(m.text, m.kind); }),
      bus.on('playerDead', () => this.close()),
      bus.on('toHub', () => this.dispose()),
    ];

    if (this.world && this.world.docked) this.open();
    // Hangar und Schiffsmodell im Hintergrund vorbereiten, solange der Pilot noch anfliegt
    this._preT = setTimeout(() => {
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
      idle(() => { if (this._offs.length && SHARED.bay === null) { SHARED.bay = new HangarBay(); if (!SHARED.bay.ok) SHARED.bay = false; } });
    }, 1200);
  }

  // ---------- öffentliche API ----------
  setWorld(world) {
    this.world = world || null;
    if (this.world && this.world.docked) this.open();
    else this.close();
  }

  open() {
    if (!this.world) return;
    const first = !this.isOpen;
    this.isOpen = true;
    this.el.classList.add('open');
    document.body.classList.add('is-docked');
    if (first) {
      const s = this.world.sector;
      const p = this.world.profile;
      const f = p && FACTIONS[p.faction];
      const stName = stationNameOf(this.world);
      const voice = stationVoiceOf(this.world);
      this._voice = voice.toUpperCase();
      this._berth = berthOf(p && p.callsign);
      this.codeEl.textContent = 'DOCK·' + (s ? s.id : '--') + '  LIEGEPLATZ ' + this._berth;
      this.nameEl.textContent = stName;
      this.subEl.textContent = (f ? f.name + ' · ' + f.title : '') + ' · Sektor ' + (s ? s.name : '') + ' · Sichere Zone';
      const ml = logOf(MOUNT_LOG, p.callsign);
      const lo = p.loadout || { lasers: [], gens: [] };
      const sh = SHIPS[p.ship] || SHIPS.s1;
      ml.unshift({ t: clock(), a: 'Angedockt', s: 'L ' + lo.lasers.length + '/' + sh.laserSlots + ' · G ' + lo.gens.length + '/' + sh.genSlots, d: 'Klammern fest, Ausrüstung geprüft' });
      if (ml.length > 12) ml.length = 12;
      this.logSrcEl.textContent = this._voice;
      this.log('Andockklammern fest. Liegeplatz ' + this._berth + ' zugewiesen, ' + (p && p.callsign ? p.callsign : 'Pilot') + '.');
      this._sig = '';
      this._shown.credits = null;
      this._shown.tritium = null;
      this.receipt = null;
      this.sale = null;
      this.term.classList.remove('ls-enter');
      void this.term.offsetWidth;
      this.term.classList.add('ls-enter');
      this.clockEl.textContent = clock();
      this._timer = setInterval(() => { this.clockEl.textContent = clock(); }, 1000);
    }
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('open');
    document.body.classList.remove('is-docked');
    clearInterval(this._timer);
    this._timer = 0;
    clearTimeout(this._rcTimer);
    if (this._ro) this._ro.disconnect();
    if (this.bay) this.bay.stop();
  }

  // Funkzeile unten (letzte Meldung)
  log(text, kind) {
    this.logTEl.textContent = clock();
    // Serienbezeichnungen aus den Spieldaten durch Klassennamen ersetzen
    for (const id in SHIP_CLASS) if (id !== 's1' && SHIPS[id] && text.includes(SHIPS[id].name)) text = text.split(SHIPS[id].name).join(shipLabel(id));
    // Kaufmeldung als Buchungszeile: „ION LASER GEKAUFT · −15.000 CR“
    const m = /^(.*?)[.!]?(?:\s+\d+ Laserplätze.*?)?\s*\(\s*[−-]\s*([\d.]+)\s*(Credits|Tritium)\)\s*$/.exec(text);
    if (m) text = m[1].toUpperCase() + ' · −' + m[2] + (m[3] === 'Tritium' ? ' TRI' : ' CR');
    this.logEl.textContent = text;
    this.logEl.className = 'sx-foot-msg' + (kind === 'warn' ? ' is-warn' : kind === 'loot' ? ' is-loot' : '');
    this.logEl.classList.remove('is-new');
    void this.logEl.offsetWidth;
    this.logEl.classList.add('is-new');
  }

  // alte Schnittstelle
  note(text) { this.log(text); }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    clearTimeout(this._preT);
    window.removeEventListener('keydown', this._onKey, true);
    clearInterval(this._timer);
    cancelAnimationFrame(this._anim);
    cancelAnimationFrame(this._leaderRaf);
    cancelAnimationFrame(this._scrollRaf);
    if (this._ro) this._ro.disconnect();
    clearTimeout(this._rcTimer);
    if (this.bay) { this.bay.stop(); this.bay.onProject = null; this.bay.onChange = null; this.bay = null; }
    document.body.classList.remove('is-docked');
    this.el.remove();
  }

  // ---------- Tastatur ----------
  _key(e) {
    if (!this.isOpen || !this.world || !this.world.docked) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    let handled = true;
    switch (e.code) {
      case 'Escape':
      case 'KeyE':
        if (!e.repeat) this.world.undock();
        break;
      case 'Digit1': this._setTab('hangar'); break;
      case 'Digit2': this._setTab('shop'); break;
      case 'Digit3': this._setTab('ore'); break;
      case 'ArrowDown':
      case 'ArrowUp':
        if (this.tab === 'shop') this._stepPick(e.code === 'ArrowDown' ? 1 : -1);
        else if (this.tab === 'hangar') this._stepSlot(e.code === 'ArrowDown' ? 1 : -1);
        else handled = false;
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (this.tab === 'hangar') {
          const kind = e.code === 'ArrowLeft' ? 'laser' : 'gen';
          if (this.sel.kind !== kind) { this.sel.kind = kind; this.sel.index = 0; this.render(true); }
        } else handled = false;
        break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); e.stopPropagation(); }
    else if (e.code === 'Space' || e.code.startsWith('Digit') || e.code === 'KeyR' || e.code === 'KeyJ' || e.code === 'Tab') {
      // Kampftasten haben in der Station keine Wirkung
      e.stopPropagation();
    }
  }

  // Einblend-Wischer nur beim Reiterwechsel, nicht bei jeder Wertänderung
  _takeEnter() {
    const on = this._enter;
    this._enter = false;
    return on ? ' ls-enter' : '';
  }

  _setTab(tab) {
    if (this.tab === tab) return;
    this.tab = tab;
    if (tab !== 'hangar' && this.bay) this.bay.stop();
    this._enter = true;
    this.body.scrollTop = 0;
    this.render(true);
  }

  // ---------- Zeichnen ----------
  render(force) {
    const w = this.world;
    const p = w && w.profile;
    if (!p) return;
    this._wallet(p);
    for (const b of this.tabBtns) {
      const on = b.dataset.tab === this.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    const ship = SHIPS[p.ship] || SHIPS.s1;
    const lo = p.loadout || { lasers: [], gens: [] };
    this.tvEls.hangar.textContent = `L ${lo.lasers.length}/${ship.laserSlots} · G ${lo.gens.length}/${ship.genSlots}`;
    this.tvEls.shop.textContent = `${CATS.reduce((n, c) => n + c.items.length, 0)} Artikel`;
    this.tvEls.ore.textContent = `${fmt(cargoUsed(p))}/${fmt(ship.cargo)}`;

    const sig = this.tab + '|' + JSON.stringify([p.credits, p.tritium, p.level, p.ship, lo, p.owned, p.ammo, p.cargo]) + '|' +
      JSON.stringify([this.sel, this.pick, this.qty, this.receipt && this.receipt.t, this.sale && this.sale.t]);
    if (this.tab !== 'hangar' && this.bay) this.bay.stop();
    if (!force && sig === this._sig) return;
    this._sig = sig;

    if (this.tab === 'shop') this._renderShop(p);
    else if (this.tab === 'ore') this._renderOre(p);
    else this._renderHangar(p);
  }

  _wallet(p) {
    const to = { credits: p.credits || 0, tritium: p.tritium || 0 };
    const from = { credits: this._shown.credits, tritium: this._shown.tritium };
    if (from.credits == null) {
      this._shown.credits = to.credits; this._shown.tritium = to.tritium;
      this.crEl.textContent = fmt(to.credits);
      this.triEl.textContent = fmt(to.tritium);
      return;
    }
    if (from.credits === to.credits && from.tritium === to.tritium) return;
    this._delta(this.dcrEl, to.credits - from.credits);
    this._delta(this.dtriEl, to.tritium - from.tritium);
    cancelAnimationFrame(this._anim);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t0 = performance.now();
    const dur = reduce ? 0 : 520;
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      const c = Math.round(from.credits + (to.credits - from.credits) * e);
      const t = Math.round(from.tritium + (to.tritium - from.tritium) * e);
      this.crEl.textContent = fmt(c);
      this.triEl.textContent = fmt(t);
      if (k < 1) this._anim = requestAnimationFrame(step);
    };
    this._shown.credits = to.credits;
    this._shown.tritium = to.tritium;
    this._anim = requestAnimationFrame(step);
  }

  _delta(el, d) {
    if (!d) return;
    el.textContent = signed(d);
    el.classList.toggle('is-up', d > 0);
    el.classList.remove('is-show');
    void el.offsetWidth;
    el.classList.add('is-show');
  }

  // ================= HANGAR =================
  // Eine WebGL-Fläche für alle Stationsbesuche der Seite (kein neuer Kontext pro Flug)
  _ensureBay() {
    if (this.bay === null) {
      if (SHARED.bay === null) { SHARED.bay = new HangarBay(); if (!SHARED.bay.ok) SHARED.bay = false; }
      this.bay = SHARED.bay;
      if (!this.bay) return null;
    }
    if (this.bay) {
      this.bay.onProject = () => this._placeHps();
      this.bay.onChange = () => { if (this.isOpen && this.tab === 'hangar') this.render(true); };
    }
    return this.bay || null;
  }

  _renderHangar(p) {
    const ship = SHIPS[p.ship] || SHIPS.s1;
    const lasers = p.loadout.lasers;
    const gens = p.loadout.gens;
    const maxI = this.sel.kind === 'laser' ? ship.laserSlots : ship.genSlots;
    if (this.sel.index >= maxI) this.sel.index = 0;
    const bay = this._ensureBay();
    const loading = !!(bay && bay.isLoading(p.faction, p.ship));
    if (bay) bay.hideShip = loading;
    const useImg = !bay && p.faction === 'saturn' && p.ship === 's1';
    const hpSet = useImg ? HP_IMG : ship.no >= 2 ? HP_SVG_BIG : HP_SVG;
    const fixHp = useImg ? (h) => h : svgHp;

    const slot = (kind, i) => {
      const id = (kind === 'laser' ? lasers : gens)[i];
      const d = id ? (kind === 'laser' ? LASERS[id] : GENERATORS[id]) : null;
      const on = this.sel.kind === kind && this.sel.index === i;
      const code = (kind === 'laser' ? 'L' : 'G') + (i + 1);
      let val = 'Platz leer';
      let pips = '';
      if (d && kind === 'laser') {
        val = fmt(d.damage) + U + 'SCH · KL ' + ROMAN[LASER_TIER[id]];
        for (let k = 1; k <= 4; k++) pips += `<i${k <= LASER_TIER[id] ? ' class="on"' : ''}></i>`;
      } else if (d) {
        val = genInfo(d);
        pips = `<i class="on"></i><i></i><i></i><i></i>`;
      }
      return `<button class="sx-slot${on ? ' is-sel' : ''}${d ? '' : ' is-empty'}" type="button" data-act="slot" data-kind="${kind}" data-i="${i}" aria-pressed="${on}">
        <span class="sx-slot-id">${code}</span>
        <span class="sx-slot-main"><span class="sx-slot-name">${d ? esc(d.name) : 'Frei'}</span><span class="sx-slot-val">${esc(val)}</span></span>
        <span class="sx-pips">${pips}</span>
      </button>`;
    };
    let lCol = '', gCol = '', hps = '';
    for (let i = 0; i < ship.laserSlots; i++) {
      lCol += slot('laser', i);
      const on = this.sel.kind === 'laser' && this.sel.index === i;
      const h = bay ? [-1, -1] : fixHp(hpSet.laser[i % hpSet.laser.length]);
      hps += `<i class="sx-hp${on ? ' is-sel' : ''}${lasers[i] ? '' : ' is-empty'}" data-k="laser" data-i="${i}" style="left:${(h[0] * 100).toFixed(2)}%;top:${(h[1] * 100).toFixed(2)}%"><b>L${i + 1}</b></i>`;
    }
    for (let i = 0; i < ship.genSlots; i++) {
      gCol += slot('gen', i);
      const on = this.sel.kind === 'gen' && this.sel.index === i;
      const h = bay ? [-1, -1] : fixHp(hpSet.gen[i % hpSet.gen.length]);
      hps += `<i class="sx-hp is-gen${on ? ' is-sel' : ''}${gens[i] ? '' : ' is-empty'}" data-k="gen" data-i="${i}" style="left:${(h[0] * 100).toFixed(2)}%;top:${(h[1] * 100).toFixed(2)}%"><b>G${i + 1}</b></i>`;
    }
    let center;
    if (bay) center = `<div class="sx-ship" data-r="shipcell">${loading ? `<div class="sx-load"><div class="sx-frame">${shipSvg(ship.no, false)}</div><span class="sx-load-t"><i></i>Modell wird geladen</span></div>` : ''}</div>`;
    else {
      const visual = useImg
        ? `<img class="sx-shipimg" src="${SATURN_IMG}" alt="" draggable="false" decoding="async">`
        : shipSvg(ship.no, false);
      center = `<div class="sx-ship"><div class="sx-frame${useImg ? ' is-img' : ''}">${visual}${hps}<i class="sx-br tl"></i><i class="sx-br tr"></i><i class="sx-br bl"></i><i class="sx-br br"></i></div></div>`;
    }

    // Werte
    let speedBonus = 0, shield = 0, dmg = 0;
    for (const g of gens) { const d = GENERATORS[g]; if (!d) continue; if (d.kind === 'speed') speedBonus += d.value; else shield += d.value; }
    for (const l of lasers) { const d = LASERS[l]; if (d) dmg += d.damage; }
    const used = cargoUsed(p);
    const maxDmg = ship.laserSlots * 200;
    const maxSpeed = ship.speed + ship.genSlots * 20;
    // Zustand (Hülle, Schild, Laderaum): voll = 100 %. Ausbau (Schaden, Tempo): Skala bis Vollausbau dieses Rahmens.
    const sheetRow = (label, val, unit, frac, cls = '', scale = '') => `
      <div class="sx-srow${scale ? ' is-cap' : ''}">
        <span class="ls-label">${label}</span><span class="sx-srow-v ls-num">${val}<small>${U}${unit}</small></span>
        <div class="ls-bar ${cls}" style="--v:${Math.max(0, Math.min(1, frac)).toFixed(3)};--trail:0"></div>
        ${scale ? `<div class="sx-srow-sc"><i class="ls-tick"></i><span>${scale}</span></div>` : ''}
      </div>`;
    const pl = this.world && this.world.player;
    const hpMax = pl && pl.hpMax ? pl.hpMax : ship.hp;
    const hpNow = pl && pl.hpMax ? Math.round(pl.hp) : ship.hp;
    const shMax = pl && pl.shieldMax ? pl.shieldMax : shield;
    const shNow = pl && pl.shieldMax ? Math.round(pl.shield) : shield;

    // Flotte
    const ownedShips = (p.owned && p.owned.ships) || [p.ship];
    let fleet = '';
    for (const id in SHIPS) {
      const s = SHIPS[id];
      const own = ownedShips.includes(id);
      if (!own && id !== 's2') continue;
      const act = p.ship === id;
      let r;
      if (act) r = '<span class="sx-fl-st is-on">Aktiv</span>';
      else if (own) r = `<button class="ls-btn sx-sm" type="button" data-act="buy" data-kind="ship" data-id="${id}">Wechseln</button>`;
      else r = `<button class="ls-btn sx-sm" type="button" data-act="goshop" data-kind="ship" data-id="${id}">${(p.level || 1) < s.level ? 'Ab Stufe ' + s.level : 'Im Shop'}</button>`;
      fleet += `<div class="sx-fl${act ? ' is-on' : ''}${own ? '' : ' is-off'}"><span class="sx-fl-name">${shipCode(id)}</span><span class="sx-fl-cls">${esc(shipClass(id))}</span><span class="sx-fl-d ls-num">${s.laserSlots}${U}L · ${s.genSlots}${U}G · ${fmt(s.hp)}${U}HP</span>${r}</div>`;
    }

    const viewSw = bay ? `<div class="sx-viewsw" role="group" aria-label="Ansicht"><span>Ansicht</span>
        <button type="button" class="sx-vbtn${this.view === 'werft' ? ' is-on' : ''}" data-act="view" data-v="werft" aria-pressed="${this.view === 'werft'}">Werftaufnahme</button>
        <button type="button" class="sx-vbtn${this.view === 'plan' ? ' is-on' : ''}" data-act="view" data-v="plan" aria-pressed="${this.view === 'plan'}">Draufsicht</button></div>`
      : `<div class="sx-tele sx-tele-bl"><span>Ansicht</span>${useImg ? 'Werftaufnahme' : 'Draufsicht · Bug links'}</div>`;

    this.body.innerHTML = `
      <div class="sx-hangar${this._takeEnter()}">
        <section class="sx-bay ls-panel"><i class="ls-corners"></i>
          <div class="ls-head"><span class="ls-code">HGR·${this._berth}</span><span class="ls-title">Ausrüstung · ${esc(shipLabel(p.ship))}</span><span class="ls-spacer"></span><span class="sx-head-r ls-num">L ${lasers.length}/${ship.laserSlots} · G ${gens.length}/${ship.genSlots}</span></div>
          <div class="sx-stage${bay ? ' is-3d' : ''}${bay && this.view === 'plan' ? ' is-plan' : ''}${loading ? ' is-loading' : ''}" data-r="stage">
            ${bay ? `<div class="sx-bay3d-host" data-r="bayhost"></div><div class="sx-hplayer">${hps}</div>` : ''}
            <svg class="sx-leaders" data-r="leaders" aria-hidden="true"></svg>
            <div class="sx-leg sx-leg-tr"><span>Rahmen</span><b>${esc(shipLabel(p.ship))}</b><span>Werft</span><b>${esc(this.nameEl.textContent)} · ${this._berth}</b></div>
            ${viewSw}
            <div class="sx-leg sx-leg-br"><span>Montage</span><b>${lasers.length + gens.length} / ${ship.laserSlots + ship.genSlots}</b><span>Abmessung</span><b data-r="dims">—</b></div>
            <div class="sx-col sx-col-l"><div class="sx-colhead"><span class="ls-label">Laser</span><span class="sx-colhead-v ls-num">${fmt(dmg)}${U}/S</span></div>${lCol}</div>
            ${center}
            <div class="sx-col sx-col-r"><div class="sx-colhead"><span class="ls-label">Generatoren</span><span class="sx-colhead-v ls-num">${fmt(shield)}${U}SH · +${fmt(speedBonus)}${U}M/S</span></div>${gCol}</div>
          </div>
          <div class="sx-fleet"><span class="ls-label">Flotte</span>${fleet}</div>
        </section>
        <aside class="sx-side">
          <section class="sx-sheet ls-panel"><i class="ls-corners"></i>
            <div class="ls-head"><span class="ls-code">SYS·02</span><span class="ls-title">Schiff</span><span class="ls-spacer"></span><span class="sx-head-r">${shipLabel(p.ship)}</span></div>
            <div class="sx-sheet-b">
              ${sheetRow('Hülle', fmt(hpNow) + ' / ' + fmt(hpMax), 'HP', hpMax ? hpNow / hpMax : 1)}
              ${sheetRow('Schild', fmt(shNow) + ' / ' + fmt(shMax), 'SH', shMax ? shNow / shMax : 0, 'is-shield')}
              ${sheetRow('Schaden', fmt(dmg), '/S', dmg / maxDmg, '', 'Vollausbau ' + fmt(maxDmg))}
              ${sheetRow('Tempo', fmt(ship.speed + speedBonus), 'M/S', (ship.speed + speedBonus) / maxSpeed, '', 'Vollausbau ' + fmt(maxSpeed))}
              ${sheetRow('Laderaum', fmt(used) + ' / ' + fmt(ship.cargo), 'E', used / ship.cargo)}
            </div>
          </section>
          <section class="sx-inv ls-panel"><i class="ls-corners"></i>${this._slotPanel(p, ship)}</section>
          <section class="sx-mlog ls-panel"><i class="ls-corners"></i>${this._mountLog(p)}</section>
        </aside>
      </div>`;

    const stage = this.body.querySelector('.sx-stage');
    if (this._ro) { this._ro.disconnect(); this._ro.observe(stage); }
    if (bay) {
      this.body.querySelector('[data-r="bayhost"]').appendChild(bay.canvas);
      bay.setMode(this.view);
      this._layoutBay();
      bay.setShip(p.faction, p.ship, p.loadout, false);
      const dm = this.body.querySelector('[data-r="dims"]');
      if (dm) dm.textContent = loading ? 'L — · B —' : 'L ' + dec1(bay.dims.l) + U + 'M × B ' + dec1(bay.dims.b) + U + 'M';
      bay.start();
    }
    const img = stage.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', () => this._queueLeaders(), { once: true });
    this._queueLeaders();
  }

  // Zeichenfläche des 3D-Hangars an die Bühne anpassen, Schiff in die Mittelspalte setzen
  _layoutBay() {
    const bay = this.bay;
    if (!bay || this.tab !== 'hangar' || !this.isOpen) return;
    const stage = this.body.querySelector('.sx-stage');
    const cell = this.body.querySelector('[data-r="shipcell"]');
    if (!stage || !cell) return;
    const sr = stage.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();
    if (!sr.width || !sr.height) return;
    bay.resize(sr.width, sr.height, {
      cx: (cr.left + cr.width / 2 - sr.left) / sr.width,
      cy: (cr.top + cr.height * 0.52 - sr.top) / sr.height,
      w: (cr.width / sr.width) * 1.02,
      h: (cr.height / sr.height) * 0.98,
    });
  }

  // Montagepunkte aus dem 3D-Modell übernehmen (nur nach Aufbau oder Größenänderung)
  _placeHps() {
    const bay = this.bay;
    if (!bay || this.tab !== 'hangar') return;
    const pt = this._pt || (this._pt = { x: 0, y: 0 });
    for (const el of this.body.querySelectorAll('.sx-hplayer .sx-hp')) {
      if (!bay.project(el.dataset.k, +el.dataset.i, pt)) continue;
      const l = (pt.x * 100).toFixed(2) + '%', t = (pt.y * 100).toFixed(2) + '%';
      if (el.style.left !== l) el.style.left = l;
      if (el.style.top !== t) el.style.top = t;
    }
    this._queueLeaders();
  }

  _mountLog(p) {
    const ml = logOf(MOUNT_LOG, p.callsign);
    let rows = '';
    const n = Math.min(5, ml.length);
    for (let i = 0; i < n; i++) {
      const e = ml[i];
      rows += `<div class="sx-ml${i === 0 ? ' is-new' : ''}"><span class="ls-num">${e.t}</span><span class="sx-ml-a">${esc(e.a)}</span><span class="sx-ml-s">${esc(e.s)}</span><span class="sx-ml-d">${esc(e.d)}</span></div>`;
    }
    if (!n) rows = `<div class="sx-void">Keine Montage in dieser Sitzung</div>`;
    return `<div class="ls-head"><span class="ls-code">LOG·03</span><span class="ls-title">Montage-Protokoll</span><span class="ls-spacer"></span><span class="sx-head-r">${ml.length} ${ml.length === 1 ? 'Eintrag' : 'Einträge'}</span></div>
      <div class="sx-ml-b">${rows}</div>`;
  }

  _logMount(a, slot, d) {
    const p = this.world && this.world.profile;
    if (!p) return;
    const ml = logOf(MOUNT_LOG, p.callsign);
    ml.unshift({ t: clock(), a, s: slot, d });
    if (ml.length > 12) ml.length = 12;
  }

  _slotPanel(p, ship) {
    const kind = this.sel.kind;
    const i = this.sel.index;
    const arr = kind === 'laser' ? p.loadout.lasers : p.loadout.gens;
    const inv = (kind === 'laser' ? p.owned.lasers : p.owned.gens) || [];
    const cur = arr[i];
    const cd = cur ? (kind === 'laser' ? LASERS[cur] : GENERATORS[cur]) : null;
    const code = (kind === 'laser' ? 'L' : 'G') + (i + 1);
    const scaleOf = (d) => (kind === 'laser' ? 200 : d.kind === 'shield' ? 2000 : 20);
    const valv = (d) => (kind === 'laser' ? d.damage : d.value);

    // Lager zusammenfassen: gleiche Teile als eine Zeile mit Anzahl, Vergleichsbalken zum eingebauten Teil
    const counts = {};
    for (const id of inv) counts[id] = (counts[id] || 0) + 1;
    let rows = '';
    const ids = Object.keys(counts).sort((a, b) => valOf(kind, b) - valOf(kind, a));
    for (const id of ids) {
      const d = kind === 'laser' ? LASERS[id] : GENERATORS[id];
      if (!d) continue;
      let delta = '', dcls = '', ref = 0;
      if (kind === 'laser') {
        const v = d.damage - (cd ? cd.damage : 0);
        ref = cd ? cd.damage : 0;
        delta = signed(v) + U + 'SCH'; dcls = v > 0 ? 'is-up' : v < 0 ? 'is-dn' : '';
      } else {
        const same = cd && cd.kind === d.kind;
        ref = same ? cd.value : 0;
        const v = d.value - ref;
        delta = signed(v) + U + (d.kind === 'shield' ? 'SH' : 'M/S'); dcls = v > 0 ? 'is-up' : v < 0 ? 'is-dn' : '';
      }
      const sc = scaleOf(d);
      rows += `<div class="sx-invrow">
        <span class="sx-invrow-n">${esc(d.name)}${counts[id] > 1 ? `<small>×${counts[id]}</small>` : ''}</span>
        <span class="sx-cmp ${dcls}">${delta}</span>
        <button class="ls-btn sx-sm${cur ? '' : ' is-fx'}" type="button" data-act="equip" data-kind="${kind}" data-id="${esc(id)}" data-i="${i}">${cur ? 'Tauschen' : 'Einbauen'}</button>
        <div class="sx-invbar"><div class="ls-bar" style="--v:${Math.min(1, valv(d) / sc).toFixed(3)};--trail:0"></div><i style="left:${(Math.min(1, ref / sc) * 100).toFixed(1)}%"></i></div>
      </div>`;
    }
    if (!rows) rows = `<div class="sx-none"><span>Lager ${inv.length}</span><i></i><span>${inv.length ? 'kein passendes Teil' : 'kein Teil'}</span></div>`;
    // nächstes besseres Teil aus dem Katalog für diesen Platz: gleicher Typ zuerst, sonst ehrlich als anderer Typ
    let up = '', upLabel = kind === 'laser' ? 'Nächste Stufe' : 'Einbau möglich';
    let cand = kind === 'laser'
      ? Object.keys(LASERS).filter((x) => !LASERS[x].dropOnly && LASERS[x].damage > (cd ? cd.damage : 0))
      : Object.keys(GENERATORS).filter((x) => !cd || (GENERATORS[x].kind === cd.kind && GENERATORS[x].value > cd.value));
    if (kind === 'gen' && cd && cand.length) upLabel = 'Nächste Stufe';
    if (kind === 'gen' && cd && !cand.length) {
      cand = Object.keys(GENERATORS).filter((x) => GENERATORS[x].kind !== cd.kind);
      upLabel = 'Anderer Typ';
    }
    if (cand.length) {
      const uid = cand[0];
      const ud = kind === 'laser' ? LASERS[uid] : GENERATORS[uid];
      const pr = priceFor(kind, uid, this.world);
      const delta = kind === 'laser' ? signed(ud.damage - (cd ? cd.damage : 0)) + U + 'SCH' : genInfo(ud);
      const can = pr && pr.currency && (p[pr.currency] || 0) >= pr.amount;
      up = `<div class="sx-up">
        <div class="sx-up-h"><span class="ls-label${upLabel === 'Anderer Typ' ? ' is-x' : ''}">${upLabel}</span><span class="sx-cmp${upLabel === 'Anderer Typ' ? '' : ' is-up'}">${delta}</span></div>
        <div class="sx-up-r"><span class="sx-up-c">${codeOf(kind, uid)}</span><span class="sx-up-n">${esc(ud.name)}</span>
          <span class="sx-up-p"><b class="ls-num${pr.currency === 'tritium' ? ' is-tri' : ''}">${fmt(pr.amount)}</b>${curLabel(pr.currency)}</span></div>
        <button class="ls-btn sx-sm${can ? ' is-fx' : ''}" type="button" data-act="goshop" data-kind="${kind}" data-id="${uid}">Im Shop ansehen</button>
      </div>`;
    }
    return `
      <div class="ls-head"><span class="ls-code">PLATZ·${code}</span><span class="ls-title">${kind === 'laser' ? 'Laserplatz' : 'Generatorplatz'}</span><span class="ls-spacer"></span><span class="sx-head-r">${i + 1} / ${kind === 'laser' ? ship.laserSlots : ship.genSlots}</span></div>
      <div class="sx-inv-b">
        <div class="sx-cur-slot">
          <span class="ls-label">Eingebaut</span>
          <div class="sx-cur-row">
            <span class="sx-cur-name">${cd ? esc(cd.name) : 'Platz frei'}</span>
            <span class="sx-cur-v ls-num">${cd ? (kind === 'laser' ? fmt(cd.damage) + U + 'SCH' : esc(genInfo(cd))) : '—'}</span>
            ${cd ? `<button class="ls-btn sx-sm" type="button" data-act="unequip" data-kind="${kind}" data-i="${i}">Ausbauen</button>` : ''}
          </div>
          ${cd ? `<div class="ls-bar sx-cur-bar" style="--v:${(valv(cd) / scaleOf(cd)).toFixed(3)};--trail:0"></div>` : ''}
        </div>
        <div class="sx-inv-h"><span class="ls-label">Lager · passend</span><span class="sx-inv-c ls-num">${inv.length} ${inv.length === 1 ? 'Teil' : 'Teile'}</span></div>
        <div class="sx-invlist">${rows}</div>
        ${up}
      </div>`;
  }

  _queueLeaders() {
    if (this._leaderRaf || this.tab !== 'hangar' || !this.isOpen) return;
    this._leaderRaf = requestAnimationFrame(() => { this._leaderRaf = 0; this._drawLeaders(); });
  }

  // Führungslinien Platz → Montagepunkt (nur bei Zeichnen/Größenänderung)
  _drawLeaders() {
    const stage = this.body.querySelector('.sx-stage');
    if (!stage) return;
    const svg = stage.querySelector('.sx-leaders');
    const sr = stage.getBoundingClientRect();
    if (!sr.width) return;
    if (stage.classList.contains('is-loading')) { svg.innerHTML = ''; return; }
    let d = '', dOn = '', marks = '';
    for (const s of stage.querySelectorAll('.sx-slot')) {
      const kind = s.dataset.kind, i = s.dataset.i;
      const hp = stage.querySelector(`.sx-hp[data-k="${kind}"][data-i="${i}"]`);
      if (!hp) continue;
      const a = s.getBoundingClientRect();
      const b = hp.getBoundingClientRect();
      const left = kind === 'laser';
      const x1 = Math.round((left ? a.right : a.left) - sr.left) + 0.5;
      const y1 = Math.round(a.top + a.height / 2 - sr.top) + 0.5;
      const x2 = Math.round(b.left + b.width / 2 - sr.left) + 0.5;
      const y2 = Math.round(b.top + b.height / 2 - sr.top) + 0.5;
      // rechtwinklig mit einem Knick: waagerecht bis über den Punkt, dann senkrecht ran (endet 7 px vor der Mitte)
      const dy = y2 - y1;
      const path = Math.abs(dy) < 8 ? `M${x1} ${y1}H${x2 + (left ? -7 : 7)}` : `M${x1} ${y1}H${x2}V${y2 - Math.sign(dy) * 7}`;
      if (s.classList.contains('is-sel')) dOn += path; else d += path;
      marks += `<rect x="${x1 - (left ? 0 : 3)}" y="${y1 - 1.5}" width="3" height="3"/>`;
    }
    svg.setAttribute('viewBox', `0 0 ${Math.round(sr.width)} ${Math.round(sr.height)}`);
    svg.innerHTML = `<path class="ld" d="${d}"/><path class="ld is-on" d="${dOn}"/><g class="lm">${marks}</g>`;
  }

  _stepSlot(dir) {
    const p = this.world.profile;
    const ship = SHIPS[p.ship] || SHIPS.s1;
    const n = this.sel.kind === 'laser' ? ship.laserSlots : ship.genSlots;
    this.sel.index = (this.sel.index + dir + n) % n;
    this.render(true);
  }

  // ================= SHOP =================
  _info(kind, id, n = 1) {
    const w = this.world;
    if (w && typeof w.shopInfo === 'function') return w.shopInfo(kind, id, n);
    const p = w.profile;
    const d = tableOf(kind)[id];
    const pr = priceFor(kind, id, w);
    const cost = pr ? pr.amount * n : 0;
    const info = { kind, id, name: d.name, cost, currency: pr && pr.currency, pack: pr ? pr.qty : 1, level: d.level || 1, ok: false, reason: '' };
    if (d.dropOnly) info.reason = 'Nur als seltene Beute zu finden, nicht kaufbar.';
    else if (d.locked) info.reason = `Kommt später (ab Stufe ${info.level}).`;
    else if ((p.level || 1) < info.level) info.reason = `Stufe ${info.level} nötig (du hast Stufe ${p.level}).`;
    else if (info.currency && (p[info.currency] || 0) < cost) info.reason = `Zu wenig ${CUR[info.currency]}.`;
    else info.ok = true;
    return info;
  }

  _defaultPick(p) {
    return { kind: 'laser', id: nextLaser(p) };
  }

  _renderShop(p) {
    if (!this.pick || !tableOf(this.pick.kind)[this.pick.id]) this.pick = this._defaultPick(p);
    const list = this.body.querySelector('.sx-list');
    const keep = list ? list.scrollTop : 0;
    let rows = '';
    let rail = '';
    for (const c of CATS) {
      rail += `<button class="sx-cat" type="button" data-act="cat" data-cat="${c.id}"><span class="sx-cat-no">${c.no}</span><span class="sx-cat-n">${c.name}</span><span class="sx-cat-c ls-num">${c.items.length}</span>${catStat(p, c.id)}</button>`;
      let sc = '';
      for (const id of c.items) sc += `<b${ownsAny(p, c.id, id) ? ' class="on"' : ''}></b>`;
      rows += `<div class="sx-grp" data-grp="${c.id}"><span class="sx-grp-no">${c.no}</span><span class="sx-grp-n">${c.name}</span><span class="sx-grp-sc" title="Im Besitz">${sc}</span><i></i><span class="sx-grp-c ls-num">${String(c.items.length).padStart(2, '0')} Typen</span></div>`;
      for (const id of c.items) rows += this._row(p, c.id, id);
    }
    this.body.innerHTML = `
      <div class="sx-shop${this._takeEnter()}">
        <nav class="sx-rail ls-panel"><i class="ls-corners"></i>
          <div class="ls-head"><span class="ls-code">KAT</span><span class="ls-title">Kategorien</span></div>
          <div class="sx-rail-b">${rail}</div>
          <div class="sx-stock">${stockBlock(p)}</div>
          <div class="sx-rail-foot">
            <div class="sx-rf"><span class="ls-label">Stufe</span><b class="ls-num">${fmt(p.level)}</b></div>
            <div class="sx-rf"><span class="ls-label">Rang</span><b>${esc(rankFor(p.level))}</b></div>
            <div class="ls-tick"></div>
            ${nextUnlock(p)}
          </div>
        </nav>
        <section class="sx-cat-panel ls-panel"><i class="ls-corners"></i>
          <div class="ls-head"><span class="ls-code">HDL·${this._berth}</span><span class="ls-title">Katalog · ${esc(this.nameEl.textContent)}</span><span class="ls-spacer"></span><span class="sx-head-r">Preise je Stück · Munition je Packung</span></div>
          <div class="sx-thead"><span>Schema</span><span>Bezeichnung · Klasse</span><span>Leistung</span><span>Vergleich</span><span class="r">Preis</span><span class="r">Status</span></div>
          <div class="sx-list" data-r="list">${rows}</div>
        </section>
        <aside class="sx-detail ls-panel" data-r="detail"><i class="ls-corners"></i>${this._detail(p)}</aside>
      </div>`;
    const nl = this.body.querySelector('.sx-list');
    nl.scrollTop = keep;
    nl.addEventListener('scroll', this._onListScroll, { passive: true });
    this._syncCats();
  }

  _row(p, kind, id) {
    const d = tableOf(kind)[id];
    const st = this._status(p, kind, id);
    const on = this.pick && this.pick.kind === kind && this.pick.id === id;
    const cmp = this._cmp(p, kind, id);
    const pr = priceFor(kind, id, this.world);
    let price;
    if (d.dropOnly || pr == null || pr.amount == null) price = '<span class="sx-dash">—</span>';
    else if (kind === 'ship' && !pr.amount) price = '<span class="sx-dash">Serie</span>';
    else price = `<span class="ls-num${pr.currency === 'tritium' ? ' is-tri' : ''}">${fmt(pr.amount)}</span>${curLabel(pr.currency)}`;
    let name = esc(d.name);
    let sub = '';
    if (kind === 'laser') sub = 'Laser';
    else if (kind === 'gen') sub = d.kind === 'shield' ? 'Schild' : 'Antrieb';
    else if (kind === 'ammo') sub = fmt(d.pack) + ' Schuss · ' + d.key;
    else if (kind === 'rocket') sub = fmt(d.pack) + ' Stück · ' + String(d.key).toUpperCase();
    else if (kind === 'ship') { name = esc(shipClass(id)); sub = `${d.laserSlots}L · ${d.genSlots}G`; }
    else if (kind === 'drone') sub = 'Stufe 1–10 · ' + (d.module === 'laser' ? 'feuert mit' : 'Schild');
    const [tn, tmax] = tierOf(kind, id);
    let ticks = '';
    for (let k = 1; k <= tmax; k++) ticks += `<b${k <= tn ? ' class="on"' : ''}></b>`;
    const art = kind === 'ship' ? `<svg class="sx-mini is-s" viewBox="60 56 500 390" aria-hidden="true">${shipSvg(d.no, true).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>` : itemSvg(kind, id, true);
    return `<button class="sx-row${on ? ' is-sel' : ''}${st.lock ? ' is-lock' : ''}" type="button" data-act="pick" data-kind="${kind}" data-id="${id}">
      <span class="sx-c-art">${art}</span>
      <span class="sx-c-name"><span class="sx-c-top"><i class="sx-c-code">${codeOf(kind, id)}</i>${name}</span><span class="sx-c-sub"><span class="sx-tier">${ticks}</span><span class="sx-tier-t">${tierLabel(kind, id)}</span><small>${esc(sub)}</small></span></span>
      <span class="sx-c-val ls-num">${this._perf(kind, id)}</span>
      <span class="sx-c-cmp ${cmp.cls}">${cmp.text}</span>
      <span class="sx-c-price">${price}</span>
      <span class="sx-c-st"><span class="sx-sc ${st.cls}"><i></i>${esc(st.text)}</span></span>
    </button>`;
  }

  _perf(kind, id) {
    const d = tableOf(kind)[id];
    if (kind === 'laser') return `${fmt(d.damage)}<small>${U}SCH</small>`;
    if (kind === 'gen') return d.kind === 'shield' ? `${fmt(d.value)}<small>${U}SH</small>` : `+${fmt(d.value)}<small>${U}M/S</small>`;
    if (kind === 'ammo') return `×${d.mult}<small>${U}${d.shieldOnly ? 'SCHILD' : 'SCH'}</small>`;
    if (kind === 'rocket') return `${fmt(d.damage)}<small>${U}SCH</small>`;
    if (kind === 'drone') { const T = DRONES[d.type]; return d.module === 'laser' ? `${fmt(T.laser[0])}<small>${U}SCH</small>` : `+${fmt(T.shield[0])}<small>${U}SH</small>`; }
    return `${fmt(d.hp)}<small>${U}HP</small>`;
  }

  // Vergleich zum eingebauten Teil
  _cmp(p, kind, id) {
    const d = tableOf(kind)[id];
    const ship = SHIPS[p.ship] || SHIPS.s1;
    const cls = (v) => (v > 0 ? 'is-up' : v < 0 ? 'is-dn' : 'is-eq');
    if (kind === 'laser') {
      const L = p.loadout.lasers;
      if (L.length < ship.laserSlots) return { text: signed(d.damage) + ' frei', cls: 'is-up' };
      const wv = weakest(L, (x) => (LASERS[x] ? LASERS[x].damage : 0));
      const v = d.damage - wv;
      return { text: signed(v), cls: cls(v) };
    }
    if (kind === 'gen') {
      const G = p.loadout.gens;
      if (G.length < ship.genSlots) return { text: signed(d.value) + ' frei', cls: 'is-up' };
      const same = G.filter((g) => GENERATORS[g] && GENERATORS[g].kind === d.kind);
      if (!same.length) return { text: 'kein Platz', cls: 'is-eq' };
      const v = d.value - weakest(same, (g) => GENERATORS[g].value);
      return { text: signed(v), cls: cls(v) };
    }
    if (kind === 'ammo' || kind === 'rocket') {
      const have = (p.ammo && p.ammo[id]) || 0;
      return { text: fmt(have) + ' an Bord', cls: have ? 'is-eq' : 'is-dn' };
    }
    if (kind === 'drone') {
      const n = (p.drones || []).length;
      return { text: `${n}/${DRONE_RULES.max} Plätze`, cls: n < DRONE_RULES.max ? 'is-up' : 'is-eq' };
    }
    const cur = SHIPS[p.ship] || SHIPS.s1;
    if (id === p.ship) return { text: 'AKTIV', cls: 'is-eq' };
    const v = d.hp - cur.hp;
    return { text: signed(v) + U + 'HP', cls: cls(v) };
  }

  _status(p, kind, id) {
    const d = tableOf(kind)[id];
    const lvl = p.level || 1;
    if (d.dropOnly) return { text: 'Nur Beute', cls: 'is-lock', lock: true };
    if (kind === 'ship') {
      if (p.ship === id) return { text: 'Aktiv', cls: 'is-on', lock: false };
      if ((p.owned.ships || []).includes(id)) return { text: 'Im Besitz', cls: 'is-own', lock: false };
      if (d.locked) return { text: 'Stufe ' + d.level, cls: 'is-lock', lock: true };
    }
    if (lvl < (d.level || 1)) return { text: 'Stufe ' + d.level, cls: 'is-lock', lock: true };
    const pr = priceFor(kind, id, this.world);
    if (pr && pr.currency && (p[pr.currency] || 0) < pr.amount) {
      return { text: 'Fehlen ' + fmt(pr.amount - (p[pr.currency] || 0)) + (pr.currency === 'tritium' ? ' TRI' : ' CR'), cls: 'is-warn', lock: false };
    }
    if (kind === 'laser' || kind === 'gen') {
      const n = countOf(kind === 'laser' ? p.loadout.lasers : p.loadout.gens, id) + countOf(kind === 'laser' ? p.owned.lasers : p.owned.gens, id);
      return n ? { text: 'Besitz ' + n, cls: 'is-own', lock: false } : { text: 'Lieferbar', cls: '', lock: false };
    }
    if (kind === 'drone') {
      const D = p.drones || [];
      if (D.length >= DRONE_RULES.max) return { text: 'Plätze voll', cls: 'is-lock', lock: false };
      const n = D.filter((x) => x.type === d.type && x.module === d.module).length;
      return n ? { text: 'Besitz ' + n, cls: 'is-own', lock: false } : { text: 'Lieferbar', cls: '', lock: false };
    }
    return { text: 'Lieferbar', cls: '', lock: false };
  }

  _detail(p) {
    const { kind, id } = this.pick;
    const d = tableOf(kind)[id];
    const isPack = kind === 'ammo' || kind === 'rocket';
    const pr = priceFor(kind, id, this.world);
    const packCost = pr ? pr.amount : 0;
    const bal = pr && pr.currency ? p[pr.currency] || 0 : 0;
    const maxPacks = isPack ? Math.max(1, Math.min(999, packCost ? Math.floor(bal / packCost) : 999)) : 1;
    let n = isPack ? this.qty[id] || 1 : 1;
    n = Math.max(1, Math.min(999, n));
    const info = this._info(kind, id, n);
    const ship = SHIPS[p.ship] || SHIPS.s1;

    // Werte mit Vergleich
    let stats = '';
    const row = (label, cur, nxt, unit, opt = {}) => {
      const max = Math.max(cur || 0, nxt || 0) * 1.12 || 1;
      const diff = nxt - (cur || 0);
      const showCmp = cur != null && !opt.noCmp;
      return `<div class="sx-stat">
        <span class="ls-label">${label}</span>
        <span class="sx-stat-v ls-num">${showCmp ? `<s>${opt.fmtv ? opt.fmtv(cur) : fmt(cur)}</s><em>›</em>` : ''}${opt.fmtv ? opt.fmtv(nxt) : fmt(nxt)}${unit ? `<small>${U}${unit}</small>` : ''}</span>
        <span class="sx-cmp ${showCmp ? (diff > 0 ? 'is-up' : diff < 0 ? 'is-dn' : 'is-eq') : 'is-eq'}">${showCmp ? signed(diff) : ''}</span>
        ${opt.noBar ? '' : `<div class="sx-stat-bars">${showCmp ? `<div class="ls-bar is-ref" style="--v:${((cur || 0) / max).toFixed(3)};--trail:0"></div>` : ''}<div class="ls-bar is-shield" style="--v:${(nxt / max).toFixed(3)};--trail:0"></div></div>`}
      </div>`;
    };
    let figNote = '';
    if (kind === 'laser') {
      const L = p.loadout.lasers;
      const free = L.length < ship.laserSlots;
      const wv = free ? null : weakest(L, (x) => (LASERS[x] ? LASERS[x].damage : 0));
      const wid = free ? null : L.find((x) => (LASERS[x] ? LASERS[x].damage : 0) === wv);
      let tot = 0; for (const x of L) tot += LASERS[x] ? LASERS[x].damage : 0;
      const after = free ? tot + d.damage : tot + Math.max(0, d.damage - wv);
      stats += row('Schaden je Schuss', free ? 0 : wv, d.damage, 'SCH');
      stats += row('Schiff gesamt', tot, after, 'SCH/S');
      figNote = free ? 'Freier Laserplatz vorhanden' : 'Vergleich mit ' + (LASERS[wid] ? LASERS[wid].name : '') + ' (schwächster Platz)';
    } else if (kind === 'gen') {
      const G = p.loadout.gens;
      const free = G.length < ship.genSlots;
      const same = G.filter((g) => GENERATORS[g] && GENERATORS[g].kind === d.kind);
      const wv = free || !same.length ? 0 : weakest(same, (g) => GENERATORS[g].value);
      let tot = 0; for (const g of G) if (GENERATORS[g] && GENERATORS[g].kind === d.kind) tot += GENERATORS[g].value;
      const base = d.kind === 'speed' ? ship.speed : 0;
      const after = free ? tot + d.value : tot + Math.max(0, d.value - wv);
      stats += row(d.kind === 'shield' ? 'Schild je Generator' : 'Tempo je Generator', wv, d.value, d.kind === 'shield' ? 'SH' : 'M/S');
      stats += row(d.kind === 'shield' ? 'Schild gesamt' : 'Tempo gesamt', base + tot, base + after, d.kind === 'shield' ? 'SH' : 'M/S');
      figNote = free ? 'Freier Generatorplatz vorhanden' : same.length ? 'Vergleich mit schwächstem ' + (d.kind === 'shield' ? 'Schildgenerator' : 'Antriebsgenerator') : 'Kein Platz dieser Art belegt';
    } else if (kind === 'ammo') {
      const have = (p.ammo && p.ammo[id]) || 0;
      stats += row('Schadensfaktor', 1, d.mult, '', { fmtv: (v) => '×' + v });
      stats += row('Vorrat', have, have + d.pack * n, 'SCHUSS');
      if (d.ownCooldown) stats += row('Ladezeit', null, d.ownCooldown, 'S', { noBar: true });
      figNote = 'Vergleich mit L1 · Taste ' + d.key;
    } else if (kind === 'drone') {
      const T = DRONES[d.type], L = d.module === 'laser';
      const arr = L ? T.laser : T.shield;
      stats += row(L ? 'Schaden je Schuss · Stufe 1 › 10' : 'Schild · Stufe 1 › 10', arr[0], arr[arr.length - 1], L ? 'SCH' : 'SH');
      stats += row('Verkauf · Stufe 1 › 10', Math.round(T.price * DRONE_RULES.sell[0]), Math.round(T.price * DRONE_RULES.sell[DRONE_RULES.sell.length - 1]), 'CR');
      stats += row('Drohnenplätze belegt', null, (p.drones || []).length, '/ ' + DRONE_RULES.max, { noBar: true });
      figNote = L ? 'Feuert mit · 1 Schuss/s × Munition' : 'Zählt zum Schiffsschild';
    } else if (kind === 'rocket') {
      const have = (p.ammo && p.ammo[id]) || 0;
      stats += row('Schaden', null, d.damage, 'SCH', { noBar: true });
      stats += row('Nachladen', null, d.cooldown, 'S', { noBar: true, fmtv: (v) => String(v).replace('.', ',') });
      stats += row('Vorrat', have, have + d.pack * n, 'STÜCK');
      figNote = 'Taste ' + String(d.key).toUpperCase();
    } else {
      const self = id === p.ship;
      const cur = self ? {} : ship;
      const o = self ? { noBar: true } : {};
      stats += row('Hülle', cur.hp, d.hp, 'HP', o);
      stats += row('Tempo', cur.speed, d.speed, 'M/S', o);
      stats += row('Laserplätze', cur.laserSlots, d.laserSlots, '', o);
      stats += row('Generatorplätze', cur.genSlots, d.genSlots, '', o);
      stats += row('Laderaum', cur.cargo, d.cargo, 'E', o);
      stats += row('Freigabe ab Stufe', null, d.level || 1, '', { noBar: true });
      figNote = self ? 'Aktives Schiff' : 'Bezug ' + shipCode(p.ship);
    }

    let qtyBox = '';
    if (isPack) {
      const presets = [1, 5, 10];
      let pb = '';
      for (const v of presets) pb += `<button class="sx-q${n === v ? ' is-on' : ''}" type="button" data-act="qty" data-v="${v}">${v}</button>`;
      pb += `<button class="sx-q${n === maxPacks && maxPacks > 1 ? ' is-on' : ''}" type="button" data-act="qty" data-v="${maxPacks}">Max</button>`;
      qtyBox = `<div class="sx-qty">
        <span class="ls-label">Menge<span class="sx-qty-s ls-num">= ${fmt(d.pack * n)} ${kind === 'rocket' ? 'Stück' : 'Schuss'}</span></span>
        <div class="sx-step">
          <button class="sx-q" type="button" data-act="qty" data-v="${n - 1}" aria-label="weniger">−</button>
          <span class="sx-step-v ls-num">${n}<small>${n === 1 ? 'Packung' : 'Packungen'}</small></span>
          <button class="sx-q" type="button" data-act="qty" data-v="${n + 1}" aria-label="mehr">+</button>
        </div>
        <div class="sx-presets">${pb}</div>
      </div>`;
    }

    const cost = info.cost || 0;
    const curr = info.currency;
    const after = curr ? bal - cost : null;
    let priceBox;
    if (d.dropOnly) priceBox = `<div class="sx-price-row is-main"><span class="ls-label">Preis</span><span class="sx-dash">Nicht im Handel</span></div>`;
    else if (!curr) priceBox = `<div class="sx-price-row is-main"><span class="ls-label">Preis</span><span class="sx-dash">Serienschiff</span></div>`;
    else priceBox = `
      <div class="sx-price-row is-main"><span class="ls-label">Preis</span><span class="sx-price-v"><b class="ls-num${curr === 'tritium' ? ' is-tri' : ''}">${fmt(cost)}</b>${curLabel(curr)}</span></div>
      <div class="sx-price-row is-sub"><span class="ls-label">Bestand</span><span class="sx-price-v"><span class="ls-num">${fmt(bal)}</span>${curLabel(curr)}</span></div>
      <div class="sx-price-row is-sub"><span class="ls-label${after < 0 ? ' is-miss' : ''}">${after < 0 ? 'Fehlbetrag' : 'Nach Kauf'}</span><span class="sx-price-v${after < 0 ? ' is-miss' : ''}"><span class="ls-num">${fmt(Math.abs(after))}</span>${curLabel(curr)}</span></div>`;

    let action;
    const lvl = p.level || 1;
    if (kind === 'ship' && p.ship === id) action = `<button class="ls-btn sx-buy is-quiet" type="button" disabled>Aktives Schiff</button>`;
    else if (info.ok) {
      const label = kind === 'ship' && (p.owned.ships || []).includes(id) ? 'Wechseln' : 'Kaufen';
      action = `<button class="ls-btn is-fx sx-buy" type="button" data-act="buy" data-kind="${kind}" data-id="${id}" data-n="${n}">${label}${cost ? ` · ${fmt(cost)} ${CUR[curr]}` : ''}</button>`;
    } else if (d.dropOnly) {
      action = `<button class="ls-btn sx-buy is-quiet" type="button" disabled>Nur als Beute</button>`;
    } else if (d.locked || lvl < (d.level || 1)) {
      action = `<button class="ls-btn sx-buy is-quiet is-lockd" type="button" disabled>Gesperrt · ab Stufe ${d.level || 1}</button>`;
    } else {
      // zu wenig Geld: leiser Knopf, gelb erst bei einem Kaufversuch (Quittung „Abgelehnt“)
      const miss = Math.max(0, cost - bal);
      action = `<button class="ls-btn sx-buy is-quiet" type="button" data-act="buy" data-kind="${kind}" data-id="${id}" data-n="${n}">Fehlen ${fmt(miss)}${U}${curr === 'tritium' ? 'TRI' : 'CR'}</button>`;
    }

    let rc = '';
    const r = this.receipt;
    if (r && r.live && r.kind === kind && r.id === id) {
      rc = `<div class="sx-receipt is-ov${r.ok ? '' : ' is-fail'}">
        <div class="sx-receipt-h"><span>${r.ok ? 'Transaktion bestätigt' : 'Abgelehnt'}</span><span class="ls-num">${r.time}</span></div>
        <div class="sx-receipt-b">${r.lines.map((l) => `<div><span>${esc(l[0])}</span><span class="ls-num${l[2] ? ' ' + l[2] : ''}">${esc(l[1])}</span></div>`).join('')}</div>
      </div>`;
    }

    let fig;
    if (kind === 'ship') {
      const locked = !!d.locked;
      const bay = this._ensureBay();
      const shot = bay ? bay.snapshot(p.faction, locked ? 's2' : id, 340, 190, locked) : null;
      // Maßketten direkt am Rumpf: Umriss aus dem Standbild (Anteile)
      const bx = shot && shot.bx;
      const pc = (v) => (v * 100).toFixed(1) + '%';
      fig = shot
        ? `<img class="sx-fig-img${locked ? ' is-locked' : ''}" src="${shot.url}" alt="" draggable="false">
           <div class="sx-dimx" style="left:${pc(bx[0])};right:${pc(1 - bx[1])};top:calc(${pc(bx[3])} + 4px)"><span>L ${dec1(shot.l)}${U}M</span></div>
           <div class="sx-dimy" style="left:calc(${pc(bx[1])} + 4px);top:${pc(bx[2])};bottom:${pc(1 - bx[3])}"><span>B ${dec1(shot.b)}${U}M</span></div>
           ${locked ? `<span class="sx-fig-lock">Erprobung</span>` : ''}`
        : shipSvg(d.no, true);
    } else fig = itemSvg(kind, id);
    const spec = this._spec(p, kind, id, ship);

    const st = this._status(p, kind, id);
    const title = kind === 'ship' ? `${shipCode(id)}<small>${esc(shipClass(id))}</small>` : esc(d.name);
    const sub = kind === 'ship' ? 'Klasse ' + shipClass(id) + ' · Werft ' + stationNameOf(this.world) : CATS.find((c) => c.id === kind).name;
    return `
      <div class="ls-head"><span class="ls-code">ART·${codeOf(kind, id)}</span><span class="ls-title">Datenblatt</span><span class="ls-spacer"></span>${kind === 'ship' ? `<span class="sx-head-r is-opt">${esc(figNote)}</span>` : ''}<span class="sx-sc ${st.cls}"><i></i>${esc(st.text)}</span></div>
      <div class="sx-detail-b">
        <figure class="sx-fig${kind === 'ship' ? ' is-ship' : ''}"><div class="sx-fig-art">${fig}</div>${kind === 'ship' ? '' : `<figcaption class="sx-fig-cap">${esc(figNote)}</figcaption>`}</figure>
        <div class="sx-dt">
          <div class="sx-dt-k">${esc(sub)}</div>
          <div class="sx-dt-n">${title}</div>
          <p class="sx-dt-d">${esc(DESC[kind][id] || '')}</p>
        </div>
        <div class="sx-stats${kind === 'ship' ? ' is-compact' : ''}">${stats}</div>
        ${spec}
        ${qtyBox}
      </div>
      <div class="sx-detail-f">
        <div class="sx-price">${priceBox}</div>
        <div class="sx-act">${action}</div>
        ${rc}
      </div>`;
  }

  // Kenndaten unter den Werten: passende Plätze mit Belegung (Mini-Skala), Lager, Hersteller, Masse
  _spec(p, kind, id, ship) {
    const d = tableOf(kind)[id];
    const mk = MAKER[kind] && MAKER[kind][id];
    const kv = (k, v) => `<span class="ls-label">${k}</span><b>${v}</b>`;
    let fit = '', rows = '';
    if (kind === 'laser' || kind === 'gen') {
      const isL = kind === 'laser';
      const arr = isL ? p.loadout.lasers : p.loadout.gens;
      const n = isL ? ship.laserSlots : ship.genSlots;
      const sc = isL ? 200 : d.kind === 'shield' ? 2000 : 20;
      const vNew = isL ? d.damage : d.value;
      // Zielplatz: erster freier, sonst schwächster passender
      let target = -1, best = Infinity;
      for (let i = 0; i < n; i++) {
        const od = arr[i] ? tableOf(kind)[arr[i]] : null;
        if (!od) { target = i; break; }
        if (!isL && od.kind !== d.kind) continue;
        const v = isL ? od.damage : od.value;
        if (v < best) { best = v; target = i; }
      }
      for (let i = 0; i < n; i++) {
        const od = arr[i] ? tableOf(kind)[arr[i]] : null;
        const other = !isL && od && od.kind !== d.kind;
        const v = od && !other ? (isL ? od.damage : od.value) : 0;
        const show = !od ? 'frei' : other ? 'andere Art' : (isL ? fmt(v) : (d.kind === 'speed' ? '+' : '') + fmt(v));
        fit += `<div class="sx-fit${i === target ? ' is-t' : ''}${other ? ' is-x' : ''}">
          <span class="sx-fit-c">${isL ? 'L' : 'G'}${i + 1}</span><span class="sx-fit-n">${od ? esc(od.name) : 'Platz frei'}</span>
          <div class="sx-fit-bar"><div class="ls-bar" style="--v:${Math.min(1, v / sc).toFixed(3)};--trail:0"></div><i style="left:${(Math.min(1, vNew / sc) * 100).toFixed(1)}%"></i></div>
          <span class="sx-fit-v ls-num">${show}</span></div>`;
      }
      fit = `<div class="sx-fits"><div class="sx-spec-h"><span class="ls-label">Passende Plätze</span><span class="sx-head-r">${target >= 0 ? 'Ziel ' + (isL ? 'L' : 'G') + (target + 1) + ' · Strich = neu' : 'Strich = neu'}</span></div>${fit}</div>`;
      const stock = countOf(isL ? p.owned.lasers : p.owned.gens, id);
      const mounted = countOf(arr, id);
      rows += kv('Bestand', `${fmt(stock)} im Lager · ${fmt(mounted)} eingebaut`);
    } else if (kind === 'ammo') {
      rows += kv('Passend', `alle Laser · ${p.loadout.lasers.length} an Bord`);
    } else if (kind === 'rocket') {
      rows += kv('Werfer', `Rumpfschacht · ${fmt(d.pack)} Stück je Packung`);
    } else if (kind === 'drone') {
      return this._droneBay(p);
    } else {
      return '';
    }
    if (mk) rows += kv(kind === 'ammo' || kind === 'rocket' ? 'Hersteller · Packung' : 'Hersteller · Masse', `${mk[0]} · ${esc(mk[1])} · ${tons(mk[2])}`);
    return `${fit}<div class="sx-kv">${rows}</div>`;
  }

  // Eigene Drohnen: Stufe, Erfahrung, Zustand, Verkaufswert; Reparieren, Verkaufen (zweistufig), Modul tauschen
  _droneBay(p) {
    const w = this.world, D = p.drones || [];
    const info = (x) => (w && typeof w.droneInfo === 'function' ? w.droneInfo(x) : null);
    let rows = '', total = 0;
    D.forEach((x, i) => {
      const f = info(x);
      if (!f) return;
      total += f.repair;
      const span = Math.max(1, f.xpNext - f.xpLevel);
      const xpK = x.level >= DRONE_RULES.maxLevel ? 1 : Math.min(1, (x.xp - f.xpLevel) / span);
      const st = x.broken ? 'KAPUTT' : Math.round(x.hp) + ' %';
      const arm = this._droneSell === x.id;
      rows += `<div class="sx-dr${x.broken ? ' is-broken' : x.hp <= DRONE_RULES.warnAt ? ' is-warn' : ''}">
        <span class="sx-fit-c">${i + 1}</span>
        <span class="sx-dr-n"><b>${esc(DRONES[x.type].name)} · ${x.module === 'laser' ? 'Laser' : 'Schild'}</b><small class="ls-num">St. ${x.level} · ${fmt(f.value)}${U}${f.unit} · ${x.level >= DRONE_RULES.maxLevel ? 'Höchststufe' : 'noch ' + fmt(f.next) + ' EP'}</small></span>
        <span class="sx-dr-bars" title="Erfahrung bis zur nächsten Stufe · Zustand"><div class="ls-bar" style="--v:${xpK.toFixed(3)};--trail:0"></div><div class="ls-bar is-hp" style="--v:${(Math.max(0, x.hp) / 100).toFixed(3)};--trail:0"></div></span>
        <span class="sx-dr-st ls-num">${st}</span>
        <span class="sx-dr-a">
          ${f.repair > 0 ? `<button class="ls-btn sx-dr-b" type="button" data-act="drepair" data-id="${x.id}" title="Reparieren">Rep ${fmt(f.repair)}</button>` : ''}
          <button class="ls-btn sx-dr-b" type="button" data-act="dmod" data-id="${x.id}" data-m="${x.module === 'laser' ? 'shield' : 'laser'}" title="Modul tauschen (kostenlos)">${x.module === 'laser' ? '→ Schild' : '→ Laser'}</button>
          <button class="ls-btn sx-dr-b${arm ? ' is-fx' : ''}" type="button" data-act="dsell" data-id="${x.id}" title="Verkaufen">${arm ? 'Sicher? +' : '+'}${fmt(f.sell)}</button>
        </span>
      </div>`;
    });
    if (!rows) rows = '<div class="sx-dr is-empty"><span class="sx-dr-n"><small>Noch keine Drohne. Pioneer kaufen: fliegt sofort mit.</small></span></div>';
    const all = total > 0 ? `<button class="ls-btn sx-dr-b" type="button" data-act="drepair" data-id="all">Alle reparieren · ${fmt(total)} CR</button>` : '';
    return `<div class="sx-fits sx-drs"><div class="sx-spec-h"><span class="ls-label">Deine Drohnen · ${D.length}/${DRONE_RULES.max}</span><span class="sx-head-r">Balken: Erfahrung · Zustand</span></div>${rows}${all ? `<div class="sx-dr-all">${all}</div>` : ''}</div>`;
  }

  // Datenblatt neu zeichnen ohne Wisch-Animation (z. B. wenn die Quittung ausläuft)
  _refreshDetail() {
    const det = this.body.querySelector('.sx-detail');
    if (!det || this.tab !== 'shop' || !this.pick) return;
    const sc = det.querySelector('.sx-detail-b');
    const keep = sc ? sc.scrollTop : 0;
    det.innerHTML = '<i class="ls-corners"></i>' + this._detail(this.world.profile);
    const nb = det.querySelector('.sx-detail-b');
    if (nb) nb.scrollTop = keep;
  }

  _syncCats() {
    const list = this.body.querySelector('.sx-list');
    if (!list) return;
    let cur = CATS[0].id;
    const top = list.scrollTop + 8;
    for (const g of list.querySelectorAll('.sx-grp')) if (g.offsetTop <= top) cur = g.dataset.grp;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2) cur = CATS[CATS.length - 1].id;
    for (const b of this.body.querySelectorAll('.sx-cat')) b.classList.toggle('is-on', b.dataset.cat === cur);
  }

  _stepPick(dir) {
    const flat = [];
    for (const c of CATS) for (const id of c.items) flat.push([c.id, id]);
    let i = flat.findIndex((x) => this.pick && x[0] === this.pick.kind && x[1] === this.pick.id);
    i = (i + dir + flat.length) % flat.length;
    this._select(flat[i][0], flat[i][1], true);
  }

  // Auswahl im Shop ohne die Liste neu aufzubauen
  _select(kind, id, scroll) {
    this.pick = { kind, id };
    const list = this.body.querySelector('.sx-list');
    const det = this.body.querySelector('.sx-detail');
    if (!list || !det) { this.render(true); return; }
    for (const r of list.querySelectorAll('.sx-row')) r.classList.toggle('is-sel', r.dataset.kind === kind && r.dataset.id === id);
    det.innerHTML = '<i class="ls-corners"></i>' + this._detail(this.world.profile);
    det.classList.remove('is-swap');
    void det.offsetWidth;
    det.classList.add('is-swap');
    if (scroll) {
      const row = list.querySelector(`.sx-row[data-kind="${kind}"][data-id="${id}"]`);
      if (row) {
        const rt = row.offsetTop, rb = rt + row.offsetHeight;
        if (rt < list.scrollTop + 30) list.scrollTop = rt - 30;
        else if (rb > list.scrollTop + list.clientHeight) list.scrollTop = rb - list.clientHeight;
      }
    }
    this._sig = '';
  }

  // ================= ERZ =================
  _renderOre(p) {
    const ship = SHIPS[p.ship] || SHIPS.s1;
    const cargo = p.cargo || {};
    const used = cargoUsed(p);
    const ids = Object.keys(ORES);
    let total = 0, rows = '', legend = '';
    for (const id of ids) {
      const d = ORES[id];
      const n = cargo[id] || 0;
      total += n * d.price;
      const share = ship.cargo ? n / ship.cargo : 0;
      legend += `<div class="sx-lg${n ? '' : ' is-dim'}">${oreMark(id)}
        <span class="sx-lg-n">${esc(d.name)}</span><span class="ls-num">${fmt(n)}<small>${U}E</small></span><span class="sx-lg-p ls-num">${Math.round(share * 100)}${U}%</span></div>`;
      rows += `<div class="sx-orow${n ? '' : ' is-dim'}">
        <span class="sx-orow-n">${oreMark(id)}${esc(d.name)}</span>
        <span class="ls-num">${fmt(n)}<small>${U}E</small></span>
        <span class="ls-num">${fmt(d.price)}<small>${U}CR/E</small></span>
        <span class="ls-num sx-orow-s">${fmt(n * d.price)}<small>${U}CR</small></span>
      </div>`;
    }
    // Markt: Festpreis auf gemeinsamer Skala, Ertrag bei vollem Laderaum, Abgabe dieser Sitzung je Sorte
    const sl = logOf(SALES_LOG, p.callsign);
    const sold = {};
    for (const e of sl) for (const k in e.by || {}) sold[k] = (sold[k] || 0) + e.by[k];
    let best = 0;
    for (const id of ids) best = Math.max(best, ORES[id].price);
    const top = Math.ceil(best / 10) * 10 + 10;
    let mrows = '';
    for (const id of ids) {
      const d = ORES[id];
      mrows += `<div class="sx-mk"><span class="sx-orow-n">${oreMark(id)}${esc(d.name)}</span>
        <span class="sx-mk-sc"><i class="ls-tick"></i><b style="left:${((d.price / top) * 100).toFixed(1)}%"></b><em style="width:${((d.price / top) * 100).toFixed(1)}%"></em></span>
        <span class="ls-num">${fmt(d.price * ship.cargo)}<small>${U}CR</small></span>
        <span class="ls-num${sold[id] ? '' : ' is-dim'}">${fmt(sold[id] || 0)}<small>${U}E</small></span></div>`;
    }
    const frac = ship.cargo ? Math.min(1, used / ship.cargo) : 0;
    const free = Math.max(0, ship.cargo - used);
    // Verkaufsprotokoll: feste drei Rasterzeilen, echte Buchungen oben
    let sales = '<div class="sx-sl is-h"><span>Zeit</span><span>Menge</span><span>Gutschrift</span></div>';
    for (let i = 0; i < 3; i++) {
      const e = sl[i];
      sales += e
        ? `<div class="sx-sl${i === 0 && this.sale === e ? ' is-new' : ''}"><span class="ls-num">${e.time}</span><span class="ls-num">${fmt(e.units)}<small>${U}E</small></span><span class="ls-num is-up">+${fmt(e.credits)}<small>${U}CR</small></span></div>`
        : '<div class="sx-sl is-void"><span class="ls-num">--:--:--</span><span class="ls-num">—</span><span class="ls-num">—</span></div>';
    }
    this.body.innerHTML = `
      <div class="sx-ore${this._takeEnter()}">
        <section class="sx-hold ls-panel"><i class="ls-corners"></i>
          <div class="ls-head"><span class="ls-code">LDR·01</span><span class="ls-title">Frachtbucht · ${esc(shipLabel(p.ship))}</span><span class="ls-spacer"></span>${used ? `<span class="sx-head-r ls-num">${Math.round(frac * 100)}${U}% belegt</span>` : '<span class="sx-hint"><i></i>Erz im All aufnehmen</span>'}</div>
          <div class="sx-hold-b">
            <div class="sx-hold-top">
              <div class="sx-hold-read${used ? '' : ' is-empty'}"><span class="ls-label">Beladung</span><b class="ls-num">${fmt(used)}</b><span class="ls-num">/ ${fmt(ship.cargo)}${U}E</span></div>
              <div class="sx-hold-free"><span class="ls-label">Frei</span><b class="ls-num">${fmt(free)}<small>${U}E</small></b></div>
            </div>
            <div class="sx-bayviz">${cargoBay(p, ship)}</div>
            <div class="sx-legend">${legend}</div>
          </div>
        </section>
        <section class="sx-market ls-panel"><i class="ls-corners"></i>
          <div class="ls-head"><span class="ls-code">ANK·${this._berth}</span><span class="ls-title">Ankauf · ${esc(this.nameEl.textContent)}</span><span class="ls-spacer"></span><span class="sx-head-r">Festpreise · Abnahme unbegrenzt</span></div>
          <div class="sx-market-b">
            <div class="sx-othead"><span>Erz</span><span>An Bord</span><span>Festpreis</span><span>Wert</span></div>
            ${rows}
            <div class="sx-ototal"><span class="ls-label">Gutschrift gesamt</span><span><b class="ls-num">${fmt(total)}</b>${curLabel('credits')}</span></div>
            <button class="ls-btn ${used ? 'is-fx' : 'is-quiet'} sx-sell" type="button" data-act="sell"${used ? '' : ' disabled'}>${used ? 'Alles verkaufen · ' + fmt(total) + ' Credits' : 'Kein Erz an Bord'}</button>
            <div class="sx-yield">
              <div class="sx-yield-h"><span class="ls-label">Markt · Festpreis je Einheit</span><span class="sx-head-r">Skala 0–${top} CR/E</span></div>
              <div class="sx-mk is-h"><span>Erz</span><span>Festpreis</span><span>Voller Laderaum</span><span>Abgabe Sitzung</span></div>
              ${mrows}
            </div>
            <div class="sx-sales">
              <div class="sx-yield-h"><span class="ls-label">Verkaufsprotokoll</span><span class="sx-head-r">${sl.length ? sl.length + (sl.length === 1 ? ' Buchung' : ' Buchungen') : '0 Buchungen'}</span></div>
              ${sales}
            </div>
          </div>
        </section>
      </div>`;
  }

  // ---------- Klicks ----------
  _click(e) {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const w = this.world;
    if (!w) return;
    const d = t.dataset;
    switch (d.act) {
      case 'tab': this._setTab(d.tab); break;
      case 'undock': w.undock(); break;
      case 'slot':
        this.sel.kind = d.kind; this.sel.index = +d.i;
        this.render(true);
        break;
      case 'unequip': {
        const arr = d.kind === 'laser' ? w.profile.loadout.lasers : w.profile.loadout.gens;
        const old = arr[+d.i];
        if (w.equip(d.kind, +d.i, null) !== false && old) this._logMount('Ausgebaut', (d.kind === 'laser' ? 'L' : 'G') + (+d.i + 1), partName(d.kind, old) + ' ins Lager');
        this.render(true);
        break;
      }
      case 'equip': {
        const arr = d.kind === 'laser' ? w.profile.loadout.lasers : w.profile.loadout.gens;
        const old = arr[+d.i];
        if (w.equip(d.kind, +d.i, d.id) !== false) this._logMount('Eingebaut', (d.kind === 'laser' ? 'L' : 'G') + (+d.i + 1), partName(d.kind, d.id) + ' ein' + (old ? ', ' + partName(d.kind, old) + ' ins Lager' : ''));
        this.render(true);
        break;
      }
      case 'view': {
        if (d.v !== 'werft' && d.v !== 'plan') break;
        this.view = d.v;
        saveView(d.v);
        this.render(true);
        break;
      }
      case 'goshop':
        this.pick = { kind: d.kind, id: d.id };
        this.tab = 'shop';
        this._enter = true;
        this.render(true);
        this._select(d.kind, d.id, true);
        break;
      case 'cat': {
        const list = this.body.querySelector('.sx-list');
        const g = list && list.querySelector(`.sx-grp[data-grp="${d.cat}"]`);
        if (g) list.scrollTop = g.offsetTop;
        const c = CATS.find((x) => x.id === d.cat);
        if (c) this._select(c.id, c.items[0], false);
        break;
      }
      case 'pick': this.receipt = null; clearTimeout(this._rcTimer); this._select(d.kind, d.id, false); break;
      case 'qty': {
        const id = this.pick && this.pick.id;
        if (!id) break;
        this.qty[id] = Math.max(1, Math.min(999, +d.v || 1));
        this._select(this.pick.kind, id, false);
        break;
      }
      case 'buy': this._buy(d.kind, d.id, +d.n || 1); break;
      case 'dsell': {
        // zweistufig: erster Klick fragt, zweiter verkauft
        if (this._droneSell !== d.id) { this._droneSell = d.id; this._refreshDetail(); break; }
        this._droneSell = null;
        w.sellDrone(d.id);
        this.render(true);
        break;
      }
      case 'drepair': this._droneSell = null; w.repairDrone(d.id); this.render(true); break;
      case 'dmod': this._droneSell = null; w.setDroneModule(d.id, d.m); this.render(true); break;
      case 'sell': {
        const p = w.profile;
        const units = cargoUsed(p);
        const by = { ...(p.cargo || {}) };
        const got = w.sellOre();
        if (got > 0) {
          this.sale = { units, credits: got, by, time: clock(), t: performance.now() };
          const sl = logOf(SALES_LOG, p.callsign);
          sl.unshift(this.sale);
          if (sl.length > 5) sl.length = 5;
        }
        this.render(true);
        break;
      }
      default: break;
    }
  }

  _buy(kind, id, n) {
    const w = this.world;
    const p = w.profile;
    const beforeL = p.loadout.lasers.slice();
    const beforeG = p.loadout.gens.slice();
    const info = this._info(kind, id, n);
    const res = w.buy(kind, id, n);
    const ok = res === true || (res && res.ok !== false && res !== false);
    const name = nameOf(kind, id);
    const lines = [];
    if (ok) {
      if (kind === 'ammo' || kind === 'rocket') lines.push([n + ' × ' + fmt(info.pack) + ' ' + name, fmt(info.pack * n) + (kind === 'rocket' ? ' Stück' : ' Schuss')]);
      else lines.push([(n > 1 ? n + '× ' : '') + name, codeOf(kind, id)]);
      if (info.cost) lines.push(['Abbuchung', '−' + fmt(info.cost) + ' ' + CUR[info.currency], info.currency === 'tritium' ? 'is-tri' : '']);
      if (kind === 'laser' || kind === 'gen') {
        const before = kind === 'laser' ? beforeL : beforeG;
        const after = kind === 'laser' ? p.loadout.lasers : p.loadout.gens;
        let slot = -1;
        for (let i = 0; i < after.length; i++) if (after[i] === id && before[i] !== id) { slot = i; break; }
        const pre = kind === 'laser' ? 'L' : 'G';
        if (slot >= 0) {
          const old = before[slot] ? tableOf(kind)[before[slot]] : null;
          lines.push(['Einbau', pre + (slot + 1) + (old ? ' · ' + old.name + ' ins Lager' : ' · freier Platz')]);
          this._logMount('Gekauft', pre + (slot + 1), name + ' ein' + (old ? ', ' + old.name + ' ins Lager' : ''));
          this.sel = { kind, index: slot };
        } else lines.push(['Ablage', 'Lager · im Hangar einbauen']);
      } else if (kind === 'ship') lines.push(['Status', 'Aktives Schiff']);
      else if (kind === 'drone') lines.push(['Plätze', `${(p.drones || []).length}/${DRONE_RULES.max} · fliegt ab sofort mit`]);
      else lines.push(['Vorrat', fmt((p.ammo && p.ammo[id]) || 0)]);
    } else {
      lines.push(['Grund', (res && res.reason) || info.reason || 'Kauf nicht möglich.', 'is-warn']);
    }
    this.receipt = { kind, id, ok, lines, time: clock(), t: performance.now(), live: true };
    if (this.qty[id] && (kind === 'ammo' || kind === 'rocket')) this.qty[id] = 1;
    this.render(true);
    // Quittung liegt 3 s über dem Preisblock, dann wieder Preis und Knopf
    clearTimeout(this._rcTimer);
    const rcRef = this.receipt;
    this._rcTimer = setTimeout(() => {
      if (this.receipt !== rcRef) return;
      rcRef.live = false;
      const ov = this.body.querySelector('.sx-receipt.is-ov');
      if (ov) { ov.classList.add('is-out'); setTimeout(() => this._refreshDetail(), 160); }
    }, 3000);
    const row = this.body.querySelector(`.sx-row[data-kind="${kind}"][data-id="${id}"]`);
    if (row && ok) row.classList.add('is-flash');
  }
}

// ---------- Helfer ----------
// Klassen-Skala je Artikel: [Stufe, Skalenlänge]
function tierOf(kind, id) {
  if (kind === 'laser') return [LASER_TIER[id], 4];
  if (kind === 'ammo') return [Math.min(6, AMMO[id].mult), 6];
  if (kind === 'ship') return [SHIPS[id].no, 8];
  return [1, 1];
}
function tierLabel(kind, id) {
  if (kind === 'laser') return 'KL ' + ROMAN[LASER_TIER[id]];
  if (kind === 'ammo') return '×' + AMMO[id].mult;
  if (kind === 'ship') return 'NR ' + SHIPS[id].no;
  return 'KL I';
}
function ownsAny(p, kind, id) {
  if (kind === 'laser') return countOf(p.loadout.lasers, id) + countOf(p.owned.lasers, id) > 0;
  if (kind === 'gen') return countOf(p.loadout.gens, id) + countOf(p.owned.gens, id) > 0;
  if (kind === 'ship') return ((p.owned && p.owned.ships) || []).includes(id);
  if (kind === 'drone') return (p.drones || []).some((x) => x.type === DRONE_SHOP[id].type && x.module === DRONE_SHOP[id].module);
  return ((p.ammo && p.ammo[id]) || 0) > 0;
}
function genInfo(d) {
  return d.kind === 'speed' ? '+' + fmt(d.value) + U + 'M/S Tempo' : '+' + fmt(d.value) + U + 'SH Schild';
}
function partName(kind, id) {
  const d = kind === 'laser' ? LASERS[id] : GENERATORS[id];
  return d ? d.name : String(id);
}
function dec1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
// Kennzahl je Kategorie in der Shop-Leiste
function catStat(p, cat) {
  const ship = SHIPS[p.ship] || SHIPS.s1;
  let a = '', b = '';
  if (cat === 'laser') {
    const L = p.loadout.lasers;
    let best = null;
    for (const x of L.concat(p.owned.lasers || [])) if (LASERS[x] && (!best || LASERS[x].damage > LASERS[best].damage)) best = x;
    a = `${L.length}/${ship.laserSlots} belegt`; b = best ? 'Bestes ' + LASERS[best].name : '';
  } else if (cat === 'gen') {
    const G = p.loadout.gens;
    a = `${G.length}/${ship.genSlots} belegt`; b = (p.owned.gens || []).length + ' im Lager';
  } else if (cat === 'ammo') {
    let n = 0;
    for (const k in AMMO) n += (p.ammo && p.ammo[k]) || 0;
    a = fmt(n) + U + 'Schuss an Bord'; b = 'Gewählt ' + (p.selectedAmmo || 'L1');
  } else if (cat === 'rocket') {
    a = fmt((p.ammo && p.ammo.R1) || 0) + U + 'R1 an Bord';
  } else if (cat === 'ship') {
    a = `${((p.owned && p.owned.ships) || []).length}/${Object.keys(SHIPS).length} im Besitz`; b = 'Aktiv ' + shipCode(p.ship);
  } else if (cat === 'drone') {
    const D = p.drones || [];
    const hurt = D.filter((x) => x.hp < 100).length;
    a = `${D.length}/${DRONE_RULES.max} Drohnen`; b = hurt ? hurt + ' zur Reparatur' : '';
  }
  return `<span class="sx-cat-s">${esc(a)}${b ? `<i>${esc(b)}</i>` : ''}</span>`;
}
// Frachtbucht isometrisch: 10 × 5 Stellplätze in 2 Lagen = 100 Einheiten (je 1 %), Beladung von hinten unten.
// Erze nur über Muster unterschieden (Schraffur, Raster, Vollfläche), keine Farbe.
function cargoBay(p, ship) {
  const NX = 10, NY = 5, NZ = 2, s = 22, a = s * 0.866, b = s * 0.5, hz = 20;
  const ox = NY * a + 18, oy = 2.4 * hz + 14;
  const P = (x, y, z) => (ox + (x - y) * a).toFixed(1) + ' ' + (oy + (x + y) * b - z * hz).toFixed(1);
  const poly = (pts) => 'M' + pts.join(' L') + ' Z';
  const cargo = p.cargo || {};
  const used = cargoUsed(p);
  const per = ship.cargo / 100;
  const order = [];
  for (const id of Object.keys(ORES)) { const k = Math.round((cargo[id] || 0) / per); for (let j = 0; j < k && order.length < 100; j++) order.push(id); }
  // Ladefolge: untere Lage zuerst, von hinten nach vorn
  const cells = [];
  for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) for (let y = 0; y < NY; y++) cells.push([x, y, z]);
  cells.sort((A, B) => A[2] - B[2] || (A[0] + A[1]) - (B[0] + B[1]) || A[0] - B[0]);
  const ore = new Map();
  cells.forEach((c, i) => { if (order[i]) ore.set(c.join(), order[i]); });
  // Zeichenfolge: von hinten nach vorn, unten nach oben
  const draw = cells.slice().sort((A, B) => (A[0] + A[1]) - (B[0] + B[1]) || A[2] - B[2] || A[0] - B[0]);
  let cubes = '';
  for (const [x, y, z] of draw) {
    const o = ore.get(x + ',' + y + ',' + z);
    if (!o) continue;
    const top = poly([P(x, y, z + 1), P(x + 1, y, z + 1), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)]);
    const fx = poly([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x + 1, y, z + 1)]);
    const fy = poly([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, z + 1), P(x, y + 1, z + 1)]);
    cubes += `<path class="cb sx-ore-${o}" d="${top}"/><path class="cb sx-ore-${o}" d="${fx}"/><path class="sh1" d="${fx}"/><path class="cb sx-ore-${o}" d="${fy}"/><path class="sh2" d="${fy}"/>`;
  }
  // Hülle der Bucht: Boden mit Raster, zwei Rückwände mit Rippen, offene Vorderkante
  const H = 2.4;
  let grid = '';
  for (let x = 1; x < NX; x++) grid += `M${P(x, 0, 0)} L${P(x, NY, 0)} `;
  for (let y = 1; y < NY; y++) grid += `M${P(0, y, 0)} L${P(NX, y, 0)} `;
  let ribs = '';
  for (let x = 2; x < NX; x += 2) ribs += `M${P(x, 0, 0)} L${P(x, 0, H)} `;
  for (let y = 1; y < NY; y++) ribs += `M${P(0, y, 0)} L${P(0, y, H)} `;
  let rl = '';
  for (let y = 0; y < NY; y++) { const [tx, ty] = P(NX + 0.35, y + 0.5, 0).split(' '); rl += `<text class="rl" x="${tx}" y="${(+ty + 3).toFixed(1)}">R${y + 1}</text>`; }
  const [cx, cy] = P(NX / 2, NY / 2, 0).split(' ');
  const empty = used ? '' : `<text class="empty" x="${cx}" y="${(+cy + 4).toFixed(1)}" text-anchor="middle">LADERAUM LEER · ${fmt(ship.cargo)} E FREI</text>`;
  const W = (ox + NX * a + 34).toFixed(0), Hh = (oy + (NX + NY) * b + 12).toFixed(0);
  return `<svg class="sx-cargo" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
    <defs>
      <pattern id="pt-nickel" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#15171b"/><path d="M0 0 V4" stroke="rgba(255,255,255,.62)" stroke-width="1.3"/></pattern>
      <pattern id="pt-cobalt" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#111316"/><rect x="1" y="1" width="1.6" height="1.6" fill="rgba(255,255,255,.55)"/></pattern>
      <pattern id="pt-platinum" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#c9ccd3"/></pattern>
    </defs>
    <path class="wall" d="${poly([P(0, 0, 0), P(NX, 0, 0), P(NX, 0, H), P(0, 0, H)])}"/>
    <path class="wall is-r" d="${poly([P(0, 0, 0), P(0, NY, 0), P(0, NY, H), P(0, 0, H)])}"/>
    <path class="rib" d="${ribs}"/>
    <path class="floor" d="${poly([P(0, 0, 0), P(NX, 0, 0), P(NX, NY, 0), P(0, NY, 0)])}"/>
    <path class="grid" d="${grid}"/>
    ${empty}${cubes}
    <path class="rim" d="M${P(NX, 0, H)} L${P(NX, 0, 0)} L${P(NX, NY, 0)} L${P(0, NY, 0)} L${P(0, NY, H)}"/>
    <path class="rim is-d" d="M${P(NX, 0, H)} L${P(NX, NY, H)} L${P(0, NY, H)}"/>
    ${rl}
  </svg>`;
}
// Erzmarke je Sorte: Kristall in Linienoptik (Nickel = Prisma, Cobalt = Splitterbündel, Platinum = Oktaeder)
function oreMark(id) {
  const d = id === 'nickel'
    ? '<path class="o" d="M4 3 L10 3 L12 7 L10 11 L4 11 L2 7 Z"/><path class="i" d="M4 3 L6 7 L4 11 M10 3 L8 7 L10 11 M6 7 H8"/>'
    : id === 'cobalt'
      ? '<path class="o" d="M3 12 L5 3 L7 12 Z M7 12 L9.5 5 L12 12 Z"/><path class="i" d="M5 3 V12 M9.5 5 V12 M2 12 H13"/>'
      : '<path class="o" d="M7 1.5 L12 7 L7 12.5 L2 7 Z"/><path class="i" d="M2 7 H12 M7 1.5 L5.5 7 L7 12.5 L8.5 7 Z"/>';
  return `<svg class="sx-om is-${id}" viewBox="0 0 14 14" aria-hidden="true">${d}</svg>`;
}
// Munition an Bord je Typ als segmentierter Balken (Bezug: 10 Packungen)
function stockBlock(p) {
  let rows = '';
  const list = Object.keys(AMMO).map((k) => [k, AMMO[k].pack]).concat([['R1', ROCKETS.R1.pack]]);
  for (const [k, pack] of list) {
    const n = (p.ammo && p.ammo[k]) || 0;
    const v = Math.min(1, n / (pack * 10));
    rows += `<div class="sx-sk${n ? '' : ' is-dim'}${p.selectedAmmo === k ? ' is-sel' : ''}"><span class="sx-sk-k">${k}</span><div class="ls-bar" style="--v:${v.toFixed(3)};--trail:0"></div><span class="ls-num">${fmt(n)}</span></div>`;
  }
  return `<div class="sx-stock-h"><span class="ls-label">Bestand an Bord</span><span class="sx-head-r">BALKEN = 10 PACK.</span></div>${rows}`;
}
function valOf(kind, id) {
  const d = kind === 'laser' ? LASERS[id] : GENERATORS[id];
  return d ? (kind === 'laser' ? d.damage : d.value) : 0;
}
function countOf(arr, id) {
  let n = 0;
  if (arr) for (const x of arr) if (x === id) n++;
  return n;
}
function weakest(arr, f) {
  let m = Infinity;
  for (const x of arr) { const v = f(x); if (v < m) m = v; }
  return m === Infinity ? 0 : m;
}
function cargoUsed(p) {
  let n = 0;
  const c = p.cargo || {};
  for (const k in c) n += c[k] || 0;
  return n;
}
function nextLaser(p) {
  const L = p.loadout.lasers;
  const wv = weakest(L, (x) => (LASERS[x] ? LASERS[x].damage : 0));
  for (const id in LASERS) if (!LASERS[id].dropOnly && LASERS[id].damage > wv) return id;
  return Object.keys(LASERS)[0];
}
// nächste Freigabe über die Stufe (echte Daten aus dem Katalog)
function nextUnlock(p) {
  const lvl = p.level || 1;
  let best = null;
  for (const id in SHIPS) {
    const d = SHIPS[id];
    if ((d.level || 1) > lvl && (!best || d.level < best.level)) best = d;
  }
  if (!best) return '';
  const bid = Object.keys(SHIPS).find((k) => SHIPS[k] === best);
  return `<div class="sx-nx"><span class="ls-label">Nächste Freigabe</span><b>${esc(shipLabel(bid))}</b><span class="ls-num">Stufe ${best.level}${best.locked ? ' · Erprobung' : ''}</span></div>`;
}
function berthOf(name) {
  let h = 7;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = (h % 24) + 1;
  return (n < 10 ? '0' : '') + n;
}
