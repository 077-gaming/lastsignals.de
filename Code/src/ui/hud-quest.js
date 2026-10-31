// Auftragsmarker im All: zeigt, wo das aktuelle Auftragsziel liegt (nächster passender Gegner, Frachtkiste,
// Station oder Sprungtor) – mit Entfernung, am Bildrand als Pfeil, wenn das Ziel außerhalb des Bildes liegt.
// Ziel wird alle 0,4 s neu gesucht (nicht jedes Bild), die Position jedes Bild aktualisiert.
import './hud-quest.css';

const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m');

export class HudQuest {
  constructor(root, world, renderer) {
    this.world = world; this.renderer = renderer;
    this.el = document.createElement('div');
    this.el.className = 'hud-qm';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '<i class="qm-ico"></i><span class="qm-l"><b>AUFTRAG</b><em></em></span>';
    this.lab = this.el.querySelector('em');
    root.appendChild(this.el);
    this.tgt = null; this.findT = 0; this._s = { x: 0, y: 0, visible: false }; this._txt = '';
  }
  setWorld(w) { this.world = w; this.tgt = null; this.findT = 0; }
  setRenderer(r) { this.renderer = r; }

  _find() {
    const w = this.world, q = w.quest, p = w.player;
    if (!q || !p) return null;
    const g = q.def.goal;
    let best = null, bd = Infinity;
    const near = (list, ok) => {
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (!o || o.alive === false || (ok && !ok(o))) continue;
        const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
    };
    if (g.type === 'kill') near(w.enemies, (e) => e.type === g.target);
    else if (g.type === 'crate') near(w.crates);
    else if (g.type === 'buy') best = w.station;
    else if (g.type === 'jump') near(w.portals);
    return best;
  }

  update(dt) {
    const w = this.world, r = this.renderer, p = w && w.player;
    const off = !w || !r || !r.toScreen || !p || w.docked || w.playerDead || !w.quest;
    if (off) { this._hide(); return; }
    this.findT -= dt;
    if (this.findT <= 0 || !this.tgt || this.tgt.alive === false) { this.tgt = this._find(); this.findT = 0.4; }
    const t = this.tgt;
    if (!t) { this._hide(); return; }
    const dist = Math.hypot(t.x - p.x, t.z - p.z);
    if (dist < 180) { this._hide(); return; } // nah genug: dann übernimmt das normale Ziel-/Kistenbild
    const s = r.toScreen(t.x, t.z, this._s);
    // freie Zone: unter den oberen Fenstern (Sektor, Coach), über den Instrumenten unten
    const W = innerWidth, H = innerHeight, m = 46, top = Math.min(200, H * 0.26), bot = H - Math.min(190, H * 0.24);
    let x = s.x, y = s.y, edge = false, ang = 0;
    const inside = s.visible && x > m && x < W - m && y > top && y < bot;
    if (!inside) {
      // hinter der Kamera oder außerhalb: Strahl vom Mittelpunkt der freien Zone bis an ihren Rand, Pfeil zeigt hin
      edge = true;
      const cx = W / 2, cy = (top + bot) / 2;
      let dx = x - cx, dy = y - cy;
      if (s.behind) { dx = -dx; dy = -dy; } // hinter der Kamera: Projektion ist gespiegelt, Richtung umkehren
      if (!(dx || dy)) dy = -1;
      ang = Math.atan2(dy, dx);
      const kx = (W / 2 - m) / Math.max(1e-3, Math.abs(Math.cos(ang))), ky = ((bot - top) / 2) / Math.max(1e-3, Math.abs(Math.sin(ang)));
      const k = Math.min(kx, ky);
      x = cx + Math.cos(ang) * k; y = cy + Math.sin(ang) * k;
    }
    this.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    this.el.style.setProperty('--qa', ang.toFixed(3) + 'rad');
    this.el.classList.toggle('edge', edge);
    this.el.classList.add('on');
    const txt = fmtDist(dist);
    if (txt !== this._txt) { this._txt = txt; this.lab.textContent = txt; }
  }
  _hide() { if (this.el.classList.contains('on')) this.el.classList.remove('on'); }
  dispose() { this.el.remove(); }
}
