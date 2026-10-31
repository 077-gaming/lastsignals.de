// Deterministischer Zufall (mulberry32). Gleicher Seed = gleicher Ablauf, auch auf dem Server.

export class Rng {
  constructor(seed = 1) { this.seed(seed); }
  seed(s) { this.s = (s >>> 0) || 0x9e3779b9; }
  /** Zahl in [0, 1) */
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Kommazahl in [a, b) */
  range(a, b) { return a + (b - a) * this.next(); }
  /** Ganzzahl in [a, b] */
  int(a, b) { return a + Math.floor((b - a + 1) * this.next()); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

/** Einfacher 32-Bit-Hash (FNV-1a) für Seeds aus Text. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
