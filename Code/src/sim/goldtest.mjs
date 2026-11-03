// Goldwert-Test des Taktikwegs (Planung/FLUGMODELL.md, T-01): Ein fest geskripteter Klickflug (Kurs setzen, Ziel
// wählen, Angriff, Raketen, Beute, Sprung) läuft mit festem Samen in der Taktik-Simulation. Je Schritt werden Ort,
// Kurs, Tempo, Hülle und Schild des Spielers, je Sekunde alle Gegner (Ort, Leben, Zustand) und am Ende der
// Zufallszustand bitgenau in Prüfsummen gefaltet. Die Werte von vor dem 3D-Umbau stehen in gold-taktik.json;
// der Selbsttest verlangt Gleichheit Bit für Bit. Neue Werte schreiben (nur bei gewollter Änderung des Taktikwegs):
//   node src/sim/goldtest.mjs --schreiben
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!globalThis.localStorage) {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
}
const { World } = await import('./world.js');
const { newProfile } = await import('../core/data.js');

const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
class Fold {
  constructor() { this.a = 0x811c9dc5; this.b = 0x9e3779b9; this.n = 0; }
  num(v) {
    F64[0] = typeof v === 'number' ? v : (v ? 1 : 0);
    for (let i = 0; i < 2; i++) {
      this.a = Math.imul(this.a ^ U32[i], 0x01000193) >>> 0;
      this.b = Math.imul((this.b + U32[i]) ^ (this.b >>> 13), 0x5bd1e995) >>> 0;
    }
    this.n++;
  }
  str(s) { for (let i = 0; i < s.length; i++) this.num(s.charCodeAt(i)); }
  get hex() { return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0'); }
}

function bus() {
  const h = new Map();
  return { on(t, f) { if (!h.has(t)) h.set(t, new Set()); h.get(t).add(f); return () => h.get(t).delete(f); }, off(t, f) { h.get(t)?.delete(f); }, emit(t, p) { const s = h.get(t); if (s) for (const f of s) f(p); } };
}

/** Eigener Zufall des Skripts (nicht world.rng): LCG */
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

/** Ein Szenario rechnen → { player, enemies, events, rng, kills, steps } (Prüfsummen als Hex) */
export function runScenario(name, opts = {}) {
  const b = bus();
  const pr = newProfile('Goldpilot', opts.faction || 'europa');
  pr.created = '2026-11-03T00:00:00.000Z';
  pr.ammo.L1 = 200000; pr.ammo.R1 = 60;
  if (opts.level) pr.level = opts.level;
  if (opts.ship) { pr.owned.ships.push(opts.ship); pr.ship = opts.ship; pr.owned.lasers = Array(13).fill(opts.laser || 'ion'); pr.loadout.lasers = []; pr.loadout.gens = []; pr.owned.gens = Array(13).fill('sh1'); }
  const w = new World(pr, b, { seed: opts.seed || 777 });
  if (opts.ship) { w._switchShip(opts.ship); w._refreshStats(); w.player.hp = w.player.hpMax; w.player.shield = w.player.shieldMax; }
  if (opts.sector) w._changeSector(opts.sector, null);
  const P = new Fold(), E = new Fold(), V = new Fold();
  let kills = 0;
  b.on('explode', (e) => { if (e.kind === 'enemy') kills++; V.str('x' + e.id); });
  b.on('shot', (s) => { V.num(s.hit); V.num(s.x); V.num(s.z); });
  b.on('damage', (d) => { V.num(d.hull); V.num(d.shield); });
  b.on('loot', (l) => { V.num(l.credits); V.num(l.xp); });
  const R = lcg(opts.script || 99);
  const p = w.player;
  const steps = Math.round((opts.seconds || 120) * 60);
  for (let i = 0; i < steps; i++) {
    // Skript: alle 2 s neu entscheiden (wie ein Spieler mit der Maus)
    if (i % 120 === 0 && !w.jump) {
      if (w.playerDead) w.repair('station');
      let best = null, bd = Infinity;
      for (const e of w.enemies) { if (!e.alive) continue; const d = (e.x - p.x) ** 2 + (e.z - p.z) ** 2; if (d < bd) { bd = d; best = e; } }
      const phase = (i / 120) % 6;
      if (best && bd < 2400 * 2400 && phase < 4) {
        if (p.targetId !== best.id) w.setTarget(best.id);
        if (!p.attacking) w.toggleAttack();
        const a = R() * Math.PI * 2, r = 220 + R() * 260;
        w.moveTo(best.x + Math.cos(a) * r, best.z + Math.sin(a) * r);
        if (phase === 1) w.fireRocket();
      } else {
        const a = R() * Math.PI * 2, r = 600 + R() * 1800;
        w.moveTo(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      }
    }
    if (i === (steps >> 1) + 1 && opts.jump && w.portals.length) { const o = w.portals[0]; p.x = o.x + 40; p.z = o.z + 40; p.vx = p.vz = p.fs = 0; p.hasMove = false; w._updateZones(); w.tryJump(); }
    w._step(1 / 60);
    P.num(p.x); P.num(p.z); P.num(p.rot); P.num(p.vx); P.num(p.vz); P.num(p.fs); P.num(p.hp); P.num(p.shield); P.num(p.bank); P.num(p.pitch);
    if (i % 60 === 0) for (const e of w.enemies) { E.num(e.x); E.num(e.z); E.num(e.rot); E.num(e.hp); E.num(e.alive); E.str(e.state); }
  }
  return { name, player: P.hex, enemies: E.hex, events: V.hex, rng: w.rng.s >>> 0, kills, steps, sector: w.sector.id };
}

export const SCENARIOS = [
  ['heimat', { faction: 'europa', seed: 777, script: 99, seconds: 120, jump: true }],
  ['saturn-3', { faction: 'saturn', seed: 4242, script: 7, seconds: 90, level: 9, ship: 's3', laser: 'ion', sector: 'SA-3' }],
  ['eris-6', { faction: 'eris', seed: 31337, script: 13, seconds: 60, level: 22, ship: 's5', laser: 'plasma', sector: 'ER-6' }],
];

export function runAll() { return SCENARIOS.map(([n, o]) => runScenario(n, o)); }

const GOLD = new URL('./gold-taktik.json', import.meta.url);
export function readGold() { try { return JSON.parse(fs.readFileSync(GOLD, 'utf8')); } catch { return null; } }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = runAll();
  if (process.argv.includes('--schreiben')) { fs.writeFileSync(GOLD, JSON.stringify(res, null, 2) + '\n'); console.log('Goldwerte geschrieben:', fileURLToPath(GOLD)); }
  console.log(JSON.stringify(res, null, 2));
}
