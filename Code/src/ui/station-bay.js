// Hangar-Ansicht der Station: das echte Schiffsmodell (render/models.js) in einer geschlossenen Halle.
// Halle: Rückwand mit Tor, Seitenwände mit Paneelen und Rippen, Deckenträger auf Stützen, Kranbahn mit
// Brückenkran, Landeplattform mit Randmarkierung und Bodenraster, Fraktionslicht, kaltes Oberlicht, Dunst.
// Schiff im Hangar zusätzlich mit Landekufen (Hydraulik), Geschützträgern an den Laserplätzen,
// Positionslichtern und Lichtleisten. Zweite Ansicht: technische Draufsicht aus denselben Kanten.
// Statische Geometrie wird je Material zu einem Netz verschmolzen (wenige Zeichenaufrufe).
// Läuft nur, solange der Hangar sichtbar ist (höchstens 30 Bilder/s), Kamera steht fest.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ModelFactory } from '../render/models.js';

// Echte Schiffsmodelle (GLB). Pflicht = liegt im Projekt; optional = wird nur geladen, wenn die Datei da ist.
const GLB = [
  ['ship:s1:saturn', '/models/saturn-starter.glb', true],
  ['ship:s1:europa', '/models/europa-starter.glb', false],
  ['ship:s1:eris', '/models/eris-starter.glb', false],
];
const BG = 0x06080c;
const HAZE = 0x0a0d13;
const FLOOR = -12;     // Hallenboden
const PAD = -11.2;     // Oberkante Landeplattform
const YC = 36;        // Unterkante Hallendecke (tief genug, dass Träger, Kran und Licht im Bild stehen)

// Montagepunkte wie in render/models.js (SHIP_LAYOUT), Spiel-Achsen: Bug −z
const LAYOUT = {
  s1: { scale: 1.0, lasers: [[-17.2, -3.4, -8.5], [17.2, -3.4, -8.5]], gens: [[-9.5, 3.3, 10], [9.5, 3.3, 10]] },
  s2: { scale: 1.22, lasers: [[-17.2, -3.4, -8.5], [17.2, -3.4, -8.5], [-26, 0.2, -3.5], [26, 0.2, -3.5]], gens: [[-9.5, 3.3, 10], [9.5, 3.3, 10], [0, 6.6, 8.5]] },
};
function slotPos(kind, layout, i, out) {
  const list = kind === 'laser' ? layout.lasers : layout.gens;
  const l = list[i];
  if (l) return out.set(l[0], l[1], l[2]);
  const k = i - list.length, side = k % 2 === 0 ? -1 : 1, row = Math.floor(k / 2);
  if (kind === 'laser') return out.set(side * (19 + row * 3.5), -1.3, -1.5 + row * 2.5);
  return out.set(side * (5 + row * 3), 3.3, 3 - row * 4);
}

function fxHex(faction) {
  return faction === 'europa' ? 0xd8b25a : faction === 'eris' ? 0x9a52ff : 0xe0782a;
}
function css(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- Texturen (einmal je Fraktion) ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// Hallenboden: Stahlplatten 8 m, Fugen, Nieten, feines Raster 2 m (Kachel = 32 m)
function floorTex() {
  return canvasTex(512, 512, (g) => {
    const r = rand(11);
    g.fillStyle = '#0a0c10'; g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const v = 13 + Math.floor(r() * 6);
      g.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
      g.fillStyle = 'rgba(255,255,255,.035)';
      g.fillRect(x * 128 + 2, y * 128 + 2, 124, 1);
      g.fillStyle = 'rgba(160,170,190,.18)';
      for (const [px, py] of [[8, 8], [120, 8], [8, 120], [120, 120]]) g.fillRect(x * 128 + px, y * 128 + py, 2, 2);
    }
    g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
    for (let i = 32; i < 512; i += 32) { if (i % 128 === 0) continue; g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, 512); g.moveTo(0, i + 0.5); g.lineTo(512, i + 0.5); g.stroke(); }
    // Abrieb in Fahrspuren
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; g.fillRect(r() * 512, r() * 512, 2 + r() * 30, 1 + r() * 2); }
  }, true);
}
// Landeplattform 74 × 56 m: Plattenraster, Randmarkierung in Fraktionsfarbe, Zielkreuz, Platznummer
function padTex(fx, berth) {
  const W = 1184, H = 896, m = 16; // 16 px je Meter
  return canvasTex(W, H, (g) => {
    const col = css(fx);
    g.fillStyle = '#0d1015'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
    for (let x = 0; x <= W; x += m * 2) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
    for (let y = 0; y <= H; y += m * 2) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.75)'; g.lineWidth = 3;
    for (let x = 0; x <= W; x += m * 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += m * 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // Randband: Schrägstreifen
    const b = m * 2.4, inset = m * 0.8;
    g.save();
    g.beginPath();
    g.rect(inset, inset, W - inset * 2, H - inset * 2);
    g.rect(inset + b, inset + b, W - (inset + b) * 2, H - (inset + b) * 2);
    g.clip('evenodd');
    g.fillStyle = '#16130f'; g.fillRect(0, 0, W, H);
    g.fillStyle = col; g.globalAlpha = 0.78;
    for (let x = -H; x < W + H; x += m * 2.2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + m * 1.1, 0); g.lineTo(x + m * 1.1 + H, H); g.lineTo(x + H, H); g.fill(); }
    g.restore();
    g.globalAlpha = 1;
    g.strokeStyle = col; g.lineWidth = 2;
    g.strokeRect(inset + b + m * 0.6, inset + b + m * 0.6, W - (inset + b + m * 0.6) * 2, H - (inset + b + m * 0.6) * 2);
    // Eckwinkel
    g.lineWidth = 6;
    const a = inset + b + m * 2, L = m * 5;
    for (const [x, y, dx, dy] of [[a, a, 1, 1], [W - a, a, -1, 1], [a, H - a, 1, -1], [W - a, H - a, -1, -1]]) {
      g.beginPath(); g.moveTo(x + dx * L, y); g.lineTo(x, y); g.lineTo(x, y + dy * L); g.stroke();
    }
    // Mittellinie und Zielkreuz
    g.globalAlpha = 0.5; g.lineWidth = 3; g.setLineDash([m * 2, m]);
    g.beginPath(); g.moveTo(a, H / 2); g.lineTo(W - a, H / 2); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = 0.35; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(W / 2, H / 2, m * 9, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, m * 9.6, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(W / 2 - m * 12, H / 2); g.lineTo(W / 2 + m * 12, H / 2); g.moveTo(W / 2, H / 2 - m * 12); g.lineTo(W / 2, H / 2 + m * 12); g.stroke();
    g.globalAlpha = 1;
    // Platznummer in Schablonenschrift
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.font = `700 ${m * 6}px "DIN Condensed", "Arial Narrow", sans-serif`;
    g.textBaseline = 'alphabetic';
    g.fillText(berth, a + m * 1.5, H - a - m * 1.2);
    g.font = `600 ${m * 1.4}px Menlo, monospace`;
    g.fillText('LANDEFELD · MAX 60 T', a + m * 1.5, a + m * 2.6);
  });
}
// Wandpaneele (Kachel = 16 m): Platten, Fugen, Lüftungsgitter, Nieten
function wallTex() {
  return canvasTex(512, 512, (g) => {
    const r = rand(5);
    g.fillStyle = '#07090c'; g.fillRect(0, 0, 512, 512);
    const rows = [0, 160, 288, 512];
    for (let i = 0; i < 3; i++) {
      const y0 = rows[i], y1 = rows[i + 1];
      for (let x = 0; x < 512; x += 128) {
        const v = 15 + Math.floor(r() * 7);
        g.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
        g.fillRect(x + 3, y0 + 3, 122, y1 - y0 - 6);
        g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 3, y0 + 3, 122, 1);
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 3, y1 - 5, 122, 2);
        g.fillStyle = 'rgba(170,180,200,.16)';
        for (const yy of [y0 + 9, y1 - 11]) for (const xx of [x + 9, x + 117]) g.fillRect(xx, yy, 2, 2);
      }
    }
    // Lüftung und Wartungsklappen
    for (const [x, y, w, h] of [[24, 196, 80, 60], [280, 196, 80, 60], [152, 40, 96, 30], [408, 360, 72, 110]]) {
      g.fillStyle = '#0b0d11'; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let yy = y + 4; yy < y + h - 2; yy += 6) g.fillRect(x + 4, yy, w - 8, 2);
    }
    g.fillStyle = 'rgba(255,255,255,.08)';
    g.font = '600 13px Menlo, monospace';
    g.fillText('P-14', 152, 150); g.fillText('DRUCK 2,1', 280, 278);
  }, true);
}
// Großes Hangartor in der Rückwand
function doorTex(fx) {
  return canvasTex(1024, 640, (g, W, H) => {
    const col = css(fx);
    g.fillStyle = '#0c0f13'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 64) {
      g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, y + 2, W, 2);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, y + 60, W, 4);
    }
    for (let x = 0; x < W; x += 128) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, 0, 3, H); }
    // Mittelfuge mit Warnstreifen
    g.save(); g.beginPath(); g.rect(W / 2 - 22, 0, 44, H); g.clip();
    g.fillStyle = '#15120e'; g.fillRect(0, 0, W, H);
    g.fillStyle = col; g.globalAlpha = 0.7;
    for (let y = -60; y < H; y += 36) { g.beginPath(); g.moveTo(W / 2 - 22, y); g.lineTo(W / 2 + 22, y + 44); g.lineTo(W / 2 + 22, y + 62); g.lineTo(W / 2 - 22, y + 18); g.fill(); }
    g.restore(); g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,.8)'; g.fillRect(W / 2 - 1, 0, 2, H);
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.font = '700 120px "DIN Condensed", "Arial Narrow", sans-serif';
    g.fillText('A', 120, 420); g.fillText('B', W - 190, 420);
    g.font = '600 20px Menlo, monospace';
    g.fillText('SCHLEUSE · DRUCKTOR', 120, 470);
  });
}
// senkrechter Lichtkegel für Dunst unter den Deckenleuchten
function shaftTex() {
  return canvasTex(64, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const gx = g.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.3, 'rgba(0,0,0,0)'); gx.addColorStop(0.7, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, W, H);
  });
}

// Kontaktschatten unter dem Rumpf und Bodenvignette: weiche Alphaverläufe, einmal angelegt
function radialTex(stops) {
  return canvasTex(256, 256, (g, W, H) => {
    const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    for (const [k, a] of stops) gr.addColorStop(k, `rgba(0,0,0,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
}

// ---------- Baukasten: sammelt Teile je Material, verschmilzt sie am Ende ----------
const UP = new THREE.Vector3(0, 1, 0);
class Batch {
  constructor() {
    this.parts = new Map();
    this.o = new THREE.Object3D();
    this.unit = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    this.v = new THREE.Vector3();
  }
  _push(mat, g) {
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.clearGroups();
    let a = this.parts.get(mat);
    if (!a) { a = []; this.parts.set(mat, a); }
    a.push(g);
  }
  geo(mat, geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const o = this.o;
    o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.updateMatrix();
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(o.matrix);
    this._push(mat, g);
  }
  // Kasten; r > 0 = gefaste Kanten
  box(mat, x, y, z, w, h, d, r = 0, ry = 0) {
    if (r > 0) {
      const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
      this.geo(mat, g, x, y, z, 0, ry, 0);
      g.dispose();
    } else this.geo(mat, this.unit, x, y, z, 0, ry, 0, w, h, d);
  }
  // Zylinder zwischen zwei Punkten
  cyl(mat, a, b, r, seg = 12, r2 = r) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return;
    const g = new THREE.CylinderGeometry(r2, r, len, seg, 1);
    const o = this.o;
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(UP, this.v.copy(b).sub(a).normalize());
    o.scale.set(1, 1, 1); o.updateMatrix();
    const n = g.toNonIndexed(); g.dispose();
    n.applyMatrix4(o.matrix);
    o.rotation.set(0, 0, 0);
    this._push(mat, n);
  }
  // Fläche (w × h) mit Kachelgröße tw × th für wiederholte Texturen
  plane(mat, x, y, z, w, h, ry, tw = 0, th = 0, rx = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (tw) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tw, uv.getY(i) * h / th); }
    this.geo(mat, g, x, y, z, rx, ry, 0);
    g.dispose();
  }
  build(group) {
    for (const [mat, list] of this.parts) {
      const g = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false;
      m.userData.own = true;
      group.add(m);
    }
    this.parts.clear();
    this.unit.dispose();
  }
}

export class HangarBay {
  constructor() {
    this.ok = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sx-bay3d';
    try {
      this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      this.gl = null;
      return;
    }
    const gl = this.gl;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.72;
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.ok = true;

    this.factory = new ModelFactory();
    // Laden läuft im Hintergrund; solange ein Modell unterwegs ist, zeigt die Station einen Plan-Umriss
    this.pending = new Set();
    const done = (k) => { this.pending.delete(k); this._key = ''; this._dirty = true; this.onChange && this.onChange(); };
    for (const [k, u, must] of GLB) {
      if (must) {
        this.pending.add(k);
        this.factory.registerGLB(k, u).then(() => done(k), () => done(k));
      } else {
        fetch(u, { method: 'HEAD' }).then((r) => {
          const t = r.headers.get('content-type') || '';
          if (!r.ok || t.includes('html')) return;
          this.pending.add(k);
          this.onChange && this.onChange();
          this.factory.registerGLB(k, u).then(() => done(k), () => done(k));
        }).catch(() => { /* kein Modell vorhanden */ });
      }
    }

    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(gl);
    this.envRT = pm.fromScene(new RoomEnvironment(), 0.04);
    pm.dispose();
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.3;

    this.persp = new THREE.PerspectiveCamera(31, 1, 1, 900);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);

    // Grundlicht: kaltes Oberlicht, Kante von hinten, wenig Füllung (Fraktionslicht kommt mit der Halle)
    this.lights = new THREE.Group();
    const top = new THREE.DirectionalLight(0xd6e4ff, 1.5); top.position.set(-12, 90, 30);
    const rim = new THREE.DirectionalLight(0x9db8ff, 1.9); rim.position.set(40, 22, 90);
    const fill = new THREE.DirectionalLight(0xbfcde6, 0.45); fill.position.set(-90, -4, -60);
    const hemi = new THREE.HemisphereLight(0x2c3646, 0x050608, 0.5);
    this.lights.add(top, rim, fill, hemi);
    this.scene.add(this.lights);

    this.env = new THREE.Group();
    this.scene.add(this.env);
    this.shipRoot = new THREE.Group();
    this.shipRoot.rotation.y = Math.PI / 2; // Bug nach links
    this.scene.add(this.shipRoot);
    this.gear = new THREE.Group();   // Landekufen (nur in der Halle)
    this.fit = new THREE.Group();    // Geschützträger, Lichtleisten, Positionslichter
    this.scene.add(this.gear, this.fit);
    // Kontaktschatten (folgt dem Schiff) und dunkler Bodenrand um die Plattform
    this._shadowTex = radialTex([[0, 0.92], [0.45, 0.7], [0.75, 0.25], [1, 0]]);
    this._vigTex = radialTex([[0, 0], [0.42, 0], [0.7, 0.55], [1, 0.92]]);
    const unit = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ map: this._shadowTex, transparent: true, depthWrite: false, color: 0x000000, fog: false }));
    this.shadow.renderOrder = 1;
    this.vignette = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ map: this._vigTex, transparent: true, depthWrite: false, color: 0x000000, fog: false }));
    this.vignette.position.set(0, PAD + 0.06, 0);
    this.vignette.scale.set(170, 1, 150);
    this.vignette.renderOrder = 1;
    this.scene.add(this.shadow, this.vignette);
    this.plan = new THREE.Group();
    this.plan.rotation.y = Math.PI / 2;
    this.plan.visible = false;
    this.scene.add(this.plan);

    this.hps = { laser: [], gen: [] };
    this.mode = 'werft';
    this.size = { w: 0, h: 0 };
    this.area = { cx: 0.5, cy: 0.5, w: 1, h: 1 };
    this._key = '';
    this._envFaction = '';
    this._edges = new Map();
    this._v = new THREE.Vector3();
    this._box = new THREE.Box3();
    this._sph = new THREE.Sphere();
    this._ray = new THREE.Raycaster();
    this._raf = 0;
    this._last = 0;
    this._t = 0;
    this._dirty = true;
    this._loop = (now) => this._frame(now);
    this.onChange = null;
    this.onProject = null;
    this.dims = { l: 0, b: 0 };
    this.hideShip = false;   // während ein Modell lädt: kein Platzhalter-Rumpf
    this.nav = [];
    this.berth = '03';
  }

  // ---------- Halle ----------
  _mats(fx) {
    const F = this.factory;
    const std = (k, o) => F.mat('bay:' + k, () => new THREE.MeshStandardMaterial(o));
    return {
      steel: std('steel', { color: 0x2b3038, metalness: 0.8, roughness: 0.4 }),
      mid: std('mid', { color: 0x1a1e25, metalness: 0.75, roughness: 0.48 }),
      dark: std('dark', { color: 0x0f1216, metalness: 0.7, roughness: 0.58 }),
      chrome: std('chrome', { color: 0xa9b2bc, metalness: 1, roughness: 0.16 }),
      rubber: std('rubber', { color: 0x0b0c0e, metalness: 0.1, roughness: 0.85 }),
      paint: F.mat('bay:paint:' + fx, () => new THREE.MeshStandardMaterial({ color: fx, metalness: 0.35, roughness: 0.55 })),
      lamp: F.glow(0xdbe6ff, 1.7),
      lampDim: F.glow(0x9fb2d0, 0.7),
      accent: F.glow(fx, 1.9),
      accentDim: F.glow(fx, 0.75),
      red: F.glow(0xff3a26, 1.6),
    };
  }

  _buildEnv(faction) {
    if (this._envFaction === faction) return;
    this._envFaction = faction;
    this._dispose(this.env);
    const fx = fxHex(faction);
    const M = this._mats(fx);
    const B = new Batch();
    for (const t of this._tex || []) t.dispose();
    for (const m of this._texMats || []) m.dispose();
    const tFloor = floorTex(), tPad = padTex(fx, this.berth), tWall = wallTex(), tDoor = doorTex(fx), tShaft = shaftTex();
    this._tex = [tFloor, tPad, tWall, tDoor, tShaft];
    const floorMat = new THREE.MeshStandardMaterial({ map: tFloor, metalness: 0.5, roughness: 0.62, color: 0x5a616c, envMapIntensity: 0.1 });
    const padMat = new THREE.MeshStandardMaterial({ map: tPad, metalness: 0.35, roughness: 0.78, color: 0x969aa2, envMapIntensity: 0.08 });
    const wallMat = new THREE.MeshStandardMaterial({ map: tWall, metalness: 0.65, roughness: 0.5, color: 0xc4ccd8, envMapIntensity: 0.6 });
    const doorMat = new THREE.MeshStandardMaterial({ map: tDoor, metalness: 0.7, roughness: 0.45 });
    const shaftMat = new THREE.MeshBasicMaterial({ map: tShaft, color: 0x8ea6cc, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this._texMats = [floorMat, padMat, wallMat, doorMat, shaftMat];

    const XW = 128, ZB = 78, ZF = -110, H = YC - FLOOR;
    // Boden und Landeplattform
    B.plane(floorMat, 0, FLOOR, -16, 2 * XW, ZB - ZF, 0, 32, 32, -Math.PI / 2);
    B.box(M.mid, 0, (FLOOR + PAD) / 2 - 0.02, 0, 74.6, PAD - FLOOR, 56.6, 0.35);
    B.plane(padMat, 0, PAD + 0.02, 0, 74, 56, 0, 0, 0, -Math.PI / 2);
    // Randleuchten der Plattform (gestrichelt)
    for (let x = -34; x <= 34; x += 4) { B.box(M.accent, x, PAD - 0.35, 28.35, 2.2, 0.18, 0.12); B.box(M.accent, x, PAD - 0.35, -28.35, 2.2, 0.18, 0.12); }
    for (let z = -24; z <= 24; z += 4) { B.box(M.accent, 37.35, PAD - 0.35, z, 0.12, 0.18, 2.2); B.box(M.accent, -37.35, PAD - 0.35, z, 0.12, 0.18, 2.2); }
    // Bodenführung: Leitlinien zum Tor
    for (let z = 32; z < ZB - 4; z += 6) { B.box(M.accentDim, -4, FLOOR + 0.03, z, 0.4, 0.06, 3); B.box(M.accentDim, 4, FLOOR + 0.03, z, 0.4, 0.06, 3); }

    // Rückwand mit Drucktor
    const DW = 58, DH = 34;
    B.plane(wallMat, -(XW + DW / 2) / 2 - 0.0, FLOOR + H / 2, ZB, XW - DW / 2, H, Math.PI, 16, 16);
    B.plane(wallMat, (XW + DW / 2) / 2, FLOOR + H / 2, ZB, XW - DW / 2, H, Math.PI, 16, 16);
    B.plane(wallMat, 0, FLOOR + DH + (H - DH) / 2, ZB, DW, H - DH, Math.PI, 16, 16);
    B.plane(doorMat, 0, FLOOR + DH / 2, ZB + 1.6, DW, DH, Math.PI);
    // Torrahmen: Laibung, Sturz, Warnleuchten
    B.box(M.steel, -DW / 2 - 1.6, FLOOR + DH / 2 + 1, ZB - 0.6, 3.2, DH + 2, 4.4, 0.4);
    B.box(M.steel, DW / 2 + 1.6, FLOOR + DH / 2 + 1, ZB - 0.6, 3.2, DH + 2, 4.4, 0.4);
    B.box(M.steel, 0, FLOOR + DH + 1.6, ZB - 0.6, DW + 6.4, 3.2, 4.4, 0.4);
    B.box(M.accent, 0, FLOOR + DH + 0.05, ZB - 2.85, DW - 2, 0.25, 0.12);
    for (const sx of [-1, 1]) for (let y = FLOOR + 3; y < FLOOR + DH - 1; y += 3.2) B.box(M.accent, sx * (DW / 2 + 1.6), y, ZB - 2.85, 0.5, 1.4, 0.1);
    B.box(M.red, -DW / 2 - 1.6, FLOOR + DH + 3.6, ZB - 2.2, 1.2, 0.8, 0.8, 0.1);
    B.box(M.red, DW / 2 + 1.6, FLOOR + DH + 3.6, ZB - 2.2, 1.2, 0.8, 0.8, 0.1);

    // Stützen (Rippen) an Rück- und Seitenwänden, Sockel, Kopfstreben
    const ribX = [-112, -88, -64, -40, 40, 64, 88, 112];
    for (const x of ribX) {
      B.box(M.steel, x, FLOOR + H / 2, ZB - 1.6, 3.2, H, 3.2, 0.35);
      B.box(M.mid, x, FLOOR + 1.6, ZB - 2.2, 5.2, 3.2, 4.6, 0.4);
      B.box(M.dark, x, FLOOR + H / 2, ZB - 3.25, 1.2, H - 6, 0.2);
      B.box(M.lampDim, x, FLOOR + 24, ZB - 3.3, 0.5, 16, 0.12);
    }
    const ribZ = [-90, -66, -42, -18, 6, 30, 54];
    for (const sx of [-1, 1]) {
      const wx = sx * XW;
      B.plane(wallMat, wx, FLOOR + H / 2, (ZB + ZF) / 2, ZB - ZF, H, -sx * Math.PI / 2, 16, 16);
      for (const z of ribZ) {
        B.box(M.steel, wx - sx * 1.6, FLOOR + H / 2, z, 3.2, H, 3.2, 0.35);
        B.box(M.mid, wx - sx * 2.2, FLOOR + 1.6, z, 4.6, 3.2, 5.2, 0.4);
        B.box(M.lampDim, wx - sx * 3.3, FLOOR + 24, z, 0.12, 16, 0.5);
      }
      // Lichtband und Fraktionsstreifen über dem Boden
      B.box(M.lamp, wx - sx * 0.6, FLOOR + 30, (ZB + ZF) / 2, 0.3, 0.35, ZB - ZF - 4);
      B.box(M.accent, wx - sx * 0.6, FLOOR + 1.2, (ZB + ZF) / 2, 0.2, 0.22, ZB - ZF - 4);
      // Laufsteg mit Geländer
      B.box(M.mid, wx - sx * 3.6, FLOOR + 14, (ZB + ZF) / 2, 4.4, 0.5, ZB - ZF - 4, 0.15);
      B.box(M.steel, wx - sx * 5.7, FLOOR + 15.6, (ZB + ZF) / 2, 0.18, 0.18, ZB - ZF - 4);
      B.box(M.steel, wx - sx * 5.7, FLOOR + 14.9, (ZB + ZF) / 2, 0.12, 0.12, ZB - ZF - 4);
      for (let z = ZF + 4; z < ZB - 2; z += 3) B.box(M.steel, wx - sx * 5.7, FLOOR + 14.8, z, 0.14, 1.6, 0.14);
      B.box(M.lamp, wx - sx * 3.6, FLOOR + 13.7, (ZB + ZF) / 2, 3, 0.08, ZB - ZF - 6);
    }
    // Laufsteg an der Rückwand (links und rechts vom Tor)
    for (const sx of [-1, 1]) {
      const cx = sx * (DW / 2 + 3.2 + (XW - DW / 2 - 3.2) / 2), len = XW - DW / 2 - 6;
      B.box(M.mid, cx, FLOOR + 14, ZB - 3.6, len, 0.5, 4.4, 0.15);
      B.box(M.steel, cx, FLOOR + 15.6, ZB - 5.7, len, 0.18, 0.18);
      B.box(M.steel, cx, FLOOR + 14.9, ZB - 5.7, len, 0.12, 0.12);
      for (let x = cx - len / 2 + 1; x < cx + len / 2; x += 3) B.box(M.steel, x, FLOOR + 14.8, ZB - 5.7, 0.14, 1.6, 0.14);
      B.box(M.lamp, cx, FLOOR + 13.7, ZB - 3.6, len - 2, 0.08, 3);
    }

    // Decke: Träger quer über die Halle, auf den Seitenstützen verankert, Kopfstreben
    B.box(M.dark, 0, YC + 0.6, (ZB + ZF) / 2, 2 * XW, 1, ZB - ZF);
    for (const z of ribZ) {
      B.box(M.steel, 0, YC - 0.4, z, 2 * XW, 0.5, 2.6);
      B.box(M.steel, 0, YC - 2.2, z, 2 * XW - 2, 3.2, 0.5);
      B.box(M.steel, 0, YC - 4.0, z, 2 * XW - 2, 0.5, 2.6);
      for (const sx of [-1, 1]) {
        const a = new THREE.Vector3(sx * (XW - 1.6), YC - 12, z), b = new THREE.Vector3(sx * (XW - 9), YC - 4, z);
        B.cyl(M.steel, a, b, 0.45, 6);
        B.box(M.mid, sx * (XW - 2.4), YC - 3.6, z, 4.8, 1.6, 3.4, 0.2);
      }
    }
    for (const x of ribX) { // Längsträger von der Rückwand
      B.box(M.mid, x, YC - 5.6, (ZB + ZF) / 2, 1.6, 1.6, ZB - ZF - 2);
    }
    // Deckenleuchten zwischen den Trägern + Dunstkegel
    for (const z of [-30, -6, 18, 42, 66]) for (const x of [-52, -16, 20, 56]) B.box(M.lamp, x, YC - 0.2, z, 16, 0.2, 3);
    // Lichtleisten unter den Querträgern, Fraktionsband an jedem zweiten Träger
    ribZ.forEach((z, i) => {
      B.box(M.lampDim, 0, YC - 4.3, z, 2 * XW - 12, 0.1, 0.5);
      if (i % 2) B.box(M.accentDim, 0, YC - 2.2, z - 0.3, 2 * XW - 12, 0.25, 0.08);
    });
    // Leuchtfelder in der Decke (Oberlichter) mit Rahmen
    for (const [x, z] of [[-40, 30], [0, 30], [40, 30], [-40, 54], [0, 54], [40, 54], [-20, 6], [24, 6]]) {
      B.box(M.dark, x, YC - 0.5, z, 14, 0.6, 9);
      B.box(M.lamp, x, YC - 0.85, z, 12, 0.08, 7);
    }
    for (const [x, z, w] of [[-34, 18, 14], [20, 42, 14], [56, -6, 12], [-4, 30, 18], [-40, 54, 12], [40, 30, 12]]) {
      const g = new THREE.PlaneGeometry(w, 52);
      const s = new THREE.Mesh(g, shaftMat);
      s.position.set(x, YC - 27, z);
      s.rotation.y = Math.atan2(-0.55, -0.83);
      s.userData.own = true;
      s.renderOrder = 2;
      this.env.add(s);
    }

    // Kranbahn: zwei Schienen an den Deckenträgern abgehängt, Brückenkran fährt in x
    const zr = [-6, 66];
    for (const z of zr) {
      B.box(M.steel, 0, YC - 10, z, 2 * XW - 8, 1.8, 1.6, 0.2);
      B.box(M.dark, 0, YC - 9, z, 2 * XW - 8, 0.3, 0.8);
      for (const x of ribX) B.box(M.steel, x, YC - 7.4, z, 0.6, 4.4, 0.6);
    }
    this.crane = new THREE.Group();
    const C = new Batch();
    const span = zr[1] - zr[0], zc = (zr[0] + zr[1]) / 2;
    C.box(M.steel, -1.6, YC - 12.2, zc, 1.4, 2.6, span, 0.2);
    C.box(M.steel, 1.6, YC - 12.2, zc, 1.4, 2.6, span, 0.2);
    for (const z of zr) C.box(M.mid, 0, YC - 11, z, 6, 2.2, 3.4, 0.3);
    C.box(M.paint, 0, YC - 13.7, zc - 8, 5.2, 2.4, 6, 0.3);
    C.box(M.dark, 0, YC - 15.4, zc - 8, 3, 1.2, 3.6, 0.2);
    C.cyl(M.chrome, new THREE.Vector3(-0.6, YC - 15.8, zc - 8), new THREE.Vector3(-0.6, YC - 19, zc - 8), 0.08, 5);
    C.cyl(M.chrome, new THREE.Vector3(0.6, YC - 15.8, zc - 8), new THREE.Vector3(0.6, YC - 19, zc - 8), 0.08, 5);
    C.box(M.paint, 0, YC - 19.6, zc - 8, 2.4, 1.2, 1.6, 0.2);
    C.box(M.lamp, 0, YC - 13.6, zc, 0.6, 0.2, span - 8);
    C.box(M.red, 0, YC - 12.4, zc - 8 + 3.2, 0.5, 0.4, 0.1);
    C.build(this.crane);
    this.craneLight = new THREE.PointLight(0xd8e6ff, 380, 60, 2);
    this.craneLight.position.set(0, YC - 15, zc - 6);
    this.crane.add(this.craneLight);
    this.env.add(this.crane);

    // Requisiten: Frachtcontainer, Werkzeugwagen, Leitungen
    const cont = (x, z, ry, h = 0) => {
      B.box(M.mid, x, FLOOR + 2.6 + h, z, 12, 5.2, 5, 0.25, ry);
      B.box(M.paint, x, FLOOR + 4.9 + h, z, 12.1, 0.5, 5.1, 0, ry);
      B.box(M.dark, x, FLOOR + 2.6 + h, z, 12.15, 4, 0.12, 0, ry);
    };
    cont(96, 52, 0); cont(96, 52, 0, 5.4); cont(94, 40, 0.05); cont(-98, 50, Math.PI / 2); cont(108, -40, Math.PI / 2);
    B.box(M.steel, 54, FLOOR + 1.2, 40, 5, 2.4, 3, 0.3);
    B.box(M.paint, 54, FLOOR + 2.55, 40, 5, 0.3, 3);
    B.box(M.dark, 52.2, FLOOR + 3.4, 40, 0.3, 2, 2.6);
    for (const z of [34, 35.2]) B.box(M.dark, 0, FLOOR + 0.25, z, 2 * XW - 8, 0.5, 0.6);
    // Tankleitung von der Seitenwand zur Plattform
    B.cyl(M.mid, new THREE.Vector3(XW - 4, FLOOR + 0.6, 18), new THREE.Vector3(38, FLOOR + 0.6, 18), 0.6, 10);
    B.cyl(M.paint, new THREE.Vector3(39, FLOOR + 0.6, 18), new THREE.Vector3(42, FLOOR + 0.6, 18), 0.75, 10);

    B.build(this.env);

    // Fraktionslicht an der Rückwand, Unterlicht der Plattform
    const fxA = new THREE.PointLight(fx, 1700, 150, 2); fxA.position.set(-70, FLOOR + 9, ZB - 10);
    const fxB = new THREE.PointLight(fx, 1700, 150, 2); fxB.position.set(78, FLOOR + 9, ZB - 10);
    const fxC = new THREE.PointLight(fx, 520, 70, 2); fxC.position.set(110, FLOOR + 10, -20);
    this.under = new THREE.PointLight(fx, 55, 26, 2); this.under.position.set(0, PAD + 1.5, 0);
    // Oberlicht als weicher Kegel aufs Schiff (nicht auf den Boden davor), Kante in Fraktionsfarbe von hinten
    const spot = new THREE.SpotLight(0xe4ecff, 150, 90, 0.3, 1, 2); spot.position.set(-4, YC - 2, 10); spot.target.position.set(0, -2, 4);
    const fxRim = new THREE.DirectionalLight(fx, 0.9); fxRim.position.set(30, 18, 120);
    this.env.add(fxA, fxB, fxC, this.under, spot, spot.target, fxRim);
    this.fog = new THREE.Fog(HAZE, 120, 360);
  }

  _dispose(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      if (c.userData.own && c.geometry) c.geometry.dispose();
      c.traverse && c.traverse((o) => { if (o !== c && o.userData.own && o.geometry) o.geometry.dispose(); });
      g.remove(c);
    }
  }
  _clear(g) {
    for (let i = g.children.length - 1; i >= 0; i--) g.remove(g.children[i]);
  }

  // ---------- Schiff ----------
  setShip(faction, shipId, loadout, locked) {
    if (!this.ok) return;
    const key = faction + '|' + shipId + '|' + JSON.stringify(loadout || {}) + '|' + (locked ? 1 : 0) + '|' + this.factory.version;
    if (key === this._key) return;
    this._key = key;
    this._buildEnv(faction);
    this._clear(this.shipRoot);
    this._clear(this.plan);
    const s = this.factory.buildShip(faction, shipId, loadout || { lasers: [], gens: [] });
    for (const e of s.engines) { e.trail.visible = false; e.glow.scale.multiplyScalar(0.35); }
    for (const l of s.lasers) l.flash.visible = false;
    this.ship = s;
    this.shipRoot.add(s.root);
    // Montagepunkte als leere Objekte am Schiff
    const layout = LAYOUT[shipId] || LAYOUT.s2;
    const k = s.placeholder ? layout.scale : 1;
    this.hps.laser.length = 0; this.hps.gen.length = 0;
    for (const kind of ['laser', 'gen']) {
      for (let i = 0; i < 8; i++) {
        const o = new THREE.Object3D();
        slotPos(kind, layout, i, o.position).multiplyScalar(k);
        s.root.add(o);
        this.hps[kind].push(o);
      }
    }
    this.shipRoot.position.set(0, 0, 0);
    this.shipRoot.updateMatrixWorld(true);
    this._fitBox(s.root);
    // Schiff so hoch setzen, dass es auf den Kufen über der Plattform steht
    const lift = PAD + 7.2 - this._box.min.y;
    this.shipRoot.position.y = lift;
    this.shipRoot.updateMatrixWorld(true);
    this._box.min.y += lift; this._box.max.y += lift;
    this._box.getBoundingSphere(this._sph);
    // Bildausschnitt: Schiff mit Kufen bis zur Plattform
    const fb = (this._frameBox || (this._frameBox = new THREE.Box3())).copy(this._box);
    fb.min.y = PAD;
    this._fsph = this._fsph || new THREE.Sphere();
    fb.getBoundingSphere(this._fsph);
    const sz = this._box.getSize(this._v);
    this.dims.l = sz.x; this.dims.b = sz.z;
    // Kontaktschatten unter dem Rumpf
    this.shadow.position.set(this._sph.center.x, PAD + 0.08, this._sph.center.z);
    this.shadow.scale.set(sz.x * 1.05, 1, sz.z * 1.0);
    if (s.placeholder) this._detailHull(faction);
    this._buildFit(faction, loadout || { lasers: [], gens: [] });
    this._buildPlan(locked);
    this._dirty = true;
  }

  // Hülle ohne Leuchtsprites und ausgeblendete Strahlen vermessen
  _fitBox(root) {
    const box = this._box.makeEmpty();
    const tmp = this._tmpBox || (this._tmpBox = new THREE.Box3());
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || (o.material && o.material.isShaderMaterial)) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      box.union(tmp);
    });
    if (box.isEmpty()) box.setFromObject(root);
    return box;
  }

  // Treffer auf der Schiffshülle (Laser- und Generatorteile zählen nicht)
  _hit(ox, oy, oz, dx, dy, dz, skip) {
    const r = this._ray;
    r.set(this._v.set(ox, oy, oz), new THREE.Vector3(dx, dy, dz));
    r.far = 200;
    r.camera = this.persp;
    const hits = r.intersectObject(this.ship.root, true);
    for (const h of hits) {
      const o = h.object;
      if (!o.isMesh || (o.material && o.material.isShaderMaterial)) continue;
      if (skip && skip.has(o)) continue;
      let vis = true;
      for (let p = o; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (vis) return h;
    }
    return null;
  }

  // Lädt für diese Fraktion/dieses Schiff noch ein echtes Modell?
  isLoading(faction, shipId) {
    return this.pending.has('ship:' + shipId + ':' + faction) || this.pending.has('ship:' + shipId);
  }

  // Detailstufe für prozedurale Rümpfe (nur Halle): Brünierstahl statt Schwarz, damit Stacheln und Kiel
  // Licht fangen; Aufbauten (Lüfter, Platten, Antennen, Sensoren) auf der Oberseite, Leuchtband am Rücken.
  _detailHull(faction) {
    const F = this.factory;
    const dark = F.mats.get('std:ship:dark');
    const fx = fxHex(faction);
    const steel = F.mat('bay:hull:dark:' + faction, () => new THREE.MeshStandardMaterial({
      color: faction === 'eris' ? 0x3c3a48 : 0x2c3038, metalness: 0.88, roughness: 0.3, envMapIntensity: 1.4,
      emissive: faction === 'eris' ? fx : 0x000000, emissiveIntensity: faction === 'eris' ? 0.05 : 0,
    }));
    this.ship.hull.traverse((o) => { if (o.isMesh && o.material === dark) o.material = steel; });
    // Rumpf im Hallenlicht eine Spur heller und glatter (nur diese Fabrik, das Spiel bleibt unberührt)
    const hull = F.mats.get('std:' + faction + ':hull');
    if (hull && !hull.userData.bayLit) {
      hull.userData.bayLit = true;
      hull.color.multiplyScalar(1.35);
      hull.roughness = Math.max(0.28, hull.roughness - 0.08);
      hull.envMapIntensity = (hull.envMapIntensity || 1) * 1.3;
    }
  }

  // Landekufen, Geschützträger, Lichtleisten, Positionslichter (Detailstufe nur für die Halle)
  _buildFit(faction, loadout) {
    this._dispose(this.gear);
    this._dispose(this.fit);
    this.nav.length = 0;
    const fx = fxHex(faction);
    const M = this._mats(fx);
    const G = new Batch(), P = new Batch();
    const box = this._box, c = this._sph.center;
    const L = box.max.x - box.min.x, Bw = box.max.z - box.min.z;
    // Teile, die nicht zur Hülle gehören (Laser, Generatoren)
    const lm = this.factory.mats.get('std:laser:metal'), gm = this.factory.mats.get('std:gen:metal');
    const parts = new Set();
    this.ship.root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.material === lm || o.material === gm) o.parent.traverse((q) => parts.add(q));
    });
    // Landekufen: Federbein, Kolben, Hydraulikzylinder, Scherenglied, Fußteller
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (const fxp of [0.22, 0.74]) for (const sz of [-1, 1]) {
      const x = box.min.x + L * fxp, z = c.z + sz * Bw * 0.17;
      const h = this._hit(x, PAD - 1, z, 0, 1, 0, parts);
      const yTop = h ? h.point.y + 0.4 : box.min.y + 1.5;
      const foot = PAD + 0.3;
      const mid = foot + (yTop - foot) * 0.46;
      G.box(M.mid, x, yTop - 0.3, z, 3.4, 0.7, 2.6, 0.25);                     // Lagerplatte
      G.box(M.steel, x, yTop - 1.1, z, 1.8, 1.2, 1.6, 0.25);                   // Gelenkkopf
      G.cyl(M.steel, a.set(x, yTop - 1.4, z), b.set(x, mid, z), 0.62, 14);     // Federbein
      G.cyl(M.accent, a.set(x, mid + 1.6, z), b.set(x, mid + 1.85, z), 0.66, 14);
      G.cyl(M.chrome, a.set(x, mid, z), b.set(x, foot + 1.1, z), 0.38, 14);    // Kolben
      G.cyl(M.dark, a.set(x, mid + 0.25, z), b.set(x, mid - 0.15, z), 0.74, 14); // Dichtring
      G.box(M.steel, x, foot + 0.95, z, 1.5, 0.7, 1.5, 0.2);                   // Fußgelenk
      G.cyl(M.rubber, a.set(x, foot - 0.3, z), b.set(x, foot + 0.15, z), 1.9, 20);
      G.cyl(M.paint, a.set(x, foot + 0.15, z), b.set(x, foot + 0.55, z), 1.55, 20, 1.2);
      // Hydraulikzylinder schräg zur Lagerplatte
      const ox = x + (fxp < 0.5 ? 1 : -1) * 2.6;
      G.cyl(M.mid, a.set(ox, yTop - 0.7, z), b.set(x + (ox - x) * 0.45, mid + 1.0, z), 0.3, 10);
      G.cyl(M.chrome, a.set(x + (ox - x) * 0.45, mid + 1.0, z), b.set(x + 0.4 * Math.sign(ox - x), mid - 0.6, z), 0.17, 8);
      // Scherenglied
      G.cyl(M.steel, a.set(x, mid - 0.2, z + 0.85), b.set(x - 0.9, mid - 1.4, z + 0.85), 0.14, 6);
      G.cyl(M.steel, a.set(x - 0.9, mid - 1.4, z + 0.85), b.set(x, foot + 1.2, z + 0.85), 0.14, 6);
      // Bremskeil vor dem Fußteller
      G.box(M.paint, x - 2.6, PAD + 0.45, z, 1, 0.9, 2.2, 0.15);
    }
    // Geschützträger: Pylon von der Hülle zum Laser, Drehkranz mit Leuchtband
    const nL = (loadout.lasers || []).length;
    const wp = new THREE.Vector3();
    for (let i = 0; i < nL; i++) {
      const hp = this.hps.laser[i];
      if (!hp || !loadout.lasers[i]) continue;
      wp.setFromMatrixPosition(hp.matrixWorld);
      const up = this._hit(wp.x - 1.2, wp.y + 0.2, wp.z, 0, 1, 0, parts);
      const top = up && up.distance < 9 ? up.point.y + 0.5 : wp.y + 2.4;
      const hgt = Math.max(0.8, top - wp.y);
      P.box(M.mid, wp.x - 1.3, wp.y + hgt / 2 + 0.4, wp.z, 4.2, hgt, 1.5, 0.3);
      P.box(M.steel, wp.x - 1.3, top - 0.2, wp.z, 5.4, 0.6, 2.4, 0.25);
      P.cyl(M.steel, a.set(wp.x + 0.6, wp.y, wp.z), b.set(wp.x - 0.4, wp.y, wp.z), 1.35, 18);
      P.cyl(M.accent, a.set(wp.x - 0.45, wp.y, wp.z), b.set(wp.x - 0.65, wp.y, wp.z), 1.4, 18);
      P.cyl(M.dark, a.set(wp.x - 0.7, wp.y, wp.z), b.set(wp.x - 1.6, wp.y, wp.z), 1.1, 18);
    }
    // Lichtleisten an den Flanken der Hülle (abgetastet)
    const n = 14;
    for (const sz of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const x = box.min.x + L * (0.2 + 0.55 * (i / (n - 1)));
        const h = this._hit(x, c.y + 0.6, c.z + sz * (Bw / 2 + 6), 0, 0, -sz, parts);
        if (!h) continue;
        P.box(M.accent, x, h.point.y, h.point.z + sz * 0.06, L * 0.55 / n * 0.62, 0.14, 0.12);
      }
    }
    // Positionslichter: Backbord rot, Steuerbord grün, Heck weiß blinkend
    const navAt = (sprite, x, y, z, s, blink) => {
      const sp = new THREE.Sprite(sprite);
      sp.position.set(x, y, z); sp.scale.setScalar(s);
      this.fit.add(sp);
      if (blink) this.nav.push(sp);
    };
    const F = this.factory;
    const port = this._hit(c.x + L * 0.05, c.y, box.max.z + 6, 0, 0, -1, parts);
    const star = this._hit(c.x + L * 0.05, c.y, box.min.z - 6, 0, 0, 1, parts);
    const tail = this._hit(box.max.x + 6, c.y + 1, c.z, -1, 0, 0, parts);
    const topH = this._hit(c.x, box.max.y + 6, c.z, 0, -1, 0, parts);
    if (port) { navAt(F.sprite(0xff3a26, 1.6, 'nav:r'), port.point.x, port.point.y, port.point.z + 0.3, 2.4, false); P.box(M.red, port.point.x, port.point.y, port.point.z + 0.05, 0.6, 0.35, 0.2); }
    if (star) { navAt(F.sprite(0x3aff8a, 1.3, 'nav:g'), star.point.x, star.point.y, star.point.z - 0.3, 2.4, false); P.box(F.glow(0x3aff8a, 1.4), star.point.x, star.point.y, star.point.z - 0.05, 0.6, 0.35, 0.2); }
    if (tail) navAt(F.sprite(0xffffff, 1.6, 'nav:w'), tail.point.x + 0.4, tail.point.y, tail.point.z, 3, true);
    if (topH) navAt(F.sprite(0xff3a26, 1.4, 'nav:r'), topH.point.x, topH.point.y + 0.3, topH.point.z, 2, true);
    if (this.ship.placeholder) this._greebles(P, M, parts, box, c, L, Bw);
    G.build(this.gear);
    P.build(this.fit);
    if (this.under) { this.under.position.set(c.x, PAD + 1.6, c.z); }
  }

  // Aufbauten auf der Rumpfoberseite (fester Zufall je Schiff, nur auf getroffener Hülle)
  _greebles(P, M, parts, box, c, L, Bw) {
    const r = rand(31 + Math.round(L * 10));
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const cols = 11, rows = 5;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (r() < 0.38) continue;
        const x = box.min.x + L * (0.12 + 0.76 * (i / (cols - 1))) + (r() - 0.5) * 1.6;
        const z = c.z + (j - (rows - 1) / 2) * (Bw * 0.12) + (r() - 0.5) * 1.2;
        const h = this._hit(x, box.max.y + 4, z, 0, -1, 0, parts);
        if (!h || !h.face || h.face.normal.y < 0.55) continue;
        const y = h.point.y, k = r();
        if (k < 0.34) { // Lüftergitter
          P.box(M.dark, x, y + 0.12, z, 2.4, 0.24, 1.3);
          for (let q = -2; q <= 2; q++) P.box(M.steel, x + q * 0.42, y + 0.27, z, 0.14, 0.08, 1.1);
        } else if (k < 0.62) { // Wartungsplatte mit Nieten
          P.box(M.steel, x, y + 0.06, z, 3 + r() * 1.6, 0.12, 1.6 + r() * 0.8, 0.04);
        } else if (k < 0.78) { // Sensorkopf
          P.cyl(M.mid, a.set(x, y, z), b.set(x, y + 0.5, z), 0.55, 10);
          P.cyl(M.chrome, a.set(x, y + 0.5, z), b.set(x, y + 0.75, z), 0.32, 10, 0.4);
        } else if (k < 0.9) { // Antenne
          P.cyl(M.steel, a.set(x, y, z), b.set(x, y + 1.8 + r() * 1.4, z), 0.07, 5);
          P.box(M.mid, x, y + 0.1, z, 0.5, 0.2, 0.5);
        } else { // Leitungsbündel längs
          P.cyl(M.dark, a.set(x - 1.6, y + 0.18, z), b.set(x + 1.6, y + 0.18, z), 0.16, 6);
          P.cyl(M.dark, a.set(x - 1.6, y + 0.18, z + 0.4), b.set(x + 1.6, y + 0.18, z + 0.4), 0.16, 6);
        }
      }
    }
    // Flanke zur Kamera: Wartungsklappen, Lüfter, Griffleisten (Strahl von der Seite)
    for (let i = 0; i < 9; i++) {
      if (r() < 0.25) continue;
      const x = box.min.x + L * (0.16 + 0.68 * (i / 8));
      const y0 = c.y + (r() - 0.3) * 2.2;
      const h = this._hit(x, y0, box.min.z - 6, 0, 0, 1, parts);
      if (!h || !h.face || Math.abs(h.face.normal.y) > 0.6) continue;
      const z = h.point.z - 0.06, k = r();
      if (k < 0.45) {
        P.box(M.dark, x, y0, z, 2.6, 1.2, 0.14);
        for (let q = -1; q <= 1; q++) P.box(M.steel, x, y0 + q * 0.34, z - 0.08, 2.2, 0.1, 0.06);
      } else if (k < 0.8) {
        P.box(M.steel, x, y0, z, 3.2, 1.6, 0.1, 0.03);
        P.box(M.accentDim, x - 1.2, y0 + 0.5, z - 0.07, 0.4, 0.12, 0.04);
      } else {
        P.box(M.chrome, x, y0, z - 0.1, 2.4, 0.12, 0.12);
      }
    }
    // Leuchtband am Rücken in Fraktionsfarbe (abgetastet, folgt der Kontur)
    for (let i = 0; i < 16; i++) {
      const x = box.min.x + L * (0.18 + 0.62 * (i / 15));
      const h = this._hit(x, box.max.y + 4, c.z, 0, -1, 0, parts);
      if (!h) continue;
      P.box(M.accent, x, h.point.y + 0.05, c.z, L * 0.62 / 16 * 0.55, 0.1, 0.22);
    }
  }

  // Draufsicht: dunkle Fläche + Kanten, Bauteile (Laser/Generatoren) in Fraktionsfarbe
  _buildPlan(locked) {
    const F = this.factory;
    const fx = fxHex(this._envFaction);
    const fill = F.mat('plan:fill2', () => new THREE.MeshBasicMaterial({ color: 0x0a0d12, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const line = F.mat('plan:line', () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 }));
    line.opacity = locked ? 0.22 : 0.62;
    const part = F.mat('plan:part:' + fx, () => new THREE.LineBasicMaterial({ color: fx }));
    const lm = F.mats.get('std:laser:metal'), gm = F.mats.get('std:gen:metal');
    const inv = new THREE.Matrix4().copy(this.shipRoot.matrixWorld).invert();
    const m4 = new THREE.Matrix4();
    const partRoots = new Set();
    this.ship.root.traverse((o) => { if (o.isMesh && (o.material === lm || o.material === gm)) partRoots.add(o.parent); });
    this.ship.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      const isPart = partRoots.has(o.parent);
      m4.multiplyMatrices(inv, o.matrixWorld);
      const f = new THREE.Mesh(o.geometry, fill);
      f.matrixAutoUpdate = false; f.matrix.copy(m4);
      this.plan.add(f);
      let eg = this._edges.get(o.geometry.uuid);
      if (!eg) { eg = new THREE.EdgesGeometry(o.geometry, 28); this._edges.set(o.geometry.uuid, eg); }
      const l = new THREE.LineSegments(eg, isPart && !locked ? part : line);
      l.matrixAutoUpdate = false; l.matrix.copy(m4);
      this.plan.add(l);
    });
    this.plan.position.copy(this.shipRoot.position);
  }

  setMode(mode) {
    if (!this.ok || this.mode === mode) return;
    this.mode = mode;
    this._dirty = true;
  }

  // Größe der Zeichenfläche und Bereich, in den das Schiff passen soll (Anteile der Fläche)
  resize(w, h, area) {
    if (!this.ok) return;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (area) this.area = area;
    if (w !== this.size.w || h !== this.size.h) {
      this.size.w = w; this.size.h = h;
      this.gl.setSize(w, h, false);
    }
    this._dirty = true;
  }

  _camera() {
    const { w, h } = this.size;
    const aspect = w / h;
    const fit = this.area;
    const fs = this.mode === 'werft' ? (this._fsph || this._sph) : this._sph;
    const R = Math.max(1, fs.radius);
    const c = fs.center;
    if (this.mode === 'plan') {
      const cam = this.ortho;
      // Länge des Schiffs = Anteil fit.pw der Fläche (Draufsicht groß), Breite passt in die Höhe
      const pw = fit.pw || 0.52;
      const hwL = (this.dims.l / 2) / pw;
      const halfB = (this.dims.b / 2) / 0.8;
      const half = Math.max(hwL / aspect, halfB);
      const hw = half * aspect;
      const ox = (0.5 - fit.cx) * 2 * hw, oy = (0.5 - fit.cy) * 2 * half;
      // senkrecht gespiegelt: Platz 1 (Backbord) liegt oben, wie die Kartenreihenfolge
      cam.left = -hw + ox; cam.right = hw + ox; cam.top = -half + oy; cam.bottom = half + oy;
      cam.position.set(c.x, 200, c.z);
      cam.up.set(0, 0, -1);
      cam.lookAt(c.x, 0, c.z);
      cam.updateProjectionMatrix();
      return cam;
    }
    const cam = this.persp;
    cam.aspect = aspect;
    const vt = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const ht = vt * aspect;
    const d = Math.max(R / (ht * fit.w), R / (vt * fit.h)) * (this.mode === 'studio' ? 0.9 : 0.8);
    if (this.mode === 'studio') {
      cam.position.set(c.x - 0.62 * d, c.y + 0.3 * d, c.z - 0.7 * d);
      cam.lookAt(c.x, c.y - R * 0.04, c.z);
    } else {
      // Heldenaufnahme: nah, knapp unter Rumpfhöhe, Blick leicht nach oben
      cam.position.set(c.x - 0.5 * d, c.y + 0.02 * d, c.z - 0.86 * d);
      cam.lookAt(c.x, c.y + R * 0.06, c.z);
    }
    cam.up.set(0, 1, 0);
    if (this.fog) { this.fog.near = d * 0.9; this.fog.far = d * 3.4; }
    cam.clearViewOffset();
    const offX = (0.5 - fit.cx) * w, offY = (0.5 - fit.cy) * h;
    if (offX || offY) cam.setViewOffset(w, h, offX, offY, w, h);
    cam.updateProjectionMatrix();
    return cam;
  }

  // Montagepunkte in Anteilen der Zeichenfläche
  project(kind, i, out) {
    const o = this.hps[kind][i];
    if (!o || !this._cam) return null;
    this._v.setFromMatrixPosition(o.matrixWorld).project(this._cam);
    out.x = (this._v.x + 1) / 2;
    out.y = (1 - this._v.y) / 2;
    return out;
  }

  _render() {
    const plan = this.mode === 'plan', studio = this.mode === 'studio';
    this.env.visible = !plan && !studio;
    this.gear.visible = !plan && !studio;
    this.fit.visible = !plan;
    this.shipRoot.visible = !plan && !this.hideShip;
    this.gear.visible = this.gear.visible && !this.hideShip;
    this.fit.visible = this.fit.visible && !this.hideShip;
    this.shadow.visible = !plan && !studio && !this.hideShip;
    this.vignette.visible = !plan && !studio;
    this.lights.visible = !plan;
    this.plan.visible = plan;
    this.scene.fog = plan || studio ? null : this.fog || null;
    this.scene.environmentIntensity = studio ? 0.55 : 0.3;
    this.gl.setClearColor(BG, plan || studio ? 0 : 1);
    this._cam = this._camera();
    this.gl.render(this.scene, this._cam);
  }

  _frame(now) {
    this._raf = requestAnimationFrame(this._loop);
    if (document.hidden) return;
    const dt = now - this._last;
    if (dt < 32 && !this._dirty) return; // höchstens 30 Bilder/s
    this._last = now;
    this._t += Math.min(0.1, dt / 1000);
    this.factory.uTime.value = this._t;
    if (this.crane) {
      const k = (this._t % 24) / 24;
      const e = k < 0.5 ? k * 2 : 2 - k * 2;
      this.crane.position.x = -64 + 128 * (e * e * (3 - 2 * e));
      this.crane.updateMatrixWorld(true);
    }
    const on = (this._t % 1.6) < 0.12;
    for (let i = 0; i < this.nav.length; i++) this.nav[i].visible = i === 0 ? on : (this._t + 0.8) % 1.6 < 0.12;
    const wasDirty = this._dirty;
    this._dirty = false;
    this._render();
    if (wasDirty && this.onProject) this.onProject();
  }

  start() {
    if (!this.ok || this._raf) return;
    this._last = 0;
    this._dirty = true;
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  // Standbild für das Datenblatt im Shop: freigestellt in Dreiviertelansicht (einmal je Schiff)
  snapshot(faction, shipId, w, h, locked) {
    if (!this.ok) return null;
    this._shots = this._shots || new Map();
    const key = faction + '|' + shipId + '|' + w + 'x' + h + '|' + this.factory.version + '|' + (locked ? 1 : 0);
    const hit = this._shots.get(key);
    if (hit) return hit;
    const prev = { mode: this.mode, w: this.size.w, h: this.size.h, area: this.area };
    const lo = shipId === 's1' ? { lasers: ['pulse', 'pulse'], gens: ['sh1', 'dr1'] } : { lasers: ['ion', 'ion', 'pulse', 'pulse'], gens: ['sh1', 'sh1', 'dr1'] };
    this.setShip(faction, shipId, locked ? { lasers: [], gens: [] } : lo, locked);
    this.mode = locked ? 'plan' : 'studio';
    const hide = this.hideShip;
    this.hideShip = false;
    this.resize(w * 2, h * 2, locked ? { cx: 0.5, cy: 0.5, w: 1, h: 1, pw: 0.8 } : { cx: 0.5, cy: 0.5, w: 1.0, h: 0.98 });
    this._render();
    // Umriss des Rumpfs im Bild (Anteile) für die Maßketten am Rumpf
    const bx = [1, 0, 1, 0], b = this._box, v = this._v;
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(this._cam);
      const x = (v.x + 1) / 2, y = (1 - v.y) / 2;
      if (x < bx[0]) bx[0] = x; if (x > bx[1]) bx[1] = x; if (y < bx[2]) bx[2] = y; if (y > bx[3]) bx[3] = y;
    }
    const shot = { url: this.canvas.toDataURL('image/png'), l: this.dims.l, b: this.dims.b, bx: bx.map((q) => Math.max(0, Math.min(1, q))) };
    this.hideShip = hide;
    this._shots.set(key, shot);
    this.mode = prev.mode;
    this.area = prev.area;
    this.size.w = 0;
    if (prev.w) this.resize(prev.w, prev.h);
    this._key = ''; // nächster Hangar-Aufbau setzt das eigene Schiff wieder
    return shot;
  }

  dispose() {
    this.stop();
    if (!this.ok) return;
    for (const e of this._edges.values()) e.dispose();
    this._edges.clear();
    this._dispose(this.env); this._dispose(this.gear); this._dispose(this.fit);
    for (const t of this._tex || []) t.dispose();
    for (const m of this._texMats || []) m.dispose();
    this._shadowTex.dispose(); this._vigTex.dispose();
    this.shadow.material.dispose(); this.vignette.material.dispose(); this.shadow.geometry.dispose();
    this.envRT.dispose();
    this.factory.dispose();
    this.gl.dispose();
    this.ok = false;
  }
}
