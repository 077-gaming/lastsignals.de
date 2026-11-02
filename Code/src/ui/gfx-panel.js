// GRAFIK-Bereich: eine Oberfläche für Hub (EINSTELLUNGEN) und Bordmenü (Esc → ANZEIGE). Liest das Schema aus
// engine/settings.js (Schlüssel, Werte, Voreinstellung je Stufe, Desktop-Kennzeichen, Wirkung) und schreibt über
// screens-kit (ein Speicherort 'ls.settings', Ereignis 'ls:settings' → Renderer übernimmt live).
// Bedienung: Reiter je Gruppe, Segmentknöpfe, Stufenregler (− Wert +) mit Skala. Kein Formular-Schieberegler.
import './gfx-panel.css';
import {
  SCHEMA, GROUPS, TIER_LABEL, TIERS, tierIndex, resolveGfx, optionsFor, tiersFor, presetValue, withValue, withPreset,
} from '../engine/settings.js';
import { detectCaps, envLabel } from '../engine/caps.js';
import { settings, setSettings } from './screens-kit.js';
import { isAutoQuality, autoQuality } from '../perf/quality.js';

let lastTab = 'preset';

const PRESET_DESC = {
  low: 'Pixeldichte 1, direkt ohne Nachbearbeitung. Für ältere Rechner.',
  medium: 'Pixeldichte 1,5, FXAA, Nachleuchten, weniger Partikel. Standard auf Tablets.',
  high: 'Pixeldichte 1,75 mit automatischer Anpassung, SMAA unter 1,5-facher Dichte, Umgebungsverdeckung MITTEL, Schatten 2048, 8× Filterung.',
  ultra: 'Pixeldichte 2, Umgebungsverdeckung HOCH, Schärfen 35 %, 16× Filterung, feiner gebackener Himmel, 9.000 Sterne.',
  extreme: 'Desktop-App: SMAA immer, volle Umgebungsverdeckung, Schatten 4096, Spiegelung 256, mehr Partikel, größere Sichtweite.',
  custom: 'Eigene Werte. Eine Stufe wählen setzt alle Bild-, Licht- und Effektwerte zurück.',
};
const APPLY_TAG = { live: 'SOFORT', rebuild: 'NEU AUFBAU' };

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fmtVal(d, v) {
  if (d.type === 'toggle') return v ? 'AN' : 'AUS';
  if (d.type === 'range') return `${v}${d.unit === '%' ? ' %' : d.unit || ''}`;
  const o = d.options.find((x) => String(x[0]) === String(v));
  return o ? o[1] : String(v);
}

function state() {
  const caps = detectCaps();
  const s = settings();
  const r = resolveGfx(s, caps);
  return { caps, s, r };
}

function seg(d, cur, caps) {
  const opts = d.type === 'toggle' ? [[false, 'AUS'], [true, 'AN']] : optionsFor(d, caps);
  return `<div class="gx-seg" role="radiogroup">${opts.map(([v, label]) => {
    const on = String(v) === String(cur);
    return `<button type="button" role="radio" aria-checked="${on}" class="gx-o${on ? ' on' : ''}" data-gfx="set" data-k="${d.key}" data-v="${esc(v)}">${esc(label)}</button>`;
  }).join('')}</div>`;
}

function stepper(d, cur) {
  const k = (cur - d.min) / (d.max - d.min);
  return `<div class="gx-step">
    <button type="button" class="gx-o" data-gfx="step" data-k="${d.key}" data-d="-1" aria-label="${esc(d.label)} kleiner"${cur <= d.min ? ' disabled' : ''}>−</button>
    <b class="ls-num gx-v">${esc(fmtVal(d, cur))}</b>
    <span class="ls-bar gx-bar" style="--v:${k.toFixed(3)}"></span>
    <button type="button" class="gx-o" data-gfx="step" data-k="${d.key}" data-d="1" aria-label="${esc(d.label)} größer"${cur >= d.max ? ' disabled' : ''}>+</button>
  </div>`;
}

function rowHtml(d, r, caps) {
  const cur = r.v[d.key];
  const base = presetValue(d.key, r.tier, caps);
  const own = d.preset && cur !== base;
  const tags = [];
  if (d.restart === 'desktop' && caps.desktop) tags.push('NEUSTART (APP)');
  else tags.push(APPLY_TAG[d.apply] || 'SOFORT');
  const ctl = d.type === 'range' ? stepper(d, cur) : seg(d, cur, caps);
  return `<div class="gx-row${own ? ' is-own' : ''}" data-k="${d.key}">
    <div class="gx-l"><b>${esc(d.label)}</b><span class="gx-tag">${tags.join(' · ')}</span>${own ? `<span class="gx-base">STUFE: ${esc(fmtVal(d, base))}</span>` : ''}</div>
    <span class="gx-d">${esc(d.desc)}</span>
    <div class="gx-c">${ctl}</div>
  </div>`;
}

function presetPane(r, caps, s) {
  const tiers = tiersFor(caps);
  const auto = isAutoQuality();
  const btn = (id, label, on) => `<button type="button" role="radio" aria-checked="${on}" class="gx-o gx-p${on ? ' on' : ''}" data-gfx="preset" data-v="${id}">${label}</button>`;
  const cells = tiers.map((t) => btn(t, TIER_LABEL[tierIndex(t)], !r.custom && r.tierName === t)).join('')
    + btn('custom', 'BENUTZERDEF.', r.custom);
  let qa = null;
  try { qa = JSON.parse(localStorage.getItem('ls.qauto') || 'null'); } catch { qa = null; }
  const autoTxt = caps.desktop ? 'DESKTOP-APP: KEINE AUTOMATIK' : r.custom ? 'AUS · EIGENE WERTE HABEN VORRANG' : auto ? `AKTIV · ${TIER_LABEL[tierIndex(qa?.quality) ?? r.tier]}` : 'AUS · EIGENE STUFE HAT VORRANG';
  const chip = (caps.renderer || '?').replace(/^ANGLE \((.*)\)$/, '$1').split(', ').slice(0, 2).join(' · ').replace(/ANGLE Metal Renderer:\s*/i, '').slice(0, 42);
  return `<div class="gx-row gx-row-p">
      <div class="gx-l"><b>VOREINSTELLUNG</b><span class="gx-tag">${r.custom ? 'BASIS ' + TIER_LABEL[r.tier] : 'SOFORT'}</span></div>
      <span class="gx-d">${esc(PRESET_DESC[r.custom ? 'custom' : r.tierName])}</span>
      <div class="gx-c"><div class="gx-seg gx-seg-p" role="radiogroup">${cells}</div></div>
    </div>
    <div class="gx-row">
      <div class="gx-l"><b>AUTOMATISCHE WAHL</b><span class="gx-tag">${esc(autoTxt)}</span></div>
      <span class="gx-d">Misst den Grafikchip beim Start und senkt im Flug bei dauerhaft unter 50 Bildern/s. Eine eigene Wahl hat Vorrang.</span>
      <div class="gx-c">${caps.desktop ? '' : `<button type="button" class="gx-o gx-auto${auto && !r.custom ? ' on' : ''}" data-gfx="auto">AUTOMATISCH WÄHLEN</button>`}</div>
    </div>
    <div class="gx-ro">
      <div><span class="ls-label">UMGEBUNG</span><span class="ls-num">${esc(envLabel(caps))}</span></div>
      <div><span class="ls-label">GRAFIK</span><span class="ls-num">${esc(chip)}</span></div>
      <div><span class="ls-label">MAX. TEXTUR</span><span class="ls-num">${caps.maxTex} PX</span></div>
      <div><span class="ls-label">ANISOTROPIE MAX.</span><span class="ls-num">${caps.maxAniso}×</span></div>
      <div><span class="ls-label">GPU-ZEITMESSUNG</span><span class="ls-num">${caps.timer ? 'JA' : 'NEIN'}</span></div>
      <div><span class="ls-label">STUFE</span><span class="ls-num">${TIER_LABEL[r.tier]}${r.custom ? ' · EIGEN' : ''}</span></div>
    </div>`;
}

function inner(compact) {
  const { caps, s, r } = state();
  const tab = GROUPS.some((g) => g[0] === lastTab) ? lastTab : 'preset';
  const tabs = GROUPS.map(([id, t, short], i) => `<button type="button" class="gx-tab${id === tab ? ' on' : ''}" data-gfx="tab" data-v="${id}"><i>${String(i + 1).padStart(2, '0')}</i>${compact && short ? short : t}</button>`).join('');
  const pane = tab === 'preset' ? presetPane(r, caps, s) : SCHEMA.filter((d) => d.group === tab).map((d) => rowHtml(d, r, caps)).join('');
  return `<nav class="gx-tabs">${tabs}</nav><div class="gx-pane" data-pane="${tab}">${pane}</div>
    <div class="gx-foot"><span class="ls-label" data-gx-saved>${r.custom ? 'BENUTZERDEFINIERT' : 'STUFE ' + TIER_LABEL[r.tier]}</span><span class="ls-spacer"></span>${compact ? '' : '<span class="ls-label">GESPEICHERT IN DIESEM BROWSER</span>'}</div>`;
}

/** Ganzer GRAFIK-Bereich (Hub: compact = false, Bordmenü: compact = true) */
export function gfxPanelHtml(compact = false) {
  return `<div class="gx${compact ? ' is-compact' : ''}" data-gx data-compact="${compact ? 1 : 0}">${inner(compact)}</div>`;
}

function redraw(root) { root.innerHTML = inner(root.dataset.compact === '1'); }

/**
 * Klick in einem GRAFIK-Bereich auswerten (Hub und Bordmenü leiten [data-gfx] hierher). Liefert
 * { tierChanged } oder null, wenn der Klick nicht dazugehört.
 */
export function gfxHandle(target) {
  const b = target && target.closest && target.closest('[data-gfx]');
  const root = b && b.closest('[data-gx]');
  if (!b || !root || b.disabled) return null;
  const act = b.dataset.gfx;
  const { caps, s, r } = state();
  let tierChanged = false;
  if (act === 'tab') { lastTab = b.dataset.v; redraw(root); return { tierChanged }; }
  if (act === 'preset') {
    const v = b.dataset.v;
    if (v === 'custom') { lastTab = 'bild'; redraw(root); return { tierChanged }; }
    if (!TIERS.includes(v)) return null;
    tierChanged = v !== s.quality;
    setSettings({ quality: v, gfx: withPreset(s.gfx, caps) });
  } else if (act === 'auto') {
    let qa = null;
    try { qa = JSON.parse(localStorage.getItem('ls.qauto') || 'null'); } catch { qa = null; }
    if (qa && tierIndex(qa.quality) !== null) {
      tierChanged = qa.quality !== s.quality;
      setSettings({ quality: qa.quality, gfx: withPreset(s.gfx, caps) });
    } else {
      setSettings({ gfx: withPreset(s.gfx, caps) });
      autoQuality((name) => setSettings({ quality: name }), true).then(() => redraw(root)).catch(() => {});
    }
  } else if (act === 'set' || act === 'step') {
    const key = b.dataset.k;
    const d = SCHEMA.find((x) => x.key === key);
    if (!d) return null;
    let v;
    if (act === 'step') v = r.v[key] + Number(b.dataset.d) * d.step;
    else v = d.type === 'toggle' ? b.dataset.v === 'true' : d.type === 'range' ? Number(b.dataset.v) : (typeof d.options[0][0] === 'number' ? Number(b.dataset.v) : b.dataset.v);
    setSettings({ gfx: withValue(s.gfx, key, v, r.tier, caps) });
  } else return null;
  redraw(root);
  const saved = root.querySelector('[data-gx-saved]');
  if (saved) { saved.textContent = 'GESPEICHERT'; saved.classList.remove('flash'); void saved.offsetWidth; saved.classList.add('flash'); }
  return { tierChanged };
}

/** Bereich neu zeichnen (z. B. nach F3 oder automatischer Wahl) */
export function gfxRefresh(scope = document) { for (const el of scope.querySelectorAll('[data-gx]')) redraw(el); }
