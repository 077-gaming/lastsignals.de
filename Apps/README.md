# Apps – LAST SIGNALS als Testdateien

Das Spiel aus `Code/` verpackt als App, ohne bezahlte Entwicklerkonten und ohne Veröffentlichung:

- **Mac** (`desktop/`): Electron-Hülle, ad-hoc signiert, `.zip` und `.dmg` für Apple Silicon und universal.
  Schema `app://ls/`, Preload mit `window.lsDesktop` (contextIsolation an, nodeIntegration aus), Hochleistungs-GPU,
  Bildratenbegrenzung abschaltbar (Menü oder im Spiel GRAFIK → SYSTEM → UNBEGRENZT über `window.lsDesktop.setGraphics`,
  gemerkt in `einstellungen.json` im App-Profil, wirkt nach Neustart), Vollbild mit F11 bzw. Ctrl+Cmd+F, Fenstergröße wird gemerkt.
  Autoplay-Regel `no-user-gesture-required`: Ton startet auch, wenn nur der Controller benutzt wird.
- **Windows** (`desktop/packen-windows.mjs`): dieselbe Electron-Hülle für Windows x64, auf dem Mac gebaut (kein Wine:
  Symbol und Versionsdaten setzt `@electron/packager` per `resedit`). Portable `.zip` (Ordner `LAST SIGNALS` mit
  `LAST SIGNALS.exe`) und Installer `-setup.exe` (NSIS über `makensis`, `desktop/windows-setup.nsi`, nur für den
  aktuellen Benutzer, ohne Admin-Rechte). Unsigniert. `window.lsDesktop.platform === 'windows'`, Menüleiste nur per F10,
  Vollbild mit F11, Alt bleibt fürs Spiel frei.
- **iPhone und iPad** (`ios/`): Capacitor 8 über Swift Package Manager, eine Universal-App, Querformat, Vollbild ohne
  Status-Leiste, WebView innerhalb der sicheren Bereiche (`ShellViewController` in `SceneDelegate.swift`).
  Unsignierte `.ipa` für Sideloadly/AltStore.
- **Android** (`android/`): Capacitor 8, Debug-APK (Debug-Schlüssel), Querformat, immersives Vollbild,
  Viewport-Breite des Spiels wird beachtet, Spielbild rückt von der Kamera-Aussparung ab (`MainActivity.java`,
  dafür `SystemBars.insetsHandling: "disable"` in `capacitor.config.json`).

Das Spiel wird mit relativer Basis gebaut (`web.mjs` → `www/`, nicht im Repository), liegt komplett in der App und
startet offline. Koop läuft wie im Browser über Supabase Realtime. In den Hüllen registriert das Spiel keinen Service
Worker und zeigt keinen Installieren-Knopf (`Code/src/core/shell.js`).

- Version: nur `"version"` in `package.json` (aktuell 0.9.0); `version.mjs` überträgt sie auf iOS (`MARKETING_VERSION`, Build = major·10000 + minor·100 + patch) und Android (`versionName`, `versionCode`), Mac/Windows lesen sie beim Packen.
- Bauen: `bash Apps/bauen.sh [mac] [windows] [ios] [android]` → `~/LAST-SIGNALS-Uebergabe/downloads/`, Dateien `LAST-SIGNALS-<Version>-<Plattform>-<Art>.<Endung>` plus `LAST-SIGNALS-<Version>-SHA256.txt` (SHA-256)
- Testen: `node tests/huelle.mjs` (ungepackte Desktop-Hülle ohne sichtbares Fenster: `window.lsDesktop.setGraphics`, EXTREM, Bildratenschalter; braucht `node web.mjs`), `node tests/mac.mjs` (Fenster unsichtbar; prüft auch Version, Ton ohne Klick und das Grafikmenü; `BELEGE=<ordner>` lenkt die Bildschirmfotos um), `node tests/windows.mjs` (Aufbau der .zip/.exe, läuft auf dem Mac), `node tests/ios.mjs "iPhone 18 Pro"`, `node tests/android.mjs`
- Download-Seite der Website: Dateinamen, Größen und Release-Tag stehen in `src/content/downloads.js`;
  `node Apps/download-groessen.mjs` überträgt nach einem neuen Bau die Dateigrößen dorthin.
- Symbole neu erzeugen: `python3 symbole.py`
- Anleitung für Testerinnen und Tester: [ANLEITUNG.md](ANLEITUNG.md)
