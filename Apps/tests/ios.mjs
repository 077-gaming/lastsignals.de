// Test der iPhone/iPad-App im iOS-Simulator (Debug-Build mit Prüf-Haken, siehe ShellViewController).
// Aufruf (in Apps/): node tests/ios.mjs ["iPhone 18 Pro"] [pfad/App.app]
// Ablauf: Simulator starten, App frisch installieren, mit -lsTestJS starten → Systemstart, Anmeldung, Fraktion, Hub,
// danach Hülle, Service Worker, WebGL, sichere Bereiche und Supabase Realtime prüfen, Bildschirmfoto als Beleg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, realtimeConfig, ablaufSkript } from './gemeinsam.mjs';

const DEVICE = process.argv[2] || 'iPhone 18 Pro';
const APP = path.resolve(process.argv[3] || path.join(ROOT, 'Apps', 'ios', 'DerivedData', 'Build', 'Products', 'Debug-iphonesimulator', 'App.app'));
const BUNDLE = 'de.lastsignals.spiel';
const BELEGE = path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads', 'belege');
fs.mkdirSync(BELEGE, { recursive: true });
const simctl = (...a) => execFileSync('xcrun', ['simctl', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };

const devs = JSON.parse(simctl('list', 'devices', 'available', '-j')).devices;
const dev = Object.values(devs).flat().find((d) => d.udid === DEVICE || d.name === DEVICE);
if (!dev) { console.error('Simulator nicht gefunden:', DEVICE); process.exit(1); }
console.log(`Simulator: ${dev.name} (${dev.udid}), App: ${APP}`);
try { simctl('boot', dev.udid); } catch { /* läuft schon */ }
simctl('bootstatus', dev.udid, '-b');
try { simctl('uninstall', dev.udid, BUNDLE); } catch { /* war nicht installiert */ }
simctl('install', dev.udid, APP);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-ios-test-'));
const js = path.join(tmp, 'ablauf.js'), out = path.join(tmp, 'ergebnis.json');
fs.writeFileSync(js, ablaufSkript({ ...realtimeConfig(), callsign: 'iOSTest' }));
simctl('launch', '--terminate-running-process', dev.udid, BUNDLE, '-lsTestJS', js, '-lsTestOut', out);

let r = null;
for (let i = 0; i < 300; i++) {
  await sleep(1000);
  try { r = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { r = null; }
  if (r && r.fertig) break;
}
const shot = path.join(BELEGE, `ios-${dev.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-hub.png`);
simctl('io', dev.udid, 'screenshot', shot);
// iPad-Simulator liefert das Bild hochkant (Gerät im Hochformat), Inhalt ist quer: drehen
try { const dim = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', shot], { encoding: 'utf8' }); const w = +/pixelWidth: (\d+)/.exec(dim)[1], h = +/pixelHeight: (\d+)/.exec(dim)[1]; if (h > w) execFileSync('sips', ['-r', '270', shot], { stdio: 'ignore' }); } catch { /* egal */ }
console.log('Bildschirmfoto:', shot);
if (!r) { check('Prüfskript hat ein Ergebnis geliefert', false); process.exit(1); }
console.log('Schritte:', r.schritte.join(' → '));
check('Prüfskript lief vollständig', r.fertig && !r.fehler, r.fehler || '');
check('Capacitor nativ (iOS)', r.capacitor && r.plattform === 'ios', `${r.plattform} ${r.origin}`);
check('Hub erreicht', r.schritte.some((s) => s.endsWith(' Hub')));
check('3D-Bühne des Hubs geladen', /^fertig/.test(r.szene || ''), r.szene || '');
check('Kein Service Worker', !/^[1-9]/.test(String(r.serviceWorker)), String(r.serviceWorker));
check('Knopf „App installieren“ ausgeblendet', r.installKnopfVersteckt === true);
check('WebGL2 verfügbar', !!r.webgl, String(r.webgl));
check('Querformat', r.viewport && r.viewport[0] > r.viewport[1], JSON.stringify(r.viewport));
console.log('      sichere Bereiche im WebView (oben rechts unten links):', r.safeArea);
check('Supabase Realtime: Kanal betreten und Broadcast-Echo', r.realtime && r.realtime.ok, JSON.stringify(r.realtime));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : `\niOS (${dev.name}): alle Prüfungen bestanden.`);
process.exit(failed ? 1 : 0);
