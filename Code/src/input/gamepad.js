// Controller über die Gamepad-API (Standard-Mapping): Xbox, PlayStation, Switch Pro, MFi – in Chrome, Edge, Firefox,
// Safari, Electron (Mac-/PC-App), iOS-WKWebView und Android-WebView. Planung/CONTROLLER.md.
//
// Eine eigene Abfrage je Bild (requestAnimationFrame), solange mindestens ein Controller verbunden ist. Sticks mit
// runder Totzone und Achsen-Kurve, Trigger stufenlos. Mehrere Controller: der zuletzt benutzte bleibt aktiv, sonst
// gewinnt der erste, an dem sich etwas bewegt. An- und Abstecken ohne Neustart.
//
// Wer den Controller gerade auswertet, entscheidet ein Besitzer je Bild: zuerst die Flugsteuerung (padflight.js,
// nur im Flug ohne offenes Menü), sonst die Menü-Navigation (padnav.js). So wird jeder Tastendruck genau einmal benutzt.
//
// Eingabeart: Sobald der Controller benutzt wird, gilt 'pad' (html[data-input="pad"], Ereignis 'ls:inputmode'),
// bei echter Tastatur-, Maus- oder Touch-Eingabe wieder 'kb'. Davon hängen Tastenhinweise und Touch-Knöpfe ab.

export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16 };
const NB = 17;
const CURVE = 1.6;            // Achsen-Kurve: kleine Ausschläge fein, voller Ausschlag voll
const TRIG_DEAD = 0.06;
const SWITCH_IDLE = 2.5;      // s: so lange still, dann darf ein anderer Controller übernehmen

// ---------- Einstellungen (eigener Schlüssel: 'ls.settings' schreibt der Hub nur mit seinen eigenen Werten neu) ----------
export const PAD_KEY = 'ls.pad';
export const PAD_DEFAULT = Object.freeze({ sens: 1, invertY: false, dead: 0.15, rumble: true });
export const PAD_CHOICES = { sens: [0.7, 1, 1.3, 1.6], dead: [0.08, 0.15, 0.22, 0.3], invertY: [false, true], rumble: [true, false] };
let padCache = null;
export function padSettings() {
  if (padCache) return padCache;
  const s = { ...PAD_DEFAULT };
  try {
    const raw = JSON.parse(localStorage.getItem(PAD_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      if (Number(raw.sens) >= 0.5 && Number(raw.sens) <= 2) s.sens = Number(raw.sens);
      if (Number(raw.dead) >= 0.04 && Number(raw.dead) <= 0.4) s.dead = Number(raw.dead);
      s.invertY = raw.invertY === true;
      s.rumble = raw.rumble !== false;
    }
  } catch { /* privater Modus */ }
  padCache = s;
  return s;
}
export function setPadSetting(key, value) {
  if (!(key in PAD_DEFAULT)) return padSettings();
  const s = { ...padSettings(), [key]: value };
  padCache = s;
  try { localStorage.setItem(PAD_KEY, JSON.stringify(s)); } catch { /* privater Modus */ }
  try { window.dispatchEvent(new CustomEvent('ls:pad', { detail: { settings: s } })); } catch { /* alt */ }
  return s;
}

/** Bauart aus der Kennung: 'ps' (Sony/DualSense/DualShock, Hersteller 054c), 'nin' (Nintendo 057e), sonst 'xbox' */
export function styleOf(id) {
  const s = String(id || '').toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  // „Wireless Controller“ ohne Hersteller nennt Safari/macOS den DualShock 4
  if (/sony|dualsense|dualshock|054c|playstation|^wireless controller/.test(s)) return 'ps';
  if (/nintendo|057e|pro controller|joy-con/.test(s)) return 'nin';
  return 'xbox';
}

function stick(out, o, x, y, dead) {
  x = Number.isFinite(x) ? x : 0; y = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(x, y);
  out[o] = 0; out[o + 1] = 0;
  if (m <= dead) return 0;
  const k = Math.min(1, (m - dead) / (1 - dead));
  const c = Math.pow(k, CURVE) / m;
  out[o] = x * c; out[o + 1] = y * c;
  return k;
}
const trig = (v) => (v > TRIG_DEAD ? Math.min(1, (v - TRIG_DEAD) / (1 - TRIG_DEAD)) : 0);

class Pad {
  constructor() {
    this.index = -1;          // aktiver Controller (navigator.getGamepads()-Index)
    this.id = '';
    this.style = 'xbox';
    this.connected = 0;
    this.mode = 'kb';
    this.ax = new Float32Array(4);  // lx, ly, rx, ry nach Totzone und Kurve
    this.lt = 0; this.rt = 0;
    this.down = new Uint8Array(NB);
    this.prev = new Uint8Array(NB);
    this.held = new Float32Array(NB); // Sekunden gedrückt
    this.flight = null;       // (pad, dt) => true, wenn die Flugsteuerung den Controller in diesem Bild nutzt
    this.nav = null;          // (pad, dt, entered) Menü-Navigation
    this.navOff = null;       // Fokusrahmen ausblenden, wenn der Flug übernimmt
    this.owner = '';
    this._raf = 0; this._t = 0; this._idle = 0;
    this._rumbleUntil = 0; this._rumbleMag = 0;
    this._mm = 0; this._mmT = 0;
    this._frame = (now) => this.frame(now);
    if (typeof window === 'undefined') return;
    window.addEventListener('gamepadconnected', () => this._wake());
    window.addEventListener('gamepaddisconnected', () => this._wake());
    const kb = (e) => { if (e.isTrusted) this.setMode('kb'); };
    window.addEventListener('keydown', kb, true);
    window.addEventListener('pointerdown', kb, true);
    window.addEventListener('wheel', kb, { capture: true, passive: true });
    window.addEventListener('mousemove', (e) => {
      if (!e.isTrusted || this.mode !== 'pad') return;
      const t = performance.now();
      if (t - this._mmT > 250) this._mm = 0;
      this._mmT = t;
      this._mm += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      if (this._mm > 12) this.setMode('kb');
    }, true);
    document.documentElement.dataset.input = 'kb';
    this._wake();
  }

  get lx() { return this.ax[0]; } get ly() { return this.ax[1]; }
  get rx() { return this.ax[2]; } get ry() { return this.ax[3]; }
  get active() { return this.index >= 0 && this.connected > 0; }
  pressed(b) { return this.down[b] === 1 && this.prev[b] === 0; }
  released(b) { return this.down[b] === 0 && this.prev[b] === 1; }
  isDown(b) { return this.down[b] === 1; }
  heldFor(b) { return this.held[b]; }

  setMode(m) {
    if (m === this.mode) return;
    if (m === 'pad' && !this.active) return;
    this.mode = m;
    try {
      document.documentElement.dataset.input = m;
      if (m === 'pad') document.documentElement.dataset.pad = this.style; else delete document.documentElement.dataset.pad;
      window.dispatchEvent(new CustomEvent('ls:inputmode', { detail: { mode: m, style: this.style } }));
    } catch { /* alt */ }
  }

  _list() {
    try { return (navigator.getGamepads && navigator.getGamepads()) || []; } catch { return []; }
  }
  /** Verbundene Controller zählen; aktiven fallen lassen, wenn er weg ist. → Anzahl */
  _count(pads) {
    let n = 0;
    for (const g of pads) if (g && g.connected !== false) n++;
    const was = this.connected;
    this.connected = n;
    if (this.index >= 0 && !(pads[this.index] && pads[this.index].connected !== false)) this._drop();
    if (n !== was) { try { window.dispatchEvent(new CustomEvent('ls:pad', { detail: { connected: n, id: this.id, style: this.style } })); } catch { /* alt */ } }
    return n;
  }
  _wake() {
    const n = this._count(this._list());
    if (n > 0 && !this._raf) { this._t = 0; this._raf = requestAnimationFrame(this._frame); }
  }
  _drop() {
    this.index = -1; this.id = '';
    this.ax.fill(0); this.lt = this.rt = 0; this.down.fill(0); this.prev.fill(0); this.held.fill(0);
    this.setMode('kb');
  }

  /** Bewegt sich an diesem Controller etwas (Taste, Stick außerhalb der Totzone, Trigger)? */
  _busy(g, dead) {
    const b = g.buttons || [];
    for (let i = 0; i < b.length && i < NB; i++) { const x = b[i]; if (x && (x.pressed || x.value > 0.5)) return true; }
    const a = g.axes || [];
    if (Math.hypot(a[0] || 0, a[1] || 0) > dead + 0.1 || Math.hypot(a[2] || 0, a[3] || 0) > dead + 0.1) return true;
    return false;
  }

  frame(now) {
    this._raf = 0;
    const dt = this._t ? Math.min(0.1, Math.max(0, (now - this._t) / 1000)) : 1 / 60;
    this._t = now;
    const pads = this._list();
    const n = this._count(pads);
    if (!n) { if (this.index >= 0) this._drop(); if (this.navOff) this.navOff(); this.owner = ''; return; }
    const set = padSettings();
    const dead = set.dead;
    let g = this.index >= 0 ? pads[this.index] : null;
    if (g && g.connected === false) g = null;
    if (!g && this.index >= 0) this._drop();
    if (g && g.id !== this.id) { this.id = g.id || ''; this.style = styleOf(this.id); }
    // Wechsel: aktiver Controller still (oder keiner) → der erste, an dem sich etwas tut
    if (!g || this._idle > SWITCH_IDLE) {
      for (const c of pads) {
        if (!c || c.connected === false || c === g) continue;
        if (this._busy(c, dead)) {
          // Wechsel von einem anderen Controller: dort gehaltene Tasten nicht als neuen Druck werten
          if (g) this.down.fill(1); else this.down.fill(0);
          g = c; this.index = c.index; this.id = c.id || ''; this.style = styleOf(this.id); this._idle = 0;
          try { window.dispatchEvent(new CustomEvent('ls:pad', { detail: { connected: n, id: this.id, style: this.style } })); } catch { /* alt */ }
          if (this.mode === 'pad') { document.documentElement.dataset.pad = this.style; window.dispatchEvent(new CustomEvent('ls:inputmode', { detail: { mode: 'pad', style: this.style } })); }
          break;
        }
      }
    }
    if (g) this._read(g, dt, dead);
    // Besitzer: Flug zuerst, sonst Menü
    let owner = 'nav';
    if (g && this.flight) { try { if (this.flight(this, dt)) owner = 'flight'; } catch (err) { console.error('Controller (Flug)', err); } }
    if (owner === 'nav' && g && this.nav) { try { this.nav(this, dt, this.owner !== 'nav'); } catch (err) { console.error('Controller (Menü)', err); } }
    if (owner === 'flight' && this.owner !== 'flight' && this.navOff) this.navOff();
    this.owner = owner;
    this._raf = requestAnimationFrame(this._frame);
  }

  _read(g, dt, dead) {
    this.prev.set(this.down);
    const b = g.buttons || [], a = g.axes || [];
    const std = g.mapping === 'standard' || b.length >= 16;
    let any = false;
    for (let i = 0; i < NB; i++) {
      const x = b[i];
      const d = x ? (x.pressed || x.value > 0.5) : false;
      this.down[i] = d ? 1 : 0;
      this.held[i] = d ? this.held[i] + dt : 0;
      if (d && i !== BTN.HOME) any = true;
    }
    const kl = stick(this.ax, 0, a[0], a[1], dead);
    const kr = stick(this.ax, 2, a[2], a[3], dead);
    this.lt = std && b[BTN.LT] ? trig(b[BTN.LT].value || (b[BTN.LT].pressed ? 1 : 0)) : 0;
    this.rt = std && b[BTN.RT] ? trig(b[BTN.RT].value || (b[BTN.RT].pressed ? 1 : 0)) : 0;
    if (kl > 0.05 || kr > 0.05 || this.lt > 0.1 || this.rt > 0.1) any = true;
    this._idle = any ? 0 : this._idle + dt;
    if (any && this.mode !== 'pad') this.setMode('pad');
  }

  /** Vibration ('dual-rumble'): strong/weak 0..1, ms. Abschaltbar in den Einstellungen; schwächere Stöße während
   *  eines laufenden stärkeren werden ausgelassen. */
  rumble(strong, weak, ms = 120) {
    if (!padSettings().rumble || this.index < 0) return false;
    const now = performance.now();
    const mag = Math.max(strong, weak);
    if (now < this._rumbleUntil && mag <= this._rumbleMag) return false;
    const g = this._list()[this.index];
    if (!g) return false;
    const s = Math.max(0, Math.min(1, strong)), w = Math.max(0, Math.min(1, weak)), d = Math.max(20, Math.min(1500, ms | 0));
    try {
      const va = g.vibrationActuator;
      if (va && typeof va.playEffect === 'function') {
        const p = va.playEffect(va.type === 'trigger-rumble' ? 'trigger-rumble' : 'dual-rumble', { startDelay: 0, duration: d, strongMagnitude: s, weakMagnitude: w });
        if (p && p.catch) p.catch(() => { });
      } else if (g.hapticActuators && g.hapticActuators[0] && g.hapticActuators[0].pulse) {
        const p = g.hapticActuators[0].pulse(mag, d);
        if (p && p.catch) p.catch(() => { });
      } else return false;
    } catch { return false; }
    this._rumbleUntil = now + d; this._rumbleMag = mag;
    return true;
  }
}

export const pad = new Pad();
if (typeof window !== 'undefined' && import.meta.env && import.meta.env.DEV) window.__pad = pad; // nur Entwicklung: Prüfzugriff
