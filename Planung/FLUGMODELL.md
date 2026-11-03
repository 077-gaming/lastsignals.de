# LAST SIGNALS · Flugmodell (endgültige Fassung)

Stand 03.11.2026, Zweig `claude/flug` (Arbeitsbaum `wt-flug`). Grundlage: Sieger-Entwurf `FLUG-ENTWURF-gefuehl.md`, ergänzt um die Ideen der Gutachter aus `FLUG-ENTWURF-schicht.md` und `FLUG-ENTWURF-voll3d.md` und um die Bedenken aus der Begutachtung. Diese Datei ist verbindlich für den Umbau; die drei Entwürfe bleiben als Herleitung im Ordner.

Auftrag (Toni): „Bisher macht das Spiel mit der Steuerung keinen Spaß – nur im DarkOrbit-typischen Modus, der soll aber am Ende nur Nebensache sein.“ Verfolger und Cockpit werden der **Hauptmodus mit echtem 3D-Flug**. Die taktische Draufsicht (Klickflug in der Ebene) bleibt als **Nebenmodus** und darf nicht kaputtgehen. Vorbild für Systeme und Qualitätsanspruch ist ein aktueller großer Weltraum-Flugsimulator; übernommen werden **Prinzipien, kein Nachbau**: keine fremden Namen, Bezeichnungen, Assets oder Logos.

**Freigabe:** Der Umbau kehrt `ARCHITEKTUR-SANDBOX.md` 2.1 („Shooter dauerhaft 2D“) um. Auf dem Zweig `claude/flug` ist der 3D-Flug Standard; vor einem Merge nach `main` braucht es Tonis ausdrückliche Freigabe (Abnahme im Fluglabor, siehe 14). Bis dahin ist der Zweig selbst der Schalter.

---

## 0. Kurzfassung der Entscheidungen

| Frage | Entscheidung | Herkunft |
|---|---|---|
| Wo lebt das Flugmodell? | Eigener, dimensionsreiner Kern `Code/src/flight/` (reine Funktionen, double, ohne three.js und DOM, läuft in Browser, Node und später auf dem Spielserver) | gefuehl |
| Spieler-Integrator | 6 Freiheitsgrade, Lage als Quaternion, 120-Hz-Teilschritte (2 je Sim-Schritt), semi-implizites Euler | gefuehl |
| Flugrechner | **GEKOPPELT / ENTKOPPELT** (Alt+C), Schub in alle sechs Richtungen, Raumbremse, Tempodeckel weich auch entkoppelt | gefuehl, voll3d (Alt+C) |
| Nasenregler | Raten-Regler mit Bremsgrenze `ω ≤ 0,92·√(2·α·θ)` (kein Überschwingen bei großen Ausschlägen), koordiniertes Kurvenrollen bis 50°, Horizont-Hilfe | schicht |
| Betriebsarten | **KAMPF / REISE / LANDUNG**, Boost mit Vorrat, **BEGRENZER** (Mausrad) | gefuehl |
| Kampftempo | kommt aus `world._speed` (Schiff + Tempo-Generatoren), nie aus einer eigenen Tabelle: gekaufte Generatoren behalten ihren Wert | schicht, Bedenken |
| Maus | Fadenkreuz sofort (Zeigerfang), Schiff folgt mit Trägheit; Lenkkegel als Regler (Standard 30°, 15–70°) | gefuehl, alle |
| Kamera | Sichtfeld 70°, Neigung 6°, Schiff im unteren Drittel, Rückzug bei Schub/Boost, Seitenversatz; Option „Kamera folgt der Zielrichtung“ | gefuehl, voll3d |
| Waffen | gezielte Bolzen, **ein Bolzentempo 2.400 m/s für alle Laser** (eine Vorhaltemarke), 4 Bolzen je Laser und Sekunde mit ¼ Schaden, Munition je 4 Bolzen; Bolzen erben die Schützengeschwindigkeit **nicht** (Sim-Treffer, Vorhaltemarke und Gegnervorhalt nutzen dieselbe Regel) | schicht, gefuehl |
| Kardan | Kegel je Klasse S1 6° bis S8 28° (Geschütztürme, PvE); im PvP gedeckelt auf 5° | schicht + Bedenken |
| Trefferform | Kapsel je Klasse nach Modellmaßen (S8 189 m lang) statt einheitlich 20 m; Gegner Kugel × 1,25 | voll3d, schicht |
| Gegnerfeuer | Etappe 1 gewürfelt mit 3D-Querbewegung, sichtbare Bolzen fliegen zum gewürfelten Punkt; **Etappe 2 echte Gegnerbolzen** hinter Schalter (`ls.flight.enemyBolts`, `?gbolzen=1`) | voll3d |
| Controller | Rechter Stick bewegt die Zielrichtung im Kegel (wie die Maus), Schiff folgt; Alternative „Drehraten“; Rollen auf LB/RB; Boost L3; Schnellleiste ohne Kombination | Bedenken, voll3d |
| Zielhilfe | nur mit Stickeingabe, ≤ 40 % Klassen-Drehrate, Stufe in den Netz-Flags, PvP höchstens NIEDRIG | gefuehl |
| Touch | Telefon startet weiter taktisch; „Flug vereinfacht“ mit Autofeuer (AUTO_K 0,8); MacBook-Trackpad: virtueller Stick empfohlen | voll3d, gefuehl |
| KI | 3D-Bahnen, Anflug mit Abdrehen, Scheren, Durchflug und Wende (≤ 2), Hinterhalt aus dem toten Winkel; Regie-Grenzen ≤ 2 hinten, ≤ 1 senkrecht über/unter dem Spieler; Höhenband je Ziel | gefuehl, voll3d, schicht |
| Zufall | Höhen und Bahnebenen **nie** aus `world.rng`, sondern aus abgeleitetem `Rng(hashString(sektor + ':y'))` bzw. je Gegner-Id | schicht (Pflicht) |
| Taktikmodus | alter Weg `_movePlayer` unverändert, **bitgleicher Goldtest** (Spur aufgezeichnet vor dem Umbau) | schicht, gefuehl |
| Netz | Felder **hinten angehängt** (alte Clients lesen weiter Stelle 0–8), Lage als Smallest-three-Quaternion plus Geschwindigkeit, Hermite-Interpolation, Version `fm` in den Presence-Daten, Sendetakt bleibt **9 Hz** | voll3d, gefuehl |
| PvP | „Schütze entscheidet, Opfer prüft“: Verlauf der letzten 500 ms und Kegelprüfung (Bug des Schützen gegen Linie zum Opfer ≤ Waffenkegel + 15°), PvP nur zwischen gleichem `fm` | voll3d, gefuehl |
| Koop | Gegnerzeilen nur im 2,5-km-Umkreis des Gasts (Sichtbarkeitsfilter), Höhe und Lage angehängt | gefuehl |
| Landung | Umgebung `env` (Schwerkraft, Luft, Boden), Landemodus mit Fahrwerk, einrastendes `landed`-Modell, Rahmenwechsel, Ursprungsversatz, `toRender()`-Naht | alle, schicht |
| Einstellungen | eigener Schlüssel `localStorage['ls.flight']` (der Hub schreibt `ls.settings` neu); kein neues Feld im Spielstand | voll3d, Bedenken |

---

## 1. Recherche-Vorbehalt

Keiner der Entwürfe konnte den aktuellen Stand des Vorbilds (Version 4.x) belegen, etwa ob es nach der Einführung von Betriebsarten weiterhin zwei Flugmodi gibt oder ob Gamepads im Flug eine Zielhilfe bekommen. Die Systeme hier sind plausibel und im Genre üblich. Sie sind **Prinzipien, kein Nachbau**; alle Namen sind eigene (KAMPF, REISE, LANDUNG, GEKOPPELT, ENTKOPPELT, BOOST, BEGRENZER, ZIELHILFE, FLUGLABOR).

---

## 2. Ausgangsmessung F0 (vor der ersten Codeänderung, 03.11.2026)

| Messung | Wert |
|---|---|
| `npm test` | alle Prüfungen bestanden (≈ 1,1 s) |
| Taktik-Goldspur (`src/sim/goldtest.mjs`) | 3 Szenarien (Heimat mit Sprung, Saturn 3 mit S3, Eris 6 mit S5), Prüfsummen in `src/sim/gold-taktik.json` |
| Balance 12 h (`tools/balance/fortschritt.mjs`, Samen 1, Saturn) | Stufe 12 nach 10,4 h, 2.255 Abschüsse, 22 Tode, Schiff 2, 9 Drohnen, Stufe 10 nach 7 h |
| `tools/playtest/controller.mjs` (headless) | 73/73 Prüfungen, 0 Konsolenfehler |
| `tools/playtest/tief.mjs 25 saturn` (headless, alter Bot) | Sektoren 4–7 ohne Tode, 60 Bilder/s, schlechtestes Bild 17 ms |
| `tools/playtest/spielen.mjs --minuten 1` (headless, Saturn) | 59,7 Bilder/s, GPU 6,7 ms (p95 9,5), Schüsse 47 mit 70 % Treffern (Würfel), 4 Raider, Zeit bis Abschuss Median 3,8 s |
| Bildzeit `ansichten.mjs` (headless, HOCH, 960 × 600) | Flug Saturn 226 Aufrufe / 423 k Dreiecke / GPU 4,5 ms; Kampf Saturn 102 / 236 k / 4,0 ms; Cockpit Eris 102 / 150 k / 3,9 ms; Heap 99–116 MB |

Headless-Werte (SwiftShader/ANGLE) taugen nur zum Vergleich. Die Abnahme mit 120 Hz macht Toni am echten M5.

---

## 3. Die ersten 60 Sekunden und die Kennzahlen

Ablauf wie `FLUG-ENTWURF-gefuehl.md` 4.1 (Abdocken, Maus nach rechts oben, Schub, Boost, Raider-Rudel, Seitenschub, Feuern, Gegner zieht hoch und kurvt hinter den Spieler, Abschuss, Traktor holt die Beute). Daraus folgen feste Kennzahlen, die der Selbsttest **aus der Wertetabelle berechnet** (nicht von Hand einträgt) und mit ±10 % prüft:

| Kennzahl | Formel im Test | Grenze |
|---|---|---|
| Fadenkreuz-Latenz | Fadenkreuz wird im selben Bild wie das Mausereignis gezeichnet (HUD liest die Zielrichtung der Eingabe, nicht der Simulation) | ≤ 1 Bild |
| 63-%-Zeit auf 20° Zielfehler | aus Drehrate, Drehbeschleunigung und Regler: Simulation mit Mausziel 20° neben dem Bug | ≤ Tabellenwert (S1 0,22 s, S4 0,42 s, S8 0,8 s) |
| 180°-Wende im Stand | `T = θ/ω + ω/α` (Hochlauf und Bremsen) | ±10 % |
| 0 → Kampftempo (95 %) | aus Beschleunigung und Regler | ±10 % |
| Bremsweg gekoppelt | `v² / (2 · a_rück · 1)` ohne Raumbremse | ±10 % |
| Boost-Dauer / Nachladen | Tabelle | ±5 % |
| Erster Raider-Abschuss mit Startausrüstung (Bot mit Menschenmodell, Heimatsektor) | `tools/playtest/flug.mjs` | Median ≤ 8 s (Bedenken: 6–14 s ist für die ersten Minuten zu zäh) |
| Treffermarke nach Sim-Treffer | Ereignis `damage` → HUD im nächsten Bild | ≤ 1 Bild |

---

## 4. Flugkern `Code/src/flight/`

```
flight/
  math3.js    Vektoren und Quaternionen auf Float64Array (ohne three.js)
  params.js   Klassenwerte S1–S8, Trefferkapseln, Gegner-Wendigkeit, Modus-Faktoren, Kardan, Lenkkegel
  core.js     Zustand, step(st, ctl, P, env, h), enter/leave, setFrame, Ursprungsversatz, toRender()
  aim.js      Vorhalt, Konvergenz, Kardan, Zielhilfe, Strecke gegen Kugel/Kapsel relativ zur Zielbewegung
  landing.js  Fahrwerk, Höhe über Grund, Aufsetzen, Schwebehilfe, Autoland
  net.js      Smallest-three, Packen/Entpacken der angehängten Felder, Hermite-Interpolation
```

### 4.1 Achsen

Welt: +x rechts, +y oben, −z „Norden“ (wie `combat.js headingOf`: `rot = 0` heißt Bug nach −z). Schiffskörper: vorn = −z, oben = +y, rechts = +x. Die Quaternion dreht Körper → Welt. Drehraten im Körper: x = Nicken (+ Nase hoch), y = Gieren (+ Nase links), z = Rollen (+ linke Tragfläche runter, wie das heutige `bank` > 0). Für alten Code werden `x, z, vx, vz, rot, speed, thrust, bank, pitch, turnRate` nach jedem Schritt **abgeleitet**: Minikarte, Quests, Funk, Ereignisse lesen weiter `x/z/rot`.

### 4.2 Zustand und Steuerrahmen

Zustand je Spielerschiff: Ort `p`, Geschwindigkeit `v`, Lage `q`, Drehrate `w` (Körper), Boost-Vorrat und -Sperre, Betriebsart und Umschaltzeit, Kopplung, Begrenzer, Tempomat, Fahrwerk 0..1, Landemodus, `landed`, Düsenauslastung `thr[6]`, Drehdüsen `rcs[3]`, Rahmen `frame`.

Eingabe ist ein **fester Steuerrahmen** (`Float32Array(16)`, Gerät → Rahmen → Simulation; dieselbe Schnittstelle für Maus, Controller, Touch, Bot, Selbsttest und später Server):

| Index | Feld | Bereich |
|---|---|---|
| 0–2 | Schub seitlich / senkrecht / längs | −1..1 |
| 3–5 | Drehraten Nicken / Gieren / Rollen (Drehraten-Modus) | −1..1 |
| 6 | Mausziel an (Drehung folgt der Zielrichtung) | 0/1 |
| 7–9 | Zielrichtung (Welt, Einheitsvektor) | |
| 10 | Knöpfe: 1 Boost, 2 Raumbremse, 4 Feuer, 8 Präzision | Bitmaske |
| 11 | Flanken: 1 Kopplung, 2 Betriebsart, 4 Landemodus, 8 Tempomat | Bitmaske |
| 12 | Begrenzer-Schritte | −n..n |
| 13 | Rollen manuell aktiv (sperrt Kurvenrollen/Horizont) | 0/1 |
| 14 | Zielhilfe-Stufe | 0–3 |
| 15 | frei | |

### 4.3 Schritt (h = 1/120 s, zwei Teilschritte je Sim-Schritt)

1. Betriebsart, Boost-Vorrat (Sperre bis 25 % nach Leerlauf, Nachladen nach 1 s Pause).
2. Soll-Drehrate: Mausziel → Fehlerwinkel θ und Achse im Körper, `ω_soll = min(ω_max·kB, Kp·θ, 0,92·√(2·α·θ))` (Bremsgrenze, schicht). Drehraten-Modus → `r · ω_max`. Rollen: manuell, sonst **Kurvenrollen** (Rollwinkel bis 50° in die Kurve, koordiniert aus dem Gierfehler) über der **Horizont-Hilfe** (zurück zur Sektorebene, höchstens 0,6 rad/s, nur bei |Nicken| < 60°).
3. Drehbeschleunigung je Achse begrenzt (`α_max`), Lage exakt fortgeschrieben (`q ← q ⊗ exp(½·w·h)`, normiert).
4. Linear im Körper: gekoppelt Soll-Geschwindigkeit je Achse (nicht gedrückte Achsen Soll 0 = Driften läuft aus), entkoppelt direkter Schub (Newton), Raumbremse Soll 0 mit Grenzen × 1,3, Boost × 1,5 Schub.
5. Äußere Kräfte aus `env` (Schwerkraft, Luft); gekoppelt gleicht der Rechner die Schwerkraft innerhalb der Vertikalreserve aus (Schweben ohne Sonderfall).
6. Weicher Tempodeckel (auch entkoppelt): Überschuss über Modus- bzw. Boostgrenze baut mit `1 − e^(−3h)` ab; Stöße bleiben sichtbar.
7. `v += a·h`, `p += v·h`.
8. Landelogik (nur im Landemodus, siehe 12).

Kollisionen (Brocken, Station, Gegner) und Kartengrenzen rechnet die Welt nach dem Kern, wie heute „sanft abstoßen“, jetzt mit Höhe.

### 4.4 Werte je Klasse

Das **Kampftempo `vK` ist `world._speed`** (Schiff + Tempo-Generatoren). REISE = 2,8 × vK, Boost = 1,7 × vK. Alle übrigen Werte stehen in `flight/params.js`:

| Klasse | Schub vor | rück | seitlich | vertikal (m/s²) | Nicken/Gieren °/s | Rollen °/s | Drehbeschl. °/s² | Kp 1/s | Boost s / Nachladen s | Kardan ° | Kapsel L × r (m) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| S1 | 150 | 110 | 100 | 100 | 95 | 210 | 520 | 5,5 | 6 / 9 | 6 | 42 × 11 |
| S2 | 145 | 105 | 95 | 95 | 88 | 190 | 460 | 5,2 | 6,5 / 10 | 8 | 53 × 12 |
| S3 | 125 | 92 | 82 | 82 | 74 | 160 | 380 | 4,4 | 6,5 / 10 | 10 | 58 × 14 |
| S4 | 110 | 82 | 72 | 72 | 62 | 130 | 300 | 3,7 | 7 / 11 | 12 | 62 × 16 |
| S5 | 90 | 68 | 58 | 58 | 50 | 100 | 220 | 3,0 | 7,5 / 12 | 15 | 88 × 15 |
| S6 | 78 | 60 | 50 | 50 | 42 | 80 | 170 | 2,6 | 8 / 13 | 18 | 84 × 18 |
| S7 | 66 | 52 | 42 | 42 | 35 | 65 | 130 | 2,2 | 8,5 / 14 | 22 | 99 × 19 |
| S8 | 57 | 44 | 35 | 35 | 28 | 50 | 100 | 1,8 | 9 / 15 | 28 | 189 × 15 |

Gemeinsam: Boost-Schub × 1,5, Boost-Drehung × 1,2, Raumbremse × 1,3, REISE-Drehraten × 0,6, LANDUNG-Drehraten × 0,5 (60 m/s waagrecht, 20 m/s senkrecht). Moduswechsel KAMPF→REISE 1,5 s (im Kampf gesperrt; Treffer bricht ab), REISE→KAMPF 0,8 s. REISE sperrt Waffen und pausiert die Schildaufladung.

**Kardan:** Kleine Schiffe zielen fast nur über die Nase, große Schiffe haben Geschütztürme, deren Laser bis 28° neben der Nase auf das Fadenkreuz schwenken. Der Spieler zielt trotzdem selbst (der Kardan trifft das Fadenkreuz, nicht das Ziel). Im PvP gilt höchstens 5° (Fairness, Bedenken).

---

## 5. Eingabe

### 5.1 Belegung als Datentabelle

`Code/src/input/bindings.js` ist die einzige Quelle der Belegung (`e.code`, physische Tastenlage). Beschriftung über `navigator.keyboard.getLayoutMap()` (Chrome, Edge, Electron), sonst feste QWERTZ-Tabelle (auf QWERTZ heißt `KeyZ` „Y“). Flug-Coach, SYSTEM-Quests, Einführungskarte, Bordmenü-Übersicht und `pad-map.js` holen ihre Tastennamen daraus (`keyName('roll_r')`), nicht aus festem Text.

### 5.2 Maus und Tastatur (Verfolger und Cockpit)

| Eingabe | Wirkung | Taktik (unverändert) |
|---|---|---|
| Maus | Zielen: Fadenkreuz sofort, Schiff folgt | Zeiger |
| Linke Maustaste halten | Laser feuern | hinfliegen / Ziel wählen |
| Rechte Maustaste halten / loslassen | Raketen-Aufschaltung (Ziel im 12°-Kegel, 0,8 s) / Start | – |
| Mittlere Maustaste halten | Umsehen | – |
| Mausrad | Begrenzer ± 10 m/s | Zoom |
| Alt + Mausrad | Kameraabstand | – |
| W / S | Schub vor / zurück (halten) | bildbezogen |
| A / D | seitlich schieben | bildbezogen |
| Leertaste / Strg links | hoch / runter schieben | Rakete / Angriff |
| Q / E | rollen links / rechts | – / Andocken |
| Umschalt links (halten) | Boost | – |
| X (halten) | Raumbremse | – |
| C | Tempomat (hält das aktuelle Vorwärtstempo) | – |
| Alt + C | gekoppelt / entkoppelt | – |
| B halten 0,3 s | KAMPF / REISE (B kurz bleibt Fernhandel) | Fernhandel |
| N | Landemodus (Fahrwerk) | – |
| F | Kontext: andocken, springen, Beute anfliegen; **E/J** bleiben Rückfall für Umsteiger, wenn der Kontext eindeutig ist und E kurz getippt wurde | E / J |
| T | Ziel unter dem Fadenkreuz | – |
| Tab / Umschalt+Tab | nächstes / voriges Ziel | Tab |
| R | Rakete | R |
| Strg rechts | Feuerleitrechner (Autofeuer, Barrierefreiheit) | Angriff |
| H | Autopilot zur Station (fliegt in 3D) | H |
| 1–0, Alt+1–5, Umschalt+Zahl, J, M, P, V, Esc | wie heute | wie heute |
| Alt halten | Zeiger frei für die HUD-Fenster (Kurs bleibt) | – |

**Zeigerfang:** `requestPointerLock({ unadjustedMovement: true })` mit Merkmalserkennung und abgefangenem Promise-Fehler (Safari kennt die Option nicht). Angefordert nur bei einer Nutzergeste (Klick auf die Spielfläche, V, Taste im Flug). Chrome lehnt eine neue Anforderung kurz nach Esc ab: dann erscheint mittig **KLICKEN ZUM STEUERN**; bis zum Klick zielt die Maus als **virtueller Stick** mit sichtbarem Zeiger (der erste Flug ist nie kaputt). Esc löst den Fang (Browserregel) und öffnet mit **einem** Druck das Bordmenü; „Weiter“ fängt neu. Auf Touch-Geräten und in WKWebView wird nie angefordert.

**Mac (Priorität 1):** Strg+Klick ergibt unter macOS einen Rechtsklick bzw. `contextmenu` (Firefox meldet sogar Taste 2). Im Flug wird `contextmenu` unterdrückt und ein Rechtsklick mit gehaltenem Strg als Linksklick (Feuer) gewertet, solange Strg als „runter“ gedrückt ist. **Trackpad:** Voreinstellung „virtueller Stick“ wird angeboten, Hinweis im ersten Flug.

**Windows (Priorität 2):** Strg+W/T/N lassen sich im Browser nicht abfangen. Schutz: Rückfrage „Seite verlassen?“ im Flug (gibt es), im Vollbild `navigator.keyboard.lock()` (Chromium), in der Desktop-App kein Menü-Kürzel auf Strg+W.

**Mausmodi (Einstellung `ls.flight.mouse`):** „Mausziel“ (Standard) oder „Virtueller Stick“ (Zeigerausschlag = Drehrate, für Trackpad und Umsteiger). **Lenkkegel** 30° (Regler 15–70°), Empfindlichkeit 0,07°/px, Y umkehrbar.

### 5.3 Controller (Xbox · PlayStation), Hauptmodus

Gleiches Prinzip wie die Maus: Der **rechte Stick bewegt die Zielrichtung im Lenkkegel** (Drehrate der Zielrichtung mit Kurve 1,6, bis 160°/s), das Schiff folgt mit Trägheit. Alternative „Drehraten“ (Stick = Schiffsdrehrate, Fadenkreuz = Nase) im Fluglabor abnehmbar. Daumenkonflikt gelöst: Boost auf L3 (Klick wie Sprinten), nichts Ständiges unter dem rechten Daumen.

| Controller | Hauptmodus | Taktik (unverändert) |
|---|---|---|
| Linker Stick | Schub vor/zurück, seitlich | bildbezogen |
| LB / RB | **rollen** links / rechts | voriges / nächstes Ziel |
| LB + RB zusammen | Schwebemodus: linker Stick ↕ = hoch/runter | – |
| L3 kurz / halten 0,6 s | Boost an (bis Schub endet, Vorrat leer oder L3) / Landemodus | Dauerschub |
| Rechter Stick | Zielen | Zoom |
| R3 kurz / halten | Kamera wechseln / umsehen | Kamera |
| RT | Laser feuern | Schub |
| LT | Präzisionszielen: Sichtfeld −8°, Empfindlichkeit × 0,6, Waffenkegel 4°; auf einem Ziel gehalten schaltet die Rakete auf | bremsen |
| A | Ziel unter dem Fadenkreuz, sonst nächstes | Angriff |
| B kurz / halten | Abbrechen (Ziel lösen, Autopilot aus) / Raumbremse | Abbrechen |
| X kurz / halten 0,6 s | Rakete / gekoppelt ↔ entkoppelt | Rakete |
| Y kurz / halten | Kontext / Autopilot zur Station | gleich |
| Steuerkreuz ◂ ▸ | Schnellleiste: Platz wählen | gleich |
| Steuerkreuz ▴ | gewählten Platz auslösen (ohne Kombination) | Leiste wechseln |
| Steuerkreuz ▾ | nächste Leiste | Leiste wechseln |
| MENU kurz / halten 0,6 s | Bordmenü / KAMPF ↔ REISE | Bordmenü |
| VIEW | Karte | Karte |

**Zielhilfe** (Einstellung AUS / NIEDRIG / STANDARD / HOCH, Controller-Standard STANDARD): Zielbremse (Stickrate auf 55 % nahe der Vorhaltemarke), Zielmitnahme (k = 0,35 der Winkelgeschwindigkeit der Vorhaltemarke, **nur solange der Stick ausgelenkt ist**, höchstens 40 % der Klassen-Drehrate), Waffenkegel (Maus 1,5°, Controller 2,5°, LT 4°, Touch 7°). Gegen Spieler höchstens NIEDRIG, Mitnahme aus. Die Stufe steht in den Netz-Flags.

### 5.4 Touch (abgestuft)

- **Telefon:** startet weiter taktisch (wie heute). Hauptmodus wählbar als **Flug vereinfacht**: Joystick = Zielen (wie rechter Stick, Zielhilfe HOCH), Schub-Schieber, Feuerknopf, Boost, Rakete, Kontext; Horizont-Hilfe und Kurvenrollen immer an. **Autofeuer** (Feuerleitrechner, Treffer per Würfel × 0,8) ist auf Touch Standard.
- **Tablet:** wie Telefon, dazu Ziehen in der rechten Bildhälfte = Zielen.
- Joystick, Knöpfe und Pinch-Zoom des Taktikmodus bleiben unverändert.

---

## 6. Kamera

- **Verfolger** (`camrig.js chasePose3d`): Kameralage folgt der Schiffslage gefedert (Gieren/Nicken 9/s bei S1 bis 5/s bei S8, Rollen zu 70 %), Blickrichtung **35 % Zielrichtung** (Option „Kamera folgt der Zielrichtung“: 100 %, Schiff dreht sichtbar hinterher). Neigung **6°**, Schiff im unteren Drittel, Sichtfeld **70°** (55–90°), Rückzug bis +8 % bei Schub, +10 % bei Boost, −5 % beim Bremsen, Seitenversatz bis 4 % gegen Seitenschub. Abstand aus `CHASE_FRAME`. Kampfschwenk zum Ziel entfällt (man zielt selbst), dafür Randpfeil.
- **Cockpit:** Kamera am Pilotenauge mit voller Schiffslage, Kopfträgheit bis 6 cm gegen die Beschleunigung (abschaltbar über „Kamerawackeln“), Umsehen ±110°/−35…+60°.
- **Taktisch:** unverändert. Höhen werden beim Wechsel in die Draufsicht mit dem Kamerablend auf die Ebene gestaucht (Simulation bleibt echt).
- **Übergänge:** Taktisch → Flug: `flight.enter()` aus `rot` (kein Ruck). Flug → Taktisch: **Ebenenfänger** als sichtbares Manöver: Rollen und Nicken auf waagrecht, Höhe mit begrenzter Steigrate (≥ 180 m/s, so schnell wie nötig für höchstens 3 s) auf die Ebene, Klickflug ab dem ersten Bild.
- „Bewegung reduzieren“: Rollen der Kamera 30 %, Stöße × 0,35.

---

## 7. Waffen und Zielen

- **Bolzen:** 2.400 m/s für alle Laser, Lebensdauer Reichweite/Tempo (650 m → 0,27 s), Streuung 0,12°. 4 Bolzen je Laser und Sekunde mit je ¼ Schaden, eine Munitionseinheit je 4 Bolzen (Dauerschaden und Verbrauch wie heute). Kritisch 8 % je Bolzen, SAB/SAL wie heute (SAL als schnelle Salve).
- **Treffer:** je Sim-Schritt Strecke Bolzen alt → neu **relativ zur Zielbewegung** gegen Kugel (Gegner, Radius × 1,25) bzw. Kapsel (Spieler). Bei 2.400 m/s sind das 40 m je Schritt gegen Larven mit r = 12: Streckentest ist Pflicht. Brocken fangen Bolzen ab.
- **Konvergenz:** Ziel unter dem Fadenkreuz → dessen Entfernung, sonst aufgeschaltetes Ziel im Kegel, sonst 500 m; weich in 0,15 s.
- **Vorhaltemarke:** eine Marke (alle Laser gleich schnell): kleinste positive Lösung von `|r + u·t| = s·t` mit `u` = Zielgeschwindigkeit (Bolzen erben nichts).
- **Raketen:** Aufschaltung (rechte Maustaste / LT halten, Ziel im 12°-Kegel 0,8 s), Treffer und Laufzeit wie heute (`ROCKET_FLIGHT`, `rocketHits`), Flugbahn in 3D gezeichnet.
- **Feuerleitrechner (Autofeuer):** Touch-Standard, sonst Strg rechts: feuert auf das Ziel im 30°-Kegel, Treffer gewürfelt × **0,8**. Handzielen lohnt sich so immer.
- **Gegnerfeuer:** Etappe 1 Würfel mit 3D-Querbewegung und 3D-Feuerkegel, Bolzen fliegen sichtbar (Vorbeiflug bei Fehlwurf, Ton unter 40 m). Etappe 2 (Schalter) echte Bolzen mit Vorhalt und Fehler je Rang.
- **Taktikmodus:** unverändert Würfel, Laser-Kegel ±75°.

---

## 8. KI in 3D

- **Bewegung:** `moveEnemy` rechnet eine Soll-Geschwindigkeit mit drei Komponenten; Grenzen wie heute (Beschleunigung, Drehrate), dazu Nicken aus der Flugrichtung und Kurvenlage aus der Querbeschleunigung.
- **Manöver** (`sim/ai3d.js`): Kreisen in eigener geneigter **Bahnebene** (Normale aus dem Zufall je Gegner-Id, nie aus `world.rng`), **Anflug mit Abdrehen** (pack, ambush), **Scheren** wenn der Spieler im Heck sitzt, **Durchflug und Wende** (halber Looping, höchstens 2 gleichzeitig), **Hinterhalt aus dem toten Winkel** (Jackal lauert 250–400 m über/unter dem Spieler, Rammangriff mit sichtbarem Aufladen), Schwarm auf der Kugelschale, Abstand halten mit Höhenwechsel, Flucht aus der Ebene.
- **Regie-Grenzen:** höchstens **2 Angreifer gleichzeitig in der hinteren Halbkugel**, höchstens **1 direkt über oder unter** dem Spieler (unter 25° zur Senkrechten) – Prüfung T-17. Budget 3–4 Angreifer bleibt.
- **Höhenband je Ziel:** Gegner gegen einen Piloten in der Taktikansicht fliegen flach (±40 m um dessen Höhe), gegen einen 3D-Piloten räumlich. Gemeldet über die Ansicht des Piloten (lokal sofort, im Netz über die Flags).
- **Sektor als flacher Raum:** Höhenband ±1.500 m (Heimat ±1.200 m), Warnung und Schaden wie an der seitlichen Grenze. Station, Tore, Frachterrouten auf y = 0. Rudel ±400 m, Einzelgänger ±600 m, Felder mit Höhenstreuung, Kisten ±300 m, Wracks an der Abschusshöhe.
- **Zonen als Zylinder** (sichere Zone, Tor, Andocken, Reparatur am Tor: 2D-Abstand und |Δy| ≤ 400 m). REISE ist im Kampf gesperrt, Treffer bricht das Hochlaufen ab.
- **Beute-Traktor:** ab 150 m zieht ein Strahl Wracks, Kisten und Erz mit 60 m/s heran (außerhalb des Kampfes schneller).

---

## 9. Mehrspieler

- **Zustand** (`mp-core.js packState`): Stellen 0–8 unverändert, angehängt: 9 `y` (dm), 10–12 Quaternion smallest-three (±32767), 13 Index, 14–16 Geschwindigkeit (dm/s), 17 Flugflags (Boost, REISE, entkoppelt, Landung, Fahrwerk, Taktikansicht, Zielhilfe 2 Bit), 18 `fm` = 3. `unpackState` liest alte Pakete (Länge ≥ 8) als y = 0, Lage aus `rot`.
- **Darstellung:** Hermite-Interpolation aus Ort und Geschwindigkeit, Lage per Slerp, Vorhersage bis 250 ms. Sendetakt **9 Hz** (Supabase-Kontingent). Bekannte Grenze: Manövrierende Ziele wirken bei 9 Hz im Handzielen leicht „springend“, bis der eigene Server kommt.
- **Presence:** `fm` in den Metadaten; PvP nur zwischen gleichem `fm`.
- **PvP:** Schütze entscheidet (Bolzentreffer auf das interpolierte Abbild), sendet Trefferpunkt, Schusszeit und eigenen Bug; Opfer prüft: eigener Verlauf der letzten 500 ms innerhalb 2 × Kapsel am gemeldeten Punkt, Kegel (Bug des Schützen gegen Linie zum Opfer ≤ Waffenkegel + 15°), Reichweite × 1,6, Ratenbegrenzung wie heute.
- **Koop:** Gegnerzeilen nur im 2,5-km-Umkreis des Gasts, angehängt y und Gieren/Nicken; Kopfzeilen mit y und Lage.

---

## 10. Taktikmodus als Nebenmodus

- `world.flight3d === false` → heutiger `_movePlayer`, `_updateLasers` (Würfel), Klickflug, alte Tastatur- und Controller-Belegung. 2D-Abstände wie bisher (Δy zählt dort nicht).
- **Goldtest T-01:** `src/sim/goldtest.mjs` rechnet drei feste Szenarien und vergleicht die Prüfsummen bitgenau mit `gold-taktik.json` (aufgezeichnet vor dem Umbau). Höhen kommen aus abgeleitetem Zufall, deshalb bleibt die Zufallsfolge von `world.rng` im Taktikweg unverändert.
- Telefon startet taktisch. V wechselt jederzeit, auch im Kampf.

---

## 11. HUD (Flug, `ui/hud-flight.js`)

Eine Zeichenfläche über der Spielfläche (Gerätepixel, Linien und Text, ohne Schatten), Stil nach `UI_STIL.md` (Haarlinien, Ticks, Versalien, DIN-Schrift, Farbe nur mit Funktion):

Fadenkreuz (Zielrichtung, sofort) · Bugmarke · Waffenkreuz/Kardanmarke · Flugbahnmarker · **eine** Vorhaltemarke · Zielklammer mit Entfernung, Annäherung und Balken · Randpfeil · **Treffermarke** (weiß Hülle, Fraktionsfarbe Schild, groß bei Abschuss) · **roter Bogen der Trefferrichtung** · **rote Bedrohungsbögen** am Rand (Gegner zielt oder lädt auf) · **Raketenwarnung** mit Ton · **Kursband** oben · Geschwindigkeitsleiter mit Begrenzer · Schub- und Höhenanzeige (`EBENE +240`) · Boost-Balken · Moduszeile (`KAMPF · GEKOPPELT · BEGR 330`, `ENTKOPPELT` in Warnfarbe) · Horizontleiter (Cockpit) · Hinweis **KLICKEN ZUM STEUERN** · Minikarte mit Höhenmarken ▴/▾.

**Ton:** Steuerdüsen-Stöße im Stereobild, Vorbeiflug mit Doppler unter 40 m, Treffer- und Abschussmarke, Boost-Schleife, Raketenwarnung; höchstens 24 Stimmen.

---

## 12. Landemodus und Vorbereitung Planetenlandung

- `env = { gravity: [gx, gy, gz], rho, ground(px, py, pz, out), frame }` – heute im All Schwerkraft 0, kein Boden.
- **Landemodus** (N, Controller L3 halten): Fahrwerk 1,5 s, Tempo 60/20 m/s, Drehraten 50 %, Horizont nach `−gravity` (im All nach der Bodennormalen). **Schwebehilfe:** gekoppelt gleicht der Rechner die Schwerkraft aus; reicht der Vertikalschub nicht: `SCHUB REICHT NICHT`.
- **Aufsetzen** als einrastendes Modell (keine steife Feder bei 60 Hz): Fahrwerk unten, Höhe über Grund ≤ Fahrwerkshöhe + 0,3 m, Sinkrate ≤ 3 m/s, Schräglage ≤ 20° → `landed`, Ort rastet ein; härter: Schaden nach Sinkrate, ab 12 m/s Bruch. **Abheben** mit Schub nach oben. **Autoland** (Strg halten im Landemodus): sinkt mit 2 m/s, richtet aus, setzt auf.
- **Rahmen und Ursprung:** Positionen tragen `frame`; `setFrame()` rechnet Ort, Geschwindigkeit und Lage um (hin und zurück < 1e-9 m). Ursprungsversatz: gleicher Flug 1.000 km vom Ursprung entfernt ergibt dieselben Werte auf 1 mm (Selbsttest). Kameranahes Zeichnen kommt mit dem Weltrenderer (Architekturplan 2.6); die Naht `toRender(pos, camOrigin, out)` ist die einzige Stelle, an der Weltkoordinaten in Zeichenkoordinaten übergehen.
- **Kein neues Feld im Spielstand:** Der Flugzustand (Höhe, Lage) wird beim Andocken und Laden nicht gespeichert, sondern aus `rot` abgeleitet (`flight.enter`).

---

## 13. Prüfungen

| Werkzeug | Inhalt |
|---|---|
| `npm test` (`src/sim/selftest.mjs`) | alle bisherigen Prüfungen, dazu Flugkern (Determinismus, Stabilität 100.000 Teilschritte, Kennzahlen je Klasse aus der Tabelle, gekoppelt/entkoppelt, Modi, Horizont-Hilfe, Landung, Rahmenwechsel, Ursprungsversatz), Zielmathematik (Vorhalt < 0,5 m, Konvergenz, Kardan, Zielhilfe ohne Eingabe = 0, ≤ 40 %, PvP ≤ NIEDRIG), Netz (Packen < 0,5 m / 0,5°, Hermite stetig, altes Paket → y = 0), KI 3D (Höhenband, keine Überlappung, Manöver treten auf, Feuer nur im Kegel, T-17), Welt im 3D-Weg (Andocken, Tor, Beute, Quests, Raketen, Drohnen), **Taktik-Goldtest bitgleich** |
| `tools/playtest/flug.mjs` (neu, headless) | Maus- und Controller-Flug geskriptet (Zeigerfang-Attrappe per `addInitScript` mit `movementX/Y`, Controller-Attrappe): Kurven, Rollen, Boost, entkoppelt, Kampf gegen 3D-KI; Kennzahlen Bildrate, Reaktionszeit, Trefferquote, Kampfdauer; Bilder in Verfolger- und Cockpitsicht; Strg+Klick ohne Kontextmenü, Esc öffnet mit einem Druck, Alt gibt den Zeiger frei, Heap-Wachstum < 2 MB über 60 s |
| `tools/playtest/controller.mjs` | Menüs und Taktik wie bisher, Flugteil auf die neue Belegung umgestellt (nicht abgeschwächt) |
| `tools/mehrspieler/test.mjs` | zwei Seiten: fremdes Schiff mit Höhe und Lage, altes Paket flach |
| `tools/playtest/tief.mjs`, `spielen.mjs`, `grafik.mjs` | headless auf freiem Port (`--url`), `tief.mjs` wahlweise `--flug=taktik` |
| `tools/bilder/ansichten.mjs` | neue Ansichten „Kurvenkampf von unten“, „Modelle von unten“, „Himmel steil oben/unten“ (Pole des Rundumbilds) |

---

## 14. Fluglabor und Abnahme durch Toni

`?dev=fluglabor` (Entwicklung) startet im Heimatsektor ohne Gegner, mit Reglerpanel (F4): Lenkkegel, Empfindlichkeit, Kamera-Mischung (35 % / folgt der Zielrichtung), Kp, Drehraten, Drehbeschleunigung, Schub, Boost, Kurvenrollen, Horizont-Hilfe, Kopplung, Controller-Modus (Zielrichtung im Kegel / Drehraten), Zielhilfe. Übungsdrohnen (stehend, geradeaus, kurvend, ausweichend) per Knopf. Werte als Voreinstellung speicherbar (`ls.flight.lab`).

**Drei Gefühlsabnahmen** vor dem Merge: 1) Maus (Zielen, Schub, Kamera), 2) Waffen (Bolzen, Vorhalt, Treffer), 3) Controller. Nach Abnahme 1 und 2 steht eine echte **Abbruch- oder Umsteuer-Entscheidung**; erst dann wird der Zweig zusammengeführt.

---

## 15. Bekannte Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Orientierungsverlust in 3D | Horizont-Hilfe Standard, Höhenband, Regie-Grenzen, Bedrohungsbögen, Kursband, Randpfeile, Höhenmarken |
| Gezieltes Feuer gegen 85-%-Würfel (Balance, Wirtschaft) | gleicher Dauerschaden und Verbrauch, Kardan, Trefferkugel × 1,25, Autofeuer × 0,8, Median-Abschuss ≤ 8 s |
| Gegner-Würfel bei sichtbaren Bolzen wirkt unfair | Querbewegung in 3D zählt, Etappe 2 echte Bolzen hinter Schalter |
| Zeigerfang Safari/WKWebView, Trackpad | Merkmalserkennung, KLICKEN ZUM STEUERN, virtueller Stick, nie auf Touch |
| Strg als „runter“ | Rückfrage beim Verlassen, Tastatursperre im Vollbild, `contextmenu` unterdrückt, Mac-Strg+Klick = Feuer |
| Modelle von unten | Bilderreihe „von unten“ |
| Himmel an den Polen (Rundumbild) | Ansicht „steil oben/unten“ in der Bilderreihe |
| Netz 9 Hz | Hermite, Vorhersage; eigener Server später |
| Taktik bricht | alter Weg unverändert, Goldtest bitgleich |
| Headless-Leistungswerte | nur Vergleich; Abnahme am M5 durch Toni |
