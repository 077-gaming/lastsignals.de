# LAST SIGNALS · Schiffsqualität (Stand 03.11.2026, Nachbesserung Runde 3)

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

### Füllung Runde 3 (Schleier, Blöcke, Prüfung)

- Grundton der Füllung nur aus dem Untergrund der Schrift (Texel zwischen den Zeichen, Schriftkern + 2 Texel
  ausgenommen) und aus tongleichen Randtexeln (Gewicht nach Helligkeitsabstand zum Untergrund); vorher Push-Pull über
  die weite Umgebung → fremde Farbe und helle Schriftränder ergaben einen hellen Schleierfleck. Spender liefert nur den
  Helligkeits-Feinanteil (±0,1, keine fremden Farbsplitter), Spenderwahl bestraft fremde Struktur (Fugen). Schriftrand
  5 statt 3 Texel.
- Blockbildung in 4K (S1 Saturn Flanke): kam aus dem Wertrauschen der Feinstruktur (Gitter in den Ableitungen), das in
  Füllungen ohne Detailhöhe allein stand. Jetzt Gradientenrauschen (Perlin, Quintik), Detailhöhe an Fundstellen zur
  Hälfte vom Spender.
- Prüfung je Fundstelle in `qualitaet.mjs` (Abbruch, `PRUEF=warn` nur Hinweis): Helligkeit an der 2K-Farbe (Median der
  Füllung höchstens 0,05 über dem oberen Quartil bzw. 0,12 unter dem unteren Quartil des Bezugs = Untergrund + Rand)
  und Blockigkeit an der 4K-Detailhöhe samt Feinstruktur (Feinanteil |x − Mittel 3×3| höchstens 1,5 × Bezug); 4K-Farbe
  ebenso, fertige 4K-Normalkarte nur als Hinweis (Geometriekanten durch eine Fundstelle zählen dort mit). Alle 24 Rümpfe
  bestanden: 2K-Farbe Helligkeitsabweichung ≤ 0,035, Feinanteil 4K-Höhe ≤ 0,64, 4K-Farbe ≤ 1,35.
- Übermalen (`kennungen.json` „uebermalen“): S3 heller Fleck an der Unterseite (eigene kleine UV-Insel ohne Rand zum
  Füllen) im Ton der umgebenden Fläche, in Rohtextur und allen drei Lackierungen.
- Saturn/Eris: unter umgefärbten Düsen-/Leuchtflächen ist die Grundfarbe jetzt dunkel in der Leuchtfarbe. Vorher lag
  das Bernstein-Leuchten auf Cyan-Lack und ergab eine cremeweiße Fläche (S3 Saturn Gondel) – jetzt bernsteinfarben.
- Schiff 8 (image-to-3D): helle Umrisslinien der Rohtextur an allen Plattenkanten (Präge-/Halo-Saum) über einen
  Grauwert-Zylinderhut (Öffnung r 2) auf 25 % gedämpft, in Farbe (2K und 4K-Hochpass) und Detailhöhe; Detailhöhe flacher
  (2K 0,6, 4K 1,0).
- Kontaktbögen der Fundstellen (2K links, 4K rechts, je Fraktion): `bilder/schiffe-qualitaet/r3-fuellung/<klasse>-fuellung(-vorher).jpg`.

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
- Fresnel-Randlicht in Fraktionsfarbe (Runde 3: Europa 0,05, Saturn 0,10, Eris 0,10; S5/S6 × 0,8, S7/S8 × 0,6), nicht
  mehr unbeleuchtet addiert: gewichtet mit der Beleuchtung an der Stelle (direkt + Umgebung, auf die Grundfarbe
  bezogen, 20–100 %) und der Umgebungsverdeckung – kein violettes Plastik in Spalten und im Schatten.
- Rumpfaufhellung (Runde 3, `SHIP_FILL`): weiches Füll-/Kopflicht aus Kamerarichtung auf der Grundfarbe, nur auf dem
  Rumpf (Saturn 0,25, Eris 0,6; große Rümpfe Eris × 3, Saturn × 1,6, S5/S6 halb so viel Zuschlag). Lesbarkeit vor
  dunklem Nebel über Plattenstruktur statt über den Umriss. Faktor je Grafik-Engine (`factory.uShipFill`: Flug 1,
  Hangar Europa 0,45 / Saturn 0,7 / Eris 1,4).
- Positionslichter echter Rümpfe sitzen auf der Flügelspitze (vorher 0,3 m außen, 0,4 m darüber: bei hängenden
  Flügelspitzen ein schwebender Punkt neben S3 Saturn).
- Klarlack auf gebackenen Karten 0,15 (vorher 0,3), Rauheit 0,42: Schiff 8 Europa wirkt nicht mehr gläsern.

## Hangar

Belichtung je Lackierung (`station-bay.js setShip`, [Oberlicht, Kante, Füllung, Umgebung, Kontur, Höhe Kantenlicht]):
Europa 1,5 / 1,9 / 0,45 / 0,3 / 0 / 22, Saturn 1,6 / 2,4 / 0,6 / 0,42 / 0,9 / 30, Eris 2,0 / 1,7 / 1,05 / 0,62 / 2,6 / 58.
Runde 3 Eris: Kantenlicht steil statt flach von hinten (spiegelte als heller Bodenfleck vor der Kamera), Konturlicht
steil von hinten oben setzt Rücken und Flügelkanten vom Hintergrund ab, Boden und Plattform matter und dunkler,
Rumpfaufhellung 1,4. Belege: `r3-hangar-eris-s2-vergleich.jpg`, `r3-hangar-eris-s6-vergleich.jpg`.

Kran (Runde 3): fährt nur dort, wo Haken (Unterkante YC − 20,2), Laufkatze und Brücke mindestens 2,5 m über Rumpf,
Kufen und Geschützträgern bleiben (Höhenprofil je Meter in x für die z-Bänder der Kranteile, `_craneFit`). S1–S4:
ganzer Fahrweg ±64 m; S5 −43…−3, S6 −51…−11, S7 −95…−55, S8 −79…−39 (über flachen Teilen bzw. neben dem Rumpf).
Strahlentest `tools/bilder/kran.mjs` (senkrechte Strahlen im 0,5-m-Raster über Rumpf/Kufen/Geschützträger gegen den
tiefsten Kranpunkt je Zelle, 41 Stellungen + Parkstellung, alle 8 Klassen × 3 Fraktionen): vorher 33.336 Treffer
(S5–S8), nachher 0, kleinster Abstand 4,97 m (`r3-kran/kran-vorher.json`, `kran-nachher.json`). Hinweis: S7 reicht bis
34,8 m Höhe, die Deckenträger hängen bei 31,5 m – in der Heldenaufnahme nicht sichtbar, aber ein offener Punkt.

Prüf-Haken (nur Entwicklung): `window.__lsBay.orbit = { yaw, pitch, dist, dx, clean }` für feste Nahaufnahmen;
solange er gesetzt ist, stehen Zeit, Kran (an der Parkstellung) und Blinklichter still. Nahaufnahme Heck jetzt ohne
Halle (kein Hallenträger vor dem Rumpf).

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

Verfolgersicht (Runde 3, `render/camrig.js CHASE_FRAME`): Abstand, Neigung und Bildlage je Klasse statt Abstand aus
dem Hüllkugel-Radius (Flügel und Länge verfälschen ihn: S2/S3 waren von hinten kleiner als der breite Starter).
Ziel-Bildanteil: **Bildhöhe des Rumpfs**, Starter 18 %, je Klasse ≈ 10 % mehr, Schiff 8 ≈ 36 % (Obergrenze 38–40 %).
Die Fläche taugt nicht als einziges Maß: Schiff 8 ist schlank (189 × 49 m) und hätte für eine größere Fläche als S7
über 50 % der Bildhöhe gebraucht. `k` = Abstandsfaktor im Kampf (steilere Kamera und Zielschwenk verschieben die
Bildhöhe je Rumpfform). Seitlicher Versatz langer Rümpfe 17° → 6°, blendet beim Lenken (Kurswechsel > 0,15 rad/s) und
im Kampf auf 0 aus; Schild- und Kursbogen bleiben am Rumpf.

Messung `tools/bilder/groessen.mjs` (1280 × 720, gleiche Szene, Europa und Eris gleich; Höhe / Breite des projizierten
Rumpfs, Zuwachs der Höhe zur vorigen Klasse):

| Klasse | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| vorher Höhe × Breite | 18 × 19 % | 15 × 18 % | 18 × 18 % | 18 × 25 % | 25 × 22 % | 27 × 26 % | 27 × 28 % | 57 × 22 % |
| nachher Höhe × Breite | 17,9 × 19,4 % | 19,8 × 22,9 % | 21,7 × 20,8 % | 24,2 × 31,5 % | 26,8 × 24,1 % | 29,8 × 28,1 % | 32,9 × 36,2 % | 35,9 × 14,3 % |
| Zuwachs Höhe | – | +11 % | +10 % | +12 % | +11 % | +11 % | +10 % | +9 % |
| Kampf (ck = 1) Europa / Eris Höhe | 18,3 / 17,9 % | 18,9 / 20,4 % | 22,2 / 22,2 % | 24,9 / 25,0 % | 28,4 / 26,7 % | 30,2 / 29,8 % | 34,8 / 34,0 % | 36,1 / 36,5 % |

Im Kampf schwenkt die Kamera je nach Zielrichtung (Gier −10…+4°), die Werte streuen deshalb um einige Prozent; S2 und S3
sind auch im Kampf größer als S1 (S2 Europa +3 % Höhe, +23 % Breite; S3 +21–24 % Höhe). Schiff 8 mit HUD (1280 × 720):
Unterkante 64,6 % (Kampf 64,8–65,2 %), Oberkante des HUD-Bands (SYS·03 SCHIFF, Schnellleiste) 65,8 % – das Heck liegt
vollständig darüber; die Flugachse vor dem Bug ist frei. Die Bildmitte liegt beim Verfolger in allen Klassen auf dem
Rumpf (Schiff sitzt mittig über dem HUD-Band); bei Schiff 8 reicht der Bug bis 29 % Bildhöhe (vorher 29 %, dazu das
Heck bis 86 % unter dem HUD-Band). Eine freie Bildmitte und das Heck über dem HUD-Band ginge nur mit < 16 % Bildhöhe.
Belege: `r3-nachher/groessen/` (`staffelung-<fraktion>[-kampf][-hud].jpg`, `groessen*.json`), `r3-s8-hud-*-vergleich.jpg`.

## Cockpit (`render/cockpit.js`)

Konsole, Unterbau, Seitenkonsolen und Kanzelwände mit gezeichneter Blechverkleidung, weniger Metall, helleres
Grundlicht. Runde 3:
- Rumpfschale geschlossen: Boden, Seitenschale von unten bis knapp unter den Kanzelsims, Rückwand hinter dem Sitz, Sitz –
  beim Umsehen nach links, rechts und unten kein Weltraum durch Lücken.
- Leuchtfarbe: ist der Fraktionsakzent dunkel (Saturn 0x3a3a3e), gilt die Hauptfarbe (Saturn Orange #e0782a) für
  Schildleiste, Titel, Rahmen und Leuchtleisten.
- Instrumentenschein ohne Abfall, schwach (0,22) und weit über dem Kopf: kein runder Glanzfleck unter dem FLUG-Bildschirm.
- Verkleidung ohne Kachelung: Wandtextur 2 × 2 m mit unregelmäßigen Plattenreihen, Lüfter und Schalter nur an wenigen
  Stellen, Welt-UV (Meter) mit Versatz je Bauteil; Konsole mit eigener Fläche (Fugen an den Kanten und zwischen den
  drei Bildschirmfeldern); Warnstreifen neutral grau.
Prüfung: `tools/bilder/cockpit.mjs` (vorn, links, rechts, unten), Bögen `r3-cockpit-vergleich/<klasse>-<fraktion>.jpg`
für S1 Europa, S8 Saturn, S6 Eris.

## Drohnen und Sprungtor

- Voyager/Cassini/Juno: alle Stufen Meshy (Stufe 1 und 10 aus l05 abgeleitet). Pioneer hat kein Meshy-Modell.
- Sprungtor: Meshy-Ring bleibt, Schacht unter der Flugebene auf 12 % gestaucht, Wirbel-/Tunnelschichten an.

## Leistung (Apple-Chip, 960 × 600, HOCH, `tools/bilder/ansichten.mjs`, unsichtbar, fester Zufall, Welt angehalten)

Grafikzeit im Flug Runde 3: 2,4–4,3 ms (flug-* 3,5–3,8, schiff-nah 3,2, kampf-saturn 3,4, cockpit 2,4, feld 3,4,
tor 4,3, schiff5 3,6, kampf-schwarm 2,9, kampf-eris-s6 3,0, kampf-eris-s8 3,5); Ziel ≤ 8 ms gehalten. Stationsansichten
(angedockt) schwanken unsichtbar stark und sind kein Flugwert. Bericht: `r3-nachher/ansichten/bericht.json`.

## Speicher (`tools/bilder/speicher.mjs`, alle WebGL-Kontexte, Texturen + Renderpuffer)

Ablauf: andocken, Hangar, alle 8 Klassen als eigenes Schiff, Werft durchblättern (30 Karten), Hangar verlassen.
Runde 3: Hangar verlassen (auch Reiterwechsel) gibt außer den 4K-Karten die 2K-Karten aller fremden Rümpfe und der
Werft-Karten frei (`ModelFactory.releaseShipTextures`; die Texturen sind zwischen beiden Grafik-Engines geteilt, die
Bilddaten bleiben im Zwischenspeicher und werden beim nächsten Zeigen neu hochgeladen). Nur das eigene Schiff bleibt.

| Einstellung | Spitze vorher → nachher | Ende vorher → nachher | 4K-Texturen nach Verlassen |
|---|---|---|---|
| Browser ULTRA | 1.746 → 1.489 MB | 1.746 → 913 MB | 2 (eigenes Schiff im Flug) |
| Desktop-App HOCH | 1.733 → 1.484 MB | 1.716 → 908 MB | 2 |
| Desktop-App MITTEL | 1.864 → 1.288 MB | 1.864 → 712 MB | 0 |
| Browser HOCH | 1.932 → 1.356 MB | 1.932 → 780 MB | 0 |

Beim Durchschalten der eigenen Klassen bleibt der Speicher jetzt flach (≈ 760 MB statt + 85 MB je Klasse), die
Spitze entsteht beim Durchblättern der Werft (alle 8 Rümpfe als Standbild) und wird beim Verlassen freigegeben.
Je 2K-Textur ≈ 22,4 MB, je 4K-Textur ≈ 89,5 MB (RGBA8 mit Mipmaps). Download: Schiffsdateien 57 MB (24 Dateien),
4K-Zusatz 30 MB. Logs: `r3-speicher-*.log` (vorher `r2-speicher-*.log`).

## Belege (`LAST-SIGNALS-Uebergabe/bilder/schiffe-qualitaet/`)

Runde 3 (Vorher = Stand 32e27d7, exportiert nach `sicherung/r3-vorher`, Dev-Server 5197; Nachher = dieser Stand, 5198):
- `r3-vorher/high`, `r3-nachher/high`: je Klasse Hangar + 5 Nahaufnahmen (alle drei Fraktionen, Heck ohne Halle),
  Verfolger, nah, Cockpit; Bögen `r3-vergleich-high/<klasse>-<fraktion>.jpg`; 4K (S1/S3/S7/S8) `r3-vergleich-ultra/`
- Einzelvergleiche: `r3-flanke-s1-saturn-4k.jpg` (Blockbildung), `r3-nah-oben-s8-europa-2k/4k.jpg`,
  `r3-nah-heck-s8-europa-2k/4k.jpg` (Halo-Saum), `r3-nah-heck-s7-eris-2k/4k.jpg`, `r3-hangar-eris-s2/s6-vergleich.jpg`,
  `r3-kampf-eris-s8-vergleich.jpg`, `r3-kampf-eris-s6-vergleich.jpg`, `r3-s8-hud-europa/eris-vergleich.jpg`,
  `r3-cockpit-vergleich/`, `r3-fuellung/`, `r3-kran/`, `r3-vorher|nachher/groessen/`, `r3-speicher-*.log`
- Aufnahme: `cd Code && Q=high node tools/bilder/schiffe.mjs <ordner> http://localhost:5198`, Bögen:
  `python3 vergleich2.py <vorher> <nachher> <ausgabe>` im Belegordner.

Runde 2: `r2-*` (Vorher-Stand f9d6716 mit Kamera-Prüf-Haken).
