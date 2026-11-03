// Vorher/Nachher-Bilder je Schiffsklasse (nur Entwicklung, Dev-Server + Google Chrome, läuft unsichtbar).
// Aufruf: Q=high node tools/bilder/schiffe.mjs <ausgabeordner> [basis-url]
//   KLASSEN=s1,s8  nur diese Klassen · ANSICHT=hangar,verfolger,cockpit,nah  nur diese Ansichten
//   FRAKTIONEN=europa,eris  (Standard: Hangar alle drei, Flugansichten zwei je Klasse)
// Gleiche Lage, gleicher Kurs, gleiche Wartezeit. „hangar“ nimmt zusätzlich fünf Hangar-Nahaufnahmen auf
// (Kamera 0,75–1,1 Radien: Bug, Flanke, Heck, Oberseite, Unterseite – Heck, Ober- und Unterseite ohne Halle, damit
// kein Hallenträger und kein Kran vor dem Rumpf steht), dafür braucht der
// Stand den Prüf-Haken window.__lsBay.orbit (station-bay.js). Fehlt er (alter Stand), entfallen die Nahaufnahmen.
// Ergebnis: <klasse>-<fraktion>-<ansicht>.png und bericht.json (Bildzeit, GPU-Zeit, Draw Calls, Texturen).
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = process.argv[2] || 'schiffe';
const base = process.argv[3] || 'http://localhost:5198';
const quality = process.env.Q || 'high';
const size = (process.env.GROESSE || '1600x900').split('x').map(Number);
// Flugansichten: zwei Fraktionen je Klasse (jede Fraktion kommt mehrfach vor); Hangar: alle drei
const FAC2 = { s1: ['europa', 'saturn'], s2: ['saturn', 'europa'], s3: ['eris', 'europa'], s4: ['europa', 'eris'], s5: ['saturn', 'eris'], s6: ['eris', 'europa'], s7: ['europa', 'saturn'], s8: ['saturn', 'europa'] };
const ALLF = ['europa', 'saturn', 'eris'];
const facOverride = process.env.FRAKTIONEN ? process.env.FRAKTIONEN.split(',') : null;
// Hangar-Nahaufnahmen [Name, Gier, Neigung, Abstand in Radien, Blickversatz x (− = Bug), ohne Halle]
const CLOSE = [
  ['nah-bug', 28, 16, 0.78, -0.32, false], ['nah-flanke', 74, 6, 0.95, 0, false], ['nah-heck', 158, 20, 0.85, 0.3, true],
  ['nah-oben', 115, 58, 1.0, 0, true], ['nah-unten', 48, -32, 1.1, 0, true],
  // Runde 4: Heck auch mit Halle (wie im Spiel), damit „kein Hallenträger vor dem Rumpf“ für die echte Ansicht gilt
  ['nah-heck-halle', 158, 20, 0.85, 0.3, false],
];
const classes = (process.env.KLASSEN || 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
const views = (process.env.ANSICHT || 'hangar,verfolger,nah,cockpit').split(',');

// Schiff wechseln (Profil + Spieler), Ausrüstung passend zur Klasse, damit Laser/Generatoren sichtbar sind
const SET_SHIP = (sh) => {
  const w = __ls.world, p = w.profile;
  const n = { s1: [2, 2], s2: [4, 3], s3: [4, 4], s4: [6, 4], s5: [8, 6], s6: [8, 6], s7: [10, 8], s8: [10, 8] }[sh] || [4, 3];
  p.ship = sh; w.player.ship = sh;
  p.loadout = { ...(p.loadout || {}), lasers: Array.from({ length: n[0] }, (_, i) => (i < 2 ? 'ion' : 'pulse')), gens: Array.from({ length: n[1] }, (_, i) => (i % 2 ? 'dr1' : 'sh1')) };
  w.player.loadout = p.loadout;
  __ls.renderer._playerDirty = true;
  __ls.bus?.emit?.('profile', p);
};
const PREP = {
  verfolger: (sh) => { const w = __ls.world; w.player.x += 900; w.player.rot = 2.4; w.player.vx = 0; w.player.vz = 0; },
  nah: (sh) => { const w = __ls.world, r = __ls.renderer; w.player.x += 900; w.player.rot = 2.4; r.rig.zoom = 0.65; },
  cockpit: (sh) => { const w = __ls.world, r = __ls.renderer; w.player.x += 900; w.player.rot = 1.2; for (let i = 0; i < 3 && r.viewMode !== 'cockpit'; i++) r.toggleCamera(); },
  hangar: () => { document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click(); },
};

await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const report = [];
for (const sh of classes) {
  for (const view of views) {
  for (const f of facOverride || (view === 'hangar' ? ALLF : FAC2[sh])) {
    const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((q) => {
      const s = { camera: 'chase', cockpit: false, quality: q, qualityAuto: false, rev: 2 };
      localStorage.setItem('ls.settings', JSON.stringify(s)); localStorage.setItem('ls.camera', 'chase');
      localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
    }, quality);
    const url = view === 'hangar' ? `/?dev=dock&f=${f}` : `/?dev=game&f=${f}`;
    await page.goto(base + url);
    await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.evaluate(([setShip, prep, sh]) => {
      window.__ls?.series?.choose('direct');
      (0, eval)(`(${setShip})`)(sh);
      (0, eval)(`(${prep})`)(sh);
    }, [SET_SHIP.toString(), PREP[view].toString(), sh]).catch((e) => errors.push(String(e)));
    if (view !== 'hangar') await page.addStyleTag({ content: '#hud{display:none!important}' });
    // warten, bis das Modell der Klasse geladen und eingebaut ist
    await page.waitForTimeout(view === 'hangar' ? 9000 : 8000);
    const info = await page.evaluate(async () => {
      const R = window.__ls?.renderer, r = R?.gl;
      const t = []; let last = performance.now();
      await new Promise((res) => { const end = last + 2000; const fr = (now) => { t.push(now - last); last = now; if (now < end) requestAnimationFrame(fr); else res(); }; requestAnimationFrame(fr); });
      t.sort((a, b) => a - b);
      return r ? { ms: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), gpu: R.stats?.gpuOk ? +R.stats.gpu.toFixed(2) : null,
        calls: R.stats?.calls, tris: R.stats?.tris, tex: r.info.memory.textures, geo: r.info.memory.geometries, q: R.quality } : null;
    }).catch(() => null);
    const file = path.join(out, `${sh}-${f}-${view}.png`);
    if (view === 'hangar') {
      // Nahaufnahme: Bedienelemente über der 3D-Fläche ausblenden, Ausschnitt um das Schiff (projizierte Hülle)
      await page.addStyleTag({ content: '.sx-stage *{visibility:hidden!important} .sx-stage .sx-bay3d{visibility:visible!important}' });
      await page.waitForTimeout(400);
      const clip = await page.evaluate(() => {
        const cv = document.querySelector('.sx-bay3d');
        if (!cv) return null;
        const r = cv.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      await page.screenshot({ path: file, ...(clip && clip.width > 50 ? { clip } : {}) });
      // Nahaufnahmen über den Prüf-Haken des Hangars (fester Umlaufwinkel)
      const hook = await page.evaluate(() => !!window.__lsBay);
      if (hook && clip) for (const [name, yaw, pitch, dist, dx, clean] of CLOSE) {
        await page.evaluate(([yaw, pitch, dist, dx, clean]) => { const b = window.__lsBay; b.orbit = { yaw, pitch, dist, dx, clean }; b._dirty = true; }, [yaw, pitch, dist, dx, clean]);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(out, `${sh}-${f}-${name}.png`), clip });
      }
    } else await page.screenshot({ path: file });
    report.push({ sh, f, view, errors: errors.slice(0, 5), info });
    console.log(sh, f, view, JSON.stringify(info), errors.length ? errors[0].slice(0, 160) : '');
    await ctx.close();
  }
  }
}
await browser.close();
await fs.writeFile(path.join(out, 'bericht.json'), JSON.stringify(report, null, 2));
