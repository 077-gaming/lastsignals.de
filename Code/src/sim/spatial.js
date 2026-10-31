// Räumliches Raster (spatial hash) für schnelle Nachbarsuche.
// Feste Zellen über die ganze Karte, verkettete Listen in Typed Arrays: pro Schritt keine Speicher-Neuanlage.

export class SpatialHash {
  constructor(size = 2400, cell = 200, capacity = 256) {
    this.reset(size, cell, capacity);
  }

  /** Neu aufbauen (nur bei Sektorwechsel). */
  reset(size, cell = this.cell || 200, capacity = this.items ? this.items.length : 256) {
    this.cell = cell;
    this.min = -(size + 1200);
    this.dim = Math.ceil((2 * (size + 1200)) / cell);
    this.head = new Int32Array(this.dim * this.dim).fill(-1);
    this.next = new Int32Array(capacity);
    this.items = new Array(capacity).fill(null);
    this.count = 0;
  }

  clear() {
    this.head.fill(-1);
    for (let i = 0; i < this.count; i++) this.items[i] = null;
    this.count = 0;
  }

  _cell(v) {
    let c = Math.floor((v - this.min) / this.cell);
    if (c < 0) c = 0; else if (c >= this.dim) c = this.dim - 1;
    return c;
  }

  insert(ent) {
    if (this.count >= this.items.length) this._grow();
    const idx = this.count++;
    this.items[idx] = ent;
    const c = this._cell(ent.x) * this.dim + this._cell(ent.z);
    this.next[idx] = this.head[c];
    this.head[c] = idx;
  }

  _grow() {
    const cap = this.items.length * 2;
    const next = new Int32Array(cap);
    next.set(this.next);
    this.next = next;
    for (let i = this.items.length; i < cap; i++) this.items.push(null);
  }

  /**
   * Alle Einträge im Kreis (x, z, r) in `out` schreiben (out wird geleert und wiederverwendet).
   * @returns Anzahl Treffer
   */
  query(x, z, r, out) {
    out.length = 0;
    const r2 = r * r;
    const cx0 = this._cell(x - r), cx1 = this._cell(x + r);
    const cz0 = this._cell(z - r), cz1 = this._cell(z + r);
    for (let cx = cx0; cx <= cx1; cx++) {
      const row = cx * this.dim;
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let i = this.head[row + cz]; i !== -1; i = this.next[i]) {
          const e = this.items[i];
          const dx = e.x - x, dz = e.z - z;
          if (dx * dx + dz * dz <= r2) out.push(e);
        }
      }
    }
    return out.length;
  }
}
