// Selbsttest der Welt im 3D-Flug (Teil von npm test, Planung/FLUGMODELL.md 13): Spielerflug über den Flugkern,
// Bolzen, Gegner-KI in 3D mit Regie-Grenzen (T-17), Zonen als Zylinder, Andocken, Sprung, Traktor, Raketen,
// Autopilot, Ebenenfänger, Gegnerfeuer mit ehrlichem Ausweichen und Etappe 2 (echte Gegnerbolzen).
import { World } from './world.js';
import { newProfile } from '../core/data.js';
import { C, BTN, EDGE, MODE } from '../flight/core.js';
import { leadPoint } from '../flight/aim.js';
import { fwdOf } from '../flight/math3.js';
import * as Cfg from './config.js';
import { enemyFwd } from './world3d.js';

const DT = 1 / 60, D = Math.PI / 180;
const sp = new Float64Array(3), tp = new Float64Array(3), tv = new Float64Array(3), lp = new Float64Array(3), f = new Float64Array(3);

function aimAt(w, x, y, z) {
  const p = w.player, c = w.ctl;
  const dx = x - p.x, dy = y - p.y, dz = z - p.z, d = Math.hypot(dx, dy, dz) || 1;
  c[C.AIM] = 1; c[C.AX] = dx / d; c[C.AY] = dy / d; c[C.AZ] = dz / d;
  return d;
}
/** Bot mit Menschenmodell (Reaktion 180 ms über verzögerte Zieldaten, Zielfehler 0,6°), zielt auf die Vorhaltemarke */
function botStep(w, hist, R) {
  const p = w.player, c = w.ctl;
  // Ziel halten, bis es zerstört ist (wie ein Mensch), sonst das nächste
  let best = null, bd = Infinity;
  const cur = p.targetId ? w.entities.get(p.targetId) : null;
  if (cur && cur.alive && cur.kind === 'enemy') { best = cur; bd = (cur.x - p.x) ** 2 + (cur.y - p.y) ** 2 + (cur.z - p.z) ** 2; if (bd > 1400 * 1400) { best = null; bd = Infinity; } }
  if (!best) for (const e of w.enemies) { if (!e.alive) continue; const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } }
  c[C.TZ] = 0; c[C.BTN] = 0; c[C.TX] = 0; c[C.TY] = 0;
  if (!best) return null;
  if (p.targetId !== best.id) w.setTarget(best.id);
  hist.push([best.id, best.x, best.y, best.z, best.vx, best.vy, best.vz]);
  if (hist.length > 11) hist.shift();
  const h = hist[0][0] === best.id ? hist[0] : hist[hist.length - 1];
  sp[0] = p.x; sp[1] = p.y; sp[2] = p.z; tp[0] = h[1]; tp[1] = h[2]; tp[2] = h[3]; tv[0] = h[4]; tv[1] = h[5]; tv[2] = h[6];
  if (leadPoint(sp, tp, tv, 2400, lp) < 0) lp.set(tp);
  const err = 0.6 * D;
  const d = aimAt(w, lp[0] + (R() - 0.5) * 2 * Math.tan(err) * Math.sqrt(bd), lp[1] + (R() - 0.5) * 2 * Math.tan(err) * Math.sqrt(bd), lp[2]);
  const dd = Math.sqrt(bd);
  c[C.TZ] = dd > 480 ? 1 : dd < 160 ? -0.6 : dd < 260 ? 0 : 0.45;
  fwdOf(f, w.fl.q);
  const ang = Math.acos(Math.min(1, (f[0] * c[C.AX] + f[1] * c[C.AY] + f[2] * c[C.AZ])));
  if (dd < 640 && ang < w.flP.gimbal) c[C.BTN] = BTN.FIRE;
  return best;
}
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export function run3dTests(check, makeBus) {
  // ── Kampf im Heimatsektor mit Menschenmodell ──
  {
    const bus = makeBus();
    const pr = newProfile('Bot3D', 'europa'); pr.created = '2026-11-03';
    const w = new World(pr, bus, { seed: 21 });
    w.setFlight3d(true);
    const p = w.player, R = lcg(9), hist = [];
    let bad = 0, maxY = 0, overlap = 0, pairs = 0, coneBad = 0, enemyShots = 0, rearMax = 0, topMax = 0, ticks = 0;
    const seen = {};
    let kills = 0; const firstHit = new Map(), ttk = [];
    bus.on('damage', (d) => { if (d.from === 'player' && d.id !== 'player' && !firstHit.has(d.id)) firstHit.set(d.id, w.time); });
    bus.on('explode', (e) => { if (e.kind === 'enemy') { kills++; if (firstHit.has(e.id)) { ttk.push(w.time - firstHit.get(e.id)); firstHit.delete(e.id); } } });
    bus.on('shot', (s) => {
      if (s.from === 'player' || !s.bolt) return;
      const e = w.entities.get(s.from); if (!e || s.blocked) return;
      enemyShots++;
      enemyFwd(e, f);
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, d = Math.hypot(dx, dy, dz) || 1;
      if (Math.acos(Math.min(1, (f[0] * dx + f[1] * dy + f[2] * dz) / d)) > Cfg.ENEMY_FIRE_ARC + 1e-6) coneBad++;
    });
    for (let i = 0; i < 60 * 150; i++) {
      botStep(w, hist, R);
      w._step(DT);
      if (!Number.isFinite(p.x + p.y + p.z)) bad++;
      for (const e of w.enemies) {
        if (!e.alive) continue;
        if (!Number.isFinite(e.x + e.y + e.z)) bad++;
        maxY = Math.max(maxY, Math.abs(e.y));
        if (e.m3) seen[e.m3] = 1;
      }
      if (i % 15 === 0 && w._regie3) { ticks++; rearMax = Math.max(rearMax, w._regie3.rear); topMax = Math.max(topMax, w._regie3.top); }
      if (i % 30 === 0) {
        const en = w.enemies.filter((e) => e.alive && e.state === 'attack');
        for (let a = 0; a < en.length; a++) for (let b = a + 1; b < en.length; b++) {
          pairs++;
          const A = en[a], B = en[b], dd = Math.hypot(A.x - B.x, A.y - B.y, A.z - B.z);
          if (dd < (A.radius + B.radius)) overlap++;
        }
      }
      if (w.playerDead) w.repair('station');
    }
    check('3D-Welt: 150 s Kampf ohne NaN', bad === 0);
    check('3D-KI: Höhen im Band ±1.500 m', maxY <= 1500, Math.round(maxY) + ' m');
    check('3D-KI: Anflug mit Abdrehen und Durchflug treten auf', !!(seen.run && seen.break && seen.pass), Object.keys(seen).join(','));
    check('3D-KI: kein Ineinanderfliegen (< 1 % der Paare)', pairs === 0 || overlap / pairs < 0.01, `${overlap}/${pairs}`);
    check('3D-KI: Gegner feuern nur im 3D-Feuerkegel', enemyShots > 0 && coneBad === 0, `${enemyShots} Schüsse, ${coneBad} außerhalb`);
    check('T-17 Regie: höchstens 2 Angreifer hinten, höchstens 1 senkrecht über/unter', ticks > 0 && rearMax <= 2 && topMax <= 1, `hinten ${rearMax}, oben ${topMax}`);
    check('3D-Kampf: Bolzen treffen (Bot mit Menschenmodell ≥ 60 %)', w.stats3.bolts > 50 && w.stats3.boltHits / w.stats3.bolts >= 0.6, `${w.stats3.boltHits}/${w.stats3.bolts}`);
    check('3D-Kampf: Abschüsse zählen für Aufträge (kill)', kills >= 3 && pr.quest.index + (w.quest ? w.quest.progress : 0) > 0, `${kills} Abschüsse`);
    ttk.sort((a, b) => a - b);
    const med = ttk.length ? ttk[ttk.length >> 1] : 99;
    check('3D-Kampf: Raider mit Startausrüstung, Zeit vom ersten Treffer bis Abschuss im Median ≤ 14 s (Bot)', ttk.length >= 2 && med <= 14, `Median ${med.toFixed(1)} s aus ${ttk.length}`);
  }
  // ── Munition genau ──
  {
    const bus = makeBus(), pr = newProfile('Mun', 'europa'); pr.created = 'x';
    const w = new World(pr, bus, { seed: 3 }); w.setFlight3d(true);
    const p = w.player; p.x += 2500; w._updateZones();
    const a0 = pr.ammo.L1 + pr.ammo.L2 + pr.ammo.L3; w.ctl[C.BTN] = BTN.FIRE; w.ctl[C.AIM] = 0;
    let n = 0; bus.on('shot', (s) => { if (s.from === 'player' && s.bolt) n++; });
    for (let i = 0; i < 600; i++) w._step(DT);
    const used = a0 - (pr.ammo.L1 + pr.ammo.L2 + pr.ammo.L3);
    check('Bolzen: 4 je Laser und Sekunde, eine Munitionseinheit je 4 Bolzen', Math.abs(n / 10 - 8) < 0.8 && Math.abs(used - Math.ceil(n / 4)) <= 2, `${n} Bolzen, ${used} Einheiten`);
  }
  // ── Zonen als Zylinder, Andocken, Sprung ──
  {
    const bus = makeBus(), pr = newProfile('Zone', 'saturn'); pr.created = 'x';
    const w = new World(pr, bus, { seed: 4 }); w.setFlight3d(true);
    const p = w.player, st = w.station;
    p.x = st.x + 150; p.z = st.z + 150; p.y = 300; w.fl.p[1] = 300; w._updateZones();
    check('Zylinder: 300 m über der Station zählt als sichere Zone', w.inSafeZone === true);
    p.y = 600; w._updateZones();
    check('Zylinder: 600 m darüber nicht mehr', w.inSafeZone === false);
    p.y = 100; w._updateZones(); w.dock();
    check('Andocken im 3D-Flug (sichere Zone)', w.docked === true && p.y === 0);
    w.undock();
    for (let i = 0; i < 30; i++) w._step(DT);
    check('Abdocken: Abdock-Schub vorwärts (≈ 40 m/s)', !w.docked && p.speed > 20, p.speed.toFixed(1));
    const o = w.portals[0];
    p.x = o.x + 40; p.z = o.z + 40; p.y = 250; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z; w.fl.v.fill(0);
    w._updateZones(); w.tryJump();
    check('Sprung im 3D-Flug (Tor als Zylinder)', !!w.jump);
    for (let i = 0; i < 200; i++) { w.ctl.fill(0); w._step(DT); }
    check('Sprung ausgeführt, Höhe danach 0', w.sector.id !== `SA-1` && Math.abs(p.y) < 1, w.sector.id);
  }
  // ── Sprung im natürlichen Anflug (Runde 2): mit Kampftempo aufs Tor, F bei 120 m, W gehalten bzw. losgelassen ──
  for (const holdW of [false, true]) {
    const bus = makeBus(), pr = newProfile('Tor', 'saturn'); pr.created = 'x';
    const w = new World(pr, bus, { seed: 4 }); w.setFlight3d(true);
    const p = w.player, o = w.portals[0];
    w.enemies.forEach((e) => { e.alive = false; });
    // 600 m vor dem Tor, Bug aufs Tor, Kampftempo
    p.x = o.x + 600; p.z = o.z; p.y = o.y || 0; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z;
    let maxD = 0, jumped = false, from = w.sector.id, sp0 = 0;
    for (let i = 0; i < 60 * 12 && !jumped; i++) {
      const c = w.ctl; c.fill(0); c[C.AIM] = 1;
      const dx = o.x - p.x, dz = o.z - p.z, dd = Math.hypot(dx, dz) || 1; c[C.AX] = dx / dd; c[C.AZ] = dz / dd;
      if (!w.jump && dd > 120) c[C.TZ] = 1; else if (holdW) c[C.TZ] = 1;
      w._step(DT);
      if (w.sector.id !== from) { jumped = true; break; }
      if (w.jump || dd <= 120) { if (!w.jump && dd <= 120 && !sp0) { sp0 = p.speed; w._updateZones(); w.tryJump(); } maxD = Math.max(maxD, Math.hypot(p.x - o.x, p.z - o.z)); }
      if (w.sector.id !== from) jumped = true;
    }
    check(`Sprung aus dem Anflug mit Kampftempo (W ${holdW ? 'gehalten' : 'losgelassen'}): Sprungfeld hält das Schiff`, jumped && sp0 > 250 && maxD < Cfg.PORTAL_RADIUS * 2, `v ${Math.round(sp0)} m/s, weitester Abstand ${Math.round(maxD)} m, ${w.sector.id}`);
  }
  // ── Traktor, Raketen, Autopilot, Ebenenfänger ──
  {
    const bus = makeBus(), pr = newProfile('Trak', 'eris'); pr.created = 'x'; pr.ammo.R1 = 10;
    const w = new World(pr, bus, { seed: 6 }); w.setFlight3d(true);
    const p = w.player, c = w.crates.find((o) => o.alive);
    p.x = c.x + 130; p.z = c.z; p.y = c.y + 20; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z; w.ctl.fill(0); w.ctl[C.AZ] = -1;
    let opened = false; bus.on('loot', () => { opened = true; });
    for (let i = 0; i < 240 && c.alive; i++) w._step(DT);
    check('Beute-Traktor zieht die Kiste ab 150 m heran und öffnet sie', !c.alive && opened);
    const e = w.enemies.find((o) => o.alive);
    p.x = e.x + 300; p.z = e.z; p.y = e.y + 120; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z;
    w.setTarget(e.id); w._lastHit = -999; w._invulnUntil = 0;
    const hp0 = e.hp + e.shield;
    w.abilities.LCK.activeFor = 5; // trifft sicher (Rakete würfelt sonst das Ausweichen)
    const ok = w.fireRocket('R1');
    for (let i = 0; i < 60; i++) w._step(DT);
    check('Rakete im 3D-Flug (Reichweite räumlich) trifft', ok && e.hp + e.shield < hp0, `${hp0} → ${e.hp + e.shield}`);
    p.x = w.station.x + 2400; p.z = w.station.z; p.y = 500; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z; w.fl.v.fill(0);
    w.ctl.fill(0); w.ctlActive = false; w._updateZones();
    for (const o of w.enemies) { o.alive = false; w.entities.delete(o.id); }
    w.autoHome();
    let t = 0; while (!w.inSafeZone && t < 40) { w._step(DT); t += DT; }
    check('Autopilot H fliegt im 3D-Flug in die sichere Zone', w.inSafeZone, t.toFixed(1) + ' s');
    p.y = 900; p.vy = 0; w.fl.p[1] = 900; const x0 = p.x, z0 = p.z;
    w.setFlight3d(false);
    w.moveTo(p.x + 300, p.z);
    t = 0; while (Math.abs(p.y) > 0.5 && t < 5) { w._step(DT); t += DT; }
    check('Ebenenfänger: aus 900 m Höhe in ≤ 3 s auf die Ebene', t <= 3.05, t.toFixed(2) + ' s');
    check('Wechsel nach Taktik: Klickflug ab dem ersten Bild', Math.hypot(p.x - x0, p.z - z0) > 50 && p.hasMove !== undefined);
    w.setFlight3d(true);
    check('Wechsel zurück nach 3D: Lage aus rot, Ort bleibt', Math.abs(w.fl.p[0] - p.x) < 1e-9 && Math.abs(w.fl.p[2] - p.z) < 1e-9);
  }
  // ── REISE: Waffen gesperrt, Schild lädt nicht, Treffer bricht Hochlaufen ab ──
  {
    const bus = makeBus(), pr = newProfile('Reise', 'europa'); pr.created = 'x';
    const w = new World(pr, bus, { seed: 8 }); w.setFlight3d(true);
    const p = w.player; p.x += 2600; w._lastCombat = -99;
    w.ctl[C.EDGE] = EDGE.MODE;
    for (let i = 0; i < 120; i++) w._step(DT);
    check('REISE aktiv nach 1,5 s', w.fl.mode === MODE.REISE);
    p.shield = 0; w._lastHit = -99;
    let n = 0; bus.on('shot', (s) => { if (s.from === 'player') n++; });
    w.ctl[C.BTN] = BTN.FIRE;
    for (let i = 0; i < 120; i++) w._step(DT);
    check('REISE sperrt Waffen und pausiert die Schildaufladung', n === 0 && p.shield === 0);
    w.ctl[C.BTN] = 0; w.ctl[C.EDGE] = EDGE.MODE; for (let i = 0; i < 60; i++) w._step(DT);
    w.ctl[C.EDGE] = EDGE.MODE; w._step(DT);
    const e = w.enemies.find((o) => o.alive);
    e.x = p.x + 200; e.z = p.z; e.y = p.y; e.rot = Math.atan2(200, 0); e.pitch = 0;
    w.bolts.on.fill(0);
    // Treffer während des Hochlaufens
    w.fl.modeWant = MODE.REISE; w.fl.modeT = 1;
    w._invulnUntil = 0;
    const B = w.bolts; B.on[0] = 1; B.kind[0] = 2; B.plan[0] = 1; B.life[0] = 0.001; B.dmg[0] = 100; B.from[0] = e.id;
    B.ax[0] = p.x; B.ay[0] = p.y; B.az[0] = p.z; B.vx[0] = 1; B.vy[0] = 0; B.vz[0] = 0; B.n = 1;
    w._step(DT);
    check('Treffer bricht das Hochlaufen von REISE ab', w.fl.modeWant === MODE.KAMPF);
  }
  // ── Gegnerfeuer: Ausweichen zählt ehrlich, Etappe 2 echte Bolzen ──
  {
    const run = (dodge, real) => {
      const bus = makeBus(), pr = newProfile('Dodge' + dodge + real, 'europa'); pr.created = 'x';
      const w = new World(pr, bus, { seed: 12, enemyBolts: real }); w.setFlight3d(true);
      const p = w.player; p.x += 2800; w._updateZones(); w._invulnUntil = 0;
      for (const o of w.enemies) { o.alive = false; w.entities.delete(o.id); }
      const e = w.spawnTemp('raider', p.x + 420, p.z, p.y);
      w.provoke(e);
      let dmg = 0; bus.on('damage', (d) => { if (d.id === 'player') dmg += (d.hull || 0) + (d.shield || 0); });
      for (let i = 0; i < 60 * 20; i++) {
        w.ctl.fill(0); w.ctl[C.AZ] = -1;
        // Haken schlagen quer zur Schusslinie (Gegner liegt seitlich): hoch/runter und vor/zurück im Wechsel
        if (dodge) { const ph = Math.floor(i / 50) % 4; w.ctl[C.TY] = ph < 2 ? 1 : -1; w.ctl[C.TZ] = ph % 2 ? 1 : -1; w.ctl[C.BTN] = BTN.BOOST; }
        w._step(DT);
        p.hp = p.hpMax; if (p.shield < 1) p.shield = p.shieldMax;
      }
      return dmg;
    };
    const still = run(false, false), dodge = run(true, false);
    check('Gegnerfeuer (Etappe 1): Ausweichen in 3D senkt den Schaden deutlich', still > 0 && dodge < still * 0.75, `${Math.round(still)} → ${Math.round(dodge)}`);
    const real = run(false, true);
    check('Etappe 2 (Schalter): echte Gegnerbolzen treffen die Kapsel', real > 0, String(Math.round(real)));
  }
}
