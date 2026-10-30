// Hintergrund der Kinoseite: das Sonnensystem in 3D. Beim Scrollen fliegt die Kamera von der stummen Erde
// hinaus zu Jupiter (Europa), Saturn, Uranus und Neptun, durch den Kuipergürtel bis Eris und an den Rand.
// Nicht maßstabsgetreu, aber in der richtigen Reihenfolge. Die Sonne ist der einzige Lichtpunkt.
// Läuft nur, solange die Seite sichtbar ist, passt die Auflösung an die Leistung an.

import * as THREE from 'three';
import {
  BAKE_VERT, SKY_BAKE_FRAG, SKY_VERT, SKY_FRAG, STAR_VERT, STAR_FRAG, PLANET_VERT, PLANET_FRAG, SURFACE_BAKE_FRAG, EARTH_FRAG,
  ATMO_VERT, ATMO_FRAG, RING_VERT, RING_FRAG, GLOW_VERT, GLOW_FRAG, BELT_VERT, BELT_FRAG,
} from './shaders.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(R) { let u = 0; for (let i = 0; i < 4; i++) u += R(); return (u - 2) / 0.577; }

// ---------- Orte ----------
const EARTH = V3(0, 0, -300);
const MARS = V3(-46, 6, -470);
const JUP = V3(130, -14, -1150);
const EUROPA = JUP.clone().add(V3(-50, 6, 60));
const SAT = V3(-180, 26, -1850);
const URA = V3(250, 12, -2550);
const NEP = V3(-210, -18, -2950);
const ERIS = V3(70, 70, -4300);
const BELT_R = [700, 830], KUIPER_R = [3250, 3900];

// Kamerastationen je Kapitel: Position, Blickpunkt, Entfernung zur Sonne in AE (echte Werte)
const STOPS = [
  { pos: V3(38, 11, -416), at: V3(84, -60, 0), posTall: V3(22, 10, -418), atTall: V3(26, -140, 0), au: 0.99 },              // 0 Große Stille: hinter der Erde, Blick zur Sonne
  { pos: EARTH.clone().add(V3(9.6, 2.6, -0.4)), at: EARTH.clone().add(V3(0.6, 2.0, 4.4)), posTall: EARTH.clone().add(V3(11.5, 1.4, 1.8)), atTall: EARTH.clone().add(V3(0, 3.6, 0.8)), au: 1.0 }, // 1 Erde: Tag links (zur Sonne), Nacht rechts mit Stadtlichtern
  { pos: JUP.clone().add(V3(-135, 30, 100)), at: JUP.clone().add(V3(-48, 0, 0)), au: 5.2 },           // 2 Jupiter und Europa
  { pos: SAT.clone().add(V3(95, 32, 110)), at: SAT.clone().add(V3(-25, -6, 0)), au: 9.58 },          // 3 Saturn
  { pos: NEP.clone().add(V3(45, 10, 40)), at: NEP.clone().add(V3(-12, 0, 0)), au: 30.07 },             // 4 Uranus und Neptun
  { pos: V3(-60, 22, -3520), at: V3(-20, 8, -3300), au: 42 },                                         // 5 Kuipergürtel
  { pos: ERIS.clone().add(V3(11, 4, 13)), at: ERIS.clone().add(V3(-6, -1, 0)), au: 95.9 },        // 6 Eris
  { pos: V3(0, 1500, -6400), at: V3(0, 0, -1700), au: 120 },                                          // 7 Rand des Systems
];
// Heimaten der Fraktionen (Kapitel 2, beim Darüberfahren)
const HOMES = {
  europa: { pos: EUROPA.clone().add(V3(-5, 1.5, 9)), at: EUROPA.clone().add(V3(20, -2, -30)) },
  saturn: { pos: SAT.clone().add(V3(-60, 20, 85)), at: SAT.clone().add(V3(-12, -2, 0)) },
  eris: { pos: ERIS.clone().add(V3(-11, 4, 13)), at: ERIS.clone().add(V3(-3, -0.5, 0)) },
};

function bake(renderer, frag, w, h, uniforms = {}) {
  const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const rt = new THREE.WebGLRenderTarget(w, h, { type, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();
  rt.texture.wrapS = THREE.RepeatWrapping;
  return rt;
}

function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function streakTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 256, 0);
  // weich auslaufend (keine durchgehende Linie quer übers Bild)
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.44, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)');
  gr.addColorStop(0.56, 'rgba(255,255,255,0.3)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.04)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 16);
  const v = g.getImageData(0, 0, 256, 16);
  for (let y = 0; y < 16; y++) { const f = Math.exp(-Math.pow((y - 7.5) / 2.2, 2)); for (let x = 0; x < 256; x++) v.data[(y * 256 + x) * 4 + 3] *= f; }
  g.putImageData(v, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function startCosmos(canvas, opts = {}) {
  const mobile = opts.mobile;
  const forced = opts.forced || null; // [w, h] für Standbilder
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance', preserveDrawingBuffer: !!forced, stencil: false });
  } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x020306, 1);
  const maxPR = forced ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  let pr = maxPR;
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 20000);
  const R = seeded(2391);
  const gas = mobile ? [96, 56] : [144, 84];
  const texW = mobile ? 768 : 1536;

  // ---------- Himmel und Sterne (folgen der Kamera) ----------
  const skyGroup = new THREE.Group(); scene.add(skyGroup);
  const pole = V3(0.42, 0.86, 0.28).normalize();
  const coreDir = V3(0.5, -0.1, -0.85); coreDir.sub(pole.clone().multiplyScalar(coreDir.dot(pole))).normalize();
  const skyRT = bake(renderer, SKY_BAKE_FRAG, mobile ? 1024 : 2048, mobile ? 512 : 1024, { uPole: { value: pole }, uCore: { value: coreDir } });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uSky: { value: skyRT.texture } }, side: THREE.BackSide, depthWrite: false }));
  sky.renderOrder = -3; sky.frustumCulled = false; skyGroup.add(sky);

  const NS = forced ? 11000 : mobile ? 4200 : 8000;
  const SPECTRAL = [[0.03, [0.62, 0.72, 1.0]], [0.08, [0.78, 0.85, 1.0]], [0.16, [0.95, 0.96, 1.0]], [0.22, [1.0, 0.96, 0.88]], [0.26, [1.0, 0.86, 0.68]], [0.25, [1.0, 0.72, 0.52]]];
  const starColor = (r) => { let acc = 0; for (const [p, c] of SPECTRAL) { acc += p; if (r <= acc) return c; } return SPECTRAL[5][1]; };
  const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sm = new Float32Array(NS), sph = new Float32Array(NS);
  const u = new THREE.Vector3().crossVectors(pole, V3(0, 0, 1)).normalize(), v = new THREE.Vector3().crossVectors(pole, u).normalize();
  for (let i = 0; i < NS; i++) {
    let d;
    if (R() < 0.42) { const a = R() * Math.PI * 2, h = gauss(R) * 0.09; d = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).add(pole.clone().multiplyScalar(h)).normalize(); }
    else { const z = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - z * z); d = V3(s * Math.cos(a), z, s * Math.sin(a)); }
    sp.set([d.x * 8000, d.y * 8000, d.z * 8000], i * 3);
    const m = Math.pow(R(), 9); sm[i] = m;
    const c = starColor(R()); const ds = 0.55 + 0.45 * m;
    sc.set([1 + (c[0] - 1) * ds, 1 + (c[1] - 1) * ds, 1 + (c[2] - 1) * ds], i * 3);
    sph[i] = R();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aCol', new THREE.BufferAttribute(sc, 3));
  starGeo.setAttribute('aMag', new THREE.BufferAttribute(sm, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uTime: { value: 0 }, uPR: { value: pr } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const stars = new THREE.Points(starGeo, starMat); stars.renderOrder = -2; stars.frustumCulled = false; skyGroup.add(stars);

  // ---------- Sonne ----------
  const sunGroup = new THREE.Group(); scene.add(sunGroup);
  const sunCore = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,250,235,1)'], [0.22, 'rgba(255,225,170,.55)'], [0.5, 'rgba(255,170,90,.12)'], [1, 'rgba(255,140,60,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunCore.material.color.setRGB(3.2, 2.9, 2.5); sunCore.scale.setScalar(44); sunGroup.add(sunCore);
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(255,220,170,.5)'], [0.3, 'rgba(255,170,100,.12)'], [1, 'rgba(255,120,60,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  sunHalo.material.color.setRGB(1.2, 1.0, 0.85); sunHalo.scale.setScalar(380); sunGroup.add(sunHalo);
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: streakTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  streak.material.color.setRGB(0.9, 0.8, 0.7); streak.scale.set(420, 3.0, 1); sunGroup.add(streak);
  const sunLight = new THREE.PointLight(0xfff2e0, 3.2, 0, 0); scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x5a6680, 0x050608, 0.18));

  // ---------- Planeten ----------
  const planets = [];
  function planet(pos, r, kind, colors, extra = {}) {
    const rt = bake(renderer, SURFACE_BAKE_FRAG, kind === 0 ? texW : texW / 2, kind === 0 ? texW / 2 : texW / 4, {
      uKind: { value: kind }, uC1: { value: new THREE.Color(...colors[0]) }, uC2: { value: new THREE.Color(...colors[1]) },
      uC3: { value: new THREE.Color(...colors[2]) }, uC4: { value: new THREE.Color(...colors[3]) }, uSeed: { value: extra.seed || 0 },
      uBands: { value: extra.bands || 30 }, uSpot: { value: extra.spot || 0 },
    });
    const g = new THREE.Group(); g.position.copy(pos); if (extra.tilt) g.rotation.set(extra.tilt[0], 0, extra.tilt[1]); scene.add(g);
    const sun = pos.clone().negate().normalize();
    const seg = r > 10 ? gas : [64, 32];
    let mat;
    if (kind === 1) {
      const night = bake(renderer, SURFACE_BAKE_FRAG, texW, texW / 2, { uKind: { value: 4 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() }, uSeed: { value: extra.seed || 0 }, uBands: { value: 0 }, uSpot: { value: 0 } });
      mat = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: EARTH_FRAG, uniforms: { uTex: { value: rt.texture }, uNight: { value: night.texture }, uSun: { value: sun }, uSpin: { value: 0 }, uTime: { value: 0 } } });
    } else {
      mat = new THREE.ShaderMaterial({
        vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
        uniforms: {
          uTex: { value: rt.texture }, uSun: { value: sun }, uCenter: { value: pos.clone() }, uRingN: { value: V3(0, 1, 0) },
          uR: { value: r }, uRin: { value: extra.ring ? extra.ring[0] * r : 0 }, uRout: { value: extra.ring ? extra.ring[1] * r : 0 }, uSpin: { value: 0 },
          uRim: { value: new THREE.Color(...(extra.rim || [1, 0.86, 0.66])) }, uGain: { value: extra.gain || (kind === 0 ? 1.35 : 1.9) },
          uWarm: { value: extra.warm != null ? extra.warm : kind === 0 ? 0.6 : 0.15 },
        },
      });
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg[0], seg[1]), mat); g.add(mesh);
    if (extra.atmo) {
      const k = extra.atmo[3] || 1.05;
      const atmo = new THREE.Mesh(new THREE.SphereGeometry(r * k, seg[0] / 2, seg[1] / 2), new THREE.ShaderMaterial({
        vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        uniforms: { uSun: { value: sun }, uColor: { value: new THREE.Color(extra.atmo[0], extra.atmo[1], extra.atmo[2]) }, uEdge: { value: Math.sqrt(1 - 1 / (k * k)) }, uFwd: { value: extra.fwd || 0.3 } },
      }));
      g.add(atmo);
    }
    if (extra.ring) {
      const geo = new THREE.RingGeometry(extra.ring[0] * r, extra.ring[1] * r, mobile ? 192 : 320, 1); geo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
        uniforms: { uSun: { value: sun }, uCenter: mat.uniforms.uCenter, uRingN: mat.uniforms.uRingN, uR: { value: r }, uRin: mat.uniforms.uRin, uRout: mat.uniforms.uRout },
      }));
      ring.renderOrder = 1; g.add(ring);
      g.updateMatrixWorld(true);
      mat.uniforms.uRingN.value.set(0, 1, 0).applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion())).normalize();
    }
    const p = { g, mesh, mat, rt, spin: extra.spin || 0.002 };
    planets.push(p);
    return p;
  }
  const earth = planet(EARTH, 2.2, 1, [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]], { atmo: [0.4, 0.66, 1.0, 1.025], fwd: 1.8, seed: 3.1, spin: 0.004, tilt: [0.2, 0.41] });
  const moon = planet(EARTH.clone().add(V3(-14, 3, 10)), 0.6, 2, [[0.42, 0.41, 0.4], [0.62, 0.6, 0.58], [0.3, 0.29, 0.28], [0, 0, 0]], { bands: 0.15, seed: 8, gain: 1.6, rim: [0.5, 0.5, 0.5] });
  planet(MARS, 1.2, 2, [[0.48, 0.2, 0.1], [0.7, 0.36, 0.2], [0.35, 0.15, 0.08], [0, 0, 0]], { bands: 0.2, seed: 2, atmo: [1, 0.6, 0.4, 1.03], gain: 1.7, rim: [1, 0.6, 0.4] });
  const jup = planet(JUP, 40, 0, [[0.8, 0.6, 0.38], [0.45, 0.28, 0.15], [0.92, 0.82, 0.64], [0.62, 0.24, 0.1]], { bands: 34, spot: 1, atmo: [1, 0.84, 0.66, 1.03], spin: 0.006, seed: 1.2, gain: 1.45 });
  planet(EUROPA, 1.6, 2, [[0.86, 0.84, 0.8], [0.95, 0.94, 0.9], [0.55, 0.32, 0.2], [0, 0, 0]], { bands: 0.85, seed: 5, gain: 1.8, rim: [0.8, 0.85, 0.9] });
  const sat = planet(SAT, 33, 0, [[0.78, 0.56, 0.3], [0.5, 0.33, 0.16], [0.88, 0.74, 0.5], [0.42, 0.25, 0.12]], { bands: 26, ring: [1.24, 2.32], atmo: [1, 0.78, 0.5, 1.03], tilt: [0.42, -0.3], spin: 0.005, seed: 7.4, gain: 1.45, warm: 0.7 });
  planet(URA, 14, 3, [[0.62, 0.85, 0.88], [0.52, 0.76, 0.82], [0.7, 0.9, 0.92], [0, 0, 0]], { bands: 18, atmo: [0.6, 0.9, 1, 1.05], tilt: [0, 1.7], rim: [0.6, 0.9, 1], seed: 4 });
  planet(NEP, 13.5, 3, [[0.2, 0.36, 0.78], [0.14, 0.27, 0.66], [0.32, 0.5, 0.9], [0, 0, 0]], { bands: 22, atmo: [0.35, 0.5, 1, 1.05], rim: [0.4, 0.55, 1], seed: 6, gain: 2.2 });
  planet(ERIS, 2.6, 2, [[0.7, 0.69, 0.72], [0.88, 0.87, 0.9], [0.42, 0.4, 0.5], [0, 0, 0]], { bands: 0.55, seed: 11, gain: 1.7, rim: [0.7, 0.5, 1] });
  planet(ERIS.clone().add(V3(16, 2.4, 7)), 0.7, 2, [[0.4, 0.38, 0.4], [0.55, 0.53, 0.55], [0.3, 0.28, 0.3], [0, 0, 0]], { bands: 0.1, seed: 13, gain: 2.4 });

  // ---------- Gefängnisring von Eris ----------
  const prison = new THREE.Group(); prison.position.copy(ERIS); prison.rotation.set(0.32, 0, 0.18); scene.add(prison);
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a4656, roughness: 0.55, metalness: 0.35, emissive: 0x1a0b33, emissiveIntensity: 0.6 });
  prison.add(new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.05, 6, 200), metal));
  prison.add(new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.035, 4, 160), metal));
  const towerGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
  const pl = [], pc = [], ps = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const tw = new THREE.Mesh(towerGeo, metal); tw.position.set(Math.cos(a) * 5.6, 0.22, Math.sin(a) * 5.6); prison.add(tw);
    pl.push(Math.cos(a) * 5.6, 0.5, Math.sin(a) * 5.6); pc.push(0.75, 0.38, 1.6); ps.push(i % 3 ? 2.2 : 4.2);
  }
  for (let i = 0; i < 120; i++) { const a = R() * Math.PI * 2; pl.push(Math.cos(a) * 5.6, 0.05, Math.sin(a) * 5.6); pc.push(0.5, 0.25, 1.1); ps.push(1.1); }
  const glowMat = new THREE.ShaderMaterial({ vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, uniforms: { uPR: { value: pr }, uScale: { value: 40 }, uTime: { value: 0 } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute('position', new THREE.Float32BufferAttribute(pl, 3)); pgeo.setAttribute('aCol', new THREE.Float32BufferAttribute(pc, 3)); pgeo.setAttribute('aSize', new THREE.Float32BufferAttribute(ps, 1));
  prison.add(new THREE.Points(pgeo, glowMat));
  const erisGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture([[0, 'rgba(160,90,255,.35)'], [0.5, 'rgba(120,60,220,.08)'], [1, 'rgba(90,40,200,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  erisGlow.scale.setScalar(26); erisGlow.position.copy(ERIS); scene.add(erisGlow);

  // ---------- Gürtel ----------
  function belt(n, r0, r1, h, fadeKey) {
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, rr = r0 + (r1 - r0) * Math.pow(R(), 0.8);
      p.set([Math.cos(a) * rr, gauss(R) * h, Math.sin(a) * rr], i * 3); s[i] = R();
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: BELT_VERT, fragmentShader: BELT_FRAG, uniforms: { uPR: { value: pr }, uTime: { value: 0 }, uFade: { value: 1 } }, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
    return mat;
  }
  const beltMat = belt(mobile ? 9000 : 18000, BELT_R[0], BELT_R[1], 14);
  const kuiperMat = belt(mobile ? 12000 : 26000, KUIPER_R[0], KUIPER_R[1], 90);

  // Felsbrocken für Tiefe beim Durchflug (Asteroidengürtel und Kuiper)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.95, metalness: 0.05, flatShading: true });
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.7, metalness: 0.05, flatShading: true });
  function rocks(n, center, spread, mat, size) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const k = 0.72 + R() * 0.5; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k * 0.8, pa.getZ(i) * k); }
    geo.computeVertexNormals();
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.set(center.x + gauss(R) * spread.x, center.y + gauss(R) * spread.y, center.z + gauss(R) * spread.z);
      e.set(R() * 6, R() * 6, R() * 6); q.setFromEuler(e); s.setScalar(size * (0.25 + Math.pow(R(), 3) * 2.2));
      m.compose(p, q, s); im.setMatrixAt(i, m);
    }
    scene.add(im);
    return im;
  }
  const beltRocks = rocks(mobile ? 70 : 140, V3(60, 0, -765), V3(70, 18, 40), rockMat, 1.4);
  const kuiperRocks = rocks(mobile ? 60 : 110, V3(-30, 14, -3360), V3(55, 18, 70), iceMat, 1.1);

  // Bahnen (nur am Rand sichtbar): echte Reihenfolge, gleichmäßige Haarlinien
  const orbitMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const orbitGroup = new THREE.Group(); scene.add(orbitGroup);
  for (const p of [EARTH, MARS, JUP, SAT, URA, NEP, ERIS]) {
    const r = Math.hypot(p.x, p.z), pts = [];
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(Math.cos(a) * r, p.y * Math.cos(a - Math.atan2(p.z, p.x)), Math.sin(a) * r); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    orbitGroup.add(new THREE.Line(g, orbitMat));
  }

  // ---------- Der Schwarm: kommt aus Richtung Sonne ----------
  const SW = mobile ? 26 : 44;
  const shipGeo = new THREE.ConeGeometry(0.22, 1.5, 4); shipGeo.rotateX(Math.PI / 2); shipGeo.scale(1, 0.34, 1);
  const swarmMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35, metalness: 0.9 });
  const swarm = new THREE.InstancedMesh(shipGeo, swarmMat, SW); swarm.frustumCulled = false; scene.add(swarm);
  const swarmData = [];
  const toward = STOPS[0].pos.clone();
  for (let i = 0; i < SW; i++) {
    const a = V3(gauss(R) * 9, gauss(R) * 6, 18 + R() * 30);
    const b = toward.clone().add(V3(gauss(R) * 30, gauss(R) * 14, 60 + R() * 40));
    swarmData.push({ a, b, ph: R(), dur: 70 + R() * 60 });
  }
  const lightPos = new Float32Array(SW * 3), lightCol = new Float32Array(SW * 3), lightSize = new Float32Array(SW);
  for (let i = 0; i < SW; i++) { lightCol.set(i % 3 ? [0, 0, 0] : [3.2, 0.55, 0.3], i * 3); lightSize[i] = 1.6; }
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lightPos, 3)); lgeo.setAttribute('aCol', new THREE.BufferAttribute(lightCol, 3)); lgeo.setAttribute('aSize', new THREE.BufferAttribute(lightSize, 1));
  const swarmLightMat = glowMat.clone(); swarmLightMat.uniforms = { uPR: { value: pr }, uScale: { value: 200 }, uTime: { value: 0 } };
  const swarmLights = new THREE.Points(lgeo, swarmLightMat); swarmLights.frustumCulled = false; scene.add(swarmLights);
  const swarmCenter = new THREE.Vector3();

  // ---------- Kamera ----------
  let progress = 0, travel = 0, hover = null, hoverK = 0, sub = 0, subS = 0;
  const desiredPos = STOPS[0].pos.clone(), desiredQ = new THREE.Quaternion();
  const look = new THREE.PerspectiveCamera(); // Kamera-lookAt: Blick entlang −z
  const qFor = (pos, at, out) => { look.position.copy(pos); look.lookAt(at); return out.copy(look.quaternion); };
  camera.position.copy(STOPS[0].pos); qFor(STOPS[0].pos, STOPS[0].at, camera.quaternion);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpD = new THREE.Vector3(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  function stopPose(i, t, outPos, outQ) {
    const s = STOPS[i];
    const tall = camera.aspect < 1 && s.posTall;
    const sPos = tall ? s.posTall : s.pos, sAt = tall ? s.atTall : s.at;
    // leichtes Schweben um die Station, damit das Bild lebt
    const drift = i === 7 ? 40 : i >= 2 && i <= 4 ? 3.2 : i === 0 ? 1.2 : 0.35;
    if (i === 3) {
      // Warum: je Grund ein anderer Blick auf Saturn (Umlauf um den Planeten, Höhe wechselt, Ringe kippen ins Bild)
      const a = -0.6 + subS * 0.9; // bleibt auf der Tagseite
      const off = tmpC.copy(sPos).sub(SAT).applyAxisAngle(up, a);
      off.y += Math.sin(subS * Math.PI * 2) * 22 - 6;
      off.multiplyScalar(1 - 0.18 * Math.sin(subS * Math.PI));
      outPos.copy(SAT).add(off);
      const look = tmpD.copy(sAt).sub(SAT).applyAxisAngle(up, a * 0.6);
      outPos.add(tmpB.set(Math.sin(t * 0.07 + i) * drift, Math.sin(t * 0.05 + i * 2) * drift * 0.4, Math.cos(t * 0.06 + i) * drift * 0.5));
      qFor(outPos, look.add(SAT), outQ);
      return;
    }
    outPos.copy(sPos).add(tmpB.set(Math.sin(t * 0.07 + i) * drift, Math.sin(t * 0.05 + i * 2) * drift * 0.4, Math.cos(t * 0.06 + i) * drift * 0.5));
    qFor(outPos, sAt, outQ);
  }
  function computeDesired(t) {
    const i = Math.min(STOPS.length - 1, Math.floor(progress));
    const f = progress - i;
    const e = easeIO(f);
    stopPose(i, t, desiredPos, desiredQ);
    if (f > 0 && i < STOPS.length - 1) {
      stopPose(i + 1, t, tmpA, qb);
      const lift = desiredPos.distanceTo(tmpA) * 0.06 * Math.sin(Math.PI * e);
      desiredPos.lerp(tmpA, e); desiredPos.y += lift;
      desiredQ.slerp(qb, e);
    }
    // Kapitel 2: Heimat der Fraktion anfliegen
    const inFactions = 1 - Math.min(1, Math.abs(progress - 2) * 2.2);
    if (hover && inFactions > 0) {
      const h = HOMES[hover];
      tmpA.copy(h.pos).add(tmpB.set(Math.sin(t * 0.09) * 0.6, Math.sin(t * 0.07) * 0.3, 0));
      qFor(tmpA, h.at, qa);
      const k = hoverK * inFactions;
      desiredPos.lerp(tmpA, k); desiredQ.slerp(qa, k);
    }
  }

  // ---------- Größe ----------
  function size() { if (forced) return forced; const r = canvas.getBoundingClientRect(); return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))]; }
  function resize() {
    const [w, h] = size();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect >= 1 ? 40 : 58;
    camera.updateProjectionMatrix();
  }
  resize();

  // ---------- Bild ----------
  let clock = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; pointer.ty = (e.clientY / innerHeight) * 2 - 1; };
  if (!forced && !mobile) addEventListener('pointermove', onPointer, { passive: true });
  const mtx = new THREE.Matrix4(), mq = new THREE.Quaternion(), ms = new THREE.Vector3(1, 1, 1), mp = new THREE.Vector3(), dir = new THREE.Vector3(), up = V3(0, 1, 0);
  const parallax = new THREE.Quaternion(), pe = new THREE.Euler();
  let first = true, shake = 0;

  function update(t, dt) {
    starMat.uniforms.uTime.value = t; glowMat.uniforms.uTime.value = t; swarmLightMat.uniforms.uTime.value = t;
    beltMat.uniforms.uTime.value = t; kuiperMat.uniforms.uTime.value = t;
    for (const p of planets) p.mat.uniforms.uSpin.value = t * p.spin * 0.05;
    earth.mat.uniforms.uTime.value = t;
    subS += (sub - subS) * Math.min(1, dt * 5.5);
    prison.rotation.y = t * 0.02;
    hoverK += ((hover ? 1 : 0) - hoverK) * Math.min(1, dt * 7);

    computeDesired(t);
    if (first || forced) { camera.position.copy(desiredPos); camera.quaternion.copy(desiredQ); first = false; }
    else {
      const kp = 1 - Math.exp(-dt * 7.5), kq = 1 - Math.exp(-dt * 9);
      camera.position.lerp(desiredPos, kp);
      camera.quaternion.slerp(desiredQ, kq);
    }
    // Kamerastoß beim Kapitelwechsel: kurz, hart, schnell abklingend
    if (shake > 0.001) {
      shake *= Math.exp(-dt * 11);
      pe.set((Math.random() - 0.5) * 0.02 * shake, (Math.random() - 0.5) * 0.028 * shake, (Math.random() - 0.5) * 0.012 * shake);
      parallax.setFromEuler(pe); camera.quaternion.multiply(parallax);
    }
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 6); pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 6);
    pe.set(-pointer.y * 0.014, -pointer.x * 0.022, 0); parallax.setFromEuler(pe);
    camera.quaternion.multiply(parallax);
    camera.updateMatrixWorld();
    skyGroup.position.copy(camera.position);

    // Schwarm
    const inHero = 1 - smooth(0.6, 1.6, progress);
    swarm.visible = swarmLights.visible = inHero > 0.001;
    if (swarm.visible) {
      let best = -1;
      for (let i = 0; i < SW; i++) {
        const d = swarmData[i];
        const k = ((t / d.dur + d.ph) % 1);
        mp.lerpVectors(d.a, d.b, k);
        dir.subVectors(d.b, d.a).normalize();
        mq.setFromUnitVectors(V3(0, 0, 1), dir);
        const sc = (1.0 + k * 1.6) * smooth(0, 0.05, k) * (1 - smooth(0.93, 1, k));
        ms.setScalar(Math.max(0.0001, sc));
        mtx.compose(mp, mq, ms); swarm.setMatrixAt(i, mtx);
        lightPos.set([mp.x + dir.x * 0.75 * sc, mp.y + dir.y * 0.75 * sc, mp.z + dir.z * 0.75 * sc], i * 3);
        lightSize[i] = (i % 3 ? 0 : 1.4) * sc * inHero;
        if (k > best && k < 0.75 && i % 3 === 0) { best = k; swarmCenter.copy(mp); }
      }
      swarm.instanceMatrix.needsUpdate = true; lgeo.attributes.position.needsUpdate = true; lgeo.attributes.aSize.needsUpdate = true;
    }
    orbitMat.opacity = smooth(6.3, 7, progress) * 0.12;
    beltMat.uniforms.uFade.value = 0.6 + 0.4 * (1 - smooth(6, 7, progress));
    // Sonne: Streiflicht nur, wenn sie im Bild ist
    dir.copy(camera.position).negate().normalize();
    const facing = dir.dot(camera.getWorldDirection(tmpB));
    streak.material.opacity = smooth(0.9, 0.995, facing) * 0.55;
    sunHalo.material.opacity = 0.35 + 0.65 * smooth(0.6, 0.98, facing);
    const dsun = camera.position.length();
    sunCore.scale.setScalar(Math.max(44, dsun * 0.014));
  }

  // ---------- Marken (Hero) ----------
  const proj = new THREE.Vector3();
  function project(v3, w, h) {
    proj.copy(v3).project(camera);
    const vis = proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1;
    return { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h, vis };
  }

  // ---------- Schleife ----------
  let raf = 0, running = false, last = 0, frames = 0, acc = 0, sampleStart = 0, warm = 0, slow = 0;
  let minFrame = 1000 / 61;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (last && now - last < minFrame - 1) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    clock += dt;
    update(clock, dt);
    renderer.render(scene, camera);
    if (opts.onFrame) {
      const [w, h] = [canvas.clientWidth, canvas.clientHeight];
      opts.onFrame({ sun: project(V3(0, 0, 0), w, h), earth: project(EARTH, w, h), swarm: project(swarmCenter, w, h), progress });
    }
    watch(now, dt);
  }
  function watch(now, dt) {
    warm += dt;
    if (warm < 2) return;
    frames++; acc += dt;
    if (!sampleStart) sampleStart = now;
    if (now - sampleStart < 2000) return;
    const avg = (acc / frames) * 1000;
    frames = 0; acc = 0; sampleStart = now;
    if (avg > 26 && pr > 1.0) { setPR(Math.max(1.0, pr - 0.35)); return; }
    if (avg > 26 && pr > 0.7) { setPR(0.7); return; }
    if (avg > 45) { minFrame = Math.max(minFrame, 1000 / 31); if (avg > 70 && ++slow >= 4) { opts.onSlow?.(); stop(); } return; }
    slow = 0;
    if (avg < 14 && pr < maxPR) setPR(Math.min(maxPR, pr + 0.25));
  }
  function setPR(v) {
    pr = v; renderer.setPixelRatio(pr);
    starMat.uniforms.uPR.value = pr; glowMat.uniforms.uPR.value = pr; swarmLightMat.uniforms.uPR.value = pr;
    beltMat.uniforms.uPR.value = pr; kuiperMat.uniforms.uPR.value = pr;
    resize();
  }
  function start() { if (running) return; running = true; last = 0; warm = 0; frames = 0; acc = 0; sampleStart = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  if (!forced) { const ro = new ResizeObserver(() => resize()); ro.observe(canvas); }

  return {
    start, stop,
    get running() { return running; },
    setProgress(p) { progress = Math.max(0, Math.min(STOPS.length - 1, p)); },
    setHover(f) { hover = f; },
    setSub(k) { sub = Math.max(0, Math.min(1, k)); },
    kick(s = 1) { shake = Math.min(1.4, shake + s); },
    setFps(f) { minFrame = 1000 / (f + 1); },
    au() {
      const i = Math.min(STOPS.length - 1, Math.floor(progress)), f = progress - i;
      const a = STOPS[i].au, b = STOPS[Math.min(STOPS.length - 1, i + 1)].au;
      return a + (b - a) * easeIO(f);
    },
    // Standbild: Kamera auf Station i, Zeit t
    still(i, t = 12) { progress = i; first = true; clock = t; update(t, 0.016); renderer.render(scene, camera); },
    renderer,
    debug: import.meta.env.DEV ? { planets, sat, earth, jup, STOPS, camera } : null,
  };
}

// Entfernung in AE je Kapitel (auch ohne 3D für die Anzeige)
export const STOP_AU = STOPS.map((s) => s.au);
