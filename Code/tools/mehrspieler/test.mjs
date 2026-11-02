#!/usr/bin/env node
// Mehrspieler-Test im echten Chrome: drei Piloten (Alpha SATURN, Bravo ERIS, Charlie SATURN) in getrennten
// Browser-Kontexten gegen den Entwicklungsserver, gemeinsamer Sektor 3 (Front). Prüft: sehen sich, Interpolation
// flüssig, Chat in allen drei Reitern, Einladung → Koop (Partner nicht doppelt), PvP-Treffer und Abschuss,
// Sektorwechsel räumt auf, Tab schließen räumt auf, keine Konsolenfehler. Bilder: --bilder <ordner>.
//
//   node tools/mehrspieler/test.mjs [--url http://localhost:5191] [--bilder ~/LAST-SIGNALS-Uebergabe/bilder/mp]
//
// Netzlast bleibt klein: drei Clients, gut eine Minute, je 9 Zustände pro Sekunde.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = arg('url', 'http://localhost:5191');
const IMG = path.resolve(String(arg('bilder', path.join(os.homedir(), 'LAST-SIGNALS-Uebergabe/bilder/mp'))).replace(/^~/, os.homedir()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) failed++;
}
async function waitFor(page, fn, arg, ms = 15000, step = 200) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await page.evaluate(fn, arg); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

const PILOTS = [
  { key: 'A', cs: 'Alpha', f: 'saturn', sec: 'SA-3', x: 0, z: 0 },
  { key: 'B', cs: 'Bravo', f: 'eris', sec: 'ER-3', x: 0, z: -260 },
  { key: 'C', cs: 'Charlie', f: 'saturn', sec: 'SA-3', x: 140, z: -190 },
];

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome', headless: false,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1280,800'],
  });
  const errors = { A: [], B: [], C: [] };
  const pages = {};
  for (const P of PILOTS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('ls.settings', JSON.stringify({ quality: 'low', hudScale: 1, reducedMotion: true, rev: 2, master: 0, sfx: 0, music: 0 }));
        localStorage.setItem('ls.qauto', JSON.stringify({ v: 2, quality: 'low', gpu: 'mp-test' }));
      } catch { /* egal */ }
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors[P.key].push(m.text()); });
    page.on('pageerror', (e) => errors[P.key].push('pageerror: ' + e.message));
    await page.goto(`${BASE}/?dev=game&f=${P.f}&cs=${P.cs}`);
    pages[P.key] = page;
    P.page = page;
  }
  const { A, B, C } = pages;

  // Start: Welt da, Mehrspieler verbunden
  for (const P of PILOTS) {
    const ok = await waitFor(P.page, () => !!(window.__ls && window.__ls.mp && window.__ls.mp.secReady), null, 30000);
    check(`${P.cs}: Mehrspieler verbunden`, ok);
  }
  // Alle in Sektor 3 (Front), dicht beieinander; Gegner ruhig stellen (Test soll nicht von Piraten gestört werden)
  for (const P of PILOTS) {
    await P.page.evaluate((P) => {
      const w = window.__ls.world;
      w._changeSector(P.sec, null);
      for (const e of w.enemies) { e.alive = false; e.respawnAt = Infinity; w.entities.delete(e.id); w.bus.emit('despawn', { id: e.id }); }
      const p = w.player; p.x = p.px = P.x; p.z = p.pz = P.z; p.rot = p.prot = 0; p.vx = p.vz = 0; w._haltPlayer(); p.hasMove = false;
      w.profile.level = Math.max(w.profile.level, 8);
      // Einführung, Geschichte und Flug-Coach für die Bilder ausblenden (verdecken sonst den Chat)
      const st = document.createElement('style'); st.textContent = '.lsg, .hud-coach { display: none !important; }'; document.head.appendChild(st);
    }, { sec: P.sec, x: P.x, z: P.z });
  }
  const sids = {};
  for (const P of PILOTS) sids[P.key] = await P.page.evaluate(() => window.__ls.mp.sid);
  const seesAll = (page, n) => waitFor(page, (n) => { const mp = window.__ls.mp; return mp.secReady && mp.roster().filter((r) => r.dist < 2000).length >= n && [...window.__ls.world.entities.keys()].filter((k) => k.startsWith('rp:')).length >= n; }, n, 20000);
  for (const P of PILOTS) check(`${P.cs} sieht die beiden anderen (Liste und Schiff)`, await seesAll(P.page, 2));
  const posA = await B.evaluate((sid) => { const e = window.__ls.world.entities.get('rp:' + sid); return e && { x: e.x, z: e.z, name: e.name, fac: e.faction, ship: e.ship }; }, sids.A);
  check('Bravo sieht Alpha an der richtigen Stelle mit Fraktionsmodell', posA && Math.hypot(posA.x, posA.z) < 30 && posA.fac === 'saturn' && posA.name === 'Alpha', JSON.stringify(posA));
  await sleep(1500);
  await A.screenshot({ path: path.join(IMG, '01-alpha-sieht-bravo-charlie.png') });

  // Interpolation: Alpha fliegt geradeaus, Bravo misst die Darstellung von Alpha pro Bild
  await A.evaluate(() => { const w = window.__ls.world; w.moveTo(0, -4000); });
  await sleep(2500);
  const smooth = await B.evaluate((sid) => new Promise((res) => {
    const out = []; const t0 = performance.now();
    const f = () => {
      const e = window.__ls.world.entities.get('rp:' + sid);
      if (e) out.push([performance.now(), e.x, e.z]);
      if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(out);
    };
    requestAnimationFrame(f);
  }), sids.A);
  let spd = [], jumps = 0, stalls = 0;
  for (let i = 1; i < smooth.length; i++) {
    const dt = (smooth[i][0] - smooth[i - 1][0]) / 1000;
    if (dt <= 0) continue;
    spd.push(Math.hypot(smooth[i][1] - smooth[i - 1][1], smooth[i][2] - smooth[i - 1][2]) / dt);
  }
  const sorted = spd.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0;
  for (const v of spd) { if (v > med * 1.8 + 20) jumps++; if (v < med * 0.3) stalls++; }
  check('Interpolation flüssig (Tempo je Bild gleichmäßig, keine Sprünge/Stillstände)', smooth.length > 60 && med > 50 && jumps <= spd.length * 0.03 && stalls <= spd.length * 0.03, `${smooth.length} Bilder, Median ${med.toFixed(0)} m/s, Sprünge ${jumps}, Stopps ${stalls}`);
  const lag = await Promise.all([A.evaluate(() => { const p = window.__ls.world.player; return { z: p.z, t: Date.now(), v: Math.hypot(p.vx, p.vz) }; }), B.evaluate((sid) => { const e = window.__ls.world.entities.get('rp:' + sid); return { z: e.z, t: Date.now() }; }, sids.A)]);
  const lagS = (lag[1].z - lag[0].z) / Math.max(1, lag[0].v);
  check('Verzögerung der Darstellung plausibel (Puffer + Netz < 0,6 s)', lagS > 0.05 && lagS < 0.6, `${lagS.toFixed(2)} s`);
  await A.evaluate(() => { const w = window.__ls.world; w.stopMove(); w._haltPlayer(); const p = w.player; p.x = p.px = 0; p.z = p.pz = 0; p.rot = p.prot = 0; });
  await sleep(1200);

  // Chat: SEKTOR (alle), FRAKTION (nur SATURN: Charlie, nicht Bravo), ALLE
  const say = (page, ch, text) => page.evaluate(([ch, text]) => window.__ls.mp.say(ch, text), [ch, text]);
  const got = (page, ch, text) => waitFor(page, ([ch, text]) => window.__ls.mp.chat[ch].some((m) => m.text === text && !m.self), [ch, text], 6000);
  check('Chat SEKTOR gesendet', (await say(A, 'sector', 'Hallo Sektor <b>fett</b>')) === '');
  check('Chat SEKTOR kommt bei Bravo und Charlie an', (await got(B, 'sector', 'Hallo Sektor <b>fett</b>')) && (await got(C, 'sector', 'Hallo Sektor <b>fett</b>')));
  const html = await B.evaluate(() => document.querySelector('[data-win="chat"] .mc-log').innerHTML);
  check('Chat-HTML escaped (kein <b> im Fenster)', html.includes('&lt;b&gt;fett&lt;/b&gt;') && !html.includes('<b>fett'));
  await sleep(800);
  check('Chat FRAKTION gesendet', (await say(A, 'faction', 'Nur Saturn')) === '');
  check('Chat FRAKTION kommt bei Charlie an', await got(C, 'faction', 'Nur Saturn'));
  check('Chat FRAKTION nicht bei Bravo (ERIS)', !(await got(B, 'faction', 'Nur Saturn')));
  await sleep(800);
  check('Chat ALLE gesendet', (await say(B, 'all', 'An alle von Eris, du Arschloch')) === '');
  check('Chat ALLE kommt bei Alpha und Charlie an (gefiltert)', (await got(A, 'all', 'An alle von Eris, du *********')) && (await got(C, 'all', 'An alle von Eris, du *********')));
  const r1 = await say(A, 'sector', 'eins'); const r2 = await say(A, 'sector', 'zwei sofort');
  check('Chat-Ratenbegrenzung greift', r1 === '' && r2 !== '', r2);
  const long = await say(C, 'sector', 'x'.repeat(400));
  const longGot = await waitFor(A, () => window.__ls.mp.chat.sector.find((m) => m.cs === 'Charlie' && m.text.startsWith('xxx')), null, 6000);
  check('Chat kürzt auf 200 Zeichen', long === '' && longGot && Array.from(longGot.text).length === 200);
  // Stummschalten: Alpha schaltet Bravo stumm, Bravos nächste Nachricht erscheint nicht
  await A.evaluate(() => window.__ls.mp.setMuted('Bravo', true));
  await sleep(900);
  await say(B, 'sector', 'Hoerst du mich?');
  await got(C, 'sector', 'Hoerst du mich?');
  check('Stummgeschaltet: Nachricht erscheint bei Alpha nicht', !(await A.evaluate(() => window.__ls.mp.chat.sector.some((m) => m.text === 'Hoerst du mich?'))));
  await A.evaluate(() => window.__ls.mp.setMuted('Bravo', false));
  // Chat per Tastatur: Enter öffnet, Text tippen (W/S/Ziffern gehen nicht an die Steuerung), Enter sendet
  await C.bringToFront();
  await C.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await C.keyboard.press('Enter');
  const focused = await C.evaluate(() => document.activeElement && document.activeElement.classList.contains('mc-field'));
  const ammo0 = await C.evaluate(() => window.__ls.world.profile.selectedAmmo);
  await sleep(1000);
  await C.keyboard.type('wasd 12345 Tastatur');
  const moving = await C.evaluate(() => { const p = window.__ls.world.player; return Math.hypot(p.vx, p.vz); });
  const ammo1 = await C.evaluate(() => window.__ls.world.profile.selectedAmmo);
  await C.keyboard.press('Enter');
  check('Enter öffnet das Chatfeld, Tippen steuert nicht', focused && moving < 5 && ammo0 === ammo1, `Tempo ${moving.toFixed(1)}, Munition ${ammo0}→${ammo1}`);
  check('Chat per Tastatur kommt an', await got(A, 'sector', 'wasd 12345 Tastatur'));
  await A.bringToFront();
  await sleep(600);
  await A.screenshot({ path: path.join(IMG, '02-chat-und-pilotenliste.png') });

  // Einladung: Alpha lädt Charlie ein, Charlie nimmt an → Koop (Alpha Gastgeber), Partner nicht doppelt
  await A.evaluate((sid) => window.__ls.mp.invite(sid), sids.C);
  const invOk = await waitFor(C, (sid) => window.__ls.mp.invites().some((v) => v.sid === sid), sids.A, 6000);
  check('Einladung kommt bei Charlie an', invOk);
  await sleep(400);
  await C.screenshot({ path: path.join(IMG, '03-einladung.png') });
  // Annehmen über den Knopf in der Spielerliste
  await C.evaluate(() => { const b = document.querySelector('[data-win="players"] [data-mpact="acc"]'); b && b.click(); });
  const coopA = await waitFor(A, () => { const w = window.__ls.world; return w.coop && w.coop.host && w.entities.get('ally'); }, null, 15000);
  const coopC = await waitFor(C, () => { const w = window.__ls.world; return w.coop && w.coop.guest && w.entities.get('ally'); }, null, 15000);
  check('Einladung → beide im Koop (Alpha Gastgeber, Charlie Gast)', coopA && coopC);
  const tDup = Date.now();
  await waitFor(A, (sid) => !window.__ls.world.entities.get('rp:' + sid), sids.C, 8000);
  await waitFor(C, (sid) => !window.__ls.world.entities.get('rp:' + sid), sids.A, 8000);
  console.log('      (Koop-Abgleich nach', ((Date.now() - tDup) / 1000).toFixed(1), 's)');
  const dupA = await A.evaluate((sid) => ({ ally: !!window.__ls.world.entities.get('ally'), rp: !!window.__ls.world.entities.get('rp:' + sid), coop: window.__ls.mp.roster().find((r) => r.sid === sid)?.coop }), sids.C);
  const dupC = await C.evaluate((sid) => ({ ally: !!window.__ls.world.entities.get('ally'), rp: !!window.__ls.world.entities.get('rp:' + sid) }), sids.A);
  check('Koop-Partner nicht doppelt (nur „ally“, kein zweites Schiff)', dupA.ally && !dupA.rp && dupA.coop && dupC.ally && !dupC.rp, JSON.stringify([dupA, dupC]));
  await A.screenshot({ path: path.join(IMG, '04-koop.png') });

  // PvP: Alpha (SATURN) und Bravo (ERIS) schalten PvP an; Charlie bleibt aus
  await A.evaluate(() => window.__ls.mp.setPvp(true));
  await B.evaluate(() => window.__ls.mp.setPvp(true));
  const pvpOk = await waitFor(A, (sid) => { const e = window.__ls.world.entities.get('rp:' + sid); return e && e.pvpOk; }, sids.B, 15000);
  check('PvP: Bravo für Alpha angreifbar (ab Sektor 2, PvP an, andere Fraktion)', pvpOk);
  const cNot = await C.evaluate((sid) => { const e = window.__ls.world.entities.get('rp:' + sid); return e ? !e.pvpOk : true; }, sids.B);
  check('PvP: Charlie (PvP aus) kann Bravo nicht angreifen', cNot);
  const hp0 = await B.evaluate(() => { const p = window.__ls.world.player; window.__pvpDmg = 0; window.__ls.bus.on('damage', (d) => { if (d.id === 'player' && d.pvp) window.__pvpDmg += (d.hull || 0) + (d.shield || 0); }); return p.hp + p.shield; });
  await A.evaluate((sid) => { const w = window.__ls.world; w.setTarget('rp:' + sid); if (!w.player.attacking) w.toggleAttack(); }, sids.B);
  const hitOk = await waitFor(B, () => window.__pvpDmg > 0, null, 12000);
  const hp1 = await B.evaluate(() => { const p = window.__ls.world.player; return p.hp + p.shield; });
  check('PvP-Treffer kommt an, Bravo wendet Schaden selbst an', hitOk && hp1 < hp0, `${Math.round(hp0)} → ${Math.round(hp1)}`);
  await sleep(500);
  await A.screenshot({ path: path.join(IMG, '05-pvp-angriff.png') });
  await B.screenshot({ path: path.join(IMG, '06-pvp-getroffen.png') });
  // Abschuss: Bravo fast leer, nächster Treffer zerstört → Alpha bekommt Ehre
  const honor0 = await A.evaluate(() => window.__ls.world.profile.honor);
  await B.evaluate(() => { const p = window.__ls.world.player; p.hp = 1; p.shield = 0; });
  const dead = await waitFor(B, () => !window.__ls.world.player.alive, null, 12000);
  const honorOk = await waitFor(A, (h0) => window.__ls.world.profile.honor > h0 && window.__ls.world.profile.honor, honor0, 8000);
  check('PvP-Abschuss: Bravo zerstört, Alpha bekommt Ehre', dead && honorOk, `Ehre ${honor0} → ${honorOk}`);
  await sleep(500);
  await B.screenshot({ path: path.join(IMG, '07-pvp-abschuss.png') });
  // PvP aus bei Bravo: nicht mehr angreifbar
  await B.evaluate(() => { const w = window.__ls.world; w.repair('here'); window.__ls.mp.setPvp(false); });
  const off = await waitFor(A, (sid) => { const e = window.__ls.world.entities.get('rp:' + sid); return e && !e.pvpOk; }, sids.B, 8000);
  check('PvP aus: Bravo nicht mehr angreifbar', off);

  // Sektorwechsel: Bravo springt nach ER-4 → verschwindet bei Alpha, Bravo sieht niemanden mehr
  await B.evaluate(() => window.__ls.world._changeSector('ER-4', null));
  const gone = await waitFor(A, (sid) => !window.__ls.mp.remotes.has(sid) && !window.__ls.world.entities.get('rp:' + sid), sids.B, 8000);
  check('Sektorwechsel: Alpha räumt Bravo auf', gone);
  const alone = await waitFor(B, () => window.__ls.mp.secReady && window.__ls.mp.roster().length === 0 && ![...window.__ls.world.entities.keys()].some((k) => k.startsWith('rp:')), null, 8000);
  check('Sektorwechsel: Bravo im neuen Sektor ohne alte Schiffe', alone);

  // Koop verlassen und Tab schließen: Charlie verlässt den Koop, dann schließt er den Tab → Alpha räumt auf
  await C.evaluate(() => window.__ls.mp.leaveCoop());
  const allyGone = await waitFor(A, () => !window.__ls.world.entities.get('ally'), null, 8000);
  const backRp = await waitFor(A, (sid) => !!window.__ls.world.entities.get('rp:' + sid), sids.C, 8000);
  check('Koop verlassen: Alpha zeigt Charlie wieder als normalen Piloten', allyGone && backRp);
  await C.close();
  const cGone = await waitFor(A, (sid) => !window.__ls.mp.remotes.has(sid) && !window.__ls.world.entities.get('rp:' + sid), sids.C, 12000);
  check('Tab geschlossen: Alpha räumt Charlie auf', cGone);

  // Koop aus dem Hub (bestehender Code-Dialog: sessionStorage ls.coop) läuft weiter, auch über Fraktionen
  // hinweg: Delta (SATURN) Gastgeber, Echo (ERIS) Gast im SATURN-Heimatsektor; Partner nicht doppelt
  errors.D = []; errors.E = [];
  const code = String(5000 + Math.floor(Math.random() * 4000));
  const hub = {};
  for (const [k, cs, f, cfg] of [['D', 'Delta', 'saturn', { role: 'host', code }], ['E', 'Echo', 'eris', { role: 'guest', code, sector: 'SA-1', faction: 'saturn' }]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 });
    await ctx.addInitScript((cfg) => {
      try {
        localStorage.setItem('ls.settings', JSON.stringify({ quality: 'low', hudScale: 1, reducedMotion: true, rev: 2, master: 0, sfx: 0, music: 0 }));
        localStorage.setItem('ls.qauto', JSON.stringify({ v: 2, quality: 'low', gpu: 'mp-test' }));
        sessionStorage.setItem('ls.coop', JSON.stringify(cfg));
      } catch { /* egal */ }
    }, cfg);
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors[k].push(m.text()); });
    page.on('pageerror', (e) => errors[k].push('pageerror: ' + e.message));
    await page.goto(`${BASE}/?dev=game&f=${f}&cs=${cs}`);
    hub[k] = page;
    if (k === 'D') await waitFor(page, () => window.__ls && window.__ls.world && window.__ls.world.coop && window.__ls.world.coop.ch.state === 'joined', null, 20000);
  }
  const hubAlly = await waitFor(hub.D, () => !!window.__ls.world.entities.get('ally'), null, 20000) && await waitFor(hub.E, () => !!window.__ls.world.entities.get('ally') && window.__ls.world.sector.id === 'SA-1', null, 20000);
  check('Koop aus dem Hub: Gastgeber und Gast (andere Fraktion) sehen sich als Partner', hubAlly);
  await waitFor(hub.D, () => window.__ls.mp.secReady && window.__ls.mp.remotes.size > 0, null, 15000);
  await sleep(2500);
  const hubDup = await Promise.all([hub.D, hub.E].map((pg) => pg.evaluate(() => ({ rp: [...window.__ls.world.entities.keys()].filter((k) => k.startsWith('rp:')).length, coop: window.__ls.mp.roster().map((r) => r.coop) }))));
  check('Koop aus dem Hub: Partner nicht doppelt, in der Liste als KOOP', hubDup.every((d) => d.rp === 0 && d.coop.length === 1 && d.coop[0] === true), JSON.stringify(hubDup));
  await hub.D.close(); await hub.E.close();

  // Konsolenfehler
  for (const k of ['A', 'B', 'C', 'D', 'E']) check(`${{ A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo' }[k]}: 0 Konsolenfehler`, errors[k].length === 0, errors[k].slice(0, 3).join(' | '));
  await fs.writeFile(path.join(IMG, 'bericht.json'), JSON.stringify({ zeit: new Date().toISOString(), url: BASE, ergebnisse: results, fehler: errors }, null, 2));
  await browser.close();
  console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nAlle Mehrspieler-Prüfungen bestanden.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
