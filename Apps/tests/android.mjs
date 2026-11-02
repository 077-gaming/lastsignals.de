// Test der Android-App (Debug-APK) im Emulator.
// Aufruf (in Apps/): node tests/android.mjs [pfad/zur.apk]
// Braucht: Android-SDK mit emulator und system-images;android-36;google_apis;arm64-v8a (siehe ANLEITUNG.md).
// Ablauf: Emulator (ohne Fenster) starten, APK frisch installieren, App starten, über WebView-Debugging (nur Debug-APK)
// mit playwright-core verbinden → Systemstart, Anmeldung, Fraktion, Hub, dann Hülle, Service Worker, WebGL, Realtime.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, realtimeConfig, realtimeCheck, bisZumHub } from './gemeinsam.mjs';

const require = createRequire(path.join(ROOT, 'Code', 'package.json'));
const { _android: android } = require('playwright-core');
const SDK = process.env.ANDROID_HOME || '/opt/homebrew/share/android-commandlinetools';
const JAVA = process.env.JAVA_HOME || '/opt/homebrew/opt/openjdk@21';
const APK = path.resolve(process.argv[2] || path.join(ROOT, 'Apps', 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'));
const IMAGE = 'system-images;android-36;google_apis;arm64-v8a';
const AVD = 'LS_Test';
const PKG = 'de.lastsignals.spiel';
const BELEGE = path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads', 'belege');
fs.mkdirSync(BELEGE, { recursive: true });
const env = { ...process.env, ANDROID_HOME: SDK, ANDROID_SDK_ROOT: SDK, JAVA_HOME: JAVA };
const adb = (...a) => execFileSync(path.join(SDK, 'platform-tools', 'adb'), a, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

// AVD anlegen (einmalig)
const avds = execFileSync(path.join(SDK, 'emulator', 'emulator'), ['-list-avds'], { encoding: 'utf8', env });
if (!avds.split('\n').includes(AVD)) {
  execFileSync(path.join(SDK, 'cmdline-tools', 'latest', 'bin', 'avdmanager'), ['create', 'avd', '-n', AVD, '-k', IMAGE, '-d', 'pixel_7', '--force'], { input: 'no\n', env, stdio: ['pipe', 'inherit', 'inherit'] });
}
// Emulator starten (falls keiner läuft)
let emu = null;
if (!/emulator-\d+\s+device/.test(adb('devices'))) {
  emu = spawn(path.join(SDK, 'emulator', 'emulator'), ['-avd', AVD, '-no-window', '-no-audio', '-no-snapshot', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-memory', '4096'], { env, stdio: 'ignore', detached: true });
  console.log('Emulator startet …');
}
adb('wait-for-device');
for (let i = 0; i < 240 && adb('shell', 'getprop', 'sys.boot_completed') !== '1'; i++) await sleep(1000);
console.log('Android', adb('shell', 'getprop', 'ro.build.version.release'), '· WebView', (adb('shell', 'dumpsys', 'package', 'com.google.android.webview').match(/versionName=([\d.]+)/) || [])[1] || '?');

// Hinweis „Vollbildansicht“ des Systems im Test-Emulator nicht anzeigen (nur Emulator-Einstellung)
try { adb('shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed'); } catch { /* egal */ }
try { adb('uninstall', PKG); } catch { /* war nicht installiert */ }
adb('install', '-r', APK);
adb('shell', 'am', 'start', '-W', '-n', `${PKG}/.MainActivity`);
const [device] = await android.devices();
if (!device) { console.error('Kein Android-Gerät/Emulator über adb erreichbar'); process.exit(1); }
const webview = await device.webView({ pkg: PKG }, { timeout: 60000 });
const page = await webview.page();
const missing = [];
page.on('response', (r) => { if (r.url().startsWith('https://localhost') && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
check('WebView lädt https://localhost', page.url().startsWith('https://localhost'), page.url());
const shell = await page.evaluate(() => ({ cap: !!(window.Capacitor && window.Capacitor.isNativePlatform()), plat: window.Capacitor && window.Capacitor.getPlatform(), vw: innerWidth, vh: innerHeight }));
check('Capacitor nativ (Android)', shell.cap && shell.plat === 'android', JSON.stringify(shell));
check('Querformat', shell.vw > shell.vh);
const vp = await page.evaluate(() => ({ meta: document.querySelector('meta[name=viewport]').content, w: innerWidth, h: innerHeight, docW: document.documentElement.clientWidth }));
check('Feste Layout-Breite des Spiels wird beachtet (kein Abschneiden)', vp.docW >= 1300, JSON.stringify(vp));
await bisZumHub(page, { callsign: 'AndroidTest' });
await page.waitForSelector('[data-load]', { state: 'detached', timeout: 180000 }).then(() => check('3D-Bühne des Hubs geladen', true), () => check('3D-Bühne des Hubs geladen', false, 'nach 180 s noch nicht fertig'));
const sw = await page.evaluate(async () => { try { return navigator.serviceWorker ? String((await navigator.serviceWorker.getRegistrations()).length) : 'keine API'; } catch (e) { return 'nicht möglich (' + e.name + ')'; } });
check('Kein Service Worker registriert', !/^[1-9]/.test(sw), sw);
const install = await page.evaluate(() => { const b = document.querySelector('[data-install]'); return !b || getComputedStyle(b).display === 'none'; });
check('Knopf „App installieren“ ausgeblendet', install);
const webgl = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return null; const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2'; });
check('WebGL2 verfügbar', !!webgl, String(webgl));
const rt = await realtimeCheck(page, realtimeConfig());
check('Supabase Realtime: Kanal betreten und Broadcast-Echo', rt.ok, JSON.stringify(rt));
check('Keine fehlenden Dateien', missing.length === 0, missing.slice(0, 5).join(' | '));
const bars = adb('shell', 'dumpsys', 'window', 'windows').match(/mCurrentFocus=.*|isStatusBarVisible.*|statusBars.*visible.*/g) || [];
console.log('      Fenster:', bars.slice(0, 2).join(' · '));
const shot = path.join(BELEGE, 'android-hub.png');
fs.writeFileSync(shot, execFileSync(path.join(SDK, 'platform-tools', 'adb'), ['exec-out', 'screencap', '-p'], { env, maxBuffer: 64 << 20 }));
console.log('Bildschirmfoto:', shot);
await device.close().catch(() => {});
if (emu && process.env.LS_EMU_BEHALTEN !== '1') { try { adb('emu', 'kill'); } catch { /* egal */ } }
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nAndroid: alle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
