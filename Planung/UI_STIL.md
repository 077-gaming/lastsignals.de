# LAST SIGNALS · UI-Stil (verbindlich)

Toni (30.10.2026): Runde Glas-Karten und Pillen wirken wie „Standard-KI“. Das Spiel braucht eine eigene, hochwertige Bildsprache auf dem Niveau großer Weltraumspiele. **Diese Datei ersetzt für LAST SIGNALS die allgemeine 077-Design-Vorgabe** (Ausnahme mit Grund, steht im README).

## Leitidee

**Cockpit-Instrument eines echten Schiffs, gebaut von Ingenieuren.** Präzise, technisch, ruhig, dicht an Information. Nichts Weiches, nichts Verspieltes, keine Web-App-Optik.

## Verboten

- `border-radius` über 2 px, Pillen-Knöpfe, runde Karten, weiche große Schatten, „Liquid Glass“-Blasen
- Emojis, verspielte Icons, Farbverläufe in Bunt, Neon-Glühen um Text
- Generische Web-Muster: zentrierte Karten mit großem Weißraum, große runde Primärknöpfe, Standard-Toggles

## Formen

- **Angeschnittene Ecken** (Chamfer) statt Rundungen: Panels mit `clip-path` an zwei gegenüberliegenden Ecken 10–14 px abgeschrägt (oben links + unten rechts). Kleine Elemente 4–6 px.
- **Linienrahmen**: 1 px Haarlinie (Weiß 16–22 %), dazu **Eckmarken** (L-förmige Winkel 8–10 px, Weiß 70 %) an den nicht angeschnittenen Ecken.
- **Kopfleiste** jedes Panels: links ein Code + Titel in Versalien, z. B. `SYS·02  SCHIFF`, rechts kleine Statusanzeige/Knöpfe; darunter eine Haarlinie, links davon ein 24–40 px langer Akzentstrich in Fraktionsfarbe (2 px).
- **Skalen und Ticks**: Messskalen (Striche alle 10 %), kleine Koordinaten-/Zeit-Readouts als Deko mit echter Funktion (Sektor, Position, Zeit).
- **Hintergrund von Panels**: sehr dunkles Blaugrau, leicht transparent (`rgba(6,9,13,.78)`), optional feines Rauschen/Scanlines (max. 3 % Deckkraft). `backdrop-filter: blur(6px)` nur bei kleinen Panels.

## Schrift (ohne Download, auf dem Mac vorhanden)

- **Anzeige/Labels/Zahlen**: `"DIN Condensed", "DIN Alternate", "Avenir Next Condensed", "Arial Narrow", sans-serif` – Labels VERSALIEN, Sperrung 0.12–0.2em.
- **Große Zahlen**: `"DIN Alternate", "SF Mono", ui-monospace` mit `font-variant-numeric: tabular-nums`.
- **Fließtext**: `-apple-system, "SF Pro Text", sans-serif` 13–14 px, nur wo Sätze nötig sind (Funk, Quest-Text, Beschreibungen).
- **Telemetrie**: `"SF Mono", ui-monospace, Menlo` 10–11 px.

## Farben

| Zweck | Wert |
|---|---|
| Grund | `#04060a` |
| Panel | `rgba(6,9,13,.78)` |
| Linie | `rgba(255,255,255,.16)` / stark `.32` |
| Text | `rgba(255,255,255,.94)` / mittel `.66` / leise `.42` |
| Fraktion | EUROPA `#d8b25a`, SATURN `#e0782a`, ERIS `#9a52ff` (Variable `--fx`) |
| Schild | Fraktionsfarbe |
| Hülle | Weiß |
| Warnung | `#ffb020` (nur echte Warnungen) |
| Gefahr/Feind | `#ff3b30` (nur niedrige Hülle, Feinde, Schaden) |
| Beute/Tritium | `#7dffb0` (Tritium leuchtet grün, so entschieden) |

Farbe hat im Spiel **Funktion** (Freund/Feind, Schild/Hülle, Warnung). Sonst monochrom.

## Bausteine (in `src/ui/theme.css`, für alle Oberflächen)

`.ls-panel` (Chamfer-Panel mit Rahmen + Eckmarken), `.ls-head` (Kopfleiste mit Code, Titel, Akzentstrich), `.ls-btn` (rechteckiger Knopf mit Chamfer, Zustände normal/hover/aktiv/primär/gesperrt), `.ls-key` (Tastenkappe `[E]`), `.ls-bar` (segmentierter Balken, `--v` 0..1), `.ls-label`, `.ls-num`, `.ls-tick` (Messskala), `.ls-scan` (Scanline-Overlay).

## Bewegung

Kurz und technisch: Einblenden als Wischen von links mit kurzem Flackern (120–180 ms), Zahlen zählen hoch statt zu springen, Balken folgen weich (150 ms) mit nachlaufender „Schadens-Spur“. Keine federnden Sprünge. „Bewegung reduzieren“ beachten.

## HUD im Flug (Toni)

Jedes Element ist ein **eigenes Fenster**: per Kopfleiste **frei verschiebbar**, per `[–]` **zuklappbar** (Kopfleiste bleibt), Position und Zustand werden gespeichert, Einrasten an Rändern und anderen Fenstern (8 px), „Layout zurücksetzen“ und „Layout sperren“ im Menü. Fenster: Pilot, Konto, Schiff (Hülle, Schild, Generatoren, Tempo), Ziel, Mission, Funk, Minikarte, Waffenleiste. **Jede Anzeige umschaltbar zwischen „nur Balken“ und „genaue Werte“** (z. B. `1.840 / 2.000`, zählt live), Schalter in der Kopfleiste. Untere Waffenleiste wie ein Instrumentenbrett.

## Prüfmaßstab

Würde ein Art Director eines großen Weltraumspiels das so freigeben? Sieht es auf einem Screenshot nach einem echten, teuren Spiel aus – oder nach einer Web-App? Nur ersteres zählt.
