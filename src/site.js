// Adressen und Seitenliste. Kanonische Adressen: Deutsch auf lastsignals.de, Englisch auf der internationalen Adresse.
export const SITE = {
  // Anmeldung und Google/Discord steuern jetzt Umgebungsvariablen und der Server selbst (siehe src/api.js):
  //   VITE_RESERVATION_OPEN=true  öffnet die Reservierung per E-Mail (erst mit eigenem Mailserver in Supabase, Double-Opt-in getestet).
  //   Google/Discord gelten als aktiv, sobald Supabase sie unter GET /auth/v1/settings meldet (beim Bauen und im Browser geprüft).
  de: 'https://lastsignals.de',
  en: 'https://lastsignals.online', // internationale Adresse (vorerst .online)
  play: 'https://play.lastsignals.de', // Spiel, sobald es öffentlich ist
  version: '0.1',
  status: 'test', // 'test' = Testphase, "Jetzt spielen" ohne Link; 'live' = Link auf SITE.play
};

// id, Sprache, Datei im Projekt, Pfad auf dieser Website, kanonischer Pfad auf der Sprach-Domain, Gegenstück
export const PAGES = [
  { id: 'de-home', lang: 'de', file: 'index.html', path: '/', canon: '/', alt: 'en-home' },
  { id: 'en-home', lang: 'en', file: 'en/index.html', path: '/en/', canon: '/', alt: 'de-home' },
  { id: 'de-news', lang: 'de', file: 'news/index.html', path: '/news/', canon: '/news/', alt: 'en-news' },
  { id: 'en-news', lang: 'en', file: 'en/news/index.html', path: '/en/news/', canon: '/news/', alt: 'de-news' },
  { id: 'de-wiki', lang: 'de', file: 'wiki/index.html', path: '/wiki/', canon: '/wiki/', alt: 'en-wiki' },
  { id: 'en-wiki', lang: 'en', file: 'en/wiki/index.html', path: '/en/wiki/', canon: '/wiki/', alt: 'de-wiki' },
  { id: 'de-hall', lang: 'de', file: 'ruhmeshalle/index.html', path: '/ruhmeshalle/', canon: '/ruhmeshalle/', alt: 'en-hall' },
  { id: 'en-hall', lang: 'en', file: 'en/hall-of-fame/index.html', path: '/en/hall-of-fame/', canon: '/hall-of-fame/', alt: 'de-hall' },
  { id: 'de-impressum', lang: 'de', file: 'impressum/index.html', path: '/impressum/', canon: '/impressum/', alt: 'en-imprint' },
  { id: 'de-datenschutz', lang: 'de', file: 'datenschutz/index.html', path: '/datenschutz/', canon: '/datenschutz/', alt: 'en-privacy' },
  { id: 'en-imprint', lang: 'en', file: 'en/imprint/index.html', path: '/en/imprint/', canon: '/imprint/', alt: 'de-impressum' },
  { id: 'en-privacy', lang: 'en', file: 'en/privacy/index.html', path: '/en/privacy/', canon: '/privacy/', alt: 'de-datenschutz' },
  { id: 'not-found', lang: 'de', file: '404.html', path: '/404.html', canon: null, alt: null },
];
export const pageById = (id) => PAGES.find((p) => p.id === id);
export const canonical = (p) => (p.canon ? SITE[p.lang] + p.canon : null);
// Pfad einer Seite auf dieser Website (für Links zwischen den Seiten)
export const pathOf = (id) => pageById(id)?.path || '/';

// Unterseiten je Sprache (Kopfleiste, Fußzeile)
export const PAGE_IDS = {
  de: { home: 'de-home', news: 'de-news', wiki: 'de-wiki', hall: 'de-hall', imprint: 'de-impressum', privacy: 'de-datenschutz' },
  en: { home: 'en-home', news: 'en-news', wiki: 'en-wiki', hall: 'en-hall', imprint: 'en-imprint', privacy: 'en-privacy' },
};

// Wie Links ausgegeben werden. 'dev': Pfade dieser Website (Englisch unter /en/).
// 'domains' (Produktions-Build): Deutsch auf lastsignals.de, Englisch auf lastsignals.online ohne /en/,
// Links in die andere Sprache absolut. So kostet kein Klick eine zusätzliche Weiterleitung.
let MODE = 'dev';
export const setLinkMode = (m) => { MODE = m === 'domains' ? 'domains' : 'dev'; };
export const linkMode = () => MODE;
// Link auf Seite id von einer Seite der Sprache fromLang aus (fromLang null = immer absolut im Produktions-Build)
export function href(id, fromLang) {
  const p = pageById(id);
  if (!p) return '/';
  if (MODE === 'dev') return p.path;
  return p.lang === fromLang ? p.canon : SITE[p.lang] + p.canon;
}
