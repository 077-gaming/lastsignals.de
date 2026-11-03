#!/usr/bin/env node
// Flug-Prüfung im echten Spiel, unsichtbar (headless, Google Chrome über playwright-core), Planung/FLUGMODELL.md 13:
// Maus- und Controller-Flug geskriptet (Kurven, Rollen, Boost, entkoppelt, Seiten- und Vertikalschub), Kampf gegen die
// 3D-KI mit einem Bot nach Menschenmodell (Reaktion 180 ms, Zielfehler, begrenzte Mausgeschwindigkeit), dazu Zeigerfang
// (Attrappe per addInitScript mit movementX/Y), Esc öffnet mit einem Druck das Bordmenü, Alt gibt den Zeiger frei,
// Strg+Klick (Mac) feuert ohne Kontextmenü, Taktik-Wechsel und zurück, Heap-Wachstum.
// Kennzahlen: Bildrate, Fadenkreuz-Latenz, Reaktionszeit der Nase (63 % auf 20°), Trefferquote, Kampfdauer.
// Bilder in Verfolger- und Cockpitsicht.
//
//   node tools/playtest/flug.mjs --url http://127.0.0.1:5287 [--sekunden 45] [--fraktion saturn] [--bilder <ordner>] [--sichtbar]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const BASE = arg('url', process.env.LS_URL || 'http://localhost:5173');
const SECS = Math.max(15, Number(arg('sekunden', '45')) || 45);
const FAC = arg('fraktion', 'saturn');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const IMG = path.resolve(arg('bilder', path.join(HERE, 'berichte', 'flug-' + stamp)));
const HEADLESS = !args.includes('--sichtbar');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const metrics = {};
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${info ? ' · ' + info : ''}`); };

// Attrappen: Zeigerfang (headless nicht zuverlässig) und Controller (Standard-Mapping)
function init() {
  let el = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => el });
  Element.prototype.requestPointerLock = function () { el = this; window.__lockReq = (window.__lockReq || 0) + 1; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0); return Promise.resolve(); };
  document.exitPointerLock = function () { el = null; window.__lockExit = (window.__lockExit || 0) + 1; setTimeout(() => document.dispatchEvent(new Event('pointerlockchange')), 0); };
  window.__escLock = () => { el = null; document.dispatchEvent(new Event('pointerlockchange')); }; // Browser löst den Fang (Esc)
  window.__mv = (dx, dy) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  window.__gp = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], connected: false, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', effects: [] };
  const mk = () => { const g = window.__gp; return { id: g.id, index: 0, connected: g.connected, mapping: 'standard', timestamp: performance.now(), axes: g.axes.slice(), buttons: g.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })), vibrationActuator: { type: 'dual-rumble', playEffect: (t, p) => { g.effects.push({ t, ...p }); return Promise.resolve('complete'); } } }; };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__gp.connected ? mk() : null, null, null, null] });
  window.__gpConnect = () => { window.__gp.connected = true; const e = new Event('gamepadconnected'); e.gamepad = mk(); window.dispatchEvent(e); };
  window.__gpDisconnect = () => { window.__gp.connected = false; window.dispatchEvent(new Event('gamepaddisconnected')); };
  try { localStorage.setItem('ls.settings', JSON.stringify({ quality: 'medium', hudScale: 1, reducedMotion: false, rev: 2 })); } catch { /* egal */ }
}

// Kampf-Bot im Spiel (läuft je Bild im Browser): zielt auf die Vorhaltemarke wie ein Mensch, Maus oder rechter Stick
async function botFight(opts) {
  // opts.pack: frische Raider-Rudel (3 vor dem Bug, nach jedem Abschuss Ersatz), bis opts.minKills Abschüsse oder secs.
  // Gezählt werden nur diese Raider ab ihrem ersten Treffer – so misst der Median nicht angeschossene Reste früherer
  // Kämpfe (früher 1–2 s) und hat genug Werte (früher oft nur 2 Abschüsse, ein Rückzug zum Heilen kippte ihn).
  const { secs, device, pack = false, minKills = 0 } = opts;
  const L = window.__ls, w = L.world, p = w.player, fi = L.input.fi, cam = L.renderer.camera;
  const D = Math.PI / 180, BOLT = 2400;
  const hist = []; // Zielverlauf für die Reaktionszeit (180 ms)
  const stats = { frames: 0, worst: 0, shots0: w.stats3.bolts, hits0: w.stats3.boltHits, kills: 0, deaths0: w.profile.stats.deaths, ttk: [], first: new Map(), engaged: 0, onTarget: 0, floats: 0, onLab: 0, onCross: 0, onNum: 0, onGauge: 0 };
  const mine = new Set();
  const spawn = (i) => {
    const q = w.fl.q, f = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
    const e = w.spawnTemp('raider', p.x + f[0] * (900 + i * 80) + (i - 1) * 120, p.z + f[2] * (900 + i * 80), p.y + f[1] * 900 + (i - 1) * 60);
    e.expire = false; w.provoke(e); mine.add(e.id);
  };
  if (pack) {
    // alte Gegner weit weg, dann ein frisches Rudel
    for (const e of w.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z, (e.y || 0) - p.y) < 3000) { e.x += 6000 * Math.sign(e.x - p.x || 1); e.px = e.x; e.targetId = null; }
    p.targetId = null; for (let i = 0; i < 3; i++) spawn(i);
  }
  let respawn = 0;
  const offs = [
    L.bus.on('damage', (d) => { if (d.from === 'player' && d.id !== 'player' && !stats.first.has(d.id) && (!pack || mine.has(d.id))) stats.first.set(d.id, w.time); }),
    L.bus.on('explode', (e) => { if (e.kind === 'enemy') { stats.kills++; if (stats.first.has(e.id)) { stats.ttk.push(w.time - stats.first.get(e.id)); stats.first.delete(e.id); } if (pack && mine.has(e.id)) respawn++; } }),
  ];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const keys = new Set();
  const key = (code, down) => { if (down === keys.has(code)) return; if (down) keys.add(code); else keys.delete(code); window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })); };
  let firing = false;
  const fire = (on) => {
    if (on === firing) return; firing = on;
    if (device === 'pad') { window.__gp.buttons[7] = on ? 1 : 0; return; }
    const c = L.renderer.canvas;
    if (on) c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, pointerType: 'mouse' }));
    else window.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true, pointerType: 'mouse' }));
  };
  // Controller: Boost mit L3 (kurz drücken schaltet ein), wenn das Ziel weit weg ist (Flucht zum Heilen)
  let l3 = 0;
  const padBoost = () => {
    const t = p.targetId ? w.entities.get(p.targetId) : null;
    const far = t && Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) > 700;
    if (l3 > 0) { if (--l3 === 0) window.__gp.buttons[10] = 0; return; }
    if (far && !w.fl.boostOn && !w.fl.boostLock) { window.__gp.buttons[10] = 1; l3 = 3; }
  };
  const t0 = performance.now();
  let last = t0;
  await new Promise((res) => {
    const f = (now) => {
      const dt = now - last; last = now;
      stats.frames++; if (stats.frames > 5) stats.worst = Math.max(stats.worst, dt);
      // Lesbarkeit (Runde 2): schwebende Zahlen nie auf dem Zielschild und nie auf dem Fadenkreuz (alle 6 Bilder)
      if (stats.frames % 6 === 0 && window.__lsHud) {
        const mid = window.__lsHud.mid, lab = mid && mid.tgt.classList.contains('on') ? mid.lab.getBoundingClientRect() : null;
        const cx = innerWidth / 2, cy = innerHeight / 2, ax = window.__lsHud.flight.lastAimPx, Z = window.__lsHud.flight.zones;
        const seen = [];
        for (const el of document.querySelectorAll('.hf')) {
          if (+el.style.opacity < 0.3) continue;
          const b = el.getBoundingClientRect(); if (!b.width) continue;
          stats.floats++;
          if (lab && lab.width && b.right > lab.left && b.left < lab.right && b.bottom > lab.top && b.top < lab.bottom) stats.onLab++;
          const fx = ax && ax.on ? ax.x : cx, fy = ax && ax.on ? ax.y : cy;
          if (b.right > fx - 24 && b.left < fx + 24 && b.bottom > fy - 24 && b.top < fy + 24) stats.onCross++;
          // Runde 3: Zahl gegen Zahl und gegen Tempo-/Höhenanzeige (Tempozahl, M/S, Boost, EBENE)
          for (const o of seen) if (b.right > o.left + 1 && b.left < o.right - 1 && b.bottom > o.top + 1 && b.top < o.bottom - 1) stats.onNum++;
          seen.push(b);
          if (Z && Z.on) for (const z of Z.list) if (b.right > z.x0 && b.left < z.x1 && b.bottom > z.y0 && b.top < z.y1) stats.onGauge++;
        }
      }
      if (now - t0 > secs * 1000 || (minKills && stats.ttk.length >= minKills)) { res(); return; }
      if (respawn > 0 && stats.frames % 30 === 0) { respawn--; spawn(1); }
      if (w.playerDead) { w.repair('station'); setTimeout(() => { fi.requestLock(); }, 200); }
      // Ziel halten, bis es zerstört ist; sonst nächster Gegner
      let t = p.targetId ? w.entities.get(p.targetId) : null;
      if (!t || t.alive === false || t.kind !== 'enemy') {
        let bd = Infinity; t = null;
        for (const e of w.enemies) { if (!e.alive || (pack && !mine.has(e.id))) continue; const d = Math.hypot(e.x - p.x, e.y - p.y, e.z - p.z); if (d < bd) { bd = d; t = e; } }
        if (t) w.setTarget(t.id);
      }
      if (!t) { fire(false); requestAnimationFrame(f); return; }
      hist.push([now, t.x, t.y, t.z, t.vx || 0, t.vy || 0, t.vz || 0]);
      while (hist.length > 2 && now - hist[1][0] > 180) hist.shift();
      const h = hist[0];
      const rx = h[1] - p.x, ry = h[2] - p.y, rz = h[3] - p.z;
      const a = h[4] * h[4] + h[5] * h[5] + h[6] * h[6] - BOLT * BOLT, b = 2 * (rx * h[4] + ry * h[5] + rz * h[6]), c = rx * rx + ry * ry + rz * rz;
      const disc = b * b - 4 * a * c;
      const lt = disc > 0 ? (-b - Math.sqrt(disc)) / (2 * a) : 0;
      const tt = lt > 0 ? lt : (-b + Math.sqrt(Math.max(0, disc))) / (2 * a);
      let dx = rx + h[4] * Math.max(0, tt), dy = ry + h[5] * Math.max(0, tt), dz = rz + h[6] * Math.max(0, tt);
      const dist = Math.hypot(dx, dy, dz) || 1; dx /= dist; dy /= dist; dz /= dist;
      // Zielfehler des Menschen (≈ 0,6°)
      dx += (rnd() - 0.5) * 0.02; dy += (rnd() - 0.5) * 0.02;
      const am = fi.aim;
      // Winkelabstand im Kamerabild → Mausweg (begrenzt wie eine Hand) bzw. rechter Stick
      cam.updateMatrixWorld();
      const m = cam.matrixWorld.elements;
      const fx = -m[8], fy = -m[9], fz = -m[10];
      const proj = (x, y, z) => [Math.atan2(x * m[0] + y * m[1] + z * m[2], x * fx + y * fy + z * fz), Math.atan2(x * m[4] + y * m[5] + z * m[6], x * fx + y * fy + z * fz)];
      const [ta, tb] = proj(dx, dy, dz), [ca, cb] = proj(am[0], am[1], am[2]);
      const eh = ta - ca, ev = tb - cb, err = Math.hypot(eh, ev);
      if (device === 'pad') padBoost();
      if (device === 'pad' && fi.set.padMode === 'rate') {
        // Drehraten-Modus: ein Mensch führt das Ziel mit (Markenbewegung) und korrigiert den Rest – Sollrate aus der
        // Bildwinkel-Änderung der Marke plus 4/s × Fehler, über Totzone und Achsen-Kurve auf den Stick umgerechnet
        const pv = stats.pv || (stats.pv = { a: ta, b: tb, t: now });
        const dtp = Math.max(0.008, (now - pv.t) / 1000);
        const ra = (ta - pv.a) / dtp, rb = (tb - pv.b) / dtp; pv.a = ta; pv.b = tb; pv.t = now;
        const wr = w.flP.rate || 1;
        const vx = (ra * 0.8 + eh * 4) / wr, vy = (rb * 0.8 + ev * 4) / wr, M = Math.hypot(vx, vy);
        const raw = M < 0.004 ? 0 : Math.min(1, Math.pow(Math.min(1, M), 1 / 1.6) * 0.85 + 0.15); // Totzone 0,15, Kurve 1,6
        window.__gp.axes[2] = M ? vx / M * raw : 0;
        window.__gp.axes[3] = M ? -vy / M * raw : 0;
        window.__gp.axes[1] = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) > 480 ? -1 : -0.35;
      } else if (device === 'pad') {
        // Zielrichtung (Standard): Stick schiebt das Fadenkreuz; voller Ausschlag ab 4° Fehler (ein Mensch drückt
        // bei einem davonziehenden Ziel kräftig nach; mit 8° hinkte der Bot hinterher)
        const k = Math.min(1, err / (4 * D));
        window.__gp.axes[2] = err > 0.3 * D ? Math.max(-1, Math.min(1, eh / (err || 1) * Math.sqrt(k))) : 0;
        window.__gp.axes[3] = err > 0.3 * D ? Math.max(-1, Math.min(1, -ev / (err || 1) * Math.sqrt(k))) : 0;
        window.__gp.axes[1] = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) > 480 ? -1 : -0.35;
      } else {
        const sens = fi.set.sens * D, maxPx = 45;
        const px = Math.max(-maxPx, Math.min(maxPx, eh / sens * 0.6)), py = Math.max(-maxPx, Math.min(maxPx, -ev / sens * 0.6));
        if (Math.abs(px) + Math.abs(py) > 0.2) window.__mv(px, py);
        const d3 = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
        key('KeyW', d3 > 480); key('KeyS', d3 < 140);
        // flieht der Raider (Rückzug zum Heilen ab 25 % Hülle), setzt ein Mensch mit Boost nach
        key('ShiftLeft', d3 > 700 && !w.fl.boostLock);
      }
      const d3 = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
      if (d3 < 700) stats.engaged++;
      // Feuer, wenn die Waffen auf der Marke liegen (Waffenkreuz im Kardankegel und Fadenkreuz auf der Marke)
      const q = w.fl.q, nf = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
      const gimOk = Math.acos(Math.min(1, nf[0] * dx + nf[1] * dy + nf[2] * dz)) < w.flP.gimbal;
      // wie ein Mensch: feuern, sobald die Raute „heiß“ ist (Fadenkreuz auf der Marke oder im Waffenkegel der Zielhilfe)
      const cone = Math.max(1.2 * D, (w.aimInfo.coneRad || 0) * 0.6);
      const on = d3 < 640 && err < cone && gimOk && !w.inSafeZone;
      if (on) stats.onTarget++;
      fire(on);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  fire(false); for (const k of [...keys]) key(k, false);
  window.__gp.axes = [0, 0, 0, 0]; window.__gp.buttons[7] = 0; window.__gp.buttons[10] = 0;
  for (const o of offs) o();
  const shots = w.stats3.bolts - stats.shots0, hits = w.stats3.boltHits - stats.hits0;
  stats.ttk.sort((x, y) => x - y);
  const el = (performance.now() - t0) / 1000;
  return {
    secs: +el.toFixed(1), device, fps: +(stats.frames / el).toFixed(1), worstMs: Math.round(stats.worst), shots, hits, hitRate: shots ? +(hits / shots).toFixed(3) : 0,
    kills: stats.kills, deaths: w.profile.stats.deaths - stats.deaths0, ttkMedian: stats.ttk.length ? +stats.ttk[stats.ttk.length >> 1].toFixed(1) : null,
    ttkAll: stats.ttk.map((v) => +v.toFixed(1)), onTarget: +(stats.onTarget / Math.max(1, stats.engaged)).toFixed(2),
    zahlen: stats.floats, zahlenAufSchild: stats.onLab, zahlenAufFadenkreuz: stats.onCross, zahlenAufZahl: stats.onNum, zahlenAufAnzeige: stats.onGauge,
  };
}

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('Ausnahme: ' + String(e.stack || e).slice(0, 400)));
  let n = 0;
  const shot = async (name) => { n++; await page.screenshot({ path: path.join(IMG, `${String(n).padStart(2, '0')}-${name}.png`) }).catch(() => {}); };
  const W = (fn, a) => page.evaluate(fn, a);
  await page.goto(`${BASE}/?dev=game&f=${FAC}&flug=3d`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ls && window.__ls.world && window.__ls.world.player, null, { timeout: 60000 });
  await sleep(3500);
  await W(() => { const s = window.__ls.series; if (s && s.choose) s.choose('direct'); const st = document.createElement('style'); st.textContent = '.lsg, .hud-coach { display: none !important; }'; document.head.appendChild(st); });
  await sleep(600);
  check('Start im 3D-Flug (Verfolger)', await W(() => window.__ls.world.flight3d && window.__ls.renderer.viewMode === 'chase'));
  // aus der sicheren Zone heraus (Waffen frei), Gegner fern
  await W(() => { const w = window.__ls.world, p = w.player; p.x += 2400; p.z += 400; w.fl.p[0] = p.x; w.fl.p[2] = p.z; w._updateZones(); for (const e of w.enemies) if (Math.hypot(e.x - p.x, e.z - p.z) < 2000) { e.x += 3500; e.px = e.x; } });
  await page.mouse.click(720, 450);
  await sleep(300);
  check('Klick auf die Spielfläche fängt den Zeiger', await W(() => window.__ls.input.fi.locked === true));

  // ── Fadenkreuz-Latenz: Mausereignis → Zielrichtung im selben Takt (das HUD zeichnet sie im nächsten Bild) ──
  const lat = await W(() => new Promise((res) => {
    const fi = window.__ls.input.fi, a0 = [...fi.aim];
    window.__mv(30, 0);
    const now = [...fi.aim];
    const same = Math.hypot(now[0] - a0[0], now[1] - a0[1], now[2] - a0[2]) > 1e-4;
    requestAnimationFrame(() => { const hx = window.__lsHud?.flight?.lastAimPx; res({ same, hud: !!hx }); });
  }));
  check('Fadenkreuz folgt der Maus im selben Takt (≤ 1 Bild bis zum HUD)', lat.same && lat.hud, JSON.stringify(lat));
  metrics.fadenkreuzLatenzBilder = lat.same ? 1 : null;
  await sleep(800);

  // ── Reaktion der Nase: 20° Mausausschlag → 63 % (Kennzahl S1 ≤ 0,22 s, +10 %) ──
  const react = await W(() => new Promise((res) => {
    const L = window.__ls, w = L.world, fi = L.input.fi, D = Math.PI / 180;
    const yaw0 = Math.atan2(-(-(2 * (w.fl.q[0] * w.fl.q[2] + w.fl.q[3] * w.fl.q[1]))), -(-(1 - 2 * (w.fl.q[0] * w.fl.q[0] + w.fl.q[1] * w.fl.q[1]))));
    const yawOf = () => { const q = w.fl.q; return Math.atan2(2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] * q[0] + q[1] * q[1])); };
    const y0 = yawOf();
    window.__mv(-20 / fi.set.sens, 0); // 20° nach links
    const t0 = performance.now();
    const f = () => {
      let d = yawOf() - y0; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) >= 0.63 * 20 * D) { res({ t: (performance.now() - t0) / 1000, ship: w.player.ship }); return; }
      if (performance.now() - t0 > 3000) { res({ t: 9, ship: w.player.ship }); return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    void yaw0;
  }));
  metrics.reaktionNase63s = +react.t.toFixed(3);
  check('Reaktion: Nase erreicht 63 % eines 20°-Ausschlags (S1 ≤ 0,26 s inkl. Bildtakt)', react.t <= 0.26, `${react.t.toFixed(3)} s`);
  await sleep(500);

  // ── Kurven, Rollen, Boost, Seiten-/Vertikalschub, entkoppelt ──
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 90; i++) { await W((i) => window.__mv(Math.cos(i / 14) * 12, Math.sin(i / 14) * 8), i); await sleep(16); }
  const curve = await W(() => { const p = window.__ls.world.player; return { speed: Math.round(p.speed), pitch: +p.pitch3.toFixed(2), roll: +p.roll3.toFixed(2), y: Math.round(p.y) }; });
  check('Kurvenflug mit Schub: Höhe und Lage ändern sich', Math.abs(curve.y) > 5 || Math.abs(curve.pitch) > 0.05, JSON.stringify(curve));
  await page.keyboard.down('KeyQ'); await sleep(500);
  const roll = await W(() => window.__ls.world.player.roll3);
  await page.keyboard.up('KeyQ');
  check('Q rollt links', roll > 0.4, roll.toFixed(2));
  await page.keyboard.down('ShiftLeft'); await sleep(2500);
  const boost = await W(() => ({ on: window.__ls.world.fl.boostOn, v: window.__ls.world.player.speed, vK: window.__ls.world.flP.vK, b: window.__ls.world.fl.boost }));
  await page.keyboard.up('ShiftLeft');
  check('Umschalt: Boost über das Kampftempo, Vorrat sinkt', boost.on && boost.v > boost.vK * 1.05 && boost.b < 0.9, `${Math.round(boost.v)} / ${Math.round(boost.vK)} m/s, Vorrat ${boost.b.toFixed(2)}`);
  await sleep(2000);
  await page.keyboard.down('KeyD'); await page.keyboard.down('Space'); await sleep(700);
  const side = await W(() => { const w = window.__ls.world, q = w.fl.q, v = w.fl.v; const r = [1 - 2 * (q[1] * q[1] + q[2] * q[2]), 2 * (q[0] * q[1] + q[3] * q[2]), 2 * (q[0] * q[2] - q[3] * q[1])]; const u = [2 * (q[0] * q[1] - q[3] * q[2]), 1 - 2 * (q[0] * q[0] + q[2] * q[2]), 2 * (q[1] * q[2] + q[3] * q[0])]; return { right: v[0] * r[0] + v[1] * r[1] + v[2] * r[2], up: v[0] * u[0] + v[1] * u[1] + v[2] * u[2] }; });
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
  check('D und Leertaste: seitlich und hoch schieben', side.right > 20 && side.up > 20, `rechts ${Math.round(side.right)}, hoch ${Math.round(side.up)} m/s`);
  // nach dem Boost auf Kampftempo zurück (weicher Deckel), dann entkoppeln
  for (let i = 0; i < 40 && (await W(() => window.__ls.world.player.speed > window.__ls.world.flP.vK + 2)); i++) await sleep(100);
  const ex0 = await W(() => window.__lockExit || 0);
  await page.keyboard.down('AltLeft'); await page.keyboard.press('KeyC'); await page.keyboard.up('AltLeft');
  await sleep(150);
  check('Alt+C (Mac: Option+C) behält den Zeigerfang (kein Lösen, kein neuer Fang)', await W((e0) => window.__ls.input.fi.locked === true && (window.__lockExit || 0) === e0, ex0));
  const dec = await W(() => window.__ls.world.fl.coupled);
  await page.keyboard.up('KeyW');
  const v0 = await W(() => window.__ls.world.player.speed); await sleep(1500); const v1 = await W(() => window.__ls.world.player.speed);
  check('Alt+C entkoppelt: ohne Schub bleibt das Tempo (Newton)', dec === false && Math.abs(v1 - v0) < v0 * 0.03 + 1, `${Math.round(v0)} → ${Math.round(v1)} m/s`);
  await page.keyboard.down('AltLeft'); await page.keyboard.press('KeyC'); await page.keyboard.up('AltLeft');
  await sleep(1500);
  check('Alt+C koppelt wieder: Flugrechner bremst', (await W(() => window.__ls.world.fl.coupled)) && (await W(() => window.__ls.world.player.speed)) < v1 * 0.8);
  // Alt allein: Zeiger frei, während gehalten
  await page.keyboard.down('AltLeft'); await sleep(450);
  const free = await W(() => window.__ls.input.fi.locked);
  await page.keyboard.up('AltLeft'); await sleep(200);
  check('Alt halten: Zeiger frei für die Fenster (B-07)', free === false && (await W(() => window.__ls.input.fi.locked)) === true);
  // Windows: Strg (runter) mit W/A/S/D – Browser-Kürzel Strg+D/S/A werden im Flug abgefangen
  const ctl = await W(() => ['KeyD', 'KeyS', 'KeyA'].map((code) => { const e = new KeyboardEvent('keydown', { code, ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(e); window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); return e.defaultPrevented; }));
  check('Windows: Strg+D/S/A im Flug abgefangen (kein Lesezeichen, Speichern, Markieren)', ctl.every(Boolean), JSON.stringify(ctl));
  // K: Feuerleitrechner (MacBook ohne Strg rechts)
  const kAuto = await W(() => { const w = window.__ls.world, p = w.player, t = w.enemies.find((e) => e.alive); if (t) w.setTarget(t.id); const a0 = !!p.attacking; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyK', bubbles: true })); const a1 = !!p.attacking; if (a1 !== a0) w.toggleAttack(); return a1 !== a0; });
  check('K schaltet den Feuerleitrechner (Mac ohne Strg rechts)', kAuto);
  // Strg+Klick (Mac: Rechtsklick mit ctrlKey) feuert, ohne Kontextmenü
  await W(() => { window.__b0 = window.__ls.world.stats3.bolts; window.__cm = 0; window.addEventListener('contextmenu', (e) => { if (!e.defaultPrevented) window.__cm++; }, { once: false }); });
  await page.keyboard.down('ControlLeft');
  await W(() => { const c = window.__ls.renderer.canvas; c.dispatchEvent(new PointerEvent('pointerdown', { button: 2, ctrlKey: true, bubbles: true, pointerType: 'mouse' })); c.dispatchEvent(new MouseEvent('contextmenu', { button: 2, ctrlKey: true, bubbles: true, cancelable: true })); });
  await sleep(700);
  await W(() => window.dispatchEvent(new PointerEvent('pointerup', { button: 2, ctrlKey: true, bubbles: true, pointerType: 'mouse' })));
  await page.keyboard.up('ControlLeft');
  check('Mac: Strg+Klick feuert (Strg = runter), kein Kontextmenü', await W(() => window.__ls.world.stats3.bolts > window.__b0 && window.__cm === 0), String(await W(() => window.__ls.world.stats3.bolts - window.__b0)));
  // Esc: Browser löst den Fang → Bordmenü mit einem Druck; „Weiter“ fängt neu
  await W(() => window.__escLock());
  await sleep(250);
  check('Esc (Fang gelöst) öffnet mit einem Druck das Bordmenü (B-06)', await W(() => window.__ls.hud._menuOpen === true));
  await W(() => { const b = document.querySelector('[data-r="menu"] [data-act="resume"], [data-r="menu"] [data-act="close"]'); if (b) b.click(); else window.__ls.hud.toggleMenu(false); });
  await sleep(300);
  if (!(await W(() => window.__ls.input.fi.locked))) await page.mouse.click(720, 450);
  await sleep(200);
  check('Nach dem Bordmenü: Zeiger wieder gefangen', await W(() => window.__ls.input.fi.locked === true && window.__ls.hud._menuOpen === false));
  await shot('verfolger-flug');

  // ── Flache Kurve: 5 s Maus rechts (20 px je Bild) = reines Gieren, Bug bleibt in der Ebene, volle Umkehr ──
  // Ausgangslage waagrecht und auf der Ebene (vorher wurde gerollt; ohne Horizont-Hilfe bleibt die Rolllage stehen)
  const level = () => W(() => { const L = window.__ls, w = L.world, st = w.fl, p = w.player, y = p.rot || 0; st.q[0] = 0; st.q[1] = Math.sin(y / 2); st.q[2] = 0; st.q[3] = Math.cos(y / 2); st.w.fill(0); st.v.fill(0); p.y = 0; st.p[1] = 0; L.input.fi.resetAim(); });
  await level(); await sleep(300);
  const flat = await W(() => new Promise((res) => {
    const L = window.__ls, w = L.world, q = w.fl.q;
    const yawOf = () => Math.atan2(2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
    const pitchOf = () => Math.asin(Math.max(-1, Math.min(1, -(2 * (q[1] * q[2] - q[3] * q[0])))));
    let last = yawOf(), sum = 0, minP = 0, maxP = 0; const t0 = performance.now(), y0 = w.player.y;
    const f = () => {
      window.__mv(20, 0);
      const y = yawOf(); let d = y - last; d = Math.atan2(Math.sin(d), Math.cos(d)); sum += d; last = y;
      const pp = pitchOf(); minP = Math.min(minP, pp); maxP = Math.max(maxP, pp);
      if (performance.now() - t0 > 5000) { res({ yawDeg: Math.round(Math.abs(sum) * 57.3), minP: +(minP * 57.3).toFixed(1), maxP: +(maxP * 57.3).toFixed(1), dy: Math.round(w.player.y - y0) }); return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  metrics.flacheKurve = flat;
  check('Maus waagrecht 5 s: reines Gieren (Bug ±3°, mehr als eine Umdrehung)', flat.minP > -3 && flat.maxP < 3 && flat.yawDeg > 360, JSON.stringify(flat));
  // ── Runde 3: schneller 60°-Ausschlag (Lenkkegel 30°) dreht den Bug 60° – der Überlauf verfällt nicht mehr ──
  await level(); await sleep(400);
  const flick = await W(() => new Promise((res) => {
    const L = window.__ls, w = L.world, q = w.fl.q, fi = L.input.fi;
    const yawOf = () => Math.atan2(2 * (q[0] * q[2] + q[3] * q[1]), 1 - 2 * (q[0] * q[0] + q[1] * q[1]));
    const y0 = yawOf(), px = 60 / fi.set.sens;
    for (let i = 0; i < 4; i++) window.__mv(px / 4, 0); // ein Bild, vier Ereignisse
    setTimeout(() => { let d = yawOf() - y0; d = Math.atan2(Math.sin(d), Math.cos(d)); res({ deg: Math.round(Math.abs(d) * 57.3), cone: fi.set.cone, rest: +(fi.over * 57.3).toFixed(1) }); }, 1800);
  }));
  metrics.ausschlag60 = flick;
  check('Maus: schneller 60°-Ausschlag dreht den Bug ≥ 50° (Überlauf über den Lenkkegel, Runde 3; vorher 30°)', flick.deg >= 50 && flick.deg <= 64, JSON.stringify(flick));
  // ── Rollen mit Q: ohne Horizont-Hilfe (Standard) bleibt die Lage stehen ──
  await page.keyboard.down('KeyQ'); await sleep(700); await page.keyboard.up('KeyQ'); await sleep(400);
  const r1 = await W(() => window.__ls.world.player.roll3); await sleep(2500);
  const r2 = await W(() => window.__ls.world.player.roll3);
  check('Nach Q-Rollen dreht das Schiff nicht von selbst zurück (Horizont-Hilfe Standard aus)', Math.abs(r2 - r1) < 0.05, `${(r1 * 57.3).toFixed(0)}° → ${(r2 * 57.3).toFixed(0)}°`);
  await page.keyboard.down('KeyE'); await sleep(700); await page.keyboard.up('KeyE'); await sleep(600);
  // ── Tempomat und Begrenzer: Mausrad senkt das gehaltene Tempo ──
  await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.press('KeyC'); await page.keyboard.up('KeyW'); await sleep(300);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 100); await sleep(30); }
  await sleep(2500);
  const cr = await W(() => { const w = window.__ls.world; return { cruise: w.fl.cruise, lim: w.fl.limiter, sp: Math.round(w.player.speed) }; });
  check('Tempomat an, Mausrad 10× runter: Tempo folgt dem Begrenzer', cr.cruise && cr.sp <= cr.lim + 3, JSON.stringify(cr));
  await page.keyboard.press('KeyC'); for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, -100); await sleep(20); }
  // ── Sektorrand (Runde 2): Warnung vorher, jenseits schiebt das Navigationsfeld zurück, kein Schaden ──
  await level(); await sleep(400);
  const edge = await W(async () => {
    const w = window.__ls.world, p = w.player, size = w.sector.size;
    const put = (x) => { p.x = x; w.fl.p[0] = x; };
    const x0 = p.x; p.hp = p.hpMax;
    put(size * 0.9); await new Promise((r) => setTimeout(r, 300));
    const warn = w.edge.warn;
    // 80 m jenseits der Grenze, mit 300 m/s weiter nach außen
    put(size + 80); w.fl.v[0] = 300; await new Promise((r) => setTimeout(r, 400));
    const out = w.edge.out, vOut = Math.round(w.fl.v[0]);
    await new Promise((r) => setTimeout(r, 5000));
    const hp = p.hp, maxOut = Math.round(p.x - size);
    const back = p.x < size + 600 && w.fl.v[0] < 0;
    put(x0); w.fl.v[0] = 0; await new Promise((r) => setTimeout(r, 300));
    p.hp = p.hpMax;
    return { warn, out, vOut, keinSchaden: hp >= p.hpMax - 1, jenseits: maxOut, zurueck: back, frei: !w.edge.out };
  });
  check('Sektorrand: Warnung ab 83 %, Navigationsfeld bremst und schiebt zurück, kein Schaden', edge.warn && edge.out && edge.vOut < 300 && edge.keinSchaden && edge.zurueck && edge.frei, JSON.stringify(edge));
  // Höhenband im Heimatsektor (vorher ±1.200 m: mit Boost nach 2 s an der Decke): 3.000 m über der Ebene ist frei
  const band = await W(async () => {
    const w = window.__ls.world, p = w.player, y0 = p.y;
    p.y = 3000; w.fl.p[1] = 3000; await new Promise((r) => setTimeout(r, 300));
    const r = { sektor: w.sector.index, y: Math.round(p.y), out: w.edge.out };
    p.y = y0; w.fl.p[1] = y0; await new Promise((r2) => setTimeout(r2, 200));
    return r;
  });
  check('Höhenband: 3.000 m über der Ebene liegt im Sektor', band.out === false, JSON.stringify(band));
  // ── Autopilot H: lange Strecke in REISE ──
  const ap = await W(async () => {
    const w = window.__ls.world, L = window.__ls, p = w.player, s = w.station;
    const x0 = p.x, z0 = p.z;
    // REISE ist im Kampf gesperrt (Absicht): Gegner in der Nähe vorher weg, sonst hängt die Prüfung davon ab, ob gerade
    // ein Rudel am Weg liegt (Runde 2: flackerte mit inCombat: true)
    const calm = () => { for (const e of w.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z, (e.y || 0) - p.y) < 3000) { e.x += 5000 * Math.sign(e.x - p.x || 1); e.px = e.x; e.targetId = null; e.state = 'idle'; } w.bolts.on.fill(0); w._lastCombat = -99; };
    p.x = s.x + 4200; p.z = s.z + 600; w.fl.p[0] = p.x; w.fl.p[2] = p.z; calm();
    L.input.home();
    // Wende zur Station (bis 2 s) und Hochlaufen der REISE (1,5 s): bis 8 s warten
    for (let i = 0; i < 80 && !(w.fl.mode === 1 && w.player.speed > 400); i++) { if (i < 30) calm(); await new Promise((r) => setTimeout(r, 100)); }
    const r = { reise: w.fl.mode === 1, homing: !!w.homing, sp: Math.round(w.player.speed), inCombat: !!w.inCombat };
    w.stopMove(); p.x = x0; p.z = z0; w.fl.p[0] = x0; w.fl.p[2] = z0; return r;
  });
  check('Autopilot H fliegt lange Strecken in REISE', ap.reise && ap.sp > 400, JSON.stringify(ap));
  await sleep(1500);

  // ── Heap: 20 s ruhiger Flug, Wachstum < 2 MB (B-11) ──
  // Runde 3: gemessen über CDP nach vollständiger Speicherbereinigung (HeapProfiler.collectGarbage, zweimal) und nach 5 s
  // Vorlauf mit demselben Flug – performance.memory ist gerundet und window.gc() räumt unter Last nicht immer alles
  // (ein Gutachter-Lauf neben anderen Prüfungen ergab 2,97 MB, allein 0,6–0,8 MB)
  const cdp = await page.context().newCDPSession(page);
  const heapNow = async () => { for (let k = 0; k < 2; k++) { await cdp.send('HeapProfiler.collectGarbage'); await sleep(150); } return (await cdp.send('Runtime.getHeapUsage')).usedSize; };
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 5; i++) { await W((i) => window.__mv(Math.sin(i) * 20, Math.cos(i) * 10), i); await sleep(1000); }
  await page.keyboard.up('KeyW');
  const heap0 = await heapNow();
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 20; i++) { await W((i) => window.__mv(Math.sin(i) * 20, Math.cos(i) * 10), i); await sleep(1000); }
  await page.keyboard.up('KeyW');
  const heap1 = await heapNow();
  metrics.heapWachstumMB = heap0 ? +((heap1 - heap0) / 1048576).toFixed(2) : null;
  check('Heap-Wachstum über 20 s Flug < 2 MB', !heap0 || heap1 - heap0 < 2 * 1048576, `${metrics.heapWachstumMB} MB`);

  // ── Kampf gegen die 3D-KI mit der Maus ──
  await W(() => {
    const w = window.__ls.world, p = w.player;
    w._invulnUntil = 0; p.hp = p.hpMax; p.shield = p.shieldMax;
  });
  // Raider-Rudel vor den Bug (wie im Heimatsektor), bis 5 Abschüsse oder 2 × SECS
  // Runde 3: 7 statt 5 Abschüsse – der Median aus 5 Werten schwankte je Lauf um ±1,5 s (unter Last über der Grenze)
  const mouse = await W(botFight, { secs: SECS * 3, device: 'mouse', pack: true, minKills: 7 });
  metrics.maus = mouse;
  console.log('     Maus:', JSON.stringify(mouse));
  await shot('verfolger-kampf');
  check(`Kampf (Maus, bis 5 Abschüsse): Abschüsse gegen die 3D-KI`, mouse.kills >= 1, `${mouse.kills} Abschüsse, Median ${mouse.ttkMedian} s`);
  check('Kennzahl: Raider-Abschuss mit Startausrüstung (nur Laser, Maus) im Median ≤ 8 s (FLUGMODELL.md 3)', mouse.ttkMedian != null && mouse.ttkMedian <= 8, `${mouse.ttkMedian} s · ${JSON.stringify(mouse.ttkAll)}`);
  check('Lesbarkeit: schwebende Zahlen nie auf Zielschild oder Fadenkreuz (Runde 2)', mouse.zahlen > 0 && mouse.zahlenAufSchild === 0 && mouse.zahlenAufFadenkreuz === 0, `${mouse.zahlen} Zahlen-Stichproben, ${mouse.zahlenAufSchild} auf dem Schild, ${mouse.zahlenAufFadenkreuz} auf dem Fadenkreuz`);
  check('Lesbarkeit: Zahlen nie auf einer anderen Zahl, nie auf Tempo- oder Höhenanzeige (Runde 3)', mouse.zahlen > 0 && mouse.zahlenAufZahl === 0 && mouse.zahlenAufAnzeige === 0, `${mouse.zahlen} Stichproben, ${mouse.zahlenAufZahl} Paare überdeckt, ${mouse.zahlenAufAnzeige} auf der Anzeige`);
  // Bolzen melden beim Abfeuern kein Ergebnis: kein DANEBEN-Stapel über dem Ziel
  check('Keine DANEBEN-Zahlen je Bolzen im 3D-Flug', await W(() => [...document.querySelectorAll('.hf.hf-miss')].filter((e) => +getComputedStyle(e).opacity > 0).length === 0));
  // Zielfenster und Zielklammer nennen dieselbe (räumliche) Entfernung
  const dd = await W(() => { const L = window.__ls, w = L.world, p = w.player, t = w.entities.get(p.targetId); if (!t) return null; const d = Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z); const n = (s) => Number(String(s || '').replace(/[^0-9]/g, '')); return { d: Math.round(d), fenster: n(document.querySelector('[data-r="tdist"]')?.textContent), klammer: n(document.querySelector('.hc-dist')?.textContent) }; });
  check('Zielfenster und Zielklammer: gleiche Entfernung in 3D (±25 m)', !dd || (Math.abs(dd.fenster - dd.d) <= 25 && (!dd.klammer || Math.abs(dd.klammer - dd.d) <= 25)), JSON.stringify(dd));
  check('Kampf (Maus): Trefferquote ≥ 50 %', mouse.hitRate >= 0.5, (mouse.hitRate * 100).toFixed(0) + ' %');
  check('Kampf (Maus): Bildrate ≥ 30 (headless, nur Richtwert)', mouse.fps >= 30, `${mouse.fps} Bilder/s, schlechtestes ${mouse.worstMs} ms`);
  // Cockpit
  await page.keyboard.press('KeyV'); await sleep(1300);
  check('V: Cockpit', await W(() => window.__ls.renderer.viewMode === 'cockpit'));
  await W(() => {
    const w = window.__ls.world, p = w.player, q = w.fl.q, f = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
    const e = w.spawnTemp('raider', p.x + f[0] * 500, p.z + f[2] * 500, p.y + f[1] * 500); w.provoke(e); w.setTarget(e.id);
  });
  await sleep(1500);
  await shot('cockpit-kampf');
  const ck = await W(botFight, { secs: 10, device: 'mouse' });
  metrics.cockpit = ck;
  check('Cockpit: Kampf läuft (Treffer)', ck.hits > 0, `${ck.hits}/${ck.shots}`);
  await page.keyboard.press('KeyV'); await sleep(1500);
  check('V: Taktik (Klickflug)', await W(() => window.__ls.renderer.viewMode === 'tactical' && window.__ls.world.flight3d === false));
  await W(() => { const w = window.__ls.world, p = w.player; w.moveTo(p.x + 500, p.z); });
  await sleep(1500);
  check('Taktik: Klickflug fährt das Ziel an', await W(() => { const p = window.__ls.world.player; return p.hasMove || p.fs > 30; }));
  await shot('taktik');
  await page.keyboard.press('KeyV'); await sleep(1500);
  check('V: zurück in den Verfolger (3D)', await W(() => window.__ls.renderer.viewMode === 'chase' && window.__ls.world.flight3d === true));

  // ── Kampf mit dem Controller ──
  await W(() => { window.__gpConnect(); window.__gp.buttons[0] = 1; });
  await sleep(120); await W(() => { window.__gp.buttons[0] = 0; }); await sleep(200);
  await W(() => {
    const w = window.__ls.world, p = w.player; p.hp = p.hpMax; p.shield = p.shieldMax;
  });
  const pad = await W(botFight, { secs: SECS * 3, device: 'pad', pack: true, minKills: 7 });
  metrics.controller = pad;
  console.log('     Controller:', JSON.stringify(pad));
  await shot('controller-kampf');
  check('Kampf (Controller): Treffer gegen die 3D-KI', pad.hits > 0 && pad.hitRate >= 0.35, `${(pad.hitRate * 100).toFixed(0)} % · ${pad.kills} Abschüsse`);
  check('Kennzahl: Raider-Abschuss mit dem Controller (Zielhilfe STANDARD) im Median ≤ 8 s', pad.ttkMedian != null && pad.ttkMedian <= 8, `${pad.ttkMedian} s · ${JSON.stringify(pad.ttkAll)}`);
  metrics.controllerZuMaus = mouse.hitRate ? +(pad.hitRate / mouse.hitRate).toFixed(2) : null;
  check('Controller-Trefferquote ≥ 70 % der Maus-Quote (Ziel 85 %)', mouse.hitRate === 0 || pad.hitRate >= mouse.hitRate * 0.7, `${metrics.controllerZuMaus}`);
  await W(() => window.__gpDisconnect());

  // ── Sprungtor im natürlichen Anflug (Runde 2): Kampftempo, F bei 120 m, W losgelassen → Sprung gelingt ──
  await sleep(500);
  const jp = await W(async () => {
    const L = window.__ls, w = L.world, p = w.player, fi = L.input.fi, o = w.portals[0], from = w.sector.id;
    for (const e of w.enemies) if (e.alive && Math.hypot(e.x - p.x, e.z - p.z) < 3000) { e.x += 6000 * Math.sign(e.x - p.x || 1); e.px = e.x; e.targetId = null; }
    w._lastCombat = -99; p.hp = p.hpMax; p.shield = p.shieldMax; w._invulnUntil = 0;
    p.x = o.x + 700; p.z = o.z + 20; p.y = o.y || 0; w.fl.p[0] = p.x; w.fl.p[1] = p.y; w.fl.p[2] = p.z; w.fl.v.fill(0);
    const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
    let sp = 0, maxD = 0, pressed = false;
    key('KeyW', true);
    const t0 = performance.now();
    while (performance.now() - t0 < 16000 && w.sector.id === from) {
      const dx = o.x - p.x, dz = o.z - p.z, dd = Math.hypot(dx, dz) || 1;
      fi.aim[0] = dx / dd; fi.aim[1] = 0; fi.aim[2] = dz / dd; fi.moved = 5;
      if (!pressed && dd <= 120) { sp = Math.round(p.speed); key('KeyF', true); key('KeyF', false); key('KeyW', false); pressed = true; }
      if (pressed) maxD = Math.max(maxD, dd);
      await new Promise((r) => setTimeout(r, 16));
    }
    key('KeyW', false);
    return { tempoBeiF: sp, weitesterAbstand: Math.round(maxD), von: from, nach: w.sector.id };
  });
  check('Sprungtor aus voller Fahrt: F bei 120 m, W los → Sprung gelingt (Sprungfeld hält)', jp.tempoBeiF > 250 && jp.nach !== jp.von && jp.weitesterAbstand < 300, JSON.stringify(jp));

  check('Keine Konsolenfehler', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  await fs.writeFile(path.join(IMG, 'bericht.json'), JSON.stringify({ zeit: new Date().toISOString(), url: BASE, kennzahlen: metrics, ergebnisse: results, fehler: errors }, null, 2));
  console.log('\nKennzahlen:', JSON.stringify(metrics, null, 1));
  console.log(`\n${results.length - bad.length}/${results.length} Prüfungen bestanden · Bilder und Bericht: ${IMG}`);
  process.exit(bad.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
