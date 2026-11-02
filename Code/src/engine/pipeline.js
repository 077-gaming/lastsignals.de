// Nachbearbeitungskette aus Bausteinen. Jeder Baustein gehört zu einer Stufe; die Kette ordnet sie fest:
//   render → ao → cockpit → bloom → look → aa → upscale
//   (Szene → Umgebungsverdeckung → Cockpit-Ebene → Nachleuchten → Kamera-Look/Tonwerte → Kantenglättung →
//    Hochskalierung/Schärfen)
// Ein Baustein ist { id, stage, pass, label, active(state) → bool, apply?(state) }. update(state) schaltet die
// Durchgänge des EffectComposers ein oder aus (three ordnet renderToScreen dem letzten aktiven zu) und reicht die
// Werte weiter. Neue Verbesserungen (z. B. Bewegungsunschärfe, Tiefenschärfe, TAA) kommen als weiterer Baustein mit
// eigener Stufe dazu – STAGES ergänzen, Baustein mit add() einhängen, Schalter in settings.js.

export const STAGES = ['render', 'ao', 'cockpit', 'bloom', 'look', 'aa', 'upscale'];

export class PostChain {
  constructor(composer) {
    this.composer = composer;
    this.blocks = [];
    this.active = [];   // ids der zuletzt aktiven Bausteine (Reihenfolge der Kette)
  }

  /** Baustein einhängen: Durchgang an der Stelle seiner Stufe in den Composer setzen */
  add(block) {
    const si = STAGES.indexOf(block.stage);
    if (si < 0) throw new Error('Unbekannte Stufe: ' + block.stage);
    let at = this.blocks.length;
    for (let i = 0; i < this.blocks.length; i++) if (STAGES.indexOf(this.blocks[i].stage) > si) { at = i; break; }
    this.blocks.splice(at, 0, block);
    const C = this.composer;
    C.passes.splice(at, 0, block.pass);
    if (block.pass.setSize) block.pass.setSize(C._width * C._pixelRatio, C._height * C._pixelRatio);
    return block;
  }

  get(id) { return this.blocks.find((b) => b.id === id) || null; }

  /** Ein-/Ausschalten und Werte anwenden. Liefert true, wenn mehr als die Szene selbst läuft. */
  update(state) {
    const on = [];
    for (const b of this.blocks) {
      const a = !!b.active(state);
      b.pass.enabled = a;
      if (a) { if (b.apply) b.apply(state); on.push(b.id); }
    }
    this.active = on;
    return on.length > 1;
  }

  /** Kurzform für Anzeigen: SZENE › AO › LOOK › SMAA */
  describe() { return this.active.map((id) => (this.get(id)?.label || id)).join(' › '); }

  dispose() { for (const b of this.blocks) { try { b.pass.dispose?.(); } catch { /* egal */ } } this.blocks.length = 0; }
}
