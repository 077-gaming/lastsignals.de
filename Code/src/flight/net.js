// Netz-Felder des 3D-Flugs (Planung/FLUGMODELL.md 9): hinten an das bisherige Zustandsfeld angehängt, damit alte
// Clients (lesen Stelle 0–8, prüfen nur Länge ≥ 8) unverändert weiterlaufen. Lage als Smallest-three-Quaternion,
// Geschwindigkeit in dm/s, Hermite-Interpolation für Kurvenflug.
export const FM = 3;              // Flugmodell-Version (Presence-Metadaten, PvP nur bei gleicher Version)
export const FF = { boost: 1, reise: 2, decoupled: 4, landing: 8, gear: 16, tactical: 32, assist0: 64, assist1: 128 };
const S3 = 32767 * Math.SQRT2;

/** Quaternion → [a, b, c, idx] (größter Anteil weggelassen, Vorzeichen so, dass er positiv ist) */
export function packQuat(q, out = [0, 0, 0, 0]) {
  let m = 0, mv = Math.abs(q[0]);
  for (let i = 1; i < 4; i++) if (Math.abs(q[i]) > mv) { mv = Math.abs(q[i]); m = i; }
  const s = q[m] < 0 ? -1 : 1;
  let k = 0;
  for (let i = 0; i < 4; i++) if (i !== m) out[k++] = Math.round(q[i] * s * S3) | 0;
  out[3] = m;
  return out;
}
export function unpackQuat(a, b, c, idx, out) {
  const m = (idx | 0) & 3;
  const vals = [a / S3, b / S3, c / S3];
  let k = 0, sum = 0;
  for (let i = 0; i < 4; i++) if (i !== m) { const v = Math.max(-0.7072, Math.min(0.7072, vals[k++] || 0)); out[i] = v; sum += v * v; }
  out[m] = Math.sqrt(Math.max(0, 1 - sum));
  const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  for (let i = 0; i < 4; i++) out[i] /= l;
  return out;
}

const _qq = [0, 0, 0, 0];
/** Angehängte Felder 9–18: y (dm), Quaternion (3 + Index), v (dm/s), Flugflags, fm */
export function packFlight(s) {
  packQuat(s.q || [0, 0, 0, 1], _qq);
  return [
    Math.round((s.y || 0) * 10), _qq[0], _qq[1], _qq[2], _qq[3],
    Math.round((s.vx || 0) * 10), Math.round((s.vy || 0) * 10), Math.round((s.vz || 0) * 10),
    (s.ff | 0) & 255, FM,
  ];
}
/** Angehängte Felder lesen (a = ganzes Feld). Ohne Felder (alter Client): null */
export function unpackFlight(a, out) {
  if (!Array.isArray(a) || a.length < 19) return null;
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const y = num(a[9]) / 10;
  if (Math.abs(y) > 50000) return null;
  out.y = y;
  out.q = out.q || [0, 0, 0, 1];
  unpackQuat(num(a[10]), num(a[11]), num(a[12]), num(a[13]), out.q);
  out.vx = Math.max(-5000, Math.min(5000, num(a[14]) / 10));
  out.vy = Math.max(-5000, Math.min(5000, num(a[15]) / 10));
  out.vz = Math.max(-5000, Math.min(5000, num(a[16]) / 10));
  out.ff = num(a[17]) | 0;
  out.fm = num(a[18]) | 0;
  return out;
}

/** Kubische Hermite-Interpolation einer Komponente (Ort p, Tempo v an zwei Stützstellen, Spanne T, Anteil k) */
export function hermite(p0, v0, p1, v1, T, k) {
  const k2 = k * k, k3 = k2 * k;
  return (2 * k3 - 3 * k2 + 1) * p0 + (k3 - 2 * k2 + k) * T * v0 + (-2 * k3 + 3 * k2) * p1 + (k3 - k2) * T * v1;
}
