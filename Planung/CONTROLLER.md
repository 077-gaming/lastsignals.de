# Controller (Gamepad) · Stand 02.11.2026

LAST SIGNALS lässt sich vollständig mit einem Controller spielen: Titel, Rufname, Fraktionswahl, Mission Control (alle Bereiche, Shop, Hangar, Einstellungen), Flug und Kampf in allen drei Kameras, Station, Bordmenü und Dialoge. Maus, Tastatur und Touch bleiben unverändert und lassen sich jederzeit abwechselnd benutzen.

## Unterstützung

- **Gamepad-API mit Standard-Mapping** (`navigator.getGamepads()`, `mapping: 'standard'`): Xbox (One, Series, 360), PlayStation (DualShock 4, DualSense), Nintendo Switch Pro, MFi-Controller.
- **Wo:** Chrome, Edge, Firefox, Safari (macOS, iPadOS, iOS), die Mac-/PC-App (Electron, gleiche Chromium-Gamepad-API, nichts Zusätzliches nötig), iOS-WKWebView und Android-WebView der Apps.
- **Mehrere Controller:** Der zuletzt benutzte bleibt aktiv. Ist er 2,5 s still und an einem anderen bewegt sich etwas, übernimmt der andere („erster aktiver gewinnt“).
- **An- und Abstecken** jederzeit ohne Neuladen (`gamepadconnected` / `gamepaddisconnected` plus Abfrage je Bild).
- **Bauart** aus der Kennung: `Sony`, `DualSense`, `DualShock`, `054c` → PlayStation-Symbole; `Nintendo`, `057e`, `Pro Controller` → Switch-Beschriftung; sonst Xbox.

Browser geben Controller-Daten erst frei, nachdem auf der Seite einmal eine Controller-Taste gedrückt wurde (Datenschutzregel der Gamepad-API). Das erste Drücken schaltet daher nur den Controller-Modus ein (bzw. überspringt den Vorspann).

## Aufbau (Code)

| Datei | Aufgabe |
|---|---|
| `Code/src/input/gamepad.js` | Abfrage je Bild (eigene `requestAnimationFrame`-Schleife, nur solange ein Controller verbunden ist), runde Totzone, Achsen-Kurve (Exponent 1,6), Trigger stufenlos, Tastenflanken (`pressed`/`released`/`heldFor`), aktiver Controller, Eingabeart, Vibration, Einstellungen (`ls.pad`) |
| `Code/src/input/padflight.js` | Belegung im Flug; ruft die Befehle in `input.js` (dieselben Wege wie Tastatur und Touch) |
| `Code/src/input/padnav.js` | Menü-Navigation ohne Maus, Fokusrahmen, Hinweis bei Textfeldern |
| `Code/src/input/padglyph.js` | Controller-Symbole je Bauart, Tausch der Tastenkappen (`.ls-key`) |
| `Code/src/input/pad.css` | Fokusrahmen, Hinweis, Schnellleisten-Auswahl, Touch-Knöpfe ausblenden, Belegungsübersicht |
| `Code/src/ui/pad-map.js` | Belegung als Grafik (SVG) und Tabelle für Einstellungen, Steuerung und Bordmenü |
| `Code/tools/playtest/controller.mjs` | Prüfung mit Controller-Attrappe (siehe unten) |

Je Bild gibt es genau einen Besitzer des Controllers: die **Flugsteuerung**, solange im Flug keine Ebene offen ist, sonst die **Menü-Navigation**. Ebenen sind Dialoge (`[role="dialog"]`: Bordmenü, Station, Fernhandel, Abschuss, Schnellkauf-Rückfrage, Koop, App-Hinweis und jeder künftige Dialog wie das Konto), die Einführungswahl beim ersten Flug und das offene Arsenal. Damit wird jeder Tastendruck genau einmal ausgewertet.

**Eingabeart:** Sobald am Controller etwas passiert, gilt `html[data-input="pad"]` (dazu `data-pad="xbox|ps|nin"`) und das Ereignis `ls:inputmode`. Echte Tastatur-, Maus- (mehr als 12 px Bewegung) oder Touch-Eingabe schaltet zurück auf `kb`. Nachgestellte Tasten (z. B. Esc für das Bordmenü) sind nicht „vertrauenswürdig“ und schalten nicht um.

## Belegung im Flug (Verfolger, Cockpit, Taktisch)

| Controller (Xbox · PlayStation) | Wirkung | Tastatur-Gegenstück |
|---|---|---|
| Linker Stick | Lenken wie die Maus: Ausschlag links/rechts entspricht der Mausposition auf der Bildbreite, gleiche Kurve (`renderer.steerHeading`), gleiche Wendigkeit. Ohne Schub: auf der Stelle wenden | Maus, A/D |
| Linker Stick (taktisch) | Bildbezogen fliegen (oben = Bild oben), Ausschlag = Tempo | WASD |
| RT · R2 | Schub stufenlos (halber Trigger ≈ halbes Höchsttempo) | W |
| LT · L2 | Bremsen | S |
| L3 | Dauerschub an/aus (bleibt an wie W; LT oder B beendet) | W |
| Rechter Stick | Verfolger: Kamera um das Schiff schwenken, federt beim Loslassen zurück. Cockpit: umsehen (`lookBy`). Taktisch: Zoom | Mittlere Maustaste, Mausrad |
| R3 | Kamera wechseln Verfolger → Cockpit → Taktisch | V |
| A · × | Angriff an/aus (ohne Ziel: nächster Gegner) | Strg |
| X · □ | Rakete | Leertaste, R |
| Y · △ | Kontext: in der sicheren Zone andocken, am Tor springen, sonst nächste Beute (Wrack, Kiste, Erz bis 1,5 km) anfliegen | E, J |
| Y halten (0,55 s) | Autopilot zur Station | H |
| B · ○ | Abbrechen: Angriff aus → Ziel lösen → Kurs, Autopilot und Dauerschub beenden | – |
| RB · R1 (kurz) | Nächstes Ziel (nach Entfernung) | Tab |
| LB · L1 | Voriges Ziel | – |
| Steuerkreuz ◂ ▸ | Schnellleiste: Platz wählen (Rahmen in Fraktionsfarbe, nur im Controller-Modus sichtbar) | – |
| Steuerkreuz ▴ ▾ | Schnellleiste: Leiste wechseln | Alt+1–5 |
| **RB halten + A** | Gewählten Platz auslösen | 1–0 |
| MENU · OPTIONS | Bordmenü | Esc |
| VIEW · CREATE | Karte (NAV·07) ein/aus | Shift+Zahl |

**Entscheidung Schnellleiste:** Alle Tasten sind im Flug belegt, deshalb löst eine Kombination den gewählten Platz aus. RB + A, weil RB ohnehin „Zielwahl“ ist und A „Angriff“: RB wirkt erst beim Loslassen (kurz gedrückt, ohne A) als Zielwechsel, mit A dazwischen nur als Auslöser. Das Ziel bleibt dabei unverändert.

**Schub stufenlos:** Die Simulation bleibt unverändert. Der Trigger setzt den Zielpunkt so weit voraus, dass das Flugmodell genau den gewünschten Anteil des Höchsttempos anstrebt (`input.throttleDist`).

**Nachbrenner:** Das Spiel hat keinen eigenen Nachbrenner (die Düse leuchtet bei vollem Schub auf). L3 ist deshalb Dauerschub wie W.

## Menüs ohne Maus

- **Steuerkreuz oder linker Stick** bewegt den Fokus räumlich zum nächsten Element in dieser Richtung. Zuerst innerhalb derselben Liste bzw. Rollfläche, dann im „Strahl“ (überlappend), sonst gewichtet. Halten wiederholt (erst nach 0,34 s, dann alle 0,11 s). Verdeckte Elemente zählen nicht, weggerollte werden ins Bild gerollt.
- **A** bestätigt (Klick). **B** zurück: Abbrechen-Knopf des Dialogs, sonst Esc (Hub: eine Ebene zurück, Bordmenü schließen, Station abdocken, Fernhandel schließen).
- **LB/RB** wechseln Reiter (Bordmenü, Station, Shop, Arsenal). **LT/RT** wechseln die Bereiche in Mission Control. **Rechter Stick** blättert. **MENU** hebt in Mission Control ab, sonst wie Esc.
- **Fokusrahmen** im UI-Stil: eigene Ebene über allem, Haarlinie in Fraktionsfarbe, angeschnittene Ecken oben links und unten rechts, Eckmarken an den beiden anderen Ecken. Geht der Fokus verloren (Knopf nach Kauf gesperrt, Liste neu gezeichnet), springt er zum nächstgelegenen Element.
- **Vorspann, Startsequenz:** A überspringt („beliebige Taste“).
- **Texteingabe (Rufname, Koop-Code):** Unter dem Feld erscheint ein Hinweis (Desktop: „Über die Tastatur eingeben“, Touch: „Feld antippen: Bildschirmtastatur“ – eine Bildschirmtastatur lässt sich ohne Antippen nicht öffnen). A schickt das Formular ab, wenn etwas eingetragen ist; der zuletzt benutzte Rufname steht bereits im Feld.

## Tastenhinweise

Im Controller-Modus zeigen HUD (Andocken, Springen, Ziel, Menü), Station, Schnellkauf-Rückfrage und Bildschirme Controller-Symbole statt Tasten. Die SYSTEM-Einführung (`hud-guide.js`, Tastenschild `q.key` und Zieltexte) und der Flug-Coach haben eigene Controller-Texte. Bei Maus/Tastatur wird sofort zurückgetauscht. Steuerungsübersichten, die bewusst die Tastatur zeigen, bleiben unverändert.

Symbole als Text-Glyphen ohne Emojis: Xbox `A B X Y LB RB LT RT VIEW MENU`, PlayStation `× ○ □ △ L1 R1 L2 R2 CREATE OPTIONS`, Switch `B A Y X L R ZL ZR − +` (Standard-Mapping: Index 0 ist immer die untere Taste), Steuerkreuz `▴ ▾ ◂ ▸ ╋`. Alle Zeichen liegen außerhalb der Emoji- und Dingbat-Bereiche (deshalb × statt des Dingbat-Kreuzes U+2715), die Textprüfung `floskeln.mjs` bleibt sauber.

## Einstellungen

Mission Control → EINSTELLUNGEN → **CONTROLLER** (gespeichert in `localStorage` `ls.pad`, eigener Schlüssel, weil der Hub `ls.settings` nur mit seinen eigenen Werten neu schreibt):

- **Empfindlichkeit** 0,7 / 1 / 1,3 / 1,6 (Lenken und Umsehen)
- **Y-Achse umkehren** (rechter Stick)
- **Totzone** 8 / 15 / 22 / 30 % (höher bei driftenden Sticks)
- **Vibration** an/aus (beim Einschalten eine kurze Probe)
- **Belegungsübersicht** als Grafik und Tabelle; Status „VERBUNDEN · XBOX/PLAYSTATION/SWITCH“

Dieselbe Übersicht: Mission Control → STEUERUNG → CONTROLLER und Bordmenü → Reiter STEUERUNG (im Controller-Modus oben).

## Vibration

`vibrationActuator.playEffect('dual-rumble')` (Firefox: `hapticActuators[0].pulse`), abschaltbar:

- Treffer am eigenen Schiff: stärker bei Hüllentreffern und kritischen Treffern
- Explosionen bis 900 m: Stärke nach Größe und Entfernung
- eigener Raketenstart: kurz und leicht
- Abschuss des eigenen Schiffs: lang

Schwächere Stöße während eines laufenden stärkeren werden ausgelassen. Ohne Vibrationsmotor (oder ohne Unterstützung im Browser, z. B. Safari bei manchen Controllern) passiert nichts.

## Touch-Geräte mit Controller

Joystick und Knöpfe von `hud-touch.js` sind ausgeblendet, solange der Controller benutzt wird (CSS über `html[data-input="pad"]`). Die Zielanzeige bleibt. Ein Antippen des Bildschirms schaltet zurück und zeigt die Knöpfe wieder.

## Grenzen

- **Ton:** Browser werten Controller-Tasten nicht als Nutzergeste, die Musik startet daher erst nach dem ersten Klick oder Tastendruck (Warnung „AudioContext was not allowed to start“). In der Electron-App lässt sich das über die Autoplay-Regel des Fensters lösen.
- **Electron/PC-App:** Chromium liefert Controller-Daten nur an das Fenster im Vordergrund.
- **Ohne Standard-Mapping** (seltene Controller, alte Treiber) wird dieselbe Tastenreihenfolge angenommen; Trigger als Achsen werden dann nicht ausgewertet.
- Fenster im HUD verschieben und Arsenal per Ziehen belegen bleibt Maus/Touch vorbehalten (Arsenal: A legt in den nächsten freien Platz).

## Prüfen ohne Controller

`cd Code && node tools/playtest/controller.mjs --url http://localhost:5196 [--stil xbox|ps] [--sichtbar]` (Dev-Server nötig). Ersetzt `navigator.getGamepads` per `addInitScript` durch eine steuerbare Attrappe (Standard-Mapping, Tasten und Achsen je Prüfschritt, `vibrationActuator` zeichnet Effekte auf) und löst `gamepadconnected` aus. Geprüft werden 70 Punkte: Titel bis Flug ohne Maus, Hub-Bereiche, Einstellungen, Shop, Schub stufenlos, Lenken, Bremsen, Kamera (Verfolger schwenken und zurückfedern, Cockpit umsehen, Taktisch bildbezogen), Ziele vor/zurück, Angriff, Rakete, Vibration, Schnellleiste, Karte, Bordmenü, Andocken, Station (Reiter, Kaufen, Fokus danach), Abdocken, Sprung, Beute, Autopilot, Tastatur weiter nutzbar, An-/Abstecken und Touch-Knöpfe. Ergebnis und Bilder unter `tools/playtest/berichte/controller-<zeit>/`.
