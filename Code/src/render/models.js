// Modell-Fabrik: prozedurale Modelle, Geometrien und Materialien je Typ einmal angelegt.
// Später kann pro Typ ein GLB geladen werden: factory.registerGLB('ship:s1', url) usw.
// GLB-Regeln (wie in der Vault-Notiz „Schiffs-Prompts für ChatGPT“): Meter, +y oben, Bug zeigt nach +z
// (glTF-Standard). Das Spiel selbst hat den Bug bei −z; registerGLB dreht das Modell deshalb um 180°.
// Leere Objekte als Andockpunkte: HP_Laser_01… (lokal +z = Schussrichtung), HP_Gen_01… (+y aus der Fassung),
// HP_Engine_01… (lokal +z = Abgasstrahl nach hinten). Modelle, die schon nach −z zeigen: { forward: '-z' }.
// Schlüssel: 'ship:s1:europa' (vor 'ship:s1'), 'enemy:raider', 'station:europa' (vor 'station'),
//            'portal', 'crate', 'wreck', 'ore:nickel' (vor 'ore').
import * as THREE from 'three';
import { PI, _m, _q, _e, _p, _s, _a, _b, _up, _fz, BOX, CYL, CYL6, SPH, HALF, CONE, DISC, ICO, TOR, NOZ, T, TQ, beam, spike, E, lathe, Parts } from './geo.js';
import { stationParts, STATION_INST_GEO } from './stations.js';
import { hullDetail, lightPointsMaterial, lightPointsGeometry, lightConeMaterial } from './surface.js';
import { NOISE } from './glsl.js';
import { FACTIONS, ENEMIES, LASERS } from '../core/data.js';
import { getGlowTexture, rng } from './textures.js';
import { rockGeometry } from './fields.js';

const PLUME_VS = `
varying vec2 vUv; varying float vSeed;
void main() {
  vUv = uv;
  vSeed = fract(modelMatrix[3].x * 0.0131 + modelMatrix[3].z * 0.0073 + modelMatrix[0].x * 3.1);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const PLUME_FS = `
uniform vec3 uColor; uniform float uTime;
varying vec2 vUv; varying float vSeed;
void main() {
  float x = abs(vUv.x * 2.0 - 1.0), y = vUv.y;
  float w = mix(0.42, 1.0, sqrt(y));
  float xr = x / w;
  float core = exp(-xr * xr * 16.0) * exp(-y * 9.0);
  float body = exp(-xr * xr * 3.2) * pow(1.0 - y, 2.2);
  float flick = 0.86 + 0.14 * sin(uTime * 61.0 + vSeed * 40.0 + y * 24.0) * sin(uTime * 37.0 + vSeed * 17.0);
  float shock = 0.75 + 0.25 * cos(y * 46.0 - uTime * 14.0) * exp(-y * 2.5);
  vec3 c = vec3(1.0, 0.97, 0.93) * core * 2.6 + uColor * body * 1.5 * shock;
  gl_FragColor = vec4(c * flick, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

const SHIP_DARK = { color: 0x1c1d22, metal: 0.78, rough: 0.46, panel: 0.25, lines: 0.35, grime: 0.22, rim: 0.16, tilt: 0.04 };
// Sichtbare Gegnergröße passt zum Trefferradius, Bezug Spielerschiff s1 (Radius 20 ≈ 44 m Rumpflänge = 2,2 × Radius):
// Gegner-Rumpf (längste Kante) = ENEMY_LEN × Radius → Larva (12) ≈ 29 m < Spieler, Raider (18) ≈ 43 m ≈ Spieler,
// Vulture/Spiker (24/26) ≈ 58–62 m ≤ 1,5 × Spieler. Elite/Alpha werden nur über ihren größeren Radius größer.
export const ENEMY_LEN = 2.4;
export const ENEMY_VIS = ENEMY_LEN * 0.5;  // sichtbarer Radius je Meter Trefferradius
export const SHIELD_COLOR = 0x6ad0ff;
export const PORTAL_VIS = 0.78;  // Maßstab des Tormodells (Außenrand 144 m → 112 m)
export const CRATE_COLOR = 0xffc94a;
export const CARGO_COLOR = 0xff9a3a;

export const hpName = (kind, i) => `HP_${kind}_${String(i + 1).padStart(2, '0')}`;

// Teile, die ein Modell aus Blender selbst mitbringt (Namen wie im Codex-Export).
const _inv = new THREE.Matrix4(), _mw = new THREE.Matrix4(), _v = new THREE.Vector3();
function eachVertex(node, frame, fn) {
  _inv.copy(frame.matrixWorld).invert();
  node.traverse((o) => {
    if (!o.isMesh) return;
    _mw.multiplyMatrices(_inv, o.matrixWorld);
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) fn(_v.fromBufferAttribute(pos, i).applyMatrix4(_mw));
  });
}
function ownParts(hull) {
  const num = (base) => Array.from({ length: 16 }, (_, i) => `${base}_${String(i + 1).padStart(2, '0')}`);
  const lasers = ['Laser_Port', 'Laser_Starboard', 'Laser_Center', ...num('Laser')].map((n) => hull.getObjectByName(n)).filter(Boolean);
  const gens = ['Generator_Port', 'Generator_Starboard', ...num('Generator')].map((n) => hull.getObjectByName(n)).filter(Boolean);
  if (!lasers.length && !gens.length) return null;
  hull.updateMatrixWorld(true);
  const muzzles = lasers.map((node) => {
    const b = new THREE.Box3();
    eachVertex(node, node.parent, (p) => b.expandByPoint(p));
    return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z);
  });
  const engines = [];
  let light = null;
  hull.traverse((o) => { if (!light && o.isMesh && /EngineLight/i.test(o.name)) light = o; });
  if (light) {
    const side = [{ n: 0, x: 0, y: 0, z: Infinity }, { n: 0, x: 0, y: 0, z: Infinity }];
    eachVertex(light, hull, (p) => {
      const s = side[p.x < 0 ? 0 : 1];
      s.n++; s.x += p.x; s.y += p.y; if (p.z < s.z) s.z = p.z;
    });
    for (const s of side) if (s.n) engines.push(new THREE.Vector3(s.x / s.n, s.y / s.n, s.z));
  }
  return { lasers, gens, muzzles, engines };
}
function tintEmissive(node, color, factory) {
  node.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const tinted = list.map((m) => {
      if (!m.emissiveMap) return m;
      const key = `tint:${m.uuid}:${color}`;
      if (!factory._tints) factory._tints = new Map();
      let t = factory._tints.get(key);
      if (!t) {
        t = m.clone();
        t.emissive = new THREE.Color(color);
        t.emissiveIntensity = 3;
        factory._tints.set(key, t);
      }
      return t;
    });
    o.material = Array.isArray(o.material) ? tinted : tinted[0];
  });
}

// ---------- Schiffsaufbau ----------
const SHIP_LAYOUT = {
  s1: {
    scale: 1.0, wings: false, centerEngine: false,
    lasers: [[-17.2, -3.4, -8.5], [17.2, -3.4, -8.5]],
    gens: [[-9.5, 3.3, 10], [9.5, 3.3, 10]],
  },
  s2: {
    scale: 1.22, wings: true, centerEngine: true,
    lasers: [[-17.2, -3.4, -8.5], [17.2, -3.4, -8.5], [-26, 0.2, -3.5], [26, 0.2, -3.5]],
    gens: [[-9.5, 3.3, 10], [9.5, 3.3, 10], [0, 6.6, 8.5]],
  },
};
function laserSlotPos(layout, i, out) {
  const l = layout.lasers[i];
  if (l) return out.set(l[0], l[1], l[2]);
  // weitere Laser entlang der Flügel (größere Schiffe)
  const k = i - layout.lasers.length, side = k % 2 === 0 ? -1 : 1, row = Math.floor(k / 2);
  return out.set(side * (19 + row * 3.5), -1.3, -1.5 + row * 2.5);
}
function genSlotPos(layout, i, out) {
  const g = layout.gens[i];
  if (g) return out.set(g[0], g[1], g[2]);
  const k = i - layout.gens.length, side = k % 2 === 0 ? -1 : 1, row = Math.floor(k / 2);
  return out.set(side * (5 + row * 3), 3.3, 3 - row * 4);
}

const HULL = [[-10, -18], [-14, -9], [-13.5, 5], [-9, 13], [-6.5, 21], [-3.2, 17], [0, 13.5], [3.2, 17], [6.5, 21], [9, 13], [13.5, 5], [14, -9], [10, -18], [0, -15.5]];
const SPINE = [[-6, -15], [-8.5, -2], [-6, 9], [-2.5, 15], [2.5, 15], [6, 9], [8.5, -2], [6, -15]];
const POD = [[0.01, -12.5], [2.2, -12], [3.9, -9.5], [4.7, -5], [4.8, 4], [4.3, 9], [3.6, 11.5], [3.2, 12]];

function shipGeometry(faction, shipId) {
  const L = SHIP_LAYOUT[shipId] || SHIP_LAYOUT.s2;
  const smooth = faction === 'europa';
  const P_ = new Parts();
  const bev = smooth ? 3 : 1;
  // Rumpf + Rücken
  P_.add('hull', E(HULL, 4, 1.2, bev, -2));
  P_.add('hull', E(SPINE, 2.5, 0.8, bev, 3));
  P_.add('dark', T(BOX(), 0, -3.4, 2, 0, 0, 0, 10, 2, 26));            // Kiel
  P_.add('glass', T(HALF(), 0, 5.6, -5, 0, 0, 0, 3.6, 2.6, 6.5));       // Kanzel
  // klarer Bug und gepfeilte Heckflossen: in der Draufsicht sofort lesbar
  P_.add('hull', E([[-3.4, 13], [-1.2, 25.5], [0, 27.5], [1.2, 25.5], [3.4, 13]], 2.0, 0.5, bev, 0.2));
  P_.add('dark', E([[-1.1, 20], [0, 26.6], [1.1, 20]], 0.4, 0, 1, 2.6));
  for (const s of [-1, 1]) {
    const fin = [[13.6, -5], [23.8, -14.5], [25.2, -19.5], [14.2, -15]].map(([x, y]) => [x * s, y]);
    P_.add('hull', E(s > 0 ? fin : fin.reverse(), 0.9, 0.3, bev, -0.3));
    P_.add('paint', beam(s * 22.6, 1.05, 16.2, s * 24.6, 1.05, 19.3, 1.2, 0.18));
  }
  // Seiten-Pods (Turbinen)
  const pod = lathe(POD, 18);
  for (const sx of [-15.5, 15.5]) {
    P_.add('hull', T(pod, sx, 0, 0, PI / 2));
    P_.add('trim', T(TOR(0.16), sx, 0, -11.4, 0, 0, 0, 3.7, 3.7, 3.7));
    P_.add('dark', T(DISC(), sx, 0, -12.2, PI, 0, 0, 2.6, 2.6, 1));      // Ansaugöffnung
    P_.add('glow', T(DISC(), sx, 0, 12.05, 0, 0, 0, 2.9, 2.9, 1));       // Austritt
    P_.add('dark', beam(sx * 0.7, 0, -3, sx, 0, -3, 3, 2.2));
  }
  pod.dispose();
  // Haupttriebwerke hinten
  const engX = L.centerEngine ? [-7, 0, 7] : [-5, 5];
  for (const ex of engX) {
    P_.add('dark', T(CYL(), ex, 0, 17.5, PI / 2, 0, 0, 3.3, 7, 3.3));
    P_.add('trim', T(NOZ(1.22), ex, 0, 22, PI / 2, 0, 0, 3.3, 2.5, 3.3));
    P_.add('glow', T(DISC(), ex, 0, 22.6, 0, 0, 0, 3.1, 3.1, 1));
  }
  // Flügel (Schiff 2+)
  if (L.wings) {
    P_.add('hull', E([[19, -6], [31, -2], [31.5, 3], [19, 9]], 1.2, 0.4, bev, -0.6));
    P_.add('hull', E([[-19, -6], [-19, 9], [-31.5, 3], [-31, -2]], 1.2, 0.4, bev, -0.6));
    for (const s of [-1, 1]) {
      P_.add('trim', beam(s * 31.2, 0, 2.5, s * 31.2, 0, -2.5, 0.8, 4));
      P_.add('glow', T(SPH(), s * 31.6, 0.4, 0.3, 0, 0, 0, 0.7, 0.7, 0.7));
    }
  }
  // Fraktions-Stil
  if (faction === 'europa') {
    for (const s of [-1, 1]) {
      P_.add('trim', beam(s * 9, 3.25, -13, s * 6.5, 3.25, -21, 0.9, 0.5));
      P_.add('trim', beam(s * 13.6, 3.25, -5, s * 14, 3.25, 9, 0.9, 0.5));
      P_.add('trim', T(TOR(0.08), s * 15.5, 0, 5, 0, 0, 0, 4.85, 4.85, 4.85));
      P_.add('glow', T(SPH(), s * 6.5, 0.6, -21.2, 0, 0, 0, 0.6, 0.6, 0.6));
    }
    P_.add('trim', beam(0, 6.45, -14, 0, 6.45, 12, 0.8, 0.3));
    // Lackstreifen, Lüftungsgitter, Lagedüsen, Antenne, Sensorkuppel
    for (const s of [-1, 1]) {
      P_.add('paint', T(BOX(), s * 11.2, 3.28, -1, 0, 0, 0, 1.1, 0.12, 16));
      P_.add('paint', T(BOX(), s * 10.2, 3.28, -1, 0, 0, 0, 0.35, 0.12, 16));
      for (let k = 0; k < 4; k++) P_.add('dark', T(BOX(), s * 10.8, 3.3, 9.5 + k * 1.1, 0, 0, 0, 3.4, 0.25, 0.5));
      P_.add('trim', T(BOX(), s * 12.6, 0.4, -10.5, 0, 0, 0, 2.2, 1.8, 2.2));
      P_.add('dark', T(BOX(), s * 13.8, 0.4, -10.5, 0, 0, 0, 0.4, 0.8, 0.8));
      P_.add('lamp', T(SPH(), s * 13.9, 0.5, 4.5, 0, 0, 0, 0.45, 0.45, 0.45));
    }
    P_.add('dark', T(CYL(), 0, 8.4, 9.5, 0, 0, 0, 0.18, 4.5, 0.18));
    P_.add('glass', T(HALF(), 0, 6.3, 5.5, 0, 0, 0, 1.6, 1.0, 1.6));
  } else if (faction === 'saturn') {
    for (const z of [-6, 0.5, 7]) P_.add('trim', T(BOX(), 0, 3.3, z, 0, 0, 0, 27.5, 0.45, 1.8));
    for (const s of [-1, 1]) {
      P_.add('trim', T(TOR(0.1), s * 15.5, 0, -4, 0, 0, 0, 4.9, 4.9, 4.9));
      P_.add('trim', T(TOR(0.1), s * 15.5, 0, 4, 0, 0, 0, 4.9, 4.9, 4.9));
      P_.add('trim', beam(s * 4, 3.3, -15, s * 6.2, 3.3, -20.5, 1.4, 0.5));
      P_.add('glow', T(BOX(), s * 13.8, 0, -1, 0, 0, 0, 0.5, 0.8, 5));
    }
  } else { // eris: Brünierstahl, violetter Lack als Kennung, Stacheln, schmale Positionslichter
    for (let i = 0; i < HULL.length; i++) {
      const a = HULL[i], b = HULL[(i + 1) % HULL.length];
      P_.add('trim', beam(a[0] * 0.97, 3.25, -a[1] * 0.97, b[0] * 0.97, 3.25, -b[1] * 0.97, 0.5, 0.3));
    }
    for (const s of [-1, 1]) {
      P_.add('paint', beam(s * 6, 5.85, -13, s * 7.8, 5.85, 0, 0.6, 0.15));
      P_.add('paint', beam(s * 15.5, 4.85, -8, s * 15.5, 4.85, 8, 0.8, 0.15));
      P_.add('paint', T(BOX(), s * 11.3, 3.28, 2, 0, 0, 0, 0.8, 0.12, 12));
      for (let k = 0; k < 5; k++) P_.add('dark', T(BOX(), s * 10.8, 3.3, -8 + k * 1.1, 0, 0, 0, 3.2, 0.25, 0.5));
      P_.add('trim', T(BOX(), s * 12.4, 0.4, 11, 0, 0, 0, 2.4, 1.8, 2.6));
      P_.add('lamp', T(SPH(), s * 18.4, 0.4, 4.3, 0, 0, 0, 0.4, 0.4, 0.4));
      for (const z of [-6, 0, 6]) P_.add('dark', spike(s * 15.5, 4.2, z, s * 0.35, 1, 0.6, 0.9, 4.2));
      P_.add('dark', spike(s * 10.5, 0, 17, s * 0.5, 0, 1, 1.4, 7));
      P_.add('dark', spike(s * 6.5, 0, -20.5, 0, 0, -1, 1.1, 6));
      P_.add('dark', spike(s * 13.6, 0, 3, s, 0.05, 0.25, 1.0, 5));
    }
  }
  return P_.merge();
}

// ---------- Laser-Bauteile je Stufe ----------
function laserGeometry(key) {
  const P_ = new Parts();
  let muzzle = -10.4;
  if (key === 'ion') {
    P_.add('metal', T(CYL(), 0, 0, -2.1, PI / 2, 0, 0, 1.3, 4.2, 1.3));
    P_.add('metal', T(CYL(), 0, 0, -8.7, PI / 2, 0, 0, 0.62, 9, 0.62));
    for (const z of [-5.6, -7.6, -9.6]) P_.add('glow', T(TOR(0.24), 0, 0, z, 0, 0, 0, 1.0, 1.0, 1.0));
    P_.add('glow', T(CYL(), 0, 0, -13.1, PI / 2, 0, 0, 0.5, 0.6, 0.5));
    muzzle = -13.6;
  } else if (key === 'plasma') {
    P_.add('metal', T(BOX(), 0, 0, -1.2, 0, 0, 0, 2.2, 1.6, 2.4));
    P_.add('glow', T(SPH(), 0, 0, -3.6, 0, 0, 0, 1.75, 1.75, 1.9));
    P_.add('metal', T(CYL(), 0, 0, -8.6, PI / 2, 0, 0, 0.95, 7, 0.95));
    P_.add('metal', T(NOZ(0.7), 0, 0, -12.6, -PI / 2, 0, 0, 1.4, 1.2, 1.4));
    P_.add('glow', T(TOR(0.3), 0, 0, -11.6, 0, 0, 0, 1.15, 1.15, 1.15));
    muzzle = -13.3;
  } else if (key === 'gamma') {
    P_.add('metal', T(BOX(), 0, 0, -2.25, 0, 0, 0, 2.4, 1.8, 4.5));
    for (const s of [-1, 1]) {
      P_.add('metal', T(BOX(), s * 0.9, 0, -10, 0, 0, 0, 0.55, 0.85, 11));
      P_.add('glow', T(BOX(), s * 0.9, 0, -15.6, 0, 0, 0, 0.6, 0.9, 0.5));
    }
    P_.add('glow', T(BOX(), 0, 0, -9.8, 0, 0, 0, 0.36, 0.36, 10.5));
    muzzle = -16;
  } else { // pulse
    P_.add('metal', T(BOX(), 0, 0, -1.5, 0, 0, 0, 1.8, 1.4, 3));
    P_.add('metal', T(CYL(), 0, 0, -6.5, PI / 2, 0, 0, 0.55, 7, 0.55));
    P_.add('glow', T(TOR(0.28), 0, 0, -8.6, 0, 0, 0, 0.78, 0.78, 0.78));
    P_.add('glow', T(CYL(), 0, 0, -10, PI / 2, 0, 0, 0.42, 0.6, 0.42));
  }
  P_.add('metal', T(BOX(), 0, 1.0, -1.2, 0, 0, 0, 1.0, 1.2, 1.6)); // Halterung
  const g = P_.merge();
  g.muzzle = muzzle;
  return g;
}

function genGeometry(key) {
  const P_ = new Parts();
  if (key.startsWith('sh')) {
    // flaches gepanzertes Modul, eingelassen; nur zwei schmale Leuchtschlitze
    P_.add('metal', T(BOX(), 0, 0.3, 0, 0, 0, 0, 3.6, 0.6, 3.8));
    P_.add('dark', T(BOX(), 0, 0.66, 0, 0, 0, 0, 2.8, 0.16, 3.0));
    for (const s of [-1, 1]) P_.add('glow', T(BOX(), s * 0.75, 0.75, 0, 0, 0, 0, 0.22, 0.06, 2.4));
    P_.add('metal', T(BOX(), 0, 0.8, -1.2, 0, 0, 0, 1.0, 0.18, 0.6));
  } else if (key.startsWith('dr')) {
    P_.add('metal', T(CYL(), 0, 0.9, 0, PI / 2, 0, 0, 1.2, 3, 1.2));
    P_.add('metal', T(NOZ(1.4), 0, 0.9, 2.0, PI / 2, 0, 0, 1.2, 1.2, 1.2));
    P_.add('glow', T(DISC(), 0, 0.9, 2.55, 0, 0, 0, 1.3, 1.3, 1));
  } else {
    P_.add('metal', T(BOX(), 0, 0.6, 0, 0, 0, 0, 2.4, 1.2, 2.4));
    P_.add('glow', T(BOX(), 0, 1.25, 0, 0, 0, 0, 1.4, 0.15, 1.4));
  }
  return P_.merge();
}
const GEN_GLOW = (key) => key.startsWith('sh') ? SHIELD_COLOR : key.startsWith('dr') ? 0xffb35a : 0xd8dce4;

// ---------- Gegner (Einheitsgröße ≈ Radius 1, Bug nach −z) ----------
function enemyGeometry(type) {
  const P_ = new Parts();
  if (type === 'raider') {
    // geschlossene Kampfsilhouette: Pfeilrumpf, durchgehender Pfeilflügel, Triebwerksgondeln am Flügel
    P_.add('body', E([[0, 1.28], [0.2, 0.72], [0.29, -0.05], [0.26, -0.82], [-0.26, -0.82], [-0.29, -0.05], [-0.2, 0.72]], 0.3, 0.04, 1, -0.15));
    P_.add('body', E([[0.24, 0.42], [0.98, -0.32], [1.02, -0.58], [0.72, -0.62], [0.3, -0.5], [-0.3, -0.5], [-0.72, -0.62], [-1.02, -0.58], [-0.98, -0.32], [-0.24, 0.42]], 0.11, 0.02, 1, -0.06));
    P_.add('dark', E([[0, 0.62], [0.12, 0.3], [0.13, -0.3], [-0.13, -0.3], [-0.12, 0.3]], 0.12, 0.03, 1, 0.15)); // Kanzel
    for (const s of [-1, 1]) {
      P_.add('dark', T(CYL(), s * 0.46, -0.02, 0.5, PI / 2, 0, 0, 0.15, 0.62, 0.15));   // Gondel
      P_.add('body', T(NOZ(1.25), s * 0.46, -0.02, 0.83, PI / 2, 0, 0, 0.15, 0.1, 0.15));
      P_.add('glow', T(DISC(), s * 0.46, -0.02, 0.885, 0, 0, 0, 0.12, 0.12, 1));
      P_.add('dark', beam(s * 0.92, -0.03, -0.45, s * 0.92, -0.03, 0.15, 0.07, 0.07)); // Waffe an der Flügelspitze
      P_.add('dark', beam(s * 0.3, 0.12, 0.6, s * 0.72, 0.06, -0.3, 0.05, 0.05));      // Flügelrippe
      P_.add('glow', T(BOX(), s * 0.98, 0.03, -0.42, 0, 0, 0, 0.05, 0.04, 0.12));
    }
    P_.add('glow', T(BOX(), 0, 0.17, -0.7, 0, 0, 0, 0.05, 0.03, 0.22));
  } else if (type === 'jackal') {
    for (const s of [-1, 1]) {
      P_.add('body', E(s < 0
        ? [[-0.15, 1.25], [-0.12, -0.5], [-0.3, -0.9], [-0.58, -0.6], [-0.48, 0.9]]
        : [[0.15, 1.25], [0.48, 0.9], [0.58, -0.6], [0.3, -0.9], [0.12, -0.5]], 0.26, 0.02, 1, -0.13));
      P_.add('glow', T(BOX(), s * 0.18, 0.02, -1.22, 0, 0, 0, 0.08, 0.08, 0.1));
      P_.add('dark', T(BOX(), s * 0.68, -0.05, 0.05, 0, 0, 0, 0.18, 0.22, 0.9));
      P_.add('glow', T(BOX(), s * 0.68, -0.05, 0.52, 0, 0, 0, 0.14, 0.14, 0.06));
      P_.add('glow', T(BOX(), s * 0.52, 0.15, 0.3, 0, 0, 0, 0.04, 0.04, 0.8));
    }
    P_.add('body', T(BOX(), 0, 0, 0.2, 0, 0, 0, 0.5, 0.3, 1.2));
    P_.add('dark', E([[-0.25, 0.4], [0.25, 0.4], [0.18, -0.6], [-0.18, -0.6]], 0.18, 0, 1, 0.14));
    P_.add('glow', T(BOX(), 0, 0.33, -0.15, 0, 0, 0, 0.3, 0.03, 0.05));
    P_.add('glow', T(BOX(), 0, 0, 0.82, 0, 0, 0, 0.3, 0.16, 0.06));
  } else if (type === 'vulture') {
    P_.add('body', E([[0, 0.75], [0.25, 0.45], [1.2, 0.1], [1.1, -0.2], [0.78, -0.08], [0.62, -0.45], [0.38, -0.25], [0.2, -0.8], [0, -0.6],
      [-0.2, -0.8], [-0.38, -0.25], [-0.62, -0.45], [-0.78, -0.08], [-1.1, -0.2], [-1.2, 0.1], [-0.25, 0.45]], 0.16, 0.02, 1, -0.08));
    P_.add('dark', T(BOX(), 0, 0.12, 0, 0, 0, 0, 0.3, 0.26, 1.3));
    for (const s of [-1, 1]) {
      P_.add('dark', beam(s * 0.2, 0, -0.6, s * 0.12, -0.05, -1.1, 0.09, 0.12));
      P_.add('dark', beam(s * 0.12, -0.05, -1.1, s * 0.02, -0.08, -1.2, 0.07, 0.1));
      P_.add('glow', beam(s * 0.3, 0.1, -0.35, s * 1.1, 0.1, -0.08, 0.04, 0.03));
      P_.add('glow', T(BOX(), s * 0.36, 0, 0.3, 0, 0, 0, 0.16, 0.1, 0.06));
      P_.add('body', T(BOX(), s * 0.85, 0.12, 0.05, 0, 0, s * -0.4, 0.04, 0.3, 0.35));
    }
    P_.add('glow', T(BOX(), 0, 0.26, -0.4, 0, 0, 0, 0.1, 0.03, 0.2));
  } else if (type === 'larva') {
    // organischer Schwarmkörper: überlappende Chitinsegmente, Rückenplatten, leuchtende Fugen zwischen den
    // Segmenten (Biolumineszenz), Kopf mit Mandibeln, nach hinten gelegte Fortsätze, Schwanzstachel
    const seg = [[-0.78, 0.36], [-0.4, 0.46], [0, 0.5], [0.42, 0.42], [0.8, 0.3], [1.08, 0.18]];
    for (const [z, r] of seg) {
      P_.add('body', T(SPH(), 0, 0, z, 0, 0, 0, r * 1.08, r * 0.62, r * 0.82));
      P_.add('dark', T(HALF(), 0, r * 0.18, z - r * 0.08, -0.25, 0, 0, r * 0.9, r * 0.52, r * 0.66));
    }
    for (let i = 0; i < seg.length - 1; i++) {
      const z = (seg[i][0] + seg[i + 1][0]) / 2, r = Math.min(seg[i][1], seg[i + 1][1]);
      P_.add('glow', T(TOR(0.035), 0, 0.02, z, 0, 0, 0, r * 0.97, r * 0.6, 1));
    }
    P_.add('glow', T(SPH(), 0, 0.05, -0.05, 0, 0, 0, 0.26, 0.22, 0.42));       // Kern
    P_.add('body', T(SPH(), 0, 0, -1.02, 0, 0, 0, 0.3, 0.22, 0.32));           // Kopf
    for (const s of [-1, 1]) {
      // Mandibeln: zwei Glieder, nach innen gebogen
      P_.add('dark', beam(s * 0.16, 0, -1.12, s * 0.34, -0.02, -1.42, 0.08, 0.06));
      P_.add('dark', beam(s * 0.34, -0.02, -1.42, s * 0.12, -0.03, -1.62, 0.06, 0.05));
      P_.add('glow', T(SPH(), s * 0.12, 0.1, -1.18, 0, 0, 0, 0.05, 0.05, 0.05));  // Augenpunkte
      // Fortsätze: drei Paare, nach hinten gelegt
      for (let k = 0; k < 3; k++) {
        const z = -0.5 + k * 0.45, r = seg[k + 1][1];
        P_.add('dark', beam(s * r * 0.95, -0.06, z, s * (r + 0.42), -0.16, z + 0.35, 0.06, 0.05));
        P_.add('dark', beam(s * (r + 0.42), -0.16, z + 0.35, s * (r + 0.5), -0.22, z + 0.7, 0.05, 0.04));
      }
    }
    P_.add('dark', spike(0, 0.02, 1.22, 0, 0.1, 1, 0.08, 0.5));
  } else { // spiker (und unbekannte Schwarm-Typen)
    P_.add('body', T(ICO(), 0, 0, 0, 0, 0, 0, 0.62, 0.55, 0.62));
    const N = 14;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      const dx = Math.cos(th) * r, dy = y * 0.55, dz = Math.sin(th) * r;
      P_.add('body', spike(dx * 0.5, dy * 0.5, dz * 0.5, dx, dy, dz, 0.1, 0.62));
      P_.add('glow', T(SPH(), dx * 1.12, dy * 1.12, dz * 1.12, 0, 0, 0, 0.06, 0.06, 0.06));
      if (i % 2 === 0) P_.add('glow', T(SPH(), dx * 0.58, dy * 0.5, dz * 0.58, 0, 0, 0, 0.09, 0.09, 0.09));
    }
  }
  return P_.merge();
}

// Sprungtor: Hauptring mit Segmentblöcken, sechs Stützen mit Plattenstruktur
function portalGeometry() {
  const P_ = new Parts();
  P_.add('metal', T(TOR(0.075), 0, 0, 0, PI / 2, 0, 0, 98, 98, 98));
  P_.add('glow', T(TOR(0.012), 0, 2, 0, PI / 2, 0, 0, 90, 90, 90));
  P_.add('dark', T(TOR(0.03), 0, -4, 0, PI / 2, 0, 0, 92, 92, 92));
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * PI * 2;
    P_.add('dark', T(BOX(), Math.cos(a) * 98, 0, Math.sin(a) * 98, 0, -a, 0, 9, 17, 4));
    P_.add('metal', T(BOX(), Math.cos(a) * 104, 0, Math.sin(a) * 104, 0, -a, 0, 3, 11, 2.2));
  }
  const outer = new Parts();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2, c = Math.cos(a), s = Math.sin(a);
    outer.add('metal', T(BOX(), c * 118, 0, s * 118, 0, -a, 0, 26, 12, 18));
    outer.add('dark', T(BOX(), c * 118, 6.4, s * 118, 0, -a, 0, 20, 1, 12));
    outer.add('dark', T(BOX(), c * 134, 0, s * 134, 0, -a, 0, 8, 8, 11));
    outer.add('metal', T(CYL(), c * 140, 0, s * 140, 0, 0, PI / 2, 3.5, 6, 3.5));
    outer.add('glow', T(BOX(), c * 112, 6.6, s * 112, 0, -a, 0, 0.5, 0.4, 14));
    outer.add('glow', T(BOX(), c * 124, 6.6, s * 124, 0, -a, 0, 0.5, 0.4, 14));
    outer.add('metal', beam(c * 104, -6, s * 104, c * 134, -3, s * 134, 3, 2));
    outer.add('dark', beam(c * 106, 5, s * 106, c * 130, 5, s * 130, 1.2, 1.2));
  }
  return { ring: P_.merge(), outer: outer.merge() };
}

// Beutecontainer: Rahmen, dunkle Platten, schmale Leuchtfugen statt leuchtendem Würfel
function crateGeometry() {
  const P_ = new Parts();
  const h = 6;
  const C = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
  const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (const [a, b] of EDGES) P_.add('metal', beam(C[a][0], C[a][1], C[a][2], C[b][0], C[b][1], C[b][2], 1.6, 1.6));
  P_.add('plate', T(BOX(), 0, 0, 0, 0, 0, 0, 11, 11, 11));
  P_.add('glow', T(BOX(), 0, 0, 0, 0, 0, 0, 11.3, 0.35, 11.3));
  P_.add('glow', T(BOX(), 0, 3.2, 0, 0, 0, 0, 11.25, 0.18, 11.25));
  return P_.merge();
}

// Wrack: abgerissene Rumpfplatten mit gezackten Rändern, gebrochene Spanten, ein Triebwerksstumpf,
// Glut nur an den Risskanten; dazwischen der Frachtbehälter mit schmalen Leuchtfugen
function jag(r, n, rx, ry, rough) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2, k = 1 - rough * r();
    pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]);
  }
  return pts;
}
function wreckGeometry(variant) {
  const r = rng(900 + variant * 77);
  const P_ = new Parts();
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * PI * 2 + r(), d = 12 + r() * 10;
    const pts = jag(r, 9, 6 + r() * 6, 4 + r() * 5, 0.45);
    const g = E(pts, 1.1, 0, 1, -0.55);
    const px = Math.cos(a) * d, py = (r() - 0.5) * 6, pz = Math.sin(a) * d, rx = (r() - 0.5) * 1.2, ry = r() * 6, rz = (r() - 0.5) * 1.2;
    P_.add('metal', T(g, px, py, pz, rx, ry, rz));
    // Spanten unter der Platte, Glutkante an einer Risskante (gleiche Lage wie die Platte)
    for (let k = -1; k <= 1; k++) {
      const sp = beam(k * 3, -1.4, -4, k * 3 + r() * 2, -1.4, 4, 0.6, 1.2);
      P_.add('dark', T(sp, px, py, pz, rx, ry, rz)); sp.dispose();
    }
    const b0 = pts[(i * 2) % pts.length], b1 = pts[(i * 2 + 1) % pts.length];
    const em = beam(b0[0], 0, -b0[1], b1[0], 0, -b1[1], 0.35, 1.25);
    P_.add('ember', T(em, px, py, pz, rx, ry, rz)); em.dispose();
    g.dispose();
  }
  // gebrochene Träger
  for (let i = 0; i < 3; i++) {
    const a = r() * PI * 2, l = 14 + r() * 16;
    P_.add('dark', beam(Math.cos(a) * 4, (r() - 0.5) * 4, Math.sin(a) * 4, Math.cos(a) * l, (r() - 0.5) * 6, Math.sin(a) * l, 1.6, 1.6));
  }
  // Triebwerksstumpf
  const ex = (r() - 0.5) * 16, ez = 14 + r() * 6;
  P_.add('dark', T(CYL(), ex, 0, ez, PI / 2, 0, r(), 3.2, 7, 3.2));
  P_.add('metal', T(NOZ(1.3), ex, 0, ez + 5, PI / 2, 0, r(), 3.2, 3, 3.2));
  P_.add('ember', T(TOR(0.08), ex, 0, ez + 6.4, 0, 0, 0, 4.1, 4.1, 4.1));
  // Frachtbox
  P_.add('cargoFrame', T(BOX(), 0, 0, 0, 0, 0.4, 0, 11, 7, 7));
  P_.add('cargo', T(BOX(), 0, 1.2, 0, 0, 0.4, 0, 11.2, 0.22, 7.2));
  P_.add('cargo', T(BOX(), 0, -1.2, 0, 0, 0.4, 0, 11.2, 0.22, 7.2));
  return P_.merge();
}

// Erzbrocken: unregelmäßiger Asteroid (verformte Icosphere mit Rauschen in drei Oktaven)
function oreGeometry(variant) {
  const r = rng(300 + variant * 13);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const pos = g.attributes.position;
  const k = [];
  for (let i = 0; i < 9; i++) k.push(r() * 10);
  const stretch = [1 + r() * 0.4, 0.7 + r() * 0.15, 0.85 + r() * 0.3];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let n = 0.78 + 0.2 * Math.sin(x * 2.1 + k[0]) * Math.cos(y * 1.9 + k[1]) * Math.sin(z * 2.3 + k[2]);
    n += 0.09 * Math.sin(x * 5.3 + k[3] + y * 2.2) * Math.cos(z * 4.7 + k[4]);
    n += 0.04 * Math.sin(x * 11.0 + k[5]) * Math.sin(y * 12.0 + k[6]) * Math.sin(z * 10.0 + k[7]);
    if (Math.sin(x * 3 + k[8]) > 0.75) n -= 0.06; // abgeplatzte Flächen
    pos.setXYZ(i, x * n * stretch[0], y * n * stretch[1], z * n * stretch[2]);
  }
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
const ORE_VEIN = { nickel: [0xd8ccb4, 0.55], cobalt: [0x4a7aff, 1.1], platinum: [0xeef0ff, 0.8] };

// ---------- Fabrik ----------
// Fels mit Detail-Relief: Höhenrauschen im Objektraum (3 Oktaven) stört die glatte Normale per Bildschirm-Ableitung
// (wie eine Bump-Map, aber ohne Textur und ohne UV-Nähte) und färbt Vertiefungen leicht dunkler.
function rockDetailMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x5e564c, roughness: 0.93, metalness: 0.08, vertexColors: true, envMapIntensity: 0.35 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vRk;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vRk = position;');
    sh.fragmentShader = 'varying vec3 vRk;\n' + NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
  float rkH = snoise(vRk * 4.2) * 0.55 + snoise(vRk * 11.0) * 0.3 + snoise(vRk * 27.0) * 0.15;
  diffuseColor.rgb *= 0.86 + 0.24 * rkH;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    vec3 sp = -vViewPosition;
    vec3 dpx = dFdx(sp), dpy = dFdy(sp);
    vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
    float det = dot(dpx, r1);
    vec2 dh = vec2(dFdx(rkH), dFdy(rkH)) * 2.6;
    vec3 gd = sign(det) * (dh.x * r1 + dh.y * r2);
    normal = normalize(abs(det) * normal - gd);
  }`);
  };
  m.customProgramCacheKey = () => 'lsRockDetail';
  return m;
}


// Eingelesene GLB-Dateien über alle Sitzungen (jeder Flug hat eine eigene Grafik-Engine): einmal laden und
// entpacken, danach nur klonen. preloadGLB() darf schon vor dem Flug laufen (Startsequenz), dann steht das
// eigene Schiff beim ersten Bild bereit und es gibt keinen sichtbaren Wechsel vom Platzhalter.
const GLB_CACHE = new Map();
let _glbLoader = null;
async function glbLoader() {
  if (!_glbLoader) _glbLoader = (async () => {
    const [mod, opt] = await Promise.all([
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    ]);
    const l = new mod.GLTFLoader();
    l.setMeshoptDecoder(opt.MeshoptDecoder);
    return l;
  })();
  return _glbLoader;
}
export function preloadGLB(url) {
  let p = GLB_CACHE.get(url);
  if (!p) {
    p = glbLoader().then((l) => l.loadAsync(url));
    p.catch(() => GLB_CACHE.delete(url));
    GLB_CACHE.set(url, p);
  }
  return p;
}
export function glbLoaded(url) { return GLB_CACHE.has(url); }

const GLB_PREFIX = { player: 'ship', station: 'station', enemy: 'enemy', nest: 'enemy', portal: 'portal', crate: 'crate', wreck: 'wreck', ore: 'ore' };

export class ModelFactory {
  constructor() {
    this.uTime = { value: 0 };     // gemeinsame Zeit für alle Shader
    this.uPointScale = { value: 800 }; // Pixel je Meter in 1 m Abstand (Renderer setzt ihn bei Größenänderung)
    this.geos = new Map();
    this.mats = new Map();
    this.glb = new Map();
    this.version = 0;              // steigt, wenn ein GLB fertig geladen ist → Ansichten bauen neu
    this.glbVers = {};
    this.glbKeyVers = {};          // je genauem Schlüssel ('ship:s1:europa')
    this._marks = new Map();       // Rumpfmaße je Schiffsrumpf (Positionslichter, Kennung)             // je Schlüsselanfang ('ship', 'station', …): nur betroffene Ansichten bauen neu
    this.prepare = null;           // optional async (key, wrap): vor dem Umschalten vorbereiten (Shader, Texturen)
    this._loader = null;
  }

  geo(key, make) { let g = this.geos.get(key); if (!g) { g = make(); this.geos.set(key, g); } return g; }
  mat(key, make) { let m = this.mats.get(key); if (!m) { m = make(); this.mats.set(key, m); } return m; }

  // o: color, metal, rough, emissive, ei, flat, env, ao (Vertex-Kontaktschatten, Standard an),
  //    panel (Platten je Meter → Rumpfdetail), lines, grime, wear, tilt, rim, win/winX/winY/winCol/winK/winFill,
  //    glass (durchsichtig, opacity)
  std(key, o) {
    return this.mat('std:' + key, () => {
      const m = new THREE.MeshStandardMaterial({
        color: o.color, metalness: o.metal ?? 0.5, roughness: o.rough ?? 0.5,
        emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat,
        envMapIntensity: o.env ?? 1, vertexColors: o.ao !== false,
      });
      if (o.glass) { m.transparent = true; m.opacity = o.glass; m.depthWrite = false; }
      if (o.panel) {
        hullDetail(m, {
          panel: o.panel, lines: o.lines ?? 0.45, grime: o.grime ?? 0.3, wear: o.wear ?? 1, tilt: o.tilt ?? 0.07, rim: o.rim ?? 0.1,
          win: o.win ? 1 : 0, winX: o.winX ?? 5, winY: o.winY ?? 6, winCol: o.winCol ?? 0xffd9a8, winK: o.winK ?? 1.1, winFill: o.winFill ?? 0.62,
        });
      }
      return m;
    });
  }
  glow(hex, k = 2.5) {
    return this.mat(`glow:${hex}:${k}`, () => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) });
      return m;
    });
  }
  sprite(hex, k = 1.5, key = '') {
    return this.mat(`spr:${hex}:${k}:${key}`, () => new THREE.SpriteMaterial({
      map: getGlowTexture(), color: new THREE.Color(hex).multiplyScalar(k),
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    }));
  }
  // Triebwerksstrahl: heißes Plasma, weißer Kern an der Düse, farbiger Strahl, Flimmern und Schockringe
  trailMat(hex) {
    return this.mat('plume:' + hex, () => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(hex) }, uTime: this.uTime },
      vertexShader: PLUME_VS, fragmentShader: PLUME_FS,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    }));
  }
  trailGeo() {
    return this.geo('trail', () => {
      // zwei gekreuzte Flächen von z=0 (Düse) bis z=1 (Ende), v läuft entlang
      const g = new THREE.BufferGeometry();
      const p = new Float32Array([
        -0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1,
        0, -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1,
      ]);
      const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
      g.computeBoundingSphere();
      return g;
    });
  }
  // Schwarm: dunkles, glänzendes Chitin; Kantenlicht (Fresnel) in Akzentfarbe deutet durchscheinendes Gewebe an
  swarmMat(type, color, accent) {
    return this.mat('swarm:v2:' + type, () => {
      const base = new THREE.Color(color).multiplyScalar(0.22);
      const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.28, metalness: 0.35, envMapIntensity: 1.4 });
      const uTime = this.uTime, rim = new THREE.Color(accent);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = uTime;
        sh.uniforms.uRimC = { value: rim };
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          `#include <begin_vertex>
          transformed += normal * (sin(position.z * 6.0 + uTime * 3.6) * 0.03 + sin(position.x * 8.0 - uTime * 2.4) * 0.018);`);
        sh.fragmentShader = 'uniform vec3 uRimC; uniform float uTime;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
          `float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.6);
          outgoingLight += uRimC * fr * (0.3 + 0.12 * sin(uTime * 3.0));
          #include <opaque_fragment>`);
      };
      m.customProgramCacheKey = () => 'swarmChitin';
      return m;
    });
  }

  // GLB für einen Typ hinterlegen (lädt im Hintergrund). Gibt ein Promise zurück.
  // opts.forward: '+z' (Standard, glTF) oder '-z'. opts.scale: feste Größe statt automatischer Anpassung.
  async registerGLB(key, url, opts = {}) {
    const gltf = await preloadGLB(url);
    // Vorlage bleibt unberührt im Zwischenspeicher (Geometrien/Materialien geteilt, je Grafik-Engine neu hochgeladen)
    const src = gltf.scene.clone(true);
    src.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    const flip = (opts.forward || '+z') !== '-z';
    const wrap = new THREE.Group();
    wrap.name = 'glb:' + key;
    wrap.add(src);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(src);
    if (flip) wrap.rotation.y = PI; // glTF-Bug (+z) → Spiel-Bug (−z)
    wrap.userData.glbFlip = flip;
    wrap.userData.glbLen = Math.max(0.001, box.max.z - box.min.z);
    wrap.userData.glbScale = opts.scale ?? null;
    this.glb.set(key, wrap);
    // Vor dem Umschalten vorbereiten (Renderer: Shader parallel übersetzen, Texturen hochladen), damit der Wechsel
    // vom Platzhalter zum echten Modell nicht mitten im Flug ruckelt
    if (this.prepare) { try { await this.prepare(key, wrap); } catch (err) { console.warn('Modell-Vorbereitung', key, err); } }
    const pre = key.split(':')[0];
    this.glbVers[pre] = (this.glbVers[pre] || 0) + 1;
    this.glbKeyVers[key] = (this.glbKeyVers[key] || 0) + 1;
    this.version++;
    return wrap;
  }
  // Stand der GLB-Modelle für eine Entity-Art (Ansicht baut nur neu, wenn sich ihr Modell geändert hat)
  glbVer(kind) { return this.glbVers[GLB_PREFIX[kind] || kind] || 0; }
  // Stand genau der Modelle, die eine Ansicht nutzen würde (z. B. 'ship:s1:europa' und Rückfall 'ship:s1')
  keyVer(a, b) { return (this.glbKeyVers[a] || 0) + (b ? this.glbKeyVers[b] || 0 : 0); }
  _glb(...keys) {
    for (const k of keys) { const s = this.glb.get(k); if (s) return s.clone(true); }
    return null;
  }

  _meshes(group, geos, mats) {
    for (const k in geos) {
      const m = mats[k];
      if (!m) continue;
      const mesh = new THREE.Mesh(geos[k], m);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh);
    }
    return group;
  }

  // Zwei Grundtöne je Fraktion: dunkles Metall (Rumpf) plus Fraktions-Akzent nur auf Leisten und Lack
  shipMaterials(faction) {
    const F = FACTIONS[faction] || FACTIONS.europa;
    const D = { panel: 0.17, lines: 0.32, grime: 0.22, rim: 0.16, tilt: 0.04 };
    const dark = this.std('ship:dark', SHIP_DARK);
    if (faction === 'saturn') return {
      hull: this.std('saturn:hull', { color: 0x34353b, metal: 0.62, rough: 0.4, ...D }),
      trim: this.std('saturn:trim', { color: F.color, metal: 0.35, rough: 0.42, ...D, panel: 0.4, lines: 0.3 }),
      dark,
      glass: this.std('glass:saturn', { color: 0x06080b, metal: 0.95, rough: 0.16, emissive: F.glow, ei: 0.04, env: 0.9 }),
      paint: this.std('saturn:paint', { color: F.color, metal: 0.3, rough: 0.5, ...D, panel: 0.5, lines: 0.2 }),
      glow: this.glow(F.glow, 1.6),
      lamp: this.glow(0xffe0c0, 1.2),
      seam: this.glow(F.accent, 1.2),
    };
    if (faction === 'eris') return {
      hull: this.std('eris:hull', { color: 0x2e2d35, metal: 0.72, rough: 0.38, env: 1.3, ...D }),
      trim: this.std('eris:trim', { color: 0x4a4854, metal: 0.85, rough: 0.34, ...D, panel: 0.4, lines: 0.3 }),
      dark,
      glass: this.std('glass:eris', { color: 0x06080b, metal: 0.95, rough: 0.16, emissive: 0x8a90c0, ei: 0.04, env: 0.9 }),
      paint: this.std('eris:paint', { color: 0x6a44b0, metal: 0.35, rough: 0.5, ...D, panel: 0.5, lines: 0.2 }),
      glow: this.glow(F.glow, 1.5),
      lamp: this.glow(F.accent, 1.2),
      seam: this.std('eris:paint', { color: 0x6a44b0, metal: 0.35, rough: 0.5 }),
    };
    return {
      hull: this.std('europa:hull', { color: 0x3a3c43, metal: 0.6, rough: 0.4, ...D }),
      trim: this.std('europa:trim', { color: F.accent, metal: 0.95, rough: 0.28, ...D, panel: 0.4, lines: 0.25 }),
      dark,
      glass: this.std('glass:europa', { color: 0x06080b, metal: 0.95, rough: 0.16, emissive: F.glow, ei: 0.04, env: 0.9 }),
      paint: this.std('europa:paint', { color: 0xd8d4c8, metal: 0.25, rough: 0.5, ...D, panel: 0.5, lines: 0.2 }),
      glow: this.glow(F.glow, 1.5),
      lamp: this.glow(0xfff2dc, 1.2),
      seam: this.glow(F.accent, 1.2),
    };
  }

  // Schiffsmodelle aus einem GLB: dunkles Metall, Fraktionsfarbe nur auf Bug, Flügelspitzen und einem Längsstreifen
  _glbShipLook(hull, faction) {
    const F = FACTIONS[faction] || FACTIONS.europa;
    const box = new THREE.Box3().setFromObject(hull);
    hull.updateMatrixWorld(true);
    hull.traverse((o) => {
      if (!o.isMesh) return;
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const lb = box.clone().applyMatrix4(inv);
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const mats = list.map((m) => {
        if (!m.isMeshStandardMaterial || m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0)) return m;
        const key = `glbship:${faction}:${m.uuid}:${o.name}`;
        return this.mat(key, () => {
          const c = m.clone();
          const size = Math.max(lb.max.x - lb.min.x, lb.max.z - lb.min.z, 1e-3);
          hullDetail(c, { panel: 9 / size, lines: 0.35, grime: 0.25, rim: 0.16, tilt: 0.05 });
          const prev = c.onBeforeCompile;
          const bmin = lb.min.clone(), bmax = lb.max.clone(), acc = new THREE.Color(F.color);
          c.onBeforeCompile = (sh, r) => {
            prev(sh, r);
            sh.uniforms.uBMin = { value: bmin }; sh.uniforms.uBMax = { value: bmax }; sh.uniforms.uAcc = { value: acc };
            sh.fragmentShader = 'uniform vec3 uBMin, uBMax, uAcc;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
              {
                vec3 bn = (vObjP - uBMin) / max(uBMax - uBMin, vec3(1e-4));
                float ax = abs(bn.x * 2.0 - 1.0);
                float acc = smoothstep(0.83, 0.86, bn.z) + smoothstep(0.86, 0.89, ax)
                          + (smoothstep(0.30, 0.32, ax) - smoothstep(0.36, 0.38, ax)) * step(0.35, bn.z);
                float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
                vec3 metal = vec3(0.105, 0.108, 0.118) * (0.6 + 1.5 * lum);
                diffuseColor.rgb = mix(metal, mix(diffuseColor.rgb, uAcc * (0.5 + lum), 0.35), clamp(acc, 0.0, 1.0));
              }`);
          };
          c.customProgramCacheKey = () => 'glbship:' + faction;
          c.metalness = 0.65; c.roughness = Math.min(c.roughness, 0.5);
          return c;
        });
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
      o.receiveShadow = true;
    });
  }

  // Positionslichter (rot links, grün rechts, weißer Doppelblitz am Heck) und Kennung auf dem Rumpf
  _shipMarks(bank, hull, faction, shipId) {
    bank.updateMatrixWorld(true);
    // Rumpfmaße und Auftreffpunkte der Kennung je Rumpf einmal berechnen (82.000 Ecken durchlaufen und zweimal
    // Strahl gegen alle Dreiecke kostete ≈ 30 ms je Aufbau → Ruckler, wenn das echte Modell nachlädt)
    let firstGeo = '';
    hull.traverse((o) => { if (!firstGeo && o.isMesh) firstGeo = o.geometry.uuid; });
    const ck = `${faction}:${shipId}:${hull.userData.glbFlip ?? 'p'}:${hull.scale.x.toFixed(5)}:${firstGeo}`;
    let M = this._marks.get(ck);
    if (!M) {
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, minZv = 0, maxZv = 0, minYv = 0, maxYv = 0;
      eachVertex(hull, bank, (p) => {
        if (p.x < minX) { minX = p.x; minZv = p.z; minYv = p.y; }
        if (p.x > maxX) { maxX = p.x; maxZv = p.z; maxYv = p.y; }
        if (p.y > maxY) maxY = p.y;
        if (p.z > maxZ) maxZ = p.z;
      });
      M = { minX, maxX, maxY, maxZ, minZv, maxZv, minYv, maxYv, hits: [] };
      if (isFinite(minX)) {
        const ray = new THREE.Raycaster();
        const span = maxX - minX;
        for (const x of [-span * 0.2, span * 0.2]) {
          ray.set(new THREE.Vector3(x, maxY + 20, 4), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(hull, true).find((h) => h.object.isMesh && h.object.visible && (!h.face || h.face.normal.y > -0.2));
          M.hits.push(hit ? { x, y: hit.point.y } : null);
        }
      }
      this._marks.set(ck, M);
    }
    const { minX, maxX, maxY, maxZ, minZv, maxZv, minYv, maxYv } = M;
    if (!isFinite(minX)) return;
    const geo = this.geo(`shipnav:${faction}:${shipId}:${hull.userData.glbFlip ?? 'p'}`, () => lightPointsGeometry([
      [0, minX - 0.3, minYv + 0.4, minZv, 2.6, 1.6, 0.12, 0.06, 0],
      [0, maxX + 0.3, maxYv + 0.4, maxZv, 2.6, 0.2, 1.4, 0.45, 0],
      [2, 0, maxY * 0.7, maxZ - 3, 3.2, 1.7, 1.7, 1.7, 0],
      [2, 0, -1.5, maxZ - 6, 2.4, 1.7, 1.7, 1.7, 0.8],
    ]));
    const pts = new THREE.Points(geo, this.mat('navpts', () => lightPointsMaterial(this.uTime, this.uPointScale)));
    pts.frustumCulled = false; pts.renderOrder = 12;
    bank.add(pts);
    // Kennung: auf die Rumpfoberseite geschossen (Strahl von oben)
    const F = FACTIONS[faction] || FACTIONS.europa;
    const text = `${F.prefix || 'LS'}-${shipId === 's1' ? '01' : String(shipId).replace(/\D/g, '').padStart(2, '0')}`;
    const span = maxX - minX;
    for (const hit of M.hits) {
      if (!hit) continue;
      const x = hit.x;
      const w = Math.min(8, span * 0.17), plane = new THREE.Mesh(this.geo('shipmark', () => new THREE.PlaneGeometry(1, 0.25).rotateX(-PI / 2)), this._markMat(text));
      plane.scale.setScalar(w);
      plane.position.set(x, hit.y + 0.08, 4);
      plane.renderOrder = 3;
      bank.add(plane);
    }
  }
  _markMat(text) {
    return this.mat('mark:' + text, () => {
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      const c = cv.getContext('2d');
      c.fillStyle = '#d8d6d0'; c.font = '700 54px "DIN Condensed", "Arial Narrow", sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      try { c.letterSpacing = '4px'; } catch { /* egal */ }
      c.fillText(text, 128, 36);
      c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 90; i++) { c.globalAlpha = Math.random() * 0.7; c.fillRect(Math.random() * 256, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 2); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      return new THREE.MeshStandardMaterial({
        map: t, transparent: true, depthWrite: false, metalness: 0.2, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2,
      });
    });
  }

  // Spielerschiff: jeder Laser/Generator aus loadout wird ein sichtbares Bauteil
  buildShip(faction, shipId, loadout) {
    faction = FACTIONS[faction] ? faction : 'europa';
    const F = FACTIONS[faction];
    const layout = SHIP_LAYOUT[shipId] || SHIP_LAYOUT.s2;
    const root = new THREE.Group();
    const bank = new THREE.Group();
    root.add(bank);
    let hull = this._glb(`ship:${shipId}:${faction}`, `ship:${shipId}`);
    const placeholder = !hull;
    if (placeholder) {
      hull = new THREE.Group();
      hull.scale.setScalar(layout.scale);
      const geos = this.geo(`ship:${shipId}:${faction}`, () => shipGeometry(faction, shipId));
      this._meshes(hull, geos, this.shipMaterials(faction));
      // Andockpunkte wie in einem GLB
      const engs = layout.centerEngine
        ? [[-7, 0, 23.2, 1], [7, 0, 23.2, 1], [-15.5, 0, 12.4, 0.62], [15.5, 0, 12.4, 0.62], [0, 0, 23.2, 1]]
        : [[-5, 0, 23.2, 1], [5, 0, 23.2, 1], [-15.5, 0, 12.4, 0.62], [15.5, 0, 12.4, 0.62]];
      engs.forEach((e, i) => {
        const o = new THREE.Object3D(); o.name = hpName('Engine', i);
        o.position.set(e[0], e[1], e[2]); o.userData.size = e[3]; hull.add(o);
      });
      const v = new THREE.Vector3();
      const nL = Math.max(layout.lasers.length, loadout?.lasers?.length || 0);
      for (let i = 0; i < nL; i++) {
        const o = new THREE.Object3D(); o.name = hpName('Laser', i);
        o.position.copy(laserSlotPos(layout, i, v)); hull.add(o);
      }
      const nG = Math.max(layout.gens.length, loadout?.gens?.length || 0);
      for (let i = 0; i < nG; i++) {
        const o = new THREE.Object3D(); o.name = hpName('Gen', i);
        o.position.copy(genSlotPos(layout, i, v)); hull.add(o);
      }
    }
    bank.add(hull);
    // Echtes Modell: auf die Platzhalter-Länge (≈ 44 m × scale) bringen; Bauteile behalten ihre Größe.
    const glbFlip = !placeholder && !!hull.userData.glbFlip;
    const fit = placeholder ? 1 : (hull.userData.glbScale ?? (44 * layout.scale) / (hull.userData.glbLen || 44));
    if (!placeholder) { hull.scale.setScalar(fit); this._glbShipLook(hull, faction); }
    else hull.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    this._shipMarks(bank, hull, faction, shipId);
    const mount = (hp, obj, turn) => {
      if (placeholder) { hp.add(obj); return; }
      const a = new THREE.Group();
      a.scale.setScalar(1 / fit);
      if (turn && glbFlip) a.rotation.y = PI; // Bauteile zeigen nach −z, HP-Punkte im GLB nach +z
      a.add(obj); hp.add(a);
    };
    const fallbackHP = (pos) => {
      const hp = new THREE.Object3D();
      hp.position.copy(pos);
      if (!placeholder) { hp.position.multiplyScalar(1 / fit); if (glbFlip) { hp.position.x *= -1; hp.position.z *= -1; } }
      hull.add(hp);
      return hp;
    };

    const lasers = [];
    const L = loadout?.lasers || [];
    const metal = this.std('laser:metal', { color: 0x34373e, metal: 0.85, rough: 0.35, panel: 1.0, lines: 0.3, rim: 0.12 });
    const tmp = new THREE.Vector3();
    // Modelle von ChatGPT bringen eigene Laser und Generatoren mit (Laser_Port, Generator_Port …).
    // Die werden genutzt statt Platzhalter: Laser leuchten in der Farbe ihrer Stufe.
    const own = placeholder ? null : ownParts(hull);
    if (own) {
      own.lasers.forEach((node, i) => { node.visible = i < L.length && !!L[i]; });
      own.gens.forEach((node, i) => { node.visible = i < (loadout?.gens?.length || 0) && !!loadout.gens[i]; });
    }
    for (let i = 0; i < L.length; i++) {
      const key = L[i];
      if (!key || !LASERS[key]) continue;
      if (own && own.lasers[i]) {
        const node = own.lasers[i];
        tintEmissive(node, LASERS[key].color, this);
        const muzzle = new THREE.Object3D();
        muzzle.position.copy(own.muzzles[i]);
        node.parent.add(muzzle);
        const flash = new THREE.Sprite(this.sprite(LASERS[key].color, 2.2));
        flash.scale.setScalar(3.5 / fit);
        muzzle.add(flash);
        lasers.push({ key, slot: i, muzzle, flash, heat: 0, part: null, z0: 0 });
        continue;
      }
      let hp = hull.getObjectByName(hpName('Laser', i));
      if (!hp) hp = fallbackHP(laserSlotPos(layout, i, tmp));
      const lg = this.geo('laser:' + key, () => laserGeometry(key));
      const part = new THREE.Group();
      this._meshes(part, lg, { metal, glow: this.glow(LASERS[key].color, 3.0) });
      const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, lg.muzzle); part.add(muzzle);
      const flash = new THREE.Sprite(this.sprite(LASERS[key].color, 2.2));
      flash.position.copy(muzzle.position); flash.scale.setScalar(3.5); part.add(flash);
      mount(hp, part, true);
      lasers.push({ key, slot: i, muzzle, flash, heat: 0, part, z0: part.position.z });
    }
    const G = loadout?.gens || [];
    const gmetal = this.std('gen:metal', { color: 0x3a3d44, metal: 0.8, rough: 0.38, panel: 1.2, lines: 0.3, rim: 0.12 });
    for (let i = 0; i < G.length; i++) {
      const key = G[i];
      if (!key) continue;
      if (own && own.gens[i]) continue;
      let hp = hull.getObjectByName(hpName('Gen', i));
      if (!hp) hp = fallbackHP(genSlotPos(layout, i, tmp));
      const gg = this.geo('gen:' + key, () => genGeometry(key));
      const part = new THREE.Group();
      this._meshes(part, gg, { metal: gmetal, dark: this.std('ship:dark', SHIP_DARK), glow: this.glow(GEN_GLOW(key), 1.5) });
      mount(hp, part, true);
    }
    // Triebwerke: Glühen + Schweif
    const engines = [];
    // Abgas in Fraktionsfarbe (Saturn Bernstein, Europa Eisblau, Eris Violett), weißer Kern im Shader
    const plumeHex = faction === 'saturn' ? 0xff8a3a : faction === 'eris' ? 0xa060ff : 0x9fd8ff;
    const tg = this.trailGeo(), tm = this.trailMat(plumeHex), sm = this.sprite(plumeHex, 1.1);
    for (let i = 0; i < 16; i++) {
      const hp = hull.getObjectByName(hpName('Engine', i));
      if (!hp) break;
      const size = hp.userData.size || 1;
      const glow = new THREE.Sprite(sm); glow.scale.setScalar(9 * size); mount(hp, glow, false);
      const trail = new THREE.Mesh(tg, tm); trail.scale.set(5.5 * size, 5.5 * size, 20 * size); mount(hp, trail, false);
      engines.push({ hp, glow, trail, size });
    }
    if (own && !engines.length && own.engines.length) { // Düsen an den Leuchtteilen des Modells
      for (const p of own.engines) {
        const hp = new THREE.Object3D(); hp.position.copy(p); hull.add(hp);
        const glow = new THREE.Sprite(sm); glow.scale.setScalar(9); mount(hp, glow, true);
        const trail = new THREE.Mesh(tg, tm); trail.scale.set(5.5, 5.5, 20); mount(hp, trail, true);
        engines.push({ hp, glow, trail, size: 1 });
      }
    }
    if (!placeholder && !engines.length) { // GLB ohne HP_Engine: Düsen an den Platzhalter-Stellen
      const list = layout.centerEngine ? [[-7, 0, 23.2, 1], [7, 0, 23.2, 1], [0, 0, 23.2, 1]] : [[-5, 0, 23.2, 1], [5, 0, 23.2, 1]];
      for (const e of list) {
        const hp = fallbackHP(tmp.set(e[0], e[1], e[2] * layout.scale));
        const glow = new THREE.Sprite(sm); glow.scale.setScalar(9 * e[3]); mount(hp, glow, true);
        const trail = new THREE.Mesh(tg, tm); trail.scale.set(5.5 * e[3], 5.5 * e[3], 20 * e[3]); mount(hp, trail, true);
        engines.push({ hp, glow, trail, size: e[3] });
      }
    }
    return { root, bank, hull, lasers, engines, radius: 24 * layout.scale, placeholder, plumeHex };
  }

  buildEnemy(type) {
    const def = ENEMIES[type] || ENEMIES.raider;
    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('enemy:' + type);
    const swarm = def.group === 'swarm';
    if (g) { g.scale.setScalar(g.userData.glbScale ?? 2 / (g.userData.glbLen || 2)); spin.add(g); }
    else {
      const geos = this.geo('enemy:' + type, () => enemyGeometry(type));
      const body = swarm ? this.swarmMat(type, def.color, def.accent)
        : this.std('enemy:' + type, { color: def.color, metal: 0.72, rough: 0.4, flat: true, panel: 5, lines: 0.5, grime: 0.3, rim: 0.2, tilt: 0.05 });
      this._meshes(spin, geos, {
        body,
        dark: this.std('enemy:dark', { color: 0x1d1e22, metal: 0.8, rough: 0.42, flat: true, panel: 7, lines: 0.4, rim: 0.16 }),
        glow: this.glow(def.accent, swarm ? 0.75 : 2.0),
      });
    }
    // Lichtsignatur je Typ: Schwarm pulsierender Kern, Piraten Triebwerksglühen plus rotes Positionslicht
    const glow = new THREE.Sprite(this.sprite(def.accent, swarm ? 0.9 : 0.8));
    glow.position.set(0, 0.1, swarm ? -0.05 : 0.8);
    glow.scale.setScalar(swarm ? 1.4 : 0.9);
    spin.add(glow);
    if (!swarm) {
      const nav = new THREE.Sprite(this.navMats().red);
      nav.position.set(0, 0.25, type === 'raider' ? -0.75 : -0.4);
      nav.scale.setScalar(0.55);
      spin.add(nav);
    }
    if (!swarm && !g) {
      const tg = this.trailGeo(), tm = this.trailMat(def.accent);
      const ex = type === 'jackal' ? 0.68 : type === 'vulture' ? 0.36 : 0.46;
      const ez = type === 'jackal' ? 0.55 : type === 'vulture' ? 0.33 : 0.88;
      for (const s of [-1, 1]) {
        const tr = new THREE.Mesh(tg, tm);
        tr.position.set(s * ex, 0, ez); tr.scale.set(0.22, 0.22, 1.1);
        spin.add(tr);
      }
    }
    spin.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { root, spin, swarm, glow };
  }

  // Positionslichter (Renderer schaltet die Deckkraft im Takt)
  navMats() {
    return this._nav || (this._nav = {
      red: this.sprite(0xff3a26, 1.4, 'nav:r'), white: this.sprite(0xffffff, 1.3, 'nav:w'), green: this.sprite(0x3aff8a, 1.1, 'nav:g'),
    });
  }

  // Stationen: dunkles Grundmetall (Saturn bewusst dunkel, damit das orange Schiff davor heraussticht),
  // Fraktionsfarbe nur als Akzent; Wohnteile mit Fensterreihen im Material
  stationMaterials(faction) {
    const F = FACTIONS[faction];
    const m = (k, o) => this.std(`st:${faction}:${k}`, { grime: 0.45, rim: 0.08, tilt: 0.025, ...o });
    const glow = (hex, k) => this.glow(hex, k);
    // Fensterbänder: Saturn Bernstein, Eris Violett, Europa warmes Fensterlicht (Forschungsstation, ruhig und edel)
    const fx = faction === 'saturn' ? 0xff9a48 : faction === 'eris' ? 0xa66bff : 0xffd2a0;
    const common = {
      band: glow(fx, faction === 'eris' ? 1.75 : 1.45),           // Fensterbänder in Fraktionsfarbe
      hgl: glow(faction === 'eris' ? 0xc8bcf0 : 0xfff0d8, faction === 'eris' ? 1.15 : 1.6),   // Lichtleisten im Hangar
      shaft: this.std('st:shaft', { color: 0x050506, metal: 0.2, rough: 0.9, env: 0.05, ao: false }),
      pipe: m('pipe', { color: 0x4a4d54, metal: 0.85, rough: 0.38, ao: false, panel: 0.5, lines: 0.2 }),
      vent: m('vent', { color: 0x2a2b30, metal: 0.8, rough: 0.5, ao: false, panel: 1.2, lines: 0.5 }),
      cont: m('cont', { color: 0xffffff, metal: 0.45, rough: 0.55, ao: false, panel: 0.35, lines: 0.6, grime: 0.5 }),
      lamp: glow(0xfff4e0, 0.85),
    };
    if (faction === 'saturn') return {
      ...common,
      hull: m('hull', { color: 0x2a2b30, metal: 0.7, rough: 0.46, panel: 0.16, lines: 0.5 }),
      hab: m('hab', { color: 0x33343a, metal: 0.6, rough: 0.5, panel: 0.2, lines: 0.4, win: 1, winX: 4.2, winY: 5.5, winCol: 0xffc890, winK: 1.0, winFill: 0.58 }),
      trim: m('trim', { color: 0x4b4d53, metal: 0.85, rough: 0.36, panel: 0.25, lines: 0.3 }),
      dark: m('dark', { color: 0x18191d, metal: 0.75, rough: 0.5, panel: 0.2, lines: 0.5 }),
      deck: m('deck', { color: 0x3a3b40, metal: 0.5, rough: 0.6, panel: 0.1, lines: 0.5 }),
      glass: m('glass', { color: 0x161a20, metal: 0.9, rough: 0.1, env: 1.6, glass: 0.45 }),
      domeIn: glow(0xffb070, 0.5),
      paint: m('paint', { color: F.color, metal: 0.35, rough: 0.5, panel: 0.35, lines: 0.3, grime: 0.55 }),
      rad: m('rad', { color: 0x8a8780, metal: 0.25, rough: 0.55, panel: 0.25, lines: 0.4 }),
      win: glow(0xffd0a0, 1.1), accent: glow(0xffa060, 0.9),
      tank: m('tank', { color: 0x6c6a66, metal: 0.5, rough: 0.42, ao: false, panel: 0.3, lines: 0.3 }),
    };
    if (faction === 'eris') return {
      ...common,
      // Eris: Rumpf weniger spiegelnd (helle Dachflächen am Steg überstrahlten sonst im Bloom)
      // Eris: schwarzer Stahl (Zellenblöcke fast schwarz, Kanten fangen das Licht), violettes Zellenlicht
      hull: m('hull', { color: 0x38363f, metal: 0.62, rough: 0.48, env: 0.95, panel: 0.1, lines: 0.5 }),
      hab: m('hab', { color: 0x24232a, metal: 0.7, rough: 0.4, env: 1.3, panel: 0.12, lines: 0.5, win: 1, winX: 5, winY: 7, winCol: 0xb89cff, winK: 0.8, winFill: 0.3 }),
      trim: m('trim', { color: 0x56545f, metal: 0.82, rough: 0.42, env: 0.9, panel: 0.2, lines: 0.3 }),
      dark: m('dark', { color: 0x1b1a20, metal: 0.75, rough: 0.48, panel: 0.15, lines: 0.5 }),
      deck: m('deck', { color: 0x34333a, metal: 0.5, rough: 0.6, panel: 0.12, lines: 0.5 }),
      glass: m('glass', { color: 0x10111a, metal: 0.9, rough: 0.1, env: 1.6, glass: 0.5 }),
      domeIn: glow(0xb8c4ff, 0.55),
      paint: m('paint', { color: 0x5a3e92, metal: 0.35, rough: 0.6 }),
      rad: m('rad', { color: 0x6a6870, metal: 0.3, rough: 0.55, panel: 0.25 }),
      win: glow(0xc8d2ff, 0.9), accent: glow(F.accent, 0.85),
      tank: m('tank', { color: 0x45444c, metal: 0.6, rough: 0.4, ao: false, panel: 0.3 }),
    };
    // Europa: weiße Keramik (matt glänzend, kaum Metall) mit Gold, warmes Fensterlicht, dunkle Fugen
    return {
      ...common,
      hull: m('hull', { color: 0xd9d6cd, metal: 0.12, rough: 0.36, env: 0.8, panel: 0.12, lines: 0.32, grime: 0.22 }),
      hab: m('hab', { color: 0xcfccc2, metal: 0.1, rough: 0.4, env: 0.75, panel: 0.14, lines: 0.32, grime: 0.22, win: 1, winX: 4.5, winY: 5, winCol: 0xffd6a0, winK: 1.15, winFill: 0.62 }),
      trim: m('trim', { color: F.accent, metal: 0.95, rough: 0.28, panel: 0.12, lines: 0.25, grime: 0.15 }),
      dark: m('dark', { color: 0x2a2b30, metal: 0.7, rough: 0.46, panel: 0.12, lines: 0.5 }),
      deck: m('deck', { color: 0xbcb9b0, metal: 0.15, rough: 0.5, panel: 0.09, lines: 0.3, grime: 0.3 }),
      glass: m('glass', { color: 0x2a2214, metal: 0.95, rough: 0.05, env: 2.2, glass: 0.55 }),
      domeIn: glow(0xffd09a, 0.5),
      paint: m('paint', { color: 0xb08a3a, metal: 0.3, rough: 0.6 }),
      rad: m('rad', { color: 0xc8c4b8, metal: 0.25, rough: 0.5, panel: 0.25, lines: 0.4 }),
      win: glow(0xffe0b8, 1.15), accent: glow(F.accent, 1.1),
      tank: m('tank', { color: 0xe2ded4, metal: 0.2, rough: 0.4, ao: false, panel: 0.3, lines: 0.3 }),
    };
  }

  buildStation(faction, away = 0) {
    faction = FACTIONS[faction] ? faction : 'europa';
    const root = new THREE.Group();
    const spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('station:' + faction, 'station');
    if (g) { spin.add(g); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return { root, spin, spinRate: 0.035 }; }
    const geos = this.geo('station:v6:' + faction, () => stationParts(faction));
    const mats = this.stationMaterials(faction);
    const hub = new THREE.Group();
    root.add(hub);
    const arms = new THREE.Group();
    arms.rotation.y = away;
    root.add(arms);
    const groups = { hub, spin, arms };
    for (const k in groups) this._meshes(groups[k], geos[k], mats);
    for (const k in groups) groups[k].traverse((o) => { if (o.isMesh) { o.castShadow = k !== 'spin' && o.material !== mats.glass; o.receiveShadow = true; } });
    // Kleinteile als Instanzen (Container mit eigener Farbe je Stück)
    for (const k of ['pipe', 'tank', 'cont', 'vent']) {
      const ig = this.geo('stinst:' + k, STATION_INST_GEO[k]);
      for (const [grp, parent] of [['hub', hub], ['arms', arms]]) {
        const d = geos.inst[k][grp], n = d.m.length / 16;
        if (!n) continue;
        const mesh = new THREE.InstancedMesh(ig, mats[k], n);
        mesh.instanceMatrix.array.set(d.m);
        mesh.instanceMatrix.needsUpdate = true;
        if (k === 'cont') { mesh.instanceColor = new THREE.InstancedBufferAttribute(d.c.slice(), 3); }
        mesh.computeBoundingSphere();
        mesh.castShadow = true; mesh.receiveShadow = true;
        parent.add(mesh);
      }
    }
    // Lichter, Kegel, Beschriftung
    const lm = this.mat('navpts', () => lightPointsMaterial(this.uTime, this.uPointScale));
    const cm = this.mat('cones', lightConeMaterial);
    for (const k in groups) {
      if (geos.lights[k]) { const p = new THREE.Points(geos.lights[k], lm); p.frustumCulled = false; p.renderOrder = 12; groups[k].add(p); }
      if (geos.cones[k]) { const c = new THREE.Mesh(geos.cones[k], cm); c.renderOrder = 11; groups[k].add(c); }
    }
    if (geos.decals) {
      const dm = this.mat('decal:' + faction, () => new THREE.MeshStandardMaterial({
        map: geos.decals.tex, transparent: true, depthWrite: false, metalness: 0.2, roughness: 0.65,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      const sm = this.mat('sign:' + faction, () => new THREE.MeshBasicMaterial({
        map: geos.decals.tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.25, 1.25, 1.25),
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      for (const k in geos.decals.geo) {
        const G = geos.decals.geo[k];
        if (G.paint) { const d = new THREE.Mesh(G.paint, dm); d.renderOrder = 3; d.receiveShadow = true; groups[k].add(d); }
        if (G.sign) { const d = new THREE.Mesh(G.sign, sm); d.renderOrder = 3; groups[k].add(d); }
      }
    }
    return { root, spin, hub, spinRate: geos.spinRate };
  }

  // Sprungtor: sichtbarer Außenrand ≈ 112 m, liegt also ganz innerhalb der Sprungreichweite (150 m)
  buildPortal() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    body.scale.setScalar(PORTAL_VIS);
    root.add(body);
    const spin = new THREE.Group(), outer = new THREE.Group();
    body.add(spin); body.add(outer);
    const g = this._glb('portal');
    const col = 0x6ad8ff;
    if (g) { spin.add(g); return { root, spin, outer, layers: null }; }
    const metal = this.std('portal:metal', { color: 0x40434a, metal: 0.8, rough: 0.46, env: 0.7, panel: 0.14, lines: 0.5, rim: 0.1 });
    const dark = this.std('portal:dark', { color: 0x1c1d22, metal: 0.8, rough: 0.48, env: 0.7, panel: 0.22, lines: 0.45 });
    const geos = this.geo('portal:v4', portalGeometry);
    this._meshes(spin, geos.ring, { metal, dark, glow: this.glow(col, 0.8) });
    this._meshes(outer, geos.outer, { metal, dark, glow: this.glow(col, 0.75) });
    // Tunnel: drei Schichten in versetzter Tiefe (Parallaxe), tiefer = kleiner und dunkler
    const layers = [];
    const disc = this.geo('portal:disc', () => new THREE.CircleGeometry(1, 96).rotateX(-PI / 2));
    for (let i = 0; i < 3; i++) {
      const L = new THREE.Mesh(disc, this.portalSwirlMat(col, i));
      L.position.y = -i * 34; L.scale.setScalar(90 - i * 20); L.renderOrder = 2 - i;
      body.add(L); layers.push(L);
    }
    const nav = this.navMats();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * PI * 2;
      const s = new THREE.Sprite(i % 2 ? nav.white : nav.red);
      s.position.set(Math.cos(a) * 144, 4, Math.sin(a) * 144); s.scale.setScalar(9);
      outer.add(s);
    }
    return { root, spin, outer, layers };
  }
  // Sprungtor-Schicht: gekrümmter Raum (Sterne zu Bögen gezogen); oberste Schicht mit Einstein-Ring und Rand
  portalSwirlMat(col, layer = 0) {
    return this.mat('portal:swirl:' + layer, () => new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uColor: { value: new THREE.Color(col) }, uLayer: { value: layer } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uLayer;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float layer(float a, float lr, float k, float t) {
          vec2 g = vec2(a / 6.2831853 * k, lr * k * 0.5);
          vec2 id = floor(g), f = fract(g) - 0.5;
          float h = h21(id + t);
          vec2 o = (vec2(h21(id + 7.1), h21(id + 3.3)) - 0.5) * 0.5;
          vec2 d = (f - o) * vec2(0.35, 1.6);
          return step(0.72, h) * exp(-dot(d, d) * 40.0) * (0.4 + h21(id + 1.9));
        }
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
          float a = atan(p.y, p.x);
          float lr = log(r + 0.03);
          float dir = mod(uLayer, 2.0) < 0.5 ? 1.0 : -1.0;
          float sw = a + dir * (0.55 + uLayer * 0.3) / (r + 0.12) - uTime * (0.22 + uLayer * 0.08) * dir;
          float flow = lr - uTime * (0.18 + uLayer * 0.1);
          float st = layer(sw, flow * 6.0, 18.0 + uLayer * 8.0, uLayer * 3.0) + layer(sw + 1.3, flow * 9.0, 30.0, 5.0 + uLayer) * 0.7;
          float top = 1.0 - step(0.5, uLayer);
          float ring = exp(-pow((r - 0.34) / 0.025, 2.0)) * (0.75 + 0.25 * sin(a * 9.0 + uTime * 2.4)) * top;
          float core = exp(-r * r * 40.0) * (uLayer > 1.5 ? 1.0 : 0.0);
          float haze = (0.5 + 0.5 * sin(sw * 3.0 + flow * 5.0)) * smoothstep(1.0, 0.3, r) * smoothstep(0.1, 0.4, r);
          float edge = exp(-pow((r - 0.975) / 0.012, 2.0));
          float k = 1.0 - uLayer * 0.28;
          vec3 c = uColor * (haze * 0.05 + edge * (0.22 - uLayer * 0.06) + ring * 0.1) * k
                 + vec3(0.85, 0.92, 1.0) * (st * smoothstep(1.0, 0.45, r) * 0.32 * k + core * 0.3 + ring * 0.05);
          gl_FragColor = vec4(c * smoothstep(1.0, 0.96, r), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  }

  buildCrate() {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('crate');
    if (g) spin.add(g);
    else this._meshes(spin, this.geo('crate:v2', crateGeometry), {
      metal: this.std('crate:metal', { color: 0x7a7f88, metal: 0.9, rough: 0.3 }),
      plate: this.std('crate:plate', { color: 0x2e3036, metal: 0.7, rough: 0.45, panel: 0.35, lines: 0.5 }),
      glow: this.glow(CRATE_COLOR, 1.3),
    });
    const s = new THREE.Sprite(this.sprite(CRATE_COLOR, 0.5));
    s.scale.setScalar(22); root.add(s);
    return { root, spin, glow: s };
  }

  buildWreck(seed) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('wreck');
    if (g) spin.add(g);
    else {
      const v = seed % 4;
      this._meshes(spin, this.geo('wreck:v2:' + v, () => wreckGeometry(v)), {
        metal: this.std('wreck:metal', { color: 0x2e2c2b, metal: 0.7, rough: 0.55, panel: 0.35, lines: 0.5, grime: 0.6, rim: 0.12 }),
        dark: this.std('wreck:dark', { color: 0x18181b, metal: 0.75, rough: 0.5, panel: 0.4, lines: 0.4 }),
        cargoFrame: this.std('wreck:cargo', { color: 0x3a342e, metal: 0.8, rough: 0.4, panel: 0.6, lines: 0.4, grime: 0.5 }),
        cargo: this.glow(CARGO_COLOR, 0.85),
        ember: this.glow(0xff5a18, 0.8),
      });
    }
    const s = new THREE.Sprite(this.sprite(CARGO_COLOR, 0.5));
    s.scale.setScalar(20); root.add(s);
    return { root, spin, glow: s };
  }

  // Erz: dunkler Fels im Sonnenlicht, nur schmale Adern leuchten schwach in Erzfarbe
  oreMat(type) {
    return this.mat('ore:v2:' + type, () => {
      const [hex, k] = ORE_VEIN[type] || ORE_VEIN.nickel;
      const m = new THREE.MeshStandardMaterial({ color: 0x3d3935, metalness: 0.12, roughness: 0.9 });
      const vein = new THREE.Color(hex);
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uVein = { value: vein };
        sh.uniforms.uVeinK = { value: k };
        sh.vertexShader = 'varying vec3 vObjP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjP = position;');
        sh.fragmentShader = 'uniform vec3 uVein; uniform float uVeinK; varying vec3 vObjP;\n' + NOISE + sh.fragmentShader
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            float vn = snoise(vObjP * 2.4 + vec3(3.1, 7.7, 1.3));
            float vn2 = snoise(vObjP * 5.1 + vec3(9.2, 0.4, 5.5));
            float vein = (1.0 - smoothstep(0.0, 0.05, abs(vn))) * smoothstep(-0.3, 0.35, snoise(vObjP * 1.2 + 4.0));
            vein = max(vein, (1.0 - smoothstep(0.0, 0.03, abs(vn2))) * 0.6 * smoothstep(0.1, 0.5, snoise(vObjP * 1.7 - 2.0)));
            float spot = snoise(vObjP * 7.0) * 0.5 + 0.5;
            diffuseColor.rgb *= 0.75 + 0.5 * spot;
            diffuseColor.rgb = mix(diffuseColor.rgb, uVein * 0.4, vein * 0.7);
            totalEmissiveRadiance += uVein * vein * uVeinK;`);
      };
      m.customProgramCacheKey = () => 'oreVein';
      return m;
    });
  }

  buildOre(type, seed) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('ore:' + type, 'ore');
    if (g) { g.scale.setScalar(g.userData.glbScale ?? 2 / (g.userData.glbLen || 2)); spin.add(g); }
    else {
      const v = seed % 4;
      const geo = this.geo('ore:v2:' + v, () => oreGeometry(v));
      spin.add(new THREE.Mesh(geo, this.oreMat(type)));
    }
    return { root, spin, glow: null };
  }

  // Frachter: langer Träger mit Containerstapeln, Brücke vorn, Triebwerksblock hinten. Länge ≈ 180 m (Radius 90).
  buildFreighter(seed = 0) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('freighter');
    const engines = [];
    if (g) { g.scale.setScalar(g.userData.glbScale ?? 180 / (g.userData.glbLen || 180)); spin.add(g); }
    else {
      const v = seed % 3;
      const geos = this.geo('freighter:' + v, () => {
        const R = rng(911 + v * 37);
        const P_ = new Parts();
        P_.add('hull', T(BOX(), 0, 0, 0, 0, 0, 0, 10, 8, 176));
        P_.add('hull', T(BOX(), 0, 7, -88, 0, 0, 0, 28, 18, 26));
        P_.add('hull', T(BOX(), 0, 18, -92, 0, 0, 0, 18, 8, 14));
        P_.add('win', T(BOX(), 0, 19, -99.2, 0, 0, 0, 14, 1.6, 0.4));
        for (const sx of [-1, 1]) P_.add('win', T(BOX(), sx * 14.1, 8, -88, 0, 0, 0, 0.3, 1.2, 18));
        P_.add('hull', T(BOX(), 0, 0, 88, 0, 0, 0, 36, 22, 26));
        for (const ex of [-11, 0, 11]) P_.add('dark', T(CYL(), ex, 0, 103, PI / 2, 0, 0, 5.5, 8, 5.5));
        for (const sx of [-1, 1]) P_.add('hull', T(BOX(), sx * 21, 0, 88, 0, 0, 0, 6, 30, 18));
        // Containerstapel
        for (let z = -68; z <= 70; z += 13.5) {
          for (const sx of [-1, 1]) {
            const h = 1 + ((R() * 3) | 0);
            for (let k = 0; k < h; k++) {
              if (R() < 0.12) continue;
              P_.add('c' + ((R() * 4) | 0), T(BOX(), sx * 10.5, -1 + k * 8.4, z, 0, 0, 0, 10.6, 8, 12.6));
            }
          }
        }
        // Rippen zwischen den Stapeln
        for (let z = -75; z <= 78; z += 13.5) P_.add('dark', T(BOX(), 0, 6, z, 0, 0, 0, 34, 1.2, 1.2));
        return P_.merge();
      });
      const CC = [0xa0452a, 0x2c5f80, 0xb8902f, 0x6a7078];
      this._meshes(spin, geos, {
        hull: this.std('freighter:hull', { color: 0x4a4c52, metal: 0.65, rough: 0.45, panel: 0.25, lines: 0.4, grime: 0.4, rim: 0.12 }),
        dark: this.std('ship:dark', SHIP_DARK),
        win: this.glow(0xffd9a8, 1.6),
        c0: this.std('freighter:c0', { color: CC[0], metal: 0.4, rough: 0.6, panel: 0.6, lines: 0.5, grime: 0.5 }),
        c1: this.std('freighter:c1', { color: CC[1], metal: 0.4, rough: 0.6, panel: 0.6, lines: 0.5, grime: 0.5 }),
        c2: this.std('freighter:c2', { color: CC[2], metal: 0.4, rough: 0.6, panel: 0.6, lines: 0.5, grime: 0.5 }),
        c3: this.std('freighter:c3', { color: CC[3], metal: 0.4, rough: 0.6, panel: 0.6, lines: 0.5, grime: 0.5 }),
      });
      const tg = this.trailGeo(), tm = this.trailMat(0xffb070), sm = this.sprite(0xffb070, 1.2);
      for (const ex of [-11, 0, 11]) {
        const hp = new THREE.Object3D(); hp.position.set(ex, 0, 107); spin.add(hp);
        const glow = new THREE.Sprite(sm); glow.scale.setScalar(16); hp.add(glow);
        const trail = new THREE.Mesh(tg, tm); trail.scale.set(9, 9, 40); hp.add(trail);
        engines.push({ hp, glow, trail, size: 2 });
      }
      const N = this.navMats();
      for (const [x, y, z, m, sc] of [[-18, 4, 0, N.red, 5], [18, 4, 0, N.green, 5], [0, 24, -92, N.white, 4], [0, 12, 100, N.white, 4]]) {
        const sp = new THREE.Sprite(m); sp.position.set(x, y, z); sp.scale.setScalar(sc); spin.add(sp);
      }
    }
    spin.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { root, spin, engines, radius: 90 };
  }

  // Alien-Nest: organischer, pulsierender Körper aus Chitin, Eiersäcke glühen, Ranken greifen nach außen. Radius ≈ 1.
  buildNest(seed = 0) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const def = ENEMIES.nest || ENEMIES.spiker || { color: 0x4f7d3a, accent: 0xe6ff7a };
    const g = this._glb('nest');
    const pods = [];
    if (g) { g.scale.setScalar(g.userData.glbScale ?? 2 / (g.userData.glbLen || 2)); spin.add(g); }
    else {
      const geos = this.geo('nest:v1', () => {
        const R = rng(4242);
        const P_ = new Parts();
        const core = rockGeometry(77, 2, 0.6);
        P_.add('body', T(core, 0, 0, 0, 0, 0, 0, 0.95, 0.55, 0.9));
        for (let i = 0; i < 7; i++) {
          const a = i / 7 * PI * 2 + R() * 0.4, d = 0.55 + R() * 0.25;
          P_.add('body', T(core, Math.cos(a) * d, -0.05 + R() * 0.15, Math.sin(a) * d, R() * 3, R() * 3, R() * 3, 0.35 + R() * 0.15, 0.25 + R() * 0.12, 0.35 + R() * 0.15));
        }
        // Ranken/Stacheln
        for (let i = 0; i < 12; i++) {
          const a = R() * PI * 2;
          P_.add('body', spike(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6, Math.cos(a), 0.15 + R() * 0.35, Math.sin(a), 0.07, 0.6 + R() * 0.6));
        }
        core.dispose();
        return P_.merge();
      });
      this._meshes(spin, geos, { body: this.swarmMat('nest', def.color, def.accent) });
      // Eiersäcke (eigene Meshes, damit sie einzeln pulsieren)
      const eggGeo = this.geo('nest:egg', () => new THREE.SphereGeometry(1, 16, 12));
      const eggMat = this.glow(def.accent, 0.9);
      const R = rng(99 + (seed % 5));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * PI * 2 + R(), d = 0.35 + R() * 0.35;
        const egg = new THREE.Mesh(eggGeo, eggMat);
        egg.position.set(Math.cos(a) * d, 0.32 + R() * 0.12, Math.sin(a) * d);
        const sc = 0.09 + R() * 0.06; egg.scale.set(sc, sc * 1.3, sc);
        egg.userData.s0 = sc; egg.userData.ph = R() * 6;
        spin.add(egg); pods.push(egg);
      }
    }
    const glow = new THREE.Sprite(this.sprite(def.accent, 0.45));
    glow.position.y = 0.3; glow.scale.setScalar(2.2);
    spin.add(glow);
    return { root, spin, glow, pods, swarm: true };
  }

  // Asteroid als Spielobjekt (Hindernis/Abbau): Radius 1, Renderer skaliert
  // Große Brocken (Asteroiden-Entities): fein unterteilt (ab Radius 100 noch feiner), glatte Normalen und eine
  // prozedurale Detail-Struktur (Rausch-Relief im Shader + leichte Farbvariation) statt grober Facetten
  buildAsteroid(seed = 0, big = false) {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const g = this._glb('asteroid');
    if (g) { g.scale.setScalar(g.userData.glbScale ?? 2 / (g.userData.glbLen || 2)); spin.add(g); }
    else {
      const v = seed % 4;
      const geo = this.geo('asteroid:' + v + (big ? ':hi' : ''), () => rockGeometry(500 + v * 13, big ? 5 : 4, 1 + v * 0.3));
      spin.add(new THREE.Mesh(geo, this.mat('asteroid:mat2', () => rockDetailMaterial())));
    }
    return { root, spin, glow: null };
  }

  // Unbekannte Art: schlichter Platzhalter (Gitterkörper mit Leuchtpunkt), damit nichts bricht
  buildUnknown() {
    const root = new THREE.Group(), spin = new THREE.Group();
    root.add(spin);
    const geo = this.geo('unknown', () => new THREE.OctahedronGeometry(1, 0));
    spin.add(new THREE.Mesh(geo, this.std('unknown', { color: 0x6a6e78, metal: 0.6, rough: 0.4, flat: true, ao: false })));
    const glow = new THREE.Sprite(this.sprite(0x9fd8ff, 0.8));
    glow.scale.setScalar(1.6); spin.add(glow);
    return { root, spin, glow };
  }

  dispose() {
    const free = (v, depth) => {
      if (!v || typeof v !== 'object' || depth > 4 || ArrayBuffer.isView(v)) return;
      if (v.isBufferGeometry || v.isTexture) { v.dispose(); return; }
      for (const k in v) free(v[k], depth + 1);
    };
    this.geos.forEach((g) => free(g, 0));
    this.mats.forEach((m) => m.dispose());
    this.geos.clear(); this.mats.clear();
    this.glb.forEach((s) => s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => m.dispose()); } }));
    this.glb.clear();
  }
}
