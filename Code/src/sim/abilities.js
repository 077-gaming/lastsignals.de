// Extras, Minen, Techs, Formationen und Konfigurationen (Schnellleiste AKT·08). Werte: data.js (EXTRAS, MINES, TECHS,
// FORMATIONS, CONFIG_RULES). Reine Logik ohne Grafik, keine Speicher-Neuanlage pro Schritt (feste Listen, wiederverwendete
// Objekte); nur Einsätze selbst legen kleine Ereignis-Nutzlasten an.
//
// Zustand für das HUD: world.abilities[id] = { count, readyIn, cooldown, activeFor, duration } (Objekte bleiben gleich).
// Grafik/Ton: Ereignis 'ability' { id, kind, phase, x, z, radius, duration, count, hits } plus vorhandene Effekte
// ('telegraph'/'special' für Ringe und Schildblase, 'shot' für den Kettenblitz, 'explode' für Bombe/Sprengmine,
// 'rocket', 'jumpStart', 'damage'), 'heal' { id, hull, shield, x, z, source } für Heilzahlen.
import {
  EXTRAS, MINES, MINE_RULES, TECHS, FORMATIONS, FORMATION_RULES, CONFIG_RULES, STARTER_KIT, KIT_VERSION,
  ROCKETS, ROCKET_RULES, GENERATORS, LASERS, SHIPS, FACTIONS, AMMO,
} from '../core/data.js';
import { calmDown, engaged } from './ai.js';
import { rollDamage, fmt } from './combat.js';

const NEAR = [];                 // wiederverwendete Trefferliste
const PICK = [];                 // Kettenblitz-Ziele
const EXTRA_IDS = Object.keys(EXTRAS);
const MINE_IDS = Object.keys(MINES);
const TECH_IDS = Object.keys(TECHS);
const ALL_IDS = EXTRA_IDS.concat(MINE_IDS, TECH_IDS);
const DEF = { ...EXTRAS, ...MINES, ...TECHS };
const CUR = { credits: 'Credits', tritium: 'Tritium' };
const s1 = (n) => n.toFixed(1).replace('.', ',');
const MINE_KIND = { SPM: 'mine', BRM: 'nova', STM: 'emp' }; // Ringfarbe der Warnanzeige: rot · blau · blau

// ───────────────────────── Aufbau ─────────────────────────

export function initAbilities(w) {
  const ab = {};
  for (const id of ALL_IDS) {
    const d = DEF[id];
    ab[id] = { count: 0, readyIn: 0, cooldown: d.cooldown || MINE_RULES.gap, activeFor: 0, duration: d.duration || 0, fuse: 0 };
  }
  ab.formation = { readyIn: 0, cooldown: FORMATION_RULES.cooldown, activeFor: 0, duration: 0 };
  ab.config = { readyIn: 0, cooldown: CONFIG_RULES.cooldown, activeFor: 0, duration: 0 };
  w.abilities = ab;
  w.cloaked = false;
  w.player.cloak = 0;            // 0..1 für die Grafik (eigene Tarnung)
  w.formation = w.profile.formation || 'standard';
  w.config = w.profile.configs.cur;
  // Minen: feste Liste für die Grafik ({ active, id, type, x, z, radius, trigger, armed, t })
  w.mines = [];
  for (let i = 0; i < MINE_RULES.max; i++) w.mines.push({ active: false, id: `mn${i}`, type: null, x: 0, z: 0, radius: 0, trigger: 0, armed: false, t: 0, armT: 0 });
  w._mineSeq = 0;
  w._heal = { hull: 0, shield: 0, t: 0, src: null };
  w._sosAbs = 0;
  w._kitMsgAt = w.profile.kitShown === KIT_VERSION ? 0 : 3;
  syncCounts(w);
}

function syncCounts(w) {
  const pr = w.profile, ab = w.abilities;
  for (const id of EXTRA_IDS) ab[id].count = pr.extras[id] || 0;
  for (const id of MINE_IDS) ab[id].count = pr.extras[id] || 0;
  for (const id of TECH_IDS) ab[id].count = pr.techs[id] || 0;
}

// ───────────────────────── je Schritt ─────────────────────────

export function updateAbilities(w, dt) {
  const ab = w.abilities;
  const p = w.player;
  for (let i = 0; i < ALL_IDS.length; i++) {
    const a = ab[ALL_IDS[i]];
    if (a.readyIn > 0) { a.readyIn -= dt; if (a.readyIn < 0) a.readyIn = 0; }
  }
  if (ab.formation.readyIn > 0) { ab.formation.readyIn -= dt; if (ab.formation.readyIn < 0) ab.formation.readyIn = 0; }
  if (ab.config.readyIn > 0) { ab.config.readyIn -= dt; if (ab.config.readyIn < 0) ab.config.readyIn = 0; }

  if (w._kitMsgAt > 0 && w.time >= w._kitMsgAt) {
    w._kitMsgAt = 0;
    w.profile.kitShown = KIT_VERSION;
    const k = STARTER_KIT;
    w._msg(`Erprobungspaket an Bord: ${k.extras.EMP} EMP, ${k.extras.SOS} SOS, ${k.extras.BMB} BMB, ${k.extras.TRN} TRN, ${k.extras.JMP} JMP, Minen ${k.extras.SPM} SPM / ${k.extras.BRM} BRM / ${k.extras.STM} STM, je ${k.techs.VMP} Techs, ${fmt(k.ammo.L3)} L3, ${fmt(k.ammo.SAL)} SAL, ${k.ammo.R2} R2, ${k.ammo.R3} R3. Belegung: Schnellleiste, Leisten 1–4 (Alt+1–4).`, 'info');
  }

  if (!p.alive) return;

  // Zünder (Bombe, EMP): Ring füllt sich kurz, dann Wirkung
  const bmb = ab.BMB, emp = ab.EMP;
  if (bmb.fuse > 0) { bmb.fuse -= dt; if (bmb.fuse <= 0) { bmb.fuse = 0; fireBomb(w); } }
  if (emp.fuse > 0) { emp.fuse -= dt; if (emp.fuse <= 0) { emp.fuse = 0; fireEmp(w); } }

  // laufende Wirkungen
  const sos = ab.SOS;
  if (sos.activeFor > 0) {
    sos.activeFor -= dt;
    if (sos.activeFor <= 0) {
      sos.activeFor = 0;
      if (w._sosAbs > 0) w._msg(`SOS beendet: ${fmt(Math.round(w._sosAbs))} Schaden abgefangen.`, 'info');
      w._sosAbs = 0;
      emitAbility(w, 'SOS', 'extra', 'end');
    }
  }
  const trn = ab.TRN;
  if (trn.activeFor > 0) {
    trn.activeFor -= dt;
    if (trn.activeFor <= 0) breakCloak(w, 'Zeit');
  }
  const fix = ab.FIX;
  if (fix.activeFor > 0) {
    fix.activeFor -= dt;
    if (p.hp < p.hpMax) {
      let n = p.hpMax * TECHS.FIX.rate * dt;
      if (p.hp + n > p.hpMax) n = p.hpMax - p.hp;
      p.hp += n; addHeal(w, n, 0, 'FIX');
    }
    if (fix.activeFor <= 0) { fix.activeFor = 0; emitAbility(w, 'FIX', 'tech', 'end'); }
  }
  for (const id of ['VMP', 'LCK']) {
    const a = ab[id];
    if (a.activeFor > 0) { a.activeFor -= dt; if (a.activeFor <= 0) { a.activeFor = 0; emitAbility(w, id, 'tech', 'end'); } }
  }
  // Heilzahlen gesammelt alle 0,5 s
  const h = w._heal;
  if (h.hull > 0 || h.shield > 0) {
    h.t += dt;
    if (h.t >= 0.5) flushHeal(w);
  }
  updateMines(w, dt);
}

/** Bei Tod oder Sektorwechsel: Wirkungen und Minen beenden. */
export function resetAbilities(w, mines = true) {
  const ab = w.abilities;
  for (const id of ALL_IDS) { ab[id].activeFor = 0; ab[id].fuse = 0; }
  if (w.cloaked) { w.cloaked = false; w.player.cloak = 0; }
  w._sosAbs = 0;
  w._heal.hull = 0; w._heal.shield = 0; w._heal.t = 0;
  if (mines) for (const m of w.mines) if (m.active) { m.active = false; w.bus.emit('telegraphEnd', { id: m.id }); }
}

// ───────────────────────── Hilfen ─────────────────────────

function emitAbility(w, id, kind, phase, extra) {
  const p = w.player;
  const o = { id, kind, phase, x: p.x, z: p.z, radius: 0, duration: 0, count: w.abilities[id] ? w.abilities[id].count : 0 };
  if (extra) Object.assign(o, extra);
  w.bus.emit('ability', o);
}

function addHeal(w, hull, shield, src) {
  const h = w._heal;
  h.hull += hull; h.shield += shield; h.src = src;
}
function flushHeal(w) {
  const h = w._heal, p = w.player;
  const hull = Math.round(h.hull), shield = Math.round(h.shield);
  if (hull > 0 || shield > 0) w.bus.emit('heal', { id: 'player', hull, shield, x: p.x, z: p.z, source: h.src });
  h.hull = 0; h.shield = 0; h.t = 0;
}

function ringFx(w, id, kind, x, z, radius, delay) {
  w.bus.emit('telegraph', { id, kind, x, z, dx: 0, dz: 0, delay, radius, length: 0, targetId: 'own', own: true });
}
function ringFire(w, id, kind, x, z, radius, duration = 0) {
  w.bus.emit('special', { id, kind, cancelled: false, x, z, dx: 0, dz: 0, radius, length: 0, duration, own: true });
}
function shieldBubble(w, duration) {
  const p = w.player;
  w.bus.emit('telegraph', { id: 'player', kind: 'guard', x: p.x, z: p.z, dx: 0, dz: 0, delay: 0.15, radius: p.radius * 2, length: 0, targetId: 'own', own: true });
  w.bus.emit('special', { id: 'player', kind: 'guard', cancelled: false, x: p.x, z: p.z, radius: p.radius * 2, duration, own: true });
}

function stockOf(w, id) {
  const pr = w.profile;
  return TECHS[id] ? pr.techs[id] || 0 : pr.extras[id] || 0;
}
function take(w, id) {
  const pr = w.profile;
  if (TECHS[id]) pr.techs[id] -= 1; else pr.extras[id] -= 1;
  w.abilities[id].count = stockOf(w, id);
  w._profileDirty = true;
}

/** Gemeinsame Prüfung: lebt, nicht angedockt, Vorrat, Abklingzeit. */
function ready(w, id, title) {
  const p = w.player, d = DEF[id], a = w.abilities[id];
  if (!p.alive || w.docked || w.playerDead) return false;
  if (a.readyIn > 0) { w._msg(`${title} lädt noch (${s1(a.readyIn)} s).`, 'info', 'abCd' + id, 0.8); return false; }
  if (stockOf(w, id) < 1) {
    w._msg(`Kein ${title} mehr an Bord. Nachschub in der Station: ${fmt(d.price)} ${CUR[d.currency]} je Stück.`, 'warn', 'abNo' + id, 1.5);
    return false;
  }
  return true;
}

function noShoot(w, title) {
  if (w.inSafeZone) { w._msg(`${title} geht nicht in der sicheren Zone.`, 'info', 'abSafe', 2); return true; }
  if (w.time < w._invulnUntil) { w._msg('Nach der Reparatur kurz keine Angriffe.', 'info', 'abInv', 2); return true; }
  return false;
}

/** Gegner im Umkreis (lebend, nach Abstand ohne eigenen Radius) in NEAR sammeln. */
function enemiesNear(w, x, z, r) {
  const n = w.grid.query(x, z, r + 60, NEAR);
  let k = 0;
  for (let i = 0; i < n; i++) {
    const e = NEAR[i];
    if (!e.alive || e.kind !== 'enemy') continue;
    const dx = e.x - x, dz = e.z - z, R = r + e.radius;
    if (dx * dx + dz * dz <= R * R) NEAR[k++] = e;
  }
  NEAR.length = k;
  return k;
}

/** Zielerfassung lösen und Tarnung brechen (EMP, STM). */
function jamEnemy(w, e, sec) {
  const had = engaged(e) && e.targetId === 'player' || e.provoked || e.state === 'flee' || e.stalk || e.cloak > 0;
  if (e.targetId === 'player' || e.provoked || e.stalk || e.spPhase || e.state === 'loot') calmDown(w, e);
  e.jamT = sec; e.cloak = 0; e.stalk = false;
  e.tactic = 'gestört';
  return had;
}

/** Eigene Tarnung beenden (Angriff, Zeit, Tod). */
export function breakCloak(w, why) {
  if (!w.cloaked) return;
  w.cloaked = false;
  w.player.cloak = 0;
  w.abilities.TRN.activeFor = 0;
  emitAbility(w, 'TRN', 'extra', 'end', { reason: why });
  w._msg(why === 'Zeit' ? 'Tarnung abgelaufen. Du bist wieder sichtbar.' : 'Tarnung aufgehoben: Angriff verrät dich.', 'info', 'trnEnd', 1);
}

/** SOS aktiv? Dann Schaden abfangen (Rückgabe true = kein Schaden). */
export function sosAbsorb(w, dmg) {
  if (w.abilities.SOS.activeFor <= 0) return false;
  w._sosAbs += dmg;
  return true;
}

/** VMP: Laserschaden heilt die Hülle. */
export function leech(w, dealt) {
  if (w.abilities.VMP.activeFor <= 0 || dealt <= 0) return;
  const p = w.player;
  let n = dealt * TECHS.VMP.leech;
  if (p.hp + n > p.hpMax) n = p.hpMax - p.hp;
  if (n <= 0) return;
  p.hp += n;
  addHeal(w, n, 0, 'VMP');
}

/** Trifft die Rakete? LCK = immer; sonst kann ein ausweichendes Ziel entkommen. */
export function rocketHits(w, e) {
  if (w.abilities.LCK.activeFor > 0) return true;
  if (e.jinkT > 0 && w.rng.next() < ROCKET_RULES.dodgeMiss) return false;
  return true;
}

// ───────────────────────── Extras ─────────────────────────

export function useExtra(w, id, arg) {
  const d = EXTRAS[id];
  if (!d) return false;
  if (!ready(w, id, d.name)) return false;
  const p = w.player, a = w.abilities[id];
  switch (id) {
    case 'EMP': {
      if (a.fuse > 0) return false;
      take(w, id); a.readyIn = d.cooldown;
      a.fuse = 0.3;
      ringFx(w, 'ab:EMP', 'emp', p.x, p.z, d.radius, 0.3);
      emitAbility(w, id, 'extra', 'use', { radius: d.radius });
      return true;
    }
    case 'SOS': {
      take(w, id); a.readyIn = d.cooldown; a.activeFor = d.duration; w._sosAbs = 0;
      shieldBubble(w, d.duration);
      emitAbility(w, id, 'extra', 'use', { duration: d.duration });
      w._msg(`SOS: ${d.duration} s unverwundbar.`, 'info');
      return true;
    }
    case 'BMB': {
      if (noShoot(w, 'Die Bombe')) return false;
      if (a.fuse > 0) return false;
      take(w, id); a.readyIn = d.cooldown;
      a.fuse = 0.35;
      ringFx(w, 'ab:BMB', 'bomb', p.x, p.z, d.radius, 0.35);
      breakCloak(w, 'Angriff');
      emitAbility(w, id, 'extra', 'use', { radius: d.radius });
      return true;
    }
    case 'TRN': {
      if (w.cloaked) { w._msg('Tarnung läuft bereits.', 'info', 'trnOn', 1); return false; }
      const calm = d.calm - (w.time - w._lastCombat);
      if (calm > 0) { w._msg(`Tarnung geht nur außerhalb des Kampfes (noch ${s1(calm)} s ohne Treffer und Schüsse).`, 'info', 'trnCalm', 1); return false; }
      take(w, id); a.readyIn = d.cooldown; a.activeFor = d.duration;
      w.cloaked = true; p.cloak = 1;
      for (let i = 0; i < w.enemies.length; i++) {
        const e = w.enemies[i];
        if (e.alive && e.targetId === 'player') calmDown(w, e);
      }
      emitAbility(w, id, 'extra', 'use', { duration: d.duration });
      w._msg(`Tarnung aktiv: Gegner sehen dich nicht, bis du angreifst (höchstens ${d.duration} s).`, 'info');
      return true;
    }
    case 'JMP': {
      if (w.jump) { w._msg('Ein Sprung lädt bereits.', 'info', 'jmpBusy', 1); return false; }
      const to = jmpTarget(w, arg);
      if (!to) { w._msg('Kein Sprungziel.', 'info', 'jmpNo', 1); return false; }
      take(w, id); a.readyIn = d.cooldown;
      const j = w._jumpObj;
      j.progress = 0; j.t = 0; j.portal = null; j.to = to; j.dur = d.charge; j.jmp = true;
      w.jump = j;
      w.bus.emit('jumpStart', { seconds: d.charge, jmp: true, to });
      emitAbility(w, id, 'extra', 'use', { duration: d.charge, to });
      w._msg(`JMP lädt: Sprung nach ${w.sectors[to].name} (${to}) in ${d.charge} s.`, 'info');
      return true;
    }
  }
  return false;
}

function jmpTarget(w, arg) {
  if (arg && w.sectors[arg] && arg !== w.sector.id) return arg;
  const pre = FACTIONS[w.profile.faction].prefix;
  const n = Object.keys(w.sectors).length;
  const next = (w.sector.index % n) + 1;
  const id = `${pre}-${next}`;
  return w.sectors[id] && id !== w.sector.id ? id : null;
}

function fireEmp(w) {
  const d = EXTRAS.EMP, p = w.player;
  const n = enemiesNear(w, p.x, p.z, d.radius);
  let lost = 0;
  for (let i = 0; i < n; i++) if (jamEnemy(w, NEAR[i], d.jam)) lost++;
  ringFire(w, 'ab:EMP', 'emp', p.x, p.z, d.radius);
  emitAbility(w, 'EMP', 'extra', 'fire', { radius: d.radius, hits: n });
  w._msg(n ? `EMP: ${n} Gegner im Umkreis von ${fmt(d.radius)} m gestört, ${lost} verlieren dich (${d.jam} s keine Zielerfassung).` : `EMP: kein Gegner im Umkreis von ${fmt(d.radius)} m.`, 'info');
}

function fireBomb(w) {
  const d = EXTRAS.BMB, p = w.player;
  const n = enemiesNear(w, p.x, p.z, d.radius);
  ringFire(w, 'ab:BMB', 'bomb', p.x, p.z, d.radius);
  w.bus.emit('explode', { id: 'ab:BMB', x: p.x, z: p.z, size: 1.3, own: true });
  // Liste kopieren: Abschüsse können neue Gegner (Ereignis) erzeugen und NEAR neu füllen
  PICK.length = 0;
  for (let i = 0; i < n; i++) PICK.push(NEAR[i]);
  let total = 0, kills = 0;
  w._abilityHit = true;
  for (let i = 0; i < PICK.length; i++) {
    const e = PICK[i];
    if (!e.alive) continue;
    let dx = e.x - p.x, dz = e.z - p.z;
    const L = Math.sqrt(dx * dx + dz * dz) || 1; dx /= L; dz /= L;
    const hp0 = e.hp + e.shield;
    w._hitEnemy(e, rollDamage(w.rng, d.damage, 1), false, true, dx, dz, e.x - dx * e.radius * 0.7, e.z - dz * e.radius * 0.7, false);
    total += Math.max(0, hp0 - Math.max(0, e.hp) - Math.max(0, e.shield));
    if (!e.alive) kills++;
  }
  w._abilityHit = false;
  PICK.length = 0;
  w._lastCombat = w.time;
  emitAbility(w, 'BMB', 'extra', 'fire', { radius: d.radius, hits: n });
  w._msg(n ? `Bombe: ${n} Gegner getroffen, ${fmt(Math.round(total))} Schaden${kills ? `, ${kills} zerstört` : ''}.` : `Bombe: kein Gegner im Umkreis von ${fmt(d.radius)} m.`, 'info');
}

// ───────────────────────── Minen ─────────────────────────

export function layMine(w, id) {
  const d = MINES[id];
  if (!d) return false;
  if (!ready(w, id, d.name)) return false;
  if (w.inSafeZone) { w._msg('In der sicheren Zone keine Minen.', 'info', 'abSafe', 2); return false; }
  const p = w.player;
  let m = null, old = null;
  for (const o of w.mines) { if (!o.active) { m = o; break; } if (!old || o.t < old.t) old = o; }
  if (!m) { m = old; w.bus.emit('telegraphEnd', { id: m.id }); emitAbility(w, m.type, 'mine', 'expire', { mine: m.id, x: m.x, z: m.z }); }
  take(w, id);
  for (const k of MINE_IDS) if (w.abilities[k].readyIn < MINE_RULES.gap) w.abilities[k].readyIn = MINE_RULES.gap;
  const b = MINE_RULES.behind;
  m.active = true; m.type = id; m.armed = false; m.armT = d.arm; m.t = d.life;
  m.x = p.x + Math.sin(p.rot) * b; m.z = p.z + Math.cos(p.rot) * b;
  m.radius = d.radius; m.trigger = d.trigger;
  m.id = `mn${++w._mineSeq}`;
  w.bus.emit('telegraph', { id: m.id, kind: MINE_KIND[id], x: m.x, z: m.z, dx: 0, dz: 0, delay: d.life, radius: d.radius, length: 0, targetId: 'mine', label: d.title, own: true });
  emitAbility(w, id, 'mine', 'lay', { mine: m.id, x: m.x, z: m.z, radius: d.radius, duration: d.life });
  w._msg(`${d.title} ${id} gelegt (scharf in ${s1(d.arm)} s, Wirkung ${fmt(d.radius)} m, noch ${stockOf(w, id)}).`, 'info', 'mineLay', 0.5);
  return true;
}

function updateMines(w, dt) {
  const ms = w.mines;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (!m.active) continue;
    m.t -= dt;
    if (m.t <= 0) {
      m.active = false;
      w.bus.emit('telegraphEnd', { id: m.id });
      emitAbility(w, m.type, 'mine', 'expire', { mine: m.id, x: m.x, z: m.z });
      continue;
    }
    if (!m.armed) { m.armT -= dt; if (m.armT <= 0) m.armed = true; else continue; }
    if (enemiesNear(w, m.x, m.z, m.trigger) > 0) detonate(w, m);
  }
}

function detonate(w, m) {
  const d = MINES[m.type];
  m.active = false;
  const n = enemiesNear(w, m.x, m.z, m.radius);
  ringFire(w, m.id, MINE_KIND[m.type], m.x, m.z, m.radius);
  let text = '';
  if (m.type === 'SPM') {
    w.bus.emit('explode', { id: m.id, x: m.x, z: m.z, size: 1.5, own: true });
    PICK.length = 0;
    for (let i = 0; i < n; i++) PICK.push(NEAR[i]);
    let total = 0, kills = 0;
    w._abilityHit = true;
    for (let i = 0; i < PICK.length; i++) {
      const e = PICK[i];
      if (!e.alive) continue;
      let dx = e.x - m.x, dz = e.z - m.z;
      const L = Math.sqrt(dx * dx + dz * dz) || 1; dx /= L; dz /= L;
      const hp0 = e.hp + e.shield;
      w._hitEnemy(e, rollDamage(w.rng, d.damage, 1), false, true, dx, dz, e.x - dx * e.radius * 0.7, e.z - dz * e.radius * 0.7, false);
      total += Math.max(0, hp0 - Math.max(0, e.hp) - Math.max(0, e.shield));
      if (!e.alive) kills++;
    }
    w._abilityHit = false;
    PICK.length = 0;
    text = `Sprengmine: ${n} Gegner, ${fmt(Math.round(total))} Schaden${kills ? `, ${kills} zerstört` : ''}.`;
  } else if (m.type === 'BRM') {
    for (let i = 0; i < n; i++) { const e = NEAR[i]; e.slowT = d.duration; e.slowK = d.slow; }
    text = `Bremsmine: ${n} Gegner ${d.duration} s lang auf ${Math.round(d.slow * 100)} % Tempo.`;
  } else {
    let lost = 0;
    for (let i = 0; i < n; i++) if (jamEnemy(w, NEAR[i], d.jam)) lost++;
    text = `Störmine: ${n} Gegner gestört, ${lost} verlieren dich (${d.jam} s).`;
  }
  emitAbility(w, m.type, 'mine', 'fire', { mine: m.id, x: m.x, z: m.z, radius: m.radius, hits: n });
  w._msg(text, 'info', 'mineFire', 0.3);
}

// ───────────────────────── Techs ─────────────────────────

export function useTech(w, id) {
  const d = TECHS[id];
  if (!d) return false;
  if (!ready(w, id, d.name)) return false;
  const p = w.player, a = w.abilities[id];
  switch (id) {
    case 'VMP':
      take(w, id); a.readyIn = d.cooldown; a.activeFor = d.duration;
      emitAbility(w, id, 'tech', 'use', { duration: d.duration });
      w._msg(`VMP: ${d.duration} s lang heilen ${Math.round(d.leech * 100)} % deines Laserschadens die Hülle.`, 'info');
      return true;
    case 'LCK':
      take(w, id); a.readyIn = d.cooldown; a.activeFor = d.duration;
      emitAbility(w, id, 'tech', 'use', { duration: d.duration });
      w._msg(`LCK: ${d.duration} s lang trifft jede Rakete.`, 'info');
      return true;
    case 'RSV': {
      if (p.shieldMax <= 0 || p.shield >= p.shieldMax - 1) { w._msg('Schild ist schon voll.', 'info', 'rsvFull', 1); return false; }
      take(w, id); a.readyIn = d.cooldown;
      const n = p.shieldMax - p.shield;
      p.shield = p.shieldMax;
      addHeal(w, 0, n, 'RSV'); flushHeal(w);
      shieldBubble(w, 0.9);
      emitAbility(w, id, 'tech', 'use');
      w._msg(`RSV: Schild sofort voll (+${fmt(Math.round(n))}).`, 'info');
      return true;
    }
    case 'FIX':
      if (p.hp >= p.hpMax - 1) { w._msg('Hülle ist unbeschädigt.', 'info', 'fixFull', 1); return false; }
      take(w, id); a.readyIn = d.cooldown; a.activeFor = d.duration;
      emitAbility(w, id, 'tech', 'use', { duration: d.duration });
      w._msg(`FIX: Kampfreparatur, ${d.duration} s lang ${Math.round(d.rate * 100)} % Hülle je Sekunde.`, 'info');
      return true;
    case 'ARC':
      if (noShoot(w, 'Der Kettenblitz')) return false;
      return fireArc(w, d, a);
  }
  return false;
}

function fireArc(w, d, a) {
  const p = w.player;
  const n = enemiesNear(w, p.x, p.z, d.range);
  if (!n) { w._msg(`ARC: kein Gegner in Reichweite (${fmt(d.range)} m).`, 'info', 'arcNone', 1); return false; }
  // erstes Ziel: gewähltes Ziel in Reichweite, sonst der nächste; dann jeweils der nächste ungetroffene (≤ hop m)
  PICK.length = 0;
  let first = null;
  const tgt = p.targetId ? w.entities.get(p.targetId) : null;
  for (let i = 0; i < n; i++) if (NEAR[i] === tgt) first = tgt;
  if (!first) {
    let bd = Infinity;
    for (let i = 0; i < n; i++) { const e = NEAR[i], q = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (q < bd) { bd = q; first = e; } }
  }
  const cand = NEAR.slice(0, n); // selten (Tech-Einsatz), kleine Liste
  PICK.push(first);
  let last = first;
  while (PICK.length < d.targets) {
    let best = null, bd = d.hop * d.hop;
    for (const e of cand) {
      if (PICK.includes(e)) continue;
      const q = (e.x - last.x) ** 2 + (e.z - last.z) ** 2;
      if (q < bd) { bd = q; best = e; }
    }
    if (!best) {
      // Kette reißt: nächster im Gesamtumkreis des Spielers
      for (const e of cand) if (!PICK.includes(e)) { best = e; break; }
      if (!best) break;
    }
    PICK.push(best); last = best;
  }
  take(w, 'ARC'); a.readyIn = d.cooldown;
  breakCloak(w, 'Angriff');
  w._lastCombat = w.time;
  const list = PICK.slice();
  PICK.length = 0;
  let from = 'player', fx = p.x, fz = p.z, total = 0, kills = 0;
  w._abilityHit = true;
  for (const e of list) {
    let dx = e.x - fx, dz = e.z - fz;
    const L = Math.sqrt(dx * dx + dz * dz) || 1; dx /= L; dz /= L;
    const hx = e.x - dx * e.radius * 0.6, hz = e.z - dz * e.radius * 0.6;
    w.bus.emit('shot', { from, to: e.id, laser: 'ion', ammo: 'L4', hit: true, idx: 0, x: hx, z: hz, dx, dz, arc: true });
    const hp0 = e.hp + e.shield;
    const ex = e.x, ez = e.z;
    w._hitEnemy(e, rollDamage(w.rng, d.damage, 1), false, true, dx, dz, hx, hz, false);
    total += Math.max(0, hp0 - Math.max(0, e.hp) - Math.max(0, e.shield));
    if (!e.alive) kills++;
    from = e.alive ? e.id : from; fx = ex; fz = ez;
  }
  w._abilityHit = false;
  emitAbility(w, 'ARC', 'tech', 'fire', { radius: d.range, hits: list.length, targets: list.map((e) => e.id) });
  w._msg(`ARC: Blitz auf ${list.length} Gegner, ${fmt(Math.round(total))} Schaden${kills ? `, ${kills} zerstört` : ''}.`, 'info');
  return true;
}

// ───────────────────────── Formation, Konfiguration ─────────────────────────

export function setFormation(w, id) {
  const f = FORMATIONS[id];
  if (!f) return false;
  const pr = w.profile, a = w.abilities.formation;
  if (id !== 'standard' && !pr.owned.formations.includes(id)) {
    w._msg(f.eventOnly ? `Formation ${f.name} gibt es nur aus Events und Toren.` : `Formation ${f.name} nicht im Besitz (${fmt(f.price)} ${CUR[f.currency]} in der Station).`, 'info', 'formNo', 1);
    return false;
  }
  if (w.formation === id) return true;
  if (a.readyIn > 0) { w._msg(`Formationswechsel lädt noch (${s1(a.readyIn)} s).`, 'info', 'formCd', 0.8); return false; }
  const prev = w.formation;
  w.formation = pr.formation = id;
  a.readyIn = a.cooldown;
  w.bus.emit('formation', { id, prev });
  emitAbility(w, 'formation', 'form', 'use', { formation: id, prev });
  w._msg(`Formation ${f.name} gewählt (wirkt, sobald Drohnen an Bord sind).`, 'info', 'form', 0.3);
  w._profileDirty = true;
  return true;
}

/** Aktuelle Ausrüstung in die laufende Konfiguration schreiben. */
export function syncConfig(w) {
  const pr = w.profile;
  const sets = pr.configs.sets[pr.ship] || (pr.configs.sets[pr.ship] = defaultConfigs(pr));
  const c = sets[pr.configs.cur - 1];
  c.lasers = pr.loadout.lasers.slice();
  c.gens = pr.loadout.gens.slice();
}

export function setConfig(w, n) {
  n = n | 0;
  if (n < 1 || n > CONFIG_RULES.count) return false;
  const pr = w.profile, p = w.player, a = w.abilities.config;
  if (!p.alive || w.playerDead) return false;
  if (pr.configs.cur === n) { w._msg(`Konfiguration ${n} ist schon aktiv.`, 'info', 'cfgSame', 1); return true; }
  if (a.readyIn > 0) { w._msg(`Konfigurationswechsel lädt noch (${s1(a.readyIn)} s).`, 'info', 'cfgCd', 0.8); return false; }
  syncConfig(w);
  const prev = pr.configs.cur;
  const want = pr.configs.sets[pr.ship][n - 1];
  applyConfig(pr, want);
  pr.configs.cur = n;
  w.config = n;
  const ratio = p.shieldMax > 0 ? p.shield / p.shieldMax : 1;
  w._refreshStats();
  p.shield = p.shieldMax * ratio;
  // gespeicherte Konfiguration auf das tatsächlich Eingebaute setzen (fehlende Teile)
  syncConfig(w);
  a.readyIn = a.cooldown;
  w.bus.emit('config', { n, prev });
  emitAbility(w, 'config', 'config', 'use', { n, prev });
  w._emitProfile();
  const L = countList(pr.loadout.lasers, LASERS), G = countList(pr.loadout.gens, GENERATORS);
  w._msg(`Konfiguration ${n}: ${L || 'keine Laser'} · ${G || 'keine Generatoren'} · Schild ${fmt(Math.round(p.shieldMax))}, Tempo ${fmt(Math.round(w.playerSpeed))} m/s.`, 'info', 'cfg', 0.3);
  return true;
}

function countList(arr, table) {
  const m = new Map();
  for (const id of arr) m.set(id, (m.get(id) || 0) + 1);
  return [...m].map(([id, k]) => `${k > 1 ? k + '× ' : ''}${table[id] ? table[id].name : id}`).join(', ');
}

/** Ausrüstung tauschen: alles Eingebaute ins Lager, dann die Teile der Konfiguration aus dem Lager einbauen. */
function applyConfig(pr, want) {
  const ship = SHIPS[pr.ship] || SHIPS.s1;
  const L = pr.loadout.lasers, G = pr.loadout.gens;
  for (const x of L) pr.owned.lasers.push(x);
  for (const x of G) pr.owned.gens.push(x);
  L.length = 0; G.length = 0;
  for (const x of want.lasers) if (L.length < ship.laserSlots && removeOne(pr.owned.lasers, x)) L.push(x);
  for (const x of want.gens) if (G.length < ship.genSlots && removeOne(pr.owned.gens, x)) G.push(x);
}

function removeOne(arr, id) {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  return i >= 0;
}

/** Drei Konfigurationen aus dem Besitz: 1 = wie eingebaut, 2 = Schild zuerst, 3 = Tempo zuerst. */
export function defaultConfigs(pr) {
  const ship = SHIPS[pr.ship] || SHIPS.s1;
  const lasers = pr.loadout.lasers.slice();
  const pool = pr.loadout.gens.concat(pr.owned.gens);
  const pick = (kind) => {
    const a = pool.slice().sort((x, y) => {
      const gx = GENERATORS[x], gy = GENERATORS[y];
      const kx = gx && gx.kind === kind ? 1 : 0, ky = gy && gy.kind === kind ? 1 : 0;
      return ky - kx || (gy ? gy.value : 0) - (gx ? gx.value : 0);
    });
    return a.slice(0, ship.genSlots);
  };
  return [
    { lasers, gens: pr.loadout.gens.slice() },
    { lasers: lasers.slice(), gens: pick('shield') },
    { lasers: lasers.slice(), gens: pick('speed') },
  ];
}

/** Nach Schiffswechsel: neue Konfigurationen für dieses Schiff, Nr. 1 aktiv. */
export function resetConfigsForShip(w) {
  const pr = w.profile;
  pr.configs.sets[pr.ship] = defaultConfigs(pr);
  pr.configs.cur = 1;
  w.config = 1;
}

// ───────────────────────── Spielstand ─────────────────────────

/** Fehlende Felder ergänzen, Erprobungspaket einmal auffüllen. Rückgabe: true, wenn das Paket neu gegeben wurde. */
export function normalizeAbilities(pr) {
  pr.extras = pr.extras || {};
  pr.techs = pr.techs || {};
  for (const id of EXTRA_IDS.concat(MINE_IDS)) if (typeof pr.extras[id] !== 'number') pr.extras[id] = 0;
  for (const id of TECH_IDS) if (typeof pr.techs[id] !== 'number') pr.techs[id] = 0;
  for (const id in ROCKETS) if (typeof pr.ammo[id] !== 'number') pr.ammo[id] = 0;
  if (!ROCKETS[pr.selectedRocket]) pr.selectedRocket = 'R1';
  pr.owned.formations = Array.isArray(pr.owned.formations) ? pr.owned.formations : [];
  if (!pr.owned.formations.includes('standard')) pr.owned.formations.unshift('standard');
  let gave = false;
  if ((pr.kit || 0) < KIT_VERSION) {
    const K = STARTER_KIT;
    for (const k in K.ammo) if (AMMO[k] || ROCKETS[k]) pr.ammo[k] = Math.max(pr.ammo[k] || 0, K.ammo[k]);
    for (const k in K.extras) pr.extras[k] = Math.max(pr.extras[k] || 0, K.extras[k]);
    for (const k in K.techs) pr.techs[k] = Math.max(pr.techs[k] || 0, K.techs[k]);
    for (const f of K.formations) if (!pr.owned.formations.includes(f)) pr.owned.formations.push(f);
    for (const g of K.gens) pr.owned.gens.push(g);
    pr.kit = KIT_VERSION;
    gave = true;
    if (pr.configs && pr.configs.sets) pr.configs.sets[pr.ship] = null; // mit den neuen Generatoren neu aufbauen
  }
  if (!FORMATIONS[pr.formation] || !pr.owned.formations.includes(pr.formation)) pr.formation = 'standard';
  pr.configs = pr.configs && typeof pr.configs === 'object' ? pr.configs : { cur: 1, sets: {} };
  pr.configs.sets = pr.configs.sets || {};
  if (!(pr.configs.cur >= 1 && pr.configs.cur <= CONFIG_RULES.count)) pr.configs.cur = 1;
  const sets = pr.configs.sets[pr.ship];
  if (!Array.isArray(sets) || sets.length !== CONFIG_RULES.count) {
    pr.configs.sets[pr.ship] = defaultConfigs(pr);
    pr.configs.cur = 1;
  }
  return gave;
}
