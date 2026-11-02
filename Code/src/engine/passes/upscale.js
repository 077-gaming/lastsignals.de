// Baustein Hochskalierung/Schärfen: „LS-Hochskalierung (FSR-1-Art)“ – eigene Umsetzung des veröffentlichten
// räumlichen Verfahrens von AMD FidelityFX Super Resolution 1 (MIT-Lizenz), kein AMD-Code und kein DLSS:
//  · EASU-Art (Kanten-adaptives Hochrechnen): 12 Proben um den Zielpunkt, Kantenrichtung und -stärke aus den
//    Helligkeitsgefällen der vier nächsten Quellpixel, gestreckter Lanczos-2-artiger Kern entlang der Kante,
//    Ergebnis auf Min/Max der vier Nachbarn begrenzt (kein Überschwingen).
//  · RCAS-Art (robustes kontrastadaptives Schärfen): Kreuz aus 5 Proben, Schärfegewicht so begrenzt, dass kein
//    Wert über Min/Max der Nachbarschaft hinausläuft.
// Läuft nach Kamera-Look und Kantenglättung auf dem fertigen (tonabgebildeten, sRGB) Bild, wie FSR 1 vorsieht.
// Hochrechnen nur, wenn die Szene kleiner als das Ausgabebild gerechnet wird; sonst nur Schärfen (1 Durchgang).
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const EASU_FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uIn;      // Quellgröße (Pixel)
uniform vec2 uOut;     // Zielgröße (Pixel)
varying vec2 vUv;
float L(vec3 c) { return dot(c, vec3(0.5, 1.0, 0.5)); }   // schnelle Luma wie FSR (R + 2G + B)/2
vec3 T(vec2 p) { return texelFetch(tDiffuse, ivec2(clamp(p, vec2(0.0), uIn - 1.0)), 0).rgb; }
// Richtung und Kantenstärke aus dem Kreuz a(oben) b(links) c(Mitte) d(rechts) e(unten), gewichtet (bilinear)
void dirLen(inout vec2 dir, inout float len, float w, float la, float lb, float lc, float ld, float le) {
  float dc = ld - lc, cb = lc - lb;
  float lx = max(abs(dc), abs(cb));
  lx = lx > 0.0 ? 1.0 / lx : 0.0;
  float dx = ld - lb;
  dir.x += dx * w;
  lx = clamp(abs(dx) * lx, 0.0, 1.0); lx *= lx;
  len += lx * w;
  float ec = le - lc, ca = lc - la;
  float ly = max(abs(ec), abs(ca));
  ly = ly > 0.0 ? 1.0 / ly : 0.0;
  float dy = le - la;
  dir.y += dy * w;
  ly = clamp(abs(dy) * ly, 0.0, 1.0); ly *= ly;
  len += ly * w;
}
void tap(inout vec3 ac, inout float aw, vec2 off, vec2 dir, vec2 len2, float lob, float clp, vec3 c) {
  vec2 v = vec2(off.x * dir.x + off.y * dir.y, off.x * -dir.y + off.y * dir.x) * len2;
  float d2 = min(dot(v, v), clp);
  float wB = 0.4 * d2 - 1.0, wA = lob * d2 - 1.0;
  wB *= wB; wA *= wA;
  wB = 1.5625 * wB - 0.5625;
  float w = wB * wA;
  ac += c * w; aw += w;
}
void main() {
  // Zielpixel → Quellkoordinate; f = linkes oberes Pixel des 2×2-Vierers um den Punkt
  vec2 pp = vUv * uIn - 0.5;
  vec2 fp = floor(pp);
  pp -= fp;
  //    b c
  //  e f g h
  //  i j k l
  //    n o
  vec3 b = T(fp + vec2(0, -1)), c = T(fp + vec2(1, -1));
  vec3 e = T(fp + vec2(-1, 0)), f = T(fp), g = T(fp + vec2(1, 0)), h = T(fp + vec2(2, 0));
  vec3 i = T(fp + vec2(-1, 1)), j = T(fp + vec2(0, 1)), k = T(fp + vec2(1, 1)), l = T(fp + vec2(2, 1));
  vec3 n = T(fp + vec2(0, 2)), o = T(fp + vec2(1, 2));
  float bL = L(b), cL = L(c), eL = L(e), fL = L(f), gL = L(g), hL = L(h), iL = L(i), jL = L(j), kL = L(k), lL = L(l), nL = L(n), oL = L(o);
  vec2 dir = vec2(0.0); float len = 0.0;
  dirLen(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  dirLen(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
  dirLen(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
  dirLen(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
  float dr = dot(dir, dir);
  bool zro = dr < 1.0 / 32768.0;
  dir = zro ? vec2(1.0, 0.0) : dir * inversesqrt(dr);
  len = len * 0.5; len *= len;
  float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + (0.25 - 0.04 - 0.5) * len;
  float clp = 1.0 / lob;
  vec3 mn = min(min(f, g), min(j, k)), mx = max(max(f, g), max(j, k));
  vec3 ac = vec3(0.0); float aw = 0.0;
  tap(ac, aw, vec2(0, -1) - pp, dir, len2, lob, clp, b);
  tap(ac, aw, vec2(1, -1) - pp, dir, len2, lob, clp, c);
  tap(ac, aw, vec2(-1, 1) - pp, dir, len2, lob, clp, i);
  tap(ac, aw, vec2(0, 1) - pp, dir, len2, lob, clp, j);
  tap(ac, aw, vec2(0, 0) - pp, dir, len2, lob, clp, f);
  tap(ac, aw, vec2(-1, 0) - pp, dir, len2, lob, clp, e);
  tap(ac, aw, vec2(1, 1) - pp, dir, len2, lob, clp, k);
  tap(ac, aw, vec2(2, 1) - pp, dir, len2, lob, clp, l);
  tap(ac, aw, vec2(2, 0) - pp, dir, len2, lob, clp, h);
  tap(ac, aw, vec2(1, 0) - pp, dir, len2, lob, clp, g);
  tap(ac, aw, vec2(1, 2) - pp, dir, len2, lob, clp, o);
  tap(ac, aw, vec2(0, 2) - pp, dir, len2, lob, clp, n);
  vec3 r = ac / max(aw, 1e-5);
  gl_FragColor = vec4(clamp(r, mn, mx), 1.0);
}`;

const RCAS_FS = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform float uSharp;   // 0..1 (1 = stärkstes Schärfen wie RCAS mit 0 Blenden)
uniform vec2 uTexel;    // 1 / Größe des Ausgabebilds: bei gleicher Größe genau die Nachbarpixel, bei größerer
                        // Quelle (Supersampling) mittelt die bilineare Probe zugleich herunter
varying vec2 vUv;
void main() {
  vec3 b = texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 d = texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb;
  vec3 e = texture2D(tDiffuse, vUv).rgb;
  vec3 f = texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb;
  vec3 h = texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
  vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
  // Gewicht so begrenzt, dass das Ergebnis im Bereich [0, 1] und nahe Min/Max der Nachbarn bleibt
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-4));
  vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, vec3(-1e-4));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * uSharp;
  vec3 r = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  gl_FragColor = vec4(clamp(r, 0.0, 1.0), 1.0);
}`;

export class UpscalePass extends Pass {
  constructor() {
    super();
    this.needsSwap = true;
    this.sharp = 0.25;
    this.upscale = false;     // vom Renderer gesetzt: Szene kleiner als Ausgabe?
    this.outW = 4; this.outH = 4;
    this.inW = 4; this.inH = 4;
    this.rtUp = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    this.easu = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uIn: { value: new THREE.Vector2(4, 4) }, uOut: { value: new THREE.Vector2(4, 4) } }, vertexShader: VS, fragmentShader: EASU_FS, depthTest: false, depthWrite: false });
    this.rcas = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uSharp: { value: 0.25 }, uTexel: { value: new THREE.Vector2(0.25, 0.25) } }, vertexShader: VS, fragmentShader: RCAS_FS, depthTest: false, depthWrite: false });
    this.fsQuad = new FullScreenQuad(null);
  }

  /** Größe des Ausgabebilds (Leinwand in Pixeln), vom Renderer */
  setOutputSize(w, h) {
    this.outW = Math.max(1, w | 0); this.outH = Math.max(1, h | 0);
    if (this.upscale) this.rtUp.setSize(this.outW, this.outH);
  }
  setSize(w, h) { this.inW = w; this.inH = h; }

  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    const out = this.renderToScreen ? null : writeBuffer;
    const sharp = Math.max(0, Math.min(1, this.sharp));
    this.rcas.uniforms.uTexel.value.set(1 / this.outW, 1 / this.outH);
    if (this.upscale) {
      if (this.rtUp.width !== this.outW || this.rtUp.height !== this.outH) this.rtUp.setSize(this.outW, this.outH);
      this.easu.uniforms.tDiffuse.value = readBuffer.texture;
      this.easu.uniforms.uIn.value.set(readBuffer.width, readBuffer.height);
      this.easu.uniforms.uOut.value.set(this.outW, this.outH);
      this.fsQuad.material = this.easu;
      if (sharp > 0.001) {
        renderer.setRenderTarget(this.rtUp); this.fsQuad.render(renderer);
        this.rcas.uniforms.tDiffuse.value = this.rtUp.texture; this.rcas.uniforms.uSharp.value = sharp;
        this.fsQuad.material = this.rcas;
      }
      renderer.setRenderTarget(out); this.fsQuad.render(renderer);
    } else {
      this.rcas.uniforms.tDiffuse.value = readBuffer.texture; this.rcas.uniforms.uSharp.value = sharp;
      this.fsQuad.material = this.rcas;
      renderer.setRenderTarget(out); this.fsQuad.render(renderer);
    }
    renderer.autoClear = ac;
  }

  dispose() { this.rtUp.dispose(); this.easu.dispose(); this.rcas.dispose(); this.fsQuad.dispose(); }
}
