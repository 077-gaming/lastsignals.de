# LAST SIGNALS als App testen

Diese Dateien sind **Testversionen** für dich und dein Team. Sie sind nicht im App Store, nicht bei Google Play und nicht von Apple geprüft. Deshalb musst du beim ersten Öffnen jeweils einmal bestätigen, dass du der Datei vertraust.

Das Spiel selbst steckt komplett in der App und startet auch ohne Internet. Koop („Mit Freund fliegen“) braucht Internet, genau wie im Browser. Spielstände in der App sind getrennt von denen im Browser (eigener Speicher je App).

## Welche Datei für welches Gerät?

| Datei | Gerät |
|---|---|
| `LAST-SIGNALS-0.9.0-mac-arm64.dmg` oder `.zip` | Mac mit Apple-Chip (M1 bis M5) |
| `LAST-SIGNALS-0.9.0-mac-universal.dmg` oder `.zip` | jeder Mac (Apple-Chip und ältere Intel-Macs), etwas größer |
| `LAST-SIGNALS-0.9.0-windows-x64-setup.exe` | Windows 10 oder 11 (64 Bit), Installer mit Startmenü- und Desktop-Verknüpfung |
| `LAST-SIGNALS-0.9.0-windows-x64.zip` | Windows 10 oder 11 (64 Bit), ohne Installation: entpacken und starten |
| `LAST-SIGNALS-0.9.0-ios-unsigniert.ipa` | iPhone und iPad (eine App für beide), über Sideloadly oder AltStore |
| `LAST-SIGNALS-0.9.0-ios-simulator.zip` | nur für den iOS-Simulator in Xcode, nicht für echte Geräte |
| `LAST-SIGNALS-0.9.0-android-debug.apk` | Android-Handy oder -Tablet (Android 7 oder neuer) |
| `LAST-SIGNALS-0.9.0-SHA256.txt` | Prüfsummen (SHA-256) aller Dateien, siehe unten |
| `belege/` | Bildschirmfotos aus den automatischen Tests |

---

## Dateien prüfen (Prüfsummen)

Die Zahl im Dateinamen ist die Versionsnummer (hier 0.9.0). Zu jeder Version gibt es eine Datei `LAST-SIGNALS-<Version>-SHA256.txt`. Ob eine heruntergeladene Datei unverändert ist, prüfst du so:

- Mac: im Ordner mit den Dateien `shasum -a 256 -c LAST-SIGNALS-0.9.0-SHA256.txt` (nur vorhandene Dateien prüfen: `--ignore-missing`).
- Windows (PowerShell): `Get-FileHash .\LAST-SIGNALS-0.9.0-windows-x64-setup.exe -Algorithm SHA256` und den Wert mit der Zeile in der Textdatei vergleichen.

---

## Mac

1. `.dmg` doppelklicken. Im Fenster **LAST SIGNALS** auf **Programme** ziehen. (Oder die `.zip` doppelklicken und **LAST SIGNALS** in den Ordner **Programme** ziehen.)
2. Beim ersten Start meldet macOS, dass die App von einem nicht verifizierten Entwickler stammt. So öffnest du sie trotzdem:
   - Im Finder unter **Programme** mit **Rechtsklick** (oder Ctrl-Klick) auf **LAST SIGNALS** → **Öffnen** → im Hinweis noch einmal **Öffnen**.
   - Klappt das nicht (neuere macOS-Versionen): **Systemeinstellungen → Datenschutz & Sicherheit**, ganz unten bei „LAST SIGNALS wurde blockiert“ auf **Trotzdem öffnen** klicken.
   - Meldet macOS „ist beschädigt und kann nicht geöffnet werden“: Terminal öffnen und eingeben
     `xattr -cr "/Applications/LAST SIGNALS.app"`
     Danach startet die App normal. (Das entfernt nur die Download-Markierung.)
3. Danach startet LAST SIGNALS mit einem Doppelklick wie jede andere App.

Tipps:

- **Vollbild**: `F11` oder `Ctrl + Cmd + F` (auch im Menü **Darstellung → Vollbild**).
- Fenstergröße und Position merkt sich die App.
- Menü **LAST SIGNALS → Bildratenbegrenzung aus (Neustart nötig)**: Das Spiel rechnet so viele Bilder wie möglich statt im Takt des Bildschirms. Nur zum Messen gedacht, der Mac wird dabei wärmer. Nach dem Haken fragt die App, ob sie neu starten soll.
- Spielstände liegen in `~/Library/Application Support/LAST SIGNALS`.

## Windows

Die Windows-Version ist **nicht signiert**. Windows SmartScreen kennt die Datei deshalb noch nicht und warnt beim ersten Start. Das ist bei unsignierten Testversionen normal.

### Weg A: Installer (`LAST-SIGNALS-0.9.0-windows-x64-setup.exe`)

1. Datei doppelklicken.
2. Erscheint **„Der Computer wurde durch Windows geschützt“**: auf **Weitere Informationen** klicken, dann auf **Trotzdem ausführen**.
3. Der Installer braucht keine Administratorrechte. Er installiert nach `%LOCALAPPDATA%\Programs\LAST SIGNALS` und legt eine Verknüpfung im Startmenü und auf dem Desktop an. Am Ende kannst du LAST SIGNALS direkt starten.
4. Entfernen: **Einstellungen → Apps → Installierte Apps → LAST SIGNALS → Deinstallieren**. Spielstände bleiben dabei erhalten.

### Weg B: ohne Installation (`LAST-SIGNALS-0.9.0-windows-x64.zip`)

1. Rechtsklick auf die `.zip` → **Alle extrahieren…** (nicht direkt aus der .zip heraus starten).
2. Im entpackten Ordner **LAST SIGNALS** die Datei **LAST SIGNALS.exe** doppelklicken.
3. SmartScreen-Warnung wie oben: **Weitere Informationen → Trotzdem ausführen**.
4. Optional: Rechtsklick auf `LAST SIGNALS.exe` → **Weitere Optionen anzeigen → Senden an → Desktop (Verknüpfung erstellen)**.

Tipps:

- **Vollbild**: `F11`.
- **Menüleiste**: `F10` blendet sie ein und aus (Bildratenbegrenzung, Neu laden, Über LAST SIGNALS). Im Spiel bleibt sie verborgen, damit `Alt` frei bleibt.
- Spielstände und Einstellungen liegen in `%APPDATA%\LAST SIGNALS`.
- Voraussetzung: Windows 10 oder 11, 64 Bit, eine Grafikkarte mit aktuellem Treiber (WebGL 2).

## iPhone und iPad

**Am einfachsten (ohne Datei, ohne Apple-ID): als Web-App.** In Safari `https://lastsignals.de/play/` öffnen → **Teilen** (Quadrat mit Pfeil) → **Zum Home-Bildschirm** → **Hinzufügen**. LAST SIGNALS startet dann vom Home-Bildschirm im Vollbild wie eine App. Die folgenden Wege mit der `.ipa` sind für Tester, die die echte App-Hülle prüfen wollen.

Apple erlaubt Apps außerhalb des App Stores nur mit einer Signatur. Ohne bezahltes Entwicklerkonto geht das mit deiner normalen (kostenlosen) Apple-ID. Die App läuft dann **7 Tage**, danach musst du sie neu aufspielen (Spielstand bleibt erhalten, solange du die App nicht löschst).

### Weg A: Sideloadly (am einfachsten, Windows oder Mac)

1. Sideloadly von der offiziellen Seite `sideloadly.io` laden und installieren.
2. iPhone/iPad per Kabel anschließen und entsperren, „Diesem Computer vertrauen“ bestätigen.
3. `LAST-SIGNALS-0.9.0-ios-unsigniert.ipa` in Sideloadly ziehen, deine Apple-ID eintragen, **Start**.
4. Auf dem Gerät: **Einstellungen → Allgemein → VPN und Geräteverwaltung** → deine Apple-ID → **Vertrauen**.
5. Ab iOS 16: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** einschalten (das Gerät startet neu).

### Weg B: AltStore

1. AltServer auf dem Mac/PC installieren (`altstore.io`), damit AltStore aufs Gerät bringen.
2. Auf dem Gerät in AltStore unter **Meine Apps** auf **+** tippen und `LAST-SIGNALS-0.9.0-ios-unsigniert.ipa` wählen (z. B. über die Dateien-App oder AirDrop aufs Gerät gelegt).
3. AltStore erneuert die 7 Tage automatisch, wenn AltServer im selben WLAN läuft.

### Weg C: Xcode mit kostenloser Apple-ID (für Entwickler)

1. Im Repository `bash Apps/bauen.sh ios` ausführen (bringt den aktuellen Spielstand in das Xcode-Projekt).
2. `Apps/ios/App/App.xcodeproj` in Xcode öffnen.
3. Links das Projekt **App** → Ziel **App** → **Signing & Capabilities**: bei **Team** deine Apple-ID wählen (Xcode → Einstellungen → Accounts → +). Falls Xcode meldet, die Kennung sei vergeben: **Bundle Identifier** ändern, z. B. `de.lastsignals.spiel.deinname`.
4. Gerät oben als Ziel wählen, **▶** drücken. Beim ersten Mal auf dem Gerät wie oben bei Weg A Schritt 4 und 5 vertrauen.

Die App läuft nur im **Querformat**, im Vollbild ohne Status-Leiste. Notch bzw. Dynamic Island und der Home-Strich verdecken nichts: Das Spielbild bleibt innerhalb der sicheren Bereiche, die Ränder sind schwarz.

## Android

1. `LAST-SIGNALS-0.9.0-android-debug.apk` aufs Handy bringen (Kabel, Google Drive, Mail an dich selbst, …) und in der Dateien-App antippen.
2. Android fragt nach **Installation aus unbekannten Quellen**: auf **Einstellungen** tippen und für die App, mit der du die Datei geöffnet hast (z. B. Dateien oder Chrome), **Dieser Quelle vertrauen** einschalten. Zurück, **Installieren**.
3. Google Play Protect kann warnen („App wurde nicht geprüft“): **Weitere Details → Trotzdem installieren**.

Die App läuft im Querformat ohne Status- und Navigationsleiste. Wischen vom Rand blendet die Leisten kurz ein. Eine Kamera-Aussparung (Loch oder Notch) verdeckt nichts: Das Spielbild rückt davon ab, der Rand dort bleibt schwarz. Es ist eine Debug-Version (mit Testschlüssel signiert); eine spätere Version mit anderer Signatur muss vorher deinstalliert werden.

---

## Für Entwickler: neu bauen

Alles aus dem aktuellen Spielstand neu bauen (Ausgabe nach `~/LAST-SIGNALS-Uebergabe/downloads/`, Dateinamen mit Versionsnummer aus `Apps/package.json`, dazu `LAST-SIGNALS-<Version>-SHA256.txt`). Neue Version: nur `"version"` in `Apps/package.json` ändern, `bauen.sh` gleicht iOS und Android selbst an (`node Apps/version.mjs --pruefen` prüft ohne zu ändern); die Website-Dateinamen stehen in `src/content/downloads.js` (`APP_VERSION`):

```bash
bash Apps/bauen.sh               # Mac, Windows, iPhone/iPad, Android
bash Apps/bauen.sh mac           # nur Mac (oder windows, ios, android, beliebig kombiniert)
TEST=1 bash Apps/bauen.sh mac    # danach die Mac-App automatisch prüfen
TEST=1 bash Apps/bauen.sh windows  # Windows-Dateien bauen und ihren Aufbau prüfen
```

Voraussetzungen: Node 20+, für den Windows-Installer `makensis` (`brew install makensis`, Wine ist nicht nötig), Xcode (iOS), JDK 21 und Android-SDK mit `platforms;android-36` und `build-tools;36.0.0` (Android). Das Skript sucht JDK und SDK selbst (Homebrew: `openjdk@21`, `android-commandlinetools`).

Tests:

- `node Apps/tests/mac.mjs` – startet die gepackte Mac-App, spielt bis zum Hub, prüft Desktop-Kennung, Service Worker, Realtime (Koop), Fenstergröße, Schalter.
- `node Apps/tests/windows.mjs` – prüft ohne Windows den Aufbau: `LAST SIGNALS.exe` (64 Bit, Symbol, Versionsdaten), `resources/app.asar` mit dem Spiel, Desktop-Kennung, Installer.
- `node Apps/tests/ios.mjs "iPhone 18 Pro"` bzw. `"iPad Pro 11-inch (M5)"` – Debug-Build im Simulator bis zum Hub, Realtime, Bildschirmfoto.
- `node Apps/tests/android.mjs` – APK im Emulator (falls eingerichtet) bis zum Hub, Realtime, Bildschirmfoto.

Für das Spiel ist `window.lsDesktop` (Mac- und Windows-App) die Desktop-Kennung: `{ platform: 'mac' | 'windows', version, arch, unlimitedFps, fullscreen(), setUnlimitedFps(), relaunch() }`.
