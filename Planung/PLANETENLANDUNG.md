# LAST SIGNALS · Sandbox-Meilenstein 1: Planetenlandung

Stand 03.11.2026, Zweig `claude/fertigstellung-live`. Nur Planung, kein Spielcode geändert.
Grundlagen: `Planung/ARCHITEKTUR-SANDBOX.md` (2.6 Koordinaten, 2.7 Renderer, 2.8 Planeten, Phase D), gewählter Flug-Entwurf `wt-flug/Planung/FLUG-ENTWURF-gefuehl.md` (Abschnitt 13 Landemodus, 15 Budget, 16 Tests), gegengelesen `FLUG-ENTWURF-voll3d.md`. Gelesen im Hauptstand: `render/planets.js`, `render/environment.js` (Planetenliste), `render/renderer.js` (Kamera, Pässe), `render/camrig.js`, `sim/world.js` (Aufbau), `engine/settings.js`.

---

## 0. Kurzfassung

- **Je Heimatsystem ein landbarer Körper** mit eigenem Namen: **Veyra** (EUROPA, Eiskruste mit Rissen und Dunst), **Orrin** (SATURN, Staubmond mit bernsteinfarbener Dunsthülle und Dünen), **Morvak** (ERIS, dunkler Frostbrocken, violetter Hauch, Sterne am Taghimmel). Radius 45–70 km (Spielmaßstab), Schwerkraft 3–6 m/s².
- **Der Heimatsektor liegt wirklich im Orbit:** Der Sektor (Station, Tore, Gegner, ≤ 10 km) bekommt eine feste Pose im planetenfesten Rahmen, etwa 110–130 km über dem Boden. Der Planet am Himmel ist dann keine Kulisse mehr, sondern dasselbe Gelände, das man später überfliegt. Der Rahmenwechsel Sektor ↔ Planet ist eine reine Umrechnung ohne Bildsprung und ohne Ladebild.
- **Zeichnen kameranah** (Kamera immer bei 0,0,0, je Chunk `mitte − kamera` in double): das ist die Floating-Origin-Lösung aus dem Architekturplan 2.6, ohne Ursprungssprünge. Tiefe: `reverseDepthBuffer` (three r170, `EXT_clip_control`), sonst zwei Tiefenebenen (Fern/Nah). Cockpit bleibt eigene Ebene.
- **Gelände:** Würfelkugel, 6 Quadtrees, Chunks 33²/65² Eckpunkte mit Schürzen, Teilung nach Bildschirmfehler, erzeugt im Web Worker. **`heightAt()` in JS ist die Wahrheit**, das Netz wird aus ihr gebaut; die GPU fügt nur Detailnormalen und Farbe hinzu (keine zweite Höhenfunktion, kein Abgleichsproblem).
- **Atmosphäre** mit Einfachstreuung (Rayleigh + Mie) über kleine Nachschlagetabellen (Durchlässigkeit, Mehrfachstreuung, Himmelsansicht), Luftperspektive auf dem Gelände. **Wolken** als optionale Schicht ab HOCH.
- **Flug:** Der neue Flugkern bekommt über `env` Schwerkraft, Luftdichte, Bodenabfrage und ein höhenabhängiges Tempolimit (Orbitalflug). Landemodus mit Fahrwerk, freies Landen auf Gelände bis 20° Neigung und ein **Landeplatz** je Planet (Außenposten auf eingeebnetem Gelände).
- **Zu Fuß:** Aussteigen in Ego-Ansicht, gehen, rennen, springen, umsehen; eigene schlanke Figurensteuerung (Kapsel gegen Höhenfeld und Boxen), **ohne Rapier** in M1. Wiedereinsteigen, Abheben, zurück in den Sektor.
- **Mehrspieler:** eigener Planetenkanal; andere sehen gelandete Schiffe und Piloten mit Laufzustand. Gleiche Taktung und Kontingente wie im Sektor.
- **Renderer:** M1 bleibt auf `WebGLRenderer` r170 mit GLSL, weil nahtloser Anflug aus dem Sektor denselben Renderer in Sektor und Planet braucht. Der Code liegt getrennt in `render/world/`, damit eine spätere TSL-Portierung (Architekturplan 2.7) nur diesen Ordner betrifft.
- **Umfang:** 9 Schritte, je Schritt einzeln spielbar und headless prüfbar, etwa **60–82 Arbeitstage** nach Abschluss der Flugkern-Schritte bis Landemodus. Größte Risiken: Tiefenpuffer auf Safari/iOS, Chunk-Erzeugung auf Handys, Gefühl der Figurensteuerung, Orientierung beim Übergang von „Sektor oben“ zu „Planet unten“.

---

## 1. Entscheidungen, die dieser Entwurf trifft (zur Abnahme durch Toni)

| # | Punkt | Vorschlag | Begründung |
|---|---|---|---|
| E1 | Planetenlandung vor Server (Phase B/C)? | Ja, als Offline-Vertikalschnitt mit Mehrspieler über den heutigen Realtime-Weg | Toni will Landen jetzt; der Kern bleibt serverfähig (reine Funktionen, double, `frame`). Ersetzt die Reihenfolge in Architekturplan 2.11 für diesen Teil. |
| E2 | WebGPU/TSL für M1? | Nein, WebGL r170 + GLSL, Code isoliert in `render/world/` | Nahtloser Übergang aus dem Shooter-Sektor; kein Renderertausch im Flug. WebGPU-Spike bleibt sinnvoll, ist aber keine Voraussetzung mehr. |
| E3 | Rapier? | Nicht in M1 | Figur auf Höhenfeld + Boxen reicht für Außenbereich; spart ~1,5 MB WASM, läuft im Node-Selbsttest. Rapier mit dem ersten betretbaren Innenraum (D3). |
| E4 | Maßstab | Radius 45–70 km, Heimatsektor ~120 km über Grund | Star-Citizen-Gefühl (Krümmung im Anflug sichtbar, Horizont am Boden mehrere hundert Meter, im Flug über 10 km) bei Chunk-Zahlen, die ein Handy schafft. |
| E5 | Planet drehen? | Nein, Planet steht still, Sonnenrichtung dreht (Tag in 90 min Echtzeit) | Planetenfester Rahmen wie Architekturplan 2.6; Netz und Landeplätze bleiben fest. |
| E6 | Figur | Eigene schlanke Low-Poly-Figur im Code (Anzug, Helm, Fraktionsfarbe), Laufbewegung prozedural | Keine Meshy-Generierung in M1; ein Meshy-Pilot kann später die Figur ersetzen (gleiche Knochennamen). |

---

## 2. Das Erlebnis (Abnahme-Szene, ca. 4 Minuten)

1. Start an der Heimatstation von EUROPA. Unter dem Sektor hängt Veyra groß am Himmel (etwa 50° Sichtwinkel), Dunstsaum, Tag-Nacht-Grenze.
2. Spieler wählt REISE und richtet den Bug auf den Planeten. Ab der Sektorgrenze steigt das erlaubte Tempo mit der Höhe (Orbitalflug), die Sektorobjekte bleiben zurück. Der Boden wird mit jedem Kilometer detaillierter, ohne Sprung.
3. Ab 12 km Höhe beginnt die Atmosphäre: Himmel färbt sich, Glühen am Bug, leichtes Rütteln, Wind im Ton, Tempo sinkt durch Widerstand.
4. Unter 2 km schaltet der Flugrechner auf Schwebehilfe, der Coach zeigt N (Landemodus). Fahrwerk fährt aus, Höhenanzeige und Sinkrate erscheinen, Landeplatz-Markierung leuchtet.
5. Aufsetzen auf dem Landeplatz oder frei auf flachem Gelände. Triebwerke laufen aus, Staub legt sich.
6. F halten (Controller Y halten): Pilot steigt aus. Ego-Ansicht, Schritte knirschen, das eigene Schiff steht in voller Größe da. Gehen, rennen, springen, umsehen. Ein zweiter Pilot landet daneben und läuft herüber.
7. Zurück zur Luke, F: Einsteigen, Cockpit oder Verfolger wie vorher. W/Leertaste: Abheben, Fahrwerk ein, steigen, REISE, zurück in den Sektor bis zur Station.

Kennzahlen dieser Szene: Sektorgrenze bis Atmosphäre ≤ 45 s, Atmosphäre bis Aufsetzen ≤ 60 s, Aussteigen/Einsteigen je ≤ 1,5 s, Abheben bis Sektor ≤ 90 s. Kein Bild über 50 ms (Mac), keine Ladeanzeige.

---

## 3. Weltaufbau und Koordinaten

### 3.1 Rahmen

| Rahmen | Inhalt | Ursprung | Genauigkeit |
|---|---|---|---|
| `P` (planetenfest) | Planet, Gelände, Landeplatz, gelandete Schiffe, Figuren | Planetenmitte | double |
| `S` (Sektor, heute Rahmen 0) | Station, Tore, Gegner, Felder | feste Pose `poseS` in `P` (Ort 120 km über Grund, Lage so, dass Sektor-„unten“ zum Planeten zeigt) | wie heute |
| Cockpit/Ego | Cockpit-Ebene, Waffe/Hände später | Kamera | float32 |

- `poseS` ist pro Heimatsystem fest in den Planetendaten (`genVersion` eingeschlossen) und wird nie zur Laufzeit geändert.
- **Schwerkraft nur im Einflussbereich:** voll unter 30 km Höhe, Übergang 30–40 km, darüber 0. Damit bleibt der Sektor schwerelos und der Shooter unverändert.
- **Rahmenwechsel** über `setFrame(state, frame, pose)` aus dem Flugkern (FLUG-ENTWURF 13.4). Auslöser: Abstand zum Sektormittelpunkt > Sektorradius + 1 km und Kurs zum Planeten (Hysterese 2 km zurück). Im Rahmen `P` läuft die Sektorsimulation für diesen Spieler wie nach einem Sprung (Zone verlassen), Gegner folgen nicht.
- Andere Sektoren (2–8) bleiben reine Kulisse; ihr Planet ist weiter `render/planets.js`.

### 3.2 Zeichnen

- **Kameranah:** Kamera-Matrix ohne Verschiebung; jedes Wurzelobjekt (Chunk, Schiff, Figur, Sektorwurzel) bekommt je Bild `position = (ort_double − kamera_double)` als float32. Chunk-Eckpunkte liegen relativ zur Chunk-Mitte (float32 reicht: Chunk ≤ 47 km breit, Fehler < 3 mm; feine Chunks < 1 mm).
- Der heutige Sektor-Renderer zeichnet Weltkoordinaten. Er bleibt so, nur seine Wurzelgruppe wird im Rahmen `P` kameranah versetzt (eine Stelle in `renderer.js`, nicht jede `v.rx/v.rz`).
- **Tiefe:** `new WebGLRenderer({ reverseDepthBuffer: true })`, wenn `EXT_clip_control` vorhanden (Fähigkeit in `engine/caps.js`), dann near 0,05 m, far 1.000 km in einem Durchgang. Rückfall (Safari/iOS ohne die Erweiterung): zwei Durchgänge, Fern 1 km–1.000 km, Tiefe löschen, Nah 0,05 m–1,2 km. Logarithmische Tiefe nur als letzte Wahl (bricht Early-Z und alle `onBeforeCompile`-Shader).
- Im Sektor bleibt die Kamera wie heute (near 25, far 95 km). Umschalten der Nah-/Fernwerte nach Höhe und Ansicht, nicht nach Rahmen, damit kein Bildsprung entsteht.

### 3.3 Planetendaten (`world/planets-def.js`, Schema aus Architekturplan 4.2)

```js
BodyDef = {
  id: 'veyra', faction: 'europa', radius: 58000, gravity: 4.2, genVersion: 1, seed,
  poseS: { alt: 120000, dir: [x, y, z], up: [x, y, z] },
  atmo: { top: 12000, rayleigh: [r, g, b], mie, mieG, density, haze },
  clouds: { height: 4500, cover: 0.35, color } | null,
  recipe: 'eiskruste',          // Datei in world/gen/recipes/
  pads: [{ id: 'veyra-p1', lat, lon, size: 140, heading }],
  terrainOps: [{ kind: 'flatten', lat, lon, r: 180, edge: 60 }],
  sun: { dayLen: 5400 },
}
```

| Körper | Fraktion | Radius | g | Gelände | Atmosphäre | Wolken |
|---|---|---|---|---|---|---|
| Veyra | EUROPA | 58 km | 4,2 | Eisplatten, lange Risse, Druckrücken, blaue Spalten | dünn, blassblau, Bodennebel | dünne Schleier |
| Orrin | SATURN | 66 km | 5,0 | Dünenfelder, Tafelberge, Geröllebenen | dicht, bernstein, Sicht 8–15 km | Dunstbänder |
| Morvak | ERIS | 47 km | 3,1 | Krater, Eisnadeln, dunkle Ebenen | sehr dünn, violett, Sterne am Tag | keine |

Die Namen sind eigene Erfindungen (Prüfung gegen vorhandene Texte: keine Treffer).

---

## 4. Gelände

- **Würfelkugel**, 6 Quadtrees. Chunk: 65² Eckpunkte (Desktop) bzw. 33² (Handy), Schürze 4 % der Kantenlänge nach innen. Kantenlänge Stufe 0 ≈ 91 km (R = 58 km), Eckpunktabstand Stufe 10 ≈ 1,4 m (Desktop), Höchststufe Handy 9.
- **Teilung** nach Bildschirmfehler `fehler_px = geomFehler(stufe) · bildhöhe / (2 · abstand · tan(fov/2))`; teilen über 2,0 px (HOCH), 4,0 px (MITTEL), 6 px (NIEDRIG/Handy); Zusammenlegen mit Hysterese 0,6. Horizont- und Rückseiten-Auslese über Kugelkappe.
- **Erzeugung im Worker** (`world/chunk-worker.js`, 1 Worker Handy, 2–3 Desktop): `heightAt(dir)` (Rauschen nach Rezept, Krater, Risse, Terrassen, `terrainOps`), Normalen, Steigung und Materialgewichte je Eckpunkt. Rückgabe als übertragbare Puffer. Vorrang: Abstand, Blickrichtung, fehlende Eltern.
- **Cache** mit Obergrenze (Desktop 700 Chunks, Handy 260); Eltern bleiben, bis alle Kinder fertig sind (keine Löcher).
- **Optik:** Dreiplanare Detailtexturen (2 Materialien je Rezept + Fels nach Steigung), Detailnormalen in Fragment-Shader, Luftperspektive aus 5.
- **Kein Streuobjekt-System in M1** außer Felsbrocken als `InstancedMesh` nur in den Chunks der höchsten zwei Stufen nahe dem Spieler (Desktop ≤ 3.000, Handy ≤ 600).
- **Physik-Abfrage:** `ground(px,py,pz)` im Hauptfaden nutzt dieselbe `heightAt()` (schnelle Variante mit Zwischenspeicher je Chunk: bilineare Abfrage im fertigen Höhenraster, Fehler ≤ 5 cm gegen die Vollfunktion).

---

## 5. Atmosphäre, Licht, Wolken

- **Streuung** nach dem Ansatz mit Nachschlagetabellen (Durchlässigkeit 256×64, Mehrfachstreuung 32×32 einmal je Planet; Himmelsansicht 192×108 je Bild, halbe Gleitkommagenauigkeit). Rayleigh + Mie + Ozon-Anteil aus `atmo`.
- **Von außen** (Sektor, Orbit): Atmosphärenhülle als Kugel mit derselben Tabelle; der heutige Lichtsaum aus `planets.js` entfällt für den landbaren Körper.
- **Luftperspektive** auf Gelände, Schiffen und Figuren: Desktop HOCH/ULTRA als Froxel-Tabelle 32×32×32, sonst analytisch je Eckpunkt.
- **Sonne:** Richtung dreht mit `dayLen`; Licht auf dem Gelände = Sonnenfarbe × Durchlässigkeit; Schatten: vorhandene Schattenkarte nur nahe dem Spieler (Schiff, Figur, Landeplatz), Gelände ohne Schattenwurf in M1 (Selbstverschattung über Normalen und Horizont-Faktor).
- **Wolken (optional, ab HOCH):** eine Wolkenschale mit 2D-Rauschtextur, Windverschiebung, Schatten aufs Gelände per Projektion. Volumenwolken nicht in M1.
- **Wiedereintritt:** Glühen am Rumpf (Fresnel-Rand in Fahrtrichtung, Stärke aus `rho · v³`), Funken im vorhandenen Partikelpool, Kamerarütteln über `camrig`.

---

## 6. Flug-Anbindung (Schnittstelle zum neuen Flugkern)

Der Flugkern (`Code/src/flight/`, FLUG-ENTWURF 5 und 13) wird nicht von diesem Meilenstein gebaut, sondern genutzt. Benötigt wird:

```js
env = {
  frame,                         // 'S' oder Körper-Id
  gravity: [gx, gy, gz],         // zur Planetenmitte, nach Einflussbereich gewichtet
  rho,                           // Luftdichte nach Höhe (exponentiell, top aus atmo)
  up: [ux, uy, uz],              // NEU: lokales Oben für Horizont-Hilfe und Kamera
  capMax,                        // NEU: höhenabhängiges Höchsttempo (Orbitalflug), Infinity im Sektor
  ground(px, py, pz, out),       // out.h, out.nx/ny/nz, out.pad, out.mat (NEU: Material für Staub/Ton)
}
setFrame(state, frame, pose)     // aus FLUG-ENTWURF 13.4
```

**Wünsche an den Flugkern** (im Flug-Zweig einplanen, sonst blockiert Schritt 5):

1. `env.up` statt fester Sektor-Oberseite für die Horizont-Hilfe; Landemodus richtet nach `env.up` bzw. Bodennormale aus.
2. `env.capMax` begrenzt REISE: `capMax(h) = 180 + h / 12` m/s über 2 km Höhe (≈ 10 km/s bei 120 km, ≈ 350 m/s bei 2 km), darunter Modus-Höchsttempo. Der Deckel wird wie im Kern weich abgebaut (keine Stöße beim Sinken).
3. Luftwiderstand mit `rho` wie in FLUG-ENTWURF 5.4 Punkt 6, je Klasse `c_d·A/m`; Seitenschub in Atmosphäre × 0,8.
4. Landelogik 13.2 unverändert, mit Bodenabfrage über Gelände; Aufsetzgrenze Neigung ≤ 20°, Rutschen bis 25°, darüber kein Aufsetzen.
5. Neuer Zustand `docked`-gleich `parked` (gelandet, Pilot ausgestiegen): Schiff ist eingefroren, sendet 1 Hz, kann nicht beschädigt werden (M1 ohne Bodenkampf).
6. Zustand und Befehl bleiben im Netzformat v2 (`frame` im Paket).

Kamera (`render/camrig.js`): Verfolger und Cockpit nutzen `env.up` als Kamera-Oben unter 30 km; darüber Sektor-Oberseite, Übergang über 10 km Höhe weich gemischt. Neue Ansicht `foot` (Ego) mit eigenem Sichtfeld 75°.

---

## 7. Landen, Aussteigen, zu Fuß

### 7.1 Landeplatz

Je Planet ein Außenposten: eingeebnete Fläche (`terrainOps.flatten`), Plattform 140 m mit Markierung, Leitlichter (blinkend, Fraktionsfarbe), zwei Masten und ein Containerblock aus vorhandener Stationsgeometrie. Landefeld-Id im `ground()`-Ergebnis; Landen dort zeigt `LANDEPLATZ <NAME>` und ist Ziel der SYSTEM-Quest „Erste Landung“. Freies Landen überall, wo die Grenzen aus 6.4 passen.

### 7.2 Aus- und Einsteigen

- **Aussteigen:** nur `landed`, F halten 0,6 s (Controller Y halten, Touch Knopf AUSSTEIGEN). Kamera blendet in 0,8 s aus dem Cockpit/Verfolger zur Luke. Figur erscheint am Anker `hatch` des Schiffsmodells (fehlt er: Seitenmitte des Rumpfes, 1,5 m Abstand, auf Boden projiziert).
- **Einsteigen:** Figur ≤ 2,5 m vom Anker, Blick ≤ 60° zur Luke, F. Rückblende ins Schiff, Ansicht wie vor dem Aussteigen.
- Zustandsautomat im Pilot: `flying → landed → foot → landed → flying`; Wechsel nur über diese Kanten (Selbsttest).

### 7.3 Figurensteuerung (`world/foot.js`, rein, Node-tauglich)

| Wert | Gehen | Rennen | Springen | Luft |
|---|---|---|---|---|
| Tempo | 2,4 m/s | 5,6 m/s | Absprung 3,2 m/s (≈ 1,2 m bei g = 4,2) | Lenkung 30 % |
| Beschleunigung | 14 m/s² | 10 m/s² | – | 3 m/s² |

- Kapsel 1,8 m × 0,35 m, Schwerkraft zur Planetenmitte, Oben = `env.up`. Fester Schritt 1/60 s.
- Kollision: Höhenfeld (`ground`), Neigung > 40° rutscht; Boxen und Kapseln für Schiff (aus Modell-Bounding-Boxen je Klasse, 3–6 Boxen), Landeplatz, Container, Brocken. Stufen bis 0,35 m werden überstiegen.
- Ego-Kamera auf Augenhöhe 1,65 m, Nicken ±85°, leichtes Kopfwippen (abschaltbar), Landestoß beim Aufkommen.
- **Eingabe:**
  - Maus/Tastatur: WASD, Shift rennen, Leertaste springen, Maus umsehen (Zeigerfang), F interagieren.
  - Controller: linker Stick gehen (Stärke = Tempo), L3 rennen, A springen, rechter Stick umsehen (Kurve wie im Flug), Y interagieren.
  - Touch: linker virtueller Stick, rechte Bildhälfte ziehen = umsehen, Knöpfe SPRINGEN, RENNEN (umschaltend), interagieren am Kontext.
- Figur: eigene Low-Poly-Figur (≤ 4.000 Dreiecke, 16 Knochen), Gehen/Rennen/Springen/Stehen prozedural aus Schrittphase; Helmlicht bei Nacht.

---

## 8. Mehrspieler

- **Kanal je Planet:** `…-v2-<körper>` (wie Sektorkanäle aus FLUG-ENTWURF 10.1). Beim Rahmenwechsel S → P verlässt der Spieler den Sektorkanal und betritt den Planetenkanal (vorverbunden ab 30 km vor der Sektorgrenze, damit der Wechsel keinen Leerlauf hat).
- **Schiffspaket v2** unverändert, `frame` = Körper-Id; Bits `landed`, `parked`. Gelandete/geparkte Schiffe senden 1 Hz, sonst 9 Hz.
- **Figurenpaket** neu: `[ v=2, k='f', x·2, y·2, z·2 (0,05 m), gier i16, nick i8, zustand u8 (stehen/gehen/rennen/luft/landen), schiff-id ]`, 9 Hz bei Bewegung, 1 Hz im Stand. ~45 Byte.
- Darstellung: Hermite wie Schiffe, Figuren mit 130 ms Verzögerung; Laufbewegung aus Tempo und Zustand gerechnet, nicht übertragen.
- **Sichtbarkeit:** Figuren ≤ 3 km, Schiffe ≤ 40 km, darüber nur Marker. Höchstens 24 Figuren gleichzeitig gezeichnet.
- Kontingent: Planetenkanäle sind leerer als Sektoren; Grenze aus `MEHRSPIELER.md` gilt unverändert. Bei Server (Phase B/E1) wird der Planet eine eigene Zone `SURF`.

---

## 9. Bauplan in Reihenfolge

Jeder Schritt ist für sich spielbar (mindestens im Labor `?dev=planet&f=<fraktion>`), endet mit grünem `npm run check`, und das heutige Spiel bleibt unverändert, solange der Schalter `?planet=1` bzw. die spätere Einstellung aus ist.

| # | Inhalt | Spielbar | Abnahme headless (playwright-core, eigener Port) | Aufwand |
|---|---|---|---|---|
| **1** | `world/coords.js` (Vec3d, Rahmen, Posen), `world/gen/` (Rauschen, `heightAt`, Rezepte, `terrainOps`), `world/planets-def.js`, `engine/caps.js` erkennt `EXT_clip_control` | Labor: Planet als grobe Kugel aus dem Orbit, Kamera frei | **Node:** `heightAt` deterministisch (10.000 Punkte, zweimal gleich, Worker = Hauptfaden bitgleich); Ebnung am Landeplatz ±2 cm; Höhenbereich je Rezept. **Browser:** Labor lädt ohne Konsolenfehler, Bild `orbit.png`, `caps.clipControl` im Bericht. | 5–7 T |
| **2** | Quadtree, Chunk-Worker, Cache, Schürzen, kameranahes Zeichnen, Reverse-Z bzw. Zwei-Ebenen-Rückfall | Labor: freier Flug 200 km → 2 m ohne Sprung | Kamerafahrt mit 12 festen Punkten (`tools/playtest/planet.mjs`): **Lückentest** (Löschfarbe Magenta, Bodenbereich 0 Magenta-Pixel), **Flimmertest** (zwei Bilder bei 0,5 m Kameraverschub: Differenz nur am Rand), Chunk-Zahl und Dreiecke ≤ Budget, Netz-Eckpunkte gegen `heightAt` ≤ 5 cm, beide Tiefenwege (`?depth=split` erzwingt Rückfall). | 10–14 T |
| **3** | Atmosphäre (Tabellen, Himmel, Hülle von außen, Luftperspektive), Sonne mit Tageslauf, Detailtexturen, Brocken | Labor: Sonnenauf- und -untergang am Boden, Anflug durch Dunst | Farbtests: Zenit am Tag im Sollbereich je Rezept (Farbton ±15°), Horizont bei Sonnenstand 2° rötlicher als Zenit, Nachtseite dunkler als 5 % Leuchtdichte; Draw Calls ≤ Budget; Bilder für `ansichten.mjs` („Orbit Veyra“, „Boden Mittag“, „Boden Abend“). | 8–11 T |
| **4** | Heimatsektor im Orbit: `poseS`, Planet ersetzt Kulisse im Sektor 1 jeder Fraktion, Fern-Ebene im Sektor | **Spiel:** Heimatsektor sieht den echten Planeten | `ansichten.mjs` alle 15 Ansichten: Sektoren 2–8 pixelgleich zu vorher (Toleranz 0,5 %), Heimatsektor-Ansichten mit Planet; Draw Calls Sektor 1 ≤ +8; Bildzeit-Bericht. | 4–6 T |
| **5** | Flug-Anbindung: `env` aus Planet, Einflussbereich, `capMax`, Rahmenwechsel S ↔ P, Zonenwechsel in `world.js`, Wiedereintritt-Effekte, HUD Höhe/Sinkrate | **Spiel:** von der Station zum Boden und zurück fliegen (ohne Landen) | `planet.mjs --ablauf anflug` mit Testhaken `__ls.input.flight.inject`: Station → 1 km Höhe ≤ 120 s, Rahmenwechsel ohne Positionssprung (< 1 mm, Kamerabild-Differenz vor/nach < 1 %), keine NaN, Schwerkraft im Sektor = 0, zurück in Sektor und andocken. **Node:** Hin-/Rückwechsel < 1e-9 m. | 6–8 T |
| **6** | Landemodus auf Gelände, Landeplatz mit Lichtern, Staub, Ton (Wind nach `rho`, Aufsetzen) | **Spiel:** frei und auf dem Platz landen, abheben | Autoland auf Platz endet `landed` (Mittenabstand ≤ 20 m); Hang 15° gelingt, 30° verweigert mit Meldung; Sinkrate 8 m/s gibt Schaden, 14 m/s Absturz; Abheben bis 500 m. **Node:** Schweben bei g = 4,2 hält ±0,5 m über 10 s. | 5–7 T |
| **7** | Zu Fuß: `world/foot.js`, Ego-Kamera `foot`, Aus-/Einsteigen, Kollisionsboxen, Figur, Eingabe Maus/Tastatur, Controller, Touch | **Spiel:** aussteigen, laufen, springen, einsteigen, abheben | **Node:** Sprunghöhe ±5 %, Gehen/Rennen Tempo ±3 %, Kapsel durchdringt Schiffsboxen nie (10.000 Schritte Zufallseingabe), 40°-Grenze, Zustandsautomat nur erlaubte Kanten. **Browser:** Ablauf aussteigen → 20 m gehen → auf 1-m-Kiste springen → zurück → einsteigen → abheben, je einmal mit Tastatur, Controller (`controller.mjs`-Haken) und Touch (`hasTouch`, 375×812). | 10–13 T |
| **8** | Mehrspieler: Planetenkanal, Figurenpaket, geparkte Schiffe, Sichtbarkeit | **Spiel:** zwei Piloten landen nebeneinander und sehen sich | `tools/mehrspieler/test.mjs` erweitert, zwei headless Seiten: B sieht A's gelandetes Schiff (≤ 1 m, Lage ≤ 2°), A's Figur (≤ 0,5 m nach 130 ms) und Laufzustand; A steigt ein und hebt ab, B sieht es; Kanalwechsel S → P ohne doppelte Anwesenheit. | 6–8 T |
| **9** | Qualitätsstufen, Handy-Abstufung, Wolken (HOCH+), Coach/SYSTEM-Quest „Erste Landung“, Texte, Einstellung „PLANETEN: AN“ | **Spiel:** vollständige Szene aus Abschnitt 2 | Stufen NIEDRIG–EXTREM je ein Lauf `planet.mjs --ablauf szene` mit Bildzeit/Draw Calls/Dreiecke/Speicher (`speicher.mjs`) im Bericht gegen Budget 10; Handy-Emulation 375×812 ohne Fehler; `floskeln.mjs` sauber; Coach-Tasten je Eingabeart. | 6–8 T |

**Summe:** 60–82 Arbeitstage. Schritte 1–4 können parallel zum Flugumbau laufen (sie berühren `sim/world.js` und den Flugkern nicht). Ab Schritt 5 wird der Flugkern mit Landemodus (FLUG-ENTWURF Schritt „Landemodus“) vorausgesetzt.

Bildraten-Abnahme macht Toni am echten Mac und Handy; headless Werte (SwiftShader oder Headless-GPU) sind nur Richtwerte und Vergleich gegen den eigenen vorigen Stand.

---

## 10. Leistungsbudget

Ziel Mac (M5): **120 Bilder/s auf HOCH** (8,3 ms) auch am Boden, ≥ 60 auf EXTREM. Browser auf Mittelklasse-PC: 60 auf MITTEL. Handy (iPhone 13 / Android-Mittelklasse): 30–60 auf NIEDRIG, Renderskalierung 0,7.

| Posten | Mac HOCH | Handy NIEDRIG | Prüfung |
|---|---|---|---|
| Sichtbare Chunks | ≤ 260 | ≤ 110 | Bericht `planet.mjs` |
| Gelände-Dreiecke | ≤ 1,6 Mio. | ≤ 250.000 | Bericht |
| Zeichenaufrufe Planet gesamt | ≤ 300 | ≤ 130 | Bericht |
| Chunk-Erzeugung | ≤ 2 ms je 65²-Chunk im Worker, ≤ 8 Chunks/Bild hochladen | ≤ 4 ms je 33², ≤ 3/Bild | Node-Zeitmessung + Bericht |
| Hochladen GPU je Bild | ≤ 0,5 ms | ≤ 0,8 ms | GPU-Timer (`perf/gputimer.js`) |
| Atmosphäre (Himmelstabelle + Luftperspektive) | ≤ 0,6 ms GPU | ≤ 0,4 ms (analytisch) | GPU-Timer |
| Wolken | ≤ 0,8 ms | aus | GPU-Timer |
| Figurensteuerung + `ground` | ≤ 0,05 ms CPU | ≤ 0,1 ms | Node |
| 24 fremde Figuren | ≤ 24 Zeichenaufrufe (instanziert: 1) | ≤ 8 sichtbar | Bericht |
| GPU-Speicher Planet | ≤ 260 MB | ≤ 110 MB (iOS-Budget 0,8–1 GB gesamt) | `speicher.mjs` |
| Neues JS (gezippt) | ≤ 90 kB, Planet-Code nachgeladen erst beim Heimatsektor | gleich | Build-Bericht |
| Längstes Bild beim Rahmenwechsel | ≤ 25 ms | ≤ 50 ms | Bericht |

Neue Qualitätsschlüssel in `engine/settings.js` (5 Stufen wie vorhanden): `terrainError` (6/4/3/2/1,5 px), `terrainMaxLevel` (8/9/10/10/11), `atmoQuality` (analytisch/analytisch/Tabelle/Tabelle+Froxel/Tabelle+Froxel), `clouds` (aus/aus/an/an/an), `scatterDensity` (0,2/0,4/0,7/1/1,4), `chunkWorkers` (1/1/2/3/3).

---

## 11. Betroffene Dateien (spätere Umsetzung)

**Neu**

| Datei | Inhalt |
|---|---|
| `Code/src/world/coords.js` | Vec3d, Rahmen, Posen, Umrechnung |
| `Code/src/world/planets-def.js` | BodyDef der drei Körper |
| `Code/src/world/gen/noise.js`, `heightfield.js`, `recipes/*.js` | Rauschen, `heightAt`, Rezepte, `terrainOps` |
| `Code/src/world/chunk-worker.js` | Chunk-Erzeugung |
| `Code/src/world/env-planet.js` | `env` für den Flugkern (Schwerkraft, `rho`, `up`, `capMax`, `ground`) |
| `Code/src/world/foot.js` | Figurensteuerung, Kollision, Zustandsautomat |
| `Code/src/world/zone-planet.js` | Planetenzone: Landeplatz, geparkte Schiffe, Figuren |
| `Code/src/render/world/view.js` | kameranah, Tiefenwege, Nah/Fern |
| `Code/src/render/world/terrain.js` | Quadtree, Cache, Material |
| `Code/src/render/world/atmo.js` | Tabellen, Himmel, Hülle, Luftperspektive |
| `Code/src/render/world/clouds.js` | Wolkenschale |
| `Code/src/render/world/outpost.js` | Landeplatz und Leitlichter |
| `Code/src/render/world/figure.js` | Pilotenfigur, prozedurale Bewegung |
| `Code/tools/playtest/planet.mjs` | Labor- und Spielabläufe, Lücken- und Flimmertest, Bericht |

**Geändert**

| Datei | Änderung |
|---|---|
| `Code/src/render/renderer.js` | Weltansicht einhängen, Sektorwurzel kameranah im Rahmen P, Nah/Fern nach Höhe, `reverseDepthBuffer`-Option |
| `Code/src/render/camrig.js` | `env.up` als Kamera-Oben, Ansicht `foot`, Übergänge Aus-/Einsteigen |
| `Code/src/render/environment.js`, `planets.js` | landbaren Körper im Heimatsektor nicht mehr als Kulisse backen |
| `Code/src/sim/world.js` | Zone „Planet“ (wie Sprung, ohne Gegner), Pilotzustand `flying/landed/foot`, `env`-Lieferant |
| `Code/src/input.js`, `input/padflight.js`, `ui/hud-touch.js` | Belegung zu Fuß je Eingabeart |
| `Code/src/ui/hud-*.js` | Höhe, Sinkrate, Landehilfe, Interaktionshinweis, minimaler Fuß-HUD |
| `Code/src/net/mp-core.js`, `net/mp.js` | Planetenkanal, Figurenpaket, 1-Hz-Takt geparkt |
| `Code/src/engine/settings.js`, `engine/caps.js` | Qualitätsschlüssel, `clipControl`, Worker-Zahl |
| `Code/src/audio/audio.js` | Wind nach `rho`, Schritte nach `mat`, Aufsetzen |
| `Code/src/sim/system-quests.js`, `ui/hud-coach.js` | „Erste Landung“, Tastenhinweise |
| `Code/src/sim/selftest.mjs` | Tests aus Abschnitt 9 |
| `Code/tools/bilder/ansichten.mjs`, `tools/mehrspieler/test.mjs` | neue Ansichten, Planetenablauf |
| `Planung/SCHNITTSTELLEN.md`, `Planung/MEHRSPIELER.md`, `Planung/CONTROLLER.md` | Rahmen, Figurenpaket, Belegung zu Fuß |

---

## 12. Risiken und Gegenmaßnahmen

| Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|
| `EXT_clip_control` fehlt (Safari/iOS) | Z-Fighting am Boden, Flimmern in der Ferne | Zwei-Ebenen-Rückfall ab Schritt 2 mitgebaut und headless erzwungen geprüft |
| Chunk-Erzeugung zu langsam auf Handys | Löcher, grobes Gelände im Anflug | 33²-Chunks, Höchststufe 9, Vorrang nach Blick, Eltern bleiben bis Kinder fertig, Tempo-Deckel `capMax` begrenzt die Nachladerate |
| Eigene Shader und Kameranah-Versatz | Sektorobjekte springen im Rahmen P | nur Sektorwurzel versetzen; Pixelvergleich Sektoren 2–8 in Schritt 4 |
| Orientierung „Sektor oben, Planet unten“ | Spieler verliert Horizont beim Übergang | Kamera-Oben über 10 km weich mischen, Horizont-Hilfe nach `env.up`, Fluglageanzeige ab 30 km |
| Flugkern-Zeitplan | Schritt 5–7 blockiert | Schritte 1–4 parallel; Wünsche aus Abschnitt 6 früh an den Flug-Zweig geben |
| Figurengefühl „schwimmend“ | Zu-Fuß-Teil wirkt billig | feste Kennzahlen (7.3), Landestoß, Schrittton, Toni nimmt im Labor mit Reglern ab |
| GPU-Speicher iOS | Prozess beendet | Cache-Obergrenze, keine Gleitkomma-Höhentexturen, `speicher.mjs` im Schritt 9 |
| Mehrspieler-Kontingent | Kanalwechsel mit doppelter Anwesenheit | Vorverbinden mit Abmeldung im Sektor erst nach Übergabe, Test in Schritt 8 |
| Zielausweitung (Höhlen, Fahrzeuge, Bauen, Bodenkampf) | M1 wird nicht fertig | ausdrücklich nicht in M1 (Abschnitt 13) |
| Generator-Änderung nach Release | Landeplätze schweben/versinken | `genVersion` je Körper fest, Änderungen nur mit neuer Version |

---

## 13. Nicht in Meilenstein 1

Bodenkampf, Waffen zu Fuß, Fahrzeuge, Höhlen, Innenräume, Bauen, Rohstoffabbau, Planeten in Sektoren 2–8, Gasriesen betreten, Volumenwolken, Ozeane, Server-Autorität (kommt mit Phase B/E1 als Zone `SURF`).

---

## 14. Was Toni entscheiden oder tun muss

1. Entscheidungen E1–E6 (Abschnitt 1) abnehmen, besonders E1 (Landen vor Server) und E2 (WebGL statt WebGPU für M1).
2. Namen Veyra, Orrin, Morvak bestätigen oder ersetzen.
3. Wünsche an den Flugkern (Abschnitt 6) in den Flug-Zweig übernehmen lassen.
4. Bildraten und Gefühl am echten Mac (M5), einem Windows-Browser und einem Handy abnehmen (headless liefert nur Richtwerte).
5. Später: ob eine Meshy-Pilotenfigur die Code-Figur ersetzen soll (Generierung nur mit Freigabe).

## Nachtrag 03.11.2026: Weite, Hyperschub und Schubregler (Wunsch Toni, geht vor E4)

Toni will Realismus: Der Weg zu einem Mond soll sich **wirklich weit** anfühlen. Lange Strecken fliegt man mit einem eigenen Fernantrieb, dem **HYPERSCHUB** (eigener Name, kein Nachbau). Kurze Strecken fliegt man mit normalem Schub, den man **stufenlos regeln** kann.

- **Maßstab neu:** Der landbare Mond liegt nicht mehr 120 km unter dem Sektor, sondern **mehrere tausend Kilometer entfernt** (Richtwert 8.000–25.000 km vom Heimatsektor). Mit normalem Schub dauert der Weg Stunden. Das ist gewollt, damit der Hyperschub Sinn hat. Am Himmel des Sektors steht der Mond klein und in echter Größe, kein Kulissenbild.
- **Größe des Körpers:** Radius möglichst **150–300 km**, wenn das Chunk-Budget es zulässt (zwei weitere Quadtree-Stufen). Das Handy zeigt denselben Körper gröber. Messung vor der Entscheidung, Untergrenze bleibt E4 (45–70 km).
- **HYPERSCHUB:**
  - Ziel wählen (Mond, Station, Orbitmarke) und den Bug in einen Ausrichtekegel von etwa 5° bringen.
  - Taste halten → **Hochlaufen 4–6 s** mit Ton, Vibration und Lichttunnel → Reise mit sehr hohem Tempo (Richtwert: 20.000 km in 30–60 s, sanft beschleunigen und abbremsen).
  - **Austritt** etwa 300–1.000 km über dem Ziel, dann normaler Schub oder REISE hinunter in die Atmosphäre (Ablauf ab Schritt 3 wie oben).
  - Im Kampf, mit offenem Fahrwerk und in Atmosphäre gesperrt. Treffer beim Hochlaufen brechen ab.
  - HUD: Zielmarke mit Entfernung und Ankunftszeit, Ausrichtehilfe, Hochlaufbalken. Funktioniert auf Maus, Controller und Touch, auch im Mehrspieler: Der Mitspieler kann sich an den Sprung anhängen oder hinterher fliegen.
- **Schubregler:** Der normale Schub ist stufenlos regelbar, als Zieltempo zwischen 0 und dem Höchsttempo des Modus (KAMPF, REISE, LANDUNG).
  - Auf dem Mausrad liegt der vorhandene BEGRENZER bzw. Tempomat. Auf dem Controller das Steuerkreuz hoch und runter oder ein eigener Regler, auf Touch ein Schieber.
  - Das HUD zeigt Soll- und Ist-Tempo.
  - REISE darf auf dem freien Weg zum Mond deutlich schneller sein als im Sektor (Richtwert bis einige km/s), bleibt aber weit unter dem Hyperschub.
- **Gefühl für Weite:** Mond und Planet wachsen beim Anflug spürbar. Entfernungen stehen in km bzw. Mm, Ankunftszeiten im HUD. Bei sehr hohem Tempo gibt es Sternstreifen bzw. Partikel, damit Geschwindigkeit sichtbar wird.
- **Technik:** Weltorte in double, kameranah gezeichnet (siehe Abschnitt Rahmen), damit 25.000 km ohne Zittern gehen. Selbsttest: Flug 25.000 km, danach Genauigkeit < 1 mm.
