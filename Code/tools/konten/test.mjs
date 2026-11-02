// Konto-Ablauf im echten Chrome mit der Attrappe (?konto=attrappe, kein Netz, keine Mails), Ablauf aus
// Planung/KONTEN.md: Konto anlegen → Bestätigung → Anmeldung (Rufname aus den Metadaten) → Hub mit Server-Stand,
// Einstellungen (KONTO, Jetzt sichern), Ruhmeshalle, Flug mit Andocken (Sichern), anderes Gerät neuer (Konflikt →
// Rückkehr zur Station, Server-Stand gilt), neu laden („Weiter als …“), abmelden, falsches Passwort, vorbelegtes
// Konto ohne Rufnamen (Rufname sichern). Keine Konsolenfehler.
//
//   node tools/konten/test.mjs [--url http://localhost:5173] [--bilder <ordner>]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const BASE = arg('url', 'http://localhost:5173');
const IMG = arg('bilder', '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, info = '') => { if (!ok) failed++; console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${name}${info ? `  (${info})` : ''}`); };
const shot = async (page, name) => { if (IMG) await page.screenshot({ path: path.join(IMG, name + '.png') }); };
const waitFor = async (page, fn, a = null, ms = 15000) => { try { return await page.waitForFunction(fn, a, { timeout: ms }).then((h) => h.jsonValue()); } catch { return false; } };

if (IMG) await fs.mkdir(IMG, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  try {
    if (!localStorage.getItem('ls.settings')) localStorage.setItem('ls.settings', JSON.stringify({ quality: 'low', hudScale: 1, reducedMotion: true, rev: 2, master: 0, sfx: 0, music: 0 }));
    localStorage.setItem('ls.qauto', JSON.stringify({ v: 2, quality: 'low', gpu: 'konto-test' }));
  } catch { /* egal */ }
});
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const EMAIL = `kontotest${Date.now() % 100000}@attrappe.local`, PW = 'geheim1234', CS = 'Kt' + (Date.now() % 100000);
const title = async () => {
  await page.goto(`${BASE}/?konto=attrappe&mp=0`);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space'); // Vorspann überspringen
  return waitFor(page, () => !!document.querySelector('[data-konto] [data-acc]'), null, 20000);
};
const inHub = (cs) => waitFor(page, (c) => !!document.querySelector('.hb-nv[data-sec="einst"]') && document.body.innerText.toUpperCase().includes(c.toUpperCase()), cs, 30000);

check('Titel: Konto-Panel sichtbar', await title());
await page.evaluate(() => window.__lsMock.reset());
// 1) Konto anlegen
await page.click('[data-konto] [data-acc="signup"]');
await page.waitForSelector('.ac-modal input[name="email"]');
await sleep(300); // Dialog setzt den Fokus 20 ms nach dem Aufbau (sonst landet Text im falschen Feld)
await page.fill('.ac-modal input[name="email"]', EMAIL);
await page.fill('.ac-modal input[name="password"]', PW);
await page.fill('.ac-modal input[name="callsign"]', CS);
await page.click('.ac-modal [data-fx="saturn"]');
await shot(page, '01-konto-anlegen');
await page.click('.ac-modal [data-go]');
const sent = await waitFor(page, () => /BESTÄTIGUNGSMAIL/.test(document.querySelector('.ac-modal [data-msg]')?.textContent || ''), null, 8000);
check('Konto anlegen: Hinweis auf Bestätigungsmail', sent);
await sleep(300);
// 2) Anmelden vor der Bestätigung → Fehler, danach bestätigen und anmelden
await page.fill('.ac-modal input[name="password"]', PW);
await page.click('.ac-modal [data-go]');
const unconf = await waitFor(page, () => (document.querySelector('.ac-modal [data-msg]')?.dataset.k === 'err') && document.querySelector('.ac-modal [data-msg]').textContent, null, 8000);
check('Anmelden vor Bestätigung: Fehlermeldung', !!unconf, String(unconf));
await page.evaluate((e) => window.__lsMock.confirm(e), EMAIL);
await page.fill('.ac-modal input[name="password"]', 'falsch-falsch');
await page.click('.ac-modal [data-go]');
const wrong = await waitFor(page, () => /falsch/i.test(document.querySelector('.ac-modal [data-msg]')?.textContent || '') && document.querySelector('.ac-modal [data-msg]').textContent, null, 8000);
check('Falsches Passwort: verständliche Meldung', !!wrong, String(wrong));
await page.fill('.ac-modal input[name="password"]', PW);
await page.click('.ac-modal [data-go]');
check('Anmeldung: Rufname aus den Metadaten gesichert, Hub erreicht', await inHub(CS));
await shot(page, '02-hub');
const linked = await page.evaluate((cs) => { const a = window.__lsAccount; return a.signedIn && a.linked(cs) && a.pilot.faction === 'saturn'; }, CS);
check('Konto verknüpft (Pilot, Fraktion SATURN)', linked);
const saved = await waitFor(page, (cs) => { const S = window.__lsMock.state(); const p = S.pilots.find((x) => x.callsign === cs); return !!(p && S.saves[p.id]); }, CS, 10000);
check('Server-Stand angelegt (vor dem Hub gesichert)', saved);
// 3) Einstellungen → KONTO, Jetzt sichern
await page.click('.hb-nv[data-sec="einst"]');
await page.waitForSelector('[data-acc="sync"]', { timeout: 10000 });
const v0 = await page.evaluate((cs) => { const S = window.__lsMock.state(); const p = S.pilots.find((x) => x.callsign === cs); return S.saves[p.id].version; }, CS);
await page.click('[data-acc="sync"]');
const toastOk = await waitFor(page, () => [...document.querySelectorAll('.ac-toast')].some((t) => /gesichert|Server/i.test(t.textContent)), null, 8000);
check('Einstellungen: KONTO-Abschnitt, „Jetzt sichern“ meldet sich', toastOk);
const st = await page.evaluate(() => document.querySelector('[data-acc-st]')?.textContent || '');
check('Server-Stand-Anzeige im Hub', st.length > 0, st);
await shot(page, '03-einstellungen-konto');
// 4) Ruhmeshalle
await page.click('.hb-nv[data-sec="ruhm"]');
const hof = await waitFor(page, (cs) => (document.querySelector('.hof-tr.me .hof-cs')?.textContent || '') === cs.toUpperCase(), CS, 10000);
check('Ruhmeshalle: eigener Eintrag hervorgehoben', hof);
await shot(page, '04-ruhmeshalle');
// 5) Flug: Andocken sichert; anderes Gerät neuer → Konflikt → zurück zur Station, Server-Stand gilt
await page.click('.hb-nv[data-sec="start"]');
await page.click('[data-launch]');
const flying = await waitFor(page, () => !!(window.__ls && window.__ls.world && window.__ls.world.player && document.body.classList.contains('in-game')), null, 40000);
check('Flug gestartet', flying);
await sleep(2000);
const lv0 = await page.evaluate(() => window.__ls.world.profile.level || 1);
await page.evaluate((cs) => window.__lsMock.bump(cs, 9000, 2), CS);
await page.evaluate(() => { const w = window.__ls.world, s = w.sector.station; w.player.x = s.x + 120; w.player.z = s.z + 120; w.player.vx = 0; w.player.vz = 0; });
await sleep(400);
await page.evaluate(() => window.__ls.world.dock());
const warned = await waitFor(page, () => /anderes Gerät/i.test(document.body.innerText), null, 10000);
check('Andocken: Konflikt erkannt, Funkmeldung „anderes Gerät“', warned);
const back = await waitFor(page, () => !document.body.classList.contains('in-game') && !!document.querySelector('.hb-nv[data-sec="einst"]'), null, 30000);
check('Konflikt: Rückkehr zur Station (Hub)', back);
const lvAcc = await waitFor(page, ([cs, l0]) => { const a = window.__lsAccount; const p = !a.pending && a.local.get(cs); return p && (p.level || 1) >= l0 + 2 ? p.level : false; }, [CS, lv0], 10000)
  || await page.evaluate((cs) => window.__lsAccount.local.get(cs)?.level, CS);
check('Konflikt aufgelöst: Stand des anderen Geräts (mehr Fortschritt) gilt', !!lvAcc && lvAcc >= lv0 + 2, `Stufe ${lv0} → ${lvAcc}`);
await shot(page, '05-konflikt-hub');
// 6) Neu laden: „Weiter als …“
check('Neu geladen: Titel zeigt Kontopilot', await title() && await waitFor(page, () => !!document.querySelector('[data-konto] [data-acc="go"]'), null, 15000));
await page.click('[data-konto] [data-acc="go"]');
check('„Weiter als …“ startet mit dem Kontopiloten', await inHub(CS));
// 7) Abmelden im Hub
await page.click('.hb-nv[data-sec="einst"]');
await page.waitForSelector('[data-acc="logout"]', { timeout: 10000 });
await page.click('.st [data-acc="logout"], .ac-hub [data-acc="logout"]');
const out = await waitFor(page, (cs) => !window.__lsAccount.signedIn && !window.__lsAccount.linked(cs) && !!document.querySelector('[data-acc="login"]'), CS, 10000);
check('Abmelden: Konto getrennt, lokaler Pilot bleibt spielbar', out);
// 8) Vorbelegtes Konto ohne Rufnamen: Anmeldung fragt nach Rufnamen
const CS2 = 'Vb' + (Date.now() % 100000);
await page.click('[data-acc="login"]');
await page.waitForSelector('.ac-modal input[name="email"]');
await sleep(300); // Dialog setzt den Fokus 20 ms nach dem Aufbau (sonst landet Text im falschen Feld)
await page.fill('.ac-modal input[name="email"]', 'test@attrappe.local');
await page.fill('.ac-modal input[name="password"]', 'geheim123');
await page.click('.ac-modal [data-go]');
const claim = await waitFor(page, () => !!document.querySelector('.ac-modal input[name="callsign"]'), null, 8000);
check('Konto ohne Rufnamen: Dialog „Rufname sichern“', claim);
await sleep(300);
await page.fill('.ac-modal input[name="callsign"]', CS);
await page.click('.ac-modal [data-fx="eris"]');
await page.click('.ac-modal [data-go]');
const taken = await waitFor(page, () => document.querySelector('.ac-modal [data-msg]')?.dataset.k === 'err' && document.querySelector('.ac-modal [data-msg]').textContent, null, 8000);
check('Rufname vergeben: Meldung', !!taken, String(taken));
await page.fill('.ac-modal input[name="callsign"]', CS2);
await page.click('.ac-modal [data-go]');
check('Rufname gesichert: Wechsel zum neuen Kontopiloten', await inHub(CS2));
const p2 = await page.evaluate(() => ({ cs: window.__lsAccount.pilot?.callsign, f: window.__lsAccount.pilot?.faction }));
check('Neuer Kontopilot ERIS', p2.cs === CS2 && p2.f === 'eris', JSON.stringify(p2));
await shot(page, '06-zweites-konto');

const real = errors.filter((e) => !/AudioContext/.test(e));
check('Keine Konsolenfehler', real.length === 0, real.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nAlle Konto-Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
