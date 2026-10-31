// Tiefenebenen je Sektor (ohne Spiellogik), damit das Bild nicht als leere Fläche wirkt:
//   Splitter   zwei Ebenen kleiner Gesteins- und Eissplitter unter der Spielebene, um die Kamera gewickelt (Parallaxe)
//   Dunst      zwei langsam treibende Dunstschleier nahe der Spielebene in der Farbstimmung des Sektors
//   Kulisse    ferne Großobjekte weit unter der Ebene (Ringfragment, Frachter, Wrack) als dunkle Silhouetten
// Alles einmal je Sektor gebaut; pro Bild nur Uniforms (Kameramitte, Zeit).
import * as THREE from 'three';
import { rng } from './textures.js';
import { BOX, CYL, T, Parts, setAO } from './geo.js';

let _noiseTex = null;
// periodisches Wertrauschen (kachelt in x und y mit Periode P)
function h2(x, y, sd) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(sd, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function pnoise(x, y, P, sd) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % P) + P) % P, x1 = (x0 + 1) % P, y0 = ((iy % P) + P) % P, y1 = (y0 + 1) % P;
  const a = h2(x0, y0, sd), b = h2(x1, y0, sd), c = h2(x0, y1, sd), d = h2(x1, y1, sd);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, sd, oct, P) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += amp * pnoise(x * f, y * f, P * f, sd + i * 17); n += amp; amp *= 0.5; f *= 2; }
  return s / n;
}
// kachelbare Rauschtextur für den Dunst (einmal je Sitzung)
function noiseTexture() {
  if (_noiseTex) return _noiseTex;
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * 4, v = y / S * 4;
    const w = fbm(u + 1.7, v + 9.2, 311, 3, 4);
    const n = fbm(u + w * 1.4, v - w * 1.1, 97, 4, 4);
    const i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, n * 255)); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  _noiseTex = t;
  return t;
}

const VEIL_VS = /* glsl */`
varying vec2 vP;
void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
// Zwei Dunstschichten in EINEM Durchgang: die tiefere Schicht (uY2) wird über den Sichtstrahl von der
// Kamera durch diesen Punkt (Ebene uY1) gefunden, damit bleibt die Parallaxe erhalten (spart einen Vollbild-Durchgang).
const VEIL_FS = /* glsl */`
uniform sampler2D tN; uniform vec3 uColA, uColB; uniform float uTime, uK, uScale, uK2, uScale2, uY1, uY2; uniform vec2 uCam, uDrift, uDrift2;
varying vec2 vP;
vec3 veil(vec2 w, float k, float sc, vec2 dr) {
  vec2 p = w / sc;
  float a = texture2D(tN, p + dr * uTime).r;
  float b = texture2D(tN, p * 2.3 - dr.yx * uTime * 1.6 + 0.37).r;
  float n = smoothstep(0.38, 0.86, a * 0.7 + b * 0.42);
  float fade = 1.0 - smoothstep(1500.0, 3200.0, length(w - uCam));
  return mix(uColA, uColB, smoothstep(0.3, 0.7, b)) * n * n * k * fade;
}
void main() {
  vec3 c = veil(vP, uK, uScale, uDrift);
  if (uK2 > 0.0) {
    float t = (cameraPosition.y - uY2) / max(1.0, cameraPosition.y - uY1);
    vec2 w2 = cameraPosition.xz + (vP - cameraPosition.xz) * t;
    c += veil(w2, uK2, uScale2, uDrift2);
  }
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function splinterGeo(seed) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.65 + r() * 0.6;
    p.setXYZ(i, p.getX(i) * k * 1.6, p.getY(i) * k * 0.55, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// Silhouetten weit unter der Spielebene
function farGeometry(kind, R) {
  const P = new Parts();
  if (kind === 0) { // Ringfragment eines zerbrochenen Habitats
    const arc = new THREE.TorusGeometry(560, 30, 6, 40, Math.PI * 0.42).rotateX(Math.PI / 2);
    P.add('hull', T(arc, 0, 0, 0, 0, 0, 0, 1, 0.45, 1)); arc.dispose();
    for (let i = 0; i < 9; i++) {
      const a = i / 8 * Math.PI * 0.42;
      P.add('hull', T(BOX(), Math.cos(a) * 560, 0, Math.sin(a) * 560, 0, -a, 0, 30 + R() * 20, 34, 40 + R() * 30));
      if (i % 2) P.add('win', T(BOX(), Math.cos(a) * 591, 2, Math.sin(a) * 591, 0, -a, 0, 1.2, 3, 18));
    }
  } else if (kind === 1) { // Massengutfrachter
    P.add('hull', T(BOX(), 0, 0, 0, 0, 0, 0, 70, 46, 420));
    for (let i = 0; i < 6; i++) P.add('hull', T(BOX(), 0, 30, -150 + i * 56, 0, 0, 0, 62, 14, 44));
    P.add('hull', T(BOX(), 0, 40, 196, 0, 0, 0, 50, 34, 36));
    for (const s of [-1, 1]) P.add('hull', T(CYL(), s * 22, 0, 222, Math.PI / 2, 0, 0, 14, 30, 14));
    for (let i = 0; i < 5; i++) P.add('win', T(BOX(), 0, 46, 210 - i * 4, 0, 0, 0, 40, 1.5, 1));
  } else { // Wrackrumpf, in der Mitte gebrochen
    P.add('hull', T(BOX(), 0, 0, -90, 0.05, 0.02, 0.1, 80, 50, 200));
    P.add('hull', T(BOX(), 20, -30, 140, -0.25, 0.3, -0.2, 70, 44, 170));
    for (let i = 0; i < 7; i++) P.add('hull', T(BOX(), (R() - 0.5) * 140, (R() - 0.5) * 80, 20 + (R() - 0.5) * 60, R(), R(), R(), 6, 6, 40 + R() * 60));
  }
  return P.merge();
}

// opts: { seed, size, quality, moodA, moodB (THREE.Color), dust (Farbe der Splitter) }
export function buildLayers(opts, keep) {
  const group = new THREE.Group();
  group.name = 'layers';
  const R = rng(9100 + opts.seed * 13);
  const q = opts.quality;
  const uCenter = { value: new THREE.Vector2() };
  const tile = 3600;

  // Splitter (zwei Tiefen, ein Draw-Call je Ebene)
  const sGeo = keep(splinterGeo(opts.seed + 5));
  const sMat = keep(new THREE.MeshStandardMaterial({ color: opts.dust.clone().multiplyScalar(0.55), metalness: 0.15, roughness: 0.85, flatShading: true, envMapIntensity: 0.4 }));
  sMat.onBeforeCompile = (sh) => {
    sh.uniforms.uCenter = uCenter; sh.uniforms.uTile = { value: tile };
    sh.vertexShader = 'uniform vec2 uCenter; uniform float uTile;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      mat4 lsIm = instanceMatrix;
      vec3 lsP = lsIm[3].xyz;
      lsP.xz = mod(lsP.xz - uCenter + 0.5 * uTile, uTile) - 0.5 * uTile + uCenter;
      lsIm[3].xyz = lsP;
      mvPosition = modelViewMatrix * (lsIm * mvPosition);
      gl_Position = projectionMatrix * mvPosition;`);
  };
  sMat.customProgramCacheKey = () => 'lsSplinter';
  const nA = q >= 2 ? 240 : q === 1 ? 150 : 70, nB = q >= 2 ? 110 : q === 1 ? 70 : 30;
  const m = new THREE.Matrix4(), qu = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const [n, y0, y1, s0, s1] of [[nA, -420, -170, 1.6, 7], [nB, -1000, -560, 6, 24]]) {
    const im = keep(new THREE.InstancedMesh(sGeo, sMat, n));
    for (let i = 0; i < n; i++) {
      const k = s0 + Math.pow(R(), 2.5) * (s1 - s0);
      e.set(R() * 6, R() * 6, R() * 6); qu.setFromEuler(e);
      im.setMatrixAt(i, m.compose(p.set(R() * tile, y0 + R() * (y1 - y0), R() * tile), qu, s.set(k, k, k)));
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    group.add(im);
  }

  // Dunstschleier
  const veils = [];
  const tN = noiseTexture();
  const vGeo = keep(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2));
  for (const [y, k, sc, dx, dz] of [[-70, q >= 1 ? 0.075 : 0.05, 2600, 0.0026, 0.0011]]) {
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: {
        tN: { value: tN }, uColA: { value: opts.moodA.clone() }, uColB: { value: opts.moodB.clone() }, uTime: { value: 0 },
        uK: { value: k }, uScale: { value: sc }, uCam: { value: new THREE.Vector2() }, uDrift: { value: new THREE.Vector2(dx, dz) },
        uK2: { value: 0.11 }, uScale2: { value: 4200 }, uDrift2: { value: new THREE.Vector2(-0.0016, 0.0021) }, uY1: { value: y }, uY2: { value: -260 },
      },
      vertexShader: VEIL_VS, fragmentShader: VEIL_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(vGeo, mat);
    mesh.position.y = y; mesh.frustumCulled = false; mesh.renderOrder = -6;
    group.add(mesh);
    veils.push(mesh);
  }

  // Kulisse: drei bis fünf ferne Großobjekte
  const old = setAO(0.35);
  const farMat = {
    hull: keep(new THREE.MeshStandardMaterial({ color: 0x23242a, metalness: 0.7, roughness: 0.55, envMapIntensity: 0.35, flatShading: true, vertexColors: true })),
    win: keep(new THREE.MeshBasicMaterial({ color: opts.moodA.clone().multiplyScalar(0.9) })),
  };
  const nFar = q >= 1 ? 5 : 3;
  for (let i = 0; i < nFar; i++) {
    const kind = i % 3;
    const geos = farGeometry(kind, R);
    const g = new THREE.Group();
    for (const k in geos) { keep(geos[k]); g.add(new THREE.Mesh(geos[k], farMat[k])); }
    const a = (i / nFar) * Math.PI * 2 + R() * 0.8, d = opts.size * (0.35 + R() * 0.9);
    g.position.set(Math.cos(a) * d, -1500 - R() * 1300, Math.sin(a) * d);
    g.rotation.set((R() - 0.5) * 0.4, R() * Math.PI * 2, (R() - 0.5) * 0.3);
    group.add(g);
  }
  setAO(old);

  return {
    group,
    update(camTarget, time) {
      uCenter.value.set(camTarget.x, camTarget.z);
      for (let i = 0; i < veils.length; i++) {
        const v = veils[i];
        v.position.x = camTarget.x; v.position.z = camTarget.z;
        v.material.uniforms.uTime.value = time;
        v.material.uniforms.uCam.value.set(camTarget.x, camTarget.z);
      }
    },
  };
}
