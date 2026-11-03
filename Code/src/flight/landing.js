// Landemodus (Planung/FLUGMODELL.md 12): Fahrwerk, Höhe über Grund, einrastendes Aufsetzen (kein steifes
// Feder-Dämpfer-Fahrwerk bei 60 Hz), Abheben, Autoland. Die Umgebung liefert env.ground(px, py, pz, out) →
// out.h (Abstand Schiffsmitte → Boden), out.nx/ny/nz (Bodennormale), out.pad (Landefeld-Id oder 0).
import { qRot } from './math3.js';
import { K } from './params.js';

const G = { h: Infinity, nx: 0, ny: 1, nz: 0, pad: 0 };
const _u = new Float64Array(3), UP = new Float64Array([0, 1, 0]);
export const LAND = { sinkOk: 3, sinkCrash: 12, tiltOk: 20 * Math.PI / 180, snap: 0.3 };

export function updateLanding(st, ctl, P, env, h) {
  // Fahrwerk fährt in 1,5 s aus bzw. ein
  const want = st.landing ? 1 : 0;
  if (st.gear !== want) st.gear = want > st.gear ? Math.min(1, st.gear + h / K.gearTime) : Math.max(0, st.gear - h / K.gearTime);
  if (!env || typeof env.ground !== 'function') { st.alt = Infinity; st.vs = st.v[1]; return; }
  G.h = Infinity; G.nx = 0; G.ny = 1; G.nz = 0; G.pad = 0;
  env.ground(st.p[0], st.p[1], st.p[2], G);
  const nx = G.nx, ny = G.ny, nz = G.nz;
  const vn = st.v[0] * nx + st.v[1] * ny + st.v[2] * nz; // Steigrate entlang der Normalen
  st.alt = G.h - P.gearH; st.vs = vn;
  if (st.landed) {
    // Abheben: Schub nach oben (oder vorwärts mit hochgenommener Nase)
    if (ctl[1] > 0.2 || ctl[2] > 0.3) {
      st.landed = false; st.liftT = 1.0;
      st.v[0] += nx * 2; st.v[1] += ny * 2; st.v[2] += nz * 2;
    }
    return;
  }
  if (st.liftT > 0) st.liftT -= h;
  if (G.h === Infinity) return;
  // Bodenberührung: einrasten, wenn Fahrwerk unten, langsam genug und gerade genug; sonst Schaden oder Bruch
  if (G.h <= P.gearH + LAND.snap && !(st.liftT > 0 && vn > -0.5)) {
    const sink = -vn;
    qRot(_u, st.q, UP);
    const tilt = Math.acos(Math.max(-1, Math.min(1, _u[0] * nx + _u[1] * ny + _u[2] * nz)));
    if (sink >= LAND.sinkCrash || (st.gear < 1 && sink > LAND.sinkOk)) { st.crash = true; st.landDmg = 1; }
    else if (st.gear >= 1 && tilt <= LAND.tiltOk) {
      if (sink > LAND.sinkOk) st.landDmg = Math.min(1, (sink - LAND.sinkOk) / (LAND.sinkCrash - LAND.sinkOk)) * 0.25;
      st.landed = true; st.touch = G.pad || 1;
      // Ort rastet auf Fahrwerkshöhe ein, Bewegung relativ zum Rahmen 0
      const d = P.gearH - G.h;
      st.p[0] += nx * d; st.p[1] += ny * d; st.p[2] += nz * d;
      st.v[0] = 0; st.v[1] = 0; st.v[2] = 0; st.w[0] = 0; st.w[1] = 0; st.w[2] = 0;
      return;
    }
    // zu schräg oder ohne Fahrwerk langsam aufgekommen: sanft vom Boden abstoßen
    const pen = P.gearH - G.h;
    if (pen > 0) { st.p[0] += nx * pen; st.p[1] += ny * pen; st.p[2] += nz * pen; }
    if (vn < 0) { st.v[0] -= nx * vn * 1.4; st.v[1] -= ny * vn * 1.4; st.v[2] -= nz * vn * 1.4; }
  }
}
