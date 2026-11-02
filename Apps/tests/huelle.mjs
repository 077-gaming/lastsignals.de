// Selbsttest der Desktop-Hülle (Electron, ungepackt) ohne sichtbares Fenster: Apps/desktop/main.cjs mit dem
// Web-Build in Apps/www (node web.mjs), eigenes leeres Profil, LS_HIDE_WINDOW=1.
// Aufruf (in Apps/): node tests/huelle.mjs   (Electron aus Apps/node_modules oder ELECTRON_BIN=/pfad/zu/Electron)
// Prüft: window.lsDesktop mit setGraphics, Desktop-Kennung schaltet EXTREM frei, Bildrate UNBEGRENZT (0) wird in
// einstellungen.json gemerkt und schaltet beim nächsten Start disable-frame-rate-limit/disable-gpu-vsync, eine
// Begrenzung (60) schaltet zurück auf Standard, Umstellung über das App-Menü bleibt beim Start erhalten.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, bisZumHub } from './gemeinsam.mjs';

const require = createRequire(path.join(ROOT, 'Code', 'package.json'));
const { _electron: electron } = require('playwright-core');

const APPS = path.join(ROOT, 'Apps');
const BIN = process.env.ELECTRON_BIN || (() => { try { return createRequire(path.join(APPS, 'package.json'))('electron'); } catch { return ''; } })();
if (!BIN || !fs.existsSync(BIN)) { console.error('Electron fehlt: in Apps/ npm ci ausführen oder ELECTRON_BIN setzen.'); process.exit(2); }
if (!fs.existsSync(path.join(APPS, 'www', 'index.html'))) { console.error('Web-Build fehlt: node web.mjs'); process.exit(2); }

const PROFIL = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-huelle-test-'));
const FILE = path.join(PROFIL, 'einstellungen.json');
const readS = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } };
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function start() {
  const app = await electron.launch({ executablePath: BIN, args: [APPS], env: { ...process.env, LS_USER_DATA: PROFIL, LS_HIDE_WINDOW: '1' }, timeout: 60000 });
  const page = await app.firstWindow();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errs };
}
const switches = (app) => app.evaluate(({ app: a }) => ({ fr: a.commandLine.hasSwitch('disable-frame-rate-limit'), vs: a.commandLine.hasSwitch('disable-gpu-vsync') }));
const settle = (page) => page.waitForTimeout(600);

try {
  // ---- Lauf 1: Grundstand, Spiel meldet Bildrate, Wahl 60
  {
    const { app, page, errs } = await start();
    const vis = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.isVisible()));
    check('Fenster bleibt unsichtbar (LS_HIDE_WINDOW)', vis.length === 1 && vis[0] === false, JSON.stringify(vis));
    const d = await page.evaluate(() => window.lsDesktop && { platform: window.lsDesktop.platform, set: typeof window.lsDesktop.setGraphics, unl: window.lsDesktop.unlimitedFps });
    check('window.lsDesktop mit setGraphics', !!d && d.set === 'function' && !!d.platform, JSON.stringify(d));
    check('Erster Start: Standard (keine Schalter)', !(await switches(app)).fr);
    await bisZumHub(page, { log: () => {} });
    await page.click('button[data-sec="einst"]');
    await page.waitForSelector('.st [data-gx]', { timeout: 10000 });
    const tiers = await page.$$eval('.st [data-gx] [data-gfx="preset"]', (b) => b.map((x) => x.dataset.v));
    check('Desktop-Kennung schaltet EXTREM frei', tiers.includes('extreme'), tiers.join(','));
    await page.click('.st [data-gx] [data-gfx="preset"][data-v="extreme"]');
    const q = await page.evaluate(() => JSON.parse(localStorage.getItem('ls.settings') || '{}').quality);
    check('EXTREM wählbar und gespeichert', q === 'extreme', String(q));
    await settle(page);
    let s = readS();
    check('Spiel meldet Grafik beim Start (graphics in einstellungen.json)', s.graphics && s.graphics.fpsCap === 0 && s.graphics.renderScale === 100, JSON.stringify(s.graphics));
    check('UNBEGRENZT (Standard im Spiel) → beim nächsten Start ohne Begrenzung', s.unlimitedFps === true);
    await page.click('.st [data-gx] [data-gfx="tab"][data-v="system"]');
    const tag = await page.$eval('.st [data-gx] .gx-row[data-k="fpsCap"] .gx-tag', (e) => e.textContent);
    check('Hinweis NEUSTART (APP) an der Bildrate', /NEUSTART \(APP\)/.test(tag), tag);
    await page.click('.st [data-gx] [data-gfx="set"][data-k="fpsCap"][data-v="60"]');
    await settle(page);
    s = readS();
    check('Bildrate 60 → Standard beim nächsten Start', s.unlimitedFps === false && s.graphics.fpsCap === 60, JSON.stringify({ u: s.unlimitedFps, g: s.graphics }));
    const r = await page.evaluate(() => window.lsDesktop.setGraphics({ fpsCap: 0, renderScale: 80 }));
    check('setGraphics liefert Neustart-Hinweis', r && r.unlimitedFps === true && r.restart === true, JSON.stringify(r));
    await page.evaluate(() => window.lsDesktop.setGraphics({ fpsCap: 60, renderScale: 100 }));
    const bad = await page.evaluate(() => window.lsDesktop.setGraphics({ fpsCap: 'x', renderScale: 9999 }));
    check('Ungültige Werte werden gesäubert', bad && readS().graphics.renderScale === 200 && readS().graphics.fpsCap === 60 && readS().unlimitedFps === false, JSON.stringify(readS().graphics));
    await page.evaluate(() => window.lsDesktop.setGraphics({ fpsCap: 60, renderScale: 100 }));
    const real = errs.filter((t) => !/Autofill|DevTools/.test(t));
    check('Keine Konsolenfehler', real.length === 0, real.slice(0, 3).join(' | '));
    await app.close();
  }
  // ---- Lauf 2: Bildrate 60 gemerkt → Standard; dann UNBEGRENZT wählen
  {
    const { app, page } = await start();
    const sw = await switches(app);
    check('Start nach Wahl 60: Standard (VSync, Begrenzung an)', !sw.fr && !sw.vs, JSON.stringify(sw));
    check('lsDesktop.unlimitedFps = false', (await page.evaluate(() => window.lsDesktop.unlimitedFps)) === false);
    await page.waitForSelector('.scr-boot, .scr-login', { timeout: 60000 });
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ls.settings') || '{}'); return !!s; });
    // im Spiel UNBEGRENZT wählen (wie der GRAFIK-Bereich: Einstellung schreiben, Ereignis ls:settings)
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ls.settings') || '{}');
      s.gfx = { ...(s.gfx || {}) }; delete s.gfx.fpsCap; // 0 = Standardwert des Schemas
      localStorage.setItem('ls.settings', JSON.stringify(s));
      window.dispatchEvent(new Event('ls:settings'));
    });
    await settle(page);
    check('UNBEGRENZT gewählt → gemerkt', readS().unlimitedFps === true && readS().graphics.fpsCap === 0, JSON.stringify(readS().graphics));
    await app.close();
  }
  // ---- Lauf 3: Schalter aktiv; Menü-Umstellung bleibt trotz gleicher Meldung beim Start
  {
    const { app, page } = await start();
    const sw = await switches(app);
    check('Start nach UNBEGRENZT: disable-frame-rate-limit und disable-gpu-vsync', sw.fr && sw.vs, JSON.stringify(sw));
    check('lsDesktop.unlimitedFps = true', (await page.evaluate(() => window.lsDesktop.unlimitedFps)) === true);
    await page.waitForSelector('.scr-boot, .scr-login', { timeout: 60000 });
    // App-Menü: Bildratenbegrenzung wieder an (ohne Rückfrage, wie über ls:unlimited-fps)
    await page.evaluate(() => window.lsDesktop.setUnlimitedFps(false));
    await page.evaluate(() => window.lsDesktop.setGraphics({ fpsCap: 0, renderScale: 100 })); // gleiche Meldung wie beim Start
    check('Menü-Umstellung bleibt bei unveränderter Spielwahl', readS().unlimitedFps === false);
    await app.close();
  }
} catch (err) {
  check('Ablauf ohne Ausnahme', false, String(err && err.stack || err).slice(0, 400));
}

fs.rmSync(PROFIL, { recursive: true, force: true });
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nDesktop-Hülle: alle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
