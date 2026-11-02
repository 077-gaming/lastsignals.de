// Koop zu zweit (Übergangslösung, 31.10.2026): Gastgeber-Prinzip über Supabase Realtime (Broadcast, keine Datenbank).
// Gastgeber: rechnet die Welt wie im Solo-Spiel; sendet 8×/s sein Schiff und alle Gegner (Ort, Leben, Schild, lebt).
// Gast: eigene Welt im selben Sektor (Sektoren des Gastgebers), Gegner werden auf den Stand des Gastgebers gesetzt.
//   Seine Treffer gehen als 'hit' zum Gastgeber (der rechnet den Schaden), Abschüsse, an denen er beteiligt war,
//   bringen ihm Erfahrung, Credits und Auftragsfortschritt im eigenen Spielstand. Gegner in seiner Nähe greifen ihn an.
// Beide sehen das andere Schiff (Entity 'ally', wird wie ein Spielerschiff gezeichnet).
// Grenzen: Ereignisse, Kisten und Erz sind je Spieler getrennt; Gegner auf der Seite des Gastgebers zielen nur auf ihn.
import { createClient } from '@supabase/supabase-js';
import { VARIANTS } from '../core/data.js';

const URL = 'https://ydvtdxvnkmjbdwxsriuv.supabase.co';
const KEY = 'sb_publishable_7bAvG-sHZiTgXmMI_-Oqgg_gMFC5Pnc'; // öffentlicher Schlüssel (wie auf der Website)
const RATE = 1 / 8;
const CREDIT = 20; // so lange nach dem letzten eigenen Treffer zählt ein Abschuss für den Gast (s)
let client = null;
/** Gemeinsamer Supabase-Client (eine Websocket-Verbindung für Koop und Mehrspieler, nur Realtime). */
export const sb = () => client || (client = createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 30 } } }));

export const newCode = () => String(1000 + Math.floor(Math.random() * 9000));

/** Lobby (Hub): als Gast auf das Hallo des Gastgebers warten → { sector, faction, callsign } oder null nach timeout ms. */
export function waitForHost(code, timeout = 15000) {
  return new Promise((resolve) => {
    const ch = sb().channel('ls-coop-' + code, { config: { broadcast: { self: false } } });
    const done = (v) => { clearTimeout(t); sb().removeChannel(ch); resolve(v); };
    const t = setTimeout(() => done(null), timeout);
    ch.on('broadcast', { event: 'snap' }, ({ payload }) => { if (payload && payload.h) done({ sector: payload.h.sec, faction: payload.h.fac, callsign: payload.h.cs }); });
    ch.subscribe();
  });
}

export class Coop {
  constructor(world, bus, cfg) {
    this.world = world; this.bus = bus;
    this.guest = cfg.role === 'guest'; this.host = !this.guest;
    this.code = cfg.code;
    this.applying = false;
    this.acc = 0; this.lastSeen = 0; this.myHits = new Map(); this.ally = null; this.warned = false;
    this.pending = [];
    world.coop = this;
    this.ch = sb().channel('ls-coop-' + this.code, { config: { broadcast: { self: false } } });
    this.ch.on('broadcast', { event: 'snap' }, ({ payload }) => this.guest && this._onSnap(payload));
    this.ch.on('broadcast', { event: 'g' }, ({ payload }) => this.host && this._onGuest(payload));
    this.ch.on('broadcast', { event: 'hit' }, ({ payload }) => this.host && this._onHit(payload));
    this.ch.on('broadcast', { event: 'bye' }, () => this._onBye());
    this.ch.subscribe((s) => { if (s === 'SUBSCRIBED') this._msg(this.host ? `Koop-Raum ${this.code} offen. Gib deinem Mitspieler den Code ${this.code}.` : `Koop: verbunden mit Raum ${this.code}.`); });
  }

  _msg(text) { this.bus.emit('message', { kind: 'radio', from: 'KOOP', title: 'KOOP', text: `KOOP: ${text}` }); }
  _send(event, payload) { if (this.ch.state !== 'joined') return; try { this.ch.send({ type: 'broadcast', event, payload }); } catch { /* Verbindung kurz weg */ } }

  /** jedes Bild vom Spiel aufgerufen */
  update(dt) {
    const w = this.world, p = w.player;
    this.acc += dt;
    if (this.ally && w.time - this.lastSeen > 6) { w.entities.delete('ally'); this.ally = null; this._msg('Mitspieler getrennt (keine Daten seit 6 s).'); }
    if (this.acc < RATE) return;
    this.acc = 0;
    const me = { x: Math.round(p.x), z: Math.round(p.z), r: +p.rot.toFixed(2), alive: p.alive, ship: w.profile.ship, fac: w.profile.faction, cs: w.profile.callsign, sec: w.sector.id, lo: w.profile.loadout };
    if (this.guest) { this._send('g', me); return; }
    const E = [];
    for (const e of w.enemies) E.push([e.id, Math.round(e.x), Math.round(e.z), +(e.rot || 0).toFixed(2), Math.round(e.hp), Math.round(e.shield), e.alive ? 1 : 0, e.rank === 'normal' ? 0 : e.rank === 'elite' ? 1 : 2]);
    me.h = 1;
    this._send('snap', { h: me, e: E });
  }

  // ── Gastgeber ──
  _onGuest(g) {
    const w = this.world;
    if (g.sec !== w.sector.id) { if (this.ally) { w.entities.delete('ally'); this.ally = null; } return; }
    this.lastSeen = w.time;
    if (!this.ally) {
      this.ally = { id: 'ally', kind: 'player', type: 'ally', name: g.cs, faction: g.fac, ship: g.ship, loadout: g.lo, x: g.x, z: g.z, px: g.x, pz: g.z, rot: g.r, prot: g.r, radius: 24, alive: true, hp: 1, hpMax: 1, shield: 0, shieldMax: 0 };
      w.entities.set('ally', this.ally);
      this._msg(`${g.cs} fliegt mit dir.`);
    }
    const a = this.ally;
    a.px = a.x; a.pz = a.z; a.prot = a.rot; a.x = g.x; a.z = g.z; a.rot = g.r; a.alive = g.alive !== false;
  }
  _onHit(h) {
    const w = this.world, e = w.entities.get(h.id);
    if (!e || !e.alive || e.kind !== 'enemy' || !(h.d > 0) || h.d > 50000) return;
    w._hitFrom = 'ally';
    w._hitEnemy(e, h.d, !!h.s, false, 0, 0, e.x, e.z);
    w._hitFrom = null;
    w._provoke(e);
  }

  // ── Gast ──
  hit(e, dmg, shieldOnly) {
    this.myHits.set(e.id, this.world.time);
    this._send('hit', { id: e.id, d: Math.round(dmg), s: shieldOnly ? 1 : 0 });
  }
  _onSnap(s) {
    const w = this.world, h = s.h;
    this.lastSeen = w.time;
    if (h.sec !== w.sector.id && w.sectors[h.sec]) { w._changeSector(h.sec, null); this._msg('Folge dem Gastgeber in einen anderen Sektor.'); return; }
    // Schiff des Gastgebers
    if (!this.ally) { this.ally = { id: 'ally', kind: 'player', type: 'ally', name: h.cs, faction: h.fac, ship: h.ship, loadout: h.lo, radius: 24, alive: true, x: h.x, z: h.z, px: h.x, pz: h.z, rot: h.r, prot: h.r, hp: 1, hpMax: 1, shield: 0, shieldMax: 0 }; w.entities.set('ally', this.ally); this._msg(`Mit ${h.cs} im Sektor.`); }
    const a = this.ally; a.px = a.x; a.pz = a.z; a.prot = a.rot; a.x = h.x; a.z = h.z; a.rot = h.r; a.alive = h.alive !== false;
    // Gegner auf den Stand des Gastgebers
    const byId = this._byId || (this._byId = new Map(w.enemies.map((e) => [e.id, e])));
    this.applying = true;
    for (const row of s.e) {
      const e = byId.get(row[0]);
      if (!e) continue;
      const alive = row[6] === 1;
      if (alive) {
        if (!e.alive) w._revive(e);
        const rank = row[7] === 2 ? 'alpha' : row[7] === 1 ? 'elite' : 'normal';
        if (e.rank !== rank) { e.rank = rank; e.lootMult = rank === 'normal' ? 1 : VARIANTS[rank].mult; }
        e.px = e.x; e.pz = e.z; e.prot = e.rot;
        e.x = row[1]; e.z = row[2]; e.rot = row[3];
        e.hp = row[4]; e.shield = row[5];
        e.respawnAt = Infinity;
      } else if (e.alive) {
        const t = this.myHits.get(e.id);
        if (t != null && w.time - t < CREDIT) { this.myHits.delete(e.id); w._killEnemy(e); } // Belohnung im eigenen Spielstand
        else { e.alive = false; w.entities.delete(e.id); w.bus.emit('despawn', { id: e.id }); if (w.player.targetId === e.id) w.setTarget(null); }
        e.respawnAt = Infinity; // wiederbeleben nur nach Gastgeber-Stand
      }
    }
    this.applying = false;
  }

  // Mitspieler hat den Koop beendet (Flug beendet, Koop verlassen): sofort aufräumen statt 6 s zu warten
  _onBye() {
    if (this.ally) { this.world.entities.delete('ally'); this.bus.emit('despawn', { id: 'ally' }); this.ally = null; this._msg('Mitspieler hat den Koop verlassen.'); }
  }

  stop() {
    this._send('bye', {});
    const ch = this.ch;
    // kurz warten, damit das Abschiedssignal noch rausgeht
    setTimeout(() => { try { sb().removeChannel(ch); } catch { /* egal */ } }, 150);
    if (this.world.coop === this) this.world.coop = null;
    if (this.world.entities.get('ally')) { this.world.entities.delete('ally'); this.bus.emit('despawn', { id: 'ally' }); }
    this.ally = null;
  }
}
