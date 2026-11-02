// Gemeinsame Prüfschritte für die App-Tests (Mac-App über playwright-core, Web-Build im Browser).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

/** Öffentliche Supabase-Adresse und öffentlichen Schlüssel aus coop.js lesen (nichts doppelt im Repository). */
export function realtimeConfig() {
  const src = fs.readFileSync(path.join(ROOT, 'Code', 'src', 'net', 'coop.js'), 'utf8');
  const url = /const URL = '([^']+)'/.exec(src)?.[1];
  const key = /const KEY = '([^']+)'/.exec(src)?.[1];
  if (!url || !key) throw new Error('Supabase-Adresse/Schlüssel in coop.js nicht gefunden');
  return { url, key };
}

/**
 * Im Seitenkontext: Realtime-WebSocket öffnen, Kanal betreten, eine Broadcast-Nachricht an sich selbst senden
 * und empfangen (wie Koop, nur kurz). Liefert { ok, join, echo, ms, origin } oder { ok:false, error }.
 */
export async function realtimeCheck(page, cfg) {
  return page.evaluate(realtimeInPage, cfg);
}

/** Seitenseitige Realtime-Prüfung (auch als Text in Skripte für iOS/Android eingebettet). */
export async function realtimeInPage({ url, key }) {
  const t0 = performance.now();
  const topic = 'realtime:ls-apptest-' + Math.random().toString(36).slice(2, 8);
  const ws = new WebSocket(url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0');
  return await new Promise((resolve) => {
    const out = { ok: false, join: false, echo: false, origin: location.origin };
    const done = (extra = {}) => { clearTimeout(timer); try { ws.close(); } catch { /* egal */ } resolve({ ...out, ...extra, ms: Math.round(performance.now() - t0) }); };
    const timer = setTimeout(() => done({ error: 'Zeitüberschreitung' }), 12000);
    ws.onerror = () => done({ error: 'WebSocket-Fehler' });
    ws.onopen = () => ws.send(JSON.stringify({ topic, event: 'phx_join', ref: '1', join_ref: '1', payload: { config: { broadcast: { self: true, ack: false }, presence: { key: '' }, private: false } } }));
    ws.onmessage = (m) => {
      let d; try { d = JSON.parse(m.data); } catch { return; }
      if (d.event === 'phx_reply' && d.ref === '1') {
        out.join = d.payload && d.payload.status === 'ok';
        if (!out.join) { done({ error: 'Beitritt abgelehnt: ' + JSON.stringify(d.payload).slice(0, 200) }); return; }
        ws.send(JSON.stringify({ topic, event: 'broadcast', ref: '2', join_ref: '1', payload: { type: 'broadcast', event: 'ping', payload: { t: Date.now() } } }));
      }
      if (d.event === 'broadcast' && d.payload && d.payload.event === 'ping') { out.echo = true; out.ok = true; done(); }
    };
  });
}

/**
 * Prüfskript als Text für App-Hüllen ohne Playwright (iOS-Simulator über den Debug-Haken, Android über WebView-Debugging):
 * Systemstart → Anmeldung → Fraktion → Hub, dann Hülle, Service Worker, WebGL, sichere Bereiche und Realtime.
 * Ergebnis landet in window.__lsTestResult (fertig: true am Ende).
 */
export function ablaufSkript({ url, key, callsign = 'AppTest' }) {
  return `(async () => {
  const R = window.__lsTestResult = { fertig: false, schritte: [] };
  const log = (t) => R.schritte.push(Math.round(performance.now()) + ' ' + t);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const wait = async (sel, ms) => { const t = Date.now(); for (;;) { const el = document.querySelector(sel); if (el) return el; if (Date.now() - t > ms) throw new Error('fehlt: ' + sel); await sleep(200); } };
  const realtime = ${realtimeInPage.toString()};
  try {
    R.origin = location.origin;
    R.capacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    R.plattform = window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : '';
    try { R.serviceWorker = navigator.serviceWorker ? String((await navigator.serviceWorker.getRegistrations()).length) : 'keine API'; } catch (e) { R.serviceWorker = 'nicht möglich (' + e.name + ')'; }
    await wait('.scr-boot, .scr-login', 60000); log('Systemstart/Anmeldung');
    const boot = document.querySelector('.scr-boot');
    if (boot) { await sleep(800); boot.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }
    const inp = await wait('#sc-callsign', 30000); log('Anmeldung');
    inp.value = ${JSON.stringify(callsign)}; inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.form.requestSubmit();
    const next = await wait('.scr-faction, .scr-hub', 30000);
    if (next.classList.contains('scr-faction')) { log('Fraktionswahl'); await sleep(600); document.querySelector('.fs-go').click(); }
    await wait('.scr-hub', 60000); log('Hub');
    if (document.activeElement) document.activeElement.blur();
    { // 3D-Bühne des Hubs: warten, bis der Ladebalken weg ist (höchstens 120 s)
      const t = Date.now(); const busy = () => document.querySelector('[data-load]:not(.is-done)');
      while (busy() && Date.now() - t < 120000) await sleep(500);
      const b = busy();
      R.szene = b ? 'nicht fertig nach 120 s: ' + ((b.querySelector('[data-lpct]') || {}).textContent || '') + ' ' + ((b.querySelector('[data-llog]') || {}).innerText || '').replace(/\s+/g, ' ') : 'fertig nach ' + (Date.now() - t) + ' ms';
      log('Szene ' + (b ? 'NICHT fertig' : 'fertig'));
    }
    await sleep(1500);
    const ib = document.querySelector('[data-install]');
    R.installKnopfVersteckt = !ib || getComputedStyle(ib).display === 'none';
    R.viewport = [innerWidth, innerHeight, devicePixelRatio];
    const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:env(safe-area-inset-left);right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);top:env(safe-area-inset-top)';
    document.body.appendChild(probe); const cs = getComputedStyle(probe); R.safeArea = [cs.top, cs.right, cs.bottom, cs.left].join(' '); probe.remove();
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2');
    R.webgl = gl ? ((gl.getExtension('WEBGL_debug_renderer_info') && gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)) || 'webgl2') : null;
    R.realtime = await realtime(${JSON.stringify({ url, key })}); log('Realtime ' + (R.realtime.ok ? 'ok' : 'FEHLER'));
  } catch (e) { R.fehler = String(e && e.stack || e); }
  R.fertig = true;
})();`;
}

/** Vom Systemstart bis zur Mission Control (Hub): Rufname anlegen, Fraktion wählen. */
export async function bisZumHub(page, { callsign = 'AppTest', log = console.log } = {}) {
  await page.waitForSelector('.scr-boot, .scr-login', { timeout: 60000 });
  log('Systemstart sichtbar');
  if (await page.$('.scr-boot')) { await page.waitForTimeout(800); await page.mouse.click(400, 300); }
  await page.waitForSelector('#sc-callsign', { timeout: 30000 });
  log('Anmeldung sichtbar');
  await page.fill('#sc-callsign', callsign);
  await page.press('#sc-callsign', 'Enter');
  const next = await page.waitForSelector('.scr-faction, .scr-hub', { timeout: 30000 });
  if (await next.evaluate((el) => el.classList.contains('scr-faction'))) {
    log('Fraktionswahl sichtbar');
    await page.waitForTimeout(600);
    await page.click('.fs-go');
  }
  await page.waitForSelector('.scr-hub', { timeout: 60000 });
  log('Mission Control (Hub) sichtbar');
  await page.waitForTimeout(2500); // 3D-Bühne laden lassen
}
