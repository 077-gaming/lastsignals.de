// Selbsttest des Flugkerns (Teil von npm test, Planung/FLUGMODELL.md 13). Sollwerte werden aus der Wertetabelle
// (flight/params.js) berechnet, nicht von Hand eingetragen.
import { createState, makeCtl, stepN, step, enter, derive, applyEdges, setFrame, leaveFrame, shiftOrigin, toRender, C, BTN, EDGE, MODE, H } from './core.js';
import { shipParams, CLASS, K, BOLT_SPEED, ASSIST_MAX_RATE } from './params.js';
import { qFromYPR, qLen, rollOf, pitchOf, yawOf, fwdOf, vAngle, qRot, qCopy } from './math3.js';
import { leadPoint, segSphere, segCapsule, convergeDir, clampCone, assist, assistLevel } from './aim.js';
import { packQuat, unpackQuat, packFlight, unpackFlight, hermite } from './net.js';
import { SHIPS } from '../core/data.js';

const DT = 1 / 60, D = Math.PI / 180;
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
function hashState(st) {
  let h = 0x811c9dc5;
  for (const arr of [st.p, st.v, st.q, st.w]) for (let i = 0; i < arr.length; i++) { F64[0] = arr[i]; h = Math.imul(h ^ U32[0], 16777619) >>> 0; h = Math.imul(h ^ U32[1], 16777619) >>> 0; }
  return h;
}
const near = (a, b, tol) => Math.abs(a - b) <= Math.abs(b) * tol;

/** Mausziel auf Richtung (yaw, pitch) setzen */
function aimAt(ctl, yaw, pitch) {
  ctl[C.AIM] = 1; ctl[C.AX] = -Math.sin(yaw) * Math.cos(pitch); ctl[C.AY] = Math.sin(pitch); ctl[C.AZ] = -Math.cos(yaw) * Math.cos(pitch);
}

export function runFlightTests(check) {
  // ── Determinismus und Stabilität ──
  {
    const P = shipParams('s3', 290);
    const run = () => {
      const st = createState(), ctl = makeCtl(), R = lcg(42);
      for (let i = 0; i < 10000; i++) {
        if (i % 30 === 0) {
          ctl[C.TX] = R() * 2 - 1; ctl[C.TY] = R() * 2 - 1; ctl[C.TZ] = R() * 2 - 1;
          if (R() < 0.5) { aimAt(ctl, R() * 6.28, (R() - 0.5) * 2); } else { ctl[C.AIM] = 0; ctl[C.RP] = R() * 2 - 1; ctl[C.RY] = R() * 2 - 1; }
          ctl[C.ROLLMAN] = R() < 0.3 ? 1 : 0; ctl[C.RR] = R() * 2 - 1;
          ctl[C.BTN] = (R() < 0.3 ? BTN.BOOST : 0) | (R() < 0.1 ? BTN.BRAKE : 0);
          if (R() < 0.05) ctl[C.EDGE] = EDGE.COUPLE;
        }
        applyEdges(st, ctl, P, { inCombat: false });
        stepN(st, ctl, P, null, DT);
      }
      return hashState(st);
    };
    const a = run(), b = run();
    check('Flugkern: 10.000 Schritte mit gleicher Befehlsfolge bitgleich', a === b, a.toString(16));
  }
  {
    const P = shipParams('s1', 320);
    const st = createState(), ctl = makeCtl(), R = lcg(7);
    let bad = 0, maxQ = 0, maxOver = 0;
    for (let i = 0; i < 100000; i++) {
      if (i % 40 === 0) {
        ctl[C.TX] = R() * 2 - 1; ctl[C.TY] = R() * 2 - 1; ctl[C.TZ] = R() * 2 - 1;
        if (R() < 0.5) aimAt(ctl, R() * 6.28, (R() - 0.5) * 3); else { ctl[C.AIM] = 0; ctl[C.RP] = R() * 2 - 1; ctl[C.RY] = R() * 2 - 1; }
        ctl[C.ROLLMAN] = R() < 0.4 ? 1 : 0; ctl[C.RR] = R() * 2 - 1; ctl[C.BTN] = R() < 0.3 ? BTN.BOOST : 0;
        st.coupled = R() < 0.7;
      }
      step(st, ctl, P, null, H);
      if (!Number.isFinite(st.p[0] + st.v[1] + st.q[2] + st.w[0])) bad++;
      maxQ = Math.max(maxQ, Math.abs(qLen(st.q) - 1));
      const sp = Math.hypot(st.v[0], st.v[1], st.v[2]);
      maxOver = Math.max(maxOver, sp / P.vB);
    }
    check('Flugkern: 100.000 Teilschritte ohne NaN', bad === 0);
    check('Flugkern: Quaternion bleibt normiert (|q| − 1 < 1e-9)', maxQ < 1e-9, maxQ.toExponential(1));
    check('Flugkern: Tempo nie über Boost-Deckel + 5 %', maxOver <= 1.05, maxOver.toFixed(3));
  }

  // ── Kennzahlen je Klasse (Soll aus der Tabelle berechnet) ──
  const rows = [];
  for (const id of Object.keys(CLASS)) {
    const vK = SHIPS[id].speed, P = shipParams(id, vK), c = CLASS[id];
    // 0 → 95 % Kampftempo: gekoppelt, Vollschub, linear mit aFwd
    let st = createState(), ctl = makeCtl(); ctl[C.TZ] = 1;
    let t = 0; while (-st.v[2] < 0.95 * vK && t < 30) { stepN(st, ctl, P, null, DT); t += DT; }
    const t95 = t, t95Soll = 0.95 * vK / c.fwd;
    // Bremsweg gekoppelt aus vK ohne Raumbremse: v² / (2 · a_rück)
    ctl[C.TZ] = 0; st.v[0] = 0; st.v[1] = 0; st.v[2] = -vK; const z0 = st.p[2];
    t = 0; while (Math.hypot(st.v[0], st.v[1], st.v[2]) > 0.5 && t < 30) { stepN(st, ctl, P, null, DT); t += DT; }
    const brake = Math.abs(st.p[2] - z0), brakeSoll = vK * vK / (2 * c.back);
    // 180°-Wende im Stand (Gieren, Mausziel genau hinter dem Bug, etwas seitlich): bis < 2° Restfehler
    st = createState(); st.autoRoll = false; st.horizon = false; ctl = makeCtl(); aimAt(ctl, Math.PI - 0.001, 0);
    t = 0; while (t < 30) { stepN(st, ctl, P, null, DT); t += DT; if (Math.abs(Math.abs(yawOf(st.q)) - Math.PI) < 2 * D) break; }
    const turn = t, w = c.rate * D, a = c.acc * D, turnLo = Math.PI / w, turnHi = (Math.PI / w + w / a) * 1.3;
    // 63-%-Zeit auf 20° Zielfehler: Hochlauf mit α, dann Drehrate ω (Kp und Bremsgrenze greifen erst danach)
    st = createState(); st.autoRoll = false; ctl = makeCtl(); aimAt(ctl, 20 * D, 0);
    t = 0; while (t < 5) { stepN(st, ctl, P, null, DT); t += DT; if (yawOf(st.q) >= 0.63 * 20 * D) break; }
    const t63 = t, th = 0.63 * 20 * D, tr = w / a, thr = 0.5 * a * tr * tr;
    const t63Soll = thr >= th ? Math.sqrt(2 * th / a) : tr + (th - thr) / w;
    // Boost-Dauer
    st = createState(); ctl = makeCtl(); ctl[C.TZ] = 1; ctl[C.BTN] = BTN.BOOST;
    t = 0; while (st.boost > 0 && t < 60) { stepN(st, ctl, P, null, DT); t += DT; }
    const boostT = t, locked = st.boostLock;
    ctl[C.BTN] = 0; let tl = 0; while (st.boostLock && tl < 60) { stepN(st, ctl, P, null, DT); tl += DT; }
    const lockAt = st.boost;
    while (st.boost < 1 && tl < 80) { stepN(st, ctl, P, null, DT); tl += DT; }
    const regen = tl, regenSoll = K.boostWait + c.boostRegen;
    rows.push(`${id} 0→95 % ${t95.toFixed(2)}/${t95Soll.toFixed(2)} s · Bremsweg ${Math.round(brake)}/${Math.round(brakeSoll)} m · 180° ${turn.toFixed(2)} s · 63 % ${t63.toFixed(2)}/${t63Soll.toFixed(2)} s · Boost ${boostT.toFixed(1)}/${regen.toFixed(1)} s`);
    check(`Kennzahl ${id}: 0 → 95 % Kampftempo (Soll ${t95Soll.toFixed(2)} s)`, near(t95, t95Soll, 0.1), t95.toFixed(2));
    check(`Kennzahl ${id}: Bremsweg gekoppelt (Soll ${Math.round(brakeSoll)} m)`, near(brake, brakeSoll, 0.1), Math.round(brake) + ' m');
    check(`Kennzahl ${id}: 180°-Wende zwischen π/ω und 1,3·(π/ω + ω/α)`, turn >= turnLo * 0.98 && turn <= turnHi, `${turn.toFixed(2)} s in [${turnLo.toFixed(2)}, ${turnHi.toFixed(2)}]`);
    check(`Kennzahl ${id}: 63-%-Zeit auf 20° (Soll ${t63Soll.toFixed(2)} s, ±25 %)`, t63 >= t63Soll * 0.8 && t63 <= t63Soll * 1.25, t63.toFixed(2));
    check(`Kennzahl ${id}: Boost-Dauer ${c.boostT} s, Nachladen ${regenSoll} s`, near(boostT, c.boostT, 0.05) && near(regen, regenSoll, 0.06) && locked, `${boostT.toFixed(2)} / ${regen.toFixed(2)} s`);
    check(`Kennzahl ${id}: Boost nach Leerlauf gesperrt bis 25 %`, Math.abs(lockAt - K.boostLock) < 0.02, lockAt.toFixed(3));
  }
  // Grenzen aus der ersten-60-Sekunden-Tabelle (S1 ≤ 0,22 s, S4 ≤ 0,42 s, S8 ≤ 0,8 s für 63 % auf 20°)
  {
    const lim = { s1: 0.22, s4: 0.42, s8: 0.8 };
    for (const id in lim) {
      const P = shipParams(id, SHIPS[id].speed), st = createState(), ctl = makeCtl(); st.autoRoll = false; aimAt(ctl, 20 * D, 0);
      let t = 0; while (t < 5) { stepN(st, ctl, P, null, DT); t += DT; if (yawOf(st.q) >= 0.63 * 20 * D) break; }
      check(`Gefühl ${id}: Nase erreicht 63 % eines 20°-Fehlers in ≤ ${lim[id]} s (+10 %)`, t <= lim[id] * 1.1, t.toFixed(3) + ' s');
    }
  }
  // Kein Überschwingen bei großem Mausausschlag (Bremsgrenze)
  {
    const P = shipParams('s1', 320), st = createState(), ctl = makeCtl(); aimAt(ctl, 90 * D, 0);
    let over = 0; for (let i = 0; i < 300; i++) { stepN(st, ctl, P, null, DT); over = Math.max(over, yawOf(st.q) - 90 * D); }
    check('Nasenregler: 90°-Schwenk ohne Überschwingen über 2°', over < 2 * D, (over / D).toFixed(2) + '°');
  }
  // Generatoren zählen: höheres world._speed → höheres Kampftempo
  {
    const st = createState(), ctl = makeCtl(); ctl[C.TZ] = 1;
    const P = shipParams('s1', 320 + 40);
    for (let i = 0; i < 600; i++) stepN(st, ctl, P, null, DT);
    check('Kampftempo folgt world._speed (Tempo-Generatoren wirken)', Math.abs(-st.v[2] - 360) < 1, (-st.v[2]).toFixed(1));
  }

  // ── gekoppelt / entkoppelt ──
  {
    const P = shipParams('s2', 300);
    let st = createState(), ctl = makeCtl(); st.coupled = false; st.v[0] = 80; st.v[2] = -150;
    const v0 = Math.hypot(...st.v); for (let i = 0; i < 600; i++) stepN(st, ctl, P, null, DT);
    check('Entkoppelt: ohne Eingabe bleibt der Vektor (Drift < 0,1 % in 10 s)', Math.abs(Math.hypot(...st.v) - v0) / v0 < 0.001);
    st = createState(); st.v[0] = 120; ctl = makeCtl();
    const tSoll = 120 / P.aLat + 0.1; let t = 0;
    while (Math.abs(st.v[0]) > 1 && t < 10) { stepN(st, ctl, P, null, DT); t += DT; }
    check(`Gekoppelt: Seitendrift < 1 m/s in v/a_seite + 0,1 s (${tSoll.toFixed(2)} s)`, t <= tSoll + 1e-6, t.toFixed(2) + ' s');
    st = createState(); st.coupled = false; st.v[2] = -P.vK * 1.6; ctl = makeCtl();
    stepN(st, ctl, P, null, DT); const v1 = Math.hypot(...st.v);
    for (let i = 0; i < 180; i++) stepN(st, ctl, P, null, DT);
    check('Entkoppelt über dem Deckel: Tempo wird weich abgebaut', v1 > P.vK * 1.5 && Math.hypot(...st.v) < P.vK * 1.05, `${Math.round(v1)} → ${Math.round(Math.hypot(...st.v))}`);
    st = createState(); ctl = makeCtl(); st.v[2] = -300; ctl[C.BTN] = BTN.BRAKE;
    let tb = 0; while (Math.hypot(...st.v) > 1 && tb < 10) { stepN(st, ctl, P, null, DT); tb += DT; }
    check('Raumbremse: aus 300 m/s schneller als ohne (Schub × 1,3)', tb < 300 / P.aBack, tb.toFixed(2) + ' s');
  }
  // ── Betriebsarten ──
  {
    const P = shipParams('s1', 320), st = createState(), ctl = makeCtl();
    ctl[C.EDGE] = EDGE.MODE; let m = applyEdges(st, ctl, P, { inCombat: true });
    check('REISE im Kampf gesperrt', st.modeWant === MODE.KAMPF && /GESPERRT/.test(m), m);
    ctl[C.EDGE] = EDGE.MODE; applyEdges(st, ctl, P, { inCombat: false });
    let t = 0; while (st.mode !== MODE.REISE && t < 5) { stepN(st, ctl, P, null, DT); t += DT; }
    check('KAMPF → REISE dauert 1,5 s', Math.abs(t - K.toReise) < 0.05, t.toFixed(2));
    ctl[C.TZ] = 1; for (let i = 0; i < 1800; i++) stepN(st, ctl, P, null, DT);
    check('REISE fliegt schneller als KAMPF (2,8 × vK)', -st.v[2] > P.vK * 2.5, Math.round(-st.v[2]) + ' m/s');
    ctl[C.EDGE] = EDGE.MODE; applyEdges(st, ctl, P, {}); t = 0;
    while (st.mode !== MODE.KAMPF && t < 5) { stepN(st, ctl, P, null, DT); t += DT; }
    check('REISE → KAMPF dauert 0,8 s', Math.abs(t - K.toKampf) < 0.05, t.toFixed(2));
    ctl[C.LIM] = -5; applyEdges(st, ctl, P, {});
    check('Begrenzer: Mausrad senkt das Höchsttempo', st.limiter === P.vK - 50, String(st.limiter));
    st.v[0] = st.v[1] = st.v[2] = 0; ctl[C.TZ] = 1; for (let i = 0; i < 600; i++) stepN(st, ctl, P, null, DT);
    check('Begrenzer: Schub hält das begrenzte Tempo', Math.abs(-st.v[2] - (P.vK - 50)) < 1, (-st.v[2]).toFixed(1));
    ctl[C.EDGE] = EDGE.CRUISE; applyEdges(st, ctl, P, {}); ctl[C.TZ] = 0;
    for (let i = 0; i < 300; i++) stepN(st, ctl, P, null, DT);
    check('Tempomat hält das Tempo ohne Schubtaste', Math.abs(-st.v[2] - (P.vK - 50)) < 2, (-st.v[2]).toFixed(1));
  }
  // ── Horizont-Hilfe und Kurvenrollen ──
  {
    const P = shipParams('s1', 320);
    let st = createState(), ctl = makeCtl(); st.autoRoll = false; qFromYPR(st.q, 0, 0, 45 * D);
    let t = 0; while (Math.abs(rollOf(st.q)) > 2 * D && t < 5) { stepN(st, ctl, P, null, DT); t += DT; }
    check('Horizont-Hilfe: aus 45° Rolllage ohne Eingabe in ≤ 2 s auf < 2°', t <= 2, t.toFixed(2) + ' s');
    st = createState(); st.autoRoll = false; qFromYPR(st.q, 0, 70 * D, 30 * D); const r0 = rollOf(st.q);
    for (let i = 0; i < 60; i++) stepN(st, ctl, P, null, DT);
    check('Horizont-Hilfe: bei 70° Nicken keine Wirkung', Math.abs(rollOf(st.q) - r0) < 0.5 * D);
    st = createState(); ctl = makeCtl(); aimAt(ctl, 25 * D, 0); let mx = 0;
    for (let i = 0; i < 40; i++) { stepN(st, ctl, P, null, DT); mx = Math.max(mx, rollOf(st.q)); }
    check('Kurvenrollen: Linkskurve legt das Schiff nach links (bis 50°)', mx > 10 * D && mx <= 51 * D, (mx / D).toFixed(1) + '°');
    for (let i = 0; i < 240; i++) stepN(st, ctl, P, null, DT);
    check('Kurvenrollen: nach der Kurve wieder waagrecht', Math.abs(rollOf(st.q)) < 3 * D, (rollOf(st.q) / D).toFixed(1) + '°');
  }
  // ── Landung (Schwerkraft, Fahrwerk, Aufsetzen, Abheben, Autoland) ──
  {
    const P = shipParams('s1', 320), g = [0, -9.81, 0];
    const env = { gravity: g, rho: 0, ground: (x, y, z, o) => { o.h = y; o.nx = 0; o.ny = 1; o.nz = 0; o.pad = 1; } };
    let st = createState(), ctl = makeCtl(); st.p[1] = 200; ctl[C.EDGE] = EDGE.LAND; applyEdges(st, ctl, P, {});
    let t = 0; while (st.gear < 1 && t < 5) { stepN(st, ctl, P, env, DT); t += DT; }
    check('Fahrwerk fährt in 1,5 s aus', Math.abs(t - K.gearTime) < 0.05, t.toFixed(2));
    let lo = Infinity, hi = -Infinity; const y0 = st.p[1];
    for (let i = 0; i < 600; i++) { stepN(st, ctl, P, env, DT); lo = Math.min(lo, st.p[1]); hi = Math.max(hi, st.p[1]); }
    check('Schweben in 9,81 m/s² hält die Höhe ±0,5 m über 10 s', y0 - lo < 0.5 && hi - y0 < 0.5, `${(lo - y0).toFixed(2)} / ${(hi - y0).toFixed(2)}`);
    ctl[C.BTN] = BTN.AUTOLAND; t = 0;
    while (!st.landed && t < 200) { stepN(st, ctl, P, env, DT); t += DT; }
    check('Autoland sinkt mit 2 m/s und setzt auf', st.landed && !st.crash && st.landDmg === 0, `${t.toFixed(1)} s`);
    ctl[C.BTN] = 0; ctl[C.TY] = 1; stepN(st, ctl, P, env, DT); for (let i = 0; i < 60; i++) stepN(st, ctl, P, env, DT);
    check('Abheben mit Schub nach oben', !st.landed && st.p[1] > P.gearH + 5, st.p[1].toFixed(1));
    // hartes Aufsetzen
    st = createState(); ctl = makeCtl(); st.coupled = false; st.landing = true; st.gear = 1; st.p[1] = 20; st.v[1] = -8;
    for (let i = 0; i < 300 && !st.landed; i++) stepN(st, ctl, P, { ground: env.ground }, DT);
    check('Hartes Aufsetzen (8 m/s) gibt Schaden, kein Bruch', st.landed && st.landDmg > 0 && !st.crash, st.landDmg.toFixed(2));
    st = createState(); ctl = makeCtl(); st.coupled = false; st.landing = false; st.gear = 0; st.p[1] = 30; st.v[1] = -14;
    for (let i = 0; i < 120 && !st.crash; i++) stepN(st, ctl, P, { ground: env.ground }, DT);
    check('Aufprall ab 12 m/s ist ein Bruch', st.crash === true);
    st = createState(); ctl = makeCtl(); st.coupled = false; st.landing = true; st.gear = 1; st.p[1] = 10; qFromYPR(st.q, 0, 0, 40 * D); st.horizon = false; st.autoRoll = false; st.v[1] = -2;
    for (let i = 0; i < 80; i++) stepN(st, ctl, P, { ground: env.ground }, DT);
    check('Zu schräg (40°) setzt nicht auf', !st.landed);
  }
  // ── Rahmenwechsel und Ursprungsversatz ──
  {
    const st = createState(); st.p.set([1234.5, -88.25, 9876.125]); st.v.set([12, -3, 40]); qFromYPR(st.q, 0.7, -0.2, 0.3);
    const p0 = [...st.p], v0 = [...st.v], q0 = [...st.q];
    const pose = { p: [5e5, -2e4, 3e5], q: qFromYPR(new Float64Array(4), 1.1, 0.4, -0.7), v: [100, 0, -50] };
    setFrame(st, 7, pose); leaveFrame(st, 0, pose);
    const dp = Math.hypot(st.p[0] - p0[0], st.p[1] - p0[1], st.p[2] - p0[2]), dv = Math.hypot(st.v[0] - v0[0], st.v[1] - v0[1], st.v[2] - v0[2]);
    const dq = Math.abs(Math.abs(st.q[0] * q0[0] + st.q[1] * q0[1] + st.q[2] * q0[2] + st.q[3] * q0[3]) - 1);
    check('Rahmenwechsel hin und zurück < 1e-9 m', dp < 1e-9 && dv < 1e-9 && dq < 1e-12, dp.toExponential(1));
    // gleicher Flug 1.000 km vom Ursprung: gleiche Werte auf 1 mm
    const fly = (ox) => {
      const s = createState(), c = makeCtl(), P = shipParams('s4', 295), R = lcg(3);
      s.p[0] = ox; s.p[1] = ox * 0.3; s.p[2] = -ox;
      for (let i = 0; i < 3600; i++) { if (i % 60 === 0) { c[C.TZ] = R(); c[C.TX] = R() - 0.5; aimAt(c, R() * 6, R() - 0.5); } stepN(s, c, P, null, DT); }
      return [s.p[0] - ox, s.p[1] - ox * 0.3, s.p[2] + ox];
    };
    const A = fly(0), Bv = fly(1e6);
    const err = Math.hypot(A[0] - Bv[0], A[1] - Bv[1], A[2] - Bv[2]);
    check('Ursprungsversatz 1.000 km: gleiche Bahn auf 1 mm', err < 1e-3, (err * 1000).toFixed(3) + ' mm');
    const s2 = createState(); s2.p.set([1e6 + 5, 2, -3]); shiftOrigin(s2, 1e6, 0, 0);
    const o = new Float64Array(3); toRender(s2.p[0], s2.p[1], s2.p[2], [0, 0, 0], o);
    check('Ursprung verschieben und toRender-Naht', Math.abs(o[0] - 5) < 1e-9 && Math.abs(o[2] + 3) < 1e-9);
  }
  // ── Zielmathematik ──
  {
    const sp = [0, 0, 0], tp = [300, 80, -500], tv = [-120, 30, 60], out = new Float64Array(3);
    const t = leadPoint(sp, tp, tv, BOLT_SPEED, out);
    // Bolzen fliegt geradeaus zum Vorhaltepunkt; Abstand zum Ziel zur Ankunftszeit
    const d = Math.hypot(out[0], out[1], out[2]), tt = d / BOLT_SPEED;
    const miss = Math.hypot(tp[0] + tv[0] * tt - out[0], tp[1] + tv[1] * tt - out[1], tp[2] + tv[2] * tt - out[2]);
    check('Vorhalt: Bolzen trifft geradlinig fliegendes Ziel (< 0,5 m)', t > 0 && miss < 0.5, miss.toFixed(4) + ' m');
    check('Vorhalt: zu schnelles Ziel ohne Lösung', leadPoint(sp, [0, 0, -100], [0, 0, -3000], BOLT_SPEED, out) < 0);
    // Konvergenz: Mündung seitlich, Strahl trifft den Punkt auf dem Fadenkreuz in 500 m
    const dir = new Float64Array(3), aim = new Float64Array([0, 0, -1]);
    convergeDir(12, -2, -5, 0, 0, 0, aim, 500, aim, 10 * D, dir);
    const k = (-500 - -5) / dir[2], hx = 12 + dir[0] * k, hy = -2 + dir[1] * k;
    check('Konvergenz trifft den Fadenkreuzpunkt (< 0,1 m)', Math.hypot(hx, hy) < 0.1, Math.hypot(hx, hy).toFixed(4));
    const wide = new Float64Array([Math.sin(20 * D), 0, -Math.cos(20 * D)]);
    clampCone(wide, aim, 6 * D, dir);
    check('Kardan begrenzt auf den Kegel (S1 6°)', Math.abs(vAngle(dir, aim) - 6 * D) < 1e-9);
    // Streckentest gegen kleine schnelle Ziele (40 m je Schritt gegen r = 12)
    const hitT = segSphere(0, 0, 0, 0, 0, -40, 6, 0, -30, 6, 0, -22, 12 * 1.25);
    check('Bolzen-Strecke trifft Larve (r 12) trotz 40 m je Schritt', hitT >= 0, hitT.toFixed(2));
    check('Bolzen-Strecke verfehlt vorbeifliegendes Ziel', segSphere(0, 0, 0, 0, 0, -40, 60, 0, -20, 60, 0, -20, 15) < 0);
    check('Bolzen gegen Kapsel S8 (189 m) am Heck', segCapsule(80, 0, 10, 80, 0, -30, 0, 0, 0, 0, 0, 0, 1, 0, 0, 189 / 2 - 15, 15) >= 0);
    // Zielhilfe
    const a0 = assist(2, false, 0.5 * D, 0.4, 0, 0.01, 50 * D);
    check('Zielhilfe ohne Stickeingabe zieht nichts', a0.follow === 0 && a0.brake === 1);
    const a1 = assist(3, false, 0.2 * D, 5, 1, 0.01, 50 * D);
    check('Zielhilfe-Mitnahme höchstens 40 % der Klassen-Drehrate', a1.follow <= ASSIST_MAX_RATE * 50 * D + 1e-12 && a1.follow > 0, (a1.follow / D).toFixed(1) + '°/s');
    check('Zielhilfe im PvP höchstens NIEDRIG, ohne Mitnahme', assistLevel(3, true) === 1 && assist(3, true, 0.2 * D, 5, 1, 0.01, 1).follow === 0);
    check('Zielbremse nahe der Marke (STANDARD 55 %)', Math.abs(assist(2, false, 0.1 * D, 0, 1, 0.01, 1).brake - 0.55) < 1e-9);
  }
  // ── Netz ──
  {
    const q = qFromYPR(new Float64Array(4), 2.1, -0.6, 2.9), back = [0, 0, 0, 0];
    const pk = packQuat(q); unpackQuat(pk[0], pk[1], pk[2], pk[3], back);
    const dotq = Math.abs(q[0] * back[0] + q[1] * back[1] + q[2] * back[2] + q[3] * back[3]);
    const ang = 2 * Math.acos(Math.min(1, dotq));
    check('Netz: Lage (smallest-three) auf < 0,5° genau', ang < 0.5 * D, (ang / D).toFixed(4) + '°');
    const a = [10, 20, 0, 0, 300, 100, 100, 1, ''].concat(packFlight({ y: -432.37, q, vx: 120.2, vy: -33.3, vz: 4, ff: 5 }));
    const o = unpackFlight(a, {});
    check('Netz: Höhe < 0,5 m, Tempo, Flags, Version', o && Math.abs(o.y + 432.37) < 0.5 && Math.abs(o.vx - 120.2) < 0.1 && o.ff === 5 && o.fm === 3);
    check('Netz: altes Paket (9 Stellen) hat keine Flugfelder (y = 0 beim Empfänger)', unpackFlight([1, 2, 3, 4, 5, 6, 7, 8, ''], {}) === null);
    // Hermite stetig an den Stützstellen
    const h0 = hermite(0, 100, 50, 80, 0.11, 0), h1 = hermite(0, 100, 50, 80, 0.11, 1);
    const e = 1e-6, slope0 = (hermite(0, 100, 50, 80, 0.11, e) - h0) / (e * 0.11), slope1 = (h1 - hermite(0, 100, 50, 80, 0.11, 1 - e)) / (e * 0.11);
    check('Netz: Hermite trifft Ort und Tempo an beiden Stützstellen', Math.abs(h0) < 1e-12 && Math.abs(h1 - 50) < 1e-12 && Math.abs(slope0 - 100) < 0.01 && Math.abs(slope1 - 80) < 0.01);
  }
  // ── Übergang aus 2D ──
  {
    const st = createState(); enter(st, { x: 10, z: -20, rot: 1.2, vx: 30, vz: -40 });
    const e = derive(st, {});
    check('Übergang Taktik → 3D: Lage aus rot, Tempo bleibt (kein Ruck)', Math.abs(e.rot - 1.2) < 1e-12 && Math.abs(e.vx - 30) < 1e-12 && e.y === 0);
  }
  return rows;
}
