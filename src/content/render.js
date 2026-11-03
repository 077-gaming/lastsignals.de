// Erzeugt jede Seite als fertiges HTML (beim Bauen und im Dev-Server).
// Text steht sofort im HTML, JavaScript ergänzt nur 3D-Szenen, Ton und Bewegung.

import { TEXT } from './text.js';
import { CH, SHIPS, RANKS, homeSectors } from './chapters.js';
import { ICONS, EMBLEM, CRESTS } from './icons.js';
import { wordmark } from './wordmark.js';
import { LINKS, LINK_ORDER, linkUrl } from '../links.js';
import { SITE, PAGES, PAGE_IDS, pageById, canonical, href, setLinkMode } from '../site.js';
import { frame, visSystem, visShips, visLasers, visDrones, visDepth, visWormholes, visBosses, visWar, visMonitor, whTable, warTable, FX } from './visuals.js';
import { legal } from './legal.js';
import { RELEASE, FILES, PLATFORMS, releaseUrl, releasePage, fileSize } from './downloads.js';
import { G, heroVideo, heroFilmBtn, features, shotsSection, shipsBody, worldBody, pic, HERO_WIDE, HERO_TALL, HERO_PHONE } from './game.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const num = (n, lang) => n == null ? '' : n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US');

function T(lang) {
  const b = TEXT[lang], c = CH[lang];
  return { ...b, ...c, community: { ...b.community, ...c.community }, lang };
}
// Seitenlinks; auf der 404-Seite (FROM null) im Produktions-Build immer absolut
let FROM = null;
let FLAGS = { reservationOpen: false, oauth: [] };
const P = (lang, k) => href(PAGE_IDS[lang][k], FROM);
const ALT = (alt) => href(alt.id, FROM); // Sprachwechsel: im Produktions-Build absolut auf die andere Domain

// ---------- Kanäle ----------
function social(id, t, variant) {
  const L = LINKS[id];
  const url = linkUrl(id);
  const role = t.community.roles[id] || '';
  if (variant === 'row') {
    return url
      ? `<a class="sb sb-row" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ICONS[id]}<span>${esc(L.name)}</span><span class="sr"> (${esc(t.ui.newTab)})</span>${ICONS.out}</a>`
      : `<span class="sb sb-row is-soon">${ICONS[id]}<span>${esc(L.name)}</span><em>${esc(t.ui.soon)}</em></span>`;
  }
  if (variant === 'icon') {
    return url
      ? `<a class="sb sb-icon" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(L.name)} (${esc(t.ui.newTab)})" title="${esc(L.name)}">${ICONS[id]}</a>`
      : `<span class="sb sb-icon is-soon" title="${esc(L.name)} · ${esc(t.ui.soon)}">${ICONS[id]}<span class="sr">${esc(L.name)}, ${esc(t.ui.soonLong)}</span></span>`;
  }
  const inner = `<span class="sb-ico">${ICONS[id]}</span>
    <span class="sb-txt"><b>${esc(L.name)}</b><span>${esc(L.handle || role)}</span>${L.handle ? `<span class="sb-role">${esc(role)}</span>` : ''}</span>
    <span class="sb-state">${url ? `${esc(t.ui.open)}${ICONS.out}` : `<i></i>${esc(t.ui.soon)}`}</span>
    <span class="ls-corners" aria-hidden="true"></span>`;
  return url
    ? `<a class="sb sb-tile ls-panel" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-click>${inner}<span class="sr"> (${esc(t.ui.newTab)})</span></a>`
    : `<div class="sb sb-tile ls-panel is-soon">${inner}</div>`;
}
const socials = (t, variant) => LINK_ORDER.map((id) => `<li>${social(id, t, variant)}</li>`).join('');

// ---------- Kopf ----------
// Vorschaubild je Seite (1200×630, public/img/og/<name>.jpg)
const OG = { home: 'home', ships: 'ships', world: 'world', download: 'download', wiki: 'world', news: 'home', hall: 'hall', impressum: 'home', imprint: 'home', datenschutz: 'home', privacy: 'home' };
function head(page, t) {
  const can = canonical(page);
  const alt = page.alt ? pageById(page.alt) : null;
  const isHome = page.id.endsWith('home');
  const k = page.id.replace(/^(de|en)-/, '');
  const g = G[page.lang];
  const title = isHome ? t.meta.title : `${pageTitle(page, t)} · LAST SIGNALS`;
  const desc = isHome ? t.meta.desc : (g.meta[k] || t.meta.desc);
  const og = `${SITE.de}/img/og/${OG[k] || 'home'}-${page.lang}.jpg`;
  const hreflang = alt ? [page, alt].map((p) => `<link rel="alternate" hreflang="${p.lang}" href="${canonical(p)}">`).join('\n  ')
    + `\n  <link rel="alternate" hreflang="x-default" href="${canonical(page.lang === 'en' ? page : alt)}">` : '';
  const shots = ['kampf-saturn', 'flug-eris', 'station-europa', 'cockpit-europa', 'boss-dread'].map((n) => `${SITE.de}/img/spiel/${n}-1920.webp`);
  const ld = isHome ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org', '@type': 'VideoGame', name: 'LAST SIGNALS', url: SITE[page.lang] + '/',
    description: t.meta.desc, genre: ['MMO', 'Space', 'Action'], inLanguage: 'de', // Spiel derzeit nur auf Deutsch (Website DE/EN)
    // Apps erst nennen, wenn das Release mit den Dateien veröffentlicht ist
    gamePlatform: RELEASE.published ? ['Web browser', 'macOS', 'Windows', 'Android', 'iOS'] : ['Web browser'],
    operatingSystem: RELEASE.published ? 'Web browser, macOS, Windows, Android, iOS' : 'Web browser',
    applicationCategory: 'Game', playMode: ['SinglePlayer', 'MultiPlayer', 'CoOp'], numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1 },
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: SITE[page.lang] + SITE.play },
    image: og, screenshot: shots,
    trailer: { '@type': 'VideoObject', name: page.lang === 'de' ? 'LAST SIGNALS · Spielszene' : 'LAST SIGNALS · gameplay', description: g.hero.video,
      thumbnailUrl: `${SITE.de}/img/spiel/hero-1280.webp`, contentUrl: `${SITE.de}/media/hero-loop.mp4`, uploadDate: '2026-11-03', duration: 'PT8S' },
    author: { '@type': 'Organization', name: '077 GAMING' }, publisher: { '@type': 'Organization', name: '077 GAMING' },
  }).replace(/</g, '\\u003c')}</script>` : '';
  const pre = (name, ws, media) => `<link rel="preload" as="image" type="image/avif" media="${media}" imagesrcset="${ws.map((w) => `/img/spiel/${name}-${w}.avif ${w}w`).join(', ')}" imagesizes="100vw" fetchpriority="high">`;
  const preload = isHome ? `${pre('hero-tall', HERO_TALL, HERO_PHONE)}\n  ${pre('hero', HERO_WIDE, '(min-width: 721px)')}` : '';
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  ${page.id === 'not-found' ? '<meta name="robots" content="noindex">' : ''}
  ${can ? `<link rel="canonical" href="${can}">` : ''}
  ${hreflang}
  <meta name="theme-color" content="#04060a">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/img/touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="LAST SIGNALS">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  ${can ? `<meta property="og:url" content="${can}">` : ''}
  <meta property="og:image" content="${og}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(isHome ? g.hero.ogAlt : title)}">
  <meta property="og:locale" content="${page.lang === 'de' ? 'de_DE' : 'en_US'}">
  ${alt ? `<meta property="og:locale:alternate" content="${alt.lang === 'de' ? 'de_DE' : 'en_US'}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${og}">
  ${preload}
  ${ld}
  <script type="module" src="/src/main.js"></script>`;
}

function pageTitle(page, t) {
  const k = page.id.replace(/^(de|en)-/, '');
  const de = page.lang === 'de';
  return ({ impressum: 'Impressum', imprint: 'Imprint', datenschutz: 'Datenschutz', privacy: 'Privacy', news: t.news.title, wiki: t.wiki.title, hall: t.hall.title, download: t.download.title, ships: G[page.lang].ships.title, world: G[page.lang].world.title })[k]
    || (page.id === 'not-found' ? t.nf.title : (de ? 'Startseite' : 'Home'));
}

function brand(lang, cls = '') {
  return `<a class="brand ${cls}" href="${P(lang, 'home')}" aria-label="LAST SIGNALS, ${esc(TEXT[lang].ui.home)}">${EMBLEM}${wordmark({ cls: 'brand-wm', hidden: true })}</a>`;
}

function chapterHref(page, t, key) {
  const onHome = page.id.endsWith('home');
  return (onHome ? '' : P(page.lang, 'home')) + '#' + t.ids[key];
}

const NAV = ['ships', 'world', 'download', 'hall', 'news', 'wiki'];
const navLabel = (lang, t, k) => (k === 'ships' || k === 'world' ? G[lang].nav[k] : t.pages[k]);
const discordUrl = () => linkUrl('discord');
function header(page, t) {
  const lang = page.lang;
  const h = t.hdr;
  const alt = page.alt ? pageById(page.alt) : pageById(lang === 'de' ? 'en-home' : 'de-home');
  const cur = page.id.replace(/^(de|en)-/, '');
  const pageNav = NAV.map((k) => `<li><a href="${P(lang, k)}"${cur === k ? ' aria-current="page"' : ''}>${esc(navLabel(lang, t, k))}</a></li>`).join('');
  const play = SITE.status === 'live'
    ? `<a class="ls-btn is-primary is-gold hdr-play" href="${SITE.play}" data-click>${ICONS.play}<span>${esc(h.play)}</span></a>`
    : `<span class="ls-btn hdr-play is-locked" aria-disabled="true" title="${esc(t.hero.playState)}">${ICONS.lock}<span>${esc(h.play)}</span><em>${esc(h.playLocked)}</em></span>`;
  return `<a class="skip" href="#main">${esc(t.ui.skip)}</a>
<header class="hdr" data-hdr>
  <div class="hdr-in">
    ${brand(lang)}
    <nav class="nav" aria-label="${lang === 'de' ? 'Seiten' : 'Pages'}"><ul>${pageNav}</ul></nav>
    <div class="hdr-right">
      <span class="live" data-live aria-live="polite"><i aria-hidden="true"></i><span class="live-k">${esc(h.status)}</span><b data-live-text>${esc(h.statusTest)}</b></span>
      ${discordUrl() ? `<a class="hdr-dc" href="${esc(discordUrl())}" target="_blank" rel="noopener noreferrer" aria-label="Discord (${esc(t.ui.newTab)})" title="Discord">${ICONS.discord}</a>` : ''}
      ${play}
      <a class="hdr-auth" href="${chapterHref(page, t, 'founder')}" data-auth data-label-in="${esc(h.signIn)}">${ICONS.user}<span data-auth-name>${esc(h.signIn)}</span></a>
      <a class="lang" href="${ALT(alt)}" hreflang="${alt.lang}" lang="${alt.lang}" aria-label="${esc(t.ui.langOther)}"><span aria-hidden="true"><b>${t.ui.langCur}</b><i>/</i>${t.ui.langShort}</span></a>
      <button class="snd" type="button" aria-pressed="false" data-sound data-on="${esc(h.soundOff)}" data-off="${esc(h.soundOn)}" aria-label="${esc(h.soundOn)}" title="${esc(h.soundOn)}"><span class="snd-off">${ICONS.soundOff}</span><span class="snd-on">${ICONS.soundOn}</span><span class="snd-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>
      ${page.id.endsWith('home') ? `<button class="snd scene-btn" type="button" data-scene-toggle hidden data-pause="${esc(t.hud.pause)}" data-resume="${esc(t.hud.resume)}" aria-pressed="false" aria-label="${esc(t.hud.pause)}" title="${esc(t.hud.pause)}"><span class="sc-pause">${ICONS.pause}</span><span class="sc-play">${ICONS.play}</span></button>` : ''}
      <button class="menu-btn" type="button" aria-expanded="false" aria-controls="menu" data-open="${esc(t.ui.menu)}" data-close="${esc(t.ui.close)}" aria-label="${esc(t.ui.menu)}"><span class="mb-open">${ICONS.menu}</span><span class="mb-close">${ICONS.close}</span></button>
    </div>
  </div>
  <div class="menu" id="menu" hidden>
    <div class="menu-cols">
      <nav aria-label="${esc(h.chapters)}"><span class="ls-label">${esc(h.chapters)}</span><ol class="menu-nav">${t.chapters.map(([k, n, l]) => `<li><a href="${chapterHref(page, t, k)}"><span class="ls-num">${n}</span>${esc(l)}</a></li>`).join('')}</ol></nav>
      <div class="menu-side">
        <div class="menu-meta"><span class="live"><i aria-hidden="true"></i><b>${esc(h.statusTest)}</b></span><a class="ls-btn" href="${chapterHref(page, t, 'founder')}">${ICONS.user}<span>${esc(h.signIn)}</span></a></div>
        <span class="ls-label">${lang === 'de' ? 'Seiten' : 'Pages'}</span>
        <ul class="menu-pages">${NAV.map((k) => `<li><a href="${P(lang, k)}">${esc(navLabel(lang, t, k))}</a></li>`).join('')}</ul>
        <span class="ls-label">${esc(t.footer.channels)}</span>
        <ul class="soc soc-rows">${socials(t, 'row')}</ul>
        <a class="ls-btn" href="${ALT(alt)}" hreflang="${alt.lang}" lang="${alt.lang}">${esc(t.ui.langOther)}</a>
      </div>
    </div>
  </div>
</header>`;
}

function footer(page, t) {
  const lang = page.lang;
  const alt = page.alt ? pageById(page.alt) : pageById(lang === 'de' ? 'en-home' : 'de-home');
  const de = lang === 'de';
  return `<footer class="ftr">
  <div class="wrap">
    <div class="ftr-top">
      <div class="ftr-brand">${brand(lang, 'brand-lg')}<p>${esc(t.footer.tag)}</p><p class="ftr-by">${de ? 'Ein Spiel von 077 GAMING' : 'A game by 077 GAMING'}</p>
        <div class="ftr-cta"><a class="ls-btn is-primary" href="${SITE.play}">${ICONS.play}<span>${esc(G[lang].hero.play)}</span></a><a class="ls-btn" href="${P(lang, 'download')}">${ICONS.download}<span>${esc(G[lang].hero.download)}</span></a></div></div>
      <nav class="ftr-col" aria-label="${de ? 'Spiel' : 'Game'}"><span class="ls-label">${de ? 'Spiel' : 'Game'}</span><ul>
        ${['ships', 'world', 'wiki', 'news', 'hall'].map((k) => `<li><a href="${P(lang, k)}">${esc(navLabel(lang, t, k))}</a></li>`).join('')}
        <li><a href="${chapterHref(page, t, 'founder')}">${esc(G[lang].nav.account)}</a></li>
      </ul></nav>
      <div class="ftr-col"><span class="ls-label">${esc(t.footer.channels)}</span><ul class="soc soc-rows">${socials(t, 'row')}</ul></div>
      <nav class="ftr-col" aria-label="${esc(t.footer.legal)}"><span class="ls-label">${esc(t.footer.legal)}</span><ul>
        <li><a href="${P(lang, 'imprint')}">${esc(t.footer.imprint[0])}</a></li>
        <li><a href="${P(lang, 'privacy')}">${esc(t.footer.privacy[0])}</a></li>
        <li><a href="${ALT(alt)}" hreflang="${alt.lang}" lang="${alt.lang}">${esc(t.ui.langOther)}</a></li>
      </ul></nav>
    </div>
    <div class="ftr-bot"><span>${esc(t.footer.copy)} · 077 GAMING</span><span class="ls-tick" aria-hidden="true"></span><span class="ftr-state"><i aria-hidden="true"></i>${esc(t.footer.state)}</span><a class="ftr-top-link" href="#top">${esc(t.ui.top)}</a></div>
  </div>
</footer>`;
}

// ---------- Startseite ----------
function secHead(code, label, title, lede, idH) {
  return `<header class="sec-head rv">
    <p class="sec-code"><span class="ls-num">${esc(code)}</span><span>${esc(label)}</span><i class="ls-tick" aria-hidden="true"></i></p>
    <h2 id="${idH}">${esc(title)}</h2>
    ${lede ? `<p class="sec-lede">${esc(lede)}</p>` : ''}
  </header>`;
}

// Aufklapp-Details im Stil der Seite (Kopf als große Klickfläche)
function more(label, inner, cls = '') {
  return `<details class="more ${cls}"><summary><span>${esc(label)}</span><i aria-hidden="true"></i></summary><div class="more-in">${inner}</div></details>`;
}

function cosmos(t) {
  return `<div class="cosmos" aria-hidden="true" data-cosmos>
  <picture>
    <source media="(max-aspect-ratio: 1/1)" srcset="/img/hero-poster-tall.webp">
    <img class="cosmos-poster" src="/img/hero-poster.webp" alt="" width="1920" height="1080" fetchpriority="low" decoding="async">
  </picture>
  <canvas class="cosmos-canvas"></canvas>
  <div class="cosmos-tint"></div>
  <div class="cosmos-grain"></div>
</div>`;
}

function rail(t) {
  return `<nav class="rail" aria-label="${esc(t.hdr.chapters)}" data-rail>
  <ol>${t.chapters.map(([k, n, l]) => `<li><a href="#${t.ids[k]}" data-rail-link="${t.ids[k]}"><span class="rail-n ls-num">${n}</span><span class="rail-l">${esc(l)}</span><i aria-hidden="true"></i></a></li>`).join('')}</ol>
</nav>`;
}

function hud(t) {
  const h = t.hud;
  return `<div class="hud" aria-hidden="true" data-hud>
  <div class="hud-pos"><span class="ls-label">${esc(h.pos)}</span><b data-hud-place>${esc(h.places[0])}</b></div>
  <div class="hud-row"><span data-hud-au>0,98</span> ${esc(h.au)}<i></i><span class="ls-label">${esc(h.light)}</span> <span data-hud-light>0</span></div>
  <div class="hud-bar"><i data-hud-bar></i></div>
</div>
`;
}

function hero(t) {
  const h = t.hero;
  const g = G[t.lang].hero;
  const live = SITE.status === 'live';
  const play = live
    ? `<a class="ls-btn is-primary is-gold is-big" href="${SITE.play}" data-click>${ICONS.play}${esc(g.play)}</a>`
    : `<span class="ls-btn is-primary is-big is-locked" aria-disabled="true">${ICONS.lock}${esc(g.play)}</span>`;
  const dc = linkUrl('discord');
  return `<section class="hero" id="top" aria-labelledby="hero-title" data-ch="0">
  ${heroVideo(t.lang)}
  <div class="hero-in">
    <p class="hero-kicker"><i aria-hidden="true"></i>${esc(h.kicker)}<span class="hero-clock" aria-hidden="true"><span data-clock>--:--:--</span> UTC</span></p>
    <h1 id="hero-title" class="hero-wm">${wordmark({ layout: 'line', cls: 'wm-hero', title: 'LAST SIGNALS', id: 'wm-hero' })}</h1>
    <p class="hero-head">${h.head}</p>
    <p class="hero-sub">${esc(g.sub)}</p>
    <div class="hero-cta">
      ${play}
      <a class="ls-btn is-big hero-apps" href="${P(t.lang, 'download')}" data-click>${ICONS.download}${esc(g.download)}</a>
      ${dc ? `<a class="ls-btn is-big hero-dc" href="${esc(dc)}" target="_blank" rel="noopener noreferrer">${ICONS.discord}<span>${esc(g.discord)}</span><span class="sr"> (${esc(t.ui.newTab)})</span></a>` : ''}
    </div>
    <p class="hero-trust">${esc(g.trust)}</p>
    ${features(t.lang)}
  </div>
  ${heroFilmBtn(t.lang)}
  <a class="hero-scroll" href="#${t.ids.silence}"><span>${esc(h.scroll)}</span>${ICONS.down}</a>
</section>`;
}

function silence(t) {
  const s = t.silence;
  const id = t.ids.silence;
  const log = `<ol class="radio" aria-label="${esc(s.label)}">${s.log.map(([time, who, msg], i) => `<li class="${i >= 4 ? (i === 4 ? 'is-swarm' : 'is-live') : 'is-dead'}">
        <p class="radio-meta"><span class="ls-num">${esc(time)}</span><b>${esc(who)}</b></p>
        <p class="radio-msg">${esc(msg)}</p>
      </li>`).join('')}</ol><p class="more-p">${esc(s.p)}</p><p class="story-goal">${esc(s.goal)}</p>`;
  return `<section class="sec ch ch-silence" id="${id}" aria-labelledby="${id}-h" data-ch="1">
  <div class="wrap ch-grid">
    <div class="ch-text">
      ${secHead(s.code, s.label, s.title, s.short, id + '-h')}
      <div class="ch-act rv"><a class="ls-btn is-big" href="#${t.ids.factions}" data-click>${esc(s.next)}${ICONS.down}</a></div>
      ${more(s.more, log, 'rv')}
    </div>
    <div class="ch-vis rv">${frame('SIG·00', t.story.monitor, visMonitor(t), { label: t.story.monitor })}</div>
  </div>
</section>`;
}

function choose(t) {
  const c = t.choose;
  const f = t.factions;
  const id = t.ids.factions;
  const q = (s) => (t.lang === 'de' ? `„${s}“` : `“${s}”`);
  return `<section class="sec ch ch-factions" id="${id}" aria-labelledby="${id}-h" data-ch="2">
  <div class="wrap">
    ${secHead(c.code, c.label, c.title, c.lede, id + '-h')}
    <ul class="pick" data-pick>${f.list.map((x, i) => `<li class="pick-item rv" style="--fx:${FX[x.id]};--d:${i}">
      <article class="fac ls-panel" data-faction="${x.id}" aria-labelledby="fac-${x.id}">
        <div class="fac-art" aria-hidden="true">${CRESTS[x.id]}<span class="fac-glow"></span><span class="fac-scan"></span>
          <p class="fac-say">${esc(q(c.quotes[x.id]))}<span>${esc(x.leader)}</span></p>
        </div>
        <div class="fac-body">
          <p class="fac-kicker"><span class="ls-num">${pad(i + 1)}</span>${esc(x.title)}</p>
          <h3 id="fac-${x.id}">${esc(x.name)}</h3>
          <p class="fac-motto">${esc(q(x.motto))}</p>
          <button class="ls-btn is-big fac-btn" type="button" aria-pressed="false" data-pick-btn="${x.id}" data-pick="${esc(c.pick)}" data-picked="${esc(c.picked)}">${ICONS.check}<span>${esc(c.pick)}</span><span class="sr"> · ${esc(x.name)}</span></button>
          ${more(c.file, `<blockquote class="fac-quote"><p>${esc(q(c.quotes[x.id]))}</p><footer>${esc(x.leader)}</footer></blockquote>
            <p class="fac-story">${esc(x.story)}</p>
            <dl class="fac-data">
              <div><dt>${esc(c.home)}</dt><dd>${esc(x.home)}</dd></div>
              <div><dt>${esc(c.goal)}</dt><dd>${esc(x.goal)}</dd></div>
              <div><dt>${esc(c.ships)}</dt><dd>${esc(x.ships)}</dd></div>
            </dl>`, 'fac-more')}
        </div>
        <span class="ls-corners" aria-hidden="true"></span>
      </article>
    </li>`).join('')}</ul>
    <p class="pick-note" data-pick-note hidden role="status">${esc(c.pickedNote)} <a href="#${t.ids.founder}">${esc(t.hero.reserve)}</a></p>
  </div>
</section>`;
}

function why(t) {
  const w = t.why;
  const id = t.ids.why;
  const V = { system: visSystem, ships: visShips, lasers: visLasers, drones: visDrones, depth: visDepth, wormholes: visWormholes, bosses: visBosses, war: visWar };
  const extra = { wormholes: whTable, war: warTable };
  const f = t.fair;
  const list = w.reasons.filter((r) => r.id !== 'system');
  const fair = `<div class="ledger ls-panel">
          <div class="ls-head"><span class="ls-code">LDG·08</span><span class="ls-title">Nova</span></div>
          <div class="ledger-cols">
            <div class="ledger-col"><span class="ls-label">${esc(f.buy)}</span><ul>${f.buyList.map((x) => `<li>${ICONS.check}<span>${esc(x)}</span></li>`).join('')}</ul></div>
            <div class="ledger-col is-earn"><span class="ls-label">${esc(f.earn)}</span><ul>${f.earnList.map((x) => `<li>${ICONS.lock}<span>${esc(x)}</span></li>`).join('')}</ul></div>
          </div>
          <p class="fair-note">${ICONS.cross}<span>${esc(f.note)}</span></p>
          <span class="ls-corners" aria-hidden="true"></span>
        </div>`;
  const items = list.map((r, i) => ({ rid: r.id, plan: r.plan, title: r.t, s: r.s, vis: frame(`VIS·${pad(i + 1)}`, t.vis[r.id].head, V[r.id](t), { cls: 'vis-' + r.id, label: r.t }),
    det: `<p>${esc(r.d)}</p><ul class="specs">${r.specs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${extra[r.id] ? extra[r.id](t) : ''}` }));
  items.push({ rid: 'fair', title: f.title, s: f.s, vis: fair, det: `<p>${esc(f.p)}</p>` });
  return `<section class="sec ch ch-why" id="${id}" aria-labelledby="${id}-h" data-ch="3">
  <div class="wrap">
    ${secHead(w.code, w.label, w.title, w.lede, id + '-h')}
    <div class="why rv" data-why>
      <ol class="why-tabs" aria-label="${esc(w.label)}">${items.map((it, i) => `<li><button type="button" class="why-tab${it.plan ? ' is-plan' : ''}" data-why-tab="${i}" aria-controls="${id}-${it.rid}" aria-pressed="${i === 0}"><span class="ls-num">${pad(i + 1)}</span><b>${esc(it.title)}</b>${it.plan ? `<em class="plan-tag">${esc(t.map.planned)}</em>` : ''}</button></li>`).join('')}</ol>
      <div class="why-panels">${items.map((it, i) => `<article class="why-panel" id="${id}-${it.rid}" data-why-panel="${i}"${i === 0 ? '' : ' hidden'} aria-label="${esc(it.title)}">
        <p class="why-s"><span class="ls-num">${pad(i + 1)}/${pad(items.length)}</span>${it.plan ? `<em class="plan-tag">${esc(t.map.planned)}</em> ` : ''}${esc(it.s)}</p>
        <div class="why-vis">${it.vis}</div>
        ${more(w.more, it.det)}
      </article>`).join('')}</div>
    </div>
  </div>
</section>`;
}

function hangar(t) {
  const h = t.hangar;
  const id = t.ids.hangar;
  const lang = t.lang;
  const spec = (s) => {
    const name = h.names[s.id];
    const val = (v) => (v == null ? `<span class="is-est">${esc(h.est)}</span>` : esc(num(v, lang)));
    return `<div class="hg-spec" data-spec="${s.id}"${s.id === 's1' ? '' : ' hidden'}>
      <p class="hg-spec-code"><span class="ls-num">${s.code}</span><span>${esc(s.special ? h.special : h.line)}</span>${s.id === 's1' ? '' : `<span class="hg-cls">${esc(h.clsNote)}</span>`}</p>
      <h3>${esc(name)}</h3>
      <p class="hg-spec-note">${esc(h.notes[s.id])}</p>
      <dl class="hg-dl">
        <div><dt>${esc(h.level)}</dt><dd class="ls-num">${s.level}</dd></div>
        <div><dt>${esc(h.lasers)}</dt><dd class="ls-num">${val(s.lasers)}</dd></div>
        <div><dt>${esc(h.gens)}</dt><dd class="ls-num">${val(s.gens)}</dd></div>
        <div><dt>${esc(h.hp)}</dt><dd class="ls-num">${val(s.hp)}</dd></div>
        <div><dt>${esc(h.price)}</dt><dd class="hg-cur is-${s.cur}">${s.cur === 'free' ? esc(h.cur.free) : s.price != null ? `<span class="ls-num">${esc(num(s.price, lang))}</span> ${esc(h.cur[s.cur])}` : `<span class="is-est">${esc(h.tbd)}</span> ${esc(h.cur[s.cur])}`}</dd></div>
      </dl>
    </div>`;
  };
  const btn = (s) => `<li${s.special ? ' class="is-spec"' : ''}><button type="button" class="hg-ship${s.special ? ' is-spec' : ''}" data-ship="${s.id}" data-viz="${(s.viz || [s.lasers, s.gens]).join(',')}" data-model="${s.model ? 1 : 0}" data-tier="${SHIPS.indexOf(s)}" aria-pressed="${s.id === 's1'}"><span class="ls-num">${s.code}</span><b>${esc(h.names[s.id])}</b><em>${esc(h.lvl)} ${s.level}</em></button></li>`;
  return `<section class="sec ch ch-hangar" id="${id}" aria-labelledby="${id}-h" data-ch="4">
  <div class="wrap">
    ${secHead(h.code, h.label, h.title, h.lede, id + '-h')}
    <div class="hangar ls-panel rv" data-hangar>
      <div class="ls-head"><span class="ls-code">HGR·04</span><span class="ls-title">${esc(h.head)}</span><span class="ls-spacer"></span><span class="hg-tag" data-hg-tag data-real="${esc(h.real)}" data-bp="${esc(h.blueprint)}">${esc(h.real)}</span></div>
      <div class="hg-grid">
        <div class="hg-stage">
          ${pic('schiffe/saturn-1', lang === 'de' ? 'SATURN-Starter, Modell aus dem Spiel' : 'SATURN starter, in-game model', { imgCls: 'hg-fallback', cls: 'hg-fallback-p', sizes: '(max-width: 900px) 100vw, 60vw' })}
          <canvas class="hg-canvas" aria-hidden="true"></canvas>
          <div class="hg-pins" aria-hidden="true" data-pins data-l="${esc(h.laserSlot)}" data-g="${esc(h.genSlot)}"></div>
          <div class="hg-over" aria-hidden="true">
            <span class="hg-drag">${ICONS.rotate}${esc(h.drag)}</span>
            <span class="hg-scale"><i></i><span data-hg-len>—</span></span>
          </div>
  <div class="hg-slotsel"><span class="ls-label" id="hg-slots-l">${esc(h.slotsLabel)}</span>
            <div class="seg" role="group" aria-labelledby="hg-slots-l">${[['l', h.laserSlot], ['g', h.genSlot], ['off', h.slotsOff]].map(([k, l]) => `<button type="button" class="seg-b" data-hg-slot="${k}" aria-pressed="${k === 'l'}">${esc(l)}</button>`).join('')}</div>
          </div>
          <p class="hg-nogl" hidden data-nogl>${esc(h.noGl)}</p>
        </div>
        <div class="hg-side">
          <div class="hg-block">
            <span class="ls-label">${esc(h.faction)}</span>
            <div class="seg" role="group" aria-label="${esc(h.faction)}">${['europa', 'saturn', 'eris'].map((f) => `<button type="button" class="seg-b" data-hg-fx="${f}" style="--fx:${FX[f]}" aria-pressed="${f === 'saturn'}">${f.toUpperCase()}</button>`).join('')}</div>
          </div>
          <div class="hg-block">
            <span class="ls-label">${esc(h.line)} · 1–8 <i class="hg-sep" aria-hidden="true"></i> ${esc(h.special)} · ${lang === 'de' ? 'ab Stufe 40' : 'from level 40'}</span>
            <ol class="hg-list">${SHIPS.map(btn).join('')}</ol>
          </div>
          <div class="hg-block hg-specs" aria-live="polite">${SHIPS.map(spec).join('')}</div>
        </div>
      </div>
      <span class="ls-corners" aria-hidden="true"></span>
    </div>
    <p class="hg-more rv"><a class="ls-btn is-big" href="${P(lang, 'ships')}">${esc(G[lang].shots.more)}</a></p>
    ${more(h.gearMore, `<ul class="gear">${h.gearList.map(([a, b], i) => `<li><span class="ls-num">${pad(i + 1)}</span><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>
    <p class="plan-note">${esc(h.planNote)}</p>`, 'rv')}
  </div>
</section>`;
}

function mapSec(t) {
  const m = t.map;
  const id = t.ids.system;
  const lang = t.lang;
  const tag = (r) => (r.plan ? `<em class="plan-tag">${esc(m.planned)}</em>` : '');
  const first = 'saturn';
  const info = (r) => `<article class="map-info${r.plan ? ' is-plan' : ''}" data-info="${r.id}"${r.id === first ? '' : ' hidden'}>
    <p class="hg-spec-code"><span class="ls-num">${esc(r.code)}</span><span>${esc(r.sub)}</span>${tag(r)}</p>
    <h3${r.home ? ` style="color:${FX[r.home]}"` : ''}>${esc(r.name)}</h3>
    <p class="map-p">${esc(r.p)}</p>
    <dl class="hg-dl">
      <div><dt>${esc(m.level)}</dt><dd class="ls-num">${esc(r.level)}</dd></div>
      <div><dt>${esc(m.bosses)}</dt><dd>${esc(r.bosses)}</dd></div>
    </dl>
    ${more(m.more, `<dl class="hg-dl">
      <div><dt>${esc(m.enemies)}</dt><dd>${esc(r.enemies)}</dd></div>
      ${r.hazard ? `<div><dt>${esc(m.hazard)}</dt><dd>${esc(r.hazard)}</dd></div>` : ''}
      <div><dt>${esc(m.safe)}</dt><dd>${esc(r.safe)}</dd></div>
    </dl>${r.home ? `<table class="sec-table"><caption class="sr">${esc(m.sectors)} ${esc(r.name)}</caption><thead><tr><th scope="col">${esc(m.sectors)}</th><th scope="col">${esc(m.level)}</th><th scope="col">${esc(m.enemies)}</th></tr></thead><tbody>${homeSectors(r.home, lang).map((s) => `<tr><th scope="row"><b class="ls-num">${s.code}</b> ${esc(s.name)}</th><td class="ls-num">${s.level}</td><td>${esc(s.enemies)}</td></tr>`).join('')}</tbody></table>` : ''}`)}
  </article>`;
  return `<section class="sec ch ch-system" id="${id}" aria-labelledby="${id}-h" data-ch="5">
  <div class="wrap">
    ${secHead(m.code, m.label, m.title, m.lede, id + '-h')}
    <p class="hg-more rv"><a class="ls-btn is-big" href="${P(lang, 'world')}">${esc(G[lang].shots.world)}</a></p>
    <div class="map ls-panel rv" data-map>
      <div class="ls-head"><span class="ls-code">NAV·05</span><span class="ls-title">${esc(m.head)}</span><span class="ls-spacer"></span><button type="button" class="map-reset" data-map-reset>${ICONS.reset}<span>${esc(m.reset)}</span></button></div>
      <div class="map-grid">
        <div class="map-stage">
          <div class="map-svg" data-map-svg>${visSystem(t)}</div>
          <canvas class="map-canvas" aria-hidden="true"></canvas>
          <div class="map-labels" aria-hidden="true" data-map-labels></div>
          <p class="map-hint" aria-hidden="true">${esc(m.hint)}</p>
        </div>
        <div class="map-side">
          <span class="ls-label">${esc(m.pick)}</span>
          <ol class="map-list">${m.regions.map((r) => `<li><button type="button" class="map-btn${r.plan ? ' is-plan' : ''}" data-region="${r.id}"${r.plan ? ` data-plan="${esc(m.planned)}"` : ''} aria-pressed="${r.id === first}"${r.home ? ` style="--fx:${FX[r.home]}"` : ''}><span class="ls-num">${esc(r.code)}</span><b>${esc(r.name)}</b><em>${r.plan ? esc(m.planned) : esc(r.level)}</em></button></li>`).join('')}</ol>
          <div class="map-infos" aria-live="polite">${m.regions.map(info).join('')}</div>
        </div>
      </div>
      <span class="ls-corners" aria-hidden="true"></span>
    </div>
  </div>
</section>`;
}

function founder(t) {
  const f = t.founder;
  const id = t.ids.founder;
  const lang = t.lang;
  const privacy = P(lang, 'privacy');
  const open = FLAGS.reservationOpen;
  const consentBox = open || FLAGS.oauth.length ? `<label class="chk"><input type="checkbox" name="consent" required><span class="chk-box" aria-hidden="true"></span><span>${f.consent.replace('{privacy}', privacy)}</span></label>` : '';
  return `<section class="sec ch ch-founder" id="${id}" aria-labelledby="${id}-h" data-ch="6">
  <div class="wrap fd-grid">
    <div class="fd-left">
      ${secHead(f.code, f.label, f.title, f.lede, id + '-h')}
      <div class="fd-row">
      <ul class="perks rv">${f.perks.map(([a, b], i) => `<li><span class="ls-num">${pad(i + 1)}</span><b>${esc(a)}</b><span>${esc(b)}</span></li>`).join('')}</ul>
      <figure class="card-prev rv" data-card-wrap>
        <canvas class="card-canvas" width="1080" height="1350" data-card aria-label="${esc(f.card)}" role="img" data-line="${esc(f.cardLine)}" data-sub="${esc(f.cardSub)}" data-placeholder="${esc(f.yourName)}" data-lang="${lang}"></canvas>
        <figcaption><span class="ls-label">${esc(f.card)} · <span data-card-cap>${esc(f.preview)}</span></span>
          <span class="card-actions" data-card-actions hidden>
            <button type="button" class="ls-btn is-primary" data-card-share data-text="${esc(f.shareText)}">${ICONS.share}<span>${esc(f.share)}</span></button>
            <button type="button" class="ls-btn" data-card-save>${ICONS.down}<span>${esc(f.save)}</span></button>
          </span>
        </figcaption>
      </figure>
      </div>
    </div>
    <form class="fd-form ls-panel rv" data-founder novalidate autocomplete="on"
      data-msgs='${esc(JSON.stringify({ check: f.check, err: f.err, sent: f.sent, done: f.done, closed: f.closed }))}'>
      <div class="ls-head"><span class="ls-code">FRM·06</span><span class="ls-title">${esc(f.label)}</span><span class="ls-spacer"></span><span class="fd-link" data-fd-link><i aria-hidden="true"></i><span>${lang === 'de' ? 'Verbindung prüfen' : 'Checking link'}</span></span></div>
      <div class="fd-in">
        <p class="fd-closed" data-fd-closed${open ? ' hidden' : ''} role="note">${ICONS.lock}<span>${esc(f.closed)}</span></p>
        <div class="fld">
          <label for="fd-cs">${esc(f.callsign)}</label>
          <div class="fld-in"><input id="fd-cs" name="callsign" type="text" inputmode="text" autocomplete="username" spellcheck="false" autocapitalize="off" maxlength="16" required aria-describedby="fd-cs-h fd-cs-s" data-cs><span class="fld-mark" aria-hidden="true"></span></div>
          <p class="fld-state" id="fd-cs-s" aria-live="polite" data-cs-state></p>
          <p class="fld-hint" id="fd-cs-h">${esc(f.callsignHint)}</p>
        </div>
        <fieldset class="fld">
          <legend>${esc(f.faction)}</legend>
          <div class="seg seg-lg">${['europa', 'saturn', 'eris'].map((x) => `<label class="seg-b" style="--fx:${FX[x]}"><input type="radio" name="faction" value="${x}" required data-fd-fx><span>${x.toUpperCase()}</span></label>`).join('')}</div>
          <p class="fld-hint">${esc(f.factionHint)}</p>
        </fieldset>
        ${open ? `<div class="fld">
          <label for="fd-mail">${esc(f.email)}</label>
          <div class="fld-in"><input id="fd-mail" name="email" type="email" autocomplete="email" inputmode="email" spellcheck="false" required aria-describedby="fd-mail-h"><span class="fld-mark" aria-hidden="true"></span></div>
          <p class="fld-hint" id="fd-mail-h">${esc(f.emailHint)}</p>
        </div>
        ${consentBox}
        <button class="ls-btn is-primary is-big fd-submit" type="submit" data-click>${ICONS.signal}<span>${esc(f.submit)}</span></button>` : `${consentBox}<a class="ls-btn is-primary is-big fd-submit" href="${SITE.play}" data-click>${ICONS.play}<span>${esc(f.soonBtn)}</span></a>`}
        ${FLAGS.oauth.length ? `<p class="fd-or"><span>${esc(f.or)}</span></p>
        <div class="fd-oauth">
          ${FLAGS.oauth.map((k) => `<button type="button" class="ls-btn is-soon" data-oauth="${k}" disabled>${ICONS[k]}<span>${esc(f[k])}</span><em data-soon>${esc(f.soon)}</em></button>`).join('\n          ')}
        </div>
        <p class="fld-hint" data-oauth-note data-on="${esc(f.oauthNote)}">${esc(f.oauthSoon)}</p>` : ''}
        <p class="fd-msg" data-fd-msg role="status" aria-live="polite"></p>
      </div>
      <span class="ls-corners" aria-hidden="true"></span>
    </form>
  </div>
</section>`;
}

function community(t) {
  const c = t.community;
  const id = t.ids.community;
  return `<section class="sec ch ch-comm" id="${id}" aria-labelledby="${id}-h" data-ch="7">
  <div class="wrap">
    ${secHead(c.code, c.label, c.title, c.lede, id + '-h')}
    <ul class="comm-grid rv">${LINK_ORDER.map((k) => `<li>${social(k, t, 'tile')}</li>`).join('')}</ul>
  </div>
</section>`;
}

function faq(t) {
  const f = t.faq;
  const id = t.ids.faq;
  return `<section class="sec ch ch-faq" id="${id}" aria-labelledby="${id}-h" data-ch="7">
  <div class="wrap">
    <h2 class="faq-h" id="${id}-h"><span class="ls-num">${esc(t.faqHead.code)}</span>${esc(t.faqHead.title)}</h2>
    <div class="faq-list">${f.items.map(([q, a], i) => `<details class="qa">
      <summary><span class="ls-num">${pad(i + 1)}</span><span class="qa-q">${esc(q)}</span><i aria-hidden="true"></i></summary>
      <p>${esc(a)}</p>
    </details>`).join('')}</div>
  </div>
</section>`;
}

function homeBody(page, t) {
  return `${cosmos(t)}
${header(page, t)}
${rail(t)}
${hud(t)}
<main id="main" class="cine">
${hero(t)}
${shotsSection(t.lang, { ships: P(t.lang, 'ships'), world: P(t.lang, 'world') })}
${silence(t)}
${choose(t)}
${why(t)}
${hangar(t)}
${mapSec(t)}
${founder(t)}
${community(t)}
${faq(t)}
</main>
${footer(page, t)}`;
}

// ---------- Unterseiten ----------
function subShell(page, t, kicker, title, lede, inner) {
  return `<div class="sub-bg" aria-hidden="true"></div>
${header(page, t)}
<main id="main" class="sub">
  <div class="wrap">
    <header class="sub-head">
      <p class="sec-code"><span class="ls-num">${esc(kicker)}</span><i class="ls-tick" aria-hidden="true"></i></p>
      <h1>${esc(title)}</h1>
      ${lede ? `<p class="sec-lede">${esc(lede)}</p>` : ''}
    </header>
    ${inner}
  </div>
</main>
${footer(page, t)}`;
}

function newsBody(page, t) {
  const l = t.log;
  return subShell(page, t, t.news.kicker, t.news.title, l.lede, `<div class="log-grid">
      <ol class="log-list">${l.entries.map((e) => `<li class="log-entry">
        <article>
          <p class="log-meta"><time class="ls-num">${esc(e.date)}</time><span class="log-tag">${esc(e.tag)}</span></p>
          <h2>${esc(e.title)}</h2>
          <p>${esc(e.p)}</p>
          ${e.list ? `<ul class="log-items">${e.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        </article>
      </li>`).join('')}</ol>
      <aside class="road ls-panel" aria-labelledby="road-h">
        <div class="ls-head"><span class="ls-code">MAP·01</span><span class="ls-title" id="road-h">${esc(l.road)}</span></div>
        <ol class="road-list">${l.phases.map(([a, b], i) => `<li class="${i === 0 ? 'is-now' : ''}"><span class="road-n ls-num">${i + 1}</span><span class="road-t"><b>${esc(a)}</b><span>${esc(b)}</span></span>${i === 0 ? `<em>${esc(l.now)}</em>` : ''}</li>`).join('')}</ol>
        <span class="ls-corners" aria-hidden="true"></span>
      </aside>
    </div>`);
}

function table(caption, cols, rows) {
  return `<div class="wk-tbl ls-panel"><div class="ls-head"><span class="ls-title">${esc(caption)}</span></div>
  <table class="sec-table"><thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${c}</th>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table>
  <span class="ls-corners" aria-hidden="true"></span></div>`;
}

function wikiBody(page, t) {
  const w = t.wiki;
  const c = w.cols;
  const lang = t.lang;
  const homes = ['europa', 'saturn', 'eris'].map((f) => table(`${w.sectors} · ${f.toUpperCase()}`, [c.code, c.level, c.enemies],
    homeSectors(f, lang).map((s) => [`<b class="ls-num">${s.code}</b> ${esc(s.name)}`, `<span class="ls-num">${s.level}</span>`, esc(s.enemies)]))).join('');
  const two = (cap, a, b, list) => table(cap, [a, b], list.map(([x, y]) => [`<b>${esc(x)}</b>`, esc(y)]));
  return subShell(page, t, w.kicker, w.title, w.lede, `<div class="wk-grid">
    ${homes}
    ${table(w.shared, [c.area, c.where, c.level], w.sharedList.map(([a, b, d]) => [`<b class="ls-num">${esc(a)}</b>`, esc(b), `<span class="ls-num">${esc(d)}</span>`]))}
    ${two(w.currencies, w.currencies, c.what, w.currencyList)}
    ${two(w.lasers, w.lasers, c.what, w.laserList)}
    ${two(w.ammo, w.ammo, c.what, w.ammoList)}
    ${two(w.gens, w.gens, c.what, w.genList)}
    ${table(w.ranks, ['#', w.ranks], RANKS.map((r, i) => [`<span class="ls-num">${pad(i + 1)}</span>`, esc(r)]))}
  </div>
  <p class="plan-note">${esc(w.soon)} ${esc(t.hangar.planNote)}</p>`);
}

function hallBody(page, t) {
  const h = t.hall;
  const L = h.live;
  const iv = h.invite;
  const orders = ['honor', 'xp', 'kills', 'level'];
  const fx = ['europa', 'saturn', 'eris'];
  const FXC = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' }; // wie src/factions.js FX_HEX
  // Leere Tafel: Einladung statt leerer Plätze. src/hall.js füllt die Tafel mit echten Daten (hall_of_fame)
  // und zeigt die Einladung wieder, solange niemand eingetragen ist.
  const invite = `<li class="hall-invite"><div class="hi-in">
    <p class="ls-label"><span class="ls-num">01</span> ${esc(iv.kicker)}</p>
    <p class="hi-title">${esc(iv.title)}</p>
    <p class="hi-p">${esc(iv.p)}</p>
    <ol class="hi-steps">${iv.steps.map((x, i) => `<li><span class="ls-num">${pad(i + 1)}</span>${esc(x)}</li>`).join('')}</ol>
    <div class="hi-act"><a class="ls-btn is-primary is-gold is-big" href="${SITE.play}" data-click>${ICONS.play}<span>${esc(iv.play)}</span></a>${RELEASE.published ? `<a class="ls-btn is-big" href="${P(t.lang, 'download')}">${ICONS.download}<span>${esc(iv.dl)}</span></a>` : ''}</div>
  </div></li>`;
  return subShell(page, t, h.kicker, h.title, h.lede, `<div class="hall-grid">
    <section class="plaque ls-panel" aria-labelledby="plaque-h" data-hall data-lang="${t.lang}"
      data-t="${esc(JSON.stringify({ loading: L.loading, pilots: L.pilots, empty: L.empty, offline: L.offline, cols: L.cols, open: h.open }))}">
      <div class="ls-head"><span class="ls-code">HOF·01</span><span class="ls-title" id="plaque-h">${esc(h.plaque)}</span><span class="ls-spacer"></span><span class="hall-state"><i aria-hidden="true"></i><span data-hall-state>${esc(h.open)}</span></span></div>
      <div class="hall-ctl">
        <div class="hall-seg" role="group" aria-label="${esc(h.kicker)}">${orders.map((o, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" aria-pressed="${i === 0}" data-hall-order="${o}">${esc(L.tabs[i])}</button>`).join('')}</div>
        <div class="hall-seg" role="group" aria-label="${esc(L.cols[2])}"><button type="button" class="on" aria-pressed="true" data-hall-fx="">${esc(L.all)}</button>${fx.map((f) => `<button type="button" aria-pressed="false" data-hall-fx="${f}" style="--c:${FXC[f]}"><i aria-hidden="true"></i>${f.toUpperCase()}</button>`).join('')}</div>
      </div>
      <div class="plaque-in">
        <svg class="plaque-crest" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 6L106 32V88L60 114L14 88V32Z" class="pq-l"/><path d="M60 20L94 39V81L60 100L26 81V39Z" class="pq-l2"/><path d="M30 60H50L55 44L62 78L67 60H90" class="pq-sig"/></svg>
        <ol class="plaque-rows" data-hall-rows>${invite}</ol>
        <template data-hall-invite>${invite}</template>
        <p class="plaque-note">${esc(L.note)}</p>
      </div>
      <span class="ls-corners" aria-hidden="true"></span>
    </section>
    <aside class="hall-cats" aria-labelledby="cats-h">
      <h2 class="ls-label" id="cats-h">${esc(h.listsHead)}</h2>
      <p class="hc-sub">${esc(h.nowHead)}</p>
      <ol class="cat-list">${h.now.map((l, i) => `<li><span class="ls-num">${pad(i + 1)}</span>${esc(l)}</li>`).join('')}</ol>
      <p class="hc-sub">${esc(h.planHead)}</p>
      <ol class="cat-list is-plan">${h.lists.map((l, i) => `<li><span class="ls-num">${pad(i + 5)}</span>${esc(l)}</li>`).join('')}</ol>
      <p class="plan-note">${esc(h.periods)} ${esc(h.note)}</p>
    </aside>
  </div>`);
}

// ---------- Download ----------
const extOf = (key) => FILES[key].file.split('.').pop().toUpperCase();
function dlTile(p, i, t) {
  const d = t.download;
  const x = d.platforms[p.id];
  const lang = t.lang;
  const isWeb = !!p.web;
  const mainHref = isWeb ? SITE.play : releaseUrl(p.main);
  const mainSize = isWeb ? d.noDownload : fileSize(p.main, lang);
  const sizeCell = isWeb && p.alt.length ? `${d.noDownload} / .ipa ${fileSize(p.alt[0], lang)}` : mainSize;
  const verCell = isWeb && !p.alt.length ? SITE.version : RELEASE.version;
  const mainMeta = isWeb ? '' : `${extOf(p.main)} · ${mainSize}`;
  const mainLabel = isWeb ? (p.id === 'browser' ? t.hdr.play : d.open) : d.download;
  // Release noch nicht veröffentlicht: keine Links ins Leere, sondern ehrlich „bald verfügbar“
  const live = RELEASE.published;
  const mainBtn = isWeb || live
    ? `<a class="ls-btn is-primary is-big dl-main" href="${esc(mainHref)}"${isWeb ? '' : ` data-file="${esc(FILES[p.main].file)}"`} data-click>${isWeb ? ICONS.play : ICONS.download}<span>${esc(mainLabel)}</span>${mainMeta ? `<em class="ls-num">${esc(mainMeta)}</em>` : ''}</a>`
    : `<span class="ls-btn is-big dl-main is-pending" aria-disabled="true">${ICONS.download}<span>${esc(d.pending)}</span></span>`;
  const alts = p.alt.length ? `<ul class="dl-alts">${p.alt.map((k) => live
    ? `<li><a class="dl-alt" href="${esc(releaseUrl(k))}" data-file="${esc(FILES[k].file)}">${ICONS.download}<span>${esc(x.alt[k])}</span><em class="ls-num">${esc(extOf(k))} · ${esc(fileSize(k, lang))}</em></a></li>`
    : `<li><span class="dl-alt is-pending">${ICONS.download}<span>${esc(x.alt[k])}</span><em class="ls-num">${esc(d.pendingAlt)} · ${esc(extOf(k))}</em></span></li>`).join('')}</ul>` : '';
  const state = isWeb && !p.alt.length ? d.stateWeb : p.id === 'iphone' || p.id === 'ipad' ? `${d.stateWeb} / .ipa: ${d.sideload}` : d.stateTest;
  return `<li class="dl-item" data-dl="${p.id}" id="dl-${p.id}">
    <article class="dl ls-panel" aria-labelledby="dl-${p.id}-h">
      <div class="ls-head"><span class="ls-code">DL·${pad(i + 1)}</span><span class="ls-title">${esc(x.name)}</span><span class="ls-spacer"></span><span class="dl-yours" data-dl-yours hidden>${esc(d.yours)}</span></div>
      <div class="dl-in">
        <div class="dl-top"><span class="dl-ico">${ICONS[p.icon]}</span><div><h2 id="dl-${p.id}-h">${esc(x.name)}</h2><p class="dl-sub">${esc(x.main)}</p></div></div>
        <dl class="dl-meta">
          <div><dt>${esc(d.version)}</dt><dd class="ls-num">${esc(verCell)}</dd></div>
          <div><dt>${esc(d.size)}</dt><dd class="ls-num">${esc(sizeCell)}</dd></div>
          <div><dt>${esc(d.req)}</dt><dd>${esc(x.req)}</dd></div>
          <div><dt>${esc(d.state)}</dt><dd>${esc(state)}</dd></div>
        </dl>
        <div class="dl-act">${mainBtn}</div>
        ${alts ? `<p class="ls-label dl-more-l">${esc(p.id === 'iphone' || p.id === 'ipad' ? `${d.more} · ${d.sideload}` : d.more)}</p>${alts}` : ''}
        ${more(d.install, `<ol class="dl-steps">${x.steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>`, 'dl-how')}
      </div>
      <span class="ls-corners" aria-hidden="true"></span>
    </article>
  </li>`;
}

function downloadBody(page, t) {
  const d = t.download;
  return subShell(page, t, d.kicker, d.title, d.lede, `<div class="dl-rec ls-panel" data-dl-rec hidden aria-live="polite">
      <div class="ls-head"><span class="ls-code">DL·00</span><span class="ls-title">${esc(d.recommended)}</span></div>
      <div class="dl-rec-in"><p class="dl-rec-t"><span class="ls-label">${esc(d.detected)}</span><b data-dl-rec-name></b></p><div class="dl-rec-act" data-dl-rec-act></div></div>
      <span class="ls-corners" aria-hidden="true"></span>
    </div>
    <p class="dl-unknown" data-dl-unknown hidden>${esc(d.unknown)}</p>
    <ul class="dl-grid" data-dl-grid>${PLATFORMS.map((p, i) => dlTile(p, i, t)).join('')}</ul>
    <aside class="dl-note ls-panel" aria-labelledby="dl-note-h">
      <div class="ls-head"><span class="ls-code">DL·INF</span><span class="ls-title" id="dl-note-h">${esc(d.noteHead)}</span></div>
      <ul class="dl-notes">${RELEASE.published ? '' : `<li><b>${esc(d.pendingNote)}</b></li>`}${d.notes.map((n) => `<li>${esc(n.replace('{v}', RELEASE.version))}</li>`).join('')}</ul>
      ${RELEASE.published ? `<p class="dl-release"><a class="ls-btn" href="${esc(releasePage())}" target="_blank" rel="noopener noreferrer">${esc(d.release)}${ICONS.out}<span class="sr"> (${esc(t.ui.newTab)})</span></a></p>` : `<p class="dl-release"><a class="ls-btn is-primary" href="${SITE.play}">${ICONS.play}<span>${esc(G[t.lang].hero.play)}</span></a></p>`}
      <span class="ls-corners" aria-hidden="true"></span>
    </aside>`);
}

function shipsPage(page, t) {
  const g = G[page.lang].ships;
  return subShell(page, t, g.kicker, g.title, g.lede, shipsBody(page.lang));
}
function worldPage(page, t) {
  const g = G[page.lang].world;
  return subShell(page, t, g.kicker, g.title, g.lede, worldBody(page.lang, t.factions.list));
}

function legalBody(page, t) {
  const L = legal(page.id, FLAGS);
  return `<div class="sub-bg" aria-hidden="true"></div>
${header(page, t)}
<main id="main" class="legal">
  <div class="wrap legal-wrap">
    <article class="legal-body ls-panel"><div class="legal-in">${L}</div><span class="ls-corners" aria-hidden="true"></span></article>
  </div>
</main>
${footer(page, t)}`;
}

function notFoundBody(page, t) {
  return `<div class="sub-bg" aria-hidden="true"></div>
${header(page, t)}
<main id="main" class="nf">
  <div class="wrap nf-in">
    <p class="sec-code"><span class="ls-num">404</span><span>${esc(t.hero.earthState)}</span></p>
    <h1 class="nf-title">${esc(t.nf.title)}</h1>
    <p>${esc(t.nf.p)}</p>
    <p class="nf-en" lang="en">${esc(t.nf.en)}</p>
    <div class="hero-cta"><a class="ls-btn is-primary is-big" href="${href('de-home', null)}">${esc(t.nf.back)}</a><a class="ls-btn is-big" href="${href('en-home', null)}" lang="en">${esc(t.nf.enBack)}</a></div>
  </div>
</main>
${footer(page, t)}`;
}

export function renderPage(id, { mode = 'dev', reservationOpen = false, oauth = [] } = {}) {
  FLAGS = { reservationOpen, oauth };
  const page = pageById(id);
  if (!page) throw new Error('Unbekannte Seite: ' + id);
  setLinkMode(mode);
  FROM = page.id === 'not-found' ? null : page.lang;
  const t = T(page.lang);
  const k = page.id.replace(/^(de|en)-/, '');
  const body = k === 'home' ? homeBody(page, t)
    : k === 'news' ? newsBody(page, t)
      : k === 'wiki' ? wikiBody(page, t)
        : k === 'hall' ? hallBody(page, t)
          : k === 'download' ? downloadBody(page, t)
          : k === 'ships' ? shipsPage(page, t)
          : k === 'world' ? worldPage(page, t)
          : page.id === 'not-found' ? notFoundBody(page, t) : legalBody(page, t);
  return `<!doctype html>
<html lang="${page.lang}" data-page="${page.id}">
<head>
  ${head(page, t)}
</head>
<body data-kind="${k === 'home' ? 'home' : 'sub'}">
${body}
</body>
</html>
`;
}

export { PAGES };
