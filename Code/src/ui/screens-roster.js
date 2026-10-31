// DSN-Register der Station: Piloten der drei Fraktionen für Ruhmeshalle, Fraktionsstärke und Clanliste.
// Feste Besatzung (gleiche Werte bei jedem Start), dazu alle Akten der Bodenstation. Kein Netz, keine Zufallswerte
// pro Aufruf. Werte wachsen mit dem Kalendertag leicht weiter, damit das Register nicht eingefroren wirkt.
import { ENEMIES } from '../core/data.js';

const CREW = {
  europa: [
    ['Halden', 14], ['Mirela-7', 12], ['Kestrel', 11], ['Oskarsen', 9], ['Vael', 8], ['Tamsin', 7],
    ['Brenner', 6], ['Ilka-2', 5], ['Nordlicht', 4], ['Corvin', 3], ['Ysolde', 2], ['Pelle', 1],
  ],
  saturn: [
    ['Varga', 15], ['Rhoan', 13], ['Kasimir-K', 11], ['Dallow', 10], ['Feyra', 8], ['Gunnar-9', 7],
    ['Talley', 6], ['Moss', 5], ['Ossian', 4], ['Brask', 3], ['Linnea', 2], ['Juko', 1],
  ],
  eris: [
    ['Nadir', 16], ['Skarn', 13], ['Vex-0', 12], ['Morrow', 10], ['Kahlo', 9], ['Riss', 7],
    ['Talon-3', 6], ['Ashby', 5], ['Quill', 4], ['Dorne', 3], ['Sable', 2], ['Hekk', 1],
  ],
};

// Clans je Fraktion: Kürzel, Name, Mitglieder, Sektoren unter Kontrolle
export const CLANS = {
  europa: [['HLX', 'Helix Survey', 18, 'EU-2'], ['NRD', 'Nordwacht', 11, 'EU-1'], ['CRY', 'Kryo Corps', 7, '']],
  saturn: [['VRG', 'Varga Kontor', 21, 'SA-2'], ['RNG', 'Ringläufer', 14, 'SA-3'], ['TOL', 'Zollamt 9', 6, '']],
  eris: [['NDR', 'Nadirgarde', 19, 'ER-3'], ['SKR', 'Schwarzer Rand', 12, 'ER-2'], ['HKS', 'Haken', 8, '']],
};

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

let cache = null;
function crew() {
  if (cache) return cache;
  const day = Math.floor(Date.now() / 86400000) - 20750; // Tage seit Herbst 2026, wächst langsam
  const types = Object.keys(ENEMIES);
  const out = [];
  for (const [faction, list] of Object.entries(CREW)) {
    for (const [name, lv] of list) {
      const h = hash(name);
      const r = (k) => ((h >>> k) & 1023) / 1023;
      const grow = Math.max(0, day) * (0.6 + r(3));
      const honor = Math.round(lv * lv * (38 + r(0) * 30) + grow * lv);
      const kills = {};
      let left = Math.round(lv * (26 + r(5) * 22) + grow * 0.8);
      types.forEach((t, i) => {
        const share = i === types.length - 1 ? left : Math.round(left * (0.35 + r(i * 2) * 0.3));
        kills[t] = share; left -= share;
      });
      out.push({ callsign: name, faction, level: lv, honor, xp: 0, stats: { kills }, npc: true });
    }
  }
  cache = out;
  return out;
}

/** Register: Besatzung plus eigene Akten (eigene überschreiben gleiche Rufnamen). Sortiert nach Ehre. */
export function register(store) {
  let own = [];
  try { own = (store?.list?.() || []).filter((p) => p && p.callsign); } catch { own = []; }
  const seen = new Set(own.map((p) => p.callsign.toLowerCase()));
  const all = own.concat(crew().filter((p) => !seen.has(p.callsign.toLowerCase())));
  all.sort((a, b) => (b.honor || 0) - (a.honor || 0) || (b.level || 1) - (a.level || 1));
  return all;
}

export const killsOf = (p) => Object.values(p.stats?.kills || {}).reduce((a, b) => a + (b || 0), 0);
