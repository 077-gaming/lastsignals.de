#!/usr/bin/env node
// Controller-Prüfung ohne echten Controller: navigator.getGamepads wird per addInitScript durch eine steuerbare
// Attrappe ersetzt (Standard-Mapping, Achsen/Tasten je Prüfschritt), 'gamepadconnected' wird ausgelöst.
// Geprüft: Titel → Rufname → Fraktion → Hub (Bereiche, Einstellungen, Shop) → Start → Flug (Schub, Lenken, Ziele,
// Angriff, Rakete, Vibration, Kamera, Schnellleiste, Karte, Bordmenü) → Andocken → Station (Reiter, Kaufen) →
// Abdocken → Sprung, dazu Tastenhinweise, Rückwechsel auf Tastatur und Touch-Knöpfe. Ergebnis: Liste der Prüfungen,
// Konsolenfehler, Bilder in tools/playtest/berichte/controller-<zeit>/.
//
//   node tools/playtest/controller.mjs [--url http://localhost:5196] [--stil xbox|ps] [--sichtbar]
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = arg('url', 'http://localhost:5196');
const STYLE = arg('stil', 'xbox');
const HEADLESS = !args.includes('--sichtbar');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const IMG = path.join(HERE, 'berichte', 'controller-' + stamp);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IDS = {
  xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  ps: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
};
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'OK  ' : 'FEHL'} ${name}${info ? ' · ' + info : ''}`); };

function initScript(id) {
  window.__gp = { buttons: new Array(17).fill(0), axes: [0, 0, 0, 0], connected: false, id, effects: [] };
  const mk = () => {
    const g = window.__gp;
    return {
      id: g.id, index: 0, connected: g.connected, mapping: 'standard', timestamp: performance.now(),
      axes: g.axes.slice(), buttons: g.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
      vibrationActuator: { type: 'dual-rumble', playEffect: (t, p) => { g.effects.push({ t, ...p }); return Promise.resolve('complete'); } },
    };
  };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (window.__gp.connected ? [mk(), null, null, null] : [null, null, null, null]) });
  window.__gpConnect = () => { window.__gp.connected = true; const e = new Event('gamepadconnected'); e.gamepad = mk(); window.dispatchEvent(e); };
  window.__gpDisconnect = () => { window.__gp.connected = false; const e = new Event('gamepaddisconnected'); window.dispatchEvent(e); };
}

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: HEADLESS, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(initScript, IDS[STYLE] || IDS.xbox);
  await ctx.addInitScript(() => {
    try { if (!localStorage.getItem('ls.settings')) localStorage.setItem('ls.settings', JSON.stringify({ quality: 'low', hudScale: 1, reducedMotion: true, rev: 2 })); } catch { /* egal */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('Ausnahme: ' + String(e.stack || e).slice(0, 400)));
  let shotN = 0;
  const shot = async (name) => { shotN++; await page.screenshot({ path: path.join(IMG, `${String(shotN).padStart(2, '0')}-${name}.png`) }).catch(() => {}); };

  // ---------- Attrappe bedienen ----------
  const ev = (fn, a) => page.evaluate(fn, a);
  const setBtn = (b, v) => ev(([b, v]) => { window.__gp.buttons[b] = v; }, [b, v]);
  const setAxes = (ax) => ev((ax) => { window.__gp.axes = ax; }, ax);
  const press = async (name, hold = 90, after = 140) => { await setBtn(B[name], 1); await sleep(hold); await setBtn(B[name], 0); await sleep(after); };
  const active = () => ev(() => { const a = document.activeElement; return a ? (a.dataset.sec || a.dataset.act || a.dataset.set && a.dataset.set + '=' + a.dataset.val || a.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)) : ''; });
  const waitFor = (fn, a, ms = 15000) => page.waitForFunction(fn, a, { timeout: ms }).then(() => true, () => false);

  // ---------- 1) Titel bis Flug ohne Maus ----------
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await sleep(600);
  await ev(() => window.__gpConnect());
  await sleep(200);
  await press('A'); // Vorspann überspringen (keine Kandidaten → Enter)
  check('Controller-Modus nach erstem Tastendruck', await ev(() => document.documentElement.dataset.input === 'pad'));
  const login = await waitFor(() => !!document.querySelector('#sc-callsign'), null, 20000);
  check('Vorspann mit A übersprungen, Rufname-Bildschirm', login);
  await sleep(500);
  await page.keyboard.type('PadPilot'); // Texteingabe nur über Tastatur (Hinweis im Spiel)
  check('Tastatur schaltet auf Tastatur-Modus', await ev(() => document.documentElement.dataset.input === 'kb'));
  await press('A'); // Formular abschicken
  const fsel = await waitFor(() => !!document.querySelector('.fs-list'), null, 15000);
  check('Rufname mit A bestätigt, Fraktionswahl', fsel);
  await sleep(700);
  await shot('fraktion');
  // Fokus auf die Liste und zu SATURN, dann Bestätigen-Knopf
  for (let i = 0; i < 6; i++) {
    const a = await active();
    if (/SATURN/i.test(a)) break;
    await press('DOWN');
  }
  let a = await active();
  check('Steuerkreuz bewegt Fokus in der Fraktionswahl', !!a, a);
  await press('A');
  await shot('fraktion-gewaehlt');
  const go = await ev(() => document.querySelector('[data-go]')?.textContent || '');
  // Bestätigen: Fokus auf den Startknopf bewegen und A
  for (let i = 0; i < 6; i++) { if (await ev(() => document.activeElement?.matches('[data-go]'))) break; await press('DOWN'); }
  check('Fokus erreicht Bestätigen-Knopf', await ev(() => document.activeElement?.matches('[data-go]')), go);
  check('Fokusrahmen sichtbar', await ev(() => document.querySelector('.gp-ring.on') !== null));
  await press('A');
  const hub = await waitFor(() => !!document.querySelector('[data-launch]'), null, 30000);
  check('Fraktion bestätigt, Mission Control geladen', hub);
  await sleep(1500);
  await shot('hub');

  // ---------- 2) Hub: Bereiche, Einstellungen, Shop ----------
  await press('RT'); // nächster Bereich
  let sec = await ev(() => document.querySelector('button[data-sec].is-on')?.dataset.sec);
  check('RT wechselt Bereich im Hub', sec && sec !== 'start', sec);
  // zu EINSTELLUNGEN
  for (let i = 0; i < 12 && sec !== 'einst'; i++) { await press('RT'); sec = await ev(() => document.querySelector('button[data-sec].is-on')?.dataset.sec); }
  check('Einstellungen erreicht', sec === 'einst');
  await sleep(500);
  const hasPadSec = await ev(() => !!document.querySelector('[data-set="pad.sens"]'));
  check('Einstellungen: Abschnitt CONTROLLER', hasPadSec);
  check('Belegungsgrafik vorhanden', await ev(() => !!document.querySelector('.gp-svg') && [...document.querySelectorAll('.gp-row .ls-key')].some((e) => e.textContent === (window.__pad.style === 'ps' ? '\u00D7' : 'A'))));
  // Fokus auf „Vibration AUS“ bewegen: zuerst in die Seite (rechts), dann nach unten suchen
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const k = await ev(() => { const a = document.activeElement; return a?.dataset?.set === 'pad.rumble' && a.dataset.val === 'false'; });
    if (k) { found = true; break; }
    const where = await ev(() => { const a = document.activeElement; const t = document.querySelector('[data-set="pad.rumble"][data-val="false"]'); if (!a || !t) return 'down'; const r = a.getBoundingClientRect(), q = t.getBoundingClientRect(); if (Math.abs(q.top - r.top) < 8) return q.left > r.left ? 'right' : 'left'; return q.top > r.top ? 'down' : 'up'; });
    await press(where === 'right' ? 'RIGHT' : where === 'left' ? 'LEFT' : where === 'up' ? 'UP' : 'DOWN', 60, 90);
  }
  check('Fokus erreicht Schalter VIBRATION', found, await active());
  await press('A');
  check('A schaltet Vibration aus (ls.pad)', await ev(() => JSON.parse(localStorage.getItem('ls.pad') || '{}').rumble === false));
  await shot('einstellungen');
  // wieder an
  await press('LEFT'); await press('A');
  check('Vibration wieder an', await ev(() => JSON.parse(localStorage.getItem('ls.pad') || '{}').rumble === true));
  // zum Shop
  for (let i = 0; i < 12 && sec !== 'shop'; i++) { await press('LT'); sec = await ev(() => document.querySelector('button[data-sec].is-on')?.dataset.sec); }
  check('Shop erreicht (LT)', sec === 'shop');
  await sleep(500);
  const tab0 = await ev(() => document.querySelector('.hb-view [data-tab].on, .hb-view [data-tab].is-on, .hb-view [data-tab][aria-selected="true"]')?.dataset.tab);
  await press('RB');
  await sleep(300);
  const tab1 = await ev(() => document.querySelector('.hb-view [data-tab].on, .hb-view [data-tab].is-on, .hb-view [data-tab][aria-selected="true"]')?.dataset.tab);
  check('RB wechselt Shop-Reiter', tab0 !== tab1, `${tab0} → ${tab1}`);
  await shot('shop');
  await press('B'); await sleep(200);
  // Zurück zum Start und abheben mit MENU
  for (let i = 0; i < 3; i++) { await press('B'); await sleep(150); }
  await press('MENU');
  const flight = await waitFor(() => window.__ls && window.__ls.world && window.__ls.world.player, null, 60000);
  check('MENU hebt ab, Startsequenz → Flug', flight);
  await sleep(4000);
  await shot('flug');

  // ---------- 3) Flug ----------
  const W = (fn, a) => ev(fn, a);
  await W(() => { const w = window.__ls.world; w.player.hp = w.player.hpMax; });
  // Einführungswahl (falls offen) mit Controller: „Direkt spielen“
  if (await W(() => !!document.querySelector('.lsg-choice'))) {
    await sleep(300);
    for (let i = 0; i < 4 && !(await W(() => document.activeElement?.dataset.act === 'direct')); i++) await press('RIGHT');
    await press('A');
    check('Einführungswahl mit Controller beantwortet', await W(() => !document.querySelector('.lsg-choice')));
  }
  // Station-Sicherheitszone verlassen: Ziel weit weg setzen ist nicht nötig – Schub testen
  const sp0 = await W(() => window.__ls.world.player.fs || 0);
  await setBtn(B.RT, 1); await sleep(2200);
  const sp1 = await W(() => window.__ls.world.player.fs || 0);
  check('RT gibt Schub', sp1 > sp0 + 40, `${Math.round(sp0)} → ${Math.round(sp1)} m/s`);
  const rot0 = await W(() => window.__ls.world.player.rot);
  await setAxes([1, 0, 0, 0]); await sleep(1200);
  const rot1 = await W(() => window.__ls.world.player.rot);
  check('Linker Stick lenkt (rechts)', Math.abs(rot1 - rot0) > 0.3, `${rot0.toFixed(2)} → ${rot1.toFixed(2)}`);
  await setAxes([0, 0, 0, 0]);
  await setBtn(B.RT, 0.5); await sleep(2500);
  const half = await W(() => window.__ls.world.player.fs / window.__ls.world._speed);
  check('RT halb = etwa halbes Tempo (stufenlos)', half > 0.25 && half < 0.75, half.toFixed(2));
  await setBtn(B.RT, 0);
  await setBtn(B.LT, 1); await sleep(1500); await setBtn(B.LT, 0);
  const sp2 = await W(() => window.__ls.world.player.fs || 0);
  check('LT bremst', sp2 < sp1 * 0.5, `${Math.round(sp2)} m/s`);
  // Kamera: rechter Stick im Verfolger
  const view0 = await W(() => window.__ls.renderer.viewMode);
  await setAxes([0, 0, 1, 0]); await sleep(500);
  const ly = await W(() => window.__ls.renderer.rig.lookYaw);
  check('Rechter Stick schwenkt Kamera (Verfolger)', view0 !== 'chase' || ly < -1, `${view0} lookYaw ${ly.toFixed(2)}`);
  await setAxes([0, 0, 0, 0]); await sleep(900);
  const ly2 = await W(() => window.__ls.renderer.rig.lookYaw);
  check('Kamera federt zurück', Math.abs(ly2) < 0.25, ly2.toFixed(2));
  await press('R3');
  const view1 = await W(() => window.__ls.renderer.viewMode);
  check('R3 wechselt Kamera', view1 !== view0, `${view0} → ${view1}`);
  if (view1 === 'cockpit') {
    await setAxes([0, 0, 1, 0]); await sleep(400);
    check('Cockpit: rechter Stick sieht sich um (lookBy)', await W(() => window.__ls.renderer.rig.lookYaw < -0.5));
    await setAxes([0, 0, 0, 0]); await sleep(300);
    await shot('cockpit');
  }
  // zurück zum Verfolger (V über Tastatur: Tastatur bleibt bedienbar)
  while ((await W(() => window.__ls.renderer.viewMode)) !== 'chase') await press('R3', 60, 300);
  // Ziele: Gegner in die Nähe holen
  await W(() => {
    const w = window.__ls.world, p = w.player;
    const en = [...w.entities.values()].filter((e) => e.kind === 'enemy' && e.alive).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    if (en[0]) { p.x = en[0].x + 380; p.z = en[0].z + 380; p.vx = p.vz = 0; p.fs = 0; }
  });
  await sleep(400);
  await press('RB');
  const t1 = await W(() => window.__ls.world.player.targetId);
  check('RB wählt Ziel', t1 != null, String(t1));
  await press('RB');
  const t2 = await W(() => window.__ls.world.player.targetId);
  check('RB wählt nächstes Ziel', t2 != null && t2 !== t1, `${t1} → ${t2}`);
  await press('LB');
  const t3 = await W(() => window.__ls.world.player.targetId);
  check('LB wählt voriges Ziel', t3 === t1, `${t2} → ${t3}`);
  await press('A');
  check('A: Angriff an', await W(() => window.__ls.world.player.attacking === true));
  await W(() => { window.__rk = 0; window.__ls.bus.on('rocket', (e) => { if (e.from === 'player') window.__rk++; }); window.__gp.effects.length = 0; });
  await press('X'); await sleep(200);
  check('X: Rakete', await W(() => window.__rk > 0));
  check('Vibration beim Raketenstart', await W(() => window.__gp.effects.some((e) => e.t === 'dual-rumble')));
  await W(() => { const w = window.__ls.world; w.bus.emit('damage', { id: w.player.id, hull: 200, shield: 100, x: w.player.x, z: w.player.z, crit: false }); });
  await sleep(150);
  check('Vibration bei Treffer am eigenen Schiff', await W(() => window.__gp.effects.length >= 2), String(await W(() => window.__gp.effects.length)));
  await press('B');
  check('B: Angriff aus', await W(() => window.__ls.world.player.attacking === false));
  await press('B');
  check('B: Ziel gelöst', await W(() => window.__ls.world.player.targetId == null));
  // Schnellleiste
  const bar = () => W(() => ({ cur: window.__ls.hud.bar.cur, sel: window.__ls.hud.bar.padSel }));
  const b0 = await bar();
  await press('RIGHT'); await press('RIGHT');
  const b1 = await bar();
  check('Steuerkreuz ▸ wählt Schnellleisten-Platz', b1.sel === (b0.sel + 2) % 10, `${b0.sel} → ${b1.sel}`);
  check('Auswahl sichtbar', await W(() => !!document.querySelector('.qs.gp-sel')));
  await press('DOWN');
  const b2 = await bar();
  check('Steuerkreuz ▾ wechselt Leiste', b2.cur !== b1.cur, `${b1.cur} → ${b2.cur}`);
  await press('UP');
  await W(() => { const pr = window.__ls.world.profile; window.__am = pr.selectedAmmo; });
  // Platz 3 (L3) auslösen: RB halten + A
  await press('LEFT'); // sel = 1 (L2)
  await setBtn(B.RB, 1); await sleep(80); await press('A'); await setBtn(B.RB, 0); await sleep(150);
  const am = await W(() => window.__ls.world.profile.selectedAmmo);
  const tAfter = await W(() => window.__ls.world.player.targetId);
  check('RB+A löst gewählten Platz aus (L2)', am === 'L2', `Munition ${am}`);
  check('RB+A wechselt dabei nicht das Ziel', tAfter == null);
  await W(() => window.__ls.world.selectAmmo('L1'));
  // Karte
  const map0 = await W(() => window.__ls.hud.wins.isHidden('map'));
  await press('VIEW');
  const map1 = await W(() => window.__ls.hud.wins.isHidden('map'));
  check('VIEW blendet Karte um', map0 !== map1);
  await press('VIEW');
  // Tastenhinweise im HUD
  check('HUD-Hinweise zeigen Controller-Symbole', await W(() => [...document.querySelectorAll('#hud .ls-key.is-pad')].length > 0), await W(() => [...document.querySelectorAll('#hud .ls-key.is-pad')].slice(0, 6).map((e) => e.textContent).join(' ')));
  // Bordmenü
  await press('MENU');
  check('MENU öffnet Bordmenü', await W(() => window.__ls.hud._menuOpen === true));
  await sleep(300);
  check('Fokus im Bordmenü', await W(() => !!document.activeElement && document.querySelector('[data-r="menu"]').contains(document.activeElement)));
  const tabA = await W(() => window.__ls.hud.menu.tab);
  await press('RB'); await press('RB');
  const tabB = await W(() => window.__ls.hud.menu.tab);
  check('RB wechselt Reiter im Bordmenü', tabA !== tabB, `${tabA} → ${tabB}`);
  check('Reiter STEUERUNG zeigt Controller-Belegung', await W(() => window.__ls.hud.menu.tab !== 'steuerung' || !!document.querySelector('.mp-padsec .gp-row .ls-key')?.textContent));
  await shot('bordmenue');
  await press('DOWN'); await press('DOWN');
  check('Steuerkreuz bewegt Fokus im Bordmenü', await W(() => document.querySelector('[data-r="menu"]').contains(document.activeElement)), await active());
  await press('B');
  check('B schließt Bordmenü', await W(() => window.__ls.hud._menuOpen === false));
  // Andocken
  await W(() => { const w = window.__ls.world, st = w.station || w.sector.station; const p = w.player; p.x = st.x + 160; p.z = st.z + 160; p.vx = p.vz = 0; p.fs = 0; w.player.hasMove = false; });
  await sleep(400);
  await press('Y', 90, 400);
  check('Y dockt an (sichere Zone)', await W(() => window.__ls.world.docked === true));
  await sleep(1200);
  await shot('station');
  check('Fokus in der Station', await W(() => !!document.querySelector('.sx')?.contains(document.activeElement)), await active());
  check('Station: Abdock-Hinweis zeigt B', await W(() => document.querySelector('.sx-undock .ls-key')?.textContent === (window.__pad.style === 'ps' ? '\u25CB' : 'B')));
  const st0 = await W(() => document.querySelector('.sx-tab[aria-selected="true"], .sx-tab.on, .sx-tab.is-on')?.dataset.tab);
  await press('RB'); await sleep(300);
  const st1 = await W(() => document.querySelector('.sx-tab[aria-selected="true"], .sx-tab.on, .sx-tab.is-on')?.dataset.tab);
  check('RB wechselt Stations-Reiter', st0 !== st1, `${st0} → ${st1}`);
  for (let i = 0; i < 3 && (await W(() => document.querySelector('.sx-tab[aria-selected="true"], .sx-tab.on, .sx-tab.is-on')?.dataset.tab)) !== 'shop'; i++) { await press('RB'); await sleep(250); }
  // Kaufen: Fokus auf einen Kaufknopf bewegen
  const cr0 = await W(() => ({ c: window.__ls.world.profile.credits, a: JSON.stringify(window.__ls.world.profile.ammo) }));
  let buy = false;
  for (let i = 0; i < 40 && !buy; i++) {
    buy = await W(() => document.activeElement?.dataset?.act === 'buy');
    if (buy) break;
    const dir = await W(() => { const a = document.activeElement, t = [...document.querySelectorAll('.sx [data-act="buy"]')].find((b) => !b.disabled && b.offsetParent); if (!a || !t) return 'DOWN'; const r = a.getBoundingClientRect(), q = t.getBoundingClientRect(); if (Math.abs((q.top + q.bottom) / 2 - (r.top + r.bottom) / 2) < 10) return q.left > r.left ? 'RIGHT' : 'LEFT'; return q.top > r.top ? 'DOWN' : 'UP'; });
    await press(dir, 60, 90);
  }
  check('Fokus erreicht Kaufen-Knopf', buy, await active());
  await press('A'); await sleep(300);
  const cr1 = await W(() => ({ c: window.__ls.world.profile.credits, a: JSON.stringify(window.__ls.world.profile.ammo) }));
  check('Station: Kauf mit A', cr1.c < cr0.c || cr1.a !== cr0.a, `${cr0.c} → ${cr1.c} Credits`);
  await sleep(300);
  check('Fokus nach dem Kauf wieder gesetzt', await W(() => !!document.querySelector('.sx')?.contains(document.activeElement) && !!document.querySelector('.gp-ring.on')), await active());
  await shot('station-kauf');
  await press('B'); await sleep(600);
  check('B dockt ab', await W(() => window.__ls.world.docked === false));
  await sleep(500);
  // Sprung: ans Tor
  await W(() => { const w = window.__ls.world, p = w.player; const pt = (w.sector.portals || [])[0]; if (pt) { p.x = pt.x + 60; p.z = pt.z + 60; p.vx = p.vz = 0; p.fs = 0; } });
  await sleep(400);
  const hasPortal = await W(() => !!window.__ls.world.nearPortal);
  if (hasPortal) { await press('Y', 90, 300); check('Y springt am Tor', await W(() => !!window.__ls.world.jump)); await W(() => { window.__ls.world.jump = null; }); }
  else check('Sprungtor in Reichweite für Y', false, 'kein Tor gefunden');
  // Beute anfliegen
  const crate = await W(() => { const w = window.__ls.world, p = w.player; const c = (w.crates || []).find((c) => c && c.alive); if (!c) return null; p.x = c.x + 500; p.z = c.z; p.vx = p.vz = 0; p.fs = 0; p.hasMove = false; return { x: c.x, z: c.z }; });
  if (crate) {
    await sleep(300);
    await press('Y', 90, 200);
    const mv = await W(() => {
      const w = window.__ls.world, p = w.player;
      const loot = [...(w.wrecks || []), ...(w.crates || []).filter((c) => c && c.alive), ...(w.ores || []).filter((o) => o && o.alive)];
      return { m: p.hasMove, hit: loot.some((o) => Math.hypot(o.x - p.tx, o.z - p.tz) < 1) };
    });
    check('Y fliegt Beute an', mv.m && mv.hit, JSON.stringify(mv));
  }
  // Y halten = Autopilot
  await W(() => { const w = window.__ls.world; w.player.x += 2500; w.player.hasMove = false; });
  await setBtn(B.Y, 1); await sleep(800); await setBtn(B.Y, 0); await sleep(200);
  check('Y halten: Autopilot zur Station', await W(() => window.__ls.world.homing === true));
  // Taktisch: linker Stick bildbezogen
  while ((await W(() => window.__ls.renderer.viewMode)) !== 'tactical') await press('R3', 60, 300);
  await W(() => { const p = window.__ls.world.player; p.hasMove = false; window.__z0 = p.z; window.__ls.world.homing = false; });
  await setAxes([0, -1, 0, 0]); await sleep(1500); await setAxes([0, 0, 0, 0]);
  check('Taktisch: Stick oben fliegt Bild-oben (−z)', await W(() => window.__ls.world.player.tz < window.__z0 - 50));
  while ((await W(() => window.__ls.renderer.viewMode)) !== 'chase') await press('R3', 60, 300);

  // ---------- 4) Tastatur unverändert, Hinweise zurück ----------
  await page.keyboard.press('KeyV'); await sleep(200);
  check('Tastatur V wechselt Kamera weiter', (await W(() => window.__ls.renderer.viewMode)) === 'cockpit');
  check('Tastatur-Modus: Hinweise zurück auf Tasten', await W(() => document.documentElement.dataset.input === 'kb' && ![...document.querySelectorAll('#hud .ls-key')].some((e) => e.classList.contains('is-pad'))));
  await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');
  await page.keyboard.press('Tab');
  check('Tastatur TAB wählt Ziel', await W(() => window.__ls.world.player.targetId != null));
  await page.keyboard.press('Escape');
  check('Tastatur Esc öffnet Bordmenü', await W(() => window.__ls.hud._menuOpen === true));
  await page.keyboard.press('Escape');
  // An- und Abstecken
  await ev(() => window.__gpDisconnect()); await sleep(300);
  check('Abstecken ohne Fehler', await W(() => window.__pad.connected === 0 && window.__pad.index === -1));
  await ev(() => window.__gpConnect()); await sleep(200);
  await press('A'); await sleep(150);
  check('Wieder anstecken: Controller aktiv', await W(() => window.__pad.index === 0 && window.__pad.mode === 'pad'));

  await browser.close();

  // ---------- 5) Touch-Gerät mit Controller ----------
  const b2b = await chromium.launch({ channel: 'chrome', headless: HEADLESS });
  const tctx = await b2b.newContext({ viewport: { width: 1366, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  await tctx.addInitScript(initScript, IDS[STYLE] || IDS.xbox);
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push('Touch-Ausnahme: ' + String(e).slice(0, 300)));
  tp.on('console', (m) => { if (m.type() === 'error') errors.push('Touch: ' + m.text().slice(0, 300)); });
  await tp.goto(BASE + '/?dev=game&f=saturn', { waitUntil: 'domcontentloaded' });
  await tp.waitForFunction(() => window.__ls && window.__ls.world, null, { timeout: 60000 }).catch(() => {});
  await sleep(1500);
  const vis = () => tp.evaluate(() => { const e = document.querySelector('.ht-pad'); return e ? getComputedStyle(e).display !== 'none' : null; });
  const v0 = await vis();
  await tp.evaluate(() => window.__gpConnect());
  await tp.evaluate(() => { window.__gp.buttons[0] = 1; }); await sleep(120); await tp.evaluate(() => { window.__gp.buttons[0] = 0; }); await sleep(200);
  const v1 = await vis();
  check('Touch: Knöpfe sichtbar ohne Controller', v0 === true, String(v0));
  check('Touch: Knöpfe ausgeblendet, solange Controller aktiv', v1 === false, String(v1));
  await tp.touchscreen.tap(700, 400); await sleep(200);
  check('Touch: Antippen zeigt Knöpfe wieder', (await vis()) === true);
  await b2b.close();

  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} Prüfungen bestanden · Konsolenfehler: ${errors.length}`);
  for (const e of errors) console.log('  Konsole:', e);
  await fs.writeFile(path.join(IMG, 'ergebnis.json'), JSON.stringify({ results, errors }, null, 2));
  console.log('Bilder:', IMG);
  process.exit(bad.length || errors.length ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
