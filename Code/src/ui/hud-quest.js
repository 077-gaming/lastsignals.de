// Auftragsmarker im All: zeigt, wo das aktuelle Auftragsziel liegt (nächster passender Gegner, Frachtkiste, Erz,
// laufendes Ereignis, Station oder das Sprungtor Richtung Auftragsabschnitt) – mit Entfernung, am Bildrand als Pfeil, wenn das Ziel außerhalb des Bildes liegt.
// Ziel wird alle 0,4 s neu gesucht (nicht jedes Bild), die Position jedes Bild aktualisiert.
import './hud-quest.css';
import { ring3, ring3Free } from './hud-parts.js';

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
    const cur = (w.sector && w.sector.index) || 1;
    const portalTo = (up) => near(w.portals, (o) => { const s = w.sectors && w.sectors[o.type]; return s && (up ? s.index > cur : s.index < cur); });
    if (g.type === 'kill') {
      near(w.enemies, (e) => (g.target == null || e.type === g.target) && (!g.rank || e.rank === g.rank));
      // Ziel lebt nicht in diesem Sektor: zum Tor Richtung Auftragsabschnitt
      if (!best && q.def.sector && q.def.sector !== cur) portalTo(q.def.sector > cur);
    } else if (g.type === 'crate') near(w.crates);
    else if (g.type === 'ore') near(w.ores);
    else if (g.type === 'buy' || g.type === 'own' || g.type === 'drones') { if (w.station) best = w.station; else portalTo(false); }
    else if (g.type === 'jump') portalTo(true);
    else if (g.type === 'event' && w.event && w.event.type === g.target && w.event.x != null) best = w.event;
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
    // 3D-Flug: ist das Auftragsziel zugleich das gewählte Ziel und im Bild, trägt die Zielklammer es schon
    if (w.flight3d && t.id != null && t.id === p.targetId) { const s0 = r.toScreen(t.x, t.z, this._s, r.ry ? r.ry(t.y) : 0); if (s0.visible && s0.x > 0 && s0.x < innerWidth && s0.y > 0 && s0.y < innerHeight) { this._hide(); return; } }
    const dist = Math.hypot(t.x - p.x, t.z - p.z, w.flight3d ? (t.y || 0) - (p.y || 0) : 0);
    if (dist < 180) { this._hide(); return; } // nah genug: dann übernimmt das normale Ziel-/Kistenbild
    const s = r.toScreen(t.x, t.z, this._s, r.ry ? r.ry(t.y) : 0);
    // freie Zone: unter den oberen Fenstern (Sektor, Coach), über den Instrumenten unten
    const W = innerWidth, H = innerHeight, m = 46, top = Math.min(200, H * 0.26), bot = H - Math.min(190, H * 0.24);
    let x = s.x, y = s.y, edge = false, ang = 0;
    const f3 = !!(w.flight3d && r.rig && r.rig.k > 0.5);
    // 3D-Flug (Runde 2): freie Zone ist eine Ellipse um die Bildmitte, außerhalb sitzt die Marke auf ihrem Rand – nie
    // am Bildrand unter den Fenstern (vorher lag „AUFTRAG 2,5 km“ auf HÜLLE/SCHILD oder auf der Chat-Kopfleiste)
    const rg = f3 ? ring3(W, H, x - W / 2, y - H / 2, 0.9, this._ring || (this._ring = { x: 0, y: 0 })) : null;
    const inside = f3 ? s.visible && !s.behind && Math.hypot(x - W / 2, y - H / 2) <= Math.hypot(rg.x - W / 2, rg.y - H / 2) : s.visible && x > m && x < W - m && y > top && y < bot;
    if (!inside && f3) {
      edge = true;
      let dx = x - W / 2, dy = y - H / 2;
      if (s.behind) { dx = -dx; dy = -dy; }
      if (!(dx || dy)) dy = -1;
      ang = Math.atan2(dy, dx);
      ring3Free(W, H, dx, dy, 0.9, rg); x = rg.x; y = rg.y;
    } else if (!inside) {
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
