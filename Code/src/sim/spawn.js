// Verteilung im Sektor: Rudel mit Mindestabstand (Poisson-artig) in Zonen, Patrouillen-Wegpunkte,
// große Asteroiden-Brocken. Läuft nur beim Aufbau und beim Wiedererscheinen, nie pro Bild.
import {
  SPAWN_MIN_STATION, SPAWN_MIN_PORTAL, SAFE_RADIUS, GROUP_MIN_DIST, ROUTE_SPREAD, WANDER_RADIUS,
  ROCK_PER_M, ROCK_RADIUS, FORMATION_GAP,
} from './config.js';

const SPREAD = 0.9;           // Anteil der Karte, in dem Gegner erscheinen
const WP_MAX = 5;

// Formation (Keil): seitlich (Vielfache des Abstands, + = rechts) und nach hinten
const SLOT_L = [0, -1, 1, 0, -2, 2, -1, 1];
const SLOT_B = [0, 1, 1, 2, 2, 2, 3, 3];

/** Flugrouten des Sektors: Station → jedes Tor, sonst Tor → Tor, sonst Tor → gegenüberliegende Ecke. */
export function sectorRoutes(sector) {
  const out = [];
  const st = sector.station, ps = sector.portals || [];
  if (st) for (const p of ps) out.push({ ax: st.x, az: st.z, bx: p.x, bz: p.z });
  else if (ps.length >= 2) for (let i = 1; i < ps.length; i++) out.push({ ax: ps[0].x, az: ps[0].z, bx: ps[i].x, bz: ps[i].z });
  else if (ps.length === 1) out.push({ ax: ps[0].x, az: ps[0].z, bx: -ps[0].x * 0.7, bz: -ps[0].z * 0.7 });
  return out;
}

export function makeGroup(id, type, habitat) {
  return {
    id, type, habitat, cx: 0, cz: 0, field: null,
    wp: new Float64Array(WP_MAX * 2), wpN: 0, wpI: 0, waitT: 0,
    members: [], leader: null,
  };
}

/** Lebenden Anführer bestimmen (erster lebender in der Mitgliederliste). */
export function leaderOf(g) {
  const L = g.leader;
  if (L && L.alive) return L;
  g.leader = null;
  for (let i = 0; i < g.members.length; i++) if (g.members[i].alive) { g.leader = g.members[i]; break; }
  return g.leader;
}

/** Abstand zwischen Formationsplätzen für einen Gegnerradius. */
export function slotGap(radius) { return radius * FORMATION_GAP + 40; }

/** Weltposition des Formationsplatzes `slot` hinter dem Anführer L → out.x/out.z */
export function slotPos(L, slot, gap, out) {
  const i = slot < SLOT_L.length ? slot : SLOT_L.length - 1;
  const l = SLOT_L[i] * gap, b = SLOT_B[i] * gap;
  const r = L.rot;
  const c = Math.cos(r), s = Math.sin(r);
  // rechts = (cos r, −sin r), hinten = (sin r, cos r)
  out.x = L.x + c * l + s * b;
  out.z = L.z - s * l + c * b;
  return out;
}

/** Zone würfeln anhand der Anteile in ENEMIES[type].habitat (nur Zonen, die es im Sektor gibt). */
export function pickHabitat(w, def) {
  const hab = def.habitat || { open: 1 };
  const fields = w.sector.fields || [];
  let total = 0;
  for (const k in hab) if (zoneExists(k, w, fields)) total += hab[k];
  if (total <= 0) return 'open';
  let r = w.rng.next() * total;
  for (const k in hab) {
    if (!zoneExists(k, w, fields)) continue;
    r -= hab[k];
    if (r <= 0) return k;
  }
  return 'open';
}

/** n Zonen nach Anteilen verteilen (größte Reste), gemischt. Gleichmäßiger als n-mal würfeln. */
export function habitatQuota(w, def, n) {
  const hab = def.habitat || { open: 1 };
  const fields = w.sector.fields || [];
  const keys = [], share = [];
  let total = 0;
  for (const k in hab) if (zoneExists(k, w, fields)) { keys.push(k); share.push(hab[k]); total += hab[k]; }
  if (!keys.length) { keys.push('open'); share.push(1); total = 1; }
  const cnt = [], rest = [];
  let used = 0;
  for (let i = 0; i < keys.length; i++) {
    const v = n * share[i] / total;
    cnt.push(Math.floor(v)); rest.push(v - Math.floor(v)); used += Math.floor(v);
  }
  while (used < n) {
    let bi = 0;
    for (let i = 1; i < keys.length; i++) if (rest[i] > rest[bi]) bi = i;
    cnt[bi]++; rest[bi] = -1; used++;
  }
  const out = [];
  for (let i = 0; i < keys.length; i++) for (let k = 0; k < cnt[i]; k++) out.push(keys[i]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(w.rng.next() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

function zoneExists(k, w, fields) {
  if (k === 'open') return true;
  if (k === 'route') return w._routes.length > 0;
  for (let i = 0; i < fields.length; i++) if (fields[i].type === k) return true;
  return false;
}

function pickField(w, type) {
  const fields = w.sector.fields || [];
  let total = 0;
  for (const f of fields) if (f.type === type) total += f.r * f.r;
  if (total <= 0) return null;
  let r = w.rng.next() * total;
  for (const f of fields) {
    if (f.type !== type) continue;
    r -= f.r * f.r;
    if (r <= 0) return f;
  }
  return null;
}

/** Punkt erlaubt? (Karte, Station, Tore, Brocken, Abstand zum Spieler) */
export function pointOk(w, x, z, minStation, minPortal, pad, avoidPlayer) {
  const lim = w.sector.size * SPREAD;
  if (x > lim || x < -lim || z > lim || z < -lim) return false;
  const st = w.sector.station;
  if (st) { const dx = x - st.x, dz = z - st.z; if (dx * dx + dz * dz < minStation * minStation) return false; }
  const ps = w.sector.portals;
  for (let i = 0; i < ps.length; i++) {
    const dx = x - ps[i].x, dz = z - ps[i].z;
    if (dx * dx + dz * dz < minPortal * minPortal) return false;
  }
  if (pad >= 0 && w.inRock(x, z, pad)) return false;
  if (avoidPlayer > 0) {
    const p = w.player;
    const dx = x - p.x, dz = z - p.z;
    if (dx * dx + dz * dz < avoidPlayer * avoidPlayer) return false;
  }
  return true;
}

/** Zufallspunkt in einer Zone → out (field wird in out.field gemerkt) */
function samplePoint(w, habitat, out) {
  const rng = w.rng;
  out.field = null;
  if (habitat === 'route') {
    const R = w._routes[Math.floor(rng.next() * w._routes.length)];
    const t = rng.range(0.15, 0.85);
    const dx = R.bx - R.ax, dz = R.bz - R.az;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    const off = rng.sign() * rng.range(150, ROUTE_SPREAD);
    out.x = R.ax + dx * t - dz / l * off;
    out.z = R.az + dz * t + dx / l * off;
    return out;
  }
  if (habitat !== 'open') {
    const f = pickField(w, habitat);
    if (f) {
      const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * f.r * 0.8;
      out.x = f.x + Math.cos(a) * r; out.z = f.z + Math.sin(a) * r;
      out.field = f;
      return out;
    }
  }
  const lim = w.sector.size * 0.88;
  out.x = rng.range(-lim, lim); out.z = rng.range(-lim, lim);
  return out;
}

const _s = { x: 0, z: 0, field: null };

/**
 * Mittelpunkt für ein Rudel: Zone würfeln, Mindestabstand zu allen anderen Rudeln (wird bei Platzmangel gelockert).
 * avoidPlayer > 0: nicht in Sichtweite des Spielers (beim Wiedererscheinen).
 */
export function placeGroupCenter(w, g, avoidPlayer) {
  let minD = GROUP_MIN_DIST;
  let bestX = 0, bestZ = 0, bestF = null, bestScore = -1;
  for (let tries = 0; tries < 48; tries++) {
    if (tries && tries % 12 === 0) minD *= 0.8;
    samplePoint(w, g.habitat, _s);
    if (!pointOk(w, _s.x, _s.z, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL, 80, avoidPlayer)) continue;
    // nächstes anderes Rudel
    let nd = Infinity;
    for (let i = 0; i < w.groups.length; i++) {
      const o = w.groups[i];
      if (o === g || !o.placed) continue;
      const dx = o.cx - _s.x, dz = o.cz - _s.z;
      const d = dx * dx + dz * dz;
      if (d < nd) nd = d;
    }
    nd = Math.sqrt(nd);
    if (nd >= minD) { bestX = _s.x; bestZ = _s.z; bestF = _s.field; bestScore = Infinity; break; }
    if (nd > bestScore) { bestScore = nd; bestX = _s.x; bestZ = _s.z; bestF = _s.field; }
  }
  if (bestScore < 0) { // nichts Gültiges gefunden: irgendwo frei auf der Karte
    for (let tries = 0; tries < 40; tries++) {
      samplePoint(w, 'open', _s);
      if (pointOk(w, _s.x, _s.z, SPAWN_MIN_STATION, SPAWN_MIN_PORTAL, 80, avoidPlayer)) break;
    }
    bestX = _s.x; bestZ = _s.z; bestF = null;
  }
  g.cx = bestX; g.cz = bestZ; g.field = bestF; g.placed = true;
  buildWaypoints(w, g);
}

/** Patrouillen-Wegpunkte passend zur Zone. */
export function buildWaypoints(w, g) {
  const rng = w.rng;
  const wp = g.wp;
  let n = 0;
  const push = (x, z) => {
    // in die Karte und aus der sicheren Zone heraus
    const lim = w.sector.size * 0.92;
    if (x > lim) x = lim; else if (x < -lim) x = -lim;
    if (z > lim) z = lim; else if (z < -lim) z = -lim;
    const st = w.sector.station;
    if (st) {
      const dx = x - st.x, dz = z - st.z;
      const d = Math.sqrt(dx * dx + dz * dz) || 1;
      const m = SAFE_RADIUS + 450;
      if (d < m) { x = st.x + dx / d * m; z = st.z + dz / d * m; }
    }
    wp[n * 2] = x; wp[n * 2 + 1] = z; n++;
  };
  if (g.habitat === 'route' && w._routes.length) {
    // entlang der nächsten Route hin und her, im Zickzack
    let R = w._routes[0], best = Infinity;
    for (const r of w._routes) {
      const d = segDist2(g.cx, g.cz, r);
      if (d < best) { best = d; R = r; }
    }
    const dx = R.bx - R.ax, dz = R.bz - R.az;
    const l = Math.sqrt(dx * dx + dz * dz) || 1;
    const ux = dx / l, uz = dz / l;
    const L = rng.range(700, 1400);
    for (let i = 0; i < 4; i++) {
      const t = (i / 3) * 2 - 1; // −1 … 1
      const side = (i % 2 ? 1 : -1) * rng.range(80, 300);
      push(g.cx + ux * L * t - uz * side, g.cz + uz * L * t + ux * side);
    }
  } else if (g.field) {
    const f = g.field;
    const rr = Math.min(900, f.r * 0.6);
    const a0 = rng.next() * Math.PI * 2;
    for (let i = 0; i < 4; i++) {
      const a = a0 + i * (Math.PI / 2) + rng.range(-0.4, 0.4);
      const r = rr * rng.range(0.5, 1);
      push(f.x + (g.cx - f.x) * 0.4 + Math.cos(a) * r, f.z + (g.cz - f.z) * 0.4 + Math.sin(a) * r);
    }
  } else {
    const a0 = rng.next() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const a = a0 + i * (Math.PI * 2 / 3) + rng.range(-0.5, 0.5);
      const r = WANDER_RADIUS * rng.range(0.5, 1);
      push(g.cx + Math.cos(a) * r, g.cz + Math.sin(a) * r);
    }
  }
  g.wpN = n;
  g.wpI = Math.floor(rng.next() * n);
  g.waitT = 0;
}

function segDist2(x, z, R) {
  const dx = R.bx - R.ax, dz = R.bz - R.az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((x - R.ax) * dx + (z - R.az) * dz) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const px = R.ax + dx * t - x, pz = R.az + dz * t - z;
  return px * px + pz * pz;
}

/** Große Brocken in Asteroidenfeldern (deterministisch aus dem Sektor-Zufall). → Liste von {x,z,r,rot,spin} */
export function rockLayout(w) {
  const rng = w.rng;
  const out = [];
  const fields = w.sector.fields || [];
  const st = w.sector.station, ps = w.sector.portals;
  for (const f of fields) {
    if (f.type !== 'asteroids') continue;
    const n = Math.round(f.r * ROCK_PER_M);
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rng.next() * Math.PI * 2, rr = Math.sqrt(rng.next()) * f.r * 0.9;
        const x = f.x + Math.cos(a) * rr, z = f.z + Math.sin(a) * rr;
        const u = rng.next();
        const r = ROCK_RADIUS[0] + (ROCK_RADIUS[1] - ROCK_RADIUS[0]) * u * u;
        let ok = true;
        if (st && (x - st.x) ** 2 + (z - st.z) ** 2 < (SAFE_RADIUS + 600) ** 2) ok = false;
        for (let k = 0; ok && k < ps.length; k++) if ((x - ps[k].x) ** 2 + (z - ps[k].z) ** 2 < 600 * 600) ok = false;
        for (let k = 0; ok && k < out.length; k++) {
          const o = out[k];
          const m = o.r + r + 140;
          if ((x - o.x) ** 2 + (z - o.z) ** 2 < m * m) ok = false;
        }
        if (!ok) continue;
        out.push({ x, z, r, rot: rng.range(-Math.PI, Math.PI), spin: rng.range(-0.12, 0.12) });
        break;
      }
    }
  }
  return out;
}
