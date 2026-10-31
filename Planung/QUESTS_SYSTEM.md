# SYSTEM-Reihe: Einführungs-Quests (Toni, 30.10.2026)

Eigene Quest-Reihe „SYSTEM“, die den Spieler ins Spiel einführt und einmal von vorne bis hinten alles zeigt. **Mindestens 50 Quests.**

- Reihenfolge vom ersten Flug bis zu den fortgeschrittenen Systemen: Fliegen (Verfolger und Vogelperspektive, V), Zielen, Angreifen, Munition 1–6, Raketen, Schnellleiste belegen, Extras (EMP, SOS, Bombe, Minen), Techs, Konfigurationen, Beute und Crates, Erz, Andocken, Shop, Reparatur, Ausrüstung einbauen, Drohnen kaufen und Formationen, Sprung in andere Sektoren, Gegnertypen und Spezialangriffe ausweichen, Elite/Alpha, Ehre und Rang, Pilotenakte, Ruhmeshalle, Clan, Funk, Einstellungen.
- Jede Quest: kurze Funkspruch-Anleitung, klares Ziel, sichtbarer Hinweis im HUD (Pfeil/Markierung auf die richtige Taste, das Fenster oder das Ziel), Fortschritt, konkrete Belohnung (Credits, Tritium, Erfahrung, Ehre).
- Belohnungen so, dass man nach der Reihe gut ausgestattet ist, ohne dass es geschenkt wirkt.
- Überspringbar für erfahrene Spieler, im Questfenster als eigene Reihe „SYSTEM“ sichtbar.

## Questliste

Entwurf Claude, 30.10.2026, nach Tonis Vorgabe oben. 71 Quests in 18 Kapiteln. Reihenfolge der Themen wie in Tonis Liste. Abweichung nur dort, wo es spart, mehrmals hin- und herzufliegen: alles, was angedockt passiert (Erz verkaufen, Shop, FIX kaufen, Einbauen, Drohne kaufen), liegt in einem Kapitel. Der FIX-Einsatz im Flug und die Formationen kommen direkt danach.

**Lesart**
- **Funkspruch**: Text für `text` (die Simulation setzt wie bisher die Stationsstimme davor, z. B. „Station Europa an Pilot: …“).
- **Ziel**: `typ { parameter }`. Ohne Stern ist es ein vorhandener Typ aus `world.js` (`kill`, `ore`, `crate`, `jump`, `buy`). Mit Stern (*) ist es ein neuer Typ oder ein neuer Parameter, siehe „Neue Ziel-Typen“.
- **HUD-Hinweis**: worauf der Zeiger zeigt. „Platz n“ = Platz der Schnellleiste, „Randpfeil“ = Pfeil am Bildrand, wenn das Ziel nicht im Bild ist (wie die Angriffswarnung).
- **Belohnung**: Cr = Credits, T = Tritium, EP = Erfahrung, Ehre.
- `onStart` = die Quest löst beim Start selbst etwas aus (Gegner erscheint, Ereignis beginnt), damit seltene Dinge nicht vom Zufall abhängen.

### Kapitel 1 · Fliegen (Verfolger und Vogelperspektive)

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys01 | Signal empfangen | Station hier, wir hören dich. W gibt Schub, bis zum vollen Tempo dauert es ein paar Sekunden. | `fly { meters: 300 }`* | Tastenschild **W** unten mittig, Tempowert im Fenster SCHIFF | 500 Cr · 200 EP |
| sys02 | Die Maus lenkt | Im Verfolger folgt die Nase dem Mauszeiger. Dreh eine Runde um die Station. | `fly { meters: 1500, camera: 'chase' }`* | Fadenkreuz pulsiert, Bogenpfeil um die Station | 500 Cr · 300 EP |
| sys03 | Vollbremsung | S bremst. Aus voller Fahrt steht das Schiff nach knapp zwei Sekunden. | `brake { fromSpeed: 150 }`* | Tastenschild **S**, Tempowert SCHIFF | 500 Cr · 300 EP |
| sys04 | Von oben | V schaltet auf die taktische Ansicht. Von oben fliegst du per Klick. | `camera { target: 'tactical' }`* | Tastenschild **V** | 500 Cr · 300 EP |
| sys05 | Klick und weg | Klick auf den Wegpunkt, den Rest macht der Autopilot. | `reach { at: 'station', dx: 1200, dz: 600, r: 150, camera: 'tactical' }`* | Wegpunkt-Ring in der Welt, Punkt auf der KARTE, Randpfeil | 800 Cr · 400 EP |
| sys06 | Zurück ins Cockpit | V noch mal, du sitzt wieder hinter dem Schiff. Mit dem Mausrad zoomst du. | `camera { target: 'chase' }`* | Tastenschild **V**, Mausrad-Zeichen | 500 Cr · 300 EP |
| sys07 | Kurs per Karte | Unten rechts liegt die Karte. Klick das Asteroidenfeld an und flieg hin. | `reach { field: 'asteroids' }`* | Fenster KARTE umrandet, nächstes Asteroidenfeld blinkt auf der Karte | 1.000 Cr · 500 EP |

### Kapitel 2 · Zielen und Angreifen

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys08 | Ziel erfassen | Kontakt. Tab erfasst den nächsten Gegner, ein Klick geht auch. Hülle und Schild stehen oben rechts im Fenster ZIEL. | `target {}`* | **Tab**, Klammer am nächsten Gegner, Fenster ZIEL umrandet | 800 Cr · 400 EP |
| sys09 | Feuer frei | Leertaste startet den Angriff, noch einmal stoppt ihn. Die Laser feuern nur, wenn die Nase zum Ziel zeigt. | `attack {}`* | **Leertaste**, Feuerkegel (75°) vor der Nase kurz eingeblendet | 800 Cr · 400 EP |
| sys10 | Erster Abschuss | Erst fällt der Schild, dann die Hülle. Bring ihn runter. | `kill { target: null, count: 1 }` | Schild- und Hüllenbalken im Fenster ZIEL | 1.500 Cr · 800 EP · 5 Ehre |
| sys11 | Das Rudel | Raider jagen im Rudel und kommen von mehreren Seiten. Bleib in Bewegung und hol dir drei. | `kill { target: 'raider', count: 3 }` | Randpfeil zum nächsten Raider-Rudel (Route Station–Tor), Rudel auf der KARTE | 2.000 Cr · 1.000 EP · 10 Ehre |
| sys12 | Die Brut | Larven bewachen die Felder. Wer näher als 300 Meter kommt, wird angesprungen. Räum vier weg. | `kill { target: 'larva', count: 4 }` | Randpfeil zum Asteroidenfeld, 300-m-Kreis um das Larven-Rudel | 2.000 Cr · 1.000 EP · 5 T · 10 Ehre |

### Kapitel 3 · Munition 1–6

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys13 | Standard | Taste 1 ist L1: billig, immer an Bord, einfacher Schaden. 20 Treffer. | `shoot { ammo: 'L1', count: 20 }`* | Platz 1 | 800 Cr · 500 EP |
| sys14 | Doppelt | Taste 2: L2 macht doppelten Schaden und kostet Credits. 20 Treffer. | `shoot { ammo: 'L2', count: 20 }`* | Platz 2 | 1.000 Cr · 600 EP |
| sys15 | Tritium-Munition | L3 auf Taste 3, dreifacher Schaden, bezahlt mit Tritium. Nimm sie, wenn es zählt. 15 Treffer. | `shoot { ammo: 'L3', count: 15 }`* | Platz 3, Tritium im Fenster KONTO | 1.000 Cr · 600 EP · 15 T |
| sys16 | Schwere Ladung | L4 auf Taste 4, vierfacher Schaden. Teuer, also nur für harte Ziele. 10 Treffer. | `shoot { ammo: 'L4', count: 10 }`* | Platz 4 | 1.000 Cr · 700 EP · 20 T |
| sys17 | Schildsauger | SAB auf Taste 5 trifft nur Schilde und schiebt dir die Hälfte davon in den eigenen. 10 Treffer auf Schild. | `shoot { ammo: 'SAB', count: 10, shieldOnly: true }`* | Platz 5, Schildbalken im Fenster SCHIFF | 1.000 Cr · 700 EP · 15 T |
| sys18 | Ein Schuss, der sitzt | Taste 6 feuert SAL: sechsfacher Schaden, 4 Sekunden eigene Ladezeit, danach läuft deine Munition weiter. 3 Schüsse ins Ziel. | `shoot { ammo: 'SAL', count: 3 }`* | Platz 6 mit Ladering | 1.500 Cr · 800 EP · 20 T |

### Kapitel 4 · Raketen

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys19 | Rakete los | R schickt eine R1 aufs Ziel, danach lädt der Werfer 3 Sekunden. Weicht das Ziel gerade aus oder steht ein Brocken dazwischen, geht sie vorbei. 3 Treffer. | `rocket { target: 'R1', count: 3 }`* | Tastenschild **R**, Ladeanzeige an Platz 7 | 1.500 Cr · 800 EP · 5 Ehre |

### Kapitel 5 · Schnellleiste belegen

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys20 | Arsenal | Rechts an der Leiste liegt ARSENAL, da ist alles, was du an Bord hast. Mach es auf. | `window { target: 'arsenal' }`* | Knopf ARSENAL umrandet | 500 Cr · 200 EP |
| sys21 | Zweite Leiste | Alt+2 schaltet auf Leiste 2, die ist noch leer. Alt+1 bringt dich zurück. | `hotbar { action: 'switch', bar: 2 }`* | Leistennummer an der Schnellleiste, Tastenschild **Alt+2** | 500 Cr · 300 EP |
| sys22 | Leiste belegen | Zieh R3, SPM, BRM und TRN aus dem Arsenal auf Leiste 2. Rechtsklick leert einen Platz wieder. | `hotbar { action: 'place', bar: 2, count: 4 }`* | Ziehpfeil vom Arsenal-Eintrag (zuerst R3) zum nächsten freien Platz | 800 Cr · 400 EP |
| sys23 | Schwere Rakete | R3 hat den vierfachen Schaden einer R1 und kostet Tritium. Zwei Treffer. | `rocket { target: 'R3', count: 2 }`* | Platz mit R3 auf Leiste 2 | 1.000 Cr · 600 EP · 15 T |

### Kapitel 6 · Extras (EMP, SOS, Bombe, Minen, Tarnung)

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys24 | Störfeuer | EMP stört alles in 700 Metern: Gegner verlieren dich, Getarnte werden sichtbar, Spezialangriffe brechen ab. Zünde ihn mit einem Gegner in Reichweite. | `extra { target: 'EMP', hits: 1 }`* | Platz EMP, 700-m-Kreis um das Schiff | 1.000 Cr · 600 EP · 20 T |
| sys25 | Sofortschild | SOS macht dich 3 Sekunden unverwundbar, schießen geht weiter. Setz ihn unter Beschuss ein. | `extra { target: 'SOS', inCombat: true }`* | Platz SOS blinkt, sobald der Schild unter 50 % fällt | 1.000 Cr · 600 EP · 20 T |
| sys26 | Bombe | Die Bombe trifft alles in 450 Metern. Warte, bis mindestens zwei nah dran sind. | `extra { target: 'BMB', hits: 2 }`* | Platz BMB, 450-m-Kreis, Zähler „im Kreis: n“ | 1.500 Cr · 800 EP · 15 T · 5 Ehre |
| sys27 | Sprengmine | Minen fallen hinter dem Heck und sind nach einer Sekunde scharf. Zieh einen Verfolger drüber. | `mine { target: 'SPM', count: 1 }`* | Platz SPM (Leiste 2), Markierung hinter dem Heck | 1.000 Cr · 600 EP |
| sys28 | Bremsen und Stören | BRM bremst auf halbes Tempo, STM nimmt 4 Sekunden die Zielerfassung. Lass eine davon zünden. | `mine { target: ['BRM', 'STM'], count: 1 }`* | Platz BRM (Leiste 2), STM per Klick aus dem Arsenal | 1.000 Cr · 600 EP |
| sys29 | Aus dem Nichts | TRN geht erst nach 5 Sekunden ohne Kampf, dein erster Schuss deckt dich auf. Tarn dich und eröffne so den Angriff. | `extra { target: 'TRN', strike: true }`* | Platz TRN, Ring „5 s ohne Kampf“ läuft ab | 1.500 Cr · 800 EP · 25 T |

### Kapitel 7 · Techs

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys30 | Kettenblitz | ARC springt von Ziel zu Ziel, bis zu fünf. Triff mindestens drei. | `tech { target: 'ARC', hits: 3 }`* | Platz ARC, Gegner im Umkreis von 650 m markiert | 2.000 Cr · 1.000 EP · 5 Ehre |
| sys31 | Zielsperre | Mit LCK trifft 15 Sekunden lang jede Rakete, auch ausweichende Ziele. Drei Treffer unter Zielsperre. | `rocket { count: 3, lock: true }`* | Platz LCK, danach Tastenschild **R** | 1.500 Cr · 1.000 EP · 15 T |
| sys32 | Energie saugen | VMP: 10 Sekunden lang heilt ein Teil deines Laserschadens die Hülle. Nimm es mitten im Kampf. | `tech { target: 'VMP', heal: true }`* | Platz VMP blinkt bei Hülle unter 90 %, grüne Heilzahlen | 1.500 Cr · 800 EP |
| sys33 | Reserveschild | RSV füllt den Schild sofort. Warte, bis er unter 30 % ist. | `tech { target: 'RSV', shieldBelow: 0.3 }`* | Platz RSV blinkt ab Schild unter 30 % | 1.500 Cr · 800 EP · 30 T |

### Kapitel 8 · Konfigurationen

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys34 | Mehr Schild | Dein Schiff hat drei Konfigurationen. Konfiguration 2 fährt zwei Schildgeneratoren, schalte um. | `config { target: 2 }`* | Arsenal-Gruppe KONFIGURATION, Schildwert im Fenster SCHIFF | 800 Cr · 500 EP |
| sys35 | Mehr Tempo | Konfiguration 3 fährt zwei Antriebe. Schalte um und flieg 2 Kilometer, danach zurück auf 1. | `fly { meters: 2000, config: 3 }`* | Tempowert im Fenster SCHIFF | 800 Cr · 500 EP |

### Kapitel 9 · Beute und Crates

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys36 | Wracks | Jeder Abschuss hinterlässt ein Wrack mit Credits und etwas Tritium. 10 Sekunden gehört es nur dir. Flieg über drei. | `loot { target: 'wreck', count: 3 }`* | Wrack-Marker mit Beuteschutz-Countdown | 1.000 Cr · 600 EP |
| sys37 | Treibgut | Crates treiben überall, der Inhalt ist Zufall. Manchmal ist es eine Piratenfalle. Sammle drei. | `crate { count: 3 }` | Randpfeil zur nächsten Crate | 1.000 Cr · 600 EP · 10 T |
| sys38 | Verlorene Ladung | Ein Frachter hat Ladung verloren. Hol alle Crates, bevor die Zeit abläuft. | `event { target: 'drift', success: true }`* · `onStart: { event: 'drift' }`* | Ereignis-Marker, Zeitleiste im Fenster MISSION | 2.000 Cr · 1.200 EP · 10 T · 5 Ehre (plus Ereignis-Belohnung) |

### Kapitel 10 · Erz

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys39 | Nickel | Die grauen Brocken sind Nickel. Flieg dicht ran, dann ist er im Laderaum. 20 Einheiten. | `ore { target: 'nickel', count: 20 }` | Erz-Marker, Laderaum im Fenster SCHIFF | 1.000 Cr · 600 EP |
| sys40 | Cobalt | Blau ist Cobalt und doppelt so viel wert. 10 Einheiten, in den Laderaum passen 100. | `ore { target: 'cobalt', count: 10 }` | blaue Erz-Marker, Laderaumbalken | 1.500 Cr · 600 EP |

### Kapitel 11 · Station: Andocken, Shop, Reparatur, Ausrüstung, Drohne

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys41 | Andocken | Zurück zur Station. In der sicheren Zone, 400 Meter um die Station, dockst du mit E an. Dort heilt die Hülle von selbst. | `dock {}`* | Stationsmarker, Kreis der sicheren Zone, Tastenschild **E** | 800 Cr · 400 EP |
| sys42 | Erz verkaufen | Reiter Erz: verkauf deine Ladung. | `sell { count: 1 }`* | Reiter ERZ (3), Knopf Verkaufen | 500 Cr · 300 EP |
| sys43 | Nachschub | Im Shop gibt es Munition in Packungen. Hol dir eine Packung L2. | `buy { target: 'L2', count: 1 }` | Reiter SHOP → Munition → L2 | 800 Cr · 300 EP |
| sys44 | Ion Laser | Der Ion Laser macht 100 statt 70 Schaden je Schuss. Kauf einen, er ersetzt sofort deinen schwächsten Laser. | `buy { target: 'ion', count: 1 }` | SHOP → Laser → Ion Laser | 3.000 Cr · 1.200 EP |
| sys45 | Reparatur | Abgeschossen reparierst du an der Station, am Tor oder vor Ort, bis Stufe 10 kostenlos. Für den Kampf kauf dir eine FIX. | `buy { target: 'FIX', count: 1 }`* | SHOP → Techs → FIX | 2.000 Cr · 600 EP |
| sys46 | Umbau | Im Lager liegt ein zweiter SH-1. Bau ihn im Hangar ein: mehr Schild, dafür weniger Tempo. | `equip { slot: 'gen', item: 'sh1' }`* | Reiter HANGAR (1), Lagereintrag SH-1, Zielplatz | 1.000 Cr · 600 EP |
| sys47 | Erste Drohne | Drohnen fliegen mit dir und tragen je einen Laser oder Schildgenerator. Kauf eine Pioneer. | `drone { action: 'buy', target: 'pioneer' }`* · `requires: 'drones'` | SHOP → Drohnen → Pioneer | 2.000 Cr · 800 EP |

### Kapitel 12 · Reparatur im Flug und Formationen

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys48 | Kampfreparatur | Abdocken mit E. Fällt die Hülle unter 80 %, setz FIX ein: 10 Sekunden lang 5 % je Sekunde. | `repair { source: 'FIX', hullBelow: 0.8 }`* | Platz FIX blinkt ab Hülle unter 80 % | 1.500 Cr · 800 EP |
| sys49 | Ring | Formationen ordnen deine Drohnen. Ring kreist ums Schiff: mehr Schild, etwas langsamer. Schalte auf Ring. | `formation { target: 'ring' }`* | Arsenal-Gruppe FORMATION → Ring | 800 Cr · 500 EP |
| sys50 | Swarm | Swarm ist gegen Piraten und Schwarm gebaut. Zerstöre vier Gegner mit Swarm. | `kill { target: null, count: 4, formation: 'swarm' }`* | Formations-Platz Swarm, danach Klammer am nächsten Gegner | 2.000 Cr · 1.200 EP · 10 Ehre |

### Kapitel 13 · Sprung in andere Sektoren

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys51 | Hinaus | Das Tor liegt am anderen Ende des Sektors. Bis auf 150 Meter ran, dann J. Drüben wird es härter. | `jump { target: 2 }` | Randpfeil zum Tor, Tastenschild **J** ab 150 m | 3.000 Cr · 1.500 EP |

### Kapitel 14 · Gegnertypen und Spezialangriffe

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys52 | Schakale | Jackals lauern getarnt und springen an, wenn du unter 70 % fällst. EMP holt sie raus. Zerstöre drei. | `kill { target: 'jackal', count: 3 }` | Platz EMP, Taktik „lauert getarnt“ im Fenster ZIEL | 4.000 Cr · 2.500 EP · 20 T · 15 Ehre |
| sys53 | Salve | Leuchtet ein Gegner auf, lädt er einen Spezialangriff, die Bahn liegt am Boden. Kurs oder Tempo ändern, und die Salve geht vorbei. Zweimal. | `dodge { target: 'volley', count: 2 }`* | Warnschild mit Countdown, Bodenbahn hervorgehoben | 2.000 Cr · 1.500 EP · 10 Ehre |
| sys54 | Rammangriff | Jackals rammen in gerader Linie. Raus zur Seite, sobald die Bahn erscheint. | `dodge { target: 'ram', count: 1 }`* | wie sys53 | 2.000 Cr · 1.500 EP · 10 Ehre |
| sys55 | Abgebrochen | Eine Rakete oder ein schwerer Treffer bricht das Aufladen ab. Stopp einen Angriff, bevor er kommt. | `interrupt { count: 1 }`* | Ladeleuchten am Gegner, Tastenschild **R** | 2.500 Cr · 1.500 EP · 10 T · 10 Ehre |
| sys56 | Tiefer | Weiter durch das zweite Tor. In Sektor 3 fliegt alles ab Stufe 6, bleib erst mal nah am Tor. | `jump { target: 3 }` | Randpfeil zum Tor nach Sektor 3 | 3.000 Cr · 2.000 EP |
| sys57 | Säure | Spiker spucken Säure aus der Ferne. Raus aus dem grünen Kreis, bevor er sich schließt. | `dodge { target: 'acid', count: 1 }`* | grüne Bodenfläche hervorgehoben | 2.000 Cr · 1.500 EP · 10 Ehre |
| sys58 | Spiker | Spiker halten Abstand und heilen hinter Asteroiden. Zerstöre zwei. | `kill { target: 'spiker', count: 2 }` | Taktik „deckung“ im Fenster ZIEL, Deckungsbrocken markiert | 5.000 Cr · 3.500 EP · 30 T · 20 Ehre |
| sys59 | Plünderer | Vultures klauen Wracks, auch deine, und ziehen einen Schildwall hoch. Schnapp dir einen, bevor er abhaut. | `kill { target: 'vulture', count: 1 }` | Randpfeil zum Vulture, Hinweis „Schildwall: SAB“ | 5.000 Cr · 3.500 EP · 30 T · 20 Ehre |
| sys60 | Heimsprung | JMP bringt dich nach 8 Sekunden Ladezeit nach Hause, ganz ohne Tor. Spring. | `extra { target: 'JMP' }`* (zählt bei Ankunft) | JMP per Klick aus dem Arsenal auf Leiste 2, danach Ladebalken | 1.500 Cr · 800 EP · 25 T |

### Kapitel 15 · Elite und Alpha

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys61 | Elite | Ein Elite Raider ist in deiner Nähe gemeldet: dreimal so viel Leben, Schaden und Beute. Zerstöre ihn. | `kill { rank: 'elite', count: 1 }`* · `onStart: { spawn: { type: 'raider', rank: 'elite', dist: 1500 } }`* | Randpfeil zum Elite, Name hervorgehoben | 4.000 Cr · 2.500 EP · 30 T · 25 Ehre |
| sys62 | Alpha | Alpha-Kontakt. Zehnfache Stärke und eine Sonderfähigkeit, lies sie im Fenster ZIEL, bevor du angreifst. | `kill { rank: 'alpha', count: 1 }`* · `onStart: { spawn: { type: 'raider', rank: 'alpha', perk: 'summon', dist: 2000 } }`* | Randpfeil zum Alpha, Zeile Sonderfähigkeit im Fenster ZIEL | 8.000 Cr · 5.000 EP · 75 T · 50 Ehre |

### Kapitel 16 · Ehre und Rang

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys63 | Konvoi | Der Frachter Kestrel wird angegriffen. Halt ihn am Leben, das bringt Ehre. | `event { target: 'convoy', success: true }`* · `onStart: { event: 'convoy' }`* | Ereignis-Marker am Frachter, Lebensbalken im Fenster MISSION | 3.000 Cr · 2.000 EP · 15 T · 20 Ehre (plus Ereignis-Belohnung) |
| sys64 | Serie | Abschüsse kurz hintereinander geben Bonus auf Erfahrung, Ehre und Credits. Hol dir eine Serie von drei. | `combo { count: 3 }`* | Serienanzeige unter SEKTOR | 1.500 Cr · 1.200 EP · 10 Ehre |
| sys65 | Rang | Aus Ehre und Erfahrung werden Rangpunkte. Öffne PILOT und sieh nach, wo du stehst. | `window { target: 'pilot' }`* | Fenster PILOT, Zeile Rang | 500 Cr · 300 EP |

### Kapitel 17 · Pilotenakte, Ruhmeshalle, Clan, Funk, Einstellungen (Hub)

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys66 | Pilotenakte | Esc, dann ZUM HUB. In der Pilotenakte steht alles über dich, später auch die Forschung aus Black Boxes. | `window { target: 'hub:akte' }`* | im Bordmenü (Esc) Knopf ZUM HUB, im Hub Bereich PILOTENAKTE | 800 Cr · 400 EP |
| sys67 | Ruhmeshalle | Die Ruhmeshalle zeigt die Besten deiner Fraktion, nach Ehre, Erfahrung und mehr. Such deinen Platz. | `window { target: 'hub:ruhm' }`* | Bereich RUHMESHALLE | 800 Cr · 400 EP |
| sys68 | Clan | Clans verbinden Piloten aus allen drei Fraktionen. Gründen und Beitreten geht ab Stufe 10, schau schon mal rein. | `window { target: 'hub:clan' }`* | Bereich CLAN | 800 Cr · 400 EP |
| sys69 | Funkprotokoll | Im Funkprotokoll steht jede Meldung, die du bekommen hast. Lies nach. | `window { target: ['hub:funk', 'comms'] }`* | Bereich FUNK (im Flug: Fenster FUNK) | 500 Cr · 300 EP |
| sys70 | Cockpit einstellen | Stell dir das Cockpit ein: Kamera, Kamerawackeln, Balken oder genaue Werte. Ändere eine Einstellung. | `setting { count: 1 }`* | Bereich EINSTELLUNGEN (im Flug: Esc → ANZEIGE) | 800 Cr · 400 EP |

### Kapitel 18 · Abschluss

| ID | Titel | Funkspruch | Ziel | HUD-Hinweis | Belohnung |
|---|---|---|---|---|---|
| sys71 | Signal steht | Ausbildung abgeschlossen, ab hier fliegst du deine eigenen Wege. Erreiche Stufe 5, dann wartet Schiff 2 im Shop. | `level { target: 5 }`* | Erfahrungsbalken im Fenster PILOT | 5.000 Cr · 150 T · 30 Ehre |

### Summe der Belohnungen

| Kapitel | Credits | Tritium | Erfahrung | Ehre |
|---|---:|---:|---:|---:|
| 1 Fliegen | 4.300 | 0 | 2.300 | 0 |
| 2 Zielen und Angreifen | 7.100 | 5 | 3.600 | 25 |
| 3 Munition | 6.300 | 70 | 3.900 | 0 |
| 4 Raketen | 1.500 | 0 | 800 | 5 |
| 5 Schnellleiste | 2.800 | 15 | 1.500 | 0 |
| 6 Extras | 7.000 | 80 | 4.000 | 5 |
| 7 Techs | 6.500 | 45 | 3.600 | 5 |
| 8 Konfigurationen | 1.600 | 0 | 1.000 | 0 |
| 9 Beute und Crates | 4.000 | 20 | 2.400 | 5 |
| 10 Erz | 2.500 | 0 | 1.200 | 0 |
| 11 Station | 10.100 | 0 | 4.200 | 0 |
| 12 Reparatur, Formationen | 4.300 | 0 | 2.500 | 10 |
| 13 Sprung | 3.000 | 0 | 1.500 | 0 |
| 14 Gegner und Spezialangriffe | 27.000 | 115 | 18.300 | 95 |
| 15 Elite und Alpha | 12.000 | 105 | 7.500 | 75 |
| 16 Ehre und Rang | 5.000 | 15 | 3.500 | 30 |
| 17 Hub | 3.700 | 0 | 1.900 | 0 |
| 18 Abschluss | 5.000 | 150 | 0 | 30 |
| **Summe SYSTEM** | **113.700** | **620** | **63.700** | **285** |

**Begründung**
- **Erfahrung:** 63.700 aus den Quests, dazu rund 25.000–30.000 aus den etwa 55 Abschüssen, die die Reihe verlangt, und 5.500 aus den Ereignissen Treibgut und Konvoi. Zusammen etwa 95.000. Damit erreicht man Stufe 5 (84.449) gegen Ende, in Kapitel 15 oder 16, aber nicht Stufe 6 (137.973). Beim Sprung nach Sektor 3 (sys56) steht man bei rund 60.000, also Stufe 4. Sektor 3 ist damit noch fordernd, die Reihe verlangt dort nur 2 Spiker und 1 Vulture. sys71 sichert ab: Wer Stufe 5 schon hat, schließt sofort ab, alle anderen haben ein klares nächstes Ziel.
- **Credits:** 20.000 Start + 113.700 aus Quests + etwa 25.000 aus Wracks, Crates und Erz + 11.000 aus den beiden Ereignissen ≈ 170.000. Pflichtkäufe in der Reihe: L2-Packung, Ion Laser (15.000), FIX (6.000), Pioneer (Preis offen, angenommen bis 10.000), zusammen etwa 32.000. Übrig bleiben rund 140.000. Das reicht für Schiff 2 (60.000) und drei weitere Ion Laser für dessen vier Laserplätze. Gut ausgestattet, aber Schiff 3 (250.000) und jedes weitere Teil muss man sich erspielen.
- **Tritium:** Was die Reihe verbraucht (L3, L4, SAB, SAL, R3, Extras, Techs), liegt schon im Erprobungspaket. Die 620 T aus den Quests sind Vorrat: zusammen mit Start (50) und Reaktor-Drops etwa 780 T. Das reicht, um L3/SAB und Extras nachzukaufen, aber nicht für eine Tritium-Formation (1.500) oder den Plasma Laser (10.000). Tritium bleibt das Sparziel, wie in der Vault-Notiz gewollt.
- **Ehre:** 285 aus den Quests, mit Abschüssen und Ereignissen etwa 450. Spürbar im Rang, aber kein großer Sprung.
- **Mit der Stationsreihe q1–q7:** Läuft sie parallel, zählen sys11/q1, sys12/q4, sys37/q2, sys44/q3, sys51/q5 und sys58/q7 doppelt. q1–q7 bringen zusammen 65.000 Cr, 330 T, 47.500 EP und 200 Ehre. Dann kommen insgesamt etwa 235.000 Cr und 142.000 EP zusammen, also schon Stufe 6. Das ist zu viel, siehe „Offene Punkte für Toni“.

### Neue Ziel-Typen

Alle neuen Typen laufen über denselben Weg wie die vorhandenen (`_questProgress(type, target, amount, ctx)`). Was nur das HUD, `input.js` oder der Hub weiß, meldet es über das Bus-Ereignis `questSignal { type, target, amount, ctx }`. Die Welt hört darauf.

| Typ | Parameter | Auslöser (wer meldet) |
|---|---|---|
| `fly` | `meters`, optional `camera` ('chase'/'tactical'), `config` (1–3) | Simulation: geflogene Strecke des Spielers je Schritt (nicht angedockt, nicht im Sprung), zählt nur bei passender Kamera bzw. Konfiguration. Kamera liest die Welt aus `world.cameraMode` (setzt `input.js` nach `toggleCamera()`) |
| `brake` | `fromSpeed` | Simulation: Spieler war schneller als `fromSpeed` und steht danach (unter 10 m/s) nach `stopMove()` |
| `camera` | `target` | `input.js` nach `renderer.toggleCamera()` → `questSignal { type: 'camera', target: mode }`. Ist die Kamera beim Start schon richtig, zählt es sofort |
| `reach` | `at` + `dx`/`dz` + `r` (Wegpunkt relativ zur Station) oder `field` ('asteroids'/'debris'/'nebula'), optional `camera` | Simulation: Lageprüfung alle 0,25 s. Den Wegpunkt legt die Quest beim Start in `world.questMarker` ab, Grafik und Karte zeigen ihn |
| `target` | optional `target` (Gegnertyp) | Simulation: `setTarget(id)` auf einen Gegner |
| `attack` | – | Simulation: `toggleAttack()`, wenn der Angriff beginnt |
| `shoot` | `ammo`, `count`, optional `shieldOnly` | Simulation: Spielerschuss mit `hit: true` und dieser Munition (SAL: Treffer aus `fireSal()`), `shieldOnly` zählt nur Schildschaden |
| `rocket` | optional `target` ('R1'/'R2'/'R3'), `count`, optional `lock` | Simulation: Raketentreffer (kein `rocketMiss`), `lock` nur bei aktiver LCK |
| `window` | `target` (einer oder Liste): HUD-Fenster `'pilot'`, `'comms'`, `'map'`, `'quick'`, `'arsenal'`, `'menu'`, Station `'station:shop'` …, Hub `'hub:akte'`, `'hub:ruhm'`, `'hub:clan'`, `'hub:funk'`, `'hub:einst'` | HUD, `station.js`, `screens-hub.js`: Fenster geöffnet oder angeklickt. Hub ohne laufende Welt schreibt direkt ins Profil (siehe Umsetzung) |
| `hotbar` | `action` ('switch'/'place'), optional `bar`, `target` ('art:id'), `count` | HUD (`hud-bar.js`): Leistenwechsel bzw. neu belegter Platz |
| `extra` | `target`, optional `hits` (Mindestzahl getroffener Gegner), `inCombat`, `strike` (erster Angriff aus der Tarnung) | Simulation: Ereignis `ability` mit `kind: 'extra'` (`phase 'use'`/`'fire'`, `hits`). JMP zählt erst bei der Ankunft |
| `mine` | `target` (einer oder Liste), `count` | Simulation: `ability` mit `kind: 'mine'`, `phase: 'fire'` (Mine zündet an einem Gegner) |
| `tech` | `target`, optional `hits`, `heal` (Heilung > 0), `shieldBelow` | Simulation: `ability` mit `kind: 'tech'`. Bedingung wird beim Auslösen geprüft |
| `config` | `target` (1–3) | Simulation: Ereignis `config { n }` |
| `formation` | `target` | Simulation: Ereignis `formation { id }` |
| `loot` | `target: 'wreck'`, `count` | Simulation: Wrack eingesammelt |
| `event` | `target` ('drift'/'convoy'/'nest'), `success` | Simulation: Sektor-Ereignis endet erfolgreich |
| `dock` / `undock` | – | Simulation: `docked` bzw. `undocked` |
| `sell` | `count` | Simulation: `sellOre()` mit Ertrag über 0 |
| `equip` | `slot` ('laser'/'gen'), optional `item` | Simulation: `equip()` erfolgreich |
| `repair` | optional `source` ('FIX'/'station'/'portal'/'here'/'safe'), `hullBelow` | Simulation: `repair(where)` erfolgreich oder Ereignis `heal` mit `source: 'FIX'` (Hülle beim Start unter `hullBelow`) |
| `drone` | `action: 'buy'`, `target` | Simulation, sobald es Drohnen gibt (Kauf). Quests mit `requires: 'drones'` werden bis dahin übersprungen und später nachgereicht |
| `dodge` | `target` (Art: 'volley'/'ram'/'leap'/'acid'), `count` | `sim/ai.js`: Spezialangriff mit Ziel Spieler ausgeführt (`special`, `cancelled: false`) und der Spieler hat von genau diesem Angriff keinen Schaden bekommen (Säure: während der ganzen Wirkdauer) |
| `interrupt` | `count` | `sim/ai.js`: `special` mit `cancelled: true`, weil der Spieler schwer getroffen hat (Rakete, kritisch, ≥ 10 % Leben+Schild) |
| `combo` | `count` | Simulation: Ereignis `combo` mit `count` ≥ Zielwert |
| `level` | `target` | Simulation: `levelup`. Ist die Stufe beim Start schon erreicht, zählt es sofort |
| `setting` | optional `target` (Schlüssel), `count` | `screens-hub.js` (Einstellungen) bzw. `hud-menu.js` (Esc → ANZEIGE): eine Einstellung geändert |
| `key` | `code` | Reserve für reine Tasten-Lektionen: `input.js`/HUD melden die Taste. In der Liste oben nicht genutzt |

**Erweiterungen vorhandener Typen**
- `kill`: neu `rank` ('elite'/'alpha', `target` darf dann fehlen), `formation` (zählt nur mit dieser Formation). `target: null` zählt schon heute jeden Gegner.
- `buy`: `world.buy()` meldet heute nur Laser, Generatoren, Munition, Raketen und Schiffe. Für `extra`, `mine`, `tech`, `formation` (und später Drohnen) fehlt `this._questProgress('buy', id, n)`.
- Quest-Felder neu: `onStart` (`spawn: { type, rank, perk, dist }` über eine öffentliche Fassung von `spawnTemp`, `event` über `startEvent(type)`), `requires` (Funktion fehlt noch → überspringen), `hint` (HUD-Zeiger, siehe Umsetzung), `chapter`.

## Umsetzung

Plan, noch nicht gebaut. Zuständigkeit nach `SCHNITTSTELLEN.md`.

**1. Daten (`src/core/data.js`, Simulation)**
```js
export const QUEST_SERIES = {
  system:  { id: 'system',  title: 'SYSTEM',  skippable: true,  quests: SYSTEM_QUESTS },
  station: { id: 'station', title: 'STATION', skippable: false, quests: QUESTS },   // q1–q7 bleiben
};
export const SYSTEM_CHAPTERS = [ { no: 1, title: 'Fliegen' }, … { no: 18, title: 'Abschluss' } ];
// Eine Quest:
{ id: 'sys24', chapter: 6, title: 'Störfeuer', text: '…',
  goal: { type: 'extra', target: 'EMP', hits: 1, count: 1 },
  hint: [ { kind: 'slot', art: 'extra:EMP' }, { kind: 'ring', radius: 700 } ],
  reward: { credits: 1000, xp: 600, tritium: 20 },
  onStart: null, requires: null }
```
`count` ist immer gesetzt (Standard 1), damit `progress / count` überall gleich angezeigt wird.

**2. Profil**
```js
profile.quests = {
  system:  { index: 0, progress: 0, skipped: false, skippedIds: [], pendingIds: [] },
  station: { index: 0, progress: 0 },
};
```
Einmalige Übernahme: altes `profile.quest` → `quests.station`. Bestehende Piloten bekommen `system` mit `index 0`. Beim ersten Start fragt der Funk einmal, ob man die Ausbildung fliegen oder überspringen will (Knopf im Fenster MISSION).

**3. Logik (`src/core/quests.js`, neu)**
Reine Funktionen auf dem Profil, ohne Welt, damit Simulation und Hub denselben Code nutzen:
`activeQuest(profile, series)`, `signal(profile, type, target, amount, ctx) → [{ series, quest, progress, done }]`, `complete(profile, series) → reward`, `skip(profile, series, scope)` (scope: 'quest'/'chapter'/'all'), `resume(profile, series)`, `checkNow(profile, state)` (Ziele, die schon erfüllt sind: Kamera, Stufe, Besitz). Die Welt ruft an den heutigen Stellen `signal(...)` statt nur `_questProgress` und schreibt die Belohnung wie bisher in `_completeQuest` gut. `world.quest` bleibt für die Stationsreihe erhalten (HUD bricht nicht), neu ist `world.quests = { system: { def, progress }, station: { def, progress } }`. Das Ereignis `quest` bekommt das Feld `series`. Der Hub (keine laufende Welt) ruft `signal()` direkt und speichert über `store.save`. Die Belohnung wird beim nächsten Start gutgeschrieben, Meldung im Funk.

**4. Questfenster MISSION (HUD)**
Zwei Reiter, SYSTEM und STATION. SYSTEM zeigt Kapitel und Nummer (z. B. „Kapitel 6 · 24/71“), Titel, Funkspruch, Fortschrittsbalken, Belohnung konkret, Knöpfe „Hinweis zeigen“, „Quest überspringen“, „Kapitel überspringen“. Im Bordmenü (Esc → SYSTEM) „Ausbildung überspringen“ und „Ausbildung fortsetzen“. Liste der Kapitel aufklappbar mit Haken je Quest. Im Hub unter PILOTENAKTE → AUFTRAG (gibt es schon) dieselbe Übersicht.

**5. Überspringen**
- Für erfahrene Spieler: ganze Reihe, ein Kapitel oder eine Quest. Übersprungene Quests geben keine Belohnung und landen in `skippedIds`. Mit „Ausbildung fortsetzen“ lassen sie sich jederzeit nachholen.
- Ziele, die schon erfüllt sind (Kamera, Stufe, Ion Laser im Besitz), schließen beim Start sofort ab, mit Belohnung. Das verhindert Leerlauf für Spieler, die vorgreifen.
- `requires: 'drones'`: Quest geht in `pendingIds` und erscheint, sobald es die Funktion gibt (Funkspruch „Neue Ausbildung verfügbar“).
- Nicht überspringen: während eines laufenden Kampfes nur die aktuelle Quest, damit keine `onStart`-Gegner herrenlos herumfliegen. Mit `onStart` erzeugte Gegner verschwinden, wenn die Quest übersprungen wird.

**6. HUD-Zeiger (`src/ui/hud-guide.js` + `hud-guide.css`, HUD)**
Liest `world.quests.system.def.hint` (Liste) und zeigt höchstens zwei Zeiger gleichzeitig:
- `{ kind: 'key', key: 'V' }` – Tastenschild unten mittig über der Konsole, pulsiert, Stil wie `ls-key`.
- `{ kind: 'window', id: 'map' }` – Rahmen um das Fenster, dazu das Symbol in der Fensterleiste. Ist das Fenster zu, pulsiert nur das Symbol.
- `{ kind: 'slot', art: 'extra:EMP' }` – Rahmen um den Platz der Schnellleiste (`hud.bar` liefert die Lage). Liegt es auf keiner Leiste: Zeiger auf ARSENAL.
- `{ kind: 'world', ref: 'nearestEnemy' | 'station' | 'portal' | 'crate' | 'wreck' | 'ore:nickel' | 'field:asteroids' | 'marker' }` – Klammer an der Stelle über `renderer.toScreen()`. Außerhalb des Bildes: Randpfeil mit Entfernung, wie die Angriffswarnung. Dazu ein Punkt auf der KARTE.
- `{ kind: 'ring', radius }` – Kreis um das eigene Schiff (Grafik, über `telegraph` mit `own: true` oder einen eigenen Ring).
- `{ kind: 'station', tab: 'shop', item: 'ion' }` und `{ kind: 'hub', section: 'akte' }` – Rahmen in `station.js` bzw. `screens-hub.js`.
- Bedingte Zeiger (`when: { shieldBelow: 0.5 }`) erscheinen erst, wenn es so weit ist (SOS, RSV, FIX).
Regeln: Zeiger blendet sich nach Fortschritt kurz aus und bei Stillstand von 8 s wieder ein. Schalter „Ausbildungshinweise An | Aus“ in den Einstellungen (`'ls.settings'.guide`). Leistung nach den Pflichtregeln: DOM nur bei Änderung, Lage höchstens 30-mal je Sekunde, keine neuen Objekte je Bild.

**7. Reihenfolge der Arbeit**
1. Simulation: `quests.js`, Datenformat, Profil-Übernahme, `world.quests`, vorhandene Typen auf `signal()` umstellen, `buy` für Extras/Minen/Techs/Formationen.
2. Simulation: neue Typen in `world.js`/`abilities.js`/`ai.js` (fly, brake, reach, target, attack, shoot, rocket, extra, mine, tech, config, formation, loot, event, dock, sell, equip, repair, dodge, interrupt, combo, level), `onStart`, `world.questMarker`.
3. `input.js` und HUD: `questSignal` für camera, window, hotbar, setting.
4. HUD: Questfenster mit Reitern und Überspringen, `hud-guide.js`.
5. Screens: Hub meldet `hub:*` und `setting`, zeigt die Reihe in PILOTENAKTE → AUFTRAG.
6. Prüfen: `sim/selftest.mjs` spielt die Reihe ohne Grafik durch (Signale künstlich, alle 71 müssen abschließen, Summe der Belohnungen = Tabelle). Danach Test-Pilot `tools/playtest/spielen.mjs` bis Kapitel 5.

**Offene Punkte für Toni**
- Stationsreihe q1–q7 parallel zu SYSTEM? Vorschlag: ja, weil die Fraktions-Story ab der ersten Minute laufen soll. Dann q1–q5 halbieren oder die Stationsreihe erst ab sys51 (erster Sprung) starten, sonst gibt es doppelte Belohnung für dieselben Schritte (siehe Begründung).
- Übersprungene Quests ohne Belohnung (Vorschlag) oder mit halber Belohnung?
- Preis der Pioneer-Drohne (Annahme bis 10.000 Credits). Bis Drohnen kommen, wird sys47 übersprungen und nachgereicht.
- Wracks einsammeln liegt nach deiner Liste in Kapitel 9. Weil jeder Abschuss ab Kapitel 2 ein Wrack hinterlässt, könnte sys36 auch direkt hinter sys10.
- Reparatur nach einem Abschuss lässt sich nicht erzwingen. Die Reihe erklärt sie im Funk (sys45), die Übung ist FIX (sys48). `repair` zählt aber auch die echte Reparatur, falls man vorher abgeschossen wird.
