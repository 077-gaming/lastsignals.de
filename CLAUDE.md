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
- Vergleichsansichten: `cd Code && node tools/bilder/ansichten.mjs <ordner>`
- Textprüfung: `node Code/tools/texte/floskeln.mjs`

## Regeln

- Kein Push auf `main`, kein Pull Request, kein Merge, kein Tag, kein Deploy, keine Netlify- oder Supabase-Änderung ohne Tonis ausdrückliche Freigabe. Ein lokaler `pre-push`-Hook blockiert `main`/`master` und Tags.
- Der Live-Stand wird als Netlify-Upload veröffentlicht, nicht aus GitHub gebaut. Vor jeder Veröffentlichung prüfen, dass der lokale Stand den Live-Stand enthält (Build-Fingerprints der Assets vergleichen).
- UI nach `Planung/UI_STIL.md`: angeschnittene Ecken, keine Rundungen über 2 px, keine Emojis.
