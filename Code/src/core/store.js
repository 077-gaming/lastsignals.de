// Spielstand im Browser (localStorage). Nur lokal, keine echten Konten im Test.
import { newProfile } from './data.js';

const KEY = 'weltraumspiel.profiles.v1';
const LAST = 'weltraumspiel.last';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* privater Modus */ }
}

export const store = {
  list() { return Object.values(readAll()); },
  get(callsign) { return readAll()[callsign.toLowerCase()] || null; },
  create(callsign, factionId) {
    const p = newProfile(callsign, factionId);
    this.save(p);
    return p;
  },
  save(profile) {
    const all = readAll();
    all[profile.callsign.toLowerCase()] = profile;
    writeAll(all);
    try { localStorage.setItem(LAST, profile.callsign); } catch { }
  },
  remove(callsign) {
    const all = readAll();
    delete all[callsign.toLowerCase()];
    writeAll(all);
  },
  lastCallsign() { try { return localStorage.getItem(LAST) || ''; } catch { return ''; } },
};
