// Begehbare 3D-Systemkarte: drehen, zoomen, Gebiet wählen. Nicht maßstabsgetreu, Reihenfolge echt.
// Bedienung per Tastatur über die Liste daneben; die Karte ist die Ergänzung dazu.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const FX = { europa: 0xd8b25a, saturn: 0xe0782a, eris: 0x9a52ff };
const WHITE = 0xe9edf2;

// Gebiete: Radius auf der Karte, Winkel, Höhe, Farbe
const REG = {
  stille: { r: 2.6, a: 0.6, y: 0, c: 0xff5a4a },
  bm: { r: 5.2, a: 2.3, y: 0, c: WHITE },
  europa: { r: 8, a: 4.0, y: 0, c: FX.europa },
  saturn: { r: 11, a: 5.6, y: 0, c: FX.saturn },
  front: { r: 15, a: 1.1, y: 0, c: WHITE },
  kuiper: { r: 19.8, a: 3.0, y: 0, c: WHITE },
  eris: { r: 24, a: 4.9, y: 3.2, c: FX.eris },
};
const PLAN = [
  ['Merkur', 1.1, 0.4, 0.12, 0x8a8a8a], ['Venus', 1.7, 2.6, 0.18, 0xc9b48a], ['Erde', 2.6, 0.6, 0.2, 0x4a7ad8], ['Mars', 3.5, 5.1, 0.15, 0xb8603a],
  ['Jupiter', 8, 4.0, 0.62, 0xd8c09a], ['Saturn', 11, 5.6, 0.52, 0xe0cc9a], ['Uranus', 14, 1.4, 0.36, 0x9ad8e0], ['Neptun', 16.4, 0.75, 0.35, 0x4a6ad8],
];

function ring(r, color, opacity, seg = 192, dash = false) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dash ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.3, gapSize: 0.25 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(g, m); if (dash) l.computeLineDistances();
  return l;
}

export function initMap(root, opts = {}) {
  const canvas = root.querySelector('.map-canvas');
  const labels = root.querySelector('[data-map-labels]');
  const mobile = opts.mobile;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x04060a, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 400);
  const home = { pos: new THREE.Vector3(0, 34, 44), target: new THREE.Vector3(0, 0, 0) };
  camera.position.copy(home.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.minDistance = 6; controls.maxDistance = 70; controls.maxPolarAngle = Math.PI * 0.48; controls.rotateSpeed = 0.6;
  controls.autoRotate = !opts.reduce; controls.autoRotateSpeed = 0.25;
  if (matchMedia('(pointer: coarse)').matches) {
    controls.touches = { ONE: -1, TWO: THREE.TOUCH.DOLLY_ROTATE };
    canvas.style.touchAction = 'pan-y';
  }
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // Raster der Ekliptik
  const grid = new THREE.Group(); scene.add(grid);
  for (let r = 4; r <= 28; r += 4) grid.add(ring(r, 0xffffff, 0.035, 128));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4), new THREE.Vector3(Math.cos(a) * 28, 0, Math.sin(a) * 28)]);
    grid.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: i % 6 ? 0.025 : 0.06 })));
  }
  // Sonne
  const sunTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,230,180,.7)'); gr.addColorStop(1, 'rgba(255,160,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sun.scale.setScalar(3.4); scene.add(sun);
  scene.add(new THREE.PointLight(0xfff2e0, 3, 0, 0));
  scene.add(new THREE.AmbientLight(0x404a5a, 0.6));

  // Bahnen und Planeten
  const planetGeo = new THREE.SphereGeometry(1, 24, 16);
  for (const [, r, a, s, c] of PLAN) {
    scene.add(ring(r, 0xffffff, r < 4 ? 0.09 : 0.16));
    const m = new THREE.Mesh(planetGeo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, emissive: c, emissiveIntensity: 0.08 }));
    m.scale.setScalar(s); m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(m);
  }
  // Saturnring
  { const p = REG.saturn; const rr = new THREE.Mesh(new THREE.RingGeometry(0.72, 1.1, 48), new THREE.MeshBasicMaterial({ color: 0xe0cc9a, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })); rr.rotation.x = -Math.PI / 2 + 0.4; rr.position.set(Math.cos(p.a) * p.r, 0, Math.sin(p.a) * p.r); scene.add(rr); }
  // Gürtel als Punktwolken
  function belt(n, r0, r1, h, op) {
    const p = new Float32Array(n * 3); let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, r = r0 + (r1 - r0) * rnd(); p.set([Math.cos(a) * r, (rnd() - 0.5) * h, Math.sin(a) * r], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfcac2, size: 0.06, transparent: true, opacity: op, depthWrite: false })));
  }
  belt(mobile ? 1400 : 2600, 4.6, 5.8, 0.25, 0.55);
  belt(mobile ? 2000 : 4000, 18.5, 21.5, 1.1, 0.4);
  // Eris: geneigte, exzentrische Bahn
  const erisOrbit = ring(1, FX.eris, 0.45, 220, true); erisOrbit.scale.set(24, 1, 17); erisOrbit.position.set(-3, 0, 4); erisOrbit.rotation.set(0.14, 0.3, 0.1); scene.add(erisOrbit);
  { const p = REG.eris; const m = new THREE.Mesh(planetGeo, new THREE.MeshStandardMaterial({ color: 0xd8d8e0, emissive: FX.eris, emissiveIntensity: 0.25 })); m.scale.setScalar(0.18); m.position.set(Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r); scene.add(m); }

  // Gebietsmarken
  const markGeo = new THREE.RingGeometry(0.55, 0.62, 4, 1); markGeo.rotateX(-Math.PI / 2); markGeo.rotateY(Math.PI / 4);
  const marks = {};
  for (const [id, p] of Object.entries(REG)) {
    const g = new THREE.Group(); g.position.set(Math.cos(p.a) * p.r, p.y, Math.sin(p.a) * p.r);
    const mat = new THREE.MeshBasicMaterial({ color: p.c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const m = new THREE.Mesh(markGeo, mat); g.add(m);
    const pulse = new THREE.Mesh(markGeo, mat.clone()); pulse.material.opacity = 0; g.add(pulse);
    const stem = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.4, 0)]), new THREE.LineBasicMaterial({ color: p.c, transparent: true, opacity: 0.5 }));
    g.add(stem);
    scene.add(g);
    const el = document.createElement('span');
    el.className = 'map-lbl'; el.dataset.region = id;
    el.style.setProperty('--c', '#' + p.c.toString(16).padStart(6, '0'));
    const btn = root.querySelector(`[data-region="${id}"]`);
    el.innerHTML = `<i></i><b>${btn ? btn.querySelector('b').textContent : id}</b><em>${btn ? btn.querySelector('.ls-num').textContent : ''}</em>`;
    el.addEventListener('click', () => opts.onPick?.(id));
    labels.appendChild(el);
    marks[id] = { g, m, pulse, el, stem };
  }

  let sel = 'stille';
  const focus = { from: null, to: null, t: 1 };
  function select(id, fly = true) {
    sel = id;
    for (const [k, mk] of Object.entries(marks)) {
      const on = k === id;
      mk.m.scale.setScalar(on ? 1.5 : 1); mk.el.classList.toggle('is-on', on); mk.stem.material.opacity = on ? 0.9 : 0.35;
    }
    if (fly) {
      const p = marks[id].g.position;
      focus.from = controls.target.clone(); focus.to = p.clone().multiplyScalar(0.55); focus.t = 0;
    }
  }
  select(sel, false);
  function reset() {
    controls.autoRotate = !opts.reduce;
    focus.from = controls.target.clone(); focus.to = home.target.clone(); focus.t = 0;
    camera.position.copy(home.pos);
  }

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1.2 ? 50 : 38; camera.updateProjectionMatrix();
    home.pos.set(0, camera.aspect < 1.2 ? 36 : 34, camera.aspect < 1.2 ? 34 : 44);
  }
  const ro = new ResizeObserver(size); ro.observe(canvas); size(); camera.position.copy(home.pos);

  const v = new THREE.Vector3();
  let raf = 0, running = false, last = 0, t = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    if (focus.t < 1) { focus.t = Math.min(1, focus.t + dt * 1.4); const e = 1 - Math.pow(1 - focus.t, 3); controls.target.lerpVectors(focus.from, focus.to, e); }
    controls.update();
    const pm = marks[sel].pulse; const k = (t * 0.7) % 1;
    pm.scale.setScalar(1.5 + k * 2.2); pm.material.opacity = opts.reduce ? 0 : (1 - k) * 0.6;
    renderer.render(scene, camera);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const mk of Object.values(marks)) {
      v.copy(mk.g.position); v.y += 1.4; v.project(camera);
      const vis = v.z < 1;
      mk.el.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
      mk.el.style.visibility = vis ? '' : 'hidden';
    }
  }
  return {
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    select, reset,
  };
}
