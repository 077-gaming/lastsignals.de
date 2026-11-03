# LAST SIGNALS · Schiffsqualität (Stand 03.11.2026, Nachbesserung Runde 2)

Ziel (Toni): Die Spielerschiffe sind das Wichtigste und sollen mit dem Grafikstand auf Space-Shooter-Niveau kommen.
Dieser Stand betrifft die 24 Meshy-Rümpfe (Starter bis Schiff 8, je Europa/Saturn/Eris), Drohnen und Sprungtor.

## Materialkarten (alle 24 Rümpfe)

Werkzeug außerhalb des Repos (liest Meshy-Rohdateien aus dem Vault, die nicht ins öffentliche Repo gehören):
`LAST-SIGNALS-Uebergabe/werkzeug/schiffe-q/qualitaet.mjs <s1..s8>`, alle Klassen mit `alle.sh` (3 Stränge, ≈ 4–5 min).
Eingabe sind die Spieldateien nach dem Meshy-Einbau (Fraktionslackierung schon in der Farbe, gesichert in `quelle/`).

| Karte | Inhalt | Herkunft |
|---|---|---|
| Farbe (sRGB) | Fraktionslackierung, Kennungen entfernt (Spenderstück), Ränder aufgefüllt, leichte Kantenabnutzung; Europa-Gold geglättet und satter, Saturn/Eris-Akzent kräftiger | Spieldatei |
| Normal (linear) | Kanten-Normalen aus der Geometrie (Auto-Glättung 50°, Anteil 55 %) + Detailhöhe (Luminanz-Bandpass r1–r3, Stärke 0,9; an entfernten Kennungen null) | Geometrie + Rohtextur |
| ORM (linear) | R Umgebungsverdeckung (32 Strahlen je Texel, 1K, beide Seiten, Reichweite 12 % der Länge, Stärke 80 %), G Rauheit, B Metall | Strahlen + Farbanalyse |
| Leuchten (sRGB) | Düsen/Lichtleisten: Europa Eisblau, Saturn Bernstein, Eris Violett (gleich hell); kleine warme/rote/grüne Lichtpunkte; Stärke 2,2. Schiff 2: keine (Rohtextur ohne Leuchtflächen, Karte weggelassen) | Rohtextur |

Rauheit/Metall je Fraktion (Rumpf / Akzent): Europa 0,22 · 0,44 / 0,9 · 0,36, Saturn 0,72 · 0,36 / 0,35 · 0,4,
Eris 0,8 · 0,3 / 0,5 · 0,28. Saturn/Eris: Rumpfrauheit höchstens 0,5, dunkler Lack zählt nicht als „Dunkelteil“
(Gummi, Öffnungen). Der Tangentenraum folgt three.js ohne Tangenten (Ableitungs-Basis, glTF-Grün = oben).

„Gebackene Formnormalen“ aus einem Hochpolygon-Modell sind nicht möglich: Meshy liefert nur das Spielnetz
(14–33 Tsd. Dreiecke). Stattdessen werden harte Kanten aus dem Netz selbst gebacken.

### Abnahmeprüfung Bänderung (neu in Runde 2)

Das Werkzeug misst je Stufe das Verhältnis mittlerer Zeilen- zu Spaltengradient (Ziel ≈ 1,0) und bricht ab, wenn ein
ORM-Kanal nach WebP über 1,3 (bzw. unter 1/1,3) liegt (`report.band` in `arbeit/<klasse>.json`).
Ursache der Bänderung in Runde 1: `sharp` lieferte beim Vergrößern 1-kanaliger Rohdaten zeilenversetzte Ausgabe
(Verdeckung 1K → 2K: 77 : 1, nach WebP 5–9 : 1 in allen drei Kanälen). Jetzt eigene bilineare Vergrößerung; der
gleiche Fehler steckte in der 4K-Höhe der Klassen 1–7 und ist mit behoben.
Stand: Verdeckung 1K/2K 1,00–1,04, ORM vor/nach Push-Pull und nach WebP 0,96–1,04 (alle 24 Rümpfe).
Die Normalkarte hat naturgemäß ungleiche Kanäle (X 0,85 / Y 1,35: Ableitungen), das ist keine Bänderung.

## Meshy-Kennungen

Weiße „S01“…„S08“-Schriftzüge: Top-Hat-Filter (Helligkeit minus Grauwert-Öffnung r = 6) auf der Rohtextur, Zeichen als
kompakte Komponenten, Gruppen aus 2–7 Zeichen. Runde 2: Kennungen mit Bindestrich fielen durch das Größenverhältnis
(der Strich ist klein); das Verhältnis zählt jetzt nur die Hauptzeichen, neue Kandidaten hängen hinten an (Nummern der
bisherigen Freigaben bleiben). Fundstellen werden im Kontaktbogen gesichtet und in `werkzeug/schiffe-q/kennungen.json`
freigegeben; was der Filter nicht trennt, steht als `rechtecke` (helle Texel bzw. `[…, 1]` = ganze Fläche).
Nachträge Runde 2: S3 Flügel rechts (UV ≈ 0,69/0,655) und „-03“ oben (zweite Insel), S5 „S05“ Flanke/Unterseite,
S6 zwei Gruppen, S7 „S07“ unter dem unteren Flügel (geprägt) und gespiegelt auf dem Flügel.
Maskiert werden Farbe UND Detailhöhe (2K und 4K): keine Prägung an der Fundstelle.

Füllung: je Fundstelle ein Spenderstück aus der Nachbarschaft (gleiche Fläche im Raum, unmaskiert, Rand passt am
besten, keine fremde Farbe) mit seiner Plattenstruktur und seinem Glanz; Grundton aus der Push-Pull-Füllung. Gleiche
Spender für Rohtextur und alle drei Fraktionen. Statt Push-Pull-Fleck jetzt Plattenstruktur.

„S0-01“ (S1 hinter dem Cockpit), „-03“, „xK-04“: Das war die aufgelegte Kennungstafel des Spiels („EU-01“, „SA-04“ …),
die auf Stufen halb im Rumpf lag. Meshy-Rümpfe bekommen sie nicht mehr (`_shipMarks`), nur Platzhalter-Rümpfe.

Prüfung im Spiel: `tools/bilder/umlauf.mjs` (alle 24 Rümpfe, 4K, 8 Winkel ohne Halle, Kontaktbogen je Rumpf),
`tools/models/kennung-suche.mjs` (Texterkennung auf Hangar-Umläufen → UV), `tools/models/uv-punkt.mjs` (Bildpunkt →
Texel für Rechtecke).

## Zwei Texturstufen

- **2K** (im GLB, alle Stufen, Browser/Mobil): Farbe, Normal, ORM, Leuchten je 2048 (Schiff 2 ohne Leuchten).
- **4K** (`public/models/hd/`): Farbe je Schiff, Normalkarte je Klasse. Nur für das eigene, aktive Schiff (Flug und
  Hangar), auf ULTRA; in der Desktop-App (`window.lsDesktop`) ab HOCH, nie auf NIEDRIG/MITTEL, nie auf Handy/Tablet
  oder ohne 4096er-Texturen (`perf/quality.js hdTextures`; Entwicklung: `?hd=1` / `?hd=0`).
- Schiffswerft: Standbilder beim Durchblättern immer 2K. Schiffswechsel (Flug) und andere Rümpfe im Hangar geben
  ihre 4K-Karten frei; Hangar verlassen gibt alle frei und leert den Zwischenspeicher (`ModelFactory.setShipHd`,
  `releaseShipHd`, je Modell eigene Texturkopien → nur der Grafikspeicher dieser Grafik-Engine wird frei).
- Ehrlich: Die Rohtexturen der Klassen 1–7 haben nur 2K. Deren 4K-Farbe ist mit Lanczos hochskaliert (Runde 2 ohne
  Nachschärfen), Feinstruktur kommt aus der 4K-Normalkarte (Bandpass r1–r5, Stärke 1,5, weltfestes Rauschen 0,025)
  und ist keine echte Mehrinformation. Schiff 8 (Meshy image-to-3D) hat eine echte 4K-Rohtextur.

## Darstellung im Shader (`render/surface.js glbShipDetail`)

- Runde 2: Das Plattenraster im Objektraum ist entfernt – es lief als gestrichelte Naht quer über die Meshy-Panele.
  Die Fugen trägt die Textur. Nahdetail bleibt (Gebrauchsspuren, Kratzrichtung in der Rauheit, Kantenglanz an
  Geometriekanten), nur nah, über `factory.uShipDetail` ab HOCH.
- Fresnel-Randlicht in Fraktionsfarbe (Europa Blassgold 0,06, Saturn Bernstein 0,16, Eris Violett 0,24), immer an:
  Silhouette vor dunklem Nebel.
- Klarlack auf gebackenen Karten 0,15 (vorher 0,3), Rauheit 0,42: Schiff 8 Europa wirkt nicht mehr gläsern.

## Hangar

Belichtung je Lackierung (`station-bay.js setShip`): Europa unverändert (Oberlicht 1,5, Kante 1,9, Umgebung 0,3),
Saturn 1,6 / 2,4 / 0,42, Eris 1,9 / 3,1 / 0,62 (Füllung 0,85). Prüf-Haken (nur Entwicklung): `window.__lsBay.orbit
= { yaw, pitch, dist, dx, clean }` für feste Nahaufnahmen.

## Größe der Klassen

Meshy-Rümpfe nach Grundfläche √(Länge × Breite) (`SHIP_FOOT`, je Klasse ≈ 13 % mehr, Fraktionen gleich groß):

| Klasse | L × B | Radius |
|---|---|---|
| S1 | 42 × 38 | 24,7 |
| S2 | 53 × 39 | 29,5 |
| S3 | 58 × 46 | 32,9 |
| S4 | 62 × 55 | 36,2 |
| S5 | 88 × 50 | 46,1 |
| S6 | 84 × 67 | 47,6 |
| S7 | 99 × 73 | 55,2 |
| S8 | 189 × 49 | 85,5 |

Verfolgersicht (Runde 2, `render/camrig.js`): Abstand ∝ √(Radius) (bezogen auf den Starter), nie näher als 1,45
Radien; lange Rümpfe (Radius > 45 m) bis 9° steiler und 17° seitlich (Dreiviertelsicht). Gleiche Szene, Bildanteil
der projizierten Hülle (Breite × Höhe, `tools/bilder/groessen.mjs`):

| Klasse | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| nachher | 19 × 18 % | 18 × 15 % | 18 × 18 % | 25 × 18 % | 22 × 25 % | 26 × 26 % | 28 × 27 % | 22 × 57 % |
| vorher (S1/S4/S8) | 21 × 19 % | | | 22 × 15 % | | | | 6 × 18 % |

Schiff 8 ist schlank (189 × 49 m): von hinten zählt seine Länge (57 % der Bildhöhe), die Fläche im Bild ist 3,7-mal
die des Starters. S2/S3 wirken von hinten kaum größer als der breite Starter (Flügelspannweite), ab S4 steigt es.

## Cockpit (`render/cockpit.js`)

Konsole, Unterbau, Seitenkonsolen und Kanzelwände mit gezeichneter Blechverkleidung (Platten, Schrauben, Schalter,
Griffleiste, Warnstreifen), weniger Metall (ohne Umgebungskarte war es schwarz), helleres Grundlicht. Seitenkonsolen
und Wände reichen bis hinter den Sitz, Kanzelsims mit Leuchtleiste in Fraktionsfarbe: beim Umsehen keine schwarze
Platte mehr. Prüfung: `tools/bilder/cockpit.mjs`.

## Drohnen und Sprungtor

- Voyager/Cassini/Juno: alle Stufen Meshy (Stufe 1 und 10 aus l05 abgeleitet). Pioneer hat kein Meshy-Modell.
- Sprungtor: Meshy-Ring bleibt, Schacht unter der Flugebene auf 12 % gestaucht, Wirbel-/Tunnelschichten an.

## Leistung (Apple-Chip, 960 × 600, HOCH, `tools/bilder/ansichten.mjs`, unsichtbar, fester Zufall, Welt angehalten)

Grafikzeit im Flug nachher 2,1–5,4 ms (flug-*, schiff-nah, kampf-*, cockpit, feld, tor, schiff5, kampf-eris-s6);
Ziel ≤ 8 ms gehalten. Stationsansichten (angedockt, kein Flug) schwanken unsichtbar stark (9–21 ms, teils schwarze
Übergangsbilder in beiden Ständen) und sind kein Flugwert.

## Speicher (`tools/bilder/speicher.mjs`, alle WebGL-Kontexte, Texturen + Renderpuffer)

Ablauf: andocken, Hangar, alle 8 Klassen als eigenes Schiff, Werft durchblättern (30 Karten), Hangar verlassen.

| Einstellung | Spitze | Ende | 4K-Texturen gleichzeitig (höchstens) |
|---|---|---|---|
| Browser ULTRA | 1.746 MB | 1.746 MB | 4 (Flug + Hangar je Farbe + Normal), nach Verlassen 2 |
| Desktop-App HOCH | 1.733 MB | 1.716 MB | 4, nach Verlassen 2 |
| Desktop-App MITTEL | 1.864 MB | 1.864 MB | 0 |
| Browser HOCH | 1.932 MB | 1.932 MB | 0 |

Die 4K-Stufe ist begrenzt (nie mehr als ein Rumpf je Grafik-Engine). Die Spitze kommt aus den 2K-Karten aller
durchgeschalteten Rümpfe, die beide Grafik-Engines im Zwischenspeicher behalten (≈ 45–85 MB je Klasse); das betrifft
nur dieses Extrem (alle Klassen nacheinander) und ist ein offener Punkt für einen Modell-Auslagerer.
Je 2K-Textur ≈ 22,4 MB, je 4K-Textur ≈ 89,5 MB (RGBA8 mit Mipmaps). Download: Schiffsdateien 58 MB (24 Dateien),
4K-Zusatz 31 MB.

## Belege (`LAST-SIGNALS-Uebergabe/bilder/schiffe-qualitaet/`)

- `r2-vorher-high/`, `r2-nachher-high/`: je Klasse Hangar + 5 Hangar-Nahaufnahmen (alle drei Fraktionen),
  Verfolger, nah, Cockpit (zwei Fraktionen je Klasse); Bögen `r2-vergleich-high/<klasse>-<fraktion>.jpg`
- `r2-vorher-ultra/`, `r2-nachher-ultra/` (4K, S1/S2/S6/S8), Bögen `r2-vergleich-ultra/`
- `r2-umlauf-4k/`: alle 24 Rümpfe aus 8 Winkeln, `<klasse>-<fraktion>-bogen.jpg`
- `r2-groessen-vorher/`, `r2-groessen-nachher/` (Staffelung), `r2-kampf-eris-s6-vergleich.jpg`
- `r2-ansichten-vorher-high/`, `r2-ansichten-nachher-high/` (Leistung), `r2-speicher-*.log`
- Vorher-Stand: Commit f9d6716 (nach dem Meshy-Einbau) mit nur dem Kamera-Prüf-Haken der Bucht nachgerüstet.
- Aufnahme: `cd Code && Q=high node tools/bilder/schiffe.mjs <ordner> http://localhost:5198`,
  Bögen: `python3 vergleich2.py <vorher> <nachher> <ausgabe>` im Belegordner.
