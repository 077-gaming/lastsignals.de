// Touch-Bedienung (iPad/Tablet): große Knöpfe für alles, was am Mac auf der Tastatur liegt.
// Lenken bleibt wie mit der Maus: Finger auf die Spielfläche = in diese Richtung fliegen, Gegner antippen = Ziel,
// zweimal antippen = Angriff, zwei Finger = Zoom. Die Knöpfe lösen dieselben Tasten aus wie die Tastatur
// (eine Logik für beide Wege, input.js bleibt die einzige Stelle mit Spielbefehlen).
import './hud-touch.css';

export const isTouch = () => typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);

const KEYS = [
  ['ControlLeft', 'LASER', 'big'], ['Space', 'RAKETE', 'mid'], ['Tab', 'ZIEL', 'mid'],
  ['KeyH', 'HEIM', ''], ['KeyJ', 'SPRUNG', ''], ['KeyE', 'DOCK', ''], ['KeyB', 'SHOP', ''], ['KeyV', 'ANSICHT', ''], ['Escape', 'MENÜ', ''],
];

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
      const ev = { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true };
      window.dispatchEvent(new KeyboardEvent('keydown', ev));
      window.dispatchEvent(new KeyboardEvent('keyup', ev));
      b.classList.add('is-hit'); setTimeout(() => b.classList.remove('is-hit'), 140);
      if (navigator.vibrate) navigator.vibrate(8);
    };
    el.addEventListener('pointerdown', press);
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

  _tick() {
    const w = this.world, r = this.renderer, inp = this.input;
    if (!w || !r || !r.toScreen) return;
    const p = w.player;
    // Joystick → Lenkpunkt relativ zum eigenen Schiff auf dem Bildschirm
    if (inp && (this.jx || this.jy)) {
      const s = r.toScreen(p.x, p.z, this._s);
      inp.mouseX = s.x + this.jx * 320; inp.mouseY = s.y + this.jy * 320;
      inp.mouseOnCanvas = true; inp.mouseDown = Math.hypot(this.jx, this.jy) > 0.2;
    }
    const t = p.targetId ? w.entities.get(p.targetId) : null;
    if (!t || !t.alive || w.docked) { this.tg.className = 'ht-tgt'; return; }
    const s = r.toScreen(t.x, t.z, this._s, r.ry ? r.ry(t.y) : 0), W = innerWidth, H = innerHeight, m = 60;
    const d = Math.hypot(t.x - p.x, t.z - p.z);
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
