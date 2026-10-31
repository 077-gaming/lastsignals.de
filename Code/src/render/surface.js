// Oberflächen-Bausteine für Rümpfe und Stationen (einmal je Typ angelegt, nie pro Bild):
//   hullDetail  Rumpfplatten mit versetzten Fugen, Plattenneigung (Licht bricht je Platte anders),
//               Schmutz und Laufspuren, Kantenverschleiß an den Fugen, Fensterreihen, Kantenlicht
//   lightPoints Positions- und Arbeitslichter als ein Punkt-Draw-Call (Blinktakt, Lauflicht, Schweißlicht im Shader)
//   lightCones  Scheinwerferkegel und Lichtflecken (additiv)
//   decals      Beschriftung, Kennnummern, Warnstreifen und Landefelder aus einem Schriftatlas
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const VN = /* glsl */`
float lsH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lsVN(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lsH3(i), lsH3(i + vec3(1, 0, 0)), f.x), mix(lsH3(i + vec3(0, 1, 0)), lsH3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(lsH3(i + vec3(0, 0, 1)), lsH3(i + vec3(1, 0, 1)), f.x), mix(lsH3(i + vec3(0, 1, 1)), lsH3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

const DEF = { panel: 0.2, lines: 0.45, grime: 0.35, wear: 1, tilt: 0.035, rim: 0.1, win: 0, winX: 5, winY: 6, winCol: 0xffd9a8, winK: 1.1, winFill: 0.62 };

// o: { panel (Platten je Meter), lines (Fugentiefe), grime, wear, tilt, rim, win (0/1), winX, winY, winCol, winK, winFill }
export function hullDetail(m, opts) {
  const o = { ...DEF, ...opts };
  const winCol = new THREE.Color(o.winCol).multiplyScalar(o.winK);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPanel = { value: o.panel };
    sh.uniforms.uLines = { value: o.lines };
    sh.uniforms.uGrime = { value: o.grime };
    sh.uniforms.uWear = { value: o.wear };
    sh.uniforms.uTilt = { value: o.tilt };
    sh.uniforms.uRim = { value: o.rim };
    sh.uniforms.uWinS = { value: new THREE.Vector2(o.winX, o.winY) };
    sh.uniforms.uWinCol = { value: winCol };
    sh.uniforms.uWinFill = { value: o.winFill };
    sh.vertexShader = 'varying vec3 vObjP; varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vObjP = position; vObjN = normal;
      #ifdef USE_INSTANCING
        vObjP = (instanceMatrix * vec4(position, 1.0)).xyz; vObjN = mat3(instanceMatrix) * normal;
      #endif`);
    sh.fragmentShader = `uniform float uPanel, uLines, uGrime, uWear, uTilt, uRim, uWinFill; uniform vec2 uWinS; uniform vec3 uWinCol;
varying vec3 vObjP; varying vec3 vObjN;
float lsSeam = 0.0, lsPr = 0.5, lsPr2 = 0.5, lsDirt = 0.0, lsWearK = 0.0, lsVert = 0.0; vec2 lsAlong = vec2(0.0); float lsFace = 0.0;
${VN}
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 dN = abs(normalize(vObjN));
          vec2 q;
          if (dN.x >= dN.y && dN.x >= dN.z) { q = vObjP.zy; lsFace = 1.0; }
          else if (dN.y >= dN.z) { q = vObjP.xz; lsFace = 2.0; }
          else { q = vObjP.xy; lsFace = 3.0; }
          lsAlong = q; lsVert = 1.0 - step(0.6, dN.y);
          // Großplatten mit unregelmäßigem Reihenversatz, je Platte eine von fünf Teilungen
          // (ganz, halb quer, halb längs, 2×3, Streifen) → Platten unterschiedlicher Größe statt Ziegelmuster
          q *= uPanel * vec2(1.0, 1.4);
          q.x += lsH3(vec3(floor(q.y), lsFace, 1.7)) * 0.73;
          vec2 cell = floor(q), f = fract(q);
          float ph = lsH3(vec3(cell, lsFace) + 2.3);
          vec2 sub = ph < 0.3 ? vec2(1.0) : ph < 0.5 ? vec2(2.0, 1.0) : ph < 0.7 ? vec2(1.0, 2.0) : ph < 0.88 ? vec2(2.0, 3.0) : vec2(4.0, 1.0);
          vec2 fs = f * sub, sc = floor(fs), fq = fract(fs);
          vec2 fw = max(fwidth(q), vec2(1e-4));
          vec2 dMaj = min(f, 1.0 - f) / fw;
          vec2 dMin = min(fq, 1.0 - fq) / (fw * sub);
          float major = 1.0 - smoothstep(0.6, 1.6, min(dMaj.x, dMaj.y));
          float minor = (1.0 - smoothstep(0.35, 1.0, min(dMin.x, dMin.y))) * 0.55;
          float lod = 1.0 - smoothstep(0.07, 0.2, max(fw.x, fw.y));
          lsSeam = max(major, minor) * lod;
          // Fase: Oberkante jeder Platte fängt Licht, Unterkante liegt im Schatten
          float dT = (1.0 - fq.y) / (fw.y * sub.y), dB = fq.y / (fw.y * sub.y);
          float bevel = ((1.0 - smoothstep(0.8, 2.6, dT)) - (1.0 - smoothstep(0.8, 2.6, dB)) * 0.8) * lod;
          vec3 cid = vec3(cell * sub + sc, lsFace);
          lsPr = lsH3(cid + 0.37); lsPr2 = lsH3(cid.yxz + 4.1);
          diffuseColor.rgb *= 1.0 + bevel * 0.16;
          float near = 1.0 - smoothstep(0.0, 0.09, min(min(fq.x, 1.0 - fq.x), min(fq.y, 1.0 - fq.y)));
          float g = lsVN(vObjP * 0.045) * 0.6 + lsVN(vObjP * 0.16) * 0.4;
          float streak = lsVN(vec3(vObjP.x * 0.35, vObjP.y * 0.025, vObjP.z * 0.35));
          lsDirt = smoothstep(0.4, 0.95, g * 0.75 + streak * 0.45 * lsVert);
          lsWearK = smoothstep(0.55, 0.8, lsVN(vObjP * 0.9)) * near * uWear;
          diffuseColor.rgb *= (0.95 + 0.08 * lsPr) * (1.0 - lsSeam * uLines) * (1.0 - lsDirt * uGrime);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.43, 0.45), lsWearK * 0.45);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.7 + 0.6 * lsPr2) + lsSeam * 0.2 + lsDirt * uGrime * 0.3 - lsWearK * 0.25, 0.05, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.95, lsWearK * 0.5);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + (vec3(lsPr, lsPr2, fract(lsPr * 7.31)) - 0.5) * uTilt * (1.0 - lsSeam));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef LS_WIN
        {
          vec2 wq = vec2(lsAlong.x, vObjP.y) / uWinS;
          vec2 wc = floor(wq), wf = fract(wq);
          vec2 wfw = max(fwidth(wq), vec2(1e-4));
          float inX = smoothstep(0.32 - wfw.x, 0.32 + wfw.x, wf.x) * (1.0 - smoothstep(0.68 - wfw.x, 0.68 + wfw.x, wf.x));
          float inY = smoothstep(0.42 - wfw.y, 0.42 + wfw.y, wf.y) * (1.0 - smoothstep(0.6 - wfw.y, 0.6 + wfw.y, wf.y));
          float h = lsH3(vec3(wc, lsFace) * 1.37 + 0.5);
          float on = step(1.0 - uWinFill, h);
          float pat = inX * inY * on * (0.55 + 0.45 * fract(h * 13.1));
          float far = smoothstep(0.12, 0.35, max(wfw.x, wfw.y));
          pat = mix(pat, 0.065 * uWinFill, far);
          totalEmissiveRadiance += uWinCol * pat * lsVert * (1.0 - lsSeam);
        }
        #endif`)
      .replace('#include <opaque_fragment>', `
        outgoingLight += vec3(0.55, 0.66, 0.85) * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0) * uRim;
        #include <opaque_fragment>`);
  };
  if (o.win) m.defines = { ...(m.defines || {}), LS_WIN: '' };
  m.customProgramCacheKey = () => 'hull:' + JSON.stringify(o);
  return m;
}

// ---------- Lichtpunkte ----------
// Modus: 0 Dauerlicht, 1 langsamer Blinker, 2 Doppelblitz (weiß), 3 Lauflicht (phase = Versatz), 4 Schweißlicht
const LIGHT_VS = /* glsl */`
attribute vec3 aCol; attribute float aSize; attribute vec2 aBlink;
uniform float uTime; uniform float uScale;
varying vec3 vCol; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, 30.0);
  float t = uTime + aBlink.x;
  float m = aBlink.y, b = 1.0;
  if (m > 0.5 && m < 1.5) b = fract(t * 0.55) < 0.42 ? 1.0 : 0.06;
  else if (m > 1.5 && m < 2.5) { float f = fract(t / 1.7); b = (f < 0.04 || (f > 0.13 && f < 0.17)) ? 1.3 : 0.0; }
  else if (m > 2.5 && m < 3.5) { float f = fract(uTime * 0.7 - aBlink.x); b = 0.06 + exp(-f * 14.0); }
  else if (m > 3.5) { float k = floor(uTime * 24.0); b = step(0.5, fract(sin(k * 91.7 + aBlink.x * 13.0) * 437.5)) * (0.5 + 0.7 * fract(sin(k * 7.3 + aBlink.x) * 77.0)); }
  vCol = aCol; vA = b;
}`;
const LIGHT_FS = /* glsl */`
varying vec3 vCol; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float d = dot(c, c) * 4.0; if (d > 1.0) discard;
  float a = (exp(-d * 7.0) * 0.55 + exp(-d * 45.0)) * vA * smoothstep(1.0, 0.6, d);
  gl_FragColor = vec4(vCol * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function lightPointsMaterial(uTime, uScale) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime, uScale }, vertexShader: LIGHT_VS, fragmentShader: LIGHT_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}
// list: [mode, x, y, z, size, r, g, b, phase]
export function lightPointsGeometry(list) {
  const n = list.length;
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), s = new Float32Array(n), b = new Float32Array(n * 2);
  list.forEach((l, i) => {
    p.set([l[1], l[2], l[3]], i * 3); c.set([l[5], l[6], l[7]], i * 3); s[i] = l[4]; b.set([l[8] || 0, l[0]], i * 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(s, 1));
  g.setAttribute('aBlink', new THREE.BufferAttribute(b, 2));
  g.computeBoundingSphere();
  return g;
}

// ---------- Scheinwerferkegel ----------
const CONE_VS = /* glsl */`
attribute float aT; attribute float aSpot; attribute vec3 aCol;
varying float vT; varying float vSpot; varying vec3 vCol; varying vec3 vN; varying vec3 vV;
void main() {
  vT = aT; vSpot = aSpot; vCol = aCol;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const CONE_FS = /* glsl */`
varying float vT; varying float vSpot; varying vec3 vCol; varying vec3 vN; varying vec3 vV;
void main() {
  float a;
  if (vSpot > 0.5) a = pow(1.0 - clamp(vT, 0.0, 1.0), 2.2) * 0.32;
  else {
    float mu = abs(dot(normalize(vN), normalize(vV)));
    a = pow(mu, 2.5) * pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.06, vT) * 0.2;
  }
  gl_FragColor = vec4(vCol * a, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function lightConeMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: CONE_VS, fragmentShader: CONE_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
const _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
// list: [x, y, z, dx, dy, dz, len, rad, [r,g,b], spotY|null]  spotY = Höhe der beleuchteten Fläche (Lichtfleck)
export function lightConesGeometry(list) {
  if (!list.length) return null;
  const parts = [];
  for (const [x, y, z, dx, dy, dz, len, rad, col, spotY] of list) {
    const g = new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0);
    const n = g.attributes.position.count;
    const t = new Float32Array(n), sp = new Float32Array(n), cc = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { t[i] = -g.attributes.position.getY(i); cc.set(col, i * 3); }
    _d.set(dx, dy, dz).normalize();
    _q.setFromUnitVectors(_dn, _d);
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q, _s.set(rad, len, rad)));
    g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
    g.setAttribute('aSpot', new THREE.BufferAttribute(sp, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(cc, 3));
    g.deleteAttribute('uv');
    parts.push(g.index ? g.toNonIndexed() : g);
    if (spotY !== null && spotY !== undefined && Math.abs(_d.y) > 0.2) {
      const k = (spotY - y) / _d.y;
      if (k > 0) {
        const r = rad * Math.min(1.6, k / len) * 1.15;
        const sg = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
        const sn = sg.attributes.position.count;
        const st = new Float32Array(sn), ss = new Float32Array(sn).fill(1), sc = new Float32Array(sn * 3);
        for (let i = 0; i < sn; i++) { st[i] = Math.hypot(sg.attributes.position.getX(i), sg.attributes.position.getZ(i)); sc.set(col, i * 3); }
        sg.applyMatrix4(_m.compose(_p.set(x + _d.x * k, spotY + 0.25, z + _d.z * k), _q.identity(), _s.set(r, 1, r)));
        sg.setAttribute('aT', new THREE.BufferAttribute(st, 1));
        sg.setAttribute('aSpot', new THREE.BufferAttribute(ss, 1));
        sg.setAttribute('aCol', new THREE.BufferAttribute(sc, 3));
        sg.deleteAttribute('uv');
        parts.push(sg.index ? sg.toNonIndexed() : sg);
      }
    }
  }
  const out = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  out.computeBoundingSphere();
  return out;
}

// ---------- Beschriftung ----------
const FONT = '"DIN Condensed", "DIN Alternate", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const ROW = 128, AW = 1024;
function rnd(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// list: { g, kind ('paint'|'sign'|'stripe'|'pad'), text, x, y, z, w, h, rx, ry, color }
// → { tex, geo: { hub: { paint, sign }, arms: {…} } }
export function buildDecals(list, seed = 1) {
  if (!list.length) return null;
  const rows = list.length;
  const H = Math.min(4096, THREE.MathUtils.ceilPowerOfTwo(rows * ROW));
  const cv = document.createElement('canvas');
  cv.width = AW; cv.height = H;
  const ctx = cv.getContext('2d');
  const R = rnd(seed * 977 + 13);
  const regions = [];
  list.forEach((d, i) => {
    const y0 = i * ROW;
    const rw = Math.max(ROW, Math.min(AW, Math.round(ROW * d.w / d.h)));
    regions.push(rw);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, rw, ROW); ctx.clip();
    if (d.kind === 'stripe') {
      ctx.fillStyle = d.color || '#e0a020'; ctx.fillRect(0, y0, rw, ROW);
      ctx.fillStyle = '#121316';
      for (let x = -ROW; x < rw + ROW; x += 64) {
        ctx.beginPath(); ctx.moveTo(x, y0 + ROW); ctx.lineTo(x + 32, y0 + ROW); ctx.lineTo(x + 32 + ROW, y0); ctx.lineTo(x + ROW, y0); ctx.fill();
      }
    } else if (d.kind === 'pad') {
      const cx = rw / 2, cy = y0 + ROW / 2;
      ctx.strokeStyle = d.color || '#e8e4da'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, ROW * 0.44, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, ROW * 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 4;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * ROW * 0.38, cy + Math.sin(a) * ROW * 0.38);
        ctx.lineTo(cx + Math.cos(a) * ROW * 0.49, cy + Math.sin(a) * ROW * 0.49); ctx.stroke();
      }
      ctx.fillStyle = d.color || '#e8e4da';
      ctx.font = `700 ${ROW * 0.42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.text || '', cx, cy + 3);
    } else {
      ctx.fillStyle = d.color || '#ffffff';
      ctx.font = `700 ${ROW * 0.8}px ${FONT}`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      try { ctx.letterSpacing = '6px'; } catch { /* ältere Browser */ }
      const tw = ctx.measureText(d.text).width;
      const sx = Math.min(1, (rw - 16) / Math.max(1, tw));
      ctx.translate(rw / 2 - (tw * sx) / 2, y0 + ROW / 2 + ROW * 0.06);
      ctx.scale(sx, 1);
      ctx.fillText(d.text, 0, 0);
    }
    ctx.restore();
    if (d.kind !== 'sign') { // Abrieb: feine Fehlstellen
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const n = Math.round(rw * 0.35);
      for (let k = 0; k < n; k++) {
        ctx.globalAlpha = 0.25 + R() * 0.6;
        const s = 1 + R() * R() * 6;
        ctx.fillRect(R() * rw, y0 + R() * ROW, s * (1 + R() * 2), s);
      }
      ctx.restore();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const acc = {};
  const e = new THREE.Euler();
  list.forEach((d, i) => {
    const g = new THREE.PlaneGeometry(d.w, d.h);
    const u1 = regions[i] / AW, v1 = 1 - (i * ROW) / H, v0 = 1 - ((i + 1) * ROW) / H;
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * u1, v0 + uv.getY(k) * (v1 - v0));
    e.set(d.rx ?? -Math.PI / 2, d.ry || 0, 0, 'YXZ');
    _q.setFromEuler(e);
    g.applyMatrix4(_m.compose(_p.set(d.x, d.y, d.z), _q, _s.set(1, 1, 1)));
    const key = d.kind === 'sign' ? 'sign' : 'paint';
    const grp = acc[d.g] || (acc[d.g] = { paint: [], sign: [] });
    grp[key].push(g.index ? g.toNonIndexed() : g);
  });
  const geo = {};
  for (const gk in acc) {
    geo[gk] = {};
    for (const k of ['paint', 'sign']) {
      if (!acc[gk][k].length) continue;
      geo[gk][k] = mergeGeometries(acc[gk][k], false);
      geo[gk][k].computeBoundingSphere();
      acc[gk][k].forEach((x) => x.dispose());
    }
  }
  return { tex, geo };
}
