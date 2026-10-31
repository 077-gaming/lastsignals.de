// Drohnen (Vault Nr. 17–19): bis zu 8 Pioneer, jede mit Laser (feuert mit, mehr Schaden) oder Schildgenerator
// (mehr Schild), eigene Stufe 1–10 durch Kämpfen, Verschleiß durch Treffer am Schiff, Reparatur in der Station,
// kaputt = eine Stufe weniger. Werte: data.js (DRONES, DRONE_RULES). Reine Logik ohne Grafik, keine Speicher-Neuanlage
// pro Schritt (feste Felder, Zähler); nur seltene Ereignisse (Stufe, kaputt, Kauf) legen kleine Nutzlasten an.
//
// Spielstand: profile.drones = [{ id, type, module: 'laser'|'shield', level, xp, hp (Zustand 0–100), broken }].
// Anzeige/Grafik: world.drones (= profile.drones), world.droneVer (steigt bei jeder sichtbaren Änderung),
// world.droneFiring (Laser-Drohnen feuern gerade), Schüsse als 'shot' mit from = 'dr:<id>', drone: true, idx = Platz.
import { DRONES, DRONE_RULES, STARTER_DRONES, DRONE_KIT_VERSION, AMMO } from '../core/data.js';
import { fmt } from './combat.js';

const R = DRONE_RULES;
const MODULES = { laser: 'Laser', shield: 'Schild' };
const SRC = { id: '', damage: 0 };   // wiederverwendete Schussquelle für world._fireLaser

// ───────────────────────── Spielstand ─────────────────────────

function makeDrone(pr, type, module) {
  pr.droneSeq = (pr.droneSeq || 0) + 1;
  return { id: 'd' + pr.droneSeq, type, module, level: 1, xp: 0, hp: 100, broken: false };
}

/** Fehlende oder kaputte Felder ergänzen; Startdrohnen einmal für alte Spielstände ohne Drohnen. → true = neu gegeben */
export function normalizeDrones(pr) {
  if (!Array.isArray(pr.drones)) pr.drones = [];
  pr.droneSeq = pr.droneSeq || 0;
  const seen = new Set();
  pr.drones = pr.drones.filter((d) => d && DRONES[d.type] && MODULES[d.module]).slice(0, R.max);
  for (const d of pr.drones) {
    const n = /^d(\d+)$/.exec(d.id || '');
    if (!n || seen.has(d.id)) { pr.droneSeq++; d.id = 'd' + pr.droneSeq; } else pr.droneSeq = Math.max(pr.droneSeq, +n[1]);
    seen.add(d.id);
    d.level = Math.max(1, Math.min(R.maxLevel, Math.floor(d.level) || 1));
    d.xp = Math.max(R.xp[d.level - 1], +d.xp || 0);
    d.hp = Math.max(0, Math.min(100, typeof d.hp === 'number' ? d.hp : 100));
    d.broken = !!d.broken || d.hp <= 0;
  }
  if ((pr.droneKit || 0) < DRONE_KIT_VERSION) {
    pr.droneKit = DRONE_KIT_VERSION;
    if (!pr.drones.length) {
      for (const s of STARTER_DRONES) pr.drones.push(makeDrone(pr, s.type, s.module));
      return true;
    }
  }
  return false;
}

export function initDrones(w) {
  w._droneCd = new Float64Array(R.max);
  w._droneWasFiring = false;
  w._droneHp = w.player.hp;       // Hülle im letzten Schritt (Verschleiß)
  w.droneFiring = false;
  w.droneVer = 1;
  w._droneMsgAt = w.profile.droneKitShown === DRONE_KIT_VERSION ? 0 : 4.5; // Funkspruch zu den Startdrohnen
}

/** Schild aller einsatzbereiten Schild-Drohnen (für _refreshStats). */
export function droneShield(pr) {
  let s = 0;
  const D = pr.drones;
  if (D) for (let i = 0; i < D.length; i++) {
    const d = D[i];
    if (!d.broken && d.module === 'shield') s += DRONES[d.type].shield[d.level - 1];
  }
  return s;
}

export function droneDamage(d) { return DRONES[d.type].laser[d.level - 1]; }

// ───────────────────────── Kampf ─────────────────────────

/**
 * Jeder Schritt (nach den Schiffslasern): Laser-Drohnen feuern mit, solange das Schiff feuert (gleiches Ziel, gleiche
 * Munition, je Drohne ein Schuss pro Sekunde), Verschleiß aus verlorener Hülle.
 */
export function updateDrones(w, dt, tgt, firing) {
  const p = w.player, D = w.profile.drones, cd = w._droneCd;
  if (w._droneMsgAt > 0 && w.time >= w._droneMsgAt) {
    w._droneMsgAt = 0;
    w.profile.droneKitShown = DRONE_KIT_VERSION;
    if (D.length) {
      const L = D.filter((d) => d.module === 'laser').length, S = D.length - L;
      w._msg(`${D.length} Pioneer-Drohnen fliegen mit: ${L} mit Laser (je ${fmt(DRONES.pioneer.laser[0])} Schaden je Schuss), ${S} mit Schild (je +${fmt(DRONES.pioneer.shield[0])}). Stufe 1–10 durch Kämpfen, Formation über die Schnellleiste, neue Pioneer für ${fmt(DRONES.pioneer.price)} Credits in der Station.`, 'info');
    }
  }
  // Verschleiß: Hülle, die seit dem letzten Schritt verloren ging (alle Quellen: Laser, Spezialangriffe, Säure, Karte)
  const lost = w._droneHp - p.hp;
  w._droneHp = p.hp;
  if (lost > 0 && p.hpMax > 0) wearAll(w, lost / p.hpMax * R.wear);

  w.droneFiring = firing;
  if (!firing) {
    for (let i = 0; i < cd.length; i++) { cd[i] -= dt; if (cd[i] < 0) cd[i] = 0; }
    w._droneWasFiring = false;
    return;
  }
  if (!w._droneWasFiring) {
    // erst nach den Schiffslasern einsetzen und gegeneinander versetzt (keine Salve im Gleichtakt)
    for (let i = 0; i < D.length && i < cd.length; i++) cd[i] = Math.max(cd[i], 0.12 + i * 0.11 + w.rng.next() * 0.05);
    w._droneWasFiring = true;
  }
  for (let i = 0; i < D.length && i < cd.length; i++) {
    const d = D[i];
    if (d.broken || d.module !== 'laser') continue;
    cd[i] -= dt;
    if (cd[i] > 0) continue;
    cd[i] += 1 + (w.rng.next() * 2 - 1) * R.fireJitter;
    if (cd[i] < 0) cd[i] = 1;
    const key = w._ammoForShot();
    if (!key) return;
    w.profile.ammo[key] -= 1;
    w._profileDirty = true;
    SRC.id = 'dr:' + d.id; SRC.damage = droneDamage(d);
    w._fireLaser('drone', tgt, key, AMMO[key].mult, key === 'SAB', false, i, SRC);
    if (!tgt.alive) return;
  }
}

function wearAll(w, pct) {
  const D = w.profile.drones;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    if (d.broken) continue;
    const before = d.hp;
    d.hp -= pct;
    if (d.hp <= 0) breakDrone(w, d);
    else if (before > R.warnAt && d.hp <= R.warnAt) {
      w._msg(`Drohne ${label(d)} nur noch ${Math.round(d.hp)} % Zustand. In der Station reparieren, sonst geht sie kaputt und verliert eine Stufe.`, 'warn', 'droneWarn', 6);
    }
  }
}

function breakDrone(w, d) {
  d.hp = 0;
  d.broken = true;
  const old = d.level;
  if (d.level > 1) d.level -= 1;
  d.xp = R.xp[d.level - 1];
  w.droneVer++;
  w._refreshStats();
  w._msg(`Drohne ${DRONES[d.type].name} (${MODULES[d.module]}) kaputt! Stufe ${old} → ${d.level}. Reparatur in der Station: ${fmt(repairCost(d))} Credits.`, 'warn');
  w.bus.emit('drone', { kind: 'broken', id: d.id, level: d.level, module: d.module });
  w._emitProfile();
}

/** Abschuss eines Gegners: jede einsatzbereite Drohne bekommt Erfahrung (Anteil der gestaffelten Abschuss-Erfahrung). */
export function dronesOnKill(w, xp) {
  const D = w.profile.drones;
  const gain = Math.round(xp * R.xpShare);
  if (gain <= 0) return;
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    if (d.broken) continue;
    d.xp += gain;
    let up = false;
    while (d.level < R.maxLevel && d.xp >= R.xp[d.level]) { d.level++; up = true; }
    if (up) {
      w.droneVer++;
      if (d.module === 'shield') w._refreshStats();
      const v = d.module === 'laser' ? `${fmt(droneDamage(d))} Schaden je Schuss` : `${fmt(DRONES[d.type].shield[d.level - 1])} Schild`;
      w._msg(`Drohne ${DRONES[d.type].name} (${MODULES[d.module]}) erreicht Stufe ${d.level}: ${v}, Verkaufswert ${fmt(sellPrice(d))} Credits.`, 'loot');
      w.bus.emit('drone', { kind: 'level', id: d.id, level: d.level, module: d.module });
    }
  }
}

/** Schiff zerstört: zusätzlicher Verschleiß an allen Drohnen. */
export function dronesOnDeath(w) {
  const lost = w._droneHp > 0 && w.player.hpMax > 0 ? w._droneHp / w.player.hpMax * R.wear : 0;
  w._droneHp = 0;
  const D = w.profile.drones;
  let n = 0;
  for (let i = 0; i < D.length; i++) if (!D[i].broken) n++;
  if (!n) return;
  wearAll(w, lost + R.wearOnDeath);
  w._msg(`Deine Drohnen haben je ${R.wearOnDeath} % Zustand verloren. Reparatur in der Station.`, 'warn', 'droneDeath', 2);
}

// ───────────────────────── Station: Preise, Kauf, Verkauf, Reparatur, Modul ─────────────────────────

export function sellPrice(d) {
  const base = Math.round(DRONES[d.type].price * R.sell[d.level - 1]);
  return Math.max(0, base - repairCost(d));
}

export function repairCost(d) {
  const miss = 100 - Math.max(0, d.hp);
  if (miss <= 0.01) return 0;
  return Math.ceil(miss * DRONES[d.type].price * R.repair * (1 + R.repairLevel * (d.level - 1)));
}

/** Anzeige einer Drohne: { label, value, unit, next (Erfahrung bis zur nächsten Stufe oder 0), sell, repair } */
export function droneInfo(d) {
  const T = DRONES[d.type];
  const next = d.level < R.maxLevel ? R.xp[d.level] - d.xp : 0;
  return {
    label: label(d), value: d.module === 'laser' ? T.laser[d.level - 1] : T.shield[d.level - 1], unit: d.module === 'laser' ? 'SCH' : 'SH',
    next, xpLevel: R.xp[d.level - 1], xpNext: d.level < R.maxLevel ? R.xp[d.level] : R.xp[d.level - 1], sell: sellPrice(d), repair: repairCost(d),
  };
}

function label(d) { return `${DRONES[d.type].name} ${MODULES[d.module]} St. ${d.level}`; }

export function addDrone(w, type, module) {
  const pr = w.profile;
  const d = makeDrone(pr, type, module);
  pr.drones.push(d);
  w.droneVer++;
  w.bus.emit('drone', { kind: 'buy', id: d.id, level: 1, module });
  return d;
}

function findDrone(w, ref) {
  const D = w.profile.drones;
  if (typeof ref === 'number') return D[ref] || null;
  for (let i = 0; i < D.length; i++) if (D[i].id === ref) return D[i];
  return null;
}

/** Drohne verkaufen (nur angedockt). ref = Platz (Zahl) oder id. → { ok, reason, credits } */
export function sellDrone(w, ref) {
  if (!w.docked) return w._fail('Drohnen kannst du nur in der Station verkaufen.');
  const d = findDrone(w, ref);
  if (!d) return w._fail('Diese Drohne gibt es nicht.');
  const credits = sellPrice(d);
  const pr = w.profile;
  pr.drones.splice(pr.drones.indexOf(d), 1);
  pr.credits += credits;
  w.droneVer++;
  w._refreshStats();
  w._msg(`${label(d)} verkauft: +${fmt(credits)} Credits.`, 'loot');
  w.bus.emit('drone', { kind: 'sell', id: d.id, level: d.level, module: d.module, credits });
  w._emitProfile();
  w.save();
  return { ok: true, reason: '', credits };
}

/** Reparieren (nur angedockt). ref = Platz, id oder 'all'. → { ok, reason, credits } */
export function repairDrone(w, ref) {
  if (!w.docked) return w._fail('Drohnen werden in der Station repariert.');
  const pr = w.profile;
  const list = ref === 'all' ? pr.drones.filter((d) => d.hp < 100) : [findDrone(w, ref)].filter(Boolean);
  if (!list.length) return w._fail(ref === 'all' ? 'Alle Drohnen sind in Ordnung.' : 'Diese Drohne ist in Ordnung.');
  let cost = 0;
  for (const d of list) cost += repairCost(d);
  if (cost <= 0) return w._fail('Nichts zu reparieren.');
  if (pr.credits < cost) return w._fail(`Zu wenig Credits für die Reparatur: ${fmt(cost)} nötig, du hast ${fmt(pr.credits)}.`);
  pr.credits -= cost;
  let fixed = 0;
  for (const d of list) { if (d.broken) fixed++; d.hp = 100; d.broken = false; }
  w.droneVer++;
  w._refreshStats();
  w._msg(`${list.length === 1 ? label(list[0]) : list.length + ' Drohnen'} repariert (−${fmt(cost)} Credits)${fixed ? `, ${fixed} wieder einsatzbereit` : ''}.`, 'info');
  w.bus.emit('drone', { kind: 'repair', id: list.length === 1 ? list[0].id : null, count: list.length, credits: cost });
  w._emitProfile();
  w.save();
  return { ok: true, reason: '', credits: cost };
}

/** Modul tauschen (Laser ↔ Schild), nur angedockt, kostenlos; Stufe und Erfahrung bleiben. */
export function setDroneModule(w, ref, module) {
  if (!w.docked) return w._fail('Module tauschst du in der Station.');
  if (!MODULES[module]) return w._fail('Unbekanntes Modul.');
  const d = findDrone(w, ref);
  if (!d) return w._fail('Diese Drohne gibt es nicht.');
  if (d.module === module) return { ok: true, reason: '' };
  d.module = module;
  w.droneVer++;
  w._refreshStats();
  w._msg(`${DRONES[d.type].name} trägt jetzt ein ${MODULES[module]}-Modul.`, 'info');
  w.bus.emit('drone', { kind: 'module', id: d.id, level: d.level, module });
  w._emitProfile();
  w.save();
  return { ok: true, reason: '' };
}
