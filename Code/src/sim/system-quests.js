// SYSTEM-Reihe: optionale Einführung in kleinen echten Handlungen (Planung/QUESTS_SYSTEM.md, Kapitel 1–3).
// Läuft neben der normalen Auftragskette, blockiert nichts und lässt sich jederzeit überspringen, pausieren
// und fortsetzen. Zustand im Profil: profile.system = { mode, idx, progress, done[], skipped[] }.
//   mode: 'guided' (Karte führt aktiv) | 'direct' (Reihe liegt bereit, nichts wird eingeblendet) | null (noch nicht gewählt)

export const SYSTEM_CHAPTERS = { 1: 'Fliegen', 2: 'Zielen und Angreifen', 3: 'Munition 1–6', 4: 'Raketen', 5: 'Schnellleiste', 6: 'Extras und Minen', 7: 'Techs', 8: 'Konfigurationen', 9: 'Beute', 10: 'Erz', 11: 'Station' };

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
  { id: 'sys09', ch: 2, title: 'Feuer frei', text: 'Strg startet den Angriff, noch einmal stoppt ihn. Ein Doppelklick auf den Gegner geht auch. Die Laser feuern nur, wenn die Nase zum Ziel zeigt.', goal: { type: 'attack' }, key: 'STRG', reward: { credits: 800, xp: 400 } },
  { id: 'sys10', ch: 2, title: 'Erster Abschuss', text: 'Erst fällt der Schild, dann die Hülle. Bring ihn runter.', goal: { type: 'kill', count: 1 }, reward: { credits: 1500, xp: 800, honor: 5 } },
  { id: 'sys11', ch: 2, title: 'Das Rudel', text: 'Raider jagen im Rudel und kommen von mehreren Seiten. Bleib in Bewegung und hol dir drei.', goal: { type: 'kill', target: 'raider', count: 3 }, reward: { credits: 2000, xp: 1000, honor: 10 } },
  { id: 'sys12', ch: 2, title: 'Die Brut', text: 'Larven bewachen die Felder. Wer näher als 300 Meter kommt, wird angesprungen. Räum vier weg.', goal: { type: 'kill', target: 'larva', count: 4 }, reward: { credits: 2000, xp: 1000, tritium: 5, honor: 10 } },
  { id: 'sys13', ch: 3, title: 'Standard', text: 'Taste 1 ist L1: billig, immer an Bord, einfacher Schaden. 20 Treffer.', goal: { type: 'shoot', ammo: 'L1', count: 20 }, key: '1', reward: { credits: 800, xp: 500 } },
  { id: 'sys14', ch: 3, title: 'Doppelt', text: 'Taste 2: L2 macht doppelten Schaden und kostet Credits. 20 Treffer.', goal: { type: 'shoot', ammo: 'L2', count: 20 }, key: '2', reward: { credits: 1000, xp: 600 } },
  { id: 'sys15', ch: 3, title: 'Tritium-Munition', text: 'L3 auf Taste 3, dreifacher Schaden, bezahlt mit Tritium. Nimm sie, wenn es zählt. 15 Treffer.', goal: { type: 'shoot', ammo: 'L3', count: 15 }, key: '3', reward: { credits: 1000, xp: 600, tritium: 15 } },
  { id: 'sys16', ch: 3, title: 'Schwere Ladung', text: 'L4 auf Taste 4, vierfacher Schaden. Teuer, also nur für harte Ziele. 10 Treffer.', goal: { type: 'shoot', ammo: 'L4', count: 10 }, key: '4', reward: { credits: 1000, xp: 700, tritium: 20 } },
  { id: 'sys17', ch: 3, title: 'Schildsauger', text: 'SAB auf Taste 5 trifft nur Schilde und füllt deinen eigenen. 10 Treffer.', goal: { type: 'shoot', ammo: 'SAB', count: 10 }, key: '5', reward: { credits: 1000, xp: 700, tritium: 15 } },
  { id: 'sys18', ch: 3, title: 'Ein Schuss, der sitzt', text: 'Taste 6 feuert SAL: sechsfacher Schaden mit eigener Ladezeit, danach läuft deine Munition weiter. 3 Treffer.', goal: { type: 'shoot', ammo: 'SAL', count: 3 }, key: '6', reward: { credits: 1500, xp: 800, tritium: 20 } },
  { id: 'sys19', ch: 4, title: 'Rakete los', text: 'Leertaste oder R schickt eine R1 aufs Ziel, danach lädt der Werfer 3 Sekunden. Weicht das Ziel aus oder steht ein Brocken dazwischen, geht sie vorbei. 3 Treffer.', goal: { type: 'rocket', rocket: 'R1', count: 3 }, key: 'LEER', reward: { credits: 1500, xp: 800, honor: 5 } },
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
  { id: 'sys30', ch: 7, title: 'Kettenblitz', text: 'ARC springt von Ziel zu Ziel, bis zu fünf. Zünde ihn, wenn mindestens drei Gegner nah beieinander sind.', goal: { type: 'tech', id: 'ARC', hits: 3 }, key: 'ARC', reward: { credits: 2000, xp: 1000, honor: 5 } },
  { id: 'sys31', ch: 7, title: 'Zielsperre', text: 'Mit LCK trifft 15 Sekunden lang jede Rakete, auch ausweichende Ziele. Drei Raketentreffer unter Zielsperre.', goal: { type: 'rocket', lock: true, count: 3 }, key: 'LCK', reward: { credits: 1500, xp: 1000, tritium: 15 } },
  { id: 'sys32', ch: 7, title: 'Energie saugen', text: 'VMP: 10 Sekunden lang heilt ein Teil deines Laserschadens die Hülle. Nimm es mitten im Kampf.', goal: { type: 'tech', id: 'VMP', combat: true }, key: 'VMP', reward: { credits: 1500, xp: 800 } },
  { id: 'sys33', ch: 7, title: 'Reserveschild', text: 'RSV füllt den Schild sofort. Warte, bis er unter 30 Prozent ist.', goal: { type: 'tech', id: 'RSV', shieldBelow: 0.3 }, key: 'RSV', reward: { credits: 1500, xp: 800, tritium: 30 } },
  { id: 'sys34', ch: 8, title: 'Mehr Schild', text: 'Dein Schiff hat drei Konfigurationen. Konfiguration 2 fährt zwei Schildgeneratoren. Schalte um, im Arsenal unter KONFIGURATION.', goal: { type: 'config', n: 2 }, key: 'KONF 2', reward: { credits: 800, xp: 500 } },
  { id: 'sys35', ch: 8, title: 'Mehr Tempo', text: 'Konfiguration 3 fährt zwei Antriebe. Schalte um und flieg 2 Kilometer. Danach zurück auf 1, wenn du kämpfen willst.', goal: { type: 'fly', meters: 2000, config: 3 }, key: 'KONF 3', reward: { credits: 800, xp: 500 } },
  { id: 'sys36', ch: 9, title: 'Wracks', text: 'Jeder Abschuss hinterlässt ein Wrack mit Credits und etwas Tritium. Kurz gehört es nur dir. Flieg über drei.', goal: { type: 'wreck', count: 3 }, reward: { credits: 1000, xp: 600 } },
  { id: 'sys37', ch: 9, title: 'Frachtkisten', text: 'Frachtkisten treiben überall, der Inhalt ist Zufall. Manchmal ist es eine Piratenfalle. Sammle drei.', goal: { type: 'crate', count: 3 }, reward: { credits: 1000, xp: 600, tritium: 10 } },
  { id: 'sys38', ch: 10, title: 'Nickel', text: 'Die grauen Brocken sind Nickel. Flieg dicht ran, dann landet es im Laderaum. 20 Einheiten.', goal: { type: 'ore', ore: 'nickel', count: 20 }, reward: { credits: 1000, xp: 600 } },
  { id: 'sys39', ch: 10, title: 'Cobalt', text: 'Blau ist Cobalt und doppelt so viel wert. 10 Einheiten. Wie viel noch passt, steht im Fenster SCHIFF.', goal: { type: 'ore', ore: 'cobalt', count: 10 }, reward: { credits: 1500, xp: 600 } },
  { id: 'sys40', ch: 11, title: 'Andocken', text: 'Zurück zur Station. In der sicheren Zone dockst du mit E an. Dort heilt die Hülle von selbst.', goal: { type: 'dock' }, key: 'E', reward: { credits: 800, xp: 400 } },
  { id: 'sys41', ch: 11, title: 'Erz verkaufen', text: 'Reiter ERZ: verkauf deine Ladung.', goal: { type: 'sell' }, key: 'ERZ', reward: { credits: 500, xp: 300 } },
  { id: 'sys42', ch: 11, title: 'Nachschub', text: 'Im Shop gibt es Munition in Packungen. Hol dir eine Packung L2.', goal: { type: 'buy', id: 'L2' }, key: 'SHOP', reward: { credits: 800, xp: 300 } },
  { id: 'sys43', ch: 11, title: 'Ion Laser', text: 'Der Ion Laser macht mehr Schaden als der Pulse Laser. Kauf einen, er kommt auf einen freien oder den schwächsten Platz.', goal: { type: 'buy', id: 'ion' }, key: 'SHOP', reward: { credits: 3000, xp: 1200 } },
  { id: 'sys44', ch: 11, title: 'Umbau', text: 'Im Hangar baust du Laser und Generatoren um: mehr Schild oder mehr Tempo. Bau ein Teil um.', goal: { type: 'equip' }, key: 'HANGAR', reward: { credits: 1000, xp: 600 } },
  { id: 'sys45', ch: 11, title: 'Erste eigene Drohne', text: 'Drohnen fliegen mit dir und tragen je einen Laser oder Schildgenerator. Kauf eine Pioneer.', goal: { type: 'drone' }, key: 'SHOP', reward: { credits: 2000, xp: 800 } },
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
      bus.on('rocketHit', (p) => {
        const q = this.current;
        if (q && q.goal.type === 'rocket' && q.goal.lock) { if (world.abilities?.LCK?.activeFor > 0) this._count('rocket', null, 1); }
        else this._count('rocket', p.rocket, 1);
      }),
      bus.on('docked', () => this._count('dock', null, 1)),
      // Wrack: Beute mit Credits ohne Erfahrung/Erz/Munition (Auftragsbelohnungen tragen Erfahrung)
      bus.on('loot', (p) => { if (p && p.credits > 0 && !p.xp && !p.ore && !p.ammo) this._count('wreck', null, 1); }),
      bus.on('ability', (a) => this._ability(a)),
    ];
    this._config = 1;
    this._wrap(world);
  }

  // Spielaktionen ohne eigenes Ereignis: Weltfunktionen schlank umhüllen (nur Erfolg zählt)
  _wrap(world) {
    const ok = (r) => r && (typeof r === 'object' ? r.ok !== false : r !== false && r !== 0);
    const qp = world._questProgress.bind(world);
    world._questProgress = (t, target, n) => { qp(t, target, n); if (t === 'crate') this._count('crate', null, n || 1); if (t === 'ore') this._count('ore', target, n || 1); };
    const buy = world.buy.bind(world);
    world.buy = (kind, id, n) => { const r = buy(kind, id, n); if (ok(r)) { this._count('buy', id, 1); if (kind === 'drone') this._count('drone', null, 1); } return r; };
    const sell = world.sellOre.bind(world);
    world.sellOre = () => { const r = sell(); if (r > 0) this._count('sell', null, 1); return r; };
    const equip = world.equip.bind(world);
    world.equip = (...a) => { const r = equip(...a); if (ok(r)) this._count('equip', null, 1); return r; };
    const cfg = world.setConfig.bind(world);
    world.setConfig = (n) => { const r = cfg(n); if (ok(r)) { this._config = n; this._count('config', n, 1); } return r; };
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
    if (p && p.shieldMax) this._shieldFrac = (p.shield || 0) / p.shieldMax;
    if (!p || w.docked || w.playerDead) return;
    const speed = p.speed || Math.hypot(p.vx || 0, p.vz || 0);
    switch (g.type) {
      case 'fly':
        if (g.camera && this.cameraMode() !== g.camera) return;
        if (g.config && this._config !== g.config) return;
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
    if (g.type === 'tech' && a.kind === 'tech' && a.id === g.id) {
      if (g.hits && a.phase === 'fire' && (a.hits || 0) >= g.hits) this._add(1, 1);
      else if (g.combat && a.phase === 'use' && this._underAttack()) this._add(1, 1);
      else if (g.shieldBelow && a.phase === 'use' && (this._shieldFrac ?? 1) < g.shieldBelow) this._add(1, 1);
      return;
    }
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
    const g = q.goal;
    if (type === 'kill' && g.target && g.target !== what) return;
    if (type === 'shoot' && g.ammo !== what) return;
    if (type === 'rocket' && !g.lock && g.rocket !== what) return;
    if (type === 'ore' && g.ore !== what) return;
    if (type === 'buy' && g.id !== what) return;
    if (type === 'config' && g.n !== what) return;
    // Einmalige Handlungen (Andocken, Verkaufen, Kaufen, Umbau, Drohne, Konfiguration): erledigt beim ersten Mal
    if (['dock', 'sell', 'equip', 'drone', 'config', 'buy'].includes(type)) { this._add(1, 1); return; }
    this._add(n, g.count);
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
