// Tiefe Sektoren 4–8 im echten Spiel durchkämpfen (Entwicklungsserver, Google Chrome): je Sektor Referenz-Schiff mit
// Plasma-Lasern und Schildgeneratoren, Stufe am Sektorbeginn, dann automatisch Ziel wählen, angreifen, umkreisen.
// Aufruf: node tools/playtest/tief.mjs [sekunden_je_sektor=70] [fraktion=saturn] [--url http://127.0.0.1:5287] [--sichtbar]
// Läuft unsichtbar (headless) auf einem frei wählbaren Entwicklungsserver (Standard: Umgebungsvariable LS_URL,
// sonst http://localhost:5173). Mit --flug=taktik fliegt der Bot im Taktikmodus (alter Klickflug), sonst im 3D-Flug.
import { chromium } from 'playwright-core';

const ARGS = process.argv.slice(2), POS = ARGS.filter((a) => !a.startsWith('--') && !/^https?:/.test(a));
const opt = (n, d) => { const i = ARGS.indexOf('--' + n); if (i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--')) return ARGS[i + 1]; const e = ARGS.find((a) => a.startsWith('--' + n + '=')); return e ? e.split('=')[1] : d; };
const SEC = Number(POS[0] || 70), F = POS[1] || 'saturn';
const BASE = opt('url', process.env.LS_URL || 'http://localhost:5173');
const HEADLESS = !ARGS.includes('--sichtbar');
const FLUG = opt('flug', '3d');
const P = { saturn: 'SA', europa: 'EU', eris: 'ER' }[F];
// Sektor, Stufe, Schiff (wie tools/balance/sektoren.mjs)
const PLAN = (process.env.S3 ? [[3, 8, 's2']] : []).concat([[4, 11, 's3'], [5, 16, 's4'], [6, 22, 's5'], [7, 29, 's6'], [8, 35, 's7']]);
const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`${BASE}/?dev=game&f=${F}${FLUG === 'taktik' ? '&flug=taktik' : ''}`); await page.waitForTimeout(8000);
const out = [];
for (const [n, lvl, ship] of PLAN) {
  const r = await page.evaluate(async ([sec, lvl, ship, secs]) => {
    const w = __ls.world, pr = w.profile, bus = __ls.bus;
    __ls.series.choose('direct');
    pr.level = lvl; pr.credits = 1e8; pr.tritium = 1e6; pr.ammo.L1 = 1e6;
    pr.owned.lasers = Array(13).fill(ship === 's2' ? 'ion' : 'plasma'); pr.owned.gens = Array(13).fill('sh1');
    pr.loadout.lasers = []; pr.loadout.gens = [];
    w._switchShip(ship); w._refreshStats();
    w._changeSector(sec, null);
    await new Promise((res) => setTimeout(res, 3000));
    const p = w.player; p.hp = p.hpMax; p.shield = p.shieldMax;
    let kills = 0, deaths = 0, minHull = 1, t0 = performance.now(), frames = 0, lastF = performance.now(), worst = 0;
    let shots = 0, dealt = 0, taken = 0;
    const qp = w._questProgress; w._questProgress = function (t, ...a) { if (t === 'kill') kills++; return qp.call(this, t, ...a); };
    const offs = [bus.on('shot', (s) => { if (s.from === 'player') shots++; }),
      bus.on('damage', (d) => { const v = (d.hull || 0) + (d.shield || 0); if (d.id === 'player') taken += v; else if (d.from === 'player' || !d.drone) dealt += v; })];
    const off = () => { offs.forEach((o) => o()); w._questProgress = qp; };
    const f = (now) => { frames++; worst = Math.max(worst, now - lastF); lastF = now; if (now - t0 < secs * 1000) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    let ang = 0;
    while (performance.now() - t0 < secs * 1000) {
      await new Promise((res) => setTimeout(res, 400));
      if (w.playerDead || p.alive === false) { deaths++; w.repair('here'); await new Promise((res) => setTimeout(res, 1500)); continue; }
      minHull = Math.min(minHull, p.hp / p.hpMax);
      let t = p.targetId != null ? w.entities.get(p.targetId) : null;
      if (!t || t.alive === false) {
        let best = null, bd = 1e12;
        for (const e of w.entities.values()) { if (e.kind !== 'enemy' || e.alive === false) continue; const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } }
        if (!best) continue;
        w.setTarget(best.id); t = best;
      }
      if (!p.attacking) w.toggleAttack();
      ang += 0.35;
      w.moveTo(t.x + Math.cos(ang) * 380, t.z + Math.sin(ang) * 380);
    }
    off();
    return { sector: w.sector.id, name: w.sector.name, lvl, ship, kills, deaths, shots, dps: Math.round(dealt / secs), takenPs: Math.round(taken / secs), minHull: +minHull.toFixed(2), fps: +(frames / secs).toFixed(1), worstMs: Math.round(worst) };
  }, [`${P}-${n}`, lvl, ship, SEC]);
  console.log(JSON.stringify(r));
  out.push(r);
}
console.log(JSON.stringify({ errors: errs.slice(0, 5), n: errs.length }));
await browser.close();
