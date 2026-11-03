# LAST SIGNALS · Schiffsqualität (Stand 03.11.2026, Nachbesserung Runde 4)

Ziel (Toni): Die Spielerschiffe sind das Wichtigste und sollen mit dem Grafikstand auf Space-Shooter-Niveau kommen.
Dieser Stand betrifft die 24 Meshy-Rümpfe (Starter bis Schiff 8, je Europa/Saturn/Eris), Drohnen und Sprungtor.

## Materialkarten (alle 24 Rümpfe)

Werkzeug außerhalb des Repos (liest Meshy-Rohdateien aus dem Vault, die nicht ins öffentliche Repo gehören):
`LAST-SIGNALS-Uebergabe/werkzeug/schiffe-q/qualitaet.mjs <s1..s8>`, alle Klassen mit `alle.sh` (3 Stränge, ≈ 4–5 min).
Eingabe sind die Spieldateien nach dem Meshy-Einbau (Fraktionslackierung schon in der Farbe, gesichert in `quelle/`).

| Karte | Inhalt | Herkunft |
|---|---|---|
| Farbe (sRGB) | Fraktionslackierung, Kennungen entfernt (Randgrundton + Plattenstruktur des Spenders), Inselränder per Dilation aufgefüllt, leichte Kantenabnutzung; Europa-Gold geglättet und satter, Saturn/Eris-Akzent kräftiger, Rest-Cyan der Vorlage in Saturn/Eris neutral | Spieldatei |
| Normal (linear) | Kanten-Normalen aus der Geometrie (Auto-Glättung 50°, Anteil 55 %, an harten Kanten 4 × 4 unterabgetastet, leicht geglättet, Splitterdreiecke aus der Umgebung) + Detailhöhe (Luminanz-Bandpass r1–r3, Stärke 0,9, am UV-Inselrand ausgeblendet; an entfernten Kennungen halb vom Spender) | Geometrie + Rohtextur |
| ORM (linear) | R Umgebungsverdeckung (32 Strahlen je Texel, 1K, beide Seiten, Reichweite 12 % der Länge, Stärke 80 %), G Rauheit, B Metall | Strahlen + Farbanalyse |
| Leuchten (sRGB) | Düsen/Lichtleisten: Europa Eisblau, Saturn Bernstein, Eris Violett mit Randabfall und Plattenstruktur; kleine warme/rote/grüne Lichtpunkte; kalte Splitter (< 40 Texel bzw. < 160 Texel und < 40 Texel lang) entfernt; Stärke 2,2. Schiff 2: keine (Rohtextur ohne Leuchtflächen, Karte weggelassen) | Rohtextur |

Rauheit/Metall je Fraktion (Rumpf / Akzent): Europa 0,22 · 0,44 / 0,9 · 0,36, Saturn 0,72 · 0,36 / 0,35 · 0,4,
Eris 0,8 · 0,3 / 0,5 · 0,28. Saturn/Eris: Rumpfrauheit höchstens 0,5, dunkler Lack zählt nicht als „Dunkelteil“
(Gummi, Öffnungen). Der Tangentenraum folgt three.js ohne Tangenten (Ableitungs-Basis, glTF-Grün = oben).

„Gebackene Formnormalen“ aus einem Hochpolygon-Modell sind nicht möglich: Meshy liefert nur das Spielnetz
(14–33 Tsd. Dreiecke). Stattdessen werden harte Kanten aus dem Netz selbst gebacken.

### Runde 4: Sägezahnfugen an harten Kanten und UV-Rändern

Ursache (Kanalprüfung `tools/bilder/diag-hangar.mjs`, Kanäle einzeln abgeschaltet): die Zahnlinien kamen allein aus
der Normalkarte – an S2-Bug eine 1–2 Texel breite Geometriefuge, deren Kanten-Normale texelweise wechselte, dazu der
Bandpass der Detailhöhe, der am UV-Inselrand Texel angrenzender Inseln aus dem Atlas mischte. Behoben in
`qualitaet.mjs`:
- Detailhöhe am Inselrand ausgeblendet (Abstand zum Rand je Texel, Rand = Nachbar ungültig oder im Raum > 6 Texel weg;
  voll ab 4 Texeln bei 2K bzw. 8 bei 4K).
- Kanten-Normale an Texeln mit harter Kante 4 × 4 unterabgetastet (Kandidaten: Dreiecke der 3 × 3-Nachbarschaft auf
  derselben Fläche), Formanteil danach leicht geglättet (Gauß ≈ 1,4 Texel, nicht am Inselrand).
- Splitterdreiecke (Höhe im UV < 0,8 Texel) liefern keine eigenen Texel mehr, sondern werden aus der Umgebung gefüllt.
- Ränder aller vier Karten per Dilation (8 Schritte 2K, 16 Schritte 4K, je Schritt Mittel der gültigen 8-Nachbarn),
  danach Push-Pull für den Rest (vorher nur Push-Pull: Mittelwert über Nachbarinseln direkt am Rand).
- Je Normalkarte im Bericht: unterabgetastete Kantentexel (2K 0,20–0,32 Mio.) und gefüllte Splittertexel (1.200–7.900).

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

### Füllung Runde 4 (ohne Wolken, ohne Farbstich; S4-Bildschirm, Leuchtsplitter)

- Füllung = Grundton aus dem Rand (Push-Pull, Randtexel nach Helligkeit UND Buntheit gewichtet: ein gleich heller
  Goldrand zieht den Ton nicht mehr ins Gelbe) + Plattenstruktur des Spenders (alles über Kastenmittel r 3, alle Kanäle).
  Keine tiefen Frequenzen vom Spender (keine Wolken, keine Schattenflecken), Strukturstärke höchstens das 1,2-Fache des
  Randes (Streuung des Feinanteils), Einzelabweichung je Texel höchstens 0,09 Helligkeit, 3 Texel weicher Rand.
- Spender je Lackierung geprüft: Gold-, Orange- und Violett-Akzente stehen nur in der Lackierung, nicht in der Rohtextur
  der Spenderwahl. Der erste von zwölf Kandidaten, dessen Texel in der Buntheit zum Bezug passen (Mittel ≤ 0,025,
  95 %-Wert ≤ 0,07), wird genommen; sonst nur der Helligkeits-Feinanteil (`report.fuellModus`: spender/spender-alt/fein).
  Gefunden durch die neue Prüfung: S2 Europa „S02“ hatte einen Goldfleck aus einem Spender in der Goldleiste.
- Neue Prüfungen je Fundstelle in `qualitaet.mjs` (2K-Farbe, Abbruch): **Farbton** – Mittel der Buntheit (r−g, g−b)
  der Füllung außerhalb des Bereichs 10–90 % des Bezugs ≤ 0,03 (an Plattengrenzen liegt die Füllung zwischen beiden
  Seiten und besteht) – und **niederfrequente Streuung** – Streuung der Helligkeit nach Kastenmittel r 3 höchstens das
  1,35-Fache des Bezugs (oder absolut ≤ 0,02). Ergebnis alle 24 Rümpfe: ΔFarbton ≤ 0,028, NF-Streuung ≤ 1,46-fach (S6
  „S06“ 2,13-fach bei absolut 0,016 – Plattenkante in der Fundstelle), Helligkeit ≤ 0,038, Blockigkeit 4K-Höhe ≤ 1,18.
  Die Prüfung fand außerdem einen Rest der S8-Kennung (heller Bogen neben „1714,1711“, jetzt Rechteck in
  `kennungen.json`) und den Streifen-Spender an S6 „S06“ (Struktur jetzt auf Randstärke begrenzt).
- **S4 Flügel**: der pixelige Zeichen-Bildschirm mit Leuchten (UV ≈ 0,10/0,64) ist als ganze Fläche gefüllt
  (`kennungen.json` s4 rechtecke [172, 1290, 236, 1332, 1]) – in allen drei Lackierungen, Leuchtkarte dort leer, Stelle in
  der Prüfung je Fundstelle enthalten (`hand:172,1290,236,1332`). Beleg 2K und 4K-Verfolger nah: `r4-s4-fluegel.jpg`.
- **Leuchtsplitter**: Zusammenhangsflächen der kalten Leuchtmaske (Cyan-Erkennung bzw. kaltes Leuchten der Vorlage) unter
  40 Texeln oder unter 160 Texeln bei weniger als 40 Texeln Länge sind keine Düsen oder Leisten, sondern Schriftzeichen,
  Funken und Pixelreste – in Eris als magenta Flecken (S4). Sie leuchten nicht mehr, gesättigte Texel bekommen den Lack der
  Umgebung. Entfernt: S1 8, S3 256, S4 708, S5 315, S6 99, S7 70, S8 157 Stellen (S2 0).
- **Leuchtflächen mit Struktur** (S3-Gondel, Eris-Leisten und -Felder): Leuchten × (0,45 + 0,55 · Randabfall über 6
  Texel) × Plattenstruktur der Vorlage (Hochpass der Helligkeit, 0,45–1,25) × Fugen dunkler (Detailhöhe); das
  Grundmaterial darunter behält seine Helligkeitsstruktur in der Leuchtfarbe (vorher flache Farbfläche).
- **Rest-Cyan** der Vorlage auf Lack (keine Leuchtfläche) in Saturn und Eris neutral grau bei gleicher Helligkeit: S3
  1,9 % → 0,07 %, S5 3,4 % → 0 % der Texel (türkiser Farbstich auf den Gondeln).
- Rauheit ohne niederfrequentes Rauschen (nur die feine Oktave, halbe Stärke): weniger Glanzwolken auf dunklem Lack.
- **Schiff 8, Saum**: gedämpft wird nur noch die helle dünne Linie (Zylinderhut r 2) direkt neben einer dunklen Fuge
  (Schwarzhut, Abstand ≤ 2 Texel), auf 25 %; die Detailhöhe wird aus der ungedämpften Helligkeit gebildet und nur ihr
  positiver Anteil (Grat) im Saum um 80 % gekappt – die Plattenfugen haben wieder volle Tiefe (Stärke 2K 0,8, 4K 1,25
  statt 0,6/1,0). Beleg Runde 2 / Runde 3 / Runde 4: `r4-s8-saum.jpg`.

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
- Rumpfaufhellung (Runde 4 umgebaut, `SHIP_FILL`): weiches Füll-/Kopflicht aus Kamerarichtung auf der Grundfarbe,
  nur noch im Unbeleuchteten (× (1 − lit)², lit = Beleuchtung an der Stelle wie beim Randlicht): beleuchtete Flächen
  bleiben satt, das Violett wird nicht mehr pastell. Saturn 0,2, Eris 0,3 (vorher 0,6), große Rümpfe nur + 30 % (vorher
  Eris × 3 für S7/S8). Faktor je Grafik-Engine (`factory.uShipFill`): Flug 1, Hangar eigener kleinerer Wert Europa 0,3 /
  Saturn 0,45 / Eris 0,5 (vorher 0,45 / 0,7 / 1,4).
- Silhouettenlicht (Runde 4, statt flacher Aufhellung für die Lesbarkeit): kühles helles Kantenlicht (Eris #d4e4ff
  0,42, Saturn #dfe8ff 0,14, Europa aus) nur am streifenden Rand (smoothstep 0,6–0,97 der Abwendung, quadriert), mit
  der Verdeckung gewichtet – trennt den Umriss vom violetten Nebel, ohne die Fläche zu grauen. Beleg Flug/Kampf Eris S1,
  S6, S8: `r4-kampf-eris-vergleich.jpg`.
- Positionslichter der Flügelspitzen (Runde 4): kleiner (1,3 statt 1,8) und gerichtet nach außen – die abgewandte Spitze
  blendet aus (Blickwinkel zur Außenrichtung < 0), statt als Lichtfleck über die Rumpfsilhouette zu ragen
  (`lightPointsGeometry` mit Richtung, Abfrage je Punkt im Vertex-Shader). Der rote Punkt über der Silhouette in S1
  nah-flanke war das Rückenlicht der Hangar-Ausstattung (`station-bay.js _buildFit`): es ist jetzt kleiner (1,5) und nur
  sichtbar, wenn die Kamera mindestens ≈ 8° über der Rumpfoberseite steht; die Seitenlichter (Backbord/Steuerbord) zeigen
  nur zur Kamera hin (abgewandte Seite aus). Beleg S1 nah-flanke Eris/Saturn: `r4-positionslicht.jpg`.
- Schildtreffer am eigenen Schiff (Runde 4, `effects.js _shield`): Deckkraft 0,3 und höchstens 0,32 je Bildpunkt,
  Fresnel-Hülle auf 35 %, Dauer 0,3 s – kurzes Aufblitzen von Hex-Raster und Trefferring statt bildfüllender Wand;
  Gegner unverändert, Wiedereinstieg (volle Kuppel) unverändert. Beleg Kampf mit HUD S1/S6/S8 Eris:
  `r4-kampf-eris-vergleich.jpg` (Zeilen „SCHILD“, 0,08 s nach dem Treffer).
- Positionslichter echter Rümpfe sitzen auf der Flügelspitze (vorher 0,3 m außen, 0,4 m darüber: bei hängenden
  Flügelspitzen ein schwebender Punkt neben S3 Saturn).
- Klarlack auf gebackenen Karten 0,15 (vorher 0,3), Rauheit 0,42: Schiff 8 Europa wirkt nicht mehr gläsern.

## Hangar

Belichtung je Lackierung (`station-bay.js setShip`, [Oberlicht, Kante, Füllung, Umgebung, Kontur, Höhe Kantenlicht]):
Europa 1,5 / 1,9 / 0,45 / 0,3 / 0 / 22, Saturn 1,6 / 2,4 / 0,6 / 0,42 / 0,9 / 30, Eris 2,0 / 1,7 / 1,05 / 0,62 / 2,6 / 58.
Runde 4: Saturn-Kantenlicht neutral (#dcd8d2 statt #9db8ff) – es spiegelte als lila Wolke im dunklen Metallrumpf
(S2 Saturn nah-bug); Rumpfaufhellung im Hangar s. oben. Beleg Eris S6/S7/S8 Hangar und nah-flanke:
`r4-eris-aufhellung.jpg`. Nahaufnahme Heck zusätzlich **mit Halle** (`nah-heck-halle`, wie im Spiel), je Klasse:
`r4-hangar-halle.jpg` – kein Hallenträger vor dem Rumpf.
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

Verfolgersicht (Runde 4, `render/camrig.js CHASE_FRAME`): Abstand, Neigung, Bildlage und bei Schiff 8 Gier je Klasse;
gestaffelt nach **Bildfläche und Bildhöhe zusammen**. `tools/bilder/groessen.mjs` bricht jetzt ab (Rückgabewert 2),
wenn je Fraktion von S1 bis S8 die Fläche ODER die Höhe nicht um mindestens 8 % je Stufe steigt oder (mit HUD) ein Heck
im HUD-Band liegt. Gelaufen für Europa, Saturn und Eris in Flug, Flug mit HUD, Kampf und Kampf mit HUD (1280 × 720):
alle vier Läufe bestanden (`r4-nachher/groessen/*.log`, `groessen*.json`, `staffelung-<fraktion>[-kampf][-hud].jpg`).

- **Schiff 8** (189 × 49 m): ruhige Verfolgersicht flach (Neigung 15° − 14° = 1°) mit 12° Gier – die Länge ist sichtbar,
  Bildfläche 10,2 % gegen 9,4 % bei S7 (vorher 3,6 %), Höhe 53,7 %, Unterkante 61,5 % über dem HUD-Band (65,8 %),
  Oberkante 7,8 %. Im Kampf bleibt die doppelte Gier (24°), die steilere Kampfkamera nur zu 80 %, die Zielhöhe im Bild
  darf bis 0,9 steigen (`tc`): Fläche 9,0–9,4 % gegen 7,7–7,9 % bei S7, Unterkante ≤ 64,1 %.
- **S2 größer als S1**: Starter etwas weiter weg (Flug 16,4 % Höhe, 2,19 % Fläche), S2 19,8 % / 2,46 % (+12 % Fläche).
- **Kampf**: alle Klassen etwas kleiner im Bild (mehr Überblick, Abstandsfaktor `k` 0,9–1,26), die Stufen liegen im Mittel
  ≈ 15–20 % auseinander, weil der Zielschwenk (Gier −11…+5°) die Bildhöhe je Lage um ±4 % streut; S6/S7 heben das Bild
  im Kampf an (`yc`, `tc`), damit das Heck über dem HUD-Band bleibt.
- **Zielmarke und Zielbogen** (Kampf): `zielFrei` per Strahltest gegen die Rumpfdreiecke – die Zielmarke auf dem Gegner
  und die Strecke vom Bug zum Ziel ab 1,3 Radien werden nicht vom Rumpf verdeckt. In allen Kampfmessungen (3 Fraktionen ×
  8 Klassen, mit und ohne HUD) frei; vorher bei S8 Saturn und Eris verdeckt.
- **Bildmitte**: `mitteFrei` (Bildmitte und Flugachse nicht in der konvexen Hülle des Rumpfs) bleibt in allen Messungen
  falsch – das ist gewollt und die frühere Aussage „Flugachse vor dem Bug frei“ war falsch: der Verfolger setzt das Schiff
  mittig über das HUD-Band, die Bildmitte liegt auf dem Rumpf. Frei liegt das, worauf es im Kampf ankommt (Zielmarke,
  Zielbogen; s. o.); Schild-/Hüllenbögen sitzen bewusst am eigenen Schiff.

| Klasse | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 |
|---|---|---|---|---|---|---|---|---|
| Flug Fläche | 2,19 % | 2,46 % | 2,88 % | 4,11 % | 4,91 % | 5,53 % | 9,44 % | 10,23 % |
| Flug Höhe | 16,4 % | 19,8 % | 21,7 % | 24,2 % | 26,8 % | 29,2 % | 32,4 % | 53,7 % |
| Zuwachs Fläche / Höhe | – | +12 / +21 % | +17 / +10 % | +43 / +12 % | +20 / +11 % | +13 / +9 % | +71 / +11 % | +8 / +66 % |
| Kampf mit HUD Europa Fläche / Höhe | 1,09 / 12,6 % | 1,44 / 15,6 % | 1,83 / 17,4 % | 2,65 / 20,8 % | 3,20 / 24,5 % | 4,87 / 28,0 % | 7,65 / 31,9 % | 9,35 / 55,8 % |
| Kampf mit HUD Saturn Fläche / Höhe | 1,04 / 12,1 % | 1,42 / 15,6 % | 1,85 / 17,2 % | 2,70 / 21,2 % | 3,14 / 23,9 % | 4,78 / 27,7 % | 7,87 / 32,7 % | 9,23 / 56,0 % |
| Kampf mit HUD Eris Fläche / Höhe | 1,09 / 12,4 % | 1,40 / 15,5 % | 1,76 / 17,0 % | 2,63 / 20,7 % | 3,18 / 23,7 % | 4,77 / 28,1 % | 7,87 / 32,9 % | 8,96 / 55,8 % |
| Kampf ohne HUD Europa Fläche / Höhe | 1,11 / 13,1 % | 1,41 / 15,4 % | 1,92 / 17,4 % | 2,70 / 21,1 % | 3,12 / 23,5 % | 5,10 / 28,7 % | 7,75 / 31,6 % | 9,83 / 55,1 % |
| Kampf ohne HUD Saturn Fläche / Höhe | 1,10 / 13,0 % | 1,42 / 16,0 % | 1,95 / 17,5 % | 2,66 / 21,0 % | 3,19 / 23,9 % | 5,07 / 28,5 % | 7,80 / 32,0 % | 9,17 / 55,3 % |
| Kampf ohne HUD Eris Fläche / Höhe | 1,11 / 13,0 % | 1,43 / 15,4 % | 1,90 / 17,5 % | 2,68 / 21,0 % | 3,14 / 23,9 % | 4,86 / 28,2 % | 7,88 / 31,6 % | 9,49 / 54,3 % |

Belege: `r4-s8-verfolger-hud.jpg` (S8 Europa/Saturn/Eris, ruhig und Kampf, je mit HUD, vorher/nachher),
`r4-nachher/groessen/staffelung-*.jpg`, Messwerte `r4-nachher/groessen/groessen*.json` (vorher S7/S8:
`r4-vorher/groessen/`).

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
Runde 4 – Innenraum beleuchtet:
- Füll-Licht von vorn unten (0,75, Instrumentenschein) und von beiden Seiten (je 0,45): Rückwand, Sitz und Innenseiten
  der Schale, die das Hauptlicht von hinten oben nicht erreicht; Halbkugel-Licht unten heller (#3a3f4a statt #1a1c22).
- Schwache Eigenhelligkeit als Grundlicht: Schale und Seitenverkleidung mit Wandtextur (#2b2e36), Streben (#17191e),
  Sitz (#15171c); Schale heller lackiert (#c4cad4 statt #8a909a).
- Prüfung in `tools/bilder/cockpit.mjs` (Abbruch): zwölf Blickrichtungen, darunter Gier ±1,9 rad und Neigung −0,6/+0,7
  in allen Kombinationen; je Bild Anteil der Kanzel-Bildpunkte unter 6/255 höchstens 5 % des Bildes (Bildpunkte durch die
  Scheiben zählen nicht: Maske aus zwei Aufnahmen mit ausgeblendeter Welt vor schwarzem bzw. weißem Hintergrund).
  Ergebnis schlechteste Richtung (rechts unten): S1 Europa 27,0 % → 1,3 %, S8 Saturn 38,0 % → 4,1 %, S6 Eris 40,3 % →
  4,5 % (`r4-nachher/cockpit/*-pruefung.json`, vorher `r4-vorher/cockpit/`).
- `cockpit.mjs` hält die Blickwinkel während der ganzen Aufnahme (Intervall setzt `looking/lookYaw/lookPitch` alle 16 ms;
  vorher federte der Blick zwischen Setzen und Bild zurück).
Bögen: `r4-cockpit-vergleich/<klasse>-<fraktion>.jpg` (S1 Europa, S8 Saturn, S6 Eris; je Blickrichtung ein sauberes
Vorher/Nachher-Paar, Beschriftung über den Bildern). Die Runde-3-Bögen `r3-cockpit-vergleich/*.jpg` sind aus den
Runde-3-Quellen neu zusammengesetzt (s8-saturn hatte überlappende Kacheln).

## Drohnen und Sprungtor

- Voyager/Cassini/Juno: alle Stufen Meshy (Stufe 1 und 10 aus l05 abgeleitet). Pioneer hat kein Meshy-Modell.
- Sprungtor: Meshy-Ring bleibt, Schacht unter der Flugebene auf 12 % gestaucht, Wirbel-/Tunnelschichten an.

## Leistung (Apple-Chip, 960 × 600, HOCH, `tools/bilder/ansichten.mjs`, unsichtbar, fester Zufall, Welt angehalten)

Grafikzeit im Flug Runde 4: 2,5–4,5 ms (flug-saturn 3,5, flug-europa 3,7, flug-eris 3,8, schiff-nah 3,0, kampf-saturn 3,0,
cockpit-eris 2,5, feld 3,6, tor 4,5, schiff5-eris 3,9, kampf-schwarm 2,8, kampf-eris-s6 3,2, kampf-eris-s8 4,2); Ziel
≤ 8 ms gehalten (Runde 3: 2,4–4,3 ms). Die näher gerahmten großen Rümpfe (S8 jetzt 10 % der Bildfläche) und das
Silhouettenlicht kosten im Kampf mit S8 ≈ 0,7 ms. Stationsansichten (angedockt) schwanken unsichtbar stark und sind kein
Flugwert. Bericht: `r4-nachher/ansichten/bericht.json`, Log `r4-ansichten.log`.

## Speicher (`tools/bilder/speicher.mjs`, alle WebGL-Kontexte, Texturen + Renderpuffer)

Ablauf: andocken, Hangar, alle 8 Klassen als eigenes Schiff, Werft durchblättern (30 Karten), Hangar verlassen.
Hangar verlassen (auch Reiterwechsel) gibt außer den 4K-Karten die 2K-Karten aller fremden Rümpfe und der Werft-Karten
frei (`ModelFactory.releaseShipTextures`; die Bilddaten bleiben im Zwischenspeicher und werden beim nächsten Zeigen neu
hochgeladen). Nur das eigene Schiff bleibt.

| Einstellung | Spitze R2 → R3 → R4 | Ende R2 → R3 → R4 | 4K-Texturen nach Verlassen | Log Runde 4 |
|---|---|---|---|---|
| Browser ULTRA | 1.746 → 1.489 → 1.470 MB | 1.746 → 913 → 868 MB | 2 (eigenes Schiff im Flug) | `r4-speicher-ultra.log` |
| Desktop-App HOCH | 1.733 → 1.484 → 1.484 MB | 1.716 → 908 → 908 MB | 2 | `r4-speicher-desktop-hoch.log` |
| Desktop-App MITTEL | 1.864 → 1.288 → 1.288 MB | 1.864 → 712 → 712 MB | 0 | `r4-speicher-desktop-mittel.log` |
| Browser HOCH | 1.932 → 1.356 → 1.356 MB | 1.932 → 780 → 780 MB | 0 | `r4-speicher-browser-hoch.log` |

- Beim Durchschalten der eigenen Klassen bleibt der Speicher flach (HOCH ≈ 760 MB, ULTRA 950–1.060 MB mit den zwei
  4K-Karten des eigenen Schiffs); die Spitze entsteht beim Durchblättern der Werft (alle 8 Rümpfe als Standbild, 2K) und
  wird beim Verlassen freigegeben.
- Je 2K-Textur ≈ 22,4 MB, je 4K-Textur ≈ 89,5 MB (RGBA8 mit Mipmaps). Ein eigenes Schiff mit 4K belegt damit
  2 × 89,5 MB (Farbe, Normal) + 2 × 22,4 MB (ORM, Leuchten) ≈ 224 MB statt 4 × 22,4 ≈ 90 MB in 2K.
- Download: Schiffsdateien 24 GLB (2K) ≈ 57 MB, 4K-Zusatz (24 Farb- + 8 Normalkarten) ≈ 30 MB; geladen wird nur, was das
  eigene Schiff bzw. der gezeigte Rumpf braucht.
- Runde 4 ändert weder Zahl noch Größe der Texturen (nur ihren Inhalt); die Werte entsprechen Runde 3 innerhalb der
  Messstreuung. Logs Runde 4: `r4-speicher-ultra.log`, `r4-speicher-desktop-hoch.log`, `r4-speicher-desktop-mittel.log`,
  `r4-speicher-browser-hoch.log` (Runde 3: `r3-speicher-*.log`, Runde 2: `r2-speicher-*.log`).

## Belege (`LAST-SIGNALS-Uebergabe/bilder/schiffe-qualitaet/`)

Runde 4 (Vorher = Stand 6d11e27, exportiert nach `sicherung/r4-vorher`, Dev-Server 5197; Nachher = dieser Stand, 5198;
Bögen mit `python3 vergleich-r4.py` im Belegordner, Beschriftung über den Bildern):
- `r4-saegezahn-2k.jpg`, `r4-saegezahn-4k.jpg`: S2 nah-bug Europa/Saturn/Eris, S1 und S3 nah-bug, 2K (HOCH) und 4K (ULTRA)
- `r4-fuellung.jpg`: S2 Saturn nah-bug, S8 Saturn/Eris nah-bug, S3 Eris/Saturn nah-heck
- `r4-eris-aufhellung.jpg`: S6/S7/S8 Eris Hangar-Totale und nah-flanke; `r4-kampf-eris-vergleich.jpg`: S1/S6/S8 Eris
  Flug, Kampf und Schildtreffer mit HUD (1280 × 720, `tools/bilder/kampf.mjs`)
- `r4-s8-saum.jpg`: S8 Europa/Saturn nah-oben und nah-bug, Runde 2 / Runde 3 / Runde 4
- `r4-leuchten.jpg`: S3 Gondel (Saturn/Eris), S4 Eris (Splitter, Flanke, Oberseite), S5 Eris Heck
- `r4-positionslicht.jpg`: S1 nah-flanke Eris und Saturn; `r4-hangar-halle.jpg`: Heck mit Halle je Klasse
- `r4-s4-fluegel.jpg`: S4 Flügel-Bildschirm in allen Lackierungen, 2K Hangar und 4K Verfolger nah
- `r4-cockpit-vergleich/`, `r4-s8-verfolger-hud.jpg`, `r4-nachher/groessen/`, `r4-nachher/ansichten/`, `r4-speicher-*.log`
- vollständige Sätze: `r4-vorher/high`, `r4-nachher/high` (je Klasse Hangar + 6 Nahaufnahmen in allen drei Fraktionen,
  Verfolger, nah, Cockpit), `r4-vorher/ultra`, `r4-nachher/ultra` (S1–S3 Hangar, S4 nah in 4K)
- Werkzeug der Karten (außerhalb des Repos): `werkzeug/schiffe-q/qualitaet.mjs` (Stand Runde 3 gesichert in
  `sicherung/schiffe-q-r3/`), Prüfwerte je Klasse in `arbeit/<klasse>.json` (`fuellung`, `fuellModus`, `notes`)

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
