// Impressum und Datenschutz. Angaben aus Planung/IMPRESSUM.md (Toni, 30.10.2026).
// Bei Änderungen an Anbieter, Hosting oder Anmeldung diese Datei anpassen.
// Der Text nennt nur, was wirklich passiert. Was aktiv ist, kommt beim Bauen aus vite.config.js:
//   open  = Reservierung per E-Mail offen (VITE_RESERVATION_OPEN=true)
//   oauth = Google/Discord, die Supabase gerade meldet (GET /auth/v1/settings). Abschnitt erscheint erst dann.
//   mail  = eigener Mailversand, der in Supabase > Auth > SMTP eingetragen ist (VITE_MAIL_PROVIDER, z. B. resend).
//           Leer: Supabase-Standardversand. Vor dem Start den tatsächlich eingetragenen Dienst prüfen und hier setzen.

import { RELEASE } from './downloads.js';

// Apps und GitHub-Downloads erst als verfügbar beschreiben, wenn das Release veröffentlicht ist
const APPS = RELEASE.published;

const OP = {
  name: '077 GAMING', owner: 'Antonio Geske', street: 'Tiedexer Tor 8B', city: '37574 Einbeck',
  phone: '+49 179 2275656', phoneHref: '+491792275656', mail: 'support@077-gaming.de',
};
const DATE = { de: '3. November 2026', en: '3 November 2026' };
const addr = (country) => `${OP.name}<br>${OP.owner}<br>${OP.street}<br>${OP.city}<br>${country}`;
const mail = `<a href="mailto:${OP.mail}">${OP.mail}</a>`;
const ext = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const PROV = {
  de: { google: 'Google (Google Ireland Limited, Irland)', discord: 'Discord (Discord Inc., USA)' },
  en: { google: 'Google (Google Ireland Limited, Ireland)', discord: 'Discord (Discord Inc., USA)' },
};
const POL = { google: 'https://policies.google.com/privacy', discord: 'https://discord.com/privacy' };
// Mögliche eigene Mailversand-Dienste (Supabase > Auth > SMTP). Nur nennen, was wirklich eingetragen ist.
const MAILER = {
  resend: { name: 'Resend', de: 'Resend (Resend, Inc., USA)', en: 'Resend (Resend, Inc., USA)', pol: 'https://resend.com/legal/privacy-policy' },
};
// Supabase: Sitz in den USA, Daten in Frankfurt am Main; Zugriffe aus den USA möglich
const SB_US = {
  de: 'Supabase, Inc. hat ihren Sitz in den USA. Die Daten liegen in Frankfurt am Main, Supabase und seine Unterauftragsverarbeiter können für Betrieb, Wartung und Support aber auch aus den USA darauf zugreifen. Für solche Übermittlungen gelten die EU-Standardvertragsklauseln aus dem Auftragsverarbeitungsvertrag von Supabase (Art. 46 Abs. 2 lit. c DSGVO).',
  en: 'Supabase, Inc. is based in the USA. The data is stored in Frankfurt am Main, but Supabase and its sub-processors may also access it from the USA for operation, maintenance and support. Such transfers are covered by the EU Standard Contractual Clauses in the Supabase data processing agreement (Art. 46(2)(c) GDPR).',
};
const mailDe = (m) => (MAILER[m]
  ? `Bestätigungs- und Passwort-Mails verschickt der Anmeldedienst von Supabase über den Versanddienst ${MAILER[m].de}, der in unserem Auftrag arbeitet (Art. 28 DSGVO). Dafür erhält ${MAILER[m].name} deine E-Mail-Adresse und den Inhalt der Mail mit dem Link. Dabei können Daten in die USA übertragen werden; Grundlage sind die EU-Standardvertragsklauseln im Auftragsverarbeitungsvertrag des Anbieters (Art. 46 Abs. 2 lit. c DSGVO). Mehr: ${ext(MAILER[m].pol, `Datenschutz bei ${MAILER[m].name}`)}.`
  : 'Bestätigungs- und Passwort-Mails verschickt der Anmeldedienst von Supabase mit seinem eigenen Mailversand.');
const mailEn = (m) => (MAILER[m]
  ? `Confirmation and password emails are sent by the Supabase authentication service through the email provider ${MAILER[m].en}, acting on our behalf (Art. 28 GDPR). ${MAILER[m].name} receives your email address and the content of the email with the link. Data may be transferred to the USA; the basis is the EU Standard Contractual Clauses in the provider’s data processing agreement (Art. 46(2)(c) GDPR). More: ${ext(MAILER[m].pol, `${MAILER[m].name} privacy`)}.`
  : 'Confirmation and password emails are sent by the Supabase authentication service using its own email delivery.');
const list = (arr, and) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} ${and} ${arr[arr.length - 1]}`);
// Abschnitte nummerieren, ausgelassene (null) überspringen
const sections = (arr) => arr.filter(Boolean).map(([h, body], i) => `<h2>${i + 1}. ${h}</h2>\n${body}`).join('\n');


const IMPRESSUM = `<h1>Impressum</h1>
<p>LAST SIGNALS ist ein Spiel von 077 GAMING.</p>
<h2>Angaben gemäß § 5 DDG</h2>
<p>${OP.name}<br>Inhaber: ${OP.owner}<br>${OP.street}<br>${OP.city}<br>Deutschland</p>
<h2>Kontakt</h2>
<p>Telefon: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>E-Mail: ${mail}</p>
<h2>Umsatzsteuer</h2>
<p>Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.</p>
<h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
<p>${OP.owner}, Anschrift wie oben</p>
<h2>Verbraucherstreitbeilegung</h2>
<p>Wir sind weder verpflichtet noch bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
<h2>Zuständige Datenschutz-Aufsichtsbehörde</h2>
<p>Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover</p>
<h2>Haftung für Links</h2>
<p>Diese Website enthält Links zu Websites Dritter, etwa zu unseren Kanälen auf Discord, Instagram und TikTok. Für deren Inhalte sind ausschließlich die jeweiligen Anbieter verantwortlich.</p>`;

const IMPRINT = `<h1>Imprint</h1>
<p class="legal-note">Legal notice under German law. The German version is authoritative: <a href="https://lastsignals.de/impressum/" hreflang="de" lang="de">Impressum</a>.</p>
<p>LAST SIGNALS is a game by 077 GAMING.</p>
<h2>Information pursuant to § 5 DDG</h2>
<p>${OP.name}<br>Owner: ${OP.owner}<br>${OP.street}<br>${OP.city}<br>Germany</p>
<h2>Contact</h2>
<p>Phone: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>Email: ${mail}</p>
<h2>VAT</h2>
<p>No VAT is charged under the small business rule of § 19 UStG.</p>
<h2>Responsible for content under § 18 (2) MStV</h2>
<p>${OP.owner}, address as above</p>
<h2>Consumer dispute resolution</h2>
<p>We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board.</p>
<h2>Competent data protection authority</h2>
<p>Die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, Germany</p>
<h2>Liability for links</h2>
<p>This website links to third-party websites, such as our channels on Discord, Instagram and TikTok. Their providers alone are responsible for their content.</p>`;

// Speicherorte im Browser (localStorage, außer wo anders angegeben). Quelle: Code/src und src (Stand 03.11.2026).
const KEYS = {
  de: [
    ['weltraumspiel.profiles.v1', `dein Spielstand im Browser${APPS ? ' bzw. in der App' : ''}: je Rufname Fraktion, Stufe, Fortschritt, Ausrüstung, Aufträge und Spielstatistik`],
    ['weltraumspiel.profiles.v1.bak', 'der letzte gültige Spielstand als Sicherung (wird vor jedem Speichern angelegt)'],
    ['weltraumspiel.profiles.v1.corrupt.<Zeit>', 'nur falls ein Spielstand unlesbar war: die unlesbaren Rohdaten, damit nichts verloren geht'],
    ['weltraumspiel.last', 'der zuletzt gespielte Rufname'],
    ['sb-…-auth-token', 'deine Anmeldesitzung, wenn du mit Konto angemeldet bist (Website und Spiel), mit Konto-Kennung und E-Mail-Adresse'],
    ['ls.cloud.v1, ls.cloud.backup.<Rufname>', 'Abgleich mit dem Server-Spielstand: Version, Prüfsumme, Zeitpunkt und die zuletzt ersetzte Fassung als Sicherung'],
    ['ls.cloud.pilot, ls.cloud.pending', 'Pilot des Kontos für das Spielen ohne Verbindung und ein gerade angelegtes, noch nicht bestätigtes Konto: Rufname, Fraktion und E-Mail-Adresse'],
    ['ls-faction', 'deine Fraktionswahl auf der Website'],
    ['ls-pending', 'ein noch nicht bestätigter Rufname (nur beim Sichern über die Website)'],
    ['ls.settings, ls.camera, ls.qauto, ls.hud.*, ls.pad, ls.station.view, ls.quickbuy.ok', 'Einstellungen: Grafik, Ton, Kamera, Anzeigen, Controller'],
    ['ls.mp.mute, ls.mp.pvp', 'Mehrspieler: stummgeschaltete Rufnamen, ob du PvP zulässt'],
    ['ls.coop (sessionStorage)', 'die laufende Koop-Sitzung, bis der Tab geschlossen wird'],
  ],
  en: [
    ['weltraumspiel.profiles.v1', `your save game in the browser${APPS ? ' or app' : ''}: per callsign faction, level, progress, gear, quests and game statistics`],
    ['weltraumspiel.profiles.v1.bak', 'the last valid save game as a backup (created before every save)'],
    ['weltraumspiel.profiles.v1.corrupt.<time>', 'only if a save game was unreadable: the unreadable raw data, so nothing is lost'],
    ['weltraumspiel.last', 'the callsign you played last'],
    ['sb-…-auth-token', 'your sign-in session when you are signed in with an account (website and game), including account ID and email address'],
    ['ls.cloud.v1, ls.cloud.backup.<callsign>', 'sync with the server save: version, checksum, time and the most recently replaced copy as a backup'],
    ['ls.cloud.pilot, ls.cloud.pending', 'the account’s pilot for playing offline and a newly created, not yet confirmed account: callsign, faction and email address'],
    ['ls-faction', 'your faction choice on the website'],
    ['ls-pending', 'a callsign not yet confirmed (only when securing it on the website)'],
    ['ls.settings, ls.camera, ls.qauto, ls.hud.*, ls.pad, ls.station.view, ls.quickbuy.ok', 'settings: graphics, sound, camera, HUD, controller'],
    ['ls.mp.mute, ls.mp.pvp', 'multiplayer: muted callsigns, whether you allow PvP'],
    ['ls.coop (sessionStorage)', 'the current co-op session until the tab is closed'],
  ],
};
const keyTable = (lang) => `<table class="legal-table"><thead><tr><th scope="col">${lang === 'de' ? 'Schlüssel' : 'Key'}</th><th scope="col">${lang === 'de' ? 'Inhalt' : 'Content'}</th></tr></thead><tbody>${KEYS[lang].map(([k, v]) => `<tr><td><code>${k.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></td><td>${v}</td></tr>`).join('')}</tbody></table>`;

const DATENSCHUTZ = ({ open, oauth, mail: mailer }) => `<h1>Datenschutz</h1>
<p>Stand: ${DATE.de}</p>
${sections([
  ['Verantwortlicher', `<p>${addr('Deutschland')}<br>Telefon: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>E-Mail: ${mail}</p>`],
  ['Kurz gesagt', `<ul>
<li>Keine Analyse-, Tracking- oder Werbedienste, keine Cookies. Schriften, Skripte, Bilder, Videos und Klänge kommen von unserem Hosting bei Netlify, nicht von fremden Diensten.</li>
<li>Verbindungen zu Supabase (Daten in Frankfurt am Main, Anbieter mit Sitz in den USA) entstehen nur für Konto, Rufnamen-Prüfung, Ruhmeshalle und Mehrspieler. Dabei sieht Supabase deine IP-Adresse.</li>
<li>Ohne Konto bleibt dein Spielstand nur in deinem Browser${APPS ? ' bzw. in der App' : ''}.</li>
<li>Mit Konto speichern wir E-Mail-Adresse, Rufname, Fraktion und deinen Spielstand bei Supabase in Frankfurt am Main. Dein Passwort sehen wir nie.</li>
<li>Öffentlich sind Rufname, Fraktion, Titel und Spielwerte (Ruhmeshalle, Pilotenliste), nie deine E-Mail-Adresse oder dein Spielstand.</li>
<li>Chat-Nachrichten im Mehrspieler gehen über Supabase Realtime an die Mitspieler im Kanal und werden von uns nicht gespeichert.</li>
<li>Löschung jederzeit: eine kurze E-Mail an ${mail} genügt.</li>
</ul>`],
  ['Hosting der Website und des Browserspiels', `<p>Website und Browserspiel (unter /play/) werden bei Netlify, Inc. (USA) gehostet. Beim Aufruf verarbeitet Netlify technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, übertragene Datenmenge, Browser und Betriebssystem. Das dient dem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Netlify verarbeitet diese Daten in unserem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO). Dabei können Daten in die USA übermittelt werden; Grundlage sind die von Netlify dafür vorgesehenen EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Mehr: ${ext('https://www.netlify.com/privacy/', 'Datenschutz bei Netlify')}.</p>`],
  ['Downloads der Apps (GitHub)', `${APPS ? '' : '<p>Die Apps sind noch nicht veröffentlicht. Bis dahin verlinkt die Download-Seite keine Dateien und stellt keine Verbindung zu GitHub her. Sobald die Dateien bereitstehen, gilt Folgendes:</p>'}<p>Die App-Dateien für Mac, Windows, Android, iPhone und iPad ${APPS ? 'liegen' : 'werden'} als Anhänge eines Releases in unserem öffentlichen Repository bei GitHub, Inc. (USA)${APPS ? '' : ' liegen'}. Klickst du auf der Download-Seite auf eine Datei, lädt dein Browser sie direkt von GitHub. GitHub verarbeitet dabei technisch notwendige Daten wie IP-Adresse, Zeitpunkt und Browserkennung; dabei können Daten in die USA übertragen werden. Vor dem Klick wird nichts an GitHub übertragen. Rechtsgrundlage ist unser Interesse, die Dateien zuverlässig bereitzustellen (Art. 6 Abs. 1 lit. f DSGVO). Es gelten zusätzlich die ${ext('https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement', 'Datenschutzhinweise von GitHub')}.</p>`],
  ['Konto', `<p>Ein Konto ist freiwillig. Du kannst es im Spiel anlegen (Titelbildschirm, „Konto anlegen“)${open || oauth.length ? ' oder auf der Website' : ''}. Dafür verarbeiten wir:</p>
<ul>
<li>E-Mail-Adresse, für Anmeldung, Bestätigungsmail und „Passwort vergessen“,</li>
<li>Passwort: Es wird nur bei Supabase als Hash gespeichert (nicht umkehrbar verschlüsselt). Wir können es nicht lesen,</li>
<li>Rufname und Fraktion, außerdem Titel und Gründungspilot-Status, falls vorhanden,</li>
<li>eine Konto-Kennung und Zeitpunkte von Anlage, Bestätigung und Anmeldung,</li>
<li>bei Anmeldungen protokolliert der Anmeldedienst zur Sicherheit IP-Adresse und Zeitpunkt.</li>
</ul>
<p>Öffentlich lesbar: Die Tabelle <code>pilots</code> (Konto-Kennung, Rufname, Fraktion, Titel und Gründungspilot-Status) kann über die öffentliche Datenbankschnittstelle von jedem gelesen werden. Darüber zeigen Spiel und Website Rufnamen an und prüfen, ob ein Name frei ist. Die Konto-Kennung ist eine zufällige Zeichenfolge. E-Mail-Adresse, Passwort und Spielstand stehen nicht in dieser Tabelle und sind nicht öffentlich.</p>
<p>Nach dem Anlegen bekommst du eine E-Mail mit einem Bestätigungslink. ${mailDe(mailer)} Rechtsgrundlage ist die Bereitstellung des Kontos, das du angefordert hast (Art. 6 Abs. 1 lit. b DSGVO).</p>
<p>Die Daten liegen bei Supabase, Inc. in einem Rechenzentrum in der EU (Frankfurt am Main). Supabase verarbeitet sie in unserem Auftrag (Art. 28 DSGVO). ${SB_US.de} Mehr: ${ext('https://supabase.com/privacy', 'Datenschutz bei Supabase')}.</p>`],
  ['Server-Spielstand', `<p>Spielst du mit Konto, sichern wir deinen Spielstand zusätzlich auf dem Server (Tabelle <code>pilot_saves</code>), damit du auf anderen Geräten weiterspielen kannst. Gespeichert werden der vollständige Spielstand (unter anderem Rufname, Fraktion, Stufe, Erfahrung, Ehre, Rangpunkte, Credits, Tritium, Schiffe, Ausrüstung, Munition, Drohnen, Laderaum, Sektor, Aufträge und Spielstatistik wie Abschüsse, Tode und Spielzeit), dazu eine Versionsnummer, die Art des Geräts mit Spielversion (zum Beispiel „web“, „electron“ oder „capacitor“) und der Zeitpunkt der letzten Sicherung. Gesichert wird beim Andocken, im Hub, alle zwei Minuten im Flug und beim Verlassen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Der Spielstand liegt ebenfalls bei Supabase in Frankfurt am Main.</p>`],
  ['Ruhmeshalle', `<p>Die Ruhmeshalle im Spiel und auf der Website zeigt öffentlich die Piloten mit Konto: Rufname, Fraktion, Stufe, Ehre, Erfahrung und Abschüsse. E-Mail-Adressen erscheinen nie. Beim Öffnen der Seite Ruhmeshalle lädt dein Browser die Liste direkt bei Supabase (öffentliche Datenbankfunktion <code>hall_of_fame</code>); dabei wird deine IP-Adresse an Supabase übertragen. Rechtsgrundlage für diesen Abruf ist unser Interesse, die Bestenliste anzuzeigen, die du aufrufst (Art. 6 Abs. 1 lit. f DSGVO). Die Ruhmeshalle gehört zum Spiel, das du mit dem Konto nutzt (Art. 6 Abs. 1 lit. b DSGVO). Wer ohne Konto spielt, erscheint nicht. Möchtest du nicht in der Ruhmeshalle stehen, schreib uns. Dann löschen wir das Konto oder nehmen dich aus der Liste.</p>`],
  ['Mehrspieler, Chat und Koop', `<p>Im Mehrspieler und im Koop verbindet sich das Spiel über Supabase Realtime mit den Mitspielern im selben Kanal (Sektor, Fraktion, alle, Koop). Das geht auch ohne Konto. Übertragen werden:</p>
<ul>
<li>Rufname, Fraktion, Stufe, Schiff, Ausrüstung und Werte von Hülle und Schild,</li>
<li>Position, Kurs und Tempo deines Schiffs, Treffer, Abschüsse und Einladungen zum Koop,</li>
<li>eine zufällige Sitzungskennung je Flug,</li>
<li>Chat-Nachrichten mit Rufname und Fraktion.</li>
</ul>
<p>Diese Daten gehen in Echtzeit an die Mitspieler im Kanal und werden nicht in einer Datenbank gespeichert. Chat-Nachrichten sehen alle, die gerade im Kanal sind. Was sie auf ihrem Gerät damit machen, liegt außerhalb unseres Einflusses. Schreib im Chat deshalb nichts Persönliches. Für die Verbindung verarbeitet Supabase deine IP-Adresse. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Mehrspieler-Funktion, die du nutzt). Supabase arbeitet auch hier in unserem Auftrag (Art. 28 DSGVO); für mögliche Zugriffe aus den USA gilt dasselbe wie beim Konto (Standardvertragsklauseln).</p>`],
  ['Rufname prüfen', `<p>Tippst du auf der Website oder beim Anlegen eines Kontos im Spiel einen Rufnamen ein, fragt die Seite bei Supabase in Frankfurt am Main nach, ob er noch frei ist (Datenbankfunktion <code>callsign_available</code>). Übertragen werden der eingegebene Name und, technisch bedingt, deine IP-Adresse. Der Name wird dabei nicht gespeichert. Rechtsgrundlage ist unser Interesse, doppelte Rufnamen zu vermeiden (Art. 6 Abs. 1 lit. f DSGVO).</p>`],
  ['Weitere Abrufe der Website bei Supabase', `<ul>
<li>Anmeldestatus: Nur wenn in deinem Browser eine Anmeldesitzung gespeichert ist oder du über einen Bestätigungslink kommst, lädt die Website die Anmeldefunktion und fragt bei Supabase deinen Piloten ab (Rufname, Fraktion, Titel), um ihn in der Kopfleiste zu zeigen. Ohne gespeicherte Sitzung findet dieser Abruf nicht statt.</li>
<li>Anmeldewege: Nur wenn die Anmeldung über die Website oder mit Google/Discord freigeschaltet ist, fragt die Startseite beim Laden bei Supabase ab, welche Anmeldewege angeboten werden (Adresse <code>/auth/v1/settings</code>). Dabei wird nur deine IP-Adresse übertragen, keine persönlichen Angaben.</li>
</ul>
<p>Rechtsgrundlage ist unser Interesse, die Website mit Konto-Funktionen zu betreiben (Art. 6 Abs. 1 lit. f DSGVO) bzw. die Bereitstellung deines Kontos (Art. 6 Abs. 1 lit. b DSGVO). Supabase verarbeitet die Daten in unserem Auftrag (Art. 28 DSGVO).</p>`],
  open ? ['Rufnamen über die Website sichern', `<p>Sicherst du deinen Rufnamen über die Website, verarbeiten wir Rufname, Fraktion, E-Mail-Adresse und den Zeitpunkt von Anmeldung und Bestätigung. Erst der Klick auf den Link in der Bestätigungsmail sichert den Namen (Double-Opt-in). Daraus entsteht dasselbe Konto wie im Spiel.</p>`] : null,
  oauth.length ? [`Anmeldung mit ${list(oauth.map((k) => k[0].toUpperCase() + k.slice(1)), 'oder')}`, `<p>Du kannst dich wahlweise mit ${list(oauth.map((k) => PROV.de[k]), 'oder')} anmelden. Erst wenn du den jeweiligen Knopf anklickst, wirst du zum Anbieter weitergeleitet. Wir erhalten dann deine Konto-Kennung, deine E-Mail-Adresse und, falls freigegeben, Name und Profilbild. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Es gelten zusätzlich die Hinweise von ${list(oauth.map((k) => ext(POL[k], k[0].toUpperCase() + k.slice(1))), 'und')}.</p>`] : null,
  [APPS ? 'Speicherung im Browser und in den Apps' : 'Speicherung im Browser', `<p>Website und Spiel setzen keine Cookies. Im Speicher deines Browsers (localStorage) legen wir nur ab, was für die Funktion nötig ist. Diese Daten verlassen dein Gerät nicht, außer der Spielstand bei Spielen mit Konto (siehe oben):</p>
${keyTable('de')}
<p>Das ist für den von dir gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Das Browserspiel registriert außerdem einen Service Worker, damit es sich als App installieren lässt. Er speichert nichts zwischen. Du kannst alle diese Daten jederzeit in deinem Browser löschen. Ohne Konto ist dein Spielstand danach weg.</p>`],
  [APPS ? 'Apps für Mac, Windows, Android, iPhone und iPad' : 'Apps für Mac, Windows, Android, iPhone und iPad (noch nicht veröffentlicht)', `<p>${APPS ? '' : 'Die Apps sind noch nicht veröffentlicht. Sobald sie erscheinen, gilt: '}Die Apps enthalten dasselbe Spiel wie die Browserfassung und verarbeiten dieselben Daten auf dieselbe Weise: Spielstand und Einstellungen lokal in der App, mit Konto zusätzlich bei Supabase, im Mehrspieler über Supabase Realtime. Die Apps enthalten keine Analyse-, Werbe- oder Absturzberichts-Dienste und keine automatische Update-Prüfung. Sie sind Testversionen außerhalb der App-Stores.</p>`],
  ['Ton', '<p>Klänge und Musik der Website werden direkt in deinem Browser erzeugt. Das Spiel lädt seine Klänge als Dateien von unserem Hosting bei Netlify. In beiden Fällen werden keine Daten an Dritte übertragen.</p>'],
  ['Links zu sozialen Netzwerken', '<p>Die Knöpfe zu Discord, Instagram, TikTok und weiteren Kanälen sind einfache Links. Vor dem Anklicken werden keine Daten an diese Anbieter übertragen. Nach dem Anklicken gelten die Datenschutzhinweise des jeweiligen Anbieters.</p>'],
  ['Speicherdauer und Löschung', `<p>Kontodaten, Server-Spielstand und Eintrag in der Ruhmeshalle speichern wir, solange dein Konto besteht. Eine Löschfunktion im Spiel gibt es noch nicht. Bis dahin genügt eine kurze E-Mail an ${mail} mit der E-Mail-Adresse deines Kontos; wir löschen dann Konto, Pilot und Spielstand vollständig. Nicht bestätigte Konten löschen wir, sobald sie nicht mehr gebraucht werden. Mehrspieler- und Chat-Daten werden nicht gespeichert. Daten im Browser löschst du selbst über die Einstellungen deines Browsers.</p>`],
  ['Kontakt', '<p>Schreibst du uns, verarbeiten wir deine Angaben, um die Anfrage zu beantworten (Art. 6 Abs. 1 lit. b und f DSGVO), und löschen sie, wenn sie nicht mehr nötig sind.</p>'],
  ['Deine Rechte', '<p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3). Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Zuständig ist die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover.</p>'],
])}`;

const PRIVACY = ({ open, oauth, mail: mailer }) => `<h1>Privacy</h1>
<p class="legal-note">The German version is authoritative: <a href="https://lastsignals.de/datenschutz/" hreflang="de" lang="de">Datenschutz</a>. Last updated: ${DATE.en}.</p>
${sections([
  ['Controller', `<p>${addr('Germany')}<br>Phone: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>Email: ${mail}</p>`],
  ['In short', `<ul>
<li>No analytics, tracking or advertising services, no cookies. Fonts, scripts, images, videos and sounds come from our hosting at Netlify, not from third-party services.</li>
<li>Connections to Supabase (data in Frankfurt am Main, provider based in the USA) are made only for accounts, the callsign check, the hall of fame and multiplayer. Supabase sees your IP address in the process.</li>
<li>Without an account your save game stays only in your browser${APPS ? ' or in the app' : ''}.</li>
<li>With an account we store your email address, callsign, faction and save game with Supabase in Frankfurt am Main. We never see your password.</li>
<li>Callsign, faction, title and game stats are public (hall of fame, pilot list), never your email address or your save game.</li>
<li>Multiplayer chat messages go to the players in the channel via Supabase Realtime and are not stored by us.</li>
<li>Deletion at any time: a short email to ${mail} is enough.</li>
</ul>`],
  ['Hosting of the website and the browser game', `<p>The website and the browser game (at /play/) are hosted by Netlify, Inc. (USA). When you visit, Netlify processes technically required data: IP address, date and time, requested address, amount of data transferred, browser and operating system. This serves secure and stable operation (Art. 6(1)(f) GDPR). Netlify processes this data on our behalf (Art. 28 GDPR). Data may be transferred to the USA; the basis is the EU Standard Contractual Clauses provided by Netlify for this purpose (Art. 46(2)(c) GDPR). More: ${ext('https://www.netlify.com/privacy/', 'Netlify privacy')}.</p>`],
  ['App downloads (GitHub)', `${APPS ? '' : '<p>The apps are not published yet. Until then the download page links no files and makes no connection to GitHub. Once the files are available, the following applies:</p>'}<p>The app files for Mac, Windows, Android, iPhone and iPad ${APPS ? 'are' : 'will be'} attached to a release in our public repository at GitHub, Inc. (USA). When you click a file on the download page, your browser loads it directly from GitHub. GitHub processes technically required data such as IP address, time and browser identifier; data may be transferred to the USA. Nothing is sent to GitHub before you click. The legal basis is our interest in providing the files reliably (Art. 6(1)(f) GDPR). The ${ext('https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement', 'GitHub privacy statement')} also applies.</p>`],
  ['Account', `<p>An account is optional. You can create it in the game (title screen, “Create account”)${open || oauth.length ? ' or on the website' : ''}. For this we process:</p>
<ul>
<li>email address, for sign-in, the confirmation email and “forgot password”,</li>
<li>password: stored only as a hash at Supabase (irreversibly encrypted). We cannot read it,</li>
<li>callsign and faction, plus title and founding pilot status if any,</li>
<li>an account ID and the times of creation, confirmation and sign-in,</li>
<li>on sign-in the authentication service logs IP address and time for security.</li>
</ul>
<p>Publicly readable: the table <code>pilots</code> (account ID, callsign, faction, title and founding pilot status) can be read by anyone through the public database interface. The game and the website use it to show callsigns and to check whether a name is free. The account ID is a random string. Email address, password and save game are not in this table and are not public.</p>
<p>After creating the account you receive an email with a confirmation link. ${mailEn(mailer)} The legal basis is providing the account you requested (Art. 6(1)(b) GDPR).</p>
<p>The data is stored with Supabase, Inc. in a data center in the EU (Frankfurt am Main). Supabase processes it on our behalf (Art. 28 GDPR). ${SB_US.en} More: ${ext('https://supabase.com/privacy', 'Supabase privacy')}.</p>`],
  ['Server save game', `<p>If you play with an account, we also store your save game on the server (table <code>pilot_saves</code>) so you can continue on other devices. Stored are the complete save game (including callsign, faction, level, experience, honor, rank points, credits, tritium, ships, gear, ammo, drones, cargo, sector, quests and game statistics such as kills, deaths and play time), a version number, the kind of device with game version (for example “web”, “electron” or “capacitor”) and the time of the last save. Saving happens when docking, in the hub, every two minutes in flight and when leaving. The legal basis is Art. 6(1)(b) GDPR. The save game is also stored with Supabase in Frankfurt am Main.</p>`],
  ['Hall of fame', `<p>The hall of fame in the game and on the website publicly shows pilots with an account: callsign, faction, level, honor, experience and kills. Email addresses never appear. When you open the hall of fame page, your browser loads the list directly from Supabase (public database function <code>hall_of_fame</code>); your IP address is transferred to Supabase in the process. The legal basis for this request is our interest in showing the leaderboard you asked for (Art. 6(1)(f) GDPR). The hall of fame is part of the game you use with your account (Art. 6(1)(b) GDPR). Players without an account do not appear. If you do not want to be listed, write to us and we will delete the account or remove you from the list.</p>`],
  ['Multiplayer, chat and co-op', `<p>In multiplayer and co-op the game connects via Supabase Realtime to the other players in the same channel (sector, faction, all, co-op). This also works without an account. Transferred are:</p>
<ul>
<li>callsign, faction, level, ship, gear and hull and shield values,</li>
<li>position, heading and speed of your ship, hits, kills and co-op invitations,</li>
<li>a random session ID per flight,</li>
<li>chat messages with callsign and faction.</li>
</ul>
<p>This data goes to the players in the channel in real time and is not stored in a database. Chat messages are seen by everyone currently in the channel. What they do with them on their own device is beyond our control, so do not post personal information in chat. For the connection Supabase processes your IP address. The legal basis is Art. 6(1)(b) GDPR (the multiplayer feature you use). Supabase acts on our behalf here too (Art. 28 GDPR); possible access from the USA is covered as for the account (Standard Contractual Clauses).</p>`],
  ['Callsign check', '<p>When you type a callsign on the website or while creating an account in the game, the page asks Supabase in Frankfurt am Main whether it is still free (database function <code>callsign_available</code>). The name you entered and, for technical reasons, your IP address are transferred. The name is not stored. The legal basis is our interest in avoiding duplicate callsigns (Art. 6(1)(f) GDPR).</p>'],
  ['Other requests from the website to Supabase', `<ul>
<li>Sign-in status: only if a sign-in session is stored in your browser or you arrive via a confirmation link does the website load the sign-in function and ask Supabase for your pilot (callsign, faction, title) to show it in the header. Without a stored session this request does not happen.</li>
<li>Sign-in methods: only if sign-up on the website or with Google/Discord is enabled does the home page ask Supabase on load which sign-in methods are offered (address <code>/auth/v1/settings</code>). Only your IP address is transferred, no personal details.</li>
</ul>
<p>The legal basis is our interest in running the website with account features (Art. 6(1)(f) GDPR) or providing your account (Art. 6(1)(b) GDPR). Supabase processes the data on our behalf (Art. 28 GDPR).</p>`],
  open ? ['Securing a callsign on the website', '<p>If you secure your callsign on the website, we process your callsign, faction, email address and the time of sign-up and confirmation. The name is only secured once you click the link in the confirmation email (double opt-in). This creates the same account as in the game.</p>'] : null,
  oauth.length ? [`Sign-in with ${list(oauth.map((k) => k[0].toUpperCase() + k.slice(1)), 'or')}`, `<p>You can sign in with ${list(oauth.map((k) => PROV.en[k]), 'or')}. You are only redirected to the provider once you click the button. We then receive your account ID, your email address and, if shared, your name and profile picture. The legal basis is your consent (Art. 6(1)(a) GDPR). The policies of ${list(oauth.map((k) => ext(POL[k], k[0].toUpperCase() + k.slice(1))), 'and')} also apply.</p>`] : null,
  [APPS ? 'Storage in the browser and in the apps' : 'Storage in the browser', `<p>The website and the game set no cookies. In your browser’s storage (localStorage) we only keep what is needed for them to work. This data does not leave your device, except the save game when you play with an account (see above):</p>
${keyTable('en')}
<p>This is strictly necessary for the service you requested (§ 25(2) no. 2 TDDDG). The browser game also registers a service worker so it can be installed as an app. It caches nothing. You can delete all of this data in your browser at any time. Without an account your save game is gone afterwards.</p>`],
  [APPS ? 'Apps for Mac, Windows, Android, iPhone and iPad' : 'Apps for Mac, Windows, Android, iPhone and iPad (not published yet)', `<p>${APPS ? '' : 'The apps are not published yet. Once they are, the following applies: '}The apps contain the same game as the browser version and process the same data in the same way: save game and settings locally in the app, with an account also at Supabase, in multiplayer via Supabase Realtime. The apps contain no analytics, advertising or crash reporting services and no automatic update check. They are test versions outside the app stores.</p>`],
  ['Sound', '<p>Sounds and music on this website are generated directly in your browser. The game loads its sounds as files from our hosting at Netlify. In neither case is any data passed to third parties.</p>'],
  ['Links to social networks', '<p>The buttons for Discord, Instagram, TikTok and other channels are plain links. No data is sent to these providers before you click. After clicking, the provider’s own privacy policy applies.</p>'],
  ['Retention and deletion', `<p>We keep account data, the server save game and your hall of fame entry as long as your account exists. There is no delete button in the game yet. Until then, a short email to ${mail} with your account email address is enough; we then delete account, pilot and save game completely. Unconfirmed accounts are deleted once no longer needed. Multiplayer and chat data is not stored. You delete data in your browser yourself via your browser settings.</p>`],
  ['Contact', '<p>If you write to us, we process your details to answer your request (Art. 6(1)(b) and (f) GDPR) and delete them when no longer needed.</p>'],
  ['Your rights', '<p>You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and objection (Art. 21). You may withdraw consent at any time with effect for the future (Art. 7(3)). You may lodge a complaint with a supervisory authority (Art. 77). The competent authority is the Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, Germany.</p>'],
])}`;

export function legal(id, { reservationOpen = false, oauth = [], mail = '' } = {}) {
  const f = { open: !!reservationOpen, oauth: oauth.filter((k) => k === 'google' || k === 'discord'), mail: MAILER[mail] ? mail : '' };
  if (id === 'de-impressum') return IMPRESSUM;
  if (id === 'en-imprint') return IMPRINT;
  if (id === 'de-datenschutz') return DATENSCHUTZ(f);
  if (id === 'en-privacy') return PRIVACY(f);
  return '';
}
