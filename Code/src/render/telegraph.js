// Warnanzeige für angekündigte Spezialangriffe (Ereignis 'telegraph'): Aufladeleuchten am Gegner und
// Bodenmarkierung des Einschlags (Kreis für Flächen wie Säurewolke/Bombe, Bahn für Ramm-/Sprungangriff und Salve),
// die sich bis zum Auslösen füllt, dann kurz aufblitzt und verlischt. Auslösen/Abbruch über 'special'
// { id, cancelled, duration } (Simulation), Ende vorzeitig auch mit 'telegraphEnd' { id } oder wenn der Gegner stirbt.
// Säurewolke bleibt nach dem Auslösen für duration Sekunden als grüne Fläche mit Nebel stehen; Schildwall (guard)
// zeigt eine blaue Schildblase. Feste Pools (12 Markierungen), keine Speicher-Neuanlage pro Bild.
//
// Erwartete Nutzlast (tolerant, fehlende Felder werden ergänzt):
//   { id, kind: 'ram'|'dash'|'charge'|'volley'|'salvo'|'beam'|'acid'|'cloud'|'spit'|'bomb'|'mine'|'nova'|'emp',
//     t | delay (Sekunden bis zum Auslösen), x, z (Einschlagpunkt/-mitte), r | radius (Fläche; bei Bahnen halbe Breite),
//     dx, dz (Richtung bei Bahnen), len | length (Länge), w | width (Breite), to (Ziel-id) }
import * as THREE from 'three';

const MAX = 12;
const LINE_KINDS = { ram: 1, dash: 1, charge: 1, leap: 1, pounce: 1, volley: 1, salvo: 1, beam: 1, lance: 1, barrage: 1 };
const ACID_KINDS = { acid: 1, cloud: 1, spit: 1, spore: 1, toxin: 1, slime: 1 };

const VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */`
uniform vec3 uCol; uniform float uFill; uniform float uA; uniform float uFlash; uniform float uShape; uniform float uTime;
uniform vec2 uSize;  // Breite, Länge (m) für Kantenbreite in Metern
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = 0.0;
  if (uShape < 0.5) {
    // Kreis: Rand, Füllung wächst von innen, Messstriche
    float r = length(p);
    if (r > 1.0) discard;
    float w = 2.0 / max(uSize.x, 1.0);
    float rim = smoothstep(1.0 - w * 3.0, 1.0 - w, r) * (1.0 - smoothstep(1.0 - w, 1.0, r));
    float fillR = uFill;
    float fill = (1.0 - smoothstep(fillR - w * 2.0, fillR, r)) * 0.32;
    float front = smoothstep(fillR - w * 5.0, fillR, r) * (1.0 - smoothstep(fillR, fillR + w * 1.5, r)) * 0.9;
    float ang = atan(p.y, p.x);
    float ticks = step(0.8, fract(ang * 5.0929 + uTime * 0.4)) * smoothstep(0.8, 0.86, r) * (1.0 - smoothstep(0.92, 0.95, r)) * 0.5;
    a = rim + fill + front + ticks + 0.06;
  } else {
    // Bahn: x quer (−1..1), y längs (0 = Gegner, 1 = Ende); Füllung läuft vom Gegner zum Ende
    float wx = 2.0 / max(uSize.x, 1.0), wy = 2.0 / max(uSize.y, 1.0);
    float edge = smoothstep(1.0 - wx * 3.0, 1.0 - wx, abs(p.x));
    float y = vUv.y;
    float chev = step(0.55, fract(y * uSize.y / 38.0 - uTime * 1.6 - abs(p.x) * 0.35)) * 0.16;
    float fill = (1.0 - smoothstep(uFill - wy * 6.0, uFill, y)) * 0.3;
    float tip = smoothstep(1.0 - wy * 4.0, 1.0, y) * 0.5;
    a = edge * 0.9 + fill + chev * (1.0 - fill) + tip + 0.05;
  }
  a *= uA;
  vec3 c = uCol * a + vec3(1.0, 0.95, 0.9) * uFlash * a;
  gl_FragColor = vec4(c, a);
}`;

const _c = new THREE.Color();

export class Telegraph {
  constructor(scene, host) {
    this.host = host;
    this.group = new THREE.Group();
    this.group.name = 'telegraph';
    scene.add(this.group);
    this.geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    // Bahn: Ursprung am Gegner (y = 0 … 1 nach vorn = −z lokal)
    this.lineGeo = new THREE.PlaneGeometry(2, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    // uv.y: 0 am Gegner, 1 am vorderen Ende (Ebene liegt nach dem Drehen von z = 0 bis z = −1)
    this.time = { value: 0 };
    this.list = [];
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCol: { value: new THREE.Color() }, uFill: { value: 0 }, uA: { value: 0 }, uFlash: { value: 0 },
          uShape: { value: 0 }, uTime: this.time, uSize: { value: new THREE.Vector2(100, 100) },
        },
        vertexShader: VS, fragmentShader: FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const ground = new THREE.Mesh(this.geo, mat);
      ground.visible = false; ground.renderOrder = 6; ground.frustumCulled = false;
      const line = new THREE.Mesh(this.lineGeo, mat);
      line.visible = false; line.renderOrder = 6; line.frustumCulled = false;
      const glow = new THREE.Sprite(host.factory.sprite(0xffffff, 1.6, 'tele'));
      glow.material = glow.material.clone();
      glow.visible = false; glow.renderOrder = 24;
      this.group.add(ground, line, glow);
      this.list.push({ on: false, id: null, kind: '', line: false, t: 0, dur: 1, x: 0, z: 0, r: 100, dx: 0, dz: -1, len: 400, w: 40, follow: false, mat, ground, mesh: line, glow, gm: glow.material, col: new THREE.Color(), end: 0 });
    }
  }

  // Nutzlast vereinheitlichen und Markierung starten
  start(p) {
    if (!p) return;
    const H = this.host, id = p.id ?? p.from ?? p.enemyId ?? null;
    const v = id !== null ? H.views.get(id) : null;
    const kind = String(p.kind ?? p.type ?? p.attack ?? p.special ?? 'charge').toLowerCase();
    const dur = Math.max(0.2, Number(p.t ?? p.time ?? p.delay ?? p.windup ?? p.dur ?? p.duration ?? p.seconds ?? 1.2));
    // laufende Markierung desselben Gegners ersetzen
    let M = null;
    for (const m of this.list) if (m.on && m.id === id && id !== null) { M = m; break; }
    if (!M) for (const m of this.list) if (!m.on) { M = m; break; }
    if (!M) { M = this.list[0]; for (const m of this.list) if (m.t / m.dur > M.t / M.dur) M = m; }
    const ex = v ? v.rx : (p.sx ?? p.x ?? 0), ez = v ? v.rz : (p.sz ?? p.z ?? 0);
    const P = H.world?.player;
    const tgt = p.to !== undefined ? H.views.get(p.to) : null;
    let tx = p.x ?? p.tx, tz = p.z ?? p.tz;
    if (tx === undefined || tz === undefined) {
      if (tgt) { tx = tgt.rx; tz = tgt.rz; } else if (P) { tx = P.x; tz = P.z; } else { tx = ex; tz = ez; }
    }
    const hasLen = (p.len ?? p.length ?? p.range) !== undefined;
    const isLine = LINE_KINDS[kind] || (hasLen && p.r === undefined && p.radius === undefined);
    M.on = true; M.id = id; M.kind = kind; M.t = 0; M.dur = dur; M.end = 0; M.line = !!isLine;
    M.col.setHex(ACID_KINDS[kind] ? 0x7dff5a : kind === 'emp' || kind === 'nova' || kind === 'guard' ? 0x8ab8ff : 0xff3b30);
    const er = v ? v.vr : 30;
    if (M.line) {
      let dx = p.dx, dz = p.dz;
      if (!(typeof dx === 'number' && typeof dz === 'number') || (!dx && !dz)) { dx = tx - ex; dz = tz - ez; }
      const L = Math.hypot(dx, dz) || 1;
      M.dx = dx / L; M.dz = dz / L;
      M.len = Number(p.len ?? p.length ?? p.range ?? Math.max(300, Math.hypot(tx - ex, tz - ez) * 1.25));
      M.w = Number(p.w ?? p.width ?? (p.radius !== undefined ? p.radius * 2 : p.r !== undefined ? p.r * 2 : Math.max(36, er * 2.2)));
      M.x = ex; M.z = ez; M.follow = !!v;
    } else {
      M.x = tx; M.z = tz;
      M.r = Number(p.r ?? p.radius ?? (kind === 'nova' || kind === 'emp' ? 320 : 170));
      M.follow = false;
      if (kind === 'guard' && v) { M.x = v.rx; M.z = v.rz; M.follow = true; M.r = Math.max(M.r, v.vr * 1.2); }
    }
    M.linger = 0; M.lingerMax = 0;
    M.mat.uniforms.uCol.value.copy(M.col).multiplyScalar(1.6);
    M.mat.uniforms.uShape.value = M.line ? 1 : 0;
    M.mat.uniforms.uSize.value.set(M.line ? M.w : M.r * 2, M.line ? M.len : M.r * 2);
    M.ground.visible = !M.line; M.mesh.visible = M.line;
    M.gm.color.copy(M.col).multiplyScalar(2.2);
    M.glow.visible = !!v;
  }

  // Simulation löst aus ('special'): Abbruch → ausblenden; Säure → Wolke bleibt stehen; Schildwall → Schildblase
  special(p) {
    if (!p) return;
    const id = p.id ?? null;
    let M = null;
    for (const m of this.list) if (m.on && m.id === id) { M = m; break; }
    const H = this.host;
    if (p.cancelled) { if (M) { M.t = Math.max(M.t, M.dur) + 0.12; } return; }
    const kind = String(p.kind || (M && M.kind) || '');
    if (kind === 'guard') {
      if (H.effects && id !== null) H.effects._shield(id, Math.max(0.5, p.duration || 3), 0, 0, -1, true, true);
      if (M) M.t = Math.max(M.t, M.dur);
      return;
    }
    if (!M) return;
    M.t = Math.max(M.t, M.dur); // jetzt auslösen (Aufblitzen)
    if (ACID_KINDS[kind] && p.duration > 0) {
      M.linger = p.duration; M.lingerMax = p.duration;
      if (typeof p.x === 'number') { M.x = p.x; M.z = p.z; }
      if (p.radius) M.r = p.radius;
      M._acc = 0;
    }
  }

  end(p) {
    const id = p && (p.id ?? p.from);
    for (const m of this.list) if (m.on && m.id === id) { m.end = Math.max(m.end, 0.001); m.t = Math.max(m.t, m.dur); }
  }
  /** Gegner weg/zerstört: Markierung ausblenden */
  drop(id) {
    if (id === undefined || id === null) return;
    for (const m of this.list) if (m.on && m.id === id && m.t < m.dur) { m.t = m.dur; m.end = 0.2; }
  }

  update(dt) {
    this.time.value += dt;
    const H = this.host;
    for (const m of this.list) {
      if (!m.on) continue;
      m.t += dt;
      const v = m.id !== null ? H.views.get(m.id) : null;
      if (m.follow && v && m.t < m.dur) { m.x = v.rx; m.z = v.rz; }
      const k = Math.min(1, m.t / m.dur);
      const after = m.t - m.dur;
      // nach dem Auslösen: 0,12 s Aufblitzen, dann 0,35 s Ausblenden (Säurewolke: steht duration Sekunden)
      let A = 0.35 + 0.65 * k, flash = 0;
      if (after > 0 && m.linger > 0) {
        m.linger -= dt;
        flash = Math.max(0, 1 - after / 0.15);
        A = 0.4 + 0.12 * Math.sin(this.time.value * 5) + flash * 0.4;
        if (m.linger < 0.6) A *= Math.max(0, m.linger / 0.6);
        const U = m.mat.uniforms;
        U.uFill.value = 1; U.uA.value = A; U.uFlash.value = flash;
        m.ground.position.set(m.x, -1.5, m.z); m.ground.scale.set(m.r, 1, m.r);
        m.glow.visible = false;
        // ätzender Nebel über der Fläche
        const E = H.effects;
        if (E) {
          m._acc = (m._acc || 0) + dt * 7 * E.density;
          while (m._acc >= 1) {
            m._acc -= 1;
            const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * m.r * 0.85, g = 0.05 + Math.random() * 0.04;
            E.smokeP.emit(m.x + Math.cos(a) * d, 2 + Math.random() * 10, m.z + Math.sin(a) * d, 0, 3, 0, g * 0.5, g * 1.6, g * 0.4, 0.5, m.r * 0.18, m.r * 0.5, 1.4 + Math.random(), 0.3);
            if (Math.random() < 0.5) E.glowP.emit(m.x + Math.cos(a) * d, 3, m.z + Math.sin(a) * d, 0, 4, 0, 0.12, 0.45, 0.1, 0.5, m.r * 0.15, m.r * 0.35, 1.2, 0.3);
          }
        }
        if (m.linger <= 0) { m.on = false; m.ground.visible = false; m.mesh.visible = false; m.glow.visible = false; }
        continue;
      }
      if (after > 0) {
        flash = Math.max(0, 1 - after / 0.12);
        A = Math.max(0, 1 - Math.max(0, after - 0.12) / 0.35);
        if (A <= 0) { m.on = false; m.ground.visible = false; m.mesh.visible = false; m.glow.visible = false; continue; }
      }
      // letzte 30 %: schneller Puls (dringend)
      const urgent = k > 0.7 && after <= 0 ? 0.75 + 0.25 * Math.sin(this.time.value * 30) : 1;
      const U = m.mat.uniforms;
      U.uFill.value = k; U.uA.value = A * urgent; U.uFlash.value = flash;
      if (m.line) {
        m.mesh.position.set(m.x, -1.5, m.z);
        m.mesh.rotation.y = Math.atan2(-m.dx, -m.dz);
        m.mesh.scale.set(m.w / 2, 1, m.len);
      } else {
        m.ground.position.set(m.x, -1.5, m.z);
        m.ground.scale.set(m.r, 1, m.r);
      }
      // Aufladeleuchten am Gegner: wächst, flackert gegen Ende, blitzt beim Auslösen
      if (v && v.root.visible && (after <= 0.15)) {
        const s = v.vr * (1.4 + 1.8 * k * k) * (1 + flash * 0.8) * urgent;
        m.glow.visible = true;
        m.glow.position.set(v.rx, (v.root.position.y || 0) + 4, v.rz);
        m.glow.scale.setScalar(s);
        m.gm.opacity = Math.min(1, 0.35 + 0.65 * k) * (after > 0 ? flash : 1);
      } else m.glow.visible = false;
    }
  }

  warm(x, z) {
    const m = this.list[0];
    m.ground.visible = true; m.mesh.visible = true; m.glow.visible = true;
    m.ground.position.set(x, -1.5, z); m.mesh.position.set(x, -1.5, z); m.glow.position.set(x, 4, z);
  }
  clear() {
    for (const m of this.list) { m.on = false; m.ground.visible = false; m.mesh.visible = false; m.glow.visible = false; }
  }
  dispose() {
    this.group.parent?.remove(this.group);
    for (const m of this.list) { m.mat.dispose(); m.gm.dispose(); }
    this.geo.dispose(); this.lineGeo.dispose();
  }
}
