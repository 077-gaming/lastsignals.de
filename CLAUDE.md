# LAST SIGNALS – Hinweise für Claude Code

Öffentliches Repository. Keine Schlüssel, `.env`-Dateien, privaten Links, Vault-Inhalte, Spoiler oder Meshy-Rohdateien committen.

## Aufbau

- `Code/` – das Spiel (Vite + three.js). `src/sim` Simulation, `src/render` Grafik, `src/ui` HUD und Menüs, `src/audio` Ton und Musik, `src/core/data.js` Spielwerte.
- Wurzelordner – die Website (Vite, Seiten aus `src/content/`). Der Netlify-Build baut nur die Website; das Spiel wird vorgebaut aus `public/play/` übernommen. Modelle und Ton liefert `public/models/` bzw. `public/audio/` aus.
- `Planung/` – verbindliche Entscheidungen (Schnittstellen, UI-Stil, Kampf, Fluggefühl, Quests, Website, Mobil).

## Befehle

- Spiel: `cd Code && npm ci && npm run dev` (Port 5173). Abkürzungen: `?dev=hub&f=saturn`, `?dev=game&f=europa`, `?dev=dock&f=eris`.
- Selbsttest: `cd Code && npm test` (vor jedem Build), alles zusammen: `npm run check`
- Spiel für /play/ bauen: `cd Code && npx vite build --base=/play/`, dann `dist/index.html` und `dist/assets/` nach `public/play/`, `dist/fonts/` nach `public/play/fonts/`. `VITE_ALLOWED_CALLSIGNS` nie setzen (Spiel ist öffentlich).
- Website: `npm ci && npm run build` (Port 5180 dev, 5181 Vorschau)
- Test-Pilot: `cd Code && node tools/playtest/spielen.mjs --minuten 2 --fraktion alle` (Dev-Server und Google Chrome nötig)
- Vergleichsansichten: `cd Code && Q=high node tools/bilder/ansichten.mjs <ordner> [basis-url]` (HUD aus, 15 feste Ansichten inkl. Kampf, Cockpit, Hangar, Asteroidenfeld und Sprungtor, Bildzeit/Draw Calls/Dreiecke/Speicher in `bericht.json`; `ONLY=name,name` für eine Auswahl, `HUD=1` mit HUD)
- Schiffe je Klasse (Hangar, Verfolger, nah, Cockpit, Bildzeit in `bericht.json`): `cd Code && Q=high node tools/bilder/schiffe.mjs <ordner> [basis-url]` (`KLASSEN=s1,s8`, `ANSICHT=hangar,nah`); je Klasse fünf Hangar-Nahaufnahmen; Umlauf aller 24 Rümpfe in 4K: `tools/bilder/umlauf.mjs`, Größenstaffelung `tools/bilder/groessen.mjs`, Grafikspeicher `tools/bilder/speicher.mjs`, Cockpit `tools/bilder/cockpit.mjs`; Materialkarten (Bänderungsprüfung), Kennungen, 4K-Stufe und Größen: `Planung/SCHIFFSQUALITAET.md`
- Einbauprüfung der Modelle über die Spiel-Fabrik (mit Lasern/Generatoren an den Ankern): `cd Code && node tools/models/einbau.mjs schiffe <ordner>`
- Textprüfung: `node Code/tools/texte/floskeln.mjs`

## Spielsysteme (Kurzüberblick)

- SYSTEM-Reihe: `src/sim/system-quests.js` (69 Quests, Kapitel 1–18), Karte `src/ui/hud-guide.js`, Stand im Bordmenü (Esc) unter HILFE.
- Tages- und Wochenaufträge: `src/sim/contracts.js` (UTC-Tag, ISO-Woche, fester Zufall je Pilot).
- Sektoren 1–8 je Fraktion: `sectorsFor()` in `data.js`; tiefe Gegner nutzen `look` (Grundform eines vorhandenen Typs), Eigenheiten `brood`, `regen`, `jam`, Bosse mit `boss`/`respawn`.
- Modelle: eigenes Schiff, Laser/Generatoren des Loadouts und Drohnen vor dem Flug; Gegner, Station, Tor, Requisiten und Ausrüstung erst, wenn der Sektor sie braucht (`EXTRA_MODELS`/`_need` in `render/renderer.js`), Meshy-Requisiten mit LOD-Stufe (`-lod1.glb`).
- Kamera: V wechselt Verfolger → Cockpit → Taktisch (`render/camrig.js`); Cockpit ist eine eigene Ebene (`render/cockpit.js`).

## Regeln

- Kein Push auf `main`, kein Pull Request, kein Merge, kein Tag, kein Deploy, keine Netlify- oder Supabase-Änderung ohne Tonis ausdrückliche Freigabe. Ein lokaler `pre-push`-Hook blockiert `main`/`master` und Tags.
- Der Live-Stand wird als Netlify-Upload veröffentlicht, nicht aus GitHub gebaut. Vor jeder Veröffentlichung prüfen, dass der lokale Stand den Live-Stand enthält (Build-Fingerprints der Assets vergleichen).
- UI nach `Planung/UI_STIL.md`: angeschnittene Ecken, keine Rundungen über 2 px, keine Emojis.
