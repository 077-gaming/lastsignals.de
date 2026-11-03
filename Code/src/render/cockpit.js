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

// Verkleidung der Kanzel: lackiertes Blech mit Plattenfugen, Schrauben, Kratzern, Lüftern und Schaltfeldern.
// Runde 3: keine sichtbare Kachelung mehr – die Wände nutzen eine große Verkleidung (2 × 2 m je Kachel, unregelmäßige
// Plattenteilung, Lüfter/Schalter nur an wenigen Stellen) mit Welt-UV (Meter) und Versatz je Bauteil; die schräge
// Konsole bekommt eine eigene Fläche, deren Fugen an den Kanten und unter den drei Bildschirmen liegen.
// Warnstreifen neutral (hell-/dunkelgrau), damit sie zu jeder Fraktion passen.
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function plate(g, rnd, x, y, w, h) {
  const t = 70 + Math.floor(rnd() * 18);
  g.fillStyle = `rgb(${t},${t + 6},${t + 16})`; g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = 'rgba(255,255,255,0.11)'; g.fillRect(x + 2, y + 2, w - 4, 2);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
  g.fillStyle = '#9aa2ad';
  const sc = [[x + 9, y + 9], [x + w - 11, y + 9], [x + 9, y + h - 11], [x + w - 11, y + h - 11]];
  if (w > 260) sc.push([x + w / 2, y + 9], [x + w / 2, y + h - 11]);
  for (const [sx, sy] of sc) { g.beginPath(); g.arc(sx, sy, 2.6, 0, Math.PI * 2); g.fill(); }
}
function wear(g, rnd, W, H, n) {
  for (let i = 0; i < n; i++) { g.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.05})`; g.beginPath(); const x = rnd() * W, y = rnd() * H; g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 8); g.stroke(); }
  for (let i = 0; i < n / 6; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.07})`; g.beginPath(); g.arc(rnd() * W, rnd() * H, 4 + rnd() * 20, 0, Math.PI * 2); g.fill(); }
}
function vent(g, x, y, w, h) {
  g.fillStyle = '#1d2026'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  for (let k = y + 6; k < y + h - 4; k += 9) g.fillRect(x + 6, k, w - 12, 3);
}
function switches(g, x, y, n, lit) {
  g.fillStyle = '#22262d'; g.fillRect(x, y, 38, 14 + n * 20);
  for (let r = 0; r < n; r++) { g.fillStyle = r === lit ? '#ffb15a' : (r === n - 1 ? '#5ad1ff' : '#6b727d'); g.fillRect(x + 8, y + 8 + r * 20, 22, 10); }
}
function stripes(g, x, y, w, h) {
  for (let k = 0; k * 24 < w; k++) { g.fillStyle = k % 2 ? '#2a2d33' : '#8d939c'; g.fillRect(x + k * 24, y, 12, h); }
}
function canvasTex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Wandverkleidung: 1024², entspricht 2 × 2 m; unregelmäßige Plattenreihen
let _wallTex = null;
function wallTexture() {
  if (_wallTex) return _wallTex;
  const W = 1024, c = document.createElement('canvas'); c.width = c.height = W;
  const g = c.getContext('2d'), rnd = rng(11);
  g.fillStyle = '#4a515c'; g.fillRect(0, 0, W, W);
  const rows = [0, 150, 330, 470, 690, 840, 1024];
  for (let j = 0; j < rows.length - 1; j++) {
    let x = Math.floor(rnd() * 120) - 120;
    while (x < W) { const w = 180 + Math.floor(rnd() * 260); plate(g, rnd, Math.max(0, x), rows[j], Math.min(W, x + w) - Math.max(0, x), rows[j + 1] - rows[j]); x += w; }
  }
  wear(g, rnd, W, W, 520);
  vent(g, 610, 360, 150, 92); vent(g, 120, 720, 110, 96);
  switches(g, 380, 180, 4, 1); switches(g, 860, 700, 3, -1);
  g.fillStyle = '#2a2e35'; g.fillRect(40, 600, 520, 20); g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(40, 600, 520, 3);
  stripes(g, 640, 980, 300, 22);
  _wallTex = canvasTex(c, true);
  return _wallTex;
}
// Konsole (schräge Fläche 3,2 × 1,1 m): 1024 × 352, Fugen an den Kanten und zwischen den drei Bildschirmfeldern
let _consoleTex = null;
function consoleTexture() {
  if (_consoleTex) return _consoleTex;
  const W = 1024, H = 352, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), rnd = rng(23);
  g.fillStyle = '#4a515c'; g.fillRect(0, 0, W, H);
  // Felder: Rand links, drei Bildschirmfelder (unter x = −0,62 / 0 / 0,62 m), Rand rechts; hinten eine Leiste
  const cols = [0, 214, 418, 606, 810, 1024];
  for (let i = 0; i < cols.length - 1; i++) { plate(g, rnd, cols[i], 0, cols[i + 1] - cols[i], 250); plate(g, rnd, cols[i], 250, cols[i + 1] - cols[i], H - 250); }
  wear(g, rnd, W, H, 220);
  switches(g, 60, 60, 4, 1); switches(g, 926, 60, 4, -1);
  vent(g, 60, 270, 120, 60); vent(g, 844, 270, 120, 60);
  stripes(g, 300, 300, 420, 18);
  _consoleTex = canvasTex(c, false);
  return _consoleTex;
}
// Kasten mit Welt-UV (Meter / Periode) und Versatz: die Verkleidung läuft maßstabsgleich über alle Bauteile
function trimBox(w, h, d, ox = 0, oy = 0, period = 2) {
  const g = new THREE.BoxGeometry(w, h, d), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
  for (let i = 0; i < P.count; i++) {
    const nx = Math.abs(N.getX(i)), ny = Math.abs(N.getY(i));
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    let u, v;
    if (nx > 0.5) { u = z; v = y; } else if (ny > 0.5) { u = x; v = z; } else { u = x; v = y; }
    U.setXY(i, u / period + ox, v / period + oy);
  }
  return g;
}

export class Cockpit {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 1, 0.05, 40);
    this.head = new THREE.Vector3();
    this._acc = 1;
    this._accent = new THREE.Color(0xff8a2a);

    // ohne Umgebungskarte wird stark metallisches Material schwarz: Verkleidung als lackiertes Blech (wenig Metall)
    const metal = new THREE.MeshStandardMaterial({ color: 0x5a6270, metalness: 0.45, roughness: 0.5, emissive: 0x17191e });
    // Runde 4: dunkle Teile und Schale mit schwacher Eigenhelligkeit (Grundlicht der Kanzelbeleuchtung): beim Umsehen
    // (Gier ±1,9, Neigung −0,6…0,7) keine schwarzen Flächen (Prüfung tools/bilder/cockpit.mjs: ≤ 5 % unter 6/255)
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3038, metalness: 0.2, roughness: 0.65, emissive: 0x15171c });
    const trim = new THREE.MeshStandardMaterial({ map: consoleTexture(), color: 0xc0c6d0, metalness: 0.3, roughness: 0.6 });
    const trimSide = new THREE.MeshStandardMaterial({ map: wallTexture(), color: 0xc0c6d0, metalness: 0.3, roughness: 0.6, emissive: 0x2b2e36, emissiveMap: wallTexture() });
    const shell = new THREE.MeshStandardMaterial({ map: wallTexture(), color: 0xc4cad4, metalness: 0.25, roughness: 0.7, emissive: 0x2b2e36, emissiveMap: wallTexture() });
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
    add(trimBox(3.3, 0.7, 1.5, 0.13, 0.41), trimSide, 0, -1.12, -0.9);
    add(new THREE.BoxGeometry(3.0, 0.016, 0.02), this.glowMat, 0, -0.45, -1.6);
    // Seitenkonsolen bis hinter den Sitz und Kanzelwände: beim seitlichen Umsehen endet nichts als schwarze Platte
    add(trimBox(0.5, 0.5, 2.8, 0.31, 0.07), trimSide, -1.55, -0.72, -0.2, 0, 0.06);
    add(trimBox(0.5, 0.5, 2.8, 0.77, 0.53), trimSide, 1.55, -0.72, -0.2, 0, -0.06);
    add(trimBox(0.1, 0.62, 3.0, 0.52, 0.22), trimSide, -1.86, -0.4, -0.2, 0, 0.06, -0.12);
    add(trimBox(0.1, 0.62, 3.0, 0.04, 0.66), trimSide, 1.86, -0.4, -0.2, 0, -0.06, 0.12);
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
    // Rumpfschale geschlossen (Runde 3, Lage nach der Anhebung): Boden, Seitenschale von unten bis knapp unter den
    // Kanzelsims, Rückwand hinter dem Sitz; beim Umsehen nach links, rechts und unten kein Weltraum durch Lücken
    add(trimBox(3.9, 0.08, 4.1, 0.2, 0.35), shell, 0, -1.3, 0.15);
    add(trimBox(0.08, 1.18, 4.1, 0.6, 0.1), shell, -1.93, -0.71, 0.15);
    add(trimBox(0.08, 1.18, 4.1, 0.35, 0.8), shell, 1.93, -0.71, 0.15);
    add(trimBox(3.94, 2.5, 0.08, 0.7, 0.3), shell, 0, -0.05, 2.2);
    // Sitz: Sitzfläche und Lehne (dunkel), damit der Blick nach hinten unten nicht ins Leere geht
    add(new THREE.BoxGeometry(0.62, 0.12, 0.6), dark, 0, -0.75, 0.55);
    add(new THREE.BoxGeometry(0.62, 0.9, 0.12), dark, 0, -0.25, 0.9, -0.12);
    this.scene.add(new THREE.HemisphereLight(0x8592a8, 0x3a3f4a, 1.25));
    // Füll-Licht von vorn unten (Instrumentenschein): Rückwand, Sitz und Innenseiten der Schale, die das Hauptlicht von
    // hinten oben nicht erreicht
    const fillF = new THREE.DirectionalLight(0xc8d2e4, 0.75);
    fillF.position.set(0, -0.35, -1);
    this.scene.add(fillF);
    // seitliche Füll-Lichter (beide Seiten): Innenflächen der Seitenkonsolen beim Blick nach links/rechts unten
    for (const sx of [-1, 1]) { const fs = new THREE.DirectionalLight(0xb8c2d4, 0.45); fs.position.set(sx, 0.15, 0.25); this.scene.add(fs); }
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(0.4, 1, 0.6);
    this.scene.add(key);
    // Fraktionsschein der Instrumente: weit über dem Kopf, ohne Abfall (decay 0) und schwach – färbt die Kanzel flächig,
    // statt einen runden Glanzfleck unter den FLUG-Bildschirm auf die Konsole zu werfen
    this.glow = new THREE.PointLight(0xff8a2a, 0.22, 0, 0);
    this.glow.position.set(0, 2.4, 1.2);
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
