# LAST SIGNALS als App testen

Diese Dateien sind **Testversionen** für dich und dein Team. Sie sind nicht im App Store, nicht bei Google Play und nicht von Apple geprüft. Deshalb musst du beim ersten Öffnen jeweils einmal bestätigen, dass du der Datei vertraust.

Das Spiel selbst steckt komplett in der App und startet auch ohne Internet. Koop („Mit Freund fliegen“) braucht Internet, genau wie im Browser. Spielstände in der App sind getrennt von denen im Browser (eigener Speicher je App).

## Welche Datei für welches Gerät?

| Datei | Gerät |
|---|---|
| `LAST-SIGNALS-mac-arm64.dmg` oder `.zip` | Mac mit Apple-Chip (M1 bis M5) |
| `LAST-SIGNALS-mac-universal.dmg` oder `.zip` | jeder Mac (Apple-Chip und ältere Intel-Macs), etwas größer |
| `LAST-SIGNALS-ios-unsigniert.ipa` | iPhone und iPad (eine App für beide), über Sideloadly oder AltStore |
| `LAST-SIGNALS-ios-simulator.zip` | nur für den iOS-Simulator in Xcode, nicht für echte Geräte |
| `LAST-SIGNALS-android-debug.apk` | Android-Handy oder -Tablet (Android 7 oder neuer) |
| `belege/` | Bildschirmfotos aus den automatischen Tests |

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

## iPhone und iPad

Apple erlaubt Apps außerhalb des App Stores nur mit einer Signatur. Ohne bezahltes Entwicklerkonto geht das mit deiner normalen (kostenlosen) Apple-ID. Die App läuft dann **7 Tage**, danach musst du sie neu aufspielen (Spielstand bleibt erhalten, solange du die App nicht löschst).

### Weg A: Sideloadly (am einfachsten, Windows oder Mac)

1. Sideloadly von der offiziellen Seite `sideloadly.io` laden und installieren.
2. iPhone/iPad per Kabel anschließen und entsperren, „Diesem Computer vertrauen“ bestätigen.
3. `LAST-SIGNALS-ios-unsigniert.ipa` in Sideloadly ziehen, deine Apple-ID eintragen, **Start**.
4. Auf dem Gerät: **Einstellungen → Allgemein → VPN und Geräteverwaltung** → deine Apple-ID → **Vertrauen**.
5. Ab iOS 16: **Einstellungen → Datenschutz & Sicherheit → Entwicklermodus** einschalten (das Gerät startet neu).

### Weg B: AltStore

1. AltServer auf dem Mac/PC installieren (`altstore.io`), damit AltStore aufs Gerät bringen.
2. Auf dem Gerät in AltStore unter **Meine Apps** auf **+** tippen und `LAST-SIGNALS-ios-unsigniert.ipa` wählen (z. B. über die Dateien-App oder AirDrop aufs Gerät gelegt).
3. AltStore erneuert die 7 Tage automatisch, wenn AltServer im selben WLAN läuft.

### Weg C: Xcode mit kostenloser Apple-ID (für Entwickler)

1. Im Repository `bash Apps/bauen.sh ios` ausführen (bringt den aktuellen Spielstand in das Xcode-Projekt).
2. `Apps/ios/App/App.xcodeproj` in Xcode öffnen.
3. Links das Projekt **App** → Ziel **App** → **Signing & Capabilities**: bei **Team** deine Apple-ID wählen (Xcode → Einstellungen → Accounts → +). Falls Xcode meldet, die Kennung sei vergeben: **Bundle Identifier** ändern, z. B. `de.lastsignals.spiel.deinname`.
4. Gerät oben als Ziel wählen, **▶** drücken. Beim ersten Mal auf dem Gerät wie oben bei Weg A Schritt 4 und 5 vertrauen.

Die App läuft nur im **Querformat**, im Vollbild ohne Status-Leiste. Notch bzw. Dynamic Island und der Home-Strich verdecken nichts: Das Spielbild bleibt innerhalb der sicheren Bereiche, die Ränder sind schwarz.

## Android

1. `LAST-SIGNALS-android-debug.apk` aufs Handy bringen (Kabel, Google Drive, Mail an dich selbst, …) und in der Dateien-App antippen.
2. Android fragt nach **Installation aus unbekannten Quellen**: auf **Einstellungen** tippen und für die App, mit der du die Datei geöffnet hast (z. B. Dateien oder Chrome), **Dieser Quelle vertrauen** einschalten. Zurück, **Installieren**.
3. Google Play Protect kann warnen („App wurde nicht geprüft“): **Weitere Details → Trotzdem installieren**.

Die App läuft im Querformat ohne Status- und Navigationsleiste. Wischen vom Rand blendet die Leisten kurz ein. Es ist eine Debug-Version (mit Testschlüssel signiert); eine spätere Version mit anderer Signatur muss vorher deinstalliert werden.

---

## Für Entwickler: neu bauen

Alles aus dem aktuellen Spielstand neu bauen (Ausgabe nach `~/LAST-SIGNALS-Uebergabe/downloads/`):

```bash
bash Apps/bauen.sh               # Mac, iPhone/iPad, Android
bash Apps/bauen.sh mac           # nur Mac (oder ios, android, beliebig kombiniert)
TEST=1 bash Apps/bauen.sh mac    # danach die Mac-App automatisch prüfen
```

Voraussetzungen: Node 20+, Xcode (iOS), JDK 21 und Android-SDK mit `platforms;android-36` und `build-tools;36.0.0` (Android). Das Skript sucht JDK und SDK selbst (Homebrew: `openjdk@21`, `android-commandlinetools`).

Tests:

- `node Apps/tests/mac.mjs` – startet die gepackte Mac-App, spielt bis zum Hub, prüft Desktop-Kennung, Service Worker, Realtime (Koop), Fenstergröße, Schalter.
- `node Apps/tests/ios.mjs "iPhone 18 Pro"` bzw. `"iPad Pro 11-inch (M5)"` – Debug-Build im Simulator bis zum Hub, Realtime, Bildschirmfoto.
- `node Apps/tests/android.mjs` – APK im Emulator (falls eingerichtet) bis zum Hub, Realtime, Bildschirmfoto.

Für das Spiel ist `window.lsDesktop` (nur Mac-App) die Desktop-Kennung: `{ platform: 'mac', version, arch, unlimitedFps, fullscreen(), setUnlimitedFps(), relaunch() }`.
