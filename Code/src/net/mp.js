// Mehrspieler (Testphase, ohne Server-Datenbank): gemeinsame Sektoren über Supabase Realtime (Presence + Broadcast).
// Je Sektor ein Kanal (Heimat je Fraktion, ab Sektor 2 gemeinsamer Raum aller Fraktionen), dazu je ein Chat-Kanal
// für die eigene Fraktion und einer für alle. Eigener Zustand 9× pro Sekunde (nur bei Änderung, spätestens 1× pro
// Sekunde), fremde Schiffe mit 130 ms Puffer interpoliert. Einladung „Zu zweit fliegen“ startet den bestehenden Koop
// (coop.js). PvP opt-in: der Schütze meldet Treffer, der Getroffene prüft und wendet den Schaden selbst an.
// Nachrichtenformat und Regeln: Planung/MEHRSPIELER.md. Reine Logik: mp-core.js (Selbsttest).
import { Coop, newCode } from './coop.js';
import { sb } from './supa.js'; // ein gemeinsamer Supabase-Client (Konto, Koop, Mehrspieler)
import * as M from './mp-core.js';
import { FACTIONS, SHIPS, LASERS, GENERATORS, sectorsFor } from '../core/data.js';
import { LASER_INTERVAL, PLAYER_RADIUS } from '../sim/config.js';

const PVP_KEY = 'ls.mp.pvp';
const MUTE_KEY = 'ls.mp.mute';
const INVITE_TTL = 30;      // s
const TRACK_MIN = 2;        // s zwischen zwei Presence-Aktualisierungen
const VIS_RANGE = 1000;     // m: Schüsse fremder Spieler auf Gegner nur zeigen, wenn der Gegner hier so nah ist
const CHAN_KEYS = ['sector', 'faction', 'all'];
export const CHAN_LABEL = { sector: 'SEKTOR', faction: 'FRAKTION', all: 'ALLE' };

const nowS = () => performance.now() / 1000;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* privater Modus */ } };

function cleanMeta(m) {
  if (!m || typeof m !== 'object' || !FACTIONS[m.fac]) return null;
  const lo = m.lo && typeof m.lo === 'object' ? m.lo : {};
  const lasers = Array.isArray(lo.lasers) ? lo.lasers.filter((k) => typeof k === 'string' && LASERS[k]).slice(0, 10) : [];
  const gens = Array.isArray(lo.gens) ? lo.gens.filter((k) => typeof k === 'string' && GENERATORS[k]).slice(0, 12) : [];
  const n = (v, a, b, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
  return {
    cs: M.cleanName(m.cs), fac: m.fac, ship: SHIPS[m.ship] ? m.ship : 's1', lv: Math.round(n(m.lv, 1, 99, 1)),
    cp: typeof m.cp === 'string' && /^\d{4}$/.test(m.cp) ? m.cp : '',
    hm: Math.round(n(m.hm, 1, 1e7, 1000)), sm: Math.round(n(m.sm, 0, 1e7, 0)),
    lo: { lasers: lasers.length ? lasers : ['pulse'], gens },
  };
}
const metaSig = (m) => `${m.fac}|${m.ship}|${m.lo.lasers.join(',')}|${m.lo.gens.join(',')}`;

export class Multiplayer {
  constructor(world, bus) {
    this.world = world; this.bus = bus;
    this.sid = M.newSid();
    this.remotes = new Map();
    this.chat = { sector: [], faction: [], all: [] };
    this.unread = { sector: 0, faction: 0, all: 0 };
    this.muted = new Set();
    try { for (const n of JSON.parse(lsGet(MUTE_KEY) || '[]')) if (typeof n === 'string') this.muted.add(n.toLowerCase()); } catch { /* egal */ }
    this.pvp = lsGet(PVP_KEY) === '1';
    this.rate = new M.RateLimit(4, 8, 0.7);
    this.pres = new M.RateLimit(M.PRES_N, M.PRES_PER, M.PRES_GAP); // Presence-Budget (Supabase-Grenze je Client)
    this._rejoinN = 0; this._rejoinT = 0;
    this.inv = new Map();      // eingehende Einladungen: sid → { code, cs, fac, sec, t }
    this.outInv = null;        // gesendete Einladung: { to, code, t }
    this.lastAttacker = null;  // { sid, t } für den Abschuss
    this.hitOn = new Map();    // sid → Zeit meines letzten Treffers (Abschuss zählt nur dann für mich)
    this.honorAt = new Map();  // Rufname → Zeit der letzten Ehre für diesen Gegner
    this.secCh = null; this.secKey = null; this.secReady = false;
    this._chain = Promise.resolve();
    this._sendAcc = 1; this._lastPack = null; this._lastSentAt = -1e9;
    this._trackAt = -1e9; this._trackSig = ''; this._metaAcc = 0;
    this._samp = { x: 0, z: 0, rot: 0, spd: 0, vx: 0, vz: 0, extra: 0 };
    this._msgN = 0;
    this.arriveAt = nowS();
    this.away = false;
    this.disposed = false;
    this.status = 'verbinde';
    world.mp = this;

    this.facCh = this._chatChannel(M.factionChannel(world.profile.faction), 'faction');
    this.allCh = this._chatChannel(M.GLOBAL_CHANNEL, 'all');
    this._offSector = bus.on('sector', () => this._joinSector());
    this._offDead = bus.on('playerDead', () => { if (world.player.targetId?.startsWith?.('rp:')) world.setTarget(null); });
    this._onVis = () => this._visibility();
    document.addEventListener('visibilitychange', this._onVis);
    this._onHide = () => this.dispose();
    window.addEventListener('pagehide', this._onHide);
    this._joinSector();
  }

  // ───────────────────────── öffentliche Schnittstelle (HUD) ─────────────────────────

  get callsign() { return this.world.profile.callsign; }
  isMuted(cs) { return this.muted.has(String(cs || '').toLowerCase()); }
  setMuted(cs, on) {
    const k = String(cs || '').toLowerCase();
    if (!k) return;
    if (on) this.muted.add(k); else this.muted.delete(k);
    lsSet(MUTE_KEY, JSON.stringify([...this.muted]));
    this._emit('roster');
  }
  unmuteAll() { this.muted.clear(); lsSet(MUTE_KEY, '[]'); this._emit('roster'); }

  setPvp(on) {
    on = !!on;
    if (on === this.pvp) return;
    this.pvp = on;
    lsSet(PVP_KEY, on ? '1' : '0');
    const p = this.world.player;
    if (!on && p.targetId && p.targetId.startsWith('rp:')) this.world.setTarget(null);
    this._sys(on ? 'PvP an: In Sektoren ab 2 außerhalb der sicheren Zone kannst du Piloten anderer Fraktionen angreifen und wirst selbst angreifbar.' : 'PvP aus: Du bist für andere Piloten nicht angreifbar und greifst keine an.', 'sector');
    this._lastPack = null; // PvP steht in den Flags des Zustands: sofort senden, keine Presence nötig
    this._emit('roster');
  }

  /** Spielerliste für das HUD (ohne mich), nach Entfernung sortiert */
  roster() {
    const p = this.world.player, out = [];
    for (const R of this.remotes.values()) {
      if (!R.meta || R.parked) continue;
      const has = R.ent && R.st;
      out.push({
        sid: R.sid, cs: R.meta.cs, fac: R.meta.fac, lv: R.meta.lv, ship: R.meta.ship, pvp: !!(R.st && R.st.flags & M.FLAG.pvp),
        dist: has ? Math.hypot(R.ent.x - p.x, R.ent.z - p.z) : (R.st ? Math.hypot(R.st.x - p.x, R.st.z - p.z) : Infinity),
        attackable: !!(R.ent && R.ent.pvpOk), coop: this._isPartner(R), muted: this.isMuted(R.meta.cs),
        invited: !!(this.outInv && this.outInv.to === R.sid), inviting: this.inv.has(R.sid), docked: !!(R.st && R.st.flags & M.FLAG.docked),
        hull: R.st ? R.st.hull : 1, shield: R.st ? R.st.shield : 0, id: 'rp:' + R.sid,
      });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }
  invites() {
    const t = nowS(), out = [];
    for (const [sid, v] of this.inv) if (t - v.t < INVITE_TTL) out.push({ sid, cs: v.cs, fac: v.fac, left: Math.ceil(INVITE_TTL - (t - v.t)) });
    return out;
  }

  /** Chat senden. ch: 'sector'|'faction'|'all' → '' (gesendet) oder Grund, warum nicht */
  say(ch, text) {
    if (!CHAN_KEYS.includes(ch)) return 'Unbekannter Kanal.';
    const clean = M.cleanText(text);
    if (!clean) return '';
    const wait = this.rate.take(nowS());
    if (wait > 0) return `Langsamer funken: noch ${Math.ceil(wait)} s.`;
    const c = ch === 'sector' ? (this.secReady ? this.secCh : null) : ch === 'faction' ? this.facCh : this.allCh;
    if (!c || c.state !== 'joined') return 'Funk nicht verbunden.';
    const m = M.filterWords(clean);
    const id = this.sid + ':' + (++this._msgN);
    this._send(c, 'c', { i: this.sid, n: id, cs: this.callsign, fac: this.world.profile.faction, m });
    this._addChat(ch, { id, sid: this.sid, cs: this.callsign, fac: this.world.profile.faction, text: m, self: true });
    return '';
  }

  invite(sid) {
    const R = this.remotes.get(sid);
    if (!R || !R.meta) return;
    if (this.world.coop) { this._sys('Du fliegst schon im Koop. Erst den Koop verlassen.', 'sector'); return; }
    const code = newCode();
    this.outInv = { to: sid, code, t: nowS() };
    this._send(this.secCh, 'inv', { i: this.sid, to: sid, code, cs: this.callsign, fac: this.world.profile.faction, sec: this.world.sector.id });
    this._sys(`Einladung an ${R.meta.cs} gesendet: zu zweit fliegen.`, 'sector');
    this._emit('roster');
  }
  answer(sid, ok) {
    const v = this.inv.get(sid);
    if (!v) return;
    this.inv.delete(sid);
    this._send(this.secCh, 'inva', { i: this.sid, to: sid, code: v.code, ok: ok ? 1 : 0 });
    if (ok) {
      this._sys(`Koop mit ${v.cs}: verbinde …`, 'sector');
      this._startCoop({ role: 'guest', code: v.code, faction: v.fac, sector: v.sec }, sid);
    }
    this._emit('roster');
  }
  leaveCoop() {
    if (!this.world.coop) return;
    this._endCoop('Koop verlassen.');
  }
  /** Koop beenden; ein Gast einer anderen Fraktion kehrt in die eigenen Sektoren zurück (gleicher Index, Position bleibt). */
  _endCoop(text) {
    const w = this.world, c = w.coop, pr = w.profile;
    if (c) c.stop();
    this.coopSid = null;
    if (w._homeFac && w._homeFac !== pr.faction && FACTIONS[pr.faction] && w.sector) {
      const secs = sectorsFor(pr.faction), id = M.sameIndexSector(secs, w.sector.index || 1);
      if (id) {
        const p = w.player, x = p.x, z = p.z, rot = p.rot;
        w._homeFac = pr.faction; w.sectors = secs;
        w._changeSector(id, null);
        p.x = p.px = x; p.z = p.pz = z; p.rot = p.prot = rot;
        w._updateZones();
      }
    }
    this._sys(text, 'sector');
    this._emit('roster');
  }
  /** Fremden Spieler als Ziel wählen (nur wenn angreifbar) */
  target(sid) {
    const R = this.remotes.get(sid);
    if (R && R.ent && R.ent.pvpOk) this.world.setTarget(R.ent.id);
  }

  /** Vom Spiel (world._hitEnemy) aufgerufen: eigener Treffer an einem fremden Spieler */
  hit(ent, dmg, shieldOnly, crit, rocket) {
    const sid = ent && ent.id && ent.id.startsWith('rp:') ? ent.id.slice(3) : null;
    if (!sid || !ent.pvpOk || !this.pvp) return;
    this.hitOn.set(sid, nowS());
    this._send(this.secCh, 'hit', { i: this.sid, to: sid, d: Math.round(dmg), s: shieldOnly ? 1 : 0, c: crit ? 1 : 0, r: rocket ? 1 : 0 });
  }

  // ───────────────────────── jedes Bild ─────────────────────────

  update(dt) {
    if (this.disposed) return;
    const w = this.world, p = w.player, t = nowS();
    const me = this._me(t);
    for (const R of this.remotes.values()) this._updateRemote(R, t, dt, me);
    // Einladungen verfallen
    if (this.outInv && t - this.outInv.t > INVITE_TTL) { this.outInv = null; this._emit('roster'); }
    for (const [sid, v] of this.inv) if (t - v.t > INVITE_TTL) { this.inv.delete(sid); this._emit('roster'); }
    // Koop aus einer Einladung: Partner länger weg (verlassen, Flug beendet, getrennt) → Koop beenden, wieder frei
    if (w.coop && this.coopSid && t - this.coopAt > 12) {
      this._noAlly = w.entities.get('ally') ? 0 : this._noAlly + dt;
      if (this._noAlly > 6) this._endCoop('Koop beendet: Mitspieler nicht mehr verbunden.');
    } else if (!w.coop && this.coopSid) this.coopSid = null;
    if (this._rejoinT > 0 && t >= this._rejoinT) { this._rejoinT = 0; this._joinSector(true); }
    if (this.away || !this.secReady) return;
    // Presence-Daten aktuell halten (Schiff, Stufe, Koop); aufgeschobene Aktualisierung geht raus, sobald das Budget reicht
    this._metaAcc += dt;
    if (this._metaAcc >= 1) { this._metaAcc = 0; this._track(false); }
    // eigener Zustand
    this._sendAcc += dt;
    if (this._sendAcc < 1 / M.SEND_HZ) return;
    this._sendAcc = 0;
    let tgt = '';
    const tid = p.targetId;
    if (tid) tgt = tid.startsWith('rp:') ? tid.slice(3) : String(tid);
    let flags = 0;
    if (p.alive) flags |= M.FLAG.alive;
    if (p.alive && p.attacking && w._wasFiring) flags |= M.FLAG.fire;
    if (this.pvp) flags |= M.FLAG.pvp;
    if (me.zone) flags |= M.FLAG.zone;
    if (w.docked) flags |= M.FLAG.docked;
    const pk = M.packState({
      x: p.x, z: p.z, rot: p.rot, crs: typeof p.course === 'number' ? p.course : p.rot, spd: Math.hypot(p.vx || 0, p.vz || 0),
      hull: p.hpMax ? p.hp / p.hpMax : 1, shield: p.shieldMax ? p.shield / p.shieldMax : 0, flags, tgt,
    });
    if (!M.stateChanged(pk, this._lastPack) && t - this._lastSentAt < M.KEEPALIVE) return;
    this._lastPack = pk; this._lastSentAt = t;
    this._send(this.secCh, 's', { i: this.sid, t: Math.round(performance.now() / 10), d: pk });
  }

  _me(t) {
    const w = this.world, p = w.player;
    const zone = M.zoneOk({
      sectorIndex: w.sector && w.sector.index, safe: w.inSafeZone, docked: w.docked, alive: p.alive,
      protectedNow: t - this.arriveAt < M.PVP_ARRIVE || w.time < (w._invulnUntil || 0),
    });
    const m = this._meObj || (this._meObj = { pvp: false, fac: '', zone: false, coop: '' });
    m.pvp = this.pvp; m.fac = w.profile.faction; m.zone = zone; m.coop = w.coop ? w.coop.code : '';
    return m;
  }

  /** Ist R mein Koop-Partner (gleicher Koop-Code laut Presence oder per Einladung verbunden, Schiff als 'ally' da)? */
  _isPartner(R) {
    const w = this.world, c = w.coop;
    if (!c || !R.meta) return false;
    return (R.meta.cp === c.code || (R.sid === this.coopSid && !!w.entities.get('ally')));
  }

  _updateRemote(R, t, dt, me) {
    const w = this.world;
    const hide = !R.meta || !R.st || t - R.lastRecv > M.STALE || this._isPartner(R) || (R.st.flags & M.FLAG.docked) || R.hold > 0;
    if (R.hold > 0) R.hold--;
    if (hide) { this._dropEnt(R); return; }
    const s = R.ip.sample(t, this._samp);
    if (!s) return;
    let e = R.ent;
    if (!e) {
      e = R.ent = {
        id: 'rp:' + R.sid, kind: 'player', type: 'remote', remote: true, sid: R.sid, name: R.meta.cs, faction: R.meta.fac, ship: R.meta.ship,
        loadout: { lasers: R.meta.lo.lasers.slice(), gens: R.meta.lo.gens.slice() }, level: R.meta.lv, radius: PLAYER_RADIUS,
        x: s.x, z: s.z, px: s.x, pz: s.z, rot: s.rot, prot: s.rot, vx: 0, vz: 0, speed: 0, turnRate: 0,
        alive: true, hp: R.meta.hm, hpMax: R.meta.hm, shield: 0, shieldMax: R.meta.sm, targetId: null, attacking: false, pvpOk: false, mapColor: '#9fe8ff',
      };
      R.sig = metaSig(R.meta);
    }
    if (w.entities.get(e.id) !== e) w.entities.set(e.id, e); // nach Sektoraufbau (entities.clear) wieder eintragen
    const dr = M.wrapAngle(s.rot - e.rot);
    e.turnRate = dt > 0 ? e.turnRate + ((dr / dt) - e.turnRate) * Math.min(1, dt * 8) : e.turnRate;
    e.x = e.px = s.x; e.z = e.pz = s.z; e.rot = e.prot = s.rot;
    e.vx = s.vx; e.vz = s.vz; e.speed = s.spd;
    const st = R.st;
    const wasAlive = e.alive;
    e.alive = !!(st.flags & M.FLAG.alive);
    // fremdes Schiff zerstört: Explosion wie beim eigenen Schiff (Ansicht bleibt, erscheint nach der Reparatur wieder)
    if (wasAlive && !e.alive && w.entities.get(e.id) === e) this.bus.emit('explode', { id: e.id, x: e.x, z: e.z, size: 2, kind: 'player' });
    e.hpMax = R.meta.hm; e.shieldMax = R.meta.sm;
    e.hp = Math.round(st.hull * e.hpMax); e.shield = Math.round(st.shield * e.shieldMax);
    e.level = R.meta.lv; e.name = R.meta.cs;
    const o = R.o || (R.o = { pvp: false, fac: '', zone: false, coop: '' });
    o.pvp = !!(st.flags & M.FLAG.pvp); o.fac = R.meta.fac; o.zone = !!(st.flags & M.FLAG.zone); o.coop = R.meta.cp;
    const was = e.pvpOk;
    e.pvpOk = e.alive && M.canAttack(me, o);
    if (was && !e.pvpOk && w.player.targetId === e.id) w.player.attacking = false;
    e.mapColor = e.pvpOk ? '#ff4a3a' : R.meta.fac === w.profile.faction ? '#f2f2f2' : '#9fe8ff';
    // Ziel und Feuern (nur Darstellung): Ziel bin ich, ein anderer fremder Spieler oder ein Gegner in der Nähe
    const tg = st.tgt;
    let to = null;
    if (tg) {
      if (tg === this.sid) to = 'player';
      else if (M.validSid(tg)) { const O = this.remotes.get(tg); if (O && O.ent && w.entities.get(O.ent.id) === O.ent) to = O.ent.id; }
      else { const en = w.entities.get(tg); if (en && en.kind === 'enemy' && en.alive && Math.hypot(en.x - e.x, en.z - e.z) < VIS_RANGE) to = tg; }
    }
    e.targetId = to;
    const firing = e.alive && !!(st.flags & M.FLAG.fire) && to;
    e.attacking = !!firing;
    if (firing) {
      const L = e.loadout.lasers, n = Math.max(1, Math.min(L.length, 6));
      R.fireAcc = (R.fireAcc || 0) + dt;
      const iv = LASER_INTERVAL / n;
      if (R.fireAcc >= iv) {
        R.fireAcc = R.fireAcc % iv;
        const tgE = to === 'player' ? w.player : w.entities.get(to);
        if (tgE) {
          let dx = tgE.x - e.x, dz = tgE.z - e.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d < 1400) {
            dx /= d; dz /= d;
            const idx = (R.shot = ((R.shot || 0) + 1) % n);
            this.bus.emit('shot', { from: e.id, to, laser: L[idx] || 'pulse', ammo: 'L1', hit: Math.random() < 0.75, idx, dx, dz, remote: true });
          }
        }
      }
    } else R.fireAcc = 0;
  }

  _dropEnt(R) {
    if (!R.ent) return;
    const w = this.world, id = R.ent.id;
    if (w.entities.get(id) === R.ent) w.entities.delete(id);
    if (w.player.targetId === id) w.setTarget(null);
    this.bus.emit('despawn', { id });
    R.ent = null;
  }

  // ───────────────────────── Kanäle ─────────────────────────

  _send(ch, event, payload) {
    if (!ch || ch.state !== 'joined') return false;
    try { ch.send({ type: 'broadcast', event, payload }); return true; } catch { return false; }
  }

  _chatChannel(name, key) {
    const ch = sb().channel(name, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'c' }, ({ payload }) => this._onChat(payload, key));
    ch.subscribe();
    return ch;
  }

  /** soft: derselbe Sektor nach Verbindungsabbruch neu verbinden (Chatverlauf bleibt) */
  _joinSector(soft = false) {
    if (this.disposed) return;
    const key = M.sectorChannel(this.world.sector);
    this.arriveAt = nowS();
    if (!soft && key === this.secKey && this.secCh) { this._lastPack = null; return; } // gleicher Raum (z. B. Koop-Gast baut Sektor neu)
    if (!soft || key !== this.secKey) this._rejoinN = 0;
    this._rejoinT = 0;
    const old = this.secCh;
    this.secCh = null; this.secKey = key; this.secReady = false;
    for (const R of this.remotes.values()) this._dropEnt(R);
    this.remotes.clear();
    this.inv.clear(); this.outInv = null;
    if (!soft) { this.chat.sector.length = 0; this.unread.sector = 0; }
    this.status = 'verbinde';
    this._emit('roster'); if (!soft) this._emit('chat', { ch: 'sector', reset: true });
    this._chain = this._chain.then(async () => {
      if (old) await this._close(old, true);
      if (this.disposed || this.secKey !== key) return;
      const ch = sb().channel(key, { config: { broadcast: { self: false }, presence: { key: this.sid } } });
      const mine = (fn) => (arg) => { if (this.secCh === ch && !this.disposed) fn(arg); };
      ch.on('presence', { event: 'sync' }, mine(() => this._onSync(ch)));
      ch.on('presence', { event: 'leave' }, mine(({ key: k }) => this._remove(k)));
      ch.on('broadcast', { event: 's' }, mine(({ payload }) => this._onState(payload)));
      ch.on('broadcast', { event: 'bye' }, mine(({ payload }) => payload && this._park(payload.i)));
      ch.on('broadcast', { event: 'inv' }, mine(({ payload }) => this._onInvite(payload)));
      ch.on('broadcast', { event: 'inva' }, mine(({ payload }) => this._onInviteAnswer(payload)));
      ch.on('broadcast', { event: 'hit' }, mine(({ payload }) => this._onHit(payload)));
      ch.on('broadcast', { event: 'kill' }, mine(({ payload }) => this._onKill(payload)));
      ch.on('broadcast', { event: 'c' }, mine(({ payload }) => this._onChat(payload, 'sector')));
      this.secCh = ch;
      ch.subscribe((st) => {
        if (this.secCh !== ch) return;
        if (st === 'SUBSCRIBED') {
          this.secReady = true; this.status = 'verbunden'; this._lastPack = null; this._trackSig = '';
          this._track(true);
          this._emit('roster');
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          this.secReady = false; this.status = 'getrennt'; this._emit('roster');
          // Server hat den Kanal geschlossen (z. B. Ratengrenze): von selbst neu verbinden, mit wachsender Pause.
          // Fehler und Zeitüberschreitung versucht realtime-js selbst erneut.
          if (st === 'CLOSED' && !this._rejoinT) {
            const d = M.REJOIN[Math.min(this._rejoinN, M.REJOIN.length - 1)];
            this._rejoinN++; this._rejoinT = nowS() + d;
          }
        }
      });
    }).catch((err) => console.warn('Mehrspieler: Sektorkanal', err));
  }

  async _close(ch, bye) {
    // Kein untrack: Verlassen des Kanals entfernt die Presence ohnehin (spart Presence-Budget).
    if (bye && ch.state === 'joined') this._send(ch, 'bye', { i: this.sid });
    // Vom Server geschlossene Kanäle hat realtime-js schon ausgetragen. Nicht erneut entfernen: das Austragen geht
    // nach Thema und träfe sonst einen neuen Kanal gleichen Namens.
    if (ch.state === 'closed') return;
    try { await sb().removeChannel(ch); } catch { /* egal */ }
  }

  _meta() {
    const w = this.world, pr = w.profile, p = w.player;
    return {
      cs: pr.callsign, fac: pr.faction, ship: pr.ship, lv: pr.level || 1, cp: w.coop ? w.coop.code : '',
      hm: Math.round(p.hpMax || 1), sm: Math.round(p.shieldMax || 0),
      lo: { lasers: (pr.loadout.lasers || []).slice(0, 10), gens: (pr.loadout.gens || []).slice(0, 12) },
    };
  }
  _track(force) {
    if (!this.secReady || !this.secCh) return;
    const m = this._meta(), sig = JSON.stringify(m), t = nowS();
    if (sig === this._trackSig) return;
    if (!force && t - this._trackAt < TRACK_MIN) return;
    if (this.pres.take(t) > 0) return; // Budget erschöpft: das Sekundenraster versucht es später erneut
    this._trackSig = sig; this._trackAt = t;
    this.secCh.track(m).catch(() => { this._trackSig = ''; });
  }

  _visibility() {
    if (this.disposed) return;
    if (document.hidden) {
      // Tab verlassen: 'bye' (die anderen nehmen das Schiff sofort heraus und parken den Eintrag), kein Senden mehr.
      // Presence bleibt bestehen (untrack/track bei jedem Tab-Wechsel sprengte die Presence-Grenze von Supabase).
      this.away = true;
      if (this.secReady) this._send(this.secCh, 'bye', { i: this.sid });
    } else {
      // zurück: nächster Zustand geht sofort raus und holt das Schiff bei den anderen zurück
      this.away = false; this._lastPack = null; this.arriveAt = nowS();
      this._track(false);
    }
  }

  // ───────────────────────── Empfang ─────────────────────────

  _remote(sid) {
    if (!M.validSid(sid) || sid === this.sid) return null;
    let R = this.remotes.get(sid);
    if (!R) {
      if (this.remotes.size >= 40) return null; // Schutz: mehr fremde Schiffe zeigt ein Sektor nicht
      R = { sid, meta: null, st: null, ip: new M.Interp(), lastRecv: -1e9, ent: null, hold: 0, chat: new M.RateLimit(6, 8, 0.25), hits: new M.RateLimit(40, 2, 0) };
      this.remotes.set(sid, R);
    }
    return R;
  }
  _remove(sid) {
    const R = this.remotes.get(sid);
    if (!R) return;
    this._dropEnt(R);
    this.remotes.delete(sid);
    this.inv.delete(sid);
    if (this.outInv && this.outInv.to === sid) this.outInv = null;
    this._emit('roster');
  }

  /** Pilot hat 'bye' gesendet (Tab im Hintergrund oder vor dem Verlassen): Schiff weg, Eintrag bleibt bis Presence-leave */
  _park(sid) {
    const R = this.remotes.get(sid);
    if (!R) return;
    this._dropEnt(R);
    R.parked = true; R.st = null; R.ip = new M.Interp(); R.lastRecv = -1e9;
    this.inv.delete(sid);
    if (this.outInv && this.outInv.to === sid) this.outInv = null;
    this._emit('roster');
  }

  _onSync(ch) {
    const state = ch.presenceState();
    const seen = new Set();
    for (const k in state) {
      if (k === this.sid) continue;
      const list = state[k];
      const meta = cleanMeta(list && list[list.length - 1]);
      if (!meta) continue;
      const R = this._remote(k);
      if (!R) continue;
      seen.add(k);
      if (R.meta && R.ent && metaSig(meta) !== R.sig) { this._dropEnt(R); R.hold = 2; } // anderes Schiff: Ansicht neu bauen
      R.meta = meta;
    }
    for (const k of [...this.remotes.keys()]) if (!seen.has(k)) this._remove(k);
    this._emit('roster');
  }

  _onState(m) {
    if (!m || this.away) return;
    const R = this._remote(m.i);
    if (!R) return;
    const s = M.unpackState(m.d);
    if (!s || typeof m.t !== 'number') return;
    const t = nowS();
    if (!R.ip.push(m.t / 100, s, t)) return;
    R.st = s; R.lastRecv = t;
    if (R.parked) { R.parked = false; this._emit('roster'); }
  }

  _onChat(m, ch) {
    if (!m || typeof m.m !== 'string' || !M.validSid(m.i) || m.i === this.sid) return;
    const cs = M.cleanName(m.cs);
    if (this.isMuted(cs)) return;
    if (ch === 'faction' && m.fac !== this.world.profile.faction) return; // Kanalnamen sind öffentlich: nur die eigene Fraktion
    // Flut-Schutz je Absender (auch Kanäle ohne Präsenz: eigener Zähler je Kennung)
    const lim = this._chatLim || (this._chatLim = new Map());
    let L = lim.get(m.i);
    if (!L) { if (lim.size > 200) lim.clear(); L = new M.RateLimit(6, 8, 0.25); lim.set(m.i, L); }
    if (L.take(nowS()) > 0) return;
    const text = M.filterWords(M.cleanText(m.m));
    if (!text) return;
    this._addChat(ch, { id: typeof m.n === 'string' ? m.n.slice(0, 24) : '', sid: m.i, cs, fac: FACTIONS[m.fac] ? m.fac : null, text, self: false });
  }

  _addChat(ch, msg) {
    const list = this.chat[ch];
    msg.ch = ch; msg.t = Date.now();
    list.push(msg);
    if (list.length > M.CHAT_KEEP) list.shift();
    if (!msg.self) this.unread[ch]++;
    this._emit('chat', { ch, msg });
  }
  _sys(text, ch = 'sector') { this._addChat(ch, { id: '', sid: '', cs: 'SYSTEM', fac: null, text, self: false, sys: true }); }

  _onInvite(m) {
    if (!m || m.to !== this.sid || !M.validSid(m.i)) return;
    const R = this.remotes.get(m.i);
    const cs = M.cleanName(m.cs);
    if (!R || this.isMuted(cs) || typeof m.code !== 'string' || !/^\d{4}$/.test(m.code) || !FACTIONS[m.fac]) return;
    if (this.world.coop) { this._send(this.secCh, 'inva', { i: this.sid, to: m.i, code: m.code, ok: 0, busy: 1 }); return; }
    this.inv.set(m.i, { code: m.code, cs, fac: m.fac, sec: typeof m.sec === 'string' ? m.sec.slice(0, 12) : '', t: nowS() });
    this._sys(`${cs} lädt dich ein: zu zweit fliegen. Annehmen in der Spielerliste.`, 'sector');
    this.bus.emit('message', { kind: 'radio', from: 'KOOP', title: 'EINLADUNG', text: `EINLADUNG: ${cs} möchte mit dir zu zweit fliegen. Spielerliste öffnen und annehmen.` });
    this._emit('roster');
  }
  _onInviteAnswer(m) {
    if (!m || m.to !== this.sid || !this.outInv || m.i !== this.outInv.to || m.code !== this.outInv.code) return;
    const R = this.remotes.get(m.i), cs = R && R.meta ? R.meta.cs : 'Pilot';
    const code = this.outInv.code;
    this.outInv = null;
    if (m.ok === 1) {
      if (this.world.coop) return;
      this._sys(`${cs} hat angenommen. Koop-Raum ${code} offen, du bist Gastgeber.`, 'sector');
      this._startCoop({ role: 'host', code }, m.i);
    } else this._sys(m.busy ? `${cs} fliegt schon im Koop.` : `${cs} hat die Einladung abgelehnt.`, 'sector');
    this._emit('roster');
  }

  _startCoop(cfg, sid) {
    const w = this.world;
    if (w.coop) w.coop.stop();
    this.coopSid = sid || null; this.coopAt = nowS(); this._noAlly = 0;
    // Gast einer anderen Fraktion: Sektoren des Gastgebers übernehmen (wie Koop aus dem Hub), Position behalten
    if (cfg.role === 'guest' && cfg.faction && cfg.faction !== w._homeFac && FACTIONS[cfg.faction]) {
      const secs = sectorsFor(cfg.faction);
      if (secs[cfg.sector]) {
        const p = w.player, x = p.x, z = p.z, rot = p.rot;
        w._homeFac = cfg.faction; w.sectors = secs;
        w._changeSector(cfg.sector, null);
        p.x = p.px = x; p.z = p.pz = z; p.rot = p.prot = rot;
        w._updateZones();
      }
    }
    new Coop(w, this.bus, cfg); // trägt sich als world.coop ein, main.js ruft update()
    this._trackAt = -1e9; this._track(true);
    this._emit('roster');
  }

  _onHit(m) {
    if (!m || m.to !== this.sid || this.away) return;
    const R = this.remotes.get(m.i);
    const w = this.world, p = w.player;
    if (!R || !R.meta || !R.st || !R.ent) return;
    const t = nowS();
    // Opfer entscheidet: beide PvP an, andere Fraktion, beide außerhalb geschützter Bereiche, Entfernung plausibel
    if (!R.ent.pvpOk || !this.pvp) return;
    if (Math.hypot(R.ent.x - p.x, R.ent.z - p.z) > M.PVP_HIT_RANGE) return;
    if (R.hits.take(t) > 0) return;
    const d = M.clampHit(m.d);
    if (!d) return;
    const dx = p.x - R.ent.x, dz = p.z - R.ent.z, dl = Math.hypot(dx, dz) || 1;
    const res = w.pvpDamage(d, m.s === 1, R.ent.id, dx / dl, dz / dl);
    if (!res) return;
    this.lastAttacker = { sid: R.sid, t };
    if (res === 'dead') {
      this._send(this.secCh, 'kill', { i: this.sid, by: R.sid, lv: w.profile.level || 1, cs: this.callsign, bcs: R.meta.cs });
      this._sys(`${R.meta.cs} hat dich abgeschossen.`, 'sector');
    }
  }

  _onKill(m) {
    if (!m || !M.validSid(m.i) || !M.validSid(m.by)) return;
    const V = this.remotes.get(m.i);
    if (!V || !V.meta) return;
    const vcs = V.meta.cs;
    if (m.by !== this.sid) {
      const A = this.remotes.get(m.by);
      this._sys(`${A && A.meta ? A.meta.cs : 'Ein Pilot'} hat ${vcs} abgeschossen.`, 'sector');
      return;
    }
    const t = nowS(), last = this.hitOn.get(m.i);
    if (last == null || t - last > M.PVP_CREDIT) return; // ohne eigenen Treffer kein Abschuss
    this.hitOn.delete(m.i);
    const w = this.world, pr = w.profile;
    pr.stats.pvpKills = (pr.stats.pvpKills || 0) + 1;
    const k = vcs.toLowerCase(), prev = this.honorAt.get(k);
    if (prev != null && t - prev < M.PVP_REPEAT) {
      w._msg(`${vcs} abgeschossen. Keine Ehre: denselben Piloten erst nach 5 Minuten wieder.`, 'info');
      this._sys(`Du hast ${vcs} abgeschossen.`, 'sector');
      return;
    }
    this.honorAt.set(k, t);
    const h = M.pvpHonor(V.meta.lv, pr.level || 1);
    const x = V.ent ? V.ent.x : w.player.x, z = V.ent ? V.ent.z : w.player.z;
    w.grantReward({ honor: h }, x, z, `${vcs} zerstört: +${h} Ehre (PvP).`);
    this._sys(`Du hast ${vcs} abgeschossen: +${h} Ehre.`, 'sector');
  }

  _emit(type, extra) { this.bus.emit('mp', Object.assign({ type }, extra || {})); }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._offSector(); this._offDead();
    document.removeEventListener('visibilitychange', this._onVis);
    window.removeEventListener('pagehide', this._onHide);
    for (const R of this.remotes.values()) this._dropEnt(R);
    this.remotes.clear();
    const chs = [this.secCh, this.facCh, this.allCh].filter(Boolean);
    this.secCh = null; this.secReady = false;
    const sec = chs[0] && chs[0] !== this.facCh && chs[0] !== this.allCh ? chs[0] : null;
    this._chain = this._chain.then(() => Promise.all(chs.map((c) => this._close(c, c === sec)))).catch(() => {});
    if (this.world.mp === this) this.world.mp = null;
  }
}
