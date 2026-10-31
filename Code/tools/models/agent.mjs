#!/usr/bin/env node
// Modell-Agent: optimiert Schiffsmodelle technisch SELBSTÄNDIG – aber nur mit Beweis.
//   1. rendert das Original aus 4 Blickwinkeln (tools/models/pruefstand.html, läuft über den Vite-Dev-Server)
//   2. versucht Optimierungsstufen von mutig bis vorsichtig (Bereinigen, Dreiecke reduzieren, teure Material-
//      Erweiterungen entfernen, unnötige Doppelseitigkeit aus)
//   3. rendert jede Stufe genauso und vergleicht Pixel für Pixel mit dem Original
//   4. übernimmt die mutigste Stufe, die optisch praktisch gleich bleibt – sonst bleibt das Original
// Aufruf:  node tools/models/agent.mjs [--url http://127.0.0.1:5191] [--write] [datei.glb …]
//          ohne --write nur Bericht (nichts wird überschrieben). Bericht: tools/models/agent-bericht.json + Bilder.
// Braucht: npm i -D @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer pngjs playwright-core
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, meshopt, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('url', 'http://127.0.0.1:5191');
const WRITE = args.includes('--write');
const files = args.filter((a) => a.endsWith('.glb'));
const MODELS = path.join(ROOT, 'public/models');
const TMP = path.join(ROOT, 'public/_pruef');
const OUT = path.join(HERE, 'agent-bilder');
// Prüfschwelle: mittlere Abweichung (0–255) und Anteil stark abweichender Pixel (> 40) über alle 4 Ansichten
const MAX_MEAN = Number(opt('mean', '1.6')), MAX_BAD = Number(opt('bad', '0.006'));

const LEVELS = [
  // Von mutig bis vorsichtig; die erste Stufe, die den Bildvergleich besteht, wird übernommen.
  // Material-Vereinfachung (Klarlack/Specular entfernen) ist bewusst NICHT dabei: im Test sichtbar anderer Glanz.
  { name: 'stark+einseitig', simplify: { ratio: 0.35, error: 0.001 }, mats: false, single: true },
  { name: 'mittel+einseitig', simplify: { ratio: 0.5, error: 0.0005 }, mats: false, single: true },
  { name: 'leicht+einseitig', simplify: { ratio: 0.7, error: 0.00025 }, mats: false, single: true },
  { name: 'leicht', simplify: { ratio: 0.7, error: 0.00025 }, mats: false, single: false },
  { name: 'nur-bereinigen', simplify: null, mats: false, single: false },
];

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

async function optimize(src, dst, L) {
  const doc = await io.read(src);
  const ops = [dedup(), weld()];
  if (L.simplify) ops.push(simplify({ simplifier: MeshoptSimplifier, ratio: L.simplify.ratio, error: L.simplify.error, lockBorder: true }));
  ops.push(prune());
  await doc.transform(...ops);
  if (L.mats) {
    // Klarlack/Specular: teurer Physical-Shader, kaum sichtbarer Unterschied im Spiel → Standard-Material
    for (const e of doc.getRoot().listExtensionsUsed()) if (/clearcoat|specular$/.test(e.extensionName)) e.dispose();
  }
  if (L.single) for (const m of doc.getRoot().listMaterials()) if (m.getAlphaMode() === 'OPAQUE') m.setDoubleSided(false);
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(dst, doc);
}
function diff(a, b) {
  const A = PNG.sync.read(Buffer.from(a.split(',')[1], 'base64')), B = PNG.sync.read(Buffer.from(b.split(',')[1], 'base64'));
  let sum = 0, bad = 0; const n = A.width * A.height;
  for (let i = 0; i < A.data.length; i += 4) {
    const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
    sum += d; if (d > 40) bad++;
  }
  return { mean: sum / n, bad: bad / n };
}

const pw = await import(process.env.PLAYWRIGHT || 'playwright');
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto(BASE + '/tools/models/pruefstand.html');
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const render = (url) => page.evaluate((u) => window.renderModel(u), url);

fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const report = [];
for (const f of files) {
  const src = path.join(MODELS, f);
  const kb0 = fs.statSync(src).size / 1024;
  const ref = await render('/models/' + f);
  let chosen = null;
  const tries = [];
  for (const L of LEVELS) {
    const cand = path.join(TMP, f.replace('.glb', `.${L.name}.glb`));
    try { await optimize(src, cand, L); } catch (err) { tries.push({ level: L.name, error: String(err.message || err) }); continue; }
    const r = await render('/_pruef/' + path.basename(cand));
    const ds = ref.views.map((v, i) => diff(v, r.views[i]));
    const mean = Math.max(...ds.map((d) => d.mean)), bad = Math.max(...ds.map((d) => d.bad));
    const ok = mean <= MAX_MEAN && bad <= MAX_BAD;
    tries.push({ level: L.name, tris: r.tris, kb: Math.round(fs.statSync(cand).size / 1024), mean: +mean.toFixed(2), bad: +(bad * 100).toFixed(2), ok });
    if (ok) {
      chosen = { level: L.name, cand, tris: r.tris };
      // Vergleichsbild: Original oben, Ergebnis unten (Ansicht 1)
      fs.writeFileSync(path.join(OUT, f.replace('.glb', '-vorher.png')), Buffer.from(ref.views[0].split(',')[1], 'base64'));
      fs.writeFileSync(path.join(OUT, f.replace('.glb', '-nachher.png')), Buffer.from(r.views[0].split(',')[1], 'base64'));
      break;
    }
  }
  const entry = { datei: f, vorher: { tris: ref.tris, kb: Math.round(kb0) }, versuche: tries, gewaehlt: chosen ? chosen.level : 'Original behalten' };
  if (chosen && WRITE) { fs.copyFileSync(chosen.cand, src); entry.geschrieben = true; }
  report.push(entry);
  console.log(`${f}: ${ref.tris} → ${chosen ? chosen.tris : ref.tris} Dreiecke, Stufe: ${entry.gewaehlt}`, tries.map((t) => `${t.level}:${t.ok ? 'OK' : 'x'}(${t.mean}/${t.bad}%)`).join(' '));
}
fs.writeFileSync(path.join(HERE, 'agent-bericht.json'), JSON.stringify(report, null, 2));
fs.rmSync(TMP, { recursive: true, force: true });
await browser.close();
