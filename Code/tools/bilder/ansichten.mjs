// Feste Vergleichsansichten für Vorher/Nachher (nur Entwicklung, braucht laufenden Dev-Server und Google Chrome).
// Aufruf: node tools/bilder/ansichten.mjs <ausgabeordner> [basis-url]
// Gleiche Fenstergröße (960×600, Pixeldichte 1), gleiche Wartezeit, gleicher Einstieg je Ansicht.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2] || 'ansichten';
const base = process.argv[3] || 'http://localhost:5173';
const extra = process.argv[4] || ''; // z. B. '&tm=agx&exp=1.1' (nur Entwicklung)
const size = (process.argv[5] || '960x600').split('x').map(Number);
const VIEWS = [
  ['station-europa', '/?dev=dock&f=europa', 9000],
  ['station-saturn', '/?dev=dock&f=saturn', 9000],
  ['station-eris', '/?dev=dock&f=eris', 9000],
  ['flug-saturn', '/?dev=game&f=saturn', 12000],
  ['flug-europa', '/?dev=game&f=europa', 12000],
  ['flug-eris', '/?dev=game&f=eris', 12000],
];

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const report = [];
for (const [name, url, wait] of VIEWS) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base + url + extra);
  await page.waitForTimeout(wait);
  // Kurzer Messwert aus dem Renderer, falls die Test-Schnittstelle da ist
  const info = await page.evaluate(() => {
    const r = window.__ls?.renderer?.r || window.__ls?.renderer?.gl;
    const i = r && r.info ? r.info.render : null;
    return i ? { calls: i.calls, triangles: i.triangles } : null;
  }).catch(() => null);
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.push({ name, url, wait, errors: errors.slice(0, 5), info });
  await ctx.close();
}
await browser.close();
await fs.writeFile(path.join(out, 'bericht.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map((r) => ({ n: r.name, err: r.errors.length, info: r.info }))));
