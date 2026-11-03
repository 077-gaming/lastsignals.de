// Nur Entwicklung: eigenes Schiff nah, Materialkanäle einzeln abschalten (Fehlersuche Materialkarten)
import { chromium } from 'playwright-core';
const [out, sh = 's1', f = 'europa'] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const page = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.addInitScript(() => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: 'high', qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); });
await page.goto(`http://localhost:5198/?dev=game&f=${f}`);
await page.waitForTimeout(5000);
await page.evaluate((sh) => { const w = __ls.world; __ls.series?.choose('direct'); w.player.ship = sh; w.profile.ship = sh; __ls.renderer._playerDirty = true; w.player.x += 900; w.player.rot = 2.0; __ls.renderer.rig.zoom = 0.65; }, sh);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await page.waitForTimeout(7000);
for (const mode of ['alles', 'ohne-normal', 'ohne-detail', 'ohne-orm']) {
  await page.evaluate((mode) => {
    const R = __ls.renderer; let pv = null; R.views.forEach((v) => { if (v.kind === 'player' || v.e?.id === 'player') pv = v; });
    if (!pv) R.views.forEach((v, k) => { if (k === 'player') pv = v; });
    pv.root.traverse((o) => { if (!o.isMesh || !o.material?.map) return; const m = o.material; m.userData.k = m.userData.k || { n: m.normalMap, a: m.aoMap, r: m.roughnessMap, me: m.metalnessMap };
      const k = m.userData.k; m.normalMap = mode === 'ohne-normal' ? null : k.n; m.aoMap = mode === 'ohne-ao' ? null : k.a; m.roughnessMap = mode === 'ohne-orm' ? null : k.r; m.metalnessMap = mode === 'ohne-orm' ? null : k.me; m.needsUpdate = true; }); R.factory.uShipDetail.value = mode === 'ohne-detail' ? 0 : 1;
  }, mode);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${sh}-${mode}.png` });
}
await b.close();
