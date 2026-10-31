// Tempo-Staub und Lichtstreifen nah an der Kamera (vor allem Verfolger-Kamera): feste Körner im Raum, um die
// Kamera gewickelt, bei Tempo entgegen der Flugrichtung zu Strichen gezogen; jedes ≈ 12. Korn ist ein heller,
// langer Lichtstreifen in Fraktionsfarbe. Ein Zeichenaufruf, keine Speicher-Neuanlage pro Bild.
import * as THREE from 'three';

const N = 900;
const BOX = new THREE.Vector3(560, 190, 560);

const VS = /* glsl */`
attribute float aEnd; attribute float aB;
uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uVel; uniform float uLen; uniform float uK;
varying float vA; varying float vS;
void main() {
  vec3 p = mod(position - uCam + 0.5 * uBox, uBox) - 0.5 * uBox + uCam;
  p.y = position.y;                       // Höhe fest (Ebene ± 95 m), nur waagrecht gewickelt
  float streak = step(0.92, aB);
  vec3 dir = uVel / max(length(uVel), 1.0);
  p -= (uVel * uLen * (1.0 + streak * 2.6) + dir * 0.8) * aEnd;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float dz = -mv.z;
  float fade = smoothstep(6.0, 34.0, dz) * (1.0 - smoothstep(200.0, 290.0, dz));
  vec2 q = abs(p.xz - uCam.xz) / (0.5 * uBox.xz);
  float edge = 1.0 - smoothstep(0.7, 1.0, max(q.x, q.y));
  vA = uK * fade * edge * (0.3 + 0.7 * aB) * (1.0 - aEnd * 0.92) * (1.0 + streak * 1.6);
  vS = streak;
}`;
const FS = /* glsl */`
uniform vec3 uCol; uniform vec3 uStreak;
varying float vA; varying float vS;
void main() {
  vec3 c = mix(uCol, uStreak, vS);
  gl_FragColor = vec4(c * vA, vA);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export class SpeedDust {
  constructor(scene) {
    const pos = new Float32Array(N * 6), end = new Float32Array(N * 2), br = new Float32Array(N * 2);
    let s = 7;
    const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < N; i++) {
      const x = R() * BOX.x, y = -BOX.y * 0.45 + R() * BOX.y, z = R() * BOX.z, b = R();
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        end[i * 2 + k] = k; br[i * 2 + k] = b;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aB', new THREE.BufferAttribute(br, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uCam: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() }, uVel: { value: new THREE.Vector3() },
        uLen: { value: 0.05 }, uK: { value: 0 }, uCol: { value: new THREE.Color(0.55, 0.6, 0.7) },
        uStreak: { value: new THREE.Color(0.8, 0.9, 1.3) },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 31;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.k = 0;
    this._vel = new THREE.Vector3();
  }

  setPointScale() { /* Linien: unabhängig von der Pixeldichte */ }
  setColor(hex) { this.mat.uniforms.uStreak.value.setHex(hex).multiplyScalar(1.5); }
  warm() { this.mesh.visible = true; }

  // K = Anteil Verfolger-Kamera (0..1); pv = Spieleransicht (nSpd, trailCol), e = Spieler-Entity (vx, vz)
  update(dt, cam, pv, e, K, t) {
    const n = pv ? (pv.nSpd || 0) : 0;
    // ab ≈ 25 % Tempo sichtbar, voll ab ≈ 75 %; taktisch nur ein Hauch (dort zieht der Weltraumstaub)
    const sk = Math.min(1, Math.max(0, (n - 0.15) / 0.7));
    const want = K * sk * sk * 0.6;
    this.k += (want - this.k) * (1 - Math.exp(-dt * 3));
    const on = this.k > 0.01 && !!e;
    this.mesh.visible = on;
    if (!on) return;
    const U = this.mat.uniforms;
    U.uCam.value.copy(cam.position);
    this._vel.set(e.vx || 0, 0, e.vz || 0);
    U.uVel.value.lerp(this._vel, 1 - Math.exp(-dt * 8));
    U.uLen.value = 0.035 + 0.05 * Math.min(1, n);
    U.uK.value = this.k;
    if (pv && pv.trailCol && this._col !== pv.trailCol) { this._col = pv.trailCol; U.uStreak.value.copy(pv.trailCol).multiplyScalar(1.6); }
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mat.dispose();
  }
}
