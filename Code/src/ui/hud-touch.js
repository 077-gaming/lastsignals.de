// Touch-Bedienung (iPad/Tablet): große Knöpfe für alles, was am Mac auf der Tastatur liegt.
// Lenken bleibt wie mit der Maus: Finger auf die Spielfläche = in diese Richtung fliegen, Gegner antippen = Ziel,
// zweimal antippen = Angriff, zwei Finger = Zoom. Die Knöpfe lösen dieselben Tasten aus wie die Tastatur
// (eine Logik für beide Wege, input.js bleibt die einzige Stelle mit Spielbefehlen).
import './hud-touch.css';

export const isTouch = () => typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);

const KEYS = [
  ['ControlLeft', 'LASER', 'big'], ['Space', 'RAKETE', 'mid'], ['Tab', 'ZIEL', 'mid'],
  ['KeyH', 'HEIM', ''], ['KeyJ', 'SPRUNG', ''], ['KeyE', 'DOCK', ''], ['KeyB', 'SHOP', ''], ['KeyV', 'ANSICHT', ''], ['Escape', 'MENÜ', ''],
  ['Boost', 'BOOST', 'f3'], ['Throttle', 'SCHUB', 'f3'],
];
// 3D-Flug „Flug vereinfacht“ (Planung/FLUGMODELL.md 5.4): Joystick zielt, Schub als Hebel, LASER schaltet den
// Feuerleitrechner (Autofeuer, Treffer gewürfelt × 0,8); die Knöpfe rufen dieselben Befehle wie Tastatur und Controller
const CMD3 = {
  ControlLeft: (i) => i.attack(), Space: (i) => i.rocket(), Tab: (i) => i.cycleTarget(1), KeyH: (i) => i.home(),
  KeyJ: (i) => i.world.tryJump(), KeyE: (i) => i.context(), KeyV: (i) => i.toggleCamera(),
};

export class HudTouch {
  constructor(root, world = null, renderer = null, input = null) {
    this.el = null;
    this.world = world; this.renderer = renderer; this.input = input;
    if (!isTouch()) return;
    document.body.classList.add('is-touch');
    const el = this.el = document.createElement('div');
    el.className = 'ht-pad';
    el.innerHTML = KEYS.map(([c, t, k]) => `<button type="button" class="ht-b ${k ? 'ht-' + k : ''}" data-code="${c}">${t}</button>`).join('');
    const press = (e) => {
      const b = e.target.closest('[data-code]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const code = b.dataset.code;
      const inp = this.input;
      if (code === 'Boost') { this.boost = true; b.classList.add('is-hit'); return; }
      if (code === 'Throttle') { this.throttle = this.throttle > 0 ? 0 : 0.7; b.classList.toggle('is-on', this.throttle > 0); return; }
      if (inp && inp.flight3d && CMD3[code]) { CMD3[code](inp); b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 140); if (navigator.vibrate) navigator.vibrate(8); return; }
      const ev = { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', ev));
      window.dispatchEvent(new KeyboardEvent('keyup', ev));
      b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 140);
      if (navigator.vibrate) navigator.vibrate(8);
    };
    el.addEventListener('pointerdown', press);
    const up = (e) => { const b = e.target.closest && e.target.closest('[data-code="Boost"]'); if (b || this.boost) { this.boost = false; el.querySelector('[data-code="Boost"]')?.classList.remove('is-hit'); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
    this.boost = false; this.throttle = 0.7;
    // Schub liegt beim Start an: Knopf zeigt das (früher ohne is-on, der Knopf sah AUS aus, das Schiff flog 238 m/s)
    el.querySelector('[data-code="Throttle"]')?.classList.toggle('is-on', this.throttle > 0);
    if (input && input.fi) input.fi.touch = this.t3 = { active: false, ax: 0, ay: 0, fire: false, boost: false, throttle: 0 };
    document.body.appendChild(el); // über der Spielfläche (im HUD-Container lag sie unter der Leinwand)

    // Joystick links unten: Daumen ziehen = in diese Richtung fliegen (wie Maus halten), loslassen = Kurs halten
    const js = this.js = document.createElement('div');
    js.className = 'ht-stick'; js.innerHTML = '<i></i>';
    const knob = js.firstChild;
    this.jx = 0; this.jy = 0; this.jid = null;
    const R = 70;
    const move = (e) => {
      if (e.pointerId !== this.jid) return;
      const r = js.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, d / R); dx = dx / d * k; dy = dy / d * k;
      this.jx = dx; this.jy = dy;
      knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    };
    const end = (e) => { if (e.pointerId !== this.jid) return; this.jid = null; this.jx = this.jy = 0; knob.style.transform = ''; if (this.input) this.input.mouseDown = false; };
    js.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.jid = e.pointerId; js.setPointerCapture(e.pointerId); move(e); });
    js.addEventListener('pointermove', move); js.addEventListener('pointerup', end); js.addEventListener('pointercancel', end);
    document.body.appendChild(js);

    // Zielanzeige: Klammer um das Ziel, am Bildrand ein Pfeil, wenn es außerhalb liegt (mit Entfernung)
    const tg = this.tg = document.createElement('div');
    tg.className = 'ht-tgt'; tg.innerHTML = '<b></b><em></em>';
    document.body.appendChild(tg);
    this._s = { x: 0, y: 0, visible: false };
    const loop = () => { if (!this.el) return; this._raf = requestAnimationFrame(loop); this._tick(); };
    this._raf = requestAnimationFrame(loop);
  }

  /**
   * Knopfraster einpassen: rechts zwischen Ziel/Mission (oben) und Karte (unten). Passt es nicht, wird es kompakt (vier
   * Spalten, flachere Knöpfe). Früher wuchs das Raster von einem festen Abstand nach oben und lag am Handy quer
   * (und im 3D-Flug mit BOOST/SCHUB auch am Tablet) mit LASER, RAKETE, ZIEL und HEIM über dem Bildrand.
   */
  _fit() {
    const el = this.el;
    if (!el) return;
    const H = innerHeight, rect = (sel) => { const e = document.querySelector(sel); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return b.width ? b : null; };
    const map = rect('[data-win="map"]'), quest = rect('[data-win="quest"]') || rect('[data-win="target"]');
    const z = parseFloat(getComputedStyle(el).zoom) || 1;
    const bottom = map ? H - map.top + 8 : 24;
    const room = (map ? map.top - 8 : H - 24) - (quest ? quest.bottom + 8 : 8);
    el.style.bottom = `${Math.round(bottom / z)}px`;
    el.classList.remove('is-compact');
    if (el.getBoundingClientRect().height > room) el.classList.add('is-compact');
  }

  _tick() {
    const w = this.world, r = this.renderer, inp = this.input;
    if (!w || !r || !r.toScreen) return;
    const p = w.player;
    const f3 = !!(inp && inp.flight3d);
    if (this.el) {
      const was = this.el.classList.contains('is-3d');
      this.el.classList.toggle('is-3d', f3);
      // Raster neu einpassen: Ansichtswechsel (BOOST/SCHUB kommen dazu), Größenänderung, alle 0,5 s
      this._fitT = (this._fitT || 0) - 1;
      if (was !== f3 || this._fitT <= 0 || this._fitW !== innerWidth + innerHeight) { this._fitT = 30; this._fitW = innerWidth + innerHeight; this._fit(); }
    }
    if (this.t3) {
      // 3D-Flug: Joystick zielt (wie der rechte Stick), Schub-Hebel, Boost gehalten
      this.t3.active = f3; this.t3.ax = f3 ? this.jx : 0; this.t3.ay = f3 ? this.jy : 0;
      this.t3.boost = f3 && this.boost; this.t3.throttle = f3 ? this.throttle : 0;
    }
    // Joystick → Lenkpunkt relativ zum eigenen Schiff auf dem Bildschirm
    if (!f3 && inp && (this.jx || this.jy)) {
      const s = r.toScreen(p.x, p.z, this._s);
      inp.mouseX = s.x + this.jx * 320; inp.mouseY = s.y + this.jy * 320;
      inp.mouseOnCanvas = true; inp.mouseDown = Math.hypot(this.jx, this.jy) > 0.2;
    }
    const t = p.targetId ? w.entities.get(p.targetId) : null;
    // 3D-Flug: Zielklammer, Zielschild und Peilmarke zeichnet das Flug-HUD (hud-mid); die zweite Touch-Anzeige lag
    // darüber und machte „RAIDER“, „286 m · FEUER“ und die Trefferzahl unleserlich (Runde 2)
    if (!t || !t.alive || w.docked || f3) { this.tg.className = 'ht-tgt'; return; }
    const s = r.toScreen(t.x, t.z, this._s, r.ry ? r.ry(t.y) : 0), W = innerWidth, H = innerHeight, m = 60;
    const d = Math.hypot(t.x - p.x, t.z - p.z, f3 ? (t.y || 0) - p.y : 0);
    this.tg.lastChild.textContent = (d >= 1000 ? (d / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(d) + ' m') + (p.attacking ? ' · FEUER' : '');
    if (s.visible && s.x > m && s.x < W - m && s.y > m && s.y < H - m) {
      this.tg.className = 'ht-tgt on' + (p.attacking ? ' fire' : '');
      this.tg.style.transform = `translate(${s.x}px, ${s.y}px)`;
    } else {
      let dx = s.x - W / 2, dy = s.y - H / 2; if (s.behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), k = Math.min((W / 2 - m) / Math.abs(Math.cos(a) || 1e-3), (H / 2 - m) / Math.abs(Math.sin(a) || 1e-3));
      this.tg.className = 'ht-tgt on edge';
      this.tg.style.transform = `translate(${W / 2 + Math.cos(a) * k}px, ${H / 2 + Math.sin(a) * k}px)`;
      this.tg.style.setProperty('--a', a + 'rad');
    }
  }
  dispose() { cancelAnimationFrame(this._raf); for (const e of [this.el, this.js, this.tg]) if (e) e.remove(); this.el = null; }
}
