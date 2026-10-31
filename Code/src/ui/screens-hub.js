// Mission Control (Hub), Neuordnung 30.10.2026 (Toni: „einfach und übersichtlich wie früher, nicht alles überall“):
// oben eine schlanke Pilotenleiste, links die Bereiche als Liste mit großen Symbolen, in der Mitte immer nur EIN Bereich.
// Start = 3D-Szene (Heimatstation, eigenes Schiff) mit großem START-Knopf und drei Kurzinfos. Jeder andere Bereich:
// klare Überschrift, wenige große Kacheln, Details erst auf Klick. Bildsprache: Planung/UI_STIL.md.
import {
  FACTIONS, SHIPS, LASERS, GENERATORS, AMMO, ROCKETS, ENEMIES, QUESTS, RANKS, ORES, REPAIR,
  BACKDROPS, xpForLevel, MAX_LEVEL, sectorsFor, newProfile,
} from '../core/data.js';
import {
  fmt, esc, pad2, price, VERSION, accentOf, rankOf, rankIndex, reduced, mount, insignia,
  emblem, alignMeter, rankBadge, shipSilhouette, settings, setSetting, duration, utcClock,
  shipName, shipNo, FX_CODE, KODEX, CUR,
} from './screens-kit.js';
import { sectorMap, ENEMY_CODE } from './screens-map.js';
import { stage } from './screens-stage.js';
import { register, killsOf, CLANS } from './screens-roster.js';
import { World } from '../sim/world.js';
import { Bus } from '../core/events.js';

const BEHAVIOR = {
  aggressive: 'Greift in Reichweite an',
  passive: 'Wehrt sich nur bei Angriff',
  opportunist: 'Greift unter 70 % Hülle an',
  thief: 'Stiehlt Wracks und Beute',
};
const BEH_SHORT = { aggressive: 'AGGRESSIV', passive: 'PASSIV', opportunist: 'OPPORTUNIST', thief: 'DIEB' };
const CLAN_LEVEL = 10;

function homesOf(id) {
  try { return Object.values(sectorsFor(id)).sort((a, b) => a.index - b.index); } catch { return []; }
}
const genText = (g) => (g.kind === 'speed' ? `+${fmt(g.value)} TEMPO` : g.kind === 'shield' ? `+${fmt(g.value)} SCHILD` : fmt(g.value));
const kv = (label, value, cls = '') => `<div class="sc-kv ${cls}"><span class="ls-label">${label}</span><span>${value}</span></div>`;
const sub = (code, title, right = '') => `<div class="mc-sub"><span class="ls-code">${code}</span><span>${title}</span><span class="ls-spacer"></span>${right}</div>`;
const bar = (v, cls = '') => `<div class="ls-bar ${cls}" style="--v:${Math.max(0, Math.min(1, v)).toFixed(3)};--trail:0"></div>`;
const pad3 = (n) => String(n).padStart(3, '0');
const CS = (P) => String(P.callsign || 'PILOT').toUpperCase();
const LOCK = '<svg class="mc-lock" viewBox="0 0 10 12" aria-hidden="true"><path d="M2.5 5V3.4a2.5 2.5 0 0 1 5 0V5"/><rect x="1" y="5" width="8" height="6.4"/></svg>';

// Symbole der Bereiche: technische Linienzeichnungen, eckig, eine Strichstärke
const ICONS = {
  start: '<path d="M12 2.5L19 20L12 16L5 20Z"/><path d="M12 16V21.5"/>',
  hangar: '<path d="M2.5 20.5V9L12 3.5L21.5 9V20.5"/><path d="M6.5 20.5V12.5H17.5V20.5"/><path d="M1.5 20.5H22.5M6.5 16.5H17.5"/>',
  shop: '<path d="M3.5 7L12 3L20.5 7V17L12 21L3.5 17Z"/><path d="M3.5 7L12 11L20.5 7M12 11V21"/><path d="M7.8 5L16.2 9"/>',
  akte: '<path d="M2.5 5H21.5V19H2.5Z"/><path d="M5.5 8.5H10.5V14.5H5.5Z"/><path d="M13 9H18.5M13 12H18.5M5.5 16.5H18.5"/>',
  fraktion: '<path d="M4.5 2.5H19.5V12.5L12 21.5L4.5 12.5Z"/><path d="M8.5 7.5H15.5M12 7.5V16"/>',
  ruhm: '<path d="M2.5 21V14.5H8V21M8 21V9.5H16V21M16 21V12.5H21.5V21M1.5 21H22.5"/><path d="M12 2.5L13.2 5H10.8Z"/>',
  clan: '<path d="M5 9.5L12 5L19 9.5M5 14.5L12 10L19 14.5M5 19.5L12 15L19 19.5"/>',
  funk: '<path d="M12 11V21.5M8 21.5H16"/><path d="M11 8.5H13V10.5H11Z"/><path d="M8.3 6a5 5 0 0 0 0 7.5M15.7 6a5 5 0 0 1 0 7.5M5.2 3a9 9 0 0 0 0 13.5M18.8 3a9 9 0 0 1 0 13.5"/>',
  einst: '<path d="M3 6H21M3 12H21M3 18H21"/><path d="M7 4H10V8H7ZM14 10H17V14H14ZM9 16H12V20H9Z" class="f"/>',
  steuerung: '<path d="M1.5 6.5H22.5V18.5H1.5Z"/><path d="M4.5 10H6.5M8.5 10H10.5M12.5 10H14.5M16.5 10H19.5M4.5 14H6.5M8.5 15H15.5M17.5 14H19.5"/>',
  logout: '<path d="M13.5 3.5H20.5V20.5H13.5"/><path d="M3 12H15M8 7L3 12L8 17"/>',
};
const icon = (k, cls = 'hb-ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ''}</svg>`;

/** Große Kachel: Beschriftung, Wert, eine Zeile Erklärung. Klick öffnet die Details. */
const tile = (det, label, value, subline = '', opts = {}) => `
  <button type="button" class="hb-tile${opts.lock ? ' is-lock' : ''}${opts.wide ? ' is-wide' : ''}" data-det="${det}">
    <span class="hb-tile-l"><span class="ls-label">${label}</span>${opts.lock ? LOCK : ''}</span>
    <b class="hb-tile-v">${value}</b>
    ${subline ? `<span class="hb-tile-s">${subline}</span>` : ''}
    <i class="hb-tile-go" aria-hidden="true"></i>
  </button>`;
const tiles = (...t) => `<div class="hb-tiles">${t.join('')}</div>`;
const ro = (label, value, cls = '') => `<div class="hb-ro ${cls}"><span class="ls-label">${label}</span><b class="ls-num">${value}</b></div>`;

function speedOf(P) {
  const ship = SHIPS[P.ship] || SHIPS.s1;
  let add = 0;
  for (const id of P.loadout?.gens || []) { const g = GENERATORS[id]; if (g?.kind === 'speed') add += g.value; }
  return ship.speed + add;
}
function shipStats(P) {
  const lo = P.loadout || { lasers: [], gens: [] };
  let dmg = 0, shield = 0;
  for (const id of lo.lasers || []) dmg += LASERS[id]?.damage || 0;
  for (const id of lo.gens || []) { const g = GENERATORS[id]; if (g?.kind === 'shield') shield += g.value; }
  return { dmg, shield };
}
const countOf = (list, id) => (list || []).reduce((a, x) => a + (x === id ? 1 : 0), 0);

// ---------------------------------------------------------------- Auftrag

function questBlock(P, compact = false) {
  const qi = P.quest?.index || 0;
  const q = QUESTS[qi];
  if (!q) return '<div class="mc-quest"><div class="mc-quest-h"><span class="ls-label">AUFTRÄGE</span><b>KEINE OFFENEN</b></div><p>Freier Flug. Die Station meldet sich bei neuer Lage.</p></div>';
  const prog = Math.min(P.quest?.progress || 0, q.goal.count);
  return `<div class="mc-quest">
    <div class="mc-quest-h"><span class="ls-label">AUFTRAG ${pad2(qi + 1)}/${pad2(QUESTS.length)}</span><b>${esc(q.title.toUpperCase())}</b><span class="ls-num">${fmt(prog)}/${fmt(q.goal.count)}</span></div>
    ${bar(prog / q.goal.count, 'is-shield')}
    ${compact ? '' : `<p>${esc(q.text)}</p>`}
    <div class="mc-reward"><span class="ls-label">BELOHNUNG</span><span class="ls-num">${rewardText(q)}</span></div>
  </div>`;
}
function rewardText(q) {
  const r = q.reward || {};
  return [r.credits ? `${fmt(r.credits)} CR` : '', r.xp ? `${fmt(r.xp)} EP` : '', r.tritium ? `${fmt(r.tritium)} TR` : '', r.honor ? `${fmt(r.honor)} EHRE` : ''].filter(Boolean).join(' · ');
}
function questList(P) {
  const qi = P.quest?.index || 0;
  return `<div class="hb-list">${QUESTS.map((q, i) => {
    const st = i < qi ? 'ERLEDIGT' : i === qi ? 'AKTIV' : 'FOLGT';
    return `<div class="hb-row${i === qi ? ' is-on' : i < qi ? ' is-done' : ' is-dim'}"><span class="ls-num">${pad2(i + 1)}</span><b>${esc(q.title.toUpperCase())}</b><span class="hb-row-d">${i === qi ? esc(q.text) : rewardText(q)}</span><span class="hb-chip">${st}</span></div>`;
  }).join('')}</div>`;
}

// ---------------------------------------------------------------- Start: Kurzinfos unter dem START-Knopf

function newsOf(P) {
  const f = FACTIONS[P.faction];
  const secs = homesOf(P.faction);
  const cur = secs.find((x) => x.id === P.sector) || secs[0];
  const names = [...new Set((cur?.spawns || []).map((sp) => ENEMIES[sp.type]?.name).filter(Boolean))];
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names[0] || 'Feindkontakte';
  return {
    from: f ? f.stationVoice.toUpperCase() : 'STATION',
    text: `${who} aktiv in ${cur ? cur.name : 'deinem Sektor'}. Frachter melden Beschuss, ${cur?.crates || 0} Frachtkisten treiben frei.`,
  };
}

function readiness(P) {
  const lo = P.loadout || { lasers: [] };
  const ammo = P.ammo || {};
  const miss = [];
  if (!(lo.lasers || []).length) miss.push('KEINE LASER');
  if (!Object.keys(AMMO).some((k) => (ammo[k] || 0) > 0)) miss.push('KEINE MUNITION');
  return miss;
}

// ---------------------------------------------------------------- Handel und Ausrüstung (direkt im Hub, über world.buy/equip)

const hex = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;
const ITEM_TEXT = {
  pulse: 'Standardlaser jeder Werft. Zuverlässig und günstig, aber schwach.',
  ion: 'Dichterer Ionenstrahl. Der übliche nächste Schritt nach dem Pulse Laser.',
  plasma: 'Gebündeltes Plasma, bezahlt in Tritium. Stärker als jeder Ion Laser.',
  gamma: 'Seltene Beute aus Wracks und Frachtkisten. Nicht im Handel.',
  dr1: 'Antriebsverstärker. Mehr Tempo für Verfolgung und Rückzug.',
  sh1: 'Schildgenerator. Fängt Treffer ab, bevor die Hülle Schaden nimmt.',
  L1: 'Grundmunition für alle Laser. Einfacher Schaden, fast geschenkt.',
  L2: 'Verstärkte Ladung, doppelter Schaden je Schuss.',
  L3: 'Hochenergie-Ladung, dreifacher Schaden. Bezahlt in Tritium.',
  L4: 'Schwerste Laserladung, vierfacher Schaden.',
  SAB: 'Trifft nur den Schild und saugt ihn ab. Die Hälfte fließt in deinen Schild.',
  SAL: 'Starker Einzelschuss mit sechsfachem Schaden und eigener Nachladezeit.',
  R1: 'Rakete auf das gewählte Ziel. Hoher Einzelschaden, alle drei Sekunden.',
  s1: 'Startschiff jeder Akte. Wendig, leicht bewaffnet.',
  s2: 'Mittleres Kampfschiff. Doppelte Bewaffnung, deutlich mehr Hülle.',
  s3: 'Schwerer Kreuzer der dritten Reihe. Noch in Erprobung.',
  s5: 'Großkampfschiff mit acht Laserplätzen. Noch in Erprobung.',
  s8: 'Flaggschiff der Flotte. Noch in Erprobung.',
};
const KIND_NAME = { ship: 'SCHIFF', laser: 'LASER', gen: 'GENERATOR', ammo: 'LASERMUNITION', rocket: 'RAKETE' };
const SHOP_TABS = [['ships', 'SCHIFFE'], ['lasers', 'LASER'], ['gens', 'GENERATOREN'], ['ammo', 'MUNITION']];
function tabItems(tab) {
  if (tab === 'ships') return Object.keys(SHIPS).map((id) => ['ship', id]);
  if (tab === 'lasers') return Object.keys(LASERS).map((id) => ['laser', id]);
  if (tab === 'gens') return Object.keys(GENERATORS).map((id) => ['gen', id]);
  return [...Object.keys(AMMO).map((id) => ['ammo', id]), ...Object.keys(ROCKETS).map((id) => ['rocket', id])];
}
const defOf = (kind, id) => ({ ship: SHIPS, laser: LASERS, gen: GENERATORS, ammo: AMMO, rocket: ROCKETS }[kind] || {})[id];
const itemName = (kind, id) => (kind === 'ship' ? shipName(id) : defOf(kind, id)?.name || id).toUpperCase();

/** Einkaufsstand eines Gegenstands: world.shopInfo, ohne Welt ein gesperrter Ersatz */
function infoOf(ctx, kind, id, n = 1) {
  const w = ctx.world();
  if (w) return w.shopInfo(kind, id, n);
  return { kind, id, cost: 0, currency: null, pack: 0, level: 1, ok: false, reason: 'Handel gerade nicht verfügbar.', owned: 0, equipped: 0 };
}
/** Schild der Zeile: klarer Text, Zustand als Klasse */
function statusOf(P, info, d) {
  if (d.dropOnly) return ['NUR ALS BEUTE', 'is-dim'];
  if (info.kind === 'ship' && info.equipped) return ['IM EINSATZ', 'is-on'];
  if (info.kind === 'ship' && info.owned) return ['IM BESITZ', 'is-own'];
  if (d.locked || (P.level || 1) < (info.level || 1)) return [`AB STUFE ${info.level || 1}`, 'is-dim'];
  if (!info.ok && info.currency && (P[info.currency] || 0) < info.cost) return [`FEHLEN ${fmt(info.cost - (P[info.currency] || 0))} ${CUR[info.currency]}`, 'is-short'];
  if (!info.ok) return ['GESPERRT', 'is-dim'];
  return ['KAUFBAR', 'is-buy'];
}
const priceHtml = (cost, cur) => (cost ? `${fmt(cost)} <span class="${cur === 'tritium' ? 'tr' : ''}">${CUR[cur] || ''}</span>` : '');

// Ersatzbilder (Linienzeichnung), bis das 3D-Bild bereit ist; Munition behält die Zeichnung
function laserGlyph(id) {
  const c = hex(LASERS[id]?.color ?? 0xffffff);
  return `<svg class="sh-gl" viewBox="0 0 120 60" aria-hidden="true"><path d="M10 24H64L72 19H92V41H72L64 36H10Z"/><path d="M92 26H108V34H92Z"/><path d="M18 30H60" class="g-c" style="stroke:${c}"/><path d="M110 30H118" class="g-c" style="stroke:${c}"/><path d="M76 24V36M82 24V36" class="g-t"/></svg>`;
}
function genGlyph(id) {
  const g = GENERATORS[id];
  const sym = g?.kind === 'shield' ? '<path d="M60 18L74 24V33C74 40 68 44 60 47C52 44 46 40 46 33V24Z" class="g-c"/>' : '<path d="M46 22L58 30L46 38M60 22L72 30L60 38" class="g-c"/>';
  return `<svg class="sh-gl" viewBox="0 0 120 60" aria-hidden="true"><path d="M30 10H90L98 18V50H22V18Z"/><path d="M22 50H98M30 54H90" class="g-t"/>${sym}</svg>`;
}
function ammoGlyph(kind, id) {
  if (kind === 'rocket') return '<svg class="sh-gl" viewBox="0 0 120 60" aria-hidden="true"><path d="M16 26H84L104 30L84 34H16Z"/><path d="M16 26L8 18H22L30 26M16 34L8 42H22L30 34"/><path d="M70 26V34" class="g-c"/></svg>';
  const a = AMMO[id] || { mult: 1 };
  const big = id === 'SAL';
  const n = big ? 1 : 3;
  let d = '', c = '';
  for (let i = 0; i < n; i++) {
    const w = big ? 22 : 13, x = big ? 49 : 30 + i * 22;
    d += `M${x} 50V22L${x + w / 2} ${big ? 8 : 12}L${x + w} 22V50Z`;
    const bands = Math.min(4, a.mult || 1);
    for (let b = 0; b < bands; b++) c += `M${x + 2} ${44 - b * 4}H${x + w - 2}`;
  }
  return `<svg class="sh-gl" viewBox="0 0 120 60" aria-hidden="true"><path d="${d}"/><path d="${c}" class="g-c${a.shieldOnly ? ' g-sh' : ''}"/><path d="M20 54H100" class="g-t"/></svg>`;
}
/** Vorschau: Schiffe und Bauteile als 3D-Bild (data-thumb), Munition als Zeichnung */
function preview(kind, id, cls = '') {
  const key = kind === 'ship' || kind === 'laser' || kind === 'gen' ? `${kind}:${id}` : '';
  const fb = kind === 'ship' ? shipSilhouette(shipNo(id) * 2 - 1) : kind === 'laser' ? laserGlyph(id) : kind === 'gen' ? genGlyph(id) : ammoGlyph(kind, id);
  return `<span class="sh-pv pv-${kind} ${cls}"${key ? ` data-thumb="${key}"` : ''}>${fb}</span>`;
}
const meter = (label, v, max, txt, delta = '') => `<div class="sh-m"><span class="ls-label">${label}</span><span class="sh-m-b">${bar(max ? v / max : 0, 'is-shield')}<span class="ls-tick"></span></span><b class="ls-num">${txt}</b><i class="sh-d${delta.startsWith('+') ? ' up' : delta.startsWith('−') ? ' dn' : ''}">${delta}</i></div>`;
const sgn = (v, unit = '') => (v > 0 ? `+${fmt(v)}${unit}` : v < 0 ? `−${fmt(-v)}${unit}` : '');

function itemMeters(P, kind, id) {
  const d = defOf(kind, id);
  const lo = P.loadout || { lasers: [], gens: [] };
  if (kind === 'laser') {
    const mx = Math.max(...Object.values(LASERS).map((x) => x.damage));
    const weakest = (lo.lasers || []).reduce((m, k) => Math.min(m, LASERS[k]?.damage ?? Infinity), Infinity);
    return meter('SCHADEN', d.damage, mx, fmt(d.damage), Number.isFinite(weakest) ? `${sgn(d.damage - weakest)}${d.damage !== weakest ? ' ZUM SCHWÄCHSTEN' : ''}` : '');
  }
  if (kind === 'gen') {
    const same = Object.values(GENERATORS).filter((g) => g.kind === d.kind);
    const mx = Math.max(...same.map((g) => g.value));
    return meter(d.kind === 'shield' ? 'SCHILD' : 'TEMPO', d.value, mx, `+${fmt(d.value)}`, '');
  }
  if (kind === 'ammo') {
    return meter('SCHADEN', d.mult, 6, `×${d.mult}`, d.shieldOnly ? 'NUR SCHILD' : '') + meter('PACKUNG', d.pack, 1000, fmt(d.pack), '');
  }
  if (kind === 'rocket') return meter('SCHADEN', d.damage, 1000, fmt(d.damage), '') + meter('NACHLADEN', d.cooldown, 6, `${String(d.cooldown).replace('.', ',')} S`, '');
  const cur = SHIPS[P.ship] || SHIPS.s1;
  const all = Object.values(SHIPS);
  const M = (k) => Math.max(...all.map((x) => x[k]));
  return meter('HÜLLE', d.hp, M('hp'), fmt(d.hp), sgn(d.hp - cur.hp))
    + meter('LASERPLÄTZE', d.laserSlots, M('laserSlots'), String(d.laserSlots), sgn(d.laserSlots - cur.laserSlots))
    + meter('GENERATOREN', d.genSlots, M('genSlots'), String(d.genSlots), sgn(d.genSlots - cur.genSlots))
    + meter('TEMPO', d.speed, M('speed'), fmt(d.speed), sgn(d.speed - cur.speed))
    + meter('LADERAUM', d.cargo, M('cargo'), fmt(d.cargo), sgn(d.cargo - cur.cargo));
}

function shopRow(P, ctx, kind, id) {
  const d = defOf(kind, id);
  const info = infoOf(ctx, kind, id);
  const [st, cls] = statusOf(P, info, d);
  const sel = ctx.sel && ctx.sel[0] === kind && ctx.sel[1] === id;
  let line = '';
  if (kind === 'laser') line = `${fmt(d.damage)} SCHADEN`;
  else if (kind === 'gen') line = genText(d);
  else if (kind === 'ammo') line = `${d.shieldOnly ? 'NUR SCHILD' : `SCHADEN ×${d.mult}`} · ${fmt(d.pack)} SCHUSS`;
  else if (kind === 'rocket') line = `${fmt(d.damage)} SCHADEN · ${fmt(d.pack)} STÜCK`;
  else line = `${fmt(d.hp)} HÜLLE · ${d.laserSlots} LASER · ${d.genSlots} GEN`;
  const have = kind === 'laser' || kind === 'gen' ? info.owned + info.equipped : kind === 'ammo' || kind === 'rocket' ? info.owned : 0;
  const haveTxt = have ? `<span class="sh-have">${kind === 'ammo' || kind === 'rocket' ? fmt(have) : `${have}×`} AN BORD</span>` : '';
  const pr = d.dropOnly ? '<span class="sh-na">KEIN HANDEL</span>' : kind === 'ship' && !d.price ? '<span class="sh-na">STARTSCHIFF</span>' : priceHtml(kind === 'ship' && info.owned ? d.price : info.cost, info.currency);
  return `<button type="button" class="sh-row ${cls}${sel ? ' is-sel' : ''}" data-pick="${kind}:${id}" aria-pressed="${sel}">
    ${preview(kind, id)}
    <span class="sh-rt"><b>${esc(itemName(kind, id))}</b><span class="sh-rs">${line}${haveTxt ? ' · ' : ''}${haveTxt}</span></span>
    <span class="sh-rr"><span class="sh-rp ls-num">${pr}</span><span class="sh-st">${st}</span></span>
  </button>`;
}

function inspector(P, ctx) {
  const [kind, id] = ctx.sel;
  const d = defOf(kind, id);
  const multi = kind === 'ammo' || kind === 'rocket';
  const n = multi ? ctx.qty : 1;
  const info = infoOf(ctx, kind, id, n);
  const [st, cls] = statusOf(P, info, d);
  const cur = info.currency;
  const after = cur ? (P[cur] || 0) - info.cost : 0;
  const switchShip = kind === 'ship' && info.owned && !info.equipped;
  const label = switchShip ? 'SCHIFF WECHSELN' : multi ? `${fmt(n * info.pack)} ${kind === 'rocket' ? 'STÜCK' : 'SCHUSS'} KAUFEN` : 'KAUFEN';
  let act;
  if (ctx.confirm && info.ok) {
    act = `<div class="sh-confirm" role="group" aria-label="Kauf bestätigen">
      <span class="sh-q">${switchShip ? `Auf ${esc(itemName(kind, id))} wechseln?` : `${esc(itemName(kind, id))}${multi ? ` × ${n}` : ''} für ${fmt(info.cost)} ${CUR[cur] || ''} kaufen?`}</span>
      <button type="button" class="ls-btn is-fx sh-ok" data-buyok>BESTÄTIGEN <span class="ls-key">ENTER</span></button>
      <button type="button" class="ls-btn sh-no" data-buyno>ABBRECHEN</button>
    </div>`;
  } else {
    act = `<button type="button" class="ls-btn is-fx sh-buy" data-buy ${info.ok ? '' : 'disabled'}>${info.ok ? label : st}</button>
      ${info.ok ? '' : `<p class="sh-why">${esc(info.reason)}</p>`}`;
  }
  const qty = multi ? `<div class="sh-qty"><span class="ls-label">PACKUNGEN</span>${[1, 5, 10, 25].map((q) => `<button type="button" class="mc-seg-b${q === n ? ' on' : ''}" data-qty="${q}" aria-pressed="${q === n}">${q}×</button>`).join('')}</div>` : '';
  const own = kind === 'laser' || kind === 'gen' ? `<span><span class="ls-label">EINGEBAUT</span><b class="ls-num">${info.equipped}</b></span><span><span class="ls-label">IM LAGER</span><b class="ls-num">${info.owned}</b></span>`
    : multi ? `<span><span class="ls-label">AN BORD</span><b class="ls-num">${fmt(info.owned)}</b></span><span><span class="ls-label">TASTE</span><b class="ls-num">${esc(String(d.key).toUpperCase())}</b></span>`
      : `<span><span class="ls-label">NUMMER</span><b class="ls-num">${pad2(shipNo(id))}</b></span><span><span class="ls-label">AB STUFE</span><b class="ls-num">${pad2(d.level || 1)}</b></span>`;
  const msg = ctx.msg ? `<div class="sh-msg ${ctx.msg.ok ? 'is-ok' : 'is-warn'}" role="status"><span class="ls-label">${ctx.msg.ok ? 'BESTÄTIGT' : 'HINWEIS'}</span><span>${esc(ctx.msg.text)}</span></div>` : '';
  return `<aside class="sh-ins ${cls}">
    ${preview(kind, id, 'is-big')}
    <div class="sh-ins-h"><span class="ls-label">${KIND_NAME[kind]}${kind === 'ship' ? ` · NR ${pad2(shipNo(id))}` : ` · ${esc(id.toUpperCase())}`}</span><span class="sh-st">${st}</span></div>
    <b class="sh-ins-t">${esc(itemName(kind, id))}</b>
    <p class="sh-ins-p">${esc(ITEM_TEXT[id] || '')}</p>
    <div class="sh-ms">${itemMeters(P, kind, id)}</div>
    <div class="sh-own">${own}</div>
    ${qty}
    <div class="sh-pay">
      <div class="sh-cost">
        <span><span class="ls-label">PREIS</span><b class="ls-num">${d.dropOnly ? '----' : info.cost ? priceHtml(info.cost, cur) : 'KOSTENLOS'}</b></span>
        <span><span class="ls-label">KONTO</span><b class="ls-num">${cur ? priceHtml(P[cur] || 0, cur) : '----'}</b></span>
        <span><span class="ls-label">DANACH</span><b class="ls-num${after < 0 ? ' is-neg' : ''}">${cur && info.cost ? (after < 0 ? `−${fmt(-after)} ${CUR[cur]}` : priceHtml(after, cur)) : '----'}</b></span>
      </div>
      ${act}
    </div>
    ${msg}
  </aside>`;
}

function shopView(P, ctx) {
  const items = tabItems(ctx.shopTab);
  if (!ctx.sel || !items.some(([k, id]) => k === ctx.sel[0] && id === ctx.sel[1])) {
    ctx.sel = items.find(([k, id]) => statusOf(P, infoOf(ctx, k, id), defOf(k, id))[1] === 'is-buy') || items[0];
    ctx.confirm = false;
  }
  const tabs = SHOP_TABS.map(([t, label]) => {
    const n = tabItems(t).filter(([k, id]) => statusOf(P, infoOf(ctx, k, id), defOf(k, id))[1] === 'is-buy').length;
    return `<button type="button" role="tab" class="sh-tab${t === ctx.shopTab ? ' is-on' : ''}" aria-selected="${t === ctx.shopTab}" data-tab="${t}"><span>${label}</span><i class="ls-num">${pad2(n)}</i></button>`;
  }).join('');
  return `<div class="sh">
    <div class="sh-tabs" role="tablist" aria-label="Warengruppen">${tabs}<span class="sh-tabs-r ls-label">ZAHL = JETZT KAUFBAR</span></div>
    <div class="sh-grid">
      <div class="sh-list" data-shlist>${items.map(([k, id]) => shopRow(P, ctx, k, id)).join('')}</div>
      ${inspector(P, ctx)}
    </div>
  </div>`;
}

// Hangar: Schiff groß in der Mitte, Steckplätze als Hardpoint-Leisten links (Laser) und rechts (Generatoren)
function hpCard(P, kind, i, id, ctx) {
  const src = kind === 'laser' ? LASERS : GENERATORS;
  const it = id && src[id];
  const code = `${kind === 'laser' ? 'L' : 'G'}${i + 1}`;
  const inv = (kind === 'laser' ? P.owned?.lasers : P.owned?.gens) || [];
  const open = ctx.pick === `${kind}:${i}`;
  const stat = it ? (kind === 'laser' ? `${fmt(it.damage)} SCHADEN` : genText(it)) : inv.length ? `${inv.length} IM LAGER · EINBAUEN` : 'FREI · KEIN TEIL IM LAGER';
  let pick = '';
  if (open) {
    const cnt = {};
    for (const x of inv) cnt[x] = (cnt[x] || 0) + 1;
    const opts = Object.entries(cnt).map(([k, c]) => `<button type="button" class="hg-opt" data-equip="${kind}:${i}:${k}">${preview(kind, k, 'is-sm')}<span><b>${esc(src[k].name.toUpperCase())}</b><span>${kind === 'laser' ? `${fmt(src[k].damage)} SCHADEN` : genText(src[k])}</span></span><i class="ls-num">${c}×</i></button>`).join('');
    pick = `<div class="hg-pick">
      <div class="hg-pick-h"><span class="ls-label">LAGER · ${kind === 'laser' ? 'LASER' : 'GENERATOREN'}</span><span class="ls-num">${pad2(inv.length)}</span></div>
      ${opts || '<p class="hg-empty">Kein passendes Teil im Lager.</p>'}
      <div class="hg-pick-a">${it ? `<button type="button" class="ls-btn" data-unequip="${kind}:${i}">AUSBAUEN</button>` : ''}<button type="button" class="ls-btn" data-goto="shop:${kind === 'laser' ? 'lasers' : 'gens'}">IM SHOP KAUFEN</button></div>
    </div>`;
  }
  return `<div class="hg-slot${open ? ' is-open' : ''}">
    <button type="button" class="hg-hp${it ? ' on' : ''}" data-slot="${kind}:${i}" data-hp="${code}" aria-expanded="${open}">
      <span class="hg-hp-id ls-num">${code}</span>
      ${it ? preview(kind, id, 'is-sm') : '<span class="sh-pv is-sm is-empty"><i></i></span>'}
      <span class="hg-hp-t"><b>${it ? esc(it.name.toUpperCase()) : 'FREI'}</b><span>${stat}</span></span>
      <i class="hg-hp-a" aria-hidden="true"></i>
    </button>${pick}
  </div>`;
}
function hangarView(P, ctx) {
  const ship = SHIPS[P.ship] || SHIPS.s1;
  const lo = P.loadout || { lasers: [], gens: [] };
  const { dmg, shield } = shipStats(P);
  const ammo = P.ammo || {};
  const sel = P.selectedAmmo || 'L1';
  let L = '', G = '';
  for (let i = 0; i < ship.laserSlots; i++) L += hpCard(P, 'laser', i, (lo.lasers || [])[i], ctx);
  for (let i = 0; i < ship.genSlots; i++) G += hpCard(P, 'gen', i, (lo.gens || [])[i], ctx);
  const am = [...Object.keys(AMMO), ...Object.keys(ROCKETS)].map((k) => `<span class="hg-am${k === sel ? ' sel' : ''}${(ammo[k] || 0) > 0 ? '' : ' is-zero'}"><span class="ls-label">${k}</span><b class="ls-num">${fmt(ammo[k])}</b></span>`).join('');
  const msg = ctx.msg ? `<div class="sh-msg hg-msg ${ctx.msg.ok ? 'is-ok' : 'is-warn'}" role="status"><span class="ls-label">${ctx.msg.ok ? 'UMBAU' : 'HINWEIS'}</span><span>${esc(ctx.msg.text)}</span></div>` : '';
  return `<div class="hg" data-hg>
    <svg class="hg-lines" data-lines aria-hidden="true"></svg>
    <div class="hg-col hg-l">
      <div class="hg-col-h"><span class="ls-label">LASER</span><span class="ls-num">${pad2((lo.lasers || []).length)}/${pad2(ship.laserSlots)}</span></div>
      <div class="hg-slots">${L}</div>
    </div>
    <div class="hg-mid">
      <div class="hg-frame" data-shipframe aria-hidden="true"></div>
      <div class="hg-tag"><span class="ls-label">AKTIVES SCHIFF · NR ${pad2(shipNo(P.ship))} · ${esc(FACTIONS[P.faction]?.prefix || '')}-${pad3(shipNo(P.ship))}</span><b>${esc(shipName(P.ship).toUpperCase())}</b></div>
      ${msg}
      <div class="hg-hint"><span class="ls-label">ZIEHEN</span><span>SCHIFF DREHEN</span></div>
    </div>
    <div class="hg-col hg-r">
      <div class="hg-col-h"><span class="ls-label">GENERATOREN</span><span class="ls-num">${pad2((lo.gens || []).length)}/${pad2(ship.genSlots)}</span></div>
      <div class="hg-slots">${G}</div>
    </div>
    <div class="hg-foot">
      <div class="hg-ros">${ro('HÜLLE', fmt(ship.hp))}${ro('SCHILD', fmt(shield))}${ro('SCHADEN', fmt(dmg))}${ro('TEMPO', fmt(speedOf(P)))}</div>
      <div class="hg-ammo"><span class="ls-label hg-ammo-h">MUNITION AN BORD</span><div>${am}</div></div>
      <div class="hg-acts">
        <button type="button" class="ls-btn" data-goto="shop:ships">WERFT</button>
        <button type="button" class="ls-btn is-fx" data-goto="shop:lasers">AUSRÜSTUNG KAUFEN</button>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- Pilotenakte

function xpOf(P) {
  const level = Math.max(1, P.level || 1), xp = P.xp || 0;
  const lo = xpForLevel(level), hi = xpForLevel(Math.min(MAX_LEVEL, level + 1));
  const prog = level >= MAX_LEVEL || hi <= lo ? 1 : Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
  return { level, xp, lo, hi, prog, max: level >= MAX_LEVEL };
}
function killTotal(P) {
  const kills = P.stats?.kills || {};
  return Object.keys(ENEMIES).reduce((a, k) => a + (kills[k] || 0), 0);
}
function akteView(P) {
  const { level, xp, lo, hi, prog, max } = xpOf(P);
  const ri = rankIndex(level);
  const st = P.stats || {};
  const kills = st.kills || {};
  const total = killTotal(P);
  const f = FACTIONS[P.faction];
  let since = '';
  try { since = P.created ? new Date(P.created).toLocaleDateString('de-DE') : ''; } catch { since = ''; }
  const ladder = RANKS.map((r, i) => `<span class="ak-rk${i === ri ? ' cur' : i < ri ? ' past' : ''}" title="${esc(r)} · ab Stufe ${i * 3 + 1}">${rankBadge(i * 3 + 1, 'sc-rank ak-rk-b')}<i class="ls-num">${pad2(i * 3 + 1)}</i></span>`).join('');
  let mx = 1;
  const foes = Object.entries(ENEMIES).filter(([k, e]) => !e.eventOnly || (kills[k] || 0) > 0);
  for (const [k] of foes) mx = Math.max(mx, kills[k] || 0);
  const scaleMax = Math.max(10, Math.ceil(mx / 10) * 10);
  const killRows = foes.map(([k, e]) => `<div class="ak-kill"><span class="mc-code">${ENEMY_CODE[k] || ''}</span><span class="ak-kn">${esc(e.name.toUpperCase())}</span><span class="ak-kb">${bar((kills[k] || 0) / scaleMax, 'is-shield')}<span class="ls-tick"></span></span><b class="ls-num">${fmt(kills[k] || 0)}</b></div>`).join('');
  const ratio = total / Math.max(1, st.deaths || 0);
  const cargo = Object.entries(P.cargo || {}).filter(([, n]) => n > 0).map(([k, n]) => `${esc(ORES[k]?.name || k)} ${fmt(n)}`).join(' · ');
  return `<div class="ak">
    <div class="ak-c">
      <section class="ak-id">
        <div class="ak-badge">${rankBadge(level, 'sc-rank ak-rank')}</div>
        <div class="ak-nm">
          <span class="ls-label">RUFNAME · ${esc(f ? f.name.toUpperCase() : '')}</span>
          <b>${esc(CS(P))}</b>
          <span class="ak-r">${esc(rankOf(level).toUpperCase())}</span>
          <div class="ak-nm-ro">${ro('STUFE', pad2(level))}${ro('RANG', `${pad2(ri + 1)}<i>/${RANKS.length}</i>`)}${ro('EHRE', fmt(P.honor))}</div>
        </div>
        ${emblem(P.faction, 'sc-emb ak-emb')}
      </section>
      <section class="ak-sec">
        ${sub('EP', 'ERFAHRUNG', `<span class="ls-num">${fmt(xp)}${max ? '' : ` / ${fmt(hi)}`}</span>`)}
        <div class="ak-xp">${bar(prog, 'is-shield')}<div class="ls-tick"></div>
          <div class="ak-xp-s ls-label"><span>ST ${pad2(level)} · ${fmt(lo)}</span><span>${max ? 'HÖCHSTSTUFE' : `NOCH ${fmt(Math.max(0, hi - xp))} EP`}</span><span>${max ? '' : `ST ${pad2(level + 1)} · ${fmt(hi)}`}</span></div>
        </div>
      </section>
      <section class="ak-sec">
        ${sub('RL', 'RANGLEITER', `<span class="ls-label">${ri < RANKS.length - 1 ? `NÄCHSTER: ${esc(RANKS[ri + 1].toUpperCase())} AB STUFE ${(ri + 1) * 3 + 1}` : 'HÖCHSTER RANG'}</span>`)}
        <div class="ak-ladder">${ladder}</div>
      </section>
    </div>
    <div class="ak-c">
      <section class="ak-sec">
        ${sub('KB', 'KAMPFBILANZ', `<span class="ls-label">SKALA 0–${scaleMax}</span>`)}
        <div class="ak-big">
          <div><span class="ls-label">ABSCHÜSSE</span><b class="ls-num">${fmt(total)}</b></div>
          <div><span class="ls-label">VERLUSTE</span><b class="ls-num">${fmt(st.deaths)}</b></div>
          <div><span class="ls-label">QUOTE</span><b class="ls-num">${ratio.toFixed(1).replace('.', ',')}</b></div>
        </div>
        <div class="ak-kills">${killRows}</div>
      </section>
      <section class="ak-sec">
        ${sub('DZ', 'DIENST')}
        <div class="ak-big ak-dz">
          <div><span class="ls-label">FLUGZEIT</span><b class="ls-num">${duration(st.playSeconds)}</b></div>
          <div><span class="ls-label">IM DIENST SEIT</span><b class="ls-num">${esc(since || '----')}</b></div>
          <div><span class="ls-label">FRACHTKISTEN</span><b class="ls-num">${fmt(st.crates)}</b></div>
        </div>
        <p class="mc-line ls-num ak-cargo"><span class="ls-label">LADERAUM</span> ${cargo || 'LEER'}</p>
      </section>
      <section class="ak-sec">
        ${sub('AU', 'AUFTRAG', `<span class="ls-num">${pad2(Math.min(P.quest?.index || 0, QUESTS.length))}/${pad2(QUESTS.length)} ERLEDIGT</span>`)}
        ${questBlock(P, true)}
        ${questList(P)}
      </section>
    </div>
  </div>`;
}

const HANGAR = { overview: (P, store, ctx) => hangarView(P, ctx), details: {} };
const SHOP = { overview: (P, store, ctx) => shopView(P, ctx), details: {} };
const AKTE = { overview: (P) => akteView(P), details: {} };

// ---------------------------------------------------------------- Fraktion

function startKit() {
  const p = newProfile('X', 'europa');
  const lz = {};
  for (const id of p.loadout.lasers) lz[id] = (lz[id] || 0) + 1;
  const rows = [
    ['SCHIFF', `${shipName(p.ship).toUpperCase()} NR ${pad2(shipNo(p.ship))}`, `${fmt(SHIPS[p.ship].hp)} HÜLLE`],
    ...Object.entries(lz).map(([id, n]) => ['LASER', `${n}× ${esc((LASERS[id]?.name || id).toUpperCase())}`, `${fmt(LASERS[id]?.damage)} SCH`]),
    ...p.loadout.gens.map((id) => ['GENERATOR', esc((GENERATORS[id]?.name || id).toUpperCase()), GENERATORS[id] ? genText(GENERATORS[id]) : '']),
    ['MUNITION', Object.entries(p.ammo).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${fmt(n)}`).join(' · '), ''],
    ['KONTO', `${fmt(p.credits)} CR · ${fmt(p.tritium)} TR`, ''],
  ];
  return rows.map(([a, b, c]) => `<div class="mc-tr"><span class="ls-label">${a}</span><span>${b}</span><span class="ls-num">${c}</span></div>`).join('');
}

function sectorDetail(P) {
  const secs = homesOf(P.faction);
  const cur = secs.find((x) => x.id === P.sector) || secs[0];
  const route = secs.map((x, i) => `
    ${i ? '<span class="mc-route-link" aria-hidden="true"><i></i></span>' : ''}
    <div class="mc-node${x.id === cur?.id ? ' is-cur' : ''}">
      <span class="ls-num">${esc(x.id)}</span><b>${esc(x.name.toUpperCase())}</b>
      <span class="ls-label">ST ${x.levelMin}–${x.levelMax}${x.station ? ' · STATION' : ''}</span>
    </div>`).join('');
  const contacts = (cur?.spawns || []).map((sp) => {
    const e = ENEMIES[sp.type];
    return `<div class="mc-tr"><span class="mc-code">${ENEMY_CODE[sp.type] || ''}</span><span>${esc(e?.name || sp.type)}</span><span class="ls-num">${pad2(sp.count)}</span><span class="ls-label">${BEH_SHORT[e?.behavior] || ''}</span><span class="ls-num">${fmt(e?.hp)}/${fmt(e?.shield)}</span></div>`;
  }).join('');
  const size = ((cur?.size || 0) * 2 / 1000).toFixed(1).replace('.', ',');
  return `
    <div class="mc-route">${route}</div>
    ${sub('TK', `KARTE ${esc(cur?.name.toUpperCase() || '')}`, `<span class="ls-num">${esc(cur?.id || '')} · ${size} × ${size} KM</span>`)}
    <div class="mc-chart-wrap">${sectorMap(cur, { faction: P.faction, speed: speedOf(P), uid: `hb-${P.faction}`, gateName: (id) => secs.find((x) => x.id === id)?.name || '' })}</div>
    <div class="mc-legend">
      <span><i class="lg-st"></i>STATION</span><span><i class="lg-pt"></i>TOR</span><span><i class="lg-me"></i>EIGEN</span>
      <span><i class="lg-foe"></i>KONTAKT</span><span><i class="lg-cr"></i>FRACHT</span><span><i class="lg-or"></i>ERZ</span><span><i class="lg-hz"></i>RANDZONE</span>
    </div>
    ${sub('KT', 'KONTAKTE', '<span class="ls-label">HÜLLE/SCHILD</span>')}
    <div class="mc-table mc-contacts">${contacts}</div>`;
}

const FRAKTION = {
  overview(P) {
    const f = FACTIONS[P.faction];
    if (!f) return '';
    const secs = homesOf(P.faction);
    const cur = secs.find((x) => x.id === P.sector) || secs[0];
    return `
      <div class="mc-fr-id hb-fr-id">
        ${emblem(P.faction, 'sc-emb mc-fr-emb')}
        <div>
          <span class="ls-label">FRAKTION · ${esc(f.prefix)}</span>
          <b class="mc-fr-name">${esc(f.name)}</b>
          <span class="mc-fr-title">${esc(f.title.toUpperCase())}</span>
          ${alignMeter(f.alignment)}
        </div>
      </div>
      <blockquote class="mc-motto">„${esc(f.motto)}“</blockquote>
      ${tiles(
        tile('sektoren', 'HEIMATSEKTOREN', `${secs.length}<i> SEKTOREN</i>`, `Karte und Kontakte · du bist in ${esc(cur?.name || '')}`),
        tile('kodex', 'KODEX', `${(KODEX[P.faction] || []).length}<i> REGELN</i>`, esc(f.leader)),
        tile('geschichte', 'GESCHICHTE', 'HERKUNFT', `Heimatgefahr: ${esc(BACKDROPS[P.faction]?.hazard || '')}`),
        tile('andere', 'ANDERE FRAKTIONEN', `${Object.keys(FACTIONS).length - 1}`, 'Stärke, Motto, Gesinnung'),
      )}`;
  },
  details: {
    sektoren: ['HEIMATSEKTOREN', (P) => sectorDetail(P)],
    kodex: ['KODEX', (P) => `<ol class="mc-kodex hb-kodex">${(KODEX[P.faction] || []).map((t, i) => `<li><span class="ls-num">§${i + 1}</span><span>${esc(t)}</span></li>`).join('')}</ol>`],
    geschichte: ['GESCHICHTE', (P) => {
      const f = FACTIONS[P.faction];
      return `<p class="mc-story hb-story">${esc(f.story)}</p>
        <div class="mc-kvs">${kv('ANFÜHRUNG', esc(f.leader))}${kv('FUNKRUF', esc(f.stationVoice))}${kv('HEIMATGEFAHR', esc(BACKDROPS[P.faction]?.hazard || ''))}</div>
        ${sub('SA', 'STARTAUSRÜSTUNG', '<span class="ls-label">JE NEUE AKTE</span>')}
        <div class="mc-table mc-kit">${startKit()}</div>`;
    }],
    andere: ['ANDERE FRAKTIONEN', (P, store) => {
      const reg = register(store);
      const cnt = Object.keys(FACTIONS).map((id) => ({ id, n: reg.filter((p) => p.faction === id).length, lv: reg.filter((p) => p.faction === id).reduce((a, p) => Math.max(a, p.level || 1), 0) }));
      const cmax = Math.max(1, ...cnt.map((c) => c.n));
      const strength = cnt.map((c) => `<div class="mc-str${c.id === P.faction ? ' me' : ''}" style="--fx:${accentOf(c.id)}"><span class="mc-rh-f"><i></i><b>${esc(FX_CODE[c.id])}</b>${esc(FACTIONS[c.id].name)}</span>${bar(c.n / cmax, 'is-shield')}<span class="ls-num">${pad2(c.n)}</span><span class="ls-label">ST MAX ${pad2(c.lv || 0)}</span></div>`).join('');
      const others = Object.values(FACTIONS).filter((o) => o.id !== P.faction).map((o) => `
        <div class="mc-other" style="--fx:${accentOf(o.id)}">${emblem(o.id, 'sc-emb mc-other-emb')}<div><b>${esc(o.name)}</b><span class="ls-label">${esc(o.title.toUpperCase())}</span><span class="mc-other-m">„${esc(o.motto)}“</span></div>${alignMeter(o.alignment)}</div>`).join('');
      return `<div class="mc-others">${others}</div>${sub('SR', 'FRAKTIONSSTÄRKE', '<span class="ls-label">DSN-REGISTER</span>')}<div class="mc-strs">${strength}</div>`;
    }],
  },
};

// ---------------------------------------------------------------- Ruhmeshalle

const RUHM = {
  overview(P, store) {
    const list = register(store);
    const meLc = String(P.callsign || '').toLowerCase();
    const myIdx = list.findIndex((p) => p.callsign.toLowerCase() === meLc);
    const top = list.slice(0, 3).map((p, i) => `${i + 1}. ${esc(p.callsign.toUpperCase())}`).join(' · ');
    const agg = Object.keys(FACTIONS).map((id) => ({ id, honor: list.filter((p) => p.faction === id).reduce((a, p) => a + (p.honor || 0), 0) })).sort((a, b) => b.honor - a.honor);
    return `
      <div class="hb-hero">
        <span class="ls-label">DEIN PLATZ IM STATIONSREGISTER</span>
        <b class="hb-hero-t">${myIdx >= 0 ? pad2(myIdx + 1) : '--'}<i> / ${pad2(list.length)}</i></b>
        <div class="hb-ros">${ro('EHRE', fmt(P.honor))}${ro('ABSCHÜSSE', fmt(killsOf(P)))}${ro('STUFE', pad2(P.level || 1))}</div>
      </div>
      ${tiles(
        tile('tafel', 'EHRENTAFEL', `${pad2(list.length)}<i> PILOTEN</i>`, top || 'Noch keine Einträge'),
        tile('vergleich', 'FRAKTIONSVERGLEICH', esc(FACTIONS[agg[0]?.id]?.name.toUpperCase() || ''), 'führt nach Ehre · Piloten, Ehre, Abschüsse'),
      )}`;
  },
  details: {
    tafel: ['EHRENTAFEL', (P, store) => {
      const list = register(store);
      const meLc = String(P.callsign || '').toLowerCase();
      const myIdx = list.findIndex((p) => p.callsign.toLowerCase() === meLc);
      const row = (p, i) => {
        const me = i === myIdx;
        return `<div class="mc-tr mc-rh${me ? ' me' : ''}" style="--fx:${accentOf(p.faction)}"><span class="ls-num">${pad2(i + 1)}</span><span>${esc(p.callsign.toUpperCase())}${me ? '<i class="mc-rh-you">DU</i>' : ''}</span><span class="mc-rh-f"><i></i><b>${esc(FX_CODE[p.faction] || '--')}</b>${esc(FACTIONS[p.faction]?.name || '')}</span><span class="ls-num">${pad2(p.level || 1)}</span><span class="ls-num">${fmt(p.honor)}</span><span class="ls-num">${fmt(killsOf(p))}</span></div>`;
      };
      const TOP = 15;
      let rows = list.slice(0, TOP).map(row).join('');
      if (myIdx >= TOP) rows += `<div class="mc-rh-gap ls-label">${pad2(myIdx - TOP + 1)} PILOTEN DAZWISCHEN</div>${row(list[myIdx], myIdx)}`;
      return `<div class="mc-table"><div class="mc-tr mc-th mc-rh"><span>PL</span><span>PILOT</span><span>FRAKTION</span><span>ST</span><span>EHRE</span><span>ABSCH.</span></div>${rows}</div>`;
    }],
    vergleich: ['FRAKTIONSVERGLEICH', (P, store) => {
      const list = register(store);
      const agg = Object.keys(FACTIONS).map((id) => {
        const ps = list.filter((p) => p.faction === id);
        return { id, n: ps.length, honor: ps.reduce((a, p) => a + (p.honor || 0), 0), kills: ps.reduce((a, p) => a + killsOf(p), 0) };
      });
      const mx = (k) => Math.max(1, ...agg.map((a) => a[k]));
      return `<div class="hb-cmp">${agg.map((a) => `<div class="hb-cmp-f" style="--fx:${accentOf(a.id)}">
          <span class="mc-rh-f"><i></i><b>${esc(FX_CODE[a.id])}</b>${esc(FACTIONS[a.id].name)}</span>
          <div class="mc-fv-m"><span class="ls-label">PILOTEN</span>${bar(a.n / mx('n'), 'is-shield')}<span class="ls-num">${pad2(a.n)}</span></div>
          <div class="mc-fv-m"><span class="ls-label">EHRE</span>${bar(a.honor / mx('honor'), 'is-shield')}<span class="ls-num">${fmt(a.honor)}</span></div>
          <div class="mc-fv-m"><span class="ls-label">ABSCHÜSSE</span>${bar(a.kills / mx('kills'), 'is-shield')}<span class="ls-num">${fmt(a.kills)}</span></div>
        </div>`).join('')}</div>`;
    }],
  },
};

// ---------------------------------------------------------------- Clan

const clanMod = (open, body) => `<section class="mc-cm${open ? '' : ' is-lock'}"><div class="mc-cm-b">${body}</div></section>${open ? '' : `<p class="hb-note">${LOCK} Vorschau. Clans öffnen ab Stufe ${CLAN_LEVEL}.</p>`}`;
const CLAN = {
  overview(P) {
    const level = P.level || 1;
    const open = level >= CLAN_LEVEL;
    const clans = CLANS[P.faction] || [];
    const secs = homesOf(P.faction);
    const held = secs.filter((x) => clans.some((q) => q[3] === x.id)).length;
    return `
      <div class="mc-locked hb-clanlock">
        <div class="mc-locked-ins">
          <svg class="mc-clan-emb" viewBox="0 0 120 124" aria-hidden="true"><path d="M14 4H106L116 14V86L60 120L4 86V14Z"/><path d="M18 10H102L110 18V83L60 113L10 83V18Z" class="d"/><path d="M44 62V52a16 16 0 0 1 32 0v10M38 62h44v30H38z" class="k"/></svg>
          <div><span class="ls-label">CLANREGISTER · ${esc(FACTIONS[P.faction]?.name || '')}</span><b>${open ? 'KEIN CLAN' : 'GESPERRT'}</b><span class="mc-locked-r">${open ? 'Aufnahme an der Station beantragen' : `FREIGABE AB STUFE ${CLAN_LEVEL}`}</span></div>
        </div>
        <div class="mc-locked-bar"><span class="ls-label">PILOTENSTUFE</span>${bar(Math.min(1, level / CLAN_LEVEL), 'is-shield')}<span class="ls-num">${pad2(Math.min(level, CLAN_LEVEL))}/${CLAN_LEVEL}</span></div>
      </div>
      ${tiles(
        tile('liste', 'CLANS DER STATION', `${pad2(clans.length)}`, 'Kürzel, Mitglieder, Sektor', { lock: !open }),
        tile('sektoren', 'CLAN-SEKTOREN', `${held}<i>/${secs.length}</i>`, 'unter Clan-Kontrolle', { lock: !open }),
        tile('raenge', 'RÄNGE UND RECHTE', '4', 'Anführung bis Anwärter', { lock: !open }),
        tile('kasse', 'CLANKASSE', '5 %', 'Abgabe aus der Beute', { lock: !open }),
      )}`;
  },
  details: {
    liste: ['CLANS DER STATION', (P) => {
      const list = (CLANS[P.faction] || []).map(([k, n, m, sec]) => `<div class="mc-tr mc-cl"><span class="mc-code mc-code-n">${k}</span><span>${esc(n.toUpperCase())}</span><span class="ls-num">${pad2(m)}</span><span class="ls-num">${esc(sec || '----')}</span></div>`).join('');
      return clanMod((P.level || 1) >= CLAN_LEVEL, `<div class="mc-table"><div class="mc-tr mc-th mc-cl"><span>KZ</span><span>NAME</span><span>MITGL.</span><span>SEKTOR</span></div>${list}</div>`);
    }],
    sektoren: ['CLAN-SEKTOREN', (P) => {
      const clans = CLANS[P.faction] || [];
      const rows = homesOf(P.faction).map((x) => {
        const c = clans.find((q) => q[3] === x.id);
        return `<div class="mc-tr mc-cs"><span class="ls-num">${esc(x.id)}</span><span>${esc(x.name.toUpperCase())}</span><span class="ls-label">${c ? `${c[0]} · ${esc(c[1].toUpperCase())}` : 'UMKÄMPFT'}</span></div>`;
      }).join('');
      return clanMod((P.level || 1) >= CLAN_LEVEL, `<div class="mc-table">${rows}</div>`);
    }],
    raenge: ['RÄNGE UND RECHTE', (P) => {
      const rows = [['ANFÜHRUNG', 'Aufnahme, Kasse, Kriegserklärung'], ['OFFIZIER', 'Aufnahme, Einsätze planen'], ['PILOT', 'Einsätze, Kasse einsehen'], ['ANWÄRTER', 'Funk, keine Kasse']]
        .map(([r, t], i) => `<div class="mc-tr mc-cr"><span class="ls-num">R${i + 1}</span><span>${r}</span><span class="mc-cr-t">${t}</span></div>`).join('');
      return clanMod((P.level || 1) >= CLAN_LEVEL, `<div class="mc-table">${rows}</div>`);
    }],
    kasse: ['CLANKASSE', (P) => clanMod((P.level || 1) >= CLAN_LEVEL, '<div class="sc-readouts three hb-big"><div><span class="ls-label">BESTAND</span><span class="ls-num">0 CR</span></div><div><span class="ls-label">ABGABE</span><span class="ls-num">5 %</span></div><div><span class="ls-label">TRITIUM</span><span class="ls-num tr">0</span></div></div>')],
  },
};

// ---------------------------------------------------------------- Funk

function funkData(P) {
  const f = FACTIONS[P.faction];
  const secs = homesOf(P.faction);
  const cur = secs.find((x) => x.id === P.sector) || secs[0];
  const stSec = secs.find((x) => x.station);
  const q = QUESTS[P.quest?.index || 0];
  const voice = f ? f.stationVoice.toUpperCase() : 'STATION';
  const dock = stSec ? `DOCK ${stSec.station.name.toUpperCase()}` : 'STATION';
  const news = newsOf(P);
  const log = [
    [voice, `${CS(P)}, Startfenster offen. Kurs ${cur ? cur.id : ''} ${cur ? cur.name : ''} freigegeben.`],
    ['FLUGLEITUNG', q ? `Auftrag ${pad2((P.quest?.index || 0) + 1)}: ${q.title}. ${q.text}` : 'Keine offenen Aufträge. Freier Flug.'],
    ['AUFKLÄRUNG', news.text],
  ];
  const gates = (cur?.portals || []).map((p) => {
    const to = secs.find((x) => x.id === p.to);
    return `Tor ${p.to} ${to ? to.name : ''} offen, Freigabe ab Stufe ${to ? to.levelMin : 1}.`;
  }).join(' ');
  const station = [
    [`${dock} · HANDEL`, `Erzannahme offen. ${Object.values(ORES).map((o) => `${o.name} ${fmt(o.price)} CR`).join(', ')} je Einheit.`],
    [`${dock} · WERFT`, `Reparatur ohne Kosten bis Stufe ${REPAIR.freeUntilLevel}. Danach ${fmt(REPAIR.station.credits)} CR je Schiffsnummer.`],
    [`${dock} · SICHERHEIT`, 'Sichere Zone 400 m um die Station. Waffen dort gesperrt. Andocken mit E.'],
    ['SPRUNGLEITSTELLE', gates || 'Keine Tore in diesem Sektor.'],
    ['AUFKLÄRUNG', `${pad2(cur?.crates || 0)} Frachtkisten treiben im Sektor. Einzelne sind Piratenfallen.`],
  ];
  return { log, station, dock, voice, dockName: stSec ? `Dock ${stSec.station.name}` : 'Station' };
}
const msgs = (rows, cls = '') => {
  const now = utcClock().slice(0, 5);
  return `<div class="mc-log">${rows.map(([from, text]) => `<div class="mc-msg ${cls}"><span class="ls-num">${now}</span><span class="mc-msg-f">${esc(from)}</span><span class="mc-msg-t">${esc(text)}</span></div>`).join('')}</div>`;
};
const FUNK = {
  overview(P) {
    const d = funkData(P);
    const [from, text] = d.log[0];
    return `
      <div class="hb-msg">
        <div class="hb-msg-h"><span class="ls-label sc-live">KANAL 08 · ZULETZT</span><span class="ls-num">${utcClock().slice(0, 5)}</span></div>
        <b>${esc(from)}</b>
        <p>${esc(text)}</p>
      </div>
      ${tiles(
        tile('protokoll', 'FUNKPROTOKOLL', `${pad2(d.log.length)}<i> MELDUNGEN</i>`, 'Station, Flugleitung, Aufklärung'),
        tile('station', 'STATIONSMELDUNGEN', `${pad2(d.station.length)}<i> MELDUNGEN</i>`, esc(`${d.dockName} · Handel, Werft, Tore`)),
        tile('gegner', 'AUFKLÄRUNG', `${pad2(Object.keys(ENEMIES).length)}<i> GEGNERTYPEN</i>`, 'Verhalten, Stärke, Fundort', { wide: true }),
      )}`;
  },
  details: {
    protokoll: ['FUNKPROTOKOLL', (P) => msgs(funkData(P).log)],
    station: ['STATIONSMELDUNGEN', (P) => msgs(funkData(P).station, 'mc-msg-st')],
    gegner: ['AUFKLÄRUNG · GEGNER', (P) => {
      const where = {};
      for (const sec of homesOf(P.faction)) for (const sp of sec.spawns || []) (where[sp.type] ||= []).push(sec.id);
      const rows = Object.entries(ENEMIES).filter(([, e]) => !e.eventOnly).map(([k, e]) => `
        <div class="hb-foe">
          <div class="hb-foe-h"><i class="mc-code">${ENEMY_CODE[k] || ''}</i><b>${esc(e.name.toUpperCase())}</b><span class="ls-label">${BEH_SHORT[e.behavior] || ''}</span><span class="ls-num">${esc((where[k] || []).join(' · '))}</span></div>
          <p>${esc(BEHAVIOR[e.behavior] || '')}</p>
          <div class="hb-foe-v"><span><span class="ls-label">HÜLLE</span><span class="ls-num">${fmt(e.hp)}</span></span><span><span class="ls-label">SCHILD</span><span class="ls-num">${fmt(e.shield)}</span></span><span><span class="ls-label">SCHADEN</span><span class="ls-num">${fmt(e.damage)}</span></span><span><span class="ls-label">REICHWEITE</span><span class="ls-num">${fmt(e.range)} M</span></span></div>
        </div>`).join('');
      return `<div class="hb-foes">${rows}</div>`;
    }],
  },
};

// ---------------------------------------------------------------- Einstellungen

const HUD_KEY = 'ls.hud.layout';
const HUD_TOGGLE = ['target', 'pilot', 'ship', 'quest', 'weapons'];
function hudRead() {
  try { const v = JSON.parse(localStorage.getItem(HUD_KEY) || 'null'); return v && typeof v === 'object' && v.v === 1 ? v : null; } catch { return null; }
}
function hudWrite(v) { try { localStorage.setItem(HUD_KEY, JSON.stringify(v)); } catch { /* privater Modus */ } }
function hudState() {
  const v = hudRead();
  const modes = HUD_TOGGLE.map((id) => v?.win?.[id]?.mode || 'num');
  const mode = modes.every((m) => m === 'num') ? 'num' : modes.every((m) => m === 'bar') ? 'bar' : 'mix';
  return { locked: !!v?.locked, mode, saved: !!v };
}
function hudSet(fn) { const v = hudRead() || { v: 1, locked: false, win: {} }; v.win ||= {}; fn(v); hudWrite(v); }

function seg(key, opts, cur) {
  return `<div class="mc-seg" role="radiogroup" data-key="${key}">${opts.map(([v, label]) =>
    `<button type="button" role="radio" class="mc-seg-b${String(v) === String(cur) ? ' on' : ''}" aria-checked="${String(v) === String(cur)}" data-set="${key}" data-val="${v}">${label}</button>`).join('')}</div>`;
}
const Q_LABEL = { ultra: 'ULTRA', high: 'HOCH', medium: 'MITTEL', low: 'NIEDRIG' };
const Q_DESC = {
  ultra: 'Volle Pixeldichte 2, fein gebackener Himmel, 9.000 Sterne, Nachleuchten, Kamera-Look.',
  high: 'Pixeldichte 2 mit automatischer Anpassung, Nachleuchten, Kamera-Look. Empfohlen.',
  medium: 'Pixeldichte 1,5, weniger Partikel und Kulisse.',
  low: 'Pixeldichte 1, ohne Nachleuchten. Für ältere Rechner.',
};
const setRow = (title, desc, ctl, attr = '') => `<div class="mc-set-row"><div class="mc-set-l"><b>${title}</b><span class="mc-set-d" ${attr}>${desc}</span></div>${ctl}</div>`;
function hudPreview() {
  return `<div class="mc-hp" data-hp>
    <div class="mc-hp-in" data-hpk>
      <div class="mc-hp-w">
        <div class="ls-head"><span class="ls-code">SYS·02</span><span class="ls-title">SCHIFF</span><span class="ls-spacer"></span><span class="mc-hp-lock">${LOCK}</span><span class="mc-hp-b">[–]</span></div>
        <div class="mc-hp-row"><span class="ls-label">SCHILD</span><div class="ls-bar is-shield" style="--v:.82;--trail:0"></div><span class="ls-num mc-hp-v">1.640 / 2.000</span></div>
        <div class="mc-hp-row"><span class="ls-label">HÜLLE</span><div class="ls-bar" style="--v:.64;--trail:.7"></div><span class="ls-num mc-hp-v">3.840 / 6.000</span></div>
        <div class="mc-hp-row"><span class="ls-label">TEMPO</span><div class="ls-bar" style="--v:.4;--trail:0"></div><span class="ls-num mc-hp-v">136 / 340</span></div>
      </div>
    </div>
  </div>`;
}
function einstView() {
  const s = settings();
  const h = hudState();
  return `<div class="st">
    <div class="st-c">
      <section class="ak-sec">
        ${sub('GR', 'DARSTELLUNG', '<span class="ls-label" data-saved>BEREIT</span>')}
        <div class="mc-set st-set">
          ${setRow('GRAFIKQUALITÄT', Q_DESC[s.quality], seg('quality', [['ultra', 'ULTRA'], ['high', 'HOCH'], ['medium', 'MITTEL'], ['low', 'NIEDRIG']], s.quality), 'data-qdesc')}
          ${setRow('BEWEGUNG REDUZIEREN', 'Kein Flackern, kein Sternenflug, Szene steht.', seg('reducedMotion', [[false, 'AUS'], [true, 'AN']], s.reducedMotion))}
        </div>
      </section>
      <section class="ak-sec">
        ${sub('LS', 'LEISTUNG', '<span class="ls-label sc-live">LIVE</span>')}
        <div class="st-fps"><b class="ls-num" data-fps>-- B/S</b>
          <div class="mc-perf">${bar(0, 'is-shield')}<div class="ls-tick"></div><div class="mc-perf-s ls-label"><span>0</span><span>30</span><span>60</span><span>90</span><span>120 B/S</span></div></div>
        </div>
        <div class="sc-readouts three st-ro">
          <div><span class="ls-label">AUFLÖSUNG 3D</span><span class="ls-num" data-res>----</span></div>
          <div><span class="ls-label">NACHLEUCHTEN</span><span class="ls-num" data-bloom>----</span></div>
          <div><span class="ls-label">KANTENGLÄTTUNG</span><span class="ls-num" data-aa>----</span></div>
          <div><span class="ls-label">SCHATTEN</span><span class="ls-num" data-shadow>----</span></div>
          <div><span class="ls-label">PLANETEN</span><span class="ls-num" data-ptex>----</span></div>
          <div><span class="ls-label">FENSTER</span><span class="ls-num">${innerWidth} × ${innerHeight} · ${(window.devicePixelRatio || 1).toFixed(1).replace('.', ',')}×</span></div>
        </div>
      </section>
      <section class="ak-sec">
        ${sub('VS', 'VORSCHAU HUD')}
        ${hudPreview()}
      </section>
    </div>
    <div class="st-c">
      <section class="ak-sec">
        ${sub('HD', 'HUD IM FLUG', '<span class="ls-label">AB NÄCHSTEM START</span>')}
        <div class="mc-set st-set">
          ${setRow('HUD-GRÖSSE', 'Skaliert alle Fenster im Flug.', seg('hudScale', [[0.85, '85 %'], [1, '100 %'], [1.15, '115 %'], [1.3, '130 %']], s.hudScale))}
          ${setRow('ANZEIGE STANDARD', 'Schiff, Ziel, Pilot, Auftrag, Waffen. Je Fenster weiter umschaltbar.', seg('hudMode', [['bar', 'BALKEN'], ['num', 'WERTE']], h.mode))}
          ${setRow('LAYOUT SPERREN', 'Fenster bleiben an ihrem Platz.', seg('hudLock', [[false, 'AUS'], [true, 'AN']], h.locked))}
          ${setRow('LAYOUT ZURÜCKSETZEN', 'Positionen, Zuklappen und Anzeige auf Werkseinstellung.', '<button type="button" class="ls-btn mc-reset" data-hudreset>ZURÜCKSETZEN</button>')}
        </div>
      </section>
    </div>
  </div>`;
}
const EINST = { overview: () => einstView(), details: {} };

// ---------------------------------------------------------------- Steuerung

const KEYS = [
  ['flug', 'FLUG UND KAMERA', [
    [['LMB'], 'Hinfliegen, Klick ins All'],
    [['LMB', 'HALTEN'], 'Dem Mauszeiger folgen'],
    [['W', 'A', 'S', 'D'], 'Direkt steuern, auch Pfeiltasten'],
    [['RAD'], 'Kamera näher oder weiter'],
    [['J'], 'Sprung, im Umkreis von 150 m um ein Tor'],
    [['E'], 'Andocken in der sicheren Zone, angedockt: Abdocken'],
    [['ESC'], 'Bordmenü'],
  ]],
  ['kampf', 'KAMPF', [
    [['LMB'], 'Gegner anklicken: Ziel wählen'],
    [['2×LMB'], 'Ziel wählen und angreifen'],
    [['TAB'], 'Nächster Gegner als Ziel'],
    [['LEER'], 'Angriff an oder aus'],
    [['1', '2', '3', '4'], 'Munition L1 bis L4'],
    [['5'], 'SAB, saugt Schild ab'],
    [['6'], 'SAL, starker Einzelschuss'],
    [['R'], 'Rakete R1 auf das Ziel'],
  ]],
  ['mc', 'MISSION CONTROL', [
    [['ENTER'], 'Ins All starten'],
    [['1', '…', '0'], 'Bereich wählen'],
    [['↑', '↓'], 'Bereich wechseln, in der Liste links'],
    [['ESC'], 'Zurück, dann zur Startseite'],
  ]],
];
const KB = [
  [['ESC', 'MENÜ', 1.5], ['1', 'L1'], ['2', 'L2'], ['3', 'L3'], ['4', 'L4'], ['5', 'SAB'], ['6', 'SAL'], ['7'], ['8'], ['9'], ['0']],
  [['TAB', 'ZIEL', 1.5], ['Q'], ['W', 'VOR'], ['E', 'DOCK'], ['R', 'R1'], ['T'], ['Z'], ['U'], ['I'], ['O'], ['P']],
  [['⇪', '', 1.75], ['A', 'LINKS'], ['S', 'ZURÜCK'], ['D', 'RECHTS'], ['F'], ['G'], ['H'], ['J', 'SPRUNG'], ['K'], ['L'], ['Ö', '', 0.75]],
  [['⇧', '', 2.25], ['Y'], ['X'], ['C'], ['V'], ['B'], ['N'], ['M'], ['⇧', '', 2.25]],
  [['CTRL', '', 1.5], ['⌥', '', 1.25], ['⌘', '', 1.25], ['LEERTASTE', 'ANGRIFF', 5], ['⌘', '', 1.25], ['⌥', '', 1.25]],
];
function keyboard() {
  return `<div class="mc-kb" aria-hidden="true">${KB.map((row) => `<div class="mc-kb-r" style="grid-template-columns:${row.map((r) => `${r[2] || 1}fr`).join(' ')}">${row.map(([k, fn]) =>
    `<span class="mc-kb-k${fn ? ' on' : ''}"><b>${k}</b>${fn ? `<i>${fn}</i>` : ''}</span>`).join('')}</div>`).join('')}</div>`;
}
const STEUERUNG = {
  overview() {
    return `${keyboard()}${tiles(...KEYS.map(([id, t, rows]) => tile(id, t, `${pad2(rows.length)}<i> BEFEHLE</i>`, esc(rows[0][1]), { wide: id === 'mc' })))}`;
  },
  details: Object.fromEntries(KEYS.map(([id, t, rows]) => [id, [t, () => `<div class="hb-keys">${rows.map(([keys, txt]) =>
    `<div class="mc-key"><span class="mc-key-k">${keys.map((k) => (k === '…' ? '<span class="ls-label">BIS</span>' : `<span class="ls-key">${k}</span>`)).join('')}</span><span>${esc(txt)}</span></div>`).join('')}</div>`]])),
};

// ---------------------------------------------------------------- Lade-Silhouette der Station

/** Drahtgitter der Heimatstation, solange die 3D-Szene aufgebaut wird (zeichnet sich Linie für Linie) */
function stationWire(faction) {
  const L = (d, k = '') => `<path d="${d}" pathLength="1" class="${k}"/>`;
  const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  let g = '';
  if (faction === 'saturn') {
    g += L(ell(200, 160, 168, 50)) + L(ell(200, 160, 146, 40), 'w2') + L(ell(200, 168, 168, 50), 'w2');
    g += L('M178 60V250M222 60V250M178 60Q200 50 222 60M178 250Q200 258 222 250M184 40V60M216 40V60M184 40H216M200 40V8');
    g += L('M178 160L60 130M222 160L340 190M200 115L180 112M200 205L230 208', 'w2');
    g += L('M196 250V330M204 250V330M196 270L204 280M204 290L196 300M196 310L204 320M170 330H230V342H170Z');
    g += L('M60 150v20M340 150v20M130 118v12M270 202v12', 'w3');
  } else if (faction === 'eris') {
    g += L('M180 40L220 40L232 60V250L220 270H180L168 250V60Z') + L('M190 40V270M210 40V270M168 120H232M168 200H232', 'w2');
    g += L('M200 40V2M188 40V18M214 40V12');
    let p = '';
    for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; p += `${i ? 'L' : 'M'}${(200 + Math.cos(a) * 160).toFixed(1)} ${(185 + Math.sin(a) * 44).toFixed(1)}`; }
    g += L(p) + L(p.replace(/ (\d+\.\d)/g, (m, y) => ` ${(Number(y) + 10).toFixed(1)}`), 'w2');
    g += L('M168 190L60 175M232 190L340 200M180 270L140 300M220 270L260 300', 'w2');
  } else {
    g += L('M176 60H224V250H176ZM186 30H214V60M190 250H210V290') + L('M176 100H224M176 140H224M176 180H224M176 220H224', 'w2');
    g += L('M200 30V2M224 150H380M176 150H20M224 140H380M176 140H20', 'w2');
    g += L('M300 100H340V190H300ZM350 100H390V190H350ZM60 100H100V190H60ZM10 100H50V190H10Z');
    g += L('M200 290V345M195 300L205 310M205 320L195 330', 'w3');
  }
  return `<svg class="mc-wire" viewBox="0 0 400 350" aria-hidden="true">${g}<rect class="mc-wire-scan" x="0" y="0" width="400" height="2"/></svg>`;
}

// ---------------------------------------------------------------- Hub

// Reihenfolge laut Toni; Taste 1–9, 0 für den zehnten Bereich. sep = Trennlinie davor.
const SECTIONS = [
  { key: 'start', title: 'START' },
  { key: 'hangar', title: 'HANGAR', impl: HANGAR },
  { key: 'shop', title: 'SHOP', impl: SHOP },
  { key: 'akte', title: 'PILOTENAKTE', impl: AKTE, sep: true },
  { key: 'fraktion', title: 'FRAKTION', impl: FRAKTION },
  { key: 'ruhm', title: 'RUHMESHALLE', impl: RUHM },
  { key: 'clan', title: 'CLAN', impl: CLAN },
  { key: 'funk', title: 'FUNK', impl: FUNK },
  { key: 'einst', title: 'EINSTELLUNGEN', impl: EINST, sep: true },
  { key: 'steuerung', title: 'STEUERUNG', impl: STEUERUNG },
];
const ICON_OF = { start: 'start', hangar: 'hangar', shop: 'shop', akte: 'akte', fraktion: 'fraktion', ruhm: 'ruhm', clan: 'clan', funk: 'funk', einst: 'einst', steuerung: 'steuerung' };

let lastSection = 'start';

function lvlHtml(P) {
  const { level, xp, hi, prog, max } = xpOf(P);
  return `<div class="hb-lvl-n"><span class="ls-label">STUFE</span><b class="ls-num">${pad2(level)}</b></div>
        <div class="hb-xp">
          <div class="hb-xp-h"><span class="ls-label">ERFAHRUNG</span><span class="ls-num">${fmt(xp)}${max ? '' : ` / ${fmt(hi)}`}</span></div>
          ${bar(prog, 'is-shield')}
        </div>`;
}
const accHtml = (P) => `${ro('CREDITS', fmt(P.credits))}${ro('TRITIUM', fmt(P.tritium), 'is-tr')}${ro('EHRE', fmt(P.honor))}`;

/** Kurzanzeige unten in der linken Leiste: Sektorlage und aktiver Auftrag mit Messskalen */
function railMini(P, sector) {
  const secs = homesOf(P.faction);
  const cnt = (x) => (x?.spawns || []).reduce((a, sp) => a + (sp.count || 0), 0);
  const n = cnt(sector), mx = Math.max(1, ...secs.map(cnt));
  const lv = P.level || 1;
  const lo = sector?.levelMin || 1, hi = Math.max(lo + 1, sector?.levelMax || lo + 1);
  const pos = Math.max(0, Math.min(1, (lv - lo) / (hi - lo)));
  const q = QUESTS[P.quest?.index || 0];
  const qp = q ? Math.min(P.quest?.progress || 0, q.goal.count) : 0;
  return `<div class="hb-mini-in">
    <button type="button" class="hb-mini-b" data-goto="fraktion:sektoren">
      <span class="hb-mini-h"><span class="ls-label sc-live">SEKTOR ${esc(P.sector || '')}</span><span class="ls-num">ST ${lo}–${sector?.levelMax || lo}</span></span>
      <b>${esc(sector ? sector.name.toUpperCase() : '----')}</b>
      <span class="hb-mini-m"><span class="ls-label">KONTAKTE</span>${bar(n / mx)}<span class="ls-num">${pad2(n)}</span></span>
      <span class="hb-mini-m"><span class="ls-label">STUFE</span><span class="hb-mini-sc"><span class="ls-tick"></span><i style="left:${(pos * 100).toFixed(1)}%"></i></span><span class="ls-num">${pad2(lv)}</span></span>
    </button>
    <button type="button" class="hb-mini-b hb-mini-q" data-goto="akte">
      <span class="hb-mini-h"><span class="ls-label">AUFTRAG${q ? ` ${pad2((P.quest?.index || 0) + 1)}` : ''}</span><span class="ls-num">${q ? `${fmt(qp)}/${fmt(q.goal.count)}` : '--'}</span></span>
      <b>${q ? esc(q.title.toUpperCase()) : 'FREIER FLUG'}</b>
      ${q ? bar(qp / q.goal.count, 'is-shield') : ''}
    </button>
  </div>`;
}

export async function hubScreen(root, profile, store) {
  const P = profile || {};
  const f = FACTIONS[P.faction];
  const { level } = xpOf(P);
  let sector = null;
  try { sector = sectorsFor(P.faction)[P.sector] || null; } catch { sector = null; }
  const homeSt = homesOf(P.faction).find((x) => x.station);
  const clanOpen = level >= CLAN_LEVEL;
  const st = stage.available();
  const s = mount(root, 'hub', 'Mission Control', accentOf(P.faction), { stage: st });
  if (st) s.scr.classList.add('is-loading');

  const q = QUESTS[P.quest?.index || 0];
  const qProg = q ? Math.min(P.quest?.progress || 0, q.goal.count) : 0;
  const news = newsOf(P);
  const miss = readiness(P);
  const secName = sector ? sector.name.toUpperCase() : '';

  const nav = SECTIONS.map((x, i) => `${x.sep ? '<span class="hb-sep" aria-hidden="true"></span>' : ''}
    <button type="button" class="hb-nv${x.key === 'clan' && !clanOpen ? ' is-lock' : ''}" data-sec="${x.key}" aria-current="false">
      <span class="hb-nv-ic">${icon(ICON_OF[x.key])}</span><span class="hb-nv-t">${x.title}</span>${x.key === 'clan' && !clanOpen ? LOCK : ''}<span class="hb-nv-k ls-num" aria-hidden="true">${(i + 1) % 10}</span>
    </button>`).join('');

  s.inner.innerHTML = `
  <div class="sc-page hub hb">
    <header class="hb-top rise">
      <div class="hb-brand">${insignia('sc-ins-mini')}<div><b>LAST SIGNALS</b><span class="ls-label">MISSION CONTROL · ${esc(f ? f.name.toUpperCase() : '')}</span></div></div>
      <div class="hb-pilot">
        ${rankBadge(level, 'sc-rank hb-rank')}
        <div class="hb-id"><b>${esc(CS(P))}</b><span class="ls-label">${esc(rankOf(level).toUpperCase())}</span></div>
      </div>
      <div class="hb-lvl" data-lvl>${lvlHtml(P)}</div>
      <div class="hb-acc" data-acc>${accHtml(P)}</div>
    </header>
    <div class="hb-body">
      <nav class="ls-panel hb-rail rise" style="--d:1" aria-label="Bereiche">
        <div class="ls-corners"></div>
        <div class="hb-nav" data-nav>${nav}</div>
        <div class="hb-mini" data-mini>${railMini(P, sector)}</div>
        <button type="button" class="hb-nv hb-out" data-logout><span class="hb-nv-ic">${icon('logout')}</span><span class="hb-nv-t">ABMELDEN</span></button>
        <span class="hb-ver ls-label">${VERSION}</span>
      </nav>
      <div class="hb-center" data-center data-sec="start">
        ${st ? `<div class="mc-load" data-load role="status" aria-live="polite">
          ${stationWire(P.faction)}
          <div class="mc-load-in">
            <div class="mc-load-h"><span class="ls-label">SZENE · ${esc(homeSt ? homeSt.id : '')}</span><span class="ls-num" data-lpct>000 %</span></div>
            <b>SZENE WIRD AUFGEBAUT</b>
            <div class="ls-bar is-shield" style="--v:0;--trail:0" data-lbar></div>
            <div class="ls-tick"></div>
            <div class="mc-load-log" data-llog></div>
          </div>
        </div>` : ''}
        <div class="hb-start" data-startpage>
          <div class="hb-stagebox" data-stagebox></div>
          <div class="hb-tag rise" style="--d:3"><span class="ls-label">HEIMAT · ${esc(homeSt ? homeSt.id : '')}</span><b>STATION ${esc(homeSt ? homeSt.station.name.toUpperCase() : '')}</b></div>
          <div class="hb-launch rise" style="--d:2">
            <button type="button" class="hb-go" data-launch>
              <span class="hb-go-ic">${icon('start')}</span>
              <span class="hb-go-t"><b>START</b><span class="hb-go-s${miss.length ? ' is-warn' : ''}">${miss.length ? esc(miss.join(' · ')) : `INS ALL · ${esc(P.sector || '')} ${esc(secName)}`}</span></span>
              <span class="ls-key">ENTER</span>
            </button>
            <div class="hb-brief">
              <button type="button" class="hb-bf" data-goto="akte:auftrag">
                <span class="ls-label">AUFTRAG${q ? ` ${pad2((P.quest?.index || 0) + 1)}` : ''}</span>
                <b>${q ? esc(q.title.toUpperCase()) : 'FREIER FLUG'}</b>
                ${q ? `<span class="hb-bf-p">${bar(qProg / q.goal.count, 'is-shield')}<span class="ls-num">${fmt(qProg)}/${fmt(q.goal.count)}</span></span>` : '<span class="hb-bf-s">Keine offenen Aufträge</span>'}
              </button>
              <button type="button" class="hb-bf" data-goto="fraktion:sektoren">
                <span class="ls-label">SEKTOR ${esc(P.sector || '')}</span>
                <b>${esc(secName)}</b>
                <span class="hb-bf-s">Stufe ${sector ? `${sector.levelMin}–${sector.levelMax}` : ''}${sector?.station ? ' · Station' : ''}</span>
              </button>
              <button type="button" class="hb-bf is-news" data-goto="funk">
                <span class="ls-label">NEUIGKEIT · ${esc(news.from)}</span>
                <span class="hb-bf-n">${esc(news.text)}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="hb-sec" data-secpage>
          <section class="ls-panel hb-panel" aria-live="polite">
            <div class="ls-corners"></div>
            <header class="hb-ph">
              <span class="hb-ph-ic" data-picon></span>
              <div class="hb-ph-t"><span class="ls-label" data-crumb></span><h2 data-ptitle></h2></div>
              <span class="ls-spacer"></span>
              <button type="button" class="ls-btn hb-back" data-back hidden><i aria-hidden="true"></i>ZURÜCK <span class="ls-key">ESC</span></button>
            </header>
            <div class="hb-pb" tabindex="-1" data-body></div>
            <div class="mc-more" aria-hidden="true"><span class="ls-label">WEITER</span><i></i></div>
          </section>
          <div class="hb-aside" data-aside><div class="hb-shipbox" data-shipbox></div><div class="hb-hint"><span class="ls-label">ZIEHEN</span><span>SCHIFF DREHEN</span></div></div>
        </div>
      </div>
    </div>
  </div>`;

  const $ = s.$;
  const center = $('[data-center]'), navEl = $('[data-nav]'), body = $('[data-body]');
  const stageBox = $('[data-stagebox]'), aside = $('[data-aside]'), shipBox = $('[data-shipbox]');
  const picon = $('[data-picon]'), crumb = $('[data-crumb]'), ptitle = $('[data-ptitle]'), backBtn = $('[data-back]');
  const panelEl = $('.hb-panel');
  const launchBtn = $('[data-launch]');
  const navBtns = Array.from(navEl.querySelectorAll('[data-sec]'));

  let current = '';
  let detail = '';

  // Handel und Umbau laufen über eine Welt aus dem Profil (gleiche Regeln wie an der Station, speichert selbst)
  let world = null, worldFailed = false;
  const ctx = {
    shopTab: 'ships', sel: null, qty: 1, confirm: false, pick: '', msg: null, last: null,
    world() {
      if (world || worldFailed) return world;
      try {
        const bus = new Bus();
        bus.on('message', (m) => { if (m && m.text) ctx.last = m; });
        world = new World(P, bus);
        world.docked = true;
      } catch (err) { worldFailed = true; console.warn('Handel im Hub nicht verfügbar:', err); }
      return world;
    },
  };

  // Vorschaubilder: Schiffe und Bauteile aus der 3D-Bühne, eins pro Leerlauf, danach überall eingesetzt
  const thumbUrl = {};
  const thumbQueue = [];
  let thumbReady = false, thumbBusy = false;
  const idle = window.requestIdleCallback ? (fn) => window.requestIdleCallback(fn, { timeout: 600 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 50);
  const pumpThumbs = () => {
    if (thumbBusy || !thumbReady || !thumbQueue.length || s.closed) return;
    thumbBusy = true;
    idle(() => {
      thumbBusy = false;
      if (s.closed || !stage.ok) return;
      const key = thumbQueue.shift();
      const [kind, id] = key.split(':');
      let url = null;
      try { url = kind === 'ship' ? stage.thumbnail(P.faction, id) : stage.partThumb(P.faction, kind, id); } catch { url = null; }
      thumbUrl[key] = url || '';
      if (url) applyThumbs(s.inner);
      pumpThumbs();
    });
  };
  const applyThumbs = (scope) => {
    for (const el of scope.querySelectorAll('[data-thumb]')) {
      if (el.classList.contains('is-3d')) continue;
      const key = el.dataset.thumb;
      const url = thumbUrl[key];
      if (url) { el.innerHTML = `<img src="${url}" alt="" draggable="false">`; el.classList.add('is-3d'); }
      else if (url === undefined && !thumbQueue.includes(key)) thumbQueue.push(key);
    }
    pumpThumbs();
  };

  // Hinweis „weiter“ unten im Panel, solange Inhalt unter der Kante liegt
  let more = null;
  const checkMore = () => {
    const m = current !== 'start' && body.scrollHeight - body.scrollTop - body.clientHeight > 6;
    if (m !== more) { more = m; panelEl.classList.toggle('has-more', m); }
  };
  // Hangar: Schiff füllt sonst die ganze Fläche (Bühne passt den Radius ein), daher ein Innenrahmen mit Luft
  const frameEl = () => (current === 'start' ? stageBox : current === 'hangar' ? (body.querySelector('[data-shipframe]') || shipBox) : aside);
  const reframe = () => { stage.frame(frameEl()); };
  const enter = (node) => { if (!reduced()) { node.classList.remove('ls-enter'); void node.offsetWidth; node.classList.add('ls-enter'); } };

  const render = () => {
    const x = SECTIONS.find((y) => y.key === current);
    if (!x?.impl) return;
    const det = detail && x.impl.details[detail];
    picon.innerHTML = icon(ICON_OF[current]);
    crumb.textContent = det ? `${x.title} ·` : `BEREICH ${pad2(SECTIONS.indexOf(x) + 1)}`;
    ptitle.textContent = det ? det[0] : x.title;
    backBtn.hidden = !det;
    const node = document.createElement('div');
    node.className = `hb-view hb-v-${current}${det ? ' is-det' : ''}`;
    node.innerHTML = det ? det[1](P, store) : x.impl.overview(P, store, ctx);
    body.replaceChildren(node);
    body.scrollTop = 0;
    applyThumbs(node);
    enter(node);
    more = null; checkMore();
    if (current === 'einst') { hudPrev(); perfPrev = ''; perfTick(true); }
    if (current === 'hangar') { reframe(); measureHg(); }
  };
  // Neu zeichnen ohne Einblenden (Kauf, Auswahl, Umbau), Listenposition bleibt
  const redraw = () => {
    const node = body.firstElementChild;
    const x = SECTIONS.find((y) => y.key === current);
    if (!node || !x?.impl) return;
    const list = node.querySelector('[data-shlist]');
    const keep = list ? list.scrollTop : 0, keepB = body.scrollTop;
    const a = document.activeElement;
    const focusKey = a && body.contains(a) ? ['data-pick', 'data-tab', 'data-slot', 'data-qty'].map((k) => a.getAttribute(k) && `[${k}="${a.getAttribute(k)}"]`).find(Boolean) : '';
    node.innerHTML = x.impl.overview(P, store, ctx);
    const l2 = node.querySelector('[data-shlist]');
    if (l2) l2.scrollTop = keep;
    body.scrollTop = keepB;
    applyThumbs(node);
    if (ctx.confirm) node.querySelector('[data-buyok]')?.focus({ preventScroll: true });
    else if (focusKey) node.querySelector(focusKey)?.focus({ preventScroll: true });
    if (current === 'hangar') { reframe(); measureHg(); }
    checkMore();
  };
  const refreshTop = () => {
    $('[data-acc]').innerHTML = accHtml(P);
    $('[data-lvl]').innerHTML = lvlHtml(P);
    $('[data-mini]').innerHTML = railMini(P, sector);
    const m = readiness(P);
    const gs = $('.hb-go-s');
    gs.classList.toggle('is-warn', !!m.length);
    gs.textContent = m.length ? m.join(' · ') : `INS ALL · ${P.sector || ''} ${secName}`;
    stage.setShip(P.ship, P.loadout);
  };
  const flashMsg = (ok, fallback) => {
    const t = ctx.last?.text || fallback;
    ctx.msg = t ? { ok, text: t } : null;
    ctx.last = null;
  };
  const doBuy = () => {
    const w = ctx.world();
    const [kind, id] = ctx.sel || [];
    if (!w || !kind) return;
    const n = kind === 'ammo' || kind === 'rocket' ? ctx.qty : 1;
    const part = kind === 'laser' || kind === 'gen';
    const arr = () => (kind === 'laser' ? P.loadout.lasers : P.loadout.gens);
    const before = part ? arr().slice() : null;
    const r = w.buy(kind, id, n);
    ctx.confirm = false;
    flashMsg(r.ok, r.reason);
    if (r.ok && part && ctx.msg) {
      const now = arr();
      const slot = now.findIndex((x, i) => x === id && before[i] !== id);
      ctx.msg.text += slot >= 0 ? ` Eingebaut in ${kind === 'laser' ? 'L' : 'G'}${slot + 1}.` : ' Liegt im Lager, im Hangar einbauen.';
    }
    if (r.ok) refreshTop();
    redraw();
  };
  const doEquip = (kind, i, item) => {
    const w = ctx.world();
    if (!w) return;
    const ok = w.equip(kind, i, item);
    if (ok) w.save();
    const it = item ? (kind === 'laser' ? LASERS : GENERATORS)[item] : null;
    flashMsg(ok, ok ? (it ? `${it.name} in ${kind === 'laser' ? 'L' : 'G'}${i + 1} eingebaut.` : `${kind === 'laser' ? 'L' : 'G'}${i + 1} ausgebaut, Teil liegt im Lager.`) : '');
    ctx.pick = '';
    if (ok) refreshTop();
    redraw();
  };

  // Hangar: Leitlinien von den Steckplatz-Karten zu den Punkten am Modell
  const hpPts = [];
  let hg = null;
  const measureHg = () => {
    const root = body.querySelector('[data-hg]');
    if (!root) { hg = null; return; }
    const R = root.getBoundingClientRect();
    const svg = root.querySelector('[data-lines]');
    const cards = new Map();
    for (const b of root.querySelectorAll('[data-hp]')) {
      const r = b.getBoundingClientRect();
      const left = b.closest('.hg-l');
      cards.set(b.dataset.hp, { x: (left ? r.right : r.left) - R.left, y: r.top + r.height / 2 - R.top, dir: left ? 1 : -1 });
    }
    svg.setAttribute('viewBox', `0 0 ${Math.round(R.width)} ${Math.round(R.height)}`);
    svg.innerHTML = '';
    const els = new Map();
    for (const [code] of cards) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.innerHTML = '<polyline/><rect width="7" height="7"/><text></text>';
      g.lastChild.textContent = code;
      g.style.display = 'none';
      svg.appendChild(g);
      els.set(code, { g, line: g.firstChild, dot: g.children[1], txt: g.lastChild, prev: '' });
    }
    hg = { R, cards, els };
  };
  s.loop(() => {
    if (current !== 'hangar' || !hg) return;
    stage.hardpoints(hpPts);
    const seen = new Set();
    for (const p of hpPts) {
      const code = `${p.kind}${p.i + 1}`;
      const c = hg.cards.get(code), e = hg.els.get(code);
      if (!c || !e) continue;
      seen.add(code);
      const px = Math.round(p.x - hg.R.left), py = Math.round(p.y - hg.R.top);
      const key = `${px},${py},${p.front ? 1 : 0}`;
      if (key === e.prev) continue;
      e.prev = key;
      const kx = c.x + c.dir * 18;
      e.line.setAttribute('points', `${c.x},${c.y} ${kx},${c.y} ${px},${py}`);
      e.dot.setAttribute('x', px - 3.5); e.dot.setAttribute('y', py - 3.5);
      e.txt.setAttribute('x', px + 8); e.txt.setAttribute('y', py - 6);
      e.g.style.display = '';
      e.g.classList.toggle('is-back', !p.front);
    }
    for (const [code, e] of hg.els) if (!seen.has(code) && e.prev !== 'x') { e.prev = 'x'; e.g.style.display = 'none'; }
  });


  const show = (key, det = '', focusNav = false) => {
    const i = SECTIONS.findIndex((x) => x.key === key);
    if (i < 0) return;
    if (det && !SECTIONS[i].impl?.details?.[det]) det = '';
    if (key !== current || det !== detail) { ctx.confirm = false; ctx.pick = ''; ctx.msg = null; }
    if (focusNav) navBtns[i]?.focus({ preventScroll: true });
    const changed = key !== current;
    if (!changed && det === detail) return;
    if (changed) {
      for (const b of navBtns) { const on = b.dataset.sec === key; b.classList.toggle('is-on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); }
      current = key;
      lastSection = key;
      center.dataset.sec = key;
    }
    detail = det;
    if (key !== 'start') render();
    else if (changed) enter($('[data-startpage] .hb-launch'));
    if (changed) {
      stage.setMode(key === 'hangar' ? 'hangar' : 'hub');
      reframe();
    }
  };
  const back = () => {
    if (ctx.confirm || ctx.pick) { ctx.confirm = false; ctx.pick = ''; redraw(); return true; }
    if (detail) { show(current, ''); body.focus({ preventScroll: true }); return true; }
    if (current !== 'start') { show('start'); launchBtn.focus({ preventScroll: true }); return true; }
    return false;
  };

  // Einstellungen: DOM nur am betroffenen Schalter ändern
  const hudPrev = () => {
    const hp = body.querySelector('[data-hp]');
    if (!hp) return;
    const h = hudState();
    hp.style.setProperty('--k', String(settings().hudScale));
    hp.dataset.mode = h.mode === 'bar' ? 'bar' : 'num';
    hp.classList.toggle('is-lock', h.locked);
  };
  const flashSaved = (txt = 'GESPEICHERT') => {
    const saved = body.querySelector('[data-saved]');
    if (saved) { saved.textContent = txt; saved.classList.remove('flash'); void saved.offsetWidth; saved.classList.add('flash'); }
  };
  const markSeg = (groupKey, val) => {
    const g = body.querySelector(`[data-key="${groupKey}"]`);
    if (!g) return;
    for (const o of g.children) { const on = o.dataset.val === String(val); o.classList.toggle('on', on); o.setAttribute('aria-checked', String(on)); }
  };
  const onSetting = (b) => {
    const key = b.dataset.set;
    let val = b.dataset.val;
    if (key === 'hudMode') { hudSet((v) => { for (const id of HUD_TOGGLE) v.win[id] = { ...(v.win[id] || { collapsed: false }), mode: val }; }); }
    else if (key === 'hudLock') { val = val === 'true'; hudSet((v) => { v.locked = val; }); }
    else {
      if (key === 'hudScale') val = Number(val);
      else if (key === 'reducedMotion') val = val === 'true';
      setSetting(key, val);
    }
    markSeg(key, val);
    if (key === 'quality') {
      const d = body.querySelector('[data-qdesc]'); if (d) d.textContent = Q_DESC[val];
      stage.show({});
    }
    if (key === 'reducedMotion') s.scr.classList.toggle('rm', reduced());
    hudPrev();
    flashSaved();
  };

  // Leistungsanzeige (Einstellungen): einmal je Sekunde, DOM nur bei Änderung
  let perfPrev = '', framesPrev = stage.frames || 0, fpsNow = 0;
  const perfTick = (force = false) => {
    if (current !== 'einst') return;
    const ft = body.querySelector('[data-fpst]');
    if (ft) ft.textContent = force && !fpsNow ? '-- B/S' : `${pad2(fpsNow)} B/S`;
    const el = body.querySelector('[data-fps]');
    if (!el) return;
    const info = stage.info();
    const key = `${fpsNow}|${info.w}|${info.bloom}|${info.aa}|${info.smaa}|${info.shadow}`;
    if (key === perfPrev) return;
    perfPrev = key;
    el.textContent = `${pad2(fpsNow)} B/S`;
    body.querySelector('[data-res]').textContent = `${info.w} × ${info.h}`;
    body.querySelector('[data-bloom]').textContent = info.bloom ? 'AN' : 'AUS';
    body.querySelector('[data-aa]').textContent = info.aa ? `${info.aa}× MSAA${info.smaa ? ' + SMAA' : ''}` : 'AUS';
    body.querySelector('[data-shadow]').textContent = info.shadow ? 'AN' : 'AUS';
    const qq = settings().quality;
    body.querySelector('[data-ptex]').textContent = qq === 'ultra' ? '4096 PX' : qq === 'high' ? '2048 PX' : '1024 PX';
    body.querySelector('.mc-perf .ls-bar')?.style.setProperty('--v', Math.min(1, fpsNow / 120).toFixed(2));
  };
  s.every(() => {
    const fr = stage.frames || 0;
    fpsNow = fr - framesPrev;
    framesPrev = fr;
    perfTick();
  }, 1000);

  show(SECTIONS.some((x) => x.key === lastSection) ? lastSection : 'start');
  s.timer(() => { if (current === 'start') launchBtn.focus({ preventScroll: true }); }, reduced() ? 0 : 260);

  // 3D-Szene nach dem ersten Bild in Schritten aufbauen, Fortschritt im Bildbereich
  const load = $('[data-load]');
  const thumbs = () => {
    thumbReady = true;
    for (const id of Object.keys(SHIPS)) if (!thumbQueue.includes(`ship:${id}`)) thumbQueue.push(`ship:${id}`);
    for (const id of Object.keys(LASERS)) thumbQueue.push(`laser:${id}`);
    for (const id of Object.keys(GENERATORS)) thumbQueue.push(`gen:${id}`);
    applyThumbs(s.inner);
  };
  if (load) {
    const lbar = $('[data-lbar]'), lpct = $('[data-lpct]'), llog = $('[data-llog]');
    const LBL = { HIMMEL: 'STERNFELD', PLANET: 'HEIMATPLANET', MOND: 'BEGLEITER', REFLEXE: 'REFLEXIONEN', SCHIFF: 'SCHIFF', STATION: 'STATION', SHADER: 'SHADER', BEREIT: 'SZENE' };
    const tl = performance.now();
    let lastPct = -1;
    s.timer(async () => {
      await stage.prepare({ faction: P.faction, ship: P.ship, loadout: P.loadout }, (step, p) => {
        if (s.closed) return;
        const pct = Math.round(p * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          lbar.style.setProperty('--v', p.toFixed(2));
          lpct.textContent = `${String(pct).padStart(3, '0')} %`;
        }
        const row = document.createElement('div');
        row.innerHTML = `<span class="ls-num">T+${((performance.now() - tl) / 1000).toFixed(1).replace('.', ',').padStart(4, '0')}</span><span>${LBL[step] || step}</span><span>${step === 'BEREIT' ? 'BEREIT' : 'OK'}</span>`;
        llog.appendChild(row);
        while (llog.children.length > 6) llog.firstChild.remove();
      });
      if (s.closed) return;
      reframe();
      load.classList.add('is-done');
      s.scr.classList.remove('is-loading');
      s.timer(() => load.remove(), 400);
      s.timer(() => idle(thumbs), 600);
    }, 30);
  }
  s.on(window, 'resize', () => { reframe(); measureHg(); more = null; checkMore(); });
  s.on(body, 'scroll', checkMore, { passive: true });
  s.on($('.mc-more'), 'click', () => body.scrollBy({ top: body.clientHeight * 0.8, behavior: reduced() ? 'auto' : 'smooth' }));

  // Hangar: Schiff mit der Maus drehen (freier Bildbereich rechts neben dem Panel)
  let dragX = null, dragEl = null;
  s.on(body, 'pointerdown', (e) => {
    const f = current === 'hangar' && e.target.closest('.hg-mid');
    if (!f || e.target.closest('button')) return;
    dragX = e.clientX; dragEl = f; f.setPointerCapture?.(e.pointerId); f.classList.add('is-drag');
  });
  s.on(body, 'pointermove', (e) => { if (dragX === null) return; stage.drag(e.clientX - dragX); dragX = e.clientX; });
  const endDrag = () => { dragX = null; dragEl?.classList.remove('is-drag'); dragEl = null; };
  s.on(body, 'pointerup', endDrag);
  s.on(body, 'pointercancel', endDrag);

  return new Promise((resolve) => {
    let done = false;
    const finish = async (v) => {
      if (done) return;
      done = true;
      await s.close(v === 'launch' ? 200 : 240);
      resolve(v);
    };
    s.on(navEl, 'click', (e) => { const b = e.target.closest('[data-sec]'); if (b) show(b.dataset.sec, ''); });
    s.on(s.inner, 'click', (e) => {
      const g = e.target.closest('[data-goto]');
      if (g) {
        const [k, d = ''] = g.dataset.goto.split(':');
        if (k === 'shop' && d) { ctx.shopTab = d; ctx.sel = null; }
        if (k === current && k === 'shop') { ctx.confirm = false; redraw(); return; }
        show(k, ''); if (d && k !== 'shop') show(k, d);
        return;
      }
      const tb = e.target.closest('[data-tab]');
      if (tb && body.contains(tb)) { if (tb.dataset.tab !== ctx.shopTab) { ctx.shopTab = tb.dataset.tab; ctx.sel = null; ctx.msg = null; ctx.confirm = false; redraw(); } return; }
      const pk = e.target.closest('[data-pick]');
      if (pk && body.contains(pk)) { const [k, id] = pk.dataset.pick.split(':'); if (!ctx.sel || ctx.sel[0] !== k || ctx.sel[1] !== id) { ctx.sel = [k, id]; ctx.confirm = false; ctx.msg = null; ctx.qty = 1; redraw(); } return; }
      const qt = e.target.closest('[data-qty]');
      if (qt && body.contains(qt)) { ctx.qty = Number(qt.dataset.qty) || 1; ctx.confirm = false; redraw(); return; }
      if (e.target.closest('[data-buy]')) { ctx.confirm = true; ctx.msg = null; redraw(); return; }
      if (e.target.closest('[data-buyok]')) { doBuy(); return; }
      if (e.target.closest('[data-buyno]')) { ctx.confirm = false; redraw(); body.querySelector('[data-buy]')?.focus({ preventScroll: true }); return; }
      const sl = e.target.closest('[data-slot]');
      if (sl && body.contains(sl)) { ctx.pick = ctx.pick === sl.dataset.slot ? '' : sl.dataset.slot; ctx.msg = null; redraw(); return; }
      const eq = e.target.closest('[data-equip]');
      if (eq) { const [k, i, id] = eq.dataset.equip.split(':'); doEquip(k, Number(i), id); return; }
      const uq = e.target.closest('[data-unequip]');
      if (uq) { const [k, i] = uq.dataset.unequip.split(':'); doEquip(k, Number(i), null); return; }
      const d = e.target.closest('[data-det]');
      if (d && body.contains(d)) { show(current, d.dataset.det); body.focus({ preventScroll: true }); return; }
      if (e.target.closest('[data-back]')) { back(); return; }
      const b = e.target.closest('[data-set]');
      if (b) { onSetting(b); return; }
      if (e.target.closest('[data-hudreset]')) {
        try { localStorage.removeItem(HUD_KEY); } catch { /* privater Modus */ }
        const h = hudState();
        markSeg('hudMode', h.mode); markSeg('hudLock', h.locked);
        hudPrev();
        flashSaved('ZURÜCKGESETZT');
      }
    });
    s.on(launchBtn, 'click', () => finish('launch'));
    s.on($('[data-logout]'), 'click', () => finish('logout'));
    s.on(window, 'keydown', (e) => {
      if (done || e.metaKey || e.ctrlKey || e.altKey) return;
      const a = document.activeElement;
      const k = e.key;
      if (k === 'Enter') {
        if (a && a !== document.body && a !== launchBtn && (a.tagName === 'BUTTON' || a.tagName === 'INPUT')) return;
        e.preventDefault();
        finish('launch');
      } else if (k === 'Escape') {
        e.preventDefault();
        if (!back()) launchBtn.focus({ preventScroll: true });
      } else if (k >= '0' && k <= '9') {
        const x = SECTIONS[k === '0' ? 9 : Number(k) - 1];
        if (x) { e.preventDefault(); show(x.key, '', true); }
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const i = navBtns.indexOf(a);
        if (i < 0) return;
        e.preventDefault();
        const j = (i + (k === 'ArrowDown' ? 1 : -1) + navBtns.length) % navBtns.length;
        show(SECTIONS[j].key, '', true);
      }
    });
  });
}
