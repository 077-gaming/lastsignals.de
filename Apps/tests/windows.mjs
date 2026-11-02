// Prüfung der Windows-Dateien ohne Windows (auf dem Mac): Aufbau der portablen .zip und des Installers.
// Aufruf (in Apps/): node tests/windows.mjs [ordner mit den Downloads]
// Prüft: Ordner „LAST SIGNALS“ mit LAST SIGNALS.exe (PE, x64, GUI), Symbol und Versionsdaten in der .exe,
// resources/app.asar mit main.cjs/preload.cjs/www/index.html und dem Spiel, Desktop-Kennung 'windows',
// keine Mac-Reste (__MACOSX, .DS_Store), plausible Größen, Installer ist ein NSIS-Programm.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(APPS, 'package.json'));
const asar = require('@electron/asar');
const ResEdit = require('resedit');
const ZIEL = path.resolve(process.argv[2] || path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads'));
const ZIP = path.join(ZIEL, 'LAST-SIGNALS-windows-x64.zip');
const SETUP = path.join(ZIEL, 'LAST-SIGNALS-windows-x64-setup.exe');
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'OK  ' : 'FEHL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed++; };
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

// PE-Kopf lesen: Maschine und Subsystem
function pe(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) return null; // MZ
  const off = buf.readUInt32LE(0x3c);
  if (buf.toString('latin1', off, off + 4) !== 'PE\0\0') return null;
  const machine = buf.readUInt16LE(off + 4);
  const opt = off + 24;
  const magic = buf.readUInt16LE(opt);
  const subsystem = buf.readUInt16LE(opt + 68);
  return { machine, magic, subsystem };
}

check('portable .zip vorhanden', fs.existsSync(ZIP), ZIP);
const zipSize = fs.existsSync(ZIP) ? fs.statSync(ZIP).size : 0;
check('Größe .zip plausibel (120–400 MB)', zipSize > 120 * 1048576 && zipSize < 400 * 1048576, mb(zipSize));

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-win-test-'));
try {
  const list = execFileSync('unzip', ['-Z1', ZIP], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean);
  check('Alles in einem Ordner „LAST SIGNALS/“', list.every((f) => f.startsWith('LAST SIGNALS/')), `${list.length} Einträge`);
  check('Keine Mac-Reste (__MACOSX, .DS_Store)', !list.some((f) => /__MACOSX|\.DS_Store/.test(f)));
  for (const f of ['LAST SIGNALS.exe', 'resources/app.asar', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'v8_context_snapshot.bin', 'locales/de.pak']) {
    check(`enthält ${f}`, list.includes(`LAST SIGNALS/${f}`));
  }
  execFileSync('unzip', ['-q', ZIP, 'LAST SIGNALS/LAST SIGNALS.exe', 'LAST SIGNALS/resources/app.asar', '-d', TMP]);
  const exePath = path.join(TMP, 'LAST SIGNALS', 'LAST SIGNALS.exe');
  const exe = fs.readFileSync(exePath);
  const h = pe(exe);
  check('LAST SIGNALS.exe ist ein 64-Bit-Windows-Programm (PE32+, x64)', !!h && h.machine === 0x8664 && h.magic === 0x20b, h ? `machine=0x${h.machine.toString(16)} magic=0x${h.magic.toString(16)}` : 'kein PE');
  check('… mit Fenster (Subsystem GUI)', !!h && h.subsystem === 2, h ? `subsystem=${h.subsystem}` : '');

  const res = ResEdit.NtExecutableResource.from(ResEdit.NtExecutable.from(exe, { ignoreCert: true }));
  const icons = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const iconSizes = icons.flatMap((g) => g.icons.map((i) => i.width || 256));
  check('Eigenes App-Symbol in der .exe (16–256 px)', iconSizes.includes(16) && iconSizes.includes(256), iconSizes.join(','));
  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const strings = vi ? vi.getAllLanguagesForStringValues().map((l) => vi.getStringValues(l)) : [];
  const s = strings[0] || {};
  check('Versionsdaten: ProductName LAST SIGNALS, Firma 077 GAMING', s.ProductName === 'LAST SIGNALS' && s.CompanyName === '077 GAMING', JSON.stringify({ ProductName: s.ProductName, CompanyName: s.CompanyName, FileVersion: s.FileVersion, OriginalFilename: s.OriginalFilename }));

  const ar = path.join(TMP, 'LAST SIGNALS', 'resources', 'app.asar');
  const files = asar.listPackage(ar).map((f) => f.replace(/\\/g, '/'));
  for (const f of ['/package.json', '/main.cjs', '/preload.cjs', '/www/index.html']) check(`app.asar enthält ${f}`, files.includes(f));
  check('app.asar enthält das Spiel (assets, models, audio, fonts)', ['/www/assets', '/www/models', '/www/audio', '/www/fonts'].every((d) => files.some((f) => f.startsWith(d + '/'))), `${files.length} Dateien`);
  check('Kein Service Worker / Web-Manifest in der App', !files.includes('/www/sw.js') && !files.includes('/www/manifest.webmanifest'));
  const main = asar.extractFile(ar, 'main.cjs').toString('utf8');
  const preload = asar.extractFile(ar, 'preload.cjs').toString('utf8');
  check("Desktop-Kennung: main.cjs meldet win32 als platform 'windows'", /IS_WIN \? 'windows'/.test(main) && /platform: PLATFORM/.test(main));
  check("Preload gibt window.lsDesktop frei (Rückfall 'windows' auf win32)", /exposeInMainWorld\('lsDesktop'/.test(preload) && /win32' \? 'windows'/.test(preload));
  const html = asar.extractFile(ar, 'www/index.html').toString('utf8');
  check('www/index.html ohne /play/-Pfade (relative Basis)', !/\/play\//.test(html) && /\.\/assets\//.test(html));
  const pj = JSON.parse(asar.extractFile(ar, 'package.json').toString('utf8'));
  check('package.json: main.cjs, productName LAST SIGNALS', pj.main === 'main.cjs' && pj.productName === 'LAST SIGNALS', `Version ${pj.version}`);
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

if (fs.existsSync(SETUP)) {
  const buf = fs.readFileSync(SETUP);
  const h = pe(buf);
  check('Installer ist ein Windows-Programm (PE)', !!h && h.subsystem === 2);
  check('Installer ist ein NSIS-Paket', buf.includes(Buffer.from('NullsoftInst')));
  check('Größe Installer plausibel (100–400 MB)', buf.length > 100 * 1048576 && buf.length < 400 * 1048576, mb(buf.length));
} else {
  console.log('      (kein Installer gefunden, nur .zip geprüft)');
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
