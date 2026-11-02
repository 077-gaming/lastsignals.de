# Konten, Server-Spielstand und Ruhmeshalle

Stand 02.11.2026. Ein Konto gilt für Spiel und Website (Supabase-Projekt `ydvtdxvnkmjbdwxsriuv`, Frankfurt). Ohne Konto bleibt das Spiel voll spielbar, der Spielstand liegt dann nur im Browser.

## Ablauf im Spiel

**Titelbildschirm** (Panel `ID·00 KONTO`):

- **Mit Konto anmelden**: E-Mail und Passwort (`signInWithPassword`). Danach Pilot laden (`pilots`), sonst Rufname sichern (unten).
- **Konto anlegen**: E-Mail, Passwort (mindestens 8 Zeichen), Rufname, Fraktion. Vorher `callsign_available`, dann `signUp` mit `emailRedirectTo: https://lastsignals.de/` und Rufname/Fraktion in den Metadaten. Hinweis im Dialog: Bestätigungsmail öffnen, Link anklicken, dann im Spiel anmelden.
- **Erste Anmeldung**: kein Pilot zum Konto → `claim_callsign(Rufname, Fraktion)` aus den Metadaten. Ist der Name inzwischen vergeben oder fehlen die Angaben, fragt der Dialog nach einem anderen Rufnamen.
- **Passwort vergessen**: `resetPasswordForEmail` mit `redirectTo: https://lastsignals.de/play/`. Der Link öffnet das Spiel im Browser, das Spiel erkennt `type=recovery` und fragt nach dem neuen Passwort (`updateUser`). Landet der Link auf der Hauptseite (Weiterleitung nicht erlaubt), reicht die Website ihn an `/play/` weiter.
- **Ohne Konto spielen**: das bisherige Rufname-Feld (`ID·01`). Lokale Akten bleiben unverändert nutzbar.
- **Weiter als …**: Ist eine Sitzung gespeichert, zeigt der Titel den Kontopiloten und startet direkt mit ihm.

**Hub**: Einstellungen → Abschnitt `KONTO` (anmelden, anlegen, Status des Server-Stands, „Jetzt sichern“, „Konto abmelden“). Wer im Hub mit einem anderen Rufnamen anmeldet, wechselt zum Kontopiloten; der lokale Pilot bleibt im Browser.

**Sitzung**: Supabase speichert sie in `localStorage` (`sb-ydvtdxvnkmjbdwxsriuv-auth-token`), auch in Electron und Capacitor. Ohne gespeicherte Sitzung lädt das Spiel beim Start nichts vom Server. Anmeldefluss `implicit` (nicht PKCE), damit Links aus Mails auch funktionieren, wenn sie in einem anderen Browser geöffnet werden als dem, in dem das Konto angelegt wurde (Desktop-App, Handy-App).

**Fehlermeldungen** (`Code/src/net/cloud-logic.js` → `errorText`): E-Mail oder Passwort falsch · E-Mail noch nicht bestätigt · Rufname vergeben · Konto zu dieser E-Mail existiert · Passwort zu schwach · zu viele Versuche · keine Verbindung (offline, Zeitüberschreitung) · Sitzung abgelaufen · Spielstand zu groß.

## Tabellen und Funktionen (Supabase, nicht vom Spiel verändert)

| Name | Inhalt | Rechte |
|---|---|---|
| `pilots` | `id`, `user_id`, `callsign` (citext, eindeutig), `faction`, `title`, `founder` | lesen: alle |
| `pilot_saves` | `pilot_id`, `data` (jsonb, ≤ 512 kB), `version`, `level`, `xp`, `honor`, `kills`, `client`, `updated_at` | nur der eigene Pilot (RLS) |
| `claim_callsign(p_callsign, p_faction)` | legt Pilot und Profil an, einmal je Konto | angemeldet |
| `callsign_available(p_callsign)` | Rufname frei? | alle |
| `save_pilot_state(p_data, p_version, p_level, p_xp, p_honor, p_kills, p_client)` | → `(version, conflict)` | angemeldet, eigener Pilot |
| `hall_of_fame(p_faction, p_order, p_limit)` | Bestenliste, `p_order` = `honor` · `xp` · `kills` · `level`, höchstens 100 | alle |

`save_pilot_state`: Gibt es noch keinen Eintrag, wird Version 1 angelegt. Stimmt `p_version` nicht mit der Server-Version überein → `conflict = true`, nichts geschrieben. Sonst Version + 1. **`p_version = null` überschreibt ohne Prüfung – das Spiel sendet deshalb immer eine Zahl** (0 beim allerersten Sichern).

## Sichern

Der lokale Spielstand bleibt die Arbeitskopie. Mit Konto wird zusätzlich auf dem Server gesichert:

- beim Andocken an einer Station,
- beim Wechsel zwischen Hub-Bereichen (höchstens alle 20 s) und jedes Mal vor dem Hub,
- alle 2 Minuten im Flug,
- beim Verlassen der Seite (`visibilitychange`/`pagehide`, `fetch` mit `keepalive` – `sendBeacon` kann keinen Anmelde-Kopf senden; best effort, Grenze 64 kB),
- „Jetzt sichern“ in den Einstellungen (fragt immer den Server und findet so neuere Stände anderer Geräte).

Unveränderte Stände werden nicht erneut gesendet (Prüfsumme). **Größe**: über 400 kB wird nicht hochgeladen (Meldung, Stand bleibt lokal). Ein typischer Stand hat 3–10 kB.

**Offline**: Fehler „keine Verbindung“ → Stand bleibt lokal, Markierung `dirty`, Anzeige „OFFLINE · WIRD NACHGESICHERT“. Beim nächsten Anlass oder sobald der Browser wieder online meldet, wird nachgesichert.

Lokale Abgleichdaten: `ls.cloud.v1` (je Rufname: letzte Server-Version, Prüfsumme, Zeit, dirty, Konto), `ls.cloud.pilot` (zuletzt bekannter Kontopilot, für den Start ohne Netz), `ls.cloud.backup.<rufname>` (zuletzt ersetzter Stand).

## Konfliktregeln

Grundsatz: **Nie stillschweigend Fortschritt wegwerfen.** Wer verliert, liegt vorher als Sicherung im Browser (`ls.cloud.backup.<rufname>`), und der Spieler bekommt einen Hinweis.

Nach der Anmeldung (`decideLogin`):

| Lage | Ergebnis |
|---|---|
| nur Server-Stand | Server-Stand laden |
| nur lokaler Stand (gleicher Rufname) | lokalen Stand hochladen und verknüpfen |
| beide gleich | nichts tun |
| lokal seit dem letzten Abgleich unverändert, Server neuer | Server-Stand laden (Hinweis mit Stufe/EP) |
| lokal geändert, Server unverändert | lokalen Stand hochladen |
| beide geändert | wie Konflikt (unten) |
| noch nie abgeglichen, beide verschieden | **Spieler wählt** (Dialog mit Stufe, EP, Ehre, Credits, Spielzeit, Datum; Empfehlung = mehr Fortschritt) |
| lokaler Pilot gleichen Namens aus anderer Fraktion | Spieler wählt; der lokale Stand kann nicht verknüpft werden (Fraktion kommt aus dem Konto), er bleibt als Sicherung |

Beim Sichern mit `conflict` (`decideConflict`): Server-Stand laden und vergleichen.

- **Server hat mehr Fortschritt** (Stufe, dann EP) → Server-Stand gilt. Im Flug: Funkmeldung „anderes Gerät war neuer“, nach 3 s Rückkehr zur Station, dort Übernahme mit Hinweis (Stufe/EP des anderen Geräts).
- **Eigener Stand hat mehr Fortschritt** → auf der neuen Server-Version aufbauen und überschreiben; Hinweis, dass ein anderes Gerät inzwischen gesichert hatte.
- **Gleicher Fortschritt, andere Daten** → Spieler wählt (Dialog „Anderes Gerät war neuer“).
- Solange ein Konflikt offen ist, wird nicht weiter gesichert.
- Ein lokaler Pilot, dessen Fraktion nicht zum Konto passt, wird nie gesichert – auch nicht, wenn der Rufname des Kontos über „Ohne Konto spielen“ eingegeben wird (dann läuft derselbe Abgleich wie nach der Anmeldung).
- Erstes Sichern zweier Geräte gleichzeitig (Datenbank meldet doppelten Eintrag) → wird wie ein Versionskonflikt behandelt.
- Beim Verlassen der Seite wird nicht zusätzlich gesendet, solange ein normales Sichern läuft (sonst gleiche Version zweimal → falscher Konflikt). Der nächste Abgleich erkennt den geänderten Stand an der Prüfsumme.

## Ruhmeshalle

- **Hub** → RUHMESHALLE: Reiter Ehre / Erfahrung / Abschüsse / Stufe, Filter Alle / EU / SA / ER, bis 100 Einträge, eigener Platz hervorgehoben („DU“), steht man nicht unter den ersten 100, folgt die eigene Zeile darunter. Ohne Konto: Hinweis und Knopf „Mit Konto anmelden“. Ergebnisse 60 s zwischengespeichert.
- **Website** `ruhmeshalle/` (und `en/hall-of-fame/`): gleiche Daten per `fetch` auf `hall_of_fame` (ohne Supabase-SDK), Reiter und Fraktionsfilter, 50 Einträge. Ist die Tafel leer, bleibt „Dein Rufname? → Rufnamen sichern“ stehen. Code: `src/hall.js`, Aufbau `src/content/render.js` (`hallBody`).
- Bestätigungslinks aus dem Spiel (implicit flow, `#access_token=…`) übernimmt die Website als Sitzung (`src/api.js`), danach sichert sie wie gewohnt den Rufnamen aus den Metadaten.

## Grenzen (Testphase)

- **Der Spielstand wird im Spiel (Browser) berechnet.** Der Server prüft nur Versionsnummer, Größe und Wertebereiche (Stufe 1–50, nichts negativ). Wer die Daten im Browser verändert, kann Werte in der Ruhmeshalle manipulieren. Erst ein Spielserver, der Kämpfe und Belohnungen selbst rechnet, macht die Tafel fälschungssicher.
- Ein Konto hat genau einen Piloten. Weitere lokale Piloten bleiben lokal.
- Bestätigungs- und Passwort-Mails kommen vom Supabase-Standardversand (begrenzte Menge je Stunde), bis ein eigener Mailserver eingetragen ist.
- Weiterleitung nach dem Passwort-Link: `https://lastsignals.de/play/` muss in Supabase erlaubt sein (Authentication → URL Configuration, z. B. `https://lastsignals.de/**`). Sonst landet der Link auf der Hauptseite, die ihn an `/play/` weitergibt.
- Ersetzte Stände liegen nur als Sicherung im Browser (`ls.cloud.backup.<rufname>`, jeweils der letzte); eine Schaltfläche zum Zurückholen gibt es noch nicht.
- Konto löschen gibt es im Spiel noch nicht (Supabase-Dashboard oder später Website-Profil).

## Code und Tests

- `Code/src/net/cloud-logic.js` – reine Regeln (Prüfsumme, Vergleich, Konflikt, Größe, Fehlertexte).
- `Code/src/net/account.js` – Konto, Sitzung, Pilot, Sichern mit Versionsprüfung; Netz nur über austauschbare Schicht.
- `Code/src/net/account-api.js` – Supabase-Schicht · `Code/src/net/account-mock.js` – Attrappe mit denselben Server-Regeln.
- `Code/src/net/supa.js` – ein gemeinsamer Supabase-Client (auch für den Koop-Funk).
- `Code/src/ui/account-ui.js`, `account-flow.js`, `account.css` – Dialoge, Standwahl, Ruhmeshalle, Ablauf.
- Selbsttest (`cd Code && npm test`): Abgleichregeln, Konflikte zwischen zwei Geräten, offline/nachsichern, Rufname vergeben, andere Fraktion, Größe, Fehlertexte.
- Browser-Test ohne echte Konten: `http://localhost:5173/?konto=attrappe` (nur Entwicklungsserver). Vorbelegt `test@attrappe.local` / `geheim123`; Hilfen in der Konsole (Port je nach Start, z. B. 5194): `__lsMock.confirm(email)`, `__lsMock.bump(rufname, ep, stufen)` (anderes Gerät), `__lsMock.offline(true|false)`, `__lsMock.reset()`.
- Automatischer Browser-Test mit der Attrappe (Entwicklungsserver, Chrome): `cd Code && node tools/konten/test.mjs [--url http://localhost:5173] [--bilder <ordner>]` – Konto anlegen, Bestätigung, falsches Passwort, Anmeldung mit Rufname aus den Metadaten, KONTO in den Einstellungen („Jetzt sichern“), Ruhmeshalle, Andocken mit Konflikt (anderes Gerät neuer → Rückkehr zur Station), „Weiter als …“, Abmelden, Konto ohne Rufnamen (vergeben → anderer Name), keine Konsolenfehler.
