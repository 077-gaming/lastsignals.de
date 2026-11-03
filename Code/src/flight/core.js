// Flugkern (Planung/FLUGMODELL.md 4): 6 Freiheitsgrade, Lage als Quaternion, Flugrechner gekoppelt/entkoppelt,
// Schub in alle sechs Richtungen, Boost mit Vorrat, Begrenzer, Betriebsarten KAMPF/REISE/LANDUNG, Umgebung env
// (Schwerkraft, Luft, Boden). Reine Funktionen ohne DOM und three.js, deterministisch, keine Speicher-Neuanlage je
// Schritt. Teilschritt h = 1/120 s (zwei je Sim-Schritt von 1/60 s).
import {
  vSet, vCopy, vLen, vDot, vNorm, vCross, vAngle, qRot, qInvRot, qStepBody, qFromYPR, qNorm, qMul, qConj, qCopy,
  fwdOf, rightOf, upOf, rollOf, pitchOf, yawOf, clamp,
} from './math3.js';
import { K } from './params.js';
import { updateLanding } from './landing.js';

export const H = 1 / 120;
export const MODE = { KAMPF: 0, REISE: 1, LANDUNG: 2 };
export const MODE_NAME = ['KAMPF', 'REISE', 'LANDUNG'];
// Steuerrahmen (Float32Array(16)), siehe FLUGMODELL.md 4.2
export const C = { TX: 0, TY: 1, TZ: 2, RP: 3, RY: 4, RR: 5, AIM: 6, AX: 7, AY: 8, AZ: 9, BTN: 10, EDGE: 11, LIM: 12, ROLLMAN: 13, ASSIST: 14, DEV: 15 };
export const BTN = { BOOST: 1, BRAKE: 2, FIRE: 4, PRECISE: 8, AUTOLAND: 16 };
export const EDGE = { COUPLE: 1, MODE: 2, LAND: 4, CRUISE: 8 };

export function makeCtl() { const c = new Float32Array(16); c[C.AZ] = -1; return c; }

export function createState() {
  return {
    p: new Float64Array(3), v: new Float64Array(3), q: new Float64Array([0, 0, 0, 1]), w: new Float64Array(3),
    pq: new Float64Array([0, 0, 0, 1]),           // Lage vor dem Sim-Schritt (Darstellung interpoliert)
    boost: 1, boostOn: false, boostLock: false, boostWait: 0,
    mode: MODE.KAMPF, modeWant: MODE.KAMPF, modeT: 0,
    coupled: true, limiter: Infinity, cruise: false, cruiseV: 0,
    gear: 0, landing: false, landed: false, alt: Infinity, vs: 0, touch: 0, crash: false, landDmg: 0,
    thr: new Float64Array(6), rcs: new Float64Array(3), accB: new Float64Array(3), accW: new Float64Array(3),
    // Kurvenrollen und Horizont-Hilfe sind Hilfen zum Zuschalten (Standard aus, wie in großen 6-DoF-Simulatoren);
    // Touch („Flug vereinfacht“) schaltet beide ein. rollIdle / steerIdle: Zeit seit eigenem Rollen bzw. Lenken.
    frame: 0, vmax: 0, gLoad: 0, autoRoll: false, horizon: false, warn: '', rollIdle: 9, steerIdle: 9, aimErr: 0,
  };
}

const _vb = new Float64Array(3), _a = new Float64Array(3), _aw = new Float64Array(3), _f = new Float64Array(3);
const _cmd = new Float64Array(3), _g = new Float64Array(3), _gb = new Float64Array(3), _ax = new Float64Array(3);
const _ab = new Float64Array(3), _tmp = new Float64Array(3), _qt = new Float64Array(4);

/** Höchsttempo der aktuellen Betriebsart (ohne Begrenzer) */
export function modeMax(st, P) {
  if (st.mode === MODE.REISE) return P.vR;
  if (st.mode === MODE.LANDUNG) return K.landV;
  return st.boostOn ? P.vB : P.vK;
}

/**
 * Flanken des Steuerrahmens einmal je Sim-Schritt auswerten (Kopplung, Betriebsart, Landemodus, Tempomat, Begrenzer).
 * ctx: { inCombat } aus der Welt. Gibt eine kurze Meldung zurück (oder '') – die Welt zeigt sie an.
 */
export function applyEdges(st, ctl, P, ctx) {
  const e = ctl[C.EDGE] | 0;
  let msg = '';
  if (e & EDGE.COUPLE) { st.coupled = !st.coupled; msg = st.coupled ? 'GEKOPPELT' : 'ENTKOPPELT'; }
  if (e & EDGE.MODE) {
    if (st.modeWant === MODE.REISE || st.mode === MODE.REISE) { st.modeWant = MODE.KAMPF; st.modeT = K.toKampf; msg = 'KAMPF'; }
    else if (ctx && ctx.inCombat) msg = 'REISE GESPERRT · IM KAMPF';
    else { st.modeWant = MODE.REISE; st.modeT = K.toReise; st.landing = false; msg = 'REISE WIRD AKTIVIERT'; }
  }
  if (e & EDGE.LAND) {
    st.landing = !st.landing;
    if (st.landing) { st.modeWant = MODE.LANDUNG; st.modeT = K.toLand; msg = 'LANDEMODUS · FAHRWERK AUS'; }
    else { st.modeWant = MODE.KAMPF; st.modeT = K.toKampf; st.landed = false; msg = 'LANDEMODUS AUS'; }
  }
  if (e & EDGE.CRUISE) {
    st.cruise = !st.cruise;
    if (st.cruise) { qInvRot(_vb, st.q, st.v); st.cruiseV = Math.max(0, -_vb[2]); msg = `TEMPOMAT ${Math.round(st.cruiseV)}`; }
    else msg = 'TEMPOMAT AUS';
  }
  const lim = ctl[C.LIM];
  if (lim) {
    const top = st.mode === MODE.REISE ? P.vR : P.vK;
    const cur = Number.isFinite(st.limiter) ? st.limiter : top;
    st.limiter = clamp(cur + lim * 10, 20, top);
    if (st.limiter >= top - 0.5) st.limiter = Infinity;
    msg = `BEGRENZER ${Number.isFinite(st.limiter) ? Math.round(st.limiter) : 'AUS'}`;
  }
  ctl[C.EDGE] = 0; ctl[C.LIM] = 0;
  return msg;
}

/** Moduswechsel von außen abbrechen (Treffer während REISE hochläuft) */
export function interruptMode(st) {
  if (st.modeWant === MODE.REISE && st.mode !== MODE.REISE) { st.modeWant = st.mode; st.modeT = 0; return true; }
  return false;
}

/**
 * Ein Teilschritt. ctl: Steuerrahmen, P: shipParams, env: { gravity:[3], rho, ground(px,py,pz,out) } oder null.
 */
export function step(st, ctl, P, env, h = H) {
  // 1. Betriebsart
  if (st.modeT > 0) { st.modeT -= h; if (st.modeT <= 0) { st.modeT = 0; st.mode = st.modeWant; } }
  else if (st.mode !== st.modeWant) st.mode = st.modeWant;
  const btn = ctl[C.BTN] | 0;
  // Boost: nur im KAMPF, Vorrat sinkt; leer → gesperrt bis 25 %; Nachladen nach 1 s Pause
  const wantBoost = (btn & BTN.BOOST) !== 0 && st.mode === MODE.KAMPF && !st.landed;
  if (wantBoost && !st.boostLock && st.boost > 0) {
    st.boostOn = true; st.boost -= h / P.boostT; st.boostWait = K.boostWait;
    if (st.boost <= 0) { st.boost = 0; st.boostLock = true; st.boostOn = false; }
  } else {
    st.boostOn = false;
    if (st.boostWait > 0) st.boostWait -= h;
    else if (st.boost < 1) { st.boost = Math.min(1, st.boost + h / P.boostRegen); if (st.boostLock && st.boost >= K.boostLock) st.boostLock = false; }
  }
  const modeTurn = st.mode === MODE.REISE ? K.reiseTurn : st.mode === MODE.LANDUNG ? K.landTurn : 1;
  const bt = st.boostOn ? K.boostTurn : 1;
  const wR = P.rate * modeTurn * bt, wRoll = P.rollRate * modeTurn * bt;

  // 2. Soll-Drehrate (Körper: x Nicken, y Gieren, z Rollen)
  const w = st.w;
  let steering;
  if (ctl[C.AIM] > 0.5) {
    // Mausziel: Fehler zwischen Bug und Zielrichtung, Drehachse im Körper, Bremsgrenze gegen Überschwingen
    _tmp[0] = ctl[C.AX]; _tmp[1] = ctl[C.AY]; _tmp[2] = ctl[C.AZ];
    qInvRot(_f, st.q, _tmp);
    const fl = vLen(_f) || 1; _f[0] /= fl; _f[1] /= fl; _f[2] /= fl;
    // Achse = Bug × Ziel = (0,0,−1) × f = (f.y, −f.x, 0)
    let axx = _f[1], axy = -_f[0];
    const al = Math.sqrt(axx * axx + axy * axy);
    const th = Math.atan2(al, -_f[2]);
    if (al > 1e-9) { axx /= al; axy /= al; } else if (_f[2] > 0) { axx = 0; axy = 1; } else { axx = 0; axy = 0; }
    let kp = P.kp;
    if (th < 0.5 * Math.PI / 180) kp *= 0.6 + 0.4 * th / (0.5 * Math.PI / 180);
    // Bremsgrenze je Achse aus der jeweils wirksamen Drehbeschleunigung
    let om = Math.min(kp * th, K.brakeK * Math.sqrt(2 * P.alpha * th));
    // je Achse auf die Klassen-Drehrate begrenzen (Richtung bleibt)
    const mx = Math.max(Math.abs(axx), Math.abs(axy)) || 1;
    if (om * mx > wR) om = wR / mx;
    _cmd[0] = axx * om; _cmd[1] = axy * om;
    st.aimErr = th;
    steering = th > K.steerErr;
  } else {
    _cmd[0] = clamp(ctl[C.RP], -1, 1) * wR; _cmd[1] = clamp(ctl[C.RY], -1, 1) * wR;
    st.aimErr = 0;
    steering = Math.abs(ctl[C.RP]) + Math.abs(ctl[C.RY]) > 0.04;
  }
  st.steerIdle = steering ? 0 : (st.steerIdle || 0) + h;
  if (ctl[C.ROLLMAN] > 0.5) { _cmd[2] = clamp(ctl[C.RR], -1, 1) * wRoll; st.rollIdle = 0; }
  else {
    st.rollIdle = (st.rollIdle || 0) + h;
    _cmd[2] = 0; // ohne Hilfe hält das Schiff seine Rolllage (6 Freiheitsgrade, nichts dreht von selbst)
    const up = env && env.gravity && (env.gravity[0] || env.gravity[1] || env.gravity[2]) ? negUp(env.gravity) : null;
    const pit = pitchOf(st.q);
    const phi = up ? rollOf(st.q, up) : rollOf(st.q);
    if (autoRollOn(st, pit, phi)) {
      // Kurvenrollen (koordiniert, bis 50°): seitlicher Zielfehler gegen die waagrechte Rechte. Greift nur nahe der
      // Waagrechten; eine eigene Rolllage (Q/E über 55°) bleibt unangetastet. Nach eigenem Rollen weich ab 0,3 s.
      let lat;
      if (ctl[C.AIM] > 0.5) {
        fwdOf(_ax, st.q); vCross(_tmp, _ax, up || UPW);
        const hl = vLen(_tmp) || 1;
        lat = (ctl[C.AX] * _tmp[0] + ctl[C.AY] * _tmp[1] + ctl[C.AZ] * _tmp[2]) / hl;
        lat = clamp(lat * 3, -1, 1);
      } else lat = -clamp(_cmd[1] / (wR || 1), -1, 1);
      const want = -lat * K.autoRollMax;
      const lim = Math.min(wRoll, 1.4) * clamp((st.rollIdle - 0.3) / 0.6, 0, 1);
      _cmd[2] = clamp((want - phi) * 3.2, -lim, lim);
    } else if (st.landing ? Math.abs(pit) < K.horizonPitch : (st.horizon && Math.abs(pit) < K.horizonPitchIdle)) {
      // Horizont-Hilfe: nur in Ruhe (kein eigenes Rollen und kein Lenken seit 1,5 s), höchstens 0,6 rad/s – ein
      // Looping oder eine Rolle wird nie zurückgedreht. Im Landemodus richtet sie immer nach der Schwerkraft aus.
      const idle = st.landing ? st.rollIdle - 1 : Math.min(st.rollIdle, st.steerIdle) - K.horizonIdle;
      const lim = K.horizonRate * clamp(idle / 0.6, 0, 1);
      if (lim > 0) _cmd[2] = clamp(-phi * 3.2, -lim, lim);
    }
  }
  // 3. Drehbeschleunigung begrenzen
  for (let i = 0; i < 3; i++) {
    const am = (i === 2 ? P.alphaRoll : P.alpha) * h;
    const dw = clamp(_cmd[i] - w[i], -am, am);
    w[i] += dw;
    st.rcs[i] = dw / am;
  }
  if (st.landed) { w[0] = 0; w[1] = 0; w[2] = 0; }
  // 4. Lage
  qStepBody(st.q, w, h);

  // 5. Schub im Körper
  qInvRot(_vb, st.q, st.v);
  const bth = st.boostOn ? K.boostThrust : 1;
  const brake = (btn & BTN.BRAKE) !== 0;
  const bk = brake ? K.brake : 1;
  const aF = P.aFwd * bth * bk, aB = P.aBack * bth * bk, aL = P.aLat * bth * bk, aV = P.aVert * bth * bk;
  const tx = clamp(ctl[C.TX], -1, 1), ty = clamp(ctl[C.TY], -1, 1), tz = clamp(ctl[C.TZ], -1, 1);
  const top = modeMax(st, P);
  let fwdMax = st.boostOn ? top : Math.min(top, st.limiter);
  if (st.mode === MODE.LANDUNG) fwdMax = K.landV;
  st.vmax = fwdMax;
  if (st.cruise) {
    // Tempomat: Schubtaste verstellt das gehaltene Tempo; Begrenzer und Betriebsart gelten immer (auch ohne Schub)
    const capC = st.mode === MODE.LANDUNG ? K.landV : Math.min(st.mode === MODE.REISE ? P.vR : P.vK, st.limiter);
    if (Math.abs(tz) > 0.05) st.cruiseV += tz * P.aFwd * 0.6 * h;
    st.cruiseV = clamp(st.cruiseV, 0, capC);
  }
  if (brake) {
    _ab[0] = clamp(-_vb[0] / h, -aL, aL); _ab[1] = clamp(-_vb[1] / h, -aV, aV); _ab[2] = clamp(-_vb[2] / h, -aF, aB);
  } else if (st.coupled) {
    const vl = st.mode === MODE.LANDUNG ? K.landV : P.vLat;
    const vv = st.mode === MODE.LANDUNG ? K.landVz : P.vLat;
    let vz;
    if (st.cruise) vz = -st.cruiseV;
    else vz = tz >= 0 ? -tz * fwdMax : -tz * P.vBack;
    if (st.boostOn && !st.cruise && tz < 0.05) vz = Math.min(vz, -0.95 * Math.abs(_vb[2])); // Boost ohne W: hält, bremst nicht
    let vy = ty * vv;
    if ((btn & BTN.AUTOLAND) && st.landing) vy = -2;
    // Bahnführung (Runde 3): Dreht das Schiff, kippt die Geschwindigkeit im Körper zur Seite (Schlupf v·ω je Sekunde).
    // Der Flugrechner führt die Bahn mit der Nase nach – mit eigener Reserve proportional zu Vorwärtstempo und
    // Drehrate (K.turnHold). Vorher mussten die Seitendüsen (S1 100 m/s²) gegen ≈ 550 m/s² Schlupf arbeiten, und jede
    // Dauerkurve halbierte das Tempo (340 → 171 m/s). Mit 0,85 hält KAMPF die volle Drehrate ohne Tempoverlust;
    // Boost und REISE driften in harten Kurven leicht nach außen (Masse spürbar). Landemodus ohne Bahnführung.
    let aLc = aL, aVc = aV;
    if (st.mode !== MODE.LANDUNG) {
      const vf = Math.abs(_vb[2]) * K.turnHold;
      aLc = aL + vf * Math.abs(w[1]); aVc = aV + vf * Math.abs(w[0]);
    }
    _ab[0] = clamp((tx * vl - _vb[0]) / h, -aLc, aLc);
    _ab[1] = clamp((vy - _vb[1]) / h, -aVc, aVc);
    _ab[2] = clamp((vz - _vb[2]) / h, -aF, aB);
  } else {
    _ab[0] = tx * aL; _ab[1] = ty * aV; _ab[2] = tz >= 0 ? -tz * aF : -tz * aB;
  }
  // 6. Umgebung: Schwerkraft (gekoppelt ausgeglichen, soweit die Reserve reicht), Luftwiderstand
  st.warn = '';
  if (env && env.gravity) {
    _g[0] = env.gravity[0]; _g[1] = env.gravity[1]; _g[2] = env.gravity[2];
    if ((st.coupled || brake) && !st.landed) {
      qInvRot(_gb, st.q, _g);
      const cx = clamp(_ab[0] - _gb[0], -aL, aL), cy = clamp(_ab[1] - _gb[1], -aV, aV), cz = clamp(_ab[2] - _gb[2], -aF, aB);
      if (Math.abs(_ab[1] - _gb[1]) > aV + 1e-6) st.warn = 'SCHUB REICHT NICHT';
      _ab[0] = cx; _ab[1] = cy; _ab[2] = cz;
    }
  } else { _g[0] = 0; _g[1] = 0; _g[2] = 0; }
  // Düsenauslastung (Grafik, Ton)
  st.thr[0] = _ab[0] > 0 ? Math.min(1, _ab[0] / aL) : 0; st.thr[1] = _ab[0] < 0 ? Math.min(1, -_ab[0] / aL) : 0;
  st.thr[2] = _ab[1] > 0 ? Math.min(1, _ab[1] / aV) : 0; st.thr[3] = _ab[1] < 0 ? Math.min(1, -_ab[1] / aV) : 0;
  st.thr[4] = _ab[2] < 0 ? -_ab[2] / aF : 0; st.thr[5] = _ab[2] > 0 ? _ab[2] / aB : 0;
  vCopy(st.accB, _ab);
  qRot(_aw, st.q, _ab);
  // Am Tempodeckel schiebt der Schub nicht weiter (auch entkoppelt): Anteil entlang der Bewegung entfällt
  {
    const sp0 = vLen(st.v), cap0 = st.boostOn ? Math.max(modeMax(st, P), P.vB) : st.mode === MODE.LANDUNG ? K.landV * 1.2 : modeMax(st, P);
    if (sp0 >= cap0 * 0.999) {
      const along = (_aw[0] * st.v[0] + _aw[1] * st.v[1] + _aw[2] * st.v[2]) / sp0;
      if (along > 0) { _aw[0] -= st.v[0] / sp0 * along; _aw[1] -= st.v[1] / sp0 * along; _aw[2] -= st.v[2] / sp0 * along; }
    }
  }
  _aw[0] += _g[0]; _aw[1] += _g[1]; _aw[2] += _g[2];
  if (env && env.rho > 0) {
    const sp = vLen(st.v), k = 0.5 * env.rho * (env.cdA || 0.02) * sp;
    _aw[0] -= k * st.v[0]; _aw[1] -= k * st.v[1]; _aw[2] -= k * st.v[2];
  }
  vCopy(st.accW, _aw);
  st.gLoad = vLen(_ab) / 9.81;
  // 8. Semi-implizites Euler
  const v = st.v;
  v[0] += _aw[0] * h; v[1] += _aw[1] * h; v[2] += _aw[2] * h;
  // 7. weicher Tempodeckel (auch entkoppelt), Stöße bleiben sichtbar
  const sp = vLen(v), cap = st.boostOn ? Math.max(top, P.vB) : (st.mode === MODE.LANDUNG ? Math.max(K.landV, K.landVz) * 1.2 : top);
  if (sp > cap) { const k = (sp - cap) * (1 - Math.exp(-K.capK * h)) / sp; v[0] -= v[0] * k; v[1] -= v[1] * k; v[2] -= v[2] * k; }
  if (st.landed) { v[0] = 0; v[1] = 0; v[2] = 0; }
  st.p[0] += v[0] * h; st.p[1] += v[1] * h; st.p[2] += v[2] * h;
  // Landelogik (Fahrwerk, Aufsetzen, Abheben)
  updateLanding(st, ctl, P, env, h);
}

const _up = new Float64Array(3), UPW = new Float64Array([0, 1, 0]);
/** Kurvenrollen aktiv? (zugeschaltet, kein Landemodus, Bug nicht steil, Rolllage nahe der Waagrechten, nicht direkt nach eigenem Rollen) */
function autoRollOn(st, pit, phi) {
  return st.autoRoll && !st.landing && Math.abs(pit) < K.horizonPitch && Math.abs(phi) <= K.autoRollMax + K.autoRollSlack && st.rollIdle > 0.3;
}
const _af = new Float64Array(3), _ar = new Float64Array(3);
/**
 * Achsen, um die die Maus die Zielrichtung dreht (Gieren um oben, Nicken um rechts): die Schiffsachsen – Maus rechts
 * ist reines Gieren im Schiff, auch mit rollender Kamera. Nur solange das Kurvenrollen die Rolllage führt, gilt der
 * entrollte Rahmen (Bug, waagrechte Rechte), damit die Kurve trotz Schräglage flach bleibt.
 */
export function aimAxes(st, outR, outU) {
  rightOf(outR, st.q); upOf(outU, st.q);
  const pit = pitchOf(st.q), phi = rollOf(st.q);
  if (!autoRollOn(st, pit, phi)) return false;
  fwdOf(_af, st.q); vCross(_ar, _af, UPW);
  const l = vLen(_ar);
  if (l < 0.2) return false;
  outR[0] = _ar[0] / l; outR[1] = _ar[1] / l; outR[2] = _ar[2] / l;
  vCross(outU, outR, _af);
  return true;
}
function negUp(g) { const l = Math.hypot(g[0], g[1], g[2]) || 1; _up[0] = -g[0] / l; _up[1] = -g[1] / l; _up[2] = -g[2] / l; return _up; }

/** Ein Sim-Schritt dt (1/60 s) in Teilschritten zu 1/120 s */
export function stepN(st, ctl, P, env, dt) {
  qCopy(st.pq, st.q);
  const n = Math.max(1, Math.round(dt / H)), h = dt / n;
  for (let i = 0; i < n; i++) step(st, ctl, P, env, h);
}

/** Zustand aus einer Entität im 2D-Zustand übernehmen (Taktik → 3D, Abdocken, Laden): Lage aus rot, kein Ruck */
export function enter(st, e) {
  vSet(st.p, e.x || 0, e.y || 0, e.z || 0);
  vSet(st.v, e.vx || 0, e.vy || 0, e.vz || 0);
  qFromYPR(st.q, e.rot || 0, 0, 0); qCopy(st.pq, st.q);
  st.w[0] = st.w[1] = st.w[2] = 0;
  st.landed = false; st.cruise = false; st.rollIdle = 9; st.steerIdle = 9;
  return st;
}
/** Bewegung anhalten (Andocken, Tod) */
export function halt(st) { st.v[0] = st.v[1] = st.v[2] = 0; st.w[0] = st.w[1] = st.w[2] = 0; st.boostOn = false; st.cruise = false; }

/** Abgeleitete Felder für alten Code und Grafik in die Entität schreiben */
export function derive(st, e) {
  e.x = st.p[0]; e.y = st.p[1]; e.z = st.p[2];
  e.vx = st.v[0]; e.vy = st.v[1]; e.vz = st.v[2];
  e.rot = yawOf(st.q, e.rot || 0);
  e.pitch3 = pitchOf(st.q);
  e.roll3 = rollOf(st.q);
  e.speed = vLen(st.v);
  return e;
}

// ───────── Rahmen und Ursprung (Vorbereitung Planetenlandung, FLUGMODELL.md 12) ─────────
const _o = new Float64Array(3), _qc = new Float64Array(4);
/** In einen anderen Rahmen umrechnen: pose = { p: Ursprung des neuen Rahmens im alten, q: Lage des neuen Rahmens, v: dessen Tempo } */
export function setFrame(st, frame, pose) {
  _o[0] = st.p[0] - pose.p[0]; _o[1] = st.p[1] - pose.p[1]; _o[2] = st.p[2] - pose.p[2];
  qInvRot(st.p, pose.q, _o);
  _o[0] = st.v[0] - (pose.v ? pose.v[0] : 0); _o[1] = st.v[1] - (pose.v ? pose.v[1] : 0); _o[2] = st.v[2] - (pose.v ? pose.v[2] : 0);
  qInvRot(st.v, pose.q, _o);
  qConj(_qc, pose.q); qMul(st.q, _qc, st.q); qNorm(st.q, st.q);
  st.frame = frame;
  return st;
}
/** Umkehrung von setFrame (zurück in den Elternrahmen) */
export function leaveFrame(st, frame, pose) {
  qRot(_o, pose.q, st.p); st.p[0] = _o[0] + pose.p[0]; st.p[1] = _o[1] + pose.p[1]; st.p[2] = _o[2] + pose.p[2];
  qRot(_o, pose.q, st.v); st.v[0] = _o[0] + (pose.v ? pose.v[0] : 0); st.v[1] = _o[1] + (pose.v ? pose.v[1] : 0); st.v[2] = _o[2] + (pose.v ? pose.v[2] : 0);
  qMul(st.q, pose.q, st.q); qNorm(st.q, st.q);
  st.frame = frame;
  return st;
}
/** Ursprung verschieben (Floating Origin): alle Orte um d versetzen */
export function shiftOrigin(st, dx, dy, dz) { st.p[0] -= dx; st.p[1] -= dy; st.p[2] -= dz; }
/**
 * Einzige Naht für kameranahes Zeichnen (Architekturplan 2.6): Weltort (double) relativ zum Kamera-Ursprung,
 * erst danach float32. Heute ist der Ursprung 0 (Sektoren ≤ 10 km), der Weltrenderer setzt ihn auf die Kamera.
 */
export function toRender(px, py, pz, origin, out) {
  out[0] = px - origin[0]; out[1] = py - origin[1]; out[2] = pz - origin[2];
  return out;
}
export { fwdOf, vAngle, vNorm, vDot, vCross };
