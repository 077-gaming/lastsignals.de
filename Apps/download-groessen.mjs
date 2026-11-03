// Überträgt die echten Dateigrößen aus dem Download-Ordner in src/content/downloads.js (Download-Seite der Website).
// Aufruf (im Repository): node Apps/download-groessen.mjs [ordner]   Standard: ~/LAST-SIGNALS-Uebergabe/downloads
// Ändert nur die Zahlen hinter bytes:, Dateinamen und Tag bleiben, wie sie in downloads.js stehen.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONF = path.join(ROOT, 'src', 'content', 'downloads.js');
const DIR = path.resolve(process.argv[2] || path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe', 'downloads'));
let src = fs.readFileSync(CONF, 'utf8');
let changed = 0, missing = 0;
// Dateinamen kommen mit der Versionsnummer aus downloads.js (FILES), die Zahlen werden dort je Schlüssel ersetzt
const { FILES } = await import(pathToFileURL(CONF).href);
for (const [key, { file }] of Object.entries(FILES)) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) { console.warn(`fehlt: ${file}`); missing++; continue; }
  const n = fs.statSync(p).size;
  const re = new RegExp(`(\\b${key}: \\{ file: [^}]*?bytes: )(\\d+)`);
  if (!re.test(src)) { console.warn(`Eintrag ${key} in downloads.js nicht gefunden`); missing++; continue; }
  src = src.replace(re, (all, pre, old) => { if (String(n) !== old) { console.log(`${file}: ${old} → ${n}`); changed++; } return pre + n; });
}
fs.writeFileSync(CONF, src);
console.log(`${changed} Größe(n) aktualisiert${missing ? `, ${missing} Datei(en) fehlen` : ''}: ${path.relative(ROOT, CONF)}`);
process.exit(missing ? 1 : 0);
