// Kampf-Lesbarkeit im Flug-HUD (Planung/KAMPF_UND_GEGNER.md):
// (1) Trefferzeichen: kurzes X am Trefferpunkt jedes eigenen Treffers (Schild in Fraktionsfarbe, Hülle weiß,
//     kritisch größer in Warnfarbe), Abschusszeichen beim Zerstören eines Gegners, den du getroffen hast.
// (2) Serie (Combo) oben mittig auf Ereignis 'combo': Zähler, Bonus, ablaufende Zeitleiste, konkrete Beute.
// (3) Angekündigte Spezialangriffe ('telegraph'): Gegner außerhalb des Bildes (oder unter einem Fenster) bekommen
//     eine Warnmarke am Bildrand mit Art und Countdown; im Bild ein kleines Warnschild über dem Gegner.
// Feste Knoten-Pools, Bewegung nur per transform, DOM nur bei geänderten Werten. Keine Speicher-Neuanlage pro Bild.
import './hud-combat.css';
import { fmt, clamp01, TextSlot, ClassSlot } from './hud-parts.js';

const MARKS = 8;           // gleichzeitige Trefferzeichen
const MARK_SECS = 0.2;
const MARK_CRIT = 0.32;
const KILL_SECS = 0.55;
const WARNS = 4;           // gleichzeitige Angriffswarnungen
const EDGE = 52;           // Abstand der Randwarnung zum Bildschirmrand
const STEP = 12;
const RECENT = 4;          // s: Treffer zählt für das Abschusszeichen
const NF1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

// Art des angekündigten Angriffs -> Kurztext (Simulation liefert kind; unbekannte Arten: Oberbegriff)
const TELE = {
  volley: 'SALVE', salvo: 'SALVE', burst: 'SALVE', ram: 'RAMMANGRIFF', charge: 'RAMMANGRIFF',
  acid: 'SÄUREWOLKE', cloud: 'SÄUREWOLKE', beam: 'STRAHL', snipe: 'FERNSCHUSS', mine: 'MINE', bomb: 'DETONATION',
  pounce: 'SPRUNGBISS', leap: 'SPRUNGBISS', nova: 'DRUCKWELLE', spit: 'SÄURESPUCKE', summon: 'VERSTÄRKUNG',
};

const MARK_SVG = '<svg viewBox="-20 -20 40 40" aria-hidden="true"><path d="M-12 -12 L-5 -5 M12 -12 L5 -5 M12 12 L5 5 M-12 12 L-5 5"/></svg>';
const KILL_SVG = '<svg viewBox="-24 -24 48 48" aria-hidden="true"><path class="k0" d="M-16 -16 L-6 -6 M16 -16 L6 -6 M16 16 L6 6 M-16 16 L-6 6"/><path class="k1" d="M0 -21 L4 -17 L0 -13 L-4 -17 Z M21 0 L17 4 L13 0 L17 -4 Z M0 21 L-4 17 L0 13 L4 17 Z M-21 0 L-17 -4 L-13 0 L-17 4 Z"/></svg>';
// Warnmarke am Rand: Dreieck mit Ausrufestrich, Spitze zeigt nach außen (Richtung Angreifer)
const WARN_SVG = '<svg class="ht-wsvg" viewBox="-26 -26 52 52" aria-hidden="true"><path class="w0" d="M22 0 L-12 -19 L-12 19 Z"/><path class="w1" d="M-4 -7 V3 M-4 7 V9"/><path class="w2" d="M24 -22 A30 30 0 0 1 24 22"/></svg>';

function winAt(wins, x, y, pad) {
  if (!wins) return null;
  for (let i = 0; i < wins.length; i++) {
    const o = wins[i];
    if (!o.placed || !o.w) continue;
    if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return o;
  }
  return null;
}

export class HudCombat {
  constructor(parent) {
    const el = document.createElement('div');
    el.className = 'hk-layer';
    el.setAttribute('aria-hidden', 'true');
    parent.appendChild(el);
    this.el = el;
    this._scr = { x: 0, y: 0, visible: false };
    this._scr2 = { x: 0, y: 0, visible: false };

    // ---------- Trefferzeichen ----------
    this.marks = [];
    for (let i = 0; i < MARKS; i++) {
      const m = document.createElement('div');
      m.className = 'hk-m';
      m.innerHTML = MARK_SVG;
      el.appendChild(m);
      this.marks.push({ el: m, t: 0, life: 1, id: null, ox: 0, oz: 0, x: 0, z: 0, kind: '', tx: NaN, ty: NaN, ts: NaN, op: -1 });
    }
    this._markNext = 0;
    const k = document.createElement('div');
    k.className = 'hk-kill';
    k.innerHTML = KILL_SVG + '<span class="hk-kt"></span>';
    el.appendChild(k);
    this.kill = { el: k, t: 0, x: 0, z: 0, tx: NaN, ty: NaN, op: -1, label: new TextSlot(k.lastElementChild) };
    this._recent = new Map(); // Gegner-id -> Zeit des letzten eigenen Treffers
    this._now = 0;

    // ---------- Serie ----------
    const c = document.createElement('div');
    c.className = 'hk-combo';
    c.innerHTML = `<span class="hk-cc">SERIE</span><b class="hk-cn ls-num"></b><span class="hk-cb"></span><span class="hk-cl"></span><i class="hk-ct"><i></i></i>`;
    el.appendChild(c);
    this.combo = {
      el: c, on: new ClassSlot(c, 'on'), end: new ClassSlot(c, 'is-end'), pop: new ClassSlot(c, 'is-pop'),
      n: new TextSlot(c.children[1]), b: new TextSlot(c.children[2]), l: new TextSlot(c.children[3]),
      bar: c.children[4].firstElementChild, bq: -1,
      count: 0, left: 0, total: 1, endT: 0, popT: 0, y: NaN,
    };

    // ---------- Angriffswarnungen ----------
    this.warns = [];
    for (let i = 0; i < WARNS; i++) {
      const a = document.createElement('div');
      a.className = 'hk-w';
      a.innerHTML = WARN_SVG + '<span class="hk-wl"><b></b><span class="ls-num"></span></span>';
      const m = document.createElement('div');
      m.className = 'hk-wm';
      m.innerHTML = '<svg viewBox="0 0 20 18" aria-hidden="true"><path d="M10 1 L19 17 H1 Z"/><path d="M10 6 V11 M10 13.5 V15"/></svg><b></b><span class="ls-num"></span>';
      el.appendChild(a); el.appendChild(m);
      const lab = a.lastElementChild;
      this.warns.push({
        a, m, svg: a.firstElementChild, lab,
        sA: new ClassSlot(a, 'on'), sM: new ClassSlot(m, 'on'), sSide: new ClassSlot(m, 'is-side'), sAU: new ClassSlot(a, 'is-urgent'), sMU: new ClassSlot(m, 'is-urgent'),
        aKind: new TextSlot(lab.firstElementChild), aT: new TextSlot(lab.lastElementChild),
        mKind: new TextSlot(m.children[1]), mT: new TextSlot(m.children[2]),
        id: null, x: 0, z: 0, t: -1, total: 1, label: '', tq: -1,
        ax: NaN, ay: NaN, aa: NaN, mx: NaN, my: NaN,
      });
    }
  }

  // ---------- Ereignisse ----------
  onDamage(w, p) {
    if (!p || p.from !== 'player' || p.id === 'player') return;
    const total = (p.hull || 0) + (p.shield || 0);
    if (total <= 0) return;
    const e = w && w.entities ? w.entities.get(p.id) : null;
    this._recent.set(p.id, this._now);
    const m = this.marks[this._markNext];
    this._markNext = (this._markNext + 1) % MARKS;
    const hx = typeof p.hx === 'number' ? p.hx : p.x, hz = typeof p.hz === 'number' ? p.hz : p.z;
    m.id = e ? p.id : null;
    m.ox = e ? hx - e.x : 0; m.oz = e ? hz - e.z : 0;
    m.x = hx; m.z = hz;
    m.life = p.crit ? MARK_CRIT : MARK_SECS;
    m.t = m.life;
    const kind = p.crit ? 'hk-m is-crit' : (p.hull || 0) > 0 ? 'hk-m is-hull' : 'hk-m is-sh';
    if (kind !== m.kind) { m.kind = kind; m.el.className = kind; }
    m.tx = NaN; m.op = -1;
  }

  onExplode(w, p) {
    if (!p || p.id == null) return;
    const at = this._recent.get(p.id);
    this._recent.delete(p.id);
    if (at == null || this._now - at > RECENT) return;
    const K = this.kill;
    K.t = KILL_SECS; K.x = p.x; K.z = p.z; K.tx = NaN; K.op = -1;
    K.label.set('ZERSTÖRT');
    K.el.classList.remove('on'); void K.el.offsetWidth; K.el.classList.add('on');
    // eigene Warnungen dieses Gegners sind erledigt
    for (const W of this.warns) if (W.id === p.id) W.t = -1;
  }

  /** Ereignis 'combo': { count, bonus, window, timeLeft, xp, credits, honor, end } (Felder siehe SCHNITTSTELLEN.md). */
  onCombo(p) {
    if (!p) return;
    const C = this.combo;
    const n = Math.max(0, Math.floor(p.count ?? p.combo ?? p.n ?? 0));
    if (p.end || n < 2) {
      if (C.count >= 2) { C.endT = 1.4; C.end.set(true); C.l.set('SERIE ENDET · ×' + C.count); }
      C.count = 0; C.left = 0;
      return;
    }
    const bonus = typeof p.bonus === 'number' ? p.bonus : typeof p.mult === 'number' ? p.mult - 1 : 0;
    C.count = n;
    C.total = Math.max(0.5, p.window ?? p.duration ?? p.timeLeft ?? p.time ?? 5);
    C.left = Math.max(0, p.timeLeft ?? p.left ?? C.total);
    C.endT = 0; C.end.set(false);
    C.n.set('×' + n);
    C.b.set(bonus > 0 ? '+' + PCT.format(bonus * 100) + ' % BEUTE' : '');
    const parts = [];
    if (p.credits) parts.push('+' + fmt(p.credits) + ' CR');
    if (p.tritium) parts.push('+' + fmt(p.tritium) + ' T');
    if (p.xp) parts.push('+' + fmt(p.xp) + ' EP');
    if (p.honor) parts.push('+' + fmt(p.honor) + ' EHRE');
    C.l.set(parts.join(' · '));
    C.on.set(true);
    C.popT = 0.22; C.pop.set(false); void C.el.offsetWidth; C.pop.set(true);
  }

  /** Ereignis 'telegraph': { id, kind, delay, x, z, targetId } – Spezialangriff wird aufgeladen. */
  onTelegraph(w, p) {
    if (!p) return;
    if (p.targetId != null && p.targetId !== 'player') return;
    if (p.kind === 'guard') return; // Schildwall ist kein Angriff
    const delay = Math.max(0.2, p.delay ?? p.windup ?? p.time ?? p.t ?? 1.5);
    let W = null;
    for (const o of this.warns) if (p.id != null && o.id === p.id && o.t > 0) { W = o; break; }
    if (!W) { W = this.warns[0]; for (const o of this.warns) if (o.t <= W.t) W = o; }
    W.id = p.id ?? null;
    const e = W.id != null && w && w.entities ? w.entities.get(W.id) : null;
    W.x = typeof p.x === 'number' ? p.x : e ? e.x : 0;
    W.z = typeof p.z === 'number' ? p.z : e ? e.z : 0;
    W.t = delay; W.total = delay; W.tq = -1;
    const label = p.label ? String(p.label).toUpperCase() : TELE[p.kind] || 'SPEZIALANGRIFF';
    W.aKind.set(label); W.mKind.set(label);
  }

  /** Ereignis 'special': Angriff ausgelöst (Warnung zeigt kurz JETZT) oder abgebrochen (Warnung weg). */
  onSpecial(p) {
    if (!p || p.id == null) return;
    for (const W of this.warns) {
      if (W.id !== p.id || W.t <= -0.25) continue;
      if (p.cancelled) W.t = -1;
      else if (W.t > 0) W.t = 0;
    }
  }

  reset() {
    for (const m of this.marks) { m.t = 0; m.id = null; }
    this.kill.t = 0;
    this._recent.clear();
    this.combo.count = 0; this.combo.left = 0; this.combo.endT = 0; this.combo.on.set(false);
    for (const W of this.warns) { W.t = -1; W.id = null; }
  }

  /** topY: Oberkante, unter der die Serie sitzt (Unterkante der Sektor-Anzeige). */
  update(w, r, dt, hidden, wins, topY) {
    this._now += dt;
    const pl = w && w.player;
    if (hidden || !r || !pl || w.docked) { this._hideAll(); return; }
    const W = window.innerWidth, H = window.innerHeight;
    this._updMarks(w, r, dt);
    this._updKill(r, dt);
    this._updCombo(dt, topY);
    this._updWarns(w, r, pl, dt, W, H, wins);
    // alte Einträge der Abschuss-Zuordnung nur selten aufräumen
    if (this._recent.size > 24) for (const [id, t] of this._recent) if (this._now - t > RECENT) this._recent.delete(id);
  }

  _hideAll() {
    for (const m of this.marks) if (m.op !== 0) { m.op = 0; m.el.style.opacity = '0'; }
    if (this.kill.op !== 0) { this.kill.op = 0; this.kill.el.style.opacity = '0'; }
    for (const Wn of this.warns) { Wn.sA.set(false); Wn.sM.set(false); }
  }

  _updMarks(w, r, dt) {
    const ents = w.entities;
    for (let i = 0; i < MARKS; i++) {
      const m = this.marks[i];
      if (m.t <= 0) { if (m.op !== 0) { m.op = 0; m.el.style.opacity = '0'; } continue; }
      m.t -= dt;
      if (m.id != null && ents) {
        const e = ents.get(m.id);
        if (e && e.alive !== false) { m.x = e.x + m.ox; m.z = e.z + m.oz; }
      }
      const s = r.toScreen(m.x, m.z, this._scr);
      if (!s.visible) { if (m.op !== 0) { m.op = 0; m.el.style.opacity = '0'; } continue; }
      const k = clamp01(m.t / m.life);
      const x = Math.round(s.x), y = Math.round(s.y);
      // Einschlag: kurz gespreizt, dann zusammenziehen
      const sc = Math.round((0.8 + k * 0.5) * 20) / 20;
      if (x !== m.tx || y !== m.ty || sc !== m.ts) { m.tx = x; m.ty = y; m.ts = sc; m.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + sc + ')'; }
      const op = Math.round(Math.min(1, k * 2.2) * 10) / 10;
      if (op !== m.op) { m.op = op; m.el.style.opacity = String(op); }
    }
  }

  _updKill(r, dt) {
    const K = this.kill;
    if (K.t <= 0) { if (K.op !== 0) { K.op = 0; K.el.style.opacity = '0'; K.el.classList.remove('on'); } return; }
    K.t -= dt;
    const s = r.toScreen(K.x, K.z, this._scr);
    const x = Math.round(s.x), y = Math.round(s.y);
    if (x !== K.tx || y !== K.ty) { K.tx = x; K.ty = y; K.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; }
    const k = clamp01(K.t / KILL_SECS);
    const op = s.visible ? Math.round(Math.min(1, k * 2.5) * 10) / 10 : 0;
    if (op !== K.op) { K.op = op; K.el.style.opacity = String(op); }
  }

  _updCombo(dt, topY) {
    const C = this.combo;
    const y = Math.round(topY || 48);
    if (y !== C.y) { C.y = y; C.el.style.top = y + 'px'; }
    if (C.popT > 0) { C.popT -= dt; if (C.popT <= 0) C.pop.set(false); }
    if (C.count >= 2) {
      C.left -= dt;
      if (C.left <= 0) {
        // Zeitfenster abgelaufen, ohne dass die Simulation ein Ende gemeldet hat
        C.endT = 1.4; C.end.set(true); C.l.set('SERIE ENDET · ×' + C.count);
        C.count = 0; C.left = 0;
      }
      const q = Math.round(clamp01(C.left / C.total) * 100);
      if (q !== C.bq) { C.bq = q; C.bar.style.transform = 'scaleX(' + q / 100 + ')'; }
      return;
    }
    if (C.endT > 0) {
      C.endT -= dt;
      if (C.endT <= 0) { C.on.set(false); C.end.set(false); }
    }
  }

  _updWarns(w, r, pl, dt, W, H, wins) {
    const ents = w.entities;
    const views = r.views;
    const pv = views && views.get(pl.id);
    const px = pv ? pv.rx : pl.x, pz = pv ? pv.rz : pl.z;
    let cs = null;
    for (let i = 0; i < WARNS; i++) {
      const A = this.warns[i];
      if (A.t <= -0.25) { A.sA.set(false); A.sM.set(false); continue; }
      A.t -= dt;
      if (A.t <= -0.25) { A.sA.set(false); A.sM.set(false); continue; }
      const e = A.id != null && ents ? ents.get(A.id) : null;
      if (A.id != null && (!e || e.alive === false)) { A.t = -1; A.sA.set(false); A.sM.set(false); continue; }
      let ex = A.x, ez = A.z;
      if (e) { const ev = views && views.get(e.id); ex = ev ? ev.rx : e.x; ez = ev ? ev.rz : e.z; A.x = e.x; A.z = e.z; }
      const urgent = A.t < 0.6;
      const tq = Math.max(0, Math.ceil(A.t * 10));
      const txt = tq > 0 ? NF1.format(tq / 10) + ' S' : 'JETZT';
      const t = r.toScreen(ex, ez, this._scr2);
      const inView = t.visible && t.x > 0 && t.x < W && t.y > 0 && t.y < H;
      const covered = inView && !!winAt(wins, t.x, t.y, 4);
      if (inView && !covered) {
        // im Bild: kleines Warnschild über dem Gegner
        A.sA.set(false);
        // über der Zielklammer (gleiche Größenformel wie hud-mid), nie in sie hinein
        const er = e ? ((views && views.get(e.id) && views.get(e.id).vr) || e.radius || 20) : 20;
        const t2 = r.toScreen(ex + er, ez, this._scr);
        let half = Math.abs(t2.x - t.x) * 1.25 + 8;
        half = half < 22 ? 22 : half > 84 ? 84 : half;
        // gewähltes Ziel hat oben/unten schon sein Namensschild (hud-mid): Warnung links neben die Klammer
        const side = e && e.id === pl.targetId;
        const mx = side ? Math.round(t.x - half - 10) : Math.round(t.x), my = side ? Math.round(t.y) : Math.round(t.y - half - 12);
        A.sSide.set(side);
        if (mx !== A.mx || my !== A.my) { A.mx = mx; A.my = my; A.m.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)'; }
        if (tq !== A.tq) { A.tq = tq; A.mT.set(txt); A.aT.set(txt); }
        A.sMU.set(urgent);
        A.sM.set(true);
        continue;
      }
      A.sM.set(false);
      if (!cs) cs = r.toScreen(px, pz, this._scr);
      const cx = cs.x, cy = cs.y;
      // Richtung im Bild: Punkt kurz vor dem Schiff Richtung Angreifer projizieren (berücksichtigt Kameraneigung)
      let ux = A.x - pl.x, uz = A.z - pl.z;
      const wl = Math.hypot(ux, uz) || 1;
      ux /= wl; uz /= wl;
      const q = r.toScreen(px + ux * 60, pz + uz * 60, this._scr2);
      let dx = q.x - cx, dy = q.y - cy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      let ax, ay;
      if (covered) {
        ax = t.x; ay = t.y;
        for (let k = 0; k < 80 && winAt(wins, ax, ay, 22); k++) { ax -= dx * STEP; ay -= dy * STEP; }
      } else {
        const kx = dx > 0 ? (W - EDGE - cx) / dx : dx < 0 ? (EDGE - cx) / dx : Infinity;
        const ky = dy > 0 ? (H - EDGE - cy) / dy : dy < 0 ? (EDGE - cy) / dy : Infinity;
        const k = Math.max(0, Math.min(kx, ky));
        ax = cx + dx * k; ay = cy + dy * k;
        for (let k2 = 0; k2 < 80 && winAt(wins, ax, ay, 22); k2++) { ax -= dx * STEP; ay -= dy * STEP; }
      }
      ax = Math.round(ax); ay = Math.round(ay);
      if (ax !== A.ax || ay !== A.ay) { A.ax = ax; A.ay = ay; A.a.style.transform = 'translate3d(' + ax + 'px,' + ay + 'px,0)'; }
      const ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
      if (ang !== A.aa) {
        A.aa = ang;
        A.svg.style.transform = 'rotate(' + ang + 'deg)';
        // Beschriftung zur Bildmitte hin, nie über den Rand
        const rad = ang * Math.PI / 180;
        A.lab.style.transform = 'translate3d(' + Math.round(-Math.cos(rad) * 62) + 'px,' + Math.round(-Math.sin(rad) * 30) + 'px,0) translate(-50%,-50%)';
      }
      if (tq !== A.tq) { A.tq = tq; A.aT.set(txt); A.mT.set(txt); }
      A.sAU.set(urgent);
      A.sA.set(true);
    }
  }

  dispose() { this.el.remove(); }
}
