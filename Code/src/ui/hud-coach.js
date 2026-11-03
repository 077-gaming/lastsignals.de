// Flug-Coach für neue Piloten: beim ersten Flug vier kurze Karten unten mittig, je eine Handlung.
// Jede Karte verschwindet, sobald der Spieler die Handlung wirklich ausgeführt hat (nicht per Klick wegdrücken).
// Fortschritt im Profil (profile.tut = Anzahl erledigter Schritte), damit der Coach nie zweimal erscheint.
// Erfahrene Piloten (Stufe > 1 oder schon Abschüsse) sehen ihn nie.
import './hud-coach.css';
import { glyph, padMode } from '../input/padglyph.js';
import { keyName } from '../input/bindings.js';
import { isTouchOnly } from '../input/flightsettings.js';

// Vier Schritte; der Text hängt von Ansicht (3D-Flug oder Taktik) und Gerät (Tastatur/Maus, Controller, Touch) ab.
// Tastennamen kommen aus der Belegung (input/bindings.js), Controller-Symbole aus padglyph.js – nie fester Text.
const STEPS = [
  { key: 'fly', title: 'FLIEGEN' },
  { key: 'target', title: 'ZIEL WÄHLEN' },
  { key: 'attack', title: 'ANGREIFEN' },
  { key: 'loot', title: 'BEUTE' },
];
const kb = (a, mode) => `<kbd>${keyName(a, mode)}</kbd>`;
const k = (n) => `<kbd>${glyph(n)}</kbd>`;
const SAFE = 'in der sicheren Zone sind Waffen gesperrt';
const TEXT = {
  // Hauptmodus 3D-Flug (Verfolger, Cockpit)
  f3: {
    fly: () => `Maus zielt, das Schiff folgt · ${kb('fwd')} Schub · ${kb('back')} zurück · ${kb('left')}/${kb('right')} seitlich · ${kb('boost')} Boost · ${kb('brake')} Raumbremse`,
    target: () => `${kb('aimTarget')} Ziel unter dem Fadenkreuz · ${kb('next')} nächster Gegner`,
    attack: () => `${kb('fire')} halten = Laser · auf die Raute vor dem Gegner zielen (Vorhalt) · ${kb('rocket')} Rakete · ${SAFE}`,
    loot: () => `Der Traktor zieht Wracks heran, einfach in die Nähe fliegen · ${kb('context')} fliegt zur Beute · ${kb('home')} Autopilot zur Station`,
  },
  pad3: {
    fly: () => `Rechter Stick zielt, das Schiff folgt · linker Stick Schub und seitlich · ${k('LB')}/${k('RB')} rollen · ${k('L3')} Boost`,
    target: () => `${k('A')} Ziel im Fadenkreuz, sonst den nächsten Gegner`,
    attack: () => `${k('RT')} = Laser · auf die Raute vor dem Gegner zielen (Vorhalt) · ${k('X')} Rakete · ${k('LT')} halten schaltet auf · ${SAFE}`,
    loot: () => `Der Traktor zieht Wracks heran · ${k('Y')} fliegt zur Beute · ${k('Y')} halten = Autopilot zur Station`,
  },
  touch3: {
    fly: () => '<b>Joystick</b> zielt, das Schiff folgt · <b>SCHUB</b> an, aus · <b>BOOST</b> halten für kurze Sprints · <b>ANSICHT</b> wechselt die Kamera',
    target: () => 'Knopf <b>ZIEL</b> wählt den nächsten Gegner',
    attack: () => `Knopf <b>LASER</b> schaltet das Autofeuer an, aus · <b>RAKETE</b> feuert · ${SAFE}`,
    loot: () => 'Der Traktor zieht Wracks heran · Knopf <b>HEIM</b> = Autopilot zur Station (Reparatur)',
  },
  // Nebenmodus Taktik (Draufsicht, Klickflug)
  tac: {
    fly: () => `Klick ins All = hinfliegen · Linke Maustaste halten = dem Zeiger folgen · ${kb('steer', 'tactic')} Schub`,
    target: () => `${kb('next', 'tactic')} wählt den nächsten Gegner · oder Gegner anklicken`,
    attack: () => `Gegner <b>doppelt anklicken</b> oder ${kb('attack', 'tactic')} = Angriff · ${kb('rocket', 'tactic')} = Rakete · ${SAFE}`,
    loot: () => `Zerstörte Gegner hinterlassen ein Wrack mit Credits · einfach drüberfliegen · ${kb('home', 'tactic')} = Autopilot zur Station (Reparatur)`,
  },
  padTac: {
    fly: () => `<b>Linker Stick</b> fliegt bildbezogen · ${k('RT')} Schub · ${k('LT')} bremsen · ${k('L3')} Dauerschub · rechter Stick: Zoom`,
    target: () => `${k('RB')} wählt den nächsten Gegner · ${k('LB')} den vorigen`,
    attack: () => `${k('A')} = Angriff an, aus · ${k('X')} = Rakete · ${SAFE}`,
    loot: () => `Zerstörte Gegner hinterlassen ein Wrack mit Credits · drüberfliegen oder ${k('Y')} fliegt hin · ${k('Y')} halten = Autopilot zur Station`,
  },
  touchTac: {
    fly: () => '<b>Joystick</b> links ziehen = fliegen · oder Finger auf die Spielfläche · zwei Finger = Zoom · <b>ANSICHT</b> wechselt die Kamera',
    target: () => 'Gegner antippen = Ziel · oder Knopf <b>ZIEL</b>',
    attack: () => `Gegner <b>zweimal antippen</b> oder Knopf <b>LASER</b> · <b>RAKETE</b> feuert · ${SAFE}`,
    loot: () => 'Zerstörte Gegner hinterlassen ein Wrack mit Credits · drüberfliegen · Knopf <b>HEIM</b> = Autopilot zur Station',
  },
};
const touchDev = () => typeof window !== 'undefined' && (isTouchOnly() || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 1));
/** Textsatz für Ansicht und Gerät */
function textSet(f3) {
  if (padMode()) return f3 ? TEXT.pad3 : TEXT.padTac;
  if (touchDev()) return f3 ? TEXT.touch3 : TEXT.touchTac;
  return f3 ? TEXT.f3 : TEXT.tac;
}

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
    this._onMode = () => { if (this.el && this.el.classList.contains('on') && !this.el.classList.contains('done')) this._show(); };
    this._sig = '';
    window.addEventListener('ls:inputmode', this._onMode);
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
    const f3 = !!(this.world && this.world.flight3d);
    const set = textSet(f3);
    this._sig = `${f3 ? 3 : 2}|${padMode() ? 'pad' : touchDev() ? 'touch' : 'kb'}`;
    const text = set[s.key]();
    this.el.innerHTML = `<span class="hc-step">${this.i + 1}/${STEPS.length}</span><b>${s.title}</b><span class="hc-text">${text}</span>`;
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
    // SYSTEM-Reihe (Planung/QUESTS_SYSTEM.md): Wer den geführten Einstieg wählt, wird von ihr eingewiesen; der Coach
    // tritt dann ganz zurück. Solange die Wahl noch offen ist, wartet er. Bei „Direkt spielen“ bleibt er die Kurzeinweisung.
    const sys = w.profile && w.profile.system;
    if (sys && sys.mode === 'guided') { this.i = STEPS.length; w.profile.tut = STEPS.length; this.el.classList.remove('on'); return; }
    if (!p || w.docked || w.playerDead || (sys && sys.mode == null)) { this.el.classList.toggle('hidden', true); return; }
    this.el.classList.toggle('hidden', false);
    // Ansicht oder Gerät gewechselt: Text neu (3D-Flug und Taktik haben andere Tasten)
    if (this._sig !== `${w.flight3d ? 3 : 2}|${padMode() ? 'pad' : touchDev() ? 'touch' : 'kb'}`) this._show();
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
    if (this._onMode) window.removeEventListener('ls:inputmode', this._onMode);
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.el?.remove();
    this.el = null;
  }
}
