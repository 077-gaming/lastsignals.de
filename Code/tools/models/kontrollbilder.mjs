#!/usr/bin/env node
// Kontrollbilder der Schiffe 3–8 aus der Vorschauseite (tools/models/vorschau.html) im installierten Chrome.
// Voraussetzung: Entwicklungsserver läuft (npm run dev → http://localhost:5173).
// Aufruf: node tools/models/kontrollbilder.mjs [--nur s3,s4] [--fraktion eris] [--ansichten spiel,schraeg] [--ziel <Ordner>]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const arg = (k, d) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : d; };
const ships = arg('--nur', 's3,s4,s5,s6,s7,s8').split(',').map((s) => +s.replace(/\D/g, ''));
const facs = arg('--fraktion', 'europa,saturn,eris').split(',');
const views = arg('--ansichten', 'spiel,schraeg').split(',');
const dir = path.resolve(arg('--ziel', path.resolve(HERE, '../../../Material/Screenshots/Schiffe-3-8')));
const base = arg('--url', 'http://localhost:5173');
const extra = arg('--extra', ''); // z. B. "sil=1&bg=hell"
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('Seitenfehler:', e.message));
await page.goto(`${base}/tools/models/vorschau.html?clean=1&${extra}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
const out = [];
for (const s of ships) for (const f of facs) for (const v of views) {
  const o = { f, s, v };
  for (const kv of extra.split('&').filter(Boolean)) { const [k, val] = kv.split('='); o[k] = val === '1' ? true : val; }
  await page.evaluate((x) => window.__show(x), o);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(250);
  const name = v.startsWith('reihe') ? `${f}-${v}${extra ? '-' + extra.replace(/[=&]/g, '') : ''}.png` : `${f}-schiff${s}-${v}${extra ? '-' + extra.replace(/[=&]/g, '') : ''}.png`;
  const file = path.join(dir, name);
  await page.screenshot({ path: file });
  out.push(file);
  console.log(file);
}
await browser.close();
