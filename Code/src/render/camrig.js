// Kamera-Führung: zwei Kameras (Taktisch schräg von oben, Verfolger direkt hinter dem Schiff), weicher Wechsel
// (Taste V, Wahl in 'ls.settings'.camera), Federung, Sichtfeld-Kick bei Tempo, Zittern beim Nachbrenner,
// Kamerastöße bei Treffern und Druckwellen naher Explosionen. 'ls.settings'.shake === false schaltet alles
// Wackeln ab (Sichtfeld-Kick bleibt gedämpft), „Bewegung reduzieren“ dämpft auf ein Drittel.
// Keine Speicher-Neuanlage pro Bild: alle Vektoren liegen fest im Objekt.
import * as THREE from 'three';
import { flightSettings, setFlightSetting, isPhone } from '../input/flightsettings.js';

const KEY = 'ls.settings';
// Sicherung der Kamerawahl: der Hub schreibt 'ls.settings' derzeit nur mit seinen eigenen Schlüsseln neu
// (screens-kit loadSettings), dabei ginge 'camera' verloren
const KEY_CAM = 'ls.camera';
const TAU = Math.PI * 2;
export const FOV_TAC = 40, FOV_CHASE = 70;
// 3D-Verfolger (Planung/FLUGMODELL.md 6): Neigung 6° über der Kameraachse, Schiff im unteren Drittel
const CH3_ELEV = 6 * Math.PI / 180, CH3_SHIP_Y = -0.3;
const _f3 = new THREE.Vector3(), _u3 = new THREE.Vector3(), _r3 = new THREE.Vector3(), _a3 = new THREE.Vector3(), _w3 = new THREE.Vector3();
const _m3 = new THREE.Matrix4(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _e3 = new THREE.Euler(0, 0, 0, 'YXZ');
const WUP = new THREE.Vector3(0, 1, 0);
// Verfolger: Höhe über dem Schiff (Grad), Abstand in Schiffsradien, Blickpunkt vor dem Schiff
const CH_ELEV = 15 * Math.PI / 180, CH_ELEV_FIGHT = 21 * Math.PI / 180;
const CH_DIST = 4.1;
const CH_R0 = 24.7, CH_EXP = 0.5, CH_ELEV_BIG = 9 * Math.PI / 180, CH_YAW_BIG = 6 * Math.PI / 180;
// Verfolger-Rahmung je Klasse (Meshy-Rümpfe): Abstand d (m, Zoom 1, ohne Tempo/Kampf-Zuschlag), zusätzliche Neigung el
// (Grad), Bildlage y (NDC-Versatz, + = tiefer; yc im Kampf), k = Abstandsfaktor im Kampf.
// Runde 4: gestaffelt nach Bildfläche UND Bildhöhe (tools/bilder/groessen.mjs bricht ab, wenn eine Stufe nicht um
// mindestens 8 % wächst, je Fraktion in Flug und Kampf). Schiff 8 (189 × 49 m) in ruhiger Fahrt flach (−14°) und mit
// 12° Gier (yaw): Länge sichtbar, größte Bildfläche, Heck über dem HUD-Band; im Kampf bleibt die doppelte Gier (yk),
// die Kampfneigung zur Hälfte (ek) und die Zielhöhe im Bild darf bis 0,82 (tc) steigen – so liegen Zielmarke und
// Zielbogen frei vor dem Rumpf und das Heck bleibt über dem HUD-Band. Im Kampf sind alle Klassen etwas kleiner im Bild
// (mehr Überblick), die Stufen liegen ≈ 15 % auseinander, weil der Zielschwenk die Bildhöhe je Lage um ±4 % streut.
// Klassen ohne Eintrag: Radius-Formel.
export const CHASE_FRAME = {
  s1: { d: 108.5, el: 0, y: 0, k: 1.26 },
  s2: { d: 88.5, el: 0, y: 0, k: 1.21 },
  s3: { d: 101.8, el: 0, y: 0, k: 1.11 },
  s4: { d: 98, el: 0, y: -0.03, k: 1.11 },
  s5: { d: 128.6, el: 0, y: -0.05, k: 1.1 },
  s6: { d: 131.7, el: 0, y: -0.05, yc: -0.32, tc: 0.8, k: 0.92 },
  s7: { d: 125.7, el: 0, y: -0.04, yc: -0.13, tc: 0.78, k: 0.97 },
  s8: { d: 156, el: -14, y: -0.45, yc: -0.6, tc: 0.9, yaw: 12, yk: 2.4, ek: 0.8, k: 0.91 },
};
const BLEND_T = 0.9; // Sekunden für den Wechsel

function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
const smooth = (k) => k * k * (3 - 2 * k);

/**
 * Einmalige Umstellung (3D-Flug ist der Hauptmodus): eine gespeicherte Wahl „taktisch“ wird einmal auf den
 * Verfolger gestellt, Taktik bleibt per V wählbar. Touch-Telefone starten weiter taktisch (FLUGMODELL.md 5.4).
 */
function migrateCam() {
  const f = flightSettings();
  if (f.migrated) return;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    const phone = isPhone();
    const c = s.camera || localStorage.getItem(KEY_CAM);
    if (phone && !c) { s.camera = 'tactical'; localStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem(KEY_CAM, 'tactical'); }
    else if (!phone && c === 'tactical') { s.camera = 'chase'; s.cockpit = false; localStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem(KEY_CAM, 'chase'); }
    // altes Standard-Sichtfeld 58° des Verfolgers → 70° (3D-Flug)
    if (s.gfx && s.gfx.fovChase === 58) { s.gfx.fovChase = 70; localStorage.setItem(KEY, JSON.stringify(s)); }
  } catch { /* privater Modus */ }
  setFlightSetting('migrated', true);
}

export function readCamSettings() {
  // Standard ist die Verfolger-Kamera mit 3D-Flug (Hauptmodus); Taktisch nur, wenn so gewählt
  migrateCam();
  const o = { mode: 'chase', shake: true, reduced: false, cockpit: false, cockpitFov: 74 };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    const c = s.camera || localStorage.getItem(KEY_CAM);
    o.mode = c === 'tactical' ? 'tactical' : 'chase';
    o.cockpit = o.mode === 'chase' && s.cockpit === true;
    if (s.cockpitFov >= 60 && s.cockpitFov <= 95) o.cockpitFov = +s.cockpitFov;
    o.shake = s.shake !== false;
    o.reduced = s.reducedMotion === true;
  } catch { /* privater Modus */ }
  try { if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) o.reduced = true; } catch { /* alt */ }
  return o;
}
export function saveCamMode(mode, cockpit = false) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    s.camera = mode;
    s.cockpit = !!cockpit;
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(KEY_CAM, mode);
    try { window.dispatchEvent(new CustomEvent('ls:settings', { detail: { ...s } })); } catch { /* alt */ }
  } catch { /* privater Modus */ }
}

export class CameraRig {
  constructor() {
    const s = readCamSettings();
    this.mode = s.mode;
    this.k = s.mode === 'chase' ? 1 : 0;   // 0 = taktisch, 1 = Verfolger (Übergang dazwischen)
    this.kRaw = this.k;
    this.cockpit = s.cockpit;              // Cockpit = Verfolger-Steuerung aus dem Pilotenplatz
    this.kc = this.kcRaw = s.cockpit ? 1 : 0;
    this.cockpitFov = s.cockpitFov;
    this.lookYaw = 0; this.lookPitch = 0; this.looking = false; // Umsehen: Cockpit (mittlere Maustaste, rechter Stick), Verfolger (rechter Stick)
    this._apply(s);
    this.trauma = 0;                       // 0..1, Quadrat bestimmt die Stärke
    this.kick = new THREE.Vector3();       // Stoß-Feder (Welt-Versatz in m)
    this.kickV = new THREE.Vector3();
    this.rollK = 0; this.rollKV = 0;       // Stoß-Neigung (rad)
    this.yaw = 0; this._yawInit = false;
    this.frame = CHASE_FRAME;              // Rahmung je Klasse (Prüfwerkzeuge dürfen sie in der Entwicklung verstellen)
    this.side = 0; this._head = null;      // seitlicher Versatz langer Rümpfe (0..1), blendet bei Lenken/Kampf aus
    this.pos = new THREE.Vector3();        // Verfolger: gefederte Kameraposition relativ zum Schiff
    this.posV = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.lookV = new THREE.Vector3();
    this.zoom = 1;
    this.fovKick = 0;
    this.accel = 0; this._spd = -1;
    this.ab = 0;
    this.combat = 0;
    this.roll = 0;
    // verzögerte Druckwellen (Explosionen): t, dx, dz, Stärke
    this.waves = new Float32Array(32);
    this._outPos = new THREE.Vector3(); this._outLook = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.reset = true;
    // 3D-Verfolger: gefederte Kameralage (Quaternion) und Abstands-Feder im Kamerarahmen
    this.q3 = new THREE.Quaternion(); this.off3 = new THREE.Vector3(); this.off3V = new THREE.Vector3();
    this._out3Pos = new THREE.Vector3(); this._out3Q = new THREE.Quaternion();
    this.reset3 = true; this.precise = 0;
  }

  _apply(s) {
    this.shakeOn = s.shake;
    this.motion = s.reduced ? 0.35 : 1;
  }
  /** Einstellungen neu lesen (Renderer prüft das je Sekunde) */
  refresh() {
    const s = readCamSettings();
    this._apply(s);
    if (s.mode !== this.mode) this.mode = s.mode;
    this.cockpit = s.cockpit;
    this.cockpitFov = s.cockpitFov;
  }
  /** Cockpit-Sichtfeld 60–95°, gespeichert in 'ls.settings'.cockpitFov */
  setCockpitFov(v) {
    this.cockpitFov = Math.max(60, Math.min(95, Math.round(v)));
    try { const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; s.cockpitFov = this.cockpitFov; localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* privater Modus */ }
    return this.cockpitFov;
  }
  /** Umsehen: Mausweg in Pixeln; beim Loslassen federt der Blick nach vorn zurück */
  lookBy(dx, dy) {
    this.lookYaw = Math.max(-1.9, Math.min(1.9, this.lookYaw - dx * 0.0045));
    this.lookPitch = Math.max(-0.6, Math.min(0.7, this.lookPitch - dy * 0.0045));
  }
  /** Taste V: Verfolger → Cockpit → Taktisch → Verfolger, Wahl speichern. Gibt die neue Ansicht zurück. */
  toggle() {
    if (this.mode === 'chase' && !this.cockpit) this.cockpit = true;
    else if (this.cockpit) { this.cockpit = false; this.mode = 'tactical'; }
    else this.mode = 'chase';
    saveCamMode(this.mode, this.cockpit);
    return this.view;
  }
  get view() { return this.cockpit ? 'cockpit' : this.mode; }
  get chase() { return this.mode === 'chase'; }
  /** Verfolger-Abstand (Mausrad) */
  zoomBy(delta) { this.zoom = Math.max(0.65, Math.min(2.4, this.zoom * Math.exp(delta * 0.0011))); }

  // ---------- Stöße ----------
  /** Wackeln (Stärke in „Metern“ wie bisher renderer.shake): wird zu Trauma 0..1 */
  shake(a) { if (this.shakeOn) this.trauma = Math.min(1, this.trauma + a / 34); }
  /** Eigener Schuss: winziger Sichtfeld-Puls (federt in ~0,15 s zurück) – Waffen fühlen sich kräftig an */
  fire(amt = 1) { if (this.shakeOn) this.firePunch = Math.min(1, (this.firePunch || 0) + 0.35 * amt * this.motion); }
  /** Stoß in Welt-Richtung (dx, dz), amt 0..1 (z. B. Treffer am eigenen Schiff) */
  hit(dx, dz, amt) {
    if (!this.shakeOn) return;
    const L = Math.hypot(dx, dz) || 1, a = Math.min(1.2, amt) * this.motion;
    this.kickV.x += dx / L * 42 * a; this.kickV.z += dz / L * 42 * a; this.kickV.y += 10 * a;
    this.rollKV += (dx / L) * 0.9 * a;
    this.trauma = Math.min(1, this.trauma + 0.16 * a);
  }
  /** Druckwelle einer Explosion: trifft nach Laufzeit (≈ 2400 m/s) ein und stößt weg vom Zentrum */
  wave(dx, dz, dist, size) {
    if (!this.shakeOn || dist > 1500) return;
    const amt = Math.min(1.3, size * 0.32 * (1 - dist / 1500) ** 1.5);
    if (amt < 0.04) return;
    const W = this.waves;
    for (let i = 0; i < W.length; i += 4) {
      if (W[i] > 0) continue;
      W[i] = 0.05 + dist / 2400; W[i + 1] = dx; W[i + 2] = dz; W[i + 3] = amt;
      return;
    }
  }

  // ---------- je Bild ----------
  // Verfolger-Pose aus der Schiffsansicht pv (rx, rz, rrot, vr), Spieler-Entity e, Kampfziel cv (oder null).
  // Ergebnis in this._outPos / this._outLook (Weltkoordinaten).
  // shipY = gewünschte Bildhöhe des Schiffs (NDC, −1 unten … +1 oben), tanH = tan(halbes Sichtfeld)
  chasePose(dt, pv, e, cv, ck, maxSpeed, shipY = -0.05, tanH = 0.55) {
    const spd = typeof e.speed === 'number' ? e.speed : Math.hypot(e.vx || 0, e.vz || 0);
    if (this._spd < 0) this._spd = spd;
    const acc = (spd - this._spd) / Math.max(1e-3, dt);
    this._spd = spd;
    this.accel += (acc - this.accel) * (1 - Math.exp(-dt * 4));
    const n = Math.min(1.25, spd / (maxSpeed || 320));
    const heading = pv.rrot;
    // Kampf: Kamera schwenkt zwischen Flugrichtung und Ziel (Schiff vorn, Ziel dahinter im Bild)
    let yawWant = heading;
    if (cv && ck > 0.001) {
      const bearing = Math.atan2(-(cv.rx - pv.rx), -(cv.rz - pv.rz));
      yawWant = heading + wrap(bearing - heading) * 0.8 * ck;
    }
    if (!this._yawInit || this.reset) { this.yaw = yawWant; this._yawInit = true; }
    // weiches Nachdrehen: bei schneller Kurve hängt die Kamera sichtbar hinterher (Gewicht)
    this.yaw += wrap(yawWant - this.yaw) * (1 - Math.exp(-dt * (2.6 + 1.2 * ck)));
    // Umsehen (Controller, rechter Stick): Kamera kreist um das Schiff, federt beim Loslassen zurück (step)
    const lk = 1 - this.kc, yv = this.yaw + this.lookYaw * lk;
    const fx = -Math.sin(yv), fz = -Math.cos(yv);
    const r = Math.max(14, pv.vr);
    // Abstand: Grundabstand × Zoom, beim Beschleunigen etwas zurück, bei Tempo etwas weiter, im Kampf weiter
    const accK = Math.max(-0.6, Math.min(1, this.accel / ((maxSpeed || 320) * 0.45)));
    // Größenstaffelung sichtbar: Abstand wächst nur mit Radius^0,5 (bezogen auf den Starter, 24,7 m), sonst wäre jedes
    // Schiff gleich groß im Bild. Starter ≈ 18 %, Schiff 8 ≈ 33 % der Bildbreite. Nie näher als 1,45 Radien (Rumpf).
    const fr = this.frame[e.ship];
    const grow = this.zoom * (1 + 0.08 * n + 0.1 * accK * this.motion + 0.16 * ck);
    let D, elev;
    const big = Math.min(1, Math.max(0, (r - 45) / 35));
    if (fr) {
      // Rahmung je Klasse (Bildfläche gestaffelt), nie näher als 1,2 Radien
      D = Math.max(r * 1.2, fr.d * grow * (1 + ((fr.k ?? 1) - 1) * ck));
      // ek: Anteil der steileren Kampfkamera (Schiff 8: flach bleiben, sonst schrumpft die Fläche des schlanken Rumpfs)
      elev = CH_ELEV + (CH_ELEV_FIGHT - CH_ELEV) * ck * (fr.ek ?? 1) + fr.el * Math.PI / 180;
    } else {
      const rEff = CH_R0 * Math.pow(r / CH_R0, CH_EXP);
      D = Math.max(r * 1.45, rEff * CH_DIST * grow);
      // lange Rümpfe (Platzhalter): Kamera steiler, damit Länge und Silhouette von hinten lesbar sind
      elev = CH_ELEV + (CH_ELEV_FIGHT - CH_ELEV) * ck + big * CH_ELEV_BIG;
    }
    elev = Math.max(0.03, Math.min(1.15, elev - this.lookPitch * 0.8 * lk)); // Umsehen (rechter Stick)
    this.frameY = fr ? fr.y + ((fr.yc ?? fr.y) - fr.y) * ck : 0; // yc: Bildlage im Kampf
    // lange Rümpfe: leichte Dreiviertelsicht (höchstens 6°), nur im ruhigen Geradeausflug; beim Lenken (Kurswechsel
    // > 0,15 rad/s) und im Kampf blendet der Versatz auf 0 aus, damit Schild- und Kursbogen am Rumpf bleiben
    const turn = this._head === null ? 0 : Math.abs(wrap(heading - this._head)) / Math.max(1e-3, dt);
    this._head = heading;
    // Rahmung mit eigener Gier (fr.yaw, Grad): ruhige Verfolgersicht in Dreiviertelsicht (Schiff 8 zeigt seine Länge),
    // im Kampf bleibt der Anteil fr.yk davon stehen (Bildfläche), beim Lenken blendet sie aus
    const own = fr && fr.yaw !== undefined;
    const sideWant = (own ? 1 - ck * (1 - (fr.yk ?? 0)) : big * (1 - ck)) * (turn > 0.15 ? 0 : 1);
    this.side += (sideWant - this.side) * (1 - Math.exp(-dt * (sideWant < this.side ? 4 : 0.8)));
    if (this.reset) this.side = sideWant;
    const yc = yv + this.side * (own ? fr.yaw * Math.PI / 180 : CH_YAW_BIG), fxc = -Math.sin(yc), fzc = -Math.cos(yc);
    const ox = -fxc * D * Math.cos(elev), oz = -fzc * D * Math.cos(elev), oy = D * Math.sin(elev) + r * 0.3;
    // Federung: Kamera-Versatz folgt kritisch gedämpft (keine Schwingung, nur Nachziehen)
    if (this.reset) { this.pos.set(ox, oy, oz); this.posV.set(0, 0, 0); this._pitch = null; }
    else spring(this.pos, this.posV, ox, oy, oz, 7.5, dt);
    const cx = pv.rx + this.pos.x, cy = this.pos.y, cz = pv.rz + this.pos.z;
    // Blick: waagrecht zum Schiff (Schiff mittig), Neigung so, dass das Schiff auf Bildhöhe shipY sitzt
    // (oberhalb der unteren HUD-Fenster); im Kampf ein Stück zum Ziel hin geschwenkt
    let hx = pv.rx - cx, hz = pv.rz - cz;
    const hd = Math.hypot(hx, hz) || 1;
    hx /= hd; hz /= hd;
    if (cv && ck > 0.001) {
      const tx = cv.rx - cx, tz = cv.rz - cz, td = Math.hypot(tx, tz) || 1;
      // Ziel und Schiff gemeinsam: Blickrichtung zwischen beiden, Schiff wandert zur Bildseite
      const k = 0.35 * ck;
      hx = hx * (1 - k) + tx / td * k; hz = hz * (1 - k) + tz / td * k;
      const L = Math.hypot(hx, hz) || 1; hx /= L; hz /= L;
    }
    const aS = Math.atan2(2 - cy, hd);
    let pitch = aS - Math.atan((shipY - this.frameY) * tanH);
    if (cv && ck > 0.001) {
      // Ziel nicht über den oberen Bildrand schieben
      const td = Math.hypot(cv.rx - cx, cv.rz - cz) || 1, aT = Math.atan2(2 - cy, td);
      // (tc: Grenze der Zielhöhe im Bild je Rahmung, Schiff 8 höher, damit das Heck über dem HUD-Band bleibt)
      const tc = (this.frame[e.ship] && this.frame[e.ship].tc) || 0.72;
      pitch = Math.max(pitch, aT - Math.atan(tc * tanH) * ck - (1 - ck) * 2);
    }
    if (this._pitch === null || this._pitch === undefined) this._pitch = pitch;
    this._pitch += (pitch - this._pitch) * (1 - Math.exp(-dt * 8));
    if (this.reset) this.reset = false;
    const cp = Math.cos(this._pitch), sp = Math.sin(this._pitch);
    this._outPos.set(cx, cy, cz);
    this._outLook.set(cx + hx * cp * 100, cy + sp * 100, cz + hz * cp * 100);
    return n;
  }

  /**
   * 3D-Verfolger (FLUGMODELL.md 6): Kameralage folgt der Schiffslage gefedert, Blick 35 % zur Zielrichtung (Option
   * „Kamera folgt der Zielrichtung“: 100 %), Rollen zu 70 %, Neigung 6°, Schiff im unteren Drittel, Rückzug bei Schub
   * und Boost, Vorrücken beim Bremsen, Seitenversatz gegen Seitenschub. pos: Schiffsort (Zeichenkoordinaten),
   * qs: Schiffslage, aim: Zielrichtung (Welt), st: Flugzustand (thr, boostOn), tanH: tan(halbes Sichtfeld).
   * Ergebnis in this._out3Pos / this._out3Q.
   */
  chasePose3d(dt, pos, qs, e, aim, st, maxSpeed, tanH, radius) {
    const set = flightSettings();
    const mix = set.cam === 'aim' ? 1 : 0.35;
    const rollK = (this.motion < 1 ? 0.3 : set.camRoll);
    _f3.set(0, 0, -1).applyQuaternion(qs);
    if (aim) { _a3.set(aim[0], aim[1], aim[2]); _f3.lerp(_a3, mix).normalize(); }
    _u3.set(0, 1, 0).applyQuaternion(qs);
    _u3.multiplyScalar(rollK).addScaledVector(WUP, 1 - rollK);
    if (_u3.lengthSq() < 1e-6 || Math.abs(_u3.clone().normalize().dot(_f3)) > 0.995) _u3.set(0, 1, 0).applyQuaternion(qs);
    _r3.crossVectors(_f3, _u3).normalize();
    _u3.crossVectors(_r3, _f3).normalize();
    _m3.makeBasis(_r3, _u3, _w3.copy(_f3).negate());
    _q3.setFromRotationMatrix(_m3);
    // gefedert nachdrehen: S1 ≈ 10/s, S8 ≈ 5/s (Masse sichtbar)
    const r = Math.max(14, radius || 20), rate = Math.max(5, Math.min(10, 10 - (r - 25) * 0.08));
    if (this.reset3 || this.reset) { this.q3.copy(_q3); this.off3V.set(0, 0, 0); }
    else this.q3.slerp(_q3, 1 - Math.exp(-dt * rate));
    // Umsehen: Kamera kreist um das Schiff
    const lk = 1 - this.kc;
    if (this.lookYaw || this.lookPitch) { _e3.set(this.lookPitch * 0.8 * lk, this.lookYaw * lk, 0, 'YXZ'); _q4.setFromEuler(_e3); this.q3.multiply(_q4); }
    // Abstand: Rahmung je Klasse, Zoom, Rückzug bei Schub (+8 %) und Boost (+10 %), Vorrücken beim Bremsen (−5 %)
    const fr = this.frame[e.ship];
    const spd = typeof e.speed === 'number' ? e.speed : 0;
    const n = Math.min(1.25, spd / (maxSpeed || 320));
    const thr = st ? st.thr : null;
    const push = thr ? thr[4] : 0, brake = thr ? thr[5] : 0, side = thr ? thr[0] - thr[1] : 0, vert = thr ? thr[2] - thr[3] : 0;
    const boost = st && st.boostOn ? 1 : 0;
    const base = fr ? fr.d : Math.max(r * 1.45, CH_R0 * Math.pow(r / CH_R0, CH_EXP) * CH_DIST);
    const D = Math.max(r * 1.25, base * this.zoom * (1 + 0.04 * n + (0.08 * push + 0.1 * boost - 0.05 * brake) * this.motion));
    // Zielversatz im Kamerarahmen (gefedert): hinter dem Schiff, 6° darüber, gegen Seiten- und Vertikalschub versetzt
    const ox = -side * 0.04 * D * this.motion, oy = D * Math.sin(CH3_ELEV) + r * 0.12 - vert * 0.03 * D * this.motion, oz = D * Math.cos(CH3_ELEV);
    if (this.reset3 || this.reset) this.off3.set(ox, oy, oz);
    else spring(this.off3, this.off3V, ox, oy, oz, 9 - (r > 60 ? 3 : 0), dt);
    _w3.copy(this.off3).applyQuaternion(this.q3);
    this._out3Pos.copy(pos).add(_w3);
    // Schiff ins untere Drittel: Blick leicht über das Schiff (Neigung um den Unterschied zur Sollhöhe)
    const want = Math.atan(-CH3_SHIP_Y * tanH) - Math.atan2(oy, oz);
    _e3.set(want * 0.9, 0, 0, 'YXZ'); _q4.setFromEuler(_e3);
    this._out3Q.copy(this.q3).multiply(_q4);
    this.reset3 = false;
    this.frameY = 0;
    return n;
  }

  /** 3D-Cockpit: Kamera am Pilotenauge mit voller Schiffslage, Umsehen, Kopfträgheit gegen die Beschleunigung */
  cockpitPose3d(eye, qs, st, out, outQ) {
    _e3.set(this.lookPitch, this.lookYaw, 0, 'YXZ'); _q4.setFromEuler(_e3);
    outQ.copy(qs).multiply(_q4);
    out.copy(eye);
    if (st && this.shakeOn) {
      // Kopf wird bis 6 cm gegen die Beschleunigung gedrückt (Körperrahmen → Welt)
      const a = st.accB, k = 0.0006 * this.motion;
      _w3.set(-a[0] * k, -a[1] * k, -a[2] * k);
      if (_w3.length() > 0.06) _w3.setLength(0.06);
      _w3.applyQuaternion(qs);
      out.add(_w3);
    }
    return out;
  }

  /** Sichtfeld-Kick, Nachbrenner-Zittern, Stöße fortschreiben; n = Tempoanteil, ab = Nachbrenner 0..1 */
  step(dt, n, ab, scale) {
    // Modus-Übergang
    const want = this.mode === 'chase' ? 1 : 0;
    const d = dt / BLEND_T;
    this.kRaw = want > this.kRaw ? Math.min(want, this.kRaw + d) : Math.max(want, this.kRaw - d);
    this.k = smooth(this.kRaw);
    if (!this.looking) { const k = 1 - Math.exp(-dt * 5); this.lookYaw -= this.lookYaw * k; this.lookPitch -= this.lookPitch * k; }
    const wc = this.cockpit ? 1 : 0;
    this.kcRaw = wc > this.kcRaw ? Math.min(wc, this.kcRaw + d) : Math.max(wc, this.kcRaw - d);
    this.kc = smooth(this.kcRaw);
    // Sichtfeld weitet sich ab ≈ 55 % Tempo, Nachbrenner legt nach
    const fk = Math.max(0, Math.min(1, (n - 0.55) / 0.5));
    const fw = fk * fk * (3 - 2 * fk) + ab * 0.45;
    this.fovKick += (fw - this.fovKick) * (1 - Math.exp(-dt * (fw > this.fovKick ? 1.6 : 2.4)));
    this.ab = ab;
    if (this.firePunch) { this.firePunch *= Math.exp(-dt * 14); if (this.firePunch < 0.002) this.firePunch = 0; }
    // Druckwellen
    const W = this.waves;
    for (let i = 0; i < W.length; i += 4) {
      if (W[i] <= 0) continue;
      W[i] -= dt;
      if (W[i] <= 0) {
        W[i] = 0;
        const L = Math.hypot(W[i + 1], W[i + 2]) || 1, a = W[i + 3] * this.motion;
        this.kickV.x += W[i + 1] / L * 55 * a; this.kickV.z += W[i + 2] / L * 55 * a; this.kickV.y += 18 * a;
        this.rollKV += 0.8 * a * (W[i + 1] / L);
        this.trauma = Math.min(1, this.trauma + 0.35 * a);
      }
    }
    // Stoß-Feder (unterdämpft: kurzer Ruck, federt zurück)
    spring(this.kick, this.kickV, 0, 0, 0, 15, dt, 0.42);
    const rk = -this.rollK * 15 * 15 - 2 * 0.42 * 15 * this.rollKV;
    this.rollKV += rk * dt; this.rollK += this.rollKV * dt;
    // Trauma klingt ab; Nachbrenner hält ein leichtes Grundzittern
    const floor = this.shakeOn ? ab * 0.22 * this.motion : 0;
    this.trauma = Math.max(floor, this.trauma - dt * 1.1);
    if (!this.shakeOn) { this.trauma = 0; this.kick.set(0, 0, 0); this.kickV.set(0, 0, 0); this.rollK = 0; this.rollKV = 0; }
    this._scale = scale;
  }

  /** Wackel-Versatz (m) für die Kamera am Ort; Zeit T. Taktisch nur Verschiebung, Verfolger auch Neigung. */
  shakeOffset(T, out, amp) {
    const t = this.trauma, s = t * t * amp * this.motion;
    out.set(
      (Math.sin(T * 41.3) + Math.sin(T * 23.1 + 1.3) * 0.6 + Math.sin(T * 67.7) * 0.25) * s,
      (Math.sin(T * 37.7 + 0.4) + Math.sin(T * 19.3) * 0.5) * s * 0.6,
      (Math.sin(T * 29.9 + 2.1) + Math.sin(T * 53.3) * 0.5) * s,
    );
    out.x += this.kick.x * amp / 12; out.y += this.kick.y * amp / 12; out.z += this.kick.z * amp / 12;
    return out;
  }
  shakeRoll(T) {
    const t = this.trauma;
    return (Math.sin(T * 17.1) + Math.sin(T * 31.7 + 0.7) * 0.5) * t * t * 0.022 * this.motion + this.rollK * 0.09;
  }
}

// gedämpfte Feder: x → (tx, ty, tz), Kreisfrequenz w, Dämpfung z (1 = kritisch)
function spring(x, v, tx, ty, tz, w, dt, z = 1) {
  // in Teilschritten, damit auch lange Bilder stabil bleiben
  const n = dt > 1 / 50 ? Math.ceil(dt * 60) : 1, h = dt / n;
  for (let i = 0; i < n; i++) {
    v.x += (w * w * (tx - x.x) - 2 * z * w * v.x) * h;
    v.y += (w * w * (ty - x.y) - 2 * z * w * v.y) * h;
    v.z += (w * w * (tz - x.z) - 2 * z * w * v.z) * h;
    x.x += v.x * h; x.y += v.y * h; x.z += v.z * h;
  }
}
