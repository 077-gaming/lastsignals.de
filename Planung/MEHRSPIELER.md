# Mehrspieler (Testphase, ohne Server-Datenbank)

Stand 02.11.2026. Code: `Code/src/net/mp.js` (Kanäle, Empfang, Koop-Einladung, PvP), `Code/src/net/mp-core.js` (reine Logik, im Selbsttest), `Code/src/ui/hud-mp.js` (Chat, Spielerliste, Namensschilder), Koop: `Code/src/net/coop.js`.

Alles läuft über **Supabase Realtime** (Broadcast + Presence) mit dem öffentlichen Schlüssel aus `coop.js`. Keine Tabellen, keine Edge Functions, keine Richtlinien. Was ein Spieler sendet, ist **nicht vertrauenswürdig**: jeder Empfänger prüft, begrenzt und escaped selbst. Für den Echtbetrieb gehört die Wahrheit (Positionen, Treffer, Ehre) auf einen Server – siehe „Grenzen“.

## Räume

| Kanal | Name | Inhalt |
|---|---|---|
| Sektor | `ls-mp-home-<sektor-id>` (Index 1, z. B. `ls-mp-home-sa-1`) · `ls-mp-front-<index>` (ab Index 2) | Presence + `s`, `bye`, `inv`, `inva`, `hit`, `kill`, `c` |
| Fraktion | `ls-mp-fac-<fraktion>` (`europa`, `saturn`, `eris`) | `c` |
| Alle | `ls-mp-all` | `c` |
| Koop (bestehend) | `ls-coop-<code>` | `snap`, `g`, `hit`, `bye` (siehe `coop.js`) |

- **Heimatsektor (Index 1)** ist je Fraktion getrennt (Station, sichere Zone).
- **Ab Sektor 2 teilen sich alle Fraktionen den Raum** („Front“): Sektor 3 von SATURN, EUROPA und ERIS ist derselbe Kanal. Karten mit gleichem Index haben dieselbe Geometrie (Größe, Tore, Felder; nur Namen und Kulisse unterscheiden sich), Positionen passen also zusammen. Gegner rechnet weiter jeder selbst.
- Koop-Gast einer anderen Fraktion fliegt in den Sektoren des Gastgebers und landet damit im selben Kanal.
- Kanal-Optionen: `broadcast.self = false`, Sektorkanal mit `presence.key = <sid>`.
- Gesendet wird nur, wenn der Kanal `joined` ist (sonst würde realtime-js auf REST ausweichen).

## Kennung

`sid`: 8 Zeichen `a–z0–9`, zufällig je Flug und Tab (`newSid`). Fremde Schiffe heißen in der Welt `rp:<sid>` (`kind: 'player'`, `type: 'remote'`), der Koop-Partner weiter `ally`.

## Presence (Sektorkanal)

`track()` beim Beitritt und bei Änderung (höchstens alle 2 s):

```json
{ "cs": "Rufname", "fac": "saturn", "ship": "s1", "lv": 8, "pvp": 0, "cp": "4821",
  "hm": 6000, "sm": 2800, "lo": { "lasers": ["pulse", "pulse"], "gens": ["sh1", "dr1"] } }
```

`cp` = Koop-Code oder `''`, `hm`/`sm` = Hülle/Schild maximal (für Ziel-Anzeige), `lo` = Laser/Generatoren (Modell). Empfänger prüft alles (`cleanMeta`: Fraktion bekannt, Schiff/Laser/Generator aus `data.js`, Rufname gereinigt ≤ 20 Zeichen). `sync` baut die Liste, `leave` entfernt sofort.

## Nachrichten (Broadcast)

| Ereignis | Kanal | Inhalt | Wer |
|---|---|---|---|
| `s` | Sektor | `{ i: sid, t: zeit/10ms, d: [x, z, rot·100, kurs·100, tempo, hülle%, schild%, flags, ziel] }` | jeder, 9×/s nur bei Änderung, spätestens 1×/s |
| `bye` | Sektor | `{ i }` | beim Sektorwechsel, Tab verlassen, Flugende |
| `inv` | Sektor | `{ i, to, code, cs, fac, sec }` | Einladung „Zu zweit fliegen“ |
| `inva` | Sektor | `{ i, to, code, ok: 0/1, busy? }` | Antwort |
| `hit` | Sektor | `{ i, to, d, s, c, r }` | PvP-Treffer: Schaden, nur Schild (SAB), kritisch, Rakete |
| `kill` | Sektor | `{ i: opfer, by: schütze, lv, cs, bcs }` | Opfer meldet seinen Abschuss |
| `c` | alle drei | `{ i, n, cs, fac, m }` | Chat (`n` = Nachrichtennummer) |

**Zustand `d`** (ganze Zahlen, gerundet): Position in m, Nase und Kurs in 1/100 rad, Tempo in m/s, Hülle und Schild in Prozent, `flags` Bitmaske `1` lebt · `2` feuert · `4` PvP an · `8` in PvP-Zone · `16` angedockt, `ziel` = `sid` eines Spielers, Gegner-ID oder `''`. Bandbreite: ≈ 9 × 90 Byte/s je fliegendem Spieler, im Stand 1 Paket/s.

## Darstellung

- Puffer je Spieler (12 Zustände), Darstellung **130 ms** hinter dem neuesten Stand, linear interpoliert (Winkel über ±180° kurz). Zeitbasis = Sendezeit, Versatz zur eigenen Uhr aus dem kleinsten beobachteten Laufzeitversatz (kriecht langsam nach, gegen Uhrendrift).
- Fehlt Nachschub: Vorhersage entlang der letzten Bewegung **höchstens 250 ms**, dann Stillstand. Ohne Zustand seit 4 s wird das Schiff ausgeblendet.
- Schiff = echtes Fraktionsmodell mit Lasern aus `lo`; Namensschild (Rufname, Stufe, Hüllenbalken), Pfeil auf der Minikarte (Weiß = eigene Fraktion, Blau = andere, Rot = PvP-Ziel), Spielerliste PILOTEN (Taste P).
- Feuert ein fremder Spieler, zeigt die eigene Grafik Laser zu seinem Ziel, wenn das Ziel bei mir existiert (ich, ein anderer fremder Spieler, ein Gegner ≤ 1 km neben ihm). Rein optisch.
- Koop-Partner wird nicht doppelt gezeigt: gleiches `cp` in der Presence oder per Einladung verbunden → nur `ally` aus `coop.js`.

## Chat

- Fenster CHAT (COM·10) im HUD-Fenstersystem, Reiter **SEKTOR / FRAKTION / ALLE**. **Enter** öffnet das Eingabefeld, Enter sendet, Esc schließt, Tab wechselt den Reiter. Solange das Feld den Fokus hat, erreicht keine Taste die Steuerung oder die Schnellleiste.
- Senden: bereinigt (Steuer- und Richtungszeichen raus, Leerraum zusammengefasst), **≤ 200 Zeichen**, Wortfilter, **höchstens 4 Nachrichten je 8 s, 0,7 s Abstand**.
- Empfangen: nochmals bereinigt und gefiltert, Flutschutz je Absender (6 je 8 s), **HTML immer escaped** (`escapeHtml`), stumm geschaltete Rufnamen werden verworfen.
- Stummschalten: in der Spielerliste (STUMM/LAUT) oder per STUMM an der Chatzeile; gespeichert in `localStorage` `ls.mp.mute` (Rufnamen), Aufheben im Bordmenü (SYSTEM · MEHRSPIELER · ALLE LAUT).

## Einladen („Zu zweit fliegen“)

1. A klickt in der Spielerliste ZU ZWEIT FLIEGEN → `inv` mit neuem 4-stelligem Code.
2. B sieht die Einladung (Spielerliste + Funkspruch, 30 s gültig) → ANNEHMEN sendet `inva ok=1` und startet `new Coop(world, bus, { role: 'guest', code })`. Andere Fraktion: B übernimmt die Sektoren des Gastgebers (wie Koop aus dem Hub), Position bleibt.
3. A startet beim Empfang `new Coop(world, bus, { role: 'host', code })`. Ab jetzt der bekannte Koop (Gastgeber rechnet Gegner).
4. KOOP VERLASSEN (Spielerliste) beendet den Koop; `coop.js` sendet `bye`. Ist der Partner länger als 6 s weg, endet ein Einladungs-Koop von selbst.

Koop aus dem Hub (Code-Dialog) läuft unverändert; `main.js` ruft jetzt `world.coop.update()` statt einer festen Variable, damit ein Koop auch im Flug starten kann.

## PvP (Testphase, opt-in)

- Schalter **PVP AN/AUS** im Bordmenü (SYSTEM · MEHRSPIELER) und in der Spielerliste, gespeichert in `localStorage` `ls.mp.pvp`, **Standard aus**.
- Angreifbar ist ein fremder Pilot nur, wenn **beide** PvP an haben, **verschiedene Fraktionen**, **beide in Sektor ≥ 2**, beide **nicht** in der sicheren Zone, nicht angedockt, nicht im Ankunftsschutz (**8 s** nach Sektorwechsel/Start) oder in der Schutzzeit nach Reparatur, und nicht im selben Koop (`canAttack`, `zoneOk`).
- Zielen und Angriff wie bei Gegnern: Klick/Doppelklick, Tab (nächstes Ziel), Strg, Raketen, Drohnen. Strg ohne Ziel wählt weiter nur Gegner (kein versehentlicher PvP-Angriff).
- **Der Schütze meldet, das Opfer entscheidet:** Laser, Raketen und Drohnen rufen bei einem fremden Spieler `mp.hit()` statt der Gegnerlogik auf → `hit`. Das Opfer prüft: Absender bekannt und angreifbar, PvP bei sich an, Abstand ≤ 1.040 m, höchstens 40 Treffer je 2 s, Schaden 1…20.000. Dann `world.pvpDamage()` (Schild/Hülle wie gegen Gegner, SOS schützt).
- Abschuss: Opfer sendet `kill`. Der Schütze bekommt **Ehre** nur, wenn er dieses Opfer in den letzten 20 s selbst getroffen hat: `40 + 12 × Stufe des Opfers`, ×0,35 bei 6–12 Stufen Vorsprung, ×0,1 darüber, ×1,25 gegen deutlich Stärkere. Derselbe Pilot bringt erst nach 5 min wieder Ehre. Alle im Sektor sehen eine Systemzeile im SEKTOR-Chat.

## Verbindungsabbau

- Sektorwechsel: `bye`, `untrack`, Kanal schließen, alle fremden Schiffe entfernen, neuen Kanal öffnen (nacheinander, damit kein Kanal doppelt existiert).
- Tab im Hintergrund: `bye` + `untrack` (die anderen nehmen das Schiff sofort heraus), zurück → `track`. Tab schließen (`pagehide`) und Flugende: alle Kanäle schließen.
- Ohne Zustand seit 4 s wird ein Schiff ausgeblendet, `leave` der Presence entfernt es aus der Liste.

## Grenzen der Testphase

- Kein Server: Positionen, Treffer und Ehre sind clientseitig – wer den Code ändert, kann schummeln (z. B. Ehre durch abgesprochene Abschüsse, wird nur durch die 5-min-Sperre gebremst). Ehre aus PvP deshalb nur für den Test.
- Gegner, Kisten und Erz sind je Spieler getrennt (außer im Koop). Fremde Schüsse auf Gegner sind nur Optik.
- Höchstens 40 fremde Schiffe je Sektor werden angenommen; Realtime-Kontingent des kostenlosen Tarifs beachten.
- Mehrspieler abschalten (Fehlersuche): `?mp=0` in der Adresse.

## Test

- Selbsttest: `cd Code && node src/sim/selftest.mjs` (Abschnitt „MP:“: Kanäle, Paket, Interpolation, Chat, Filter, Rate, PvP-Regeln, Ehre, Weltanbindung).
- Browser: Entwicklungsserver starten, dann `node tools/mehrspieler/test.mjs --url http://localhost:<port> [--bilder <ordner>]` – drei Piloten (Alpha SATURN, Bravo ERIS, Charlie SATURN) in Sektor 3, dazu Koop aus dem Hub-Dialog (Delta/Echo). Testpiloten per Entwicklungs-Link `?dev=game&f=<fraktion>&cs=<Rufname>`.
