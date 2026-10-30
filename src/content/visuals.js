// Visualisierungen der Website als statisches SVG/HTML (beim Bauen erzeugt).
// Stil wie im Spiel: Haarlinien, Eckmarken, technische Beschriftung, Farbe nur mit Funktion.
// Bewegung nur per CSS, läuft nur, solange die Grafik sichtbar ist (Klasse .is-live).

import { ICONS } from './icons.js';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 10) / 10;

// gleichmäßiger Zufall mit festem Startwert, damit jeder Build gleich aussieht
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const FX = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };

// Rahmen jeder Visualisierung: Panel mit Kopfleiste und Eckmarken
export function frame(code, title, body, { cls = '', live = true, label = '' } = {}) {
  return `<figure class="vis ls-panel ${cls}"${label ? ` aria-label="${esc(label)}"` : ''}>
  <figcaption class="ls-head"><span class="ls-code">${esc(code)}</span><span class="ls-title">${esc(title)}</span><span class="ls-spacer"></span>${live ? '<span class="vis-live" aria-hidden="true"><i></i>Live</span>' : ''}</figcaption>
  <div class="vis-body">${body}</div>
  <span class="ls-corners" aria-hidden="true"></span>
</figure>`;
}

// ---------- 01 Systemkarte ----------
export function visSystem(t) {
  const cx = 300, cy = 196, k = 0.4;
  const R = rng(7);
  const ell = (rx, cls, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${r1(rx * k)}" class="${cls}" ${extra}/>`;
  const at = (rx, deg) => { const a = (deg * Math.PI) / 180; return [r1(cx + rx * Math.cos(a)), r1(cy + rx * k * Math.sin(a))]; };
  const belt = (r0, r2, n) => {
    let d = '';
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, rr = r0 + (r2 - r0) * R();
      const x = cx + rr * Math.cos(a), y = cy + rr * k * Math.sin(a);
      d += `M${r1(x)} ${r1(y)}h.9`;
    }
    return d;
  };
  const [jx, jy] = at(112, 205), [sx, sy] = at(150, 28), [ex, ey] = [24, 214];
  const [ux, uy] = at(185, 120), [nx, ny] = at(212, -60);
  const s = t.vis.system;
  return `<svg class="v-svg" viewBox="0 0 600 380" role="img" aria-label="${esc(s.head)}">
  <defs>
    <radialGradient id="sm-sun"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="#ffe7b8" stop-opacity=".5"/><stop offset="1" stop-color="#ffb060" stop-opacity="0"/></radialGradient>
    <linearGradient id="sm-sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient>
  </defs>
  <g class="s-grid">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 50} 0V380"/>`).join('')}${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${i * 50 + 20}H600"/>`).join('')}</g>
  <g transform="translate(${cx} ${cy}) scale(1 ${k})"><g class="v-sweep"><path d="M0 0L292 0A292 292 0 0 0 252.9 -146Z" fill="url(#sm-sweep)"/><path d="M0 0H292" class="s-line2"/></g></g>
  ${ell(30, 's-dead')}${ell(42, 's-dead')}${ell(56, 's-dead')}
  <path d="${belt(72, 90, 260)}" class="s-dots"/>
  ${ell(112, 's-line')}${ell(150, 's-line')}${ell(185, 's-line s-faint')}${ell(212, 's-line s-faint')}
  <path d="${belt(234, 254, 380)}" class="s-dots s-faint"/>
  <ellipse cx="${cx + 12}" cy="${cy + 4}" rx="282" ry="64" transform="rotate(-8 ${cx} ${cy})" class="s-line s-eris"/>
  <circle cx="${cx}" cy="${cy}" r="26" fill="url(#sm-sun)"/><circle cx="${cx}" cy="${cy}" r="3.2" fill="#fff"/>
  <text x="${cx}" y="${cy - 34}" class="s-txt s-mid">${esc(s.stille)}</text>
  <text x="${cx + 62}" y="${cy + 32}" class="s-txt s-red">${esc(s.noSig)}</text>
  ${[at(30, 140), at(42, 300), at(56, 40)].map(([x, y]) => `<path d="M${x - 3} ${y - 3}l6 6M${x + 3} ${y - 3}l-6 6" class="s-red-l"/>`).join('')}
  <text x="${cx - 120}" y="${cy - 42}" class="s-txt">${esc(s.belt)} · BM-1/2/3</text><path d="M${cx - 84} ${cy - 38}l14 10" class="s-line2"/>
  <circle cx="${ux}" cy="${uy}" r="3" class="s-planet-dim"/><circle cx="${nx}" cy="${ny}" r="3" class="s-planet-dim"/>
  <text x="${nx + 8}" y="${ny - 8}" class="s-txt">${esc(s.front)} · ${esc(s.frontPlanets)}</text>
  <text x="520" y="114" class="s-txt s-end">${esc(s.kuiper)}</text><path d="M520 118l-6 14" class="s-line2"/>
  <g style="--c:${FX.europa}"><circle cx="${jx}" cy="${jy}" r="7.5" class="s-planet"/><circle cx="${jx}" cy="${jy}" r="13" class="s-ring-c"/>
    <path d="M${jx - 13} ${jy}H${jx - 52}V${jy - 40}" class="s-lead"/><text x="${jx - 52}" y="${jy - 58}" class="s-lbl">${esc(s.europa)}</text><text x="${jx - 52}" y="${jy - 46}" class="s-txt">${esc(s.per)} · EU-1/8</text></g>
  <g style="--c:${FX.saturn}"><circle cx="${sx}" cy="${sy}" r="6.5" class="s-planet"/><ellipse cx="${sx}" cy="${sy}" rx="13" ry="3.6" transform="rotate(-14 ${sx} ${sy})" class="s-ring-c"/><circle cx="${sx}" cy="${sy}" r="16" class="s-ring-c s-pulse"/>
    <path d="M${sx + 16} ${sy}H${sx + 60}V${sy + 34}" class="s-lead"/><text x="${sx + 60}" y="${sy + 50}" class="s-lbl">${esc(s.saturn)}</text><text x="${sx + 60}" y="${sy + 62}" class="s-txt">${esc(s.per)} · SA-1/8</text></g>
  <g style="--c:${FX.eris}"><circle cx="${ex}" cy="${ey}" r="4.5" class="s-planet"/><circle cx="${ex}" cy="${ey}" r="10" class="s-ring-c"/>
    <path d="M${ex} ${ey + 10}V${ey + 120}H${ex + 30}" class="s-lead"/><text x="${ex + 36}" y="${ey + 118}" class="s-lbl">${esc(s.eris)}</text><text x="${ex + 36}" y="${ey + 130}" class="s-txt">${esc(s.per)} · ER-1/8</text></g>
  <text x="590" y="372" class="s-txt s-end s-faint-t">37 · ${esc(s.head)}</text>
</svg>`;
}

// ---------- 02 Schiffe ----------
export function visShips(t) {
  const s = t.vis.ships;
  const cells = [
    ['S1', s.starter, 'base'], ['S2', s.credits, 'cr'], ['S3', s.credits, 'cr'], ['S4', s.credits, 'cr'],
    ['S5', s.tritium, 'tr'], ['S6', s.tritium, 'tr'], ['S7', s.tritium, 'tr'], ['S8', s.top, 'top'],
  ];
  const spec = [['H', s.healer], ['T', s.tank], ['S', s.scout]];
  return `<div class="bp">
  <div class="bp-stage">
    <img src="/img/saturn-starter.webp" srcset="/img/saturn-starter-640.webp 470w, /img/saturn-starter.webp 940w" sizes="(max-width: 900px) 92vw, 620px" width="940" height="631" loading="lazy" decoding="async" alt="${esc(s.model)}, ${esc(s.render)}">
    <svg class="bp-over" viewBox="0 0 940 631" aria-hidden="true">
      <path d="M640 604 L700 560 H850" class="s-lead"/><circle cx="640" cy="604" r="5" class="s-tgt"/><text x="850" y="550" class="s-lbl s-end">${esc(s.laser)}</text>
      <path d="M392 428 L330 520 H120" class="s-lead"/><circle cx="392" cy="428" r="5" class="s-tgt"/><text x="120" y="510" class="s-lbl">${esc(s.hull)} S-01</text>
      <path d="M822 312 L870 210 H915" class="s-lead"/><circle cx="822" cy="312" r="5" class="s-tgt"/><text x="915" y="200" class="s-lbl s-end">${esc(s.guild)}</text>
      <path d="M40 40h40M40 40v40M900 40h-40M900 40v40" class="s-line2"/>
      <text x="40" y="24" class="s-txt">${esc(s.model)}</text>
    </svg>
  </div>
  <div class="bp-line">
    <div class="bp-row"><span class="ls-label">${esc(s.line)}</span>
      <ol class="bp-cells">${cells.map(([c, l, k]) => `<li class="bp-cell is-${k}"><b>${c}</b><span>${esc(l)}</span></li>`).join('')}</ol></div>
    <div class="bp-row"><span class="ls-label">${esc(s.special)} · ${esc(s.from40)}</span>
      <ol class="bp-cells is-spec">${spec.map(([c, l]) => `<li class="bp-cell is-spec"><b>${c}</b><span>${esc(l)}</span></li>`).join('')}</ol></div>
  </div>
</div>`;
}

// ---------- 03 Laser ----------
export function visLasers(t) {
  const s = t.vis.lasers;
  const rows = s.rows.map(([n, src], i) => {
    const y = 46 + i * 62;
    const cls = ['pulse', 'ion', 'plasma', 'gamma'][i];
    const srcCls = i === 2 ? 's-tri' : i === 3 ? 's-gam' : '';
    let beam = '';
    if (i === 0) beam = `<path d="M232 ${y}H584" class="b-pulse"/>`;
    if (i === 1) beam = `<path d="M232 ${y - 2.5}H584M232 ${y + 2.5}H584" class="b-ion-base"/><path d="M232 ${y - 2.5}H584M232 ${y + 2.5}H584" class="b-ion"/>`;
    if (i === 2) beam = `<path d="M232 ${y}H584" class="b-plasma-glow"/><path d="M232 ${y}H584" class="b-plasma"/>`;
    if (i === 3) beam = `<path d="M232 ${y}H584" class="b-gamma-glow2"/><path d="M232 ${y}H584" class="b-gamma-glow"/><path d="M232 ${y}H584" class="b-gamma"/><path d="M232 ${y}H584" class="b-gamma-run"/>`;
    const pips = Array.from({ length: 4 }, (_, j) => `<path d="M${120 + j * 9} ${y + 10}h6" class="${j <= i ? 's-pip-on' : 's-pip'}"/>`).join('');
    return `<g class="lz-${cls}">
      <text x="16" y="${y - 3}" class="s-lbl">${esc(n)}</text>
      <text x="16" y="${y + 12}" class="s-txt ${srcCls}">${esc(src)}</text>
      ${pips}
      <path d="M196 ${y - 9}h30l6 6v6l-6 6h-30z" class="s-emit"/><path d="M204 ${y}h18" class="s-line2"/>
      ${beam}
    </g>`;
  }).join('');
  return `<svg class="v-svg" viewBox="0 0 600 330" role="img" aria-label="${esc(s.head)}">
  <g class="s-grid">${Array.from({ length: 12 }, (_, i) => `<path d="M${240 + i * 30} 20V270"/>`).join('')}</g>
  ${rows}
  <path d="M16 290H584" class="s-line"/>
  <text x="16" y="312" class="s-txt"><tspan class="s-txt-hi">${esc(s.ammo)}</tspan>  ${esc(s.ammoList)}</text>
  <text x="300" y="312" class="s-txt"><tspan class="s-txt-hi">${esc(s.rockets)}</tspan>  ${esc(s.rocketList)}</text>
  <text x="584" y="312" class="s-txt s-end"><tspan class="s-txt-hi">${esc(s.mines)}</tspan>  ${esc(s.mineList)}</text>
</svg>`;
}

// ---------- 04 Drohnen (Zeichnung per JavaScript, siehe src/visuals/formations.js) ----------
export function visDrones(t) {
  const s = t.vis.drones;
  return `<div class="fm" data-formations>
  <div class="fm-stage">
    <canvas class="fm-canvas" width="640" height="400" aria-hidden="true"></canvas>
    <noscript><p class="fm-nojs">${esc(s.noJs)}</p></noscript>
    <div class="fm-readout" aria-live="polite"><span class="fm-idx ls-num">01/16</span><b class="fm-name">${esc(s.list[3][0])}</b><span class="fm-desc">${esc(s.list[3][1])}</span></div>
    <div class="fm-ctrl">
      <button class="ls-btn fm-prev" type="button" aria-label="${esc(s.prev)}">${ICONS.prev}</button>
      <button class="ls-btn fm-next" type="button" aria-label="${esc(s.next)}">${ICONS.next}</button>
    </div>
  </div>
  <div class="fm-list" role="group" aria-label="${esc(s.pick)}">${s.list.map(([n, d], i) => `<button type="button" class="fm-chip" data-i="${i}" title="${esc(d)}"><span class="ls-num">${String(i + 1).padStart(2, '0')}</span>${esc(n)}</button>`).join('')}</div>
</div>`;
}

// ---------- 05 Pilotenakte + Rig ----------
export function visDepth(t) {
  const s = t.vis.depth;
  const colX = [56, 168, 280];
  const rowsY = [70, 122, 174, 226, 278];
  // Knoten je Ast: [Zeile, Versatz]
  const shape = [[0, 0], [1, -26], [1, 26], [2, -26], [2, 26], [3, -26], [3, 26], [4, 0]];
  const edges = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 7], [1, 4]];
  const lit = [[0, 1, 3, 5], [0, 2, 4], [0, 1]];
  let tree = '';
  colX.forEach((x, b) => {
    const pos = shape.map(([r, o]) => [x + o, rowsY[r]]);
    edges.forEach(([a, c]) => {
      const on = lit[b].includes(a) && lit[b].includes(c);
      tree += `<path d="M${pos[a][0]} ${pos[a][1] + 7}L${pos[c][0]} ${pos[c][1] - 7}" class="${on ? 's-edge-on' : 's-line'}"/>`;
    });
    pos.forEach(([px, py], i) => {
      const on = lit[b].includes(i);
      tree += `<path d="M${px - 4} ${py - 7}h11v7l-4 7h-11v-7z" class="${on ? 's-node-on' : 's-node'}"/>`;
      const lv = i === 7 ? 5 : 3 + (i % 2);
      for (let j = 0; j < lv; j++) tree += `<path d="M${px - 8 + j * 4} ${py + 11}h2.4" class="${on && j < (i % 3) + 1 ? 's-pip-on' : 's-pip'}"/>`;
    });
    tree += `<text x="${x}" y="34" class="s-lbl s-mid">${esc(s.branches[b])}</text><path d="M${x - 16} 42h32" class="s-line2"/>`;
  });
  // Rig
  const oy = { nickel: 92, cobalt: 146, platinum: 200, tholin: 254 };
  const out = [[92, 0], [164, 1], [218, 2], [272, 3]];
  const links = [
    ['nickel', 0], ['cobalt', 0], ['platinum', 1], ['cobalt', 2], ['platinum', 2], ['tholin', 3],
  ];
  let rig = `<path d="M496 74h28v216h-28z" class="s-refine"/><text x="510" y="64" class="s-txt s-mid">Refinery</text>`;
  links.forEach(([o, i], n) => {
    const y1 = oy[o], y2 = out[i][0];
    const mx = 470 + (n % 3) * 7;
    rig += `<path d="M446 ${y1}H${mx}V${y2}H496" class="s-line"/><path d="M446 ${y1}H${mx}V${y2}H496" class="s-flow" style="animation-delay:${-n * 0.7}s"/>`;
  });
  rig += `<path d="M524 ${out[1][0]}H544V${out[3][0] - 8}H552" class="s-line"/><path d="M524 ${out[1][0]}H544V${out[3][0] - 8}H552" class="s-flow" style="animation-delay:-1.3s"/>`;
  Object.entries(oy).forEach(([k, y]) => {
    rig += `<path d="M384 ${y - 9}h56l6 6v6l-6 6h-56z" class="s-ore"/><text x="392" y="${y + 3.5}" class="s-txt s-txt-hi">${esc(s.ores[k])}</text>`;
  });
  out.forEach(([y, i]) => {
    rig += `<path d="M524 ${y}h28" class="s-line2"/><text x="556" y="${y - 2}" class="s-lbl">${esc(s.out[i][0])}</text><text x="556" y="${y + 10}" class="s-txt">${esc(s.out[i][1])}</text>`;
  });
  return `<svg class="v-svg" viewBox="0 0 640 330" role="img" aria-label="${esc(s.head)}">
  <text x="16" y="16" class="s-txt">${esc(s.tree)}</text><text x="384" y="16" class="s-txt">${esc(s.rig)}</text>
  <path d="M352 24V306" class="s-line s-faint"/>
  ${tree}${rig}
  <text x="16" y="318" class="s-txt s-tri">${esc(s.source)}</text>
</svg>`;
}

// ---------- 06 Wurmlöcher (Szene; die Tabelle steht unter „Details“) ----------
const WH = [
  ['Sirius', 20, 3, 15, false], ['Vega', 25, 3, 20, false], ['Rigel', 30, 3, 28, false],
  ['Antares', 35, 3, 35, true], ['Betelgeuse', 40, 2, 42, true], ['Andromeda', 50, 1, 50, true],
];
export function visWormholes(t) {
  const s = t.vis.wormholes;
  const rings = Array.from({ length: 8 }, (_, i) => `<path class="wh-ring" style="animation-delay:${(-i * 6) / 8}s" d="M-34 -50H50V34L34 50H-50V-34Z"/>`).join('');
  // Ziele rund um den Schlund, wie Peilmarken auf einem Zielsucher
  const pos = [[-150, -70], [-160, 4], [-150, 78], [150, 78], [160, 4], [150, -76]];
  const tags = WH.map(([n, w], i) => {
    const [x, y] = pos[i];
    const right = x > 0;
    const fin = i === 5;
    const lx = right ? x - 6 : x + 6;
    return `<g class="wh-tag${fin ? ' is-final' : ''}" style="--d:${i}">
      <path d="M${right ? x - 2 : x + 2} ${y + 6}L${right ? 58 : -58} ${r1(y * 0.42)}" class="s-lead wh-lead"/>
      <circle cx="${right ? 58 : -58}" cy="${r1(y * 0.42)}" r="2.2" class="${fin ? 'wh-dot-f' : 'wh-dot'}"/>
      <text x="${lx}" y="${y}" class="s-lbl${right ? ' s-end' : ''}">${esc(n)}</text>
      <text x="${lx}" y="${y + 12}" class="s-txt${right ? ' s-end' : ''}${fin ? ' s-gam' : ''}">${w} · ${esc(s.cols[1])}</text>
    </g>`;
  }).join('');
  return `<svg class="v-svg wh-scene" viewBox="-200 -110 400 220" role="img" aria-label="${esc(s.head)}">
    <path d="M-200 0H200M0 -110V110" class="s-grid-l"/>
    <g class="wh-rings">${rings}</g>
    <circle r="2.6" fill="#fff"/><circle r="10" class="wh-core"/><circle r="18" class="wh-core wh-core2"/>
    <path d="M-104 -104h14M-104 -104v14M104 104h-14M104 104v-14M104 -104h-14M104 -104v14M-104 104h14M-104 104v-14" class="s-line2"/>
    ${tags}
    <text x="0" y="104" class="s-txt s-mid s-faint-t">${esc(s.coords)} · 6</text>
  </svg>`;
}
export function whTable(t) {
  const s = t.vis.wormholes;
  const rows = WH.map(([n, w, l, lv, g], i) => `<tr${i === 5 ? ' class="is-final"' : ''}>
      <th scope="row">${esc(n)}</th><td class="ls-num">${w}</td>
      <td><span class="pips" role="img" aria-label="${l}">${Array.from({ length: 3 }, (_, j) => `<i class="${j < l ? 'on' : ''}"></i>`).join('')}</span></td>
      <td class="ls-num">${lv}${g ? ` <span class="wh-g">${esc(s.group)}</span>` : ''}</td></tr>`).join('');
  return `<table class="wh-table"><thead><tr>${s.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------- 07 Bosse: drei Heimaten als Sternkarte, Route des Star Whale, Black Shipyards ----------
export function visBosses(t) {
  const s = t.vis.bosses;
  const homes = [['europa', 'EU', 104, 142], ['saturn', 'SA', 300, 166], ['eris', 'ER', 496, 142]];
  const off = { 5: [-68, -44], 6: [-28, 54], 7: [32, -50], 8: [70, 42] };
  const P = {};
  homes.forEach(([f, c, x, y]) => { for (const n of [5, 6, 7, 8]) P[`${c}${n}`] = [x + off[n][0], y + off[n][1]]; });
  // weiche Kurve durch alle Punkte (Catmull-Rom)
  const curve = (pts) => {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  };
  const route = curve(['EU5', 'EU6', 'EU8', 'SA5', 'SA6', 'SA8', 'ER5', 'ER6', 'ER8'].map((k) => P[k]));
  let g = '';
  homes.forEach(([f, c, x, y]) => {
    const n = (k) => P[`${c}${k}`];
    g += `<g style="--c:${FX[f]}">
      <path d="M${n(5)}L${n(6)}L${n(8)}M${n(5)}L${n(7)}L${n(8)}M${n(6)}L${n(7)}" class="s-line" transform="translate(0 0)"/>
      <text x="${x - 72}" y="${y - 84}" class="s-lbl s-fx">${f.toUpperCase()}</text><path d="M${x - 72} ${y - 77}h28" class="s-fx-l"/>
      ${[5, 6, 8].map((k) => `<circle cx="${n(k)[0]}" cy="${n(k)[1]}" r="3.2" class="s-node-c"/><text x="${n(k)[0] + 8}" y="${n(k)[1] + 4}" class="s-txt">${c}-${k}</text>`).join('')}
      <g class="yard${c === 'ER' ? ' is-alarm' : ''}" transform="translate(${n(7)[0]} ${n(7)[1]})">
        <path d="M0 -11L9.5 -5.5V5.5L0 11L-9.5 5.5V-5.5Z" class="s-yard"/><path d="M0 -5L4.3 -2.5V2.5L0 5L-4.3 2.5V-2.5Z" class="s-yard-in"/>
        <g class="tugs"><circle cx="17" cy="0" r="1.6"/><circle cx="-17" cy="0" r="1.6"/><circle cx="0" cy="17" r="1.6"/></g>
        ${c === 'ER' ? '<circle r="22" class="s-ring-r s-pulse"/>' : ''}
        <text x="14" y="-12" class="s-txt s-red">${c}-7</text>
      </g>
    </g>`;
  });
  // Angreifer: du, auf dem Weg in den Boss-Sektor der Verbannten
  const [ax, ay] = P.ER7;
  return `<svg class="v-svg" viewBox="0 0 600 320" role="img" aria-label="${esc(s.head)}">
  <g class="s-grid">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 50} 0V320"/>`).join('')}</g>
  <path d="${route}" class="w-route"/><path d="${route}" class="w-whale" pathLength="1000"/>
  ${g}
  <g class="you"><path d="M${ax + 6} ${ay + 150}L${ax + 2} ${ay + 16}" class="s-you-l"/><path d="M${ax + 6} ${ay + 158}l-6 -12h12z" class="s-you"/><text x="${ax + 18}" y="${ay + 162}" class="s-lbl">${esc(s.you)}</text></g>
  <text x="20" y="284" class="s-txt"><tspan class="s-txt-hi">${esc(s.whale)}</tspan>  ·  ${esc(s.last)}</text>
  <g class="w-alarm"><path d="M20 298h560" class="s-red-l"/><text x="580" y="314" class="s-txt s-red s-end">${esc(s.alarm)} ER-7</text></g>
  <text x="20" y="314" class="s-txt s-red">${esc(s.yard)} · ${esc(s.tugs)}</text>
</svg>`;
}

// ---------- 08 Battle Map: drei Fraktionen, ein Kern in der Mitte (Plan der Woche unter „Details“) ----------
export function visWar(t) {
  const s = t.vis.war;
  const R = rng(19);
  const cx = 300, cy = 160;
  const bases = [['europa', 92, 70], ['saturn', 508, 70], ['eris', 300, 296]];
  const rocks = Array.from({ length: 70 }, () => { const a = R() * 6.283, r = 40 + R() * 230; return [r1(cx + Math.cos(a) * r * 1.2), r1(cy + Math.sin(a) * r * 0.55)]; })
    .map(([x, y]) => `M${x} ${y}h1.2`).join('');
  let ships = '';
  bases.forEach(([f, bx, by], k) => {
    for (let i = 0; i < 4; i++) {
      const sx = bx + (R() - 0.5) * 70, sy = by + (R() - 0.5) * 40;
      const ex = cx + (R() - 0.5) * 60, ey = cy + (R() - 0.5) * 34;
      ships += `<g style="--c:${FX[f]}"><path d="M${r1(sx)} ${r1(sy)}L${r1(ex)} ${r1(ey)}" class="bm-vec"/><circle r="2.6" class="bm-ship" style="offset-path:path('M${r1(sx)} ${r1(sy)}L${r1(ex)} ${r1(ey)}');animation-delay:${r1(-(k * 4 + i) * 0.9)}s"/></g>`;
    }
  });
  return `<svg class="v-svg" viewBox="0 0 600 330" role="img" aria-label="${esc(s.scene)}">
  <g class="s-grid">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 50} 0V330"/>`).join('')}${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${i * 50 + 15}H600"/>`).join('')}</g>
  <path d="${rocks}" class="s-dots"/>
  <ellipse cx="${cx}" cy="${cy}" rx="250" ry="128" class="s-line s-faint"/>
  ${bases.map(([f, x, y]) => `<g style="--c:${FX[f]}"><path d="M${x - 20} ${y - 10}h40v20h-40z" class="bm-base"/><text x="${x}" y="${y + (y > 200 ? 30 : -18)}" class="s-lbl s-mid s-fx">${f.toUpperCase()}</text></g>`).join('')}
  ${ships}
  <g class="bm-core"><circle cx="${cx}" cy="${cy}" r="30" class="s-ring-c bm-ring s-pulse"/><path d="M${cx} ${cy - 15}L${cx + 13} ${cy - 7.5}V${cy + 7.5}L${cx} ${cy + 15}L${cx - 13} ${cy + 7.5}V${cy - 7.5}Z" class="bm-hex"/><circle cx="${cx}" cy="${cy}" r="3" fill="#fff"/></g>
  <text x="${cx + 40}" y="${cy - 26}" class="s-lbl">${esc(s.core)}</text>
  <text x="20" y="318" class="s-txt"><tspan class="s-txt-hi">${esc(s.scene)}</tspan>  ·  ${esc(s.noSafe)}</text>
</svg>`;
}
export function warTable(t) {
  const s = t.vis.war;
  const head = `<tr><th scope="col"><span class="sr">Event</span></th>${s.days.map((d) => `<th scope="col">${esc(d)}</th>`).join('')}</tr>`;
  const rows = s.rows.map(([n, info, cells]) => `<tr><th scope="row"><b>${esc(n)}</b><span>${esc(info)}</span></th>${cells.map((c) => `<td>${c ? `<i class="op op-${c}" role="img" aria-label="${esc(s.legend.find((l) => l[1] === c)[0])}"></i>` : '<i class="op op-0" aria-hidden="true"></i>'}</td>`).join('')}</tr>`).join('');
  return `<div class="ops">
  <table class="ops-table"><caption class="sr">${esc(s.plan)}</caption><thead>${head}</thead><tbody>${rows}</tbody></table>
  <div class="ops-foot">
    <ul class="ops-legend">${s.legend.map(([l, c]) => `<li><i class="op op-${c}" aria-hidden="true"></i>${esc(l)}</li>`).join('')}</ul>
    <div class="ops-breach"><span class="ls-label">${esc(s.phases)}</span><ol>${s.phaseList.map((p, i) => `<li><b class="ls-num">${i + 1}</b>${esc(p)}</li>`).join('')}</ol></div>
  </div>
</div>`;
}

// ---------- Signalmonitor (Story) ----------
export function visMonitor(t) {
  const s = t.story;
  const R = rng(31);
  const W = 400, x0 = 96;
  const wave = (seed, amp) => {
    const r = rng(seed);
    let d = `M0 0`;
    for (let x = 0; x <= W; x += 4) {
      const burst = r() > 0.86 ? (r() - 0.5) * amp * 2.2 : (r() - 0.5) * amp * 0.5;
      const y = Math.sin(x * 0.09 + seed) * amp * 0.25 + burst;
      d += `L${x} ${r1(y)}`;
    }
    // zweite Periode identisch, damit die Schleife nahtlos läuft
    return d + d.replace('M0 0', '').replace(/L(\d+)/g, (_, n) => `L${+n + W}`);
  };
  const rows = s.channels.map(([n, f], i) => {
    const y = 34 + i * 38;
    const off = f === 'off';
    const c = off ? '' : ` style="--c:${FX[f]}"`;
    const line = off
      ? `<path d="M${x0} ${y}H${x0 + W}" class="m-flat"/>${Array.from({ length: 6 }, () => `<path d="M${r1(x0 + R() * W)} ${y}v${r1((R() - 0.5) * 3)}" class="m-flat"/>`).join('')}`
      : `<g clip-path="url(#mon-clip)"><g transform="translate(${x0} ${y})"><path d="${wave(i * 13 + 5, 13)}" class="m-wave" style="animation-duration:${6 + i * 1.3}s"/></g></g>`;
    return `<g${c}><text x="14" y="${y + 4}" class="s-lbl${off ? ' s-dim' : ' s-fx'}">${esc(n)}</text>${line}
      <text x="586" y="${y + 4}" class="s-txt s-end ${off ? 's-red' : 's-fx'}">${esc(off ? s.noSignal : s.live)}</text></g>`;
  }).join('');
  return `<svg class="v-svg" viewBox="0 0 600 250" role="img" aria-label="${esc(s.monitor)}">
  <defs><clipPath id="mon-clip"><rect x="${x0}" y="0" width="${W}" height="250"/></clipPath></defs>
  <g class="s-grid">${Array.from({ length: 11 }, (_, i) => `<path d="M${x0 + i * 40} 12V238"/>`).join('')}</g>
  <path d="M${x0} 128H${x0 + W}" class="s-line s-faint"/>
  ${rows}
</svg>`;
}
