// Zusammenbau: Laden → Anmeldung → (Fraktionswahl) → Hub → Startsequenz → Weltall → zurück zum Hub.
import { Bus } from './core/events.js';
import { store } from './core/store.js';
import { bootSequence, loginScreen, factionSelect, hubScreen, launchSequence } from './ui/screens.js';
import { World } from './sim/world.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { SystemSeries } from './sim/system-quests.js';
import { Contracts } from './sim/contracts.js';
import { STORY_QUESTS, STORY_CHAPTERS } from './sim/story.js';
import { SystemGuide } from './ui/hud-guide.js';
import { StationUI } from './ui/station.js';
import { HudTouch } from './ui/hud-touch.js';
import { Coop } from './net/coop.js';
import { Multiplayer } from './net/mp.js';
import { Input } from './input.js';
import { flightSettings, isTouchOnly } from './input/flightsettings.js';
import { loadLayout } from './input/bindings.js';
import { PadFlight } from './input/padflight.js';
import { topModal } from './input/padnav.js'; // Controller: Menü-Navigation überall (Titel, Hub, Station, Dialoge)
import './input/padglyph.js';    // Controller: Tastenhinweise tauschen
import './input/pad.css';
import { AudioSystem, hubMusic, uiSound } from './audio/audio.js';
import { PerfHud } from './perf/perfhud.js';
import { autoQuality, isAutoQuality, storeAutoQuality, raiseCap, QualityGuard, Q_NAMES, Q_LABEL } from './perf/quality.js';
import { setSetting, settings, reduced } from './ui/screens-kit.js';
import { FrameLimiter, currentGfx, notifyDesktop, detectCaps } from './engine/index.js';
import './ui/theme.css';
import { initAccount, linkPilot, settle, resolvePending, openAccount } from './ui/account-flow.js';
import { toast } from './ui/account-ui.js';

loadLayout(); // Tastatur-Layout für die Tastennamen (Chrome, Edge, Electron)
const CLOUD_EVERY = 120; // s: im Flug alle 2 Minuten auf dem Server sichern (nur mit Konto)

const STEP = 1 / 60;          // feste Simulationsschrittweite
const MAX_FRAME = 0.25;       // nach Tab-Wechsel nicht endlos nachrechnen

const screensRoot = document.getElementById('screens');
const hudRoot = document.getElementById('hud');
let canvas = document.getElementById('game');

let renderer = null;
const perfHud = new PerfHud(null); // F3: Leistungsanzeige (Grundzustand aus den Grafik-Einstellungen)
// Bildratenbegrenzung (Grafik-Einstellung): Browser lässt Bilder aus; Desktop-App bekommt den Wert für die Hülle
const limiter = new FrameLimiter();
let gfxSig = '';
let perfSet = null;
function syncGfx() {
  const g = currentGfx();
  if (g.sig === gfxSig) return;
  gfxSig = g.sig;
  limiter.setCap(Math.max(0, g.v.fpsCap | 0)); // -1 = BILDSCHIRM: kein Begrenzer
  // Leistungsanzeige nur umschalten, wenn sich die Einstellung selbst ändert (F3 bleibt bis dahin gültig)
  if (g.v.perfHud !== perfSet) { perfSet = g.v.perfHud; perfHud.toggle(!!g.v.perfHud); }
  notifyDesktop(g.v);
}
syncGfx();
window.addEventListener('ls:settings', syncGfx);
// Absicherung im Flug: bei eigener Wahl des Spielers gilt eine Senkung nur bis zum Neuladen der Seite
let sessionCap = 3;
const desktopApp = detectCaps().desktop;
const applyQuality = (name) => setSetting('quality', name);
// Nur Entwicklungsserver: ?lag=ms bremst jedes Bild künstlich (schwache Rechner nachstellen, Absicherung prüfen)
const DEV_LAG = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('lag')) || 0 : 0;

// Handy und Tablet: Das Spiel ist für ≥ 1360 × 760 gebaut. Statt Menüs zu zerquetschen, bekommt der Browser eine
// feste Layout-Breite und skaliert alles verhältnisgleich auf den Bildschirm (wie eine App). Desktop: unverändert.
function fitViewport() {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  const vp = document.querySelector('meta[name="viewport"]');
  if (!touch || !vp) return;
  const sw = Math.max(screen.width, screen.height), sh = Math.min(screen.width, screen.height);
  const land = window.matchMedia('(orientation: landscape)').matches;
  const w = land ? sw : sh, h = land ? sh : sw;
  if (w >= 1360 && h >= 760) { vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'); delete document.documentElement.dataset.vpfit; return; }
  const lw = Math.round(Math.max(1360, 760 * w / h));
  vp.setAttribute('content', `width=${lw}, user-scalable=no, viewport-fit=cover`);
  document.documentElement.dataset.vpfit = '1';
  document.documentElement.classList.toggle('is-portrait-phone', !land && w < 700);
}
fitViewport();
window.addEventListener('orientationchange', () => setTimeout(fitViewport, 300));
window.matchMedia('(orientation: landscape)').addEventListener?.('change', () => setTimeout(fitViewport, 300));

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
    const Q = new URLSearchParams(location.search);
    const fs0 = flightSettings();
    const wopts = coopCfg && coopCfg.role === 'guest' ? { coopFaction: coopCfg.faction, coopSector: coopCfg.sector } : {};
    wopts.enemyBolts = fs0.enemyBolts || Q.get('gbolzen') === '1'; // Etappe 2: echte Gegnerbolzen (Schalter)
    const world = new World(profile, bus, wopts);
    if (coopCfg) new Coop(world, bus, coopCfg); // trägt sich als world.coop ein (Einladung im Flug startet ihn später)
    // Mehrspieler: gemeinsame Sektoren, Chat, Einladung, PvP (Realtime, ohne Datenbank). ?mp=0 schaltet ab.
    let mp = null;
    if (new URLSearchParams(location.search).get('mp') !== '0') { try { mp = new Multiplayer(world, bus); } catch (err) { console.warn('Mehrspieler aus', err); } }
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
    // SYSTEM-Reihe (optionale Einführung, Planung/QUESTS_SYSTEM.md)
    const series = new SystemSeries(world, bus, () => renderer.cameraMode);
    // Hauptgeschichte Kapitel 1: gleiche Mechanik, eigener Stand; läuft, sobald die Einführung nicht mehr führt
    const story = new SystemSeries(world, bus, () => renderer.cameraMode, { quests: STORY_QUESTS, chapters: STORY_CHAPTERS, key: 'story', label: 'FUNK', mode: 'guided' });
    const guide = new SystemGuide(hudRoot, series, world, story);
    const contracts = new Contracts(world, bus); // Tages- und Wochenaufträge
    // ?flug=taktik: im Taktikmodus starten (alter Klickflug), ?flug=3d: im 3D-Flug (Verfolger)
    if (Q.get('flug') === 'taktik' && renderer.rig.mode !== 'tactical') { renderer.rig.mode = 'tactical'; renderer.rig.cockpit = false; renderer.rig.k = renderer.rig.kRaw = 0; }
    else if (Q.get('flug') === '3d' && renderer.rig.mode !== 'chase') { renderer.rig.mode = 'chase'; renderer.rig.k = renderer.rig.kRaw = 1; }
    world.setFlight3d(renderer.cameraMode === 'chase');
    // Feuerleitrechner (Autofeuer): auf Touch-Geräten Standard (Flug vereinfacht), sonst Strg rechts
    world.autofireDefault = fs0.autofire != null ? fs0.autofire : isTouchOnly();
    const input = new Input(canvas, world, renderer, bus);
    const touch = new HudTouch(hudRoot, world, renderer, input); // iPad/Tablet: Joystick, Knöpfe, Zielanzeige
    const padFlight = new PadFlight(input, hud, bus); // Controller im Flug (Planung/CONTROLLER.md)
    input.menuOpen = () => !!(hud._menuOpen || topModal());
    hud.setInput(input);
    const audio = new AudioSystem(bus, world, renderer);
    audio.start();
    if (import.meta.env.DEV) window.__ls = { world, renderer, bus, hud, audio, series, mp, input, padFlight }; // nur Entwicklung: Test-Pilot (tools/playtest)
    // Fluglabor (nur Entwicklung): Regler F4, Übungsdrohnen, Heimatsektor ohne Gegner
    if (import.meta.env.DEV && Q.get('dev') === 'fluglabor') import('./ui/fluglabor.js').then((m) => { window.__lab = m.installLab({ world, renderer, input, bus, root: hudRoot }); }).catch((err) => console.warn('Fluglabor', err));

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
      if (!limiter.allow(now)) { frameId = requestAnimationFrame(frame); return; } // Bildratenbegrenzung: dieses Bild auslassen
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
      if (world.coop) world.coop.update(dt);
      if (mp) mp.update(dt);
      acc = world._acc;
      const t0 = performance.now();
      if (DEV_LAG) { const e = t0 + DEV_LAG; while (performance.now() < e) { /* künstliche Last */ } }
      renderer.render(dt, acc / STEP);
      const t1 = performance.now();
      perfHud.frame(dt, t1 - t0);
      hud.update(dt);
      series.update(dt);
      if (!series.active && series.state.mode != null) story.update(dt);
      contracts.update(dt);
      guide.render();
      audio.update();
      if (!desktopApp) guard.frame(dt, performance.now() - t0, renderer, world); // Desktop-App: Stufe bleibt, wie gewählt
      renderer.noteWork(performance.now() - tf);
    };
    frameId = requestAnimationFrame(frame);

    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);

    // Speichern beim Verlassen und Nachfrage „Seite verlassen?“ im Flug: Strg ist die Angriffstaste, und Strg+W
    // (W = Schub) schließt in Chrome/Edge den Tab – das lässt sich nicht abfangen, nur mit Rückfrage absichern.
    const saveOnLeave = (e) => { world.saveNow(); if (e && !world.docked) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', saveOnLeave);
    const cloud = opts.account && opts.account.linked(profile.callsign) ? opts.account : null;
    const onVisibility = () => { if (document.hidden) { world.saveNow(); cloud?.pushLeave(world.profile); } };
    document.addEventListener('visibilitychange', onVisibility);
    const onPageHide = () => { world.saveNow(); cloud?.pushLeave(world.profile); };
    window.addEventListener('pagehide', onPageHide);

    // Konto: Server-Stand sichern beim Andocken und alle 2 min im Flug; ein anderes Gerät war neuer → zur Station
    let cloudT = 0, conflictT = 0, offAccount = () => { }, offDock = () => { };
    if (cloud) {
      offDock = bus.on('docked', () => { world.saveNow(); cloud.push(world.profile); });
      cloudT = setInterval(() => { if (!document.hidden && !cloud.pending) cloud.push(world.profile); }, CLOUD_EVERY * 1000);
      offAccount = cloud.on((type) => {
        if (type !== 'conflict') return;
        bus.emit('message', { kind: 'warn', title: 'KONTO', text: 'Ein anderes Gerät hat einen neueren Spielstand gesichert. Rückkehr zur Station, dort wird abgeglichen.' });
        clearTimeout(conflictT);
        conflictT = setTimeout(() => { if (running) bus.emit('toHub'); }, 3000);
      });
    }

    const offHub = bus.on('toHub', () => {
      running = false;
      cancelAnimationFrame(frameId);
      world.saveNow();
      offHub(); offSector(); offKill();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeunload', saveOnLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(cloudT); clearTimeout(conflictT); offAccount(); offDock();
      window.removeEventListener('ls:store', onStore);
      padFlight.dispose(); input.dispose(); touch.dispose(); if (world.coop) world.coop.stop(); if (mp) mp.dispose();
      audio.dispose();
      series.dispose();
      story.dispose();
      guide.dispose();
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

// Abkürzungen nur für Tests (Entwicklungsserver): ?dev=hub|game|dock|fluglabor&f=europa|saturn|eris
const DEV = import.meta.env.DEV ? new URLSearchParams(location.search) : null;

async function devStart() {
  const mode = DEV.get('dev');
  const faction = DEV.get('f') || 'saturn';
  const callsign = (DEV.get('cs') || '').replace(/[^\w-]/g, '').slice(0, 16) || 'Dev-' + faction; // &cs=Name: eigener Testpilot (Mehrspieler-Test)
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
  // Konto im Hintergrund prüfen (nur mit gespeicherter Sitzung oder Link aus einer Mail, sonst kein Netz)
  const accountP = initAccount(store).catch((err) => { console.warn('Konto nicht verfügbar', err); return null; });
  await bootSequence(screensRoot);
  const account = await accountP;
  if (account && account.recovery) {
    const r = await openAccount(store, 'newpw');
    if (r && r.passwordSet) toast('Neues Passwort gespeichert. Du bist angemeldet.');
  }
  let next = null; // Pilot, zu dem nach einer Anmeldung im Hub gewechselt wird
  for (;;) {
    const login = next || await loginScreen(screensRoot, store, account);
    next = null;
    const { callsign } = login;
    const release = await lockPilot(callsign);
    if (!release) { notice(`Pilot ${callsign.toUpperCase()} ist bereits in einem anderen Tab aktiv. Dort weiterspielen oder den Tab schließen.`); continue; }
    // Kontopilot: Server-Stand laden und mit dem lokalen Stand abgleichen (fragt, wenn beide gelten könnten).
    // Auch wenn der Rufname des Kontos über „Ohne Konto spielen“ eingegeben wurde: sonst würde ein lokaler Pilot
    // gleichen Namens (evtl. andere Fraktion) ohne Abgleich auf den Server geschrieben.
    if (account && account.linked(callsign)) await linkPilot(account, store);
    let profile = store.get(callsign);
    if (!profile) {
      const factionId = await factionSelect(screensRoot);
      profile = store.create(callsign, factionId);
    }
    for (;;) {
      if (account && account.linked(callsign)) { try { await settle(account, store, callsign); } catch (err) { console.warn('Abgleich übersprungen', err); } }
      profile = store.get(callsign) || profile;
      document.body.dataset.faction = profile.faction;
      hubMusic(true);
      const choice = await hubScreen(screensRoot, profile, store, account);
      hubMusic(false);
      if (choice === 'logout') { release(); break; }
      if (choice === 'sync') continue; // Konflikt im Hub: abgleichen und Hub neu aufbauen
      if (choice === 'account') {
        // Im Hub angemeldet: gleicher Rufname → verknüpfen und bleiben, anderer Rufname → Pilot wechseln
        if (account.linked(callsign)) { await linkPilot(account, store); continue; }
        release();
        next = { callsign: account.pilot.callsign, account: true };
        break;
      }
      await launchSequence(screensRoot, profile);
      await playSession(profile, { account });
      if (account && account.pending) await resolvePending(account, store);
    }
  }
}

// Unbehandelte Fehler außerhalb der Spielschleife sichtbar protokollieren (nicht still verschlucken)
window.addEventListener('error', (e) => console.error('Unbehandelter Fehler:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.error('Unbehandelte Promise-Ablehnung:', e.reason));

// Menü-Klicks: kurzer leiser Ton für Knöpfe in Hub und Bildschirmen (nicht im Flug-HUD, das hat eigene Töne)
screensRoot.addEventListener('click', (e) => { if (e.target.closest('button, [role="button"], [data-nav], a')) uiSound('click'); }, true);

main().catch(showError);
