// Meshy-Kennungen („S01“ … „S08“) auf den Spielerrümpfen im Spiel suchen: Hangar-Umlauf (viele Winkel, nah),
// Texterkennung (Apple Vision, Werkzeug werkzeug/schiffe-q/ocr/ocr) auf jedem Bild, Fundstellen per Strahl auf die
// Rumpfoberfläche → UV → Texel der 2K-Karte. Ergebnis als Vorschlag für werkzeug/schiffe-q/kennungen.json („rechtecke“).
// Nur Entwicklung. Aufruf: node tools/models/kennung-suche.mjs <ausgabeordner> [basis-url]   (KLASSEN=s1,s3 · F=europa)
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = process.argv[2] || 'kennung-suche';
const base = process.argv[3] || 'http://localhost:5198';
const OCR = process.env.OCR || path.join(process.env.HOME, 'LAST-SIGNALS-Uebergabe/werkzeug/schiffe-q/ocr/ocr');
const classes = (process.env.KLASSEN || 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
const f = process.env.F || 'europa';
const T = 2048;
// Winkel: Gier 0…315 in 45°-Schritten auf drei Höhen, dazu senkrecht oben/unten; Abstand 1,1 R
const ANG = [[0, 88], [0, -88]];
for (const p of [30, -5, -40]) for (let y = 0; y < 360; y += 45) ANG.push([y, p]);

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', cockpit: false, quality: 'ultra', qualityAuto: false, rev: 2 }));
  localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
});
await page.goto(`${base}/?dev=dock&f=${f}&hd=1`);
await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(3000);
const result = {};
for (const sh of classes) {
  await page.evaluate((sh) => {
    const w = __ls.world, p = w.profile;
    p.ship = sh; w.player.ship = sh; p.loadout = { lasers: [], gens: [] }; w.player.loadout = p.loadout;
    __ls.bus?.emit?.('profile', p);
    document.querySelector('[data-act="tab"][data-tab="shop"]')?.click();
  }, sh);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click());
  await page.waitForFunction(([sh, f]) => { const b = window.__lsBay; const w = b?.factory.glb.get(`ship:${sh}:${f}`); return b?.ship && w && b.pending.size === 0 && w.userData.glbHd; }, [sh, f], { timeout: 60000 }).catch(() => {});
  await page.addStyleTag({ content: '.sx-stage *{visibility:hidden!important} .sx-stage .sx-bay3d{visibility:visible!important}' });
  const hits = [];
  for (const [yaw, pitch] of ANG) {
    await page.evaluate(([yaw, pitch]) => {
      const b = window.__lsBay; b.orbit = { yaw, pitch, dist: 1.1, clean: true }; b._dirty = true;
      b.ship.root.traverse((o) => { if (o.userData.shipMark || o.isPoints || o.isSprite) o.visible = false; });
    }, [yaw, pitch]);
    await page.waitForTimeout(350);
    const clip = await page.evaluate(() => { const r = document.querySelector('.sx-bay3d').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const file = path.join(out, `${sh}-${yaw}-${pitch}.png`);
    await page.screenshot({ path: file, clip });
    let lines = [];
    try { lines = execFileSync(OCR, [file], { encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* keine Texterkennung */ }
    for (const l of lines) {
      if (!l.text || !/[0-9]/.test(l.text) || l.text.length > 9) continue;
      // Ecken und Mitte des Fundrahmens auf die Oberfläche → UV
      const [x0, y0, x1, y1] = l.box;
      const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]];
      const uvs = await page.evaluate(([pts, W, H]) => {
        const b = window.__lsBay, cam = b._cam;
        return pts.map(([x, y]) => {
          b._ray.setFromCamera({ x: (x / W) * 2 - 1, y: -(y / H) * 2 + 1 }, cam);
          const h = b._ray.intersectObject(b.ship.root, true).find((q) => q.object.isMesh && q.uv && q.object.visible);
          return h ? [h.uv.x, h.uv.y] : null;
        });
      }, [pts, clip.width, clip.height]);
      const ok = uvs.filter(Boolean);
      if (!ok.length) continue;
      const us = ok.map((u) => u[0] * T), vs = ok.map((u) => u[1] * T);
      const box = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)].map(Math.round);
      hits.push({ text: l.text, conf: +l.conf.toFixed(2), view: [yaw, pitch], screen: l.box, uvBox: box, spread: Math.max(box[2] - box[0], box[3] - box[1]) });
    }
  }
  await page.evaluate(() => { window.__lsBay.orbit = null; });
  result[sh] = hits;
  console.log(sh, hits.length, hits.map((h) => `${h.text}@${h.uvBox.join(',')}`).join(' | '));
}
await browser.close();
await fs.writeFile(path.join(out, 'fundstellen.json'), JSON.stringify(result, null, 1));
