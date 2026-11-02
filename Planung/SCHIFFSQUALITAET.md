# LAST SIGNALS · Schiffsqualität (Stand 02.11.2026)

Ziel (Toni): Die Spielerschiffe sind das Wichtigste und sollen mit dem Grafikstand auf Space-Shooter-Niveau kommen.
Dieser Stand betrifft die 24 Meshy-Rümpfe (Starter bis Schiff 8, je Europa/Saturn/Eris), Drohnen und Sprungtor.

## Materialkarten (alle 24 Rümpfe)

Werkzeug außerhalb des Repos (liest Meshy-Rohdateien aus dem Vault, die nicht ins öffentliche Repo gehören):
`LAST-SIGNALS-Uebergabe/werkzeug/schiffe-q/qualitaet.mjs <s1..s8>`, alle Klassen mit `alle.sh` (3 Stränge, ≈ 4 min).
Eingabe sind die Spieldateien nach dem Meshy-Einbau (Fraktionslackierung schon in der Farbe, gesichert in `quelle/`).

| Karte | Inhalt | Herkunft |
|---|---|---|
| Farbe (sRGB) | Fraktionslackierung wie bisher, Kennungen entfernt, Ränder der UV-Inseln aufgefüllt, leichte Kantenabnutzung | Spieldatei |
| Normal (linear) | Kanten-Normalen aus der Geometrie (Auto-Glättung 50°, Anteil 55 %) + Detailhöhe (Luminanz-Bandpass der bereinigten Rohtextur, Sobel nur innerhalb einer Fläche) | Geometrie + Rohtextur |
| ORM (linear) | R Umgebungsverdeckung (32 Strahlen je Texel, 1K, beide Seiten, Reichweite 12 % der Länge, Stärke 80 %), G Rauheit, B Metall | Strahlen + Farbanalyse |
| Leuchten (sRGB) | Düsen/Lichtleisten (Cyan/Blau) + kleine warme/rote/grüne Lichtpunkte, Stärke 2,2 | Rohtextur |

Rauheit/Metall je Fraktion (Rumpf / Akzent): Europa 0,22 · 0,44 / 0,9 · 0,3, Saturn 0,72 · 0,38 / 0,35 · 0,42,
Eris 0,8 · 0,32 / 0,5 · 0,3. Dunkelteile (Gummi, Öffnungen) matt und kaum metallisch, Fugen matter, an konvexen
Kanten blankes Metall (dezent). Der Tangentenraum folgt three.js ohne Tangenten (Ableitungs-Basis, glTF-Grün = oben).

„Gebackene Formnormalen“ aus einem Hochpolygon-Modell sind nicht möglich: Meshy liefert nur das Spielnetz
(14–33 Tsd. Dreiecke). Stattdessen werden harte Kanten aus dem Netz selbst gebacken (Kanten-Normalen gegen die
weich interpolierten Ecken-Normalen).

## Meshy-Kennungen

Weiße „S01“…„S08“-Schriftzüge: Top-Hat-Filter (Helligkeit minus Grauwert-Öffnung r = 6) auf der Rohtextur, Zeichen als
kompakte Komponenten, Gruppen aus 2–5 Zeichen. Die Fundstellen jeder Klasse wurden im Kontaktbogen gesichtet und
in `werkzeug/schiffe-q/kennungen.json` freigegeben (Fehltreffer an hellen Kanten verworfen). Füllung per Push-Pull
aus der Umgebung (gleiche Maske für alle drei Fraktionen und für die 4K-Rohtextur von Schiff 8).
Grenze: Kennungen, deren Zeichen zu einer Fläche verschmelzen, findet der Filter nicht; Nachtrag dann als
`rechtecke` in `kennungen.json`.

## Zwei Texturstufen

- **2K** (im GLB, alle Stufen, Browser/Mobil): Farbe, Normal, ORM, Leuchten je 2048.
- **4K** (`public/models/hd/`): Farbe je Schiff, Normalkarte je Klasse (für alle Fraktionen gleich). Geladen nur für
  das eigene Schiff und den Hangar, auf ULTRA oder in der Desktop-App (`window.lsDesktop`), nie auf Handy/Tablet
  oder ohne 4096er-Texturen (`perf/quality.js hdTextures`; Entwicklung: `?hd=1` / `?hd=0`).
- Ehrlich: Die Rohtexturen der Klassen 1–7 haben nur 2K. Deren 4K-Farbe ist mit Lanczos hochskaliert und leicht
  geschärft, die zusätzliche Feinstruktur kommt aus der 4K-Normalkarte (weltfestes Rauschen: Mulden, Körnung) und
  ist keine echte Mehrinformation. Schiff 8 (Meshy image-to-3D) hat eine echte 4K-Rohtextur; sie liefert dort
  Detailhöhe und Hochpass-Detail der Farbe.

## Feindetail im Shader (`render/surface.js glbShipDetail`)

Plattenfugen 2,4 × 1,6 m im Objektraum (Meter über den Rumpf-Maßstab), Gebrauchsspuren (Rauheit, Flecken),
Kantenglanz an Geometriekanten. Nur aus der Nähe (Platte ≥ ≈ 40 Bildpunkte), dezent, über `factory.uShipDetail`
ab HOCH an, auf NIEDRIG/MITTEL aus (Zweig wird übersprungen). Hangar: immer an.

## Größe der Klassen

Meshy-Rümpfe werden nach Grundfläche √(Länge × Breite) skaliert (`SHIP_FOOT` in `render/models.js`), je Klasse
≈ 13 % mehr, Fraktionen einer Klasse gleich groß:

| Klasse | vorher L × B (Fläche) | neu L × B (Fläche) | Radius |
|---|---|---|---|
| S1 | 44 × 39 (1.722 m²) | 42 × 38 (1.600 m²) | 24,7 |
| S2 | 54 × 40 (2.150) | 53 × 39 (2.070) | 29,5 |
| S3 | 62 × 48 (2.986) | 58 × 46 (2.652) | 32,9 |
| S4 | 70 × 62 (4.370) | 62 × 55 (3.422) | 36,2 |
| S5 | 79 × 45 (3.547) | 88 × 50 (4.356) | 46,1 |
| S6 | 88 × 71 (6.224) | 84 × 67 (5.625) | 47,6 |
| S7 | 97 × 71 (6.908) | 99 × 73 (7.225) | 55,2 |
| S8 | 106 × 27 (2.874) | 189 × 49 (9.216) | 85,5 |

Radius (Kamera-Abstand, Effekte) = 0,3 × (Grundflächen-Maß + größte Ausdehnung). Cockpit: `HP_Cockpit` wächst mit
dem Rumpf. Hangar: Rümpfe über 128 m werden in der Halle verkleinert gezeigt, die angezeigten Maße bleiben echt.
Trefferradius der Simulation unverändert.

## Drohnen und Sprungtor

- Voyager/Cassini/Juno: alle Stufen Meshy (Stufe 1 und 10 aus l05 abgeleitet, unterscheidbar über Größe, Ton,
  Leuchten). Pioneer hat kein Meshy-Modell und bleibt beim bisherigen Satz.
- Sprungtor: Meshy-Ring bleibt, Schacht unter der Flugebene im Vertex-Shader auf 12 % gestaucht (keine dunkle
  Trommel mehr in der Verfolgersicht), Wirbel-/Tunnelschichten wieder an.

## Leistung und Speicher (Apple-Chip, 960 × 600, HOCH, `tools/bilder/ansichten.mjs`)

Grafikzeit im Flug nachher 2,4–4,9 ms (flug-*, schiff-nah, kampf-*, cockpit, feld, tor, schiff5); Ziel ≤ 8 ms
gehalten. Stationsnahe Ansichten liegen vorher wie nachher bei ≈ 9–11 ms (Station, nicht Schiff). Sprungtor
4,7 → 2,6 ms, weil der Schacht nicht mehr den halben Bildschirm füllt. Messwerte schwanken je Lauf um ± 1–2 ms.

Grafikspeicher eigenes Schiff (RGBA8 mit Mipmaps, ≈ 22,4 MB je 2K-, ≈ 89,5 MB je 4K-Textur):

| Stufe | Texturen | Speicher |
|---|---|---|
| vorher S1–S4 | Farbe 2K + Leuchten 1K | ≈ 28 MB |
| vorher S5–S8 | 4 × 2K | ≈ 90 MB |
| 2K (alle) | Farbe, Normal, ORM, Leuchten 2K | ≈ 90 MB |
| 4K (ULTRA/Desktop) | Farbe + Normal 4K, ORM + Leuchten 2K | ≈ 224 MB (Hangar als eigene Grafik-Engine noch einmal) |

Download: Schiffsdateien 34 MB → 54 MB (24 Dateien, je 1,9–3,5 MB; ein Spieler lädt nur sein eigenes Schiff),
4K-Zusatz 40 MB (eigenes Schiff ≈ 1,5–5,9 MB).

## Belege

`LAST-SIGNALS-Uebergabe/bilder/schiffe-qualitaet/`: `vorher-high`, `nachher-high` (Hangar, Verfolger, nah, Cockpit
je Klasse), `vorher-ultra`, `nachher-ultra` (mit 4K), Vergleichsbögen `vergleich-high/`, `vergleich-ultra/`,
Sprungtor `tor-vergleich.jpg`, Leistung `ansichten-vorher-high/`, `ansichten-nachher-high/`.
Aufnahme: `cd Code && Q=high node tools/bilder/schiffe.mjs <ordner> http://localhost:5198`.
