// Selbsttest der Simulation (Node): node src/sim/selftest.mjs
// Simuliert 120 s mit einem einfachen Bot, Fake-Bus und Fake-localStorage und prüft die Grundregeln.

// Fake-localStorage (vor dem Import von store.js)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};

const { World } = await import('./world.js');
const { newProfile, QUESTS, ENEMIES, SECTOR_EVENTS, VARIANTS, ALPHA_PERKS, sectorsFor } = await import('../core/data.js');
const { store } = await import('../core/store.js');
const C = await import('./config.js');
const { scaledReward } = await import('./events.js');
const { sectorRoutes } = await import('./spawn.js');
const { fmt } = await import('./combat.js');

// Fake-Bus: zählt und merkt sich Ereignisse
function makeBus() {
  const handlers = new Map();
  const log = [];
  const count = {};
  return {
    log, count,
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type).delete(fn); },
    off(type, fn) { handlers.get(type)?.delete(fn); },
    emit(type, payload) {
      count[type] = (count[type] || 0) + 1;
      log.push([type, payload]);
      const set = handlers.get(type);
      if (set) for (const fn of set) fn(payload);
    },
  };
}

let failed = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'OK  ' : 'FEHLER'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) failed++;
}

function runBot(seed, seconds) {
  const bus = makeBus();
  const profile = newProfile('Testpilot', 'europa');
  profile.created = '2026-10-29T00:00:00.000Z'; // fester Wert für gleichen Ablauf
  profile.ammo.SAL = 0; // Grundbot ohne Erprobungspaket-Salven (Laser-Takt wird gemessen)
  const world = new World(profile, bus, { seed });
  const p = world.player;
  const STEP = 1 / 60;
  let travelled = 0;
  let lx = p.x, lz = p.z;
  let maxStepMs = 0;
  const t0 = performance.now();
  // Messwerte für Kampfgefühl, Trägheit und Abstände
  const shotTimes = [];                       // [time, idx] der Spielerschüsse
  bus.on('shot', (s) => { if (s.from === 'player') shotTimes.push([world.time, s.idx]); });
  let overlapSamples = 0, pairSamples = 0, maxEnemyDv = 0, maxEnemyDvRatio = 0;
  const prevV = new Map();

  for (let i = 0; i < seconds * 60; i++) {
    if (world.playerDead) world.repair('here');
    // Bot: erst eigene Wracks einsammeln, sonst nächsten Raider (Quest 1) jagen
    let wreck = null, wd = 1800 * 1800;
    for (const w of world.wrecks) {
      const d = (w.x - p.x) ** 2 + (w.z - p.z) ** 2;
      if (d < wd) { wd = d; wreck = w; }
    }
    let foe = null, fd = Infinity;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2 * 1 + (e.type === 'raider' ? 0 : 4e6);
      if (d < fd) { fd = d; foe = e; }
    }
    if (foe && foe.id !== p.targetId) world.setTarget(foe.id);
    if (foe && !p.attacking) world.toggleAttack();
    if (wreck && (!foe || Math.hypot(foe.x - p.x, foe.z - p.z) > 650)) world.moveTo(wreck.x, wreck.z);
    else if (foe) {
      const d = Math.hypot(foe.x - p.x, foe.z - p.z);
      if (d > 380) world.moveTo(foe.x, foe.z); else world.stopMove();
      if (world.salReadyIn === 0 && d < 600) world.fireSal();
      if (world.rocketReadyIn === 0 && d < 600) world.fireRocket();
    }
    const s0 = performance.now();
    world.update(STEP);
    const ms = performance.now() - s0;
    if (i > 60 && ms > maxStepMs) maxStepMs = ms;
    travelled += Math.hypot(p.x - lx, p.z - lz);
    lx = p.x; lz = p.z;
    // Gegner-Trägheit: Geschwindigkeitsänderung pro Schritt begrenzt (außer im Schritt eines Treffers)
    for (const e of world.enemies) {
      if (!e.alive) { prevV.delete(e); continue; }
      const pv = prevV.get(e);
      if (pv && e.hitAt < world.time - STEP * 0.5 && e.def.speed > 0) {
        const dv = Math.hypot(e.vx - pv[0], e.vz - pv[1]);
        const ratio = dv / (e.def.speed * STEP);
        if (ratio > maxEnemyDvRatio) maxEnemyDvRatio = ratio;
        if (dv > maxEnemyDv) maxEnemyDv = dv;
      }
      if (pv) { pv[0] = e.vx; pv[1] = e.vz; } else prevV.set(e, [e.vx, e.vz]);
    }
    // Übereinanderstapeln: echte Überlappung zweier Gegner (Abstand < Summe der Radien)
    if (i % 30 === 0) {
      const al = world.enemies.filter((e) => e.alive && e.def.speed > 0);
      for (let a = 0; a < al.length; a++) for (let b = a + 1; b < al.length; b++) {
        const d = Math.hypot(al[a].x - al[b].x, al[a].z - al[b].z);
        if (d > 400) continue;
        pairSamples++;
        if (d < al[a].radius + al[b].radius) overlapSamples++;
      }
    }
  }
  const totalMs = performance.now() - t0;
  return { world, bus, profile, travelled, totalMs, maxStepMs, shotTimes, overlapSamples, pairSamples, maxEnemyDvRatio };
}

let error = null;
let A;
try {
  A = runBot(12345, 120);
} catch (e) {
  error = e;
  console.error(e);
}
check('120 s ohne Fehler', !error);
if (error) process.exit(1);

const { world, bus, profile, travelled } = A;
const kills = Object.values(profile.stats.kills).reduce((a, b) => a + b, 0);
const wreckLoot = bus.log.filter(([t, l]) => t === 'loot' && l.credits > 0 && l.xp === 0);
const q1 = bus.log.filter(([t, q]) => t === 'quest' && q.quest.id === 'q1');
const radio = bus.log.filter(([t, m]) => t === 'message' && m.kind === 'radio');

check('Spieler bewegt sich', travelled > 1000, `${Math.round(travelled)} m geflogen`);
check('Gegner sterben', kills >= 3, `${kills} Abschüsse: ${JSON.stringify(profile.stats.kills)}`);
check('Beute kommt an (Wracks)', wreckLoot.length >= 1, `${wreckLoot.length}× Wrack-Beute, ${profile.credits} Credits`);
check('Funkspruch Quest 1', radio.length >= 1, radio[0] && radio[0][1].text.slice(0, 60));
const lastQ1 = q1.length ? q1[q1.length - 1][1] : null;
check('Quest 1 schreitet fort', !!lastQ1 && lastQ1.progress >= 1, lastQ1 ? `${lastQ1.progress}/${QUESTS[0].goal.count}${lastQ1.done ? ' erledigt' : ''}` : '');
check('Schüsse mit Treffern und Fehlschüssen', bus.log.some(([t, s]) => t === 'shot' && s.hit) && bus.log.some(([t, s]) => t === 'shot' && !s.hit));
check('Erfahrung gestiegen', profile.xp > 0, `${profile.xp} XP, Stufe ${profile.level}`);
check('Munition verbraucht', profile.ammo.L1 < 5000, `L1 ${profile.ammo.L1}, SAL ${profile.ammo.SAL}, R1 ${profile.ammo.R1}`);
check('Spielstand gespeichert', !!store.get('Testpilot'));
check('px/pz gesetzt', Number.isFinite(world.player.px) && Number.isFinite(world.player.pz));
check('Rechenzeit', A.totalMs < 2000, `${A.totalMs.toFixed(0)} ms für 7.200 Schritte, längster Schritt ${A.maxStepMs.toFixed(2)} ms`);

// Kampfgefühl: Schüsse versetzt, Richtungen in den Ereignissen
{
  const st = A.shotTimes;
  let same = 0;
  for (let i = 1; i < st.length; i++) if (Math.abs(st[i][0] - st[i - 1][0]) < 1e-9) same++;
  check('Laser feuern versetzt (nicht im Gleichtakt)', st.length > 20 && same / st.length < 0.1, `${st.length} Schüsse, ${same} im selben Schritt`);
  const byIdx = new Map();
  for (const [t, idx] of st) { if (!byIdx.has(idx)) byIdx.set(idx, []); byIdx.get(idx).push(t); }
  const gaps = [];
  for (const ts of byIdx.values()) for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g < 1.3) gaps.push(g); }
  const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / (gaps.length || 1));
  check('Schussabstand je Laser schwankt leicht um 1 s', gaps.length > 10 && Math.abs(mean - 1) < 0.05 && sd > 0.01 && sd < 0.08, `Mittel ${mean.toFixed(3)} s, Streuung ${sd.toFixed(3)} s`);
  const shots = bus.log.filter(([t]) => t === 'shot').map(([, s]) => s);
  const unit = (s) => Number.isFinite(s.dx) && Number.isFinite(s.dz) && Math.abs(Math.hypot(s.dx, s.dz) - 1) < 1e-6 && Number.isFinite(s.x) && Number.isFinite(s.z);
  check('shot: Trefferpunkt x/z und Richtung dx/dz', shots.length > 0 && shots.every(unit), `${shots.filter(unit).length}/${shots.length}`);
  const dmg = bus.log.filter(([t, d]) => t === 'damage' && d.from).map(([, d]) => d);
  check('damage: Einschlagrichtung dx/dz und Trefferpunkt', dmg.length > 0 && dmg.every((d) => Math.abs(Math.hypot(d.dx, d.dz) - 1) < 1e-6 && Number.isFinite(d.hx)), `${dmg.length} Treffer`);
  check('Gegner stapeln sich nicht', A.pairSamples > 50 && A.overlapSamples / A.pairSamples < 0.01, `${A.overlapSamples} Überlappungen in ${A.pairSamples} nahen Paaren`);
  check('Gegner mit Trägheit (Beschleunigung begrenzt)', A.maxEnemyDvRatio <= C.ENEMY_ACCEL + 2.01, `höchstens ${A.maxEnemyDvRatio.toFixed(2)} × Tempo/s`);
  const ev = bus.log.filter(([t, m]) => t === 'message' && m.kind === 'radio' && Object.values(SECTOR_EVENTS).some((d) => d.title === m.title));
  check('Sektor-Ereignis startet von selbst (mit Funkspruch)', ev.length >= 1, ev[0] && ev[0][1].text.slice(0, 90));
}

// gleicher Seed = gleicher Ablauf
const B = runBot(12345, 120);
check('Deterministisch (gleicher Seed)', B.profile.credits === profile.credits && B.profile.xp === profile.xp && Math.abs(B.world.player.x - world.player.x) < 1e-6);

// Shop
{
  const w = world;
  const pr = w.profile;
  const gamma = w.shopInfo('laser', 'gamma');
  check('Shop: Gamma sichtbar, aber nicht kaufbar', !gamma.ok && gamma.reason.length > 0, gamma.reason);
  const s2 = w.shopInfo('ship', 's2');
  check('Shop: Schiff 2 zeigt Bedingung', pr.level >= 5 ? true : (!s2.ok && /Stufe 5/.test(s2.reason)), s2.reason || 'kaufbar');
  pr.credits = Math.max(pr.credits, 20000);
  const lasersBefore = pr.loadout.lasers.join(',');
  const r = w.buy('laser', 'ion');
  check('Shop: Ion Laser kaufen und einbauen', r.ok && pr.loadout.lasers.includes('ion'), `${lasersBefore} → ${pr.loadout.lasers.join(',')} · Lager: ${pr.owned.lasers.join(',')}`);
  const credits = pr.credits;
  w.buy('ammo', 'L1', 2);
  check('Shop: L1 je 1.000 für 10 Credits', credits - pr.credits === 20);
  pr.level = 5; pr.credits += 60000;
  const rs = w.buy('ship', 's2');
  check('Shop: Schiff 2 ab Stufe 5, Laserplätze aufgefüllt', rs.ok && pr.loadout.lasers.length === 4 && w.player.hpMax === 16000, pr.loadout.lasers.join(','));
  const sell = w.sellOre();
  check('Erz verkaufen nur angedockt', sell === 0);
}

// Andocken, Sprung, Tod und Reparatur
{
  const bus2 = makeBus();
  const pr = newProfile('Springer', 'saturn');
  const w = new World(pr, bus2, { seed: 7 });
  w.dock();
  check('Andocken in sicherer Zone', w.docked && bus2.count.docked === 1);
  pr.cargo.nickel = 10;
  check('Erz verkaufen angedockt', w.sellOre() === 100);
  w.undock();
  const portal = w.portals[0];
  w.player.x = portal.x - 50; w.player.z = portal.z - 50;
  for (let i = 0; i < 3; i++) w.update(1 / 60);
  w.tryJump();
  for (let i = 0; i < 60 * 3.2; i++) w.update(1 / 60);
  check('Sprung in Sektor 2', w.sector.index === 2 && bus2.count.sector === 1 && pr.sector === w.sector.id, w.sector.id);
  const back = w.portals.find((o) => o.type === 'SA-1');
  check('Ankunft am Rückportal', back && Math.hypot(w.player.x - back.x, w.player.z - back.z) < 200);
  w.player.hp = 1;
  w.enemyFire(w.enemies[0]); w.enemyFire(w.enemies[0]); w.enemyFire(w.enemies[0]);
  if (w.player.alive) { w.player.hp = 0; w._playerDie(); }
  check('Tod meldet playerDead', w.playerDead && bus2.count.playerDead === 1);
  w.repair('station');
  check('Reparatur an der Station (Heimatsektor)', !w.playerDead && w.sector.id === 'SA-1' && w.inSafeZone);
  w.update(1 / 60);
  check('Nach Reparatur unverwundbar', !w.playerTargetable());
  // Außerhalb der Karte
  w.player.x = w.sector.size + 200; w.player.z = 0;
  for (let i = 0; i < 60 * 6; i++) w.update(1 / 60);
  check('Außerhalb der Karte: Schaden und Warnung', w.player.hp < w.player.hpMax && bus2.log.some(([t, m]) => t === 'message' && /außerhalb/.test(m.text)));
}

// ───────────── Größere Karten, Verteilung, Zonen ─────────────
{
  const secs = sectorsFor('europa');
  const sizes = Object.values(secs).map((x) => x.size);
  check('Karten 6/7/8 km halbe Kante', sizes[0] >= 6000 && sizes[1] >= 7000 && sizes[2] >= 8000, sizes.join(' / '));
  check('Felder je Sektor (Asteroiden, Trümmer, Nebel)', Object.values(secs).every((x) => x.fields.some((f) => f.type === 'asteroids') && x.fields.some((f) => f.type === 'debris') && x.fields.some((f) => f.type === 'nebula')));
  for (const sid of ['EU-1', 'EU-2', 'EU-3']) {
    const pr = newProfile('Verteiler', 'europa');
    pr.created = '2026-10-29T00:00:00.000Z';
    pr.sector = sid;
    const w = new World(pr, makeBus(), { seed: 99 });
    const en = w.enemies;
    const sec = w.sector;
    const total = sec.spawns.reduce((a, sp) => a + sp.count, 0);
    check(`${sid}: Gegneranzahl wie geplant`, en.length === total && total >= 45, `${en.length} Gegner auf ${(sec.size * 2 / 1000)} × ${(sec.size * 2 / 1000)} km`);
    // Klumpen: in 400 m um einen Gegner höchstens 5 andere
    let worst = 0;
    for (const a of en) { let n = 0; for (const b of en) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 400) n++; if (n > worst) worst = n; }
    check(`${sid}: keine Haufen beim Start`, worst <= 5, `höchstens ${worst} Nachbarn in 400 m`);
    const sizesG = w.groups.map((g) => g.members.length);
    check(`${sid}: Rudel 2–4 und Einzelgänger`, sizesG.every((n) => n >= 1 && n <= 4) && sizesG.some((n) => n === 1) && sizesG.some((n) => n >= 2), `${w.groups.length} Gruppen: ${sizesG.join(',')}`);
    // Mindestabstand der Rudel (Poisson): nächster Nachbar im Median ≥ 80 % des Sollabstands
    const nn = w.groups.map((g) => Math.min(...w.groups.filter((o) => o !== g).map((o) => Math.hypot(o.cx - g.cx, o.cz - g.cz))));
    nn.sort((a, b) => a - b);
    const med = nn[Math.floor(nn.length / 2)];
    check(`${sid}: Rudel mit Mindestabstand verteilt`, med >= C.GROUP_MIN_DIST * 0.8 && nn[0] >= C.GROUP_MIN_DIST * 0.4, `kleinster ${Math.round(nn[0])} m, Median ${Math.round(med)} m`);
    // Zonen: Piraten oft an der Route, Schwarm oft in Asteroidenfeldern
    const routes = sectorRoutes(sec);
    const segD = (x, z, R) => { const dx = R.bx - R.ax, dz = R.bz - R.az; let t = ((x - R.ax) * dx + (z - R.az) * dz) / (dx * dx + dz * dz); t = Math.max(0, Math.min(1, t)); return Math.hypot(R.ax + dx * t - x, R.az + dz * t - z); };
    const pir = w.groups.filter((g) => ENEMIES[g.type].group === 'pirate');
    const sw = w.groups.filter((g) => ENEMIES[g.type].group === 'swarm');
    const onRoute = pir.filter((g) => routes.some((R) => segD(g.cx, g.cz, R) < C.ROUTE_SPREAD + 250)).length;
    const inField = sw.filter((g) => sec.fields.some((f) => f.type === 'asteroids' && Math.hypot(g.cx - f.x, g.cz - f.z) < f.r)).length;
    check(`${sid}: Piraten an Routen, Schwarm in Feldern`, (!pir.length || onRoute / pir.length >= 0.4) && (!sw.length || inField / sw.length >= 0.45), `Route ${onRoute}/${pir.length}, Feld ${inField}/${sw.length}`);
    const st = sec.station;
    check(`${sid}: Spawns weg von Station und Toren`, en.every((e) => (!st || Math.hypot(e.x - st.x, e.z - st.z) > C.SAFE_RADIUS + 400) && sec.portals.every((o) => Math.hypot(e.x - o.x, e.z - o.z) > 300)));
    const rocks = [...w.entities.values()].filter((e) => e.kind === 'asteroid');
    const inside = (o, pad) => rocks.some((r) => Math.hypot(o.x - r.x, o.z - r.z) < r.radius + pad);
    check(`${sid}: Asteroiden-Brocken, nichts steckt darin`, rocks.length >= 20 && !en.some((e) => inside(e, 0)) && !w.crates.some((c) => inside(c, 10)) && !w.ores.some((o) => inside(o, 10)), `${rocks.length} Brocken`);
    // Patrouille: nach 60 s ohne Spieler (angedockt) sind Rudel unterwegs und halten Formation
    const start = new Map(w.groups.map((g) => [g, [g.leader.x, g.leader.z]]));
    w.player.x = 1e5; // weit weg, damit niemand angreift (Spieler außerhalb wird nicht geprüft)
    w.player.alive = false;
    for (let i = 0; i < 60 * 60; i++) w.update(1 / 60);
    const moved = w.groups.filter((g) => { const L = g.leader; const s0 = start.get(g); return L && Math.hypot(L.x - s0[0], L.z - s0[1]) > 250; }).length;
    let fol = 0, near = 0;
    for (const g of w.groups) for (const m of g.members) if (m !== g.leader && m.alive) { fol++; if (Math.hypot(m.x - g.leader.x, m.z - g.leader.z) < 450) near++; }
    check(`${sid}: Patrouillen fliegen Wegpunkte`, moved / w.groups.length >= 0.7, `${moved}/${w.groups.length} Rudel > 250 m gezogen`);
    check(`${sid}: Rudel halten Formation`, fol > 0 && near / fol >= 0.85, `${near}/${fol} Begleiter nah am Anführer`);
    let ov = 0;
    for (let a = 0; a < en.length; a++) for (let b = a + 1; b < en.length; b++) if (Math.hypot(en[a].x - en[b].x, en[a].z - en[b].z) < en[a].radius + en[b].radius) ov++;
    check(`${sid}: Formation ohne Überlappung`, ov === 0, `${ov} Überlappungen`);
  }
}

// ───────────── Trägheit des Spielers ─────────────
{
  const pr = newProfile('Flieger', 'europa');
  const w = new World(pr, makeBus(), { seed: 3 });
  const p = w.player;
  const vmax = w.playerSpeed;
  const fx = -Math.sin(p.rot), fz = -Math.cos(p.rot);
  w.moveTo(p.x + fx * 6000, p.z + fz * 6000);
  const at = {}; let maxDs = 0, last = 0, thrustOk = true, firstThrust = 0;
  for (let i = 1; i <= 60 * 5; i++) {
    w.update(1 / 60);
    if (i === 6) firstThrust = p.thrust;
    if (!(p.thrust >= 0 && p.thrust <= 1)) thrustOk = false;
    maxDs = Math.max(maxDs, Math.abs(p.speed - last)); last = p.speed;
    if ([30, 60, 120, 210, 270].includes(i)) at[i / 60] = p.speed / vmax;
  }
  check('Beschleunigen weich (kein Sprung auf Höchsttempo)', at[0.5] < 0.2 && at[1] < 0.4 && at[2] > 0.45 && at[2] < 0.9 && firstThrust < 0.3, Object.entries(at).map(([t, v]) => `${t}s ${(v * 100).toFixed(0)} %`).join(' · '));
  check('Nach 3,5–4,5 s Höchsttempo', at[3.5] >= 0.92 && at[4.5] >= 0.99, `${(at[3.5] * 100).toFixed(1)} % / ${(at[4.5] * 100).toFixed(1)} %`);
  check('player.thrust und player.speed gesetzt', thrustOk && p.thrust > 0.3 && p.thrust < 0.8 && Math.abs(p.speed - Math.hypot(p.vx, p.vz)) < 1e-6);
  w.stopMove();
  const br = {};
  for (let i = 1; i <= 60 * 3; i++) { w.update(1 / 60); maxDs = Math.max(maxDs, Math.abs(p.speed - last)); last = p.speed; if ([30, 72, 120].includes(i)) br[i / 60] = p.speed / vmax; }
  check('Bremsen weich (≈ 1,5–2 s)', br[0.5] > 0.45 && br[1.2] > 0.03 && br[2] < 0.02, Object.entries(br).map(([t, v]) => `${t}s ${(v * 100).toFixed(0)} %`).join(' · '));
  check('Tempo ändert sich nie sprunghaft', maxDs <= vmax * Math.max(C.PLAYER_ACCEL, C.PLAYER_BRAKE) / 60 * 1.15, `größte Änderung ${maxDs.toFixed(2)} m/s je Schritt`);
  // Kurven: bei voller Fahrt Kehrtwende befehlen
  w.moveTo(p.x + fx * 6000, p.z + fz * 6000);
  for (let i = 0; i < 60 * 5; i++) w.update(1 / 60);
  const r0 = p.rot, x0 = p.x, z0 = p.z;
  w.moveTo(p.x - fx * 3000, p.z - fz * 3000);
  let maxTurn = 0, prev = p.rot;
  for (let i = 0; i < 30; i++) { w.update(1 / 60); let d = Math.abs(p.rot - prev); if (d > Math.PI) d = 2 * Math.PI - d; maxTurn = Math.max(maxTurn, d); prev = p.rot; }
  let turned = Math.abs(p.rot - r0); if (turned > Math.PI) turned = 2 * Math.PI - turned;
  check('Drehrate begrenzt (fliegt Kurven)', maxTurn <= C.PLAYER_TURN / 60 + 1e-9 && turned < 1.4 && Math.hypot(p.x - x0, p.z - z0) > 80, `0,5 s: ${turned.toFixed(2)} rad gedreht, ${Math.round(Math.hypot(p.x - x0, p.z - z0))} m geflogen`);
  for (let i = 0; i < 60 * 8; i++) w.update(1 / 60);
  let back = Math.abs(p.rot - r0); if (back > Math.PI) back = 2 * Math.PI - back;
  check('Kehrtwende geschafft', back > 2.8, `${back.toFixed(2)} rad`);
}

// ───────────── Varianten, Treffer-Reaktion, Explosionen ─────────────
{
  const bus = makeBus();
  const pr = newProfile('Jäger', 'europa');
  const w = new World(pr, bus, { seed: 11 });
  const p = w.player;
  const raider = w.enemies.find((e) => e.type === 'raider');
  // vor den Spieler stellen, außerhalb der sicheren Zone
  p.x = 0; p.z = 0; w.update(1 / 60);
  w.applyRank(raider, 'elite');
  check('Elite: Name und dreifaches Leben', raider.name === 'Elite Raider' && raider.hpMax === ENEMIES.raider.hp * 3 && raider.shieldMax === ENEMIES.raider.shield * 3 && raider.dmgMult === 3);
  raider.x = 300; raider.z = 0; raider.vx = 0; raider.vz = 0;
  const st0 = raider.stagger;
  w._hitEnemy(raider, 200, false, false, 1, 0, 290, 0);
  check('Treffer: Taumeln und Stoß in Schussrichtung', raider.stagger > st0 && raider.vx > 5, `stagger ${raider.stagger.toFixed(2)}, vx ${raider.vx.toFixed(1)}`);
  const n0 = bus.log.length;
  w._hitEnemy(raider, 1e6, false, false, 1, 0, 290, 0);
  const after = bus.log.slice(n0);
  const lootE = after.find(([t, l]) => t === 'loot' && l.xp > 0);
  const wreck = w.wrecks[w.wrecks.length - 1];
  check('Elite: dreifache Beute', lootE && lootE[1].xp === ENEMIES.raider.loot.xp * 3 && lootE[1].honor === ENEMIES.raider.loot.honor * 3 && wreck.credits === ENEMIES.raider.loot.credits * 3, lootE && `${lootE[1].xp} XP, Wrack ${wreck.credits} Credits`);
  const ex = after.find(([t]) => t === 'explode');
  check('Elite: größere Explosion', ex && ex[1].size > ENEMIES.raider.explode, ex && `size ${ex[1].size}`);
  const sizes = ['larva', 'raider', 'jackal', 'spiker', 'vulture', 'nest'].map((k) => ENEMIES[k].explode);
  check('Explosionsgröße nach Gegnertyp', sizes.every((v, i) => !i || v > sizes[i - 1]) && sizes[sizes.length - 1] <= 4, sizes.join(' < '));

  // Alpha mit Schadensspiegel
  const a = w.enemies.find((e) => e.alive && e.type === 'larva');
  w.applyRank(a, 'alpha', 'reflect');
  a.x = 200; a.z = 100;
  check('Alpha: zehnfach, Name, Extra', a.name === 'Alpha Larva' && a.hpMax === ENEMIES.larva.hp * 10 && a.perk === 'reflect' && w._alpha === a);
  const hp0 = p.hp + p.shield;
  const m0 = bus.log.length;
  w._hitEnemy(a, 400, false, false, 1, 0, 190, 100);
  const refl = bus.log.slice(m0).find(([t, d]) => t === 'damage' && d.id === 'player' && d.reflect);
  check('Alpha-Schadensspiegel trifft den Schützen', !!refl && p.hp + p.shield < hp0 && refl[1].hull + refl[1].shield === Math.round(400 * ALPHA_PERKS.reflect.ratio), refl && `${refl[1].hull + refl[1].shield} zurück`);
  // Alpha mit Verstärkung
  const b = w.enemies.find((e) => e.alive && e.type === 'raider' && e !== raider);
  w.applyRank(a, 'normal');
  w.applyRank(b, 'alpha', 'summon');
  b.x = 400; b.z = -100;
  const cnt0 = w.enemies.length;
  b.hp = b.hpMax * 0.7;
  w.update(1 / 60);
  check('Alpha ruft Verstärkung (3 Gegner, Funkmeldung)', w.enemies.length === cnt0 + ALPHA_PERKS.summon.count && bus.log.some(([t, m]) => t === 'message' && /Verstärkung/.test(m.text)));
  // Alpha mit Schild-Regeneration
  w.applyRank(b, 'alpha', 'regen');
  b.shield = 0;
  for (let i = 0; i < 60; i++) w.update(1 / 60);
  check('Alpha regeneriert Schild', b.shield >= b.shieldMax * ALPHA_PERKS.regen.rate * 0.9, `${Math.round(b.shield)} / ${b.shieldMax}`);
  // Sektormeldung für Alpha
  w.applyRank(b, 'alpha', 'regen');
  for (let i = 0; i < 4 * 60; i++) w.update(1 / 60);
  check('Alpha-Sichtung wird im Sektor gemeldet', bus.log.some(([t, m]) => t === 'message' && /Sektorwarnung: Alpha Raider/.test(m.text) && /Credits/.test(m.text)));
  // Häufigkeit: Elite ≈ 6 %, nie zwei Alphas
  let el = 0, al = 0;
  const probe = w.enemies.find((e) => e.alive && !e.temp && e !== b);
  w.applyRank(b, 'normal');
  for (let i = 0; i < 3000; i++) { w._rollRank(probe); if (probe.rank === 'elite') el++; if (probe.rank === 'alpha') { al++; w.applyRank(probe, 'normal'); } }
  check('Elite selten (≈ 6 %), Alpha sehr selten', el / 3000 > 0.04 && el / 3000 < 0.08 && al > 0 && al / 3000 < 0.025, `${el} Elite, ${al} Alpha in 3.000 Würfen`);
  // SAL-Salve versetzt
  pr.ammo.SAL = 10;
  pr.loadout.lasers = ['pulse', 'pulse', 'pulse', 'pulse'];
  const foe = w.enemies.find((e) => e.alive && e.type === 'raider' && e.rank === 'normal');
  foe.x = 300; foe.z = 0; foe.hp = foe.hpMax = 1e6; w.setTarget(foe.id);
  const salT = [];
  bus.on('shot', (s) => { if (s.ammo === 'SAL') salT.push(w.time); });
  w._salCd = 0; w.fireSal();
  for (let i = 0; i < 30; i++) w.update(1 / 60);
  check('SAL-Salve feuert nacheinander', salT.length === 4 && new Set(salT.map((t) => t.toFixed(4))).size >= 3, salT.map((t) => t.toFixed(2)).join(', '));
}

// ───────────── Sektor-Ereignisse ─────────────
{
  const mk = (seed) => { const bus = makeBus(); const pr = newProfile('Retter', 'saturn'); const w = new World(pr, bus, { seed }); w.player.x = 0; w.player.z = 0; w.update(1 / 60); return { bus, pr, w }; };
  // Konvoi: Erfolg
  {
    const { bus, pr, w } = mk(21);
    check('Konvoi startet', w.startEvent('convoy') && w.event && w.event.type === 'convoy');
    const f = [...w.entities.values()].find((e) => e.kind === 'freighter');
    const att = w.enemies.filter((e) => e.huntId === f.id);
    check('Konvoi: Frachter mit Leben, 4–6 Angreifer', f && f.hpMax > 0 && att.length >= 4 && att.length <= 6 && att.every((e) => e.targetId === f.id), `${att.length} Angreifer`);
    // Spieler weit weg: Piraten beschießen den Frachter
    w.player.x = -4000; w.player.z = 4500;
    for (let i = 0; i < 60 * 12; i++) w.update(1 / 60);
    check('Konvoi: Piraten greifen den Frachter an', f.hp + f.shield < f.hpMax + f.shieldMax && bus.log.some(([t, d]) => t === 'damage' && d.id === f.id), `${Math.round(f.hp)}/${f.hpMax} Hülle, ${Math.round(f.shield)} Schild`);
    const want = scaledReward(w, SECTOR_EVENTS.convoy.reward);
    const c0 = pr.credits, n0 = bus.log.length;
    for (const e of att) if (e.alive) w._hitEnemy(e, 1e6, false, false, 1, 0, e.x, e.z);
    w.update(1 / 60);
    const rew = bus.log.slice(n0).find(([t, l]) => t === 'loot' && l.credits === want.credits && l.tritium === want.tritium && l.xp === want.xp);
    check('Konvoi gerettet: Belohnung genau wie angekündigt', !!rew && pr.credits - c0 === want.credits && bus.log.some(([t, m]) => t === 'message' && m.kind === 'radio' && m.text.includes(`${fmt(want.credits)} Credits`)), `${want.credits} Credits, ${want.tritium} Tritium, ${want.xp} XP, ${want.honor} Ehre`);
    for (let i = 0; i < 60 * 22; i++) w.update(1 / 60);
    check('Konvoi: Frachter fliegt weg, Ereignis vorbei', !w.event && !w.entities.has(f.id));
  }
  // Konvoi: Frachter zerstört
  {
    const { bus, pr, w } = mk(22);
    w.startEvent('convoy');
    const f = [...w.entities.values()].find((e) => e.kind === 'freighter');
    w.player.x = -4000; w.player.z = 4500;
    const c0 = pr.credits;
    for (let i = 0; i < 60 * 260 && w.event; i++) w.update(1 / 60);
    check('Konvoi verloren: keine Belohnung, Meldung', !w.event && pr.credits === c0 && bus.log.some(([t, m]) => t === 'message' && /(zerstört|entkommen)/.test(m.text) && /Konvoi|Frachter|Kestrel/.test(m.text)));
    check('Konvoi verloren: Frachter weg', !w.entities.has(f.id));
  }
  // Treibgut
  {
    const { bus, pr, w } = mk(23);
    check('Treibgut startet', w.startEvent('drift'));
    const cr = w.crates.filter((c) => c.type === 'drift' && c.alive);
    check('Treibgut: 8–12 Crates eng beieinander', cr.length >= 8 && cr.length <= 12 && cr.every((c) => Math.hypot(c.x - w.event.x, c.z - w.event.z) < 320), `${cr.length} Crates`);
    const want = scaledReward(w, SECTOR_EVENTS.drift.reward);
    const n0 = bus.log.length;
    for (const c of cr) { w.player.x = c.x; w.player.z = c.z; w.update(1 / 60); }
    const bonus = bus.log.slice(n0).find(([t, l]) => t === 'loot' && l.credits === want.credits && l.xp === want.xp);
    check('Treibgut: alle eingesammelt → Bonus', !!bonus && !w.event && w.crates.every((c) => c.type !== 'drift'), `${want.credits} Credits, ${want.xp} XP`);
  }
  // Schwarm-Nest
  {
    const { bus, pr, w } = mk(24);
    check('Nest startet', w.startEvent('nest'));
    const nest = w.enemies.find((e) => e.type === 'nest');
    check('Nest: Gegner-Entity (Ziel wählbar)', nest && nest.kind === 'enemy' && nest.hpMax > 0 && w.event.targetId === nest.id);
    const ND = SECTOR_EVENTS.nest;
    check('Nest in Sektor 1: Leben/Schild × 0,4 (Starterschiff schafft es)', w.sector.index === 1 && nest.hpMax === Math.round(ENEMIES.nest.hp * 0.4) && nest.shieldMax === Math.round(ENEMIES.nest.shield * 0.4) && nest.hp === nest.hpMax, `${nest.hpMax} Hülle, ${nest.shieldMax} Schild`);
    // normales Larven-Rudel direkt neben das Nest stellen: darf beim Nest-Kampf nicht mitgezogen werden
    w.player.x = -4000; w.player.z = 4500;
    const larvae = () => w.enemies.filter((e) => e.alive && e.type === 'larva' && e.evTag).length;
    const l0 = larvae();
    let maxL = l0;
    for (let i = 0; i < 60 * 60; i++) { w.update(1 / 60); const n = larvae(); if (n > maxL) maxL = n; }
    const l1 = larvae();
    check('Nest spuckt Larven aus (Sektor 1: höchstens 4)', l0 === Math.min(ND.startLarvae, 4) && l1 > l0 && maxL <= 4 && ND.larvaeBySector[0] === 4, `${l0} → ${l1}, Spitze ${maxL}`);
    // Spieler greift das Nest an: Nest-Larven kommen, normale Larven bleiben ruhig
    const nl = w.enemies.find((e) => e.alive && e.type === 'larva' && e.evTag);
    w.player.x = nest.x + 300; w.player.z = nest.z;
    const wild = w.enemies.filter((e) => e.alive && e.type === 'larva' && !e.evTag && !e.temp).slice(0, 3);
    for (let i = 0; i < wild.length; i++) { wild[i].x = wild[i].px = nest.x + 200 + i * 30; wild[i].z = wild[i].pz = nest.z + 150; }
    w.update(1 / 60); // Raster mit neuen Positionen
    w._provoke(nest); w._provoke(nl);
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    // (Larven sind revierbezogen: so nah am Spieler greifen sie von sich aus an, werden aber nicht vom Nest-Kampf „provoziert“)
    check('Nest-Kampf zieht keine normalen Larven-Rudel mit', wild.length > 0 && wild.every((e) => !e.provoked) && nl.provoked, `${wild.length} wilde Larven geprüft`);
    const want = scaledReward(w, SECTOR_EVENTS.nest.reward);
    const n0 = bus.log.length;
    w.player.x = nest.x + 300; w.player.z = nest.z;
    w._hitEnemy(nest, 1e6, false, false, 1, 0, nest.x, nest.z);
    const tail = bus.log.slice(n0);
    const ex = tail.find(([t, e]) => t === 'explode' && e.id === nest.id);
    check('Nest zerstört: Bonus, große Explosion, Ereignis vorbei', tail.some(([t, l]) => t === 'loot' && l.credits === want.credits && l.xp === want.xp) && ex && ex[1].size >= 3.5 && !w.event);
    w.player.x = nest.x > 0 ? -5000 : 5000; w.player.z = nest.z > 0 ? -5000 : 5000;
    for (let i = 0; i < 60 * 10; i++) w.update(1 / 60);
    check('Nest: übrige Larven verschwinden außer Sicht', larvae() === 0, `${larvae()} übrig`);
  }
}

// ───────────── Meldungen und Beuteschutz ─────────────
{
  const bus = makeBus();
  const pr = newProfile('Meldung', 'europa');
  const w = new World(pr, bus, { seed: 31 });
  const p = w.player;
  p.x = 0; p.z = 0; w.update(1 / 60);
  const v = w.enemies.find((e) => e.type === 'vulture') || w.enemies[0];
  v.behavior = 'passive';
  const far = () => { v.x = v.px = p.x + 1200; v.z = v.pz = p.z; v.vx = v.vz = 0; };
  w._invulnUntil = 0;
  far();
  w.setTarget(v.id); p.attacking = true;
  const cnt = () => bus.log.filter(([t, m]) => t === 'message' && /zu weit weg/.test(m.text)).length;
  const c0 = cnt();
  for (let i = 0; i < 60 * 20; i++) { far(); p.attacking = true; w.update(1 / 60); }
  const c1 = cnt();
  check('„Ziel zu weit weg“: einmal je Ziel, nicht alle paar Sekunden', c1 - c0 === 1, `${c1 - c0}× in 20 s`);
  // zurück in Reichweite, wieder raus → genau eine neue Meldung
  v.x = v.px = p.x + 300; for (let i = 0; i < 10; i++) { v.x = p.x + 300; v.z = p.z; w.update(1 / 60); }
  for (let i = 0; i < 60 * 3; i++) { far(); p.attacking = true; w.update(1 / 60); }
  check('„Ziel zu weit weg“: nach Rückkehr in Reichweite wieder einmal', cnt() - c1 === 1, `${cnt() - c1}×`);

  // Beuteschutz: Dieb darf nicht klauen, solange der Spieler nah ist
  const wr = { id: 'wtest', kind: 'wreck', alive: true, owner: 'player', x: p.x + 200, z: p.z, protectedUntil: w.time - 1 };
  check('Dieb: kein Klauen direkt nach Beuteschutz, wenn Spieler nah', !w.wreckStealable(wr));
  wr.protectedUntil = w.time - C.WRECK_STEAL_GRACE - 1;
  check('Dieb: Klauen nach Beuteschutz + Puffer erlaubt', w.wreckStealable(wr));
  wr.protectedUntil = w.time - 1; wr.x = p.x + C.WRECK_STEAL_PLAYER_DIST + 100;
  check('Dieb: Klauen nach Beuteschutz erlaubt, wenn Spieler weit weg', w.wreckStealable(wr));
  wr.protectedUntil = w.time + 5;
  check('Dieb: nie während des Beuteschutzes', !w.wreckStealable(wr));
}

// ───────────── Gegner-KI: Regie, Spezialangriffe, Ausweichen, Deckung ─────────────
{
  // Laser zeigen nach vorn: im Bot-Lauf weicht die Schussrichtung kaum von der Nase ab
  const angs = [];
  {
    const bus = makeBus();
    const pr = newProfile('Nase', 'europa');
    const w = new World(pr, bus, { seed: 41 });
    const p = w.player;
    bus.on('shot', (s) => { if (s.from === 'player') { let a = Math.atan2(-s.dx, -s.dz) - p.rot; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; angs.push(Math.abs(a)); } });
    p.x = 0; p.z = 0; w.update(1 / 60);
    const r = w.enemies.find((e) => e.type === 'raider');
    r.x = r.px = 500; r.z = r.pz = 0; r.behavior = 'passive';
    w.setTarget(r.id); w.toggleAttack();
    // Spieler kreist seitlich um das Ziel (Nase muss trotzdem zum Ziel zeigen)
    for (let i = 0; i < 60 * 12 && r.alive; i++) {
      if (i % 80 === 0) { const a = Math.atan2(p.z - r.z, p.x - r.x) + 0.9; w.moveTo(r.x + Math.cos(a) * 380, r.z + Math.sin(a) * 380); }
      w.update(1 / 60);
    }
  }
  const meanDeg = angs.reduce((a, b) => a + b, 0) / (angs.length || 1) * 180 / Math.PI;
  check('Laser feuern nach vorn (Nase folgt dem Ziel beim Umkreisen)', angs.length > 10 && Math.max(...angs) <= C.LASER_ARC + 1e-6 && meanDeg < 20, `${angs.length} Schüsse, Mittel ${meanDeg.toFixed(1)}°, max ${(Math.max(...angs) * 180 / Math.PI).toFixed(1)}°`);

  // Regie: 9 Raider greifen an, höchstens 4 gleichzeitig aktiv, Rest wartet im Kreis
  const bus = makeBus();
  const pr = newProfile('Regie', 'europa');
  const w = new World(pr, bus, { seed: 42 });
  const p = w.player;
  p.x = 0; p.z = 0; w.update(1 / 60);
  w._invulnUntil = 0;
  const pack = [];
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const e = w.spawnTemp('raider', Math.cos(a) * 700, Math.sin(a) * 700); w._aggro(e); pack.push(e); }
  let maxAtt = 0, minHold = 99, sides = 0, samples = 0;
  for (let i = 0; i < 60 * 8; i++) {
    p.hp = p.hpMax; p.shield = p.shieldMax; // Spieler bleibt stehen und überlebt
    w.update(1 / 60);
    if (i > 60 && i % 10 === 0) {
      const att = pack.filter((e) => e.alive && e.state === 'attack');
      const hold = pack.filter((e) => e.alive && e.state === 'hold');
      maxAtt = Math.max(maxAtt, att.length); minHold = Math.min(minHold, hold.length);
      // von mehreren Seiten: größte Winkellücke zwischen aktiven Angreifern < 200°
      const ang = att.map((e) => Math.atan2(e.z - p.z, e.x - p.x)).sort((a, b) => a - b);
      let gap = 0; for (let k = 0; k < ang.length; k++) gap = Math.max(gap, (k ? ang[k] - ang[k - 1] : ang[0] + Math.PI * 2 - ang[ang.length - 1]));
      samples++; if (ang.length >= 3 && gap < Math.PI * 200 / 180) sides++;
    }
  }
  check('Regie: höchstens 4 aktive Angreifer, Rest wartet im Kreis', maxAtt <= C.ATTACK_BUDGET[1] && maxAtt >= 3 && minHold >= 4, `höchstens ${maxAtt} aktiv, mindestens ${minHold} wartend`);
  check('Rudel greift von mehreren Seiten an', sides / samples > 0.6, `${sides}/${samples} Stichproben mit Angreifern rundum`);
  const telAt = new Map();
  for (const [t, x] of bus.log) if (t === 'telegraph') telAt.set(x, true);
  const tel = bus.log.filter(([t]) => t === 'telegraph').map(([, x]) => x);
  const spec = bus.log.filter(([t]) => t === 'special').map(([, x]) => x);
  const fields = (x) => ['id', 'kind', 'x', 'z', 'dx', 'dz', 'delay', 'radius'].every((k) => k in x) && x.delay > 0 && x.radius > 0;
  check('Spezialangriff angekündigt (telegraph mit id, kind, x, z, dx, dz, delay, radius)', tel.length > 0 && tel.every(fields), `${tel.length}× ${[...new Set(tel.map((x) => x.kind))].join(', ')}`);
  // jede Ankündigung endet mit einer Ausführung oder einem Abbruch ('special'), außer die letzte läuft noch
  const charging = new Set(pack.filter((e) => e.alive && e.spPhase === 1).map((e) => e.id));
  const order = tel.length > 0 && tel.every((x) => { const i0 = bus.log.findIndex(([t, y]) => y === x); const i1 = bus.log.findIndex(([t, y], i) => i > i0 && t === 'special' && y.id === x.id); return i1 > i0 || charging.has(x.id); });
  check('Ausführung erst nach der Ankündigung', order && spec.some((x) => !x.cancelled));

  // Ausweichen: Salve trifft, wer stehen bleibt; wer aus der Linie fliegt, bekommt nichts ab
  const tryVolley = (dodge, seed) => {
    const bus = makeBus();
    const pr = newProfile('Salve', 'europa');
    const w = new World(pr, bus, { seed });
    const p = w.player;
    p.x = 0; p.z = 0; w.update(1 / 60);
    w._invulnUntil = 0;
    const e = w.spawnTemp('raider', 380, 0);
    w._aggro(e); e.fireCd = 99; // nur der Spezialangriff zählt
    let teleId = null, hits = 0;
    bus.on('telegraph', (t) => { if (t.id === e.id && t.kind === 'volley') { teleId = t.id; if (dodge) { p.x += -t.dz * 250; p.z += t.dx * 250; p.px = p.x; p.pz = p.z; } } });
    bus.on('damage', (d) => { if (d.id === 'player' && d.special === 'volley' && d.from === e.id) hits++; });
    for (let i = 0; i < 60 * 12; i++) { e.fireCd = 99; p.hp = p.hpMax; p.shield = p.shieldMax; w.update(1 / 60); if (teleId && e.spPhase === 0) break; }
    return { teleId, hits };
  };
  const still = tryVolley(false, 51), moved = tryVolley(true, 51);
  check('Salve trifft, wer in der Linie bleibt', !!still.teleId && still.hits >= 3, `${still.hits}/5 Treffer`);
  check('Ausweichen möglich: aus der Linie geflogen, kein Treffer', !!moved.teleId && moved.hits === 0, `${moved.hits} Treffer`);

  // Deckung: Asteroid zwischen Spieler und Ziel blockiert Laser
  {
    const bus = makeBus();
    const pr = newProfile('Deckung', 'europa');
    const w = new World(pr, bus, { seed: 61 });
    const p = w.player;
    const rock = w.rocks[0];
    p.x = rock.x - rock.radius - 200; p.z = rock.z; w.update(1 / 60);
    w._invulnUntil = 0;
    const e = w.spawnTemp('raider', rock.x + rock.radius + 150, rock.z);
    e.behavior = 'passive';
    w.setTarget(e.id); w.toggleAttack();
    const hp0 = e.hp + e.shield;
    for (let i = 0; i < 60 * 2; i++) { p.x = rock.x - rock.radius - 200; p.z = rock.z; p.vx = p.vz = 0; e.x = rock.x + rock.radius + 150; e.z = rock.z; e.vx = e.vz = 0; w.update(1 / 60); }
    const blocked = bus.log.filter(([t, s]) => t === 'shot' && s.from === 'player' && s.blocked).length;
    check('Deckung: Asteroid fängt die Schüsse ab', blocked > 0 && e.hp + e.shield === hp0, `${blocked} Schüsse im Brocken`);
  }

  // Belohnung: zu leichte Gegner bringen deutlich weniger, Sektor 2 mehr; Combo für schnelle Abschüsse
  {
    const bus = makeBus();
    const pr = newProfile('Veteran', 'europa');
    pr.level = 8;
    const w = new World(pr, bus, { seed: 71 });
    const p = w.player;
    p.x = 0; p.z = 0; w.update(1 / 60);
    const base = ENEMIES.raider.loot.xp;
    const kills = [];
    for (let i = 0; i < 3; i++) {
      const e = w.spawnTemp('raider', 300 + i * 60, 0);
      const n0 = bus.log.length;
      w._hitEnemy(e, 1e6, false, false, 1, 0, e.x, e.z);
      kills.push(bus.log.slice(n0));
      w.update(1);
    }
    const xp0 = kills[0].find(([t, l]) => t === 'loot' && l.xp > 0)[1].xp;
    check('Zu leichte Gegner: deutlich weniger Erfahrung (Stufe 8 gegen Raider)', xp0 <= base * 0.25 && xp0 > 0, `${xp0} statt ${base} Erfahrung`);
    const combo = bus.log.filter(([t]) => t === 'combo').map(([, c]) => c);
    check('Combo bei schnellen Abschüssen (Ereignis combo mit Bonus)', combo.length >= 2 && combo[combo.length - 1].count === 3 && combo.every((c) => c.xp >= 0 && c.credits >= 0) && combo[1].credits > 0, combo.map((c) => `×${c.count} +${c.xp} XP +${c.credits} Cr`).join(' · '));
    for (let i = 0; i < 60 * 8; i++) w.update(1 / 60);
    const end = bus.log.filter(([t, c]) => t === 'combo' && c.ended);
    check('Combo endet nach dem Zeitfenster (mit Summe)', end.length === 1 && end[0][1].best === 3, end[0] && `${end[0][1].totalXp} XP, ${end[0][1].totalCredits} Credits`);
    pr.level = 1;
    const r1 = w.rewardScale(w.spawnTemp('jackal', 2000, 2000)).xp;
    check('Stärkere Gegnertypen bringen mehr Erfahrung (Stufe 1 gegen Jackal)', r1 > 1, `× ${r1.toFixed(2)}`);
  }

  // Fluggefühl: Nicken beim Beschleunigen, Schräglage in Kurven (links = positiv)
  {
    const pr = newProfile('Gefühl', 'europa');
    const w = new World(pr, makeBus(), { seed: 81 });
    const p = w.player;
    const fx = -Math.sin(p.rot), fz = -Math.cos(p.rot);
    w.moveTo(p.x + fx * 8000, p.z + fz * 8000);
    let pitchMax = 0;
    for (let i = 0; i < 60 * 2; i++) { w.update(1 / 60); pitchMax = Math.max(pitchMax, p.pitch); }
    for (let i = 0; i < 60 * 3; i++) w.update(1 / 60);
    // Linkskurve: Ziel links der Nase (links = (−cos rot, sin rot))
    const lx = -Math.cos(p.rot), lz = Math.sin(p.rot);
    w.moveTo(p.x + lx * 3000, p.z + lz * 3000);
    let bankMax = 0, bankMin = 0;
    for (let i = 0; i < 60; i++) { w.update(1 / 60); bankMax = Math.max(bankMax, p.bank); bankMin = Math.min(bankMin, p.bank); }
    check('Fluggefühl: pitch beim Beschleunigen, bank in der Linkskurve', pitchMax > 0.03 && pitchMax <= C.PITCH_MAX + 1e-9 && bankMax > 0.2 && bankMax <= C.BANK_MAX + 1e-9 && bankMin > -0.05 && Number.isFinite(p.turnRate) && Number.isFinite(p.slip), `pitch bis ${(pitchMax * 180 / Math.PI).toFixed(1)}°, bank bis ${(bankMax * 180 / Math.PI).toFixed(1)}°`);
  }
}

// ───────────── Schnellleiste: Extras, Minen, Raketen, Techs, Formation, Konfiguration ─────────────
{
  const { EXTRAS, MINES, TECHS, ROCKETS, STARTER_KIT } = await import('../core/data.js');
  const mk = (name, seed) => {
    const bus = makeBus(); const pr = newProfile(name, 'europa');
    const w = new World(pr, bus, { seed }); w.player.x = 0; w.player.z = 0; w.update(1 / 60);
    return { bus, pr, w, p: w.player };
  };
  const run = (w, s) => { for (let i = 0; i < Math.round(s * 60); i++) w.update(1 / 60); };
  const foe = (w, type, x, z, angry = true) => { const e = w.spawnTemp(type, x, z); if (angry) w.provoke(e); return e; };

  {
    const { pr, w } = mk('Kit', 3);
    check('Startprofil: Erprobungspaket (L3, SAL, Raketen, Extras, Minen, Techs)', pr.ammo.L3 === 500 && pr.ammo.SAL === 100 && pr.ammo.R2 === 10 && pr.ammo.R3 === 5 && pr.extras.EMP === 3 && pr.extras.SPM === 6 && pr.techs.ARC === 2 && w.abilities.EMP.count === 3 && pr.owned.formations.length === STARTER_KIT.formations.length,
      `L3 ${pr.ammo.L3}, SAL ${pr.ammo.SAL}, R2 ${pr.ammo.R2}, R3 ${pr.ammo.R3}, EMP ${pr.extras.EMP}, SPM ${pr.extras.SPM}, Techs je ${pr.techs.ARC}, ${pr.owned.formations.length} Formationen`);
    const old = newProfile('Alt', 'saturn');
    delete old.extras; delete old.techs; delete old.kit; delete old.configs; delete old.selectedRocket;
    old.owned.gens = []; old.owned.formations = undefined; old.ammo = { L1: 100, L3: 900 };
    new World(old, makeBus(), { seed: 4 });
    const first = old.extras.SOS;
    new World(old, makeBus(), { seed: 5 });
    check('Alter Spielstand: Paket genau einmal, nur auffüllen', first === 3 && old.extras.SOS === 3 && old.ammo.L3 === 900 && old.ammo.SAL === 100 && old.configs.sets.s1.length === 3 && old.owned.gens.length === 2 && old.kit === 1,
      `SOS ${old.extras.SOS}, L3 ${old.ammo.L3}, Lager-Generatoren ${old.owned.gens.length}`);
  }

  // EMP: Gegner verlieren die Erfassung, Abklingzeit, Ring für die Grafik
  {
    const { bus, pr, w } = mk('Emp', 11);
    const a = foe(w, 'raider', 300, 0), b = foe(w, 'raider', -250, 200);
    run(w, 0.6);
    const ok = w.useExtra('EMP');
    run(w, 0.5);
    const again = w.useExtra('EMP');
    const tele = bus.log.some(([t, x]) => t === 'telegraph' && x.kind === 'emp' && x.targetId !== 'player') && bus.log.some(([t, x]) => t === 'special' && x.kind === 'emp');
    check('EMP: Gegner verlieren dich, Abklingzeit, Vorrat −1', ok && !again && a.targetId !== 'player' && b.targetId !== 'player' && a.jamT > 0 && pr.extras.EMP === 2 && w.abilities.EMP.readyIn > EXTRAS.EMP.cooldown - 1 && tele,
      `Vorrat ${pr.extras.EMP}, Abklingzeit ${w.abilities.EMP.readyIn.toFixed(1)} s, gestört ${a.jamT.toFixed(1)} s`);
    run(w, EXTRAS.EMP.jam + 1);
    check('EMP: nach der Störung greifen sie wieder an', a.targetId === 'player' || b.targetId === 'player');
  }

  // SOS: 3 s unverwundbar
  {
    const { bus, pr, w, p } = mk('Sos', 12);
    for (let i = 0; i < 4; i++) foe(w, 'raider', 200 * Math.cos(i * 1.6), 200 * Math.sin(i * 1.6));
    run(w, 0.5);
    w.useExtra('SOS');
    const n0 = bus.log.length, hp0 = p.hp + p.shield;
    run(w, EXTRAS.SOS.duration - 0.1);
    const hurt = bus.log.slice(n0).filter(([t, d]) => t === 'damage' && d.id === 'player').length;
    const shots = bus.log.slice(n0).filter(([t, s]) => t === 'shot' && s.to === 'player' && s.hit).length;
    check('SOS: 3 s kein Schaden trotz Treffern, Schildblase', hurt === 0 && shots > 0 && p.hp + p.shield >= hp0 - 1 && bus.log.some(([t, x]) => t === 'special' && x.id === 'player' && x.kind === 'guard' && x.duration === EXTRAS.SOS.duration), `${shots} Treffer abgefangen`);
  }

  // Bombe: Schaden an allen Gegnern im Umkreis
  {
    const { bus, w } = mk('Bombe', 13);
    const es = [foe(w, 'raider', 200, 0, false), foe(w, 'larva', -150, 120, false), foe(w, 'jackal', 0, -300, false), foe(w, 'raider', 900, 0, false)];
    const n0 = bus.log.length;
    w.useExtra('BMB');
    run(w, 0.5);
    const hitIds = new Set(bus.log.slice(n0).filter(([t, d]) => t === 'damage' && d.from === 'player').map(([, d]) => d.id));
    check('BMB: alle drei im Umkreis getroffen, der ferne nicht, Explosion', hitIds.has(es[0].id) && hitIds.has(es[1].id) && hitIds.has(es[2].id) && !hitIds.has(es[3].id) && bus.log.some(([t, x]) => t === 'explode' && x.id === 'ab:BMB'), `${hitIds.size} getroffen, Larva ${es[1].alive ? 'lebt' : 'zerstört'}`);
  }

  // Minen: hinter dem Schiff, scharf nach 1 s, Wirkung je Sorte
  {
    const { bus, pr, w, p } = mk('Minen', 14);
    const res = {};
    for (const id of ['SPM', 'BRM', 'STM']) {
      w.layMine(id);
      const m = w.mines.find((o) => o.active && o.type === id);
      const behind = m && Math.hypot(m.x - p.x, m.z - p.z) > 40;
      run(w, MINES[id].arm + 0.1);
      const e = foe(w, id === 'SPM' ? 'raider' : 'jackal', m.x + 30, m.z, id !== 'SPM');
      const n0 = bus.log.length;
      run(w, 0.1);
      const log = bus.log.slice(n0);
      res[id] = { behind, gone: !m.active, dmg: log.some(([t, d]) => t === 'damage' && d.id === e.id), boom: log.some(([t, x]) => t === 'explode' && x.id === m.id), slow: e.slowT > 0, jam: e.jamT > 0 && e.targetId !== 'player' };
      run(w, MINES[id].arm + 1.2); // Abstand zwischen zwei Minen
    }
    check('SPM: zündet am Gegner, Schaden und Explosion', res.SPM.behind && res.SPM.gone && res.SPM.dmg && res.SPM.boom);
    check('BRM: bremst den Gegner', res.BRM.gone && res.BRM.slow);
    check('STM: stört die Zielerfassung', res.STM.gone && res.STM.jam);
    check('Minen: Vorrat verbraucht', pr.extras.SPM === 5 && pr.extras.BRM === 3 && pr.extras.STM === 3);
    w.player.x = -3800 + 50; w.player.z = -3800; w.update(1 / 60);
    check('Minen: nicht in der sicheren Zone', w.layMine('SPM') === false);
  }

  // Raketen R2/R3 und Tech LCK
  {
    const { bus, pr, w } = mk('Rakete', 15);
    const e = foe(w, 'spiker', 300, 0, false);
    w.setTarget(e.id);
    w.useTech('LCK');
    const hp0 = e.hp + e.shield;
    e.jinkT = 10;
    w.fireRocket('R3');
    run(w, 0.7);
    check('R3: 4.000 Schaden, LCK trifft trotz Ausweichen, Vorrat −1, Sorte gemerkt', hp0 - (e.hp + e.shield) >= ROCKETS.R3.damage * 0.99 && pr.ammo.R3 === 4 && pr.selectedRocket === 'R3' && bus.log.some(([t, r]) => t === 'rocket' && r.rocket === 'R3'), `${Math.round(hp0 - e.hp - e.shield)} Schaden`);
    run(w, ROCKETS.R3.cooldown);
    w.abilities.LCK.activeFor = 0;
    let miss = 0;
    for (let k = 0; k < 6; k++) {
      e.hp = e.hpMax; e.shield = e.shieldMax; e.jinkT = 10; e.x = 300; e.z = 0; w.player.x = 0; w.player.z = 0;
      const n0 = bus.log.length;
      w.fireRocket('R2');
      run(w, 0.7);
      if (bus.log.slice(n0).some(([t]) => t === 'rocketMiss')) miss++;
      run(w, ROCKETS.R2.cooldown);
    }
    check('Raketen verfehlen ausweichende Ziele ohne LCK', miss >= 1 && pr.ammo.R2 === 4, `${miss}/6 verfehlt, R2 noch ${pr.ammo.R2}`);
  }

  // Techs: ARC, VMP, FIX, RSV
  {
    const { bus, pr, w, p } = mk('Tech', 16);
    for (let i = 0; i < 6; i++) foe(w, 'raider', 250 + i * 60, (i % 2 ? 1 : -1) * 80, false);
    const n0 = bus.log.length;
    const ok = w.useTech('ARC');
    const arcs = bus.log.slice(n0).filter(([t, s]) => t === 'shot' && s.arc);
    check('ARC: Blitz springt auf 5 Gegner', ok && arcs.length === TECHS.ARC.targets && new Set(arcs.map(([, s]) => s.to)).size === 5 && pr.techs.ARC === 1);
    w.useTech('VMP');
    p.hp = 3000;
    const t = w.enemies.find((e) => e.alive);
    w._hitEnemy(t, 400, false, false);
    check('VMP: Laserschaden heilt die Hülle (15 %)', Math.abs(p.hp - (3000 + 400 * TECHS.VMP.leech)) < 1, `Hülle ${p.hp.toFixed(0)}`);
  }
  {
    const { bus, w, p } = mk('Fix', 17);
    p.hp = 3000; p.shield = 0;
    w.useTech('FIX');
    run(w, 2);
    const fixHp = p.hp;
    const rsv = w.useTech('RSV');
    check('FIX: Kampfreparatur 5 % je Sekunde, Heilzahlen', fixHp > 3000 + p.hpMax * 0.05 * 1.8 && bus.log.some(([t, h]) => t === 'heal' && h.source === 'FIX' && h.hull > 0), `Hülle ${Math.round(fixHp)}`);
    check('RSV: Schild sofort voll', rsv && p.shield === p.shieldMax);
  }

  // Tarnung und Sprung-Extra
  {
    const { w } = mk('Tarn', 18);
    run(w, 0.2);
    const ok = w.useExtra('TRN');
    const e = foe(w, 'raider', 350, 0, false);
    run(w, 2);
    const ignored = e.targetId !== 'player';
    w.setTarget(e.id); w.toggleAttack();
    run(w, 1.5);
    check('TRN: Gegner sehen dich nicht, Angriff hebt Tarnung auf', ok && ignored && !w.cloaked && e.targetId === 'player');
    const t0 = w.useExtra('TRN');
    check('TRN: im Kampf nicht möglich', t0 === false);
  }
  {
    const { bus, pr, w } = mk('Springer2', 19);
    const ok = w.useExtra('JMP');
    run(w, EXTRAS.JMP.charge + 0.2);
    check('JMP: lädt 8 s, dann im nächsten Heimatsektor', ok && w.sector.id === 'EU-2' && pr.extras.JMP === 1 && bus.log.some(([t, j]) => t === 'jumpStart' && j.seconds === EXTRAS.JMP.charge), w.sector.id);
  }

  // Formation und Konfiguration
  {
    const { bus, pr, w, p } = mk('Konfig', 20);
    const f1 = w.setFormation('ring'), f2 = w.setFormation('wall'), f3 = w.setFormation('gyro');
    check('Formation: Wechsel, Abklingzeit, nur im Besitz', f1 && !f2 && !f3 && w.formation === 'ring' && pr.formation === 'ring' && bus.log.some(([t, x]) => t === 'formation' && x.id === 'ring'));
    const sh0 = p.shieldMax, sp0 = w.playerSpeed;
    const c2 = w.setConfig(2);
    const sh2 = p.shieldMax;
    const cNo = w.setConfig(3);
    run(w, 5.1);
    const c3 = w.setConfig(3);
    const gens = pr.loadout.gens.length + pr.owned.gens.length;
    check('Konfiguration 2 (Schild) und 3 (Tempo), Abklingzeit, keine Teile verloren', c2 && !cNo && c3 && sh2 - sh0 === 2000 && w.playerSpeed > sp0 && w.config === 3 && gens === 4 && pr.loadout.gens.join() === 'dr1,dr1',
      `Schild ${sh0} → ${sh2}, Tempo ${sp0} → ${w.playerSpeed}`);
    pr.tritium = 100;
    const b = w.buy('extra', 'EMP', 2);
    check('Shop: Extras kaufen (2 EMP für 40 Tritium)', b.ok && pr.extras.EMP === 5 && pr.tritium === 60 && w.abilities.EMP.count === 5);
  }
}

// ───────────── Drohnen ─────────────
{
  const { DRONES, DRONE_RULES } = await import('../core/data.js');
  const mk = (name, seed) => {
    const bus = makeBus(); const pr = newProfile(name, 'europa');
    const w = new World(pr, bus, { seed }); w.player.x = 0; w.player.z = 0; w.update(1 / 60);
    return { bus, pr, w, p: w.player };
  };
  const run = (w, s) => { for (let i = 0; i < Math.round(s * 60); i++) w.update(1 / 60); };
  {
    const { pr, w, p } = mk('Drohnen', 41);
    const sh = DRONES.pioneer.shield[0];
    check('Drohnen: Startprofil 2 Pioneer (Laser + Schild), Schild-Drohne erhöht den Schild', pr.drones.length === 2 && pr.drones[0].module === 'laser' && pr.drones[1].module === 'shield' && p.shieldMax === 2000 + sh,
      `${pr.drones.length} Drohnen, Schild ${p.shieldMax}`);
    const old = newProfile('AltDrohne', 'eris'); delete old.drones; delete old.droneKit; delete old.droneSeq;
    new World(old, makeBus(), { seed: 2 }); const n1 = old.drones.length;
    old.drones.pop(); new World(old, makeBus(), { seed: 3 });
    check('Drohnen: alter Spielstand bekommt die Startdrohnen genau einmal', n1 === 2 && old.drones.length === 1 && old.droneKit === 1);
  }
  {
    const { bus, pr, w, p } = mk('DrohnenFeuer', 42);
    const e = w.spawnTemp('raider', 0, -300); e.hp = e.hpMax = 1e6; e.shield = e.shieldMax = 0;
    e.vx = e.vz = 0; e.def = { ...e.def, speed: 0, damage: 0 };
    p.rot = 0; w.setTarget(e.id); w.toggleAttack();
    const ammo0 = pr.ammo.L1;
    run(w, 6);
    const shots = bus.log.filter(([t, s]) => t === 'shot' && s.drone);
    const dmg = bus.log.filter(([t, d]) => t === 'damage' && d.from === 'dr:' + pr.drones[0].id);
    const ship = bus.log.filter(([t, s]) => t === 'shot' && s.from === 'player').length;
    check('Drohnen: Laser-Drohne feuert mit (1 Schuss/s, eigene Quelle, verbraucht Munition), Schild-Drohne nicht',
      shots.length >= 4 && shots.length <= 7 && shots.every(([, s]) => s.from === 'dr:' + pr.drones[0].id) && dmg.length >= 2 && ammo0 - pr.ammo.L1 === ship + shots.length,
      `${shots.length} Drohnenschüsse, ${dmg.length} Treffer, ${ship} Schiffsschüsse, Munition −${ammo0 - pr.ammo.L1}`);
  }
  {
    const { pr, w, p } = mk('DrohnenStufe', 43);
    const d = pr.drones[0];
    const xp = Math.ceil(DRONE_RULES.xp[1] / DRONE_RULES.xpShare);
    w._addXp(0); // nichts
    const { dronesOnKill } = await import('./drones.js');
    dronesOnKill(w, xp);
    const sell2 = w.droneInfo(d).sell;
    check('Drohnen: Stufe durch Abschüsse, Verkaufswert steigt (ab Stufe 4 Gewinn)', d.level === 2 && pr.drones[1].level === 2 && sell2 === Math.round(DRONES.pioneer.price * DRONE_RULES.sell[1]) && DRONE_RULES.sell[3] > 1,
      `Stufe ${d.level}, Verkauf ${sell2}`);
    // Verschleiß bis kaputt: Stufe −1, Schild weg, Reparatur bringt sie zurück
    const shield0 = p.shieldMax;
    p.hp -= p.hpMax * 0.5; run(w, 1 / 60);
    const hpAfter = pr.drones[1].hp;
    for (let i = 0; i < 4 && !pr.drones[1].broken; i++) { p.hp = p.hpMax; w._droneHp = p.hpMax; p.hp -= p.hpMax * 0.9; run(w, 1 / 60); }
    const broke = pr.drones[1].broken && pr.drones[1].level === 1 && p.shieldMax === shield0 - DRONES.pioneer.shield[1];
    check('Drohnen: Treffer am Schiff verschleißen sie, kaputt = Stufe −1 und kein Schild', Math.abs(hpAfter - 80) < 0.5 && broke, `Zustand nach 50 % Hülle ${hpAfter.toFixed(1)} %, Schild ${shield0} → ${p.shieldMax}`);
    const cost = w.droneInfo(pr.drones[1]).repair;
    const r0 = w.repairDrone(1);
    w.docked = true; pr.credits = 50000;
    const r1 = w.repairDrone('all');
    check('Drohnen: Reparatur nur in der Station, kostet Credits, wieder einsatzbereit', !r0.ok && r1.ok && !pr.drones[1].broken && pr.drones[1].hp === 100 && pr.credits < 50000 && cost === 4800,
      `Kosten ${r1.credits} Credits (kaputte Stufe-1-Drohne ${cost})`);
  }
  {
    const { pr, w } = mk('DrohnenShop', 44);
    pr.credits = 200000;
    const b = w.buy('drone', 'pioneer-laser', 6);
    const full = w.buy('drone', 'pioneer-shield', 1);
    w.docked = true;
    const c0 = pr.credits;
    const s = w.sellDrone(7);
    const m = w.setDroneModule(0, 'shield');
    check('Drohnen: Pioneer für Credits kaufen (höchstens 8), verkaufen, Modul tauschen', b.ok && !full.ok && pr.drones.length === 7 && s.ok && pr.credits === c0 + Math.round(DRONES.pioneer.price * DRONE_RULES.sell[0]) && m.ok && pr.drones[0].module === 'shield' && pr.credits === c0 + s.credits,
      `${pr.drones.length} Drohnen, Verkauf +${s.credits}`);
  }
}

console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(failed ? 1 : 0);
