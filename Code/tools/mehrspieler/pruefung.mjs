#!/usr/bin/env node
// Zweiter Mehrspieler-Test (Prüfung): HTML im Rufnamen (XSS), Tab im Hintergrund (visibilitychange), Ankunftsschutz,
// PvP aus greift nicht an, Treffer aus zu großer Entfernung, Presence-Grenze von Supabase (PvP-Schalter und
// Tab-Wechsel in schneller Folge), Wiederverbinden nach geschlossenem Kanal, Einladung über Fraktionen und Rückkehr
// des Gasts in die eigenen Sektoren. Drei Piloten Xray (SATURN), Yank (ERIS), Zulu (EUROPA) in Sektor 3.
//
//   node tools/mehrspieler/pruefung.mjs [http://localhost:5191] [bilderordner]
import { chromium } from 'playwright-core';
import os from 'node:os';
const BASE = process.argv[2] || 'http://localhost:5191';
const IMG = process.argv[3] || os.tmpdir();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${n}${x ? '  (' + x + ')' : ''}`); if (!ok) failed++; };
async function waitFor(page, fn, arg, ms = 15000) {
  const t0 = Date.now();
  for (;;) { let v = null; try { v = await page.evaluate(fn, arg); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(200); }
}
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,800'] });
const errors = {};
async function open(key, cs, f) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('ls.settings', JSON.stringify({ quality: 'low', hudScale: 1, reducedMotion: true, rev: 2, master: 0, sfx: 0, music: 0 })); localStorage.setItem('ls.qauto', JSON.stringify({ v: 2, quality: 'low', gpu: 'mp-test' })); } catch {} });
  const page = await ctx.newPage();
  errors[key] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors[key].push(m.text()); });
  page.on('pageerror', (e) => errors[key].push('pageerror: ' + e.message));
  await page.goto(`${BASE}/?dev=game&f=${f}&cs=${cs}`);
  check(`${cs}: verbunden`, await waitFor(page, () => !!(window.__ls && window.__ls.mp && window.__ls.mp.secReady), null, 30000));
  return page;
}
const place = (page, sec, x, z) => page.evaluate(([sec, x, z]) => {
  const w = window.__ls.world; w._changeSector(sec, null);
  for (const e of w.enemies) { e.alive = false; e.respawnAt = Infinity; w.entities.delete(e.id); w.bus.emit('despawn', { id: e.id }); }
  const p = w.player; p.x = p.px = x; p.z = p.pz = z; p.rot = p.prot = 0; w._haltPlayer(); p.hasMove = false;
  const st = document.createElement('style'); st.textContent = '.lsg, .hud-coach { display: none !important; }'; document.head.appendChild(st);
}, [sec, x, z]);

const X = await open('X', 'Xray', 'saturn');
const Y = await open('Y', 'Yank', 'eris');
const Z = await open('Z', 'Zulu', 'europa');
await place(X, 'SA-3', 0, 0); await place(Y, 'ER-3', 0, -300); await place(Z, 'EU-3', 200, -100);
const sid = {};
for (const [k, p] of [['X', X], ['Y', Y], ['Z', Z]]) sid[k] = await p.evaluate(() => window.__ls.mp.sid);
check('alle sehen sich', (await waitFor(X, () => window.__ls.mp.roster().length >= 2, null, 20000)) && (await waitFor(Y, () => window.__ls.mp.roster().length >= 2, null, 20000)));

// Ankunftsschutz: direkt nach Ankunft (PvP an bei X und Y) noch nicht angreifbar, nach 8 s schon
for (const pg of [X, Y]) await pg.evaluate(() => { window.__ls.mp.arriveAt = performance.now() / 1000; window.__ls.mp.setPvp(true); });
await sleep(1500);
const early = await X.evaluate((s) => !!window.__ls.world.entities.get('rp:' + s)?.pvpOk, sid.Y);
const later = await waitFor(X, (s) => !!window.__ls.world.entities.get('rp:' + s)?.pvpOk, sid.Y, 15000);
check('Ankunftsschutz: erst nach 8 s angreifbar', !early && later);

// PvP aus beim Schützen: Z (EUROPA, PvP aus) kann Y nicht anwählen
const zt = await Z.evaluate((s) => { const w = window.__ls.world; w.setTarget('rp:' + s); return w.player.targetId; }, sid.Y);
check('PvP aus: Schütze kann fremden Piloten nicht anwählen', zt !== 'rp:' + sid.Y, String(zt));
// Z hat PvP aus → Y kann Z nicht angreifen
const yz = await Y.evaluate((s) => !!window.__ls.world.entities.get('rp:' + s)?.pvpOk, sid.Z);
check('PvP aus: Pilot mit PvP aus ist nicht angreifbar', !yz);

// Gefälschter Treffer aus großer Entfernung wird verworfen
await X.evaluate(() => { const p = window.__ls.world.player; p.x = p.px = 0; p.z = p.pz = -3000; });
await sleep(1500);
const yhp0 = await Y.evaluate(() => { const p = window.__ls.world.player; return p.hp + p.shield; });
await X.evaluate(async (s) => { const mp = window.__ls.mp; mp.hitOn.set(s, performance.now() / 1000); mp._send(mp.secCh, 'hit', { i: mp.sid, to: s, d: 500, s: 0 }); }, sid.Y);
await sleep(1500);
const yhp1 = await Y.evaluate(() => { const p = window.__ls.world.player; return p.hp + p.shield; });
check('Treffer aus zu großer Entfernung wird vom Opfer verworfen', yhp1 === yhp0, `${yhp0} → ${yhp1}`);
await X.evaluate(() => { const p = window.__ls.world.player; p.x = p.px = 0; p.z = p.pz = 0; });

// XSS: Z setzt Rufnamen mit HTML, sendet Chat, Presence und Einladung an Y
await Z.evaluate(() => { window.__ls.world.profile.callsign = '<svg/onload=__x=1>'; });
await waitFor(Y, () => window.__ls.mp.roster().some((r) => r.cs.includes('svg')), null, 40000);
await Z.evaluate(() => window.__ls.mp.say('sector', '<img src=x onerror="window.__x=2">hallo'));
await Z.evaluate((s) => window.__ls.mp.invite(s), sid.Y);
await waitFor(Y, () => window.__ls.mp.invites().length && window.__ls.mp.chat.sector.some((m) => m.text.includes('hallo')), null, 8000);
const xss = await Y.evaluate(() => ({ x: window.__x, svg: document.querySelectorAll('.mc-log svg, .mc-log img, [data-win="players"] svg:not(.hb-ic) , .mpn-layer svg, .mpn-layer img').length - document.querySelectorAll('[data-win="players"] .hw-btn svg').length, img: document.querySelectorAll('img[src="x"]').length, name: window.__ls.mp.roster().find((r) => r.cs.includes('svg'))?.cs, inv: window.__ls.mp.invites().length, tagTxt: [...document.querySelectorAll('.mpn.on .mpn-n')].map((n) => n.textContent), which: [...document.querySelectorAll('.mc-log svg, .mc-log img, [data-win="players"] svg:not(.hb-ic) , .mpn-layer svg, .mpn-layer img')].map((e) => e.outerHTML.slice(0, 120) + ' @' + e.parentElement.className) }));
check('XSS: Rufname und Text mit HTML werden nicht ausgeführt', xss.x === undefined && xss.img === 0 && xss.svg === 0 && xss.name, JSON.stringify(xss));
await Y.screenshot({ path: IMG + '/p1-xss-name-escaped.png' });
await Y.evaluate((s) => window.__ls.mp.answer(s, false), sid.Z);
await Z.evaluate(() => { window.__ls.world.profile.callsign = 'Zulu'; window.__ls.mp._track(true); });

// Namensschilder: Y sieht Schilder
check('Namensschilder sichtbar', await waitFor(X, () => document.querySelectorAll('.mpn.on').length >= 1, null, 5000));

// Tab im Hintergrund (visibilitychange): Y versteckt → X räumt Y auf, Y sendet nichts; zurück → X sieht Y wieder
await Y.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
const goneX = await waitFor(X, (s) => !window.__ls.mp.roster().some((r) => r.sid === s) && !window.__ls.world.entities.get('rp:' + s), sid.Y, 8000);
await sleep(2500);
const stillGone = await X.evaluate((s) => !window.__ls.mp.roster().some((r) => r.sid === s) && !window.__ls.world.entities.get('rp:' + s), sid.Y);
check('Tab im Hintergrund: andere nehmen das Schiff heraus und es kommt nicht zurück', goneX && stillGone);
await Y.evaluate(() => { delete document.hidden; delete document.visibilityState; Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
const backX = await waitFor(X, (s) => !!window.__ls.world.entities.get('rp:' + s), sid.Y, 10000);
const backY = await waitFor(Y, (s) => !!window.__ls.world.entities.get('rp:' + s), sid.X, 10000);
check('Tab wieder vorne: beide sehen sich wieder', backX && backY);

// Stress: PvP 6× umschalten, Tab 3× in den Hintergrund und zurück, alles in ≈ 10 s → Kanal muss offen bleiben
for (let i = 0; i < 6; i++) { await Y.evaluate((on) => window.__ls.mp.setPvp(on), i % 2 === 0); await sleep(300); }
for (let i = 0; i < 3; i++) {
  await Y.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(700);
  await Y.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(1200);
}
await sleep(4000);
const stress = await Y.evaluate(() => ({ ready: window.__ls.mp.secReady, st: window.__ls.mp.status, sc: window.__ls.mp.secCh && window.__ls.mp.secCh.state }));
check('Stress (PvP-Schalter, Tab-Wechsel): Sektorkanal bleibt offen', stress.ready && stress.sc === 'joined', JSON.stringify(stress));
check('Stress: X sieht Y danach', await waitFor(X, (s) => !!window.__ls.world.entities.get('rp:' + s), sid.Y, 8000));
// Wiederverbinden: Server schließt den Kanal (simuliert über Schließen des Kanals ohne mp.js) → neu verbunden
await Z.evaluate(() => { const mp = window.__ls.mp; mp.secCh.unsubscribe(); });
const rej = await waitFor(Z, () => window.__ls.mp.secReady && window.__ls.mp.secCh.state === 'joined' && window.__ls.mp.roster().length >= 2, null, 20000);
check('Kanal vom Server geschlossen: verbindet selbst neu', rej);
// Einladung über Fraktionen: X (SATURN) lädt Y (ERIS) ein → Y Gast in SA-3, Kanal bleibt front-3
await X.evaluate(() => window.__ls.mp.setPvp(false)); await Y.evaluate(() => window.__ls.mp.setPvp(false));
await X.evaluate((s) => window.__ls.mp.invite(s), sid.Y);
check('Einladung kommt an (über Fraktionen)', await waitFor(Y, (s) => window.__ls.mp.invites().some((v) => v.sid === s), sid.X, 6000));
await Y.evaluate((s) => window.__ls.mp.answer(s, true), sid.X);
const cx = await waitFor(X, () => window.__ls.world.coop && window.__ls.world.entities.get('ally'), null, 15000);
const cy = await waitFor(Y, () => window.__ls.world.coop && window.__ls.world.entities.get('ally') && window.__ls.world.sector.id === 'SA-3', null, 15000);
const ych = await Y.evaluate(() => ({ key: window.__ls.mp.secKey, ready: window.__ls.mp.secReady, sec: window.__ls.world.sector.id }));
check('Einladung über Fraktionen → Koop, Gast im Sektor des Gastgebers, Kanal bleibt', cx && cy && ych.key === 'ls-mp-front-3' && ych.ready, JSON.stringify(ych));
await sleep(2500);
const zSees = await Z.evaluate(() => window.__ls.mp.roster().map((r) => r.cs).sort().join(','));
check('Dritter sieht beide Koop-Piloten weiter', zSees.includes('Xray') && zSees.includes('Yank'), zSees);
await X.screenshot({ path: IMG + '/p2-koop-ueber-fraktionen.png' });
// Y verlässt den Koop → wieder eigene Sektoren (ERIS)
await Y.evaluate(() => window.__ls.mp.leaveCoop());
await sleep(1500);
const yAfter = await Y.evaluate(() => { const w = window.__ls.world; return { st: window.__ls.mp.status, sc: window.__ls.mp.secCh && window.__ls.mp.secCh.state, sec: w.sector.id, home: w._homeFac, keys: Object.keys(w.sectors)[0], key: window.__ls.mp.secKey, ready: window.__ls.mp.secReady }; });
check('Koop verlassen (Gast anderer Fraktion): zurück in eigenen Sektoren', yAfter.home === 'eris' && yAfter.sec === 'ER-3' && yAfter.key === 'ls-mp-front-3', JSON.stringify(yAfter));
const xSeesY = await waitFor(X, (s) => !window.__ls.world.entities.get('ally') && !!window.__ls.world.entities.get('rp:' + s), sid.Y, 10000);
check('Nach Koop-Ende: X sieht Y wieder als normalen Piloten', xSeesY);

for (const k of Object.keys(errors)) check(`${k}: 0 Konsolenfehler`, errors[k].length === 0, errors[k].slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FEHLER` : '\nAlles bestanden.');
process.exit(failed ? 1 : 0);
