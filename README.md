# LAST SIGNALS · Website

Offizielle Website des Browser-Weltraum-MMOs LAST SIGNALS (Marke 077). Eine lange Kinoseite: Beim Scrollen fliegt die Kamera in echtem 3D von der stummen Erde hinaus zu Jupiter, Saturn, Neptun, durch den Kuipergürtel bis Eris. Verbindliche Vorgabe: `../Planung/WEBSITE_DESIGN.md`, Bildsprache: `../Planung/UI_STIL.md`.

- Deutsch unter `/` (kanonisch `https://lastsignals.de`), Englisch unter `/en/` (kanonisch `https://lastsignals.online`), mit hreflang.
- Seiten: Startseite (Kapitel 1–7 plus FAQ), News, Wiki (Vorschau aus den Planungsdaten), Ruhmeshalle (leer bis zum Mehrspieler-Server), Impressum, Datenschutz, 404.
- Keine fremden Server für Schriften, Skripte oder Tracker. Ton wird im Browser erzeugt (Web Audio), startet nur per Knopf.

## Starten (Entwicklung)

```bash
cd ~/Desktop/077/90_Weitere_Projekte/Last-Signals/Website
npm install          # einmalig
npm run dev          # http://localhost:5180
```

Port 5173 gehört dem Spiel, die Website nutzt 5180. Ohne automatisches Neuladen (nützlich beim Testen in der Vorschau): `LS_NOHMR=1 npx vite --port 5180 --strictPort`.

## Bauen

```bash
npm run build                      # Ergebnis in dist/, Links für die echten Domains
LS_LOCAL=1 npm run build && npm run preview   # lokal testen auf http://localhost:5181 (Links mit /en/)
```

Der Produktions-Build schreibt die Links für die echten Domains: Deutsch auf `lastsignals.de`, Englisch auf `lastsignals.online` ohne `/en/`, Sprachwechsel und hreflang absolut (`src/site.js`, `href()`). Darum funktionieren die Sprachlinks im normalen Build lokal nicht, dafür `LS_LOCAL=1`.

## Ordner

- `index.html`, `en/…`, `news/`, `wiki/`, `ruhmeshalle/`, `impressum/`, `datenschutz/`, `404.html`: nur Platzhalter. Jede Seite wird beim Bauen aus `src/content/render.js` erzeugt (Text steht sofort im HTML, gut für Suche und schnelles Laden).
- `src/content/text.js` und `src/content/chapters.js`: alle Texte Deutsch und Englisch. `legal.js`: Impressum und Datenschutz (Angaben aus `../Planung/IMPRESSUM.md`).
- `src/content/visuals.js`, `icons.js`, `wordmark.js`: Grafiken der Gründe als SVG, eigene Linien-Symbole, Signal-Schriftzug.
- `src/scene/cosmos.js`: 3D-Hintergrund mit Kamerafahrt (Sonne, Erde, Jupiter mit Europa, Saturn mit Ringen, Uranus, Neptun, Gürtel, Eris mit Gefängnisring, Schwarm). `hangar.js`: 3D-Hangar mit dem echten SATURN-Starter, andere Schiffe als Blaupause. `map.js`: begehbare Systemkarte.
- `src/main.js`: Ablauf der Seite. `src/founder.js`: Gründungspilot-Formular und Teilen-Karte. `src/audio.js`: Ton. `src/api.js`: Anbindung an Supabase.
- `src/links.js`: **Kanäle**. Discord-Einladung hier bei `url` eintragen, dann wird aus „bald“ ein echter Link.
- `src/site.js`: Domains, Seitenliste und Schalter:
  - `status: 'test'` (auf `'live'` stellen, sobald `play.lastsignals.de` läuft; dann wird „Jetzt spielen“ ein Link)
  - Reservierung und Google/Discord stehen nicht mehr hier, sondern kommen aus `VITE_RESERVATION_OPEN` und dem Server (siehe unten).
- `src/styles/`: `theme.css` (Bausteine wie im Spiel), `site.css`, `cinema.css`.
- `public/`: Schiffsmodell `models/saturn-starter.glb` (Kopie aus `../Code/public/models`), Bilder. Standbilder `img/hero-poster*.webp` und `img/og.jpg` erzeugt der Dev-Server: `http://localhost:5180/?poster=wide` (bzw. `tall`, `og`, `icon`) öffnen, die Datei wird nach `public/img` gespeichert.

## Konten und Reservierung (Supabase)

`src/api.js` liest `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus `.env.local` (nicht ins Repo, nur öffentliche Werte). Fehlen sie, zeigt das Formular ehrlich „Reservierung öffnet in Kürze“ und speichert nichts.

Ablauf: Rufname wird live über `callsign_available` geprüft (läuft schon, speichert nichts). E-Mail: Bestätigungsmail (Double-Opt-in), nach dem Klick sichert `claim_callsign` den Namen (Tabelle `pilots`). Google/Discord: Anmeldung beim Anbieter, danach dasselbe. Fehlt `claim_callsign`, schreibt die Seite ersatzweise in die Tabelle `reservations`.

Google/Discord: `src/api.js` liest `GET {VITE_SUPABASE_URL}/auth/v1/settings` (Header `apikey`). Aktiv wird ein Knopf nur, wenn Supabase den Anbieter meldet (`external.google`, `external.discord`) **und** er beim Bauen schon aktiv war (`vite.config.js` fragt dieselbe Adresse und schreibt nur dann den Abschnitt in die Datenschutzerklärung). Alle anderen stehen als „bald“ da, gesperrt und ohne Klick-Aktion. Stand 30.10.2026: beide im Server abgeschaltet. Nach dem Einschalten in Supabase einmal neu bauen bzw. bei Netlify neu veröffentlichen.

### Freigabe der Reservierung (Toni, vor dem Öffnen)

Solange `VITE_RESERVATION_OPEN` nicht `true` ist, prüft das Formular nur, ob ein Rufname frei ist, zeigt „Reservierung öffnet in Kürze“ (kein E-Mail-Feld, kein Absenden) und speichert nichts. Die Datenschutzerklärung beschreibt dann auch nur das. Zum Öffnen der Reihe nach:

1. Supabase > Auth > URL Configuration: Site URL `https://lastsignals.de`, Redirect URLs `https://lastsignals.de/**`, `https://lastsignals.online/**`, `http://localhost:5180/**`.
2. Supabase > Auth > SMTP: eigenen Mailversand eintragen (zum Beispiel über die 077-Domain). Der eingebaute Mailer von Supabase verschickt nur an Team-Adressen.
3. Einen echten Double-Opt-in mit einer fremden Adresse testen (Mail kommt an, Link führt zurück, Rufname steht in `pilots`).
4. Supabase > Legal Documents: Vertrag zur Auftragsverarbeitung (DPA) abschließen.
5. `VITE_RESERVATION_OPEN=true` in `.env.local` und bei Netlify (Environment variables) setzen, neu bauen.
6. Optional Google/Discord: bei Google Cloud bzw. im Discord Developer Portal eine App anlegen, Client-ID und Secret in Supabase > Auth > Providers eintragen (Redirect `https://<projekt>.supabase.co/auth/v1/callback`), danach neu bauen. Knopf und Datenschutz-Abschnitt erscheinen dann automatisch.
7. Netlify-DPA abschließen (die Datenschutzerklärung nennt die Auftragsverarbeitung nach Art. 28 DSGVO neutral, ohne einen abgeschlossenen Vertrag zu behaupten).

## Veröffentlichen (erst nach Tonis Okay)

Netlify-Einstellungen stehen in `netlify.toml` (Build `npm ci && npm run build`, Ordner `dist`, Weiterleitungen für .org, .info, www und die englische Domain, Sicherheits-Kopfzeilen). Schritte, wenn Toni es freigibt: neues Netlify-Projekt aus diesem Ordner, Umgebungsvariablen eintragen, Domains bei Strato auf Netlify zeigen lassen (lastsignals.de, lastsignals.online, lastsignals.org, lastsignals.info). Noch nichts davon ist passiert.

## Abweichung von der 077-Design-Vorgabe

Wie das Spiel nutzt die Website die eigene Bildsprache aus `../Planung/UI_STIL.md` (angeschnittene Ecken, Haarlinien, Eckmarken, schmale technische Schrift, keine runden Karten oder Pillen). Grund: Toni will ein hochwertiges Spiel, runde Glas-Karten wirken wie eine Web-App.

## Rechte

Keine besonderen Rechte. Braucht Node.js (über nvm vorhanden).
