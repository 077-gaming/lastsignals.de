// Klassenwerte des Flugmodells (Planung/FLUGMODELL.md 4.4). Das Kampftempo vK kommt immer aus world._speed
// (Schiff + Tempo-Generatoren), damit gekaufte Generatoren im 3D-Flug ihren Wert behalten.
const D = Math.PI / 180;

// Schub vor, rück, seitlich, vertikal (m/s²) · Nicken/Gieren, Rollen (°/s) · Drehbeschleunigung (°/s²) · Kp (1/s)
// Boost Dauer / Nachladen (s) · Kardan (°) · Trefferkapsel Länge, Radius (m) · Fahrwerkshöhe (m)
export const CLASS = {
  s1: { fwd: 150, back: 110, lat: 100, vert: 100, rate: 95, roll: 210, acc: 520, kp: 12, boostT: 6, boostRegen: 9, gimbal: 6, len: 42, rad: 11, gearH: 3.2 },
  s2: { fwd: 145, back: 105, lat: 95, vert: 95, rate: 88, roll: 190, acc: 460, kp: 11, boostT: 6.5, boostRegen: 10, gimbal: 8, len: 53, rad: 12, gearH: 3.6 },
  s3: { fwd: 125, back: 92, lat: 82, vert: 82, rate: 74, roll: 160, acc: 380, kp: 9.5, boostT: 6.5, boostRegen: 10, gimbal: 10, len: 58, rad: 14, gearH: 4 },
  s4: { fwd: 110, back: 82, lat: 72, vert: 72, rate: 62, roll: 130, acc: 300, kp: 8, boostT: 7, boostRegen: 11, gimbal: 12, len: 62, rad: 16, gearH: 4.4 },
  s5: { fwd: 90, back: 68, lat: 58, vert: 58, rate: 50, roll: 100, acc: 220, kp: 6.5, boostT: 7.5, boostRegen: 12, gimbal: 15, len: 88, rad: 15, gearH: 5 },
  s6: { fwd: 78, back: 60, lat: 50, vert: 50, rate: 42, roll: 80, acc: 170, kp: 5.5, boostT: 8, boostRegen: 13, gimbal: 18, len: 84, rad: 18, gearH: 5.5 },
  s7: { fwd: 66, back: 52, lat: 42, vert: 42, rate: 35, roll: 65, acc: 130, kp: 4.8, boostT: 8.5, boostRegen: 14, gimbal: 22, len: 99, rad: 19, gearH: 6 },
  s8: { fwd: 57, back: 44, lat: 35, vert: 35, rate: 28, roll: 50, acc: 100, kp: 4, boostT: 9, boostRegen: 15, gimbal: 28, len: 189, rad: 15, gearH: 7 },
};

// Gemeinsame Faktoren
export const K = {
  reise: 2.8,          // REISE-Höchsttempo × vK
  boostV: 1.7,         // Boost-Höchsttempo × vK
  boostThrust: 1.5,    // Boost: Schub ×
  boostTurn: 1.2,      // Boost: Drehraten ×
  brake: 1.3,          // Raumbremse: Schubgrenzen ×
  strafeV: 0.5,        // gekoppelt: Seiten-/Vertikaltempo × vK
  backV: 0.45,         // gekoppelt: Rückwärtstempo × vK
  reiseTurn: 0.6, landTurn: 0.5,
  landV: 60, landVz: 20,
  boostLock: 0.25,     // nach Leerlauf gesperrt, bis so viel nachgeladen ist
  boostWait: 1.0,      // Pause bis zum Nachladen (s)
  toReise: 1.5, toKampf: 0.8, toLand: 0.6, gearTime: 1.5,
  rollAccK: 2.0,       // Rollbeschleunigung × Nick-/Gierbeschleunigung
  autoRollMax: 50 * D, // Kurvenrollen bis 50°
  autoRollSlack: 5 * D,// Kurvenrollen führt nur bis 55° Rolllage (darüber gehört die Lage dem Piloten)
  horizonRate: 0.6,    // Horizont-Hilfe: höchstens 0,6 rad/s
  horizonPitch: 60 * D,// darüber kein Kurvenrollen, kein Ausrichten im Landemodus
  horizonPitchIdle: 45 * D, // Horizont-Hilfe in Ruhe nur bis 45° Nicken
  horizonIdle: 1.5,    // Horizont-Hilfe erst 1,5 s nach dem letzten Rollen und Lenken
  steerErr: 3 * D,     // Mausziel weiter als 3° vom Bug = der Pilot lenkt
  brakeK: 0.92,        // Bremsgrenze im Nasenregler ω ≤ 0,92·√(2·α·θ)
  capK: 3,             // weicher Tempodeckel: Überschuss baut mit 1 − e^(−3h) ab
};

// Waffen (ein Tempo für alle Laser: eine Vorhaltemarke)
export const BOLT_SPEED = 2400;
export const BOLT_PER_SHOT = 4;     // Bolzen je Laser und Sekunde (je ¼ Schaden, Munition je 4 Bolzen)
export const BOLT_SPREAD = 0.12 * D;
export const ENEMY_HIT_PAD = 1.25;  // Trefferkugel Gegner × Radius (PvE großzügig)
export const PVP_GIMBAL = 5 * D;    // Kardan im PvP höchstens 5°
export const AUTO_K = 0.8;          // Feuerleitrechner: Trefferchance × 0,8
// Handzielen gegen NPC (PvE): Bolzenschaden × 2,5. Die Startausrüstung (2 Laser, 140 Schaden/s) braucht gegen einen
// Raider (1.650 Hülle + Schild) bei 85 % Treffern sonst 14 s – im Taktikmodus gleich, dort tragen Würfel und Raketen
// (3,8 s mit Raketen). Mit × 2,5 liegt der Abschuss nur mit Lasern im Median bei ≈ 6 s, auch mit Ausweichen und
// Rückzug des Raiders sicher unter der Kennzahl ≤ 8 s (FLUGMODELL.md 3; × 2,25 ergab 6,0–8,1 s je Lauf). PvP, SAL,
// Feuerleitrechner und Taktik bleiben unverändert (Taktik-Goldtest bitgleich).
export const AIM_PVE = 2.5;
export const AUTO_CONE = 30 * D;    // Feuerleitrechner: Ziel im 30°-Kegel um den Bug
export const CONVERGE_DEFAULT = 500;
export const LOCK_TIME = 0.8, LOCK_CONE = 12 * D;
// Waffenkegel der Zielhilfe (Waffen schwenken auf die Vorhaltemarke, wenn das Fadenkreuz so nah liegt)
export const ASSIST_CONE = { mouse: 1.5 * D, pad: 2.5 * D, padPrecise: 4 * D, touch: 7 * D };
// Zielhilfe-Stufen: Zielbremse (Faktor der Stickrate nahe der Marke), Mitnahme k, Kegel-Faktor
export const ASSIST = [
  { brake: 1, k: 0, cone: 0 },          // AUS
  { brake: 0.75, k: 0.15, cone: 0.6 },  // NIEDRIG
  { brake: 0.55, k: 0.35, cone: 1 },    // STANDARD
  { brake: 0.45, k: 0.5, cone: 1.2 },   // HOCH
];
export const ASSIST_MAX_RATE = 0.4; // Mitnahme höchstens 40 % der Klassen-Drehrate

// Sektor als flacher Raum
export const SECTOR_BAND = 1500, HOME_BAND = 1200, BAND_WARN = 0.83;
// Sektorrand im 3D-Flug: Warnung ab 83 % (seitlich und Höhe), außerhalb 6 s Frist mit Zählwerk, erst dann Schaden
export const EDGE_GRACE = 6;
export const ZONE_DY = 400;         // Zonen (sichere Zone, Tor, Andocken) als Zylinder: |Δy| ≤ 400 m
export const TRACTOR_RANGE = 150, TRACTOR_SPEED = 60;
export const FLAT_BAND = 40;        // Gegner gegen Taktik-Piloten: ±40 m um dessen Höhe

/** Flugparameter für ein Schiff mit Kampftempo vK (aus world._speed). Rad/s statt °/s. */
export function shipParams(shipId, vK, out = {}) {
  const c = CLASS[shipId] || CLASS.s1;
  out.ship = CLASS[shipId] ? shipId : 's1';
  out.vK = vK; out.vR = vK * K.reise; out.vB = vK * K.boostV;
  out.aFwd = c.fwd; out.aBack = c.back; out.aLat = c.lat; out.aVert = c.vert;
  out.rate = c.rate * D; out.rollRate = c.roll * D;
  out.alpha = c.acc * D; out.alphaRoll = c.acc * D * K.rollAccK;
  out.kp = c.kp;
  out.boostT = c.boostT; out.boostRegen = c.boostRegen;
  out.gimbal = c.gimbal * D;
  out.len = c.len; out.rad = c.rad; out.gearH = c.gearH;
  out.vLat = vK * K.strafeV; out.vBack = vK * K.backV;
  return out;
}

// Gegner: Drehrate (°/s) und Beschleunigung (× Tempo/s) je Stil (FLUGMODELL.md 8)
export const ENEMY_STYLE = {
  pack: { rate: 110, acc: 1.1, vert: 0.6 },
  ambush: { rate: 130, acc: 1.4, vert: 0.9 },
  kite: { rate: 60, acc: 0.7, vert: 0.3 },
  swarm: { rate: 150, acc: 1.6, vert: 0.8 },
  thief: { rate: 120, acc: 1.3, vert: 0.6 },
  guard: { rate: 80, acc: 0.9, vert: 0.4 },
  big: { rate: 20, acc: 0.3, vert: 0.15 },
};

// Fluglabor (?dev=fluglabor, Planung/FLUGMODELL.md 14): Faktoren auf die Klassenwerte, nur Entwicklung
export const LAB_DEFAULT = Object.freeze({ kp: 1, rate: 1, acc: 1, thrust: 1, boostV: 1, boostT: 1 });
/** Laborfaktoren auf berechnete Flugparameter anwenden (nach shipParams) */
export function labParams(P, L) {
  P.kp *= L.kp; P.rate *= L.rate; P.rollRate *= L.rate; P.alpha *= L.acc; P.alphaRoll *= L.acc;
  P.aFwd *= L.thrust; P.aBack *= L.thrust; P.aLat *= L.thrust; P.aVert *= L.thrust;
  P.vB *= L.boostV; P.boostT *= L.boostT;
  return P;
}
