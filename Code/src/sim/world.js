// Spiel-Simulation: reine Logik ohne Grafik und ohne DOM (soll später auch auf dem Server laufen).
// Feste Schrittweite 1/60 s, deterministischer Zufall mit Seed, räumliches Raster für Nachbarsuche.
// Pro Schritt keine Speicher-Neuanlage: Listen, Zwischenwerte und Effekt-Objekte werden wiederverwendet.
// Nur seltene Ereignisse (Abschuss, Beute, Meldungen) legen kleine Nutzlast-Objekte an.
import {
  FACTIONS, ENEMIES, LASERS, AMMO, ROCKETS, GENERATORS, SHIPS, ORES, CRATE_TABLE, DRIFT_CRATE_TABLE, QUESTS, REPAIR,
  VARIANTS, ALPHA_PERKS, xpForLevel, MAX_LEVEL, sectorsFor, REWARD_SCALE, COMBO, SPECIALS,
  EXTRAS, MINES, TECHS, FORMATIONS, DRONES, DRONE_SHOP, DRONE_RULES,
} from '../core/data.js';
import {
  normalizeDrones, initDrones, updateDrones, droneShield, dronesOnKill, dronesOnDeath, addDrone, sellDrone, repairDrone,
  setDroneModule, droneInfo,
} from './drones.js';
import {
  initAbilities, updateAbilities, resetAbilities, breakCloak, sosAbsorb, leech, rocketHits, useExtra, useTech, layMine,
  setFormation, setConfig, syncConfig, resetConfigsForShip, normalizeAbilities,
} from './abilities.js';
import { store } from '../core/store.js';
import { Rng, hashString } from './rng.js';
import { SpatialHash } from './spatial.js';
import { rollDamage, applyDamage, turnToward, headingOf, wrapAngle, fmt } from './combat.js';
import {
  thinkEnemy, moveEnemy, pickWander, calmDown, beginAttack, directCombat, engaged, cancelSpecial, tryGuard, thinkNest, jink, aiOf,
} from './ai.js';
import {
  sectorRoutes, makeGroup, leaderOf, placeGroupCenter, slotPos, slotGap, pointOk, rockLayout, habitatQuota,
} from './spawn.js';
import {
  resetEvents, updateEvents, startEvent, eventEnemyKilled, eventCrateOpened, freighterDestroyed, whereText, rewardText,
} from './events.js';
import * as C from './config.js';

const AMMO_KEYS = ['L1', 'L2', 'L3', 'L4', 'SAB', 'SAL'];
const MAX_LASERS = 16;
const HIT = { hull: 0, shield: 0 };   // wiederverwendetes Schadensergebnis
const REFL = { hull: 0, shield: 0 };
const PERK_KEYS = Object.keys(ALPHA_PERKS);
const ROCKS = [];                     // wiederverwendete Trefferliste (Brocken am Spieler)
const SLOT = { x: 0, z: 0 };
const RW = { xp: 1, credits: 1, honor: 1, gray: false }; // wiederverwendetes Ergebnis der Belohnungs-Staffelung
const HAZARDS = 8;                    // höchstens so viele Säurewolken gleichzeitig

// Preis je Packung. In data.js ist `price` je Schuss angegeben, nur bei L1 je Packung
// („L1 kostet 10 Credits pro 1.000 Schuss“, L2 „1.000 Credits je 1.000“).
function packCost(key, def) {
  if (key === 'L1') return def.price;
  return Math.round(def.price * def.pack);
}

const CURRENCY_NAME = { credits: 'Credits', tritium: 'Tritium' };
const SHOP_TABLE = { extra: EXTRAS, mine: MINES, tech: TECHS, formation: FORMATIONS, drone: DRONE_SHOP };

function makeEntity(id, kind) {
  return {
    id, kind, type: null, faction: null,
    x: 0, z: 0, vx: 0, vz: 0, rot: 0, radius: 10,
    hp: 0, hpMax: 0, shield: 0, shieldMax: 0,
    targetId: null, attacking: false,
    alive: true, safe: false,
    name: '', loadout: null, ship: null,
    owner: null, protectedUntil: 0,
    px: 0, pz: 0, prot: 0,
    speed: 0, thrust: 0,          // aktuelles Tempo (m/s) und Schubstärke 0..1 für die Grafik
  };
}

function makeEnemy(id, type) {
  const def = ENEMIES[type];
  const e = makeEntity(id, 'enemy');
  e.type = type;
  e.name = def.name;
  e.radius = def.radius;
  e.hpMax = def.hp; e.hp = def.hp;
  e.shieldMax = def.shield; e.shield = def.shield;
  // Variante (für Grafik/HUD lesbar): rank 'normal'|'elite'|'alpha', perk null|'regen'|'summon'|'reflect'
  e.rank = 'normal'; e.perk = null;
  e.stagger = 0;               // 0..1 Taumeln nach Treffer (klingt ab)
  e.hitAt = -999;              // Simulationszeit des letzten Treffers
  // KI-Felder
  e.def = def;
  e.state = 'wander';
  e.homeX = 0; e.homeZ = 0; e.wx = 0; e.wz = 0; e.wanderR = 0;
  e.waitT = 0; e.fireCd = 0; e.thinkCd = 0;
  e.provoked = false; e.orbitDir = 1; e.orbitK = 1; e.lootId = null;
  e.respawnAt = 0; e.temp = false; e.expire = false;
  e.group = null; e.slot = 0;
  e.behavior = null; e.aggro = null;
  e.huntId = null; e.evTag = null;
  e.dmgMult = 1; e.lootMult = 1;
  e.noticed = false; e.summonStep = 0;
  e.dodgeCd = 0; e.wob = 0; e.phase = 0;
  // Persönlichkeit, Regie, Spezialangriffe (ai.js). Für Grafik/Ton lesbar: charge, cloak, guard, bank, tactic
  e.tactic = null;             // Text der aktuellen Taktik (Test-Pilot), z. B. 'flanke', 'wartet im kreis', 'lädt salve'
  e.token = false; e.tokenT = 0; e.dirScore = 0; e.dirA = 0; e.flankA = 0; e.pounceAt = -999;
  e.spK = null; e.spPhase = 0; e.spT = 0; e.spCd = 0; e.spN = 0; e.spHit = false;
  e.spX = 0; e.spZ = 0; e.spDx = 0; e.spDz = 0; e.spR = 0; e.spLen = 0; e.spAx = 0; e.spAz = 0;
  e.charge = 0;                // 0..1 Aufladen eines Spezialangriffs (Leuchten)
  e.cloak = 0;                 // 0..1 Tarnung (Jackal beim Lauern)
  e.guard = 0; e.guardT = 0; e.guardCd = 0; e.dmgWin = 0; // Schildwall aktiv (1) / Restzeit / Abklingzeit / Schaden der letzten ~2 s
  e.jinkT = 0; e.jinkX = 0; e.jinkZ = 0;
  e.stalk = false; e.retreated = false; e.retreatT = 0; e.lootRun = false;
  e.hasCover = false; e.coverX = 0; e.coverZ = 0; e.healing = false; e.losBad = false;
  e.bank = 0;                  // Schräglage beim Kurven (rad, wie beim Spieler)
  e.jamT = 0;                  // EMP/Störmine: so lange keine Zielerfassung
  e.slowT = 0; e.slowK = 1;    // Bremsmine: so lange Tempo × slowK
  return e;
}

/** Sind zwei Punkte durch einen großen Asteroiden getrennt? (Strecke a→b gegen Brocken + pad) Eintrittspunkt → out. */
function segRock(rocks, ax, az, bx, bz, pad, out) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  if (L2 < 1) return false;
  let bestT = 2;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    const R = r.radius + pad;
    // grobe Vorprüfung über das umschließende Rechteck
    if (r.x + R < (ax < bx ? ax : bx) || r.x - R > (ax > bx ? ax : bx) || r.z + R < (az < bz ? az : bz) || r.z - R > (az > bz ? az : bz)) continue;
    const cx = r.x - ax, cz = r.z - az;
    // Start oder Ziel liegt selbst am Brocken: zählt nicht als Deckung
    if (cx * cx + cz * cz < R * R) continue;
    const ex = r.x - bx, ez = r.z - bz;
    if (ex * ex + ez * ez < R * R) continue;
    let t = (cx * dx + cz * dz) / L2;
    if (t <= 0 || t >= 1) continue;
    const qx = cx - dx * t, qz = cz - dz * t;
    const q2 = qx * qx + qz * qz;
    if (q2 >= R * R) continue;
    t -= Math.sqrt(R * R - q2) / Math.sqrt(L2);
    if (t < bestT) bestT = t;
  }
  if (bestT > 1) return false;
  if (out) { out.x = ax + dx * bestT; out.z = az + dz * bestT; }
  return true;
}

export class World {
  /**
   * @param profile Spielstand aus store
   * @param bus     Ereignis-Bus (on/off/emit)
   * @param opts    { seed } optional, für reproduzierbare Abläufe (Tests, Server)
   */
  constructor(profile, bus, opts = {}) {
    this.profile = profile;
    this.bus = bus;
    normalizeProfile(profile);
    normalizeAbilities(profile);
    this._droneKitNew = normalizeDrones(profile);
    this.rng = new Rng(opts.seed != null ? opts.seed : hashString(`${profile.callsign}|${profile.created || ''}`));

    this.time = 0;
    this.entities = new Map();
    this.enemies = [];
    this.crates = [];
    this.ores = [];
    this.wrecks = [];
    this.portals = [];
    this.station = null;
    this.rocks = [];                 // große Asteroiden (kind 'asteroid'), statisch
    this.movers = [];                // bewegte Sonder-Entities (Frachter)
    this.groups = [];                // Rudel
    this._routes = [];
    this.grid = new SpatialHash(6000, 250, 128);
    this.rockGrid = new SpatialHash(6000, 400, 64);
    this.event = null;               // laufendes Sektor-Ereignis (Anzeige), siehe events.js

    // Anzeige-Felder (SCHNITTSTELLEN.md)
    this.docked = false;
    this.inCombat = false;
    this.jump = null;
    this.salReadyIn = 0;
    this.rocketReadyIn = 0;
    this.nearPortal = null;
    this.inSafeZone = false;
    this.quest = null;
    this.playerDead = false;

    // intern
    this._acc = 0;
    this._wreckPool = [];
    this._wreckSeq = 0;
    this._trapSeq = 0;
    this._tempSeq = 0;
    this._alpha = null;              // lebender Alpha-Gegner (höchstens einer)
    this._announce = null;           // Alpha-Sichtung, die noch gemeldet werden muss
    this._laserCd = new Float64Array(MAX_LASERS);
    this._wasFiring = false;
    this._salCd = 0;
    this._rocketCd = 0;
    this._rockets = [];
    for (let i = 0; i < 8; i++) this._rockets.push({ active: false, targetId: null, t: 0, rocket: 'R1' });
    this._pending = [];              // versetzte Schüsse (SAL-Salve)
    for (let i = 0; i < MAX_LASERS; i++) this._pending.push({ active: false, t: 0, laser: null, targetId: null, idx: 0 });
    this._lastHit = -999;
    this._lastCombat = -999;
    this._invulnUntil = 0;
    this._speed = 0;
    this._spool = 0;                 // Triebwerks-Hochlauf 0..1 (intern)
    this._outAcc = 0;
    this._outTick = 0;
    this._autosaveAt = C.AUTOSAVE_INTERVAL;
    this._profileDirty = false;
    this._profileEmitAt = 0;
    this._msgTimes = new Map();
    this._rangeWarnId = null;        // Ziel, für das „zu weit weg“ schon gemeldet wurde
    this._rangeWarnAt = 0;
    this._jumpObj = { progress: 0, t: 0, portal: null, to: null };
    this._questObj = { def: null, progress: 0 };
    this._questNextAt = 2;
    this._pt = { x: 0, z: 0 };
    this._near = [];                 // wiederverwendete Trefferliste (Rudel)
    // Kampf-Regie und Spezialangriffe (ai.js)
    this._dirCd = 0;                 // Regie denkt 4× pro Sekunde
    this._ringDir = 1;               // Drehrichtung des Angreiferrings
    this._flankT = 0;
    this._spNext = 0;                // nächster Spezialangriff frühestens dann (ganzer Sektor)
    this._callNext = 0;              // nächster Hilferuf frühestens dann
    // Gefahrenzonen (Säurewolken), feste Liste für die Grafik: { active, kind, id, x, z, radius, t, duration, dps, from }
    this.hazards = [];
    for (let i = 0; i < HAZARDS; i++) this.hazards.push({ active: false, kind: null, id: `hz${i}`, x: 0, z: 0, radius: 0, t: 0, duration: 0, dps: 0, from: null, acc: 0, tick: 0 });
    // Combo: schnelle Abschüsse hintereinander (Anzeige: world.combo = { count, timeLeft, mult, xp, credits })
    this.combo = { count: 0, timeLeft: 0, mult: 0, xp: 0, credits: 0, honor: 0, best: 0 };
    this._lastAimOk = true;

    // Spieler
    const p = makeEntity('player', 'player');
    p.faction = profile.faction;
    p.name = profile.callsign;
    p.radius = C.PLAYER_RADIUS;
    p.loadout = profile.loadout;
    p.ship = profile.ship;
    p.tx = 0; p.tz = 0; p.hasMove = false;
    p.fs = 0;                        // Tempo entlang der Flugrichtung (intern)
    p.course = 0;                    // Flugrichtung (intern; im Angriff kann die Nase davon abweichen)
    // Fluggefühl für die Grafik: bank = Schräglage (rad, > 0 = nach links geneigt wie three.js rotation.z eines
    // nach −z blickenden Modells, also in Linkskurven), pitch = Nicken (rad, > 0 = Nase hoch beim Beschleunigen,
    // < 0 = Nase runter beim Bremsen), turnRate = Drehrate (rad/s, > 0 = links), accel = Beschleunigung entlang
    // der Flugrichtung (m/s²), slip = seitliches Driften (m/s, > 0 = nach rechts), aim = Nase folgt dem Ziel (Angriff)
    p.bank = 0; p.pitch = 0; p.turnRate = 0; p.accel = 0; p.slip = 0; p.aim = false;
    this.player = p;
    this._abilityHit = false;        // Schaden aus Extras/Techs/Minen (kein VMP-Heilen, keine Laser-Regeln)
    initAbilities(this);
    this._refreshStats();
    p.hp = p.hpMax;
    p.shield = p.shieldMax;
    initDrones(this);

    this.sectors = sectorsFor(profile.faction);
    if (!this.sectors[profile.sector]) profile.sector = homeSectorId(profile.faction);
    this._buildSector(profile.sector);
    this._placeAtSpawn();
    this._updateZones();
  }

  // ───────────────────────── Hauptschleife ─────────────────────────

  update(dt) {
    this._acc += dt;
    const max = C.STEP * C.MAX_STEPS_PER_UPDATE;
    if (this._acc > max) this._acc = max;
    while (this._acc >= C.STEP - 1e-9) {
      this._acc -= C.STEP;
      this._step(C.STEP);
    }
    if (this._acc < 0) this._acc = 0;
  }

  _step(dt) {
    this.time += dt;
    const t = this.time;
    const p = this.player;
    this.profile.stats.playSeconds += dt;

    // Position vor dem Schritt (für weiche Darstellung)
    p.px = p.x; p.pz = p.z; p.prot = p.rot;
    const en = this.enemies;
    for (let i = 0; i < en.length; i++) { const e = en[i]; e.px = e.x; e.pz = e.z; e.prot = e.rot; }
    const wr = this.wrecks;
    for (let i = 0; i < wr.length; i++) { const e = wr[i]; e.px = e.x; e.pz = e.z; e.prot = e.rot; }
    const mv = this.movers;
    for (let i = 0; i < mv.length; i++) { const e = mv[i]; e.px = e.x; e.pz = e.z; e.prot = e.rot; }

    // Raster neu füllen
    const g = this.grid;
    g.clear();
    for (let i = 0; i < en.length; i++) if (en[i].alive) g.insert(en[i]);

    this._updatePlayer(dt);

    // Kampf-Regie: höchstens 3–4 aktive Angreifer, Rest wartet im Kreis
    this._dirCd -= dt;
    if (this._dirCd <= 0) { this._dirCd += C.THINK_INTERVAL; directCombat(this); }

    // Gegner
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.alive) {
        if (!e.temp && t >= e.respawnAt) this._respawnEnemy(e);
        continue;
      }
      if (e.rank === 'alpha') this._alphaTick(e, dt);
      e.thinkCd -= dt;
      if (e.state === 'nest') {
        if (e.thinkCd <= 0) { e.thinkCd += C.THINK_INTERVAL; thinkNest(this, e); }
        moveEnemy(this, e, dt);
        continue;
      }
      if (e.thinkCd <= 0) { e.thinkCd += C.THINK_INTERVAL; thinkEnemy(this, e); }
      if (!e.alive) continue;
      moveEnemy(this, e, dt);
      // übrig gebliebene Ereignis-Gegner verschwinden, sobald sie außer Sicht und friedlich sind
      if (e.expire && !engaged(e)) {
        const dx = e.x - p.x, dz = e.z - p.z;
        if (dx * dx + dz * dz > C.EVENT_CLEANUP_DIST * C.EVENT_CLEANUP_DIST) {
          e.alive = false;
          this.entities.delete(e.id);
          this.bus.emit('despawn', { id: e.id });
        }
      }
    }
    // vorübergehende Gegner (Falle, Ereignisse) nach Tod entfernen
    for (let i = en.length - 1; i >= 0; i--) if (en[i].temp && !en[i].alive) en.splice(i, 1);

    updateEvents(this, dt);
    if (this._announce && t >= 2) this._announceAlpha();
    this._updateHazards(dt);
    updateAbilities(this, dt);
    this._updateCombo(dt);

    this._updateRockets(dt);

    // Wracks verfallen
    for (let i = wr.length - 1; i >= 0; i--) {
      if (t >= wr[i].expireAt) this._removeWreck(i);
    }
    // Crates und Erz nachwachsen lassen
    const cr = this.crates;
    for (let i = 0; i < cr.length; i++) {
      const c = cr[i];
      if (!c.alive && !c.temp && t >= c.respawnAt) { this._itemPoint(false); c.x = c.px = this._pt.x; c.z = c.pz = this._pt.z; this._revive(c); }
    }
    const ore = this.ores;
    for (let i = 0; i < ore.length; i++) {
      const o = ore[i];
      if (!o.alive && t >= o.respawnAt) {
        this._itemPoint(this.rng.next() < C.ORE_IN_FIELDS);
        o.x = o.px = this._pt.x; o.z = o.pz = this._pt.z;
        o.amount = this.rng.int(C.ORE_CHUNK[0], C.ORE_CHUNK[1]);
        this._revive(o);
      }
    }

    // Quest-Funkspruch
    if (!this.quest && this._questNextAt > 0 && t >= this._questNextAt) {
      this._questNextAt = 0;
      this._startQuest();
    }

    // Anzeige-Werte
    this.inCombat = t - this._lastCombat < C.COMBAT_TIMEOUT;
    this.salReadyIn = this._salCd > 0 ? this._salCd : 0;
    this.rocketReadyIn = this._rocketCd > 0 ? this._rocketCd : 0;

    // Autosave
    if (t >= this._autosaveAt) { this._autosaveAt = t + C.AUTOSAVE_INTERVAL; this.save(); }
    if (this._profileDirty && t >= this._profileEmitAt) this._emitProfile();

    // Sprung zuletzt (baut ggf. die Welt neu auf)
    if (this.jump) this._updateJump(dt);
  }

  // ───────────────────────── Spieler ─────────────────────────

  _updatePlayer(dt) {
    const p = this.player;
    const t = this.time;
    if (this._salCd > 0) this._salCd -= dt;
    if (this._rocketCd > 0) this._rocketCd -= dt;

    if (!p.alive) {
      this._haltPlayer();
      this.nearPortal = null;
      return;
    }

    const tgt = p.targetId ? this.entities.get(p.targetId) : null;
    if (this.docked) { this._haltPlayer(); p.hasMove = false; }
    else this._movePlayer(dt, tgt);

    this._updateZones();

    // außerhalb der Karte
    const size = this.sector.size;
    if (Math.abs(p.x) > size || Math.abs(p.z) > size) {
      this._msg('Achtung: Du bist außerhalb der Karte! Dein Schiff nimmt Schaden. Flieg zurück.', 'warn', 'oob', 3);
      if (t >= this._invulnUntil) {
        const d = p.hpMax * C.OUT_OF_MAP_DAMAGE * dt;
        p.hp -= d;
        this._outAcc += d;
        this._outTick += dt;
        if (this._outTick >= 1) {
          this.bus.emit('damage', { id: 'player', hull: Math.round(this._outAcc), shield: 0, x: p.x, z: p.z, crit: false });
          this._outTick = 0; this._outAcc = 0;
        }
        if (p.hp <= 0) { p.hp = 0; this._playerDie(); return; }
      }
    } else { this._outTick = 0; this._outAcc = 0; }

    // Schild und Leben nachladen
    if (p.shield < p.shieldMax && t - this._lastHit >= C.SHIELD_REGEN_DELAY) {
      p.shield += p.shieldMax * C.SHIELD_REGEN * dt;
      if (p.shield > p.shieldMax) p.shield = p.shieldMax;
    }
    if (this.inSafeZone && !(t - this._lastCombat < C.COMBAT_TIMEOUT) && p.hp < p.hpMax) {
      p.hp += p.hpMax * C.SAFE_HULL_REGEN * dt;
      if (p.hp > p.hpMax) p.hp = p.hpMax;
    }

    this._updatePending(dt);
    this._updateLasers(dt, tgt);
    this._pickups();
  }

  /**
   * Flugmodell mit Trägheit: Schub fährt weich hoch, Beschleunigung läuft oben aus (≈ 3,5–4 s auf Höchsttempo),
   * Bremsen weich (≈ 1,8 s), Drehrate begrenzt (bei Tempo langsamer) → das Schiff fliegt Kurven.
   */
  _movePlayer(dt, tgt) {
    const p = this.player;
    const vmax = this._speed;
    const rot0 = p.rot, fs0 = p.fs;
    // Im Angriff mit Ziel in Reichweite folgt die Nase dem Ziel (Laser zeigen nach vorn), geflogen wird weiter
    // in Befehlsrichtung (seitlich/rückwärts etwas langsamer). Sonst: Nase = Flugrichtung.
    let aim = false, aimRot = 0;
    if (p.attacking && tgt && tgt.alive && tgt.kind === 'enemy') {
      const ax = tgt.x - p.x, az = tgt.z - p.z;
      if (ax * ax + az * az < (C.PLAYER_RANGE * 1.35) ** 2) { aim = true; aimRot = headingOf(ax, az); }
    }
    if (!aim && p.aim) p.course = p.rot; // zurück zum normalen Flug: Nase und Kurs wieder eins
    p.aim = aim;
    if (!aim) p.course = p.rot;
    let want = 0, wantRot = p.course, steer = false;
    if (p.hasMove) {
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < C.ARRIVE_SNAP) p.hasMove = false;
      else {
        wantRot = headingOf(dx, dz);
        steer = true;
        // so schnell, dass weiches Bremsen noch reicht; in engen Kurven Tempo rausnehmen
        let w = Math.sqrt(2 * C.PLAYER_BRAKE * vmax * 0.45 * (dist - C.ARRIVE_SNAP * 0.6));
        const ce = Math.cos(wrapAngle(wantRot - p.course));
        w *= 0.3 + 0.7 * (ce > 0 ? ce : 0);
        let cap = vmax;
        if (aim) {
          // seitlich oder rückwärts zur Nase: etwas langsamer
          const cn = Math.cos(wrapAngle(wantRot - p.rot));
          cap = vmax * (C.STRAFE_MIN + (1 - C.STRAFE_MIN) * (cn > 0 ? cn : 0));
        }
        want = w < cap ? w : cap;
      }
    }
    let spd = p.fs;
    let cmd = 0;
    if (want > spd) { cmd = (want - spd) / (0.03 * vmax); if (cmd > 1) cmd = 1; }
    const spoolK = 1 - Math.exp(-C.PLAYER_SPOOL * dt);
    this._spool += (cmd - this._spool) * spoolK;
    // Anzeige-Schub: volle Beschleunigung 1, Reiseflug ≈ 0,55 × Tempoanteil, Bremsen/Leerlauf 0
    const cruise = want > 0 && spd > 0 ? 0.55 * (spd / vmax) : 0;
    const show = want >= spd ? (this._spool > cruise ? this._spool : cruise) : 0;
    p.thrust += (show - p.thrust) * spoolK * 1.5;
    if (p.thrust < 0) p.thrust = 0; else if (p.thrust > 1) p.thrust = 1;
    if (want > spd) {
      let taper = (vmax - spd) / (C.PLAYER_ACCEL_TAPER * vmax);
      if (taper > 1) taper = 1; else if (taper < 0) taper = 0;
      spd += this._spool * C.PLAYER_ACCEL * vmax * (0.12 + 0.88 * taper) * dt;
      if (spd > want) spd = want;
    } else if (spd > want) {
      let k = (spd - want) / (0.05 * vmax); if (k > 1) k = 1;
      let low = spd / (0.4 * vmax); if (low > 1) low = 1;
      spd -= C.PLAYER_BRAKE * vmax * k * (0.35 + 0.65 * low) * dt;
      if (spd < want) spd = want;
    }
    if (spd < 0) spd = 0;
    p.fs = spd;

    // Drehen: begrenzte Drehrate, bei Höchsttempo träger
    let sk = spd / vmax; if (sk > 1) sk = 1;
    const omega = C.PLAYER_TURN + (C.PLAYER_TURN_FAST - C.PLAYER_TURN) * sk;
    if (aim) {
      p.rot = turnToward(p.rot, aimRot, omega * C.AIM_TURN * dt);
      if (steer) p.course = turnToward(p.course, wantRot, omega * dt);
    } else {
      if (steer) p.rot = turnToward(p.rot, wantRot, omega * dt);
      p.course = p.rot;
    }

    // Flugrichtung folgt dem Kurs mit leichtem Driften
    const g = 1 - Math.exp(-C.PLAYER_GRIP * (aim ? 0.8 : 1) * dt);
    const fx = -Math.sin(p.course), fz = -Math.cos(p.course);
    p.vx += (fx * spd - p.vx) * g;
    p.vz += (fz * spd - p.vz) * g;
    p.x += p.vx * dt; p.z += p.vz * dt;

    // Brocken: sanft abstoßen
    const n = this.rockGrid.query(p.x, p.z, p.radius + C.ROCK_RADIUS[1] + 20, ROCKS);
    for (let i = 0; i < n; i++) {
      const r = ROCKS[i];
      const ox = p.x - r.x, oz = p.z - r.z;
      const d = Math.sqrt(ox * ox + oz * oz) || 1;
      const min = r.radius + p.radius + 10;
      if (d >= min) continue;
      const nx = ox / d, nz = oz / d;
      const pen = min - d;
      p.x += nx * pen * 0.35; p.z += nz * pen * 0.35;
      const vn = p.vx * nx + p.vz * nz;
      if (vn < 0) { p.vx -= nx * vn * 0.8; p.vz -= nz * vn * 0.8; p.fs *= 0.985; }
    }
    p.speed = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    this._flightFeel(dt, rot0, fs0, vmax);
  }

  /** Fluggefühl für die Grafik: Schräglage aus der Kurvenrate, Nicken aus der Beschleunigung (gefedert). */
  _flightFeel(dt, rot0, fs0, vmax) {
    const p = this.player;
    const kt = 1 - Math.exp(-8 * dt);
    p.turnRate += (wrapAngle(p.rot - rot0) / dt - p.turnRate) * kt;
    p.accel += ((p.fs - fs0) / dt - p.accel) * (1 - Math.exp(-6 * dt));
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    p.slip = p.vx * c - p.vz * s; // rechts = (cos rot, −sin rot)
    let sk = p.speed / (vmax || 1); if (sk > 1) sk = 1;
    let b = p.turnRate / C.PLAYER_TURN_FAST * (0.3 + 0.7 * sk) + p.slip / (vmax || 1) * 0.6;
    if (b > 1) b = 1; else if (b < -1) b = -1;
    p.bank += (b * C.BANK_MAX - p.bank) * (1 - Math.exp(-5 * dt));
    let pt = p.accel / (C.PLAYER_ACCEL * (vmax || 1));
    if (pt > 1) pt = 1; else if (pt < -1) pt = -1;
    p.pitch += (pt * C.PITCH_MAX - p.pitch) * (1 - Math.exp(-4 * dt));
  }

  /** Stoß auf den Spieler (Rammangriff). Richtung (dx, dz), Stärke in m/s. */
  knockPlayer(dx, dz, v) {
    const p = this.player;
    p.vx += dx * v; p.vz += dz * v;
    p.fs *= 0.6;
  }

  _haltPlayer() {
    const p = this.player;
    p.vx = 0; p.vz = 0; p.fs = 0; p.speed = 0; p.thrust = 0;
    p.bank = 0; p.pitch = 0; p.turnRate = 0; p.accel = 0; p.slip = 0; p.aim = false; p.course = p.rot;
    this._spool = 0;
  }

  /** Sichere Zone und nahes Sprungtor neu bestimmen. */
  _updateZones() {
    const p = this.player;
    const st = this.station;
    if (st) {
      const dx = p.x - st.x, dz = p.z - st.z;
      this.inSafeZone = dx * dx + dz * dz <= C.SAFE_RADIUS * C.SAFE_RADIUS;
    } else this.inSafeZone = false;
    p.safe = this.inSafeZone;
    let np = null;
    for (let i = 0; i < this.portals.length; i++) {
      const o = this.portals[i];
      const dx = p.x - o.x, dz = p.z - o.z;
      if (dx * dx + dz * dz <= C.PORTAL_RADIUS * C.PORTAL_RADIUS) { np = o; break; }
    }
    this.nearPortal = np;
  }

  _canShoot(quiet) {
    if (!this.player.alive || this.docked) return false;
    if (this.time < this._invulnUntil) {
      // Text erst bauen, wenn die Meldung wirklich fällig ist (sonst 60 neue Strings pro Sekunde beim Dauerfeuer)
      if (!quiet && this._msgDue('invuln', 2)) this._msg(`Nach der Reparatur kurz kein Schießen (${(this._invulnUntil - this.time).toFixed(1).replace('.', ',')} s).`, 'info');
      return false;
    }
    if (this.inSafeZone) {
      if (!quiet) this._msg('In der sicheren Zone kannst du nicht schießen.', 'info', 'safeShoot', 4);
      return false;
    }
    return true;
  }

  _validTarget(tgt) {
    return tgt && tgt.alive && tgt.kind === 'enemy' && this.entities.get(tgt.id) === tgt;
  }

  _updateLasers(dt, tgt) {
    const p = this.player;
    const lasers = p.loadout.lasers;
    const n = Math.min(lasers.length, MAX_LASERS);
    const cd = this._laserCd;
    let firing = false;
    let dist = 0;
    if (p.attacking) {
      if (!this._validTarget(tgt)) {
        p.attacking = false;
      } else {
        const dx = tgt.x - p.x, dz = tgt.z - p.z;
        dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > C.PLAYER_RANGE) this._rangeMsg(tgt, 'Ziel ist zu weit weg. Flieg näher ran (650 m).', false);
        else {
          this._rangeWarnId = null;
          // Laser feuern nach vorn: Ziel muss vor der Nase liegen (die Nase dreht im Angriff selbst zum Ziel)
          firing = this._canShoot(false) && Math.abs(wrapAngle(headingOf(dx, dz) - p.rot)) <= C.LASER_ARC;
        }
      }
    }
    updateDrones(this, dt, tgt, firing); // Laser-Drohnen feuern mit (vor den Schiffslasern, gleiche Munition)
    if (!firing || !tgt.alive) {
      for (let i = 0; i < n; i++) { cd[i] -= dt; if (cd[i] < 0) cd[i] = 0; }
      this._wasFiring = false;
      return;
    }
    if (!this._wasFiring) {
      for (let i = 0; i < n; i++) cd[i] = (cd[i] > 0 ? cd[i] : 0) + i * C.LASER_STAGGER + this.rng.next() * 0.04;
      this._wasFiring = true;
    }
    for (let i = 0; i < n; i++) {
      cd[i] -= dt;
      if (cd[i] > 0) continue;
      // jeder Laser mit eigenem kleinen Zufall: Salven laufen nie im Gleichtakt
      const iv = C.LASER_INTERVAL * (1 + (this.rng.next() * 2 - 1) * C.LASER_JITTER);
      cd[i] += iv;
      if (cd[i] < 0) cd[i] = iv;
      const key = this._ammoForShot();
      if (!key) { p.attacking = false; return; }
      this.profile.ammo[key] -= 1;
      this._profileDirty = true;
      this._fireLaser(lasers[i], tgt, key, AMMO[key].mult, key === 'SAB', false, i);
      if (!tgt.alive) return;
    }
  }

  /** Munition für den nächsten Normalschuss; leer → automatisch L1. */
  _ammoForShot() {
    const pr = this.profile;
    let key = pr.selectedAmmo;
    if (!AMMO[key] || key === 'SAL') key = pr.selectedAmmo = 'L1';
    if (pr.ammo[key] >= 1) return key;
    if (key !== 'L1' && pr.ammo.L1 >= 1) {
      pr.selectedAmmo = 'L1';
      this._msg(`Keine ${key}-Munition mehr. Automatisch zurück auf L1.`, 'warn', 'ammoOut', 1);
      this._emitProfile();
      return 'L1';
    }
    this._msg('Keine Munition mehr! Kaufe L1 in der Station.', 'warn', 'ammoNone', 3);
    return null;
  }

  /**
   * Ein Laserschuss des Spielers. 'shot' meldet Trefferpunkt (x, z) auf der Hülle bzw. daneben
   * und die Einschlagrichtung (dx, dz, Einheitsvektor vom Schützen zum Ziel), idx = Laserplatz.
   */
  _fireLaser(laserId, tgt, ammoKey, mult, shieldOnly, crit, idx = 0, src = null) {
    const L = src ? null : LASERS[laserId];
    if (!src && !L) return;
    const p = this.player;
    const from = src ? src.id : 'player'; // Drohnen: 'dr:<id>' (Grafik zeichnet den Schuss an der Drohne)
    if (this.cloaked) breakCloak(this, 'Angriff');
    let hit = this.rng.next() < (tgt.jinkT > 0 ? C.JINK_HIT : C.HIT_CHANCE);
    this._lastCombat = this.time;
    let dx = tgt.x - p.x, dz = tgt.z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d; dz /= d;
    // Ziel in Deckung hinter einem Asteroiden: der Schuss schlägt im Brocken ein
    if (segRock(this.rocks, p.x, p.z, tgt.x, tgt.z, 2, this._pt)) {
      this.bus.emit('shot', { from, to: tgt.id, laser: laserId, ammo: ammoKey, hit: false, idx, x: this._pt.x, z: this._pt.z, dx, dz, blocked: true, drone: !!src });
      this._msg(`${tgt.name} ist in Deckung hinter einem Asteroiden. Flieg zur Seite für freie Schussbahn.`, 'info', 'cover', 8);
      this._provoke(tgt);
      return;
    }
    const side = (this.rng.next() * 2 - 1);
    const off = hit ? side * tgt.radius * 0.5 : (side < 0 ? -1 : 1) * tgt.radius * (1.4 + this.rng.next());
    const hx = tgt.x - dx * tgt.radius * (hit ? 0.7 : 0) - dz * off;
    const hz = tgt.z - dz * tgt.radius * (hit ? 0.7 : 0) + dx * off;
    this.bus.emit('shot', { from, to: tgt.id, laser: laserId, ammo: ammoKey, hit, idx, x: hx, z: hz, dx, dz, drone: !!src });
    if (!hit) { this._provoke(tgt); return; }
    this._hitFrom = from;
    this._hitEnemy(tgt, rollDamage(this.rng, src ? src.damage : L.damage, mult), shieldOnly, crit, dx, dz, hx, hz);
    this._hitFrom = null;
  }

  /** Schaden am Gegner. dx/dz = Einschlagrichtung, hx/hz = Trefferpunkt (für 'damage'). */
  _hitEnemy(e, dmg, shieldOnly, crit, dx = 0, dz = 0, hx = e.x, hz = e.z, rocket = false) {
    const p = this.player;
    if (e.guardT > 0) dmg = Math.round(dmg * (1 - SPECIALS.guard.reduce)); // Schildwall
    applyDamage(e, dmg, shieldOnly, HIT);
    if (shieldOnly) {
      if (HIT.shield > 0) {
        p.shield += HIT.shield * AMMO.SAB.drainReturn;
        if (p.shield > p.shieldMax) p.shield = p.shieldMax;
      } else {
        this._msg('Der Gegner hat keinen Schild mehr. SAB wirkt nur auf Schild.', 'info', 'sabEmpty', 5);
      }
    }
    this._lastCombat = this.time;
    const hull = HIT.hull, shield = HIT.shield;
    if (!rocket && !this._abilityHit) leech(this, hull + shield); // VMP
    const from = this._hitFrom || 'player';
    this._hitFrom = null;
    this.bus.emit('damage', { id: e.id, hull, shield, x: e.x, z: e.z, crit, dx, dz, hx, hz, from, guard: e.guardT > 0, drone: from !== 'player' || undefined });
    this._hitReact(e, hull + shield, dx, dz, crit, rocket);
    if (e.perk === 'reflect' && hull + shield > 0) this._reflect(e, hull + shield, dx, dz);
    this._provoke(e);
    if (e.hp <= 0) { this._killEnemy(e); return; }
    e.dmgWin += hull + shield;
    tryGuard(this, e);
  }

  /** Treffer-Reaktion: Stoß in Schussrichtung, Taumeln, manchmal seitliches Ausweichen. */
  _hitReact(e, dmg, dx, dz, crit, rocket = false) {
    e.hitAt = this.time;
    const pool = e.hpMax + e.shieldMax || 1;
    // schwerer Treffer (Rakete, kritisch, ≥ 10 % Leben+Schild) bricht das Aufladen eines Spezialangriffs ab
    if (e.spPhase === 1 && e.spK !== 'guard' && (rocket || crit || dmg >= pool * 0.1)) {
      const name = SPECIALS[e.spK].name;
      cancelSpecial(this, e);
      this._msg(`${name} von ${e.name} unterbrochen!`, 'info', 'interrupt', 4);
    }
    let s = dmg / pool * 10; if (s > 1) s = 1;
    s = 0.25 + 0.75 * s;
    if (crit) { s *= 1.5; if (s > 1) s = 1; }
    e.stagger += 0.2 + 0.45 * s; if (e.stagger > 1) e.stagger = 1;
    if (e.def.speed <= 0) return; // Nest: nur Pulsieren
    const kick = C.HIT_KNOCK * s * (e.rank === 'alpha' ? 0.35 : e.rank === 'elite' ? 0.7 : 1);
    e.vx += dx * kick; e.vz += dz * kick;
    if (e.dodgeCd <= 0 && !e.spPhase && this.rng.next() < C.DODGE_CHANCE * (0.5 + aiOf(e).dodge) * (e.rank === 'normal' ? 1 : 1.4)) {
      const side = this.rng.sign(), v = e.def.speed * 0.3;
      e.vx -= dz * side * v; e.vz += dx * side * v;
      jink(this, e, -dx, -dz);
    }
  }

  /** Alpha-Extra „Schadensspiegel“: Teil des Schadens geht an den Spieler zurück. */
  _reflect(e, dmg, dx, dz) {
    if (!this.playerTargetable()) return;
    const p = this.player;
    const n = Math.round(dmg * ALPHA_PERKS.reflect.ratio);
    if (n <= 0 || sosAbsorb(this, n)) return;
    applyDamage(p, n, false, REFL);
    this._lastHit = this.time;
    this.bus.emit('damage', { id: 'player', hull: REFL.hull, shield: REFL.shield, x: p.x, z: p.z, crit: false, dx: -dx, dz: -dz, hx: p.x, hz: p.z, from: e.id, reflect: true });
    this._msg(`${e.name} spiegelt ${Math.round(ALPHA_PERKS.reflect.ratio * 100)} % deines Schadens zurück!`, 'warn', 'reflect', 8);
    if (p.hp <= 0) this._playerDie();
  }

  /** Gegner wurde angegriffen: er wehrt sich, sein Rudel und Rudel gleicher Typen im Umkreis kommen dazu. */
  _provoke(e) {
    if (!e.alive) return;
    const wasCalm = !e.provoked;
    this._aggro(e);
    if (!wasCalm) return;
    const g = e.group;
    if (g) for (let i = 0; i < g.members.length; i++) { const o = g.members[i]; if (o !== e && o.alive && !o.provoked) this._aggro(o); }
    if (!e.def.pack) return;
    const near = this._near;
    const n = this.grid.query(e.x, e.z, C.PACK_RADIUS, near);
    for (let i = 0; i < n; i++) {
      const o = near[i];
      if (o === e || !o.alive || o.type !== e.type || o.provoked) continue;
      if (o.evTag !== e.evTag) continue; // Ereignis-Gegner (Nest-Larven) ziehen keine normalen Rudel mit und umgekehrt
      this._aggro(o);
    }
  }

  _aggro(e) {
    e.provoked = true;
    if (e.jamT > 0) return; // EMP/Störmine: erst nach der Störung zurückschlagen
    if (e.state === 'flee' || e.state === 'nest') return;
    if (e.targetId !== 'player') { e.state = 'wander'; e.targetId = 'player'; }
    beginAttack(this, e);
    e.attacking = true; e.stalk = false;
  }

  /** Für events.js */
  provoke(e) { this._provoke(e); }

  playerTargetable() {
    const p = this.player;
    return p.alive && !this.docked && !this.inSafeZone && this.time >= this._invulnUntil;
  }

  /** Von ai.js aufgerufen: Gegner feuert einen Schuss auf den Spieler (oder einen Frachter). */
  enemyFire(e, tgt = this.player) {
    const p = this.player;
    const toPlayer = tgt === p;
    if (toPlayer ? !this.playerTargetable() : !tgt.alive) return;
    const hit = this.rng.next() < C.HIT_CHANCE;
    let dx = tgt.x - e.x, dz = tgt.z - e.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    dx /= d; dz /= d;
    if (toPlayer) this._lastCombat = this.time;
    if (segRock(this.rocks, e.x, e.z, tgt.x, tgt.z, 2, this._pt)) {
      this.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit: false, enemyType: e.type, x: this._pt.x, z: this._pt.z, dx, dz, blocked: true });
      return;
    }
    const off = (this.rng.next() * 2 - 1) * tgt.radius * (hit ? 0.5 : 1.8);
    const hx = tgt.x - dx * tgt.radius * (hit ? 0.7 : 0) - dz * off;
    const hz = tgt.z - dz * tgt.radius * (hit ? 0.7 : 0) + dx * off;
    this.bus.emit('shot', { from: e.id, to: tgt.id, laser: null, ammo: null, hit, enemyType: e.type, x: hx, z: hz, dx, dz });
    if (!hit) return;
    const dmg = rollDamage(this.rng, e.def.damage, e.dmgMult);
    if (toPlayer && sosAbsorb(this, dmg)) return; // SOS: unverwundbar
    applyDamage(tgt, dmg, false, HIT);
    this.bus.emit('damage', { id: tgt.id, hull: HIT.hull, shield: HIT.shield, x: tgt.x, z: tgt.z, crit: false, dx, dz, hx, hz, from: e.id });
    if (toPlayer) {
      this._lastHit = this.time;
      if (p.hp <= 0) this._playerDie();
    } else if (tgt.hp <= 0) freighterDestroyed(this, tgt);
  }

  _killEnemy(e) {
    const p = this.player;
    const pr = this.profile;
    const def = e.def;
    cancelSpecial(this, e);
    e.alive = false;
    e.attacking = false;
    e.token = false;
    e.vx = 0; e.vz = 0;
    e.respawnAt = this.time + this.rng.range(C.ENEMY_RESPAWN[0], C.ENEMY_RESPAWN[1]);
    this.entities.delete(e.id);
    if (p.targetId === e.id) { p.targetId = null; p.attacking = false; }
    this.bus.emit('explode', { id: e.id, x: e.x, z: e.z, size: this.explodeSize(e) });
    this.bus.emit('despawn', { id: e.id });
    if (this._alpha === e) this._alpha = null;
    if (this._announce === e) this._announce = null;

    // Belohnung gestaffelt nach Typ, Variante, Sektor und Stufenabstand; Erfahrung und Ehre sofort, Credits im Wrack
    const r = this.rewardScale(e);
    const xp = Math.round(def.loot.xp * e.lootMult * r.xp), honor = Math.round(def.loot.honor * e.lootMult * r.honor);
    const credits = Math.round(def.loot.credits * e.lootMult * r.credits);
    const tritium = def.loot.tritium * e.lootMult;
    pr.stats.kills[e.type] = (pr.stats.kills[e.type] || 0) + 1;
    pr.honor += honor;
    this.bus.emit('loot', { credits: 0, tritium: 0, xp, honor, ammo: null, ore: null, x: e.x, z: e.z });
    // Combo: Abschuss kurz nach dem letzten
    const cb = this.combo;
    cb.count = cb.timeLeft > 0 ? cb.count + 1 : 1;
    cb.timeLeft = COMBO.window;
    let bx = 0, bh = 0, bc = 0;
    if (cb.count >= 2) {
      cb.mult = Math.min(COMBO.max, COMBO.step * (cb.count - 1));
      bx = Math.round(xp * cb.mult); bh = Math.round(honor * cb.mult); bc = Math.round(credits * cb.mult);
      cb.xp += bx; cb.honor += bh; cb.credits += bc;
      if (cb.count > cb.best) cb.best = cb.count;
      pr.honor += bh;
      this.bus.emit('combo', { count: cb.count, mult: cb.mult, xp: bx, honor: bh, credits: bc, window: COMBO.window, x: e.x, z: e.z, ended: false, totalXp: cb.xp, totalCredits: cb.credits, totalHonor: cb.honor });
      if (bx || bh) this.bus.emit('loot', { credits: 0, tritium: 0, xp: bx, honor: bh, ammo: null, ore: null, x: e.x, z: e.z, combo: cb.count });
    } else { cb.mult = 0; cb.xp = 0; cb.honor = 0; cb.credits = 0; }
    let text = `${e.name} zerstört: +${fmt(xp)} Erfahrung, +${fmt(honor)} Ehre`;
    if (e.rank !== 'normal') text += `, Wrack mit ${fmt(credits + bc)} Credits und ${fmt(tritium)} Tritium`;
    if (r.gray) text += ` (zu leicht für Stufe ${pr.level}: nur ${Math.round(r.xp * 100)} % Erfahrung)`;
    if (cb.count >= 2) text += ` · Combo ×${cb.count}: +${fmt(bx)} Erfahrung, +${fmt(bh)} Ehre, +${fmt(bc)} Credits im Wrack`;
    this._msg(text, 'loot');
    this._addXp(xp + bx);
    dronesOnKill(this, xp + bx);
    this._spawnWreck(e, credits + bc, tritium);
    this._emitProfile();
    this._questProgress('kill', e.type, 1);
    if (e.evTag) eventEnemyKilled(this, e);
  }

  /**
   * Staffelung der Belohnung für einen Gegner (REWARD_SCALE): × Sektor × Stufenabstand. Ergebnis in einem
   * wiederverwendeten Objekt { xp, credits, honor, gray } (Faktoren; Typ und Variante kommen aus loot × lootMult).
   */
  rewardScale(e) {
    const R = REWARD_SCALE;
    const si = (this.sector.index || 1) - 1;
    const sec = R.sector[si < R.sector.length ? si : R.sector.length - 1];
    const lvl = this.profile.level;
    const typeLvl = e.def.level || 1;
    const over = lvl - (typeLvl + (R.rankLevel[e.rank] || 0)) - R.freeLevels; // so viele Stufen zu leicht
    let xp = 1, cr = 1;
    if (over > 0) {
      xp = 1 - R.perLevel * over; if (xp < R.minXp) xp = R.minXp;
      cr = 1 - R.creditsPerLevel * over; if (cr < R.minCredits) cr = R.minCredits;
    } else if (typeLvl > lvl) {
      xp = 1 + R.bonusPerLevel * (typeLvl - lvl); if (xp > 1 + R.bonusMax) xp = 1 + R.bonusMax;
    }
    RW.xp = xp * sec;
    RW.honor = (over > 0 ? Math.max(R.minHonor, xp) : xp) * sec;
    RW.credits = cr * sec;
    RW.gray = over > 0;
    return RW;
  }

  /** Combo läuft ab: Abschluss melden. */
  _updateCombo(dt) {
    const cb = this.combo;
    if (cb.timeLeft <= 0) return;
    cb.timeLeft -= dt;
    if (cb.timeLeft > 0) return;
    cb.timeLeft = 0;
    if (cb.count >= 2) {
      this.bus.emit('combo', { count: 0, mult: 0, xp: 0, honor: 0, credits: 0, window: COMBO.window, x: this.player.x, z: this.player.z, ended: true, best: cb.count, totalXp: cb.xp, totalCredits: cb.credits, totalHonor: cb.honor });
      this._msg(`Combo beendet: ${cb.count} Abschüsse in Folge, Bonus +${fmt(cb.xp)} Erfahrung, +${fmt(cb.honor)} Ehre, +${fmt(cb.credits)} Credits.`, 'loot');
    }
    cb.count = 0; cb.mult = 0; cb.xp = 0; cb.honor = 0; cb.credits = 0;
  }

  /** Sichtlinie a→b durch einen großen Asteroiden verdeckt? (für ai.js) */
  losBlocked(ax, az, bx, bz, pad = 0) { return segRock(this.rocks, ax, az, bx, bz, pad, null); }

  /** Spezialangriff trifft den Spieler (ai.js). */
  specialHit(e, dmg, dx, dz, hx, hz, kind) {
    const p = this.player;
    if (!this.playerTargetable()) return;
    this._lastCombat = this.time;
    if (sosAbsorb(this, dmg)) return;
    applyDamage(p, dmg, false, HIT);
    this._lastHit = this.time;
    this.bus.emit('damage', { id: 'player', hull: HIT.hull, shield: HIT.shield, x: p.x, z: p.z, crit: true, dx, dz, hx, hz, from: e.id, special: kind });
    if (p.hp <= 0) this._playerDie();
  }

  /** Gefahrenzone anlegen (Säurewolke). Grafik liest world.hazards (active = true). */
  addHazard(kind, x, z, radius, duration, dps, from) {
    let h = null, oldest = null;
    for (let i = 0; i < this.hazards.length; i++) {
      const o = this.hazards[i];
      if (!o.active) { h = o; break; }
      if (!oldest || o.t < oldest.t) oldest = o;
    }
    if (!h) h = oldest;
    h.active = true; h.kind = kind; h.x = x; h.z = z; h.radius = radius; h.t = duration; h.duration = duration;
    h.dps = dps; h.from = from; h.acc = 0; h.tick = 0;
    return h;
  }

  /** Säurewolken: Schaden je Sekunde, solange der Spieler darin ist ('damage' gesammelt alle 0,5 s). */
  _updateHazards(dt) {
    const p = this.player;
    const ok = this.playerTargetable() && !(this.abilities.SOS.activeFor > 0);
    for (let i = 0; i < this.hazards.length; i++) {
      const h = this.hazards[i];
      if (!h.active) continue;
      h.t -= dt;
      const dx = p.x - h.x, dz = p.z - h.z;
      const r = h.radius + p.radius * 0.5;
      if (ok && dx * dx + dz * dz < r * r) h.acc += h.dps * dt;
      h.tick += dt;
      if ((h.tick >= 0.5 || h.t <= 0) && h.acc >= 1) {
        applyDamage(p, Math.round(h.acc), false, HIT);
        this._lastHit = this.time; this._lastCombat = this.time;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        this.bus.emit('damage', { id: 'player', hull: HIT.hull, shield: HIT.shield, x: p.x, z: p.z, crit: false, dx: dx / d, dz: dz / d, hx: p.x, hz: p.z, from: h.from, special: h.kind });
        this._msg('Säurewolke! Flieg raus, sie frisst sich durch Schild und Hülle.', 'warn', 'acid', 6);
        h.acc = 0; h.tick = 0;
        if (p.hp <= 0) { this._playerDie(); return; }
      } else if (h.tick >= 0.5) h.tick = 0;
      if (h.t <= 0) { h.active = false; h.t = 0; }
    }
  }

  /** Explosionsgröße nach Gegnertyp und Variante (0,9 … 4). */
  explodeSize(e) {
    let s = e.def.explode || 1;
    if (e.rank !== 'normal') s *= VARIANTS[e.rank].explode;
    return s > 4 ? 4 : s;
  }

  /**
   * Wiedererscheinen: zurück ins eigene Rudel (hinter den Anführer), sonst neuer Rudel-Ort mit Mindestabstand.
   * Nie in Sichtweite des Spielers.
   */
  _respawnEnemy(e) {
    const g = e.group;
    const p = this.player;
    const L = g ? leaderOf(g) : null;
    if (L) {
      const dx = L.x - p.x, dz = L.z - p.z;
      if (engaged(L) || dx * dx + dz * dz < C.RESPAWN_MIN_PLAYER * C.RESPAWN_MIN_PLAYER) { e.respawnAt = this.time + 5; return; }
      let k = 1;
      for (let i = 0; i < g.members.length; i++) if (g.members[i].alive) k++;
      e.slot = k;
      slotPos(L, k, slotGap(e.def.radius), SLOT);
      e.x = SLOT.x; e.z = SLOT.z;
      e.rot = L.rot;
    } else if (g) {
      placeGroupCenter(this, g, C.RESPAWN_MIN_PLAYER);
      g.leader = e;
      e.slot = 0;
      e.x = g.cx; e.z = g.cz;
      e.rot = this.rng.range(-Math.PI, Math.PI);
    } else {
      this._randomPoint(C.SPAWN_MIN_STATION, C.SPAWN_MIN_PORTAL, 0.9);
      e.x = this._pt.x; e.z = this._pt.z;
      e.rot = this.rng.range(-Math.PI, Math.PI);
    }
    e.px = e.homeX = e.x; e.pz = e.homeZ = e.z; e.prot = e.rot;
    e.vx = 0; e.vz = 0; e.speed = 0; e.thrust = 0;
    e.stagger = 0; e.wob = 0; e.bank = 0;
    this._rollRank(e);
    e.fireCd = 0; e.thinkCd = this.rng.next() * C.THINK_INTERVAL;
    e.spCd = this.rng.range(2, 5); e.guardT = 0; e.guard = 0; e.guardCd = 0; e.dmgWin = 0; e.cloak = 0; e.jinkT = 0;
    e.retreated = false; e.lootRun = false; e.pounceAt = -999;
    e.jamT = 0; e.slowT = 0; e.slowK = 1;
    calmDown(this, e);
    this._revive(e);
  }

  /** Variante würfeln (beim Aufbau und Wiedererscheinen). */
  _rollRank(e) {
    if (e.def.eventOnly || e.temp) { this.applyRank(e, 'normal'); return; }
    const r = this.rng.next();
    if (!this._alpha && r < VARIANTS.alpha.chance) this.applyRank(e, 'alpha');
    else if (r < VARIANTS.alpha.chance + VARIANTS.elite.chance) this.applyRank(e, 'elite');
    else this.applyRank(e, 'normal');
  }

  /** Variante setzen: Leben/Schild/Beute × mult, Schaden × dmg, Name „Elite Raider“ / „Alpha Raider“. */
  applyRank(e, rank, perk = null) {
    const def = e.def;
    const V = VARIANTS[rank];
    e.rank = V ? rank : 'normal';
    e.name = V ? `${V.prefix} ${def.name}` : def.name;
    const m = V ? V.mult : 1;
    e.hpMax = e.hp = def.hp * m;
    e.shieldMax = e.shield = def.shield * m;
    e.dmgMult = V ? V.dmg : 1;
    e.lootMult = m;
    e.radius = def.radius * (V ? V.scale : 1);
    e.noticed = false;
    e.summonStep = 0;
    e.perk = null;
    if (e.rank === 'alpha') {
      e.perk = perk && ALPHA_PERKS[perk] ? perk : PERK_KEYS[Math.floor(this.rng.next() * PERK_KEYS.length)];
      this._alpha = e;
      this._announce = e;
    } else {
      if (this._alpha === e) this._alpha = null;
      if (this._announce === e) this._announce = null;
    }
  }

  /** Alpha-Sichtung im ganzen Sektor melden. */
  _announceAlpha() {
    const e = this._announce;
    this._announce = null;
    if (!e.alive || e.rank !== 'alpha' || !this.player.alive) return;
    const l = e.def.loot, m = e.lootMult;
    this._msg(`Sektorwarnung: ${e.name} gesichtet, ${whereText(this, e.x, e.z)}. Extra: ${ALPHA_PERKS[e.perk].name}. Zehnfache Beute: ${rewardText({ credits: l.credits * m, tritium: l.tritium * m, xp: l.xp * m, honor: l.honor * m })}.`, 'warn');
  }

  /** Von ai.js: Elite-/Alpha-Gegner kommt in Sichtweite. */
  noticeVariant(e, d) {
    e.noticed = true;
    const l = e.def.loot, m = e.lootMult;
    const loot = rewardText({ credits: l.credits * m, tritium: l.tritium * m, xp: l.xp * m, honor: l.honor * m });
    if (e.rank === 'elite') this._msg(`${e.name} voraus (${(d / 1000).toFixed(1).replace('.', ',')} km): dreifach stark, dreifache Beute: ${loot}.`, 'warn', 'elite', 15);
    else this._msg(`Achtung: ${e.name} (${ALPHA_PERKS[e.perk].name}) in ${(d / 1000).toFixed(1).replace('.', ',')} km! Beute: ${loot}.`, 'warn', 'alphaNear', 20);
  }

  /** Alpha-Extras pro Schritt. */
  _alphaTick(e, dt) {
    if (e.perk === 'regen') {
      if (e.shield < e.shieldMax) {
        e.shield += e.shieldMax * ALPHA_PERKS.regen.rate * dt;
        if (e.shield > e.shieldMax) e.shield = e.shieldMax;
      }
    } else if (e.perk === 'summon') {
      const at = ALPHA_PERKS.summon.at;
      if (e.summonStep < at.length && e.hp < e.hpMax * at[e.summonStep]) {
        e.summonStep++;
        const type = e.def.group === 'swarm' ? 'larva' : e.type;
        const n = ALPHA_PERKS.summon.count;
        for (let i = 0; i < n; i++) {
          const a = this.rng.next() * Math.PI * 2;
          const o = this.spawnTemp(type, e.x + Math.cos(a) * 420, e.z + Math.sin(a) * 420);
          o.expire = true;
          if (e.provoked) this._aggro(o);
        }
        this._msg(`${e.name} ruft Verstärkung: ${n} ${ENEMIES[type].name} im Anflug!`, 'warn');
      }
    }
  }

  /** Vorübergehenden Gegner erzeugen (Falle, Ereignis, Verstärkung). Für events.js. */
  spawnTemp(type, x, z) {
    const e = makeEnemy(`t${++this._tempSeq}`, type);
    e.temp = true;
    e.phase = this.rng.next() * Math.PI * 2;
    e.x = e.px = e.homeX = e.wx = x;
    e.z = e.pz = e.homeZ = e.wz = z;
    e.wanderR = 350;
    const p = this.player;
    e.rot = e.prot = headingOf(p.x - x, p.z - z);
    e.thinkCd = this.rng.next() * C.THINK_INTERVAL;
    this.enemies.push(e);
    this.grid.insert(e);
    this._revive(e);
    return e;
  }

  makeEntity(id, kind) { return makeEntity(id, kind); }

  /** Liegt (x, z) in einem großen Brocken (+ pad)? */
  inRock(x, z, pad) {
    const n = this.rockGrid.query(x, z, C.ROCK_RADIUS[1] + pad + 1, ROCKS);
    for (let i = 0; i < n; i++) {
      const r = ROCKS[i];
      const m = r.radius + pad;
      if ((r.x - x) ** 2 + (r.z - z) ** 2 < m * m) return true;
    }
    return false;
  }

  /** Belohnung gutschreiben (Ereignisse) und melden. */
  grantReward(r, x, z, text) {
    const pr = this.profile;
    pr.credits += r.credits || 0;
    pr.tritium += r.tritium || 0;
    pr.honor += r.honor || 0;
    this.bus.emit('loot', { credits: r.credits || 0, tritium: r.tritium || 0, xp: r.xp || 0, honor: r.honor || 0, ammo: null, ore: null, x, z });
    this._msg(text, 'loot');
    if (r.xp) this._addXp(r.xp);
    this._emitProfile();
    this.save();
  }

  /** Sektor-Ereignis sofort starten: 'convoy' | 'drift' | 'nest' | null (Zufall). Für Tests und Entwickler-Links. */
  startEvent(type = null) { return startEvent(this, type); }

  _revive(ent) {
    ent.alive = true;
    this.entities.set(ent.id, ent);
    this.bus.emit('spawn', { entity: ent });
  }

  // ───────────────────────── Raketen ─────────────────────────

  _updateRockets(dt) {
    const rs = this._rockets;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (!r.active) continue;
      r.t -= dt;
      if (r.t > 0) continue;
      r.active = false;
      const e = this.entities.get(r.targetId);
      if (e && e.alive && e.kind === 'enemy') {
        const p = this.player;
        let dx = e.x - p.x, dz = e.z - p.z;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        const R = ROCKETS[r.rocket] || ROCKETS.R1;
        const lck = this.abilities.LCK.activeFor > 0;
        // Asteroid dazwischen oder Ziel weicht aus: Rakete verfehlt (Tech LCK: trifft immer)
        if (!lck && segRock(this.rocks, p.x, p.z, e.x, e.z, 2, this._pt)) {
          this.bus.emit('rocketMiss', { to: e.id, rocket: R.name, x: this._pt.x, z: this._pt.z, blocked: true });
          this._msg(`${R.name} schlägt im Asteroiden ein: ${e.name} ist in Deckung.`, 'info', 'rocketMiss', 2);
        } else if (!rocketHits(this, e)) {
          this.bus.emit('rocketMiss', { to: e.id, rocket: R.name, x: e.x, z: e.z, blocked: false });
          this._msg(`${R.name} verfehlt: ${e.name} ist ausgewichen. (LCK lässt jede Rakete treffen.)`, 'info', 'rocketMiss', 2);
        } else this._hitEnemy(e, R.damage, false, false, dx / d, dz / d, e.x - dx / d * e.radius * 0.7, e.z - dz / d * e.radius * 0.7, true);
      }
    }
  }

  // ───────────────────────── Beute einsammeln ─────────────────────────

  _pickups() {
    const p = this.player;
    const t = this.time;
    const pr = this.profile;

    const wr = this.wrecks;
    for (let i = wr.length - 1; i >= 0; i--) {
      const w = wr[i];
      const dx = w.x - p.x, dz = w.z - p.z;
      if (dx * dx + dz * dz > C.WRECK_PICKUP * C.WRECK_PICKUP) continue;
      if (w.owner !== 'player' && t < w.protectedUntil) continue;
      pr.credits += w.credits;
      pr.tritium += w.tritium;
      this.bus.emit('loot', { credits: w.credits, tritium: w.tritium, xp: 0, honor: 0, ammo: null, ore: null, x: w.x, z: w.z });
      this._msg(`Beute: +${fmt(w.credits)} Credits${w.tritium ? `, +${fmt(w.tritium)} Tritium` : ''}`, 'loot');
      this._removeWreck(i);
      this._emitProfile();
    }

    const cr = this.crates;
    for (let i = cr.length - 1; i >= 0; i--) {
      const c = cr[i];
      if (!c || !c.alive) continue;
      const dx = c.x - p.x, dz = c.z - p.z;
      if (dx * dx + dz * dz > C.CRATE_PICKUP * C.CRATE_PICKUP) continue;
      this._openCrate(c);
    }

    const ores = this.ores;
    for (let i = 0; i < ores.length; i++) {
      const o = ores[i];
      if (!o.alive) continue;
      const dx = o.x - p.x, dz = o.z - p.z;
      if (dx * dx + dz * dz > C.ORE_PICKUP * C.ORE_PICKUP) continue;
      const free = this.cargoMax - this.cargoUsed;
      if (free <= 0) { this._msg('Laderaum voll. Verkaufe dein Erz in der Station.', 'warn', 'cargoFull', 6); continue; }
      const take = Math.min(free, o.amount);
      pr.cargo[o.type] = (pr.cargo[o.type] || 0) + take;
      o.amount -= take;
      this.bus.emit('loot', { credits: 0, tritium: 0, xp: 0, honor: 0, ammo: null, ore: { type: o.type, amount: take }, x: o.x, z: o.z });
      this._msg(`+${take} ${ORES[o.type].name}`, 'loot');
      if (o.amount <= 0) {
        o.alive = false;
        o.respawnAt = t + C.ORE_RESPAWN;
        this.entities.delete(o.id);
        this.bus.emit('despawn', { id: o.id });
      }
      this._emitProfile();
      this._questProgress('ore', o.type, take);
    }
  }

  _openCrate(c) {
    const pr = this.profile;
    c.alive = false;
    c.respawnAt = this.time + C.CRATE_RESPAWN;
    this.entities.delete(c.id);
    this.bus.emit('despawn', { id: c.id });
    pr.stats.crates += 1;
    if (c.temp) { const i = this.crates.indexOf(c); if (i >= 0) this.crates.splice(i, 1); }

    const table = c.type === 'drift' ? DRIFT_CRATE_TABLE : CRATE_TABLE;
    let roll = this.rng.next();
    let row = table[table.length - 1];
    for (let i = 0; i < table.length; i++) {
      if (roll < table[i].chance) { row = table[i]; break; }
      roll -= table[i].chance;
    }
    if (row.trap) {
      this.bus.emit('trap', { x: c.x, z: c.z });
      this._msg('Eine Falle! Piraten greifen an!', 'warn');
      this._spawnTrap(c.x, c.z);
    } else if (row.credits) {
      const n = this.rng.int(row.credits[0], row.credits[1]);
      pr.credits += n;
      this.bus.emit('loot', { credits: n, tritium: 0, xp: 0, honor: 0, ammo: null, ore: null, x: c.x, z: c.z });
      this._msg(`Crate: +${fmt(n)} Credits`, 'loot');
    } else if (row.ammo) {
      const key = row.ammo[0];
      const n = this.rng.int(row.ammo[1], row.ammo[2]);
      pr.ammo[key] = (pr.ammo[key] || 0) + n;
      this.bus.emit('loot', { credits: 0, tritium: 0, xp: 0, honor: 0, ammo: { type: key, amount: n }, ore: null, x: c.x, z: c.z });
      this._msg(`Crate: +${fmt(n)} ${key}-Munition`, 'loot');
    } else if (row.tritium) {
      const n = this.rng.int(row.tritium[0], row.tritium[1]);
      pr.tritium += n;
      this.bus.emit('loot', { credits: 0, tritium: n, xp: 0, honor: 0, ammo: null, ore: null, x: c.x, z: c.z });
      this._msg(`Crate: +${fmt(n)} Tritium`, 'loot');
    }
    this._emitProfile();
    this._questProgress('crate', null, 1);
    if (c.temp) eventCrateOpened(this, c);
  }

  _spawnTrap(x, z) {
    for (let i = 0; i < C.TRAP_COUNT; i++) {
      const a = (i / C.TRAP_COUNT) * Math.PI * 2 + this.rng.next();
      const e = this.spawnTemp('raider', x + Math.cos(a) * 260, z + Math.sin(a) * 260);
      e.expire = true;
      this._aggro(e);
      e.fireCd = 0.5 + i * 0.3;
    }
  }

  // ───────────────────────── Wracks ─────────────────────────

  _spawnWreck(e, credits = e.def.loot.credits * e.lootMult, tritium = e.def.loot.tritium * e.lootMult) {
    const w = this._wreckPool.pop() || makeEntity('', 'wreck');
    w.id = `w${++this._wreckSeq}`;
    w.kind = 'wreck';
    w.type = e.type;
    w.name = `Wrack (${e.def.name})`;
    w.x = w.px = e.x; w.z = w.pz = e.z;
    w.vx = 0; w.vz = 0;
    w.rot = w.prot = e.rot;
    w.radius = 14;
    w.owner = 'player';
    w.protectedUntil = this.time + C.WRECK_PROTECT;
    w.credits = credits;
    w.tritium = tritium;
    w.expireAt = this.time + C.WRECK_LIFETIME;
    this.wrecks.push(w);
    this._revive(w);
  }

  _removeWreck(i) {
    const w = this.wrecks[i];
    const last = this.wrecks.pop();
    if (i < this.wrecks.length) this.wrecks[i] = last;
    w.alive = false;
    this.entities.delete(w.id);
    this.bus.emit('despawn', { id: w.id });
    this._wreckPool.push(w);
  }

  /**
   * Darf ein Dieb dieses Wrack nehmen? Erst nach dem Beuteschutz; ist der Spieler (Besitzer) näher als
   * WRECK_STEAL_PLAYER_DIST, zusätzlich erst WRECK_STEAL_GRACE Sekunden später – er soll seine Beute holen können.
   */
  wreckStealable(w) {
    const t = this.time;
    if (t < w.protectedUntil) return false;
    if (w.owner !== 'player' || t >= w.protectedUntil + C.WRECK_STEAL_GRACE) return true;
    const p = this.player;
    if (!p.alive) return true;
    const dx = w.x - p.x, dz = w.z - p.z;
    return dx * dx + dz * dz > C.WRECK_STEAL_PLAYER_DIST * C.WRECK_STEAL_PLAYER_DIST;
  }

  /** Für ai.js: Wrack, das ein Dieb klauen darf (siehe wreckStealable). */
  findStealableWreck(x, z, range) {
    let best = null, bestD = range * range;
    const t = this.time;
    for (let i = 0; i < this.wrecks.length; i++) {
      const w = this.wrecks[i];
      if (!this.wreckStealable(w)) continue;
      const dx = w.x - x, dz = w.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = w; }
    }
    return best;
  }

  /** Für ai.js: Dieb nimmt ein Wrack mit. */
  stealWreck(e, w) {
    const i = this.wrecks.indexOf(w);
    if (i < 0) return;
    this._msg(`Ein ${e.def.name} hat ein Wrack geklaut!`, 'warn');
    this._removeWreck(i);
  }

  // ───────────────────────── Befehle ─────────────────────────

  moveTo(x, z) {
    const p = this.player;
    if (!p.alive || this.docked) return;
    p.tx = x; p.tz = z; p.hasMove = true;
  }

  stopMove() {
    this.player.hasMove = false;
  }

  setTarget(id) {
    const p = this.player;
    if (id == null) { p.targetId = null; p.attacking = false; return; }
    if (id === p.targetId) return;
    const e = this.entities.get(id);
    if (!e || !e.alive || e.kind !== 'enemy') return;
    p.targetId = id;
    p.attacking = false;
  }

  toggleAttack() {
    const p = this.player;
    if (!p.alive || this.docked) return;
    if (p.attacking) { p.attacking = false; return; }
    const tgt = p.targetId ? this.entities.get(p.targetId) : null;
    if (!this._validTarget(tgt)) { this._msg('Kein Ziel ausgewählt. Klicke einen Gegner an.', 'info', 'noTarget', 1.5); return; }
    p.attacking = true;
  }

  selectAmmo(key) {
    const pr = this.profile;
    if (!AMMO[key]) return;
    if (key === 'SAL') { this.fireSal(); return; }
    if (!(pr.ammo[key] >= 1)) {
      this._msg(`Keine ${key}-Munition. Kaufe Nachschub in der Station.`, 'warn', 'noAmmo' + key, 1.5);
      return;
    }
    if (pr.selectedAmmo === key) return;
    pr.selectedAmmo = key;
    this._emitProfile();
  }

  fireSal() {
    const p = this.player;
    const pr = this.profile;
    if (!p.alive || this.docked) return;
    if (this._salCd > 0) { this._msg(`SAL lädt noch (${this._salCd.toFixed(1).replace('.', ',')} s).`, 'info', 'salCd', 1); return; }
    if (!(pr.ammo.SAL >= 1)) { this._msg('Keine SAL-Munition. Kaufe Nachschub in der Station.', 'warn', 'noSal', 2); return; }
    const tgt = p.targetId ? this.entities.get(p.targetId) : null;
    if (!this._validTarget(tgt)) { this._msg('Kein Ziel ausgewählt. Klicke einen Gegner an.', 'info', 'noTarget', 1.5); return; }
    const dx = tgt.x - p.x, dz = tgt.z - p.z;
    if (dx * dx + dz * dz > C.PLAYER_RANGE * C.PLAYER_RANGE) { this._rangeMsg(tgt, 'Ziel ist zu weit weg. Flieg näher ran (650 m).', true); return; }
    if (!this._canShoot(false)) return;
    const lasers = p.loadout.lasers;
    const n = Math.min(lasers.length, pr.ammo.SAL);
    if (n <= 0) return;
    this._salCd = AMMO.SAL.ownCooldown;
    this.salReadyIn = this._salCd;
    p.attacking = true;
    pr.ammo.SAL -= n;
    // erster Laser sofort, die übrigen kurz nacheinander (Salve statt Gleichtakt)
    this._fireLaser(lasers[0], tgt, 'SAL', AMMO.SAL.mult, false, true, 0);
    for (let i = 1; i < n && tgt.alive; i++) {
      const q = this._pending[i];
      q.active = true; q.t = i * C.SAL_STAGGER; q.laser = lasers[i]; q.targetId = tgt.id; q.idx = i;
    }
    this._emitProfile();
  }

  /** Versetzte SAL-Schüsse abfeuern (Ziel muss noch gültig und in Reichweite sein). */
  _updatePending(dt) {
    const q = this._pending;
    for (let i = 0; i < q.length; i++) {
      const s = q[i];
      if (!s.active) continue;
      s.t -= dt;
      if (s.t > 0) continue;
      s.active = false;
      const tgt = this.entities.get(s.targetId);
      if (!this._validTarget(tgt) || !this._canShoot(true)) continue;
      const dx = tgt.x - this.player.x, dz = tgt.z - this.player.z;
      if (dx * dx + dz * dz > C.PLAYER_RANGE * C.PLAYER_RANGE * 1.2) continue;
      this._fireLaser(s.laser, tgt, 'SAL', AMMO.SAL.mult, false, true, s.idx);
    }
  }

  /** Rakete auf das Ziel: id 'R1'|'R2'|'R3' (ohne id die zuletzt gewählte Sorte). → true, wenn abgefeuert. */
  fireRocket(id) {
    const p = this.player;
    const pr = this.profile;
    if (!p.alive || this.docked) return false;
    const key = ROCKETS[id] ? id : (ROCKETS[pr.selectedRocket] ? pr.selectedRocket : 'R1');
    if (ROCKETS[id] && pr.selectedRocket !== id) { pr.selectedRocket = id; this._profileDirty = true; }
    if (this._rocketCd > 0) { this._msg(`Rakete lädt noch (${this._rocketCd.toFixed(1).replace('.', ',')} s).`, 'info', 'rocketCd', 1); return false; }
    if (!(pr.ammo[key] >= 1)) { this._msg(`Keine ${key} mehr. Kaufe Nachschub in der Station.`, 'warn', 'noRocket', 2); return false; }
    const tgt = p.targetId ? this.entities.get(p.targetId) : null;
    if (!this._validTarget(tgt)) { this._msg('Kein Ziel ausgewählt. Klicke einen Gegner an.', 'info', 'noTarget', 1.5); return false; }
    const dx = tgt.x - p.x, dz = tgt.z - p.z;
    if (dx * dx + dz * dz > C.ROCKET_RANGE * C.ROCKET_RANGE) { this._rangeMsg(tgt, 'Ziel ist zu weit weg für eine Rakete (650 m).', true); return false; }
    if (!this._canShoot(false)) return false;
    let slot = null;
    for (let i = 0; i < this._rockets.length; i++) if (!this._rockets[i].active) { slot = this._rockets[i]; break; }
    if (!slot) return false;
    slot.active = true; slot.targetId = tgt.id; slot.t = C.ROCKET_FLIGHT; slot.rocket = key;
    pr.ammo[key] -= 1;
    this._rocketCd = ROCKETS[key].cooldown;
    this.rocketReadyIn = this._rocketCd;
    this._lastCombat = this.time;
    if (this.cloaked) breakCloak(this, 'Angriff');
    this.bus.emit('rocket', { from: 'player', to: tgt.id, rocket: key });
    this._provoke(tgt);
    this._emitProfile();
    return true;
  }

  // ───────── Schnellleiste: Extras, Minen, Techs, Formation, Konfiguration (abilities.js) → true bei Erfolg ─────────
  useExtra(id, arg) { return useExtra(this, id, arg); }   // 'EMP'|'SOS'|'BMB'|'TRN'|'JMP' (JMP: optional Ziel-Sektor-ID)
  layMine(id) { return layMine(this, id); }               // 'SPM'|'BRM'|'STM'
  useTech(id) { return useTech(this, id); }               // 'VMP'|'ARC'|'LCK'|'RSV'|'FIX'
  setFormation(id) { return setFormation(this, id); }     // Schlüssel aus FORMATIONS
  setConfig(n) { return setConfig(this, n); }             // 1..3

  tryJump() {
    const p = this.player;
    if (!p.alive || this.docked) return;
    if (this.jump) return;
    const portal = this.nearPortal;
    if (!portal) { this._msg('Flieg näher an ein Sprungtor (150 m), um zu springen.', 'info', 'jumpFar', 2); return; }
    const j = this._jumpObj;
    j.progress = 0; j.t = 0; j.portal = portal; j.to = portal.type; j.dur = C.JUMP_TIME; j.jmp = false;
    this.jump = j;
    this.bus.emit('jumpStart', { seconds: C.JUMP_TIME });
    this._msg(`Sprung nach ${this.sectors[portal.type].name} wird geladen …`, 'info');
  }

  _updateJump(dt) {
    const j = this.jump;
    const p = this.player;
    if (!p.alive) { this.jump = null; return; }
    if (j.portal) {
      const dx = p.x - j.portal.x, dz = p.z - j.portal.z;
      if (dx * dx + dz * dz > C.PORTAL_RADIUS * C.PORTAL_RADIUS) {
        this.jump = null;
        this._msg('Sprung abgebrochen: zu weit vom Sprungtor weg.', 'warn');
        return;
      }
    }
    const dur = j.dur || C.JUMP_TIME;
    j.t += dt;
    j.progress = Math.min(1, j.t / dur);
    if (j.t < dur) return;
    const from = this.sector.id;
    const jmp = j.jmp;
    this.jump = null;
    this._changeSector(j.to, jmp ? null : from); // JMP: Ankunft an der Station bzw. am ersten Tor
    this._msg(`Willkommen in ${this.sector.name} (${this.sector.id}).`, 'info');
    if (!jmp) this._questProgress('jump', this.sector.index, 1);
    this.save();
  }

  dock() {
    const p = this.player;
    if (!p.alive || this.docked) return;
    if (!this.station) { this._msg('In diesem Sektor gibt es keine Station.', 'info', 'dock', 2); return; }
    if (!this.inSafeZone) { this._msg('Flieg in die sichere Zone der Station (400 m), um anzudocken.', 'info', 'dock', 2); return; }
    this.docked = true;
    this.jump = null;
    this._haltPlayer(); p.hasMove = false; p.attacking = false;
    this.bus.emit('docked', {});
    this._msg(`Angedockt an ${this.station.name}.`, 'info');
    this.save();
  }

  undock() {
    if (!this.docked) return;
    this.docked = false;
    this.bus.emit('undocked', {});
  }

  repair(where) {
    const p = this.player;
    const pr = this.profile;
    if (!this.playerDead) return false;
    const def = REPAIR[where];
    if (!def || typeof def !== 'object') return false;
    const info = this.repairCost(where);
    if (!info.free) {
      if ((pr[info.currency] || 0) < info.amount) {
        this._msg(`Zu wenig ${CURRENCY_NAME[info.currency]} für diese Reparatur (${fmt(info.amount)} nötig).`, 'warn');
        return false;
      }
      pr[info.currency] -= info.amount;
    }

    if (where === 'station') {
      const home = homeSectorId(pr.faction);
      if (this.sector.id !== home) this._changeSector(home, null);
      this._placeAtSpawn();
    } else if (where === 'portal') {
      let best = null, bestD = Infinity;
      for (const o of this.portals) {
        const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best) this._placeNear(best.x, best.z, 100);
    }
    p.px = p.x; p.pz = p.z;
    this._haltPlayer(); p.hasMove = false;
    p.hp = p.hpMax; p.shield = p.shieldMax;
    p.alive = true;
    p.attacking = false; p.targetId = null;
    this.playerDead = false;
    this._invulnUntil = this.time + C.INVULN_AFTER_REPAIR;
    this._lastHit = -999;
    this.entities.set('player', p);
    this._updateZones();
    this.bus.emit('respawn', {});
    this._msg(info.free ? 'Schiff repariert (kostenlos bis Stufe 10). 5 Sekunden geschützt.' : `Schiff repariert für ${fmt(info.amount)} ${CURRENCY_NAME[info.currency]}. 5 Sekunden geschützt.`, 'info');
    this._emitProfile();
    this.save();
    return true;
  }

  /** Kosten einer Reparatur: { amount, currency, free } */
  repairCost(where) {
    const pr = this.profile;
    const def = REPAIR[where] || {};
    const currency = def.credits != null ? 'credits' : 'tritium';
    const amount = (def[currency] || 0) * (SHIPS[pr.ship]?.no || 1);
    return { amount, currency, free: pr.level <= REPAIR.freeUntilLevel };
  }

  _playerDie() {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    p.attacking = false;
    p.hasMove = false;
    this._haltPlayer();
    this.playerDead = true;
    this.jump = null;
    this.profile.stats.deaths += 1;
    for (let i = 0; i < this._rockets.length; i++) this._rockets[i].active = false;
    for (let i = 0; i < this._pending.length; i++) this._pending[i].active = false;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.alive && ((engaged(e) && e.targetId === 'player') || e.provoked || e.state === 'flee')) calmDown(this, e);
    }
    for (let i = 0; i < this.hazards.length; i++) this.hazards[i].active = false;
    resetAbilities(this, true);
    dronesOnDeath(this);
    this.combo.timeLeft = 0; this.combo.count = 0; this.combo.mult = 0;
    this.bus.emit('explode', { id: 'player', x: p.x, z: p.z, size: 2 });
    this.bus.emit('playerDead', {});
    this._msg('Dein Schiff wurde zerstört. Wähle, wo du repariert werden willst.', 'warn');
    this.save();
  }

  // ───────────────────────── Shop und Hangar ─────────────────────────

  /** Preis: { cost, currency, pack } – Laser/Generator/Schiff je Stück, Munition/Raketen je Packung. */
  priceOf(kind, id) {
    switch (kind) {
      case 'laser': { const d = LASERS[id]; return d ? { cost: d.price, currency: d.currency, pack: 1 } : null; }
      case 'gen': { const d = GENERATORS[id]; return d ? { cost: d.price, currency: d.currency, pack: 1 } : null; }
      case 'ammo': { const d = AMMO[id]; return d ? { cost: packCost(id, d), currency: d.currency, pack: d.pack } : null; }
      case 'rocket': { const d = ROCKETS[id]; return d ? { cost: packCost(id, d), currency: d.currency, pack: d.pack } : null; }
      case 'ship': { const d = SHIPS[id]; return d ? { cost: d.price, currency: d.currency, pack: 1 } : null; }
      case 'extra': case 'mine': case 'tech': case 'formation': case 'drone': {
        const d = SHOP_TABLE[kind][id];
        return d ? { cost: d.price || 0, currency: d.currency, pack: 1 } : null;
      }
    }
    return null;
  }

  /**
   * Alles, was der Shop zu einem Gegenstand anzeigen muss (auch für gesperrte):
   * { kind, id, name, cost, currency, pack, level, ok, reason, owned, equipped }
   */
  shopInfo(kind, id, amount = 1) {
    const pr = this.profile;
    const table = kind === 'laser' ? LASERS : kind === 'gen' ? GENERATORS : kind === 'ammo' ? AMMO : kind === 'rocket' ? ROCKETS : kind === 'ship' ? SHIPS : SHOP_TABLE[kind] || null;
    const def = table && table[id];
    if (!def) return { kind, id, name: id, cost: 0, currency: null, pack: 0, level: 1, ok: false, reason: 'Gibt es nicht.', owned: 0, equipped: 0 };
    const price = this.priceOf(kind, id);
    const n = Math.max(1, Math.floor(amount) || 1);
    const level = def.level || 1;
    let owned = 0, equipped = 0;
    if (kind === 'laser') { owned = countOf(pr.owned.lasers, id); equipped = countOf(pr.loadout.lasers, id); }
    else if (kind === 'gen') { owned = countOf(pr.owned.gens, id); equipped = countOf(pr.loadout.gens, id); }
    else if (kind === 'ammo' || kind === 'rocket') owned = pr.ammo[id] || 0;
    else if (kind === 'ship') { owned = pr.owned.ships.includes(id) ? 1 : 0; equipped = pr.ship === id ? 1 : 0; }
    else if (kind === 'extra' || kind === 'mine') owned = pr.extras[id] || 0;
    else if (kind === 'tech') owned = pr.techs[id] || 0;
    else if (kind === 'formation') { owned = id === 'standard' || pr.owned.formations.includes(id) ? 1 : 0; equipped = this.formation === id ? 1 : 0; }
    else if (kind === 'drone') { for (const d of pr.drones) if (d.type === def.type && d.module === def.module) owned++; equipped = pr.drones.length; }
    const info = { kind, id, name: def.name, cost: price.cost * n, currency: price.currency, pack: price.pack, level, ok: false, reason: '', owned, equipped };

    if (def.dropOnly) info.reason = 'Nur als seltene Beute zu finden, nicht kaufbar.';
    else if (def.locked) info.reason = `Kommt später (ab Stufe ${level}).`;
    else if (kind === 'ship' && equipped) info.reason = 'Das fliegst du gerade.';
    else if (kind === 'formation' && def.eventOnly) info.reason = 'Nur aus Events und Toren.';
    else if (kind === 'formation' && owned) info.reason = 'Schon im Besitz.';
    else if (kind === 'drone' && pr.drones.length + n > DRONE_RULES.max) info.reason = `Höchstens ${DRONE_RULES.max} Drohnen: ${pr.drones.length} von ${DRONE_RULES.max} Plätzen belegt.`;
    else if (kind === 'ship' && owned) { info.ok = true; info.cost = 0; info.reason = 'Schon gekauft: kostenlos wechseln.'; }
    else if (pr.level < level) info.reason = `Stufe ${level} nötig (du hast Stufe ${pr.level}).`;
    else if (price.currency && (pr[price.currency] || 0) < info.cost) info.reason = `Zu wenig ${CURRENCY_NAME[price.currency]}: ${fmt(info.cost)} nötig, du hast ${fmt(pr[price.currency] || 0)}.`;
    else info.ok = true;
    return info;
  }

  /** kind: 'laser'|'gen'|'ammo'|'rocket'|'ship'. amount = Stück bzw. Packungen. → { ok, reason } */
  buy(kind, id, amount = 1) {
    const pr = this.profile;
    if (!this.player.alive) return this._fail('Erst reparieren, dann einkaufen.');
    const n = Math.max(1, Math.floor(amount) || 1);
    const info = this.shopInfo(kind, id, n);
    if (!info.ok) return this._fail(info.reason);
    if (info.cost > 0 && info.currency) pr[info.currency] -= info.cost;

    let text = '';
    switch (kind) {
      case 'laser': {
        for (let i = 0; i < n; i++) { pr.owned.lasers.push(id); this._autoEquip('laser', id); }
        text = `${n > 1 ? n + '× ' : ''}${LASERS[id].name} gekauft.`;
        this._questProgress('buy', id, n);
        break;
      }
      case 'gen': {
        for (let i = 0; i < n; i++) { pr.owned.gens.push(id); this._autoEquip('gen', id); }
        text = `${n > 1 ? n + '× ' : ''}${GENERATORS[id].name} gekauft.`;
        this._questProgress('buy', id, n);
        break;
      }
      case 'ammo':
      case 'rocket': {
        const shots = info.pack * n;
        pr.ammo[id] = (pr.ammo[id] || 0) + shots;
        text = `${fmt(shots)} ${id} gekauft.`;
        this._questProgress('buy', id, n);
        break;
      }
      case 'extra': case 'mine': case 'tech': {
        const bag = kind === 'tech' ? pr.techs : pr.extras;
        bag[id] = (bag[id] || 0) + n;
        if (this.abilities[id]) this.abilities[id].count = bag[id];
        text = `${n}× ${id} gekauft (jetzt ${fmt(bag[id])}).`;
        break;
      }
      case 'formation': {
        pr.owned.formations.push(id);
        text = `Formation ${FORMATIONS[id].name} gekauft.`;
        break;
      }
      case 'drone': {
        const D = DRONE_SHOP[id];
        for (let i = 0; i < n; i++) addDrone(this, D.type, D.module);
        text = `${n > 1 ? n + '× ' : ''}${D.name} gekauft (${pr.drones.length} von ${DRONE_RULES.max} Drohnenplätzen).`;
        break;
      }
      case 'ship': {
        const isNew = !pr.owned.ships.includes(id);
        if (isNew) pr.owned.ships.push(id);
        this._switchShip(id);
        text = isNew ? `${SHIPS[id].name} gekauft! ${SHIPS[id].laserSlots} Laserplätze, ${SHIPS[id].genSlots} Generatorplätze.` : `Gewechselt auf ${SHIPS[id].name}.`;
        if (isNew) this._questProgress('buy', id, 1);
        break;
      }
    }
    this._msg(text + (info.cost > 0 ? ` (−${fmt(info.cost)} ${CURRENCY_NAME[info.currency]})` : ''), 'info');
    this._refreshStats();
    this._emitProfile();
    this.save();
    return { ok: true, reason: '' };
  }

  _fail(reason) {
    this._msg(reason, 'warn', 'shopFail', 0.3);
    return { ok: false, reason };
  }

  /** Neues Teil aus dem Inventar in den schwächsten Platz einbauen, wenn es besser ist. */
  _autoEquip(slotKind, id) {
    const pr = this.profile;
    const ship = SHIPS[pr.ship];
    if (slotKind === 'laser') {
      const L = pr.loadout.lasers;
      if (L.length < ship.laserSlots) { L.push(id); removeOne(pr.owned.lasers, id); return true; }
      let wi = -1, wd = Infinity;
      for (let i = 0; i < L.length; i++) { const d = LASERS[L[i]]?.damage ?? 0; if (d < wd) { wd = d; wi = i; } }
      if (wi >= 0 && LASERS[id].damage > wd) {
        removeOne(pr.owned.lasers, id);
        pr.owned.lasers.push(L[wi]);
        L[wi] = id;
        return true;
      }
      return false;
    }
    const G = pr.loadout.gens;
    const def = GENERATORS[id];
    if (G.length < ship.genSlots) { G.push(id); removeOne(pr.owned.gens, id); return true; }
    let wi = -1, wv = Infinity;
    for (let i = 0; i < G.length; i++) {
      const g = GENERATORS[G[i]];
      if (g && g.kind === def.kind && g.value < wv) { wv = g.value; wi = i; }
    }
    if (wi >= 0 && def.value > wv) {
      removeOne(pr.owned.gens, id);
      pr.owned.gens.push(G[wi]);
      G[wi] = id;
      return true;
    }
    return false;
  }

  _switchShip(id) {
    const pr = this.profile;
    const ship = SHIPS[id];
    pr.ship = id;
    this.player.ship = id;
    const L = pr.loadout.lasers, G = pr.loadout.gens;
    // zu viele Teile → ins Inventar
    while (L.length > ship.laserSlots) pr.owned.lasers.push(L.pop());
    while (G.length > ship.genSlots) pr.owned.gens.push(G.pop());
    // freie Plätze mit den besten Teilen aus dem Inventar auffüllen
    pr.owned.lasers.sort((a, b) => (LASERS[b]?.damage ?? 0) - (LASERS[a]?.damage ?? 0));
    while (L.length < ship.laserSlots && pr.owned.lasers.length) L.push(pr.owned.lasers.shift());
    // restliche Laserplätze: kostenlose Pulse Laser (neues Schiff kommt nicht mit leeren Plätzen)
    while (L.length < ship.laserSlots) L.push('pulse');
    while (G.length < ship.genSlots && pr.owned.gens.length) G.push(pr.owned.gens.shift());
    resetConfigsForShip(this);
    this._refreshStats();
    this.player.hp = this.player.hpMax;
    this.player.shield = this.player.shieldMax;
  }

  /** Teil aus dem Inventar in Platz `index` einbauen (Tausch). itemId null = ausbauen. */
  equip(slotKind, index, itemId) {
    const pr = this.profile;
    if (slotKind !== 'laser' && slotKind !== 'gen') return false;
    if (this.inCombat && !this.docked) { this._fail('Im Kampf kannst du nichts umbauen.'); return false; }
    const ship = SHIPS[pr.ship];
    const slots = slotKind === 'laser' ? ship.laserSlots : ship.genSlots;
    const arr = slotKind === 'laser' ? pr.loadout.lasers : pr.loadout.gens;
    const inv = slotKind === 'laser' ? pr.owned.lasers : pr.owned.gens;
    if (index < 0 || index >= slots) return false;
    if (itemId == null) {
      if (index >= arr.length) return false;
      inv.push(arr[index]);
      arr.splice(index, 1);
    } else {
      if (!inv.includes(itemId)) { this._fail('Das hast du nicht im Lager.'); return false; }
      removeOne(inv, itemId);
      if (index < arr.length) { inv.push(arr[index]); arr[index] = itemId; }
      else arr.push(itemId);
    }
    this._refreshStats();
    this._emitProfile();
    return true;
  }

  sellOre() {
    const pr = this.profile;
    if (!this.docked) { this._fail('Erz kannst du nur in der Station verkaufen.'); return 0; }
    let total = 0, units = 0;
    for (const k in pr.cargo) {
      const n = pr.cargo[k] || 0;
      if (!n || !ORES[k]) continue;
      total += n * ORES[k].price;
      units += n;
      pr.cargo[k] = 0;
    }
    if (!units) { this._msg('Kein Erz an Bord.', 'info'); return 0; }
    pr.credits += total;
    this.bus.emit('loot', { credits: total, tritium: 0, xp: 0, honor: 0, ammo: null, ore: null, x: this.player.x, z: this.player.z });
    this._msg(`${fmt(units)} Erz verkauft: +${fmt(total)} Credits`, 'loot');
    this._emitProfile();
    this.save();
    return total;
  }

  // ───────────────────────── Drohnen (src/sim/drones.js) ─────────────────────────
  /** Eigene Drohnen (Spielstand, nur lesen): [{ id, type, module, level, xp, hp, broken }] */
  get drones() { return this.profile.drones; }
  sellDrone(ref) { return sellDrone(this, ref); }
  repairDrone(ref = 'all') { return repairDrone(this, ref); }
  setDroneModule(ref, module) { return setDroneModule(this, ref, module); }
  droneInfo(d) { return droneInfo(d); }

  get cargoUsed() {
    const c = this.profile.cargo;
    let n = 0;
    for (const k in c) n += c[k] || 0;
    return n;
  }
  get cargoMax() { return SHIPS[this.profile.ship].cargo; }

  // ───────────────────────── Fortschritt ─────────────────────────

  _addXp(n) {
    const pr = this.profile;
    pr.xp += n;
    let up = false;
    while (pr.level < MAX_LEVEL && pr.xp >= xpForLevel(pr.level + 1)) {
      pr.level += 1;
      up = true;
      this.bus.emit('levelup', { level: pr.level });
      this._msg(`Stufe ${pr.level} erreicht!`, 'info');
    }
    if (up) this.save();
  }

  _startQuest() {
    const pr = this.profile;
    const def = QUESTS[pr.quest.index];
    if (!def) { this.quest = null; return; }
    const q = this._questObj;
    q.def = def;
    q.progress = Math.min(pr.quest.progress || 0, def.goal.count);
    this.quest = q;
    const voice = FACTIONS[pr.faction].stationVoice;
    this.bus.emit('message', { text: `${voice}: ${def.text}`, kind: 'radio', from: voice, title: def.title });
    this.bus.emit('quest', { quest: def, progress: q.progress, done: false });
  }

  _questProgress(type, target, amount) {
    const q = this.quest;
    if (!q) return;
    const g = q.def.goal;
    if (g.type !== type) return;
    if (type === 'jump') { if (target < g.target) return; }
    else if (g.target != null && g.target !== target) return;
    q.progress = Math.min(g.count, q.progress + amount);
    this.profile.quest.progress = q.progress;
    const done = q.progress >= g.count;
    this.bus.emit('quest', { quest: q.def, progress: q.progress, done });
    if (done) this._completeQuest();
  }

  _completeQuest() {
    const pr = this.profile;
    const def = this.quest.def;
    const r = def.reward || {};
    const parts = [];
    if (r.credits) { pr.credits += r.credits; parts.push(`${fmt(r.credits)} Credits`); }
    if (r.tritium) { pr.tritium += r.tritium; parts.push(`${fmt(r.tritium)} Tritium`); }
    if (r.honor) { pr.honor += r.honor; parts.push(`${fmt(r.honor)} Ehre`); }
    if (r.xp) parts.push(`${fmt(r.xp)} Erfahrung`);
    this.bus.emit('loot', { credits: r.credits || 0, tritium: r.tritium || 0, xp: r.xp || 0, honor: r.honor || 0, ammo: null, ore: null, x: this.player.x, z: this.player.z });
    this._msg(`Auftrag erledigt: ${def.title}. Belohnung: ${parts.join(', ')}.`, 'quest');
    pr.quest = { index: pr.quest.index + 1, progress: 0 };
    this.quest = null;
    if (r.xp) this._addXp(r.xp);
    if (pr.quest.index < QUESTS.length) this._questNextAt = this.time + 3;
    else this._msg('Alle Aufträge erledigt. Gut gemacht, Pilot!', 'quest');
    this._emitProfile();
    this.save();
  }

  // ───────────────────────── Speichern ─────────────────────────

  save() {
    try { syncConfig(this); } catch { /* Konfiguration nie kritisch */ }
    try { store.save(this.profile); } catch { /* Speichern darf das Spiel nie anhalten */ }
  }

  _emitProfile() {
    this._profileDirty = false;
    this._profileEmitAt = this.time + C.PROFILE_EVENT_MIN;
    this.bus.emit('profile', { profile: this.profile });
  }

  // ───────────────────────── Aufbau ─────────────────────────

  _refreshStats() {
    const p = this.player;
    const pr = this.profile;
    const ship = SHIPS[pr.ship] || SHIPS.s1;
    let speed = ship.speed, shield = 0;
    for (const g of pr.loadout.gens) {
      const d = GENERATORS[g];
      if (!d) continue;
      if (d.kind === 'speed') speed += d.value;
      else if (d.kind === 'shield') shield += d.value;
    }
    shield += droneShield(pr);         // Schild-Drohnen
    this._speed = speed;
    p.hpMax = ship.hp;
    p.shieldMax = shield;
    if (p.hp > p.hpMax) p.hp = p.hpMax;
    if (p.shield > p.shieldMax) p.shield = p.shieldMax;
    p.loadout = pr.loadout;
    p.ship = pr.ship;
  }

  /** Aktuelles Höchsttempo des Spielers (Schiff + DR-Generatoren). */
  get playerSpeed() { return this._speed; }

  _changeSector(id, fromId) {
    // alte Entities abmelden (Grafik baut bei 'sector' ohnehin neu auf)
    for (const id0 of this.entities.keys()) if (id0 !== 'player') this.bus.emit('despawn', { id: id0 });
    this.profile.sector = id;
    this._buildSector(id);
    const p = this.player;
    let back = null;
    if (fromId) for (const o of this.portals) if (o.type === fromId) { back = o; break; }
    if (back) this._placeNear(back.x, back.z, C.JUMP_ARRIVE_OFFSET);
    else this._placeAtSpawn();
    p.px = p.x; p.pz = p.z; p.prot = p.rot;
    this._haltPlayer(); p.hasMove = false;
    p.targetId = null; p.attacking = false;
    for (let i = 0; i < this._rockets.length; i++) this._rockets[i].active = false;
    for (let i = 0; i < this._pending.length; i++) this._pending[i].active = false;
    for (const m of this.mines) m.active = false;   // Minen bleiben im alten Sektor zurück
    this._updateZones();
    this.bus.emit('sector', { sector: this.sector });
  }

  _buildSector(id) {
    const s = this.sectors[id];
    this.sector = s;
    if (!s.fields) s.fields = [];
    this.entities.clear();
    this.enemies.length = 0;
    this.crates.length = 0;
    this.ores.length = 0;
    for (const w of this.wrecks) this._wreckPool.push(w);
    this.wrecks.length = 0;
    this.portals.length = 0;
    this.rocks.length = 0;
    this.movers.length = 0;
    this.groups.length = 0;
    this.station = null;
    this.jump = null;
    this.docked = false;
    this._alpha = null;
    this._announce = null;
    this._spNext = this.time + 3;
    this._callNext = this.time + 10;
    for (let i = 0; i < this.hazards.length; i++) this.hazards[i].active = false;
    this.grid.reset(s.size, 250, 128);
    this.rockGrid.reset(s.size, 400, 64);
    this._routes = sectorRoutes(s);

    if (s.station) {
      const st = makeEntity('station', 'station');
      st.x = st.px = s.station.x; st.z = st.pz = s.station.z;
      st.radius = 160;
      st.name = s.station.name;
      st.faction = this.profile.faction;
      this.station = st;
      this.entities.set(st.id, st);
    }
    for (const pd of s.portals) {
      const o = makeEntity(`portal-${pd.to}`, 'portal');
      o.type = pd.to;
      o.x = o.px = pd.x; o.z = o.pz = pd.z;
      o.radius = 90;
      o.name = `Sprungtor nach ${this.sectors[pd.to]?.name || pd.to}`;
      this.portals.push(o);
      this.entities.set(o.id, o);
    }

    // große Asteroiden (Kulisse mit sanfter Abstoßung)
    const rl = rockLayout(this);
    for (let i = 0; i < rl.length; i++) {
      const r = rl[i];
      const a = makeEntity(`a${i}`, 'asteroid');
      a.type = 'rock'; a.name = 'Asteroid';
      a.x = a.px = r.x; a.z = a.pz = r.z; a.radius = r.r;
      a.rot = a.prot = r.rot; a.spin = r.spin;
      this.rocks.push(a);
      this.rockGrid.insert(a);
      this.entities.set(a.id, a);
    }

    // Gegner: Rudel (2–4) und Einzelgänger mit Mindestabstand in ihren Zonen
    let n = 0, gi = 0;
    for (const sp of s.spawns) {
      const def = ENEMIES[sp.type];
      // Rudel-Typen: ein fester Anteil fliegt allein, der Rest in Rudeln zu 2–4
      const sizes = [];
      let left = sp.count;
      let loners = def.pack ? Math.max(1, Math.round(sp.count * C.LONER_SHARE * 0.5)) : sp.count;
      while (left > 0) {
        let size = 1;
        if (loners > 0) loners--;
        else size = this.rng.int(C.PACK_SIZE[0], C.PACK_SIZE[1]);
        if (size > left) size = left;
        left -= size;
        sizes.push(size);
      }
      const habs = habitatQuota(this, def, sizes.length);
      for (let si = 0; si < sizes.length; si++) {
        const size = sizes[si];
        const g = makeGroup(`g${gi++}`, sp.type, habs[si]);
        this.groups.push(g);
        placeGroupCenter(this, g, 0);
        const rot0 = this.rng.range(-Math.PI, Math.PI);
        for (let k = 0; k < size; k++) {
          const e = makeEnemy(`e${n++}`, sp.type);
          e.phase = this.rng.next() * Math.PI * 2;
          e.group = g; e.slot = k;
          g.members.push(e);
          this._rollRank(e);
          if (k === 0) { g.leader = e; e.x = g.cx; e.z = g.cz; e.rot = rot0; }
          else { slotPos(g.leader, k, slotGap(def.radius), SLOT); e.x = SLOT.x; e.z = SLOT.z; e.rot = rot0; }
          e.px = e.homeX = e.wx = e.x; e.pz = e.homeZ = e.wz = e.z; e.prot = e.rot;
          e.thinkCd = this.rng.next() * C.THINK_INTERVAL;
          this.enemies.push(e);
          this.entities.set(e.id, e);
        }
      }
    }
    for (let i = 0; i < s.crates; i++) {
      const c = makeEntity(`c${i}`, 'crate');
      c.radius = 12; c.name = 'Crate'; c.respawnAt = 0; c.temp = false;
      this._itemPoint(false);
      c.x = c.px = this._pt.x; c.z = c.pz = this._pt.z;
      c.rot = c.prot = this.rng.range(-Math.PI, Math.PI);
      this.crates.push(c);
      this.entities.set(c.id, c);
    }
    let oi = 0;
    for (const type in s.ore) {
      for (let i = 0; i < s.ore[type]; i++) {
        const o = makeEntity(`o${oi++}`, 'ore');
        o.type = type; o.radius = 10; o.name = ORES[type].name;
        o.amount = this.rng.int(C.ORE_CHUNK[0], C.ORE_CHUNK[1]);
        o.respawnAt = 0;
        this._itemPoint(this.rng.next() < C.ORE_IN_FIELDS);
        o.x = o.px = this._pt.x; o.z = o.pz = this._pt.z;
        o.rot = o.prot = this.rng.range(-Math.PI, Math.PI);
        this.ores.push(o);
        this.entities.set(o.id, o);
      }
    }
    this.entities.set('player', this.player);
    resetEvents(this);
  }

  /** Punkt für Crate/Erz → this._pt (inField: bevorzugt in einem Asteroidenfeld, zwischen den Brocken). */
  _itemPoint(inField) {
    const fields = this.sector.fields;
    if (inField) {
      let f = null, k = 0;
      for (const o of fields) if (o.type === 'asteroids' && this.rng.next() < 1 / ++k) f = o;
      if (f) {
        for (let tries = 0; tries < 20; tries++) {
          const a = this.rng.next() * Math.PI * 2, r = Math.sqrt(this.rng.next()) * f.r * 0.9;
          const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
          if (pointOk(this, x, z, C.ITEM_MIN_STATION, 250, 30, 0)) { this._pt.x = x; this._pt.z = z; return this._pt; }
        }
      }
    }
    for (let tries = 0; tries < 20; tries++) {
      this._randomPoint(C.ITEM_MIN_STATION, 250, 0.9);
      if (!this.inRock(this._pt.x, this._pt.z, 30)) break;
    }
    return this._pt;
  }

  /** Startpunkt: an der Station, sonst am ersten Sprungtor. */
  _placeAtSpawn() {
    if (this.station) this._placeNear(this.station.x, this.station.z, 180);
    else if (this.portals.length) this._placeNear(this.portals[0].x, this.portals[0].z, C.JUMP_ARRIVE_OFFSET);
    else { this.player.x = 0; this.player.z = 0; }
    const p = this.player;
    p.px = p.x; p.pz = p.z;
    p.rot = p.prot = headingOf(-p.x, -p.z);
  }

  /** Spieler bei (x, z) etwas zur Kartenmitte versetzt hinstellen. */
  _placeNear(x, z, offset) {
    const p = this.player;
    const l = Math.sqrt(x * x + z * z) || 1;
    const jitter = (this.rng.next() - 0.5) * 0.6;
    const ax = -x / l, az = -z / l;
    const c = Math.cos(jitter), s = Math.sin(jitter);
    p.x = x + (ax * c - az * s) * offset;
    p.z = z + (ax * s + az * c) * offset;
    p.rot = p.prot = headingOf(-p.x, -p.z);
  }

  /** Zufallspunkt auf der Karte mit Abstand zu Station und Sprungtoren → this._pt */
  _randomPoint(minStation, minPortal, spread) {
    const lim = this.sector.size * spread;
    const st = this.sector.station;
    const ports = this.sector.portals;
    let x = 0, z = 0;
    for (let tries = 0; tries < 60; tries++) {
      x = this.rng.range(-lim, lim);
      z = this.rng.range(-lim, lim);
      let ok = true;
      if (st) { const dx = x - st.x, dz = z - st.z; if (dx * dx + dz * dz < minStation * minStation) ok = false; }
      for (let i = 0; ok && i < ports.length; i++) {
        const dx = x - ports[i].x, dz = z - ports[i].z;
        if (dx * dx + dz * dz < minPortal * minPortal) ok = false;
      }
      if (ok) break;
    }
    this._pt.x = x; this._pt.z = z;
    return this._pt;
  }

  // ───────────────────────── Meldungen ─────────────────────────

  /** true, wenn eine gedrosselte Meldung mit `key` wieder gesendet werden darf (merkt sich dann die Zeit). */
  _msgDue(key, interval) {
    const last = this._msgTimes.get(key);
    if (last != null && this.time - last < interval) return false;
    this._msgTimes.set(key, this.time);
    return true;
  }

  /**
   * „Ziel zu weit weg“: je Ziel einmal, bis es wieder in Reichweite war (Merker _rangeWarnId).
   * manual = Tastendruck (Rakete/SAL): dann höchstens alle RANGE_MSG_REPEAT Sekunden erneut.
   */
  _rangeMsg(tgt, text, manual) {
    if (this._rangeWarnId === tgt.id && !(manual && this.time - this._rangeWarnAt >= C.RANGE_MSG_REPEAT)) return;
    this._rangeWarnId = tgt.id;
    this._rangeWarnAt = this.time;
    this.bus.emit('message', { text, kind: 'info' });
  }

  /** Meldung senden; mit `key` höchstens alle `interval` Sekunden. */
  _msg(text, kind = 'info', key = null, interval = 0) {
    if (key) {
      const last = this._msgTimes.get(key);
      if (last != null && this.time - last < interval) return;
      this._msgTimes.set(key, this.time);
    }
    this.bus.emit('message', { text, kind });
  }
}

// ───────────────────────── Hilfen ─────────────────────────

function homeSectorId(faction) { return `${FACTIONS[faction].prefix}-1`; }

function countOf(arr, id) { let n = 0; for (const x of arr) if (x === id) n++; return n; }

function removeOne(arr, id) {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  return i >= 0;
}

/** Ältere oder unvollständige Spielstände ergänzen (ändert nur fehlende Felder). */
function normalizeProfile(pr) {
  pr.level = pr.level || 1;
  pr.xp = pr.xp || 0;
  pr.honor = pr.honor || 0;
  pr.credits = pr.credits || 0;
  pr.tritium = pr.tritium || 0;
  if (!SHIPS[pr.ship]) pr.ship = 's1';
  pr.loadout = pr.loadout || { lasers: ['pulse'], gens: [] };
  pr.loadout.lasers = pr.loadout.lasers || [];
  pr.loadout.gens = pr.loadout.gens || [];
  pr.owned = pr.owned || {};
  pr.owned.lasers = pr.owned.lasers || [];
  pr.owned.gens = pr.owned.gens || [];
  pr.owned.ships = pr.owned.ships || ['s1'];
  if (!pr.owned.ships.includes(pr.ship)) pr.owned.ships.push(pr.ship);
  pr.ammo = pr.ammo || {};
  for (const k of AMMO_KEYS) if (typeof pr.ammo[k] !== 'number') pr.ammo[k] = 0;
  if (typeof pr.ammo.R1 !== 'number') pr.ammo.R1 = 0;
  if (!AMMO[pr.selectedAmmo] || pr.selectedAmmo === 'SAL') pr.selectedAmmo = 'L1';
  pr.cargo = pr.cargo || {};
  for (const k in ORES) if (typeof pr.cargo[k] !== 'number') pr.cargo[k] = 0;
  pr.quest = pr.quest || { index: 0, progress: 0 };
  pr.stats = pr.stats || {};
  pr.stats.kills = pr.stats.kills || {};
  pr.stats.crates = pr.stats.crates || 0;
  pr.stats.deaths = pr.stats.deaths || 0;
  pr.stats.playSeconds = pr.stats.playSeconds || 0;
}
