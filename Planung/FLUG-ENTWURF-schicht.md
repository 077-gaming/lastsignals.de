# LAST SIGNALS · Entwurf Flugmodell „Flugschicht“ (6DOF über der bestehenden Simulation)

Stand 03.11.2026, Zweig `claude/flug`, Arbeitsbaum `wt-flug`. Entwurf, nicht umgesetzt, kein Code geändert.

**Auftrag (Toni):** „Bisher macht das Spiel mit der Steuerung keinen Spaß, nur im DarkOrbit-typischen Modus, der soll aber am Ende nur Nebensache sein.“ Verfolger- und Cockpitsicht werden der **Hauptmodus mit echtem 3D-Flug**. Die Grundbausteine orientieren sich an den Systemen und am Qualitätsanspruch aktueller großer Weltraumsimulationen (Referenz: Star Citizen). Fremde Namen, Assets und Logos werden nicht übernommen. Die taktische Draufsicht (Klickflug in der Ebene) bleibt als Nebenmodus erhalten und darf nicht kaputtgehen. Das Flugmodell muss den nächsten Meilenstein „Planetenlandung“ tragen können.

**Ansatz in einem Satz:** Eine neue, reine Logikdatei `sim/flight.js` rechnet für Schiffe Höhe `y`, Lage (Quaternion), Drehraten und Schub in sechs Freiheitsgraden. Sie schreibt ihr Ergebnis in die bestehenden Felder `x`, `z`, `vx`, `vz`, `rot`. Kampf, Quests, Spawns, Beute, Ereignisse und Mehrspieler laufen dadurch weiter und lernen `y` schrittweise dazu. Der taktische Modus nutzt unverändert den alten Code (`_movePlayer`).

**Widerspruch zu `ARCHITEKTUR-SANDBOX.md` 2.1:** Dort steht „Shooter bleibt dauerhaft 2D, 3D-Flug nur im Universum (`src/world/sim3d.js`)“. Tonis neuer Auftrag hebt das für den Flug auf. Vorschlag: 2.1 wird geändert in „Der Shooter bekommt die 6DOF-Flugschicht. Die Inhalte (Stationen, Tore, Beute) bleiben in einem flachen Höhenband (2,5D). Dieselbe `flight.js` wird später der Schiffsteil von `sim3d.js` im Universum.“ Das spart in Phase D2 einen großen Teil der Arbeit („Flug 6DOF und Landung“), weil Flugmodell, Eingabe, Kamera und HUD dann schon fertig und erprobt sind. Toni muss diese Änderung freigeben (siehe Abschnitt 18).

---

## Inhalt

1. Recherche: Stand der Referenz
2. Ist-Stand im Code (geprüft)
3. Grundsätze der Flugschicht
4. Simulationsmodell (Zustand, Regler, Integrator)
5. Werte je Schiffsklasse S1–S8
6. Eingabe: Maus und Tastatur, Controller, Touch
7. Kamera: Verfolger, Cockpit, Übergänge, Umsehen
8. Waffen und Zielen: Konvergenz, Vorhalt, Zielhilfe
9. KI in 3D
10. Mehrspieler-Abgleich
11. Taktikmodus als Nebenmodus
12. HUD-Elemente
13. Vorbereitung Landemodus und Planetenlandung
14. Leistungsbudget (Mac zuerst)
15. Betroffene Dateien
16. Reihenfolge der Umsetzung
17. Testplan (automatisch, unsichtbar)
18. Risiken und offene Entscheidungen für Toni

---

## 1. Recherche: Stand der Referenz (kurz)

| Baustein | Referenz (Stand der Quellen) | Übernahme in LAST SIGNALS (eigene Namen) |
|---|---|---|
| **Hauptmodi** | Seit Version 3.23 gibt es „Master Modes“ mit den beiden Modi SCM (Kampf: Schilde und Waffen an, Tempo begrenzt) und NAV (Reise: deutlich schneller, Waffen, Schilde und Gegenmaßnahmen aus, Umschalten mit kurzer Verzögerung). Ob das in 4.x unverändert gilt, ließ sich nicht sicher bestätigen. | **KAMPF** und **REISE**, Umschalten mit 1,5 s Hochlauf, im Kampf gesperrt |
| **Gekoppelt / entkoppelt** | Gekoppelt hält der Flugregler die Wunschgeschwindigkeit und fliegt sich „wie ein Flugzeug im All“. Entkoppelt behält das Schiff seine Bewegung, bis man Gegenschub gibt. Auch entkoppelt gilt eine Tempo-Obergrenze. Taste Alt+C. | **GEKOPPELT** / **ENTKOPPELT**, nur die Fortbewegung, Drehung bleibt geregelt |
| **Boost** | Nachbrenner aus einem Boost-Speicher: Er gibt mehr Beschleunigung und erlaubt leicht über das Kampftempo hinaus, solange Vorrat da ist. Taste Shift. | **BOOST** mit Speicherbalken, Nachladen nach kurzer Pause |
| **Geschwindigkeitsbegrenzer** | Begrenzer auf dem Mausrad, Tempomat auf C | Mausrad = **BEGRENZER** in 5-%-Schritten, C = **TEMPOMAT** |
| **Landemodus** | Landemodus (Taste N) senkt Höchsttempo und Drehraten stark und fährt das Fahrwerk aus. Dazu gibt es eine Landehilfe (gedrückt halten). | **LANDUNG** (N): Tempo und Drehraten begrenzt, Fahrwerk, Horizonthalter, Kontaktmodell |
| **Zielen** | Für jede Waffe erscheint ein vorhergesagter Treffpunkt (Vorhaltepunkt) statt einer Linie am Ziel. Die Waffen richten sich auf den Punkt unter dem Zielkreuz aus (dynamische Konvergenz). Kardanwaffen folgen der Maus in einem Kegel. | Vorhaltemarke, dynamische Konvergenz auf die Zielkreuz-Entfernung, Kardankegel je Klasse |
| **Zielhilfe** | Die Stick-Eingabe wird gedämpft, sobald die Vorhaltemarke im Kreis liegt (ursprünglich für Joysticks, später auch für virtuellen Stick und Maus angepasst). | **Zielhilfe** für Controller (Dämpfung, Mitführen), schwächer im PvP |

Quellen (Fan-Wikis und offizielle Mitteilungen verschiedener Stände; die Details von 4.x sind nicht bestätigt):
[Master Modes Guide](https://api.star-citizen.wiki/comm-links/20053),
[Design Notes Flugmodell 2.0](https://starcitizen.tools/Comm-Link:Design_Notes_-_Flight_Model_Changes_in_Star_Citizen_Alpha_2.0),
[Guide: Controls](https://starcitizen.tools/Guide:Controls),
[Keybinds](https://starcitizen.tools/Keybinds),
[Game Options (Gimbal Lock, ESP)](https://starcitizen.tools/Game_Options),
[ESP](https://starcitizen.tools/ESP),
[Arena Commander 0.9.2 (Vorhaltepunkte, Konvergenz)](https://robertsspaceindustries.com/comm-link/transmission/14258-Arena-Commander-092-Released).

Von dort übernommen wird nur das **Prinzip**: geregelter 6DOF-Flug, Hauptmodi, Boost aus einem Speicher, Begrenzer, Vorhaltepunkte, Konvergenz und gedämpfte Zielhilfe. Bewusst **nicht** übernommen werden G-Kräfte mit Bewusstlosigkeit, Energieverteilung auf Systeme und Gegenmaßnahmen. Sie können später kommen, passen aber jetzt nicht zum Shooter.

---

## 2. Ist-Stand im Code (geprüft)

| Stelle | Befund | Folge für den Entwurf |
|---|---|---|
| `sim/world.js` `_movePlayer` (ab Z. 443) und `_flightFeel` | 2D-Flug über einen Zielpunkt (`moveTo` → `p.tx/p.tz`): Schub hochfahren (Spool), Bremsen, begrenzte Drehrate (`PLAYER_TURN` 2,6 → 1,5 rad/s), Driften (`PLAYER_GRIP`). Im Angriff zeigt die Nase auf das Ziel. `_flightFeel` erzeugt `bank` und `pitch` nur für die Grafik. | Bleibt **unverändert** für den Taktikmodus. Im 3D-Modus übernimmt `flight.js`. |
| `sim/world.js` `_updateLasers`, `_fireLaser`, `hitChance` | Treffer werden ausgewürfelt: Grundchance, abhängig von Entfernung und Querbewegung. Gefeuert wird nur, wenn das Ziel innerhalb von 75° neben der Nase liegt (`LASER_ARC`). 1 Schuss/s je Laser. | 3D-Modus: echte Bolzen mit Vorhalt (Abschnitt 8). Schaden und Belohnung laufen weiter über `_hitEnemy`. |
| `sim/world.js` Entitäten | `x, z, vx, vz, rot`, Vorbild `px, pz, prot` für die Zwischenbilder. Kein `y`. | `y, vy, py` und Quaternion `q, pq` kommen dazu, Standardwert 0 bzw. waagrecht. |
| `sim/ai.js` `moveEnemy` | Gegner lenken über einen Wunschgeschwindigkeitsvektor `MV.tx/MV.tz` mit Trägheit (`ENEMY_ACCEL`, `ENEMY_TURN`). Kampf-Regie `directCombat`: Flankenwinkel im Ring um den Spieler. | Senkrechte Komponente `MV.ty` und geneigte Kreisebenen kommen dazu (Abschnitt 9). |
| `sim/spatial.js` | 2D-Raster | Bleibt 2D, weil das Höhenband flach im Verhältnis zur Zellgröße ist. Nach der Abfrage wird zusätzlich nach `y` gefiltert. |
| `sim/spawn.js` `rockLayout` | Verteilt Asteroiden mit `w.rng` | **Wichtig:** Neue Höhenwerte nie aus `w.rng` ziehen, sonst verschiebt sich die gesamte 2D-Zufallsfolge und der Taktikmodus verändert sich. Höhen kommen aus einem abgeleiteten `Rng(hashString(sektor + ':y'))`. |
| `input.js` | Verfolger: Maus lenkt über `renderer.steerHeading` → `moveTo` 900 m voraus. W hält Dauerschub, S bremst, A/D ziehen seitlich. Taktisch: Klick fliegt hin. | Der Verfolgerweg wird durch einen **Steuerrahmen** ersetzt (Abschnitt 6). Der Taktikweg bleibt. |
| `input/padflight.js`, `gamepad.js` | Linker Stick lenkt wie die Maus, RT Schub, LT bremst, rechter Stick Kamera, 73 Prüfungen in `tools/playtest/controller.mjs` | Neue Belegung im 3D-Modus, die alte gilt weiter im Taktikmodus |
| `render/camrig.js` | Verfolger-Pose nur aus Gier (`yaw`), Höhe, Abstand je Klasse (`CHASE_FRAME`), Federung, Sichtfeld-Kick, Stöße, Umsehen (`lookYaw/lookPitch`) | Neue Pose aus der Quaternion. `CHASE_FRAME`, Federung und Stöße werden weiter genutzt. |
| `render/renderer.js` | 48 Stellen mit `v.rz`; Wurzelpositionen mit fester Höhe (`root.position.set(v.rx, 0 …, v.rz)`), Auswahl im Bild bei `y = 2`, Schattenkamera 400 m um den Spieler | Höhe überall über eine Hilfsfunktion; die Lage des Schiffs kommt aus der Quaternion |
| `render/telegraph.js`, `effects.js`, `fields.js` | Warnflächen, Ringe und Nebel als flache Ebenen (`PlaneGeometry … rotateX(−π/2)`) | Warnflächen werden zu Volumen (Kugel, Röhre, Kegel), Nebel zu flachen Scheiben mit Dicke |
| `net/mp-core.js` `parseState` | Nimmt Zustandsfelder ab Länge 8 an und ignoriert zusätzliche Felder | Neue Felder (`y`, Nicken, Rollen) **hinten anhängen**, alte Clients bleiben verträglich |
| `net/coop.js` | Gastgeber sendet Gegnerzeilen `[id, x, z, rot, hp, shield, alive, rank]` 8×/s | `y` hinten anhängen |
| Sektoren (`data.js`) | halbe Kantenlänge 6.000–8.000 m, alles bei `y = 0` | Neues **Höhenband** ±1.500 m (Abschnitt 4.7) |
| Leistung (`Planung/ENGINE.md`) | HOCH auf Apple M5: Kampf 6–8 ms GPU (Ziel unter 8 ms über adaptive Auflösung), Prozessorzeit 3,5–4,4 ms je Bild | Die Flugschicht darf auf der CPU höchstens +0,3 ms je Bild kosten (Abschnitt 14) |

---

## 3. Grundsätze der Flugschicht

1. **Reine Logik, eine Datei, keine Speicher-Neuanlage pro Schritt.** `sim/flight.js` importiert weder three.js noch DOM. Alle Zwischenwerte liegen in festen `Float64Array`. Damit läuft die Datei im Browser, unter Node im Selbsttest und später auf dem Spielserver.
2. **x und z bleiben die Wahrheit für alles, was 2D denkt.** Nach jedem Schritt schreibt die Flugschicht `x, z, vx, vz, speed, thrust`. `rot` ist die Gier der Nase, projiziert auf die Ebene. Alter Code, der diese Felder liest (Kampf-Regie, Quests, Minikarte, Ereignisse), läuft ohne Änderung weiter.
3. **y und Lage sind zusätzlich.** Neue Felder: `y, vy, py, q[4], pq[4], w[3]` sowie `fl` (Flugzustand). Fehlen sie (alter Spielstand, alter Mehrspieler-Client, Taktikmodus), gilt `y = 0` und waagrecht.
4. **Zwei Wege, sauber getrennt:** `world.flight3d === false` bedeutet bitgleich der heutige Ablauf (Taktikmodus, Selbsttest mit Goldwert). `world.flight3d === true` bedeutet, dass `flight.js` den Spieler bewegt. Umgeschaltet wird nur über einen Befehl (`world.command({ t: 'flightMode', mode })`), passend zu Schritt 3 des Architekturplans.
5. **Gleiche Grenzen für alle:** Gegner fliegen mit denselben Obergrenzen (Tempo, Drehrate, Beschleunigung) wie Schiffe ihrer Größe. Sie nutzen aber ein billigeres kinematisches Modell statt des vollen Reglers (Abschnitt 9).
6. **Vorbereitet für Rahmen und Schwerkraft:** Jeder Flugzustand trägt `frame` (heute `'sec:<sektor>'`). `flight.step()` bekommt eine Umgebung `env` mit `gravityAt`, `airAt` und `groundAt`. Heute liefern alle drei null bzw. 0. Für die Planetenlandung wird nur `env` ausgetauscht (Abschnitt 13).
7. **Deterministisch genug:** feste Schrittweite 1/60 s wie bisher (`C.STEP`), nur `Math.sin/cos/sqrt/atan2`, kein `Math.random`. Gleiche Eingaben ergeben im selben Laufzeitsystem bitgleiche Zustände (Selbsttest).

### Achsen und Vorzeichen (verbindlich, passend zu three.js und `combat.js`)

- Welt: +x rechts, +y oben, −z „Norden“. `rot = 0` heißt: die Nase zeigt nach −z, Richtung `(−sin rot, 0, −cos rot)` (wie `headingOf`).
- Schiffskörper: vorn = −z, oben = +y, rechts = +x. Die Quaternion `q` dreht Körper → Welt.
- Drehraten im Körper: `w[0]` = Nicken (+ = Nase hoch), `w[1]` = Gieren (+ = Nase links), `w[2]` = Rollen (+ = linke Tragfläche runter, also Rollen nach links, wie das heutige `bank` > 0).
- Ableitungen für alten Code: `rot = atan2(−f.x, −f.z)` mit `f = q · (0,0,−1)`. Bei `|f.y| > 0,985` (Nase fast senkrecht) wird `rot` aus der Geschwindigkeit genommen bzw. der letzte Wert gehalten. `pitch = asin(f.y)`, `bank` = Rollwinkel gegen die Weltsenkrechte.

---

## 4. Simulationsmodell

### 4.1 Zustand (je Schiff mit Flugschicht)

```js
// sim/flight.js
FlightState = {
  frame: 'sec:sa-3',              // Bezugsrahmen (später 'body:ls-3/p2' für Planeten)
  // Lage und Bewegung liegen direkt auf der Entität: x, y, z, vx, vy, vz, q[4], w[3]
  mode: 'kampf' | 'reise' | 'landung',
  modeT: 0,                       // Restzeit des Umschaltens (Hochlauf REISE 1,5 s)
  coupled: true,                  // gekoppelt (Flugregler hält Wunschgeschwindigkeit) / entkoppelt
  limiter: 1,                     // Begrenzer 0,05 … 1 (Anteil des Modus-Höchsttempos)
  cruise: false, cruiseV: 0,      // Tempomat: gehaltenes Vorwärtstempo (m/s)
  boost: 1,                       // Boost-Speicher 0..1
  boostOn: false, boostLock: 0,   // aktiv / Sperre nach Leerlauf (s)
  boostWait: 0,                   // Pause bis zum Nachladen (s)
  gear: 0,                        // Fahrwerk 0 (eingefahren) … 1 (ausgefahren), fährt in 1,5 s
  contact: 0,                     // Anzahl Fahrwerkbeine mit Bodenkontakt
  landed: false,
  aim: Float64Array(3),           // Zielrichtung (Welt, Einheitsvektor) im Mauszielmodus
  // Anzeige (für HUD, Kamera, Ton, Grafik)
  thrustB: Float64Array(3),       // Schub im Körper je Achse −1..1 (Flamme, Steuerdüsen, Ton)
  vSet: 0,                        // Soll-Vorwärtstempo (m/s) für das HUD
  vMax: 0,                        // aktuelles Höchsttempo (Modus × Begrenzer × Boost)
  g: 0,                           // Lastvielfaches (nur Anzeige, später Wirkung)
  alt: 0, vs: 0,                  // Höhe über Ebene bzw. über Grund, Steigrate
}
```

Eingabe je Schritt: ein **Steuerrahmen** `ControlFrame` (feste `Float32Array(12)`). Die Eingabeschicht schreibt ihn je Bild, die Simulation liest den jeweils letzten Stand („Abtasten und Halten“):

| Index | Feld | Bereich | Bedeutung |
|---|---|---|---|
| 0–2 | `tx, ty, tz` | −1..1 | Schub: seitlich (+ rechts), senkrecht (+ hoch), längs (+ vorwärts) |
| 3–5 | `rp, ry, rr` | −1..1 | Drehwunsch: Nicken, Gieren, Rollen (direkte Raten; VJoy, Controller ohne Mausziel, Tastatur) |
| 6 | `aimOn` | 0/1 | Mauszielmodus: Drehung folgt `aim` (Index 7–9) statt der Raten 3–4 |
| 7–9 | `ax, ay, az` | Einheitsvektor | Zielrichtung in Weltkoordinaten |
| 10 | `buttons` | Bitmaske | 1 Boost, 2 Raumbremse, 4 Tempomat umschalten, 8 Kopplung umschalten, 16 Modus umschalten, 32 Landung umschalten, 64 Fahrwerk |
| 11 | `limiterStep` | −n..n | Begrenzer-Schritte seit dem letzten Rahmen (Mausrad) |

Damit sind die Eingabegeräte vollständig von der Physik getrennt. Bots, Selbsttest und Server setzen denselben Rahmen.

### 4.2 Ablauf eines Schritts (`flight.step(e, ctl, P, env, dt)`, dt = 1/60 s)

1. **Modus und Knöpfe:** Kopplung, Tempomat, Begrenzer, Landung und Fahrwerk werden umgeschaltet. REISE läuft 1,5 s hoch und ist gesperrt, solange `world.inCombat` gilt. Ein Treffer bricht das Hochlaufen ab.
2. **Boost-Speicher:** Bei Boost und Vorrat > 0 wird `boost −= dt / P.boostT`. Ist der Speicher leer, folgt eine Sperre, bis wieder 15 % nachgeladen sind. Ohne Boost beginnt das Nachladen nach 1,0 s Pause mit `+dt / P.boostRegen`. Der Faktor `kb` (Boost aktiv) ist 1 oder `P.boostAcc` (1,6).
3. **Drehung (Flugregler, immer geregelt):**
   - Mausziel: Fehlerwinkel `θ` zwischen Nase und `aim` und Drehachse im Körper. Wunschrate je Achse:
     `ω_soll = min(P.rate · kbR, Kp · θ, 0,92 · √(2 · P.angAcc · θ))`.
     Der dritte Term ist die Bremsgrenze: Mit ihm kann das Schiff vor dem Ziel abbremsen, deshalb gibt es **kein Überschwingen**. `Kp = 5,0 /s`. Ist „Kurvenrollen“ an, kommt eine Rollrate dazu, die das Schiff bis höchstens 50° in die Kurve legt (koordiniert, `roll_soll = clamp(−1,1 · Gierfehler, ±50°)`), solange Q/E nicht gedrückt sind.
   - Direkt (Raten): `ω_soll = Eingabe · P.rate · kbR`, mit `kbR = 1,25` bei Boost.
   - Horizonthalter (Einstellung, Standard an, im Landemodus immer an): Ohne Rolleingabe rollt das Schiff mit höchstens 0,6 rad/s zurück zur Weltsenkrechten (später: zur Schwerkraftsenkrechten).
   - Drehbeschleunigung begrenzt: `w += clamp(ω_soll − w, ±P.angAcc · dt)` je Achse. Das ergibt die Trägheit: Das Fadenkreuz steht sofort, das Schiff folgt mit Masse.
4. **Lage fortschreiben:** `q = q ⊗ exp(½ · w · dt)` (exakte Drehung um die Achse `w`, Winkel `|w|·dt`), danach normieren. Das ist stabiler als die einfache Addition.
5. **Fortbewegung im Körper:** `v_b = q⁻¹ · v`.
   - **Gekoppelt:** Wunschgeschwindigkeit `v_soll_b = (tx · vLat, ty · vVert, −vVor)`. Dabei ist `vVor = tz · vMax`, mit Tempomat `cruiseV`, ohne Eingabe und ohne Tempomat 0 (der Regler bremst sanft auf Stillstand). `vMax = Modusgrenze · limiter · (Boost ? P.boostV : 1)`, `vLat = vVert = 0,55 · vMax`. Beschleunigung je Achse: `a = clamp(Kv · (v_soll − v_b), −aNeg, +aPos) · kb` mit `Kv = 3,2 /s` (≈ 0,3 s Zeitkonstante). `aPos` und `aNeg` sind je Achse verschieden: Hauptschub vorn ist am stärksten, Rückwärts- und Seitendüsen sind schwächer (Tabelle 5).
   - **Entkoppelt:** `a = Eingabe · aAchse · kb` (direkter Schub). Ohne Eingabe gibt es keine Dämpfung. Über `vMax · 1,02` hinaus greift eine Grenze: Gegenschub entlang `v` mit voller Retro-Leistung, bis das Tempo wieder unter der Grenze liegt.
   - **Raumbremse** (X): wie gekoppelt mit `v_soll = 0` auf allen Achsen, alle Düsen voll, Boost wirkt mit.
   - Schwerkraft und Luft: `a_welt = q · a_b + env.gravityAt(pos) + Luftwiderstand`. Gekoppelt gleicht der Regler die Schwerkraft innerhalb der senkrechten Schubreserve aus (`v_soll` bleibt, `a` bekommt `−g` dazu, wird aber auf `aUp` begrenzt). So entsteht Schwebeflug ohne Sonderfall. Reicht `aUp` nicht, sinkt das Schiff, und das HUD zeigt `SCHUB UNTER SCHWERKRAFT`.
6. **Integrieren (halbimplizit):** `v += a · dt`, danach `pos += v · dt`. Bei 60 Hz und den Beschleunigungen aus Tabelle 5 ist das genau genug und stabil. Steife Federn (Fahrwerk) bekommen eigene Teilschritte (Abschnitt 13).
7. **Zusammenstöße (3D-Kugeln):** wie heute „sanft abstoßen“, nur mit `y`. Asteroiden sind Kugeln mit Radius `r.radius`. Die Station ist ein Satz aus 6–12 Kugeln und Kapseln je Stationstyp (`STATION_HULL` in `flightdata.js`). Eindringtiefe ×0,35 verschieben, die Normalgeschwindigkeit wird zu 80 % abgebaut.
8. **Grenzen:** Seitlich gilt die Kartengrenze wie heute (`sector.size`). Senkrecht gilt das Höhenband (4.7).
9. **Ableitungen schreiben:** `rot`, `bank`, `pitch`, `speed`, `thrust` (Hauptschub 0..1 für die Flamme), `turnRate`, `accel`, `slip`, `thrustB`, `alt`, `vs`. So funktionieren Kamera-Stöße, Ton, Triebwerksflamme und Test-Pilot weiter.

### 4.3 Hilfsmathematik

`sim/math3.js`: Vektor- und Quaternionfunktionen auf `Float64Array` mit Ausgabeparameter, ohne three.js (`qMul, qRotate, qConjRotate, qFromAxisAngle, qExpStep, qNormalize, qFromYawPitchRoll, qToYawPitchRoll, qSlerp, angleBetween, axisBetween`). Die Datei ist auch für KI, Bolzen und Mehrspieler da.

### 4.4 Lagewechsel aus dem 2D-Zustand (Taktik → 3D)

`flight.enter(e)`: `q = qFromYawPitchRoll(e.rot, 0, 0)`, `v = (vx, vy ‖ 0, vz)`, `w = 0`, `aim = Nase`, Tempomat auf das aktuelle Vorwärtstempo (es gibt keinen Ruck beim Wechsel). Ausrüstung, Schild und Leben werden nicht angefasst.

### 4.5 Rückkehr in die Ebene (3D → Taktik)

`flight.leave(e)` startet den **Ebenenfänger**. Über höchstens 3 s rollt und nickt das Schiff in die Waagrechte (`angAcc` begrenzt), und `y` läuft mit höchstens 180 m/s Steigrate nach 0. Für x und z übernimmt sofort der alte `_movePlayer` (Klick auf die Karte funktioniert ab dem ersten Bild). Der Kamerawechsel dauert ohnehin 0,9 s (`BLEND_T`), dadurch wirkt der Übergang wie ein Manöver und nicht wie ein Sprung.

### 4.6 Stoß und Treffer

`knockPlayer(dx, dz, v)` bekommt einen optionalen Anteil `dy` und wirkt auf `v` in 3D. Treffer am eigenen Schiff geben einen kleinen Drehstoß (`w += 0,15 rad/s` um eine Achse quer zur Einschlagrichtung, abschaltbar mit „Kamerawackeln aus“). Das ist spürbar, aber es reißt nicht das Ziel weg.

### 4.7 Höhenband der Sektoren

| Sektor | Band (y) | Warnung ab | Schaden ab |
|---|---|---|---|
| Heimat (Index 1) | ±1.200 m | ±1.000 m | ±1.200 m |
| Front (Index 2–8) | ±1.500 m | ±1.250 m | ±1.500 m |

Gleiche Regel und gleicher Text wie die seitliche Kartengrenze (`OUT_OF_MAP_DAMAGE`). Inhalte bekommen Höhe aus dem abgeleiteten `Rng` (siehe Abschnitt 2):

- Station und Sprungtore: `y = 0` (Bezugspunkte, „Ebene 0“ im HUD).
- Asteroidenfelder: Dicke ±250 m (Brocken), Erz in derselben Wolke.
- Gegner-Rudel: Mitte bei `y ∈ [−450, 450]`, Einzelgänger ±600 m.
- Kisten und Wracks: Wracks entstehen an der Abschusshöhe, Kisten bei ±300 m.
- Ereignisse (Konvoi, Frachter): eigene Höhe je Ereignis.

Im Taktikmodus wird alles mit `y` wie bisher auf der Ebene gezeichnet. Die Höhe hat dort keine Wirkung auf Sichtbarkeit oder Aufnehmen (siehe 11).

### 4.8 Abstände in der Simulation

Neue Hilfen in `combat.js`: `d2xz(a, b)` (heute) und `d3sq(a, b)` (mit `y`, fehlendes `y` = 0). Umgestellt wird nur dort, wo Höhe spielerisch zählt:

| Prüfung | 3D-Modus | Taktikmodus |
|---|---|---|
| Waffenreichweite, Trefferprüfung, Raketenreichweite, Gegner-Aggro, Feuerkegel | Kugel (`d3`) | wie heute (`y` ist dort für den Spieler 0, Gegner gleichen sich an) |
| Aufnehmen (Wrack, Kiste, Erz) | Kugel 52 m und **Bergungsstrahl**: ab 140 m zieht ein Strahl Beute in 1 s heran, ohne millimetergenau zu fliegen | wie heute (2D) |
| Sichere Zone, Sprungtor, Reparatur am Tor, Andocken | **Zylinder** (2D-Abstand und `|dy| ≤ 400 m`) | wie heute |
| Kartengrenze | seitlich 2D, dazu das Höhenband | wie heute |

---

## 5. Werte je Schiffsklasse S1–S8

Die Werte stehen in einer neuen Datei `sim/flightdata.js`, damit `core/data.js` unberührt bleibt (Regel aus dem Architekturplan). Das Kampftempo kommt **nicht** aus der Tabelle, sondern weiter aus `world._speed` (Schiff plus Generatoren). Damit bleiben Generatoren und Balance wirksam.

| Klasse | Kampftempo v (m/s, aus `_speed`) | Reise-Faktor | a vor | a rück | a seitlich | a hoch / runter | Nicken °/s | Gieren °/s | Rollen °/s | Drehbeschl. N/G °/s² | Rollbeschl. °/s² | Boost s / Nachladen s | Kardan ° |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 Starter | 320 | 2,8 | 160 | 115 | 105 | 115 / 95 | 85 | 75 | 170 | 340 | 700 | 6,0 / 9 | 6 |
| S2 Courier | 300 | 2,75 | 145 | 105 | 95 | 105 / 88 | 78 | 68 | 155 | 290 | 620 | 6,5 / 9,5 | 8 |
| S3 Warden | 290 | 2,7 | 128 | 95 | 85 | 95 / 80 | 70 | 61 | 140 | 245 | 540 | 7,0 / 10 | 10 |
| S4 Halberd | 295 | 2,6 | 116 | 86 | 76 | 85 / 70 | 62 | 54 | 125 | 205 | 460 | 7,5 / 10,5 | 12 |
| S5 Bastion | 300 | 2,55 | 104 | 77 | 66 | 75 / 62 | 54 | 47 | 110 | 170 | 390 | 8,0 / 11 | 15 |
| S6 Rampart | 305 | 2,45 | 92 | 68 | 57 | 66 / 54 | 46 | 40 | 95 | 135 | 320 | 8,5 / 12 | 18 |
| S7 Monarch | 310 | 2,35 | 82 | 60 | 49 | 58 / 47 | 39 | 34 | 82 | 105 | 260 | 9,0 / 13 | 22 |
| S8 Leviathan | 320 | 2,25 | 72 | 52 | 42 | 50 / 40 | 32 | 28 | 70 | 80 | 200 | 10 / 14 | 28 |

Beschleunigungen in m/s². Gemeinsame Faktoren: Boost ×1,6 auf alle Beschleunigungen, ×1,25 auf Drehraten, Boost-Tempo ×1,22 über dem Kampftempo. Landemodus: Tempo höchstens 45 m/s (S1) bis 30 m/s (S8), Drehraten ×0,5, Begrenzer fest. REISE: Drehraten ×0,7, Seitenschub ×0,5, Waffen und Schildaufbau aus.

**Lesart:** Ein Starter erreicht 95 % des Kampftempos in etwa 2,1 s (wie heute ≈ 2 s) und dreht 90° in etwa 1,5 s. Schiff 8 braucht etwa 4,2 s und 3,6 s. Damit fühlt sich Schiff 8 groß und schwer an. Ausgeglichen wird das über den **Kardankegel**: Große Schiffe haben Geschütztürme, deren Laser bis 28° neben der Nase treffen. Kleine Schiffe zielen fast nur über die Nase und müssen fliegerisch zielen.

**Zeitwerte zum Prüfen** (Selbsttest, Toleranz ±10 %): 0 → 95 % Kampftempo gekoppelt, Vollschub bis Stillstand gekoppelt, Raumbremse aus vollem Tempo bis unter 1 m/s, 90°-Schwenk im Mausziel ohne Überschwingen über 2°. Die Sollwerte rechnet der Test aus der Tabelle (Formel im Test, nicht von Hand).

Gegner bekommen keine eigene Tabelle. Sie werden einer Klasse über ihren Radius zugeordnet (`radius ≤ 14` → S1-Werte für Drehung, `≥ 60` → S8). Ihr Tempo bleibt `def.speed` aus `data.js`.

---

## 6. Eingabe

Neue Dateien: `input/flightinput.js` (füllt den Steuerrahmen aus allen Geräten, besitzt den Mauszeiger-Fang) und `input/bindings.js` (Belegung als Datentabelle, damit sie später im Menü umbelegt und in `pad-map.js` und den Übersichten automatisch gezeigt werden kann). `input.js` leitet nur noch weiter: Taktikmodus → alter Weg, Verfolger oder Cockpit → `flightinput`.

### 6.1 Maus und Tastatur (3D-Modus, Standard)

**Maus im Spiel gefangen (Pointer Lock):** Beim Eintritt in den Flug (Verfolger oder Cockpit, kein Menü offen) wird der Zeiger gefangen (`requestPointerLock({ unadjustedMovement: true })`, wo verfügbar ohne Mausbeschleunigung). **Alt/Option halten** gibt den Zeiger frei, um HUD-Fenster zu verschieben oder anzuklicken. Loslassen fängt ihn wieder. Esc: Der Browser löst den Fang selbst. Das Spiel erkennt das über `pointerlockchange` und öffnet dann das Bordmenü (ein Tastendruck reicht, kein doppeltes Esc). Ohne Pointer Lock (abgelehnt, iPad mit Trackpad) gilt der Ersatzmodus „virtueller Stick“ mit sichtbarem Zeiger.

**Mausmodi (Einstellung):**

1. **Mausziel (Standard):** Die Maus bewegt das Fadenkreuz, also die Zielrichtung `aim`, sofort und ohne Glättung. `aim` ist eine Weltrichtung und bleibt im Raum stehen, während sich das Schiff hinterherdreht. Der Abstand zwischen Fadenkreuz und Nase ist auf einen **Zielkegel** von 32° begrenzt (einstellbar 20–45°). Wird weiter gezogen, wandert der Kegel mit. Empfindlichkeit 0,07°/px (0,03–0,15), Y umkehrbar.
2. **Virtueller Stick:** Die Auslenkung des Zeigers aus der Bildmitte ist die Drehrate. Totzone 3 %, äußerer Ring = volle Rate, Zeiger und Ring sichtbar. Das entspricht dem Stil der Referenz.

| Eingabe | Wirkung |
|---|---|
| Maus bewegen | Zielen (Mausziel) bzw. Drehrate (virtueller Stick) |
| Linke Maustaste (halten) | Laser feuern (Abschnitt 8) |
| Rechte Maustaste | Ziel unter dem Fadenkreuz aufschalten; ohne Treffer das Ziel, das dem Fadenkreuz am nächsten liegt |
| Mittlere Maustaste halten | Umsehen (wie heute im Cockpit, jetzt auch im Verfolger) |
| Mausrad | Begrenzer ±5 % |
| Shift + Mausrad | Kamera-Abstand (Zoom, wie heute das Mausrad) |
| W / S | Schub vorwärts / rückwärts (halten) |
| A / D | seitlich schieben |
| Leertaste / Strg links | hoch / runter schieben |
| Q / E | rollen links / rechts |
| Shift links (halten) | Boost |
| X (halten) | Raumbremse |
| C | Tempomat an/aus (hält das aktuelle Vorwärtstempo; W/S ändern es, solange er an ist) |
| Alt + C | gekoppelt / entkoppelt |
| B | KAMPF / REISE (1,5 s Hochlauf, im Kampf gesperrt) |
| N | Landemodus an/aus (fährt das Fahrwerk) |
| F | Kontext: andocken, springen, Beute heranziehen (bisher E bzw. J) |
| R | Rakete (wie heute) |
| Tab / T | nächstes Ziel / Ziel vor dem Fadenkreuz |
| 1–6, Alt+1–5 | Munition und Schnellleiste wie heute |
| H | Autopilot zur Station (wie heute; fliegt in 3D und richtet zur Ebene aus) |
| V | Kamera Verfolger → Cockpit → Taktisch (wie heute) |
| Z (Taste unten links, deutsch beschriftet „Y“) halten | Umsehen (Alternative zur mittleren Taste) |
| Alt/Option halten | Mauszeiger frei für das HUD |

**Bewusste Änderungen gegenüber heute, nur im 3D-Modus** (Taktik bleibt wie bisher): Strg (bisher Angriff) wird zu „runter“, die Leertaste (bisher Rakete) zu „hoch“, E (bisher andocken) zu „rollen rechts“, B (bisher Fernhandel) zu „Modus“. Der Fernhandel wandert auf **L** und bleibt im Bordmenü. J und E behalten im 3D-Modus zusätzlich ihre alte Wirkung, wenn der Kontext eindeutig ist (am Tor bzw. in der sicheren Zone und ohne Rolleingabe in den letzten 0,3 s), damit Umsteiger nicht hängen bleiben. Alle Tasten werden über `e.code` (physische Lage) ausgewertet. Die Beschriftung kommt aus `navigator.keyboard.getLayoutMap()` (Chrome, Edge, Electron), sonst aus einer festen QWERTZ-Tabelle.

**Schubverhalten (Einstellung):** „Halten + Tempomat“ (Standard, wie die Referenz) oder „Schubhebel“: W/S verstellen ein Soll-Tempo, das stehen bleibt (näher am heutigen Dauerschub).

### 6.2 Controller (Xbox / PlayStation), 3D-Modus

Prinzip wie die Maus: Der **rechte Stick zielt** (bewegt `aim` mit Ratenkurve, Exponent 1,6 aus `gamepad.js`, bis 140°/s bei Vollausschlag), das Schiff folgt mit Trägheit. Der linke Stick fliegt.

| Controller (Xbox · PlayStation) | Wirkung |
|---|---|
| Rechter Stick | Zielen (Fadenkreuz), Zielhilfe siehe 8.4 |
| Linker Stick ↕ | Schub vorwärts / rückwärts, stufenlos |
| Linker Stick ↔ | Rollen |
| LB · L1 halten + linker Stick | seitlich / hoch-runter schieben (Düsenmodus); LB kurz = voriges Ziel (wie heute) |
| RT · R2 | Laser feuern |
| LT · L2 | Ziel unter dem Fadenkreuz aufschalten; halten = Zielhilfe verstärkt (Verfolgen) |
| A · × (halten) | Boost |
| B · ○ | kurz: Abbrechen (wie heute); halten: Raumbremse |
| X · □ | Rakete (wie heute) |
| Y · △ | Kontext (wie heute), halten = Autopilot |
| RB · R1 | nächstes Ziel (wie heute), RB + A Schnellleiste (wie heute, Boost dann nicht) |
| L3 | kurz Tempomat, 0,5 s halten KAMPF/REISE |
| R3 | Kamera (wie heute) |
| Steuerkreuz ◂ ▸ ▴ ▾ | Schnellleiste (wie heute); ▴ 0,5 s halten = Landemodus, ▾ 0,5 s halten = entkoppeln |
| MENU, VIEW | wie heute |
| Umsehen | VIEW halten + rechter Stick (VIEW kurz = Karte wie heute) |

Im Taktikmodus gilt die heutige Belegung unverändert. Die Belegungsgrafik (`ui/pad-map.js`) zeigt je Kamera die passende Tabelle.

### 6.3 Touch (abgestuft, nicht kaputt machen)

- **Handy (Standard): Taktikmodus wie heute.** Der 3D-Modus ist in den Einstellungen wählbar, aber nicht voreingestellt.
- **Tablet und Handy im 3D-Modus („Flug vereinfacht“):** linker Daumen-Stick = Zielen (wie der rechte Controller-Stick, gleiche Zielhilfe in der Stufe „stark“), rechts ein senkrechter Schubregler (stehen bleibender Hebel) und die Knöpfe Feuer, Boost, Rakete und Kontext. Kurvenrollen und Horizonthalter sind immer an, Seiten- und Höhenschub über einen kleinen Zweitstick (zuklappbar). Kein Pointer Lock.
- Pinch-Zoom und die heutigen Knöpfe in `hud-touch.js` bleiben im Taktikmodus unverändert.

---

## 7. Kamera

### 7.1 Verfolger (3D)

Neue Funktion `chasePose3d()` in `render/camrig.js`. Die heutige `chasePose()` bleibt für den Übergang und den „Ebene“-Fallback:

- **Kameralage** `qc` folgt der Schiffslage `q` gefedert: Gieren und Nicken mit `ω = 6 /s` (sichtbares Nachziehen in schnellen Kurven), Rollen mit Anteil 0,85 (Einstellung „Horizont mitrollen“ 0–1, Standard 0,85; 0 = Horizont bleibt gerade, gegen Übelkeit).
- **Position** = Schiff + `qc · (0, h, D)` mit `D`, Höhenwinkel und Bildlage aus der vorhandenen Rahmung `CHASE_FRAME` (je Klasse geprüft, `groessen.mjs` bleibt gültig).
- **Blickpunkt** liegt zwischen Nase und Zielrichtung: `look = Schiff + normalize(0,7 · Nase + 0,3 · aim) · 400 m`. So bleibt das Fadenkreuz auch am Rand des Zielkegels im Bild.
- Federung, Sichtfeld-Kick, Boost-Zittern, Treffer- und Druckwellenstöße bleiben wie heute (`step`, `shakeOffset`, `shakeRoll`), jetzt im Kamerasystem statt nur in der Ebene.
- Der Kampfschwenk „Ziel ins Bild“ ist im 3D-Modus **aus**, weil der Spieler selbst zielt. Ersatz ist die Peilmarke am Bildrand (gibt es schon in `hud-mid.js`).

### 7.2 Cockpit

`_cockpitPose(pv, kc)` setzt die Kamera am Pilotenplatz mit der vollen Schiffslage. Die Cockpit-Szene (`render/cockpit.js`, Tiefe 0,05–40 m) hängt an der Kamera wie heute. Neu:

- **Kopfbewegung durch Beschleunigung:** Der Kopf verschiebt sich um höchstens 6 cm gegen die Beschleunigung (gedämpft, abschaltbar mit „Kamerawackeln aus“).
- **Horizontanzeige** im Cockpit als Leiter im HUD-Glas (Abschnitt 12), gezeichnet in der HUD-Ebene und nicht in der Instrumententextur. Die Instrumente aktualisieren sich nur 5×/s, das ist für einen Horizont zu langsam.
- Umsehen bis ±110° Gieren und −35°/+60° Nicken, federt beim Loslassen zurück (heute `lookBy`).

### 7.3 Übergänge

| Von → Nach | Kamera | Flug |
|---|---|---|
| Verfolger ↔ Cockpit | heutige Überblendung `kc` (0,9 s) | unverändert, kein Moduswechsel |
| Taktisch → Verfolger/Cockpit | heutige Überblendung `k`, Ziel ist `chasePose3d` | `flight.enter()`: Lage aus `rot`, Tempo bleibt |
| Verfolger/Cockpit → Taktisch | heutige Überblendung `k` | `flight.leave()`: Ebenenfänger (4.5), Klickflug sofort aktiv |
| Andocken, Sprung, Tod | wie heute | Flugschicht pausiert (`_haltPlayer` setzt zusätzlich `w = 0` und `vy = 0`) |

### 7.4 Umsehen

Mittlere Maustaste, Z oder VIEW + rechter Stick: Die Kamera kreist um das Schiff (Verfolger) bzw. der Kopf dreht sich (Cockpit). Zielrichtung und Schiff bleiben unberührt (`aim` wird eingefroren). Loslassen federt zurück (Zeitkonstante 0,2 s, heute `lookYaw/lookPitch`).

---

## 8. Waffen und Zielen

### 8.1 Bolzen statt Würfel (nur 3D-Modus)

Neue Datei `sim/bolts.js`: fester Vorrat von 96 Bolzen (keine Speicher-Neuanlage) mit `{ from, x, y, z, dx, dy, dz, v, tEnd, laser, ammo, crit, idx }`. Je Schritt wird jeder Bolzen als Strecke `p → p + d · v · dt` gegen die Trefferkugeln möglicher Ziele geprüft (Kandidaten aus dem Raster, gefiltert nach `y`), dazu gegen Asteroiden (Deckung wie heute). Ein Treffer ruft den **vorhandenen** `_hitEnemy(...)` mit Schaden, Munition und kritischem Treffer wie bisher. Belohnung, Quests, Combo, Koop und PvP-Meldung bleiben damit unverändert.

- Bolzentempo 2.400 m/s (alle Laser gleich, sonst stimmt die Vorhaltemarke je Waffe nicht), Lebensdauer = Reichweite / Tempo (650 m → 0,27 s). Streuung 0,12° je Schuss.
- Trefferkugel: Gegnerradius × 1,25 (PvE großzügig), fremde Spieler × 1,0.
- **Pulsteilung:** Im 3D-Modus feuert jeder Laser 4 Pulse je Sekunde mit je 1/4 Schaden. Munition wird erst je 4 Pulse abgezogen (Zähler je Laser). Schaden pro Sekunde und Munitionsverbrauch bleiben damit gleich wie heute, das Zielen fühlt sich aber an wie bei einer echten Bordkanone. SAL-Salve und SAB bleiben eigene Sonderschüsse.
- Ohne aufgeschaltetes Ziel kann trotzdem gefeuert werden. Die Bolzen treffen, was im Weg ist (Gegner, bei PvP fremde Spieler).

**Gegner auf den Spieler** bleiben vorerst beim Würfel (`hitChance`). Die Querbewegung wird aber in 3D gerechnet (`|v_rel × d̂|`), und der Feuerkegel `ENEMY_FIRE_ARC` gilt als 3D-Kegel um die Nase. Ausweichen nach oben und unten zahlt sich damit sofort aus. Sichtbar sind ihre Schüsse wie heute. Echte Gegnerbolzen sind eine spätere Stufe (Risiko: Balance).

### 8.2 Konvergenz

- Die Simulation kennt je Klasse grobe Waffenpunkte im Schiff (`flightdata.js`: links/rechts-Abstand, Höhe, Länge). Die Grafik zeichnet den Strahl weiter von den echten Ankern (`renderer.getMuzzle`) zum selben Treffpunkt.
- **Dynamische Konvergenz:** Alle Waffen richten sich auf den Punkt `Schiff + aim · D_k` aus. `D_k` ist die Entfernung des Ziels unter dem Fadenkreuz bzw. des aufgeschalteten Ziels, sonst 500 m. Begrenzt wird nur durch den Kardankegel der Klasse (Tabelle 5) um die Nase. Liegt `aim` außerhalb, schießen die Waffen an den Kegelrand. Das HUD zeigt dann die Kardanmarken grau.
- Schiffe mit Kardan 0 (falls später gewünscht, „feste Waffen“) treffen nur über die Nase.

### 8.3 Vorhalt

Für das aufgeschaltete Ziel wird der Abfangpunkt mit konstanter Zielgeschwindigkeit gelöst: `|P_t + V_rel · t| = v_bolzen · t` (quadratische Gleichung, kleinste positive Lösung). Wenn es keine Lösung gibt, wird keine Marke gezeigt. Daraus entsteht die **Vorhaltemarke**. Liegen Fadenkreuz und Marke übereinander, trifft der Bolzen (bis auf Ausweichmanöver des Gegners, `jink` bleibt also eine echte Gefahr). Die Marke ist im HUD **eine** Marke für alle Laser, weil alle Laser dasselbe Tempo haben.

### 8.4 Zielhilfe

| Stufe | Maus | Controller | Touch |
|---|---|---|---|
| aus | – | – | – |
| schwach | – | Dämpfung 0,7 | – |
| normal (Standard Controller) | – | Dämpfung 0,45, Mitführen 35 % | – |
| stark (Standard Touch) | – | Dämpfung 0,35, Mitführen 60 %, Kardan +30 % | wie Controller „stark“, dazu Auto-Feuer auf die Vorhaltemarke im Kegel |

- **Dämpfung (Reibung):** Liegt das Fadenkreuz im Hilfskreis um die Vorhaltemarke (Radius = max(2,5°, 1,5 × Winkelgröße des Ziels)), wird die Zielgeschwindigkeit des Sticks mit dem Faktor multipliziert. Das ist das Prinzip der Referenz.
- **Mitführen:** Im Kreis wird ein Anteil der Winkelbewegung der Vorhaltemarke (aus Sicht des Schiffs) zu `aim` addiert. So bleibt man auf einem querfliegenden Ziel, ohne dass das Fadenkreuz von selbst auf ein Ziel springt.
- **Kein Ziehen über Ziele hinweg**, kein Fangen außerhalb des Kreises, wirkt nur auf aufgeschaltete Ziele.
- **PvP:** Höchstens Stufe „schwach“, Mitführen 0, für alle gleich (Fairness gegen die Maus). Die Stufe steht im Mehrspieler-Zustand (Flag), damit Missbrauch erkennbar ist.

### 8.5 Raketen

Aufschalten über rechte Maustaste, LT oder Tab. Die Rakete braucht das Ziel 1,0 s in einem Kegel von 14° vor dem Fadenkreuz (Anzeige „AUFSCHALTEN …“ und „BEREIT“). Danach gelten Treffer und Laufzeit wie heute (`ROCKET_FLIGHT` 0,6 s, `rocketHits`). Die Flugbahn wird für die Grafik in 3D gezeichnet. So bleibt die Raketen-Balance unverändert.

### 8.6 Drohnen

Laser-Drohnen feuern wie heute mit, sobald der Spieler feuert und ein Ziel aufgeschaltet ist (`updateDrones(..., firing)`). Ihre Positionen bekommen die Höhe des Spielers plus Formationsversatz in 3D (`drones.js`).

---

## 9. KI in 3D

### 9.1 Bewegungsmodell der Gegner

Kein voller Flugregler (zu teuer für 40–60 Gegner und für die KI unnötig), sondern ein **kinematischer 3D-Lenker** mit denselben Grenzen:

- Wunschgeschwindigkeit `(MV.tx, MV.ty, MV.tz)`, wobei `MV.ty` neu ist. `moveEnemy` rechnet wie heute, die Höhentaktik (9.2) liefert `ty`.
- Geschwindigkeitsänderung begrenzt durch `ENEMY_ACCEL` (wie heute), Richtungsänderung durch eine Drehrate aus der Klassenzuordnung (Abschnitt 5) bzw. `ENEMY_TURN`.
- Lage: Nase = Geschwindigkeitsrichtung (im Angriff zum Ziel wie heute), Rollen aus der Querbeschleunigung (heute `e.bank`), Nicken aus `vy`. Heraus kommen `e.y`, `e.vy`, `e.pitch` und `e.bank`. Eine Quaternion braucht der Gegner nicht, sie wird in der Grafik aus Gier, Nicken und Rollen gebaut.
- Raster und Abstandshalten (`SEP_QUERY`) in 3D: Nachbarn aus dem 2D-Raster, Abstand mit `y`.

### 9.2 Höhentaktik (`sim/ai3d.js`)

| Zustand | Verhalten in 3D |
|---|---|
| `wander` | Höhe um die Heimathöhe `homeY` ±150 m (langsame Welle), Wegpunkte mit Höhe |
| `attack` (Kreisen) | Jeder Angreifer hat eine eigene **geneigte Kreisebene** um das Ziel: Normale = Weltsenkrechte um 15–45° gekippt um eine zufällige waagrechte Achse (aus dem KI-eigenen Zufall, nicht `w.rng`). Radial- und Tangentialanteil wie heute, nur in dieser Ebene. Das ergibt echte 3D-Bahnen ohne neue Taktiklogik. |
| `attack` (Kite) | Abstand halten in 3D, bevorzugt Höhenversatz ±200 m zum Ziel |
| Ramm-, Sprung- und Ladeangriffe (`ram`, `charge`, `pounce`) | Anflug mit Höhenvorteil (+250 m), dann Sturz auf den Abfangpunkt. Die Warnanzeige wird zur Röhre bzw. zum Kegel in 3D (`telegraph.js`). |
| `hold` (Warterring) | Kugelschale statt Ring: Wartende verteilen sich auf ±250 m Höhe nach Index |
| Flanken-Regie (`directCombat`) | Flankenwinkel in 3D. Höchstens 2 Angreifer gleichzeitig in der hinteren Halbkugel des Spielers, höchstens 1 direkt darüber oder darunter (unter 25° zur Senkrechten). Dadurch bleibt Kampf lesbar. |
| Flucht, Rückzug | Wegbewegung mit Höhenwechsel (Steigen oder Sinken, je nachdem, was weiter vom Spieler wegführt), Deckung hinter Brocken in 3D |
| Ausweichen (`jink`) | Seitlich oder senkrecht (50/50), damit Bolzen auch nach oben und unten verfehlen |
| Säurewolke, Minen, Störsender | Kugeln mit Höhe statt Kreisen (`hazards` und `abilities.js` bekommen `y`) |
| Nest, stationäre Gegner | Höhe fest |

**Taktikmodus:** Ist der Spieler auf der Ebene, ziehen die Gegner ihre Wunschhöhe innerhalb von 4 s auf `ziel.y ± 30 m`. Damit ist der Taktikmodus wieder flach, ohne einen eigenen KI-Zweig.

### 9.3 Vorhalt der Gegner

Gegner zielen auf den vorhergesagten Punkt des Spielers (gleiche Funktion wie 8.3, mit einer Verzögerung von 0,25 s auf die Spielergeschwindigkeit, damit Haken schlagen sich lohnt). Die Trefferchance bleibt `hitChance` mit 3D-Querbewegung.

---

## 10. Mehrspieler-Abgleich

### 10.1 Sektorkanal (`mp.js`, Zustand `s`)

Heute: `d = [x, z, rot·100, kurs·100, tempo, hülle%, schild%, flags, ziel]`. Neu werden Felder **hinten angehängt** (alte Clients lesen nur die ersten 9, `parseState` verlangt mindestens 8):

| Index | Feld | Auflösung |
|---|---|---|
| 9 | `y` | m, ganze Zahl |
| 10 | Nicken | 1/100 rad |
| 11 | Rollen | 1/100 rad |
| 12 | Modus | Bitfeld: 1 Flugschicht aktiv, 2 entkoppelt, 4 REISE, 8 Landung, 16 Fahrwerk, 32 Boost |

`flags` bekommt Bit 32 „3D“ für Namensschild und Minikarte. Zusatzlast ≈ 14 Byte je Zustand, also weniger als +20 % (heute ≈ 9 × 90 Byte/s). Gier bleibt `rot`. Die Lage wird beim Empfänger aus Gier, Nicken und Rollen gebaut und per Quaternion-Slerp interpoliert (Nicken und Rollen bleiben im Zustand immer unter ±89°, bei steilerer Lage wird die Gier aus der Geschwindigkeit genommen; das genügt für 9 Pakete/s mit 130 ms Puffer).

`Interp` (`mp-core.js`) puffert zusätzlich `y, pitch, roll` und rechnet `vy` in der Vorhersage (höchstens 250 ms wie heute).

### 10.2 Koop (`coop.js`)

- Gastgeber-Schnappschuss Gegnerzeilen: `[id, x, z, rot, hp, shield, alive, rank, y]`, also 9. Feld angehängt.
- Kopfzeile `h` und Gast-Meldung `g` bekommen `y, pi, ro` (Nicken, Rollen).
- Bolzen-Treffer des Gastes bleiben „Wünsche“ an den Gastgeber (`coop.hit`). Der Gast rechnet seine Bolzen gegen seine (interpolierte) Sicht der Gegner. Ein Fehlschlag wegen Verzögerung wird durch die PvE-Trefferkugel × 1,25 aufgefangen. Der Gastgeber prüft nur Plausibilität (Reichweite + 25 %).

### 10.3 PvP

Das Opfer rechnet den Treffer weiter selbst (heutige Regel). Neu ist eine Plausibilitätsprüfung in 3D: Abstand ≤ Reichweite × 1,3 und Schütze nicht in REISE. Die Zielhilfe-Stufe des Schützen steht im Modus-Bitfeld. Für den späteren Server (Phase B) ist der Steuerrahmen (4.1) bereits die Absicht, die der Client sendet. Das passt zum Protokollcode 0x06 im Architekturplan.

### 10.4 Gemischte Modi

Ein Spieler im Taktikmodus hat `y → 0` und erscheint bei 3D-Spielern auf der Ebene. Ein 3D-Spieler erscheint bei einem Taktikspieler mit seiner `x/z`-Position (die Taktikgrafik zeigt Höhe nur als kleinen Wert am Namensschild). Alte Clients ohne Flugschicht zeigen 3D-Spieler auf der Ebene. Das ist korrekt in `x/z` und nur ohne Höhe.

---

## 11. Taktikmodus als Nebenmodus

- **Code-Weg unverändert:** `world.flight3d === false` → `_movePlayer`, `_updateLasers` (Würfel), Klickflug, alte Tastatur- und Controller-Belegung. Ein Goldwert-Test (17.1, T-01) sichert, dass der Weg bitgleich bleibt.
- **Höhe:** Der Spieler wird auf die Ebene gefangen (4.5), Gegner gleichen sich an (9.2). Beute und Gegner mit Höhe ≠ 0 werden in der Taktikgrafik auf die Ebene projiziert gezeichnet. Aufnehmen und Reichweite rechnen im Taktikmodus 2D, damit nichts unerreichbar wird.
- **Wechsel jederzeit mit V**, auch im Kampf. Das Ziel bleibt aufgeschaltet, Angriff an/aus wird übernommen (im 3D-Modus heißt „Angriff an“: Feuer halten mit Zielhilfe, solange die Taste gehalten wird; beim Wechsel nach Taktik geht ein laufendes Feuer in „Angriff an“ über).
- **Mobil:** Standard bleibt Taktik (6.3).

---

## 12. HUD-Elemente

Alle Elemente folgen `Planung/UI_STIL.md` (angeschnittene Ecken, Haarlinien, DIN Condensed, Fraktionsfarbe nur als Akzent, Rot nur für Gefahr). Die Bildmitte liegt in einer neuen Ebene `ui/hud-flight.js` (+ `.css`), gebaut wie `hud-mid.js`: wenige feste Knoten, nur `transform` und `opacity`, DOM-Änderung nur bei geänderten Werten.

### 12.1 Bildmitte (Zielhilfen)

| Element | Form | Bedeutung |
|---|---|---|
| **Fadenkreuz** | kleines Kreuz mit Lücke, Weiß 90 % | Zielrichtung `aim` (Maus, rechter Stick), wird im selben Bild wie die Eingabe gezeichnet |
| **Bugmarke** | kleiner Kreis, Weiß 50 % | wohin die Nase zeigt (das Schiff „holt das Fadenkreuz ein“) |
| **Kardanmarken** | 2–4 Punkte je Waffengruppe | Treffpunkt der Waffen auf Konvergenzentfernung, grau außerhalb des Kardankegels |
| **Vorhaltemarke** | Raute in Fraktionsfarbe, Rot bei Feind in Reichweite | Abfangpunkt (8.3) |
| **Flugbahnmarker** | Kreis mit drei Strichen | Richtung der Geschwindigkeit (wichtig entkoppelt) |
| **Zielklammer, Peilmarke, Angreifer-Markierung** | vorhanden (`hud-mid.js`) | jetzt mit 3D-Projektion, Peilmarke zeigt auch „oben/unten“ |
| **Horizontleiter** | feine Linien alle 10°, Horizont kräftiger | nur Cockpit (Standard) bzw. wählbar im Verfolger |
| **Aufschaltring** | Kreis schließt sich in 1 s | Raketen-Aufschaltung (8.5) |
| **Hilfskreis** | sehr leise Haarlinie | Zielhilfe aktiv (nur Controller und Touch) |

### 12.2 Fenster „FLG·05 FLUG“ (neu, eigenes HUD-Fenster, verschiebbar, zuklappbar, „nur Balken“ / „genaue Werte“)

- **Tempo:** große Zahl `287 M/S` mit senkrechter Skala, Markierung für Soll (`vSet`), Begrenzer als Klammer, Boost-Bereich schraffiert.
- **Schub:** drei kleine Balken (längs, seitlich, senkrecht) aus `thrustB`, ±.
- **Boost:** segmentierter Balken (`.ls-bar`), gesperrt in Warnfarbe.
- **Modus-Zeile:** `KAMPF` / `REISE ▸ 1,2 S` · `GEKOPPELT` / `ENTKOPPELT` (entkoppelt in Warnfarbe) · `TEMPOMAT 240` · `BEGRENZER 75 %` · `LANDUNG` · `FAHRWERK AUS/FÄHRT/AUS­GEFAHREN`.
- **Höhe:** `EBENE +240 M` und Steigrate `▲ 35 M/S`. Später `ÜBER GRUND` und `SCHWERKRAFT 0,8 G`.
- **Lage:** kleiner künstlicher Horizont (Kreis mit Horizontlinie) und Rollwinkel.

Das bestehende Fenster SCHIFF (Hülle, Schild, Generatoren, Tempo) bleibt. Dort wird „Tempo“ zur Kurzform, wenn FLUG offen ist.

### 12.3 Minikarte (`hud-map.js`)

Gegner und Spieler über oder unter dir werden mit ▲ bzw. ▼ und dem Höhenunterschied in 100-m-Schritten gezeigt, ab ±150 m. Eine optionale 3D-Radarscheibe (Ellipse mit Stielen) kommt erst in der Politur, wenn Zeit bleibt.

### 12.4 Hinweise und Texte

Flug-Coach (`hud-coach.js`) und SYSTEM-Reihe (`hud-guide.js`, `system-quests.js`, 69 Quests) zeigen je Modus die richtigen Tasten. Die Tastennamen kommen aus `bindings.js`, nicht fest im Text. Neue Coach-Schritte für den ersten 3D-Flug: Zielen, Boost, Begrenzer, Raumbremse, entkoppeln.

---

## 13. Vorbereitung Landemodus und Planetenlandung

Ziel ist, dass der Meilenstein „anfliegen, landen, aussteigen, zu Fuß, einsteigen, abheben“ **auf dieser Flugschicht** gebaut wird, ohne Umbau.

### 13.1 Was die Flugschicht schon jetzt mitbringt

| Baustein | Umsetzung jetzt | Erweiterung später |
|---|---|---|
| Bezugsrahmen | `fl.frame = 'sec:<id>'`, Positionen in JS-`number` (64 Bit) | `'body:<planet>'` (planetenfest), Wechsel mit Umrechnung von Position, Geschwindigkeit und Lage (`frameChange()`) |
| Schwerkraft | `env.gravityAt(pos, out)` → 0 | Planet: `g · (Mitte − pos)/|…|`, nach Höhe abnehmend |
| Atmosphäre | `env.airAt(pos)` → `{ rho: 0 }` | Dichte nach Höhe, Widerstand `−c_d · ρ · |v| · v` je Klasse, später Auftrieb |
| Boden | `env.groundAt(x, z, out)` → keiner | Landefelder (Scheiben) an Stationen, später `heightAt()` des Planeten (Architekturplan 2.8) |
| Schwebeflug | gekoppelter Regler gleicht `g` aus (4.2, Schritt 5) | unverändert |
| Landemodus | N: Tempo- und Drehgrenzen, Horizonthalter zur Schwerkraftsenkrechten | Landehilfe (Halten: sinkt mit 2 m/s und richtet sich zur Bodennormalen aus) |
| Fahrwerk | `fl.gear` 0..1, Beinpunkte je Klasse in `flightdata.js` (3–4 Punkte im Schiff) | Anker `HP_Gear_*` in den Modellen (Schiffsqualität), sichtbare Beine |
| Kontakt | Feder-Dämpfer je Bein: `ω_n = 12 rad/s`, Dämpfung 0,9, in 4 Teilschritten; Reibung 0,8; `landed`, sobald alle Beine Kontakt haben und `|v| < 0,5 m/s` für 0,5 s | Aufsetzen zu hart (> 6 m/s) richtet Schaden an |
| Gelandet | Triebwerke im Leerlauf, Lage gesperrt, Schiff hängt am Rahmen des Bodens | Aussteigen: Figur übernimmt (Rapier-Controller), Schiff wird statisch |
| Abheben | Hochschub > `g` löst `landed` | unverändert |
| Gleitkomma | Sektoren ≤ 8 km: float32 in der GPU reicht (≈ 0,5 mm) | **kameranahes Zeichnen** aus dem Architekturplan (2.6). Vorbereitung jetzt: Alle Weltpositionen gehen in `renderer.js` über eine Hilfe `toRender(x, y, z, out)`, die heute nur kopiert. Später zieht sie den Kameraursprung ab, das ist dann eine einzige Stelle. |
| Reisemodus und Anflug | REISE mit 2,25–2,8 × Kampftempo | Höhenabhängige Tempogrenze (Architekturplan D2), Wiedereintritt als Effekt |

### 13.2 Erprobung im heutigen Spiel (optional, klein)

Eine **Landeplattform** an jeder Heimatstation (Scheibe, 120 m, `y = +40`) als erstes `groundAt`. Darauf landen ersetzt das Andocken nicht, aber Landemodus, Fahrwerk, Kontaktmodell und HUD werden echt erprobt, bevor es Planeten gibt. Ein kleiner Test-Schwerkraftbereich über der Plattform (0,4 g, nur im Umkreis von 300 m) prüft Schwebeflug und Aufsetzen.

---

## 14. Leistungsbudget (Mac zuerst)

**Ziel 1 – Mac (Apple M5, Browser und Mac-App):** 120 Hz im Flug auf HOCH, im Kampf mindestens 60 Hz ohne Ausreißer. Die heutigen Messungen bleiben die Grundlage (ENGINE.md: Kampf-GPU 6–8 ms, CPU 3,5–4,4 ms je Bild).

| Posten | Budget je Bild (120 Hz) | Begründung |
|---|---|---|
| Flugschicht Spieler | ≤ 0,02 ms | ≈ 300 Gleitkommaoperationen je Schritt |
| Gegner-3D (60 Gegner) | ≤ 0,15 ms | Zusatz zu `moveEnemy`: ≈ 40 Operationen je Gegner |
| Bolzen (96 Plätze) | ≤ 0,05 ms | Strecke gegen Kugel, Kandidaten aus dem Raster |
| Eingabe und Steuerrahmen | ≤ 0,02 ms | Ereignisse nur sammeln, je Bild einmal auswerten |
| HUD-Mitte (≤ 40 Knoten) | ≤ 0,3 ms | nur `transform` und `opacity`, keine Layout-Abfragen im Bild |
| Grafik zusätzlich (Quaternionen, Höhe, Volumen-Warnungen) | ≤ 0,2 ms CPU, ≤ 0,3 ms GPU | Warnvolumen als wenige transparente Körper statt Flächen |
| **Summe CPU zusätzlich** | **≤ 0,6 ms** | heutige 3,5–4,4 ms bleiben unter 5 ms |
| GPU Kampf HOCH, 1440 × 900 Retina | ≤ 8 ms (wie heute) | Blick nach oben und unten zeigt mehr Himmel und weniger Ebene. Das ist eher billiger, muss aber gemessen werden (Himmel `sky.js` rechnet schon über die volle Kugel mit `uInvProj/uCamRot`). |

**Eingabelatenz:** Das Fadenkreuz wird im nächsten `requestAnimationFrame` nach dem Mausereignis gezeichnet, also nicht erst nach dem nächsten Simulationsschritt (gezeichnet aus `aim` im Steuerrahmen, nicht aus der interpolierten Simulation). Die Schiffsdrehung beginnt nach höchstens einem Simulationsschritt (16,7 ms). Gezeichnet wird mit Zwischenbild (Slerp `pq → q` mit dem vorhandenen `alpha` aus `main.js`), damit es auf 120-Hz-Bildschirmen ruckelfrei ist.

**Keine Speicher-Neuanlage je Bild** (wichtig gegen GC-Ruckler in Safari): Steuerrahmen, Bolzen, Quaternionen und HUD-Werte liegen fest.

**Ziel 2 – Windows (RTX 5080):** Pointer Lock mit `unadjustedMovement`, 144–240 Hz über das Zwischenbild, Messung mit dem Bildwerkzeug wie auf dem Mac. **Ziel 3 – Handy und Tablet:** keine Mehrkosten im Taktikmodus (Flugschicht aus). Im 3D-Modus gelten dieselben Budgets, die adaptive Auflösung regelt wie heute.

---

## 15. Betroffene Dateien

### 15.1 Neu

| Datei | Inhalt |
|---|---|
| `Code/src/sim/flight.js` | Flugregler, Integrator, Modi, Boost, Begrenzer, Kontakt, `enter/leave`, Ableitungen |
| `Code/src/sim/math3.js` | Vektoren und Quaternionen ohne three.js |
| `Code/src/sim/flightdata.js` | Tabelle 5, Waffenpunkte, Fahrwerkpunkte, Stations-Kollisionshüllen, Höhenband |
| `Code/src/sim/bolts.js` | Bolzenvorrat, Streckentest, Vorhaltlöser |
| `Code/src/sim/ai3d.js` | Höhentaktik, geneigte Kreisebenen, 3D-Regie |
| `Code/src/sim/flighttest.mjs` | Selbsttest der Flugschicht, von `npm test` mit aufgerufen |
| `Code/src/input/flightinput.js` | Steuerrahmen aus Maus, Tastatur, Controller und Touch, Pointer Lock, Zielhilfe |
| `Code/src/input/bindings.js` | Belegung als Daten, Tastennamen nach Layout |
| `Code/src/ui/hud-flight.js`, `hud-flight.css` | Bildmitte (12.1) und Fenster FLUG (12.2) |
| `Code/tools/playtest/flug3d.mjs` | Browserprüfung des 3D-Flugs (Abschnitt 17) |
| `Code/tools/balance/flug3d.mjs` | Bot mit menschlicher Zielstreuung, Kampfdauer je Sektor |

### 15.2 Geändert (nach Umfang)

| Datei | Änderung |
|---|---|
| `sim/world.js` | `flight3d`-Zweig in `_updatePlayer`, Steuerrahmen, Bolzen statt Würfel im 3D-Zweig, Höhe bei Spawn, Wracks, Kisten, Zonen als Zylinder, Höhenband, `y` in Ereignissen (`shot`, `damage`, `explode`: optionales `y`) |
| `sim/ai.js` | `MV.ty`, 3D-Abstände, 3D-Feuerkegel, Regie-Grenzen hinten und oben |
| `sim/combat.js` | `d3sq`, 3D-Querbewegung in einer Hilfsfunktion für `hitChance` |
| `sim/spawn.js`, `sim/events.js`, `sim/abilities.js`, `sim/drones.js` | Höhe aus abgeleitetem Zufall, Gefahrenkugeln, Drohnenformation in 3D |
| `sim/config.js` | neue Konstanten (Höhenband, Bolzen, Zielhilfe, Bergungsstrahl) |
| `input.js`, `input/padflight.js` | Weiterleitung nach Modus, neue 3D-Belegung, Taktik unverändert |
| `render/renderer.js` | `y` und Lage aus Quaternion, `toRender()`, Auswahl im Bild mit `v.ry`, Schattenkamera folgt `y`, Bolzen statt Würfel-Strahlen im 3D-Modus |
| `render/camrig.js` | `chasePose3d`, Horizont mitrollen, Umsehen im Verfolger mit Maus |
| `render/cockpit.js` | Kopfbewegung, Lage aus Quaternion |
| `render/telegraph.js`, `effects.js`, `fields.js`, `speeddust.js`, `trails.js` | Warnvolumen, Ringe zur Kamera gedreht, Nebel mit Dicke, Staub und Schweife in 3D |
| `net/mp.js`, `net/mp-core.js`, `net/coop.js` | Felder anhängen, `Interp` mit `y`, Nicken, Rollen |
| `ui/hud-mid.js`, `ui/hud-map.js`, `ui/hud-touch.js`, `ui/hud-coach.js`, `ui/hud-guide.js`, `ui/pad-map.js` | 3D-Projektion, Höhenmarken, Touch-Stufe, Tastentexte |
| `ui/screens-*.js` (Einstellungen) | Flugmodell (3D/Ebene), Mausmodus, Empfindlichkeit, Zielkegel, Horizont mitrollen, Kurvenrollen, Horizonthalter, Schubverhalten, Zielhilfe |
| `audio/*` | Steuerdüsen, Boost, Modus-Hochlauf, Fahrwerk |
| `tools/playtest/controller.mjs`, `pilot-im-browser.js`, `tief.mjs`, `tools/mehrspieler/test.mjs`, `tools/bilder/kampf.mjs`, `cockpit.mjs` | 3D-Fälle ergänzen, alte Fälle laufen weiter im Taktikmodus |
| `Planung/CONTROLLER.md`, `FLUGGEFUEHL.md`, `SCHNITTSTELLEN.md`, `ARCHITEKTUR-SANDBOX.md` (2.1) | Entscheidungen nachtragen |

**Nicht angefasst:** `core/data.js` (Werte), Shooter-Renderer-Shader, Konto, Hub, Station.

---

## 16. Reihenfolge der Umsetzung

Jeder Schritt endet mit `npm run check` grün, Goldwert-Test grün (Taktik bitgleich), den bestehenden Browserprüfungen grün und einem eigenen Commit. Bis einschließlich F3 ist der 3D-Modus nur über `?flug=3d` oder die Einstellung erreichbar. Danach wird er auf dem Desktop zum Standard.

| Schritt | Inhalt | Ergebnis zum Anfassen | Aufwand (Vollzeit mit KI) |
|---|---|---|---|
| **F0 Fundament** | `math3.js`, `flightdata.js`, leere `flight.js` mit `enter/leave`, `y/q/py/pq` auf allen Entitäten (Standard 0), `toRender()` und Höhe im Renderer, Goldwert-Test des Taktikwegs, Schalter `?flug=3d` | nichts sichtbar, alles gleich | 2–3 Tage |
| **F1 Spieler fliegt in 3D** | Flugregler gekoppelt, Boost, Begrenzer, Tempomat, Raumbremse, Mausziel mit Pointer Lock, Tastatur, `chasePose3d`, Cockpit-Lage, 3D-Kollision, Höhenband, Ebenenfänger, Minimal-HUD (Fadenkreuz, Bugmarke, Tempo, Boost, Modus) | echter 3D-Flug, Gegner noch flach | 1–1,5 W |
| **F2 Waffen und Zielen** | Bolzen, Pulsteilung, Konvergenz, Kardan, Vorhaltemarke, Raketen-Aufschaltung, Gegnerfeuer mit 3D-Querbewegung, Bergungsstrahl, Zylinder-Zonen | Kampf mit Können, gleiche Belohnungen | 1 W |
| **F3 KI in 3D** | `MV.ty`, `ai3d.js`, geneigte Kreisebenen, Sturzangriffe, Kugelschale, Regie-Grenzen, Warnvolumen, Höhen bei Spawn und Ereignissen, Minikarte mit Höhenmarken | Kampf rundum in 3D | 1–1,5 W |
| **F4 Controller, Zielhilfe, Touch-Stufe** | 3D-Belegung, Zielhilfe-Stufen, Belegungsgrafik, Touch „Flug vereinfacht“ (nur Tablet-Option) | Controller fühlt sich an wie die Maus | 0,5–1 W |
| **F5 Mehrspieler und Koop** | Felder anhängen, `Interp` erweitern, Koop-Gegnerhöhe, Plausibilitätsprüfungen | gemeinsam in 3D, alte Clients verträglich | 0,5 W |
| **F6 Entkoppelt, REISE, Landemodus-Vorbereitung** | Entkoppelt, Flugbahnmarker, REISE-Hochlauf, Landemodus, Fahrwerk, Kontaktmodell, `env`-Haken, Landeplattform-Erprobung | Grundlage für „Planetenlandung“ | 1 W |
| **F7 Politur** | Fenster FLUG vollständig, Horizontleiter, Einstellungen, Tastentexte der SYSTEM-Reihe und des Coachs, Ton, Feinschliff der Werte nach Spieltest, Leistungsmessung Mac und Windows, Doku | auslieferbar, 3D als Standard | 1–1,5 W |

**Summe ≈ 6,5–9 Wochen Vollzeit**, nebenbei (≈ 15 h/Woche) etwa ×2,5. Nach F1 kann Toni den Flug schon selbst testen, das ist der wichtigste frühe Prüfpunkt („macht es Spaß?“). Die Werte aus Tabelle 5 werden danach in einer kurzen Abstimmungsrunde angepasst, bevor F2 beginnt.

---

## 17. Testplan (automatisch, unsichtbar)

Alle Browserprüfungen laufen mit `playwright-core` **headless** gegen einen eigenen Entwicklungsserver auf einem freien Port (nicht 5173, z. B. `npx vite --port 5196 --strictPort`), der danach beendet wird. Ergebnisse unter `tools/playtest/berichte/flug3d-<zeit>/`.

### 17.1 Selbsttest Node (`npm test`, Teil `sim/flighttest.mjs`)

| Nr. | Prüfung | Grenze |
|---|---|---|
| T-01 | **Goldwert Taktik:** 120-s-Bot des bestehenden Selbsttests mit `flight3d = false`, Prüfsumme über Position, Leben und Ereignisse aller Entitäten | gleich dem gespeicherten Wert vor F0 |
| T-02 | Gekoppelt 0 → 95 % Kampftempo je Klasse | Zeit aus Tabelle ±10 % |
| T-03 | Gekoppelt Eingabe weg → Stillstand; Raumbremse aus Vollgas | Zeit ±10 %, Endtempo < 1 m/s |
| T-04 | Entkoppelt ohne Eingabe 10 s | Geschwindigkeit bleibt ±0,5 % |
| T-05 | Tempo-Obergrenze gekoppelt, entkoppelt, mit Boost | nie über `vMax · 1,02` |
| T-06 | Drehraten und Drehbeschleunigung je Achse und Klasse | Raten nie über Tabelle × Boost-Faktor |
| T-07 | Mausziel-Sprung 10°, 30°, 90°, 170° je Klasse | Überschwingen ≤ 2°, Einschwingen auf 0,5° in der berechneten Zeit +20 % |
| T-08 | Quaternion nach 10⁶ Schritten mit Zufallseingaben | Normabweichung < 1e-9 |
| T-09 | Determinismus: zwei Läufe mit derselben Eingabefolge | bitgleiche Prüfsumme |
| T-10 | Boost: Leerlauf, Sperre, Nachladen | Zeiten aus Tabelle ±5 % |
| T-11 | Begrenzer und Tempomat | Solltempo ±1 % |
| T-12 | Ebenenfänger nach `leave()` | `|y| < 1 m`, Rollen und Nicken < 1° nach höchstens 3 s |
| T-13 | Vorhaltlöser: Ziel mit konstantem Tempo in 200 Zufallslagen | Fehlabstand < 0,5 m |
| T-14 | Konvergenz: Strahlen aller Waffenpunkte | schneiden sich im Zielpunkt (< 0,1 m), außerhalb des Kardankegels am Rand |
| T-15 | Bolzen-Treffer auf ruhendes und querfliegendes Ziel mit perfektem Vorhalt | 100 % bzw. ≥ 95 % (Streuung) |
| T-16 | Pulsteilung: 60 s Dauerfeuer | Schaden/s und Munition je Minute wie im 2D-Weg ±2 % |
| T-17 | KI-3D 120 s, Sektoren 1, 3, 6, 8 | kein Gegner außerhalb des Höhenbands, keiner im Asteroiden (Eindringtiefe > 5 m: 0 Fälle), Regie hält „≤ 2 hinten, ≤ 1 oben/unten“ in ≥ 98 % der Schritte |
| T-18 | Zylinder-Zonen | Andocken und Springen bei `|dy| ≤ 400 m` möglich, darüber nicht |
| T-19 | Höhenband: Warnung, Schaden, Rückkehr | Meldung und Schaden wie am seitlichen Rand |
| T-20 | Landung bei `g = 9,81` auf flachem Boden, je Klasse aus 3 m/s Sinkrate | kein Durchdringen, Rückprall < 0,5 m, `landed` nach < 3 s |
| T-21 | Schwebeflug gekoppelt bei `g = 3,7` | Höhe hält ±0,5 m; bei `aUp < g` Meldung „Schub unter Schwerkraft“ |
| T-22 | Rahmenverschiebung um 10 km | Ergebnis relativ zum Rahmen gleich (< 1e-6 m) |
| T-23 | `parseState`: altes Paket (9 Felder) und neues Paket (13 Felder) | beide gültig, altes ergibt `y = 0` |
| T-24 | Koop-Zeile mit und ohne `y` | beide gültig |

### 17.2 Balance (`tools/balance/flug3d.mjs`, Node)

Bot mit menschlicher Zielstreuung (Gauß, 0,8° Standardabweichung, 180 ms Reaktionszeit) fliegt je Sektor 10 min. Die Kampfdauer je Gegner soll höchstens 15 % von der 2D-Bezugsmessung (`npm run balance`) abweichen, Tode je Stunde höchstens 20 %. Bei Abweichung werden Trefferkugel-Faktor und Pulsteilung justiert, nicht `data.js`.

### 17.3 Browser headless (`tools/playtest/flug3d.mjs`)

Pointer Lock gibt es headless nicht zuverlässig. Die Prüfung ersetzt deshalb `requestPointerLock` per `addInitScript` durch eine Attrappe und sendet `pointermove` mit `movementX/Y`. Dieselbe Technik nutzt `controller.mjs` schon für die Gamepad-Attrappe.

| Nr. | Prüfung | Grenze |
|---|---|---|
| B-01 | Start mit `?flug=3d`: Flug startet, 0 Konsolenfehler | – |
| B-02 | Mausbewegung 200 px → Fadenkreuz-Knoten bewegt sich im selben Bild | Abstand zum Sollpunkt < 2 px |
| B-03 | Bugmarke erreicht das Fadenkreuz | innerhalb der Zeit aus T-07 + 2 Bilder |
| B-04 | W, A, D, Leertaste, Strg, Q, E, Shift, X, C, Alt+C, B, N, Mausrad | jede Taste ändert den erwarteten Wert in `window.__ls.world.player.fl` |
| B-05 | Feuern auf einen ruhenden Testgegner mit Vorhaltemarke (Prüfpilot zielt per Simulation) | Trefferquote ≥ 90 % |
| B-06 | Esc im Flug | Fang gelöst und Bordmenü offen nach einem Druck |
| B-07 | Alt halten | Zeiger frei, HUD-Fenster per Ziehen verschiebbar |
| B-08 | V dreimal: Verfolger → Cockpit → Taktik → Verfolger | Taktik: `flight3d = false`, `y → 0` in ≤ 3 s, Klick auf die Karte fliegt hin; zurück: Lage aus `rot` |
| B-09 | HUD-Fenster FLUG | Tempo, Boost, Modus, Höhe vorhanden und zählen live |
| B-10 | Bildzeit 60 s Kampf, HOCH, 1440 × 900 | Median und p95 nicht schlechter als die 2D-Bezugsmessung + 0,6 ms CPU |
| B-11 | Speicher: Heap-Wachstum über 60 s Flug | < 2 MB (keine Neuanlage je Bild) |
| B-12 | Bestehende Prüfungen: `spielen.mjs`, `tief.mjs` (Taktik) | unverändert grün |

### 17.4 Controller (`tools/playtest/controller.mjs` erweitert)

Die 73 bestehenden Prüfungen laufen im Taktikmodus unverändert. Neu kommen etwa 25 dazu: rechter Stick zielt, linker Stick Schub und Rollen, LB-Düsenmodus, RT feuert, LT schaltet auf, A Boost, B halten Raumbremse, L3 Tempomat und Modus, ▴/▾ halten. **Zielhilfe messbar:** Bei konstantem Stickausschlag ist die Zielgeschwindigkeit im Hilfskreis 45 % ±5 % der Geschwindigkeit außerhalb (Stufe normal), in PvP 70 % ±5 % und ohne Mitführen.

### 17.5 Mehrspieler (`tools/mehrspieler/test.mjs` erweitert)

Zwei headless Seiten im selben Sektor: A im 3D-Modus, B im Taktikmodus. Danach ein dritter Fall mit einer Seite auf dem alten Paketformat (Attrappe). Geprüft: `y`, Nicken und Rollen kommen an und werden interpoliert (Fehler < 5 m bei 9 Hz), B sieht A auf der Ebene, der alte Client läuft ohne Fehler. Koop: Gegnerhöhe beim Gast stimmt (< 10 m). Die Prüfung nutzt wie heute den öffentlichen Realtime-Schlüssel, es wird nichts an Supabase verändert.

### 17.6 Bilder (`tools/bilder/kampf.mjs`, `cockpit.mjs`)

Neue feste Ansichten: steil nach oben (Himmel), steil nach unten (Ebene, Station von oben), 60° gerollt im Cockpit, Kampf mit Gegnern über und unter dem Spieler. Prüfung bricht ab bei Nähten oder Löchern im Himmel (Bildvergleich gegen eine Referenz, Abweichung über Schwellwert) und bei zu dunklem Cockpit (heutige Regel).

### 17.7 Touch

Mobile Emulation (375 × 812, Touch): Standard ist Taktik, Joystick und Knöpfe wie heute, 0 Fehler. Tablet-Emulation mit 3D-Option: Zielstick, Schubhebel, Feuer.

---

## 18. Risiken und offene Entscheidungen

### 18.1 Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| Taktikmodus verändert sich unbemerkt | DarkOrbit-Teil kaputt | getrennter Code-Weg, Goldwert-Test T-01, Höhen nur aus abgeleitetem Zufall, nie aus `w.rng` |
| Manuelles Zielen verlängert die Kämpfe stark | Fortschritt zu langsam, Frust | Trefferkugel ×1,25, Kardan je Klasse, Pulsteilung, Balance-Bot 17.2 mit 15-%-Grenze |
| Orientierungsverlust in 3D, Übelkeit | Spieler steigen aus | Horizonthalter und Kurvenrollen standardmäßig an, Horizont mitrollen einstellbar, Kamerawackeln aus, Flugbahnmarker, Höhenmarken auf der Minikarte, Ebene 0 als Bezug im HUD |
| Inhalte bleiben „auf einem Tisch“ | 3D wirkt künstlich | Höhenband ±1,5 km, dicke Asteroidenfelder, Gegner nutzen Höhe aktiv, Himmel rundum, Sturzangriffe |
| Pointer Lock: Esc, Safari, WKWebView | Steuerung hakt, Menü schwer erreichbar | Esc über `pointerlockchange`, Alt gibt den Zeiger frei, Ersatzmodus virtueller Stick, Prüfung B-06 und B-07 |
| Tastenbelegung kollidiert mit Gewohnheit (Strg, Leertaste, E, B) | Umsteiger verwirrt | nur im 3D-Modus geändert, E und J als Kontext-Rückfall, Coach-Schritte, Belegung umstellbar (`bindings.js`) |
| Viele Renderer-Stellen setzen `y` fest (48 × `v.rz`, Auswahl bei `y = 2`, flache Warnflächen) | Grafikfehler | F0 stellt alle Stellen auf `toRender()` und `v.ry` um, bevor sich etwas bewegt; Bildprüfung 17.6 |
| Stationskollision mit Kugeln ungenau | Schiff steckt in Teilen oder prallt an Luft ab | Kollisionshülle aus 6–12 Kugeln und Kapseln je Station, Prüfung mit `kran.mjs`-ähnlichem Strahltest |
| Gemischte Mehrspieler-Versionen | Darstellungsfehler | Felder nur anhängen, Prüfung T-23, T-24 und 17.5 |
| Zielhilfe im PvP unfair | Streit | PvP-Grenze „schwach“ ohne Mitführen, Stufe im Zustand sichtbar |
| Die SYSTEM-Reihe (69 Quests) nennt feste Tasten | falsche Hinweise | Tastennamen aus `bindings.js`, Textprüfung `floskeln.mjs` plus Suche nach festen Tastennamen |
| Leistung auf schwachen Laptops | Ruckler | Budget 14, Flugschicht ist billig, Grafik regelt die adaptive Auflösung wie heute |
| Größerer Umfang als geschätzt | Verzögerung | nach F1 Spieltest mit Toni; F6 kann nach hinten rücken, ohne F1–F5 zu blockieren |

### 18.2 Entscheidungen für Toni

1. **Architekturplan 2.1 ändern** (Shooter bekommt 6DOF-Flug, `flight.js` wird später der Schiffsteil im Universum)? Empfehlung: ja.
2. **3D-Tastenbelegung:** Strg/Leertaste = runter/hoch, Q/E = rollen, F = Kontext, B = KAMPF/REISE, Fernhandel auf L? Empfehlung: ja, nah an der Referenz und damit an deiner Gewohnheit.
3. **Schubverhalten Standard:** „Halten + Tempomat“ (wie die Referenz) oder „Schubhebel“ (wie heute der Dauerschub)? Empfehlung: Halten + Tempomat.
4. **Kurvenrollen und Horizonthalter standardmäßig an?** Empfehlung: an (für Neue), in den Einstellungen abschaltbar (für Puristen).
5. **Bolzen mit Pulsteilung** statt Würfel im 3D-Modus? Empfehlung: ja, Taktik behält den Würfel.
6. **Gegnerfeuer** vorerst weiter ausgewürfelt (mit 3D-Querbewegung), echte Gegnerbolzen später? Empfehlung: ja.
7. **Handy-Standard bleibt Taktik?** Empfehlung: ja, 3D auf dem Tablet als Option.
8. **Landeplattform an den Heimatstationen** als frühe Erprobung des Landemodus (13.2)? Empfehlung: ja, klein halten.
