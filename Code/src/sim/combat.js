// Reine Kampf-Rechnungen (ohne Ereignisse, ohne Speicher-Neuanlage).
import { SHIELD_ABSORB, DAMAGE_SPREAD } from './config.js';

/** Schaden würfeln: Grundschaden × Faktor × Zufall 0.9–1.1, ganzzahlig. */
export function rollDamage(rng, base, mult) {
  return Math.round(base * mult * (1 - DAMAGE_SPREAD + rng.next() * 2 * DAMAGE_SPREAD));
}

/**
 * Schaden auf eine Entity anwenden.
 * Normal: Schild fängt 80 % ab, solange er reicht, Rest geht auf die Hülle.
 * shieldOnly (SAB): nur auf den Schild.
 * Ergebnis landet in `out` ({ hull, shield }), damit nichts neu angelegt wird.
 */
export function applyDamage(target, dmg, shieldOnly, out) {
  let s = 0, h = 0;
  if (shieldOnly) {
    s = Math.min(target.shield, dmg);
  } else if (target.shield > 0) {
    s = Math.min(target.shield, dmg * SHIELD_ABSORB);
    h = dmg - s;
  } else {
    h = dmg;
  }
  s = Math.round(s); h = Math.round(h);
  target.shield -= s;
  if (target.shield < 0) target.shield = 0;
  target.hp -= h;
  if (target.hp < 0) target.hp = 0;
  out.shield = s;
  out.hull = h;
  return out;
}

/** Winkel auf (-PI, PI] bringen. */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** Drehung weich zum Zielwinkel, höchstens `maxStep` Radiant. */
export function turnToward(rot, want, maxStep) {
  const d = wrapAngle(want - rot);
  if (d > maxStep) return wrapAngle(rot + maxStep);
  if (d < -maxStep) return wrapAngle(rot - maxStep);
  return wrapAngle(want);
}

/** Blickwinkel für eine Richtung (dx, dz) nach Konvention: 0 = −z, Richtung = (−sin, −cos). */
export function headingOf(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/** Zahl mit deutschen Tausenderpunkten. */
export function fmt(n) {
  const v = Math.round(n);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return v < 0 ? '-' + s : s;
}
