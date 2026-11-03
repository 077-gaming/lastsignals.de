// Flug-HUD des 3D-Flugs (Planung/FLUGMODELL.md 11): eine Zeichenfläche über der Spielfläche (Gerätepixel, nur
// Linien und Text, jedes Bild neu). Fadenkreuz (Zielrichtung der Eingabe, im selben Bild wie das Mausereignis),
// Bugmarke, Waffenkreuz (Kardan), Flugbahnmarker, eine Vorhaltemarke, Raketen-Aufschaltung, Treffermarke, Bogen der
// Trefferrichtung, rote Bedrohungsbögen am Rand (Gegner zielt oder lädt auf), Warnung, Kursband, Tempo- und
// Höhenleiter, Schub, Boost, Moduszeile, Horizontleiter (Cockpit), Hinweis „KLICKEN ZUM STEUERN“.
// Stil nach Planung/UI_STIL.md: Haarlinien, Ticks, Versalien, DIN-Schrift, Farbe nur mit Funktion.
import * as THREE from 'three';
import { FACTIONS } from '../core/data.js';
import { MODE } from '../flight/core.js';
import { BOLT_SPEED, HOME_BAND, SECTOR_BAND, BAND_WARN_V } from '../flight/params.js';
import { leadTime } from '../flight/aim.js';
import { keyName } from '../input/bindings.js';
import { PLAYER_RANGE } from '../sim/config.js';

const FONT = '"DIN Condensed", "DIN Alternate", "Avenir Next Condensed", "Arial Narrow", sans-serif';
const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
const RED = '#ff3b30', WARN = '#ffb020', WHITE = 'rgba(255,255,255,0.92)', DIM = 'rgba(255,255,255,0.42)', MID = 'rgba(255,255,255,0.66)';
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const D = Math.PI / 180;

export class HudFlight {
  constructor(parent) {
    const c = this.cv = document.createElement('canvas');
    c.className = 'hf-canvas';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0';
    parent.prepend(c);
    this.g = c.getContext('2d');
    this.input = null; this.bus = null;
    this.hits = [];       // Treffermarken { t, kill, shield }
    this.dirs = [];       // Trefferrichtung { t, a }
    this.on = false;
    this.flash = '';  this.flashT = 0;
    this._dpr = 1; this._w = 0; this._h = 0;
    this.lastAimPx = null;
    // belegte Flächen des Flug-HUD (CSS-px) für die schwebenden Zahlen (hud.js) und Prüfwerkzeuge: Tempoleiter mit
    // Zahl, M/S und Boost-Balken, Höhenanzeige mit Schubbalken
    const Z = () => ({ x0: 0, y0: 0, x1: 0, y1: 0 });
    this.zones = { on: false, speed: Z(), alt: Z(), list: [] };
    this.zones.list.push(this.zones.speed, this.zones.alt);
  }
  setInput(input, bus) {
    this.input = input; this.bus = bus;
    if (this._offs) for (const o of this._offs) o();
    this._offs = [
      bus.on('boltHit', (p) => { if (p && p.player) { this.hits.push({ t: 0, kill: !!p.kill, shield: !!p.shield, crit: !!p.crit }); if (this.hits.length > 6) this.hits.shift(); } }),
      bus.on('damage', (p) => {
        const w = this.input && this.input.world;
        if (!p || !w || p.id !== w.player.id || !((p.hull || 0) + (p.shield || 0))) return;
        if (typeof p.dx === 'number' && typeof p.dz === 'number') { this.dirs.push({ t: 0, x: -p.dx, y: -(p.dy || 0), z: -p.dz }); if (this.dirs.length > 5) this.dirs.shift(); }
      }),
      bus.on('flight', (p) => { if (p && p.msg) { this.flash = p.msg; this.flashT = 1.6; } }),
    ];
  }

  _size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    if (dpr !== this._dpr || W !== this._w || H !== this._h) {
      this._dpr = dpr; this._w = W; this._h = H;
      this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    }
  }
  /** Weltpunkt (Zeichenkoordinaten) → Bildschirm (CSS-px), z > 1 = hinter der Kamera */
  _proj(cam, x, y, z, out) {
    _v.set(x, y, z).project(cam);
    out.x = (_v.x + 1) * 0.5 * this._w; out.y = (1 - _v.y) * 0.5 * this._h; out.z = _v.z;
    out.on = _v.z < 1 && _v.x > -1.2 && _v.x < 1.2 && _v.y > -1.2 && _v.y < 1.2;
    return out;
  }

  update(w, r, dt, hidden) {
    const g = this.g, inp = this.input;
    const show = !hidden && w && r && w.flight3d && !w.docked && !w.playerDead && r.rig && r.rig.k > 0.6 && inp;
    if (!show) { this.zones.on = false; if (this.on) { this._size(); g.clearRect(0, 0, this.cv.width, this.cv.height); this.on = false; } return; }
    this.on = true;
    this._size();
    const dpr = this._dpr, W = this._w, H = this._h;
    { const Zs = this.zones.speed, Za = this.zones.alt; this.zones.on = true;
      Zs.x0 = W / 2 - 246; Zs.x1 = W / 2 - 140; Zs.y0 = H / 2 - 88; Zs.y1 = H / 2 + 98;
      Za.x0 = W / 2 + 146; Za.x1 = W / 2 + 290; Za.y0 = H / 2 - 78; Za.y1 = H / 2 + 98; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'butt'; g.lineJoin = 'miter';
    const cam = r.camera, p = w.player, st = w.fl, fi = inp.fi, A = w.aimInfo;
    const pv = r.views.get(p.id);
    if (!pv) return;
    const yK = r.yK;
    const fac = FACTIONS[w.profile.faction];
    const acc = fac && fac.css ? fac.css.main : '#d8b25a';
    const cock = r.rig.kc > 0.5;
    const ox = pv.rx, oy = pv.root.position.y, oz = pv.rz; // Schiffsort (Zeichenkoordinaten)
    cam.updateMatrixWorld();
    const camP = cam.position;
    // ── Fadenkreuz: Zielrichtung der Eingabe (sofort), weit voraus projiziert ──
    const aim = fi.aim, P0 = { x: 0, y: 0, z: 0, on: false };
    const cx = this._proj(cam, camP.x + aim[0] * 3000, camP.y + aim[1] * 3000 * yK, camP.z + aim[2] * 3000, { x: 0, y: 0, z: 0, on: false });
    // ── Bugmarke: wohin die Nase zeigt ──
    _f.set(0, 0, -1).applyQuaternion(pv.qs);
    const nose = this._proj(cam, ox + _f.x * 3000, oy + _f.y * 3000, oz + _f.z * 3000, { x: 0, y: 0, z: 0, on: false });
    // ── Waffenkreuz: Treffpunkt der Laser auf Konvergenzentfernung (Kardan) ──
    const gim = w.flP.gimbal;
    _c.set(aim[0], aim[1], aim[2]);
    const ang = _c.angleTo(_f);
    if (ang > gim) { _r.crossVectors(_f, _c).normalize(); _q.setFromAxisAngle(_r, gim); _c.copy(_f).applyQuaternion(_q); }
    const conv = A.conv || 500;
    const wx = this._proj(cam, ox + _c.x * conv, oy + _c.y * conv, oz + _c.z * conv, { x: 0, y: 0, z: 0, on: false });
    const inGim = ang <= gim + 0.002;
    // ── Flugbahnmarker ──
    const sp = Math.hypot(st.v[0], st.v[1], st.v[2]);
    let fpm = null;
    if (sp > 15) fpm = this._proj(cam, ox + st.v[0] / sp * 3000, oy + st.v[1] / sp * 3000 * yK, oz + st.v[2] / sp * 3000, { x: 0, y: 0, z: 0, on: false });

    // Horizontleiter (Cockpit, sehr leise)
    if (cock) this._ladder(g, cam, ox, oy, oz, W, H);
    // Nase
    if (nose.on) this._nose(g, nose.x, nose.y);
    if (fpm && fpm.on) this._fpm(g, fpm.x, fpm.y, !st.coupled);
    // Ziel: Vorhaltemarke und Raketen-Aufschaltung
    const tid = p.targetId != null ? p.targetId : A.under;
    const t = tid != null ? w.entities.get(tid) : null;
    let pipHit = false;
    if (t && t.alive !== false && (t.kind === 'enemy' || t.kind === 'player')) {
      const tv = r.views.get(t.id);
      if (tv) {
        const tx = tv.rx, ty = tv.root.position.y, tz = tv.rz;
        const lt = leadTime(t.x - p.x, (t.y || 0) - p.y, t.z - p.z, t.vx || 0, t.vy || 0, t.vz || 0, BOLT_SPEED);
        const d = Math.hypot(t.x - p.x, (t.y || 0) - p.y, t.z - p.z);
        if (lt > 0 && d < PLAYER_RANGE * 1.2) {
          const pip = this._proj(cam, tx + (t.vx || 0) * lt, ty + (t.vy || 0) * lt * yK, tz + (t.vz || 0) * lt, { x: 0, y: 0, z: 0, on: false });
          const tp = this._proj(cam, tx, ty, tz, { x: 0, y: 0, z: 0, on: false });
          if (pip.on) {
            // „auf der Marke“: Waffenkreuz auf der Raute, oder das Fadenkreuz liegt im Waffenkegel der Zielhilfe
            // (dann schwenken die Laser selbst auf die Marke, sim/world3d.js coneAssist)
            const cr = A.coneRad || 0;
            let inCone = false;
            if (cr > 0) { const pd = Math.hypot(t.x + (t.vx || 0) * lt - p.x, (t.y || 0) + (t.vy || 0) * lt - p.y, t.z + (t.vz || 0) * lt - p.z) || 1; inCone = ((t.x + (t.vx || 0) * lt - p.x) * aim[0] + ((t.y || 0) + (t.vy || 0) * lt - p.y) * aim[1] + (t.z + (t.vz || 0) * lt - p.z) * aim[2]) / pd > Math.cos(cr); }
            pipHit = (Math.hypot(pip.x - wx.x, pip.y - wx.y) < 9 || inCone) && inGim;
            this._pip(g, pip.x, pip.y, tp.on ? tp : null, pipHit ? acc : RED, pipHit);
          }
        }
        // Raketen-Aufschaltung: Segmentring schließt sich
        const locking = fi.rmb || (fi.pad && fi.pad.lock);
        if (locking && fi.lockId === t.id || (fi.locked2 && fi.lockId === t.id)) {
          const tp = this._proj(cam, tx, ty, tz, { x: 0, y: 0, z: 0, on: false });
          if (tp.on) this._lockRing(g, tp.x, tp.y, Math.min(1, fi.lockT / 0.8), fi.locked2);
        }
      }
    }
    // Waffenkreuz
    if (wx.on) this._gun(g, wx.x, wx.y, inGim, A.fire, A.reise);
    // Fadenkreuz (immer in der Bildmitte der Zielrichtung)
    if (cx.on) this._cross(g, cx.x, cx.y, pipHit ? acc : WHITE);
    this.lastAimPx = cx;
    // Treffermarke
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      h.t += dt;
      if (h.t > (h.kill ? 0.4 : 0.14)) { this.hits.splice(i, 1); continue; }
      this._hitMark(g, cx.x, cx.y, h.kill ? 1.8 : h.crit ? 1.25 : 1, h.shield ? acc : '#ffffff', 1 - h.t / (h.kill ? 0.4 : 0.14));
    }
    // Trefferrichtung: roter Bogen um die Mitte
    const m = cam.matrixWorld.elements;
    _r.set(m[0], m[1], m[2]); _u.set(m[4], m[5], m[6]);
    for (let i = this.dirs.length - 1; i >= 0; i--) {
      const h = this.dirs[i];
      h.t += dt;
      if (h.t > 0.6) { this.dirs.splice(i, 1); continue; }
      const a = Math.atan2(-(h.x * _u.x + h.y * _u.y + h.z * _u.z), h.x * _r.x + h.y * _r.y + h.z * _r.z);
      this._arc(g, W / 2, H / 2, H * 0.22, a, 0.35, RED, 1 - h.t / 0.6, 3);
    }
    // Bedrohungen: rote Bögen am Rand für Gegner, die zielen oder aufladen; Warnung bei angekündigtem Angriff
    let warn = '';
    for (const e of w.enemies) {
      if (!e.alive || e.targetId !== 'player') continue;
      const charging = e.spPhase === 1, aiming = e.state === 'attack' && e.token;
      if (!charging && !aiming) continue;
      const dx = e.x - p.x, dy = ((e.y || 0) - p.y) * yK, dz = e.z - p.z, dd = Math.hypot(dx, dy, dz);
      if (dd > 1600) continue;
      _w.set(dx, dy, dz).normalize();
      const fwd = -(_w.x * m[8] + _w.y * m[9] + _w.z * m[10]);
      const sx = _w.x * _r.x + _w.y * _r.y + _w.z * _r.z, sy = _w.x * _u.x + _w.y * _u.y + _w.z * _u.z;
      const onScreen = fwd > 0.5 && Math.abs(sx / fwd) < 0.9 && Math.abs(sy / fwd) < 0.55;
      if (charging && (e.spK === 'ram' || e.spK === 'leap' || e.spK === 'volley')) warn = 'WARNUNG · ANGRIFF LÄDT';
      if (onScreen && !charging) continue;
      const a = Math.atan2(-sy, sx);
      this._arc(g, W / 2, H / 2, Math.min(W, H) * 0.44, a, charging ? 0.32 : 0.18, RED, charging ? 0.6 + 0.4 * Math.sin(performance.now() / 70) : 0.7, charging ? 3 : 2);
    }
    // Kursband oben
    this._heading(g, w, p, W, acc);
    // Tempo links, Höhe/Schub rechts, Boost und Modus unten
    this._speed(g, w, st, W / 2 - 150, H / 2, acc);
    this._alt(g, w, p, st, W / 2 + 150, H / 2);
    // Boost links neben der Tempozahl (bei W / 2 − 182 lag die Zahl der Leiter über der Beschriftung BOOST)
    this._boost(g, st, W / 2 - 232, H / 2, acc);
    // Schild und Hülle (Runde 3): im Verfolger ist das Schiffsfenster aus (es lag unter dem eigenen Schiff, das jetzt tiefer
    // im Bild sitzt) – zwei schmale Balken über der Schnellleiste. Im Cockpit stehen sie auf der linken Konsole.
    if (!cock) this._vitals(g, w, p, W, H, acc);
    // Moduszeile über dem Kursband (früher darunter: die Marken des Bands überdeckten den Text)
    this._mode(g, w, st, W / 2, this._tapeY() - 34);
    this._edge(g, w, W, H);
    if (warn) this._center(g, warn, W / 2, H / 2 - 104, RED, 15, 1, true);
    if (st.warn) this._center(g, st.warn, W / 2, H / 2 - 80, WARN, 13, 1, true);
    if (this.flashT > 0) { this.flashT -= dt; this._center(g, this.flash, W / 2, this._tapeY() - 54, this.flash.startsWith('ENT') ? WARN : MID, 14, Math.min(1, this.flashT * 2)); }
    // virtueller Stick
    if ((fi.set.mouse === 'vjoy' || !fi.locked) && !fi.pad?.active && !fi.touch?.active) this._vjoy(g, W / 2, H / 2, H * 0.3, fi.vx, fi.vy);
    if (fi.menuHintAt && performance.now() - fi.menuHintAt < 2500 && inp.menuOpen && inp.menuOpen()) this._center(g, document.querySelector('.lsg-choice') ? 'ERST WÄHLEN: GEFÜHRTER EINSTIEG ODER DIREKT SPIELEN' : 'ERST DAS FENSTER SCHLIESSEN', W / 2, H / 2 + 60, WHITE, 15);
    if (fi.clickHint) this._center(g, 'KLICKEN ZUM STEUERN', W / 2, H / 2 + 60, WHITE, 16, 0.75 + 0.25 * Math.sin(performance.now() / 260));
    if (fi.altFreed) this._center(g, `${keyName('free')} · ZEIGER FREI`, W / 2, H / 2 + 60, MID, 13);
    void P0;
  }

  // ───────── Zeichenbausteine ─────────
  _cross(g, x, y, col) {
    g.strokeStyle = col; g.lineWidth = 1.5;
    const a = 5, b = 14;
    g.beginPath();
    g.moveTo(x - b, y); g.lineTo(x - a, y); g.moveTo(x + a, y); g.lineTo(x + b, y);
    g.moveTo(x, y - b); g.lineTo(x, y - a); g.moveTo(x, y + a); g.lineTo(x, y + b);
    g.stroke();
    g.fillStyle = col; g.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
  }
  _nose(g, x, y) {
    // „W“ aus Linien: zeigt, wohin der Bug wirklich zeigt
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 16, y); g.lineTo(x - 8, y); g.lineTo(x - 4, y + 5); g.lineTo(x, y); g.lineTo(x + 4, y + 5); g.lineTo(x + 8, y); g.lineTo(x + 16, y);
    g.stroke();
  }
  _fpm(g, x, y, dec) {
    g.strokeStyle = dec ? WARN : 'rgba(255,255,255,0.6)'; g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x - 5, y); g.lineTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.closePath();
    g.moveTo(x - 5, y); g.lineTo(x - 13, y); g.moveTo(x + 5, y); g.lineTo(x + 13, y); g.moveTo(x, y - 5); g.lineTo(x, y - 11);
    g.stroke();
  }
  _gun(g, x, y, inGim, fire, reise) {
    g.strokeStyle = reise ? DIM : inGim ? (fire ? '#ffffff' : 'rgba(255,255,255,0.75)') : DIM; g.lineWidth = 1;
    const s = 7;
    g.beginPath();
    g.moveTo(x - s, y - s + 3); g.lineTo(x - s, y - s); g.lineTo(x - s + 3, y - s);
    g.moveTo(x + s - 3, y - s); g.lineTo(x + s, y - s); g.lineTo(x + s, y - s + 3);
    g.moveTo(x + s, y + s - 3); g.lineTo(x + s, y + s); g.lineTo(x + s - 3, y + s);
    g.moveTo(x - s + 3, y + s); g.lineTo(x - s, y + s); g.lineTo(x - s, y + s - 3);
    g.stroke();
  }
  _pip(g, x, y, tp, col, hot) {
    if (tp) { g.strokeStyle = 'rgba(255,59,48,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tp.x, tp.y); g.lineTo(x, y); g.stroke(); }
    g.strokeStyle = col; g.lineWidth = hot ? 2 : 1.4;
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.stroke();
  }
  _lockRing(g, x, y, k, done) {
    g.strokeStyle = done ? RED : 'rgba(255,59,48,0.8)'; g.lineWidth = done ? 2 : 1.4;
    const R = done ? 22 : 34 - 12 * k, n = 8;
    for (let i = 0; i < n; i++) {
      if (i / n > k && !done) continue;
      const a0 = i * Math.PI * 2 / n + 0.12, a1 = a0 + Math.PI * 2 / n - 0.24;
      g.beginPath(); g.arc(x, y, R, a0, a1); g.stroke();
    }
    if (done) this._center(g, 'AUFGESCHALTET', x, y + R + 14, RED, 11);
  }
  _hitMark(g, x, y, s, col, a) {
    g.globalAlpha = Math.max(0, a); g.strokeStyle = col; g.lineWidth = s > 1.5 ? 2.2 : 1.6;
    const i = 9 * s, o = 16 * s;
    g.beginPath();
    g.moveTo(x - i, y - i); g.lineTo(x - o, y - o); g.moveTo(x + i, y - i); g.lineTo(x + o, y - o);
    g.moveTo(x + i, y + i); g.lineTo(x + o, y + o); g.moveTo(x - i, y + i); g.lineTo(x - o, y + o);
    g.stroke(); g.globalAlpha = 1;
  }
  _arc(g, cx, cy, R, a, half, col, alpha, lw) {
    g.globalAlpha = Math.max(0, Math.min(1, alpha)); g.strokeStyle = col; g.lineWidth = lw;
    // aus kurzen Strichen (Messskala), keine weiche Linie
    const n = 7;
    for (let i = 0; i < n; i++) {
      const b0 = a - half + (2 * half) * i / n, b1 = b0 + (2 * half) / n * 0.7;
      g.beginPath(); g.arc(cx, cy, R, b0, b1); g.stroke();
    }
    g.globalAlpha = 1;
  }
  _center(g, text, x, y, col, size, alpha = 1, plate = false) {
    g.globalAlpha = alpha; g.font = `600 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (plate) {
      // Warnungen auf dunkler Tafel mit Kante in der Warnfarbe (Runde 3: „OBERGRENZE · 600 M“ war vor der Sonne unleserlich)
      const tw = g.measureText(text).width, hw = tw / 2 + 12, hh = size * 0.5 + 6, c = 6;
      g.fillStyle = 'rgba(4,6,10,0.8)';
      g.beginPath(); g.moveTo(x - hw + c, y - hh); g.lineTo(x + hw, y - hh); g.lineTo(x + hw, y + hh - c); g.lineTo(x + hw - c, y + hh); g.lineTo(x - hw, y + hh); g.lineTo(x - hw, y - hh + c); g.closePath(); g.fill();
      g.fillStyle = col; g.fillRect(x - hw + c, y - hh, Math.min(32, hw), 2);
    }
    g.fillStyle = col;
    g.fillText(text, x, y); g.globalAlpha = 1; g.textAlign = 'left';
  }
  _tapeY() { return Math.max(124, this._h / 2 - 185); }
  /** Sektorrand: Warnung ab 83 %, jenseits der Grenze schiebt ein Navigationsfeld zurück, ohne Schaden (sim/world3d.js edge3d) */
  _edge(g, w, W, H) {
    const E = w.edge;
    if (!E || !(E.warn || E.out)) return;
    const km = E.d >= 1000 ? `${(E.d / 1000).toFixed(1).replace('.', ',')} KM` : `${Math.max(0, Math.round(E.d / 10) * 10)} M`;
    const where = E.vert ? (E.dir > 0 ? 'OBERGRENZE' : 'UNTERGRENZE') : 'SEKTORRAND';
    const y = H / 2 - 128;
    if (!E.out) { this._center(g, `${where} · ${km}`, W / 2, y, WARN, 14, 1, true); return; }
    this._center(g, `${where} · NAVIGATIONSFELD LENKT ZURÜCK`, W / 2, y, WARN, 15, 0.85 + 0.15 * Math.sin(performance.now() / 160), true);
    this._center(g, E.vert ? (E.dir > 0 ? '▾ SINKEN' : '▴ STEIGEN') : 'KURSBAND ZEIGT DIE GRENZE', W / 2, y + 24, MID, 11, 1, true);
  }
  _heading(g, w, p, W, acc) {
    const y = this._tapeY(), wd = Math.min(420, W * 0.32), x0 = W / 2 - wd / 2;
    const hdg = ((-p.rot / D) % 360 + 360) % 360; // 0° = Sektor-Nord (−z), im Uhrzeigersinn
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y + 10); g.lineTo(x0 + wd, y + 10); g.stroke();
    g.font = `500 10px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const span = 90, k = wd / span;
    for (let d = Math.ceil((hdg - span / 2) / 5) * 5; d <= hdg + span / 2; d += 5) {
      const x = W / 2 + (d - hdg) * k, big = d % 15 === 0;
      g.strokeStyle = big ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)';
      g.beginPath(); g.moveTo(x, y + 10); g.lineTo(x, y + (big ? 2 : 6)); g.stroke();
      if (d % 30 === 0) { g.fillStyle = DIM; const v = ((d % 360) + 360) % 360; g.fillText(v === 0 ? 'N' : v === 90 ? 'O' : v === 180 ? 'S' : v === 270 ? 'W' : String(v).padStart(3, '0'), x, y - 2); }
    }
    // Marken: Station, Tor, Ziel
    const mark = (ex, ez, col) => {
      let b = Math.atan2(ex - p.x, -(ez - p.z)) / D; b = ((b % 360) + 360) % 360;
      let dd = b - hdg; if (dd > 180) dd -= 360; if (dd < -180) dd += 360;
      const x = W / 2 + Math.max(-span / 2, Math.min(span / 2, dd)) * k;
      g.fillStyle = col; g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x - 4, y + 18); g.lineTo(x + 4, y + 18); g.closePath(); g.fill();
    };
    if (w.station) mark(w.station.x, w.station.z, 'rgba(255,255,255,0.7)');
    for (const o of w.portals) mark(o.x, o.z, '#9fe8ff');
    const t = p.targetId != null ? w.entities.get(p.targetId) : null;
    if (t && t.alive !== false) mark(t.x, t.z, RED);
    // nächste seitliche Sektorgrenze (Warnfarbe), sobald die Randwarnung greift
    const E = w.edge;
    if (E && (E.warn || E.out) && !E.vert) {
      let dd = E.dir / D - hdg; dd = ((dd % 360) + 540) % 360 - 180;
      const x = W / 2 + Math.max(-span / 2, Math.min(span / 2, dd)) * k;
      g.strokeStyle = WARN; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 6, y + 22); g.lineTo(x + 6, y + 22); g.moveTo(x, y + 12); g.lineTo(x, y + 22); g.stroke(); g.lineWidth = 1;
    }
    g.fillStyle = WHITE; g.font = `600 13px ${FONT}`;
    g.fillText(String(Math.round(hdg) % 360).padStart(3, '0'), W / 2, y - 14);
    g.strokeStyle = acc; g.beginPath(); g.moveTo(W / 2, y + 1); g.lineTo(W / 2, y + 11); g.stroke();
    g.textAlign = 'left';
  }
  _speed(g, w, st, x, y, acc) {
    const P = w.flP, sp = Math.hypot(st.v[0], st.v[1], st.v[2]);
    const top = st.mode === MODE.REISE ? P.vR : P.vB, h = 150, y0 = y - h / 2;
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke();
    for (let i = 0; i <= 10; i++) { const yy = y0 + h - h * i / 10; g.beginPath(); g.moveTo(x, yy); g.lineTo(x - (i % 5 ? 4 : 8), yy); g.stroke(); }
    const yv = (v) => y0 + h - h * Math.min(1, v / top);
    // Kampf-Grenze, Boost-Bereich schraffiert, Begrenzer als Klammer
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.moveTo(x - 10, yv(P.vK)); g.lineTo(x + 3, yv(P.vK)); g.stroke();
    if (st.mode !== MODE.REISE) { g.strokeStyle = 'rgba(255,176,32,0.35)'; for (let yy = yv(P.vB); yy < yv(P.vK); yy += 4) { g.beginPath(); g.moveTo(x - 3, yy); g.lineTo(x, yy + 3); g.stroke(); } }
    if (Number.isFinite(st.limiter)) { const yl = yv(st.limiter); g.strokeStyle = acc; g.beginPath(); g.moveTo(x + 2, yl - 4); g.lineTo(x + 6, yl); g.lineTo(x + 2, yl + 4); g.stroke(); }
    if (st.cruise) { const yc = yv(st.cruiseV); g.strokeStyle = '#9fe8ff'; g.beginPath(); g.moveTo(x - 12, yc); g.lineTo(x - 6, yc); g.stroke(); }
    const ys = yv(sp);
    g.fillStyle = st.boostOn ? WARN : WHITE; g.beginPath(); g.moveTo(x + 1, ys); g.lineTo(x + 7, ys - 4); g.lineTo(x + 7, ys + 4); g.closePath(); g.fill();
    g.font = `600 22px ${FONT}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(String(Math.round(sp)), x - 14, ys);
    g.font = `500 10px ${MONO}`; g.fillStyle = DIM; g.fillText('M/S', x - 14, ys + 15);
    g.textAlign = 'left';
  }
  _alt(g, w, p, st, x, y) {
    const h = 150, y0 = y - h / 2;
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + h); g.stroke();
    // Schub je Achse (sechs kleine Balken): vor/rück, seitlich, senkrecht
    const thr = st.thr, bars = [thr[4] - thr[5], thr[0] - thr[1], thr[2] - thr[3]];
    for (let i = 0; i < 3; i++) {
      const bx = x + 8 + i * 9, v = Math.max(-1, Math.min(1, bars[i]));
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.strokeRect(bx, y0 + 30, 5, 60);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      if (v >= 0) g.fillRect(bx, y0 + 60 - 30 * v, 5, 30 * v); else g.fillRect(bx, y0 + 60, 5, -30 * v);
    }
    g.font = `600 13px ${FONT}`; g.fillStyle = WHITE; g.textBaseline = 'middle'; g.textAlign = 'left';
    const lab = st.landing && Number.isFinite(st.alt) ? `GRUND ${Math.round(st.alt)}` : `EBENE ${p.y >= 0 ? '+' : '−'}${Math.abs(Math.round(p.y))}`;
    g.fillText(lab, x + 38, y - 6);
    g.font = `500 10px ${MONO}`; g.fillStyle = DIM;
    const vs = st.v[1];
    g.fillText(`${vs >= 0 ? '▴' : '▾'} ${Math.abs(Math.round(vs))} M/S`, x + 38, y + 10);
    const band = (w.sector && w.sector.index) === 1 ? HOME_BAND : SECTOR_BAND;
    if (Math.abs(p.y) > band * BAND_WARN_V) { const t = `GRENZE ${p.y >= 0 ? '+' : '−'}${band}`; g.font = `600 11px ${FONT}`; g.fillStyle = 'rgba(4,6,10,0.8)'; g.fillRect(x + 34, y + 18, g.measureText(t).width + 8, 16); g.fillStyle = WARN; g.fillText(t, x + 38, y + 26); }
  }
  _vitals(g, w, p, W, H, acc) {
    const now = performance.now();
    if (!this._vT || now - this._vT > 400) {
      // Lage aus den Fenstern (selten gemessen): nur zeichnen, wenn das Schiffsfenster aus ist; über der Schnellleiste
      this._vT = now;
      const sw = document.querySelector('[data-win="ship"]'), qb = document.querySelector('[data-win="quick"]');
      this._vOn = !sw || sw.classList.contains('is-off');
      const r = qb && !qb.classList.contains('is-off') ? qb.getBoundingClientRect() : null;
      let top = r && r.height ? r.top : H - 14;
      // Kontext-Knöpfe über der Schnellleiste (ANDOCKEN, SPRINGEN): darüber ausweichen
      for (const x of document.querySelectorAll('.hx')) { if (x.classList.contains('hd-hide')) continue; const b = x.getBoundingClientRect(); if (b.width && b.left < W / 2 + 220 && b.right > W / 2 - 220 && b.bottom > top - 40) top = Math.min(top, b.top); }
      this._vY = top - 30;
      if (this.zones) { const Zv = this.zones.vit || (this.zones.vit = { x0: 0, y0: 0, x1: 0, y1: 0 }); if (!this.zones.list.includes(Zv)) this.zones.list.push(Zv); }
    }
    const Zv = this.zones && this.zones.vit;
    if (!this._vOn) { if (Zv) { Zv.x0 = Zv.x1 = Zv.y0 = Zv.y1 = -9; } return; }
    const y = this._vY, bw = Math.min(170, W * 0.13), gap = 34, n = 20, sw = bw / n;
    if (Zv) { Zv.x0 = W / 2 - gap / 2 - bw - 60; Zv.x1 = W / 2 + gap / 2 + bw + 60; Zv.y0 = y - 16; Zv.y1 = y + 10; }
    const sh = p.shieldMax ? Math.max(0, Math.min(1, p.shield / p.shieldMax)) : 0, hu = p.hpMax ? Math.max(0, Math.min(1, p.hp / p.hpMax)) : 0;
    const row = (x0, f, col, label, val, right) => {
      const k = Math.round(f * n);
      for (let i = 0; i < n; i++) {
        const j = right ? i : n - 1 - i; // Schild füllt von der Mitte nach links, Hülle von der Mitte nach rechts
        g.fillStyle = i < k ? col : 'rgba(255,255,255,0.1)';
        g.fillRect(x0 + j * sw, y, sw - 2, 6);
      }
      g.font = `600 11px ${FONT}`; g.textBaseline = 'alphabetic'; g.fillStyle = DIM;
      g.textAlign = right ? 'left' : 'right'; g.fillText(label, right ? x0 : x0 + bw, y - 5);
      g.font = `500 11px ${MONO}`; g.fillStyle = col === RED ? RED : MID; g.textAlign = right ? 'right' : 'left';
      g.fillText(val, right ? x0 + bw : x0, y - 5); g.textAlign = 'left';
    };
    row(W / 2 - gap / 2 - bw, sh, acc, 'SCHILD', `${Math.round(sh * 100)} %`, false);
    row(W / 2 + gap / 2, hu, hu < 0.3 ? RED : 'rgba(255,255,255,0.88)', 'HÜLLE', `${Math.round(hu * 100)} %`, true);
  }
  _boost(g, st, x, y, acc) {
    // senkrecht links neben der Tempoleiter, 16 Segmente, gesperrt in Warnfarbe
    const n = 16, h = 150, sh = h / n, y0 = y - h / 2;
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / n <= st.boost + 1e-6;
      g.fillStyle = f ? (st.boostLock ? WARN : st.boostOn ? '#ffffff' : acc) : 'rgba(255,255,255,0.1)';
      g.fillRect(x, y0 + h - (i + 1) * sh + 1, 3, sh - 2);
    }
    g.save(); g.translate(x - 6, y0 + h); g.rotate(-Math.PI / 2);
    g.font = `500 9px ${MONO}`; g.fillStyle = st.boostLock ? WARN : DIM; g.textBaseline = 'middle';
    g.fillText(st.boostLock ? 'BOOST GESPERRT' : 'BOOST', 0, 0); g.restore();
  }
  _mode(g, w, st, x, y) {
    const parts = [];
    const modeName = st.mode === MODE.REISE ? 'REISE' : st.mode === MODE.LANDUNG ? 'LANDUNG' : 'KAMPF';
    parts.push(st.modeT > 0 ? `${['KAMPF', 'REISE', 'LANDUNG'][st.modeWant]} ${st.modeT.toFixed(1).replace('.', ',')} S` : modeName);
    parts.push(st.coupled ? 'GEKOPPELT' : 'ENTKOPPELT');
    if (Number.isFinite(st.limiter)) parts.push(`BEGR ${Math.round(st.limiter)}`);
    if (st.cruise) parts.push(`TEMPOMAT ${Math.round(st.cruiseV)}`);
    if (st.landing) parts.push(`FAHRWERK ${Math.round(st.gear * 100)} %`);
    if (st.landed) parts.push('GELANDET');
    if (w.player.attacking) parts.push('FEUERLEITRECHNER');
    if (w.player.hasMove) parts.push(w.homing ? 'AUTOPILOT · STATION' : 'AUTOPILOT');
    g.font = `500 10px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = parts.join(' · ');
    g.fillStyle = !st.coupled ? WARN : DIM;
    g.fillText(txt, x, y); g.textAlign = 'left';
  }
  _vjoy(g, x, y, R, vx, vy) {
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, R * 0.06, 0, Math.PI * 2); g.stroke();
    const px = x + vx * R, py = y + vy * R;
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(x, y); g.lineTo(px, py); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(px - 2, py - 2, 4, 4);
  }
  _ladder(g, cam, ox, oy, oz, W, H) {
    // Horizont gegen die Sektorebene, Leiter alle 10° (Projektion von Punkten weit voraus in Gierrichtung)
    const m = cam.matrixWorld.elements;
    let fx = -m[8], fz = -m[10];
    const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    g.lineWidth = 1;
    for (let deg = -60; deg <= 60; deg += 10) {
      const a = deg * D, R = 5000;
      const c = { x: 0, y: 0, z: 0, on: false };
      this._proj(cam, ox + fx * Math.cos(a) * R, oy + Math.sin(a) * R, oz + fz * Math.cos(a) * R, c);
      if (!c.on) continue;
      const rx = -fz, rz = fx;
      const c2 = { x: 0, y: 0, z: 0, on: false };
      this._proj(cam, ox + fx * Math.cos(a) * R + rx * 400, oy + Math.sin(a) * R, oz + fz * Math.cos(a) * R + rz * 400, c2);
      const dx = c2.x - c.x, dy = c2.y - c.y, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
      const len = deg === 0 ? 130 : 46, gap = deg === 0 ? 40 : 22;
      g.strokeStyle = deg === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.moveTo(c.x - ux * (gap + len), c.y - uy * (gap + len)); g.lineTo(c.x - ux * gap, c.y - uy * gap);
      g.moveTo(c.x + ux * gap, c.y + uy * gap); g.lineTo(c.x + ux * (gap + len), c.y + uy * (gap + len));
      g.stroke();
      if (deg) { g.fillStyle = 'rgba(255,255,255,0.3)'; g.font = `500 9px ${MONO}`; g.fillText(String(deg), c.x + ux * (gap + len + 4), c.y + uy * (gap + len + 4)); }
    }
    void W; void H;
  }
  dispose() { if (this._offs) for (const o of this._offs) o(); this.cv.remove(); }
}
