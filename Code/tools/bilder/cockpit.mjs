// Cockpit-Umsehen aufnehmen (vorn, links, rechts, unten), nur Entwicklung, läuft unsichtbar.
// Aufruf: node tools/bilder/cockpit.mjs <dateianfang> [klasse] [fraktion] [basis-url]   → <dateianfang>-vorn.png …
// Q=high|ultra (Standard ultra)
import { chromium } from 'playwright-core';
const out = process.argv[2]; const sh = process.argv[3] || 's1'; const f = process.argv[4] || 'europa'; const base = process.argv[5] || 'http://localhost:5198'; const Q = process.env.Q || 'ultra';
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript((Q) => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: Q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); }, Q);
await page.goto(`${base}/?dev=game&f=${f}&hd=1`);
await page.waitForFunction(() => window.__ls?.world?.player); await page.waitForTimeout(3000);
await page.evaluate((sh) => { __ls.series?.choose('direct'); const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p); w.player.x += 900; w.player.rot = 1.2; const r = __ls.renderer; for (let i = 0; i < 3 && r.viewMode !== 'cockpit'; i++) r.toggleCamera(); }, sh);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await page.waitForTimeout(7000);
for (const [n, y, p] of [['vorn', 0, 0], ['links', 1.25, -0.1], ['rechts', -1.25, -0.1], ['unten', 0, -0.55]]) {
  await page.evaluate(([y, p]) => { const g = __ls.renderer.rig; g.looking = true; g.lookYaw = y; g.lookPitch = p; }, [y, p]);
  await page.waitForTimeout(150);
  await page.evaluate(([y, p]) => { const g = __ls.renderer.rig; g.looking = true; g.lookYaw = y; g.lookPitch = p; }, [y, p]);
  await page.screenshot({ path: `${out}-${n}.png` });
}
await b.close();
