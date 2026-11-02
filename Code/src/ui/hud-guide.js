// SYSTEM-Karte im Flug: zeigt die aktuelle Einführungs-Quest (Funkspruch, Ziel, Fortschritt, Taste) und beim
// ersten Flug eines neuen Piloten die Wahl „Geführter Einstieg“ oder „Direkt spielen“. Taste G blendet die
// Karte ein und aus bzw. setzt die Reihe fort. Bausteine aus theme.css (Planung/UI_STIL.md).
import './hud-guide.css';
import { SYSTEM_QUESTS, SYSTEM_CHAPTERS } from '../sim/system-quests.js';

const fmt = (n) => Math.round(n).toLocaleString('de-DE');
// Ziele, die an der Station erledigt werden: Karte bleibt beim Andocken sichtbar
const STATION_GOALS = ['sell', 'buy', 'equip', 'drone'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class SystemGuide {
  constructor(root, series, world) {
    this.series = series;
    this.world = world;
    this.el = document.createElement('div');
    this.el.className = 'lsg';
    root.appendChild(this.el);
    this._key = '';
    this._onKey = (e) => {
      if (e.code !== 'KeyG' || e.repeat || e.target?.closest?.('input, textarea')) return;
      const s = series.state;
      if (s.mode !== 'guided' && !series.finished) series.choose('guided');
      else if (s.mode === 'guided') series.choose('direct');
      this.render(true);
    };
    window.addEventListener('keydown', this._onKey);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'guided' || act === 'direct') series.choose(act);
      else if (act === 'skip') series.skip();
      else if (act === 'hide') series.choose('direct');
      this.render(true);
    });
    this.render(true);
  }

  // Wird je Bild aufgerufen; baut nur neu, wenn sich etwas Sichtbares ändert
  render(force = false) {
    // höchstens 5× pro Sekunde neu bewerten (Entfernungsanzeige), sonst nur bei Änderung
    const now = performance.now();
    if (!force && now - (this._t || 0) < 200) return;
    this._t = now;
    const s = this.series, st = s.state, w = this.world;
    if (st.mode === 'guided' && !s.finished) s.reportUi(this._ui());
    let key, html;
    if (st.mode == null) {
      key = 'choice';
      html = `<div class="lsg-card ls-panel lsg-choice"><span class="ls-corners"></span>
        <div class="ls-head"><span class="ls-code">SYS</span><span class="ls-title">Erster Flug</span></div>
        <div class="lsg-body">
          <p class="lsg-text">Die Station kann dich Schritt für Schritt einweisen: fliegen, zielen, Munition. Du kannst die Einweisung jederzeit mit G aus- und wieder einblenden.</p>
          <div class="lsg-row">
            <button class="ls-btn is-fx" data-act="guided">Geführter Einstieg</button>
            <button class="ls-btn" data-act="direct">Direkt spielen</button>
          </div>
        </div></div>`;
    } else if (st.mode !== 'guided' || s.finished || (w.docked && !STATION_GOALS.includes(s.current.goal.type))) {
      key = 'off';
      html = '';
    } else {
      const q = s.current;
      const g = q.goal;
      const max = g.count || (g.type === 'fly' ? g.meters : 1);
      const prog = Math.min(max, st.progress || 0);
      let goalText = '';
      if (g.type === 'fly') goalText = `${fmt(prog)} / ${fmt(g.meters)} m geflogen${g.camera === 'chase' ? ' (Verfolgersicht)' : g.config ? ` (Konfiguration ${g.config})` : ''}`;
      else if (g.type === 'reach') {
        const wp = s.waypoint(), p = w.player;
        const d = wp && p ? Math.hypot(wp.x - p.x, wp.z - p.z) : 0;
        const ang = wp && p ? Math.atan2(wp.x - p.x, -(wp.z - p.z)) : 0;
        const dir = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
        goalText = `Wegpunkt ${fmt(Math.max(0, d - (wp?.r || 0)))} m · Richtung ${dir} (Karte)`;
      } else if (g.type === 'kill') goalText = `${prog} / ${g.count} Abschüsse${g.target ? ' ' + g.target[0].toUpperCase() + g.target.slice(1) : ''}`;
      else if (g.type === 'shoot') goalText = `${prog} / ${g.count} Treffer mit ${g.ammo}`;
      else if (g.type === 'brake') goalText = 'Auf über 150 m/s beschleunigen, dann anhalten';
      else if (g.type === 'camera') goalText = g.target === 'tactical' ? 'Taktische Ansicht einschalten' : 'Verfolgersicht einschalten';
      else if (g.type === 'target') goalText = 'Einen Gegner erfassen';
      else if (g.type === 'attack') goalText = 'Angriff auf das erfasste Ziel starten';
      else if (g.type === 'rocket') goalText = `${prog} / ${g.count} Treffer mit ${g.rocket}`;
      else if (g.type === 'arsenal') goalText = 'ARSENAL an der Schnellleiste öffnen';
      else if (g.type === 'bar') goalText = `Auf Leiste ${g.bar} umschalten`;
      else if (g.type === 'place') goalText = `${prog} / ${g.count} Plätze auf Leiste ${g.bar} belegt`;
      else if (g.type === 'extra') goalText = g.hits ? `${g.id} mit mindestens ${g.hits} Gegner${g.hits > 1 ? 'n' : ''} im Wirkkreis zünden` : g.combat ? `${g.id} einsetzen, während du angegriffen wirst` : `Getarnt den Angriff eröffnen`;
      else if (g.type === 'mine') goalText = `${g.ids.join(' oder ')} zünden lassen`;
      else if (g.type === 'tech') goalText = g.hits ? `${g.id} mit mindestens ${g.hits} Treffern` : g.combat ? `${g.id} im Kampf einsetzen` : `${g.id} bei Schild unter ${Math.round(g.shieldBelow * 100)} %`;
      else if (g.type === 'config') goalText = `Auf Konfiguration ${g.n} umschalten`;
      else if (g.type === 'wreck') goalText = `${prog} / ${g.count} Wracks eingesammelt`;
      else if (g.type === 'crate') goalText = `${prog} / ${g.count} Frachtkisten`;
      else if (g.type === 'ore') goalText = `${fmt(prog)} / ${g.count} ${g.ore === 'nickel' ? 'Nickel' : g.ore === 'cobalt' ? 'Cobalt' : g.ore}`;
      else if (g.type === 'dock') goalText = 'An der Station andocken (E)';
      else if (g.type === 'sell') goalText = 'Erz im Reiter ERZ verkaufen';
      else if (g.type === 'buy') goalText = `${g.id === 'ion' ? 'Ion Laser' : g.id} im Shop kaufen`;
      else if (g.type === 'equip') goalText = 'Im Hangar ein Teil umbauen';
      else if (g.type === 'drone') goalText = 'Eine Pioneer-Drohne kaufen';
      const r = q.reward || {};
      const rew = [r.credits && `${fmt(r.credits)} Cr`, r.tritium && `${fmt(r.tritium)} T`, r.xp && `${fmt(r.xp)} EP`, r.honor && `${fmt(r.honor)} Ehre`].filter(Boolean).join(' · ');
      const no = SYSTEM_QUESTS.indexOf(q) + 1;
      const pct = Math.round((prog / max) * 100);
      // Segmentierter Balken (10 Segmente)
      const seg = Array.from({ length: 10 }, (_, i) => `<i class="${i < Math.round(pct / 10) ? 'on' : ''}"></i>`).join('');
      key = `${q.id}|${goalText}|${pct}`;
      html = `<div class="lsg-card ls-panel"><span class="ls-corners"></span>
        <div class="ls-head"><span class="ls-code">SYSTEM · ${String(no).padStart(2, '0')}/${SYSTEM_QUESTS.length}</span><span class="ls-title">${esc(SYSTEM_CHAPTERS[q.ch] || '')}</span><span class="ls-spacer"></span>${q.key ? `<span class="ls-key">${esc(q.key)}</span>` : ''}</div>
        <div class="lsg-body">
          <div class="lsg-title">${esc(q.title)}</div>
          <p class="lsg-text">${esc(q.text)}</p>
          <div class="lsg-goal ls-num">${esc(goalText)}</div>
          <div class="lsg-seg">${seg}</div>
          <div class="lsg-row lsg-foot"><span class="ls-label">Lohn ${esc(rew)}</span><span class="ls-spacer"></span>
            <button class="lsg-link" data-act="skip" title="Ohne Belohnung weiter">Überspringen</button>
            <button class="lsg-link" data-act="hide" title="Mit G wieder einblenden">Ausblenden · G</button></div>
        </div></div>`;
    }
    if (!force && key === this._key) return;
    this._key = key;
    this.el.innerHTML = html;
    this.el.classList.toggle('lsg-dock', !!w.docked);
  }

  // Zustand der Schnellleiste für die SYSTEM-Reihe (Planung/SCHNITTSTELLEN.md: 'ls.hud.bar')
  _ui() {
    let bar = 1, filled = [];
    try {
      const b = JSON.parse(localStorage.getItem('ls.hud.bar') || 'null');
      if (b && Array.isArray(b.bars)) { bar = (b.cur | 0) + 1; filled = b.bars.map((row) => (row || []).filter(Boolean).length); }
    } catch { /* privater Modus */ }
    const ed = document.querySelector('[data-q="edit"]');
    return { arsenalOpen: !!ed && ed.getAttribute('aria-pressed') === 'true', bar, filled };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
