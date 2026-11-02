// Baustein Umgebungsverdeckung (GTAO). Rechnet mit dem GTAO-Shader aus three/examples (GTAOShader, Horizont-Verfahren
// nach Jimenez 2016), aber schlanker als GTAOPass: keine zweite Szenen-Zeichnung für Normalen (die rekonstruiert der
// Shader aus der Tiefe), Tiefe kommt direkt aus dem Szenenziel des Composers (DepthTexture).
//  1. GTAO in halber Auflösung (MITTEL/HOCH) bzw. voller (VOLL): R = Verdeckung, G = Abstand zur Kamera (m)
//  2. Entrauschen 5 × 5 (tiefengewichtet, gleiche Größe) – das Rauschmuster des Shaders wiederholt sich alle 5 Pixel
//  3. Zusammenführen in voller Auflösung: tiefengerechtes Hochrechnen (4 Nachbarn, Gewicht nach Abstandsunterschied),
//     Ausblenden mit der Entfernung, multipliziert ins Szenenbild (Schreibziel, danach Tausch)
// Muss VOR der Cockpit-Ebene laufen (die löscht die Tiefe) und vor dem Nachleuchten (Leuchten bleibt unverdeckt hell).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { GTAOShader, generateMagicSquareNoise } from 'three/examples/jsm/shaders/GTAOShader.js';

// GTAO-Shader aus three/examples mit Radius, der mit der Entfernung wächst (mindestens radiusZ × Abstand): nahe
// Rümpfe bekommen feine Fugen, die ferne Station trotzdem sichtbare Verdeckung statt Unterpixel-Proben.
const GTAO_FS = GTAOShader.fragmentShader
  .replace('uniform float radius;', 'uniform float radius;\nuniform float radiusZ;')
  .replace('float radiusToUse = radius;', 'float radiusToUse = max(radius, -viewPos.z * radiusZ);')
  .split('abs(viewDelta.z) < thickness').join('abs(viewDelta.z) < thickness * radiusToUse / radius');

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DENOISE_FS = /* glsl */`
precision highp float;
uniform highp sampler2D tAO;
varying vec2 vUv;
void main() {
  ivec2 sz = textureSize(tAO, 0);
  ivec2 p = ivec2(vUv * vec2(sz));
  vec2 c = texelFetch(tAO, p, 0).rg;
  if (c.g <= 0.0) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
  float s = 0.0, w = 0.0, tol = max(0.4, c.g * 0.012);
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 t = texelFetch(tAO, clamp(p + ivec2(x, y), ivec2(0), sz - 1), 0).rg;
    float k = t.g > 0.0 ? 1.0 / (1.0 + abs(t.g - c.g) / tol) : 0.0;
    k *= k;
    s += t.r * k; w += k;
  }
  gl_FragColor = vec4(w > 0.0 ? s / w : c.r, c.g, 0.0, 1.0);
}`;

const COMP_FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform highp sampler2D tDepth;
uniform highp sampler2D tAO;
uniform float uNear, uFar, uK, uFade;
uniform int uView;
varying vec2 vUv;
#include <packing>
void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  float lum = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
  float d = texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).r;
  float ao = 1.0;
  if (d < 1.0) {
    float z = -perspectiveDepthToViewZ(d, uNear, uFar);
    vec2 sz = vec2(textureSize(tAO, 0));
    vec2 q = vUv * sz - 0.5;
    ivec2 i0 = ivec2(floor(q));
    vec2 f = q - floor(q);
    ivec2 mx = ivec2(sz) - 1;
    vec2 a = texelFetch(tAO, clamp(i0, ivec2(0), mx), 0).rg;
    vec2 b = texelFetch(tAO, clamp(i0 + ivec2(1, 0), ivec2(0), mx), 0).rg;
    vec2 c = texelFetch(tAO, clamp(i0 + ivec2(0, 1), ivec2(0), mx), 0).rg;
    vec2 e = texelFetch(tAO, clamp(i0 + ivec2(1, 1), ivec2(0), mx), 0).rg;
    float tol = max(0.3, z * 0.01);
    vec4 wz = 1.0 / (1e-3 + abs(vec4(a.g, b.g, c.g, e.g) - z) / tol);
    vec4 wb = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
    vec4 w = wz * wb * step(0.001, vec4(a.g, b.g, c.g, e.g));
    float ws = dot(w, vec4(1.0));
    ao = ws > 1e-5 ? dot(w, vec4(a.r, b.r, c.r, e.r)) / ws : 1.0;
    if (!(ao >= 0.0 && ao <= 1.0)) ao = 1.0;                 // NaN-Schutz (Treiber, Tiefe am Rand)
    // Leuchtendes (Triebwerke, Fenster, Glühen: HDR über 1) bleibt hell, Verdeckung blendet mit der Entfernung aus
    ao = mix(1.0, ao, uK * (1.0 - smoothstep(uFade * 0.6, uFade, z)) * (1.0 - smoothstep(0.9, 2.5, lum)));
  }
  gl_FragColor = uView == 1 ? vec4(vec3(ao), 1.0) : vec4(col.rgb * ao, col.a);
}`;

// Stufen: Auflösung (Anteil), Proben je Richtung (GTAO SAMPLES), Stärke
// pow: Kontrastkurve der Verdeckung (GTAO-Uniform scale). Die Rümpfe sind meist konvex, Fugen schmal: ohne Kurve
// bliebe die Verdeckung kaum sichtbar.
const LEVELS = {
  medium: { res: 0.5, samples: 8, k: 0.9, pow: 1.8 },
  high: { res: 0.5, samples: 16, k: 1, pow: 2.0 },
  ultra: { res: 1, samples: 16, k: 1, pow: 2.0 },
};

export class AoPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.needsSwap = true;
    this.level = 'medium';
    this.view = 0; // 1 = nur Verdeckung zeigen (Entwicklung, ?aoview=1)
    // Weltmaßstab: Spielerschiff ≈ 48 m (Radius 24), Station Radius 160. Radius 10 m trifft Fugen und Anbauten, nicht ganze Rümpfe.
    this.radius = 10; this.thickness = 8; this.fade = 3200;
    const rtOpt = { type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, rtOpt);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, rtOpt);
    this.noise = generateMagicSquareNoise();
    this.gtaoMat = new THREE.ShaderMaterial({
      defines: { ...GTAOShader.defines, NORMAL_VECTOR_TYPE: 0, DEPTH_SWIZZLING: 'x', SAMPLES: 8, PERSPECTIVE_CAMERA: 1, FRAGMENT_OUTPUT: 'vec4(ao, -viewPos.z, 0.0, 1.0)' },
      uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
      vertexShader: GTAOShader.vertexShader, fragmentShader: GTAO_FS,
      blending: THREE.NoBlending, depthTest: false, depthWrite: false,
    });
    const U = this.gtaoMat.uniforms;
    U.tNoise.value = this.noise;
    U.radiusZ = { value: 0.025 };
    U.radius.value = this.radius; U.thickness.value = this.thickness;
    U.distanceExponent.value = 1.6; U.distanceFallOff.value = 1; U.scale.value = 1;
    this.denoiseMat = new THREE.ShaderMaterial({ uniforms: { tAO: { value: this.rtA.texture } }, vertexShader: VS, fragmentShader: DENOISE_FS, depthTest: false, depthWrite: false });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, tAO: { value: this.rtB.texture }, uNear: { value: 1 }, uFar: { value: 1000 }, uK: { value: 1 }, uFade: { value: this.fade }, uView: { value: 0 } },
      vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
    });
    this.fsQuad = new FullScreenQuad(null);
    this._w = 4; this._h = 4;
    this._clear = new THREE.Color();
    this.setLevel('medium');
  }

  setLevel(level) {
    const L = LEVELS[level] || LEVELS.medium;
    this.level = level;
    if (this.gtaoMat.defines.SAMPLES !== L.samples) { this.gtaoMat.defines.SAMPLES = L.samples; this.gtaoMat.needsUpdate = true; }
    this.compMat.uniforms.uK.value = L.k;
    this.gtaoMat.uniforms.scale.value = L.pow;
    if (this._res !== L.res) { this._res = L.res; this.setSize(this._w, this._h); }
  }

  setSize(w, h) {
    this._w = w; this._h = h;
    const k = this._res || 0.5;
    const aw = Math.max(4, Math.round(w * k)), ah = Math.max(4, Math.round(h * k));
    this.rtA.setSize(aw, ah); this.rtB.setSize(aw, ah);
    this.gtaoMat.uniforms.resolution.value.set(aw, ah);
  }

  render(renderer, writeBuffer, readBuffer) {
    const depth = readBuffer.depthTexture;
    if (!depth) return; // ohne Tiefentextur nichts zu tun (Durchgang bleibt neutral)
    const cam = this.camera, U = this.gtaoMat.uniforms;
    U.tDepth.value = depth;
    U.cameraNear.value = cam.near; U.cameraFar.value = cam.far;
    U.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
    U.cameraProjectionMatrixInverse.value.copy(cam.projectionMatrixInverse);
    U.cameraWorldMatrix.value.copy(cam.matrixWorld);
    const ac = renderer.autoClear, ca = renderer.getClearAlpha();
    renderer.getClearColor(this._clear);
    renderer.autoClear = false;
    // 1. GTAO: Himmel wird verworfen → vorher löschen (R = 1 unverdeckt, G = 0 kein Abstand)
    renderer.setRenderTarget(this.rtA);
    renderer.setClearColor(0xff0000, 1); renderer.clear(true, false, false);
    this.fsQuad.material = this.gtaoMat; this.fsQuad.render(renderer);
    // 2. Entrauschen
    renderer.setRenderTarget(this.rtB);
    this.fsQuad.material = this.denoiseMat; this.fsQuad.render(renderer);
    // 3. Zusammenführen
    const C = this.compMat.uniforms;
    C.tDiffuse.value = readBuffer.texture; C.tDepth.value = depth;
    C.uNear.value = cam.near; C.uFar.value = cam.far; C.uView.value = this.view;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsQuad.material = this.compMat; this.fsQuad.render(renderer);
    renderer.setClearColor(this._clear, ca);
    renderer.autoClear = ac;
  }

  dispose() {
    this.rtA.dispose(); this.rtB.dispose(); this.noise.dispose();
    this.gtaoMat.dispose(); this.denoiseMat.dispose(); this.compMat.dispose(); this.fsQuad.dispose();
  }
}
