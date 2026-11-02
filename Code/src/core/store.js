// Spielstand im Browser (localStorage). Nur lokal, keine echten Konten im Test.
// Robust gegen kaputte Daten: Ein Lesefehler löscht nie etwas. Vor jedem Schreiben bleibt der letzte gültige
// Stand als Sicherung (KEY.bak) erhalten; unlesbare Rohdaten werden unter KEY.corrupt.<zeit> aufgehoben.
import { newProfile, migrateXp } from './data.js';

const KEY = 'weltraumspiel.profiles.v1';
const BAK = KEY + '.bak';
const LAST = 'weltraumspiel.last';
// Diese Namen würden als Objekt-Schlüssel den Prototyp verbiegen ("__proto__") – nie als Rufname zulassen.
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof']);
export const callsignForbidden = (c) => FORBIDDEN.has(String(c || '').trim().toLowerCase());

let lastCorrupt = null;
let readOnly = false; // nach unlesbaren Daten ohne gültige Sicherung: nichts überschreiben, bis der Spieler es weiß

function parse(raw) {
  if (raw == null || raw === '') return {};
  const v = JSON.parse(raw);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Spielstand hat falsches Format');
  // in ein prototypfreies Objekt kopieren (keine Prototyp-Manipulation über Schlüssel)
  const out = Object.create(null);
  for (const k of Object.keys(v)) if (!FORBIDDEN.has(k) && v[k] && typeof v[k] === 'object') out[k] = v[k];
  return out;
}
function notify(kind, detail) {
  try { window.dispatchEvent(new CustomEvent('ls:store', { detail: { kind, ...detail } })); } catch { /* egal */ }
}
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return Object.create(null); } // Speicher gesperrt (privater Modus)
  try { return parse(raw); } catch (err) {
    // Rohdaten einmal aufheben (nicht bei jedem Lesen erneut), dann die letzte Sicherung versuchen
    if (raw !== lastCorrupt) { lastCorrupt = raw; try { localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch { /* voll */ } }
    try {
      const bakRaw = localStorage.getItem(BAK);
      const bak = parse(bakRaw);
      if (!bakRaw) throw new Error('keine Sicherung');
      try { localStorage.setItem(KEY, bakRaw); } catch { /* voll */ } // Hauptspeicher aus der Sicherung heilen
      console.warn('Spielstand unlesbar – Sicherung geladen.', err);
      notify('restored');
      return bak;
    } catch {
      console.error('Spielstand unlesbar und keine gültige Sicherung. Rohdaten aufgehoben, Schreiben gesperrt.', err);
      readOnly = true;
      notify('corrupt');
      return Object.create(null);
    }
  }
}
function writeAll(all) {
  if (readOnly) { notify('readonly'); return false; }
  try {
    const prev = localStorage.getItem(KEY);
    if (prev) { try { parse(prev); localStorage.setItem(BAK, prev); } catch { /* alter Stand kaputt: Sicherung nicht überschreiben */ } }
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch (err) {
    console.error('Spielstand konnte nicht gespeichert werden', err);
    notify('quota', { message: String(err && err.name || err) });
    return false;
  }
}
const keyOf = (callsign) => String(callsign || '').trim().toLowerCase();

export const store = {
  // alte Spielstände sofort an die aktuelle Stufenkurve anpassen (auch für Hub und Ruhmeshalle, nicht erst im Flug)
  list() { return Object.values(readAll()).map(migrateXp); },
  get(callsign) { const k = keyOf(callsign); if (!k || FORBIDDEN.has(k)) return null; const p = readAll()[k]; return p ? migrateXp(p) : null; },
  create(callsign, factionId) {
    if (callsignForbidden(callsign)) throw new Error('Rufname nicht erlaubt');
    const p = newProfile(callsign, factionId);
    this.save(p);
    return p;
  },
  save(profile) {
    const k = keyOf(profile && profile.callsign);
    if (!k || FORBIDDEN.has(k)) return false;
    const all = readAll();
    try { profile.savedAt = new Date().toISOString(); } catch { /* eingefrorenes Objekt */ }
    all[k] = profile;
    const ok = writeAll(all);
    try { localStorage.setItem(LAST, profile.callsign); } catch { /* egal */ }
    return ok;
  },
  remove(callsign) {
    const k = keyOf(callsign);
    const all = readAll();
    delete all[k];
    writeAll(all);
  },
  lastCallsign() { try { return localStorage.getItem(LAST) || ''; } catch { return ''; } },
  get readOnly() { return readOnly; },
};
