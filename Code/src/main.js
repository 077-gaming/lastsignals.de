// Zusammenbau: Laden → Anmeldung → (Fraktionswahl) → Hub → Startsequenz → Weltall → zurück zum Hub.
import { Bus } from './core/events.js';
import { store } from './core/store.js';
import { bootSequence, loginScreen, factionSelect, hubScreen, launchSequence } from './ui/screens.js';
import { World } from './sim/world.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { StationUI } from './ui/station.js';
import { HudTouch } from './ui/hud-touch.js';
import { Coop } from './net/coop.js';
import { Input } from './input.js';
import { AudioSystem, hubMusic, uiSound } from './audio/audio.js';
import { PerfHud } from './perf/perfhud.js';
import { autoQuality, isAutoQuality, storeAutoQuality, raiseCap, QualityGuard, Q_NAMES, Q_LABEL } from './perf/quality.js';
import { setSetting, settings, reduced } from './ui/screens-kit.js';
import './ui/theme.css';

const STEP = 1 / 60;          // feste Simulationsschrittweite
const MAX_FRAME = 0.25;       // nach Tab-Wechsel nicht endlos nachrechnen

const screensRoot = document.getElementById('screens');
const hudRoot = document.getElementById('hud');
let canvas = document.getElementById('game');

let renderer = null;
const perfHud = new PerfHud(null); // F3: Leistungsanzeige
// Absicherung im Flug: bei eigener Wahl des Spielers gilt eine Senkung nur bis zum Neuladen der Seite
let sessionCap = 3;
const applyQuality = (name) => setSetting('quality', name);
// Nur Entwicklungsserver: ?lag=ms bremst jedes Bild künstlich (schwache Rechner nachstellen, Absicherung prüfen)
const DEV_LAG = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('lag')) || 0 : 0;

function showError(err) {
  console.error(err);
  const el = document.createElement('div');
  el.className = 'boot-error';
  el.textContent = `Da ist etwas schiefgelaufen.\n\n${err && err.stack ? err.stack : err}`;
  document.body.appendChild(el);
}

function playSession(profile, opts = {}) {
  return new Promise((resolve) => {
    document.body.dataset.faction = profile.faction;
    const bus = new Bus();
    // Koop (Hub hat Raum gewählt): Gast spielt in den Sektoren des Gastgebers
    let coopCfg = null;
    try { coopCfg = JSON.parse(sessionStorage.getItem('ls.coop') || 'null'); } catch { coopCfg = null; }
    const world = new World(profile, bus, coopCfg && coopCfg.role === 'guest' ? { coopFaction: coopCfg.faction, coopSector: coopCfg.sector } : {});
    const coop = coopCfg ? new Coop(world, bus, coopCfg) : null;
    if (opts.dock && world.sector.station) {
      world.player.x = world.sector.station.x + 120;
      world.player.z = world.sector.station.z + 120;
    }

    // Pro Flug eine frische Grafik-Engine auf einer frischen Leinwand (sauber, kein alter Bus)
    if (renderer) { try { renderer.dispose(); } catch { /* egal */ } }
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    renderer = new Renderer(canvas, bus);
    // Grafikkarte zurückgesetzt (Treiber, App-Wechsel am Handy, zu wenig GPU-Speicher): kein schwarzes Bild ohne Hinweis.
    // Spielstand sichern und geordnet zur Station zurückkehren; beim nächsten Abflug entsteht eine frische Grafik-Engine.
    const onCtxLost = (e) => {
      e.preventDefault();
      try { world.saveNow(); } catch { /* egal */ }
      bus.emit('message', { kind: 'warn', title: 'GRAFIK', text: 'Grafikkarte wurde zurückgesetzt – Spielstand gesichert, Rückkehr zur Station.' });
      setTimeout(() => bus.emit('toHub'), 400);
    };
    canvas.addEventListener('webglcontextlost', onCtxLost, { once: true });
    if (sessionCap < 3) renderer.setQualityCap(sessionCap);
    renderer.setWorld(world);
    // Flug erst zeigen, wenn das eigene Schiffsmodell da ist (höchstens 5 s), sonst sähe man den Platzhalter-Wechsel
    canvas.style.opacity = '0';
    const showCanvas = () => { canvas.style.transition = 'opacity 180ms'; canvas.style.opacity = '1'; };
    Promise.race([renderer.ownModelReady || Promise.resolve(), new Promise((r) => setTimeout(r, 5000))])
      .then(() => setTimeout(showCanvas, 250));
    perfHud.setRenderer(renderer);
    if (import.meta.env.DEV) import('./perf/bench.js').then((m) => m.installBench(renderer, world)).catch(() => {});

    hudRoot.innerHTML = '';
    const hud = new Hud(hudRoot, bus, world);
    hud.setRenderer(renderer);
    const station = new StationUI(hudRoot, bus, world);
    const input = new Input(canvas, world, renderer, bus);
    const touch = new HudTouch(hudRoot); // iPad/Tablet: Knöpfe für Tastaturbefehle
    const audio = new AudioSystem(bus, world, renderer);
    audio.start();
    if (import.meta.env.DEV) window.__ls = { world, renderer, bus, hud }; // nur Entwicklung: Test-Pilot (tools/playtest)

    // Dauerhaft unter 50 Bilder/s: eine Stufe tiefer, mit kurzer Meldung. Automatische Wahl → gespeichert,
    // eigene Wahl → nur für diese Sitzung (die Einstellung im Hub bleibt, wie der Spieler sie gesetzt hat).
    const guard = new QualityGuard((from, to, fps) => {
      const auto = isAutoQuality();
      if (auto) storeAutoQuality(Q_NAMES[to], { lowered: Date.now(), fpsAtLower: Math.round(fps) }, applyQuality);
      sessionCap = to;
      renderer.setQualityCap(to);
      bus.emit('message', {
        kind: 'info', title: 'GRAFIK',
        text: auto
          ? `Bildrate dauerhaft unter 50 – Grafikqualität automatisch auf ${Q_LABEL[to]} gesenkt.`
          : `Bildrate dauerhaft unter 50 – Grafik für diese Sitzung auf ${Q_LABEL[to]} gesenkt. Deine Einstellung bleibt gespeichert.`,
      });
    }, (from, to) => {
      // Einmaliges Anheben (nur automatische Wahl): die Messung beim Start war zu vorsichtig
      if (!isAutoQuality()) return;
      storeAutoQuality(Q_NAMES[to], { raised: Date.now() }, applyQuality);
      renderer.setQualityCap(sessionCap);
      bus.emit('message', { kind: 'info', title: 'GRAFIK', text: `Grafikkarte hat Reserve – Grafikqualität automatisch auf ${Q_LABEL[to]} erhöht.` });
    }, sessionCap === 3 ? raiseCap() : -1);
    const onStore = (e) => {
      const k = e.detail && e.detail.kind;
      const text = k === 'quota' ? 'Spielstand konnte nicht gespeichert werden (Browser-Speicher voll oder gesperrt).'
        : k === 'restored' ? 'Spielstand war beschädigt – letzte Sicherung wurde geladen.'
          : k === 'corrupt' || k === 'readonly' ? 'Spielstand beschädigt – Speichern gesperrt, Rohdaten sind gesichert.' : '';
      if (text) bus.emit('message', { kind: 'warn', title: 'SPEICHER', text });
    };
    window.addEventListener('ls:store', onStore);
    const offSector = bus.on('sector', () => {
      guard.hold(6);
      renderer.setWorld(world);
      hud.setWorld(world);
      station.setWorld(world);
    });

    document.body.classList.add('in-game');
    renderer.resize();
    if (opts.dock) { world.update(STEP); world.dock(); }

    let last = performance.now();
    let acc = 0;
    let hitStop = 0;
    const offKill = bus.on('explode', (p) => {
      if (!p || p.kind !== 'enemy' || reduced()) return; // Spieleinstellung ODER Systemeinstellung „Bewegung reduzieren“
      hitStop = Math.max(hitStop, p.size >= 2 || p.rank === 'alpha' ? 0.11 : 0.045);
    });
    let running = true;
    let frameId = 0;

    // Absicherung: Ein Fehler in einem Bild darf das Spiel nicht stumm einfrieren. Einzelne Fehler werden
    // protokolliert und übersprungen; häufen sie sich, wird gespeichert und sauber zum Hub zurückgekehrt.
    let errCount = 0, errWindow = 0;
    const onFrameError = (err) => {
      console.error('Fehler im Spielbild', err);
      const t = performance.now();
      if (t - errWindow > 10000) { errWindow = t; errCount = 0; }
      if (++errCount === 1) bus.emit('message', { kind: 'warn', title: 'SYSTEM', text: 'Ein Fehler ist aufgetreten – das Spiel läuft weiter.' });
      if (errCount >= 5) {
        try { world.saveNow(); } catch { /* egal */ }
        bus.emit('message', { kind: 'warn', title: 'SYSTEM', text: 'Wiederholte Fehler – Spielstand gesichert, Rückkehr zur Station.' });
        setTimeout(() => bus.emit('toHub'), 600);
        return true;
      }
      return false;
    };

    const frame = (now) => {
      if (!running) return;
      try { frameBody(now); } catch (err) { if (onFrameError(err)) return; }
      if (running) frameId = requestAnimationFrame(frame);
    };
    const frameBody = (now) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      if (dt < 0) dt = 0;
      const tf = performance.now();
      input.update(dt);
      // Ein einziger Akkumulator (in World.update, feste 1/60-s-Schritte, höchstens MAX_STEPS_PER_UPDATE je Bild).
      // Vorher rechnete main.js zusätzlich mit eigenem Akkumulator: bis zu 15 Schritte je Bild auf schwachen Geräten.
      // Hit-Stop: nach einem Abschuss steht die Simulation kurz still (Bild läuft weiter) – gibt Kills Gewicht
      if (hitStop > 0) { hitStop -= dt; world.update(0); } else world.update(dt);
      if (coop) coop.update(dt);
      acc = world._acc;
      const t0 = performance.now();
      if (DEV_LAG) { const e = t0 + DEV_LAG; while (performance.now() < e) { /* künstliche Last */ } }
      renderer.render(dt, acc / STEP);
      const t1 = performance.now();
      perfHud.frame(dt, t1 - t0);
      hud.update(dt);
      audio.update();
      guard.frame(dt, performance.now() - t0, renderer, world);
      renderer.noteWork(performance.now() - tf);
    };
    frameId = requestAnimationFrame(frame);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    // Speichern beim Verlassen und Nachfrage „Seite verlassen?“ im Flug: Strg ist die Angriffstaste, und Strg+W
    // (W = Schub) schließt in Chrome/Edge den Tab – das lässt sich nicht abfangen, nur mit Rückfrage absichern.
    const saveOnLeave = (e) => { world.saveNow(); if (e && !world.docked) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', saveOnLeave);
    const onVisibility = () => { if (document.hidden) world.saveNow(); };
    document.addEventListener('visibilitychange', onVisibility);

    const offHub = bus.on('toHub', () => {
      running = false;
      cancelAnimationFrame(frameId);
      world.saveNow();
      offHub(); offSector(); offKill();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('ls:store', onStore);
      input.dispose(); touch.dispose(); if (coop) coop.stop();
      audio.dispose();
      hud.dispose();
      hudRoot.innerHTML = '';
      document.body.classList.remove('in-game');
      // Flug-Grafik sofort freigeben: Im Hub läuft eine eigene 3D-Szene – zwei WebGL-Kontexte gleichzeitig kosten
      // GPU-Speicher und führen am Handy zu Kontextverlust. Der nächste Abflug baut ohnehin eine frische Engine.
      canvas.removeEventListener('webglcontextlost', onCtxLost);
      perfHud.setRenderer(null);
      try { renderer.dispose(); } catch { /* egal */ } // three.js r170 gibt dabei den WebGL-Kontext frei
      renderer = null;
      resolve();
    });
  });
}

// Abkürzungen nur für Tests (Entwicklungsserver): ?dev=hub|game|dock&f=europa|saturn|eris
const DEV = import.meta.env.DEV ? new URLSearchParams(location.search) : null;

async function devStart() {
  const mode = DEV.get('dev');
  const faction = DEV.get('f') || 'saturn';
  const callsign = 'Dev-' + faction;
  let profile = store.get(callsign) || store.create(callsign, faction);
  if (mode === 'hub') {
    for (;;) {
      profile = store.get(callsign) || profile;
      document.body.dataset.faction = profile.faction;
      if (await hubScreen(screensRoot, profile, store) === 'logout') return;
      await launchSequence(screensRoot, profile);
      await playSession(profile);
    }
  }
  await playSession(profile, { dock: mode === 'dock' });
}

// Erster Start (oder anderer Grafikchip): Grafikchip erkennen und ≈ 1 s unsichtbar messen, Stufe festlegen –
// nur solange der Spieler die Qualität nicht selbst gewählt hat. ?reprobe=1 (Entwicklung) misst neu.
async function chooseQuality() {
  try {
    const force = !!(DEV && DEV.get('reprobe'));
    const r = await autoQuality(applyQuality, force);
    if (import.meta.env.DEV) { window.__quality = r; if (r.ran) console.info('Grafikqualität automatisch:', r); }
  } catch (err) { console.warn('Qualitätswahl übersprungen', err); }
}

// Ein Pilot nur in einem Tab: zwei Tabs mit demselben Piloten überschreiben sich sonst gegenseitig den Spielstand.
// Web Locks (alle aktuellen Browser); ohne Unterstützung wird nicht gesperrt (wie bisher).
function lockPilot(callsign) {
  if (!navigator.locks || !navigator.locks.request) return Promise.resolve(() => { });
  return new Promise((resolve) => {
    navigator.locks.request('ls-pilot-' + String(callsign).toLowerCase(), { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return undefined; }
      return new Promise((release) => resolve(release)); // Sperre halten, bis release() aufgerufen wird
    }).catch(() => resolve(() => { }));
  });
}
function notice(text) {
  const el = document.createElement('div');
  el.className = 'ls-notice';
  el.setAttribute('role', 'alert');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

async function main() {
  await chooseQuality();
  if (DEV && DEV.get('dev')) { await devStart(); }
  await bootSequence(screensRoot);
  for (;;) {
    const { callsign } = await loginScreen(screensRoot, store);
    const release = await lockPilot(callsign);
    if (!release) { notice(`Pilot ${callsign.toUpperCase()} ist bereits in einem anderen Tab aktiv. Dort weiterspielen oder den Tab schließen.`); continue; }
    let profile = store.get(callsign);
    if (!profile) {
      const factionId = await factionSelect(screensRoot);
      profile = store.create(callsign, factionId);
    }
    for (;;) {
      profile = store.get(callsign) || profile;
      document.body.dataset.faction = profile.faction;
      hubMusic(true);
      const choice = await hubScreen(screensRoot, profile, store);
      hubMusic(false);
      if (choice === 'logout') { release(); break; }
      await launchSequence(screensRoot, profile);
      await playSession(profile);
    }
  }
}

// Unbehandelte Fehler außerhalb der Spielschleife sichtbar protokollieren (nicht still verschlucken)
window.addEventListener('error', (e) => console.error('Unbehandelter Fehler:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('Unbehandelte Promise-Ablehnung:', e.reason));

// Menü-Klicks: kurzer leiser Ton für Knöpfe in Hub und Bildschirmen (nicht im Flug-HUD, das hat eigene Töne)
screensRoot.addEventListener('click', (e) => { if (e.target.closest('button, [role="button"], [data-nav], a')) uiSound('click'); }, true);

main().catch(showError);
