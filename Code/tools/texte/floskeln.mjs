// Sucht verbotene Floskeln in ausgelieferten Textquellen (Spiel und Website). Aufruf aus dem Repo-Wurzelordner:
//   node Code/tools/texte/floskeln.mjs        → Liste der Treffer, Rückgabecode 1 bei Treffern
import fs from 'node:fs/promises';
import path from 'node:path';

const MUSTER = [
  /tauche? (?:jetzt )?ein/i, /\bepisch/i, /unvergesslich/i, /\bnahtlos/i, /revolution[äa]r/i, /begib dich auf eine reise/i,
  /in einer welt,? in der/i, /\bentfessle/i, /atemberaubend/i, /\bultimativ/i,
  /\bimmerse yourself/i, /\bepic\b/i, /unforgettable/i, /seamless/i, /revolutionary/i, /embark on a journey/i,
  /in a world where/i, /\bunleash/i, /breathtaking/i, /\bultimate\b/i,
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, // Emojis
];
const ORTE = ['Code/src', 'src', 'index.html', 'en', 'wiki', 'news', 'ruhmeshalle', 'impressum', 'datenschutz', '404.html'];
const ENDUNG = /\.(js|mjs|html|md|json|css)$/;
const treffer = [];
async function lauf(p) {
  let st; try { st = await fs.stat(p); } catch { return; }
  if (st.isDirectory()) { for (const n of await fs.readdir(p)) if (!n.startsWith('.') && n !== 'node_modules') await lauf(path.join(p, n)); return; }
  if (!ENDUNG.test(p)) return;
  const zeilen = (await fs.readFile(p, 'utf8')).split('\n');
  zeilen.forEach((z0, i) => {
    // Kommentare zählen nicht als ausgelieferter Text
    const z = /\.(js|mjs|css)$/.test(p) ? z0.replace(/(^|[^:])\/\/.*$/, '$1').replace(/^\s*\*.*$/, '') : z0;
    for (const m of MUSTER) { const t = z.match(m); if (t) treffer.push(`${p}:${i + 1}: „${t[0]}“  ${z.trim().slice(0, 110)}`); } });
}
for (const o of ORTE) await lauf(o);
console.log(treffer.length ? treffer.join('\n') : 'Keine Floskeln gefunden.');
process.exit(treffer.length ? 1 : 0);
