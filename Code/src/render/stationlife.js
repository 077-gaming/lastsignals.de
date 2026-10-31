// Leben an der Heimatstation (nur Optik, keine Spiellogik):
//   Andocken: Leitlichter laufen zum Andockpunkt, sobald der Spieler in der sicheren Zone ist; Andockring leuchtet;
//             vier Klammern öffnen sich beim Anflug und greifen beim Andocken (Schiff gleitet hinein, renderer.js).
//   Verkehr:  Pendelschiffe auf Bahnen und Zubringerflügen, Drohnen mit Blinklicht nah an den Aufbauten
//             (je eine Instanzliste), bei SATURN zusätzlich Frachter, die anlegen, warten und ablegen.
//   Eigenes:  SATURN Schweißfunken an der Werft, ERIS kreisende Suchscheinwerfer am Zellenring,
//             EUROPA langsam schwenkende Antennenschüssel.
// Alles unterhalb der Spielebene (lokal y < 30 → Welt < −14), damit nichts das Spielerschiff verdeckt.
// Lokale Achsen wie stations.js: Station-Wurzel bei y = −44, Ausleger zeigt nach +x und ist um „away“ gedreht.
import * as THREE from 'three';
import { FACTIONS } from '../core/data.js';
import { lightConeMaterial } from './surface.js';

const PLANE = 44;          // Spielebene in Stationskoordinaten
// Andockpunkt auf dem Ausleger (lokal, Auslegerrahmen) und Klammerradius
const PORT = { europa: [292, 0, 30], saturn: [326, 0, 32], eris: [272, 0, 28] };
// Oberkante des Decks unter dem Andockpunkt (Stützen der Andockwiege stehen darauf)
const DECK = { europa: 4, saturn: 7.4, eris: 1.5 };

const PT_VS = /* glsl */`
attribute float aT; attribute vec3 aCol; attribute float aSize;
uniform float uTime; uniform float uOn; uniform float uScale; uniform float uMode;
varying vec3 vC; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.5, 26.0);
  float a;
  if (uMode < 0.5) {
    // Leitlicht: Lauflicht zum Andockpunkt (aT = 1 außen, 0 am Punkt), schwaches Grundlicht
    float f = fract(uTime * 0.85 + aT);
    a = (0.12 + 1.15 * exp(-f * 9.0)) * uOn + 0.05;
  } else {
    // Verkehr: Triebwerk (aT < 0.5 ruhig), Blinklicht (aT ≥ 0.5 kurzer Blitz)
    a = aT < 0.5 ? 1.0 : (fract(uTime * 0.9 + aT * 7.3) < 0.08 ? 1.6 : 0.0);
  }
  vC = aCol; vA = a;
}`;
const PT_FS = /* glsl */`
varying vec3 vC; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
  float a = (exp(-d * 6.0) * 0.6 + exp(-d * 40.0)) * vA;
  gl_FragColor = vec4(vC * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const RING_FS = /* glsl */`
uniform vec3 uCol; uniform float uOn; uniform float uTime; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float ring = smoothstep(0.78, 0.86, r) * (1.0 - smoothstep(0.94, 1.0, r));
  float seg = step(0.35, fract(atan(p.y, p.x) / 6.2831853 * 16.0 - uTime * 0.6));
  float a = ring * (0.08 + uOn * (0.45 + 0.55 * seg));
  gl_FragColor = vec4(uCol * a, a);
}`;
const RING_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler(), _w = new THREE.Vector3(), _c = new THREE.Color();

function shuttleGeometry() {
  const parts = [
    new THREE.BoxGeometry(5, 2.4, 13).translate(0, 0, 0.5),
    new THREE.ConeGeometry(2.2, 4, 6).rotateX(-Math.PI / 2).translate(0, 0, -7.6),
    new THREE.BoxGeometry(11, 0.6, 4).translate(0, -0.2, 3),
    new THREE.BoxGeometry(1.4, 2.4, 3).translate(0, 1.8, 4.6),
  ];
  const g = mergeSimple(parts);
  parts.forEach((p) => p.dispose());
  return g;
}
// kleine Zusammenführung ohne Zusatzmodul (nur position/normal)
function mergeSimple(list) {
  let n = 0;
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  flat.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); // für Materialien mit Kontaktschatten-Farbe
  out.computeBoundingSphere();
  return out;
}

export class StationLife {
  constructor(faction, model, away, factory, quality = 2) {
    this.faction = FACTIONS[faction] ? faction : 'europa';
    this.f = factory;
    this.away = away;
    this.q = quality;
    this.root = model.root;
    const F = FACTIONS[this.faction];
    const fx = new THREE.Color(this.faction === 'saturn' ? 0xffa050 : this.faction === 'eris' ? 0xa66bff : 0xffd79a);
    this.fxCol = fx;
    const P = PORT[this.faction];
    this.port = { x: P[0], z: P[1], r: P[2] };
    // Rahmen des Auslegers (wie stations.js „arms“)
    const g = this.g = new THREE.Group();
    g.name = 'station-life';
    g.rotation.y = away;
    this.root.add(g);
    const gh = this.gh = new THREE.Group(); // Rahmen der Nabe (ungedreht)
    this.root.add(gh);
    this.portRot = 0;
    const ca = Math.cos(away), sa = Math.sin(away);
    // Blick zum Stationskern: lokale −x-Achse in der Welt = (−cos a, sin a) → rot = atan2(cos a, −sin a)
    this.portRot = Math.atan2(ca, -sa);
    this.uTime = factory.uTime;
    this.on = 0; this.dock = 0;
    this._buildGuide(fx);
    this._buildClamps(factory.stationMaterials(this.faction), fx);
    this._buildTraffic(fx);
    if (this.faction === 'saturn') this._buildFreighters();
    if (this.faction === 'eris') this._buildSearchlights();
    if (this.faction === 'saturn') this.weld = [[-60, 5, -60], [-67, 2, -79], [94, 9, 52], [-12, 9, -150]];
    this._sparkAcc = 0;
  }

  /** Andockpunkt in Weltkoordinaten (Spielebene), st = Stationsansicht (rx, rz) */
  portWorld(st, out) {
    const ca = Math.cos(this.away), sa = Math.sin(this.away), x = this.port.x, z = this.port.z;
    out.set(st.rx + x * ca + z * sa, 0, st.rz - x * sa + z * ca);
    return out;
  }

  // ---------- Leitlichter und Andockring ----------
  _buildGuide(col) {
    const { x: px, r } = this.port;
    const n = 16, rows = [-r * 0.75, r * 0.75];
    const pos = new Float32Array(n * rows.length * 3), t = new Float32Array(n * rows.length), c = new Float32Array(n * rows.length * 3), s = new Float32Array(n * rows.length);
    let k = 0;
    for (const z of rows) for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      pos.set([px + r + 18 + u * 420, PLANE - 9, z * (1 + u * 0.35)], k * 3);
      t[k] = u; c.set([col.r * 2.2, col.g * 2.2, col.b * 2.2], k * 3); s[k] = 7; k++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    geo.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
    this.guideMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uOn: { value: 0 }, uScale: this.f.uPointScale, uMode: { value: 0 } },
      vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.guide = new THREE.Points(geo, this.guideMat);
    this.guide.frustumCulled = false; this.guide.renderOrder = 12;
    this.g.add(this.guide);
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: col.clone().multiplyScalar(2.0) }, uOn: { value: 0 }, uTime: this.uTime },
      vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), this.ringMat);
    this.ring.position.set(px, PLANE - 7, this.port.z); this.ring.scale.setScalar(r * 1.25); this.ring.renderOrder = 6;
    this.g.add(this.ring);
  }

  // ---------- Klammern: vier Arme um den Andockpunkt (eine Instanzliste je Material) ----------
  _buildClamps(mats, col) {
    const { x: px, z: pz, r } = this.port;
    const arm = mergeSimple([
      new THREE.BoxGeometry(3.2, 3.2, r * 0.62).translate(0, 0, -r * 0.31),
      new THREE.BoxGeometry(3.6, 7, 3.2).translate(0, 2.4, -r * 0.62),
      new THREE.BoxGeometry(5, 4, 5),
    ]);
    const strip = mergeSimple([new THREE.BoxGeometry(0.6, 0.6, r * 0.5).translate(0, 1.9, -r * 0.33)]);
    // Andockwiege: vier Stützen vom Deck bis knapp unter die Spielebene, Ring oben (ein Netz)
    const dy = DECK[this.faction] ?? 4, top = PLANE - 8, hgt = top - dy;
    const cradle = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      cradle.push(new THREE.BoxGeometry(3.6, hgt, 3.6).translate(px + Math.cos(a) * r, dy + hgt / 2, pz + Math.sin(a) * r));
      cradle.push(new THREE.BoxGeometry(5, 2.2, 5).translate(px + Math.cos(a) * r, dy + hgt * 0.55, pz + Math.sin(a) * r));
    }
    cradle.push(new THREE.TorusGeometry(r, 1.3, 6, 40).rotateX(Math.PI / 2).translate(px, top, pz));
    this.cradleGeo = mergeSimple(cradle);
    cradle.forEach((g) => g.dispose());
    const cr = new THREE.Mesh(this.cradleGeo, mats.trim);
    this.g.add(cr);
    this.clampGeo = [arm, strip, this.cradleGeo];
    this.clampA = new THREE.InstancedMesh(arm, mats.trim, 4);
    this.clampB = new THREE.InstancedMesh(strip, this.f.glow(col.getHex(), 1.6), 4);
    for (const m of [this.clampA, this.clampB]) { m.frustumCulled = false; this.g.add(m); }
    this.clampAng = 1; // 1 = offen, 0 = geschlossen
    this.clampBase = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      this.clampBase.push([px + Math.cos(a) * r, PLANE - 6, pz + Math.sin(a) * r, Math.atan2(Math.cos(a), Math.sin(a))]);
    }
    this._clampSet(1);
  }
  _clampSet(open) {
    for (let i = 0; i < 4; i++) {
      const [x, y, z, yaw] = this.clampBase[i];
      // Arm zeigt zur Mitte (lokal −z), offen: nach oben geklappt
      _q.setFromEuler(_e.set(open * 0.95, yaw, 0, 'YXZ'));
      _m.compose(_p.set(x, y, z), _q, _s);
      this.clampA.setMatrixAt(i, _m); this.clampB.setMatrixAt(i, _m);
    }
    this.clampA.instanceMatrix.needsUpdate = true; this.clampB.instanceMatrix.needsUpdate = true;
  }

  // ---------- Verkehr ----------
  _buildTraffic(col) {
    const q = this.q;
    const nS = q >= 2 ? 10 : q === 1 ? 6 : 3, nD = q >= 2 ? 10 : q === 1 ? 5 : 0;
    this.shGeo = shuttleGeometry();
    const hullMat = this.f.std(`life:shuttle:${this.faction}`, { color: this.faction === 'europa' ? 0xd9d6cc : this.faction === 'eris' ? 0x2c2a33 : 0x5a5650, metal: 0.6, rough: 0.42, panel: 0.4, lines: 0.4, rim: 0.12, ao: false });
    this.shuttles = new THREE.InstancedMesh(this.shGeo, hullMat, nS);
    this.shuttles.frustumCulled = false;
    this.droneGeo = new THREE.OctahedronGeometry(2.2, 0).scale(1.4, 0.6, 1.4);
    this.drones = nD ? new THREE.InstancedMesh(this.droneGeo, this.f.std('life:drone', { color: 0x6a6c72, metal: 0.8, rough: 0.35, ao: false }), nD) : null;
    if (this.drones) this.drones.frustumCulled = false;
    this.g.add(this.shuttles); if (this.drones) this.g.add(this.drones);
    // Bahnen (deterministisch je Fraktion)
    let s = this.faction.length * 977 + 13;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    this.paths = [];
    for (let i = 0; i < nS; i++) {
      const run = i % 3 === 2; // Zubringer: pendelt zwischen Ausleger und Ferne
      this.paths.push({
        run, a: 260 + R() * 520, b: 220 + R() * 420, y: -70 + R() * 70, ph: R() * Math.PI * 2, sp: (0.05 + R() * 0.05) * (R() < 0.5 ? -1 : 1),
        tilt: (R() - 0.5) * 0.5, cx: (R() - 0.5) * 120, cz: (R() - 0.5) * 120,
        ax: this.port.x + 60, az: (R() - 0.5) * 60, bx: 700 + R() * 600, bz: (R() - 0.5) * 900, period: 34 + R() * 26,
      });
    }
    this.dpaths = [];
    for (let i = 0; i < nD; i++) this.dpaths.push({ cx: (R() - 0.5) * 300, cz: (R() - 0.5) * 300, r: 40 + R() * 90, y: -10 + R() * 34, ph: R() * 6.28, sp: 0.25 + R() * 0.3 });
    // Lichter: je Pendelschiff Triebwerk + Blinklicht, je Drohne Blinklicht
    const nP = nS * 2 + nD;
    this.lpos = new Float32Array(nP * 3);
    const t = new Float32Array(nP), c = new Float32Array(nP * 3), sz = new Float32Array(nP);
    for (let i = 0; i < nS; i++) {
      t[i * 2] = 0; c.set([col.r * 2.4, col.g * 2.4, col.b * 2.4], i * 6); sz[i * 2] = 9;
      t[i * 2 + 1] = 0.5 + i * 0.037; c.set([2.2, 0.3, 0.2], i * 6 + 3); sz[i * 2 + 1] = 6;
    }
    for (let i = 0; i < nD; i++) { const k = nS * 2 + i; t[k] = 0.5 + i * 0.061; c.set([0.4, 2.0, 0.8], k * 3); sz[k] = 5; }
    const lg = new THREE.BufferGeometry();
    this.lattr = new THREE.BufferAttribute(this.lpos, 3).setUsage(THREE.DynamicDrawUsage);
    lg.setAttribute('position', this.lattr);
    lg.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    lg.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
    lg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    this.lightMat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.uTime, uOn: { value: 1 }, uScale: this.f.uPointScale, uMode: { value: 1 } },
      vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.lights = new THREE.Points(lg, this.lightMat);
    this.lights.frustumCulled = false; this.lights.renderOrder = 12;
    this.g.add(this.lights);
  }

  _buildFreighters() {
    const n = this.q >= 2 ? 2 : this.q === 1 ? 1 : 0;
    this.freighters = [];
    for (let i = 0; i < n; i++) {
      const m = this.f.buildFreighter(i + 3);
      m.root.scale.setScalar(0.42);
      this.gh.add(m.root);
      // Liegeplatz am Ring (Außenkante r ≈ 175), Anflug von außen
      const a = i ? 2.2 : 5.4;
      this.freighters.push({ m, a, ph: i * 31, dock: [Math.cos(a) * 212, -14, Math.sin(a) * 212] });
    }
  }

  _buildSearchlights() {
    const mat = this.f.mat('life:cone', lightConeMaterial);
    const g = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0);
    const n = g.attributes.position.count;
    const t = new Float32Array(n), sp = new Float32Array(n), cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { t[i] = -g.attributes.position.getY(i); cc.set([0.62, 0.55, 1.15], i * 3); }
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aSpot', new THREE.BufferAttribute(sp, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(cc, 3));
    this.coneGeo = g;
    this.search = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.3;
      const pivot = new THREE.Group();
      pivot.position.set(Math.cos(a) * 196, 18, Math.sin(a) * 196);
      const cone = new THREE.Mesh(g, mat);
      cone.scale.set(80, 520, 80);
      cone.rotation.z = Math.PI / 2 + 0.35; // Spitze am Scheinwerfer, Kegel nach außen und leicht nach unten
      cone.renderOrder = 11;
      pivot.add(cone);
      this.gh.add(pivot);
      this.search.push({ pivot, base: -a, ph: i * 1.7 });
    }
  }

  // ---------- jedes Bild ----------
  update(dt, t, v, W, host) {
    // weit weg: nichts rechnen, Verkehr ausblenden
    const ct = host.camTarget;
    const far = (v.rx - ct.x) ** 2 + (v.rz - ct.z) ** 2 > 4200 * 4200;
    this.g.visible = !far; this.gh.visible = !far;
    if (far) return;
    const P = W && W.player;
    // Anflug: Leitlichter ab 900 m, voll in der sicheren Zone; angedockt ruhig hell
    let want = 0;
    if (P && P.alive !== false) {
      const d = Math.hypot((P.x || 0) - v.rx, (P.z || 0) - v.rz);
      want = W.docked ? 1 : d < 900 ? (d < 400 ? 1 : 1 - (d - 400) / 500) : 0;
    }
    this.on += (want - this.on) * (1 - Math.exp(-dt * 2.5));
    this.guideMat.uniforms.uOn.value = W && W.docked ? 0.35 : this.on;
    this.ringMat.uniforms.uOn.value = Math.max(this.on, host._dockK || 0);
    // Klammern: offen beim Anflug, greifen beim Andocken (folgt dem Gleiten des Schiffs)
    const dk = host._dockK || 0;
    const open = dk > 0.75 ? 1 - (dk - 0.75) / 0.25 : Math.min(1, 0.25 + this.on * 0.75);
    if (Math.abs(open - this.clampAng) > 0.002) { this.clampAng += (open - this.clampAng) * (1 - Math.exp(-dt * 6)); this._clampSet(this.clampAng); }
    // Pendelschiffe
    const S = this.shuttles, L = this.lpos;
    for (let i = 0; i < this.paths.length; i++) {
      const p = this.paths[i];
      let x, y, z, hx, hz;
      if (p.run) {
        // Zubringer: Ausleger ↔ Ferne, weiches Hin und Her, kurz Halten an den Enden
        const u = (t / p.period + p.ph) % 1, k = 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, (u < 0.5 ? u : 1 - u) * 2.4 - 0.1)) * Math.PI);
        x = p.ax + (p.bx - p.ax) * k; z = p.az + (p.bz - p.az) * k; y = -20 + p.y * 0.4 * k;
        const dir = u < 0.5 ? 1 : -1;
        hx = (p.bx - p.ax) * dir; hz = (p.bz - p.az) * dir;
      } else {
        const a = p.ph + t * p.sp;
        x = p.cx + Math.cos(a) * p.a; z = p.cz + Math.sin(a) * p.b; y = p.y + Math.sin(a * 2) * 8;
        hx = -Math.sin(a) * p.a * p.sp; hz = Math.cos(a) * p.b * p.sp;
      }
      const yaw = Math.atan2(-hx, -hz);
      _q.setFromEuler(_e.set(0, yaw, p.tilt * 0.4, 'YXZ'));
      _m.compose(_p.set(x, y, z), _q, _s);
      S.setMatrixAt(i, _m);
      const bx = Math.sin(yaw), bz = Math.cos(yaw);
      L[i * 6] = x + bx * 7.5; L[i * 6 + 1] = y; L[i * 6 + 2] = z + bz * 7.5;
      L[i * 6 + 3] = x; L[i * 6 + 4] = y + 2.6; L[i * 6 + 5] = z;
    }
    S.instanceMatrix.needsUpdate = true;
    if (this.drones) {
      const D = this.drones, o = this.paths.length * 2;
      for (let i = 0; i < this.dpaths.length; i++) {
        const p = this.dpaths[i], a = p.ph + t * p.sp;
        const x = p.cx + Math.cos(a) * p.r, z = p.cz + Math.sin(a) * p.r, y = p.y + Math.sin(t * 1.3 + p.ph) * 3;
        _q.setFromEuler(_e.set(0, -a, 0));
        _m.compose(_p.set(x, y, z), _q, _s);
        D.setMatrixAt(i, _m);
        L[(o + i) * 3] = x; L[(o + i) * 3 + 1] = y + 1.6; L[(o + i) * 3 + 2] = z;
      }
      D.instanceMatrix.needsUpdate = true;
    }
    this.lattr.needsUpdate = true;
    // Frachter: Anflug 22 s, liegen 14 s, Ablegen 20 s, dann außer Sicht neu ansetzen
    if (this.freighters) for (const fr of this.freighters) this._freighter(fr, t, dt);
    // Schweißfunken an der Werft
    if (this.weld && host.effects && host.quality >= 1) {
      this._sparkAcc += dt * 26 * host.effects.density;
      while (this._sparkAcc >= 1) {
        this._sparkAcc -= 1;
        const w = this.weld[(Math.random() * this.weld.length) | 0];
        if (Math.random() < 0.35) continue; // Schweißen mit Pausen
        _w.set(w[0], w[1], w[2]).applyMatrix4(this.root.matrixWorld);
        const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 110;
        host.effects.sparks.emit(_w.x, _w.y, _w.z, Math.cos(a) * sp, 20 + Math.random() * 60, Math.sin(a) * sp, 2.6, 2.4, 3.2, 0.25 + Math.random() * 0.35, 1.5, 0.02);
      }
    }
    if (this.search) for (const s of this.search) s.pivot.rotation.y = s.base + Math.sin(t * 0.32 + s.ph) * 0.7;
  }

  _freighter(fr, t, dt) {
    const T = 64, u = ((t + fr.ph) % T + T) % T;
    const [dx, dy, dz] = fr.dock;
    const ox = Math.cos(fr.a) * 1500, oz = Math.sin(fr.a) * 1500;          // Anflug von außen
    const ex = Math.cos(fr.a + 1.1) * 1600, ez = Math.sin(fr.a + 1.1) * 1600; // Abflug seitlich
    let x, z, y = dy, hx, hz, thr;
    const ease = (k) => k * k * (3 - 2 * k);
    if (u < 22) { const k = 1 - (1 - u / 22) ** 2; x = ox + (dx - ox) * k; z = oz + (dz - oz) * k; hx = dx - ox; hz = dz - oz; thr = 1 - k; y = dy - 30 * (1 - k); }
    else if (u < 36) { x = dx; z = dz; hx = dx - ox; hz = dz - oz; thr = 0.05; }
    else if (u < 56) { const k = ease((u - 36) / 20) ** 1.4; x = dx + (ex - dx) * k; z = dz + (ez - dz) * k; hx = ex - dx; hz = ez - dz; thr = 0.3 + 0.7 * Math.min(1, k * 3); y = dy - 40 * k; }
    else { x = ex; z = ez; hx = ex - dx; hz = ez - dz; thr = 0; }
    const R = fr.m.root;
    R.visible = u < 56;
    if (!R.visible) return;
    R.position.set(x, y, z);
    R.rotation.y = Math.atan2(-hx, -hz);
    for (const en of fr.m.engines) {
      en.trail.scale.set(9 + thr * 4, 9 + thr * 4, 12 + thr * 80);
      en.glow.scale.setScalar(12 + thr * 8);
    }
  }

  dispose() {
    this.root.remove(this.g); this.root.remove(this.gh);
    this.shGeo.dispose(); this.droneGeo.dispose();
    for (const g of this.clampGeo) g.dispose();
    this.guide.geometry.dispose(); this.guideMat.dispose();
    this.ring.geometry.dispose(); this.ringMat.dispose();
    this.lights.geometry.dispose(); this.lightMat.dispose();
    if (this.coneGeo) this.coneGeo.dispose();
  }
}
