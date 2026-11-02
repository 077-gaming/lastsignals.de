// SYSTEM-Reihe: optionale Einführung in kleinen echten Handlungen (Planung/QUESTS_SYSTEM.md, Kapitel 1–3).
// Läuft neben der normalen Auftragskette, blockiert nichts und lässt sich jederzeit überspringen, pausieren
// und fortsetzen. Zustand im Profil: profile.system = { mode, idx, progress, done[], skipped[] }.
//   mode: 'guided' (Karte führt aktiv) | 'direct' (Reihe liegt bereit, nichts wird eingeblendet) | null (noch nicht gewählt)

export const SYSTEM_CHAPTERS = { 1: 'Fliegen', 2: 'Zielen und Angreifen', 3: 'Munition 1–6', 4: 'Raketen', 5: 'Schnellleiste', 6: 'Extras und Minen' };

// Ziele: fly {meters, camera?}, brake {fromSpeed}, camera {target}, reach {dx, dz, r} (relativ zur Station),
// target {}, attack {}, kill {target?, count}, shoot {ammo, count}, rocket {rocket, count}, arsenal {},
// bar {bar} (Leiste umschalten), place {bar, count} (Plätze neu belegt), extra {id, hits?|combat?|strike?},
// mine {ids, count}
// key: Tastenschild in der Karte; keys werden in der Anzeige aus der Belegung gelesen, soweit vorhanden.
export const SYSTEM_QUESTS = [
  { id: 'sys01', ch: 1, title: 'Signal empfangen', text: 'Station hier, wir hören dich. W gibt Schub, bis zum vollen Tempo dauert es ein paar Sekunden.', goal: { type: 'fly', meters: 300 }, key: 'W', reward: { credits: 500, xp: 200 } },
  { id: 'sys02', ch: 1, title: 'Die Maus lenkt', text: 'Im Verfolger folgt die Nase dem Mauszeiger. Halt die Maustaste oder W und flieg eine weite Kurve.', goal: { type: 'fly', meters: 1500, camera: 'chase' }, key: 'MAUS', reward: { credits: 500, xp: 300 } },
  { id: 'sys03', ch: 1, title: 'Vollbremsung', text: 'S bremst. Erst auf Tempo kommen, dann aus voller Fahrt anhalten.', goal: { type: 'brake', fromSpeed: 150 }, key: 'S', reward: { credits: 500, xp: 300 } },
  { id: 'sys04', ch: 1, title: 'Von oben', text: 'V schaltet auf die taktische Ansicht. Von oben fliegst du per Klick.', goal: { type: 'camera', target: 'tactical' }, key: 'V', reward: { credits: 500, xp: 300 } },
  { id: 'sys05', ch: 1, title: 'Klick und weg', text: 'Klick in Richtung Wegpunkt, den Rest macht der Autopilot. Richtung und Entfernung stehen hier in der Karte.', goal: { type: 'reach', dx: 1200, dz: 600, r: 180 }, key: 'KLICK', reward: { credits: 800, xp: 400 } },
  { id: 'sys06', ch: 1, title: 'Zurück hinters Schiff', text: 'V noch einmal, du sitzt wieder hinter dem Schiff.', goal: { type: 'camera', target: 'chase' }, key: 'V', reward: { credits: 500, xp: 300 } },
  { id: 'sys07', ch: 1, title: 'Weiter draußen', text: 'Der nächste Wegpunkt liegt außerhalb der sicheren Zone. Unten rechts auf der Karte siehst du, wo du bist.', goal: { type: 'reach', dx: -1800, dz: -1400, r: 220 }, key: 'KARTE', reward: { credits: 1000, xp: 500 } },
  { id: 'sys08', ch: 2, title: 'Ziel erfassen', text: 'Kontakt. Tab erfasst den nächsten Gegner, ein Klick auf ihn geht auch. Hülle und Schild stehen im Fenster ZIEL.', goal: { type: 'target' }, key: 'TAB', reward: { credits: 800, xp: 400 } },
  { id: 'sys09', ch: 2, title: 'Feuer frei', text: 'Leertaste startet den Angriff, noch einmal stoppt ihn. Die Laser feuern nur, wenn die Nase zum Ziel zeigt.', goal: { type: 'attack' }, key: 'LEER', reward: { credits: 800, xp: 400 } },
  { id: 'sys10', ch: 2, title: 'Erster Abschuss', text: 'Erst fällt der Schild, dann die Hülle. Bring ihn runter.', goal: { type: 'kill', count: 1 }, reward: { credits: 1500, xp: 800, honor: 5 } },
  { id: 'sys11', ch: 2, title: 'Das Rudel', text: 'Raider jagen im Rudel und kommen von mehreren Seiten. Bleib in Bewegung und hol dir drei.', goal: { type: 'kill', target: 'raider', count: 3 }, reward: { credits: 2000, xp: 1000, honor: 10 } },
  { id: 'sys12', ch: 2, title: 'Die Brut', text: 'Larven bewachen die Felder. Wer näher als 300 Meter kommt, wird angesprungen. Räum vier weg.', goal: { type: 'kill', target: 'larva', count: 4 }, reward: { credits: 2000, xp: 1000, tritium: 5, honor: 10 } },
  { id: 'sys13', ch: 3, title: 'Standard', text: 'Taste 1 ist L1: billig, immer an Bord, einfacher Schaden. 20 Treffer.', goal: { type: 'shoot', ammo: 'L1', count: 20 }, key: '1', reward: { credits: 800, xp: 500 } },
  { id: 'sys14', ch: 3, title: 'Doppelt', text: 'Taste 2: L2 macht doppelten Schaden und kostet Credits. 20 Treffer.', goal: { type: 'shoot', ammo: 'L2', count: 20 }, key: '2', reward: { credits: 1000, xp: 600 } },
  { id: 'sys15', ch: 3, title: 'Tritium-Munition', text: 'L3 auf Taste 3, dreifacher Schaden, bezahlt mit Tritium. Nimm sie, wenn es zählt. 15 Treffer.', goal: { type: 'shoot', ammo: 'L3', count: 15 }, key: '3', reward: { credits: 1000, xp: 600, tritium: 15 } },
  { id: 'sys16', ch: 3, title: 'Schwere Ladung', text: 'L4 auf Taste 4, vierfacher Schaden. Teuer, also nur für harte Ziele. 10 Treffer.', goal: { type: 'shoot', ammo: 'L4', count: 10 }, key: '4', reward: { credits: 1000, xp: 700, tritium: 20 } },
  { id: 'sys17', ch: 3, title: 'Schildsauger', text: 'SAB auf Taste 5 trifft nur Schilde und füllt deinen eigenen. 10 Treffer.', goal: { type: 'shoot', ammo: 'SAB', count: 10 }, key: '5', reward: { credits: 1000, xp: 700, tritium: 15 } },
  { id: 'sys18', ch: 3, title: 'Ein Schuss, der sitzt', text: 'Taste 6 feuert SAL: sechsfacher Schaden mit eigener Ladezeit, danach läuft deine Munition weiter. 3 Treffer.', goal: { type: 'shoot', ammo: 'SAL', count: 3 }, key: '6', reward: { credits: 1500, xp: 800, tritium: 20 } },
  { id: 'sys19', ch: 4, title: 'Rakete los', text: 'R schickt eine R1 aufs Ziel, danach lädt der Werfer 3 Sekunden. Weicht das Ziel aus oder steht ein Brocken dazwischen, geht sie vorbei. 3 Treffer.', goal: { type: 'rocket', rocket: 'R1', count: 3 }, key: 'R', reward: { credits: 1500, xp: 800, honor: 5 } },
  { id: 'sys20', ch: 5, title: 'Arsenal', text: 'Rechts an der Schnellleiste liegt ARSENAL. Dort ist alles, was du an Bord hast. Mach es auf.', goal: { type: 'arsenal' }, key: 'ARSENAL', reward: { credits: 500, xp: 200 } },
  { id: 'sys21', ch: 5, title: 'Zweite Leiste', text: 'Alt+2 schaltet auf Leiste 2. Alt+1 bringt dich zurück.', goal: { type: 'bar', bar: 2 }, key: 'ALT+2', reward: { credits: 500, xp: 300 } },
  { id: 'sys22', ch: 5, title: 'Leiste belegen', text: 'Zieh vier Dinge aus dem Arsenal auf Leiste 2, zum Beispiel R3, SPM, BRM und TRN. Rechtsklick leert einen Platz wieder.', goal: { type: 'place', bar: 2, count: 4 }, key: 'ZIEHEN', reward: { credits: 800, xp: 400 } },
  { id: 'sys23', ch: 5, title: 'Schwere Rakete', text: 'R3 hat den vierfachen Schaden einer R1 und kostet Tritium. Zwei Treffer.', goal: { type: 'rocket', rocket: 'R3', count: 2 }, reward: { credits: 1000, xp: 600, tritium: 15 } },
  { id: 'sys24', ch: 6, title: 'Störfeuer', text: 'EMP stört alles in 700 Metern: Gegner verlieren dich, Getarnte werden sichtbar, Spezialangriffe brechen ab. Zünde ihn mit einem Gegner in Reichweite.', goal: { type: 'extra', id: 'EMP', hits: 1 }, key: 'EMP', reward: { credits: 1000, xp: 600, tritium: 20 } },
  { id: 'sys25', ch: 6, title: 'Sofortschild', text: 'SOS macht dich 3 Sekunden unverwundbar, schießen geht weiter. Setz ihn ein, während dich jemand angreift.', goal: { type: 'extra', id: 'SOS', combat: true }, key: 'SOS', reward: { credits: 1000, xp: 600, tritium: 20 } },
  { id: 'sys26', ch: 6, title: 'Bombe', text: 'Die Bombe trifft alles in 450 Metern. Warte, bis mindestens zwei nah dran sind.', goal: { type: 'extra', id: 'BMB', hits: 2 }, key: 'BMB', reward: { credits: 1500, xp: 800, tritium: 15, honor: 5 } },
  { id: 'sys27', ch: 6, title: 'Sprengmine', text: 'Minen fallen hinter dem Heck und sind nach einer Sekunde scharf. Zieh einen Verfolger drüber.', goal: { type: 'mine', ids: ['SPM'], count: 1 }, key: 'SPM', reward: { credits: 1000, xp: 600 } },
  { id: 'sys28', ch: 6, title: 'Bremsen und Stören', text: 'BRM bremst auf halbes Tempo, STM nimmt 4 Sekunden die Zielerfassung. Lass eine davon zünden.', goal: { type: 'mine', ids: ['BRM', 'STM'], count: 1 }, key: 'BRM', reward: { credits: 1000, xp: 600 } },
  { id: 'sys29', ch: 6, title: 'Aus dem Nichts', text: 'TRN geht erst nach 5 Sekunden ohne Kampf, dein erster Schuss deckt dich auf. Tarn dich und eröffne so den Angriff.', goal: { type: 'extra', id: 'TRN', strike: true }, key: 'TRN', reward: { credits: 1500, xp: 800, tritium: 25 } },
];

const fmt = (n) => Math.round(n).toLocaleString('de-DE');

export class SystemSeries {
  // cameraMode: Funktion, die 'chase' oder 'tactical' liefert (Grafik), damit die Simulation die Ansicht nicht kennt
  constructor(world, bus, cameraMode = () => 'chase') {
    this.world = world;
    this.bus = bus;
    this.cameraMode = cameraMode;
    this._brakeArmed = false;
    const pr = world.profile;
    if (!pr.system || typeof pr.system !== 'object') pr.system = { mode: null, idx: 0, progress: 0, done: [], skipped: [] };
    const s = pr.system;
    if (!Array.isArray(s.done)) s.done = [];
    if (!Array.isArray(s.skipped)) s.skipped = [];
    s.idx = Math.max(0, Math.min(SYSTEM_QUESTS.length, s.idx | 0));
    // Erfahrene Spielstände: Reihe liegt bereit, führt aber nicht von selbst
    if (s.mode == null && ((pr.level || 1) > 1 || (pr.xp || 0) > 0)) s.mode = 'direct';
    this.offs = [
      bus.on('explode', (p) => {
        const e = world.entities.get(p.id);
        if (e && e.kind === 'enemy') this._count('kill', e.type, 1);
      }),
      bus.on('shot', (p) => {
        if (!p.hit || p.drone || !world.player || p.from !== world.player.id) return;
        this._count('shoot', p.ammo, 1);
      }),
      bus.on('rocketHit', (p) => this._count('rocket', p.rocket, 1)),
      bus.on('ability', (a) => this._ability(a)),
    ];
  }

  get state() { return this.world.profile.system; }
  get current() { return SYSTEM_QUESTS[this.state.idx] || null; }
  get finished() { return this.state.idx >= SYSTEM_QUESTS.length; }
  get active() { return this.state.mode === 'guided' && !this.finished; }

  choose(mode) { this.state.mode = mode; this.world.save?.(); this.bus.emit('system', { kind: 'mode', mode }); }

  // Ziel des aktuellen Wegpunkts (Weltkoordinaten), sonst null
  waypoint() {
    const q = this.current, st = this.world.sector?.station;
    if (!q || q.goal.type !== 'reach' || !st) return null;
    return { x: st.x + q.goal.dx, z: st.z + q.goal.dz, r: q.goal.r };
  }

  update(dt) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const w = this.world, p = w.player, g = q.goal;
    if (!p || w.docked || w.playerDead) return;
    const speed = p.speed || Math.hypot(p.vx || 0, p.vz || 0);
    switch (g.type) {
      case 'fly':
        if (g.camera && this.cameraMode() !== g.camera) return;
        this._add(speed * dt, g.meters);
        break;
      case 'brake':
        if (speed >= g.fromSpeed) this._brakeArmed = true;
        if (this._brakeArmed && speed < 6) this._add(1, 1);
        break;
      case 'camera': if (this.cameraMode() === g.target) this._add(1, 1); break;
      case 'reach': {
        const wp = this.waypoint();
        if (wp && Math.hypot(p.x - wp.x, p.z - wp.z) < wp.r) this._add(1, 1);
        break;
      }
      case 'target': if (p.targetId) this._add(1, 1); break;
      case 'attack': if (p.attacking && p.targetId) this._add(1, 1); break;
      default: break;
    }
  }

  _ability(a) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const g = q.goal;
    if (g.type === 'mine' && a.kind === 'mine' && a.phase === 'fire' && g.ids.includes(a.id)) this._add(1, g.count);
    if (g.type !== 'extra' || a.id !== g.id) return;
    if (g.hits && a.phase === 'fire' && (a.hits || 0) >= g.hits) this._add(1, 1);
    else if (g.combat && a.phase === 'use' && this._underAttack()) this._add(1, 1);
    else if (g.strike && a.phase === 'end' && a.reason === 'Angriff') this._add(1, 1);
  }

  _underAttack() {
    const p = this.world.player;
    for (const e of this.world.entities.values()) if (e.kind === 'enemy' && e.alive !== false && e.attacking && e.targetId === p.id) return true;
    return false;
  }

  // Zustand der Oberfläche (Arsenal offen, aktive Leiste, belegte Plätze je Leiste), gemeldet von der HUD-Schicht
  reportUi(ui) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided') return;
    const g = q.goal;
    if (g.type === 'arsenal' && ui.arsenalOpen) this._add(1, 1);
    else if (g.type === 'bar' && ui.bar === g.bar) this._add(1, 1);
    else if (g.type === 'place') {
      const n = ui.filled[g.bar - 1] || 0;
      if (this._placeBase == null || this._placeQuest !== q.id) { this._placeBase = n; this._placeQuest = q.id; }
      const got = Math.max(0, n - this._placeBase);
      if (got > (this.state.progress || 0)) this._add(got - (this.state.progress || 0), g.count);
    }
  }

  _count(type, what, n) {
    const q = this.current;
    if (!q || this.state.mode !== 'guided' || q.goal.type !== type) return;
    if (type === 'kill' && q.goal.target && q.goal.target !== what) return;
    if (type === 'shoot' && q.goal.ammo !== what) return;
    if (type === 'rocket' && q.goal.rocket !== what) return;
    this._add(n, q.goal.count);
  }

  _add(n, max) {
    const s = this.state;
    s.progress = Math.min(max, (s.progress || 0) + n);
    this.bus.emit('system', { kind: 'progress', quest: this.current, progress: s.progress, max });
    if (s.progress >= max) this._complete();
  }

  _complete() {
    const w = this.world, pr = w.profile, q = this.current, r = q.reward || {};
    const parts = [];
    if (r.credits) { pr.credits += r.credits; parts.push(`${fmt(r.credits)} Credits`); }
    if (r.tritium) { pr.tritium += r.tritium; parts.push(`${fmt(r.tritium)} Tritium`); }
    if (r.honor) { pr.honor += r.honor; parts.push(`${fmt(r.honor)} Ehre`); }
    if (r.xp) parts.push(`${fmt(r.xp)} Erfahrung`);
    if (r.xp && w._addXp) w._addXp(r.xp);
    this.state.done.push(q.id);
    this._next();
    w._msg?.(`SYSTEM · ${q.title} erledigt. ${parts.join(', ')}.`, 'quest');
    w._emitProfile?.();
    w.save?.();
    this.bus.emit('system', { kind: 'done', quest: q });
  }

  skip() {
    const q = this.current;
    if (!q) return;
    this.state.skipped.push(q.id); // übersprungen: ohne Belohnung (Entscheidung offen, siehe Vault)
    this._next();
    this.world.save?.();
    this.bus.emit('system', { kind: 'skip', quest: q });
  }

  // Ganze Reihe von vorn (über die Hilfe); Belohnungen gibt es nur einmal je Quest
  restart() {
    Object.assign(this.state, { idx: -1, progress: 0, mode: 'guided' });
    this._next();
    this.bus.emit('system', { kind: 'restart' });
  }

  _next() {
    const s = this.state;
    s.idx++;
    s.progress = 0;
    this._brakeArmed = false;
    // Bereits erledigte Quests (nach Neustart der Reihe) überspringen, damit es keine doppelten Belohnungen gibt
    while (s.idx < SYSTEM_QUESTS.length && s.done.includes(SYSTEM_QUESTS[s.idx].id)) s.idx++;
  }

  dispose() { for (const off of this.offs) off(); }
}
