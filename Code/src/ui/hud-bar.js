// Schnellleiste (AKT·08) unten mittig: zehn frei belegbare Plätze auf Tasten 1 bis 0, vier Leisten zum Umschalten.
// Belegen per Ziehen und Ablegen aus dem Arsenal (AKT·09, öffnet über der Leiste): Lasermunition L1–L4, SAB, SAL,
// Raketen R1–R3, Extras (EMP, SOS, BMB, TRN, JMP), Minen (SPM, BRM, STM), Techs (VMP, ARC, LCK, RSV, FIX), Formationen, Konfigurationen 1–3.
// Plätze untereinander tauschen durch Ziehen, aus der Leiste ziehen = Platz leeren. Gespeichert in localStorage 'ls.hud.bar'.
//
// Tasten: 1–9, 0 lösen den Platz der aktuellen Leiste aus, Alt+1–4 wechselt die Leiste. Der Hörer läuft in der
// Capture-Phase vor input.js und hält die Taste dort an; ohne HUD gilt weiter die feste Belegung aus input.js.
// Welt-Befehle: vorhandene direkt (selectAmmo, fireSal, fireRocket); für Extras, Techs, Formationen und
// Konfigurationen werden die in SCHNITTSTELLEN.md vorgeschlagenen Befehle aufgerufen, sobald die Simulation sie hat
// (bis dahin: Platz gesperrt, klare Rückmeldung). Keine Speicher-Neuanlage pro Bild, DOM nur bei Änderung.
import './hud-bar.css';
import { AMMO, ROCKETS, EXTRAS, MINES, TECHS } from '../core/data.js';
import { fmt, clamp01, TextSlot, ClassSlot, EdgeProgress, EDGE_SVG } from './hud-parts.js';

export const BAR_KEY = 'ls.hud.bar';
const BARS = 4;
const SLOTS = 10;
const KEYCAP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const DRAG_MIN = 6;  // px, ab hier wird aus einem Klick ein Ziehen

const NF1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function compact(n) {
  n = Math.max(0, Math.floor(n || 0));
  if (n >= 1e6) return NF1.format(n / 1e6) + ' M';
  if (n >= 1e4) return NF1.format(n / 1e3) + ' K';
  return fmt(n);
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Arsenal (Inhalte von Toni, Vault-Notiz „Weltraum-Browserspiel 3D“, 29.10.2026) ----------
const F = (id, name, note) => ({ id, name, note });
export const CATS = [
  { id: 'ammo', code: 'MUN', title: 'LASERMUNITION', items: [
    F('L1', 'L1', '×1 Schaden'), F('L2', 'L2', '×2 Schaden'), F('L3', 'L3', '×3 Schaden'), F('L4', 'L4', '×4 Schaden'),
    F('SAB', 'SAB', '×2 Schaden, saugt Schild ab'), F('SAL', 'SAL', 'Salve ×6, eigene Nachladezeit, danach zurück zur gewählten Munition'),
  ] },
  { id: 'rocket', code: 'RAK', title: 'RAKETEN', items: Object.keys(ROCKETS).map((k) => F(k, k, `${fmt(ROCKETS[k].damage)} Schaden, ${NF1.format(ROCKETS[k].cooldown)} s Nachladen · ${fmt(ROCKETS[k].price)} ${ROCKETS[k].currency === 'tritium' ? 'Tritium' : 'Credits'} je Stück · Taste R feuert die zuletzt gewählte`)) },
  { id: 'extra', code: 'EXT', title: 'EXTRAS', items: [
    F('EMP', 'EMP', `Löst Zielerfassung und Tarnung im Umkreis von ${fmt(EXTRAS.EMP.radius)} m, ${EXTRAS.EMP.jam} s keine neue Erfassung · ${EXTRAS.EMP.cooldown} s Abklingzeit`),
    F('SOS', 'SOS', `Sofortschild, ${EXTRAS.SOS.duration} s unverwundbar · ${EXTRAS.SOS.cooldown} s Abklingzeit`),
    F('BMB', 'BMB', `Bombe: ${fmt(EXTRAS.BMB.damage)} Schaden an allen Gegnern im Umkreis von ${fmt(EXTRAS.BMB.radius)} m · ${EXTRAS.BMB.cooldown} s Abklingzeit`),
    F('TRN', 'TRN', `Tarnung außerhalb des Kampfes: unsichtbar, bis du angreifst (höchstens ${EXTRAS.TRN.duration} s)`),
    F('JMP', 'JMP', `Sprung in den nächsten Heimatsektor, ${EXTRAS.JMP.charge} s Ladezeit · ${EXTRAS.JMP.cooldown} s Abklingzeit`),
  ] },
  { id: 'mine', code: 'MIN', title: 'MINEN', items: [
    F('SPM', 'SPM', `Sprengmine hinter dem Schiff: ${fmt(MINES.SPM.damage)} Schaden im Umkreis von ${MINES.SPM.radius} m`),
    F('BRM', 'BRM', `Bremsmine: Gegner ${MINES.BRM.duration} s auf ${Math.round(MINES.BRM.slow * 100)} % Tempo`),
    F('STM', 'STM', `Störmine: unterbricht Zielerfassung und Tarnung (${MINES.STM.jam} s)`),
  ] },
  { id: 'tech', code: 'TEC', title: 'TECHS', items: [
    F('VMP', 'VMP', `Laserschaden heilt dich (${Math.round(TECHS.VMP.leech * 100)} %), ${TECHS.VMP.duration} s`),
    F('ARC', 'ARC', `Blitz auf bis zu ${TECHS.ARC.targets} Gegner, je ${fmt(TECHS.ARC.damage)} Schaden`),
    F('LCK', 'LCK', `Alle Raketen treffen, ${TECHS.LCK.duration} s`), F('RSV', 'RSV', 'Schild sofort voll'),
    F('FIX', 'FIX', `Kampfreparatur, ${TECHS.FIX.duration} s je ${Math.round(TECHS.FIX.rate * 100)} % Hülle`),
  ] },
  { id: 'form', code: 'FRM', title: 'FORMATIONEN', items: [
    F('standard', 'STD', 'Standard'), F('wall', 'WALL', 'Wall'), F('spear', 'SPEAR', 'Spear'),
    F('ring', 'RING', 'Ring: kreist, viel Schild, langsamer'), F('gyro', 'GYRO', 'Gyro: zwei gekippte Ringe'),
    F('dome', 'DOME', 'Dome: Kugel'), F('helix', 'HELIX', 'Helix: Spirale, Reichweite'), F('comet', 'COMET', 'Comet: Raketen'),
    F('claw', 'CLAW', 'Claw: gegen Spieler'), F('swarm', 'SWARM', 'Swarm: gegen Piraten und Aliens'), F('star', 'STAR', 'Star: mehrere Ziele'),
    F('wing', 'WING', 'Wing: Tempo'), F('pulse', 'PULSE', 'Pulse: Schaden um dich'), F('vortex', 'VORTEX', 'Vortex: fängt Raketen ab'),
    F('halo', 'HALO', 'Halo: heilt Verbündete'), F('crown', 'CROWN', 'Crown: mehr Erfahrung und Ehre'),
  ] },
  { id: 'config', code: 'KFG', title: 'KONFIGURATION', items: [
    F('1', 'K1', 'Konfiguration 1: eigene Verteilung von Lasern, Generatoren, Extras'),
    F('2', 'K2', 'Konfiguration 2'), F('3', 'K3', 'Konfiguration 3'),
  ] },
];
const CAT = new Map(CATS.map((c) => [c.id, c]));
const ITEM = new Map();
for (const c of CATS) for (const it of c.items) { it.kind = c.id; it.cat = c; it.ref = c.id + ':' + it.id; ITEM.set(it.ref, it); }
const item = (ref) => (ref && ITEM.get(ref)) || null;

// Standardbelegung: Leiste 1 wie die feste Belegung in input.js (1–4 L1–L4, 5 SAB, 6 SAL), dazu R1 und Extras
const DEFAULT = [
  ['ammo:L1', 'ammo:L2', 'ammo:L3', 'ammo:L4', 'ammo:SAB', 'ammo:SAL', 'rocket:R1', 'extra:EMP', 'extra:SOS', 'extra:BMB'],
  ['tech:VMP', 'tech:ARC', 'tech:LCK', 'tech:RSV', 'tech:FIX', 'extra:TRN', 'extra:JMP', 'config:1', 'config:2', 'config:3'],
  ['form:standard', 'form:wall', 'form:spear', 'form:ring', 'form:helix', 'form:comet', 'form:swarm', 'form:star', 'form:wing', 'form:pulse'],
  ['rocket:R1', 'rocket:R2', 'rocket:R3', 'mine:SPM', 'mine:BRM', 'mine:STM', 'tech:ARC', 'tech:RSV', 'extra:EMP', 'extra:SOS'],
];
const MIGRATE = 2; // Leiste 4 war früher leer: einmal mit Raketen und Minen füllen, wenn sie noch leer ist

function readBars() {
  const out = { cur: 0, tab: 'ammo', bars: DEFAULT.map((b) => b.slice()) };
  try {
    const v = JSON.parse(localStorage.getItem(BAR_KEY) || 'null');
    if (!v || v.v !== 1 || !Array.isArray(v.bars)) return out;
    for (let b = 0; b < BARS; b++) {
      const src = v.bars[b];
      if (!Array.isArray(src)) continue;
      for (let i = 0; i < SLOTS; i++) out.bars[b][i] = item(src[i]) ? src[i] : null;
    }
    if ((v.m | 0) < MIGRATE && out.bars[3].every((r) => r == null)) out.bars[3] = DEFAULT[3].slice();
    if (v.cur >= 0 && v.cur < BARS) out.cur = v.cur | 0;
    if (CAT.has(v.tab)) out.tab = v.tab;
  } catch { /* privater Modus oder kaputter Eintrag: Standard */ }
  return out;
}

// Linien-Symbole (16er Raster, eckig, wie die Fensterleiste)
const SVG_UP = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 10 L8 6 L12 10"/></svg>';
const SVG_DN = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6 L8 10 L12 6"/></svg>';
const SVG_GRID = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5 H6.5 V6.5 H2.5 Z M9.5 2.5 H13.5 V6.5 H9.5 Z M2.5 9.5 H6.5 V13.5 H2.5 Z"/><path d="M11.5 9 V14 M9 11.5 H14"/></svg>';
const SVG_LOCK = '<svg class="qs-lock" viewBox="0 0 10 12" aria-hidden="true"><path d="M2 5.5 V3.5 A3 3 0 0 1 8 3.5 V5.5"/><path d="M1 5.5 H9 V11 H1 Z"/></svg>';
const SVG_X = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2 L8 8 M8 2 L2 8"/></svg>';

const TILE = (cls, inner) => `<button class="${cls}" type="button">${inner}</button>`;
const SLOT_INNER = (cap) => `<span class="ls-key qs-k">${cap}</span><span class="qs-cat"></span>${SVG_LOCK}${EDGE_SVG}<span class="qs-n"></span><span class="qs-cd ls-num"></span><span class="qs-c ls-num"></span><span class="qs-m"><i></i></span>`;

/** Körper des Fensters AKT·08 (wird in hud.js in das Fenster-Gerüst gesetzt). */
export function quickBody() {
  return `<div class="qb" data-q="root">
  <div class="qb-pg" data-q="pager" title="Leiste wechseln (Alt+1 bis Alt+4, Mausrad)">
    <button class="qb-pb" type="button" data-q="prev" aria-label="Vorige Leiste">${SVG_UP}</button>
    <b class="ls-num qb-pn" data-q="pn">1</b>
    <span class="qb-pips" data-q="pips">${'<i></i>'.repeat(BARS)}</span>
    <button class="qb-pb" type="button" data-q="next" aria-label="Nächste Leiste">${SVG_DN}</button>
  </div>
  <div class="qb-slots" data-q="slots">${KEYCAP.map((c, i) => TILE('qs is-free', SLOT_INNER(c)).replace('type="button"', `type="button" data-i="${i}"`)).join('')}</div>
  <button class="qb-ed" type="button" data-q="edit" aria-pressed="false" title="Arsenal öffnen: Munition, Raketen, Extras, Techs, Formationen und Konfigurationen in die Leiste ziehen">${SVG_GRID}<span>ARSENAL</span></button>
</div>`;
}

const PALETTE = `<span class="ls-corners"></span>
<header class="ls-head qp-head"><span class="ls-code">AKT·09</span><span class="ls-title">ARSENAL</span><span class="ls-spacer"></span>
  <span class="qp-hint">ZIEHEN UND AUF EINEN PLATZ LEGEN · KLICK: NÄCHSTER FREIER PLATZ</span>
  <button class="hw-btn qp-x" type="button" data-q="close" aria-label="Arsenal schließen">${SVG_X}</button></header>
<nav class="qp-tabs" data-q="tabs">${CATS.map((c) => `<button class="qp-tab" type="button" data-tab="${c.id}"><i>${c.code}</i>${c.title}<span class="ls-num">${c.items.length}</span></button>`).join('')}</nav>
<div class="qp-grid" data-q="grid"></div>
<footer class="qp-foot">
  <div class="qp-info" data-q="info"></div>
  <button class="ls-btn qp-b" type="button" data-q="clear">LEISTE LEEREN</button>
  <button class="ls-btn qp-b" type="button" data-q="reset">STANDARD</button>
</footer>`;

export class HudBar {
  /**
   * @param {object} hud  Hud-Instanz (für wins, Meldungen, Menü-/Abschusszustand)
   * @param {HTMLElement} winEl  Fenster AKT·08 (Körper aus quickBody())
   * @param {HTMLElement} rootEl  .hd-Wurzel (Arsenal und Zieh-Vorschau liegen außerhalb des Fensters, weil es Inhalt beschneidet)
   */
  constructor(hud, winEl, rootEl) {
    this.hud = hud;
    this.win = winEl;
    this.root = rootEl;
    const s = readBars();
    this.bars = s.bars;
    this.cur = s.cur;
    this.tab = s.tab;
    const q = (r, el = winEl) => el.querySelector(`[data-q="${r}"]`);
    this.$q = q;
    this.slotsEl = q('slots');
    this.pn = new TextSlot(q('pn'));
    this.pips = q('pips').children;
    this.editBtn = q('edit');
    this.sDragging = new ClassSlot(q('root'), 'is-dragging');

    // Plätze: feste Knoten, Zustände über ClassSlot/TextSlot
    this.slots = [];
    const nodes = this.slotsEl.querySelectorAll('.qs');
    for (let i = 0; i < nodes.length; i++) {
      const b = nodes[i];
      this.slots.push({
        i, el: b, ref: undefined, it: null,
        n: b.querySelector('.qs-n'), cat: b.querySelector('.qs-cat'),
        count: new TextSlot(b.querySelector('.qs-c')), countV: NaN, exact: null,
        meter: b.querySelector('.qs-m > i'), mq: -1,
        cd: new TextSlot(b.querySelector('.qs-cd')), cdq: -1,
        ring: new EdgeProgress(b.querySelector('.wp-edge .pr')),
        sOn: new ClassSlot(b, 'on'), sEmpty: new ClassSlot(b, 'empty'), sNa: new ClassSlot(b, 'na'),
        sCool: new ClassSlot(b, 'cooling'), sFlash: new ClassSlot(b, 'flash'), sDeny: new ClassSlot(b, 'deny'),
        sDrop: new ClassSlot(b, 'drop'), sNoCount: new ClassSlot(b, 'no-count'),
        flashT: 0, denyT: 0,
      });
    }
    this._st = { count: null, sel: false, na: false, left: 0, total: 1, meter: -1 };

    // Arsenal (über der Leiste) und Zieh-Vorschau
    const pal = document.createElement('section');
    pal.className = 'qp ls-panel';
    pal.setAttribute('aria-label', 'Arsenal');
    pal.innerHTML = PALETTE;
    rootEl.appendChild(pal);
    this.pal = pal;
    this.grid = q('grid', pal);
    this.info = q('info', pal);
    this.tabs = pal.querySelectorAll('.qp-tab');
    this.palOpen = false;
    this._palX = NaN; this._palY = NaN; this._palW = NaN;
    this.tiles = [];
    const ghost = document.createElement('div');
    ghost.className = 'qg';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML = '<span class="qg-cat"></span><b></b>';
    rootEl.appendChild(ghost);
    this.ghost = ghost;
    this.drag = null;

    this._renderBar();
    this._renderTab();

    // Eingaben
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    this._onWheel = (e) => { e.preventDefault(); this.setBar(this.cur + (e.deltaY > 0 ? 1 : -1)); };
    this._onOver = (e) => { const t = e.target.closest('.qi'); if (t) this._showInfo(item(t.dataset.ref)); };
    winEl.addEventListener('pointerdown', this._onDown);
    pal.addEventListener('pointerdown', this._onDown);
    pal.addEventListener('pointerover', this._onOver);
    // Klicks/Fokus nicht an das Spiel weiterreichen (Arsenal liegt außerhalb der Fensterebene)
    this._stop = (e) => e.stopPropagation();
    for (const t of ['click', 'dblclick', 'contextmenu']) pal.addEventListener(t, this._stop);
    this._noFocus = (e) => { if (e.target.closest('button')) e.preventDefault(); };
    pal.addEventListener('mousedown', this._noFocus);
    winEl.addEventListener('mousedown', this._noFocus);
    q('pager').addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);
    this._onClick = (e) => this._click(e);
    winEl.addEventListener('click', this._onClick);
    pal.addEventListener('click', this._onClick);
    this._onCtx = (e) => {
      // Rechtsklick auf einen Platz: leeren (wie aus der Leiste ziehen)
      const s = e.target.closest('.qs');
      if (!s || this.hud.wins.locked) return;
      e.preventDefault();
      this._set(+s.dataset.i, null);
    };
    winEl.addEventListener('contextmenu', this._onCtx);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
  }

  // ---------- öffentlich ----------
  /** Belegung der aktuellen Leiste als Liste 'art:id' | null (für Tests und andere Module). */
  current() { return this.bars[this.cur].slice(); }

  setBar(n) {
    n = ((n % BARS) + BARS) % BARS;
    if (n === this.cur) return;
    this.cur = n;
    this._renderBar();
    this._save();
  }

  togglePalette(force) {
    const open = force === undefined ? !this.palOpen : !!force;
    if (open === this.palOpen) return;
    if (open && this.hud.wins.locked) { this.hud._pushMsg({ text: 'LAYOUT GESPERRT · SCHNELLLEISTE IM BORDMENÜ ENTSPERREN', kind: 'info', terse: true }); return; }
    this.palOpen = open;
    this.pal.classList.toggle('show', open);
    this.editBtn.classList.toggle('on', open);
    this.editBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    if (open) { this._syncTiles(); this._ph = this.pal.offsetHeight; this._palX = NaN; this._place(); this._showInfo(null); }
  }

  /** Jedes Bild: Zustände der Plätze (Anzahl, aktiv, Nachladen). exact = genaue Werte statt Kurzform. */
  update(w, p, dt, exact) {
    if (!w || !p) return;
    const st = this._st;
    for (let i = 0; i < SLOTS; i++) {
      const s = this.slots[i];
      if (s.flashT > 0) { s.flashT -= dt; if (s.flashT <= 0) s.sFlash.set(false); }
      if (s.denyT > 0) { s.denyT -= dt; if (s.denyT <= 0) s.sDeny.set(false); }
      const it = s.it;
      if (!it) continue;
      this._state(it, w, p, st);
      s.sOn.set(st.sel);
      s.sNa.set(st.na);
      const n = st.count;
      s.sNoCount.set(n == null);
      if (n != null && (n !== s.countV || exact !== s.exact)) {
        s.countV = n; s.exact = exact;
        s.count.set(n <= 0 ? '0' : exact ? fmt(n) : compact(n));
      }
      s.sEmpty.set(n != null && n <= 0 && !st.na);
      const mq = st.meter < 0 ? -1 : Math.round(clamp01(st.meter) * 40);
      if (mq !== s.mq) { s.mq = mq; s.meter.style.transform = 'scaleX(' + (mq < 0 ? 0 : mq / 40) + ')'; }
      const left = st.left > 0 ? st.left : 0;
      s.sCool.set(left > 0);
      s.ring.set(1 - left / (st.total || 1));
      const cq = left > 0 ? Math.ceil(left * 10) : 0;
      if (cq !== s.cdq) { s.cdq = cq; s.cd.set(cq ? NF1.format(cq / 10) : ''); }
    }
    if (this.palOpen) this._place();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('pointermove', this._onMove);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.pal.remove();
    this.ghost.remove();
  }

  // ---------- Zustand je Platz (ohne Speicher-Neuanlage) ----------
  _state(it, w, p, st) {
    st.count = null; st.sel = false; st.na = false; st.left = 0; st.total = 1; st.meter = -1;
    const ammo = p.ammo || {};
    switch (it.kind) {
      case 'ammo': {
        const n = ammo[it.id] || 0;
        st.count = n;
        st.meter = n / (((AMMO[it.id] && AMMO[it.id].pack) || 1000) * 5);
        if (it.id === 'SAL') { st.left = w.salReadyIn || 0; st.total = AMMO.SAL.ownCooldown || 1; }
        else st.sel = p.selectedAmmo === it.id;
        break;
      }
      case 'rocket': {
        const n = ammo[it.id] || 0;
        st.count = n;
        st.meter = n / (((ROCKETS[it.id] && ROCKETS[it.id].pack) || 50) * 5);
        st.left = w.rocketReadyIn || 0; st.total = (ROCKETS[it.id] && ROCKETS[it.id].cooldown) || 1;
        st.sel = (p.selectedRocket || 'R1') === it.id;
        break;
      }
      case 'extra': case 'tech': case 'mine': {
        st.na = typeof (it.kind === 'extra' ? w.useExtra : it.kind === 'mine' ? w.layMine : w.useTech) !== 'function';
        const a = w.abilities && w.abilities[it.id];
        const own = it.kind === 'tech' ? p.techs : p.extras;
        if (a) {
          if (a.count != null) st.count = a.count;
          st.left = a.readyIn || 0; st.total = a.cooldown || 1;
          st.sel = (a.activeFor || 0) > 0;
          if (st.sel && a.duration) st.meter = a.activeFor / a.duration;
          else if (it.id === 'JMP' && w.jump && w.jump.jmp) { st.sel = true; st.meter = w.jump.progress || 0; }
        } else if (own && own[it.id] != null) st.count = own[it.id];
        break;
      }
      case 'form': {
        const owned = p.owned && p.owned.formations;
        st.na = typeof w.setFormation !== 'function' || (Array.isArray(owned) && it.id !== 'standard' && owned.indexOf(it.id) < 0);
        st.sel = (w.formation || 'standard') === it.id && !st.na;
        const a = w.abilities && w.abilities.formation;
        if (a) { st.left = a.readyIn || 0; st.total = a.cooldown || 1; }
        break;
      }
      case 'config': {
        st.na = typeof w.setConfig !== 'function';
        st.sel = !st.na && String(w.config || 1) === it.id;
        const a = w.abilities && w.abilities.config;
        if (a) { st.left = a.readyIn || 0; st.total = a.cooldown || 1; }
        break;
      }
      default: break;
    }
  }

  // ---------- Auslösen ----------
  activate(i) {
    const s = this.slots[i];
    const w = this.hud.world;
    if (!s || !w || w.docked || w.playerDead) return;
    const it = s.it;
    if (!it) return;
    // ok: Befehl vorhanden · res === false: Welt hat abgelehnt (Abklingzeit, leer, Reichweite – Meldung kommt von der Welt)
    let ok = true, res;
    const call = (fn, a) => { if (typeof fn === 'function') res = fn.call(w, a); else ok = false; };
    switch (it.kind) {
      case 'ammo':
        if (it.id === 'SAL') w.fireSal && w.fireSal();
        else w.selectAmmo && w.selectAmmo(it.id);
        break;
      case 'rocket': call(w.fireRocket, it.id); break;
      case 'extra': call(w.useExtra, it.id); break;
      case 'mine': call(w.layMine, it.id); break;
      case 'tech': call(w.useTech, it.id); break;
      case 'form': call(w.setFormation, it.id); break;
      case 'config': call(w.setConfig, +it.id); break;
      default: ok = false;
    }
    if (ok && res !== false) { s.flashT = 0.16; s.sFlash.set(false); void s.el.offsetWidth; s.sFlash.set(true); return; }
    s.denyT = 0.5; s.sDeny.set(false); void s.el.offsetWidth; s.sDeny.set(true);
    if (!ok) this.hud._pushMsg({ text: `${it.name} · ${it.cat.title} NOCH NICHT AN BORD`, kind: 'info', terse: true });
  }

  _key(e) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    const c = e.code;
    let i = -1;
    if (c.length === 6 && c.charCodeAt(0) === 68 && c.startsWith('Digit')) i = c.charCodeAt(5) - 49;      // Digit1..9 -> 0..8
    else if (c.length === 7 && c.startsWith('Numpad')) i = c.charCodeAt(6) - 49;
    else return;
    if (i === -1) i = 9; // Digit0 / Numpad0 -> Platz 10
    if (i < 0 || i > 9) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const hud = this.hud, w = hud.world;
    // Abschuss (1–3 = Reparaturort) und Station: Tasten gehören anderen
    if (!w || w.docked || w.playerDead || hud._deadShown) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat || hud._menuOpen) return;
    if (e.altKey) { if (i < BARS) this.setBar(i); return; }
    this.activate(i);
  }

  // ---------- Belegung ----------
  _set(i, ref, bar = this.cur) {
    this.bars[bar][i] = ref;
    if (bar === this.cur) this._renderSlot(this.slots[i], ref);
    this._save();
  }

  _renderBar() {
    const bar = this.bars[this.cur];
    for (let i = 0; i < SLOTS; i++) this._renderSlot(this.slots[i], bar[i]);
    this.pn.set(String(this.cur + 1));
    for (let i = 0; i < this.pips.length; i++) this.pips[i].className = i === this.cur ? 'on' : '';
    if (this.hud.wins) this.hud.wins.refit('quick');
  }

  _renderSlot(s, ref) {
    if (s.ref === ref) return;
    s.ref = ref;
    const it = item(ref);
    s.it = it;
    s.el.className = 'qs' + (it ? ' k-' + it.kind + (it.name.length > 4 ? ' is-long' : '') : ' is-free');
    s.n.textContent = it ? it.name : '';
    s.cat.textContent = it ? it.cat.code : '';
    s.countV = NaN; s.mq = -2; s.cdq = -1;
    s.count.set(''); s.cd.set('');
    for (const k of ['sOn', 'sEmpty', 'sNa', 'sCool', 'sFlash', 'sDeny', 'sDrop', 'sNoCount']) s[k].reset();
    s.flashT = 0; s.denyT = 0;
    const key = KEYCAP[s.i];
    s.el.setAttribute('aria-label', it ? `Platz ${key}: ${it.name}, ${it.note}` : `Platz ${key}: leer`);
    s.el.title = it ? `${it.name} · ${it.note} · Taste ${key}` : `Platz ${key} leer · aus dem Arsenal hierher ziehen`;
  }

  _renderTab() {
    const c = CAT.get(this.tab) || CATS[0];
    for (const t of this.tabs) t.classList.toggle('on', t.dataset.tab === c.id);
    this.grid.innerHTML = c.items.map((it) => `<button class="qi k-${it.kind}${it.name.length > 4 ? ' is-long' : ''}" type="button" data-ref="${it.ref}"><span class="qi-cat">${c.code}</span>${SVG_LOCK}<b>${esc(it.name)}</b><span class="qi-c ls-num"></span></button>`).join('');
    this.tiles = Array.from(this.grid.children);
    this._syncTiles();
    if (this.palOpen) { this._ph = this.pal.offsetHeight; this._palX = NaN; this._place(); }
  }

  // Gesperrt/Anzahl im Arsenal (nur beim Öffnen und Reiterwechsel, nicht pro Bild)
  _syncTiles() {
    const w = this.hud.world, p = w && w.profile;
    if (!w || !p) return;
    for (const t of this.tiles) {
      const it = item(t.dataset.ref);
      this._state(it, w, p, this._st);
      t.classList.toggle('na', this._st.na);
      t.lastElementChild.textContent = this._st.count != null ? compact(this._st.count) : '';
    }
  }

  _showInfo(it) {
    if (!it) { this.info.innerHTML = `<span class="ls-label">LEISTE ${this.cur + 1}</span> Platz per Rechtsklick oder Herausziehen leeren · Alt+1–4 wechselt die Leiste`; return; }
    const w = this.hud.world, p = w && w.profile;
    if (w && p) this._state(it, w, p, this._st);
    const na = this._st.na;
    this.info.innerHTML = `<b>${esc(it.name)}</b><span>${esc(it.note)}</span>${na ? '<em>NOCH NICHT AN BORD</em>' : ''}`;
  }

  _save() {
    try { localStorage.setItem(BAR_KEY, JSON.stringify({ v: 1, m: MIGRATE, cur: this.cur, tab: this.tab, bars: this.bars })); } catch { /* privater Modus */ }
  }

  // Arsenal direkt über der Leiste, linksbündig, gleiche Breite wie das Fenster (nur bei Änderung schreiben)
  _place() {
    const wq = this.hud.wins.get('quick');
    if (!wq || wq.hidden || !wq.placed) { if (this.palOpen) this.togglePalette(false); return; }
    const x = wq.x, w = Math.max(wq.w, 520);
    const ph = this._ph || 220;
    let y = wq.y - ph - 8;
    if (y < 48) y = Math.min(window.innerHeight - ph - 8, wq.y + wq.h + 8);
    const cx = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    if (cx !== this._palX || y !== this._palY || w !== this._palW) {
      this._palX = cx; this._palY = y; this._palW = w;
      this.pal.style.width = w + 'px';
      this.pal.style.transform = 'translate3d(' + cx + 'px,' + Math.round(y) + 'px,0)';
    }
  }

  // ---------- Klicks ----------
  _click(e) {
    const b = e.target.closest('[data-q],[data-tab]');
    if (!b) return;
    if (b.dataset.tab) {
      this.tab = b.dataset.tab;
      this._renderTab();
      this._save();
      return;
    }
    switch (b.dataset.q) {
      case 'prev': this.setBar(this.cur - 1); break;
      case 'next': this.setBar(this.cur + 1); break;
      case 'edit': this.togglePalette(); break;
      case 'close': this.togglePalette(false); break;
      case 'clear': for (let i = 0; i < SLOTS; i++) this.bars[this.cur][i] = null; this._renderBar(); this._save(); break;
      case 'reset': this.bars[this.cur] = DEFAULT[this.cur].slice(); this._renderBar(); this._save(); break;
      default: break;
    }
  }

  // ---------- Ziehen und Ablegen (Zeiger-Ereignisse, eigene Vorschau) ----------
  _down(e) {
    if (e.button !== 0) return;
    const s = e.target.closest('.qs');
    const t = s ? null : e.target.closest('.qi');
    if (!s && !t) return;
    const ref = s ? this.bars[this.cur][+s.dataset.i] : t.dataset.ref;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: s ? +s.dataset.i : -1, ref, on: false, over: -1 };
  }

  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.on) {
      if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < DRAG_MIN) return;
      if (!d.ref || this.hud.wins.locked) { this.drag = null; return; }
      d.on = true;
      const it = item(d.ref);
      this.ghost.className = 'qg show k-' + it.kind + (it.name.length > 4 ? ' is-long' : '');
      this.ghost.firstChild.textContent = it.cat.code;
      this.ghost.lastChild.textContent = it.name;
      this.sDragging.set(true);
      this.root.classList.add('hd-qdrag');
      if (d.from >= 0) this.slots[d.from].el.classList.add('is-src');
    }
    this.ghost.style.transform = 'translate3d(' + (e.clientX - 28) + 'px,' + (e.clientY - 33) + 'px,0)';
    const over = this._slotAt(e.clientX, e.clientY);
    if (over !== d.over) {
      if (d.over >= 0) this.slots[d.over].sDrop.set(false);
      if (over >= 0) this.slots[over].sDrop.set(true);
      d.over = over;
    }
  }

  _up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (!d.on) {
      // Klick: Platz auslösen bzw. Arsenal-Eintrag auf den nächsten freien Platz legen
      if (d.from >= 0) this.activate(d.from);
      else if (d.ref) this._placeFree(d.ref);
      return;
    }
    this.ghost.className = 'qg';
    this.sDragging.set(false);
    this.root.classList.remove('hd-qdrag');
    if (d.from >= 0) this.slots[d.from].el.classList.remove('is-src');
    if (d.over >= 0) this.slots[d.over].sDrop.set(false);
    const to = d.over;
    if (to >= 0) {
      if (d.from >= 0) {
        // tauschen
        const a = this.bars[this.cur][d.from];
        const b = this.bars[this.cur][to];
        this._set(d.from, b); this._set(to, a);
      } else this._set(to, d.ref);
      this.slots[to].flashT = 0.16; this.slots[to].sFlash.set(true);
      return;
    }
    // aus der Leiste gezogen (nicht auf das Fenster oder das Arsenal): Platz leeren
    if (d.from >= 0 && !this._inside(this.win, e.clientX, e.clientY) && !(this.palOpen && this._inside(this.pal, e.clientX, e.clientY))) this._set(d.from, null);
  }

  _placeFree(ref) {
    const bar = this.bars[this.cur];
    let i = bar.indexOf(null);
    if (i < 0) { this.hud._pushMsg({ text: `LEISTE ${this.cur + 1} VOLL · PLATZ ZIEHEN ODER LEEREN`, kind: 'info', terse: true }); return; }
    this._set(i, ref);
    const s = this.slots[i];
    s.flashT = 0.16; s.sFlash.set(true);
  }

  _slotAt(x, y) {
    // grobe Vorprüfung über das Fenster, dann die Plätze (zehn Rechtecke, nur während des Ziehens)
    if (!this._inside(this.slotsEl, x, y, 6)) return -1;
    for (let i = 0; i < SLOTS; i++) if (this._inside(this.slots[i].el, x, y, 2)) return i;
    return -1;
  }

  _inside(el, x, y, pad = 0) {
    const r = el.getBoundingClientRect();
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  }
}
