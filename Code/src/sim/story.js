// Hauptgeschichte „Die letzten Sendungen“, Kapitel 1 „Erster Kontakt“ (Missionsentwurf HS-01-1 bis HS-01-6, Stufe 1–3).
// Läuft mit der Mechanik der SYSTEM-Reihe (sim/system-quests.js, Stand in profile.story), sobald die Einführung
// nicht mehr führt. Nur Heimatsektor; Wegpunkte relativ zur Station. Keine Hinweise auf spätere Kapitel.
export const STORY_CHAPTERS = { 1: 'Erster Kontakt' };

export const STORY_QUESTS = [
  { id: 'hs01-1', ch: 1, title: 'Geleit', text: 'Ein Forschungsfrachter meldet Raider am Heck. Bleib bei ihm, bis er sicher am Ziel ist.', goal: { type: 'event', target: 'convoy' }, reward: { credits: 2500, xp: 2000, honor: 15 } },
  { id: 'hs01-2', ch: 1, title: 'Die Funkzentrale', text: 'Die Funkzentrale der Station will dich sprechen. Dock an, sie hat etwas aufgefangen.', goal: { type: 'dock' }, key: 'E', k3: 'context', t3: 'Die Funkzentrale der Station will dich sprechen. Dock an, sie hat etwas aufgefangen.', reward: { credits: 800, xp: 600 } },
  { id: 'hs01-3', ch: 1, title: 'Rauschen auf Kanal 8', text: 'Auf Kanal 8 liegt ein Träger, wo keiner sein dürfte. Die Peilung zeigt hinaus ins Feld. Flieg zur Quelle.', goal: { type: 'reach', dx: 2600, dz: 1400, r: 260 }, key: 'KARTE', reward: { credits: 1500, xp: 1200 } },
  { id: 'hs01-4', ch: 1, title: 'Laut und leise', text: 'Schüsse sind weit zu hören. Ein Raider-Rudel hat die Quelle gefunden. Räum es weg, bevor es mehr werden.', goal: { type: 'kill', target: 'raider', count: 4 }, reward: { credits: 2500, xp: 2000, honor: 10 } },
  { id: 'hs01-5', ch: 1, title: 'Zu zweit', text: 'Ein Larva-Schwarm hält das Feld um die Quelle. Zu zweit geht es leichter: im Hub unter KOOP einen Freund dazuholen. Allein zählt es auch.', goal: { type: 'kill', target: 'larva', count: 8 }, reward: { credits: 3000, xp: 2500, tritium: 10, honor: 15 } },
  { id: 'hs01-6', ch: 1, title: 'Fragment 0', text: 'Im Feld treibt ein alter Datenspeicher. Bring dich auf Bergungsabstand, die Station entschlüsselt ihn über Funk.', goal: { type: 'reach', dx: 3300, dz: 2200, r: 200 }, reward: { credits: 4000, xp: 3000, tritium: 25, honor: 20 }, after: 'Funkzentrale: Der Speicher ist alt, älter als die Station. Eine Stimme, dann bricht sie ab. Wir hören weiter hin.' },
];
