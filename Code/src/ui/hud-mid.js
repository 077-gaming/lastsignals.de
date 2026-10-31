// Mitte-Ebene des Flug-HUD: Anzeigen direkt in der Spielwelt.
// (1) Zielklammer am gewählten Ziel (Farbe wie der Auswahlring der 3D-Szene), Schild prallt an Fensterkanten ab
// (2) Peilmarke: am Bildrand, wenn das Ziel außerhalb liegt; an der Fensterkante, wenn ein Fenster es verdeckt
// (3) Schild und Hülle als zwei Bogensegmente unter dem eigenen Schiff, Text nur bei niedriger Hülle
// (4) Angreifer: jeder Gegner, der den Spieler gerade angreift, bekommt eine rote Markierung im Bild
//     bzw. einen roten Pfeil mit Trefferbogen am Bildrand; dazu ein kurzer Richtungsblitz am Schildring je Treffer
// Wenige feste Knoten, nur per transform bewegt; DOM wird nur bei geänderten Werten angefasst.
import './hud-mid.css';
import { ENEMIES } from '../core/data.js';
import { PLAYER_RANGE } from '../sim/config.js';
import { fmt, clamp01, TextSlot, ClassSlot, Bar } from './hud-parts.js';

const EDGE = 44;          // Abstand der Randmarke zum Bildschirmrand
const STEP = 12;          // Schrittweite beim Zurücklaufen aus einem Fenster
const BOX_MIN = 22, BOX_MAX = 84;
const LAB_W = 150, LAB_H = 46;
const HOT_SECS = 4;
const FLASH_SECS = 1.6;
const LOW = 0.3;
const THREATS = 6;        // so viele Angreifer werden gleichzeitig markiert (nächste zuerst)
const HITS = 4;           // gleichzeitige Richtungsblitze am Schildring
const HIT_SECS = 0.55;
const T_MIN = 16, T_MAX = 60;

// Klammer: oben links und unten rechts angeschnitten, die anderen Ecken als Winkel
const BOX_SVG = `<svg class="hc-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
  <path class="hc-c" d="M0 30 V12 L12 0 H30"/>
  <path class="hc-c" d="M70 0 H100 V30"/>
  <path class="hc-c" d="M100 70 V88 L88 100 H70"/>
  <path class="hc-c" d="M30 100 H0 V70"/>
  <path class="hc-tk" d="M50 -6 V6 M50 94 V106 M-6 50 H6 M94 50 H106"/>
</svg>`;

// Zwei Bögen unter dem Schiff (145° bis 35°, durch 90° = unten). Außen Schild, innen Hülle.
const ARC_SVG = `<svg class="hc-arcs" viewBox="0 0 100 100" aria-hidden="true">
  <path class="hc-a0" pathLength="100" d="M12.32 76.38 A46 46 0 0 0 87.68 76.38"/>
  <path class="hc-a1 is-sh" pathLength="100" data-m="ash" d="M12.32 76.38 A46 46 0 0 0 87.68 76.38"/>
  <path class="hc-a0" pathLength="100" d="M17.23 72.94 A40 40 0 0 0 82.77 72.94"/>
  <path class="hc-a1 is-hl" pathLength="100" data-m="ahl" d="M17.23 72.94 A40 40 0 0 0 82.77 72.94"/>
  <path class="hc-ak" d="M50 87 V92 M50 81 V84"/>
</svg>`;

// Richtungsblitz: Bogen um ±24° um die Blickrichtung 0° (nach rechts), außen dünne Begleitlinie
const HIT_SVG = `<svg class="hc-hsvg" viewBox="-50 -50 100 100" aria-hidden="true">
  <path class="hc-h0" d="M42.0 -18.7 A46 46 0 0 1 42.0 18.7"/>
  <path class="hc-h1" d="M45.7 -20.3 A50 50 0 0 1 45.7 20.3"/>
  <path class="hc-h2" d="M38 0 L47 -5 L47 5 Z"/>
</svg>`;

// Angreifer im Bild: vier rote Winkel als Raute, Mitte frei
const THR_SVG = `<svg class="hc-tsvg" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M50 4 L62 16 M50 4 L38 16 M96 50 L84 62 M96 50 L84 38 M50 96 L62 84 M50 96 L38 84 M4 50 L16 62 M4 50 L16 38"/>
</svg>`;

// Angreifer außerhalb: Pfeil plus Trefferbogen (Bogen liegt quer zur Richtung, zeigt zum Rand)
const THA_SVG = `<svg class="hc-asvg" viewBox="-24 -24 48 48" aria-hidden="true">
  <path class="hc-ab" d="M14 -16 A22 22 0 0 1 14 16"/>
  <path class="hc-ap" d="M-8 -9 L6 0 L-8 9 L-4 0 Z"/>
</svg>`;

const TEMPLATE = `
<div class="hc-tgt" data-m="tgt">
  <div class="hc-box" data-m="box">${BOX_SVG}</div>
  <div class="hc-lab" data-m="lab">
    <div class="hc-l1"><b class="hc-name" data-m="name"></b><span class="hc-dist ls-num" data-m="dist"></span></div>
    <div class="hc-bars">
      <div class="ls-bar hc-hull" data-m="hull"></div>
      <div class="ls-bar hc-sh" data-m="sh"></div>
    </div>
    <div class="hc-st" data-m="st"></div>
  </div>
</div>
<div class="hc-arr" data-m="arr">
  <svg class="hc-chev" data-m="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3 L18 12 L6 21 L10 12 Z"/></svg>
  <span class="hc-adist ls-num" data-m="adist"></span>
</div>
<div class="hc-ship" data-m="ship">
  <div class="hc-ring" data-m="ring">${ARC_SVG}</div>
  <div class="hc-hits" data-m="hits"></div>
  <div class="hc-low" data-m="low"></div>
</div>
<div class="hc-thr" data-m="thr"></div>`;

// Liegt der Punkt (mit Rand) unter einem Fenster? Gibt das Fenster zurück oder null.
function winAt(wins, x, y, pad) {
  if (!wins) return null;
  for (let i = 0; i < wins.length; i++) {
    const o = wins[i];
    if (!o.placed || !o.w) continue;
    if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return o;
  }
  return null;
}
function rectHit(wins, x0, y0, x1, y1) {
  if (!wins) return null;
  for (let i = 0; i < wins.length; i++) {
    const o = wins[i];
    if (!o.placed || !o.w) continue;
    if (x1 > o.x - 6 && x0 < o.x + o.w + 6 && y1 > o.y - 6 && y0 < o.y + o.h + 6) return o;
  }
  return null;
}

export class HudMid {
  constructor(parent) {
    const el = document.createElement('div');
    el.className = 'hc';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = TEMPLATE;
    parent.appendChild(el);
    this.el = el;
    const q = (r) => el.querySelector(`[data-m="${r}"]`);

    this.tgt = q('tgt'); this.box = q('box'); this.lab = q('lab');
    this.sTgtOn = new ClassSlot(this.tgt, 'on');
    this.sKind = this.tgt;
    this._kindCls = '';
    this.sAtk = new ClassSlot(this.tgt, 'is-atk');
    this.sOut = new ClassSlot(this.tgt, 'is-out');
    this.sFlash = new ClassSlot(this.tgt, 'is-flash');
    this.sNoSh = new ClassSlot(this.tgt, 'no-sh');
    this.sNoBars = new ClassSlot(this.tgt, 'no-bars');
    this.sName = new TextSlot(q('name'));
    this.sDist = new TextSlot(q('dist'));
    this.sSt = new TextSlot(q('st'));
    this.bHull = new Bar(q('hull'), 120);
    this.bSh = new Bar(q('sh'), 120);

    this.arr = q('arr'); this.chev = q('chev');
    this.sArrOn = new ClassSlot(this.arr, 'on');
    this.sArrPeil = new ClassSlot(this.arr, 'is-peil');
    this.adist = q('adist');
    this.sADist = new TextSlot(this.adist);

    this.ship = q('ship'); this.ring = q('ring');
    this.sShipOn = new ClassSlot(this.ship, 'on');
    this.sShipHot = new ClassSlot(this.ship, 'is-hot');
    this.sShipLow = new ClassSlot(this.ship, 'is-low');
    this.sShipUp = new ClassSlot(this.ship, 'is-up');
    this.sShipNoSh = new ClassSlot(this.ship, 'no-sh');
    this.aSh = q('ash'); this.aHl = q('ahl');
    this.sLow = new TextSlot(q('low'));

    this._scr = { x: 0, y: 0, visible: false };
    this._scr2 = { x: 0, y: 0, visible: false };
    this._tId = null;
    this._bx = NaN; this._by = NaN; this._bs = NaN; this._lx = NaN; this._ly = NaN;
    this._ax = NaN; this._ay = NaN; this._aa = NaN;
    this._sx = NaN; this._sy = NaN; this._ss = NaN;
    this._distQ = -1; this._adistQ = -1;
    this._shQ = -1; this._hlQ = -1; this._lowQ = -1;
    this._hot = 0; this._flash = 0; this._flashText = '';
    this._lastHp = NaN; this._lastSh = NaN;

    // ---------- Angreifer (fester Pool) ----------
    const thr = q('thr');
    this.threats = [];
    for (let i = 0; i < THREATS; i++) {
      const m = document.createElement('div');
      m.className = 'hc-tm';
      m.innerHTML = THR_SVG;
      const a = document.createElement('div');
      a.className = 'hc-ta';
      a.innerHTML = THA_SVG + '<span class="hc-tad ls-num"></span>';
      thr.appendChild(m); thr.appendChild(a);
      const svg = a.firstElementChild;
      this.threats.push({
        m, a, svg, sM: new ClassSlot(m, 'on'), sA: new ClassSlot(a, 'on'), sFresh: new ClassSlot(a, 'is-fresh'), sMFresh: new ClassSlot(m, 'is-fresh'),
        sD: new TextSlot(a.lastElementChild), dq: -1,
        mx: NaN, my: NaN, ms: NaN, ax: NaN, ay: NaN, aa: NaN,
      });
    }
    this._cand = new Array(THREATS).fill(null);   // nächste Angreifer dieses Bildes (wiederverwendet)
    this._candD = new Float64Array(THREATS);
    this._hitAt = new Map();                       // Angreifer-id -> Restzeit „frisch getroffen“ (für hellen Puls)

    // ---------- Richtungsblitze am Schildring ----------
    const hits = q('hits');
    this.hits = [];
    for (let i = 0; i < HITS; i++) {
      const h = document.createElement('div');
      h.className = 'hc-hit';
      h.innerHTML = HIT_SVG;
      hits.appendChild(h);
      this.hits.push({ el: h, t: 0, ux: 0, uz: 1, sh: false, op: -1, ang: NaN, size: NaN, sSh: new ClassSlot(h, 'is-hull') });
    }
    this._hitNext = 0;
  }

  /** Spieler wurde von `from` (Entity) bzw. aus Schussrichtung (dx, dz) getroffen: Richtungsblitz am Schildring. */
  hitFrom(w, p) {
    const pl = w && w.player;
    if (!pl || !p) return;
    let ux = 0, uz = 0;
    const src = p.from != null && w.entities ? w.entities.get(p.from) : null;
    if (src && src !== pl) { ux = src.x - pl.x; uz = src.z - pl.z; }
    else if (typeof p.dx === 'number' && typeof p.dz === 'number') { ux = -p.dx; uz = -p.dz; }
    const len = Math.hypot(ux, uz);
    if (!(len > 1e-6)) return;
    // gleiche Richtung kurz nacheinander: vorhandenen Blitz auffrischen statt neuen zu belegen
    ux /= len; uz /= len;
    let slot = null;
    for (let i = 0; i < HITS; i++) {
      const h = this.hits[i];
      if (h.t > 0 && h.ux * ux + h.uz * uz > 0.97) { slot = h; break; }
    }
    if (!slot) { slot = this.hits[this._hitNext]; this._hitNext = (this._hitNext + 1) % HITS; }
    slot.t = HIT_SECS; slot.ux = ux; slot.uz = uz;
    slot.sh = (p.hull || 0) <= 0;
    if (src) this._hitAt.set(src.id, 0.35);
    this._hot = HOT_SECS;
  }

  reset() {
    this._tId = null;
    for (let i = 0; i < this.hits.length; i++) this.hits[i].t = 0;
    this._hitAt.clear();
    this._lastHp = NaN; this._lastSh = NaN;
    this._shQ = -1; this._hlQ = -1;
    this.bHull.reset(); this.bSh.reset();
  }

  /** Kurze Rückmeldung an der Klammer, z. B. bei Schuss außer Reichweite. */
  flash(text) {
    this._flash = FLASH_SECS;
    this._flashText = text;
  }

  /** Spieler wurde getroffen: Anzeige am Schiff voll einblenden. */
  hit() { this._hot = HOT_SECS; }

  /** wins: Fenster mit x, y, w, h (aus hud-win.js), unter denen nichts gezeichnet wird. */
  update(w, r, dt, hidden, wins) {
    const pl = w && w.player;
    if (hidden || !r || !pl || pl.alive === false || w.docked) {
      this.sTgtOn.set(false); this.sArrOn.set(false); this.sShipOn.set(false);
      this._hideThreats(0);
      return;
    }
    if (this._hot > 0) this._hot -= dt;
    if (this._flash > 0) this._flash -= dt;
    const views = r.views;
    const W = window.innerWidth, H = window.innerHeight;

    // ---------- eigenes Schiff: zwei Bögen ----------
    const pv = views && views.get(pl.id);
    const px = pv ? pv.rx : pl.x, pz = pv ? pv.rz : pl.z;
    const s = r.toScreen(px, pz, this._scr);
    const pr = pv && pv.vr ? pv.vr : 30;
    const s2 = r.toScreen(px + pr, pz, this._scr2);
    const prs = Math.abs(s2.x - s.x);
    this.sShipOn.set(s.visible);
    this._cx = s.x; this._cy = s.y;
    if (s.visible) {
      let size = Math.round(Math.max(64, Math.min(150, prs * 2.6)) / 4) * 4;
      const sx = Math.round(s.x), sy = Math.round(s.y);
      // Bögen und Warntext nicht unter einem Fenster: dann über das Schiff klappen
      const up = !!rectHit(wins, sx - size / 2, sy, sx + size / 2, sy + size / 2 + 22);
      this.sShipUp.set(up);
      if (sx !== this._sx || sy !== this._sy || size !== this._ss) {
        this._sx = sx; this._sy = sy;
        if (size !== this._ss) { this._ss = size; this.ring.style.width = size + 'px'; this.ring.style.height = size + 'px'; this.ship.style.setProperty('--low-y', Math.round(size * 0.42) + 'px'); this.ship.style.setProperty('--low-up', -Math.round(size * 0.42 + 16) + 'px'); }
        this.ship.style.transform = 'translate3d(' + sx + 'px,' + sy + 'px,0)';
      }
    }
    const hpMax = pl.hpMax || 1, hp = Math.max(0, pl.hp || 0);
    const shMax = pl.shieldMax || 0, sh = Math.max(0, pl.shield || 0);
    if (hp < this._lastHp - 0.5 || sh < this._lastSh - 0.5) this._hot = HOT_SECS;
    this._lastHp = hp; this._lastSh = sh;
    const hf = clamp01(hp / hpMax), sf = shMax ? clamp01(sh / shMax) : 0;
    const hq = Math.round(hf * 100), sq = Math.round(sf * 100);
    if (hq !== this._hlQ) { this._hlQ = hq; this.aHl.style.strokeDashoffset = String(100 - hq); }
    if (sq !== this._shQ) { this._shQ = sq; this.aSh.style.strokeDashoffset = String(100 - sq); }
    this.sShipNoSh.set(!shMax);
    const low = hf < LOW;
    this.sShipLow.set(low);
    const lq = low ? hq : -1;
    if (lq !== this._lowQ) { this._lowQ = lq; this.sLow.set(low ? 'HÜLLE ' + hq + ' %' : ''); }
    this.sShipHot.set(low || this._hot > 0 || !!w.inCombat || !!pl.attacking);
    if (s.visible) this._updHits(r, px, pz, dt);
    this._updThreats(w, r, pl, px, pz, W, H, wins, dt);

    // ---------- Ziel ----------
    const id = pl.targetId;
    const e = id != null && w.entities ? w.entities.get(id) : null;
    if (!e || e.alive === false) {
      this.sTgtOn.set(false); this.sArrOn.set(false);
      this._tId = null;
      return;
    }
    if (id !== this._tId) {
      this._tId = id;
      const def = e.kind === 'enemy' ? ENEMIES[e.type] : null;
      const kc = def ? 'is-enemy' : e.kind === 'crate' ? 'is-crate' : 'is-neutral';
      if (kc !== this._kindCls) {
        if (this._kindCls) { this.tgt.classList.remove(this._kindCls); this.arr.classList.remove(this._kindCls); }
        this.tgt.classList.add(kc); this.arr.classList.add(kc);
        this._kindCls = kc;
      }
      this.sName.set(String(e.name || (def && def.name) || '').toUpperCase());
      this.sNoBars.set(!(e.hpMax > 0) || e.kind === 'station' || e.kind === 'portal');
      this.bHull.reset(); this.bSh.reset();
      this._bs = NaN;
    }
    const ev = views && views.get(id);
    const ex = ev ? ev.rx : e.x, ez = ev ? ev.rz : e.z;
    const t = r.toScreen(ex, ez, this._scr);
    const tx = t.x, ty = t.y;
    const dist = Math.hypot(e.x - pl.x, e.z - pl.z);
    const atk = !!(pl.attacking && pl.targetId === id);
    const out = dist > PLAYER_RANGE;
    this.sAtk.set(atk);
    this.sOut.set(out && e.kind === 'enemy');
    const dq = Math.round(dist / 10);

    const inView = t.visible && tx > 0 && tx < W && ty > 0 && ty < H;
    const covered = inView && !!winAt(wins, tx, ty, 4);
    const showBox = inView && !covered;
    this.sTgtOn.set(showBox);
    this.sArrOn.set(!showBox);
    this.sArrPeil.set(covered);

    if (showBox) {
      const er = ev && ev.vr ? ev.vr : (e.radius || 20);
      const t2 = r.toScreen(ex + er, ez, this._scr2);
      let half = Math.abs(t2.x - tx) * 1.25 + 8;
      half = half < BOX_MIN ? BOX_MIN : half > BOX_MAX ? BOX_MAX : half;
      half = Math.round(half / 2) * 2;
      const bx = Math.round(tx), by = Math.round(ty);
      // Schild: unter der Klammer; stößt es an ein Fenster oder den Rand, über die Klammer, dann seitlich
      let lx = 0, ly = half + 8;
      const below = by + ly, above = by - half - 8 - LAB_H;
      if (below + LAB_H > H - 8 || rectHit(wins, bx - LAB_W / 2, below, bx + LAB_W / 2, below + LAB_H)) {
        if (above > 8 && !rectHit(wins, bx - LAB_W / 2, above, bx + LAB_W / 2, above + LAB_H)) ly = -half - 8 - LAB_H;
      }
      const o = rectHit(wins, bx - LAB_W / 2, by + ly, bx + LAB_W / 2, by + ly + LAB_H);
      if (o) lx = o.x + o.w / 2 < bx ? Math.round(o.x + o.w + 10 - (bx - LAB_W / 2)) : Math.round(o.x - 10 - (bx + LAB_W / 2));
      if (bx + lx - LAB_W / 2 < 8) lx = 8 - (bx - LAB_W / 2);
      if (bx + lx + LAB_W / 2 > W - 8) lx = W - 8 - (bx + LAB_W / 2);
      if (bx !== this._bx || by !== this._by || half !== this._bs) {
        this._bx = bx; this._by = by;
        if (half !== this._bs) { this._bs = half; this.box.style.transform = 'scale(' + (half / 50) + ')'; }
        this.tgt.style.transform = 'translate3d(' + bx + 'px,' + by + 'px,0)';
      }
      if (lx !== this._lx || ly !== this._ly) { this._lx = lx; this._ly = ly; this.lab.style.transform = 'translate3d(' + lx + 'px,' + ly + 'px,0)'; }
      if (dq !== this._distQ) { this._distQ = dq; this.sDist.set(fmt(dq * 10) + ' M'); }
      if (e.hpMax > 0) {
        this.bHull.set(clamp01((e.hp || 0) / e.hpMax), dt);
        const esm = e.shieldMax || 0;
        this.sNoSh.set(!esm);
        if (esm) this.bSh.set(clamp01((e.shield || 0) / esm), dt);
      }
      let st = '';
      if (this._flash > 0) st = this._flashText;
      else if (out && e.kind === 'enemy') st = 'AUSSER REICHWEITE';
      else if (atk) st = 'ANGRIFF';
      this.sSt.set(st);
      this.sFlash.set(this._flash > 0);
      return;
    }

    // ---------- Peilmarke ----------
    // Richtung vom eigenen Schiff zum Ziel in der Welt (Draufsicht: Bild-x ≈ Welt-x, Bild-y ≈ Welt-z)
    const cx = this._cx, cy = this._cy;
    let dx, dy, ax, ay;
    if (covered) {
      // Ziel liegt unter einem Fenster: vom Ziel Richtung Schiff laufen, bis die Fensterkante erreicht ist
      dx = tx - cx; dy = ty - cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      ax = tx; ay = ty;
      for (let i = 0; i < 80 && winAt(wins, ax, ay, 14); i++) { ax -= ux * STEP; ay -= uy * STEP; }
    } else {
      dx = ex - px; dy = ez - pz;
      if (dx === 0 && dy === 0) dy = 1;
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      // Schnitt mit dem Bildrand (Abstand EDGE), dann aus Fenstern heraus Richtung Schiff
      const kx = ux > 0 ? (W - EDGE - cx) / ux : ux < 0 ? (EDGE - cx) / ux : Infinity;
      const ky = uy > 0 ? (H - EDGE - cy) / uy : uy < 0 ? (EDGE - cy) / uy : Infinity;
      const k = Math.max(0, Math.min(kx, ky));
      ax = cx + ux * k; ay = cy + uy * k;
      for (let i = 0; i < 80 && winAt(wins, ax, ay, 14); i++) { ax -= ux * STEP; ay -= uy * STEP; }
    }
    ax = Math.round(ax); ay = Math.round(ay);
    const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
    if (ax !== this._ax || ay !== this._ay) {
      this._ax = ax; this._ay = ay;
      this.arr.style.transform = 'translate3d(' + ax + 'px,' + ay + 'px,0)';
    }
    if (ang !== this._aa) {
      this._aa = ang;
      this.chev.style.transform = 'rotate(' + ang + 'deg)';
      // Entfernung auf die dem Rand abgewandte Seite (Richtung Schiff), damit sie nie an Fenster stößt
      const rad = ang * Math.PI / 180;
      this.adist.style.transform = 'translate3d(' + Math.round(-Math.cos(rad) * 40) + 'px,' + Math.round(-Math.sin(rad) * 20) + 'px,0)';
    }
    if (dq !== this._adistQ) { this._adistQ = dq; this.sADist.set(fmt(dq * 10) + ' M'); }
  }

  // Richtungsblitze: Winkel im Bild aus einem Punkt kurz vor dem Schiff in Angreiferrichtung (berücksichtigt die Kameraneigung)
  _updHits(r, px, pz, dt) {
    const size = this._ss + 22;
    for (let i = 0; i < HITS; i++) {
      const h = this.hits[i];
      if (h.t <= 0) { if (h.op !== 0) { h.op = 0; h.el.style.opacity = '0'; } continue; }
      h.t -= dt;
      const k = h.t > 0 ? h.t / HIT_SECS : 0;
      const op = Math.round(k * k * 100) / 100;
      if (op !== h.op) { h.op = op; h.el.style.opacity = String(op); }
      if (op <= 0) continue;
      const q = r.toScreen(px + h.ux * 60, pz + h.uz * 60, this._scr2);
      const ang = Math.round(Math.atan2(q.y - this._cy, q.x - this._cx) * 180 / Math.PI);
      if (ang !== h.ang || size !== h.size) {
        h.ang = ang;
        if (size !== h.size) { h.size = size; h.el.style.width = size + 'px'; h.el.style.height = size + 'px'; }
        h.el.style.transform = 'translate(-50%,-50%) rotate(' + ang + 'deg)';
      }
      h.sSh.set(!h.sh);
    }
  }

  // Angreifer suchen (nächste zuerst), im Bild markieren oder am Rand anpeilen. Ohne Speicher-Neuanlage.
  _updThreats(w, r, pl, px, pz, W, H, wins, dt) {
    const en = w.enemies;
    const cand = this._cand, cd = this._candD;
    let n = 0;
    if (en && pl.alive !== false && !w.inSafeZone) {
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (!e || e.alive === false || e.targetId !== 'player' || !e.attacking) continue;
        const d = (e.x - pl.x) * (e.x - pl.x) + (e.z - pl.z) * (e.z - pl.z);
        // sortiert einfügen, nur die nächsten THREATS behalten
        let j = n < THREATS ? n++ : THREATS;
        if (j === THREATS) { if (d >= cd[THREATS - 1]) continue; j = THREATS - 1; }
        while (j > 0 && cd[j - 1] > d) { cand[j] = cand[j - 1]; cd[j] = cd[j - 1]; j--; }
        cand[j] = e; cd[j] = d;
      }
    }
    this._dt = dt;
    if (this._hitAt.size) this._hitAt.forEach(this._decHit || (this._decHit = (v, k, m) => { if (v - this._dt <= 0) m.delete(k); else m.set(k, v - this._dt); }));
    const views = r.views;
    const cx = this._cx, cy = this._cy;
    for (let i = 0; i < n; i++) {
      const e = cand[i];
      const T = this.threats[i];
      const fresh = this._hitAt.has(e.id);
      const ev = views && views.get(e.id);
      const ex = ev ? ev.rx : e.x, ez = ev ? ev.rz : e.z;
      const t = r.toScreen(ex, ez, this._scr2);
      const tx = t.x, ty = t.y;
      const inView = t.visible && tx > 0 && tx < W && ty > 0 && ty < H;
      const covered = inView && !!winAt(wins, tx, ty, 4);
      // gewähltes Ziel hat schon Klammer bzw. Peilmarke: im Bild nur die Raute, am Rand kein zweiter Pfeil
      const isTgt = e.id === pl.targetId;
      if (inView && !covered) {
        T.sA.set(false);
        const er = ev && ev.vr ? ev.vr : (e.radius || 20);
        const t2 = r.toScreen(ex + er, ez, this._scr);
        let half = Math.abs(t2.x - tx) * 1.6 + 12;
        half = half < T_MIN ? T_MIN : half > T_MAX ? T_MAX : half;
        half = Math.round(half / 2) * 2;
        if (isTgt) half += 10; // außerhalb der Zielklammer
        const bx = Math.round(tx), by = Math.round(ty);
        if (bx !== T.mx || by !== T.my || half !== T.ms) {
          T.mx = bx; T.my = by;
          if (half !== T.ms) { T.ms = half; T.m.style.width = (half * 2) + 'px'; T.m.style.height = (half * 2) + 'px'; }
          T.m.style.transform = 'translate3d(' + (bx - half) + 'px,' + (by - half) + 'px,0)';
        }
        T.sMFresh.set(fresh);
        T.sM.set(true);
        continue;
      }
      T.sM.set(false);
      if (isTgt) { T.sA.set(false); continue; }
      // Richtung im Bild: Punkt kurz vor dem Schiff Richtung Angreifer projizieren
      let ux = e.x - pl.x, uz = e.z - pl.z;
      const wl = Math.hypot(ux, uz) || 1;
      ux /= wl; uz /= wl;
      const q = r.toScreen(px + ux * 60, pz + uz * 60, this._scr);
      let dx = q.x - cx, dy = q.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      let ax, ay;
      if (covered) {
        ax = tx; ay = ty;
        for (let k = 0; k < 80 && winAt(wins, ax, ay, 16); k++) { ax -= dx * STEP; ay -= dy * STEP; }
      } else {
        const E = EDGE - 14;
        const kx = dx > 0 ? (W - E - cx) / dx : dx < 0 ? (E - cx) / dx : Infinity;
        const ky = dy > 0 ? (H - E - cy) / dy : dy < 0 ? (E - cy) / dy : Infinity;
        const k = Math.max(0, Math.min(kx, ky));
        ax = cx + dx * k; ay = cy + dy * k;
        for (let k2 = 0; k2 < 80 && winAt(wins, ax, ay, 16); k2++) { ax -= dx * STEP; ay -= dy * STEP; }
      }
      ax = Math.round(ax); ay = Math.round(ay);
      const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
      if (ax !== T.ax || ay !== T.ay) { T.ax = ax; T.ay = ay; T.a.style.transform = 'translate3d(' + ax + 'px,' + ay + 'px,0)'; }
      if (ang !== T.aa) {
        T.aa = ang;
        T.svg.style.transform = 'rotate(' + ang + 'deg)';
        const rad = ang * Math.PI / 180;
        T.a.lastElementChild.style.transform = 'translate3d(' + Math.round(-Math.cos(rad) * 42) + 'px,' + Math.round(-Math.sin(rad) * 20) + 'px,0)';
      }
      const dq = Math.round(Math.sqrt(cd[i]) / 10);
      if (dq !== T.dq) { T.dq = dq; T.sD.set(fmt(dq * 10) + ' M'); }
      T.sFresh.set(fresh);
      T.sA.set(true);
    }
    for (let i = 0; i < n; i++) cand[i] = null;
    this._hideThreats(n);
  }

  _hideThreats(from) {
    for (let i = from; i < this.threats.length; i++) { const T = this.threats[i]; T.sM.set(false); T.sA.set(false); }
  }

  dispose() { this.el.remove(); }
}
