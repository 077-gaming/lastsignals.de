// Gegner-KI im 3D-Flug (Planung/FLUGMODELL.md 8): Bahnen in geneigten Ebenen, Anflug mit Abdrehen, Durchflug und
// Wende (halber Looping, höchstens 2 gleichzeitig), Scheren, wenn der Spieler im Heck sitzt, Hinterhalt aus dem toten
// Winkel, Schwarm auf der Kugelschale, Abstand halten mit Höhenwechsel. Regie-Grenzen: höchstens 2 Angreifer in der
// hinteren Halbkugel, höchstens 1 senkrecht über/unter dem Spieler. Zufall nur aus Hashes der Gegner-Id und der Zeit
// (nie world.rng): der Taktikweg bleibt bitgleich, und die 3D-Bahnen sind trotzdem reproduzierbar.
import { hashString } from './rng.js';
import { fwdOf } from '../flight/math3.js';
import { enemyFwd } from './world3d.js';
import { cancelSpecial } from './ai.js';
import { TAIL3 } from '../flight/params.js';

const D = Math.PI / 180;
const _f = new Float64Array(3), _e = new Float64Array(3);
const PASS_MAX = 2;

/** reproduzierbarer Zufall 0..1 je Gegner und Zähler (ohne world.rng) */
function hr(e, k) {
  let h = (e._h3 || (e._h3 = hashString(String(e.id) + ':3d') || 1)) ^ Math.imul(k + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Bahnebene je Gegner: Normale um 15–45° gegen die Senkrechte gekippt (Taktik: flach) */
function planeOf(e) {
  if (e._pnx === undefined) {
    const tilt = (15 + 30 * hr(e, 1)) * D, az = hr(e, 2) * Math.PI * 2;
    e._pnx = Math.sin(tilt) * Math.cos(az); e._pny = Math.cos(tilt); e._pnz = Math.sin(tilt) * Math.sin(az);
    e._holdY = (hr(e, 3) * 2 - 1) * 250;
    e._flatOff = (hr(e, 4) * 2 - 1) * 40;
  }
}

function style(e) { const ai = e.def.ai; return ai ? ai.style : 'pack'; }
function big(e) { return e.radius >= 55 || e.def.speed < 100; }

/** Bewegungswunsch im 3D-Kampf gegen den Spieler → MV (tx, ty, tz, face, fx, fy, fz). d: 3D-Abstand. */
export function steer3d(w, e, tgt, speed, MV, hold) {
  planeOf(e);
  const ox = e.x - tgt.x, oy = e.y - tgt.y, oz = e.z - tgt.z;
  const d = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
  const nx = ox / d, ny = oy / d, nz = oz / d;
  const def = e.def, st = style(e), t = w.time;
  if (hold) {
    // Warteschale: vor dem Spieler (vordere Halbkugel), gestaffelte Höhe, dreht langsam
    fwdOf(_f, w.fl.q);
    const R = Math.max(def.range * 1.55, 650) + (e.orbitK || 0.7) * 160;
    const a0 = Math.atan2(nz, nx) + w._ringDir * 0.35 * 0.25;
    let px = Math.cos(a0) * R, pz = Math.sin(a0) * R;
    if (px * _f[0] + pz * _f[2] < -R * 0.2) { px += _f[0] * R * 0.6; pz += _f[2] * R * 0.6; } // nicht im Rücken warten
    const gx = tgt.x + px - e.x, gy = tgt.y + e._holdY - e.y, gz = tgt.z + pz - e.z, gl = Math.hypot(gx, gy, gz) || 1;
    const s = Math.min(1, gl / 300) * speed * 0.7;
    MV.tx = gx / gl * s; MV.ty = gy / gl * s; MV.tz = gz / gl * s;
    if (d < def.range * 1.6) { MV.face = true; MV.fx = -ox; MV.fy = -oy; MV.fz = -oz; }
    return d;
  }
  // Manöver wählen und fortschreiben
  const agile = !big(e) && st !== 'kite';
  // Eröffnung: Rudel und Lauerer kommen zur Hälfte gleich über das Heck (Runde 2: vorher immer frontal)
  if (!e.m3) { e.m3 = agile ? ((st === 'pack' || st === 'ambush') && hr(e, 7) < 0.5 ? 'tail' : 'run') : 'orbit'; e.m3T = 0; e.m3N = 0; }
  e.m3T += 1 / 60;
  fwdOf(_f, w.fl.q); // Bug des Spielers
  const inFront = -(nx * _f[0] + ny * _f[1] + nz * _f[2]); // > 0: Gegner liegt vor dem Spieler
  // Spieler sitzt ihm im Heck: Gegner fliegt vom Spieler weg (Bug ≈ Richtung Spieler → Gegner) und der Spieler zielt auf ihn
  enemyFwd(e, _e);
  const chased = d < 500 && (nx * _e[0] + ny * _e[1] + nz * _e[2]) > Math.cos(35 * D) && (nx * _f[0] + ny * _f[1] + nz * _f[2]) > Math.cos(25 * D);
  if (agile && chased && e.m3 !== 'scissor' && e.m3 !== 'break' && w.time > (e.m3Cd || 0)) { e.m3 = 'scissor'; e.m3T = 0; e.m3N++; }
  let gx = 0, gy = 0, gz = 0, sk = 1, faceT = true;
  switch (e.m3) {
    case 'run': {
      // Anflug auf den Vorhaltepunkt, dabei feuern; nah dran → Abdrehen oder Durchflug
      const lead = Math.min(1.2, d / 700);
      gx = tgt.x + (tgt.vx || 0) * lead - e.x; gy = tgt.y + (tgt.vy || 0) * lead - e.y; gz = tgt.z + (tgt.vz || 0) * lead - e.z;
      if (d < Math.max(def.range * 0.45, 200) || e.m3T > 6) {
        const passing = countPass(w);
        if ((st === 'pack' || st === 'ambush') && passing < PASS_MAX && hr(e, 10 + e.m3N) < 0.45) startPass(e, tgt, nx, ny, nz);
        else startBreak(e, tgt, nx, ny, nz);
      }
      break;
    }
    case 'break': {
      // Abdrehen: senkrecht zur Anflugachse (oben/unten bevorzugt), 400–700 m weg, dann Wende – frontal oder (Runde 2)
      // über das Heck des Spielers, wenn dort noch Platz ist (Regie: höchstens 2 hinten)
      gx = e.m3X - e.x; gy = e.m3Y - e.y; gz = e.m3Z - e.z;
      faceT = false;
      if (Math.hypot(gx, gy, gz) < 90 || e.m3T > 3) {
        const tail = (st === 'pack' || st === 'ambush' || st === 'thief') && !e._noRear && hr(e, 120 + e.m3N) < TAIL3;
        e.m3 = tail ? 'tail' : 'run'; e.m3T = 0; e.m3N++;
      }
      break;
    }
    case 'tail': {
      // Ins Heck setzen (Runde 2): Punkt 240–360 m hinter dem Spieler (leicht versetzt), dort sein Tempo übernehmen und
      // feuern. Der Spieler muss wenden, ausweichen oder boosten – Kurvenkampf statt Schießbude. Endet nach 7 s, wenn
      // die Regie den Platz hinten braucht oder der Spieler zu nah kommt (dann Abdrehen).
      fwdOf(_e, w.fl.q);
      const back = 240 + 120 * hr(e, 130 + e.m3N), so = (hr(e, 140 + e.m3N) - 0.5) * 160, uo = (hr(e, 150 + e.m3N) - 0.5) * 140;
      const sx = -_e[2], sz = _e[0], sl = Math.hypot(sx, sz) || 1;
      const px = tgt.x - _e[0] * back + sx / sl * so, py = tgt.y - _e[1] * back + uo, pz = tgt.z - _e[2] * back + sz / sl * so;
      const hx = px - e.x, hy = py - e.y, hz = pz - e.z, hd = Math.hypot(hx, hy, hz) || 1;
      // Soll-Geschwindigkeit: Tempo des Spielers plus Annäherung an den Punkt, begrenzt auf das eigene Tempo
      const close = Math.min(speed * 1.05, hd * 1.4);
      let vx = (tgt.vx || 0) + hx / hd * close, vy = (tgt.vy || 0) + hy / hd * close, vz = (tgt.vz || 0) + hz / hd * close;
      const vl = Math.hypot(vx, vy, vz) || 1, vs = Math.min(vl, speed * 1.05);
      vx = vx / vl * vs; vy = vy / vl * vs; vz = vz / vl * vs;
      if (e._noRear) { e.m3 = 'run'; e.m3T = 0; e.m3N++; }
      else if (e.m3T > 7 || d < 120) startBreak(e, tgt, nx, ny, nz);
      MV.tx = vx; MV.ty = vy; MV.tz = vz;
      // nah am Heckpunkt: auf den Spieler zielen, sonst in Flugrichtung
      if (hd < 260 && d <= Math.max(def.range * 1.4, 500)) { MV.face = true; MV.fx = -ox; MV.fy = -oy; MV.fz = -oz; }
      else { MV.face = true; MV.fx = vx; MV.fy = vy; MV.fz = vz; }
      return d;
    }
    case 'pass': {
      // Durchflug: frontal mit seitlichem Versatz vorbei, 600 m Auslauf, dann halber Looping (nach oben) zurück
      if (e.m3P === 0) {
        gx = tgt.x + e.m3X - e.x; gy = tgt.y + e.m3Y - e.y; gz = tgt.z + e.m3Z - e.z;
        if ((e.x - tgt.x) * e.m3Dx + (e.y - tgt.y) * e.m3Dy + (e.z - tgt.z) * e.m3Dz > 0 && d > 140) { e.m3P = 1; e.m3T = 0; }
      } else if (e.m3P === 1) {
        gx = e.m3Dx; gy = e.m3Dy; gz = e.m3Dz; faceT = false;
        if (d > 380 || e.m3T > 2.5) { e.m3P = 2; e.m3T = 0; }
      } else {
        // halber Looping: Bahn biegt nach oben und zurück zum Ziel
        const k = Math.min(1, e.m3T / 1.6);
        gx = e.m3Dx * (1 - 2 * k) - nx * k; gy = (1 - Math.abs(1 - 2 * k)) * 1.2 + (tgt.y - e.y) / 600 * k; gz = e.m3Dz * (1 - 2 * k) - nz * k;
        faceT = k > 0.8;
        if (e.m3T > 2.2) { e.m3 = 'run'; e.m3T = 0; e.m3N++; }
      }
      break;
    }
    case 'scissor': {
      // Scheren: harte Wenden mit Höhenwechsel, solange der Spieler im Heck sitzt
      const side = (Math.floor(e.m3T / 1.1) + e.m3N) % 2 ? 1 : -1;
      fwdOf(_e, w.fl.q);
      // quer zur Blickrichtung des Spielers und abwechselnd hoch/runter
      const qx = -_e[2] * side, qz = _e[0] * side;
      gx = -nx * 0.3 + qx; gy = side * 0.7; gz = -nz * 0.3 + qz;
      faceT = false; sk = 1.05;
      if ((!chased && e.m3T > 1.2) || e.m3T > 3.3) { e.m3 = agile ? 'run' : 'orbit'; e.m3T = 0; e.m3Cd = w.time + 5; }
      break;
    }
    default: {
      // Kreisen in der eigenen geneigten Bahnebene (Distanzschützen, große Schiffe)
      const pnx = e._pnx, pny = e._pny, pnz = e._pnz;
      // Lage in der Ebene: Anteil entlang der Normalen abziehen
      const dn = ox * pnx + oy * pny + oz * pnz;
      let rx = ox - pnx * dn, ry = oy - pny * dn, rz = oz - pnz * dn;
      const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
      const R = st === 'kite' ? def.range * ((def.ai && def.ai.orbit) || 0.8) : Math.max(def.range * 0.7, e.radius + 120);
      let radial = Math.max(-1, Math.min(1, (R - d) / (R * 0.5)));
      if (st === 'kite' && d < R * 0.7) radial = 1;
      const dir = e.orbitDir || 1;
      const tx = (pny * rz - pnz * ry) * dir, ty = (pnz * rx - pnx * rz) * dir, tz = (pnx * ry - pny * rx) * dir;
      const tang = 0.65;
      gx = rx * radial + tx * tang - pnx * dn / 300; gy = ry * radial + ty * tang - pny * dn / 300; gz = rz * radial + tz * tang - pnz * dn / 300;
      if (st === 'swarm') { gx = rx * radial * 1.2 + tx * 0.8; gy = ry * radial * 1.2 + ty * 0.8; gz = rz * radial * 1.2 + tz * 0.8; }
      if (agile && e.m3T > 6) { e.m3 = 'run'; e.m3T = 0; }
    }
  }
  // Regie: nicht in die hintere Halbkugel (wenn schon 2 dort), nicht senkrecht über/unter (wenn schon 1 dort)
  if (e._noRear && inFront < 0.1) { gx += _f[0] * 1.2; gy += _f[1] * 1.2; gz += _f[2] * 1.2; }
  if (e._noTop && Math.abs(ny) > Math.cos(30 * D)) { gx += nx === 0 && nz === 0 ? 1 : nx * 2; gz += nz * 2; gy -= ny * 0.5; }
  const gl = Math.hypot(gx, gy, gz) || 1;
  let s = speed * sk;
  if (e.m3 === 'run' && d < 260) s *= 0.8;
  MV.tx = gx / gl * s; MV.ty = gy / gl * s; MV.tz = gz / gl * s;
  if (faceT && d <= Math.max(def.range * 1.4, 500)) { MV.face = true; MV.fx = -ox; MV.fy = -oy; MV.fz = -oz; }
  else { MV.face = true; MV.fx = MV.tx; MV.fy = MV.ty; MV.fz = MV.tz; }
  return d;
}

function countPass(w) { let n = 0; for (const o of w.enemies) if (o.alive && o.m3 === 'pass') n++; return n; }

function startBreak(e, tgt, nx, ny, nz) {
  // Richtung senkrecht zur Anflugachse: bevorzugt oben/unten, mit seitlichem Anteil
  const up = hr(e, 20 + e.m3N) < 0.5 ? 1 : -1, side = hr(e, 40 + e.m3N) < 0.5 ? 1 : -1;
  let ux = -nx * ny, uy = 1 - ny * ny, uz = -nz * ny;               // Senkrechte ohne Anteil der Achse
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const sx = -nz, sz = nx, sl = Math.hypot(sx, sz) || 1;
  const dist = 260 + 180 * hr(e, 60 + e.m3N);
  const bx = ux * up * 0.8 + sx / sl * side * 0.6 + nx * 0.4, by = uy * up * 0.8 + ny * 0.4, bz = uz * up * 0.8 + sz / sl * side * 0.6 + nz * 0.4;
  const bl = Math.hypot(bx, by, bz) || 1;
  e.m3 = 'break'; e.m3T = 0;
  e.m3X = e.x + bx / bl * dist; e.m3Y = e.y + by / bl * dist; e.m3Z = e.z + bz / bl * dist;
}
function startPass(e, tgt, nx, ny, nz) {
  // Versatz 80–150 m quer zur Anflugachse, danach durch: Richtung = vom Gegner zum Ziel
  const off = 80 + 70 * hr(e, 80 + e.m3N), a = hr(e, 90 + e.m3N) * Math.PI * 2;
  let px = -nz, py = 0, pz = nx; const pl = Math.hypot(px, pz) || 1; px /= pl; pz /= pl;
  const qx = ny * pz, qy = nz * px - nx * pz, qz = -ny * px;
  e.m3 = 'pass'; e.m3P = 0; e.m3T = 0;
  e.m3X = (px * Math.cos(a) + qx * Math.sin(a)) * off; e.m3Y = (py * Math.cos(a) + qy * Math.sin(a)) * off; e.m3Z = (pz * Math.cos(a) + qz * Math.sin(a)) * off;
  e.m3Dx = -nx; e.m3Dy = -ny; e.m3Dz = -nz;
}

/**
 * Regie-Grenzen in 3D (nach directCombat, 4× je Sekunde): höchstens 2 aktive Angreifer in der hinteren Halbkugel,
 * höchstens 1 direkt über oder unter dem Spieler (< 25° zur Senkrechten). Überzählige verlieren ihren Angriffsplatz
 * (warten vorn in der Schale) bzw. werden aus dem toten Winkel gedrängt. → { rear, top } nach der Regie
 */
const ATT = [];
export function direct3d(w) {
  const p = w.player;
  fwdOf(_f, w.fl.q);
  ATT.length = 0;
  for (const e of w.enemies) {
    if (!e.alive || e.targetId !== 'player') continue;
    e._noRear = false; e._noTop = false;
    if (e.state === 'attack' && e.token) ATT.push(e);
  }
  // nach Abstand: die Nächsten behalten ihren Platz
  ATT.sort((a, b) => dist2(a, p) - dist2(b, p));
  let rear = 0, top = 0;
  for (const e of ATT) {
    const dx = e.x - p.x, dy = e.y - p.y, dz = e.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const behind = (dx * _f[0] + dy * _f[1] + dz * _f[2]) / d < 0;
    const over = Math.abs(dy) / d > Math.cos(25 * D);
    if (behind && rear >= 2) { revoke(w, e); continue; }
    if (over && top >= 1) { revoke(w, e); continue; }
    if (behind) rear++; else if (rear >= 2) e._noRear = true;
    if (over) top++; else if (top >= 1) e._noTop = true;
  }
  w._regie3 = { rear, top, n: ATT.length };
  return w._regie3;
}
/** Angriffsplatz entziehen (auch mitten im Aufladen eines Spezialangriffs aus dem toten Winkel) */
function revoke(w, e) {
  if (e.spPhase) cancelSpecial(w, e);
  e.token = false; e.tokenT = 0; e.state = 'hold'; e.tactic = 'wartet im kreis';
}
function dist2(a, p) { return (a.x - p.x) ** 2 + (a.y - p.y) ** 2 + (a.z - p.z) ** 2; }

/** Hinterhalt (Jackal): lauert 250–400 m über oder unter dem Spieler hinten im toten Winkel der Kamera */
export function stalkPoint(w, e, out) {
  planeOf(e);
  const p = w.player;
  fwdOf(_f, w.fl.q);
  const up = hr(e, 5) < 0.5 ? 1 : -1, h = 250 + 150 * hr(e, 6);
  out.x = p.x - _f[0] * 520; out.y = p.y + up * h; out.z = p.z - _f[2] * 520;
  return out;
}

/** Gegner-Nicken zur Bewegungs- bzw. Blickrichtung (3D), sonst zurück auf 0 */
export function pitchToward(e, fx, fy, fz, rate, dt) {
  const want = Math.atan2(fy, Math.hypot(fx, fz) || 1e-6);
  const lim = Math.max(-1.35, Math.min(1.35, want));
  const d = lim - (e.pitch || 0);
  const step = rate * dt;
  e.pitch = (e.pitch || 0) + (d > step ? step : d < -step ? -step : d);
}
export { enemyFwd };
