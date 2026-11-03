// Spielinhalte für Startseite, Schiffs-Galerie und Welt-Seite.
// Zahlen kommen direkt aus Code/src/core/data.js (SHIPS, ENEMIES, sectorsFor), damit die Website nie vom Spiel abweicht.
// Bilder: echte Aufnahmen aus dem Spiel (HUD aus) und Standbilder der Spielmodelle, Maße in media.js.

import { SHIPS, ENEMIES, sectorsFor } from '../../Code/src/core/data.js';
import { IMG } from './media.js';
import { RELEASE } from './downloads.js';

// Apps erst als verfügbar nennen, wenn das GitHub-Release mit den Dateien veröffentlicht ist
const APPS = RELEASE.published;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
export const FXC = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };
const FXN = { europa: 'EUROPA', saturn: 'SATURN', eris: 'ERIS' };
const FX_LIST = ['europa', 'saturn', 'eris'];
const num = (n, lang) => Number(n).toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');

// Schiffe 4, 6 und 7: Werte vorläufig zwischen den Nachbarschiffen gesetzt (Kommentar in data.js, 02.11.2026)
const PROVISIONAL = new Set(['s4', 's6', 's7']);
export const SHIP_IDS = Object.keys(SHIPS); // s1 … s8
export const shipModel = (f, id) => `/models/${f}-${id === 's1' ? 'starter' : 'schiff' + id.slice(1)}.glb`;
const shipImg = (f, id) => `schiffe/${f}-${id.slice(1)}`;

// ---------- Bilder ----------
// <picture> mit AVIF und WebP in allen vorhandenen Breiten
export function pic(key, alt, { sizes = '100vw', cls = '', eager = false, high = false, imgCls = '' } = {}) {
  const d = IMG[key];
  if (!d) return '';
  const [dir, name] = key.split('/');
  const widths = d.widths || { spiel: [640, 1280, 1920, 2560], schiffe: [480, 960], gegner: [360, 720], stationen: [480, 960] }[dir].filter((w) => w <= d.max);
  const set = (ext) => widths.map((w) => `/img/${dir}/${name}-${w}.${ext} ${Math.min(w, d.w) === w ? w : d.w}w`).join(', ');
  const mid = widths[Math.min(1, widths.length - 1)];
  return `<picture${cls ? ` class="${cls}"` : ''}>
    <source type="image/avif" srcset="${set('avif')}" sizes="${sizes}">
    <source type="image/webp" srcset="${set('webp')}" sizes="${sizes}">
    <img${imgCls ? ` class="${imgCls}"` : ''} src="/img/${dir}/${name}-${mid}.webp" alt="${esc(alt)}" width="${d.w}" height="${d.h}" ${eager ? '' : 'loading="lazy" '}decoding="async"${high ? ' fetchpriority="high"' : ''}>
  </picture>`;
}

// ---------- Texte ----------
export const G = {
  de: {
    hero: {
      play: 'Im Browser spielen', download: 'Herunterladen', discord: 'Discord',
      sub: 'Kostenloses Weltraum-MMO. Wähle eine von drei Mächten, fliege acht Schiffsklassen und kämpfe dich durch acht Sektoren deiner Heimat. ' + (APPS ? 'Im Browser oder als App.' : 'Direkt im Browser, Apps folgen.'),
      trust: APPS ? 'Kostenlos · Im Browser ohne Installation · Apps als Testversion' : 'Kostenlos · Im Browser ohne Installation · Apps folgen',
      ogAlt: 'Ein SATURN-Schiff der Klasse Leviathan vor der SATURN-Station, Aufnahme aus dem Spiel. Daneben LAST SIGNALS: Die Erde schweigt. Du nicht.',
      video: 'Spielszene aus der Testversion: ein SATURN-Schiff der Klasse Leviathan feuert vor der Heimatstation und dem Saturn auf Larven des Schwarms.',
      pause: 'Video anhalten', resume: 'Video abspielen',
    },
    feat: {
      label: 'Was es heute gibt',
      list: [
        ['8', 'Sektoren je Fraktion', 'Stufe 1 bis 40, drei Bosse in der Tiefe'],
        ['1–8', 'Schiffsklassen', 'Acht Klassen, jede Fraktion mit eigenen Modellen'],
        ['2+', 'Koop & Mehrspieler', 'Gemeinsame Sektoren, Chat, Einladung zu zweit'],
        ['PAD', 'Controller', 'Flug, Kampf und Menüs mit dem Gamepad'],
        APPS ? ['APP', 'Apps', 'Mac, Windows, Android, iPhone und iPad'] : ['WEB', 'Im Browser', 'Ohne Installation · Apps folgen'],
      ],
    },
    shots: {
      code: 'IMG', label: 'Aus dem Spiel', title: 'Echte Bilder. Kein Rendertrailer.',
      lede: 'Alle Bilder sind Aufnahmen aus der aktuellen Testversion im Browser, nur die Anzeigen sind ausgeblendet.',
      list: [
        ['spiel/kampf-saturn', 'Kampf', 'SATURN-Schiff 5 im Gefecht mit Piraten, Schild aktiv'],
        ['spiel/flug-eris', 'Flug', 'ERIS-Schiff 7 im Heimatsektor'],
        ['spiel/station-europa', 'Station', 'Station EUROPA mit Andockring'],
        ['spiel/cockpit-europa', 'Cockpit', 'Blick aus dem Cockpit, Instrumente der EUROPA'],
        ['spiel/feld-europa', 'Asteroidenfeld', 'EUROPA-Schiff 2 im Asteroidenfeld vor Jupiter'],
        ['spiel/tor-saturn', 'Sprungtor', 'Sprungtor im Saturn-Sektor'],
      ],
      more: 'Alle Schiffe ansehen', world: 'Welt, Gegner und Bosse',
    },
    ships: {
      title: 'Schiffe', kicker: 'Hangar · 8 Klassen je Fraktion',
      lede: 'Jede Fraktion fliegt eigene Modelle. Die Werte sind für alle drei Fraktionen gleich, nur das Aussehen unterscheidet sich. Alle Zahlen stammen direkt aus den Spieldaten.',
      viewer: '3D-Ansicht', faction: 'Fraktion', classes: 'Klassen',
      help: 'Ziehen zum Drehen · Mausrad oder zwei Finger zum Zoomen · Pfeiltasten und + / −',
      load: '3D-Modell laden', loading: 'Lade Modell …', noGl: 'Dein Browser zeigt kein 3D. Hier siehst du das Standbild des Modells.',
      cls: 'Klasse', level: 'Ab Stufe', hp: 'Hülle', speed: 'Tempo', lasers: 'Laserplätze', gens: 'Generatorplätze', cargo: 'Laderaum', price: 'Preis',
      cur: { credits: 'Credits', tritium: 'Tritium', free: 'Startschiff' },
      prov: 'vorläufig', provNote: 'Halberd, Rampart und Monarch (Schiff 4, 6 und 7): Klassenname, Hülle, Tempo, Laderaum und Preis sind vorläufig gesetzt und können sich bis zur Freigabe ändern.',
      table: 'Alle Klassen im Vergleich', all: 'Alle 24 Modelle',
      special: 'Sonderschiffe Heiler, Tank und Späher ab Stufe 40 sind geplant und noch nicht im Spiel.',
      starter: 'Startschiff', ship: 'Schiff',
      alt: (f, n) => `${FXN[f]} ${n}, Standbild des Spielmodells`,
    },
    world: {
      title: 'Welt', kicker: 'Fraktionen · Sektoren · Gegner · Bosse',
      lede: 'Drei Heimaten mit je acht Sektoren, von der Station bis zum Boss in der Tiefe. Alle Gegner und Werte stammen direkt aus den Spieldaten.',
      jump: [['fraktionen', 'Fraktionen'], ['sektoren', 'Sektorleiter'], ['gegner', 'Gegner'], ['bosse', 'Bosse']],
      fac: 'Fraktionen', facLede: 'Gleiche Werte, gleiche Chancen. Jede Fraktion hat ihre eigene Station, eigene Schiffe und eigene Sektoren.',
      leader: 'Anführung', motto: 'Leitsatz', home: 'Heimat',
      ladder: 'Sektorleiter 1–8', ladderLede: 'Sektor 1 hat die Station. Ab Sektor 6 wartet je ein Boss. Wie im Spiel tragen alle drei Heimaten dieselben Gegner, nur Namen und Kulisse ändern sich.',
      mpNote: 'Im Mehrspieler bleibt Sektor 1 je Fraktion getrennt (sichere Station). Ab Sektor 2 treffen sich Piloten aller Fraktionen im selben Raum.',
      sector: 'Sektor', name: 'Name', lvl: 'Stufe', foes: 'Gegner', station: 'Station', boss: 'Boss',
      enemies: 'Gegner', enemiesLede: 'Zwei Gruppen: Piraten und der Schwarm. Bild: das Modell aus dem Spiel. Wo das eigene Modell noch nicht fertig ist, zeigen wir keins.',
      group: { pirate: 'Piraten', swarm: 'Schwarm' },
      beh: { aggressive: 'Greift an, sobald du in Reichweite bist', territorial: 'Verteidigt sein Gebiet', opportunist: 'Lauert und schlägt zu, wenn du angeschlagen bist', thief: 'Plündert Wracks, kämpft wenn nötig', passive: 'Greift erst an, wenn du angreifst', nest: 'Steht still und spuckt Larven' },
      from: 'ab Stufe', shield: 'Schild', hull: 'Hülle', where: 'Sektor', event: 'nur im Ereignis „Schwarm-Nest“',
      bosses: 'Bosse', bossLede: 'Drei Bosse in den tiefen Sektoren. Nach dem Abschuss kommen sie nach einer festen Zeit wieder.',
      respawn: 'Kehrt zurück nach', min: 'min', brood: (n) => `Ruft laufend ${n} zur Verstärkung`, regen: 'Heilt sich selbst',
      bossName: { werft: 'Schwarze Werft', wal: 'Sternenwal-Ältester', dread: 'Dreadnought' },
      shotAlt: (n) => `${n} im Kampf, Aufnahme aus dem Spiel`,
      modelAlt: (n) => `${n}, Modell aus dem Spiel`, noImg: 'Modellbild folgt',
      stationAlt: (f) => `Station ${FXN[f]}, Aufnahme aus dem Spiel`,
    },
    nav: { ships: 'Schiffe', world: 'Welt', account: 'Konto', play: 'Spielen' },
    meta: {
      ships: 'Alle acht Schiffsklassen von LAST SIGNALS je Fraktion in 3D: Hülle, Tempo, Laser- und Generatorplätze, Laderaum und Preis direkt aus den Spieldaten.',
      world: 'Fraktionen, Sektorleiter 1 bis 8, Piraten, Schwarm und Bosse von LAST SIGNALS. Mit Bildern aus dem Spiel und Werten aus den Spieldaten.',
      download: APPS ? 'LAST SIGNALS als Testversion für Mac, Windows, Android, iPhone und iPad herunterladen oder sofort im Browser spielen.' : 'LAST SIGNALS sofort im Browser spielen. Apps für Mac, Windows, Android, iPhone und iPad folgen als Testversion.',
      wiki: 'Wiki-Vorschau von LAST SIGNALS: Sektoren, Gebiete, Währungen, Laser, Munition, Generatoren und Ränge.',
      news: 'Entwicklungslogbuch und Patchnotes von LAST SIGNALS.',
      hall: 'Ruhmeshalle von LAST SIGNALS: Bestenliste der Piloten mit Konto nach Ehre, Erfahrung, Abschüssen und Stufe.',
      impressum: 'Impressum von LAST SIGNALS (077 GAMING).',
      datenschutz: 'Datenschutzerklärung von LAST SIGNALS: Konto, Spielstand, Ruhmeshalle, Mehrspieler, Apps und Hosting.',
    },
  },
  en: {
    hero: {
      play: 'Play in browser', download: 'Download', discord: 'Discord',
      sub: 'Free-to-play space MMO. Pick one of three powers, fly eight ship classes and fight through eight sectors of your home. ' + (APPS ? 'In your browser or as an app.' : 'Right in your browser, apps to follow.'),
      trust: 'Free · Runs in the browser · Game currently in German',
      ogAlt: 'A SATURN Leviathan-class ship in front of the SATURN station, captured in the game. Next to it LAST SIGNALS: Earth went silent. You won’t.',
      video: 'Gameplay from the test version: a SATURN Leviathan-class ship fires on Swarm larvae in front of its home station and Saturn.',
      pause: 'Pause video', resume: 'Play video',
    },
    feat: {
      label: 'What is in the game today',
      list: [
        ['8', 'Sectors per faction', 'Level 1 to 40, three bosses in the deep'],
        ['1–8', 'Ship classes', 'Eight classes, each faction with its own models'],
        ['2+', 'Co-op & multiplayer', 'Shared sectors, chat, invite a wingmate'],
        ['PAD', 'Controller', 'Flight, combat and menus on a gamepad'],
        APPS ? ['APP', 'Apps', 'Mac, Windows, Android, iPhone and iPad'] : ['WEB', 'In the browser', 'No install · apps to follow'],
      ],
    },
    shots: {
      code: 'IMG', label: 'From the game', title: 'Real footage. No render trailer.',
      lede: 'Every image is captured from the current test version in the browser, only the HUD is hidden.',
      list: [
        ['spiel/kampf-saturn', 'Combat', 'SATURN ship 5 fighting pirates, shield up'],
        ['spiel/flug-eris', 'Flight', 'ERIS ship 7 in its home sector'],
        ['spiel/station-europa', 'Station', 'EUROPA station with docking ring'],
        ['spiel/cockpit-europa', 'Cockpit', 'Cockpit view, EUROPA instruments'],
        ['spiel/feld-europa', 'Asteroid field', 'EUROPA ship 2 in an asteroid field near Jupiter'],
        ['spiel/tor-saturn', 'Jump gate', 'Jump gate in a Saturn sector'],
      ],
      more: 'See all ships', world: 'World, enemies and bosses',
    },
    ships: {
      title: 'Ships', kicker: 'Hangar · 8 classes per faction',
      lede: 'Each faction flies its own models. Stats are the same for all three factions, only the look differs. All numbers come straight from the game data.',
      viewer: '3D view', faction: 'Faction', classes: 'Classes',
      help: 'Drag to rotate · mouse wheel or two fingers to zoom · arrow keys and + / −',
      load: 'Load 3D model', loading: 'Loading model …', noGl: 'Your browser cannot show 3D. This is a still of the model.',
      cls: 'Class', level: 'From level', hp: 'Hull', speed: 'Speed', lasers: 'Laser slots', gens: 'Generator slots', cargo: 'Cargo', price: 'Price',
      cur: { credits: 'credits', tritium: 'tritium', free: 'Starter ship' },
      prov: 'provisional', provNote: 'Halberd, Rampart and Monarch (ships 4, 6 and 7): class name, hull, speed, cargo and price are provisional and may change before release.',
      table: 'All classes compared', all: 'All 24 models',
      special: 'Special ships healer, tank and scout from level 40 are planned and not in the game yet.',
      starter: 'Starter', ship: 'Ship',
      alt: (f, n) => `${FXN[f]} ${n}, still of the in-game model`,
    },
    world: {
      title: 'World', kicker: 'Factions · Sectors · Enemies · Bosses',
      lede: 'Three homes with eight sectors each, from the station down to the boss in the deep. All enemies and numbers come straight from the game data.',
      jump: [['factions', 'Factions'], ['sectors', 'Sector ladder'], ['enemies', 'Enemies'], ['bosses', 'Bosses']],
      fac: 'Factions', facLede: 'Same stats, same chances. Each faction has its own station, its own ships and its own sectors.',
      leader: 'Leader', motto: 'Motto', home: 'Home',
      ladder: 'Sector ladder 1–8', ladderLede: 'Sector 1 holds the station. From sector 6 on, each sector has a boss. As in the game, all three homes share the same enemies, only names and scenery change.',
      mpNote: 'In multiplayer, sector 1 stays separate per faction (safe station). From sector 2 on, pilots of all factions meet in the same space.',
      sector: 'Sector', name: 'Name', lvl: 'Level', foes: 'Enemies', station: 'Station', boss: 'Boss',
      enemies: 'Enemies', enemiesLede: 'Two groups: pirates and the swarm. Image: the in-game model. Where a model is not finished yet, we show none.',
      group: { pirate: 'Pirates', swarm: 'Swarm' },
      beh: { aggressive: 'Attacks once you are in range', territorial: 'Defends its territory', opportunist: 'Lurks and strikes when you are hurt', thief: 'Loots wrecks, fights when needed', passive: 'Only attacks when you do', nest: 'Stays put and spits out larvae' },
      from: 'from level', shield: 'Shield', hull: 'Hull', where: 'Sector', event: 'only in the “Swarm Nest” event',
      bosses: 'Bosses', bossLede: 'Three bosses in the deep sectors. After a kill they return after a fixed time.',
      respawn: 'Returns after', min: 'min', brood: (n) => `Keeps calling ${n} as reinforcements`, regen: 'Heals itself',
      bossName: { werft: 'Black Shipyard', wal: 'Elder Star Whale', dread: 'Dreadnought' },
      shotAlt: (n) => `${n} in combat, in-game capture`,
      modelAlt: (n) => `${n}, in-game model`, noImg: 'Model image to follow',
      stationAlt: (f) => `${FXN[f]} station, in-game capture`,
    },
    nav: { ships: 'Ships', world: 'World', account: 'Account', play: 'Play' },
    meta: {
      ships: 'All eight LAST SIGNALS ship classes per faction in 3D: hull, speed, laser and generator slots, cargo and price straight from the game data.',
      world: 'Factions, sector ladder 1 to 8, pirates, swarm and bosses of LAST SIGNALS. With in-game images and numbers from the game data.',
      download: APPS ? 'Download LAST SIGNALS as a test version for Mac, Windows, Android, iPhone and iPad, or play right away in your browser.' : 'Play LAST SIGNALS right away in your browser. Test versions of the apps for Mac, Windows, Android, iPhone and iPad will follow.',
      wiki: 'LAST SIGNALS wiki preview: sectors, regions, currencies, lasers, ammo, generators and ranks.',
      news: 'LAST SIGNALS development log and patch notes.',
      hall: 'LAST SIGNALS hall of fame: leaderboard of pilots with an account by honor, experience, kills and level.',
      imprint: 'Legal notice of LAST SIGNALS (077 GAMING).',
      privacy: 'LAST SIGNALS privacy policy: account, save game, hall of fame, multiplayer, apps and hosting.',
    },
  },
};

// ---------- Startseite: Bewegtbild im Hero und Merkmale ----------
// Schlüsselbild: Breitbild (2560 px, Schiff rechts neben dem Text) und eigener Hochformat-Ausschnitt fürs Handy
const set = (name, ws, ext) => ws.map((w) => `/img/spiel/${name}-${w}.${ext} ${w}w`).join(', ');
export const HERO_WIDE = [640, 1280, 1920, 2560], HERO_TALL = [540, 1080], HERO_PHONE = '(max-width: 720px)';
export function heroVideo(lang) {
  const g = G[lang].hero;
  return `<div class="hero-film" data-film>
  <video class="hero-video" muted loop playsinline preload="none" data-src-webm="/media/hero-loop.webm" data-src-mp4="/media/hero-loop.mp4" aria-hidden="true" tabindex="-1" disablepictureinpicture></video>
  <picture class="hero-still">
    <source media="${HERO_PHONE}" type="image/avif" srcset="${set('hero-tall', HERO_TALL, 'avif')}" sizes="100vw">
    <source media="${HERO_PHONE}" type="image/webp" srcset="${set('hero-tall', HERO_TALL, 'webp')}" sizes="100vw">
    <source type="image/avif" srcset="${set('hero', HERO_WIDE, 'avif')}" sizes="100vw">
    <source type="image/webp" srcset="${set('hero', HERO_WIDE, 'webp')}" sizes="100vw">
    <img src="/img/spiel/hero-1920.webp" alt="${esc(g.video)}" width="2560" height="1440" decoding="async" fetchpriority="high">
  </picture>
  <div class="hero-film-shade" aria-hidden="true"></div>
</div>`;
}
export function heroFilmBtn(lang) {
  const g = G[lang].hero;
  return `<button class="film-btn" type="button" data-film-btn hidden aria-pressed="false" data-pause="${esc(g.pause)}" data-resume="${esc(g.resume)}" aria-label="${esc(g.pause)}"><span class="fb-pause" aria-hidden="true"><i></i><i></i></span><span class="fb-play" aria-hidden="true"></span></button>`;
}

export function features(lang) {
  const f = G[lang].feat;
  return `<div class="feat" aria-label="${esc(f.label)}"><p class="ls-label feat-l">${esc(f.label)}</p><ul class="feat-list">${f.list.map(([k, a, b]) => `<li><span class="feat-k ls-num">${esc(k)}</span><span class="feat-t"><b>${esc(a)}</b><span>${esc(b)}</span></span></li>`).join('')}</ul></div>`;
}

export function shotsSection(lang, links) {
  const s = G[lang].shots;
  const [first, ...rest] = s.list;
  const fig = ([k, tag, cap], big) => `<figure class="shot${big ? ' is-big' : ''}">
      ${pic(k, cap, { sizes: big ? '(max-width: 900px) 100vw, 66vw' : '(max-width: 900px) 100vw, 33vw' })}
      <figcaption><span class="ls-label">${esc(tag)}</span>${esc(cap)}</figcaption>
    </figure>`;
  return `<section class="sec ch ch-shots" id="${lang === 'de' ? 'bilder' : 'gallery'}" aria-labelledby="shots-h">
  <div class="wrap">
    <header class="sec-head rv">
      <p class="sec-code"><span class="ls-num">${esc(s.code)}</span><span>${esc(s.label)}</span><i class="ls-tick" aria-hidden="true"></i></p>
      <h2 id="shots-h">${esc(s.title)}</h2>
      <p class="sec-lede">${esc(s.lede)}</p>
    </header>
    <div class="shots rv">${fig(first, true)}${rest.map((x) => fig(x, false)).join('')}</div>
    <div class="shots-act rv"><a class="ls-btn is-big" href="${links.ships}">${esc(s.more)}</a><a class="ls-btn is-big" href="${links.world}">${esc(s.world)}</a></div>
  </div>
</section>`;
}

// ---------- Schiffs-Galerie ----------
function shipStats(id, lang) {
  const s = SHIPS[id], t = G[lang].ships;
  const prov = PROVISIONAL.has(id);
  const p = (v) => v; // vorläufige Schiffe: ein Sternchen am Namen statt an jedem Wert
  const price = s.currency ? `<span class="ls-num">${num(s.price, lang)}</span> ${esc(t.cur[s.currency])}` : esc(t.cur.free);
  return `<dl class="sg-dl">
    <div><dt>${esc(t.cls)}</dt><dd>${p(esc(s.cls))}</dd></div>
    <div><dt>${esc(t.level)}</dt><dd class="ls-num">${s.level}</dd></div>
    <div><dt>${esc(t.hp)}</dt><dd>${p(`<span class="ls-num">${num(s.hp, lang)}</span>`)}</dd></div>
    <div><dt>${esc(t.speed)}</dt><dd>${p(`<span class="ls-num">${num(s.speed, lang)}</span>`)}</dd></div>
    <div><dt>${esc(t.lasers)}</dt><dd class="ls-num">${s.laserSlots}</dd></div>
    <div><dt>${esc(t.gens)}</dt><dd class="ls-num">${s.genSlots}</dd></div>
    <div><dt>${esc(t.cargo)}</dt><dd>${p(`<span class="ls-num">${num(s.cargo, lang)}</span>`)}</dd></div>
    <div><dt>${esc(t.price)}</dt><dd>${price}</dd></div>
  </dl>`;
}

export function shipsBody(lang) {
  const t = G[lang].ships;
  const label = (id) => SHIPS[id].cls; // Klassenname wie auf der Startseite (Starter, Courier, Warden …)
  const mark = (id) => (PROVISIONAL.has(id) ? `<sup class="prov" title="${esc(t.prov)}">*</sup>` : '');
  const stage = `<div class="sg ls-panel" data-sg data-lang="${lang}" style="--fx:${FXC.europa}">
    <div class="ls-head"><span class="ls-code">HGR·01</span><span class="ls-title">${esc(t.viewer)}</span><span class="ls-spacer"></span><span class="sg-cur ls-num" data-sg-cur>EUROPA · S-01</span></div>
    <div class="sg-grid">
      <div class="sg-stage">
        <div class="sg-stills">${FX_LIST.map((f) => SHIP_IDS.map((id) => `<div class="sg-still" data-still="${f}-${id}"${f === 'europa' && id === 's1' ? '' : ' hidden'}>${pic(shipImg(f, id), t.alt(f, label(id)), { sizes: '(max-width: 900px) 100vw, 60vw', eager: f === 'europa' && id === 's1' })}</div>`).join('')).join('')}</div>
        <canvas class="sg-canvas" tabindex="0" aria-label="${esc(t.viewer)}: ${esc(t.help)}"></canvas>
        <p class="sg-help" data-sg-help>${esc(t.help)}</p>
        <p class="sg-state" data-sg-state role="status" aria-live="polite"></p>
        <p class="sg-nogl" data-sg-nogl hidden>${esc(t.noGl)}</p>
      </div>
      <div class="sg-side">
        <div class="sg-block"><span class="ls-label" id="sg-fx-l">${esc(t.faction)}</span>
          <div class="seg" role="group" aria-labelledby="sg-fx-l">${FX_LIST.map((f) => `<button type="button" class="seg-b" data-sg-fx="${f}" style="--fx:${FXC[f]}" aria-pressed="${f === 'europa'}">${FXN[f]}</button>`).join('')}</div>
        </div>
        <div class="sg-block"><span class="ls-label" id="sg-cl-l">${esc(t.classes)}</span>
          <ol class="sg-list" aria-labelledby="sg-cl-l">${SHIP_IDS.map((id) => `<li><button type="button" class="sg-ship" data-sg-ship="${id}" aria-pressed="${id === 's1'}"><span class="ls-num">S-${pad(id.slice(1))}</span><b>${esc(label(id))}</b><em>${esc(t.level)} ${SHIPS[id].level}</em></button></li>`).join('')}</ol>
        </div>
        <div class="sg-block sg-specs" aria-live="polite">${SHIP_IDS.map((id) => `<div data-sg-spec="${id}"${id === 's1' ? '' : ' hidden'}><h2 class="sg-name">${esc(label(id))}${mark(id)} <span>S-${pad(id.slice(1))}</span></h2>${shipStats(id, lang)}</div>`).join('')}</div>
      </div>
    </div>
    <span class="ls-corners" aria-hidden="true"></span>
  </div>`;
  const cols = [t.ship, t.level, t.hp, t.speed, t.lasers, t.gens, t.cargo, t.price];
  const td = (k, v, cls = 'ls-num') => `<td class="${cls}" data-l="${esc(cols[k])}">${v}</td>`;
  const table = `<div class="wk-tbl ls-panel sg-table"><div class="ls-head"><span class="ls-title">${esc(t.table)}</span></div>
    <div class="tbl-scroll" tabindex="0" role="region" aria-label="${esc(t.table)}"><table class="sec-table sg-cmp"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${SHIP_IDS.map((id) => { const s = SHIPS[id];
      return `<tr><th scope="row"><b class="ls-num">S-${pad(id.slice(1))}</b> ${esc(label(id))}${mark(id)}</th>${td(1, s.level)}${td(2, num(s.hp, lang))}${td(3, s.speed)}${td(4, s.laserSlots)}${td(5, s.genSlots)}${td(6, num(s.cargo, lang))}${td(7, s.currency ? `<span class="ls-num">${num(s.price, lang)}</span> ${esc(t.cur[s.currency])}` : esc(t.cur.free), '')}</tr>`; }).join('')}</tbody></table></div>
    <span class="ls-corners" aria-hidden="true"></span></div>
    <p class="plan-note"><sup class="prov">*</sup> ${esc(t.provNote)} ${esc(t.special)}</p>`;
  const grid = `<h2 class="sub-h2">${esc(t.all)}</h2>${FX_LIST.map((f) => `<section class="sg-fleet" style="--fx:${FXC[f]}" aria-labelledby="fleet-${f}"><h3 class="sg-fleet-h" id="fleet-${f}"><i aria-hidden="true"></i>${FXN[f]}</h3><ul class="sg-thumbs">${SHIP_IDS.map((id) => `<li><button type="button" class="sg-thumb" data-sg-pick="${f}-${id}">${pic(shipImg(f, id), t.alt(f, id.slice(1)), { sizes: '(max-width: 600px) 50vw, 240px' })}<span><b class="ls-num">S-${pad(id.slice(1))}</b> ${esc(label(id))}</span></button></li>`).join('')}</ul></section>`).join('')}`;
  return `${stage}${table}${grid}`;
}

// ---------- Welt-Seite ----------
const SECTORS = Object.fromEntries(FX_LIST.map((f) => [f, Object.values(sectorsFor(f))]));
const ENEMY_ORDER = Object.keys(ENEMIES).filter((k) => !ENEMIES[k].boss);
const BOSSES = Object.keys(ENEMIES).filter((k) => ENEMIES[k].boss);
const sectorsOf = (type) => SECTORS.europa.filter((s) => s.spawns.some((x) => x.type === type)).map((s) => s.index);
const bossShot = { werft: 'spiel/boss-werft', wal: 'spiel/boss-wal', dread: 'spiel/boss-dread' };
const enemyName = (k, lang) => (ENEMIES[k].boss ? G[lang].world.bossName[k] : ENEMIES[k].name);
// Diese Modelle sind noch nicht fertig (falsche Farbe, fremde Beschriftung, Grundform eines anderen Gegners):
// kein Bild, bis das eigene Modell im Spiel ist.
const NO_IMG = new Set(['corsair', 'boarder', 'hunter', 'stalker', 'jammer']);

export function worldBody(lang, factionsText) {
  const t = G[lang].world;
  const ids = Object.fromEntries(t.jump.map(([id], i) => [['fac', 'ladder', 'enemies', 'bosses'][i], id]));
  const jump = `<nav class="jump" aria-label="${esc(t.kicker)}"><ol>${t.jump.map(([id, l], i) => `<li><a href="#${id}"><span class="ls-num">${pad(i + 1)}</span>${esc(l)}</a></li>`).join('')}</ol></nav>`;
  const facs = `<section class="wd-sec" id="${ids.fac}" aria-labelledby="${ids.fac}-h">
    <h2 class="sub-h2" id="${ids.fac}-h">${esc(t.fac)}</h2><p class="sub-p">${esc(t.facLede)}</p>
    <ul class="wd-facs">${FX_LIST.map((f) => { const x = factionsText.find((y) => y.id === f);
      return `<li class="wd-fac ls-panel" style="--fx:${FXC[f]}">
        ${pic(`spiel/station-${f}`, t.stationAlt(f), { sizes: '(max-width: 900px) 100vw, 33vw', cls: 'wd-fac-img' })}
        <div class="wd-fac-in"><p class="ls-label">${esc(x.title)}</p><h3>${FXN[f]}</h3>
          <p class="wd-motto">${esc(lang === 'de' ? `„${x.motto}“` : `“${x.motto}”`)}</p>
          <p>${esc(x.story)}</p>
          <dl class="wd-dl"><div><dt>${esc(t.leader)}</dt><dd>${esc(x.leader)}</dd></div><div><dt>${esc(t.home)}</dt><dd>${esc(x.home)}</dd></div></dl>
        </div><span class="ls-corners" aria-hidden="true"></span></li>`; }).join('')}</ul>
  </section>`;
  const secName = (n) => (lang === 'en' && n === 'Ganymed' ? 'Ganymede' : lang === 'en' && n === 'Kallisto' ? 'Callisto' : n);
  const ladder = `<section class="wd-sec" id="${ids.ladder}" aria-labelledby="${ids.ladder}-h">
    <h2 class="sub-h2" id="${ids.ladder}-h">${esc(t.ladder)}</h2><p class="sub-p">${esc(t.ladderLede)}</p>
    <div class="wd-ladders" data-ladder>
      <div class="seg wd-lad-seg" role="group" aria-label="${esc(t.ladder)}">${FX_LIST.map((f, i) => `<button type="button" class="seg-b" style="--fx:${FXC[f]}" data-lad-fx="${f}" aria-pressed="${i === 0}">${FXN[f]}</button>`).join('')}</div>
      ${FX_LIST.map((f, i) => `<ol class="wd-ladder" data-lad="${f}" style="--fx:${FXC[f]}"${i === 0 ? '' : ' data-off'} aria-label="${esc(t.ladder)} ${FXN[f]}">${SECTORS[f].map((s) => {
        const boss = s.spawns.find((x) => ENEMIES[x.type].boss);
        const foes = s.spawns.filter((x) => !ENEMIES[x.type].boss).map((x) => `<a href="#e-${x.type}">${esc(ENEMIES[x.type].name)}</a>`).join(', ');
        return `<li class="wd-step${boss ? ' is-boss' : ''}${s.station ? ' is-home' : ''}"><span class="wd-code ls-num">${esc(s.id)}</span><span class="wd-sn"><b>${esc(secName(s.name))}</b><em class="ls-num">${esc(t.lvl)} ${s.levelMin}–${s.levelMax}</em></span><span class="wd-foes">${foes}</span><span class="wd-tag">${s.station ? `<i>${esc(t.station)}</i>` : ''}${boss ? `<a class="wd-boss" href="#e-${boss.type}">${esc(t.boss)}: ${esc(enemyName(boss.type, lang))}</a>` : ''}</span></li>`; }).join('')}</ol>`).join('')}
      <p class="plan-note">${esc(t.mpNote)}</p>
    </div>
  </section>`;
  const card = (k) => { const e = ENEMIES[k]; const sec = sectorsOf(k); const name = enemyName(k, lang);
    const img = NO_IMG.has(k) ? `<div class="wd-foe-img is-none"><span>${esc(t.noImg)}</span></div>` : `<div class="wd-foe-img">${pic(`gegner/${k}`, t.modelAlt(name), { sizes: '(max-width: 600px) 50vw, 240px' })}</div>`;
    return `<li class="wd-foe is-${e.group}" id="e-${k}">${img}
      <div class="wd-foe-in"><p class="ls-label">${esc(t.group[e.group])}</p><h3>${esc(name)}</h3>
      <p class="wd-beh">${esc(t.beh[e.behavior] || '')}</p>
      <dl class="wd-dl"><div><dt>${esc(t.lvl)}</dt><dd class="ls-num">${e.level}</dd></div><div><dt>${esc(t.hull)}</dt><dd class="ls-num">${num(e.hp, lang)}</dd></div><div><dt>${esc(t.shield)}</dt><dd class="ls-num">${num(e.shield, lang)}</dd></div><div><dt>${esc(t.where)}</dt><dd class="ls-num">${sec.length ? sec.join(', ') : esc(t.event)}</dd></div></dl></div></li>`; };
  const enemies = `<section class="wd-sec" id="${ids.enemies}" aria-labelledby="${ids.enemies}-h">
    <h2 class="sub-h2" id="${ids.enemies}-h">${esc(t.enemies)}</h2><p class="sub-p">${esc(t.enemiesLede)}</p>
    ${['pirate', 'swarm'].map((g) => `<h3 class="wd-group">${esc(t.group[g])}</h3><ul class="wd-foes-grid">${ENEMY_ORDER.filter((k) => ENEMIES[k].group === g).sort((a, b) => ENEMIES[a].level - ENEMIES[b].level).map(card).join('')}</ul>`).join('')}
  </section>`;
  const bosses = `<section class="wd-sec" id="${ids.bosses}" aria-labelledby="${ids.bosses}-h">
    <h2 class="sub-h2" id="${ids.bosses}-h">${esc(t.bosses)}</h2><p class="sub-p">${esc(t.bossLede)}</p>
    <ul class="wd-bosses">${BOSSES.sort((a, b) => ENEMIES[a].level - ENEMIES[b].level).map((k) => { const e = ENEMIES[k]; const name = enemyName(k, lang);
      const traits = [e.brood ? t.brood(ENEMIES[e.brood.type].name) : '', e.regen ? t.regen : ''].filter(Boolean);
      return `<li class="wd-bossc ls-panel" id="e-${k}">
        ${pic(bossShot[k], t.shotAlt(name), { sizes: '(max-width: 900px) 100vw, 60vw', cls: 'wd-boss-shot' })}
        <div class="wd-boss-in"><div class="wd-boss-model">${pic(`gegner/${k}`, t.modelAlt(name), { sizes: '240px' })}</div>
          <p class="ls-label">${esc(t.group[e.group])} · ${esc(t.boss)}</p><h3>${esc(name)}</h3>
          ${traits.length ? `<ul class="wd-traits">${traits.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <dl class="wd-dl"><div><dt>${esc(t.lvl)}</dt><dd class="ls-num">${e.level}</dd></div><div><dt>${esc(t.hull)}</dt><dd class="ls-num">${num(e.hp, lang)}</dd></div><div><dt>${esc(t.shield)}</dt><dd class="ls-num">${num(e.shield, lang)}</dd></div><div><dt>${esc(t.where)}</dt><dd class="ls-num">${sectorsOf(k).join(', ')}</dd></div><div><dt>${esc(t.respawn)}</dt><dd class="ls-num">${Math.round(e.respawn / 60)} ${esc(t.min)}</dd></div></dl>
        </div><span class="ls-corners" aria-hidden="true"></span></li>`; }).join('')}</ul>
  </section>`;
  return `${jump}${facs}${ladder}${enemies}${bosses}`;
}
