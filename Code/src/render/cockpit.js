// Cockpit-Ansicht als eigene Ebene: eigene Szene und Kamera (Tiefenbereich 0,05–40 m), gezeichnet nach der Welt mit
// gelöschtem Tiefenpuffer. Rahmen, Konsole und Instrumente sind eigene Geometrie, nicht das Außenmodell des Schiffs,
// daher kein Clipping und kein Flimmern gegen die Welt. Instrumente: Zeichenflächen, höchstens 5-mal pro Sekunde neu.
import * as THREE from 'three';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

function panelTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

// Verkleidung der Kanzel (Konsole, Seitenwände): lackiertes Blech mit Plattenfugen, Schrauben, Griffleisten und
// kleinen Schaltern, damit die Flächen im 4K-Cockpit nicht als schwarze Platten stehen. Einmal je Seite gezeichnet.
let _trimTex = null;
function trimTexture() {
  if (_trimTex) return _trimTex;
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#4a515c'; g.fillRect(0, 0, W, H);
  // Platten mit leicht verschiedenem Ton, dunkle Fugen, helle Oberkante
  const cols = [0, 140, 300, 512], rows = [0, 110, 250, 390, 512];
  for (let i = 0; i < cols.length - 1; i++) for (let j = 0; j < rows.length - 1; j++) {
    const x = cols[i], y = rows[j], w = cols[i + 1] - x, h = rows[j + 1] - y, t = 70 + Math.floor(rnd() * 16);
    g.fillStyle = `rgb(${t},${t + 6},${t + 16})`; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, y + 2, w - 4, 2);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
    g.fillStyle = '#9aa2ad';
    for (const [sx, sy] of [[x + 9, y + 9], [x + w - 11, y + 9], [x + 9, y + h - 11], [x + w - 11, y + h - 11]]) { g.beginPath(); g.arc(sx, sy, 2.6, 0, Math.PI * 2); g.fill(); }
  }
  // Abnutzung: feine helle Kratzer, dunkle Flecken
  for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`; g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); g.stroke(); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 4 + rnd() * 18, 0, Math.PI * 2); g.fill(); }
  // Schalterfelder und Griffleiste
  for (let k = 0; k < 3; k++) {
    const x0 = 160 + k * 46, y0 = 130;
    g.fillStyle = '#22262d'; g.fillRect(x0, y0, 38, 90);
    for (let r = 0; r < 4; r++) { g.fillStyle = r === 1 && k === 1 ? '#ffb15a' : (r === 3 ? '#5ad1ff' : '#6b727d'); g.fillRect(x0 + 8, y0 + 8 + r * 20, 22, 10); }
  }
  g.fillStyle = '#2a2e35'; g.fillRect(20, 420, 470, 22); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(20, 420, 470, 3);
  for (let x = 30; x < 480; x += 24) { g.fillStyle = (x / 24) % 2 < 1 ? '#c9a23a' : '#1b1d22'; g.fillRect(x, 460, 12, 26); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  _trimTex = t;
  return t;
}

export class Cockpit {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 40);
    this.head = new THREE.Vector3();
    this._acc = 1;
    this._accent = new THREE.Color(0xff8a2a);

    // ohne Umgebungskarte wird stark metallisches Material schwarz: Verkleidung als lackiertes Blech (wenig Metall)
    const metal = new THREE.MeshStandardMaterial({ color: 0x5a6270, metalness: 0.45, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x24282f, metalness: 0.2, roughness: 0.65 });
    const trim = new THREE.MeshStandardMaterial({ map: trimTexture(), color: 0xc0c6d0, metalness: 0.3, roughness: 0.55 });
    const trimSide = trim.clone(); trimSide.map = trimTexture().clone(); trimSide.map.repeat.set(2.2, 0.8); trimSide.map.needsUpdate = true;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
      this.scene.add(m);
      return m;
    };
    // Strebe von a nach b (Kanzelrahmen)
    const strut = (ax, ay, az, bx, by, bz, t = 0.07, mat = metal) => {
      _a.set(ax, ay, az); _b.set(bx, by, bz);
      const m = add(new THREE.BoxGeometry(t, t * 0.8, _a.distanceTo(_b)), mat, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      m.lookAt(_b);
      return m;
    };

    // Konsole: schräge Fläche unten, Vorderkante mit Leuchtleiste in Fraktionsfarbe
    add(new THREE.BoxGeometry(3.2, 0.1, 1.1), trim, 0, -0.66, -1.05, 0.32);
    add(new THREE.BoxGeometry(3.2, 0.36, 0.08), metal, 0, -0.62, -1.56);
    // Unterbau unter der Konsole (Blick nach unten: Verkleidung statt Leere)
    add(new THREE.BoxGeometry(3.3, 0.7, 1.5), trimSide, 0, -1.12, -0.9);
    add(new THREE.BoxGeometry(3.0, 0.016, 0.02), this.glowMat, 0, -0.45, -1.6);
    // Seitenkonsolen
    // Seitenkonsolen bis hinter den Sitz und Kanzelwände: beim seitlichen Umsehen endet nichts als schwarze Platte
    add(new THREE.BoxGeometry(0.5, 0.5, 2.8), trimSide, -1.55, -0.72, -0.2, 0, 0.06);
    add(new THREE.BoxGeometry(0.5, 0.5, 2.8), trimSide, 1.55, -0.72, -0.2, 0, -0.06);
    add(new THREE.BoxGeometry(0.1, 0.62, 3.0), trimSide, -1.86, -0.4, -0.2, 0, 0.06, -0.12);
    add(new THREE.BoxGeometry(0.1, 0.62, 3.0), trimSide, 1.86, -0.4, -0.2, 0, -0.06, 0.12);
    // Kanzelsims mit Leuchtleiste in Fraktionsfarbe
    add(new THREE.BoxGeometry(0.16, 0.05, 2.9), metal, -1.78, -0.08, -0.2, 0, 0.06);
    add(new THREE.BoxGeometry(0.16, 0.05, 2.9), metal, 1.78, -0.08, -0.2, 0, -0.06);
    add(new THREE.BoxGeometry(0.012, 0.012, 2.6), this.glowMat, -1.69, -0.05, -0.25, 0, 0.06);
    add(new THREE.BoxGeometry(0.012, 0.012, 2.6), this.glowMat, 1.69, -0.05, -0.25, 0, -0.06);
    // Kanzelrahmen: zwei Säulen, Dachbogen, schmale Mittelstrebe oben
    strut(-1.45, -0.45, -1.55, -1.05, 0.95, -1.75, 0.09);
    strut(1.45, -0.45, -1.55, 1.05, 0.95, -1.75, 0.09);
    strut(-1.05, 0.95, -1.75, 1.05, 0.95, -1.75, 0.08);
    strut(-1.05, 0.95, -1.75, -0.9, 1.3, 0.2, 0.08);
    strut(1.05, 0.95, -1.75, 0.9, 1.3, 0.2, 0.08);
    strut(0, 0.95, -1.75, 0, 1.25, -0.4, 0.05);

    // Instrumente: links Schiff, Mitte Flug, rechts Ziel
    this.panels = [
      { ...panelTex(512, 320), x: -0.62, ry: 0.42 },
      { ...panelTex(512, 320), x: 0, ry: 0 },
      { ...panelTex(512, 320), x: 0.62, ry: -0.42 },
    ];
    for (const p of this.panels) {
      const mat = new THREE.MeshBasicMaterial({ map: p.t, toneMapped: false });
      const z = p.x ? -1.0 : -1.08;
      add(new THREE.PlaneGeometry(0.42, 0.26), mat, p.x, -0.5, z, -0.55, p.ry);
      add(new THREE.BoxGeometry(0.46, 0.3, 0.02), dark, p.x, -0.505, z - 0.012, -0.55, p.ry);
    }

    // Konsole so hoch, dass die Instrumente über den unteren HUD-Fenstern liegen
    for (const o of this.scene.children) if (o.isMesh && o.position.y < -0.3) o.position.y += 0.22;
    this.scene.add(new THREE.HemisphereLight(0x8592a8, 0x1a1c22, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);
    this.glow = new THREE.PointLight(0xff8a2a, 1.2, 3, 2);
    this.glow.position.set(0, -0.35, -0.9);
    this.scene.add(this.glow);
  }

  setAccent(hex) {
    if (this._accentHex === hex) return;
    this._accentHex = hex;
    this._accent.setHex(hex);
    this.glowMat.color.setHex(hex).multiplyScalar(2.2);
    this.glow.color.setHex(hex);
    this._acc = 1;
  }

  // Umsehen: Kopf dreht sich, der Rahmen bleibt stehen (wandert also durchs Bild)
  look(yaw, pitch) { this._yaw = yaw; this._pitch = pitch; }

  setSize(w, h) { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }

  /** fov: Sichtfeld der Weltkamera (gleich halten, sonst passt der Rahmen nicht), bob: Kopfversatz (m), roll (rad) */
  update(dt, fov, bob, roll, info) {
    const cam = this.camera;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(bob.x, bob.y, bob.z);
    cam.rotation.set(this._pitch || 0, this._yaw || 0, roll, 'YXZ');
    this._acc += dt;
    if (this._acc >= 0.2 && info) { this._acc = 0; this._draw(info); }
  }

  _draw(i) {
    const acc = '#' + this._accent.getHexString();
    const frame = (g, title) => {
      g.fillStyle = '#05070a'; g.fillRect(0, 0, 512, 320);
      g.strokeStyle = acc; g.lineWidth = 3; g.globalAlpha = 0.7;
      g.beginPath(); g.moveTo(20, 4); g.lineTo(508, 4); g.lineTo(508, 300); g.lineTo(488, 316); g.lineTo(4, 316); g.lineTo(4, 20); g.closePath(); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = acc; g.font = `600 26px ${FONT}`; g.fillText(title, 26, 44);
    };
    const bar = (g, y, label, f, col) => {
      g.fillStyle = '#9aa3ad'; g.font = `500 24px ${FONT}`; g.fillText(label, 26, y);
      g.fillStyle = '#1a1e24'; g.fillRect(26, y + 10, 460, 22);
      g.fillStyle = col;
      const n = Math.round(Math.max(0, Math.min(1, f)) * 23);
      for (let k = 0; k < n; k++) g.fillRect(26 + k * 20, y + 10, 16, 22);
    };
    // links: Schiff
    let g = this.panels[0].g;
    frame(g, 'SCHIFF');
    bar(g, 110, `HÜLLE ${Math.round(i.hull * 100)} %`, i.hull, i.hull < 0.3 ? '#ff4a3a' : '#e8e8e8');
    bar(g, 200, `SCHILD ${Math.round(i.shield * 100)} %`, i.shield, acc);
    // Mitte: Flug
    g = this.panels[1].g;
    frame(g, 'FLUG');
    g.fillStyle = '#ffffff'; g.font = `600 96px ${FONT}`; g.fillText(String(Math.round(i.speed)), 26, 160);
    g.fillStyle = '#9aa3ad'; g.font = `500 26px ${FONT}`; g.fillText('M/S', 30, 196);
    bar(g, 250, i.ab ? 'NACHBRENNER' : 'SCHUB', i.speed / Math.max(1, i.maxSpeed), i.ab ? '#ffd36a' : acc);
    // rechts: Ziel
    g = this.panels[2].g;
    frame(g, 'ZIEL');
    g.fillStyle = i.target ? '#ff6a5a' : '#5b636d'; g.font = `600 40px ${FONT}`;
    g.fillText(i.target ? i.target.toUpperCase().slice(0, 18) : 'KEIN ZIEL', 26, 120);
    if (i.target) {
      g.fillStyle = '#e8e8e8'; g.font = `500 34px ${FONT}`; g.fillText(`${Math.round(i.dist)} M`, 26, 176);
      bar(g, 230, 'ZIEL HÜLLE', i.tHull, '#ff6a5a');
    } else { g.fillStyle = '#5b636d'; g.font = `500 24px ${FONT}`; g.fillText('TAB: NÄCHSTER GEGNER', 26, 176); }
    for (const p of this.panels) p.t.needsUpdate = true;
  }

  dispose() {
    this.scene.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
  }
}
