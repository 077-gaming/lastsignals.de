#!/usr/bin/env node
// Grafik-Einstellungen im echten Spiel bedienen und die Wirkung prüfen (Entwicklungsserver, Google Chrome).
//   1. Browser: Hub → EINSTELLUNGEN: GRAFIK und CONTROLLER nebeneinander, keine Stufe EXTREM, Stufe/Wert per Klick.
//   2. Desktop (?desktop=1): EXTREM wählbar, Flug startet mit EXTREM (Schatten 4096, AO VOLL, SMAA).
//      Bordmenü (Esc → ANZEIGE → GRAFIK): Kantenglättung, Umgebungsverdeckung, Anisotropie (auch an geladenen
//      Meshy-Modellen), Auflösungsskalierung, Hochskalierung, Schatten, Bildratenbegrenzung 30 – je mit Messung am
//      Renderer. Hinweis NEUSTART (APP) an der Bildrate.
//   3. Desktop-Hülle (window.lsDesktop als Attrappe): setGraphics bekommt { fpsCap, renderScale } bei jeder Änderung.
// Ergebnis: Liste der Prüfungen, Konsolenfehler. Aufruf: node tools/playtest/grafik.mjs [--url http://localhost:5173]
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const BASE = arg('url', 'http://localhost:5173');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, total = 0;
function check(name, ok, extra = '') {
  total++;
  console.log(`${ok ? 'OK    ' : 'FEHLER'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) failed++;
}
async function waitFor(page, fn, a, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await page.evaluate(fn, a); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(250);
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const errors = [];
async function newPage(init) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return page;
}
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('ls.settings') || '{}'); } catch { return {}; } });
// Klick in einem GRAFIK-Bereich (scope: Hub-Ansicht oder Bordmenü)
async function gx(page, scope, sel) {
  const el = page.locator(`${scope} [data-gx] ${sel}`).first();
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.click();
  await sleep(150);
}
const tab = (page, scope, id) => gx(page, scope, `[data-gfx="tab"][data-v="${id}"]`);
const setV = (page, scope, k, v) => gx(page, scope, `[data-gfx="set"][data-k="${k}"][data-v="${v}"]`);

// ---------------------------------------------------------------- 1. Browser: Hub → EINSTELLUNGEN
{
  const page = await newPage();
  await page.goto(`${BASE}/?dev=hub&f=saturn`);
  await page.waitForSelector('.scr-hub', { timeout: 60000 });
  await page.locator('button[data-sec="einst"]').first().click();
  await page.waitForSelector('.st [data-gx]', { timeout: 10000 });
  const lay = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.st > .st-c')];
    const colOf = (el) => cols.findIndex((c) => c.contains(el));
    const g = document.querySelector('.st [data-gx]'), p = document.querySelector('.st [data-padst]');
    return { cols: cols.length, gfx: colOf(g), pad: colOf(p), konto: !!document.querySelector('.st .ac-hub') };
  });
  check('Hub EINSTELLUNGEN: GRAFIK und CONTROLLER in getrennten Spalten', lay.cols === 2 && lay.gfx >= 0 && lay.pad >= 0 && lay.gfx !== lay.pad, JSON.stringify(lay));
  check('Hub EINSTELLUNGEN: KONTO-Bereich bleibt', lay.konto);
  const tiers = await page.$$eval('.st [data-gx] [data-gfx="preset"]', (b) => b.map((x) => x.dataset.v));
  check('Browser: keine Stufe EXTREM', !tiers.includes('extreme') && tiers.includes('ultra'), tiers.join(','));
  await gx(page, '.st', '[data-gfx="preset"][data-v="high"]');
  let s = await stored(page);
  check('Hub: Stufe HOCH gespeichert', s.quality === 'high', JSON.stringify(s));
  await tab(page, '.st', 'bild');
  await setV(page, '.st', 'aa', 'fxaa');
  s = await stored(page);
  check('Hub: Kantenglättung FXAA als Abweichung gespeichert', s.gfx && s.gfx.aa === 'fxaa', JSON.stringify(s.gfx));
  const custom = await page.$eval('.st [data-gx] [data-gx-saved]', (e) => e.textContent);
  check('Hub: Wahl heißt BENUTZERDEFINIERT', /BENUTZERDEFINIERT|GESPEICHERT/.test(custom), custom);
  // Tastatur/Controller: Fokus bleibt nach dem Neuzeichnen auf demselben Knopf
  await page.focus('.st [data-gx] [data-gfx="set"][data-k="aa"][data-v="smaa"]');
  await page.keyboard.press('Enter');
  await sleep(200);
  const foc = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? `${a.dataset.gfx}:${a.dataset.k}:${a.dataset.v}` : ''; });
  check('Fokus bleibt nach Auswahl auf dem Knopf (Controller/Tastatur)', foc === 'set:aa:smaa', foc);
  // Controller-Einstellung im selben Bildschirm bleibt bedienbar
  const pad = page.locator('.st [data-set="pad.sens"][data-v="1.3"], .st [data-set="pad.sens"]').first();
  if (await pad.count()) { await pad.click().catch(() => {}); }
  const padOk = await page.evaluate(() => !!document.querySelector('.st [data-padst]'));
  check('Hub: CONTROLLER-Bereich vorhanden', padOk);
  await page.context().close();
}

// ---------------------------------------------------------------- 2. Desktop (?desktop=1): EXTREM, Flug, Bordmenü
{
  const page = await newPage(() => { try { localStorage.setItem('ls.settings', JSON.stringify({ quality: 'extreme' })); } catch { /* egal */ } });
  await page.goto(`${BASE}/?dev=hub&f=saturn&desktop=1`);
  await page.waitForSelector('.scr-hub', { timeout: 60000 });
  await page.locator('button[data-sec="einst"]').first().click();
  await page.waitForSelector('.st [data-gx]', { timeout: 10000 });
  const tiers = await page.$$eval('.st [data-gx] [data-gfx="preset"]', (b) => b.map((x) => x.dataset.v));
  check('Desktop: Stufe EXTREM wählbar', tiers.includes('extreme'), tiers.join(','));
  await gx(page, '.st', '[data-gfx="preset"][data-v="extreme"]');
  check('Desktop: EXTREM gespeichert', (await stored(page)).quality === 'extreme');
  await page.context().close();

  // Flug mit EXTREM (Einstellung im selben Browser-Profil: neue Seite mit gesetztem Speicher)
  const fp = await newPage(() => { try { if (!sessionStorage.getItem('gx-init')) { sessionStorage.setItem('gx-init', '1'); localStorage.setItem('ls.settings', JSON.stringify({ quality: 'extreme' })); } } catch { /* egal */ } });
  await fp.goto(`${BASE}/?dev=game&f=saturn&desktop=1`);
  const ready = await waitFor(fp, () => window.__ls && window.__ls.renderer && window.__ls.renderer.frame > 30 && window.__ls.world && window.__ls.world.player, null, 60000);
  check('Flug startet (desktop=1)', !!ready);
  const R = () => fp.evaluate(() => {
    const r = window.__ls.renderer, g = r.gfx.v, S = r.lights.sun.shadow;
    let tex = 0, texN = 0, meshy = 0;
    const bad = [];
    const seen = new Set();
    r.scene.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        if (!m || seen.has(m)) continue; seen.add(m);
        const t = m.map;
        if (t && t.isTexture && !t.isRenderTargetTexture && !t.isDataTexture && t.image && (t.image.width || t.image.videoWidth)) {
          texN++;
          if (t.anisotropy === r._aniso) tex++;
          else if (bad.length < 4) { let q = o; const path = []; while (q && path.length < 4) { path.push(q.name || q.type); q = q.parent; } bad.push(`${path.join('<')} ${t.anisotropy}×`); }
        }
      }
    });
    meshy = r.factory && r.factory.glb ? r.factory.glb.size : 0;
    return {
      tier: r.gfx.tier, quality: r.quality, custom: r.gfx.custom, aa: g.aa, ao: g.ao, aniso: r._aniso, shadows: g.shadows,
      shadowOn: r.gl.shadowMap.enabled, shadowSize: S.mapSize.x, chain: r.chain.describe(), post: r._post,
      ipr: r._ipr, opr: r._opr, basePR: r.basePR, up: r._upscaling, renderScale: g.renderScale, fpsCap: r.fpsCap,
      texOk: tex, texN, glb: meshy, bad,
    };
  });
  let st = await R();
  check('EXTREM im Flug: Stufe bleibt', st.tier === 4 && !st.custom, JSON.stringify({ tier: st.tier, q: st.quality }));
  check('EXTREM im Flug: Schatten 4096', st.shadowOn && st.shadowSize === 4096, String(st.shadowSize));
  check('EXTREM im Flug: Umgebungsverdeckung VOLL in der Kette', st.ao === 'ultra' && /AO/i.test(st.chain), st.chain);
  check('EXTREM im Flug: SMAA in der Kette', st.aa === 'smaa' && /SMAA/.test(st.chain), st.chain);
  check('EXTREM im Flug: 16× Anisotropie an allen Modell-Texturen', st.aniso >= 8 && st.texN > 0 && st.texOk === st.texN, `${st.texOk}/${st.texN} bei ${st.aniso}×, ${st.glb} GLB${st.bad.length ? ' · ' + st.bad.join(', ') : ''}`);

  // Bordmenü öffnen
  await fp.mouse.click(720, 450).catch(() => {});
  await fp.keyboard.press('Escape');
  const open = await waitFor(fp, () => { const m = document.querySelector('.mp'); return m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().width > 50; }, null, 5000);
  check('Bordmenü öffnet mit Esc', !!open);
  await fp.locator('.mp [data-act="tab"][data-tab="anzeige"]').click();
  await sleep(200);
  const menuGfx = await fp.evaluate(() => !!document.querySelector('.mp [data-pane="anzeige"].on [data-gx]'));
  check('Bordmenü ANZEIGE: GRAFIK-Bereich', menuGfx);
  const tabs = await fp.$$eval('.mp-tab', (b) => b.map((x) => x.dataset.tab));
  check('Bordmenü: Reiter STEUERUNG (Controller) neben ANZEIGE', tabs.includes('steuerung') && tabs.includes('anzeige'), tabs.join(','));
  const M = '.mp [data-pane="anzeige"]';

  // Kantenglättung
  await tab(fp, M, 'bild');
  await setV(fp, M, 'aa', 'fxaa');
  await sleep(400);
  st = await R();
  check('Bordmenü: FXAA wirkt (Kette ohne SMAA)', st.aa === 'fxaa' && !/SMAA/.test(st.chain) && st.custom, st.chain);
  // Anisotropie 2× → alle geladenen Modell-Texturen
  await setV(fp, M, 'aniso', '2');
  await sleep(400);
  st = await R();
  check('Bordmenü: Anisotropie 2× an allen Modell-Texturen (Meshy-Ladeweg)', st.aniso === 2 && st.texOk === st.texN && st.texN > 0, `${st.texOk}/${st.texN}${st.bad.length ? ' · ' + st.bad.join(', ') : ''}`);
  // neu nachgeladenes Modell (Ladeweg _need) bekommt den aktuellen Wert
  const late = await fp.evaluate(async () => {
    const r = window.__ls.renderer;
    const key = ['enemy:raider', 'enemy:jackal', 'enemy:larva', 'enemy:spiker', 'enemy:wal'].find((k) => !r.factory.glb.has(k)) || 'enemy:queen';
    r._need(key);
    const t0 = performance.now();
    while (!r.factory.glb.has(key) && performance.now() - t0 < 20000) await new Promise((res) => setTimeout(res, 200));
    const src = r.factory.glb.get(key);
    if (!src) return { key, ok: false, why: 'nicht geladen' };
    let n = 0, ok = 0;
    const root = src.scene || src.root || src;
    if (root && root.traverse) root.traverse((o) => { for (const m of [].concat(o.material || [])) { if (m && m.map) { n++; if (m.map.anisotropy === r._aniso) ok++; } } });
    return { key, n, ok, an: r._aniso };
  });
  check('Neu geladenes Meshy-Modell bekommt die gewählte Anisotropie', late && late.n > 0 && late.ok === late.n, JSON.stringify(late));
  // Auflösungsskalierung − (Stufenregler) und LS-Hochskalierung
  const ipr0 = st.ipr;
  for (let i = 0; i < 5; i++) await gx(fp, M, '[data-gfx="step"][data-k="renderScale"][data-d="-1"]');
  await setV(fp, M, 'upscale', 'ls');
  await sleep(600);
  st = await R();
  check('Bordmenü: Auflösungsskalierung senkt die Szenendichte', st.renderScale < 100 && st.ipr < ipr0 * 0.95, `${st.renderScale} %: ${ipr0.toFixed(2)} → ${st.ipr.toFixed(2)}`);
  check('Bordmenü: LS-Hochskalierung rechnet auf Ausgabedichte hoch', st.up && st.opr > st.ipr && /HOCH|LS|UPSCALE|FSR/i.test(st.chain), `${st.ipr.toFixed(2)} → ${st.opr.toFixed(2)} · ${st.chain}`);
  // Licht: Umgebungsverdeckung aus, Schatten aus
  await tab(fp, M, 'licht');
  await setV(fp, M, 'ao', 'off');
  await setV(fp, M, 'shadows', 'off');
  await sleep(2500); // Schatten: Neuaufbau
  st = await R();
  check('Bordmenü: Umgebungsverdeckung aus (Kette ohne AO)', st.ao === 'off' && !/\bAO\b/.test(st.chain), st.chain);
  check('Bordmenü: Schatten aus (Neuaufbau)', !st.shadowOn, String(st.shadowOn));
  // System: Bildrate 30 → gemessene Bildrate, Hinweis NEUSTART (APP)
  await tab(fp, M, 'system');
  const tag = await fp.$eval(`${M} [data-gx] .gx-row[data-k="fpsCap"] .gx-tag`, (e) => e.textContent).catch(() => '');
  check('Bildratenbegrenzung zeigt NEUSTART (APP) in der Desktop-App', /NEUSTART \(APP\)/.test(tag), tag);
  await setV(fp, M, 'fpsCap', '30');
  await fp.keyboard.press('Escape');
  await sleep(1500);
  const fps = await fp.evaluate(() => new Promise((res) => {
    const r = window.__ls.renderer, f0 = r.frame, t0 = performance.now();
    setTimeout(() => res(Math.round((r.frame - f0) / ((performance.now() - t0) / 1000))), 3000);
  }));
  check('Bildratenbegrenzer 30: Renderer zeichnet ≈ 30 Bilder/s', fps >= 22 && fps <= 34, `${fps} B/s`);
  // Stufe zurück auf EXTREM setzt Stufen-Abweichungen zurück, System-Werte (Bildrate) bleiben
  await fp.keyboard.press('Escape');
  await sleep(300);
  await tab(fp, M, 'preset');
  await gx(fp, M, '[data-gfx="preset"][data-v="extreme"]');
  await sleep(2500);
  st = await R();
  const s2 = await stored(fp);
  check('Stufe EXTREM wählen: Bildwerte zurück, Bildrate bleibt', st.tier === 4 && !st.custom && st.aa === 'smaa' && st.shadowSize === 4096 && s2.gfx && s2.gfx.fpsCap === 30, JSON.stringify(s2.gfx));
  await fp.context().close();
}

// ---------------------------------------------------------------- 3. Desktop-Hülle: setGraphics
{
  const page = await newPage(() => {
    window.__gfxCalls = [];
    window.lsDesktop = Object.freeze({ platform: 'mac', version: 'test', unlimitedFps: false, setGraphics: (g) => { window.__gfxCalls.push(g); return Promise.resolve({}); }, fullscreen: () => Promise.resolve(false) });
  });
  await page.goto(`${BASE}/?dev=hub&f=saturn`);
  await page.waitForSelector('.scr-hub', { timeout: 60000 });
  const first = await page.evaluate(() => window.__gfxCalls.slice());
  check('Hülle: setGraphics beim Start mit { fpsCap, renderScale }', first.length >= 1 && 'fpsCap' in first[0] && 'renderScale' in first[0], JSON.stringify(first));
  await page.locator('button[data-sec="einst"]').first().click();
  await page.waitForSelector('.st [data-gx]', { timeout: 10000 });
  const tiers = await page.$$eval('.st [data-gx] [data-gfx="preset"]', (b) => b.map((x) => x.dataset.v));
  check('Hülle: window.lsDesktop schaltet EXTREM frei', tiers.includes('extreme'), tiers.join(','));
  await tab(page, '.st', 'system');
  await setV(page, '.st', 'fpsCap', '60');
  await setV(page, '.st', 'fpsCap', '0');
  const calls = await page.evaluate(() => window.__gfxCalls.map((g) => g.fpsCap));
  check('Hülle: setGraphics meldet 60 und UNBEGRENZT (0)', calls.includes(60) && calls[calls.length - 1] === 0, calls.join(','));
  await page.context().close();
}

await browser.close();
const real = errors.filter((t) => !/favicon|DevTools/.test(t));
check('Keine Konsolenfehler', real.length === 0, real.slice(0, 4).join(' | '));
console.log(`\n${total - failed}/${total} Prüfungen bestanden · Konsolenfehler: ${real.length}`);
process.exit(failed ? 1 : 0);
