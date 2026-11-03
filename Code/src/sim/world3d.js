// 3D-Flug in der Welt (Planung/FLUGMODELL.md): Spielerflug über den Flugkern (src/flight), gezielte Bolzen,
// Feuerleitrechner, Traktor, Höhen der Sektorinhalte, Zonen, Gegnerfeuer in 3D. Der Taktikweg (world.flight3d ===
// false) ruft hiervon nur planeCatch (Ebenenfänger, ändert nur y) und die Höhenvergabe auf – beides ohne world.rng,
// damit der Taktik-Goldtest bitgleich bleibt. Höhen kommen aus dem abgeleiteten Zufall Rng(hashString(sektor + ':y')).
import { createState, makeCtl, stepN, enter, derive, applyEdges, halt, interruptMode, C as CI, BTN, MODE } from '../flight/core.js';
import {
  shipParams, BOLT_SPEED, BOLT_PER_SHOT, BOLT_SPREAD, ENEMY_HIT_PAD, AUTO_K, AUTO_CONE, CONVERGE_DEFAULT, SECTOR_BAND,
  HOME_BAND, ZONE_DY, TRACTOR_RANGE, TRACTOR_SPEED, CLASS, PVP_GIMBAL, FLAT_BAND,
} from '../flight/params.js';
import { qFromYPR, qRot, qSlerp, qCopy, vAngle, fwdOf } from '../flight/math3.js';
import { segSphere, segCapsule, convergeDir, leadPoint } from '../flight/aim.js';
import { Rng, hashString } from './rng.js';
import { LASERS, AMMO, ENEMIES } from '../core/data.js';
import * as Cfg from './config.js';
import { rollDamage, applyDamage, headingOf } from './combat.js';
import { updateDrones, droneShield } from './drones.js';
import { sosAbsorb, breakCloak } from './abilities.js';

export { ZONE_DY, AUTO_K };
export const LASER_KEYS = Object.keys(LASERS);
export const AMMO_KEYS3 = Object.keys(AMMO);
const BOLTS = 640;
const D = Math.PI / 180;
const NEAR = [], ROCKS3 = [];
const _a = new Float64Array(3), _b = new Float64Array(3), _c = new Float64Array(3), _d = new Float64Array(3), _f = new Float64Array(3);
const _q = new Float64Array(4), _m = new Float64Array(3), _o = new Float64Array(3), _lp = new Float64Array(3);
const HIT = { hull: 0, shield: 0 };
const BOLT_INTERVAL = Cfg.LASER_INTERVAL / BOLT_PER_SHOT;
// Gegnerbolzen: langsamer und gut sichtbar; die KI hält mit dem Tempo des Spielers von vor 0,25 s vor (Haken lohnen sich)
export const ENEMY_BOLT_SPEED = 1400;
const LEAD_DELAY = 15;

function makeBolts(n) {
  return {
    cap: n, n: 0, seq: 0, _id: 0,
    on: new Uint8Array(n), kind: new Uint8Array(n), // 1 Spieler, 2 Gegner (gewürfelt, Ausweichen zählt), 3 Gegner (echt, Etappe 2)
    x: new Float64Array(n), y: new Float64Array(n), z: new Float64Array(n),
    vx: new Float64Array(n), vy: new Float64Array(n), vz: new Float64Array(n),
    life: new Float32Array(n), age: new Float32Array(n), dmg: new Float32Array(n),
    crit: new Uint8Array(n), shield: new Uint8Array(n), laser: new Uint8Array(n), ammo: new Uint8Array(n), slot: new Int8Array(n),
    plan: new Uint8Array(n), ax: new Float64Array(n), ay: new Float64Array(n), az: new Float64Array(n), id: new Uint32Array(n),
    from: new Array(n).fill(null), type: new Array(n).fill(null), sal: new Uint8Array(n),
  };
}

export function initWorld3d(w, opts = {}) {
  w.fl = createState();
  w.ctl = makeCtl();          // Steuerrahmen der Eingabe (Maus, Controller, Touch, Bot)
  w._apCtl = makeCtl();       // Steuerrahmen des Autopiloten
  w.apAim = new Float64Array([0, 0, -1]);
  w.flP = shipParams('s1', 320);
  w.env = null;               // im All: keine Schwerkraft, kein Boden (Planetenlandung: env tauschen)
  w.rngY = new Rng(1);
  w.bolts = makeBolts(BOLTS);
  w.enemyBolts = !!opts.enemyBolts;  // Etappe 2: echte Gegnerbolzen (Schalter)
  w.ctlActive = false;        // Eingabe aktiv (bricht den Autopiloten ab)
  w.pilotView = 'tactical';   // Ansicht des Piloten (Höhenband je Ziel für die KI, Netz-Flags)
  w._convD = CONVERGE_DEFAULT;
  w.aimInfo = { under: null, conv: CONVERGE_DEFAULT, fire: false, canFire: true, reise: false };
  w._boltCd = new Float64Array(16); w._boltQ = new Uint8Array(16); w._boltKey = new Array(16).fill(null);
  w._wasFiring3 = false;
  w._hy = null; w._hdy = 0;
  w.flMsg = '';
  w.stats3 = { bolts: 0, boltHits: 0, kills: 0 };
  w._pvh = new Float64Array(3 * (LEAD_DELAY + 1)); w._pvi = 0;
  w._undockT = 0;
}

export function initPlayer3d(w, p) {
  p.y = 0; p.vy = 0; p.py = 0; p.ty = 0;
  p.q = w.fl.q; p.pq = w.fl.pq;   // Lage für die Grafik (gemeinsame Felder mit dem Flugkern)
  p.pitch3 = 0; p.roll3 = 0;
}

export function bandOf(w) { return (w.sector && w.sector.index) === 1 ? HOME_BAND : SECTOR_BAND; }
export function reiseActive(w) { return w.fl.mode === MODE.REISE; }

/** Ansicht wechseln: true = 3D-Flug (Verfolger/Cockpit), false = Taktik (Klickflug). Ohne Ruck (Lage aus rot). */
export function setFlight3d(w, on) {
  const p = w.player;
  w.pilotView = on ? 'flight' : 'tactical';
  if (on === w.flight3d) return;
  if (on) {
    enter(w.fl, p);
    w.fl.v[1] = p.vy || 0;
    w.flight3d = true;
    w._wasFiring = false;
  } else {
    w.flight3d = false;
    const st = w.fl;
    // Taktikweg übernimmt sofort (Klickflug ab dem ersten Bild); Höhe und Lage fängt planeCatch ein
    p.fs = Math.hypot(p.vx, p.vz); p.course = p.rot; p.bank = 0; p.pitch = 0; p.turnRate = 0; p.accel = 0;
    st.mode = st.modeWant = MODE.KAMPF; st.modeT = 0; st.landing = false; st.landed = false; st.boostOn = false; st.cruise = false;
    w._catchT = 0;
  }
}

/** Ebenenfänger (Taktik): Höhe mit begrenzter Steigrate (≥ 180 m/s, höchstens 3 s) auf 0, Lage waagrecht. Nur y. */
export function planeCatch(w, dt) {
  const p = w.player;
  w._catchT = (w._catchT || 0) + dt;
  const rate = Math.max(180, Math.abs(p.y) / Math.max(0.4, 2.6 - w._catchT));
  const want = -Math.sign(p.y) * Math.min(rate, Math.abs(p.y) * 3);
  p.vy += (want - p.vy) * (1 - Math.exp(-dt * 6));
  p.y += p.vy * dt;
  if (Math.abs(p.y) < 0.5 && Math.abs(p.vy) < 3 || w._catchT > 3) { p.y = 0; p.vy = 0; }
  // Lage für die Grafik weich in die Waagrechte (Gieren = rot)
  qCopy(w.fl.pq, w.fl.q);
  qFromYPR(_q, p.rot, 0, 0);
  qSlerp(w.fl.q, w.fl.q, _q, 1 - Math.exp(-dt * 3.2));
  w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z;
}

// ───────────────────────── Spielerflug ─────────────────────────

export function flyPlayer(w, dt, tgt) {
  const p = w.player, st = w.fl, P = w.flP;
  shipParams(p.ship, w._speed, P);
  st.p[0] = p.x; st.p[1] = p.y; st.p[2] = p.z; // Stöße, Kollisionen der Welt aus dem letzten Schritt übernehmen
  const msg = applyEdges(st, w.ctl, P, { inCombat: w.inCombat });
  if (msg) { w.flMsg = msg; w.bus.emit('flight', { msg, mode: st.modeWant, coupled: st.coupled, landing: st.landing }); }
  let ctl = w.ctl;
  if (p.hasMove) {
    if (w.ctlActive) { p.hasMove = false; w.homing = false; w.bus.emit('flight', { msg: 'AUTOPILOT AUS' }); }
    else ctl = autopilot(w);
  }
  if (w._undockT && (w.time > w._undockT || w.ctlActive)) { if (st.cruise && st.cruiseV === 40) st.cruise = false; w._undockT = 0; }
  stepN(st, ctl, P, w.env, dt);
  collide3d(w, st, p);
  // Tempo-Verlauf für den Vorhalt der Gegner (0,25 s verzögert)
  w._pvi = (w._pvi + 1) % (LEAD_DELAY + 1);
  w._pvh[w._pvi * 3] = st.v[0]; w._pvh[w._pvi * 3 + 1] = st.v[1]; w._pvh[w._pvi * 3 + 2] = st.v[2];
  const rot0 = p.rot, fs0 = p.fs;
  derive(st, p);
  // abgeleitete Felder für alten Code (Kamera, Ton, Test-Pilot, Netz)
  fwdOf(_f, st.q);
  p.fs = Math.max(0, st.v[0] * _f[0] + st.v[1] * _f[1] + st.v[2] * _f[2]);
  p.course = p.rot;
  const thrK = Math.max(st.thr[4], st.boostOn ? 1 : 0, 0.55 * Math.min(1, p.speed / (P.vK || 1)) * (st.thr[4] > 0.02 ? 1 : 0.6));
  p.thrust += (thrK - p.thrust) * (1 - Math.exp(-dt * 6));
  p.turnRate += ((dt > 0 ? wrapA(p.rot - rot0) / dt : 0) - p.turnRate) * (1 - Math.exp(-8 * dt));
  p.accel += ((p.fs - fs0) / dt - p.accel) * (1 - Math.exp(-6 * dt));
  p.slip = st.v[0] * Math.cos(p.rot) - st.v[2] * Math.sin(p.rot);
  p.bank = 0; p.pitch = 0; p.aim = false;
  // Landung: Bruch oder harter Aufsetzer
  if (st.crash) { st.crash = false; st.landDmg = 0; damagePlayer(w, p.hpMax * 0.6, 'crash'); }
  else if (st.landDmg > 0) { damagePlayer(w, p.hpMax * st.landDmg, 'landing'); st.landDmg = 0; }
}
function wrapA(a) { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; }

function damagePlayer(w, amount, kind) {
  const p = w.player;
  if (!w.playerTargetable() || amount <= 0) return;
  applyDamage(p, Math.round(amount), false, HIT);
  w._lastHit = w.time;
  w.bus.emit('damage', { id: 'player', hull: HIT.hull, shield: HIT.shield, x: p.x, z: p.z, y: p.y, crit: false, dx: 0, dz: 0, hx: p.x, hz: p.z, from: kind });
  if (p.hp <= 0) w._playerDie();
}

/** Autopilot (H, Beute anfliegen, Bots): Ziel (tx, ty, tz) im 3D-Flug anfliegen, Ankunft weich */
function autopilot(w) {
  const p = w.player, st = w.fl, P = w.flP, c = w._apCtl;
  c.fill(0);
  const dx = p.tx - p.x, dy = (p.ty || 0) - p.y, dz = p.tz - p.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < Cfg.ARRIVE_SNAP) { p.hasMove = false; c[CI.AIM] = 0; return c; }
  c[CI.AIM] = 1; c[CI.AX] = dx / d; c[CI.AY] = dy / d; c[CI.AZ] = dz / d;
  w.apAim[0] = c[CI.AX]; w.apAim[1] = c[CI.AY]; w.apAim[2] = c[CI.AZ];
  fwdOf(_f, st.q);
  const cosA = (_f[0] * dx + _f[1] * dy + _f[2] * dz) / d;
  let want = Math.sqrt(2 * P.aBack * 0.8 * Math.max(0, d - Cfg.ARRIVE_SNAP * 0.6));
  want *= cosA > 0 ? 0.25 + 0.75 * cosA * cosA : 0.15;
  const top = Math.min(P.vK, st.limiter);
  c[CI.TZ] = Math.max(0, Math.min(1, want / (top || 1)));
  return c;
}

const _n = new Float64Array(3);
/** Zusammenstöße in 3D: Brocken als Kugeln, Station als Zylinder (sanft abstoßen wie im Taktikweg) */
function collide3d(w, st, p) {
  const n = w.rockGrid.query(st.p[0], st.p[2], p.radius + Cfg.ROCK_RADIUS[1] + 20, ROCKS3);
  for (let i = 0; i < n; i++) {
    const r = ROCKS3[i];
    const ox = st.p[0] - r.x, oy = st.p[1] - r.y, oz = st.p[2] - r.z;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    const min = r.radius + p.radius + 10;
    if (d >= min) continue;
    const nx = ox / d, ny = oy / d, nz = oz / d, pen = min - d;
    st.p[0] += nx * pen * 0.35; st.p[1] += ny * pen * 0.35; st.p[2] += nz * pen * 0.35;
    const vn = st.v[0] * nx + st.v[1] * ny + st.v[2] * nz;
    if (vn < 0) {
      st.v[0] -= nx * vn * 1.8; st.v[1] -= ny * vn * 1.8; st.v[2] -= nz * vn * 1.8;
      if (-vn > 80) damagePlayer(w, p.hpMax * 0.01 * (-vn - 60) / 20, 'rock');
    }
  }
  const s = w.station;
  if (s && !w.docked) {
    const ox = st.p[0] - s.x, oz = st.p[2] - s.z, oy = st.p[1] - s.y;
    const min = s.radius + p.radius, d2 = ox * ox + oz * oz;
    if (d2 < min * min && Math.abs(oy) < 90) {
      const d = Math.sqrt(d2) || 1, nx = ox / d, nz = oz / d, pen = min - d;
      st.p[0] += nx * pen * 0.35; st.p[2] += nz * pen * 0.35;
      const vn = st.v[0] * nx + st.v[2] * nz;
      if (vn < 0) { st.v[0] -= nx * vn * 1.8; st.v[2] -= nz * vn * 1.8; }
    }
  }
}

export function knock3d(w, dx, dy, dz, v) {
  const st = w.fl;
  st.v[0] += dx * v; st.v[1] += dy * v; st.v[2] += dz * v; // Drehstoß nur über die Kamera (Zielen bleibt)
}
export function halt3d(w) { halt(w.fl); w.player.vy = 0; }

/** Spieler neu hingestellt (Sektorwechsel, Reparatur, Start): Höhe 0, Flugzustand aus rot */
export function placed(w) {
  const p = w.player;
  p.y = 0; p.vy = 0; p.py = 0;
  enter(w.fl, p);
  w.fl.v[0] = w.fl.v[1] = w.fl.v[2] = 0;
  w.fl.mode = w.fl.modeWant = MODE.KAMPF; w.fl.modeT = 0; w.fl.landing = false; w.fl.landed = false; w.fl.gear = 0;
}
export function docked(w) { const p = w.player; p.y = w.station ? w.station.y : 0; p.vy = 0; halt(w.fl); }
export function undocked(w) {
  const p = w.player;
  enter(w.fl, p);
  // Abdock-Schub: das Schiff gleitet 2,5 s mit 40 m/s aus der Station (Tempomat), Eingabe übernimmt sofort
  if (w.flight3d) { fwdOf(_f, w.fl.q); w.fl.v[0] = _f[0] * 40; w.fl.v[1] = _f[1] * 40; w.fl.v[2] = _f[2] * 40; w.fl.cruise = true; w.fl.cruiseV = 40; w._undockT = w.time + 2.5; }
}
/** Höhe eines Kursziels ohne Angabe: Entität an (x, z) suchen, sonst aktuelle Höhe halten */
export function moveY(w, x, z) {
  for (const e of w.entities.values()) if (Math.abs(e.x - x) < 0.5 && Math.abs(e.z - z) < 0.5) return e.y || 0;
  return w.player.y;
}

// ───────────────────────── Höhen (abgeleiteter Zufall, nie world.rng) ─────────────────────────

export function assignHeights(w) {
  const R = w.rngY = new Rng(hashString(String(w.sector.id) + ':y'));
  const home = (w.sector.index || 1) === 1;
  const gBand = home ? 300 : 400, lBand = home ? 450 : 600;
  for (const g of w.groups) {
    const n = g.members.length;
    g.cy = R.range(-1, 1) * (n > 1 ? gBand : lBand);
    for (let k = 0; k < n; k++) {
      const e = g.members[k];
      e.y = e.py = e.homeY = g.cy + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (e.radius * 1.4) * 0.6 : 0);
    }
  }
  for (const e of w.enemies) if (!e.group) e.y = e.py = e.homeY = R.range(-lBand, lBand);
  for (const r of w.rocks) r.y = r.py = R.range(-250, 250);
  for (const c of w.crates) c.y = c.py = R.range(-300, 300);
  for (const o of w.ores) o.y = o.py = R.range(-250, 250);
  if (w.station) w.station.y = 0;
  for (const o of w.portals) o.y = 0;
}
export function itemY(w, inField) { return inField ? w.rngY.range(-250, 250) : w.rngY.range(-300, 300); }
export function tempY(w) { return (w.player ? w.player.y : 0) + w.rngY.range(-80, 80); }
export function respawnY(w, e, L, g) {
  if (L && L !== e) e.y = L.y + w.rngY.range(-40, 40);
  else if (g) e.y = (g.cy || 0) + w.rngY.range(-60, 60);
  else e.y = w.rngY.range(-500, 500);
  e.py = e.homeY = e.y; e.vy = 0;
}

// ───────────────────────── Waffen ─────────────────────────

/** Zielinfo je Schritt: Ziel unter dem Fadenkreuz, Konvergenzentfernung (weich), Feuerbereitschaft */
function aimInfo(w, dt) {
  const p = w.player, ctl = w.ctl, A = w.aimInfo;
  _a[0] = ctl[CI.AX]; _a[1] = ctl[CI.AY]; _a[2] = ctl[CI.AZ];
  if (ctl[CI.AIM] < 0.5) fwdOf(_a, w.fl.q);
  let best = null, bestK = Infinity, bd = 0;
  const n = w.grid.query(p.x, p.z, Cfg.PLAYER_RANGE + 80, NEAR);
  for (let i = 0; i < n; i++) {
    const e = NEAR[i];
    if (!e.alive) continue;
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    if (d > Cfg.PLAYER_RANGE * 1.1) continue;
    const cosA = (dx * _a[0] + dy * _a[1] + dz * _a[2]) / d;
    if (cosA < 0.9) continue;
    const ang = Math.acos(Math.min(1, cosA)), lim = Math.max(1.5 * D, Math.atan((e.radius * ENEMY_HIT_PAD) / d) * 1.4);
    if (ang > lim) continue;
    const k = ang / lim;
    if (k < bestK) { bestK = k; best = e; bd = d; }
  }
  let want = CONVERGE_DEFAULT;
  if (best) want = bd;
  else {
    const t = p.targetId ? w.entities.get(p.targetId) : null;
    if (t && t.alive) {
      const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      if (d < Cfg.PLAYER_RANGE * 1.2 && (dx * _a[0] + dy * _a[1] + dz * _a[2]) / d > Math.cos(w.flP.gimbal + 5 * D)) want = d;
    }
  }
  want = Math.max(120, Math.min(Cfg.PLAYER_RANGE, want));
  w._convD += (want - w._convD) * (1 - Math.exp(-dt / 0.15));
  A.under = best ? best.id : null;
  A.conv = w._convD;
}

/** Laser im 3D-Flug: Feuer halten → Bolzen; Feuerleitrechner (Autofeuer) gewürfelt × 0,8; Drohnen feuern mit */
export function updateGuns(w, dt, tgt) {
  const p = w.player, st = w.fl, ctl = w.ctl, A = w.aimInfo;
  aimInfo(w, dt);
  const lasers = p.loadout.lasers, n = Math.min(lasers.length, 16);
  const want = (ctl[CI.BTN] & BTN.FIRE) !== 0 && p.alive;
  const reise = st.mode !== MODE.KAMPF || st.landed;
  A.reise = reise;
  let firing = false;
  if (want) {
    if (reise) { if (!w._wasFiring3) w._msg('Waffen gesperrt: REISE bzw. Landemodus. B halten schaltet auf KAMPF.', 'info', 'reiseGuns', 3); }
    else firing = w._canShoot(w._wasFiring3);
  }
  A.fire = firing;
  // Drohnen: feuern mit, wenn ein gültiges Ziel in Reichweite vor dem Bug liegt
  let dt0 = null;
  const lock = tgt && w._validTarget(tgt) ? tgt : (A.under ? w.entities.get(A.under) : null);
  if (lock && w._validTarget(lock)) {
    const dx = lock.x - p.x, dy = lock.y - p.y, dz = lock.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    fwdOf(_f, st.q);
    if (d < Cfg.PLAYER_RANGE && (dx * _f[0] + dy * _f[1] + dz * _f[2]) / (d || 1) > Math.cos(AUTO_CONE * 1.5)) dt0 = lock;
  }
  const auto = p.attacking && !firing && !reise;
  if (auto) autofire(w, dt, tgt);
  else w._wasFiring = false;
  updateDrones(w, dt, dt0, !!dt0 && (firing || (auto && w._wasFiring)));
  if (!firing) {
    for (let i = 0; i < n; i++) { w._boltCd[i] -= dt; if (w._boltCd[i] < 0) w._boltCd[i] = 0; }
    w._wasFiring3 = false;
    return;
  }
  if (!w._wasFiring3) {
    for (let i = 0; i < n; i++) w._boltCd[i] = Math.max(w._boltCd[i], 0) + i * (Cfg.LASER_STAGGER / BOLT_PER_SHOT) + w.rng.next() * 0.01;
    w._wasFiring3 = true;
  }
  if (w.cloaked) breakCloak(w, 'Angriff');
  w._lastCombat = w.time;
  for (let i = 0; i < n; i++) {
    w._boltCd[i] -= dt;
    while (w._boltCd[i] <= 0) {
      const iv = BOLT_INTERVAL * (1 + (w.rng.next() * 2 - 1) * Cfg.LASER_JITTER);
      w._boltCd[i] += iv;
      // Munition: eine Einheit je 4 Bolzen (Verbrauch wie bisher: 1 Schuss je Sekunde und Laser)
      if (w._boltQ[i] === 0 || !w._boltKey[i]) {
        const key = w._ammoForShot();
        if (!key) { w._wasFiring3 = false; return; }
        w.profile.ammo[key] -= 1; w._profileDirty = true; w._boltKey[i] = key;
      }
      const key = w._boltKey[i];
      w._boltQ[i] = (w._boltQ[i] + 1) % BOLT_PER_SHOT;
      fireBolt(w, i, lasers[i], key, AMMO[key].mult, key === 'SAB', w.rng.next() < Cfg.CRIT_CHANCE, 1 / BOLT_PER_SHOT, false);
    }
  }
}

/** SAL im 3D-Flug: schnelle Bolzensalve mit vollem Schaden je Laser (Abklingzeit und Munition wie bisher) */
export function salBolt(w, laserId, tgt, idx) {
  const p = w.player;
  // Salve zielt aufs Fadenkreuz; liegt das Ziel im Kardankegel, auf dessen Vorhaltepunkt
  fireBolt(w, idx, laserId, 'SAL', AMMO.SAL.mult, false, true, 1, true, tgt);
  return p;
}

function muzzle(w, idx, out) {
  const P = w.flP, side = idx % 2 ? 1 : -1, row = idx >> 1;
  _m[0] = side * P.rad * (0.75 + 0.12 * row); _m[1] = -P.rad * 0.12; _m[2] = -P.len * 0.22 + row * 3;
  qRot(out, w.fl.q, _m);
  out[0] += w.player.x; out[1] += w.player.y; out[2] += w.player.z;
  return out;
}

function fireBolt(w, idx, laserId, ammoKey, mult, shieldOnly, crit, dmgK, sal, salTgt = null) {
  const B = w.bolts, p = w.player, st = w.fl, ctl = w.ctl;
  let i = -1;
  for (let k = 0; k < B.cap; k++) { const j = (B.seq + k) % B.cap; if (!B.on[j]) { i = j; break; } }
  if (i < 0) return;
  muzzle(w, idx, _c);
  _a[0] = ctl[CI.AX]; _a[1] = ctl[CI.AY]; _a[2] = ctl[CI.AZ];
  if (ctl[CI.AIM] < 0.5) fwdOf(_a, st.q);
  fwdOf(_f, st.q);
  const pvp = salTgt && salTgt.kind === 'player';
  const gim = pvp ? Math.min(PVP_GIMBAL, w.flP.gimbal) : w.flP.gimbal;
  let dist = w._convD;
  if (sal && salTgt && salTgt.alive) {
    _b[0] = salTgt.x; _b[1] = salTgt.y; _b[2] = salTgt.z; _d[0] = salTgt.vx || 0; _d[1] = salTgt.vy || 0; _d[2] = salTgt.vz || 0;
    _o[0] = p.x; _o[1] = p.y; _o[2] = p.z;
    if (leadPoint(_o, _b, _d, BOLT_SPEED, _lp) > 0) {
      const lx = _lp[0] - p.x, ly = _lp[1] - p.y, lz = _lp[2] - p.z, l = Math.hypot(lx, ly, lz) || 1;
      if (Math.acos(Math.min(1, (lx * _f[0] + ly * _f[1] + lz * _f[2]) / l)) < gim + 8 * D) { _a[0] = lx / l; _a[1] = ly / l; _a[2] = lz / l; dist = l; }
    }
  }
  convergeDir(_c[0], _c[1], _c[2], p.x, p.y, p.z, _a, dist, _f, gim, _d);
  // kleine Streuung (3D-Weg: world.rng ist hier erlaubt, der Taktikweg rechnet nie Bolzen)
  const sx = (w.rng.next() - 0.5) * 2 * BOLT_SPREAD, sy = (w.rng.next() - 0.5) * 2 * BOLT_SPREAD;
  _d[0] += sx; _d[1] += sy;
  const l = Math.hypot(_d[0], _d[1], _d[2]) || 1;
  B.on[i] = 1; B.kind[i] = 1; B.n++; B.seq = (i + 1) % B.cap; B.id[i] = ++B._id;
  B.x[i] = _c[0]; B.y[i] = _c[1]; B.z[i] = _c[2];
  B.vx[i] = _d[0] / l * BOLT_SPEED; B.vy[i] = _d[1] / l * BOLT_SPEED; B.vz[i] = _d[2] / l * BOLT_SPEED;
  B.life[i] = Cfg.PLAYER_RANGE * 1.05 / BOLT_SPEED; B.age[i] = 0;
  B.dmg[i] = dmgK; B.crit[i] = crit ? 1 : 0; B.shield[i] = shieldOnly ? 1 : 0; B.sal[i] = sal ? 1 : 0;
  B.laser[i] = Math.max(0, LASER_KEYS.indexOf(laserId)); B.ammo[i] = Math.max(0, AMMO_KEYS3.indexOf(ammoKey)); B.slot[i] = idx;
  B.from[i] = 'player'; B.type[i] = laserId; B.plan[i] = 0;
  w.stats3.bolts++;
  w.bus.emit('shot', {
    from: 'player', to: p.targetId, laser: laserId, ammo: ammoKey, hit: false, idx, bolt: true, sal,
    x: _c[0] + _d[0] / l * dist, y: _c[1] + _d[1] / l * dist, z: _c[2] + _d[2] / l * dist, dx: _d[0] / l, dy: _d[1] / l, dz: _d[2] / l,
  });
}

/** Feuerleitrechner (Autofeuer, Touch und Barrierefreiheit): gewürfelt × AUTO_K, Ziel im 30°-Kegel um den Bug */
function autofire(w, dt, tgt) {
  const p = w.player, lasers = p.loadout.lasers, n = Math.min(lasers.length, 16), cd = w._laserCd;
  if (!w._validTarget(tgt)) { p.attacking = false; w._wasFiring = false; return; }
  const dx = tgt.x - p.x, dy = tgt.y - p.y, dz = tgt.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  fwdOf(_f, w.fl.q);
  const inCone = (dx * _f[0] + dy * _f[1] + dz * _f[2]) / d >= Math.cos(AUTO_CONE);
  if (d > Cfg.PLAYER_RANGE) { w._rangeMsg(tgt, 'Ziel ist zu weit weg. Flieg näher ran (650 m).', false); w._wasFiring = false; return; }
  if (!inCone || !w._canShoot(true)) { for (let i = 0; i < n; i++) { cd[i] -= dt; if (cd[i] < 0) cd[i] = 0; } w._wasFiring = false; return; }
  if (!w._wasFiring) { for (let i = 0; i < n; i++) cd[i] = (cd[i] > 0 ? cd[i] : 0) + i * Cfg.LASER_STAGGER + w.rng.next() * 0.04; w._wasFiring = true; }
  for (let i = 0; i < n; i++) {
    cd[i] -= dt;
    if (cd[i] > 0) continue;
    const iv = Cfg.LASER_INTERVAL * (1 + (w.rng.next() * 2 - 1) * Cfg.LASER_JITTER);
    cd[i] += iv; if (cd[i] < 0) cd[i] = iv;
    const key = w._ammoForShot();
    if (!key) { p.attacking = false; return; }
    w.profile.ammo[key] -= 1; w._profileDirty = true;
    w._fireLaser(lasers[i], tgt, key, AMMO[key].mult, key === 'SAB', w.rng.next() < Cfg.CRIT_CHANCE, i);
    if (!tgt.alive || !p.alive) return;
  }
}

// ───────────────────────── Bolzen ─────────────────────────

const REM = [];
export function updateBolts(w, dt) {
  const B = w.bolts, p = w.player;
  REM.length = 0;
  for (const e of w.entities.values()) if (e.kind === 'player' && e !== p && e.pvpOk && e.alive) REM.push(e);
  let live = 0;
  for (let i = 0; i < B.cap; i++) {
    if (!B.on[i]) continue;
    const x0 = B.x[i], y0 = B.y[i], z0 = B.z[i];
    const x1 = x0 + B.vx[i] * dt, y1 = y0 + B.vy[i] * dt, z1 = z0 + B.vz[i] * dt;
    B.age[i] += dt; B.life[i] -= dt;
    const k = B.kind[i];
    let done = false;
    if (k === 1) done = playerBolt(w, B, i, x0, y0, z0, x1, y1, z1);
    else if (k === 3) done = enemyBoltReal(w, B, i, x0, y0, z0, x1, y1, z1);
    if (!done && k !== 2) {
      // Brocken fangen Bolzen ab
      const t = rockHit(w, x0, y0, z0, x1, y1, z1);
      if (t >= 0) { w.bus.emit('impact', { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: z0 + (z1 - z0) * t, from: B.from[i] }); done = true; }
    }
    B.x[i] = x1; B.y[i] = y1; B.z[i] = z1;
    if (!done && B.life[i] <= 0) {
      if (k === 2) enemyBoltLand(w, B, i);
      done = true;
    }
    if (done) { B.on[i] = 0; B.from[i] = null; continue; }
    live++;
  }
  B.n = live;
}

function rockHit(w, x0, y0, z0, x1, y1, z1) {
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  const n = w.rockGrid.query(mx, mz, half + Cfg.ROCK_RADIUS[1] + 4, ROCKS3);
  let best = -1;
  for (let j = 0; j < n; j++) {
    const r = ROCKS3[j];
    const t = segSphere(x0, y0, z0, x1, y1, z1, r.x, r.y, r.z, r.x, r.y, r.z, r.radius);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

function playerBolt(w, B, i, x0, y0, z0, x1, y1, z1) {
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, half = Math.hypot(x1 - x0, z1 - z0) / 2;
  const n = w.grid.query(mx, mz, half + 260, NEAR);
  let best = null, bt = 2;
  for (let j = 0; j < n; j++) {
    const e = NEAR[j];
    if (!e.alive) continue;
    const t = segSphere(x0, y0, z0, x1, y1, z1, e.px, e.py, e.pz, e.x, e.y, e.z, e.radius * ENEMY_HIT_PAD);
    if (t >= 0 && t < bt) { bt = t; best = e; }
  }
  for (let j = 0; j < REM.length; j++) {
    const e = REM[j], c = CLASS[e.ship] || CLASS.s1;
    capsuleAxis(e, _b);
    const t = segCapsule(x0, y0, z0, x1, y1, z1, e.px ?? e.x, e.py ?? e.y ?? 0, e.pz ?? e.z, e.x, e.y || 0, e.z, _b[0], _b[1], _b[2], Math.max(0, c.len / 2 - c.rad), c.rad);
    if (t >= 0 && t < bt) { bt = t; best = e; }
  }
  if (!best) return false;
  const hx = x0 + (x1 - x0) * bt, hy = y0 + (y1 - y0) * bt, hz = z0 + (z1 - z0) * bt;
  const L = LASERS[B.type[i]] || LASERS.pulse;
  const ammo = AMMO_KEYS3[B.ammo[i]] || 'L1';
  const mult = (AMMO[ammo] || AMMO.L1).mult, crit = !!B.crit[i];
  const cm = crit && ammo !== 'SAL' ? Cfg.CRIT_MULT : 1;
  const dmg = rollDamage(w.rng, L.damage, mult * cm) * B.dmg[i];
  const v = Math.hypot(B.vx[i], B.vy[i], B.vz[i]) || 1;
  const dx = B.vx[i] / v, dy = B.vy[i] / v, dz = B.vz[i] / v, dl = Math.hypot(dx, dz) || 1;
  if (!w.player.targetId && best.kind === 'enemy') w.setTarget(best.id);
  w._hy = hy; w._hdy = dy;
  w._boltHit = { x: hx, y: hy, z: hz, t: w.time };
  w._hitEnemy(best, dmg, !!B.shield[i], crit, dx / dl, dz / dl, hx, hz);
  w._hy = null; w._hdy = 0; w._boltHit = null;
  w.stats3.boltHits++;
  return true;
}

function capsuleAxis(e, out) {
  if (e.q) { qRot(out, e.q, AXZ); return out; }
  out[0] = -Math.sin(e.rot || 0); out[1] = 0; out[2] = -Math.cos(e.rot || 0);
  return out;
}
const AXZ = new Float64Array([0, 0, -1]);

// ───────────────────────── Gegnerfeuer in 3D ─────────────────────────

/** Trefferchance in 3D (gleiche Regeln wie world.hitChance, Abstand und Querbewegung räumlich) */
export function hitChance3d(w, shooter, range, tgt) {
  const dx = tgt.x - shooter.x, dy = (tgt.y || 0) - (shooter.y || 0), dz = tgt.z - shooter.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  const k = d / (range > 1 ? range : 1);
  let c = Cfg.HIT_CHANCE;
  if (k > Cfg.HIT_RANGE_FREE) c -= Cfg.HIT_RANGE_LOSS * Math.min(1, (k - Cfg.HIT_RANGE_FREE) / (1 - Cfg.HIT_RANGE_FREE));
  else c += Cfg.HIT_CLOSE_BONUS * (1 - k / Cfg.HIT_RANGE_FREE);
  const rvx = (tgt.vx || 0) - (shooter.vx || 0), rvy = (tgt.vy || 0) - (shooter.vy || 0), rvz = (tgt.vz || 0) - (shooter.vz || 0);
  const cx = rvy * dz - rvz * dy, cy = rvz * dx - rvx * dz, cz = rvx * dy - rvy * dx;
  const cross = Math.sqrt(cx * cx + cy * cy + cz * cz) / d;
  c -= Cfg.HIT_CROSS_LOSS * Math.min(1, cross / Cfg.HIT_CROSS_SPEED);
  if (shooter === w.player && w._jamUntil > w.time) c -= 0.15;
  return c < Cfg.HIT_MIN ? Cfg.HIT_MIN : c > Cfg.HIT_MAX ? Cfg.HIT_MAX : c;
}

/** Bug eines Gegners (rot, pitch) → out */
export function enemyFwd(e, out) {
  const cp = Math.cos(e.pitch || 0);
  out[0] = -Math.sin(e.rot) * cp; out[1] = Math.sin(e.pitch || 0); out[2] = -Math.cos(e.rot) * cp;
  return out;
}

/**
 * Gegner feuert in 3D (Etappe 1): Feuerkegel als 3D-Kegel, Treffer gewürfelt mit 3D-Querbewegung. Der sichtbare
 * Bolzen fliegt zum Vorhaltepunkt; Schaden erst bei Ankunft und nur, wenn der Spieler dann noch dort ist (Ausweichen
 * zählt ehrlich). Etappe 2 (world.enemyBolts): echte Bolzen mit Vorhalt und Fehler je Rang, Treffer gegen die Kapsel.
 */
export function enemyFire3d(w, e, tgt) {
  const p = w.player, toPlayer = tgt === p;
  if (toPlayer ? !w.playerTargetable() : !tgt.alive) return true;
  const dx = tgt.x - e.x, dy = (tgt.y || 0) - e.y, dz = tgt.z - e.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  enemyFwd(e, _f);
  if (Math.acos(Math.max(-1, Math.min(1, (dx * _f[0] + dy * _f[1] + dz * _f[2]) / d))) > Cfg.ENEMY_FIRE_ARC) return false;
  if (toPlayer) w._lastCombat = w.time;
  // Vorhaltepunkt (gleiche Regel wie beim Spieler: Bolzen erben nichts)
  _o[0] = e.x + _f[0] * e.radius; _o[1] = e.y + _f[1] * e.radius; _o[2] = e.z + _f[2] * e.radius;
  _b[0] = tgt.x; _b[1] = tgt.y || 0; _b[2] = tgt.z; _d[0] = tgt.vx || 0; _d[1] = tgt.vy || 0; _d[2] = tgt.vz || 0;
  if (toPlayer) { const j = ((w._pvi + 1) % (LEAD_DELAY + 1)) * 3; _d[0] = w._pvh[j]; _d[1] = w._pvh[j + 1]; _d[2] = w._pvh[j + 2]; }
  if (leadPoint(_o, _b, _d, ENEMY_BOLT_SPEED, _lp) < 0) { _lp[0] = _b[0]; _lp[1] = _b[1]; _lp[2] = _b[2]; }
  if (w.enemyBolts && toPlayer) {
    // Etappe 2: Fehler je Rang (normal 3°, Elite 1,5°, Alpha 0,8°), Treffer entscheidet die Kapsel
    const sig = (e.rank === 'alpha' ? 0.8 : e.rank === 'elite' ? 1.5 : 3) * D;
    spawnEnemyBolt(w, e, 3, _lp, sig, rollDamage(w.rng, e.def.damage, e.dmgMult));
    w.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit: false, enemyType: e.type, bolt: true, x: _lp[0], y: _lp[1], z: _lp[2], dx: dx / d, dy: dy / d, dz: dz / d });
    return true;
  }
  const hit = w.rng.next() < w.hitChance(e, e.def.range, tgt);
  if (w.losBlocked(e.x, e.z, tgt.x, tgt.z, 2, e.y, tgt.y || 0)) {
    segRock3(w, e, tgt, 2, w._pt);
    w.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit: false, enemyType: e.type, x: w._pt.x, z: w._pt.z, y: w._pt.y, dx: dx / d, dz: dz / d, blocked: true, bolt: true });
    spawnEnemyBolt(w, e, 2, aimPt(w._pt), 0, 0, false);
    return true;
  }
  const dmg = hit ? rollDamage(w.rng, e.def.damage, e.dmgMult) : 0;
  if (!toPlayer) {
    // Frachter (Konvoi): sofort wie im Taktikweg
    w.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit, enemyType: e.type, x: tgt.x, z: tgt.z, y: tgt.y || 0, dx: dx / d, dz: dz / d });
    if (!hit) return true;
    applyDamage(tgt, dmg, false, HIT);
    w.bus.emit('damage', { id: tgt.id, hull: HIT.hull, shield: HIT.shield, x: tgt.x, z: tgt.z, y: tgt.y || 0, crit: false, dx: dx / d, dz: dz / d, hx: tgt.x, hz: tgt.z, from: e.id });
    if (tgt.hp <= 0) w._freighterDown(tgt);
    return true;
  }
  if (!hit) {
    // Fehlwurf: Bolzen fliegt sichtbar am Schiff vorbei (seitlich versetzt, Vorbeiflug-Ton)
    const side = w.rngY.next() < 0.5 ? -1 : 1, off = (p.radius * 2.2 + 14) * side;
    _lp[0] += -dz / d * off; _lp[2] += dx / d * off; _lp[1] += (w.rngY.next() - 0.5) * p.radius * 2;
  }
  w.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit, enemyType: e.type, bolt: true, x: _lp[0], y: _lp[1], z: _lp[2], dx: dx / d, dz: dz / d, dy: dy / d });
  spawnEnemyBolt(w, e, 2, _lp, 0, dmg, hit);
  return true;
}
const _ap = new Float64Array(3);
function aimPt(pt) { _ap[0] = pt.x; _ap[1] = pt.y || 0; _ap[2] = pt.z; return _ap; }

function spawnEnemyBolt(w, e, kind, aim, sig, dmg, plan = false) {
  const B = w.bolts;
  let i = -1;
  for (let k = 0; k < B.cap; k++) { const j = (B.seq + k) % B.cap; if (!B.on[j]) { i = j; break; } }
  if (i < 0) return;
  enemyFwd(e, _f);
  const sx = e.x + _f[0] * e.radius, sy = e.y + _f[1] * e.radius, sz = e.z + _f[2] * e.radius;
  let dx = aim[0] - sx, dy = aim[1] - sy, dz = aim[2] - sz;
  const dist = Math.hypot(dx, dy, dz) || 1;
  dx /= dist; dy /= dist; dz /= dist;
  if (sig > 0) {
    // Streuung (Etappe 2): zwei Normalwerte aus dem abgeleiteten Zufall
    const a = w.rngY.next() * Math.PI * 2, r = sig * Math.sqrt(-2 * Math.log(1 - w.rngY.next() * 0.999));
    const ux = -dz, uz = dx, ul = Math.hypot(ux, uz) || 1;
    const vx = dy * uz / ul, vy = (dz * ux - dx * uz) / ul, vz = -dy * ux / ul;
    dx += (ux / ul) * Math.cos(a) * r + vx * Math.sin(a) * r; dz += (uz / ul) * Math.cos(a) * r + vz * Math.sin(a) * r; dy += vy * Math.sin(a) * r;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  }
  B.on[i] = 1; B.kind[i] = kind; B.n++; B.seq = (i + 1) % B.cap; B.id[i] = ++B._id;
  B.x[i] = sx; B.y[i] = sy; B.z[i] = sz;
  B.vx[i] = dx * ENEMY_BOLT_SPEED; B.vy[i] = dy * ENEMY_BOLT_SPEED; B.vz[i] = dz * ENEMY_BOLT_SPEED;
  B.life[i] = kind === 2 ? dist / ENEMY_BOLT_SPEED : (e.def.range * 1.2) / ENEMY_BOLT_SPEED; B.age[i] = 0;
  B.dmg[i] = dmg; B.plan[i] = plan ? 1 : 0; B.ax[i] = aim[0]; B.ay[i] = aim[1]; B.az[i] = aim[2];
  B.from[i] = e.id; B.type[i] = e.type; B.crit[i] = 0; B.sal[i] = 0;
}

/** Abstand Punkt → Kapsel des Spielers */
function playerCapsuleDist(w, x, y, z) {
  const p = w.player, P = w.flP;
  fwdOf(_f, w.fl.q);
  const L = Math.max(0, P.len / 2 - P.rad);
  const rx = x - p.x, ry = y - p.y, rz = z - p.z;
  let t = rx * _f[0] + ry * _f[1] + rz * _f[2];
  t = Math.max(-L, Math.min(L, t));
  return Math.hypot(rx - _f[0] * t, ry - _f[1] * t, rz - _f[2] * t) - P.rad;
}

/** Gewürfelter Gegnerbolzen kommt an: Schaden nur, wenn der Spieler noch am Vorhaltepunkt ist (Ausweichen zählt) */
function enemyBoltLand(w, B, i) {
  if (!B.plan[i]) return;
  const e = w.entities.get(B.from[i]);
  if (!w.playerTargetable()) return;
  const miss = playerCapsuleDist(w, B.ax[i], B.ay[i], B.az[i]);
  if (miss > 14) { w.bus.emit('dodge', { from: B.from[i], miss }); return; }
  applyEnemyHit(w, e, B.dmg[i], B.vx[i], B.vy[i], B.vz[i], B.ax[i], B.ay[i], B.az[i]);
}

function enemyBoltReal(w, B, i, x0, y0, z0, x1, y1, z1) {
  if (!w.playerTargetable()) return false;
  const p = w.player, P = w.flP;
  fwdOf(_f, w.fl.q);
  const t = segCapsule(x0, y0, z0, x1, y1, z1, p.px, p.py, p.pz, p.x, p.y, p.z, _f[0], _f[1], _f[2], Math.max(0, P.len / 2 - P.rad), P.rad);
  if (t < 0) return false;
  applyEnemyHit(w, w.entities.get(B.from[i]), B.dmg[i], B.vx[i], B.vy[i], B.vz[i], x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t);
  return true;
}

function applyEnemyHit(w, e, dmg, vx, vy, vz, hx, hy, hz) {
  const p = w.player;
  if (!(dmg > 0)) return;
  w._lastCombat = w.time;
  if (sosAbsorb(w, dmg)) return;
  applyDamage(p, dmg, false, HIT);
  const v = Math.hypot(vx, vz) || 1;
  w.bus.emit('damage', { id: 'player', hull: HIT.hull, shield: HIT.shield, x: p.x, z: p.z, y: p.y, hy, crit: false, dx: vx / v, dz: vz / v, dy: vy / (Math.hypot(vx, vy, vz) || 1), hx, hz, from: e ? e.id : 'enemy' });
  w._lastHit = w.time;
  if (interruptMode(w.fl)) w.bus.emit('flight', { msg: 'REISE ABGEBROCHEN · TREFFER' });
  if (p.hp <= 0) w._playerDie();
}

// ───────────────────────── Sichtlinie und Traktor ─────────────────────────

export function segRock3(w, a, b, pad, out) { return segRock3xyz(w, a.x, a.y || 0, a.z, b.x, b.y || 0, b.z, pad, out); }
export function segRock3xyz(w, ax, ay, az, bx, by, bz, pad, out) {
  const rs = w.rocks;
  let best = 2;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i], R = r.radius + pad;
    // Start oder Ziel am Brocken zählt nicht als Deckung (wie im Taktikweg)
    if ((r.x - ax) ** 2 + (r.y - ay) ** 2 + (r.z - az) ** 2 < R * R) continue;
    if ((r.x - bx) ** 2 + (r.y - by) ** 2 + (r.z - bz) ** 2 < R * R) continue;
    const t = segSphere(ax, ay, az, bx, by, bz, r.x, r.y, r.z, r.x, r.y, r.z, R);
    if (t >= 0 && t < best) best = t;
  }
  if (best > 1) return false;
  if (out) { out.x = ax + (bx - ax) * best; out.y = ay + (by - ay) * best; out.z = az + (bz - az) * best; }
  return true;
}

/** Beute-Traktor: ab 150 m ziehen Wracks, Kisten und Erz zum Schiff (außerhalb des Kampfes schneller) */
export function tractor(w, dt) {
  const p = w.player;
  if (!p.alive || w.docked) return;
  const sp = TRACTOR_SPEED * (w.inCombat ? 1 : 2) * dt;
  const full = w.cargoMax - w.cargoUsed <= 0;
  const pull = (o) => {
    o.px = o.x; o.py = o.y; o.pz = o.z;
    const dx = p.x - o.x, dy = p.y - o.y, dz = p.z - o.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > TRACTOR_RANGE || d < 1) return;
    const k = Math.min(1, sp / d);
    o.x += dx * k; o.y += dy * k; o.z += dz * k;
  };
  for (const o of w.wrecks) if (o.owner === 'player' || !(w.time < o.protectedUntil)) pull(o); else { o.py = o.y; }
  for (const o of w.crates) if (o.alive) pull(o);
  if (!full) for (const o of w.ores) if (o.alive) pull(o);
}

/** Gegner-Höhenband je Ziel: gegen einen Piloten in der Taktikansicht flach (±40 m um dessen Höhe) */
export function flatFor(w, tgt) {
  if (!tgt) return false;
  if (tgt === w.player) return !w.flight3d;
  return tgt.view === 'tactical';
}
export { FLAT_BAND, droneShield, headingOf, ENEMIES };
