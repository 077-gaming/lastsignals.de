#!/usr/bin/env node
// LAST SIGNALS – Schiffe Nr. 3 bis 8 für EUROPA, SATURN und ERIS als GLB (ohne Blender, Geometrie per three.js).
//
// Aufruf (im Ordner Code):   node tools/models/schiffe.mjs                 alle 18 Dateien
//                            node tools/models/schiffe.mjs --nur s5,s8     nur diese Typen
//                            node tools/models/schiffe.mjs --fraktion eris nur diese Fraktion
//                            node tools/models/schiffe.mjs --roh           zusätzlich unkomprimierte Referenz-GLB behalten
// Ergebnis: public/models/<fraktion>-schiff<N>.glb  und  tools/models/schiffe-manifest.json
//
// Bauvorgaben: Vault „2026-10-30 - Claude 3D 01 Massstab“ und „… 02 Schiffe“ (S03–S08), Fraktionen nur Varianten.
// Achsen wie im Spiel verlangt: 1 Einheit = 1 m, +Y oben, Bug nach +Z, +X = links aus Pilotensicht.
// Länge der GLB = gewünschte Spiellänge (Starter im Spiel ≈ 44 m): S3 50, S4 58, S5 68, S6 78, S7 90, S8 105 m.
//
// Aufbau jedes Rumpfs: dunkles Tragwerk (Massen mit Fasen und Stufen) → Montageplätze (Laserfassungen mit Wangen und
// Sockel, Generator-Wannen mit Rahmen und Deckeln) → Panzerplatten mit echter Stärke, die sich über das Tragwerk legen
// (Fugen = dunkles Tragwerk dazwischen, einzelne Felder offen mit Technik darin) → Fraktionsdetails.
//
// Standardszene (das, was Spiel und Vorschau zeigen): Hull_LOD0, EngineLight, Wappen, Laser_NN, Generator_NN,
// HP_-Andockpunkte. Zweite Szene „Extras“ (wird nicht angezeigt): Hull_LOD1, Hull_LOD2, COL_Hull, CAP_Laser_NN, CAP_Gen_NN.
// Optimierung über die vorhandene Pipeline: gltf-transform optimize (meshopt, WebP-Texturen ≤ 512 px).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CODE = path.resolve(HERE, '../..');
const OUT = process.env.LS_OUT || path.join(CODE, 'public/models');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-schiffe-'));
const ARGS = process.argv.slice(2);
const arg = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const ONLY = arg('--nur') ? arg('--nur').split(',').map((s) => s.trim().replace(/^s?/, 's')) : null;
const ONLY_F = arg('--fraktion') ? arg('--fraktion').split(',') : null;
const KEEP_RAW = ARGS.includes('--roh');

// ---------------------------------------------------------------- gltf-transform (Pipeline) finden
function cmpVer(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; }
function findGT(tried = false) {
  const base = path.join(os.homedir(), '.npm/_npx');
  let best = null;
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const nm = path.join(base, d, 'node_modules');
    const pj = path.join(nm, '@gltf-transform/core/package.json');
    const cli = path.join(nm, '@gltf-transform/cli/bin/cli.js');
    const mo = path.join(nm, 'meshoptimizer/package.json');
    if (!fs.existsSync(pj) || !fs.existsSync(cli) || !fs.existsSync(mo)) continue;
    const v = JSON.parse(fs.readFileSync(pj, 'utf8')).version, mv = JSON.parse(fs.readFileSync(mo, 'utf8')).version;
    if (!best || cmpVer(v, best.v) > 0 || (cmpVer(v, best.v) === 0 && cmpVer(mv, best.mv) > 0)) best = { v, mv, nm, cli };
  }
  if (!best && !tried) {
    console.log('gltf-transform nicht im npx-Zwischenspeicher – einmalig über npx holen …');
    execFileSync('npx', ['-y', '@gltf-transform/cli@4.2.1', '--version'], { stdio: 'inherit' });
    return findGT(true);
  }
  if (!best) throw new Error('gltf-transform nicht gefunden (npx @gltf-transform/cli@4.2.1 --version ausführen)');
  return best;
}
const GT = findGT();
const imp = (p) => import(pathToFileURL(path.join(GT.nm, p)).href);
const { Document, NodeIO } = await imp('@gltf-transform/core/dist/index.js');
const { EXTTextureWebP, KHRMaterialsEmissiveStrength, KHRTextureTransform, ALL_EXTENSIONS } = await imp('@gltf-transform/extensions/dist/index.js');
const { MeshoptDecoder, MeshoptSimplifier } = await imp('meshoptimizer/index.module.js');
await MeshoptDecoder.ready; await MeshoptSimplifier.ready;

// ---------------------------------------------------------------- Fraktionen (nur Varianten, gleiche Form)
// pe = Farbe der Plattenkanten (EUROPA Gold, SATURN abgescheuerter Stahl, ERIS Graphit)
const FAC = {
  europa: {
    key: 'europa', label: 'EUROPA',
    paint: '#e7dcc6', paint2: '#d9ccb2', panelVar: 0.03, wear: 0, grime: 0.05, plateMin: 136, swap: 0, rivets: false, diag: false, seam: 0.42, uv: 13,
    metal: { trim: '#c99a45', struct: '#25282f', dark: '#121419', noz: '#4f5258', gun: '#41444c', gen: '#8a8c94', edge: '#c99a45', under: '#30333b', plate: '#d9ccb2', wear: '#c99a45' },
    pe: 'trim', flank: [0.8, 0.79, 0.77], side: [0.9, 0.89, 0.87], shellRim: [0.86, 0.85, 0.83], seamW: 3, fill: 0.4, glow: '#dff4ff', engine: '#dff4ff', hullRough: 0.34, hullMetal: 0.06, metalRough: 0.46, soot: 0.12,
  },
  saturn: {
    key: 'saturn', label: 'SATURN',
    paint: '#c0581b', paint2: '#a94a16', panelVar: 0.08, wear: 1, grime: 0.5, plateMin: 72, swap: 0.18, rivets: true, diag: false, seam: 0.3, uv: 10, p2metal: true,
    metal: { trim: '#8a8c91', struct: '#31343a', dark: '#18191c', noz: '#383839', gun: '#4e5158', gen: '#6d7077', edge: '#a3a29c', under: '#2b2e33', plate: '#474a51', wear: '#97948b' },
    pe: 'wear', flank: [0.72, 0.68, 0.66], side: [0.84, 0.8, 0.78], shellRim: 'wear', seamW: 2, fill: 0.5, glow: '#ffa040', engine: '#ffa040', hullRough: 0.58, hullMetal: 0.16, metalRough: 0.58, soot: 0.8,
  },
  eris: {
    key: 'eris', label: 'ERIS',
    paint: '#131317', paint2: '#1b1b21', panelVar: 0.04, wear: 0, grime: 0.08, plateMin: 88, swap: 0, rivets: false, diag: true, seam: 0.55, uv: 11,
    metal: { trim: '#4d5059', struct: '#0f1013', dark: '#08080a', noz: '#25252b', gun: '#2c2e35', gen: '#3f414a', edge: '#5a5e69', under: '#141518', plate: '#1b1b21', wear: '#5a5e69' },
    pe: 'edge', flank: 'edge', side: [1.25, 1.25, 1.3], shellRim: 'edge', seamW: 3, fill: 0.45, glow: '#9a4cff', engine: '#a873ff', hullRough: 0.7, hullMetal: 0.1, metalRough: 0.52, soot: 0.35,
  },
};
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const srgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// Modulgrößen bleiben auf allen Schiffen gleich (einheitliche Laser-/Generator-Module); die Fassung wächst mit der Klasse.
const LS = 1.5, GS = 1.15;
// Spielbudget (Toni, 30.10.2026: Leistung vor allem): je Datei < 12.000 sichtbare Dreiecke (Rumpf + volle Bestückung)
// und < 400 KB. HULL_TARGET = Obergrenze Rumpf LOD0 (wird bei Bedarf mit meshoptimizer darauf vereinfacht).
const VIS_MAX = 12000, KB_MAX = 400;
const HULL_BUDGET = { s3: 6800, s4: 7000, s5: 7200, s6: 8000, s7: 7600, s8: 7700 };
const HULL_TARGET = HULL_BUDGET;
// Plattenraster: größere, ruhigere Panzerfelder (vorher Kachel-Look mit Hunderten kleiner Platten)
const PLATE_K = 2.9, UNDER_K = 4.6; // Unterseite sieht keine der beiden Spielkameras: grob

// ---------------------------------------------------------------- Geometrie-Werkzeuge
function swapWinding(g) {
  for (const k in g.attributes) {
    const a = g.attributes[k], s = a.itemSize, arr = a.array;
    for (let t = 0; t < a.count; t += 3) for (let c = 0; c < s; c++) {
      const i1 = (t + 1) * s + c, i2 = (t + 2) * s + c, tmp = arr[i1]; arr[i1] = arr[i2]; arr[i2] = tmp;
    }
  }
}
function signedVolume(pos, idx) {
  let v = 0;
  const n = idx ? idx.count : pos.count, A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    A.fromBufferAttribute(pos, idx ? idx.getX(i) : i); B.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1); C.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    v += A.dot(B.cross(C));
  }
  return v / 6;
}
// Gleiche Aufbereitung für alle Teile: ohne Index, Außenseite nach außen, Normalen (flach oder glatt)
function prep(g0) {
  const ud = g0.userData || {};
  let g = g0;
  if (ud.smooth) {
    g = g0.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (!g.index) g = mergeVerts(g);
    if (!ud.noFix && signedVolume(g.attributes.position, g.index) < 0) {
      const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    }
    g.computeVertexNormals();
    g = g.toNonIndexed();
    dropDegenerate(g);
  } else {
    g = g0.index ? g0.toNonIndexed() : g0.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    if (!ud.noFix && signedVolume(g.attributes.position) < 0) swapWinding(g);
    g.computeVertexNormals();
    dropDegenerate(g);
  }
  return g;
}
// Null- und Splitterflächen entfernen: Höhe ≥ 2,5 cm und kürzeste Kante ≥ 2,5 cm, damit die Meshopt-Quantisierung
// (≈ 6 mm Raster auf 105 m) keine Fläche zu null zusammenfallen lässt
function dropDegenerate(g, hMin = 0.025) {
  const p = g.attributes.position, keep = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    A.fromBufferAttribute(p, t); B.fromBufferAttribute(p, t + 1); C.fromBufferAttribute(p, t + 2);
    const ab = A.distanceTo(B), bc = B.distanceTo(C), ca = C.distanceTo(A);
    const e = Math.max(ab, bc, ca), m = Math.min(ab, bc, ca);
    const cr = B.clone().sub(A).cross(C.clone().sub(A)).length();
    if (m >= hMin && cr / e >= hMin) keep.push(t);
  }
  if (keep.length * 3 === p.count) return g;
  for (const k in g.attributes) {
    const a = g.attributes[k], s = a.itemSize, arr = new Float32Array(keep.length * 3 * s);
    keep.forEach((t, i) => arr.set(a.array.subarray(t * s, (t + 3) * s), i * 3 * s));
    g.setAttribute(k, new THREE.BufferAttribute(arr, s));
  }
  return g;
}
function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); r.setIndex(idx);
  return r;
}
function mirrorX(g) {
  const m = g.index ? g.toNonIndexed() : g.clone();
  m.scale(-1, 1, 1); swapWinding(m);
  m.userData = { ...(g.userData || {}) };
  return m;
}
const smooth = (g) => { g.userData.smooth = true; return g; };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// halber Grundriss (x ≥ 0, vorn → hinten) → geschlossener symmetrischer Grundriss
function symO(half) {
  const m = half.slice().reverse().filter(([x]) => x > 1e-6).map(([x, z]) => [-x, z]);
  return [...half, ...m];
}
// Querschnitt (u = quer, v = hoch): gefaste Achteck-Form mit optionaler Wölbung oben / Kiel unten
function prof(w, yt, yb, o = {}) {
  const ct = o.ct ?? 0.3, cb = o.cb ?? 0.3, ym = o.ym ?? (yt + yb) / 2, st = o.st ?? 0.35, sb = o.sb ?? 0.3;
  const hT = yt - ym, hB = ym - yb, d = o.dome ?? 0;
  return [
    [w, ym + hT * st], [w * (1 - ct), yt], [0, yt + d], [-w * (1 - ct), yt], [-w, ym + hT * st],
    [-w, ym - hB * sb], [-w * (1 - cb), yb], [0, yb - (o.keel ?? 0)], [w * (1 - cb), yb], [w, ym - hB * sb],
  ];
}
// Flügel-/Bogenquerschnitt: scharfe Vorderkante (u < 0), angestellte Oberseite, dicke stumpfe Hinterkante (u > 0)
function foil(c, yt, yb) {
  return [
    [-c / 2, (yt + yb) * 0.12], [-c * 0.3, yt * 0.62], [c * 0.02, yt * 0.94], [c * 0.3, yt], [c / 2, yt * 0.62],
    [c / 2, yb * 0.55], [c * 0.3, yb], [-c * 0.18, yb * 0.85], [-c * 0.4, yb * 0.35],
  ];
}
function loftRings(rings, caps = true) {
  const pos = [];
  const P = (v) => pos.push(v.x, v.y, v.z);
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1], n = a.length;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      P(a[j]); P(b[j]); P(b[j2]);
      P(a[j]); P(b[j2]); P(a[j2]);
    }
  }
  if (caps) for (const r of [rings[0], rings[rings.length - 1]]) {
    const c = new THREE.Vector3(); r.forEach((v) => c.add(v)); c.divideScalar(r.length);
    for (let j = 0; j < r.length; j++) { P(c); P(r[j]); P(r[(j + 1) % r.length]); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
// Querschnitte entlang eines Pfads (x, y, z). profs[i] = Liste [u, v]. o.side: feste Querachse.
function sweep(pathPts, profs, o = {}) {
  const n = pathPts.length, rings = [];
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3(...pathPts[i]);
    const a = new THREE.Vector3(...pathPts[Math.max(0, i - 1)]), b = new THREE.Vector3(...pathPts[Math.min(n - 1, i + 1)]);
    const T = b.sub(a).normalize();
    const S = o.side ? new THREE.Vector3(...o.side).normalize() : new THREE.Vector3(T.z, 0, -T.x).normalize();
    const U = new THREE.Vector3().crossVectors(T, S).normalize();
    const pr = typeof profs === 'function' ? profs(i) : profs[i];
    rings.push(pr.map(([u, v]) => p.clone().addScaledVector(S, u).addScaledVector(U, v)));
  }
  return loftRings(rings, o.caps !== false);
}
// gerade Längsform entlang z bei (x, y): secs = [[z, prof], …]
const zs = (x, y, secs) => sweep(secs.map(([z]) => [x, y, z]), secs.map(([, p]) => p));
function bx(cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(cx, cy, cz);
  return g;
}
// gefaste Kiste (Längskanten entlang z gefast)
const cbx = (cx, cy, cz, sx, sy, sz, ch = 0.3) => zs(cx, cy, [[cz - sz / 2, prof(sx / 2, sy / 2, -sy / 2, { ct: ch, cb: ch })], [cz + sz / 2, prof(sx / 2, sy / 2, -sy / 2, { ct: ch, cb: ch })]]);
// gefaste Kiste quer (Längskanten entlang x gefast)
const cbxX = (cx, cy, cz, sx, sy, sz, ch = 0.3) => { const g = cbx(0, 0, 0, sz, sy, sx, ch); g.rotateY(Math.PI / 2); g.translate(cx, cy, cz); return g; };
function cy(x, y, z, r, len, axis = 'y', segs = 8, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, len, segs, 1, false, axis === 'y' && segs <= 8 ? Math.PI / segs : 0);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  g.translate(x, y, z);
  return smooth(g);
}
function lathe(pts, segs, axis = 'z', sm = true) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segs);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  if (axis === '-z') g.rotateX(-Math.PI / 2);
  return sm ? smooth(g) : g;
}

// ---------------------------------------------------------------- 2D-Polygone im Grundriss (x, z)
const A2 = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const ccw = (P) => (A2(P) >= 0 ? P.slice() : P.slice().reverse());
function clean(P, eps = 0.05) {
  const out = [];
  for (const p of P) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > eps) out.push(p); }
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  // fast gerade Zwischenpunkte entfernen
  for (let i = 0; out.length > 3 && i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[i], c = out[(i + 1) % out.length];
    const cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 0.004 * Math.hypot(c[0] - a[0], c[1] - a[1])) { out.splice(i, 1); i--; }
  }
  return out;
}
function edgeN(P, i) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; }
// d > 0 nach außen (Polygon gegen den Uhrzeigersinn)
function offsetPoly(P, d) {
  const n = P.length;
  return P.map((p, i) => {
    const n1 = edgeN(P, (i - 1 + n) % n), n2 = edgeN(P, i);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1]; const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) { mx = n1[0]; mz = n1[1]; } else { mx /= ml; mz /= ml; }
    const c = Math.max(0.4, mx * n1[0] + mz * n1[1]);
    return [p[0] + mx * d / c, p[1] + mz * d / c];
  });
}
function clipPoly(P, C) { // Sutherland–Hodgman, C konvex und gegen den Uhrzeigersinn
  let out = P;
  for (let i = 0; i < C.length && out.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length], inp = out; out = [];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}
const centroid = (P) => [P.reduce((s, p) => s + p[0], 0) / P.length, P.reduce((s, p) => s + p[1], 0) / P.length];
const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const rot2 = ([x, z], a, c = [0, 0]) => { const s = Math.sin(a), k = Math.cos(a), dx = x - c[0], dz = z - c[1]; return [c[0] + dx * k - dz * s, c[1] + dx * s + dz * k]; };
const bbox2 = (P) => [Math.min(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1])), Math.max(...P.map((p) => p[0])), Math.max(...P.map((p) => p[1]))];
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
}
function triPoly(P, H) {
  const v2 = (Q) => Q.map(([x, z]) => new THREE.Vector2(x, z));
  const f = THREE.ShapeUtils.triangulateShape(v2(P), H ? [v2(H)] : []);
  const all = [...P, ...(H || [])];
  return f.map(([a, b, c]) => [all[a], all[b], all[c]]);
}
function subdiv(tris, n) {
  for (let k = 0; k < n; k++) {
    const out = [];
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const [a, b, c] of tris) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    tris = out;
  }
  return tris;
}
// Dreieck mit gewünschter Außenrichtung d anhängen
function tri3(pos, a, b, c, d) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  if (nx * d[0] + ny * d[1] + nz * d[2] < 0) pos.push(...a, ...c, ...b); else pos.push(...a, ...b, ...c);
}
const quad = (pos, a, b, c, d, dir) => { tri3(pos, a, b, c, dir); tri3(pos, a, c, d, dir); };
function geoOf(pos) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.userData.noFix = true; return g; }
// Grundriss senkrecht in Stufen: levels = [[y, Einzug], …] von unten nach oben. Liefert { body, rim } (rim = oberste Fase)
function taperGeo(outline, levels) {
  const P = ccw(clean(outline));
  const rings = levels.map(([y, ins]) => offsetPoly(P, -ins).map(([x, z]) => [x, y, z]));
  const body = [], rim = [];
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1], dIns = levels[r + 1][1] - levels[r][1];
    const vy = Math.abs(dIns) < 1e-6 ? 0 : Math.sign(dIns) * Math.sign(levels[r + 1][0] - levels[r][0]) * 0.6;
    const out = r === rings.length - 2 && dIns > 1e-6 ? rim : body;
    for (let i = 0; i < P.length; i++) {
      const j = (i + 1) % P.length, n = edgeN(P, i);
      quad(out, A[i], A[j], B[j], B[i], [n[0], vy, n[1]]);
    }
  }
  const cap = (ring, sg) => { for (const [a, b, c] of triPoly(ring.map((p) => [p[0], p[2]]))) tri3(body, [a[0], ring[0][1], a[1]], [b[0], ring[0][1], b[1]], [c[0], ring[0][1], c[1]], [0, sg, 0]); };
  cap(rings[0], -1); cap(rings[rings.length - 1], 1);
  return { body: geoOf(body), rim: rim.length ? geoOf(rim) : null };
}

// Höhenfeld der bereits gebauten Massen: oberste/unterste Fläche an (x, z) (Platten legen sich darauf)
class HField {
  constructor(cell = 1.5) { this.c = cell; this.m = new Map(); this.t = []; }
  key(ix, iz) { return (ix + 4096) * 8192 + iz + 4096; }
  add(g) {
    const p = g.attributes.position.array, c = this.c;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx_ = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy_ = p[i + 7], cz = p[i + 8];
      const d = (bx_ - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(d) < 1e-5) continue;
      const id = this.t.length; this.t.push([ax, ay, az, bx_, by, bz, cx, cy_, cz, d]);
      const x0 = Math.floor(Math.min(ax, bx_, cx) / c), x1 = Math.floor(Math.max(ax, bx_, cx) / c);
      const z0 = Math.floor(Math.min(az, bz, cz) / c), z1 = Math.floor(Math.max(az, bz, cz) / c);
      for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz); let L = this.m.get(k); if (!L) this.m.set(k, L = []); L.push(id);
      }
    }
  }
  query(x, z, top = true) {
    const L = this.m.get(this.key(Math.floor(x / this.c), Math.floor(z / this.c)));
    let best = top ? -Infinity : Infinity;
    if (!L) return best;
    for (const id of L) {
      const [ax, ay, az, bx_, by, bz, cx, cy_, cz, d] = this.t[id];
      const u = ((x - ax) * (cz - az) - (cx - ax) * (z - az)) / d, v = ((bx_ - ax) * (z - az) - (x - ax) * (bz - az)) / d;
      if (u < -1e-5 || v < -1e-5 || u + v > 1 + 1e-5) continue;
      const y = ay + u * (by - ay) + v * (cy_ - ay);
      if (top ? y > best : y < best) best = y;
    }
    return best;
  }
}

// ---------------------------------------------------------------- Teile-Sammler je Material
// Eimer: hull (M_Hull, Lack-Textur), metal (M_Metal, Farbe je Ecke), glass (M_Glass), glow (M_Glow)
const isPaint = (c) => c === 'paint' || c === 'paint2' || Array.isArray(c);
class Parts {
  constructor(F) { this.F = F; this.b = {}; }
  color(bucket, c) {
    const F = this.F;
    if (bucket === 'hull') {
      if (c === 'paint2') { const a = lin(F.paint2), b = lin(F.paint); return a.map((v, i) => v / Math.max(b[i], 1e-3)); }
      if (Array.isArray(c)) return c;
      return [1, 1, 1];
    }
    if (bucket === 'metal') { if (Array.isArray(c)) return c; return lin(F.metal[c] || c); }
    return [1, 1, 1];
  }
  add(bucket, g, c = 'paint') {
    if (bucket === 'hull' && c === 'under') bucket = 'metal';
    if (bucket === 'hull' && c === 'paint2' && this.F.p2metal) { bucket = 'metal'; c = 'plate'; }
    const geo = prep(g), rgb = this.color(bucket, c), n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(rgb, i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.keep) geo.userData.keep = true;
    (this.b[bucket] ||= []).push(geo);
    if (process.env.TRI_DEBUG) { const st = new Error().stack.split('\n').slice(2).map((l) => (l.match(/at (?:Ship\.)?(\w+)/) || [])[1]).filter((f) => f && !['add', 'put', 'putSym', 'sym', 'mass', 'massSym'].includes(f)); const k = st.slice(0, 2).join('<'); (globalThis.__TRI ||= {})[k] = (globalThis.__TRI[k] || 0) + geo.attributes.position.count / 3; }
    return geo;
  }
}

// ---------------------------------------------------------------- Ausrüstung (eigene Knoten, auf allen Schiffen gleich groß)
function laserParts(s = LS) {
  // schlank (≈ 200 Dreiecke): Sockel, Gehäuse mit Fasen, Kühlrippen, Lauf mit Mantel, tiefe Mündung mit dunkler Linse
  const metal = [], lens = [];
  metal.push([bx(0, 0.3 * s, -0.15 * s, 0.76 * s, 0.6 * s, 1.5 * s), 'dark']);
  metal.push([zs(0, 0, [
    [-1.3 * s, prof(0.42 * s, 1.12 * s, 0.52 * s, { ct: 0.42, cb: 0.3 })],
    [-0.9 * s, prof(0.56 * s, 1.24 * s, 0.44 * s, { ct: 0.36, cb: 0.3 })],
    [1.0 * s, prof(0.56 * s, 1.24 * s, 0.44 * s, { ct: 0.36, cb: 0.3 })],
    [1.45 * s, prof(0.4 * s, 1.1 * s, 0.56 * s, { ct: 0.42, cb: 0.3 })],
  ]), 'gun']);
  for (const sx of [1, -1]) {
    metal.push([bx(sx * 0.6 * s, 0.84 * s, 0.05 * s, 0.1 * s, 0.4 * s, 1.5 * s), 'trim']);
    metal.push([bx(sx * 0.66 * s, 0.84 * s, -0.2 * s, 0.12 * s, 0.56 * s, 0.16 * s), 'dark']); // Kühlrippe
  }
  metal.push([cy(0, 0.84 * s, 2.25 * s, 0.2 * s, 1.6 * s, 'z', 6), 'gun']);
  const col = lathe([[0.2 * s, -0.5 * s], [0.3 * s, 0.44 * s], [0.18 * s, 0.44 * s], [0.18 * s, 0.2 * s], [0, 0.2 * s]], 6);
  col.translate(0, 0.84 * s, 3.0 * s);
  metal.push([col, 'gun']);
  const l = new THREE.CircleGeometry(0.18 * s, 6); l.translate(0, 0.84 * s, 3.21 * s); l.userData.noFix = true;
  lens.push(l);
  return { metal, lens };
}
// Generator: gepanzerter Block, zwei Deckplatten, dazwischen nur eine schmale Leuchtfuge (≈ 100 Dreiecke)
function genParts(s = GS) {
  const metal = [
    [cbx(0, 0.24 * s, 0, 2.0 * s, 0.48 * s, 2.0 * s, 0.3), 'gen'],
    [bx(0, 0.52 * s, 0, 1.8 * s, 0.12 * s, 1.8 * s), 'dark'],
  ];
  for (const sz of [1, -1]) metal.push([bx(0, 0.64 * s, sz * 0.52 * s, 1.84 * s, 0.14 * s, 0.76 * s), 'trim']);
  return { metal, glow: [bx(0, 0.6 * s, 0, 1.5 * s, 0.06 * s, 0.24 * s)] };
}

// ---------------------------------------------------------------- Schiffs-Baukasten
class Ship {
  constructor(F, no, len, K) {
    this.F = F; this.no = no; this.len = len; this.K = K; this.ls = LS; this.gs = GS;
    this.P = new Parts(F); this.hf = new HField(1.5); this.excl = [];
    this.lasers = []; this.gens = []; this.engines = []; this.engineGeo = []; this.hp = {}; this.ins = null;
    this.R = rng(1000 + no * 31);                  // Formzufall: für alle Fraktionen gleich
    this.RF = rng(hash(F.key) ^ (no * 7919));       // nur für Fraktionsdetails
    this._seed = 1;
  }
  get E() { return this.F.key; }
  add(b, g, c) { return this.P.add(b, g, c); }
  put(g, c = 'paint', reg = false) {
    if (c === 'shell') return this.shell(g, reg);
    const geo = this.P.add(isPaint(c) ? 'hull' : 'metal', g, c); if (reg) this.hf.add(geo); return geo;
  }
  // Lackschale: Rumpfmasse nach Flächenrichtung färben – Oberseite Fraktionslack, Flanken dunklerer Lack, Unterseite Tragwerk.
  // So trägt der Rumpf selbst die Lackierung (Fugen/Paneele aus der Textur), statt hunderter einzelner Kachelplatten.
  shell(g, reg) {
    const geo = prep(g), p = geo.attributes.position.array, out = { up: [], side: [], down: [] };
    for (let i = 0; i < p.length; i += 9) {
      const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2], vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1, k = ny / l;
      (k > 0.42 ? out.up : k < -0.45 ? out.down : out.side).push(...p.subarray(i, i + 9));
    }
    for (const [k, c] of [['up', 'paint'], ['side', this.F.side], ['down', 'under']]) if (out[k].length) this.put(geoOf(out[k]), c, reg);
    return geo;
  }
  putSym(g, c, reg) { this.put(g, c, reg); this.put(mirrorX(g), c, reg); }
  mass(g, c = 'shell') { return this.put(g, c, true); }
  massSym(g, c = 'shell') { this.putSym(g, c, true); }
  sym(b, g, c) { this.add(b, g, c); this.add(b, mirrorX(g), c); }
  // Stufenkörper: Grundriss mit Fasen unten/oben (o.levels für eigene Stufen); Lackkörper bekommen eine Kantenfase in F.pe
  deck(outline, y0, y1, o = {}) {
    const h = y1 - y0, cb = Math.min(o.cb ?? 0.5, h * 0.45), ct = Math.min(o.ct ?? 0.3, h * 0.45);
    const lv = o.levels || [[y0, o.ib ?? cb], [y0 + cb, 0], [y1 - ct, 0], [y1, o.it ?? ct]];
    const reg = o.reg !== false, c = o.c ?? (reg ? 'shell' : 'struct');
    const emit = (P) => {
      const { body, rim } = taperGeo(P, lv);
      this.put(body, c, reg);
      if (rim) this.put(rim, o.e ?? (c === 'shell' ? this.F.shellRim : isPaint(c) ? this.F.pe : c), reg);
    };
    emit(outline);
    if (o.sym) emit(outline.map(([x, z]) => [-x, z]));
  }
  // Panzerplatte mit echter Stärke, die sich über die Massen darunter legt (o.under: von unten)
  plate(poly, o = {}) {
    const P = ccw(clean(poly)); if (P.length < 3 || A2(P) < (o.minA ?? 0.5)) return null;
    const und = !!o.under, sg = und ? -1 : 1, t = o.t ?? 0.35, ch = Math.min(o.ch ?? 0.14, t * 0.8), lift = o.lift ?? 0, sk = o.skirt ?? 0.3;
    const H = o.hole ? ccw(clean(o.hole)) : null;
    if (H && H.length < 3) return null;
    const Pi = offsetPoly(P, -ch), Hi = H ? offsetPoly(H, ch) : null;
    const q = (x, z) => this.hf.query(x, z, !und);
    const smp = [...P, centroid(P)];
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; smp.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); }
    const hs = smp.map(([x, z]) => q(x, z)).filter(Number.isFinite);
    if (!hs.length && o.y == null) return null;
    const hmin = hs.length ? Math.min(...hs) : o.y, hmax = hs.length ? Math.max(...hs) : o.y;
    const flat = o.flat ?? (o.y != null || hmax - hmin < 0.3);
    const fy = o.y ?? (und ? hmin : hmax), fb = und ? hmin : hmax;
    const base = (x, z) => { if (flat) return fy; const h = q(x, z); return Number.isFinite(h) ? h : fb; };
    const [x0, z0, x1, z1] = bbox2(P);
    const n = flat ? 0 : clamp(Math.ceil(Math.log2(Math.max(x1 - x0, z1 - z0) / (o.L ?? 1.8))), 0, 2);
    const top = [], edge = [];
    const Y = (x, z) => base(x, z) + sg * (lift + t);
    for (const [a, b, c] of subdiv(triPoly(Pi, Hi), n)) tri3(top, [a[0], Y(...a), a[1]], [b[0], Y(...b), b[1]], [c[0], Y(...c), c[1]], [0, sg, 0]);
    const m = 1 << n;
    const L2 = (A, B, s) => [lerp(A[0], B[0], s), lerp(A[1], B[1], s)];
    const yo = (p) => base(...p) + sg * (lift + t - ch);
    const yb = (p) => (flat ? (und ? hmax + sk : hmin - sk) : base(...p) - sg * sk);
    const ring = (O, I, inward) => {
      for (let i = 0; i < O.length; i++) {
        const j = (i + 1) % O.length, nn = edgeN(O, i), d = inward ? [-nn[0], 0, -nn[1]] : [nn[0], 0, nn[1]];
        for (let k = 0; k < m; k++) {
          const i0 = L2(I[i], I[j], k / m), i1 = L2(I[i], I[j], (k + 1) / m), o0 = L2(O[i], O[j], k / m), o1 = L2(O[i], O[j], (k + 1) / m);
          const ti0 = [i0[0], Y(...i0), i0[1]], ti1 = [i1[0], Y(...i1), i1[1]];
          const to0 = [o0[0], yo(o0), o0[1]], to1 = [o1[0], yo(o1), o1[1]];
          const b0 = [o0[0], yb(o0), o0[1]], b1 = [o1[0], yb(o1), o1[1]];
          // eine schräge Flanke statt Fase + Schürze: halbe Dreieckszahl, liest sich als dicke abgeschrägte Platte
          quad(edge, ti0, ti1, b1, b0, [d[0], sg * 0.45, d[2]]);
        }
      }
    };
    ring(P, Pi, false); if (H) ring(H, Hi, true);
    const c = o.c ?? 'paint', reg = o.reg !== false, kp = this.P.keep;
    if (isPaint(c) && !und) this.P.keep = true; // Lackplatte samt Flanke bleibt unvereinfacht (sonst Löcher im Fraktionsbild)
    this.put(geoOf(top), c, reg); this.put(geoOf(edge), o.e ?? c, reg); this.P.keep = kp;
    return { P, H, Y, t, und, flat };
  }
  // Plattenpanzer über einem Bereich (Raster, versetzt, Fugen). o.sym: region ist die +x-Hälfte, wird gespiegelt.
  // Montageplätze (this.excl) bekommen passende Ausschnitte oder bleiben frei; einzelne Felder werden offene
  // Wartungsfelder mit Technik darin (o.panel), einzelne bekommen eine zweite Lage (o.layer).
  armor(region, o = {}) {
    const R = rng(this.no * 7919 + (this._seed++) * 104729);
    const ang = (o.ang ?? 0) * Math.PI / 180, piv = o.piv ?? [0, 0];
    const und = !!o.under, PK = (und ? UNDER_K : PLATE_K) * Math.min(1.5, Math.max(1, this.len / 54) ** 0.8);
    const g = (o.gap ?? 0.3) * 0.6; let px = (o.px ?? 3.6) * PK, pz = (o.pz ?? 3.2) * PK;
    o = { ...o, panel: (o.panel ?? 0) * (und ? 0 : 0.35), layer: (o.layer ?? 0) * 0.45, L: (o.L ?? 1.8) * 3.2 };
    let reg = ccw(clean(region));
    if (o.inset) reg = offsetPoly(reg, -o.inset);
    if (o.sym) reg = clipPoly(reg, rect(g / 2, -1e4, 1e4, 1e4));
    if (reg.length < 3) return;
    const loc = reg.map((p) => rot2(p, -ang, piv));
    const [lx0, lz0, lx1, lz1] = bbox2(loc);
    // schmale Bereiche (Arme, Flügel): mindestens zwei Felder quer, sonst bleibt der Bereich nackt
    px = Math.max(o.px ?? 3.6, Math.min(px, (lx1 - lx0) / 2)); pz = Math.max(o.pz ?? 3.2, Math.min(pz, (lz1 - lz0) / 2));
    const cells = [];
    // Feld prüfen; an Montageplätzen und Kanten in Viertel teilen, damit der Panzer dicht bleibt
    const tryCell = (rc, depth) => {
      const cell = ccw(rect(...rc).map((p) => rot2(p, ang, piv)));
      const pc = clean(clipPoly(reg, cell));
      if (pc.length < 3 || A2(ccw(pc)) < (o.minA ?? 1.2)) return;
      const split = () => {
        if (depth >= 2 || (depth >= 1 && (rc[2] - rc[0]) < 5) || (rc[2] - rc[0]) < 1.6) return;
        const mx = (rc[0] + rc[2]) / 2, mz = (rc[1] + rc[3]) / 2, h = g / 4;
        for (const q of [[rc[0], rc[1], mx - h, mz - h], [mx + h, rc[1], rc[2], mz - h], [rc[0], mz + h, mx - h, rc[3]], [mx + h, mz + h, rc[2], rc[3]]]) tryCell(q, depth + 1);
      };
      if (!this.support(pc, und, o)) return split();
      let hole = null;
      const bb = bbox2(pc);
      for (const e of this.excl) {
        if (!!e.under !== und) continue;
        if (e.x1 < bb[0] || e.x0 > bb[2] || e.z1 < bb[1] || e.z0 > bb[3]) continue;
        const er = rect(e.x0 - 0.25, e.z0 - 0.25, e.x1 + 0.25, e.z1 + 0.25);
        const inner = offsetPoly(ccw(pc), -0.5);
        if (!hole && er.every(([ex, ez]) => inPoly(inner, ex, ez))) hole = er; else return split();
      }
      cells.push({ pc, hole });
    };
    let row = 0;
    for (let z = lz0 + (o.oz ?? 0); z < lz1 - 0.4; row++) {
      const pzr = pz * (o.vary === false ? 1 : 0.85 + R() * 0.3);
      const off = o.stagger === false ? 0 : (row % 2 ? px * 0.5 : 0);
      for (let x = lx0 - off; x < lx1 - 0.3; x += px) {
        tryCell([x + g / 2, z + g / 2, x + px - g / 2, z + pzr - g / 2], 0);
      }
      z += pzr;
    }
    for (const { pc, hole } of cells) {
      const ar = A2(ccw(pc));
      if (!hole && R() > (o.fill ?? this.F.fill)) continue; // nur ausgewählte schwere Platten, dazwischen trägt die Lackschale
      const kind = hole ? 'cut' : (ar > 5 && R() < (o.panel ?? 0)) ? 'panel' : 'plate';
      const t = (o.t ?? 0.4) * (0.8 + R() * 0.45);
      const layer = kind === 'plate' && ar > 6 && R() < (o.layer ?? 0);
      let fh = null, gre = null;
      if (kind === 'panel') {
        fh = offsetPoly(ccw(pc), -clamp(Math.sqrt(ar) * 0.18, 0.45, 1.0));
        if (A2(ccw(fh)) < 1.5) fh = null; else gre = this.planGreebles(fh, R, und);
      }
      const lin_ = clamp(Math.sqrt(ar) * 0.16, 0.4, 0.9);
      for (const sx of o.sym ? [1, -1] : [1]) {
        const M = (Q) => Q && Q.map(([x, z]) => [sx * x, z]);
        const c = this.facTint(o.c ?? 'paint');
        const info = this.plate(M(pc), { t, ch: o.ch, under: und, L: o.L, c, e: o.e ?? (isPaint(o.c ?? 'paint') ? this.F.flank : o.c), hole: M(hole || fh), maxDH: o.maxDH });
        if (!info) continue;
        if (layer) this.plate(M(offsetPoly(ccw(pc), -lin_)), { t: 0.2, ch: 0.1, under: und, L: o.L, c: o.c2 ?? o.c ?? 'paint', e: o.e ?? this.F.flank });
        if (gre) this.greebles(gre, sx, und);
        if (!und && kind === 'plate' && isPaint(o.c ?? 'paint')) this.facPlate(M(pc), info);
      }
    }
  }
  // Platten entlang eines gebogenen Bandes (Bogen, Flügel): je Abschnitt ein gedrehtes Raster
  armorAlong(path2, halfL, halfR, o = {}) {
    const n = path2.length, segN = [];
    for (let i = 0; i < n - 1; i++) { const a = path2[i], b = path2[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); segN.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]); }
    const miter = (i) => { const p = segN[Math.max(0, i - 1)], q = segN[Math.min(n - 2, i)]; let mx = p[0] + q[0], mz = p[1] + q[1]; const l = Math.hypot(mx, mz); mx /= l; mz /= l; const c = Math.max(0.5, mx * q[0] + mz * q[1]); return [mx / c, mz / c]; };
    for (let i = 0; i < n - 1; i++) {
      const a = path2[i], b = path2[i + 1], ma = miter(i), mb = miter(i + 1);
      let region = ccw([
        [a[0] - ma[0] * halfL[i], a[1] - ma[1] * halfL[i]], [b[0] - mb[0] * halfL[i + 1], b[1] - mb[1] * halfL[i + 1]],
        [b[0] + mb[0] * halfR[i + 1], b[1] + mb[1] * halfR[i + 1]], [a[0] + ma[0] * halfR[i], a[1] + ma[1] * halfR[i]],
      ]);
      if (o.clip) region = clipPoly(region, ccw(o.clip));
      if (region.length < 3) continue;
      this.armor(region, { ...o, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, piv: a, stagger: true });
    }
  }
  planGreebles(H, R, und) {
    const [x0, z0, x1, z1] = bbox2(H), w = x1 - x0, d = z1 - z0, out = [];
    const kind = R();
    const inside = (x, z) => inPoly(H, x, z);
    if (kind < 0.3) { // Lüftungslamellen quer zur längeren Seite
      const along = w > d, L = along ? w : d, n = Math.floor((L - 0.4) / 0.5);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = along ? lerp(x0 + 0.2, x1 - 0.2, t) : (x0 + x1) / 2, z = along ? (z0 + z1) / 2 : lerp(z0 + 0.2, z1 - 0.2, t);
        if (inside(x, z)) out.push({ k: 'box', x, z, w: along ? 0.2 : w - 0.5, d: along ? d - 0.5 : 0.2, h: 0.32, c: 'gun' });
      }
    } else if (kind < 0.55) { // Leitungsbündel
      const along = w > d, n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1), r = 0.16 + R() * 0.12;
        const a = along ? [x0 + 0.3, lerp(z0, z1, t)] : [lerp(x0, x1, t), z0 + 0.3], b = along ? [x1 - 0.3, lerp(z0, z1, t)] : [lerp(x0, x1, t), z1 - 0.3];
        if (inside(...a) && inside(...b)) out.push({ k: 'pipe', a, b, r, c: i % 2 ? 'trim' : 'gun' });
      }
      out.push({ k: 'box', x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.min(1.2, w * 0.3), d: Math.min(1.2, d * 0.3), h: 0.6, c: 'struct' });
    } else if (kind < 0.8) { // Maschinenblöcke
      const n = 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 0.5 + R() * Math.min(1.4, w * 0.35), bd = 0.5 + R() * Math.min(1.4, d * 0.35);
        const x = lerp(x0 + bw / 2 + 0.15, x1 - bw / 2 - 0.15, R()), z = lerp(z0 + bd / 2 + 0.15, z1 - bd / 2 - 0.15, R());
        if (inside(x, z)) out.push({ k: 'box', x, z, w: bw, d: bd, h: 0.3 + R() * 0.55, c: ['gun', 'struct', 'trim', 'dark'][Math.floor(R() * 4)] });
      }
    } else { // Wartungsluke
      const x = (x0 + x1) / 2, z = (z0 + z1) / 2, r = Math.min(w, d) * 0.3;
      if (r > 0.35) { out.push({ k: 'disc', x, z, r, c: 'gun' }); for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push({ k: 'box', x: x + sx * r * 1.1, z: z + sz * r * 1.1, w: 0.22, d: 0.22, h: 0.22, c: 'trim' }); }
    }
    return out;
  }
  greebles(list, sx, und) {
    const sg = und ? -1 : 1;
    for (const it of list) {
      if (it.k === 'box') {
        const x = sx * it.x, h0 = this.hf.query(x, it.z, !und); if (!Number.isFinite(h0)) continue;
        this.put(bx(x, h0 + sg * (it.h / 2 - 0.05), it.z, it.w, it.h + 0.1, it.d), it.c);
      } else if (it.k === 'pipe') {
        const a = [sx * it.a[0], it.a[1]], b = [sx * it.b[0], it.b[1]];
        const ha = this.hf.query(...a, !und), hb = this.hf.query(...b, !und); if (!Number.isFinite(ha) || !Number.isFinite(hb)) continue;
        this.pipe([[a[0], ha + sg * it.r, a[1]], [b[0], hb + sg * it.r, b[1]]], it.r, it.c);
      } else if (it.k === 'disc') {
        const x = sx * it.x, h0 = this.hf.query(x, it.z, !und); if (!Number.isFinite(h0)) continue;
        this.put(cy(x, h0 + sg * 0.1, it.z, it.r, 0.3, 'y', 12), it.c);
        this.put(cy(x, h0 + sg * 0.22, it.z, it.r * 0.7, 0.16, 'y', 12), 'dark');
      }
    }
  }
  // Fraktionsfarbe einer Platte (SATURN: einzelne ersetzte Platten in anderem Orange)
  facTint(c) {
    if (this.E !== 'saturn' || c !== 'paint') return c;
    const r = this.RF();
    if (r < 0.06) return [1.12, 1.02, 0.78];
    if (r < 0.11) return [0.86, 0.8, 0.82];
    return c;
  }
  // Fraktionsdetails auf einer fertigen Platte
  facPlate(P, info) {
    const RF = this.RF, Pc = ccw(P);
    if (this.E === 'saturn' && RF() < 0.22) { // Nietenreihe entlang einer Kante
      const i = Math.floor(RF() * Pc.length), a = Pc[i], b = Pc[(i + 1) % Pc.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nn = edgeN(Pc, i), n = Math.floor(L / 0.7);
      for (let k = 1; k < n; k++) {
        const x = lerp(a[0], b[0], k / n) - nn[0] * 0.35, z = lerp(a[1], b[1], k / n) - nn[1] * 0.35;
        const y = info.Y(x, z); if (!Number.isFinite(y)) continue;
        this.put(bx(x, y + 0.03, z, 0.2, 0.12, 0.2), 'trim');
      }
    } else if (this.E === 'europa' && RF() < 0.1) { // eisweißer Leuchtschlitz, eingefasst
      const c = centroid(Pc), y = info.Y(...c); if (!Number.isFinite(y)) return;
      const [x0, z0, x1, z1] = bbox2(Pc), along = (x1 - x0) > (z1 - z0), L = Math.min(along ? x1 - x0 : z1 - z0, 4) * 0.5;
      if (L < 0.8) return;
      this.put(bx(c[0], y + 0.02, c[1], along ? L + 0.3 : 0.5, 0.1, along ? 0.5 : L + 0.3), 'trim');
      this.add('glow', bx(c[0], y + 0.08, c[1], along ? L : 0.16, 0.06, along ? 0.16 : L));
    }
  }
  // Tragfähige Unterlage: 5×5-Raster im Feld, alle Punkte auf dem Rumpf, Sprung zwischen Nachbarn ≤ o.jump
  support(pc, und, o = {}) {
    const [x0, z0, x1, z1] = bbox2(pc), n = 5, jump = o.jump ?? 0.5, G = [];
    const inner = offsetPoly(ccw(pc), -0.12);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = lerp(x0, x1, (i + 0.5) / n), z = lerp(z0, z1, (j + 0.5) / n);
      G.push(inPoly(inner, x, z) ? this.hf.query(x, z, !und) : null);
    }
    for (const p of inner) G.push(this.hf.query(p[0], p[1], !und));
    const vals = G.filter((v) => v !== null);
    if (vals.length < 3 || vals.some((v) => !Number.isFinite(v))) return false;
    if (o.yr && vals.some((v) => v < o.yr[0] || v > o.yr[1])) return false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = G[i * n + j]; if (v === null) continue;
      const r = i < n - 1 ? G[(i + 1) * n + j] : null, u = j < n - 1 ? G[i * n + j + 1] : null;
      if ((r !== null && Math.abs(r - v) > jump) || (u !== null && Math.abs(u - v) > jump)) return false;
    }
    return true;
  }
  // Ausschlussfläche (Montageplätze, Wappen): Panzerraster lässt sie frei
  exclude(x0, z0, x1, z1, under = false) { this.excl.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), under }); }
  surf(P, top = true) { const hs = P.map(([x, z]) => this.hf.query(x, z, top)).filter(Number.isFinite); return hs.length ? [Math.min(...hs), Math.max(...hs)] : [NaN, NaN]; }
  // Laserfassung: Sockel, zwei Panzerwangen, Rückblock und Drehkranz; wächst mit der Schiffsklasse K. Modul bleibt gleich.
  laser(x, z, o = {}) {
    const K = o.K ?? this.K, s = this.ls, hang = !!o.hang, sg = hang ? -1 : 1;
    const hw = 0.56 * s + 0.32, cw = 0.4 * K + 0.25, zf = z + 1.45 + 0.4 * K, zb = z - 2.2 - 0.6 * K;
    const foot = rect(x - hw - cw, zb, x + hw + cw, zf);
    let y = o.y;
    if (y == null) { const smp = [...foot, [x, z]]; const [lo, hi] = this.surf(smp, !hang); y = hang ? lo : hi; }
    if (!Number.isFinite(y)) throw new Error(`Laserplatz ohne Rumpf bei ${x}, ${z}`);
    const base = y + sg * 0.3;
    if (o.deck !== false) { const [lo, hi] = this.surf(foot, !hang); const yIn = hang ? hi + 0.4 : lo - 0.4; this.deck(offsetPoly(ccw(foot), 0.35), Math.min(yIn, base), Math.max(yIn, base), { c: 'struct', cb: 0.2, ct: 0.18, reg: false }); }
    const hc = 1.0 * s + 0.22 * K;
    const cheek = [[x + hw, zb], [x + hw + cw, zb], [x + hw + cw, zf - 0.7 * K], [x + hw + cw * 0.35, zf], [x + hw, zf]];
    const lv = hang ? [[base - hc, 0.16], [base - hc + 0.16, 0], [base, 0]] : [[base, 0], [base + hc - 0.16, 0], [base + hc, 0.16]];
    for (const m of [1, -1]) {
      const P = cheek.map(([px_, pz]) => [x + m * (px_ - x), pz]);
      const { body, rim } = taperGeo(P, lv); this.put(body, 'paint2'); if (rim) this.put(rim, this.F.pe);
    }
    const rb = rect(x - hw, zb, x + hw, zb + 0.75 + 0.3 * K);
    this.deck(rb, hang ? base - hc * 0.7 : base, hang ? base : base + hc * 0.7, { c: 'struct', cb: 0.1, ct: 0.15, reg: false });
    this.put(cy(x, base + sg * 0.05, z - 0.2, 0.62 * s, 0.12, 'y', 12), 'trim');
    this.exclude(foot[0][0] - 0.35, zb - 0.35, foot[1][0] + 0.35, zf + 0.35, hang);
    this.lasers.push({ pos: [x, base, z], hang, cap: { w: 2 * hw - 0.14, z0: zb - z + 0.8 + 0.3 * K, z1: zf - z - 0.15, h: hc * 0.45 } });
    return base;
  }
  laserSym(x, z, o) { const y = this.laser(x, z, o); this.laser(-x, z, { ...o, y: o?.y ?? (o?.hang ? y + 0.3 : y - 0.3) }); }
  // Laserbank: gemeinsames Deck unter mehreren Fassungen (eine Seite; laserBankSym spiegelt)
  laserBank(list, o = {}) {
    const K = o.K ?? this.K, s = this.ls, hang = !!o.hang;
    const hw = 0.56 * s + 0.32 + 0.4 * K + 0.25;
    const pts = [];
    for (const [x, z] of list) pts.push(...rect(x - hw, z - 2.2 - 0.6 * K, x + hw, z + 1.45 + 0.4 * K));
    const H = hull2(pts);
    let y = o.y;
    if (y == null) { const [lo, hi] = this.surf([...H, ...list], !hang); y = hang ? lo : hi; }
    const [lo, hi] = this.surf(H, !hang);
    const base = y + (hang ? -0.3 : 0.3), yIn = hang ? hi + 0.5 : lo - 0.5;
    this.deck(offsetPoly(ccw(H), 0.6), Math.min(yIn, base), Math.max(yIn, base), { c: o.c ?? 'struct', cb: hang ? 0.15 : 0.5, ct: hang ? 0.5 : 0.18, reg: false });
    for (const [x, z] of list) this.laser(x, z, { ...o, y, deck: false });
    return y;
  }
  laserBankSym(list, o = {}) { const y = this.laserBank(list, o); this.laserBank(list.map(([x, z]) => [-x, z]), { ...o, y }); }
  // Generator-Wanne: Boden, Rahmen mit Trennwänden, vorn/hinten Deckel – vom Generator sieht man nur die Leuchtfuge
  genBay(cells, o = {}) {
    const s = this.gs, K = o.K ?? this.K, cs = 2.5 * s, wt = 0.3 + 0.1 * K, hw = 0.95 * s;
    const pts = []; for (const [x, z] of cells) pts.push(...rect(x - cs / 2 - wt, z - cs / 2 - wt, x + cs / 2 + wt, z + cs / 2 + wt));
    const [bx0, bz0, bx1, bz1] = bbox2(pts), B = rect(bx0, bz0, bx1, bz1);
    const smp = [...B, ...cells, [(bx0 + bx1) / 2, (bz0 + bz1) / 2]];
    const [lo, hi] = this.surf(smp, true);
    if (!Number.isFinite(hi)) throw new Error(`Generator-Wanne ohne Rumpf bei ${cells[0]}`);
    const y0 = o.y ?? hi + 0.05;
    this.deck(offsetPoly(ccw(B), 0.25), lo - 0.4, y0, { c: 'dark', cb: 0.1, ct: 0.08, reg: false });
    const segs = new Map();
    const seg = (ax, az, bx_, bz) => { const k = [ax, az, bx_, bz].map((v) => v.toFixed(2)).join(','); segs.set(k, [ax, az, bx_, bz]); };
    for (const [x, z] of cells) {
      const a = cs / 2 + wt / 2;
      seg(x - a, z - a, x + a, z - a); seg(x - a, z + a, x + a, z + a); seg(x - a, z - a, x - a, z + a); seg(x + a, z - a, x + a, z + a);
    }
    for (const [ax, az, bx_, bz] of segs.values()) {
      const alongX = Math.abs(bx_ - ax) > Math.abs(bz - az), L = Math.hypot(bx_ - ax, bz - az) + wt;
      const cx = (ax + bx_) / 2, cz = (az + bz) / 2, h = hw + (y0 - lo) + 0.3;
      const g = alongX ? bx(cx, y0 + hw - h / 2, cz, L, h, wt) : bx(cx, y0 + hw - h / 2, cz, wt, h, L);
      this.put(g, 'struct');
      this.put(alongX ? bx(cx, y0 + hw + 0.04, cz, L, 0.1, wt * 0.6) : bx(cx, y0 + hw + 0.04, cz, wt * 0.6, 0.1, L), this.F.pe);
    }
    for (const [x, z] of cells) {
      for (const sz of [1, -1]) this.put(bx(x, y0 + hw - 0.1, z + sz * (cs / 2 - 0.36 * s), cs + 0.02, 0.18, 0.72 * s), 'paint2');
      this.gens.push({ pos: [x, y0, z], cap: { s: cs - 0.1, h: hw - 0.08, d: cs - 1.44 * s + 0.1 } });
    }
    this.exclude(bx0 - 0.3, bz0 - 0.3, bx1 + 0.3, bz1 + 0.3);
    return y0;
  }
  genBaySym(cells, o) { const y = this.genBay(cells, o); this.genBay(cells.map(([x, z]) => [-x, z]), { ...o, y }); }
  // Triebwerk: Vorderkante bei z, Glocke ragt nach hinten (−z), mit Haube
  nozzle(x, y, z, r, len, o = {}) {
    const segs = Math.min(o.segs ?? 10, 10); this.P.keep = true; // Düsen nie vereinfachen (Rundungen und Tiefe bleiben)
    const g = lathe([[r * 0.74, 0], [r * 0.9, len * 0.4], [r, len], [r * 0.86, len], [r * 0.78, len * 0.55], [r * 0.56, len * 0.42], [0, len * 0.42]], segs, '-z');
    g.translate(x, y, z);
    this.put(g, 'noz');
    if (o.collar !== false) this.put(cy(x, y, z + len * 0.05, r * 1.1, len * 0.34, 'z', segs), o.collarColor || 'dark');
    if (o.cowl !== false) { // achteckige Haube um den vorderen Glockenteil
      const cw = lathe([[r * 1.32, 0], [r * 1.32, len * 0.42], [r * 1.18, len * 0.55], [r * 1.04, len * 0.55]], 8, '-z', false);
      cw.translate(x, y, z + 0.05);
      this.put(cw, o.cowlColor || 'struct');
      for (let i = 0; i < 2; i++) { const a = Math.PI / 4 + i * Math.PI; this.put(bx(x + Math.cos(a) * r * 1.38, y + Math.sin(a) * r * 1.38, z - len * 0.2, 0.22, 0.22, len * 0.45, 0, 0, a), 'trim'); }
    }
    // Innenleben: Schubkegel (Zentralkörper) vor der Brennkammer, Leuchtring bleibt zwischen Kegel und Glockenwand sichtbar
    const plug = lathe([[r * 0.46, 0], [r * 0.4, len * 0.18], [r * 0.2, len * 0.36], [0, len * 0.46]], 8, '-z');
    plug.translate(x, y, z - len * 0.42 - 0.02); this.put(plug, 'gun');
    const d = new THREE.CircleGeometry(r * 0.8, segs); d.rotateY(Math.PI); d.translate(x, y, z - len * 0.42 - 0.04); d.userData.noFix = true;
    this.engineGeo.push(d);
    const ring = new THREE.RingGeometry(r * 0.8, r * 0.86, segs); ring.rotateY(Math.PI); ring.translate(x, y, z - len * 0.72); ring.userData.noFix = true;
    this.engineGeo.push(ring);
    this.engines.push({ pos: [x, y, z - len], size: +(r / 2).toFixed(2), r });
    this.P.keep = false;
  }
  nozzlePair(x, y, z, r, len, o) { this.nozzle(x, y, z, r, len, o); this.nozzle(-x, y, z, r, len, o); }
  // Cockpit: dunkle Kanzel (Glas) mit Rahmen
  canopy(z0, z1, w, yb, yt) {
    const secs = [
      [z0, prof(w * 0.45, lerp(yb, yt, 0.55), yb, { ct: 0.5 })],
      [lerp(z0, z1, 0.3), prof(w, yt, yb, { ct: 0.55, dome: 0.12 * w })],
      [lerp(z0, z1, 0.75), prof(w * 0.98, yt, yb, { ct: 0.55, dome: 0.12 * w })],
      [z1, prof(w * 0.7, lerp(yb, yt, 0.75), yb, { ct: 0.5 })],
    ];
    this.add('glass', zs(0, 0, secs)); this.P.keep = true; // Kanzel nie vereinfachen
    this.put(zs(0, 0, [[lerp(z0, z1, 0.08), [[0.12, yt + 0.1 * w + 0.1], [-0.12, yt + 0.1 * w + 0.1], [-0.12, yb], [0.12, yb]]], [lerp(z0, z1, 0.97), [[0.12, yt + 0.1 * w + 0.1], [-0.12, yt + 0.1 * w + 0.1], [-0.12, yb], [0.12, yb]]]]), 'trim');
    for (const t of [0.42, 0.66]) this.put(cbx(0, lerp(yb, yt, 0.55), lerp(z0, z1, t), w * 2.08, (yt - yb) * 1.1 + 0.15, 0.3, 0.2), 'trim');
    this.hp.cockpit = [0, yt, lerp(z0, z1, 0.5)]; this.P.keep = false;
  }
  // Zierleiste entlang Polylinie
  strip(pts, w = 0.32, h = 0.14, c = 'edge') {
    const p = [[w / 2, h], [-w / 2, h], [-w / 2, -0.06], [w / 2, -0.06]];
    this.put(sweep(pts, pts.map(() => p)), c);
  }
  stripSym(pts, w, h, c) { this.strip(pts, w, h, c); this.strip(pts.map(([x, y, z]) => [-x, y, z]), w, h, c); }
  // eingefasster tiefer Leuchtkanal: zwei Rahmenleisten, dazwischen tiefer liegend die Leuchtfuge
  channel(pts, w = 0.36, c = 'dark') {
    const r = 0.16;
    for (const sd of [1, -1]) {
      const off = sd * (w / 2 + r / 2);
      const p = [[off + r / 2, 0.26], [off - r / 2, 0.26], [off - r / 2, -0.05], [off + r / 2, -0.05]];
      this.put(sweep(pts, pts.map(() => p)), c);
    }
    const g = [[w / 2 + 0.02, 0.08], [-w / 2 - 0.02, 0.08], [-w / 2 - 0.02, -0.04], [w / 2 + 0.02, -0.04]];
    this.add('glow', sweep(pts, pts.map(() => g)));
  }
  channelSym(pts, w, c) { this.channel(pts, w, c); this.channel(pts.map(([x, y, z]) => [-x, y, z]), w, c); }
  // Kanal auf der Oberfläche entlang Grundrisspunkten (Höhe aus dem Höhenfeld)
  surfChannel(pts2, w, lift = 0.02) {
    const pts = pts2.map(([x, z]) => [x, this.hf.query(x, z) + lift, z]);
    if (pts.some((p) => !Number.isFinite(p[1]))) return;
    this.channel(pts, w);
  }
  bolts(a, b, n, s = 0.22) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.put(bx(lerp(a[0], b[0], t), lerp(a[1], b[1], t) + s * 0.25, lerp(a[2], b[2], t), s, s * 0.5, s), 'trim');
    }
  }
  boltsSym(a, b, n, s) { this.bolts(a, b, n, s); this.bolts([-a[0], a[1], a[2]], [-b[0], b[1], b[2]], n, s); }
  // SATURN: Warnstreifen als Geometrie (gelb/schwarz schräg), entlang a → b, Breite w Richtung side, Normale nrm
  hazard(a, b, w, o = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), nrm = new THREE.Vector3(...(o.nrm || [0, 1, 0])).normalize();
    const u = B.clone().sub(A), L = u.length(); u.normalize();
    const side = o.side ? new THREE.Vector3(...o.side).normalize() : new THREE.Vector3().crossVectors(nrm, u).normalize();
    const n = Math.max(2, Math.round(L / (o.step ?? 0.9))), th = 0.07, sh = w * 0.7;
    for (let i = 0; i < n; i++) {
      const s0 = (i / n) * L, s1 = ((i + 1) / n) * L, pos = [];
      const p = (s, sd, up) => A.clone().addScaledVector(u, clamp(s + sd * sh / w, 0, L)).addScaledVector(side, sd).addScaledVector(nrm, up).toArray();
      const P0 = [p(s0, 0, 0), p(s1, 0, 0), p(s1, w, 0), p(s0, w, 0)], P1 = [p(s0, 0, th), p(s1, 0, th), p(s1, w, th), p(s0, w, th)];
      quad(pos, ...P1, nrm.toArray());
      const sideN = [side.clone().negate(), u.clone(), side.clone(), u.clone().negate()];
      for (let k = 0; k < 4; k++) quad(pos, P0[k], P0[(k + 1) % 4], P1[(k + 1) % 4], P1[k], sideN[k].toArray());
      this.put(geoOf(pos), i % 2 ? '#141416' : '#d9a21e');
    }
  }
  hazardSym(a, b, w, o = {}) { this.hazard(a, b, w, o); this.hazard([-a[0], a[1], a[2]], [-b[0], b[1], b[2]], w, { ...o, side: o.side ? [-o.side[0], o.side[1], o.side[2]] : undefined, nrm: o.nrm ? [-o.nrm[0], o.nrm[1], o.nrm[2]] : undefined }); }
  // ERIS: Klinge als Keil (dick an der Wurzel, dünn an der Spitze) aus einem Panzerwurzelblock, in der Rumpfebene nach hinten
  blade(root, tip, w, t, o = {}) {
    const [rx, ry, rz] = root, ty = tip[1] ?? ry;
    const dir = [tip[0] - rx, tip[2] - rz], dl = Math.hypot(...dir), ux = dir[0] / dl, uz = dir[1] / dl;
    const rb = [[rx - ux * w * 0.7 - uz * w * 0.75, rz - uz * w * 0.7 + ux * w * 0.75], [rx + ux * w * 0.5 - uz * w * 0.75, rz + uz * w * 0.5 + ux * w * 0.75], [rx + ux * w * 0.5 + uz * w * 0.75, rz + uz * w * 0.5 - ux * w * 0.75], [rx - ux * w * 0.7 + uz * w * 0.75, rz - uz * w * 0.7 - ux * w * 0.75]];
    this.deck(rb, ry - t * 1.1, ry + t * 1.1, { c: 'struct', cb: t * 0.5, ct: t * 0.5, reg: false });
    const wedge = (k) => [[-w * k / 2, 0], [w * 0.1 * k, t * k / 2], [w * k / 2, t * k * 0.32], [w * k / 2, -t * k * 0.32], [w * 0.1 * k, -t * k / 2]];
    const steps = [0, 0.35, 0.7, 1], ks = [1, 0.78, 0.48, 0.14];
    const pathP = steps.map((s) => [lerp(rx, tip[0], s), lerp(ry, ty, s), lerp(rz, tip[2], s)]);
    this.put(sweep(pathP, ks.map((k) => wedge(Math.max(k, 0.08)))), 'paint');
    this.strip(pathP.slice(0, 3).map(([x, y, z]) => [x - uz * w * 0.22, y + t * 0.36, z + ux * w * 0.22]), 0.12, 0.06, 'edge');
  }
  bladeSym(root, tip, w, t, o) { this.blade(root, tip, w, t, o); this.blade([-root[0], root[1], root[2]], [-tip[0], tip[1], tip[2]], w, t, o); }
  antenna(x, y, z, h, r = 0.08) {
    this.put(cy(x, y + h / 2, z, r, h, 'y', 6), 'trim');
    this.put(bx(x, y + h, z, r * 5, r * 2.5, r * 5), 'dark');
    this.put(bx(x, y + h * 0.6, z, r * 3, r * 1.5, r * 3), 'dark');
  }
  // Panzerband entlang einer Grundriss-Linie [[x, z], …] zwischen den seitlichen Abständen o1 und o2
  band(pts, o1, o2, y0, y1, c = 'paint2', o = {}) {
    const off = (k) => pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      return [p[0] + (dz / l) * k, p[1] + (-dx / l) * k];
    });
    this.deck([...off(o1), ...off(o2).reverse()], y0, y1, { c, cb: o.cb ?? 0.12, ct: o.ct ?? Math.min(0.2, (y1 - y0) * 0.3), reg: !!o.reg });
  }
  bandSym(pts, o1, o2, y0, y1, c, o) { this.band(pts, o1, o2, y0, y1, c, o); this.band(pts.map(([x, z]) => [-x, z]), -o1, -o2, y0, y1, c, o); }
  // Seitenpanzer entlang einer Außenkante: einzelne Platten mit Fugen und Rippen dazwischen
  skirt(pts, y0, y1, o = {}) {
    const seg = (o.seg ?? 4.2) * 2.2, out = o.out ?? 0.35, t = o.t ?? 0.3;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(L / seg));
      for (let k = 0; k < n; k++) {
        const s0 = k / n + 0.14 / L, s1 = (k + 1) / n - 0.14 / L;
        const p0 = [lerp(a[0], b[0], s0), lerp(a[1], b[1], s0)], p1 = [lerp(a[0], b[0], s1), lerp(a[1], b[1], s1)];
        this.band([p0, p1], -out, -out + t, y0, y1, o.c ?? 'paint', { ct: 0.1, cb: 0.1 });
        if (o.rib !== false) { const pr = [lerp(a[0], b[0], (k + 1) / n), lerp(a[1], b[1], (k + 1) / n)]; if (k < n - 1 || i < pts.length - 2) this.band([[pr[0] - (b[0] - a[0]) / L * 0.14, pr[1] - (b[1] - a[1]) / L * 0.14], [pr[0] + (b[0] - a[0]) / L * 0.14, pr[1] + (b[1] - a[1]) / L * 0.14]], -out - 0.12, -out + t + 0.2, y0 - 0.2, y1 + 0.12, 'struct'); }
      }
    }
  }
  skirtSym(pts, y0, y1, o) { this.skirt(pts, y0, y1, o); this.skirt(pts.map(([x, z]) => [-x, z]).reverse(), y0, y1, o); }
  vent(x, y, z, w, d, n = 5, rot = 0) {
    const g = [], t = 0.22;
    g.push(bx(0, 0.1, d / 2 - t / 2, w, 0.24, t), bx(0, 0.1, -d / 2 + t / 2, w, 0.24, t), bx(w / 2 - t / 2, 0.1, 0, t, 0.24, d), bx(-w / 2 + t / 2, 0.1, 0, t, 0.24, d));
    for (const q of g) { q.rotateY(rot); q.translate(x, y, z); this.put(q, 'struct'); }
    const fl = bx(0, 0.0, 0, w - 0.1, 0.06, d - 0.1); fl.rotateY(rot); fl.translate(x, y, z); this.put(fl, 'dark');
    for (let i = 0; i < n; i++) {
      const q = bx(0, 0.07, -d / 2 + t + (i + 0.5) * (d - 2 * t) / n, w - 2 * t, 0.1, (d - 2 * t) / n * 0.45);
      q.rotateY(rot); q.translate(x, y, z); this.put(q, 'gun');
    }
  }
  pipe(pts, r = 0.25, c = 'trim') {
    const p = Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * Math.PI * 2) * r, Math.sin(i / 6 * Math.PI * 2) * r]);
    this.put(sweep(pts, pts.map(() => p)), c);
  }
  pipeSym(pts, r, c) { this.pipe(pts, r, c); this.pipe(pts.map(([x, y, z]) => [-x, y, z]), r, c); }
  light(x, y, z, s = 0.35) { this.add('glow', bx(x, y, z, s, s * 0.6, s)); }
  ribs(a, b, n, sx, sy, sz, c = 'struct') {
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); this.put(bx(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), sx, sy, sz), c); }
  }
  ribsSym(a, b, n, sx, sy, sz, c) { this.ribs(a, b, n, sx, sy, sz, c); this.ribs([-a[0], a[1], a[2]], [-b[0], b[1], b[2]], n, sx, sy, sz, c); }
  // Wappen: links (+X) Fraktion, rechts (−X) austauschbarer Clanplatz; Träger sitzt auf der Oberfläche
  insignia(x, z, w) {
    const h = w * 23 / 34, m = 0.3;
    let top = -Infinity, low = Infinity;
    for (const sx of [1, -1]) { const [lo, hi] = this.surf([...rect(sx * x - w / 2 - m, z - h / 2 - m, sx * x + w / 2 + m, z + h / 2 + m), [sx * x, z]]); top = Math.max(top, hi); low = Math.min(low, lo); }
    const y = top + 0.12;
    for (const sx of [1, -1]) {
      this.deck(rect(sx * x - w / 2 - m, z - h / 2 - m, sx * x + w / 2 + m, z + h / 2 + m), low - 0.3, y, { c: 'dark', cb: 0.1, ct: 0.1, reg: false });
      this.put(bx(sx * x, y + 0.02, z - h / 2 - m * 0.6, w + 2 * m, 0.08, 0.14), this.F.pe);
      this.exclude(sx * x - w / 2 - m - 0.2, z - h / 2 - m - 0.2, sx * x + w / 2 + m + 0.2, z + h / 2 + m + 0.2);
    }
    this.ins = { x, y: y + 0.025, z, w, h };
  }
  // Ruß/Hitzespuren um die Düsen: Eckfarben abdunkeln (SATURN stark, ERIS mittel, EUROPA kaum)
  soot() {
    const k = this.F.soot; if (!k) return;
    for (const bk of ['hull', 'metal']) for (const g of this.P.b[bk] || []) {
      const p = g.attributes.position, c = g.attributes.color;
      for (let i = 0; i < p.count; i++) {
        let f = 0;
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        for (const e of this.engines) {
          const dz = z - e.pos[2]; if (dz < -0.5 || dz > e.r * 4) continue;
          const d = Math.hypot(x - e.pos[0], y - e.pos[1], dz * 0.6);
          f = Math.max(f, clamp(1 - (d - e.r * 0.7) / (e.r * 2.2), 0, 1));
        }
        if (f > 0) { const m = 1 - k * f * f; c.setXYZ(i, c.getX(i) * m, c.getY(i) * m, c.getZ(i) * m * 0.97); }
      }
    }
  }
}

// ---------------------------------------------------------------- S03: kompakter Querträger mit Hammerbug (50 m)
function buildS3(F) {
  const S = new Ship(F, 3, 50, 1.0), E = F.key;
  // Hammer-Kernträger (dunkles Tragwerk), drei versetzt gestufte Panzerwangen je Seite mit tiefer gefaster Unterkante
  S.deck(symO([[0, 24.0], [8, 23.2], [15, 21.4], [19.4, 18.8], [21, 16.0], [20.2, 12.8], [15.4, 11.0], [6, 10.4], [0, 10.4]]), -2.6, 0.4, { cb: 1.0, ct: 0.2 });
  const cheekA = [[3.0, 24.8], [9, 24.1], [15.6, 22.2], [20.4, 19.5], [22.6, 16.3], [21.8, 12.6], [16.6, 10.8], [9, 10.2], [3.0, 10.6]];
  const cheekB = [[4.4, 23.0], [10, 22.3], [15.4, 20.6], [19.0, 18.0], [20.0, 15.4], [18.8, 13.0], [13.6, 12.0], [6, 11.8], [4.4, 12.2]];
  const cheekC = [[4.8, 21.4], [8.6, 20.8], [10.4, 19.2], [10.6, 14.4], [9, 13.0], [5, 13.0]];
  for (const sx of [1, -1]) {
    const M = (P) => P.map(([x, z]) => [sx * x, z]);
    S.deck(M(cheekA), -4.0, 1.2, { c: 'paint', levels: [[-4.0, 2.0], [-1.8, 0.25], [-1.4, 0], [0.9, 0], [1.2, 0.3]] });
    S.deck(M(cheekB), 0.8, 2.6, { c: 'paint', levels: [[0.8, 0.5], [1.2, 0], [2.3, 0], [2.6, 0.3]] });
    S.deck(M(cheekC), 2.2, 3.8, { c: 'paint', levels: [[2.2, 0.4], [2.6, 0], [3.5, 0], [3.8, 0.28]] });
  }
  // Stoßpanzerung an der Unterkante vorn, dunkle Einschnitte zwischen Bug und Heck
  S.bandSym([[3.4, 24.9], [9, 24.2], [15.6, 22.3], [20.4, 19.6], [22.6, 16.4]], -0.1, 0.9, -2.9, -1.6, 'paint2');
  S.deck(symO([[0, 24.2], [3.0, 23.6], [3.4, 16.6], [0, 16.2]]), -3.6, -1.8, { c: 'struct', cb: 0.4, ct: 0.1 }); // Kinngehäuse
  // Kommandokapsel (schmal, erhöht) über dem Ansatz des Querkörpers
  S.mass(zs(0, 0, [
    [21.6, prof(1.0, 3.2, 1.0, { ct: 0.5 })], [19, prof(2.6, 4.7, 0.2, { ct: 0.45 })], [12, prof(3.2, 5.1, -0.8, { ct: 0.4, dome: 0.3 })],
    [2, prof(3.0, 5.0, -0.8, { ct: 0.4, dome: 0.3 })], [-7, prof(2.3, 3.8, -0.2, { ct: 0.45 })],
  ]));
  S.skirtSym([[3.25, 18.6], [3.35, 12], [3.35, 2], [2.8, -6.5]], 0.6, 3.9, { seg: 3.4, out: 0.25, t: 0.35 });
  S.canopy(20.2, 13.4, 1.95, 4.0, 5.55);
  // Hals: tief liegende Lastträger, offene dunkle Zwischenräume
  for (const sx of [1, -1]) S.put(cbx(sx * 2.3, -2.4, 2.2, 1.3, 1.5, 19.5, 0.3), 'struct');
  for (const z of [8, 3.5, -1, -4.8]) S.put(cbx(0, -2.8, z, 5.6, 0.7, 0.9, 0.3), 'dark');
  for (const sx of [1, -1]) for (const z of [7.2, 1.2, -4.2]) S.put(bx(sx * 2.3, -1.2, z, 0.5, 2.2, 0.5, 0.35 * sx), 'gun');
  S.pipeSym([[3.4, 0.4, 10.6], [3.6, 0.2, 2], [3.4, 0.4, -6.4]], 0.3, 'trim');
  S.pipeSym([[3.2, -0.9, 10.6], [3.4, -1.1, -6.4]], 0.22, 'gun');
  for (const sx of [1, -1]) { // dunkle Rückwand des Hammers mit Rippen
    S.band([[sx * 4.4, 10.9], [sx * 9, 10.3], [sx * 16.6, 10.9], [sx * 21.6, 12.5]], sx * 0.15, sx * -0.35, -3.0, 1.0, 'struct');
    for (let i = 0; i < 4; i++) { const x = sx * (6 + i * 4); S.put(bx(x, -0.9, 10.0 + (i === 3 ? 0.9 : 0), 0.5, 3.6, 0.7), 'struct'); }
  }
  // hinterer Schubblock in drei Stufen
  S.deck(symO([[0, -5.6], [6.6, -6.2], [9.2, -8.8], [9.8, -14], [9.8, -23.2], [8.6, -25.8], [0, -25.8]]), -3.0, 1.0, { cb: 0.9, ct: 0.3 });
  S.deck(symO([[0, -6.6], [6.0, -7.2], [8.2, -9.4], [8.6, -14], [8.6, -24.8], [0, -24.8]]), 0.6, 2.2, { cb: 0.2, ct: 0.3 });
  S.deck(symO([[0, -8.4], [3.4, -9.0], [4.0, -12], [4.0, -23.6], [0, -23.6]]), 2.0, 3.8, { c: 'paint', cb: 0.2, ct: 0.35 });
  S.band([[-6.4, -5.5], [0, -4.9], [6.4, -5.5]], 0.2, -0.4, -2.6, 0.8, 'dark'); // Einschnitt vorn am Schubblock
  for (const sx of [1, -1]) {
    S.mass(zs(sx * 10.0, -0.6, [[-7.0, prof(0.8, 1.0, -1.4, { ct: 0.45 })], [-9.6, prof(1.3, 1.6, -2.0, { ct: 0.4 })], [-21, prof(1.3, 1.6, -2.0, { ct: 0.4 })], [-24.2, prof(0.9, 1.1, -1.6, { ct: 0.45 })]]), 'paint2');
    S.ribs([sx * 10.2, 0.9, -10.4], [sx * 10.2, 0.9, -20.2], 7, 1.5, 0.3, 0.5, 'struct');
  }
  S.deck(symO([[5.2, -24.6], [9.0, -24.6], [9.0, -26.4], [0, -26.4]]), -2.6, 1.8, { c: 'shell', cb: 0.45, ct: 0.45 });
  S.nozzle(0, -0.5, -25.6, 2.3, 3.2); S.nozzlePair(5.4, -0.5, -25.6, 2.0, 3.0); S.nozzlePair(8.4, 1.0, -25.0, 0.8, 1.3, { collar: false, cowl: false, segs: 8 });
  // Montage: zwei Laserpaare als Bänke auf den Bugschultern, ein Kinnlaser im Gehäuse; Generator-Wannen
  S.laserBankSym([[13.2, 18.4], [17.4, 16.0]]);
  S.laser(0, 20.4, { hang: true });
  S.genBaySym([[6.3, -12.9], [6.3, -16.2]]);
  S.genBay([[0, 6.8]]);
  S.insignia(7.6, 16.8, 3.4);
  // Panzerplatten: Kapselrücken, Schubblock, Unterseiten
  S.armor(symO([[0, 12.6], [2.6, 12.6], [2.6, -6], [0, -6]]), { sym: true, px: 2.6, pz: 3.0, t: 0.3, panel: 0.15 });
  S.armor(symO([[0, -6.6], [6.0, -7.2], [8.2, -9.4], [8.6, -14], [8.6, -24.8], [0, -24.8]]), { sym: true, px: 2.8, pz: 2.8, t: 0.35, panel: 0.3, layer: 0.25 });
  S.armor(symO([[0, -8.4], [3.4, -9.0], [4.0, -12], [4.0, -23.6], [0, -23.6]]), { sym: true, px: 2.0, pz: 2.6, t: 0.22, layer: 0.2 });
  S.armor(symO([[0, 23.0], [8, 22.3], [15, 20.6], [19, 18], [20.2, 13], [15.4, 11.0], [0, 10.6]]), { sym: true, under: true, c: 'under', px: 3.6, pz: 3.2, t: 0.3, panel: 0.3 });
  S.armor(symO([[0, -5.8], [6.6, -6.2], [9.2, -8.8], [9.6, -14], [9.6, -23.2], [8.4, -25.6], [0, -25.6]]), { sym: true, under: true, c: 'under', px: 3.0, pz: 3.0, t: 0.3, panel: 0.35 });
  for (const sx of [1, -1]) {
    S.armor(cheekB.map(([x, z]) => [sx * x, z]), { px: 2.4, pz: 2.2, t: 0.16, gap: 0.22, maxDH: 0.3, panel: 0.2 });
    S.armor(cheekA.map(([x, z]) => [sx * x, z]), { px: 2.0, pz: 1.8, t: 0.14, gap: 0.2, maxDH: 0.3, panel: 0.1 });
    S.armor(cheekC.map(([x, z]) => [sx * x, z]), { px: 1.8, pz: 2.0, t: 0.14, gap: 0.2, maxDH: 0.3, layer: 0.3 });
  }
  S.channel([[0, 3.85, -9], [0, 3.85, -23]], 0.28);
  S.antenna(0.9, 4.6, -2.5, 3.2); S.antenna(-0.9, 4.4, -3.4, 2.2);
  for (const sx of [1, -1]) { S.light(sx * 22.7, 1.0, 16.2); S.light(sx * 9.8, 1.2, -24.6); }
  S.hp.drone = [0, 9, 0]; S.hp.ground = [0, -4.6, 0];
  if (E === 'europa') {
    S.stripSym([[3.6, 1.25, 24.9], [9, 1.25, 24.2], [15.6, 1.25, 22.3], [20.4, 1.25, 19.6], [22.6, 1.25, 16.4]], 0.32, 0.1, 'trim');
    S.channelSym([[3.6, 5.0, 11], [3.6, 5.0, 3]], 0.18);
    S.stripSym([[8.7, 2.25, -9.4], [8.7, 2.25, -24.6]], 0.26, 0.1, 'trim');
  } else if (E === 'saturn') {
    S.hazardSym([3.2, 1.22, 24.6], [15.4, 1.22, 22.0], 0.7, { side: [0, 0, -1] });
    S.hazardSym([4.6, 1.85, -26.45], [8.9, 1.85, -26.45], 1.0, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.boltsSym([4.6, 2.6, 22.6], [10.0, 2.6, 21.9], 7); S.boltsSym([19.6, 2.6, 15.6], [18.6, 2.6, 13.2], 4);
    S.put(cbx(0, -4.1, -10, 1.0, 0.8, 7, 0.2), 'trim'); S.put(bx(0, -4.9, -13.2, 0.5, 1.4, 0.5), 'dark');
  } else {
    S.bladeSym([21.4, 0.0, 12.4], [27.2, -0.2, 3.2], 2.4, 1.0);
    S.bladeSym([9.4, 0.4, -22.8], [13.6, 0.2, -31.4], 1.8, 0.8);
    S.surfChannel([[6.5, 21.2], [8.5, 20.6], [9.8, 19.0]], 0.2);
    S.channelSym([[2.2, 3.85, -9.6], [2.2, 3.85, -22.6]], 0.2);
  }
  return S;
}

// ---------------------------------------------------------------- S04: langer zweikieliger Rumpf mit offenem Mittelkanal (58 m)
function buildS4(F) {
  const S = new Ship(F, 4, 58, 1.15), E = F.key;
  const KX = 7.6; // Kielmitte
  for (const sx of [1, -1]) {
    // Kiel: gewölbte Oberseite, schmaler tiefer V-Unterbau
    S.mass(zs(sx * KX, 0, [
      [22.4, prof(1.6, 1.8, -1.2, { ct: 0.5, cb: 0.5 })], [18.5, prof(3.0, 2.8, -3.0, { ct: 0.42, cb: 0.62, dome: 0.9, keel: 1.4 })],
      [10, prof(3.2, 3.0, -3.6, { ct: 0.42, cb: 0.66, dome: 1.0, keel: 2.0 })], [-16, prof(3.2, 3.0, -3.6, { ct: 0.42, cb: 0.66, dome: 1.0, keel: 2.0 })],
      [-24.6, prof(3.0, 2.8, -2.8, { ct: 0.45, cb: 0.6, dome: 0.8, keel: 1.2 })],
    ]));
    // Rippen an den Innenwänden des Durchbruchs, Längsgurte
    const xi = sx * (KX - 3.2);
    for (let z = 8.4; z > -16; z -= 2.6) S.put(bx(xi - sx * 0.12, -0.2, z, 0.45, 5.0, 0.55), 'struct');
    S.put(cbx(xi - sx * 0.2, 1.6, -3.6, 0.5, 0.5, 24.6, 0.3), 'trim');
    S.put(cbx(xi - sx * 0.2, -1.8, -3.6, 0.5, 0.5, 24.6, 0.3), 'gun');
    // Außen: Seitenpanzer
    S.skirt(sx > 0 ? [[10.6, 17], [10.9, 8], [10.9, -16], [10.5, -23.5]] : [[-10.5, -23.5], [-10.9, -16], [-10.9, 8], [-10.6, 17]], -1.6, 2.2, { seg: 4.4, out: 0.3, t: 0.4 });
    // Waffenarme: massiv, nach vorn angewinkelt, nach hinten weiter außen
    for (const [z, tip] of [[14.2, 13.0], [3.4, 14.8], [-7.4, 16.6]]) {
      const p = [[sx * 10.2, 0.2, z - 1.6], [sx * (tip - 1.6), 0.5, z + 0.2], [sx * (tip + 1.4), 0.6, z + 1.0]];
      S.mass(sweep(p, [prof(1.9, 1.3, -1.5, { ct: 0.35, cb: 0.45 }), prof(1.7, 1.5, -1.3, { ct: 0.35, cb: 0.45 }), prof(1.4, 1.2, -1.0, { ct: 0.4, cb: 0.45 })]), 'shell');
      S.put(sweep(p.slice(0, 2).map(([x, y, zz]) => [x, y - 1.7, zz]), [prof(0.5, 0.3, -0.3), prof(0.5, 0.3, -0.3)]), 'gun');
      S.deck(rect(sx * tip - 2.4, z - 2.6, sx * tip + 2.4, z + 2.6), -1.6, 1.8, { c: 'shell', cb: 0.6, ct: 0.3 });
    }
  }
  // vordere Kommandobrücke (höher als die Kiele) und kurze geschlossene Nase
  S.deck(symO([[0, 22.6], [6, 21.8], [10.4, 18.4], [10.8, 9.6], [0, 9.6]]), -2.2, 2.4, { cb: 0.8, ct: 0.3 });
  S.mass(zs(0, 0, [[22.8, prof(3.4, 3.8, 1.4, { ct: 0.5 })], [19, prof(4.6, 6.0, 1.0, { ct: 0.42, dome: 0.4 })], [11.5, prof(4.6, 6.3, 1.0, { ct: 0.42, dome: 0.4 })], [8.4, prof(3.6, 4.6, 1.2, { ct: 0.5 })]]));
  S.canopy(21.8, 16.4, 2.4, 5.0, 6.7);
  S.mass(zs(0, 0, [[21, prof(4.4, 2.6, -2.4, { ct: 0.4 })], [25.6, prof(3.2, 2.2, -2.0, { ct: 0.45 })], [28.6, prof(1.7, 1.2, -1.0, { ct: 0.5 })], [29.6, prof(0.6, 0.5, -0.3)]]));
  S.deck(symO([[0, 27.6], [2.6, 26.8], [3.2, 20.6], [0, 20.2]]), -3.6, -1.6, { c: 'struct', cb: 0.4, ct: 0.1 }); // Kinngehäuse
  S.antenna(0, 6.4, 12.6, 2.4, 0.07);
  // hintere Antriebsbrücke (noch höher) mit Rückenstufe
  S.deck(symO([[0, -15.6], [11.4, -15.6], [12.0, -24.4], [10.4, -28.4], [0, -28.4]]), -3.0, 3.0, { cb: 0.9, ct: 0.3 });
  S.mass(zs(0, 0, [[-15.0, prof(6.6, 5.2, 2.2, { ct: 0.5 })], [-18.5, prof(8.0, 7.4, 1.8, { ct: 0.4, dome: 0.4 })], [-26, prof(8.0, 7.8, 1.8, { ct: 0.4, dome: 0.4 })], [-29.2, prof(6.8, 6.6, 2.2, { ct: 0.45 })]]));
  S.deck(symO([[0, -18.4], [3.6, -19.2], [4.0, -27.6], [0, -27.6]]), 7.4, 9.4, { c: 'paint', cb: 0.3, ct: 0.4 });
  S.skirtSym([[11.6, -16.4], [12.1, -24.4], [10.6, -28.2]], -2.2, 2.6, { seg: 4, out: 0.3, t: 0.4 });
  S.deck(symO([[0, -27.8], [11, -27.8], [10.2, -29.4], [0, -29.4]]), -2.4, 6.2, { c: 'shell', cb: 0.45, ct: 0.45 });
  S.nozzle(0, 0.6, -28.8, 2.3, 3.4); S.nozzlePair(4.6, 0.6, -28.8, 2.0, 3.2); S.nozzlePair(8.8, 0.2, -28.6, 1.7, 2.8);
  S.nozzlePair(2.4, 4.6, -28.8, 1.0, 1.6, { collar: false, cowl: false, segs: 8 });
  S.antenna(1.6, 9.4, -21, 3.6); S.antenna(-1.6, 9.4, -23, 2.4);
  // Montage: drei Laserpaare an den Armköpfen, Kinnlaser; drei Generatorpaare als Wannen auf den Kielrücken
  for (const [z, tip] of [[14.2, 13.0], [3.4, 14.8], [-7.4, 16.6]]) S.laserSym(tip, z);
  S.laser(0, 24.0, { hang: true });
  S.genBaySym([[KX, 2.4], [KX, -0.9], [KX, -4.2]]);
  S.insignia(KX, 13.4, 3.2);
  // Panzerplatten
  S.armor([[5.0, 21], [10.2, 21], [10.2, -24.4], [5.0, -24.4]], { sym: true, jump: 0.7, px: 3.0, pz: 3.0, t: 0.38, panel: 0.25, layer: 0.2, maxDH: 1.3, L: 1.5 });
  S.armor(symO([[0, 22.6], [6, 21.8], [10.4, 18.4], [10.8, 9.6], [0, 9.6]]), { sym: true, px: 2.6, pz: 2.4, t: 0.3, panel: 0.2 });
  S.armor(symO([[0, -15.6], [11.4, -15.6], [12.0, -24.4], [10.4, -28.0], [0, -28.0]]), { sym: true, px: 3.0, pz: 2.8, t: 0.34, panel: 0.25, maxDH: 1.2 });
  S.armor([[4.4, 18], [10.8, 18], [10.8, -22], [4.4, -22]], { sym: true, under: true, c: 'under', px: 2.4, pz: 3.0, t: 0.26, panel: 0.2, maxDH: 1.4, L: 1.2 });
  S.armor(symO([[0, 22.4], [6, 21.6], [10.2, 18.2], [10.6, 9.8], [0, 9.8]]), { sym: true, under: true, c: 'under', px: 3.0, pz: 3.0, t: 0.3, panel: 0.3 });
  S.armor(symO([[0, -15.8], [11.2, -15.8], [11.8, -24.2], [10.2, -28.2], [0, -28.2]]), { sym: true, under: true, c: 'under', px: 3.2, pz: 3.0, t: 0.3, panel: 0.3 });
  for (const sx of [1, -1]) { S.light(sx * 1.2, 0.8, 29.0, 0.3); S.light(sx * 11.1, 2.4, 17.2); S.light(sx * 12.3, 3.4, -24.4); }
  S.hp.drone = [0, 11, 0]; S.hp.ground = [0, -5.6, 0];
  if (E === 'europa') {
    S.stripSym([[3.5, 3.5, 22.4], [6, 3.0, 21.8], [10.4, 2.6, 18.4]], 0.3, 0.1, 'trim');
    S.channelSym([[4.0, 6.7, -19], [4.0, 6.4, -28]], 0.22);
    S.stripSym([[KX - 3.3, 3.2, 18], [KX - 3.3, 3.2, -22]], 0.22, 0.1, 'trim');
  } else if (E === 'saturn') {
    S.hazardSym([4.6, 2.2, 10.0], [4.6, 2.2, -16.0], 0.6, { side: [-1, 0, 0] });
    S.hazard([-10.2, 6.25, -29.42], [10.2, 6.25, -29.42], 1.2, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.put(cbx(5.5, 9.0, -22, 0.7, 0.7, 7, 0.2), 'trim'); S.put(bx(5.5, 8.4, -25.4, 0.9, 1.2, 0.9), 'dark');
  } else {
    S.bladeSym([10.6, 0.6, -21.6], [15.4, 0.6, -32.0], 2.0, 0.9);
    S.bladeSym([16.6, 0.6, -9.6], [19.8, 0.6, -16.4], 1.4, 0.7);
    S.channelSym([[4.2, 1.0, 9.2], [4.2, 1.0, -16.2]], 0.26);
  }
  return S;
}

// ---------------------------------------------------------------- S05: breiter zurückgepfeilter Bogen (68 m)
function buildS5(F) {
  const S = new Ship(F, 5, 68, 1.3), E = F.key;
  // breiterer zentraler Kern mit Kiel
  S.mass(zs(0, 0, [
    [-19.6, prof(5.6, 3.0, -2.6, { ct: 0.45 })], [-11, prof(7.2, 4.4, -3.4, { ct: 0.4, dome: 0.6 })], [4, prof(7.4, 4.8, -3.6, { ct: 0.4, dome: 0.7, keel: 0.6 })],
    [16, prof(6.2, 4.3, -3.0, { ct: 0.42, dome: 0.5 })], [26, prof(4.2, 3.0, -2.2, { ct: 0.45 })], [32, prof(2.2, 1.6, -1.2, { ct: 0.5 })], [34.2, prof(0.7, 0.5, -0.3)],
  ]));
  // gepanzertes Cockpitgehäuse: Seitenwände, Braue, Rückenschild
  for (const sx of [1, -1]) S.deck([[sx * 2.6, 26.2], [sx * 3.8, 25.6], [sx * 4.4, 16.8], [sx * 3.2, 15.4], [sx * 2.6, 15.4]], 2.6, 6.2, { c: 'paint', levels: [[2.6, 0], [5.6, 0], [6.2, 0.35]] });
  S.deck(rect(-3.4, 25.4, 3.4, 26.9), 3.0, 5.4, { c: 'paint', cb: 0.2, ct: 0.4 });
  S.deck(symO([[0, 15.8], [3.0, 15.8], [3.4, 12.4], [0, 11.6]]), 3.6, 6.0, { c: 'paint', cb: 0.2, ct: 0.5 });
  S.canopy(24.6, 17.2, 2.2, 4.0, 5.5);
  // Außenbogen (+x gebaut, gespiegelt): Tragflächenquerschnitt, dicke Wurzel mit Schulterbuckel, nach außen schlank
  const arc = [[5.8, 0.4, 16.8], [12, 0.4, 19.4], [19.5, 0.3, 15.4], [26.5, 0.2, 5.8], [31.5, 0.1, -8.2], [34.2, 0.0, -20.6], [35.2, 0.0, -26.0]];
  const chord = [16, 13.6, 10.6, 8.6, 7.2, 6.6, 6.4], yt = [4.6, 3.8, 2.8, 2.0, 1.6, 1.5, 1.5], yb = [-3.4, -2.8, -1.9, -1.3, -1.0, -1.0, -1.0];
  S.massSym(sweep(arc, (i) => foil(chord[i], yt[i], yb[i])), 'shell');
  S.massSym(sweep(arc.slice(0, 4), (i) => prof(chord[i] * 0.2, yt[i] + [1.8, 1.2, 0.5, 0.05][i], yt[i] - 0.8, { ct: 0.45, cb: 0.1 }).map(([u, v]) => [u + chord[i] * 0.16, v])), 'paint');
  // Lastträger unter der Wurzel
  for (const sx of [1, -1]) {
    S.put(sweep([[sx * 3, -3.0, 12], [sx * 12, -2.7, 14.6], [sx * 20, -2.0, 11]], () => [[0.55, 0.45], [-0.55, 0.45], [-0.55, -0.45], [0.55, -0.45]]), 'gun');
    S.put(sweep([[sx * 3, -2.8, 5], [sx * 14, -2.2, 7.6], [sx * 25, -1.4, 0.4]], () => [[0.45, 0.4], [-0.45, 0.4], [-0.45, -0.4], [0.45, -0.4]]), 'gun');
  }
  // Antriebsgondeln an den Bogenenden: Einlass vorn, zwei Schubkammern hinten
  for (const sx of [1, -1]) {
    S.mass(zs(sx * 35.6, 0.1, [[-16.4, prof(2.0, 1.6, -1.6, { ct: 0.45, cb: 0.45 })], [-19.6, prof(3.4, 2.5, -2.4, { ct: 0.4, cb: 0.4 })], [-31.4, prof(3.4, 2.5, -2.4, { ct: 0.4, cb: 0.4 })], [-33.8, prof(3.0, 2.2, -2.1, { ct: 0.45, cb: 0.45 })]]), 'shell');
    const lip = lathe([[1.0, 0], [1.6, 0], [1.75, 0.9], [1.3, 1.3], [1.0, 0.9], [1.0, 0]], 12, 'z', false); lip.translate(sx * 35.6, 0.2, -18.6);
    S.put(lip, 'trim'); S.put(cy(sx * 35.6, 0.2, -18.2, 1.05, 0.4, 'z', 12), 'dark'); S.put(cbx(sx * 35.6, 0.2, -17.6, 0.25, 2.0, 1.4, 0.2), 'gun');
    S.ribs([sx * 39.1, 0.0, -21], [sx * 39.1, 0.0, -31], 6, 0.4, 3.0, 0.5, 'struct');
  }
  S.nozzlePair(34.0, 0.1, -33.6, 1.5, 2.6); S.nozzlePair(37.2, 0.1, -33.6, 1.5, 2.6);
  S.deck(symO([[0, -18.8], [5.0, -18.8], [5.0, -20.2], [0, -20.2]]), -2.4, 2.6, { c: 'shell', cb: 0.45, ct: 0.45 });
  S.nozzlePair(2.6, 0.2, -19.6, 1.9, 2.8);
  // Montage: vier Laserzonen (innerer Vorbug → Außenbogen), vier Generatorpaare auf Plattformen mit Wartungsraum
  for (const sx of [1, -1]) S.mass(zs(sx * 6.6, 0, [[21.0, prof(1.4, 1.0, -1.6, { ct: 0.4 })], [23.6, prof(2.0, 1.4, -1.8, { ct: 0.4 })], [29.0, prof(2.0, 1.4, -1.8, { ct: 0.4 })], [31.0, prof(1.2, 0.9, -1.2, { ct: 0.4 })]]), 'struct');
  S.laserSym(6.6, 26.0);
  S.laserSym(13.6, 22.2);
  S.laserSym(22.2, 13.4);
  S.laserSym(29.2, 0.6);
  S.genBaySym([[3.6, 6.4], [3.6, 3.1]]);
  S.genBaySym([[12.2, 15.4], [15.5, 15.4]]);
  S.insignia(21.4, 7.8, 3.0);
  // Panzerplatten
  S.armor(symO([[0, 15.2], [5.4, 15.2], [6.6, 8], [6.6, -12], [5.2, -19], [0, -19]]), { sym: true, px: 3.0, pz: 3.0, t: 0.34, panel: 0.25, layer: 0.2, maxDH: 1.2 });
  const p2 = arc.map(([x, , z]) => [x, z]);
  S.armorAlong(p2, chord.map((c) => c * 0.48), chord.map((c) => c * 0.48), { clip: rect(7.6, -1e4, 1e4, 1e4), px: 3.8, pz: 3.2, t: 0.32, panel: 0.2, layer: 0.15, L: 1.8 });
  S.armorAlong(p2.map(([x, z]) => [-x, z]), chord.map((c) => c * 0.48), chord.map((c) => c * 0.48), { clip: rect(-1e4, -1e4, -7.6, 1e4), px: 3.8, pz: 3.2, t: 0.32, panel: 0.2, layer: 0.15, L: 1.8 });
  S.armorAlong(p2, chord.map((c) => c * 0.4), chord.map((c) => c * 0.4), { clip: rect(7.6, -1e4, 1e4, 1e4), under: true, c: 'under', px: 5.2, pz: 4.6, t: 0.26, panel: 0.25, L: 2.4 });
  S.armorAlong(p2.map(([x, z]) => [-x, z]), chord.map((c) => c * 0.4), chord.map((c) => c * 0.4), { clip: rect(-1e4, -1e4, -7.6, 1e4), under: true, c: 'under', px: 5.2, pz: 4.6, t: 0.26, panel: 0.25, L: 2.4 });
  S.armor(symO([[0, 24], [5, 22], [6.6, 8], [6.0, -12], [4.4, -19], [0, -19]]), { sym: true, under: true, c: 'under', px: 3.8, pz: 3.6, t: 0.3, panel: 0.3, maxDH: 1.4 });
  for (const sx of [1, -1]) S.armor([[sx * 32.4, -20], [sx * 38.8, -20], [sx * 38.8, -33], [sx * 32.4, -33]], { px: 3.2, pz: 3.2, t: 0.3, panel: 0.2, maxDH: 1.4, L: 1.4 });
  S.antenna(0, 6.0, 13.0, 2.8); S.antenna(1.3, 4.4, -15.2, 3.6); S.antenna(-1.3, 4.4, -16.2, 2.4);
  for (const sx of [1, -1]) { S.light(sx * 1.0, 0.9, 33.6, 0.3); S.light(sx * 39.2, 2.6, -27); S.light(sx * 27.6, 2.2, 6.6); }
  S.hp.drone = [0, 11, 0]; S.hp.ground = [0, -5.0, 0];
  const lead = (sx, k) => arc.slice(0, 6).map(([x, y, z], i) => { const nx = arc[Math.min(i + 1, 6)], pv = arc[Math.max(i - 1, 0)]; const tx = nx[0] - pv[0], tz = nx[2] - pv[2], l = Math.hypot(tx, tz); return [sx * (x - (tz / l) * chord[i] * k), y + yt[i] * 0.2, z + (tx / l) * chord[i] * k]; });
  if (E === 'europa') {
    S.strip(lead(1, 0.47).slice(1), 0.36, 0.14, 'trim'); S.strip(lead(-1, 0.47).slice(1), 0.36, 0.14, 'trim');
    S.channelSym([[1.6, 5.3, 10.4], [1.6, 5.4, -4], [1.6, 4.6, -12]], 0.22);
  } else if (E === 'saturn') {
    S.hazardSym([32.4, 2.6, -33.9], [38.8, 2.6, -33.9], 1.0, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.hazardSym([2.8, 6.2, 26.6], [3.6, 6.2, 16.0], 0.5, { side: [1, 0, 0] });
    S.put(cbx(0, -4.8, -6, 1.1, 0.9, 6, 0.2), 'trim'); S.put(bx(0, -5.6, -8.8, 0.5, 1.3, 0.5), 'dark');
  } else {
    S.bladeSym([38.8, 0.2, -27.6], [44.0, 0.2, -38.6], 2.4, 1.0);
    S.bladeSym([27.6, 0.4, -2.0], [31.6, 0.3, -10.6], 1.6, 0.8);
    S.channelSym([[1.7, 5.3, 10.4], [1.7, 5.4, -4], [1.7, 4.6, -12]], 0.22);
  }
  return S;
}

// ---------------------------------------------------------------- S06: vertikal gestaffeltes Kreuzschiff (78 m)
function buildS6(F) {
  const S = new Ship(F, 6, 78, 1.45), E = F.key;
  // schmaler geschlossener Vorbau
  S.mass(zs(0, 0, [
    [9, prof(5.2, 3.6, -3.0, { ct: 0.4 })], [22, prof(4.4, 3.4, -2.6, { ct: 0.42, dome: 0.5 })], [32, prof(3.2, 2.6, -1.9, { ct: 0.45 })],
    [37.4, prof(1.8, 1.4, -1.1, { ct: 0.5 })], [39.2, prof(0.6, 0.5, -0.4)],
  ]));
  S.skirtSym([[4.9, 12], [4.4, 22], [3.4, 31]], -1.8, 2.4, { seg: 3.6, out: 0.3, t: 0.35 });
  S.canopy(31.2, 24.4, 2.3, 3.4, 4.85);
  S.put(cbx(0, 4.9, 31.8, 3.0, 0.4, 0.9, 0.3), 'trim');
  // breite tiefe Funktionszone
  S.deck(symO([[0, 13.4], [6.4, 13.4], [9.8, 9.4], [9.8, -9.4], [6.4, -12.8], [0, -12.8]]), -4.8, 3.6, { cb: 1.2, ct: 0.4 });
  // Querträger: Oberseite steigt zur Rückenbrücke an
  const armP = [[8, 0.6, 1.2], [17, 0.3, 1.2], [25, 0.1, 1.2]];
  S.massSym(sweep(armP, [prof(7.0, 6.2, -1.2, { ct: 0.3, cb: 0.1 }), prof(6.4, 4.4, -1.0, { ct: 0.3, cb: 0.1 }), prof(5.8, 2.8, -0.9, { ct: 0.35, cb: 0.1 })]), 'shell');
  S.massSym(sweep(armP, [prof(6.6, -1.0, -3.0, { cb: 0.4 }), prof(5.8, -0.9, -2.8, { cb: 0.4 }), prof(5.2, -0.8, -2.6, { cb: 0.4 })]), 'shell');
  // Armköpfe: oben Geschützblock (kantig), darunter Sensorgondel (rund) – unterschiedliche Querschnitte
  for (const sx of [1, -1]) {
    S.deck(rect(sx * 24.6, -6.6, sx * 31.6, 9.6), -1.4, 4.4, { c: 'shell', cb: 0.8, ct: 0.5 });
    const pod = lathe([[0, 0], [1.2, 0.6], [2.3, 2.6], [2.5, 6], [2.4, 10], [1.8, 12.6], [0.7, 14], [0, 14.2]], 10, 'z'); pod.translate(sx * 28.2, -3.6, -6.4);
    S.mass(pod, 'paint2');
    S.put(cbx(sx * 28.2, -3.6, 7.4, 1.2, 1.0, 0.8, 0.3), 'dark'); S.add('glow', bx(sx * 28.2, -3.6, 7.8, 0.6, 0.3, 0.12));
    for (const a of [0.6, -0.6]) S.put(bx(sx * (28.2 + Math.sin(a) * 2.4), -3.6 - Math.cos(a) * 2.4, -4.2, 0.2, 1.4, 3.0, 0, 0, a * sx), 'gun');
    S.put(cbx(sx * 28.2, -1.6, 1.2, 1.6, 1.6, 6, 0.3), 'gun');
    // strukturierte Seitenflächen des Geschützblocks
    for (let i = 0; i < 6; i++) S.put(bx(sx * 31.8, 1.6, -5.4 + i * 2.6, 0.5, 4.6, 0.6), 'gun');
    S.vent(sx * 31.85, 1.4, 1.6, 2.0, 4.2, 5, Math.PI / 2);
    S.ribs([sx * 11.5, 5.3, -4.8], [sx * 22.5, 2.9, -4.8], 6, 0.5, 0.3, 1.6, 'struct');
  }
  // Rückenbrücke
  S.mass(zs(0, 0, [[12.6, prof(2.2, 5.0, 3.0, { ct: 0.5 })], [8, prof(3.0, 7.0, 3.0, { ct: 0.45, dome: 0.3 })], [-12, prof(3.0, 7.4, 3.0, { ct: 0.45, dome: 0.3 })], [-17, prof(3.0, 8.0, 3.0, { ct: 0.45 })]]));
  S.pipeSym([[3.1, 4.2, 10], [3.1, 4.6, -14]], 0.3, 'trim');
  // hoher dreistufiger Antriebsturm
  S.deck(symO([[0, -9.4], [7.2, -10], [7.8, -16], [7.8, -38.6], [0, -38.6]]), -4.4, 7.0, { cb: 1.0, ct: 0.4 });
  S.deck(symO([[0, -15.6], [5.8, -16.6], [6.2, -20], [6.2, -37.8], [0, -37.8]]), 6.6, 12.4, { c: 'shell', cb: 0.3, ct: 0.45 });
  S.deck(symO([[0, -24.0], [3.6, -24.8], [4.0, -27.2], [4.0, -36.8], [0, -36.8]]), 12.0, 17.6, { c: 'paint', cb: 0.3, ct: 0.5 });
  S.skirtSym([[7.8, -11.6], [7.8, -38.0]], -2.6, 1.8, { seg: 2.9, out: 0.35, t: 0.45 });
  S.skirtSym([[7.8, -11.6], [7.8, -38.0]], 2.2, 6.4, { seg: 3.3, out: 0.6, t: 0.5 });
  S.skirtSym([[6.2, -17.2], [6.2, -37.4]], 7.0, 11.8, { seg: 2.8, out: 0.3, t: 0.4 });
  S.skirtSym([[4.0, -25.0], [4.0, -36.4]], 12.4, 16.8, { seg: 2.4, out: 0.3, t: 0.35 });
  S.deck(symO([[0, -37.8], [7.0, -37.8], [6.6, -39.2], [0, -39.2]]), -3.2, 16.4, { c: 'shell', cb: 0.45, ct: 0.45 });
  S.nozzlePair(3.6, -0.8, -38.8, 2.6, 3.6); S.nozzlePair(3.0, 4.6, -38.8, 2.0, 3.0); S.nozzlePair(2.4, 9.6, -38.6, 1.5, 2.4); S.nozzle(0, 14.6, -38.4, 1.2, 2.0, { segs: 10 });
  S.nozzlePair(6.8, -0.6, -38.2, 1.0, 1.6, { collar: false, cowl: false, segs: 8 });
  S.antenna(1.5, 17.6, -30, 4.2); S.antenna(-1.4, 17.6, -33, 2.8); S.antenna(0, 4.4, 30, 1.6, 0.06);
  // Montage
  for (const sx of [1, -1]) S.mass(zs(sx * 5.4, -0.2, [[25.4, prof(1.4, 1.2, -1.6, { ct: 0.4 })], [27.6, prof(2.1, 1.6, -1.8, { ct: 0.4 })], [32.4, prof(2.1, 1.6, -1.8, { ct: 0.4 })], [34, prof(1.2, 1.0, -1.2, { ct: 0.4 })]]), 'struct');
  S.laserSym(5.4, 30.4);
  S.laserSym(8.0, 10.8);
  S.laserSym(15.0, 5.6);
  S.laserBankSym([[28.1, 4.4]]);
  S.laserSym(18.6, 2.6, { hang: true });
  S.genBaySym([[5.4, 4.6], [5.4, 1.3]]);
  S.genBaySym([[13.4, -2.6], [16.7, -2.6]]);
  S.genBay([[0, -20.2]]);
  S.insignia(28.1, -3.0, 3.2);
  // Panzerplatten
  S.armor(symO([[0, 31], [3.2, 31], [4.4, 22], [5.0, 13.4], [0, 13.4]]), { sym: true, px: 2.4, pz: 2.6, t: 0.3, panel: 0.15, maxDH: 1.2, L: 1.4 });
  S.armor(symO([[0, 13.4], [6.4, 13.4], [9.8, 9.4], [9.8, -9.4], [6.4, -12.8], [0, -12.8]]), { sym: true, px: 2.2, pz: 2.2, t: 0.34, panel: 0.25, maxDH: 1.0 });
  S.armor([[9.6, 8.0], [24.4, 6.4], [24.4, -4.0], [9.6, -5.4]], { sym: true, px: 2.3, pz: 2.2, t: 0.32, panel: 0.25, layer: 0.2, maxDH: 1.4, L: 1.5 });
  S.armor(rect(24.8, -6.4, 31.4, 9.4), { sym: true, px: 2.2, pz: 2.4, t: 0.3, panel: 0.2, maxDH: 0.6 });
  S.armor(symO([[0, -9.4], [7.2, -10], [7.8, -16], [7.8, -38.6], [0, -38.6]]), { sym: true, px: 2.4, pz: 2.8, t: 0.34, panel: 0.25, maxDH: 0.8 });
  S.armor(symO([[0, -15.6], [5.8, -16.6], [6.2, -20], [6.2, -37.8], [0, -37.8]]), { sym: true, px: 2.4, pz: 2.6, t: 0.3, panel: 0.2, maxDH: 0.8 });
  S.armor(symO([[0, 30], [4, 22], [5.2, 9], [9.8, 9], [9.8, -9], [7.6, -12], [7.6, -38], [0, -38]]), { sym: true, under: true, c: 'under', px: 3.2, pz: 3.0, t: 0.3, panel: 0.3, maxDH: 1.4 });
  S.armor([[9.6, 7.6], [24.4, 6.2], [24.4, -3.8], [9.6, -5.0]], { sym: true, under: true, c: 'under', px: 3.0, pz: 3.0, t: 0.28, panel: 0.3, maxDH: 1.4 });
  for (const sx of [1, -1]) { S.light(sx * 1.0, 0.8, 38.6, 0.3); S.light(sx * 31.8, 4.6, 9.8); S.light(sx * 7.9, 6.0, -37.6); }
  S.hp.drone = [0, 20, 0]; S.hp.ground = [0, -6.4, 0];
  if (E === 'europa') {
    S.stripSym([[9.9, 3.7, 9], [9.9, 3.7, -9]], 0.28, 0.1, 'trim');
    S.stripSym([[24.6, 4.5, 9.7], [31.6, 4.5, 9.7]], 0.3, 0.1, 'trim');
    S.channelSym([[2.8, 7.3, 6], [2.8, 7.6, -11]], 0.2);
    S.stripSym([[6.3, 12.5, -17], [6.3, 12.5, -37.6]], 0.24, 0.1, 'trim');
  } else if (E === 'saturn') {
    S.hazardSym([24.8, 4.45, 9.7], [31.4, 4.45, 9.7], 0.8, { side: [0, 0, -1] });
    S.hazardSym([0.4, 16.0, -39.25], [6.6, 16.0, -39.25], 1.0, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.put(bx(0, 8.8, -6, 1.6, 1.6, 1.6), 'struct'); S.put(cbx(0, 9.8, -0.5, 0.8, 0.8, 11, 0.2), 'trim'); S.put(bx(0, 8.9, 4.8, 0.5, 1.6, 0.5), 'dark');
  } else {
    S.bladeSym([31.6, 1.2, -6.4], [35.6, 1.2, -16.4], 2.0, 0.9);
    S.bladeSym([7.8, 3.0, -37.0], [11.4, 3.0, -45.0], 1.8, 0.8);
    S.bladeSym([6.2, 9.4, -36.0], [8.6, 9.4, -42.6], 1.2, 0.6);
    S.channelSym([[2.8, 7.3, 6], [2.8, 7.6, -11]], 0.22);
    S.channelSym([[4.2, 17.6, -25], [4.2, 17.6, -36]], 0.2);
  }
  return S;
}

// ---------------------------------------------------------------- S07: Vorwärtsflügel und schmaler langer Schwanz (90 m)
function buildS7(F) {
  const S = new Ship(F, 7, 90, 1.6), E = F.key;
  S.mass(zs(0, 0, [
    [-17, prof(5.4, 3.8, -3.2, { ct: 0.42 })], [-7, prof(7.4, 5.0, -4.0, { ct: 0.38, dome: 0.6 })], [8, prof(7.4, 5.2, -4.0, { ct: 0.38, dome: 0.6, keel: 0.6 })],
    [18, prof(5.6, 4.2, -3.2, { ct: 0.42, dome: 0.3 })], [26, prof(3.8, 3.0, -2.4, { ct: 0.45 })], [31.5, prof(2.0, 1.6, -1.3, { ct: 0.5 })], [33.6, prof(0.6, 0.5, -0.4)],
  ]));
  S.canopy(23.2, 15.8, 2.5, 4.4, 5.95);
  S.put(cbx(0, 5.7, 24.2, 3.6, 0.45, 1.0, 0.3), 'trim');
  // Vorwärtsflügel aus hinten liegender Schulterwurzel: dicke Wurzel mit Schulterbuckel
  const wing = [[6, 0.4, -9.4], [13.5, 0.6, 2], [23.5, 0.8, 18], [31.5, 1.0, 32], [35.4, 1.1, 41.6]];
  const ch = [17, 14, 10.5, 8, 6.2], wt = [5.0, 3.6, 2.4, 1.7, 1.4], wb = [-3.6, -2.5, -1.6, -1.1, -0.9];
  S.massSym(sweep(wing, (i) => foil(ch[i], wt[i], wb[i])), 'shell');
  S.massSym(sweep(wing.slice(0, 3), (i) => prof(ch[i] * 0.2, wt[i] + [1.8, 1.0, 0.1][i], wt[i] - 0.8, { ct: 0.45, cb: 0.1 }).map(([u, v]) => [u + ch[i] * 0.14, v])), 'paint');
  for (const sx of [1, -1]) {
    // Flügelspitzen-Gondel
    S.mass(zs(sx * 35.6, 1.0, [[35.6, prof(1.4, 1.2, -1.2, { ct: 0.4, cb: 0.4 })], [38.6, prof(2.0, 1.6, -1.5, { ct: 0.4, cb: 0.4 })], [44, prof(2.0, 1.6, -1.5, { ct: 0.4, cb: 0.4 })], [46.6, prof(0.9, 0.8, -0.7)]]), 'shell');
    // sichtbare Lastträger unter dem Flügel mit Spanten
    const b1 = [[sx * 4, -3.6, -5], [sx * 13.5, -2.8, 3.2], [sx * 23.5, -1.8, 18.2], [sx * 30.4, -1.2, 29.8]];
    const b2 = [[sx * 6, -3.4, -11], [sx * 16, -2.6, -2.4], [sx * 26, -1.6, 12.6]];
    S.put(sweep(b1, () => [[0.7, 0.55], [-0.7, 0.55], [-0.7, -0.55], [0.7, -0.55]]), 'gun');
    S.put(sweep(b2, () => [[0.6, 0.5], [-0.6, 0.5], [-0.6, -0.5], [0.6, -0.5]]), 'gun');
    for (let i = 1; i < 6; i++) { const t = i / 6, p = [lerp(b1[0][0], b1[3][0], t), lerp(-3.4, -1.2, t), lerp(b1[0][2], b1[3][2], t)]; S.put(bx(p[0], p[1] + 0.4, p[2] - 2.6, 0.5, 0.9, 6.0, 0, sx * 0.5, 0), 'struct'); }
    // Triebwerksgondel an der Flügelwurzel
    S.mass(zs(sx * 9.8, 0, [[-1, prof(2.4, 2.2, -2.2, { ct: 0.4, cb: 0.4 })], [-8, prof(3.0, 2.8, -2.8, { ct: 0.4, cb: 0.4 })], [-15.6, prof(3.0, 2.8, -2.8, { ct: 0.4, cb: 0.4 })]]), 'shell');
    S.deck([[sx * 6.8, -15.2], [sx * 12.8, -15.2], [sx * 12.8, -16.4], [sx * 6.8, -16.4]], -2.6, 2.6, { c: 'shell', cb: 0.45, ct: 0.45 });
  }
  S.nozzlePair(9.8, 0, -16.0, 2.6, 3.6);
  // feiner langer Heckausleger mit Spantringen und starkem Endtriebwerk
  S.mass(zs(0, 0, [[-15, prof(3.2, 3.0, -2.4, { ct: 0.45 })], [-22, prof(1.8, 1.9, -1.4, { ct: 0.45 })], [-37, prof(1.5, 1.7, -1.2, { ct: 0.45 })], [-40, prof(2.8, 2.6, -2.2, { ct: 0.4 })], [-45, prof(3.0, 2.8, -2.4, { ct: 0.4 })]]));
  for (let z = -21; z > -38; z -= 2.2) S.put(zs(0, 0, [[z, prof(1.9, 2.15, -1.6, { ct: 0.45 })], [z - 0.5, prof(1.9, 2.15, -1.6, { ct: 0.45 })]]), 'struct');
  S.put(cbx(0, 2.0, -29, 0.7, 0.4, 16, 0.3), 'trim');
  S.pipeSym([[1.5, 0.2, -20], [1.4, 0.2, -38]], 0.18, 'gun');
  S.nozzle(0, 0.2, -45, 2.7, 3.4); S.nozzlePair(3.4, 0.2, -44.6, 0.9, 1.6, { collar: false, cowl: false, segs: 8 });
  S.nozzlePair(4.4, -0.6, -16.8, 1.1, 1.8, { collar: false, cowl: false, segs: 8 });
  const fin = (k, t) => [[t, 2.8 * k], [t * 0.5, 3.0 * k], [-t * 0.5, 3.0 * k], [-t, 2.8 * k], [-t, -2.6 * k], [t, -2.6 * k]];
  S.put(sweep([[0, 2.4, -36.4], [0, 5.4, -40.6], [0, 8.2, -44.4]], [fin(1, 0.8), fin(0.75, 0.55), fin(0.42, 0.3)], { side: [1, 0, 0] }), 'paint');
  S.put(cbx(0, 3.2, -38.6, 1.4, 1.6, 5.4, 0.35), 'struct');
  for (const sx of [1, -1]) {
    S.deck([[sx * 2.0, -36.0], [sx * 7.6, -41.6], [sx * 8.4, -44.6], [sx * 5.6, -45.0], [sx * 2.0, -42.0]], -0.3, 1.0, { c: 'paint', cb: 0.35, ct: 0.3 });
    S.ribs([sx * 3.2, 1.05, -38.6], [sx * 6.4, 1.05, -42.6], 4, 0.3, 0.2, 1.6, 'struct');
  }
  S.antenna(1.6, 5.2, -10, 3.8); S.antenna(-1.6, 5.2, -11.5, 2.6);
  // Montage
  for (const sx of [1, -1]) S.mass(zs(sx * 6.9, 0, [[15.6, prof(1.6, 1.2, -1.8, { ct: 0.4 })], [18, prof(2.2, 1.6, -2.0, { ct: 0.4 })], [23, prof(2.2, 1.6, -2.0, { ct: 0.4 })], [25, prof(1.4, 1.0, -1.4, { ct: 0.4 })]]), 'struct');
  S.laserSym(6.9, 20.0);
  S.laserSym(11.2, 8.8);
  S.laserSym(20.0, 19.0);
  S.laserSym(28.4, 31.6);
  S.laserSym(4.6, 10.8, { hang: true });
  S.laser(0, 26.4, { hang: true });
  S.genBaySym([[3.7, 6.6], [3.7, 3.3]]);
  S.genBaySym([[12.6, -1.0], [12.6, -4.3]]);
  S.genBaySym([[20.6, 12.8]]);
  S.genBay([[0, -14.0]]);
  S.insignia(27.0, 25.6, 2.8);
  // Panzerplatten
  S.armor(symO([[0, 15.4], [5.4, 15.4], [7.0, 6], [7.0, -10], [5.0, -17], [0, -17]]), { sym: true, px: 2.4, pz: 2.6, t: 0.34, panel: 0.25, maxDH: 1.2, L: 1.4 });
  const w2 = wing.map(([x, , z]) => [x, z]);
  for (const sx of [1, -1]) {
    const pth = w2.map(([x, z]) => [sx * x, z]);
    const clip = sx > 0 ? rect(7.6, -1e4, 1e4, 1e4) : rect(-1e4, -1e4, -7.6, 1e4);
    S.armorAlong(pth, ch.map((c) => c * 0.48), ch.map((c) => c * 0.48), { clip, px: 3.0, pz: 2.6, t: 0.32, panel: 0.2, layer: 0.15, maxDH: 1.0, L: 1.4 });
    S.armorAlong(pth, ch.map((c) => c * 0.42), ch.map((c) => c * 0.42), { clip, under: true, c: 'under', px: 3.4, pz: 3.0, t: 0.24, panel: 0.25, maxDH: 1.2, L: 1.6 });
  }
  S.armor(symO([[0, -15], [3.0, -15], [1.8, -22], [1.6, -37], [2.8, -40], [2.8, -45], [0, -45]]), { sym: true, px: 1.8, pz: 2.0, t: 0.2, maxDH: 1.0, L: 1.2 });
  S.armor(symO([[0, 24], [4.6, 20], [7.2, 6], [7.0, -10], [5.0, -17], [0, -17]]), { sym: true, under: true, c: 'under', px: 3.0, pz: 3.0, t: 0.3, panel: 0.3, maxDH: 1.4 });
  for (const sx of [1, -1]) { S.light(sx * 1.0, 0.9, 33.2, 0.3); S.light(sx * 35.6, 2.8, 46.0); S.light(sx * 8.0, 0.8, -43.8); }
  S.hp.drone = [0, 14, 0]; S.hp.ground = [0, -5.6, 0];
  if (E === 'europa') {
    const lead = (sx) => wing.map(([x, y, z], i) => { const nx = wing[Math.min(i + 1, 4)], pv = wing[Math.max(i - 1, 0)]; const tx = nx[0] - pv[0], tz = nx[2] - pv[2], l = Math.hypot(tx, tz); return [sx * (x - (tz / l) * ch[i] * 0.47), y + wt[i] * 0.15, z + (tx / l) * ch[i] * 0.47]; });
    S.strip(lead(1).slice(1), 0.38, 0.14, 'trim'); S.strip(lead(-1).slice(1), 0.38, 0.14, 'trim');
    S.channelSym([[1.7, 5.6, 13], [1.7, 5.8, 0], [1.7, 4.8, -12]], 0.22);
  } else if (E === 'saturn') {
    S.hazardSym([33.6, 2.7, 46.4], [37.4, 2.7, 46.4], 0.9, { nrm: [0, 0, 1], side: [0, -1, 0] });
    S.hazardSym([6.8, 2.6, -16.45], [12.8, 2.6, -16.45], 1.0, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.put(bx(0, 6.6, -2.6, 1.6, 1.6, 1.6), 'struct'); S.put(cbx(0, 7.5, 3.4, 0.8, 0.8, 10, 0.2), 'trim'); S.put(bx(0, 6.5, 8.0, 0.5, 1.6, 0.5), 'dark');
  } else {
    S.bladeSym([12.8, 0.4, -15.4], [17.6, 0.4, -27.4], 2.2, 0.9);
    S.bladeSym([37.4, 1.0, 37.6], [41.2, 1.0, 29.6], 1.6, 0.7);
    S.bladeSym([2.8, 1.0, -41], [5.2, 1.0, -49.6], 1.2, 0.6);
    S.channelSym([[1.7, 5.6, 13], [1.7, 5.8, 0], [1.7, 4.8, -12]], 0.22);
  }
  return S;
}

// ---------------------------------------------------------------- S08: monumentaler dreistufiger Festungsrumpf (105 m)
function buildS8(F) {
  const S = new Ship(F, 8, 105, 1.85), E = F.key;
  const pent = [[0, 44], [31.5, 13.5], [26, -21], [11.5, -21], [9.5, -9.5], [0, -9.5]];
  // Stufe 2: breiter geschlossener Panzerrumpf, darauf ein abgesetztes Panzerplateau
  S.deck(symO(pent), -2.8, 3.2, { cb: 1.4, ct: 0.4 });
  const tier2 = [[0, 37.6], [25.0, 12.8], [21.4, -17.4], [12.8, -17.4], [11.2, -7.6], [0, -7.6]];
  S.deck(symO(tier2), 2.8, 5.6, { c: 'shell', cb: 0.2, ct: 0.5 });
  S.skirtSym([[1.4, 43.4], [31.0, 13.4], [25.6, -20.6]], -2.2, 2.8, { seg: 4.6, out: 0.35, t: 0.5 });
  // schwerer kurzer Bug
  S.mass(zs(0, 0, [[36, prof(9.0, 4.2, -3.6, { ct: 0.35, cb: 0.4 })], [45, prof(8.0, 3.8, -3.4, { ct: 0.38, cb: 0.4 })], [50.6, prof(6.0, 2.7, -2.6, { ct: 0.42 })], [53, prof(3.6, 1.4, -1.5, { ct: 0.45 })]]));
  S.deck(symO([[0, 51.6], [3.2, 50.8], [3.6, 41.6], [0, 41.0]]), -5.4, -2.6, { c: 'struct', cb: 0.5, ct: 0.1 }); // Kinngehäuse
  // Stufe 1: untere Waffendecks, ragen vor die Panzerkante hinaus, Stückpforten in der Außenwand
  const ed = [[0, 44], [31.5, 13.5]], dl = Math.hypot(31.5, 30.5), ex = 31.5 / dl, ez = -30.5 / dl, nx = -ez, nz = ex;
  const at = (t, off) => [ed[0][0] + ex * dl * t + nx * off, ed[0][1] + ez * dl * t + nz * off];
  const lowDeck = [at(0.16, -2.6), at(0.97, -2.6), at(1.0, 2.6), at(0.94, 8.0), at(0.2, 8.0), at(0.13, 3.4)];
  S.deck(lowDeck, -5.6, -1.4, { c: 'shell', sym: true, cb: 1.2, ct: 0.3 });
  for (const sx of [1, -1]) for (let i = 0; i < 12; i++) {
    const p = at(0.24 + i * 0.058, 8.05);
    S.put(bx(sx * p[0], -3.6, p[1], 1.5, 1.1, 0.5, 0, Math.atan2(-ez, sx * ex), 0), i % 3 === 1 ? 'dark' : 'gun');
  }
  // Stufe 3: Rückenbrücke mit eingelassenem Kommandodeck
  S.deck(symO([[0, 30.4], [4.6, 29.0], [6.8, 22], [7.0, -10], [5.2, -14.4], [0, -14.4]]), 5.0, 11.2, { c: 'shell', cb: 0.3, ct: 0.6 });
  for (const sx of [1, -1]) S.deck([[sx * 3.0, 30.0], [sx * 5.2, 28.8], [sx * 6.4, 22], [sx * 6.4, 16.4], [sx * 3.0, 16.4]], 10.6, 13.4, { c: 'paint', levels: [[10.6, 0], [12.8, 0], [13.4, 0.35]] });
  S.deck(rect(-3.2, 15.2, 3.2, 17.0), 10.6, 13.2, { c: 'paint', cb: 0.2, ct: 0.45 });
  S.canopy(29.4, 21.6, 2.4, 10.2, 11.8);
  S.deck(symO([[0, 12], [3.6, 12], [4.6, 1.2], [3.6, -6], [0, -6]]), 10.6, 14.0, { c: 'paint', cb: 0.3, ct: 0.5 }); // Sensorturm
  S.antenna(2.4, 14.0, 4, 5.6); S.antenna(-2.4, 14.0, 2.0, 3.6); S.antenna(0, 14.0, 9.6, 2.4, 0.07);
  S.put(cy(0, 14.4, -2.2, 2.0, 0.8, 'y', 10), 'struct'); S.put(cy(0, 15.0, -2.2, 1.4, 0.5, 'y', 10), 'dark');
  // zwei nach hinten auseinanderlaufende Antriebspfeiler mit schräg gerippten Außenwänden
  const pil = [[18.6, 0.0, -14], [23.2, 0.0, -33], [27.8, 0.0, -50.6]];
  const pprof = [[-6.4, 1.0], [-5.4, 5.6], [-3.8, 7.0], [3.6, 7.0], [5.6, 6.0], [6.4, 3.0], [6.4, -2.6], [5.2, -4.6], [-3.8, -4.6], [-5.6, -2.2]];
  S.massSym(sweep(pil, () => pprof), 'shell');
  for (let i = 1; i < 10; i++) {
    const t = i / 10, P = [lerp(pil[0][0], pil[2][0], t), 0, lerp(pil[0][2], pil[2][2], t)], P2 = [lerp(pil[0][0], pil[2][0], t + 0.012), 0, lerp(pil[0][2], pil[2][2], t + 0.012)];
    const rib = [[-6.8, 1.0], [-5.8, 5.8], [-4.4, 7.2], [-3.4, 7.2], [-4.6, 5.6], [-5.6, 1.0], [-5.6, -2.0], [-6.0, -2.4]];
    S.putSym(sweep([P, P2], [rib, rib]), 'gun');
  }
  S.massSym(sweep(pil.map(([x, y, z]) => [x, y, z + 0.2]), [prof(3.4, 8.6, 6.6, { ct: 0.4 }), prof(3.2, 8.8, 6.6, { ct: 0.4 }), prof(3.2, 8.8, 6.6, { ct: 0.4 })]), 'paint');
  for (const sx of [1, -1]) { // Pfeiler-Innenwände: Panzerfelder zur Bucht hin
    const inn = pil.map(([x, , z]) => [sx * (x - 6.2), z]);
    S.skirt(sx > 0 ? inn.slice().reverse() : inn, -3.8, 5.6, { seg: 3.2, out: 0.35, t: 0.4 });
  }
  for (const sx of [1, -1]) S.deck([[sx * 21.0, -50.2], [sx * 34.6, -50.2], [sx * 34.6, -51.6], [sx * 21.0, -51.6]], -4.2, 6.4, { c: 'shell', cb: 0.45, ct: 0.45 });
  S.nozzlePair(24.4, -0.8, -51.4, 2.5, 3.6); S.nozzlePair(30.4, -0.8, -51.4, 2.4, 3.4); S.nozzlePair(27.4, 4.2, -51.2, 1.7, 2.6);
  S.nozzlePair(22.6, 4.4, -51.0, 0.9, 1.4, { collar: false, cowl: false, segs: 8 }); S.nozzlePair(32.2, 4.4, -51.0, 0.9, 1.4, { collar: false, cowl: false, segs: 8 });
  // Energiebucht: tiefer Schacht, Reaktorring im Rahmen, seitliche Leitungen
  S.deck(symO([[0, -9.6], [11.0, -9.6], [13.4, -21], [17.8, -36], [21.6, -48], [0, -48]]), -6.4, -4.4, { c: 'dark', cb: 0.4, ct: 0.1 });
  S.deck(rect(-9.6, -10.4, 9.6, -9.4), -6.0, 3.0, { c: 'struct', cb: 0.1, ct: 0.3 });
  // Querspanten über dem Buchtboden: aus der flachen Verfolgerkamera liest sich der Boden als gerippter Schacht statt als Spiegelfläche
  const bayHalf = (z) => z > -21 ? lerp(11.0, 13.4, (-9.6 - z) / 11.4) : z > -36 ? lerp(13.4, 17.8, (-21 - z) / 15) : lerp(17.8, 21.6, (-36 - z) / 12);
  for (const z of [-15.5, -22, -38, -44]) { const w = 2 * bayHalf(z) - 1.2; S.put(cbxX(0, -3.6, z, w, 1.6, 1.1, 0.3), 'gun'); S.put(bx(0, -2.75, z, w - 0.6, 0.12, 0.5), 'struct'); }
  for (const sx of [1, -1]) S.add('glow', bx(sx * 5.5, -4.15, -30, 0.35, 0.1, 26));
  S.add('glow', bx(0, -0.6, -10.5, 12, 0.6, 0.2)); S.add('glow', bx(0, 1.4, -10.5, 12, 0.3, 0.2));
  for (const sx of [1, -1]) for (let i = 0; i < 5; i++) S.put(bx(sx * (2.4 + i * 1.8), 0.4, -10.6, 0.4, 5.6, 0.5), 'gun');
  S.P.keep = true; // Reaktorring in der Energiebucht: Blickfang der Verfolger-Kamera, nie vereinfachen
  const ring = new THREE.TorusGeometry(6.2, 0.9, 6, 20); ring.translate(0, 1.4, -30); smooth(ring); S.put(ring, 'gun');
  const ring2 = new THREE.TorusGeometry(4.6, 0.35, 4, 20); ring2.translate(0, 1.4, -30); smooth(ring2); S.put(ring2, 'trim');
  S.add('glow', cy(0, 1.4, -30, 3.6, 0.4, 'z', 16));
  S.put(cy(0, 1.4, -29.4, 4.4, 0.6, 'z', 16), 'dark'); // Rückplatte vorn, Reaktorglut von hinten sichtbar
  for (const [a, b] of [[[-8, 7.6], [8, 7.6]], [[-8, -6.4], [8, -6.4]], [[-8, 7.6], [-8, -6.4]], [[8, 7.6], [8, -6.4]]]) S.put(cbx((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -30, Math.abs(b[0] - a[0]) + 1.0, Math.abs(b[1] - a[1]) + 1.0, 1.4, 0.3), 'struct');
  S.P.keep = false;
  for (const sx of [1, -1]) {
    S.put(cbx(sx * 12.6, 0.6, -30, 9.2, 1.2, 1.2, 0.3), 'struct');
    for (const y of [-3.0, 0.2, 3.4]) S.pipe([[sx * 12.6, y, -12], [sx * 15.4, y, -24], [sx * 19.2, y, -40], [sx * 21.6, y, -47.6]], 0.42, y > 0 ? 'trim' : 'gun');
    S.add('glow', sweep([[sx * 12.2, 1.8, -13], [sx * 15.6, 1.8, -27], [sx * 19.6, 1.8, -42]], () => [[0.1, 0.7], [-0.1, 0.7], [-0.1, -0.7], [0.1, -0.7]]));
  }
  // Unterseite: Kiel, Lastträger, Hangarluke
  S.put(cbx(0, -4.0, 14, 3.0, 2.0, 50, 0.35), 'struct');
  for (const z of [30, 18, 4, -6]) { const w = z > 20 ? 20 : 34; S.put(cbxX(0, -3.6, z, w, 1.2, 1.4, 0.3), 'gun'); }
  S.deck(rect(-6.4, 6.6, 6.4, 16.8), -4.2, -2.4, { c: 'struct', cb: 0.1, ct: 0.1, reg: false });
  for (const sx of [1, -1]) S.put(bx(sx * 2.95, -4.32, 11.7, 5.6, 0.16, 9.2), 'dark');
  // Montage: untere Bänke (je 3), obere Bank (je 3), Kinnlaser; zwei Generatorfelder 3×2 + Heckfassung
  const lowL = [0.3, 0.55, 0.8].map((t) => at(t, 5.0));
  S.laserBankSym(lowL);
  S.laserBankSym([[9.6, 23.4], [15.0, 17.8], [20.2, 12.4]]);
  S.laser(0, 46.0, { hang: true });
  S.genBaySym([[14.4, 2.6], [17.7, 2.6], [14.4, -0.7], [17.7, -0.7], [14.4, -4.0], [17.7, -4.0]]);
  S.genBay([[0, -11.6]]);
  S.insignia(14.6, 9.4, 3.2);
  // Panzerplatten in Lagen
  // Randbänder entlang der schrägen Kanten (Raster folgt der Kante), danach die Innenflächen
  const edgeBand = (P, ids, off, half, yr) => {
    const Pi = offsetPoly(ccw(symO(P)), -off), Po = ccw(symO(P));
    const pick = ids.map((q) => Pi[Po.findIndex((v) => Math.hypot(v[0] - q[0], v[1] - q[1]) < 0.01)]);
    for (const sx of [1, -1]) { const pth = pick.map(([x, z]) => [sx * x, z]); S.armorAlong(sx > 0 ? pth : pth, half.map(() => half[0]), half.map(() => half[0]), { px: 3.0, pz: 2.6, t: 0.45, panel: 0.2, layer: 0.3, yr, gap: 0.3 }); }
  };
  edgeBand(pent, [[0, 44], [31.5, 13.5], [26, -21]], 2.9, [2.3, 2.3, 2.3], [2.9, 3.5]);
  edgeBand(tier2, [[0, 37.6], [25.0, 12.8], [21.4, -17.4]], 2.6, [2.0, 2.0, 2.0], [5.3, 5.9]);
  S.armor(symO(pent), { sym: true, inset: 0.6, px: 3.2, pz: 3.0, t: 0.45, panel: 0.22, layer: 0.3, yr: [2.9, 3.5] });
  S.armor(symO(tier2), { sym: true, inset: 0.6, px: 3.0, pz: 2.8, t: 0.45, panel: 0.22, layer: 0.3, yr: [5.3, 5.9] });
  S.armor(symO([[0, 30.4], [4.6, 29.0], [6.8, 22], [7.0, -10], [5.2, -14.4], [0, -14.4]]), { sym: true, px: 2.6, pz: 2.8, t: 0.3, panel: 0.2, yr: [10.9, 11.4] });
  S.armor(symO([[0, -9.6], [11.0, -9.6], [13.4, -21], [17.8, -36], [21.6, -48], [0, -48]]), { sym: true, c: 'dark', e: 'gun', fill: 0.75, px: 4.2, pz: 4.0, t: 0.35, panel: 0.45, yr: [-4.6, -4.2] });
  S.armor(lowDeck, { px: 3.0, pz: 2.8, t: 0.34, panel: 0.15, yr: [-1.7, -1.2] });
  S.armor(lowDeck.map(([x, z]) => [-x, z]), { px: 3.0, pz: 2.8, t: 0.34, panel: 0.15, yr: [-1.7, -1.2] });
  for (const sx of [1, -1]) S.armorAlong(pil.map(([x, , z]) => [sx * x, z]), [6, 6, 6], [6, 6, 6], { px: 2.8, pz: 2.6, t: 0.34, panel: 0.25, maxDH: 0.7, L: 1.5 });
  S.armor(symO(pent), { sym: true, under: true, c: 'under', px: 3.6, pz: 3.4, t: 0.32, panel: 0.3, maxDH: 1.0 });
  for (const sx of [1, -1]) S.armorAlong(pil.map(([x, , z]) => [sx * x, z]), [5.4, 5.4, 5.4], [5.4, 5.4, 5.4], { under: true, c: 'under', px: 3.0, pz: 3.0, t: 0.3, panel: 0.3, maxDH: 1.0 });
  for (const sx of [1, -1]) { S.light(sx * 2.0, 1.0, 53.0, 0.4); S.light(sx * 32.0, 3.6, 13.8, 0.5); S.light(sx * 34.2, 6.0, -50.2, 0.5); }
  S.hp.drone = [0, 22, 0]; S.hp.ground = [0, -6.6, 0];
  const edgeLine = (sx, y) => [at(0.02, 0.4), at(0.5, 0.4), at(1.0, 0.4)].map(([x, z]) => [sx * x, y, z]);
  if (E === 'europa') {
    S.strip(edgeLine(1, 3.25), 0.4, 0.14, 'trim'); S.strip(edgeLine(-1, 3.25), 0.4, 0.14, 'trim');
    S.stripSym([[3.2, 13.45, 29.6], [5.0, 13.45, 28.6], [6.2, 13.45, 22], [6.2, 13.45, 16.6]], 0.3, 0.1, 'trim');
    S.channelSym([[4.2, 11.25, 13], [4.2, 11.25, -9]], 0.24);
  } else if (E === 'saturn') {
    S.hazardSym([21.4, 6.45, -51.65], [34.4, 6.45, -51.65], 1.2, { nrm: [0, 0, -1], side: [0, -1, 0] });
    S.hazardSym([6.6, -4.25, 6.8], [6.6, -4.25, 16.6], 0.6, { nrm: [0, -1, 0], side: [-1, 0, 0] });
    S.hazard([-6.4, -4.25, 6.8], [6.4, -4.25, 6.8], 0.6, { nrm: [0, -1, 0], side: [0, 0, 1] });
    S.put(cy(23.6, 6.4, -6, 1.3, 1.6, 'y', 8), 'struct'); S.put(cbx(23.6, 7.6, -1.8, 0.9, 0.9, 9, 0.2), 'trim');
    S.put(bx(23.6, 6.6, 2.6, 0.5, 2.2, 0.5), 'dark'); S.put(bx(23.6, 5.5, 2.6, 1.0, 0.4, 1.0), 'trim');
  } else {
    for (let i = 0; i < 4; i++) { const p = at(0.3 + i * 0.2, 8.2); S.bladeSym([p[0], -3.2, p[1] - 1], [p[0] + 3.4, -3.2, p[1] - 7.4], 1.6, 0.7); }
    S.bladeSym([33.4, 1.0, -46], [38.4, 1.0, -57], 2.2, 1.0);
    S.channelSym([[4.2, 11.25, 13], [4.2, 11.25, -9]], 0.26);
    S.channelSym([[21.2, 7.0, -16], [25.6, 7.0, -46]], 0.24);
  }
  return S;
}

const BUILDERS = { s3: buildS3, s4: buildS4, s5: buildS5, s6: buildS6, s7: buildS7, s8: buildS8 };
const STATS = { s3: [5, 5], s4: [7, 6], s5: [8, 8], s6: [10, 9], s7: [11, 11], s8: [13, 13] };

// ---------------------------------------------------------------- Texturen (prozedural, kachelbar; Normalmap prozedural, kein Bake)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { return [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261); }
function tileNoise(N, cells, R) {
  const g = Array.from({ length: cells * cells }, () => R()), out = new Float32Array(N * N);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells];
    const c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * N + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
  return out;
}
function png(w, h, data, ch = 3) {
  const row = w * ch, raw = Buffer.alloc((row + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (row + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1); }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb) >>> 0);
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function down(src, N, M, ch) {
  const k = N / M, out = new Uint8Array(M * M * ch);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) for (let c = 0; c < ch; c++) {
    let s = 0; for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += src[((y * k + j) * N + x * k + i) * ch + c];
    out[(y * M + x) * ch + c] = Math.round(s / (k * k));
  }
  return out;
}
const texCache = new Map();
function makeTextures(F) {
  if (texCache.has(F.key)) return texCache.get(F.key);
  const N = 512, R = rng(hash('ls-' + F.key));
  const nLow = tileNoise(N, 4, R), nMid = tileNoise(N, 16, R), nHi = tileNoise(N, 64, R), nFine = tileNoise(N, 128, R);
  const H = new Float32Array(N * N), C = new Float32Array(N * N * 3), G = new Float32Array(N * N), RO = new Float32Array(N * N), ME = new Float32Array(N * N), AO = new Float32Array(N * N);
  const paint = srgb(F.paint), paint2 = srgb(F.paint2), bare = [0.56, 0.57, 0.58], primer = [0.42, 0.24, 0.18], graph = [0.25, 0.26, 0.29];
  const plates = [];
  const snap = (v) => Math.round(v / 8) * 8;
  (function split(x, y, w, h, d) {
    const min = F.plateMin, canX = w >= min * 2, canY = h >= min * 2;
    if ((!canX && !canY) || (d >= 2 && R() < 0.3)) { plates.push({ x, y, w, h, tone: R() * 2 - 1, rough: (R() - 0.5) * 0.1, swap: R() < F.swap, diag: F.diag && R() < 0.45 }); return; }
    const horiz = canX && (!canY || w > h || (w === h && R() < 0.5));
    if (horiz) { const c = Math.min(w - min, Math.max(min, snap(w * (0.3 + R() * 0.4)))); split(x, y, c, h, d + 1); split(x + c, y, w - c, h, d + 1); }
    else { const c = Math.min(h - min, Math.max(min, snap(h * (0.3 + R() * 0.4)))); split(x, y, w, c, d + 1); split(x, y + c, w, h - c, d + 1); }
  })(0, 0, N, N, 0);
  const bevPx = F.key === 'europa' ? 7 : 4;
  for (const p of plates) {
    const base = p.swap ? paint.map((v, i) => v * [1.1, 1.02, 0.8][i]) : paint;
    for (let py = p.y; py < p.y + p.h; py++) for (let px = p.x; px < p.x + p.w; px++) {
      const i = py * N + px, lx = px - p.x, ly = py - p.y;
      const seam = lx < (F.seamW ?? 2) || ly < (F.seamW ?? 2) || (p.diag && Math.abs(lx - ly * 0.6 - p.w * 0.35) < 1.1 && ly > 6 && ly < p.h - 6);
      const dE = Math.max(0, Math.min(lx - 2, ly - 2, p.w - lx, p.h - ly));
      const near = Math.exp(-dE / 5);
      let k = 1 + p.tone * F.panelVar + (nLow[i] - 0.5) * 0.08 + (nHi[i] - 0.5) * 0.035 + (nFine[i] - 0.5) * 0.02;
      const grime = F.grime * near * (0.35 + nMid[i] * 0.9);
      k *= 1 - grime * 0.6;
      let c = base.map((v) => v * k);
      if (F.key === 'eris') c = c.map((v, j) => lerp(v, graph[j], Math.exp(-dE / 2.0) * 0.8));
      if (F.key === 'europa') c = c.map((v) => v * (1 - Math.exp(-dE / 2.5) * 0.12));
      // SATURN: Grundierungsränder und blanke Stellen an den Plattenkanten (Lackabrieb)
      if (F.wear && dE < 3.5 && nHi[i] > 0.6) c = nHi[i] > 0.78 ? bare.map((v) => v * (0.85 + nFine[i] * 0.3)) : primer;
      H[i] = seam ? -1 : Math.min(1, dE / bevPx) * 0.6;
      G[i] = (seam ? 0.42 : 0.78 + (nMid[i] - 0.5) * 0.1 + p.tone * 0.04) * (1 - grime * 0.5);
      if (seam) c = c.map((v) => v * F.seam);
      C.set(c, i * 3);
      RO[i] = F.hullRough + p.rough + (nMid[i] - 0.5) * 0.14 + (nFine[i] - 0.5) * 0.06 + (seam ? 0.12 : 0) + grime * 0.18 - (p.swap ? 0.1 : 0);
      ME[i] = F.wear && dE < 3.5 && nHi[i] > 0.78 ? 0.85 : F.hullMetal;
      AO[i] = seam ? 0.35 : 1 - near * 0.24;
    }
    if (F.rivets) for (let t = 6; t < p.w - 4; t += 12) for (const ry of [p.y + 6, p.y + p.h - 4]) dot(p.x + t, ry, 1.7, 'rivet');
  }
  function dot(cx, cy0, r, kind) {
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      const d = Math.hypot(x, y); if (d > r) continue;
      const px = ((cx + x) % N + N) % N, py = ((cy0 + y) % N + N) % N, i = py * N + px;
      if (kind === 'rivet') { H[i] += 0.7 * (1 - d / r); for (let j = 0; j < 3; j++) C[i * 3 + j] *= 1.12; G[i] *= 1.1; }
      else if (d < r - 1.3) { C.set(bare.map((v) => v * (0.9 + nHi[i] * 0.2)), i * 3); ME[i] = 0.95; RO[i] = 0.34; G[i] = 0.62; H[i] -= 0.15; }
      else { C.set(primer, i * 3); RO[i] = 0.7; ME[i] = 0.1; H[i] -= 0.08; }
    }
  }
  // Abplatzer an Plattenkanten (Grundierungsrand), längliche Kratzer in Flugrichtung (Bild-v = Rumpf-z auf Oberseiten)
  for (let k = 0; k < 320 * F.wear; k++) {
    const p = plates[Math.floor(R() * plates.length)];
    const side = R(); const x = side < 0.5 ? p.x + 3 + R() * p.w : p.x + 3 + R() * 4, y = side < 0.5 ? p.y + 3 + R() * 4 : p.y + 3 + R() * p.h;
    dot(Math.round(x), Math.round(y), 1.6 + R() * 4.2, 'chip');
  }
  for (let k = 0; k < 180 * F.wear; k++) {
    const x = R() * N, y = R() * N, a = Math.PI / 2 + (R() - 0.5) * 0.12, len = 14 + R() * 70;
    for (let t = 0; t < len; t++) {
      const px = ((Math.round(x + Math.cos(a) * t)) % N + N) % N, py = ((Math.round(y + Math.sin(a) * t)) % N + N) % N, i = py * N + px;
      const s = 0.35 + 0.35 * Math.sin(t / len * Math.PI);
      for (let j = 0; j < 3; j++) C[i * 3 + j] = lerp(C[i * 3 + j], bare[j], s); ME[i] = Math.max(ME[i], 0.6); RO[i] = Math.min(RO[i], 0.42); H[i] -= 0.08;
    }
  }
  const to8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  const paintRGB = new Uint8Array(N * N * 3), metalRGB = new Uint8Array(N * N * 3), nrm = new Uint8Array(N * N * 3), ormP = new Uint8Array(N * N * 3), ormM = new Uint8Array(N * N * 3);
  for (let i = 0; i < N * N; i++) {
    for (let j = 0; j < 3; j++) paintRGB[i * 3 + j] = to8(C[i * 3 + j]);
    const g = to8(G[i]); metalRGB.set([g, g, g], i * 3);
    ormP.set([to8(AO[i]), to8(RO[i]), to8(ME[i])], i * 3);
    ormM.set([to8(AO[i]), to8(F.metalRough + (RO[i] - F.hullRough) * 0.8), 255], i * 3);
    const x = i % N, y = (i / N) | 0;
    const hx = H[y * N + (x + 1) % N] - H[y * N + (x + N - 1) % N], hy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x];
    const v = new THREE.Vector3(-hx * 1.4, -hy * 1.4, 1).normalize();
    nrm.set([to8(v.x * 0.5 + 0.5), to8(v.y * 0.5 + 0.5), to8(v.z * 0.5 + 0.5)], i * 3);
  }
  const lens = new Uint8Array(8 * 8 * 3).fill(255);
  const t = {
    paint: png(N, N, paintRGB), metal: png(256, 256, down(metalRGB, N, 256, 3)), normal: png(N, N, nrm),
    ormP: png(256, 256, down(ormP, N, 256, 3)), ormM: png(256, 256, down(ormM, N, 256, 3)), lens: png(8, 8, lens),
  };
  texCache.set(F.key, t);
  return t;
}

// ---------------------------------------------------------------- Export (gltf-transform Document → GLB → optimize)
function boxUV(g, scale) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    a.fromBufferAttribute(p, t); b.fromBufferAttribute(p, t + 1); c.fromBufferAttribute(p, t + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = [a, b, c][k];
      let u0, v0;
      if (ay >= ax && ay >= az) { u0 = v.x; v0 = v.z; } else if (ax >= az) { u0 = v.z; v0 = v.y; } else { u0 = v.x; v0 = v.y; }
      uv[(t + k) * 2] = u0 / scale; uv[(t + k) * 2 + 1] = v0 / scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
// LOD: Positionen verschweißen, mit meshoptimizer vereinfachen, flach neu schattieren, Box-UV neu
function lodGeo(g, ratio, uvScale) {
  const p = g.attributes.position, col = g.attributes.color, map = new Map(), pos = [], cols = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}` + (col ? `|${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}` : '');
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); if (col) cols.push(col.getX(i), col.getY(i), col.getZ(i)); }
    idx.push(j);
  }
  const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
  let [out] = MeshoptSimplifier.simplify(new Uint32Array(idx), new Float32Array(pos), 3, target, 0.02, []);
  for (const err of [0.05, 0.12, 0.3, 1.0]) { if (out.length <= target * 1.1) break; [out] = MeshoptSimplifier.simplify(new Uint32Array(idx), new Float32Array(pos), 3, target, err, ['Prune']); }
  const P = new Float32Array(out.length * 3), Cc = new Float32Array(out.length * 3);
  for (let i = 0; i < out.length; i++) { const v = out[i]; P.set(pos.slice(v * 3, v * 3 + 3), i * 3); if (col) Cc.set(cols.slice(v * 3, v * 3 + 3), i * 3); }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (col) r.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  r.computeVertexNormals(); dropDegenerate(r);
  if (uvScale) boxUV(r, uvScale);
  return r;
}
// grober Collider (≤ 300 Dreiecke): stark vereinfachte Hülle der tragenden Massen, Durchbrüche bleiben offen
function colliderGeo(list) {
  const g = mergeGeometries(list.map((x) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', x.attributes.position.clone()); return c; }));
  let best = null;
  for (const r of [0.012, 0.009, 0.007, 0.005, 0.0035, 0.0025, 0.0015]) { const c = lodGeo(g, r, 0); if (tris(c) <= 300 && (!best || tris(c) > tris(best))) best = c; }
  return best || lodGeo(g, 0.001, 0);
}

async function exportShip(S, file) {
  const F = S.F, T = makeTextures(F);
  const doc = new Document();
  const buf = doc.createBuffer('main');
  const es = doc.createExtension(KHRMaterialsEmissiveStrength);
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const tex = (name, bytes, mime = 'image/png') => doc.createTexture(name).setImage(new Uint8Array(bytes)).setMimeType(mime);
  const tPaint = tex(`${F.key}_paint`, T.paint), tMetal = tex(`${F.key}_metal`, T.metal), tNormal = tex(`${F.key}_normal`, T.normal);
  const tOrmP = tex(`${F.key}_orm_paint`, T.ormP), tOrmM = tex(`${F.key}_orm_metal`, T.ormM);
  const emis = (m, hex, k) => { m.setEmissiveFactor(lin(hex)); m.setExtension('KHR_materials_emissive_strength', es.createEmissiveStrength().setEmissiveStrength(k)); return m; };
  const M = {
    hull: doc.createMaterial('M_Hull').setBaseColorTexture(tPaint).setNormalTexture(tNormal).setNormalScale(0.8)
      .setMetallicRoughnessTexture(tOrmP).setOcclusionTexture(tOrmP).setMetallicFactor(1).setRoughnessFactor(1),
    metal: doc.createMaterial('M_Metal').setBaseColorTexture(tMetal).setNormalTexture(tNormal).setNormalScale(0.6)
      .setMetallicRoughnessTexture(tOrmM).setOcclusionTexture(tOrmM).setMetallicFactor(0.92).setRoughnessFactor(1),
    glass: emis(doc.createMaterial('M_Glass').setBaseColorFactor([0.012, 0.016, 0.024, 1]).setMetallicFactor(0.9).setRoughnessFactor(0.12), F.glow, 0.05),
    glow: emis(doc.createMaterial('M_Glow').setBaseColorFactor([0.02, 0.02, 0.025, 1]).setMetallicFactor(0).setRoughnessFactor(0.5), F.glow, 3.0),
    lens: emis(doc.createMaterial('M_LaserLens').setBaseColorFactor([0.03, 0.03, 0.035, 1]).setMetallicFactor(0.6).setRoughnessFactor(0.22)
      .setEmissiveTexture(tex('laser_lens_mask', T.lens)), '#ff5a36', 2.2),
  };
  const accessor = (arr, type) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  // Gekachelte Box-UV als 16-Bit (normalisiert) statt 32-Bit-Float speichern: UV = −UVR + 2·UVR·q über KHR_texture_transform
  // (Auflösung ≈ 3 mm bei 7-m-Kachel) – spart ein Sechstel jeder Rumpfecke.
  const UVR = 16, ttx = doc.createExtension(KHRTextureTransform);
  for (const m of [M.hull, M.metal]) for (const ti of [m.getBaseColorTextureInfo(), m.getNormalTextureInfo(), m.getMetallicRoughnessTextureInfo(), m.getOcclusionTextureInfo()]) {
    if (ti) ti.setExtension('KHR_texture_transform', ttx.createTransform().setOffset([-UVR, -UVR]).setScale([2 * UVR, 2 * UVR]));
  }
  const quantUV = (uv) => { const q = new Uint16Array(uv.length); for (let i = 0; i < uv.length; i++) q[i] = Math.round(clamp((uv[i] + UVR) / (2 * UVR), 0, 1) * 65535); return doc.createAccessor().setType('VEC2').setArray(q).setNormalized(true).setBuffer(buf); };
  const prim = (g, mat, uvScale) => {
    if (g.index) g = g.toNonIndexed();
    if (uvScale && !g.attributes.uv) boxUV(g, uvScale);
    const p = doc.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', accessor(new Float32Array(g.attributes.position.array), 'VEC3'))
      .setAttribute('NORMAL', accessor(new Float32Array(g.attributes.normal.array), 'VEC3'));
    if (g.attributes.uv) p.setAttribute('TEXCOORD_0', mat === M.hull || mat === M.metal ? quantUV(g.attributes.uv.array) : accessor(new Float32Array(g.attributes.uv.array), 'VEC2'));
    if (g.attributes.color) p.setAttribute('COLOR_0', accessor(new Float32Array(g.attributes.color.array), 'VEC3'));
    return p;
  };
  const merge = (list) => mergeGeometries(list.map((g) => { const c = g.clone(); if (!c.attributes.color) { const n = c.attributes.position.count; c.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); } return c; }));
  const counts = {};
  const scene = doc.createScene('Scene');
  doc.getRoot().setDefaultScene(scene);
  const extrasScene = doc.createScene('Extras');
  const root = doc.createNode(`Schiff_${String(S.no).padStart(2, '0')}_${F.label}`).setExtras({ ship: `s${S.no}`, faction: F.key, lengthM: S.len, lasers: S.lasers.length, generators: S.gens.length, mountScale: S.K, builder: 'tools/models/schiffe.mjs' });
  scene.addChild(root);
  const xroot = doc.createNode(`Extras_Schiff_${String(S.no).padStart(2, '0')}_${F.label}`).setExtras({ hidden_by_default: true, note: 'LOD1/LOD2, Collider und Slot-Kappen; Kappen per Bestückung in models.js einblenden' });
  extrasScene.addChild(xroot);
  // Rumpf LOD0 (ein Knoten, je Material ein Primitive)
  S.soot();
  const SETS = [['hull', M.hull, F.uv], ['metal', M.metal, 7], ['glass', M.glass, 0], ['glow', M.glow, 0]];
  const merged = {};
  const hullMesh = doc.createMesh('Hull_LOD0');
  const raw0 = {}, keep0 = {}, simp0 = {}; let rawN = 0, fixN = 0, simpN = 0;
  for (const [bk] of SETS) {
    const list = S.P.b[bk]; if (!list || !list.length) continue;
    raw0[bk] = merge(list); rawN += tris(raw0[bk]);
    const simp = bk === 'metal' || bk === 'hull'; // Lackplatten/Düsen/Kanzel (keep) nie vereinfachen, nur Schalen, Tragwerk, Technik
    const kl = simp ? list.filter((g) => g.userData.keep) : list, sl = simp ? list.filter((g) => !g.userData.keep) : [];
    if (kl.length) { keep0[bk] = merge(kl); fixN += tris(keep0[bk]); }
    if (sl.length) { simp0[bk] = merge(sl); simpN += tris(simp0[bk]); }
  }
  counts.hullRoh = rawN;
  const cap = HULL_TARGET[`s${S.no}`], kCap = rawN > cap ? Math.max(0.05, (cap - fixN) / simpN) : 1;
  counts.vereinfacht = +kCap.toFixed(3); counts.fest = fixN;
  for (const [bk, mat, sc] of SETS) {
    if (!raw0[bk]) continue;
    let g = raw0[bk];
    if (kCap < 1 && simp0[bk]) {
      const parts = [lodGeo(simp0[bk], kCap * 0.985, 0)];
      if (keep0[bk]) parts.push(keep0[bk]);
      g = mergeGeometries(parts.map((x) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', x.attributes.position); c.setAttribute('normal', x.attributes.normal); c.setAttribute('color', x.attributes.color); return c; }));
    }
    counts[bk] = tris(g); merged[bk] = g;
    if (bk === 'glass' || bk === 'glow') g.deleteAttribute('color');
    hullMesh.addPrimitive(prim(g, mat, sc || null));
  }
  root.addChild(doc.createNode('Hull_LOD0').setMesh(hullMesh));
  counts.hullLOD0 = Object.keys(merged).reduce((s, k) => s + tris(merged[k]), 0);
  // LOD1/LOD2 in der Extras-Szene
  for (const [name, ratio] of [['Hull_LOD1', 0.3], ['Hull_LOD2', 0.1]]) {
    const mesh = doc.createMesh(name); let n = 0;
    for (const [bk, mat, sc] of SETS) {
      if (!merged[bk]) continue;
      const g = lodGeo(raw0[bk], ratio * Math.min(1, cap / rawN), sc || 0); if (!tris(g)) continue; n += tris(g);
      if (bk === 'glass' || bk === 'glow') g.deleteAttribute('color');
      mesh.addPrimitive(prim(g, mat, null));
    }
    counts[name] = n;
    xroot.addChild(doc.createNode(name).setMesh(mesh).setExtras({ lod: name.slice(-1) }));
  }
  // Collider
  const col = colliderGeo([raw0.hull, raw0.metal].filter(Boolean)); counts.COL_Hull = tris(col);
  const colPrim = doc.createPrimitive().setAttribute('POSITION', accessor(new Float32Array(col.attributes.position.array), 'VEC3'));
  xroot.addChild(doc.createNode('COL_Hull').setMesh(doc.createMesh('COL_Hull').addPrimitive(colPrim)).setExtras({ collider: true, invisible: true }));
  // Triebwerksleuchten (gleiches Leuchtmaterial wie M_Glow)
  const eg = mergeGeometries(S.engineGeo.map((g) => prep(g))); counts.engine = tris(eg);
  root.addChild(doc.createNode('EngineLight').setMesh(doc.createMesh('EngineLight').addPrimitive(prim(eg, M.glow, null))));
  // Wappen: links Fraktion, rechts Clanplatz (Standard = Fraktionswappen), Bild aufrecht von außen/oben gesehen
  if (S.ins) {
    const insImg = fs.readFileSync(path.join(HERE, 'wappen', `${F.key}.webp`));
    const tIns = tex(`${F.key}-insignia`, insImg, 'image/webp');
    for (const [name, sx, clan] of [['Faction_Insignia_Left', 1, false], ['Insignia_ClanSlot_Right', -1, true]]) {
      const g = new THREE.PlaneGeometry(S.ins.w, S.ins.h); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
      const m = doc.createMaterial(name).setBaseColorTexture(tIns).setMetallicFactor(0.2).setRoughnessFactor(0.55);
      root.addChild(doc.createNode(name).setTranslation([sx * S.ins.x, S.ins.y, S.ins.z]).setMesh(doc.createMesh(name).addPrimitive(prim(g, m, null)))
        .setExtras({ insignia_faction: F.key, clan_replaceable: clan, texture_ratio: '34:23', uv_orientation: 'upright_from_above' }));
    }
  }
  // Laser_NN und Generator_NN (sichtbare Ausrüstung) plus HP_-Andockpunkte und Kappen (Extras-Szene)
  const partMesh = (name, parts) => {
    const mesh = doc.createMesh(name);
    let n = 0;
    for (const [bk, mat] of [['metal', M.metal], ['lens', M.lens], ['glow', M.glow]]) {
      if (!parts[bk] || !parts[bk].length) continue;
      const P = new Parts(F);
      for (const it of parts[bk]) { if (Array.isArray(it)) P.add(bk === 'metal' ? 'metal' : 'x', it[0], it[1]); else P.add('x', it); }
      const g = merge(P.b[bk === 'metal' ? 'metal' : 'x']); n += tris(g);
      if (bk !== 'metal') g.deleteAttribute('color');
      if (bk === 'lens') { const uv = new Float32Array(g.attributes.position.count * 2).fill(0.5); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
      mesh.addPrimitive(prim(g, mat, bk === 'metal' ? 6 : null));
    }
    return { mesh, n };
  };
  const capMesh = (name, list) => partMesh(name, { metal: list }).mesh;
  counts.laser = 0; counts.gen = 0;
  const lp = laserParts(), gp = genParts();
  S.lasers.forEach((l, i) => {
    const id = String(i + 1).padStart(2, '0'), q = l.hang ? [0, 0, 1, 0] : [0, 0, 0, 1];
    const { mesh, n } = partMesh(`Laser_${id}`, lp); counts.laser = n;
    root.addChild(doc.createNode(`Laser_${id}`).setTranslation(l.pos).setRotation(q).setMesh(mesh).setExtras({ slot: i + 1, hang: l.hang }));
    root.addChild(doc.createNode(`HP_Laser_${id}`).setTranslation(l.pos).setRotation(q));
    const c = l.cap;
    xroot.addChild(doc.createNode(`CAP_Laser_${id}`).setTranslation(l.pos).setRotation(q).setExtras({ slot: i + 1, cap_for: `Laser_${id}`, visible_when: 'slot_empty' })
      .setMesh(capMesh(`CAP_Laser_${id}`, [[cbx(0, 0.3, (c.z0 + c.z1) / 2, c.w, 0.6, c.z1 - c.z0, 0.3), 'plate'], [cbx(0, 0.66, (c.z0 + c.z1) / 2 - 0.3, c.w * 0.5, 0.16, (c.z1 - c.z0) * 0.5, 0.3), 'trim']])));
  });
  S.gens.forEach((g, i) => {
    const id = String(i + 1).padStart(2, '0');
    const { mesh, n } = partMesh(`Generator_${id}`, gp); counts.gen = n;
    root.addChild(doc.createNode(`Generator_${id}`).setTranslation(g.pos).setMesh(mesh).setExtras({ slot: i + 1 }));
    root.addChild(doc.createNode(`HP_Gen_${id}`).setTranslation(g.pos));
    const c = g.cap;
    xroot.addChild(doc.createNode(`CAP_Gen_${id}`).setTranslation(g.pos).setExtras({ slot: i + 1, cap_for: `Generator_${id}`, visible_when: 'slot_empty' })
      .setMesh(capMesh(`CAP_Gen_${id}`, [[cbxX(0, c.h, 0, c.s, 0.16, c.d, 0.3), 'plate'], [bx(0, c.h + 0.12, 0, 0.9, 0.12, 0.22), 'trim']])));
  });
  S.engines.forEach((e, i) => root.addChild(doc.createNode(`HP_Engine_${String(i + 1).padStart(2, '0')}`).setTranslation(e.pos).setRotation([0, 1, 0, 0]).setExtras({ size: e.size })));
  if (S.hp.cockpit) root.addChild(doc.createNode('HP_Cockpit').setTranslation(S.hp.cockpit));
  root.addChild(doc.createNode('HP_Drone_Anchor').setTranslation(S.hp.drone || [0, 10, 0]));
  root.addChild(doc.createNode('HP_Ground').setTranslation(S.hp.ground || [0, -4, 0]));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const raw = path.join(TMP, path.basename(file).replace('.glb', '-roh.glb'));
  fs.writeFileSync(raw, await io.writeBinary(doc));
  execFileSync(process.execPath, [GT.cli, 'optimize', raw, file,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '512',
    '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false', '--simplify', 'false', '--prune', 'false'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (KEEP_RAW) fs.copyFileSync(raw, file.replace('.glb', '-referenz.glb'));
  if (process.env.TRI_DEBUG) { console.log(Object.entries(globalThis.__TRI).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k}:${v}`).join('  ')); globalThis.__TRI = {}; }
  return counts;
}

// ---------------------------------------------------------------- Prüfung der fertigen Datei (nativ zurückgelesen)
async function verify(file, S) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(file);
  const root = doc.getRoot();
  let bad = 0, zero = 0;
  const triOf = (mesh) => mesh.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0);
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    const n = idx ? idx.getCount() : pos.getCount();
    const el = [0, 0, 0], A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, el); if (!el.every(Number.isFinite)) bad++; }
    for (let i = 0; i < n; i += 3) {
      pos.getElement(idx ? idx.getScalar(i) : i, A); pos.getElement(idx ? idx.getScalar(i + 1) : i + 1, B); pos.getElement(idx ? idx.getScalar(i + 2) : i + 2, C);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const cx = uy * vz - uz * vy, cyy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (Math.hypot(cx, cyy, cz) < 1e-6) zero++;
    }
  }
  // sichtbare Szene: Maße und Dreiecke
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let tri = 0;
  const visible = [], prims = { n: 0 };
  scene.traverse((node) => {
    visible.push(node.getName());
    const mesh = node.getMesh(); if (!mesh) return;
    tri += triOf(mesh); prims.n += mesh.listPrimitives().length;
    const wm = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'), el = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, el);
        const x = wm[0] * el[0] + wm[4] * el[1] + wm[8] * el[2] + wm[12], y = wm[1] * el[0] + wm[5] * el[1] + wm[9] * el[2] + wm[13], z = wm[2] * el[0] + wm[6] * el[1] + wm[10] * el[2] + wm[14];
        [x, y, z].forEach((v, k) => { if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; });
      }
    }
  });
  const byName = (n) => root.listNodes().find((x) => x.getName() === n);
  const meshTri = (n) => { const x = byName(n); return x && x.getMesh() ? triOf(x.getMesh()) : 0; };
  const names = root.listNodes().map((n) => n.getName());
  const ids = (k, b) => S[k].map((_, i) => `${b}_${String(i + 1).padStart(2, '0')}`);
  const need = [...ids('lasers', 'Laser'), ...ids('gens', 'Generator'), ...ids('lasers', 'HP_Laser'), ...ids('gens', 'HP_Gen'), ...ids('lasers', 'CAP_Laser'), ...ids('gens', 'CAP_Gen'),
    'EngineLight', 'HP_Engine_01', 'Hull_LOD0', 'Hull_LOD1', 'Hull_LOD2', 'COL_Hull', 'HP_Cockpit', 'HP_Drone_Anchor', 'HP_Ground'];
  const missing = need.filter((n) => !names.includes(n));
  const leaked = visible.filter((n) => /^(CAP_|COL_|Hull_LOD[12])/.test(n));
  const tex = root.listTextures().map((t) => `${t.getName()} ${t.getSize()?.join('x')} ${t.getMimeType()}`);
  return {
    tri, bad, zero, missing, leaked, drawcalls: prims.n, dims: max.map((v, k) => +(v - min[k]).toFixed(2)),
    lod: { LOD0: meshTri('Hull_LOD0'), LOD1: meshTri('Hull_LOD1'), LOD2: meshTri('Hull_LOD2'), COL: meshTri('COL_Hull') },
    laserTri: meshTri('Laser_01'), genTri: meshTri('Generator_01'),
    materials: root.listMaterials().map((m) => m.getName()), tex,
  };
}

// ---------------------------------------------------------------- Ablauf
// Wappen aus den vorhandenen, bestätigten Schiff-2-Modellen übernehmen (nicht neu erfinden)
async function ensureInsignia() {
  const dir = path.join(HERE, 'wappen');
  if (['europa', 'saturn', 'eris'].every((f) => fs.existsSync(path.join(dir, `${f}.webp`)))) return;
  fs.mkdirSync(dir, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const f of ['europa', 'saturn', 'eris']) {
    const doc = await io.read(path.join(OUT, `${f}-schiff2.glb`));
    const t = doc.getRoot().listTextures().find((x) => /insignia/i.test(x.getName()));
    if (!t) throw new Error(`Wappen in ${f}-schiff2.glb nicht gefunden`);
    fs.writeFileSync(path.join(dir, `${f}.webp`), t.getImage());
  }
}

await ensureInsignia();
const manifest = {
  erstellt: new Date().toISOString(), werkzeug: `tools/models/schiffe.mjs, gltf-transform ${GT.v}, meshoptimizer ${GT.mv}`, achsen: '1 Einheit = 1 m, +Y oben, +Z Bug, +X links (Pilot)',
  budget: { rumpfDreieckeMax: HULL_BUDGET, rumpfDreieckeZiel: HULL_TARGET, laserMax: 1200, generatorMax: 600, colliderMax: 300, kbMax: KB_MAX, sichtbarMax: VIS_MAX },
  hinweise: {
    normalmap: 'prozedural erzeugt (Plattenfugen, Nieten, Kratzer), kein Highpoly-Bake',
    materialien: 'M_Hull (Lack, dielektrisch, gekachelte Lacktextur mit Abrieb), M_Metal (blankes Tragwerk, metallisch 0,92) – getrennt, weil ein gemeinsamer Atlas die 10–13-m-Kachelung der Box-Projektion verliert und Metallizität nicht je Ecke geht: +1 Drawcall je Rumpf. M_Glass, M_Glow (auch Triebwerke), M_LaserLens (models.js färbt die Linse je Laserstufe über emissiveMap), zwei Wappenflächen (rechter Clanplatz austauschbar). M_Warn entfällt (Warnstreifen sind jetzt Geometrie).',
    drawcalls: 'Rumpf 4 + Triebwerke 1 + Wappen 2 + je Laser 2 + je Generator 2 (Laser/Generatoren sind einzeln schaltbare Knoten für die Bestückung)',
    extras: 'Zweite glTF-Szene „Extras“ (nicht Standardszene, wird von GLTFLoader.scene nicht angezeigt): Hull_LOD1 (~50 %), Hull_LOD2 (~20 %), COL_Hull, CAP_Laser_NN, CAP_Gen_NN – Kappen per Bestückung einblenden.',
  },
  dateien: [],
};
let failed = 0;
for (const sid of Object.keys(BUILDERS)) {
  if (ONLY && !ONLY.includes(sid)) continue;
  for (const fk of ['europa', 'saturn', 'eris']) {
    if (ONLY_F && !ONLY_F.includes(fk)) continue;
    const S = BUILDERS[sid](FAC[fk]);
    const [nl, ng] = STATS[sid];
    if (S.lasers.length !== nl || S.gens.length !== ng) throw new Error(`${sid}: ${S.lasers.length}/${S.gens.length} statt ${nl}/${ng}`);
    const file = path.join(OUT, `${fk}-schiff${S.no}.glb`);
    const counts = await exportShip(S, file);
    const v = await verify(file, S);
    const kb = fs.statSync(file).size / 1024;
    const ok = v.lod.LOD0 <= HULL_BUDGET[sid] && v.tri < VIS_MAX && v.laserTri <= 1200 && v.genTri <= 600 && v.lod.COL <= 300 && kb < KB_MAX && !v.missing.length && !v.leaked.length && !v.bad && !v.zero;
    if (!ok) failed++;
    const entry = {
      datei: `public/models/${fk}-schiff${S.no}.glb`, schiff: sid, fraktion: fk, laser: nl, generatoren: ng, kb: +kb.toFixed(1),
      dreieckeSichtbar: v.tri, lodDreiecke: v.lod, laserModulDreiecke: v.laserTri, generatorModulDreiecke: v.genTri, drawcalls: v.drawcalls, fassungsMassstab: S.K,
      teile: counts, masse_m: { breite: v.dims[0], hoehe: v.dims[1], laenge: v.dims[2] }, materialien: v.materials, texturen: v.tex,
      nullflaechen: v.zero, ungueltigeKoordinaten: v.bad, fehlendeKnoten: v.missing, sichtbareExtras: v.leaked,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), ok,
    };
    manifest.dateien.push(entry);
    console.log(`${ok ? 'OK ' : 'XX '} ${entry.datei.padEnd(34)} ${String(entry.kb).padStart(7)} KB  Rumpf ${String(v.lod.LOD0).padStart(6)} (LOD1 ${v.lod.LOD1}, LOD2 ${v.lod.LOD2}, COL ${v.lod.COL})  sichtbar ${v.tri}  L×B×H ${v.dims[2]}×${v.dims[0]}×${v.dims[1]} m  DC ${v.drawcalls}${v.zero ? `  Nullflächen ${v.zero}` : ''}${v.missing.length ? '  FEHLT ' + v.missing.join(',') : ''}${v.leaked.length ? '  SICHTBAR ' + v.leaked.join(',') : ''}`);
  }
}
// Manifest: Einträge dieser Läufe ersetzen gleichnamige ältere (Teilläufe mit --nur/--fraktion bleiben vollständig)
const mfFile = path.join(HERE, 'schiffe-manifest.json');
let old = [];
try { old = JSON.parse(fs.readFileSync(mfFile, 'utf8')).dateien || []; } catch { /* erster Lauf */ }
const done = new Set(manifest.dateien.map((d) => d.datei));
manifest.dateien = [...old.filter((d) => !done.has(d.datei) && d.lodDreiecke), ...manifest.dateien].sort((a, b) => a.schiff.localeCompare(b.schiff) || a.fraktion.localeCompare(b.fraktion));
fs.writeFileSync(mfFile, JSON.stringify(manifest, null, 2));
fs.rmSync(TMP, { recursive: true, force: true });
if (failed) { console.error(`${failed} Datei(en) außerhalb des Budgets oder unvollständig`); process.exit(1); }
