// Größenstaffelung in der Verfolgersicht: gleiche Szene (Lage, Kurs, Fraktion) für mehrere Klassen, Bildanteil des
// Rumpfs (Breite/Höhe der projizierten Hülle) messen und Bilder nebeneinander legen. Nur Entwicklung, unsichtbar.
// Aufruf: node tools/bilder/groessen.mjs <ausgabeordner> [basis-url]   KLASSEN=s1,s4,s8 · F=europa · Q=high
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = process.argv[2] || 'groessen';
const base = process.argv[3] || 'http://localhost:5198';
const classes = (process.env.KLASSEN || 's1,s4,s8').split(',');
const f = process.env.F || 'europa';
const q = process.env.Q || 'high';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const res = [];
for (const sh of classes) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript((q) => {
    let a = 1234; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  }, q);
  await page.goto(`${base}/?dev=game&f=${f}`);
  await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate((sh) => {
    __ls.series?.choose('direct');
    const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p);
    w.player.x += 900; w.player.rot = 2.4; w.player.vx = 0; w.player.vz = 0;
  }, sh);
  await page.addStyleTag({ content: '#hud{display:none!important}' });
  await page.waitForTimeout(8000);
  const m = await page.evaluate(() => {
    const R = __ls.renderer, v = R.views.get(__ls.world.player.id), cam = R.camera;
    const box = { x0: 1, x1: -1, y0: 1, y1: -1 }, p = new (cam.position.constructor)();
    v.root.updateMatrixWorld(true);
    v.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || o.material?.isShaderMaterial || o.material?.blending === 2) return;
      const P = o.geometry.attributes.position, st = Math.max(1, Math.floor(P.count / 3000));
      for (let i = 0; i < P.count; i += st) { p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).project(cam); if (p.z > 1) continue; box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y); }
    });
    return { breite: +((box.x1 - box.x0) / 2).toFixed(3), hoehe: +((box.y1 - box.y0) / 2).toFixed(3), radius: v.vr, abstand: +cam.position.distanceTo(v.root.position).toFixed(1) };
  });
  const file = path.join(out, `${sh}-${f}-verfolger.png`);
  await page.screenshot({ path: file });
  res.push({ sh, ...m, file });
  console.log(sh, JSON.stringify(m));
  await page.context().close();
}
await browser.close();
// nebeneinander mit Beschriftung (Bildanteil der Breite)
const tiles = await Promise.all(res.map(async (r) => {
  const lab = Buffer.from(`<svg width="640" height="34"><rect width="640" height="34" fill="#000" opacity="0.65"/><text x="10" y="24" font-family="Menlo" font-size="19" fill="#fff">${r.sh} ${f} · Breite ${(r.breite * 100).toFixed(0)} % · Abstand ${r.abstand} m</text></svg>`);
  return sharp(r.file).resize(640, 360).composite([{ input: lab, left: 0, top: 0 }]).png().toBuffer();
}));
await sharp({ create: { width: 640 * tiles.length, height: 360, channels: 3, background: '#000' } })
  .composite(tiles.map((b, i) => ({ input: b, left: i * 640, top: 0 }))).jpeg({ quality: 88 }).toFile(path.join(out, `staffelung-${f}.jpg`));
await fs.writeFile(path.join(out, 'groessen.json'), JSON.stringify(res, null, 1));
