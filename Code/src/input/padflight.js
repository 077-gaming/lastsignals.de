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

const HOLD_Y = 0.55;       // s: Y halten = Autopilot zur Station
const CHORD_RB = 0.45;     // s: RB länger gehalten ohne A = kein Zielwechsel beim Loslassen

export class PadFlight {
  constructor(input, hud, bus) {
    this.input = input; this.hud = hud; this.bus = bus;
    this.state = { active: false, lx: 0, ly: 0, lt: 0, rt: 0, sens: 1 };
    input.pad = this.state;
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
        const d = Math.hypot(e.x - pl.x, e.z - pl.z);
        if (d > 900) return;
        const k = Math.min(1, (e.size || 1) * 0.35) * (1 - d / 900);
        if (k > 0.06) pad.rumble(0.7 * k, 0.4 * k, 160 + 200 * k);
      }),
      bus.on('rocket', (e) => { if (e && e.from === 'player') pad.rumble(0.12, 0.45, 90); }),
      bus.on('playerDead', () => pad.rumble(1, 1, 600)),
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

  _release() {
    const st = this.state;
    st.active = false; st.lx = st.ly = st.lt = st.rt = 0;
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
