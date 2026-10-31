// Heimatstationen der Menü-Bühne (Hub): eigene, detailreiche Modelle statt der Spiel-Platzhalter.
//   EUROPA  Forschungsstation: Modulstapel, Gitterausleger mit Solarflügeln, Radiatoren, Laborröhren,
//           Bohrgestänge nach unten, Parabolantenne oben
//   SATURN  Handelsdock: drehender Segmentring mit Speichen, Nabe mit Containerregalen, Leitstand,
//           Dockgestänge mit Portalkran und halb gebautem Rumpf
//   ERIS    Gefängnisring: dunkler Achtkant-Monolith mit Zellenfenstern, Strebepfeiler, kantiger Zellenring,
//           Antennenwald, Eiszapfen
// Oberflächen: eine gemeinsame, einmal erzeugte Paneel-Textur (Ton, Rauheit, Fugen/Höhe + Normalen),
// dreiachsig projiziert. Kleinteile, Streben und Fenster als InstancedMesh. Fraktionsfarbe nur auf Streifen
// und Positionslichtern. Fenster leuchten über Bloom. Aufbau einmal je Fraktion, pro Bild nur update(t).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getGlowTexture } from '../render/textures.js';

const PI = Math.PI, TAU = PI * 2;
const FXC = { europa: 0xd8b25a, saturn: 0xe0782a, eris: 0x9a52ff };

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------------------------------------------------------------- Paneel-Textur (einmal, für alle Fraktionen)

let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const S = 1024;
  const R = rng(9137);
  const tone = new Float32Array(S * S).fill(0.5);
  const rough = new Float32Array(S * S).fill(0.5);
  const hgt = new Float32Array(S * S).fill(0.62);
  const rect = (arr, x, y, w, h, v) => {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(S, (x + w) | 0), y1 = Math.min(S, (y + h) | 0);
    for (let j = y0; j < y1; j++) { const o = j * S; for (let i = x0; i < x1; i++) arr[o + i] = v; }
  };
  const add = (arr, x, y, w, h, v) => {
    const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0), x1 = Math.min(S, (x + w) | 0), y1 = Math.min(S, (y + h) | 0);
    for (let j = y0; j < y1; j++) { const o = j * S; for (let i = x0; i < x1; i++) arr[o + i] += v; }
  };
  const outline = (x, y, w, h, v, t = 1) => {
    rect(hgt, x, y, w, t, v); rect(hgt, x, y + h - t, w, t, v); rect(hgt, x, y, t, h, v); rect(hgt, x + w - t, y, t, h, v);
  };
  const panel = (x, y, w, h) => {
    const r = R();
    const tv = r < 0.08 ? 0.3 + R() * 0.08 : r > 0.94 ? 0.7 + R() * 0.08 : 0.43 + R() * 0.16;
    const lv = R() < 0.18 ? 0.55 : R() < 0.2 ? 0.7 : 0.62;
    rect(tone, x, y, w, h, tv);
    rect(rough, x, y, w, h, 0.32 + R() * 0.36);
    rect(hgt, x, y, w, h, lv);
    // Schmutzfahnen nach unten
    if (R() < 0.35) for (let k = 0; k < 3; k++) { const sx = x + R() * w, sw = 2 + R() * 10; add(tone, sx, y, sw, h * (0.4 + R() * 0.6), -0.03 - R() * 0.04); }
    // Fuge
    outline(x, y, w, h, 0.22, 2);
    outline(x + 2, y + 2, w - 4, h - 4, lv + 0.04, 1);
    // Nieten an langen Kanten
    if (R() < 0.45 && w > 60) for (let i = x + 8; i < x + w - 6; i += 10) { rect(hgt, i, y + 5, 2, 2, lv + 0.12); rect(hgt, i, y + h - 7, 2, 2, lv + 0.12); }
    const d = R();
    if (d < 0.22 && w > 70 && h > 50) {
      // Wartungsklappe mit Griff
      const hw = 24 + R() * Math.min(60, w - 40), hh = 18 + R() * Math.min(40, h - 34);
      const hx = x + 10 + R() * (w - hw - 20), hy = y + 10 + R() * (h - hh - 20);
      outline(hx, hy, hw, hh, 0.3, 1);
      rect(hgt, hx + hw * 0.5 - 5, hy + hh - 7, 10, 3, lv + 0.1);
      rect(tone, hx + 2, hy + 2, hw - 4, hh - 4, tv + 0.04);
    } else if (d < 0.38 && w > 50 && h > 40) {
      // Lüftungsschlitze
      const n = 4 + ((R() * 6) | 0), vw = Math.min(w - 24, 30 + R() * 50);
      const vx = x + 12 + R() * (w - vw - 24), vy = y + 12 + R() * Math.max(0, h - n * 6 - 24);
      for (let k = 0; k < n; k++) { rect(hgt, vx, vy + k * 6, vw, 2, 0.28); rect(rough, vx, vy + k * 6, vw, 3, 0.8); }
    } else if (d < 0.46 && w > 60 && h > 30) {
      // Kennzeichnung: helle Farbfelder
      const mw = 14 + R() * 30, mh = 5 + R() * 8;
      const mx = x + 8 + R() * (w - mw - 16), my = y + 8 + R() * (h - mh - 16);
      rect(tone, mx, my, mw, mh, 0.86);
      if (R() < 0.5) rect(tone, mx + mw + 4, my, mh, mh, 0.86);
    } else if (d < 0.56 && w > 40 && h > 40) {
      // aufgesetzte Platte
      const px = x + 6 + R() * 10, py = y + 6 + R() * 10, pw = w - (px - x) * 2, ph = h - (py - y) * 2;
      if (pw > 16 && ph > 16) { rect(hgt, px, py, pw, ph, lv + 0.07); outline(px, py, pw, ph, lv - 0.08, 1); }
    }
  };
  const split = (x, y, w, h, depth) => {
    const stop = (w < 72 && h < 72) || (depth > 3 && R() < 0.3) || depth > 7;
    if (stop) { panel(x, y, w, h); return; }
    const vert = w > h ? R() < 0.8 : R() < 0.2;
    if (vert && w >= 48) { const c = Math.round((w * (0.3 + R() * 0.4)) / 8) * 8; split(x, y, c, h, depth + 1); split(x + c, y, w - c, h, depth + 1); }
    else if (h >= 48) { const c = Math.round((h * (0.3 + R() * 0.4)) / 8) * 8; split(x, y, w, c, depth + 1); split(x, y + c, w, h - c, depth + 1); }
    else panel(x, y, w, h);
  };
  split(0, 0, S, S, 0);
  // großflächige Ton-Schwankung (kachelbar) und Körnung
  const G = 16, lat = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) lat[i] = R() - 0.5;
  const sm = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(S * S * 4), nrm = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) {
    const gy = (j / S) * G, iy = gy | 0, fy = sm(gy - iy);
    for (let i = 0; i < S; i++) {
      const gx = (i / S) * G, ix = gx | 0, fx = sm(gx - ix);
      const a = lat[iy * G + ix], b = lat[iy * G + (ix + 1) % G], c = lat[((iy + 1) % G) * G + ix], d = lat[((iy + 1) % G) * G + (ix + 1) % G];
      const n = (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
      const o = j * S + i;
      const tv = tone[o] + n * 0.1 + (R() - 0.5) * 0.03;
      data[o * 4] = Math.max(0, Math.min(255, tv * 255));
      data[o * 4 + 1] = Math.max(0, Math.min(255, (rough[o] + (R() - 0.5) * 0.06) * 255));
      data[o * 4 + 2] = Math.max(0, Math.min(255, hgt[o] * 255));
      data[o * 4 + 3] = 255;
    }
  }
  const K = 5.5;
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const l = hgt[j * S + (i + S - 1) % S], r = hgt[j * S + (i + 1) % S];
      const dn = hgt[((j + S - 1) % S) * S + i], up = hgt[((j + 1) % S) * S + i];
      let nx = (l - r) * K, ny = (dn - up) * K;
      const len = Math.hypot(nx, ny, 1);
      nx /= len; ny /= len;
      const o = (j * S + i) * 4;
      nrm[o] = (nx * 0.5 + 0.5) * 255; nrm[o + 1] = (ny * 0.5 + 0.5) * 255; nrm[o + 2] = 255; nrm[o + 3] = 255;
    }
  }
  const tex = (arr) => {
    const t = new THREE.DataTexture(arr, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  ATLAS = { map: tex(data), nrm: tex(nrm) };
  return ATLAS;
}

// Solarzellen-Textur (UV), einmal
let SOLAR = null;
function solarTex() {
  if (SOLAR) return SOLAR;
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1a2436'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const v = 34 + ((x * 7 + y * 13) % 5) * 5;
    g.fillStyle = `rgb(${v * 0.6 | 0},${v * 0.9 | 0},${v * 1.7 | 0})`;
    g.fillRect(x * 64 + 3, y * 32 + 2, 58, 28);
  }
  g.fillStyle = 'rgba(190,200,215,0.55)';
  for (let x = 0; x <= 4; x++) g.fillRect(x * 64 - 1, 0, 2, 256);
  for (let y = 0; y <= 8; y++) g.fillRect(0, y * 32 - 1, 256, 1);
  g.fillStyle = 'rgba(160,170,190,0.18)';
  for (let x = 0; x < 256; x += 8) g.fillRect(x, 0, 1, 256);
  SOLAR = new THREE.CanvasTexture(c);
  SOLAR.colorSpace = THREE.SRGBColorSpace;
  SOLAR.wrapS = SOLAR.wrapT = THREE.RepeatWrapping;
  SOLAR.anisotropy = 8;
  return SOLAR;
}

// ---------------------------------------------------------------- Materialien

const TP_VERT_HEAD = 'varying vec3 vTP; varying vec3 vTN; varying vec3 vVX; varying vec3 vVY; varying vec3 vVZ;';
function hullMat(o) {
  const A = atlas();
  const m = new THREE.MeshStandardMaterial({
    color: o.color, metalness: o.metal ?? 0.5, roughness: o.rough ?? 0.5, envMapIntensity: o.env ?? 1,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide,
  });
  const ts = o.ts ?? 1 / 72, nk = o.nk ?? 1, tn = o.tone ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlas = { value: A.map }; sh.uniforms.uNrm = { value: A.nrm };
    sh.uniforms.uTS = { value: ts }; sh.uniforms.uNK = { value: nk }; sh.uniforms.uTone = { value: tn };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${TP_VERT_HEAD}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tpp = vec4(position, 1.0); vec3 tnn = normal;
        #ifdef USE_INSTANCING
          tpp = instanceMatrix * tpp; tnn = mat3(instanceMatrix) * tnn;
        #endif
        vTP = tpp.xyz; vTN = normalize(tnn);
        vVX = normalMatrix * vec3(1.0, 0.0, 0.0); vVY = normalMatrix * vec3(0.0, 1.0, 0.0); vVZ = normalMatrix * vec3(0.0, 0.0, 1.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uAtlas; uniform sampler2D uNrm; uniform float uTS; uniform float uNK; uniform float uTone;
        ${TP_VERT_HEAD}
        vec3 tpW; vec4 tpA; float tAO;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        tpW = pow(abs(normalize(vTN)), vec3(6.0)); tpW /= (tpW.x + tpW.y + tpW.z);
        vec3 tP = vTP * uTS;
        tpA = texture2D(uAtlas, tP.zy) * tpW.x + texture2D(uAtlas, tP.xz) * tpW.y + texture2D(uAtlas, tP.xy) * tpW.z;
        tAO = smoothstep(0.16, 0.56, tpA.b);
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * tpA.r, uTone) * mix(0.32, 1.0, tAO);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.5 + tpA.g) + (1.0 - tAO) * 0.3, 0.04, 1.0);`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          vec3 tQ = vTP * uTS;
          vec2 nX = texture2D(uNrm, tQ.zy).xy * 2.0 - 1.0;
          vec2 nY = texture2D(uNrm, tQ.xz).xy * 2.0 - 1.0;
          vec2 nZ = texture2D(uNrm, tQ.xy).xy * 2.0 - 1.0;
          vec3 oN = normalize(vTN);
          oN += (vec3(0.0, nX.y, nX.x) * tpW.x + vec3(nY.x, 0.0, nY.y) * tpW.y + vec3(nZ.x, nZ.y, 0.0) * tpW.z) * uNK;
          oN = normalize(oN);
          normal = normalize(vVX * oN.x + vVY * oN.y + vVZ * oN.z);
        }`);
  };
  m.customProgramCacheKey = () => 'ls-menu-station-tp';
  return m;
}

// Paneel-Material über echte UV-Koordinaten (Rümpfe, Ringe): Normalmap im Tangentenraum, Ton, Rauheit und
// Fugen-Abdunklung aus demselben Atlas. Für gekrümmte Flächen, wo die Dreiachsen-Projektion verschmiert.
function panelMat(o) {
  const A = atlas();
  const nk = o.nk ?? 1;
  const m = new THREE.MeshStandardMaterial({
    color: o.color, metalness: o.metal ?? 0.5, roughness: o.rough ?? 0.5, envMapIntensity: o.env ?? 1,
    normalMap: A.nrm, normalScale: new THREE.Vector2(nk, -nk), side: o.side ?? THREE.FrontSide,
  });
  const tn = o.tone ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlas = { value: A.map }; sh.uniforms.uTone = { value: tn };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas; uniform float uTone; vec4 tpA; float tAO;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        tpA = texture2D(uAtlas, vNormalMapUv);
        tAO = smoothstep(0.16, 0.56, tpA.b);
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.76 * tpA.r, uTone) * mix(0.3, 1.0, tAO);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.45 + tpA.g * 1.1) + (1.0 - tAO) * 0.3, 0.04, 1.0);`);
  };
  m.customProgramCacheKey = () => 'ls-menu-station-uv';
  return m;
}

// Fensterband als Leuchtkarte: Rahmen, Scheiben an/aus, Farbton je Fraktion. Kachel wiederholt sich ums Band.
function windowTex(seed, pal, on, cols, rows = 1) {
  const R = rng(seed);
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 64 * rows;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const cw = c.width / cols;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw, y = r * 64;
      g.fillStyle = 'rgb(10,11,13)';
      g.fillRect(x + cw * 0.14, y + 12, cw * 0.72, 40);
      if (R() > on) continue;
      const p = pal[(R() * pal.length) | 0];
      const k2 = 0.55 + R() * 0.45;
      const s = (v) => Math.min(255, Math.round(v * k2 * 110));
      g.fillStyle = `rgb(${s(p[0])},${s(p[1])},${s(p[2])})`;
      g.fillRect(x + cw * 0.2, y + 15, cw * 0.6, 34);
      // Innenleben: Schatten einer Strebe oder Person, Lichtkante oben
      if (R() < 0.45) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x + cw * (0.25 + R() * 0.4), y + 22 + R() * 10, cw * 0.08, 27); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + cw * 0.2, y + 15, cw * 0.6, 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Ringkörper als Drehkörper aus einem Querschnitt [[r, y], …] (gegen den Uhrzeigersinn, außen hoch).
 * UV: u = Bogenlänge außen herum, v = Bogenlänge am Querschnitt (beides × ts). Kanten hart (flach schattiert).
 */
function ringLathe(profile, segs, ts, phiStart = 0, phiLen = TAU) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLen);
  const n = pts.length;
  const arc = [0];
  let rm = 0;
  for (let j = 1; j < n; j++) arc[j] = arc[j - 1] + pts[j].distanceTo(pts[j - 1]);
  for (const p of pts) rm += p.x / n;
  const uv = g.attributes.uv;
  for (let i = 0; i <= segs; i++) for (let j = 0; j < n; j++) uv.setXY(i * n + j, (i / segs) * phiLen * rm * ts, arc[j] * ts);
  const f = g.toNonIndexed();
  g.dispose();
  f.computeVertexNormals();
  return f;
}

function materials(faction) {
  const fx = new THREE.Color(FXC[faction]);
  const P = {
    europa: { hull: 0xd4d5d1, hull2: 0xa3a7ac, dark: 0x2b2e33, frame: 0x8b8f95, metalH: 0.35 },
    saturn: { hull: 0x8e8a83, hull2: 0x5b5c60, dark: 0x27282b, frame: 0x6c6e74, metalH: 0.6 },
    eris: { hull: 0x474752, hull2: 0x33333b, dark: 0x17171b, frame: 0x4c4c55, metalH: 0.65 },
  }[faction];
  return {
    hullU: panelMat({ color: P.hull, metal: P.metalH, rough: 0.5 }),
    hull2U: panelMat({ color: P.hull2, metal: 0.6, rough: 0.42, nk: 1.2 }),
    darkU: panelMat({ color: P.dark, metal: 0.7, rough: 0.46, nk: 0.9 }),
    hull: hullMat({ color: P.hull, metal: P.metalH, rough: 0.5 }),
    hull2: hullMat({ color: P.hull2, metal: 0.6, rough: 0.46, ts: 1 / 48 }),
    dark: hullMat({ color: P.dark, metal: 0.7, rough: 0.5, ts: 1 / 40, nk: 0.8 }),
    frame: hullMat({ color: P.frame, metal: 0.82, rough: 0.36, ts: 1 / 30, nk: 0.4, tone: 0.5 }),
    rad: hullMat({ color: faction === 'eris' ? 0x8c8e98 : 0xe6e6e2, metal: 0.15, rough: 0.62, ts: 1 / 26, nk: 1.3, tone: 0.6, side: THREE.DoubleSide }),
    gold: hullMat({ color: 0xc8a050, metal: 1, rough: 0.34, ts: 1 / 14, nk: 2.2, tone: 0.8 }),
    ice: hullMat({ color: 0x9aa6bc, metal: 0, rough: 0.38, ts: 1 / 12, nk: 1.6, tone: 0.9, emissive: 0x1c1036, ei: 0.3 }),
    accent: hullMat({ color: fx, metal: 0.3, rough: 0.42, ts: 1 / 60, nk: 0.5, tone: 0.5, emissive: fx, ei: 0.18 }),
    strip: new THREE.MeshBasicMaterial({ color: fx.clone().multiplyScalar(2.2) }),
    solar: new THREE.MeshStandardMaterial({ map: solarTex(), color: 0xb8c8ff, metalness: 0.35, roughness: 0.32, envMapIntensity: 2.2, emissive: 0x0a1630, emissiveIntensity: 1 }),
    win: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
}

// ---------------------------------------------------------------- Bauhilfen

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FZ = new THREE.Vector3(0, 0, 1);
const IDENT = new THREE.Matrix4();
const GEO = {};
const cyl = (seg = 32) => GEO['c' + seg] || (GEO['c' + seg] = new THREE.CylinderGeometry(1, 1, 1, seg, 1));
const cylT = (rt, seg = 32) => GEO['ct' + rt + ':' + seg] || (GEO['ct' + rt + ':' + seg] = new THREE.CylinderGeometry(rt, 1, 1, seg, 1));
const box = () => GEO.box || (GEO.box = new THREE.BoxGeometry(1, 1, 1));
const cone = (seg = 10) => GEO['k' + seg] || (GEO['k' + seg] = new THREE.ConeGeometry(1, 1, seg, 1));
const flat = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
const oct = () => GEO.oct || (GEO.oct = flat(new THREE.CylinderGeometry(1, 1, 1, 8, 1)));
const octT = (rt) => GEO['ot' + rt] || (GEO['ot' + rt] = flat(new THREE.CylinderGeometry(rt, 1, 1, 8, 1)));

class Builder {
  constructor(seed) {
    this.parts = {};
    this.inst = {};
    this.lights = [];
    this.bands = [];
    this.R = rng(seed);
    this.F = IDENT;
  }
  at(F) { this.F = F || IDENT; return this; }
  mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    return _m.compose(_p, _q, _s).premultiply(this.F);
  }
  geo(slot, g, x, y, z, rx, ry, rz, sx, sy, sz) {
    let c = g.clone();
    if (c.index) { const n = c.toNonIndexed(); c.dispose(); c = n; }
    c.applyMatrix4(this.mat(x, y, z, rx, ry, rz, sx, sy, sz));
    if (slot !== 'solar') { c.deleteAttribute('uv'); }
    (this.parts[slot] || (this.parts[slot] = [])).push(c);
  }
  // Teil mit Paneel-UV (Material …U): uv × (us, vs), damit die Paneele maßstabsgerecht bleiben
  shell(slot, g, x, y, z, rx, ry, rz, sx, sy, sz, us, vs) {
    let c = g.clone();
    if (c.index) { const n = c.toNonIndexed(); c.dispose(); c = n; }
    const uv = c.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * us, uv.getY(i) * vs);
    c.applyMatrix4(this.mat(x, y, z, rx, ry, rz, sx, sy, sz));
    (this.parts[slot] || (this.parts[slot] = [])).push(c);
  }
  // fertige Geometrie (schon mit UV) unter dem aktuellen Rahmen übernehmen
  addGeo(slot, g) {
    g.applyMatrix4(this.F);
    if (!slot.endsWith('U') && slot !== 'solar') g.deleteAttribute('uv');
    (this.parts[slot] || (this.parts[slot] = [])).push(g);
  }
  // Fensterband: eigenes Netz mit Leuchtkarte (Fenster), r = Radius, y0..y1, rep = Kacheln rundum
  band(tex, r, y0, y1, segs, rep, inward = false, phiStart = 0) {
    const prof = inward ? [[r, y1], [r, y0]] : [[r, y0], [r, y1]];
    const g = ringLathe(prof, segs, 1, phiStart);
    const p0 = phiStart / TAU;
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i), y = g.attributes.position.getY(i);
      let phi = Math.atan2(x, z) / TAU - p0; phi -= Math.floor(phi);
      uv.setXY(i, phi * rep, (y - y0) / (y1 - y0));
    }
    // Naht bei phi = 0: rechte Kante der letzten Kachel auf rep statt 0
    for (let i = 0; i < uv.count; i += 3) {
      const a = uv.getX(i), b = uv.getX(i + 1), c = uv.getX(i + 2);
      const mx = Math.max(a, b, c);
      if (mx - Math.min(a, b, c) > rep * 0.5) for (let k = 0; k < 3; k++) if (uv.getX(i + k) < rep * 0.5) uv.setX(i + k, uv.getX(i + k) + rep);
    }
    g.applyMatrix4(this.F);
    this.bands.push([g, tex]);
  }
  // Instanz: k = Grundform (box|cyl|cone|oct), slot = Material, tone = Helligkeit (instanceColor)
  put(k, slot, x, y, z, rx, ry, rz, sx, sy, sz, tone = 1, tg = tone, tb = tone) {
    const key = k + '|' + slot;
    const L = this.inst[key] || (this.inst[key] = { m: [], c: [] });
    const m = this.mat(x, y, z, rx, ry, rz, sx, sy, sz);
    for (let i = 0; i < 16; i++) L.m.push(m.elements[i]);
    L.c.push(tone, tg, tb);
  }
  // Strebe zwischen zwei Punkten (lokal), Querschnitt w×w
  strut(slot, ax, ay, az, bx, by, bz, w, tone = 1) {
    _a.set(ax, ay, az); _b.set(bx, by, bz);
    const len = _a.distanceTo(_b);
    _q.setFromUnitVectors(FZ, _b.clone().sub(_a).normalize());
    _p.addVectors(_a, _b).multiplyScalar(0.5); _s.set(w, w, len);
    _m.compose(_p, _q, _s).premultiply(this.F);
    const key = 'box|' + slot;
    const L = this.inst[key] || (this.inst[key] = { m: [], c: [] });
    for (let i = 0; i < 16; i++) L.m.push(_m.elements[i]);
    L.c.push(tone, tone, tone);
  }
  light(kind, x, y, z, size) {
    _p.set(x, y, z).applyMatrix4(this.F);
    this.lights.push([kind, _p.x, _p.y, _p.z, size]);
  }
  // Fachwerk mit quadratischem Querschnitt zwischen a und b
  truss(slot, ax, ay, az, bx, by, bz, w, bay = 10, t = 0.7) {
    const A = new THREE.Vector3(ax, ay, az), B = new THREE.Vector3(bx, by, bz);
    const d = B.clone().sub(A), len = d.length(); d.normalize();
    const u = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = u.clone().sub(d.clone().multiplyScalar(u.dot(d))).normalize().multiplyScalar(w / 2);
    const s2 = d.clone().cross(s1).normalize().multiplyScalar(w / 2);
    const corner = [s1.clone().add(s2), s1.clone().sub(s2), s1.clone().negate().sub(s2), s1.clone().negate().add(s2)];
    const n = Math.max(1, Math.round(len / bay));
    for (const c of corner) { const a = A.clone().add(c), b = B.clone().add(c); this.strut(slot, a.x, a.y, a.z, b.x, b.y, b.z, t * 1.4); }
    for (let i = 0; i <= n; i++) {
      const p = A.clone().addScaledVector(d, (len * i) / n);
      for (let k = 0; k < 4; k++) {
        const a = p.clone().add(corner[k]), b = p.clone().add(corner[(k + 1) % 4]);
        this.strut(slot, a.x, a.y, a.z, b.x, b.y, b.z, t);
        if (i < n) {
          const q = A.clone().addScaledVector(d, (len * (i + 1)) / n).add(corner[(k + 1) % 4]);
          this.strut(slot, a.x, a.y, a.z, q.x, q.y, q.z, t * 0.8);
        }
      }
    }
  }
  // Kleinteile auf einem senkrechten Zylinder (lokal: Achse y)
  greebleCyl(r, y0, y1, n, size, slot = 'hull2', a0 = 0, a1 = TAU) {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const a = a0 + R() * (a1 - a0), y = y0 + R() * (y1 - y0);
      const w = size * (0.5 + R() * 1.6), h = size * (0.4 + R() * 1.8), d = size * (0.2 + R() * 0.7);
      const k = R() < 0.2 ? 'cyl' : 'box';
      const tone = R() < 0.25 ? 0.45 : 0.75 + R() * 0.45;
      this.put(k, R() < 0.3 ? 'dark' : slot, Math.cos(a) * (r + d / 2), y, Math.sin(a) * (r + d / 2), k === 'cyl' ? PI / 2 : 0, -a - PI / 2, 0, w, h, d, tone);
    }
  }
  // Kleinteile auf einer Quaderfläche: axis 'x'|'y'|'z', Vorzeichen sg
  greebleFace(cx, cy, cz, ax, sg, u0, u1, v0, v1, n, size, slot = 'hull2') {
    const R = this.R;
    for (let i = 0; i < n; i++) {
      const u = u0 + R() * (u1 - u0), v = v0 + R() * (v1 - v0);
      const w = size * (0.5 + R() * 1.5), h = size * (0.5 + R() * 1.5), d = size * (0.2 + R() * 0.6);
      const tone = R() < 0.25 ? 0.45 : 0.75 + R() * 0.45;
      const sl = R() < 0.3 ? 'dark' : slot;
      if (ax === 'x') this.put('box', sl, cx + sg * d / 2, cy + v, cz + u, 0, 0, 0, d, h, w, tone);
      else if (ax === 'y') this.put('box', sl, cx + u, cy + sg * d / 2, cz + v, 0, 0, 0, w, d, h, tone);
      else this.put('box', sl, cx + u, cy + v, cz + sg * d / 2, 0, 0, 0, w, h, d, tone);
    }
  }
  // Fensterreihe um einen senkrechten Zylinder
  windowRing(r, y, step, w, h, pal, onP = 0.7, a0 = 0, a1 = TAU) {
    const R = this.R;
    const n = Math.max(3, Math.round(((a1 - a0) * r) / step));
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + 0.5) / n) * (a1 - a0);
      const c = R() < onP ? pal[(R() * pal.length) | 0] : OFF;
      const k = c === OFF ? 1 : 0.7 + R() * 0.6;
      this.put('box', 'win', Math.cos(a) * (r + 0.15), y, Math.sin(a) * (r + 0.15), 0, -a - PI / 2, 0, w, h, 0.5, c[0] * k, c[1] * k, c[2] * k);
    }
  }
  // senkrechtes Zylindermodul mit Endkragen, Ringrippen, Fensterbändern, Kleinteilen
  module(y0, y1, r, o = {}) {
    const h = y1 - y0, seg = o.seg || 40;
    this.shell(o.slot || 'hullU', cyl(seg), 0, (y0 + y1) / 2, 0, 0, 0, 0, r, h, r, TAU * r / 56, h / 56);
    this.geo('dark', cyl(seg), 0, y0 + 1.2, 0, 0, 0, 0, r + 1.1, 2.4, r + 1.1);
    this.geo('dark', cyl(seg), 0, y1 - 1.2, 0, 0, 0, 0, r + 1.1, 2.4, r + 1.1);
    for (let y = y0 + (o.rib || 14); y < y1 - 6; y += o.rib || 14) this.geo('hull2', cyl(seg), 0, y, 0, 0, 0, 0, r + 0.35, 0.9, r + 0.35);
    for (const wy of o.win || []) {
      this.geo('dark', cyl(seg), 0, wy, 0, 0, 0, 0, r + 0.08, 2.6, r + 0.08);
      this.windowRing(r, wy, o.wstep || 3.4, 1.7, 1.25, o.pal || WARM, o.on ?? 0.72);
    }
    if (o.stripe != null) this.geo('accent', cyl(seg), 0, o.stripe, 0, 0, 0, 0, r + 0.25, 1.6, r + 0.25);
    if (o.grb) this.greebleCyl(r, y0 + 3, y1 - 3, o.grb, o.gs || 1.6);
  }
}

const OFF = [0.025, 0.03, 0.04];
const WARM = [[2.2, 1.75, 1.25], [2.0, 1.85, 1.6], [1.6, 1.75, 2.1]];
const COOL = [[1.7, 1.9, 2.3], [2.1, 2.1, 2.2]];
const ERIS_W = [[1.7, 1.7, 2.3], [1.9, 1.9, 2.2], [1.6, 0.85, 2.6]];
const DOCK = [[2.4, 1.6, 0.7]];

// ---------------------------------------------------------------- EUROPA

function europa(b) {
  const R = b.R;
  // Modulstapel
  b.geo('hull2', cylT(0.45), 0, -84, 0, 0, 0, 0, 22, 12, 22);
  b.module(-78, -24, 24, { win: [-60, -38], grb: 60, stripe: -30 });
  b.geo('hull', cylT(15 / 24, 40), 0, -21.5, 0, 0, 0, 0, 24, 5, 24);
  b.geo('hull2', cyl(32), 0, -18, 0, 0, 0, 0, 15, 12, 15);
  b.geo('hull', cylT(31 / 15, 40), 0, -14, 0, 0, 0, 0, 15, 4, 15);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; b.put('cyl', 'frame', Math.cos(a) * 16.5, -18, Math.sin(a) * 16.5, 0, 0, 0, 0.9, 12, 0.9); }
  b.module(-12, 58, 31, { win: [6, 22, 38], grb: 110, stripe: 52, rib: 12 });
  b.geo('hull', cylT(17 / 31, 40), 0, 60.5, 0, 0, 0, 0, 31, 5, 31);
  b.geo('hull2', cyl(32), 0, 64, 0, 0, 0, 0, 17, 12, 17);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; b.put('box', 'dark', Math.cos(a) * 18, 64, Math.sin(a) * 18, 0, -a, 0, 2.4, 9, 4, 0.8); }
  b.geo('hull', cylT(22 / 17, 40), 0, 68, 0, 0, 0, 0, 17, 4, 17);
  b.module(70, 98, 22, { win: [84], grb: 40 });
  b.geo('hull', cylT(0.3), 0, 104, 0, 0, 0, 0, 22, 12, 22);
  b.geo('dark', cyl(16), 0, 112, 0, 0, 0, 0, 5, 6, 5);
  // Mast mit Parabolantenne und Peitschen
  b.put('cyl', 'frame', 0, 136, 0, 0, 0, 0, 1.4, 44, 1.4);
  for (let y = 120; y < 156; y += 8) b.put('box', 'frame', 0, y, 0, 0, (y / 8) % 2 ? 0 : PI / 2, 0, 12, 0.6, 0.6);
  const dish = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => new THREE.Vector2(0.2 + i * 2.2, (i * 2.2) ** 2 / 90)), 40);
  b.geo('rad', dish, 10, 128, 6, -0.9, 0.5, 0.35, 1, 1, 1);
  b.put('cone', 'frame', 10 + 6, 128 + 6, 6 + 4, -0.9, 0.5, 0.35, 0.8, 14, 0.8);
  b.put('cyl', 'frame', -6, 150, 0, 0, 0, 0.12, 0.5, 26, 0.5);
  b.light('white', 0, 160, 0, 9);
  b.light('fx', 0, 114, 0, 6);
  // Laborröhren nach ±z
  for (const sg of [1, -1]) {
    const F = new THREE.Matrix4().makeRotationX(sg * PI / 2).setPosition(0, 30, 0);
    b.at(F);
    b.module(30, 86, 11, { win: [], grb: 40, gs: 1.2, rib: 10, seg: 28 });
    b.geo('hull', cylT(0.55, 28), 0, 90, 0, 0, 0, 0, 11, 8, 11);
    b.geo('dark', cyl(20), 0, 96, 0, 0, 0, 0, 4.2, 6, 4.2);
    b.light(sg > 0 ? 'green' : 'red', 0, 99, 0, 6);
    b.at();
    // Fensterzeilen seitlich an der Röhre
    for (let z = 34; z < 84; z += 3.2) {
      const lit = R() < 0.75 ? WARM[(R() * 3) | 0] : OFF;
      b.put('box', 'win', 11.15, 34, sg * z, 0, PI / 2, 0, 1.7, 1.1, 0.4, lit[0], lit[1], lit[2]);
      b.put('box', 'win', -11.15, 34, sg * z, 0, PI / 2, 0, 1.7, 1.1, 0.4, lit[0] * 0.8, lit[1] * 0.8, lit[2] * 0.8);
    }
  }
  // Goldfolien-Modul (Isolierung)
  b.geo('gold', cyl(24), 22, -50, 22, 0, 0, PI / 2, 7, 22, 7);
  b.geo('dark', cyl(24), 34, -50, 22, 0, 0, PI / 2, 7.6, 1.6, 7.6);
  // Gitterausleger nach ±x mit Solarflügeln und Radiatoren
  for (const sg of [1, -1]) {
    b.truss('frame', sg * 30, 30, 0, sg * 196, 30, 0, 7, 9);
    b.geo('dark', cyl(20), sg * 120, 30, 0, 0, 0, PI / 2, 5, 10, 5);
    for (const [px, wide] of [[150, 1], [182, 1]]) {
      for (const up of [1, -1]) {
        b.geo('frame', box(), sg * px, 30 + up * 22, 0, 0, 0, 0, 1.2, 38, 1.2);
        b.geo('solar', box(), sg * px, 30 + up * 25, 0, 0, 0.12 * sg, 0, 28 * wide, 34, 0.5);
      }
    }
    // Radiatoren nahe am Kern
    b.geo('frame', box(), sg * 62, 30, 0, 0, 0, 0, 1, 1, 64);
    for (const zz of [-1, 1]) {
      b.geo('rad', box(), sg * 76, 30, zz * 20, 0, 0, 0, 26, 0.7, 30);
      for (let k = -12; k <= 12; k += 3) b.geo('hull2', box(), sg * 76, 30.5, zz * 20 + k, 0, 0, 0, 26, 0.5, 0.5);
    }
    b.light(sg > 0 ? 'green' : 'red', sg * 198, 30, 0, 7);
    b.light('fx', sg * 120, 34, 0, 5);
  }
  // Andockarme nach ±z unten
  for (const sg of [1, -1]) {
    b.truss('frame', 0, -50, sg * 24, 0, -50, sg * 92, 6, 8);
    b.geo('hull', cyl(28), 0, -50, sg * 100, PI / 2, 0, 0, 9, 16, 9);
    b.geo('dark', cyl(28), 0, -50, sg * 109, PI / 2, 0, 0, 10, 2.5, 10);
    b.geo('accent', cyl(28), 0, -50, sg * 96, PI / 2, 0, 0, 9.3, 1.4, 9.3);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; b.put('box', 'win', Math.cos(a) * 9.4, -50 + Math.sin(a) * 9.4, sg * 110.5, 0, 0, a, 1.4, 0.8, 0.4, DOCK[0][0], DOCK[0][1], DOCK[0][2]); }
    b.light('white', 0, -40, sg * 110, 6);
  }
  // Bohrgestänge nach unten
  b.truss('frame', 0, -90, 0, 0, -218, 0, 7, 10, 0.6);
  b.geo('hull2', cyl(16), 0, -220, 0, 0, 0, 0, 6, 6, 6);
  b.geo('dark', cone(16), 0, -232, 0, PI, 0, 0, 4.5, 18, 4.5);
  for (let y = -110; y > -210; y -= 24) b.geo('hull2', cyl(16), 0, y, 0, 0, 0, 0, 3.2, 4, 3.2);
  b.light('red', 0, -240, 0, 7);
  b.light('fx', 0, -86, 0, 5);
}

// ---------------------------------------------------------------- SATURN

function saturn(b, spin) {
  const R = b.R;
  // Nabe
  b.geo('hull', cylT(0.4), 0, 66, 0, 0, 0, 0, 26, 16, 26);
  b.module(-56, 58, 26, { win: [44, 32], grb: 90, stripe: 50, pal: WARM });
  b.geo('hull', cylT(2.2), 0, -64, 0, 0, 0, 0, 12, 16, 12);
  // Leitstand oben: gestaffelte Blöcke mit Fensterband
  b.geo('hull2', box(), 0, 82, 0, 0, 0.3, 0, 30, 10, 18);
  b.geo('hull', box(), 0, 92, 0, 0, 0.3, 0, 22, 10, 14);
  b.geo('dark', box(), 0, 92, 0, 0, 0.3, 0, 22.4, 2.6, 14.4);
  for (let k = -9; k <= 9; k += 2.2) { const c = R() < 0.85 ? WARM[(R() * 3) | 0] : OFF; b.put('box', 'win', Math.cos(0.3) * k + Math.sin(0.3) * 7.3, 92, -Math.sin(0.3) * k + Math.cos(0.3) * 7.3, 0, 0.3, 0, 1.6, 1.4, 0.4, c[0], c[1], c[2]); }
  b.put('cyl', 'frame', 0, 116, 0, 0, 0, 0, 1.2, 40, 1.2);
  b.put('cyl', 'frame', 8, 108, 3, 0, 0, 0, 0.7, 26, 0.7);
  b.light('white', 0, 137, 0, 9);
  b.light('red', 8, 122, 3, 5);
  // Containerregale an der Nabe (vier Seiten)
  const CC = [[0.62, 0.62, 0.64], [0.78, 0.78, 0.76], [0.42, 0.44, 0.48], [0.5, 0.4, 0.34], [0.36, 0.42, 0.5]];
  const fx = new THREE.Color(FXC.saturn);
  for (let s = 0; s < 4; s++) {
    const a = (s / 4) * TAU + PI / 4;
    const F = new THREE.Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * 36, 0, Math.sin(a) * 36);
    b.at(F);
    b.geo('frame', box(), 0, 0, 0, 0, 0, 0, 2, 92, 2);
    b.geo('frame', box(), 0, 0, -16, 0, 0, 0, 2, 92, 2);
    b.geo('frame', box(), 0, 0, 16, 0, 0, 0, 2, 92, 2);
    for (let y = -40; y <= 36; y += 7) {
      b.geo('frame', box(), 0, y - 3.4, 0, 0, 0, 0, 3, 0.6, 34);
      for (let z = -12; z <= 12; z += 8) {
        if (R() < 0.12) continue;
        const c = R() < 0.1 ? [fx.r * 1.1, fx.g * 1.1, fx.b * 1.1] : CC[(R() * CC.length) | 0];
        const k = 0.85 + R() * 0.3;
        b.put('box', 'hull2', 3 + R() * 0.6, y, z, 0, 0, 0, 6, 6, 7.6, c[0] * k * 1.6, c[1] * k * 1.6, c[2] * k * 1.6);
      }
    }
    b.at();
  }
  // Habitatring in der Drehgruppe: durchgehender Drehkörper mit Fasen, Schotten, Fensterbändern,
  // Rohrleitungen, Kleinteilen und Andockstutzen. Zwei Speichen als Druckröhren, zwei als Fachwerk.
  const RR = 150;
  const prof = [[RR + 8, -9], [RR + 11, -6], [RR + 11, 6], [RR + 8, 9], [RR - 8, 9], [RR - 11, 6], [RR - 11, -6], [RR - 8, -9], [RR + 8, -9]];
  spin.addGeo('hullU', ringLathe(prof, 288, 1 / 44));
  // Schotten: etwas größerer Querschnitt, kurz, alle 12°
  const cprof = prof.map(([r, y]) => [RR + (r - RR) * 1.12, y * 1.14]);
  for (let i = 0; i < 30; i++) {
    const phi = (i / 30) * TAU;
    spin.addGeo(i % 5 === 0 ? 'darkU' : 'hull2U', ringLathe(cprof, 3, 1 / 20, phi - 0.022, 0.044));
  }
  // Fensterbänder außen (zwei Decks) und innen
  const wWarm = windowTex(31, WARM, 0.74, 24);
  spin.band(wWarm, RR + 11.07, -4.6, -1.2, 288, 26);
  spin.band(windowTex(33, WARM, 0.6, 24), RR + 11.07, 1.0, 4.4, 288, 26);
  spin.band(windowTex(35, COOL, 0.5, 24), RR - 11.07, -2.2, 2.2, 288, 22, true);
  // Rohrleitungen und Leuchtband
  spin.geo('frame', new THREE.TorusGeometry(RR + 4.5, 0.55, 6, 192), 0, 9.5, 0, PI / 2, 0, 0);
  spin.geo('frame', new THREE.TorusGeometry(RR - 4.5, 0.55, 6, 192), 0, 9.5, 0, PI / 2, 0, 0);
  spin.geo('frame', new THREE.TorusGeometry(RR + 1, 0.8, 6, 192), 0, -9.7, 0, PI / 2, 0, 0);
  spin.geo('accent', new THREE.TorusGeometry(RR + 11.1, 0.42, 4, 192), 0, 5.6 + 0.6, 0, PI / 2, 0, 0);
  spin.geo('strip', new THREE.TorusGeometry(RR + 9.6, 0.25, 4, 192), 0, -7.6, 0, PI / 2, 0, 0);
  // Kleinteile oben und unten (Lüfter, Kästen, Wärmetauscher)
  for (let k = 0; k < 260; k++) {
    const a = R() * TAU, top = k % 3 !== 0;
    const rr = RR + (R() * 2 - 1) * 6.2;
    const w = 1 + R() * 3.2, d = 1.2 + R() * 6, h = 0.4 + R() * (top ? 1.8 : 1.1);
    const tone = R() < 0.25 ? 0.45 : 0.75 + R() * 0.45;
    spin.put(R() < 0.18 ? 'cyl' : 'box', R() < 0.3 ? 'dark' : 'hull2', Math.cos(a) * rr, top ? 9 + h / 2 : -9 - h / 2, Math.sin(a) * rr, 0, -a, 0, w, h, d, tone);
  }
  // Antennen auf dem Ring
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2, h = 10 + (k % 3) * 6;
    spin.put('cyl', 'frame', Math.cos(a) * (RR + 2), 9 + h / 2, Math.sin(a) * (RR + 2), 0, 0, 0, 0.35, h, 0.35);
    spin.put('box', 'frame', Math.cos(a) * (RR + 2), 9 + h * 0.7, Math.sin(a) * (RR + 2), 0, -a, 0, 0.3, 0.3, 5);
    spin.light(k % 2 ? 'red' : 'white', Math.cos(a) * (RR + 2), 9.6 + h, Math.sin(a) * (RR + 2), 4.5);
  }
  // Andockstutzen außen, zwei davon mit angedocktem Frachter
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + PI / 4;
    const F = new THREE.Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * (RR + 11), 0, Math.sin(a) * (RR + 11));
    spin.at(F);
    spin.geo('hull2', cyl(24), 4, 0, 0, 0, 0, -PI / 2, 4.2, 8, 4.2);
    spin.geo('dark', cyl(24), 8.4, 0, 0, 0, 0, -PI / 2, 5.4, 1.4, 5.4);
    spin.geo('accent', cyl(24), 6.2, 0, 0, 0, 0, -PI / 2, 4.5, 1, 4.5);
    for (const s of [-1, 1]) spin.put('box', 'frame', 3, s * 5, 0, 0, 0, s * 0.5, 0.7, 6, 0.7);
    spin.light('white', 9.6, 5.8, 0, 4);
    spin.light(k % 2 ? 'green' : 'red', 9.6, -5.8, 0, 4);
    if (k % 2 === 0) {
      // Frachter: Rumpf, Ladecontainer, Triebwerksblock
      spin.geo('hull2', box(), 22, 0, 0, 0, 0, 0, 24, 7, 8);
      spin.geo('hull', box(), 22, 4.6, 0, 0, 0, 0, 18, 2.2, 6);
      spin.geo('dark', box(), 11, 0, 0, 0, 0, 0, 2, 5.6, 6.4);
      for (let c = 0; c < 4; c++) spin.put('box', 'hull2', 15 + c * 4.6, -5.6, 0, 0, 0, 0, 4, 4, 7.2, 0.6 + (c % 2) * 0.5, 0.6, 0.62);
      spin.geo('dark', cyl(16), 35.5, 0, 0, 0, 0, -PI / 2, 3.4, 3, 3.4);
      spin.light('fx', 37.5, 0, 0, 6);
      spin.light('white', 22, 6.4, 0, 3.5);
    }
    spin.at();
  }
  // Speichen: zwei Druckröhren mit Rippen, zwei Fachwerkträger mit Kabel
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    const F = new THREE.Matrix4().makeRotationY(-a);
    spin.at(F);
    const L0 = 30, L1 = RR - 11, Lm = (L0 + L1) / 2, Ll = L1 - L0;
    if (k % 2 === 0) {
      spin.shell('hull2U', cyl(24), Lm, 0, 0, 0, 0, -PI / 2, 3.4, Ll, 3.4, TAU * 3.4 / 40, Ll / 40);
      for (let x = L0 + 6; x < L1 - 2; x += 9) spin.geo('dark', cyl(24), x, 0, 0, 0, 0, -PI / 2, 3.9, 1.1, 3.9);
      spin.geo('hull', cyl(24), L1 - 2, 0, 0, 0, 0, -PI / 2, 5.4, 4, 5.4);
      spin.geo('frame', box(), Lm, 3.7, 0, 0, 0, 0, Ll, 0.6, 0.6);
      for (let x = L0 + 10; x < L1 - 6; x += 22) spin.put('box', 'win', x, 0, 3.45, 0, 0, 0, 1.6, 1, 0.3, 2.1, 1.8, 1.3);
    } else {
      spin.truss('frame', L0, 0, 0, L1, 0, 0, 6, 10);
      spin.geo('dark', cyl(10), Lm, -4.2, 0, 0, 0, -PI / 2, 0.6, Ll, 0.6);
    }
    spin.at();
  }
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * TAU;
    if (i % 6 === 0) spin.light(i % 12 ? 'red' : 'green', Math.cos(a) * (RR + 12), 7, Math.sin(a) * (RR + 12), 6);
    if (i % 5 === 2) spin.light('fx', Math.cos(a) * (RR + 12), -8, Math.sin(a) * (RR + 12), 5);
  }
  // Andockarme der Nabe unterhalb des Rings
  for (const sg of [1, -1]) {
    b.truss('frame', sg * 26, -34, 0, sg * 84, -34, 0, 5, 8);
    b.geo('hull2', cyl(24), sg * 90, -34, 0, 0, 0, PI / 2, 6, 12, 6);
    b.geo('dark', cyl(24), sg * 97, -34, 0, 0, 0, PI / 2, 7, 2, 7);
    b.geo('accent', cyl(24), sg * 93, -34, 0, 0, 0, PI / 2, 6.3, 1.2, 6.3);
    b.light('white', sg * 99, -27, 0, 5);
    b.light(sg > 0 ? 'green' : 'red', sg * 99, -41, 0, 5);
  }
  // Dockgestänge nach unten mit Portalkran und halb gebautem Rumpf
  b.truss('frame', 0, -68, 0, 0, -196, 0, 9, 10, 0.7);
  b.geo('hull2', box(), 0, -200, 0, 0, 0, 0, 40, 6, 22);
  b.geo('dark', box(), 0, -196.6, 0, 0, 0, 0, 38, 1, 20);
  b.greebleFace(0, -203, 0, 'y', -1, -18, 18, -9, 9, 18, 1.4);
  b.geo('frame', box(), -18, -186, 0, 0, 0, 0, 1.6, 24, 1.6);
  b.geo('frame', box(), 18, -186, 0, 0, 0, 0, 1.6, 24, 1.6);
  b.geo('frame', box(), 0, -174, 0, 0, 0, 0, 38, 2, 2);
  b.geo('accent', box(), 0, -176, 0, 0, 0, 0, 6, 3, 3);
  // Rumpf im Bau: Spanten
  for (let k = 0; k < 9; k++) {
    const z = -22 + k * 5.5, r = 6 + Math.sin((k / 8) * PI) * 6;
    b.geo('frame', new THREE.TorusGeometry(r, 0.45, 6, 24), 30 + 6, -172, z, 0, 0, 0);
  }
  b.geo('hull', box(), 36, -172 + 9, 0, 0, 0, 0, 3, 0.8, 44);
  b.geo('hull', box(), 36, -172 - 9, 0, 0, 0, 0, 3, 0.8, 44);
  b.geo('hull2', box(), 36, -172, -10, 0, 0, 0, 16, 16, 12);
  for (const x of [-18, 18]) b.light('fx', x, -198, 12, 5);
  b.light('white', 0, -204, 0, 7);
  b.light('red', 36, -160, 24, 5);
}

// ---------------------------------------------------------------- ERIS

function eris(b) {
  const R = b.R;
  // Monolith
  b.geo('hull', octT(1.18), 0, -96, 0, 0, PI / 8, 0, 30, 24, 30);
  b.shell('hullU', oct(), 0, -4, 0, 0, PI / 8, 0, 36, 160, 36, 8 * 27.6 / 48, 160 / 48);
  b.geo('hull2', octT(0.2), 0, 98, 0, 0, PI / 8, 0, 36, 44, 36);
  b.geo('dark', oct(), 0, 74, 0, 0, PI / 8, 0, 37, 4, 37);
  b.geo('dark', oct(), 0, -84, 0, 0, PI / 8, 0, 37, 4, 37);
  b.put('cone', 'frame', 0, 140, 0, 0, 0, 0, 2.2, 42, 2.2);
  const fr = 36 * Math.cos(PI / 8);
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * TAU;
    const F = new THREE.Matrix4().makeRotationY(-a + PI / 2).setPosition(Math.cos(a) * fr, 0, Math.sin(a) * fr);
    b.at(F);
    // Zellenfenster: 3 Spalten, viele Reihen
    for (let y = -68; y <= 60; y += 5.5) {
      if (Math.abs(y + 6) < 4) continue;
      for (const x of [-8, 0, 8]) {
        const c = R() < 0.36 ? ERIS_W[R() < 0.14 ? 2 : (R() * 2) | 0] : OFF;
        const k = c === OFF ? 1 : 0.55 + R() * 0.35;
        b.put('box', 'win', x, y, 0.3, 0, 0, 0, 0.9, 2.6, 0.5, c[0] * k, c[1] * k, c[2] * k);
      }
    }
    b.geo('dark', box(), 0, -6, 0.2, 0, 0, 0, 27, 6, 0.8);
    for (let y = -72; y <= 66; y += 22) b.geo('dark', box(), 0, y, 0.2, 0, 0, 0, 27, 1.2, 0.6);
    // Leuchtstreifen an jeder zweiten Kante
    if (f % 2 === 0) b.geo('strip', box(), 13.6, -6, 0.8, 0, 0, 0, 0.5, 120, 0.5);
    b.greebleFace(0, 0, 0, 'z', 1, -13, 13, 66, 72, 10, 1.4);
    b.greebleFace(0, 0, 0, 'z', 1, -13, 13, -82, -76, 10, 1.4);
    b.at();
  }
  // Strebepfeiler
  for (let f = 0; f < 8; f++) {
    const a = (f / 8) * TAU + PI / 8;
    const c = Math.cos(a), s = Math.sin(a);
    const F = new THREE.Matrix4().makeRotationY(-a).setPosition(0, 0, 0);
    b.at(F);
    b.geo('hull2', box(), 52, -60, 0, 0, 0, 0.62, 6, 74, 10);
    b.geo('dark', box(), 44, -10, 0, 0, 0, 0.62, 3, 20, 8);
    b.geo('hull2', box(), 68, -104, 0, 0, 0, 0, 10, 20, 12);
    b.put('cone', 'ice', 68, -122, 0, PI, 0, 0, 3.2, 14, 3.2);
    b.put('cone', 'ice', 64, -118, 3, PI, 0, 0, 1.8, 8, 1.8);
    b.geo('ice', box(), 56.5, -36, 0, 0, 0, 0.62, 1.2, 22, 6);
    b.at();
    if (f % 2) b.light('red', c * 70, -116, s * 70, 6);
  }
  // Zellenring: durchgehender Sechzehnkant (flache Facetten, keine Fugen), Schotten an jeder Kante,
  // Fensterband mit wenigen belegten Zellen, Leuchtstreifen, Eis an der Unterseite
  const RR = 124, Nn = 16, ph0 = -PI / Nn;
  const ring = new THREE.Matrix4().makeRotationZ(0.08).setPosition(0, -24, 0);
  b.at(ring);
  const prof = [[RR + 6, -8], [RR + 8.5, -5.5], [RR + 8.5, 5.5], [RR + 6, 8], [RR - 6, 8], [RR - 8.5, 5.5], [RR - 8.5, -5.5], [RR - 6, -8], [RR + 6, -8]];
  b.addGeo('hullU', ringLathe(prof, Nn, 1 / 40, ph0));
  b.addGeo('hull2U', ringLathe([[RR + 5, 8], [RR + 5, 10.6], [RR + 3.6, 11.6], [RR - 3.6, 11.6], [RR - 5, 10.6], [RR - 5, 8]], Nn, 1 / 30, ph0));
  b.addGeo('strip', ringLathe([[RR + 8.58, 6.2], [RR + 8.58, 6.9]], Nn, 1, ph0));
  b.addGeo('strip', ringLathe([[RR - 8.58, -6.9], [RR - 8.58, -6.2]], Nn, 1, ph0));
  for (let i = 0; i < Nn; i++) {
    const phi = ph0 + (i / Nn) * TAU;
    b.addGeo(i % 4 === 0 ? 'darkU' : 'hull2U', ringLathe(prof.map(([r, y]) => [RR + (r - RR) * 1.1, y * 1.12]), 1, 1 / 20, phi - 0.016, 0.032));
  }
  b.band(windowTex(41, ERIS_W, 0.36, 22), RR + 8.56, -3.4, 3.4, Nn, Nn * 1, false, ph0);
  b.band(windowTex(43, ERIS_W, 0.22, 22), RR - 8.56, -2.6, 2.6, Nn, Nn * 1, true, ph0);
  b.at();
  for (let i = 0; i < Nn; i++) {
    const a = (i / Nn) * TAU;
    const seg = 2 * (RR + 8.5) * Math.tan(PI / Nn) - 3;
    const F = new THREE.Matrix4().makeRotationY(-a).setPosition(Math.cos(a) * RR, 0, Math.sin(a) * RR).premultiply(ring);
    b.at(F);
    for (let k = -seg / 2 + 2.5; k < seg / 2 - 1.5; k += 2.6) {
      if (R() < 0.6) b.put('cone', 'ice', R() * 10 - 5, -8.6, k, PI, 0, 0, 0.8 + R() * 0.8, 3 + R() * 7, 0.8 + R());
    }
    b.greebleFace(0, -8, 0, 'y', -1, -6, 6, -seg / 2 + 1, seg / 2 - 1, 7, 1.2);
    b.greebleFace(0, 11.6, 0, 'y', 1, -3, 3, -seg / 2 + 1, seg / 2 - 1, 4, 0.9);
    for (let k = 0; k < 3; k++) b.put('box', 'ice', R() * 2 - 1, 11.9, (R() - 0.5) * seg * 0.7, 0, R() * 0.4, 0, 1.5 + R() * 3, 0.6, 4 + R() * 8, 0.9 + R() * 0.2);
    if (i % 2 === 0) b.light(i % 4 ? 'red' : 'fx', 9.4, 6.6, -seg / 2 + 1, 3.5);
    b.at();
    if (i % 4 === 0) {
      // Streben zum Monolithen
      _p.set(Math.cos(a) * (RR - 9), 0, Math.sin(a) * (RR - 9)).applyMatrix4(ring);
      _a.set(Math.cos(a) * 34, 0, Math.sin(a) * 34).applyMatrix4(ring);
      b.truss('frame', _a.x, _a.y, _a.z, _p.x, _p.y, _p.z, 5, 9);
      b.light('fx', _p.x, _p.y + 14, _p.z, 6);
    }
  }
  // Antennenwald
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, r = 6 + R() * 24, h = 14 + R() * 46;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y0 = 76 + (1 - r / 30) * 14;
    b.put('cyl', 'frame', x, y0 + h / 2, z, 0, 0, 0, 0.5 + R() * 0.4, h, 0.5 + R() * 0.4);
    for (let k = 0; k < 3; k++) if (R() < 0.6) b.put('box', 'frame', x, y0 + h * (0.4 + k * 0.2), z, 0, R() * PI, 0, 4 + R() * 6, 0.4, 0.4);
    if (i % 3 === 0) b.light('red', x, y0 + h, z, 5);
  }
  // Hangarmaul unten
  b.geo('dark', box(), 0, -112, 30, 0, 0, 0, 24, 10, 4);
  for (let k = -10; k <= 10; k += 2.5) b.put('box', 'win', k, -116.5, 32.2, 0, 0, 0, 1.2, 0.5, 0.4, 2.4, 1.2, 2.8);
  b.light('fx', 0, -104, 34, 8);
  b.light('white', 0, 164, 0, 9);
}

// ---------------------------------------------------------------- Zusammenbau

function bake(b, group, mats) {
  for (const k in b.parts) {
    const g = mergeGeometries(b.parts[k], false);
    for (const p of b.parts[k]) p.dispose();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats[k]);
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = k !== 'strip' && k !== 'win';
    group.add(mesh);
  }
  const base = { box: box(), cyl: cyl(12), cone: cone(8), oct: oct() };
  for (const key in b.inst) {
    const [k, slot] = key.split('|');
    const L = b.inst[key];
    const n = L.c.length / 3;
    const mesh = new THREE.InstancedMesh(base[k], mats[slot], n);
    mesh.instanceMatrix.array.set(L.m);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(L.c), 3);
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = mesh.receiveShadow = slot !== 'win';
    group.add(mesh);
  }
  for (const [g, tex] of b.bands) {
    const m = new THREE.MeshStandardMaterial({ color: 0x06070a, metalness: 0.75, roughness: 0.14, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 2.4 });
    const mesh = new THREE.Mesh(g, m);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function lightMats(faction) {
  const g = getGlowTexture();
  const mk = (hex, k) => new THREE.SpriteMaterial({ map: g, color: new THREE.Color(hex).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  return { red: mk(0xff3a26, 2.2), green: mk(0x3aff8a, 1.8), white: mk(0xffffff, 2.6), fx: mk(FXC[faction], 2.4) };
}

const CACHE = new Map();

/** Station für die Menü-Bühne: { root, spin, update(t) }. Einmal je Fraktion gebaut, danach wiederverwendet. */
export function buildMenuStation(faction) {
  if (!FXC[faction]) faction = 'europa';
  const hit = CACHE.get(faction);
  if (hit) return hit;
  const mats = materials(faction);
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const hub = new THREE.Group();
  root.add(hub, spin);
  const b = new Builder(faction === 'europa' ? 11 : faction === 'saturn' ? 23 : 37);
  const bs = new Builder(faction === 'saturn' ? 29 : 41);
  if (faction === 'europa') europa(b);
  else if (faction === 'saturn') saturn(b, bs);
  else eris(b);
  bake(b, hub, mats);
  bake(bs, spin, mats);
  const lm = lightMats(faction);
  const blink = [];
  for (const B of [b, bs]) {
    for (const [kind, x, y, z, size] of B.lights) {
      const s = new THREE.Sprite(lm[kind]);
      s.position.set(x, y, z); s.scale.setScalar(size * 1.6);
      (B === b ? hub : spin).add(s);
    }
  }
  blink.push(lm.white, lm.red, lm.fx);
  const station = {
    root, spin, faction,
    spinRate: faction === 'saturn' ? 1 : 0,
    // Positionslichter: Blitzer weiß, Rot langsam, Fraktionslicht atmet. Nur Zahlen setzen, nichts anlegen.
    update(t) {
      const w = (t * 0.9) % 1;
      lm.white.opacity = w < 0.06 ? 1 : w < 0.12 ? 0.15 : w < 0.18 ? 0.9 : 0.08;
      lm.red.opacity = 0.35 + 0.65 * (Math.sin(t * 2.4) > 0.2 ? 1 : 0.2);
      lm.green.opacity = 0.9;
      lm.fx.opacity = 0.6 + 0.4 * Math.sin(t * 1.3);
    },
  };
  CACHE.set(faction, station);
  return station;
}
