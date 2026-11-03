// Controller im Flug (Verfolger, Cockpit, Taktisch). Belegung: Planung/CONTROLLER.md.
// Die Befehle selbst liegen in input.js (dieselben Wege wie Tastatur und Touch); hier wird nur übersetzt:
//   linker Stick lenken (taktisch: bildbezogen fliegen) · RT Schub stufenlos · LT bremsen · L3 Dauerschub (wie W)
//   rechter Stick Kamera (Verfolger schwenken, Cockpit umsehen, taktisch Zoom) · R3 Kamerawechsel (V)
//   A Angriff an/aus · X Rakete · Y Kontext (Andocken/Springen/Beute, wie E/J), Y halten = Autopilot (H)
//   B Angriff aus → Ziel lösen → Kurs abbrechen · LB/RB voriges/nächstes Ziel (wie TAB)
//   Steuerkreuz ◂▸ Schnellleisten-Platz wählen, ▴▾ Leiste wechseln, RB+A gewählten Platz auslösen
//   MENU Bordmenü (Esc) · VIEW Karte ein/aus
// Vibration: Treffer am eigenen Schiff, Explosionen in der Nähe, eigener Raketenstart (abschaltbar).
// Den Controller nutzt der Flug nur, solange keine Ebene offen ist (Bordmenü, Station, Dialog, Abschuss, Arsenal) –
// dann übernimmt die Menü-Navigation (padnav.js).
import { pad, BTN, padSettings } from './gamepad.js';
import { topModal, synth } from './padnav.js';
import { EDGE, aimAxes } from '../flight/core.js';
import { BOLT_SPEED } from '../flight/params.js';
import { leadTime, assist } from '../flight/aim.js';
import { flightSettings } from './flightsettings.js';

// 3D-Flug (Planung/FLUGMODELL.md 5.3): rechter Stick bewegt die Zielrichtung im Lenkkegel (wie die Maus), Schiff folgt
const AIM_RATE = 160;      // °/s Zielrichtung bei vollem Ausschlag (Empfindlichkeit 1), Modus „Zielrichtung“
const AIM_LEAD = 1.25;     // … höchstens 1,25 × Schiffsdrehrate
const PAD_LEAD = 1.1;      // … und höchstens 1,1 × Drehrate/Kp vor dem Bug (S1 8,7°, S8 7,7°): gerade genug für volle Drehrate
const HOLD = 0.6;          // s: X halten = Kopplung, MENU halten = KAMPF/REISE, L3 halten = Landemodus
const HOLD_B = 0.35;       // s: B halten = Raumbremse
const HOLD_R3 = 0.3;       // s: R3 halten = umsehen
const D = Math.PI / 180;

const HOLD_Y = 0.55;       // s: Y halten = Autopilot zur Station
const CHORD_RB = 0.45;     // s: RB länger gehalten ohne A = kein Zielwechsel beim Loslassen

export class PadFlight {
  constructor(input, hud, bus) {
    this.input = input; this.hud = hud; this.bus = bus;
    this.state = { active: false, lx: 0, ly: 0, lt: 0, rt: 0, sens: 1 };
    input.pad = this.state;
    // Zustand für den Steuerrahmen des 3D-Flugs (input/flightinput.js liest ihn je Bild)
    this.fl = { active: false, tx: 0, ty: 0, tz: 0, rr: 0, fire: false, boost: false, brake: false, precise: false, lock: false, edge: 0, rateMode: false, rp: 0, ry: 0, aimInput: false };
    input.fi.pad = this.fl;
    this._boost = false; this._xHold = false; this._mHold = false; this._l3Hold = false; this._r3Look = false;
    this._pip = null; this._pipT = 0;
    this._modalT = 0; this._modal = null;
    this._yHome = false; this._rbChord = false; this._rbLast = 0;
    this._look = false;
    pad.flight = (p, dt) => this.frame(p, dt);
    pad.flightOff = () => this._release();
    this.offs = [
      bus.on('damage', (e) => {
        const pl = input.world.player;
        if (!e || !pl || e.id !== pl.id) return;
        const dmg = (e.hull || 0) + (e.shield || 0);
        const k = Math.max(0.15, Math.min(1, dmg / (((pl.hpMax || 1000) + (pl.shieldMax || 0)) * 0.05)));
        pad.rumble(e.hull > 0 ? 0.25 + 0.6 * k : 0.1 + 0.3 * k, 0.35 + 0.5 * k, e.crit ? 220 : 120);
      }),
      bus.on('explode', (e) => {
        if (!e || e.id === input.world.player?.id) return;
        const pl = input.world.player;
        if (!pl) return;
        // räumlicher Abstand (3D-Flug): Explosionen 800 m über dem Spieler rumpeln nicht mehr wie nebenan
        const ent = e.y == null && input.world.entities ? input.world.entities.get(e.id) : null;
        const ey = e.y != null ? e.y : ent ? ent.y || 0 : pl.y || 0;
        const d = Math.hypot(e.x - pl.x, e.z - pl.z, input.world.flight3d ? ey - (pl.y || 0) : 0);
        if (d > 900) return;
        const k = Math.min(1, (e.size || 1) * 0.35) * (1 - d / 900);
        if (k > 0.06) pad.rumble(0.7 * k, 0.4 * k, 160 + 200 * k);
      }),
      bus.on('rocket', (e) => { if (e && e.from === 'player') pad.rumble(0.12, 0.45, 90); }),
      bus.on('playerDead', () => pad.rumble(1, 1, 600)),
      // eigener Bolzentreffer: kurzes leichtes Rumpeln (Rückmeldung beim Handzielen)
      bus.on('boltHit', (e) => { if (e && e.player && this.fl.active) pad.rumble(e.kill ? 0.5 : 0.05, e.kill ? 0.6 : 0.22, e.kill ? 160 : 40); }),
    ];
  }

  /** Gehört der Controller gerade dem Flug? (keine Ebene offen, nicht angedockt, nicht abgeschossen) */
  owns(dt) {
    const w = this.input.world;
    if (!w || !w.player || w.docked || w.playerDead || (this.hud && this.hud._menuOpen)) return false;
    this._modalT -= dt;
    if (this._modalT <= 0) { this._modalT = 0.12; this._modal = topModal(); }
    return !this._modal;
  }

  frame(p, dt) {
    const st = this.state;
    if (!this.owns(dt)) { this._release(); return false; }
    if (this.input.flight3d) return this.frame3d(p, dt);
    this.fl.active = false;
    const inp = this.input, r = inp.renderer, set = padSettings();
    st.active = p.mode === 'pad';
    st.lx = p.lx; st.ly = p.ly; st.lt = p.lt; st.rt = p.rt; st.sens = set.sens;

    // Kamera (rechter Stick)
    const rig = r && r.rig;
    if (rig && st.active) {
      const rx = p.rx, ry = set.invertY ? -p.ry : p.ry, on = Math.abs(rx) + Math.abs(ry) > 0;
      const view = r.viewMode;
      if (view === 'cockpit') {
        if (on) { rig.looking = true; rig.lookBy(rx * 900 * set.sens * dt, ry * 650 * set.sens * dt); this._look = true; }
        else if (this._look) { rig.looking = false; this._look = false; }
      } else if (view === 'chase') {
        if (on) {
          const k = 1 - Math.exp(-dt * 10);
          rig.lookYaw += (-rx * 2.3 - rig.lookYaw) * k;
          rig.lookPitch += (-ry * 0.5 - rig.lookPitch) * k;
          rig.looking = true; this._look = true;
        } else if (this._look) { rig.looking = false; this._look = false; }
      } else {
        if (this._look) { rig.looking = false; this._look = false; }
        if (Math.abs(ry) > 0.05 && r.setZoom) r.setZoom(ry * 900 * dt);
      }
    }

    // Tasten
    const bar = this.hud && this.hud.bar;
    if (p.pressed(BTN.RB)) this._rbChord = false;
    if (p.pressed(BTN.A)) {
      if (p.isDown(BTN.RB) && bar) { this._rbChord = true; bar.padFire(); }
      else inp.attack();
    }
    // RB allein (kurz) = nächstes Ziel beim Loslassen; RB gehalten + A = Schnellleisten-Platz
    if (p.released(BTN.RB) && !this._rbChord && this._rbLast < CHORD_RB) inp.cycleTarget(1);
    this._rbLast = p.held[BTN.RB];
    if (p.pressed(BTN.LB)) inp.cycleTarget(-1);
    if (p.pressed(BTN.X)) inp.rocket();
    if (p.pressed(BTN.B)) inp.cancel();
    if (p.pressed(BTN.Y)) this._yHome = false;
    if (p.isDown(BTN.Y) && !this._yHome && p.heldFor(BTN.Y) >= HOLD_Y) { this._yHome = true; inp.home(); pad.rumble(0, 0.3, 60); }
    if (p.released(BTN.Y) && !this._yHome) inp.context();
    if (p.pressed(BTN.L3)) {
      inp.cruise = !inp.cruise; inp.steerTimer = 0;
      this.hud?._pushMsg?.({ text: inp.cruise ? 'DAUERSCHUB AN · LT ODER B BEENDET' : 'DAUERSCHUB AUS', kind: 'info', terse: true });
    }
    if (p.pressed(BTN.R3)) inp.toggleCamera();
    if (p.pressed(BTN.MENU)) synth('Escape');
    if (p.pressed(BTN.VIEW) && this.hud && this.hud.wins) this.hud.wins.toggleHidden('map');
    if (bar) {
      if (p.pressed(BTN.LEFT)) bar.padMove(-1);
      if (p.pressed(BTN.RIGHT)) bar.padMove(1);
      if (p.pressed(BTN.UP)) bar.setBar(bar.cur - 1);
      if (p.pressed(BTN.DOWN)) bar.setBar(bar.cur + 1);
    }
    if (p.lt > 0.3 && inp.cruise) inp.cruise = false;
    return true;
  }

  /** Controller im 3D-Flug (Verfolger, Cockpit): Belegung Planung/FLUGMODELL.md 5.3 */
  frame3d(p, dt) {
    const st = this.state, F = this.fl, inp = this.input, fi = inp.fi, w = inp.world, r = inp.renderer, set = padSettings(), fs = flightSettings();
    st.active = p.mode === 'pad'; st.lx = st.ly = st.lt = st.rt = 0;
    F.active = st.active;
    if (!F.active) { this._release(); return true; }
    // Loslass-Befehle nur für Tasten, die im 3D-Flug gedrückt wurden (sonst löste z. B. R3 beim Wechsel aus der
    // Taktik doppelt aus: Druck in der Taktik, Loslassen im 3D-Flug)
    const own = this._own3 || (this._own3 = new Set());
    for (const b of [BTN.R3, BTN.B, BTN.X, BTN.Y, BTN.L3, BTN.MENU]) if (p.pressed(b)) own.add(b);
    const rel = (b) => { if (!p.released(b)) return false; const o = own.has(b); own.delete(b); return o; };
    const both = p.isDown(BTN.LB) && p.isDown(BTN.RB);
    // Linker Stick: Schub vor/zurück, seitlich; LB + RB zusammen: ↕ hoch/runter (Schwebemodus)
    F.tx = p.lx;
    F.tz = both ? 0 : -p.ly;
    F.ty = both ? -p.ly : 0;
    F.rr = both ? 0 : (p.isDown(BTN.LB) ? 1 : 0) - (p.isDown(BTN.RB) ? 1 : 0);
    // L3: Boost (wie Sprinten, bleibt an, bis der Schub endet, der Vorrat leer ist oder L3 erneut), halten: Landemodus
    if (p.pressed(BTN.L3)) this._l3Hold = false;
    if (p.isDown(BTN.L3) && !this._l3Hold && p.heldFor(BTN.L3) >= HOLD) { this._l3Hold = true; F.edge |= EDGE.LAND; pad.rumble(0, 0.3, 60); }
    if (rel(BTN.L3) && !this._l3Hold) this._boost = !this._boost;
    if (this._boost && (F.tz < 0.1 || w.fl.boostLock)) this._boost = false;
    F.boost = this._boost;
    // Feuern, Präzision, Raketen-Aufschaltung
    F.fire = p.rt > 0.15;
    F.precise = p.lt > 0.3;
    F.lock = F.precise;
    const rig = r && r.rig;
    if (rig) rig.precise = (rig.precise || 0) + ((F.precise ? 1 : 0) - (rig.precise || 0)) * (1 - Math.exp(-dt * 10));
    // Rechter Stick: Zielen (Zielrichtung im Kegel) oder Drehraten; R3 halten: umsehen
    const rx = p.rx, ry = set.invertY ? -p.ry : p.ry;
    const mag = Math.hypot(rx, ry);
    if (p.pressed(BTN.R3)) this._r3Look = false;
    if (p.isDown(BTN.R3) && p.heldFor(BTN.R3) >= HOLD_R3) {
      this._r3Look = true;
      if (rig) { rig.looking = true; rig.lookBy(rx * 900 * set.sens * dt, ry * 650 * set.sens * dt); }
      F.aimInput = false; F.rp = F.ry = 0;
    } else {
      if (this._r3Look && rig) { rig.looking = false; }
      if (rel(BTN.R3) && !this._r3Look) inp.toggleCamera();
      if (p.released(BTN.R3)) this._r3Look = false;
      F.aimInput = mag > 0.02;
      F.rateMode = fs.padMode === 'rate';
      const sens = set.sens * (F.precise ? 0.6 : 1);
      // Zielhilfe: Zielbremse und Mitnahme der Vorhaltemarke, nur mit Stickeingabe (FLUGMODELL.md 5.3)
      const A = this._assist(w, fi, dt, mag, F.precise, rx, ry);
      if (F.rateMode) {
        // Drehraten (Wahl in den Einstellungen; Standard ist „Zielrichtung“): Stick = Schiffsdrehrate, Fadenkreuz = Bug,
        // nichts läuft voraus. Nach dem Loslassen dreht das Schiff nur seinen Bremsweg nach (S1 ω²/2α ≈ 9°), wie im
        // Zielrichtungs-Modus mit kurzem Vorlauf.
        // Zielhilfe: Zielbremse auf die Stickrate, Mitnahme als zusätzliche Drehrate zur Vorhaltemarke hin.
        F.rp = -ry * sens * A.brake; F.ry = -rx * sens * A.brake;
        if (A.follow > 0 && this._pipDir && w.fl) {
          const q = w.fl.q, b = this._bv || (this._bv = new Float64Array(3)), d = this._pipDir;
          // Marke im Körper (q⁻¹ · d): Nicken + nach oben, Gieren + nach links
          const x = d[0], y = d[1], z = d[2], qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
          const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
          b[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy; b[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz; b[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
          const ep = Math.atan2(b[1], -b[2]), ey = Math.atan2(-b[0], -b[2]), el = Math.hypot(ep, ey);
          const cr = w.flP.rate || 1;
          if (el > 1e-4) { const k = Math.min(A.follow, el * 6) / cr; F.rp += ep / el * k; F.ry += ey / el * k; }
        }
      } else if (mag > 0.0) {
        // Zielrichtung im Kegel: höchstens 25 % schneller als das Schiff dreht, damit das Fadenkreuz nicht wegläuft
        // und das Schiff nach dem Loslassen kaum nachdreht (früher 160 °/s gegen 28–95 °/s Schiffsdrehrate)
        const rate = Math.min(AIM_RATE * sens, (w.flP.rate / D) * AIM_LEAD * sens) * A.brake;  // °/s
        const px = (rx * rate * dt) / (fi.set.sens), py = (ry * rate * dt) / (fi.set.sens);
        fi.turnAim(px, py * (fi.set.invertY ? -1 : 1));
        if (A.follow > 0 && this._pipDir) fi.turnToward(this._pipDir, A.follow * dt);
        // Vorlauf des Fadenkreuzes am Controller kurz (gerade so viel, dass der Nasenregler volle Drehrate gibt): kleine
        // Korrekturen sofort, lange Kurven mit voller Rate – nach dem Loslassen dreht das Schiff nur diesen Vorlauf nach
        // (früher lief das Fadenkreuz bis an den 30°-Lenkkegel voraus)
        fi.clampAimTo(PAD_LEAD * w.flP.rate / (w.flP.kp || 1));
      }
    }
    // Tasten
    const bar = this.hud && this.hud.bar;
    if (p.pressed(BTN.A)) fi.targetUnderAim();
    if (p.pressed(BTN.B)) this._bT = 0;
    F.brake = p.isDown(BTN.B) && p.heldFor(BTN.B) >= HOLD_B;
    if (p.released(BTN.B) && own.has(BTN.B)) { own.delete(BTN.B); if (this._bHeld < HOLD_B) inp.cancel(); }
    this._bHeld = p.isDown(BTN.B) ? p.heldFor(BTN.B) : this._bHeld;
    if (p.pressed(BTN.X)) this._xHold = false;
    if (p.isDown(BTN.X) && !this._xHold && p.heldFor(BTN.X) >= HOLD) { this._xHold = true; F.edge |= EDGE.COUPLE; pad.rumble(0.2, 0.2, 80); }
    if (rel(BTN.X) && !this._xHold) {
      // LT gehalten und aufgeschaltet: auf das aufgeschaltete Ziel, sonst auf das aktuelle
      if (fi.locked2 && fi.lockId) w.setTarget(fi.lockId);
      inp.rocket();
    }
    if (p.pressed(BTN.Y)) this._yHome = false;
    if (p.isDown(BTN.Y) && !this._yHome && p.heldFor(BTN.Y) >= HOLD_Y) { this._yHome = true; inp.home(); pad.rumble(0, 0.3, 60); }
    if (rel(BTN.Y) && !this._yHome) inp.context();
    if (p.pressed(BTN.MENU)) this._mHold = false;
    if (p.isDown(BTN.MENU) && !this._mHold && p.heldFor(BTN.MENU) >= HOLD) { this._mHold = true; F.edge |= EDGE.MODE; pad.rumble(0, 0.3, 60); }
    if (rel(BTN.MENU) && !this._mHold) synth('Escape');
    if (p.pressed(BTN.VIEW) && this.hud && this.hud.wins) this.hud.wins.toggleHidden('map');
    if (bar) {
      // Schnellleiste ohne Tastenkombination: ◂▸ Platz wählen, ▴ auslösen, ▾ nächste Leiste
      if (p.pressed(BTN.LEFT)) bar.padMove(-1);
      if (p.pressed(BTN.RIGHT)) bar.padMove(1);
      if (p.pressed(BTN.UP)) bar.padFire();
      if (p.pressed(BTN.DOWN)) bar.setBar(bar.cur + 1);
    }
    return true;
  }

  /** Zielhilfe je Bild: Winkel Fadenkreuz → Vorhaltemarke, deren Winkelgeschwindigkeit → { brake, follow } */
  _assist(w, fi, dt, stick, precise, sx = 0, sy = 0) {
    const p = w.player, id = p.targetId != null ? p.targetId : w.aimInfo.under;
    const t = id != null ? w.entities.get(id) : null;
    const lvl = flightSettings().assist;
    if (!t || t.alive === false || !lvl) { this._pipDir = null; this._hadPip = false; return assist(0, false, 1, 0, 0, 0, 1); }
    const rx = t.x - p.x, ry = (t.y || 0) - p.y, rz = t.z - p.z;
    const lt = leadTime(rx, ry, rz, t.vx || 0, t.vy || 0, t.vz || 0, BOLT_SPEED);
    if (lt <= 0) { this._pipDir = null; this._hadPip = false; return assist(0, false, 1, 0, 0, 0, 1); }
    let dx = rx + (t.vx || 0) * lt, dy = ry + (t.vy || 0) * lt, dz = rz + (t.vz || 0) * lt;
    const d = Math.hypot(dx, dy, dz) || 1; dx /= d; dy /= d; dz /= d;
    // Winkelgeschwindigkeit der Marke aus dem letzten Bild
    const last = this._last || (this._last = new Float64Array(3));
    const had = this._hadPip;
    const pipRate = had ? Math.acos(Math.min(1, last[0] * dx + last[1] * dy + last[2] * dz)) / Math.max(1e-3, dt) : 0;
    last[0] = dx; last[1] = dy; last[2] = dz; this._hadPip = true;
    this._pipDir = last;
    const a = fi.aim, ca = a[0] * dx + a[1] * dy + a[2] * dz, err = Math.acos(Math.min(1, ca));
    const pvp = t.kind === 'player';
    // Stickrichtung gegen die Richtung zur Marke (in der Bildebene der Zielrichtung): Weg vom Ziel bremst nicht
    let toward = 1;
    if (stick > 0.02 && w.fl) {
      const R = this._ar || (this._ar = new Float64Array(3)), U = this._au || (this._au = new Float64Array(3));
      aimAxes(w.fl, R, U);
      const inv = fi.set.invertY ? -1 : 1;
      const mx = R[0] * sx - U[0] * sy * inv, my = R[1] * sx - U[1] * sy * inv, mz = R[2] * sx - U[2] * sy * inv;
      const tx = dx - a[0] * ca, ty = dy - a[1] * ca, tz = dz - a[2] * ca;
      const ml = Math.hypot(mx, my, mz), tl = Math.hypot(tx, ty, tz);
      if (ml > 1e-6 && tl > 1e-6) toward = (mx * tx + my * ty + mz * tz) / (ml * tl);
    }
    return assist(lvl, pvp, err, pipRate, stick, Math.atan((t.radius || 20) / d), w.flP.rate * (precise ? 0.6 : 1), toward);
  }

  _release() {
    const st = this.state;
    st.active = false; st.lx = st.ly = st.lt = st.rt = 0;
    const F = this.fl;
    if (F) { F.active = false; F.tx = F.ty = F.tz = F.rr = 0; F.fire = F.boost = F.brake = F.precise = F.lock = false; F.aimInput = false; this._boost = false; }
    if (this._look && this.input.renderer && this.input.renderer.rig) { this.input.renderer.rig.looking = false; this._look = false; }
  }

  dispose() {
    if (pad.flight) pad.flight = null;
    pad.flightOff = null;
    this._release();
    this.input.pad = null;
    for (const off of this.offs) off();
    this.offs.length = 0;
  }
}
