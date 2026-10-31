// Geometrie-Helfer für prozedurale Modelle (nur beim Aufbau benutzt, nie pro Bild).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PI = Math.PI;
// ---------- Geometrie-Helfer (nur beim Aufbau, nie pro Bild) ----------
export const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
export const _up = new THREE.Vector3(0, 1, 0), _fz = new THREE.Vector3(0, 0, 1);

const prim = {};
export function P(key, make) { return prim[key] || (prim[key] = make()); }
export const BOX = () => P('box', () => new THREE.BoxGeometry(1, 1, 1));
export const CYL = () => P('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 16, 1));
export const CYL6 = () => P('cyl6', () => new THREE.CylinderGeometry(1, 1, 1, 6, 1));
export const SPH = () => P('sph', () => new THREE.SphereGeometry(1, 20, 14));
export const HALF = () => P('half', () => new THREE.SphereGeometry(1, 20, 10, 0, PI * 2, 0, PI / 2));
export const CONE = () => P('cone', () => new THREE.ConeGeometry(1, 1, 10, 1));
export const DISC = () => P('disc', () => new THREE.CircleGeometry(1, 24));
export const ICO = () => P('ico', () => new THREE.IcosahedronGeometry(1, 1));
export const TOR = (t) => P('tor' + t, () => new THREE.TorusGeometry(1, t, 8, 32));
export const NOZ = (r) => P('noz' + r, () => new THREE.CylinderGeometry(1, r, 1, 16, 1, true));

// Kontaktschatten als Vertex-Farbe: Unterseite jedes Teils dunkler (billige Umgebungsverdeckung).
// Stärke je Modellart: setAO(k) vor dem Aufbau, danach wieder zurücksetzen.
let AO = 0.25;
export function setAO(k) { const o = AO; AO = k; return o; }
function bakeAO(g) {
  if (g.attributes.color) return;
  const pos = g.attributes.position, n = pos.count;
  if (!g.boundingBox) g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, h = Math.max(1e-6, g.boundingBox.max.y - y0);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = (pos.getY(i) - y0) / h;
    const v = 1 - AO * Math.pow(1 - t, 1.6);
    c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
export function finish(g) {
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}
// Kopie einer Grundform mit Lage/Drehung/Größe
export function T(src, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = src.clone();
  bakeAO(g);
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return finish(g);
}
// Kopie, ausgerichtet entlang Richtung (dx,dy,dz); Grundform zeigt nach +y (Kegel) oder +z (Balken)
export function TQ(src, axis, x, y, z, dx, dy, dz, sx, sy, sz) {
  const g = src.clone();
  bakeAO(g);
  _a.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(axis, _a);
  _p.set(x, y, z); _s.set(sx, sy, sz);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return finish(g);
}
// Balken zwischen zwei Punkten
export function beam(ax, ay, az, bx, by, bz, w, h = w) {
  _a.set(ax, ay, az); _b.set(bx, by, bz);
  const len = _a.distanceTo(_b);
  return TQ(BOX(), _fz, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, bx - ax, by - ay, bz - az, w, h, len);
}
// Kegel/Stachel: Spitze zeigt in Richtung d
export function spike(x, y, z, dx, dy, dz, r, len) {
  _a.set(dx, dy, dz).normalize();
  return TQ(CONE(), _up, x + _a.x * len * 0.5, y + _a.y * len * 0.5, z + _a.z * len * 0.5, dx, dy, dz, r, len, r);
}
// Umriss von oben (x seitlich, y = nach vorn) → Körper, Bug nach −z, Höhe 0..depth
export function extrudeXZ(pts, depth, bevel = 0, segs = 1) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: segs, curveSegments: 4,
  });
  g.rotateX(-PI / 2);
  return g;
}
export function E(pts, depth, bevel, segs, y = 0, sx = 1, sy = 1, sz = 1) {
  const g = extrudeXZ(pts, depth, bevel, segs);
  const r = T(g, 0, y, 0, 0, 0, 0, sx, sy, sz);
  g.dispose();
  return r;
}
export function lathe(profile, segs = 16) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segs);
}

export class Parts {
  constructor() { this.s = {}; }
  add(slot, g) { (this.s[slot] || (this.s[slot] = [])).push(g); return this; }
  merge() {
    const out = {};
    for (const k in this.s) {
      const list = this.s[k];
      out[k] = mergeGeometries(list, false);
      out[k].computeBoundingSphere();
      for (const g of list) g.dispose();
    }
    return out;
  }
}

