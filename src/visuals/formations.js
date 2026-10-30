// Vorschau der 16 Drohnen-Formationen: 10 Drohnen in 3D um das Schiff, schräg von oben wie im Spiel.
// Canvas 2D, läuft nur sichtbar, respektiert "Bewegung reduzieren".

const N = 10;
const TAU = Math.PI * 2;

// Positionen je Formation: (Index, Zeit) -> [x, y, z]; Bug zeigt nach -z
const F = [
  (i) => [(i % 2 ? 1 : -1) * (0.75 + (i >> 1) * 0.12), 0, 0.9 + (i >> 1) * 0.5], // Standard
  (i) => [(i - 4.5) * 0.46, 0, -1.9], // Wall
  (i) => { const k = Math.ceil(i / 2); const s = i % 2 ? 1 : -1; return [i ? s * k * 0.3 : 0, 0, -2.4 + k * 0.42]; }, // Spear
  (i, t) => { const a = (i / N) * TAU + t * 0.7; return [Math.cos(a) * 2, 0, Math.sin(a) * 2]; }, // Ring
  (i, t) => { // Gyro
    const g = i < 5 ? 1 : -1, a = ((i % 5) / 5) * TAU + t * 1.1 * g, tilt = 0.95 * g;
    const x = Math.cos(a) * 1.9, z0 = Math.sin(a) * 1.9;
    return [x, z0 * Math.sin(tilt), z0 * Math.cos(tilt)];
  },
  (i, t) => { // Dome
    const y = 1 - ((i + 0.5) / N) * 1.6, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + t * 0.5;
    return [Math.cos(a) * r * 1.9, y * 1.9, Math.sin(a) * r * 1.9];
  },
  (i, t) => { const u = i / (N - 1), a = u * TAU * 2 + t * 2; return [Math.cos(a) * 0.85, Math.sin(a) * 0.85, -2.6 + u * 4.6]; }, // Helix
  (i, t) => { const u = i / (N - 1); return [Math.sin(i * 2.4 + t * 2) * 0.3 * (1 - u), Math.cos(i * 1.7 + t * 2) * 0.2 * (1 - u), -1.9 - u * 0.15 + (i ? 0 : -0.3) + u * 0] ; }, // Comet (unten überschrieben)
  (i) => { const s = i < 5 ? -1 : 1, p = (i % 5) / 4; return [s * (1.55 - 1.15 * p * p), 0, 0.7 - 2.7 * p]; }, // Claw
  (i, t) => [Math.sin(t * 0.9 + i * 1.7) * 1.7, Math.sin(t * 1.3 + i * 2.3) * 0.7, Math.cos(t * 0.75 + i * 1.1) * 1.7], // Swarm
  (i, t) => { const a = (i / N) * TAU + t * 0.35, r = i % 2 ? 0.95 : 2.3; return [Math.cos(a) * r, 0, Math.sin(a) * r]; }, // Star
  (i) => { const s = i < 5 ? -1 : 1, k = i % 5; return [s * (0.55 + k * 0.42), 0, 0.15 + k * 0.38]; }, // Wing
  (i, t) => { const a = (i / N) * TAU, r = 1.15 + 0.75 * (0.5 + 0.5 * Math.sin(t * 3)); return [Math.cos(a) * r, 0, Math.sin(a) * r]; }, // Pulse
  (i, t) => { const u = i / N, a = u * TAU * 1.6 + t * 2.2, r = 0.7 + u * 1.8; return [Math.cos(a) * r, 0, Math.sin(a) * r]; }, // Vortex
  (i, t) => { const a = (i / N) * TAU + t * 0.9; return [Math.cos(a) * 1.15, 1.1, Math.sin(a) * 1.15]; }, // Halo
  (i, t) => { const a = (i / N) * TAU + t * 0.4; return [Math.cos(a) * 1.35, 0.55 + (i % 2 ? 0.55 : 0), Math.sin(a) * 1.35]; }, // Crown
];
// Comet: dichter Kopf vorn, Schweif nach hinten
F[7] = (i, t) => {
  const u = i / (N - 1);
  const w = Math.sin(t * 2.2 + i) * 0.12;
  return [Math.sin(i * 2.4) * 0.35 * (1 - u) + w * u, Math.cos(i * 1.9) * 0.2 * (1 - u), -1.6 + u * u * 3.6];
};

export function initFormations(root) {
  const canvas = root.querySelector('.fm-canvas');
  const ctx = canvas.getContext('2d');
  const chips = [...root.querySelectorAll('.fm-chip')];
  const nameEl = root.querySelector('.fm-name');
  const descEl = root.querySelector('.fm-desc');
  const idxEl = root.querySelector('.fm-idx');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let cur = 3, prev = 3, blend = 1, t = 0, auto = !reduce, visible = false, raf = 0, last = 0, hold = 0;
  const trails = Array.from({ length: N }, () => []);
  let W = 0, H = 0, dpr = 1;

  function setSize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    if (!raf) draw();
  }

  function select(i, user) {
    if (i === cur) return;
    prev = cur; cur = (i + F.length) % F.length; blend = reduce ? 1 : 0; hold = 0;
    if (user) auto = false;
    chips.forEach((c, k) => c.setAttribute('aria-pressed', k === cur ? 'true' : 'false'));
    const chip = chips[cur];
    nameEl.textContent = chip.childNodes[1].textContent;
    descEl.textContent = chip.title;
    idxEl.textContent = String(cur + 1).padStart(2, '0') + '/16';
    for (const tr of trails) tr.length = 0;
    if (!raf) draw();
  }
  chips.forEach((c, k) => {
    c.setAttribute('aria-pressed', k === cur ? 'true' : 'false');
    c.addEventListener('click', () => select(k, true));
  });
  root.querySelector('.fm-prev').addEventListener('click', () => select(cur - 1, true));
  root.querySelector('.fm-next').addEventListener('click', () => select(cur + 1, true));

  // Projektion: Kamera schräg von oben, dreht langsam
  function project(p, yaw) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    let x = p[0] * cy - p[2] * sy, z = p[0] * sy + p[2] * cy, y = p[1];
    const pitch = 0.95, cp = Math.cos(pitch), sp = Math.sin(pitch);
    const y2 = y * cp - z * sp, z2 = y * sp + z * cp;
    const D = 9, f = Math.min(W, H * 1.5) * 0.95;
    const s = f / (D + z2);
    return [W * 0.5 + x * s, H * 0.47 - y2 * s, z2, s];
  }

  function draw() {
    const yaw = reduce ? 0.5 : 0.5 + Math.sin(t * 0.12) * 0.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Bodenraster (Polarraster)
    ctx.lineWidth = 1;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      for (let a = 0; a <= 64; a++) {
        const q = project([Math.cos((a / 64) * TAU) * r, -0.02, Math.sin((a / 64) * TAU) * r], yaw);
        a ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]);
      }
      ctx.strokeStyle = `rgba(255,255,255,${r === 2 ? 0.12 : 0.06})`;
      ctx.stroke();
    }
    for (let a = 0; a < 8; a++) {
      const p1 = project([0, -0.02, 0], yaw), p2 = project([Math.cos((a / 8) * TAU) * 3.2, -0.02, Math.sin((a / 8) * TAU) * 3.2], yaw);
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.stroke();
    }

    // Drohnen
    const k = blend < 1 ? 1 - Math.pow(1 - blend, 3) : 1;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = F[prev](i, t), b = F[cur](i, t);
      const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      pts.push(project(p, yaw));
    }
    // Schiff (Pfeil) in der Mitte
    const nose = project([0, 0, -0.75], yaw), l = project([-0.42, 0, 0.45], yaw), r = project([0.42, 0, 0.45], yaw), tail = project([0, 0, 0.2], yaw);
    const shipZ = project([0, 0, 0], yaw)[2];
    const drawShip = () => {
      ctx.beginPath(); ctx.moveTo(nose[0], nose[1]); ctx.lineTo(r[0], r[1]); ctx.lineTo(tail[0], tail[1]); ctx.lineTo(l[0], l[1]); ctx.closePath();
      ctx.fillStyle = 'rgba(224,120,42,.22)'; ctx.fill();
      ctx.strokeStyle = '#e0782a'; ctx.lineWidth = 1.4; ctx.stroke();
    };
    // Spuren
    if (!reduce) {
      pts.forEach((q, i) => {
        const tr = trails[i];
        tr.push([q[0], q[1]]); if (tr.length > 14) tr.shift();
        if (tr.length > 1) {
          ctx.beginPath(); tr.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
        }
      });
    }
    // Lot zur Ebene (zeigt die Höhe)
    for (let i = 0; i < N; i++) {
      const a = F[prev](i, t), b = F[cur](i, t);
      const y = a[1] + (b[1] - a[1]) * k;
      if (Math.abs(y) > 0.08) {
        const p = [a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k];
        const g = project(p, yaw);
        ctx.beginPath(); ctx.moveTo(g[0], g[1]); ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.stroke(); ctx.setLineDash([]);
      }
    }
    const order = pts.map((q, i) => [q[2], i]).sort((a, b) => b[0] - a[0]);
    let shipDrawn = false;
    for (const [z, i] of order) {
      if (!shipDrawn && z < shipZ) { drawShip(); shipDrawn = true; }
      const [x, y, , s] = pts[i];
      const sz = Math.max(3, s * 0.13);
      const depth = Math.max(0.35, Math.min(1, 1.25 - z * 0.12));
      ctx.fillStyle = `rgba(255,255,255,${depth})`;
      const c = sz * 0.35;
      ctx.beginPath();
      ctx.moveTo(x - sz + c, y - sz); ctx.lineTo(x + sz, y - sz); ctx.lineTo(x + sz, y + sz - c); ctx.lineTo(x + sz - c, y + sz); ctx.lineTo(x - sz, y + sz); ctx.lineTo(x - sz, y - sz + c); ctx.closePath();
      ctx.fill();
    }
    if (!shipDrawn) drawShip();
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    t += dt;
    if (blend < 1) blend = Math.min(1, blend + dt / 0.9);
    if (auto) { hold += dt; if (hold > 4.6) select(cur + 1, false); }
    draw();
  }
  function run() { if (raf || reduce || !visible || document.hidden) return; last = 0; raf = requestAnimationFrame(loop); }
  function halt() { cancelAnimationFrame(raf); raf = 0; }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? run() : halt(); }, { rootMargin: '80px' }).observe(canvas);
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
  new ResizeObserver(setSize).observe(canvas);
  setSize();
}
