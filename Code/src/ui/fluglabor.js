// Fluglabor (nur Entwicklung, ?dev=fluglabor; Planung/FLUGMODELL.md 14): Heimatsektor ohne Gegner, Reglerpanel (F4)
// für Lenkkegel, Empfindlichkeit, Kamera, Kp, Drehraten, Drehbeschleunigung, Schub, Boost, Hilfen, Kopplung,
// Controller-Modus und Zielhilfe. Übungsdrohnen (stehend, geradeaus, kurvend, ausweichend) per Knopf.
// Voreinstellung in localStorage 'ls.flight.lab'. Wird nur per dynamischem Import im Entwicklungsserver geladen.
import { LAB_DEFAULT } from '../flight/params.js';
import { flightSettings, setFlightSetting, FLIGHT_DEFAULT } from '../input/flightsettings.js';
import { FACTIONS } from '../core/data.js';

const LAB_KEY = 'ls.flight.lab';
const SET_KEYS = ['cone', 'sens', 'cam', 'camRoll', 'fov', 'autoRoll', 'horizon', 'padMode', 'assist', 'invertY'];

// Regler: [Schlüssel, Beschriftung, min, max, Schritt, Quelle 'set' (ls.flight) | 'lab' (Faktor Klassenwert)]
const SLIDERS = [
  ['cone', 'LENKKEGEL °', 15, 70, 1, 'set'],
  ['sens', 'EMPFINDLICHKEIT °/PX', 0.02, 0.2, 0.005, 'set'],
  ['fov', 'SICHTFELD °', 55, 90, 1, 'set'],
  ['camRoll', 'KAMERA ROLLT MIT', 0, 1, 0.05, 'set'],
  ['assist', 'ZIELHILFE CONTROLLER', 0, 3, 1, 'set'],
  ['kp', 'KP (NASENREGLER) ×', 0.4, 2, 0.05, 'lab'],
  ['rate', 'DREHRATEN ×', 0.5, 1.8, 0.05, 'lab'],
  ['acc', 'DREHBESCHLEUNIGUNG ×', 0.4, 2, 0.05, 'lab'],
  ['thrust', 'SCHUB ×', 0.5, 2, 0.05, 'lab'],
  ['boostV', 'BOOST-TEMPO ×', 0.7, 1.5, 0.05, 'lab'],
  ['boostT', 'BOOST-DAUER ×', 0.5, 2, 0.05, 'lab'],
];
const TOGGLES = [
  ['cam', 'KAMERA', { mix: 'MISCHUNG 35 %', aim: 'FOLGT ZIELRICHTUNG' }],
  ['autoRoll', 'KURVENROLLEN', { true: 'AN', false: 'AUS' }],
  ['horizon', 'HORIZONT-HILFE', { true: 'AN', false: 'AUS' }],
  ['padMode', 'CONTROLLER', { aim: 'ZIELRICHTUNG IM KEGEL', rate: 'DREHRATEN' }],
  ['invertY', 'MAUS Y', { false: 'NORMAL', true: 'UMGEKEHRT' }],
];
const DRONES = [['still', 'STEHEND'], ['line', 'GERADEAUS'], ['curve', 'KURVEND'], ['jink', 'AUSWEICHEND']];

const CSS = `
.fl-lab { position: fixed; z-index: 60; top: 64px; left: 50%; transform: translateX(-50%); width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 96px); overflow: auto; padding: 14px 16px 16px; box-sizing: border-box;
  background: var(--ls-panel-solid); border: 1px solid var(--ls-line-2); color: var(--ls-tx); font: 12px var(--ls-mono);
  clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px); }
.fl-lab[hidden] { display: none; }
.fl-lab h2 { margin: 0 0 2px; font: 600 20px var(--ls-display); letter-spacing: .12em; color: var(--fx); }
.fl-lab .fl-sub { color: var(--ls-tx-3); margin-bottom: 10px; letter-spacing: .06em; }
.fl-lab h3 { margin: 14px 0 6px; font: 600 13px var(--ls-display); letter-spacing: .14em; color: var(--ls-tx-2); border-bottom: 1px solid var(--ls-line); padding-bottom: 3px; }
.fl-row { display: grid; grid-template-columns: 180px 1fr 56px; gap: 10px; align-items: center; margin: 4px 0; }
.fl-row input[type=range] { width: 100%; accent-color: var(--fx); }
.fl-row output { text-align: right; font-variant-numeric: tabular-nums; }
.fl-btns { display: flex; flex-wrap: wrap; gap: 6px; }
.fl-lab button { font: 600 12px var(--ls-mono); letter-spacing: .06em; color: var(--ls-tx); background: rgba(255,255,255,.04);
  border: 1px solid var(--ls-line-2); border-radius: 0; padding: 6px 10px; cursor: pointer;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); }
.fl-lab button:hover, .fl-lab button:focus-visible { border-color: var(--fx); color: var(--fx); outline: none; }
.fl-tog { display: grid; grid-template-columns: 180px 1fr; gap: 10px; align-items: center; margin: 4px 0; }
.fl-tog button { text-align: left; }
.fl-read { color: var(--ls-tx-2); font-variant-numeric: tabular-nums; white-space: pre; margin-top: 8px; }
@media (max-width: 560px) { .fl-row { grid-template-columns: 1fr 1fr 48px; } .fl-tog { grid-template-columns: 1fr 1fr; } }
`;

function readPreset() { try { const v = JSON.parse(localStorage.getItem(LAB_KEY) || 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; } }

/** Labor einrichten: { world, renderer, input, bus, root } */
export function installLab({ world: w, renderer, input, bus, root }) {
  w.flLab = { ...LAB_DEFAULT };
  const pre = readPreset();
  if (pre && pre.lab) for (const k in LAB_DEFAULT) if (typeof pre.lab[k] === 'number') w.flLab[k] = pre.lab[k];

  // Heimatsektor, keine Gegner (auch keine Wiederkehr, keine Ereignis-Gegner)
  const home = `${(FACTIONS[w.profile.faction] || FACTIONS.saturn).prefix}-1`;
  if (w.sector && w.sector.id !== home && !w.coop) w._changeSector(home, null);
  const clear = () => {
    for (const e of w.enemies) {
      if (e.drill || !e.alive) { if (!e.drill) e.respawnAt = Infinity; continue; }
      e.alive = false; e.respawnAt = Infinity; w.entities.delete(e.id); w.bus.emit('despawn', { id: e.id });
    }
  };
  clear();
  const clearT = setInterval(clear, 1000);
  const offSector = bus.on('sector', clear);

  // Panel
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const el = document.createElement('section');
  el.className = 'fl-lab'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Fluglabor');
  el.innerHTML = `<h2>FLUGLABOR</h2><div class="fl-sub">F4 SCHLIESSEN · WERTE WIRKEN SOFORT · NUR ENTWICKLUNG</div>
    <h3>STEUERUNG UND SCHIFF</h3><div data-r="sl"></div><div data-r="tg"></div>
    <div class="fl-tog"><span>KOPPLUNG</span><button data-act="couple"></button></div>
    <h3>ÜBUNGSDROHNEN</h3><div class="fl-btns">${DRONES.map(([k, n]) => `<button data-drone="${k}">${n}</button>`).join('')}<button data-act="clear">ALLE WEG</button></div>
    <h3>LANDEPROBE</h3><div class="fl-btns"><button data-act="ground">BODEN + SCHWERKRAFT</button></div>
    <h3>VOREINSTELLUNG</h3><div class="fl-btns"><button data-act="save">SPEICHERN</button><button data-act="load">LADEN</button><button data-act="reset">STANDARD</button></div>
    <div class="fl-read" data-r="read"></div>`;
  root.appendChild(el);
  const val = (key, src) => (src === 'lab' ? w.flLab[key] : flightSettings()[key]);
  const fmt = (v, step) => (step >= 1 ? String(Math.round(v)) : step >= 0.05 ? Number(v).toFixed(2) : Number(v).toFixed(3));
  const slBox = el.querySelector('[data-r="sl"]');
  for (const [key, name, min, max, step, src] of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'fl-row';
    row.innerHTML = `<span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.dataset.key = key; inp.dataset.src = src;
    inp.addEventListener('input', () => {
      const v = Number(inp.value);
      if (src === 'lab') w.flLab[key] = v; else setFlightSetting(key, key === 'assist' ? v | 0 : v);
      out.textContent = fmt(v, step);
    });
    slBox.appendChild(row);
  }
  const tgBox = el.querySelector('[data-r="tg"]');
  for (const [key, name, labels] of TOGGLES) {
    const row = document.createElement('div');
    row.className = 'fl-tog';
    row.innerHTML = `<span>${name}</span><button></button>`;
    const b = row.querySelector('button');
    b.dataset.tog = key;
    b.addEventListener('click', () => {
      const opts = Object.keys(labels), cur = String(flightSettings()[key]);
      const next = opts[(opts.indexOf(cur) + 1) % opts.length];
      setFlightSetting(key, next === 'true' ? true : next === 'false' ? false : next);
      sync();
    });
    tgBox.appendChild(row);
  }
  const sync = () => {
    for (const inp of el.querySelectorAll('input[type=range]')) {
      const step = Number(inp.step), v = val(inp.dataset.key, inp.dataset.src);
      inp.value = String(v); inp.nextElementSibling.textContent = fmt(v, step);
    }
    for (const [key, , labels] of TOGGLES) el.querySelector(`[data-tog="${key}"]`).textContent = labels[String(flightSettings()[key])] || String(flightSettings()[key]);
    el.querySelector('[data-act="couple"]').textContent = w.fl.coupled ? 'GEKOPPELT' : 'ENTKOPPELT';
  };
  const applyPreset = (p) => {
    w.flLab = { ...LAB_DEFAULT };
    if (p && p.lab) for (const k in LAB_DEFAULT) if (typeof p.lab[k] === 'number') w.flLab[k] = p.lab[k];
    if (p && p.set) for (const k of SET_KEYS) if (k in p.set) setFlightSetting(k, p.set[k]);
    sync();
  };
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const act = b.dataset.act, dr = b.dataset.drone;
    if (dr) spawnDrone(w, dr);
    else if (act === 'clear') clearDrones(w);
    else if (act === 'ground') { toggleGround(w, renderer, bus); b.textContent = w.env ? 'BODEN AUS' : 'BODEN + SCHWERKRAFT'; }
    else if (act === 'couple') { w.fl.coupled = !w.fl.coupled; sync(); }
    else if (act === 'save') {
      const s = flightSettings(), set = {};
      for (const k of SET_KEYS) set[k] = s[k];
      try { localStorage.setItem(LAB_KEY, JSON.stringify({ lab: w.flLab, set, t: Date.now() })); } catch { /* privater Modus */ }
      bus.emit('message', { kind: 'info', title: 'FLUGLABOR', text: 'Voreinstellung gespeichert.' });
    } else if (act === 'load') applyPreset(readPreset());
    else if (act === 'reset') { // Standardwerte (nur die Laborschlüssel, Rest von ls.flight bleibt)
      w.flLab = { ...LAB_DEFAULT };
      for (const k of SET_KEYS) setFlightSetting(k, FLIGHT_DEFAULT[k]);
      sync();
    }
  });

  // Live-Anzeige
  const read = el.querySelector('[data-r="read"]');
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (el.hidden) return;
    const P = w.flP, fl = w.fl, sp = Math.hypot(fl.v[0], fl.v[1], fl.v[2]), om = Math.hypot(fl.w[0], fl.w[1], fl.w[2]);
    read.textContent = `SCHIFF ${P.ship.toUpperCase()}  KP ${P.kp.toFixed(1)}/s  DREHRATE ${(P.rate * 57.3).toFixed(0)}°/s  ROLLEN ${(P.rollRate * 57.3).toFixed(0)}°/s\n`
      + `TEMPO ${sp.toFixed(0)} / ${P.vK.toFixed(0)} m/s  BOOST ${P.vB.toFixed(0)} m/s  VORRAT ${(fl.boost * 100).toFixed(0)} %  ω ${(om * 57.3).toFixed(0)}°/s`;
  };
  raf = requestAnimationFrame(tick);

  // F4: Panel auf/zu (Zeiger frei, solange es offen ist; Flug steht dann wie im Bordmenü)
  const prevMenu = input.menuOpen;
  input.menuOpen = () => !el.hidden || !!(prevMenu && prevMenu());
  const toggle = (on = el.hidden) => {
    el.hidden = !on;
    if (on) { sync(); if (input.fi) input.fi.exitLock(true); }
  };
  const onKey = (e) => {
    if (e.code !== 'F4' || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    toggle();
  };
  window.addEventListener('keydown', onKey, true);
  bus.emit('message', { kind: 'info', title: 'FLUGLABOR', text: 'F4 öffnet die Regler. Übungsdrohnen im Panel.' });

  const lab = {
    el, toggle, sync, spawn: (k) => spawnDrone(w, k), clearDrones: () => clearDrones(w),
    dispose() {
      cancelAnimationFrame(raf); clearInterval(clearT); offSector && offSector();
      window.removeEventListener('keydown', onKey, true);
      input.menuOpen = prevMenu; el.remove(); st.remove(); w.flLab = null;
    },
  };
  return lab;
}

// ───────────────────────── Übungsdrohnen ─────────────────────────

function clearDrones(w) {
  for (const e of w.enemies) if (e.drill && e.alive) { e.alive = false; w.entities.delete(e.id); w.bus.emit('despawn', { id: e.id }); }
}

/** Drohne 600 m vor dem Bug; Bahn je Art, schießt nicht, Treffer und Abschuss wie bei Gegnern */
function spawnDrone(w, kind) {
  const p = w.player, q = w.fl.q;
  const f = [-(2 * (q[0] * q[2] + q[3] * q[1])), -(2 * (q[1] * q[2] - q[3] * q[0])), -(1 - 2 * (q[0] * q[0] + q[1] * q[1]))];
  const cx = p.x + f[0] * 600, cy = (p.y || 0) + f[1] * 600, cz = p.z + f[2] * 600;
  const e = w.spawnTemp('raider', cx, cz, cy);
  e.name = 'ÜBUNGSDROHNE';
  e.expire = false;
  const a0 = Math.atan2(f[0], f[2]) + Math.PI / 2; // Querrichtung zum Bug: Geradeausflug kreuzt das Blickfeld
  e.drill = drill;
  e.drillK = kind; e.drT = 0; e.cx = cx; e.cy = cy; e.cz = cz; e.dirX = Math.sin(a0); e.dirZ = Math.cos(a0);
  e.vx = e.vy = e.vz = 0; e.jinkT = 0; e.jx = 0; e.jy = 0; e.jz = 0;
  e.state = 'wander'; e.attacking = false; e.targetId = null;
  return e;
}

function drill(w, e, dt) {
  e.drT += dt;
  const t = e.drT, x0 = e.x, y0 = e.y, z0 = e.z;
  switch (e.drillK) {
    case 'line': { // pendelt quer zum Spieler, bis 150 m/s
      const s = 1000 * Math.sin(t * 0.15);
      e.x = e.cx + e.dirX * s; e.z = e.cz + e.dirZ * s; e.y = e.cy;
      break;
    }
    case 'curve': { // Kreis r 380 m mit 160 m/s, Höhe schwingt ±120 m
      const a = t * 0.42;
      e.x = e.cx + Math.cos(a) * 380; e.z = e.cz + Math.sin(a) * 380; e.y = e.cy + Math.sin(t * 0.3) * 120;
      break;
    }
    case 'jink': { // Haken alle 1,0–1,6 s, quer bis 170 m/s, hält sich im 600-m-Raum
      e.jinkT -= dt;
      if (e.jinkT <= 0) {
        e.jinkT = 1 + Math.random() * 0.6;
        const a = Math.random() * Math.PI * 2;
        e.jx = Math.cos(a) * 170; e.jz = Math.sin(a) * 170; e.jy = (Math.random() * 2 - 1) * 90;
        const dx = e.x - e.cx, dy = e.y - e.cy, dz = e.z - e.cz, d = Math.hypot(dx, dy, dz);
        if (d > 450) { e.jx -= dx / d * 160; e.jy -= dy / d * 160; e.jz -= dz / d * 160; }
      }
      const k = 1 - Math.exp(-dt * 4);
      e.vx += (e.jx - e.vx) * k; e.vy += (e.jy - e.vy) * k; e.vz += (e.jz - e.vz) * k;
      e.x += e.vx * dt; e.y += e.vy * dt; e.z += e.vz * dt;
      break;
    }
    default: // still
      e.x = e.cx; e.y = e.cy; e.z = e.cz;
  }
  if (e.drillK !== 'jink' && dt > 0) { e.vx = (e.x - x0) / dt; e.vy = (e.y - y0) / dt; e.vz = (e.z - z0) / dt; }
  const h = Math.hypot(e.vx, e.vz), v = Math.hypot(h, e.vy);
  e.speed = v;
  if (v > 5) { e.rot = Math.atan2(-e.vx, -e.vz); e.pitch = Math.asin(Math.max(-1, Math.min(1, e.vy / v))); }
  e.attacking = false; e.state = 'wander';
}

// ───────────────────────── Landeprobe (Runde 3) ─────────────────────────
// Erprobt den Landemodus in der Welt (FLUGMODELL.md 12), bis der Meilenstein Planetenlandung echten Boden bringt:
// eine Bodenplatte 400 m unter dem Schiff (Gitter 4 × 4 km), Schwerkraft 9,81 m/s², ohne Luft. N fährt das Fahrwerk
// aus, Strg (bzw. die Taste „runter“) im Landemodus sinkt mit 2 m/s und setzt auf, Schub nach oben hebt ab.
let groundMesh = null;
function toggleGround(w, renderer, bus) {
  if (w.env) {
    w.env = null;
    if (groundMesh && groundMesh.parent) groundMesh.parent.remove(groundMesh);
    bus.emit('message', { kind: 'info', title: 'FLUGLABOR', text: 'Landeprobe aus: wieder Weltraum ohne Schwerkraft.' });
    return;
  }
  const gy = (w.player.y || 0) - 400;
  w.env = {
    gravity: [0, -9.81, 0], rho: 0,
    ground(px, py, pz, out) { out.h = py - gy; out.nx = 0; out.ny = 1; out.nz = 0; out.pad = 1; },
  };
  if (renderer && renderer.scene) {
    import('three').then((THREE) => {
      if (!w.env) return;
      if (!groundMesh) {
        const g = new THREE.GridHelper(4000, 80, 0xffb020, 0x5a6270);
        groundMesh = new THREE.Group(); groundMesh.add(g);
        const pad = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.35 }));
        pad.rotation.x = -Math.PI / 2; pad.position.y = 0.2; groundMesh.add(pad);
      }
      groundMesh.position.set(w.player.x, gy, w.player.z);
      renderer.scene.add(groundMesh);
    });
  }
  bus.emit('message', { kind: 'info', title: 'FLUGLABOR', text: 'Landeprobe: Boden 400 m unter dir, Schwerkraft 9,81. N fährt das Fahrwerk aus, runter halten setzt auf.' });
}
