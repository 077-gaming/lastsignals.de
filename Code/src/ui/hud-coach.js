// Flug-Coach für neue Piloten: beim ersten Flug vier kurze Karten unten mittig, je eine Handlung.
// Jede Karte verschwindet, sobald der Spieler die Handlung wirklich ausgeführt hat (nicht per Klick wegdrücken).
// Fortschritt im Profil (profile.tut = Anzahl erledigter Schritte), damit der Coach nie zweimal erscheint.
// Erfahrene Piloten (Stufe > 1 oder schon Abschüsse) sehen ihn nie.
import './hud-coach.css';

const STEPS = [
  { key: 'fly', title: 'FLIEGEN', text: 'Maus zeigt die Richtung · <kbd>W</kbd> Schub · <kbd>S</kbd> bremsen · Linke Maustaste halten = fliegen' },
  { key: 'target', title: 'ZIEL WÄHLEN', text: '<kbd>TAB</kbd> wählt den nächsten Gegner · oder Gegner anklicken' },
  { key: 'attack', title: 'ANGREIFEN', text: 'Gegner <b>doppelt anklicken</b> oder <kbd>STRG</kbd> = Angriff · <kbd>LEERTASTE</kbd> = Rakete · in der sicheren Zone sind Waffen gesperrt' },
  { key: 'loot', title: 'BEUTE', text: 'Zerstörte Gegner hinterlassen ein Wrack mit Credits · einfach drüberfliegen · <kbd>H</kbd> = Autopilot zur Station (Reparatur)' },
];
// Touch (iPad): gleiche Schritte, Texte für Finger und Knöpfe
const TOUCH = {
  fly: 'Finger auf die Spielfläche legen = in diese Richtung fliegen · zwei Finger = Zoom',
  target: 'Gegner antippen = Ziel · oder Knopf <b>ZIEL</b>',
  attack: 'Gegner <b>zweimal antippen</b> oder Knopf <b>ANGRIFF</b> · <b>RAKETE</b> feuert · in der sicheren Zone sind Waffen gesperrt',
  loot: 'Zerstörte Gegner hinterlassen ein Wrack mit Credits · drüberfliegen · Knopf <b>HEIM</b> = Autopilot zur Station',
};
if (typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1)) for (const s of STEPS) if (TOUCH[s.key]) s.text = TOUCH[s.key];

export class HudCoach {
  constructor(root, bus, world) {
    this.bus = bus;
    this.world = world;
    const pr = world.profile;
    let kills = 0;
    if (pr.stats && pr.stats.kills) for (const k in pr.stats.kills) kills += pr.stats.kills[k] || 0;
    if (typeof pr.tut !== 'number') pr.tut = (pr.level || 1) > 1 || kills > 0 ? STEPS.length : 0;
    this.i = pr.tut;
    this.offs = [];
    if (this.i >= STEPS.length) return;
    this.el = document.createElement('div');
    this.el.className = 'hud-coach';
    this.el.setAttribute('role', 'status');
    this.el.setAttribute('aria-live', 'polite');
    root.appendChild(this.el);
    this.startX = null; this.startZ = null; this.flown = 0;
    this.offs.push(
      bus.on('loot', (p) => { if (p && p.credits > 0 && STEPS[this.i]?.key === 'loot') this._next(); }),
      bus.on('shot', (p) => { if (p && p.from === world.player?.id && !p.drone && STEPS[this.i]?.key === 'attack') this._next(); }),
    );
    this._show();
  }

  setWorld(w) { this.world = w; }

  _show() {
    const s = STEPS[this.i];
    if (!s || !this.el) return;
    this.el.innerHTML = `<span class="hc-step">${this.i + 1}/${STEPS.length}</span><b>${s.title}</b><span class="hc-text">${s.text}</span>`;
    this.el.classList.remove('done');
    this.el.classList.add('on');
  }

  _next() {
    const pr = this.world.profile;
    this.i++;
    pr.tut = this.i;
    try { this.world.save(); } catch { /* egal */ }
    if (!this.el) return;
    this.el.classList.add('done');
    clearTimeout(this._t);
    if (this.i >= STEPS.length) {
      this._t = setTimeout(() => { this.el?.classList.remove('on'); }, 900);
      this.bus.emit('message', { kind: 'info', title: 'FLUGLEITUNG', text: 'Grundausbildung abgeschlossen. Dein Auftrag steht oben rechts.' });
      return;
    }
    this._t = setTimeout(() => this._show(), 700);
  }

  /** je Bild: Schritte prüfen, die keinen eigenen Ereignistyp haben */
  update() {
    if (!this.el || this.i >= STEPS.length) return;
    const w = this.world, p = w.player;
    if (!p || w.docked || w.playerDead) { this.el.classList.toggle('hidden', true); return; }
    this.el.classList.toggle('hidden', false);
    const key = STEPS[this.i].key;
    if (key === 'fly') {
      if (this.startX === null) { this.startX = p.x; this.startZ = p.z; }
      if (Math.hypot(p.x - this.startX, p.z - this.startZ) > 300) this._next();
    } else if (key === 'target') {
      if (p.targetId) this._next();
    }
  }

  dispose() {
    clearTimeout(this._t);
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.el?.remove();
    this.el = null;
  }
}
