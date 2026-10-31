# LAST SIGNALS

3D-Weltraum-Onlinespiel im Browser, im Geist der klassischen Browser-MMOs (2007–2015), mit eigenen Inhalten. Drei Fraktionen (EUROPA, SATURN, ERIS), Ansicht schräg von oben, Klicksteuerung. Name: LAST SIGNALS (Domains lastsignals.de, .online, .org, .info gehören Toni).

## Stand

Testversion 0.1 für den ersten Test Run: Ladebildschirm, Anmeldung (nur lokal), Fraktionswahl, Mission-Control-Hub, Startsequenz, Sektoren 1–3 der eigenen Heimat mit Raider, Larva, Jackal, Spiker, Vulture, Kampf (L1–L4, SAB, SAL, Raketen), Beute, Crates, Erz, Quests, Station mit Hangar und Shop, Sprungtore, Reparatur nach Abschuss. Einzelspieler, Spielstand im Browser. Grafiken sind einfache Platzhalter; echte 3D-Modelle kommen später als GLB (Prompts dafür im Vault).

## Starten

Doppelklick auf `Code/start.command` (startet den Entwicklungsserver und öffnet den Browser auf http://localhost:5173). Oder im Terminal:

```bash
cd ~/Desktop/077/90_Weitere_Projekte/Last-Signals/Code && npm run dev
```

Beenden: Terminalfenster schließen.

## Steuerung

Linksklick ins All: hinfliegen (gedrückt halten = folgen) · Klick auf Gegner: Ziel, Doppelklick: Ziel und Angriff · Leertaste: Angriff an/aus · 1–4: Munition L1–L4 · 5: SAB · 6: SAL · R: Rakete · J: Springen am Sprungtor · E: Andocken/Abdocken · Tab: nächster Gegner · WASD: direkt steuern · Mausrad: Zoom · Esc: Menü

## Wo was liegt

- `Code/src/core/` – Spieldaten (`data.js`), Ereignis-Bus, Spielstand
- `Code/src/sim/` – Simulation (Welt, KI, Kampf), läuft ohne Grafik und soll später auf den Server
- `Code/src/render/` – 3D-Grafik mit three.js
- `Code/src/ui/` – Screens, HUD, Station
- `Website/` – offizielle Website (Kinoseite, DE/EN, Supabase-Reservierung), eigenes README
- `Planung/SCHNITTSTELLEN.md` – verbindliche Schnittstellen zwischen den Modulen
- Spielplanung: Vault-Notiz „30 Ideen/Weltraum-Browserspiel 3D“, Schiffs-Prompts: „20 Projekte/2026-10-29 - Schiffs-Prompts für ChatGPT“

## Abweichung von der 077-Design-Vorgabe

LAST SIGNALS hat eine eigene Bildsprache (`Planung/UI_STIL.md`, Bausteine in `Code/src/ui/theme.css`): harte, angeschnittene Ecken, Linienrahmen mit Eckmarken, schmale technische Schrift, segmentierte Balken. Grund: Toni (30.10.2026) will ein hochwertiges Spiel; runde Glas-Karten wirken dort wie Standard-Web-Apps. Farbe hat im Spiel Funktion (Fraktion, Schild, Feind, Warnung, Tritium).

## Test-Abkürzungen (nur Entwicklungsserver)

`?dev=hub&f=saturn` (Hub), `?dev=game&f=europa` (direkt im All), `?dev=dock&f=eris` (angedockt). `f` = europa, saturn oder eris.

## Test-Pilot (automatischer Spieltester)

`cd Code && node tools/playtest/spielen.mjs --minuten 2 --fraktion alle` (Optionen: `--fraktion saturn|europa|eris|alle`, `--qualitaet hoch|mittel|auto`, `--ohne-modelle`). Braucht den laufenden Entwicklungsserver (Port 5173) und das installierte Google Chrome (playwright-core, es wird kein Browser heruntergeladen). Öffnet ein sichtbares Chrome-Fenster 1440×900 mit frischem Profil (neuer Pilot, eigene Spielstände bleiben unberührt), spielt als Bot über `window.__ls` (fliegen, Ziele wählen, angreifen, Munition 1–6, Raketen, Beute/Crates, Andocken/Shop, Sprung in Sektor 2, Tod und Reparatur) und prüft danach die Ausrichtung aller Schiffs- und Gegnermodelle (Bug in Flugrichtung, Mündungen vorn, Schweif hinten). Bericht: `Code/tools/playtest/berichte/<zeit>.md` und `.json` mit Bildern im gleichnamigen Ordner.

## Rechte

Keine besonderen Rechte nötig. Braucht Node.js (vorhanden über nvm).
