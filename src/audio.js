// Ton der Website, komplett im Browser erzeugt (Web Audio), keine Audiodateien.
// Weltraum-Atmosphäre (tiefer Klangteppich), Funkrauschen, leise Musik (langsame Akkorde), kleine Klänge bei Klicks.
// Startet nie von allein, nur über den Lautsprecher-Knopf.

let ctx = null, master = null, bus = null, on = false, nodes = [], timers = [], startLoops = null;

function noiseBuffer(c, sec = 4) {
  const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // braunes Rauschen
  return b;
}
function whiteBuffer(c, sec = 1) {
  const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.connect(master);
  bus = ctx.createGain(); bus.gain.value = 1; bus.connect(comp);

  // Hall aus gefiltertem Rauschen
  const verb = ctx.createConvolver();
  const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.42; verb.connect(wet); wet.connect(bus);

  // Klangteppich: Rauschen durch langsam wandernden Bandpass
  const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 0.7;
  const ng = ctx.createGain(); ng.gain.value = 0.12;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.035; const lfoG = ctx.createGain(); lfoG.gain.value = 140; lfo.connect(lfoG); lfoG.connect(bp.frequency);
  n.connect(bp); bp.connect(ng); ng.connect(bus); ng.connect(verb);
  n.start(); lfo.start(); nodes.push(n, lfo);

  // Tiefer Grundton: zwei leicht verstimmte Töne
  const drone = ctx.createGain(); drone.gain.value = 0.05; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
  drone.connect(lp); lp.connect(bus); lp.connect(verb);
  for (const [f, type] of [[55, 'sawtooth'], [55.4, 'sawtooth'], [82.4, 'triangle']]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(drone); o.start(); nodes.push(o);
  }

  // Musik: langsame Akkorde (a-Moll-Raum), weich ein- und ausgeblendet
  const chords = [[220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2], [196, 246.9, 293.7, 392], [164.8, 207.7, 246.9, 329.6]];
  let ci = 0;
  const pad = () => {
    if (!on) return;
    const now = ctx.currentTime, dur = 9;
    for (const f of chords[ci % chords.length]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f / 2;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f / 2 * 1.003;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.018, now + 3.2); g.gain.linearRampToValueAtTime(0, now + dur);
      o.connect(g); o2.connect(g); g.connect(verb); g.connect(bus);
      o.start(now); o2.start(now); o.stop(now + dur + 0.1); o2.stop(now + dur + 0.1);
    }
    ci++;
    timers.push(setTimeout(pad, 7600));
  };

  // Funkrauschen: kurze Ausbrüche mit Knacken in unregelmäßigen Abständen
  const radio = () => {
    if (!on) return;
    burst(0.9 + Math.random() * 1.6, 0.05);
    timers.push(setTimeout(radio, 9000 + Math.random() * 14000));
  };
  startLoops = () => { timers.push(setTimeout(pad, 800)); timers.push(setTimeout(radio, 4000)); };
}

function burst(sec, vol) {
  const now = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = whiteBuffer(ctx, sec + 0.1);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1400; f.Q.value = 1.4;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, now);
  for (let t = 0; t < sec; t += 0.06) g.gain.setValueAtTime(vol * (0.3 + Math.random() * 0.7) * (Math.random() < 0.15 ? 0 : 1), now + t);
  g.gain.linearRampToValueAtTime(0, now + sec);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(now); s.stop(now + sec + 0.1);
}

// Kleiner Klang bei Klicks: kurzer Ton mit Abfall
export function blip(kind = 'click') {
  if (!on || !ctx) return;
  const now = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine';
  const g = ctx.createGain();
  const [f0, f1, d, v] = kind === 'hover' ? [1800, 1500, 0.05, 0.012] : kind === 'pick' ? [520, 980, 0.22, 0.05] : [1200, 640, 0.09, 0.035];
  o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + d);
  g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.04);
  o.connect(g); g.connect(bus); o.start(now); o.stop(now + d + 0.06);
  if (kind === 'pick') burst(0.25, 0.03);
}

export function isOn() { return on; }

export async function setSound(want) {
  if (want && !ctx) build();
  if (!ctx) return false;
  on = want;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  if (want) {
    if (ctx.state === 'suspended') await ctx.resume();
    master.gain.linearRampToValueAtTime(0.9, now + 1.6);
  } else {
    master.gain.linearRampToValueAtTime(0, now + 0.4);
    timers.forEach(clearTimeout); timers = [];
    setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 500);
  }
  if (want) { timers.forEach(clearTimeout); timers = []; burst(0.8, 0.04); startLoops(); }
  return on;
}

// Kurzer Funkspruch-Klang beim Wechsel des Kapitels
export function chapterCue() { if (on && ctx) burst(0.35, 0.035); }
