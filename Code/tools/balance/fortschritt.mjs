#!/usr/bin/env node
// Fortschritts-Bot: spielt die Simulation ohne Grafik wie ein zielstrebiger, vernünftiger Spieler und misst, nach wie
// viel SPIELZEIT welche Stufe, wie viele Drohnen und welches Schiff erreicht sind. Grundlage für die Wirtschafts-Balance
// (Ziel Toni 31.10.2026: Stufe 10 nach 10–12 h mit 8 Pioneer und Schiff 2, nicht alles auf einmal).
//   node tools/balance/fortschritt.mjs [--stunden 12] [--seed 1] [--fraktion saturn]
//
// Was der Bot tut (wie ein Mensch, nur ohne Zögern):
//  - folgt der Auftragskette (Ziele jagen, Kisten/Erz sammeln, Ereignisse mitnehmen, EMP einsetzen …)
//  - wählt den Sektor nach Auftrag und Stufe (S2 ab Stufe 3, S3 ab Stufe 6 bzw. mit Schiff 2), fliegt über die Tore
//  - kehrt zum Einkaufen in die Station zurück, wenn er sich etwas Sinnvolles leisten kann (Auftragsziel, REP, Schiff 2,
//    Drohnen, Ion-Laser, Plasma), repariert Drohnen, kauft Munition; wird er reich, schießt er L2
//  - heilt unter 35 % Hülle: Station (S1), sonst Reparaturroboter (Rückzug aus dem Kampf) oder Heimflug
//  - meidet Alpha-Gegner (außer der Auftrag verlangt einen und er ist stark genug) und Kämpfe, die er verloren hat
// Hinweis: Der Bot spielt effizienter als ein Mensch (keine Menüs, keine Pausen). Faustregel: Mensch ≈ 1,4–1,6 × Bot-Zeit.
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const HOURS = Number(opt('stunden', '12')), SEED = Number(opt('seed', '1')), FAC = opt('fraktion', 'saturn');
const STOP_LEVEL = Number(opt('bisStufe', '12'));

globalThis.localStorage = { _m: {}, getItem(k) { return k in this._m ? this._m[k] : null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
const { World } = await import('../../src/sim/world.js');
const D = await import('../../src/core/data.js');
const { newProfile, SHIPS, LASERS, QUESTS, REPAIR_BOTS, DRONE_RULES, dronePrice } = D;
const C = await import('../../src/sim/config.js');

const bus = { on() { return () => {}; }, emit() {} };
const pr = newProfile('Bot' + SEED, FAC);
const w = new World(pr, bus, { seed: SEED });
const p = w.player;
const STEP = 1 / 60, CHUNK = 8; // 8 Sim-Schritte je Bot-Entscheidung (≈ 0,13 s)
const log = [], buys = [], quests = [];
const modeTime = {};
let lastLevel = pr.level, mode = 'fight', deaths = 0, lastQuest = pr.quest.index;
const avoid = new Set(); // Gegner, gegen die der Bot verloren hat (meiden, bis sie neu erscheinen)
let avoidClear = 0;
const t0 = Date.now();
let spentAmmo = 0, spentRepair = 0;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function nearest(list, ok) { let best = null, bd = Infinity; for (const o of list) { if (!o || o.alive === false || (ok && !ok(o))) continue; const d = dist(o, p); if (d < bd) { bd = d; best = o; } } return best; }
const killsTotal = () => Object.values(pr.stats.kills || {}).reduce((a, b) => a + b, 0);
const curIdx = () => w.sector.index || 1;
const hours = () => +(w.time / 3600).toFixed(2);
const buyableN = () => pr.drones.filter((d) => !D.DRONES[d.type].earned).length;
const sectorsByIdx = {};
for (const id in w.sectors) sectorsByIdx[w.sectors[id].index] = w.sectors[id];
function typeSectors(type) { const out = []; for (const i in sectorsByIdx) if (sectorsByIdx[i].spawns.some((s) => s.type === type)) out.push(+i); return out; }
const laserCount = (id) => pr.loadout.lasers.filter((x) => x === id).length + pr.owned.lasers.filter((x) => x === id).length;

// Stärkster sinnvoller Farm-Sektor für Stufe und Ausrüstung
function farmSector() {
  let best = 1;
  for (const i in sectorsByIdx) if (sectorsByIdx[i].levelMin <= pr.level) best = Math.max(best, +i);
  if (best >= 3 && pr.ship === 's1' && pr.level < 8) best = 2;
  if (best >= 2 && pr.level < 3) best = 1;
  return best;
}

// Was ein vernünftiger Spieler als Nächstes kaufen will → { kind, id, cost, cur } oder null
function wishes() {
  const L = [];
  const q = QUESTS[pr.quest.index], g = q && q.goal;
  const ship = SHIPS[pr.ship];
  if (g && g.type === 'buy' && LASERS[g.target]) L.push(['laser', g.target]);
  if (g && g.type === 'own') {
    if (REPAIR_BOTS[g.target]) L.push(['rep', g.target]);
    else if (SHIPS[g.target] && pr.level >= SHIPS[g.target].level) L.push(['ship', g.target]);
    else if (LASERS[g.target] && laserCount(g.target) < g.count) L.push(['laser', g.target]);
  }
  if (g && g.type === 'drones' && pr.drones.length < g.count) L.push(['drone', 'pioneer-laser']);
  if (!pr.repBot && pr.level >= REPAIR_BOTS.rep1.level) L.push(['rep', 'rep1']);
  if (pr.ship === 's1' && pr.level >= SHIPS.s2.level) L.push(['ship', 's2']);
  // vor Schiff 2 nur so viele Drohnen, dass das Schiff nicht ewig wartet
  const saving = pr.ship === 's1' && pr.level >= 4;
  if (buyableN() < DRONE_RULES.max && !saving) L.push(['drone', 'pioneer-laser']);
  if (pr.repBot === 'rep1' && pr.level >= REPAIR_BOTS.rep2.level) L.push(['rep', 'rep2']);
  if (pr.loadout.lasers.length < ship.laserSlots || pr.loadout.lasers.some((x) => LASERS[x].damage < LASERS.ion.damage)) L.push(['laser', 'ion']);
  if (pr.loadout.lasers.some((x) => LASERS[x].damage < LASERS.plasma.damage)) L.push(['laser', 'plasma']);
  if (pr.level >= 10 && pr.repBot !== 'rep3') L.push(['rep', 'rep3']);
  for (const [kind, id] of L) {
    const info = w.shopInfo(kind, id, 1);
    if (info.level > pr.level) continue;
    if (/Schon|hast schon|Höchstens|fliegst/.test(info.reason)) continue;
    const reserve = info.currency === 'credits' ? 4000 : 0;
    return { kind, id, cost: info.cost, cur: info.currency, affordable: (pr[info.currency] || 0) >= info.cost + reserve };
  }
  return null;
}

function shop() {
  // angedockt einkaufen wie ein Spieler: Wünsche der Reihe nach, Munition, Drohnen reparieren
  const was = w.docked; w.docked = true;
  const c0 = pr.credits;
  // Drohnen erst reparieren, wenn eine schwach oder kaputt ist (wie ein Spieler auf die Warnung reagiert)
  if (pr.drones.some((d) => d.broken || d.hp < 40)) { const r = w.repairDrone('all'); if (r && r.ok) spentRepair += r.credits; }
  for (let guard = 0; guard < 20; guard++) {
    const x = wishes();
    if (!x || !x.affordable) break;
    const r = w.buy(x.kind, x.id, 1);
    if (!r || !r.ok) break;
    buys.push({ t: hours(), stufe: pr.level, was: `${x.kind}:${x.id}`, kosten: x.cost, waehrung: x.cur });
  }
  const rich = pr.credits > 80000 && pr.ship !== 's1' && buyableN() >= DRONE_RULES.max;
  const l1 = w.shopInfo('ammo', 'L1', 1).cost;
  for (let k = 0; k < 20 && (pr.ammo.L1 || 0) < 6000 && pr.credits > l1 * 2; k++) { const a = pr.credits; if (!w.buy('ammo', 'L1', 4).ok) break; spentAmmo += a - pr.credits; }
  if (rich) for (let k = 0; k < 20 && (pr.ammo.L2 || 0) < 15000 && pr.credits > 60000; k++) { const a = pr.credits; if (!w.buy('ammo', 'L2', 5).ok) break; spentAmmo += a - pr.credits; }
  pr.selectedAmmo = rich && pr.ammo.L2 > 0 ? 'L2' : 'L1';
  w.docked = was;
  return c0 - pr.credits;
}

function needShopping() {
  if ((pr.ammo.L1 || 0) < 800 && pr.credits >= 2000) return true;
  const x = wishes();
  return !!(x && x.affordable);
}

function wantSector() {
  if (mode === 'shop' || mode === 'home') return 1;
  const q = w.quest, g = q && q.def.goal;
  const farm = farmSector();
  if (g) {
    if (g.type === 'jump') return Math.max(g.target, Math.min(farm, 3));
    if (g.type === 'kill' && g.target) {
      const ss = typeSectors(g.target);
      if (ss.includes(farm)) return farm;
      const ok = ss.filter((i) => sectorsByIdx[i].levelMin <= pr.level + 1);
      return ok.length ? Math.max(...ok) : Math.min(...ss);
    }
    if (g.type === 'kill' && g.sectorMin) return Math.max(g.sectorMin, farm);
  }
  return farm;
}

// zum Tor Richtung Zielsektor fliegen und springen → true, wenn unterwegs
function travel(want) {
  const cur = curIdx();
  if (cur === want) return false;
  const up = want > cur;
  const pt = nearest(w.portals, (o) => { const s = w.sectors[o.type]; return s && (up ? s.index > cur : s.index < cur); });
  if (!pt) return false;
  // unterwegs angegriffen und angeschlagen: erst wehren
  const att = nearest(w.enemies, (e) => e.targetId === 'player' && e.attacking && dist(e, p) < C.PLAYER_RANGE);
  if (att && p.hp > p.hpMax * 0.35 && dist(pt, p) > 600) { fightTarget(att); return true; }
  p.attacking = false;
  if (dist(pt, p) > 100) w.moveTo(pt.x, pt.z);
  else { w.stopMove(); if (!w.jump) w.tryJump(); }
  return true;
}

const CIRCLE = opt('kreisen', '1') !== '0';
let circleDir = SEED % 2 ? 1 : -1;
function fightTarget(tgt) {
  if (p.targetId !== tgt.id) w.setTarget(tgt.id);
  const d = dist(tgt, p);
  if (d > C.PLAYER_RANGE * 0.7) w.moveTo(tgt.x, tgt.z);
  else if (CIRCLE) {
    // Kreisen wie DarkOrbit-Spieler: in ~60 % Reichweite um das Ziel fliegen (Querbewegung = weniger Treffer)
    const a = Math.atan2(p.z - tgt.z, p.x - tgt.x) + 0.55 * circleDir, R = C.PLAYER_RANGE * 0.6;
    const lim = w.sector.size - 500;
    const tx = tgt.x + Math.cos(a) * R, tz = tgt.z + Math.sin(a) * R;
    if (Math.abs(tx) > lim || Math.abs(tz) > lim) circleDir = -circleDir; // am Kartenrand die Richtung wechseln
    w.moveTo(Math.max(-lim, Math.min(lim, tx)), Math.max(-lim, Math.min(lim, tz)));
  } else w.stopMove();
  if (!p.attacking && !w.inSafeZone && d < C.PLAYER_RANGE) w.toggleAttack();
  // Auftrag „EMP einsetzen“
  const g = w.quest && w.quest.def.goal;
  if (g && g.type === 'use' && d < 500) { if (g.target === 'EMP' || g.target === 'SOS' || g.target === 'BMB') w.useExtra(g.target); else w.useTech(g.target); }
}

// Angekündigte Spezialangriffe lesen und ausweichen (die Warnmarker zeigt das Spiel jedem Spieler) → true = weicht aus
let dodgeUntil = 0;
function dodge() {
  if (w.time < dodgeUntil) return true;
  for (const e of w.enemies) {
    if (!e.alive || e.spPhase !== 1 || !e.spK || e.spK === 'guard') continue;
    let inside = false, ox = 0, oz = 0;
    if (e.spK === 'acid') {
      const dx = p.x - e.spX, dz = p.z - e.spZ, d = Math.hypot(dx, dz) || 1;
      inside = d < e.spR + 60; ox = dx / d; oz = dz / d;
    } else {
      const rx = p.x - e.spX, rz = p.z - e.spZ;
      const along = rx * e.spDx + rz * e.spDz, side = -rx * e.spDz + rz * e.spDx;
      inside = along > -40 && along < e.spLen + 60 && Math.abs(side) < e.spR + p.radius + 40;
      const sg = side >= 0 ? 1 : -1; ox = -e.spDz * sg; oz = e.spDx * sg;
    }
    if (!inside) continue;
    w.moveTo(p.x + ox * 320, p.z + oz * 320);
    dodgeUntil = w.time + 0.9;
    return true;
  }
  return false;
}

function decide() {
  if (w.time > avoidClear) { avoid.clear(); avoidClear = w.time + 900; }
  if (w.playerDead) { deaths++; const c = pr.credits; w.repair('station'); spentRepair += c - pr.credits; mode = 'fight'; return; }
  const hpK = p.hp / p.hpMax;
  // ── Heilen ──
  if (mode === 'heal') {
    if (hpK >= 0.95) { mode = 'fight'; if (w.station && w.inSafeZone && needShopping()) { shop(); } return; }
    if (w.station) { if (!w.inSafeZone) w.autoHome(); return; }
    if (pr.repBot) { // Rückzug: weg von Gegnern, nicht schießen, Roboter arbeiten lassen
      p.attacking = false;
      const e = nearest(w.enemies, (o) => o.targetId === 'player' || dist(o, p) < 900);
      // weg vom Gegner, aber nie über den Kartenrand (dort kostet es Hülle) – am Rand seitlich ausweichen
      const lim = w.sector.size - 600;
      const clampv = (v) => Math.max(-lim, Math.min(lim, v));
      if (e && dist(e, p) < 1400) {
        let tx = clampv(p.x + (p.x - e.x) * 2), tz = clampv(p.z + (p.z - e.z) * 2);
        if (Math.hypot(tx - p.x, tz - p.z) < 300) { tx = clampv(p.x - (p.z - e.z) * 2); tz = clampv(p.z + (p.x - e.x) * 2); }
        w.moveTo(tx, tz);
      } else w.stopMove();
      if (w.time - (w._healT || 0) > 120) mode = 'home'; // Roboter kommt nicht dazu: heim
      return;
    }
    mode = 'home';
  }
  if (mode === 'home') {
    if (curIdx() !== 1) { travel(1); return; }
    if (!w.inSafeZone) { w.autoHome(); return; }
    if (hpK < 0.95) return;
    shop(); mode = 'fight'; return;
  }
  if (hpK < 0.35) { mode = 'heal'; w._healT = w.time; p.attacking = false; if (p.targetId) avoid.add(p.targetId); w.setTarget(null); if (w.station) w.autoHome(); return; }
  // ── Einkaufen ──
  if (mode === 'fight' && needShopping() && !(p.attacking && p.targetId)) mode = 'shop';
  if (mode === 'shop') {
    if (curIdx() !== 1) { travel(1); return; }
    if (!w.inSafeZone) { w.autoHome(); return; }
    shop(); mode = 'fight'; return;
  }
  // ── Sektor wählen ──
  if (!(p.attacking && p.targetId) && travel(wantSector())) return;
  // ── Wrack einsammeln ──
  const wr = nearest(w.wrecks, (o) => o.alive !== false && dist(o, p) < 900);
  if (wr && !p.attacking) { w.moveTo(wr.x, wr.z); return; }
  const q = w.quest, g = q && q.def.goal;
  // ── Ereignisse mitnehmen (wie Spieler: Bonus) ──
  const ev = w._ev;
  if (ev && !w.inSafeZone) {
    if (ev.type === 'drift') { const c = nearest(ev.list, (o) => w.crates.includes(o)); if (c && dist(c, p) < 4000) { w.moveTo(c.x, c.z); return; } }
    if (ev.type === 'convoy') { const e = nearest(w.enemies, (o) => o.evTag === ev && o.alive); if (e && dist(e, p) < 5000) { fightTarget(e); return; } }
    if (ev.type === 'nest' && ev.nest && ev.nest.alive && dist(ev.nest, p) < 5000 && pr.level >= 3) {
      const lar = nearest(w.enemies, (o) => o.evTag === ev && o !== ev.nest && o.targetId === 'player');
      fightTarget(lar && dist(lar, p) < 500 ? lar : ev.nest); return;
    }
  }
  if (g && g.type === 'crate') { const c = nearest(w.crates); if (c) { w.moveTo(c.x, c.z); return; } }
  if (g && g.type === 'ore') { const o = nearest(w.ores, (x) => x.alive !== false); if (o && pr.cargo && w.cargoUsed < w.cargoMax) { w.moveTo(o.x, o.z); return; } }
  // ── Kampf: Auftragsziel bevorzugt, sonst passender Gegner ──
  let tgt = p.targetId ? w.entities.get(p.targetId) : null;
  if (!tgt || !tgt.alive) {
    const strong = pr.ship !== 's1' && buyableN() >= 6;
    const fair = (e) => !avoid.has(e.id) && (e.rank !== 'alpha' || (g && g.rank === 'alpha' && strong)) && (e.rank !== 'elite' || pr.level >= (e.def.level || 1) + 3) && e.state !== 'nest';
    // Combo-Auftrag: schnelle Ziele (wenig Leben) bevorzugen, wie ein Spieler, der einen Larva-Schwarm sucht
    const weak = g && g.type === 'combo' ? nearest(w.enemies, (e) => e.def.hp + e.def.shield <= 1000 && e.rank === 'normal' && fair(e)) : null;
    tgt = weak || (g && g.type === 'kill' && nearest(w.enemies, (e) => (g.target == null || e.type === g.target) && (!g.rank || e.rank === g.rank) && fair(e))) ||
          nearest(w.enemies, (e) => (e.def.level || 1) <= pr.level + 2 && fair(e));
    if (tgt) w.setTarget(tgt.id);
  }
  if (!tgt) { w.moveTo(p.x + 300, p.z); return; }
  if (p.attacking && dodge()) return;
  fightTarget(tgt);
}


// Einnahmequellen messen (Credits): Aufträge und Stufenbelohnungen aus den Daten, Ereignisse und Erz über Hüllen
const src = { event: 0, ore: 0 };
for (const [name, key] of [['grantReward', 'event'], ['sellOre', 'ore']]) {
  const f = w[name].bind(w);
  w[name] = (...a) => { const c = pr.credits; const r = f(...a); src[key] += Math.max(0, pr.credits - c); return r; };
}
const questCredits = () => { let c = 0; for (let i = 0; i < pr.quest.index; i++) c += QUESTS[i].reward.credits || 0; return c; };
const levelCredits = () => { let c = 0; for (let l = 2; l <= pr.level; l++) c += D.levelReward(l).credits; return c; };

w.update(STEP);
shop();
const maxT = HOURS * 3600;
let nextReport = 0;
while (w.time < maxT) {
  decide();
  w.update(STEP * CHUNK);
  modeTime[mode] = (modeTime[mode] || 0) + STEP * CHUNK;
  if (w.inSafeZone && w.station && typeof w.sellOre === 'function' && w.cargoUsed > 0) { const was = w.docked; w.docked = true; try { w.sellOre(); } catch { /* egal */ } w.docked = was; }
  if (pr.quest.index !== lastQuest) { quests.push({ t: hours(), nr: pr.quest.index, id: QUESTS[pr.quest.index - 1]?.id, stufe: pr.level }); lastQuest = pr.quest.index; }
  if (pr.level !== lastLevel) {
    lastLevel = pr.level;
    const spent = buys.filter((b) => b.waehrung === 'credits').reduce((a, b) => a + b.kosten, 0) + spentAmmo + spentRepair;
    const earned = pr.credits + spent - 20000, qc = questCredits(), lc = levelCredits();
    log.push({ stufe: pr.level, stunden: hours(), kills: killsTotal(), credits: pr.credits, verdient: earned, quellen: { auftraege: qc, stufen: lc, ereignisse: src.event, rohstoffe: src.ore, kampfUndKisten: earned - qc - lc - src.event - src.ore }, tritium: pr.tritium, drohnen: pr.drones.length, schiff: pr.ship, rep: pr.repBot, auftrag: pr.quest.index, sektor: curIdx(), tode: deaths });
  }
  if (process.env.DBG && Math.floor(w.time) % 300 === 0 && Math.floor(w.time) !== globalThis._dbgT) { globalThis._dbgT = Math.floor(w.time); process.stderr.write(`t=${Math.floor(w.time)} S${curIdx()} mode=${mode} hp=${Math.round(p.hp / p.hpMax * 100)}% q=${pr.quest.index}:${QUESTS[pr.quest.index]?.id} lvl=${pr.level} cr=${pr.credits} dr=${pr.drones.length} ship=${pr.ship} rep=${pr.repBot} tgt=${(w.entities.get(p.targetId) || {}).type}\n`); }
  if (w.time >= nextReport) { nextReport += 3600; if (w.time > 1) process.stderr.write(`  ${(w.time / 3600).toFixed(0)} h: Stufe ${pr.level}, ${fmt(pr.credits)} CR, ${fmt(pr.tritium)} T, ${pr.drones.length} Drohnen, ${pr.ship}, ${pr.repBot || '-'}, Auftrag ${pr.quest.index}/${QUESTS.length}, S${curIdx()}, Kills ${killsTotal()}\n`); }
  if (pr.level >= STOP_LEVEL) break;
}
function fmt(n) { return Math.round(n).toLocaleString('de-DE'); }
const mt = {}; for (const k in modeTime) mt[k] = +(modeTime[k] / 3600).toFixed(2);
console.log(JSON.stringify({ seed: SEED, fraktion: FAC, endeStunden: hours(), stufe: pr.level, credits: pr.credits, tritium: pr.tritium, drohnen: pr.drones.length, schiff: pr.ship, rep: pr.repBot, laser: pr.loadout.lasers.join(','), kills: killsTotal(), tode: deaths, auftraege: pr.quest.index, ausgabenMunition: spentAmmo, ausgabenReparatur: spentRepair, modusStunden: mt, echtzeitSek: Math.round((Date.now() - t0) / 1000), verlauf: log, kaeufe: buys, auftragsZeiten: quests }, null, 1));
