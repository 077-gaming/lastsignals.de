// Kennungs- und Oberflächenprüfung: jeden Spielerrumpf im Hangar (4K-Stufe) aus 8 Umlaufwinkeln aufnehmen
// (oben, unten, beide Seiten, vorn, hinten, schräg unten, schräg oben hinten), ohne Halle/Kufen, und je Rumpf einen
// Kontaktbogen ablegen. Nur Entwicklung (Dev-Server + Google Chrome, läuft unsichtbar).
// Aufruf: node tools/bilder/umlauf.mjs <ausgabeordner> [basis-url]
//   KLASSEN=s1,s8 · FRAKTIONEN=europa,eris · GROESSE=1400x1000 · HD=0 (2K statt 4K) · UV=1 (UV-Koordinaten je Bild)
// Ergebnis: <klasse>-<fraktion>-<winkel>.png, <klasse>-<fraktion>-bogen.jpg, bericht.json
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = process.argv[2] || 'umlauf';
const base = process.argv[3] || 'http://localhost:5198';
const size = (process.env.GROESSE || '1400x1000').split('x').map(Number);
const classes = (process.env.KLASSEN || 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
const factions = (process.env.FRAKTIONEN || 'europa,saturn,eris').split(',');
const hd = process.env.HD !== '0';
export const ANGLES = [
  ['oben', 0, 88, 1.9], ['unten', 0, -88, 1.9], ['links', 90, 4, 1.8], ['rechts', -90, 4, 1.8],
  ['vorn', 0, 8, 1.9], ['hinten', 180, 8, 1.9], ['schraeg-unten', 40, -38, 1.8], ['schraeg-oben-hinten', 145, 35, 1.8],
];

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding'] });
const report = [];
for (const f of factions) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', cockpit: false, quality: 'ultra', qualityAuto: false, rev: 2 }));
    localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  });
  await page.goto(`${base}/?dev=dock&f=${f}&hd=${hd ? 1 : 0}`);
  await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  for (const sh of classes) {
    await page.evaluate((sh) => {
      const w = __ls.world, p = w.profile;
      p.ship = sh; w.player.ship = sh; p.loadout = { lasers: [], gens: [] }; w.player.loadout = p.loadout;
      __ls.bus?.emit?.('profile', p);
      document.querySelector('[data-act="tab"][data-tab="station"], [data-act="tab"][data-tab="markt"]')?.click();
    }, sh);
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click());
    // warten, bis Modell (und 4K) da sind
    await page.waitForFunction(([sh, f, hd]) => {
      const b = window.__lsBay; if (!b || !b.ship) return false;
      const w = b.factory.glb.get(`ship:${sh}:${f}`);
      return !!w && b.pending.size === 0 && (!hd || w.userData.glbHd);
    }, [sh, f, hd], { timeout: 60000 }).catch(() => errors.push('Modell/4K nicht rechtzeitig'));
    await page.addStyleTag({ content: '.sx-stage *{visibility:hidden!important} .sx-stage .sx-bay3d{visibility:visible!important}' });
    const shots = [];
    for (const [name, yaw, pitch, dist] of ANGLES) {
      await page.evaluate(([yaw, pitch, dist]) => { const b = window.__lsBay; b.orbit = { yaw, pitch, dist, clean: true }; b._dirty = true; }, [yaw, pitch, dist]);
      await page.waitForTimeout(450);
      const clip = await page.evaluate(() => { const r = document.querySelector('.sx-bay3d').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      const file = path.join(out, `${sh}-${f}-${name}.png`);
      await page.screenshot({ path: file, clip });
      shots.push({ name, file });
    }
    const hdOn = await page.evaluate(([sh, f]) => !!window.__lsBay.factory.glb.get(`ship:${sh}:${f}`)?.userData.glbHd, [sh, f]);
    await page.evaluate(() => { window.__lsBay.orbit = null; window.__lsBay._dirty = true; });
    // Kontaktbogen 4 × 2
    const tw = 700, th = Math.round(tw * size[1] / size[0]);
    const tiles = await Promise.all(shots.map(async (s) => {
      const lab = Buffer.from(`<svg width="${tw}" height="28"><rect width="${tw}" height="28" fill="#000" opacity="0.6"/><text x="8" y="20" font-family="Menlo" font-size="17" fill="#fff">${sh} ${f} · ${s.name}${hdOn ? ' · 4K' : ' · 2K'}</text></svg>`);
      return sharp(s.file).resize(tw, th, { fit: 'cover' }).composite([{ input: lab, left: 0, top: 0 }]).png().toBuffer();
    }));
    await sharp({ create: { width: tw * 4, height: th * 2, channels: 3, background: '#111' } })
      .composite(tiles.map((b, i) => ({ input: b, left: (i % 4) * tw, top: Math.floor(i / 4) * th })))
      .jpeg({ quality: 86 }).toFile(path.join(out, `${sh}-${f}-bogen.jpg`));
    report.push({ sh, f, hd: hdOn, errors: errors.splice(0) });
    console.log(sh, f, hdOn ? '4K' : '2K');
  }
  await ctx.close();
}
await browser.close();
await fs.writeFile(path.join(out, 'bericht.json'), JSON.stringify(report, null, 2));
