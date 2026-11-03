// Kampf- und Flugansicht je Klasse mit HUD (nur Entwicklung, unsichtbar): Flug (ruhig), Kampf (drei Raider, Angriff
// an) und Kampf mit Schildtreffer am eigenen Schiff (Effekt 0,08 s nach dem Auslösen aufgenommen).
// Aufruf: node tools/bilder/kampf.mjs <ordner> [basis-url]   KLASSEN=s1,s6,s8 · F=eris · Q=high · HUD=0 ohne HUD
// Ergebnis: <klasse>-<fraktion>-flug.png, -kampf.png, -schild.png (1280 × 720)
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
const out = process.argv[2] || 'kampf';
const base = process.argv[3] || 'http://localhost:5198';
const classes = (process.env.KLASSEN || 's1,s6,s8').split(',');
const facs = (process.env.F || 'eris').split(',');
const hud = process.env.HUD !== '0';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
for (const f of facs) for (const sh of classes) for (const mode of ['flug', 'kampf']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript((q) => {
    let a = 1234; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  }, process.env.Q || 'high');
  await page.goto(`${base}/?dev=game&f=${f}`);
  await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(([sh, kampf]) => {
    __ls.series?.choose('direct');
    const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p);
    w.player.x += 900; w.player.rot = 2.4; w.player.vx = 0; w.player.vz = 0;
    if (kampf) {
      const a = w.player.rot;
      for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(a) * (560 + i * 60) + (i - 1) * 110, w.player.z - Math.cos(a) * (560 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
      w.toggleAttack();
    }
  }, [sh, mode === 'kampf']);
  if (!hud) await page.addStyleTag({ content: '#hud{display:none!important}' });
  // Lernhinweis-Fenster (Tutorial) aus, es läge über dem Bild
  await page.addStyleTag({ content: '.hud-coach{display:none!important}' });
  await page.waitForTimeout(8000);
  await page.evaluate(() => { const w = __ls.world; if (w.player) { w.player.vx = 0; w.player.vz = 0; } });
  await page.screenshot({ path: path.join(out, `${sh}-${f}-${mode}.png`) });
  if (mode === 'kampf') {
    // Schildtreffer von vorn links am eigenen Schiff
    await page.evaluate(() => { const fx = __ls.renderer.effects; fx._shield('player', 0.5, -0.6, 0, -1, false); });
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(out, `${sh}-${f}-schild.png`) });
  }
  console.log(f, sh, mode);
  await page.context().close();
}
await browser.close();
