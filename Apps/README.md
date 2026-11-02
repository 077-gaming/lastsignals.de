# Apps – LAST SIGNALS als Testdateien

Das Spiel aus `Code/` verpackt als App, ohne bezahlte Entwicklerkonten und ohne Veröffentlichung:

- **Mac** (`desktop/`): Electron-Hülle, ad-hoc signiert, `.zip` und `.dmg` für Apple Silicon und universal.
  Schema `app://ls/`, Preload mit `window.lsDesktop` (contextIsolation an, nodeIntegration aus), Hochleistungs-GPU,
  Bildratenbegrenzung abschaltbar (Menü, Neustart), Vollbild mit F11 bzw. Ctrl+Cmd+F, Fenstergröße wird gemerkt.
- **iPhone und iPad** (`ios/`): Capacitor 8 über Swift Package Manager, eine Universal-App, Querformat, Vollbild ohne
  Status-Leiste, WebView innerhalb der sicheren Bereiche (`ShellViewController` in `SceneDelegate.swift`).
  Unsignierte `.ipa` für Sideloadly/AltStore.
- **Android** (`android/`): Capacitor 8, Debug-APK (Debug-Schlüssel), Querformat, immersives Vollbild,
  Viewport-Breite des Spiels wird beachtet, Spielbild rückt von der Kamera-Aussparung ab (`MainActivity.java`,
  dafür `SystemBars.insetsHandling: "disable"` in `capacitor.config.json`).

Das Spiel wird mit relativer Basis gebaut (`web.mjs` → `www/`, nicht im Repository), liegt komplett in der App und
startet offline. Koop läuft wie im Browser über Supabase Realtime. In den Hüllen registriert das Spiel keinen Service
Worker und zeigt keinen Installieren-Knopf (`Code/src/core/shell.js`).

- Bauen: `bash Apps/bauen.sh [mac] [ios] [android]` → `~/LAST-SIGNALS-Uebergabe/downloads/`
- Testen: `node tests/mac.mjs`, `node tests/ios.mjs "iPhone 18 Pro"`, `node tests/android.mjs`
- Symbole neu erzeugen: `python3 symbole.py`
- Anleitung für Testerinnen und Tester: [ANLEITUNG.md](ANLEITUNG.md)
