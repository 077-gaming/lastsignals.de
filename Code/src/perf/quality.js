// Automatische Grafikqualität: Grafikchip erkennen, kurz unsichtbar messen, Stufe festlegen (nur solange der
// Spieler nicht selbst gewählt hat), und im Flug absichern (dauerhaft unter 50 Bilder/s → eine Stufe tiefer).
//
// Speicher: 'ls.settings'.quality (gemeinsam mit dem Hub) + 'ls.settings'.qualityAuto = true, dazu 'ls.qauto'
// (Ergebnis der Erkennung: Chip, Stufe, Messwerte). Der Hub schreibt beim Speichern nur seine bekannten Felder
// zurück (qualityAuto fällt dabei weg) – deshalb gilt eine Stufe auch dann als automatisch, wenn sie genau der
// zuletzt automatisch gewählten aus 'ls.qauto' entspricht. Eine andere Stufe im Hub = eigene Wahl, hat Vorrang.

export const Q_NAMES = ['low', 'medium', 'high', 'ultra'];
export const Q_LABEL = ['NIEDRIG', 'MITTEL', 'HOCH', 'ULTRA'];
const Q_INDEX = { low: 0, medium: 1, high: 2, ultra: 3, niedrig: 0, mittel: 1, hoch: 2 };
const SET_KEY = 'ls.settings';
const AUTO_KEY = 'ls.qauto';
const VERSION = 2; // 2: Kampf-Modell, Bildwiederholrate, einmaliges Anheben
// Pixeldichte-Obergrenze je Stufe (wie renderer.js PR_CAP)
const PR_CAP = [1, 1.5, 2, 2];
// Grafikkosten des Spiels je Megapixel in Einheiten der Messszene. Modell: Grafikzeit = Messwert × (FIX + PX ×
// Kosten[Stufe] × Megapixel). Abgeglichen mit KAMPFSZENEN statt Ruhebildern (window.__suite: Schwarm-Nest, 30 Gegner
// in der Nähe, Explosionen), Apple M5, Messwert beim Start 0,31–0,34, Puffer 1366×768 und 1440×900 je Stufe:
//   NIEDRIG 1,05 / 1,30 MPx → 3,5 / 4,0 ms · MITTEL 2,36 / 2,92 → 5,6 / 6,7 · HOCH 4,20 / 5,18 → 10,6 / 10,6 ·
//   ULTRA 4,20 / 5,18 → 9,2–10,5 / 12,3 ms.  Fest ≈ 1,4 ms, je Megapixel ≈ 1,98 ms × Kosten (MITTEL billiger: Nachleuchten
//   in halber Auflösung ab Pixeldichte 1,5; HOCH/ULTRA teurer: Schatten, Lichter, Partikel).
const UNIT_REF = 0.32;
const FIX = 1.4 / UNIT_REF, PX = 1.98 / UNIT_REF;
const COST = [1.0, 0.92, 1.05, 1.1];
const BUDGET = 12;        // ms Grafikzeit im Kampf, mit der 60 Bilder/s halten (Prozessor arbeitet parallel)
const BUDGET_ULTRA = 11;  // ULTRA höchstens so viel …
/** … und nur, wenn die Kampfszene die Bildwiederholrate des Bildschirms hält (120 Hz → ≈ 7 ms) */
export function ultraBudget(hz = 60) { return Math.min(BUDGET_ULTRA, 850 / Math.max(30, hz || 60)); }
// Ruhiger Flug kostet weniger als der Kampf, auf den das Modell abgeglichen ist (Hochrechnung im Flug)
const COMBAT_K = 2;
// Üblicher Messwert je Chip-Klasse: liegt die Messung über dem Doppelten, wird einmal nachgemessen
const UNIT_EXPECT = { strong: 0.4, good: 0.8, mid: 1.6, weak: 3.5 };

function readJSON(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function writeJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* privater Modus */ } }
export function qIndex(name) { return Q_INDEX[name] ?? null; }

// ---------------------------------------------------------------- Grafikchip

let gpuCache = null;
/** Grafikchip als Text (WEBGL_debug_renderer_info), plus WebGL2-Fähigkeit. Einmal je Seite. */
export function gpuInfo() {
  if (gpuCache) return gpuCache;
  let renderer = '', vendor = '', webgl2 = false, maxTex = 0;
  try {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2') || c.getContext('webgl');
    if (g) {
      webgl2 = typeof WebGL2RenderingContext !== 'undefined' && g instanceof WebGL2RenderingContext;
      const ext = g.getExtension('WEBGL_debug_renderer_info');
      renderer = String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER) || '');
      vendor = String(g.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : g.VENDOR) || '');
      maxTex = g.getParameter(g.MAX_TEXTURE_SIZE) || 0;
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* ohne WebGL */ }
  if (import.meta.env && import.meta.env.DEV) {
    const o = new URLSearchParams(location.search).get('gpu'); // nur Test: fremden Chip vortäuschen
    if (o) renderer = o;
  }
  gpuCache = { renderer, vendor, webgl2, maxTex, ...classifyGpu(renderer, vendor) };
  return gpuCache;
}

/**
 * Chip → Klasse und Höchststufe. tier: 'strong' | 'good' | 'mid' | 'weak' | 'soft' (Software-Grafik).
 * integrated: Grafik im Prozessor (Laptop-Schwachpunkt). cap: höchste sinnvolle Stufe (0..3).
 */
export function classifyGpu(renderer, vendor = '') {
  const r = String(renderer || '') + ' ' + String(vendor || '');
  const t = (tier, cap, integrated) => ({ tier, cap, integrated });
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(r)) return t('soft', 0, true);
  // Apple Silicon: alle stark, Grund-M1 eine Stufe vorsichtiger
  if (/Apple M\d+ (Pro|Max|Ultra)/i.test(r)) return t('strong', 3, true);
  if (/Apple M[2-9]/i.test(r)) return t('strong', 3, true);
  if (/Apple M1|Apple GPU/i.test(r)) return t('good', 3, true);
  // NVIDIA
  if (/RTX\s*(20|30|40|50)\d0|RTX\s*A\d|Quadro RTX|TITAN/i.test(r)) return t('strong', 3, false);
  if (/GTX\s*(16\d0|10[6-8]0)|RTX/i.test(r)) return t('good', 3, false);
  if (/GTX\s*(9\d0|10[3-5]0)/i.test(r)) return t('mid', 2, false);
  if (/MX\s*\d{3}|GT\s*\d{3,4}|GTX\s*[4-8]\d0|NVS|Quadro (K|M|P)\d{3,4}\b/i.test(r)) return t('weak', 1, false);
  // AMD (Prozessorgrafik zuerst: „Radeon(TM) Graphics“, „Vega 8 Graphics“ sind APUs, keine RX Vega 56/64)
  if (/Vega \d+ Graphics|Radeon\s*(\(TM\)\s*)?Graphics/i.test(r)) return t('weak', 1, true);
  if (/RX\s*(5[5-9]|6[5-9]|7[5-9])\d0|RX\s*[6-9]\d{3}|Radeon Pro (W|Vega)|RX Vega/i.test(r)) return t('strong', 3, false);
  if (/Radeon Pro\s*[5-6]\d{3}/i.test(r)) return t('good', 3, false);
  if (/Radeon Pro\s*[4-5]\d{2}/i.test(r)) return t('mid', 2, false);
  if (/RX\s*(4[7-9]|5[5-9]|5[0-4])\d|RX\s*5[0-9]{3}|RX\s*6[0-4]\d0/i.test(r)) return t('good', 3, false);
  if (/Radeon\s*(\(TM\)\s*)?(7[6-9]0M|8[0-9]0M)|Radeon 780M|Radeon 760M/i.test(r)) return t('mid', 2, true); // neuere Ryzen-APU
  if (/Radeon\s*(\(TM\)\s*)?(Graphics|Vega \d|R[2-7]\b|HD\s*[5-8]\d{3})|Vega \d+ Graphics|RX\s*(5[0-4]0|4[0-6]0)\b/i.test(r)) return t('weak', 1, true);
  // Intel
  if (/Arc\s*(A|B)\d|Arc\(TM\) (A|B)/i.test(r)) return t('good', 3, false);
  if (/Intel.*Arc|Arc\(TM\) Graphics/i.test(r)) return t('mid', 2, true); // Core Ultra (Meteor Lake) iGPU
  if (/Iris\s*(\(R\)\s*)?Xe/i.test(r)) return t('mid', 1, true);
  if (/Iris/i.test(r)) return t('weak', 1, true);
  if (/UHD|HD Graphics|Intel/i.test(r)) return t('weak', 0, true);
  // Unbekannt: Messung entscheidet, ULTRA nur mit sehr guter Messung
  return t('unknown', 3, false);
}

// ---------------------------------------------------------------- unsichtbare Messung

const PROBE_VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
// Stellvertretende Bildlast: Rauschen in Schleifen (wie Nebel/Felder) plus Texturzugriffe (wie Nachbearbeitung)
const PROBE_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform float uSeed;
in vec2 vUv; out vec4 o;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 p = vUv * 6.0 + uSeed; float a = 0.0, w = 0.5;
  for (int i = 0; i < 6; i++) { a += n(p) * w; p *= 2.03; w *= 0.5; }
  vec3 c = vec3(a);
  for (int i = 0; i < 6; i++) c += texture(uTex, vUv + vec2(float(i) * 0.003, a * 0.01)).rgb * 0.08;
  o = vec4(c * 0.5, 0.25);
}`;

// Kurz abgeben ohne die 4-ms-Mindestpause verschachtelter setTimeout-Aufrufe (sonst ruht die Grafikkarte zwischen
// den Läufen und taktet nicht hoch)
const sleep0 = () => new Promise((r) => {
  if (typeof MessageChannel === 'undefined') { setTimeout(r, 0); return; }
  const c = new MessageChannel();
  c.port1.onmessage = () => { c.port1.close(); r(); };
  c.port2.postMessage(0);
});

/**
 * Misst die Grafikleistung in ≈ 0,3–0,8 s auf einer unsichtbaren Leinwand. Liefert ms je Megapixel der Messszene
 * (kleiner = schneller) oder null, wenn nicht messbar.
 */
export async function measureGpu(maxMs = 800) {
  let gl = null, canvas = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360;
    gl = canvas.getContext('webgl2', { antialias: false, depth: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, PROBE_VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, PROBE_FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    // Rauschtextur 256² und ein HalfFloat-Ziel wie im Spiel (falls möglich)
    const tx = gl.createTexture();
    const data = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < data.length; i++) data[i] = (i * 2654435761) >>> 24;
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    let fb = null;
    if (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')) {
      const rt = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, rt);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, canvas.width, canvas.height);
      fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rt, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); fb = null; }
      gl.bindTexture(gl.TEXTURE_2D, tx);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); // additiv wie Effekte (kein Überspringen gleicher Pixel)
    const uSeed = gl.getUniformLocation(prog, 'uSeed');
    const px = new Uint8Array(4), fpx = new Float32Array(4);
    const sync = () => {
      if (fb) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, fpx);
      else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    };
    const frame = (k) => {
      const t = performance.now();
      for (let i = 0; i < k; i++) { gl.uniform1f(uSeed, i * 0.37); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      sync();
      return performance.now() - t;
    };
    const t0 = performance.now();
    // Aufwärmen (Grafiktakt hochfahren, Shader fertig) und Lastgröße so wählen, dass ein Messlauf ≥ 16 ms dauert:
    // erst dann fällt die feste Auslese-Wartezeit (≈ 0,3–1 ms, mehr, wenn nebenher eine Szene läuft) kaum ins
    // Gewicht. Mindestens 16 Zeichnungen je Lauf.
    let k = 16;
    frame(4);
    for (let i = 0; i < 12 && performance.now() - t0 < maxMs * 0.45; i++) {
      const ms = frame(k);
      await sleep0();
      if (ms >= 16 || k >= 8192) break;
      k = Math.min(8192, ms > 0.5 ? Math.ceil(k * Math.min(8, 19 / ms)) : k * 8);
    }
    // Messläufe. Median der drei besten statt Mittel aller: Störungen (andere Tabs, Hintergrundarbeit) machen
    // Läufe nur langsamer, nie schneller; drei statt einem glätten Taktsprünge der Grafikkarte.
    // Taktet die Grafikkarte erst während der Läufe hoch, werden sie kürzer: ein Lauf unter 14 ms zählt dann nicht,
    // die Last wächst nach (Zeit je Zeichnung statt je Lauf, damit Läufe mit verschiedener Last vergleichbar sind).
    const runs = [];
    let tries = 0;
    while (performance.now() - t0 < maxMs && runs.length < 14 && tries++ < 40) {
      const ms = frame(k);
      await sleep0();
      if (ms >= 14 || k >= 8192) runs.push(ms / k);
      else k = Math.min(8192, Math.ceil(k * 19 / Math.max(ms, 0.5)));
    }
    if (runs.length < 3) return null;
    const mpx = (canvas.width * canvas.height) / 1e6;
    const best = [...runs].sort((a, b) => a - b).slice(0, 3);
    let unit = best[1] / mpx; // Median der besten drei
    if (import.meta.env && import.meta.env.DEV) {
      const f = Number(new URLSearchParams(location.search).get('probeslow')); // nur Test: langsamen Chip vortäuschen
      if (f > 0) unit *= f;
    }
    return { unit, k, runs: runs.length, ms: performance.now() - t0, fb: !!fb };
  } catch { return null; } finally {
    try { gl && gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* egal */ }
  }
}

/**
 * Bildwiederholrate des Bildschirms aus dem Bildtakt (requestAnimationFrame), ≈ 0,1–0,3 s. Liefert Hz, gerundet
 * auf übliche Werte (60, 75, 90, 100, 120, 144, 165, …), oder 60, wenn nicht messbar (verstecktes Fenster).
 */
export function measureRefresh(maxMs = 250) {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function' || (typeof document !== 'undefined' && document.hidden)) { resolve(60); return; }
    const ts = [];
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      const d = [];
      for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
      if (d.length < 4) { resolve(60); return; }
      d.sort((a, b) => a - b);
      const hz = 1000 / d[Math.floor(d.length * 0.25)]; // unteres Quartil: verpasste Bilder ziehen nicht herunter
      const STEPS = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 175, 240];
      let best = 60;
      for (const s of STEPS) if (Math.abs(s - hz) < Math.abs(best - hz)) best = s;
      resolve(best);
    };
    const tick = (t) => {
      ts.push(t);
      if (ts.length >= 14 || performance.now() - t0 > maxMs) finish(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    setTimeout(finish, maxMs + 100); // rAF ruht (Hintergrund): nicht hängen bleiben
  });
}

/** Kurze Prozessor-Messung (≈ 15–40 ms): typische Arbeit des Grafikteils (Matrizen, Schleifen, Objekte). ms. */
export function measureCpu() {
  const t = performance.now();
  const a = new Float32Array(16), b = new Float32Array(16);
  for (let i = 0; i < 16; i++) { a[i] = i * 0.1; b[i] = 1 - i * 0.05; }
  let s = 0;
  const objs = [];
  for (let n = 0; n < 60000; n++) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let v = 0;
      for (let q = 0; q < 4; q++) v += a[i * 4 + q] * b[q * 4 + j];
      b[i * 4 + j] = v * 0.999 + 0.0001;
    }
    if ((n & 63) === 0) objs.push({ x: n, y: s });
    s += Math.sqrt(Math.abs(b[5])) + Math.sin(n * 0.001);
  }
  if (objs.length > 1e9) console.log(s);
  return performance.now() - t;
}
// Prozessor-Zeit der Messung auf dem Referenzrechner (Apple M5, Bestwert aus drei Läufen): ≈ 10 ms
const CPU_REF = 10;

/**
 * Stufe aus Chip, Messung und Fenstergröße. Vorhergesagte Grafikzeit je Stufe = Messwert × Kosten × Pixelzahl
 * (Fenster × Pixeldichte der Stufe); höchste Stufe, die ins Budget passt, begrenzt durch die Chip-Klasse.
 */
export function decideQuality(gpu, probe, cpuMs, w = window.innerWidth, h = window.innerHeight, dpr = window.devicePixelRatio || 1, hz = 60) {
  let cap = gpu.cap;
  const cores = navigator.hardwareConcurrency || 4;
  if (cores <= 4) cap = Math.min(cap, 2);
  const cpuK = cpuMs ? cpuMs / CPU_REF : 1;
  if (cpuK > 6) cap = Math.min(cap, 0); else if (cpuK > 3.5) cap = Math.min(cap, 1); else if (cpuK > 2.2) cap = Math.min(cap, 2);
  const pred = [0, 0, 0, 0];
  let q = cap;
  if (probe && probe.unit > 0) {
    for (let i = 0; i < 4; i++) {
      const pr = Math.min(dpr, PR_CAP[i]);
      pred[i] = probe.unit * (FIX + PX * COST[i] * (w * h * pr * pr) / 1e6);
    }
    let best = 0;
    const bu = ultraBudget(hz);
    for (let i = 3; i >= 0; i--) if (pred[i] <= (i === 3 ? bu : BUDGET)) { best = i; break; }
    // Untergrenze nach Chip-Klasse: eine gestörte Messung (Hintergrundlast) drückt starke Chips nicht unter HOCH
    const floor = gpu.tier === 'strong' ? 2 : gpu.tier === 'good' ? 1 : 0;
    q = Math.min(cap, Math.max(best, floor));
  } else {
    // Ohne Messung: Klasse allein, vorsichtig
    q = Math.min(cap, gpu.tier === 'strong' ? 3 : gpu.tier === 'good' ? 2 : gpu.tier === 'unknown' ? 2 : gpu.tier === 'mid' ? 1 : 0);
  }
  return { q, cap, pred: pred.map((v) => +v.toFixed(2)), cpuK: +cpuK.toFixed(2), hz };
}

// ---------------------------------------------------------------- Auto-Zustand

/** Gilt die gespeicherte Stufe als automatisch (keine eigene Wahl)? */
export function isAutoQuality() {
  const raw = readJSON(SET_KEY), qa = readJSON(AUTO_KEY);
  if (!raw || qIndex(raw.quality) === null) return true;
  if (raw.qualityAuto === true) return true;
  if (qa && qa.quality === raw.quality) return true;
  // Übergang: vor der automatischen Wahl gespeicherte Standardstufe (HOCH bzw. ULTRA) gilt nicht als eigene Wahl
  if (!qa && (raw.quality === 'high' || raw.quality === 'ultra')) return true;
  return false;
}

/** Automatisch gewählte Stufe festschreiben (Hub-Zwischenspeicher über apply aktualisieren). */
export function storeAutoQuality(name, info, apply) {
  try { if (apply) apply(name); } catch { /* Hub nicht geladen */ }
  const raw = readJSON(SET_KEY) || {};
  writeJSON(SET_KEY, { ...raw, quality: name, qualityAuto: true, rev: raw.rev ?? 2 });
  const qa = readJSON(AUTO_KEY) || {};
  writeJSON(AUTO_KEY, { ...qa, ...info, v: VERSION, quality: name });
}

/**
 * Beim Start: Stufe automatisch wählen, falls nötig (erster Start, anderer Grafikchip, Messung veraltet) und der
 * Spieler nicht selbst gewählt hat. apply(name) schreibt die Stufe über den Hub (Zwischenspeicher bleibt gleich).
 * Liefert { ran, quality, ... } (ran = false: nichts zu tun).
 */
export async function autoQuality(apply, force = false) {
  const gpu = gpuInfo();
  const qa = readJSON(AUTO_KEY);
  if (!force && !isAutoQuality()) return { ran: false, reason: 'eigene Wahl', gpu: gpu.renderer };
  if (!force && qa && qa.v === VERSION && qa.gpu === gpu.renderer && qIndex(qa.quality) !== null) {
    // schon entschieden: nur sicherstellen, dass ls.settings dazu passt (z. B. nach einer Senkung im Flug)
    const raw = readJSON(SET_KEY);
    if (!raw || raw.quality !== qa.quality) storeAutoQuality(qa.quality, {}, apply);
    return { ran: false, reason: 'bekannt', quality: qa.quality, gpu: gpu.renderer };
  }
  const t0 = performance.now();
  const cpuMs = Math.min(measureCpu(), measureCpu(), measureCpu());
  const hz = await measureRefresh();
  let probe = gpu.webgl2 ? await measureGpu(gpu.tier === 'soft' ? 300 : 800) : null;
  // Messung deutlich langsamer als für die Chip-Klasse üblich (Hintergrundlast, Grafiktakt noch unten): einmal
  // nachmessen, der schnellere Wert zählt
  const exp = UNIT_EXPECT[gpu.tier];
  if (probe && exp && probe.unit > exp * 2) {
    await new Promise((r) => setTimeout(r, 120));
    const again = await measureGpu(600);
    if (again && again.unit < probe.unit) probe = { ...again, retried: true }; else probe.retried = true;
  }
  const d = decideQuality(gpu, probe, cpuMs, undefined, undefined, undefined, hz);
  const name = Q_NAMES[d.q];
  storeAutoQuality(name, {
    gpu: gpu.renderer, tier: gpu.tier, integrated: gpu.integrated, unit: probe ? +probe.unit.toFixed(3) : null,
    cpuK: d.cpuK, pred: d.pred, cap: d.cap, hz, at: Date.now(), lowered: 0, raised: 0,
  }, apply);
  return { ran: true, quality: name, gpu: gpu.renderer, tier: gpu.tier, probe, cpuMs: +cpuMs.toFixed(1), ...d, ms: Math.round(performance.now() - t0) };
}

/**
 * Hinweise für den Renderer aus der letzten Erkennung: Chip-Klasse (Untergrenze der adaptiven Auflösung,
 * Nachleuchten in halber Auflösung) und vorhergesagte Grafikzeit je Stufe (Start-Auflösung, statt erst
 * einige Sekunden ruckelnd herunterzuregeln).
 */
export function renderHints() {
  const qa = readJSON(AUTO_KEY);
  let tier = qa && qa.tier;
  if (!tier) { try { tier = gpuInfo().tier; } catch { tier = 'unknown'; } }
  const weak = tier === 'weak' || tier === 'soft' || (tier === 'mid' && !!(qa && qa.integrated));
  // budget für die Start-Auflösung: Vorhersage gilt für den Kampf, der Start ist ruhig
  return { tier, weak, pred: (qa && Array.isArray(qa.pred)) ? qa.pred : null, budget: BUDGET * 1.35 };
}

/** Darf die Absicherung die automatische Stufe einmalig anheben? Liefert die Obergrenze (0..3) oder -1. */
export function raiseCap() {
  if (!isAutoQuality()) return -1;
  const qa = readJSON(AUTO_KEY);
  if (!qa || qa.v !== VERSION || qa.lowered || qa.raised) return -1;
  return typeof qa.cap === 'number' ? qa.cap : -1;
}

// ---------------------------------------------------------------- Absicherung im Flug

/**
 * Fällt die Bildrate dauerhaft unter 50 (6 Sekundenfenster in Folge, adaptive Auflösung schon am Boden), wird die
 * Stufe um eins gesenkt. Bremst klar der Prozessor (renderer.cpuBound: Grafikkarte hat viel Luft), wird nicht erst
 * auf den Boden der Auflösung gewartet – die regelt dann ohnehin nicht herunter, weil das nur unscharf macht.
 * Wartet nach Start, Sektorwechsel und jeder Senkung, zählt nicht im Dock, beim Sprung oder bei verstecktem Tab.
 * Gedrosselte Browser (Energiesparmodus, fest 30 Bilder/s bei wenig Last) werden erkannt und nicht bestraft.
 *
 * Einmal anheben (nur automatische Wahl, nie nach einer Senkung): Die Messung beim Start kann auf mittleren oder
 * unbekannten Chips zu niedrig ausfallen. Liegt die echte Grafikzeit im Flug (GPU-Zeitmessung, volle Auflösung,
 * ≥ 55 Bilder/s) 20 Sekundenfenster lang unter 40 % des Bildbudgets und passt die nächste Stufe hochgerechnet
 * (Verhältnis der Vorhersagen mal Kampffaktor) ins Budget, eine Stufe höher – danach nie wieder.
 */
const RAISE_WINDOWS = 20;
export class QualityGuard {
  constructor(onLower, onRaise = null, raiseTo = -1) {
    this.onLower = onLower;  // (fromIndex, toIndex, fps) => void
    this.onRaise = onRaise;  // (fromIndex, toIndex) => void
    this.raiseTo = raiseTo;  // höchste Stufe fürs einmalige Anheben (-1 = aus)
    this.frames = 0; this.acc = 0; this.work = 0;
    this.bad = 0; this.wait = 6; // s Wartezeit am Anfang
    this.good = 0; this.gpuMax = 0;
    this.fps = 0;
    this.lowered = 0;
  }

  hold(sec = 6) { this.wait = Math.max(this.wait, sec); this.bad = 0; this.good = 0; this.gpuMax = 0; this.frames = 0; this.acc = 0; this.work = 0; }

  /** jedes Bild: dt (s), Arbeitszeit des Bildes (ms, Prozessor), renderer, world */
  frame(dt, workMs, renderer, world) {
    if (!renderer || (typeof document !== 'undefined' && document.hidden) || dt > 0.25) { this.frames = 0; this.acc = 0; this.work = 0; return; }
    if (world && (world.docked || world.jump || world.playerDead)) { this.hold(3); return; }
    if (this.wait > 0) { this.wait -= dt; return; }
    this.frames++; this.acc += dt; this.work += workMs;
    if (this.acc < 1) return;
    const fps = this.frames / this.acc;
    const work = this.work / this.frames;
    this.fps = fps;
    this.frames = 0; this.acc = 0; this.work = 0;
    const T = renderer.gpuTimer;
    const gpu = T && T.ok && T.samples > 20 ? T.gpu : null;
    // Gedrosselt statt überlastet: Bildrate klebt bei ≈ 30, Prozessor und Grafik haben viel Luft
    const throttled = fps > 28 && fps < 32 && work < 10 && (gpu === null ? true : gpu < 14);
    if (fps < 50 && !throttled) this.bad++; else this.bad = 0;
    const floor = typeof renderer.atFloor === 'function' ? renderer.atFloor() : true;
    if (this.bad >= 6 && (floor || renderer.cpuBound || this.bad >= 12)) {
      const from = renderer.quality;
      if (from > 0) {
        this.lowered++;
        this.raiseTo = -1;
        this.onLower(from, from - 1, fps);
        this.hold(12); // Neuaufbau und Einschwingen abwarten
      } else this.bad = 0;
      return;
    }
    this._raise(fps, gpu, renderer);
  }

  _raise(fps, gpu, renderer) {
    const q = renderer.quality;
    if (!this.onRaise || this.lowered || this.raiseTo <= q || gpu === null) { this.good = 0; return; }
    const P = renderer._perf || {};
    const frameBudget = 1000 / Math.max(60, Math.min(144, P.best || 60));
    const ok = fps >= 55 && renderer.scale >= 0.999 && !renderer.lowQuality && gpu < frameBudget * 0.4;
    if (!ok) { this.good = 0; this.gpuMax = 0; return; }
    this.gpuMax = Math.max(this.gpuMax, gpu);
    if (++this.good < RAISE_WINDOWS) return;
    const next = q + 1;
    const pred = renderer.hints && renderer.hints.pred;
    const ratio = pred && pred[q] > 0 && pred[next] > 0 ? pred[next] / pred[q] : 1.8;
    // Flugzeit ist meist ruhig: mit Kampffaktor hochrechnen und gegen das Budget der Startwahl prüfen
    const est = this.gpuMax * ratio * COMBAT_K;
    const lim = next === 3 ? ultraBudget(1000 / frameBudget) : BUDGET;
    this.good = 0; this.gpuMax = 0;
    if (est > lim) { this.raiseTo = -1; return; } // passt nicht: nicht weiter prüfen
    this.raiseTo = -1;
    this.onRaise(q, next);
    this.hold(12);
  }
}
