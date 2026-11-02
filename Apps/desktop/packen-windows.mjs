// Windows-App packen (auf dem Mac, ohne Wine): LAST SIGNALS.exe (Electron, x64, unsigniert) → portable .zip und NSIS-Installer.
// Aufruf (in Apps/): node desktop/packen-windows.mjs [--ziel <ordner>] [--ohne-setup]
// Voraussetzung: Apps/www enthält den Web-Build (npm run web oder bauen.sh). Für den Installer: makensis
// (Homebrew: brew install makensis). Fehlt makensis, entsteht nur die .zip.
// Symbol und Versionsdaten der .exe setzt @electron/packager selbst (resedit, reines JavaScript) – dafür braucht es kein Wine.
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.resolve(HERE, '..');
const ROOT = path.resolve(APPS, '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const ZIEL = path.resolve(arg('--ziel', path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads')));
const MIT_SETUP = !process.argv.includes('--ohne-setup');
const OUT = path.join(APPS, 'out', 'windows');
const NAME = 'LAST SIGNALS';
const EXE = `${NAME}.exe`;
const BASE = 'LAST-SIGNALS-windows-x64';
const pkg = JSON.parse(fs.readFileSync(path.join(APPS, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(APPS, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const which = (cmd) => { try { return execFileSync('/usr/bin/which', [cmd], { encoding: 'utf8' }).trim(); } catch { return ''; } };

if (!fs.existsSync(path.join(APPS, 'www', 'index.html'))) { console.error('Apps/www fehlt: zuerst den Web-Build erzeugen (npm run web).'); process.exit(1); }
fs.mkdirSync(ZIEL, { recursive: true });

// 1) Bühne: dieselben Dateien wie die Mac-App (main.cjs erkennt Windows selbst → lsDesktop.platform 'windows')
const STAGE = path.join(OUT, 'stage');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({ name: 'last-signals', productName: NAME, version: pkg.version, main: 'main.cjs', private: true }, null, 2));
for (const f of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
fs.cpSync(path.join(APPS, 'www'), path.join(STAGE, 'www'), { recursive: true });
for (const f of ['sw.js', 'manifest.webmanifest']) fs.rmSync(path.join(STAGE, 'www', f), { force: true });

// 2) Symbol (.ico) aus dem 512er App-Symbol: PNG-Einträge 16–256 px (Windows Vista und neuer)
const SRC_ICON = path.join(ROOT, 'Code', 'public', 'img', 'app-512.png');
const ICO = path.join(OUT, 'icon.ico');
{
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map((s) => {
    const f = path.join(OUT, `icon-${s}.png`);
    run('sips', ['-z', String(s), String(s), SRC_ICON, '--out', f], { stdio: 'ignore' });
    return fs.readFileSync(f);
  });
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e); head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(ICO, Buffer.concat([head, ...pngs]));
}

// 3) Packen (win32/x64, asar), Symbol und Versionsdaten in die .exe
const [appDir] = await packager({
  dir: STAGE, out: path.join(OUT, 'build'), name: NAME, executableName: NAME,
  platform: 'win32', arch: 'x64', electronVersion, overwrite: true, asar: true, prune: false, icon: ICO,
  appVersion: pkg.version, buildVersion: pkg.version, appCopyright: 'LAST SIGNALS – Testversion',
  win32metadata: { CompanyName: '077 GAMING', ProductName: NAME, FileDescription: NAME, InternalName: NAME, OriginalFilename: EXE, 'requested-execution-level': 'asInvoker' },
});
if (!fs.existsSync(path.join(appDir, EXE))) { console.error(`${EXE} fehlt in ${appDir}`); process.exit(1); }

// 4) Portable .zip: ein Ordner „LAST SIGNALS“ mit der .exe darin
const ZIPSRC = path.join(OUT, 'zip');
fs.mkdirSync(ZIPSRC, { recursive: true });
fs.renameSync(appDir, path.join(ZIPSRC, NAME));
const APPDIR = path.join(ZIPSRC, NAME);
const zip = path.join(ZIEL, `${BASE}.zip`);
fs.rmSync(zip, { force: true });
run('zip', ['-qry', '-X', zip, NAME], { cwd: ZIPSRC });

// 5) Installer (NSIS, für den aktuellen Benutzer, ohne Admin-Rechte) – nur wenn makensis da ist
const setup = path.join(ZIEL, `${BASE}-setup.exe`);
const makensis = which('makensis');
const sizeKb = (d) => Math.ceil(fs.readdirSync(d, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).reduce((n, e) => n + fs.statSync(path.join(e.parentPath, e.name)).size, 0) / 1024);
if (MIT_SETUP && makensis) {
  fs.rmSync(setup, { force: true });
  const v4 = (pkg.version.split('.').concat(['0', '0', '0', '0'])).slice(0, 4).map((x) => parseInt(x, 10) || 0).join('.');
  run(makensis, ['-V2', '-INPUTCHARSET', 'UTF8',
    `-DSRC=${APPDIR}`, `-DOUTFILE=${setup}`, `-DICON=${ICO}`, `-DVERSION=${pkg.version}`, `-DVERSION4=${v4}`, `-DSIZE_KB=${sizeKb(APPDIR)}`,
    path.join(HERE, 'windows-setup.nsi')], { env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } }); // makensis liest UTF-8 nur mit UTF-8-Locale
} else if (MIT_SETUP) {
  console.warn('makensis nicht gefunden (brew install makensis): Installer wird übersprungen, nur die .zip entsteht.');
}

console.log(`fertig windows-x64: ${zip}${fs.existsSync(setup) && MIT_SETUP && makensis ? `\n         ${setup}` : ''}\n         App-Ordner: ${APPDIR}`);
