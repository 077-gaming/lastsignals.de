// Eingabe im 3D-Flug (Verfolger und Cockpit), Planung/FLUGMODELL.md 5: Zeigerfang, Mausziel (Fadenkreuz sofort,
// Schiff folgt), virtueller Stick, Tastatur in sechs Richtungen, Rollen, Boost, Raumbremse, Tempomat, Kopplung,
// Betriebsart, Landemodus, Begrenzer, Raketen-Aufschaltung. Schreibt je Bild den Steuerrahmen world.ctl
// (Gerät → Rahmen → Simulation; Controller und Touch schreiben über dieselben Felder).
import { C, BTN, EDGE, aimAxes } from '../flight/core.js';
import { qFromAxisAngle, qRot, fwdOf, vAngle } from '../flight/math3.js';
import { clampCone, leadTime } from '../flight/aim.js';
import { LOCK_TIME, LOCK_CONE, BOLT_SPEED } from '../flight/params.js';
import { FLIGHT, matches, codeOf } from './bindings.js';
import { flightSettings, isTouchOnly } from './flightsettings.js';
import { synth } from './padnav.js';

const D = Math.PI / 180;
const HOLD_MODE = 0.3, TAP_E = 0.25, ALT_FREE = 0.25;
// Touch-Joystick zielt wie der rechte Stick am Controller (padflight.js AIM_LEAD/PAD_LEAD)
const TOUCH_RATE = 140, AIM_LEAD = 1.25, PAD_LEAD = 1.1;
// Im Vollbild fängt die Tastatursperre (Chromium) Strg+W/T/N/Tab ab, die sonst den Tab schließen bzw. wechseln
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyT', 'KeyN', 'KeyQ', 'KeyE', 'Tab'];
const _q = new Float64Array(4), _t = new Float64Array(3), _n = new Float64Array(3), _r = new Float64Array(3), _u = new Float64Array(3);
// Gehaltene Tasten kommen aus der Belegungstabelle (bindings.js FLIGHT), nicht aus festem e.code: Umbelegen wirkt so
// überall (Runde 2: update() las W/A/S/D/Leertaste/Strg/Q/E/Umschalt/X fest)
const HELD = ['fwd', 'back', 'left', 'right', 'up', 'down', 'rollL', 'rollR', 'boost', 'brake', 'look', 'free'];
const heldCodes = () => { const m = new Map(); for (const a of HELD) for (const c of FLIGHT[a] || []) if (!c.includes('+')) m.set(c, a); return m; };
const FREE_CODES = new Set(['AltLeft', 'AltRight']); // Option links und rechts geben den Zeiger frei
// Einzeltasten: Taste aus der Tabelle ohne Alt (Umschalt für Boost darf gehalten sein: F im Boost dockt weiter)
const tap = (e, a) => !e.altKey && (FLIGHT[a] || []).some((c) => !c.includes('+') && c === e.code);

export class FlightInput {
  constructor(input) {
    this.input = input;
    this.canvas = input.canvas;
    this.aim = new Float64Array([0, 0, -1]);   // Zielrichtung (Welt), Fadenkreuz
    this.keys = new Set();
    this.codes = heldCodes();   // e.code → Handlung (gehaltene Tasten)
    this.act = new Set();       // gehaltene Handlungen
    this.locked = false; this.wantLock = false; this.lockFailed = false; this._quiet = false;
    this.fire = false; this.fireCtrl = false; this.rmb = false; this.look = false;
    this.lockT = 0; this.lockId = null; this.locked2 = false;   // Raketen-Aufschaltung
    this.vx = 0; this.vy = 0;                                    // virtueller Stick (−1..1)
    this.moved = 0;                                              // Mausweg in diesem Bild (px)
    this.bDown = -1; this.eDown = -1; this.eRolled = false;
    this.altDown = -1; this.altUsed = false; this.altFreed = false;
    this.edge = 0; this.lim = 0;
    this.pad = null;      // Controller (padflight.js): { tx, ty, tz, rr, aimRate, rateMode, rp, ry, fire, boost, brake, precise, active }
    this.touch = null;    // Touch (hud-touch.js): { ax, ay, fire, boost, throttle }
    this.lastMoveAt = 0;
    this.clickHint = false;
    this.set = flightSettings();
    this._onSet = () => { this.set = flightSettings(); };
    window.addEventListener('ls:flight', this._onSet);
    this._onLock = () => this.onLockChange();
    // abgelehnter Fang (Ereignis und Promise melden denselben Fehler: innerhalb 100 ms nur einmal zählen)
    this._onLockErr = () => { const t = performance.now(); if (!(this.lockFailed && t - (this.lockFailedAt || 0) < 100)) this.lockFails = (this.lockFails || 0) + 1; this.lockFailed = true; this.lockFailedAt = t; };
    document.addEventListener('pointerlockchange', this._onLock);
    document.addEventListener('pointerlockerror', this._onLockErr);
    this._onMove = (e) => this.onMove(e);
    document.addEventListener('mousemove', this._onMove);
    this._onResume = (e) => {
      // „Weiter“ im Bordmenü ist eine Nutzergeste: Zeiger gleich wieder fangen
      if (e.target && e.target.closest && e.target.closest('[data-act="resume"], [data-act="close"]') && this.active()) setTimeout(() => this.requestLock(), 0);
      // Wahl im ersten Flug („Geführter Einstieg“ / „Direkt spielen“) ist ebenfalls eine Nutzergeste: fangen, sobald die
      // Karte zu ist (vorher fing ein Klick ins Bild nichts, solange die Wahl offen war, und die Maus lenkte still)
      else if (e.target && e.target.closest && e.target.closest('[data-act="guided"], [data-act="direct"]') && this.active()) {
        let n = 0;
        const tryLock = () => { if (!this.active()) return; if (this.input.menuOpen && this.input.menuOpen()) { if (++n < 20) setTimeout(tryLock, 50); return; } this.requestLock(); };
        setTimeout(tryLock, 0);
      }
    };
    window.addEventListener('click', this._onResume, true);
    this._onFull = () => {
      const kb = navigator.keyboard;
      if (!kb || !kb.lock) return;
      try { if (document.fullscreenElement) { const r = kb.lock(LOCK_KEYS); if (r && r.catch) r.catch(() => {}); } else kb.unlock(); } catch { /* nicht unterstützt */ }
    };
    document.addEventListener('fullscreenchange', this._onFull);
    this._onFull();
  }

  get world() { return this.input.world; }
  get renderer() { return this.input.renderer; }
  active() { const w = this.world; return !!(w && w.flight3d && !w.docked && !w.playerDead); }
  touchOnly() { return isTouchOnly(); }

  // ───────── Zeigerfang ─────────
  requestLock() {
    if (this.touchOnly() || !this.canvas || !this.canvas.requestPointerLock) return;
    if (document.pointerLockElement === this.canvas) return; // (this.locked hinkt dem Ereignis hinterher)
    if (this.input.menuOpen && this.input.menuOpen()) return;
    const c = this.canvas;
    const plain = () => { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => this._onLockErr()); } catch { this._onLockErr(); } };
    try {
      const r = c.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => plain()); // Safari/ältere Browser: Option unbekannt → ohne
    } catch { plain(); }
  }
  exitLock(quiet = true) {
    this._quiet = quiet;
    if (document.pointerLockElement && document.exitPointerLock) { try { document.exitPointerLock(); } catch { /* egal */ } }
  }
  onLockChange() {
    const was = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) { this.lockFailed = false; this.lockFails = 0; this.vx = this.vy = 0; }
    if (was && !this.locked) {
      const quiet = this._quiet;
      this._quiet = false;
      this.fire = false; this.rmb = false;
      // Esc (Browser löst den Fang): mit einem Druck ins Bordmenü
      if (!quiet && this.active() && !(this.input.menuOpen && this.input.menuOpen())) synth('Escape');
    }
  }

  // ───────── Maus ─────────
  onMove(e) {
    if (!this.active()) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    // offene Ebene (Bordmenü, Wahl im ersten Flug, Dialog): die Maus bedient die Ebene und lenkt nicht
    if (this.input.menuOpen && this.input.menuOpen()) { this.vx = this.vy = 0; return; }
    if (!this.locked) {
      // ohne Zeigerfang (noch nicht geklickt, abgelehnt): Zeigerausschlag aus der Bildmitte als virtueller Stick
      if (e.target !== this.canvas) { this.vx = this.vy = 0; return; }
      const R = this.input.renderer.rect || { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const rad = R.height * 0.3;
      this.vx = Math.max(-1, Math.min(1, (e.clientX - (R.left + R.width / 2)) / rad));
      this.vy = Math.max(-1, Math.min(1, (e.clientY - (R.top + R.height / 2)) / rad));
      this.moved += Math.abs(mx) + Math.abs(my);
      return;
    }
    this.moved += Math.abs(mx) + Math.abs(my);
    if (Math.abs(mx) + Math.abs(my) > 0) this.lastMoveAt = performance.now();
    if (this.look) { const rig = this.renderer.rig; if (rig) rig.lookBy(mx, my); return; }
    if (this.set.mouse === 'vjoy') {
      const H = (this.renderer.rect && this.renderer.rect.height) || innerHeight;
      const rad = H * 0.3;
      this.vx += mx / rad; this.vy += my / rad;
      const l = Math.hypot(this.vx, this.vy);
      if (l > 1) { this.vx /= l; this.vy /= l; }
      return;
    }
    this.turnAim(mx, my);
  }
  /**
   * Zielrichtung drehen (Mausweg in Pixeln) – sofort, ohne auf die Simulation zu warten. Drehachsen sind die Achsen
   * des Schiffs (flight/core.js aimAxes): Maus waagrecht = reines Gieren, senkrecht = reines Nicken, unabhängig von
   * der mitrollenden Kamera. (Früher drehte die Maus um die Kameraachsen; mit Kurvenrollen und rollender Kamera
   * kippte die Drehachse, und eine waagrechte Maus flog eine absinkende Spirale.)
   */
  turnAim(mx, my, sensK = 1) {
    const w = this.world;
    if (!w || !w.fl) return;
    const s = this.set.sens * D * sensK, inv = this.set.invertY ? -1 : 1;
    aimAxes(w.fl, _r, _u);
    if (mx) { qFromAxisAngle(_q, _u[0], _u[1], _u[2], -mx * s); qRot(this.aim, _q, this.aim); }
    if (my) { qFromAxisAngle(_q, _r[0], _r[1], _r[2], -my * s * inv); qRot(this.aim, _q, this.aim); }
    const l = Math.hypot(this.aim[0], this.aim[1], this.aim[2]) || 1;
    this.aim[0] /= l; this.aim[1] /= l; this.aim[2] /= l;
    this.clampAim();
  }
  /** Zielrichtung um höchstens ang (rad) zur Richtung dir drehen (Zielhilfe-Mitnahme am Controller) */
  turnToward(dir, ang) {
    const a = this.aim, c = vAngle(a, dir);
    if (c < 1e-6 || ang <= 0) return;
    const k = Math.min(1, ang / c);
    a[0] += (dir[0] - a[0]) * k; a[1] += (dir[1] - a[1]) * k; a[2] += (dir[2] - a[2]) * k;
    const l = Math.hypot(a[0], a[1], a[2]) || 1; a[0] /= l; a[1] /= l; a[2] /= l;
    this.clampAim();
  }
  /** Zielrichtung höchstens ang (rad) vom Bug (Controller: kurzer Vorlauf) */
  clampAimTo(ang) {
    const w = this.world;
    if (!w || !w.fl) return;
    fwdOf(_n, w.fl.q);
    clampCone(this.aim, _n, Math.min(ang, this.set.cone * D), this.aim);
  }
  clampAim() {
    const w = this.world;
    if (!w || !w.fl) return;
    fwdOf(_n, w.fl.q);
    clampCone(this.aim, _n, this.set.cone * D, this.aim);
  }
  /** Zielrichtung auf den Bug setzen (Übergang, Abdocken, Kamerawechsel) */
  resetAim() { const w = this.world; if (w && w.fl) fwdOf(this.aim, w.fl.q); this.vx = this.vy = 0; }

  mouseDown(e) {
    if (!this.active()) return false;
    if (this.touchOnly() && e.pointerType === 'touch') return false;
    if (this.input.menuOpen && this.input.menuOpen()) {
      // Klick ins Bild, solange eine Ebene offen ist (z. B. die Wahl im ersten Flug): Hinweis statt stiller Lenkung
      if (e.target === this.canvas) this.menuHintAt = performance.now();
      return e.target === this.canvas;
    }
    if (!this.locked) {
      // erster Klick auf die Spielfläche fängt den Zeiger (Nutzergeste), feuert aber nicht. Nach einem abgelehnten
      // Fang (z. B. Neufang nach Alt ohne Nutzergeste) versucht es der nächste Klick noch einmal; erst nach zwei
      // Ablehnungen in Folge feuert der Klick ohne Fang (virtueller Stick bleibt der Rückfall)
      const retry = this.lockFailed && (this.lockFails || 0) < 2 && performance.now() - (this.lockFailedAt || 0) > 300;
      if (e.target === this.canvas && e.button === 0 && (!this.lockFailed || retry)) { this.requestLock(); return true; }
    }
    // Mac: Strg+Klick meldet sich als Rechtsklick (Firefox: Taste 2) – mit Strg als „runter“ ist es ein Linksklick
    const ctrlClick = e.button === 2 && e.ctrlKey && this.keys.has('ControlLeft');
    if (e.button === 0 || ctrlClick) { this.fire = true; this.fireCtrl = ctrlClick; return true; }
    if (e.button === 2) { this.rmb = true; this.lockT = 0; this.lockId = null; this.locked2 = false; return true; }
    if (e.button === 1) { e.preventDefault(); this.look = true; this.renderer.rig.looking = true; return true; }
    return false;
  }
  mouseUp(e) {
    if (e.button === 0 || (e.button === 2 && this.fireCtrl)) { this.fire = false; this.fireCtrl = false; }
    if (e.button === 2 && this.rmb) {
      this.rmb = false;
      const w = this.world;
      if (this.locked2 && this.lockId) { w.setTarget(this.lockId); this.input.rocket(); }
      else if (this.lockT < 0.25) this.input.rocket(); // kurzer Klick: Rakete auf das aktuelle Ziel (wie R)
      this.lockT = 0; this.locked2 = false; this.lockId = null;
    }
    if (e.button === 1 && this.look) { this.look = false; this.renderer.rig.looking = false; }
  }
  wheel(e) {
    if (!this.active()) return false;
    if (e.altKey) { if (this.altDown >= 0) this.altUsed = true; this.renderer.setZoom(e.deltaY); return true; }
    this.lim += e.deltaY < 0 ? 1 : -1;
    return true;
  }

  // ───────── Tastatur ─────────
  keyDown(e) {
    if (!this.active()) return false;
    const w = this.world, inp = this.input;
    // Strg links ist „runter“ und wird mit W/A/S/D kombiniert: Browser-Kürzel (Strg+D Lesezeichen, Strg+S Speichern,
    // Strg+A Alles markieren …) im Flug abfangen. Strg+W/T/N lässt Chrome nur im Vollbild mit Tastatursperre abfangen
    // (keyboardLock), sonst sichert die Rückfrage „Seite verlassen?“ (main.js) ab.
    if (e.ctrlKey && e.code !== 'ControlRight') e.preventDefault();
    const held = this.codes.get(e.code) || (FREE_CODES.has(e.code) ? 'free' : null);
    if (held) {
      if (e.code === 'Space' || e.code === 'ControlLeft' || held === 'free') e.preventDefault();
      if (held === 'rollR' && !e.repeat) { this.eDown = performance.now(); this.eRolled = false; }
      if (held === 'look' && !e.repeat) { this.look = true; this.renderer.rig.looking = true; }
      // Alt/Option allein gehalten gibt den Zeiger frei – aber erst nach 0,25 s ohne weitere Taste, damit Alt+C
      // (Kopplung) und Alt+Mausrad den Zeigerfang nicht lösen (Mac: sonst jedes Mal Hinweis und neuer Fang)
      if (held === 'free' && !e.repeat) { this.altDown = performance.now(); this.altUsed = false; this.altFreed = false; }
      else if (this.altDown >= 0 && held !== 'free') this.altUsed = true;
      this.keys.add(e.code); this.act.add(held);
      return true;
    }
    if (this.altDown >= 0) this.altUsed = true;
    if (e.repeat) return e.code === codeOf('mode') || e.code === codeOf('next');
    if (matches(e, 'couple')) { this.edge |= EDGE.COUPLE; return true; }
    if (tap(e, 'cruise')) { this.edge |= EDGE.CRUISE; return true; }
    if (tap(e, 'mode')) { this.bDown = performance.now(); return true; }
    if (tap(e, 'landing')) { this.edge |= EDGE.LAND; return true; }
    if (tap(e, 'context')) { inp.context(); return true; }
    if (tap(e, 'jump')) { w.tryJump(); return true; }
    if (tap(e, 'aimTarget')) { this.targetUnderAim(); return true; }
    if (e.code === codeOf('next')) { e.preventDefault(); inp.cycleTarget(e.shiftKey ? -1 : 1); return true; }
    if (FLIGHT.autofire.includes(e.code)) { e.preventDefault(); inp.attack(); return true; } // Feuerleitrechner (K: MacBook ohne Strg rechts)
    if (tap(e, 'rocket')) { inp.rocket(); return true; }
    return false;
  }
  keyUp(e) {
    this.keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.delete('ShiftLeft');
    this._syncAct();
    if (this.codes.get(e.code) === 'look' && this.look && !this._mmb) { this.look = false; if (this.renderer.rig) this.renderer.rig.looking = false; }
    if (FREE_CODES.has(e.code)) {
      // Fang nur neu anfordern, wenn Alt ihn wirklich gelöst hat (Alt+C, Alt+Mausrad lassen ihn stehen)
      const freed = this.altFreed;
      this.altDown = -1; this.altFreed = false;
      if (freed && this.active()) this.requestLock();
    }
    if (e.code === codeOf('mode') && this.bDown >= 0) {
      const held = (performance.now() - this.bDown) / 1000;
      this.bDown = -1;
      if (held < HOLD_MODE && !this.world.docked) this.input.bus.emit('remoteShop', {}); // B kurz: Fernhandel wie bisher
    }
    if (e.code === codeOf('rollR') && this.eDown >= 0) {
      // E kurz getippt und eindeutiger Kontext (sichere Zone, Tor): Andocken/Springen wie bisher (Umsteiger)
      const held = (performance.now() - this.eDown) / 1000;
      this.eDown = -1;
      const w = this.world;
      if (held < TAP_E && w && !w.docked && (w.inSafeZone || w.nearPortal)) this.input.context();
    }
  }
  /** gehaltene Handlungen aus den gehaltenen Tasten neu bilden (zwei Tasten können dieselbe Handlung tragen) */
  _syncAct() { this.act.clear(); for (const c of this.keys) { const a = this.codes.get(c) || (FREE_CODES.has(c) ? 'free' : null); if (a) this.act.add(a); } }
  release() { this.keys.clear(); this.act.clear(); this.fire = false; this.rmb = false; this.vx = this.vy = 0; this.look = false; this.altDown = -1; this.altFreed = false; }

  /** Ziel unter dem Fadenkreuz (T, A am Controller): kleinster Winkel bis 12°, sonst nächstes im Blickkegel */
  targetUnderAim() {
    const w = this.world, p = w.player;
    let best = null, ba = 12 * D;
    for (const e of w.entities.values()) {
      if (!e.alive || !(e.kind === 'enemy' || (e.kind === 'player' && e.pvpOk))) continue;
      _t[0] = e.x - p.x; _t[1] = (e.y || 0) - p.y; _t[2] = e.z - p.z;
      const d = Math.hypot(_t[0], _t[1], _t[2]) || 1;
      _t[0] /= d; _t[1] /= d; _t[2] /= d;
      const a = vAngle(this.aim, _t) - Math.min(0.1, Math.atan((e.radius || 20) / d));
      if (a < ba) { ba = a; best = e; }
    }
    if (best) w.setTarget(best.id); else this.input.cycleTarget(1);
  }

  // ───────── je Bild: Steuerrahmen schreiben ─────────
  update(dt) {
    const w = this.world, c = w.ctl, p = w.player, st = w.fl;
    if (!this.active()) { this.clickHint = false; return; }
    // Zeigerfang wünschen (Hinweis „KLICKEN ZUM STEUERN“, bis die Nutzergeste kommt)
    const menu = this.input.menuOpen && this.input.menuOpen();
    // Alt allein 0,25 s gehalten: Zeiger frei
    if (this.altDown >= 0 && !this.altUsed && !this.altFreed && performance.now() - this.altDown > ALT_FREE * 1000) { this.altFreed = true; this.exitLock(true); }
    this.wantLock = !this.touchOnly() && !menu && !this.altFreed;
    this.clickHint = this.wantLock && !this.locked && !this.pad?.active && !this.touch?.active;
    if (menu && this.locked) this.exitLock(true);
    const k = this.act, pad = this.pad && this.pad.active ? this.pad : null, tch = this.touch && this.touch.active ? this.touch : null;
    let tx = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let ty = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
    let tz = (k.has('fwd') ? 1 : 0) - (k.has('back') ? 1 : 0);
    let rr = (k.has('rollL') ? 1 : 0) - (k.has('rollR') ? 1 : 0);
    if (k.has('rollR') && this.eDown >= 0 && performance.now() - this.eDown < TAP_E * 1000) rr = Math.max(0, rr); // kurzer E-Tipp: noch nicht rollen
    let btn = 0;
    if (k.has('boost')) btn |= BTN.BOOST;
    if (k.has('brake')) btn |= BTN.BRAKE;
    if (this.fire && (this.locked || this.lockFailed)) btn |= BTN.FIRE;
    if (k.has('down') && st.landing && !this.fire) btn |= BTN.AUTOLAND;
    // B halten: KAMPF / REISE
    if (this.bDown >= 0 && performance.now() - this.bDown > HOLD_MODE * 1000) { this.edge |= EDGE.MODE; this.bDown = -1; }
    let aimMode = 1, rp = 0, ry = 0;
    // Controller und Touch addieren sich (letzte aktive Eingabe gewinnt beim Zielen)
    if (pad) {
      tx += pad.tx; ty += pad.ty; tz += pad.tz; rr += pad.rr;
      if (pad.fire) btn |= BTN.FIRE;
      if (pad.boost) btn |= BTN.BOOST;
      if (pad.brake) btn |= BTN.BRAKE;
      if (pad.precise) btn |= BTN.PRECISE;
      this.edge |= pad.edge; pad.edge = 0;
      if (pad.rateMode) { aimMode = 0; rp = pad.rp; ry = pad.ry; fwdOf(this.aim, st.q); }
    }
    if (tch) {
      tz = Math.max(tz, tch.throttle); if (tch.fire) btn |= BTN.FIRE; if (tch.boost) btn |= BTN.BOOST;
      if (tch.ax || tch.ay) {
        // Joystick zielt wie der rechte Stick (padflight.js): Zielrichtung mit höchstens 1,25 × Schiffsdrehrate
        // (bzw. 140 °/s), kurzer Vorlauf vor dem Bug. turnAim rechnet Pixel × sens × D, deshalb hier °/s · dt / sens.
        // (Früher 140 · dt / (sens · D): 140 rad/s statt 140 °/s, das Fadenkreuz sprang bei jeder Auslenkung an den
        // Rand des Lenkkegels, und das Schiff drehte nach dem Loslassen noch über 30° nach.)
        const rate = Math.min(TOUCH_RATE, (w.flP.rate / D) * AIM_LEAD);
        const R = rate * dt / this.set.sens;
        this.turnAim(tch.ax * Math.abs(tch.ax) * R, tch.ay * Math.abs(tch.ay) * R);
        this.clampAimTo(PAD_LEAD * w.flP.rate / (w.flP.kp || 1));
      }
    }
    if (menu) { this.vx = this.vy = 0; }
    // Feuerleitrechner führt (Runde 2, Barrierefreiheit und Touch): Ist das Autofeuer an und zielt der Spieler 0,5 s
    // nicht selbst, dreht die Zielrichtung mit Schiffsdrehrate zur Vorhaltemarke des Ziels – sonst lag das Ziel nie
    // im Kegel des Rechners (tiefe Sektoren: 0 Schüsse). Eigene Mausbewegung, Stick oder Joystick übernehmen sofort.
    const aimIn = this.moved > 3 || (pad && pad.aimInput) || (tch && (tch.ax || tch.ay)) || Math.hypot(this.vx, this.vy) >= 0.06;
    this._aimIdle = aimIn ? 0 : (this._aimIdle || 0) + dt;
    const autoAim = p.attacking && !p.hasMove && this._aimIdle > 0.5 && !(pad && pad.rateMode) && !(this.locked && this.set.mouse === 'vjoy' && !pad);
    if (autoAim) { aimMode = 1; this._autoAim(dt); }
    else if (!this.locked && !pad && !tch) {
      // virtueller Stick (Zeiger in der Bildmitte, noch ohne Zeigerfang): Drehrate statt Zielrichtung
      aimMode = 0;
      const dz = 0.06, mag = Math.hypot(this.vx, this.vy);
      const kk = mag < dz ? 0 : Math.pow((mag - dz) / (1 - dz), 1.5) / (mag || 1);
      rp = -this.vy * kk * (this.set.invertY ? -1 : 1); ry = -this.vx * kk;
      fwdOf(this.aim, st.q);
    } else if (this.locked && this.set.mouse === 'vjoy' && !pad) {
      aimMode = 0;
      const dz = 0.03, mag = Math.hypot(this.vx, this.vy);
      const kk = mag < dz ? 0 : Math.pow((mag - dz) / (1 - dz), 1.5) / (mag || 1);
      rp = -this.vy * kk * (this.set.invertY ? -1 : 1); ry = -this.vx * kk;
      fwdOf(this.aim, st.q);
    }
    // Autopilot: Fadenkreuz folgt dem Kurs, jede eigene Eingabe übernimmt
    const manual = tx !== 0 || ty !== 0 || tz !== 0 || rr !== 0 || this.moved > 3 || (btn & (BTN.BOOST | BTN.BRAKE)) !== 0 || (pad && pad.aimInput);
    w.ctlActive = !!manual;
    if (p.hasMove && !manual) { this.aim[0] = w.apAim[0]; this.aim[1] = w.apAim[1]; this.aim[2] = w.apAim[2]; }
    if (aimMode) this.clampAim();
    this.moved = 0;
    // Raketen-Aufschaltung (rechte Maustaste bzw. LT): Ziel 0,8 s im 12°-Kegel um das Fadenkreuz
    const locking = this.rmb || (pad && pad.lock);
    if (locking) {
      const cand = this.lockCandidate();
      if (cand && cand.id === this.lockId) { this.lockT += dt; if (this.lockT >= LOCK_TIME && !this.locked2) { this.locked2 = true; this.input.bus.emit('lock', { id: cand.id }); } }
      else { this.lockId = cand ? cand.id : null; this.lockT = 0; this.locked2 = false; }
    }
    c[C.TX] = clamp1(tx); c[C.TY] = clamp1(ty); c[C.TZ] = clamp1(tz);
    c[C.ROLLMAN] = rr ? 1 : 0; c[C.RR] = clamp1(rr);
    c[C.AIM] = aimMode; c[C.RP] = clamp1(rp); c[C.RY] = clamp1(ry);
    c[C.AX] = this.aim[0]; c[C.AY] = this.aim[1]; c[C.AZ] = this.aim[2];
    c[C.BTN] = btn;
    c[C.EDGE] = (c[C.EDGE] | 0) | this.edge; this.edge = 0;
    c[C.LIM] += this.lim; this.lim = 0;
    c[C.ASSIST] = this.set.assist;
    // Gerät für den Waffenkegel der Zielhilfe: 0 Maus, 1 Controller, 2 Controller mit LT, 3 Touch
    c[C.DEV] = tch ? 3 : pad ? (pad.precise ? 2 : 1) : 0;
    // Touch („Flug vereinfacht“): Kurvenrollen und Horizont-Hilfe immer an (FLUGMODELL.md 5.4)
    // Controller: Horizont-Hilfe in Ruhe standardmäßig an (padHorizon), sonst hängt das Schiff nach Kurven mit dem
    // rechten Stick schief (6 Freiheitsgrade: Kreisen rollt das Schiff) und LB/RB müssen es gerade rollen
    st.autoRoll = this.set.autoRoll || !!tch; st.horizon = this.set.horizon || !!tch || (!!pad && this.set.padHorizon);
  }
  /** Zielrichtung zur Vorhaltemarke des aufgeschalteten Ziels drehen (Feuerleitrechner führt) */
  _autoAim(dt) {
    const w = this.world, p = w.player, t = p.targetId != null ? w.entities.get(p.targetId) : null;
    if (!t || t.alive === false || !(t.kind === 'enemy' || (t.kind === 'player' && t.pvpOk))) return;
    const rx = t.x - p.x, ry = (t.y || 0) - p.y, rz = t.z - p.z;
    if (Math.hypot(rx, ry, rz) > 4000) return;
    const lt = Math.max(0, leadTime(rx, ry, rz, t.vx || 0, t.vy || 0, t.vz || 0, BOLT_SPEED));
    _t[0] = rx + (t.vx || 0) * lt; _t[1] = ry + (t.vy || 0) * lt; _t[2] = rz + (t.vz || 0) * lt;
    const l = Math.hypot(_t[0], _t[1], _t[2]) || 1; _t[0] /= l; _t[1] /= l; _t[2] /= l;
    this.turnToward(_t, (w.flP.rate || 1) * 1.1 * dt);
  }
  lockCandidate() {
    const w = this.world, p = w.player;
    let best = null, ba = LOCK_CONE;
    for (const e of w.entities.values()) {
      if (!e.alive || !(e.kind === 'enemy' || (e.kind === 'player' && e.pvpOk))) continue;
      _t[0] = e.x - p.x; _t[1] = (e.y || 0) - p.y; _t[2] = e.z - p.z;
      const d = Math.hypot(_t[0], _t[1], _t[2]) || 1;
      if (d > 700) continue;
      _t[0] /= d; _t[1] /= d; _t[2] /= d;
      const a = vAngle(this.aim, _t);
      if (a < ba) { ba = a; best = e; }
    }
    return best;
  }
  dispose() {
    this.exitLock(true);
    window.removeEventListener('ls:flight', this._onSet);
    document.removeEventListener('pointerlockchange', this._onLock);
    document.removeEventListener('pointerlockerror', this._onLockErr);
    document.removeEventListener('mousemove', this._onMove);
    window.removeEventListener('click', this._onResume, true);
    document.removeEventListener('fullscreenchange', this._onFull);
  }
}
function clamp1(v) { return v > 1 ? 1 : v < -1 ? -1 : v; }
export { codeOf, FLIGHT };
