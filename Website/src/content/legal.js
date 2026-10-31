// Impressum und Datenschutz. Angaben aus Planung/IMPRESSUM.md (Toni, 30.10.2026).
// Bei Änderungen an Anbieter, Hosting oder Anmeldung diese Datei anpassen.
// Der Text nennt nur, was wirklich passiert. Was aktiv ist, kommt beim Bauen aus vite.config.js:
//   open  = Reservierung per E-Mail offen (VITE_RESERVATION_OPEN=true)
//   oauth = Google/Discord, die Supabase gerade meldet (GET /auth/v1/settings). Abschnitt erscheint erst dann.

const OP = {
  name: '077 GAMING', owner: 'Antonio Geske', street: 'Tiedexer Tor 8B', city: '37574 Einbeck',
  phone: '+49 179 2275656', phoneHref: '+491792275656', mail: 'support@077-gaming.de',
};
const DATE = { de: '30. Oktober 2026', en: '30 October 2026' };
const addr = (country) => `${OP.name}<br>${OP.owner}<br>${OP.street}<br>${OP.city}<br>${country}`;
const mail = `<a href="mailto:${OP.mail}">${OP.mail}</a>`;
const ext = (href, label) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const PROV = {
  de: { google: 'Google (Google Ireland Limited, Irland)', discord: 'Discord (Discord Inc., USA)' },
  en: { google: 'Google (Google Ireland Limited, Ireland)', discord: 'Discord (Discord Inc., USA)' },
};
const POL = { google: 'https://policies.google.com/privacy', discord: 'https://discord.com/privacy' };
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
<p>Diese Website enthält Links zu Websites Dritter, etwa zu unseren Kanälen auf Instagram und TikTok. Für deren Inhalte sind ausschließlich die jeweiligen Anbieter verantwortlich.</p>`;

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
<p>This website links to third-party websites, such as our channels on Instagram and TikTok. Their providers alone are responsible for their content.</p>`;

const DATENSCHUTZ = ({ open, oauth, acct = open || oauth.length > 0 }) => `<h1>Datenschutz</h1>
<p>Stand: ${DATE.de}</p>
${sections([
  ['Verantwortlicher', `<p>${addr('Deutschland')}<br>Telefon: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>E-Mail: ${mail}</p>`],
  ['Kurz gesagt', `<p>Diese Website nutzt keine Analyse-, Tracking- oder Werbedienste und lädt keine Schriften, Skripte oder Bilder von fremden Servern. Daten verarbeiten wir nur, wenn du die Website aufrufst (Server-Protokolle)${acct ? ', einen Rufnamen reservierst oder dich anmeldest' : ' oder prüfst, ob ein Rufname frei ist'}.</p>`],
  ['Hosting und Server-Protokolle', `<p>Die Website wird bei Netlify, Inc. (USA) gehostet. Beim Aufruf verarbeitet Netlify technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, übertragene Datenmenge, Browser und Betriebssystem. Das dient dem sicheren und stabilen Betrieb (Art. 6 Abs. 1 lit. f DSGVO). Netlify verarbeitet diese Daten in unserem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO). Dabei können Daten in die USA übermittelt werden; Grundlage sind die von Netlify dafür vorgesehenen EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO). Mehr: ${ext('https://www.netlify.com/privacy/', 'Datenschutz bei Netlify')}.</p>`],
  ['Rufname prüfen', `<p>Tippst du einen Rufnamen ein, fragt die Website bei unserem Server nach, ob er noch frei ist. Dabei wird nur der eingegebene Name übertragen und nicht gespeichert. Der Server liegt bei Supabase, Inc. in einem Rechenzentrum in der EU (Frankfurt am Main) und arbeitet in unserem Auftrag (Art. 28 DSGVO). Rechtsgrundlage ist unser Interesse, dir vor der Reservierung zu zeigen, ob ein Name frei ist (Art. 6 Abs. 1 lit. f DSGVO).</p>`],
  open || oauth.length ? ['Rufnamen reservieren und Konto', `<p>Wenn du einen Rufnamen reservierst, verarbeiten wir Rufname, Fraktion, E-Mail-Adresse und den Zeitpunkt der Reservierung und Bestätigung. Daraus entsteht dein Konto für Website, Wiki, Pilotenprofil und später das Spiel. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) und die Anbahnung des Nutzungsverhältnisses (Art. 6 Abs. 1 lit. b DSGVO). Rufname, Fraktion und Gründungspilot-Status können später in Pilotenprofilen und Bestenlisten öffentlich sichtbar sein, deine E-Mail-Adresse nie.</p>
<p>Die Daten liegen bei Supabase, Inc. in einem Rechenzentrum in der EU (Frankfurt am Main). Supabase verarbeitet diese Daten in unserem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO). Mehr: ${ext('https://supabase.com/privacy', 'Datenschutz bei Supabase')}.</p>
<p>Wir speichern die Daten, bis du dein Konto löschen lässt oder deine Einwilligung widerrufst. Nicht bestätigte Anmeldungen löschen wir, sobald sie nicht mehr gebraucht werden. Eine kurze E-Mail an ${mail} genügt.</p>`] : ['Reservierung', `<p>Die Reservierung von Rufnamen ist noch nicht geöffnet. Bis dahin speichern wir keine Namen und keine E-Mail-Adressen. Sobald sie öffnet, steht hier, welche Daten wir wofür verarbeiten.</p>`],
  open ? ['Bestätigungsmail (Double-Opt-in)', `<p>Nach dem Absenden bekommst du eine E-Mail mit einem Bestätigungslink. Erst der Klick darauf sichert deinen Rufnamen. So stellen wir sicher, dass niemand fremde Adressen einträgt. Wir speichern dafür den Zeitpunkt von Anmeldung und Bestätigung. Die E-Mail wird über den Anmeldedienst von Supabase verschickt.</p>`] : null,
  oauth.length ? [`Anmeldung mit ${list(oauth.map((k) => k[0].toUpperCase() + k.slice(1)), 'oder')}`, `<p>Du kannst dich wahlweise mit ${list(oauth.map((k) => PROV.de[k]), 'oder')} anmelden. Erst wenn du den jeweiligen Knopf anklickst, wirst du zum Anbieter weitergeleitet. Wir erhalten dann deine Konto-Kennung, deine E-Mail-Adresse und, falls freigegeben, Name und Profilbild. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Es gelten zusätzlich die Hinweise von ${list(oauth.map((k) => ext(POL[k], k[0].toUpperCase() + k.slice(1))), 'und')}.</p>`] : null,
  ['Speicherung im Browser', `<p>Die Website setzt keine Cookies. Im Speicher deines Browsers (localStorage) legen wir nur ab, was für die Funktion nötig ist: deine Fraktionswahl${acct ? ', eine noch nicht bestätigte Reservierung und, wenn du angemeldet bist, deine Anmeldesitzung' : ''}. Das ist für den von dir gewünschten Dienst unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst diese Daten jederzeit in deinem Browser löschen.</p>`],
  ['Ton', '<p>Klänge und Musik der Website werden direkt in deinem Browser erzeugt. Dafür werden keine Daten übertragen.</p>'],
  ['Links zu sozialen Netzwerken', '<p>Die Knöpfe zu Instagram, TikTok, Discord und weiteren Kanälen sind einfache Links. Vor dem Anklicken werden keine Daten an diese Anbieter übertragen. Nach dem Anklicken gelten die Datenschutzhinweise des jeweiligen Anbieters.</p>'],
  ['Kontakt', '<p>Schreibst du uns, verarbeiten wir deine Angaben, um die Anfrage zu beantworten (Art. 6 Abs. 1 lit. b und f DSGVO), und löschen sie, wenn sie nicht mehr nötig sind.</p>'],
  ['Deine Rechte', '<p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Eine Einwilligung kannst du jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3). Du kannst dich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77). Zuständig ist die Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover.</p>'],
])}`;

const PRIVACY = ({ open, oauth, acct = open || oauth.length > 0 }) => `<h1>Privacy</h1>
<p class="legal-note">The German version is authoritative: <a href="https://lastsignals.de/datenschutz/" hreflang="de" lang="de">Datenschutz</a>. Last updated: ${DATE.en}.</p>
${sections([
  ['Controller', `<p>${addr('Germany')}<br>Phone: <a href="tel:${OP.phoneHref}">${OP.phone}</a><br>Email: ${mail}</p>`],
  ['In short', `<p>This website uses no analytics, tracking or advertising services and loads no fonts, scripts or images from third-party servers. We only process data when you visit (server logs)${acct ? ', reserve a callsign or sign in' : ' or check whether a callsign is free'}.</p>`],
  ['Hosting and server logs', `<p>The website is hosted by Netlify, Inc. (USA). When you visit, Netlify processes technically required data: IP address, date and time, requested address, amount of data transferred, browser and operating system. This serves secure and stable operation (Art. 6(1)(f) GDPR). Netlify processes this data on our behalf (processing under Art. 28 GDPR). Data may be transferred to the USA; the basis is the EU Standard Contractual Clauses provided by Netlify for this purpose (Art. 46(2)(c) GDPR). More: ${ext('https://www.netlify.com/privacy/', 'Netlify privacy')}.</p>`],
  ['Callsign check', '<p>When you type a callsign, the website asks our server whether it is still free. Only the name you entered is sent, and it is not stored. The server is run by Supabase, Inc. in a data center in the EU (Frankfurt am Main) on our behalf (Art. 28 GDPR). The legal basis is our interest in showing you whether a name is free before you reserve it (Art. 6(1)(f) GDPR).</p>'],
  open || oauth.length ? ['Callsign reservation and account', `<p>When you reserve a callsign we process your callsign, faction, email address and the time of reservation and confirmation. This becomes your account for the website, wiki, pilot profile and later the game. The legal basis is your consent (Art. 6(1)(a) GDPR) and preparing the user relationship (Art. 6(1)(b) GDPR). Callsign, faction and founding pilot status may later be public on pilot profiles and leaderboards, your email address never.</p>
<p>The data is stored with Supabase, Inc. in a data center in the EU (Frankfurt am Main). Supabase processes this data on our behalf (processing under Art. 28 GDPR). More: ${ext('https://supabase.com/privacy', 'Supabase privacy')}.</p>
<p>We keep the data until you ask us to delete your account or withdraw your consent. Unconfirmed sign-ups are deleted once no longer needed. A short email to ${mail} is enough.</p>`] : ['Reservation', '<p>Callsign reservations are not open yet. Until then we store no names and no email addresses. Once they open, this section will state which data we process and why.</p>'],
  open ? ['Confirmation email (double opt-in)', '<p>After submitting you get an email with a confirmation link. Your callsign is only secured once you click it. This ensures nobody registers someone else’s address. We store the time of sign-up and confirmation for this purpose. The email is sent through the Supabase authentication service.</p>'] : null,
  oauth.length ? [`Sign-in with ${list(oauth.map((k) => k[0].toUpperCase() + k.slice(1)), 'or')}`, `<p>You can sign in with ${list(oauth.map((k) => PROV.en[k]), 'or')}. You are only redirected to the provider once you click the button. We then receive your account ID, your email address and, if shared, your name and profile picture. The legal basis is your consent (Art. 6(1)(a) GDPR). The policies of ${list(oauth.map((k) => ext(POL[k], k[0].toUpperCase() + k.slice(1))), 'and')} also apply.</p>`] : null,
  ['Browser storage', `<p>This website sets no cookies. In your browser’s storage (localStorage) we only keep what is needed for it to work: your faction choice${acct ? ', an unconfirmed reservation and, when you are signed in, your session' : ''}. This is strictly necessary for the service you requested (§ 25(2) no. 2 TDDDG). You can delete this data in your browser at any time.</p>`],
  ['Sound', '<p>Sounds and music on this website are generated directly in your browser. No data is transferred for this.</p>'],
  ['Links to social networks', '<p>The buttons for Instagram, TikTok, Discord and other channels are plain links. No data is sent to these providers before you click. After clicking, the provider’s own privacy policy applies.</p>'],
  ['Contact', '<p>If you write to us, we process your details to answer your request (Art. 6(1)(b) and (f) GDPR) and delete them when no longer needed.</p>'],
  ['Your rights', '<p>You have the right of access (Art. 15 GDPR), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20) and objection (Art. 21). You may withdraw consent at any time with effect for the future (Art. 7(3)). You may lodge a complaint with a supervisory authority (Art. 77). The competent authority is the Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover, Germany.</p>'],
])}`;

export function legal(id, { reservationOpen = false, oauth = [] } = {}) {
  const f = { open: !!reservationOpen, oauth: oauth.filter((k) => k === 'google' || k === 'discord') };
  if (id === 'de-impressum') return IMPRESSUM;
  if (id === 'en-imprint') return IMPRINT;
  if (id === 'de-datenschutz') return DATENSCHUTZ(f);
  if (id === 'en-privacy') return PRIVACY(f);
  return '';
}
