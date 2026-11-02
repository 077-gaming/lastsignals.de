// Leistungsanzeige (Taste F3, standardmäßig aus): Bilder/s, Bildzeit CPU/GPU, Zeichenaufrufe, Dreiecke,
// Auflösungsfaktor, Qualitätsstufe. Liest nur aus dem Renderer (renderer.stats), schreibt das DOM 4× pro Sekunde.
import './perfhud.css';
import { isAutoQuality, gpuInfo } from './quality.js';

const Q_NAME = ['NIEDRIG', 'MITTEL', 'HOCH', 'ULTRA', 'EXTREM'];

export class PerfHud {
  constructor(renderer) {
    this.renderer = renderer;
    this.on = false;
    this.el = null;
    this._acc = 0; this._frames = 0; this._cpu = 0; this._t = 0;
    this.fps = 0; this.cpu = 0;
    this._onKey = (e) => {
      if (e.code !== 'F3' || e.repeat) return;
      e.preventDefault();
      this.toggle();
    };
    window.addEventListener('keydown', this._onKey);
  }

  // ohne Flug-Grafik (Hub) bleibt die Anzeige verborgen, auch wenn sie eingeschaltet ist
  setRenderer(r) { this.renderer = r; if (this.el) this.el.hidden = !(this.on && r); }

  toggle(v = !this.on) {
    this.on = v;
    if (v && !this.el) {
      const el = this.el = document.createElement('div');
      el.className = 'ls-perf ls-panel';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = '<div class="ls-perf-h">LEISTUNG <span>F3</span></div><dl></dl>';
      this.dl = el.querySelector('dl');
      document.body.appendChild(el);
    }
    if (this.el) this.el.hidden = !(v && this.renderer);
    if (v) this._paint();
  }

  // jedes Bild: dt (s) und CPU-Zeit des Bildes (ms)
  frame(dt, cpuMs) {
    this._frames++; this._acc += dt; this._cpu += cpuMs;
    if (this._acc < 0.25) return;
    this.fps = this._frames / this._acc;
    this.cpu = this._cpu / this._frames;
    this._frames = 0; this._acc = 0; this._cpu = 0;
    if (this.on) this._paint();
  }

  _paint() {
    const r = this.renderer;
    if (!r || !this.dl) return;
    const s = r.stats || {};
    const gpu = s.gpuOk ? s.gpu.toFixed(2) + ' ms' : 'n. v.';
    const res = `${(s.pr || 1).toFixed(2)}× · ${Math.round((s.scale || 1) * 100)} %`;
    const tier = s.tier ?? s.quality;
    const rows = [
      ['BILDER/S', this.fps.toFixed(0)],
      ['BILDZEIT', (this.fps > 0 ? 1000 / this.fps : 0).toFixed(2) + ' ms'],
      ['CPU', this.cpu.toFixed(2) + ' ms'],
      ['GPU', gpu],
      ['AUFRUFE', String(s.calls ?? 0)],
      ['DREIECKE', fmtK(s.tris ?? 0)],
      ['AUFLÖSUNG', res],
      ['SZENE', s.post ? `${s.sw || 0}×${s.sh || 0}` : `${s.w || 0}×${s.h || 0}`],
      ['AUSGABE', `${s.w || 0}×${s.h || 0}` + (s.up ? ' · LS' : '')],
      ['KETTE', s.post ? (r.chain ? r.chain.describe() : '–') : 'DIREKT'],
      ['QUALITÄT', (Q_NAME[tier] || '?') + (s.custom ? ' · EIGEN' : isAutoQuality() ? ' · AUTO' : '') + (s.low ? ' · OHNE BLOOM' : '')],
      ['CHIP', chipName()],
    ];
    let h = '';
    for (const [k, v] of rows) h += `<dt>${k}</dt><dd>${v.replace(/(\d)\.(\d)/g, '$1,$2')}</dd>`;
    this.dl.innerHTML = h;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    if (this.el) this.el.remove();
    this.el = null;
  }
}

let chip = null;
function chipName() {
  if (chip === null) {
    const g = gpuInfo();
    // „ANGLE (Apple, ANGLE Metal Renderer: Apple M5, …)“ → „Apple M5“; Klasse dahinter
    let n = g.renderer || '?';
    const p = n.split(', ');
    if (/^ANGLE \(/.test(n) && p.length > 1) n = p[1];
    n = n.replace(/ANGLE Metal Renderer:\s*/i, '').replace(/\((R|TM)\)/gi, '').replace(/\s+(Direct3D|vs_|OpenGL).*$/i, '').replace(/^(NVIDIA|AMD)\s+/i, '');
    const name = n.trim().slice(0, 24);
    chip = `${name.toUpperCase()} · ${String(g.tier).toUpperCase()}`;
  }
  return chip;
}

function fmtK(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : n >= 1e3 ? (n / 1e3).toFixed(1) + ' k' : String(n); }
