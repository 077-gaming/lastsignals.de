// Nachleuchten (Bloom) mit wenigen Durchgängen. Ersetzt UnrealBloomPass (13 Render-Durchgänge + Vollbild-Mischung)
// durch 2 kleine Durchgänge: Auf Apple-GPUs (ANGLE/Metal) kostet jeder Zielwechsel ≈ 0,3–0,5 ms, egal wie klein.
//  1. Hellpass: Szene → 1/4 Auflösung, je 4 bilineare Proben (deckt jeden Quellpixel ab, kein Flimmern dünner Laser),
//     Schwelle wie UnrealBloom (Luminanz, smoothstep 0,92 … 0,93). Danach erzeugt die Grafikkarte die Mip-Kette (Blit).
//  2. Zusammenführen: fünf Unschärfe-Stufen aus der Mip-Kette (je 3×3 Binomial-Proben, Breite wie UnrealBloom:
//     σ ≈ 3 / 10 / 30 / 78 / 192 Texel der Viertelauflösung), gewichtet wie UnrealBloom (radius 0,55).
//     Abgeglichen per Rückmessung gegen UnrealBloomPass (gleiches Bild, Helligkeitsprofile um helle Punkte).
// Der Kamera-Durchgang (post.js) addiert das Ergebnis vor der Tonwertabbildung (spart die Vollbild-Mischung).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT_FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uOff;          // Probenversatz in UV (Viertel des Verkleinerungsfaktors in Quelltexeln)
uniform float uThr;
varying vec2 vUv;
vec3 hp(vec2 uv) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float v = dot(c, vec3(0.299, 0.587, 0.114));
  return c * smoothstep(uThr, uThr + 0.01, v);
}
void main() {
  vec3 c = hp(vUv + vec2(-uOff.x, -uOff.y)) + hp(vUv + vec2(uOff.x, -uOff.y))
         + hp(vUv + vec2(-uOff.x, uOff.y)) + hp(vUv + vec2(uOff.x, uOff.y));
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;

const COMP_FS = /* glsl */`
precision highp float;
uniform sampler2D tBright;
uniform vec2 uSize;          // Größe von Stufe 0
uniform vec4 uLodA; uniform float uLodB;   // Mip-Stufe je Unschärfe-Stufe
uniform vec4 uWA; uniform float uWB;       // Gewicht je Stufe
varying vec2 vUv;
vec3 blurAt(float lod) {
  vec2 t = 1.25 * exp2(lod) / uSize;
  vec3 s = textureLod(tBright, vUv, lod).rgb * 4.0;
  s += (textureLod(tBright, vUv + vec2(t.x, 0.0), lod).rgb + textureLod(tBright, vUv - vec2(t.x, 0.0), lod).rgb
      + textureLod(tBright, vUv + vec2(0.0, t.y), lod).rgb + textureLod(tBright, vUv - vec2(0.0, t.y), lod).rgb) * 2.0;
  s += textureLod(tBright, vUv + t, lod).rgb + textureLod(tBright, vUv - t, lod).rgb
     + textureLod(tBright, vUv + vec2(t.x, -t.y), lod).rgb + textureLod(tBright, vUv + vec2(-t.x, t.y), lod).rgb;
  return s * (1.0 / 16.0);
}
// breite Stufen: die Mip-Kette ist dort schon weich, 5 Proben (Kreuz) reichen statt 9 (spart ≈ 35 % Proben)
#ifdef LS_FULL9
vec3 blurAt5(float lod) { return blurAt(lod); }
#else
vec3 blurAt5(float lod) {
  vec2 t = 1.4 * exp2(lod) / uSize;
  vec3 s = textureLod(tBright, vUv, lod).rgb * 2.0;
  s += textureLod(tBright, vUv + vec2(t.x, t.y * 0.5), lod).rgb + textureLod(tBright, vUv - vec2(t.x, t.y * 0.5), lod).rgb
     + textureLod(tBright, vUv + vec2(-t.x * 0.5, t.y), lod).rgb + textureLod(tBright, vUv + vec2(t.x * 0.5, -t.y), lod).rgb;
  return s * (1.0 / 6.0);
}
#endif
void main() {
  vec3 c = blurAt(uLodA.x) * uWA.x + blurAt(uLodA.y) * uWA.y + blurAt5(uLodA.z) * uWA.z + blurAt5(uLodA.w) * uWA.w;
  #if LEVELS > 4
  c += blurAt5(uLodB) * uWB;
  #endif
  gl_FragColor = vec4(c, 1.0);
}`;

// Breite der fünf UnrealBloom-Stufen (Kette aufaddiert), in Texeln der Viertelauflösung
const SIGMA = [3, 10.4, 29.9, 77.9, 192];
const FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2];

export class BloomPass extends Pass {
  constructor(strength = 0.5, radius = 0.55, threshold = 0.92) {
    super();
    this.strength = strength;
    this.radius = radius;
    this.threshold = threshold;
    this.needsSwap = false;
    this.levels = 5;
    const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false };
    this.rtBright = new THREE.WebGLRenderTarget(4, 4, { ...rtOpt, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    this.rtBright.texture.generateMipmaps = true;
    this.rtOut = new THREE.WebGLRenderTarget(4, 4, rtOpt);
    this.rtOut.texture.generateMipmaps = false;
    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uOff: { value: new THREE.Vector2() }, uThr: { value: threshold } },
      vertexShader: VS, fragmentShader: BRIGHT_FS, depthTest: false, depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      defines: { LEVELS: 5 },
      uniforms: {
        tBright: { value: this.rtBright.texture }, uSize: { value: new THREE.Vector2(1, 1) },
        uLodA: { value: new THREE.Vector4() }, uLodB: { value: 0 }, uWA: { value: new THREE.Vector4() }, uWB: { value: 0 },
      },
      vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(null);
    this._srcW = 4; this._srcH = 4; this._maxLod = 8;
    this.setLevels(5);
  }

  get texture() { return this.rtOut.texture; }
  /** Nur Messungen (Vorher/Nachher): alte Probenzahl (9 je Stufe) */
  setLegacy(on) {
    if (!!this.compMat.defines.LS_FULL9 === !!on) return;
    if (on) this.compMat.defines.LS_FULL9 = ''; else delete this.compMat.defines.LS_FULL9;
    this.compMat.needsUpdate = true;
  }

  // Anzahl Unschärfe-Stufen (4 bei niedriger Qualität: breitester Schleier fällt weg)
  setLevels(n) {
    this.levels = n;
    this.compMat.defines.LEVELS = n;
    this.compMat.needsUpdate = true;
    this._lods();
  }

  _lods() {
    const U = this.compMat.uniforms;
    // σ_gesamt ≈ 2^L · 2,2 (3×3 Binomial bei 1,25 Texel + Kastenfilter der Mip-Kette + trilinear),
    // gegen UnrealBloomPass gemessen: Spitzen und Ausläufer je Stufe ±10 %, Gesamthelligkeit +2 %
    const L = SIGMA.map((s) => Math.min(this._maxLod, Math.max(0, Math.log2(s / 2.2))));
    U.uLodA.value.set(L[0], L[1], L[2], L[3]); U.uLodB.value = L[4];
    this._weights();
  }

  _weights() {
    const U = this.compMat.uniforms, r = this.radius;
    const w = FACTORS.map((f) => f + (1.2 - f - f) * r);
    U.uWA.value.set(w[0], w[1], w[2], w[3]); U.uWB.value = w[4];
  }

  // w, h = Bloom-Auflösung (wie UnrealBloomPass: Stufe 0 = halbe Bloom-Auflösung); srcW/srcH = Szenenpuffer
  setSize(w, h, srcW, srcH) {
    const bw = Math.max(8, Math.round(w / 2)), bh = Math.max(8, Math.round(h / 2));
    this.rtBright.setSize(bw, bh);
    this.rtOut.setSize(bw, bh);
    this._srcW = srcW || w; this._srcH = srcH || h;
    const kx = this._srcW / bw, ky = this._srcH / bh;
    this.brightMat.uniforms.uOff.value.set(Math.max(0.5, kx * 0.25) / this._srcW, Math.max(0.5, ky * 0.25) / this._srcH);
    this.compMat.uniforms.uSize.value.set(bw, bh);
    this._maxLod = Math.max(0, Math.floor(Math.log2(Math.max(bw, bh))) - 1);
    this._lods();
  }

  render(renderer, writeBuffer, readBuffer) {
    if (this._r !== this.radius) { this._r = this.radius; this._weights(); }
    this.brightMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.brightMat.uniforms.uThr.value = this.threshold;
    const ac = renderer.autoClear;
    renderer.autoClear = false; // Vollbild-Dreieck überschreibt alles: kein eigener Löschdurchgang
    this.fsQuad.material = this.brightMat;
    renderer.setRenderTarget(this.rtBright);
    this.fsQuad.render(renderer);      // three erzeugt danach die Mip-Kette (generateMipmaps)
    this.fsQuad.material = this.compMat;
    renderer.setRenderTarget(this.rtOut);
    this.fsQuad.render(renderer);
    renderer.autoClear = ac;
  }

  dispose() {
    this.rtBright.dispose(); this.rtOut.dispose();
    this.brightMat.dispose(); this.compMat.dispose();
    this.fsQuad.dispose();
  }
}
