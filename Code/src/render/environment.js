// Umgebung je Sektor: Himmel (Milchstraße, Sterne, Sonne), Planeten und Monde der Heimat,
// Staub in zwei Tiefenebenen (bei Tempo zu Strichen gezogen), Deko-Cluster (Wrackteile, Bojen, Brocken),
// ferner Frachterverkehr, Sektorgrenze als Messlinie, Licht und Spiegel-Umgebung für die Rümpfe.
// Die Kamera dreht sich nie, darum liegen Himmel und Planeten in fester Richtung; Planeten verschieben
// sich nur leicht gegen die Kamera (Parallaxe), der Staub stark.
import * as THREE from 'three';
import { FACTIONS } from '../core/data.js';
import { hashString } from './textures.js';
import { Sky, screenDir } from './sky.js';
import { PlanetSystem, SURF } from './planets.js';
import { buildDeco } from './deco.js';
import { buildLayers } from './layers.js';
import { buildFields } from './fields.js';

const PITCH = 55 * Math.PI / 180;
const D2R = Math.PI / 180;

const HAZ_VS = `varying vec2 vP; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const HAZ_FS = `
uniform float uSize; uniform vec3 uColor; uniform vec2 uCam;
varying vec2 vP;
void main() {
  float ax = abs(vP.x), az = abs(vP.y);
  float dm = max(ax, az) - uSize;
  float fw = max(fwidth(dm), 1e-4);
  float d = dm / fw;
  // Grenze: Haarlinie, Messticks nach außen (100 m kurz, 500 m mittel, 1000 m lang)
  float line = 1.0 - smoothstep(0.35, 1.15, abs(d));
  float s = ax > az ? vP.y : vP.x;
  float fs = max(fwidth(s), 1e-4);
  float m1 = abs(fract(s / 100.0 + 0.5) - 0.5) * 100.0 / fs;
  float m5 = abs(fract(s / 500.0 + 0.5) - 0.5) * 500.0 / fs;
  float m10 = abs(fract(s / 1000.0 + 0.5) - 0.5) * 1000.0 / fs;
  float t1 = (1.0 - smoothstep(0.3, 1.0, m1)) * step(0.0, d) * step(d, 5.0);
  float t5 = (1.0 - smoothstep(0.3, 1.1, m5)) * step(0.0, d) * step(d, 11.0);
  float t10 = (1.0 - smoothstep(0.4, 1.2, m10)) * step(-5.0, d) * step(d, 20.0);
  // Grenzlinie erst ab 600 m Abstand einblenden, entlang der Linie zur Kamera hin auslaufen lassen
  float camB = uSize - max(abs(uCam.x), abs(uCam.y));
  float vis = 1.0 - smoothstep(320.0, 600.0, camB);
  float along = 1.0 - smoothstep(450.0, 1500.0, length(vP - uCam));
  float lineA = (line + max(max(t1 * 0.6, t5 * 0.85), t10)) * 0.25 * vis * along;
  // Gefahrenzone: sehr schwacher gerasterter Schleier (Punktraster 24 m), nimmt nach außen zu, max. 6 %
  vec2 gq = (fract(vP / 24.0) - 0.5) * 24.0 / fw;
  float dotR = 1.0 - smoothstep(0.5, 1.3, length(gq));
  float veilK = smoothstep(-160.0, 420.0, dm) * (1.0 - smoothstep(650.0, 790.0, dm));
  float veil = veilK * (0.018 + 0.042 * dotR);
  vec3 c = uColor * veil + vec3(lineA);
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Staub zwischen Kamera und Spielebene: wird um den Bildmittelpunkt gewickelt. Zwei Tiefenebenen
// (unter der Spielebene fern, über ihr nah an der Kamera) ergeben Parallaxe beim Fliegen.
const DUST_VS = `
attribute float aSize; attribute float aB;
uniform vec2 uCenter; uniform float uTile; uniform float uScale;
varying float vA;
void main() {
  vec2 p = mod(position.xz - uCenter + 0.5 * uTile, uTile) - 0.5 * uTile + uCenter;
  vec4 mv = modelViewMatrix * vec4(p.x, position.y, p.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale / -mv.z;
  gl_PointSize = clamp(s, 1.0, 6.0);
  vA = aB * min(1.0, s * 0.9) * smoothstep(40.0, 160.0, -mv.z);
}`;
const DUST_FS = `
uniform vec3 uCol; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
  float a = (1.0 - d) * vA;
  gl_FragColor = vec4(uCol * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
// Tempo-Striche: dieselben Staubkörner als Linien entgegen der Flugrichtung, nur bei Bewegung sichtbar
const STREAK_VS = `
attribute float aB; attribute float aEnd;
uniform vec2 uCenter; uniform float uTile; uniform vec2 uVel; uniform float uK;
varying float vA;
void main() {
  vec2 p = mod(position.xz - uCenter + 0.5 * uTile, uTile) - 0.5 * uTile + uCenter;
  // Länge nach Tiefe gestaffelt: Staub nah an der Kamera zieht lang, tiefer Staub kurz
  float near = smoothstep(-200.0, 200.0, position.y);
  p -= uVel * (0.025 + 0.06 * near) * aEnd;
  vec4 mv = modelViewMatrix * vec4(p.x, position.y, p.y, 1.0);
  gl_Position = projectionMatrix * mv;
  float dz = -mv.z;
  vA = aB * uK * (1.0 - aEnd * 0.95) * smoothstep(40.0, 180.0, dz) * (1.0 - smoothstep(500.0, 1100.0, dz)) * (0.35 + 0.65 * near);
}`;
const STREAK_FS = `
uniform vec3 uCol; varying float vA;
void main() {
  gl_FragColor = vec4(uCol * vA, vA);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function sectorFaction(world) {
  const f = world.profile?.faction || world.player?.faction;
  if (FACTIONS[f]) return f;
  const pre = (world.sector?.id || '').slice(0, 2);
  for (const k in FACTIONS) if (FACTIONS[k].prefix === pre) return k;
  return 'europa';
}
export { sectorFaction };

// Heimatsysteme: Sonne (Bildposition, Winkelradius in rad, Farbe), Lichtstärke, Himmel, Himmelskörper je Sektor.
// Sonnengröße nimmt nach außen ab: Jupiter 5 AE, Saturn 9,5 AE, Eris ~96 AE (nur noch heller Punkt).
// Planeten liegen in einem Bilddrittel am Rand (Spielerschiff bleibt in der Mitte frei), Ring nie durch die Mitte.
const SYSTEMS = {
  europa: {
    sun: [0.80, 0.74], sunR: 0.0062, sunCol: [1.0, 0.96, 0.9], spike: 0.6, light: 1.0,
    key: 0xfff4e6, keyI: 2.3, rim: 0x9fc4ff, rimI: 1.4, fill: 0x8a9cc0, fillI: 0.12, hemi: [0x40506a, 0x07080a, 0.14], env: 0.75,
    galC: [-0.15, 0.25], galTilt: -0.42, galCore: [1.4, -0.3], mw: 0.03, neb: 0.12, dust: [0.55, 0.6, 0.7],
    nebA: [0.35, 0.6, 0.95], nebB: [0.85, 0.66, 0.3], mood: [[0.22, 0.42, 0.78], [0.62, 0.48, 0.22]], moodK: 0.05, rock: 0x5a636e,
    bodies: [
      null,
      [
        { type: 'jupiter', s: [-0.9, -0.74], ang: 8.5, dist: 60000, atmo: [0.55, 0.68, 0.95], atmoK: 0.9, roll: -24, rot: 0.0016 },
        { type: 'europa', s: [0.72, 0.1], ang: 1.6, dist: 24000, roll: 10, rot: 0.0005 },
      ],
      [
        { type: 'jupiter', s: [-0.92, 0.66], ang: 8, dist: 60000, atmo: [0.55, 0.68, 0.95], atmoK: 0.9, roll: 14, rot: 0.0016 },
        { type: 'io', s: [0.68, -0.32], ang: 1.4, dist: 30000, roll: 0, rot: 0.001 },
      ],
      [
        { type: 'jupiter', s: [0.94, -0.62], ang: 7, dist: 60000, atmo: [0.55, 0.68, 0.95], atmoK: 0.9, roll: -8, rot: 0.0016 },
        { type: 'ganymede', s: [-0.72, 0.36], ang: 1.8, dist: 30000, roll: 0, rot: 0.0008 },
      ],
    ],
  },
  saturn: {
    sun: [0.82, 0.76], sunR: 0.0042, sunCol: [1.0, 0.95, 0.88], spike: 0.7, light: 0.9,
    key: 0xfff0dc, keyI: 2.6, rim: 0xa8c6ff, rimI: 1.3, fill: 0x9a90a0, fillI: 0.1, hemi: [0x4a4236, 0x07070a, 0.12], env: 0.75,
    galC: [0.1, -0.1], galTilt: 0.5, galCore: [-1.3, -0.7], mw: 0.028, neb: 0.12, dust: [0.7, 0.62, 0.52],
    nebA: [0.95, 0.55, 0.2], nebB: [0.55, 0.36, 0.16], mood: [[0.78, 0.42, 0.12], [0.42, 0.26, 0.1]], moodK: 0.05, rock: 0x6a5c4c,
    bodies: [
      null,
      [
        { type: 'saturn', s: [-0.8, -0.6], ang: 5.6, dist: 60000, atmo: [0.95, 0.82, 0.6], atmoK: 0.7, roll: 48, ringOpen: 18, rings: true, rot: 0.0012 },
        { type: 'ice', s: [0.66, 0.24], ang: 1.1, dist: 28000, roll: 0, rot: 0.001 },
      ],
      [
        { type: 'saturn', s: [-0.94, 0.62], ang: 5.0, dist: 60000, atmo: [0.95, 0.82, 0.6], atmoK: 0.7, roll: -50, ringOpen: 15, rings: true, rot: 0.0012 },
        { type: 'ice', s: [0.62, -0.42], ang: 1.4, dist: 28000, roll: 0, rot: 0.001, seed: 4 },
      ],
      [
        { type: 'saturn', s: [0.95, -0.6], ang: 4.8, dist: 60000, atmo: [0.95, 0.82, 0.6], atmoK: 0.7, roll: -48, ringOpen: 20, rings: true, rot: 0.0012 },
        { type: 'ice', s: [-0.7, 0.4], ang: 1.7, dist: 28000, roll: 0, rot: 0.001, seed: 9 },
      ],
    ],
  },
  eris: {
    sun: [0.78, 0.78], sunR: 0.0011, sunCol: [1.0, 0.97, 0.94], spike: 1.6, light: 0.55,
    key: 0xeef0ff, keyI: 2.3, rim: 0xb4c4ff, rimI: 1.9, fill: 0x8c9ccc, fillI: 0.28, hemi: [0x343a52, 0x06070a, 0.18], env: 0.95,
    galC: [-0.3, -0.2], galTilt: 0.95, galCore: [0.8, 1.2], mw: 0.034, neb: 0.9, dust: [0.55, 0.52, 0.65],
    nebA: [0.55, 0.22, 0.95], nebB: [0.22, 0.32, 0.95], mood: [[0.45, 0.2, 0.85], [0.32, 0.36, 0.46]], moodK: 0.045, rock: 0x4c4858,
    bodies: [
      null,
      [
        { type: 'eris', s: [-0.88, -0.66], ang: 9, dist: 50000, atmo: [0.55, 0.38, 1.0], atmoK: 0.55, roll: 5, rot: 0.0006, soft: 0.03, relief: 0.016 },
        { type: 'dark', s: [0.66, 0.34], ang: 1.3, dist: 26000, roll: 0, rot: 0.001 },
      ],
      [
        { type: 'eris', s: [0.92, -0.62], ang: 8, dist: 50000, atmo: [0.55, 0.38, 1.0], atmoK: 0.55, roll: 0, rot: 0.0006, soft: 0.03, relief: 0.016 },
        { type: 'dark', s: [-0.66, 0.4], ang: 2.2, dist: 22000, roll: 0, rot: 0.001 },
      ],
      [
        { type: 'sedna', s: [-0.84, -0.6], ang: 3.6, dist: 30000, roll: 0, rot: 0.0008 },
        { type: 'eris', s: [0.8, 0.36], ang: 3.2, dist: 50000, atmo: [0.55, 0.38, 1.0], atmoK: 0.45, roll: 0, rot: 0.0006, soft: 0.03 },
      ],
    ],
  },
};

const PLANET_LIGHT = { jupiter: 1, saturn: 1, eris: 0.95, europa: 0.95, io: 1, ganymede: 1, ice: 1.05, dark: 1.4, sedna: 1 };

export class Environment {
  constructor(scene, renderer, factory, camera) {
    this.scene = scene;
    this.gl = renderer;
    this.f = factory;
    this.camera = camera;
    this.group = null;
    this.trash = [];
    this.envMap = null;
    this.sky = new Sky(renderer, scene, PITCH);
    this.planets = new PlanetSystem(renderer, this.sky.baker);
    scene.add(this.planets.group);
    this.sunDir = new THREE.Vector3(0.45, 0.72, -0.53).normalize();
    this.hazardMat = null;
    this.dust = null;
    this.streaks = null;
    this.deco = null;
    this._vel = new THREE.Vector2();
    this._lastC = null;
    this.quality = 2;
    this.sys = SYSTEMS.europa;
  }

  _keep(o) { this.trash.push(o); return o; }

  build(world, lights, quality, w, h) {
    this.dispose(true);
    this.quality = quality;
    const faction = sectorFaction(world);
    const F = FACTIONS[faction];
    const S = this.sys = SYSTEMS[faction] || SYSTEMS.europa;
    const sector = world.sector || { id: 'X', index: 1, size: 2400 };
    const size = sector.size || 2400;
    const idx = Math.min(3, Math.max(1, sector.index || 1));
    const seed = hashString(String(sector.id)) % 997;
    const g = this.group = new THREE.Group();
    g.name = 'environment';
    this.scene.add(g);
    this.scene.background = null;

    const basis = this.sky.basis;
    const sunCol = new THREE.Color(S.sunCol[0], S.sunCol[1], S.sunCol[2]);
    const bodies = S.bodies[idx];
    const main = bodies[0];
    const mainDir = screenDir(basis, main.s[0], main.s[1], new THREE.Vector3());

    // Himmel
    this.sky.build({
      seed: seed + idx * 31, sun: S.sun, sunR: S.sunR, sunCol, spike: S.spike, galC: S.galC, galTilt: S.galTilt,
      galCore: S.galCore, mw: S.mw, neb: S.neb, planetDir: mainDir,
      nebA: S.nebA ? new THREE.Color(...S.nebA) : null, nebB: S.nebB ? new THREE.Color(...S.nebB) : null,
      planetCol: new THREE.Color(main.atmo ? main.atmo[0] : 0.5, main.atmo ? main.atmo[1] : 0.5, main.atmo ? main.atmo[2] : 0.5),
      moodA: new THREE.Color(...S.mood[0]), moodB: new THREE.Color(...S.mood[1]), moodK: S.moodK * (idx === 1 ? 1 : idx === 2 ? 1.15 : 1.3),
      quality,
      // Ultra: Himmel feiner gebacken und dichteres Sternfeld (kostet nur beim Aufbau, nicht pro Bild)
      bake: quality >= 3 ? 0.75 : 0, stars: quality >= 3 ? 9000 : 0,
    }, this.camera, w, h);

    // Licht: Hauptlicht aus Richtung der Sonne (rechts oben, von oben), Kantenlicht von hinten, schwaches Himmelslicht
    const sd = this.sky.sunDir;
    this.sunDir.set(sd.x, 0.9, sd.z).normalize();
    lights.sun.position.copy(this.sunDir).multiplyScalar(1000);
    lights.sun.target.position.set(0, 0, 0);
    lights.sun.color.setHex(S.key);
    lights.sun.intensity = S.keyI;
    lights.rim.position.set(-0.55, 0.35, -0.85).multiplyScalar(1000);
    lights.rim.color.setHex(S.rim);
    lights.rim.intensity = S.rimI;
    lights.fill.position.set(-0.7, 0.45, 0.55).multiplyScalar(1000);
    lights.fill.color.setHex(S.fill);
    lights.fill.intensity = S.fillI;
    lights.hemi.color.setHex(S.hemi[0]);
    lights.hemi.groundColor.setHex(S.hemi[1]);
    lights.hemi.intensity = S.hemi[2];

    // Spiegel-Umgebung aus demselben Himmel
    const eq = this.sky.bakeEquirect(this.sunDir);
    const pm = new THREE.PMREMGenerator(this.gl);
    this.envRT = pm.fromEquirectangular(eq.texture);
    pm.dispose(); eq.dispose();
    this.envMap = this.envRT.texture;
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = S.env;

    // Planeten und Monde
    const res = quality >= 2 ? 2048 : 1024;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      // Monde nie nahe der Bildmitte (sonst wirken sie wie ein Objekt am Schiff): an den Bildrand bzw. in die Ecke
      const msx = i ? Math.sign(b.s[0] || 1) * Math.max(0.82, Math.abs(b.s[0])) : b.s[0];
      const msy = i ? Math.sign(b.s[1] || 1) * Math.max(0.5, Math.abs(b.s[1])) : b.s[1];
      const dir = screenDir(basis, msx, msy, new THREE.Vector3());
      // Pol: Bild-oben senkrecht zur Blickrichtung, um roll gedreht, um ringOpen zur Kamera gekippt
      const up = basis.u.clone().addScaledVector(dir, -basis.u.dot(dir)).normalize();
      up.applyAxisAngle(dir, (b.roll || 0) * D2R);
      const open = (b.ringOpen ?? 12) * D2R;
      const pole = up.clone().multiplyScalar(Math.cos(open)).addScaledVector(dir, -Math.sin(open)).normalize();
      // Licht: aus Richtung der Sonne auf dem Bild, etwas zur Kamera gedreht (zunehmende Phase)
      const L = sd.clone().addScaledVector(dir, -sd.dot(dir)).normalize().addScaledVector(dir, -0.32).normalize();
      this.planets.add({
        // Fern-Ebene: leichte Parallaxe (2,4e-5 bzw. Monde 3e-5 rad je Meter Kamerafahrt, in planets.js begrenzt),
        // Monde etwas dunkler, damit sie Kulisse bleiben und nicht wie Spielobjekte wirken
        type: SURF[b.type], dir, dist: b.dist, angR: b.ang * D2R, par: i === 0 ? 2.4e-5 : 3e-5, pole, L, sunCol, relief: b.relief,
        light: S.light * (PLANET_LIGHT[b.type] || 1) * (i === 0 ? 1.1 : 0.62), atmo: new THREE.Color(...(b.atmo || [0, 0, 0])), atmoK: b.atmoK || 0,
        soft: b.soft ?? (b.atmoK ? 0.1 : 0.025), night: 0.0015, rings: !!b.rings,
        res: i === 0 ? res : res / 2, seed: (seed + i * 17 + (b.seed || 0)) * 0.37 % 100, rot: b.rot,
      });
    }

    // Staub in zwei Tiefenebenen
    const dn = quality >= 2 ? 1800 : quality === 1 ? 1000 : 450;
    const tile = 2800;
    const pos = new Float32Array(dn * 3), siz = new Float32Array(dn), br = new Float32Array(dn);
    let s = seed * 9301 + 49297;
    const R = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    for (let i = 0; i < dn; i++) {
      const near = i % 3 === 0;
      pos[i * 3] = R() * tile;
      pos[i * 3 + 1] = near ? 70 + R() * 200 : -320 + R() * 260;
      pos[i * 3 + 2] = R() * tile;
      siz[i] = (near ? 0.5 : 0.3) + Math.pow(R(), 3) * (near ? 1.1 : 0.8);
      br[i] = (near ? 0.35 : 0.22) + R() * 0.45;
    }
    const dg = this._keep(new THREE.BufferGeometry());
    dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
    dg.setAttribute('aB', new THREE.BufferAttribute(br, 1));
    const dustCol = new THREE.Color(S.dust[0], S.dust[1], S.dust[2]);
    const dm = this._keep(new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector2() }, uTile: { value: tile }, uScale: { value: 800 }, uCol: { value: dustCol },
      },
      vertexShader: DUST_VS, fragmentShader: DUST_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.dust = new THREE.Points(dg, dm);
    this.dust.frustumCulled = false; this.dust.renderOrder = 30;
    g.add(this.dust);
    // Tempo-Striche: jedes zweite Korn als Linie (Anfang + Ende)
    const sn = dn >> 1;
    const sp = new Float32Array(sn * 6), sb = new Float32Array(sn * 2), se = new Float32Array(sn * 2);
    for (let i = 0; i < sn; i++) {
      const j = i * 2;
      for (let k = 0; k < 2; k++) {
        sp[(i * 2 + k) * 3] = pos[j * 3]; sp[(i * 2 + k) * 3 + 1] = pos[j * 3 + 1]; sp[(i * 2 + k) * 3 + 2] = pos[j * 3 + 2];
        sb[i * 2 + k] = br[j]; se[i * 2 + k] = k;
      }
    }
    const sg = this._keep(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aB', new THREE.BufferAttribute(sb, 1));
    sg.setAttribute('aEnd', new THREE.BufferAttribute(se, 1));
    const sm = this._keep(new THREE.ShaderMaterial({
      uniforms: {
        uCenter: dm.uniforms.uCenter, uTile: { value: tile }, uVel: { value: new THREE.Vector2() }, uK: { value: 0 }, uCol: { value: new THREE.Color(0.62, 0.64, 0.68) },
      },
      vertexShader: STREAK_VS, fragmentShader: STREAK_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.streaks = new THREE.LineSegments(sg, sm);
    this.streaks.frustumCulled = false; this.streaks.renderOrder = 30; this.streaks.visible = false;
    g.add(this.streaks);
    this._vel.set(0, 0); this._lastC = null;

    // Deko: Wrackteile, Navigationsbojen, kleine Brocken, ferner Frachterverkehr (ohne Spiellogik)
    this.deco = buildDeco(world, size, seed, quality, this.f.uTime, (o) => this._keep(o));
    g.add(this.deco.group);

    // Tiefenebenen: Splitter, Dunstschleier, ferne Kulisse
    this.layers = buildLayers({
      seed, size, quality, dust: new THREE.Color(S.rock),
      moodA: new THREE.Color(...S.mood[0]), moodB: new THREE.Color(...S.mood[1]),
    }, (o) => this._keep(o));
    g.add(this.layers.group);

    // Kulissen-Felder: Asteroiden, Trümmer, Nebeltaschen, große Wracks (aus sector.fields oder aus der Sektor-ID)
    try {
      this.fields = buildFields({
        world, size, seed, quality, uTime: this.f.uTime, uScale: this.f.uPointScale, factory: this.f,
        rock: new THREE.Color(S.rock), moodA: new THREE.Color(...S.nebA || S.mood[0]), moodB: new THREE.Color(...S.nebB || S.mood[1]),
      }, (o) => this._keep(o));
      g.add(this.fields.group);
    } catch (err) { console.warn('Felder nicht gebaut', err); this.fields = null; }

    // Sektorgrenze + Gefahrenzone
    const inner = size - 300, outer = size + 800;
    const hp = new Float32Array([
      -outer, 0, -outer, outer, 0, -outer, outer, 0, outer, -outer, 0, outer,
      -inner, 0, -inner, inner, 0, -inner, inner, 0, inner, -inner, 0, inner,
    ]);
    const hg = this._keep(new THREE.BufferGeometry());
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 6, 2, 6, 3, 3, 6, 7, 3, 7, 0, 0, 7, 4]);
    this.hazardMat = this._keep(new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: size }, uColor: { value: new THREE.Color(1.0, 0.24, 0.16) }, uCam: { value: new THREE.Vector2() },
      },
      vertexShader: HAZ_VS, fragmentShader: HAZ_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const haz = this.hazard = new THREE.Mesh(hg, this.hazardMat);
    haz.position.y = -8; haz.frustumCulled = false; haz.renderOrder = -5;
    g.add(haz);
    this.borderLabels = this._borderLabels(size);
    g.add(this.borderLabels);
    this.sectorSize = size;
  }

  get sunScreen() { return this.sky.sunScreen; }
  get sunColor() { return this.sky.skyMat.uniforms.uSunCol.value; }
  get flareStrength() { return this.sys.spike > 1 ? 0.5 : 1.0; }

  resize(w, h) { this.sky.resize(this.camera, w, h); }

  // Koordinaten-Marker an der Grenze: eine Textur, eine Geometrie (alle 1000 m)
  _borderLabels(size) {
    const pts = [];
    const lim = Math.floor((size - 150) / 1000) * 1000;
    const fmt = (n) => (n > 0 ? '+' : n < 0 ? '\u2212' : '\u00b1') + Math.abs(Math.round(n));
    for (let v = -lim; v <= lim; v += 1000) {
      pts.push([v, -size, v + 46, -size - 14]);
      pts.push([v, size, v + 46, size + 14]);
      pts.push([-size, v, -size - 46, v - 8]);
      pts.push([size, v, size + 46, v - 8]);
    }
    const W = 256, H = 40, cols = 4, rows = Math.ceil(pts.length / cols);
    const cv = document.createElement('canvas');
    cv.width = W * cols; cv.height = H * rows;
    const ctx = cv.getContext('2d');
    ctx.font = '500 22px "SF Mono", ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,1)';
    const lw = 64, lh = 10;
    const P = new Float32Array(pts.length * 12), U = new Float32Array(pts.length * 8), I = [];
    pts.forEach((q, i) => {
      const cx = (i % cols) * W, cy = Math.floor(i / cols) * H;
      ctx.fillText(`${fmt(q[0])} ${fmt(q[1])}`, cx + W / 2, cy + H / 2 + 1);
      const x0 = q[2] - lw / 2, x1 = q[2] + lw / 2, z0 = q[3] - lh / 2, z1 = q[3] + lh / 2;
      P.set([x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1], i * 12);
      const u0 = cx / cv.width, u1 = (cx + W) / cv.width, v0 = 1 - cy / cv.height, v1 = 1 - (cy + H) / cv.height;
      U.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      const b = i * 4; I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    const tex = this._keep(new THREE.CanvasTexture(cv));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const geo = this._keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.setIndex(I);
    const mat = this._keep(new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(0.32, 0.32, 0.32), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -8; mesh.renderOrder = -4; mesh.frustumCulled = false;
    return mesh;
  }

  // jedes Bild
  update(camera, pr, pointScale, time, camTarget, dt = 0.016) {
    this.sky.update(pr);
    this.planets.update(camera.position, camTarget, time);
    if (this.layers) this.layers.update(camTarget, time);
    if (this.hazardMat) {
      this.hazardMat.uniforms.uCam.value.set(camTarget.x, camTarget.z);
      const camB = this.sectorSize - Math.max(Math.abs(camTarget.x), Math.abs(camTarget.z));
      const vis = 1 - Math.min(1, Math.max(0, (camB - 320) / 280));
      if (this.borderLabels) { this.borderLabels.visible = vis > 0.01; this.borderLabels.material.color.setScalar(0.32 * vis); }
      // Verfolger-Kamera: Grenzschleier liegt flach am Horizont (rote Linie quer durchs Bild) → erst nahe der Grenze
      if (this.hazard) this.hazard.visible = (this.chaseK || 0) < 0.5 || camB < 1200;
    }
    if (this.dust) {
      const u = this.dust.material.uniforms;
      u.uCenter.value.set(camTarget.x, camTarget.z);
      u.uScale.value = pointScale;
      if (this.deco) this.deco.lightMat.uniforms.uScale.value = pointScale;
      // Kamera-Tempo (geglättet) → Striche
      if (this._lastC && dt > 0) {
        const vx = (camTarget.x - this._lastC.x) / dt, vz = (camTarget.z - this._lastC.y) / dt;
        const k = 1 - Math.exp(-dt * 6);
        if (Math.abs(vx) < 5000 && Math.abs(vz) < 5000) { this._vel.x += (vx - this._vel.x) * k; this._vel.y += (vz - this._vel.y) * k; }
      } else this._lastC = new THREE.Vector2();
      this._lastC.set(camTarget.x, camTarget.z);
      const sp = this._vel.length();
      const su = this.streaks.material.uniforms;
      su.uVel.value.copy(this._vel);
      const sk = Math.min(1, Math.max(0, (sp - 200) / 160));
      // erst nahe Höchsttempo deutlich; in der Verfolger-Kamera übernimmt der Tempo-Staub (speeddust.js)
      su.uK.value = sk * sk * 0.5 * (1 - 0.85 * (this.chaseK || 0));
      this.streaks.visible = su.uK.value > 0.01;
    }
  }

  dispose(keepSky) {
    if (this.group) { this.scene.remove(this.group); this.group = null; }
    for (const o of this.trash) o.dispose();
    this.trash.length = 0;
    this.dust = null; this.streaks = null; this.deco = null; this.layers = null; this.fields = null;
    this.planets.clear();
    if (this.envRT) { this.envRT.dispose(); this.envRT = null; this.envMap = null; this.scene.environment = null; }
    if (!keepSky) {
      this.sky.dispose();
      this.planets.dispose();
      this.scene.remove(this.planets.group);
    }
  }
}
