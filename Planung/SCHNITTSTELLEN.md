# Schnittstellen (verbindlich für alle Module)

Technik: Vite 5 + three@0.170.0 (npm, `import * as THREE from 'three'`, Zusätze aus `three/examples/jsm/...`). Reines JavaScript (ES-Module), kein TypeScript. Alle Texte für Spieler auf Deutsch, Gegenstände/Gegner englisch (wie in `src/core/data.js`). Keine Töne. Keine externen Bilder oder Schriften laden – alles prozedural bzw. Systemschrift (`-apple-system, "SF Pro Text"`, Zahlen/Telemetrie `"SF Mono", ui-monospace, Menlo`).

## Dateien und Zuständigkeit

| Datei | Inhalt | Wer |
|---|---|---|
| `src/core/data.js` | alle Spieldaten | Simulation pflegt, alle anderen nur lesen |
| `src/core/events.js` | `Bus` mit `on/off/emit` (`'*'` hört alles) | fertig |
| `src/core/store.js` | `store.list/get/create/save/remove/lastCallsign` | fertig |
| `src/sim/world.js` (+ weitere `src/sim/*.js`) | Simulation | Simulation |
| `src/render/renderer.js` (+ weitere `src/render/*.js`) | 3D-Grafik und Effekte | Grafik |
| `src/ui/hud.js`, `src/ui/station.js`, `src/ui/hud.css` | Anzeige im Flug, Station/Hangar | HUD |
| `src/ui/screens.js`, `src/ui/screens.css` | Laden, Anmeldung, Fraktionswahl, Hub, Startsequenz | Screens |
| `src/main.js`, `index.html`, `src/input.js` | Zusammenbau, Eingabe | Claude |

## Koordinaten

Die Spielwelt ist eine Ebene: Simulation rechnet in `x` und `z` (Meter), `y` ist immer 0 (Grafik darf Höhe nur für Optik nutzen). `rot` = Blickrichtung in Radiant, 0 = Richtung −z, positiv gegen den Uhrzeigersinn von oben gesehen; Richtungsvektor = `(-Math.sin(rot), -Math.cos(rot))` für `(x, z)`. Kartenmitte ist (0,0), Karte geht von `-size` bis `+size`.

## Simulation: `src/sim/world.js`

```js
export class World {
  constructor(profile, bus)      // profile aus store, bus = new Bus()
  sector                         // Objekt aus sectorsFor(profile.faction)[profile.sector]
  entities                       // Map<id, Entity>
  player                         // Entity des Spielers (id 'player')
  time                           // Sekunden seit Start (Simulationszeit)
  update(dt)                     // feste Schrittweite 1/60 s, wird von main.js aufgerufen
  // Befehle (alle von main.js/input.js aufgerufen):
  moveTo(x, z)
  stopMove()
  setTarget(id | null)
  toggleAttack()                 // Angriff auf Ziel an/aus
  selectAmmo(key)                // 'L1'..'L4','SAB','SAL'
  fireSal()                      // SAL-Schuss (eigene Nachladezeit), dann automatisch zurück zur gewählten Munition
  fireRocket()                   // R1 auf Ziel
  startEvent(type)               // Sektor-Ereignis sofort starten: 'convoy'|'drift'|'nest'|null (Zufall); für Tests/Entwickler
  tryJump()                      // springt, wenn Spieler in 150 m um ein Portal steht
  dock()                         // nur in sicherer Zone der Station (Radius 400)
  undock()
  repair(where)                  // 'station' | 'portal' | 'here' nach Abschuss
  buy(kind, id, amount)          // kind: 'laser'|'gen'|'ammo'|'rocket'|'ship'; prüft Geld, Stufe
  equip(slotKind, index, itemId) // 'laser'|'gen'
  sellOre()
  save()                         // schreibt profile über store.save
}
```

**Entity** (einfaches Objekt, Grafik liest nur):
```js
{ id, kind: 'player'|'enemy'|'crate'|'wreck'|'station'|'portal'|'ore'|'freighter'|'asteroid',
  type,                 // enemy: Schlüssel aus ENEMIES (auch 'nest'); ore: 'nickel'|...; portal: Ziel-Sektor-ID
                        // crate: null (normal) | 'drift' (Treibgut-Ereignis); freighter: 'convoy'; asteroid: 'rock'
  faction,              // nur player: 'europa'|'saturn'|'eris'
  x, z, vx, vz, rot, radius,
  hp, hpMax, shield, shieldMax,
  targetId, attacking, // Angriff läuft
  alive, safe,          // safe = in sicherer Zone
  name,                 // Anzeigename (Spieler: Rufname, Gegner: ENEMIES[type].name)
  loadout,              // nur player: { lasers: [...], gens: [...] } für sichtbare Teile
  ship,                 // nur player: 's1' | 's2'
  owner, protectedUntil, // nur wreck: Beuteschutz
  px, pz, prot,         // Position/Drehung vor dem letzten Simulationsschritt (für weiche Darstellung)
  speed, thrust,        // alle bewegten: aktuelles Tempo in m/s und Schubstärke 0..1 (Triebwerk/Schweif)
                        //   Spieler: 1 = volle Beschleunigung, ≈ 0,55 × Tempoanteil im Reiseflug, 0 = Bremsen/Leerlauf
  // nur enemy:
  rank,                 // 'normal' | 'elite' | 'alpha' (name dann „Elite Raider“ / „Alpha Raider“, radius ×1,15 / ×1,5)
  perk,                 // nur alpha: 'regen' (Schild lädt) | 'summon' (ruft Verstärkung) | 'reflect' (spiegelt Schaden)
  stagger,              // 0..1 Taumeln nach Treffer (klingt in ~0,4 s ab; Grafik darf zusätzlich wackeln/blitzen)
  hitAt,                // Simulationszeit des letzten Treffers (world.time)
  // nur asteroid: spin (rad/s, nur Optik); radius 40–150 m
}
```

**Neue Entity-Arten** (Grafik baut Modelle, bis dahin unsichtbare Platzhalter):
- `kind 'freighter'` (type `'convoy'`, name „Frachter Kestrel“, radius 60, hp/hpMax/shield/shieldMax): Frachter im Ereignis „Konvoi unter Beschuss“. Nicht anwählbar, wird von Piraten beschossen (`shot`/`damage` mit `to`/`id` = Frachter-id), fliegt langsam (`speed`, `thrust`), nach der Rettung schnell weg. Zerstört: `explode` size 3,5.
- `kind 'asteroid'` (type `'rock'`, radius 40–150, rot, spin): große Brocken in Asteroidenfeldern, statisch, sanfte Abstoßung für Spieler und Gegner, nicht anwählbar. Kommen nur beim Sektoraufbau (keine `spawn`-Ereignisse).
- `kind 'enemy', type 'nest'` („Swarm Nest“, radius 55, steht still): Ereignis „Schwarm-Nest“, anwählbar und angreifbar wie jeder Gegner (Tab/Klick/HUD funktionieren unverändert), spuckt Larven aus. Bewusst kind 'enemy', damit Zielwahl und HUD nicht brechen; Grafik soll für type 'nest' ein eigenes Modell bauen (Fallback: Schwarm-Modell).
- Gegner `rank 'elite'|'alpha'`: gleicher type, nur größer (radius) und stärker; Grafik darf sie z. B. mit Aura/Glanz hervorheben.

**Sektor** (`world.sector`, aus `sectorsFor`): `size` jetzt 6000 / 7000 / 8000 (halbe Kante). Neu:
- `fields: [{ x, z, r, type: 'asteroids'|'debris'|'nebula' }]` – Kulisse für die Grafik (Staub, kleine Brocken, Trümmer, Nebel) und Spawn-Zonen. In `'asteroids'` liegen zusätzlich die großen `asteroid`-Entities.
- `eventPirates` – Gegnertypen der Konvoi-Angreifer.
- `spawns: [{ type, count }]` bleibt; `count` ist die Gesamtzahl, die Simulation verteilt in Rudel (2–4) und Einzelgänger mit Mindestabstand (`ENEMIES[type].habitat`: Route Station↔Tor, Felder, freier Raum).

**Ereignisse** (`bus.emit(type, payload)`):

| Typ | Nutzlast | Bedeutung |
|---|---|---|
| `spawn` | `{ entity }` | neue Entity |
| `despawn` | `{ id }` | Entity weg |
| `shot` | `{ from, to, laser, ammo, hit, idx, x, z, dx, dz }` | ein Laserschuss (pro Laser ein Ereignis), `laser` = Schlüssel aus LASERS (Gegner: `null`, dazu `enemyType`). `idx` = Laserplatz (Spieler), `x, z` = Einschlagpunkt auf der Hülle bzw. daneben bei Fehlschuss, `dx, dz` = Einheitsvektor Schussrichtung (Schütze → Ziel). Laser feuern leicht versetzt (±6 %), SAL-Salve nacheinander im 70-ms-Takt |
| `rocket` | `{ from, to }` | Rakete abgefeuert, Treffer nach 0,6 s |
| `damage` | `{ id, hull, shield, x, z, crit, dx, dz, hx, hz, from, reflect }` | Schaden an Entity (Zahlen für schwebende Anzeige an `x, z` = Entity-Position). `dx, dz` = Einschlagrichtung, `hx, hz` = Trefferpunkt, `from` = Schütze-id, `reflect` = true bei Alpha-Schadensspiegel. Getroffene Gegner bekommen Stoß + `stagger`, weichen manchmal seitlich aus |
| `explode` | `{ id, x, z, size }` | Zerstörung, size 0,9 … 4 nach Typ (`ENEMIES[type].explode`: Larva 0,9 · Raider 1,2 · Jackal 1,8 · Spiker 2,2 · Vulture 2,4 · Nest 4; Elite ×1,25, Alpha ×1,6; Frachter 3,5; Spieler 2) |
| `loot` | `{ credits, tritium, xp, honor, ammo, ore, x, z }` | Spieler bekommt etwas |
| `levelup` | `{ level }` | |
| `message` | `{ text, kind, from?, title? }` | kind: `'info'|'warn'|'quest'|'radio'|'loot'`. Ereignis-Funksprüche: `kind 'radio'`, `from` = Sprecher, `title` = Ereignisname (aus `SECTOR_EVENTS`). Elite-/Alpha-Meldungen `kind 'warn'` |
| `quest` | `{ quest, progress, done }` | Quest-Stand, `quest` aus QUESTS |
| `sector` | `{ sector }` | Sektor gewechselt (Welt wurde neu aufgebaut) |
| `jumpStart` | `{ seconds }` | Sprung lädt (3 s) |
| `docked` / `undocked` | `{}` | |
| `playerDead` | `{ }` | Reparatur-Auswahl zeigen |
| `respawn` | `{ }` | |
| `profile` | `{ profile }` | Geld/Stufe/Ausrüstung geändert (HUD neu zeichnen) |
| `trap` | `{ x, z }` | Crate war eine Falle |

## Grafik: `src/render/renderer.js`

```js
export class Renderer {
  constructor(canvas, bus)
  setWorld(world)                // nach Start und nach jedem 'sector'-Ereignis
  render(dt, alpha)              // jedes Bild; alpha 0..1 = Anteil zwischen letztem und aktuellem Simulationsschritt
  toScreen(x, z)                 // -> { x, y, visible } in CSS-Pixeln (für schwebende Zahlen)
  pick(clientX, clientY)         // -> { kind:'entity', id } | { kind:'ground', x, z }
  setZoom(delta)                 // Mausrad
  resize()
  dispose()
}
```
Kamera: schräg von oben (ca. 55° Neigung), folgt dem Spieler weich, Zoom 600–2600 m Abstand. Spielerschiff zeigt **jeden Laser aus `loadout.lasers` als eigenes Bauteil** (Farbe/Länge je Laserstufe) und Generatoren als kleine Module. Modelle sind bewusst einfache Platzhalter (echte 3D-Modelle kommen später als GLB mit Hardpoints `HP_Laser_01…`, `HP_Gen_01…`, `HP_Engine_01…`).

## HUD: `src/ui/hud.js`, `src/ui/station.js`

```js
export class Hud {
  constructor(root, bus, world)   // root = <div id="hud">
  setWorld(world)
  setRenderer(renderer)           // für toScreen() (schwebende Zahlen)
  update(dt)                      // jedes Bild (leichtgewichtig, nur geänderte Werte)
  dispose()
}
export class StationUI {
  constructor(root, bus, world)   // öffnet sich bei 'docked'
  setWorld(world)
}
```
HUD ruft Welt-Befehle direkt auf (z. B. Klick auf Munition → `world.selectAmmo('L2')`, Reparatur-Knöpfe → `world.repair(...)`, „Zum Hub“ → `bus.emit('toHub')`).

## Screens: `src/ui/screens.js`

```js
export async function bootSequence(root)                 // Ladebildschirm, löst auf, wenn fertig
export async function loginScreen(root, store)           // -> { callsign, isNew }
export async function factionSelect(root)                // -> 'europa'|'saturn'|'eris'
export async function hubScreen(root, profile, store)    // -> 'launch' | 'logout'
export async function launchSequence(root, profile)      // Startcountdown, löst auf, wenn ins All
```
`root` = `<div id="screens">`. Jede Funktion räumt `root` beim Auflösen selbst leer.

## Flüssigkeit (Pflicht für alle)

Ziel: 120 Bilder/s auf einem Apple-Silicon-Mac, mindestens 60 auf normalen Rechnern. Simulation fest 60 Hz, Darstellung so oft wie der Bildschirm. Keine Speicher-Neuanlage pro Bild (Vektoren, Arrays, Objekte wiederverwenden, Effekte aus Pools). Geometrien und Materialien je Typ einmal anlegen und teilen. DOM nur ändern, wenn sich ein Wert wirklich geändert hat; Minikarte höchstens 15 Bilder/s. Keine Schatten in Echtzeit. Grafik passt die Auflösung automatisch an, wenn Bilder fallen.

## Zusätzliche Welt-Felder für die Anzeige

`world.profile`, `world.docked`, `world.inCombat`, `world.jump` (`null` oder `{ progress: 0..1 }`), `world.salReadyIn`, `world.rocketReadyIn` (Sekunden bis bereit, 0 = bereit), `world.nearPortal` (Portal-Entity oder null), `world.inSafeZone`, `world.quest` (`{ def, progress }` oder null), `world.playerDead`.

Neu (Simulation, 30.10.2026):
- `world.event` – laufendes Sektor-Ereignis oder `null`: `{ type: 'convoy'|'drift'|'nest', title, x, z, timeLeft, progress, total, targetId }` (Ort folgt beim Konvoi dem Frachter; `progress/total` = besiegte Angreifer bzw. eingesammelte Crates bzw. Nest 0/1; `targetId` = Frachter- bzw. Nest-id). Gleiches Objekt wird wiederverwendet. Erstes Ereignis 60–90 s nach Sektorstart, dann alle 150–240 s; Start/Ende per Funk mit konkreter Belohnung.
- `world.rocks` – Liste der `asteroid`-Entities (statisch je Sektor).
- `world.player.speed`, `world.player.thrust` (siehe Entity), `world.playerSpeed` = Höchsttempo.
- Flugmodell Spieler: Schub fährt weich hoch, ca. 3,5–4 s von 0 auf Höchsttempo (S-Kurve), Bremsen ca. 1,8 s, Drehrate 2,6 rad/s im Stand bis 1,5 rad/s bei Höchsttempo (Kurven statt Drehen auf der Stelle), leichtes Driften. Gegner ebenfalls mit Trägheit (≈ 1 s auf Höchsttempo, 3 rad/s).

**Spieldaten neu in `data.js`:** `VARIANTS` (elite ×3 Leben/Schild/Beute/Schaden, Chance 6 %; alpha ×10 Leben/Schild/Beute, Schaden ×6, Chance 1,2 %, höchstens einer je Sektor), `ALPHA_PERKS`, `SECTOR_EVENTS` (convoy, drift, nest mit Belohnungen; im Sektor gestaffelt × (1 + 0,6 × (Index − 1))), `EVENT_FIRST`, `EVENT_INTERVAL`, `DRIFT_CRATE_TABLE`; `ENEMIES[type].habitat`, `.explode`, `ENEMIES.nest` (`eventOnly: true`, nicht in `spawns`).

## Gegner-KI, Spezialangriffe, Belohnungen, Fluggefühl (Simulation, 30.10.2026)

Umsetzung von `KAMPF_UND_GEGNER.md` in `src/sim/ai.js` (Daten in `data.js`: `ENEMIES[type].ai`, `.level`, `SPECIALS`, `REWARD_SCALE`, `COMBO`).

**Persönlichkeit je Typ** (`ENEMIES[type].ai.style`): Raider `pack` (Rudel verteilt sich rundum, Ring dreht sich langsam, Salve) · Larva `swarm` (Verhalten neu `territorial`: greift an, wer näher als 300 m kommt; umzingelt eng, Sprungbiss) · Jackal `ambush` (lauert getarnt neben dir, springt an, wenn du unter 70 % Leben+Schild bist oder mit anderen kämpfst; Rammangriff) · Spiker `kite` (hält Abstand, Säurewolke, zieht sich in Deckung zurück) · Vulture `thief` (klaut Wracks und flieht damit, Schildwall, Salve) · Nest spuckt Säure, wenn du es angreifst. Für alle: seitliches Ausweichen (auch vorausschauend, wenn du auf sie feuerst; Trefferchance solange 60 % statt 85 %), Deckung hinter Asteroiden (Schüsse durch einen Brocken treffen den Brocken, beidseitig), Verstärkung (angeschlagenes Rudel ruft das nächste ruhige Rudel derselben Gruppe im Umkreis 2,6 km, höchstens alle 25 s), Rückzug zum Heilen (einmal je Leben unter `retreatHp`, Schild 8 %/s, Hülle 3 %/s bis 50 %, zurück nach Heilung oder 14 s), Feuerfokus (Konvoi-Piraten wechseln auf dich, wenn du schwächer bist als der Frachter).

**Kampf-Regie:** höchstens 3–4 aktive Angreifer (4, solange du über 50 % Leben+Schild hast; Elite zählt 1,5, Alpha 2), dein Ziel bekommt immer einen Platz. Die anderen warten im Kreis (≥ 650 m) und rücken nach (Wechsel spätestens nach 14 s). Spezialangriffe im ganzen Sektor höchstens alle 1,4 s.

**Gegner-Felder neu** (nur lesen): `state` zusätzlich `'hold'` (wartet im Kreis, schießt nicht) · `tactic` (Text der Taktik, z. B. `'flanke'`, `'wartet im kreis'`, `'lauert getarnt'`, `'lädt salve'`, `'rückzug zum heilen'`, `'deckung (heilt)'`) · `charge` 0..1 (Aufladen eines Spezialangriffs → Leuchten) · `cloak` 0..1 (Tarnung → durchsichtig/Flimmern) · `guard` 0/1 (Schildwall aktiv) · `bank` (Schräglage in rad, Vorzeichen wie beim Spieler) · `token` (hat einen Angriffsplatz) · `spK` (laufender Spezialangriff oder null).

**Spieler-Felder neu** (Fluggefühl): `bank` (Schräglage rad, höchstens ±0,52 = 30°, > 0 = nach links geneigt in Linkskurven, gleiches Vorzeichen wie `rotation.z` eines nach −z blickenden three.js-Modells) · `pitch` (Nicken rad, höchstens ±0,12, > 0 = Nase hoch beim Beschleunigen, < 0 = Nase runter beim Bremsen) · `turnRate` (rad/s, > 0 = links) · `accel` (m/s² entlang der Flugrichtung) · `slip` (seitliches Driften m/s, > 0 = nach rechts) · `aim` (true = Nase folgt im Angriff dem Ziel). Alle gefedert, keine Sprünge.
**Flugmodell im Angriff:** Ist das Ziel näher als 880 m, dreht die Nase zum Ziel (90 % der Drehrate), geflogen wird weiter in Befehlsrichtung (seitlich/rückwärts mit 72–100 % Tempo). Laser feuern nur, wenn das Ziel höchstens 75° neben der Nase liegt (Laser kommen nie mehr seitlich oder rückwärts aus den Mündungen).

**Ereignisse neu:**

| Typ | Nutzlast | Bedeutung |
|---|---|---|
| `telegraph` | `{ id, kind, x, z, dx, dz, delay, radius, length, enemyType }` | Spezialangriff wird angekündigt, Ausführung in `delay` s. `kind`: `'volley'` (Salve), `'ram'` (Rammangriff), `'leap'` (Sprungbiss): Gefahrenkorridor ab `x, z` in Richtung `dx, dz`, Länge `length`, halbe Breite `radius` (Spieler getroffen, wenn seine Hülle den Korridor berührt). `'acid'` (Säurewolke): Kreis um `x, z` mit `radius`, `dx = dz = 0`. `'guard'` (Schildwall): Kreis um den Gegner, rein defensiv. Gezielt wird auf deine Position in `SPECIALS[kind].lead` s bei gleichem Kurs → Kurs/Tempo ändern = ausweichen |
| `special` | `{ id, kind, cancelled, x, z, dx, dz, radius, length, duration }` | Ausführung beginnt (`cancelled: false`, `duration` = Wirkdauer, Säurewolke steht dann in `world.hazards`) oder Aufladen abgebrochen (`cancelled: true`: Gegner tot, Aggro weg oder schwerer Treffer – Rakete, kritisch, ≥ 10 % Leben+Schild). Grafik entfernt die Warnung bei jedem `special` mit derselben `id` |
| `combo` | `{ count, mult, xp, honor, credits, window, x, z, ended, best?, totalXp, totalCredits, totalHonor }` | Abschuss innerhalb von 6 s nach dem letzten: `count` ≥ 2, Bonus `mult` (+15 % je Abschuss, höchstens +60 %) auf Erfahrung/Ehre (sofort, eigenes `loot` mit `combo: count`) und Credits (liegen im Wrack). Ablauf: einmal `ended: true, count: 0, best` mit Summen |
| `reinforce` | `{ id, x, z, fromX, fromZ, count, enemyType }` | Gegner `id` ruft Verstärkung: `count` Gegner kommen von `fromX, fromZ` (dazu Meldung `warn` mit Anzahl und Entfernung) |

Ergänzt: `shot` hat bei Salven-Schüssen `special: 'volley'` (`to` = `'player'`, `x, z` = Einschlag bzw. Punkt im Korridor bei Fehlschuss) und bei Schüssen in einen Asteroiden `blocked: true` (`hit: false`, `x, z` = Einschlag am Brocken). `damage` hat bei Spezialtreffern `special: kind` (dann `crit: true` für Kamerastoß) und bei Schildwall `guard: true`. `loot` aus Combo-Bonus hat `combo: count`.

**Welt-Felder neu:** `world.hazards` – feste Liste (8) `{ active, kind: 'acid', id, x, z, radius, t, duration, dps, from }`, nur `active` zeichnen (`t` = Restzeit) · `world.combo` – `{ count, timeLeft, mult, xp, credits, honor, best }` (Anzeige der laufenden Combo) · `world.rewardScale(e)` – Faktoren `{ xp, credits, honor, gray }` für einen Gegner (HUD kann „zu leicht“ anzeigen).

**Belohnungen:** Erfahrung/Ehre/Credits = `loot` × Elite/Alpha × Sektor (1 · 1,25 · 1,55) × Stufenabstand: mehr als 1 Stufe über dem Gegner (Gegnerstufe `ENEMIES[type].level`, Elite +2, Alpha +5) je Stufe −22 % Erfahrung/Ehre (mindestens 10 %) und −10 % Credits (mindestens 40 %); stärkere Gegnertypen +8 % je Stufe (höchstens +40 %). Beispiel: Stufe 8 gegen Raider (Stufe 1) in Sektor 1 = 40 statt 400 Erfahrung. Abschussmeldung nennt die konkreten Zahlen und „zu leicht für Stufe N: nur X % Erfahrung“.

**Werte geändert** (Gegner stärker, Kampf soll zählen): Raider 1.100/550, Schaden 38, Sicht 600 m · Larva 450, Schaden 18 · Jackal 2.600/1.300, Schaden 72 · Spiker 3.600/1.800, Schaden 95 · Vulture 4.400/2.200, Schaden 80.

## Test-Schnittstelle (nur Entwicklungsserver, 30.10.2026)

`src/main.js` setzt nach dem Start jeder Sitzung `window.__ls = { world, renderer, bus, hud }` (nur `import.meta.env.DEV`, im Build entfernt). Nutzer: Test-Pilot `tools/playtest/spielen.mjs` (lädt `tools/playtest/pilot-im-browser.js` in die Seite). Der Test-Pilot nutzt nur die oben beschriebenen Welt-Befehle und Ereignisse, dazu lesend `world.enemies`, `world.wrecks`, `world.crates`, `world.portals`, `world.sectors`, `renderer.views`, `renderer.factory`, `renderer.gpuTimer`, `renderer.stats`; zum Messen hängt er sich an `renderer.noteWork(ms)`. Nur für Todestest und Modellprüfung greift er auf Internes zu (`world._invulnUntil`, `world._playerDie()`, `world.spawnTemp()`, `renderer._playerDirty`, `renderer._sig()`, `renderer.targetDist`) – bei Umbenennung dort bitte mitziehen. Gegnerzustände liest er aus `e.state` (zusätzlich, falls vorhanden, `e.tactic`/`e.mode`/`e.sub`/`e.move`/`e.maneuver`/`e.special` als Text) – wer die KI erweitert, sollte neue Verhaltensweisen dort als Text ablegen, dann erscheinen sie automatisch in der Statistik.


## HUD: Schnellleiste und Kampf-Lesbarkeit (HUD, 30.10.2026)

**Neue Dateien:** `src/ui/hud-bar.js` + `hud-bar.css` (Schnellleiste AKT·08, Arsenal AKT·09), `src/ui/hud-combat.js` + `hud-combat.css` (Trefferzeichen, Serie, Angriffswarnungen). Das Fenster „WAF·08 WAFFEN“ entfällt, an seiner Stelle steht die Schnellleiste (Fenster-id `quick`, Shift+8). Anordnung: unten mittig Konsole aus Schnellleiste, darüber SCHIFF (auf sehr breiten Schirmen links daneben), oben rechts ZIEL + MISSION, unten rechts KARTE, unten links FUNK, oben links PILOT + KONTO, oben mittig Fensterleiste + SEKTOR. Hinweise (Springen/Andocken) und Beutezeile rücken automatisch über die Konsole, die Serie unter die Sektor-Anzeige.

**Schnellleiste:** 10 Plätze auf Tasten 1–9, 0, vier Leisten (Wechsel: Alt+1–4, Pfeile oder Mausrad an der Leistennummer). Belegen per Ziehen aus dem Arsenal (Knopf ARSENAL rechts an der Leiste), Plätze tauschen durch Ziehen, Platz leeren durch Herausziehen oder Rechtsklick, Klick auf Arsenal-Eintrag = nächster freier Platz. „Layout sperren“ sperrt auch das Umbelegen. Inhalte nach Tonis Entscheidungen (Vault-Notiz): Munition L1–L4, SAB, SAL · Rakete R1 · Extras EMP, SOS, BMB, TRN, JMP · Techs VMP, ARC, LCK, RSV, FIX · 16 Formationen · Konfiguration 1–3.
- Speicher `localStorage['ls.hud.bar']` = `{ v: 1, cur: 0..3, tab, bars: [[ 'art:id' | null ×10 ] ×4] }`, `art` ∈ `ammo|rocket|extra|tech|form|config` (z. B. `'ammo:SAL'`, `'extra:EMP'`, `'form:ring'`, `'config:2'`). Standard Leiste 1: L1, L2, L3, L4, SAB, SAL, R1, EMP, SOS, BMB (Tasten 1–6 wie bisher).
- **Tasten und `input.js`:** Das HUD hört `keydown` in der Capture-Phase auf `window`. Bei Digit1–Digit0 / Numpad0–9 ohne Strg/Cmd/Shift (nicht in Eingabefeldern, nicht angedockt, nicht nach Abschuss) liest es die Belegung und ruft den Welt-Befehl, dann `preventDefault()` + `stopImmediatePropagation()` – `input.js` sieht diese Tasten dann nicht. `input.js` bleibt unverändert als Rückfall (ohne HUD, angedockt). Bitte in `input.js` keine weiteren Ziffern-Tasten belegen; Shift+Ziffer = Fenster (HUD), Alt+1–4 = Leiste (HUD).
- Aufgerufene Welt-Befehle: `selectAmmo(key)`, `fireSal()`, `fireRocket(id)` (heute nur R1) – vorhanden. **Vorschlag an die Simulation** (HUD prüft mit `typeof … === 'function'`; bis dahin ist der Platz schraffiert mit Schloss, Auslösen meldet „NOCH NICHT AN BORD“):
  - `world.useExtra(id)` id ∈ `'EMP'|'SOS'|'BMB'|'TRN'|'JMP'` · `world.useTech(id)` id ∈ `'VMP'|'ARC'|'LCK'|'RSV'|'FIX'`
  - `world.setFormation(id)` id ∈ `'standard','wall','spear','ring','gyro','dome','helix','comet','claw','swarm','star','wing','pulse','vortex','halo','crown'`, aktuelle in `world.formation`; Besitz in `profile.owned.formations` (Liste; `'standard'` immer)
  - `world.setConfig(n)` n ∈ 1..3, aktuelle in `world.config`
  - Zustand zum Anzeigen: `world.abilities = { [id]: { count, readyIn, cooldown, activeFor, duration } }` (id wie oben, dazu `formation` und `config` für deren Wechsel-Abklingzeit; Objekte wiederverwenden). Ohne `abilities` liest das HUD Anzahlen aus `profile.extras[id]` bzw. `profile.techs[id]`.
- Für Tests: `hud.bar.current()` (Belegung der aktuellen Leiste), `hud.bar.setBar(n)`, `hud.bar.activate(i)`.

**Kampf-Lesbarkeit:** Trefferzeichen (X am Trefferpunkt `hx, hz` jedes `damage` mit `from: 'player'`; Schild Fraktionsfarbe, Hülle weiß, kritisch groß in Warnfarbe), Abschusszeichen bei `explode` eines Gegners, den der Spieler in den letzten 4 s getroffen hat. Trefferzahlen nur noch für eigene Treffer (`from` fehlt oder `'player'`), gestaffelt in festen Fächer-Plätzen und in drei Größen nach Anteil am Gesamtleben des Ziels (ab 6 % und ab 15 %).
- **`telegraph`** (Simulation, `sim/ai.js`): `{ id, kind, x, z, dx, dz, delay, radius, length, enemyType }` – HUD zeigt Art + Countdown: im Bild als Schild am Gegner (beim gewählten Ziel links neben der Klammer), außerhalb des Bildes oder unter einem Fenster als Warnmarke am Bildrand Richtung Angreifer; letzte 0,6 s rot. Arten: `volley` SALVE, `ram` RAMMANGRIFF, `leap` SPRUNGBISS, `acid` SÄUREWOLKE (weitere: `beam`, `snipe`, `mine`, `bomb`, `nova`, `spit`, `summon`; unbekannt = SPEZIALANGRIFF; optional `label`). `kind 'guard'` (Schildwall) wird nicht gewarnt; mit `targetId` ≠ `'player'` ebenfalls nicht.
- **`special`** `{ id, kind, cancelled, … }`: abgebrochen → Warnung weg; ausgelöst → Warnung zeigt kurz „JETZT“.
- **`combo`** (Erwartung an die Simulation, noch nicht gesendet): `{ count, bonus, window, timeLeft?, credits?, tritium?, xp?, honor?, end? }` – `count` = Abschüsse in Serie (Anzeige ab 2), `bonus` = Beuteaufschlag als Anteil (0,3 = +30 %), `window` = Sekunden bis die Serie verfällt (Zeitleiste läuft ab), `timeLeft` = Rest, falls kleiner; konkrete Bonus-Mengen werden mit angezeigt. `count: 0` oder `end: true` = Serie vorbei. Bei jedem Abschuss in der Serie neu senden.

**Für Screens (`screens-hub.js`, Einstellungen):** Das Fenster-Layout liegt jetzt in `localStorage['ls.hud.layout.5']` (vorher `.4`; übernommen außer Schiff/Waffen). Der Hub liest und schreibt noch `'ls.hud.layout'` mit `HUD_TOGGLE = ['target','pilot','ship','quest','weapons']` – bitte auf `'ls.hud.layout.5'` und `'quick'` statt `'weapons'` umstellen, sonst wirken „Balken/Werte“ und „Layout zurücksetzen“ im Hub nicht im Flug.

## Grafik: Kameras, Fluggefühl, Heimatstationen, Warnanzeige, Leistung (Grafik, 30.10.2026)

**Zwei Kameras** (`src/render/camrig.js`, Taste **V** in `input.js`): `taktisch` (wie bisher, schräg von oben) und `verfolger` (direkt hinter dem Schiff, 15° erhöht, im Kampf 21° und zwischen Flugrichtung und Ziel geschwenkt; Schiff sitzt im freien Bildbereich zwischen den HUD-Fenstern). Wechsel weich in 0,9 s.
- Renderer: `toggleCamera()` → `'tactical'|'chase'` (speichert), `cameraMode` (lesen), `chaseActive` (Verfolger zu > 50 % eingeblendet). `setZoom(delta)` ändert im Verfolger den Abstand (0,65–2,4 ×).
- Einstellungen: `'ls.settings'.camera` = `'tactical'|'chase'`, Sicherung zusätzlich in `localStorage['ls.camera']`. `'ls.settings'.shake === false` schaltet Kamerawackeln, Trefferstöße, Druckwellen und Nachbrenner-Zittern ab (Sichtfeld-Kick bleibt gedämpft); `reducedMotion: true` (oder Systemeinstellung) dämpft alles auf ein Drittel. Der Renderer liest das je Sekunde neu.
- **Für Screens (`screens-kit.js` `loadSettings`)**: bitte die Schlüssel `camera` (`'tactical'|'chase'`) und `shake` (`true|false`, Standard `true`) beim Laden übernehmen – sonst überschreibt jeder `setSetting`-Aufruf (auch die automatische Qualitätswahl beim Start) die Kamerawahl in `ls.settings` (die Grafik fällt dann auf `ls.camera` zurück). In den Einstellungen gewünscht: Schalter „KAMERA Taktisch | Verfolger“ und „KAMERAWACKELN An | Aus“.
- `input.js`: WASD/Pfeile im Verfolger **schiffsbezogen** (W vorwärts mit weiter Kurve, A/D Kurve, S bremsen, S + A/D enge Wende); taktisch wie bisher bildbezogen. Mausklick-Flug und alle anderen Tasten unverändert.
- Fürs HUD: In der Verfolger-Kamera schneiden nicht alle Bildecken die Spielebene (Blick zum Horizont) – `renderer.getViewBounds()` liefert dann `null`, das Sichtfeld-Trapez der Minikarte entfällt (hud-map prüft das bereits). `toScreen()`/`pick()` funktionieren in beiden Kameras.

**Fluggefühl** (Renderer): Schräglage (Feder mit leichtem Überschwingen), Nicken, Nachdriften (Nase dreht leicht in die Kurve), Steuerdüsen (Gasstöße seitlich beim Drehen, vorn beim harten Bremsen), Triebwerksflamme pulsiert mit dem Schub, Schweif bei Höchsttempo länger, Sichtfeld-Kick ab ≈ 55 % Tempo (Verfolger bis +9°, taktisch +2,6°), Nachbrenner-Zittern, Kamerastoß in Trefferrichtung bei `damage` am Spieler (Stärke nach Schadensanteil), Druckwelle naher Explosionen (trifft nach Laufzeit ≈ 2.400 m/s ein), Tempo-Staub und Lichtstreifen nah an der Kamera (`src/render/speeddust.js`). Liefert die Simulation `player.bank`, `player.pitch`, `player.turnRate` bzw. `enemy.bank`, nimmt die Grafik diese als Zielwerte (sonst eigene Schätzung).

**Warnanzeige** (`src/render/telegraph.js`): hört `telegraph` `{ id, kind, x, z, dx, dz, delay, radius, length }`, `special` `{ id, kind, cancelled, x, z, radius, duration }` und optional `telegraphEnd` `{ id }`. Aufladeleuchten am Gegner (wächst, pulsiert in den letzten 30 %), Bodenmarkierung: Bahn für `volley|ram|leap|dash|charge|beam` (Breite = 2 × `radius` oder `w`, Länge `length`), Kreis für Flächen (`acid|cloud|spit|bomb|mine|nova|emp`, Radius `radius`). Rot = Schaden, grün = Säure, blau = EMP/Nova/Schildwall. Bei `special` (nicht abgebrochen): Aufblitzen; `acid` bleibt `duration` Sekunden als grüne Fläche mit ätzendem Nebel stehen; `guard` zeigt eine blaue Schildblase am Gegner. Tod/`despawn` des Gegners blendet aus.

**Zerstörung je Typ** (`effects.explode(p, style)`): Renderer wählt den Stil aus der Ansicht bzw. Entity: `ENEMIES[type].group === 'swarm'` und `nest` → grüner Schleim (Aufblähen 0,18 s, Spritzring, Tropfen, Fetzen, Säurenebel, grünes Licht), sonst metallisch (Aufglühen, Sekundärexplosionen, Feuerball, Trümmer, ein Teil brennt nach mit Rauchfahne).

**Heimatstationen** (`src/render/stations.js`, Leben in `src/render/stationlife.js`): EUROPA Forschungsstation aus weißer Keramik und Gold (Kuppeln, Antennenschüssel, Forschungsnadel, zwei Andockfinger, warmes Fensterlicht) · SATURN Industriehafen (Container-Stapel auf dem Ring, Warnstreifen, Kräne, Frachter-Liegeplätze, Schweißfunken, zwei Frachter legen an und ab) · ERIS Gefängnisring (schwarze Zellenblöcke mit violetten Schlitzen und Energieleitungen, Stacheln, vier kreisende Suchscheinwerfer). Je Station Verkehr (Pendelschiffe, Zubringer, Drohnen mit Blinklicht, alles unterhalb der Spielebene) und **Andock-Animation**: Leitlichter laufen ab 900 m zum Andockpunkt, Andockring leuchtet, vier Klammern auf einer Wiege öffnen sich beim Anflug; bei `docked` gleitet die Schiffsansicht in 2,6 s in die Wiege und die Klammern greifen, bei `undocked` in 2 s zurück zur Position der Simulation (nur Optik, Kamera folgt). Ein GLB unter `public/models/station-<fraktion>.glb` ersetzt weiterhin das Code-Modell (dann ohne Wiege/Klammern).

**Leistung:** HOCH zeichnet mit höchstens 1,75-facher Pixeldichte (ULTRA 2), Nachleuchten mit weniger Proben in den breiten Stufen, Farbsaum nur am Bildrand, Teilchen höchstens ≈ 210 CSS-px groß, weniger große Rauch-/Gasschwaden. Verfolger: kleine Objekte weiter als 5,2 km (Brocken 9 km) werden nicht gezeichnet. Neue Ansichten fern der Kamera (> 3,2 km) entstehen gestaffelt (höchstens 5 je Bild), Probemodelle fürs Vorübersetzen nur einmal je Sitzung, Shader-Prüfung (`checkShaderErrors`) nur im Entwicklungsserver. Nur Entwicklungsserver: `window.__compare({ rounds, ms })` misst Vorher/Nachher der Einsparungen im selben Lauf, `renderer.warmT` = Zeiten des letzten Sektor-Aufbaus (ms je Schritt).

## Grafik/Eingabe: Verfolger als Standard, Maus lenkt, Modell ohne Wechsel, Sprung ohne Hänger (Grafik, 30.10.2026, Nachtrag)

- **Verfolger-Kamera ist Standard** (Entscheidung Toni): ohne gespeicherte Wahl gilt `'chase'`; Taktisch nur, wenn `'ls.settings'.camera` bzw. `ls.camera` = `'tactical'`. Taste V wechselt und speichert wie bisher.
- **`input.js` im Verfolger – Maus lenkt:** Das Schiff dreht sanft Richtung Mauszeiger (Bezug ist die Schiffsnase, Totzone 3,5 % in der Bildmitte, Zeiger ganz außen ≈ 45° neben der Nase = enge Kurve). **W** = Schub an (bleibt an bis **S**), **S** = bremsen, **A/D** = zusätzlich zur Seite ziehen bzw. ohne Schub auf der Stelle wenden, **linke Maustaste halten** = fliegen, solange gedrückt. Linksklick auf Gegner = Ziel, Doppelklick = Ziel + Angriff, Klick auf Kiste/Wrack/Tor/Station = hinfliegen, Leertaste = Angriff. Liegt der Zeiger über einem HUD-Fenster, hält das Schiff den Kurs. Taktisch unverändert (Klick fliegt hin, WASD bildbezogen).
- Renderer neu: `steerHeading(clientX)` → Kurs (rot-Konvention) für den Zeiger; `pick()` trifft im Verfolger Objekte über ihren Bildschirmabstand (Mindestgröße 22 px) statt über die Bodenebene.
- **Kein sichtbarer Modellwechsel beim Start:** `renderer.js` exportiert `preloadShip(faction, ship)` (Promise, nie Fehler). GLB-Dateien liegen jetzt in einem gemeinsamen Zwischenspeicher über alle Flüge (`models.js` `preloadGLB(url)`, jede Sitzung klont nur). Beim Laden der Seite wird das Schiff des zuletzt gespielten Piloten im Leerlauf vorgeladen. **Für main.js/Screens:** bitte zu Beginn von `launchSequence` `preloadShip(profile.faction, profile.ship)` aufrufen (dann ist es auch beim ersten Flug eines neuen Piloten sicher da). Der Renderer zeigt die Leinwand erst, wenn das eigene Modell bereit ist (höchstens 2,5 s), und blendet in 0,5 s ein.
- **Nur das eigene Schiffsmodell wird im Flug geladen** (vorher alle 6 bzw. jetzt 24 Schiffs-GLBs gestaffelt ab 6 s, jedes kostete 10–30 ms Hauptthread mitten im Flug). Nach einem Schiffskauf lädt der Renderer das neue Modell nach. `renderer.loadAllModels()` lädt alle (Hangar/Test-Pilot). **Test-Pilot:** vor der Modellprüfung `R.loadAllModels()` aufrufen, sonst wartet `modelCheck` 25 s und prüft nur das eigene Schiff als GLB.
- **Sektorsprung ohne Hänger:** Schattenzustand gilt jetzt je Sitzung (HOCH/ULTRA immer an, ohne Station bleibt die Schattenkarte leer). Vorher wechselte er zwischen Sektoren mit und ohne Station, und three.js übersetzte beim Sprung ≈ 120 Materialien neu. Nach dem ersten Aufbau übersetzt der Renderer neue Shader parallel (`compileAsync`) und lässt bis dahin das letzte Bild stehen (höchstens 1,5 s), der Sprungblitz beginnt danach. `renderer.warmT` hat dann `async: 1` und `wait` (ms bis alle Shader fertig).

## Simulation: Schnellleiste – Extras, Minen, Raketen, Techs, Formation, Konfiguration (Simulation, 30.10.2026)

Neu `src/sim/abilities.js`, Werte in `data.js` (`EXTRAS`, `MINES`, `MINE_RULES`, `TECHS`, `FORMATIONS`, `FORMATION_RULES`, `CONFIG_RULES`, `ROCKETS.R2/R3`, `ROCKET_RULES`, `STARTER_KIT`). Alle Befehle geben `true`/`false` zurück (false = abgelehnt, Meldung kommt von der Welt).
- `world.useExtra(id, arg?)` `'EMP'|'SOS'|'BMB'|'TRN'|'JMP'` (JMP: optional Ziel-Sektor-ID, sonst nächster Heimatsektor; Laden über `world.jump` mit `jmp: true`, `portal: null`) · `world.layMine(id)` `'SPM'|'BRM'|'STM'` · `world.useTech(id)` `'VMP'|'ARC'|'LCK'|'RSV'|'FIX'` · `world.setFormation(id)` (nur Zustand, `world.formation`) · `world.setConfig(n)` (1–3, `world.config`, `profile.configs = { cur, sets: { [ship]: [{lasers, gens} ×3] } }`) · `world.fireRocket(id?)` `'R1'|'R2'|'R3'` (ohne id die zuletzt gewählte, `profile.selectedRocket`).
- Kaufen: `world.buy('extra'|'mine'|'tech'|'formation', id, n)` und `shopInfo` wie bei Munition. **Für station.js:** Kategorien für Extras/Minen/Techs/Formationen fehlen dort noch (Daten: `EXTRAS`, `MINES`, `TECHS`, `FORMATIONS`, je `price`/`currency`). R2/R3 erscheinen über `Object.keys(ROCKETS)` schon.
- Anzeige: `world.abilities[id] = { count, readyIn, cooldown, activeFor, duration }` (dazu `formation`, `config`), `world.mines` (feste Liste `{ active, id, type, x, z, radius, trigger, armed, t }`), `world.cloaked` + `player.cloak` (0/1, eigene Tarnung – Grafik darf das Schiff halbtransparent zeigen), Gegner `e.jamT` (gestört, `tactic 'gestört'`), `e.slowT`/`e.slowK` (gebremst).
- Ereignisse: `ability` `{ id, kind: 'extra'|'mine'|'tech'|'form'|'config', phase: 'use'|'fire'|'lay'|'expire'|'end', x, z, radius, duration, count, hits, mine? }` (für Ton/Grafik) · `heal` `{ id: 'player', hull, shield, x, z, source }` (HUD zeigt grüne Zahlen) · `rocketMiss` `{ to, rocket, x, z, blocked }` · `formation` `{ id, prev }` · `config` `{ n, prev }` · `rocket` hat jetzt `rocket: 'R1'|'R2'|'R3'`.
- Vorhandene Effekte werden mitbenutzt: `telegraph`/`special` mit `own: true` und `targetId` ≠ `'player'` (HUD warnt nicht) für Ringe (EMP `emp` blau, Bombe `bomb` rot, Minen `mine`/`nova`/`emp` mit `delay` = Lebensdauer, Zündung per `special`, Verfall per `telegraphEnd`), Schildblase über `kind 'guard'` mit `id 'player'` (SOS 3 s, RSV kurz), `explode` mit `id 'ab:BMB'` bzw. Minen-id (Bombe/Sprengmine, Stil metallisch), `shot` mit `arc: true`, `laser 'ion'` (Kettenblitz von Ziel zu Ziel), `jumpStart` mit `jmp: true`.
- Erprobungspaket: neue Piloten starten damit, bestehende Spielstände bekommen es einmal (`profile.kit`), nur aufgefüllt.
