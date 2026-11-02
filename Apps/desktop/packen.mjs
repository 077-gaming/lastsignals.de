// Mac-App packen: LAST SIGNALS.app (Electron, unsigniert bzw. nur ad-hoc signiert) → .zip und .dmg
// Aufruf (in Apps/): node desktop/packen.mjs [--arch arm64|x64|universal|alle] [--ziel <ordner>]
// Voraussetzung: Apps/www enthält den Web-Build (npm run web oder bauen.sh).
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
const ARCH = arg('--arch', 'arm64');
const ZIEL = path.resolve(arg('--ziel', path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads')));
const OUT = path.join(APPS, 'out', 'mac');
const NAME = 'LAST SIGNALS';
const pkg = JSON.parse(fs.readFileSync(path.join(APPS, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(fs.readFileSync(path.join(APPS, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

if (!fs.existsSync(path.join(APPS, 'www', 'index.html'))) { console.error('Apps/www fehlt: zuerst den Web-Build erzeugen (npm run web).'); process.exit(1); }
fs.mkdirSync(ZIEL, { recursive: true });

// 1) Bühne: nur das, was in die App gehört
const STAGE = path.join(OUT, 'stage');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({ name: 'last-signals', productName: NAME, version: pkg.version, main: 'main.cjs', private: true }, null, 2));
for (const f of ['main.cjs', 'preload.cjs']) fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
fs.cpSync(path.join(APPS, 'www'), path.join(STAGE, 'www'), { recursive: true });
// Service Worker und Web-Manifest sind in der App überflüssig
for (const f of ['sw.js', 'manifest.webmanifest']) fs.rmSync(path.join(STAGE, 'www', f), { force: true });

// 2) Symbol (.icns) aus dem 512er App-Symbol
const ICONSET = path.join(OUT, 'icon.iconset');
fs.mkdirSync(ICONSET, { recursive: true });
const SRC_ICON = path.join(ROOT, 'Code', 'public', 'img', 'app-512.png');
for (const s of [16, 32, 128, 256, 512]) {
  run('sips', ['-z', String(s), String(s), SRC_ICON, '--out', path.join(ICONSET, `icon_${s}x${s}.png`)], { stdio: 'ignore' });
  run('sips', ['-z', String(s * 2), String(s * 2), SRC_ICON, '--out', path.join(ICONSET, `icon_${s}x${s}@2x.png`)], { stdio: 'ignore' });
}
const ICNS = path.join(OUT, 'icon.icns');
run('iconutil', ['-c', 'icns', ICONSET, '-o', ICNS]);

// 3) Packen, ad-hoc signieren (Apple Silicon startet nur signierte Programme; „-“ = ohne Entwicklerkonto), zip + dmg
const arches = ARCH === 'alle' ? ['arm64', 'universal'] : [ARCH];
const results = [];
for (const arch of arches) {
  const [appDir] = await packager({
    dir: STAGE, out: path.join(OUT, 'build'), name: NAME, executableName: NAME,
    platform: 'darwin', arch, electronVersion, overwrite: true, asar: true, prune: false, icon: ICNS,
    appBundleId: 'de.lastsignals.spiel', appCategoryType: 'public.app-category.games', appVersion: pkg.version,
    appCopyright: 'LAST SIGNALS – Testversion', darwinDarkModeSupport: true,
    extendInfo: { NSHighResolutionCapable: true, LSApplicationCategoryType: 'public.app-category.games', NSSupportsAutomaticGraphicsSwitching: false },
  });
  const app = path.join(appDir, `${NAME}.app`);
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  const base = `LAST-SIGNALS-mac-${arch}`;
  const zip = path.join(ZIEL, `${base}.zip`);
  const dmg = path.join(ZIEL, `${base}.dmg`);
  fs.rmSync(zip, { force: true }); fs.rmSync(dmg, { force: true });
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
  const dmgSrc = path.join(OUT, `dmg-${arch}`);
  fs.rmSync(dmgSrc, { recursive: true, force: true });
  fs.mkdirSync(dmgSrc, { recursive: true });
  run('ditto', [app, path.join(dmgSrc, `${NAME}.app`)]);
  fs.symlinkSync('/Applications', path.join(dmgSrc, 'Programme'));
  run('hdiutil', ['create', '-volname', NAME, '-srcfolder', dmgSrc, '-fs', 'HFS+', '-format', 'UDZO', '-ov', dmg]);
  fs.rmSync(dmgSrc, { recursive: true, force: true });
  results.push({ arch, app, zip, dmg });
}
for (const r of results) console.log(`fertig ${r.arch}: ${r.zip}\n         ${r.dmg}\n         App: ${r.app}`);
