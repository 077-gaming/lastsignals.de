// Grobe Balance je Sektor: Kampfdauer (s) und Kämpfe je Leben (x) mit Referenz-Ausrüstung. Aufruf: node tools/balance/sektoren.mjs
const { ENEMIES, sectorsFor } = await import(new URL("../../src/core/data.js", import.meta.url).href);
// Referenz-Ausrüstung je Sektor (Schiff, Laserzahl, Laserschaden, Schildgeneratoren à 2000)
const GEAR = { 3: [16000, 4, 100, 3], 4: [32000, 5, 150, 5], 5: [55000, 7, 150, 6], 6: [90000, 8, 170, 8], 7: [130000, 10, 175, 9], 8: [180000, 11, 190, 11] };
const S = sectorsFor('saturn');
for (const sec of Object.values(S)) {
  const g = GEAR[sec.index]; if (!g) continue;
  const dps = g[1] * g[2] * 0.85, ehp = g[0] + g[3] * 2000;
  const rows = sec.spawns.map(({ type }) => { const e = ENEMIES[type]; const ttk = (e.hp + e.shield) / dps; const taken = e.damage * e.fireRate * 0.6 * ttk; return `${type} ${ttk.toFixed(0)}s ${(ehp / taken).toFixed(0)}x`; });
  console.log(`S${sec.index} St ${sec.levelMin}-${sec.levelMax} DPS ${dps.toFixed(0)} EHP ${ehp}: ${rows.join(' | ')}`);
}
