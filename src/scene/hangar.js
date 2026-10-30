// 3D-Hangar: SATURN-Starter (echtes Modell aus dem Spiel) im Hangar-Licht, drehbar.
// Alle anderen Schiffe als Blaupause (Linienmodell), bis ihre echten Modelle fertig sind. Laser und Generatoren sichtbar.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const FX = { europa: 0xd8b25a, saturn: 0xe0782a, eris: 0x9a52ff };
const SHIP_URL = '/models/saturn-starter.glb';

export function initHangar(root, opts = {}) {
  const canvas = root.querySelector('.hg-canvas');
  const pins = root.querySelector('[data-pins]');
  const mobile = opts.mobile;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x05070b, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070b, 14, 34);
  const camera = new THREE.PerspectiveCamera(30, 16 / 10, 0.1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture; scene.environmentIntensity = 0.38;
  pmrem.dispose();

  // ---------- Hangar ----------
  const key = new THREE.SpotLight(0xfff1dc, 60, 30, 0.55, 0.6, 1.6); key.position.set(-3, 9, 4); key.target.position.set(0, 0, 0); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fc2ff, 1.8); rim.position.set(6, 3, -8); scene.add(rim);
  const accent = new THREE.PointLight(FX.saturn, 12, 12, 1.6); accent.position.set(0, -0.2, 0); scene.add(accent);
  scene.add(new THREE.HemisphereLight(0x8090a8, 0x050608, 0.25));

  // Boden mit Raster und Plattform
  const floorMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uC: { value: new THREE.Color(FX.saturn) } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uC; varying vec2 vP;
      float line(float x, float w){ float d = abs(fract(x) - 0.5); return 1.0 - smoothstep(0.5 - w, 0.5, d); }
      void main(){
        float r = length(vP);
        float g = max(line(vP.x * 1.0 + 0.5, 0.015), line(vP.y * 1.0 + 0.5, 0.015)) * 0.16;
        float g2 = max(line(vP.x * 0.25 + 0.5, 0.008), line(vP.y * 0.25 + 0.5, 0.008)) * 0.22;
        float fade = 1.0 - smoothstep(4.0, 13.0, r);
        float ring = (1.0 - smoothstep(0.0, 0.03, abs(r - 3.05))) * 0.9 + (1.0 - smoothstep(0.0, 0.015, abs(r - 3.35))) * 0.35;
        float pad = (1.0 - smoothstep(2.95, 3.0, r)) * 0.05;
        float tick = step(0.94, fract(atan(vP.y, vP.x) / 6.2831853 * 72.0)) * (1.0 - smoothstep(0.0, 0.12, abs(r - 3.2)));
        vec3 c = vec3(1.0) * (g + g2) * fade + uC * (ring + tick * 0.6) + vec3(pad);
        gl_FragColor = vec4(c, clamp((g + g2) * fade + ring + pad + tick, 0.0, 1.0));
      }`,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.05; scene.add(floor);
  // Lichtleisten an der Decke
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  stripMat.color.setScalar(2.2);
  for (const x of [-3.2, 0, 3.2]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 9), stripMat); s.position.set(x, 6, -2); scene.add(s); }
  // Rückwand aus Paneelen
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b0e13, roughness: 0.6, metalness: 0.6 });
  for (let i = -5; i <= 5; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 7, 0.2), wallMat);
    p.position.set(i * 2, 2.4, -9 - Math.abs(i) * 0.12); p.rotation.y = -i * 0.03; scene.add(p);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.2, 0.02), stripMat.clone()); l.material.color.setScalar(i % 2 ? 0.08 : 0.22);
    l.position.set(i * 2 + 0.96, 0.4, -8.88 - Math.abs(i) * 0.12); scene.add(l);
  }

  // ---------- Schiffe ----------
  const turn = new THREE.Group(); scene.add(turn);
  let real = null; const realHP = []; let realLen = 4.2;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  let wantReal = true;
  loader.load(SHIP_URL, (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    const s = 5 / Math.max(size.x, size.z);
    real = new THREE.Group(); real.add(m); real.scale.setScalar(s); real.position.y = 0.05;
    realLen = Math.max(size.x, size.z) * s;
    m.traverse((o) => { if (o.isMesh && o.material) o.material.envMapIntensity = 1.1; });
    // Andockpunkte: im GLB stecken nur die Generator-Fassungen; Laser vorn an den Seiten wie im Spiel (Platzhalter-Layout s1)
    m.updateMatrixWorld(true);
    const gen = m.getObjectByName('Generator_Port_Geometry');
    const gc = gen ? new THREE.Box3().setFromObject(gen).getCenter(new THREE.Vector3()) : new THREE.Vector3(size.x * 0.22, size.y * 0.3, size.z * 0.23);
    const back = Math.sign(gc.z) || 1;
    const pts = [
      ['l', -size.x * 0.4, -size.y * 0.12, -back * size.z * 0.2], ['l', size.x * 0.4, -size.y * 0.12, -back * size.z * 0.2],
      ['g', gc.x, gc.y + size.y * 0.08, gc.z], ['g', -gc.x, gc.y + size.y * 0.08, gc.z],
    ];
    for (const [k, x, y, z] of pts) { const o = new THREE.Object3D(); o.position.set(x, y, z).sub(m.position); m.add(o); realHP.push({ o, k }); }
    show();
    opts.onReady?.();
  }, undefined, () => opts.onFail?.());

  function blueprint(tier, nL, nG, color) {
    const g = new THREE.Group();
    const k = 1 + tier * 0.09;
    const len = 3.6 * k, wid = 1.1 * k, wing = (1.6 + tier * 0.18);
    const parts = [];
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); parts.push(geo); };
    // Rumpf: gestreckter Achtkant mit Bug
    add(new THREE.CylinderGeometry(wid * 0.32, wid * 0.42, len * 0.62, 8, 1), 0, 0, -0.1 * len, Math.PI / 2);
    add(new THREE.ConeGeometry(wid * 0.32, len * 0.34, 8, 1), 0, 0, len * 0.38, Math.PI / 2);
    // Flügel
    for (const sgn of [-1, 1]) {
      const w = new THREE.BoxGeometry(wing, 0.06, len * 0.32);
      add(w, sgn * (wid * 0.36 + wing / 2), -0.04, -0.12 * len, 0, sgn * -0.22, 0);
      add(new THREE.BoxGeometry(0.08, 0.3 + tier * 0.02, len * 0.2), sgn * (wid * 0.36 + wing * 0.96), 0.08, -0.2 * len);
      add(new THREE.CylinderGeometry(0.16 * k, 0.2 * k, 0.6 * k, 8), sgn * wid * 0.28, 0, -0.44 * len, Math.PI / 2);
    }
    add(new THREE.BoxGeometry(wid * 0.34, 0.2, len * 0.22), 0, wid * 0.32, -0.08 * len);
    const lineMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide });
    for (const geo of parts) {
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), lineMat));
      g.add(new THREE.Mesh(geo, fillMat));
    }
    // Bauteile: Laser vorn an den Flügeln, Generatoren am Rumpf
    const lGeo = new THREE.BoxGeometry(0.05, 0.05, 0.42), gGeo = new THREE.BoxGeometry(0.16, 0.12, 0.16);
    const lMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), gMat = new THREE.MeshBasicMaterial({ color });
    lMat.color.setScalar(1.6);
    for (let i = 0; i < nL; i++) {
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const x = side * (wid * 0.42 + (row + 0.5) * (wing / Math.max(1, Math.ceil(nL / 2)))) * 0.95;
      const b = new THREE.Mesh(lGeo, lMat); b.position.set(x, -0.08, -0.12 * len + 0.32 * len * 0.5 - Math.abs(x) * 0.22 + 0.1); g.add(b);
      if (nL % 2 && i === nL - 1) b.position.set(0, -0.2, len * 0.2);
    }
    for (let i = 0; i < nG; i++) {
      const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
      const b = new THREE.Mesh(gGeo, gMat); b.position.set(side * wid * 0.22, wid * 0.36 + 0.08, -0.2 * len + row * (len * 0.5 / Math.max(1, Math.ceil(nG / 2))) - 0.1); g.add(b);
    }
    // Maßlinie unter dem Schiff
    const ml = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-wid * 0.3 - wing, -0.9, len * 0.55), new THREE.Vector3(wid * 0.3 + wing, -0.9, len * 0.55)]);
    g.add(new THREE.Line(ml, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 })));
    g.scale.setScalar(5.2 / Math.max(len, 2 * wing + wid));
    g.position.y = 0.2;
    return g;
  }

  let yaw = -0.75, pitch = 0.15, vy = 0, drag = null, idle = 0;
  let ship = 's1', fx = 'saturn', tier = 0, viz = [2, 2], hasModel = true, slotKind = 'l';
  const slotsOn = () => slotKind !== 'off';
  let bp = null;
  function show() {
    turn.clear();
    if (bp) { bp.traverse((o) => { o.geometry?.dispose(); }); bp = null; }
    const useReal = hasModel && fx === 'saturn' && real;
    wantReal = hasModel && fx === 'saturn';
    if (useReal) turn.add(real);
    else { bp = blueprint(tier, viz[0], viz[1], FX[fx]); turn.add(bp); }
    pitch = useReal ? 0.15 : 0.45;
    accent.color.setHex(FX[fx]); floorMat.uniforms.uC.value.setHex(FX[fx]);
    root.style.setProperty('--fx', '#' + FX[fx].toString(16).padStart(6, '0'));
    opts.onShow?.({ real: wantReal });
    pins.innerHTML = '';
    if (useReal) {
      for (const h of realHP) {
        h.el = null;
        if (h.k !== slotKind) continue; // nur der gewählte Bauteiltyp, damit sich nichts überlagert
        const el = document.createElement('span'); el.className = 'pin is-' + h.k;
        el.innerHTML = `<i></i><b>${h.k === 'l' ? pins.dataset.l : pins.dataset.g}</b>`;
        pins.appendChild(el); h.el = el;
      }
    }
    pins.hidden = !slotsOn();
    if (bp) bp.traverse((o) => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.material.opacity === 1) o.visible = slotsOn(); });
    dirty = true;
  }

  let raf = 0, running = false, last = 0, t = 0, dirty = true;
  // ---------- Bedienung ----------
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }; idle = 0; });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (!drag.moved && e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
    drag.moved = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    vy = dx * 0.006; yaw += dx * 0.008; pitch = Math.max(-0.1, Math.min(0.75, pitch + dy * 0.004));
    drag.x = e.clientX; drag.y = e.clientY; dirty = true;
  });
  const end = () => { drag = null; };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  canvas.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { yaw -= 0.2; dirty = true; } if (e.key === 'ArrowRight') { yaw += 0.2; dirty = true; } });

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = camera.aspect < 1.1 ? 40 : 30; camera.updateProjectionMatrix(); dirty = true;
  }
  const ro = new ResizeObserver(size); ro.observe(canvas); size();

  const v = new THREE.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
    if (!drag) { idle += dt; if (!opts.reduce && idle > 1.2) yaw += dt * 0.18 + vy; vy *= 0.92; }
    if (!opts.reduce || dirty || drag) {
      const dist = camera.aspect < 1.1 ? 11.5 : 11;
      camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, 0.8 + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(0, 0.1, 0);
      turn.position.y = opts.reduce ? 0 : Math.sin(t * 0.8) * 0.04;
      renderer.render(scene, camera);
      dirty = false;
      if (slotsOn() && real && turn.children[0] === real) {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        const placed = [];
        const shown = realHP.filter((hp) => hp.el).map((hp) => {
          hp.o.getWorldPosition(v); v.project(camera);
          return { hp, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, back: v.z > 0.985 };
        }).sort((a, b) => a.y - b.y);
        for (const p of shown) {
          p.hp.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
          p.hp.el.classList.toggle('is-back', p.back);
          // Beschriftung nur, wenn sie keine andere überdeckt (Marke bleibt immer sichtbar)
          const lw = 86, lh = 20;
          const free = !p.back && p.x + lw < w - 4 && !placed.some((q) => Math.abs(q.x - p.x) < lw && Math.abs(q.y - p.y) < lh);
          p.hp.el.classList.toggle('no-label', !free);
          if (free) placed.push(p);
        }
      }
    }
  }
  opts.onInit?.();
  return {
    start() { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    set({ ship: s, fx: f, tier: ti, viz: vz, model }) {
      if (s) ship = s; if (f) fx = f; if (ti != null) tier = ti; if (vz) viz = vz; if (model != null) hasModel = model;
      show();
    },
    slots(kind) { slotKind = kind === true ? 'l' : kind === false ? 'off' : kind; show(); },
  };
}
