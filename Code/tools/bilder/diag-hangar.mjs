// Nur Entwicklung: Hangar-Nahaufnahme mit einzeln abgeschalteten Materialkanälen (Fehlersuche Nähte/Kennungen).
// Aufruf: node tools/bilder/diag-hangar.mjs <ordner> <klasse> <fraktion> [ansicht=nah-bug] [modi=alles,ohne-normal,ohne-orm,ohne-farbe,ohne-leucht] [basis-url]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const [out, sh = 's2', f = 'europa', view = 'nah-bug', modes = 'alles,ohne-normal,ohne-orm,ohne-farbe,ohne-leucht', base = 'http://localhost:5198'] = process.argv.slice(2);
const CLOSE = { 'nah-bug': [28, 16, 0.78, -0.32, false], 'nah-flanke': [74, 6, 0.95, 0, false], 'nah-heck': [158, 20, 0.85, 0.3, true], 'nah-oben': [115, 58, 1.0, 0, true], 'nah-unten': [48, -32, 1.1, 0, true] };
const o = process.env.ORBIT ? JSON.parse(process.env.ORBIT) : CLOSE[view];
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript((q) => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); }, process.env.Q || 'high');
await page.goto(`${base}/?dev=dock&f=${f}${process.env.HD ? '&hd=' + process.env.HD : ''}`);
await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(3000);
await page.evaluate((sh) => { __ls.series?.choose('direct'); const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p); document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click(); }, sh);
await page.waitForTimeout(9000);
await page.addStyleTag({ content: '.sx-stage *{visibility:hidden!important} .sx-stage .sx-bay3d{visibility:visible!important}' });
const clip = await page.evaluate(() => { const r = document.querySelector('.sx-bay3d').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
await page.evaluate((o) => { const B = window.__lsBay; B.orbit = { yaw: o[0], pitch: o[1], dist: o[2], dx: o[3], clean: o[4] }; B._dirty = true; }, o);
for (const mode of modes.split(',')) {
  await page.evaluate((mode) => {
    const B = window.__lsBay;
    B.ship.root.traverse((q) => { if (!q.isMesh || !q.material) return; const m = q.material; if (!m.userData.k) m.userData.k = { map: m.map, n: m.normalMap, a: m.aoMap, r: m.roughnessMap, me: m.metalnessMap, e: m.emissiveMap, ec: m.emissive?.clone() };
      const k = m.userData.k; m.map = mode === 'ohne-farbe' ? null : k.map; m.normalMap = mode === 'ohne-normal' ? null : k.n; m.aoMap = mode === 'ohne-orm' ? null : k.a; m.roughnessMap = mode === 'ohne-orm' ? null : k.r; m.metalnessMap = mode === 'ohne-orm' ? null : k.me;
      if (m.userData.uFill) { m.userData.k.fill ??= m.userData.uFill.value; m.userData.uFill.value = mode === 'ohne-fill' ? 0 : m.userData.k.fill; }
      if (m.userData.uRimK) { m.userData.k.rim ??= m.userData.uRimK.value; m.userData.uRimK.value = mode === 'ohne-rim' ? 0 : m.userData.k.rim; }
      k.env ??= m.envMapIntensity ?? 1; m.envMapIntensity = mode === 'ohne-env' ? 0 : k.env;
      m.emissiveMap = mode === 'ohne-leucht' ? null : k.e; if (m.emissive && k.ec) { if (mode === 'ohne-leucht') m.emissive.setRGB(0, 0, 0); else m.emissive.copy(k.ec); } m.needsUpdate = true; });
    B._dirty = true;
  }, mode);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/${sh}-${f}-${view}-${mode}.png`, clip });
}
if (process.env.PTS) console.log(JSON.stringify(await page.evaluate(([pts, W, H]) => { const B = window.__lsBay; return pts.map((s) => { const [x, y] = s.split(',').map(Number); B._ray.setFromCamera({ x: x / W * 2 - 1, y: -y / H * 2 + 1 }, B._cam); const h = B._ray.intersectObject(B.ship.root, true).find((q) => q.object.isMesh && q.uv && q.object.visible); return h ? [+(h.uv.x * 2048).toFixed(1), +(h.uv.y * 2048).toFixed(1)] : null; }); }, [process.env.PTS.split(';'), clip.width, clip.height])));
await b.close();
