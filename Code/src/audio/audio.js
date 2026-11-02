// Ton im Flug: Effekte aus public/audio/sfx (ElevenLabs), räumlich nach Position auf dem Bildschirm,
// Triebwerk als Schleife nach Schub, Musik wechselt weich zwischen Ruhe, Kampf und Stille.
import { ENEMIES } from '../core/data.js';
// Lautstärken aus localStorage 'ls.settings' (master, sfx, music jeweils 0..1).

const SFX = [
  'laser_pulse', 'laser_ion', 'laser_plasma', 'laser_gamma', 'salvo', 'shield_drain', 'rocket_launch', 'rocket_hit',
  'hit_shield', 'hit_hull', 'explosion_small', 'explosion_big', 'engine_loop', 'boost', 'jump_charge', 'jump_warp',
  'dock', 'loot', 'levelup', 'alarm', 'ui_click', 'ui_open', 'radio', 'alien_death',
];
// Musik je Stimmung als Mischliste (alle ElevenLabs, Vault „LAST SIGNALS - Audio und Lizenzen“). Innerhalb einer
// Stimmung folgt kurz vor Stückende ein anderes Stück (keine direkte Wiederholung, Überblendung).
const MUSIC = {
  calm: ['home_calm', 'explore_2'], combat: ['combat'], boss: ['boss'], silence: ['silence'], hub: ['hub', 'title'],
};
// Heimatmusik je Fraktion (Sektorkennung EU/SA/ER), mischt sich in allen Sektoren der Fraktion unter die Ruhe-Stücke
const HOME_TRACK = { EU: 'europa', SA: 'saturn', ER: 'eris' };
const MUSIC_LEVEL = { calm: 0.55, combat: 0.7, boss: 0.75, silence: 0.55, hub: 0.5 };
const MUSIC_FADE = 3;          // Sekunden Überblendung beim Stückwechsel
const MUSIC_RESUME_MS = 90000; // so lange nach dem Ausblenden geht ein Stück an der alten Stelle weiter
const LASER_SOUND = { pulse: 'laser_pulse', ion: 'laser_ion', plasma: 'laser_plasma', gamma: 'laser_gamma' };

// Grundlautstärke je Effekt, damit das Gesamtbild stimmt (Laser leiser als Explosionen).
const LEVEL = {
  laser_pulse: 0.32, laser_ion: 0.34, laser_plasma: 0.4, laser_gamma: 0.48, salvo: 0.6, shield_drain: 0.4,
  rocket_launch: 0.45, rocket_hit: 0.6, hit_shield: 0.28, hit_hull: 0.3, explosion_small: 0.55, explosion_big: 0.8,
  engine_loop: 0.22, boost: 0.4, jump_charge: 0.5, jump_warp: 0.7, dock: 0.5, loot: 0.35, levelup: 0.6,
  alarm: 0.35, ui_click: 0.25, ui_open: 0.3, radio: 0.3, alien_death: 0.6,
};

function settings() {
  try { return { master: 0.8, sfx: 0.9, music: 0.5, ...JSON.parse(localStorage.getItem('ls.settings') || '{}') }; }
  catch { return { master: 0.8, sfx: 0.9, music: 0.5 }; }
}

// ───────────── Hub/Menü: Musik und Klicks (ohne Flug-AudioSystem) ─────────────
// Mission Control hatte bisher keinen Ton. Musik (hub.mp3) blendet weich ein, beim Abflug weich aus;
// Knöpfe im Menü geben einen kurzen, leisen Klick. Startet erst nach der ersten Eingabe (Autoplay-Regeln).
function applyGains(E) {
  const st = settings();
  E.master.gain.value = st.master; E.sfxGain.gain.value = st.sfx; E.musicGain.gain.value = st.music;
}
export function hubMusic(on) {
  const E = engine();
  if (!E) return;
  applyGains(E);
  const tr = E._hubTrack && E._hubTrack.ok ? E._hubTrack : musicTrack(E, pickTrack(E, 'hub'));
  if (!tr || !tr.ok) return;
  E._hubTrack = tr;
  E.lastTrack = tr.id;
  const now = E.ctx.currentTime;
  clearTimeout(tr.stopT);
  tr.gain.gain.cancelScheduledValues(now);
  if (on) {
    tr.gain.gain.setTargetAtTime(0.5, now, 1.2);
    // Am Stückende das andere Hub-Stück einblenden (hub/title im Wechsel)
    tr.onNearEnd = () => { if (!E._hubOn || E._hubTrack !== tr) return; tr.gain.gain.setTargetAtTime(0, E.ctx.currentTime, 1); E._hubTrack = null; hubMusic(true); };
    const go = () => { if (tr.el.paused) tr.el.play().catch(() => { }); };
    go();
    if (!E._hubKick) { E._hubKick = true; const kick = () => { if (E._hubOn) { go(); E.ctx.resume().catch(() => { }); } }; window.addEventListener('pointerdown', kick); window.addEventListener('keydown', kick); }
  } else {
    tr.gain.gain.setTargetAtTime(0, now, 0.5);
    tr.onNearEnd = null;
    tr.stopT = setTimeout(() => { tr.el.pause(); tr.stoppedAt = performance.now(); }, 2500);
  }
  E._hubOn = !!on;
}
export function uiSound(kind = 'click') {
  const E = S; // nur, wenn die Engine schon läuft (kein Context nur für einen Klick)
  if (!E || E.ctx.state !== 'running') return;
  const now = E.ctx.currentTime;
  if (now - (E._uiLast || 0) < 0.03) return;
  E._uiLast = now;
  const o = E.ctx.createOscillator(), g = E.ctx.createGain();
  o.type = 'triangle';
  const f = kind === 'open' ? 660 : 1250;
  o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.05);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(kind === 'open' ? 0.05 : 0.035, now + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  o.connect(g).connect(E.sfxGain); o.start(now); o.stop(now + 0.08);
}

// ───────────── Gemeinsame Audio-Engine (einmal pro Seite) ─────────────
// Früher bekam jeder Flug einen eigenen AudioContext und dekodierte alle Effekte und die Musik neu
// (~90 MB PCM pro Abflug, dazu "context is closed"-Warnungen nach dispose). Jetzt: ein Context, Effekte einmal
// dekodiert und zwischengespeichert, Musik wird gestreamt (<audio> + MediaElementSource) statt komplett dekodiert.
let S = null;
function engine() {
  if (S) return S;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  // 'balanced': größerer Ausgabepuffer, damit Musik bei kurzen Lastspitzen (Laden, Sektorwechsel) nicht knackt
  let ctx;
  try { ctx = new Ctx({ latencyHint: 'balanced' }); } catch { ctx = new Ctx(); }
  const master = ctx.createGain(), sfxGain = ctx.createGain(), musicGain = ctx.createGain();
  // Limiter am Ende: viele gleichzeitige Explosionen/Laser übersteuern nicht mehr (kein Kratzen, gleichmäßiger Pegel)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.18;
  sfxGain.connect(master); musicGain.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
  S = { ctx, master, sfxGain, musicGain, buffers: new Map(), sfxLoad: null, tracks: new Map() };
  // Lautstärke-Einstellungen sofort übernehmen (Hub → Einstellungen → Ton)
  window.addEventListener('ls:settings', () => { if (S) applyGains(S); });
  // Nach Tab-Wechsel/Sperrbildschirm setzt der Browser den Context aus: beim Zurückkehren fortsetzen
  const resume = () => { if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => { }); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pointerdown', resume, { passive: true });
  window.addEventListener('keydown', resume);
  return S;
}
function loadSfx(E) {
  if (E.sfxLoad) return E.sfxLoad;
  // Wiederholung bei Serverfehler (5xx, z. B. kurz nach einem Deploy) oder Netzproblem – vorher fehlte der Klang
  // dann bis zum Neuladen der Seite. 404 (Datei gibt es nicht) wird nicht wiederholt.
  const load = async (url, left = 2) => {
    let r = null;
    try { r = await fetch(url); } catch (err) { if (left <= 0) throw err; }
    if (r && r.ok) return E.ctx.decodeAudioData(await r.arrayBuffer());
    if (r && r.status === 404) throw new Error(url);
    if (left <= 0) throw new Error(url);
    await new Promise((res) => setTimeout(res, 1500 * (3 - left)));
    return load(url, left - 1);
  };
  E.sfxLoad = Promise.all(SFX.map(async (id) => {
    try { E.buffers.set(id, await load(`/audio/sfx/${id}.mp3`)); } catch { /* fehlt: still */ }
  }));
  return E.sfxLoad;
}
// Nächstes Stück einer Stimmung: ein kürzlich unterbrochenes zuerst (Fortsetzen), sonst keine direkte Wiederholung
// extra: zusätzliches Stück nur für diesen Aufruf (Heimatmusik der Fraktion in der Ruhe-Stimmung)
function pickTrack(E, mood, extra = null) {
  const list = [...(MUSIC[mood] || MUSIC.calm), ...(extra ? [extra] : [])].filter((id) => !(E.tracks.get(id) && E.tracks.get(id).ok === false));
  if (!list.length) return null;
  const now = performance.now();
  const resume = list.find((id) => { const t = E.tracks.get(id); return t && t.stoppedAt && now - t.stoppedAt < MUSIC_RESUME_MS; });
  if (resume) return resume;
  const fresh = list.filter((id) => id !== E.lastTrack);
  const pool = fresh.length ? fresh : list;
  return pool[Math.floor(Math.random() * pool.length)];
}
// Musikspur als gestreamtes <audio>-Element, einmal je Stück angelegt und wiederverwendet. Ohne Schleife:
// kurz vor dem Ende ruft onNearEnd das nächste Stück der Stimmung auf (Überblendung statt harter MP3-Schleifenpause).
function musicTrack(E, id) {
  if (!id) return null;
  if (E.tracks.has(id)) return E.tracks.get(id);
  const el = new Audio(`/audio/music/${id}.mp3`);
  el.loop = false; el.preload = 'auto'; el.crossOrigin = 'anonymous';
  let t = null;
  try {
    const src = E.ctx.createMediaElementSource(el);
    const gain = E.ctx.createGain(); gain.gain.value = 0;
    src.connect(gain).connect(E.musicGain);
    t = { id, el, gain, ok: true, stoppedAt: 0, onNearEnd: null };
    el.addEventListener('error', () => { t.ok = false; }, { once: true });
    el.addEventListener('timeupdate', () => {
      if (t.onNearEnd && el.duration && el.duration - el.currentTime < MUSIC_FADE + 0.5) { const f = t.onNearEnd; t.onNearEnd = null; f(); }
    });
    el.addEventListener('ended', () => { if (t.onNearEnd) { const f = t.onNearEnd; t.onNearEnd = null; f(); } else { el.currentTime = 0; } });
  } catch { t = null; }
  E.tracks.set(id, t);
  return t;
}

export class AudioSystem {
  constructor(bus, world, renderer) {
    this.bus = bus;
    this.world = world;
    this.renderer = renderer;
    this.buffers = new Map();
    this.music = new Map();
    this.ctx = null;
    this.ready = false;
    this.last = new Map();       // Zeitpunkt des letzten Abspielens je Effekt (gegen Lärmteppich)
    this.musicState = null;
    this.combatUntil = 0;
    this._pos = { x: 0, y: 0, visible: true };

    this._unlock = () => this.start();
    window.addEventListener('pointerdown', this._unlock, { once: true });
    window.addEventListener('keydown', this._unlock, { once: true });

    const on = (t, f) => bus.on(t, f);
    this.offs = [
      on('shot', (p) => this.onShot(p)),
      on('rocket', (p) => this.play('rocket_launch', this.posOf(p.from))),
      on('damage', (p) => this.onDamage(p)),
      on('explode', (p) => {
        const e = this.world.entities.get(p.id);
        if (e && e.kind === 'enemy' && ENEMIES[e.type] && ENEMIES[e.type].group === 'swarm') this.play('alien_death', p, 0.9 + Math.random() * 0.2);
        else this.play(p.size >= 2 ? 'explosion_big' : 'explosion_small', p, 0.9 + Math.random() * 0.2);
      }),
      on('loot', () => this.play('loot')),
      on('levelup', () => this.play('levelup')),
      on('jumpStart', () => this.play('jump_charge')),
      on('sector', () => this.play('jump_warp')),
      on('docked', () => this.play('dock')),
      on('undocked', () => this.play('dock', null, 1.1)),
      on('message', (p) => { if (p && p.kind === 'radio') { this.play('radio'); this.duck(0.45, 2.5); } }),
      on('playerDead', () => this.play('explosion_big')),
      // Rückmeldungen ohne eigene Datei: kurz synthetisiert (Treffer-Tick, Abschuss, Auftrag, Warnung, Combo)
      on('explode', (p) => { if (p && p.kind === 'enemy') { this.synth('kill'); this.duck(p.size >= 2 ? 0.45 : 0.7, 0.9); } }),
      on('quest', (p) => { if (p && p.done) this.play('levelup', null, 1.2, 0.7); }),
      on('telegraph', (p) => { if (p && !p.own && p.enemyType) this.synth('warn'); }),
      on('combo', (p) => { if (p && !p.ended && p.count > 1) this.synth('combo', Math.min(12, p.count)); }),
    ];
  }

  async start() {
    if (this.ctx || this._disposed) return;
    const E = engine();
    if (!E) return;
    this.E = E;
    this.ctx = E.ctx; this.master = E.master; this.sfxGain = E.sfxGain; this.musicGain = E.musicGain;
    this.buffers = E.buffers;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
    this.applySettings();
    await loadSfx(E); // beim zweiten Flug sofort fertig (zwischengespeichert)
    if (this._disposed) return;
    this.ready = true;
    this.startEngine();
    this.updateMusic(true);
  }

  applySettings() {
    if (!this.ctx) return;
    const s = settings();
    this.master.gain.value = s.master;
    this.sfxGain.gain.value = s.sfx;
    this.musicGain.gain.value = s.music;
  }

  posOf(id) {
    const e = id && this.world.entities.get(id);
    return e ? { x: e.x, z: e.z } : null;
  }

  // Lautstärke und Stereo nach Bildschirmposition; außerhalb des Bildes leiser.
  play(id, where = null, rate = 1, gainMul = 1) {
    if (!this.ready) return;
    const buf = this.buffers.get(id);
    if (!buf) return;
    const now = this.ctx.currentTime;
    const prev = this.last.get(id) || 0;
    if (now - prev < 0.035) return;
    this.last.set(id, now);
    let pan = 0, vol = 1;
    if (where && this.renderer.toScreen) {
      const s = this.renderer.toScreen(where.x, where.z, this._pos);
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      pan = Math.max(-1, Math.min(1, (s.x / w) * 2 - 1)) * 0.7;
      const dx = s.x / w - 0.5, dy = s.y / h - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      vol = s.visible ? Math.max(0.25, 1 - d * 0.9) : 0.15;
      // Punkt auf der Kameraebene projiziert zu ±Unendlich/NaN → mittig und leise statt Fehler (vorher Hunderte je Gefecht)
      if (!Number.isFinite(pan)) pan = 0;
      if (!Number.isFinite(vol)) vol = 0.15;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
    const g = this.ctx.createGain();
    g.gain.value = (LEVEL[id] ?? 0.4) * vol * gainMul;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(g).connect(p).connect(this.sfxGain);
    src.start();
  }

  onShot(p) {
    const player = this.world.player;
    const mine = player && p.from === player.id;
    if (p.ammo === 'SAL') { this.play('salvo', this.posOf(p.from)); return; }
    if (p.ammo === 'SAB') { this.play('shield_drain', this.posOf(p.from)); return; }
    // Drohnenlaser: leiser, heller, nur jeder zweite (sonst überdecken acht Drohnen die eigenen Laser)
    if (p.drone) { if ((this._droneShot = (this._droneShot || 0) + 1) & 1) this.play('laser_pulse', this.posOf('player'), 1.3, 0.35); return; }
    const id = LASER_SOUND[p.laser] || 'laser_pulse';
    this.play(id, this.posOf(p.from), mine ? 1 : 0.85, mine ? 1 : 0.6);
    if (mine || (player && p.to === player.id)) this.combatUntil = performance.now() + 8000;
  }

  onDamage(p) {
    // Eigener Treffer am Gegner: kurzer, heller Bestätigungs-Tick (Krit höher und kräftiger)
    if (p.from === 'player' && p.id !== 'player' && !p.drone && (p.hull || 0) + (p.shield || 0) > 0) this.synth(p.crit ? 'crit' : 'hit');
    const where = { x: p.x, z: p.z };
    if (p.shield > 0 && !p.hull) this.play('hit_shield', where);
    else if (p.hull > 0) this.play('hit_hull', where);
  }

  /** Kurze synthetische Rückmeldetöne (keine Datei nötig, kaum Rechenzeit). kind: hit | crit | kill | warn | combo */
  synth(kind, n = 0) {
    if (!this.ready || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const key = 'syn:' + kind, prev = this.last.get(key) || 0;
    if (now - prev < (kind === 'hit' ? 0.05 : 0.08)) return;
    this.last.set(key, now);
    const tone = (f0, f1, dur, vol, type = 'square', at = 0) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, now + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + at + dur);
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(vol, now + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      o.connect(g).connect(this.sfxGain);
      o.start(now + at); o.stop(now + at + dur + 0.02);
    };
    if (kind === 'hit') tone(1900, 1200, 0.035, 0.05);
    else if (kind === 'crit') { tone(2600, 1500, 0.05, 0.08); tone(1300, 900, 0.07, 0.05, 'triangle'); }
    else if (kind === 'kill') { tone(880, 880, 0.06, 0.07, 'triangle'); tone(1320, 1320, 0.12, 0.07, 'triangle', 0.06); }
    else if (kind === 'warn') { tone(520, 380, 0.16, 0.06, 'sawtooth'); tone(520, 380, 0.16, 0.05, 'sawtooth', 0.2); }
    else if (kind === 'combo') tone(600 * Math.pow(1.06, n), 900 * Math.pow(1.06, n), 0.07, 0.05, 'triangle');
  }

  /** Musik kurz absenken (große Explosion, Abschuss), dann weich zurück */
  duck(to = 0.5, dur = 1) {
    if (!this.ctx || !this.musicGain) return;
    const g = this.musicGain.gain, now = this.ctx.currentTime, base = settings().music;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(base * to, now, 0.03);
    g.setTargetAtTime(base, now + dur * 0.4, dur * 0.4);
  }

  startEngine() {
    const buf = this.buffers.get('engine_loop');
    if (!buf) return;
    this.engine = this.ctx.createBufferSource();
    this.engine.buffer = buf;
    this.engine.loop = true;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engine.connect(this.engineGain).connect(this.sfxGain);
    this.engine.start();
  }

  // Stimmung aus der Lage: Stille-Sektoren, Kampf (Boss bei Alpha-Gegner in 1,5 km), sonst Ruhe. Hysterese: nach dem
  // Kampf mindestens 12 s Kampfmusik, damit die Musik nicht flattert. Innerhalb einer Stimmung wechselt das Stück am Ende.
  updateMusic(force = false, next = false) {
    if (!this.ctx || !this.E) return;
    const E = this.E;
    const sector = this.world.sector?.id || '';
    const nowMs = performance.now();
    let want = nowMs < this.combatUntil ? (this._bossNear() ? 'boss' : 'combat') : 'calm';
    if (/^STILLE|^IS-/.test(sector)) want = 'silence';
    if (!force && !next && want === 'calm' && this.musicState && this.musicState !== 'calm' && nowMs - (this._moodAt || 0) < 12000) want = this.musicState;
    let tr = this.track;
    // Autoplay-Sperre: Musik nachstarten, sobald der Browser Ton erlaubt (erste Eingabe)
    if (!next && tr && want === this.musicState && tr.el.paused && this.ctx.state === 'running') tr.el.play().catch(() => { });
    if (!next && want === this.musicState && !force) return;
    if (want !== this.musicState) this._moodAt = nowMs;
    const home = HOME_TRACK[sector.slice(0, 2)] || null;
    tr = musicTrack(E, pickTrack(E, want, want === 'calm' ? home : null));
    if (!tr || !tr.ok) { want = 'calm'; tr = musicTrack(E, pickTrack(E, 'calm', home)); }
    if (!tr || !tr.ok) return;
    const now = this.ctx.currentTime;
    if (this.track && this.track !== tr) {
      const old = this.track;
      old.onNearEnd = null;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, MUSIC_FADE / 3);
      clearTimeout(old.stopT);
      old.stopT = setTimeout(() => {
        if (this.track === old) return;
        old.el.pause();
        if (next) { old.el.currentTime = 0; old.stoppedAt = 0; } else old.stoppedAt = performance.now();
      }, MUSIC_FADE * 1000 + 500);
    }
    clearTimeout(tr.stopT);
    if (!tr.stoppedAt || nowMs - tr.stoppedAt >= MUSIC_RESUME_MS) { if (tr !== this.track) tr.el.currentTime = 0; }
    tr.stoppedAt = 0;
    tr.gain.gain.cancelScheduledValues(now);
    tr.gain.gain.setTargetAtTime(MUSIC_LEVEL[want] ?? 0.55, now, MUSIC_FADE / 3);
    tr.onNearEnd = () => { if (this.track === tr) this.updateMusic(false, true); };
    if (tr.el.paused) tr.el.play().catch(() => { });
    this.track = tr;
    E.lastTrack = tr.id;
    this.musicState = want;
  }

  _bossNear() {
    const p = this.world.player;
    if (!p) return false;
    for (const e of this.world.entities.values()) {
      if (e.kind !== 'enemy' || !(e.hp > 0) || (e.rank !== 'alpha' && !e.def?.boss)) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz < 1500 * 1500) return true;
    }
    return false;
  }

  update() {
    if (!this.ready) return;
    const p = this.world.player;
    if (this.engineGain && p) {
      const thrust = this.world.docked || this.world.playerDead ? 0 : Math.max(p.thrust || 0, Math.min(1, (p.speed || 0) / 340));
      this.engineGain.gain.setTargetAtTime(LEVEL.engine_loop * (0.25 + thrust * 0.9), this.ctx.currentTime, 0.2);
      this.engine.playbackRate.setTargetAtTime(0.85 + thrust * 0.35, this.ctx.currentTime, 0.3);
    }
    // Alarm nur kurz vor der Zerstörung: Hülle unter 25 %, höchstens alle 3 Sekunden.
    if (p && p.alive !== false && !this.world.playerDead && p.hpMax && p.hp / p.hpMax < 0.25) {
      const t = this.ctx.currentTime;
      if (!this._alarmAt || t - this._alarmAt > 3) { this._alarmAt = t; this.play('alarm', null, 1, 1.4); }
    }
    this._musicTick = (this._musicTick || 0) + 1;
    if (this._musicTick % 30 === 0) this.updateMusic();
  }

  dispose() {
    this._disposed = true;
    for (const off of this.offs) off();
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    if (!this.ctx) return;
    // Der Context bleibt (gemeinsam für die ganze Seite); nur die Klänge dieses Flugs weich beenden
    const now = this.ctx.currentTime;
    if (this.engine) {
      try { this.engineGain.gain.setTargetAtTime(0, now, 0.1); this.engine.stop(now + 0.5); } catch { /* egal */ }
      const eg = this.engineGain, en = this.engine;
      setTimeout(() => { try { en.disconnect(); eg.disconnect(); } catch { /* egal */ } }, 700);
    }
    if (this.track) {
      const tr = this.track;
      tr.gain.gain.cancelScheduledValues(now);
      tr.gain.gain.setTargetAtTime(0, now, 0.6);
      clearTimeout(tr.stopT);
      tr.stopT = setTimeout(() => tr.el.pause(), 3000);
    }
  }
}
