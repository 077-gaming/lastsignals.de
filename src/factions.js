// Fraktionen und ihre Farben – eine Quelle für Seite, Formular, Teilen-Karte und 3D-Hangar.
// CSS nutzt dieselben Werte (src/styles/theme.css); bei Änderungen dort mitziehen.
export const FACTIONS = ['europa', 'saturn', 'eris'];
export const FX_HEX = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };
export const FX_INT = Object.fromEntries(Object.entries(FX_HEX).map(([k, v]) => [k, parseInt(v.slice(1), 16)]));
export const FX_NAME = { europa: 'EUROPA', saturn: 'SATURN', eris: 'ERIS' };
