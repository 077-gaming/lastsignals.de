# LAST SIGNALS · Engine-Schicht (Grafik)

Stand 02.11.2026. Eigene, ausbaubare Schicht über three.js r170 (WebGL2) für Einstellungen, Fähigkeiten und die
Nachbearbeitungskette. Ziel: im Browser gut spielbar mit ordentlicher Grafik, in der Desktop-App (Electron-Hülle,
`window.lsDesktop`) der volle Umfang.

## Aufbau (`Code/src/engine/`)

| Datei | Aufgabe |
|---|---|
| `settings.js` | **Eine Quelle** für alle Grafikwerte: Schlüssel, Werte, Standard je Stufe, Desktop-Kennzeichen, Wirkung. Lesen, säubern, auflösen, ändern. |
| `caps.js` | Fähigkeiten: WebGL2-Erweiterungen, max. Texturgröße, Anisotropie, Zeitmessung, Desktop/Browser/Touch. |
| `pipeline.js` | `PostChain`: Bausteine in fester Stufenfolge, ein-/ausschaltbar, Anzeige der aktiven Kette. |
| `passes/ao.js` | Baustein Umgebungsverdeckung (GTAO). |
| `passes/upscale.js` | Baustein LS-Hochskalierung (FSR-1-Art) und Schärfen. |
| `index.js` | Zusammenbau der Flug-Kette, Szenenziel mit Tiefentextur, Bildratenbegrenzer, Meldung an die Desktop-Hülle. |

Oberfläche: `Code/src/ui/gfx-panel.js` (+ `.css`) – derselbe GRAFIK-Bereich im Hub (EINSTELLUNGEN) und im Bordmenü
(Esc → ANZEIGE), gebaut aus dem Schema.

## Einstellungen

Gespeichert in `localStorage['ls.settings']`:

- `quality` – Stufe `low | medium | high | ultra | extreme` (wie bisher; die automatische Wahl schreibt sie).
  `extreme` nur in der Desktop-App, im Browser wird daraus ULTRA.
- `gfx` – nur **Abweichungen** von der Voreinstellung der Stufe, z. B. `{ "aa": "fxaa", "renderScale": 85 }`.
  Weicht ein Stufen-Schlüssel ab, heißt die Wahl BENUTZERDEFINIERT. Eine Stufe wählen löscht die Stufen-Abweichungen,
  System-Werte (Bildrate, Sichtfeld, Leistungsanzeige) bleiben.

| Schlüssel | Werte | NIEDRIG / MITTEL / HOCH / ULTRA / EXTREM | Wirkung |
|---|---|---|---|
| `renderScale` | 50–200 % | 100 | sofort |
| `upscale` | `off`, `ls` (LS-Hochskalierung, FSR-1-Art) | aus | sofort |
| `sharpen` | 0–100 % | 0 / 0 / 0 / 35 / 40 | sofort |
| `aa` | `off`, `fxaa`, `smaa`, `auto` | aus / FXAA / AUTO / AUTO / SMAA | sofort |
| `aniso` | 1, 2, 4, 8, 16 | 1 / 4 / 8 / 16 / 16 | sofort (geänderte Texturen laden neu hoch) |
| `shadows` | `off`, `low` 1024, `high` 2048, `ultra` 4096 | aus / aus / hoch / hoch / ultra | Neuaufbau |
| `ao` | `off`, `medium`, `high`, `ultra` (VOLL, nur Desktop) | aus / aus / mittel / hoch / voll | sofort |
| `reflections` | `low` 512, `high` 1024, `ultra` 2048 (nur Desktop) | normal … / EXTREM hoch | Neuaufbau |
| `bloom` | 0–150 % | 0 / 100 / 100 / 100 / 100 | sofort |
| `grain`, `vignette`, `chroma` | an/aus | aus / an / an / an / an | sofort |
| `particles` | 35, 60, 100, 130 (Desktop) % | 35 / 60 / 100 / 100 / 130 | sofort |
| `viewDist` | 60, 80, 100, 150, 200 (Desktop) % | 100 / … / 150 | sofort |
| `fpsCap` | 30, 60, 120, 144, 0 = unbegrenzt | unbegrenzt | sofort; Desktop: Neustart der App |
| `fovChase` | 50–80° | 58° | sofort |
| `perfHud` | an/aus | aus | sofort (F3 schaltet weiter vorübergehend) |

AUTO-Kantenglättung: SMAA, solange die Szene unter 1,5-facher Pixeldichte gerechnet wird (dort lief früher FXAA);
auf Retina-Dichte glättet die Dichte selbst und spart ≈ 1,5 ms.

**Wirkung:** `sofort` = über das Ereignis `ls:settings` im nächsten Bild. `Neuaufbau` = Szene wird wie bei einem
Sektorsprung neu aufgebaut (Shader parallel übersetzt, ≈ 1 s, kein Hänger). `Neustart` = nur Desktop-App.

**Automatik:** Die automatische Qualitätswahl (Messung beim Start, Senkung im Flug unter 50 Bildern/s, einmaliges
Anheben) bleibt für den Browser. Eigene Werte (BENUTZERDEFINIERT) und EXTREM gelten als eigene Wahl und werden nicht
überschrieben. „AUTOMATISCH WÄHLEN“ im GRAFIK-Bereich kehrt zur Automatik zurück. In der Desktop-App senkt die
Absicherung die Stufe nicht. Touch-Geräte starten mit MITTEL (wie bisher höchstens MITTEL über die Automatik).

**Bildratenbegrenzung:** Browser lässt Bilder des Bildschirmtakts aus (fester Takt, Toleranz 2 ms). Adaptive
Auflösung und Absicherung rechnen mit dem Ziel (`renderer.fpsFloor()`), damit ein 30er-Begrenzer keine Senkung auslöst.

## Nachbearbeitungskette

```
render → ao → cockpit → bloom → look → aa → upscale
Szene → Umgebungsverdeckung → Cockpit-Ebene → Nachleuchten → Kamera-Look (Tonwerte, FXAA) → SMAA → Hochskalierung/Schärfen
```

- Bausteine schalten sich aus den Werten (`active(state)`); three.js gibt dem letzten aktiven Durchgang das Bild.
- NIEDRIG ohne Effekte zeichnet wie bisher direkt (keine Kette). Die letzte Stufe der adaptiven Auflösung
  (`lowQuality`) zeichnet ebenfalls direkt.
- Die Leistungsanzeige (F3) zeigt die aktive Kette (`KETTE  SZENE › AO › BLOOM › LOOK › SMAA`), Szenen- und
  Ausgabegröße, Bildzeit, GPU-Zeit.

### Pixeldichten

Szene (intern) = Stufendichte × adaptive Auflösung × `renderScale`. Ausgabe (Leinwand) = Stufendichte, wenn die
LS-Hochskalierung hochrechnet; bei Supersampling (über 100 %) höchstens die Bildschirmdichte; sonst wie die Szene
(der Browser streckt, wie bisher). Partikel und Sterne rechnen mit der Szenendichte.

### Baustein Umgebungsverdeckung (`passes/ao.js`)

GTAO-Shader aus `three/examples/jsm/shaders/GTAOShader.js`, aber ohne zweite Szenen-Zeichnung: Normalen aus der
Tiefe, Tiefe aus dem Szenenziel (beide Composer-Ziele bekommen eigene `DepthTexture` – eine geklonte Textur teilt in
three.js die GL-Textur, das gäbe eine Rückkopplung). Halbe Auflösung (MITTEL 8, HOCH 16 Proben), 5 × 5 tiefengewichtet
entrauscht, tiefengerecht hochgerechnet, Radius MITTEL 40 m / HOCH und VOLL 60 m und mit der Entfernung wachsend (6 bzw.
8 % des Abstands), Kontrastkurve pow 2,5 / 3 (Werte je Stufe in `LEVELS`, siehe „Prüfung“ unten), Leuchtendes
(HDR > 1) bleibt hell, ausgeblendet ab 2–3 km. Ohne Cockpit-Ebene rechnet der Kamera-Look die Verdeckung beim Lesen ein
(`USE_AO` in `post.js`), mit Cockpit ein eigener Durchgang vor der Cockpit-Ebene. Abstimmen: `?aoview=1&aor=60&aot=60` (hält Radius/Dicke für alle Stufen fest).

### Baustein LS-Hochskalierung (FSR-1-Art) (`passes/upscale.js`)

Eigene Umsetzung des veröffentlichten räumlichen Verfahrens von AMD FidelityFX Super Resolution 1 (MIT): EASU-artiges
kantenrichtiges Hochrechnen (12 Proben, Lanczos-2-artiger Kern entlang der Kante, auf Min/Max der Nachbarn begrenzt) und
RCAS-artiges Schärfen (5 Proben, begrenzt gegen Überschwingen). Kein DLSS, kein AMD-Code. Läuft auf dem fertigen
sRGB-Bild nach der Kantenglättung. Ohne Hochrechnen nur Schärfen (ein Durchgang).

## Fähigkeiten und Grenzen

- **Kein MSAA** auf dem HalfFloat-Szenenziel: Auf Apple M5 (Chrome, ANGLE/Metal) zeichnet `samples: 4` bei
  Pixeldichte 1 große Kacheln schwarz – erneut nachgewiesen 02.11.2026
  (`LAST-SIGNALS-Uebergabe/bilder/engine-msaa-schwarz-nachweis.png`). Kantenglättung über FXAA oder SMAA.
- **Kein WebGPU-Pfad:** Die eigenen Shader (`onBeforeCompile`, `RawShaderMaterial`) laufen nicht im WebGPURenderer
  von r170. Eine spätere Umstellung wäre ein eigener Baustein-Satz (TSL), nicht vorgetäuscht.
- **Kein DLSS** im Browser. Die Hochskalierung heißt ehrlich „LS-Hochskalierung (FSR-1-Art)“.

## Schnittstelle Desktop-Hülle

Die Engine erkennt die Desktop-App an `window.lsDesktop` (im Entwicklungsserver vortäuschbar: `?desktop=1`).
Optional ruft sie bei jeder Grafikänderung `window.lsDesktop.setGraphics({ fpsCap, renderScale })` auf. Die Hülle kann
damit z. B. beim nächsten Start `--disable-frame-rate-limit` / `--disable-gpu-vsync` setzen (UNBEGRENZT braucht einen
Neustart; die Oberfläche zeigt „NEUSTART (APP)“). Desktop-only: Stufe EXTREM, AO VOLL, Spiegelung ULTRA,
Partikel 130 %, Sichtweite 200 %.

## Erweitern

1. Schlüssel in `settings.js` (`SCHEMA`) ergänzen: Gruppe, Beschriftung, Beschreibung, Werte, `def` je Stufe,
   `preset`, `apply`, ggf. `{ desktop: true }` je Option. Die Oberfläche erscheint automatisch.
2. Neuer Nachbearbeitungs-Effekt: Durchgang (three `Pass`) in `passes/`, in `buildFlightChain` mit `chain.add({ id,
   stage, label, pass, active, apply })` einhängen. Neue Stufe? In `STAGES` (`pipeline.js`) an der richtigen Stelle.
3. Renderer-Werte (ohne Durchgang): in `Renderer._applyQuality()` aus `this.gfx.v` anwenden; Neuaufbau nötig →
   in `_syncGfx()` zur `rebuild`-Bedingung.

## Messen

- `Code/tools/bilder/ansichten.mjs`: `Q=high DPR=2 FEST=1 ONLY=… node tools/bilder/ansichten.mjs <ordner> <url> '' 1440x900`
  (Retina-Dichte, Auflösung festgehalten). Einzelwerte vergleichen: viertes Argument `&gfx=ao:off,aa:fxaa`.
- Ergebnisse dieses Umbaus: siehe Abschnitt „Messung 02.11.2026“.

## Messung 02.11.2026 (Apple M5, Chrome, Entwicklungsserver)

Achtung: Der Rechner war während der Messungen mit anderen Sitzungen geteilt – Einzelwerte der GPU-Zeit streuen um
± 3 ms. Verglichen wurde deshalb abwechselnd (vorher, nachher, vorher, …) und mit Median.

| Messung | vorher | nachher |
|---|---|---|
| HOCH, 1440 × 900 Retina, Auflösung fest 100 % (Pixeldichte 1,75), Flug/Kampf/Nahansicht, Median aus 12 | 7,2 ms | 8,3 ms (AO MITTEL) |
| Test-Pilot HOCH Saturn 1 min, Kampf (adaptive Auflösung aktiv) | 6,6–7,6 ms (Berichte 30.10.) | 6,0 ms, p95 8,8 |
| Test-Pilot: erster Kampf, Bilder über 25 ms | – | 0 |
| Prozessorzeit je Bild, HOCH 960 × 600 (je 2 Läufe) | 3,5 / 4,2 ms | 4,0 / 4,4 ms |

HOCH hält das Ziel „Kampf unter 8 ms“ wie bisher über die adaptive Auflösung (GPU-Grenze 7,6 ms, Untergrenze 86 %);
bei fest 100 % Retina-Auflösung liegt HOCH jetzt ≈ 1 ms höher (Umgebungsverdeckung). Einzeln gemessen und verworfen:
LS-Hochskalierung als Standard (85 % Szene + Hochrechnen auf Retina ≈ 11 ms, teurer als volle Auflösung – bleibt Wahl),
SMAA und Schärfen auf Retina-Dichte (je ≈ 1–1,5 ms, kaum sichtbar → AUTO bzw. erst ab ULTRA).

Sichtbar besser in den festen Ansichten (A/B im selben eingefrorenen Bild, `bilder/engine-*`): Umgebungsverdeckung
(Fugen, Unterseiten der Stationsmodule, Triebwerksgondeln), SMAA statt FXAA bei Pixeldichte 1 (Kanten und
Rumpftexturen schärfer, Cockpit-Anzeigen lesbarer), Schärfen, 16× anisotrope Filterung (Stationsplatten unter
flachem Winkel), LS-Hochskalierung gegenüber gestreckter Leinwand bei 65 %. Kein sichtbarer Unterschied: Schatten
4096 statt 2048 und Spiegelung 1024 statt 512 → nur noch in EXTREM (Desktop), wählbar bleiben sie.

## Prüfung 02.11.2026 (unabhängige Prüfung, nach dem Umbau)

Behoben:
- EXTREM fiel beim Start auf ULTRA zurück: `isAutoQuality()` (perf/quality.js) kannte den Namen nicht und hielt die
  Wahl für automatisch. Jetzt gelten EXTREM und eigene Werte vor der Namensprüfung als eigene Wahl (mit `?desktop=1`
  geprüft: Stufe bleibt nach Start und Neuladen, Schatten 4096, AO VOLL).
- Schwarzes Bild nach einem Auflösungswechsel: Eine neue Leinwandgröße leert die Leinwand. Angedockt zeichnet der
  Renderer nur jedes 4./32. Bild, die Leinwand blieb dann bis 0,5 s schwarz (Sonde: 13 von 14 Wechseln). Jetzt wird
  nach jeder Größenänderung im selben Bild gezeichnet (`_mustDraw`), beim stehenden Bild des Sektorsprungs regelt die
  adaptive Auflösung nicht.
- Umgebungsverdeckung kaum sichtbar: Radius 10 m / pow 2 ergab im eingefrorenen Bild eine mittlere Abweichung von
  0,5 von 255. Mit Radius 40–60 m, pow 2,5–3 und Dicke = Radius dunkeln Fugen unter Decks, Triebwerksgondeln und
  Kontaktstellen sichtbar ab (Abweichung vorher/nachher 1,0–1,6 statt 0,5), ohne Säume um Vordergrundteile.
  Mehrkosten des größeren Radius ≈ 0,3 ms (HOCH, Retina, Schiff nah, Minimum aus 6 abwechselnden Läufen).
- Schärfen ULTRA 20 → 35 %, EXTREM 30 → 40 % (gleicher Durchgang, gleiche Kosten; 20 % war neben SMAA kaum zu sehen).
- Bordmenü: Reiter „VOREINSTELLUNG“ war abgeschnitten → im schmalen Menü „STUFE“. F3 wird nicht mehr bei jeder
  anderen Grafikänderung auf die gespeicherte Leistungsanzeige zurückgesetzt.

GPU-Zeit (abwechselnd gemessen, Minimum / Median, Rechner mit anderen Sitzungen geteilt):

| Ansicht | vorher (FXAA, ohne AO, ohne Schärfen) | nachher |
|---|---|---|
| HOCH 1440 × 900 Retina fest 100 %, Flug Saturn | 6,97 / 8,46 ms | 7,56 / 8,56 ms |
| HOCH 1440 × 900 Retina fest 100 %, Flug Europa | 6,48 / 7,33 ms | 6,15 / 8,63 ms |
| HOCH 960 × 600 Dichte 1, Schiff nah (AO MITTEL, SMAA) | 3,22 / 4,37 ms | 4,03 / 4,88 ms |
| ULTRA 960 × 600 Dichte 1, Schiff nah (AO HOCH, SMAA, Schärfen) | 2,58 / 3,48 ms | 4,74 / 6,61 ms |
| ULTRA 1440 × 900 Retina, Schiff nah: AO aus / alter Radius 10 m / neu 60 m | 9,71 / 9,79 ms | 9,89 / 11,65 · 10,31 / 10,75 ms |

Die Einzelwerte liegen zweigipflig (≈ 7 oder ≈ 12 ms je nach Last der anderen Sitzungen); maßgeblich ist der Abstand
im selben Lauf. HOCH hält im Flug das 8-ms-Ziel über die adaptive Auflösung (GPU-Grenze 7,6 ms).
Vergleichsbögen (ausgeschnitten, 2-fach, eingefroren): `bilder/engine-pruefung-high.jpg`, `bilder/engine-pruefung-ultra.jpg`.

