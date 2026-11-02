// Fähigkeitserkennung: was die Grafik dieses Geräts kann (WebGL2-Erweiterungen, Texturgrößen, Anisotropie,
// Mehrfachabtastung) und wo das Spiel läuft (Desktop-App, Browser, Touch). Einmal je Seite, ohne Seiteneffekte
// (eigene kleine Leinwand, danach freigegeben). Ergebnis bestimmt, welche Einstellungen angeboten werden.
import { isDesktop } from './settings.js';

let cache = null;

// MSAA auf dem HalfFloat-Szenenziel wird NICHT angeboten: Auf Apple-Rechnern (ANGLE/Metal, Chrome) zeichnet ein
// mehrfach abgetastetes HalfFloat-Ziel bei Pixeldichte 1 in großen Kacheln nur Schwarz – erneut nachgewiesen am
// 02.11.2026 auf Apple M5 (bilder/engine-msaa-schwarz-nachweis.png, renderer.js samples: 4). Ohne Nachweis auf
// anderen Systemen bleibt es aus; Kantenglättung über FXAA oder SMAA (Baustein 'aa').

/** Fähigkeiten dieses Geräts (einmal ermittelt) */
export function detectCaps() {
  if (cache) return cache;
  const c = {
    webgl2: false, renderer: '', maxTex: 4096, maxAniso: 1, maxSamples: 0, floatRT: false, timer: false,
    parallelCompile: false, msaa: false, desktop: isDesktop(), touch: false, mobile: false, ext: [],
  };
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    c.touch = typeof matchMedia === 'function' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1);
    c.mobile = /Android|iPhone|iPod|iPad|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const cv = document.createElement('canvas');
    const g = cv.getContext('webgl2', { antialias: false, depth: false });
    if (g) {
      c.webgl2 = true;
      const dbg = g.getExtension('WEBGL_debug_renderer_info');
      c.renderer = String(g.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : g.RENDERER) || '');
      c.maxTex = g.getParameter(g.MAX_TEXTURE_SIZE) || 4096;
      c.maxSamples = g.getParameter(g.MAX_SAMPLES) || 0;
      const an = g.getExtension('EXT_texture_filter_anisotropic');
      c.maxAniso = an ? g.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1 : 1;
      c.floatRT = !!g.getExtension('EXT_color_buffer_float');
      c.timer = !!g.getExtension('EXT_disjoint_timer_query_webgl2');
      c.parallelCompile = !!g.getExtension('KHR_parallel_shader_compile');
      c.ext = (g.getSupportedExtensions() || []).slice();
      g.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* ohne WebGL: alles aus */ }
  // Entwicklung: Fähigkeiten vortäuschen (?caps=desktop,-timer)
  try {
    if (import.meta.env && import.meta.env.DEV) {
      const o = new URLSearchParams(location.search).get('caps');
      if (o) for (const k of o.split(',')) { if (k[0] === '-') c[k.slice(1)] = false; else c[k] = true; }
    }
  } catch { /* egal */ }
  cache = c;
  return c;
}

/** Kurzbeschreibung für Anzeigen (UMGEBUNG · CHIP) */
export function envLabel(c = detectCaps()) {
  return (c.desktop ? 'DESKTOP-APP' : 'BROWSER') + (c.touch ? ' · TOUCH' : '');
}
