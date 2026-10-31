// Stationen je Fraktion mit eigener Silhouette (prozedural, bis echte GLB-Modelle da sind;
// ein GLB unter 'station:saturn' usw. ersetzt das Modell sofort):
//   Europa  Forschungsstation aus weißer Keramik und Gold: Sechseck-Deck, Glaskuppeln mit goldenen Rippen und
//           warmem Innenlicht, Forschungsnadel nach unten, große Antennenschüssel, drei Andockfinger, Landefeld
//   Saturn  Industriehafen in den Ringen: Kastenring mit Container-Stapeln und Warnstreifen, Laufkräne,
//           halb gebauter Rumpf mit Schweißlicht, Frachter-Liegeplätze, Leitstand mit Leuchtschrift, Tanklager
//   Eris    ehemaliger Gefängnisring: Kernblock mit Zellentrakten im X, äußerer Ring aus schwarzen Zellenblöcken
//           mit Stacheln und violetten Energieleitungen, Suchscheinwerfer (stationlife.js), beleuchteter Hangar
// Dazu je Station: Positionslichter (Blinker, Doppelblitz, Lauflicht-Ketten), Scheinwerferkegel mit Lichtfleck,
// Beschriftung und Kennnummern als Decals. Kontaktschatten stecken als Vertex-Farbe in den Teilen.
// Lokale Achsen: +y oben, Kamera blickt von +z schräg herab; der Ausleger (arms) zeigt nach +x und wird
// im Spiel von der Kartenmitte weg gedreht.
import * as THREE from 'three';
import { PI, BOX, CYL, CYL6, SPH, HALF, CONE, TOR, T, beam, spike, Parts, setAO, P as prim } from './geo.js';
const OCT = () => prim('oct8', () => new THREE.CylinderGeometry(1, 1, 1, 8, 1));
const OCTT = () => prim('oct8t', () => new THREE.CylinderGeometry(1, 0.55, 1, 8, 1));
import { rng } from './textures.js';
import { lightPointsGeometry, lightConesGeometry, buildDecals } from './surface.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _e = new THREE.Euler();

const RED = [1.6, 0.16, 0.08], GRN = [0.25, 1.4, 0.5], WHT = [1.7, 1.7, 1.7], WARM = [1.4, 1.0, 0.62];
const WELD = [0.9, 1.25, 1.9], AMB = [1.5, 0.8, 0.2];
const LAMP = [0.9, 0.85, 0.72], LAMP_C = [0.62, 0.72, 0.95];

// Instanzlisten: pipe (Zylinder, Achse y), tank (Kapsel, Achse y), cont (Container), vent (Lüftertopf)
class Inst {
  constructor() { this.l = { pipe: [], tank: [], cont: [], vent: [] }; }
  _push(kind, group, col) { this.l[kind].push({ group, m: _m.clone(), c: col || [1, 1, 1] }); }
  pipe(group, ax, ay, az, bx, by, bz, r) {
    _p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    _a.set(bx - ax, by - ay, bz - az);
    const len = _a.length();
    _q.setFromUnitVectors(_up, _a.normalize());
    _s.set(r, len, r);
    _m.compose(_p, _q, _s); this._push('pipe', group);
  }
  tank(group, x, y, z, r, len, rx = 0, ry = 0, rz = 0) {
    _q.setFromEuler(_e.set(rx, ry, rz)); _p.set(x, y, z); _s.set(r, len, r);
    _m.compose(_p, _q, _s); this._push('tank', group);
  }
  cont(group, x, y, z, sx, sy, sz, ry, col) {
    _q.setFromAxisAngle(_up, ry); _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s); this._push('cont', group, col);
  }
  vent(group, x, y, z, r, h) {
    _q.identity(); _p.set(x, y, z); _s.set(r, h, r);
    _m.compose(_p, _q, _s); this._push('vent', group);
  }
  pack() {
    const out = {};
    for (const k in this.l) {
      out[k] = {};
      for (const g of ['hub', 'arms']) {
        const list = this.l[k].filter((e) => e.group === g);
        const a = new Float32Array(list.length * 16), c = new Float32Array(list.length * 3);
        list.forEach((e, i) => { e.m.toArray(a, i * 16); c.set(e.c, i * 3); });
        out[k][g] = { m: a, c };
      }
    }
    return out;
  }
}

// Baukasten: Teile je Gruppe, Lichter, Kegel, Beschriftung
class Kit {
  constructor() {
    this.G = { hub: new Parts(), spin: new Parts(), arms: new Parts() };
    this.I = new Inst(); this.L = { hub: [], spin: [], arms: [] }; this.C = { hub: [], spin: [], arms: [] }; this.D = [];
  }
  add(g, slot, geo) { this.G[g].add(slot, geo); }
  box(g, slot, x, y, z, sx, sy, sz, ry = 0) { this.G[g].add(slot, T(BOX(), x, y, z, 0, ry, 0, sx, sy, sz)); }
  beam(g, slot, ax, ay, az, bx, by, bz, w, h = w) { this.G[g].add(slot, beam(ax, ay, az, bx, by, bz, w, h)); }
  // Fachwerkträger zwischen zwei Punkten: zwei Gurte, Pfosten und Diagonalen
  truss(g, ax, az, bx, bz, y, w, h, n, slotA = 'dark', slotB = 'dark') {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = -dz / L * w / 2, nz = dx / L * w / 2;
    for (const s of [-1, 1]) {
      this.beam(g, slotA, ax + nx * s, y + h / 2, az + nz * s, bx + nx * s, y + h / 2, bz + nz * s, 1.6, 1.6);
      this.beam(g, slotA, ax + nx * s, y - h / 2, az + nz * s, bx + nx * s, y - h / 2, bz + nz * s, 1.6, 1.6);
    }
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + dx * t, z = az + dz * t;
      this.beam(g, slotB, x + nx, y - h / 2, z + nz, x - nx, y - h / 2, z - nz, 0.8, 0.8);
      this.beam(g, slotB, x + nx, y + h / 2, z + nz, x - nx, y + h / 2, z - nz, 0.8, 0.8);
      if (i < n) {
        const t2 = (i + 1) / n, x2 = ax + dx * t2, z2 = az + dz * t2;
        for (const s of [-1, 1]) this.beam(g, slotB, x + nx * s, y - h / 2, z + nz * s, x2 + nx * s, y + h / 2, z2 + nz * s, 0.6, 0.6);
      }
    }
  }
  light(g, mode, x, y, z, size, col, phase = 0) { this.L[g].push([mode, x, y, z, size, col[0], col[1], col[2], phase]); }
  // Lichterkette entlang einer Strecke (Lauflicht, Phase steigt nach außen)
  chain(g, ax, ay, az, bx, by, bz, n, col, size = 5, mode = 3) {
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      this.light(g, mode, ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, size, col, t * 0.9);
    }
  }
  cone(g, x, y, z, dx, dy, dz, len, rad, col = LAMP, spotY = null) { this.C[g].push([x, y, z, dx, dy, dz, len, rad, col, spotY]); }
  decal(g, kind, text, x, y, z, w, h, rx = -PI / 2, ry = 0, color) { this.D.push({ g, kind, text, x, y, z, w, h, rx, ry, color }); }
  // Fenster als eigene Leuchtkästen (Reihe entlang einer Fassade)
  windows(g, x0, y, z0, x1, z1, n, w, h, fill, R, depth = 0.5) {
    const dx = x1 - x0, dz = z1 - z0, ry = -Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      if (R() > fill) continue;
      const t = (i + 0.5) / n;
      this.box(g, 'win', x0 + dx * t, y, z0 + dz * t, w, h, depth, ry);
    }
  }
}

// ---------------- gemeinsame Bausteine ----------------
// Alle Teile bleiben unter lokal y = 30 (Stationswurzel liegt bei −44 → Oberkante ≈ 14 m unter der Spielebene),
// damit das Spielerschiff nie in Aufbauten steckt. Masse und Tiefe entstehen nach unten.
const TOP = 30;
const rot2 = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

// Feindetail auf einer Fläche: flache Kästen unterschiedlicher Größe (Lüfter, Leitungskästen, Luken), dicht an dicht
function greebles(K, g, cx, cz, w, d, y, n, R, ry = 0, hMax = 2.4, slots = ['dark', 'trim', 'hull']) {
  for (let i = 0; i < n; i++) {
    const sx = 1.5 + Math.pow(R(), 1.6) * Math.min(14, w * 0.3), sz = 1.5 + Math.pow(R(), 1.6) * Math.min(14, d * 0.3);
    const lx = (R() - 0.5) * (w - sx), lz = (R() - 0.5) * (d - sz);
    const [x, z] = rot2(lx, lz, -ry);
    const h = 0.4 + R() * hMax;
    K.box(g, slots[(R() * slots.length) | 0], cx + x, Math.min(TOP, y + h / 2), cz + z, sx, h, sz, ry);
  }
}
// Leuchtendes Fensterband vor einer senkrechten Fassade von a nach b (leicht vor der Fläche)
function band(K, g, ax, az, bx, bz, y, h, slot = 'band', out = 0.35) {
  const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), nx = dz / L, nz = -dx / L;
  K.box(g, slot, (ax + bx) / 2 + nx * out, y, (az + bz) / 2 + nz * out, L, h, 0.3, -Math.atan2(dz, dx));
}
// Fensterband rund um einen Zylinder (Radius r), in Segmenten mit Stegen dazwischen
function ringBand(K, g, cx, cz, r, y, h, n, slot = 'band', gap = 0.18) {
  for (let i = 0; i < n; i++) {
    const a0 = (i + gap / 2) / n * PI * 2, a1 = (i + 1 - gap / 2) / n * PI * 2;
    band(K, g, cx + Math.cos(a0) * r, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, cz + Math.sin(a1) * r, y, h, slot, 0.3);
  }
}
// Hangar: dunkler, tiefer Schacht in einer Fassade, Lichtleisten an Rahmen und Boden, Arbeitslicht hinten
function hangar(K, g, x, y, z, w, h, depth, ry, R) {
  const [fx, fz] = rot2(0, 1, -ry); // Fassadennormale
  const at = (u, v, d) => { const [ox, oz] = rot2(u, d, -ry); return [x + ox, y + v, z + oz]; };
  let p = at(0, 0, -depth / 2 + 0.5); K.box(g, 'shaft', p[0], p[1], p[2], w, h, depth, ry);
  // Rahmen
  for (const s of [-1, 1]) { p = at(s * (w / 2 + 1.4), 0, 0.6); K.box(g, 'trim', p[0], p[1], p[2], 2.8, h + 5.6, 2.4, ry); }
  p = at(0, h / 2 + 1.4, 0.6); K.box(g, 'trim', p[0], p[1], p[2], w + 5.6, 2.8, 2.4, ry);
  p = at(0, -h / 2 - 1.4, 0.6); K.box(g, 'trim', p[0], p[1], p[2], w + 5.6, 2.8, 2.4, ry);
  // Lichtleisten: oben am Rahmen innen, Bodenführung in Tiefe gestaffelt
  p = at(0, h / 2 - 0.6, 0.2); K.box(g, 'hgl', p[0], p[1], p[2], w - 2, 0.5, 0.6, ry);
  for (let k = 0; k < 5; k++) {
    for (const s of [-1, 1]) { p = at(s * (w / 2 - 1.6), -h / 2 + 0.5, -2 - k * depth / 6); K.box(g, 'hgl', p[0], p[1], p[2], 0.7, 0.4, depth / 9, ry); }
  }
  p = at(0, 0, -depth + 1.6); K.box(g, 'domeIn', p[0], p[1], p[2], w - 3, h - 3, 0.4, ry);
  p = at(0, -h / 2 + 2.5, -depth * 0.55); K.box(g, 'dark', p[0], p[1], p[2], w * 0.35, 4, 9, ry);
  for (const s of [-1, 1]) { p = at(s * (w / 2 + 3.6), h / 2 + 3.4, 1.4); K.light(g, 1, p[0], p[1], p[2], 5, AMB, R() * 0.6); }
  return [fx, fz];
}

// ---------------- Europa ----------------
// Eis-Bohrstation: schwere Sechseck-Plattform in Stufen, geschlossener Kern mit Bohrkopf-Einhausung,
// drei massive Habitatkuppeln mit Rippen, Wohnriegel mit warmen Fensterbändern, Forschungsnadel nach unten,
// Ausleger als geschlossener Kastenträger zur Landeplattform.
function europa() {
  const K = new Kit(), R = rng(51);
  const hx = (k, r) => [Math.sin(k * PI / 3) * r, Math.cos(k * PI / 3) * r];
  // Plattform: Deck, Randwulst, drei Stufen nach unten mit Fensterbändern
  K.add('hub', 'deck', T(CYL6(), 0, 2, 0, 0, 0, 0, 112, 6, 112));
  K.add('hub', 'hull', T(CYL6(), 0, -8, 0, 0, 0, 0, 116, 14, 116));
  K.add('hub', 'dark', T(CYL6(), 0, -22, 0, 0, 0, 0, 100, 14, 100));
  K.add('hub', 'hull', T(CYL6(), 0, -40, 0, 0, 0, 0, 82, 22, 82));
  K.add('hub', 'dark', T(CYL6(), 0, -62, 0, 0, 0, 0, 58, 22, 58));
  K.add('hub', 'hull', T(CONE(), 0, -96, 0, PI, 0, 0, 44, 48, 44));
  for (let k = 0; k < 6; k++) {
    const [ax, az] = hx(k, 116), [bx, bz] = hx(k + 1, 116);
    K.beam('hub', 'trim', ax, 5.4, az, bx, 5.4, bz, 2.2, 1.6);                 // Randlippe
    band(K, 'hub', bx, bz, ax, az, -6, 1.6, 'band', 0.4);
    band(K, 'hub', bx, bz, ax, az, -11, 1.1, 'win', 0.4);
    const [cx, cz] = hx(k, 100), [dx2, dz2] = hx(k + 1, 100);
    band(K, 'hub', dx2, dz2, cx, cz, -24, 1.2, 'win', 0.4);
    const [ex, ez] = hx(k, 82), [fx, fz] = hx(k + 1, 82);
    band(K, 'hub', fx, fz, ex, ez, -38, 1.4, 'band', 0.4);
    // Stützrippen unter der Plattform (verbinden die Stufen)
    K.beam('hub', 'trim', ax * 0.95, -14, az * 0.95, ax * 0.5, -70, az * 0.5, 5, 6);
    K.light('hub', 1, ax * 1.01, 7, az * 1.01, 8, RED, k * 0.17);
  }
  // Kern: Bohrkopf-Einhausung (geschlossen, gestuft), Ringband, Abluftstutzen, Radar oben
  K.add('hub', 'hull', T(CYL6(), 0, 12, 0, 0, PI / 6, 0, 34, 16, 34));
  K.add('hub', 'trim', T(CYL6(), 0, 20.6, 0, 0, PI / 6, 0, 30, 1.6, 30));
  K.add('hub', 'hab', T(CYL(), 0, 24, 0, 0, 0, 0, 20, 6, 20));
  K.add('hub', 'dark', T(CYL(), 0, 27.4, 0, 0, 0, 0, 12, 1.2, 12));
  ringBand(K, 'hub', 0, 0, 20.3, 24, 1.2, 16, 'band');
  for (let k = 0; k < 6; k++) {
    const [x, z] = hx(k + 0.5, 30);
    K.box('hub', 'dark', x, 22, z, 7, 4, 7, -k * PI / 3);
    K.add('hub', 'trim', T(CYL(), x, 25, z, 0, 0, 0, 2, 2, 2));
  }
  // Habitatkuppeln: massive Schale, sechs tragende Rippen mit Volumen, Fensterband am Fuß, Lichtkrone
  for (let k = 0; k < 3; k++) {
    const a = PI / 6 + k * PI * 2 / 3 + PI / 3, x = Math.sin(a) * 66, z = Math.cos(a) * 66, r = k === 0 ? 26 : 21;
    K.add('hub', 'trim', T(CYL(), x, 6.5, z, 0, 0, 0, r + 3, 3, r + 3));
    K.add('hub', 'hull', T(HALF(), x, 8, z, 0, 0, 0, r, Math.min(r * 0.62, TOP - 10), r));
    ringBand(K, 'hub', x, z, r + 0.2, 9.4, 1.6, 12, 'band', 0.25);
    for (let j = 0; j < 6; j++) {
      const b = j / 6 * PI * 2;
      let px = x + Math.cos(b) * (r + 0.6), py = 8, pz = z + Math.sin(b) * (r + 0.6);
      for (let st = 1; st <= 4; st++) {
        const th = st / 4 * PI / 2 * 0.92, rr = Math.cos(th) * (r + 0.6), yy = 8 + Math.sin(th) * Math.min(r * 0.62, TOP - 10) + 0.6;
        const qx = x + Math.cos(b) * rr, qz = z + Math.sin(b) * rr;
        K.beam('hub', 'trim', px, py, pz, qx, yy, qz, 1.8, 1.4);
        px = qx; py = yy; pz = qz;
      }
    }
    K.add('hub', 'dark', T(CYL(), x, 8 + Math.min(r * 0.62, TOP - 10), z, 0, 0, 0, r * 0.3, 1.6, r * 0.3));
    K.light('hub', 0, x, 9 + Math.min(r * 0.62, TOP - 10), z, 5, WHT);
    for (let j = 0; j < 4; j++) K.light('hub', 1, x + Math.cos(j * 1.57) * (r + 3), 8.5, z + Math.sin(j * 1.57) * (r + 3), 4, RED, j * 0.2 + k);
  }
  // Wohnriegel an drei Kanten: zwei Geschosse, Fensterbänder, Dachaufbauten
  for (const k of [0, 2, 4]) {
    const [ax, az] = hx(k, 97), [bx, bz] = hx(k + 1, 97);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, ry = -Math.atan2(bz - az, bx - ax), L = 62;
    K.box('hub', 'hab', mx, 11, mz, L, 12, 16, ry);
    K.box('hub', 'hull', mx * 0.97, 19, mz * 0.97, L - 10, 4, 12, ry);
    const ux = Math.cos(-ry), uz = Math.sin(-ry), nx = mx / 97, nz = mz / 97;
    band(K, 'hub', mx + ux * L / 2 + nx * 8, mz + uz * L / 2 + nz * 8, mx - ux * L / 2 + nx * 8, mz - uz * L / 2 + nz * 8, 13, 1.4, 'band', 0.2);
    band(K, 'hub', mx + ux * L / 2 + nx * 8, mz + uz * L / 2 + nz * 8, mx - ux * L / 2 + nx * 8, mz - uz * L / 2 + nz * 8, 8.5, 1.0, 'win', 0.2);
    for (const t of [-0.5, 0.5]) K.box('hub', 'trim', mx + ux * L * t, 12, mz + uz * L * t, 3, 14, 18, ry);
    greebles(K, 'hub', mx * 0.97, mz * 0.97, L - 12, 10, 21, 10, R, ry, 1.8);
  }
  // Deckaufbauten: Leitungskästen, Luken und Wartungsflächen in den freien Sektoren, Laufstege zum Kern
  for (const k of [1, 3, 5]) {
    const a = PI / 2 - (k + 0.5) * PI / 3, cx = Math.cos(a) * 58, cz = Math.sin(a) * 58;
    greebles(K, 'hub', cx, cz, 30, 22, 5, 16, R, -a + PI / 2, 2.2);
  }
  for (let k = 0; k < 6; k++) {
    const a = PI / 2 - k * PI / 3, x0 = Math.cos(a) * 36, z0 = Math.sin(a) * 36, x1 = Math.cos(a) * 92, z1 = Math.sin(a) * 92;
    K.beam('hub', 'trim', x0, 5.6, z0, x1, 5.6, z1, 3.2, 0.8);
    K.beam('hub', 'dark', x0, 6.2, z0, x1, 6.2, z1, 1.2, 0.6);
  }
  // Tanks und Leitungen zwischen den Riegeln
  for (const k of [1, 3, 5]) {
    const a = PI / 2 - (k + 0.5) * PI / 3, cx = Math.cos(a) * 86, cz = Math.sin(a) * 86;
    for (let j = -1; j <= 1; j++) {
      const tx = cx - Math.sin(a) * j * 10, tz = cz + Math.cos(a) * j * 10;
      K.I.tank('hub', tx, 10, tz, 4, 16, PI / 2, -a + PI / 2, 0);
      K.I.pipe('hub', tx * 0.8, 6, tz * 0.8, tx * 0.3, 6, tz * 0.3, 0.9);
    }
  }
  // Forschungsnadel nach unten: schlanker Keramikmast mit goldenen Ringen und Sensorkapseln, Leuchtspitze
  K.add('hub', 'hull', T(CYL(), 0, -150, 0, 0, 0, 0, 4.2, 170, 4.2));
  for (let y = -100; y > -232; y -= 18) {
    K.add('hub', 'trim', T(CYL(), 0, y, 0, 0, 0, 0, 7.5, 1.6, 7.5));
    K.add('hub', 'dark', T(CYL(), 0, y - 3, 0, 0, 0, 0, 5.4, 1.2, 5.4));
  }
  for (let k = 0; k < 3; k++) {
    const a = k * PI * 2 / 3 + 0.4, x = Math.cos(a) * 9, z = Math.sin(a) * 9;
    K.add('hub', 'hab', T(SPH(), x, -168, z, 0, 0, 0, 4.2, 9, 4.2));
    K.beam('hub', 'trim', x * 0.3, -168, z * 0.3, x, -168, z, 1.2, 1.2);
    K.light('hub', 0, x * 1.5, -168, z * 1.5, 4, WARM);
  }
  K.add('hub', 'trim', T(CONE(), 0, -246, 0, PI, 0, 0, 5, 20, 5));
  K.light('hub', 1, 0, -258, 0, 7, WARM, 0.3);
  // Antennenschüssel (große Forschungsantenne) auf einem Kragarm am Deckrand, zum Himmel geneigt
  {
    const ax = -86, az = 36;
    K.beam('hub', 'trim', -58, 6, 22, ax, 10, az, 3, 3);
    K.add('hub', 'hull', T(CYL(), ax, 6, az, 0, 0, 0, 3.4, 6, 3.4));
    K.add('hub', 'hull', T(HALF(), ax, 11, az, PI * 0.78, 0.5, 0, 22, 5, 22));
    K.add('hub', 'trim', T(TOR(0.06), ax, 10.4, az, PI / 2 + PI * 0.22, 0, 0.5, 21.6, 21.6, 21.6));
    K.add('hub', 'dark', T(CYL(), ax - 4, 15, az + 3, 0.6, 0, 0.4, 0.8, 13, 0.8));
    K.light('hub', 0, ax - 7, 21, az + 6, 5, WARM);
  }
  // Andockfinger: zwei schlanke Keramikarme an den freien Kanten (dritter Andockpunkt = Landefeld am Ausleger),
  // goldene Kante, Wiege am Ende, Lichterkette
  for (const a of [0, PI * 2 / 3]) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const x0 = ca * 108, z0 = sa * 108, x1 = ca * 186, z1 = sa * 186, ry = -a;
    K.box('hub', 'hull', (x0 + x1) / 2, 2, (z0 + z1) / 2, 78, 5, 9, ry);
    K.box('hub', 'trim', (x0 + x1) / 2, 4.9, (z0 + z1) / 2, 78, 0.8, 3, ry);
    K.box('hub', 'dark', (x0 + x1) / 2, -3, (z0 + z1) / 2, 70, 3, 6, ry);
    for (const s2 of [-1, 1]) {
      const nx = -sa * s2 * 11, nz = ca * s2 * 11;
      K.box('hub', 'hull', x1 + nx, 3, z1 + nz, 22, 6, 4, ry);
      K.box('hub', 'trim', x1 + nx, 6.4, z1 + nz, 22, 0.8, 4.4, ry);
      K.light('hub', 0, x1 + nx + ca * 11, 7, z1 + nz + sa * 11, 5, GRN);
    }
    K.chain('hub', x0, 6, z0, x1, 6, z1, 7, WARM, 4);
  }
  // Radar auf dem Kern (dreht sich)
  K.box('spin', 'dark', 0, 29, 0, 22, 1.2, 3);
  K.box('spin', 'trim', 0, 29.6, 0, 20, 0.6, 0.8);
  K.light('spin', 2, 11, 30, 0, 9, WHT);
  // Antennenfeld (niedrig) und Scheinwerfer
  for (let i = 0; i < 5; i++) {
    const x = 34 + i * 8, z = -60 + i * 2.6, h = 10 + (i % 2) * 6;
    K.add('hub', 'dark', T(CYL(), x, 5 + h / 2, z, 0, 0, 0, 0.7, h, 0.7));
    K.add('hub', 'trim', T(HALF(), x, 5 + h, z, 0.9, 0, 0, 2.6, 1, 2.6));
    K.light('hub', 1, x, 6 + h, z, 4, RED, i * 0.13);
  }
  for (const [sx, sz] of [[-1, 1], [1, 1]]) {
    K.box('hub', 'lamp', sx * 20, 22, sz * 20, 2.4, 1.6, 2.4);
    K.cone('hub', sx * 20, 21, sz * 20, sx * 0.6, -1, sz * 0.6, 110, 34, LAMP_C, 8);
  }
  K.decal('hub', 'paint', 'EUROPA', 0, 5.1, 74, 50, 8, -PI / 2, 0, '#d8d2c2');
  K.decal('hub', 'paint', 'EU 01', -48, 5.1, -52, 20, 5, -PI / 2, 0.52, '#d8b25a');
  // Ausleger: geschlossener Kastenträger mit Leitungen, Kühlflügel mit Rahmen, Landeplattform
  K.box('arms', 'hull', 190, 0, 0, 160, 10, 14);
  K.box('arms', 'trim', 190, 5.6, 0, 160, 1.2, 8);
  K.box('arms', 'dark', 190, -7, 0, 150, 4, 10);
  band(K, 'arms', 268, 7, 112, 7, 0, 1.0, 'band', 0.2);
  band(K, 'arms', 112, -7, 268, -7, 0, 1.0, 'band', 0.2);
  K.box('arms', 'hull', 114, 0, 0, 14, 18, 26);                 // Anschluss an die Plattform
  K.box('arms', 'trim', 114, 9.6, 0, 16, 1.4, 28);
  for (let i = 0; i < 9; i++) K.box('arms', 'trim', 124 + i * 16, 0, 0, 2.2, 12, 16);
  for (const s of [-1, 1]) {
    K.box('arms', 'dark', 200, 0, s * 16, 10, 3, 6);
    K.box('arms', 'rad', 200, 0, s * 38, 70, 1.2, 36);
    K.box('arms', 'trim', 200, 0.4, s * 56.5, 72, 2.2, 1.6);
    K.box('arms', 'trim', 200, 0.4, s * 19.5, 72, 2.2, 1.6);
    for (let i = 0; i < 5; i++) K.box('arms', 'trim', 168 + i * 16, 0.5, s * 38, 1.4, 2, 36);
    K.I.pipe('arms', 120, 7, s * 5, 262, 7, s * 5, 1.1);
    K.light('arms', 1, 236, 2, s * 57, 6, RED, s > 0 ? 0.2 : 0.7);
  }
  K.add('arms', 'hull', T(CYL6(), 292, -2, 0, 0, 0, 0, 36, 9, 36));
  K.add('arms', 'deck', T(CYL6(), 292, 3, 0, 0, 0, 0, 33, 2, 33));
  K.add('arms', 'trim', T(CYL6(), 292, 3.6, 0, 0, 0, 0, 35, 1.4, 35));
  K.add('arms', 'dark', T(CYL6(), 292, -12, 0, 0, 0, 0, 26, 12, 26));
  K.add('arms', 'hull', T(CONE(), 292, -30, 0, PI, 0, 0, 18, 24, 18));
  for (let k = 0; k < 6; k++) { const [ax, az] = hx(k, 36), [bx, bz] = hx(k + 1, 36); band(K, 'arms', 292 + bx, bz, 292 + ax, az, -3, 1.2, 'band', 0.3); }
  K.decal('arms', 'pad', 'E1', 292, 4.12, 0, 44, 44, -PI / 2, 0, '#e8e2d2');
  for (let k = 0; k < 6; k++) { const [x, z] = hx(k, 33.5); K.light('arms', 0, 292 + x, 5, z, 6, GRN); }
  K.chain('arms', 122, 7, 11, 262, 7, 11, 10, GRN, 4.5);
  K.chain('arms', 122, 7, -11, 262, 7, -11, 10, GRN, 4.5);
  K.light('arms', 2, 328, 5, 0, 10, WHT);
  return { K, spinRate: 0.8 };
}

// ---------------- Saturn ----------------
// Ring-Werft: zentrale Nabe (gestufte Trommel mit Fensterbändern), vier schwere Speichen zum geschlossenen
// Kastenring, Ring mit Fensterbändern, Aufbauten und Laufkränen, im Dock ein Rumpf im Bau (beplankt, mit Volumen),
// Kiel nach unten, Ausleger zum Tanklager mit Endterminal.
function saturn() {
  const K = new Kit(), R = rng(77);
  const N = 40, ri = 132, ro = 162, rm = (ri + ro) / 2, yT = 8, yB = -16;
  const P_ = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  // Ring
  for (let i = 0; i < N; i++) {
    const a0 = i / N * PI * 2, a1 = (i + 1) / N * PI * 2, am = (a0 + a1) / 2;
    const segL = (a1 - a0) * rm * 1.03;
    const [cx, cz] = P_(am, rm);
    K.box('hub', 'hull', cx, (yT + yB) / 2, cz, ro - ri, yT - yB, segL, -am);
    // obere Abdeckung in zwei Bahnen mit Mittelschiene
    const [ux, uz] = P_(am, rm - 7), [vx, vz] = P_(am, rm + 7);
    K.box('hub', 'deck', ux, yT + 0.8, uz, 12, 1.6, segL * 0.98, -am);
    K.box('hub', 'deck', vx, yT + 0.8, vz, 12, 1.6, segL * 0.98, -am);
    K.box('hub', 'dark', cx, yT + 0.6, cz, 2, 1.4, segL, -am);
    // Fensterbänder außen (zwei Reihen) und innen (eine Reihe)
    const [o0x, o0z] = P_(a0, ro), [o1x, o1z] = P_(a1, ro);
    band(K, 'hub', o0x, o0z, o1x, o1z, 2, 1.6, 'band', 0.25);
    band(K, 'hub', o0x, o0z, o1x, o1z, -6, 1.0, 'win', 0.25);
    const [i0x, i0z] = P_(a1, ri), [i1x, i1z] = P_(a0, ri);
    band(K, 'hub', i0x, i0z, i1x, i1z, -1, 1.2, 'win', 0.25);
    // Unterseite: Spanten
    K.box('hub', 'dark', cx, yB - 2, cz, ro - ri - 6, 4, segL * 0.6, -am);
    if (i % 5 === 0) {
      const [jx, jz] = P_(a0, rm);
      K.box('hub', 'trim', jx, (yT + yB) / 2, jz, ro - ri + 5, yT - yB + 4, 4, -a0);
      const [lx, lz] = P_(a0, ro + 3);
      K.light('hub', 1, lx, yT + 3, lz, 8, RED, i * 0.03);
    } else if (i % 5 === 2) {
      greebles(K, 'hub', ...P_(am, rm), 26, segL * 0.9, yT + 1.6, 4, R, -am + PI / 2, 2.2);
    }
    const [cx2, cz2] = P_(am, ri - 1.6);
    K.light('hub', 3, cx2, yT - 2, cz2, 4.2, AMB, i / N);
  }
  // Nabe: gestufte Trommel, Fensterbänder, Hangar-Tore zu den Speichen-Zwischenräumen
  K.add('hub', 'hull', T(CYL(), 0, -6, 0, 0, 0, 0, 52, 30, 52));
  K.add('hub', 'dark', T(CYL(), 0, -30, 0, 0, 0, 0, 44, 18, 44));
  K.add('hub', 'hull', T(CYL(), 0, 13, 0, 0, 0, 0, 40, 8, 40));
  K.add('hub', 'trim', T(CYL(), 0, 17.6, 0, 0, 0, 0, 34, 1.2, 34));
  K.add('hub', 'hab', T(CYL(), 0, 22, 0, 0, 0, 0, 22, 8, 22));
  K.add('hub', 'dark', T(CYL(), 0, 26.6, 0, 0, 0, 0, 14, 1.2, 14));
  ringBand(K, 'hub', 0, 0, 52.2, 2, 1.8, 24, 'band');
  ringBand(K, 'hub', 0, 0, 52.2, -6, 1.0, 24, 'win');
  ringBand(K, 'hub', 0, 0, 40.2, 13, 1.2, 20, 'win');
  ringBand(K, 'hub', 0, 0, 22.2, 23, 1.0, 12, 'band');
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, [x, z] = P_(a, 50.5);
    hangar(K, 'hub', x, -6, z, 18, 10, 14, PI / 2 - a, R);
  }
  K.add('hub', 'hull', T(CONE(), 0, -66, 0, PI, 0, 0, 36, 54, 36));
  for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2; K.box('hub', 'rad', Math.cos(a) * 30, -60, Math.sin(a) * 30, 1.2, 30, 22, -a); }
  // Speichen: Kastenträger mit Leitungen, Lichtketten, Anschlussblöcke an Nabe und Ring
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2, [ax, az] = P_(a, 50), [bx, bz] = P_(a, ri + 2), [mx, mz] = P_(a, (50 + ri) / 2);
    K.box('hub', 'hull', mx, -3, mz, ri - 50, 12, 14, -a);
    K.box('hub', 'trim', mx, 3.6, mz, ri - 50, 1.2, 9, -a);
    K.box('hub', 'dark', mx, -11, mz, ri - 54, 4, 9, -a);
    for (const s of [-1, 1]) {
      const [px, pz] = P_(a + s * 0.055, (50 + ri) / 2);
      K.I.pipe('hub', ax + (px - mx), 4.6, az + (pz - mz), bx + (px - mx), 4.6, bz + (pz - mz), 1.0);
      const nx = -Math.sin(a) * s * 7.3, nz = Math.cos(a) * s * 7.3;
      band(K, 'hub', ax + nx, az + nz, bx + nx, bz + nz, -3, 1.0, 'band', 0);
      K.chain('hub', ax + nx * 0.8, 5.4, az + nz * 0.8, bx + nx * 0.8, 5.4, bz + nz * 0.8, 6, GRN, 4);
    }
    for (const r of [56, ri - 6]) { const [x, z] = P_(a, r); K.box('hub', 'trim', x, -3, z, 8, 18, 22, -a); }
  }
  // Rumpf im Dock: Kiel, beplankte Hälfte mit Volumen, Spanten nur am offenen Ende, Schweißlicht
  {
    const a = PI / 4 * 3, ca = Math.cos(a), sa = Math.sin(a);
    const at = (u, v) => [ca * u - sa * v, sa * u + ca * v];
    const L = 74, Wd = 15;
    for (let k = 0; k < 8; k++) {
      const u = 62 + k * 7, w = Wd * (1 - Math.abs(k - 3.5) / 9);
      const [x, z] = at(u, 0);
      if (k < 5) { K.box('hub', 'hull', x, -2, z, 7.2, 10, w * 2, -a + PI / 2); K.box('hub', 'trim', x, 3.4, z, 7.4, 0.8, w * 1.4, -a + PI / 2); }
      else { K.box('hub', 'dark', x, -2, z, 1.6, 10, w * 2, -a + PI / 2); K.box('hub', 'dark', x, -6, z, 7, 1.2, w * 1.6, -a + PI / 2); }
    }
    const [k0x, k0z] = at(58, 0), [k1x, k1z] = at(58 + L, 0);
    K.beam('hub', 'dark', k0x, -8, k0z, k1x, -8, k1z, 4, 4);
    const [wx, wz] = at(96, 0);
    K.light('hub', 4, wx, 5, wz, 7, WELD, 1.3);
    const [w2x, w2z] = at(104, 6);
    K.light('hub', 4, w2x, 2, w2z, 6, WELD, 2.1);
  }
  // Laufkräne auf dem Ring (flach, mit Ausleger nach innen)
  for (const ac of [0.4, 2.0, 3.6, 5.2]) {
    const [cx, cz] = P_(ac, rm);
    K.box('hub', 'dark', cx, yT + 4, cz, ro - ri + 6, 4, 9, -ac);
    K.box('hub', 'trim', cx, yT + 6.4, cz, ro - ri + 6.4, 0.8, 9.4, -ac);
    { const [ex, ez] = P_(ac, ro + 3.4); K.box('hub', 'paint', ex, yT + 4, ez, 0.8, 4.4, 9.6, -ac); }
    const [kx, kz] = P_(ac, ri - 10);
    K.box('hub', 'dark', kx, yT + 4, kz, 22, 2.6, 4, -ac);
    K.light('hub', 1, kx, yT + 6.5, kz, 5, AMB, ac);
  }
  // Container-Stapel auf dem Ring (zwei Reihen, 1–3 hoch, gemischte Farben), zwischen den Kränen
  {
    const CS = [[0.62, 0.24, 0.12], [0.16, 0.34, 0.5], [0.66, 0.5, 0.16], [0.36, 0.38, 0.4], [0.5, 0.16, 0.12], [0.2, 0.42, 0.3]];
    for (const [a0, a1] of [[0.75, 1.55], [2.55, 3.35], [3.95, 4.95], [5.5, 6.1]]) {
      for (let a = a0; a < a1; a += 0.085) {
        for (const off of [-7.5, 7.5]) {
          const h = 1 + ((R() * 3) | 0);
          if (R() < 0.15) continue;
          const [x, z] = P_(a, rm + off);
          for (let k = 0; k < h; k++) K.I.cont('hub', x, yT + 4.2 + k * 5.3, z, 5, 5.2, 11.5, -a, CS[(R() * CS.length) | 0]);
        }
      }
    }
  }
  // Frachter-Liegeplätze außen am Ring: Ausleger mit Andockkragen, Warnstreifen, Lichter (Frachter: stationlife.js)
  for (const ab of [5.4, 2.2]) {
    const [x0, z0] = P_(ab, ro + 2), [x1, z1] = P_(ab, ro + 34);
    K.beam('hub', 'hull', x0, -2, z0, x1, -2, z1, 9, 8);
    K.beam('hub', 'trim', x0, 2.6, z0, x1, 2.6, z1, 4, 1.2);
    for (const s2 of [-1, 1]) {
      const [px, pz] = P_(ab + s2 * 0.05, ro + 30);
      K.box('hub', 'dark', px, -8, pz, 6, 18, 6, -ab);
      K.light('hub', 1, px, 3, pz, 6, AMB, ab + s2);
    }
    const [mx, mz] = P_(ab, ro + 18);
    K.decal('hub', 'stripe', '', mx, 3.4, mz, 26, 2.6, -PI / 2, -ab + PI / 2, '#e0a020');
    K.chain('hub', x0, 4, z0, x1, 4, z1, 6, AMB, 4);
  }
  // Scheinwerfer ins Dock
  for (const ac of [1.2, 2.8, 4.4]) {
    const [x, z] = P_(ac, ri + 3);
    K.box('hub', 'lamp', x, yT + 3, z, 3, 2, 3, -ac);
    K.cone('hub', x, yT + 2, z, -x * 0.9, -38, -z * 0.9, 130, 40, LAMP, -10);
  }
  K.decal('hub', 'sign', 'SATURN WERFT', 0, -10, ro + 0.6, 44, 4.6, 0, 0, '#ffb070');
  K.decal('hub', 'paint', 'DOCK 03', 0, yT + 1.7, rm, 26, 5, -PI / 2, 0, '#d8d4cc');
  for (const ac of [0.9, 2.5, 4.0, 5.6]) {
    const [x, z] = P_(ac, rm);
    K.decal('hub', 'stripe', '', x, yT + 1.7, z, 18, 2.4, -PI / 2, -ac + PI / 2, '#e0782a');
  }
  // Ausleger: Kastenträger vom Ring zum Tanklager, Endterminal mit Hangar
  K.box('arms', 'hull', 236, -2, 0, 150, 10, 14);
  K.box('arms', 'trim', 236, 3.6, 0, 150, 1.2, 8);
  K.box('arms', 'hull', 168, -2, 0, 16, 22, 30);        // Kragen am Ring
  band(K, 'arms', 310, 7, 162, 7, -2, 1.0, 'band', 0.2);
  band(K, 'arms', 162, -7, 310, -7, -2, 1.0, 'band', 0.2);
  const CC = [[0.40, 0.38, 0.36], [0.62, 0.34, 0.14], [0.30, 0.33, 0.38]];
  for (let k = 0; k < 3; k++) {
    const x = 200 + k * 36;
    for (const s of [-1, 1]) {
      K.box('arms', 'dark', x, -2, s * 16, 6, 4, 18);
      K.I.tank('arms', x, -1, s * 30, 9, 18, PI / 2, 0, 0);
      K.box('arms', 'trim', x, -1, s * 30, 20, 1.4, 1.6);
    }
  }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) K.I.cont('arms', 210 + c * 26, 6, -4 + r * 8, 18, 5, 6.4, 0, CC[(r + c) % 3]);
  K.box('arms', 'hull', 326, -4, 0, 34, 20, 44);
  K.box('arms', 'trim', 326, 6.6, 0, 36, 1.4, 46);
  greebles(K, 'arms', 326, 0, 30, 40, 7.3, 12, R, 0, 2);
  hangar(K, 'arms', 343.2, -5, 0, 26, 11, 18, PI / 2, R);
  K.chain('arms', 176, 6, 9, 306, 6, 9, 11, GRN, 4.5);
  K.chain('arms', 176, 6, -9, 306, 6, -9, 11, GRN, 4.5);
  K.light('arms', 2, 344, 8, 0, 10, WHT);
  K.light('arms', 1, 326, 8, 23, 7, RED, 0.3); K.light('arms', 1, 326, 8, -23, 7, RED, 0.6);
  return { K, spinRate: 0 };
}

// ---------------- Eris ----------------
// Verwahrungsfestung: achteckiger Kernblock (gestuft, Abschrägungen), vier Zellentrakte im X, schmale violette
// Zellenschlitze, Wachkanzeln an den Enden, Hangar als tiefer dunkler Schacht mit Lichtleisten,
// Kühlrippen und Sockel nach unten, Suchscheinwerfer, Andocksteg mit Klammer.
function eris() {
  const K = new Kit(), R = rng(13);
  const oct = (k, r) => [Math.cos(k * PI / 4 + PI / 8) * r / Math.cos(PI / 8), Math.sin(k * PI / 4 + PI / 8) * r / Math.cos(PI / 8)];
  const C8 = 1 / Math.cos(PI / 8);
  // Kern: drei Stufen (oben schmaler), dunkler Stahl
  const tiers = [[64, -70, 10], [56, -10, 22], [44, 22, 28]];
  for (const [r, y0, y1] of tiers) K.add('hub', 'hull', T(OCT(), 0, (y0 + y1) / 2, 0, 0, PI / 8, 0, r * C8, y1 - y0, r * C8));
  K.add('hub', 'dark', T(OCTT(), 0, -100, 0, 0, PI / 8, 0, 62 * C8, 60, 62 * C8));
  for (let k = 0; k < 8; k++) {
    const [ax, az] = oct(k, 64), [bx, bz] = oct(k + 1, 64);
    for (let y = -60; y <= 0; y += 12) band(K, 'hub', ax, az, bx, bz, y, 0.9, (y / 12) % 2 ? 'win' : 'band', 0.3);
    const [cx, cz] = oct(k, 56), [dx, dz] = oct(k + 1, 56);
    band(K, 'hub', cx, cz, dx, dz, 16, 1.2, 'band', 0.3);
    // Pfeiler an den Ecken
    const [px, pz] = oct(k, 65);
    K.box('hub', 'trim', px, -30, pz, 5, 80, 5, -(k * PI / 4 + PI / 8));
    K.light('hub', 1, px * 1.02, 12, pz * 1.02, 6, RED, k * 0.15);
  }
  K.add('hub', 'trim', T(OCT(), 0, 10.8, 0, 0, PI / 8, 0, 66 * C8, 1.6, 66 * C8));
  K.add('hub', 'trim', T(OCT(), 0, 28.6, 0, 0, PI / 8, 0, 45.5 * C8, 1.2, 45.5 * C8));
  for (let k = 0; k < 8; k++) {
    const [ax, az] = oct(k, 44.6), [bx, bz] = oct(k + 1, 44.6);
    band(K, 'hub', ax, az, bx, bz, 26.5, 1.4, 'band', 0.3);
    const [cx, cz] = oct(k, 64.6), [dx, dz] = oct(k + 1, 64.6);
    K.beam('hub', 'band', cx, 9.6, cz, dx, 9.6, dz, 0.7, 0.5);
  }
  greebles(K, 'hub', 0, 0, 54, 54, 28, 22, R, 0, 1.4, ['dark', 'trim']);
  // Zellentrakte im X: lange, niedrige Blöcke, schmale Zellenschlitze, Wachkanzel am Ende
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, ca = Math.cos(a), sa = Math.sin(a), ry = -a;
    const at = (u, v) => [ca * u - sa * v, sa * u + ca * v];
    const u0 = 58, u1 = 150, L = u1 - u0, um = (u0 + u1) / 2;
    let [x, z] = at(um, 0);
    K.box('hub', 'hab', x, -6, z, L, 28, 30, ry);
    K.box('hub', 'hull', x, 10, z, L - 6, 4, 22, ry);
    K.box('hub', 'dark', x, -26, z, L - 10, 12, 22, ry);
    for (const s of [-1, 1]) {
      const [p0x, p0z] = at(u0 + 4, s * 15), [p1x, p1z] = at(u1 - 4, s * 15);
      for (const y of [-12, -5, 2]) {
        // Schlitzreihe: viele schmale Zellen
        const n = 14;
        for (let i = 0; i < n; i++) {
          if (R() < 0.18) continue;
          const t0 = (i + 0.3) / n, t1 = (i + 0.7) / n;
          const ax = p0x + (p1x - p0x) * t0, az = p0z + (p1z - p0z) * t0, bx = p0x + (p1x - p0x) * t1, bz = p0z + (p1z - p0z) * t1;
          if (s < 0) band(K, 'hub', ax, az, bx, bz, y, 2.2, 'band', 0.25); else band(K, 'hub', bx, bz, ax, az, y, 2.2, 'band', 0.25);
        }
      }
      // Strebepfeiler
      for (let i = 0; i <= 4; i++) { const [qx, qz] = at(u0 + 8 + i * (L - 16) / 4, s * 16.5); K.box('hub', 'trim', qx, -8, qz, 3, 32, 3, ry); }
    }
    // Dachgrat und Aufbauten, Lichtkanten in Violett entlang der Dachränder (von oben lesbar)
    [x, z] = at(um, 0);
    K.box('hub', 'trim', x, 12.6, z, L - 10, 1.2, 3, ry);
    for (const s2 of [-1, 1]) { const [ex, ez] = at(um, s2 * 14.6); K.box('hub', 'band', ex, 8.4, ez, L - 4, 0.6, 0.8, ry); }
    greebles(K, 'hub', x, z, L - 16, 18, 12, 9, R, ry, 1.6, ['dark', 'trim']);
    // Wachkanzel
    [x, z] = at(u1 + 9, 0);
    K.box('hub', 'hull', x, -2, z, 18, 34, 38, ry);
    K.box('hub', 'trim', x, 15.6, z, 20, 1.4, 40, ry);
    const [gx, gz] = at(u1 + 18.3, 0);
    const [b0x, b0z] = at(u1 + 18.2, -16), [b1x, b1z] = at(u1 + 18.2, 16);
    band(K, 'hub', b0x, b0z, b1x, b1z, 9, 2.4, 'band', 0.2);
    K.light('hub', 1, gx, 18, gz, 7, RED, k * 0.25);
    // Kühlrippen unter dem Trakt
    for (let i = 0; i < 6; i++) { const [rx, rz] = at(u0 + 10 + i * 14, 0); K.box('hub', 'rad', rx, -44, rz, 1.4, 24, 26, ry); }
  }
  // Hangar in der Front des Kerns (zur Kamera): tiefer Schacht mit Lichtleisten statt weißer Fläche
  hangar(K, 'hub', 0, -26, 64.5, 42, 18, 30, 0, R);
  K.decal('hub', 'sign', 'BLOCK 4', 0, -11.5, 66.3, 22, 3.6, 0, 0, '#c9b4ff');
  K.decal('hub', 'stripe', '', 0, -36.8, 66.4, 46, 2.2, 0, 0, '#c9a227');
  K.decal('hub', 'sign', 'ERIS VERWAHRUNG', 0, 4, 58.6, 52, 4.6, 0, 0, '#d8c8ff');
  K.decal('hub', 'pad', 'E4', -14, 28.7, -8, 26, 26, -PI / 2, 0, '#d4cce8');
  // niedrige Antennen und Suchscheinwerfer
  for (let i = 0; i < 4; i++) {
    const x = 18 + i * 7, h = 6 + (i % 2) * 4;
    K.add('hub', 'dark', T(CYL(), x, 28 + h / 2, -26, 0, 0, 0, 0.6, h, 0.6));
    K.light('hub', 1, x, 29 + h, -26, 4, RED, i * 0.15);
  }
  K.add('spin', 'dark', T(CYL(), 22, 30, 18, 0, 0, 0, 2.4, 4, 2.4));
  K.box('spin', 'trim', 22, 32, 18, 5, 2.4, 7);
  K.box('spin', 'lamp', 22, 32, 21.6, 3.6, 1.8, 0.4);
  K.cone('spin', 22, 32, 22, 0, -0.5, 1, 240, 38, [0.55, 0.6, 0.9], null);
  // Äußerer Gefängnisring (Auslegerrahmen, Lücke am Andocksteg): schwarze Zellenblöcke mit schmalen violetten
  // Zellenschlitzen, Stacheln nach außen und unten, violette Energieleitungen auf dem Dach, Stege zum Kern
  {
    const NR = 28, r0 = 178, r1 = 214, rmid = (r0 + r1) / 2;
    for (let i = 0; i < NR; i++) {
      const a0 = i / NR * PI * 2, a1 = (i + 1) / NR * PI * 2, am = (a0 + a1) / 2;
      if (Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.2) continue; // Andocksteg
      const seg = (a1 - a0) * rmid * 0.97;
      const cx = Math.cos(am) * rmid, cz = Math.sin(am) * rmid;
      K.box('arms', 'hab', cx, -10, cz, r1 - r0, 30, seg, -am);
      K.box('arms', 'dark', cx, 6.6, cz, r1 - r0 - 4, 3, seg * 0.96, -am);
      K.box('arms', 'dark', cx, -30, cz, r1 - r0 - 8, 10, seg * 0.8, -am);
      // Zellenschlitze außen (drei Reihen), Energieleitung auf dem Dach
      for (const y of [-18, -10, -2]) {
        const b0 = a0 + 0.012, b1 = a1 - 0.012;
        band(K, 'arms', Math.cos(b0) * (r1 + 0.2), Math.sin(b0) * (r1 + 0.2), Math.cos(b1) * (r1 + 0.2), Math.sin(b1) * (r1 + 0.2), y, 1.4, 'band', 0.25);
      }
      const e0 = Math.cos(a0) * (rmid + 6), f0 = Math.sin(a0) * (rmid + 6), e1 = Math.cos(a1) * (rmid + 6), f1 = Math.sin(a1) * (rmid + 6);
      K.beam('arms', 'band', e0, 8.6, f0, e1, 8.6, f1, 0.8, 0.5);
      // Stacheln: nach außen (leicht abwärts) und nach unten
      const ox = Math.cos(am), oz = Math.sin(am);
      K.add('arms', 'trim', spike(ox * r1, -6, oz * r1, ox, -0.25, oz, 3.2, 26 + (i % 3) * 8));
      if (i % 2 === 0) K.add('arms', 'trim', spike(cx, -36, cz, ox * 0.3, -1, oz * 0.3, 4, 40));
      // Trennpfeiler zwischen den Blöcken
      K.box('arms', 'trim', Math.cos(a0) * rmid, -10, Math.sin(a0) * rmid, r1 - r0 + 4, 34, 3, -a0);
      if (i % 4 === 1) K.light('arms', 1, ox * (r1 + 3), 9, oz * (r1 + 3), 6, RED, i * 0.07);
    }
  }
  // Stege vom Kern (Wachkanzeln der Zellentrakte) zum Ring
  for (let k = 0; k < 4; k++) {
    const a = PI / 4 + k * PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    K.beam('hub', 'hull', ca * 168, -4, sa * 168, ca * 182, -4, sa * 182, 10, 8);
    K.beam('hub', 'band', ca * 168, 0.6, sa * 168, ca * 182, 0.6, sa * 182, 0.8, 0.5);
  }
  // Andocksteg zur Klammer (an den rechten Zellentrakt angeschlossen)
  K.box('arms', 'hull', 158, -4, 0, 196, 8, 12);
  K.box('arms', 'trim', 158, 0.6, 0, 196, 1.2, 6);
  K.box('arms', 'hull', 72, -6, 0, 20, 20, 26);
  for (let x = 144; x < 252; x += 14) K.box('arms', 'trim', x, -4, 0, 2.4, 11, 15);
  band(K, 'arms', 256, 6, 136, 6, -4, 0.9, 'band', 0.2);
  band(K, 'arms', 136, -6, 256, -6, -4, 0.9, 'band', 0.2);
  for (const s of [-1, 1]) {
    K.box('arms', 'hull', 268, -4, s * 22, 40, 10, 12);
    K.box('arms', 'trim', 250, -4, s * 12, 6, 12, 22);
    K.box('arms', 'accent', 268, 1.4, s * 22, 36, 0.5, 0.5);
    K.light('arms', 0, 288, 3, s * 22, 6, GRN);
  }
  K.chain('arms', 140, 2, 0, 250, 2, 0, 10, [0.85, 0.45, 1.6], 4);
  return { K, spinRate: 0.5 };
}

const BUILD = { europa, saturn, eris };

// Einmal je Fraktion: Geometrien zusammenführen, Instanzen packen, Lichter, Kegel und Beschriftung bauen
export function stationParts(faction) {
  const old = setAO(0.5);
  const { K, spinRate } = (BUILD[faction] || europa)();
  setAO(old);
  const pts = {}, cones = {};
  for (const g of ['hub', 'spin', 'arms']) {
    pts[g] = K.L[g].length ? lightPointsGeometry(K.L[g]) : null;
    cones[g] = lightConesGeometry(K.C[g]);
  }
  return {
    hub: K.G.hub.merge(), spin: K.G.spin.merge(), arms: K.G.arms.merge(), inst: K.I.pack(),
    lights: pts, cones, decals: buildDecals(K.D, faction.length * 31), spinRate,
  };
}

export const STATION_INST_GEO = {
  pipe: () => new THREE.CylinderGeometry(1, 1, 1, 8, 1),
  tank: () => new THREE.CapsuleGeometry(1, 2, 4, 12).scale(1, 0.25, 1),
  cont: () => new THREE.BoxGeometry(1, 1, 1),
  vent: () => new THREE.CylinderGeometry(1, 0.9, 1, 12, 1),
};
