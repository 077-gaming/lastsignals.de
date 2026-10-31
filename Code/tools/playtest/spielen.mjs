#!/usr/bin/env node
// Test-Pilot für LAST SIGNALS: spielt das Spiel automatisch im installierten Google Chrome und schreibt einen Bericht.
//
//   node tools/playtest/spielen.mjs [--minuten 3] [--fraktion saturn|europa|eris|alle] [--qualitaet hoch|auto]
//                                   [--url http://localhost:5173] [--ohne-modelle]
//
// Voraussetzung: Entwicklungsserver läuft (npm run dev, Port 5173). Es wird kein Browser heruntergeladen
// (playwright-core + channel 'chrome'). Jede Fraktion läuft in einem frischen Browser-Profil (neuer Pilot
// „Dev-<fraktion>“, Startausrüstung), die eigenen Spielstände im normalen Chrome bleiben unberührt.
// Ergebnis: tools/playtest/berichte/<zeit>.json + .md, Bilder in tools/playtest/berichte/<zeit>/.
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const MINUTES = Math.max(0.5, Number(String(arg('minuten', '3')).replace(',', '.')) || 3);
const FR = arg('fraktion', 'saturn');
const FACTIONS = FR === 'alle' ? ['europa', 'saturn', 'eris'] : [FR];
const QUALITY = arg('qualitaet', 'hoch');
const BASE = arg('url', 'http://localhost:5173');
const MODELS = !flag('ohne-modelle');
const MAX_MOMENTS = 10;

const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
};
const ZEIT = stamp();
const OUT = path.join(HERE, 'berichte');
const IMG = path.join(OUT, ZEIT);
const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runFaction(faction) {
  const log = (...a) => console.log(`[${faction}]`, ...a);
  const browser = await chromium.launch({
    channel: 'chrome', headless: false,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--window-size=1440,1000'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  if (QUALITY !== 'auto') {
    const q = { hoch: 'high', mittel: 'medium', niedrig: 'low', ultra: 'ultra' }[QUALITY] || QUALITY;
    // eigene Wahl (nicht automatisch): Stufe fest, nur die Absicherung im Flug darf für die Sitzung senken
    await ctx.addInitScript((qq) => {
      try {
        if (!localStorage.getItem('ls.settings')) {
          localStorage.setItem('ls.settings', JSON.stringify({ quality: qq, hudScale: 1, reducedMotion: false, rev: 2 }));
          localStorage.setItem('ls.qauto', JSON.stringify({ v: 2, quality: qq === 'ultra' ? 'high' : 'ultra', gpu: 'test-pilot' }));
        }
      } catch { /* egal */ }
    }, q);
  }
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') consoleMsgs.push({ art: t === 'error' ? 'Fehler' : 'Warnung', text: m.text().slice(0, 400), ort: m.location()?.url ? `${m.location().url.replace(BASE, '')}:${m.location().lineNumber}` : '' });
  });
  page.on('pageerror', (e) => consoleMsgs.push({ art: 'Ausnahme', text: String(e.stack || e).slice(0, 600), ort: '' }));
  page.on('requestfailed', (r) => {
    const err = r.failure()?.errorText || '';
    consoleMsgs.push({ art: /ERR_ABORTED/.test(err) ? 'Hinweis' : 'Anfrage fehlgeschlagen', text: `${r.method()} ${r.url().replace(BASE, '')} ${/ERR_ABORTED/.test(err) ? 'abgebrochen' : err}`, ort: '' });
  });
  page.on('response', (r) => { if (r.status() >= 400) consoleMsgs.push({ art: 'Hinweis', text: `${r.request().method()} ${r.url().replace(BASE, '')} → HTTP ${r.status()}`, ort: '' }); });

  const shots = [];
  let moments = 0;
  const takeShots = async () => {
    const reqs = await page.evaluate(() => (window.__pt ? window.__pt.takeRequests() : [])).catch(() => []);
    for (const q of reqs) {
      const isMoment = q.kind === 'moment';
      if (isMoment && moments >= MAX_MOMENTS) { if (q.wait) await page.evaluate((id) => window.__pt.shotDone(id, null), q.id); continue; }
      const name = `${faction}-${String(shots.length + 1).padStart(2, '0')}-${q.slug}.png`;
      const file = path.join(IMG, name);
      try {
        await page.evaluate(() => window.__pt.capture(true));
        await page.screenshot({ path: file, scale: 'css' });
      } finally {
        await page.evaluate(() => window.__pt.capture(false)).catch(() => {});
      }
      if (isMoment) moments++;
      const rel = path.join(ZEIT, name);
      shots.push({ datei: rel, grund: q.reason, zeitS: q.t, art: q.kind });
      if (q.wait) await page.evaluate(([id, f]) => window.__pt.shotDone(id, f), [q.id, rel]);
    }
  };

  const url = `${BASE}/?dev=game&f=${faction}`;
  log('öffne', url);
  const tLoad = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ls && window.__ls.world && window.__ls.renderer, null, { timeout: 90000 });
  const ladezeitS = (Date.now() - tLoad) / 1000;
  await page.addScriptTag({ path: path.join(HERE, 'pilot-im-browser.js') });
  await sleep(500);
  const info = await page.evaluate((o) => window.__pt.start(o), { durS: MINUTES * 60 });
  log('Start', JSON.stringify(info));
  let lastLog = 0;
  for (;;) {
    await sleep(250);
    await takeShots();
    const st = await page.evaluate(() => window.__pt.state());
    if (Date.now() - lastLog > 10000) { lastLog = Date.now(); log(`${st.t} s · ${st.phase} · ${st.action} · Hülle ${st.hp} · ${st.sector}`); }
    if (st.done) break;
  }
  await takeShots();
  await page.evaluate(() => window.__pt.capture(true));
  await page.screenshot({ path: path.join(IMG, `${faction}-ende.png`), scale: 'css' });
  await page.evaluate(() => window.__pt.capture(false));
  if (moments < MAX_MOMENTS) { shots.push({ datei: path.join(ZEIT, `${faction}-ende.png`), grund: 'Ende der Spielzeit', zeitS: MINUTES * 60, art: 'moment' }); moments++; }
  if (MODELS) {
    log('Modellprüfung (Ausrichtung) …');
    const pr = page.evaluate(() => window.__pt.modelCheck());
    let done = false;
    pr.then(() => { done = true; }, () => { done = true; });
    while (!done) { await sleep(200); await takeShots(); }
    await pr;
    await takeShots();
  }
  const rep = await page.evaluate(() => window.__pt.report());
  rep.ladezeitS = Math.round(ladezeitS * 10) / 10;
  rep.konsole = consoleMsgs;
  rep.bilderDateien = shots;
  rep.start = info;
  await browser.close();
  return rep;
}

// ───────── Bericht als Markdown ─────────
function ms(s) { return s ? `${fmt(s.mittel, 1)} / ${fmt(s.p95, 1)} / ${fmt(s.max, 1)}` : '–'; }
function mdFaction(r) {
  const L = [];
  const b = r.bilder, k = r.kampf, g = r.gegner;
  L.push(`## ${r.faction.toUpperCase()} · ${fmt(r.dauerSpielS)} s gespielt · ${r.startSektor} → ${r.endSektor}`);
  L.push('');
  L.push(`Qualität: Stufe ${['NIEDRIG', 'MITTEL', 'HOCH', 'ULTRA'][r.qualitaet.stufe] ?? r.qualitaet.stufe}, Auflösungsfaktor ${fmt(r.qualitaet.aufloesungsFaktor, 2)}, Pixeldichte ${fmt(r.qualitaet.pixeldichte, 2)}, Puffer ${r.qualitaet.puffer}, GPU-Zeitmessung ${r.qualitaet.gpuTimer ? 'ja' : 'nein'}. Ladezeit bis Flug ${fmt(r.ladezeitS, 1)} s.`);
  if (r.qualitaet.meldungen.length) L.push(`Grafik-Absicherung: ${r.qualitaet.meldungen.map((m) => `${fmt(m.t, 1)} s „${m.text}“`).join('; ')}`);
  L.push('');
  L.push('### Bildzeiten (Mittel / p95 / längste, ms)');
  L.push('| Abschnitt | Bilder | Bilder/s | Bildabstand | CPU-Rechenzeit | GPU | Bildzeit max(CPU,GPU) | > 20 ms | > 25 ms | > 33 ms |');
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const [name, key] of [['Gesamt', 'gesamt'], ['Kampf', 'kampf'], ['Ruhe', 'ruhe'], ['Erster Kampf (10 s)', 'ersterKampf'], ['Angedockt', 'angedockt']]) {
    const x = b[key];
    L.push(`| ${name} | ${fmt(x.bilder)} | ${fmt(x.fps, 1)} | ${ms(x.bildabstandMs)} | ${ms(x.rechenzeitCpuMs)} | ${ms(x.gpuMs)} | ${ms(x.bildzeitMs)} | ${fmt(x.ueber20ms)} | ${fmt(x.ueber25ms)} | ${fmt(x.ueber33ms)} |`);
  }
  L.push('');
  if (r.laengsteBilder.length) {
    L.push('Längste Bilder mit Situation:');
    for (const f of r.laengsteBilder.slice(0, 8)) {
      const ev = Object.entries(f.zuletzt).map(([a, n]) => `${a}×${n}`).join(', ') || 'nichts';
      L.push(`- ${fmt(f.t, 1)} s: Bildabstand ${fmt(f.bildabstandMs, 1)} ms, CPU ${fmt(f.rechenzeitMs, 1)} ms, GPU ${fmt(f.gpuMs, 1)} ms · ${f.aktion || f.phase} · ${f.sektor}, ${f.gegnerNah} Gegner nah, ${f.angreifer} greifen an${f.ereignis ? ', Ereignis ' + f.ereignis : ''} · zuletzt: ${ev} · ${fmt(f.drawCalls)} Draw Calls`);
    }
    L.push('');
  }
  L.push('### Kampfwerte');
  L.push(`Schüsse ${fmt(k.spielerSchuesse)} (Treffer ${fmt(k.trefferquoteProzent, 1)} %), Raketen ${fmt(k.raketen)}, Tode ${fmt(k.tode)}${k.todErzwungen ? ` (Todestest nachgeholfen: Stufe ${k.todErzwungen})` : ''}.`);
  L.push(`Eingesteckt: ${fmt(k.eingesteckt.huelle)} Hülle + ${fmt(k.eingesteckt.schild)} Schild · je Quelle: ${Object.entries(k.eingesteckt.jeQuelle).map(([a, n]) => `${a} ${fmt(n)}`).join(', ') || '–'}.`);
  L.push(`Beute gesamt: ${fmt(k.beute.credits)} Credits, ${fmt(k.beute.tritium)} Tritium, ${fmt(k.beute.xp)} Erfahrung, ${fmt(k.beute.honor)} Ehre.`);
  L.push(`Je Minute: **${fmt(k.beuteJeMinute.credits)} Credits, ${fmt(k.beuteJeMinute.tritium, 1)} Tritium, ${fmt(k.beuteJeMinute.erfahrung)} Erfahrung, ${fmt(k.beuteJeMinute.ehre, 1)} Ehre**.`);
  L.push(`Profil: ${fmt(k.profilVorher.credits)} → ${fmt(k.profilNachher.credits)} Credits, ${fmt(k.profilVorher.tritium)} → ${fmt(k.profilNachher.tritium)} Tritium, Stufe ${k.profilVorher.level} → ${k.profilNachher.level}.`);
  L.push('');
  L.push('| Gegner | Abschüsse | Zeit bis Abschuss Mittel / Median / max (s) |');
  L.push('|---|---|---|');
  for (const [t, s] of Object.entries(k.zeitBisAbschussS)) L.push(`| ${t} | ${s.abschuesse} | ${fmt(s.mittel, 1)} / ${fmt(s.median, 1)} / ${fmt(s.max, 1)} |`);
  L.push('');
  L.push(`Munition (Versuche/erfolgreich/Vorrat danach): ${Object.entries(k.munitionWechsel).map(([a, x]) => `${a} ${x.versuche}/${x.ok}/${fmt(x.vorrat)}`).join(' · ') || '–'}. Schüsse je Munition: ${Object.entries(k.schuesseJeMunition).map(([a, n]) => `${a} ${fmt(n)}`).join(', ')}.`);
  L.push(`Schussrichtung zur Schiffsnase: Mittel ${fmt(k.schussWinkelZurNase.mittel, 1)}°, p95 ${fmt(k.schussWinkelZurNase.p95, 1)}°, ${fmt(k.schussWinkelZurNase.ueber45Grad)} Schüsse über 45°, ${fmt(k.schussWinkelZurNase.ueber90Grad)} über 90° (Laser feuern dann seitlich/rückwärts aus den Mündungen).`);
  L.push(`Einkäufe: ${k.einkaeufe.map((e) => `${e.was} ${e.ok ? `ok (−${fmt(e.creditsAusgegeben)} Credits, −${fmt(e.tritiumAusgegeben)} Tritium)` : `abgelehnt: ${e.grund}`}`).join(' · ') || 'keine'}.`);
  if (k.aufrufDauerMs && k.aufrufDauerMs.andocken != null) L.push(`Dauer der Aufrufe: Andocken ${fmt(k.aufrufDauerMs.andocken, 1)} ms, 6 Einkäufe ${fmt(k.aufrufDauerMs.einkaufen, 1)} ms, Abdocken ${fmt(k.aufrufDauerMs.abdocken, 1)} ms.`);
  L.push(`Reparaturen: ${k.reparaturen.map((x) => `${fmt(x.t, 1)} s ${x.wo} ${x.ok ? 'ok' : 'fehlgeschlagen'} (${x.kosten})`).join(' · ') || 'keine'}. Sprünge: ${k.spruenge.map((x) => `${fmt(x.t, 1)} s → ${x.id}`).join(', ') || 'keine'}. Stufenaufstiege: ${k.stufenAufstiege.map((x) => `${fmt(x.t, 1)} s → ${x.level}`).join(', ') || 'keine'}.`);
  L.push('');
  L.push('### Gegnerverhalten');
  L.push('| Typ | Stichproben | Zeitanteile | Abstand zum Spieler im Angriff (Mittel/Median/min m) | Ausweichen | Angriffsbeginn selbst/Sicht/mitgezogen | Flucht | übereinander | Schüsse/Treffer |');
  L.push('|---|---|---|---|---|---|---|---|---|');
  for (const [t, x] of Object.entries(g.verhalten)) {
    const sh = Object.entries(x.anteilProzent).map(([a, p]) => `${a} ${fmt(p, 1)} %`).join(', ');
    const d = x.abstandZumSpieler;
    L.push(`| ${t} | ${fmt(x.stichproben)} | ${sh} | ${d ? `${fmt(d.mittel)} / ${fmt(d.median)} / ${fmt(d.min)}` : '–'} | ${x.ausweichmanoever} | ${x.angriffsbeginn.selbstGetroffen}/${x.angriffsbeginn.eigeneSicht}/${x.angriffsbeginn.mitgezogenHilfe} | ${x.fluchten} | ${fmt(x.uebereinanderAnteilProzent, 1)} % | ${x.schuesse}/${x.treffer} |`);
  }
  L.push('');
  L.push(`Übereinander (Abstand < 0,75 × Summe der Trefferradien): in ${fmt(g.uebereinander.anteilProzent, 1)} % der Stichproben, Vorfälle ${Object.entries(g.uebereinander.vorfaelleJeTyp).map(([a, n]) => `${a} ${n}`).join(', ') || 'keine'}, höchstens ${g.uebereinander.hoechstensGleichzeitig} Paare gleichzeitig. Hilfe-/Verstärkungsmeldungen: ${g.hilfeMeldungen}, vorübergehend erzeugte Gegner: ${g.vorübergehendErzeugt}.`);
  L.push('');
  const A = r.ausrichtung;
  L.push('### Ausrichtung der Modelle');
  if (!A) L.push('nicht geprüft');
  else {
    if (A.fehler) L.push(`Fehler in der Prüfung: ${A.fehler}`);
    L.push('| Modell | Art | Bug laut Rumpfform (°) | Form eindeutig | Mündungen vor Mitte | Laufrichtung (°) | Triebwerke hinter Mitte | Schweif (°) | Flug im Spiel (Median/p95 °) | Flug in Szene (°) | Befund · Hinweise |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const [key, m] of Object.entries(A.modelle)) {
      const fl = A.imFlug[key];
      const sz = A.imFlug[key + ':szene'];
      const mz = (m.muendungen || []).map((q) => fmt(q.vorMitte, 2)).join(' ') || '–';
      const ld = (m.muendungen || []).map((q) => q.laufrichtungGrad == null ? '?' : fmt(q.laufrichtungGrad, 0)).join(' ') || '–';
      const tw = (m.triebwerke || []).map((q) => fmt(q.hinterMitte, 2)).join(' ') || ((m.schweife || []).map((q) => fmt(q.hinterMitte, 2)).join(' ') || '–');
      const sw = (m.triebwerke || []).concat(m.schweife || []).map((q) => q.schweifAbweichungGrad == null ? '?' : fmt(q.schweifAbweichungGrad, 0)).join(' ') || '–';
      L.push(`| ${key} | ${m.art} | ${m.form ? fmt(m.form.bugWinkelGrad, 1) : '–'} | ${m.formEindeutig ? 'ja' : 'nein'} (Achse ${m.form ? fmt(m.form.sicherheitAchse, 2) : '–'}, Verjüngung ${m.form ? fmt(m.form.verjuengung, 2) : '–'}) | ${mz} | ${ld} | ${tw} | ${sw} | ${fl ? `${fmt(fl.median, 1)} / ${fmt(fl.p95, 1)} (${fl.n})` : '–'} | ${sz ? (sz.dreht ? 'dreht' : fmt(sz.abweichungGrad, 1)) : '–'} | ${m.dreht ? 'dreht sich ständig (gewollt), keine Bugprüfung' : m.rundum ? 'rundum geformt, kein eindeutiger Bug' : m.ok ? 'ok' : (m.befunde || []).join('; ')} · ${(m.hinweise || []).map((c) => `${c.name} ${fmt(c.winkelGrad, 0)}°`).join(', ') || 'nur Rumpfform'} |`);
    }
    L.push('');
    if (A.abweichungen.length) {
      L.push('Abweichungen:');
      for (const a of A.abweichungen) L.push(`- **${a.modell}**: ${a.abweichungGrad != null ? fmt(a.abweichungGrad, 1) + '°' : ''} ${a.befunde.join('; ')}${a.bild ? ` · Bild: ${a.bild}` : ''}`);
    } else L.push('Keine Abweichungen über 20°: Bug zeigt bei allen Modellen in Flugrichtung, Mündungen vorn, Triebwerke und Schweif hinten.');
  }
  L.push('');
  L.push('### Konsole');
  const kerr = r.konsole.filter((c) => c.art !== 'Warnung' && c.art !== 'Hinweis');
  const kwarn = r.konsole.filter((c) => c.art === 'Warnung');
  const khint = r.konsole.filter((c) => c.art === 'Hinweis');
  L.push(`${kerr.length} Fehler, ${kwarn.length} Warnungen, ${khint.length} Hinweise (Netz).`);
  const group = (list) => { const m = new Map(); for (const c of list) { const k = `${c.art}: ${c.text}`; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].slice(0, 15); };
  for (const [t, n] of group(kerr)) L.push(`- ${n}× ${t}`);
  for (const [t, n] of group(kwarn)) L.push(`- ${n}× ${t}`);
  for (const [t, n] of group(khint)) L.push(`- ${n}× ${t}`);
  L.push('');
  L.push('### Bilder');
  for (const s of r.bilderDateien) L.push(`- ${fmt(s.zeitS, 1)} s · ${s.grund}: ![${s.grund}](${s.datei})`);
  L.push('');
  return L.join('\n');
}

async function main() {
  await fs.mkdir(IMG, { recursive: true });
  try { const r = await fetch(BASE + '/'); if (!r.ok) throw new Error('HTTP ' + r.status); }
  catch (e) { console.error(`Entwicklungsserver nicht erreichbar (${BASE}): ${e.message}. Zuerst „npm run dev“ starten.`); process.exit(2); }
  const results = [];
  for (const f of FACTIONS) {
    try { results.push(await runFaction(f)); }
    catch (e) { console.error(`[${f}] abgebrochen:`, e); results.push({ faction: f, abgebrochen: String(e.stack || e) }); }
  }
  const meta = { zeit: ZEIT, minuten: MINUTES, fraktionen: FACTIONS, qualitaet: QUALITY, url: BASE, fenster: '1440x900 @2x', browser: 'Google Chrome (installiert, sichtbar)' };
  await fs.writeFile(path.join(OUT, `${ZEIT}.json`), JSON.stringify({ meta, ergebnisse: results }, null, 2));
  const md = [`# Test-Pilot · ${ZEIT}`, '', `${FACTIONS.join(', ')} · je ${fmt(MINUTES, 1)} min · Qualität ${QUALITY} · Fenster 1440×900 (Pixeldichte 2) · Chrome sichtbar`, '',
    'Ziele: Mac Qualität HOCH im Kampf unter 8 ms je Bild · normaler Laptop Full HD MITTEL mindestens 60 Bilder/s · erster Kampf ohne Hänger über 25 ms.', ''];
  for (const r of results) md.push(r.abgebrochen ? `## ${r.faction.toUpperCase()}\n\nAbgebrochen: ${r.abgebrochen}\n` : mdFaction(r));
  await fs.writeFile(path.join(OUT, `${ZEIT}.md`), md.join('\n'));
  console.log('Bericht:', path.join(OUT, `${ZEIT}.md`));
}
main().catch((e) => { console.error(e); process.exit(1); });
