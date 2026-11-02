#!/usr/bin/env node
// Einbauprüfung der Modelle über die Spiel-Fabrik (tools/models/einbau.html, Dev-Server auf Port 5173, Chrome).
// Aufruf: node tools/models/einbau.mjs schiffe <ordner> [--ansichten oben,schraeg] [--nur s1,s5] [--fraktion eris]
//         node tools/models/einbau.mjs auftraege <auftraege.json> <ordner>   (Liste von __show-Aufträgen mit name)
// Ergebnis: Einzelbilder plus kontaktbogen.png je Lauf.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const A = process.argv.slice(2);
const arg = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const mode = A[0];
let jobs = [], dir;
if (mode === 'schiffe') {
  dir = A[1] || 'einbau-schiffe';
  const views = arg('--ansichten', 'oben,schraeg').split(',');
  const ships = arg('--nur', 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
  for (const f of arg('--fraktion', 'europa,saturn,eris').split(',')) for (const s of ships) for (const v of views) jobs.push({ name: `${f}-${s}-${v}`, kind: 'ship', f, s, v });
} else if (mode === 'auftraege') {
  jobs = JSON.parse(fs.readFileSync(A[1], 'utf8'));
  dir = A[2] || 'einbau-auftraege';
} else { console.log('Aufruf: einbau.mjs schiffe <ordner> | auftraege <datei.json> <ordner>'); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const SZ = { width: 640, height: 400 };
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: SZ, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
await page.goto('http://localhost:5173/tools/models/einbau.html');
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const files = [], res = [];
for (const j of jobs) {
  const r = await page.evaluate((o) => window.__show(o), j).catch((e) => ({ error: String(e) }));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => {});
  const file = path.join(dir, j.name + '.png');
  await page.screenshot({ path: file });
  files.push(file); res.push({ name: j.name, ...r });
}
// Kontaktbogen: 4 Spalten, halbe Größe
const cols = 4, w = SZ.width / 2, h = SZ.height / 2, rows = Math.ceil(files.length / cols);
await page.setViewportSize({ width: cols * w, height: rows * h });
const imgs = files.map((f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">${imgs.map((s) => `<img src="${s}" width="${w}" height="${h}">`).join('')}</body>`);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(dir, 'kontaktbogen.png'), fullPage: true });
await browser.close();
fs.writeFileSync(path.join(dir, 'ergebnis.json'), JSON.stringify({ res, errs: [...new Set(errs)].slice(0, 40) }, null, 2));
console.log(JSON.stringify({ n: files.length, errs: [...new Set(errs)].slice(0, 10) }));
