// Funksprüche der Heimatstation je Fraktion im Cockpit-Ton. Die Quest-Ziele in data.js bleiben gleich,
// nur der Wortlaut im Flug-HUD (MSN·05, COM·06) richtet sich nach der Fraktion.
import { QUESTS } from '../core/data.js';

const TEXT = {
  europa: {
    q1: 'Forschungsfrachter Kallisto-7 meldet Raider. Fünf Raider abfangen.',
    q2: 'Eisproben treiben frei im Sektor. Drei Crates sichern.',
    q3: 'Werft hält einen Ion Laser bereit. Kaufen, Montage erfolgt sofort.',
    q4: 'Larva-Schwarm an den Eisbohrungen. Acht Larva beseitigen.',
    q5: 'Kurs Io freigegeben. Sprungtor nutzen.',
    q6: 'Jackals jagen beschädigte Schiffe. Sechs Jackal stellen.',
    q7: 'Ganymed ruft Unterstützung. Sektor 3 anfliegen, vier Spiker zerstören.',
  },
  saturn: {
    q1: 'Konvoi Titan-3 unter Beschuss. Fünf Raider ausschalten.',
    q2: 'Fracht aus geplatztem Container treibt im Sektor. Drei Crates bergen.',
    q3: 'Ion Laser liegt im Dock bereit. Kaufen und montieren, Vertrag läuft.',
    q4: 'Larva-Brut frisst sich durch die Erzfelder. Acht Larva vernichten.',
    q5: 'Route nach Mimas freigegeben. Durch das Sprungtor.',
    q6: 'Jackals kapern angeschlagene Frachter. Sechs Jackal ausschalten.',
    q7: 'Tethys zahlt Kopfgeld. Sektor 3 anfliegen, vier Spiker vernichten.',
  },
  eris: {
    q1: 'Raider plündern unsere Schmuggler. Fünf Raider erledigen.',
    q2: 'Abwurfkisten treiben draußen. Drei Crates holen, bevor andere es tun.',
    q3: 'Ion Laser im Lager. Kaufen und anbauen.',
    q4: 'Larva nisten im Ring. Acht Larva ausbrennen.',
    q5: 'Tor nach Dysnomia ist offen. Springen.',
    q6: 'Jackals wittern Schwäche. Sechs Jackal ausschalten.',
    q7: 'Sedna wartet. Sektor 3 erreichen, vier Spiker brechen.',
  },
};

// Originaltext -> Quest-ID (für Funksprüche der Simulation, die den Text aus data.js tragen)
const BY_TEXT = new Map();
for (const q of QUESTS) BY_TEXT.set(q.text, q.id);

export function questText(def, faction) {
  if (!def) return '';
  const t = TEXT[faction] && TEXT[faction][def.id];
  return t || def.text || '';
}

/** Funkspruch mit Quest-Text aus data.js → Fraktionswortlaut, sonst unverändert. */
export function radioText(body, faction) {
  const id = BY_TEXT.get(body);
  if (!id) return body;
  const t = TEXT[faction] && TEXT[faction][id];
  return t || body;
}
