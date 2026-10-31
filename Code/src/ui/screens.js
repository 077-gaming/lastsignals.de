// Bildschirme vor dem Flug: Systemstart, Pilotenidentifikation, Fraktionswahl, Mission Control (Hub), Startsequenz.
// Bildsprache: Planung/UI_STIL.md. Bausteine: theme.css (.ls-*) und screens-kit.js.
// Hinter den Panels liegt die 3D-Bühne (screens-stage.js): Heimatplanet, Schiff, Station.
import './screens.css';
import { FACTIONS, SHIPS, BACKDROPS, QUESTS, sectorsFor } from '../core/data.js';
import {
  fmt, esc, pad2, wait, met, VERSION, accentOf as fxOf, rankOf as rankName, reduced, sky, mount, clockInto,
  panel, topStrip, footStrip, wordmark, emblem, alignMeter, settings, NEUTRAL_FX, FX_CODE, KODEX,
  signalScope, shipName, shipNo, doctrineOf,
} from './screens-kit.js';
import { hubScreen as hubImpl } from './screens-hub.js';
import { stage } from './screens-stage.js';

/** Rufname: 3–16 Zeichen, Buchstaben, Ziffern, - und _ */
export const CALLSIGN_RE = /^[\p{L}\p{N}_-]{3,16}$/u;
export const rankOf = rankName;
export const accentOf = fxOf;

// ---------------------------------------------------------------- 1) Systemstart

const BOOT_LINES = [
  [0, 'BORDRECHNER', 'Kaltstart, Speicher geprüft'],
  [280, 'DSN', 'Goldstone, Madrid, Canberra'],
  [640, 'FUNK', 'Träger erfasst, 8,4 GHz'],
  [960, 'NAVIGATION', 'Ephemeriden geladen'],
  [1280, 'STERNKARTE', 'Sektoren 01 bis 03 geladen'],
  [1620, 'LEBENSERHALTUNG', 'Druck und Sauerstoff im Soll'],
  [1940, 'ANTRIEB', 'Triebwerke im Leerlauf'],
  [2260, 'SCHILD', 'Emitter geprüft'],
  [2580, 'PERSONAL', 'Pilotenakten bereit'],
  [2960, 'SYSTEM', 'Start abgeschlossen'],
];

// Signal-Telemetrie, die vom Systemstart in die Anmeldung weiterläuft
const signal = { t0: 0, lock: 0 };

function scopePanel(code = 'TLM·01') {
  return panel(code, 'SIGNAL · DSN KANAL 08', '<span class="ls-label sc-live">EMPFANG</span>', `
    <div class="sg-row">
      <canvas class="sg-wave" width="560" height="72" aria-hidden="true" data-wave></canvas>
      <div class="sc-readouts four sg-ro">
        <div><span class="ls-label">TRÄGER</span><span class="ls-num">8,4 GHz</span></div>
        <div><span class="ls-label">PEGEL</span><span class="ls-num" data-dbm>-160 dBm</span></div>
        <div><span class="ls-label">DOPPLER</span><span class="ls-num" data-dop>+0,00 kHz</span></div>
        <div><span class="ls-label">LAUFZEIT</span><span class="ls-num" data-owlt>00:00</span></div>
      </div>
    </div>`, 'rise sg-pn', 'style="--d:3"');
}

/** Readouts des Signal-Panels nur bei Wertänderung schreiben */
function runSignal(s) {
  const $ = s.$;
  const dbm = $('[data-dbm]'), dop = $('[data-dop]'), owlt = $('[data-owlt]');
  if (!signal.t0) signal.t0 = performance.now();
  let lastSig = NaN, lastDop = '', lastOw = '';
  signalScope(s, $('[data-wave]'), () => signal.lock);
  s.every(() => {
    const t = performance.now() - signal.t0;
    const L = signal.lock;
    const sig = Math.round(-160 + L * 22 + (L >= 1 ? Math.sin(t / 900) * 0.6 : 0));
    if (sig !== lastSig) { lastSig = sig; dbm.textContent = `${sig} dBm`; }
    const d = `+${(2.31 + Math.sin(t / 700) * 0.04).toFixed(2).replace('.', ',')} kHz`;
    if (d !== lastDop) { lastDop = d; dop.textContent = d; }
    const sec = Math.floor(L * 79 + (L >= 1 ? (t / 1000 - 3.3) * 0.02 : 0));
    const ow = `${pad2(Math.floor(sec / 60))}:${pad2(sec % 60)}`;
    if (ow !== lastOw) { lastOw = ow; owlt.textContent = ow; }
  }, 100);
}

function neutralBody() { delete document.body.dataset.faction; }

export async function bootSequence(root) {
  neutralBody();
  const st = stage.available();
  const s = mount(root, 'boot', 'Systemstart', NEUTRAL_FX, { stage: st });
  const DUR = 3300;
  const rows = BOOT_LINES.map(([at, sys, text], i) => `<div class="bt-row" data-i="${i}">
      <span class="bt-t ls-num">T+${met(at).slice(3, 10)}</span><span class="bt-sys">${sys}</span><span class="bt-m">${esc(text)}</span><span class="bt-s">----</span></div>`).join('');
  s.inner.innerHTML = `
  <div class="sc-page boot">
    ${topStrip('SYSTEMSTART', `<span class="sc-ro"><span class="ls-label">MET</span><span class="ls-num" data-met>00:00:00.0</span></span>`)}
    <main class="boot-main">
      <div class="boot-left rise" style="--d:1">
        ${wordmark()}
        <div class="boot-prog">
          <div class="boot-prog-head"><span class="ls-label">SYSTEMSTART</span><span class="boot-step" data-step>BORDRECHNER</span><span class="boot-pct ls-num"><b data-pct>000</b><small>%</small></span></div>
          <div class="ls-bar boot-bar is-shield" style="--v:0;--trail:0" data-bar role="progressbar" aria-label="Systemstart" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          <div class="ls-tick boot-tick"></div>
          <div class="boot-scale ls-label"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
        </div>
      </div>
      <div class="boot-right">
        ${panel('SYS·00', 'STARTPROTOKOLL', '<span class="ls-label" data-count>00/10</span>', `<div class="bt-log" role="log" aria-live="polite">${rows}</div>`, 'rise', 'style="--d:2"')}
        ${scopePanel()}
      </div>
    </main>
    ${footStrip('BODENSTATIONEN GOLDSTONE · MADRID · CANBERRA', '<span class="ls-key">TASTE</span> ODER KLICK: ÜBERSPRINGEN', VERSION)}
  </div>`;
  const $ = s.$;
  const bar = $('[data-bar]'), pctEl = $('[data-pct]'), metEl = $('[data-met]'), stepEl = $('[data-step]');
  const countEl = $('[data-count]');
  const rowEls = Array.from(s.inner.querySelectorAll('.bt-row'));
  const stEls = rowEls.map((r) => r.querySelector('.bt-s'));
  clockInto(s, $('[data-clock]'));
  signal.t0 = performance.now();
  signal.lock = 0;
  runSignal(s);
  // 3D-Szene erst nach dem ersten Bild aufbauen: Protokoll steht sofort, Szene blendet ein, wenn bereit
  if (st) s.timer(() => { stage.prepare({ mode: 'boot', faction: 'neutral' }); }, 30);

  return new Promise((resolve) => {
    const t0 = performance.now();
    let idx = 0, lastPct = -1, lastDs = -1, ending = false;
    const setRow = (i, stt) => {
      rowEls[i].dataset.st = stt;
      stEls[i].textContent = stt === 'ok' ? 'OK' : stt === 'run' ? 'LÄUFT' : '----';
    };
    const advance = (to) => {
      while (idx < to && idx < BOOT_LINES.length) {
        if (idx > 0) setRow(idx - 1, 'ok');
        setRow(idx, 'run');
        stepEl.textContent = BOOT_LINES[idx][1];
        idx++;
        countEl.textContent = `${pad2(idx)}/${pad2(BOOT_LINES.length)}`;
      }
    };
    const finish = async () => {
      if (ending) return;
      ending = true;
      advance(BOOT_LINES.length);
      setRow(BOOT_LINES.length - 1, 'ok');
      stEls[BOOT_LINES.length - 1].textContent = 'BEREIT';
      bar.style.setProperty('--v', '1');
      pctEl.textContent = '100';
      stepEl.textContent = 'BEREIT';
      bar.setAttribute('aria-valuenow', '100');
      signal.lock = 1;
      s.scr.classList.add('is-done');
      await wait(reduced() ? 100 : 380);
      await s.close(260);
      // erst die Oberfläche weg, dann der Anflug auf den Planeten, dann die Anmeldung
      if (st && !reduced()) { stage.setMode('login'); await wait(700); }
      resolve();
    };
    s.loop((now) => {
      if (ending) return;
      const t = now - t0;
      const p = t >= DUR ? 1 : t <= 0 ? 0 : t / DUR;
      const e = p * (2 - p);
      const pct = (e * 100) | 0;
      if (pct !== lastPct) {
        lastPct = pct;
        pctEl.textContent = String(pct).padStart(3, '0');
        bar.style.setProperty('--v', (pct / 100).toFixed(2));
        bar.setAttribute('aria-valuenow', pct);
      }
      const ds = (t / 100) | 0;
      if (ds !== lastDs) { lastDs = ds; metEl.textContent = met(t); }
      signal.lock = e;
      let to = idx;
      while (to < BOOT_LINES.length && t >= BOOT_LINES[to][0]) to++;
      if (to !== idx) advance(to);
      if (p >= 1) finish();
    });
    const skip = (ev) => {
      if (ev.type === 'keydown' && (ev.key === 'Shift' || ev.key === 'Meta' || ev.key === 'Alt' || ev.key === 'Control')) return;
      ev.preventDefault?.();
      finish();
    };
    s.on(window, 'keydown', skip);
    s.on(s.scr, 'pointerdown', skip);
  });
}

// ---------------------------------------------------------------- 2) Pilotenidentifikation

function codeLength(v) { let n = 0; for (const _ of v) n++; return n; }

export async function loginScreen(root, store) {
  neutralBody();
  signal.lock = 1;
  let pilots = [];
  try { pilots = (store.list() || []).filter((p) => p && typeof p.callsign === 'string'); } catch { pilots = []; }
  let last = '';
  try { last = store.lastCallsign() || ''; } catch { last = ''; }
  const lastLc = last.toLowerCase();
  pilots.sort((a, b) =>
    (b.callsign.toLowerCase() === lastLc) - (a.callsign.toLowerCase() === lastLc)
    || (b.level || 1) - (a.level || 1)
    || a.callsign.localeCompare(b.callsign, 'de'));
  let lastP = null;
  try { lastP = last ? store.get(last) : null; } catch { lastP = null; }
  const st = stage.available();
  if (st) stage.setMode('login');
  const s = mount(root, 'login', 'Pilotenidentifikation', NEUTRAL_FX, { stage: st });
  let storeKb = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); storeKb += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch { storeKb = 0; }
  storeKb = Math.max(1, Math.round(storeKb / 1024));

  const rowsHtml = pilots.length
    ? pilots.map((p, i) => {
      const f = FACTIONS[p.faction];
      const lv = p.level || 1;
      return `<button type="button" class="pi-row" data-cs="${esc(p.callsign)}" style="--fx:${fxOf(p.faction)}">
        <span class="pi-c ls-num">${pad2(i + 1)}</span>
        <span class="pi-c pi-name">${esc(p.callsign)}</span>
        <span class="pi-c pi-fx"><i></i><b>${esc(FX_CODE[p.faction] || '--')}</b>${esc(f ? f.name : '----')}</span>
        <span class="pi-c ls-num">${pad2(lv)}</span>
        <span class="pi-c pi-rank">${esc(rankOf(lv))}</span>
        <span class="pi-c pi-last">${p.callsign.toLowerCase() === lastLc ? 'ZULETZT' : ''}</span>
      </button>`;
    }).join('')
    : '<div class="pi-empty"><span class="ls-label">KEINE AKTE IM DSN-REGISTER</span><span>RUFNAME EINGEBEN · AKTE WIRD ANGELEGT</span></div>';

  s.inner.innerHTML = `
  <div class="sc-page login">
    ${topStrip('PILOTENIDENTIFIKATION', `<span class="sc-ro"><span class="ls-label">STATION</span><span class="ls-num">BODEN 01</span></span>`, false)}
    <main class="login-main">
      <div class="login-left">
        <div class="rise" style="--d:1">${wordmark()}</div>
        ${panel('ID·01', 'ZUGANG · RUFNAME', '<span class="ls-label" data-mode>EINGABE</span>', `
          <form data-form novalidate autocomplete="off" class="pi-form">
            <div class="pi-field" data-field>
              <span class="pi-prompt">&gt;</span>
              <input id="sc-callsign" name="callsign" type="text" maxlength="16" spellcheck="false" aria-label="Rufname"
                autocapitalize="off" autocorrect="off" autocomplete="off" aria-describedby="sc-callsign-msg" data-input>
              <span class="pi-count ls-num" data-count>00/16</span>
            </div>
            <div class="ls-tick pi-tick"></div>
            <p class="pi-msg" id="sc-callsign-msg" aria-live="polite" data-msg><i></i><span data-msgt></span></p>
            <div class="pi-actions">
              <span class="ls-label">3–16 ZEICHEN · A-Z 0-9 - _</span>
              <button class="ls-btn is-fx pi-go" type="submit" data-go>ANMELDEN <span class="ls-key">ENTER</span></button>
            </div>
          </form>`, 'rise', 'style="--d:2"')}
        ${panel('ID·02', 'PILOTENAKTEN · DSN-REGISTER', `<span class="ls-num">${pad2(pilots.length)}</span>`, `
          <div class="pi-table">
            <div class="pi-th"><span>NR</span><span>RUFNAME</span><span>FRAKTION</span><span>ST</span><span>RANG</span><span></span></div>
            <div class="pi-list" data-list>${rowsHtml}</div>
          </div>`, 'rise pi-pilots', `style="--d:3;--rows:${pilots.length ? Math.min(pilots.length, 6) : 2}"`)}
      </div>
      <div class="sc-view login-view" data-view>
        <div class="vw-tag rise" style="--d:4" data-vtag hidden><span class="ls-label" data-vk>AKTE</span><b data-vt></b><span class="ls-num" data-vs></span></div>
      </div>
      <div class="login-band">
        ${panel('SYS·03', 'BODENSTATION', '<span class="ls-label sc-live">VERBUNDEN</span>', `
          <div class="sc-readouts four login-sys">
            <div><span class="ls-label">AKTEN</span><span class="ls-num">${pad2(pilots.length)}</span></div>
            <div><span class="ls-label">ZULETZT</span><span class="ls-num">${esc((last || '----').toUpperCase())}</span></div>
            <div><span class="ls-label">SPEICHER</span><span class="ls-num">${storeKb} KB</span></div>
            <div><span class="ls-label">VERSION</span><span class="ls-num">${VERSION.replace('BUILD ', '')}</span></div>
          </div>`, 'rise login-brief', 'style="--d:3"')}
        ${scopePanel('TLM·02')}
      </div>
    </main>
    ${footStrip('VERBINDUNG DEEP SPACE NETWORK', '<span class="ls-key">ENTER</span> ANMELDEN &nbsp; <span class="ls-key">↓</span> AKTE WÄHLEN', VERSION)}
  </div>`;
  const $ = s.$;
  const form = $('[data-form]'), input = $('[data-input]'), msg = $('[data-msg]'), msgT = $('[data-msgt]'), count = $('[data-count]');
  const field = $('[data-field]'), list = $('[data-list]'), mode = $('[data-mode]');
  const vk = $('[data-vk]'), vt = $('[data-vt]'), vs = $('[data-vs]'), vtag = $('[data-vtag]');
  clockInto(s, $('[data-clock]'));
  runSignal(s);
  stage.frame($('[data-view]'));
  const onResize = () => stage.frame($('[data-view]'));
  s.on(window, 'resize', onResize);
  // Szene der letzten Akte nach dem ersten Bild aufbauen
  if (st) s.timer(() => { stage.prepare({ mode: 'login', faction: lastP?.faction || 'neutral', ship: lastP?.ship || 's1', loadout: lastP?.loadout }); }, 30);

  const check = (raw) => {
    const v = raw.trim();
    const len = codeLength(v);
    if (!v) return { ok: false, err: false, msg: 'RUFNAME EINGEBEN' };
    if (!/^[\p{L}\p{N}_-]*$/u.test(v)) return { ok: false, err: true, msg: 'UNGÜLTIGE ZEICHEN · NUR A-Z 0-9 - _' };
    if (len < 3) return { ok: false, err: false, msg: `MINDESTENS 3 ZEICHEN · NOCH ${3 - len}` };
    if (len > 16) return { ok: false, err: true, msg: 'HÖCHSTENS 16 ZEICHEN' };
    // Geschlossene Testphase: online nur Tonis Rufname (VITE_ALLOWED_CALLSIGNS, kommagetrennt)
    const allowed = (import.meta.env.VITE_ALLOWED_CALLSIGNS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(v.toLowerCase())) return { ok: false, err: true, msg: 'GESCHLOSSENE TESTPHASE · ZUGANG NUR FÜR FREIGEGEBENE PILOTEN' };
    let p = null;
    try { p = store.get(v); } catch { p = null; }
    if (p) {
      const f = FACTIONS[p.faction];
      return { ok: true, v, p, msg: `AKTE GEFUNDEN · ${f ? f.name : ''} · ST ${pad2(p.level || 1)} · ${rankOf(p.level || 1).toUpperCase()}` };
    }
    return { ok: true, v, p: null, msg: 'KEINE AKTE · NEUER PILOT · ZUTEILUNG FOLGT' };
  };

  // Farbe und Szene folgen der gewählten Akte; ohne Akte neutral
  let curFx = '';
  const setFx = (p) => {
    const f = p && FACTIONS[p.faction] ? p.faction : '';
    if (f === curFx) return;
    curFx = f;
    s.scr.style.setProperty('--fx', f ? fxOf(f) : NEUTRAL_FX);
    s.scr.dataset.scopeCol = f ? fxOf(f) : '';
    if (f) stage.setShip(p.ship || 's1', p.loadout);
    stage.setFaction(f || 'neutral');
    // Szenenschild nur mit erkannter Akte
    vtag.hidden = !f;
    if (!f) return;
    const home = sectorsFor(f)[p.sector];
    vk.textContent = `AKTE · ${FX_CODE[f]}`;
    vt.textContent = `${shipName(p.ship).toUpperCase()} · ${(home?.name || FACTIONS[f].name).toUpperCase()}`;
    vs.textContent = `NR ${pad2(shipNo(p.ship))} · ${p.sector || ''}`;
    // Heimatstation schon jetzt im Hintergrund vorbauen (Hub öffnet ohne Wartezeit)
    stage.warm({ faction: f, ship: p.ship || 's1', loadout: p.loadout });
  };

  let prevMsg = '', prevCount = '', prevState = '';
  let fxTimer = 0;
  const refresh = (showErr = false) => {
    const r = check(input.value);
    if (r.msg !== prevMsg) { prevMsg = r.msg; msgT.textContent = r.msg; }
    const c = `${pad2(codeLength(input.value.trim()))}/16`;
    if (c !== prevCount) { prevCount = c; count.textContent = c; }
    const stt = r.ok ? (r.p ? 'known' : 'new') : (r.err || showErr ? 'err' : 'idle');
    if (stt !== prevState) {
      prevState = stt;
      field.dataset.state = stt;
      msg.dataset.state = stt;
      mode.textContent = stt === 'known' ? 'AKTE VORHANDEN' : stt === 'new' ? 'NEUE AKTE' : stt === 'err' ? 'FEHLER' : 'EINGABE';
      input.setAttribute('aria-invalid', stt === 'err' ? 'true' : 'false');
    }
    // Szene erst nach kurzer Tipp-Pause wechseln (Planet wird gebacken)
    clearTimeout(fxTimer);
    fxTimer = setTimeout(() => setFx(r.p || null), 220);
    return r;
  };

  input.value = last;
  refresh();
  clearTimeout(fxTimer);
  setFx(check(last).p || null);
  // Schreibmarke ans Ende statt Komplettauswahl
  s.timer(() => { input.focus({ preventScroll: true }); const n = input.value.length; input.setSelectionRange(n, n); }, reduced() ? 0 : 220);

  return new Promise((resolve) => {
    let done = false;
    const submit = async () => {
      if (done) return;
      const r = refresh(true);
      if (!r.ok) {
        field.classList.remove('jolt'); void field.offsetWidth; field.classList.add('jolt');
        input.focus();
        return;
      }
      done = true;
      clearTimeout(fxTimer);
      const result = { callsign: r.p ? r.p.callsign : r.v, isNew: r.p === null };
      if (r.p) document.body.dataset.faction = r.p.faction;
      await s.close();
      resolve(result);
    };
    s.on(input, 'input', () => refresh());
    s.on(form, 'submit', (e) => { e.preventDefault(); submit(); });
    s.on(list, 'click', (e) => {
      const b = e.target.closest('[data-cs]');
      if (!b) return;
      input.value = b.dataset.cs;
      refresh();
      submit();
    });
    s.on(s.inner, 'keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = list.querySelectorAll('[data-cs]');
      if (!rows.length) return;
      const a = document.activeElement;
      let i = -1;
      for (let k = 0; k < rows.length; k++) if (rows[k] === a) i = k;
      if (a === input) { if (e.key === 'ArrowDown') { e.preventDefault(); rows[0].focus(); } return; }
      if (i < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') rows[Math.min(rows.length - 1, i + 1)].focus();
      else if (i === 0) input.focus();
      else rows[i - 1].focus();
    });
  });
}

// ---------------------------------------------------------------- 3) Fraktionswahl

function homesOf(id) {
  try { return Object.values(sectorsFor(id)).sort((a, b) => a.index - b.index); } catch { return []; }
}

const PLANET = { europa: ['EUROPA', 'JUPITERMOND'], saturn: ['SATURN', 'RINGPLANET'], eris: ['ERIS', 'ZWERGPLANET'] };
const DOCTRINE_LV = { gut: 1, mittelböse: 2, böse: 3 };

/** Vergleich der Fraktionen als Messskala: Doktrin, Heimatgefahr, Startsektor */
function compare(ids) {
  const rows = ids.map((id) => {
    const f = FACTIONS[id];
    const lv = DOCTRINE_LV[f.alignment] || 1;
    const start = homesOf(id)[0];
    return `<div class="fs-cmp-r" data-cmp style="--fx:${fxOf(id)}">
      <span class="fs-cmp-c">${esc(FX_CODE[id])}</span>
      <span class="fs-cmp-d"><span class="fs-cmp-seg">${[1, 2, 3].map((k) => `<i class="${k <= lv ? 'on' : ''}"></i>`).join('')}</span><span>${doctrineOf(f.alignment)}</span></span>
      <span class="fs-cmp-h">${esc((BACKDROPS[id]?.hazard || '').toUpperCase())}</span>
      <span class="fs-cmp-s ls-num">${esc(start ? start.id : '')}</span>
    </div>`;
  }).join('');
  return `<div class="fs-cmp-th"><span></span><span>DOKTRIN</span><span>HEIMATGEFAHR</span><span>START</span></div>${rows}
    <div class="fs-cmp-scale"><div class="ls-tick"></div><div class="ls-label"><span>SCHUTZ</span><span>HANDEL</span><span>VERGELTUNG</span></div></div>`;
}

export async function factionSelect(root) {
  const ids = ['europa', 'saturn', 'eris'].filter((id) => FACTIONS[id]);
  const st = stage.available();
  if (st) stage.setMode('faction');
  const s = mount(root, 'faction', 'Fraktionswahl', fxOf(ids[0]), { stage: st });
  const list = ids.map((id, i) => {
    const f = FACTIONS[id];
    return `<button type="button" role="radio" aria-checked="false" class="fs-item" style="--fx:${fxOf(id)}" data-i="${i}">
      <span class="fs-item-k ls-key">${i + 1}</span>
      ${emblem(id, 'sc-emb fs-item-emb')}
      <span class="fs-item-tx">
        <b>${esc(f.name)}</b>
        <span class="fs-item-t">${esc(f.title.toUpperCase())}</span>
        <span class="ls-label">DOKTRIN ${doctrineOf(f.alignment)}</span>
      </span>
      <span class="fs-item-c" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </button>`;
  }).join('');

  const dossier = (id) => {
    const f = FACTIONS[id];
    const homes = homesOf(id);
    return `
      <div class="fs-dos-id">${emblem(id, 'sc-emb fs-dos-emb')}<div><span class="ls-label">FRAKTION · ${esc(f.prefix)}</span><b>${esc(f.name)}</b>${alignMeter(f.alignment)}</div></div>
      <blockquote class="fs-motto">„${esc(f.motto)}“</blockquote>
      <div class="mc-kvs">
        <div class="sc-kv"><span class="ls-label">ANFÜHRUNG</span><span>${esc(f.leader)}</span></div>
        <div class="sc-kv"><span class="ls-label">FUNKRUF</span><span>${esc(f.stationVoice)}</span></div>
        <div class="sc-kv"><span class="ls-label">HEIMATGEFAHR</span><span>${esc(BACKDROPS[id]?.hazard || '')}</span></div>
      </div>
      <div class="mc-sub"><span class="ls-code">GS</span><span>GESCHICHTE</span></div>
      <p class="fs-story">${esc(f.story)}</p>
      <div class="mc-sub"><span class="ls-code">KX</span><span>KODEX</span></div>
      <ol class="mc-kodex">${(KODEX[id] || []).map((t, i) => `<li><span class="ls-num">§${i + 1}</span><span>${esc(t)}</span></li>`).join('')}</ol>
      <div class="mc-sub"><span class="ls-code">HM</span><span>HEIMATSEKTOREN</span><span class="ls-spacer"></span><span class="ls-label">STUFE</span></div>
      <div class="mc-table fs-homes">${homes.map((h) => `<div class="mc-tr"><span class="ls-num">${esc(h.id)}</span><span>${esc(h.name.toUpperCase())}</span><span class="ls-label">${h.station ? 'STATION' : ''}</span><span class="ls-num">${h.levelMin}–${h.levelMax}</span></div>`).join('')}</div>`;
  };

  s.inner.innerHTML = `
  <div class="sc-page faction">
    ${topStrip('FRAKTIONSWAHL', `<span class="sc-ro"><span class="ls-label">SCHRITT</span><span class="ls-num">02/02</span></span>`)}
    <main class="fs-main">
      <div class="fs-left rise" style="--d:1">
        <div class="fs-head"><span class="ls-label">NEUER PILOT · ZUTEILUNG</span><h2 class="sc-h1">FRAKTION</h2><p class="fs-sub">Gleiche Startausrüstung für alle. Heimat, Kodex und Farbe verschieden. Zuteilung gilt für diese Akte.</p></div>
        <div class="fs-list" role="radiogroup" aria-label="Fraktion wählen" data-list>${list}</div>
        ${panel('VG·01', 'VERGLEICH', '<span class="ls-label">STARTWERTE GLEICH</span>', compare(ids), 'fs-cmp', '')}
      </div>
      <div class="sc-view fs-view" data-view>
        <div class="fs-name rise" style="--d:3">
          <span class="ls-label" data-pl>HEIMAT</span>
          <b data-nm>EUROPA</b>
          <span class="fs-name-t" data-tt></span>
        </div>
      </div>
      ${panel('FR·DS', 'DOSSIER', '<span class="ls-num" data-dcode>FR·01</span>', '<div class="fs-dos" data-dos></div>', 'fs-right rise', 'style="--d:2"')}
    </main>
    <footer class="fs-cmd rise" style="--d:5">
      <span class="ls-label"><span class="ls-key">↑</span> <span class="ls-key">↓</span> ODER <span class="ls-key">1</span>–<span class="ls-key">3</span> WÄHLEN</span>
      <span class="fs-cmd-sel"><span class="ls-label">ZUTEILUNG</span><b data-sel>EUROPA</b></span>
      <button type="button" class="ls-btn is-fx fs-go" data-go><span data-go-label>FÜR EUROPA FLIEGEN</span><span class="ls-key">ENTER</span></button>
    </footer>
  </div>`;
  const $ = s.$;
  const els = Array.from(s.inner.querySelectorAll('.fs-item'));
  const go = $('[data-go]'), goLabel = $('[data-go-label]'), selEl = $('[data-sel]');
  const nm = $('[data-nm]'), tt = $('[data-tt]'), pl = $('[data-pl]'), dos = $('[data-dos]'), dcode = $('[data-dcode]');
  clockInto(s, $('[data-clock]'));
  stage.frame($('[data-view]'));
  s.on(window, 'resize', () => stage.frame($('[data-view]')));
  const cmpRows = Array.from(s.inner.querySelectorAll('[data-cmp]'));
  // erste Heimat aufbauen, die anderen im Hintergrund vorbereiten (Wechsel ohne Ruckeln)
  if (st) s.timer(async () => { await stage.prepare({ mode: 'faction', ship: 's1', loadout: null }); if (!s.closed) stage.preload(ids); }, 30);

  let sel = -1;
  const select = (i, focus = true) => {
    i = (i + ids.length) % ids.length;
    if (i === sel) { if (focus) els[i].focus(); return; }
    if (sel >= 0) { els[sel].classList.remove('is-sel'); els[sel].setAttribute('aria-checked', 'false'); els[sel].tabIndex = -1; }
    sel = i;
    const id = ids[i], f = FACTIONS[id], el = els[i];
    el.classList.add('is-sel'); el.setAttribute('aria-checked', 'true'); el.tabIndex = 0;
    s.scr.style.setProperty('--fx', fxOf(id));
    s.scr.dataset.sel = id;
    selEl.textContent = f.name;
    goLabel.textContent = `FÜR ${f.name} FLIEGEN`;
    nm.textContent = PLANET[id]?.[0] || f.name;
    pl.textContent = `HEIMAT · ${PLANET[id]?.[1] || ''}`;
    tt.textContent = `${f.title.toUpperCase()} · ${(BACKDROPS[id]?.hazard || '').toUpperCase()}`;
    dos.innerHTML = dossier(id);
    dcode.textContent = `FR·0${i + 1}`;
    cmpRows.forEach((r, k) => r.classList.toggle('is-sel', k === i));
    stage.setFaction(id);
    if (!reduced()) { const n = $('.fs-name'); n.classList.remove('ls-enter'); void n.offsetWidth; n.classList.add('ls-enter'); }
    if (focus) el.focus({ preventScroll: true });
  };
  els.forEach((el) => { el.tabIndex = -1; });
  select(0, false);
  s.timer(() => els[sel]?.focus({ preventScroll: true }), reduced() ? 0 : 260);

  return new Promise((resolve) => {
    let done = false;
    const confirm = async () => {
      if (done || sel < 0) return;
      done = true;
      els[sel].classList.add('is-go');
      document.body.dataset.faction = ids[sel];
      stage.warm({ faction: ids[sel] });
      await wait(reduced() ? 0 : 160);
      await s.close(260);
      resolve(ids[sel]);
    };
    s.on($('[data-list]'), 'click', (e) => {
      const c = e.target.closest('.fs-item');
      if (!c) return;
      const i = Number(c.dataset.i);
      if (i === sel && e.detail >= 2) { confirm(); return; }
      select(i);
    });
    s.on(go, 'click', confirm);
    s.on(window, 'keydown', (e) => {
      if (done) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); select(sel + 1); }
      else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); select(sel - 1); }
      else if (k >= '1' && k <= String(ids.length)) { e.preventDefault(); select(Number(k) - 1); }
      else if (k === 'Enter') {
        if (document.activeElement === go) return;
        e.preventDefault(); confirm();
      }
    });
  });
}

// ---------------------------------------------------------------- 4) Mission Control

export async function hubScreen(root, profile, store) {
  return hubImpl(root, profile, store);
}

// ---------------------------------------------------------------- 5) Startsequenz

export async function launchSequence(root, profile) {
  const P = profile || {};
  // Abdock-Aufnahme in der 3D-Bühne, wenn sie aus dem Hub noch läuft; sonst Sternenflug in 2D
  const st3d = stage.available() && stage.visible && stage.launch();
  if (!st3d) stage.hide();
  const s = mount(root, 'launch', 'Startsequenz', fxOf(P.faction), { stage: st3d });
  if (st3d) s.scr.classList.add('is-3d');
  const RM = reduced();
  let sector = null;
  try { sector = sectorsFor(P.faction)[P.sector] || null; } catch { sector = null; }
  const ship = SHIPS[P.ship] || SHIPS.s1;
  const lasers = (P.loadout?.lasers || []).length;
  const gens = (P.loadout?.gens || []).length;
  const q = QUESTS[P.quest?.index || 0];
  const items = [
    ['FLUGLEITUNG', 'Startfenster offen'],
    ['ANTRIEB', `Schub ${fmt(ship.speed)} m/s`],
    ['SCHILD', `${gens} Gen. geladen`],
    ['WAFFEN', `${lasers}/${ship.laserSlots} Laser, ${P.selectedAmmo || 'L1'} geladen`],
    ['NAVIGATION', `Kurs ${P.sector || ''} ${sector ? sector.name.toUpperCase() : ''}`],
    ['PILOT', `${(P.callsign || '').toUpperCase()} bereit`],
  ];
  const STEP = 640, FIRST = 380, END = 5000;
  s.inner.innerHTML = `
  <div class="sc-page launch">
    ${topStrip('STARTSEQUENZ', `<span class="sc-ro"><span class="ls-label">ZIEL</span><span class="ls-num">${esc(P.sector || '')}</span></span>`)}
    <main class="ln-main">
      ${panel('GO·01', 'GO / NO-GO', '<span class="ls-label" data-goc>0/6</span>', `
        <ol class="ln-poll" data-check>
          ${items.map(([a, b], i) => `<li data-i="${i}"><span class="ln-n ls-num">${pad2(i + 1)}</span><span class="ln-a">${a}</span><span class="ln-b">${esc(b)}</span><span class="ln-st">WARTET</span></li>`).join('')}
        </ol>`, 'ln-left rise', 'style="--d:1"')}
      <div class="ln-center rise" style="--d:2">
        <div class="sc-view ln-view" data-view></div>
        <span class="ls-label ln-k" data-state>STARTVORBEREITUNG</span>
        <div class="ln-count ls-num" aria-live="assertive" aria-atomic="true"><span class="ln-tm">T-</span><b data-num>05</b></div>
        <div class="ln-ms ls-num" data-ms>00:00:05.0</div>
        <div class="ln-scale">
          <div class="ls-bar ln-bar is-shield" style="--v:0;--trail:0" data-bar></div>
          <div class="ls-tick"></div>
          <div class="ln-scale-l ls-label"><span>T-5</span><span>T-4</span><span>T-3</span><span>T-2</span><span>T-1</span><span>T-0</span></div>
        </div>
        <div class="ln-dest"><span class="ls-label">ZIEL</span><b>${esc(sector ? sector.name.toUpperCase() : '')}</b><span class="ls-num">${esc(P.sector || '')}</span><span class="ls-label">STUFE ${sector ? `${sector.levelMin}–${sector.levelMax}` : ''}${sector?.station ? ' · STATION' : ''}</span></div>
      </div>
      ${panel('TLM·02', 'TELEMETRIE', '<span class="ls-label sc-live">LIVE</span>', `
        <div class="ln-tlm">
          <div class="ln-g"><span class="ls-label">SCHUB</span><div class="ls-bar" style="--v:0;--trail:0" data-thr></div><span class="ls-num" data-thrv>000 %</span></div>
          <div class="ln-g"><span class="ls-label">REAKTOR</span><div class="ls-bar" style="--v:.2;--trail:0" data-rea></div><span class="ls-num" data-reav>0412 K</span></div>
          <div class="ln-g"><span class="ls-label">SCHILD</span><div class="ls-bar is-shield" style="--v:1;--trail:0"></div><span class="ls-num">100 %</span></div>
          <div class="ln-g"><span class="ls-label">HÜLLE</span><div class="ls-bar" style="--v:1;--trail:0"></div><span class="ls-num">${fmt(ship.hp)}</span></div>
        </div>
        <div class="sc-readouts two">
          <div><span class="ls-label">SCHIFF</span><span class="ls-num">${esc(shipName(P.ship).toUpperCase())} · NR ${pad2(shipNo(P.ship))}</span></div>
          <div><span class="ls-label">AUFTRAG</span><span class="ls-num">${esc(q ? q.title.toUpperCase() : 'FREIER FLUG')}</span></div>
        </div>`, 'ln-right rise', 'style="--d:3"')}
    </main>
    ${footStrip(`PILOT ${esc((P.callsign || '').toUpperCase())} · ${esc(rankOf(P.level || 1).toUpperCase())}`, '<span class="ls-key">TASTE</span> ODER KLICK: SOFORT STARTEN', VERSION)}
  </div>`;
  const $ = s.$;
  const num = $('[data-num]'), state = $('[data-state]'), msEl = $('[data-ms]'), bar = $('[data-bar]'), goc = $('[data-goc]');
  const thr = $('[data-thr]'), thrv = $('[data-thrv]'), rea = $('[data-rea]'), reav = $('[data-reav]');
  const lis = Array.from(s.inner.querySelectorAll('[data-check] li'));
  const stEls = lis.map((li) => li.querySelector('.ln-st'));
  clockInto(s, $('[data-clock]'));
  if (st3d) { stage.frame($('[data-view]')); s.on(window, 'resize', () => stage.frame($('[data-view]'))); }
  let checked = -1;

  const mark = (upto) => {
    while (checked < upto && checked < lis.length - 1) {
      checked++;
      lis[checked].classList.remove('is-run');
      lis[checked].classList.add('is-ok');
      stEls[checked].textContent = 'GO';
      goc.textContent = `${checked + 1}/${lis.length}`;
    }
    const nxt = checked + 1;
    if (nxt < lis.length && !lis[nxt].classList.contains('is-run')) {
      lis[nxt].classList.add('is-run');
      stEls[nxt].textContent = 'PRÜFT';
    }
  };

  return new Promise((resolve) => {
    const t0 = performance.now();
    let lastN = 6, lastDs = -1, lastThr = -1, ending = false;
    const go = async () => {
      if (ending) return;
      ending = true;
      mark(lis.length - 1);
      num.textContent = '00';
      state.textContent = 'START';
      bar.style.setProperty('--v', '1');
      s.scr.classList.add('is-go');
      if (st3d) stage.ignite(); else sky.setWarp(1);
      flash(RM);
      await wait(RM ? 200 : 180);
      if (st3d) stage.hide();
      await s.close(0);
      resolve();
    };
    if (!st3d) sky.setWarp(0.05);
    s.loop((now) => {
      if (ending) return;
      const t = Math.max(0, now - t0);
      const n = Math.max(0, 5 - Math.floor(t / 1000));
      if (n !== lastN) {
        lastN = n;
        num.textContent = pad2(n);
        if (n === 4) state.textContent = 'SYSTEME PRÜFEN';
        else if (n === 2) { state.textContent = 'ZÜNDUNG'; if (st3d) stage.ignite(); else sky.setWarp(0.4); s.scr.classList.add('is-ign'); }
        else if (n === 1) state.textContent = 'STARTFREIGABE ERTEILT';
      }
      const ds = (Math.max(0, END - t) / 100) | 0;
      if (ds !== lastDs) {
        lastDs = ds;
        msEl.textContent = met(END - t);
        bar.style.setProperty('--v', Math.min(1, t / END).toFixed(3));
        const th = Math.round(Math.max(0, Math.min(1, (t - 2600) / 2200)) * 100);
        if (th !== lastThr) {
          lastThr = th;
          thr.style.setProperty('--v', (th / 100).toFixed(2));
          thrv.textContent = `${String(th).padStart(3, '0')} %`;
          const k = 412 + Math.round(th * 9.8 + (t / END) * 120);
          rea.style.setProperty('--v', Math.min(1, k / 1600).toFixed(2));
          reav.textContent = `${String(k).padStart(4, '0')} K`;
        }
      }
      const k = Math.floor((t - FIRST) / STEP);
      if (k > checked) mark(Math.min(lis.length - 1, k));
      if (t >= END) go();
    });
    s.on(window, 'keydown', (e) => {
      if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Control') return;
      e.preventDefault(); go();
    });
    s.on(s.scr, 'pointerdown', go);
  });
}

// Lichtblitz liegt kurz über allem (auch über dem Spiel) und räumt sich selbst weg.
function flash(rm) {
  const el = document.createElement('div');
  el.className = rm ? 'sc-flash rm' : 'sc-flash';
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  const kill = () => el.remove();
  el.addEventListener('animationend', kill, { once: true });
  setTimeout(kill, 1600);
}

// Einstellungen beim Laden des Moduls anwenden (HUD-Größe, Bewegung)
try { settings(); } catch { /* ohne DOM */ }
