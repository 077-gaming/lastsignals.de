// Eigene Linien-Symbole im Stil von LAST SIGNALS (keine Markenlogos).
// 24er-Raster, 1,4 px Linie, eckige Enden. Farbe kommt über currentColor.

const svg = (body, vb = '0 0 24 24') =>
  `<svg class="ico" viewBox="${vb}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="square" stroke-linejoin="miter">${body}</svg>`;

export const ICONS = {
  // Kanäle
  discord: svg('<path d="M5 14v-2.5a7 7 0 0 1 14 0V14"/><path d="M4 14h3.2v5.5H4zM16.8 14H20v5.5h-3.2z"/><path d="M20 19.5c0 1.2-1.6 2-4.5 2H13"/>'),
  instagram: svg('<path d="M7 3.5h12.5v12.5L17 20.5H4.5V8z"/><circle cx="12" cy="12" r="3.6"/><path d="M16.6 7.2h.01"/>'),
  tiktok: svg('<path d="M8.5 2.5h9v16.5l-2.5 2.5H6.5V5z"/><path d="M10.6 9.2v5.6l4.6-2.8z"/><path d="M10 18.5h4"/>'),
  youtube: svg('<path d="M4.5 5.5h16v10.5L18 18.5H2V8z"/><path d="M9.8 8.8v6.2l5.2-3.1z"/><path d="M7 21.5h10"/>'),
  x: svg('<path d="M5.5 4.5l13 15M18.5 4.5l-13 15"/><path d="M3 3h3M18 21h3" stroke-opacity=".55"/>'),
  reddit: svg('<path d="M4 11l3.2-3.2L10.4 11M7.2 8v10"/><path d="M13 7.5h8M13 12h8M13 16.5h5.5"/>'),
  steam: svg('<path d="M3 8.2 12 3.8l9 4.4-9 4.4z"/><path d="M3 12.4l9 4.4 9-4.4M3 16.4l9 4.4 9-4.4"/>'),

  // Bereiche
  factions: svg('<path d="M12 2.8 15 6l-3 3.2L9 6zM6 13.6l3 3.2-3 3.2-3-3.2zM18 13.6l3 3.2-3 3.2-3-3.2z"/><path d="M10.6 9.4 7.4 13.2M13.4 9.4l3.2 3.8M9.2 16.8h5.6" stroke-opacity=".5"/>'),
  sectors: svg('<path d="M3.5 3.5h17v17h-17z" stroke-opacity=".45"/><path d="M7 16.5 11 9l6-2.5M11 9l2.5 8"/><path d="M6 15.5h2v2H6zM10 8h2v2h-2zM16 5.5h2v2h-2zM12.5 16h2v2h-2z"/>'),
  combat: svg('<path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><path d="M7 5h-2v2M17 5h2v2M7 19H5v-2M17 19h2v-2"/><path d="M11.2 11.2h1.6v1.6h-1.6z"/>'),
  gear: svg('<path d="M6 6h12v12H6z"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/><path d="M9.5 9.5h5v5h-5z" stroke-opacity=".55"/>'),
  events: svg('<path d="M3.5 5.5h17v15h-17zM3.5 9.5h17"/><path d="M8 3v4M16 3v4"/><path d="M12 12.5v3.2l2.2 1.4"/>'),
  fair: svg('<path d="M12 3.5v17M7 20.5h10"/><path d="M4 7.5h16"/><path d="M4 7.5 1.8 13h4.4zM20 7.5 17.8 13h4.4z"/><path d="M1.8 13a2.2 2.2 0 0 0 4.4 0M17.8 13a2.2 2.2 0 0 0 4.4 0"/>'),

  // Bedienung
  out: svg('<path d="M9 5h10v10M19 5 5.5 18.5"/>'),
  down: svg('<path d="M12 4v15M6 13l6 6 6-6"/>'),
  menu: svg('<path d="M3 6.5h18M3 12h18M3 17.5h12"/>'),
  close: svg('<path d="M5 5l14 14M19 5 5 19"/>'),
  lock: svg('<path d="M5 10.5h14v10H5z"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/><path d="M12 14v3"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z"/>'),
  pause: svg('<path d="M7.5 5v14M16.5 5v14"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  check: svg('<path d="M4.5 12.5l5 5L19.5 6.5"/>'),
  cross: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  google: svg('<path d="M19.5 7.5 16 4H8L4 8v8l4 4h8l3.5-3.5V12H12.5"/>'),
  mail: svg('<path d="M5.5 5.5h15v11l-2.5 2.5h-15v-11z"/><path d="M3 8l9 6 8.5-6"/>'),
  user: svg('<path d="M8.5 3.5h7l2 2v5l-2 2h-7l-2-2v-5z"/><path d="M3.5 21v-3l3-3h11l3 3v3"/>'),
  soundOn: svg('<path d="M3.5 9h4l5-4.5v15l-5-4.5h-4z"/><path d="M15.5 9.5v5M18.5 7.5v9M21.5 10v4"/>'),
  soundOff: svg('<path d="M3.5 9h4l5-4.5v15l-5-4.5h-4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  share: svg('<path d="M12 15.5V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 11v9.5h14V11"/>'),
  signal: svg('<path d="M2.5 12h4l2-6 3.5 12 2.5-9 1.5 3h5.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  reset: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 3.5v4h4"/>'),
  rotate: svg('<path d="M3 12h4M17 12h4"/><path d="M7 8.5 3 12l4 3.5M17 8.5l4 3.5-4 3.5"/><path d="M10 12h4" stroke-opacity=".55"/>'),
};

// Zeichen von LAST SIGNALS: Raute mit drei Signalbögen, der äußere bricht ab.
export const EMBLEM = `<svg class="emblem" viewBox="0 0 32 32" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-linecap="square">
  <path d="M16 1.8 30.2 16 16 30.2 1.8 16z" stroke-width="1.3"/>
  <path d="M10.6 21.4h.01" stroke-width="2.6"/>
  <path d="M10.6 16.6a4.8 4.8 0 0 1 4.8 4.8" stroke-width="1.5"/>
  <path d="M10.6 12.4a9 9 0 0 1 9 9" stroke-width="1.5"/>
  <path d="M10.6 8.2a13.2 13.2 0 0 1 9.3 3.9M22.3 15.1a13.2 13.2 0 0 1 1.5 4.2" stroke-width="1.5" stroke-opacity=".55"/>
</svg>`;

// Wappen der Fraktionen (Linienzeichnung, Farbe über currentColor)
export const CRESTS = {
  europa: `<svg class="crest" viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="square">
    <path d="M48 6 84 27v42L48 90 12 69V27z" stroke-width="1.2" stroke-opacity=".55"/>
    <path d="M48 18v52M25 31l46 26M71 31 25 57" stroke-width="1.4"/>
    <path d="M48 26l-5-5M48 26l5-5M48 62l-5 5M48 62l5 5M32 35l-7 0M32 35l-3-6M64 35l7 0M64 35l3-6M32 53l-7 0M32 53l-3 6M64 53l7 0M64 53l3 6" stroke-width="1.2"/>
    <path d="M20 78c6-4 10-4 16 0s10 4 16 0 10-4 16 0 6 3 8 2" stroke-width="1.2" stroke-opacity=".7"/>
  </svg>`,
  saturn: `<svg class="crest" viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="square">
    <path d="M10 10h76v76H10z" stroke-width="1.2" stroke-opacity=".45"/>
    <circle cx="48" cy="48" r="17" stroke-width="1.4"/>
    <ellipse cx="48" cy="48" rx="36" ry="10" transform="rotate(-18 48 48)" stroke-width="1.4"/>
    <ellipse cx="48" cy="48" rx="29" ry="7.4" transform="rotate(-18 48 48)" stroke-width="1" stroke-opacity=".55"/>
    <path d="M14 82l6-6M22 82l6-6M30 82l6-6M60 20l6-6M68 20l6-6M76 20l6-6" stroke-width="1.6"/>
  </svg>`,
  eris: `<svg class="crest" viewBox="0 0 96 96" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="square">
    <path d="M48 90 8 14h80z" stroke-width="1.2" stroke-opacity=".5"/>
    <path d="M34 24v34M44 24v46M52 24v46M62 24v34" stroke-width="1.4"/>
    <path d="M26 24h44" stroke-width="1.4"/>
    <circle cx="48" cy="10" r="4" stroke-width="1.2"/>
    <path d="M18 40l-8-4M78 40l8-4M26 58l-7 2M70 58l7 2" stroke-width="1.2" stroke-opacity=".7"/>
  </svg>`,
};
