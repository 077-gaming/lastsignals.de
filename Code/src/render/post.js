// Kamera-Look als letzter Durchgang: Tonwertabbildung, leichte chromatische Aberration am Rand,
// Linsenreflexe der Sonne (Geisterbilder entlang der Bildachse), sanfte Vignette, feines Filmkorn,
// Hyperraum-Austritt (radiale Streckung + Farbsaum am Rand), rote Rand-Vignette nahe der Sektorgrenze.
// Ersetzt OutputPass (ein Vollbild-Durchgang statt zwei) und addiert das Nachleuchten (statt eigener Mischung).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = /* glsl */`
precision highp float;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
attribute vec3 position; attribute vec2 uv;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;     // Nachleuchten (bloom.js), Viertelauflösung, vor der Tonwertabbildung addiert
uniform float uBloomK;
uniform float uTime, uGrain, uCA, uVig, uFlare, uAspect, uWarp, uDanger;
uniform vec2 uSun;            // Sonne in Bildkoordinaten (0..1)
uniform vec3 uSunCol;
uniform vec2 uLensC, uLensR; uniform float uLensK;   // Sprungtor: Gravitationslinse (Mitte, Halbachsen in Bildkoordinaten)
uniform vec2 uTexel;          // 1 / Puffergröße (FXAA)
uniform vec2 uHeatA, uHeatB; uniform float uHeatW, uHeatK;   // Hitzeflimmern hinter den Düsen (Strecke im Bild)
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;

float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 ghost(vec2 uv, vec2 c, float r, vec3 col) {
  vec2 d = uv - c; d.x *= uAspect;
  float l = length(d) / r;
  float disc = smoothstep(1.0, 0.86, l) * (0.35 + 0.65 * smoothstep(0.2, 1.0, l));
  return col * disc;
}

#ifdef USE_FXAA
// FXAA (vereinfachte Konsolen-Variante): glättet Kanten, wenn kein MSAA läuft (Pixeldichte unter 1,5).
// Luma aus dem HDR-Puffer weich begrenzt, damit helle Lichter die Kantenerkennung nicht überstrahlen.
float lsL(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
vec3 fxaa(vec2 uv, out vec3 mid) {
  vec3 nw = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 ne = texture2D(tDiffuse, uv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 sw = texture2D(tDiffuse, uv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 se = texture2D(tDiffuse, uv + vec2(1.0, 1.0) * uTexel).rgb;
  mid = texture2D(tDiffuse, uv).rgb;
  float lNW = lsL(nw), lNE = lsL(ne), lSW = lsL(sw), lSE = lsL(se), lM = lsL(mid);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.03, lMax * 0.125)) return mid;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
  float lB = lsL(b);
  return (lB < lMin || lB > lMax) ? a : b;
}
#endif

void main() {
  vec2 cuv = vUv - 0.5;
  float r2 = dot(cuv, cuv);
  // Linse: Hintergrund im Tor wird zum Einstein-Ring gebogen (Quelle bei θ − θE²/θ)
  vec2 uvL = vUv;
  if (uLensK > 0.001) {
    vec2 d = (vUv - uLensC) / uLensR;
    float r = length(d);
    if (r < 1.0) {
      float E = 0.4;
      vec2 src = d * (1.0 - E * E / (r * r + 0.015));
      uvL = mix(vUv, uLensC + src * uLensR, smoothstep(1.0, 0.6, r) * uLensK);
    }
  }
  // Hitzeflimmern: feine, schnelle Verzerrung entlang der Strecke Düse → Abgas, nach hinten schwächer
  if (uHeatK > 0.001) {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 pa = (vUv - uHeatA) * asp, ba = (uHeatB - uHeatA) * asp;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    float d = length(pa - ba * h);
    float w = uHeatW * uAspect * (0.7 + 1.6 * h);
    float m = exp(-d * d / (w * w)) * (1.0 - h * 0.7) * smoothstep(0.0, 0.06, h);
    vec2 off = vec2(sin(vUv.y * 620.0 + uTime * 31.0) + 0.6 * sin(vUv.x * 410.0 - uTime * 23.0),
                    cos(vUv.x * 560.0 + uTime * 27.0) + 0.6 * cos(vUv.y * 380.0 - uTime * 19.0));
    uvL += off * 0.0012 * m * uHeatK;
  }
  vec3 c;
  #ifdef USE_FXAA
    vec3 mid;
    c = fxaa(uvL, mid);
    #ifdef USE_CA
      vec2 off = cuv * r2 * uCA;
      c.r += texture2D(tDiffuse, uvL - off).r - mid.r;
      c.b += texture2D(tDiffuse, uvL + off).b - mid.b;
      c = max(c, vec3(0.0));
    #endif
  #else
  #ifdef USE_CA
    // Farbsaum wächst mit r²: in der Bildmitte (unter einem halben Pixel Versatz) nur eine Probe statt drei
    c = texture2D(tDiffuse, uvL).rgb;
    #ifdef LS_CA_FULL
    if (true) {
    #else
    if (r2 * sqrt(r2) * uCA > uTexel.x * 0.5) {
    #endif
      vec2 off = cuv * r2 * uCA;
      c.r = texture2D(tDiffuse, uvL - off).r;
      c.b = texture2D(tDiffuse, uvL + off).b;
    }
  #else
    c = texture2D(tDiffuse, uvL).rgb;
  #endif
  #endif

  #ifdef USE_BLOOM
    c += texture2D(tBloom, uvL).rgb * uBloomK;
  #endif

  // Hyperraum-Austritt: Sterne als Striche zur Bildmitte, Farbsaum am Rand (nur kurz nach dem Sprung)
  if (uWarp > 0.002) {
    vec3 acc = c; float ws = 1.0;
    for (int i = 1; i < 9; i++) {
      float k = float(i) / 9.0;
      float w = 1.0 - k;
      acc += texture2D(tDiffuse, vUv - cuv * k * 0.16 * uWarp).rgb * w;
      ws += w;
    }
    vec2 off2 = cuv * r2 * 0.09 * uWarp;
    vec3 ca = vec3(texture2D(tDiffuse, vUv - off2).r, c.g, texture2D(tDiffuse, vUv + off2).b);
    c = mix(ca, max(acc / ws, c), uWarp * smoothstep(0.0, 0.08, r2));
  }

  #ifdef USE_FLARE
    // Geisterbilder: auf der Linie Sonne → Bildmitte → gegenüber
    vec2 axis = vec2(0.5) - uSun;
    vec3 fl = vec3(0.0);
    fl += ghost(vUv, uSun + axis * 0.55, 0.020, vec3(0.20, 0.32, 0.45));
    fl += ghost(vUv, uSun + axis * 1.25, 0.045, vec3(0.16, 0.30, 0.22));
    fl += ghost(vUv, uSun + axis * 1.55, 0.012, vec3(0.45, 0.30, 0.16));
    fl += ghost(vUv, uSun + axis * 1.95, 0.080, vec3(0.10, 0.12, 0.22));
    // weicher Schleier um die Sonne (Streulicht in der Optik)
    vec2 sd = vUv - uSun; sd.x *= uAspect;
    float veil = exp(-length(sd) * 5.0) * 0.05;
    c += (fl * 0.018 + veil) * uFlare * uSunCol;
  #endif

  #if defined( ACES_FILMIC_TONE_MAPPING )
    c = ACESFilmicToneMapping(c);
  #elif defined( AGX_TONE_MAPPING )
    c = AgXToneMapping(c);
  #elif defined( NEUTRAL_TONE_MAPPING )
    c = NeutralToneMapping(c);
  #endif
  vec4 o = sRGBTransferOETF(vec4(c, 1.0));

  // Vignette (sanft, optisch: cos^4-ähnlich)
  float v = 1.0 - uVig * smoothstep(0.08, 0.62, r2 * 1.55);
  o.rgb *= v;
  // Gefahrenzone: leichte rote Vignette, wächst mit der Nähe zur Grenze
  float dv = smoothstep(0.06, 0.5, r2 * 1.6) * uDanger;
  o.rgb = mix(o.rgb, o.rgb * vec3(0.9, 0.6, 0.55) + vec3(0.03, 0.003, 0.0), dv * 0.65);

  #ifdef USE_GRAIN
    float n = h12(gl_FragCoord.xy + fract(uTime * 7.31) * 911.0) + h12(gl_FragCoord.xy * 1.37 - fract(uTime * 3.7) * 577.0) - 1.0;
    float lum = dot(o.rgb, vec3(0.299, 0.587, 0.114));
    o.rgb += n * uGrain * (1.0 - lum * 0.7);
  #endif
  gl_FragColor = vec4(o.rgb, 1.0);
}`;

export class CameraLookPass extends Pass {
  constructor() {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, tBloom: { value: null }, uBloomK: { value: 0 },
      uTime: { value: 0 }, uGrain: { value: 0.022 }, uCA: { value: 0.006 }, uVig: { value: 0.32 },
      uFlare: { value: 0 }, uAspect: { value: 1.6 }, uWarp: { value: 0 }, uDanger: { value: 0 }, uSun: { value: new THREE.Vector2(0.75, 0.8) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.88) },
      uLensC: { value: new THREE.Vector2(0.5, 0.5) }, uLensR: { value: new THREE.Vector2(0.1, 0.1) }, uLensK: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
      uHeatA: { value: new THREE.Vector2() }, uHeatB: { value: new THREE.Vector2() }, uHeatW: { value: 0.01 }, uHeatK: { value: 0 },
    };
    this.material = new THREE.RawShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(this.material);
    this._key = '';
    this.quality = 2;
    this.fxaa = false;
    this.bloom = null; // BloomPass (bloom.js): Ergebnis wird hier addiert
  }

  setQuality(q) { this.quality = q; this._key = ''; }
  setFxaa(on) { if (on !== this.fxaa) { this.fxaa = on; this._key = ''; } }
  setSize(w, h) { this.uniforms.uTexel.value.set(1 / Math.max(1, w), 1 / Math.max(1, h)); }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.toneMappingExposure.value = renderer.toneMappingExposure;
    const bloom = !!(this.bloom && this.bloom.enabled);
    if (bloom) { u.tBloom.value = this.bloom.texture; u.uBloomK.value = this.bloom.strength; }
    const key = renderer.toneMapping + ':' + this.quality + ':' + (u.uFlare.value > 0) + ':' + this.fxaa + ':' + bloom + ':' + !!this.legacy;
    if (key !== this._key) {
      this._key = key;
      const d = {};
      if (renderer.toneMapping === THREE.ACESFilmicToneMapping) d.ACES_FILMIC_TONE_MAPPING = '';
      else if (renderer.toneMapping === THREE.AgXToneMapping) d.AGX_TONE_MAPPING = '';
      else if (renderer.toneMapping === THREE.NeutralToneMapping) d.NEUTRAL_TONE_MAPPING = '';
      if (this.quality >= 1) { d.USE_GRAIN = ''; d.USE_CA = ''; }
      if (this.quality >= 2 && u.uFlare.value > 0) d.USE_FLARE = '';
      if (this.fxaa) d.USE_FXAA = '';
      if (bloom) d.USE_BLOOM = '';
      if (this.legacy) d.LS_CA_FULL = ''; // nur Messungen (Vorher/Nachher)
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    if (this.renderToScreen) renderer.setRenderTarget(null);
    else { renderer.setRenderTarget(writeBuffer); if (this.clear) renderer.clear(); }
    this.fsQuad.render(renderer);
  }

  dispose() { this.material.dispose(); this.fsQuad.dispose(); }
}
