# LAST SIGNALS · Entwurf neues Flugmodell („Gefühl zuerst“)

Stand 03.11.2026, Zweig `claude/flug`, Arbeitsbaum `wt-flug`. Entwurf, kein Code geändert, nicht committet.

Auftrag (Toni, Star-Citizen-Spieler): „Bisher macht das Spiel mit der Steuerung keinen Spaß – nur im DarkOrbit-typischen Modus, der soll aber am Ende nur Nebensache sein.“ Verfolger und Cockpit werden der **Hauptmodus mit echtem 3D-Flug**. Die taktische Draufsicht bleibt als **Nebenmodus** und darf nicht kaputtgehen. Referenz für Systeme und Qualitätsanspruch ist der aktuelle Stand von Star Citizen, ohne fremde Namen, Assets oder Logos.

Ansatz: Zuerst wird beschrieben, wie sich die ersten 60 Sekunden anfühlen sollen. Daraus folgen Kennzahlen, und aus den Kennzahlen folgt die Technik.

---

## 0. Kurzfassung

- **Ein neuer Flugkern** `Code/src/flight/` (reine Funktionen, deterministisch, 120 Hz Teilschritte, double): 6 Freiheitsgrade, Lage als Quaternion, Flugrechner **GEKOPPELT/ENTKOPPELT**, Schub in alle sechs Richtungen, Nicken/Gieren/Rollen mit Drehbeschleunigungsgrenzen, **Boost mit Vorrat**, **Geschwindigkeitsbegrenzer**, zwei Betriebsarten **KAMPF/REISE**, **Landemodus mit Fahrwerk**. Schwerkraft, Luftwiderstand und Bodenhöhe kommen als Umgebungs-Eingang (`env`) von außen, im All heute null. Derselbe Kern läuft später im Spielserver und im Universums-Modus (`sim3d.js`).
- **Maus zielt, Schiff folgt:** Das Fadenkreuz ist eine Richtung im Raum und bewegt sich ohne Verzögerung mit der Maus (Zeigerfang). Das Schiff dreht mit klassenabhängiger Trägheit hinterher. Die Waffen schwenken bis zu einem kleinen Kegel und **treffen sich im Fadenkreuz** (Konvergenz). Die **Vorhaltemarke** zeigt, wohin man zielen muss.
- **Controller nach demselben Prinzip:** rechter Stick zielt (Drehraten mit Kurve), linker Stick schiebt, RT feuert, LT ist Präzisionszielen. Dazu eine sanfte **Zielhilfe** in drei Teilen: Zielbremse, Zielmitnahme, Waffenkegel. Abschaltbar, im PvP begrenzt.
- **Waffen im Hauptmodus werden gezielt:** echte Bolzen mit Fluggeschwindigkeit statt Trefferwürfel. Dauerschaden und Munitionsverbrauch bleiben gleich (4 Bolzen je Laser und Sekunde mit je einem Viertel Schaden, eine Munitionseinheit je 4 Bolzen). Der Taktikmodus würfelt weiter wie bisher.
- **Welt und KI werden 3D:** Gegner fliegen Anflüge mit Abdrehen, umkreisen in geneigten Bahnen, kommen von oben und unten. Kampf-Regie, Persönlichkeiten und angekündigte Spezialangriffe bleiben und werden räumlich.
- **Taktikmodus bleibt erhalten:** gleicher Sim-Zustand, eigener Steuerweg (heutiger `_movePlayer` unverändert in der Ebene auf Höhe des Spielers). Ein Goldtest sichert, dass die Klick-Flugbahn bitgenau gleich bleibt.
- **Einführung hinter einem Schalter** (`?flug=3d`, dann Einstellung „FLUGMODELL: NEU“), zuerst als **Fluglabor**, in dem Toni das Gefühl mit Reglern abnimmt, bevor Kampf, KI und Mehrspieler umgebaut werden.
- **Aufwand:** etwa 40–55 Arbeitstage in 11 Schritten. **Größte Risiken:** Orientierungsverlust in 3D, Balance von gezieltem Feuer gegen Trefferchance, KI, die in 3D dumm wirkt, Esc und Zeigerfang im Browser.
- **Offene Grundsatzentscheidung für Toni:** `ARCHITEKTUR-SANDBOX.md` 2.1 empfiehlt „Shooter dauerhaft 2D“. Dieser Auftrag kehrt das um. Abschnitt 1 begründet, warum das mit dem Architekturplan vereinbar bleibt.

---

## 1. Grundsatzentscheidung und Abgleich mit dem Architekturplan

`Planung/ARCHITEKTUR-SANDBOX.md` 2.1 hielt fest: Der Shooter bleibt 2D, der 3D-Flug kommt erst im Universum (Phase D2, `src/world/sim3d.js`). Tonis neuer Auftrag macht den 3D-Flug zum Hauptmodus des heutigen Spiels. Vorschlag zur Auflösung:

| Punkt | Entscheidung |
|---|---|
| Wo lebt das Flugmodell? | In einem **eigenen, dimensionsreinen Kern** `Code/src/flight/`. Der Shooter (`sim/world.js`) nutzt ihn ab jetzt, `src/world/sim3d.js` später auch. Phase D2 („Flug 6DOF und Landung“) bekommt dadurch einen großen Vorsprung, statt doppelt gebaut zu werden. |
| Bleibt der Klickflug? | Ja, als **Taktikmodus** mit eigenem Steuerweg über demselben Weltzustand. Begründung aus 2.1 bleibt gültig: Klickflug ist mobiltauglich und verträgt Latenz. |
| Netz | Das Protokoll in `ARCHITEKTUR-SANDBOX.md` 4.5 sieht bereits „Steuerung 6DOF: Schub i8 × 3, Drehung i8 × 3, Modus u8“ und `y`/Quaternion ab dem ersten Byte vor. Dieser Entwurf hält sich daran. |
| Rapier | Für das Fliegen nicht nötig. Der Flugkern rechnet selbst (Kugeln gegen Kugeln und Brocken). Rapier kommt erst mit Planetenboden und zu Fuß (D3). Die Schnittstelle `env.ground()` ist vorbereitet. |
| Renderer | Bleibt `WebGLRenderer` (r170). Nichts in diesem Entwurf braucht WebGPU. |

**Entscheidung 1 für Toni:** „Shooter wird 3D, Ebene als Nebenmodus“ (Empfehlung: ja, Punkt 4 in „Entscheidungen für Toni“ im Architekturplan wird damit ersetzt).

---

## 2. Recherche: Stand der Flugsteuerung in Star Citizen

Kurz recherchiert (WebSearch, 03.11.2026). Die gefundenen Quellen sind Wikis und Foren, teils älter als die aktuelle Version. Was nicht bestätigt werden konnte, ist markiert. Wir übernehmen **Systeme und Anspruch**, keine Namen.

| System in Star Citizen | Was es tut (Quelle) | Unser Gegenstück (eigener Name) |
|---|---|---|
| Master Modes NAV / SCM | Taste wechselt zwischen zwei Modi. SCM: Schilde, Waffen, hohe Kondensator-Ladung, **Höchsttempo gedeckelt**. NAV: viel höheres Tempo, Schilde und Waffen aus. Umschalten nicht sofort, NAV hat eine Anlaufzeit, Schilde fallen sofort. Boost/Nachbrenner trägt kurz über die SCM-Grenze, Nachbrenner-Höchsttempo etwa doppelt SCM. (starcitizen.tools, Forenbeiträge) | **KAMPF / REISE** |
| Gekoppelt / entkoppelt | Gekoppelt: „Flugzeug im All“, der Flugrechner hält die Bewegung in Nasenrichtung und bremst von selbst. Entkoppelt: Newton, das Schiff fliegt auf dem letzten Vektor weiter. Unter Master Modes bremst auch entkoppelt bei Überschreiten des Deckels. (starcitizen.tools Guide:Controls, Foren) | **Flugrechner GEKOPPELT / ENTKOPPELT** |
| Boost / Nachbrenner | Kurzzeitig mehr Schub und Tempo, Vorrat leert sich und lädt nach. | **BOOST** mit Vorratsbalken |
| Geschwindigkeitsbegrenzer | Mausrad verstellt die Höchstgeschwindigkeit, Schubhebel bezieht sich darauf. | **BEGRENZER** (Mausrad, Steuerkreuz) |
| Maus-Flug | Standard ist ein Mischmodus: die Maus steuert einen virtuellen Joystick, ein Fadenkreuz zeigt den Ausschlag. Mit Joystick lässt sich „Zielen mit der Maus“ für kardanische Waffen getrennt nutzen. (starcitizen.tools Guide:Controls) | **Maus zielt, Schiff folgt** (Abschnitt 5), Alternative „Virtueller Steuerknüppel“ |
| ESP (Enhanced Stick Precision) | Dämpft die Stick-Empfindlichkeit, wenn das Fadenkreuz einem Ziel nahe kommt, gegen Überschießen. Für Gamepad und Joystick gedacht, auch für Maus angepasst; Stärke und Kurve einstellbar. (starcitizen.tools/ESP, Patch-Notizen 0.9.2) | **Zielbremse** (Teil der Zielhilfe) |
| Kardanische Waffen, Zielhilfe | Kardanische Waffen folgen dem Mauszeiger, eine Unterstützung richtet sie auf die Vorhaltemarke aus. Umschaltbar (G, am Gamepad R3). (Fextralife-Steuerungsliste) | **Waffenkegel** zur Vorhaltemarke |
| Lande- und Präzisionsmodus | Eigener Modus (Taste N) mit stark begrenztem Tempo und Drehrate, Fahrwerk, Landehilfe; automatisches Landen auf Tastendruck. (Community-Leitfaden) | **LANDUNG** mit Fahrwerk (Abschnitt 13) |
| Gamepad-Zielhilfe in 4.x | **Nicht bestätigt.** Für die aktuelle Version fand sich keine Entwickleraussage zu einer Gamepad-Zielhilfe im Flug. | Eigene Zielhilfe in drei Teilen (Abschnitt 6.3) |

Quellen: [starcitizen.tools Guide:Controls](https://starcitizen.tools/Guide:Controls), [starcitizen.tools ESP](https://starcitizen.tools/ESP), [Design Notes Flight Model Alpha 2.0](https://starcitizen.tools/Comm-Link:Design_Notes_-_Flight_Model_Changes_in_Star_Citizen_Alpha_2.0), [Arena Commander 0.9.2 Patch-Notizen](https://robertsspaceindustries.com/comm-link/transmission/14258-Arena-Commander-092-Released), [Fextralife Controls](https://starcitizen.wiki.fextralife.com/Controls), [starcitizen.tools Keybinds](https://starcitizen.tools/Keybinds).

**Was wir bewusst anders machen:**
- Kein G-Bewusstlosigkeitsmodell, keine Treibstoffsorten, keine Kondensator-Aufteilung auf Waffen/Schilde/Triebwerke. Das wäre für einen Browser-Shooter mit DarkOrbit-Herkunft zu viel. Spätere Erweiterung bleibt möglich.
- Eine **Horizont-Hilfe** (Rollen zur Sektorebene, wenn nicht gerollt wird) ist für neue Piloten Standard. Toni kann sie abschalten.
- Ein **Beute-Traktor**, weil Kisten im 3D-Raum sonst Zielübungen wären.

---

## 3. Ist-Stand (gelesen, nicht vermutet)

| Bereich | Stand im Code | Folge für den Entwurf |
|---|---|---|
| Simulation `sim/world.js` (2.533 Zeilen) | Entitäten mit `x, z, vx, vz, rot`, Spieler mit `fs` (Tempo), `course`, `bank/pitch` nur als Anzeige. `_movePlayer` fährt einen Klick-Zielpunkt an: Spool, Beschleunigung mit Auslauf, Drehrate 2,6→1,5 rad/s, Grip 3,5. Fester Schritt 1/60 s (`config.STEP`). | Felder `y, vy` und Lage-Quaternion ergänzen. `rot` bleibt als abgeleiteter Kurs (Minikarte, Taktik, alter Code). `_movePlayer` bleibt für den Taktikmodus. |
| Laser `world._updateLasers` | Angriff an, Ziel in 650 m und ±75° vor der Nase, 1 Schuss je Laser und Sekunde, **Trefferchance** 85 % mit Abzügen für Entfernung und Querbewegung (`hitChance`), 8 % kritisch. | Im Hauptmodus durch gezielte Bolzen ersetzen, Taktik behält den Würfel. |
| KI `sim/ai.js` (869 Zeilen) | Zustände `wander/attack/hold/nest`, Stile `pack/swarm/ambush/kite/thief`, Kampf-Regie mit 3–4 aktiven Angreifern und drehendem Wartering (`directCombat`), Spezialangriffe mit Aufladen, Deckung hinter Brocken, Rückzug. Alles in x/z. | Bewegungsziele werden 3D-Vektoren, Verhalten bleibt (Abschnitt 9). |
| Raster `sim/spatial.js` | 2D-Raster über x/z. | Bleibt 2D (Welt ist eine flache Scheibe von ±1.500 m Höhe). Abfragen filtern danach in 3D. |
| Kamera `render/camrig.js` | Taktisch, Verfolger (gierfest, Neigung 15–21°, Rahmung je Klasse `CHASE_FRAME`), Cockpit (eigene Ebene `render/cockpit.js`, near 0,05 m). Federung, Sichtfeld-Kick, Trauma-Wackeln, Druckwellen, Umsehen. Kamera rollt nur leicht mit (`pv.bank`). | Verfolger und Cockpit bekommen eine echte 3D-Pose. Stöße, Druckwellen und Einstellungen bleiben. |
| Eingabe `input.js` | Verfolger: Maus-x bestimmt Kurs (`renderer.steerHeading`), W Dauerschub, S bremsen, A/D seitlich. Ctrl Angriff, Space Rakete, E Andocken, V Kamera. Zielpunkt alle 0,05 s per `moveTo`. | Neuer Steuerweg für den Hauptmodus, alte Wege bleiben für Taktik und Touch. |
| Controller `input/padflight.js`, `gamepad.js` | Linker Stick lenkt wie die Maus, RT Schub über `throttleDist`, LT bremsen, rechter Stick Kamera, A Angriff, X Rakete, Y Kontext. 73 Prüfungen in `tools/playtest/controller.mjs`. Runde Totzone, Kurve Exponent 1,6. | Neue Belegung für den Hauptmodus (Abschnitt 6.2), Taktik bleibt. |
| Mehrspieler `net/mp.js`, `mp-core.js`, `coop.js` | Supabase Realtime, 9 Hz, gepackt `[x, z, rot·100, kurs·100, tempo, hülle %, schild %, flags, ziel]`, 130 ms Puffer, lineare Interpolation, 250 ms Vorhersage. Koop: Gastgeber sendet 8×/s alle Gegner `[id, x, z, rot, hp, schild, lebt, rang]`. | Paket v2 mit Höhe, Quaternion, Geschwindigkeit, Hermite-Interpolation (Abschnitt 10). |
| Himmel `render/sky.js` | Verfolger: Rundumbild über `uInvProj` und Kameradrehung. | Trägt beliebige Lagen. Prüfen: Planetenkulisse und Sonne bei Blick nach unten. |
| Tempo-Staub `render/speeddust.js` | Wickelt nur waagrecht, Höhe fest (±95 m). | Auf 3D-Wickeln umstellen (eine Shaderzeile plus Box). |
| Ton `audio/audio.js` | `engine_loop` nach Schub/Tempo, `boost`-Geräusch vorhanden. | Erweitern um Steuerdüsen, Vorbeiflug, Treffermarke, Boost-Schleife (Abschnitt 4.4). |
| Testhaken | `window.__ls = { world, renderer, bus, hud, audio, series, mp, input, padFlight }` nur in DEV. `tief.mjs` startet Chrome **sichtbar** auf Port 5173. | Neue Prüfungen headless auf eigenem Port; `tief.mjs` bei Gelegenheit auf headless umstellen. |

---

## 4. Das Erlebnis: die ersten 60 Sekunden

Das ist der Maßstab für alles Weitere. Jede Zeile hat eine prüfbare Kennzahl (Abschnitt 4.5).

### 4.1 Mit Maus und Tastatur (Starter S1, Heimatsektor, Verfolger)

| Zeit | Was passiert | Was der Spieler fühlen soll | Woraus es entsteht |
|---|---|---|---|
| 0–3 s | Abdocken. Das Schiff gleitet aus der Station, der Zeiger verschwindet, mittig erscheinen Fadenkreuz und Bugkreuz. Unten der Hinweis `MAUS ZIELT · W SCHUB · SHIFT BOOST`. | „Ich sitze in etwas Echtem.“ | Abdock-Schub vorwärts mit 40 m/s, Kamera federt von nah auf Normalabstand, Triebwerk zündet hörbar (tiefer Einsatz, dann Brummen). |
| 3–8 s | Maus nach rechts oben. Das Fadenkreuz ist **sofort** dort, das Schiff dreht hinterher, die Kamera hängt ein wenig nach, die Steuerdüsen puffen sichtbar und hörbar an der linken Unterseite. | „Das Fadenkreuz gehorcht mir, das Schiff hat Masse.“ | Fadenkreuz im selben Bild wie das Mausereignis. Drehung S1 erreicht 63 % des Fehlers in 0,2 s. Rauchstöße an den Düsenankern. |
| 8–15 s | W gehalten. Schub baut sich in 0,25 s auf, Tempo steigt in 2,2 s auf 330 m/s. Staub zieht zu Strichen, Sichtfeld weitet sich um 4°, Triebwerkston steigt. | Tempo spüren. | Beschleunigung 150 m/s², Tempostaub, Sichtfeld-Kick, Kamera zieht um 8 % zurück. |
| 15–20 s | Shift. Boost-Stoß: dumpfer Schlag, Flamme wird lang und weiß, Kamera zittert leicht, Sichtfeld +8°. Boost-Balken unten läuft ab. | „Gleich bin ich da.“ | Schub ×1,5, Tempo bis 560 m/s, Boost-Vorrat 6 s. |
| 20–25 s | Raider-Rudel voraus, eine Kette roter Klammern, eine Vorhaltemarke springt vor die Nase des nächsten. Funkspruch. A/D und Leertaste/Strg: das Schiff schiebt seitlich und nach oben, ohne die Nase zu bewegen. | „Ich kann ausweichen, ohne das Ziel zu verlieren.“ | Seiten- und Vertikalschub 100 m/s², gekoppelter Flugrechner. |
| 25–40 s | Linksklick halten. Bolzen aus beiden Laserankern laufen im Fadenkreuz zusammen. Treffer: helles Kreuz am Fadenkreuz, kurzer trockener Klick, Schildwelle am Gegner an der Einschlagstelle. Ein Raider schießt vorbei, der Bolzen zischt links am Cockpit vorbei. | „Ich treffe, weil ich gut ziele.“ | Konvergenz auf Zielentfernung, Waffenkegel 1,5°, Treffermarke ≤ 1 Bild nach Treffer, Vorbeiflug-Ton bei < 40 m. |
| 40–50 s | Raider zieht nach oben weg und kurvt hinter den Spieler. Pfeil am Fadenkreuzrand zeigt nach unten hinten. Spieler zieht die Nase hoch und rollt mit Q, findet ihn wieder. | „Der Gegner fliegt wirklich, ich muss mithalten.“ | KI-Anflug mit Abdrehen in 3D, Randpfeil, Horizont-Hilfe hält die Lage lesbar. |
| 50–60 s | Abschuss: größeres Treffersymbol, satter Knall, Druckwelle schüttelt die Kamera, Trümmer fliegen räumlich auseinander, Wrack funkelt. Spieler fliegt hin, der Traktor zieht die Beute in den letzten 150 m herein. | Belohnung. | Explosion je Typ (gibt es), Druckwelle (gibt es), Traktor (neu). |

### 4.2 Mit Controller (gleiche Szene)

- 3–8 s: Rechter Stick nach rechts oben. Die Drehrate steigt mit der Stickkurve weich an, voller Ausschlag gibt volle Drehrate. Kein Fadenkreuz-Versatz zum Bugkreuz: am Controller **ist** das Fadenkreuz die Nase (plus ein kleiner Vorlauf in Drehrichtung, damit es nicht klebt).
- 8–15 s: Linker Stick nach vorn = Schub (stufenlos). L3 drücken = Boost.
- 25–40 s: Fadenkreuz kommt in die Nähe des Ziels: die **Zielbremse** dämpft die Drehrate auf 55 %, man überschießt nicht. Fliegt das Ziel quer, nimmt die **Zielmitnahme** einen Teil der Zielbewegung mit, aber nur solange der Stick bewegt wird. LT halten = Präzisionszielen: Sichtfeld −8°, Empfindlichkeit ×0,6, Waffenkegel 4°. RT feuert, der Controller rumpelt leicht bei jedem eigenen Treffer (abschaltbar, gibt es schon für Schaden).
- Ziel: Ein durchschnittlicher Controller-Spieler hat **gleich viel Spaß wie mit Maus**, trifft aber etwas schlechter (Messgröße: Trefferquote Controller ≥ 85 % der Maus-Quote im Bot-Test mit Mensch-Modell).

### 4.3 Kamera, Trägheit, Tempo, Treffer: die Gefühlsbausteine

| Baustein | Umsetzung | Grenzen (gegen Übelkeit) |
|---|---|---|
| Trägheit des Schiffs | Drehung über Drehraten und Drehbeschleunigung je Klasse, nie sofort. Linear mit Achsenschub je Richtung. | Keine Schwingungen: Regler kritisch gedämpft. |
| Kamera-Nachlauf | Verfolger hängt an einer gedämpften Feder im Schiffsrahmen. Drehung folgt mit 10/s (S1) bis 5/s (S8). Rollen folgt zu 70 %. | „Bewegung reduzieren“: Rollen nur 30 %, Federweg ×0,35 (wie heute `motion`). |
| Beschleunigung spüren | Kamera zieht bei Schub zurück (bis 8 % Abstand), rückt beim Bremsen vor (5 %), versetzt sich gegen Seitenschub (4 %). Cockpit: Kopf wird bis 6 cm gegen die Beschleunigung gedrückt. | Weg begrenzt, weich. |
| Tempo | Tempostaub in 3D, Lichtstreifen, Sichtfeld-Kick ab 55 % Tempo (bis +4°), Boost +8°, Triebwerkston. Nahe Brocken und Trümmer geben Bezug. | Sichtfeld-Kick mit `motion` gedämpft. |
| Treffer geben | Treffermarke am Fadenkreuz (weiß Hülle, Fraktionsfarbe Schild), Klick-Ton, Schildwelle an der Einschlagstelle, Schadenszahl (gibt es), beim Abschuss großes Symbol und tiefer Ton. | Keine Zeitlupe (Mehrspieler). |
| Treffer nehmen | Kamerastoß aus Trefferrichtung (gibt es, wird 3D), roter Richtungsbogen um das Fadenkreuz, Rumpeln, Funkenschlag im Cockpit, Randabdunklung bei niedriger Hülle. | Stoßstärke begrenzt. |
| Ton | Siehe 4.4. | Lautstärken gestaffelt. |
| Orientierung | Horizont-Hilfe, Sektorebene als Horizontlinie mit Leiter, Höhenanzeige `EBENE +240`, Randpfeile, Radar mit Höhenstielen. | Horizont-Hilfe für neue Piloten Standard. |

### 4.4 Ton

| Klang | Auslöser | Technik |
|---|---|---|
| Triebwerk | Schub und Tempo, Tonhöhe und Filter folgen | vorhandene Schleife `engine_loop`, zusätzlich `playbackRate` 0,85–1,25 und Tiefpass 900–6.000 Hz |
| Steuerdüsen | Beginn einer Dreh- oder Seitenschub-Änderung über Schwelle | kurze Rausch-Stöße, je Seite im Stereobild, höchstens 8/s |
| Boost | Start (Schlag), Schleife (Fauchen), Ende, Vorrat leer (trockenes Klicken) | vorhandenes `boost` plus neue Schleife |
| Eigene Laser | je Bolzen, links/rechts nach Anker im Stereobild | vorhandene Laser-Klänge, Lautstärke nach Laserzahl gedeckelt |
| Treffermarke | eigener Treffer: hell; Schild durch: tiefer; Abschuss: Bass | neu, sehr kurz (< 80 ms) |
| Vorbeiflug | feindlicher Bolzen kommt näher als 40 m an die Kamera | neu, Doppler über `PannerNode` (`equalpower`), höchstens 4 gleichzeitig |
| Aufschaltung | Rakete: Aufschalten läuft, Aufschaltung steht | zwei Töne |
| Warnungen | Hülle < 30 %, Kollision voraus, REISE nicht möglich | vorhandener Warnstil |

Kosten: höchstens 24 Stimmen, kein HRTF (zu teuer auf Mobilgeräten), alles über den bestehenden Mischer.

### 4.5 Gefühls-Kennzahlen (Abnahme)

Gemessen im Flugkern (Selbsttest) und im Fluglabor (headless):

| Kennzahl | S1 | S4 | S8 |
|---|---|---|---|
| Fadenkreuz-Latenz (Mausereignis bis Bild) | ≤ 1 Bild | ≤ 1 Bild | ≤ 1 Bild |
| Nase erreicht 63 % eines 20°-Zielfehlers | ≤ 0,22 s | ≤ 0,42 s | ≤ 0,8 s |
| 180°-Wende im Stand (Gieren) | 2,1 s | 3,1 s | 6,7 s |
| 0 → KAMPF-Höchsttempo | 2,2 s | 2,9 s | 5,1 s |
| Bremsweg aus KAMPF-Höchsttempo, gekoppelt, ohne Raumbremse | 495 m | 605 m | 955 m |
| Boost-Dauer / Nachladen leer→voll | 6 s / 9 s | 7 s / 11 s | 9 s / 15 s |
| Zeit bis Abschuss Raider mit Startausrüstung (Bot mit Menschenmodell) | 6–14 s | – | – |
| Treffermarke nach Sim-Treffer | ≤ 1 Bild | | |

---

## 5. Simulationsmodell (Flugkern)

### 5.1 Ort und Form

```
Code/src/flight/
  core.js      Zustand anlegen, step(state, cmd, P, env, h) – rein, ohne DOM, ohne three.js
  params.js    Klassenwerte S1–S8, Gegner-Wendigkeit, Modus-Faktoren
  aim.js       Vorhalt, Konvergenz, Waffenkegel, Zielhilfe (reine Mathematik)
  landing.js   Fahrwerk, Höhe über Grund, Aufsetzen, Schwebehilfe
  vec.js       kleine Vektor-/Quaternion-Helfer auf Float64Array (keine three.js-Abhängigkeit, läuft in Node)
  net.js       Packen/Entpacken v2, Hermite-Interpolation (ersetzt Teile von mp-core.js)
```

Läuft in Browser, Worker und Node (Selbsttest, späterer Server). Kein `Math.random` im Kern, keine Speicher-Neuanlage je Schritt.

### 5.2 Zustand

Je fliegendem Spielerschiff ein `Float64Array` plus kleine Flags (schnell zu kopieren für spätere Vorhersage und Rückspulen):

| Feld | Bedeutung | Einheit |
|---|---|---|
| `px, py, pz` | Ort im Rahmen `frame` (heute: Sektor) | m |
| `vx, vy, vz` | Geschwindigkeit (Welt) | m/s |
| `qx, qy, qz, qw` | Lage (Einheitsquaternion), Bug = −z lokal (wie heute `rot`-Konvention), oben = +y | – |
| `wx, wy, wz` | Drehrate im **Schiffsrahmen** (Nicken, Gieren, Rollen) | rad/s |
| `boost` | Vorrat 0..1 | – |
| `boostOn`, `boostLock` | Boost aktiv, gesperrt bis 25 % nach Leerlauf | – |
| `mode` | 0 = KAMPF, 1 = REISE | – |
| `spool` | Fortschritt Moduswechsel 0..1 | – |
| `coupled` | Flugrechner gekoppelt | – |
| `limiter` | Begrenzer in m/s (0..Modus-Höchsttempo) | m/s |
| `gear` | Fahrwerk 0..1 (Animation, Landelogik) | – |
| `landing` | Landemodus an | – |
| `landed` | aufgesetzt (Bewegung eingefroren relativ zum Rahmen) | – |
| `thr[6]` | Düsenauslastung je Richtung (+x −x +y −y +z −z) für Grafik und Ton | 0..1 |
| `rcs[3]` | Drehdüsen-Auslastung je Achse (vorzeichenbehaftet) | −1..1 |
| `frame` | Bezugsrahmen-Id (heute immer 0 = Sektor) | – |

Auf der Entität bleiben die alten Felder erhalten und werden **abgeleitet**: `x = px`, `z = pz`, `y = py` (neu), `rot = atan2(-fx, -fz)` aus der Bugrichtung, `speed = |v|`, `bank`/`pitch` aus der Lage (für Taktik-Grafik und Minikarte). Damit laufen Minikarte, Quests, Radio, Ereignisse und alles, was `x/z/rot` liest, unverändert weiter.

### 5.3 Steuerbefehl (6DOF-Absicht)

Der Befehl ist das, was später über das Netz geht (passt zu `ARCHITEKTUR-SANDBOX.md` 4.5):

```
cmd = {
  tx, ty, tz    // Schub rechts / hoch / vor, je −1..1 (Tastatur ±1, Stick stufenlos)
  aimMode       // 0 = Drehraten, 1 = Zielrichtung
  rx, ry, rz    // Drehraten-Befehl −1..1 (Nicken, Gieren, Rollen)        bei aimMode 0
  ax, ay, az    // Zielrichtung als Einheitsvektor in Weltkoordinaten       bei aimMode 1 (Rollen weiter über rz)
  boost, brake  // gehalten
  flags         // Moduswunsch, Kopplung, Landemodus, Fahrwerk (Flanken)
}
```

Netz: Schub i8 × 3, Drehung i8 × 3 **oder** Zielrichtung 2 × i16 (Kugelkoordinaten), Flags u8.

### 5.4 Integrator

Fester Teilschritt **h = 1/120 s** für das Spielerschiff (zwei Teilschritte je Sim-Schritt von 1/60 s). Begründung: Bei 120-Hz-Bildschirmen (MacBook M5 ProMotion, Windows 144 Hz) halbiert das die Verzögerung der Schiffsdrehung, kostet aber nur etwa 3 µs je Teilschritt. Gegner rechnen mit 1/60 s.

Je Teilschritt, in dieser Reihenfolge (deterministisch):

1. **Moduswechsel und Boost fortschreiben.** `spool` läuft, Boost-Vorrat sinkt bzw. lädt nach 1,0 s Pause nach.
2. **Soll-Drehrate** im Schiffsrahmen:
   - Drehraten-Modus (Controller, virtueller Steuerknüppel): `ω_soll = r · ω_max · boostK` je Achse.
   - Zielrichtungs-Modus (Maus): Fehlerwinkel zwischen Bug und Zielrichtung, aufgeteilt auf Nick- und Gierachse im Schiffsrahmen. `ω_soll = clamp(Kp · Fehler, ±ω_max)`; Kp je Klasse (Tabelle 5.6). Nahe am Ziel (< 0,5°) wird Kp weich auf 0,6·Kp gesenkt, damit die Nase nicht zittert.
   - Rollen: `rz` direkt. Ohne Rolleingabe und mit **Horizont-Hilfe**: Soll-Rollrate dreht „oben“ des Schiffs zur Sektor-Oberseite, mit 0,6 rad/s höchstens, nur solange der Bug weniger als 60° gegen die Ebene geneigt ist (sonst kein definierter Horizont).
3. **Drehbeschleunigung begrenzen:** `Δω = clamp(ω_soll − ω, ±α_max · h)` je Achse, `ω += Δω`. Das ist ein Raten-Regler ohne Überschwingen. `rcs[]` = `Δω / (α_max · h)` für Grafik und Ton.
4. **Lage fortschreiben:** `q ← normalize(q + ½ · h · q ⊗ (ω, 0))`. Normieren in jedem Teilschritt (Fehler bleibt < 1e-12).
5. **Schub im Schiffsrahmen:** `v_s = Rᵀ(q) · v`.
   - **Gekoppelt:** Soll-Geschwindigkeit im Schiffsrahmen `v_soll = (tx · v_seite, ty · v_vert, tz≥0 ? tz · limiter : tz · v_rück)`. Nicht gedrückte Achsen haben Soll 0, der Flugrechner bremst sie weg (Driften läuft aus). Je Achse `a = clamp((v_soll − v_s) / h, −a_neg, +a_pos)`.
   - **Entkoppelt:** `a = t · a_achse` direkt (Newton). Keine Achse wird von selbst gebremst.
   - **Raumbremse** (beide Modi): Soll 0 auf allen Achsen, Grenzen × 1,3.
   - Boost: alle Linear-Grenzen × `boostSchub` (1,5).
   - `thr[]` aus `|a| / a_grenze`.
6. **Äußere Kräfte** (Welt): `a_welt = R(q) · a + env.gravity + drag`, mit `drag = −½ ρ c_d A / m · |v| · v` (im All ρ = 0).
7. **Tempodeckel** wie im Vorbild auch entkoppelt: `cap = Modus-Höchsttempo` bzw. Boost-Höchsttempo. Liegt `|v|` darüber, wird der Überschuss weich abgebaut: `v −= v̂ · (|v| − cap) · (1 − e^(−3h))`. Kein harter Schnitt, damit Stöße (Treffer, Explosion) sichtbar bleiben.
8. **Semi-implizit Euler:** `v += a_welt · h`, `p += v · h`.
9. **Kollision** (Kugel gegen Brocken, Station, große Gegner): Eindringen zu 35 % je Teilschritt auflösen (wie heute), Normalanteil × 0,8 reflektieren, ab Aufprall > 80 m/s Schaden (1 % Hülle je 20 m/s) und Kamerastoß.
10. **Landelogik** (nur bei `landing`): siehe Abschnitt 13.

Semi-implizites Euler ist bei diesen Kräften stabil und genau genug (keine Federn im Kern). Ein Selbsttest prüft, dass 100.000 Teilschritte ohne Eingabe Energie und Lage nicht verändern (entkoppelt) bzw. auf 0 bremsen (gekoppelt).

### 5.5 Betriebsarten

| | KAMPF | REISE | LANDUNG |
|---|---|---|---|
| Höchsttempo | Tabelle `vK` | Tabelle `vR` (≈ 2,8 × KAMPF) | 60 m/s waagrecht, 20 m/s senkrecht |
| Boost | bis `vB` | nur Beschleunigung, kein höheres Tempo | aus |
| Waffen, Raketen, Fähigkeiten | an | **aus** | aus |
| Schildaufladung | normal | **pausiert** (Schild bleibt, lädt nicht) | normal |
| Drehraten | 100 % | 60 % | 50 % |
| Wechsel dauert | REISE→KAMPF 0,8 s | KAMPF→REISE 1,5 s, im Kampf (`inCombat`) 3,5 s | aus KAMPF 0,6 s, Fahrwerk 1,5 s |

REISE ersetzt im Sektor das lange Geradeausfliegen (Sektoren sind 6–8 km groß, Tore liegen weit auseinander). Autopilot (H) und Sprungtore bleiben, wie sie sind.

### 5.6 Werte je Schiffsklasse

Die Spalte „Tempo heute“ ist `SHIPS[k].speed` aus `core/data.js` und gilt **im Taktikmodus unverändert weiter**. Für den Hauptmodus bekommt jede Klasse einen Block `flight` in `data.js` (oder `flight/params.js`, Schlüssel = Schiffs-Id). Leitlinie: S1–S2 wendig wie Jäger, S5–S8 schwer und mächtig, aber mit Boost noch schneller als jeder normale Gegner.

| Klasse | Tempo heute | KAMPF `vK` | REISE `vR` | Boost `vB` | Schub vor | Schub rück | seitlich | vertikal | Nicken/Gieren | Rollen | Drehbeschl. | Kp | Boost Dauer / Nachladen |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | m/s | m/s | m/s | m/s | m/s² | m/s² | m/s² | m/s² | °/s | °/s | °/s² | 1/s | s |
| S1 Starter | 320 | 330 | 920 | 560 | 150 | 110 | 100 | 100 | 95 | 210 | 520 | 5,5 | 6 / 9 |
| S2 Courier | 300 | 345 | 980 | 600 | 145 | 105 | 95 | 95 | 88 | 190 | 460 | 5,2 | 6,5 / 10 |
| S3 Warden | 290 | 320 | 900 | 530 | 125 | 92 | 82 | 82 | 74 | 160 | 380 | 4,4 | 6,5 / 10 |
| S4 Halberd | 295 | 315 | 880 | 515 | 110 | 82 | 72 | 72 | 62 | 130 | 300 | 3,7 | 7 / 11 |
| S5 Bastion | 300 | 305 | 860 | 495 | 90 | 68 | 58 | 58 | 50 | 100 | 220 | 3,0 | 7,5 / 12 |
| S6 Rampart | 305 | 300 | 850 | 485 | 78 | 60 | 50 | 50 | 42 | 80 | 170 | 2,6 | 8 / 13 |
| S7 Monarch | 310 | 295 | 840 | 475 | 66 | 52 | 42 | 42 | 35 | 65 | 130 | 2,2 | 8,5 / 14 |
| S8 Leviathan | 320 | 290 | 830 | 465 | 57 | 44 | 35 | 35 | 28 | 50 | 100 | 1,8 | 9 / 15 |

Gemeinsam: Boost-Schubfaktor 1,5, Boost-Drehfaktor 1,2, Raumbremse 1,3, Boost-Sperre bis 25 % Vorrat nach Leerlauf, Nachlade-Pause 1,0 s. Hitbox = `radius` wie heute (Kugel), für lange Rümpfe (S6–S8) zwei bis drei Kugeln entlang der Längsachse (aus den Modellmaßen, `SCHIFFSQUALITAET.md`).

Prüfung der Leitlinie gegen die schnellsten Gegner: Corsair 320, Hunter 300, Stalker 290 m/s. S8 ist im KAMPF langsamer als diese drei, mit Boost (465) entkommt es. Das ist gewollt: Schwere Schiffe kämpfen, statt wegzulaufen.

**Entscheidung 2 für Toni:** Tempo im Hub-Shop zeigt künftig KAMPF-Tempo und Wendigkeit (zwei Balken) statt nur einer Zahl.

### 5.7 Gegner im Flugkern

Gegner bekommen kein volles 6DOF, sondern einen **leichten Flugkern** (`flight/core.js`, Funktion `stepAgent`): Punktmasse mit Geschwindigkeit in 3D, Lage aus der Bugrichtung (Gieren und Nicken mit Drehratengrenze), Rollen nur als Grafik aus der Kurvenrate (wie heute `bank`). Kosten je Gegner und Schritt etwa 0,4 µs.

| Gruppe (Stil) | Typen | Drehrate °/s | Beschl. × Tempo/s | vertikal bevorzugt | Besonderheit |
|---|---|---|---|---|---|
| Jäger (`pack`) | raider, merc, boarder, hunter | 110 | 1,1 | mittel | Anflug mit Abdrehen |
| Lauerer (`ambush`) | jackal, stalker | 130 | 1,4 | stark (von unten) | Sprungangriff in 3D |
| Distanz (`kite`) | spiker, spitter, jammer, minelayer, queen | 60 | 0,7 | schwach | hält Abstand, schiebt seitlich |
| Schwarm (`swarm`) | larva, breeder, symbiont, tender, wal | 150 | 1,6 | Kugelschale | umzingelt räumlich |
| Diebe (`thief`) | vulture, corsair | 120 | 1,3 | mittel | flieht über/unter Hindernisse |
| Großkampf | colossus, werft, dread | 15–25 | 0,3 | kaum | dreht Breitseite zum Ziel |

Die Zahlen sind Startwerte für das Fluglabor; vorhandene Felder `speed`, `range`, `radius` bleiben.

---

## 6. Eingabe

### 6.1 Maus und Tastatur (Hauptmodus: Verfolger und Cockpit)

**Zeigerfang:** Beim Wechsel in den Hauptmodus (V, Abdocken, Klick auf die Spielfläche) wird `canvas.requestPointerLock({ unadjustedMovement: true })` angefordert (ohne Betriebssystem-Beschleunigung, wo der Browser es kann, sonst normal). Tastendruck V und Klick zählen als Nutzergeste.

**Maus zielt (Standard):** Mausweg dreht die **Zielrichtung** (Weltvektor) um die Kamera-Achsen, Empfindlichkeit in Grad je 100 px (Standard 9°). Die Zielrichtung darf höchstens **30° (S1) bis 22° (S8)** vom Bug abweichen (Lenkkegel). Wer weiter schiebt, bleibt am Kegelrand, das Schiff dreht mit voller Rate. Weil die Zielrichtung im Raum fest ist, bleibt das Fadenkreuz auf dem Ziel, während das Schiff nachdreht.

**Alternative „Virtueller Steuerknüppel“** (Einstellung): Mausversatz aus der Mitte (Kreis 30 % der Bildhöhe) ist die Drehrate, kein Zurückfedern. Für Spieler, die das Vorbild genau so gewohnt sind.

| Taste | Hauptmodus | Taktik (unverändert) |
|---|---|---|
| Maus bewegen | Zielen (Fadenkreuz), Schiff folgt | Zeiger |
| Linke Maustaste halten | **Waffen feuern** | hinfliegen / Ziel wählen |
| Rechte Maustaste | Rakete auf Ziel; halten (0,8 s) auf Gegner unter dem Fadenkreuz = aufschalten, loslassen = Start | – |
| Mittlere Maustaste halten | Umsehen (Kurs und Zielrichtung bleiben) | – |
| Mausrad | **Begrenzer** ±10 m/s je Raste (Anzeige links) | Zoom |
| W / S | Schub vor / rückwärts (halten) | bildbezogen fliegen |
| A / D | Seitenschub links / rechts | bildbezogen fliegen |
| Leertaste / Strg | Schub hoch / runter | Rakete / Angriff |
| Q / E | Rollen links / rechts | – / Andocken |
| Shift | **Boost** (halten) | – |
| X | Raumbremse (halten) | – |
| C | Flugrechner **gekoppelt/entkoppelt** | – |
| B | REISE / KAMPF (halten 0,3 s, verhindert Versehen; B kurz bleibt Fernhandel) | Fernhandel |
| N | **Landemodus** (Fahrwerk) | – |
| G | Tempomat: aktuelles Tempo halten (W/S verstellen dann den Hebel) | – |
| F | **Kontext**: Andocken (sichere Zone), Springen (Tor), Beute anfliegen | (E/J bleiben) |
| T | Ziel unter dem Fadenkreuz (kleinster Winkel, höchstens 12°) | – |
| Tab / Umschalt+Tab | nächstes / voriges Ziel | nächstes Ziel |
| R | Rakete (wie Rechtsklick) | Rakete |
| 1–6, Alt+1–5 | Munition, Schnellleiste (wie heute) | wie heute |
| Alt halten | **Zeiger frei** (HUD-Fenster bedienen, Schiff hält Kurs) | – |
| V | Kamera: Verfolger → Cockpit → Taktisch | wie heute |
| H, J, M, Esc | wie heute | wie heute |

Konflikte gelöst: Leertaste und Strg sind im Hauptmodus Vertikalschub (wie im Vorbild); Rakete wandert auf Rechtsklick/R, Angriff entfällt (Feuern ist Linksklick). E ist Rollen, Andocken geht über F (und weiter über E im Taktikmodus). Der Flug-Coach und die SYSTEM-Reihe zeigen die Tasten je Modus (Abschnitt 14).

**Esc und Zeigerfang:** Der Browser gibt den Zeiger bei Esc immer frei. Deshalb öffnet der Verlust des Zeigerfangs (`pointerlockchange` ohne eigenen Grund) das Bordmenü, genau wie Esc heute. Schließen des Menüs fordert den Zeigerfang mit dem Klick auf „Weiter“ neu an. Steht der Zeiger frei (Alt), zeigt das HUD `ALT · ZEIGER FREI`.

**Schubhebel-Art** (Einstellung): „Halten“ (Standard wie im Vorbild, loslassen = gekoppelt auf 0 bremsen) oder „Hebel“ (W/S verstellen einen Hebel 0–100 %, der stehen bleibt, ähnlich dem heutigen Dauerschub). Tempomat G schaltet „Halten“ vorübergehend auf „Hebel“.

**Trackpad am Mac:** eigene Empfindlichkeitsvoreinstellung, Zweifinger-Wischen = Begrenzer. Ehrlich: Mit Trackpad ist Kampf mühsam. Der Coach empfiehlt beim ersten Flug ohne Maus den Controller oder den Taktikmodus.

### 6.2 Controller (Xbox · PlayStation)

Gleiches Prinzip, aber Drehraten statt Zielrichtung (`aimMode 0`), mit Kurve und Zielhilfe.

| Controller | Hauptmodus | Taktik (unverändert) |
|---|---|---|
| Linker Stick | Schub vor/zurück (Y), seitlich (X) | bildbezogen fliegen |
| LB halten + linker Stick | hoch/runter (Y), rollen (X) | – (LB voriges Ziel) |
| L3 | Boost (halten) | Dauerschub |
| Rechter Stick | **Nicken / Gieren** (Exponent 1,6, Zielbremse) | Zoom |
| R3 kurz / halten | Kamera wechseln / umsehen mit rechtem Stick | Kamera wechseln |
| RT | **Waffen feuern** (ab 15 % Zug) | Schub |
| LT | **Präzisionszielen**: Sichtfeld −8°, Drehrate × 0,6, Waffenkegel 4°, Ziel nahe Fadenkreuz wird aufgeschaltet | bremsen |
| A halten | Raumbremse | Angriff |
| X | Rakete | Rakete |
| Y / Y halten | Kontext / Autopilot heim | gleich |
| B kurz / B halten 0,5 s | Ziel lösen / gekoppelt↔entkoppelt | Abbrechen |
| RB kurz | nächstes Ziel (Gegner im Blickkegel zuerst) | nächstes Ziel |
| RB halten + A | Schnellleiste auslösen (bleibt) | gleich |
| Steuerkreuz kurz | Schnellleiste (bleibt) | gleich |
| Steuerkreuz ▴ halten 0,4 s | REISE / KAMPF | – |
| Steuerkreuz ▾ halten 0,4 s | Landemodus | – |
| Steuerkreuz ◂ ▸ halten | Begrenzer −/+ | – |
| MENU / VIEW | Bordmenü / Karte | gleich |

Drehrate aus dem Stick: `r = sign(s) · |s|^1,6 · Empfindlichkeit`, runde Totzone wie heute. Am Controller liegt das Fadenkreuz auf der Bugachse, um höchstens 3° in Drehrichtung vorgelegt (wirkt lebendiger).

### 6.3 Zielhilfe (Controller voll, Maus nur Waffenkegel, Touch stark)

Alle drei Teile wirken nur auf **gültige Ziele** (Gegner, PvP-Spieler bei PvP) im Umkreis der Waffenreichweite × 1,2 und vor dem Schiff.

1. **Zielbremse:** Liegt die Vorhaltemarke innerhalb eines Kegels von `max(1,2°, 2,5 × Winkelradius des Ziels)` um das Fadenkreuz, wird die Stick-Drehrate weich auf **55 %** gesenkt (Kurve smoothstep über den Kegelrand). Gegen Überschießen.
2. **Zielmitnahme:** Bewegt sich die Vorhaltemarke relativ zum Fadenkreuz mit Winkelgeschwindigkeit `ω_pip`, wird `k · ω_pip` zur Soll-Drehrate addiert, mit `k = 0,35` (Standard). **Nur solange der rechte Stick ausgelenkt ist** (> Totzone). Ohne Eingabe zieht nichts. Nie mehr als 40 % der Klassen-Drehrate.
3. **Waffenkegel:** Jeder Laser darf von der Konvergenzrichtung bis zu einem Kegel abweichen, um auf die Vorhaltemarke zu zielen: Maus 1,5°, Controller 2,5°, mit LT 4°, Touch 7°.

Einstellung **ZIELHILFE**: AUS / NIEDRIG (Zielbremse 75 %, k = 0,15, Kegel −40 %) / STANDARD / HOCH (Zielbremse 45 %, k = 0,5). **PvP:** Gegen Spieler gilt höchstens NIEDRIG, Mitnahme aus. Zielhilfe-Stufe steht in den Flags des Netzzustands (Anzeige in der Spielerliste).

### 6.4 Touch (abgestuft, „nur nicht kaputt machen“)

- **Telefon (< 760 px Breite):** Standardansicht bleibt **Taktisch** wie heute. Verfolger ist wählbar mit **„Assistiertem Flug“**: Joystick links = Drehrate (Nicken/Gieren), Schub-Schieber rechts am Rand, großer Feuerknopf mit Waffenkegel 7° und Zielwahl „nächster vorn“. Horizont-Hilfe immer an, kein Rollen, kein Seitenschub, kein Cockpit.
- **Tablet:** wie Telefon, zusätzlich rechte Bildhälfte ziehen = Zielen (wie Maus, relativ), Knopf BOOST.
- `hud-touch.js` behält alle Knöpfe, ANSICHT schaltet wie V. Pinch-Zoom nur im Taktikmodus.

---

## 7. Kamera

### 7.1 Verfolger (Standard)

- **Anlenkpunkt:** Schiffsrahmen. Abstand `d` aus `CHASE_FRAME` (heute 88–156 m je Klasse), Höhe **6°** über der Bugachse (statt 15–21°: im 3D-Flug zielt man nach vorn, nicht von oben), Schiff im Bild bei y ≈ −0,18 (unteres Drittel), damit Fadenkreuz und Ziel frei liegen.
- **Blickrichtung:** Mischung aus Bug und Zielrichtung, 35 % Zielrichtung. Das Fadenkreuz wandert nie weit aus der Bildmitte.
- **Feder:** Ort als kritisch gedämpfte Feder im Schiffsrahmen (ω = 9/s S1 … 5/s S8), Drehung als Slerp mit 10/s … 5/s, Rollen folgt zu 70 % (Cockpit 100 %).
- **Beschleunigung:** Rückzug bis +8 % `d` bei vollem Schub, +10 % bei Boost; Vorrücken −5 % beim Bremsen; Seitenversatz gegen Seitenschub bis 4 % `d`.
- **Sichtfeld:** Standard **70°** (heute 58°: zu eng für Kurvenkampf in 3D), einstellbar 55–90° (`fovChase` in `engine/settings.js` erweitern). Tempo-Kick bis +4°, Boost +8°, LT −8°, Schusspuls wie heute.
- **Wackeln:** Trauma-Modell, Stöße, Druckwellen (gibt es) jetzt mit 3D-Richtung. Boost hält ein leichtes Grundzittern (gibt es).
- **Kampf-Rahmung:** Ist ein Ziel aufgeschaltet und außerhalb des Bildes, schwenkt die Kamera **nicht** von selbst (würde dem Zielen widersprechen). Stattdessen Randpfeil. Optional „Zielverfolgung“ (Einstellung): Kamera dreht bis 25° zum Ziel.
- `CHASE_FRAME` und die Größenprüfung `tools/bilder/groessen.mjs` bekommen eine 3D-Rahmung (Neigung 6°) als zweite Prüfreihe.

### 7.2 Cockpit

- Eigene Ebene wie heute (`render/cockpit.js`, near 0,05 m), Kamera am Pilotenauge.
- **Kopfträgheit:** Versatz `−a_schiff · 0,0006 m` je m/s², höchstens 6 cm, Drehung bis 2° in Kurven, Federung 12/s. Abschaltbar („Kopfbewegung“).
- Umsehen: mittlere Maustaste oder R3 halten (gibt es: `lookBy`, ±109° gieren, −34°/+40° nicken), federt zurück. Neu: Blick auf ein aufgeschaltetes Ziel per Doppeltipp auf T („Zielblick“, nur solange gehalten).
- Instrumente: Abschnitt 12.

### 7.3 Übergänge

| Von → Nach | Dauer | Ablauf |
|---|---|---|
| Verfolger → Cockpit | 0,45 s | Kamera fährt in die Kanzel, Sichtfeld blendet auf Cockpitwert, Außenmodell blendet aus |
| Cockpit → Taktisch | 0,9 s | Kamera steigt auf, Zeigerfang wird freigegeben, Schiff richtet sich in 1,2 s waagrecht aus (Rollen und Nicken auf 0), Steuerweg wechselt auf Klickflug in der Ebene auf aktueller Höhe |
| Taktisch → Verfolger | 0,9 s | Kamera senkt sich hinter das Schiff, Zielrichtung = Bug, Zeigerfang wird angefordert (V ist die Nutzergeste) |
| Andocken / Sprung | wie heute | Hauptmodus und Taktik nutzen dieselben Animationen |

Während eines Übergangs werden Waffen nicht unterbrochen, aber die Zielrichtung ist eingefroren.

---

## 8. Waffen und Zielen

### 8.1 Bolzen statt Würfel (Hauptmodus)

- Jeder Laser feuert im Hauptmodus **4 Bolzen je Sekunde mit je einem Viertel des Schadens** (Dauerschaden wie heute: 1 Schuss je Sekunde). Versatz zwischen Lasern wie `LASER_STAGGER`, kleiner Zufall wie `LASER_JITTER` (aus `world.rng`, also deterministisch).
- **Munition:** Ein Zähler je Laser zählt Viertel. Je 4 Bolzen wird eine Einheit wie heute abgezogen. Preise und Verbrauch bleiben gleich.
- **Bolzentempo** je Lasertyp: pulse 2.200 m/s, ion 2.400, plasma 2.000 (schwer, sichtbar), gamma 2.800. Reichweite 650 m wie `PLAYER_RANGE`, danach verlöscht der Bolzen (Flugzeit ≈ 0,23–0,33 s).
- **Treffer:** Strahl von alt nach neu je Sim-Schritt gegen Trefferkugeln der Ziele (Raster-Abfrage entlang der Strecke). Bolzen erben die Geschwindigkeit des Schützen nicht (lesbarer, wie im Genre üblich).
- **Kritisch** 8 %, SAB/SAL wie heute. SAL-Salve bleibt als schnelle Bolzensalve.
- **Brocken** fangen Bolzen ab (vorhandene Deckungslogik, jetzt geometrisch).
- Ein Treffer auf einen nicht gewählten Gegner wählt ihn als Ziel, wenn keins gewählt ist.

### 8.2 Konvergenz

Jeder Laser sitzt an seinem Anker (vorhanden, `tools/models/einbau.mjs`). Konvergenzpunkt auf dem Fadenkreuz-Strahl in der Entfernung:
1. des aufgeschalteten Ziels, wenn es im Waffenkegel liegt, sonst
2. des ersten Objekts unter dem Fadenkreuz (Strahl gegen Trefferkugeln, bis 650 m), sonst
3. **500 m** (Standard, einstellbar 300–650 m).

Die Konvergenzentfernung ändert sich weich (0,15 s), damit Bolzenbahnen nicht springen.

### 8.3 Vorhaltemarke

Für das aufgeschaltete Ziel (und schwächer für die zwei nächsten Gegner im Blickfeld) wird der Abfangpunkt gelöst: relative Lage `r`, relative Geschwindigkeit `u` (Ziel minus Schütze, wie bei geerbter Geschwindigkeit 0 nur Ziel), Bolzentempo `s`. Kleinste positive Lösung von `|r + u·t| = s·t`. Ohne Lösung (zu schnell) keine Marke, nur Ziel-Klammer. Marke: kleines Rautenzeichen mit Haarlinie zum Ziel, angezeigt nur bis 1,2 × Reichweite.

### 8.4 Gegnerfeuer

Gegner würfeln weiter mit `hitChance` (bewährt, billig, deterministisch, servertauglich), aber in 3D: Abstand und Querbewegung aus 3D-Vektoren. Ausweichen des Spielers zählt dadurch automatisch auch nach oben und unten. Ihre Bolzen fliegen sichtbar; bei Fehlwurf fliegt der Bolzen tatsächlich vorbei (Vorbeiflug-Ton). Gegner feuern nur innerhalb ihres Bug-Kegels (`ENEMY_FIRE_ARC` als 3D-Kegel).

### 8.5 Raketen

Im Hauptmodus mit Aufschaltung (Rechtsklick halten 0,8 s oder vorhandenes Ziel), 3D-Lenkflug mit gleicher Flugzeit (`ROCKET_FLIGHT` 0,6 s) und Schaden wie heute.

### 8.6 Taktikmodus

Unverändert: Angriff an (Strg), Würfel mit `hitChance` (jetzt mit 3D-Abstand, bei gleicher Höhe identisch), Laser-Kegel ±75°.

---

## 9. KI in 3D

### 9.1 Welt wird ein flacher Raum

- Sektor = Scheibe mit heutigem Radius und **Höhe ±1.500 m**. Außerhalb (seitlich oder vertikal) gilt die heutige Karten-Warnung mit Schaden.
- Spawns: Rudel in ±400 m Höhe, Asteroidenfelder bekommen eine Höhenstreuung (große Brocken ±250–600 m je nach Feld), Station, Tore und Frachterrouten bleiben auf y = 0. Erz und Kisten in Feldern streuen mit.
- Beute: **Traktor** zieht Wracks, Kisten und Erz ab 150 m Abstand mit 60 m/s zum Schiff (nur außerhalb des Kampfes schneller). Aufnahmeradius bleibt.

### 9.2 Bewegung

`moveEnemy` rechnet die Soll-Geschwindigkeit als 3D-Vektor, der leichte Flugkern (`stepAgent`) setzt sie mit Drehrate und Beschleunigung um. Verhalten:

| Verhalten | 3D-Umsetzung |
|---|---|
| Umkreisen (`attack` ohne Anflug) | Jeder Gegner hat eine eigene **Bahnebene** (Normale zufällig mit höchstens 50° Neigung gegen die Sektorebene, aus `world.rng`). Radialer und tangentialer Anteil wie heute, aber in dieser Ebene. |
| **Anflug mit Abdrehen** (neu, Stil `pack`, `ambush`) | Anflug auf Vorhaltepunkt bis `range × 0,35`, dabei feuern, dann Abdrehen in zufällige Richtung senkrecht zur Anflugachse (oben/unten bevorzugt), 400–700 m weg, Wende, neuer Anflug. Gibt die Kurvenkampf-Bilder aus 4.1. |
| Kurvenkampf | Wird der Gegner von hinten verfolgt (Spieler im Heckkegel ±35° näher als 500 m), fliegt er Scheren: harte Wenden mit Höhenwechsel, damit Verfolgen Können braucht. |
| Wartering (Kampf-Regie) | Ring wird ein geneigter Ring um den Spieler (Neigung 20°), Wartende streuen ±200 m in der Höhe. Budget 3–4 Angreifer, `TOKEN_ROTATE` bleibt. |
| Ausweichen (`jink`) | seitlich **und** vertikal, senkrecht zur Schusslinie des Spielers. |
| Deckung | Brocken als Kugeln in 3D, Sichtlinie mit Strecke gegen Kugel (gibt es in 2D als `segRock`). |
| Spezialangriffe | Salve als Kegel in 3D, Rammangriff entlang 3D-Linie (ausweichen nach oben/unten zählt), Säurewolke als Kugel. Aufladen bleibt sichtbar und hörbar. |
| Abstand halten (Trennung) | 3D-Abstand, Raster liefert Kandidaten. |
| Hindernisse | vorausschauend: Strahl 1,5 s voraus gegen Brocken, Ausweichen über die kürzere Seite. |

**Taktik-Kopplung:** Jeder Gegner kennt die Bezugshöhe seines Ziels. Steht der Zielspieler im Taktikmodus, gilt `flat = 1`: Bahnneigung 0, Höhe weich (2 s) auf die Spielerhöhe ±40 m, Anflüge in der Ebene. Damit bleibt das DarkOrbit-Bild lesbar. Mit `flat = 1` und y = 0 reduziert sich die 3D-Rechnung **exakt** auf die heutige 2D-Rechnung (Ziel für den Goldtest, Abschnitt 16).

### 9.3 Zielen der KI

Gegner richten den Bug auf den Vorhaltepunkt mit Fehler nach Rang (normal 3°, Elite 1,5°, Alpha 0,8°). Feuern nur, wenn der Bug innerhalb des 3D-Feuerkegels liegt. Trefferentscheid bleibt der Würfel (8.4).

---

## 10. Mehrspieler-Abgleich

### 10.1 Eigener Zustand (Paket v2, `mp-core.js`/`flight/net.js`)

```
[ v=2, x·2, y·2, z·2 (0,5 m), q_a, q_b, q_c (smallest-three, ±32767), q_idx,
  vx, vy, vz (m/s, ganzzahlig), hülle %, schild %, flags, ziel, mode-bits ]
```

`mode-bits`: KAMPF/REISE, gekoppelt, Boost, Fahrwerk, Landung, Taktikansicht, Zielhilfe-Stufe (2 Bit). Etwa 80–100 Byte JSON statt heute etwa 55. Sendetakt bleibt **9 Hz**, Änderungsschwelle und 1-s-Lebenszeichen bleiben (Supabase-Kontingente, `MEHRSPIELER.md`).

### 10.2 Darstellung fremder Schiffe

- **Hermite-Interpolation** (Ort und Geschwindigkeit an beiden Stützstellen) statt linear: in 3D fliegen Schiffe Kurven; linear würde Ecken zeigen.
- Lage per Slerp, Vorhersage über `INTERP_DELAY` 130 ms hinaus bis 250 ms mit Geschwindigkeit und zuletzt geschätzter Drehrate.
- Düsenflamme und Boost aus den Flags, Steuerdüsen aus der geschätzten Beschleunigung.
- **Abwärtsverträglich:** Pakete ohne `v=2` werden als y = 0, Lage aus `rot` gelesen. Alte Clients ignorieren die neuen Felder nicht (Array-Länge), darum Kanalwechsel: v2-Clients nutzen `…-v2`-Sektorkanäle, solange beide Stände live sind.

### 10.3 Koop

Gastgeber rechnet Gegner wie heute, sendet 8×/s je Gegner `[id, x, y, z, gier i8, nick i8, hp, schild, lebt, rang]`. Bei 50 Gegnern etwa 2,5 kB je Paket, 20 kB/s: an der Grenze für Realtime, deshalb nur Gegner im Umkreis von 2.500 m um den Gast senden (Sichtbarkeitsfilter, `ARCHITEKTUR-SANDBOX.md` 3.3).

### 10.4 PvP

Treffer meldet weiter der Schütze. Der Getroffene prüft zusätzlich: 3D-Abstand ≤ Reichweite × 1,6 und Winkel zwischen gemeldetem Bug des Schützen (letzter Zustand) und Linie zum Opfer ≤ Waffenkegel + 15°. Zielhilfe gegen Spieler höchstens NIEDRIG (6.3). Gemischte Ansichten (einer taktisch, einer im Hauptmodus) sind erlaubt; der taktische Spieler würfelt mit 3D-Querbewegung und hat dadurch gegen ausweichende 3D-Piloten einen spürbaren Nachteil. Das ist gewollt (Hauptmodus belohnt Können), muss aber im Balance-Test (16.3) sichtbar gemessen werden.

### 10.5 Später mit Spielserver (Phase B)

Der Flugkern ist rein und arbeitet auf einem `Float64Array`: Der Server rechnet denselben Kern, der Client sagt sein eigenes Schiff voraus und spult bei Abweichung mit den gespeicherten Befehlen nach (Zustand kopieren kostet < 1 µs). Hinweis: `Math.sin/cos` können zwischen JS-Engines in der letzten Stelle abweichen; bei Server-Wahrheit mit Nachspulen ist das unkritisch (kein Gleichschritt-Netz).

---

## 11. Taktikmodus als Nebenmodus

- **Gleicher Weltzustand**, eigener Steuerweg: `_movePlayer` bleibt unverändert und rechnet in der Ebene **auf der aktuellen Höhe des Spielers** (`y` bleibt stehen, `vy` wird in 1 s auf 0 gebracht). Lage: Rollen und Nicken in 1,2 s auf 0, Gieren = `rot`.
- Klick-Ziel: `renderer.pick` schneidet die Ebene `y = Spielerhöhe` statt `y = 0`.
- Laser: Angriff an, Würfel mit 3D-Abstand.
- KI-Kopplung `flat = 1` (9.2).
- Beim Wechsel zurück in den Hauptmodus wird der Flugkern-Zustand aus den Taktik-Feldern gesetzt (Ort, `v = (vx, 0, vz)`, Lage aus `rot`), ohne Sprung.
- **Grenze:** Gegner, die gerade 3D fliegen, brauchen bis zu 2 s, um in die Ebene zu kommen. Das ist sichtbar und gewollt (sie „formieren sich“).
- Touch und Telefon starten weiter im Taktikmodus (6.4).

---

## 12. HUD

Stil nach `Planung/UI_STIL.md`: Linien, Ticks, Winkel, Versalien, DIN-Schrift, keine Rundungen über 2 px, keine Emojis, Farbe nur mit Funktion. Mitte als **eine Zeichenfläche** (`<canvas>` über der Spielfläche, Gerätepixel, jedes Bild neu), Ränder als bestehende Fenster.

### 12.1 Mitte (Flug-HUD, neu `ui/hud-flight.js`)

| Element | Form | Verhalten |
|---|---|---|
| **Fadenkreuz** | vier kurze Striche mit Lücke, 28 px | folgt der Zielrichtung sofort |
| **Bugkreuz** | kleines „W“-Symbol aus Linien | zeigt, wohin der Bug wirklich zeigt (Abstand zum Fadenkreuz = Trägheit sichtbar) |
| **Flugbahnmarker** | Kreuz mit drei Strichen (Ring vermieden) | Richtung der Geschwindigkeit; entkoppelt besonders wichtig |
| **Vorhaltemarke** | Raute 10 px, Haarlinie zum Ziel | 8.3 |
| **Ziel-Klammer** | vier Winkel um das Ziel, Entfernung, Annäherung `−124 M/S`, Schild/Hülle als Strichbalken | gibt es teils in `hud-mid.js` |
| **Randpfeil** | Winkel am Rand eines Kreises um die Mitte (Radius 30 % Bildhöhe) | Ziel außerhalb des Bildes, rot für Feinde |
| **Treffermarke** | Kreuz aus vier Strichen um das Fadenkreuz | weiß Hülle, Fraktionsfarbe Schild, groß bei Abschuss, 120 ms |
| **Trefferrichtung** | roter Bogen-Abschnitt aus Strichen um die Mitte | eingehender Schaden, 600 ms |
| **Waffenbereitschaft** | kleine Ticks unter dem Fadenkreuz je Laser | blinken beim Schuss; grau in REISE |
| **Horizont** | Linie der Sektorebene, Leiter alle 10° mit Zahlen | nur Cockpit und Option im Verfolger |

### 12.2 Seiten und unten

| Element | Ort | Inhalt |
|---|---|---|
| **Geschwindigkeitsleiter** | links neben der Mitte | Ist `312`, Begrenzer als Marke, KAMPF-/REISE-/Boost-Grenze als Ticks |
| **Schubanzeige** | rechts neben der Mitte | sechs kleine Balken (vor/rück/seiten/vertikal), Höhe über Ebene `EBENE +240`, im Landemodus Höhe über Grund und Sinkrate |
| **Boost** | unter dem Fadenkreuz, 160 px, segmentiert (`.ls-bar`) | Vorrat, leer-gesperrt schraffiert bis 25 % |
| **Modus** | unter Boost, Telemetrie-Schrift | `KAMPF · GEKOPPELT · BEGR 330`, `REISE 0,8 S`, `LANDUNG · FAHRWERK 60 %`, `ENTKOPPELT` mit Warnfarbe `#ffb020` |
| **Radar** | Minikarte (NAV-Fenster) | bleibt Draufsicht, bekommt **Höhenstiele** (Linie vom Punkt zur Ebene, ▲/▼ und Zahl bei > 100 m) |

Alle Elemente zuklappbar/verschiebbar wie die übrigen Fenster, die Mitte als Ganzes ausblendbar (Bilder ohne HUD).

### 12.3 Cockpit-Instrumente (`render/cockpit.js`)

Die drei Bildschirme bekommen: links Schub/Boost/Modus, Mitte **Fluglage** (künstlicher Horizont zur Sektorebene, Kurs, Höhe) und Radar mit Höhenstielen, rechts Ziel. Zeichenflächen, höchstens 5× je Sekunde neu (wie heute), Fluglage 15×.

---

## 13. Vorbereitung Landemodus (für Meilenstein „Planetenlandung“)

Ziel dieses Meilensteins: Der Flugkern kann anfliegen, schweben, aufsetzen, stehen und abheben. Planeten, Atmosphäre, zu Fuß kommen später; ihre Schnittstellen stehen.

### 13.1 Umgebung `env`

```
env = {
  gravity: [gx, gy, gz],        // m/s², im All 0
  rho: 0,                       // Luftdichte kg/m³, im All 0
  ground(px, py, pz, out)       // → out.h (Höhe über Grund), out.nx/ny/nz (Normale), out.pad (Landefeld-Id oder 0)
  frame: 0                      // Bezugsrahmen (Sektor; später Planet, Schiff)
}
```

Heute liefert der Shooter `ground` nur für Landefelder an Stationen (siehe 13.3), sonst `h = Infinity`.

### 13.2 Landelogik (`flight/landing.js`)

- N schaltet `landing`: Fahrwerk fährt in 1,5 s aus (Grafik und `gear`), Höchsttempo 60/20 m/s, Drehraten 50 %, Horizont-Hilfe richtet „oben“ nach `-gravity` (im All nach der Landefeld-Normalen).
- **Schwebehilfe:** In Schwerkraft gleicht der Flugrechner `gravity` mit Vertikalschub aus, solange `ty = 0` (Schiff hält die Höhe). Reicht der Vertikalschub nicht (schwere Klasse, starke Schwerkraft), Warnung `SCHUB REICHT NICHT`.
- **Aufsetzen:** `gear = 1`, `h ≤ Fahrwerkshöhe + 0,3 m`, Sinkrate ≤ 3 m/s, Schräglage zur Normalen ≤ 20° → `landed = true`, Geschwindigkeit relativ zum Rahmen 0, Ort rastet auf. Härter: Schaden nach Sinkrate, ab 12 m/s Absturz.
- **Abheben:** `ty > 0` oder W bei `landed` → `landed = false`, Vertikalschub.
- **Autoland** (Strg halten im Landemodus, wie im Vorbild): sinkt mit 2 m/s, richtet aus, setzt auf.

### 13.3 Probe ohne Planeten: Landefeld an der Heimatstation

Jede Heimatstation bekommt ein **Landefeld** (Plattform mit Markierungen, Leitlichtern, Meshy-frei aus vorhandener Stationsgeometrie). Landen darauf = Andocken (Station öffnet sich wie heute). Das testet den ganzen Landeablauf im echten Spiel, bevor es Planeten gibt. Andocken per F bleibt als Abkürzung.

### 13.4 Rahmen und Ursprung

- Positionen tragen `frame` (heute 0). Der Flugkern rechnet in double. Der Renderer zeichnet heute Weltkoordinaten (Sektoren ≤ 10 km, float32 reicht dort auf < 1 mm).
- **Vorbereitet, nicht umgesetzt:** kameranahes Zeichnen (Kamera bei 0,0,0, je Objekt `pos − cam` in double) gehört in den neuen Weltrenderer `render/world/` (Architekturplan 2.6). Den heutigen Renderer umzubauen würde jede `v.rx/v.rz`-Stelle berühren und lohnt bei 10 km nicht.
- **Rahmenwechsel** (`setFrame(state, frame, pose)`): rechnet Ort, Geschwindigkeit, Lage in einen anderen Rahmen um. Selbsttest: Hin- und Rückwechsel ändert nichts (< 1e-9 m).

---

## 14. Texte, Einführung, Coach

- Flug-Coach (`ui/hud-coach.js`) und SYSTEM-Reihe (`sim/system-quests.js`, `ui/hud-guide.js`) zeigen Tasten **je Ansicht und Eingabeart**. Alle Stellen, die „Strg Angriff“, „Leertaste Rakete“, „E Andocken“ oder „linker Stick lenkt“ nennen, werden geprüft (Suche nach Tastennamen in `src/`).
- Erster Flug im neuen Modell: kurze **Flugschule** in vier Schritten (Zielen und Schub, Seitenschub und Rollen, Boost und Begrenzer, Feuern auf Übungsdrohnen), überspringbar. Bestehende Einführungswahl bekommt den Punkt „Taktische Steuerung (klassisch)“.
- Textprüfung `node Code/tools/texte/floskeln.mjs` muss sauber bleiben.

---

## 15. Leistungsbudget

Ziel Mac (Apple M5, Browser und Mac-App): **120 Bilder/s auf HOCH** (ProMotion, 8,3 ms), mindestens 60 auf EXTREM. Windows RTX 5080: 144–240 Hz unbegrenzt. Mobil: wie heute.

| Posten | Budget (M5, je Bild bei 120 Hz) | Begründung |
|---|---|---|
| Flugkern Spieler (2 Teilschritte je Sim-Schritt) | < 0,01 ms | ein Schiff, Float64Array |
| KI 3D (50 Gegner, 60 Hz) | < 0,35 ms | heute gemessen 1,4–3,6 ms CPU je Sim-**Sekunde** und Sektor; 3D etwa +40 % |
| Bolzen (bis 512 gleichzeitig) Simulation | < 0,1 ms | Strecke gegen Raster |
| Bolzen Grafik | 1 Zeichenaufruf | eine `InstancedMesh`, additive Striche |
| Steuerdüsen-Puffs | im vorhandenen Partikel-Pool | keine neue Zeichnung |
| Flug-HUD (Canvas 2D) | < 0,3 ms | nur Linien und Text, ohne Schatten |
| Tempostaub 3D | wie heute (1 Zeichenaufruf, 900 Punkte) | nur Shader-Änderung |
| Cockpit-Fluglage | < 0,1 ms bei 15 Hz | Zeichenfläche |
| Zusätzliche Zeichenaufrufe gesamt | ≤ +10 | Prüfung in `ansichten.mjs` |
| Speicher | ≤ +8 MB | keine großen Texturen |

Regeln: Sim läuft mit festem Schritt, Darstellung interpoliert (gibt es). Fadenkreuz, Kamera-Drehung und HUD rechnen je Bild, nicht je Sim-Schritt. Maus über `pointerrawupdate`, wo vorhanden (Chrome, Electron), sonst `pointermove`. Gamepad je Bild im `requestAnimationFrame` (gibt es).

---

## 16. Testplan (automatisch, headless)

Alle Browserprüfungen mit `playwright-core`, **headless**, eigener Dev-Server auf freiem Port (nicht 5173), am Ende beendet. Ergebnisse und Bilder unter `Code/tools/playtest/berichte/<name>-<zeit>/`.

### 16.1 Selbsttest `npm test` (Node, ohne Browser), neu `flight/` im `selftest.mjs`

1. **Determinismus:** gleiche Befehlsfolge (10.000 Schritte) → bitgleicher Zustand, zweimal gerechnet.
2. **Stabilität:** 100.000 Teilschritte mit zufälligen Befehlen (fester Samen): keine NaN, `|q| − 1 < 1e-9`, Tempo nie über Deckel + 5 %.
3. **Kennzahlen je Klasse S1–S8** (Tabelle 4.5 und 5.6, ±10 %): 0→KAMPF-Tempo, 180°-Wende, 63 %-Zeit auf 20° Fehler, Bremsweg, Boost-Dauer und Nachladen, Sperre bis 25 %.
4. **Gekoppelt/entkoppelt:** entkoppelt ohne Eingabe Driften < 0,1 % in 10 s; gekoppelt Seitendrift auf < 1 m/s in Zeit `v/a_seite + 0,1 s`; entkoppelt über Deckel wird weich abgebaut.
5. **Modi:** REISE sperrt Waffen und Schildaufladung, Wechselzeiten 0,8/1,5/3,5 s, Taste im Kampf.
6. **Horizont-Hilfe:** aus 45° Rolllage ohne Eingabe in ≤ 2 s auf < 2°; bei 70° Nicken keine Wirkung.
7. **Landung:** Fahrwerk 1,5 s, Schweben in `gravity = −9,81` hält Höhe ±0,5 m über 10 s, Aufsetzen nur bei Grenzwerten, harter Aufprall gibt Schaden, Abheben, Autoland endet mit `landed`.
8. **Rahmenwechsel:** hin und zurück < 1e-9 m.
9. **Zielmathematik:** Vorhalt gegen geradlinig fliegendes Ziel: Bolzen verfehlt um < 0,5 m; Konvergenz trifft den Punkt auf < 0,1 m; Waffenkegel begrenzt; Zielhilfe ohne Stick-Eingabe = 0, nie über 40 % Drehrate, im PvP höchstens NIEDRIG.
10. **Netz v2:** Packen/Entpacken Ort < 0,5 m, Lage < 0,5°; Hermite stetig (kein Sprung an Stützstellen); altes Paket ohne `v` → y = 0.
11. **KI 3D:** 60 s Sektor 1 und 6 mit festem Samen: keine Überlappung (Abstand ≥ 1,6 × Radien), Höhe in ±1.500 m, Anflug-Abdrehen tritt auf, Feuer nur im Kegel, Kampf-Regie hält 3–4 Angreifer.
12. **Taktik-Goldtest (darf nicht kaputtgehen):** Vor dem Umbau wird eine Spur aufgezeichnet (fester Samen, Klickbefehle, Angriff, 120 s): Spieler `x, z, rot` je Schritt, Gegner `x, z` je Sekunde, Abschüsse. Danach im Taktikmodus mit y = 0 und `flat = 1`: Spieler **bitgleich**, Gegner bitgleich (Ziel) bzw. Abschusszeitpunkte ±0 s. Alle bisherigen Selbsttests bleiben unverändert grün.

### 16.2 Browser headless

| Werkzeug | Prüft |
|---|---|
| `tools/playtest/flug3d.mjs` (neu) | Start `?dev=game&flug=3d`; Testhaken `__ls.input.flight.inject({ dx, dy, keys })`, weil Zeigerfang headless nicht zuverlässig ist. Fadenkreuz folgt (Bildposition), Schiff dreht nach (Zeit gegen Kennzahl), W/Shift/C/X/N/B/G wirken (Zustand und HUD-Text), V-Zyklus Verfolger→Cockpit→Taktik→Verfolger ohne Konsolenfehler, Klickflug im Taktikmodus kommt auf 30 m an, Feuern auf stehende Übungsdrohne mit Zielen auf die Vorhaltemarke ≥ 90 % Treffer, auf querfliegende ≥ 70 %, Treffermarke erscheint, Bilder je Ansicht. |
| `tools/playtest/controller.mjs` (erweitert) | Heutige 73 Prüfungen bleiben für Taktik und Menüs; neue Reihe Hauptmodus: rechter Stick dreht, RT feuert, LT verengt Sichtfeld, Zielbremse senkt Drehrate nahe Ziel (Messung), Mitnahme nur mit Stick, LB+Stick vertikal, B halten koppelt, Steuerkreuz halten REISE/Landung, Rumpeln beim Treffer. |
| `tools/mehrspieler/test.mjs` (erweitert) | Zwei headless Seiten: Position eines Kurvenfliegers (300 m/s, 60°/s) beim anderen mit Fehler < 6 m; v1-Paket wird als y = 0 gezeigt; PvP-Prüfung lehnt Treffer außerhalb Kegel ab. |
| `tools/playtest/spielen.mjs` (erweitert) | Bot mit **Menschenmodell** (Reaktion 180 ms, Zielrauschen 0,6°, Mausweg begrenzt): fliegt Sektor 1–3 im Hauptmodus; misst Trefferquote, Zeit bis Abschuss, Schaden, Tode. Schwellen: Raider mit S1 in 6–14 s, Tode in Sektor 1 ≤ 0,3 je 5 min, Controller-Bot ≥ 85 % der Maus-Trefferquote. |
| `tools/bilder/kampf.mjs`, `ansichten.mjs` | neue Ansichten „Kurvenkampf von unten“, „Cockpit Fluglage“, „Landefeld“; Zeichenaufrufe ≤ +10, Bildzeit-Bericht. Headless-Werte sind Richtwerte; die Abnahme der Bildrate macht Toni am echten Mac. |
| `tools/playtest/tief.mjs` | auf headless und freien Port umstellen (heute sichtbar und 5173). |

### 16.3 Balance-Wächter

`npm run balance` bekommt den Hauptmodus: Fortschritt in 12 Bot-Stunden je Modus darf um höchstens ±15 % von der Taktik abweichen (sonst `ACTION_DMG_MULT` in `config.js` anpassen, Startwert 1,0).

---

## 17. Betroffene Dateien

| Datei | Änderung | Umfang |
|---|---|---|
| `Code/src/flight/*.js` (neu) | Flugkern, Werte, Zielmathematik, Landung, Netz | groß, neu |
| `Code/src/sim/world.js` | Spieler-Zustand 3D, Weiche Hauptmodus/Taktik in `_updatePlayer`, Bolzen `_updateBolts`, Munition je Viertel, 3D-Abstände in Aufnahme, Zonen, Toren, Raketen, Karte, Traktor, Modi (Schild pausiert in REISE) | groß |
| `Code/src/sim/ai.js` | `moveEnemy` und Verhalten in 3D, Bahnebenen, Anflug-Abdrehen, Scheren, `flat`-Kopplung | groß |
| `Code/src/sim/config.js` | neue Regelwerte (Bolzen, Traktor, Sektorhöhe, Zielhilfe) | klein |
| `Code/src/sim/combat.js` | Vektor-Helfer, `hitChance` 3D | klein |
| `Code/src/sim/spatial.js` | `query3` (2D-Zellen, 3D-Filter), Strecken-Abfrage | klein |
| `Code/src/sim/spawn.js`, `events.js`, `abilities.js`, `drones.js` | Höhe beim Erzeugen, 3D-Wirkradien, Drohnen folgen in 3D | mittel |
| `Code/src/sim/selftest.mjs` | Abschnitt 16.1 | groß |
| `Code/src/core/data.js` | `flight`-Block je Schiff, Wendigkeit je Gegnerstil, Bolzentempo je Laser | klein |
| `Code/src/input.js` | neuer Steuerweg Hauptmodus (Zeigerfang, Zielrichtung, 6DOF-Befehl), alter Weg für Taktik bleibt | groß |
| `Code/src/input/padflight.js`, `gamepad.js` | Belegung Hauptmodus, Halten-Erkennung, Zielhilfe-Eingang | mittel |
| `Code/src/render/renderer.js` | Lage aus Quaternion, Höhe, 3D-Picking, Bolzen, Ebene im Taktik-Pick, Kamera-Anbindung | groß |
| `Code/src/render/camrig.js` | Verfolger- und Cockpit-Pose in 3D, Übergänge, Kopfträgheit | mittel |
| `Code/src/render/cockpit.js` | Fluglage, Radar, Modusanzeige | mittel |
| `Code/src/render/speeddust.js`, `trails.js`, `effects.js` | 3D-Wickeln, Steuerdüsen, Bolzen, Treffer in 3D | mittel |
| `Code/src/render/stations.js` | Landefeld | mittel |
| `Code/src/ui/hud-flight.js` (neu), `hud-mid.js`, `hud-map.js`, `hud-touch.js`, `hud-coach.js`, `hud-guide.js`, `pad-map.js`, `screens-kit.js` | Flug-HUD, Höhenstiele, Touch-Stufen, Texte, Belegung, Einstellungen | mittel |
| `Code/src/audio/audio.js` | neue Klänge und Stimmenbegrenzung | mittel |
| `Code/src/net/mp-core.js`, `mp.js`, `coop.js` | Paket v2, Hermite, Koop 3D, PvP-Prüfung | mittel |
| `Code/src/engine/settings.js` | Sichtfeld 55–90°, Steuer-Einstellungen (oder eigener Schlüssel `ls.flight`) | klein |
| `Code/public/audio/` | neue Klänge (Lizenz in `LAST SIGNALS - Audio und Lizenzen`) | klein |
| `Code/tools/playtest/flug3d.mjs` (neu), `controller.mjs`, `spielen.mjs`, `tief.mjs`, `tools/mehrspieler/test.mjs`, `tools/bilder/*.mjs` | Abschnitt 16 | mittel |
| `Planung/FLUGMODELL.md` (neu, verbindlich nach Abnahme), `CONTROLLER.md`, `FLUGGEFUEHL.md`, `SCHNITTSTELLEN.md`, `MEHRSPIELER.md`, `ARCHITEKTUR-SANDBOX.md` (2.1, D2), `CLAUDE.md` | Doku | klein |

---

## 18. Reihenfolge der Umsetzung

Jeder Schritt endet mit `npm test` grün, Taktik-Goldtest grün, eigenem Commit (deutsch). Alles hinter dem Schalter `?flug=3d` bzw. Einstellung „FLUGMODELL: NEU (TEST)“, bis Toni abnimmt.

| # | Schritt | Ergebnis | Aufwand |
|---|---|---|---|
| 0 | Entscheidungen (Abschnitt 20) und **Goldspur Taktik** aufzeichnen | Sicherheitsnetz | 0,5 T |
| 1 | **Flugkern** `flight/` + Selbsttests 16.1 (1–9) | Kern fertig, gemessen | 3–4 T |
| 2 | **Fluglabor** `?dev=fluglabor`: Spielerflug im Hauptmodus, Kamera Verfolger/Cockpit, Fadenkreuz, Bugkreuz, Flugbahnmarker, Geschwindigkeit, Boost, Modus; Ton Triebwerk/Düsen/Boost; Regler-Panel F4 für alle Werte aus 5.6 mit Speichern als Voreinstellung. Gegner im Sektor ausgeblendet. | **Abnahme Gefühl 1 durch Toni** (Maus) | 5–7 T |
| 3 | **Waffen und Zielen** im Labor: Bolzen, Konvergenz, Vorhaltemarke, Treffermarke, Übungsdrohnen (stehend, geradeaus, kurvend, ausweichend) | **Abnahme Gefühl 2** | 4–6 T |
| 4 | **Controller und Zielhilfe** im Labor | **Abnahme Gefühl 3** (Controller) | 3–4 T |
| 5 | **Welt in 3D**: Höhe für alles, Spawns, Felder, Grenzen, Traktor, Andocken (F), Tore, Raketen, Fähigkeiten, Gefahren, Drohnen | Spiel läuft im Hauptmodus mit statischen Gegnern | 5–7 T |
| 6 | **KI in 3D** + Kampf-Regie + Spezialangriffe, Bot-Balance 16.3 | Kampf im Hauptmodus fertig | 7–9 T |
| 7 | **Taktik anbinden** (Höhe, Übergang, `flat`), Goldtest bitgleich | Nebenmodus gesichert | 2–3 T |
| 8 | **Mehrspieler/Koop** v2 | gemeinsam fliegen in 3D | 3–4 T |
| 9 | **HUD komplett**, Cockpit-Instrumente, Radar-Höhenstiele, Texte/Coach/SYSTEM-Reihe, Flugschule, Touch-Stufen | spielfertig | 5–6 T |
| 10 | **Landemodus**: Fahrwerk, Landelogik, Landefeld an Heimatstationen | Meilenstein „Planetenlandung“ vorbereitet | 3–4 T |
| 11 | Leistung, Bilder, Doku, Prüfwerkzeuge, Abnahme, dann Schalter auf Standard | fertig | 3–4 T |

**Summe etwa 40–55 Arbeitstage.** Die Schritte 2–4 sind bewusst früh: Toni soll das Fliegen nach etwa zwei Wochen selbst spüren und mit dem Regler-Panel mitstimmen, bevor teure Teile (KI, Netz) gebaut werden.

---

## 19. Risiken

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| **Orientierungsverlust in 3D** (kein Oben, Gegner hinter/unter einem) | Frust, Übelkeit | Horizont-Hilfe Standard, Sektorebene als Horizont, Höhenstiele, Randpfeile, Sektor nur ±1.500 m hoch, „Bewegung reduzieren“, Kopfbewegung abschaltbar |
| **Balance**: gezieltes Feuer gegen 85 %-Würfel, Wirtschaft (Munition, Stufen) hängt am Schaden | zu schwer oder zu leicht, Fortschritt kippt | gleicher Dauerschaden und Verbrauch, Waffenkegel, Bot mit Menschenmodell, Balance-Wächter ±15 %, `ACTION_DMG_MULT` |
| **KI wirkt in 3D dumm** (Kreisen, Auffahren, Festhängen an Brocken) | „definitiv zu dumm“ (Toni, 30.10.) kehrt zurück | Anflug-Abdrehen und Scheren als Kernverhalten, Hindernis-Vorausschau, Telegrafierte Spezialangriffe bleiben, Labor-Abnahme vor Schritt 6 |
| **Esc, Zeigerfang, HUD-Fenster** | Menü öffnet unerwartet, Fenster nicht bedienbar | Verlust des Zeigerfangs = Bordmenü, Alt = Zeiger frei, klare Anzeige; Safari und Electron einzeln prüfen |
| **Trackpad** (Mac ohne Maus) | Kampf mühsam | eigene Empfindlichkeit, Coach-Empfehlung Controller oder Taktik |
| **Taktikmodus bricht** | Nebenmodus kaputt, Mobil kaputt | alter `_movePlayer` unverändert, Goldtest bitgleich, Touch-Start in Taktik |
| **Quests und Texte** (69 SYSTEM-Quests, Coach) nennen alte Tasten | Spieler verwirrt | Tastenhinweise je Ansicht/Eingabeart, Suche aller Tastennamen, Prüfung `floskeln.mjs` |
| **Supabase-Kontingente** mit größeren Paketen und Koop in 3D | Kanal wird geschlossen | 9 Hz bleibt, Koop nur Gegner im 2,5-km-Umkreis, Messung im Mehrspieler-Test |
| **Modelle von unten** (Stationen, Schiffe, Gegner wurden von oben/hinten abgenommen) | sichtbare Lücken, fehlende Böden | Bilderreihe „von unten“ in `ansichten.mjs`, Mängelliste vor Schritt 11 |
| **Kamera-Rahmung je Klasse** (`CHASE_FRAME`, Größenprüfung) gilt für 15°-Neigung | große Schiffe verdecken das Fadenkreuz | 3D-Rahmung als eigene Prüfreihe, Schiff im unteren Drittel |
| **Headless-WebGL** (SwiftShader/ANGLE) | Leistungszahlen ungenau | Funktion headless prüfen, Bildrate am echten Mac durch Toni |
| **Umfang** (40–55 T) | Verzug, Konflikte mit anderen Zweigen (`world.js` wird parallel bearbeitet) | Schalter, kleine Commits, Flugkern zuerst getrennt, `world.js`-Änderungen gebündelt in Schritt 5 |
| **Grundsatz gegen Architekturplan 2.1** | widersprüchliche Planung | Entscheidung 1, Architekturplan nachziehen |

---

## 20. Entscheidungen für Toni

1. **Shooter wird 3D, Taktik ist Nebenmodus** (ersetzt Architekturplan 2.1 / Frage 4). Empfehlung: ja.
2. **Tasten im Hauptmodus wie im Vorbild** (Leertaste/Strg hoch/runter, Q/E rollen, Rakete auf Rechtsklick/R, Andocken F). Empfehlung: ja; Taktik behält die alten Tasten.
3. **Gezielte Bolzen im Hauptmodus**, Würfel nur in Taktik und für Gegner. Empfehlung: ja.
4. **Schubhebel-Standard „Halten“** wie im Vorbild (Alternative „Hebel“). Empfehlung: „Halten“ für Maus, „Halten“ auch am Controller (Stick).
5. **Horizont-Hilfe standardmäßig an** für neue Piloten. Empfehlung: ja, abschaltbar.
6. **Namen der Modi:** KAMPF / REISE, GEKOPPELT / ENTKOPPELT, BOOST, BEGRENZER, LANDUNG, ZIELHILFE. Empfehlung: so, ohne fremde Bezeichnungen.
7. **Shop-Anzeige** „Tempo“ wird zu KAMPF-Tempo + Wendigkeit. Empfehlung: ja.
8. **Landefeld an den Heimatstationen** als Probe für den Landemodus. Empfehlung: ja.

---

## 21. Anhang: Formeln

- Lage fortschreiben: `q' = q + ½ h · q ⊗ (ω_x, ω_y, ω_z, 0)`, danach `q' /= |q'|`.
- Fehlerwinkel Maus: `f = Rᵀ(q) · a_ziel` (Zielrichtung im Schiffsrahmen), Gieren `atan2(f.x, −f.z)`, Nicken `atan2(f.y, √(f.x² + f.z²))`.
- Vorhalt: `(u·u − s²) t² + 2 (r·u) t + r·r = 0`, kleinste positive Wurzel; Marke bei `p_ziel + u_ziel · t`.
- Bremsweg gekoppelt: `v² / (2 · a_rück)`.
- Zielbremse: `k = lerp(1, 0,55, smoothstep(c_außen, c_innen, Winkel))` mit `c_innen = max(1,2°, 2,5 · rad_ziel)`, `c_außen = 2 · c_innen`.
- Smallest-three: größte Komponente weglassen (Index 2 Bit), übrige drei × 32767 · √2, Vorzeichen so, dass die weggelassene positiv ist.
