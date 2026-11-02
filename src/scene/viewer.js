// 3D-Betrachter für Schiffe und Gegner (Schiffs-Galerie, Welt-Seite, Standbilder).
// Lädt GLB-Modelle aus /models/ (Meshopt + WebP), richtet die Kamera an der Modellgröße aus,
// drehbar per Ziehen, Zoom per Mausrad/Zwei-Finger/Tasten (+/-), Pfeiltasten drehen. Rechnet nur, solange sichtbar.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const cache = new Map(); // url → Promise<gltf.scene>
let loader = null;
function load(url) {
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej)));
  return cache.get(url);
}

export function createViewer(canvas, opts = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !!opts.transparent, preserveDrawingBuffer: !!opts.snapshot, powerPreference: 'high-performance' });
  } catch (e) { return null; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure || 1.15;
  if (opts.transparent) renderer.setClearColor(0x000000, 0); else renderer.setClearColor(0x05070b, 1);
  renderer.setPixelRatio(opts.pixelRatio || Math.min(devicePixelRatio || 1, opts.mobile ? 1.5 : 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 16 / 10, 0.05, 500);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture; scene.environmentIntensity = 0.45;
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xfff2e0, 2.6); key.position.set(-4, 6, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8c4ff, 2.0); rim.position.set(5, 2, -6); scene.add(rim);
  const accent = new THREE.PointLight(opts.color || 0xd8b25a, 6, 0, 1.4); accent.position.set(0, -2, 2); scene.add(accent);
  scene.add(new THREE.HemisphereLight(0x8090a8, 0x050608, 0.35));

  const turn = new THREE.Group(); scene.add(turn);
  let current = null, radius = 1, token = 0;
  let yaw = opts.yaw ?? -0.75, pitch = opts.pitch ?? 0.28, zoom = 1, vy = 0, idle = 0;
  let raf = 0, running = false, last = 0, dirty = true, lost = false;
  const pointers = new Map(); let pinch = 0;

  async function show(url, o = {}) {
    const my = ++token;
    if (o.color != null) accent.color.setHex(o.color);
    const src = await load(url);
    if (my !== token) return false;
    turn.clear();
    const m = src.clone(true);
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    m.position.sub(c);
    m.traverse((x) => { if (x.isMesh && x.material) x.material.envMapIntensity = 1.1; });
    turn.add(m); current = m;
    radius = Math.max(s.x, s.y, s.z) * 0.5 || 1;
    if (o.yaw != null) yaw = o.yaw; if (o.pitch != null) pitch = o.pitch;
    zoom = o.zoom || 1;
    key.position.set(-radius * 4, radius * 6, radius * 5); rim.position.set(radius * 5, radius * 2, -radius * 6);
    accent.position.set(0, -radius * 1.4, radius * 1.2); accent.distance = 0;
    dirty = true;
    if (!running) frame(performance.now(), true);
    return true;
  }

  // ---------- Bedienung ----------
  canvas.style.touchAction = 'pan-y';
  const clampZoom = (z) => Math.max(0.55, Math.min(2.2, z));
  canvas.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false }); idle = 0; });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (pointers.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) { zoom = clampZoom(zoom * (pinch / d)); dirty = true; } pinch = d; return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (!p.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    if (!p.moved && e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx)) { pointers.delete(e.pointerId); return; }
    p.moved = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    vy = dx * 0.005; yaw += dx * 0.008; pitch = Math.max(-0.6, Math.min(1.1, pitch + dy * 0.005));
    p.x = e.clientX; p.y = e.clientY; dirty = true; idle = 0;
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { if (!opts.wheel) return; e.preventDefault(); zoom = clampZoom(zoom * Math.exp(e.deltaY * 0.001)); dirty = true; idle = 0; }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') yaw -= 0.25; else if (k === 'ArrowRight') yaw += 0.25;
    else if (k === 'ArrowUp') pitch = Math.min(1.1, pitch + 0.15); else if (k === 'ArrowDown') pitch = Math.max(-0.6, pitch - 0.15);
    else if (k === '+' || k === '=') zoom = clampZoom(zoom * 0.85); else if (k === '-') zoom = clampZoom(zoom / 0.85);
    else return;
    e.preventDefault(); dirty = true; idle = 0;
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(raf); opts.onLost?.(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; dirty = true; if (running) raf = requestAnimationFrame(frame); });

  function size() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
    if (!running) frame(performance.now(), true);
  }
  const ro = new ResizeObserver(size); ro.observe(canvas); size();

  function frame(now, once) {
    if (!once) raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (!once && pointers.size === 0) { idle += dt; if (!opts.reduce && idle > 1.5) { yaw += dt * 0.22 + vy; dirty = true; } vy *= 0.9; }
    if (!dirty || !current) return;
    // Abstand so, dass die Kugel um das Modell in das Bild passt (schmale Bilder: horizontales Sichtfeld zählt)
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
    const dist = (radius / Math.sin(Math.min(vf, hf))) * 0.92 * zoom;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.near = dist / 50; camera.far = dist * 6; camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    dirty = false;
  }

  return {
    show,
    start() { if (running) return; running = true; last = 0; if (!lost) raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    render() { dirty = true; frame(performance.now(), true); },
    snapshot(type = 'image/png', q) { dirty = true; frame(performance.now(), true); return canvas.toDataURL(type, q); },
    dispose() { this.stop(); ro.disconnect(); renderer.dispose(); env.dispose(); },
  };
}
