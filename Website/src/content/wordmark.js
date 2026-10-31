// Signal-Schriftzug LAST SIGNALS als SVG: breite, gesperrte Versalien aus Linien mit angeschnittenen Ecken.
// Das I in SIGNALS ist ein Signal-Ausschlag, der leicht flackert wie ein schwaches Signal.
// Gezeichnet statt gesetzt, damit er überall gleich und scharf aussieht.

const H = 60;            // Zeilenhöhe
const SW = 7.2;          // Strichstärke
const K = SW / 2;        // Mittellinie innen
const W = 46;            // Buchstabenbreite
const C = 10;            // Anschnitt
const GAP = 16;          // Sperrung
const WI = 30;           // Breite des Signal-I
const WORD = 44;         // Wortabstand
const T = K, B = H - K;

const G = {
  L: () => `M${K} 0V${B}H${W}`,
  A: () => `M${K} ${H}V${T + C}L${K + C} ${T}H${W - K - C}L${W - K} ${T + C}V${H}M${K} 35H${W - K}`,
  S: () => `M${W} ${T}H${K + C}L${K} ${T + C}V25.5L${K + 4.5} 30H${W - K - 4.5}L${W - K} 34.5V${B - C}L${W - K - C} ${B}H0`,
  T: () => `M0 ${T}H${W}M${W / 2} ${T}V${H}`,
  G: () => `M${W} ${T}H${K + C}L${K} ${T + C}V${B - C}L${K + C} ${B}H${W - K}V31H${W / 2 + 1}`,
  N: () => `M${K} ${H}V${T}L${W - K} ${B}V0`,
};

function word(letters, x0, y0) {
  let x = x0, d = '', spike = '';
  for (const ch of letters) {
    if (ch === 'I') {
      // Signal-Ausschlag: Grundlinie, steiler Ausschlag über und unter die Zeile, zurück zur Grundlinie
      const m = y0 + 30;
      spike = `M${x - 6} ${m}H${x + 8}L${x + 12.5} ${y0 - 7}L${x + 18} ${y0 + H + 7}L${x + 21.5} ${m}H${x + WI + 6}`;
      x += WI + GAP;
      continue;
    }
    d += G[ch]().replace(/([MLHV])(-?[\d.]+)(?: (-?[\d.]+))?/g, (_, c, a, b) => {
      if (c === 'H') return `H${+a + x}`;
      if (c === 'V') return `V${+a + y0}`;
      return `${c}${+a + x} ${+b + y0}`;
    });
    x += W + GAP;
  }
  return { d, spike, w: x - GAP - x0 };
}

const LAST = word('LAST', 0, 0).w;

export function wordmark({ layout = 'line', cls = '', title = 'LAST SIGNALS', id = '', hidden = false } = {}) {
  let a, b, vbW, vbH;
  if (layout === 'stack') {
    const s = word('SIGNALS', 0, H + 26);
    a = word('LAST', (s.w - LAST) / 2, 0);
    b = s;
    vbW = s.w; vbH = H * 2 + 26;
  } else {
    a = word('LAST', 0, 0);
    b = word('SIGNALS', LAST + WORD, 0);
    vbW = LAST + WORD + b.w; vbH = H;
  }
  const pad = 8; // Platz für den Ausschlag über und unter der Zeile
  const tid = id ? `${id}-t` : '';
  // hidden: rein dekorativ (der Name steht schon am Link), dann ohne Rolle und ohne Beschriftung
  const a11y = hidden ? ' aria-hidden="true"' : ` role="img"${tid ? ` aria-labelledby="${tid}"` : ` aria-label="${title}"`}`;
  return `<svg class="wm ${cls}" viewBox="0 ${-pad} ${vbW} ${vbH + pad * 2}"${a11y} focusable="false">${tid && !hidden ? `<title id="${tid}">${title}</title>` : ''}
  <g fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linejoin="bevel" stroke-linecap="butt">
    <path class="wm-a" d="${a.d}"/>
    <path class="wm-b" d="${b.d}"/>
  </g>
  <path class="wm-sig" d="${b.spike}" fill="none" stroke="currentColor" stroke-width="${SW * 0.62}" stroke-linejoin="miter" stroke-miterlimit="12" stroke-linecap="butt" pathLength="100"/>
</svg>`;
}
