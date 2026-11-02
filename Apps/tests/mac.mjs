// Test der Mac-App (gepackte LAST SIGNALS.app) mit playwright-core _electron.
// Aufruf (in Apps/): node tests/mac.mjs [pfad/zur/LAST SIGNALS.app]
// Prüft: Fenster öffnet, window.lsDesktop, kein Service Worker, Systemstart → Anmeldung → Fraktion → Hub,
// keine fehlenden Dateien, Realtime-Verbindung (Koop), Fenstergröße wird gemerkt, Bildratenschalter.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, realtimeConfig, realtimeCheck, bisZumHub } from './gemeinsam.mjs';

const require = createRequire(path.join(ROOT, 'Code', 'package.json'));
const { _electron: electron } = require('playwright-core');

const APP = path.resolve(process.argv[2] || path.join(ROOT, 'Apps', 'out', 'mac', 'build', 'LAST SIGNALS-darwin-arm64', 'LAST SIGNALS.app'));
const EXE = path.join(APP, 'Contents', 'MacOS', 'LAST SIGNALS');
const BELEGE = path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads', 'belege');
fs.mkdirSync(BELEGE, { recursive: true });
const PROFIL = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-mac-test-'));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

async function start(env = {}) {
  const app = await electron.launch({ executablePath: EXE, env: { ...process.env, LS_USER_DATA: PROFIL, ...env }, timeout: 60000 });
  const page = await app.firstWindow();
  return { app, page };
}
const fps = (page) => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(Math.round(n / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(f); }));

// ---- Lauf 1: Spiel bis zum Hub
{
  const { app, page } = await start();
  const missing = [];
  const consoleErr = [];
  page.on('response', (r) => { if (r.url().startsWith('app://') && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });
  page.on('pageerror', (e) => consoleErr.push('pageerror: ' + e.message));
  await page.waitForLoadState('domcontentloaded');
  check('Fenster lädt app://ls/', page.url().startsWith('app://ls/'), page.url());
  const desk = await page.evaluate(() => window.lsDesktop && { platform: window.lsDesktop.platform, version: window.lsDesktop.version, electron: window.lsDesktop.electron, arch: window.lsDesktop.arch, fn: typeof window.lsDesktop.fullscreen });
  check('window.lsDesktop vorhanden (platform mac)', !!desk && desk.platform === 'mac' && !!desk.version, JSON.stringify(desk));
  const iso = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
  check('Kein Node im Spiel (contextIsolation, nodeIntegration aus)', iso.require === 'undefined' && iso.process === 'undefined', JSON.stringify(iso));
  await bisZumHub(page);
  await page.screenshot({ path: path.join(BELEGE, 'mac-hub.png') });
  const sw = await page.evaluate(async () => {
    if (!navigator.serviceWorker) return 'keine API';
    try { return String((await navigator.serviceWorker.getRegistrations()).length); } catch (e) { return 'nicht möglich (' + e.name + ')'; }
  });
  check('Kein Service Worker registriert', sw !== '1' && !/^[1-9]/.test(sw), `Registrierungen: ${sw}`);
  const install = await page.evaluate(() => { const b = document.querySelector('[data-install]'); return !b || (b.hidden && getComputedStyle(b).display === 'none'); });
  check('Knopf „App installieren“ ausgeblendet', install === true);
  const webgl = await page.evaluate(() => { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); if (!gl) return null; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'webgl2'; });
  check('WebGL2 verfügbar', !!webgl, String(webgl));
  const rt = await realtimeCheck(page, realtimeConfig());
  check('Supabase Realtime: Kanal betreten und Broadcast-Echo', rt.ok, JSON.stringify(rt));
  check('Keine fehlenden Dateien (app://)', missing.length === 0, missing.slice(0, 5).join(' | '));
  const realErr = consoleErr.filter((t) => !/Download the React DevTools|Autofill/.test(t));
  check('Keine Fehler in der Konsole', realErr.length === 0, realErr.slice(0, 3).join(' | '));
  console.log('      Bildrate (rAF, begrenzt):', await fps(page));
  // Fenstergröße setzen, dann schließen → beim nächsten Start gleich groß
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: 120, y: 90, width: 1234, height: 777 }); });
  await page.waitForTimeout(900);
  await app.close();
}

// ---- Lauf 2: Fenstergröße gemerkt, Spielstand bleibt, Bildratenbegrenzung aus
{
  const s = JSON.parse(fs.readFileSync(path.join(PROFIL, 'einstellungen.json'), 'utf8'));
  s.unlimitedFps = true;
  fs.writeFileSync(path.join(PROFIL, 'einstellungen.json'), JSON.stringify(s));
  const { app, page } = await start();
  await page.waitForLoadState('domcontentloaded');
  const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  check('Fenstergröße gemerkt', Math.abs(b.width - 1234) <= 2 && Math.abs(b.height - 777) <= 2, JSON.stringify(b));
  const sw = await app.evaluate(({ app: a }) => ({ fr: a.commandLine.hasSwitch('disable-frame-rate-limit'), vs: a.commandLine.hasSwitch('disable-gpu-vsync'), gpu: a.commandLine.hasSwitch('force_high_performance_gpu') }));
  check('Schalter: Hochleistungs-GPU', sw.gpu);
  check('Schalter: Bildratenbegrenzung aus nach Neustart', sw.fr && sw.vs, JSON.stringify(sw));
  const unl = await page.evaluate(() => window.lsDesktop.unlimitedFps);
  check('lsDesktop.unlimitedFps meldet Einstellung', unl === true);
  await page.waitForSelector('#sc-callsign, .scr-boot', { timeout: 60000 });
  if (await page.$('.scr-boot')) { await page.waitForTimeout(800); await page.mouse.click(400, 300); }
  await page.waitForSelector('#sc-callsign', { timeout: 30000 });
  const known = await page.evaluate(() => [...document.querySelectorAll('.pi-row')].map((r) => r.dataset.cs));
  check('Spielstand bleibt im App-Profil erhalten', known.includes('AppTest'), JSON.stringify(known));
  console.log('      Bildrate (rAF, unbegrenzt):', await fps(page));
  const fs1 = await page.evaluate(() => window.lsDesktop.fullscreen(true));
  await page.waitForTimeout(1500);
  const isFs = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  check('Vollbild über lsDesktop.fullscreen()', fs1 === true || isFs === true, `fullscreen=${isFs}`);
  await page.evaluate(() => window.lsDesktop.fullscreen(false));
  await page.waitForTimeout(1500);
  await app.close();
}

fs.rmSync(PROFIL, { recursive: true, force: true });
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nMac-App: alle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
