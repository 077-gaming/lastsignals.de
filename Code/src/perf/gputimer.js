// Grafikkarten-Zeit pro Bild über EXT_disjoint_timer_query_webgl2 (falls vorhanden).
// Eine Abfrage je Bild (nicht verschachtelt), Ergebnisse kommen 1–3 Bilder später an. Kleiner Pool, keine
// Speicher-Neuanlage pro Bild. Gleitender Mittelwert (ms) in `gpu`, letzter Einzelwert in `last`.
export class GpuTimer {
  constructor(gl) {
    this.gl = gl;
    this.ext = null;
    try { this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2'); } catch { this.ext = null; }
    this.ok = !!this.ext;
    this.pool = [];
    this.busy = [];
    this.active = null;
    this.gpu = 0;
    this.last = 0;
    this.samples = 0;
  }

  begin() {
    if (!this.ok || this.active) return;
    this._collect();
    if (this.busy.length > 6) return; // Treiber hängt hinterher: dieses Bild nicht messen
    const gl = this.gl;
    const q = this.pool.pop() || gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.busy.push(this.active);
    this.active = null;
  }

  _collect() {
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.busy.length) {
      const q = this.busy[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.busy.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
      this.pool.push(q);
      if (disjoint) continue;
      const ms = ns / 1e6;
      if (!(ms >= 0) || ms > 500) continue;
      this.last = ms;
      this.gpu = this.samples ? this.gpu + (ms - this.gpu) * 0.08 : ms;
      this.samples++;
    }
  }

  dispose() {
    const gl = this.gl;
    if (this.active) { try { gl.endQuery(this.ext.TIME_ELAPSED_EXT); } catch { /* egal */ } }
    for (const q of this.pool.concat(this.busy)) { try { gl.deleteQuery(q); } catch { /* egal */ } }
    this.pool.length = 0; this.busy.length = 0; this.active = null;
  }
}
