// Gemeinsame Bausteine für alle Bildschirme vor dem Flug (Bildsprache: Planung/UI_STIL.md).
// Sternenfeld als ein einziges 2D-Canvas, Grundgerüst je Bildschirm, Einstellungen, SVG-Zeichnungen.
import { FACTIONS, RANKS, SHIPS } from '../core/data.js';

// ---------------------------------------------------------------- Zahlen, Text, Zeit

const NF = new Intl.NumberFormat('de-DE');
export const fmt = (v) => NF.format(Math.round(Number(v) || 0));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const pad2 = (n) => (n < 10 ? '0' : '') + n;
export const pad3 = (n) => (n < 10 ? '00' : n < 100 ? '0' : '') + n;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const VERSION = 'BUILD 0.1.0';
export const CUR = { credits: 'CR', tritium: 'TR' };

export function utcClock() {
  const d = new Date();
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}
export function met(ms) {
  const t = Math.max(0, ms) / 1000;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${d}`;
}
export function duration(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}`;
}
export function price(item) {
  if (!item) return '';
  if (item.dropOnly) return 'NUR BEUTE';
  if (item.price == null || !item.currency) return 'STARTAUSRÜSTUNG';
  return `${fmt(item.price)} ${CUR[item.currency] || item.currency}`;
}

// Fraktionsfarben laut UI_STIL.md
export const FX = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };
export const accentOf = (id) => FX[id] || '#e0782a';
/** Vor der Fraktionszuteilung: neutrales Weiß statt Fraktionsfarbe */
export const NEUTRAL_FX = 'rgba(255, 255, 255, .94)';
export const FX_CODE = { europa: 'EU', saturn: 'SA', eris: 'ER' };

// Schiffsklassen für die Anzeige (Daten bleiben in data.js), fortlaufend nummeriert
const SHIP_CLASS = { s1: 'Starter', s2: 'Courier', s3: 'Warden', s5: 'Bastion', s8: 'Leviathan' };
const SHIP_IDS = Object.keys(SHIPS);
export const shipName = (id) => SHIP_CLASS[id] || SHIPS[id]?.name || 'Starter';
export const shipNo = (id) => Math.max(1, SHIP_IDS.indexOf(id) + 1);

export function rankIndex(level) { return Math.min(RANKS.length - 1, Math.max(0, Math.floor(((level || 1) - 1) / 3))); }
export function rankOf(level) { return RANKS[rankIndex(level)]; }

// ---------------------------------------------------------------- Einstellungen (localStorage 'ls.settings')

export const SETTINGS_KEY = 'ls.settings';
export const SETTINGS_DEFAULT = Object.freeze({ quality: 'high', hudScale: 1, reducedMotion: false });
const QUALITIES = ['ultra', 'high', 'medium', 'low'];
// Einstellungsstand: ab 2 gibt es ULTRA. Ältere Stände mit HOCH (damals höchste Stufe) werden auf starken
// Rechnern auf ULTRA gehoben, eine bewusst gewählte niedrigere Stufe bleibt.
const SETTINGS_REV = 2;

/** Starker Rechner: Apple-Silicon- oder große dedizierte Grafik und mindestens 8 Kerne (einmal geprüft) */
let strongCache = null;
export function strongDevice() {
  if (strongCache !== null) return strongCache;
  strongCache = false;
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    if (g) {
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      const cores = navigator.hardwareConcurrency || 4;
      strongCache = cores >= 8 && /Apple M\d|Apple GPU|RTX|Radeon (RX|Pro)|Arc A/i.test(r);
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { strongCache = false; }
  return strongCache;
}
const HUD_SCALES = [0.85, 1, 1.15, 1.3];
export const SETTING_CHOICES = { quality: QUALITIES, hudScale: HUD_SCALES, reducedMotion: [false, true] };

export function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch { raw = null; }
  const s = { ...SETTINGS_DEFAULT, quality: strongDevice() ? 'ultra' : 'high' };
  if (raw && typeof raw === 'object') {
    const old = raw.rev !== SETTINGS_REV;
    if (QUALITIES.includes(raw.quality) && !(old && raw.quality === 'high')) s.quality = raw.quality;
    const hs = Number(raw.hudScale);
    if (hs >= 0.7 && hs <= 1.6) s.hudScale = hs;
    s.reducedMotion = raw.reducedMotion === true;
  }
  return s;
}
export function applySettings(s) {
  const el = document.documentElement;
  el.style.setProperty('--hud-scale', String(s.hudScale));
  el.dataset.quality = s.quality;
  if (s.reducedMotion) el.dataset.reducedMotion = '1'; else delete el.dataset.reducedMotion;
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...s, rev: SETTINGS_REV })); } catch { /* privater Modus */ }
  applySettings(s);
  try { window.dispatchEvent(new CustomEvent('ls:settings', { detail: { ...s } })); } catch { /* alt */ }
}
let settingsCache = null;
export function settings() { if (!settingsCache) { settingsCache = loadSettings(); applySettings(settingsCache); } return settingsCache; }
export function setSetting(key, value) { const s = { ...settings(), [key]: value }; settingsCache = s; saveSettings(s); return s; }

export const reduced = () =>
  settings().reducedMotion || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------------------------------------------------------------- Sternenfeld (ein Canvas, keine Speicher-Neuanlage pro Bild)

export const sky = (() => {
  const MAX = 460;
  const X = new Float32Array(MAX), Y = new Float32Array(MAX), Z = new Float32Array(MAX), L = new Float32Array(MAX);
  const QX = new Float32Array(MAX), QY = new Float32Array(MAX), TX = new Float32Array(MAX), TY = new Float32Array(MAX);
  const R = new Float32Array(MAX), B = new Uint8Array(MAX);
  const FILL = ['rgba(200,214,235,0.16)', 'rgba(214,226,242,0.34)', 'rgba(232,240,250,0.58)', 'rgba(255,255,255,0.9)'];
  let canvas = null, ctx = null, host = null, ro = null;
  let n = 0, W = 1, H = 1, dpr = 1, kx = 1, ky = 1, seeded = false;
  let raf = 0, last = 0, warp = 0, warpTo = 0, still = false;

  function spawn(i, z) {
    Z[i] = z;
    X[i] = (Math.random() * 2 - 1) * z * kx * 1.08;
    Y[i] = (Math.random() * 2 - 1) * z * ky * 1.08;
  }
  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'sc-sky';
    canvas.setAttribute('aria-hidden', 'true');
    ctx = canvas.getContext('2d', { alpha: true });
    for (let i = 0; i < MAX; i++) L[i] = Math.random();
    if (typeof ResizeObserver === 'function') ro = new ResizeObserver(resize);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  }
  function resize() {
    if (!host) return;
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    let d = Math.min(2, window.devicePixelRatio || 1);
    const cap = 4.2e6;
    if (w * h * d * d > cap) d = Math.sqrt(cap / (w * h));
    dpr = d;
    W = Math.max(1, Math.round(w * d)); H = Math.max(1, Math.round(h * d));
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const f = Math.max(W, H) * 0.5;
    kx = (W * 0.5) / f; ky = (H * 0.5) / f;
    n = Math.min(MAX, Math.max(120, Math.round((w * h) / 4200)));
    if (!seeded) { for (let i = 0; i < MAX; i++) spawn(i, 0.06 + Math.random() * 0.94); seeded = true; }
    draw(0);
  }
  function draw(dt) {
    const speed = still ? 0 : 0.008 + warp * 1.3;
    const cx = W * 0.5, cy = H * 0.5, f = Math.max(W, H) * 0.5;
    const streak = !still && warp > 0.03;
    const tail = 0.006 + warp * 0.09;
    for (let i = 0; i < n; i++) {
      let z = Z[i] - speed * dt;
      if (z < 0.03) { spawn(i, 0.92 + Math.random() * 0.08); z = Z[i]; }
      let qx = cx + (X[i] / z) * f, qy = cy + (Y[i] / z) * f;
      if (qx < -40 || qx > W + 40 || qy < -40 || qy > H + 40) {
        spawn(i, 0.92 + Math.random() * 0.08); z = Z[i];
        qx = cx + (X[i] / z) * f; qy = cy + (Y[i] / z) * f;
      }
      Z[i] = z; QX[i] = qx; QY[i] = qy;
      if (streak) { const zt = z + tail; TX[i] = cx + (X[i] / zt) * f; TY[i] = cy + (Y[i] / zt) * f; }
      const near = 1 - z;
      let b = (near * 2.2 + L[i] * 1.9) | 0; if (b > 3) b = 3;
      B[i] = b;
      R[i] = (0.6 + near * 1.4 + L[i] * 0.4) * dpr;
    }
    ctx.clearRect(0, 0, W, H);
    for (let b = 0; b < 4; b++) {
      if (streak) {
        ctx.strokeStyle = FILL[b];
        ctx.lineWidth = (0.6 + b * 0.4) * dpr;
        ctx.beginPath();
        for (let i = 0; i < n; i++) if (B[i] === b) { ctx.moveTo(TX[i], TY[i]); ctx.lineTo(QX[i], QY[i]); }
        ctx.stroke();
      } else {
        ctx.fillStyle = FILL[b];
        for (let i = 0; i < n; i++) if (B[i] === b) { const s = R[i]; ctx.fillRect(QX[i] - s * 0.5, QY[i] - s * 0.5, s, s); }
      }
    }
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    let dt = last ? (now - last) / 1000 : 0;
    last = now;
    if (dt > 0.05) dt = 0.05;
    warp += (warpTo - warp) * (dt * 2.6 > 1 ? 1 : dt * 2.6);
    draw(dt);
  }
  function start() {
    if (raf || still || !host || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  return {
    attach(el) {
      ensure();
      if (host && host !== el) this.detach(host);
      host = el;
      still = reduced();
      el.insertBefore(canvas, el.firstChild);
      if (ro) ro.observe(el); else addEventListener('resize', resize);
      resize();
      start();
    },
    detach(el) {
      if (!host || (el && host !== el)) return;
      stop();
      if (ro) ro.disconnect(); else removeEventListener('resize', resize);
      canvas.remove();
      host = null;
      warp = warpTo = 0;
    },
    setWarp(v) { warpTo = v; },
  };
})();

// ---------------------------------------------------------------- Grundgerüst je Bildschirm

export function mount(root, name, label, fx, opts = {}) {
  settings();
  root.textContent = '';
  const scr = document.createElement('div');
  scr.className = `scr scr-${name}`;
  scr.setAttribute('role', 'region');
  scr.setAttribute('aria-label', label);
  if (fx) scr.style.setProperty('--fx', fx);
  scr.innerHTML = '<div class="sc-grid" aria-hidden="true"></div><div class="sc-vig" aria-hidden="true"></div><div class="sc-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
  const inner = document.createElement('div');
  inner.className = 'scr-in';
  scr.appendChild(inner);
  root.appendChild(scr);
  if (opts.stage) scr.classList.add('has-stage'); else sky.attach(scr);
  if (reduced()) scr.classList.add('rm');
  const offs = [];
  let closed = false;
  const api = {
    scr, inner,
    $: (q) => inner.querySelector(q),
    on(t, type, fn, o) { t.addEventListener(type, fn, o); offs.push(() => t.removeEventListener(type, fn, o)); },
    timer(fn, ms) { const id = setTimeout(fn, ms); offs.push(() => clearTimeout(id)); return id; },
    every(fn, ms) { const id = setInterval(fn, ms); offs.push(() => clearInterval(id)); return id; },
    loop(fn) {
      let id = 0;
      const step = (t) => { id = requestAnimationFrame(step); fn(t); };
      id = requestAnimationFrame(step);
      const stop = () => cancelAnimationFrame(id);
      offs.push(stop);
      return stop;
    },
    get closed() { return closed; },
    async close(ms = 240) {
      if (closed) return;
      closed = true;
      for (const f of offs) f();
      offs.length = 0;
      scr.classList.add('is-out');
      if (ms && !reduced()) await wait(ms);
      if (!opts.stage) sky.detach(scr);
      if (scr.parentNode === root) root.textContent = '';
    },
  };
  void scr.offsetWidth;
  scr.classList.add('is-in');
  return api;
}

/** Uhr nur bei Änderung ins DOM schreiben */
export function clockInto(s, el) {
  if (!el) return;
  let prev = '';
  const tick = () => { const t = utcClock(); if (t !== prev) { prev = t; el.textContent = t; } };
  tick();
  s.every(tick, 1000);
}

/** Chamfer-Panel mit Kopfleiste (Bausteine aus theme.css) */
export function panel(code, title, right, body, cls = '', attrs = '') {
  return `<section class="ls-panel sc-pn ${cls}" ${attrs}><div class="ls-corners"></div>
    <header class="ls-head"><span class="ls-code">${code}</span><span class="ls-title">${title}</span><span class="ls-spacer"></span>${right || ''}</header>
    <div class="sc-pn-body">${body}</div></section>`;
}

/** Kopf- und Fußzeile eines Bildschirms (Telemetrieleiste) */
export function topStrip(section, right = '', brand = true) {
  return `<header class="sc-top rise">
    <div class="sc-top-l">${insignia('sc-ins-mini')}${brand ? '<span class="sc-top-brand">LAST SIGNALS</span><span class="sc-top-sep"></span>' : ''}<span class="sc-top-sec">${section}</span></div>
    <div class="sc-top-c"><div class="ls-tick"></div></div>
    <div class="sc-top-r">${right}<span class="sc-ro"><span class="ls-label">UTC</span><span class="ls-num" data-clock>--:--:--</span></span></div>
  </header>`;
}
export function footStrip(left, center, right) {
  return `<footer class="sc-foot rise"><span>${left}</span><span class="sc-foot-c">${center}</span><span>${right}</span></footer>`;
}

/** Großer Schriftzug */
export function wordmark(sub = 'INTERPLANETARE FLUGLEITUNG') {
  return `<div class="sc-mark">
    <div class="sc-mark-top"><span>DEEP SPACE NETWORK</span><span>KANAL 08</span><span>X-BAND 8,4 GHZ</span></div>
    <h1 class="sc-title"><span class="sc-t1">LAST</span><span class="sc-sig" aria-hidden="true"><b></b><b></b><b></b><b></b></span><span class="sc-t2">SIGNALS</span></h1>
    <div class="sc-mark-rule"><div class="ls-tick"></div></div>
    <div class="sc-mark-sub"><span>${sub}</span><span>${VERSION}</span></div>
  </div>`;
}

// ---------------------------------------------------------------- SVG: Missionsabzeichen, Fraktionswappen, Schiffe

let uid = 0;
const OCT = (a, b, c) => `M${a + c} ${a}H${b - c}L${b} ${a + c}V${b - c}L${b - c} ${b}H${a + c}L${a} ${b - c}V${a + c}Z`;

export function insignia(cls = 'sc-ins') {
  const id = `ins${++uid}`;
  let grid = '';
  for (let v = 52; v <= 148; v += 12) grid += `M${v} 44V156M44 ${v}H156`;
  let ticks = '';
  for (let i = 0; i <= 12; i++) { const y = 46 + i * 9; ticks += `M7 ${y}h${i % 4 ? 3 : 6}M193 ${y}h-${i % 4 ? 3 : 6}`; }
  return `<svg class="${cls}" viewBox="0 0 200 200" aria-hidden="true">
    <defs><clipPath id="${id}"><path d="${OCT(30, 170, 14)}"/></clipPath></defs>
    <path d="${OCT(3, 197, 38)}" class="i-l2"/>
    <path d="${OCT(12, 188, 33)}" class="i-l1"/>
    <path d="${ticks}" class="i-l1"/>
    <path d="M62 12h76M62 188h76" class="i-fx"/>
    <text x="100" y="27" class="i-tx" text-anchor="middle">LAST SIGNALS</text>
    <text x="100" y="181" class="i-tx i-tx2" text-anchor="middle">LS-01 · FLUGLEITUNG</text>
    <path d="${OCT(30, 170, 14)}" class="i-l1"/>
    <g clip-path="url(#${id})">
      <path d="${grid}" class="i-grid"/>
      <ellipse cx="96" cy="112" rx="88" ry="30" transform="rotate(-14 96 112)" class="i-dash"/>
      <circle cx="88" cy="116" r="24" class="i-planet"/>
      <path d="M66 124c12 4 30 3 44-6" class="i-l1"/>
      <ellipse cx="88" cy="116" rx="42" ry="8" transform="rotate(-14 88 116)" class="i-ring"/>
      <path d="M134 74a14 14 0 0 1 14 -14M128 74a20 20 0 0 1 20 -20M122 74a26 26 0 0 1 26 -26" class="i-l2"/>
      <rect x="146" y="58" width="4" height="4" class="i-fill"/>
      <path d="M58 60v8M54 64h8M150 140v6M147 143h6" class="i-l2"/>
    </g>
  </svg>`;
}

const EMB = {
  europa: `<circle cx="60" cy="62" r="26" class="e-l"/>
    <path d="M38 52l12 6 9-5 12 9 12-3M37 70l11-5 10 4 11-8 13 2M48 82l8-7 9 3 9-7" class="e-t"/>
    <path d="M60 22v10M60 92v10M20 62h10M90 62h10" class="e-l"/>
    <circle cx="60" cy="62" r="34" class="e-d"/>`,
  saturn: `<circle cx="60" cy="62" r="18" class="e-l"/>
    <path d="M47 55h26M44 63h32M47 71h26" class="e-t"/>
    <ellipse cx="60" cy="62" rx="40" ry="11" transform="rotate(-16 60 62)" class="e-l"/>
    <ellipse cx="60" cy="62" rx="33" ry="8" transform="rotate(-16 60 62)" class="e-d"/>
    <path d="M24 30l8 0M28 26v8M92 92l8 0M96 88v8" class="e-l"/>`,
  eris: `<path d="M60 26l16 36-16 36-16-36z" class="e-l"/>
    <path d="M60 26v72M44 62h32" class="e-t"/>
    <path d="M34 40l10 8M86 40l-10 8M34 84l10-8M86 84l-10-8" class="e-l"/>
    <path d="M60 18l26 10 8 34-8 34-26 10-26-10-8-34 8-34z" class="e-d"/>`,
};
export function emblem(id, cls = 'sc-emb') {
  return `<svg class="${cls}" viewBox="0 0 120 124" aria-hidden="true">
    <path d="M14 4H106L116 14V86L60 120L4 86V14Z" class="e-frame"/>
    <path d="M18 10H102L110 18V83L60 113L10 83V18Z" class="e-frame2"/>
    ${EMB[id] || ''}
  </svg>`;
}

/** Doktrin der Fraktion (Gesinnung bleibt intern in data.js) */
const DOCTRINE = { gut: [1, 'SCHUTZ'], mittelböse: [2, 'HANDEL'], böse: [3, 'VERGELTUNG'] };
export function doctrineOf(alignment) { return (DOCTRINE[alignment] || DOCTRINE.gut)[1]; }
export function alignMeter(alignment) {
  const [lv, word] = DOCTRINE[alignment] || DOCTRINE.gut;
  return `<span class="sc-align"><span class="ls-label">DOKTRIN</span><span class="sc-align-w">${word}</span><span class="sc-align-seg" title="Bedrohungsstufe ${lv}">${[1, 2, 3].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span></span>`;
}

/**
 * Rangabzeichen im Chamfer-Rahmen, Fraktionsfarbe. Sechs Gruppen zu je drei Stufen:
 * Winkel (Mannschaft), Balken (Offizier), Rauten (Stabsoffizier), Sterne (Kapitän), Sterne mit Balken
 * (Flaggoffizier), große Sterne mit Doppelbalken (Admiralität). Zahl der Zeichen = Stufe in der Gruppe.
 */
function star(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  }
  return `${d}Z`;
}
export function rankBadge(level, cls = 'sc-rank') {
  const ri = rankIndex(level);
  const grp = Math.floor(ri / 3), n = (ri % 3) + 1;
  let d = '';
  const row = (w, gap) => { const tot = n * w + (n - 1) * gap; return Array.from({ length: n }, (_, i) => 24 - tot / 2 + w / 2 + i * (w + gap)); };
  if (grp === 0) {
    const y0 = 28 + (n - 1) * 4.5;
    for (let i = 0; i < n; i++) { const y = y0 - i * 9; d += `M11 ${y}L24 ${y - 8}L37 ${y}V${y + 5}L24 ${y - 3}L11 ${y + 5}Z`; }
  } else if (grp === 1) {
    const y0 = 24 - (n * 5 + (n - 1) * 3.5) / 2;
    for (let i = 0; i < n; i++) { const y = y0 + i * 8.5; d += `M12 ${y}H36V${y + 5}H12Z`; }
  } else if (grp === 2) {
    for (const x of row(9, 3.5)) d += `M${x} 17L${x + 5.5} 24L${x} 31L${x - 5.5} 24Z`;
  } else if (grp === 3) {
    for (const x of row(11, 2)) d += star(x, 24.5, 6.4);
  } else if (grp === 4) {
    for (const x of row(11, 2)) d += star(x, 21, 6);
    d += 'M11 31H37V34H11Z';
  } else {
    for (const x of row(12.5, 1)) d += star(x, 20, 7.2);
    d += 'M10 30H38V32.6H10ZM10 35H38V37.6H10Z';
  }
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true" data-rank="${ri}"><path d="M9 1.5H46.5V39L39 46.5H1.5V9Z" class="r-frame"/><path d="M12 5H43V36.5L36.5 43H5V12Z" class="r-frame2"/><path d="${d}" class="r-sym"/></svg>`;
}

/** Schiffssilhouette von oben (Schiffsreihe), Größe nach Nummer */
export function shipSilhouette(no) {
  const k = Math.min(1, 0.5 + no * 0.065);
  const wing = 18 + Math.min(no, 8) * 1.6;
  return `<svg class="sc-sil" viewBox="0 0 96 64" aria-hidden="true"><g transform="translate(48 34) scale(${k.toFixed(2)})">
    <path d="M0 -28L6 -10L8 -2L${wing} 8L${wing} 12L8 10L6 20L-6 20L-8 10L-${wing} 12L-${wing} 8L-8 -2L-6 -10Z"/>
    <path d="M0 -20V12M-3 -6H3" class="s-t"/>
    ${no >= 3 ? `<path d="M-${wing - 4} 8V-2M${wing - 4} 8V-2"/>` : ''}
    ${no >= 5 ? `<path d="M-14 22H14M-10 26H10"/>` : ''}
    ${no >= 8 ? `<path d="M-${wing + 4} 14L-${wing} 4M${wing + 4} 14L${wing} 4"/>` : ''}
  </g></svg>`;
}

export function factionName(id) { return FACTIONS[id]?.name || 'OHNE FRAKTION'; }

// Kodex je Fraktion (Fraktionswahl und Hub)
export const KODEX = {
  europa: ['Leben wird geschützt, auch das fremde.', 'Wissen gehört allen. Daten werden geteilt.', 'Kein Schuss auf Wehrlose.'],
  saturn: ['Jeder Vertrag gilt bis zur letzten Zeile.', 'Jede Ladung hat einen Preis.', 'Schulden werden eingetrieben.'],
  eris: ['Der Rand gehört uns.', 'Schwäche wird genommen.', 'Der Erste spricht. Die anderen fliegen.'],
};

/**
 * Signal-Oszilloskop (Systemstart und Anmeldung): kleines Canvas, feste Puffer, max. 30 Bilder/s.
 * lock(): 0 = Rauschen … 1 = Träger erfasst. Liefert stop().
 */
export function signalScope(s, canvas, lock) {
  const ctx = canvas.getContext('2d');
  const N = 120;
  const noise = new Float32Array(N);
  const col = getComputedStyle(s.scr).getPropertyValue('--fx').trim() || '#fff';
  let last = 0;
  const draw = (t) => {
    const w = canvas.width, h = canvas.height, mid = h * 0.5, L = lock();
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
    ctx.moveTo(0, mid + 0.5); ctx.lineTo(w, mid + 0.5);
    ctx.stroke();
    for (let i = 0; i < N; i++) noise[i] = noise[i] * 0.6 + (Math.random() - 0.5) * 0.4;
    ctx.strokeStyle = s.scr.dataset.scopeCol || col;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w;
      const carrier = Math.sin(i * 0.42 + t * 0.006) * L;
      const y = mid - (carrier * 0.7 + noise[i] * (1.4 - L)) * h * 0.4;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  };
  return s.loop((now) => { if (now - last > 33) { last = now; draw(now); } });
}
