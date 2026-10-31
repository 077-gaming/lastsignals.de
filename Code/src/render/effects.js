// Effekte, alle aus festen Pools (keine Speicher-Neuanlage pro Bild):
// Laserbolzen (heißer Kern + farbiges Glühen), Mündungsblitz, Treffer-Funken als Lichtstriche,
// Schild als schimmernde Energiehaut mit Treffer-Welle, Raketen mit durchgehendem Abgasband (Ringpuffer),
// Explosionen fürs Vakuum (greller Blitz mit Mindestgröße am Bildschirm, Feuerkern, lautlos wachsende Gaswolke,
// Trümmer die nach 1 s zu dunklem Metall abkühlen, Funken), Sprung-Ladung als scharfe Segmentringe mit
// steigender Drehzahl, kurzer Austrittsblitz mit radialer Streckung, Einblendung, Beute-Glitzern.
import * as THREE from 'three';
import { LASERS, ENEMIES } from '../core/data.js';
import { getGlowTexture, getRingTexture } from './textures.js';
import { SHIELD_COLOR, ENEMY_VIS } from './models.js';
import { NOISE } from './glsl.js';
import { segRingMaterial } from './overlay.js';

const rand = Math.random;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _fz = new THREE.Vector3(0, 0, 1), _e = new THREE.Euler();

const OUT = `
#include <tonemapping_fragment>
#include <colorspace_fragment>`;

// ---------- Partikel (ein Draw-Call pro System) ----------
const P_VS = `
attribute float aSize; attribute vec4 aColor; uniform float uScale; uniform float uMaxPx;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Obergrenze in Bildschirmpunkten (≈ 210 CSS-px × Pixeldichte): große Rauchbälle füllen sonst halbe Bilder
  gl_PointSize = min(aSize * uScale / -mv.z, uMaxPx);
  vColor = aColor;
}`;
const P_FS_ADD = `
varying vec4 vColor;
void main() {
  // ohne discard (Apple-GPUs: discard bremst auch durchsichtige Zeichnungen), außerhalb des Kreises Alpha 0
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  float a = (exp(-d * 5.0) + exp(-d * 30.0) * 0.8) * vColor.a * step(d, 1.0);
  gl_FragColor = vec4(vColor.rgb * a, a);${OUT}
}`;
const P_FS_SMOKE = `
varying vec4 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = min(dot(c, c) * 4.0, 1.0);
  float a = (1.0 - d) * (1.0 - d) * vColor.a;
  gl_FragColor = vec4(vColor.rgb, a);${OUT}
}`;

class Particles {
  constructor(cap, additive) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    const g = this.geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 800 }, uMaxPx: { value: 420 } },
      vertexShader: P_VS, fragmentShader: additive ? P_FS_ADD : P_FS_SMOKE,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, a, s0, s1, life, drag) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const i3 = i * 3, i4 = i * 4;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = a;
    this.a0[i] = a; this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0;
    this.life[i] = life; this.max[i] = life; this.drag[i] = drag;
  }
  _copy(d, s) {
    const d3 = d * 3, s3 = s * 3, d4 = d * 4, s4 = s * 4;
    this.pos[d3] = this.pos[s3]; this.pos[d3 + 1] = this.pos[s3 + 1]; this.pos[d3 + 2] = this.pos[s3 + 2];
    this.vel[d3] = this.vel[s3]; this.vel[d3 + 1] = this.vel[s3 + 1]; this.vel[d3 + 2] = this.vel[s3 + 2];
    this.col[d4] = this.col[s4]; this.col[d4 + 1] = this.col[s4 + 1]; this.col[d4 + 2] = this.col[s4 + 2]; this.col[d4 + 3] = this.col[s4 + 3];
    this.a0[d] = this.a0[s]; this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s]; this.size[d] = this.size[s];
    this.life[d] = this.life[s]; this.max[d] = this.max[s]; this.drag[d] = this.drag[s];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) { this.n--; if (i < this.n) this._copy(i, this.n); continue; }
      this.life[i] = l;
      const t = 1 - l / this.max[i];
      const i3 = i * 3;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 1] *= k; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t * 0.3);
      i++;
    }
    const n = this.n;
    this.geo.setDrawRange(0, n);
    if (n > 0) {
      this.aPos.clearUpdateRanges(); this.aPos.addUpdateRange(0, n * 3); this.aPos.needsUpdate = true;
      this.aCol.clearUpdateRanges(); this.aCol.addUpdateRange(0, n * 4); this.aCol.needsUpdate = true;
      this.aSize.clearUpdateRanges(); this.aSize.addUpdateRange(0, n); this.aSize.needsUpdate = true;
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---------- Funken als Lichtstriche (Länge folgt der Geschwindigkeit) ----------
class Sparks {
  constructor(cap) {
    this.cap = cap; this.n = 0;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.c = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.drag = new Float32Array(cap); this.len = new Float32Array(cap);
    this.vp = new Float32Array(cap * 6); this.vc = new Float32Array(cap * 6);
    const g = this.geo = new THREE.BufferGeometry();
    this.aP = new THREE.BufferAttribute(this.vp, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.BufferAttribute(this.vc, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aP); g.setAttribute('color', this.aC);
    g.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false; this.lines.renderOrder = 21;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life, drag, len) {
    if (this.n >= this.cap) return;
    const i = this.n++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
    this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
    this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
    this.life[i] = life; this.max[i] = life; this.drag[i] = drag; this.len[i] = len;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const l = this.life[i] - dt;
      if (l <= 0) {
        this.n--;
        if (i < this.n) {
          const s = this.n, s3 = s * 3, i3 = i * 3;
          for (let k = 0; k < 3; k++) { this.p[i3 + k] = this.p[s3 + k]; this.v[i3 + k] = this.v[s3 + k]; this.c[i3 + k] = this.c[s3 + k]; }
          this.life[i] = this.life[s]; this.max[i] = this.max[s]; this.drag[i] = this.drag[s]; this.len[i] = this.len[s];
        }
        continue;
      }
      this.life[i] = l;
      const i3 = i * 3, i6 = i * 6;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      const vx = this.v[i3] *= k, vy = this.v[i3 + 1] *= k, vz = this.v[i3 + 2] *= k;
      const x = this.p[i3] += vx * dt, y = this.p[i3 + 1] += vy * dt, z = this.p[i3 + 2] += vz * dt;
      const L = this.len[i];
      this.vp[i6] = x; this.vp[i6 + 1] = y; this.vp[i6 + 2] = z;
      this.vp[i6 + 3] = x - vx * L; this.vp[i6 + 4] = y - vy * L; this.vp[i6 + 5] = z - vz * L;
      const t = l / this.max[i], f = t * t;
      // Farbe kühlt ab: weiß-gelb → orange → rot
      this.vc[i6] = this.c[i3] * f; this.vc[i6 + 1] = this.c[i3 + 1] * f * t; this.vc[i6 + 2] = this.c[i3 + 2] * f * t * t;
      this.vc[i6 + 3] = 0; this.vc[i6 + 4] = 0; this.vc[i6 + 5] = 0;
      i++;
    }
    const n = this.n;
    this.geo.setDrawRange(0, n * 2);
    if (n > 0) {
      this.aP.clearUpdateRanges(); this.aP.addUpdateRange(0, n * 6); this.aP.needsUpdate = true;
      this.aC.clearUpdateRanges(); this.aC.addUpdateRange(0, n * 6); this.aC.needsUpdate = true;
    }
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

// ---------- Instanz-Pool (Bolzen, Trümmer) ----------
class InstancePool {
  constructor(geo, mat, cap) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    _c.setRGB(1, 1, 1);
    for (let i = 0; i < cap; i++) this.mesh.setColorAt(i, _c);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.cap = cap;
  }
  begin() { this.k = 0; }
  push(matrix, color) {
    if (this.k >= this.cap) return;
    this.mesh.setMatrixAt(this.k, matrix);
    this.mesh.setColorAt(this.k, color);
    this.k++;
  }
  end() {
    const m = this.mesh; m.count = this.k;
    if (this.k > 0) {
      m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, this.k * 16); m.instanceMatrix.needsUpdate = true;
      m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, this.k * 3); m.instanceColor.needsUpdate = true;
    }
  }
}

// Laserbolzen: zwei gekreuzte Flächen, weißer heißer Kern, farbiges Glühen, Kopf hell, Schwanz läuft aus
const BOLT_VS = `
varying vec2 vUv; varying vec3 vCol;
void main() {
  vUv = uv;
  vCol = vec3(1.0);
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const BOLT_FS = `
varying vec2 vUv; varying vec3 vCol;
void main() {
  float x = abs(vUv.x * 2.0 - 1.0), y = vUv.y;
  float core = exp(-x * x * 34.0);
  float sheath = exp(-x * x * 7.0);
  float halo = exp(-x * x * 2.2);
  // Kopf vorn (y ≈ 0,93), dahinter ein Nachleuchtschweif, der nach hinten weich ausläuft
  float tail = pow(y, 1.5);
  float along = tail * smoothstep(1.0, 0.965, y);
  float head = exp(-pow((y - 0.93) / 0.05, 2.0));
  vec3 c = (vec3(1.0, 0.98, 0.95) * core * (0.5 + 1.1 * tail * tail + head * 2.8) + vCol * (core * 0.6 + sheath * 0.6 + halo * 0.18)) * along;
  gl_FragColor = vec4(c, 1.0);${OUT}
}`;

// Schild als Energieblase: beim Treffer flammt die ganze Hülle am Rand auf (Fresnel), vom Einschlag läuft ein
// Wellenring über die Kugel, am Einschlag leuchtet ein Sechseck-Raster. Klingt in ≈ 0,45 s ab.
const SHIELD_VS = `
varying vec3 vL; varying vec3 vN; varying vec3 vV;
void main() {
  vL = normalize(position);
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const SHIELD_FS = `
uniform vec3 uColor; uniform float uOpacity; uniform vec3 uHit; uniform float uAge; uniform float uFull; uniform float uTime;
varying vec3 vL; varying vec3 vN; varying vec3 vV;
float hexEdge(vec2 p) {
  p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5;
  vec2 fw = fwidth(p) * 1.2;
  p = abs(fract(p) - 0.5);
  float e = max(p.x * 1.5 + p.y, p.y * 2.0);
  return smoothstep(0.47 - max(fw.x, fw.y) * 2.0, 0.5, e) * (1.0 - smoothstep(0.5, 0.56 + max(fw.x, fw.y) * 2.0, e));
}
void main() {
  vec3 h = normalize(uHit);
  vec3 t1 = normalize(cross(h, abs(h.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(h, t1);
  float edge = hexEdge(vec2(dot(vL, t1), dot(vL, t2)) * 7.0);
  float ang = acos(clamp(dot(vL, h), -1.0, 1.0));
  float age = uAge, inv = 1.0 - age, fade = inv * inv;
  float fres = pow(1.0 - clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.6);
  // Wellenring vom Einschlag aus, leicht unruhig
  float ra = age * 2.3 + sin(atan(dot(vL, t2), dot(vL, t1)) * 9.0 + uTime * 6.0) * 0.025;
  float ring = exp(-pow((ang - ra) / 0.11, 2.0)) * inv;
  float ring2 = exp(-pow((ang - ra * 0.6) / 0.07, 2.0)) * inv * 0.45;
  float core = exp(-pow(ang / 0.2, 2.0)) * fade;
  float bubble = fres * (0.14 + 0.46 * fade) * (0.5 + 0.5 * smoothstep(1.6, 0.0, ang));
  float a = bubble * (0.7 + 0.5 * edge) + (ring + ring2) * (0.75 + 0.9 * edge) + core * (1.1 + edge * 0.8);
  a = mix(a, (fres * 0.9 + 0.2 + edge * 0.5) * inv, uFull) * uOpacity;
  vec3 col = mix(uColor, vec3(1.0), clamp(core * 0.6 + ring * 0.25, 0.0, 1.0));
  gl_FragColor = vec4(col * a * 1.6, a);${OUT}
}`;

// SAB-Saugstrahl: zwei gekreuzte Flächen von Schütze (y=0) zu Ziel (y=1), Energiepakete laufen zum Schützen zurück
const BEAM_VS = `
varying vec2 vUv; varying vec3 vCol;
void main() { vUv = uv; vCol = vec3(1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FS = `
uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uLen;
varying vec2 vUv; varying vec3 vCol;
void main() {
  float y = vUv.y;
  float wob = sin(y * uLen * 0.06 + uTime * 22.0) * 0.12;
  float x = abs(vUv.x * 2.0 - 1.0 + wob);
  float core = exp(-x * x * 60.0);
  float sheath = exp(-x * x * 8.0);
  float pk = fract(y * uLen / 55.0 + uTime * 3.2);
  float pulse = smoothstep(0.0, 0.15, pk) * smoothstep(0.55, 0.15, pk);
  float ends = smoothstep(0.0, 0.04, y) * smoothstep(1.0, 0.94, y);
  vec3 c = (vec3(0.9, 0.97, 1.0) * core * (1.2 + pulse * 1.6) + uColor * sheath * (0.45 + pulse * 0.9)) * ends * uOpacity;
  gl_FragColor = vec4(c, 1.0);${OUT}
}`;

// Feuerkern: kühlt rasch über Gelb, Orange, Rot ab und zerfasert (Rauschen frisst die Ränder weg)
const FIRE_VS = `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main() {
  vP = position;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FS = `
uniform float uAge; uniform float uSeed; uniform float uK;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
vec3 heat(float t) {
  t = clamp(t, 0.0, 1.2);
  vec3 c = mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.32, 0.05), smoothstep(0.1, 0.4, t));
  c = mix(c, vec3(1.0, 0.75, 0.35), smoothstep(0.4, 0.7, t));
  c = mix(c, vec3(1.0, 0.97, 0.9), smoothstep(0.7, 1.0, t));
  return c;
}
void main() {
  float mu = abs(dot(normalize(vN), normalize(vV)));
  float n = snoise(vP * 2.0 + vec3(uSeed, uSeed * 0.3, uAge * 1.5)) * 0.5 + snoise(vP * 4.7 - vec3(uAge * 2.0, uSeed, 0.0)) * 0.3
          + snoise(vP * 11.0 + vec3(0.0, uAge * 3.0, uSeed)) * 0.2;
  float T = (1.0 - uAge) * (1.0 - uAge) * 1.15 * (0.3 + 0.7 * pow(mu, 1.5)) * (0.6 + 0.6 * n);
  float a = smoothstep(0.16, 0.46, T + n * 0.22) * smoothstep(0.05, 0.4, mu);
  vec3 c = heat(T) * (0.4 + 2.0 * T) * uK;
  gl_FragColor = vec4(c * a, a);${OUT}
}`;
// Gaswolke: dünne Hülle, nur am Rand sichtbar, kühl leuchtend, wächst lautlos
const SHELL_FS = `
uniform float uAge; uniform float uSeed; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
${NOISE}
void main() {
  float mu = abs(dot(normalize(vN), normalize(vV)));
  float n = snoise(vP * 3.2 + vec3(uSeed, 0.0, uAge * 0.6)) * 0.6 + snoise(vP * 7.5 - vec3(0.0, uSeed, 0.0)) * 0.4;
  n = n * 0.5 + 0.5;
  float fil = smoothstep(0.38, 0.85, n);
  float rim = pow(1.0 - mu, 1.6) * fil;
  float body = 0.05 * mu * fil;
  float f = (1.0 - uAge); f *= f * f;
  float a = (rim * 0.9 + body) * f * 0.75;
  vec3 col = mix(vec3(1.0, 0.55, 0.25) * 1.4, uColor, smoothstep(0.0, 0.35, uAge));
  gl_FragColor = vec4(col * a, a);${OUT}
}`;

// Raketen-Abgasband: heißer weißer Kern, orangener Rand, läuft zum Ende hin aus und wird breiter
const TRAIL_VS = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TRAIL_FS = `
uniform float uFade; uniform float uTime;
varying vec2 vUv;
void main() {
  float t = vUv.x, x = abs(vUv.y * 2.0 - 1.0);
  float core = exp(-x * x * 14.0) * pow(1.0 - t, 2.2);
  float edge = exp(-x * x * 2.6) * pow(1.0 - t, 1.3);
  float fl = 0.85 + 0.15 * sin(t * 40.0 - uTime * 50.0);
  vec3 c = vec3(1.0, 0.93, 0.82) * core * 2.0 + vec3(1.0, 0.42, 0.12) * edge * 0.75 * fl;
  float a = clamp(edge + core, 0.0, 1.0) * uFade;
  gl_FragColor = vec4(c * uFade, a);${OUT}
}`;
const TRAIL_N = 24;

// Ionenspur hinter dem Spielerschiff: Band aus den letzten Positionen, blendet über 0,5 s aus
const ION_N = 48;
const ION_VS = `
attribute float aA; attribute float aX;
varying float vA; varying float vX;
void main() { vA = aA; vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ION_FS = `
uniform vec3 uColor; varying float vA; varying float vX;
void main() {
  float x = abs(vX);
  float a = vA * (exp(-x * x * 5.0) * 0.55 + exp(-x * x * 40.0) * 0.8);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), exp(-x * x * 40.0) * 0.5) * a, a);${OUT}
}`;

const SCREEN_VS = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const SCREEN_FS = `uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor = vec4(uColor, uOpacity); }`;

// Trümmerformen (Einheitsgröße ≈ 1), Attribut aEdge = 1 an Risskanten
function debrisGeometries() {
  const out = [];
  // gezackte Rumpfplatte
  const sh = new THREE.Shape();
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, k = i % 2 ? 0.62 : 1.0 - (i % 3) * 0.12;
    const x = Math.cos(a) * 1.1 * k, y = Math.sin(a) * 0.75 * k;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  let plate = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }).translate(0, 0, -0.07);
  plate = plate.index ? plate.toNonIndexed() : plate;
  plate.computeVertexNormals();
  const pn = plate.attributes.normal, pe = new Float32Array(pn.count);
  for (let i = 0; i < pn.count; i++) pe[i] = Math.abs(pn.getZ(i)) < 0.5 ? 1 : 0;
  plate.setAttribute('aEdge', new THREE.BufferAttribute(pe, 1));
  out.push(plate);
  // abgerissenes Rohrstück (ein Ende glüht)
  let rod = new THREE.CylinderGeometry(0.16, 0.16, 2.2, 7, 2, false);
  rod = rod.toNonIndexed();
  const rp = rod.attributes.position, re = new Float32Array(rp.count);
  for (let i = 0; i < rp.count; i++) re[i] = rp.getY(i) > 0.5 ? 1 : 0;
  rod.setAttribute('aEdge', new THREE.BufferAttribute(re, 1));
  out.push(rod);
  // Düsenring mit glühender Kante
  let noz = new THREE.CylinderGeometry(0.45, 0.8, 0.8, 12, 1, true);
  noz = noz.toNonIndexed();
  const np = noz.attributes.position, ne = new Float32Array(np.count);
  for (let i = 0; i < np.count; i++) ne[i] = np.getY(i) < -0.3 ? 1 : 0;
  noz.setAttribute('aEdge', new THREE.BufferAttribute(ne, 1));
  out.push(noz);
  for (const g of out) { g.deleteAttribute('uv'); g.computeBoundingSphere(); }
  return out;
}

// Bolzen bewusst langsamer als „echt“, damit jeder Schuss mehrere Bilder lang lesbar ist (≈ 0,25 s auf 400 m),
// mit Nachleuchtschweif, dessen Länge ans Tempo gekoppelt ist (≈ 110 m), und kurzem Nachglühen am Einschlag.
const BOLT_SPEED = 1700;
const BOLT_LEN = BOLT_SPEED * 0.065;
const BOLT_LINGER = 0.11;
const FLASHES = 40, RINGS = 14, BLASTS = 10;

export class Effects {
  constructor(scene, host) {
    this.scene = scene;
    this.host = host; // Renderer: getPos(id,out), getRadius(id), getMuzzle(id,laser,out), entity(id), playerPos(out), shake(a)
    this.group = new THREE.Group();
    this.group.name = 'effects';
    scene.add(this.group);
    this.glowP = new Particles(7000, true);
    this.smokeP = new Particles(1600, false);
    this.sparks = new Sparks(2400);
    this.group.add(this.smokeP.points, this.glowP.points, this.sparks.lines);
    this.time = 0;
    this.density = 1;
    const uTime = host.factory.uTime;

    // Bolzen
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
      0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5,
    ]), 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2));
    bg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    this.boltGeo = bg;
    this.boltMat = new THREE.ShaderMaterial({
      vertexShader: BOLT_VS, fragmentShader: BOLT_FS,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.boltPool = new InstancePool(this.boltGeo, this.boltMat, 256);
    this.boltPool.mesh.renderOrder = 21;
    this.group.add(this.boltPool.mesh);
    this.bolts = [];
    for (let i = 0; i < 256; i++) this.bolts.push({
      on: false, sx: 0, sy: 0, sz: 0, hx: 0, hy: 0, hz: 0, ex: 0, ey: 0, ez: 0, dx: 0, dy: 0, dz: 0,
      to: null, hit: false, miss: false, traveled: 0, total: 0, color: new THREE.Color(), thick: 1, age: 0, fade: 1, ox: 0, oz: 0, sab: false, lin: 0,
    });

    // Trümmer: dunkles Metall, glühende Kanten kühlen ab (Instanzfarbe = Hitze)
    // Trümmer: echte Rumpfteile (gezackte Platte, abgerissenes Rohr, Düsenring), Glut nur an den Risskanten
    this.debrisGeos = debrisGeometries();
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x5a5856, metalness: 0.8, roughness: 0.42, emissive: 0xff5a10, emissiveIntensity: 0, flatShading: true, side: THREE.DoubleSide });
    this.debrisMat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aEdge; varying float vEdge;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEdge = aEdge;');
      sh.fragmentShader = 'varying float vEdge;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
          float hotK = clamp(1.0 - vColor.g, 0.0, 1.0);
          float edgeK = smoothstep(0.2, 1.0, vEdge);
          totalEmissiveRadiance = vec3(1.0, 0.36, 0.08) * hotK * hotK * 7.0 * (0.06 + 0.94 * edgeK);
          diffuseColor.rgb = vec3(0.2, 0.2, 0.21) * (0.45 + vColor.r * 0.55);
        #endif`);
    };
    this.debrisPools = this.debrisGeos.map((g) => new InstancePool(g, this.debrisMat, 120));
    this.debris = this.debrisPools[0];
    for (const p of this.debrisPools) this.group.add(p.mesh);
    this.chunks = [];
    for (let i = 0; i < 320; i++) this.chunks.push({ kind: i % 3, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, s: 1, life: 0, max: 1, acc: 0, goo: false, burn: 0 });
    // Schwarm-Fetzen: nasses, grünes Gewebe (glänzend, leicht selbstleuchtend), Instanzfarbe = Frische
    this.gooGeo = new THREE.IcosahedronGeometry(1, 0).scale(1.3, 0.45, 0.9);
    this.gooGeo.deleteAttribute('uv');
    this.gooMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.05, roughness: 0.22, emissive: 0x2a9a2a, emissiveIntensity: 0.9, flatShading: true });
    this.gooPool = new InstancePool(this.gooGeo, this.gooMat, 140);
    this.group.add(this.gooPool.mesh);

    // Blitze (Sprites) und flache Ringe (Beute, Falle, Ankunft)
    const glowTex = getGlowTexture(), ringTex = getRingTexture();
    this.flashes = [];
    for (let i = 0; i < FLASHES; i++) {
      const m = new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 22; this.group.add(s);
      this.flashes.push({ s, m, t: 0, dur: 1, size: 1, col: new THREE.Color(), follow: null, on: false, rise: false });
    }
    this.ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.MeshBasicMaterial({ map: ringTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide });
      const r = new THREE.Mesh(this.ringGeo, m); r.visible = false; r.renderOrder = 18; this.group.add(r);
      this.rings.push({ r, m, t: 0, dur: 1, from: 1, to: 2, col: new THREE.Color(), on: false, follow: null, alpha: 1 });
    }

    // Explosionen: Feuerkern + Gaswolke
    this.blastGeo = new THREE.SphereGeometry(1, 40, 24);
    this.fireBase = new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 0 }, uSeed: { value: 0 }, uK: { value: 1 } },
      vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.shellBase = new THREE.ShaderMaterial({
      uniforms: { uAge: { value: 0 }, uSeed: { value: 0 }, uColor: { value: new THREE.Color(0.32, 0.36, 0.44) } },
      vertexShader: FIRE_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.blasts = [];
    for (let i = 0; i < BLASTS + 8; i++) {
      const fm = this.fireBase.clone(), sm = this.shellBase.clone();
      const fire = new THREE.Mesh(this.blastGeo, fm); fire.visible = false; fire.renderOrder = 23;
      const shell = new THREE.Mesh(this.blastGeo, sm); shell.visible = false; shell.renderOrder = 18;
      this.group.add(fire, shell);
      this.blasts.push({ fire, shell, fm, sm, on: false, t: 0, size: 1, x: 0, z: 0 });
    }

    // Schildblasen
    this.shieldGeo = new THREE.SphereGeometry(1, 40, 24);
    this.shieldBase = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(SHIELD_COLOR) }, uOpacity: { value: 0 }, uHit: { value: new THREE.Vector3(0, 0, -1) }, uAge: { value: 0 }, uFull: { value: 0 }, uTime },
      vertexShader: SHIELD_VS, fragmentShader: SHIELD_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.shields = [];
    for (let i = 0; i < 16; i++) {
      const m = this.shieldBase.clone(); m.uniforms.uTime = uTime;
      const mesh = new THREE.Mesh(this.shieldGeo, m); mesh.visible = false; mesh.renderOrder = 17; this.group.add(mesh);
      this.shields.push({ mesh, m, id: null, t: 0, dur: 0.5, on: false, r: 30 });
    }

    // Raketen: schlanker Körper, heiße Düse, Abgasstrahl
    this.rocketGeo = new THREE.CylinderGeometry(0.55, 0.8, 7, 10).rotateX(Math.PI / 2);
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.7, roughness: 0.3 });
    this.rocketFlame = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(1.0, 0.75, 0.45).multiplyScalar(3.0), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.rockets = [];
    this.trailBase = new THREE.ShaderMaterial({
      uniforms: { uFade: { value: 0 }, uTime: uTime },
      vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const tIdx = [];
    for (let k = 0; k < TRAIL_N - 1; k++) { const a = k * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const tUv = new Float32Array(TRAIL_N * 4);
    for (let k = 0; k < TRAIL_N; k++) { const u = k / (TRAIL_N - 1); tUv.set([u, 0, u, 1], k * 4); }
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      const fl = new THREE.Sprite(this.rocketFlame); fl.position.z = -4.5; fl.scale.setScalar(10); mesh.add(fl);
      mesh.visible = false; this.group.add(mesh);
      const tg = new THREE.BufferGeometry();
      const tp = new THREE.BufferAttribute(new Float32Array(TRAIL_N * 6), 3).setUsage(THREE.DynamicDrawUsage);
      tg.setAttribute('position', tp);
      tg.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
      tg.setIndex(tIdx);
      const tm = this.trailBase.clone(); tm.uniforms.uTime = uTime;
      const trail = new THREE.Mesh(tg, tm);
      trail.frustumCulled = false; trail.visible = false; trail.renderOrder = 19;
      this.group.add(trail);
      this.rockets.push({
        mesh, on: false, t: 0, dur: 0.6, sx: 0, sz: 0, cx: 0, cz: 0, ex: 0, ez: 0, to: null, acc: 0, px: 0, pz: 0,
        trail, tg, tp, tm, hist: new Float32Array(TRAIL_N * 3), hn: 0, fade: 0,
      });
    }

    // SAB-Saugstrahlen
    this.beamBase = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.35, 0.7, 1.6) }, uOpacity: { value: 0 }, uTime, uLen: { value: 100 } },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    this.beams = [];
    for (let i = 0; i < 8; i++) {
      const m = this.beamBase.clone(); m.uniforms.uTime = uTime;
      const mesh = new THREE.Mesh(this.boltGeo, m);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 21;
      this.group.add(mesh);
      this.beams.push({ mesh, m, on: false, t: 0, dur: 0.45, from: null, to: null, acc: 0 });
    }
    // Schüsse mehrerer Laser im selben Bild leicht versetzt abfeuern (Salve statt Klumpen)
    this.shotQ = [];
    for (let i = 0; i < 48; i++) this.shotQ.push({ on: false, t: 0, from: null, to: null, laser: null, ammo: null, hit: false, dx: 0, dz: 0, has: false, slot: -1, hx: 0, hz: 0, hp: false });
    this._lastShotFrom = null; this._lastShotT = -1; this._shotN = 0;
    // Zeitgeber (Explosionsfolgen)
    this.timers = [];
    for (let i = 0; i < 64; i++) this.timers.push({ on: false, t: 0, kind: 0, x: 0, z: 0, size: 1, a: 0, b: 0 });

    // Punktlichter: feste Anzahl (nie neue Lichter → keine Shader-Neuübersetzung)
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc890, 0, 900, 1.3);
      l.position.set(0, -99999, 0);
      this.group.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0, on: false });
    }
    this.lightNext = 0;

    // Sprung-Ladung
    this.jump = { on: false, t: 0, dur: 3, acc: 0, ang: 0 };
    this.jumpRing = this.rings[RINGS - 1]; // reserviert (bleibt unsichtbar)
    this.jumpGlow = this.flashes[FLASHES - 1];
    this.jumpSegGeo = new THREE.RingGeometry(0.88, 1.06, 192, 1).rotateX(-Math.PI / 2);
    this.jumpSegs = [];
    const SEG = [[16, 0.28, 64], [36, 0.5, 98], [8, 0.12, 134]];
    for (const [n, gap, r] of SEG) {
      const m = segRingMaterial(0xa8e4ff, n, gap);
      const mesh = new THREE.Mesh(this.jumpSegGeo, m);
      mesh.visible = false; mesh.renderOrder = 18; mesh.scale.setScalar(r);
      this.group.add(mesh);
      this.jumpSegs.push({ mesh, m, r });
    }
    // Austritt aus dem Sprung: radiale Streckung im Kamera-Durchgang (Renderer liest warp)
    this.warp = 0; this.warpT = 1; this.arrT = 9;

    // Vollbild-Fläche (Sprungblitz / Einblendung)
    this.screenMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      vertexShader: SCREEN_VS, fragmentShader: SCREEN_FS,
      transparent: true, depthTest: false, depthWrite: false,
    });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.screenMat);
    this.screen.frustumCulled = false; this.screen.renderOrder = 10000; this.screen.visible = false;
    scene.add(this.screen);
    this.fade = { t: 0, dur: 1, from: 0, on: false, pow: 2 };

    this.pendingTo = new Map(); // id → laufende Bolzen (für Schildblase)

    // Ionenspur
    this.ion = { x: new Float32Array(ION_N), y: new Float32Array(ION_N), z: new Float32Array(ION_N), t: new Float32Array(ION_N), k: new Float32Array(ION_N), n: 0, last: -9, w: 6 };
    const ig = this.ionGeo = new THREE.BufferGeometry();
    this.ionPos = new THREE.BufferAttribute(new Float32Array(ION_N * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.ionA = new THREE.BufferAttribute(new Float32Array(ION_N * 2), 1).setUsage(THREE.DynamicDrawUsage);
    const ix = new Float32Array(ION_N * 2);
    for (let k = 0; k < ION_N; k++) { ix[k * 2] = -1; ix[k * 2 + 1] = 1; }
    ig.setAttribute('position', this.ionPos); ig.setAttribute('aA', this.ionA); ig.setAttribute('aX', new THREE.BufferAttribute(ix, 1));
    const iIdx = [];
    for (let k = 0; k < ION_N - 1; k++) { const a = k * 2; iIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    ig.setIndex(iIdx);
    this.ionMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.6, 0.85, 1.0) } }, vertexShader: ION_VS, fragmentShader: ION_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.ionMesh = new THREE.Mesh(ig, this.ionMat);
    this.ionMesh.frustumCulled = false; this.ionMesh.renderOrder = 16; this.ionMesh.visible = false;
    this.group.add(this.ionMesh);
  }

  // Renderer meldet jedes Bild die Heckposition des Spielers, Tempo-Anteil k (0..1), Breite w und Farbe
  ionTrail(x, y, z, k, w, hex) {
    const I = this.ion;
    if (I.hex !== hex) { I.hex = hex; this.ionMat.uniforms.uColor.value.setHex(hex).multiplyScalar(1.4); }
    I.w = w;
    const moved = I.n === 0 || (x - I.x[0]) ** 2 + (z - I.z[0]) ** 2 > 9;
    if (moved || this.time - I.last > 0.08) {
      for (let i = Math.min(I.n, ION_N - 1); i > 0; i--) { I.x[i] = I.x[i - 1]; I.y[i] = I.y[i - 1]; I.z[i] = I.z[i - 1]; I.t[i] = I.t[i - 1]; I.k[i] = I.k[i - 1]; }
      if (I.n < ION_N) I.n++;
      I.last = this.time;
    }
    I.x[0] = x; I.y[0] = y; I.z[0] = z; I.t[0] = this.time; I.k[0] = k;
  }
  // Aufblitzen der Triebwerke beim Beschleunigen
  boost(x, y, z, size, hex) { this._flash(x, y, z, 26 * size, 0.18, hex, 2.2, null); }

  _ionUpdate() {
    const I = this.ion;
    if (I.n < 2) { this.ionMesh.visible = false; return; }
    const P = this.ionPos.array, A = this.ionA.array;
    let any = false;
    for (let k = 0; k < ION_N; k++) {
      const i = Math.min(k, I.n - 1), a = Math.max(0, i - 1), b = Math.min(I.n - 1, i + 1);
      let tx = I.x[a] - I.x[b], tz = I.z[a] - I.z[b];
      const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const age = this.time - I.t[i];
      const f = Math.max(0, 1 - age / 0.5);
      const al = k < I.n ? f * f * I.k[i] : 0;
      if (al > 0.01) any = true;
      const w = I.w * (0.55 + 0.45 * f);
      P[k * 6] = I.x[i] - tz * w; P[k * 6 + 1] = I.y[i]; P[k * 6 + 2] = I.z[i] + tx * w;
      P[k * 6 + 3] = I.x[i] + tz * w; P[k * 6 + 4] = I.y[i]; P[k * 6 + 5] = I.z[i] - tx * w;
      A[k * 2] = al; A[k * 2 + 1] = al;
    }
    this.ionPos.needsUpdate = true; this.ionA.needsUpdate = true;
    this.ionMesh.visible = any;
  }

  // Für das Aufwärmen beim Sektoraufbau: jedes Pool-Objekt einmal sichtbar an (x, z), je ein Teilchen je System
  warm(x, z) {
    for (const f of this.flashes) { f.s.position.set(x, 4, z); f.s.scale.setScalar(30); f.s.visible = true; }
    for (const r of this.rings) { r.r.position.set(x, 1, z); r.r.scale.setScalar(30); r.r.visible = true; }
    for (const s of this.shields) { s.mesh.position.set(x, 4, z); s.mesh.scale.setScalar(30); s.mesh.visible = true; }
    for (const b of this.blasts) { b.fire.position.set(x, 4, z); b.shell.position.set(x, 4, z); b.fire.scale.setScalar(30); b.shell.scale.setScalar(30); b.fire.visible = true; b.shell.visible = true; }
    for (const r of this.rockets) { r.mesh.position.set(x, 4, z); r.mesh.visible = true; r.trail.visible = true; }
    for (const j of this.jumpSegs) { j.mesh.position.set(x, 2, z); j.mesh.visible = true; }
    for (const bm of this.beams) { bm.mesh.position.set(x, 4, z); bm.mesh.scale.setScalar(20); bm.mesh.visible = true; }
    this.screen.visible = true; this.screenMat.uniforms.uOpacity.value = 0;
    this.ionMesh.visible = true;
    this.glowP.emit(x, 4, z, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
    this.smokeP.emit(x, 4, z, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0);
    this.sparks.emit(x, 4, z, 1, 0, 0, 0, 0, 0, 1, 0, 0.01);
    this.glowP.update(0); this.smokeP.update(0); this.sparks.update(0);
    _m.compose(_v.set(x, 4, z), _q.identity(), _s.set(1, 1, 1));
    _c.setRGB(0, 0, 0);
    this.boltPool.begin(); this.boltPool.push(_m, _c); this.boltPool.end();
    for (const p of this.debrisPools) { p.begin(); p.push(_m, _c); p.end(); }
    this.gooPool.begin(); this.gooPool.push(_m, _c); this.gooPool.end();
  }

  // Stufe: Teilchenmenge und Zahl der Punktlichter (jedes Licht kostet in jedem beleuchteten Pixel; schwache
  // Grafik: 1 bzw. 2 statt 4). Unsichtbare Lichter zählen in three.js nicht mit. Die Zahl ändert sich nur mit der
  // Stufe; der Renderer baut danach ohnehin neu auf und übersetzt alles vor (kein Ruckler im Kampf).
  setQuality(q) {
    this.density = q >= 2 ? 1 : q === 1 ? 0.6 : 0.35; this.quality = q;
    // HOCH 3 statt 4 Punktlichter: jedes kostet in jedem beleuchteten Pixel (Verfolger: Schiff und Brocken bildfüllend)
    this.nLights = q >= 3 ? 4 : q === 2 ? 3 : q === 1 ? 2 : 1;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      L.l.visible = i < this.nLights;
      if (i >= this.nLights) { L.on = false; L.l.intensity = 0; }
    }
    this.lightNext = 0;
  }
  setPointScale(s, pr = 2) {
    // ≈ 180 CSS-px (ULTRA 210): im Verfolger liegen Explosionen nah an der Kamera, große Rauchbälle kosteten Füllrate
    const mx = Math.max(150, (this.quality >= 3 ? 210 : 180) * pr);
    for (const P of [this.glowP, this.smokeP]) { P.mat.uniforms.uScale.value = s; P.mat.uniforms.uMaxPx.value = mx; }
  }
  _n(n) { return Math.max(1, Math.round(n * this.density)); }

  // ---------- Auslöser ----------
  shot(p) {
    if (!p) return;
    // Mehrere Laser desselben Schützen im selben Bild: je Laser ≈ 55 ms versetzt
    if (p.from === this._lastShotFrom && this.time === this._lastShotT) this._shotN++;
    else { this._shotN = 0; this._lastShotFrom = p.from; this._lastShotT = this.time; }
    const delay = this._shotN * 0.055;
    const hp = typeof p.x === 'number' && typeof p.z === 'number';
    const slot = typeof p.idx === 'number' ? p.idx : -1;
    if (delay <= 0) { this._fire(p.from, p.to, p.laser, p.ammo, !!p.hit, p.dx, p.dz, slot, hp ? p.x : undefined, hp ? p.z : undefined); return; }
    for (let i = 0; i < this.shotQ.length; i++) {
      const q = this.shotQ[i];
      if (q.on) continue;
      q.on = true; q.t = delay; q.from = p.from; q.to = p.to; q.laser = p.laser; q.ammo = p.ammo; q.hit = !!p.hit;
      q.has = typeof p.dx === 'number' && typeof p.dz === 'number'; q.dx = q.has ? p.dx : 0; q.dz = q.has ? p.dz : 0;
      q.slot = slot; q.hp = hp; q.hx = hp ? p.x : 0; q.hz = hp ? p.z : 0;
      return;
    }
    this._fire(p.from, p.to, p.laser, p.ammo, !!p.hit, p.dx, p.dz, slot, hp ? p.x : undefined, hp ? p.z : undefined);
  }
  _fire(from, to, laser, ammo, hit, ix, iz, slot = -1, hx, hz) {
    const H = this.host;
    if (ammo === 'SAB') { this._beam(from, to, laser, hit, slot); return; }
    let b = null;
    for (let i = 0; i < this.bolts.length; i++) if (!this.bolts[i].on) { b = this.bolts[i]; break; }
    if (!b) return;
    if (!H.getPos(to, _w)) return;
    if (!H.getMuzzle(from, laser, _v, slot)) return;
    const fromE = H.entity(from);
    let hex = LASERS[laser]?.color;
    const drone = laser === 'drone'; // Drohnenlaser: Triebwerkslicht der Fraktion, etwas schlanker
    if (hex === undefined) hex = drone ? H.drones.boltHex() : (fromE && ENEMIES[fromE.type]?.accent) ?? 0xff4a4a;
    b.color.setHex(hex);
    b.thick = 1;
    b.sab = false;
    b.sal = ammo === 'SAL';
    if (b.sal) { b.thick = 2.4; b.color.lerp(_c.setRGB(1, 1, 1), 0.25); }
    else if (ammo === 'L3' || ammo === 'L4') b.thick = 1.25;
    if (drone) b.thick *= 0.8;
    // Gegnerschüsse kräftiger in Gegnerfarbe, damit sie im Gefecht sichtbar sind
    const foe = !!fromE && fromE.kind !== 'player';
    if (foe) b.thick = Math.max(b.thick, 1.35);
    const ammoBoost = (ammo === 'L2' ? 1.12 : ammo === 'L3' ? 1.25 : ammo === 'L4' ? 1.4 : ammo === 'SAL' ? 1.8 : 1) * (foe ? 1.2 : 1);
    b.color.multiplyScalar(3.2 * ammoBoost);
    b.on = true; b.age = 0; b.fade = 1; b.traveled = 0; b.lin = 0;
    b.sx = b.hx = _v.x; b.sy = b.hy = _v.y; b.sz = b.hz = _v.z;
    b.to = to; b.hit = hit; b.miss = !hit;
    b.from = from;
    b.ix = typeof ix === 'number' ? ix : null; b.iz = typeof iz === 'number' ? iz : null;
    const toE = H.entity(to);
    if (typeof hx === 'number' && toE) {
      // Trefferpunkt der Simulation: Bolzen treffen verschiedene Stellen am Rumpf, Fehlschüsse fliegen vorbei
      const k = b.miss ? (H.visualRadius(to) || 20) / Math.max(1, toE.radius || 20) : 1;
      b.ox = (hx - (toE.x || 0)) * k; b.oz = (hz - (toE.z || 0)) * k;
    } else if (b.miss) {
      const side = rand() < 0.5 ? -1 : 1, r = (H.getRadius(to) || 20) * ENEMY_VIS;
      const dx = _w.x - _v.x, dz = _w.z - _v.z, d = Math.hypot(dx, dz) || 1;
      b.ox = (-dz / d) * side * (r * 1.4 + 20 + rand() * 30);
      b.oz = (dx / d) * side * (r * 1.4 + 20 + rand() * 30);
    } else { b.ox = 0; b.oz = 0; }
    this._aim(b, _w);
    if (b.hit) this.pendingTo.set(to, (this.pendingTo.get(to) || 0) + 1);
    // Mündungsblitz: greller Punkt, kurzer Stern nach vorn, Funken, beim SAL deutlich wuchtiger
    const cr = b.color.r / (3.2 * ammoBoost), cg = b.color.g / (3.2 * ammoBoost), cb = b.color.b / (3.2 * ammoBoost);
    const mpp = H.metersPerPixel ? H.metersPerPixel() : 0.4;
    this._flash(_v.x, _v.y, _v.z, Math.max(26, 60 * mpp) * b.thick, b.sal ? 0.16 : 0.09, 0xffffff, b.sal ? 3.2 : 2.2, null, cr, cg, cb);
    this._flash(_v.x + b.dx * 10 * b.thick, _v.y, _v.z + b.dz * 10 * b.thick, Math.max(16, 34 * mpp) * b.thick, 0.06, 0xffffff, 1.4, null, cr, cg, cb);
    const ns = this._n(b.sal ? 16 : 6);
    for (let i = 0; i < ns; i++) {
      const sp = 300 + rand() * (b.sal ? 900 : 500);
      this.sparks.emit(_v.x, _v.y, _v.z, (b.dx + (rand() - 0.5) * 0.5) * sp, (rand() - 0.3) * 60, (b.dz + (rand() - 0.5) * 0.5) * sp,
        1.2 + cr, 1.0 + cg, 0.8 + cb, 0.07 + rand() * 0.06, 2, 0.02);
    }
    this.glowP.emit(_v.x, _v.y, _v.z, b.dx * 80, 0, b.dz * 80, cr * 1.6, cg * 1.6, cb * 1.6, 1, 9 * b.thick, 3, 0.1, 6);
    if (b.sal) {
      // SAL: Rückstoßwelle an der Mündung, Kamera ruckt
      this._ring(_v.x, _v.z, 4, 46, 0.25, 0xffffff, 0.9, null);
      this.glowP.emit(_v.x, _v.y, _v.z, b.dx * 140, 0, b.dz * 140, cr * 2.4, cg * 2.4, cb * 2.4, 1, 30, 8, 0.2, 4);
      if (from === 'player') { this.host.shake(4); this.host.recoil?.(from, 0.9); }
    }
  }
  // SAB: Saugstrahl zwischen Schütze und Ziel, Schildenergie fließt als Lichtpakete zurück
  _beam(from, to, laser, hit, slot = -1) {
    const H = this.host;
    if (!H.getPos(to, _w) || !H.getMuzzle(from, laser, _v, slot)) return;
    let bm = null;
    for (let i = 0; i < this.beams.length; i++) if (!this.beams[i].on || (this.beams[i].from === from && this.beams[i].to === to)) { bm = this.beams[i]; break; }
    if (!bm) return;
    const fresh = !bm.on;
    bm.on = true; bm.t = fresh ? 0 : Math.min(bm.t, 0.08); bm.dur = 0.5; bm.from = from; bm.to = to; bm.hit = hit;
    bm.mesh.visible = true;
    this._flash(_v.x, _v.y, _v.z, 30, 0.12, 0x9fd8ff, 2.0, null);
    if (hit) {
      const e = H.entity(to);
      if (e && e.shield > 0) this._shield(to, 0.5, _v.x - _w.x, 0, _v.z - _w.z, false);
      H.flinch?.(to, _w.x - _v.x, _w.z - _v.z, 0.25);
    }
  }
  _aim(b, target) {
    let ex = target.x + b.ox, ey = target.y, ez = target.z + b.oz;
    let dx = ex - b.hx, dy = ey - b.hy, dz = ez - b.hz;
    let d = Math.hypot(dx, dy, dz) || 1;
    if (b.miss) { ex += dx / d * 260; ez += dz / d * 260; dx = ex - b.hx; dz = ez - b.hz; d = Math.hypot(dx, dy, dz) || 1; }
    b.ex = ex; b.ey = ey; b.ez = ez;
    b.dx = dx / d; b.dy = dy / d; b.dz = dz / d;
    b.remain = d;
  }

  rocket(p) {
    const H = this.host;
    let r = null;
    for (let i = 0; i < this.rockets.length; i++) if (!this.rockets[i].on) { r = this.rockets[i]; break; }
    if (!r || !H.getPos(p.from, _v) || !H.getPos(p.to, _w)) return;
    r.on = true; r.t = 0; r.dur = 0.6; r.to = p.to; r.acc = 0;
    r.sx = _v.x; r.sz = _v.z; r.ex = _w.x; r.ez = _w.z;
    const dx = _w.x - _v.x, dz = _w.z - _v.z, d = Math.hypot(dx, dz) || 1, side = rand() < 0.5 ? -1 : 1;
    r.cx = (_v.x + _w.x) / 2 - dz / d * side * d * 0.35;
    r.cz = (_v.z + _w.z) / 2 + dx / d * side * d * 0.35;
    r.px = r.sx; r.pz = r.sz;
    r.hn = 0; r.fade = 1; r.trail.visible = false; r.tm.uniforms.uFade.value = 1;
    r.mesh.visible = true;
    r.mesh.position.set(r.sx, 4, r.sz);
    this._flash(_v.x, 6, _v.z, 26, 0.12, 0xffd8a0, 2.2, null);
  }

  // Zerstörung als Sequenz (≈ 0,35 s Vorlauf, dann Hauptexplosion, Nachglühen bis ≈ 3 s):
  //   1) Aufglühen: heißer Kern wächst und flackert am Schiff (Renderer lässt das Modell dabei zittern)
  //   2) Sekundärexplosionen: zwei bis vier kleine Feuerbälle mit Funken versetzt am Rumpf
  //   3) Hauptblitz mit Licht, Feuerkern, Schockwelle, Trümmer mit Drehung, Glut
  //   4) nachglühende Gaswolke in Kühlfarben, Rauch
  // style: 'metal' (Piraten, Frachter: Trümmer, Feuer), 'swarm' (Aliens: grüner Schleim, Fetzen, Säurenebel), 'ship'
  explode(p, style = 'metal') {
    if (!p) return;
    const size = Math.max(0.5, Math.min(4, p.size || 1));
    const x = p.x ?? 0, z = p.z ?? 0;
    const r = Math.max(14, this.host.visualRadius ? this.host.visualRadius(p.id) || 0 : 0) || 20 * Math.sqrt(size);
    if (style === 'swarm') { this._gooStart(x, z, size, r); return; }
    const pre = 0.33;
    // Aufglühen
    this._flash(x, 10, z, Math.max(60, r * 2.4) * Math.sqrt(size), pre + 0.05, 0xffb070, 2.4, null, undefined, undefined, undefined, true);
    this._flash(x, 12, z, Math.max(30, r * 1.2), pre, 0xfff4e0, 2.0, null, undefined, undefined, undefined, true);
    const n2 = Math.min(4, 2 + Math.round(size));
    for (let i = 0; i < n2; i++) {
      const a = rand() * Math.PI * 2, d = r * (0.25 + rand() * 0.55);
      this._timer(0.02 + (i / n2) * (pre - 0.06) + rand() * 0.03, 1, x + Math.cos(a) * d, z + Math.sin(a) * d, size, a, 0);
    }
    this._timer(pre, 2, x, z, size, 0, r);
  }
  // kleine Sekundärexplosion am Rumpf
  _pop(x, z, size, a) {
    const y = 8;
    this._flash(x, y, z, 70 * Math.sqrt(size), 0.16, 0xffd8a8, 2.8, null);
    this._blast(x, z, 0.32 * size, 0, true);
    const ns = this._n(14);
    for (let i = 0; i < ns; i++) {
      const b = a + (rand() - 0.5) * 1.6, sp = 160 + rand() * 360;
      this.sparks.emit(x, y, z, Math.cos(b) * sp, (rand() - 0.2) * 90, Math.sin(b) * sp, 3, 2.2, 1.2, 0.15 + rand() * 0.25, 2, 0.02);
    }
    for (let i = 0; i < this._n(5); i++) {
      const b = a + (rand() - 0.5) * 1.2, sp = 40 + rand() * 90;
      this.glowP.emit(x, y, z, Math.cos(b) * sp, rand() * 20, Math.sin(b) * sp, 2.4, 1.0, 0.35, 0.8, 14, 34, 0.45 + rand() * 0.3, 1.5);
    }
    this.host.shake(1.2);
  }
  _mainBlast(x, z, size, r) {
    const y = 4;
    const ss = Math.sqrt(size);
    const mpp = this.host.metersPerPixel ? this.host.metersPerPixel() : 0.5;
    // Hauptblitz: weißer Kern (kurz) und warmer Hof (länger), am Bildschirm mindestens ≈ 150 px
    this._flash(x, y + 6, z, Math.max(130 * ss, 320 * mpp), 0.18, 0xf6f8ff, 4.0, null);
    this._flash(x, y + 6, z, Math.max(80 * ss, 220 * mpp), 1.0, 0xffb070, 1.7, null);
    this._light(x, z, size * 1.2);
    this._blast(x, z, size, mpp);
    // Schockwelle: scharfer heller Ring und breiter, weicher Druckring
    this._ring(x, z, 6 * ss, Math.max(140 * ss, 190 * mpp), 0.5, 0xc8dcff, 0.85, null);
    this._ring(x, z, 10 * ss, Math.max(200 * ss, 240 * mpp), 0.9, 0x6a8cff, 0.3, null);
    // Gasballen: weiche Feuerbälle treiben nach außen und verglühen
    const nb = this._n(16 * size);
    for (let i = 0; i < nb; i++) {
      const a = rand() * Math.PI * 2, sp = (25 + rand() * 100) * ss, k = 0.7 + rand() * 0.6;
      this.glowP.emit(x + Math.cos(a) * 6, y + rand() * 6, z + Math.sin(a) * 6, Math.cos(a) * sp, (rand() - 0.3) * 30, Math.sin(a) * sp,
        2.2 * k, 0.95 * k, 0.32 * k, 0.75, (18 + rand() * 16) * ss, (60 + rand() * 40) * ss, 0.55 + rand() * 0.6, 1.6);
    }
    // nachglühende Gaswolke: kühle, schwach leuchtende Schwaden, die lange stehen bleiben
    // (wenige große statt vieler: jede Schwade deckt bis zu einem Fünftel des Bildes, Überzeichnung kostet)
    const ng2 = this._n(4 * size);
    for (let i = 0; i < ng2; i++) {
      const a = rand() * Math.PI * 2, d = rand() * r, sp = (8 + rand() * 30) * ss, k = 0.075 + rand() * 0.06;
      const warm = rand() < 0.35;
      this.glowP.emit(x + Math.cos(a) * d, y - 4 + rand() * 8, z + Math.sin(a) * d, Math.cos(a) * sp, 0, Math.sin(a) * sp,
        warm ? 1.4 * k * 3 : 0.45 * k * 3, warm ? 0.55 * k * 3 : 0.55 * k * 3, warm ? 0.3 * k * 3 : 1.1 * k * 3, 0.5,
        (26 + rand() * 20) * ss, (70 + rand() * 40) * ss, 2.0 + rand() * 1.2, 0.4);
    }
    // Rauch
    const nd = this._n(8 * size);
    for (let i = 0; i < nd; i++) {
      const a = rand() * Math.PI * 2, sp = (18 + rand() * 60) * ss;
      const g = 0.07 + rand() * 0.05;
      this.smokeP.emit(x + (rand() - 0.5) * 20, y + rand() * 8, z + (rand() - 0.5) * 20, Math.cos(a) * sp, 4 + rand() * 10, Math.sin(a) * sp,
        g * 1.25, g * 1.0, g * 0.85, 0.62, (26 + rand() * 18) * ss, (110 + rand() * 60) * ss, 1.8 + rand() * 1.2, 0.5);
    }
    // Glut
    const ng = this._n(40 * size);
    for (let i = 0; i < ng; i++) {
      const a = rand() * Math.PI * 2, sp = (80 + rand() * 340) * ss;
      this.glowP.emit(x, y, z, Math.cos(a) * sp, (rand() - 0.3) * 60, Math.sin(a) * sp,
        2.8, 1.5, 0.5, 1, (4 + rand() * 4) * ss, 1.2, 0.6 + rand() * 0.9, 1.2);
    }
    const ns = this._n(16 * size);
    for (let i = 0; i < ns; i++) {
      const a = rand() * Math.PI * 2, sp = (260 + rand() * 420) * ss;
      this.sparks.emit(x, y, z, Math.cos(a) * sp, (rand() - 0.3) * 50, Math.sin(a) * sp, 2.6, 1.7, 0.7, 0.2 + rand() * 0.25, 2.5, 0.014);
    }
    // Trümmer mit Drehung (große Teile bei großen Explosionen)
    const nc = Math.min(40, (12 * size) | 0);
    for (let i = 0; i < nc; i++) this._chunk(x, y, z, size, i < 3 && size >= 1.5 ? 2.2 : 1);
    const pp = this.host.playerPos(_u);
    if (pp) {
      const d = Math.hypot(_u.x - x, _u.z - z);
      this.host.shake(1.5 + Math.max(0, 1 - d / 1200) * (size >= 2 ? 12 : 5) * size);
    }
  }
  _timer(t, kind, x, z, size, a, b) {
    for (let i = 0; i < this.timers.length; i++) {
      const T = this.timers[i];
      if (T.on) continue;
      T.on = true; T.t = t; T.kind = kind; T.x = x; T.z = z; T.size = size; T.a = a; T.b = b;
      return;
    }
    // Pool voll: sofort ausführen
    if (kind === 2) this._mainBlast(x, z, size, b); else if (kind === 3) this._gooBurst(x, z, size, b); else this._pop(x, z, size, a);
  }

  // ---------- Schwarm: Aufblähen (0,18 s), dann Zerplatzen in grünen Schleim ----------
  _gooStart(x, z, size, r) {
    this._flash(x, 8, z, Math.max(50, r * 2.2) * Math.sqrt(size), 0.22, 0x8dff5a, 2.0, null, undefined, undefined, undefined, true);
    this._flash(x, 9, z, Math.max(24, r * 1.1), 0.18, 0xe8ffd0, 1.6, null, undefined, undefined, undefined, true);
    this._timer(0.18, 3, x, z, size, 0, r);
  }
  _gooBurst(x, z, size, r) {
    const y = 4, ss = Math.sqrt(size);
    const mpp = this.host.metersPerPixel ? this.host.metersPerPixel() : 0.5;
    // nasser Knall: grellgrüner Kern, kurzer Hof, grünes Licht
    this._flash(x, y + 5, z, Math.max(110 * ss, 260 * mpp), 0.16, 0xd8ffb0, 3.2, null);
    this._flash(x, y + 5, z, Math.max(70 * ss, 180 * mpp), 0.7, 0x5aff3a, 1.5, null);
    this._light(x, z, size * 0.45, 0x6aff4a);
    // Spritzring (flach, schnell) und Säure-Hof
    this._ring(x, z, 4 * ss, Math.max(120 * ss, 160 * mpp), 0.42, 0x9dff6a, 1.1, null);
    this._ring(x, z, 8 * ss, Math.max(170 * ss, 210 * mpp), 1.1, 0x3aa82a, 0.35, null);
    // Schleimtropfen: schwere Klumpen nach außen, stark gebremst
    const nb = this._n(26 * size);
    for (let i = 0; i < nb; i++) {
      const a = rand() * Math.PI * 2, sp = (90 + rand() * 260) * ss, k = 0.6 + rand() * 0.6;
      this.glowP.emit(x, y + rand() * 4, z, Math.cos(a) * sp, (rand() - 0.4) * 50, Math.sin(a) * sp,
        0.35 * k, 1.9 * k, 0.32 * k, 0.9, (4 + rand() * 6) * ss, (12 + rand() * 10) * ss, 0.45 + rand() * 0.5, 3.2);
    }
    // feiner Sprühnebel (hell, kurz)
    for (let i = 0; i < this._n(14 * size); i++) {
      const a = rand() * Math.PI * 2, sp = (30 + rand() * 80) * ss;
      this.glowP.emit(x, y, z, Math.cos(a) * sp, rand() * 15, Math.sin(a) * sp, 0.5, 1.6, 0.45, 0.55, (16 + rand() * 12) * ss, (55 + rand() * 30) * ss, 0.5 + rand() * 0.4, 1.8);
    }
    // Säurenebel: dunkelgrüne Schwaden bleiben lange stehen und quellen langsam auf, darin schwaches Leuchten
    for (let i = 0; i < this._n(6 * size); i++) {
      const a = rand() * Math.PI * 2, d = rand() * r * 0.8, sp = (6 + rand() * 22) * ss, g = 0.06 + rand() * 0.05;
      this.smokeP.emit(x + Math.cos(a) * d, y - 2 + rand() * 6, z + Math.sin(a) * d, Math.cos(a) * sp, 1 + rand() * 4, Math.sin(a) * sp,
        g * 0.55, g * 1.5, g * 0.45, 0.55, (30 + rand() * 20) * ss, (120 + rand() * 70) * ss, 2.8 + rand() * 1.8, 0.35);
    }
    for (let i = 0; i < this._n(3 * size); i++) {
      const a = rand() * Math.PI * 2, d = rand() * r, k = 0.07 + rand() * 0.05;
      this.glowP.emit(x + Math.cos(a) * d, y, z + Math.sin(a) * d, Math.cos(a) * 10, 0, Math.sin(a) * 10,
        k * 1.2, k * 4.2, k * 1.0, 0.5, (40 + rand() * 30) * ss, (110 + rand() * 50) * ss, 2.4 + rand() * 1.4, 0.3);
    }
    // Fetzen: Gewebestücke taumeln weg und ziehen Tropfen nach
    const nc = Math.min(30, (10 * size + 4) | 0);
    for (let i = 0; i < nc; i++) this._chunk(x, y, z, size * 0.8, i < 2 && size >= 1.5 ? 1.8 : 0.9, 0, 0, 1.15, true);
    // grüne Funken (Säurespritzer)
    for (let i = 0; i < this._n(14 * size); i++) {
      const a = rand() * Math.PI * 2, sp = (200 + rand() * 360) * ss;
      this.sparks.emit(x, y, z, Math.cos(a) * sp, (rand() - 0.3) * 40, Math.sin(a) * sp, 0.6, 2.4, 0.5, 0.18 + rand() * 0.2, 3, 0.012);
    }
    const pp = this.host.playerPos(_u);
    if (pp) {
      const d = Math.hypot(_u.x - x, _u.z - z);
      this.host.shake(1 + Math.max(0, 1 - d / 1100) * 4 * size);
    }
  }

  damage(p) {
    if (!p || !p.crit) return;
    const x = p.x ?? 0, z = p.z ?? 0;
    const has = typeof p.dx === 'number' && typeof p.dz === 'number' && (p.dx || p.dz);
    const L = has ? Math.hypot(p.dx, p.dz) : 1, dx = has ? p.dx / L : 0, dz = has ? p.dz / L : 0;
    const n = this._n(22);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, sp = 250 + rand() * 400;
      this.sparks.emit(x, 6, z, Math.cos(a) * sp * 0.6 + dx * sp, rand() * 120, Math.sin(a) * sp * 0.6 + dz * sp, 3, 2.6, 1.6, 0.2 + rand() * 0.25, 1, 0.03);
    }
    this._flash(x, 6, z, 56, 0.16, 0xfff0d0, 3.2, null);
    this._ring(x, z, 4, 60, 0.25, 0xfff0d0, 1.2, null);
  }

  loot(p) {
    if (p.x === undefined) return;
    const n = this._n(22);
    const tri = p.tritium > 0; // Tritium glitzert grün, sonst Gold
    const cr = tri ? 0.9 : 2.4, cg = tri ? 2.2 : 2.0, cb = tri ? 1.4 : 0.8;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, sp = 30 + rand() * 90;
      this.glowP.emit(p.x, 6, p.z, Math.cos(a) * sp, 40 + rand() * 80, Math.sin(a) * sp, cr, cg, cb, 1, 4, 1.2, 0.6 + rand() * 0.5, 1.5);
    }
    this._ring(p.x, p.z, 8, 60, 0.45, tri ? 0x7dffb0 : 0xffd36a, 1.2, null);
  }

  trap(p) {
    this._ring(p.x, p.z, 20, 320, 0.9, 0xff3a2a, 2.4, null);
    this._flash(p.x, 6, p.z, 120, 0.4, 0xff4a30, 3, null);
  }

  jumpStart(p) {
    this.jump.on = true; this.jump.t = 0; this.jump.dur = Math.max(0.5, p?.seconds || 3); this.jump.acc = 0;
  }
  jumpCancel() {
    this.jump.on = false; this.jumpRing.on = false; this.jumpRing.r.visible = false; this.jumpGlow.on = false; this.jumpGlow.s.visible = false;
    for (const j of this.jumpSegs) j.mesh.visible = false;
  }

  // Austritt: kurzer Blitz (0,3 s, Spitze ≈ 1,2), dazu radiale Streckung und Farbsaum im Kamera-Durchgang
  sectorFlash() {
    this.jumpCancel();
    this.screenMat.uniforms.uColor.value.setRGB(1.15, 1.2, 1.3);
    this.fade.on = true; this.fade.t = 0; this.fade.dur = 0.26; this.fade.from = 0.6; this.fade.pow = 4;
    this.screen.visible = true;
    this.warp = 1; this.warpT = 0;
  }
  arrive() {
    if (!this.host.playerPos(_u)) return;
    // Austritt: die Segmentringe laufen scharf nach außen und verlöschen (kein weicher Glühring)
    this.arrT = 0;
    this._flash(_u.x, 4, _u.z, 70, 0.25, 0xbfe6ff, 1.2, 'player');
    const n = this._n(90);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, sp = 600 + rand() * 900;
      this.sparks.emit(_u.x, 4, _u.z, Math.cos(a) * sp, (rand() - 0.5) * 40, Math.sin(a) * sp, 1.2, 2.0, 3.2, 0.25 + rand() * 0.25, 2, 0.05);
    }
  }
  respawn() {
    this.screenMat.uniforms.uColor.value.setRGB(0, 0, 0);
    this.fade.on = true; this.fade.t = 0; this.fade.dur = 1.4; this.fade.from = 1; this.fade.pow = 2;
    this.screen.visible = true;
    if (this.host.playerPos(_u)) {
      this._ring(_u.x, _u.z, 10, 200, 1.0, 0x9fe8ff, 2.0, 'player');
      this._shield('player', 1.2, 0, 0, -1, true, true);
    }
  }

  // ---------- Pool-Helfer ----------
  _flash(x, y, z, size, dur, hex, k, follow, tr, tg, tb, rise = false) {
    let f = null;
    for (let i = 0; i < FLASHES - 1; i++) if (!this.flashes[i].on) { f = this.flashes[i]; break; }
    if (!f) f = this.flashes[(rand() * (FLASHES - 1)) | 0];
    f.on = true; f.t = 0; f.dur = dur; f.size = size; f.follow = follow; f.rise = rise;
    f.col.setHex(hex);
    if (tr !== undefined) { f.col.r = f.col.r * 0.4 + tr * 0.6; f.col.g = f.col.g * 0.4 + tg * 0.6; f.col.b = f.col.b * 0.4 + tb * 0.6; }
    f.col.multiplyScalar(k);
    f.s.position.set(x, y, z); f.s.visible = true;
    f.m.color.copy(f.col);
  }
  _ring(x, z, from, to, dur, hex, k, follow) {
    let r = null;
    for (let i = 0; i < RINGS - 1; i++) if (!this.rings[i].on) { r = this.rings[i]; break; }
    if (!r) r = this.rings[(rand() * (RINGS - 1)) | 0];
    r.on = true; r.t = 0; r.dur = dur; r.from = from; r.to = to; r.follow = follow; r.alpha = 1;
    r.col.setHex(hex).multiplyScalar(k);
    r.r.position.set(x, 1, z); r.r.visible = true;
  }
  _blast(x, z, size, mpp = 0, small = false) {
    let b = null;
    for (let i = 0; i < this.blasts.length; i++) if (!this.blasts[i].on) { b = this.blasts[i]; break; }
    if (!b) { let best = -1; for (const c of this.blasts) if (c.t > best) { best = c.t; b = c; } }
    b.on = true; b.t = 0; b.size = size; b.x = x; b.z = z; b.minR = 40 * mpp; b.minS = 70 * mpp;
    b.fm.uniforms.uSeed.value = rand() * 50; b.sm.uniforms.uSeed.value = rand() * 50;
    b.fire.position.set(x, 4, z); b.shell.position.set(x, 4, z);
    b.fire.rotation.set(rand() * 6, rand() * 6, 0); b.shell.rotation.set(rand() * 6, rand() * 6, 0);
    b.small = small;
    b.fire.visible = true; b.shell.visible = !small; b.sm.uniforms.uAge.value = small ? 1 : 0;
  }
  _chunk(x, y, z, size, big = 1, dx = 0, dz = 0, speed = 1, goo = false) {
    let c = null;
    for (let i = 0; i < this.chunks.length; i++) if (!this.chunks[i].on) { c = this.chunks[i]; break; }
    if (!c) return;
    c.goo = goo;
    // Piraten: jedes vierte größere Trümmerteil brennt eine Weile nach (Feuer + Rauch)
    c.burn = !goo && big >= 1 && rand() < 0.28 ? 1.2 + rand() * 1.2 : 0;
    const a = rand() * Math.PI * 2, sp = (60 + rand() * 240) * Math.sqrt(size) * speed;
    c.on = true; c.x = x; c.y = y; c.z = z;
    c.vx = Math.cos(a) * sp + dx; c.vz = Math.sin(a) * sp + dz; c.vy = (rand() - 0.3) * 70 * speed;
    c.rx = rand() * 6; c.ry = rand() * 6; c.rz = rand() * 6;
    c.wx = (rand() - 0.5) * 9; c.wy = (rand() - 0.5) * 9; c.wz = (rand() - 0.5) * 9;
    c.s = (1.2 + Math.pow(rand(), 2) * 5) * Math.sqrt(size) * big; c.life = c.max = (2.2 + rand() * 2.2) * (big < 0.5 ? 0.35 : 1); c.acc = 0;
  }
  _light(x, z, size, hex = 0xffc890) {
    const n = this.nLights || this.lights.length;
    const L = this.lights[this.lightNext % n];
    this.lightNext = (this.lightNext + 1) % n;
    L.l.color.setHex(hex);
    L.on = true; L.t = 0; L.dur = 0.8 + size * 0.15; L.peak = 5200 * size;
    L.l.distance = 700 + 320 * size;
    L.l.position.set(x, 70, z);
  }
  _shield(id, dur, hx, hy, hz, big, full = false) {
    const r0 = this.host.getRadius(id);
    if (!r0) return;
    let s = null;
    for (let i = 0; i < this.shields.length; i++) if (this.shields[i].on && this.shields[i].id === id) { s = this.shields[i]; break; }
    if (!s) for (let i = 0; i < this.shields.length; i++) if (!this.shields[i].on) { s = this.shields[i]; break; }
    if (!s) return;
    s.on = true; s.id = id; s.t = 0; s.dur = full ? dur : Math.min(dur, big ? 0.6 : 0.5); s.big = !!big;
    s.m.uniforms.uFull.value = full ? 1 : 0;
    s.r = this.host.visualRadius(id) * 1.12;
    // Einschläge kommen flach; zur Kamera geneigt liegt das Raster sichtbar oben statt nur am Rand der Kugel
    s.m.uniforms.uHit.value.set(hx, hy, hz).normalize();
    s.m.uniforms.uHit.value.y += 0.35;
    s.m.uniforms.uHit.value.normalize();
    s.m.uniforms.uColor.value.setHex(id === 'player' ? this.host.playerShieldColor() : SHIELD_COLOR);
    s.mesh.visible = true;
  }

  // ---------- jedes Bild ----------
  update(dt) {
    this.time += dt;
    const H = this.host;

    // versetzte Schüsse
    for (let i = 0; i < this.shotQ.length; i++) {
      const q = this.shotQ[i];
      if (!q.on) continue;
      q.t -= dt;
      if (q.t > 0) continue;
      q.on = false;
      this._fire(q.from, q.to, q.laser, q.ammo, q.hit, q.has ? q.dx : undefined, q.has ? q.dz : undefined, q.slot, q.hp ? q.hx : undefined, q.hp ? q.hz : undefined);
    }
    // Zeitgeber (Explosionsfolgen)
    for (let i = 0; i < this.timers.length; i++) {
      const T = this.timers[i];
      if (!T.on) continue;
      T.t -= dt;
      if (T.t > 0) continue;
      T.on = false;
      if (T.kind === 2) this._mainBlast(T.x, T.z, T.size, T.b); else if (T.kind === 3) this._gooBurst(T.x, T.z, T.size, T.b); else this._pop(T.x, T.z, T.size, T.a);
    }
    // SAB-Saugstrahlen folgen Schütze und Ziel
    for (let i = 0; i < this.beams.length; i++) {
      const bm = this.beams[i];
      if (!bm.on) continue;
      bm.t += dt;
      const t = bm.t / bm.dur;
      if (t >= 1 || !H.getPos(bm.to, _w) || !H.getPos(bm.from, _v)) { bm.on = false; bm.mesh.visible = false; continue; }
      _v.y += 2;
      const dx = _w.x - _v.x, dy = _w.y - _v.y, dz = _w.z - _v.z, d = Math.hypot(dx, dy, dz) || 1;
      _u.set(dx / d, dy / d, dz / d);
      _q.setFromUnitVectors(_fz, _u);
      const bw = Math.max(9, 16 * (H.metersPerPixel ? H.metersPerPixel() : 0.4));
      bm.mesh.position.set((_v.x + _w.x) / 2, (_v.y + _w.y) / 2, (_v.z + _w.z) / 2);
      bm.mesh.quaternion.copy(_q);
      bm.mesh.scale.set(bw, bw, d);
      bm.m.uniforms.uLen.value = d;
      bm.m.uniforms.uOpacity.value = Math.min(1, t * 8) * (1 - t * t);
      // Schildenergie fließt als Lichtpunkte zum Schützen
      if (bm.hit) {
        bm.acc += dt * 40 * this.density;
        while (bm.acc >= 1) {
          bm.acc -= 1;
          const sp = 600 + rand() * 300;
          this.glowP.emit(_w.x + (rand() - 0.5) * 10, _w.y, _w.z + (rand() - 0.5) * 10, -_u.x * sp, 0, -_u.z * sp, 0.5, 1.2, 2.4, 1, 6, 2, Math.min(0.6, d / sp), 0);
        }
      }
    }

    // Bolzen: Breite mindestens ≈ 18 px Quad (heller Kern ≈ 4 px, farbige Hülle ≈ 9 px)
    const bw = Math.max(7, 18 * (H.metersPerPixel ? H.metersPerPixel() : 0.4));
    this.boltPool.begin();
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i];
      if (!b.on) continue;
      b.age += dt;
      const maxLen = BOLT_LEN * (b.thick > 2 ? 1.35 : 1);
      if (b.lin > 0) {
        // Nachglühen: Kopf steht am Einschlag, der Schweif zieht sich zusammen und verblasst (≈ 110 ms)
        b.lin -= dt;
        if (b.lin <= 0) { b.on = false; continue; }
        const q = b.lin / BOLT_LINGER;
        const len = Math.max(6, Math.min(maxLen, b.traveled) * q * q);
        _v.set(b.hx - b.dx * len * 0.5, b.hy - b.dy * len * 0.5, b.hz - b.dz * len * 0.5);
        _w.set(b.dx, b.dy, b.dz);
        _q.setFromUnitVectors(_fz, _w);
        _s.set(bw * b.thick * (0.8 + 0.4 * q), bw * b.thick * (0.8 + 0.4 * q), len);
        _m.compose(_v, _q, _s);
        _c.copy(b.color).multiplyScalar(b.fade * (0.35 + 0.65 * q));
        this.boltPool.push(_m, _c);
        continue;
      }
      if (!b.miss && b.to && H.getPos(b.to, _w)) this._aim(b, _w);
      const step = BOLT_SPEED * dt;
      let arrived = false;
      if (step >= b.remain) { arrived = true; b.hx = b.ex; b.hy = b.ey; b.hz = b.ez; }
      else { b.hx += b.dx * step; b.hy += b.dy * step; b.hz += b.dz * step; if (b.miss) b.remain -= step; }
      b.traveled += step;
      b.fade = b.miss ? Math.max(0, 1 - Math.max(0, b.traveled - 200) / 500) : 1;
      if (arrived) {
        if (b.hit) this._impact(b);
        if (b.hit) { const n = (this.pendingTo.get(b.to) || 1) - 1; if (n <= 0) this.pendingTo.delete(b.to); else this.pendingTo.set(b.to, n); }
        // Treffer glühen nach; Fehlschüsse am Ende ihrer Bahn sind schon verblasst
        if (b.hit || b.fade > 0.05) { b.lin = BOLT_LINGER; } else { b.on = false; continue; }
      }
      const len = Math.min(maxLen, b.traveled + 8);
      _v.set(b.hx - b.dx * len * 0.5, b.hy - b.dy * len * 0.5, b.hz - b.dz * len * 0.5);
      _w.set(b.dx, b.dy, b.dz);
      _q.setFromUnitVectors(_fz, _w);
      _s.set(bw * b.thick, bw * b.thick, len);
      _m.compose(_v, _q, _s);
      _c.copy(b.color).multiplyScalar(b.fade);
      this.boltPool.push(_m, _c);
    }
    this.boltPool.end();

    // Raketen
    for (let i = 0; i < this.rockets.length; i++) {
      const r = this.rockets[i];
      if (!r.on) continue;
      if (r.to && H.getPos(r.to, _w)) { r.ex = _w.x; r.ez = _w.z; }
      r.t += dt;
      const t = Math.min(1, r.t / r.dur), it = 1 - t;
      const x = it * it * r.sx + 2 * it * t * r.cx + t * t * r.ex;
      const z = it * it * r.sz + 2 * it * t * r.cz + t * t * r.ez;
      const y = 4 + Math.sin(t * Math.PI) * 40;
      r.mesh.position.set(x, y, z);
      _v.set(x + (x - r.px), y, z + (z - r.pz));
      if (x !== r.px || z !== r.pz) r.mesh.lookAt(_v);
      // Abgasband: Ringpuffer der letzten Positionen (neuer Punkt alle 4 m, Kopf folgt jedes Bild)
      this._trailPush(r, x, y, z);
      // Rauch und Glut je Bild (an die Bildrate gekoppelt), mit Zufallsversatz entlang des letzten Stücks
      const nS = this.quality >= 2 ? 3 : this.quality === 1 ? 2 : 1;
      for (let k = 0; k < nS; k++) {
        const f = rand();
        const sx = r.px + (x - r.px) * f + (rand() - 0.5) * 4, sz = r.pz + (z - r.pz) * f + (rand() - 0.5) * 4;
        const g = 0.24 + rand() * 0.08;
        this.smokeP.emit(sx, y + (rand() - 0.5) * 3, sz, (rand() - 0.5) * 10, 2 + rand() * 4, (rand() - 0.5) * 10, g, g * 1.02, g * 1.08, 0.2, 2.2, 11 + rand() * 6, 0.7 + rand() * 0.5, 0.8);
      }
      this.glowP.emit(x, y, z, (rand() - 0.5) * 8, 0, (rand() - 0.5) * 8, 2.4, 1.3, 0.5, 0.8, 4, 1.5, 0.1, 0);
      r.px2 = r.px; r.pz2 = r.pz;
      r.px = x; r.pz = z;
      if (t >= 1) {
        r.on = false; r.mesh.visible = false; r.fade = 0.999;
        this._flash(x, 6, z, 110, 0.2, 0xfff0d8, 3.5, null);
        const ns = this._n(36);
        for (let k = 0; k < ns; k++) {
          const a = rand() * Math.PI * 2, sp = 200 + rand() * 450;
          this.sparks.emit(x, 6, z, Math.cos(a) * sp, (rand() - 0.2) * 120, Math.sin(a) * sp, 3, 2.4, 1.5, 0.25 + rand() * 0.35, 1, 0.035);
        }
        const e = H.entity(r.to);
        if (e && e.shield > 0) this._shield(r.to, 0.55, x - r.cx, 0, z - r.cz, true);
        else this._blast(x, z, 0.55, 0, true);
        this._ring(x, z, 5, 90, 0.35, 0xffd8b0, 1.1, null);
        H.flinch?.(r.to, x - r.px2, z - r.pz2, 1.0);
      }
    }

    // Abgasbänder nach dem Einschlag ausblenden (0,35 s)
    for (let i = 0; i < this.rockets.length; i++) {
      const r = this.rockets[i];
      if (r.on || r.fade <= 0) continue;
      r.fade -= dt / 0.35;
      if (r.fade <= 0) { r.fade = 0; r.trail.visible = false; continue; }
      r.tm.uniforms.uFade.value = r.fade * r.fade;
    }

    // Trümmer: kaum gebremst, taumeln, glühen aus
    for (const p of this.debrisPools) p.begin();
    this.gooPool.begin();
    for (let i = 0; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (!c.on) continue;
      c.life -= dt;
      if (c.life <= 0) { c.on = false; continue; }
      const k = Math.max(0, 1 - 0.25 * dt);
      c.vx *= k; c.vy *= k; c.vz *= k;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
      const sc = c.s * Math.min(1, c.life / (c.max * 0.25));
      _e.set(c.rx, c.ry, c.rz); _q.setFromEuler(_e);
      _v.set(c.x, c.y, c.z); _s.set(sc, sc, sc);
      _m.compose(_v, _q, _s);
      const ageS = c.max - c.life;
      if (c.goo) {
        // frisch hellgrün glänzend, dann dunkler; zieht anfangs Tropfen nach
        const f = Math.max(0, 1 - ageS / 1.4);
        _c.setRGB(0.08 + 0.3 * f, 0.22 + 0.55 * f, 0.06 + 0.16 * f);
        this.gooPool.push(_m, _c);
        if (ageS < 0.9) {
          c.acc += dt * 22 * this.density;
          while (c.acc >= 1) { c.acc -= 1; this.glowP.emit(c.x, c.y, c.z, c.vx * 0.1, -4, c.vz * 0.1, 0.3, 1.5, 0.3, 0.7 * f, 2.2 * Math.sqrt(c.s), 0.6, 0.4, 1); }
        }
        continue;
      }
      // Instanzfarbe: r = Helligkeit, g = Abkühlung (0 = glühend heiß); nach 1 s dunkles Metall
      _c.setRGB(1, Math.min(1, ageS / 1.6), 1);
      this.debrisPools[c.kind].push(_m, _c);
      const age = ageS / 1.6;
      if (c.burn > ageS) {
        // brennendes Trümmerteil: Flammenzunge und Rauchfahne
        c.acc += dt * 26 * this.density;
        const bk = 1 - ageS / c.burn;
        while (c.acc >= 1) {
          c.acc -= 1;
          this.glowP.emit(c.x, c.y, c.z, (rand() - 0.5) * 12, 4, (rand() - 0.5) * 12, 2.4, 1.0, 0.3, 0.75 * bk, 4 * Math.sqrt(c.s), 1.4, 0.3, 0);
          if (rand() < 0.4) this.smokeP.emit(c.x, c.y, c.z, (rand() - 0.5) * 8, 6, (rand() - 0.5) * 8, 0.09, 0.085, 0.08, 0.45 * bk, 3 * Math.sqrt(c.s), 16 * Math.sqrt(c.s), 1.1, 0.5);
        }
      } else if (age < 0.45) {
        c.acc += dt * 30 * this.density;
        while (c.acc >= 1) { c.acc -= 1; this.glowP.emit(c.x, c.y, c.z, 0, 0, 0, 2.2, 0.9, 0.25, 0.8 * (1 - age * 2.5), 3 * Math.sqrt(c.s), 1, 0.35, 0); }
      }
    }
    for (const p of this.debrisPools) p.end();
    this.gooPool.end();

    // Explosionen: Feuerkern schnell, Gaswolke langsam
    for (let i = 0; i < this.blasts.length; i++) {
      const b = this.blasts[i];
      if (!b.on) continue;
      b.t += dt;
      const ss = Math.sqrt(b.size);
      const tf = b.t / (0.9 + 0.15 * b.size);
      if (tf < 1) {
        const e = 1 - Math.pow(1 - tf, 3);
        b.fire.scale.setScalar(Math.max((10 + 46 * e) * ss, b.minR * (0.45 + 0.55 * e)));
        b.fm.uniforms.uAge.value = tf;
      } else b.fire.visible = false;
      // nachglühende Gaswolke: wächst lautlos, kühlt über Orange zu Blaugrau ab
      const ts = b.small ? 1 : b.t / (2.4 + 0.3 * b.size);
      if (ts < 1) {
        const e = 1 - Math.pow(1 - ts, 2.6);
        b.shell.scale.setScalar(Math.max((12 + 62 * e) * ss, b.minS * 0.6 * (0.3 + 0.7 * e)));
        b.sm.uniforms.uAge.value = ts;
      } else b.shell.visible = false;
      if (tf >= 1 && ts >= 1) b.on = false;
    }

    // Blitze
    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      if (!f.on || f === this.jumpGlow) continue;
      f.t += dt;
      const t = f.t / f.dur;
      if (t >= 1) { f.on = false; f.s.visible = false; continue; }
      if (f.follow && H.getPos(f.follow, _v)) f.s.position.set(_v.x, _v.y + 4, _v.z);
      if (f.rise) {
        // Aufglühen: wird heller und größer, flackert, verlischt erst ganz am Ende
        const up = t < 0.85 ? Math.pow(t / 0.85, 1.6) : (1 - t) / 0.15;
        f.s.scale.setScalar(f.size * (0.3 + 0.7 * Math.sqrt(t)) * (0.9 + 0.1 * Math.sin(this.time * 70 + i)));
        f.m.color.copy(f.col).multiplyScalar(up * (0.75 + 0.25 * Math.sin(this.time * 53 + i * 3)));
        continue;
      }
      const sc = f.size * (0.5 + 0.5 * Math.sqrt(t));
      f.s.scale.setScalar(sc);
      f.m.color.copy(f.col).multiplyScalar((1 - t) * (1 - t));
    }
    // Ringe
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i];
      if (!r.on || r === this.jumpRing) continue;
      r.t += dt;
      const t = r.t / r.dur;
      if (t >= 1) { r.on = false; r.r.visible = false; continue; }
      if (r.follow && H.getPos(r.follow, _v)) r.r.position.set(_v.x, 1, _v.z);
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      r.r.scale.setScalar(r.from + (r.to - r.from) * e);
      r.m.color.copy(r.col).multiplyScalar((1 - t) * r.alpha);
    }
    // Lichter
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      if (!L.on) continue;
      L.t += dt;
      const t = L.t / L.dur;
      if (t >= 1) { L.on = false; L.l.intensity = 0; L.l.position.y = -99999; continue; }
      L.l.intensity = L.peak * (1 - t) * (1 - t);
    }
    // Schilde
    for (let i = 0; i < this.shields.length; i++) {
      const s = this.shields[i];
      if (!s.on) continue;
      s.t += dt;
      const t = s.t / s.dur;
      if (t >= 1 || !H.getPos(s.id, _v)) { s.on = false; s.mesh.visible = false; continue; }
      s.mesh.position.copy(_v);
      s.mesh.scale.setScalar(s.r);
      s.m.uniforms.uAge.value = t;
      s.m.uniforms.uOpacity.value = s.big ? 1.0 : 0.8;
    }
    // Sprung-Ladung: Ring zieht sich zusammen, Lichtstriche strömen ein, Kern wird heller
    const J = this.jump;
    if (J.on) {
      J.t += dt;
      const t = Math.min(1, J.t / J.dur);
      if (J.t > J.dur + 1.5 || !H.playerPos(_u)) this.jumpCancel();
      else {
        // scharfe Segmentringe, Drehzahl steigt mit der Ladung, Ringe ziehen sich leicht zusammen
        J.ang += dt * (0.35 + t * t * 7.5);
        for (let i = 0; i < this.jumpSegs.length; i++) {
          const S = this.jumpSegs[i];
          S.mesh.visible = true;
          S.mesh.position.set(_u.x, 2 + i, _u.z);
          S.mesh.rotation.y = J.ang * (i === 1 ? -1.3 : 1 + i * 0.4);
          S.mesh.scale.setScalar(S.r * (1 - 0.14 * t * t));
          S.m.uniforms.uOpacity.value = Math.min(1.2, (0.2 + t * 0.9) * (i === 2 ? 0.7 : 1));
        }
        const G = this.jumpGlow;
        G.on = true; G.s.visible = true; G.s.position.set(_u.x, 6, _u.z);
        G.s.scale.setScalar(12 + t * 22);
        G.m.color.setRGB(0.5, 0.85, 1.4).multiplyScalar(0.15 + t * t * 0.6);
        J.acc += dt * (50 + t * 200) * this.density;
        while (J.acc >= 1) {
          J.acc -= 1;
          const a = rand() * Math.PI * 2, d = 180 + rand() * 120;
          const px = _u.x + Math.cos(a) * d, pz = _u.z + Math.sin(a) * d;
          const sp = d * 2.6;
          this.sparks.emit(px, 4 + (rand() - 0.5) * 30, pz, -Math.cos(a) * sp, 0, -Math.sin(a) * sp, 0.8, 1.6, 3.0, 0.32, 0, 0.06);
        }
      }
    }
    // Vollbild-Blende
    const F = this.fade;
    if (F.on) {
      F.t += dt;
      const t = F.t / F.dur;
      if (t >= 1) { F.on = false; this.screen.visible = false; this.screenMat.uniforms.uOpacity.value = 0; }
      else this.screenMat.uniforms.uOpacity.value = F.from * Math.pow(1 - t, F.pow);
    }
    if (this.arrT < 0.55 && !J.on) {
      this.arrT += dt;
      const e = Math.min(1, this.arrT / 0.55), f = (1 - e) * (1 - e);
      const pp = H.playerPos(_u);
      for (let i = 0; i < this.jumpSegs.length; i++) {
        const S = this.jumpSegs[i];
        S.mesh.visible = !!pp && e < 1;
        if (!pp) continue;
        S.mesh.position.set(_u.x, 2 + i, _u.z);
        S.mesh.rotation.y += dt * (2.5 - i * 0.6) * (i === 1 ? -1 : 1);
        S.mesh.scale.setScalar(S.r * (1 + (1 - Math.pow(1 - e, 3)) * (1.4 + i * 0.5)));
        S.m.uniforms.uOpacity.value = f * 1.1;
      }
    }
    if (this.warpT < 0.6) {
      this.warpT += dt;
      const w = Math.max(0, 1 - this.warpT / 0.6);
      this.warp = w * w;
    } else this.warp = 0;

    this._ionUpdate();
    this.glowP.update(dt);
    this.smokeP.update(dt);
    this.sparks.update(dt);
  }

  _trailPush(r, x, y, z) {
    const h = r.hist;
    if (r.hn === 0) { h[0] = x; h[1] = y; h[2] = z; r.hn = 1; }
    const dx = x - h[3], dz = z - h[5];
    if (r.hn === 1 || dx * dx + dz * dz > 16) {
      h.copyWithin(3, 0, (TRAIL_N - 1) * 3);
      if (r.hn < TRAIL_N) r.hn++;
    }
    h[0] = x; h[1] = y; h[2] = z;
    if (r.hn < 2) return;
    const P = r.tp.array, n = r.hn;
    for (let k = 0; k < TRAIL_N; k++) {
      const i = Math.min(k, n - 1), a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = h[a * 3] - h[b * 3], tz = h[a * 3 + 2] - h[b * 3 + 2];
      const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
      const u = k / (TRAIL_N - 1), w = 1.6 + u * 5.5;
      const px = h[i * 3], py = h[i * 3 + 1], pz = h[i * 3 + 2];
      P[k * 6] = px - tz * w; P[k * 6 + 1] = py; P[k * 6 + 2] = pz + tx * w;
      P[k * 6 + 3] = px + tz * w; P[k * 6 + 4] = py; P[k * 6 + 5] = pz - tx * w;
    }
    r.tp.needsUpdate = true;
    r.trail.visible = true;
    r.tm.uniforms.uFade.value = 1;
  }

  // Einschlag: Funkenregen in Schussrichtung (am Schild abgelenkt und kühl, an der Hülle heiß mit Glut und Splittern),
  // Aufblitzen, getroffenes Ziel zuckt. SAL: zusätzlich Druckwelle, Feuerball, Licht.
  _impact(b) {
    const x = b.hx, y = b.hy, z = b.hz;
    const H = this.host;
    const e = H.entity(b.to);
    const shielded = e && e.shield > 0;
    // Einschlagrichtung: von der Simulation (dx, dz) oder aus der Flugbahn
    let dx = b.dx, dz = b.dz;
    if (b.ix !== null && b.iz !== null && (b.ix || b.iz)) { const L = Math.hypot(b.ix, b.iz); dx = b.ix / L; dz = b.iz / L; }
    const px = -dz, pz = dx; // quer zur Schussrichtung
    const k3 = 3.2 * (b.sal ? 1.8 : 1);
    const cr = b.color.r / k3, cg = b.color.g / k3, cb = b.color.b / k3;
    const n = this._n(b.sal ? 34 : 16);
    for (let i = 0; i < n; i++) {
      const side = (rand() - 0.5) * 2, sp = 180 + rand() * 520;
      if (shielded) {
        // am Schild: Funken gleiten tangential über die Blase und prallen teilweise zurück
        const back = rand() < 0.35 ? -0.6 : 0.25;
        this.sparks.emit(x, y, z, (dx * back + px * side * 1.1) * sp, (rand() - 0.2) * 120, (dz * back + pz * side * 1.1) * sp,
          0.9 + cr * 0.5, 1.6 + cg * 0.5, 2.8 + cb * 0.5, 0.12 + rand() * 0.16, 3, 0.025);
      } else {
        // an der Hülle: Funkenregen schießt in Schussrichtung weiter (Kegel ≈ ±50°)
        const fw = 0.7 + rand() * 0.6;
        this.sparks.emit(x, y, z, (dx * fw + px * side * 0.8) * sp, (rand() - 0.1) * 160, (dz * fw + pz * side * 0.8) * sp,
          3.0, 2.3, 1.4, 0.18 + rand() * 0.32, 1.6, 0.03);
      }
    }
    this.glowP.emit(x, y, z, 0, 0, 0, cr * 2.4, cg * 2.4, cb * 2.4, 1, 26 * b.thick, 46 * b.thick, 0.12, 0);
    this._flash(x, y + 2, z, 34 * b.thick, 0.12, 0xffffff, 1.6, null, cr, cg, cb);
    if (!shielded) {
      // Glut an der Einschlagstelle und kleine Splitter, die in Schussrichtung wegtrudeln
      this.glowP.emit(x, y, z, 0, 0, 0, 2.6, 1.6, 0.7, 0.9, 12 * b.thick, 6, 0.45, 0);
      const ne = this._n(b.sal ? 10 : 5);
      for (let i = 0; i < ne; i++) {
        const side = (rand() - 0.5) * 1.4, sp = 50 + rand() * 140;
        this.glowP.emit(x, y, z, (dx + px * side) * sp, rand() * 40, (dz + pz * side) * sp, 2.6, 1.3, 0.45, 1, 3.5, 1, 0.4 + rand() * 0.4, 2);
      }
      const nc = b.sal ? 4 : rand() < 0.5 ? 1 : 0;
      for (let i = 0; i < nc; i++) this._chunk(x, y, z, 0.35, 0.3, dx * 140, dz * 140, 0.5);
    }
    if (shielded) this._shield(b.to, 0.5, -dx, -b.dy, -dz, b.thick > 2);
    H.flinch?.(b.to, dx, dz, b.sal ? 1.2 : 0.35);
    if (b.sal) {
      this._ring(x, z, 6, 120, 0.4, shielded ? 0x9fd8ff : 0xffd0a0, 1.2, null);
      this._blast(x, z, 0.45, 0, true);
      this._light(x, z, 0.5);
      this.host.shake(3);
    }
  }

  clear() {
    for (const b of this.bolts) b.on = false;
    for (const q of this.shotQ) q.on = false;
    for (const T of this.timers) T.on = false;
    for (const bm of this.beams) { bm.on = false; bm.mesh.visible = false; }
    for (const r of this.rockets) { r.on = false; r.mesh.visible = false; r.trail.visible = false; r.fade = 0; r.hn = 0; }
    for (const j of this.jumpSegs) j.mesh.visible = false;
    this.warp = 0; this.warpT = 1; this.arrT = 9;
    for (const c of this.chunks) c.on = false;
    for (const f of this.flashes) { f.on = false; f.s.visible = false; }
    for (const r of this.rings) { r.on = false; r.r.visible = false; }
    for (const s of this.shields) { s.on = false; s.mesh.visible = false; }
    for (const b of this.blasts) { b.on = false; b.fire.visible = false; b.shell.visible = false; }
    for (const L of this.lights) { L.on = false; L.l.intensity = 0; L.l.position.y = -99999; }
    this.jump.on = false;
    this.pendingTo.clear();
    this.ion.n = 0; this.ionMesh.visible = false;
    this.screen.visible = false; this.fade.on = false;
    this.glowP.clear(); this.smokeP.clear(); this.sparks.clear();
    this.boltPool.mesh.count = 0; for (const p of this.debrisPools) p.mesh.count = 0; this.gooPool.mesh.count = 0;
  }

  // Für das Vorübersetzen der Shader kurz alles sichtbar machen
  setAllVisible(v) {
    for (const f of this.flashes) f.s.visible = v || f.on;
    for (const r of this.rings) r.r.visible = v || r.on;
    for (const s of this.shields) s.mesh.visible = v || s.on;
    for (const r of this.rockets) { r.mesh.visible = v || r.on; r.trail.visible = v || r.on || r.fade > 0; }
    for (const j of this.jumpSegs) j.mesh.visible = v || this.jump.on;
    for (const bm of this.beams) bm.mesh.visible = v || bm.on;
    for (const b of this.blasts) { b.fire.visible = v || (b.on && b.fm.uniforms.uAge.value < 1); b.shell.visible = v || (b.on && b.sm.uniforms.uAge.value < 1); }
    this.screen.visible = v || this.fade.on;
  }

  dispose() {
    this.scene.remove(this.group); this.scene.remove(this.screen);
    this.glowP.dispose(); this.smokeP.dispose(); this.sparks.dispose();
    this.boltGeo.dispose(); this.boltMat.dispose();
    for (const g of this.debrisGeos) g.dispose();
    this.debrisMat.dispose();
    this.boltPool.mesh.dispose(); for (const p of this.debrisPools) p.mesh.dispose();
    this.gooPool.mesh.dispose(); this.gooGeo.dispose(); this.gooMat.dispose();
    for (const f of this.flashes) f.m.dispose();
    this.ringGeo.dispose();
    for (const r of this.rings) r.m.dispose();
    this.blastGeo.dispose(); this.fireBase.dispose(); this.shellBase.dispose();
    for (const b of this.blasts) { b.fm.dispose(); b.sm.dispose(); }
    this.shieldGeo.dispose(); this.shieldBase.dispose();
    for (const s of this.shields) s.m.dispose();
    this.rocketGeo.dispose(); this.rocketMat.dispose(); this.rocketFlame.dispose();
    for (const r of this.rockets) { r.tg.dispose(); r.tm.dispose(); }
    this.trailBase.dispose();
    this.jumpSegGeo.dispose();
    for (const j of this.jumpSegs) j.m.dispose();
    this.screen.geometry.dispose(); this.screenMat.dispose();
    this.ionGeo.dispose(); this.ionMat.dispose();
    this.beamBase.dispose(); for (const bm of this.beams) bm.m.dispose();
    for (const L of this.lights) L.l.dispose();
  }
}
