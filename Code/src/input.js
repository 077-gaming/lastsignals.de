// Maus und Tastatur → Befehle an die Welt.
// Leertaste: Angriff an/aus · 1–4: L1–L4 · 5: SAB · 6: SAL · R: Rakete · J: Springen · E: Andocken/Abdocken
// Tab: nächster Gegner · Mausrad: Zoom · V: Kamera (Verfolger ↔ Taktisch)
//
// Verfolger-Kamera (Standard): **Maus lenkt.** Das Schiff dreht sanft in Richtung des Mauszeigers.
//   W = Schub an (bleibt an, bis S), S = bremsen, A/D = zusätzlich zur Seite ziehen (ohne Schub: auf der Stelle
//   wenden), linke Maustaste gedrückt halten = fliegen, solange gedrückt. Linksklick auf Gegner = Ziel,
//   Doppelklick = Ziel + Angriff, Klick auf Kiste/Wrack/Tor/Station = hinfliegen.
// Taktische Kamera: Linksklick = hinfliegen (gedrückt halten = folgen), WASD/Pfeile bildbezogen (W = Bild oben).
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

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onContext = (e) => e.preventDefault();
    this.onBlur = () => { this.mouseDown = false; this.steer.clear(); };

    canvas.addEventListener('pointerdown', this.onMouseDown);
    window.addEventListener('pointermove', this.onMouseMove);
    window.addEventListener('pointerup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  get chase() { return this.renderer.cameraMode === 'chase'; }

  typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  onMouseDown(e) {
    if (e.button !== 0) return;
    if (this.world.docked || this.world.playerDead) return;
    this.mouseX = e.clientX; this.mouseY = e.clientY; this.mouseOnCanvas = true;
    const hit = this.renderer.pick(e.clientX, e.clientY);
    if (hit && hit.kind === 'entity') {
      const ent = this.world.entities.get(hit.id);
      if (ent && ent.kind === 'enemy') {
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
    this.mouseX = e.clientX; this.mouseY = e.clientY;
    this.mouseOnCanvas = e.target === this.canvas;
  }
  onMouseUp(e) { if (e.button === 0) this.mouseDown = false; }

  onWheel(e) {
    e.preventDefault();
    this.renderer.setZoom(e.deltaY);
  }

  nearestEnemy() {
    const p = this.world.player;
    let best = null, bestD = Infinity;
    for (const ent of this.world.entities.values()) {
      if (ent.kind !== 'enemy' || !ent.alive) continue;
      const dx = ent.x - p.x, dz = ent.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD && ent.id !== p.targetId) { bestD = d; best = ent; }
    }
    return best;
  }

  onKeyDown(e) {
    if (this.typing(e)) return;
    const w = this.world;
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
      case 'Space': e.preventDefault(); if (!w.docked) w.toggleAttack(); break;
      case 'Digit6': if (!w.docked) w.fireSal(); break;
      case 'KeyR': if (!w.docked) w.fireRocket(); break;
      case 'KeyJ': if (!w.docked) w.tryJump(); break;
      case 'KeyE': if (w.docked) w.undock(); else w.dock(); break;
      case 'KeyV': {
        if (w.docked || !this.renderer.toggleCamera) break;
        const m = this.renderer.toggleCamera();
        this.cruise = false;
        this.bus.emit('message', {
          kind: 'info',
          text: m === 'chase'
            ? 'Kamera: Verfolger – Maus lenkt, W Schub, S bremsen, Klick wählt Gegner (V wechselt).'
            : 'Kamera: Taktisch – Klick fliegt hin, WASD bildbezogen (V wechselt).',
        });
        break;
      }
      case 'Tab': {
        e.preventDefault();
        const t = this.nearestEnemy();
        if (t) w.setTarget(t.id);
        break;
      }
      default:
        if (AMMO_KEYS[e.code]) w.selectAmmo(AMMO_KEYS[e.code]);
    }
  }

  onKeyUp(e) { this.steer.delete(e.code); }

  update(dt) {
    const w = this.world;
    // Verfolger: Fadenkreuz-Zeiger (die Maus lenkt), taktisch der normale Zeiger
    const cur = this.chase ? 'crosshair' : '';
    if (this._cur !== cur) { this._cur = cur; this.canvas.style.cursor = cur; }
    if (w.docked || w.playerDead || !w.player) { this.cruise = false; return; }
    if (this.chase) { this.chaseUpdate(dt); return; }
    this.cruise = false;
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

  // Verfolger: Maus lenkt, W/S Schub, A/D seitlich ziehen bzw. im Stand wenden
  chaseUpdate(dt) {
    const w = this.world, p = w.player;
    let turn = 0, fw = false, back = false;
    for (const code of this.steer) {
      if (FWD[code]) fw = true;
      else if (BACK[code]) back = true;
      else turn -= STEER_KEYS[code][0]; // A = links (+), D = rechts (−)
    }
    if (back) return; // bremst (stopMove beim Drücken)
    this.steerTimer -= dt;
    if (this.steerTimer > 0) return;
    this.steerTimer = STEER_EVERY;
    const thrust = this.cruise || fw || this.mouseDown;
    const rot = p.rot || 0;
    if (!thrust) {
      // ohne Schub: A/D wendet auf der Stelle (kurzer Zielpunkt seitlich voraus)
      if (turn) { const a = rot + turn * 1.25; w.moveTo(p.x - Math.sin(a) * 160, p.z - Math.cos(a) * 160); }
      return;
    }
    // Zeiger über einem HUD-Fenster: Kurs halten (nicht lenken, während man etwas anklickt)
    let h = this.mouseOnCanvas && this.renderer.steerHeading ? this.renderer.steerHeading(this.mouseX, this.mouseY) : rot;
    h += turn * 0.9;
    w.moveTo(p.x - Math.sin(h) * AHEAD, p.z - Math.cos(h) * AHEAD);
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onMouseDown);
    window.removeEventListener('pointermove', this.onMouseMove);
    window.removeEventListener('pointerup', this.onMouseUp);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
