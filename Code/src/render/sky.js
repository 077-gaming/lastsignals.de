// Himmel wie auf Weltraum-Aufnahmen: Milchstraßenband mit Staubstreifen und dezenten Emissionsnebeln,
// Sterne nach Temperatur gefärbt (Spektralklassen O bis M) mit realistischer Helligkeitsverteilung,
// die hellsten mit Beugungsstrahlen, Sonne mit Blendung. Die Kamera dreht sich nie (nur Verschiebung),
// darum ist der unendlich ferne Himmel ein festes Bild: einmal backen, dann jedes Bild nur kopieren.
import * as THREE from 'three';
import { NOISE, BAKE_VS, Baker } from './glsl.js';
import { rng } from './textures.js';

const SKY_FS = /* glsl */`
uniform mat4 uInvProj; uniform mat3 uCamRot; uniform float uEquirect; uniform float uEncode; uniform vec4 uRows;
uniform vec3 uSunDir, uSunCol, uGalN, uGalC, uCamUp, uPlanetDir, uPlanetCol;
uniform float uSunR, uSpike, uMW, uNebK, uSeed; uniform vec3 uNebA, uNebB;
uniform vec3 uMoodA, uMoodB; uniform float uMoodK;
varying vec2 vUv;
${NOISE}
vec3 skyCol(vec3 d) {
  float b = dot(d, uGalN);
  vec3 pl = normalize(d - uGalN * b);
  float lon = atan(dot(pl, cross(uGalN, uGalC)), dot(pl, uGalC));
  vec3 s3 = vec3(uSeed, uSeed * 1.7, uSeed * 0.3);
  float w = fbm(d * 3.6 + s3, 4);
  float bb = b + w * 0.04;
  float band = exp(-bb * bb / 0.005) + 0.22 * exp(-bb * bb / 0.03);
  float bulge = exp(-lon * lon / 0.22) * exp(-bb * bb / 0.012);
  float clump = fbm(d * 13.0 + s3 + w, 6) * 0.5 + 0.5;
  float fine = fbm(d * 48.0 + s3 * 1.7, 4) * 0.5 + 0.5;
  float grain = fbm(d * 120.0 + s3 * 2.9, 3) * 0.5 + 0.5;
  float stars = band * (0.08 + 1.5 * pow(clump, 3.0)) * (0.35 + 1.1 * fine * grain) + bulge * 1.3 * (0.5 + 0.8 * clump * fine);
  // dunkle Staubstreifen (Great Rift), fasrige Ränder
  float lane = fbm(d * 5.0 + s3 * 2.3 + vec3(w * 1.6), 6) * 0.5 + 0.5;
  float laneMask = exp(-(bb - 0.015) * (bb - 0.015) / 0.004);
  float dark = smoothstep(0.40, 0.66, lane) * laneMask;
  float wisps = smoothstep(0.52, 0.78, fbm(d * 18.0 + s3 * 3.1, 5) * 0.5 + 0.5) * exp(-bb * bb / 0.025);
  float ext = clamp(dark * 0.94 + wisps * 0.5, 0.0, 0.96);
  vec3 warm = vec3(1.0, 0.88, 0.72), cool = vec3(0.80, 0.86, 1.0);
  vec3 col = mix(cool, warm, clamp(bulge * 1.4 + 0.3, 0.0, 1.0)) * stars;
  col = mix(col, col * vec3(1.0, 0.72, 0.5), smoothstep(0.0, 0.5, ext) * 0.7);
  col *= 1.0 - ext;
  // Emissionsnebel: H-alpha rosa-rot, O-III blaugrün im Kern, dunkle Globulen davor
  float em = fbm(d * 4.4 + s3 * 5.7, 6) * 0.5 + 0.5;
  float emm = smoothstep(0.62, 0.9, em) * (0.1 + band);
  float oiii = smoothstep(0.66, 0.9, fbm(d * 6.5 + s3 * 8.1, 5) * 0.5 + 0.5);
  float glob = smoothstep(0.62, 0.8, fbm(d * 30.0 + s3 * 4.4, 4) * 0.5 + 0.5);
  vec3 neb = (uNebA * emm + uNebB * emm * oiii * 0.9) * (1.0 - glob * 0.85);
  col += neb * uNebK * (1.0 - ext * 0.85);
  // Farbstimmung des Sektors: großflächige, faserige Gaswolken in zwei Tönen, dunkle Staubkanten davor
  float m1 = fbm(d * 1.5 + s3 * 0.7, 5) * 0.5 + 0.5;
  float m2 = fbm(d * 3.2 - s3 * 1.3 + vec3(m1 * 1.5), 5) * 0.5 + 0.5;
  float fil = pow(1.0 - abs(fbm(d * 6.0 + s3 * 2.1 + vec3(m2 * 2.0), 4)), 5.0);
  float body = pow(smoothstep(0.32, 0.86, m1), 1.5);
  float edge = smoothstep(0.55, 0.75, fbm(d * 9.0 + s3 * 3.3, 4) * 0.5 + 0.5);
  vec3 mood = mix(uMoodA, uMoodB, smoothstep(0.3, 0.75, m2)) * (body * (0.55 + 0.45 * fil) + fil * 0.18) * (1.0 - edge * 0.55);
  return col * uMW + mood * uMoodK * (1.0 - ext * 0.6) + vec3(0.0004, 0.00055, 0.0009);
}
void main() {
  vec3 d;
  if (uEquirect > 0.5) {
    // uRows: Streifen eines schrittweise gebackenen Rundumbilds (y0, Höhe als Anteil), sonst (0, 1)
    float vy = uRows.x + vUv.y * uRows.y;
    float lon = (vUv.x - 0.5) * 6.2831853, lat = (vy - 0.5) * 3.1415927;
    d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  } else {
    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    d = normalize(uCamRot * (v.xyz / v.w));
  }
  vec3 c = skyCol(d);
  // Sonne: im Himmelsbild nur das weite, weiche Streulicht; Scheibe, Korona und Strahlen zeichnet ein
  // eigenes Sprite in voller Auflösung (keine eckigen Lichthöfe)
  float a = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  c += uSunCol * (exp(-a / 0.12) * 0.07 + exp(-a / 0.45) * 0.018);
  if (uEquirect > 0.5 && uEquirect < 1.5) {
    float disc = smoothstep(uSunR, uSunR * 0.82, a);
    c += uSunCol * min(disc * 40.0 + exp(-a / max(uSunR * 1.3, 0.0015)) * 5.0 + exp(-a / 0.03) * 0.5, 24.0);
    // Spiegel-Umgebung: weiche Studio-Verteilung um das Führungslicht, kühles Himmelslicht oben, Planetenschein
    c += uSunCol * (pow(max(dot(d, uSunDir), 0.0), 4.0) * 0.55 + pow(max(dot(d, uSunDir), 0.0), 40.0) * 2.5);
    c += vec3(0.035, 0.042, 0.06) * (0.4 + 0.6 * max(d.y, 0.0));
    c += uPlanetCol * pow(max(dot(d, uPlanetDir), 0.0), 3.0) * 0.18;
  }
  if (uEncode > 0.5) {
    // 8-Bit-Speicher: kubische Wurzel + feines Rauschen gegen Stufen im dunklen Himmel
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
    gl_FragColor = vec4(pow(max(c, vec3(0.0)), vec3(1.0 / 3.0)) + n / 255.0, 1.0);
    return;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

// Taktisch: gebackenes Bild; uUvK gleicht den Sichtfeld-Kick aus (Bild ist mit Rand gebacken, Lochkamera → Skalierung)
const BG_VS = /* glsl */`uniform float uUvK; varying vec2 vUv; void main(){ vUv = 0.5 + (uv - 0.5) * uUvK; gl_Position = vec4(position.xy, 1.0, 1.0); }`;
// Verfolger: Himmel als Rundumbild (kubische Wurzel in 8 Bit), Richtung je Pixel aus der echten Kamera,
// uSkyRotT dreht Welt → Himmelsrahmen (Bildaufbau der Taktik-Kamera liegt dann vorn am Horizont)
const BGEQ_VS = /* glsl */`
uniform mat4 uInvProj; varying vec3 vDir;
void main() {
  vec4 v = uInvProj * vec4(position.xy, 1.0, 1.0);
  vDir = transpose(mat3(viewMatrix)) * (v.xyz / v.w);
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;
const BGEQ_FS = /* glsl */`
uniform sampler2D tEq; uniform mat3 uSkyRotT; uniform float uFade; varying vec3 vDir;
void main() {
  vec3 d = normalize(uSkyRotT * vDir);
  vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec3 c = texture2D(tEq, uv).rgb;
  gl_FragColor = vec4(c * c * c * uFade, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const BG_FS = /* glsl */`uniform sampler2D tSky; varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(tSky, vUv).rgb, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Sterne in unendlicher Ferne: nur Drehung der Kamera zählt (die es nie gibt) → auf dem Bild fest
const STAR_VS = /* glsl */`
attribute float aSize; attribute vec3 aColor;
uniform float uPR; uniform mat3 uSkyRot; uniform float uFade;
varying vec3 vC; varying float vS;
void main() {
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (uSkyRot * position), 1.0);
  p.z = p.w * 0.99999;
  gl_Position = p;
  float s = aSize * uPR;
  gl_PointSize = max(s, 1.0);
  vC = aColor * min(1.0, s * s) * uFade; vS = s;
}`;
const STAR_FS = /* glsl */`
varying vec3 vC; varying float vS;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = exp(-d * 4.0) * smoothstep(1.0, 0.55, d);   // kreisrund, am Rand exakt null
  gl_FragColor = vec4(vC * a, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
// Beugungsstrahlen der hellsten Sterne (6 Hauptstrahlen + 2 schwache, wie bei Webb-Aufnahmen)
const SPIKE_VS = /* glsl */`
attribute vec2 aCorner; attribute float aSize; attribute vec3 aColor;
uniform vec2 uRes; uniform mat3 uSkyRot;
varying vec2 vQ; varying vec3 vC;
void main() {
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (uSkyRot * position), 1.0);
  p.z = p.w * 0.99999;
  p.xy += aCorner * aSize / uRes * 2.0 * p.w;
  gl_Position = p; vQ = aCorner; vC = aColor;
}`;
const SPIKE_FS = /* glsl */`
varying vec2 vQ; varying vec3 vC;
void main() {
  float r = length(vQ);
  float ang = atan(vQ.y, vQ.x) + 1.5707963;
  float sp = pow(abs(cos(ang * 3.0)), 260.0) * exp(-r * 4.2) + 0.25 * pow(abs(cos(ang)), 900.0) * exp(-r * 6.0);
  float core = exp(-r * r * 900.0) * 2.0 + exp(-r * 38.0) * 0.18;
  gl_FragColor = vec4(vC * (sp * 0.55 + core) * smoothstep(1.0, 0.82, r), 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Sonne als eigenes Sprite: radialer Verlauf in voller Auflösung, HDR-Wert vor dem Bloom auf 24 begrenzt
const SUN_VS = /* glsl */`
attribute vec2 aCorner;
uniform vec3 uDir; uniform vec2 uRes; uniform float uHalf; uniform mat3 uSkyRot;
varying vec2 vQ;
void main() {
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * (uSkyRot * uDir), 1.0);
  p.z = p.w * 0.99999;
  p.xy += aCorner * uHalf / uRes * 2.0 * p.w;
  gl_Position = p; vQ = aCorner;
}`;
const SUN_FS = /* glsl */`
uniform vec3 uCol; uniform float uR, uSpike, uHalf, uRadPx;
varying vec2 vQ;
void main() {
  float rq = length(vQ);
  if (rq > 1.0) discard;
  float a = rq * uHalf * uRadPx;                  // Winkelabstand zur Sonnenmitte (rad)
  float disc = smoothstep(uR, uR * 0.8, a);
  float c = disc * 40.0 + exp(-a / max(uR * 1.3, 0.0015)) * 5.0 + exp(-a / 0.03) * 0.5;
  float ang = atan(vQ.y, vQ.x);
  float sp = pow(abs(cos(ang * 3.0)), 1400.0) + 0.3 * pow(abs(sin(ang)), 2400.0);
  c += sp * exp(-a / 0.035) * uSpike * 0.3;
  c = min(c, 24.0) * smoothstep(1.0, 0.6, rq);
  gl_FragColor = vec4(uCol * c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Spektralklassen: Farbe (sRGB) und Anteil unter den sichtbaren Sternen
const _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _n3 = new THREE.Matrix3();
const SPECTRAL = [
  [0x9bb0ff, 0.05], [0xaabfff, 0.08], [0xcad7ff, 0.14], [0xf8f7ff, 0.17],
  [0xfff4ea, 0.16], [0xffe4c4, 0.14], [0xffd2a1, 0.15], [0xffbd6f, 0.11],
];

export function cameraBasis(pitch) {
  const f = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
  const u = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
  const r = new THREE.Vector3(1, 0, 0);
  return { f, u, r };
}
// Richtung zu einem Punkt auf dem Bild (sx, sy in −1..1 bei 16:10, Bildmitte = 0)
export function screenDir(basis, sx, sy, out = new THREE.Vector3()) {
  const t = Math.tan(20 * Math.PI / 180);
  return out.copy(basis.f).addScaledVector(basis.r, sx * t * 1.6).addScaledVector(basis.u, sy * t).normalize();
}

export class Sky {
  constructor(gl, scene, pitch) {
    this.gl = gl;
    this.scene = scene;
    this.basis = cameraBasis(pitch);
    this.baker = new Baker(gl);
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);
    this.rt = null;
    this.opts = null;
    this._camRot = new THREE.Matrix3();
    this._tmpCam = new THREE.PerspectiveCamera();
    this.sunDir = new THREE.Vector3();
    this.sunScreen = new THREE.Vector2(0.8, 0.8);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix3() }, uEquirect: { value: 0 },
        uSunDir: { value: this.sunDir }, uSunCol: { value: new THREE.Color() }, uGalN: { value: new THREE.Vector3() },
        uGalC: { value: new THREE.Vector3() }, uCamUp: { value: this.basis.u }, uPlanetDir: { value: new THREE.Vector3() },
        uPlanetCol: { value: new THREE.Color() }, uSunR: { value: 0.01 }, uSpike: { value: 1 }, uMW: { value: 0.05 },
        uNebK: { value: 0.3 }, uSeed: { value: 0 },
        uNebA: { value: new THREE.Color(0.95, 0.20, 0.30) }, uNebB: { value: new THREE.Color(0.12, 0.55, 0.62) },
        uMoodA: { value: new THREE.Color() }, uMoodB: { value: new THREE.Color() }, uMoodK: { value: 0 },
        uEncode: { value: 0 }, uRows: { value: new THREE.Vector4(0, 1, 0, 0) },
      },
      vertexShader: BAKE_VS, fragmentShader: SKY_FS, depthTest: false, depthWrite: false,
    });
    // Drehung Himmelsrahmen → Welt (Verfolger-Kamera); Taktik: Einheitsmatrix
    this.skyRot = new THREE.Matrix3();
    this.skyRotT = new THREE.Matrix3();
    this.fovMargin = 0;      // Taktik-Bild mit Rand backen (Sichtfeld-Kick)
    this.baseFov = 0;        // 0 = Sichtfeld der übergebenen Kamera
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { tSky: { value: null }, uUvK: { value: 1 } }, vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false,
    });
    // Rundumbild für die Verfolger-Kamera (schrittweise gebacken, erst bei Bedarf)
    this.eq = null;
    this.bgEqMat = new THREE.ShaderMaterial({
      uniforms: { tEq: { value: null }, uSkyRotT: { value: this.skyRotT }, uInvProj: { value: new THREE.Matrix4() }, uFade: { value: 1 } },
      vertexShader: BGEQ_VS, fragmentShader: BGEQ_FS, depthTest: false, depthWrite: false,
    });
    this.bgEq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgEqMat);
    this.bgEq.frustumCulled = false; this.bgEq.renderOrder = -1000; this.bgEq.visible = false;
    this.group.add(this.bgEq);
    this.chaseK = 0;
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    this.bg.frustumCulled = false; this.bg.renderOrder = -1000;
    this.group.add(this.bg);
    this.stars = null; this.spikes = null;
    // Sonne
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    sg.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), 2));
    sg.setIndex([0, 1, 2, 2, 1, 3]);
    this.sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uDir: { value: this.sunDir }, uRes: { value: new THREE.Vector2(1, 1) }, uHalf: { value: 200 }, uRadPx: { value: 0.0005 },
        uCol: { value: new THREE.Color() }, uR: { value: 0.01 }, uSpike: { value: 1 }, uSkyRot: { value: this.skyRot },
      },
      vertexShader: SUN_VS, fragmentShader: SUN_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.sun = new THREE.Mesh(sg, this.sunMat);
    this.sun.frustumCulled = false; this.sun.renderOrder = -997;
    this.group.add(this.sun);
  }

  // opts: { seed, sun: [sx, sy], sunR, sunCol, spike, galTilt, galRoll, mw, neb, planetDir, planetCol, quality }
  build(opts, camera, w, h) {
    this.opts = opts;
    const B = this.basis, U = this.skyMat.uniforms;
    screenDir(B, opts.sun[0], opts.sun[1], this.sunDir);
    U.uSunCol.value.copy(opts.sunCol);
    U.uSunR.value = opts.sunR;
    U.uSpike.value = opts.spike;
    U.uMW.value = opts.mw;
    U.uNebK.value = opts.neb;
    U.uSeed.value = (opts.seed % 1000) * 0.137;
    U.uNebA.value.copy(opts.nebA || new THREE.Color(0.95, 0.20, 0.30));
    U.uNebB.value.copy(opts.nebB || new THREE.Color(0.12, 0.55, 0.62));
    if (opts.moodA) U.uMoodA.value.copy(opts.moodA);
    if (opts.moodB) U.uMoodB.value.copy(opts.moodB);
    U.uMoodK.value = opts.moodK || 0;
    const SU = this.sunMat.uniforms;
    SU.uCol.value.copy(opts.sunCol); SU.uR.value = opts.sunR; SU.uSpike.value = opts.spike;
    // Galaktische Ebene: schräg durchs Bild
    const c = screenDir(B, opts.galC[0], opts.galC[1], new THREE.Vector3());
    const along = screenDir(B, opts.galC[0] + Math.cos(opts.galTilt), opts.galC[1] + Math.sin(opts.galTilt), new THREE.Vector3());
    U.uGalN.value.crossVectors(c, along).normalize();
    U.uGalC.value.copy(screenDir(B, opts.galCore[0], opts.galCore[1], new THREE.Vector3()));
    U.uGalC.value.addScaledVector(U.uGalN.value, -U.uGalC.value.dot(U.uGalN.value)).normalize();
    U.uPlanetDir.value.copy(opts.planetDir || B.f);
    U.uPlanetCol.value.copy(opts.planetCol || new THREE.Color(0, 0, 0));
    this._buildStars(opts);
    if (this.eq) this.eq.row = 0;        // neuer Himmel: Rundumbild neu backen (bei Bedarf)
    if (this.eq) this.eq.ready = false;
    this._disposeOuter();
    this.resize(camera, w, h);
  }

  _band(d) {
    const n = this.skyMat.uniforms.uGalN.value;
    const b = d.dot(n);
    return Math.exp(-b * b / 0.02);
  }

  _buildStars(opts) {
    this._disposeStars();
    const q = opts.quality;
    const count = opts.stars || (q >= 2 ? 7000 : q === 1 ? 4500 : 2600); // opts.stars: Spiel-Ultra dichter
    const R = rng(opts.seed * 7 + 3);
    const B = this.basis;
    const cosMax = Math.cos(50 * Math.PI / 180);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), siz = new Float32Array(count);
    const d = new THREE.Vector3(), tmp = new THREE.Vector3(), side = new THREE.Vector3(), c = new THREE.Color();
    const bright = [];
    let i = 0, guard = 0;
    while (i < count && guard++ < count * 20) {
      const ct = cosMax + (1 - cosMax) * R(), st = Math.sqrt(1 - ct * ct), ph = R() * Math.PI * 2;
      side.copy(B.r).multiplyScalar(Math.cos(ph) * st).addScaledVector(B.u, Math.sin(ph) * st);
      d.copy(B.f).multiplyScalar(ct).add(side).normalize();
      const band = this._band(d);
      if (R() > 0.28 + 0.72 * band) continue;
      // Helligkeit: viele schwache, wenige helle (Potenzgesetz)
      const u = R();
      const flux = 0.05 + 0.5 * Math.pow(u, 5) + 9 * Math.pow(u, 40);
      // Farbe nach Spektralklasse; schwache Sterne eher kühl (K/M), helle eher heiß
      let k = R() * (flux > 1 ? 0.75 : 1);
      let s = 0;
      for (; s < SPECTRAL.length - 1; s++) { k -= SPECTRAL[s][1]; if (k <= 0) break; }
      c.setHex(SPECTRAL[s][0]); // sRGB → linear passiert in setHex
      const sat = 1.25;
      const lum = (c.r + c.g + c.b) / 3;
      c.r = lum + (c.r - lum) * sat; c.g = lum + (c.g - lum) * sat; c.b = lum + (c.b - lum) * sat;
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      // helle Sterne: größer statt greller (kein Überstrahlen zum Quadrat im Bloom)
      const size = 1.1 + Math.min(3.6, Math.sqrt(flux) * 1.15);
      siz[i] = size;
      const e = Math.min(flux, 2.4) * 1.35 + Math.max(0, flux - 2.4) * 0.12;
      col[i * 3] = Math.max(0, c.r) * e; col[i * 3 + 1] = Math.max(0, c.g) * e; col[i * 3 + 2] = Math.max(0, c.b) * e;
      if (flux > 2.2) bright.push(i);
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, i * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz.subarray(0, i), 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uPR: { value: 1 }, uSkyRot: { value: this.skyRot }, uFade: { value: 1 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.stars.frustumCulled = false; this.stars.renderOrder = -999;
    this.group.add(this.stars);

    if (q >= 1 && bright.length) {
      const n = Math.min(bright.length, 9);
      const sp = new Float32Array(n * 4 * 3), corner = new Float32Array(n * 4 * 2), sz = new Float32Array(n * 4), sc = new Float32Array(n * 4 * 3);
      const idx = [];
      for (let k = 0; k < n; k++) {
        const s = bright[k];
        const f = Math.min(1, (col[s * 3] + col[s * 3 + 1] + col[s * 3 + 2]) / 18);
        for (let v = 0; v < 4; v++) {
          const o = k * 4 + v;
          sp[o * 3] = pos[s * 3]; sp[o * 3 + 1] = pos[s * 3 + 1]; sp[o * 3 + 2] = pos[s * 3 + 2];
          corner[o * 2] = v & 1 ? 1 : -1; corner[o * 2 + 1] = v & 2 ? 1 : -1;
          sz[o] = 16 + f * 34;
          sc[o * 3] = col[s * 3] * 0.22; sc[o * 3 + 1] = col[s * 3 + 1] * 0.22; sc[o * 3 + 2] = col[s * 3 + 2] * 0.22;
        }
        const b = k * 4;
        idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
      g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
      g.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
      g.setIndex(idx);
      this.spikeMat = new THREE.ShaderMaterial({
        uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uSkyRot: { value: this.skyRot } }, vertexShader: SPIKE_VS, fragmentShader: SPIKE_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      this.spikes = new THREE.Mesh(g, this.spikeMat);
      this.spikes.frustumCulled = false; this.spikes.renderOrder = -998;
      this.group.add(this.spikes);
    }
  }

  // Himmelbild in Bildschirmgröße neu backen (nur bei Größenänderung / neuem Sektor)
  resize(camera, w, h) {
    if (!this.opts) return;
    const q = this.opts.quality;
    const k = this.opts.bake || (q >= 2 ? 0.5 : q === 1 ? 0.4 : 0.3); // opts.bake: Spiel-Ultra feiner (einmalig gebacken)
    const bw = Math.max(64, Math.round(w * k)), bh = Math.max(64, Math.round(h * k));
    if (!this.rt || this.rt.width !== bw || this.rt.height !== bh) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
    }
    const tc = this._tmpCam;
    tc.fov = (this.baseFov || camera.fov) + this.fovMargin; tc.aspect = camera.aspect; tc.near = camera.near; tc.far = camera.far;
    tc.updateProjectionMatrix();
    tc.position.set(0, 0, 0);
    tc.lookAt(this.basis.f);
    tc.updateMatrixWorld(true);
    const U = this.skyMat.uniforms;
    U.uInvProj.value.copy(tc.projectionMatrixInverse);
    U.uCamRot.value.setFromMatrix4(tc.matrixWorld);
    U.uEquirect.value = 0;
    this.baker.run(this.skyMat, this.rt);
    this.bgMat.uniforms.tSky.value = this.rt.texture;
    if (this.spikeMat) this.spikeMat.uniforms.uRes.value.set(w, h);
    const SU = this.sunMat.uniforms, radPx = ((this.baseFov || camera.fov) * Math.PI / 180) / h;
    SU.uRes.value.set(w, h); SU.uRadPx.value = radPx;
    this._bakeFov = tc.fov;
    SU.uHalf.value = Math.min(900, Math.max(0.16, this.opts.sunR * 30) / radPx);
    // Sonne auf dem Bild (für Linsenreflexe) – mit dem echten Sichtfeld, nicht dem Backrand
    if (this.fovMargin) { tc.fov = this.baseFov || camera.fov; tc.updateProjectionMatrix(); }
    const p = new THREE.Vector3().copy(this.sunDir).applyMatrix4(tc.matrixWorldInverse).applyMatrix4(tc.projectionMatrix);
    this.sunScreen.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
  }

  /** Taktik-Bild bei Sichtfeld fov (Grad) richtig skalieren (gebacken mit Rand) */
  setFov(fov) {
    const b = this._bakeFov || fov;
    this.bgMat.uniforms.uUvK.value = Math.tan(fov * Math.PI / 360) / Math.tan(b * Math.PI / 360);
  }

  // ---------- Verfolger-Kamera: Rundumbild ----------
  /**
   * Übergang 0 (Taktik) … 1 (Verfolger). q = Drehung Himmelsrahmen → Welt (Quaternion). Ab k > 0 zeichnet das
   * Rundumbild den Hintergrund; es wird beim ersten Bedarf grob (sofort) und danach fein in Streifen gebacken.
   */
  setChase(k, q, camera, quality) {
    this.chaseK = k;
    _m4.makeRotationFromQuaternion(q);
    this.skyRot.setFromMatrix4(_m4);
    this.skyRotT.copy(this.skyRot).transpose();
    const on = k > 0.001;
    if (on) this._ensureEq(quality);
    const ready = on && this.eq && this.eq.low;
    this.bg.visible = !ready;
    this.bgEq.visible = !!ready;
    if (ready) this.bgEqMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
    if (on && !this.outer && this.opts) this._buildOuter();
    if (this.outer) { this.outer.visible = on; this.outerMat.uniforms.uFade.value = k; }
  }
  _ensureEq(quality) {
    const W = quality >= 2 ? 3072 : 2048, H = W / 2;
    let E = this.eq;
    if (!E || E.w !== W) {
      if (E) { E.rt.dispose(); if (E.lowRt) E.lowRt.dispose(); }
      const opt = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.RepeatWrapping };
      E = this.eq = { w: W, h: H, row: 0, ready: false, low: false, rt: new THREE.WebGLRenderTarget(W, H, opt), lowRt: new THREE.WebGLRenderTarget(768, 384, opt) };
      E.rt.texture.wrapS = THREE.RepeatWrapping; E.lowRt.texture.wrapS = THREE.RepeatWrapping;
    }
    if (!E.low) {
      // grob sofort (≈ 0,3 MPx), danach fein in Streifen (je Bild ≈ 0,2 MPx, kein Ruckler)
      this._bakeEq(E.lowRt, 0, 384, 384);
      E.low = true;
      this.bgEqMat.uniforms.tEq.value = E.lowRt.texture;
    }
    if (!E.ready) {
      const rows = Math.max(32, Math.round(200000 / E.w));
      const n = Math.min(rows, E.h - E.row);
      this._bakeEq(E.rt, E.row, n, E.h);
      E.row += n;
      if (E.row >= E.h) { E.ready = true; this.bgEqMat.uniforms.tEq.value = E.rt.texture; }
    }
  }
  _bakeEq(rt, y0, n, H) {
    const U = this.skyMat.uniforms;
    U.uEquirect.value = 2; U.uEncode.value = 1; U.uRows.value.set(y0 / H, n / H, 0, 0);
    rt.viewport.set(0, y0, rt.width, n); rt.scissor.set(0, y0, rt.width, n); rt.scissorTest = true;
    this.baker.run(this.skyMat, rt);
    rt.viewport.set(0, 0, rt.width, rt.height); rt.scissor.set(0, 0, rt.width, rt.height); rt.scissorTest = false;
    U.uEquirect.value = 0; U.uEncode.value = 0; U.uRows.value.set(0, 1, 0, 0);
  }
  // Sterne außerhalb des Taktik-Bildkegels (nur Verfolger): gleiche Verteilung, etwas dünner
  _buildOuter() {
    const opts = this.opts, q = opts.quality;
    const count = q >= 2 ? 14000 : q === 1 ? 8000 : 4500;
    const R = rng(opts.seed * 13 + 11);
    const B = this.basis, cosMax = Math.cos(50 * Math.PI / 180);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), siz = new Float32Array(count);
    const d = new THREE.Vector3(), c = new THREE.Color();
    let i = 0, guard = 0;
    while (i < count && guard++ < count * 20) {
      const z = R() * 2 - 1, ph = R() * Math.PI * 2, st = Math.sqrt(1 - z * z);
      d.set(st * Math.cos(ph), z, st * Math.sin(ph));
      if (d.dot(B.f) > cosMax) continue; // liegt im Kegel der Taktik-Sterne
      const band = this._band(d);
      if (R() > 0.22 + 0.78 * band) continue;
      const u = R();
      const flux = 0.05 + 0.5 * Math.pow(u, 5) + 9 * Math.pow(u, 40);
      let k = R() * (flux > 1 ? 0.75 : 1), s = 0;
      for (; s < SPECTRAL.length - 1; s++) { k -= SPECTRAL[s][1]; if (k <= 0) break; }
      c.setHex(SPECTRAL[s][0]);
      pos[i * 3] = d.x; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.z;
      siz[i] = 1.1 + Math.min(3.6, Math.sqrt(flux) * 1.15);
      const e = Math.min(flux, 2.4) * 1.35 + Math.max(0, flux - 2.4) * 0.12;
      col[i * 3] = c.r * e; col[i * 3 + 1] = c.g * e; col[i * 3 + 2] = c.b * e;
      i++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, i * 3), 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col.subarray(0, i * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(siz.subarray(0, i), 1));
    this.outerMat = new THREE.ShaderMaterial({
      uniforms: { uPR: this.starMat.uniforms.uPR, uSkyRot: { value: this.skyRot }, uFade: { value: 0 } },
      vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.outer = new THREE.Points(geo, this.outerMat);
    this.outer.frustumCulled = false; this.outer.renderOrder = -999;
    this.group.add(this.outer);
  }
  _disposeOuter() {
    if (!this.outer) return;
    this.group.remove(this.outer); this.outer.geometry.dispose(); this.outerMat.dispose();
    this.outer = null; this.outerMat = null;
  }
  /** Sonne auf dem Bild (0..1) für die aktuelle Kamera, z < 1 = vor der Kamera */
  sunOnScreen(camera, out) {
    _v3.copy(this.sunDir).applyMatrix3(this.skyRot);
    _v3.applyMatrix3(_n3.setFromMatrix4(camera.matrixWorldInverse));
    const inFront = _v3.z < 0;
    _v3.applyMatrix4(camera.projectionMatrix);
    out.set(_v3.x * 0.5 + 0.5, _v3.y * 0.5 + 0.5);
    return inFront;
  }

  // Umgebungs-Textur (Spiegelungen auf Rümpfen): derselbe Himmel als Rundumbild
  bakeEquirect(keyDir) {
    const rt = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, depthBuffer: false });
    const U = this.skyMat.uniforms;
    U.uEquirect.value = 1;
    const sunKeep = this.sunDir.clone();
    if (keyDir) this.sunDir.copy(keyDir);
    const sr = U.uSunR.value, sk = U.uSpike.value;
    U.uSunR.value = Math.max(sr, 0.02); U.uSpike.value = 0;
    this.baker.run(this.skyMat, rt);
    U.uSunR.value = sr; U.uSpike.value = sk; U.uEquirect.value = 0;
    this.sunDir.copy(sunKeep);
    rt.texture.mapping = THREE.EquirectangularReflectionMapping;
    return rt;
  }

  update(pr) { if (this.starMat) this.starMat.uniforms.uPR.value = pr; }

  _disposeStars() {
    if (this.stars) { this.group.remove(this.stars); this.stars.geometry.dispose(); this.starMat.dispose(); this.stars = null; }
    if (this.spikes) { this.group.remove(this.spikes); this.spikes.geometry.dispose(); this.spikeMat.dispose(); this.spikes = null; this.spikeMat = null; }
  }

  dispose() {
    this._disposeStars();
    this._disposeOuter();
    if (this.eq) { this.eq.rt.dispose(); this.eq.lowRt.dispose(); this.eq = null; }
    this.bgEqMat.dispose(); this.bgEq.geometry.dispose();
    this.scene.remove(this.group);
    if (this.rt) this.rt.dispose();
    this.rt = null;
    this.skyMat.dispose(); this.bgMat.dispose(); this.bg.geometry.dispose();
    this.sunMat.dispose(); this.sun.geometry.dispose();
    this.baker.dispose();
  }
}
