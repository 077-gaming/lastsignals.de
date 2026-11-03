// Zielmathematik (Planung/FLUGMODELL.md 7): Vorhalt, Konvergenz, Kardan, Lenkkegel, Zielhilfe, Strecke gegen
// Kugel/Kapsel relativ zur Zielbewegung. Reine Funktionen auf Zahlenfeldern, keine Speicher-Neuanlage.
// Regel (für Sim-Treffer, Vorhaltemarke und Gegnervorhalt gleich): Bolzen erben die Schützengeschwindigkeit NICHT.
import { vAngle, vNorm, vCross, vDot, vLen, qFromAxisAngle, qRot } from './math3.js';
import { ASSIST, ASSIST_MAX_RATE } from './params.js';

/** Abfangzeit: kleinste positive Lösung von |r + u·t| = s·t (r: Ziel − Schütze, u: Zielgeschwindigkeit) oder −1 */
export function leadTime(rx, ry, rz, ux, uy, uz, s) {
  const a = ux * ux + uy * uy + uz * uz - s * s;
  const b = 2 * (rx * ux + ry * uy + rz * uz);
  const c = rx * rx + ry * ry + rz * rz;
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
  if (lo > 0) return lo;
  if (hi > 0) return hi;
  return -1;
}
/** Vorhaltepunkt → out (Weltort) und Rückgabe t (oder −1) */
export function leadPoint(sp, tp, tv, s, out) {
  const t = leadTime(tp[0] - sp[0], tp[1] - sp[1], tp[2] - sp[2], tv[0], tv[1], tv[2], s);
  if (t < 0) return -1;
  out[0] = tp[0] + tv[0] * t; out[1] = tp[1] + tv[1] * t; out[2] = tp[2] + tv[2] * t;
  return t;
}

/**
 * Strecke p0→p1 (Bolzen in einem Schritt) gegen eine bewegte Kugel (Mitte c0 → c1, Radius R), relativ gerechnet:
 * → Anteil t ∈ [0, 1] der ersten Berührung oder −1. Kein Durchtunneln auch bei 40 m je Schritt gegen r = 12.
 */
export function segSphere(p0x, p0y, p0z, p1x, p1y, p1z, c0x, c0y, c0z, c1x, c1y, c1z, R) {
  const ax = p0x - c0x, ay = p0y - c0y, az = p0z - c0z;
  const dx = (p1x - c1x) - ax, dy = (p1y - c1y) - ay, dz = (p1z - c1z) - az;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (ax * dx + ay * dy + az * dz), Cc = ax * ax + ay * ay + az * az - R * R;
  if (Cc <= 0) return 0;
  if (A < 1e-12) return -1;
  const disc = B * B - 4 * A * Cc;
  if (disc < 0) return -1;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Strecke gegen bewegte Kapsel (Achse n, halbe Länge L, Radius R, Mitte c0 → c1), relativ gerechnet: Abstand der
 * relativen Strecke zur Achsstrecke; → Anteil t der nächsten Annäherung, falls ≤ R, sonst −1.
 */
export function segCapsule(p0x, p0y, p0z, p1x, p1y, p1z, c0x, c0y, c0z, c1x, c1y, c1z, nx, ny, nz, L, R) {
  // relative Strecke a → b, Achsstrecke −nL … +nL um 0
  const ax = p0x - c0x, ay = p0y - c0y, az = p0z - c0z;
  const ux = (p1x - c1x) - ax, uy = (p1y - c1y) - ay, uz = (p1z - c1z) - az;
  const vx = nx * 2 * L, vy = ny * 2 * L, vz = nz * 2 * L;
  const wx = ax + nx * L, wy = ay + ny * L, wz = az + nz * L; // a − (−nL)
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  let s, t;
  if (den < 1e-9) { s = 0; t = c > 1e-9 ? Math.max(0, Math.min(1, e / c)) : 0; }
  else {
    s = Math.max(0, Math.min(1, (b * e - c * d) / den));
    t = c > 1e-9 ? (b * s + e) / c : 0;
    if (t < 0) { t = 0; s = a > 1e-9 ? Math.max(0, Math.min(1, -d / a)) : 0; }
    else if (t > 1) { t = 1; s = a > 1e-9 ? Math.max(0, Math.min(1, (b - d) / a)) : 0; }
  }
  const qx = wx + ux * s - vx * t, qy = wy + uy * s - vy * t, qz = wz + uz * s - vz * t;
  return qx * qx + qy * qy + qz * qz <= R * R ? s : -1;
}

const _ax = new Float64Array(3), _q = new Float64Array(4);
/** Richtung dir höchstens maxAng von base entfernt: sonst auf den Kegelrand drehen → out */
export function clampCone(dir, base, maxAng, out) {
  const ang = vAngle(base, dir);
  if (ang <= maxAng) { out[0] = dir[0]; out[1] = dir[1]; out[2] = dir[2]; return false; }
  vCross(_ax, base, dir);
  const l = vLen(_ax);
  if (l < 1e-9) { out[0] = base[0]; out[1] = base[1]; out[2] = base[2]; return true; }
  qFromAxisAngle(_q, _ax[0] / l, _ax[1] / l, _ax[2] / l, maxAng);
  qRot(out, _q, base);
  return true;
}

/** Laserrichtung: von der Mündung zum Konvergenzpunkt (Fadenkreuzstrahl in Entfernung dist), Kardan um den Bug → out */
const _cp = new Float64Array(3), _d = new Float64Array(3);
export function convergeDir(mx, my, mz, ox, oy, oz, aim, dist, nose, gimbal, out) {
  _cp[0] = ox + aim[0] * dist - mx; _cp[1] = oy + aim[1] * dist - my; _cp[2] = oz + aim[2] * dist - mz;
  vNorm(_d, _cp);
  return clampCone(_d, nose, gimbal, out);
}

/** Zielhilfe-Stufe (0–3), im PvP höchstens NIEDRIG (1) ohne Mitnahme */
export function assistLevel(level, pvp) {
  const L = Math.max(0, Math.min(3, level | 0));
  return pvp ? Math.min(1, L) : L;
}
/**
 * Zielhilfe für Stick-Zielen (FLUGMODELL.md 5.3): Zielbremse nahe der Vorhaltemarke und Mitnahme der
 * Markenbewegung – nur solange der Stick ausgelenkt ist, höchstens 40 % der Klassen-Drehrate.
 * err: Winkel Fadenkreuz → Marke (rad), pipRate: Winkelgeschwindigkeit der Marke (rad/s), stick: Auslenkung 0..1,
 * targetAng: Winkelradius des Ziels, classRate: Drehrate der Klasse (rad/s).
 * → { brake (Faktor der Stickrate), follow (rad/s zusätzlich entlang der Markenbewegung) }
 */
const AS = { brake: 1, follow: 0 };
// Bereich der Zielbremse (Runde 3): innen 1,3 × Winkelradius des Ziels, mindestens 1°, höchstens 4°; nach außen
// auslaufend über noch einmal so viel (höchstens 3°). Vorher 2,5 × Radius und doppelt so weit auslaufend: ein Raider in
// 150 m bremste den Stick bis 17° (auslaufend 34°), im Kurvenkampf auf kurze Distanz war der Stick fast immer gebremst.
export const BRAKE_IN = 1.3, BRAKE_MIN = 1 * Math.PI / 180, BRAKE_MAX = 4 * Math.PI / 180, BRAKE_OUT = 3 * Math.PI / 180;
/**
 * toward: Richtung der Stickbewegung gegen die Richtung zur Marke (cos, −1..1). Die Bremse greift nur, wenn das
 * Fadenkreuz auf die Marke zu oder an ihr entlang läuft; wer vom Ziel weg auf ein anderes umschwenkt, wird nicht
 * gebremst (Runde 3: „klebrig“ beim Zielwechsel). Die Mitnahme gilt weiter nur mit Stickeingabe.
 */
export function assist(level, pvp, err, pipRate, stick, targetAng, classRate, toward = 1) {
  const L = assistLevel(level, pvp), A = ASSIST[L];
  AS.brake = 1; AS.follow = 0;
  if (!L || stick <= 0.02) return AS; // ohne Eingabe zieht nichts
  const inner = Math.min(BRAKE_MAX, Math.max(BRAKE_MIN, BRAKE_IN * targetAng)), outer = inner + Math.min(BRAKE_OUT, inner);
  const k = err >= outer ? 0 : err <= inner ? 1 : 1 - (err - inner) / (outer - inner);
  const sk = k * k * (3 - 2 * k);
  // auf der Marke selbst (innere Hälfte) zählt jede Richtung als Feinzielen
  const tw = err <= inner * 0.5 ? 1 : Math.max(0, Math.min(1, toward * 1.5 + 0.25));
  AS.brake = 1 + (A.brake - 1) * sk * tw;
  // Mitnahme ebenso nur, solange der Stick nicht vom Ziel weg zeigt (Umschwenken auf ein anderes Ziel bleibt frei)
  if (!pvp && A.k > 0 && sk > 0) AS.follow = Math.min(A.k * pipRate * sk * tw, ASSIST_MAX_RATE * classRate);
  return AS;
}
// PvP zwischen den Ansichten: Ein Taktik-Schütze (Würfel, misst in der Ebene) trifft einen fremden Spieler nur, wenn
// der für ihn in der Ebene liegt – höchstens 15° über/unter ihm, mindestens 60 m Spielraum. Sonst träfe ein
// Klickflieger einen 3D-Piloten 500 m über sich. Gleiche Regel beim Schützen (world.js) und beim Opfer (mp-core.js).
export const PVP_TAC_ELEV = 15 * Math.PI / 180, PVP_TAC_DY = 60;
export function tacticalReach(shooter, victim) {
  const dxz = Math.hypot(victim.x - shooter.x, victim.z - shooter.z), dy = Math.abs((victim.y || 0) - (shooter.y || 0));
  return dy <= Math.max(PVP_TAC_DY, dxz * Math.tan(PVP_TAC_ELEV));
}
export { vDot };
