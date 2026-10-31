// Prozedurale Texturen (Canvas). Alles wird einmal erzeugt und zwischengespeichert.
import * as THREE from 'three';

const cache = new Map();

function cached(key, make) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

export function disposeTextures() {
  cache.forEach((t) => t.dispose());
  cache.clear();
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// ---------- Rauschen (deterministisch, ohne Speicher pro Aufruf) ----------
function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function vnoise(x, y, seed, period) {
  let ix = Math.floor(x); const iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let ix1 = ix + 1;
  if (period) { ix = ((ix % period) + period) % period; ix1 = ((ix1 % period) + period) % period; }
  const a = hash(ix, iy, seed), b = hash(ix1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, seed, oct = 5, period = 0) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17, period ? period * f : 0);
    n += amp; amp *= 0.5; f *= 2;
  }
  return s / n;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// kleine deterministische Zufallsfolge
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- einfache Formen ----------

// weicher runder Lichtpunkt (für Sprites, Triebwerke, Mündungen)
export function getGlowTexture() {
  return cached('glow', () => {
    const c = makeCanvas(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.12, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return toTexture(c);
  });
}

// Lichtring (Schockwelle, Sprungladung)
export function getRingTexture() {
  return cached('ring', () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S * 2 - 1, dy = (y + 0.5) / S * 2 - 1;
      const r = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.exp(-Math.pow((r - 0.88) / 0.035, 2)) + Math.exp(-Math.pow((r - 0.84) / 0.09, 2)) * 0.25;
      const inner = r < 0.86 ? Math.pow(r / 0.86, 6) * 0.12 : 0;
      const a = Math.min(1, ring + inner) * (r < 1 ? 1 : 0);
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

// Triebwerksschweif: hell an der Düse, läuft nach hinten weich aus
export function getTrailTexture() {
  return cached('trail', () => {
    const W = 32, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = y / (H - 1); // 0 oben (Düse) .. 1 unten (Ende)
      const u = Math.abs((x + 0.5) / W * 2 - 1);
      const along = Math.pow(1 - v, 1.6);
      const across = Math.pow(Math.max(0, 1 - u), 1.8);
      const a = along * across;
      const i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c);
    t.flipY = false;
    return t;
  });
}

// Nebelwolke (Graustufen + Alpha), wird per Material getönt
export function getNebulaTexture(variant) {
  return cached('nebula' + variant, () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
    const img = g.createImageData(S, S), d = img.data;
    const seed = 101 + variant * 31;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const dx = u - 0.5, dy = v - 0.5;
      const r = Math.sqrt(dx * dx + dy * dy) * 2;
      const wx = fbm(u * 3, v * 3, seed, 3), wy = fbm(u * 3 + 5.2, v * 3 + 1.3, seed + 7, 3);
      const n = fbm(u * 4 + wx * 1.8, v * 4 + wy * 1.8, seed + 3, 5);
      const det = fbm(u * 9 + wy, v * 9 + wx, seed + 11, 3);
      let mask = Math.max(0, 1 - r); mask = mask * mask * (3 - 2 * mask);
      const den = Math.max(0, Math.min(1, (n - 0.38) * 2.6)) * mask;
      const i = (y * S + x) * 4;
      const b = 150 + 105 * det;
      d[i] = b; d[i + 1] = b; d[i + 2] = b; d[i + 3] = Math.pow(den, 1.3) * 255;
    }
    g.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

function hexToRgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }

// Planet: Streifen (Gasriese) oder fleckige Eiswelt
export function getPlanetTexture(color, bands, seed = 7) {
  return cached(`planet:${color}:${bands}:${seed}`, () => {
    const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const [r0, g0, b0] = hexToRgb(color);
    for (let y = 0; y < H; y++) {
      const lat = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        let k;
        if (bands) {
          const turb = fbm(u * 8, lat * 10, seed, 4, 8);
          const band = Math.sin(lat * Math.PI * 16 + turb * 3.2 + Math.sin(lat * 40) * 0.4);
          const fine = fbm(u * 3, lat * 60, seed + 5, 3, 3);
          k = 0.72 + band * 0.18 + (fine - 0.5) * 0.35;
        } else {
          const n = fbm(u * 6, lat * 6, seed, 5, 6);
          const cr = fbm(u * 18, lat * 18, seed + 9, 3, 18);
          k = 0.55 + (n - 0.5) * 0.9 + (cr > 0.62 ? 0.35 : 0);
        }
        const pole = Math.pow(Math.abs(lat - 0.5) * 2, 6) * 0.25;
        k = Math.max(0.15, Math.min(1.35, k + pole));
        const i = (y * W + x) * 4;
        d[i] = Math.min(255, r0 * k); d[i + 1] = Math.min(255, g0 * k); d[i + 2] = Math.min(255, b0 * k * 0.98); d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  });
}

export function getMoonTexture(color) {
  return cached('moon:' + color, () => {
    const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const [r0, g0, b0] = hexToRgb(color);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = fbm(u * 8, v * 8, 77, 5, 8);
      const cr = fbm(u * 22, v * 22, 91, 2, 22);
      const k = 0.6 + (n - 0.5) * 0.8 - (cr > 0.66 ? 0.25 : 0);
      const i = (y * W + x) * 4;
      d[i] = r0 * k; d[i + 1] = g0 * k; d[i + 2] = b0 * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = toTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

// Planetenringe: radiale Streifen (u = innen..außen)
export function getPlanetRingTexture(color) {
  return cached('pring:' + color, () => {
    const W = 512, H = 4, c = makeCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const [r0, g0, b0] = hexToRgb(color);
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const n = fbm(u * 40, 0.5, 33, 4);
      const gap = (u > 0.55 && u < 0.6) ? 0.1 : 1;
      const edge = Math.min(1, u * 8) * Math.min(1, (1 - u) * 6);
      const a = Math.max(0, (n - 0.25) * 1.6) * gap * edge;
      const k = 0.75 + n * 0.4;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        d[i] = Math.min(255, r0 * k); d[i + 1] = Math.min(255, g0 * k); d[i + 2] = Math.min(255, b0 * k); d[i + 3] = a * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

// Umgebung für Spiegelungen (equirect), getönt nach Nebel + helle Sonne
export function makeEnvCanvasTexture(nebulaHex, sunDir) {
  const W = 128, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  const [nr, ng, nb] = hexToRgb(nebulaHex);
  for (let y = 0; y < H; y++) {
    const v = 1 - (y + 0.5) / H;
    const theta = (v - 0.5) * Math.PI;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const phi = (u - 0.5) * Math.PI * 2;
      const dx = Math.cos(theta) * Math.cos(phi), dy = Math.sin(theta), dz = Math.cos(theta) * Math.sin(phi);
      const s = Math.max(0, dx * sunDir.x + dy * sunDir.y + dz * sunDir.z);
      const sun = Math.pow(s, 60) * 255 + Math.pow(s, 6) * 60;
      const sky = 18 + Math.max(0, dy) * 40;
      const neb = fbm(u * 5, v * 5, 5, 4, 5) * 1.2;
      const i = (y * W + x) * 4;
      d[i] = Math.min(255, sky * 0.5 + nr * neb + sun);
      d[i + 1] = Math.min(255, sky * 0.55 + ng * neb + sun * 0.95);
      d[i + 2] = Math.min(255, sky * 0.7 + nb * neb + sun * 0.85);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}
