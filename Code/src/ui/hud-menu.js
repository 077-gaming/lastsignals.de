// Bordmenü (Esc) als Seitenpanel links über die volle Höhe, mit Reitern FLUG, ANZEIGE, STEUERUNG, SYSTEM.
// Die Szene bleibt dahinter sichtbar. Werte werden nur bei offenem Menü und höchstens 4-mal pro Sekunde geschrieben.
import { SHIPS, ENEMIES, AMMO } from '../core/data.js';
import { TextSlot, ClassSlot, Bar, fmt } from './hud-parts.js';

const GROUP = { pirate: 'PIRAT', swarm: 'SCHWARM' };
const BEH = { aggressive: 'AGGRESSIV', passive: 'PASSIV', opportunist: 'LAUERT', thief: 'PLÜNDERER' };
const ENEMY_KEYS = Object.keys(ENEMIES);

const CALM_KEY = 'ls.hud.calm';

const TABS = [
  ['flug', '01', 'FLUG'],
  ['anzeige', '02', 'ANZEIGE'],
  ['steuerung', '03', 'STEUERUNG'],
  ['system', '04', 'SYSTEM'],
];

const CONTROLS = [
  ['FLUG', [
    ['LMB', 'Hinfliegen'],
    ['W A S D', 'Direkt steuern'],
    ['KARTE', 'Kurs per Klick'],
    ['RAD', 'Zoom'],
    ['J', 'Sprung am Tor'],
    ['E', 'Andocken, Abdocken'],
  ]],
  ['KAMPF', [
    ['TAB', 'Nächster Gegner'],
    ['LMB', 'Ziel erfassen'],
    ['2× LMB', 'Erfassen, Angriff'],
    ['LEER', 'Angriff an, aus'],
    ['1–0', 'Schnellleiste, frei belegbar'],
    ['ALT 1–4', 'Leiste wechseln'],
    ['R', 'Rakete R1'],
  ]],
  ['SYSTEM', [
    ['ESC', 'Bordmenü'],
    ['⇧ 1–9', 'Fenster ein, aus'],
    ['1 2 3', 'Reparaturort'],
  ]],
];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Zustandszeile: Label, segmentierter Balken, Wert
function gaugeRow(label, g, cls = '') {
  return `<div class="mp-gr ${cls}" data-mg="${g}"><span class="ls-label">${label}</span><div class="ls-bar"></div><b class="ls-num"></b></div>`;
}

function row(label, r, cls = '') {
  return `<div class="mp-row ${cls}"><span class="ls-label">${label}</span><span class="hg-sp"></span><b class="ls-num" data-mr="${r}"></b></div>`;
}

export function menuHtml(windows) {
  const tabs = TABS.map(([id, no, t], i) => `<button class="mp-tab${i ? '' : ' on'}" type="button" data-act="tab" data-tab="${id}"><i>${no}</i>${t}</button>`).join('');
  const wins = windows.map(([id, code, title], i) => `<div class="mp-win" data-mw="${id}"><span class="mp-wc">${code}</span><span class="mp-wt">${title}</span><span class="hg-sp"></span><span class="ls-key mp-wk">⇧${i + 1}</span><button class="mp-sw" type="button" data-act="winvis" data-id="${id}"><i>AN</i><i>AUS</i></button></div>`).join('');
  const ctrl = CONTROLS.map(([g, rows]) => `<div class="mp-cg"><div class="mp-sec">${g}</div>${rows.map(([k, t]) => `<div class="mp-crow"><span class="ls-key">${esc(k)}</span><span>${esc(t)}</span></div>`).join('')}</div>`).join('');
  return `
<div class="hd-side" data-r="menu" role="dialog" aria-modal="true" aria-label="Bordmenü">
  <aside class="mp ls-panel">
    <span class="ls-corners"></span>
    <header class="ls-head mp-head"><span class="ls-code">SYS·MEN</span><span class="ls-title">BORDMENÜ</span><span class="ls-spacer"></span><span class="ls-key">ESC</span></header>
    <div class="mp-read ls-scan">
      <div class="mp-rd mp-rd-wide"><span class="ls-label">SEKTOR</span><b data-mr="sec"></b></div>
      <div class="mp-rd"><span class="ls-label">ZEIT</span><b class="ls-num" data-mr="time"></b></div>
      <div class="mp-rd"><span class="ls-label">POSITION</span><b class="ls-num" data-mr="pos"></b></div>
      <div class="mp-rd"><span class="ls-label">STATUS</span><b data-mr="state"></b></div>
      <div class="mp-rd"><span class="ls-label">KONTAKTE</span><b class="ls-num" data-mr="hostiles"></b></div>
    </div>
    <nav class="mp-tabs">${tabs}</nav>
    <div class="mp-panes">
      <section class="mp-pane on" data-pane="flug">
        <div class="mp-sec">PILOT</div>
        ${row('RUFNAME', 'call')}${row('RANG', 'rank')}${row('SCHIFF', 'ship')}
        <div class="mp-sec">EINSATZ</div>
        ${row('AUFTRAG', 'quest')}${row('ABSCHÜSSE', 'kills')}${row('VERLUSTE', 'deaths')}${row('FLUGZEIT', 'ftime')}
        <div class="mp-sec">SCHIFFSZUSTAND</div>
        ${gaugeRow('HÜLLE', 'hull')}${gaugeRow('SCHILD', 'shield', 'is-shield')}${gaugeRow('MUNITION', 'ammo')}${gaugeRow('LADERAUM', 'cargo')}
        <div class="mp-sec mp-sec-t">KONTAKTE IM SEKTOR<span class="hg-sp"></span><span class="mp-sec-n">TYP · ANZAHL · NÄCHSTER</span></div>
        <div class="mp-cts ls-scan">${ENEMY_KEYS.map((k) => {
    const d = ENEMIES[k];
    return `<div class="mp-ct is-zero" data-mc="${k}"><i></i><span class="mp-cn">${esc(String(d.name).toUpperCase())}</span><span class="mp-cg">${GROUP[d.group] || ''} · ${BEH[d.behavior] || ''}</span><span class="hg-sp"></span><b class="ls-num" data-n></b><span class="ls-num mp-cd" data-d></span></div>`;
  }).join('')}</div>
      </section>
      <section class="mp-pane" data-pane="anzeige">
        <div class="mp-sec">LAYOUT</div>
        <div class="mp-pair">
          <button class="ls-btn" type="button" data-act="lock" data-r="lockbtn">LAYOUT SPERREN</button>
          <button class="ls-btn" type="button" data-act="reset" title="Sichtbarkeit, Positionen und Klappzustand aller Fenster auf Standard">ZURÜCKSETZEN</button>
        </div>
        <div class="mp-sec">ANZEIGEMODUS</div>
        <div class="mp-pair">
          <button class="ls-btn" type="button" data-act="allbar">ALLE BALKEN</button>
          <button class="ls-btn" type="button" data-act="allnum">ALLE WERTE</button>
        </div>
        <div class="mp-sec">FENSTER</div>
        <div class="mp-wins">${wins}</div>
      </section>
      <section class="mp-pane" data-pane="steuerung"><div class="mp-ctrl">${ctrl}</div></section>
      <section class="mp-pane" data-pane="system">
        <div class="mp-sec">GRAFIK</div>
        ${row('BILDRATE', 'fps')}${row('AUFLÖSUNG', 'res')}${row('QUALITÄT', 'qual')}${row('BILDFLÄCHE', 'view')}
        <div class="mp-sec">HUD</div>
        <div class="mp-win"><span class="mp-wt">BEWEGUNG REDUZIEREN</span><span class="hg-sp"></span><button class="mp-sw" type="button" data-act="calm" data-r="calmbtn"><i>AUS</i><i>EIN</i></button></div>
        ${row('SPEICHER', 'store')}
      </section>
    </div>
    <footer class="mp-foot">
      <button class="ls-btn" type="button" data-act="save">SPEICHERN</button>
      <button class="ls-btn" type="button" data-act="hub">ZUM HUB</button>
      <button class="ls-btn is-primary" type="button" data-act="resume">WEITER<span class="ls-key">ESC</span></button>
    </footer>
  </aside>
</div>`;
}

export class HudMenu {
  constructor(el, wins, hudRoot) {
    this.el = el;
    this.wins = wins;
    this.root = hudRoot;
    this.tab = 'flug';
    this._acc = 1;
    this.r = {};
    for (const n of el.querySelectorAll('[data-mr]')) this.r[n.dataset.mr] = new TextSlot(n);
    this.tabs = el.querySelectorAll('.mp-tab');
    this.panes = el.querySelectorAll('.mp-pane');
    this.winRows = el.querySelectorAll('[data-mw]');
    this.calmBtn = el.querySelector('[data-r="calmbtn"]');
    // Schiffszustand
    this.g = {};
    for (const n of el.querySelectorAll('[data-mg]')) {
      this.g[n.dataset.mg] = { bar: new Bar(n.querySelector('.ls-bar'), 100), val: new TextSlot(n.querySelector('b')), low: new ClassSlot(n, 'is-low') };
    }
    // Kontakte je Gegnertyp (feste Zeilen, nur Werte ändern sich)
    this.ct = {};
    for (const n of el.querySelectorAll('[data-mc]')) {
      this.ct[n.dataset.mc] = { n: 0, d: Infinity, cnt: new TextSlot(n.querySelector('[data-n]')), dist: new TextSlot(n.querySelector('[data-d]')), zero: new ClassSlot(n, 'is-zero') };
    }
    let calm = false;
    try { calm = localStorage.getItem(CALM_KEY) === '1'; } catch { /* privater Modus */ }
    this.setCalm(calm, false);
  }

  setTab(id) {
    if (!id) return;
    this.tab = id;
    for (const t of this.tabs) t.classList.toggle('on', t.dataset.tab === id);
    for (const p of this.panes) p.classList.toggle('on', p.dataset.pane === id);
    this.syncWins();
    this._acc = 1;
  }

  setCalm(on, save = true) {
    this.calm = !!on;
    this.root.classList.toggle('hd-calm', this.calm);
    this.calmBtn.classList.toggle('is-on', this.calm);
    if (save) { try { localStorage.setItem(CALM_KEY, this.calm ? '1' : '0'); } catch { /* privater Modus */ } }
  }

  syncWins() {
    for (const r of this.winRows) r.classList.toggle('is-on', !this.wins.isHidden(r.dataset.mw));
  }

  /** Nur bei offenem Menü und gedrosselt aufrufen (hud.js, 4-mal pro Sekunde). */
  render(w, renderer, info) {
    const r = this.r;
    const s = w.sector;
    r.sec.set(s ? s.id + '  ' + String(s.name || '').toUpperCase() : '–');
    r.time.set(info.clock);
    r.pos.set(info.pos);
    r.state.set(info.state);
    r.hostiles.set(String(info.hostiles));
    const p = w.profile || {};
    r.call.set(String(p.callsign || '').toUpperCase());
    r.rank.set(info.rank + ' · ST ' + (p.level || 1));
    const sh = SHIPS[p.ship] || SHIPS.s1;
    r.ship.set(sh.name.toUpperCase() + ' · NR ' + sh.no);
    r.quest.set(info.quest);
    r.kills.set(info.kills);
    r.deaths.set(info.deaths);
    r.ftime.set(info.ftime);
    if (this.tab === 'flug') this._renderFlight(w, p);
    if (this.tab === 'system') {
      const perf = renderer && renderer._perf;
      r.fps.set(perf && perf.fps ? Math.round(perf.fps) + ' B/S' : '–');
      const sc = renderer && typeof renderer.scale === 'number' ? renderer.scale : 1;
      r.res.set(Math.round(sc * 100) + ' %');
      r.qual.set(renderer && renderer.lowQuality ? 'REDUZIERT' : 'VOLL');
      r.view.set(window.innerWidth + ' × ' + window.innerHeight);
      r.store.set(info.store);
    }
  }

  _renderFlight(w, p) {
    const pl = w.player;
    const g = this.g;
    const dt = 0.25;
    if (pl) {
      const hpM = pl.hpMax || 1, hp = Math.max(0, pl.hp || 0);
      g.hull.bar.set(hp / hpM, dt); g.hull.val.set(fmt(hp) + ' / ' + fmt(hpM)); g.hull.low.set(hp / hpM < 0.3);
      const shM = pl.shieldMax || 0, sh = Math.max(0, pl.shield || 0);
      g.shield.bar.set(shM ? sh / shM : 0, dt); g.shield.val.set(shM ? fmt(sh) + ' / ' + fmt(shM) : 'KEIN SCHILD');
    }
    const key = p.selectedAmmo || 'L1';
    const n = (p.ammo && p.ammo[key]) || 0;
    const pack = (AMMO[key] && AMMO[key].pack) || 1000;
    g.ammo.bar.set(n / (pack * 5), dt); g.ammo.val.set(key + ' · ' + fmt(n)); g.ammo.low.set(n <= 0);
    const cm = typeof w.cargoMax === 'number' ? w.cargoMax : ((SHIPS[p.ship] || SHIPS.s1).cargo || 0);
    let cu = typeof w.cargoUsed === 'number' ? w.cargoUsed : 0;
    if (!cu && p.cargo) for (const k in p.cargo) cu += p.cargo[k] || 0;
    g.cargo.bar.set(cm ? cu / cm : 0, dt); g.cargo.val.set(fmt(cu) + ' / ' + fmt(cm) + ' E');

    const ct = this.ct;
    for (const k in ct) { ct[k].n = 0; ct[k].d = Infinity; }
    if (w.entities && pl) {
      for (const e of w.entities.values()) {
        if (e.kind !== 'enemy' || e.alive === false) continue;
        const c = ct[e.type];
        if (!c) continue;
        c.n++;
        const dx = e.x - pl.x, dz = e.z - pl.z;
        const d = dx * dx + dz * dz;
        if (d < c.d) c.d = d;
      }
    }
    for (const k in ct) {
      const c = ct[k];
      c.zero.set(!c.n);
      c.cnt.set(c.n ? String(c.n) : '0');
      c.dist.set(c.n ? fmt(Math.sqrt(c.d)) + ' M' : '–');
    }
  }
}
