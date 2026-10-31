// Kleine Anzeige-Bausteine für das HUD. Alle schreiben nur ins DOM, wenn sich der sichtbare Wert ändert.

const NF = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
export function fmt(n) { return NF.format(Math.round(n || 0)); }
export const clamp01 = (v) => (v > 1 ? 1 : v < 0 || !(v === v) ? 0 : v);

export class TextSlot {
  constructor(node) { this.node = node; this.v = undefined; }
  set(v) { if (v !== this.v) { this.v = v; this.node.textContent = v; } }
  reset() { this.v = undefined; }
}

export class ClassSlot {
  constructor(node, cls) { this.node = node; this.cls = cls; this.v = undefined; }
  set(on) { on = !!on; if (on !== this.v) { this.v = on; this.node.classList.toggle(this.cls, on); } }
  reset() { this.v = undefined; }
}

/** Zahl, die weich zum Zielwert hochzählt (statt zu springen). */
export class Counter {
  constructor(node, format = fmt, rate = 14) {
    this.node = node; this.f = format; this.rate = rate;
    this.shown = NaN; this.target = 0; this.w = NaN;
  }
  set(target, dt) {
    target = target || 0;
    this.target = target;
    if (!(this.shown === this.shown)) this.shown = target;
    else {
      const d = target - this.shown;
      if (d > -0.5 && d < 0.5) this.shown = target;
      else this.shown += d * Math.min(1, dt * this.rate);
    }
    const r = Math.round(this.shown);
    if (r !== this.w) { this.w = r; this.node.textContent = this.f(r); }
  }
  snap() { this.shown = NaN; this.w = NaN; }
}

/**
 * Segmentierter Balken (.ls-bar) mit nachlaufender roter Schadensspur.
 * Spur bleibt kurz stehen, läuft dann zum aktuellen Wert nach.
 */
export class Bar {
  constructor(node, steps = 400) {
    this.node = node; this.steps = steps;
    this.q = -1; this.tq = -1;
    this.trail = 1; this.hold = 0; this.v = 1;
    this.first = true;
  }
  set(frac, dt) {
    frac = clamp01(frac);
    if (this.first) { this.first = false; this.trail = frac; }
    if (frac < this.v - 0.0005) this.hold = 0.45;         // neuer Treffer: Spur hält kurz
    this.v = frac;
    if (frac >= this.trail) { this.trail = frac; this.hold = 0; }
    else if (this.hold > 0) this.hold -= dt;
    else { this.trail -= dt * 0.65; if (this.trail < frac) this.trail = frac; }
    const q = Math.round(frac * this.steps);
    if (q !== this.q) { this.q = q; this.node.style.setProperty('--v', String(q / this.steps)); }
    const tq = Math.round(this.trail * this.steps);
    if (tq !== this.tq) { this.tq = tq; this.node.style.setProperty('--trail', String(tq / this.steps)); }
  }
  reset() { this.first = true; this.q = -1; this.tq = -1; }
}

/** Balken + Wert + Maximum, z. B. „1.840 / 2.000“. */
export class Gauge {
  constructor(root) {
    this.bar = new Bar(root.querySelector('.ls-bar'));
    const v = root.querySelector('[data-g="v"]');
    const m = root.querySelector('[data-g="m"]');
    this.val = v ? new Counter(v) : null;
    this.max = m ? new TextSlot(m) : null;
    this.mv = NaN;
  }
  set(v, max, dt) {
    v = v > 0 ? v : 0;
    this.bar.set(max > 0 ? v / max : 0, dt);
    if (this.val) this.val.set(v, dt);
    if (this.max) { const mr = Math.round(max || 0); if (mr !== this.mv) { this.mv = mr; this.max.set(fmt(mr)); } }
  }
  reset() { this.bar.reset(); if (this.val) this.val.snap(); this.mv = NaN; if (this.max) this.max.reset(); }
}

/** Abklingzeit als Umlauf am eckigen Slot-Rand (Anschnitt wie der Slot), frac = geladener Anteil. */
export class EdgeProgress {
  constructor(path) { this.p = path; this.q = -1; }
  set(frac) {
    const q = Math.round(clamp01(frac) * 100);
    if (q !== this.q) { this.q = q; this.p.style.strokeDashoffset = String(100 - q); }
  }
}
export const EDGE_SVG = '<svg class="wp-edge" viewBox="0 0 64 78" preserveAspectRatio="none" aria-hidden="true">'
  + '<path class="tr" pathLength="100" d="M6 1 H63 V72 L57 77 H1 V6 Z"/>'
  + '<path class="pr" pathLength="100" d="M6 1 H63 V72 L57 77 H1 V6 Z"/></svg>';

/** Gauge-Markup: Kopfzeile mit Label und Wert, darunter der Balken. */
export function gaugeHtml(r, label, cls = '', extra = '') {
  return `<div class="hg-gauge ${cls}" data-r="${r}">
    <div class="hg-row"><span class="ls-label">${label}</span>${extra}<span class="hg-sp"></span><span class="hg-num num-only"><b class="ls-num" data-g="v">0</b><i>/</i><span class="ls-num" data-g="m">0</span></span></div>
    <div class="ls-bar"></div>
  </div>`;
}
