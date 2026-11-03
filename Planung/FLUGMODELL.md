# LAST SIGNALS · Flugmodell (endgültige Fassung)

Stand 03.11.2026 (Runde 2 eingearbeitet), Zweig `claude/flug` (Arbeitsbaum `wt-flug`). Grundlage: Sieger-Entwurf `FLUG-ENTWURF-gefuehl.md`, ergänzt um die Ideen der Gutachter aus `FLUG-ENTWURF-schicht.md` und `FLUG-ENTWURF-voll3d.md` und um die Bedenken aus der Begutachtung. Diese Datei ist verbindlich für den Umbau; die drei Entwürfe bleiben als Herleitung im Ordner.

Auftrag (Toni): „Bisher macht das Spiel mit der Steuerung keinen Spaß – nur im DarkOrbit-typischen Modus, der soll aber am Ende nur Nebensache sein.“ Verfolger und Cockpit werden der **Hauptmodus mit echtem 3D-Flug**. Die taktische Draufsicht (Klickflug in der Ebene) bleibt als **Nebenmodus** und darf nicht kaputtgehen. Vorbild für Systeme und Qualitätsanspruch ist ein aktueller großer Weltraum-Flugsimulator; übernommen werden **Prinzipien, kein Nachbau**: keine fremden Namen, Bezeichnungen, Assets oder Logos.

**Freigabe:** Der Umbau kehrt `ARCHITEKTUR-SANDBOX.md` 2.1 („Shooter dauerhaft 2D“) um. Auf dem Zweig `claude/flug` ist der 3D-Flug Standard; vor einem Merge nach `main` braucht es Tonis ausdrückliche Freigabe (Abnahme im Fluglabor, siehe 14). Bis dahin ist der Zweig selbst der Schalter.

---

## 0. Kurzfassung der Entscheidungen

| Frage | Entscheidung | Herkunft |
|---|---|---|
| Wo lebt das Flugmodell? | Eigener, dimensionsreiner Kern `Code/src/flight/` (reine Funktionen, double, ohne three.js und DOM, läuft in Browser, Node und später auf dem Spielserver) | gefuehl |
| Spieler-Integrator | 6 Freiheitsgrade, Lage als Quaternion, 120-Hz-Teilschritte (2 je Sim-Schritt), semi-implizites Euler | gefuehl |
| Flugrechner | **GEKOPPELT / ENTKOPPELT** (Alt+C), Schub in alle sechs Richtungen, Raumbremse, Tempodeckel weich auch entkoppelt | gefuehl, voll3d (Alt+C) |
| Nasenregler | Raten-Regler mit Bremsgrenze `ω ≤ 0,92·√(2·α·θ)` (kein Überschwingen bei großen Ausschlägen). Kurvenrollen (bis 50°) und Horizont-Hilfe sind **zuschaltbare Hilfen, Standard aus** (Runde 1: sie kippten die Mausachse und drehten Rollen und Loopings zurück); Touch schaltet beide ein | schicht, Runde 1 |
| Betriebsarten | **KAMPF / REISE / LANDUNG**, Boost mit Vorrat, **BEGRENZER** (Mausrad) | gefuehl |
| Kampftempo | kommt aus `world._speed` (Schiff + Tempo-Generatoren), nie aus einer eigenen Tabelle: gekaufte Generatoren behalten ihren Wert | schicht, Bedenken |
| Maus | Fadenkreuz sofort (Zeigerfang), Schiff folgt mit Trägheit; Maus dreht um die **Schiffsachsen** (waagrecht = reines Gieren); Lenkkegel als Regler (Standard 30°, 15–70°) | gefuehl, alle, Runde 1 |
| Kamera | Sichtfeld 70°, Neigung 6°, Schiff im unteren Drittel, Rückzug bei Schub/Boost, Seitenversatz; Option „Kamera folgt der Zielrichtung“ | gefuehl, voll3d |
| Waffen | gezielte Bolzen, **ein Bolzentempo 2.400 m/s für alle Laser** (eine Vorhaltemarke), 4 Bolzen je Laser und Sekunde mit ¼ Schaden, Munition je 4 Bolzen; Bolzen erben die Schützengeschwindigkeit **nicht** (Sim-Treffer, Vorhaltemarke und Gegnervorhalt nutzen dieselbe Regel); **Handzielen gegen NPC × 2,5** (PvP, SAL, Feuerleitrechner, Taktik unverändert) | schicht, gefuehl, Runde 1 |
| Kardan | Kegel je Klasse S1 6° bis S8 28° (Geschütztürme, PvE); im PvP gedeckelt auf 5° | schicht + Bedenken |
| Trefferform | Kapsel je Klasse nach Modellmaßen (S8 189 m lang) statt einheitlich 20 m; Gegner Kugel × 1,1 (Runde 2, vorher 1,25) | voll3d, schicht |
| Gegnerfeuer | Etappe 1 gewürfelt mit 3D-Querbewegung, sichtbare Bolzen fliegen zum gewürfelten Punkt; **Etappe 2 echte Gegnerbolzen** hinter Schalter (`ls.flight.enemyBolts`, `?gbolzen=1`) | voll3d |
| Controller | Rechter Stick bewegt die Zielrichtung mit **kurzem Vorlauf** (1,1 × Drehrate/Kp), Schiff folgt; Alternative „Drehrate“ in den Einstellungen; Rollen auf LB/RB; Boost L3; Schnellleiste ohne Kombination | Bedenken, voll3d, Runde 1 |
| Zielhilfe | nur mit Stickeingabe, ≤ 40 % Klassen-Drehrate, **Waffenkegel** (Laser schwenken auf die Marke), Stufe für Spieler einstellbar (Mission Control → Einstellungen), in den Netz-Flags, PvP höchstens NIEDRIG | gefuehl, Runde 1 |
| Touch | Telefon startet weiter taktisch; „Flug vereinfacht“ mit Autofeuer (AUTO_K 0,8); MacBook-Trackpad: virtueller Stick empfohlen | voll3d, gefuehl |
| KI | 3D-Bahnen, Anflug mit Abdrehen, Scheren, Durchflug und Wende (≤ 2), Hinterhalt aus dem toten Winkel; Regie-Grenzen ≤ 2 hinten, ≤ 1 senkrecht über/unter dem Spieler; Höhenband je Ziel | gefuehl, voll3d, schicht |
| Zufall | Höhen und Bahnebenen **nie** aus `world.rng`, sondern aus abgeleitetem `Rng(hashString(sektor + ':y'))` bzw. je Gegner-Id | schicht (Pflicht) |
| Taktikmodus | alter Weg `_movePlayer` unverändert, **bitgleicher Goldtest** (Spur aufgezeichnet vor dem Umbau) | schicht, gefuehl |
| Netz | Felder **hinten angehängt** (alte Clients lesen weiter Stelle 0–8), Lage als Smallest-three-Quaternion plus Geschwindigkeit, Hermite-Interpolation, Version `fm` in den Presence-Daten, Sendetakt bleibt **9 Hz** | voll3d, gefuehl |
| PvP | „Schütze entscheidet, Opfer prüft“: Verlauf der letzten 500 ms und Kegelprüfung (Bug des Schützen gegen Linie zum Opfer ≤ Waffenkegel + 15°), PvP nur zwischen gleichem `fm`; Taktik-Würfel gegen Spieler nur in der Ebene (±15°, mindestens 60 m), ohne Trefferpunkt nur von Taktik-Schützen oder Feuerleitrechner im 30°-Kegel | voll3d, gefuehl, Runde 1 |
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
| Erster Raider-Abschuss mit Startausrüstung (Bot mit Menschenmodell, Heimatsektor, nur Laser, Maus und Controller) | `tools/playtest/flug.mjs` (prüft die Grenze seit Runde 1) | Median ≤ 8 s (Bedenken: 6–14 s ist für die ersten Minuten zu zäh) |
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
2. Soll-Drehrate: Mausziel → Fehlerwinkel θ und Achse im Körper, `ω_soll = min(ω_max·kB, Kp·θ, 0,92·√(2·α·θ))` (Bremsgrenze, schicht). Drehraten-Modus → `r · ω_max`. Rollen: manuell, sonst **hält das Schiff seine Rolllage** (Standard). Zuschaltbar: **Kurvenrollen** (Rollwinkel bis 50° in die Kurve, koordiniert aus dem seitlichen Zielfehler; nur solange die Rolllage ≤ 55° und |Nicken| < 60° ist, eine eigene Rolllage darüber bleibt; die Maus dreht dann um den entrollten Rahmen, die Kurve bleibt flach) und **Horizont-Hilfe** (zurück zur Sektorebene, höchstens 0,6 rad/s, nur in Ruhe: 1,5 s ohne eigenes Rollen und ohne Lenken, Zielfehler < 3°, |Nicken| < 45° – ein Looping oder eine Rolle wird nie zurückgedreht). Im Landemodus richtet die Hilfe immer nach der Schwerkraft aus.
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
| S1 | 150 | 110 | 100 | 100 | 95 | 210 | 520 | 12 | 6 / 9 | 6 | 42 × 11 |
| S2 | 145 | 105 | 95 | 95 | 88 | 190 | 460 | 11 | 6,5 / 10 | 8 | 53 × 12 |
| S3 | 125 | 92 | 82 | 82 | 74 | 160 | 380 | 9,5 | 6,5 / 10 | 10 | 58 × 14 |
| S4 | 110 | 82 | 72 | 72 | 62 | 130 | 300 | 8 | 7 / 11 | 12 | 62 × 16 |
| S5 | 90 | 68 | 58 | 58 | 50 | 100 | 220 | 6,5 | 7,5 / 12 | 15 | 88 × 15 |
| S6 | 78 | 60 | 50 | 50 | 42 | 80 | 170 | 5,5 | 8 / 13 | 18 | 84 × 18 |
| S7 | 66 | 52 | 42 | 42 | 35 | 65 | 130 | 4,8 | 8,5 / 14 | 22 | 99 × 19 |
| S8 | 57 | 44 | 35 | 35 | 28 | 50 | 100 | 4 | 9 / 15 | 28 | 189 × 15 |

Kp ist gegenüber dem Entwurf etwa verdoppelt: Mit der Bremsgrenze im Regler gibt es kein Überschwingen, und erst so erreicht S1 die 63 % eines 20°-Fehlers in 0,22 s (mit den Entwurfswerten waren es 0,27 s). Gemeinsam: Boost-Schub × 1,5, Boost-Drehung × 1,2, Raumbremse × 1,3, REISE-Drehraten × 0,6, LANDUNG-Drehraten × 0,5 (60 m/s waagrecht, 20 m/s senkrecht). Moduswechsel KAMPF→REISE 1,5 s (im Kampf gesperrt; Treffer bricht ab), REISE→KAMPF 0,8 s. REISE sperrt Waffen und pausiert die Schildaufladung.

**Kardan:** Kleine Schiffe zielen fast nur über die Nase, große Schiffe haben Geschütztürme, deren Laser bis 28° neben der Nase auf das Fadenkreuz schwenken. Der Spieler zielt trotzdem selbst (der Kardan trifft das Fadenkreuz, nicht das Ziel). Im PvP gilt höchstens 5° (Fairness, Bedenken).

---

## 5. Eingabe

### 5.1 Belegung als Datentabelle

`Code/src/input/bindings.js` ist die einzige Quelle der Belegung (`e.code`, physische Tastenlage); seit Runde 2 liest auch `flightinput.js` gehaltene Tasten (Schub, Rollen, Boost, Bremse, Umsehen, Zeiger frei) und Einzeltasten aus der Tabelle statt aus festem `e.code`. Touch-Belegung (`touchHelp`) und Flugpraxis (`flightPractice`) stehen ebenfalls dort. Beschriftung über `navigator.keyboard.getLayoutMap()` (Chrome, Edge, Electron), sonst feste QWERTZ-Tabelle (auf QWERTZ heißt `KeyZ` „Y“). Flug-Coach, SYSTEM-Quests, Einführungskarte, Bordmenü-Übersicht und `pad-map.js` holen ihre Tastennamen daraus (`keyName('roll_r')`), nicht aus festem Text.

### 5.2 Maus und Tastatur (Verfolger und Cockpit)

| Eingabe | Wirkung | Taktik (unverändert) |
|---|---|---|
| Maus | Zielen: Fadenkreuz sofort, Schiff folgt | Zeiger |
| Linke Maustaste halten | Laser feuern | hinfliegen / Ziel wählen |
| Rechte Maustaste halten / loslassen | Raketen-Aufschaltung (Ziel im 12°-Kegel, 0,8 s) / Start | – |
| Mittlere Maustaste halten | Umsehen | – |
| Mausrad | Begrenzer ± 10 m/s (gilt auch mit Tempomat) | Zoom |
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
| K oder Strg rechts | Feuerleitrechner (Autofeuer, Barrierefreiheit; K für MacBooks ohne rechte Strg-Taste) | Angriff |
| H | Autopilot zur Station (fliegt in 3D) | H |
| 1–0, Alt+1–5, Umschalt+Zahl, J, M, P, V, Esc | wie heute | wie heute |
| Alt bzw. Option (links oder rechts) halten (0,25 s, allein) | Zeiger frei für die HUD-Fenster (Kurs bleibt); Alt+C und Alt+Mausrad lassen den Zeigerfang stehen | – |

**Zeigerfang:** `requestPointerLock({ unadjustedMovement: true })` mit Merkmalserkennung und abgefangenem Promise-Fehler (Safari kennt die Option nicht). Angefordert nur bei einer Nutzergeste (Klick auf die Spielfläche, V, Taste im Flug). Chrome lehnt eine neue Anforderung kurz nach Esc ab: dann erscheint mittig **KLICKEN ZUM STEUERN**; bis zum Klick zielt die Maus als **virtueller Stick** mit sichtbarem Zeiger (der erste Flug ist nie kaputt). Esc löst den Fang (Browserregel) und öffnet mit **einem** Druck das Bordmenü; „Weiter“ fängt neu. Solange eine Ebene offen ist (z. B. die Wahl im ersten Flug), lenkt die Maus nicht; ein Klick ins Bild zeigt `ERST WÄHLEN: GEFÜHRTER EINSTIEG ODER DIREKT SPIELEN`, die Wahl selbst fängt den Zeiger (Runde 2). Auf Touch-Geräten und in WKWebView wird nie angefordert.

**Mac (Priorität 1):** Strg+Klick ergibt unter macOS einen Rechtsklick bzw. `contextmenu` (Firefox meldet sogar Taste 2). Im Flug wird `contextmenu` unterdrückt und ein Rechtsklick mit gehaltenem Strg als Linksklick (Feuer) gewertet, solange Strg als „runter“ gedrückt ist. **Trackpad:** Voreinstellung „virtueller Stick“ wird angeboten, Hinweis im ersten Flug.

**Windows (Priorität 2):** Strg+W/T/N lassen sich im Browser ohne Vollbild nicht abfangen. Schutz: Rückfrage „Seite verlassen?“ im Flug, im Vollbild `navigator.keyboard.lock()` für W/A/S/D/T/N/Q/E/Tab (Chromium; Esc bleibt frei), alle übrigen Strg-Kürzel (Strg+D, Strg+S, Strg+A …) ruft der Flug mit `preventDefault` ab, in der Desktop-App kein Menü-Kürzel auf Strg+W.

**Mausmodi (Einstellung `ls.flight.mouse`):** „Mausziel“ (Standard) oder „Virtueller Stick“ (Zeigerausschlag = Drehrate, für Trackpad und Umsteiger). **Lenkkegel** 30° (Regler 15–70°), Empfindlichkeit 0,07°/px, Y umkehrbar.

### 5.3 Controller (Xbox · PlayStation), Hauptmodus

Gleiches Prinzip wie die Maus: Der **rechte Stick bewegt die Zielrichtung** (Kurve 1,6, höchstens 1,25 × Schiffsdrehrate und höchstens 160°/s), das Schiff folgt. Der Vorlauf des Fadenkreuzes vor dem Bug ist am Controller kurz: 1,1 × Drehrate/Kp (S1 8,7°, S8 7,7°), gerade genug für volle Drehrate. So dreht das Schiff nach dem Loslassen höchstens diesen Vorlauf nach (Runde 1: vorher bis zu 30°). Alternative „Drehrate“ (Stick = Schiffsdrehrate, Fadenkreuz = Nase, Zielhilfe-Mitnahme als zusätzliche Drehrate). Beide und die Zielhilfe-Stufe stellt der Spieler in Mission Control → Einstellungen → CONTROLLER ein, Maus, Lenkkegel, Sichtfeld, Kurvenrollen und Horizont-Hilfe unter FLUG 3D. Daumenkonflikt gelöst: Boost auf L3 (Klick wie Sprinten), nichts Ständiges unter dem rechten Daumen.

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

**Zielhilfe** (Einstellung AUS / NIEDRIG / STANDARD / HOCH, Standard STANDARD): Zielbremse (Stickrate auf 55 % nahe der Vorhaltemarke), Zielmitnahme (k = 0,45 der Winkelgeschwindigkeit (Runde 2, vorher 0,35; HOCH 0,6) der Vorhaltemarke, **nur solange der Stick ausgelenkt ist**, höchstens 40 % der Klassen-Drehrate), **Waffenkegel** (Maus 1,5°, Controller 3,5°, LT 5°, Touch 7°, je Stufe × 0 / 0,6 / 1 / 1,25; Runde 2: Controller vorher 2,5°/4°, die Hilfe trug gegen die schnelleren Gegner nicht messbar): liegt das Fadenkreuz so nah an der Vorhaltemarke des Ziels, zielen die Laser auf die Marke (`world3d.js coneAssist`), die Raute leuchtet in Fraktionsfarbe. Gegen Spieler höchstens NIEDRIG, Mitnahme aus. Die Stufe steht in den Netz-Flags.

### 5.4 Touch (abgestuft)

- **Telefon:** startet weiter taktisch (wie heute). Hauptmodus wählbar als **Flug vereinfacht**: Joystick = Zielen wie der rechte Stick (höchstens 1,25 × Schiffsdrehrate bzw. 140 °/s, kurzer Vorlauf 1,1 × Drehrate/Kp; Runde 2: vorher 140 rad/s statt °/s, das Fadenkreuz sprang bei jeder Auslenkung an den Rand des Kegels und das Schiff drehte über 30° nach), Schub-Schieber, Feuerknopf, Boost, Rakete, Kontext; Horizont-Hilfe und Kurvenrollen immer an. **Autofeuer** (Feuerleitrechner, Treffer per Würfel × 0,8, führt die Zielrichtung, solange der Joystick ruht) ist auf Touch Standard. Der Knopf SCHUB zeigt beim Start AN (Schub 0,7 liegt an). Im 3D-Flug zeichnet die Touch-Zielanzeige nichts mehr (Klammer und Schild kommen vom Flug-HUD; doppelt waren sie unleserlich). Bordmenü → STEUERUNG zeigt auf Touch zuerst die Touch-Belegung, Zeilen brechen um, schmal einspaltig.
- **Tablet:** wie Telefon, dazu Ziehen in der rechten Bildhälfte = Zielen.
- Joystick, Knöpfe und Pinch-Zoom des Taktikmodus bleiben unverändert.
- Knopfraster (Runde 1): sitzt rechts zwischen Mission (oben) und Karte (unten); reicht die Höhe nicht (Handy quer, Tablet im 3D-Flug mit BOOST und SCHUB), wird es kompakt mit vier Spalten. Vorher lagen LASER, RAKETE, ZIEL und HEIM am Handy über dem Bildrand. Das Fenster PILOTEN entfällt auf Touch, die SYSTEM-Karte steht rechts neben dem Joystick.

---

## 6. Kamera

- **Verfolger** (`camrig.js chasePose3d`): Kameralage folgt der Schiffslage gefedert (Gieren/Nicken 9/s bei S1 bis 5/s bei S8, Rollen voll mit; Runde 2: bei 70 % mischte die Kamera Schiffs- und Welt-Oben und drehte in Rückenlage mit 1,75-facher, in Normallage mit 0,7-facher Rollrate), Blickrichtung **35 % Zielrichtung**, zielt das Fadenkreuz unter den Bug bis 85 % (sonst wanderte es auf das eigene Schiff im unteren Drittel) (Option „Kamera folgt der Zielrichtung“: 100 %, Schiff dreht sichtbar hinterher). Neigung **6°**, Schiff im unteren Drittel, Sichtfeld **70°** (55–90°), Rückzug bis +8 % bei Schub, +10 % bei Boost, −5 % beim Bremsen, Seitenversatz bis 4 % gegen Seitenschub. Abstand aus `CHASE_FRAME`. Kampfschwenk zum Ziel entfällt (man zielt selbst), dafür Randpfeil.
- **Cockpit:** Kamera am Pilotenauge mit voller Schiffslage, Kopfträgheit bis 6 cm gegen die Beschleunigung (abschaltbar über „Kamerawackeln“), Umsehen ±110°/−35…+60°.
- **Taktisch:** unverändert. Höhen werden beim Wechsel in die Draufsicht mit dem Kamerablend auf die Ebene gestaucht (Simulation bleibt echt).
- **Übergänge:** Taktisch → Flug: `flight.enter()` aus `rot` (kein Ruck). Flug → Taktisch: **Ebenenfänger** als sichtbares Manöver: Rollen und Nicken auf waagrecht, Höhe mit begrenzter Steigrate (≥ 180 m/s, so schnell wie nötig für höchstens 3 s) auf die Ebene, Klickflug ab dem ersten Bild.
- „Bewegung reduzieren“: Rollen der Kamera 30 %, Stöße × 0,35.

---

## 7. Waffen und Zielen

- **Bolzen:** 2.400 m/s für alle Laser, Lebensdauer Reichweite/Tempo (650 m → 0,27 s), Streuung 0,12°. 4 Bolzen je Laser und Sekunde mit je ¼ Schaden, eine Munitionseinheit je 4 Bolzen (Dauerschaden und Verbrauch wie heute). Kritisch 8 % je Bolzen, SAB/SAL wie heute (SAL als schnelle Salve).
- **Treffer:** je Sim-Schritt Strecke Bolzen alt → neu **relativ zur Zielbewegung** gegen Kugel (Gegner, Radius × 1,1) bzw. Kapsel (Spieler). Bei 2.400 m/s sind das 40 m je Schritt gegen Larven mit r = 12: Streckentest ist Pflicht. Brocken fangen Bolzen ab.
- **Konvergenz:** Ziel unter dem Fadenkreuz → dessen Entfernung, sonst aufgeschaltetes Ziel im Kegel, sonst 500 m; weich in 0,15 s.
- **Vorhaltemarke:** eine Marke (alle Laser gleich schnell): kleinste positive Lösung von `|r + u·t| = s·t` mit `u` = Zielgeschwindigkeit (Bolzen erben nichts).
- **Raketen:** Aufschaltung (rechte Maustaste / LT halten, Ziel im 12°-Kegel 0,8 s), Treffer und Laufzeit wie heute (`ROCKET_FLIGHT`, `rocketHits`), Flugbahn in 3D gezeichnet.
- **Feuerleitrechner (Autofeuer):** Touch-Standard, sonst K oder Strg rechts: feuert gegen NPC im ±75°-Kegel wie im Taktikmodus (gegen Spieler 30°), Treffer gewürfelt × **0,8** ohne Handziel-Faktor; Handzielen lohnt sich so immer. **Er führt** (Runde 2): Zielt der Spieler 0,5 s nicht selbst, dreht die Zielrichtung mit 1,1 × Schiffsdrehrate zur Vorhaltemarke (Barrierefreiheit, Touch); jede eigene Maus-, Stick- oder Joystickbewegung übernimmt sofort.
- **Handzielen gegen NPC × 2,5** (`params.js AIM_PVE`, Runde 1): Die Startausrüstung (2 Pulse-Laser, 140 Schaden/s) brauchte gegen einen Raider (1.100 Hülle + 550 Schild) bei 85 % Treffern 14 s – im Taktikmodus ebenso, dort tragen Würfel und Raketen (3,8 s mit Raketen). Ursache ist das Schadensbudget, das für Würfeltreffer plus Raketen gebaut ist; Handzielen muss Ausweichen, Kurven und Rückzug des Raiders mittragen. Mit × 2 lag der Median bei 8,0–8,1 s, mit × 2,25 bei 6,0–8,1 s je Lauf, mit × 2,5 sicher darunter (Kennzahl ≤ 8 s). PvP, SAL, Feuerleitrechner und der Taktikweg bleiben unverändert; Munition je Abschuss sinkt entsprechend.
- **Gegnerfeuer:** Etappe 1 Würfel mit 3D-Querbewegung und 3D-Feuerkegel, Bolzen fliegen sichtbar (Vorbeiflug bei Fehlwurf, Ton unter 40 m); Schaden nur, wenn der Spieler bei Ankunft höchstens 8 m (Runde 1: 14 m) neben dem Vorhaltepunkt ist. Gegen den 3D-Piloten Schaden × 1,6 (`ENEMY_DMG3`, Runde 2: Hülle fiel vorher nie unter 82 %). Etappe 2 (Schalter) echte Bolzen mit Vorhalt und Fehler je Rang.
- **Taktikmodus:** unverändert Würfel, Laser-Kegel ±75°.

---

## 8. KI in 3D

- **Bewegung:** `moveEnemy` rechnet eine Soll-Geschwindigkeit mit drei Komponenten; Grenzen wie heute (Beschleunigung, Drehrate), dazu Nicken aus der Flugrichtung und Kurvenlage aus der Querbeschleunigung.
- **Manöver** (`sim/ai3d.js`): Kreisen in eigener geneigter **Bahnebene** (Normale aus dem Zufall je Gegner-Id, nie aus `world.rng`), **Anflug mit Abdrehen** (pack, ambush), **Scheren** wenn der Spieler im Heck sitzt, **Durchflug und Wende** (halber Looping, höchstens 2 gleichzeitig), **Hinterhalt aus dem toten Winkel** (Jackal lauert 250–400 m über/unter dem Spieler, Rammangriff mit sichtbarem Aufladen), Schwarm auf der Kugelschale, Abstand halten mit Höhenwechsel, Flucht aus der Ebene. **Runde 2:** **Ins Heck setzen** (`tail`, nach dem Abdrehen bei pack, ambush, thief: Heimatsektor 40 %, sonst 75 % der Anflüge; Eröffnung zu zwei Dritteln davon gleich übers Heck): Punkt 240–360 m hinter dem Spieler, dort sein Tempo übernehmen und feuern, bis 7 s oder die Regie den Platz braucht. **Tempo** im 3D-Weg je Stil (`ENEMY_SPEED3`): pack × 1,35 (Raider 210 → 284 m/s gegen 340 m/s Kampftempo S1), ambush × 1,4, swarm × 1,35, thief × 1,3, guard × 1,2, kite × 1,15, große × 1. **Ausweichen** unter Beschuss je Denkschritt mit ai.dodge × 0,55 im Heimatsektor bzw. × 0,9 sonst (Taktik × 0,22), Haken 0,6/0,75 s, Pause 1,6–3,2 s bzw. 1,2–2,6 s (Taktik 0,55 s, 2,5–4,5 s). Der Heimatsektor bleibt so Einstieg (Kennzahl Abschuss ≤ 8 s), ab Sektor 2 wird der Kurvenkampf hart. Gegner folgen dem neuen Höhenband.
- **Regie-Grenzen:** höchstens **2 Angreifer gleichzeitig in der hinteren Halbkugel**, höchstens **1 direkt über oder unter** dem Spieler (unter 25° zur Senkrechten) – Prüfung T-17. Budget 3–4 Angreifer bleibt.
- **Höhenband je Ziel:** Gegner gegen einen Piloten in der Taktikansicht fliegen flach (±40 m um dessen Höhe), gegen einen 3D-Piloten räumlich. Gemeldet über die Ansicht des Piloten (lokal sofort, im Netz über die Flags).
- **Sektor als Raum:** Höhenband ±4.500 m (Heimat ±4.000 m; bis Runde 1 ±1.500/±1.200 m, mit Boost nach 2 s an der Decke). **Rand (Runde 2):** ab 83 % warnt das HUD (`OBERGRENZE · 600 M`, Marke auf dem Kursband); jenseits der Grenze **ohne Schaden** ein Navigationsfeld: Geschwindigkeit nach außen baut mit 1,6/s ab, dazu Schub zurück (40 m/s² plus 0,1 m/s² je Meter Tiefe, höchstens 160 m/s²), HUD `NAVIGATIONSFELD LENKT ZURÜCK` (`world3d.js edge3d`). Runde 1 hatte 6 s Frist und danach 2 % Hülle je Sekunde – eine unsichtbare Wand mit Schaden. Taktikweg unverändert (Schaden außerhalb der Karte wie bisher).
- **Autopilot (H, Beute anfliegen):** ab 2,5 km außerhalb des Kampfes in REISE (2,8 × Kampftempo), unter 1,4 km zurück auf KAMPF; eigene Eingabe beendet beides. Station, Tore, Frachterrouten auf y = 0. Rudel ±400 m, Einzelgänger ±600 m, Felder mit Höhenstreuung, Kisten ±300 m, Wracks an der Abschusshöhe.
- **Zonen als Zylinder** (sichere Zone, Tor, Andocken, Reparatur am Tor: 2D-Abstand und |Δy| ≤ 400 m). REISE ist im Kampf gesperrt, Treffer bricht das Hochlaufen ab.
- **Sprungfeld (Runde 2):** F/J am Tor startet das Aufladen auch aus voller Fahrt. Solange es lädt, baut das Tor die Geschwindigkeit mit 4/s ab und zieht das Schiff zur Tormitte (höchstens 60 m/s), auch mit gehaltenem W; nur Boost reißt heraus. Abgebrochen wird erst außerhalb von 2 × Torradius (300 m). Vorher rollte ein Schiff mit Kampftempo gekoppelt bis 407 m aus (Bremsweg S1 464 m) und der Sprung brach ab.
- **Beute-Traktor:** ab 150 m zieht ein Strahl Wracks, Kisten und Erz mit 60 m/s heran (außerhalb des Kampfes schneller).

---

## 9. Mehrspieler

- **Zustand** (`mp-core.js packState`): Stellen 0–8 unverändert, angehängt: 9 `y` (dm), 10–12 Quaternion smallest-three (±32767), 13 Index, 14–16 Geschwindigkeit (dm/s), 17 Flugflags (Boost, REISE, entkoppelt, Landung, Fahrwerk, Taktikansicht, Zielhilfe 2 Bit), 18 `fm` = 3. `unpackState` liest alte Pakete (Länge ≥ 8) als y = 0, Lage aus `rot`.
- **Darstellung:** Hermite-Interpolation aus Ort und Geschwindigkeit, Lage per Slerp, Vorhersage bis 250 ms. Sendetakt **9 Hz** (Supabase-Kontingent). Bekannte Grenze: Manövrierende Ziele wirken bei 9 Hz im Handzielen leicht „springend“, bis der eigene Server kommt.
- **Presence:** `fm` in den Metadaten; PvP nur zwischen gleichem `fm`.
- **PvP:** Schütze entscheidet (Bolzentreffer auf das interpolierte Abbild), sendet Trefferpunkt, Schusszeit und eigenen Bug; Opfer prüft: eigener Verlauf der letzten 500 ms innerhalb 2 × Kapsel am gemeldeten Punkt, Kegel (Bug des Schützen gegen Linie zum Opfer ≤ Waffenkegel + 15°), Reichweite × 1,6, Ratenbegrenzung wie heute.
- **Zwischen den Ansichten (Runde 1):** Der Taktik-Würfel misst gegen fremde Spieler räumlich und trifft nur in der Ebene (höchstens 15° über/unter dem Schützen, mindestens 60 m Spielraum, `aim.js tacticalReach`, gleiche Regel beim Opfer). Treffer ohne Trefferpunkt nimmt das Opfer nur von einem Schützen in der Taktikansicht an, vom Feuerleitrechner eines 3D-Piloten nur im 30°-Kegel (+15°) um dessen Bug, Raketen wie bisher. Ein 3D-Client, der den Trefferpunkt weglässt, wird abgelehnt.
- **Koop:** Gegnerzeilen nur im 2,5-km-Umkreis des Gasts, angehängt y und Gieren/Nicken; Kopfzeilen mit y und Lage.

---

## 10. Taktikmodus als Nebenmodus

- `world.flight3d === false` → heutiger `_movePlayer`, `_updateLasers` (Würfel), Klickflug, alte Tastatur- und Controller-Belegung. 2D-Abstände wie bisher (Δy zählt dort nicht).
- **Goldtest T-01:** `src/sim/goldtest.mjs` rechnet drei feste Szenarien und vergleicht die Prüfsummen bitgenau mit `gold-taktik.json` (aufgezeichnet vor dem Umbau). Höhen kommen aus abgeleitetem Zufall, deshalb bleibt die Zufallsfolge von `world.rng` im Taktikweg unverändert.
- Telefon startet taktisch. V wechselt jederzeit, auch im Kampf.

---

## 11. HUD (Flug, `ui/hud-flight.js`)

Eine Zeichenfläche über der Spielfläche (Gerätepixel, Linien und Text, ohne Schatten), Stil nach `UI_STIL.md` (Haarlinien, Ticks, Versalien, DIN-Schrift, Farbe nur mit Funktion):

Fadenkreuz (Zielrichtung, sofort) · Bugmarke · Waffenkreuz/Kardanmarke · Flugbahnmarker · **eine** Vorhaltemarke · Zielklammer mit Entfernung, Annäherung und Balken · Randpfeil · **Treffermarke** (weiß Hülle, Fraktionsfarbe Schild, groß bei Abschuss) · **roter Bogen der Trefferrichtung** · **rote Bedrohungsbögen** am Rand (Gegner zielt oder lädt auf) · **Raketenwarnung** mit Ton · **Kursband** oben · Geschwindigkeitsleiter mit Begrenzer · Schub- und Höhenanzeige (`EBENE +240`) · Boost-Balken · Moduszeile (`KAMPF · GEKOPPELT · BEGR 330`, `ENTKOPPELT` in Warnfarbe) **über** dem Kursband · Sektorrand-Warnung mit Zählwerk · Horizontleiter (Cockpit) · Hinweis **KLICKEN ZUM STEUERN** · Minikarte mit Höhenmarken ▴/▾.

**Flug-HUD statt Konsole (Runde 2):** Fenster haben je Ansicht eine eigene Sichtbarkeit (`hud-win.js setProfile`): Im 3D-Flug sind Pilot, Konto, Ziel (die Klammer trägt Name, Entfernung, Hülle und Schild), Piloten und Chat aus, per Leiste oben wieder einblendbar (Enter öffnet den Chat); die Taktik behält die volle Konsole. Der Funk zeigt im 3D-Flug höchstens drei bis vier Zeilen. Randpfeile (Ziel, Auftrag, Gegnerwarnungen) sitzen auf einem Ring bzw. einer Ellipse um die Bildmitte (Richtung aus der Projektion, hinter der Kamera gespiegelt), nie am Bildrand unter Fenstern; ist das Auftragsziel das gewählte Ziel im Bild, entfällt die Auftragsmarke. Das Zielschild steht im 3D-Flug immer über der Klammer (Cockpit: darunter liegt die mittlere Konsole). **Schwebende Zahlen:** Treffer rechts neben der Klammer (gestapelt nach unten; vorher 66 px + 22 px je Stufe darüber, genau auf Name und Entfernung), eigener Schaden und Heilung unter der Tempoleiter, Beute unter der Höhenanzeige (vorher über dem eigenen Schiff, also auf dem Fadenkreuz). Coach-Karte nach 12 s leise (nur Titel), der Beute-Schritt endet nach 40 s von selbst. Boost-Balken links neben der Tempozahl (die Zahl lag auf BOOST). Cockpit-Konsole zeigt räumliches Tempo und räumliche Entfernung wie Leiter und Klammer. Ton-Hinweis im 3D-Flug oben links. **Eigener Triebwerksschweif:** Schweife sind im 3D-Flug zur Kamera gedrehte Bänder (vorher flach in der Ebene) und unter 60 m vor der Kamera ausgeblendet; der eigene ist im 3D-Flug kurz und schmal (vorher ein riesiger Lichtkegel über dem unteren Bildviertel).

**HTML-Fenster im 3D-Flug (Runde 1):** Das Schiffsfenster ist flach (nur Hülle und Schild; Tempo und Generatoren zeigt die Tempoleiter), damit es das eigene Schiff in der Verfolgersicht nicht verdeckt; im Cockpit entfällt es (Hülle und Schild stehen auf der Konsole). Das Zielschild steht in der Verfolgersicht über der Klammer (darunter sitzt das eigene Schiff), lange Namen passen (184 px). Zielfenster und Klammer messen räumlich. Schwebende Schadenszahlen stehen in Zielhöhe; Bolzen melden beim Abfeuern kein DANEBEN mehr (früher je Bolzen ein Text, 4–5-fach gestapelt). Der Flug-Coach nennt Tasten je Ansicht und Gerät (Tastatur, Controller, Touch) aus der Belegung, die SYSTEM-Karten ebenso (`bindings.js inputName`).

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
| `tools/playtest/flug.mjs` (neu, headless) | Maus- und Controller-Flug geskriptet (Zeigerfang-Attrappe per `addInitScript` mit `movementX/Y`, Controller-Attrappe): Kurven, Rollen, Boost, entkoppelt, Kampf gegen 3D-KI; Kennzahlen Bildrate, Reaktionszeit, Trefferquote, Kampfdauer; Bilder in Verfolger- und Cockpitsicht; Strg+Klick ohne Kontextmenü, Esc öffnet mit einem Druck, Alt gibt den Zeiger frei, Heap-Wachstum < 2 MB über 60 s. Seit Runde 1 zusätzlich: **Kennzahl Abschuss ≤ 8 s** (Maus und Controller, nur Laser), Maus waagrecht 5 s = reines Gieren (Bug ±3°, > 360°), Q-Rollen ohne Rückdrehen, Tempomat folgt dem Begrenzer, Sektorrand (seit Runde 2: Warnung, Navigationsfeld, kein Schaden; Höhenband ±4 km), Autopilot in REISE (Umgebung geräumt), kein DANEBEN je Bolzen, Zielfenster und Klammer gleiche Entfernung, Alt+C behält den Zeigerfang, Strg+D/S/A abgefangen, K schaltet den Feuerleitrechner; der Bot feuert wie ein Mensch, sobald die Raute heiß ist (Waffenkegel), setzt fliehenden Raidern mit Boost nach und misst frische Rudel bis 5 Abschüsse (Median nicht mehr aus angeschossenen Resten früherer Kämpfe). Seit Runde 2: **Lesbarkeit** (schwebende Zahlen nie auf Zielschild oder Fadenkreuz, Rechteckprüfung alle 6 Bilder) und **Sprungtor aus voller Fahrt** (F bei 120 m, W los) |
| `tools/playtest/controller.mjs` | Menüs und Taktik wie bisher, Flugteil auf die neue Belegung umgestellt (nicht abgeschwächt); seit Runde 2 Einstellungen zeilenweise (▴ von ZIELHILFE → HORIZONT-HILFE → RECHTER STICK) |
| `tools/mehrspieler/test.mjs` | zwei Seiten: fremdes Schiff mit Höhe und Lage, altes Paket flach |
| `tools/playtest/tief.mjs`, `spielen.mjs`, `grafik.mjs` | headless auf freiem Port (`--url`), `tief.mjs` wahlweise `--flug=taktik` (hält seit Runde 2 wirklich in der Taktik); im 3D-Weg fliegt der Bot mit Schub und Feuerleitrechner statt Klickflug-Autopilot, Bericht nennt die Ansicht |
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
| Gezieltes Feuer gegen 85-%-Würfel (Balance, Wirtschaft) | gleicher Dauerschaden und Verbrauch, Kardan, Trefferkugel × 1,1, Autofeuer × 0,8, Median-Abschuss ≤ 8 s |
| Gegner-Würfel bei sichtbaren Bolzen wirkt unfair | Querbewegung in 3D zählt, Etappe 2 echte Bolzen hinter Schalter |
| Zeigerfang Safari/WKWebView, Trackpad | Merkmalserkennung, KLICKEN ZUM STEUERN, virtueller Stick, nie auf Touch |
| Strg als „runter“ | Rückfrage beim Verlassen, Tastatursperre im Vollbild, `contextmenu` unterdrückt, Mac-Strg+Klick = Feuer |
| Modelle von unten | Bilderreihe „von unten“ |
| Himmel an den Polen (Rundumbild) | Ansicht „steil oben/unten“ in der Bilderreihe |
| Netz 9 Hz | Hermite, Vorhersage; eigener Server später |
| Taktik bricht | alter Weg unverändert, Goldtest bitgleich |
| Headless-Leistungswerte | nur Vergleich; Abnahme am M5 durch Toni |

---

## 16. Umsetzungsstand (03.11.2026, Zweig `claude/flug`, Runden 1 und 2 eingearbeitet)

**Gebaut:** Flugkern (`src/flight/`), Welt und KI im 3D-Weg (`sim/world3d.js`, `sim/ai3d.js`), Maus mit Zeigerfang und virtuellem Stick, Belegungstabelle (`input/bindings.js`), Controller (`input/padflight.js`, Zielhilfe), Touch vereinfacht, Verfolger und Cockpit mit voller Lage, Flug-HUD (`ui/hud-flight.js`), Mehrspieler mit Höhe und Lage (abwärtsverträglich), Landemodus-Vorbereitung (Fahrwerk, `env`, Rahmen und Ursprungsversatz), Fluglabor (`?dev=fluglabor`, `ui/fluglabor.js`, nur Entwicklung), Ton (Steuerdüsen, Boost, Vorbeiflug, höchstens 24 Stimmen). Neue Spieler und alte Spielstände starten im Verfolger (einmalige Umstellung `ls.flight.migrated`, Telefone bleiben taktisch); Taktik über V.

**Gemessen (headless, Entwicklungsserver, 03.11.2026):**

| Prüfung | Ergebnis |
|---|---|
| `npm test` | alle Prüfungen bestanden, Taktik-Goldtest bitgleich (3 Szenarien) |
| `tools/playtest/flug.mjs` | 27/27; Fadenkreuz 1 Bild Verzug, Nase erreicht 63 % in 0,23 s (S1), Heap-Zuwachs 0,3 MB; Maus 81 % Treffer, Cockpit 89 %, Controller 83 % (Controller/Maus 1,02), 60 Bilder/s |
| `tools/playtest/controller.mjs` | 88/88, 0 Konsolenfehler |
| `tools/mehrspieler/test.mjs` | alle bestanden (inkl. Höhe/Lage fremder Schiffe, Taktik-Flag, PvP-Treffer und Abschuss im 3D-Flug) |
| `tools/playtest/tief.mjs 25 saturn` | 3D und `--flug=taktik` ohne Fehler, 60 Bilder/s |
| `tools/playtest/spielen.mjs --minuten 1` (3D) | 59,6 Bilder/s, Kampf ohne Bild über 20 ms, Raider-Abschuss Median 3,8 s (mit Raketen, wie F0) |
| `ansichten.mjs` neue Ansichten | Kurvenkampf/Modelle von unten, Himmel steil oben/unten: keine Fehler, keine Nähte an den Polen |

### Runde 1: Nachbesserung nach drei Spieltest-Gutachten (03.11.2026)

| Befund | Ursache | Behebung |
|---|---|---|
| Abschuss Raider 13–15 s (Ziel ≤ 8 s), flug.mjs prüfte es nicht | Schadensbudget für Würfel plus Raketen; Handzielen trägt zusätzlich Ausweichen und Rückzug | Handzielen gegen NPC × 2,5 (7), Waffenkegel der Zielhilfe, Kennzahl-Prüfung in flug.mjs (Maus und Controller) |
| Waagrechte Maus: absinkende Spirale, keine Umkehr | Maus drehte um die Kameraachsen; Kurvenrollen und mitrollende Kamera kippten sie | Maus dreht um die Schiffsachsen (`aimAxes`), Kurvenrollen Standard aus (5.2, 4.3) |
| Horizont-Hilfe dreht Rollen und Loopings zurück, 80 °/s statt 0,6 rad/s | griff auch bei Mauseingabe; mit Kurvenrollen galt dessen Rollrate | Standard aus; nur in Ruhe, höchstens 0,6 rad/s (4.3) |
| Sektorrand: Schaden ohne Vorwarnung | `BAND_WARN` unbenutzt, kein HUD | Warnung ab 83 %, 6 s Frist mit Zählwerk (8); Kodex aus den Werten |
| Coach mit Klickflug-Tasten, Controller-Texte alt, SYSTEM-Karten mit „W“ und „Klick“ | feste Texte | Texte je Ansicht und Gerät aus der Belegung (11) |
| Zielfenster 2D, Klammer 3D | `Math.hypot(dx, dz)` | räumlich |
| HUD verdeckt das eigene Schiff, Schiff verdeckt Ziele, Cockpit-Konsolen verdeckt | Fenster der Taktik-Konsole; Fadenkreuz unter dem Bug wanderte aufs Schiff | flaches Schiffsfenster, Zielschild oben, Kamera folgt nach unten stärker, Fenster im Cockpit aus (6, 11) |
| DANEBEN 4–5-fach gestapelt | jeder Bolzen meldete beim Abfeuern `hit: false` | Bolzen ohne DANEBEN, Zahlen in Zielhöhe |
| Tempomat ignoriert Begrenzer | `cruiseV` nur bei Schub gekappt | immer gekappt |
| Ruckler beim Start (200–533 ms), Cockpit 200 ms | Modelltausch während schon gesteuert wurde; Cockpit-Shader beim ersten V | Start wartet auf `sectorReady`, Simulation ruht bis zum ersten Bild; Cockpit vorübersetzt |
| Controller dreht nach (bis 30° nach dem Loslassen) | Fadenkreuz 160 °/s bis an den 30°-Kegel | 1,25 × Drehrate, Vorlauf 1,1 × Drehrate/Kp, Drehraten-Modus wählbar (5.3) |
| Zielhilfe nicht einstellbar, Waffenkegel fehlt | nur Fluglabor; `ASSIST_CONE` unbenutzt | Mission Control → Einstellungen; `coneAssist` (5.3) |
| Xbox-Bordmenü zeigt B statt X | Tastatur-Umschlüsselung auch auf Controller-Kappen | Kappen mit `data-pk` ausgenommen |
| Handy quer: LASER/RAKETE/ZIEL/HEIM außerhalb | Raster wuchs von festem Abstand nach oben | Raster passt sich ein, kompakt (5.4) |
| Windows: Strg+W/D/S/A | kein `preventDefault`, keine Tastatursperre | Strg-Kürzel abgefangen, Tastatursperre im Vollbild, Rückfrage beim Verlassen |
| Mac: Option löst bei Alt+C den Zeigerfang, keine Strg rechts | Alt löste sofort; Autofeuer nur auf Strg rechts | Alt erst nach 0,25 s allein; K für den Feuerleitrechner; abgelehnter Neufang wird beim nächsten Klick wiederholt |
| PvP: Taktik-Würfel trifft 3D-Piloten 500 m höher; ohne `hp` keine Prüfung | Würfel maß in der Ebene, `pvpPlausible` gab `true` | Würfel nur in der Ebene, Opfer prüft dieselbe Regel (9) |
| controller.mjs flackert (REISE) | Gegnertreffer sperrte REISE | Gegner vor der Prüfung weg; Beute-Prüfung merkt sich das Ziel vor dem Tastendruck |
| Kursband-Marke über „GEKOPPELT“ | Moduszeile unter dem Band | Moduszeile darüber |
| Autopilot H 47 s | nur Kampftempo | ab 2,5 km in REISE |

**Gemessen nach Runde 1 (headless, M5, 03.11.2026):** `npm test` alle bestanden (Goldtest bitgleich, neue Prüfungen für Hilfen, flache Kurve, Tempomat, PvP zwischen den Ansichten). `flug.mjs` 38/38 in drei Läufen: Raider-Abschuss nur mit Lasern (frische Rudel, je 5 Abschüsse), Maus Median 4,8–5,8 s bei 76–89 % Treffern, Controller 5,6–5,9 s bei 75–87 % (vorher 13–15 s bzw. 21 s); Maus waagrecht 5 s: 413°, Bug 0,0°; Q-Rollen bleibt stehen; Tempomat 240/240 m/s; Sektorrand Warnung → Frist → Schaden; Autopilot in REISE. `controller.mjs` 90/90 für Xbox, PlayStation und Switch Pro; Stick 0,3 s voll: S1 17,6° beim Halten, 10° danach (vorher 19°/29°), S8 nach langem Halten 8° (vorher 30°). Startbilder über 50 ms liegen nur noch vor dem ersten sichtbaren Bild (Simulation steht); erster Kampf und erster Cockpitwechsel ohne Bild über 17 ms. Mehrspielertest alle bestanden. `tief.mjs 25 saturn` 3D und Taktik ohne Fehler, 60 Bilder/s. Handy quer: alle Knöpfe im Bild.

### Runde 2: Lesbarkeit, Kampfspannung, Touch, Sprungtor (03.11.2026)

Drei Gutachten (Maus/Gefühl, Controller/Touch, Abläufe/Prüfwerkzeuge). Das Flugmodell selbst bestand (Nase 63 % in 0,19–0,23 s, Looping ohne Kamerasprung, 60 Bilder/s); durchgefallen war es an Lesbarkeit, Kampfspannung und Touch.

| Befund | Ursache | Behebung |
|---|---|---|
| Schadenszahlen auf Zielschild (Name, Entfernung) und Fadenkreuz | Zahlen 66 px + 22 px je Stufe über dem Ziel, Zielschild ebenfalls darüber; eigene Zahlen und Beute über dem eigenen Schiff = Fadenkreuz | Treffer neben der Klammer auf der dem Fadenkreuz abgewandten Seite, weichen Schild und Fadenkreuz aus (Rechteckprüfung je Bild); eigene unter der Tempoleiter, Beute unter der Höhenanzeige (11) |
| Kämpfe zu leicht: 87–93 % Treffer, Hülle nie unter 82–89 %, Gegner 5 % hinten | Gegner 184 gegen 340 m/s, immer frontal, selten Ausweichen, Trefferkugel × 1,25, Gegnerschaden klein | Gegner im 3D-Weg schneller (× 1,15–1,4), Heck-Anflüge, häufiger und länger ausweichen, Schaden × 1,6, Kugel × 1,1, Ausweich-Spielraum 8 m (7, 8); Taktik bitgleich |
| Höhe ±1.200 m als Käfig mit Hüllenschaden | Band zu flach, Frist dann Schaden | ±4.000/±4.500 m, Navigationsfeld ohne Schaden (8) |
| Fenster der Taktik-Konsole stellen den Flug zu, Coach minutenlang, Randpfeile auf Fenstern | ein Fensterprofil für beide Ansichten; Pfeile am Bildrand | Fensterprofil je Ansicht (3D: Pilot, Konto, Ziel, Piloten, Chat aus), Funk kurz, Coach leise nach 12 s und oben links, Randmarken auf einer fensterfreien Ellipse (`hud-parts.js ring3`), Beutezeile links (11) |
| Klick ins Bild fängt die Maus nicht, solange die Wahl im ersten Flug offen ist | `menuOpen()` blockte `requestLock`, Maus lenkte still als virtueller Stick | Wahl fängt den Zeiger; offene Ebene lenkt nicht; Klick zeigt `ERST WÄHLEN …` (5.2) |
| Riesiger oranger Lichtkegel des eigenen Triebwerks | flaches Schweifband (für die Draufsicht) lag zwischen Schiff und Kamera | Schweife im 3D-Flug zur Kamera gedreht, unter 60 m ausgeblendet, eigener kurz und schmal; Boden-Telegraphen im 3D-Flug aus (große rote Flächen) |
| Konsole 158 M/S, Leiter 172 M/S; Tempozahl auf BOOST | Konsole nur waagrecht; Boost-Balken zu nah | räumliches Tempo und Entfernung; Boost links der Zahl |
| flug.mjs „Autopilot REISE“ flackert | REISE im Kampf gesperrt (Absicht), Gegner am Weg | Prüfung räumt die Umgebung (kein Spielfehler) |
| **Touch-Joystick 57-fach zu schnell** (12°/Bild bei 30 %, 31,6° Nachdrehen) | 140 · dt / (sens · D) → rad/s statt °/s, kein Vorlauf-Deckel | °/s wie der rechte Stick, Vorlauf 1,1 × Drehrate/Kp: 30 % → 0,18°/Bild, 0,9° Nachdrehen (5.4) |
| Tablet startet im kaputten Touch-3D | Folge des Joystick-Fehlers | behoben mit dem Joystick |
| SCHUB-Knopf zeigt AUS bei Schub 0,7 | Startwert ohne Klasse `is-on` | Klasse beim Start |
| Bordmenü STEUERUNG am Handy: nur Maus/Tastatur, Überlappungen, „Hinflieg“ | feste 58-px-Spalte, `nowrap` von `.mp-cg` geerbt, Medienabfrage greift wegen Viewport-Skalierung nicht | Touch-Belegung zuerst (`bindings.js touchHelp`), Spalten wachsen, Umbruch, auf Touch einspaltig, Joystick unter dem Menü aus |
| Touch-HUD überladen (GELEIT mittig, Doppel-Zielanzeige) | zweite Touch-Zielanzeige über hud-mid; Karte groß | Touch-Zielanzeige im 3D-Flug aus; SYSTEM-Karte am Handy kompakt oben rechts |
| CONTROLLER.md „Drehrate = kein Nachdrehen“ | Bremsweg der Drehung ω²/2α ≈ 9° gilt für beide Modi | Doku und Kommentar richtiggestellt |
| Zielhilfe ohne messbaren Nutzen | Kegel 2,5°, Mitnahme 0,35 gegen ausweichende Ziele zu klein | Kegel 3,5° (LT 5°), Mitnahme 0,45 (HOCH 0,6) |
| Controller-Menü: ▴ von ZIELHILFE springt zu SICHTFELD, linke Hälfte leer | rein räumliche Suche; Controller-Abschnitt rechts unter allem | Stufenwahl zeilenweise (Fokus auf die gewählte Stufe), Controller-Abschnitt links |
| Schief nach Kurvenkampf am Controller | Horizont-Hilfe Standard aus | am Controller Standard an (nur in Ruhe), Einstellung HORIZONT-HILFE unter CONTROLLER |
| Cockpit-Zielkasten über der Konsole, TON AUS mitten im HUD | Schild unter der Klammer; Hinweis fest oben mittig | Schild im 3D-Flug immer über der Klammer; Ton-Hinweis im 3D-Flug oben links |
| **Sprungtor im 3D-Flug scheitert im Anflug** (407 m Auslauf) | `tryJump` bremst nicht, Bremsweg 464 m > Torradius 150 m | Sprungfeld hält das Schiff (8), Abbruch erst bei 300 m; Selbsttest und flug.mjs im Anflug |
| `?flug=taktik` hielt keine Sekunde | `CameraRig.refresh` stellte jede Sekunde die gespeicherte Wahl her | `rig.forced` bis zum ersten V |
| Feuerleitrechner in tiefen Sektoren fast wirkungslos (0–57 Schaden/s) | 30°-Kegel um den Bug, niemand richtete den Bug aus; tief.mjs flog per Klickflug-Autopilot | Rechner im ±75°-Kegel gegen NPC, führt die Zielrichtung; tief.mjs fliegt im 3D-Weg mit Schub statt Klickflug |
| Verfolgerkamera rollt ungleichmäßig | Mischung Schiffs-/Welt-Oben (0,7) | Kamera rollt voll mit (Bewegung reduzieren: 0,3 wie bisher) |
| Kleinigkeiten | feste `e.code`; Option rechts; Explosionsnähe 2D; Prüfberichte im Arbeitsbaum | Belegung aus `bindings.js`, Option links und rechts, räumlich, `.gitignore` |

**Gemessen nach Runde 2 (headless, M5, 03.11.2026):** `npm test` alle bestanden (Taktik-Goldtest bitgleich; neu: Sprung aus dem Anflug mit Kampftempo, W gehalten und losgelassen). `flug.mjs` 41/41 in den letzten drei Läufen (zwei frühere Läufe 40/41 an der neuen Lesbarkeitsprüfung, behoben durch Messung des echten Zielschild-Rechtecks): Raider nur mit Lasern Maus Median 6,1–7,6 s bei 70–82 % Treffern, Controller 6,4–7,7 s bei 70–76 % (Runde 1: Maus 4,8–5,9 s bei 76–89 %); 0 Zahlen auf Zielschild oder Fadenkreuz in 729–905 Stichproben; Sprungtor aus 340 m/s, weitester Abstand 116–118 m, SA-1 → SA-2; Sektorrand 300 → 113 m/s nach außen in 0,4 s, kein Schaden, zurück im Sektor; 3.000 m Höhe frei; 60 Bilder/s, schlechtestes Bild 17 ms. Gutachter-Spielerbot (`spieler.mjs`, 200 ms Reaktion) in Sektor 4 mit S3: 82–86 % Treffer, Abschuss-Median 7,5–9,1 s, Hülle bis 25–47 % (vorher 93 %, nie unter 89 %), Gegnertempo Median 234–283 m/s (vorher 184). Touch (844 × 390 und 1180 × 820): Joystick 30 % → 0,18° je Bild, 0,7° Nachdrehen (vorher 12,06° und 31,6°), 50 % → 0,5°/2,1°, voll → 1,43°/7,3°; SCHUB zeigt AN. `controller.mjs` 91/91 für Xbox und PlayStation, 0 Konsolenfehler. Mehrspielertest alle bestanden. `tief.mjs 25 saturn` 3D mit Feuerleitrechner 38–118 Schüsse und 144–766 Schaden/s in SA-4 bis SA-8 (vorher 0–28 Schüsse, 0–382), Taktik (jetzt wirklich Taktik) 87–191 Schüsse, 393–816 Schaden/s; 60 Bilder/s, keine Fehler.

**Offen:**
- Draw Calls im 3D-Flug ≈ 200–230 gegenüber ≈ 55–65 in der Taktik bei gleicher Szene: Die Verfolger- und Cockpitkamera sieht bis zum Horizont (Brockenfelder, alle Ansichten bis 5,2 km). Eine engere Fernausblendung kleiner Teile brachte headless keinen messbaren Gewinn. Abnahme bei 120 Hz in nativer Retina-Auflösung am M5 steht aus (Toni).
- Zeigerfang und Tastatursperre sind headless nur mit Attrappen geprüft; echtes Verhalten in Chrome, Safari und Edge (Windows) prüft Toni.
- `tief.mjs` erzielt in SA-4 bis SA-8 in 25 s meist keinen Abschuss (je Sektor ein frisches Ziel aus 1,5–2 km Anflug; beide Ansichten); Schaden je Sekunde und Schüsse sind die Kennzahl.
- Bildzeit-Ausreißer beim Andocken (Stationsbild öffnet, 250 ms, Taktik ebenso) und Sektorwechsel (50 ms) bestehen weiter.
- Kampfspannung ist mit Bots gemessen (Trefferquote, Hülle, Abschusszeit); ob sich der Kurvenkampf gut anfühlt, entscheidet Toni in der Gefühlsabnahme.
- Gefühlsabnahmen 1–3 durch Toni am M5 (Maus, Waffen, Controller) im Fluglabor; erst danach Merge-Entscheidung.
- Liegt das Schiff beim Start innerhalb der Stations-Hüllquader, schiebt die Stationsfreihaltung die Kamera bei steilem Nicken über das Schiff (Schiff kurz nicht im Bild); betrifft nur den Startpunkt an der Station.
- Cockpit-Ebene wird auf Qualität NIEDRIG nicht gezeichnet (bestand schon vorher, kein Composer).
- Planetenlandung selbst (Boden, Atmosphäre, Weltrenderer mit kameranahem Zeichnen) ist nur vorbereitet.
