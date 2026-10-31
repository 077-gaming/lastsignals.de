// Alle Spieldaten an einer Stelle. Simulation, Grafik und Oberfläche lesen nur hier.
// Werte sind erste Richtwerte aus der Planung (Vault-Notiz „Weltraum-Browserspiel 3D“).

export const FACTIONS = {
  europa: {
    id: 'europa',
    name: 'EUROPA',
    title: 'Die Bewahrer',
    motto: 'Wir bewahren.',
    alignment: 'gut',
    leader: 'Hüterin Lysandra Vale',
    color: 0xf2efe6,      // Weiß
    accent: 0xd8b25a,     // Gold
    glow: 0xbfe6ff,       // eisiges Triebwerkslicht
    css: { main: '#f2efe6', accent: '#d8b25a', glow: '#bfe6ff' },
    prefix: 'EU',
    story: 'Unter dem Eis des Jupitermondes Europa liegen Forschungsstädte. Im Ozean darunter fanden sie das erste Leben außerhalb der Erde. Seitdem schützen sie alles Leben und das Wissen der Menschheit.',
    stationVoice: 'Station Europa an Pilot',
  },
  saturn: {
    id: 'saturn',
    name: 'SATURN',
    title: 'Die Ringhändler',
    motto: 'Alles hat seinen Preis.',
    alignment: 'mittelböse',
    leader: 'Dockmeister Brann Kessler',
    color: 0xe0782a,      // Bernstein-Orange
    accent: 0x3a3a3e,     // dunkles Metall
    glow: 0xffd2a0,
    css: { main: '#e0782a', accent: '#8a8a90', glow: '#ffd2a0' },
    prefix: 'SA',
    story: 'In den Ringen des Saturn wird alles abgebaut, gehandelt und verkauft, an jeden. Die Gilden sind reich, stolz und vertrauen nur Verträgen.',
    stationVoice: 'Dock Enceladus an Pilot',
  },
  eris: {
    id: 'eris',
    name: 'ERIS',
    title: 'Die Verbannten',
    motto: 'Vom Rand kommt das Ende.',
    alignment: 'böse',
    leader: '„Der Erste“',
    color: 0x1b1a20,      // Schwarz
    accent: 0x8a3cff,     // Violett
    glow: 0xb06bff,
    css: { main: '#2a2830', accent: '#8a3cff', glow: '#b06bff' },
    prefix: 'ER',
    story: 'Eris war das Gefängnis der Erde. Seit der Großen Stille kommt kein Wärter mehr. Die Gefangenen übernahmen die Anlage und fanden im Eis eine Kraft, die violett glüht.',
    stationVoice: 'Gefängnisring Eris an Häftling',
  },
};

// Sektoren: Index 1 bis 3 für den ersten Test Run. Gleiche Gegner in allen drei Heimaten.
// size = halbe Kantenlänge der quadratischen Karte in Metern (Spielebene x/z).
const HOME_NAMES = {
  europa: ['Europa', 'Io', 'Ganymed', 'Kallisto'],
  saturn: ['Enceladus', 'Mimas', 'Tethys', 'Dione'],
  eris: ['Eris', 'Dysnomia', 'Sedna', 'Makemake'],
};

// Kulisse je Heimat (Planet im Hintergrund, Nebelfarbe). Nur Aussehen.
export const BACKDROPS = {
  europa: { planet: { color: 0xc9a27a, bands: true, size: 1.0 }, moon: 0xdfe8ef, nebula: 0x1d3a5a, hazard: 'Strahlungsgürtel' },
  saturn: { planet: { color: 0xd9b77c, bands: true, rings: true, size: 1.1 }, moon: 0xf4f4f4, nebula: 0x4a2a12, hazard: 'Ringtrümmer' },
  eris: { planet: { color: 0x3a3548, bands: false, size: 0.6 }, moon: 0x8a8098, nebula: 0x2a0f45, hazard: 'Extreme Kälte' },
};

// spawns: count = Gesamtzahl; die Simulation verteilt sie in Rudel (pack-Typen 2–4, ein Teil Einzelgänger)
// mit Mindestabstand auf Zonen (ENEMIES[type].habitat: Route Station↔Tor, Felder, freier Raum).
// fields: Kulisse für die Grafik und Zonen für Spawns: { x, z, r, type: 'asteroids'|'debris'|'nebula' }.
// In 'asteroids'-Feldern liegen zusätzlich große Brocken als Entities (kind 'asteroid', sanfte Abstoßung).
// eventPirates: Gegnertypen für Sektor-Ereignisse (Konvoi-Angreifer).
export function sectorsFor(factionId) {
  const f = FACTIONS[factionId];
  const names = HOME_NAMES[factionId];
  const id = (n) => `${f.prefix}-${n}`;
  return {
    [id(1)]: {
      id: id(1), index: 1, name: names[0], levelMin: 1, levelMax: 3, size: 6000,
      station: { x: -3800, z: -3800, name: names[0] },
      portals: [{ x: 4600, z: 4600, to: id(2) }],
      spawns: [{ type: 'raider', count: 24 }, { type: 'larva', count: 28 }],
      crates: 24, ore: { nickel: 24, cobalt: 14 },
      fields: [
        { x: 2600, z: -2900, r: 1500, type: 'asteroids' },
        { x: -3000, z: 2700, r: 1300, type: 'asteroids' },
        { x: 1300, z: -500, r: 800, type: 'debris' },
        { x: -700, z: 4300, r: 1800, type: 'nebula' },
        { x: 4400, z: -600, r: 1400, type: 'nebula' },
      ],
      eventPirates: ['raider'],
    },
    [id(2)]: {
      id: id(2), index: 2, name: names[1], levelMin: 3, levelMax: 6, size: 7000,
      station: null,
      portals: [{ x: -5600, z: -5600, to: id(1) }, { x: 5600, z: 5600, to: id(3) }],
      spawns: [{ type: 'raider', count: 16 }, { type: 'jackal', count: 20 }, { type: 'larva', count: 16 }],
      crates: 26, ore: { nickel: 18, cobalt: 18, platinum: 8 },
      fields: [
        { x: 3300, z: -3600, r: 1700, type: 'asteroids' },
        { x: -3900, z: 3100, r: 1500, type: 'asteroids' },
        { x: 5000, z: 700, r: 1000, type: 'asteroids' },
        { x: -500, z: 500, r: 900, type: 'debris' },
        { x: 0, z: -5200, r: 2000, type: 'nebula' },
      ],
      eventPirates: ['raider', 'jackal'],
    },
    [id(3)]: {
      id: id(3), index: 3, name: names[2], levelMin: 6, levelMax: 10, size: 8000,
      station: null,
      portals: [{ x: -6400, z: -6400, to: id(2) }],
      spawns: [{ type: 'jackal', count: 18 }, { type: 'spiker', count: 18 }, { type: 'vulture', count: 10 }],
      crates: 28, ore: { cobalt: 18, platinum: 14 },
      fields: [
        { x: 3000, z: -3600, r: 2000, type: 'asteroids' },
        { x: -3600, z: 3800, r: 1800, type: 'asteroids' },
        { x: 5200, z: 4300, r: 1500, type: 'asteroids' },
        { x: 0, z: 0, r: 1200, type: 'debris' },
        { x: -5200, z: 0, r: 2200, type: 'nebula' },
      ],
      eventPirates: ['jackal'],
    },
  };
}

// Gegner-Varianten. mult gilt für Leben, Schild und Beute; dmg für den Schaden.
// Elite: kleine Chance bei jedem (Wieder-)Erscheinen. Alpha: selten, höchstens einer je Sektor, mit Extra.
export const VARIANTS = {
  elite: { prefix: 'Elite', chance: 0.06, mult: 3, dmg: 3, scale: 1.15, explode: 1.25 },
  alpha: { prefix: 'Alpha', chance: 0.012, mult: 10, dmg: 6, scale: 1.5, explode: 1.6 },
};
export const ALPHA_PERKS = {
  regen: { name: 'Schild-Regeneration', rate: 0.04 },          // 4 % Schild pro Sekunde
  summon: { name: 'Verstärkung', count: 3, at: [0.75, 0.5, 0.25] }, // ruft bei 75/50/25 % Leben Hilfe
  reflect: { name: 'Schadensspiegel', ratio: 0.15 },            // 15 % des Schadens zurück an den Schützen
};

// Sektor-Ereignisse (zufällig alle paar Minuten). Belohnungen werden mit dem Sektor gestaffelt:
// × (1 + 0,6 × (Sektorindex − 1)), gerundet auf 100 (Credits/Erfahrung) bzw. ganze Zahlen.
export const SECTOR_EVENTS = {
  convoy: {
    title: 'Konvoi unter Beschuss', weight: 1, duration: 240, attackers: [4, 6],
    freighter: { name: 'Frachter Kestrel', hp: 12000, shield: 4000, radius: 60, speed: 18, leaveSpeed: 140 },
    reward: { credits: 8000, tritium: 30, xp: 4000, honor: 25 },
  },
  drift: {
    title: 'Treibgut-Feld', weight: 1, duration: 150, crates: [8, 12],
    reward: { credits: 3000, tritium: 10, xp: 1500, honor: 5 }, // Bonus, wenn alle Crates eingesammelt sind
  },
  nest: {
    title: 'Schwarm-Nest', weight: 1, duration: 420, interval: 8, maxLarvae: 6, startLarvae: 3,
    // je Sektorindex 1, 2, 3+: Leben/Schild des Nests × Faktor, höchstens so viele Larven gleichzeitig
    hpScale: [0.4, 0.7, 1], larvaeBySector: [4, 5, 6],
    reward: { credits: 4000, tritium: 20, xp: 3000, honor: 20 }, // zusätzlich zur Beute des Nests
  },
};
export const EVENT_FIRST = [60, 90];       // erstes Ereignis nach so vielen Sekunden im Sektor
export const EVENT_INTERVAL = [150, 240];  // Pause zwischen zwei Ereignissen

// Treibgut-Crates (Ereignis): keine Fallen, bessere Ausbeute.
export const DRIFT_CRATE_TABLE = [
  { chance: 0.5, credits: [800, 2500] },
  { chance: 0.25, tritium: [5, 15] },
  { chance: 0.15, ammo: ['L2', 100, 300] },
  { chance: 0.1, ammo: ['L3', 50, 150] },
];

// Verhalten: aggressive = greift an, wenn du nah bist · passive = nur wenn angegriffen
// opportunist = greift an, wenn dein Leben unter 70 % ist · thief = klaut Wracks und Beute
// habitat: Anteile, wo Rudel erscheinen (route = Flugroute Station↔Tor, asteroids/debris = Felder, open = freier Raum).
// explode: Größe der Explosion (1 klein … 4 groß).
// territorial = greift an, wenn du in sein Revier (aggroRange) fliegst · nest = steht still (Ereignis)
// level: Gegnerstufe für die Staffelung der Belohnung (REWARD_SCALE).
// ai: Persönlichkeit (Simulation, src/sim/ai.js):
//   style: 'pack' (Rudel umkreist dich und greift von mehreren Seiten an) · 'swarm' (umzingelt eng)
//          'ambush' (lauert getarnt, springt Angeschlagene an) · 'kite' (hält Abstand, schießt aus der Ferne)
//          'thief' (schnappt Beute und flieht) · 'nest' (steht still)
//   orbit: Kreisradius im Angriff × Reichweite · special: Spezialangriff aus SPECIALS · specialCd: Abklingzeit [s]
//   retreatHp: unter diesem Lebensanteil Rückzug zum Heilen (einmal je Leben, 0 = nie) · cover: nutzt Asteroiden als Deckung
//   call: ruft ein ruhiges Rudel derselben Gruppe zu Hilfe · guard: zieht bei schwerem Beschuss einen Schildwall hoch
//   dodge: Neigung, dem Beschuss seitlich auszuweichen (0..1) · spDamage: Schaden des Spezialangriffs statt damage
export const ENEMIES = {
  raider: {
    name: 'Raider', group: 'pirate', behavior: 'aggressive', pack: true, level: 1,
    hp: 1100, shield: 550, speed: 210, damage: 38, range: 420, fireRate: 1.0, aggroRange: 600, radius: 18,
    loot: { credits: 400, tritium: 1, xp: 400, honor: 2 }, color: 0x7a7f88, accent: 0xff5a3a,
    habitat: { route: 0.55, debris: 0.15, open: 0.3 }, explode: 1.2,
    ai: { style: 'pack', orbit: 0.75, special: 'volley', specialCd: [7, 11], retreatHp: 0.25, cover: false, call: true, guard: false, dodge: 0.5 },
  },
  larva: {
    name: 'Larva', group: 'swarm', behavior: 'territorial', pack: true, level: 1,
    hp: 450, shield: 0, speed: 170, damage: 18, range: 140, fireRate: 1.0, aggroRange: 300, radius: 12,
    loot: { credits: 300, tritium: 1, xp: 300, honor: 1 }, color: 0x6fae4a, accent: 0xc8ff6a,
    habitat: { asteroids: 0.7, open: 0.3 }, explode: 0.9,
    ai: { style: 'swarm', orbit: 0.8, special: 'leap', specialCd: [6, 10], retreatHp: 0, cover: false, call: true, guard: false, dodge: 0.25 },
  },
  jackal: {
    name: 'Jackal', group: 'pirate', behavior: 'opportunist', pack: true, level: 4,
    hp: 2600, shield: 1300, speed: 240, damage: 72, range: 450, fireRate: 1.0, aggroRange: 650, radius: 22,
    loot: { credits: 800, tritium: 2, xp: 800, honor: 4 }, color: 0x5a5148, accent: 0xffa23a,
    habitat: { route: 0.55, debris: 0.15, open: 0.3 }, explode: 1.8,
    ai: { style: 'ambush', orbit: 0.7, special: 'ram', specialCd: [6, 9], retreatHp: 0.3, cover: false, call: true, guard: false, dodge: 0.7 },
  },
  spiker: {
    name: 'Spiker', group: 'swarm', behavior: 'aggressive', pack: false, level: 7,
    hp: 3600, shield: 1800, speed: 150, damage: 95, range: 650, fireRate: 0.8, aggroRange: 750, radius: 26,
    loot: { credits: 1200, tritium: 3, xp: 1200, honor: 6 }, color: 0x4f7d3a, accent: 0xe6ff7a,
    habitat: { asteroids: 0.65, open: 0.35 }, explode: 2.2,
    ai: { style: 'kite', orbit: 0.85, special: 'acid', specialCd: [8, 12], retreatHp: 0.4, cover: true, call: false, guard: false, dodge: 0.3 },
  },
  vulture: {
    name: 'Vulture', group: 'pirate', behavior: 'thief', pack: false, level: 8,
    hp: 4400, shield: 2200, speed: 260, damage: 80, range: 420, fireRate: 1.0, aggroRange: 500, radius: 24,
    loot: { credits: 1600, tritium: 4, xp: 1600, honor: 8 }, color: 0x3e3a3a, accent: 0xff3a6a,
    habitat: { route: 0.4, debris: 0.3, open: 0.3 }, explode: 2.4,
    ai: { style: 'thief', orbit: 0.75, special: 'volley', specialCd: [8, 12], retreatHp: 0.35, cover: true, call: false, guard: true, dodge: 0.4 },
  },
  // Nur im Ereignis „Schwarm-Nest“: steht still, spuckt Larven aus und Säure, bis es zerstört ist.
  nest: {
    name: 'Swarm Nest', group: 'swarm', behavior: 'nest', pack: false, eventOnly: true, level: 3,
    hp: 12000, shield: 6000, speed: 0, damage: 0, range: 0, fireRate: 0, aggroRange: 0, radius: 55,
    loot: { credits: 5000, tritium: 25, xp: 5000, honor: 25 }, color: 0x3f6a2c, accent: 0xd8ff5a,
    habitat: { asteroids: 1 }, explode: 4,
    ai: { style: 'nest', orbit: 0, special: 'acid', specialCd: [9, 13], retreatHp: 0, cover: false, call: false, guard: false, dodge: 0, spDamage: 45, spRange: 900 },
  },
};

// Angekündigte Spezialangriffe: erst 'telegraph' (Aufladen mit Warnung, delay s), dann Ausführung.
// Wer rechtzeitig aus der Gefahrenzone fliegt, bekommt nichts ab. Schwerer Treffer (Rakete, ≥ 10 % Leben+Schild) bricht das Aufladen ab.
// Gezielt wird beim Aufladen auf deine Position in lead Sekunden (bei gleichem Kurs): Kurs oder Tempo ändern = ausweichen.
//   volley: Salve entlang einer festen Linie (shots Schüsse im Abstand gap, je dmg × Schaden), Breite width, Länge rangeK × Reichweite
//   ram / leap: Rammangriff / Sprungbiss: Sturz entlang einer festen Linie (speedK × Tempo, höchstens time s), Treffer dmg × Schaden + Stoß knock m/s
//   acid: Säurewolke an deiner (vorausberechneten) Position, Radius radius, wirkt duration s mit dps × Schaden je Sekunde
//   guard: Schildwall (nimmt duration s lang nur (1 − reduce) des Schadens), ausgelöst durch trigger × (Leben + Schild) Schaden in ~2 s
export const SPECIALS = {
  volley: { name: 'Salve', delay: 1.1, lead: 0.9, shots: 5, gap: 0.09, dmg: 2.0, width: 45, rangeK: 1.6 },
  ram: { name: 'Rammangriff', delay: 0.9, lead: 1.1, dmg: 6, width: 22, speedK: 2.7, time: 1.1, over: 260, knock: 230 },
  leap: { name: 'Sprungbiss', delay: 0.7, lead: 0.7, dmg: 4, width: 18, speedK: 2.4, time: 0.8, over: 120, knock: 110 },
  acid: { name: 'Säurewolke', delay: 1.5, lead: 1.2, radius: 170, duration: 5, dps: 0.8 },
  guard: { name: 'Schildwall', delay: 0.35, duration: 3, reduce: 0.65, trigger: 0.12, cd: [9, 13] },
};

// Belohnungen staffeln: × Typ (loot) × Elite/Alpha (VARIANTS.mult) × Sektor (Index 1, 2, 3 …) × Stufenabstand Spieler ↔ Gegner.
// Gegnerstufe = ENEMIES[type].level; für den Abzug zählt Elite +2, Alpha +5 Stufen. Liegt der Spieler mehr als freeLevels Stufen
// darüber, gibt es je weitere Stufe perLevel weniger Erfahrung/Ehre (Untergrenze minXp/minHonor) und creditsPerLevel weniger Credits
// (Untergrenze minCredits). Stärkere Gegnertypen bringen je Stufe bonusPerLevel mehr (höchstens bonusMax).
// Combo: jeder Abschuss innerhalb von window s nach dem letzten steigert den Bonus um step (höchstens max) auf Erfahrung,
// Ehre und Credits dieses Abschusses (Credits-Bonus liegt im Wrack).
export const REWARD_SCALE = {
  sector: [1, 1.25, 1.55],
  freeLevels: 1, perLevel: 0.22, minXp: 0.1, minHonor: 0.1, minCredits: 0.4, creditsPerLevel: 0.1,
  bonusPerLevel: 0.08, bonusMax: 0.4,
  rankLevel: { normal: 0, elite: 2, alpha: 5 },
};
export const COMBO = { window: 6, step: 0.15, max: 0.6 };

// Laser: Schaden pro Schuss, ein Schuss pro Sekunde und Laser.
export const LASERS = {
  pulse: { name: 'Pulse Laser', damage: 70, price: 2500, currency: 'credits', color: 0xff4a4a },
  ion: { name: 'Ion Laser', damage: 100, price: 15000, currency: 'credits', color: 0x4ab8ff },
  plasma: { name: 'Plasma Laser', damage: 150, price: 10000, currency: 'tritium', color: 0x7aff8a },
  gamma: { name: 'Gamma Laser', damage: 200, price: null, currency: null, color: 0xff3aff, dropOnly: true },
};

// Munition: mult = Schadensfaktor. SAB saugt Schild ab. SAL hat eine eigene Nachladezeit.
export const AMMO = {
  L1: { name: 'L1', mult: 1, price: 10, currency: 'credits', pack: 1000, key: '1' },
  L2: { name: 'L2', mult: 2, price: 1, currency: 'credits', pack: 1000, key: '2', priceNote: '1.000 Credits je 1.000' },
  L3: { name: 'L3', mult: 3, price: 0.5, currency: 'tritium', pack: 500, key: '3' },
  L4: { name: 'L4', mult: 4, price: 2, currency: 'tritium', pack: 250, key: '4' },
  SAB: { name: 'SAB', mult: 2, shieldOnly: true, drainReturn: 0.5, price: 1, currency: 'tritium', pack: 500, key: '5' },
  SAL: { name: 'SAL', mult: 6, ownCooldown: 4.0, price: 2, currency: 'tritium', pack: 100, key: '6' },
};
// L1 kostet 10 Credits pro 1.000 Schuss: billigste Munition, praktisch immer da.

// Raketen (Vault Nr. 11): R1 und R2 für Credits, R3 für Tritium. Ein gemeinsamer Werfer: nach dem Abschuss lädt er
// cooldown s (je Sorte), Taste R feuert die zuletzt gewählte Sorte. price = je Stück.
// Schaden R2/R3 Richtwert nach Vorbild (1.000 / 2.000 / 4.000). Raketen treffen nicht, wenn das Ziel gerade ausweicht
// (ROCKET_RULES.dodgeMiss) oder hinter einem Asteroiden steckt; Tech LCK lässt 15 s lang jede Rakete treffen.
export const ROCKETS = {
  R1: { name: 'R1', damage: 1000, cooldown: 3.0, price: 50, currency: 'credits', pack: 50, key: 'r' },
  R2: { name: 'R2', damage: 2000, cooldown: 3.0, price: 150, currency: 'credits', pack: 25, key: 'r' },
  R3: { name: 'R3', damage: 4000, cooldown: 4.0, price: 3, currency: 'tritium', pack: 25, key: 'r' },
};
export const ROCKET_RULES = { dodgeMiss: 0.5 }; // Chance, dass eine Rakete ein ausweichendes Ziel verfehlt

// ───────────── Extras, Minen, Techs, Formationen, Konfigurationen (Schnellleiste) ─────────────
// Herkunft: Vault-Notiz „Weltraum-Browserspiel 3D“ Nr. 12, 14, 15, 16, 19, 23 (Toni, 29.10.2026). Dort stehen Wirkung,
// Kürzel und Währung; Zahlen (Abklingzeit, Radius, Schaden, Preis) sind Richtwerte der Simulation (30.10.2026), hier
// gesammelt, damit sie an einer Stelle angepasst werden. Vorrat liegt in profile.extras[id] bzw. profile.techs[id].
// price = je Stück. cooldown = Abklingzeit in s nach dem Einsatz. Alles nur außerhalb der sicheren Zone (außer JMP/RSV/FIX).
export const EXTRAS = {
  // „löst Zielerfassung und Tarnung“: Gegner im Umkreis verlieren dich (jam s lang keine neue Erfassung),
  // getarnte Gegner werden sichtbar, laufende Spezialangriffe brechen ab.
  EMP: { name: 'EMP', title: 'EMP', price: 20, currency: 'tritium', cooldown: 45, radius: 700, jam: 3 },
  // Sofortschild: 3 s unverwundbar (Vault), Schiessen bleibt erlaubt.
  SOS: { name: 'SOS', title: 'Sofortschild', price: 20, currency: 'tritium', cooldown: 60, duration: 3 },
  // Bombe: Schaden an allen Gegnern im Umkreis.
  BMB: { name: 'BMB', title: 'Bombe', price: 15, currency: 'tritium', cooldown: 30, radius: 450, damage: 1500 },
  // Tarnung: nur außerhalb des Kampfes (calm s ohne Kampf), Gegner sehen dich nicht, bis du angreifst
  // (Laser, Rakete, Bombe, Tech-Blitz) oder höchstens duration s vergangen sind. EMP und STM holen Getarnte raus.
  TRN: { name: 'TRN', title: 'Tarnung', price: 25, currency: 'tritium', cooldown: 30, duration: 120, calm: 5 },
  // Sprung in einen Heimatsektor mit Ladezeit (charge s). Ohne Ziel: nächster Heimatsektor (-1 → -2 → -3 → -1).
  JMP: { name: 'JMP', title: 'Sprung-Extra', price: 50, currency: 'tritium', cooldown: 60, charge: 8 },
};
// Minen (Vault Nr. 12): werden hinter dem Schiff abgelegt, scharf nach arm s, zünden, wenn ein Gegner trigger m nah kommt
// (Wirkung im Umkreis radius), verfallen nach life s. Höchstens MINE_RULES.max gleichzeitig, zwischen zwei Minen
// MINE_RULES.gap s. Minen treffen nur Gegner. Währung Credits (Vault nennt keine; Minen sind Verbrauchsware).
export const MINES = {
  SPM: { name: 'SPM', title: 'Sprengmine', price: 400, currency: 'credits', arm: 1, trigger: 120, radius: 230, damage: 2500, life: 60 },
  BRM: { name: 'BRM', title: 'Bremsmine', price: 300, currency: 'credits', arm: 1, trigger: 140, radius: 280, slow: 0.5, duration: 6, life: 60 },
  STM: { name: 'STM', title: 'Störmine', price: 300, currency: 'credits', arm: 1, trigger: 140, radius: 320, jam: 4, life: 60 },
};
export const MINE_RULES = { max: 6, gap: 2, behind: 70 };
// Techs (Vault Nr. 16): später aus der Werkstatt (Rohstoffe + Credits/Tritium + Wartezeit); bis dahin kaufbar zum Preis.
export const TECHS = {
  VMP: { name: 'VMP', title: 'Energie saugen', price: 6000, currency: 'credits', cooldown: 90, duration: 10, leech: 0.15 }, // 15 % des Laserschadens heilt die Hülle
  ARC: { name: 'ARC', title: 'Kettenblitz', price: 8000, currency: 'credits', cooldown: 60, targets: 5, damage: 1500, range: 650, hop: 450 }, // springt von Ziel zu Ziel (höchstens hop m)
  LCK: { name: 'LCK', title: 'Zielsperre', price: 5000, currency: 'credits', cooldown: 90, duration: 15 }, // alle Raketen treffen
  RSV: { name: 'RSV', title: 'Reserveschild', price: 30, currency: 'tritium', cooldown: 60 },            // Schild sofort voll
  FIX: { name: 'FIX', title: 'Kampfreparatur', price: 6000, currency: 'credits', cooldown: 90, duration: 10, rate: 0.05 }, // 5 % Hülle je Sekunde
};
// Formationen (Vault Nr. 19, 16 von Toni abgesegnet): bis die Drohnen kommen nur ein Zustand (world.formation),
// den Grafik und spätere Drohnen lesen. Standard, Wall, Spear für Credits, die meisten für Tritium,
// Gyro, Vortex, Crown nur aus Events oder Toren (eventOnly, nicht kaufbar). Preise Richtwert.
export const FORMATIONS = {
  standard: { name: 'Standard', price: 0, currency: null },
  wall: { name: 'Wall', price: 25000, currency: 'credits' },
  spear: { name: 'Spear', price: 25000, currency: 'credits' },
  ring: { name: 'Ring', price: 1500, currency: 'tritium' },
  gyro: { name: 'Gyro', price: null, currency: null, eventOnly: true },
  dome: { name: 'Dome', price: 1500, currency: 'tritium' },
  helix: { name: 'Helix', price: 1500, currency: 'tritium' },
  comet: { name: 'Comet', price: 1500, currency: 'tritium' },
  claw: { name: 'Claw', price: 1500, currency: 'tritium' },
  swarm: { name: 'Swarm', price: 1500, currency: 'tritium' },
  star: { name: 'Star', price: 1500, currency: 'tritium' },
  wing: { name: 'Wing', price: 1500, currency: 'tritium' },
  pulse: { name: 'Pulse', price: 1500, currency: 'tritium' },
  vortex: { name: 'Vortex', price: null, currency: null, eventOnly: true },
  halo: { name: 'Halo', price: 1500, currency: 'tritium' },
  crown: { name: 'Crown', price: null, currency: null, eventOnly: true },
};
export const FORMATION_RULES = { cooldown: 5 };   // Wechsel höchstens alle 5 s
// Konfigurationen (Vault Nr. 23): 3 je Schiff, im Flug umschaltbar, jede mit eigener Verteilung von Lasern und
// Generatoren (aus allem, was du besitzt), kurze Abklingzeit nach dem Wechsel. Schild behält seinen Anteil.
export const CONFIG_RULES = { count: 3, cooldown: 5 };

// Erprobungspaket (30.10.2026): damit sich alles sofort ausprobieren lässt. Neue Piloten starten damit, bestehende
// Spielstände bekommen es einmal (profile.kit), Werte werden nur aufgefüllt, nie gekürzt.
export const STARTER_KIT = {
  ammo: { L2: 1000, L3: 500, L4: 100, SAB: 250, SAL: 100, R1: 30, R2: 10, R3: 5 },
  extras: { EMP: 3, SOS: 3, BMB: 3, TRN: 2, JMP: 2, SPM: 6, BRM: 4, STM: 4 },
  techs: { VMP: 2, ARC: 2, LCK: 2, RSV: 2, FIX: 2 },
  formations: ['standard', 'wall', 'spear', 'ring', 'helix', 'swarm', 'wing', 'star', 'pulse'],
  gens: ['sh1', 'dr1'],             // je ein zusätzlicher SH-1 und DR-1 für Konfiguration 2 (Schild) und 3 (Tempo)
};
export const KIT_VERSION = 1;

// ───────────── Drohnen (Vault Nr. 17–19, Toni 29./30.10.2026) ─────────────
// Vault: bis zu 8 normale Drohnen; jede trägt sichtbar einen Laser (mehr Schaden) oder einen Schildgenerator (mehr
// Schild); Stufen 1–10 je einzelner Drohne durch Kämpfen; Drohnen nehmen Schaden, Reparatur kostet Credits, wer sie
// kaputtgehen lässt, verliert eine Stufe. Pioneer für Credits kaufen → hochspielen → teurer verkaufen (frühe
// Einnahmequelle). Voyager (Tritium), Cassini/Juno (Platz 9/10, nur aus Toren) folgen, sobald Toni die Modelle freigibt.
// Alle Zahlen (Preis, Schaden, Schild, Erfahrung, Verkauf, Verschleiß, Reparatur) sind Richtwerte der Simulation
// (30.10.2026, nicht im Vault festgelegt) und hier gesammelt.
//   laser[n]  Schaden je Schuss auf Stufe n (ein Schuss je Sekunde, × Faktor der gewählten Munition, verbraucht 1 Schuss)
//   shield[n] Schild auf Stufe n (zählt zum Schiffsschild)
export const DRONES = {
  pioneer: {
    name: 'Pioneer', price: 12000, currency: 'credits', level: 1,
    laser: [45, 50, 55, 60, 66, 72, 78, 85, 92, 100],
    shield: [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700],
  },
};
export const DRONE_RULES = {
  max: 8,                 // normale Drohnenplätze (Cassini/Juno später Platz 9/10)
  maxLevel: 10,
  // Drohnen-Erfahrung insgesamt für Stufe 1 … 10 (jede Drohne einzeln)
  xp: [0, 600, 1500, 3000, 5000, 8000, 12000, 17000, 24000, 33000],
  xpShare: 0.1,           // je Abschuss bekommt jede einsatzbereite Drohne 10 % der (gestaffelten) Erfahrung
  // Verkauf: Anteil am Kaufpreis je Stufe 1 … 10 (ab Stufe 4 Gewinn); kaputte Drohnen minus Reparaturkosten
  sell: [0.5, 0.75, 1.0, 1.25, 1.5, 1.8, 2.1, 2.4, 2.7, 3.0],
  // Verschleiß: Zustand 0–100 %. Hüllenschaden am Schiff kostet jede Drohne wear × Anteil der Hülle (100 % Hülle
  // verloren = −40 %), ein Abschuss des Schiffs zusätzlich −30 %. Bei 0 % ist die Drohne kaputt: fliegt nicht mehr
  // mit, verliert eine Stufe (Erfahrung auf den Anfang der neuen Stufe), bis sie in der Station repariert ist.
  wear: 40, wearOnDeath: 30, warnAt: 30,
  // Reparatur in der Station: Credits je fehlendem Prozent = Kaufpreis × repair × (1 + 0,15 × (Stufe − 1))
  repair: 0.004, repairLevel: 0.15,
  fireJitter: 0.08,       // Drohnenlaser feuern leicht versetzt zueinander
};
// Startprofil (Toni 30.10.2026): 2 Pioneer, eine mit Laser, eine mit Schild. Bestehende Spielstände bekommen sie
// einmal (profile.droneKit), wenn sie noch keine Drohne haben.
export const STARTER_DRONES = [{ type: 'pioneer', module: 'laser' }, { type: 'pioneer', module: 'shield' }];
export const DRONE_KIT_VERSION = 1;
// Shop-Tabelle (Station): je Drohnentyp und Modul ein Artikel, id 'pioneer-laser' | 'pioneer-shield'
export const DRONE_SHOP = {};
for (const t in DRONES) for (const m of ['laser', 'shield']) {
  const d = DRONES[t];
  DRONE_SHOP[`${t}-${m}`] = { name: `${d.name} · ${m === 'laser' ? 'Laser' : 'Schild'}`, type: t, module: m, price: d.price, currency: d.currency, level: d.level };
}

export const GENERATORS = {
  dr1: { name: 'DR-1', kind: 'speed', value: 20, price: 4000, currency: 'credits' },
  sh1: { name: 'SH-1', kind: 'shield', value: 2000, price: 8000, currency: 'credits' },
};

// Schiffsreihe: Nr. 1 und 2 im Test spielbar, Rest als Ausblick im Hangar.
export const SHIPS = {
  s1: { no: 1, name: 'Starter', hp: 6000, speed: 320, laserSlots: 2, genSlots: 2, cargo: 100, level: 1, price: 0, currency: null },
  s2: { no: 2, name: 'Schiff 2', hp: 16000, speed: 300, laserSlots: 4, genSlots: 3, cargo: 300, level: 5, price: 60000, currency: 'credits' },
  s3: { no: 3, name: 'Schiff 3', hp: 32000, speed: 290, laserSlots: 5, genSlots: 5, cargo: 500, level: 10, price: 250000, currency: 'credits', locked: true },
  s5: { no: 5, name: 'Schiff 5', hp: 90000, speed: 300, laserSlots: 8, genSlots: 8, cargo: 1000, level: 20, price: 40000, currency: 'tritium', locked: true },
  s8: { no: 8, name: 'Top-Kampfschiff', hp: 250000, speed: 320, laserSlots: 13, genSlots: 13, cargo: 3000, level: 45, price: 250000, currency: 'tritium', locked: true },
};

export const ORES = {
  nickel: { name: 'Nickel', price: 10, color: 0x9a9a9a },
  cobalt: { name: 'Cobalt', price: 20, color: 0x3a6aff },
  platinum: { name: 'Platinum', price: 60, color: 0xe8e8f0 },
};

// Crates: zufälliger Inhalt, wer zuerst drüberfliegt.
export const CRATE_TABLE = [
  { chance: 0.55, credits: [500, 2000] },
  { chance: 0.25, ammo: ['L1', 200, 600] },
  { chance: 0.12, tritium: [5, 20] },
  { chance: 0.06, ammo: ['L2', 100, 300] },
  { chance: 0.02, trap: true }, // Piratenfalle: drei Raider
];

export const RANKS = [
  'Cadet', 'Pilot', 'Senior Pilot', 'Flight Officer', 'Ensign', 'Sub-Lieutenant', 'Lieutenant',
  'Lieutenant Commander', 'Commander', 'Senior Commander', 'Captain', 'Senior Captain', 'Fleet Captain',
  'Commodore', 'Rear Admiral', 'Vice Admiral', 'Admiral', 'Fleet Admiral',
];

// Erfahrung, die man insgesamt für Stufe n braucht (Stufe 1 = 0).
export function xpForLevel(n) {
  if (n <= 1) return 0;
  return Math.round(4000 * Math.pow(n - 1, 2.2));
}
export const MAX_LEVEL = 50;

// Erste Quests (Funkspruch der Station). Typen: kill, crate, buy, jump, ore.
export const QUESTS = [
  { id: 'q1', title: 'Erster Kontakt', text: 'Raider greifen unsere Frachter an. Zerstöre 5 Raider.', goal: { type: 'kill', target: 'raider', count: 5 }, reward: { credits: 5000, xp: 2000, honor: 20 } },
  { id: 'q2', title: 'Treibgut', text: 'Im Sektor schweben Crates. Sammle 3 davon ein.', goal: { type: 'crate', count: 3 }, reward: { credits: 3000, xp: 1500, tritium: 20 } },
  { id: 'q3', title: 'Aufrüsten', text: 'Fliege zur Station und kaufe einen Ion Laser. Du siehst ihn sofort am Schiff.', goal: { type: 'buy', target: 'ion', count: 1 }, reward: { credits: 2000, xp: 2000 } },
  { id: 'q4', title: 'Die Brut', text: 'Larven vermehren sich im Sektor. Zerstöre 8 Larva.', goal: { type: 'kill', target: 'larva', count: 8 }, reward: { credits: 6000, xp: 4000, tritium: 30 } },
  { id: 'q5', title: 'Hinaus', text: 'Spring durch das Sprungtor in den nächsten Sektor.', goal: { type: 'jump', target: 2, count: 1 }, reward: { credits: 4000, xp: 3000 } },
  { id: 'q6', title: 'Schakale', text: 'Jackals lauern auf angeschlagene Piloten. Zerstöre 6 Jackal.', goal: { type: 'kill', target: 'jackal', count: 6 }, reward: { credits: 15000, xp: 10000, tritium: 80, honor: 60 } },
  { id: 'q7', title: 'Tiefer', text: 'Erreiche Sektor 3 und zerstöre 4 Spiker.', goal: { type: 'kill', target: 'spiker', count: 4 }, reward: { credits: 30000, xp: 25000, tritium: 200, honor: 120 } },
];

// Reparatur nach dem Abschuss (Kosten × Schiffsnummer). Bis Stufe 10 kostenlos.
export const REPAIR = {
  station: { credits: 1000 },
  portal: { credits: 5000 },
  here: { tritium: 50 },
  freeUntilLevel: 10,
};

// Startprofil eines neuen Piloten.
export function newProfile(callsign, factionId) {
  return {
    version: 1,
    callsign,
    faction: factionId,
    created: new Date().toISOString(),
    level: 1, xp: 0, honor: 0, rankPoints: 0,
    credits: 20000, tritium: 50,
    ship: 's1',
    loadout: { lasers: ['pulse', 'pulse'], gens: ['sh1', 'dr1'] },
    owned: { lasers: [], gens: STARTER_KIT.gens.slice(), ships: ['s1'], formations: STARTER_KIT.formations.slice() },
    ammo: { L1: 5000, L2: 0, L3: 0, L4: 0, SAB: 0, SAL: 0, R1: 0, R2: 0, R3: 0, ...STARTER_KIT.ammo },
    selectedAmmo: 'L1',
    selectedRocket: 'R1',
    extras: { ...STARTER_KIT.extras },
    techs: { ...STARTER_KIT.techs },
    formation: 'standard',
    // Konfigurationen je Schiff: 1 ausgewogen, 2 Schild (2× SH-1), 3 Tempo (2× DR-1)
    configs: { cur: 1, sets: { s1: [
      { lasers: ['pulse', 'pulse'], gens: ['sh1', 'dr1'] },
      { lasers: ['pulse', 'pulse'], gens: ['sh1', 'sh1'] },
      { lasers: ['pulse', 'pulse'], gens: ['dr1', 'dr1'] },
    ] } },
    kit: KIT_VERSION,
    drones: STARTER_DRONES.map((d, i) => ({ id: 'd' + (i + 1), type: d.type, module: d.module, level: 1, xp: 0, hp: 100, broken: false })),
    droneSeq: STARTER_DRONES.length,
    droneKit: DRONE_KIT_VERSION,
    cargo: { nickel: 0, cobalt: 0, platinum: 0 },
    sector: `${FACTIONS[factionId].prefix}-1`,
    quest: { index: 0, progress: 0 },
    stats: { kills: {}, crates: 0, deaths: 0, playSeconds: 0 },
  };
}
