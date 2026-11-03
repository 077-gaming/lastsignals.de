// UV-Texel unter Bildpunkten einer Hangar-Umlaufansicht (Nachtrag von Kennungen als Rechteck in kennungen.json).
// Aufruf: OUT=bild.png F=europa node tools/models/uv-punkt.mjs <klasse> <gier> <neigung> <abstand> x,y [x,y …]
// Gleiche Ansicht wie tools/bilder/umlauf.mjs (1400 × 1000); Ausgabe: [[u, v] in 2K-Texeln …], Bildgröße.
// Ansicht wie tools/bilder/schiffe.mjs (Hangar-Nahaufnahme): VIEW=1600x900 DX=0.3 CLEAN=0 (Blickversatz, mit Halle)
import { chromium } from 'playwright-core';
const [sh, yaw, pitch, dist, ...pts] = process.argv.slice(2);
const f = process.env.F || 'europa';
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const [VW, VH] = (process.env.VIEW || '1400x1000').split('x').map(Number), DX = +(process.env.DX || 0), CLEAN = process.env.CLEAN !== '0';
const page = await (await b.newContext({ viewport: { width: VW, height: VH } })).newPage();
await page.addInitScript(() => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: 'ultra', qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); });
await page.goto(`http://localhost:5198/?dev=dock&f=${f}&hd=0`);
await page.waitForFunction(() => window.__ls?.world?.player); await page.waitForTimeout(2500);
await page.evaluate((sh) => { const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; p.loadout = { lasers: [], gens: [] }; __ls.bus?.emit?.('profile', p); document.querySelector('[data-tab="shop"]')?.click(); }, sh);
await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-tab="hangar"]')?.click());
await page.waitForFunction(([sh, f]) => { const b = window.__lsBay; return b?.ship && b.factory.glb.get(`ship:${sh}:${f}`) && b.pending.size === 0; }, [sh, f], { timeout: 60000 });
await page.waitForTimeout(3000);
await page.addStyleTag({ content: '.sx-stage *{visibility:hidden!important} .sx-stage .sx-bay3d{visibility:visible!important}' });
await page.evaluate(([y, p, d, DX, CLEAN]) => { const b = window.__lsBay; b.orbit = { yaw: +y, pitch: +p, dist: +d, dx: DX, clean: CLEAN }; b._dirty = true; }, [yaw, pitch, dist, DX, CLEAN]);
await page.waitForTimeout(500);
const clip = await page.evaluate(() => { const r = document.querySelector('.sx-bay3d').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
if (process.env.OUT) await page.screenshot({ path: process.env.OUT, clip });
const res = await page.evaluate(([pts, W, H]) => { const b = window.__lsBay; return pts.map((s) => { const [x, y] = s.split(',').map(Number); b._ray.setFromCamera({ x: x / W * 2 - 1, y: -y / H * 2 + 1 }, b._cam); const h = b._ray.intersectObject(b.ship.root, true).find((q) => q.object.isMesh && q.uv && q.object.visible); return h ? [Math.round(h.uv.x * 2048), Math.round(h.uv.y * 2048)] : null; }); }, [pts, clip.width, clip.height]);
console.log(JSON.stringify(res), clip.width, clip.height);
await b.close();
