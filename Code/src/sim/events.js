// Sektor-Ereignisse: „Konvoi unter Beschuss“, „Treibgut-Feld“, „Schwarm-Nest“.
// Eines zur Zeit, zufällig alle paar Minuten. Funkmeldungen nennen Ort und Belohnung konkret.
// Anzeige-Feld world.event = null | { type, title, x, z, timeLeft, progress, total, targetId }
import { SECTOR_EVENTS, EVENT_FIRST, EVENT_INTERVAL, FACTIONS } from '../core/data.js';
import { EVENT_SPAWN_DIST, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL } from './config.js';
import { fmt, headingOf } from './combat.js';
import { pointOk, makeGroup, buildWaypoints } from './spawn.js';
import { beginAttack } from './ai.js';

const TYPES = Object.keys(SECTOR_EVENTS);

/** Nach Sektoraufbau: kein Ereignis, nächstes in EVENT_FIRST Sekunden. */
export function resetEvents(w) {
  w.event = null;
  w._ev = null;
  w._eventNextAt = w.time + w.rng.range(EVENT_FIRST[0], EVENT_FIRST[1]);
}

/** Belohnung je Sektor gestaffelt: × (1 + 0,6 × (Index − 1)). */
export function scaledReward(w, r) {
  const k = 1 + 0.6 * ((w.sector.index || 1) - 1);
  return {
    credits: Math.round((r.credits || 0) * k / 100) * 100,
    tritium: Math.round((r.tritium || 0) * k),
    xp: Math.round((r.xp || 0) * k / 100) * 100,
    honor: Math.round((r.honor || 0) * k),
  };
}

export function rewardText(r) {
  const parts = [];
  if (r.credits) parts.push(`${fmt(r.credits)} Credits`);
  if (r.tritium) parts.push(`${fmt(r.tritium)} Tritium`);
  if (r.xp) parts.push(`${fmt(r.xp)} Erfahrung`);
  if (r.honor) parts.push(`${fmt(r.honor)} Ehre`);
  return parts.join(', ');
}

/** Himmelsrichtung und Entfernung vom Spieler aus, z. B. „2,4 km nordöstlich“ (−z = Norden, +x = Osten). */
export function whereText(w, x, z) {
  const p = w.player;
  const dx = x - p.x, dz = z - p.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  const DIRS = ['nördlich', 'nordöstlich', 'östlich', 'südöstlich', 'südlich', 'südwestlich', 'westlich', 'nordwestlich'];
  let a = Math.atan2(dx, -dz); // 0 = Norden, im Uhrzeigersinn
  if (a < 0) a += Math.PI * 2;
  const i = Math.round(a / (Math.PI / 4)) % 8;
  return `${(d / 1000).toFixed(1).replace('.', ',')} km ${DIRS[i]}`;
}

function minutes(sec) {
  const m = sec / 60;
  return `${m % 1 ? m.toFixed(1).replace('.', ',') : m} Minuten`;
}

function radio(w, title, body, from = null) {
  const voice = from || FACTIONS[w.profile.faction].stationVoice;
  w.bus.emit('message', { text: `${voice}: ${body}`, kind: 'radio', from: voice, title });
}

/** Ereignisort: im Abstand EVENT_SPAWN_DIST zum Spieler, frei von Station/Toren/Brocken. → w._pt */
function eventPoint(w, fieldType) {
  const rng = w.rng, p = w.player;
  const fields = w.sector.fields || [];
  for (let tries = 0; tries < 60; tries++) {
    let x, z;
    if (fieldType && tries < 40) {
      let f = null, n = 0;
      for (const o of fields) if (o.type === fieldType && rng.next() < 1 / ++n) f = o; // zufälliges Feld
      if (!f) { fieldType = null; continue; }
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * f.r * 0.7;
      x = f.x + Math.cos(a) * r; z = f.z + Math.sin(a) * r;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < EVENT_SPAWN_DIST[0] * 0.7 || d > EVENT_SPAWN_DIST[1] * 2.2) continue;
    } else {
      const a = rng.next() * Math.PI * 2, r = rng.range(EVENT_SPAWN_DIST[0], EVENT_SPAWN_DIST[1]);
      x = p.x + Math.cos(a) * r; z = p.z + Math.sin(a) * r;
    }
    if (!pointOk(w, x, z, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL, 120, 0)) continue;
    w._pt.x = x; w._pt.z = z;
    return true;
  }
  return false;
}

function display(w, ev, type, title, x, z, total) {
  const d = w.event || (w._eventView || (w._eventView = { type: '', title: '', x: 0, z: 0, timeLeft: 0, progress: 0, total: 0, targetId: null }));
  d.type = type; d.title = title; d.x = x; d.z = z; d.timeLeft = ev.endsAt - w.time; d.progress = 0; d.total = total; d.targetId = null;
  w.event = d;
}

/** Ereignis sofort starten (Zufall, wenn type fehlt). → true, wenn gestartet. Für Tests und ?dev. */
export function startEvent(w, type) {
  if (w._ev || !w.player.alive) return false;
  if (!type) {
    let tot = 0;
    for (const k of TYPES) tot += SECTOR_EVENTS[k].weight || 1;
    let r = w.rng.next() * tot;
    type = TYPES[0];
    for (const k of TYPES) { r -= SECTOR_EVENTS[k].weight || 1; if (r <= 0) { type = k; break; } }
  }
  const def = SECTOR_EVENTS[type];
  if (!def) return false;
  if (type === 'convoy') return startConvoy(w, def);
  if (type === 'drift') return startDrift(w, def);
  if (type === 'nest') return startNest(w, def);
  return false;
}

function endEvent(w) {
  w._ev = null;
  w.event = null;
  w._eventNextAt = w.time + w.rng.range(EVENT_INTERVAL[0], EVENT_INTERVAL[1]);
}

// ───────────────────────── Konvoi ─────────────────────────

function startConvoy(w, def) {
  if (!eventPoint(w, null)) return false;
  const x = w._pt.x, z = w._pt.z;
  const fd = def.freighter;
  const k = 1 + 0.5 * ((w.sector.index || 1) - 1);
  const f = w.makeEntity(`f${++w._tempSeq}`, 'freighter');
  f.type = 'convoy'; f.name = fd.name; f.radius = fd.radius;
  f.hpMax = f.hp = Math.round(fd.hp * k); f.shieldMax = f.shield = Math.round(fd.shield * k);
  f.x = f.px = x; f.z = f.pz = z;
  // Ziel: Station, sonst das weiter entfernte Sprungtor
  let dest = w.sector.station;
  if (!dest) { let bd = -1; for (const o of w.sector.portals) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d > bd) { bd = d; dest = o; } } }
  f.destX = dest ? dest.x : 0; f.destZ = dest ? dest.z : 0;
  f.rot = f.prot = headingOf(f.destX - x, f.destZ - z);
  f.speed = 0; f.thrust = 0.3;
  w.movers.push(f);
  w._revive(f);

  const types = w.sector.eventPirates && w.sector.eventPirates.length ? w.sector.eventPirates : ['raider'];
  const n = w.rng.int(def.attackers[0], def.attackers[1]);
  const ev = { type: 'convoy', def, f, alive: n, total: n, endsAt: w.time + def.duration, phase: 'fight', leaveAt: 0, reward: scaledReward(w, def.reward), list: [] };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + w.rng.next() * 0.5;
    const r = w.rng.range(320, 480);
    const e = w.spawnTemp(types[i % types.length], x + Math.cos(a) * r, z + Math.sin(a) * r);
    e.huntId = f.id; e.targetId = f.id; e.attacking = true; e.evTag = ev;
    beginAttack(w, e);
    ev.list.push(e);
  }
  w._ev = ev;
  display(w, ev, 'convoy', def.title, x, z, n);
  w.event.targetId = f.id;
  radio(w, def.title, `Notruf! ${fd.name} wird ${whereText(w, x, z)} von ${n} Piraten angegriffen. Verteidige den Frachter! Belohnung: ${rewardText(ev.reward)}.`);
  return true;
}

function updateConvoy(w, ev, dt) {
  const f = ev.f;
  // Frachter fährt schwer beschädigt langsam Richtung Ziel, nach der Rettung schnell weg
  const dx = f.destX - f.x, dz = f.destZ - f.z;
  const d = Math.sqrt(dx * dx + dz * dz) || 1;
  const want = ev.phase === 'leaving' ? ev.def.freighter.leaveSpeed : ev.def.freighter.speed;
  f.speed += (want - f.speed) * (1 - Math.exp(-0.6 * dt));
  f.thrust = f.speed / ev.def.freighter.leaveSpeed;
  f.vx = dx / d * f.speed; f.vz = dz / d * f.speed;
  if (d > 200) { f.x += f.vx * dt; f.z += f.vz * dt; }
  f.rot = headingOf(dx, dz);
  w.event.x = f.x; w.event.z = f.z;
  w.event.progress = ev.total - ev.alive;
  w.event.timeLeft = ev.phase === 'leaving' ? 0 : Math.max(0, ev.endsAt - w.time);

  if (ev.phase === 'fight') {
    if (ev.alive <= 0) {
      ev.phase = 'leaving';
      ev.leaveAt = w.time + 20;
      w.grantReward(ev.reward, f.x, f.z, `Konvoi gerettet! Belohnung: ${rewardText(ev.reward)}.`);
      radio(w, ev.def.title, 'Danke, Pilot, du hast uns den Hals gerettet. Wir springen jetzt raus.', f.name);
      w.event.progress = ev.total;
    } else if (w.time >= ev.endsAt) {
      w._msg(`${f.name} ist mit letzter Kraft entkommen. Die Piraten ziehen ab. Keine Belohnung.`, 'warn');
      releaseAttackers(w, ev);
      removeFreighter(w, f, false);
      endEvent(w);
    }
  } else if (w.time >= ev.leaveAt || d <= 200) {
    removeFreighter(w, f, false);
    endEvent(w);
  }
}

function releaseAttackers(w, ev) {
  for (const e of ev.list) {
    e.huntId = null; e.expire = true;
    if (e.alive && e.targetId !== 'player') { e.state = 'wander'; e.attacking = false; e.targetId = null; e.homeX = e.x; e.homeZ = e.z; e.wx = e.x; e.wz = e.z; }
  }
}

function removeFreighter(w, f, exploded) {
  f.alive = false;
  w.entities.delete(f.id);
  const i = w.movers.indexOf(f);
  if (i >= 0) w.movers.splice(i, 1);
  if (exploded) w.bus.emit('explode', { id: f.id, x: f.x, z: f.z, size: 3.5 });
  w.bus.emit('despawn', { id: f.id });
}

/** Von world.enemyFire: Frachter zerstört. */
export function freighterDestroyed(w, f) {
  const ev = w._ev;
  removeFreighter(w, f, true);
  if (ev && ev.type === 'convoy' && ev.f === f) {
    w._msg(`${f.name} wurde zerstört. Der Konvoi ist verloren.`, 'warn');
    releaseAttackers(w, ev);
    endEvent(w);
  }
}

// ───────────────────────── Treibgut ─────────────────────────

function startDrift(w, def) {
  if (!eventPoint(w, 'debris') && !eventPoint(w, null)) return false;
  const x = w._pt.x, z = w._pt.z;
  const n = w.rng.int(def.crates[0], def.crates[1]);
  const ev = { type: 'drift', def, total: n, got: 0, endsAt: w.time + def.duration, list: [], reward: scaledReward(w, def.reward) };
  for (let i = 0; i < n; i++) {
    const c = w.makeEntity(`d${++w._tempSeq}`, 'crate');
    c.type = 'drift'; c.name = 'Treibgut'; c.radius = 12; c.temp = true; c.respawnAt = 0;
    for (let k = 0; k < 10; k++) {
      const a = w.rng.next() * Math.PI * 2, r = 40 + Math.sqrt(w.rng.next()) * 260;
      c.x = c.px = x + Math.cos(a) * r; c.z = c.pz = z + Math.sin(a) * r;
      if (!w.inRock(c.x, c.z, 25)) break;
    }
    c.rot = c.prot = w.rng.range(-Math.PI, Math.PI);
    w.crates.push(c);
    w._revive(c);
    ev.list.push(c);
  }
  w._ev = ev;
  display(w, ev, 'drift', def.title, x, z, n);
  radio(w, def.title, `Treibgut-Feld entdeckt: ${n} Crates ${whereText(w, x, z)}. Sammle sie ein, bevor sie in ${minutes(def.duration)} verglühen. Bonus für alle: ${rewardText(ev.reward)}.`);
  return true;
}

function updateDrift(w, ev) {
  w.event.timeLeft = Math.max(0, ev.endsAt - w.time);
  w.event.progress = ev.got;
  if (w.time < ev.endsAt) return;
  let left = 0;
  for (const c of ev.list) {
    if (!c.alive) continue;
    left++;
    c.alive = false;
    w.entities.delete(c.id);
    w.bus.emit('despawn', { id: c.id });
    const i = w.crates.indexOf(c);
    if (i >= 0) w.crates.splice(i, 1);
  }
  w._msg(`Das Treibgut ist verglüht (${ev.got} von ${ev.total} eingesammelt${left ? `, ${left} verloren` : ''}).`, 'info');
  endEvent(w);
}

/** Von world._openCrate */
export function eventCrateOpened(w, c) {
  const ev = w._ev;
  if (!ev || ev.type !== 'drift' || ev.list.indexOf(c) < 0) return;
  ev.got++;
  if (w.event) w.event.progress = ev.got;
  if (ev.got >= ev.total) {
    w.grantReward(ev.reward, c.x, c.z, `Treibgut-Feld geborgen: alle ${ev.total} Crates! Bonus: ${rewardText(ev.reward)}.`);
    endEvent(w);
  }
}

// ───────────────────────── Schwarm-Nest ─────────────────────────

/** Wert je Sektorindex aus einer Liste [Sektor 1, Sektor 2, …]; letzter Eintrag gilt für höhere Sektoren. */
function bySector(w, list, fallback) {
  if (!list || !list.length) return fallback;
  const i = Math.max(1, w.sector.index || 1) - 1;
  return list[i < list.length ? i : list.length - 1];
}

function startNest(w, def) {
  if (!eventPoint(w, 'asteroids') && !eventPoint(w, null)) return false;
  const x = w._pt.x, z = w._pt.z;
  const nest = w.spawnTemp('nest', x, z);
  nest.state = 'nest';
  // Stärke an den Sektor koppeln (Sektor 1: Starterschiff muss es schaffen)
  const k = bySector(w, def.hpScale, 1);
  nest.hpMax = nest.hp = Math.round(nest.def.hp * k);
  nest.shieldMax = nest.shield = Math.round(nest.def.shield * k);
  const g = makeGroup(`gn${w._tempSeq}`, 'larva', 'open');
  g.cx = x; g.cz = z; g.placed = false;
  buildWaypoints(w, g);
  // Wegpunkte eng ums Nest
  for (let i = 0; i < g.wpN; i++) {
    const a = (i / g.wpN) * Math.PI * 2 + w.rng.next() * 0.6, r = w.rng.range(180, 340);
    g.wp[i * 2] = x + Math.cos(a) * r; g.wp[i * 2 + 1] = z + Math.sin(a) * r;
  }
  const maxLarvae = Math.min(def.maxLarvae, bySector(w, def.larvaeBySector, def.maxLarvae));
  const ev = { type: 'nest', def, nest, group: g, maxLarvae, spawnCd: def.interval, endsAt: w.time + def.duration, reward: scaledReward(w, def.reward) };
  nest.evTag = ev;
  w._ev = ev;
  const n0 = Math.min(def.startLarvae, maxLarvae);
  for (let i = 0; i < n0; i++) spawnLarva(w, ev);
  display(w, ev, 'nest', def.title, x, z, 1);
  w.event.targetId = nest.id;
  const loot = nest.def.loot;
  radio(w, def.title, `Ein Schwarm-Nest wächst ${whereText(w, x, z)} und spuckt Larven aus. Zerstöre es! Belohnung: ${rewardText(ev.reward)}, dazu Beute des Nests (${fmt(loot.credits)} Credits, ${fmt(loot.tritium)} Tritium).`);
  return true;
}

function spawnLarva(w, ev) {
  const n = ev.nest;
  const a = w.rng.next() * Math.PI * 2;
  const e = w.spawnTemp('larva', n.x + Math.cos(a) * (n.radius + 40), n.z + Math.sin(a) * (n.radius + 40));
  e.behavior = 'aggressive'; e.aggro = 450; e.evTag = ev;
  e.vx = Math.cos(a) * 90; e.vz = Math.sin(a) * 90; // ausgespuckt
  e.group = ev.group; ev.group.members.push(e);
  e.slot = ev.group.members.length;
  if (n.provoked) w.provoke(e);
  return e;
}

function updateNest(w, ev, dt) {
  const n = ev.nest;
  w.event.timeLeft = Math.max(0, ev.endsAt - w.time);
  let alive = 0;
  const m = ev.group.members;
  for (let i = m.length - 1; i >= 0; i--) { if (m[i].alive) alive++; else m.splice(i, 1); }
  if (n.provoked) for (let i = 0; i < m.length; i++) if (!m[i].provoked) w.provoke(m[i]);
  ev.spawnCd -= dt;
  if (ev.spawnCd <= 0) {
    ev.spawnCd += ev.def.interval;
    if (alive < ev.maxLarvae) spawnLarva(w, ev);
  }
  if (w.time >= ev.endsAt) {
    // Nest vergeht: verschwindet ohne Beute
    n.alive = false;
    w.entities.delete(n.id);
    w.bus.emit('despawn', { id: n.id });
    for (const e of m) e.expire = true;
    w._msg('Das Schwarm-Nest hat sich eingegraben und ist verschwunden. Keine Belohnung.', 'info');
    endEvent(w);
  }
}

/** Von world._killEnemy: Ereignis-Gegner zerstört. */
export function eventEnemyKilled(w, e) {
  const ev = e.evTag;
  if (!ev || ev !== w._ev) return;
  if (ev.type === 'convoy') {
    ev.alive--;
    if (w.event) w.event.progress = ev.total - ev.alive;
  } else if (ev.type === 'nest' && e === ev.nest) {
    w.grantReward(ev.reward, e.x, e.z, `Schwarm-Nest zerstört! Bonus: ${rewardText(ev.reward)}.`);
    for (const m of ev.group.members) m.expire = true;
    if (w.event) w.event.progress = 1;
    endEvent(w);
  }
}

/** Jeden Schritt aus world._step */
export function updateEvents(w, dt) {
  const ev = w._ev;
  if (!ev) {
    if (w.time >= w._eventNextAt && w.player.alive && !w.docked) {
      if (!startEvent(w, null)) w._eventNextAt = w.time + 20;
    }
    return;
  }
  if (ev.type === 'convoy') updateConvoy(w, ev, dt);
  else if (ev.type === 'drift') updateDrift(w, ev);
  else if (ev.type === 'nest') updateNest(w, ev, dt);
}

