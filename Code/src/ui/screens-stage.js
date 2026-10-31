// Bühne hinter den Bildschirmen vor dem Flug: echte 3D-Szene aus denselben Bausteinen wie im All
// (Himmel, gebackene Planeten, Schiffs- und Stationsmodelle, Bloom, Kamera-Look).
// Eine Leinwand für alle Menüs, liegt unter #screens. Einstellungen: Grafikqualität aus ls.settings.
// Leistung: feste Kamera-Ausrichtung (Himmel einmal gebacken), Bildrate je Bildschirm gedeckelt,
// Halt bei verstecktem Tab, keine Speicher-Neuanlage pro Bild.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { CameraLookPass } from '../render/post.js';
import { Sky, cameraBasis } from '../render/sky.js';
import { ModelFactory, hpName } from '../render/models.js';
import { settings, reduced } from './screens-kit.js';
import { MenuPlanets } from './screens-planets.js';
import { buildMenuStation } from './screens-station.js';

const PITCH = 7 * Math.PI / 180;    // Blick leicht nach unten
const FOV = 40;
const TAN = Math.tan(FOV * Math.PI / 360);
const D2R = Math.PI / 180;
const MODELS = [['ship:s1:saturn', '/models/saturn-starter.glb']];
// Grafikstufen: ULTRA 3 · HOCH 2 · MITTEL 1 · NIEDRIG 0
export const QUALITY_LEVEL = { ultra: 3, high: 2, medium: 1, low: 0 };

/**
 * Himmel der Menü-Bühne: ab ULTRA feiner gebacken (0,75 statt 0,5 der Bildauflösung) und mit einer zweiten,
 * dichten Schicht schwacher Sterne (gleiches Sternmaterial, eigene Geometrie).
 */
class MenuSky extends Sky {
  _buildStars(opts) {
    super._buildStars(opts);
    if ((opts.quality || 0) < 3 || !this.starMat) return;
    const N = 11000, B = this.basis;
    let sd = (opts.seed * 9301 + 49297) % 233280;
    const R = () => { sd = (sd * 9301 + 49297) % 233280; return sd / 233280; };
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
    const d = new THREE.Vector3(), side = new THREE.Vector3();
    const cosMax = Math.cos(52 * D2R);
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 12) {
      const ct = cosMax + (1 - cosMax) * R(), st = Math.sqrt(1 - ct * ct), ph = R() * Math.PI * 2;
      side.copy(B.r).multiplyScalar(Math.cos(ph) * st).addScaledVector(B.u, Math.sin(ph) * st);
      d.copy(B.f).multiplyScalar(ct).add(side).normalize();
      if (R() > 0.18 + 0.82 * this._band(d)) continue;
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      const f = 0.05 + Math.pow(R(), 6) * 0.5, w = R();
      col[i * 3] = f * (0.85 + w * 0.2); col[i * 3 + 1] = f * 0.92; col[i * 3 + 2] = f * (1.1 - w * 0.2);
      siz[i] = 0.9 + R() * 0.7;
      i++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, i * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(siz.subarray(0, i), 1));
    this.fine = new THREE.Points(g, this.starMat);
    this.fine.frustumCulled = false; this.fine.renderOrder = -999;
    this.group.add(this.fine);
  }
  _disposeStars() {
    if (this.fine) { this.group.remove(this.fine); this.fine.geometry.dispose(); this.fine = null; }
    super._disposeStars();
  }
  resize(camera, w, h) {
    if (!this.opts || (this.opts.quality || 0) < 3) { super.resize(camera, w, h); return; }
    // Himmel mit 1,5-facher Auflösung backen, Sonne und Strahlen auf die echte Größe zurückstellen
    super.resize(camera, w * 1.5, h * 1.5);
    const SU = this.sunMat.uniforms, radPx = (camera.fov * Math.PI / 180) / h;
    SU.uRes.value.set(w, h); SU.uRadPx.value = radPx;
    SU.uHalf.value = Math.min(900, Math.max(0.16, this.opts.sunR * 30) / radPx);
    if (this.spikeMat) this.spikeMat.uniforms.uRes.value.set(w, h);
  }
}

// Geschwindigkeitslinien beim Abdocken: Liniensegmente um die Blickachse, kommen auf die Kamera zu
const SPEED_N = 520;
class SpeedLines {
  constructor() {
    this.pos = new Float32Array(SPEED_N * 6);
    this.x = new Float32Array(SPEED_N); this.y = new Float32Array(SPEED_N); this.z = new Float32Array(SPEED_N);
    for (let i = 0; i < SPEED_N; i++) this._seed(i, 40 + Math.random() * 1400);
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    this.mat = new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.obj = new THREE.LineSegments(g, this.mat);
    this.obj.frustumCulled = false;
    this.obj.visible = false;
    this.obj.renderOrder = 10;
  }
  _seed(i, z) {
    const a = Math.random() * Math.PI * 2, r = 18 + Math.pow(Math.random(), 0.7) * 260;
    this.x[i] = Math.cos(a) * r; this.y[i] = Math.sin(a) * r * 0.7; this.z[i] = z;
  }
  /** k = 0..1 Stärke, v = Tempo (Einheiten/s), dt */
  update(k, v, dt) {
    this.obj.visible = k > 0.01;
    if (!this.obj.visible) return;
    this.mat.opacity = Math.min(1, k) * 0.85;
    const len = 6 + v * 0.05;
    const P = this.pos;
    for (let i = 0; i < SPEED_N; i++) {
      let z = this.z[i] - v * dt;
      if (z < 8) { this._seed(i, 900 + Math.random() * 600); z = this.z[i]; }
      this.z[i] = z;
      const o = i * 6;
      P[o] = this.x[i]; P[o + 1] = this.y[i]; P[o + 2] = -z;
      P[o + 3] = this.x[i]; P[o + 4] = this.y[i]; P[o + 5] = -z - len;
    }
    this.attr.needsUpdate = true;
  }
}

// Lichtstimmung und Himmelskörper je Heimat (neutral = vor der Zuteilung)
const SETS = {
  neutral: {
    seed: 211, sun: [-0.86, 0.62], sunR: 0.0036, sunCol: [1, 0.96, 0.92], spike: 0.9, light: 1.0,
    key: 0xf4f0ea, keyI: 2.1, rim: 0xa8c4ff, rimI: 1.6, hemi: [0x34405a, 0x050608, 0.3], env: 0.85,
    galC: [0.2, 0.05], galTilt: -0.42, galCore: [1.3, 0.3], mw: 0.032, neb: 0.12,
    bodies: [
      { type: 'ganymede', dist: 42000, roll: 18, rot: 0.0012, seed: 3 },
      { type: 'ice', dist: 30000, roll: 0, rot: 0.002, seed: 8 },
    ],
  },
  europa: {
    seed: 41, sun: [0.86, 0.66], sunR: 0.0062, sunCol: [1, 0.96, 0.9], spike: 0.6, light: 1.05,
    key: 0xfff4e6, keyI: 2.1, rim: 0x9fc4ff, rimI: 1.6, hemi: [0x40506a, 0x07080a, 0.34], env: 0.9,
    galC: [-0.15, 0.25], galTilt: -0.42, galCore: [1.4, -0.3], mw: 0.03, neb: 0.16,
    bodies: [
      { type: 'europa', dist: 30000, roll: 10, rot: 0.0016, seed: 2 },
      { type: 'jupiter', dist: 60000, atmo: [0.55, 0.68, 0.95], atmoK: 0.9, roll: -18, rot: 0.0016, seed: 5 },
    ],
  },
  saturn: {
    seed: 77, sun: [0.88, 0.7], sunR: 0.0042, sunCol: [1, 0.95, 0.88], spike: 0.7, light: 0.95,
    key: 0xfff0dc, keyI: 2.3, rim: 0xa8c6ff, rimI: 1.5, hemi: [0x4a4236, 0x07070a, 0.32], env: 0.9,
    galC: [0.1, -0.1], galTilt: 0.5, galCore: [-1.3, -0.7], mw: 0.028, neb: 0.14,
    bodies: [
      { type: 'saturn', dist: 60000, atmo: [0.95, 0.82, 0.6], atmoK: 0.7, roll: -16, ringOpen: 17, rings: true, rot: 0.0012, seed: 1 },
      { type: 'ice', dist: 28000, roll: 0, rot: 0.002, seed: 4 },
    ],
  },
  eris: {
    seed: 133, sun: [0.84, 0.72], sunR: 0.0016, sunCol: [1, 0.97, 0.94], spike: 1.5, light: 0.62,
    key: 0xe4e6ff, keyI: 1.9, rim: 0xb49cff, rimI: 1.9, hemi: [0x2c2840, 0x050508, 0.4], env: 1.0,
    galC: [-0.3, -0.2], galTilt: 0.95, galCore: [0.8, 1.2], mw: 0.034, neb: 0.13,
    bodies: [
      { type: 'eris', dist: 50000, atmo: [0.6, 0.6, 0.8], atmoK: 0.14, roll: 5, rot: 0.0012, soft: 0.02, seed: 6 },
      { type: 'dark', dist: 26000, roll: 0, rot: 0.002, seed: 9 },
    ],
  },
};
const BODY_LIGHT = { jupiter: 1, saturn: 1, eris: 0.85, europa: 0.95, ice: 1.05, dark: 1.1, ganymede: 1 };

// Einstellungen je Bildschirm. X/Y = Bildposition (−1…1), a = Winkelradius in Grad (Ringplaneten kleiner),
// Objekte: s = Schiff, st = Station (Platz kommt aus dem freien Bildbereich, siehe frame()).
const SHOTS = {
  boot: { fps: 60, rotK: 6, bodies: [{ X: 1.02, Y: -1.32, a: 13 }, { X: -0.55, Y: 0.42, a: 1.1 }], ship: false, station: false, drift: 1 },
  login: { fps: 60, rotK: 6, bodies: [{ X: 0.62, Y: 0.36, a: 12 }, { X: 0.02, Y: 0.62, a: 1.4 }], ship: 'view', station: false, dolly: 1 },
  faction: { fps: 60, rotK: 14, bodies: [{ X: 'v', Y: 'v', a: 'fit' }, { X: 'v+', Y: 0.42, a: 1.6 }], ship: false, station: false },
  // rel: Lage im freien Bildbereich (−1…1 der halben Breite/Höhe) und Größe als Anteil davon
  hub: { fps: 30, rotK: 4, bodies: [{ rel: [-0.58, 0.64, 0.3] }, { rel: [0.78, -0.62, 0.035] }], ship: 'near', station: 'view' },
  launch: { fps: 60, rotK: 4, bodies: [{ rel: [-0.58, 0.64, 0.3] }, { rel: [0.78, -0.62, 0.035] }], ship: 'launch', station: 'view' },
  hangar: { fps: 30, rotK: 4, bodies: [{ X: -0.16, Y: 0.46, a: 3.6, ra: 2.6 }, { X: 0.3, Y: 0.6, a: 0.8 }], ship: 'view', station: false, turn: 1 },
};
const RING_K = 0.42; // Ringplanet: Kugel kleiner, damit die Ringe ins Bild passen

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const KEY_DIR = new THREE.Vector3(-0.55, 0.62, 0.75).normalize();
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ZERO = new THREE.Vector3();
const _box = new THREE.Box3();
const _gv = new THREE.Vector3();

function expK(dt, rate) { return 1 - Math.exp(-dt * rate); }
// ein Bild Pause (bei verstecktem Tab feuert rAF nicht, deshalb mit Zeitgrenze)
const nextFrame = () => new Promise((r) => {
  let done = false;
  const go = () => { if (!done) { done = true; r(); } };
  requestAnimationFrame(() => setTimeout(go, 0));
  setTimeout(go, 60);
});

class Stage {
  constructor() {
    this.ok = false;
    this.canvas = null;
    this.running = false;
    this.visible = false;
    this.raf = 0;
    this.last = 0;
    this.time = 0;
    this.mode = 'boot';
    this.faction = 'neutral';
    this.shipKey = '';
    this.sets = new Map();
    this.view = { X: 0, Y: 0, tw: 0.5, th: 0.5 };   // freier Bildbereich (in tan-Einheiten)
    this.yaw = -2.35; this.yawVel = 0; this.dragging = false;
    this.dolly = 0;
    this.busy = false;
    this.want = null;
    this.lt = -1;              // Startsequenz: Zeit seit Beginn (s), −1 = aus
    this.thumbs = new Map();   // Schiffsbilder für die Werftliste
  }

  _init() {
    if (this.ok || this._failed) return this.ok;
    try {
      const canvas = this.canvas = document.createElement('canvas');
      canvas.className = 'sc-stage';
      canvas.setAttribute('aria-hidden', 'true');
      const gl = this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
      gl.shadowMap.enabled = false;
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.0;
      gl.setClearColor(0x020308, 1);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(FOV, 1.6, 0.5, 120000);
      this.basis = cameraBasis(PITCH);
      this.camera.lookAt(this.basis.f);
      this.camQuat = this.camera.quaternion.clone();
      this.lights = {
        key: new THREE.DirectionalLight(0xffffff, 2.2),
        rim: new THREE.DirectionalLight(0x9fc4ff, 1.5),
        hemi: new THREE.HemisphereLight(0x40506a, 0x050608, 0.35),
      };
      this.scene.add(this.lights.key, this.lights.key.target, this.lights.rim, this.lights.rim.target, this.lights.hemi);
      this.factory = new ModelFactory();
      for (const [key, url] of MODELS) this.factory.registerGLB(key, url).catch(() => { /* Platzhalter bleibt */ });
      this.objects = new THREE.Group();
      this.scene.add(this.objects);
      this.speed = new SpeedLines();
      this.speedRig = new THREE.Group();
      this.speedRig.add(this.speed.obj);
      this.scene.add(this.speedRig);
      // Schatten (nur ULTRA): Führungslicht wirft Schatten auf Station und Schiff
      const K = this.lights.key;
      K.shadow.mapSize.set(2048, 2048);
      K.shadow.bias = -0.0004; K.shadow.normalBias = 0.6;
      K.shadow.camera.near = 1; K.shadow.camera.far = 2000;
      this.ship = null; this.station = null;
      this.shipPos = new THREE.Vector3(); this.stPos = new THREE.Vector3();
      this.camPos = new THREE.Vector3();
      this.poses = [{ X: 0, Y: 0, a: 1 }, { X: 0, Y: 0, a: 1 }];
      this.q = -1;
      this.composer = null;
      this._applyQuality();
      this._onResize = () => this.resize();
      addEventListener('resize', this._onResize);
      document.addEventListener('visibilitychange', () => { if (document.hidden) this._stop(); else if (this.visible) this._start(); });
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this._stop(); this.ok = false; this._failed = true; this.canvas.remove(); });
      document.body.insertBefore(canvas, document.getElementById('screens'));
      this.ok = true;
      this.resize();
    } catch (err) {
      console.warn('Menü-Szene nicht verfügbar:', err);
      this._failed = true;
      this.ok = false;
    }
    return this.ok;
  }

  _applyQuality() {
    const q = QUALITY_LEVEL[settings().quality] ?? 2;
    if (q === this.q) return;
    const shadowsBefore = this.gl.shadowMap.enabled;
    this.q = q;
    const dpr = window.devicePixelRatio || 1;
    this.pr = q >= 3 ? Math.min(dpr, 2) : q === 2 ? Math.min(dpr, 1.5) : q === 1 ? Math.min(dpr, 1) : Math.min(dpr, 0.8);
    this.samples = q >= 3 ? Math.min(8, this.gl.capabilities.maxSamples || 4) : q === 2 ? Math.min(4, this.gl.capabilities.maxSamples || 4) : 0;
    this.gl.shadowMap.enabled = q >= 3;
    this.lights.key.castShadow = q >= 3;
    if (shadowsBefore !== this.gl.shadowMap.enabled) this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    if (this.composer) { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.composer = null; this.smaa = null; }
    if (q >= 1) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: this.samples });
      this.composer = new EffectComposer(this.gl, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.6, 0.9);
      this.composer.addPass(this.bloom);
      this.look = new CameraLookPass();
      this.look.setQuality(q);
      this.look.uniforms.uVig.value = 0.4;
      this.composer.addPass(this.look);
      if (q >= 3) { this.smaa = new SMAAPass(4, 4); this.composer.addPass(this.smaa); }
    }
    for (const s of this.sets.values()) s.dirty = true; // Sternzahl und Auflösung neu
    if (this.canvas) this.resize();
  }

  // ---------------------------------------------------------------- Heimat-Sets

  _set(id) {
    const s = this.sets.get(id);
    if (s && !s.dirty) return s;
    const it = this._build(id);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  /** Heimat-Set in Schritten aufbauen (zwischen den Schritten darf der Browser zeichnen) */
  * _build(id) {
    let s = this.sets.get(id);
    if (s && !s.dirty) return s;
    if (s) this._disposeSet(s);
    const C = SETS[id] || SETS.neutral;
    const sky = new MenuSky(this.gl, this.scene, PITCH);
    const planets = new MenuPlanets(this.gl, sky.baker);
    sky.group.visible = false; planets.group.visible = false;
    this.scene.add(planets.group);
    yield { wait: this._precompile(sky.skyMat) };
    const w = this.W * this.pr, h = this.H * this.pr;
    const sunCol = new THREE.Color(C.sunCol[0], C.sunCol[1], C.sunCol[2]);
    const firstDir = this._dir(C.bodies[0].X ?? -0.3, 0.3, new THREE.Vector3());
    sky.build({
      seed: C.seed, sun: C.sun, sunR: C.sunR, sunCol, spike: C.spike, galC: C.galC, galTilt: C.galTilt,
      galCore: C.galCore, mw: C.mw, neb: C.neb, planetDir: firstDir,
      planetCol: new THREE.Color(...(C.bodies[0].atmo || [0.4, 0.42, 0.48])), quality: this.q,
    }, this.camera, w, h);
    yield 'HIMMEL';
    const sd = sky.sunDir;
    const res = this.q >= 3 ? 4096 : this.q >= 2 ? 2048 : 1024;
    for (let i = 0; i < C.bodies.length; i++) {
      const b = C.bodies[i];
      const dir = this._dir(i ? 0.5 : -0.2, i ? 0.4 : 0.1, new THREE.Vector3());
      const up = this.basis.u.clone().addScaledVector(dir, -this.basis.u.dot(dir)).normalize();
      up.applyAxisAngle(dir, (b.roll || 0) * D2R);
      const open = (b.ringOpen ?? 12) * D2R;
      const pole = up.clone().multiplyScalar(Math.cos(open)).addScaledVector(dir, -Math.sin(open)).normalize();
      const L = sd.clone().addScaledVector(dir, -sd.dot(dir)).normalize().addScaledVector(dir, -0.16).normalize();
      const bm = planets.bakeMaterial(b.type);
      if (bm) yield { wait: this._precompile(bm) };
      planets.add({
        kind: b.type, dir, dist: b.dist, angR: 4 * D2R, par: 0.02, pole, L, sunCol,
        light: C.light * (BODY_LIGHT[b.type] || 1) * 1.1, atmo: new THREE.Color(...(b.atmo || [0, 0, 0])), atmoK: b.atmoK || 0,
        soft: b.soft ?? (b.atmoK ? 0.1 : 0.025), night: 0.0015, rings: !!b.rings,
        res: i === 0 ? res : Math.min(2048, res / 2), seed: b.seed * 7.3 % 100, rot: b.rot, detail: this.q >= 1 ? 1 : 0,
      });
      yield i ? 'MOND' : 'PLANET';
    }
    // Spiegelungen auf den Rümpfen aus demselben Himmel
    const eq = sky.bakeEquirect(_v.set(-0.4, 0.7, 0.6).normalize());
    const pm = new THREE.PMREMGenerator(this.gl);
    const envRT = pm.fromEquirectangular(eq.texture);
    pm.dispose(); eq.dispose();
    s = { id, C, sky, planets, envRT, dirty: false, sized: `${w}x${h}` };
    this.sets.set(id, s);
    yield 'REFLEXE';
    // Darstellungs-Shader (Planeten, Himmel) parallel übersetzen
    if (this.gl.compileAsync) {
      yield { wait: this.gl.compileAsync(planets.group, this.camera, this.scene) };
      yield { wait: this.gl.compileAsync(sky.group, this.camera, this.scene) };
    }
    return s;
  }

  /** Vollbild-Shader vorab übersetzen, ohne den Hauptfaden zu blockieren (wenn der Treiber es kann) */
  _precompile(mat) {
    if (!this.gl.compileAsync || !mat) return Promise.resolve();
    if (!this._pcScene) {
      this._pcScene = new THREE.Scene();
      this._pcMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      this._pcMesh.frustumCulled = false;
      this._pcScene.add(this._pcMesh);
    }
    this._pcMesh.material = mat;
    return this.gl.compileAsync(this._pcScene, this.camera).catch(() => {});
  }

  /** Aufbau-Schritte asynchron abarbeiten: Warte-Schritte abwarten, sonst ein Bild Pause */
  async _run(it, onLabel) {
    let r = it.next();
    while (!r.done) {
      if (r.value && r.value.wait) { try { await r.value.wait; } catch { /* übersetzt beim Backen */ } }
      else { if (onLabel) await onLabel(r.value); else await nextFrame(); }
      r = it.next();
    }
    return r.value;
  }

  _disposeSet(s) {
    s.planets.dispose();
    this.scene.remove(s.planets.group);
    s.sky.dispose();
    s.envRT.dispose();
    this.sets.delete(s.id);
  }

  _activate(id) {
    const s = this._set(id);
    if (this.cur === s) return;
    if (this.cur) { this.cur.sky.group.visible = false; this.cur.planets.group.visible = false; }
    this.cur = s;
    s.sky.group.visible = true; s.planets.group.visible = true;
    const w = this.W * this.pr, h = this.H * this.pr;
    if (s.sized !== `${w}x${h}`) { s.sky.resize(this.camera, w, h); s.sized = `${w}x${h}`; }
    this.scene.environment = s.envRT.texture;
    this.scene.environmentIntensity = s.C.env;
    const C = s.C, L = this.lights;
    // Führungslicht von vorn oben links (Schauseite), Kante aus Richtung der Sonne
    L.key.position.set(-0.55, 0.62, 0.75).multiplyScalar(1000);
    L.key.color.setHex(C.key); L.key.intensity = C.keyI;
    L.rim.position.copy(s.sky.sunDir).multiplyScalar(1000).setY(380);
    L.rim.color.setHex(C.rim); L.rim.intensity = C.rimI;
    L.hemi.color.setHex(C.hemi[0]); L.hemi.groundColor.setHex(C.hemi[1]); L.hemi.intensity = C.hemi[2];
    if (this.look) {
      this.look.uniforms.uSun.value.copy(s.sky.sunScreen);
      this.look.uniforms.uSunCol.value.copy(s.sky.skyMat.uniforms.uSunCol.value);
      this.look.uniforms.uFlare.value = C.spike > 1 ? 0.5 : 1.0;
    }
    this._snap = true;
  }

  // Blickrichtung zu einem Bildpunkt (X, Y in −1…1 des ganzen Bildes)
  _dir(X, Y, out) {
    const a = this.camera.aspect;
    return out.copy(this.basis.f).addScaledVector(this.basis.r, X * TAN * a).addScaledVector(this.basis.u, Y * TAN).normalize();
  }

  // ---------------------------------------------------------------- Modelle

  _ensureShip(faction, shipId, loadout) {
    const key = `${faction}|${shipId}|${(loadout?.lasers || []).join(',')}|${(loadout?.gens || []).join(',')}|${this.factory.version}`;
    if (key === this.shipKey) return;
    this.shipKey = key;
    if (this.ship) this.objects.remove(this.ship.root);
    this.ship = null;
    if (!faction || faction === 'neutral') return;
    let m = null;
    try { m = this.factory.buildShip(faction, shipId || 's1', loadout || { lasers: ['pulse', 'pulse'], gens: [] }); } catch (err) { console.warn('Schiff für Menü nicht gebaut:', err); return; }
    // Triebwerksstrahl ist für die Draufsicht gebaut; von der Seite liefert er ungültige Werte im Bloom
    for (const en of m.engines) en.trail.visible = false;
    m.model = m.root;
    m.root = this._pivot(m.model, m);
    m.model.traverse((o) => { if (o.isMesh && !(o.material && o.material.transparent)) o.castShadow = o.receiveShadow = true; });
    this.objects.add(m.root);
    this.ship = m;
  }

  _ensureStation(faction) {
    const key = faction && faction !== 'neutral' ? `${faction}|${this.factory.version}` : '';
    if (key === this.stKey) return;
    this.stKey = key;
    if (this.station) this.objects.remove(this.station.root);
    this.station = null;
    if (!key) return;
    let st = null;
    try { st = buildMenuStation(faction); } catch (err) { console.warn('Station für Menü nicht gebaut:', err); return; }
    if (!st.pivot) { st.pivot = this._pivot(st.root, st); }
    this.station = { root: st.pivot, model: st.root, spin: st.spin, st, radius: st.radius };
    this.objects.add(st.pivot);
  }

  /** Drehpunkt in die Mitte der sichtbaren Teile legen (Modelle haben ihren Ursprung oft am Heck) */
  _pivot(model, m) {
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.traverse((o) => { if ((o.isMesh) && o.visible && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(_box); } });
    if (box.isEmpty()) box.setFromObject(model);
    box.getCenter(_v);
    model.position.sub(_v);
    m.radius = Math.max(18, box.getSize(_w).length() * 0.5);
    const pivot = new THREE.Group();
    pivot.add(model);
    return pivot;
  }

  // ---------------------------------------------------------------- Öffentlich

  /** Szene zeigen. o: { mode, faction, ship, loadout } */
  show(o = {}) {
    if (!this._init()) return false;
    this._applyQuality();
    if (o.mode) this.mode = o.mode;
    if (o.faction !== undefined) this.faction = o.faction || 'neutral';
    if (o.ship !== undefined || o.loadout !== undefined) { this.shipId = o.ship || 's1'; this.loadout = o.loadout || null; }
    this._activate(SETS[this.faction] ? this.faction : 'neutral');
    if (this.mode === 'login') this.dolly = 0;
    this.visible = true;
    this.canvas.classList.add('is-on');
    this._start();
    return true;
  }

  /** WebGL bereit? (legt Leinwand und Renderer an, baut noch nichts) */
  available() { return this._init(); }

  /**
   * Szene in Schritten aufbauen und Shader vorab übersetzen, dann zeigen.
   * onStep(text, 0..1) meldet den Fortschritt. Zwischen den Schritten bekommt der Browser ein Bild.
   */
  async prepare(o = {}, onStep = null) {
    if (!this._init()) return false;
    while (this.busy) await nextFrame();
    this.busy = true;
    try { return await this._prepare(o, onStep); } finally {
      this.busy = false;
      if (this.want && this.want !== this.faction) this._switch(); else this.want = null;
    }
  }

  async _prepare(o, onStep) {
    this._applyQuality();
    const f = o.faction !== undefined ? (o.faction && SETS[o.faction] ? o.faction : 'neutral') : this.faction;
    const mode = o.mode || this.mode;
    const shot = SHOTS[mode] || SHOTS.hub;
    const it = this._build(f);
    const total = 6 + (shot.station && f !== 'neutral' ? 2 : 0) + (shot.ship && f !== 'neutral' ? 1 : 0);
    let n = 0;
    const tick = async (txt) => { n++; onStep?.(txt, Math.min(0.96, n / total)); await nextFrame(); };
    await this._run(it, tick);
    if (shot.ship && f !== 'neutral') {
      if (o.ship !== undefined || o.loadout !== undefined) { this.shipId = o.ship || 's1'; this.loadout = o.loadout || null; }
      this._ensureShip(f, this.shipId, this.loadout);
      await tick('SCHIFF');
    }
    if (shot.station && f !== 'neutral') {
      this._ensureStation(f);
      await tick('STATION');
    }
    // Modell-Shader parallel übersetzen, bevor sie zum ersten Mal gezeichnet werden (mit der neuen Umgebung)
    const set = this.sets.get(f);
    if (set && this.gl.compileAsync) {
      this.scene.environment = set.envRT.texture;
      try { await this.gl.compileAsync(this.objects, this.camera, this.scene); } catch { /* übersetzt beim ersten Bild */ }
    }
    await tick('SHADER');
    this.show(o);
    onStep?.('BEREIT', 1);
    return true;
  }

  /** Weitere Heimat-Sets im Hintergrund vorbereiten (Fraktionswahl), ohne sie zu zeigen */
  async preload(ids) {
    if (!this.ok) return;
    for (const id of ids) {
      if (!SETS[id] || (this.sets.get(id) && !this.sets.get(id).dirty)) continue;
      while (this.busy) await nextFrame();
      if (!this.ok || !this.visible) return;
      this.busy = true;
      try {
        await this._run(this._build(id));
      } finally {
        this.busy = false;
      }
      if (this.want && this.want !== this.faction) { await this._switch(); }
    }
  }

  /**
   * Heimat im Hintergrund vorbauen, ohne sie zu zeigen (Anmeldung, Fraktionswahl): Himmel, Planeten, Station,
   * Shader. Der Hub findet danach alles fertig vor. Mehrfachaufrufe beim Tippen werden zusammengefasst.
   */
  async warm(o) {
    if (!this.ok || !o || !SETS[o.faction]) return;
    this._warmWant = o;
    if (this._warming) return;
    this._warming = true;
    try {
      await new Promise((r) => setTimeout(r, 350));
      while (this._warmWant) {
        const w = this._warmWant;
        this._warmWant = null;
        while (this.busy) await nextFrame();
        if (!this.ok) return;
        this.busy = true;
        try {
          const set = await this._run(this._build(w.faction));
          await nextFrame();
          this._ensureStation(w.faction);
          await nextFrame();
          if (this.station && set && this.gl.compileAsync) {
            const env = this.scene.environment, vis = this.station.root.visible;
            this.scene.environment = set.envRT.texture;
            this.station.root.visible = true;
            const p = this.gl.compileAsync(this.station.root, this.camera, this.scene);
            this.station.root.visible = vis;
            this.scene.environment = env;
            try { await p; } catch { /* übersetzt beim ersten Bild */ }
          }
        } finally {
          this.busy = false;
        }
        if (this.want && this.want !== this.faction) await this._switch();
      }
    } finally {
      this._warming = false;
    }
  }

  /** Andere Heimat (Fraktionswahl, Anmeldung): kurzer Bildschnitt */
  setFaction(f) {
    if (!this.ok) return;
    f = f && SETS[f] ? f : 'neutral';
    this.want = f;
    if (this.busy) return;               // läuft gerade ein Aufbau: Wunsch wird danach übernommen
    if (f === this.faction) { this.want = null; return; }
    this._switch();
  }

  // Heimatwechsel: fehlendes Set in Schritten bauen (kein Ruckeln), dann Bildschnitt
  async _switch() {
    this.busy = true;
    try {
      await nextFrame();
      while (this.want && this.want !== this.faction) {
        const f = this.want;
        await this._run(this._build(f));
        if (this.want !== f) continue;
        this.faction = f;
        this.canvas.classList.remove('is-cut'); void this.canvas.offsetWidth; this.canvas.classList.add('is-cut');
        this._activate(f);
        if (this.mode === 'login') this.dolly = 0.35;
      }
    } finally {
      this.want = null;
      this.busy = false;
    }
  }

  setMode(m) { if (this.ok && SHOTS[m]) { this.mode = m; } }

  setShip(shipId, loadout) { this.shipId = shipId; this.loadout = loadout; }

  /** Freien Bildbereich übernehmen (Element ohne Panels darüber). Nur bei Layoutwechsel aufrufen. */
  frame(el) {
    if (!this.ok || !el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    const W = this.W || innerWidth, H = this.H || innerHeight;
    const a = W / H;
    this.view.X = ((r.left + r.width / 2) / W) * 2 - 1;
    this.view.Y = 1 - ((r.top + r.height / 2) / H) * 2;
    this.view.tw = (r.width / W) * TAN * a;
    this.view.th = (r.height / H) * TAN;
  }

  /** Hangar: Schiff mit der Maus drehen */
  drag(dx) { this.yawVel = dx * 0.006; this.yaw += dx * 0.006; this.dragging = true; this._dragT = 0.25; }

  hide() {
    if (!this.ok) return;
    this.visible = false;
    this.canvas.classList.remove('is-on');
    setTimeout(() => { if (!this.visible) { this._stop(); this.endLaunch(); } }, 420);
  }

  // ---------------------------------------------------------------- Startsequenz (Abdocken in 3D)

  /** Abdock-Aufnahme starten: Schiff löst sich, dreht vom Dock weg, zündet bei 3 s, Kamera folgt. */
  launch() {
    if (!this.ok || !this.visible || !this.ship) return false;
    this.mode = 'launch';
    this.lt = 0;
    this.launchCam = this.launchCam || new THREE.Vector3();
    this.launchOff = this.launchOff || new THREE.Vector3();
    this.launchCam.set(0, 0, 0); this.launchOff.set(0, 0, 0);
    this.launchV = 0; this.launchYaw0 = this.yaw; this.shake = 0; this.speedK = 0; this.speedV = 0; this._ign = false;
    this._start();
    return true;
  }

  /** Zündung sofort (Taste während der Sequenz) */
  ignite() { if (this.lt >= 0 && this.lt < 3) this.lt = 3; }

  endLaunch() {
    if (this.lt < 0) return;
    this.lt = -1;
    this.speedK = 0;
    if (this.launchCam) this.launchCam.set(0, 0, 0);
    if (this.ship) this.ship.root.userData.placed = false;
    if (this.mode === 'launch') this.mode = 'hub';
    this.speed.update(0, 0, 0);
  }

  _launchShip(m, L, dt) {
    const r = m.radius;
    // Drehen vom Dock weg (Bug zeigt in die Tiefe), leicht nach unten
    const e = smooth(0.4, 2.9, L);
    const yaw = this.launchYaw0 + (0 - this.launchYaw0) * e;
    m.root.rotation.set(0.3 + (-0.06 - 0.3) * e, yaw, Math.sin(e * Math.PI) * -0.18);
    // Manövrierdüsen, dann Hauptantrieb ab 3 s
    const acc = L < 3 ? r * 0.5 * smooth(0.2, 1.4, L) : r * 34;
    if (L >= 3 && !this._ign) { this._ign = true; this.shake = r * 0.06; }
    this.launchV = L < 3 ? Math.min(r * 0.9, this.launchV + acc * dt) : this.launchV + acc * dt;
    _d.set(0, 0, -1).applyEuler(m.root.rotation);
    this.launchOff.addScaledVector(_d, this.launchV * dt);
    m.root.position.add(this.launchOff);
    // Kamera folgt mit wachsendem Anteil
    const follow = smooth(3.25, 4.5, L) * 0.93;
    this.launchCam.addScaledVector(_d, this.launchV * dt * follow);
    this.speedK = smooth(3.3, 4.4, L);
    this.speedV = 160 + Math.max(0, L - 3) * 1100;
    return smooth(2.85, 3.2, L) * (0.85 + Math.random() * 0.15);
  }

  _fitShadow(pos, R) {
    const K = this.lights.key;
    K.target.position.copy(pos);
    K.position.copy(KEY_DIR).multiplyScalar(R * 2.4).add(pos);
    const c = K.shadow.camera, ex = R * 1.15;
    if (c.right !== ex) { c.left = -ex; c.right = ex; c.top = ex; c.bottom = -ex; c.near = 1; c.far = R * 4.8; c.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- Werftliste: Schiffsbilder

  /**
   * Schiff einmal aus der 3D-Bühne rendern (2× überabgetastet, 4× MSAA, Fließkomma), Tonwerte wie im Bild,
   * Ergebnis als PNG-Adresse zwischengespeichert. Liefert null ohne WebGL.
   */
  thumbnail(faction, shipId) {
    if (!this.ok || !this.cur) return null;
    const key = `${faction}|${shipId}|${this.factory.version}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    let m = null;
    try { m = this.factory.buildShip(faction, shipId, { lasers: ['pulse', 'pulse'], gens: [] }); } catch { return null; }
    for (const en of m.engines) { en.trail.visible = false; en.glow.scale.setScalar(4.4 * en.size); }
    const piv = this._pivot(m.root, m);
    piv.rotation.set(0.32, -2.35, 0);
    const url = this._shoot(piv, m.radius, 512, 256, 0.62);
    if (url) this.thumbs.set(key, url);
    return url;
  }

  /**
   * Bauteil (Laser oder Generator) einzeln rendern, wie es am Schiff sitzt: Teil aus einem Platzhalter-Schiff lösen,
   * in die Mitte legen, Dreiviertel-Ansicht. kind 'laser' | 'gen'. Liefert PNG-Adresse oder null.
   */
  partThumb(faction, kind, id) {
    if (!this.ok || !this.cur) return null;
    const key = `part|${kind}|${id}|${this.factory.version}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    let part = null;
    for (const shipId of ['s2', 's3', 's1']) {
      let m = null;
      try { m = this.factory.buildShip(faction, shipId, kind === 'laser' ? { lasers: [id], gens: [] } : { lasers: [], gens: [id] }); } catch { continue; }
      if (kind === 'laser') part = m.lasers[0]?.part || null;
      else part = m.hull.getObjectByName(hpName('Gen', 0))?.children[0] || null;
      if (part) break;
    }
    if (!part) return null;
    part.removeFromParent();
    part.position.set(0, 0, 0);
    part.rotation.set(0, 0, 0);
    part.scale.setScalar(1);
    part.traverse((o) => { if (o.isSprite) o.visible = false; });
    const holder = { radius: 1 };
    const piv = this._pivot(part, holder);
    piv.updateMatrixWorld(true);
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    part.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
    _box.copy(bb);
    const r = Math.max(0.5, _box.isEmpty() ? 2 : _box.getSize(_v).length() * 0.5);
    piv.rotation.set(0.5, kind === 'laser' ? -2.1 : -0.7, 0);
    const url = this._shoot(piv, r, 384, 240, 1.25);
    if (url) this.thumbs.set(key, url);
    return url;
  }

  /** Einmal-Aufnahme eines Objekts (2× überabgetastet, 4× MSAA, Fließkomma, ACES wie im Bild) als PNG-Adresse */
  _shoot(piv, radius, W, H, fill) {
    this._trs ||= new Map();
    const tk = `${W}x${H}`;
    let T = this._trs.get(tk);
    if (!T) {
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(26, W / H, 0.05, 8000);
      const key2 = new THREE.DirectionalLight(0xfff2e4, 2.8); key2.position.set(-0.6, 1, 0.7);
      const rim = new THREE.DirectionalLight(0xa8c6ff, 2.6); rim.position.set(0.8, 0.35, -0.9);
      scene.add(key2, rim, new THREE.HemisphereLight(0x56647e, 0x08090c, 0.55));
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, samples: 4 });
      const c1 = document.createElement('canvas'); c1.width = W; c1.height = H;
      const c2 = document.createElement('canvas'); c2.width = W / 2; c2.height = H / 2;
      T = { scene, cam, rt, buf: new Float32Array(W * H * 4), c1, c2, img: c1.getContext('2d').createImageData(W, H) };
      this._trs.set(tk, T);
    }
    T.scene.add(piv);
    T.scene.environment = this.cur.envRT.texture;
    T.scene.environmentIntensity = 1;
    const dist = radius / Math.tan(13 * D2R) * fill;
    T.cam.near = Math.max(0.02, dist * 0.02);
    T.cam.far = dist * 20;
    T.cam.updateProjectionMatrix();
    T.cam.position.set(0, radius * 0.18, dist);
    T.cam.lookAt(0, 0, 0);
    const gl = this.gl;
    let ok = true;
    try {
      gl.setRenderTarget(T.rt);
      gl.setClearColor(0x000000, 0);
      gl.clear();
      gl.render(T.scene, T.cam);
      gl.readRenderTargetPixels(T.rt, 0, 0, W, H, T.buf);
    } catch (err) { ok = false; console.warn('Vorschaubild nicht gerendert:', err); }
    gl.setRenderTarget(null);
    gl.setClearColor(0x020308, 1);
    T.scene.remove(piv);
    if (!ok) return null;
    const B = T.buf, D = T.img.data;
    const aces = (x) => { x *= 1.05; const y = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); return y <= 0 ? 0 : y >= 1 ? 1 : y; };
    const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4, dst = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) {
        const a = Math.min(1, B[src + x + 3]);
        D[dst + x] = srgb(aces(B[src + x])); D[dst + x + 1] = srgb(aces(B[src + x + 1])); D[dst + x + 2] = srgb(aces(B[src + x + 2]));
        D[dst + x + 3] = a * 255;
      }
    }
    T.c1.getContext('2d').putImageData(T.img, 0, 0);
    const g2 = T.c2.getContext('2d');
    g2.clearRect(0, 0, W / 2, H / 2);
    g2.imageSmoothingQuality = 'high';
    g2.drawImage(T.c1, 0, 0, W / 2, H / 2);
    return T.c2.toDataURL('image/png');
  }

  /**
   * Hangar: Bildschirmlage der Steckplätze am Schiffsmodell (CSS-Pixel). out = Array, wird gefüllt mit
   * { kind: 'L'|'G', i, x, y, front } – nur Plätze, die das Modell kennt. Liefert out.
   */
  hardpoints(out = []) {
    out.length = 0;
    const m = this.ship;
    if (!this.ok || !this.visible || !m || !m.root.visible) return out;
    const W = this.W || innerWidth, H = this.H || innerHeight;
    m.root.updateMatrixWorld(true);
    _w.setFromMatrixPosition(this.camera.matrixWorld);
    const ctr = _d.setFromMatrixPosition(m.root.matrixWorld);
    const dc = ctr.distanceTo(_w);
    const add = (kind, i, o) => {
      if (o.isVector3) _v.copy(o); else o.getWorldPosition(_v);
      const front = _v.distanceTo(_w) <= dc;
      _v.project(this.camera);
      if (_v.z > 1) return;
      out.push({ kind, i, x: (_v.x + 1) * 0.5 * W, y: (1 - _v.y) * 0.5 * H, front });
    };
    for (let i = 0; i < 16; i++) {
      const hp = m.hull.getObjectByName(hpName('Laser', i)) || m.lasers.find((l) => l.slot === i)?.muzzle;
      if (!hp) { if (i > m.lasers.length) break; continue; }
      add('L', i, hp);
    }
    // Generatoren: Hardpoint, sonst eigenes Bauteil des Modells (Generator_Port …), Mitte seiner Hülle
    if (!m._genNodes) {
      const names = ['Generator_Port', 'Generator_Starboard'];
      for (let i = 1; i <= 16; i++) names.push(`Generator_${String(i).padStart(2, '0')}`);
      m._genNodes = names.map((n) => m.hull.getObjectByName(n)).filter(Boolean);
      m._genBox = new THREE.Box3();
      // Modell ohne Generator-Punkte: Buchten auf dem Rückenpanzer (Mitte der oberen Hülle, längs verteilt)
      if (!m._genNodes.length && !m.hull.getObjectByName(hpName('Gen', 0))) {
        const inv = new THREE.Matrix4().copy(m.root.matrixWorld).invert();
        const bb = new THREE.Box3(), tb = new THREE.Box3();
        m.hull.traverse((o) => { if (o.isMesh && o.visible && o.geometry && !o.material?.transparent && o.parent?.visible !== false) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); bb.union(tb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv)); } });
        if (!bb.isEmpty()) {
          m._genSpots = [];
          const len = bb.max.z - bb.min.z, mid = (bb.min.z + bb.max.z) / 2;
          for (let i = 0; i < 8; i++) {
            const o = new THREE.Object3D();
            const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
            o.position.set((bb.min.x + bb.max.x) / 2 + side * (bb.max.x - bb.min.x) * 0.14, bb.min.y + (bb.max.y - bb.min.y) * 0.8, mid + len * (0.14 - row * 0.13));
            m.root.add(o);
            m._genSpots.push(o);
          }
        }
      }
    }
    for (let i = 0; i < 16; i++) {
      const hp = m.hull.getObjectByName(hpName('Gen', i));
      if (hp) { add('G', i, hp); continue; }
      const node = m._genNodes[i];
      if (!node) { if (m._genSpots?.[i]) { add('G', i, m._genSpots[i]); continue; } break; }
      m._genBox.setFromObject(node);
      if (!m._genBox.isEmpty()) add('G', i, m._genBox.getCenter(_gv));
    }
    return out;
  }

  resize() {
    if (!this.ok) return;
    const W = this.W = Math.max(1, innerWidth), H = this.H = Math.max(1, innerHeight);
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.gl.setPixelRatio(this.pr);
    this.gl.setSize(W, H, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pr);
      this.composer.setSize(W, H);
      this.look.uniforms.uAspect.value = W / H;
    }
    if (this.cur) {
      const w = W * this.pr, h = H * this.pr;
      this.cur.sky.resize(this.camera, w, h);
      this.cur.sized = `${w}x${h}`;
      if (this.look) this.look.uniforms.uSun.value.copy(this.cur.sky.sunScreen);
    }
    if (this.visible && !this.running) this._draw(0);
  }

  // ---------------------------------------------------------------- Bildschleife

  _start() {
    if (this.running || document.hidden || !this.ok) return;
    this.running = true;
    this.last = 0;
    const step = (now) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(step);
      const shot = SHOTS[this.mode] || SHOTS.hub;
      const fps = this.dragging ? 60 : shot.fps;
      if (this.last && now - this.last < 1000 / fps - 2) return;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
      this.last = now;
      this._draw(dt);
    };
    this.raf = requestAnimationFrame(step);
  }

  _stop() { this.running = false; if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; }

  /** Kennwerte für die Anzeige im Bereich SYSTEM */
  info() {
    return {
      w: Math.round((this.W || 0) * (this.pr || 1)), h: Math.round((this.H || 0) * (this.pr || 1)), bloom: !!this.composer,
      aa: this.composer ? this.samples || 0 : 0, smaa: !!this.smaa, shadow: !!(this.gl && this.gl.shadowMap.enabled),
    };
  }

  _draw(dt) {
    this.frames = (this.frames || 0) + 1;
    const RM = reduced();
    const tdt = RM ? 0 : dt;
    this.time += tdt;
    const t = this.time;
    this.factory.uTime.value = t;
    const shot = SHOTS[this.mode] || SHOTS.hub;
    const s = this.cur;
    if (!s) return;
    const snap = this._snap || dt === 0;
    this._snap = false;
    const k = snap ? 1 : expK(dt, 3.6);
    const V = this.view;

    // Kamera: ruhiges Treiben, bei der Anmeldung langsame Fahrt auf das Schiff
    if (shot.dolly) this.dolly = Math.min(1, this.dolly + tdt / 26);
    const e = this.dolly * (2 - this.dolly);
    const cp = this.camPos;
    cp.set(Math.sin(t * 0.07) * 2.2, Math.sin(t * 0.05 + 1) * 1.2, 0);
    if (shot.dolly) cp.addScaledVector(this.basis.f, -60 + e * 60);
    // Startsequenz: Zeitachse, Kamera folgt dem Schiff (Verschiebung kommt aus dem letzten Bild)
    const L = this.lt >= 0 ? (this.lt += tdt || dt) : -1;
    if (L >= 0 && this.launchCam) {
      cp.add(this.launchCam);
      const sh = this.shake * (RM ? 0 : 1);
      if (sh > 0.001) { cp.x += (Math.random() - 0.5) * sh; cp.y += (Math.random() - 0.5) * sh; this.shake *= Math.exp(-dt * 3.2); }
    }
    this.camera.position.copy(cp);
    this.camera.quaternion.copy(this.camQuat);

    // Himmelskörper: Bildposition und Größe weich nachführen
    const bodies = s.planets.bodies;
    for (let i = 0; i < bodies.length && i < shot.bodies.length; i++) {
      const sp = shot.bodies[i], P = this.poses[i], def = s.C.bodies[i];
      let X = sp.X, Y = sp.Y, a = sp.a;
      if (sp.rel) {
        // im freien Bildbereich: Lage und Größe relativ zur Fläche ohne Panels
        const hw = V.tw / (TAN * this.camera.aspect), hh = V.th / TAN;
        X = V.X + sp.rel[0] * hw; Y = V.Y + sp.rel[1] * hh;
        a = Math.atan(Math.min(V.tw, V.th) * sp.rel[2]) / D2R;
        if (def.rings) a *= RING_K;
      } else if (X === 'v') X = V.X; else if (X === 'v+') X = Math.min(0.9, V.X + V.tw / (TAN * this.camera.aspect) * 0.92);
      if (Y === 'v') Y = V.Y;
      if (sp.rel) { /* schon gesetzt */ } else if (a === 'fit') { a = Math.atan(Math.min(V.tw, V.th) * 0.86) / D2R; if (def.rings) a *= RING_K; }
      else if (def.rings) a = sp.ra ?? a * RING_K;
      if (snap) { P.X = X; P.Y = Y; P.a = a; } else { P.X += (X - P.X) * k; P.Y += (Y - P.Y) * k; P.a += (a - P.a) * k; }
      const B = bodies[i];
      this._dir(P.X, P.Y, B.dir);
      B.root.children[0].scale.setScalar(B.dist * Math.sin(P.a * D2R));
    }
    s.planets.update(cp, ZERO, t * shot.rotK);
    s.sky.update(this.gl.getPixelRatio());

    // Schiff
    const wantShip = shot.ship && this.faction !== 'neutral';
    if (wantShip) this._ensureShip(this.faction, this.shipId, this.loadout);
    if (this.ship) {
      const m = this.ship;
      m.root.visible = !!wantShip;
      if (wantShip) {
        let X, Y, d;
        if (shot.ship === 'near' || shot.ship === 'launch') {
          // vor der Station, unten im freien Bereich
          X = V.X + V.tw / (TAN * this.camera.aspect) * 0.5; Y = V.Y - V.th / TAN * 0.62;
          d = m.radius / (Math.min(V.tw, V.th) * 0.3);
        } else if (shot.dolly) {
          X = V.X - V.tw / (TAN * this.camera.aspect) * 0.12; Y = V.Y - V.th / TAN * 0.22;
          d = m.radius / (Math.min(V.tw, V.th) * 1.05);
        } else {
          X = V.X; Y = V.Y + 0.02;
          d = m.radius / (Math.min(V.tw, V.th) * 1.0);
        }
        this._dir(X, Y, _d);
        _w.copy(_d).multiplyScalar(d);
        if (snap || !m.root.userData.placed) { this.shipPos.copy(_w); m.root.userData.placed = true; } else this.shipPos.lerp(_w, k);
        m.root.position.copy(this.shipPos);
        m.root.position.y += Math.sin(t * 0.9) * m.radius * 0.015;
        let boost = 0;
        if (shot.ship === 'launch' && L >= 0) boost = this._launchShip(m, L, dt);
        // Drehteller im Hangar, sonst feste Dreiviertel-Ansicht
        if (shot.turn) {
          if (this._dragT > 0) { this._dragT -= dt; if (this._dragT <= 0) this.dragging = false; }
          else { this.yawVel *= Math.exp(-dt * 3); this.yaw += (RM ? 0 : 0.16) * dt + this.yawVel; }
        } else if (shot.ship !== 'launch' || L < 0) {
          const target = shot.ship === 'near' ? -2.2 : -2.5;
          this.yaw += (target - this.yaw) * k;
        }
        if (shot.ship !== 'launch' || L < 0) m.root.rotation.set(shot.turn ? 0.42 : 0.3, this.yaw, 0);
        if (m.bank) m.bank.rotation.z = Math.sin(t * 0.6) * 0.03;
        for (let i = 0; i < m.engines.length; i++) {
          const en = m.engines[i], sz = en.size;
          en.trail.scale.set(4.6 * sz, 4.6 * sz, 5 * sz);
          en.glow.scale.setScalar((4.4 + Math.sin(t * 27 + i * 1.7) * 0.3) * sz * (1 + boost * (2.6 + Math.random() * 0.5)));
        }
      }
    }

    // Station
    const wantSt = shot.station && this.faction !== 'neutral';
    if (wantSt) this._ensureStation(this.faction);
    if (this.station) {
      const m = this.station;
      m.root.visible = !!wantSt;
      if (wantSt) {
        const X = V.X + V.tw / (TAN * this.camera.aspect) * 0.04, Y = V.Y + V.th / TAN * 0.1;
        const d = m.radius / (Math.min(V.tw, V.th) * 0.78);
        this._dir(X, Y, _d);
        _w.copy(_d).multiplyScalar(d);
        if (snap || !m.root.userData.placed) { this.stPos.copy(_w); m.root.userData.placed = true; } else this.stPos.lerp(_w, k);
        m.root.position.copy(this.stPos);
        m.root.rotation.set(0.36, t * 0.016 + 0.62, 0.06);
        if (m.st.spinRate) m.spin.rotation.y = t * 0.05;
        m.st.update(t);
        if (this.q >= 3) this._fitShadow(this.stPos, m.radius);
      }
    }

    // Geschwindigkeitslinien folgen der Kamera
    if (L >= 0) {
      this.speedRig.position.copy(cp);
      this.speedRig.quaternion.copy(this.camQuat);
      this.speed.update(this.speedK || 0, this.speedV || 0, dt);
    } else if (this.speed.obj.visible) this.speed.update(0, 0, dt);
    if (this.look) this.look.uniforms.uTime.value = t;
    if (this.composer) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
  }
}

export const stage = new Stage();
if (import.meta.env && import.meta.env.DEV) window.__lsStage = stage; // nur Entwicklungsserver: Messungen
