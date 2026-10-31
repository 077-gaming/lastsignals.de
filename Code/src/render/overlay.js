// Taktische Overlays wie auf einem Instrument: Haarlinien mit fester Bildschirmbreite (fwidth),
// Skalen-Ticks alle 5° und 30°, schwacher Verlauf nach innen. Sprung-Ladering als scharfe Segmentringe.
import * as THREE from 'three';

const PLANE_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Skalenring: Linie bei uR (Weltmaß), Ticks nach innen, Verlauf nach innen über 20 px
const SCALE_FS = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; uniform float uR; uniform float uGrad;
uniform vec2 uFocus; uniform float uFocusR; uniform float uFloor; uniform float uDash;
varying vec2 vP;
void main() {
  float r = length(vP);
  float fw = max(fwidth(r), 1e-4);
  float d = (r - uR) / fw;
  float line = 1.0 - smoothstep(0.35, 1.15, abs(d));
  float deg = degrees(atan(vP.y, vP.x)) + 180.0;
  float ppd = 0.0174533 * r / fw;
  float m5 = abs(fract(deg / 5.0 + 0.5) - 0.5) * 5.0 * ppd;
  float m30 = abs(fract(deg / 30.0 + 0.5) - 0.5) * 30.0 * ppd;
  float t5 = (1.0 - smoothstep(0.3, 1.0, m5)) * step(-6.0, d) * step(d, 0.0);
  float t30 = (1.0 - smoothstep(0.4, 1.2, m30)) * step(-15.0, d) * step(d, 4.0);
  float grad = (1.0 - smoothstep(0.0, 20.0, -d)) * step(d, 0.0);
  // gestrichelte Linie (Strichzahl je Umlauf), weich gefiltert
  if (uDash > 0.0) {
    float u = deg / 360.0 * uDash;
    float fu = max(fwidth(u), 1e-4);
    float ph = abs(fract(u) - 0.5);
    line *= mix(smoothstep(0.2 - fu, 0.2 + fu, ph), 0.5, smoothstep(0.15, 0.4, fu));
  }
  // nur nahe am Schiff deutlich, sonst auf uFloor gedämpft
  float foc = uFocusR > 0.0 ? mix(uFloor, 1.0, 1.0 - smoothstep(uFocusR * 0.35, uFocusR, length(vP - uFocus))) : 1.0;
  float a = (line + max(t5 * 0.65, t30) + grad * grad * uGrad) * uOpacity * foc;
  gl_FragColor = vec4(uColor * a, a);
}`;

// Segmentring: Haarlinie bei Radius 1, unterbrochen in uSeg Segmente, dazu feine Innenlinie
const SEG_FS = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; uniform float uSeg; uniform float uGap;
varying vec2 vP;
void main() {
  float r = length(vP);
  float fw = max(fwidth(r), 1e-5);
  float d = (r - 1.0) / fw;
  float a01 = atan(vP.y, vP.x) / 6.2831853 + 0.5;
  float s = fract(a01 * uSeg);
  float sw = fwidth(a01 * uSeg);
  float on = smoothstep(uGap - sw, uGap + sw, s) * (1.0 - smoothstep(1.0 - sw, 1.0, s));
  float line = (1.0 - smoothstep(0.5, 1.4, abs(d))) * on;
  float inner = (1.0 - smoothstep(0.3, 1.0, abs(d + 5.0))) * 0.35;
  float a = (line + inner) * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
}`;

// opts: { dash (Striche je Umlauf), focus (Radius um uFocus, in dem die Linie voll sichtbar ist), floor }
export function scaleRingMaterial(hex, radius, opacity = 0.14, grad = 0.18, opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hex) }, uOpacity: { value: opacity }, uR: { value: radius }, uGrad: { value: grad },
      uFocus: { value: new THREE.Vector2() }, uFocusR: { value: opts.focus || 0 }, uFloor: { value: opts.floor ?? 1 }, uDash: { value: opts.dash || 0 },
    },
    vertexShader: PLANE_VS, fragmentShader: SCALE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Flache Ringfläche, breit genug für Ticks und Verlauf bei jeder Zoomstufe
export function scaleRingGeometry(radius, inner = 70, outer = 30) {
  return new THREE.RingGeometry(radius - inner, radius + outer, 192, 1).rotateX(-Math.PI / 2);
}

export function segRingMaterial(hex, seg, gap) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hex) }, uOpacity: { value: 0 }, uSeg: { value: seg }, uGap: { value: gap },
    },
    vertexShader: PLANE_VS, fragmentShader: SEG_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
