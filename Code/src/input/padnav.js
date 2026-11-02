// Menüs ohne Maus: Fokus-Navigation mit Steuerkreuz oder linkem Stick über alle Bildschirme (Titel, Rufname,
// Fraktionswahl, Hub mit allen Bereichen, Shop, Hangar, Einstellungen), das Bordmenü, die Station und Dialoge.
// Allgemein statt je Bildschirm: Kandidaten sind sichtbare, bedienbare Elemente (Knöpfe, Felder, Reiter) in der
// obersten offenen Ebene (zuletzt geöffneter Dialog, sonst die Seite); verdeckte Elemente fallen über
// elementFromPoint heraus. Die Richtung wählt das nächste Element in Blickrichtung (räumlich).
//
// A bestätigt (Klick), B zurück (Abbrechen-Knopf des Dialogs, sonst Esc), LB/RB Reiter, LT/RT Bereiche in Mission
// Control, rechter Stick blättert, MENU = Start (Mission Control) bzw. Esc. Textfelder: Hinweis auf Tastatur bzw.
// Bildschirmtastatur; A schickt das Formular ab. Fokusrahmen im UI-Stil (angeschnittene Ecken, Eckmarken).
import { pad, BTN } from './gamepad.js';
import { glyph } from './padglyph.js';

const SEL = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"]';
// Ebenen, die alles darunter sperren: Dialoge, die Einführungswahl im Flug, das Arsenal
export const MODAL_SEL = '[role="dialog"], [aria-modal="true"], .lsg-choice, .qp.show';
const REPEAT_FIRST = 0.34, REPEAT_NEXT = 0.11;
const TAB_SEL = '[role="tab"], .mp-tab, .qp-tab, button[data-tab]';
const ON_SEL = '.on, .is-on, [aria-selected="true"], [aria-current="page"], [aria-pressed="true"]';
const isText = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|range|color|file|image)$/i.test(el.type || 'text')));
const touchDevice = () => typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);

function visible(el) {
  if (!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || cs.display === 'none') return false;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const s = n === el ? cs : getComputedStyle(n);
    if (Number(s.opacity) < 0.05 || s.display === 'none') return false;
  }
  return true;
}

/** Oberste offene Ebene: der letzte sichtbare Dialog im Dokument, sonst die ganze Seite */
export function topModal() {
  const list = document.querySelectorAll(MODAL_SEL);
  for (let i = list.length - 1; i >= 0; i--) if (visible(list[i])) return list[i];
  return null;
}

function scrollParent(el) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)) return n;
  }
  return null;
}
// Treffer auf el selbst, ein Kind oder einen Vorfahren (Verlaufs-Überlagerung einer Rollfläche als ::after) zählt;
// reine Zierflächen (aria-hidden, z. B. „WEITER“-Verlauf am Listenende) verdecken nichts
function hitInside(el, x, y) {
  const hs = document.elementsFromPoint(x, y);
  let h = null;
  for (const n of hs) { if (!n.closest('[aria-hidden="true"]')) { h = n; break; } }
  return !!h && (h === el || el.contains(h) || (h.contains(el) && h !== document.body && h !== document.documentElement));
}
/** Liegt el oben (nicht von einer anderen Ebene verdeckt)? Teile außerhalb des sichtbaren Bereichs seiner Rollfläche
 *  zählen nicht; ist es ganz weggerollt, genügt eine sichtbare Rollfläche (Fokus rollt es dann ins Bild). */
function onTop(el, r) {
  const sp = scrollParent(el);
  let L = 0, T = 0, Rr = innerWidth, Bb = innerHeight;
  if (sp) { const q = sp.getBoundingClientRect(); L = Math.max(L, q.left); T = Math.max(T, q.top); Rr = Math.min(Rr, q.right); Bb = Math.min(Bb, q.bottom); }
  const pts = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]];
  let outside = 0;
  for (const [fx, fy] of pts) {
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    if (x < L || y < T || x >= Rr || y >= Bb) { outside++; continue; }
    if (hitInside(el, x, y)) return true;
  }
  if (outside < pts.length || !sp) return false;
  const q = sp.getBoundingClientRect();
  const cx = Math.max(0, Math.min(innerWidth - 1, q.left + q.width / 2)), cy = Math.max(0, Math.min(innerHeight - 1, q.top + Math.min(q.height / 2, 40)));
  return hitInside(sp, cx, cy);
}

export class PadNav {
  constructor() {
    this.scope = null;
    this._scopeT = 0;
    this._dir = 0; this._rep = 0;
    this._hintEl = null; this._hintFor = null;
    this.ring = null;
    this._rk = '';
    pad.nav = (p, dt, entered) => this.frame(p, dt, entered);
    pad.navOff = () => this._hide();
    window.addEventListener('ls:inputmode', (e) => { if (e.detail.mode !== 'pad') this._hide(); });
    window.addEventListener('focusin', () => { this._rk = ''; });
  }

  // ---------- Kandidaten ----------
  _root() { return this.scope || document.body; }
  candidates(root = this._root()) {
    const out = [];
    const list = root.querySelectorAll(SEL);
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert], .gp-ring, .gp-hint')) continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (!onTop(el, r)) continue;
      out.push({ el, r });
    }
    return out;
  }
  _valid(el) {
    if (!el || el === document.body || !el.matches || !el.matches(SEL)) return false;
    const root = this._root();
    return root.contains(el) && visible(el);
  }
  /** Startpunkt: vorhandener Fokus, sonst der Hauptknopf der Ebene, sonst das erste Element */
  _initial(c) {
    if (!c.length) return null;
    const pick = (sel) => c.find((x) => x.el.matches(sel));
    return (pick('[autofocus]') || pick('.is-primary') || pick('[data-launch]') || pick('.is-fx') || c[0]).el;
  }
  focus(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch { /* alt */ }
    if (document.activeElement !== el) { // nicht fokussierbar (z. B. div mit data-nav): vorübergehend erlauben
      el.setAttribute('tabindex', '-1');
      try { el.focus({ preventScroll: true }); } catch { /* alt */ }
    }
    // ins Bild rollen, mit Abstand zum Rand (unten liegt oft ein „WEITER“-Verlauf über der Liste)
    const sp = scrollParent(el);
    if (sp) {
      const r = el.getBoundingClientRect(), q = sp.getBoundingClientRect();
      const lo = q.bottom - Math.min(72, q.height * 0.15), hi = q.top + Math.min(24, q.height * 0.1);
      if (r.bottom > lo) sp.scrollTop += r.bottom - lo;
      else if (r.top < hi) sp.scrollTop -= hi - r.top;
    } else { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* alt */ } }
    this._rk = '';
    if (isText(el)) this._textHint(el); else this._textHint(null);
  }

  // ---------- je Bild ----------
  frame(p, dt, entered) {
    // Ebene alle 150 ms neu bestimmen (Dialog geöffnet/geschlossen); Fokus außerhalb der Ebene → neu setzen
    this._scopeT -= dt;
    let tick = false;
    if (entered || this._scopeT <= 0) {
      this._scopeT = 0.15; tick = true;
      const s = topModal();
      if (s !== this.scope) { this.scope = s; this._scoped = false; }
    }
    if (p.mode !== 'pad') { this._hide(); return; }
    const a = document.activeElement;
    if (!this._scoped || entered) {
      this._scoped = true;
      if (!this._valid(a)) { const c = this.candidates(); const f = this._initial(c); if (f) this.focus(f); }
    } else if (tick && !this._valid(a) && this._last) {
      // Fokus verloren (Knopf nach Kauf gesperrt, Liste neu gezeichnet): nächstgelegenes Element an derselben Stelle
      const c = this.candidates(), L = this._last;
      let best = null, bd = Infinity;
      for (const x of c) { const d = Math.hypot(x.r.left + x.r.width / 2 - L.x, x.r.top + x.r.height / 2 - L.y); if (d < bd) { bd = d; best = x.el; } }
      if (best) this.focus(best);
    }
    if (this._valid(a)) { const r = a.getBoundingClientRect(); this._last = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    // Richtung: Steuerkreuz oder linker Stick, mit Wiederholung beim Halten
    let dir = 0;
    if (p.isDown(BTN.UP)) dir = 1; else if (p.isDown(BTN.DOWN)) dir = 2; else if (p.isDown(BTN.LEFT)) dir = 3; else if (p.isDown(BTN.RIGHT)) dir = 4;
    if (!dir) {
      const x = p.lx, y = p.ly;
      if (Math.hypot(x, y) > 0.45) dir = Math.abs(x) > Math.abs(y) ? (x < 0 ? 3 : 4) : (y < 0 ? 1 : 2);
    }
    if (dir !== this._dir) { this._dir = dir; this._rep = REPEAT_FIRST; if (dir) this.move(dir); }
    else if (dir) { this._rep -= dt; if (this._rep <= 0) { this._rep = REPEAT_NEXT; this.move(dir); } }

    if (p.pressed(BTN.A)) this.accept();
    if (p.pressed(BTN.B)) this.back();
    if (p.pressed(BTN.LB)) this.tab(-1);
    if (p.pressed(BTN.RB)) this.tab(1);
    if (p.pressed(BTN.LT)) this.section(-1);
    if (p.pressed(BTN.RT)) this.section(1);
    if (p.pressed(BTN.MENU)) this.start();
    if (Math.abs(p.ry) > 0.05) this.scroll(p.ry * 1100 * dt);
    this._paint();
  }

  move(dir) {
    const c = this.candidates();
    if (!c.length) return;
    const a = document.activeElement;
    let cur = c.find((x) => x.el === a);
    if (!cur && a && a !== document.body && this._root().contains(a) && visible(a)) cur = { el: a, r: a.getBoundingClientRect() };
    if (!cur) { const f = this._initial(c); if (f) this.focus(f); return; }
    const R = cur.r, ax = R.left + R.width / 2, ay = R.top + R.height / 2;
    // Kandidaten in Blickrichtung: main = Abstand in Richtung, side = Lücke quer dazu (0 = im „Strahl“)
    const pool = [];
    for (const x of c) {
      if (x.el === a) continue;
      const r = x.r, bx = r.left + r.width / 2, by = r.top + r.height / 2;
      let main, side;
      if (dir === 1) { if (by >= ay - 1) continue; main = R.top - r.bottom; side = Math.max(0, r.left - R.right, R.left - r.right); }
      else if (dir === 2) { if (by <= ay + 1) continue; main = r.top - R.bottom; side = Math.max(0, r.left - R.right, R.left - r.right); }
      else if (dir === 3) { if (bx >= ax - 1) continue; main = R.left - r.right; side = Math.max(0, r.top - R.bottom, R.top - r.bottom); }
      else { if (bx <= ax + 1) continue; main = r.left - R.right; side = Math.max(0, r.top - R.bottom, R.top - r.bottom); }
      const off = dir <= 2 ? Math.abs(bx - ax) : Math.abs(by - ay);
      pool.push({ el: x.el, main: Math.max(-8, main), side, off });
    }
    if (!pool.length) return;
    // Erst in derselben Rollfläche bleiben (Liste, Inhalt, Leiste), dann im Strahl das nächste, sonst gewichtet
    const sp = scrollParent(a);
    const same = pool.filter((x) => scrollParent(x.el) === sp);
    const use = same.length ? same : pool;
    const beam = use.filter((x) => x.side === 0);
    let best = null, bs = Infinity;
    if (beam.length) { for (const x of beam) { const v = x.main + x.off * 0.05; if (v < bs) { bs = v; best = x.el; } } }
    else for (const x of use) { const v = x.main + x.side * 2.2 + x.off * 0.12; if (v < bs) { bs = v; best = x.el; } }
    if (best) this.focus(best);
  }

  accept() {
    const a = document.activeElement;
    if (!this._valid(a)) {
      const c = this.candidates();
      if (!c.length) { synth('Enter'); return; } // Vorspann, Startsequenz: „beliebige Taste“
      const f = this._initial(c); if (f) this.focus(f);
      return;
    }
    if (isText(a)) {
      // Textfeld: Formular abschicken (wie Enter), sonst Hinweis auf die Tastatur
      const f = a.form;
      if (f && String(a.value || '').trim()) { if (f.requestSubmit) f.requestSubmit(); else synth('Enter', a); return; }
      this._textHint(a, true);
      return;
    }
    if (a.tagName === 'SELECT') { a.selectedIndex = (a.selectedIndex + 1) % Math.max(1, a.options.length); a.dispatchEvent(new Event('change', { bubbles: true })); return; }
    a.click();
  }

  back() {
    const s = this.scope;
    const cancel = (s || document).querySelector('[data-x], [data-qb-no], [data-buyno]');
    if (cancel && visible(cancel) && (!s || s.contains(cancel))) { cancel.click(); return; }
    if (s && s.classList.contains('hb-install')) { const b = s.querySelectorAll('button'); if (b.length) { b[b.length - 1].click(); return; } }
    synth('Escape', document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
  }

  /** MENU (Start): in Mission Control abheben, sonst wie Esc (Bordmenü schließen) */
  start() {
    if (!this.scope) {
      const l = document.querySelector('[data-launch]');
      if (l && visible(l)) { l.click(); return; }
    }
    synth('Escape');
  }

  tab(d) {
    const root = this._root();
    const tabs = [...root.querySelectorAll(TAB_SEL)].filter((t) => visible(t) && !t.disabled);
    if (tabs.length < 2) { if (!this.scope) this.section(d); return; }
    // Gruppe: die des Fokus, sonst die erste
    const a = document.activeElement;
    let grp = tabs[0].parentElement;
    for (const t of tabs) if (t === a || (a && t.parentElement.contains(a))) { grp = t.parentElement; break; }
    const g = tabs.filter((t) => t.parentElement === grp);
    if (g.length < 2) return;
    let i = g.findIndex((t) => t.matches(ON_SEL));
    if (i < 0) i = g.indexOf(a);
    const n = g[((i < 0 ? 0 : i + d) % g.length + g.length) % g.length];
    const key = n.dataset.tab, wasFocus = a && g.includes(a);
    n.click();
    requestAnimationFrame(() => {
      const again = key ? root.querySelector(`[data-tab="${CSS.escape(key)}"]`) : n;
      if (wasFocus || !this._valid(document.activeElement)) this.focus(again && again.isConnected ? again : n);
    });
  }

  /** LT/RT: Bereiche in Mission Control (linke Leiste) */
  section(d) {
    if (this.scope) return;
    const nav = [...document.querySelectorAll('button[data-sec]')].filter((b) => visible(b));
    if (nav.length < 2) return;
    let i = nav.findIndex((b) => b.matches(ON_SEL));
    const n = nav[((i < 0 ? 0 : i + d) % nav.length + nav.length) % nav.length];
    n.click();
    requestAnimationFrame(() => this.focus(n));
  }

  scroll(dy) {
    const a = document.activeElement;
    let sp = a && a !== document.body ? scrollParent(a) : null;
    if (!sp) {
      const root = this._root();
      let best = null, area = 0;
      for (const el of root.querySelectorAll('*')) {
        if (el.scrollHeight <= el.clientHeight + 2) continue;
        const s = getComputedStyle(el);
        if (!/(auto|scroll)/.test(s.overflowY)) continue;
        const ar = el.clientWidth * el.clientHeight;
        if (ar > area) { area = ar; best = el; }
      }
      sp = best;
    }
    if (sp) sp.scrollTop += dy;
  }

  // ---------- Anzeige ----------
  _paint() {
    const a = document.activeElement;
    if (!a || a === document.body || !this._valid(a)) { this._hideRing(); this._posHint(); return; }
    const r = a.getBoundingClientRect();
    const k = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    if (!this.ring) {
      const el = this.ring = document.createElement('div');
      el.className = 'gp-ring';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<svg><path class="gp-r1"/><path class="gp-r2"/></svg>';
      document.body.appendChild(el);
    }
    this.ring.classList.add('on');
    if (k !== this._rk) {
      this._rk = k;
      const p = 4, w = Math.round(r.width) + p * 2, h = Math.round(r.height) + p * 2, c = Math.min(10, Math.max(4, Math.round(Math.min(w, h) * 0.22)));
      const st = this.ring.style;
      st.transform = `translate(${Math.round(r.left) - p}px, ${Math.round(r.top) - p}px)`;
      st.width = w + 'px'; st.height = h + 'px';
      const svg = this.ring.firstChild;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      // Rahmen mit angeschnittenen Ecken oben links und unten rechts, Eckmarken an den beiden anderen Ecken
      svg.firstChild.setAttribute('d', `M${c + 0.5} 0.5H${w - 0.5}V${h - c - 0.5}L${w - c - 0.5} ${h - 0.5}H0.5V${c + 0.5}Z`);
      const m = Math.min(10, Math.round(Math.min(w, h) / 3));
      svg.lastChild.setAttribute('d', `M${w - m - 1} 1.5H${w - 1.5}V${m + 1}M1.5 ${h - m - 1}V${h - 1.5}H${m + 1}`);
    }
    this._posHint();
  }
  _hideRing() { if (this.ring) this.ring.classList.remove('on'); this._rk = ''; }
  _hide() { this._hideRing(); this._textHint(null); }

  _textHint(el, flash = false) {
    if (!el) { if (this._hintEl) this._hintEl.classList.remove('on'); this._hintFor = null; return; }
    if (!this._hintEl) {
      const h = this._hintEl = document.createElement('div');
      h.className = 'gp-hint';
      h.setAttribute('role', 'status');
      document.body.appendChild(h);
    }
    const t = touchDevice();
    this._hintEl.innerHTML = `<span class="ls-label">TEXTEINGABE</span><span>${t ? 'Feld antippen: Bildschirmtastatur' : 'Über die Tastatur eingeben'}</span><span class="ls-key is-pad">${glyph('A')}</span><span>${el.form ? 'Bestätigen' : 'Weiter'}</span><span class="ls-key is-pad">${glyph('DUD')}</span><span>Weiter</span>`;
    this._hintFor = el;
    this._hintEl.classList.add('on');
    if (flash) { this._hintEl.classList.remove('flash'); void this._hintEl.offsetWidth; this._hintEl.classList.add('flash'); }
    this._posHint();
  }
  _posHint() {
    const h = this._hintEl, el = this._hintFor;
    if (!h || !el) return;
    if (!el.isConnected || document.activeElement !== el || pad.mode !== 'pad') { this._textHint(null); return; }
    const r = el.getBoundingClientRect();
    h.style.transform = `translate(${Math.round(r.left)}px, ${Math.round(r.bottom + 8)}px)`;
  }
}

/** Taste nachstellen (für Bildschirme, die auf Tasten hören). Nicht vertrauenswürdig → schaltet die Eingabeart nicht um. */
export function synth(key, target = null) {
  const code = key === 'Enter' ? 'Enter' : key === 'Escape' ? 'Escape' : key;
  const ev = { key, code, bubbles: true, cancelable: true };
  const t = target || window;
  t.dispatchEvent(new KeyboardEvent('keydown', ev));
  t.dispatchEvent(new KeyboardEvent('keyup', ev));
}

export const padNav = typeof window !== 'undefined' ? new PadNav() : null;
if (padNav && import.meta.env && import.meta.env.DEV) window.__padNav = padNav; // nur Entwicklung: Prüfzugriff
