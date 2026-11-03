// Maus und Tastatur → Befehle an die Welt.
// Maus zuerst: Klick auf Gegner = Ziel, Doppelklick = Ziel + Angriff · Strg: Angriff auf das Ziel an/aus
// Leertaste: Rakete (auch R) · H: Autopilot zur Station (Reparatur) · 1–4: L1–L4 · 5: SAB · 6: SAL · J: Springen · E: Andocken/Abdocken
// Tab: nächster Gegner · Mausrad: Zoom · V: Kamera (Verfolger ↔ Taktisch)
//
// Verfolger-Kamera (Standard): **Maus lenkt.** Das Schiff dreht sanft in Richtung des Mauszeigers.
//   W = Schub an (bleibt an, bis S), S = bremsen, A/D = zusätzlich zur Seite ziehen (ohne Schub: auf der Stelle
//   wenden), linke Maustaste gedrückt halten = fliegen, solange gedrückt. Linksklick auf Gegner = Ziel,
//   Doppelklick = Ziel + Angriff, Klick auf Kiste/Wrack/Tor/Station = hinfliegen.
// Taktische Kamera: Linksklick = hinfliegen (gedrückt halten = folgen), WASD/Pfeile bildbezogen (W = Bild oben).
// Controller: input/padflight.js setzt this.pad (Sticks, Trigger) und ruft die Befehle unten (attack, rocket, context …).
import { FlightInput } from './input/flightinput.js';
import { keyName } from './input/bindings.js';

const AMMO_KEYS = { Digit1: 'L1', Digit2: 'L2', Digit3: 'L3', Digit4: 'L4', Digit5: 'SAB' };
const STEER_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const FWD = { KeyW: 1, ArrowUp: 1 }, BACK = { KeyS: 1, ArrowDown: 1 };
const AHEAD = 900;        // Verfolger: Zielpunkt so weit voraus (nie erreicht → volles Tempo)
const STEER_EVERY = 0.05; // Sekunden zwischen zwei Kursbefehlen

export class Input {
  constructor(canvas, world, renderer, bus) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = renderer;
    this.bus = bus;
    this.mouseDown = false;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.mouseOnCanvas = false; // Zeiger über der Spielfläche (nicht über einem HUD-Fenster)
    this.followTimer = 0;
    this.steerTimer = 0;
    this.cruise = false;        // Verfolger: Schub an (W), aus mit S
    this.lastClick = { t: 0, id: null };
    this.steer = new Set();
    this.touches = new Map(); this.primary = null; this.pinch = 0; // Touch: Finger, Lenk-Finger, Pinch-Abstand
    this.pad = null;            // Controller-Zustand (input/padflight.js): { active, lx, ly, lt, rt, sens }
    this.fi = new FlightInput(this); // 3D-Flug (Verfolger, Cockpit): Zeigerfang, Mausziel, Steuerrahmen
    this.menuOpen = null;            // main.js: () => Bordmenü oder Dialog offen

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onContext = (e) => e.preventDefault();
    this.onBlur = () => { this.mouseDown = false; this.steer.clear(); this.fi.release(); };

    canvas.addEventListener('pointerdown', this.onMouseDown);
    window.addEventListener('pointermove', this.onMouseMove);
    window.addEventListener('pointerup', this.onMouseUp);
    window.addEventListener('pointercancel', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get chase() { return this.renderer.cameraMode === 'chase'; }
  /** 3D-Flug aktiv (Verfolger oder Cockpit, nicht angedockt) */
  get flight3d() { return !!(this.world && this.world.flight3d); }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onMouseDown(e) {
    // Touch (iPad): zwei Finger auf der Spielfläche = Zoomen (Pinch), der erste Finger lenkt wie die Maus
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) { this.mouseDown = false; this.pinch = this._pinchDist(); return; }
      if (this.touches.size > 2) return;
      this.primary = e.pointerId;
    }
    // 3D-Flug: Zeigerfang, Feuern, Raketen-Aufschaltung, Umsehen (input/flightinput.js)
    if (this.flight3d && !this.world.docked && !this.world.playerDead) {
      if (e.pointerType === 'touch') {
        // Touch im 3D-Flug: Antippen wählt ein Ziel (gelenkt wird mit dem Joystick)
        const hit = this.renderer.pick(e.clientX, e.clientY);
        const ent = hit && hit.kind === 'entity' ? this.world.entities.get(hit.id) : null;
        if (ent && (ent.kind === 'enemy' || (ent.kind === 'player' && ent.pvpOk))) this.world.setTarget(ent.id);
        return;
      }
      if (this.fi.mouseDown(e)) return;
      return;
    }
    // Cockpit: mittlere Maustaste halten = umsehen (Kurs bleibt)
    if (e.button === 1 && this.renderer.viewMode === 'cockpit') { e.preventDefault(); this.look = true; this.renderer.rig.looking = true; this.lookX = e.clientX; this.lookY = e.clientY; return; }
    if (e.button !== 0) return;
    if (this.world.docked || this.world.playerDead) return;
    this.mouseX = e.clientX; this.mouseY = e.clientY; this.mouseOnCanvas = true;
    const hit = this.renderer.pick(e.clientX, e.clientY);
    if (hit && hit.kind === 'entity') {
      const ent = this.world.entities.get(hit.id);
      if (ent && (ent.kind === 'enemy' || (ent.kind === 'player' && ent.pvpOk))) { // fremde Spieler nur bei PvP
        const now = performance.now();
        const dbl = this.lastClick.id === ent.id && now - this.lastClick.t < 350;
        this.lastClick = { t: now, id: ent.id };
        this.world.setTarget(ent.id);
        if (dbl && !this.world.player.attacking) this.world.toggleAttack();
        return;
      }
      if (ent) { this.cruise = false; this.world.moveTo(ent.x, ent.z); return; }
    }
    if (this.chase) {
      // Verfolger: gedrückt halten = in Zeigerrichtung fliegen (auch über dem Horizont)
      this.mouseDown = true;
      this.steerTimer = 0;
      return;
    }
    if (hit && hit.kind === 'ground') {
      this.mouseDown = true;
      this.followTimer = 0;
      this.world.moveTo(hit.x, hit.z);
    }
  }

  onMouseMove(e) {
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (t) { t.x = e.clientX; t.y = e.clientY; }
      if (this.touches.size >= 2) {
        const d = this._pinchDist();
        if (this.pinch && Math.abs(d - this.pinch) > 6) { this.renderer.setZoom((this.pinch - d) * 2.5); this.pinch = d; }
        return;
      }
      if (e.pointerId !== this.primary) return;
    }
    if (this.look) { this.renderer.rig.lookBy(e.clientX - this.lookX, e.clientY - this.lookY); this.lookX = e.clientX; this.lookY = e.clientY; return; }
    this.mouseX = e.clientX; this.mouseY = e.clientY;
    this.mouseOnCanvas = e.target === this.canvas;
  }
  onMouseUp(e) {
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = 0;
      if (e.pointerId !== this.primary) return; // anderer Finger (z. B. Knopf) beendet das Lenken nicht
      this.primary = null;
    }
    if (e.button === 0) this.mouseDown = false;
    if (e.button === 1 && this.look) { this.look = false; this.renderer.rig.looking = false; }
    this.fi.mouseUp(e);
  }
  _pinchDist() { const [a, b] = [...this.touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }

  onWheel(e) {
    e.preventDefault();
    if (this.flight3d && this.fi.wheel(e)) return; // 3D-Flug: Begrenzer (Alt+Mausrad: Kameraabstand)
    this.renderer.setZoom(e.deltaY);
  }

  /** players: auch fremde Spieler mit PvP (nur Tab, nicht Strg ohne Ziel – kein versehentlicher Angriff) */
  nearestEnemy(players = false) {
    const p = this.world.player;
    let best = null, bestD = Infinity;
    const y3 = this.flight3d;
    for (const ent of this.world.entities.values()) {
      if (!ent.alive || !(ent.kind === 'enemy' || (players && ent.kind === 'player' && ent.pvpOk))) continue;
      const dx = ent.x - p.x, dz = ent.z - p.z, dy = y3 ? (ent.y || 0) - p.y : 0;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bestD && ent.id !== p.targetId) { bestD = d; best = ent; }
    }
    return best;
  }

  onKeyDown(e) {
    if (this.typing(e)) return;
    const w = this.world;
    // 3D-Flug: eigene Belegung (input/bindings.js); was dort nicht belegt ist (H, V, Zahlen …), läuft weiter unten
    if (this.flight3d && !w.playerDead && this.fi.keyDown(e)) return;
    if (STEER_KEYS[e.code] && this.flight3d) return;
    if (STEER_KEYS[e.code]) {
      e.preventDefault();
      if (!e.repeat && this.chase && !w.docked && !w.playerDead) {
        if (FWD[e.code]) { this.cruise = true; this.steerTimer = 0; }
        if (BACK[e.code]) { this.cruise = false; w.stopMove(); }
      }
      this.steer.add(e.code);
      return;
    }
    if (e.repeat) return;
    if (w.playerDead) return;
    switch (e.code) {
      // Strg: Angriff auf das anvisierte Ziel an/aus; ohne Ziel wird der nächste Gegner gewählt und angegriffen
      case 'ControlLeft': case 'ControlRight': e.preventDefault(); this.attack(); break;
      case 'Space': e.preventDefault(); this.rocket(); break;
      case 'KeyH': this.home(); break;
      case 'KeyB': if (!w.docked) this.bus.emit('remoteShop', {}); break; // Fernhandel (Hub-Shop im Flug)
      case 'Digit6': if (!w.docked) w.fireSal(); break;
      case 'KeyR': this.rocket(); break;
      case 'KeyJ': if (!w.docked) w.tryJump(); break;
      case 'KeyE': if (w.docked) w.undock(); else w.dock(); break;
      case 'KeyV': this.toggleCamera(); break;
      case 'Tab': {
        e.preventDefault();
        const t = this.nearestEnemy(true);
        if (t) w.setTarget(t.id);
        break;
      }
      default:
        if (AMMO_KEYS[e.code]) w.selectAmmo(AMMO_KEYS[e.code]);
    }
  }

  // ---------- Befehle (Tastatur, Touch-Knöpfe und Controller nutzen dieselben Wege) ----------
  /** Angriff an/aus; ohne Ziel wird der nächste Gegner gewählt */
  attack() {
    const w = this.world;
    if (w.docked || w.playerDead) return;
    if (!w.player.attacking && !w.player.targetId) { const n = this.nearestEnemy(); if (n) w.setTarget(n.id); }
    w.toggleAttack();
  }
  rocket() { const w = this.world; if (!w.docked && !w.playerDead) return w.fireRocket(); return false; }
  home() { const w = this.world; if (w.docked || w.playerDead) return; this.cruise = false; this.mouseDown = false; w.autoHome(); }
  /** Kamera: Verfolger → Cockpit → Taktisch */
  toggleCamera() {
    const w = this.world;
    if (w.docked || !this.renderer.toggleCamera) return;
    const m = this.renderer.toggleCamera();
    this.cruise = false;
    this.syncView();
    if (m !== 'tactical') this.fi.requestLock(); // V ist die Nutzergeste für den Zeigerfang
    const pd = this.pad && this.pad.active;
    const k = (a) => keyName(a);
    this.bus.emit('message', {
      kind: 'info',
      text: pd
        ? (m === 'cockpit' ? 'Kamera: Cockpit – rechter Stick zielt, linker Stick schiebt, R3 halten sieht sich um (R3 wechselt).'
          : m === 'chase' ? 'Kamera: Verfolger – rechter Stick zielt, linker Stick schiebt, RT feuert, LB/RB rollen (R3 wechselt).'
            : 'Kamera: Taktisch – linker Stick fliegt bildbezogen, rechter Stick zoomt (R3 wechselt).')
        : m === 'cockpit'
          ? `Kamera: Cockpit – Maus zielt, ${k('fwd')}/${k('back')} Schub, ${k('rollL')}/${k('rollR')} rollen, Instrumente auf der Konsole (${k('camera')} wechselt).`
          : m === 'chase'
            ? `Kamera: Verfolger – Maus zielt, Klick feuert, ${k('fwd')} Schub, ${k('boost')} Boost, ${k('rollL')}/${k('rollR')} rollen (${k('camera')} wechselt).`
            : 'Kamera: Taktisch – Klick fliegt hin, WASD bildbezogen, Strg Angriff (V wechselt).',
    });
  }
  /** Ziele der Reihe nach: dir +1 = nächstes, −1 = voriges; ohne Ziel der nächste Gegner. Die Reihenfolge (nach
   *  Entfernung) bleibt 4 s nach dem letzten Wechsel fest, damit vor/zurück trotz fliegender Gegner zusammenpassen. */
  cycleTarget(dir) {
    const w = this.world, p = w.player;
    if (w.docked || w.playerDead || !p) return;
    const now = performance.now();
    let list = null;
    const c = this._cycle;
    if (c && now - c.t < 4000 && c.ids.includes(p.targetId)) {
      list = c.ids.map((id) => w.entities.get(id)).filter((e) => e && e.alive);
      if (list.length < 2) list = null;
    }
    if (!list) {
      list = [];
      // wie Tab: Gegner und fremde Spieler, solange PvP zwischen beiden gilt (Mehrspieler)
      for (const ent of w.entities.values()) if (ent.alive && (ent.kind === 'enemy' || (ent.kind === 'player' && ent.pvpOk))) list.push(ent);
      const y3 = this.flight3d;
      list.sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2 + (y3 ? ((a.y || 0) - p.y) ** 2 : 0)) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 + (y3 ? ((b.y || 0) - p.y) ** 2 : 0)));
    }
    if (!list.length) return;
    const i = list.findIndex((e) => e.id === p.targetId);
    const n = i < 0 ? list[0] : list[((i + dir) % list.length + list.length) % list.length];
    this._cycle = { ids: list.map((e) => e.id), t: now };
    if (n && n.id !== p.targetId) w.setTarget(n.id);
  }
  /** Abbrechen: Angriff aus, dann Ziel lösen, dann Kurs/Autopilot/Dauerschub beenden */
  cancel() {
    const w = this.world, p = w.player;
    if (w.docked || w.playerDead || !p) return;
    if (p.attacking) { w.toggleAttack(); return; }
    if (p.targetId) { w.setTarget(null); return; }
    this.cruise = false; this.mouseDown = false;
    w.stopMove();
  }
  /** Kontext (wie E/J): Andocken in der sicheren Zone, Springen am Tor, sonst nächste Beute anfliegen */
  context() {
    const w = this.world, p = w.player;
    if (w.playerDead || !p) return;
    if (w.docked) { w.undock(); return; }
    if (w.station && w.inSafeZone) { w.dock(); return; }
    if (w.nearPortal) { w.tryJump(); return; }
    const l = this.nearestLoot(1500);
    if (l) {
      this.cruise = false;
      w.moveTo(l.x, l.z, l.y);
      this.bus.emit('message', { kind: 'info', text: `Kurs auf ${l.label} (${Math.round(l.d / 10) * 10} m).` });
      return;
    }
    w.dock(); // Hinweis der Welt (sichere Zone / keine Station)
  }
  nearestLoot(max) {
    const w = this.world, p = w.player;
    let best = null, bd = max * max;
    const t = w.time, full = (w.cargoMax || 0) - (w.cargoUsed || 0) <= 0;
    const y3 = this.flight3d;
    const test = (o, label) => { const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2 + (y3 ? ((o.y || 0) - p.y) ** 2 : 0); if (d < bd) { bd = d; best = { x: o.x, z: o.z, y: o.y || 0, label, d: 0 }; } };
    for (const o of w.wrecks || []) if (o && (o.owner === 'player' || !(t < o.protectedUntil))) test(o, 'Wrack');
    for (const o of w.crates || []) if (o && o.alive) test(o, 'Frachtkiste');
    if (!full) for (const o of w.ores || []) if (o && o.alive) test(o, 'Erz');
    if (best) best.d = Math.sqrt(bd);
    return best;
  }

  onKeyUp(e) { this.steer.delete(e.code); this.fi.keyUp(e); }

  /** Ansicht und Steuerweg abgleichen: Verfolger/Cockpit = 3D-Flug, Taktisch = Klickflug */
  syncView() {
    const w = this.world;
    if (!w || !w.setFlight3d) return;
    const want = this.renderer.cameraMode === 'chase';
    if (want !== w.flight3d) { w.setFlight3d(want); this.fi.resetAim(); this.mouseDown = false; this.steer.clear(); if (!want) this.fi.exitLock(true); }
    const f = want ? '3d' : 'taktik';
    if (document.documentElement.dataset.flight !== f) { document.documentElement.dataset.flight = f; try { window.dispatchEvent(new CustomEvent('ls:flightview', { detail: { flight: f } })); } catch { /* alt */ } }
  }

  update(dt) {
    const w = this.world;
    this.syncView();
    // 3D-Flug: Zeiger gefangen (unsichtbar) bzw. Fadenkreuz-Zeiger bis zum ersten Klick; taktisch der normale Zeiger
    const cur = this.flight3d ? (this.fi.locked ? 'none' : 'crosshair') : this.chase ? 'crosshair' : '';
    if (this._cur !== cur) { this._cur = cur; this.canvas.style.cursor = cur; }
    if (w.docked || w.playerDead || !w.player) { this.cruise = false; this.fi.update(dt); if (w.docked && this.fi.locked) this.fi.exitLock(true); return; }
    if (this.flight3d) { this.fi.update(dt); return; }
    if (this.chase) { this.chaseUpdate(dt); return; }
    this.cruise = false;
    // Controller (taktisch): linker Stick fliegt bildbezogen (oben = Bild oben), LT bremst
    const pd = this.pad && this.pad.active ? this.pad : null;
    if (pd) {
      if (pd.lt > 0.3) { if (!this._padBrake) w.stopMove(); this._padBrake = true; return; }
      this._padBrake = false;
      const m = Math.hypot(pd.lx, pd.ly);
      if (m > 0.02) {
        this.steerTimer -= dt;
        if (this.steerTimer <= 0) {
          this.steerTimer = STEER_EVERY;
          const d = this.throttleDist(Math.min(1, m * pd.sens));
          w.moveTo(w.player.x + (pd.lx / m) * d, w.player.z + (pd.ly / m) * d);
        }
        return;
      }
    }
    if (this.steer.size) {
      let dx = 0, dz = 0;
      for (const code of this.steer) { dx += STEER_KEYS[code][0]; dz += STEER_KEYS[code][1]; }
      if (dx || dz) {
        const len = Math.hypot(dx, dz);
        w.moveTo(w.player.x + (dx / len) * 400, w.player.z + (dz / len) * 400);
      }
      return;
    }
    if (this.mouseDown) {
      this.followTimer -= dt;
      if (this.followTimer <= 0) {
        this.followTimer = 0.08;
        const hit = this.renderer.pick(this.mouseX, this.mouseY);
        if (hit && hit.kind === 'ground') w.moveTo(hit.x, hit.z);
      }
    }
  }

  /** Stufenloser Schub (Controller-Trigger): so weit voraus zielen, dass die Simulation genau den Anteil f des
   *  Höchsttempos anstrebt (world._movePlayer: Wunschtempo = √(0,81 · vmax · (Abstand − 15))). f ≥ 0,97 = voll. */
  throttleDist(f) {
    if (f >= 0.97) return AHEAD;
    const vmax = this.world._speed || 300;
    return Math.min(AHEAD, 26 + (f * f * vmax) / 0.81);
  }

  // Verfolger: Maus lenkt, W/S Schub, A/D seitlich ziehen bzw. im Stand wenden.
  // Controller: linker Stick lenkt wie die Maus (gleiche Kurve über steerHeading), RT Schub stufenlos, LT bremst.
  chaseUpdate(dt) {
    const w = this.world, p = w.player;
    let turn = 0, fw = false, back = false;
    for (const code of this.steer) {
      if (FWD[code]) fw = true;
      else if (BACK[code]) back = true;
      else turn -= STEER_KEYS[code][0]; // A = links (+), D = rechts (−)
    }
    if (back) return; // bremst (stopMove beim Drücken)
    const pd = this.pad && this.pad.active ? this.pad : null;
    if (pd && pd.lt > 0.3) { if (!this._padBrake) { this.cruise = false; w.stopMove(); } this._padBrake = true; return; }
    this._padBrake = false;
    this.steerTimer -= dt;
    if (this.steerTimer > 0) return;
    this.steerTimer = STEER_EVERY;
    const pf = pd ? pd.rt : 0;
    const full = this.cruise || fw || this.mouseDown;
    const thrust = full || pf > 0.04;
    const rot = p.rot || 0;
    const sx = pd ? Math.max(-1, Math.min(1, pd.lx * pd.sens)) : 0;
    if (!thrust) {
      // ohne Schub: A/D (bzw. Stick) wendet auf der Stelle (kurzer Zielpunkt seitlich voraus)
      const t = turn - sx;
      if (t) { const a = rot + Math.max(-1.5, Math.min(1.5, t)) * 1.25; w.moveTo(p.x - Math.sin(a) * 160, p.z - Math.cos(a) * 160); }
      return;
    }
    let h;
    if (pd && this.renderer.steerHeading && this.renderer.rect) {
      const R = this.renderer.rect;
      h = this.renderer.steerHeading(R.left + (sx + 1) * 0.5 * R.width);
    } else {
      // Zeiger über einem HUD-Fenster: Kurs halten (nicht lenken, während man etwas anklickt)
      h = this.mouseOnCanvas && this.renderer.steerHeading ? this.renderer.steerHeading(this.mouseX, this.mouseY) : rot;
    }
    h += turn * 0.9;
    const d = full ? AHEAD : this.throttleDist(pf);
    w.moveTo(p.x - Math.sin(h) * d, p.z - Math.cos(h) * d);
  }

  dispose() {
    this.fi.dispose();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onMouseDown);
    window.removeEventListener('pointermove', this.onMouseMove);
    window.removeEventListener('pointerup', this.onMouseUp);
    window.removeEventListener('pointercancel', this.onMouseUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
