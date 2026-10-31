// Drohnen am eigenen Schiff: echte Pioneer-Modelle (public/models/drones, ein Modell je Stufe 1–10 und Modul), weich
// in Formation (world.formation), Laser-Drohnen drehen beim Feuern zum Ziel, Schüsse kommen aus ihrer Modulbucht.
//
// Leistung: nur das eigene Fraktions-Set, nur Stufen/Module, die geflogen werden (nächste Stufe im Leerlauf vorgeladen);
// alle Varianten einer Fraktion teilen die drei Materialien (gleicher Atlas) → ein Shader-Satz, einmal hochgeladene
// Texturen; je Variante ein InstancedMesh pro Material (3 Aufrufe für alle Drohnen dieser Variante). Keine Speicher-
// Neuanlage pro Bild (feste Felder, wiederverwendete Matrizen). Vor dem Flug geladen und parallel übersetzt
// (DroneFleet.ready, Renderer wartet wie beim eigenen Schiff), danach nie sichtbares Umschalten.
import * as THREE from 'three';
import { FACTIONS } from '../core/data.js';
import { preloadGLB } from './models.js';

const MAX = 8;
const TAU = Math.PI * 2;
const pad2 = (n) => String(n).padStart(2, '0');
export function droneUrl(faction, level, module) {
  return `/models/drones/pioneer-${FACTIONS[faction] ? faction : 'europa'}-l${pad2(level)}-${module === 'shield' ? 'shield' : 'laser'}.glb`;
}
/** Drohnenmodelle eines Spielstands schon vor dem Flug laden (Startsequenz / Leerlauf). Promise, nie Fehler. */
export function preloadDrones(faction, drones) {
  if (!Array.isArray(drones) || !drones.length) return Promise.resolve(true);
  const urls = new Set();
  for (const d of drones) if (d && !d.broken) urls.add(droneUrl(faction, d.level || 1, d.module));
  return Promise.all([...urls].map((u) => preloadGLB(u).catch(() => null))).then(() => true, () => false);
}

// ───────── Formationen (Optik; Spieltreue Bewegung, kein festes Mesh) ─────────
// Ziel-Versatz je Drohne im Schiffsraum in Vielfachen des Schiffsradius R: x rechts, y oben, z hinten (Bug = −z).
// Jede Form soll auch von weitem eindeutig sein (Vault Nr. 19): Wall = Wand vor dem Bug, Spear = Pfeilspitze voraus,
// Ring kreist wirklich um das Schiff, Gyro zwei gekippte Ringe, Dome Kuppel, Helix Spirale, Halo/Crown über dem Schiff.
function formOffset(form, i, n, t, out) {
  const side = i % 2 ? 1 : -1, k = i >> 1;
  let x = 0, y = 0.3, z = 0;
  switch (form) {
    case 'wall': {          // zweireihige Wand quer vor dem Bug
      const cols = Math.ceil(n / 2), col = i >> 1, row = i % 2;
      x = (col - (cols - 1) / 2) * 0.62; y = 0.05 + row * 0.62; z = -1.75;
      if (n % 2 && i === n - 1) x = 0;
      break;
    }
    case 'spear': {         // Pfeilspitze weit voraus
      const kk = (i + 1) >> 1;
      x = i === 0 ? 0 : side * kk * 0.45; z = -4.3 + kk * 0.72; y = 0.25 + kk * 0.04;
      break;
    }
    case 'ring': case 'pulse': {  // kreist um das Schiff (Pulse: Ring atmet)
      const a = TAU * i / n + t * (form === 'ring' ? 0.9 : 0.5);
      const r = form === 'ring' ? 2.3 : 1.7 + 0.6 * Math.sin(t * 2.6);
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = 0.22;
      break;
    }
    case 'gyro': {          // zwei gegenläufige, gekippte Ringe
      const ring = i % 2, m = Math.ceil((n - ring) / 2) || 1, j = i >> 1;
      const a = TAU * j / m + t * 1.25 * (ring ? -1 : 1), r = 1.7, tilt = ring ? 0.75 : -0.75;
      const cx = Math.cos(a) * r;
      x = cx * Math.cos(tilt); y = 0.3 + cx * Math.sin(tilt); z = Math.sin(a) * r;
      break;
    }
    case 'dome': {          // Kuppel über dem Schiff (Punkte auf einer Halbkugel), dreht langsam
      const f = (i + 0.5) / n, el = Math.acos(1 - f) , a = i * 2.39996 + t * 0.4;
      const r = 1.6;
      x = Math.sin(el) * Math.cos(a) * r; z = Math.sin(el) * Math.sin(a) * r; y = 0.2 + Math.cos(el) * r;
      break;
    }
    case 'helix': {         // Spirale hinter dem Schiff
      const a = i * 1.7 + t * 2.4;
      x = Math.cos(a) * 0.85; y = 0.45 + Math.sin(a) * 0.85; z = 0.9 + i * 0.36;
      break;
    }
    case 'comet': {         // enger Schweif hinter dem Schiff
      const a = i * 2.4 + t * 1.5;
      x = Math.sin(a) * 0.1 * i; y = 0.45 + Math.cos(a) * 0.08 * i; z = 1.0 + i * 0.34;
      break;
    }
    case 'claw': {          // zwei Zangen nach vorn
      x = side * (1.75 - k * 0.24); z = -0.35 - k * 0.62; y = 0.25 + k * 0.05;
      break;
    }
    case 'swarm': {         // wilde Wolke
      x = Math.sin(t * 1.3 + i * 1.7) * 1.5; y = 0.45 + Math.sin(t * 1.9 + i * 2.3) * 0.55; z = Math.cos(t * 1.1 + i * 2.9) * 1.5;
      break;
    }
    case 'star': {          // flacher Stern, Spitzen abwechselnd weit und nah
      const a = TAU * i / n + t * 0.3, r = i % 2 ? 1.2 : 2.35;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = 0.22;
      break;
    }
    case 'wing': {          // breite, nach hinten gepfeilte Flügel
      x = side * (1.15 + k * 0.72); z = -0.1 + k * 0.3; y = 0.18 - k * 0.03;
      break;
    }
    case 'vortex': {        // Trichter, der sich nach oben öffnet
      const a = TAU * i / n + t * 2.4;
      const r = 0.7 + i * 0.2;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = 0.15 + i * 0.2;
      break;
    }
    case 'halo': {          // flacher Ring über dem Schiff
      const a = TAU * i / n + t * 0.6;
      x = Math.cos(a) * 1.1; z = Math.sin(a) * 1.1; y = 1.35;
      break;
    }
    case 'crown': {         // Krone: Ring über dem Schiff mit Zacken
      const a = TAU * i / n + t * 0.5;
      x = Math.cos(a) * 1.0; z = Math.sin(a) * 1.0; y = 1.0 + (i % 2) * 0.5;
      break;
    }
    default: {              // standard: zwei Kolonnen links und rechts neben dem Schiff
      x = side * (1.5 + k * 0.08); z = -1.15 + k * 0.48; y = 0.3 + k * 0.05;
      if (n % 2 && i === n - 1) { x = 0; z = -1.9; y = 0.55; } // ungerade Zahl: letzte mittig vor dem Bug
      break;
    }
  }
  out.set(x, y, z);
  return out;
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _o = new THREE.Vector3();

export class DroneFleet {
  constructor(scene, host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = 'drones';
    scene.add(this.group);
    this.faction = null;
    this.variants = new Map();      // 'level-module' → { parts: [{ mesh, base }], muzzle, len, pending }
    this.mats = null;               // geteilte Materialien der Fraktion (nach Name)
    this.ver = -1;
    this.form = 'standard';
    this.slots = [];                // feste Liste je Drohnenplatz
    for (let i = 0; i < MAX; i++) {
      this.slots.push({ on: false, id: null, key: '', module: 'laser', x: 0, y: 0, z: 0, ox: 0, oy: 0, oz: 0, yaw: 0, bank: 0, snap: true, mx: 0, my: 0, mz: 0, flash: 0, phase: i * 1.37 });
    }
    this.count = 0;
    this.ready = Promise.resolve();
    this._compiled = false;
    this._disposed = false;
    this.scale = 12;                // Meter Modell → Spielmaß (Pioneer Stufe 1 ≈ 17 m, Schiffsradius ≈ 24–30)
  }

  /** Fraktion und Drohnen des Spielstands: Modelle laden, vorbereiten. Gibt ein Promise (bereit) zurück. */
  setup(faction, drones) {
    this.faction = faction;
    const keys = new Set();
    if (Array.isArray(drones)) for (const d of drones) if (!d.broken) keys.add(`${d.level}-${d.module}`);
    const loads = [...keys].map((k) => this._variant(k));
    this.ready = Promise.all(loads).then(() => this._compile()).catch((err) => console.warn('Drohnen', err));
    // nächste Stufe im Leerlauf vorladen (nur Datei; Aufbau erst beim Aufstieg)
    const idle = (typeof window !== 'undefined' && window.requestIdleCallback) || ((fn) => setTimeout(fn, 3000));
    if (Array.isArray(drones)) idle(() => {
      let i = 0;
      for (const d of drones) if (d.level < 10) setTimeout(() => { if (!this._disposed) preloadGLB(droneUrl(faction, d.level + 1, d.module)).catch(() => {}); }, 1500 * i++);
    }, { timeout: 8000 });
    return this.ready;
  }

  _variant(key) {
    let v = this.variants.get(key);
    if (v) return v.pending;
    const [lv, module] = key.split('-');
    v = { parts: [], muzzle: new THREE.Vector3(0, 0, -0.6), len: 1.4, built: false, pending: null };
    this.variants.set(key, v);
    v.pending = preloadGLB(droneUrl(this.faction, +lv, module)).then((gltf) => { if (!this._disposed) this._build(v, gltf); }, (err) => { console.warn('Drohnenmodell fehlt', key, err); });
    return v.pending;
  }

  _build(v, gltf) {
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const flip = new THREE.Matrix4().makeRotationY(Math.PI); // glTF-Bug +z → Spiel-Bug −z
    const S = new THREE.Matrix4().makeScale(this.scale, this.scale, this.scale);
    const pre = new THREE.Matrix4().multiplyMatrices(flip, S);
    if (!this.mats) {
      // erste Variante liefert die drei Materialien der Fraktion; alle weiteren nutzen dieselben (gleicher Atlas)
      this.mats = {};
      root.traverse((o) => { if (o.isMesh && o.material && !this.mats[o.material.name]) this.mats[o.material.name] = o.material; });
    }
    let len = 0;
    root.traverse((o) => {
      if (o.isMesh) {
        const mat = this.mats[o.material.name] || o.material;
        const mesh = new THREE.InstancedMesh(o.geometry, mat, MAX);
        mesh.count = 0;
        mesh.frustumCulled = false;   // Instanzen bewegen sich um das Schiff (Grenzkugel der Vorlage passt nicht)
        mesh.castShadow = false; mesh.receiveShadow = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.matrixAutoUpdate = false;
        mesh.name = 'drone:' + o.material.name;
        this.group.add(mesh);
        v.parts.push({ mesh, base: new THREE.Matrix4().multiplyMatrices(pre, o.matrixWorld) });
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        len = Math.max(len, bb.max.z - bb.min.z);
      }
    });
    const hp = root.getObjectByName('HP_DroneModule');
    if (hp) v.muzzle.copy(hp.getWorldPosition(new THREE.Vector3())).applyMatrix4(pre);
    v.len = (len || 1.4) * this.scale;
    v.built = true;
  }

  // Shader parallel übersetzen und Texturen hochladen, bevor die Drohnen das erste Mal sichtbar werden
  async _compile() {
    if (this._disposed || this._compiled || !this.mats) return;
    const H = this.host, gl = H.gl;
    for (const k in this.mats) {
      const m = this.mats[k];
      for (const p in m) { const t = m[p]; if (t && t.isTexture) { try { gl.initTexture(t); } catch { /* egal */ } } }
    }
    // für das Übersetzen je Variante eine Instanz sichtbar machen (unter dem Schiff, Bild zeigt sie noch nicht)
    this.variants.forEach((v) => { for (const p of v.parts) { p.mesh.count = 1; p.mesh.setMatrixAt(0, p.base); p.mesh.instanceMatrix.needsUpdate = true; } });
    const vis = this.group.visible;
    this.group.visible = true; // compileAsync nimmt nur sichtbare Objekte
    let wait = null;
    try { wait = gl.compileAsync(this.group, H.camera, H.scene); } catch { /* egal */ } finally { this.group.visible = vis; }
    try { await wait; } catch { /* egal */ }
    this.variants.forEach((v) => { for (const p of v.parts) p.mesh.count = 0; });
    this._compiled = true;
  }

  /** Zustand der Simulation übernehmen (selten: Kauf, Stufe, kaputt, Modul) */
  _assign(W) {
    const D = W.drones || [];
    let n = 0;
    for (let i = 0; i < D.length && n < MAX; i++) {
      const d = D[i];
      if (d.broken) continue;
      const s = this.slots[n++];
      const key = `${d.level}-${d.module}`;
      if (s.id !== d.id) s.snap = true;
      s.on = true; s.id = d.id; s.key = key; s.module = d.module;
      if (!this.variants.has(key)) this._variant(key); // neue Stufe: Datei liegt meist schon (Leerlauf-Vorladen)
    }
    for (let i = n; i < MAX; i++) { this.slots[i].on = false; this.slots[i].id = null; }
    this.count = n;
  }

  /** Jedes Bild: pv = Ansicht des eigenen Schiffs (Renderer), W = Welt */
  update(dt, W, pv, t) {
    if (!W || !W.drones) { this.group.visible = false; return; }
    if (W.droneVer !== this.ver) { this.ver = W.droneVer; this._assign(W); }
    const visible = this._compiled && pv && pv.root.visible && W.player && W.player.alive !== false && this.count > 0;
    this.group.visible = !!visible;
    if (!visible) { for (let i = 0; i < MAX; i++) this.slots[i].snap = true; return; }
    const form = W.formation || 'standard';
    const R = Math.max(18, pv.vr || 30);
    const root = pv.root, sx = root.position.x, sy = root.position.y, sz = root.position.z, th = root.rotation.y;
    const c = Math.cos(th), s = Math.sin(th);
    const firing = !!W.droneFiring;
    const tid = W.player.targetId;
    const tv = firing && tid != null ? this.host.views.get(tid) : null;
    const kPos = 1 - Math.exp(-dt * 4), kYaw = 1 - Math.exp(-dt * 7);
    // Zähler je Variante zurücksetzen
    this.variants.forEach((v) => { v.n = 0; });
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const sl = this.slots[i];
      const v = this.variants.get(sl.key);
      formOffset(form, i, n, t, _o);
      // Versatz zum Schiff weich nachführen (nicht die Weltposition: sonst hinge die Formation bei Tempo 340 m/s
      // mehrere Schiffslängen hinterher); in Kurven und beim Formationswechsel gleiten sie nach
      const lx = _o.x * R, ly = _o.y * R, lz = _o.z * R;
      const ox = lx * c + lz * s, oz = -lx * s + lz * c;
      const oy = ly + Math.sin(t * 1.6 + sl.phase) * R * 0.04;
      if (sl.snap) { sl.ox = ox; sl.oy = oy; sl.oz = oz; sl.yaw = th; sl.snap = false; }
      else { sl.ox += (ox - sl.ox) * kPos; sl.oy += (oy - sl.oy) * kPos; sl.oz += (oz - sl.oz) * kPos; }
      sl.x = sx + sl.ox; sl.y = sy + sl.oy; sl.z = sz + sl.oz;
      // Blickrichtung: mit dem Schiff, Laser-Drohnen im Gefecht zum Ziel
      let yaw = th;
      if (tv && sl.module === 'laser') yaw = Math.atan2(-(tv.rx - sl.x), -(tv.rz - sl.z));
      let dy = yaw - sl.yaw; dy = ((dy + Math.PI) % TAU + TAU) % TAU - Math.PI;
      sl.yaw += dy * kYaw;
      sl.bank += ((pv.bank || 0) * 0.7 - dy * 0.6 - sl.bank) * kYaw;
      if (sl.flash > 0) sl.flash = Math.max(0, sl.flash - dt * 9);
      if (!v || !v.built) { sl.mx = sl.x; sl.my = sl.y; sl.mz = sl.z; continue; }
      _e.set(sl.flash * -0.12, sl.yaw, sl.bank);
      _q.setFromEuler(_e);
      _p.set(sl.x, sl.y, sl.z);
      _m.compose(_p, _q, _s);
      // Mündung (Modulbucht) für die Laserschüsse
      _p.copy(v.muzzle).applyMatrix4(_m);
      sl.mx = _p.x; sl.my = _p.y; sl.mz = _p.z;
      const j = v.n++;
      for (let k = 0; k < v.parts.length; k++) {
        const P = v.parts[k];
        _m2.multiplyMatrices(_m, P.base);
        P.mesh.setMatrixAt(j, _m2);
      }
    }
    this.variants.forEach((v) => {
      for (let k = 0; k < v.parts.length; k++) {
        const P = v.parts[k];
        if (P.mesh.count !== v.n) P.mesh.count = v.n;
        if (v.n) P.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }

  /** Mündung der Drohne id ('d3') für einen Schuss → true, wenn gefunden */
  muzzle(id, out) {
    for (let i = 0; i < this.count; i++) {
      const sl = this.slots[i];
      if (sl.id !== id) continue;
      if (!this.group.visible) return false;
      out.set(sl.mx, sl.my, sl.mz);
      sl.flash = 1;
      return true;
    }
    return false;
  }

  /** Bolzenfarbe der Drohnenlaser: Triebwerkslicht der Fraktion */
  boltHex() { return FACTIONS[this.faction]?.glow ?? 0x9fe8ff; }

  dispose() {
    this._disposed = true;
    this.variants.forEach((v) => { for (const p of v.parts) { this.group.remove(p.mesh); p.mesh.dispose(); } });
    this.variants.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
  }
}
