// Hangarkran gegen Rumpf: Strahlentest für alle Klassen und Fraktionen (nur Entwicklung, unsichtbar).
// Senkrechte Strahlen im 0,5-m-Raster über Rumpf, Kufen und Geschützträger (Oberkante je Zelle), Kran als tiefster
// Punkt je Zelle; geprüft für 41 Stellungen im Fahrweg und die Parkstellung des Prüf-Hakens. Treffer = Rumpf an
// dieser Stelle höher als die Kranunterkante (Haken, Seile, Laufkatze, Brücke).
// Aufruf: node tools/bilder/kran.mjs [basis-url]   KLASSEN=s1,…  FRAKTIONEN=europa,…  → kran.json im aktuellen Ordner
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';

const base = process.argv[2] || 'http://localhost:5198';
const classes = (process.env.KLASSEN || 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
const facs = (process.env.FRAKTIONEN || 'europa,saturn,eris').split(',');
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const res = [];
for (const f of facs) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.addInitScript(() => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: 'high', qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); });
  await page.goto(`${base}/?dev=dock&f=${f}`);
  await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__ls?.series?.choose('direct'); document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click(); });
  for (const sh of classes) {
    await page.evaluate((sh) => {
      const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p);
      document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click();
    }, sh);
    await page.waitForFunction((sh) => { const b = window.__lsBay; return b && b.ship && !b.ship.placeholder && b._key && b._key.includes('|' + sh + '|') && !b.isLoading(b._key.split('|')[0], sh); }, sh, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      // Senkrechte Strahlen im 0,5-m-Raster: Rumpfoberkante je Zelle (Dreiecke des Rumpfs, der Kufen und Geschützträger
      // werden auf das Raster gelegt, Höhe je Zellmitte aus der Dreiecksebene = Treffer eines Strahls von oben).
      // Kran: tiefster Punkt je Zelle (Dreiecke abgetastet). Treffer = Rumpf an dieser Stelle höher als der Kran.
      const b = window.__lsBay, V = b._v.constructor;
      const S = 0.5, X0 = -140, Z0 = -120, NX = 560, NZ = 480;
      const top = new Float32Array(NX * NZ).fill(-1e9);
      const A = new V(), B = new V(), C = new V();
      const vis = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
      const tri = (fn, root, local) => root.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        if (!local && (o.material?.isShaderMaterial || o.material?.blending === 2 || !vis(o))) return;
        const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
        const m = local ? o.matrix : o.matrixWorld;
        for (let t = 0; t < n; t += 3) {
          A.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(m);
          B.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(m);
          C.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(m);
          fn(A, B, C);
        }
      });
      // Rumpf rastern: Zellmitten im Dreieck (xz) bekommen die Höhe der Ebene; Eckpunkte zählen immer
      const shipTri = (a, b, c) => {
        const put = (x, z, y) => { const i = Math.floor((x - X0) / S), k = Math.floor((z - Z0) / S); if (i >= 0 && i < NX && k >= 0 && k < NZ && y > top[k * NX + i]) top[k * NX + i] = y; };
        put(a.x, a.z, a.y); put(b.x, b.z, b.y); put(c.x, c.z, c.y);
        const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(det) < 1e-9) return;
        const i0 = Math.floor((Math.min(a.x, b.x, c.x) - X0) / S), i1 = Math.floor((Math.max(a.x, b.x, c.x) - X0) / S);
        const k0 = Math.floor((Math.min(a.z, b.z, c.z) - Z0) / S), k1 = Math.floor((Math.max(a.z, b.z, c.z) - Z0) / S);
        for (let k = Math.max(0, k0); k <= Math.min(NZ - 1, k1); k++) for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) {
          const x = X0 + (i + 0.5) * S, z = Z0 + (k + 0.5) * S;
          const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det, l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det, l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          const y = l1 * a.y + l2 * b.y + l3 * c.y;
          if (y > top[k * NX + i]) top[k * NX + i] = y;
        }
      };
      for (const g of [b.ship.root, b.gear, b.fit]) { g.updateMatrixWorld(true); tri(shipTri, g, false); }
      // Kran (Kran-Koordinaten, ohne Fahrweg): tiefster Punkt je Zelle
      const low = new Map();
      b.crane.updateMatrixWorld(true);
      tri((a, bb, c) => {
        const L = Math.max(a.distanceTo(bb), bb.distanceTo(c), c.distanceTo(a)), s = Math.max(1, Math.ceil(L / 0.25));
        for (let i = 0; i <= s; i++) for (let j = 0; j <= s - i; j++) {
          const u = i / s, v = j / s, w = 1 - u - v;
          const x = a.x * w + bb.x * u + c.x * v, y = a.y * w + bb.y * u + c.y * v, z = a.z * w + bb.z * u + c.z * v;
          const key = Math.round(x / S) * 100000 + Math.round(z / S);
          const q = low.get(key); if (!q || y < q[2]) low.set(key, [x, z, y]);
        }
      }, b.crane, true);
      let shipTop = -1e9; for (let i = 0; i < top.length; i++) if (top[i] > shipTop) shipTop = top[i];
      const [a0, c0] = b._craneRange || [-64, 64];
      const xs = []; for (let i = 0; i <= 40; i++) xs.push(a0 + (c0 - a0) * i / 40);
      const park = Math.abs(a0) > Math.abs(c0) ? a0 : c0; xs.push(park);
      let hits = 0, minClear = Infinity, hookBottom = Infinity;
      const where = [];
      for (const [, , y] of low.values()) hookBottom = Math.min(hookBottom, y);
      for (const X of xs) for (const [x, z, y] of low.values()) {
        const i = Math.floor((x + X - X0) / S), k = Math.floor((z - Z0) / S);
        if (i < 0 || i >= NX || k < 0 || k >= NZ) continue;
        const t = top[k * NX + i]; if (t < -1e8) continue;
        minClear = Math.min(minClear, y - t);
        if (t > y - 0.05) { hits++; if (where.length < 5) where.push([+(x + X).toFixed(1), +z.toFixed(1), +y.toFixed(1), +t.toFixed(1)]); }
      }
      return { range: [+a0.toFixed(1), +c0.toFixed(1)], park, shipTop: +shipTop.toFixed(2), hookBottom: +hookBottom.toFixed(2), cells: low.size, positions: xs.length, hits, minClear: Number.isFinite(minClear) ? +minClear.toFixed(2) : null, where };
    });
    res.push({ f, sh, ...r });
    console.log(f, sh, JSON.stringify(r));
  }
  await page.context().close();
}
await browser.close();
const total = res.reduce((s, r) => s + r.hits, 0);
console.log('Treffer gesamt:', total);
await fs.writeFile(process.env.AUS || 'kran.json', JSON.stringify({ total, res }, null, 1));
