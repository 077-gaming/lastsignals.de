// Ton im Flug: Effekte aus public/audio/sfx (ElevenLabs), räumlich nach Position auf dem Bildschirm,
// Triebwerk als Schleife nach Schub, Musik wechselt weich zwischen Ruhe, Kampf und Stille.
import { ENEMIES } from '../core/data.js';
// Lautstärken aus localStorage 'ls.settings' (master, sfx, music jeweils 0..1).

const SFX = [
  'laser_pulse', 'laser_ion', 'laser_plasma', 'laser_gamma', 'salvo', 'shield_drain', 'rocket_launch', 'rocket_hit',
  'hit_shield', 'hit_hull', 'explosion_small', 'explosion_big', 'engine_loop', 'boost', 'jump_charge', 'jump_warp',
  'dock', 'loot', 'levelup', 'alarm', 'ui_click', 'ui_open', 'radio', 'alien_death',
];
const MUSIC = { calm: 'home_calm', combat: 'combat', silence: 'silence' };
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
      on('message', (p) => { if (p && p.kind === 'radio') this.play('radio'); }),
      on('playerDead', () => this.play('explosion_big')),
    ];
  }

  async start() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain.connect(this.master);
    this.musicGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applySettings();
    const load = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url);
      return this.ctx.decodeAudioData(await r.arrayBuffer());
    };
    await Promise.all(SFX.map(async (id) => {
      try { this.buffers.set(id, await load(`/audio/sfx/${id}.mp3`)); } catch { /* fehlt: still */ }
    }));
    this.ready = true;
    this.startEngine();
    Promise.all(Object.entries(MUSIC).map(async ([k, id]) => {
      try { this.music.set(k, await load(`/audio/music/${id}.mp3`)); } catch { /* noch nicht erzeugt */ }
    })).then(() => this.updateMusic(true));
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
    const where = { x: p.x, z: p.z };
    if (p.shield > 0 && !p.hull) this.play('hit_shield', where);
    else if (p.hull > 0) this.play('hit_hull', where);
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

  updateMusic(force = false) {
    if (!this.ctx || !this.music.size) return;
    const sector = this.world.sector?.id || '';
    let want = performance.now() < this.combatUntil ? 'combat' : 'calm';
    if (/^STILLE|^IS-/.test(sector)) want = 'silence';
    if (!this.music.has(want)) want = this.music.has('calm') ? 'calm' : [...this.music.keys()][0];
    if (want === this.musicState && !force) return;
    const now = this.ctx.currentTime;
    if (this.track) {
      const old = this.track;
      old.gain.gain.setTargetAtTime(0, now, 1.2);
      setTimeout(() => { try { old.src.stop(); } catch { } }, 5000);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.music.get(want);
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(want === 'combat' ? 0.7 : 0.55, now, 1.5);
    src.connect(gain).connect(this.musicGain);
    src.start();
    this.track = { src, gain };
    this.musicState = want;
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
    for (const off of this.offs) off();
    window.removeEventListener('pointerdown', this._unlock);
    window.removeEventListener('keydown', this._unlock);
    if (this.ctx) this.ctx.close().catch(() => { });
  }
}
