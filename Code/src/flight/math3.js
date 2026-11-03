// Vektoren und Quaternionen auf Float64Array bzw. Zahlenfeldern (ohne three.js, läuft in Browser, Worker und Node).
// Alle Funktionen schreiben in einen Ausgabeparameter und legen nichts neu an. Quaternion = [x, y, z, w].
// Achsen (Planung/FLUGMODELL.md 4.1): Welt +x rechts, +y oben, −z „Norden“; Körper vorn = −z, oben = +y, rechts = +x.
// Gieren um +y (rot = 0 → Bug nach −z, wie combat.js headingOf), Nicken um Körper-x (+ = Nase hoch),
// Rollen um Körper-z (+ = rechte Tragfläche hoch, linke runter, wie das bisherige bank > 0). Reihenfolge Y-X-Z (three.js 'YXZ').

export const v3 = (x = 0, y = 0, z = 0) => { const a = new Float64Array(3); a[0] = x; a[1] = y; a[2] = z; return a; };
export const q4 = () => { const a = new Float64Array(4); a[3] = 1; return a; };

export function vSet(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; }
export function vCopy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; }
export function vAdd(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; }
export function vSub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; }
export function vScale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; }
export function vAddScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; }
export function vDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function vLen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
export function vLen2(a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; }
export function vCross(o, a, b) {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  o[0] = x; o[1] = y; o[2] = z; return o;
}
export function vNorm(o, a) {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  if (l < 1e-12) { o[0] = 0; o[1] = 0; o[2] = -1; return o; }
  o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
}
/** Winkel zwischen zwei Einheitsvektoren (rad), robust nahe 0 und π */
export function vAngle(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

export function qSet(o, x, y, z, w) { o[0] = x; o[1] = y; o[2] = z; o[3] = w; return o; }
export function qCopy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; }
export function qIdentity(o) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; }
/** o = a ⊗ b */
export function qMul(o, a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}
export function qConj(o, a) { o[0] = -a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = a[3]; return o; }
export function qNorm(o, a) {
  const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]) || 1;
  o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
}
export function qLen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]); }
/** Vektor v mit q drehen (Körper → Welt) */
export function qRot(o, q, v) {
  const x = v[0], y = v[1], z = v[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return o;
}
/** Vektor v mit q⁻¹ drehen (Welt → Körper) */
export function qInvRot(o, q, v) {
  const x = v[0], y = v[1], z = v[2], qx = -q[0], qy = -q[1], qz = -q[2], qw = q[3];
  const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
  o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return o;
}
export function qFromAxisAngle(o, ax, ay, az, ang) {
  const h = ang * 0.5, s = Math.sin(h);
  o[0] = ax * s; o[1] = ay * s; o[2] = az * s; o[3] = Math.cos(h); return o;
}
const _qa = new Float64Array(4), _qb = new Float64Array(4), _qc = new Float64Array(4);
/** Lage aus Gieren (rot-Konvention), Nicken, Rollen (Reihenfolge Y-X-Z) */
export function qFromYPR(o, yaw, pitch, roll) {
  qFromAxisAngle(_qa, 0, 1, 0, yaw);
  qFromAxisAngle(_qb, 1, 0, 0, pitch);
  qFromAxisAngle(_qc, 0, 0, 1, roll);
  qMul(o, _qa, _qb);
  return qMul(o, o, _qc);
}
/** q ← q ⊗ exp(½·w·h): exakte Drehung um die Körperachse w (rad/s) für die Zeit h, danach normiert */
export function qStepBody(q, w, h) {
  const wx = w[0], wy = w[1], wz = w[2];
  const m = Math.sqrt(wx * wx + wy * wy + wz * wz);
  if (m < 1e-14) return q;
  const a = m * h;
  qFromAxisAngle(_qa, wx / m, wy / m, wz / m, a);
  qMul(q, q, _qa);
  return qNorm(q, q);
}
/** Kugelinterpolation a → b (k 0..1), kürzester Weg */
export function qSlerp(o, a, b, k) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka, kb;
  if (c > 0.9995) { ka = 1 - k; kb = k; }
  else { const th = Math.acos(c), s = Math.sin(th); ka = Math.sin((1 - k) * th) / s; kb = Math.sin(k * th) / s; }
  o[0] = a[0] * ka + bx * kb; o[1] = a[1] * ka + by * kb; o[2] = a[2] * ka + bz * kb; o[3] = a[3] * ka + bw * kb;
  return qNorm(o, o);
}

const FWD = new Float64Array([0, 0, -1]), UP = new Float64Array([0, 1, 0]), RIGHT = new Float64Array([1, 0, 0]);
export const AX = { FWD, UP, RIGHT };
export function fwdOf(o, q) { return qRot(o, q, FWD); }
export function upOf(o, q) { return qRot(o, q, UP); }
export function rightOf(o, q) { return qRot(o, q, RIGHT); }

const _f = new Float64Array(3), _r = new Float64Array(3), _u = new Float64Array(3), _h = new Float64Array(3), _hu = new Float64Array(3);
/** Kurs (rot-Konvention) der Bugrichtung; nahe senkrecht → fallback */
export function yawOf(q, fallback = 0) {
  fwdOf(_f, q);
  if (_f[0] * _f[0] + _f[2] * _f[2] < 1e-6) return fallback;
  return Math.atan2(-_f[0], -_f[2]);
}
export function pitchOf(q) { fwdOf(_f, q); return Math.asin(Math.max(-1, Math.min(1, _f[1]))); }
/** Rollwinkel gegen die Weltsenkrechte (+ = rechte Tragfläche hoch); bei senkrechtem Bug 0 */
export function rollOf(q, up = UP) {
  fwdOf(_f, q); rightOf(_r, q);
  vCross(_h, _f, up);
  const hl = vLen(_h);
  if (hl < 1e-4) return 0;
  vScale(_h, _h, 1 / hl);         // waagrechte Rechte
  vCross(_hu, _h, _f);            // waagrechtes Oben
  return Math.atan2(vDot(_r, _hu), vDot(_r, _h));
}
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
