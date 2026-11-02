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

export class Cockpit {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 40);
    this.head = new THREE.Vector3();
    this._acc = 1;
    this._accent = new THREE.Color(0xff8a2a);

    const metal = new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.75, roughness: 0.42 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0c0e12, metalness: 0.4, roughness: 0.7 });
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
    add(new THREE.BoxGeometry(3.2, 0.1, 1.1), dark, 0, -0.66, -1.05, 0.32);
    add(new THREE.BoxGeometry(3.2, 0.36, 0.08), metal, 0, -0.62, -1.56);
    add(new THREE.BoxGeometry(3.0, 0.016, 0.02), this.glowMat, 0, -0.45, -1.6);
    // Seitenkonsolen
    add(new THREE.BoxGeometry(0.5, 0.5, 1.6), metal, -1.55, -0.72, -0.7, 0, 0.12);
    add(new THREE.BoxGeometry(0.5, 0.5, 1.6), metal, 1.55, -0.72, -0.7, 0, -0.12);
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
    this.scene.add(new THREE.HemisphereLight(0x8090a8, 0x0a0b0e, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
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

  setSize(w, h) { this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); }

  /** fov: Sichtfeld der Weltkamera (gleich halten, sonst passt der Rahmen nicht), bob: Kopfversatz (m), roll (rad) */
  update(dt, fov, bob, roll, info) {
    const cam = this.camera;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.position.set(bob.x, bob.y, bob.z);
    cam.rotation.set(0, 0, roll);
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
