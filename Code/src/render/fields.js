// Kulissen-Felder je Sektor (ohne Spiellogik, nur Optik):
//   asteroids  instanzierte Felsbrocken verschiedener Form und Größe, drehen sich langsam (im Shader), mit Staub
//   debris     Trümmerfeld: Rumpfplatten, Träger, Container in Frachtfarben, glimmende Kabelenden
//   nebula     Nebeltasche: mehrere gestaffelte Schleier mit Rauschen (wirkt räumlich), helle Knoten
// dazu ein bis zwei große Wracks als Landmarken.
// Quelle: sector.fields [{ x, z, r, type }]. Fehlt die Liste, wird sie deterministisch aus der Sektor-ID erzeugt.
// Alles einmal je Sektor gebaut; pro Bild nur gemeinsame Uniforms (Zeit). Felder außerhalb des Bildes
// verwirft three.js über die Hüllkugel (frustum culling) je Feld.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng, hashString } from './textures.js';
import { BOX, CYL, T, Parts, setAO } from './geo.js';

const TYPES = ['asteroids', 'debris', 'nebula'];

// Felsbrocken: Ikosaeder mit Rauschen und Kratern, glatte Normalen, dunkle Vertiefungen als Vertex-Farbe
export function rockGeometry(seed, detail = 2, stretch = 1) {
  const R = rng(seed * 7919 + 17);
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position;
  const k = [R() * 9, R() * 9, R() * 9, R() * 9, R() * 9];
  const craters = [];
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2, b = Math.acos(R() * 2 - 1);
    craters.push([Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a), 0.25 + R() * 0.35, 0.08 + R() * 0.1]);
  }
  const sx = 0.8 + R() * 0.5 * stretch, sy = 0.6 + R() * 0.35, sz = 0.85 + R() * 0.4;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let n = 1 + 0.22 * Math.sin(x * 2.1 + k[0]) * Math.cos(y * 2.4 + k[1])
      + 0.11 * Math.sin(z * 4.3 + k[2]) * Math.sin(x * 3.7 + k[3])
      + 0.05 * Math.sin(y * 9.1 + k[4]) * Math.cos(z * 8.3 + k[0]);
    let dark = 0;
    for (const c of craters) {
      const d = Math.hypot(x - c[0], y - c[1], z - c[2]) / c[3];
      if (d < 1.25) {
        const bowl = d < 1 ? -(1 - d * d) : 0;
        const rim = Math.exp(-((d - 1.05) ** 2) / 0.02) * 0.4;
        n += (bowl + rim) * c[4];
        if (d < 1) dark = Math.max(dark, (1 - d) * 0.6);
      }
    }
    p.setXYZ(i, x * n * sx, y * n * sy, z * n * sz);
    const v = 1 - dark * 0.55 - Math.max(0, 1.05 - n) * 0.6;
    col[i * 3] = v; col[i * 3 + 1] = v * 0.98; col[i * 3 + 2] = v * 0.95;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Material mit Drehung je Instanz im Vertex-Shader (Attribut aSpin = Achse xyz, Winkeltempo w)
export function spinMaterial(opts, uTime) {
  const m = new THREE.MeshStandardMaterial(opts);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = `attribute vec4 aSpin; uniform float uTime;
vec3 lsRot(vec3 v, vec3 a, float t) { float c = cos(t), s = sin(t); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = lsRot(objectNormal, aSpin.xyz, uTime * aSpin.w);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = lsRot(transformed, aSpin.xyz, uTime * aSpin.w);');
  };
  m.customProgramCacheKey = () => 'lsSpin' + (opts.vertexColors ? 'C' : '');
  return m;
}

const DUST_VS = /* glsl */`
attribute float aSize; attribute vec3 aCol; attribute float aRate; attribute float aPhase;
uniform float uScale; uniform float uTime;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.xz += vec2(sin(uTime * 0.05 + aPhase * 6.0), cos(uTime * 0.04 + aPhase * 5.0)) * 6.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 64.0);
  float b = 1.0;
  if (aRate > 0.0) { float f = fract(uTime * aRate + aPhase); b = 0.25 + 0.75 * smoothstep(0.5, 0.0, abs(f - 0.15) * 3.0); }
  vCol = aCol * b;
}`;
const DUST_FS = /* glsl */`
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
  float a = exp(-d * 3.5) * 0.7 + exp(-d * 30.0) * 0.5;
  gl_FragColor = vec4(vCol * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Nebeltasche in EINEM Durchgang: eine Fläche oben, darunter liegende Schichten werden über den Sichtstrahl
// (Kamera → Punkt) in ihrer eigenen Tiefe abgetastet. Dadurch Parallaxe und Räumlichkeit wie bei gestapelten
// Schleiern, aber nur ein Vollbild-Durchgang statt vier.
const NEB_VS = /* glsl */`
varying vec2 vW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const NEB_FS = /* glsl */`
uniform sampler2D tN; uniform vec3 uA, uB; uniform float uTime, uTop, uR, uN;
uniform vec2 uCtr; uniform vec4 uY, uK, uSeed;
varying vec2 vW;
vec3 layer(vec2 w, float k, float sd, float n3) {
  vec2 q = (w - uCtr) / uR;
  float d = length(q);
  if (d > 1.3) return vec3(0.0);
  vec2 s = w / 4200.0 + sd;
  float n1 = texture2D(tN, s + vec2(uTime * 0.0012, -uTime * 0.0009)).r;
  float n2 = texture2D(tN, s * 2.1 - vec2(uTime * 0.002, uTime * 0.0007) + 0.31).r;
  float edge = smoothstep(1.0, 0.15, d + (n1 - 0.5) * 1.1);
  float dens = smoothstep(0.3, 0.95, n1 * 0.7 + n2 * 0.45 + n3 * 0.12 - 0.1) * edge;
  float lane = smoothstep(0.42, 0.5, n2) * smoothstep(0.62, 0.5, n2);
  dens *= 1.0 - lane * 0.55;
  vec3 c = mix(uA, uB, smoothstep(0.3, 0.75, n2 + n3 * 0.3)) * dens * dens * k;
  c += uB * pow(max(0.0, n3 - 0.6) * 2.5, 3.0) * edge * k * 0.6;
  return c;
}
vec2 at(float y) { float t = (cameraPosition.y - y) / max(1.0, cameraPosition.y - uTop); return cameraPosition.xz + (vW - cameraPosition.xz) * t; }
void main() {
  // feines Detail nur einmal je Pixel abtasten, alle Schichten teilen es
  float n3 = texture2D(tN, vW / 980.0 + vec2(0.0, uTime * 0.003) + 0.77).r;
  vec3 c = layer(at(uY.x), uK.x, uSeed.x, n3);
  if (uN > 1.5) c += layer(at(uY.y), uK.y, uSeed.y, n3) * 0.9;
  if (uN > 2.5) c += layer(at(uY.z), uK.z, uSeed.z, n3) * 0.8;
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

let _nebTex = null;
function nebulaNoise() {
  if (_nebTex) return _nebTex;
  // kachelbares Wertrauschen (4 Oktaven) einmal je Sitzung
  const S = 128, P = 8;
  const h = (x, y, o) => { let v = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(o, 1442695041); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967295; };
  const vn = (x, y, per, o) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = ((ix % per) + per) % per, x1 = (x0 + 1) % per, y0 = ((iy % per) + per) % per, y1 = (y0 + 1) % per;
    const a = h(x0, y0, o), b = h(x1, y0, o), c = h(x0, y1, o), d = h(x1, y1, o);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, amp = 0.5, f = 1, nn = 0;
    for (let o = 0; o < 4; o++) { s += amp * vn(x / S * P * f, y / S * P * f, P * f, o * 31 + 7); nn += amp; amp *= 0.5; f *= 2; }
    const v = Math.max(0, Math.min(255, (s / nn) * 255));
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  _nebTex = t;
  return t;
}

// Felder: vorgegebene Liste prüfen oder aus der Sektor-ID erzeugen
export function sectorFields(world, size) {
  const sec = world.sector || {};
  const list = [];
  if (Array.isArray(sec.fields) && sec.fields.length) {
    for (const f of sec.fields) {
      if (!f) continue;
      const type = TYPES.includes(f.type) ? f.type : 'asteroids';
      const r = Math.max(120, Math.min(4000, +f.r || 600));
      list.push({ x: +f.x || 0, z: +f.z || 0, r, type });
    }
    return list;
  }
  const R = rng(hashString('fields:' + (sec.id || 'X')));
  const avoid = [];
  world.entities?.forEach((e) => { if (e.kind === 'station' || e.kind === 'portal') avoid.push([e.x || 0, e.z || 0, e.kind === 'station' ? 900 : 520]); });
  const n = Math.min(10, 3 + Math.floor(size / 1800));
  const start = (R() * 3) | 0;
  for (let tries = 0; list.length < n && tries < 200; tries++) {
    const r = (380 + R() * 520) * Math.min(1.6, Math.max(1, size / 4000));
    const x = (R() * 2 - 1) * (size - r * 0.6), z = (R() * 2 - 1) * (size - r * 0.6);
    let ok = true;
    for (const a of avoid) if (Math.hypot(x - a[0], z - a[1]) < a[2] + r * 0.6) ok = false;
    for (const f of list) if (Math.hypot(x - f.x, z - f.z) < (f.r + r) * 0.9) ok = false;
    if (ok) list.push({ x, z, r, type: TYPES[(start + list.length) % 3] });
  }
  return list;
}

// opts: { world, size, seed, quality, uTime, uScale (Punktmaßstab), rock (Farbe), moodA, moodB }
export function buildFields(opts, keep) {
  const { world, size, quality: q, uTime, uScale } = opts;
  const group = new THREE.Group();
  group.name = 'fields';
  const fields = sectorFields(world, size);
  const seed = opts.seed;
  const dens = q >= 2 ? 1 : q === 1 ? 0.65 : 0.35;

  // gemeinsame Geometrien/Materialien für diesen Sektor
  const rockGeos = [rockGeometry(seed + 1, 2, 1), rockGeometry(seed + 2, 2, 1.6), rockGeometry(seed + 3, 1, 1.2), rockGeometry(seed + 4, 1, 2)].map(keep);
  const rockMat = keep(spinMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0.1, vertexColors: true, flatShading: true, envMapIntensity: 0.5 }, uTime));
  const scrapMat = keep(spinMaterial({ color: 0x4a4b52, roughness: 0.5, metalness: 0.75, envMapIntensity: 0.9, flatShading: true }, uTime));
  const boxGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const ribGeo = keep(new THREE.CylinderGeometry(1, 1, 1, 6, 1));
  const cableMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const dustMat = keep(new THREE.ShaderMaterial({
    uniforms: { uScale, uTime }, vertexShader: DUST_VS, fragmentShader: DUST_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const nebGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
  const tN = nebulaNoise();

  const m = new THREE.Matrix4(), qu = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const c = new THREE.Color(), c2 = new THREE.Color();
  const spinAttr = (n, R, rate) => {
    const a = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1).normalize();
      a[i * 4] = p.x; a[i * 4 + 1] = p.y; a[i * 4 + 2] = p.z; a[i * 4 + 3] = (R() - 0.5) * 2 * rate;
    }
    return new THREE.InstancedBufferAttribute(a, 4);
  };
  // eigene Geometrie je Feld (teilt die Vertex-Puffer, nur die Instanz-Drehung ist eigen)
  const shareGeo = (src, n, R, rate) => {
    const g = new THREE.BufferGeometry();
    for (const k in src.attributes) g.setAttribute(k, src.attributes[k]);
    if (src.index) g.setIndex(src.index);
    g.setAttribute('aSpin', spinAttr(n, R, rate));
    return keep(g);
  };
  const finishMesh = (mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    // Drehung im Shader kann über die Hülle ragen: großzügig erweitern
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 140;
    group.add(mesh);
    return mesh;
  };
  const points = (arr, order = 7) => {
    const n = arr.size.length;
    if (!n) return null;
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr.pos), 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(arr.col), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(arr.size), 1));
    g.setAttribute('aRate', new THREE.BufferAttribute(new Float32Array(arr.rate), 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(arr.phase), 1));
    g.computeBoundingSphere();
    const pts = new THREE.Points(g, dustMat);
    pts.renderOrder = order;
    group.add(pts);
    return pts;
  };
  const newPts = () => ({ pos: [], col: [], size: [], rate: [], phase: [] });

  const out = { asteroids: 0, debris: 0, nebula: 0, rocks: 0 };
  fields.forEach((F, fi) => {
    const R = rng(hashString(`${seed}:${fi}:${F.type}`));
    const r = F.r;
    out[F.type]++;
    if (F.type === 'asteroids') {
      // In Zellen (700 m) aufgeteilt, damit three.js Teile außerhalb des Bildes verwirft.
      // Dichte mit Klumpen und Lücken (Wellenmuster), zum Rand hin ausdünnend.
      const CELL = 700;
      const k1 = R() * 6, k2 = R() * 6, k3 = R() * 6;
      const clump = (x, z) => {
        const u = (x - F.x) / 520, w = (z - F.z) / 520;
        const v = Math.sin(u * 1.3 + k1) * Math.cos(w * 1.1 + k2) + 0.6 * Math.sin((u + w) * 2.3 + k3);
        return Math.max(0, Math.min(1, 0.45 + v * 0.45));
      };
      // Brocken je m² (klein: Detail 1, groß: Detail 2)
      const VD = [1 / 80000, 1 / 95000, 1 / 11000, 1 / 13000].map((d) => d * dens);
      const nx = Math.ceil((2 * r) / CELL);
      for (let cx = 0; cx < nx; cx++) for (let cz = 0; cz < nx; cz++) {
        const x0 = F.x - r + cx * CELL, z0 = F.z - r + cz * CELL;
        // Zelle ganz außerhalb des Kreises überspringen
        const mx = Math.max(x0, Math.min(F.x, x0 + CELL)), mz = Math.max(z0, Math.min(F.z, z0 + CELL));
        if (Math.hypot(mx - F.x, mz - F.z) > r) continue;
        for (let vi = 0; vi < 4; vi++) {
          const want = Math.round(CELL * CELL * VD[vi]);
          const xs = [];
          for (let t = 0; t < want * 2 && xs.length < want * 3; t++) {
            const x = x0 + R() * CELL, z = z0 + R() * CELL;
            const d = Math.hypot(x - F.x, z - F.z) / r;
            if (d > 1) continue;
            const pk = clump(x, z) * (1 - Math.pow(d, 3)) * 1.6;
            if (R() > pk) continue;
            xs.push(x, z, d);
          }
          const n = xs.length / 3;
          if (!n) continue;
          const mesh = new THREE.InstancedMesh(shareGeo(rockGeos[vi], n, R, vi < 2 ? 0.08 : 0.25), rockMat, n);
          for (let i = 0; i < n; i++) {
            const x = xs[i * 3], z = xs[i * 3 + 1], d = xs[i * 3 + 2];
            const big = vi < 2 && R() < 0.35;
            const sc = big ? 22 + Math.pow(R(), 2) * 40 : 2 + Math.pow(R(), 2.6) * (vi < 2 ? 16 : 9);
            // flache Scheibe unter der Spielebene; große Brocken tief, kleine auch nahe der Ebene
            const y = big ? -260 - R() * 260 : -14 - R() * 230 - (1 - d) * 30;
            e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
            mesh.setMatrixAt(i, m.compose(p.set(x, y, z), qu, s.set(sc, sc * (0.8 + R() * 0.4), sc)));
            // Farbe je Brocken: grau, braun, rötlich, manche fast schwarz (Kohlenstoff)
            const t = R();
            c.copy(opts.rock).multiplyScalar(t < 0.2 ? 0.45 : 0.75 + R() * 0.5);
            if (t > 0.85) c.lerp(c2.setRGB(0.55, 0.42, 0.34), 0.5); else if (t > 0.7) c.lerp(c2.setRGB(0.5, 0.5, 0.52), 0.6);
            mesh.setColorAt(i, c);
          }
          out.rocks += n;
          finishMesh(mesh);
        }
      }
      // Staub und Eiskristalle im Feld
      const D = newPts();
      const nd = Math.round(Math.min(2200, r * r / 3000) * dens);
      for (let i = 0; i < nd; i++) {
        const a = R() * Math.PI * 2, d = Math.pow(R(), 0.6) * r * 1.05;
        const x = F.x + Math.cos(a) * d, z = F.z + Math.sin(a) * d;
        if (R() > 0.25 + clump(x, z)) continue;
        D.pos.push(x, -10 - R() * 260, z);
        const b = 0.05 + R() * 0.09;
        c.copy(opts.rock).lerp(opts.moodA, 0.35);
        D.col.push(c.r * b * 3, c.g * b * 3, c.b * b * 3);
        D.size.push(4 + Math.pow(R(), 3) * 22);
        D.rate.push(R() < 0.06 ? 0.15 + R() * 0.2 : 0); D.phase.push(R());
      }
      points(D, 8);
    } else if (F.type === 'debris') {
      // Rumpfplatten, Träger, Container
      const A = r * r / 1e4;
      const nP = Math.round(Math.min(520, A * 0.9) * dens), nG = Math.round(Math.min(260, A * 0.45) * dens), nC = Math.round(Math.min(220, A * 0.35) * dens);
      const plates = new THREE.InstancedMesh(shareGeo(boxGeo, nP, R, 0.12), scrapMat, nP);
      const ax = R() * Math.PI;
      const place = (d0) => {
        const t = (R() - 0.5) * 2 * r, off = (R() - 0.5) * r * d0;
        return [F.x + Math.cos(ax) * t - Math.sin(ax) * off, F.z + Math.sin(ax) * t + Math.cos(ax) * off];
      };
      for (let i = 0; i < nP; i++) {
        const [x, z] = place(0.8);
        e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
        plates.setMatrixAt(i, m.compose(p.set(x, -25 - R() * 200, z), qu, s.set(8 + R() * 30, 0.8 + R() * 1.5, 6 + R() * 22)));
      }
      finishMesh(plates);
      const girders = new THREE.InstancedMesh(shareGeo(ribGeo, nG, R, 0.15), scrapMat, nG);
      for (let i = 0; i < nG; i++) {
        const [x, z] = place(0.6);
        e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
        const w = 1 + R() * 2;
        girders.setMatrixAt(i, m.compose(p.set(x, -30 - R() * 190, z), qu, s.set(w, 25 + R() * 70, w)));
      }
      finishMesh(girders);
      const contMat = keep(spinMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.45, envMapIntensity: 0.7 }, uTime));
      const cont = new THREE.InstancedMesh(shareGeo(boxGeo, nC, R, 0.1), contMat, nC);
      const CC = [0xb0482a, 0x2f6a8e, 0xc8a038, 0x5e6a3a, 0x8a8f96, 0x9a3a5a];
      for (let i = 0; i < nC; i++) {
        const [x, z] = place(0.5);
        e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
        const L = R() < 0.5 ? 24 : 12;
        cont.setMatrixAt(i, m.compose(p.set(x, -20 - R() * 160, z), qu, s.set(L, 7, 7)));
        cont.setColorAt(i, c.setHex(CC[(R() * CC.length) | 0]).multiplyScalar(0.55 + R() * 0.3));
      }
      finishMesh(cont);
      // glimmende Kabel: dünne leuchtende Stränge, dazu flackernde Funken an den Enden
      const nK = Math.round(Math.min(120, A * 0.2) * dens);
      const cables = new THREE.InstancedMesh(boxGeo, cableMat, Math.max(1, nK));
      const D = newPts();
      for (let i = 0; i < nK; i++) {
        const [x, z] = place(0.6);
        const y = -40 - R() * 140;
        e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
        const L = 14 + R() * 30;
        cables.setMatrixAt(i, m.compose(p.set(x, y, z), qu, s.set(0.35, 0.35, L)));
        const hot = R() < 0.6;
        cables.setColorAt(i, hot ? c.setRGB(2.4, 0.9, 0.25) : c.setRGB(0.5, 1.4, 2.6));
        // Funken am Ende
        p.set(0, 0, L * 0.5).applyQuaternion(qu);
        D.pos.push(x + p.x, y + p.y, z + p.z);
        if (hot) D.col.push(2.2, 1.0, 0.35); else D.col.push(0.7, 1.4, 2.4);
        D.size.push(6 + R() * 6); D.rate.push(0.6 + R() * 1.8); D.phase.push(R());
      }
      cables.count = nK;
      if (nK) finishMesh(cables);
      // schwacher Rauch/Staub
      const nd = Math.round(Math.min(900, A * 1.2) * dens);
      for (let i = 0; i < nd; i++) {
        const [x, z] = place(0.9);
        D.pos.push(x, -20 - R() * 200, z);
        const b = 0.03 + R() * 0.05;
        D.col.push(b * 2.2, b * 2.0, b * 1.8);
        D.size.push(8 + R() * 26); D.rate.push(0); D.phase.push(R());
      }
      points(D, 8);
    } else {
      // Nebeltasche: gestaffelte Schleier, Farbe aus der Sektorstimmung, je Tasche leicht verschoben
      const hue = R();
      const A = opts.moodA.clone().lerp(new THREE.Color().setHSL(hue, 0.7, 0.5), 0.35);
      const B = opts.moodB.clone().lerp(new THREE.Color().setHSL((hue + 0.15) % 1, 0.8, 0.55), 0.5);
      const layers = q >= 2 ? 3 : q === 1 ? 2 : 1;
      // Fläche liegt unter der Spielebene (Schiffe bleiben ungetrübt), die oberste Schicht wird trotzdem bei +28 m abgetastet
      const top = -60;
      const ys = [28, -120, -260, -300];
      const mat = keep(new THREE.ShaderMaterial({
        uniforms: {
          tN: { value: tN }, uA: { value: A }, uB: { value: B }, uTime, uTop: { value: top }, uR: { value: r }, uN: { value: layers },
          uCtr: { value: new THREE.Vector2(F.x, F.z) }, uY: { value: new THREE.Vector4(...ys) },
          uK: { value: new THREE.Vector4(0.06, 0.15, 0.15, 0) }, uSeed: { value: new THREE.Vector4(R() * 10, R() * 10, R() * 10, R() * 10) },
        },
        vertexShader: NEB_VS, fragmentShader: NEB_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const mesh = new THREE.Mesh(nebGeo, mat);
      mesh.position.set(F.x, top, F.z);
      mesh.scale.set(r * 1.3, 1, r * 1.3);
      mesh.renderOrder = -6;
      mesh.frustumCulled = true;
      group.add(mesh);
      // helle Knoten (junge Sterne) und Funkeln
      const D = newPts();
      const nk = Math.round(40 * dens);
      for (let i = 0; i < nk; i++) {
        const a = R() * Math.PI * 2, d = Math.pow(R(), 0.8) * r * 0.8;
        D.pos.push(F.x + Math.cos(a) * d, -60 - R() * 220, F.z + Math.sin(a) * d);
        const k = 0.3 + R() * 0.7;
        c.copy(R() < 0.5 ? A : B).lerp(c.setRGB(1, 1, 1), 0.4);
        D.col.push(c.r * k * 1.6, c.g * k * 1.6, c.b * k * 1.6);
        D.size.push(5 + Math.pow(R(), 4) * 50); D.rate.push(R() < 0.25 ? 0.1 + R() * 0.2 : 0); D.phase.push(R());
      }
      points(D, 7);
    }
  });

  // Landmarken: große Wracks (ein Schlachtschiff-Rumpf, in Teile zerbrochen), tief unter der Ebene
  const RL = rng(hashString('landmark:' + seed));
  const nL = size > 3500 ? 2 : 1;
  const old = setAO(0.45);
  const F_ = opts.factory;
  const wreckMat = {
    // Rumpf mit Plattenfugen, Schmutz und Kantenlicht (gleiches Material-System wie Stationen/Schiffe)
    hull: F_ ? F_.std('landmark:hull', { color: 0x3a3c42, metal: 0.7, rough: 0.5, panel: 0.06, lines: 0.5, grime: 0.6, wear: 1.2, rim: 0.14, tilt: 0.05, win: true, winX: 9, winY: 7, winCol: 0xffc890, winK: 0.9, winFill: 0.18 })
      : keep(new THREE.MeshStandardMaterial({ color: 0x2c2e34, metalness: 0.7, roughness: 0.5, flatShading: true, vertexColors: true, envMapIntensity: 0.6 })),
    win: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.75) })),
    burn: keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.8, 0.2) })),
  };
  const LP = newPts();
  const avoidL = fields.map((f) => [f.x, f.z, f.r]);
  world.entities?.forEach((en) => { if (en.kind === 'station' || en.kind === 'portal') avoidL.push([en.x || 0, en.z || 0, 700]); });
  for (let li = 0; li < nL; li++) {
    let x = 0, z = 0;
    for (let t = 0; t < 60; t++) {
      x = (RL() * 2 - 1) * size * 0.8; z = (RL() * 2 - 1) * size * 0.8;
      let ok = true;
      for (const a of avoidL) if (Math.hypot(x - a[0], z - a[1]) < a[2] + 300) ok = false;
      if (ok) break;
    }
    avoidL.push([x, z, 900]);
    const P = new Parts();
    // Bug-Sektion
    P.add('hull', T(BOX(), 0, 0, -200, 0, 0, 0, 90, 60, 260));
    P.add('hull', T(BOX(), 0, 38, -240, 0, 0, 0, 50, 24, 120));
    P.add('hull', T(BOX(), 0, -6, -360, 0, 0, 0, 60, 40, 60));
    // Heck-Sektion, abgeknickt
    P.add('hull', T(BOX(), 40, -30, 150, -0.12, 0.35, -0.18, 100, 66, 240));
    P.add('hull', T(BOX(), 60, 10, 240, -0.12, 0.35, -0.18, 70, 40, 80));
    for (const sx of [-1, 1]) P.add('hull', T(CYL(), 88 + sx * 26, -30, 300, Math.PI / 2 - 0.12, 0.35, 0, 18, 50, 18));
    // Aufbauten, Antennen, Geschütztürme
    for (let i = 0; i < 14; i++) {
      const z0 = -320 + RL() * 300, x0 = (RL() - 0.5) * 70;
      P.add('hull', T(BOX(), x0, 32 + RL() * 10, z0, 0, 0, 0, 8 + RL() * 18, 6 + RL() * 10, 10 + RL() * 24));
    }
    for (let i = 0; i < 5; i++) P.add('hull', T(CYL(), (RL() - 0.5) * 60, 50, -300 + RL() * 220, 0, 0, 0, 1.2, 20 + RL() * 30, 1.2));
    for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) P.add('hull', T(BOX(), sx * 47, (RL() - 0.5) * 30, -320 + i * 45, 0, 0, 0, 4, 10, 30));
    // Rippen am Bruch
    for (let i = 0; i < 9; i++) P.add('hull', T(BOX(), (RL() - 0.5) * 110, (RL() - 0.5) * 60, -40 + RL() * 80, RL(), RL(), RL(), 5, 5, 40 + RL() * 70));
    // Fensterbänder
    for (let i = 0; i < 6; i++) P.add('win', T(BOX(), 46, 8 - i * 7, -230 + (i % 3) * 30, 0, 0, 0, 1, 1.4, 50 + RL() * 40));
    for (let i = 0; i < 4; i++) P.add('win', T(BOX(), -46, 14 - i * 8, -180 - i * 22, 0, 0, 0, 1, 1.4, 40));
    // glühende Bruchkanten
    for (let i = 0; i < 6; i++) P.add('burn', T(BOX(), (RL() - 0.5) * 80, (RL() - 0.5) * 50, -60 + RL() * 20, RL(), RL(), RL(), 4, 4, 10 + RL() * 18));
    const geos = P.merge();
    const lm = new THREE.Group();
    for (const k in geos) { keep(geos[k]); lm.add(new THREE.Mesh(geos[k], wreckMat[k])); }
    lm.position.set(x, -330, z);
    lm.rotation.set((RL() - 0.5) * 0.3, RL() * Math.PI * 2, (RL() - 0.5) * 0.4);
    lm.scale.setScalar(1.2 + RL() * 0.5);
    group.add(lm);
    lm.updateMatrixWorld(true);
    // Blinklichter und Brandherde
    for (let i = 0; i < 8; i++) {
      p.set((RL() - 0.5) * 100, 30 + RL() * 20, -350 + RL() * 650).applyMatrix4(lm.matrixWorld);
      const fire = i < 3;
      LP.pos.push(p.x, p.y, p.z);
      if (fire) LP.col.push(2.6, 1.0, 0.3); else LP.col.push(2.0, 0.25, 0.15);
      LP.size.push(fire ? 40 + RL() * 30 : 12); LP.rate.push(fire ? 0.9 + RL() : 0.35 + RL() * 0.2); LP.phase.push(RL());
    }
  }
  setAO(old);
  points(LP, 7);

  return { group, fields, stats: out };
}
