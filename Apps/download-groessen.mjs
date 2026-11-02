// Überträgt die echten Dateigrößen aus dem Download-Ordner in src/content/downloads.js (Download-Seite der Website).
// Aufruf (im Repository): node Apps/download-groessen.mjs [ordner]   Standard: ~/LAST-SIGNALS-Uebergabe/downloads
// Ändert nur die Zahlen hinter bytes:, Dateinamen und Tag bleiben, wie sie in downloads.js stehen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = path.join(ROOT, 'src', 'content', 'downloads.js');
const DIR = path.resolve(process.argv[2] || path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads'));
let src = fs.readFileSync(CONF, 'utf8');
let changed = 0, missing = 0;
src = src.replace(/\{ file: '([^']+)', bytes: (\d+) \}/g, (all, file, old) => {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) { console.warn(`fehlt: ${file}`); missing++; return all; }
  const n = fs.statSync(p).size;
  if (String(n) !== old) { console.log(`${file}: ${old} → ${n}`); changed++; }
  return `{ file: '${file}', bytes: ${n} }`;
});
fs.writeFileSync(CONF, src);
console.log(`${changed} Größe(n) aktualisiert${missing ? `, ${missing} Datei(en) fehlen` : ''}: ${path.relative(ROOT, CONF)}`);
process.exit(missing ? 1 : 0);
