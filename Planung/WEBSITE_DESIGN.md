# LAST SIGNALS · Website-Design (verbindlich, Interview mit Toni am 30.10.2026)

Maßstab: Freigabe erst ab Note 9,5/10. Gefühl-Vorbild: die Website von Star Citizen (riesige Weltraum-Szenen, technisch, viel Tiefe), aber in unserer eigenen Bildsprache (Planung/UI_STIL.md). Nichts kopieren.

## Erster Eindruck

Filmisch-episch. Die erste Szene füllt den ganzen Bildschirm, kaum Text: nur der Schriftzug LAST SIGNALS und „Jetzt spielen“.

**Hauptmotiv: die Große Stille.** Blick ins dunkle innere Sonnensystem, die Erde als stummer blauer Punkt, aus Richtung Sonne tauchen die Schiffe des Schwarms auf. Düster, geheimnisvoll, realistisch wie Weltraumaufnahmen.

## Aufbau

Eine lange Kinoseite. Beim Scrollen bleibt die 3D-Szene im Hintergrund und **die Kamera fliegt durchs Sonnensystem**: von der stummen Erde hinaus zu Jupiter (Europa), Saturn, Eris. Jedes Kapitel hat seinen eigenen Ort. Wiki, Pilotenprofile, News und Ruhmeshalle sind eigene Seiten.

Kapitel in dieser Reihenfolge:
1. **Die Große Stille** (Story, Funkspruch-Stil)
2. **Wähle deine Seite**: drei Fraktionen interaktiv. Beim Darüberfahren färbt sich die Seite in die Fraktionsfarbe, der Anführer-Satz erscheint, die Heimat in 3D. Klick merkt die Wahl für die Reservierung.
3. **Warum LAST SIGNALS**: 6–8 starke Gründe (Tiefe, Bosse in Feindesheimat wegschnappen, Wurmlöcher zu echten Sternen, 16 Formationen, Battle Maps, Clans über alle Fraktionen, Events wie BREACH und Core Rush, fair: Stärke nicht kaufbar), jeder mit eigener Visualisierung im Spielstil.
4. **Schiffe & Ausrüstung**: 3D-Hangar, Schiff drehbar im Hangar-Licht, Reihe 1–8 plus Heiler/Tank/Späher zum Durchklicken, Fraktion umschaltbar, Laser und Generatoren sichtbar am Modell. Echtes Modell: SATURN-Starter (GLB), sonst hochwertige Platzhalter.
5. **Das Sonnensystem**: begehbare 3D-Karte zum Drehen und Zoomen. Heimaten, FRONT, BM-1 bis BM-3, KUIPER, STILLE. Klick auf ein Gebiet zeigt Gegner, Bosse, Stufe.
6. **Gründungspilot werden**: Rufname (live geprüft), Fraktion aus Kapitel 2, E-Mail mit Bestätigungsmail (Double-Opt-in), alternativ Anmeldung mit Google oder Discord. Danach eine Teilen-Karte für TikTok/Instagram („Pilot XYZ hat das Signal empfangen“). Gründungspiloten bekommen Titel und Skin „Founder“ (nur Aussehen). Hinweis auf die Verlosung von Pilot-ID 1.
7. **Gemeinschaft**: Discord, TikTok, Instagram (Links in `src/links.js`), dazu vorbereitete Kanäle (YouTube, X, Reddit, Steam) als „bald“.

## Kopfleiste (immer sichtbar)

Signal-Schriftzug klein · Jetzt spielen · Anmelden bzw. eigenes Profil (Rufname, Rang, Bild) · Wiki · News · Ruhmeshalle · Live-Status (Server online, Spieler im All, nächstes Event; bis der Server läuft: ehrlicher Status „Testphase“, keine erfundenen Zahlen) · Sprache DE/EN · Ton an/aus.

## Logo

Signal-Schriftzug: breite, gesperrte Versalien, ein Buchstabe als Funkwelle bzw. Signal-Ausschlag, leichtes Flackern wie ein schwaches Signal. Als SVG, damit es überall scharf ist.

## Tonfall

Story-Kapitel im Funkspruch-Stil (kurz, hart, aus dem Cockpit). Gründe und Features direkt und gamer-nah. Deutsch und Englisch. Keine KI-Floskeln.

## Ton

Lautsprecher-Knopf, standardmäßig aus: Weltraum-Atmosphäre, Funkrauschen, leise Musik, kleine Klänge bei Klicks. Alles prozedural erzeugt (Web Audio), keine fremden Audiodateien.

## Handy

Volles Erlebnis, angepasst: gleiche Szenen, leichter gerechnet, Hochformat neu angeordnet. Viele Besucher kommen über TikTok/Instagram am Handy.

## Konten und Anmeldung

Ein Konto für Website, Wiki, Profil und Spiel. Anmeldung mit E-Mail, Google oder Discord. Bis der Anmeldeserver steht: Formular und Knöpfe fertig gebaut, angebunden über eine Schnittstelle `src/api.js`; ohne Server zeigt das Formular ehrlich „Reservierung öffnet in Kürze“ und speichert nichts vor. Keine vorgetäuschte Bestätigung.

## Rückmeldung Toni nach dem ersten Ansehen (30.10.2026)

Aufbau ist okay und macht schon Spaß. **Die Animationen gefallen nicht:** sie müssen deutlich prompter, schneller und krasser sein. Also: kürzere, härtere Übergänge, sofortige Reaktion auf Scrollen und Maus, mehr Wucht (Kamerastöße beim Kapitelwechsel, Lichtblitze, Signal-Glitches, Zahlen und Texte, die blitzartig einschießen), keine langsamen weichen Überblendungen und kein träges Nachziehen. Die 3D-Szene soll sich lebendiger anfühlen (Schiffe, die vorbeiziehen, Bewegung im Bild), nicht wie ein ruhiges Standbild.

## Rückmeldung Toni: so einfach wie die alte DarkOrbit-Seite (30.10.2026)

Die alte Seite war einfach und übersichtlich, man wollte überall draufdrücken. Bei uns ist zu viel überall. Daher: Hauptaktion sofort sichtbar (Jetzt spielen / Rufname sichern), pro Kapitel genau eine klare Überschrift, ein starkes Bild bzw. eine Szene und ein kurzer Satz, wenige große Klickflächen statt vieler kleiner Infos, Details erst auf Klick. Ruhe zwischen den Kapiteln, keine Datenwände.
