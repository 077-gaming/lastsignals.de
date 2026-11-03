// Verfolger-Rahmung abgleichen (nur Entwicklung, unsichtbar): misst je Klasse die Bildfläche (konvexe Hülle), Höhe,
// Unterkante gegen das HUD-Band für die Einträge in render/camrig.js CHASE_FRAME, die das Werkzeug zur Laufzeit setzt.
// Aufruf: node tools/bilder/rahmung.mjs '<json {s1:{d,el,y,yaw,yk,k},…} oder [[klasse,{…}],…]>' [basis-url]   F=europa · KAMPF=1 · HUD=1
import { chromium } from 'playwright-core';
const cfg = JSON.parse(process.argv[2] || '{}');
const base = process.argv[3] || 'http://localhost:5198';
const f = process.env.F || 'europa', kampf = process.env.KAMPF === '1', hud = process.env.HUD === '1';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.addInitScript(() => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: 'low', qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); });
await page.goto(`${base}/?dev=game&f=${f}`);
await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(3000);
if (!hud) await page.addStyleTag({ content: '#hud{display:none!important}' });
const out = [];
for (const [sh, c] of Array.isArray(cfg) ? cfg : Object.entries(cfg)) {
  await page.evaluate(([sh, c, kampf]) => {
    __ls.series?.choose('direct');
    const w = __ls.world, p = w.profile, R = __ls.renderer; p.ship = sh; w.player.ship = sh; R._playerDirty = true; __ls.bus?.emit?.('profile', p);
    R.rig.frame[sh] = { ...c };
    if (!window.__start) window.__start = { x: w.player.x + 900, z: w.player.z };
    w.player.x = window.__start.x; w.player.z = window.__start.z; w.player.rot = 2.4; w.player.vx = 0; w.player.vz = 0;
    if (kampf && !window.__foes) {
      window.__foes = 1; const a = 2.4;
      for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(a) * (560 + i * 60) + (i - 1) * 110, w.player.z - Math.cos(a) * (560 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
      w.toggleAttack();
    }
    R.rig.reset = true;
  }, [sh, c, kampf]);
  await page.waitForFunction((sh) => { const R = __ls.renderer, v = R.views.get(__ls.world.player.id); return v && v.vr > 10 && !R._playerDirty; }, sh, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(4500);
  const m = await page.evaluate(() => {
    const R = __ls.renderer, v = R.views.get(__ls.world.player.id), cam = R.camera, p = new (cam.position.constructor)();
    const pts = []; let y0 = 1, y1 = -1, x0 = 1, x1 = -1;
    v.root.updateMatrixWorld(true);
    v.root.traverse((o) => {
      if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || o.material?.isShaderMaterial || o.material?.blending === 2) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      const P = o.geometry.attributes.position, st = Math.max(1, Math.floor(P.count / 4000));
      for (let i = 0; i < P.count; i += st) { p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).project(cam); if (p.z > 1) continue; pts.push([p.x, p.y]); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    });
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const pt of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
    for (let i = pts.length - 1; i >= 0; i--) { const pt = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop(); up.push(pt); }
    const h = lo.slice(0, -1).concat(up.slice(0, -1)); let A = 0;
    for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; A += a[0] * b[1] - b[0] * a[1]; }
    return { A: +(Math.abs(A) / 8).toFixed(4), B: +((x1 - x0) / 2).toFixed(3), H: +((y1 - y0) / 2).toFixed(3), top: +((1 - y1) / 2).toFixed(3), bot: +((1 - y0) / 2).toFixed(3), D: +cam.position.distanceTo(v.root.position).toFixed(1), ck: +(R.combatK ?? 0).toFixed(2) };
  });
  out.push({ sh, ...c, ...m });
  console.log(sh, JSON.stringify(c), JSON.stringify(m));
}
await browser.close();
