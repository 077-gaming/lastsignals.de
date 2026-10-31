// Triebwerksschweife als leuchtende Plasma-Bänder (Ribbons). Jeder Schweif ist ein Ringpuffer der letzten
// Düsenpositionen; das Band zeichnet die geflogene Kurve exakt nach, weitet sich mit dem Alter und blendet weich aus.
// Mehrere Düsen eines Schiffs teilen sich EIN Band: an der Düse zwei heiße Strahlen (Abstand sep), die nach
// ≈ 30 % der Länge zu einem breiteren, weicheren Abgasstrahl verschmelzen. Helligkeit fällt nach hinten steil ab
// (≈ (1−f)^3…4), damit der Schweif wie Abgas wirkt und nicht wie ein Laserstrahl.
// Alle Schweife (Spieler und Gegner) liegen in EINER Geometrie (ein Draw-Call). Pro Bild werden nur die aktiven
// Bänder dicht hintereinander geschrieben; keine Speicher-Neuanlage pro Bild.
import * as THREE from 'three';

const N = 56;             // Punkte je Band
const MERGE = 0.3;        // Anteil der Länge, nach dem die Düsenstrahlen verschmolzen sind
const VS = /* glsl */`
attribute vec4 aD;        // x: Seite −1..1, y: Alter 0 (Düse) … 1 (Ende), z: Helligkeit, w: Weg ab Düse (m)
attribute vec3 aCol;
attribute float aS;       // Abstand der beiden Düsenstrahlen von der Mitte (Anteil der halben Breite), 0 = ein Strahl
varying vec4 vD; varying vec3 vCol; varying float vS;
void main() { vD = aD; vCol = aCol; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = /* glsl */`
uniform float uTime;
varying vec4 vD; varying vec3 vCol; varying float vS;
void main() {
  float f = clamp(vD.y, 0.0, 1.0), a = vD.z, s = vD.w;
  float ax = abs(vD.x);
  // Abstand zum nächsten Düsenstrahl (normiert auf dessen halbe Breite)
  float sp = vS;
  float xl = sp > 0.002 ? abs(ax - sp) / max(0.2, 1.0 - sp) : ax;
  // leichte Turbulenz, erst nach hinten spürbar (kein Perlenmuster im Kern)
  float n = sin(s * 0.045 - uTime * 9.0 + vD.x * 1.3) * sin(s * 0.017 + uTime * 2.7);
  float tur = 1.0 + n * (0.025 + 0.2 * f * f);
  float w = 1.0 + 0.12 * n * f;
  float xr = xl / w, xs = ax / w;
  float fall = 1.0 - f;
  float core = exp(-xr * xr * 26.0) * pow(fall, 4.2);
  float body = exp(-xr * xr * 4.2) * pow(fall, 3.2);
  // verschmolzener, weicher Abgasstrahl hinter dem Zusammenfluss
  float soft = exp(-xs * xs * 2.4) * pow(fall, 3.4) * smoothstep(0.08, 0.4, f) * 0.5;
  float halo = exp(-xs * xs * 1.3) * pow(fall, 3.0) * 0.18;
  // heißer Kern (fast weiß) → Fraktionsfarbe → kühler, dunklerer Rand am Ende
  vec3 hot = mix(vec3(1.0, 0.97, 0.93), vCol * 1.5 + 0.2, smoothstep(0.0, 0.22, f));
  vec3 cool = mix(vCol, vCol * vec3(0.55, 0.7, 1.15), smoothstep(0.15, 0.8, f));
  vec3 c = hot * core * 2.3 + cool * ((body * 0.9 + soft) * tur + halo);
  // Spitze an der Düse nicht hart abschneiden
  c *= smoothstep(0.0, 0.015, f + 0.004);
  gl_FragColor = vec4(c * a, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export class Trails {
  constructor(group, uTime, cap = 48) {
    this.cap = cap;
    this.time = 0;
    this.list = [];
    for (let i = 0; i < cap; i++) {
      this.list.push({
        on: false, owner: null, fed: false, x: new Float32Array(N), y: new Float32Array(N), z: new Float32Array(N),
        t: new Float32Array(N), k: new Float32Array(N), n: 0, life: 0.5, lifeT: 0.5, w: 4, sep: 0, col: new THREE.Color(), gain: 1, spd: 0,
      });
    }
    this.map = new Map();
    const V = cap * N * 2;
    this.pos = new Float32Array(V * 3);
    this.dat = new Float32Array(V * 4);
    this.col = new Float32Array(V * 3);
    this.sp = new Float32Array(V);
    const g = this.geo = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aD = new THREE.BufferAttribute(this.dat, 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aS = new THREE.BufferAttribute(this.sp, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('aD', this.aD); g.setAttribute('aCol', this.aC); g.setAttribute('aS', this.aS);
    const idx = new Uint32Array(cap * (N - 1) * 6);
    let o = 0;
    for (let r = 0; r < cap; r++) {
      const b = r * N * 2;
      for (let k = 0; k < N - 1; k++) { const a = b + k * 2; idx[o++] = a; idx[o++] = a + 1; idx[o++] = a + 2; idx[o++] = a + 1; idx[o++] = a + 3; idx[o++] = a + 2; }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 16;
    group.add(this.mesh);
  }

  // Schweif eines Besitzers (Schlüssel beliebig, z. B. 'player:0'). Gibt null, wenn alle belegt sind.
  _get(key) {
    let r = this.map.get(key);
    if (r) return r;
    for (let i = 0; i < this.cap; i++) {
      const c = this.list[i];
      if (!c.on) { c.on = true; c.owner = key; c.n = 0; c.spd = 0; this.map.set(key, c); return c; }
    }
    return null;
  }

  // Jedes Bild je Schiff/Düse: Position (Mitte der Düsen), k = Helligkeit (0..1), w = halbe Breite eines Düsenstrahls,
  // life = Länge in Sekunden, color: Fraktions- oder Akzentfarbe, gain = Grundhelligkeit (Gegner dezenter),
  // sep = seitlicher Abstand der beiden äußeren Düsen von der Mitte (m), 0 = ein einzelner Strahl
  feed(key, x, y, z, k, w, life, color, gain = 1, sep = 0) {
    const r = this._get(key);
    if (!r) return;
    r.fed = true; r.w = w; r.gain = gain; r.lifeT = life; r.sep = sep;
    r.col.copy(color);
    const now = this.time;
    if (r.n > 0) {
      // Tempo der Düse (geglättet) für den Punktabstand
      const ddt = now - r.t[0];
      if (ddt > 1e-4) { const sp = Math.hypot(x - r.x[0], z - r.z[0]) / ddt; if (sp < 5000) r.spd += (sp - r.spd) * 0.2; }
      // Sprung/Teleport: Band neu beginnen
      const jx = x - r.x[0], jz = z - r.z[0];
      if (jx * jx + jz * jz > 250 * 250) r.n = 0;
    }
    if (r.n === 0) {
      r.x[0] = x; r.y[0] = y; r.z[0] = z; r.t[0] = now; r.k[0] = k; r.n = 1; r.life = life;
    }
    // neuer Stützpunkt, wenn die Düse weit genug vom letzten festen Punkt weg ist (Abstand passt sich der Länge an)
    const spacing = Math.max(2.5, Math.min(40, r.spd * Math.max(r.life, life) / (N - 14)));
    const i1 = r.n > 1 ? 1 : 0;
    const dx = x - r.x[i1], dz = z - r.z[i1];
    if (r.n === 1 || dx * dx + dz * dz > spacing * spacing || now - r.t[i1] > 0.05) {
      r.x.copyWithin(1, 0, N - 1); r.y.copyWithin(1, 0, N - 1); r.z.copyWithin(1, 0, N - 1);
      r.t.copyWithin(1, 0, N - 1); r.k.copyWithin(1, 0, N - 1);
      if (r.n < N) r.n++;
    }
    r.x[0] = x; r.y[0] = y; r.z[0] = z; r.t[0] = now; r.k[0] = k;
  }

  // Besitzer weg (Sektorwechsel): alle sofort frei
  clear() {
    for (const r of this.list) { r.on = false; r.n = 0; r.fed = false; }
    this.map.clear();
    this.geo.setDrawRange(0, 0);
  }

  update(dt) {
    this.time += dt;
    const now = this.time;
    const P = this.pos, D = this.dat, C = this.col;
    let used = 0;
    for (let ri = 0; ri < this.cap; ri++) {
      const r = this.list[ri];
      if (!r.on) continue;
      // Länge folgt weich (beim Abbremsen schrumpft der Schweif sichtbar statt abzureißen)
      const kk = 1 - Math.exp(-dt * (r.lifeT > r.life ? 2.2 : 1.4));
      r.life += (r.lifeT - r.life) * kk;
      if (!r.fed) {
        // ohne Nachschub: der Kopf bleibt stehen, das Band altert aus
        if (r.n === 0 || now - r.t[0] > r.life) { r.on = false; this.map.delete(r.owner); r.n = 0; continue; }
      }
      r.fed = false;
      const n = r.n;
      if (n < 2) continue;
      const life = Math.max(0.05, r.life);
      // letzter noch lebender Punkt
      let last = n - 1;
      while (last > 1 && now - r.t[last] > life) last--;
      const base = used * N * 2;
      let dist = 0;
      const cr = r.col.r, cg = r.col.g, cb = r.col.b, gain = r.gain, w0 = r.w, sep = r.sep;
      const S = this.sp;
      for (let k = 0; k < N; k++) {
        const i = k <= last ? k : last;
        const a = Math.max(0, i - 1), b = Math.min(last, i + 1);
        let tx = r.x[a] - r.x[b], tz = r.z[a] - r.z[b];
        const L = Math.sqrt(tx * tx + tz * tz) || 1; tx /= L; tz /= L;
        if (k > 0 && k <= last) { const ddx = r.x[i] - r.x[i - 1], ddz = r.z[i] - r.z[i - 1]; dist += Math.sqrt(ddx * ddx + ddz * ddz); }
        let f = (now - r.t[i]) / life;
        if (k > last) f = 1;
        if (f > 1) f = 1;
        // Breite: Düsenstrahl an der Düse schmal, weitet sich mit dem Alter (Plasma kühlt und dehnt sich);
        // zwei Strahlen laufen bis MERGE zusammen, danach ein breiterer gemeinsamer Strahl
        let m = f / MERGE; if (m > 1) m = 1; m = m * m * (3 - 2 * m);
        const sepNow = sep * (1 - m);
        const w = sepNow + sep * 0.5 * m + w0 * (0.55 + 1.3 * Math.pow(f, 0.7));
        const sRel = sepNow / w;
        // weiches Ende auch dann, wenn der Puffer (nicht das Alter) die Länge begrenzt
        const a1 = (k > last ? 0 : Math.min(1, (last - k) / 6)) * r.k[i] * gain;
        const v = (base + k * 2);
        const p3 = v * 3, d4 = v * 4;
        const x = r.x[i], y = r.y[i], z = r.z[i];
        P[p3] = x - tz * w; P[p3 + 1] = y; P[p3 + 2] = z + tx * w;
        P[p3 + 3] = x + tz * w; P[p3 + 4] = y; P[p3 + 5] = z - tx * w;
        D[d4] = -1; D[d4 + 1] = f; D[d4 + 2] = a1; D[d4 + 3] = dist;
        D[d4 + 4] = 1; D[d4 + 5] = f; D[d4 + 6] = a1; D[d4 + 7] = dist;
        C[p3] = cr; C[p3 + 1] = cg; C[p3 + 2] = cb; C[p3 + 3] = cr; C[p3 + 4] = cg; C[p3 + 5] = cb;
        S[v] = sRel; S[v + 1] = sRel;
      }
      used++;
    }
    this.geo.setDrawRange(0, used * (N - 1) * 6);
    this.mesh.visible = used > 0;
    if (used > 0) {
      const nv = used * N * 2;
      this.aP.clearUpdateRanges(); this.aP.addUpdateRange(0, nv * 3); this.aP.needsUpdate = true;
      this.aD.clearUpdateRanges(); this.aD.addUpdateRange(0, nv * 4); this.aD.needsUpdate = true;
      this.aC.clearUpdateRanges(); this.aC.addUpdateRange(0, nv * 3); this.aC.needsUpdate = true;
      this.aS.clearUpdateRanges(); this.aS.addUpdateRange(0, nv); this.aS.needsUpdate = true;
    }
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
