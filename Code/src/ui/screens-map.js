// Taktische Sektorkarte für Mission Control: Randzone (Gefahr), Patrouillenraum der Gegner mit Typkürzeln,
// Frachtkisten und Erz als Punktwolke (gleiche Abstandsregeln wie die Simulation), sichere Zone, Flugroute
// Station > Tor mit Distanz, Eigenposition. Achsen in Kilometern. Beschriftungen ohne Überlappung.
import { ENEMIES, BACKDROPS } from '../core/data.js';
import {
  SAFE_RADIUS, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL, ITEM_MIN_STATION,
} from '../sim/config.js';
import { Rng, hashString } from '../sim/rng.js';
import { esc } from './screens-kit.js';

export const ENEMY_CODE = { raider: 'RD', larva: 'LV', jackal: 'JK', spiker: 'SP', vulture: 'VT' };
const HAZARD_BAND = 300;   // Warnstreifen innen an der Sektorgrenze (wie im All dargestellt)
const SPREAD = 0.9;        // Anteil der Karte, in dem Gegner und Beute erscheinen
const F = 128;             // Schriftgröße in Metern (≈ 9 px bei 400 px Kartenbreite)

const km = (m, sign = true) => {
  const v = Math.abs(m) / 1000;
  const t = (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace(',0', '');
  if (!m) return '0';
  return `${m < 0 ? '−' : sign ? '+' : ''}${t}`;
};
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** Punkt nach den Regeln von World._randomPoint (Abstand zu Station und Toren) */
function point(rng, sec, minSt, minPt) {
  const lim = sec.size * SPREAD;
  let x = 0, z = 0;
  for (let t = 0; t < 60; t++) {
    x = rng.range(-lim, lim); z = rng.range(-lim, lim);
    let ok = true;
    if (sec.station && dist(x, z, sec.station.x, sec.station.z) < minSt) ok = false;
    for (const p of sec.portals || []) if (ok && dist(x, z, p.x, p.z) < minPt) ok = false;
    if (ok) break;
  }
  return [x, z];
}

/** Beschriftungen ohne Überlappung: Kandidaten rechts, links, oben, unten */
class Labels {
  constructor(bounds) { this.boxes = []; this.b = bounds; }
  block(x0, y0, x1, y1) { this.boxes.push([x0, y0, x1, y1]); }
  free(x0, y0, x1, y1) {
    const b = this.b;
    if (x0 < b[0] || y0 < b[1] || x1 > b[2] || y1 > b[3]) return false;
    for (const q of this.boxes) if (x0 < q[2] && x1 > q[0] && y0 < q[3] && y1 > q[1]) return false;
    return true;
  }
  /** Text bei (x, y) mit Abstand gap zum Symbol setzen. Liefert SVG oder ''. */
  place(x, y, gap, lines, cls = 'c-lb', force = false) {
    const fs = cls.split(' ')[0] === 'c-lb' ? F * 1.12 : F;
    const w = Math.max(...lines.map((l) => l.length)) * fs * 0.62 + fs * 0.4;
    const h = lines.length * fs * 1.2;
    const cand = [
      [x + gap, y - h / 2, 'start'], [x - gap - w, y - h / 2, 'start'],
      [x - w / 2, y - gap - h, 'start'], [x - w / 2, y + gap, 'start'],
      [x + gap, y - gap - h, 'start'], [x + gap, y + gap, 'start'],
      [x - gap - w, y - gap - h, 'start'], [x - gap - w, y + gap, 'start'],
    ];
    const out = (cx, cy) => {
      this.block(cx, cy, cx + w, cy + h);
      return lines.map((l, i) => `<text x="${cx.toFixed(0)}" y="${(cy + fs * (0.95 + i * 1.2)).toFixed(0)}" class="${i ? 'c-lb2' : cls}">${esc(l)}</text>`).join('');
    };
    for (const [cx, cy] of cand) if (this.free(cx, cy, cx + w, cy + h)) return out(cx, cy);
    if (!force) return '';
    // kein freier Platz: in das Kartenfeld schieben (Station, Tore müssen beschriftet sein)
    const b = this.b;
    for (const [cx, cy] of cand) {
      const qx = Math.max(b[0], Math.min(b[2] - w, cx)), qy = Math.max(b[1], Math.min(b[3] - h, cy));
      if (this.free(qx, qy, qx + w, qy + h)) return out(qx, qy);
    }
    const [cx, cy] = cand[0];
    return out(Math.max(b[0], Math.min(b[2] - w, cx)), Math.max(b[1], Math.min(b[3] - h, cy)));
  }
}

/**
 * @param sec Sektor aus sectorsFor()
 * @param o { faction, gateName(id), speed, uid }
 */
export function sectorMap(sec, o = {}) {
  if (!sec) return '';
  const S = sec.size;
  const PL = 470, PR = 130, PT = 300, PB = 330;
  const uid = o.uid || 'm';
  const rng = new Rng(hashString(`${sec.id}|karte`));
  const st = sec.station;
  const ports = sec.portals || [];
  // Beschriftungen nur im Kartenfeld innerhalb der Randzone
  const L = new Labels([-S + HAZARD_BAND + 30, -S + HAZARD_BAND + 30, S - HAZARD_BAND - 30, S - HAZARD_BAND - 30]);
  const out = [];

  // Raster: Hauptlinien je S/4, feine je S/8
  let minor = '', major = '';
  for (let i = -8; i <= 8; i++) {
    const v = (S * i) / 8;
    const d = `M${v} ${-S}V${S}M${-S} ${v}H${S}`;
    if (i % 2) minor += d; else major += d;
  }
  out.push(`<rect x="${-S}" y="${-S}" width="${2 * S}" height="${2 * S}" class="c-bg"/>`);
  out.push(`<path d="${minor}" class="c-g"/><path d="${major}" class="c-gm"/>`);

  // Randzone mit Schraffur (Gefahr des Heimatsektors)
  const hz = S - HAZARD_BAND;
  out.push(`<defs><pattern id="hz-${uid}" width="110" height="110" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="38" height="110" class="c-hzp"/></pattern></defs>`);
  out.push(`<path d="M${-S} ${-S}H${S}V${S}H${-S}Z M${-hz} ${-hz}V${hz}H${hz}V${-hz}Z" fill="url(#hz-${uid})" fill-rule="evenodd" class="c-hz"/>`);
  out.push(`<rect x="${-hz}" y="${-hz}" width="${2 * hz}" height="${2 * hz}" class="c-hzl"/>`);
  // Patrouillenraum der Gegner (90 % der Karte)
  const pz = S * SPREAD;
  out.push(`<rect x="${-pz}" y="${-pz}" width="${2 * pz}" height="${2 * pz}" class="c-pz"/>`);

  // Ausschlusszonen: um die Station kein Gegner-Spawn, um Tore ebenso
  if (st) out.push(`<circle cx="${st.x}" cy="${st.z}" r="${SPAWN_MIN_STATION}" class="c-ex"/>`);
  for (const p of ports) out.push(`<circle cx="${p.x}" cy="${p.z}" r="${SPAWN_MIN_PORTAL}" class="c-ex"/>`);

  // Flugroute Station > Tor (ohne Station: Tor > Tor)
  const from = st ? { x: st.x, z: st.z } : ports[0];
  const to = st ? ports[0] : ports[1];
  let routeMid = null;
  if (from && to) {
    const d = dist(from.x, from.z, to.x, to.z);
    out.push(`<path d="M${from.x} ${from.z}L${to.x} ${to.z}" class="c-rt"/>`);
    routeMid = { from, to, d };
  }

  // Frachtkisten und Erz (Punktwolke), Kontakte mit Typkürzel
  let crates = '', ore = '', foes = '';
  for (let i = 0; i < (sec.crates || 0); i++) {
    const [x, z] = point(rng, sec, ITEM_MIN_STATION, 250);
    crates += `<rect x="${(x - 34).toFixed(0)}" y="${(z - 34).toFixed(0)}" width="68" height="68" class="c-cr"/>`;
  }
  let oreN = 0;
  for (const k in sec.ore || {}) oreN += sec.ore[k];
  for (let i = 0; i < oreN; i++) {
    const [x, z] = point(rng, sec, ITEM_MIN_STATION, 250);
    ore += `<circle cx="${x.toFixed(0)}" cy="${z.toFixed(0)}" r="22" class="c-or"/>`;
  }
  const foePts = [];
  for (const sp of sec.spawns || []) {
    const code = ENEMY_CODE[sp.type] || sp.type.slice(0, 2).toUpperCase();
    for (let i = 0; i < sp.count; i++) {
      const [x, z] = point(rng, sec, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL);
      foePts.push([x, z, code]);
    }
  }
  // Kontakte nur als Symbol; das Typkürzel erscheint beim Überfahren (größere Trefferfläche)
  for (const [x, z, code] of foePts) {
    const name = ENEMIES[Object.keys(ENEMY_CODE).find((k) => ENEMY_CODE[k] === code)]?.name || code;
    foes += `<g class="c-foe-g"><circle cx="${x.toFixed(0)}" cy="${z.toFixed(0)}" r="120" class="c-hit"/><path d="M${x.toFixed(0)} ${(z - 46).toFixed(0)}l40 70h-80z" class="c-foe"/>`
      + `<text x="${(x + 64).toFixed(0)}" y="${(z + 30).toFixed(0)}" class="c-foe-t">${code} · ${esc(name.toUpperCase())}</text></g>`;
  }
  out.push(`<g>${ore}</g><g>${crates}</g><g>${foes}</g>`);

  // Station mit sicherer Zone
  if (st) {
    out.push(`<circle cx="${st.x}" cy="${st.z}" r="${SAFE_RADIUS}" class="c-safe"/>`);
    out.push(`<rect x="${st.x - 80}" y="${st.z - 80}" width="160" height="160" class="c-st"/>`);
    out.push(`<path d="M${st.x - 140} ${st.z}H${st.x + 140}M${st.x} ${st.z - 140}V${st.z + 140}" class="c-st"/>`);
    L.block(st.x - SAFE_RADIUS, st.z - SAFE_RADIUS, st.x + SAFE_RADIUS, st.z + SAFE_RADIUS);
  }
  for (const p of ports) {
    out.push(`<path d="M${p.x} ${p.z - 130}L${p.x + 130} ${p.z}L${p.x} ${p.z + 130}L${p.x - 130} ${p.z}Z" class="c-pt"/>`);
    out.push(`<path d="M${p.x} ${p.z - 60}L${p.x + 60} ${p.z}L${p.x} ${p.z + 60}L${p.x - 60} ${p.z}Z" class="c-pt2"/>`);
    L.block(p.x - 150, p.z - 150, p.x + 150, p.z + 150);
  }
  // Eigenposition: an der Station, zur Kartenmitte versetzt (sonst am ersten Tor)
  const home = st || ports[0];
  let me = null;
  if (home) {
    const l = Math.hypot(home.x, home.z) || 1;
    const off = st ? 180 : 120;
    me = { x: home.x - (home.x / l) * off, z: home.z - (home.z / l) * off };
    const a = Math.atan2(-me.x, -me.z);
    out.push(`<g transform="translate(${me.x.toFixed(0)} ${me.z.toFixed(0)}) rotate(${(-a * 180 / Math.PI + 180).toFixed(1)})"><path d="M0 -110L70 80L0 40L-70 80Z" class="c-me"/></g>`);
  }

  // Beschriftungen: erst Symbole, dann Kontakte als Hindernis, dann Texte
  for (const [x, z] of foePts) L.block(x - 50, z - 55, x + 50, z + 35);
  const labels = [];
  if (st) labels.push(L.place(st.x, st.z, SAFE_RADIUS + 50, [`STATION ${st.name.toUpperCase()}`, `SICHERE ZONE ${SAFE_RADIUS} M`], 'c-lb', true));
  for (const p of ports) labels.push(L.place(p.x, p.z, 190, [`TOR ${p.to}`, (o.gateName?.(p.to) || '').toUpperCase()], 'c-lb', true));
  if (routeMid) {
    const eta = o.speed ? Math.round(routeMid.d / o.speed) : 0;
    const lines = [`ROUTE ${km(routeMid.d, false)} KM`, eta ? `${Math.floor(eta / 60)}:${String(eta % 60).padStart(2, '0')} MIN · ${o.speed} M/S` : ''].filter(Boolean);
    const { from: a, to: b } = routeMid;
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
      const svg = L.place(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 70, lines, 'c-lb c-lb-rt');
      if (svg) { labels.push(svg); break; }
    }
  }
  if (me) labels.push(L.place(me.x, me.z, 150, ['EIGENPOSITION'], 'c-lb c-lb-me'));
  const hazard = (BACKDROPS[o.faction]?.hazard || 'RANDZONE').toUpperCase();
  out.push(`<text x="0" y="${S - 95}" text-anchor="middle" class="c-hzt">${esc(hazard)} · RANDZONE ${HAZARD_BAND} M</text>`);
  out.push(labels.join(''));

  // Achsen in km
  let ax = '';
  for (let i = -4; i <= 4; i++) {
    if (i % 2) continue;
    const v = (S * i) / 4;
    ax += `<text x="${v}" y="${S + 175}" text-anchor="middle">${km(v)}</text>`;
    ax += `<text x="${-S - 60}" y="${v + 45}" text-anchor="end">${km(v)}</text>`;
    ax += `<path d="M${v} ${S}v60M${-S} ${v}h-40" class="c-tk"/>`;
  }
  // Einheiten außerhalb der Skalenwerte: X unter der Zahlenreihe links, Z über der Zahlenspalte
  ax += `<text x="${-S}" y="${S + 300}" text-anchor="start" class="c-unit">X · KM</text>`;
  ax += `<text x="${-S - 60}" y="${-S - 150}" text-anchor="end" class="c-unit">Z · KM</text>`;
  out.push(`<g class="c-num">${ax}</g>`);

  return `<svg class="mc-chart" viewBox="${-S - PL} ${-S - PT} ${2 * S + PL + PR} ${2 * S + PT + PB}" role="img" aria-label="Sektorkarte ${esc(sec.id)}">${out.join('')}</svg>`;
}
