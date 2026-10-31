// Fenster-System für das Flug-HUD: verschieben über die Kopfleiste, Einrasten (8 px) an Rändern
// und anderen Fenstern, Zuklappen, Ein- und Ausblenden (Fensterleiste oben, [×], Shift+Zahl),
// Anzeige-Modus (Balken/Werte), Sperren, Speichern in localStorage.
// Positionen werden relativ zur nächsten Bildschirmkante gespeichert, damit sie Größenänderungen überstehen.
// Ausgeblendete Fenster behalten Position, Klappzustand und Andock-Bezug und erscheinen wieder an derselben Stelle.
// Die Fensterleiste oben mittig ist ein festes Hindernis: Fenster rasten unterhalb ein.

const KEY = 'ls.hud.layout.5'; // .5: Schnellleiste (quick) statt Waffen, Schiff darüber; neue Konsole unten mittig
const OLD_KEY = 'ls.hud.layout.4'; // Vorgänger: alles übernehmen außer Schiff und Waffen (Konsole neu aufgebaut)
const SNAP = 8;      // Einrast-Abstand in px
const MARGIN = 12;   // Abstand zum Bildschirmrand beim Einrasten
const GAP = 8;       // Abstand zwischen Fenstern beim Andocken

function readStore() {
  try {
    let v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v) {
      v = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
      if (v && v.win) { delete v.win.ship; delete v.win.weapons; } // Konsole neu: Schiff über der Schnellleiste
    }
    return v && typeof v === 'object' && v.v === 1 ? v : null;
  } catch { return null; }
}

export class HudWindows {
  /**
   * @param {HTMLElement} layer Elternelement aller Fenster
   * @param {Array} defs [{ id, el, ax, ay, ox, oy, after, mode, toggle }]
   * @param {Function} onChange (id, win) bei Modus-, Klapp- oder Sichtbarkeitswechsel
   * @param {HTMLElement} [bar] feste Leiste oben, unter der Fenster einrasten
   */
  constructor(layer, defs, onChange, bar) {
    this.layer = layer;
    this.onChange = onChange || null;
    this.bar = bar || null;
    // Leistenfläche in Bildschirmkoordinaten (für Einrasten und für hud-mid als Verdeckung)
    this.barBox = { id: '_bar', placed: false, x: 0, y: 0, w: 0, h: 0 };
    this.wins = [];
    this.byId = new Map();
    const saved = readStore();
    this.locked = !!(saved && saved.locked);
    for (const d of defs) {
      const s = saved && saved.win && saved.win[d.id];
      const w = {
        id: d.id, el: d.el, def: d,
        head: d.el.querySelector('.hw-head'),
        // dock: Fenster, an dessen Unterkante dieses eingerastet ist (folgt dessen Höhe); undefined = noch nicht ermittelt
        saved: s && typeof s.ox === 'number' ? { ax: s.ax, ay: s.ay, ox: s.ox, oy: s.oy, dock: s.dock } : null,
        collapsed: !!(s && s.collapsed),
        hidden: !!(s && s.hidden),
        num: s && s.mode ? s.mode === 'num' : d.mode !== 'bar',
        x: 0, y: 0, w: 0, h: 0,
      };
      this.wins.push(w);
      this.byId.set(d.id, w);
      this._applyClasses(w);
    }
    this.layer.classList.toggle('hd-locked', this.locked);
    /** Fenster plus Leiste: alles, worunter hud-mid nichts zeichnet (feste Liste, keine Neuanlage pro Bild). */
    this.occluders = this.wins.concat([this.barBox]);

    this._drag = null;
    this._others = [];
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    this._onClick = (e) => this._click(e);
    layer.addEventListener('pointerdown', this._onDown);
    layer.addEventListener('click', this._onClick);
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this._onResize = () => this.layout();
    window.addEventListener('resize', this._onResize);
    // Größe ändert sich durch Inhalt, Zuklappen oder erstes Sichtbarwerden: neu setzen (nicht pro Bild)
    this._ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!this._drag) this.layout(); }) : null;
    if (this._ro) for (const w of this.wins) this._ro.observe(w.el);
  }

  get(id) { return this.byId.get(id); }
  isCollapsed(id) { const w = this.byId.get(id); return !!(w && w.collapsed); }

  /** Vom Spieler zugeklappt oder aufgeklappt (Menü), Kopfleiste bleibt an ihrem Platz. */
  setCollapsed(id, on) {
    const w = this.byId.get(id);
    if (!w || w.collapsed === !!on) return;
    this._setCollapsed(w, !!on);
    if (this.onChange) this.onChange(w.id, w);
    this._save();
  }

  /** Leerzustand: Fenster zeigt nur die Kopfleiste (wird nicht gespeichert). Größe meldet der ResizeObserver. */
  setVoid(id, on) {
    const w = this.byId.get(id);
    if (!w || w.void === !!on) return;
    w.void = !!on;
    w.el.classList.toggle('is-void', w.void);
  }
  isNum(id) { const w = this.byId.get(id); return !!(w && w.num); }
  isHidden(id) { const w = this.byId.get(id); return !!(w && w.hidden); }

  /**
   * Fenster ein- oder ausblenden. Beim Ausblenden wird die aktuelle Stelle (Anker + Andock-Bezug) gemerkt,
   * Fenster, die daran hängen, bleiben stehen und hängen sich beim Wiedereinblenden wieder an.
   */
  setHidden(id, on) {
    const w = this.byId.get(id);
    on = !!on;
    if (!w || w.hidden === on) return;
    if (on && w.placed && w.w) {
      this._freezeDependents(w, true);
      // Standardlagen, die aus der Größe anderer Fenster berechnet werden (Schiff neben Waffen), festhalten
      for (const o of this.wins) if (o !== w && !o.saved && (typeof o.def.ox === 'function' || typeof o.def.oy === 'function') && o.placed && o.w) o.saved = this._anchorFor(o);
      for (const o of this.wins) {
        if (o === w || !o.saved || o.saved.dock !== w.id || !o.placed || !o.w) continue;
        o.saved = Object.assign(this._anchorFor(o), { dock: w.id });
      }
      const dock = w.saved && w.saved.dock !== undefined ? w.saved.dock : this._dockOf(w);
      w.saved = Object.assign(this._anchorFor(w), { dock: dock === undefined ? null : dock });
    }
    w.hidden = on;
    this._applyClasses(w);
    w.placed = false;
    if (on) { w.w = 0; w.h = 0; }
    this.layout();
    if (this.onChange) this.onChange(w.id, w);
    this._save();
  }

  toggleHidden(id) { this.setHidden(id, !this.isHidden(id)); }

  setLocked(on) {
    this.locked = !!on;
    this.layer.classList.toggle('hd-locked', this.locked);
    this._save();
  }

  setAllModes(num) {
    for (const w of this.wins) {
      if (!w.def.toggle) continue;
      w.num = !!num;
      this._applyClasses(w);
      if (this.onChange) this.onChange(w.id, w);
    }
    this._save();
  }

  reset() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch { /* privater Modus */ }
    for (const w of this.wins) {
      w.saved = null;
      w.collapsed = false;
      w.hidden = false;
      w.placed = false;
      w.num = w.def.mode !== 'bar';
      this._applyClasses(w);
      if (this.onChange) this.onChange(w.id, w);
    }
    this.locked = false;
    this.layer.classList.remove('hd-locked');
    this.layout();
  }

  /** Alle Fenster neu platzieren (nach Start, Größenänderung, Reset). Liest Größen einmal. */
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    this._measureBar();
    let any = false;
    for (const w of this.wins) { w.w = w.el.offsetWidth; w.h = w.el.offsetHeight; if (w.w) any = true; }
    if (!W || !any) return; // noch unsichtbar oder alles ausgeblendet
    const pending = this._pending || (this._pending = []);
    pending.length = 0;
    for (const w of this.wins) {
      if (w.hidden) continue;
      if (w.saved && w.saved.dock && this.byId.has(w.saved.dock)) { pending.push(w); continue; }
      let x, y;
      if (w.saved) {
        x = this._fromAnchorX(w.saved.ax, w.saved.ox, w.w, W);
        y = this._fromAnchorY(w.saved.ay, w.saved.oy, w.h, H);
      } else {
        const d = w.def;
        x = this._fromAnchorX(d.ax, typeof d.ox === 'function' ? d.ox(this, W, H) : d.ox || 0, w.w, W);
        y = this._fromAnchorY(d.ay, typeof d.oy === 'function' ? d.oy(this, W, H) : d.oy || 0, w.h, H);
        if (d.after) {
          const a = this.byId.get(d.after);
          if (a && !a.hidden && a.h) y = d.ay === 'b' ? a.y - w.h - GAP : a.y + a.h + GAP;
        }
        if (d.beside) {
          // rechts neben dem Träger, Unterkanten bündig (zentrales Instrumentenbrett aus zwei Fenstern)
          const a = this.byId.get(d.beside);
          if (a && !a.hidden && a.w) { x = a.x + a.w + GAP; y = a.y + a.h - w.h; }
        }
      }
      this._place(w, x, y, W, H);
    }
    // Eingerastete Fenster folgen der Unterkante ihres Trägers (auch über mehrere Stufen)
    for (let pass = 0; pending.length && pass < 6; pass++) {
      for (let i = pending.length - 1; i >= 0; i--) {
        const w = pending[i], o = this.byId.get(w.saved.dock);
        if (pending.indexOf(o) >= 0) continue;
        const x = this._fromAnchorX(w.saved.ax, w.saved.ox, w.w, W);
        // Träger ausgeblendet: eigene gemerkte Stelle
        const y = o.h && !o.hidden ? o.y + o.h + GAP : this._fromAnchorY(w.saved.ay, w.saved.oy, w.h, H);
        this._place(w, x, y, W, H);
        pending.splice(i, 1);
      }
    }
    for (const w of pending) this._place(w, this._fromAnchorX(w.saved.ax, w.saved.ox, w.w, W), this._fromAnchorY(w.saved.ay, w.saved.oy, w.h, H), W, H);
    pending.length = 0;
    for (const w of this.wins) if (w.saved && w.saved.dock === undefined && !w.hidden) w.saved.dock = this._dockOf(w);
  }

  /** Größe eines Fensters hat sich geändert (Inhalt), Position bezogen auf Anker halten. */
  refit(id) {
    const w = this.byId.get(id);
    if (!w) return;
    const oh = w.h;
    w.w = w.el.offsetWidth; w.h = w.el.offsetHeight;
    if (oh === w.h) return;
    this.layout();
  }

  dispose() {
    if (this._ro) this._ro.disconnect();
    this.layer.removeEventListener('pointerdown', this._onDown);
    this.layer.removeEventListener('click', this._onClick);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    window.removeEventListener('resize', this._onResize);
  }

  // ---------- intern ----------
  _fromAnchorX(ax, ox, w, W) { return ax === 'r' ? W - w - ox : ax === 'c' ? Math.round(W / 2 - w / 2 + ox) : ox; }
  _fromAnchorY(ay, oy, h, H) { return ay === 'b' ? H - h - oy : ay === 'c' ? Math.round(H / 2 - h / 2 + oy) : oy; }

  _place(w, x, y, W, H) {
    x = Math.round(Math.max(0, Math.min(W - w.w, x)));
    y = Math.round(Math.max(0, Math.min(H - w.h, y)));
    // nie unter die Fensterleiste: waagrecht überlappende Fenster rasten darunter ein
    const b = this.barBox;
    if (b.placed && y < b.y + b.h + GAP && x < b.x + b.w + GAP && x + w.w > b.x - GAP) y = Math.min(H - w.h, b.y + b.h + GAP);
    if (x !== w.x || y !== w.y || !w.placed) {
      w.x = x; w.y = y; w.placed = true;
      w.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    }
  }

  _measureBar() {
    const b = this.barBox, el = this.bar;
    if (!el || el.offsetParent === null) { b.placed = false; b.w = 0; return; }
    const r = el.getBoundingClientRect();
    b.x = r.left; b.y = r.top; b.w = r.width; b.h = r.height; b.placed = r.width > 0;
  }

  _anchorFor(w) {
    const W = window.innerWidth, H = window.innerHeight;
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    let ax, ox, ay, oy;
    if (cx < W / 3) { ax = 'l'; ox = w.x; } else if (cx > (2 * W) / 3) { ax = 'r'; ox = W - w.x - w.w; } else { ax = 'c'; ox = Math.round(cx - W / 2); }
    if (cy < H / 3) { ay = 't'; oy = w.y; } else if (cy > (2 * H) / 3) { ay = 'b'; oy = H - w.y - w.h; } else { ay = 'c'; oy = Math.round(cy - H / 2); }
    return { ax, ay, ox, oy };
  }

  // Zuklappen: Kopfleiste bleibt, wo sie ist (obere linke Ecke). Fenster, die an der Unterkante hängen
  // (Kette aus dem Standardlayout oder eingerastet), rücken über layout() um die Höhenänderung nach.
  _setCollapsed(w, on) {
    const x = w.x, y = w.y;
    w.collapsed = on;
    this._applyClasses(w);
    w.w = w.el.offsetWidth; w.h = w.el.offsetHeight;
    w.placed = false;
    this._place(w, x, y, window.innerWidth, window.innerHeight);
    this._resave(w);
    this.layout();
  }

  // Anker neu bestimmen, Einrast-Bezug behalten
  _resave(w) {
    const dock = w.saved ? w.saved.dock : undefined;
    w.saved = this._anchorFor(w);
    w.saved.dock = dock;
  }

  // An welcher Fenster-Unterkante sitzt w bündig (Abstand GAP, waagrecht überlappend)?
  _dockOf(w) {
    if (!w.w) return undefined;
    for (const o of this.wins) {
      if (o === w || !o.w || !o.h || (o.saved && o.saved.dock === w.id)) continue;
      if (Math.abs(w.y - (o.y + o.h + GAP)) <= 2 && w.x < o.x + o.w && w.x + w.w > o.x) return o.id;
    }
    return null;
  }

  // Fenster, die (noch) an diesem hängen, an ihrer jetzigen Stelle festhalten, bevor es bewegt wird.
  // keep: Bezug merken (beim Ausblenden), damit sie beim Wiedereinblenden wieder folgen.
  _freezeDependents(w, keep) {
    for (const o of this.wins) {
      if (o.saved || (o.def.after !== w.id && o.def.beside !== w.id) || !o.placed || !o.w) continue;
      o.saved = this._anchorFor(o);
      if (keep && o.def.after === w.id) o.saved.dock = w.id;
      this._freezeDependents(o);
    }
  }

  _applyClasses(w) {
    w.el.classList.toggle('is-min', w.collapsed);
    w.el.classList.toggle('is-off', w.hidden);
    w.el.setAttribute('aria-hidden', w.hidden ? 'true' : 'false');
    w.el.classList.toggle('is-num', w.num);
    w.el.classList.toggle('is-bar', !w.num);
    const mb = w.el.querySelector('[data-wact="min"]');
    if (mb) { mb.textContent = w.collapsed ? '+' : '–'; mb.title = w.collapsed ? 'Aufklappen' : 'Zuklappen'; }
    const md = w.el.querySelector('[data-wact="mode"]');
    if (md) md.title = w.num ? 'Anzeige: genaue Werte. Umschalten auf nur Balken' : 'Anzeige: nur Balken. Umschalten auf genaue Werte';
  }

  _save() {
    const out = { v: 1, locked: this.locked, win: {} };
    for (const w of this.wins) {
      const e = { collapsed: w.collapsed, mode: w.num ? 'num' : 'bar' };
      if (w.hidden) e.hidden = true;
      if (w.saved) Object.assign(e, w.saved);
      out.win[w.id] = e;
    }
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch { /* privater Modus */ }
  }

  _click(e) {
    const b = e.target.closest('[data-wact]');
    if (!b) return;
    const el = b.closest('[data-win]');
    const w = el && this.byId.get(el.dataset.win);
    if (!w) return;
    if (b.dataset.wact === 'close') {
      this.setHidden(w.id, true);
      return;
    }
    if (b.dataset.wact === 'min') {
      this._setCollapsed(w, !w.collapsed);
    } else if (b.dataset.wact === 'mode') {
      w.num = !w.num;
      this._applyClasses(w);
      const oh = w.h;
      w.h = w.el.offsetHeight;
      if (oh !== w.h && w.saved && w.saved.ay === 'b' && !w.saved.dock) { w.placed = false; this._place(w, w.x, w.y - (w.h - oh), window.innerWidth, window.innerHeight); this._resave(w); }
      if (oh !== w.h) this.layout();
    }
    if (this.onChange) this.onChange(w.id, w);
    this._save();
  }

  _down(e) {
    if (e.button !== 0 || this.locked) return;
    if (e.target.closest('button,[data-wact],[data-act]')) return;
    const head = e.target.closest('.hw-head');
    if (!head) return;
    const el = head.closest('[data-win]');
    const w = el && this.byId.get(el.dataset.win);
    if (!w) return;
    e.preventDefault();
    w.w = w.el.offsetWidth; w.h = w.el.offsetHeight;
    this._measureBar();
    this._others.length = 0;
    for (const o of this.wins) {
      if (o === w || o.el.offsetParent === null) continue;
      o.w = o.el.offsetWidth; o.h = o.el.offsetHeight;
      this._others.push(o);
    }
    this._drag = { w, id: e.pointerId, dx: e.clientX - w.x, dy: e.clientY - w.y, moved: false };
    w.el.classList.add('is-drag');
    this.layer.classList.add('hd-dragging');
  }

  _move(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    const w = d.w;
    const W = window.innerWidth, H = window.innerHeight;
    let x = e.clientX - d.dx, y = e.clientY - d.dy;
    d.moved = true;
    // Einrasten: Bildschirmränder
    let bx = SNAP + 1, sx = x;
    let by = SNAP + 1, sy = y;
    const tryX = (c) => { const k = Math.abs(x - c); if (k < bx) { bx = k; sx = c; } };
    const tryY = (c) => { const k = Math.abs(y - c); if (k < by) { by = k; sy = c; } };
    tryX(MARGIN); tryX(W - w.w - MARGIN); tryX(0); tryX(W - w.w);
    tryY(MARGIN); tryY(H - w.h - MARGIN); tryY(0); tryY(H - w.h);
    // Einrasten: andere Fenster (bündig oder daneben)
    const os = this._others;
    for (let i = 0; i < os.length; i++) {
      const o = os[i];
      const vOverlap = y < o.y + o.h + SNAP + GAP && y + w.h > o.y - SNAP - GAP;
      const hOverlap = x < o.x + o.w + SNAP + GAP && x + w.w > o.x - SNAP - GAP;
      if (vOverlap) { tryX(o.x + o.w + GAP); tryX(o.x - w.w - GAP); }
      if (hOverlap) { tryY(o.y + o.h + GAP); tryY(o.y - w.h - GAP); }
      if (vOverlap || hOverlap) { tryX(o.x); tryX(o.x + o.w - w.w); tryY(o.y); tryY(o.y + o.h - w.h); }
    }
    // Einrasten: unter der Fensterleiste
    const b = this.barBox;
    if (b.placed && x < b.x + b.w + SNAP + GAP && x + w.w > b.x - SNAP - GAP) tryY(b.y + b.h + GAP);
    this._place(w, sx, sy, W, H);
  }

  _up(e) {
    const d = this._drag;
    if (!d || e.pointerId !== d.id) return;
    this._drag = null;
    d.w.el.classList.remove('is-drag');
    this.layer.classList.remove('hd-dragging');
    if (d.moved) {
      this._freezeDependents(d.w);
      // Fenster, die an diesem eingerastet waren, bleiben stehen (vom Träger gelöst)
      for (const o of this.wins) if (o.saved && o.saved.dock === d.w.id) o.saved.dock = null;
      d.w.saved = this._anchorFor(d.w);
      d.w.saved.dock = this._dockOf(d.w); // frei abgelegt oder neu eingerastet
      this._save();
    }
  }
}
