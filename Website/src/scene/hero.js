// 3D-Szene der Startseite: Milchstraße, Sterne, Gasriese mit Ringen und Atmosphäre, SATURN-Starter.
// Wird erst nach dem ersten Bild nachgeladen. Läuft nur, solange der Hero sichtbar ist,
// passt die Auflösung an die Leistung an und fällt sonst auf das Standbild zurück.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BAKE_VERT, SKY_BAKE_FRAG, SKY_VERT, SKY_FRAG, STAR_VERT, STAR_FRAG, PLANET_BAKE_FRAG, PLANET_VERT, PLANET_FRAG,
  ATMO_VERT, ATMO_FRAG, RING_VERT, RING_FRAG, DUST_VERT, DUST_FRAG,
} from './shaders.js';

const SHIP_URL = '/models/saturn-starter.glb';
const ease = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;

// Einmal in eine Textur rendern (Himmel, Planetenoberfläche)
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
  return rt;
}

// Sternfarben nach Spektralklassen (Anteil, Farbe)
const SPECTRAL = [
  [0.03, [0.62, 0.72, 1.0]], [0.08, [0.78, 0.85, 1.0]], [0.16, [0.95, 0.96, 1.0]],
  [0.22, [1.0, 0.96, 0.88]], [0.26, [1.0, 0.86, 0.68]], [0.25, [1.0, 0.72, 0.52]],
];
function starColor(r) {
  let acc = 0;
  for (const [p, c] of SPECTRAL) { acc += p; if (r <= acc) return c; }
  return SPECTRAL[SPECTRAL.length - 1][1];
}
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(R) { let u = 0; for (let i = 0; i < 4; i++) u += R(); return (u - 2) / 0.577; }

export function startHero(root, opts = {}) {
  const canvas = root.querySelector('.hero-canvas');
  const posterMode = opts.poster || null; // 'wide' | 'tall'
  const forced = posterMode === 'wide' ? [1920, 1080] : posterMode === 'tall' ? [1080, 1920] : null;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!posterMode, stencil: false });
  } catch (e) { opts.onFail?.('webgl'); return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x04060a, 1);

  const maxPR = forced ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
  let pr = maxPR;
  renderer.setPixelRatio(pr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 4000);

  // Sonne links oben, leicht von vorn: Planet als breite Sichel, Schiff im Streiflicht
  const sun = new THREE.Vector3(-1, 0.42, 0.34).normalize();

  // ---------- Himmel ----------
  const pole = new THREE.Vector3(0.52, 0.84, 0.16).normalize();
  const coreDir = new THREE.Vector3(-0.55, 0.2, -0.8);
  coreDir.sub(pole.clone().multiplyScalar(coreDir.dot(pole))).normalize();
  const skyRT = bake(renderer, SKY_BAKE_FRAG, 2048, 1024, { uPole: { value: pole }, uCore: { value: coreDir } });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: { uSky: { value: skyRT.texture } }, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -3;
  scene.add(sky);

  // ---------- Sterne ----------
  const N = forced ? 11000 : 9000;
  const R = seeded(2391);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), mag = new Float32Array(N), ph = new Float32Array(N);
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  u.crossVectors(pole, new THREE.Vector3(0, 0, 1)).normalize(); v.crossVectors(pole, u).normalize();
  for (let i = 0; i < N; i++) {
    let d;
    if (R() < 0.42) { // in der Milchstraße gehäuft
      const a = R() * Math.PI * 2, h = gauss(R) * 0.09;
      d = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a))).add(pole.clone().multiplyScalar(h)).normalize();
    } else {
      const z = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      d = new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a));
    }
    pos.set([d.x * 1400, d.y * 1400, d.z * 1400], i * 3);
    const m = Math.pow(R(), 9);
    mag[i] = m;
    const c = starColor(R());
    const desat = 0.55 + 0.45 * m; // schwache Sterne wirken blasser
    col.set([lerp(1, c[0], desat), lerp(1, c[1], desat), lerp(1, c[2], desat)], i * 3);
    ph[i] = R();
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  starGeo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uTime: { value: 0 }, uPR: { value: pr } },
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -2; stars.frustumCulled = false;
  scene.add(stars);

  // ---------- Gasriese ----------
  const PR = 46, RIN = PR * 1.24, ROUT = PR * 2.32;
  const planetRT = bake(renderer, PLANET_BAKE_FRAG, 2048, 1024);
  planetRT.texture.wrapS = THREE.RepeatWrapping;
  const sys = new THREE.Group();
  sys.rotation.set(0.3, 0, -0.38);
  scene.add(sys);
  const pU = {
    uTex: { value: planetRT.texture }, uSun: { value: sun }, uCenter: { value: new THREE.Vector3() }, uRingN: { value: new THREE.Vector3() },
    uR: { value: PR }, uRin: { value: RIN }, uRout: { value: ROUT }, uSpin: { value: 0 },
  };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(PR, 160, 96), new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: pU }));
  sys.add(planet);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(PR * 1.05, 96, 48),
    new THREE.ShaderMaterial({
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      uniforms: { uSun: { value: sun }, uColor: { value: new THREE.Color(1.0, 0.8, 0.58) }, uEdge: { value: Math.sqrt(1 - 1 / (1.05 * 1.05)) } },
    }),
  );
  sys.add(atmo);
  const ringGeo = new THREE.RingGeometry(RIN, ROUT, 384, 1);
  ringGeo.rotateX(-Math.PI / 2);
  const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    vertexShader: RING_VERT, fragmentShader: RING_FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    uniforms: { uSun: { value: sun }, uCenter: pU.uCenter, uRingN: pU.uRingN, uR: { value: PR }, uRin: { value: RIN }, uRout: { value: ROUT } },
  }));
  ring.renderOrder = 1;
  sys.add(ring);

  // ---------- Licht für das Schiff (Hangar-Licht: Studio-Umgebung + Streiflicht + kühle Kante) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.42;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff1dc, 3.4); key.position.copy(sun).multiplyScalar(100); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc2ff, 2.6); rim.position.set(60, 40, -90); scene.add(rim);
  const bounce = new THREE.DirectionalLight(0xffc890, 0.6); bounce.position.set(80, 60, -200); scene.add(bounce);
  scene.add(new THREE.HemisphereLight(0x7d8aa8, 0x050608, 0.35));

  // ---------- Schiff ----------
  const shipRig = new THREE.Group(); // Position und Bahn
  const shipBody = new THREE.Group(); // Lage (Neigen, Rollen)
  shipRig.add(shipBody);
  scene.add(shipRig);
  let shipReady = false;
  let shipT0 = 0;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(SHIP_URL, (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    const s = 4.2 / Math.max(size.x, size.z);
    const wrap = new THREE.Group(); wrap.add(m); wrap.scale.setScalar(s);
    m.traverse((o) => { if (o.isMesh && o.material) { o.material.envMapIntensity = 1; } });
    shipBody.add(wrap);
    // Triebwerksglühen hinten (glTF: Bug zeigt nach +z)
    const glowTex = makeGlowTexture();
    for (const x of [-0.62, 0.62]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
      sp.position.set(x * size.x * s * 0.5, 0.05, -size.z * s * 0.5 - 0.1);
      sp.scale.setScalar(0.9);
      sp.userData.glow = true;
      shipBody.add(sp);
    }
    shipReady = true;
    shipT0 = clock;
    opts.onShip?.();
  }, undefined, () => opts.onShipFail?.());

  // ---------- Staub ----------
  const DN = 520;
  const dpos = new Float32Array(DN * 3), dseed = new Float32Array(DN);
  const box = new THREE.Vector3(36, 18, 30);
  for (let i = 0; i < DN; i++) { dpos.set([(R() - 0.5) * box.x, (R() - 0.5) * box.y, (R() - 0.5) * box.z], i * 3); dseed[i] = R(); }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dustMat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: pr }, uBox: { value: box }, uVel: { value: new THREE.Vector3(1.6, 0.05, 0.9) } },
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ---------- Bildaufbau je Seitenverhältnis ----------
  const tmp = new THREE.Vector3();
  const at = (nx, ny, dist) => { tmp.set(nx, ny, 0.5).unproject(camera).normalize().multiplyScalar(dist); return tmp.clone(); };
  let shipHome = new THREE.Vector3(), shipScale = 1, wide = true;
  function layout(w, h) {
    camera.aspect = w / h;
    wide = camera.aspect >= 1;
    camera.fov = wide ? 34 : 46;
    camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if (wide) {
      const nx = camera.aspect > 1.9 ? 0.44 : camera.aspect > 1.5 ? 0.42 : 0.4;
      sys.position.copy(at(nx, 0.3, 300));
      shipHome = at(nx - 0.08, -0.3, 13.5);
      shipScale = camera.aspect < 1.4 ? 0.85 : 1;
    } else {
      sys.position.copy(at(0.38, 0.5, 330));
      shipHome = at(0.04, 0.2, 15);
      shipScale = 0.82;
    }
    dust.position.copy(shipHome);
    sys.updateMatrixWorld(true);
    pU.uCenter.value.setFromMatrixPosition(planet.matrixWorld);
    pU.uRingN.value.set(0, 1, 0).applyQuaternion(sys.getWorldQuaternion(new THREE.Quaternion())).normalize();
  }

  function size() {
    if (forced) return forced;
    const r = canvas.getBoundingClientRect();
    return [Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height))];
  }
  function resize() {
    const [w, h] = size();
    renderer.setSize(w, h, false);
    layout(w, h);
  }
  resize();

  // ---------- Bewegung ----------
  let clock = 0;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e) => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; pointer.ty = (e.clientY / innerHeight) * 2 - 1; };
  if (!forced) addEventListener('pointermove', onPointer, { passive: true });

  function update(t, dt) {
    starMat.uniforms.uTime.value = t;
    dustMat.uniforms.uTime.value = t;
    pU.uSpin.value = t * 0.0009;
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 2);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 2);
    camera.rotation.set(-pointer.y * 0.012, -pointer.x * 0.02, 0);
    if (shipReady) {
      const k = forced ? 1 : ease(Math.min(1, (t - shipT0) / 3.4));
      // Einflug von rechts hinten, danach Schweben mit langsamer Drehung
      const from = tmp.set(shipHome.x + 26, shipHome.y + 2.5, shipHome.z - 30);
      shipRig.position.set(lerp(from.x, shipHome.x, k), lerp(from.y, shipHome.y, k), lerp(from.z, shipHome.z, k));
      shipRig.position.y += Math.sin(t * 0.7) * 0.08;
      shipRig.position.x += Math.sin(t * 0.23) * 0.18;
      shipRig.scale.setScalar(shipScale);
      const yaw = -0.62 + Math.sin(t * 0.16) * 0.34 + (1 - k) * -0.9;
      shipBody.rotation.set(0.36 + Math.sin(t * 0.31) * 0.035, yaw, -0.08 + Math.sin(t * 0.4) * 0.05 + (1 - k) * 0.35, 'YXZ');
      for (const o of shipBody.children) if (o.userData.glow) o.material.opacity = 0.62 + Math.sin(t * 9 + o.position.x * 7) * 0.08 + (1 - k) * 0.3;
    }
  }

  // ---------- Schleife: max. 60 Bilder/s, nur sichtbar, Leistung beobachten ----------
  let raf = 0, running = false, last = 0, lastDraw = 0, frames = 0, acc = 0, sampleStart = 0, warm = 0;
  const minFrame = 1000 / 61;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - lastDraw < minFrame - 1) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now; lastDraw = now;
    clock += dt;
    update(clock, dt);
    renderer.render(scene, camera);
    watch(now, dt);
  }
  function watch(now, dt) {
    warm += dt;
    if (warm < 1.5) return;
    frames++; acc += dt;
    if (!sampleStart) sampleStart = now;
    if (now - sampleStart < 2000) return;
    const avg = (acc / frames) * 1000;
    frames = 0; acc = 0; sampleStart = now;
    if (avg > 24 && pr > 1.0) { setPR(Math.max(1.0, pr - 0.35)); return; }
    if (avg > 24 && pr > 0.75 && devicePixelRatio <= 1.01) { setPR(0.75); return; }
    if (avg > 36) { opts.onSlow?.(); stop(); }
    else if (avg < 14 && pr < maxPR) setPR(Math.min(maxPR, pr + 0.25));
  }
  function setPR(v) {
    pr = v; renderer.setPixelRatio(pr); starMat.uniforms.uPR.value = pr; dustMat.uniforms.uPR.value = pr; resize();
  }
  function start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  // Standbild für die Website erzeugen (nur Dev-Server, ?poster=wide|tall)
  if (posterMode) {
    const shoot = () => {
      clock = 9.2;
      update(clock, 0.016);
      renderer.render(scene, camera);
      canvas.toBlob((b) => {
        const name = posterMode === 'wide' ? 'hero-poster.webp' : 'hero-poster-tall.webp';
        fetch('/__poster?name=' + name, { method: 'POST', body: b }).then((r) => r.text()).then((x) => { document.title = 'POSTER ' + x; });
      }, 'image/webp', 0.8);
    };
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${forced[0] / 2}px;height:${forced[1] / 2}px;opacity:1;z-index:999`;
    opts.onShip = () => setTimeout(shoot, 300);
    return { start() {}, stop() {}, dispose() {} };
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);

  return {
    start, stop,
    get running() { return running; },
    dispose() {
      stop(); ro.disconnect(); removeEventListener('pointermove', onPointer);
      renderer.dispose(); skyRT.dispose(); planetRT.dispose(); envRT.dispose();
    },
  };
}

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,220,180,.75)'); gr.addColorStop(0.5, 'rgba(255,150,80,.18)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
