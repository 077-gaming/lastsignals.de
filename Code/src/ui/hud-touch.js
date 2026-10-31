// Touch-Bedienung (iPad/Tablet): große Knöpfe für alles, was am Mac auf der Tastatur liegt.
// Lenken bleibt wie mit der Maus: Finger auf die Spielfläche = in diese Richtung fliegen, Gegner antippen = Ziel,
// zweimal antippen = Angriff, zwei Finger = Zoom. Die Knöpfe lösen dieselben Tasten aus wie die Tastatur
// (eine Logik für beide Wege, input.js bleibt die einzige Stelle mit Spielbefehlen).
import './hud-touch.css';

export const isTouch = () => typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);

const KEYS = [
  ['ControlLeft', 'ANGRIFF', 'big'], ['Space', 'RAKETE', ''], ['Tab', 'ZIEL', ''],
  ['KeyH', 'HEIM', ''], ['KeyJ', 'SPRUNG', ''], ['KeyE', 'DOCK', ''], ['KeyB', 'SHOP', ''],
];

export class HudTouch {
  constructor(root) {
    this.el = null;
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
  }
  dispose() { if (this.el) this.el.remove(); }
}
