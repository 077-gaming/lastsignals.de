// Tages- und Wochenaufträge neben der Auftragskette: drei Aufgaben je Tag, zwei je Woche (UTC), gewürfelt aus den
// Gegnern und Erzen der Sektoren, die zur Stufe des Piloten passen. Gleicher Tag = gleiche Aufgaben (fester Zufall).
// Stand in profile.contracts = { day, week, daily: [...], weekly: [...] }, jede Aufgabe { id, kind, target, count, progress, done }.
import { ENEMIES, ORES, sectorsFor, FACTIONS } from '../core/data.js';

const fmt = (n) => Math.round(n).toLocaleString('de-DE');

export function dayKey(d) { return d.toISOString().slice(0, 10); }
export function weekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = Date.UTC(t.getUTCFullYear(), 0, 1);
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, '0')}`;
}

function rngFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

/** Höchster Sektor, dessen Mindeststufe der Pilot erreicht hat (1–8) */
export function tierFor(profile) {
  const secs = Object.values(sectorsFor(FACTIONS[profile.faction] ? profile.faction : 'europa'));
  let t = 1;
  for (const s of secs) if ((profile.level || 1) >= s.levelMin) t = Math.max(t, s.index);
  return t;
}

/** Aufgaben für einen Schlüssel (Tag oder Woche) würfeln */
export function rollContracts(profile, key, weekly) {
  const r = rngFrom(`${key}|${profile.callsign || ''}|${weekly ? 'w' : 'd'}`);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const tier = tierFor(profile);
  const secs = Object.values(sectorsFor(FACTIONS[profile.faction] ? profile.faction : 'europa')).filter((s) => s.index <= tier && s.index >= Math.max(1, tier - 2));
  const types = [...new Set(secs.flatMap((s) => s.spawns.map((x) => x.type)))].filter((t) => ENEMIES[t] && !ENEMIES[t].boss && !ENEMIES[t].eventOnly && ENEMIES[t].level <= (profile.level || 1) + 3);
  const ores = [...new Set(secs.flatMap((s) => Object.keys(s.ore || {})))].filter((o) => ORES[o]);
  const k = weekly ? 6 : 1;
  const list = [];
  const t1 = pick(types.length ? types : ['raider']);
  list.push({ kind: 'kill', target: t1, count: Math.round((weekly ? 60 : 12) * (ENEMIES[t1].pack ? 1.4 : 1)) });
  list.push({ kind: 'kill', target: null, count: weekly ? 200 : 30 });
  if (!weekly) list.push(r() < 0.5 && ores.length ? { kind: 'ore', target: pick(ores), count: 25 } : { kind: 'crate', target: null, count: 6 });
  return list.map((c, i) => ({
    ...c, id: `${weekly ? 'w' : 'd'}${i}`, progress: 0, done: false,
    reward: { credits: 3000 * tier * k, xp: 4000 * tier * k, honor: 15 * tier * k, tritium: weekly ? 40 * tier : 0 },
  }));
}

export function contractTitle(c) {
  if (c.kind === 'kill') return c.target ? `${fmt(c.count)} × ${ENEMIES[c.target]?.name || c.target} zerstören` : `${fmt(c.count)} Gegner zerstören`;
  if (c.kind === 'ore') return `${fmt(c.count)} ${ORES[c.target]?.name || c.target} sammeln`;
  return `${fmt(c.count)} Frachtkisten öffnen`;
}

export class Contracts {
  constructor(world, bus, now = () => new Date()) {
    this.world = world;
    this.bus = bus;
    this.now = now;
    this._t = 0;
    this.refresh();
    const qp = world._questProgress.bind(world);
    world._questProgress = (t, target, n, ctx) => { qp(t, target, n, ctx); this.count(t, target, n || 1); };
  }

  get state() { return this.world.profile.contracts; }

  /** Neuer Tag bzw. neue Woche: Aufgaben neu würfeln (Fortschritt der alten verfällt) */
  refresh() {
    const pr = this.world.profile, d = this.now();
    if (!pr.contracts || typeof pr.contracts !== 'object') pr.contracts = {};
    const s = pr.contracts, dk = dayKey(d), wk = weekKey(d);
    let changed = false;
    if (s.day !== dk || !Array.isArray(s.daily)) { s.day = dk; s.daily = rollContracts(pr, dk, false); changed = true; }
    if (s.week !== wk || !Array.isArray(s.weekly)) { s.week = wk; s.weekly = rollContracts(pr, wk, true); changed = true; }
    if (changed) this.bus.emit('contracts', { kind: 'new' });
  }

  update(dt) { this._t += dt; if (this._t >= 60) { this._t = 0; this.refresh(); } }

  count(type, target, n) {
    const kind = type === 'kill' ? 'kill' : type === 'ore' ? 'ore' : type === 'crate' ? 'crate' : null;
    if (!kind) return;
    const s = this.state;
    for (const c of [...(s.daily || []), ...(s.weekly || [])]) {
      if (c.done || c.kind !== kind || (c.target && c.target !== target)) continue;
      c.progress = Math.min(c.count, c.progress + n);
      if (c.progress >= c.count) this._complete(c);
    }
  }

  _complete(c) {
    const w = this.world, pr = w.profile, r = c.reward || {};
    c.done = true;
    const parts = [];
    if (r.credits) { pr.credits += r.credits; parts.push(`${fmt(r.credits)} Credits`); }
    if (r.tritium) { pr.tritium += r.tritium; parts.push(`${fmt(r.tritium)} Tritium`); }
    if (r.honor) { pr.honor += r.honor; parts.push(`${fmt(r.honor)} Ehre`); }
    if (r.xp) { parts.push(`${fmt(r.xp)} Erfahrung`); w._addXp?.(r.xp); }
    w._msg?.(`${c.id[0] === 'w' ? 'Wochenauftrag' : 'Tagesauftrag'} erledigt: ${contractTitle(c)}. ${parts.join(', ')}.`, 'quest');
    w._emitProfile?.();
    w.save?.();
    this.bus.emit('contracts', { kind: 'done', contract: c });
  }
}
