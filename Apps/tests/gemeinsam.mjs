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
export async function realtimeCheck(page, { url, key }) {
  return page.evaluate(async ({ url, key }) => {
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
          if (!out.join) return done({ error: 'Beitritt abgelehnt: ' + JSON.stringify(d.payload).slice(0, 200) });
          ws.send(JSON.stringify({ topic, event: 'broadcast', ref: '2', join_ref: '1', payload: { type: 'broadcast', event: 'ping', payload: { t: Date.now() } } }));
        }
        if (d.event === 'broadcast' && d.payload && d.payload.event === 'ping') { out.echo = true; out.ok = true; done(); }
      };
    });
  }, { url, key });
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
