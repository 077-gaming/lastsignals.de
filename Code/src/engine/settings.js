// Grafik-Einstellungen: EINE Quelle für Schlüssel, Werte, Standard je Stufe, Desktop-Kennzeichen und Wirkung.
// Gespeichert in 'ls.settings': .quality = Stufe (low … extreme, wie bisher, auch von der automatischen Wahl
// geschrieben), .gfx = eigene Abweichungen { schlüssel: wert }. Ohne Abweichung gilt die Voreinstellung der Stufe;
// weicht ein Stufen-Schlüssel (preset: true) ab, heißt die Wahl BENUTZERDEFINIERT.
//
// Wirkung (apply): 'live' = sofort, 'rebuild' = Szene wird neu aufgebaut (Shader, Schattenkarte, Spiegelung –
// ≈ 1 s ohne Hänger, wie ein Sektorsprung), 'restart' = erst nach Neustart (nur Desktop-App, Hülle).
// Neue Einstellungen: hier einen Eintrag ergänzen, Anwendung im Renderer (applyGfx) bzw. als Baustein (pipeline.js).

export const TIERS = ['low', 'medium', 'high', 'ultra', 'extreme'];
export const TIER_LABEL = ['NIEDRIG', 'MITTEL', 'HOCH', 'ULTRA', 'EXTREM'];
const TIER_INDEX = { low: 0, medium: 1, high: 2, ultra: 3, extreme: 4, niedrig: 0, mittel: 1, hoch: 2 };

/** Stufen-Index (0..4) aus dem gespeicherten Namen, null bei Unbekanntem */
export function tierIndex(name) { return TIER_INDEX[name] ?? null; }

// Gruppen der Oberfläche (Reiter im Hub, Abschnitte im Bordmenü)
// [id, Titel, Kurztitel für das schmale Bordmenü]
export const GROUPS = [
  ['preset', 'VOREINSTELLUNG', 'STUFE'],
  ['bild', 'BILD'],
  ['licht', 'LICHT'],
  ['effekte', 'EFFEKTE'],
  ['system', 'SYSTEM'],
];

// def: ein Wert für alle Stufen oder [NIEDRIG, MITTEL, HOCH, ULTRA, EXTREM]
// options: [wert, beschriftung, { desktop: true } | { need: 'fähigkeit' }]
export const SCHEMA = [
  // ---- Bild
  { key: 'renderScale', group: 'bild', label: 'AUFLÖSUNGSSKALIERUNG', desc: 'Pixel der 3D-Szene im Verhältnis zur Bildschirmdichte der Stufe. Unter 100 % mit Hochskalierung schärfer als ohne, über 100 % glättet wie Supersampling.',
    type: 'range', min: 50, max: 200, step: 5, unit: '%', def: 100, preset: true, apply: 'live' },
  { key: 'upscale', group: 'bild', label: 'HOCHSKALIERUNG', desc: 'LS-Hochskalierung (FSR-1-Art): eigenes kantenrichtiges Hochrechnen plus Nachschärfen. Greift, sobald die Szene unter der Bildschirmdichte gerechnet wird (Skalierung oder automatische Anpassung).',
    type: 'choice', options: [['off', 'AUS'], ['ls', 'LS-HOCHSKALIERUNG (FSR-1-ART)']], def: 'off', preset: true, apply: 'live' },
  { key: 'sharpen', group: 'bild', label: 'SCHÄRFE', desc: 'Kontrastadaptives Nachschärfen (RCAS-Art), ein Vollbild-Durchgang. 0 % = aus.',
    type: 'range', min: 0, max: 100, step: 5, unit: '%', def: [0, 0, 0, 35, 40], preset: true, apply: 'live' },
  { key: 'aa', group: 'bild', label: 'KANTENGLÄTTUNG', desc: 'FXAA ist günstig und etwas weich, SMAA erkennt Kantenformen und bleibt scharf. AUTO: SMAA, solange die Szene unter 1,5-facher Pixeldichte gerechnet wird – darüber glättet die Dichte selbst (spart auf Retina-Bildschirmen ≈ 1,5 ms). MSAA fällt aus: zeichnet auf Apple-Grafik schwarz.',
    type: 'choice', options: [['off', 'AUS'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['auto', 'AUTO']], def: ['off', 'fxaa', 'auto', 'auto', 'smaa'], preset: true, apply: 'live' },
  { key: 'aniso', group: 'bild', label: 'ANISOTROPE FILTERUNG', desc: 'Schärfere Oberflächen unter flachem Blickwinkel (Rümpfe, Stationsplatten).',
    type: 'choice', options: [[1, '1×'], [2, '2×'], [4, '4×'], [8, '8×'], [16, '16×']], def: [1, 4, 8, 16, 16], preset: true, apply: 'live' },
  // ---- Licht
  { key: 'shadows', group: 'licht', label: 'SCHATTEN', desc: 'Sonnenschatten an der Station und auf dem Schiff. NIEDRIG 1024 hart, HOCH 2048 weich, ULTRA 4096 weich mit größerer Reichweite.',
    type: 'choice', options: [['off', 'AUS'], ['low', 'NIEDRIG'], ['high', 'HOCH'], ['ultra', 'ULTRA']], def: ['off', 'off', 'high', 'high', 'ultra'], preset: true, apply: 'rebuild' },
  { key: 'ao', group: 'licht', label: 'UMGEBUNGSVERDECKUNG', desc: 'GTAO: Kontaktschatten in Fugen und Winkeln von Rümpfen und Stationen, in halber Auflösung. Desktop-App zusätzlich VOLL (volle Auflösung).',
    type: 'choice', options: [['off', 'AUS'], ['medium', 'MITTEL'], ['high', 'HOCH'], ['ultra', 'VOLL', { desktop: true }]], def: ['off', 'off', 'medium', 'high', 'ultra'], preset: true, apply: 'live' },
  { key: 'reflections', group: 'licht', label: 'UMGEBUNGSREFLEXE', desc: 'Auflösung der Himmelsspiegelung auf Metall und Glas (PMREM 128 / 256 / 512).',
    type: 'choice', options: [['low', 'NORMAL'], ['high', 'HOCH'], ['ultra', 'ULTRA', { desktop: true }]], def: ['low', 'low', 'low', 'low', 'high'], preset: true, apply: 'rebuild' },
  { key: 'bloom', group: 'licht', label: 'NACHLEUCHTEN', desc: 'Stärke des Leuchtens heller Lichter (Triebwerke, Laser, Sonne). 0 % = aus.',
    type: 'range', min: 0, max: 150, step: 10, unit: '%', def: [0, 100, 100, 100, 100], preset: true, apply: 'live' },
  // ---- Effekte
  { key: 'grain', group: 'effekte', label: 'FILMKORN', desc: 'Feines Bildrauschen wie bei einer echten Kamera.', type: 'toggle', def: [false, true, true, true, true], preset: true, apply: 'live' },
  { key: 'vignette', group: 'effekte', label: 'VIGNETTE', desc: 'Leicht abgedunkelte Bildränder.', type: 'toggle', def: [false, true, true, true, true], preset: true, apply: 'live' },
  { key: 'chroma', group: 'effekte', label: 'FARBSAUM', desc: 'Chromatische Aberration am Bildrand.', type: 'toggle', def: [false, true, true, true, true], preset: true, apply: 'live' },
  { key: 'particles', group: 'effekte', label: 'PARTIKELDICHTE', desc: 'Funken, Rauch und Trümmer bei Treffern und Explosionen.',
    type: 'choice', options: [[35, '35 %'], [60, '60 %'], [100, '100 %'], [130, '130 %', { desktop: true }]], def: [35, 60, 100, 100, 130], preset: true, apply: 'live' },
  { key: 'viewDist', group: 'effekte', label: 'SICHTWEITE', desc: 'Bis wohin kleine Objekte (Gegner, Kisten, Brocken) gezeichnet werden. Station, Tore und Frachter immer.',
    type: 'choice', options: [[60, '60 %'], [80, '80 %'], [100, '100 %'], [150, '150 %'], [200, '200 %', { desktop: true }]], def: [100, 100, 100, 100, 150], preset: true, apply: 'live' },
  // ---- System (gehören nicht zur Voreinstellung)
  { key: 'fpsCap', group: 'system', label: 'BILDRATENBEGRENZUNG', desc: 'BILDSCHIRM folgt der Bildwiederholrate des Monitors (V-Sync). Browser: Begrenzer lässt Bilder aus. Desktop-App: UNBEGRENZT schaltet V-Sync aus und braucht einen Neustart.',
    type: 'choice', options: [[-1, 'BILDSCHIRM'], [30, '30'], [60, '60'], [120, '120'], [144, '144'], [0, 'UNBEGRENZT']], def: -1, apply: 'live', restart: 'desktop' }, // BILDSCHIRM = V-Sync, kein Begrenzer
  { key: 'fovChase', group: 'system', label: 'SICHTFELD VERFOLGER', desc: 'Öffnungswinkel der Verfolger-Kamera (Cockpit: im Bordmenü unter KAMERA).',
    type: 'range', min: 55, max: 90, step: 2, unit: '°', def: 70, apply: 'live' }, // 3D-Flug: 70° (Planung/FLUGMODELL.md 6)
  { key: 'perfHud', group: 'system', label: 'LEISTUNGSANZEIGE', desc: 'Bilder/s, Bildzeit, GPU-Zeit und Stufe oben rechts (auch Taste F3).', type: 'toggle', def: false, apply: 'live' },
];
export const SCHEMA_BY_KEY = Object.fromEntries(SCHEMA.map((d) => [d.key, d]));

/** Laufzeitumgebung: Desktop-App (Electron-Hülle mit window.lsDesktop) oder Browser; im Entwicklungsserver ?desktop=1 */
export function isDesktop() {
  if (typeof window === 'undefined') return false;
  if (window.lsDesktop) return true;
  try { if (import.meta.env && import.meta.env.DEV && new URLSearchParams(location.search).get('desktop') === '1') return true; } catch { /* ohne location */ }
  return false;
}

function optAllowed(o, caps) {
  const f = o && o[2];
  if (!f) return true;
  if (f.desktop && !(caps && caps.desktop)) return false;
  if (f.need && !(caps && caps[f.need])) return false;
  return true;
}
/** Wählbare Optionen eines Schlüssels (Desktop-only und fehlende Fähigkeiten ausgeblendet) */
export function optionsFor(d, caps) { return (d.options || []).filter((o) => optAllowed(o, caps)); }
/** Wählbare Stufen (EXTREM nur in der Desktop-App) */
export function tiersFor(caps) { return TIERS.filter((t, i) => i < 4 || (caps && caps.desktop)); }

function defOf(d, tier) { return Array.isArray(d.def) ? d.def[Math.max(0, Math.min(4, tier))] : d.def; }

/** Wert prüfen und auf Erlaubtes abbilden (ungültig → undefined, Desktop-only im Browser → nächster erlaubter) */
export function cleanValue(d, v, caps) {
  if (v === undefined || v === null) return undefined;
  if (d.type === 'toggle') return typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : undefined;
  if (d.type === 'range') {
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.max(d.min, Math.min(d.max, Math.round(n / d.step) * d.step));
  }
  const opts = d.options;
  const hit = opts.find((o) => String(o[0]) === String(v));
  if (!hit) return undefined;
  if (optAllowed(hit, caps)) return hit[0];
  // nicht erlaubt (z. B. Desktop-Wert im Browser): nächstniedrigere erlaubte Option
  const i = opts.indexOf(hit);
  for (let j = i - 1; j >= 0; j--) if (optAllowed(opts[j], caps)) return opts[j][0];
  return undefined;
}

/** Abweichungen säubern (unbekannte Schlüssel und Werte fallen weg) */
export function cleanGfx(raw, caps) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const d of SCHEMA) {
    const v = cleanValue(d, raw[d.key], caps);
    if (v !== undefined) out[d.key] = v;
  }
  return out;
}

/** Gespeicherte Stufe auf eine erlaubte Stufe abbilden (EXTREM im Browser → ULTRA) */
export function cleanTier(name, caps, fallback = 'high') {
  const i = tierIndex(name);
  if (i === null) return fallback;
  if (i === 4 && !(caps && caps.desktop)) return 'ultra';
  return TIERS[i];
}

/**
 * Wirksame Grafikwerte aus dem gespeicherten Stand. Liefert { tier (0..4), tierName, custom, preset, v: {schlüssel: wert} }.
 * custom = mindestens ein Stufen-Schlüssel weicht von der Voreinstellung ab.
 */
export function resolveGfx(raw, caps) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const tierName = cleanTier(s.quality, caps, caps && caps.touch ? 'medium' : 'high');
  const tier = tierIndex(tierName);
  const over = cleanGfx(s.gfx, caps);
  const v = {};
  let custom = false;
  for (const d of SCHEMA) {
    const base = cleanValue(d, defOf(d, tier), caps);
    const val = over[d.key] !== undefined ? over[d.key] : base;
    v[d.key] = val;
    if (d.preset && over[d.key] !== undefined && over[d.key] !== base) custom = true;
  }
  return { tier, tierName, custom, preset: custom ? 'custom' : tierName, v };
}

/** Voreinstellungswert eines Schlüssels für eine Stufe */
export function presetValue(key, tier, caps) { const d = SCHEMA_BY_KEY[key]; return d ? cleanValue(d, defOf(d, tier), caps) : undefined; }

/**
 * Neuer gfx-Stand nach einer Änderung: Wert gleich der Voreinstellung → Abweichung entfällt (so wird aus
 * BENUTZERDEFINIERT wieder die Stufe, sobald alles passt). Liefert das neue gfx-Objekt.
 */
export function withValue(gfx, key, value, tier, caps) {
  const d = SCHEMA_BY_KEY[key];
  const next = { ...cleanGfx(gfx, caps) };
  if (!d) return next;
  const v = cleanValue(d, value, caps);
  if (v === undefined) return next;
  if (v === cleanValue(d, defOf(d, tier), caps)) delete next[key]; else next[key] = v;
  return next;
}

/** Stufe wählen: alle Stufen-Abweichungen fallen weg, System-Werte (Bildrate, Sichtfeld, Anzeige) bleiben */
export function withPreset(gfx, caps) {
  const next = {};
  const g = cleanGfx(gfx, caps);
  for (const k in g) if (!SCHEMA_BY_KEY[k].preset) next[k] = g[k];
  return next;
}

/** Gilt die Wahl als eigene Wahl (Vorrang vor der automatischen Qualitätswahl)? */
export function hasOwnPreset(raw) {
  const g = raw && raw.gfx;
  if (!g || typeof g !== 'object') return false;
  for (const k in g) if (SCHEMA_BY_KEY[k] && SCHEMA_BY_KEY[k].preset) return true;
  return false;
}

/** Stand aus 'ls.settings' lesen (ohne Zwischenspeicher, für Renderer und Leistungsanzeige) */
export function readStoredSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem('ls.settings') || 'null') || {}; } catch { s = {}; }
  // nur Entwicklung (Vergleichsbilder): ?gfx=ao:off,aa:fxaa überschreibt einzelne Werte, ohne zu speichern
  try {
    if (import.meta.env && import.meta.env.DEV) {
      const o = new URLSearchParams(location.search).get('gfx');
      if (o) { s = { ...s, gfx: { ...(s.gfx || {}) } }; for (const kv of o.split(',')) { const [k, v] = kv.split(':'); if (k) s.gfx[k] = v; } }
    }
  } catch { /* ohne location */ }
  return s;
}

/** Kurzer Schlüssel des wirksamen Stands (Änderungserkennung) */
export function gfxSignature(r) { return r.tier + '|' + SCHEMA.map((d) => r.v[d.key]).join('|'); }
