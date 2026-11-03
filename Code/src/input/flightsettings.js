// Einstellungen des 3D-Flugs (Planung/FLUGMODELL.md 5): eigener Schlüssel localStorage 'ls.flight', weil der Hub
// 'ls.settings' nur mit seinen eigenen Werten neu schreibt. Kein Feld im Spielstand.
export const FLIGHT_KEY = 'ls.flight';
export const FLIGHT_DEFAULT = Object.freeze({
  mouse: 'aim',        // 'aim' Mausziel (Fadenkreuz sofort, Schiff folgt) | 'vjoy' virtueller Stick (Trackpad, Umsteiger)
  sens: 0.07,          // Grad je Pixel (Mausziel)
  invertY: false,
  cone: 30,            // Lenkkegel: so weit darf das Fadenkreuz vom Bug abweichen (Grad, 15–70)
  cam: 'mix',          // 'mix' 35 % Zielrichtung | 'aim' Kamera folgt der Zielrichtung
  camRoll: 1,          // Anteil, mit dem die Verfolgerkamera das Rollen mitmacht (Runde 2: 1 – bei 0,7 drehte die Kamera in
                       // Rückenlage mit 1,75-facher, in Normallage mit 0,7-facher Rollrate; ungleichmäßig)
  fov: 70,             // Sichtfeld Verfolger (55–90)
  autoRoll: false,     // Kurvenrollen (Hilfe zum Zuschalten; Touch immer an)
  horizon: false,      // Horizont-Hilfe in Ruhe (Hilfe zum Zuschalten; Touch immer an)
  padHorizon: true,    // Horizont-Hilfe in Ruhe am Controller (Runde 2: nach Kurven mit dem Stick hing das Schiff schief)
  assist: 2,           // Zielhilfe Controller 0 AUS, 1 NIEDRIG, 2 STANDARD, 3 HOCH
  padMode: 'aim',      // Controller: 'aim' Stick bewegt die Zielrichtung, kurzer Vorlauf (Standard) | 'rate' Stick = Drehrate
  autofire: null,      // Feuerleitrechner beim Start an (null = auf Touch-Geräten an)
  enemyBolts: false,   // Etappe 2: echte Gegnerbolzen
  hint: true,          // Hinweise im ersten Flug
  down: 'auto',        // Taste „runter“: 'auto' (Browser unter Windows/Linux C, sonst Strg) | 'ctrl' | 'c' (Runde 3)
  migrated: false,     // alte Kamerawahl „taktisch“ einmalig auf den neuen Hauptmodus umgestellt
  rev: 3,              // Stand der Voreinstellungen (2: Kurvenrollen/Horizont aus, Controller mit kurzem Vorlauf; 3: Kamera rollt voll mit)
});
export const FLIGHT_CHOICES = {
  mouse: ['aim', 'vjoy'], sens: [0.04, 0.055, 0.07, 0.09, 0.12], cone: [15, 22, 30, 45, 70], cam: ['mix', 'aim'],
  fov: [60, 70, 80, 90], autoRoll: [true, false], horizon: [true, false], padHorizon: [true, false], assist: [0, 1, 2, 3], padMode: ['aim', 'rate'],
  invertY: [false, true], enemyBolts: [false, true], down: ['auto', 'ctrl', 'c'],
};
let cache = null;
export function flightSettings() {
  if (cache) return cache;
  const s = { ...FLIGHT_DEFAULT };
  try {
    const raw = JSON.parse(localStorage.getItem(FLIGHT_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      // Stand 1 speicherte die alten Voreinstellungen mit (Kurvenrollen, Horizont-Hilfe, Controller „Zielrichtung“):
      // diese drei einmalig auf die neuen Werte, alles andere bleibt
      const old = !(raw.rev >= 2), old3 = !(raw.rev >= 3);
      for (const k in FLIGHT_DEFAULT) {
        if (old && (k === 'autoRoll' || k === 'horizon' || k === 'padMode' || k === 'rev')) continue;
        if (old3 && (k === 'camRoll' || k === 'rev')) continue;
        if (k in raw && typeof raw[k] === typeof FLIGHT_DEFAULT[k] || (k === 'autofire' && (raw[k] === true || raw[k] === false))) s[k] = raw[k];
      }
    }
  } catch { /* privater Modus */ }
  s.sens = Math.max(0.02, Math.min(0.3, Number(s.sens) || FLIGHT_DEFAULT.sens));
  s.cone = Math.max(15, Math.min(70, Number(s.cone) || 30));
  s.fov = Math.max(55, Math.min(90, Number(s.fov) || 70));
  s.assist = Math.max(0, Math.min(3, s.assist | 0));
  if (!FLIGHT_CHOICES.down.includes(s.down)) s.down = 'auto';
  cache = s;
  return s;
}
export function setFlightSetting(key, value) {
  if (!(key in FLIGHT_DEFAULT)) return flightSettings();
  const s = { ...flightSettings(), [key]: value };
  cache = null;
  try { localStorage.setItem(FLIGHT_KEY, JSON.stringify(s)); } catch { /* privater Modus */ }
  cache = null;
  const out = flightSettings();
  try { window.dispatchEvent(new CustomEvent('ls:flight', { detail: { settings: out } })); } catch { /* alt */ }
  return out;
}
/** Touch-Telefon (kleiner Bildschirm, nur Fingerbedienung): startet weiter taktisch */
export function isPhone() {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    return coarse && Math.min(screen.width, screen.height) < 760;
  } catch { return false; }
}
export function isTouchOnly() {
  try { return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches; } catch { return false; }
}
