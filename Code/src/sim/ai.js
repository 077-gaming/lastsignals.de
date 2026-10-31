// Gegner-KI mit Persönlichkeit je Typ (ENEMIES[type].ai, siehe data.js):
//   pack   – Raider-Rudel verteilt sich um dich und greift von mehreren Seiten an, Salve als Spezialangriff
//   swarm  – Larven umzingeln eng, Sprungbiss
//   ambush – Jackal lauern getarnt (e.cloak), springen Angeschlagene oder Abgelenkte an, Rammangriff
//   kite   – Spiker halten Abstand, schießen aus der Ferne, Säurewolke, ziehen sich in Deckung zurück
//   thief  – Vulture schnappen Wracks und fliehen, ziehen bei Beschuss einen Schildwall hoch
// Dazu für alle: seitliches Ausweichen, Deckung hinter Asteroiden, Verstärkung rufen, Rückzug zum Heilen,
// Feuerfokus auf das schwächste Ziel und eine Kampf-Regie (directCombat): höchstens 3–4 aktive Angreifer,
// die übrigen warten im Kreis (state 'hold') und rücken nach.
// Spezialangriffe werden angekündigt ('telegraph'), dann ausgeführt ('special'). Denken 4× pro Sekunde (versetzt),
// Bewegen jeden Schritt mit Trägheit. Pro Schritt keine Speicher-Neuanlage (nur seltene Ereignis-Nutzlasten).
import {
  SAFE_RADIUS, FLEE_DONE_DIST, LEASH_PROVOKED, WANDER_RADIUS, WANDER_SPEED,
  ENEMY_STEER, ENEMY_ACCEL, ENEMY_TURN, THIEF_RANGE, WRECK_PICKUP, SEP_QUERY, SEP_GAP, STAGGER_DECAY,
  ELITE_NOTICE, THINK_INTERVAL, ATTACK_BUDGET, TOKEN_ROTATE, HOLD_RING, RING_SPIN, SPECIAL_GAP, DASH_ACCEL,
  JINK_TIME, RETREAT_MAX, RETREAT_HEAL_TO, RETREAT_SHIELD_REGEN, RETREAT_HULL_REGEN, CALL_RANGE, CALL_COOLDOWN,
  CALL_GAP, AMBUSH_RANGE, AMBUSH_LEASH, AMBUSH_DIST, COVER_SEARCH, DODGE_COOLDOWN,
} from './config.js';
import { ENEMIES, SPECIALS } from '../core/data.js';
import { turnToward, headingOf, wrapAngle, rollDamage } from './combat.js';
import { leaderOf, slotPos, slotGap } from './spawn.js';

const near = [];          // wiederverwendete Trefferliste für die Nachbarsuche
const rocks = [];         // wiederverwendete Trefferliste für Brocken
const SLOT = { x: 0, z: 0 };
const ENG = [];           // Regie: Gegner im Kampf gegen den Spieler
const RING = [];          // Regie: aktive Angreifer (Flankenwinkel)
const MV = { tx: 0, tz: 0, fx: 0, fz: 0, face: false, accel: 1, vmax: 1.15, steer: 1 };
const TAU = Math.PI * 2;
const NO_AI = { style: 'pack', orbit: 0.7, special: null, specialCd: [8, 12], retreatHp: 0, cover: false, call: false, guard: false, dodge: 0.3 };

// Anzeige-Texte (e.tactic, für Test-Pilot und Entwickler; Spieler sieht sie nicht)
const T = {
  pack: 'flanke', swarm: 'umzingeln', kite: 'aus der ferne', keep: 'abstand halten', ambush: 'springt an', thief: 'angriff',
  hold: 'wartet im kreis', stalk: 'lauert getarnt', retreat: 'rückzug zum heilen', cover: 'deckung (heilt)',
  lootRun: 'flieht mit beute', convoy: 'überfällt konvoi', sight: 'sucht schusslinie', focus: 'feuerfokus schwächstes ziel',
  loot: 'holt beute',
};
const CHARGE_T = { volley: 'lädt salve', ram: 'lädt rammangriff', leap: 'lädt sprungbiss', acid: 'lädt säurewolke', guard: 'schildwall' };
const EXEC_T = { volley: 'salve', ram: 'rammt', leap: 'springt', acid: 'säurewolke', guard: 'schildwall' };

export function aiOf(e) { return e.def.ai || NO_AI; }
/** Im Kampf (aktiv angreifend oder wartend im Kreis). */
export function engaged(e) { return e.state === 'attack' || e.state === 'hold'; }

/** Ziel zum Umherschweben in der Nähe des Heimatpunkts wählen (nie in der sicheren Zone). Für Gegner ohne Rudel. */
export function pickWander(w, e) {
  const st = w.station;
  const lim = w.sector.size * 0.92;
  const R = e.wanderR || WANDER_RADIUS;
  for (let i = 0; i < 12; i++) {
    const a = w.rng.next() * Math.PI * 2;
    const r = w.rng.next() * R;
    let x = e.homeX + Math.cos(a) * r;
    let z = e.homeZ + Math.sin(a) * r;
    if (x > lim) x = lim; else if (x < -lim) x = -lim;
    if (z > lim) z = lim; else if (z < -lim) z = -lim;
    if (st) {
      const dx = x - st.x, dz = z - st.z;
      if (dx * dx + dz * dz < (SAFE_RADIUS + 250) * (SAFE_RADIUS + 250)) continue;
    }
    e.wx = x; e.wz = z;
    return;
  }
  e.wx = e.homeX; e.wz = e.homeZ;
}

/**
 * Angriff beginnen. Gegen den Spieler zuerst 'hold' (wartet im Kreis), die Regie vergibt die Angriffsplätze;
 * gegen andere Ziele (Frachter) sofort 'attack'. targetId vorher setzen.
 */
export function beginAttack(w, e) {
  if (engaged(e)) return;
  e.state = e.targetId === 'player' ? 'hold' : 'attack';
  e.token = false; e.tokenT = 0;
  e.stalk = false;
  e.orbitDir = w.rng.sign();
  e.orbitK = w.rng.range(0.55, 0.9);
  if (e.spCd < 1.5) e.spCd = 1.5 + w.rng.next() * 2; // erst ein paar normale Schüsse, dann der Spezialangriff
  // erster Schuss leicht versetzt, nie alle im Gleichtakt
  if (e.fireCd < 0.15) e.fireCd = 0.15 + w.rng.next() * 0.8;
}

// ───────────────────────── Kampf-Regie ─────────────────────────

/**
 * Alle THINK_INTERVAL Sekunden (aus world._step): Angriffsplätze vergeben. Bevorzugt: das Ziel des Spielers (immer),
 * Alpha, wer schon angreift (bis TOKEN_ROTATE), wer gerade getroffen wurde, wer nah ist. Danach die aktiven Angreifer
 * gleichmäßig um den Spieler verteilen (Angriff von mehreren Seiten, Ring dreht sich langsam).
 */
export function directCombat(w) {
  const p = w.player;
  const en = w.enemies;
  ENG.length = 0;
  for (let i = 0; i < en.length; i++) {
    const e = en[i];
    if (!e.alive || e.targetId !== 'player' || !engaged(e)) { if (e.token) e.token = false; continue; }
    ENG.push(e);
  }
  const n = ENG.length;
  if (!n) { if (w.rng.next() < 0.02) w._ringDir = -w._ringDir; return; }
  const tgtId = p.targetId;
  const pool = p.hpMax + p.shieldMax || 1;
  const budget = (p.hp + p.shield) / pool > 0.5 ? ATTACK_BUDGET[1] : ATTACK_BUDGET[0];
  const t = w.time;
  for (let i = 0; i < n; i++) {
    const e = ENG[i];
    const dx = e.x - p.x, dz = e.z - p.z;
    let s = -Math.sqrt(dx * dx + dz * dz) / 400;
    if (e.token) s += e.tokenT > TOKEN_ROTATE && e.id !== tgtId ? -4 : 3;
    if (e.id === tgtId) s += 100;
    if (e.rank === 'alpha') s += 40; else if (e.rank === 'elite') s += 2;
    if (t - e.hitAt < 3) s += 4;
    if (t - e.pounceAt < 3) s += 8;
    e.dirScore = s;
  }
  // nach Wert sortieren (Einfügen, kleine Liste, keine Speicher-Neuanlage)
  for (let i = 1; i < n; i++) {
    const e = ENG[i];
    let j = i - 1;
    while (j >= 0 && ENG[j].dirScore < e.dirScore) { ENG[j + 1] = ENG[j]; j--; }
    ENG[j + 1] = e;
  }
  let used = 0;
  RING.length = 0;
  for (let i = 0; i < n; i++) {
    const e = ENG[i];
    const wgt = e.rank === 'alpha' ? 2 : e.rank === 'elite' ? 1.5 : 1;
    if (e.state === 'attack' && !e.token && e.spPhase) { RING.push(e); used += wgt; continue; }
    if (i === 0 || e.id === tgtId || used + wgt <= budget + 1e-9) {
      used += wgt;
      if (!e.token) {
        e.token = true; e.tokenT = 0;
        if (e.state === 'hold') { e.state = 'attack'; e.tactic = null; if (e.fireCd < 0.2) e.fireCd = 0.2 + w.rng.next() * 0.6; }
      }
      RING.push(e);
    } else if (e.token || e.state === 'attack') {
      e.token = false; e.tokenT = 0;
      if (e.spPhase === 1) cancelSpecial(w, e);
      if (!e.spPhase) { e.state = 'hold'; e.tactic = T.hold; }
    }
  }
  // Flanken: Sollwinkel gleichmäßig verteilt, Versatz so gewählt, dass alle möglichst wenig umfliegen müssen
  const m = RING.length;
  for (let i = 0; i < m; i++) { const e = RING[i]; e.dirA = Math.atan2(e.z - p.z, e.x - p.x); }
  for (let i = 1; i < m; i++) {
    const e = RING[i];
    let j = i - 1;
    while (j >= 0 && RING[j].dirA > e.dirA) { RING[j + 1] = RING[j]; j--; }
    RING[j + 1] = e;
  }
  let sx = 0, sz = 0;
  const stepA = m > 0 ? TAU / m : 0;
  for (let i = 0; i < m; i++) { const a = RING[i].dirA - i * stepA; sx += Math.cos(a); sz += Math.sin(a); }
  const off = Math.atan2(sz, sx);
  for (let i = 0; i < m; i++) RING[i].flankA = m > 1 ? off + i * stepA : RING[i].dirA;
  w._flankT = t;
}

// ───────────────────────── Denken ─────────────────────────

/** Zustand neu bewerten (alle THINK_INTERVAL Sekunden). */
export function thinkEnemy(w, e) {
  const p = w.player;
  const def = e.def;
  const ai = aiOf(e);
  const dx = p.x - e.x, dz = p.z - e.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const playerOk = w.playerTargetable();
  const beh = e.behavior || def.behavior;

  // Rudelführer verteilt die Formationsplätze neu (falls jemand fehlt)
  const g = e.group;
  if (g && leaderOf(g) === e) {
    let k = 1;
    for (let i = 0; i < g.members.length; i++) { const m = g.members[i]; if (m !== e && m.alive) m.slot = k++; }
  }

  // Elite in der Nähe: Funkmeldung (einmal je Leben)
  if (e.rank !== 'normal' && !e.noticed && playerOk && d < ELITE_NOTICE) w.noticeVariant(e, d);

  if (e.spPhase) return; // Spezialangriff läuft: nicht umentscheiden

  if (e.state === 'flee') { thinkRetreat(w, e, d, playerOk); return; }

  // Rückzug zum Heilen (einmal je Leben)
  if (engaged(e) && e.targetId === 'player' && ai.retreatHp > 0 && e.rank !== 'alpha' && !e.retreated && e.hp < e.hpMax * ai.retreatHp) {
    startRetreat(w, e, false);
    return;
  }

  // Dieb: fliegt zu Wracks (nur wenn nicht gerade selbst angegriffen)
  if (beh === 'thief' && !e.provoked) {
    if (e.state === 'loot') {
      const wr = w.entities.get(e.lootId);
      if (wr && wr.alive && wr.kind === 'wreck' && w.wreckStealable(wr)) return;
      e.lootId = null;
      e.state = 'wander';
    }
    const wr = w.findStealableWreck(e.x, e.z, THIEF_RANGE);
    if (wr) {
      e.state = 'loot';
      e.lootId = wr.id;
      e.attacking = false;
      e.targetId = null;
      e.tactic = T.loot;
      return;
    }
  }

  let hostile = false, pounce = false, focus = false;
  // eigene Tarnung (TRN): nur wer schon angegriffen wurde, sieht dich · EMP/Störmine: keine Zielerfassung
  const seen = playerOk && !(w.cloaked && !e.provoked) && !(e.jamT > 0);
  if (e.jamT > 0) e.tactic = 'gestört';
  if (seen) {
    const aggro = e.aggro != null ? e.aggro : def.aggroRange;
    const pf = (p.hp + p.shield) / (p.hpMax + p.shieldMax || 1);
    switch (beh) {
      case 'passive': hostile = e.provoked; break;
      case 'opportunist': {
        // Jackal: lauert und springt an, wenn du angeschlagen bist oder mit anderen kämpfst
        const busy = p.attacking && p.targetId && p.targetId !== e.id && w.inCombat;
        hostile = e.provoked || (d < aggro && pf < 0.7);
        if (!hostile && e.stalk && d < aggro * 1.6 && (pf < 0.7 || busy)) { hostile = true; pounce = true; }
        break;
      }
      default: hostile = e.provoked || d < aggro; // aggressive, territorial, thief
    }
    if (hostile) {
      const leash = e.provoked ? LEASH_PROVOKED : aggro * 1.8 + 200;
      if (d > leash && !pounce) hostile = false;
    }
    // Feuerfokus: Konvoi-Piraten wechseln auf dich, wenn du das schwächere Ziel bist
    if (!hostile && e.huntId && d < 1000) {
      const h = w.entities.get(e.huntId);
      if (h && h.alive && pf < (h.hp + h.shield) / (h.hpMax + h.shieldMax || 1)) { hostile = true; focus = true; e.provoked = true; }
    }
  }

  if (hostile) {
    if (e.targetId !== 'player') { e.targetId = 'player'; e.state = 'wander'; }
    beginAttack(w, e);
    e.attacking = true;
    e.stalk = false;
    if (pounce) { e.pounceAt = w.time; e.provoked = true; if (e.spCd > 0.3) e.spCd = 0.3; }
    e.losBad = w.losBlocked(e.x, e.z, p.x, p.z, 4);
    if (ai.call) tryCall(w, e);
    if (e.state === 'attack') trySpecial(w, e, d);
    if (!e.spPhase) e.tactic = tacticOf(e, ai, d, focus);
    // ausweichen, wenn der Spieler auf ihn feuert (vorausschauend, nicht nur nach Treffern)
    if (p.targetId === e.id && p.attacking && e.dodgeCd <= 0 && d < 750 && w.rng.next() < ai.dodge * 0.22) jink(w, e, dx / (d || 1), dz / (d || 1));
    return;
  }
  // Konvoi-Überfall: Frachter angreifen, solange er lebt
  if (e.huntId) {
    const h = w.entities.get(e.huntId);
    if (h && h.alive) {
      if (e.targetId !== e.huntId) { e.state = 'wander'; e.targetId = e.huntId; beginAttack(w, e); }
      e.attacking = true;
      e.tactic = T.convoy;
      return;
    }
    e.huntId = null;
  }
  if (engaged(e) || e.state === 'loot') calmDown(w, e);

  // Jackal: getarnt lauern, solange du in der Nähe bist (nicht zu weit vom Revier)
  if (ai.style === 'ambush' && e.state === 'wander') {
    const hx = e.x - e.homeX, hz = e.z - e.homeZ;
    const can = seen && d < AMBUSH_RANGE && hx * hx + hz * hz < AMBUSH_LEASH * AMBUSH_LEASH;
    if (can !== e.stalk) { e.stalk = can; e.tactic = can ? T.stalk : null; }
  }
}

function tacticOf(e, ai, d, focus) {
  if (e.state === 'hold') return T.hold;
  if (focus) return T.focus;
  if (e.losBad) return T.sight;
  switch (ai.style) {
    case 'swarm': return T.swarm;
    case 'kite': return d < e.def.range * ai.orbit * 0.7 ? T.keep : T.kite;
    case 'ambush': return T.ambush;
    case 'thief': return T.thief;
    default: return T.pack;
  }
}

/** Nest (steht still): spuckt Säure auf dich, wenn du es angreifst und nah bist. */
export function thinkNest(w, e) {
  if (e.spPhase || !e.provoked || !w.playerTargetable()) return;
  const ai = aiOf(e);
  const p = w.player;
  const dx = p.x - e.x, dz = p.z - e.z;
  if (dx * dx + dz * dz > (ai.spRange || 900) ** 2) return;
  if (e.spCd > 0 || w.time < w._spNext) return;
  startSpecial(w, e, 'acid');
}

/** Zurück zur Patrouille, Aggro vergessen. */
export function calmDown(w, e) {
  cancelSpecial(w, e);
  e.state = 'wander';
  e.attacking = false;
  e.targetId = null;
  e.provoked = false;
  e.lootId = null;
  e.waitT = 0;
  e.token = false; e.tokenT = 0;
  e.stalk = false;
  e.tactic = null;
  e.hasCover = false; e.healing = false;
  e.losBad = false;
  if (!e.group) pickWander(w, e);
}

// ───────────────────────── Rückzug, Deckung, Verstärkung, Ausweichen ─────────────────────────

/** Rückzug: weg vom Spieler, Deckungs-Typen hinter einen Asteroiden. lootRun = Dieb flieht mit Beute. */
function startRetreat(w, e, lootRun) {
  cancelSpecial(w, e);
  e.state = 'flee';
  e.retreated = true;
  e.retreatT = 0;
  e.lootRun = lootRun;
  e.token = false; e.tokenT = 0;
  e.attacking = false;
  e.targetId = null;
  e.healing = false;
  e.hasCover = aiOf(e).cover && findCover(w, e);
  e.tactic = lootRun ? T.lootRun : e.hasCover ? T.cover : T.retreat;
}

function thinkRetreat(w, e, d, playerOk) {
  e.retreatT += THINK_INTERVAL;
  if (!playerOk) { calmDown(w, e); return; }
  if (e.lootRun) { if (e.retreatT > 6) calmDown(w, e); return; }
  const p = w.player;
  // in Sicherheit (Deckung oder weit weg) → heilen
  e.healing = d > 900 || w.losBlocked(e.x, e.z, p.x, p.z, 0);
  if (e.hasCover && (e.retreatT % 1) < THINK_INTERVAL) e.hasCover = findCover(w, e);
  const healed = e.shield >= e.shieldMax * 0.9 && e.hp >= e.hpMax * RETREAT_HEAL_TO - 1;
  // geheilt, zu lange weg oder gestellt (Spieler direkt dran) → zurück in den Kampf
  if (healed || e.retreatT > RETREAT_MAX || (d < 260 && e.retreatT > 1.5)) {
    e.healing = false; e.hasCover = false;
    e.state = 'wander'; e.targetId = 'player'; e.provoked = true;
    beginAttack(w, e);
    e.attacking = true;
    e.tactic = T.hold;
    return;
  }
  if (d > FLEE_DONE_DIST * 1.6) calmDown(w, e);
}

/** Deckung: Punkt hinter einem Asteroiden (vom Spieler aus gesehen) → e.coverX/coverZ. */
function findCover(w, e) {
  const p = w.player;
  const rs = w.rocks;
  let best = -1, bx = 0, bz = 0;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    const ex = r.x - e.x, ez = r.z - e.z;
    if (ex * ex + ez * ez > COVER_SEARCH * COVER_SEARCH) continue;
    let ox = r.x - p.x, oz = r.z - p.z;
    const od = Math.sqrt(ox * ox + oz * oz) || 1;
    if (od < r.radius + 250) continue; // Spieler klebt am Brocken: keine Deckung
    ox /= od; oz /= od;
    const k = r.radius + e.radius + 45;
    const cx = r.x + ox * k, cz = r.z + oz * k;
    const dx = cx - e.x, dz = cz - e.z;
    const s = dx * dx + dz * dz;
    if (best < 0 || s < best) { best = s; bx = cx; bz = cz; }
  }
  if (best < 0) return false;
  e.coverX = bx; e.coverZ = bz;
  return true;
}

/** Verstärkung: nächstes ruhiges Rudel derselben Gruppe (Piraten/Schwarm) kommt zu Hilfe. */
function tryCall(w, e) {
  const g = e.group;
  if (!g || e.evTag) return;
  const t = w.time;
  if (t < (g.calledAt || -999) + CALL_COOLDOWN || t < w._callNext) return;
  let alive = 0;
  for (let i = 0; i < g.members.length; i++) if (g.members[i].alive) alive++;
  if (alive >= g.members.length && e.hp >= e.hpMax * 0.6) return; // erst wenn es wehtut
  g.calledAt = t;
  let best = null, bd = CALL_RANGE * CALL_RANGE;
  const gs = w.groups;
  for (let i = 0; i < gs.length; i++) {
    const o = gs[i];
    if (o === g) continue;
    const L = leaderOf(o);
    if (!L || L.provoked || engaged(L) || L.evTag || L.def.group !== e.def.group || L.state === 'flee') continue;
    const dx = L.x - e.x, dz = L.z - e.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bd && d2 > 300 * 300) { bd = d2; best = L; }
  }
  if (!best) return;
  w._callNext = t + CALL_GAP;
  let n = 0;
  for (let i = 0; i < best.group.members.length; i++) if (best.group.members[i].alive) n++;
  w.provoke(best);
  const km = (Math.sqrt(bd) / 1000).toFixed(1).replace('.', ',');
  w.bus.emit('reinforce', { id: e.id, x: e.x, z: e.z, fromX: best.x, fromZ: best.z, count: n, enemyType: best.type });
  w._msg(`${e.name} ruft Verstärkung: ${n} ${ENEMIES[best.type].name} im Anflug aus ${km} km.`, 'warn', 'reinforce', 8);
}

/** Seitliches Ausweichmanöver (Trefferchance des Spielers sinkt solange auf JINK_HIT). dx/dz = Richtung zum Schützen. */
export function jink(w, e, dx, dz) {
  if (e.def.speed <= 0 || e.spPhase) return;
  const side = w.rng.sign();
  e.jinkX = -dz * side; e.jinkZ = dx * side;
  e.jinkT = JINK_TIME;
  e.dodgeCd = w.rng.range(DODGE_COOLDOWN[0], DODGE_COOLDOWN[1]);
}

// ───────────────────────── Spezialangriffe ─────────────────────────

function trySpecial(w, e, d) {
  const ai = aiOf(e);
  const kind = ai.special;
  if (!kind || kind === 'guard') return false;
  if (e.spPhase || e.spCd > 0 || w.time < w._spNext || !e.token || e.state !== 'attack' || e.targetId !== 'player') return false;
  if (e.stagger > 0.5 || e.losBad || !w.playerTargetable()) return false;
  const r = e.def.range;
  switch (kind) {
    case 'volley': if (d > r * 1.25 || d < 120) return false; break;
    case 'ram': if (d > 760 || d < 180) return false; break;
    case 'leap': if (d > 340 || d < 60) return false; break;
    case 'acid': if (d > r * 1.15) return false; break;
    default: return false;
  }
  startSpecial(w, e, kind);
  return true;
}

/** Aufladen beginnen: Geometrie festlegen und ankündigen ('telegraph'). */
function startSpecial(w, e, kind) {
  const S = SPECIALS[kind];
  const p = w.player;
  e.spK = kind; e.spPhase = 1; e.spT = S.delay; e.spHit = false; e.charge = 0;
  // gezielt wird auf die vorausberechnete Position: wer stur geradeaus fliegt, wird getroffen; wer Kurs oder Tempo ändert, nicht
  const lead = S.lead != null ? S.lead : 0;
  let dx = p.x + p.vx * lead - e.x, dz = p.z + p.vz * lead - e.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  dx /= d; dz /= d;
  let x = e.x, z = e.z, radius = 0, length = 0;
  switch (kind) {
    case 'volley': radius = S.width; length = e.def.range * S.rangeK; break;
    case 'ram': case 'leap': radius = e.radius + S.width; length = d + S.over; break;
    case 'acid': x = p.x + p.vx * lead; z = p.z + p.vz * lead; radius = S.radius; dx = 0; dz = 0; break;
    case 'guard': radius = e.radius * 1.8; dx = 0; dz = 0; break;
  }
  e.spX = x; e.spZ = z; e.spDx = dx; e.spDz = dz; e.spR = radius; e.spLen = length;
  e.spAx = x + dx * d; e.spAz = z + dz * d; // Zielpunkt der Linie
  if (kind !== 'guard') w._spNext = w.time + SPECIAL_GAP;
  e.tactic = CHARGE_T[kind];
  w.bus.emit('telegraph', { id: e.id, kind, x, z, dx, dz, delay: S.delay, radius, length, enemyType: e.type });
}

/** Aufladen abbrechen (Treffer, Tod, Aggro weg). Meldet 'special' mit cancelled: true. */
export function cancelSpecial(w, e) {
  if (!e.spPhase) return;
  if (e.spPhase === 1) w.bus.emit('special', { id: e.id, kind: e.spK, cancelled: true, x: e.x, z: e.z, dx: e.spDx, dz: e.spDz, radius: e.spR, length: e.spLen, duration: 0 });
  endSpecial(w, e);
  if (e.spCd < 2.5) e.spCd = 2.5;
}

function endSpecial(w, e) {
  const ai = aiOf(e);
  const cd = ai.specialCd || NO_AI.specialCd;
  if (e.spK !== 'guard') e.spCd = w.rng.range(cd[0], cd[1]) * (e.rank === 'alpha' ? 0.6 : e.rank === 'elite' ? 0.75 : 1);
  e.spPhase = 0; e.spK = null; e.charge = 0; e.spT = 0;
  e.tactic = null;
}

/** Ausführen (nach dem Aufladen). */
function execSpecial(w, e) {
  const S = SPECIALS[e.spK];
  e.spPhase = 2;
  e.charge = 0;
  e.tactic = EXEC_T[e.spK];
  let duration = 0;
  switch (e.spK) {
    case 'volley': e.spN = S.shots; e.spT = 0; duration = S.shots * S.gap; break;
    case 'ram': case 'leap': {
      // Sturz vom aktuellen Ort genau auf den angekündigten Zielpunkt (Abdrift beim Aufladen ausgleichen)
      let dx = e.spAx - e.x, dz = e.spAz - e.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      dx /= d; dz /= d;
      e.spDx = dx; e.spDz = dz; e.spX = e.x; e.spZ = e.z; e.spLen = d + S.over;
      e.spT = S.time; duration = S.time;
      break;
    }
    case 'acid': {
      const base = aiOf(e).spDamage || e.def.damage;
      w.addHazard('acid', e.spX, e.spZ, S.radius, S.duration, base * e.dmgMult * S.dps, e.id);
      duration = S.duration;
      break;
    }
    case 'guard': e.guardT = S.duration; e.guard = 1; duration = S.duration; break;
  }
  w.bus.emit('special', { id: e.id, kind: e.spK, cancelled: false, x: e.spK === 'acid' ? e.spX : e.x, z: e.spK === 'acid' ? e.spZ : e.z, dx: e.spDx, dz: e.spDz, radius: e.spR, length: e.spLen, duration });
  if (e.spK === 'acid' || e.spK === 'guard') endSpecial(w, e);
}

/** Ein Schuss der Salve entlang der festen Linie: trifft nur, wer noch im Korridor ist. */
function volleyShot(w, e) {
  const S = SPECIALS.volley;
  const p = w.player;
  const dx = e.spDx, dz = e.spDz;
  // Gefahrenzone = angekündigter Korridor (Ursprung und Richtung beim Aufladen festgelegt)
  const rx = p.x - e.spX, rz = p.z - e.spZ;
  const along = rx * dx + rz * dz;
  const perp = Math.abs(rx * dz - rz * dx);
  const hit = w.playerTargetable() && along > -p.radius && along < e.spLen && perp < e.spR + p.radius && !w.losBlocked(e.x, e.z, p.x, p.z, 0);
  let hx, hz;
  if (hit) { hx = p.x - dx * p.radius * 0.7; hz = p.z - dz * p.radius * 0.7; }
  else { const a = along > 0 && along < e.spLen ? along : e.spLen; hx = e.spX + dx * a; hz = e.spZ + dz * a; }
  w.bus.emit('shot', { from: e.id, to: 'player', laser: null, ammo: null, hit, enemyType: e.type, special: 'volley', x: hx, z: hz, dx, dz });
  if (hit) w.specialHit(e, rollDamage(w.rng, e.def.damage, e.dmgMult * S.dmg), dx, dz, hx, hz, 'volley');
}

/** Spezialangriff für einen Schritt; schreibt Bewegungswunsch nach MV. true = Bewegung übernommen. */
function runSpecial(w, e, dt, speed) {
  const S = SPECIALS[e.spK];
  const p = w.player;
  if (e.spPhase === 1) {
    e.spT -= dt;
    let c = 1 - e.spT / S.delay; if (c > 1) c = 1; else if (c < 0) c = 0;
    e.charge = c;
    // beim Aufladen abbremsen und ausrichten (Ramm-/Sprungangriff: leicht zurückziehen wie zum Sprung)
    const back = e.spK === 'ram' || e.spK === 'leap' ? -0.22 : 0;
    MV.tx = e.spDx * speed * back; MV.tz = e.spDz * speed * back; MV.steer = 2.5;
    if (e.spK === 'acid' || e.spK === 'guard') { MV.fx = p.x - e.x; MV.fz = p.z - e.z; }
    else { MV.fx = e.spDx; MV.fz = e.spDz; }
    MV.face = true;
    if (e.spT <= 0) execSpecial(w, e);
    return true;
  }
  // Ausführung
  if (e.spK === 'volley') {
    e.spT -= dt;
    while (e.spT <= 0 && e.spN > 0) { volleyShot(w, e); e.spN--; e.spT += S.gap; }
    MV.tx = 0; MV.tz = 0; MV.fx = e.spDx; MV.fz = e.spDz; MV.face = true; MV.steer = 2.5;
    if (e.spN <= 0) endSpecial(w, e);
    return true;
  }
  // Ramm-/Sprungangriff
  e.spT -= dt;
  MV.tx = e.spDx * speed * S.speedK; MV.tz = e.spDz * speed * S.speedK;
  MV.fx = e.spDx; MV.fz = e.spDz; MV.face = true;
  MV.accel = DASH_ACCEL; MV.vmax = S.speedK * 1.02; MV.steer = 8;
  if (!e.spHit && w.playerTargetable()) {
    const ox = p.x - e.x, oz = p.z - e.z;
    const lim = e.radius + S.width + p.radius;
    if (ox * ox + oz * oz < lim * lim) {
      e.spHit = true;
      const hx = p.x - e.spDx * p.radius * 0.7, hz = p.z - e.spDz * p.radius * 0.7;
      w.specialHit(e, rollDamage(w.rng, e.def.damage, e.dmgMult * S.dmg), e.spDx, e.spDz, hx, hz, e.spK);
      w.knockPlayer(e.spDx, e.spDz, S.knock);
    }
  }
  const prog = (e.x - e.spX) * e.spDx + (e.z - e.spZ) * e.spDz;
  if (e.spT <= 0 || prog > e.spLen || e.spHit) endSpecial(w, e);
  return true;
}

/** Schildwall prüfen (aus world._hitEnemy nach Schaden): Vulture und Elite-/Alpha-Piraten bei schwerem Beschuss. */
export function tryGuard(w, e) {
  if (!e.alive || e.guardT > 0 || e.guardCd > 0 || e.spPhase) return;
  const ai = aiOf(e);
  if (!ai.guard && !(e.rank !== 'normal' && e.def.group === 'pirate')) return;
  const S = SPECIALS.guard;
  if (e.dmgWin < S.trigger * (e.hpMax + e.shieldMax)) return;
  e.guardCd = w.rng.range(S.cd[0], S.cd[1]);
  startSpecial(w, e, 'guard');
}

// ───────────────────────── Bewegen ─────────────────────────

/** Bewegung, Feuern und Ausweichen für einen Schritt. */
export function moveEnemy(w, e, dt) {
  const def = e.def;
  const ai = aiOf(e);
  const p = w.player;
  if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) { e.slowT = 0; e.slowK = 1; } }
  if (e.jamT > 0) { e.jamT -= dt; if (e.jamT < 0) e.jamT = 0; }
  const speed = def.speed * (e.slowT > 0 ? e.slowK : 1); // Bremsmine

  e.fireCd -= dt;
  if (e.fireCd < 0 && e.state !== 'attack') e.fireCd = 0;
  if (e.dodgeCd > 0) e.dodgeCd -= dt;
  if (e.spCd > 0) e.spCd -= dt;
  if (e.guardCd > 0) e.guardCd -= dt;
  if (e.guardT > 0) { e.guardT -= dt; if (e.guardT <= 0) { e.guardT = 0; e.guard = 0; } }
  if (e.dmgWin > 0) { e.dmgWin -= e.dmgWin * 0.5 * dt; if (e.dmgWin < 1) e.dmgWin = 0; }
  if (e.token) e.tokenT += dt;
  // Tarnung (Jackal beim Lauern): weich ein- und ausblenden
  const cl = e.stalk && e.state === 'wander' && !e.spPhase ? 1 : 0;
  if (cl !== e.cloak) {
    e.cloak += (cl > e.cloak ? 1.2 : -3) * dt;
    if (e.cloak < 0) e.cloak = 0; else if (e.cloak > 1) e.cloak = 1;
  }
  // Heilen beim Rückzug (in Deckung oder weit weg)
  if (e.healing) {
    if (e.shield < e.shieldMax) { e.shield += e.shieldMax * RETREAT_SHIELD_REGEN * dt; if (e.shield > e.shieldMax) e.shield = e.shieldMax; }
    const cap = e.hpMax * RETREAT_HEAL_TO;
    if (e.hp < cap) { e.hp += e.hpMax * RETREAT_HULL_REGEN * dt; if (e.hp > cap) e.hp = cap; }
  }

  MV.tx = 0; MV.tz = 0; MV.face = false; MV.accel = ENEMY_ACCEL; MV.vmax = 1.15; MV.steer = 1;
  if (speed <= 0) {
    if (e.spPhase) runSpecial(w, e, dt, 0);
    e.vx = 0; e.vz = 0; e.speed = 0; e.thrust = 0; decay(e, dt);
    return;
  }
  let special = false;
  if (e.spPhase) special = runSpecial(w, e, dt, speed);

  if (!special) switch (e.state) {
    case 'attack':
    case 'hold': {
      const tgt = e.targetId === 'player' ? p : w.entities.get(e.targetId);
      if (!tgt || !tgt.alive) { calmDown(w, e); break; }
      const ox = e.x - tgt.x, oz = e.z - tgt.z;
      const d = Math.sqrt(ox * ox + oz * oz) || 1;
      const nx = ox / d, nz = oz / d;
      const hold = e.state === 'hold';
      let R;
      if (hold) R = Math.max(def.range * 1.55, HOLD_RING) + e.orbitK * 160;
      else if (ai.style === 'kite') R = def.range * ai.orbit;
      else R = Math.max(def.range * ai.orbit * (0.9 + (e.orbitK - 0.7) * 0.6), tgt.radius + e.radius + 50);
      let radial = (R - d) / (R * 0.5);
      if (radial > 1) radial = 1; else if (radial < -1) radial = -1;
      if (!hold && ai.style === 'kite' && d < R * 0.7) radial = 1; // zu nah: Abstand halten
      let tang;
      if (e.token && e.targetId === 'player') {
        // Flanke: Sollwinkel im Ring, der sich langsam um den Spieler dreht
        const a = Math.atan2(nz, nx);
        const want = e.flankA + w._ringDir * RING_SPIN * (w.time - w._flankT);
        let err = wrapAngle(want - a) * 2;
        if (err > 0.9) err = 0.9; else if (err < -0.9) err = -0.9;
        tang = err + w._ringDir * Math.min(0.5, RING_SPIN * R / speed);
      } else if (hold && e.targetId === 'player') tang = 0.35 * w._ringDir; // Wartering dreht in eine Richtung: keine Kreuzungen
      else tang = 0.65 * e.orbitDir;
      if (e.losBad) { tang = 0.9 * e.orbitDir; radial *= 0.5; } // Asteroid im Weg: zur Seite, freie Schusslinie suchen
      let tx = (nx * radial - nz * tang) * speed;
      let tz = (nz * radial + nx * tang) * speed;
      const cap = hold ? speed * 0.7 : speed;
      const l = Math.sqrt(tx * tx + tz * tz);
      if (l > cap) { tx = tx / l * cap; tz = tz / l * cap; }
      MV.tx = tx; MV.tz = tz;
      if (d <= Math.max(def.range * 1.3, R + 120)) { MV.face = true; MV.fx = -ox; MV.fz = -oz; }
      if (!hold && d <= def.range + tgt.radius && e.fireCd <= 0 && !e.losBad) {
        w.enemyFire(e, tgt);
        const iv = (1 / def.fireRate) * (0.85 + w.rng.next() * 0.3); // nie im Gleichtakt
        e.fireCd += iv;
        if (e.fireCd < 0) e.fireCd = iv;
      }
      break;
    }
    case 'flee': {
      if (e.hasCover) {
        const ox = e.coverX - e.x, oz = e.coverZ - e.z;
        const d = Math.sqrt(ox * ox + oz * oz) || 1;
        const s = d < 120 ? speed * d / 120 : speed;
        MV.tx = ox / d * s; MV.tz = oz / d * s;
        if (d < 150) { MV.face = true; MV.fx = p.x - e.x; MV.fz = p.z - e.z; }
      } else {
        const ox = e.x - p.x, oz = e.z - p.z;
        const d = Math.sqrt(ox * ox + oz * oz) || 1;
        const s = d > 1100 ? speed * 0.35 : speed;
        MV.tx = ox / d * s; MV.tz = oz / d * s;
      }
      break;
    }
    case 'loot': {
      const wr = w.entities.get(e.lootId);
      if (!wr || !wr.alive) { e.state = 'wander'; e.lootId = null; break; }
      const ox = wr.x - e.x, oz = wr.z - e.z;
      const d = Math.sqrt(ox * ox + oz * oz) || 1;
      if (d < WRECK_PICKUP) {
        w.stealWreck(e, wr); e.lootId = null;
        startRetreat(w, e, true); e.retreated = false; // mit der Beute abhauen (zählt nicht als Heil-Rückzug)
        break;
      }
      const s = d < 150 ? speed * (0.3 + 0.7 * d / 150) : speed;
      MV.tx = ox / d * s; MV.tz = oz / d * s;
      break;
    }
    default: { // wander
      if (e.stalk) {
        // getarnt in Lauerstellung neben dem Spieler halten
        const ox = e.x - p.x, oz = e.z - p.z;
        const d = Math.sqrt(ox * ox + oz * oz) || 1;
        const px = p.x + ox / d * AMBUSH_DIST, pz = p.z + oz / d * AMBUSH_DIST;
        const qx = px - e.x, qz = pz - e.z;
        const q = Math.sqrt(qx * qx + qz * qz);
        const s = speed * 0.6 * (q < 150 ? q / 150 : 1);
        MV.tx = q > 1 ? qx / q * s - oz / d * speed * 0.15 * e.orbitDir : 0;
        MV.tz = q > 1 ? qz / q * s + ox / d * speed * 0.15 * e.orbitDir : 0;
        MV.face = true; MV.fx = -ox; MV.fz = -oz;
        break;
      }
      // Rudel folgt dem Anführer in Formation, der Anführer fliegt Wegpunkte ab
      const g = e.group;
      const L = g ? leaderOf(g) : null;
      if (L && L !== e && !engaged(L) && L.state !== 'flee') {
        slotPos(L, e.slot || 1, slotGap(e.radius), SLOT);
        const ox = SLOT.x - e.x, oz = SLOT.z - e.z;
        const d = Math.sqrt(ox * ox + oz * oz);
        if (d > 500) { MV.tx = ox / d * speed; MV.tz = oz / d * speed; }
        else {
          // Tempo des Anführers übernehmen und den Platz sanft einnehmen
          let tx = L.vx + ox * 0.9, tz = L.vz + oz * 0.9;
          const l = Math.sqrt(tx * tx + tz * tz);
          const cap = speed * 0.85;
          if (l > cap) { tx = tx / l * cap; tz = tz / l * cap; }
          MV.tx = tx; MV.tz = tz;
        }
        break;
      }
      if (g && g.wpN) {
        if (g.waitT > 0) { g.waitT -= dt; break; }
        const wx = g.wp[g.wpI * 2], wz = g.wp[g.wpI * 2 + 1];
        const ox = wx - e.x, oz = wz - e.z;
        const d = Math.sqrt(ox * ox + oz * oz);
        if (d < 60) {
          g.wpI = (g.wpI + 1) % g.wpN;
          g.waitT = w.rng.next() < 0.35 ? 1 + w.rng.next() * 2.5 : 0;
          break;
        }
        const s = speed * WANDER_SPEED * (d < 200 ? 0.4 + 0.6 * d / 200 : 1);
        MV.tx = ox / d * s; MV.tz = oz / d * s;
        break;
      }
      if (e.waitT > 0) { e.waitT -= dt; break; }
      const ox = e.wx - e.x, oz = e.wz - e.z;
      const d = Math.sqrt(ox * ox + oz * oz);
      if (d < 30) {
        e.waitT = 1 + w.rng.next() * 3;
        pickWander(w, e);
        break;
      }
      const s = speed * WANDER_SPEED;
      MV.tx = ox / d * s; MV.tz = oz / d * s;
    }
  }

  let tx = MV.tx, tz = MV.tz;
  const dash = MV.accel > ENEMY_ACCEL;

  // Ausweichmanöver: kurz seitlich wegziehen
  if (e.jinkT > 0) {
    e.jinkT -= dt;
    if (!dash) { tx += e.jinkX * speed * 0.95; tz += e.jinkZ * speed * 0.95; }
  }

  // Abstand zu anderen Gegnern halten (auch im Kampf: kein Übereinanderstapeln)
  const n = w.grid.query(e.x, e.z, SEP_QUERY + e.radius, near);
  for (let i = 0; i < n; i++) {
    const o = near[i];
    if (o === e || !o.alive) continue;
    let ox = e.x - o.x, oz = e.z - o.z;
    let d = Math.sqrt(ox * ox + oz * oz);
    const min = (e.radius + o.radius) * 1.6 + SEP_GAP;
    if (d >= min) continue;
    if (d < 0.01) { ox = e.orbitDir; oz = 0.3; d = 1; }
    const push = (min - d) / min * speed * 1.4;
    tx += ox / d * push; tz += oz / d * push;
  }

  // Brocken ausweichen (vorausschauend)
  const rn = w.rockGrid.query(e.x, e.z, e.radius + 260, rocks);
  for (let i = 0; i < rn; i++) {
    const r = rocks[i];
    const ox = e.x - r.x, oz = e.z - r.z;
    const d = Math.sqrt(ox * ox + oz * oz) || 1;
    const min = r.radius + e.radius + 35;
    if (d >= min + 90) continue;
    let k = (min + 90 - d) / 90; if (k > 1.5) k = 1.5;
    tx += ox / d * speed * k; tz += oz / d * speed * k;
  }

  // sichere Zone meiden
  const st = w.station;
  if (st) {
    const sx = e.x - st.x, sz = e.z - st.z;
    const ds = Math.sqrt(sx * sx + sz * sz) || 1;
    const lim = SAFE_RADIUS + e.radius + 40;
    if (ds < lim + 200) {
      const k = (lim + 200 - ds) / 200; // 0..1+
      tx += sx / ds * speed * k * 1.5;
      tz += sz / ds * speed * k * 1.5;
    }
  }

  // Karte nicht verlassen
  const lim = w.sector.size * 0.97;
  if (e.x > lim) tx -= speed; else if (e.x < -lim) tx += speed;
  if (e.z > lim) tz -= speed; else if (e.z < -lim) tz += speed;

  // Trägheit: weich lenken, Beschleunigung begrenzt
  const k = 1 - Math.exp(-ENEMY_STEER * MV.steer * dt);
  let ax = (tx - e.vx) * k, az = (tz - e.vz) * k;
  const al = Math.sqrt(ax * ax + az * az);
  const maxA = MV.accel * speed * dt;
  if (al > maxA) { ax = ax / al * maxA; az = az / al * maxA; }
  e.vx += ax; e.vz += az;
  let vl = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
  const vmax = speed * MV.vmax;
  if (vl > vmax) {
    // Überschuss (z. B. nach Treffer-Stoß oder Rammangriff) weich abbauen statt hart abschneiden
    let nv = vl - speed * 2 * dt;
    if (nv < vmax) nv = vmax;
    e.vx = e.vx / vl * nv; e.vz = e.vz / vl * nv;
    vl = nv;
  }
  e.x += e.vx * dt;
  e.z += e.vz * dt;
  e.speed = vl;
  let want = Math.sqrt(tx * tx + tz * tz) / speed;
  if (want > 1) want = 1;
  e.thrust += (want - e.thrust) * k * 2;

  // harte Grenzen: nie in die sichere Zone, nie in einen Brocken
  if (st) {
    const sx = e.x - st.x, sz = e.z - st.z;
    const ds = Math.sqrt(sx * sx + sz * sz) || 1;
    const lim2 = SAFE_RADIUS + e.radius;
    if (ds < lim2) { e.x = st.x + sx / ds * lim2; e.z = st.z + sz / ds * lim2; }
  }
  for (let i = 0; i < rn; i++) {
    const r = rocks[i];
    const ox = e.x - r.x, oz = e.z - r.z;
    const d = Math.sqrt(ox * ox + oz * oz) || 1;
    const min = r.radius + e.radius;
    if (d < min) { e.x = r.x + ox / d * min; e.z = r.z + oz / d * min; }
  }

  // Drehung (begrenzte Drehrate), dazu Taumeln nach Treffern; Schräglage aus der Kurvenrate
  const rot0 = e.rot - e.wob;
  if (MV.face) e.rot = turnToward(e.rot, headingOf(MV.fx, MV.fz), ENEMY_TURN * (dash ? 0.4 : 1) * dt);
  else if (vl > 8) e.rot = turnToward(e.rot, headingOf(e.vx, e.vz), ENEMY_TURN * dt);
  decay(e, dt);
  const wob = e.stagger > 0 ? Math.sin(w.time * 26 + e.phase) * 0.32 * e.stagger : 0;
  if (wob !== e.wob) { e.rot = wrapAngle(e.rot + wob - e.wob); e.wob = wob; }
  let tb = wrapAngle(e.rot - e.wob - rot0) / dt / ENEMY_TURN * 0.5;
  if (tb > 0.5) tb = 0.5; else if (tb < -0.5) tb = -0.5;
  e.bank += (tb - e.bank) * (1 - Math.exp(-5 * dt));
}

function decay(e, dt) {
  if (e.stagger > 0) { e.stagger -= STAGGER_DECAY * dt; if (e.stagger < 0) e.stagger = 0; }
}
