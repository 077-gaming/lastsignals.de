// Feste Vergleichsansichten für Vorher/Nachher (nur Entwicklung, braucht laufenden Dev-Server und Google Chrome).
// Aufruf: node tools/bilder/ansichten.mjs <ausgabeordner> [basis-url]
// Gleiche Fenstergröße (960×600, Pixeldichte 1; DPR=2 für Retina), gleiche Wartezeit, gleicher Einstieg je Ansicht.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2] || 'ansichten';
const base = process.argv[3] || 'http://localhost:5173';
const extra = process.argv[4] || ''; // z. B. '&tm=agx&exp=1.1' (nur Entwicklung)
const size = (process.argv[5] || '960x600').split('x').map(Number);
const quality = process.env.Q || ''; // NIEDRIG…ULTRA erzwingen: Q=low|medium|high|ultra
const hud = process.env.HUD === '1';  // Standard: HUD ausgeblendet, damit nur die Grafik verglichen wird
const dpr = Number(process.env.DPR) || 1; // Pixeldichte (DPR=2 wie ein Retina-Mac)
const fixed = process.env.FEST === '1'; // adaptive Auflösung vor dem Messen auf 100 % festhalten (Vergleich gleicher Pixelzahl)
// [Name, Adresse, Wartezeit, Vorbereitung im Spiel (nach dem Laden, vor dem Messen)]
const VIEWS = [
  ['station-europa', '/?dev=dock&f=europa', 9000],
  ['station-saturn', '/?dev=dock&f=saturn', 9000],
  ['station-eris', '/?dev=dock&f=eris', 9000],
  ['flug-saturn', '/?dev=game&f=saturn', 12000],
  ['flug-europa', '/?dev=game&f=europa', 12000],
  ['flug-eris', '/?dev=game&f=eris', 12000],
  ['schiff-nah', '/?dev=game&f=europa', 10000, 'nah'],
  ['kampf-saturn', '/?dev=game&f=saturn', 10000, 'kampf'],
  ['cockpit-eris', '/?dev=game&f=eris', 10000, 'cockpit'],
];
// Fester Ablauf je Vorbereitung (gleiche Lage, gleicher Kurs, gleiche Gegnerzahl)
const PREP = {
  nah: () => { const w = __ls.world, r = __ls.renderer; w.player.rot = 2.4; r.rig.zoom = 0.65; },
  kampf: () => {
    const w = __ls.world; w.player.x += 1400; w.player.rot = 0.6;
    for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(0.6) * (420 + i * 60) + (i - 1) * 90, w.player.z - Math.cos(0.6) * (420 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
    w.toggleAttack();
  },
  cockpit: () => { const w = __ls.world, r = __ls.renderer; w.player.x += 900; w.player.rot = 1.2; for (let i = 0; i < 3 && r.viewMode !== 'cockpit'; i++) r.toggleCamera(); },
};

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome', headless: false,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const report = [];
for (const [name, url, wait] of VIEWS) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((q) => {
    // eigene Kamerawahl und Qualität vor dem Start setzen (nur dieser Testbrowser)
    const s = { camera: 'chase', cockpit: false };
    if (q) Object.assign(s, { quality: q, qualityAuto: false, rev: 2 });
    localStorage.setItem('ls.settings', JSON.stringify(s)); localStorage.setItem('ls.camera', 'chase');
    if (q) localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  }, quality);
  await page.goto(base + url + extra);
  await page.waitForTimeout(wait - 3000);
  await page.evaluate((prep) => { __ls.series?.choose('direct'); if (prep) (0, eval)(`(${prep})()`); }, VIEWS.find((v) => v[0] === name)[3] ? PREP[VIEWS.find((v) => v[0] === name)[3]].toString() : '').catch((e) => errors.push(String(e)));
  if (!hud) await page.addStyleTag({ content: '#hud{display:none!important}' });
  await page.waitForTimeout(3000);
  // Kurzer Messwert aus dem Renderer, falls die Test-Schnittstelle da ist
  if (fixed) await page.evaluate(() => { const R = window.__ls?.renderer; if (R) { R._perf.warm = 1e9; if (R.scale !== 1) { R.scale = 1; R._applyPR(); } } }).catch(() => {});
  if (fixed) await page.waitForTimeout(1500);
  const info = await page.evaluate(async () => {
    const R = window.__ls?.renderer, r = R?.gl;
    const i = r && r.info ? r.info.render : null;
    // Bildzeit: Mittel und 95. Perzentil über 2 s (Wandzeit zwischen Bildern), Speicher aus renderer.info
    const t = []; let last = performance.now();
    await new Promise((res) => { const end = last + 2000; const f = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    t.sort((a, b) => a - b);
    return i ? { calls: i.calls, triangles: i.triangles, geo: r.info.memory.geometries, tex: r.info.memory.textures,
      ms: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * 0.95)].toFixed(2),
      gpu: R.stats?.gpuOk ? +R.stats.gpu.toFixed(2) : null, fcalls: R.stats?.calls, ftris: R.stats?.tris, q: R.quality, sc: +(R.scale || 1).toFixed(2), pr: R.stats?.pr ? +R.stats.pr.toFixed(2) : null, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null } : null;
  }).catch(() => null);
  await page.screenshot({ path: path.join(out, name + '.png') });
  report.push({ name, url, wait, errors: errors.slice(0, 5), info });
  await ctx.close();
}
await browser.close();
await fs.writeFile(path.join(out, 'bericht.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.map((r) => ({ n: r.name, err: r.errors.length, info: r.info }))));
