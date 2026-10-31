// Statische Deko je Sektor, ohne Spiellogik: 2–3 Cluster aus Wrackteilen, kleinen Brocken und
// Navigationsbojen mit Blinklicht, dazu ferner Frachterverkehr als langsame Lichtpunkte auf festen Bahnen.
// Alles instanziert bzw. als ein Punkt-Draw-Call; Blinken und Bewegung rechnet der Shader (keine CPU pro Bild).
import * as THREE from 'three';
import { rng } from './textures.js';

const LIGHT_VS = /* glsl */`
attribute vec3 aCol; attribute float aSize; attribute float aPhase; attribute float aRate; attribute vec4 aLane;
uniform float uTime; uniform float uScale;
varying vec3 vCol; varying float vA;
void main() {
  vec3 p = position;
  // Frachter: aLane = (Richtung x, Richtung z, Tempo, Bahnlänge); Position läuft auf der Bahn hin und her
  if (aLane.w > 0.0) {
    float s = mod(uTime * aLane.z + aPhase * aLane.w, aLane.w) - 0.5 * aLane.w;
    p.xz += aLane.xy * s;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 7.0);
  float b = 1.0;
  if (aRate > 0.0) { float f = fract(uTime * aRate + aPhase); b = f < 0.08 ? 1.0 : 0.08; }
  vCol = aCol; vA = b;
}`;
const LIGHT_FS = /* glsl */`
varying vec3 vCol; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
  float a = (exp(-d * 6.0) + exp(-d * 40.0)) * vA;
  gl_FragColor = vec4(vCol * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function rockGeo(seed) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  const k = [r() * 9, r() * 9, r() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.72 + 0.22 * Math.sin(x * 3.3 + k[0]) * Math.cos(y * 2.9 + k[1]) + 0.12 * Math.sin(z * 6.1 + k[2]);
    p.setXYZ(i, x * n * 1.2, y * n * 0.8, z * n);
  }
  g.computeVertexNormals();
  return g;
}

export function buildDeco(world, size, seed, quality, uTime, keep) {
  const group = new THREE.Group();
  group.name = 'deco';
  const R = rng(4100 + seed * 7);
  // Sperrbereiche: Station, Tore, Kartenrand
  const avoid = [];
  world.entities?.forEach((e) => { if (e.kind === 'station' || e.kind === 'portal') avoid.push([e.x || 0, e.z || 0, e.kind === 'station' ? 750 : 450]); });
  const clusters = [];
  // größere Karten: mehr Cluster (2–3 bei 2400 m, bis 7 bei 8000 m)
  const nC = Math.min(7, 2 + (seed % 2) + Math.floor(Math.max(0, size - 2400) / 1500));
  for (let tries = 0; clusters.length < nC && tries < 80; tries++) {
    const x = (R() * 2 - 1) * size * 0.8, z = (R() * 2 - 1) * size * 0.8;
    let ok = true;
    for (const a of avoid) if (Math.hypot(x - a[0], z - a[1]) < a[2]) ok = false;
    for (const c of clusters) if (Math.hypot(x - c[0], z - c[1]) < 900) ok = false;
    if (ok) clusters.push([x, z, clusters.length % 3]);
  }

  const mScrap = keep(new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.75, roughness: 0.55, flatShading: true }));
  const mRock = keep(new THREE.MeshStandardMaterial({ color: 0x47423e, metalness: 0.1, roughness: 0.92, flatShading: true }));
  const mBuoy = keep(new THREE.MeshStandardMaterial({ color: 0x8c8f96, metalness: 0.7, roughness: 0.4 }));
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const cyl = keep(new THREE.CylinderGeometry(1, 1, 1, 8, 1));
  const rock = keep(rockGeo(seed + 3));
  const nScrap = 26 * clusters.length, nRock = (quality >= 1 ? 40 : 18) * clusters.length, nBuoy = 3 * clusters.length;
  const scrap = keep(new THREE.InstancedMesh(box, mScrap, Math.max(1, nScrap)));
  const rocks = keep(new THREE.InstancedMesh(rock, mRock, Math.max(1, nRock)));
  const buoys = keep(new THREE.InstancedMesh(cyl, mBuoy, Math.max(1, nBuoy * 2)));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const put = (mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) => {
    e.set(rx, ry, rz); q.setFromEuler(e); p.set(x, y, z); s.set(sx, sy, sz);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  };
  const lights = { pos: [], col: [], size: [], phase: [], rate: [], lane: [] };
  const light = (x, y, z, r, g, b, sz, ph, rate, lane) => {
    lights.pos.push(x, y, z); lights.col.push(r, g, b); lights.size.push(sz); lights.phase.push(ph); lights.rate.push(rate);
    lights.lane.push(...(lane || [0, 0, 0, 0]));
  };
  let iS = 0, iR = 0, iB = 0;
  for (const [cx, cz, kind] of clusters) {
    const y0 = -70 - R() * 60;
    // Wrackteile: Rumpfplatten und Träger eines zerbrochenen Frachters, entlang einer Achse verstreut
    const ax = R() * Math.PI;
    for (let k = 0; k < 26; k++) {
      const t = (R() - 0.5) * (kind === 0 ? 420 : 220), off = (R() - 0.5) * 120;
      const x = cx + Math.cos(ax) * t - Math.sin(ax) * off, z = cz + Math.sin(ax) * t + Math.cos(ax) * off;
      const girder = R() < 0.4;
      put(scrap, iS++, x, y0 + (R() - 0.5) * 60, z, R() * 3, R() * 3, R() * 3,
        girder ? 2 + R() * 2 : 6 + R() * 18, girder ? 2 + R() * 2 : 1 + R() * 2, girder ? 20 + R() * 40 : 5 + R() * 14);
    }
    // kleine Brocken
    const nr = nRock / clusters.length;
    for (let k = 0; k < nr; k++) {
      const a = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * (kind === 1 ? 420 : 300);
      const sc = 3 + Math.pow(R(), 3) * 16;
      put(rocks, iR++, cx + Math.cos(a) * d, y0 - 20 + (R() - 0.5) * 90, cz + Math.sin(a) * d, R() * 6, R() * 6, R() * 6, sc, sc, sc);
    }
    // Navigationsbojen: Mast + Fuß, weißes Blinklicht oben, rotes Dauerlicht unten
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + R(), d = 360 + R() * 80;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = -40;
      put(buoys, iB++, x, y, z, 0, 0, 0, 0.8, 22, 0.8);
      put(buoys, iB++, x, y - 10, z, 0, R(), 0, 3.2, 3, 3.2);
      light(x, y + 12, z, 1.3, 1.3, 1.25, 9, R(), 0.55, null);
      light(x, y - 8, z, 1.0, 0.18, 0.1, 5, 0, 0, null);
    }
  }
  scrap.count = iS; rocks.count = iR; buoys.count = iB;
  for (const mesh of [scrap, rocks, buoys]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh); }

  // Ferner Frachterverkehr: tief unter der Spielebene (langsame Parallaxe), Bug weiß, Heck rot blinkend
  const lanes = Math.round((quality >= 1 ? 7 : 4) * Math.min(2, Math.max(1, size / 3000)));
  for (let i = 0; i < lanes; i++) {
    const a = R() * Math.PI, dx = Math.cos(a), dz = Math.sin(a);
    const cx = (R() * 2 - 1) * size, cz = (R() * 2 - 1) * size, y = -650 - R() * 500;
    const len = size * (2.6 + R()), sp = 14 + R() * 22, ph = R();
    const lane = [dx, dz, sp, len];
    light(cx + dx * 26, y, cz + dz * 26, 1.1, 1.08, 1.0, 10, ph, 0, lane);
    light(cx - dx * 26, y, cz - dz * 26, 1.0, 0.25, 0.12, 8, ph, 0.4, lane);
    light(cx, y + 4, cz, 0.55, 0.62, 0.8, 6, ph, 0, lane);
  }
  const n = lights.size.length;
  const lg = keep(new THREE.BufferGeometry());
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lights.pos), 3));
  lg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(lights.col), 3));
  lg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(lights.size), 1));
  lg.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(lights.phase), 1));
  lg.setAttribute('aRate', new THREE.BufferAttribute(new Float32Array(lights.rate), 1));
  lg.setAttribute('aLane', new THREE.BufferAttribute(new Float32Array(lights.lane), 4));
  const lm = keep(new THREE.ShaderMaterial({
    uniforms: { uTime, uScale: { value: 800 } },
    vertexShader: LIGHT_VS, fragmentShader: LIGHT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const pts = new THREE.Points(lg, lm);
  pts.frustumCulled = false; pts.renderOrder = 6;
  if (n) group.add(pts);
  return { group, lightMat: lm };
}
