// NAV·07 Minikarte als Navigationsinstrument: Sektorrand mit Skala, Entfernungsringe um das eigene Schiff,
// Sichtfeld der Kamera, Peillinie zum Ziel, Kurzlabels für Station und Tore, Feindgruppen statt Einzelpunkten.
// Zeichnet höchstens 15-mal pro Sekunde (Takt kommt aus hud.js). Keine Speicher-Neuanlage pro Bild:
// Gruppen in festen Float32Arrays, Strahl-Objekte für das Sichtfeld einmal angelegt.
import { Raycaster, Vector2, Vector3, Plane } from 'three';

const RINGS = [250, 500, 1000];
const GROUP_R = 320;          // Meter: Feinde näher als das gelten als eine Gruppe
const GROUP_MAX = 64;
const EDGE_WARN = 320;
const FONT = '10px "DIN Alternate", "DIN Condensed", "Arial Narrow", sans-serif';
const FONT_S = '9px "SF Mono", ui-monospace, Menlo, monospace';
const C_ENEMY = '#ff4a3a';    // wie der Auswahlring in der 3D-Szene
const C_NEUTRAL = '#9fe8ff';
const C_CRATE = '#ffd36a';
const TAU = Math.PI * 2;

const _ray = new Raycaster();
const _ndc = new Vector2();
const _plane = new Plane(new Vector3(0, 1, 0), 0);
const _hit = new Vector3();
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1]; // NDC: unten links, unten rechts, oben rechts, oben links

export function targetColor(e) {
  if (!e) return C_NEUTRAL;
  return e.kind === 'enemy' ? C_ENEMY : e.kind === 'crate' ? C_CRATE : C_NEUTRAL;
}

export class HudMap {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.px = 0; this.dpr = 1;
    this.gx = new Float32Array(GROUP_MAX);
    this.gz = new Float32Array(GROUP_MAX);
    this.gn = new Uint8Array(GROUP_MAX);
    this.fov = new Float32Array(8);
    this._dash = [2, 3];
    this._dash2 = [1, 3];
    this._noDash = [];
    this._collect = this._collectEnemy.bind(this);
    this._drawEnt = this._drawEntity.bind(this);
    this._gc = 0; this._k = 1; this._size = 1; this._tgt = null;
    if (this.ctx && 'letterSpacing' in this.ctx) this._ls = true;
  }

  size() {
    const css = this.cv.clientWidth || 0;
    if (!css) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (this.cv.width !== px) { this.cv.width = px; this.cv.height = px; }
    this.px = css; this.dpr = dpr;
    return true;
  }

  /** Bildschirmpunkt in der Karte → Weltkoordinate (für Klick zum Hinfliegen). */
  toWorld(clientX, clientY, size, out) {
    const r = this.cv.getBoundingClientRect();
    out.x = Math.max(-size, Math.min(size, ((clientX - r.left) / r.width) * 2 * size - size));
    out.z = Math.max(-size, Math.min(size, ((clientY - r.top) / r.height) * 2 * size - size));
    return out;
  }

  draw(w, renderer, mark, accent, now) {
    const ctx = this.ctx;
    if (!ctx || !w || !w.sector) return;
    if (!this.px && !this.size()) return;
    const S = this.px;
    const size = w.sector.size;
    const k = S / (2 * size);
    this._k = k; this._size = size;
    const pl = w.player;
    this._tgt = pl ? pl.targetId : null;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, S, S);
    if (this._ls) ctx.letterSpacing = '0px';

    // Raster alle 1.000 m, sehr leise
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.beginPath();
    for (let m = -Math.floor(size / 1000) * 1000; m <= size; m += 1000) {
      const v = Math.round(this._X(m)) + 0.5;
      ctx.moveTo(v, 0); ctx.lineTo(v, S);
      ctx.moveTo(0, v); ctx.lineTo(S, v);
    }
    ctx.stroke();

    // Sektorrand mit Skala: kurze Striche alle 500 m, lange alle 1.000 m
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
    ctx.beginPath();
    for (let m = -size + 500; m < size; m += 500) {
      const v = Math.round(this._X(m)) + 0.5;
      const L = m % 1000 === 0 ? 6 : 3;
      ctx.moveTo(v, 0); ctx.lineTo(v, L);
      ctx.moveTo(v, S); ctx.lineTo(v, S - L);
      ctx.moveTo(0, v); ctx.lineTo(L, v);
      ctx.moveTo(S, v); ctx.lineTo(S - L, v);
    }
    ctx.stroke();
    // Warnband vor dem Rand
    const edge = EDGE_WARN * k;
    ctx.strokeStyle = 'rgba(255,176,32,0.28)';
    ctx.setLineDash(this._dash);
    ctx.strokeRect(edge + 0.5, edge + 0.5, S - 2 * edge - 1, S - 2 * edge - 1);
    ctx.setLineDash(this._noDash);

    // Sichtfeld der Kamera (Trapez auf der Spielebene)
    if (renderer && this._fov(renderer)) {
      const f = this.fov;
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.beginPath();
      ctx.moveTo(this._X(f[0]), this._X(f[1]));
      for (let i = 2; i < 8; i += 2) ctx.lineTo(this._X(f[i]), this._X(f[i + 1]));
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }

    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';
    if (this._ls) ctx.letterSpacing = '1px';

    // Station mit sicherer Zone und Kurzlabel
    const st = w.sector.station;
    if (st) {
      const sx = this._X(st.x), sz = this._X(st.z);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(sx, sz, 400 * k, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(sx) - 3, Math.round(sz) - 3, 6, 6);
      this._label(String(st.name || 'STATION').toUpperCase(), sx, sz, S, 'rgba(255,255,255,0.86)');
    }
    // Sprungtore mit Ziel-Sektor
    const portals = w.sector.portals;
    if (portals) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < portals.length; i++) {
        const pp = portals[i];
        const x = this._X(pp.x), z = this._X(pp.z);
        ctx.beginPath(); ctx.arc(x, z, 4.5, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, z - 7.5); ctx.lineTo(x, z - 5.5); ctx.moveTo(x, z + 5.5); ctx.lineTo(x, z + 7.5); ctx.stroke();
        this._label('TOR ' + (pp.to || ''), x, z, S, 'rgba(255,255,255,0.78)');
      }
      ctx.lineWidth = 1;
    }

    // Kleinkram (Crates, Wracks, Erz)
    if (w.entities) w.entities.forEach(this._drawEnt);

    // Feinde zu Gruppen zusammenfassen
    this._gc = 0;
    if (w.entities) w.entities.forEach(this._collect);
    ctx.fillStyle = C_ENEMY;
    ctx.strokeStyle = C_ENEMY;
    for (let i = 0; i < this._gc; i++) {
      const n = this.gn[i];
      const x = Math.round(this._X(this.gx[i] / n)), z = Math.round(this._X(this.gz[i] / n));
      if (n === 1) {
        ctx.beginPath(); ctx.moveTo(x, z - 2.5); ctx.lineTo(x + 2.5, z); ctx.lineTo(x, z + 2.5); ctx.lineTo(x - 2.5, z); ctx.closePath(); ctx.fill();
      } else {
        const h = n > 5 ? 5.5 : 4.5;
        ctx.globalAlpha = 0.22; ctx.fillRect(x - h, z - h, 2 * h, 2 * h); ctx.globalAlpha = 1;
        ctx.strokeRect(x - h + 0.5, z - h + 0.5, 2 * h - 1, 2 * h - 1);
        if (this._ls) ctx.letterSpacing = '0px';
        ctx.font = FONT_S;
        ctx.fillText(String(n), x + h + 2, z + 3);
        ctx.font = FONT;
        if (this._ls) ctx.letterSpacing = '1px';
      }
    }

    if (!pl) return;
    const px = this._X(pl.x), pz = this._X(pl.z);

    // Entfernungsringe um das eigene Schiff (250 / 500 / 1.000 m) mit Skalenstrichen
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash(this._dash2);
    ctx.beginPath();
    for (let i = 0; i < RINGS.length; i++) { const r = RINGS[i] * k; ctx.moveTo(px + r, pz); ctx.arc(px, pz, r, 0, TAU); }
    ctx.stroke();
    ctx.setLineDash(this._noDash);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    for (let i = 0; i < RINGS.length; i++) {
      const r = RINGS[i] * k;
      ctx.moveTo(px + r - 2, pz); ctx.lineTo(px + r + 2, pz);
      ctx.moveTo(px - r - 2, pz); ctx.lineTo(px - r + 2, pz);
      ctx.moveTo(px, pz - r - 2); ctx.lineTo(px, pz - r + 2);
      ctx.moveTo(px, pz + r - 2); ctx.lineTo(px, pz + r + 2);
    }
    ctx.stroke();
    if (this._ls) ctx.letterSpacing = '0px';
    ctx.font = FONT_S;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const r1 = RINGS[2] * k;
    if (pz - r1 > 10) ctx.fillText('1 KM', px + 3, pz - r1 - 2);

    // Peillinie zum Ziel
    const te = this._tgt != null && w.entities ? w.entities.get(this._tgt) : null;
    if (te && te.alive !== false) {
      const c = targetColor(te);
      const tx = Math.round(this._X(te.x)), tz = Math.round(this._X(te.z));
      ctx.strokeStyle = c;
      ctx.globalAlpha = 0.7;
      ctx.setLineDash(this._dash);
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(tx, tz); ctx.stroke();
      ctx.setLineDash(this._noDash);
      ctx.globalAlpha = 1;
      // Zielmarke: Winkelklammer wie im Bild
      const h = 6, l = 3;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx - h, tz - h + l); ctx.lineTo(tx - h, tz - h); ctx.lineTo(tx - h + l, tz - h);
      ctx.moveTo(tx + h - l, tz - h); ctx.lineTo(tx + h, tz - h); ctx.lineTo(tx + h, tz - h + l);
      ctx.moveTo(tx + h, tz + h - l); ctx.lineTo(tx + h, tz + h); ctx.lineTo(tx + h - l, tz + h);
      ctx.moveTo(tx - h + l, tz + h); ctx.lineTo(tx - h, tz + h); ctx.lineTo(tx - h, tz + h - l);
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // Flugziel aus Kartenklick
    if (mark) {
      const mx = this._X(mark.x), mz = this._X(mark.z);
      ctx.strokeStyle = accent || '#fff';
      ctx.setLineDash(this._dash);
      ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(mx, mz); ctx.stroke();
      ctx.setLineDash(this._noDash);
      ctx.beginPath();
      ctx.moveTo(mx - 3.5, mz - 3.5); ctx.lineTo(mx + 3.5, mz + 3.5);
      ctx.moveTo(mx + 3.5, mz - 3.5); ctx.lineTo(mx - 3.5, mz + 3.5);
      ctx.stroke();
    }

    // eigenes Schiff als Pfeil in Flugrichtung
    const rot = pl.rot || 0;
    const fx = -Math.sin(rot), fz = -Math.cos(rot);
    ctx.fillStyle = accent || '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.beginPath();
    ctx.moveTo(px + fx * 8, pz + fz * 8);
    ctx.lineTo(px - fx * 4.5 + fz * 5, pz - fz * 4.5 - fx * 5);
    ctx.lineTo(px - fx * 2, pz - fz * 2);
    ctx.lineTo(px - fx * 4.5 - fz * 5, pz - fz * 4.5 + fx * 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  _X(v) { return (v + this._size) * this._k; }

  // Kurzlabel neben einem Kartenpunkt, bleibt im Kartenrahmen
  _label(text, x, z, S, color) {
    const ctx = this.ctx;
    const tw = ctx.measureText(text).width;
    let lx = x + 8, lz = z + 3;
    if (lx + tw > S - 4) lx = x - 8 - tw;
    if (lz < 12) lz = z + 14;
    if (lz > S - 4) lz = z - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(lx) - 2, Math.round(lz) - 9, Math.ceil(tw) + 4, 12);
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(lx), Math.round(lz));
  }

  _fov(r) {
    const cam = r.camera;
    if (!cam) return false;
    cam.updateMatrixWorld();
    const f = this.fov;
    for (let i = 0; i < 4; i++) {
      _ndc.set(CORNERS[i * 2], CORNERS[i * 2 + 1]);
      _ray.setFromCamera(_ndc, cam);
      if (!_ray.ray.intersectPlane(_plane, _hit)) return false;
      f[i * 2] = _hit.x; f[i * 2 + 1] = _hit.z;
    }
    return true;
  }

  _collectEnemy(e) {
    if (e.kind !== 'enemy' || e.alive === false) return;
    const gx = this.gx, gz = this.gz, gn = this.gn;
    for (let i = 0; i < this._gc; i++) {
      const dx = gx[i] / gn[i] - e.x, dz = gz[i] / gn[i] - e.z;
      if (dx * dx + dz * dz < GROUP_R * GROUP_R && gn[i] < 250) { gx[i] += e.x; gz[i] += e.z; gn[i]++; return; }
    }
    if (this._gc >= GROUP_MAX) return;
    const i = this._gc++;
    gx[i] = e.x; gz[i] = e.z; gn[i] = 1;
  }

  _drawEntity(e) {
    if (e.alive === false) return;
    const ctx = this.ctx, k = this._k, size = this._size;
    const x = (e.x + size) * k, z = (e.z + size) * k;
    switch (e.kind) {
      case 'crate':
        ctx.fillStyle = 'rgba(125,255,176,0.85)';
        ctx.fillRect(x - 1.25, z - 1.25, 2.5, 2.5);
        break;
      case 'wreck':
        ctx.fillStyle = 'rgba(125,255,176,0.45)';
        ctx.fillRect(x - 1, z - 1, 2, 2);
        break;
      case 'ore':
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 1, z - 1, 2, 2);
        break;
      default: break;
    }
  }
}
