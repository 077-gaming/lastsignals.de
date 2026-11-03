// Feste Vergleichsansichten für Vorher/Nachher (nur Entwicklung, braucht laufenden Dev-Server und Google Chrome).
// Aufruf: node tools/bilder/ansichten.mjs <ausgabeordner> [basis-url]
// Gleiche Fenstergröße (960×600, Pixeldichte 1; DPR=2 für Retina), gleiche Wartezeit, gleicher Einstieg je Ansicht.
// Vergleichbar (Runde 2): läuft unsichtbar (headless), fester Zufallswert (Math.random mit Startwert, SEED=…), und in
// Flugansichten wird die Simulation nach der Vorbereitung um eine feste Zeit (2,5 s in 50 Schritten) weitergerechnet und
// dann angehalten – gleiche Gegnerlage, gleicher Kurs, nur die Grafik läuft weiter (Messung der Bildzeit bleibt gültig).
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
  // Ergänzung Meshy-Einbau: Hangar, Asteroidenfeld, Sprungtor, großes Schiff, Schwarm-Kampf
  ['hangar-saturn', '/?dev=hub&f=saturn', 9000, 'hangar', { hud: true }],
  ['bucht-europa', '/?dev=dock&f=europa', 9000, 'bucht', { hud: true }],
  ['feld-europa', '/?dev=game&f=europa', 10000, 'feld'],
  ['tor-saturn', '/?dev=game&f=saturn', 10000, 'tor'],
  ['schiff5-eris', '/?dev=game&f=eris', 12000, 'schiff5'],
  ['kampf-schwarm', '/?dev=game&f=europa', 10000, 'schwarm'],
  // Runde 2: Schiff 6 Eris im Kampf vor dunklem Nebel (Silhouette, Randlicht)
  ['kampf-eris-s6', '/?dev=game&f=eris', 12000, 'kampf6'],
  // Runde 3: Schiff 8 Eris im Kampf (großer dunkler Rumpf vor Nebel: Plattenstruktur lesbar?)
  ['kampf-eris-s8', '/?dev=game&f=eris', 12000, 'kampf8'],
  // 3D-Flug (Planung/FLUGMODELL.md 13): Kurvenkampf und Modelle von unten, Himmel an den Polen des Rundumbilds
  ['kurvenkampf-unten', '/?dev=game&f=saturn&flug=3d', 12000, 'kurveUnten'],
  ['modelle-unten', '/?dev=game&f=eris&flug=3d', 12000, 'modelleUnten'],
  ['himmel-oben', '/?dev=game&f=europa&flug=3d', 10000, 'himmelOben'],
  ['himmel-unten', '/?dev=game&f=europa&flug=3d', 10000, 'himmelUnten'],
];
// Fester Ablauf je Vorbereitung (gleiche Lage, gleicher Kurs, gleiche Gegnerzahl)
const PREP = {
  nah: () => { const w = __ls.world, r = __ls.renderer; w.player.rot = 2.4; r.rig.zoom = 0.65; },
  kampf: () => {
    const w = __ls.world; w.player.x += 1400; w.player.rot = 0.6;
    for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(0.6) * (420 + i * 60) + (i - 1) * 90, w.player.z - Math.cos(0.6) * (420 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
    w.toggleAttack();
  },
  kampf6: () => {
    const w = __ls.world, r = __ls.renderer; w.player.ship = 's6'; w.profile.ship = 's6'; r._playerDirty = true;
    w.player.x += 1400; w.player.rot = 0.6;
    for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(0.6) * (520 + i * 60) + (i - 1) * 110, w.player.z - Math.cos(0.6) * (520 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
    w.toggleAttack();
  },
  kampf8: () => {
    const w = __ls.world, r = __ls.renderer; w.player.ship = 's8'; w.profile.ship = 's8'; r._playerDirty = true;
    w.player.x += 1400; w.player.rot = 0.6;
    for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(0.6) * (620 + i * 60) + (i - 1) * 130, w.player.z - Math.cos(0.6) * (620 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
    w.toggleAttack();
  },
  hangar: () => { document.querySelector('[data-nav] [data-sec="hangar"]')?.click(); },
  bucht: () => { document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click(); },
  feld: () => {
    const w = __ls.world, r = __ls.renderer, F = (r.env.fields?.fields || []).find((f) => f.type === 'asteroids');
    if (F) { w.player.x = F.x + F.r * 0.15; w.player.z = F.z + F.r * 0.1; } w.player.rot = 0.8;
  },
  tor: () => {
    const w = __ls.world; let P = null; w.entities.forEach((e) => { if (e.kind === 'portal' && !P) P = e; });
    if (P) { w.player.x = P.x + 210; w.player.z = P.z + 210; w.player.rot = Math.PI / 4; }
  },
  schiff5: () => { const w = __ls.world, r = __ls.renderer; w.player.x += 900; w.player.rot = 2.4; w.player.ship = 's5'; w.profile.ship = 's5'; r._playerDirty = true; r.rig.zoom = 0.8; },
  schwarm: () => {
    const w = __ls.world; w.player.x += 1400; w.player.rot = 0.6;
    ['larva', 'spiker', 'larva'].forEach((t, i) => { const e = w.spawnTemp(t, w.player.x - Math.sin(0.6) * (380 + i * 60) + (i - 1) * 90, w.player.z - Math.cos(0.6) * (380 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); });
    w.toggleAttack();
  },
  // 3D-Lage setzen: Gieren a, Nicken b (Bug hoch +), Rollen c; Zielrichtung auf den neuen Bug
  kurveUnten: () => {
    const w = __ls.world, p = w.player, q = w.fl.q, a = 0.6, b = 0.6, c = 0.7;
    const cy = Math.cos(a / 2), sy = Math.sin(a / 2), cx = Math.cos(b / 2), sx = Math.sin(b / 2), cz = Math.cos(c / 2), sz = Math.sin(c / 2);
    const q0 = [cy * sx, sy * cx, -sy * sx, cy * cx]; // Gieren · Nicken
    q[0] = q0[0] * cz + q0[1] * sz; q[1] = q0[1] * cz - q0[0] * sz; q[2] = q0[3] * sz + q0[2] * cz; q[3] = q0[3] * cz - q0[2] * sz;
    w.fl.pq.set(q); p.x += 1400; w.fl.p[0] = p.x;
    const f = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
    for (let i = 0; i < 3; i++) { const d = 380 + i * 70; const e = w.spawnTemp('raider', p.x + f[0] * d + (i - 1) * 90, p.z + f[2] * d, p.y + f[1] * d + 60); w.provoke(e); if (!i) w.setTarget(e.id); }
    __ls.input.fi.resetAim(); w.toggleAttack();
  },
  modelleUnten: () => {
    const w = __ls.world, p = w.player, q = w.fl.q, b = 0.75;
    q[0] = Math.sin(b / 2); q[1] = 0; q[2] = 0; q[3] = Math.cos(b / 2); w.fl.pq.set(q); p.x += 1200; w.fl.p[0] = p.x;
    ['raider', 'spiker', 'larva'].forEach((t, i) => { const e = w.spawnTemp(t, p.x + (i - 1) * 140, p.z - 260, p.y + 330 + i * 20); e.rot = e.prot = 0.4 * i; });
    __ls.input.fi.resetAim();
  },
  // Himmel: weg von der Station (sonst schiebt die Stationsfreihaltung die Kamera über das Schiff)
  himmelOben: () => { const w = __ls.world, p = w.player, q = w.fl.q, b = 1.45; p.x += 1500; w.fl.p[0] = p.x; q[0] = Math.sin(b / 2); q[1] = 0; q[2] = 0; q[3] = Math.cos(b / 2); w.fl.pq.set(q); __ls.input.fi.resetAim(); },
  himmelUnten: () => { const w = __ls.world, p = w.player, q = w.fl.q, b = -1.45; p.x += 1500; w.fl.p[0] = p.x; q[0] = Math.sin(b / 2); q[1] = 0; q[2] = 0; q[3] = Math.cos(b / 2); w.fl.pq.set(q); __ls.input.fi.resetAim(); },
  cockpit: () => { const w = __ls.world, r = __ls.renderer; w.player.x += 900; w.player.rot = 1.2; for (let i = 0; i < 3 && r.viewMode !== 'cockpit'; i++) r.toggleCamera(); },
};

await fs.mkdir(out, { recursive: true });
const SEED = +(process.env.SEED || 1234);
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'],
});
const report = [];
for (const [name, url, wait, , vopt] of VIEWS) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((seed) => {
    // fester Zufall (mulberry32): gleiche Sterne, Felder, Gegnerentscheidungen in jedem Lauf
    let a = seed >>> 0;
    Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }, SEED);
  await page.addInitScript((q) => {
    // eigene Kamerawahl und Qualität vor dem Start setzen (nur dieser Testbrowser)
    const s = { camera: 'chase', cockpit: false };
    if (q) Object.assign(s, { quality: q, qualityAuto: false, rev: 2 });
    localStorage.setItem('ls.settings', JSON.stringify(s)); localStorage.setItem('ls.camera', 'chase');
    if (q) localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  }, quality);
  await page.goto(base + url + extra);
  await page.waitForTimeout(wait - 3000);
  await page.evaluate((prep) => { window.__ls?.series?.choose('direct'); if (prep) (0, eval)(`(${prep})()`); }, VIEWS.find((v) => v[0] === name)[3] ? PREP[VIEWS.find((v) => v[0] === name)[3]].toString() : '').catch((e) => errors.push(String(e)));
  if (!hud && !vopt?.hud) await page.addStyleTag({ content: '#hud{display:none!important}' });
  if (url.includes('dev=game') && process.env.FREEZE !== '0') {
    // feste Weltzeit: 2,5 s Simulation in festen Schritten, danach angehalten
    await page.evaluate(() => { const w = window.__ls?.world; if (!w) return; for (let i = 0; i < 50; i++) w.update(0.05); w.update = () => {}; }).catch((e) => errors.push(String(e)));
  }
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
