// Cockpit-Umsehen aufnehmen und prüfen (nur Entwicklung, läuft unsichtbar).
// Aufruf: node tools/bilder/cockpit.mjs <dateianfang> [klasse] [fraktion] [basis-url]   → <dateianfang>-<blick>.png
// Q=high|ultra (Standard ultra) · PRUEF=0 nur aufnehmen
// Runde 4: Blickwinkel werden während der ganzen Aufnahme gehalten (Intervall setzt rig.looking/lookYaw/lookPitch je
// 16 ms, sonst federt der Blick zwischen Setzen und Bild zurück); dazu die Grenzen ±1,9 rad Gier und −0,6/0,7 Neigung.
// Prüfung: je Bild Anteil der Bildpunkte mit Helligkeit < 6/255 (ohne den Bereich jenseits der Kanzelscheiben: die
// Kanzel wird für die Messung mit schwarzer Welt gezeichnet, nur Bildpunkte der Kanzel zählen). Grenze 5 %.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import fs from 'node:fs/promises';
const out = process.argv[2]; const sh = process.argv[3] || 's1'; const f = process.argv[4] || 'europa'; const base = process.argv[5] || 'http://localhost:5198'; const Q = process.env.Q || 'ultra';
const VIEWS = [['vorn', 0, 0], ['links', 1.25, -0.1], ['rechts', -1.25, -0.1], ['unten', 0, -0.55],
  ['links-max', 1.9, 0], ['rechts-max', -1.9, 0], ['links-unten', 1.9, -0.6], ['rechts-unten', -1.9, -0.6], ['links-oben', 1.9, 0.7], ['rechts-oben', -1.9, 0.7], ['oben', 0, 0.7], ['unten-max', 0, -0.6]];
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript((Q) => { localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: Q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' })); }, Q);
await page.goto(`${base}/?dev=game&f=${f}&hd=1`);
await page.waitForFunction(() => window.__ls?.world?.player); await page.waitForTimeout(3000);
await page.evaluate((sh) => { __ls.series?.choose('direct'); const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p); w.player.x += 900; w.player.rot = 1.2; const r = __ls.renderer; for (let i = 0; i < 3 && r.viewMode !== 'cockpit'; i++) r.toggleCamera(); }, sh);
await page.addStyleTag({ content: '#hud{display:none!important}' });
await page.waitForTimeout(7000);
const res = [];
for (const [n, y, p] of VIEWS) {
  await page.evaluate(([y, p]) => { clearInterval(window.__look); const g = __ls.renderer.rig; const set = () => { g.looking = true; g.lookYaw = y; g.lookPitch = p; }; set(); window.__look = setInterval(set, 16); }, [y, p]);
  await page.waitForTimeout(700);
  const file = `${out}-${n}.png`;
  await page.screenshot({ path: file });
  // Messmaske: Welt ausgeblendet, Hintergrund einmal schwarz, einmal weiß – wo sich beide Bilder unterscheiden, sieht man
  // durch die Kanzelscheiben (zählt nicht); die übrigen Bildpunkte sind Kanzel
  const shot = async (c) => { await page.evaluate((c) => { const R = __ls.renderer, S = R.scene; if (!window.__vis) { window.__vis = S.children.map((o) => o.visible); window.__bg = S.background; } S.children.forEach((o) => { o.visible = false; }); S.background = new (R.cockpit._accent.constructor)(c, c, c); }, c); await page.waitForTimeout(250); return page.screenshot(); };
  const m0 = await shot(0), m1 = await shot(1);
  await page.evaluate(() => { const S = __ls.renderer.scene; S.children.forEach((o, i) => { o.visible = window.__vis[i] ?? true; }); S.background = window.__bg; window.__vis = null; });
  await page.waitForTimeout(200);
  res.push({ n, y, p, file, m0, m1 });
}
await page.evaluate(() => clearInterval(window.__look));
await b.close();
// Auswertung: Anteil dunkler Bildpunkte (< 6/255) an der Kanzelfläche (Maske aus m0/m1) und am ganzen Bild
if (process.env.PRUEF !== '0') {
  const bad = [];
  for (const r of res) {
    const { data, info } = await sharp(r.file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const a0 = await sharp(r.m0).removeAlpha().raw().toBuffer(), a1 = await sharp(r.m1).removeAlpha().raw().toBuffer();
    let n = 0, k = 0;
    for (let i = 0; i < data.length; i += 3) {
      const see = Math.abs(a1[i] - a0[i]) + Math.abs(a1[i + 1] - a0[i + 1]) + Math.abs(a1[i + 2] - a0[i + 2]) > 60;
      if (see) continue; k++;
      const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]; if (L < 6) n++;
    }
    r.kanzel = +(k / (info.width * info.height)).toFixed(3);
    r.dunkel = +(n / (info.width * info.height)).toFixed(4); // Anteil am ganzen Bild (nur Kanzel-Bildpunkte)
    delete r.m0; delete r.m1;
    if (r.dunkel > 0.05) bad.push(`${r.n} (Gier ${r.y}, Neigung ${r.p}): ${(r.dunkel * 100).toFixed(1)} % unter 6/255`);
  }
  await fs.writeFile(`${out}-pruefung.json`, JSON.stringify(res, null, 1));
  console.log(res.map((r) => `${r.n} ${(r.dunkel * 100).toFixed(1)} % (Kanzel ${(r.kanzel * 100).toFixed(0)} %)`).join(' · '));
  if (bad.length) { console.error('ABBRUCH Cockpit zu dunkel:\n  ' + bad.join('\n  ')); process.exit(2); }
  console.log('Cockpit-Helligkeit ok (≤ 5 % unter 6/255 in allen Blickrichtungen)');
}
