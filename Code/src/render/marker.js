// Leitmarke am Sprungtor: kleine Instrumenten-Beschriftung über dem Tor, feste Größe am Bildschirm.
// Außerhalb der Reichweite „SPRUNGTOR · 210 M“, in Reichweite „[J] SPRINGEN“, beim Laden „SPRUNG LÄDT“.
// Die Textur wird nur neu gezeichnet, wenn sich der Text ändert (Distanz in 10-m-Schritten).
import * as THREE from 'three';

const W = 512, H = 64;

export class JumpMarker {
  constructor(scene) {
    this.cv = document.createElement('canvas');
    this.cv.width = W; this.cv.height = H;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.center.set(0.5, 0.5);
    this.sprite.renderOrder = 50;
    this.sprite.visible = false;
    scene.add(this.sprite);
    this.text = '';
  }

  _draw(text, live) {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    c.font = '600 30px "SF Mono", ui-monospace, Menlo, monospace';
    c.textBaseline = 'middle';
    const tw = c.measureText(text).width;
    const x0 = (W - tw) / 2 - 18, x1 = (W + tw) / 2 + 18, y0 = 10, y1 = 54;
    // Grund mit angeschnittenen Ecken, Haarlinie, Eckmarken
    c.beginPath();
    c.moveTo(x0 + 8, y0); c.lineTo(x1, y0); c.lineTo(x1, y1 - 8); c.lineTo(x1 - 8, y1); c.lineTo(x0, y1); c.lineTo(x0, y0 + 8); c.closePath();
    c.fillStyle = 'rgba(6,9,13,0.78)'; c.fill();
    c.strokeStyle = live ? 'rgba(216,240,255,0.55)' : 'rgba(255,255,255,0.2)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = live ? 'rgba(236,248,255,0.96)' : 'rgba(255,255,255,0.66)';
    c.fillText(text, (W - tw) / 2, 33);
    this.tex.needsUpdate = true;
  }

  // x, z = Tor; px, pz = Spieler; dist = Abstand; inRange = Sprung möglich; mpp = Meter je Bildschirmpixel
  // Die Marke steht am Torrand auf der Seite des Spielers (liegt so nie unter den oberen HUD-Fenstern)
  show(x, z, px, pz, dist, inRange, mpp, charging) {
    const text = charging ? 'SPRUNG LÄDT' : inRange ? '[J] SPRINGEN' : `SPRUNGTOR · ${Math.round(dist / 10) * 10} M`;
    if (text !== this.text) { this.text = text; this._draw(text, inRange || charging); }
    const s = this.sprite;
    s.visible = true;
    // 26 px hoch am Bildschirm, am Außenrand des Tors
    const hPx = 26;
    s.scale.set(hPx * mpp * (W / H), hPx * mpp, 1);
    const k = dist > 1 ? 128 / dist : 0;
    s.position.set(x + (px - x) * k, 30, z + (pz - z) * k + (dist > 1 ? 0 : 128));
  }

  hide() { this.sprite.visible = false; }

  dispose() {
    this.sprite.parent?.remove(this.sprite);
    this.tex.dispose(); this.mat.dispose();
  }
}
