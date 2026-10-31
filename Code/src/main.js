// Zusammenbau: Laden → Anmeldung → (Fraktionswahl) → Hub → Startsequenz → Weltall → zurück zum Hub.
import { Bus } from './core/events.js';
import { store } from './core/store.js';
import { bootSequence, loginScreen, factionSelect, hubScreen, launchSequence } from './ui/screens.js';
import { World } from './sim/world.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { StationUI } from './ui/station.js';
import { Input } from './input.js';
import { AudioSystem } from './audio/audio.js';
import { PerfHud } from './perf/perfhud.js';
import { autoQuality, isAutoQuality, storeAutoQuality, raiseCap, QualityGuard, Q_NAMES, Q_LABEL } from './perf/quality.js';
import { setSetting } from './ui/screens-kit.js';
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
    const world = new World(profile, bus);
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
    let running = true;
    let frameId = 0;

    const frame = (now) => {
      if (!running) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > MAX_FRAME) dt = MAX_FRAME;
      if (dt < 0) dt = 0;
      acc += dt;
      const tf = performance.now();
      input.update(dt);
      while (acc >= STEP) {
        world.update(STEP);
        acc -= STEP;
      }
      const t0 = performance.now();
      if (DEV_LAG) { const e = t0 + DEV_LAG; while (performance.now() < e) { /* künstliche Last */ } }
      renderer.render(dt, acc / STEP);
      const t1 = performance.now();
      perfHud.frame(dt, t1 - t0);
      hud.update(dt);
      audio.update();
      guard.frame(dt, performance.now() - t0, renderer, world);
      renderer.noteWork(performance.now() - tf);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    const saveOnLeave = () => world.save();
    window.addEventListener('beforeunload', saveOnLeave);
    const onVisibility = () => { if (document.hidden) world.save(); };
    document.addEventListener('visibilitychange', onVisibility);

    const offHub = bus.on('toHub', () => {
      running = false;
      cancelAnimationFrame(frameId);
      world.save();
      offHub(); offSector();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      input.dispose();
      audio.dispose();
      hud.dispose();
      hudRoot.innerHTML = '';
      document.body.classList.remove('in-game');
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

async function main() {
  await chooseQuality();
  if (DEV && DEV.get('dev')) { await devStart(); }
  await bootSequence(screensRoot);
  for (;;) {
    const { callsign } = await loginScreen(screensRoot, store);
    let profile = store.get(callsign);
    if (!profile) {
      const factionId = await factionSelect(screensRoot);
      profile = store.create(callsign, factionId);
    }
    for (;;) {
      profile = store.get(callsign) || profile;
      document.body.dataset.faction = profile.faction;
      const choice = await hubScreen(screensRoot, profile, store);
      if (choice === 'logout') break;
      await launchSequence(screensRoot, profile);
      await playSession(profile);
    }
  }
}

main().catch(showError);
