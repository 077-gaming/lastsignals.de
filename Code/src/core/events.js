// Kleiner Ereignis-Bus: Simulation meldet, Grafik und Oberfläche hören zu.
export class Bus {
  constructor() { this.handlers = new Map(); }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this.handlers.get(type)?.delete(fn); }
  // Schnappschuss der Zuhörer (wer während des Aufrufs neu dazukommt, hört erst das nächste Ereignis).
  // Ein fehlerhafter Zuhörer darf die anderen nicht blockieren: Fehler werden einzeln protokolliert.
  emit(type, payload) {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) { try { fn(payload); } catch (err) { console.error(`Fehler im Ereignis "${type}"`, err); } }
    const all = this.handlers.get('*');
    if (all) for (const fn of [...all]) { try { fn(type, payload); } catch (err) { console.error('Fehler im Ereignis-Zuhörer *', err); } }
  }
}
