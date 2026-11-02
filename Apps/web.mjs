// Web-Build des Spiels für die App-Hüllen: relative Basis, Kennung VITE_APP_SHELL=1, Ausgabe Apps/www.
// Danach Web-Only-Teile entfernen (Service Worker, Manifest, /play/-Links), die in den Apps nur 404 erzeugen.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APPS = path.dirname(fileURLToPath(import.meta.url));
const CODE = path.resolve(APPS, '..', 'Code');
const WWW = path.join(APPS, 'www');
const vite = path.join(CODE, 'node_modules', '.bin', 'vite');

execFileSync(vite, ['build', '--base=./', '--outDir', WWW, '--emptyOutDir', '--logLevel', 'warn'], {
  cwd: CODE, stdio: 'inherit', env: { ...process.env, VITE_APP_SHELL: '1' },
});

for (const f of ['sw.js', 'manifest.webmanifest']) fs.rmSync(path.join(WWW, f), { force: true });
const idx = path.join(WWW, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html
  .replace(/\s*<!--[^>]*installierbar[^>]*-->/g, '')
  .replace(/\s*<link rel="manifest"[^>]*>/g, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/g, '')
  .replace(/<link rel="icon" type="image\/png" href="\/play\/img\/app-192.png" \/>/, '<link rel="icon" type="image/png" href="./img/app-192.png" />');
if (/\/play\//.test(html)) { console.error('index.html enthält noch /play/-Pfade'); process.exit(1); }
fs.writeFileSync(idx, html);
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : fs.statSync(path.join(d, e.name)).size), 0);
console.log(`Web-Build fertig: ${WWW} (${(size(WWW) / 1048576).toFixed(1)} MB)`);
