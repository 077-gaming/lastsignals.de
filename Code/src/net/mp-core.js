// Mehrspieler – reine Logik ohne Netz und ohne DOM (im Selbsttest unter Node prüfbar).
import { packFlight, unpackFlight, hermite, FM } from '../flight/net.js';
import { tacticalReach } from '../flight/aim.js';
export { tacticalReach };
export { FM };
// Kanalnamen, Zustandspaket (gerundet, kompakt), Interpolationspuffer, Chat-Reinigung, Wortfilter,
// Ratenbegrenzung, PvP-Regeln und Ehre. Format und Regeln: Planung/MEHRSPIELER.md.

export const SEND_HZ = 9;              // eigener Zustand 9× pro Sekunde (nur bei Änderung)
export const KEEPALIVE = 1.0;          // s: spätestens so oft auch ohne Änderung (Neuankömmlinge sehen jeden)
export const INTERP_DELAY = 0.13;      // s: Darstellung läuft so weit hinter den empfangenen Daten
export const EXTRAP_MAX = 0.25;        // s: höchstens so weit über den letzten Stand hinaus vorhersagen
export const STALE = 4;                // s ohne Zustand → Schiff ausblenden
export const BUF = 12;                 // Zustände je Spieler im Puffer
export const CHAT_MAX = 200;           // Zeichen je Nachricht
export const CHAT_KEEP = 80;           // Nachrichten je Reiter
export const PVP_MIN_SECTOR = 2;       // PvP erst ab diesem Sektorindex
export const PVP_ARRIVE = 8;           // s Ankunftsschutz nach Sektorwechsel / Start
export const PVP_MAX_HIT = 20000;      // größter angenommener Einzeltreffer
export const PVP_HIT_RANGE = 650 * 1.6; // m: Treffer nur aus plausibler Entfernung (Reichweite + Verzögerung)
export const PVP_CREDIT = 20;          // s: so lange nach dem letzten eigenen Treffer zählt ein Abschuss
export const PVP_REPEAT = 300;         // s: derselbe Gegner bringt erst danach wieder Ehre
export const FLAG = { alive: 1, fire: 2, pvp: 4, zone: 8, docked: 16 };
// Presence (track/untrack) ist bei Supabase je Client streng begrenzt: gemessen schließt der Server den Kanal beim
// 6. Ereignis innerhalb von etwa 20–30 s („Client presence rate limit exceeded“). Darum höchstens 4 je 30 s,
// alles Häufige (PvP, Tab im Hintergrund) läuft über Broadcast, aufgeschobene Aktualisierungen gehen später raus.
export const PRES_N = 4;
export const PRES_PER = 30;
export const PRES_GAP = 1.5;
export const REJOIN = [3, 8, 20, 45]; // s bis zum nächsten Verbindungsversuch, wenn der Server den Kanal schließt

/** Kanal je Sektor: Heimat (Index 1) je Fraktion getrennt, ab Index 2 gemeinsamer Raum aller Fraktionen (Front). */
export function sectorChannel(sector) {
  if (!sector) return null;
  const idx = sector.index || 1;
  return idx >= PVP_MIN_SECTOR ? `ls-mp-front-${idx}` : `ls-mp-home-${String(sector.id).toLowerCase()}`;
}
/** Sektor mit gleichem Index in einer anderen Sektorliste (Koop-Gast kehrt in die eigenen Sektoren zurück) → id oder null */
export function sameIndexSector(sectors, index) {
  for (const k in sectors) if (sectors[k] && sectors[k].index === index) return sectors[k].id;
  return null;
}
export const factionChannel = (f) => `ls-mp-fac-${String(f).toLowerCase()}`;
export const GLOBAL_CHANNEL = 'ls-mp-all';

/** Zufällige Sitzungskennung (8 Zeichen a–z0–9), je Tab und Flug neu. */
export function newSid(rnd = Math.random) {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += a[(rnd() * a.length) | 0];
  return s;
}
export const validSid = (s) => typeof s === 'string' && /^[a-z0-9]{8}$/.test(s);

const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };
export const wrapAngle = wrap;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Zustand → kompaktes Feld (gerundet): [x, z, rot·100, kurs·100, tempo, hülle %, schild %, flags, ziel]
 * ziel: Sitzungskennung eines Spielers, Gegner-ID oder ''.
 */
export function packState(s) {
  const a = [
    Math.round(num(s.x)), Math.round(num(s.z)),
    Math.round(wrap(num(s.rot)) * 100), Math.round(wrap(num(s.crs, s.rot)) * 100),
    Math.round(clamp(num(s.spd), 0, 5000)),
    Math.round(clamp(num(s.hull, 1), 0, 1) * 100), Math.round(clamp(num(s.shield), 0, 1) * 100),
    num(s.flags) | 0, typeof s.tgt === 'string' ? s.tgt.slice(0, 24) : '',
  ];
  // 3D-Flug (Planung/FLUGMODELL.md 9): hinten angehängt, alte Clients lesen weiter Stelle 0–8
  if (s.q) for (const v of packFlight(s)) a.push(v);
  return a;
}
/** Feld → Zustand (prüft und begrenzt alles, was von außen kommt). → null bei Unsinn. */
export function unpackState(a) {
  if (!Array.isArray(a) || a.length < 8) return null;
  const x = a[0], z = a[1];
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 50000 || Math.abs(z) > 50000) return null;
  const s = {
    x, z, rot: wrap(num(a[2]) / 100), crs: wrap(num(a[3]) / 100), spd: clamp(num(a[4]), 0, 5000),
    hull: clamp(num(a[5], 100), 0, 100) / 100, shield: clamp(num(a[6]), 0, 100) / 100,
    flags: num(a[7]) | 0, tgt: typeof a[8] === 'string' ? a[8].slice(0, 24) : '',
    y: 0, q: null, vx: 0, vy: 0, vz: 0, ff: 0, fm: 0,
  };
  // altes Paket (9 Stellen): flach, Lage aus rot (der Empfänger baut sie)
  unpackFlight(a, s);
  return s;
}
/** Hat sich ein gepackter Zustand so geändert, dass er gesendet werden muss? */
export function stateChanged(a, b) {
  if (!a || !b) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

/**
 * Interpolationspuffer je fremdem Spieler. Zeitbasis: Sendezeit des anderen (s), umgerechnet über einen
 * geschätzten Versatz zur eigenen Uhr (kleinster beobachteter Laufzeitversatz, kriecht langsam nach oben,
 * damit Uhrendrift und dauerhaft langsamere Verbindungen nachgeführt werden).
 */
export class Interp {
  constructor(delay = INTERP_DELAY, maxExtra = EXTRAP_MAX) {
    this.delay = delay; this.maxExtra = maxExtra;
    this.buf = [];
    this.off = null; this.offAt = 0;
  }
  /** t: Sendezeit (s, Uhr des anderen), now: Empfangszeit (s, eigene Uhr) */
  push(t, s, now) {
    const o = now - t;
    if (this.off === null || o < this.off) { this.off = o; this.offAt = now; }
    else { this.off += Math.min(o - this.off, (now - this.offAt) * 0.02); this.offAt = now; }
    const b = this.buf;
    if (b.length && t <= b[b.length - 1].t) {
      if (t < b[0].t - 2) b.length = 0; // anderer Spieler hat neu gestartet (Uhr zurück): Puffer neu
      else return false;                // veraltet oder doppelt
    }
    b.push({ t, x: s.x, z: s.z, rot: s.rot, crs: s.crs, spd: s.spd, y: s.y || 0, q: s.q ? s.q.slice() : null, vx: s.vx || 0, vy: s.vy || 0, vz: s.vz || 0, h3: !!s.q });
    if (b.length > BUF) b.shift();
    return true;
  }
  get last() { return this.buf.length ? this.buf[this.buf.length - 1] : null; }
  /** Darstellungsstand zur eigenen Zeit now → out { x, z, rot, spd, vx, vz, extra } (extra: s vorhergesagt). */
  sample(now, out) {
    const b = this.buf;
    if (!b.length) return null;
    const rt = now - this.off - this.delay;
    if (b.length === 1 || rt <= b[0].t) {
      const s = rt <= b[0].t ? b[0] : b[b.length - 1];
      out.x = s.x; out.z = s.z; out.rot = s.rot; out.spd = s.spd; out.vx = 0; out.vz = 0; out.extra = 0;
      out.y = s.y; out.vy = 0; setQ(out, s.q, s.rot);
      return out;
    }
    const L = b[b.length - 1];
    if (rt >= L.t) {
      // Vorhersage entlang der letzten Bewegung, begrenzt; danach stehen bleiben
      const P = b[b.length - 2];
      const dt = Math.max(1e-3, L.t - P.t);
      let vx = (L.x - P.x) / dt, vz = (L.z - P.z) / dt;
      if (dt > 1.5) { vx = 0; vz = 0; } // Lücke (Ruhezustand): nicht hochrechnen
      const e = Math.min(rt - L.t, this.maxExtra);
      if (L.h3 && dt <= 1.5) { vx = L.vx; vz = L.vz; } // 3D: gesendetes Tempo statt Differenz
      const vy = L.h3 && dt <= 1.5 ? L.vy : 0;
      out.x = L.x + vx * e; out.z = L.z + vz * e; out.rot = L.rot; out.spd = L.spd; out.vx = vx; out.vz = vz; out.extra = e;
      out.y = L.y + vy * e; out.vy = vy; setQ(out, L.q, L.rot);
      return out;
    }
    let i = b.length - 2;
    while (i > 0 && b[i].t > rt) i--;
    const A = b[i], B = b[i + 1];
    const span = Math.max(1e-3, B.t - A.t);
    const k = clamp((rt - A.t) / span, 0, 1);
    if (A.h3 && B.h3 && span < 1.5) {
      // 3D: Hermite aus Ort und Tempo an beiden Stützstellen (Kurven statt Ecken), Lage per Slerp
      out.x = hermite(A.x, A.vx, B.x, B.vx, span, k); out.z = hermite(A.z, A.vz, B.z, B.vz, span, k);
      out.y = hermite(A.y, A.vy, B.y, B.vy, span, k);
      out.vx = A.vx + (B.vx - A.vx) * k; out.vz = A.vz + (B.vz - A.vz) * k; out.vy = A.vy + (B.vy - A.vy) * k;
      slerpQ(out, A.q, B.q, k);
    } else {
      out.x = A.x + (B.x - A.x) * k; out.z = A.z + (B.z - A.z) * k;
      out.y = A.y + (B.y - A.y) * k;
      out.vx = (B.x - A.x) / span; out.vz = (B.z - A.z) / span; out.vy = (B.y - A.y) / span;
      setQ(out, B.q || A.q, wrap(A.rot + wrap(B.rot - A.rot) * k));
    }
    out.rot = wrap(A.rot + wrap(B.rot - A.rot) * k);
    out.spd = A.spd + (B.spd - A.spd) * k;
    out.extra = 0;
    return out;
  }
}

/** Lage in out.q schreiben: gesendete Quaternion oder (altes Paket) nur Gieren aus rot */
function setQ(out, q, rot) {
  const o = out.q || (out.q = [0, 0, 0, 1]);
  if (q) { o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; o[3] = q[3]; return; }
  const h = rot * 0.5; o[0] = 0; o[1] = Math.sin(h); o[2] = 0; o[3] = Math.cos(h);
}
function slerpQ(out, a, b, k) {
  if (!a || !b) { setQ(out, b || a, 0); return; }
  const o = out.q || (out.q = [0, 0, 0, 1]);
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let ka = 1 - k, kb = k;
  if (c < 0.9995) { const th = Math.acos(c), s = Math.sin(th); ka = Math.sin((1 - k) * th) / s; kb = Math.sin(k * th) / s; }
  o[0] = a[0] * ka + bx * kb; o[1] = a[1] * ka + by * kb; o[2] = a[2] * ka + bz * kb; o[3] = a[3] * ka + bw * kb;
  const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; o[3] /= l;
}

/**
 * PvP im 3D-Flug („Schütze entscheidet, Opfer prüft“, FLUGMODELL.md 9): Der Schütze meldet Trefferpunkt hp und
 * Schusszeit; das Opfer prüft gegen den eigenen Verlauf der letzten 500 ms (innerhalb von 2 × Kapsel am Punkt) und
 * den Kegel (Bug des Schützen gegen die Linie zum Opfer ≤ Waffenkegel + 15°). hist: [{ t, x, y, z }], nose: Einheitsvektor.
 */
export const PVP_CONE = (5 + 4 + 15) * Math.PI / 180;
export const PVP_AUTO_CONE = (30 + 15) * Math.PI / 180; // Feuerleitrechner im 3D-Flug: 30° um den Bug + Verzug
/**
 * Opfer prüft einen PvP-Treffer. Mit Trefferpunkt (3D-Bolzen): eigener Verlauf der letzten 500 ms und Kegel vom Bug des
 * Schützen. Ohne Trefferpunkt nur, wenn der Schütze in der Taktik fliegt (shooter.view) und das Opfer für ihn in der
 * Ebene liegt – ein 3D-Schütze, der den Trefferpunkt weglässt, wird abgelehnt (manipulierter Client).
 */
export function pvpPlausible(hit, hist, now, shooter, nose, capsule = 40, victim = null) {
  if (!hit) return false;
  if (!Array.isArray(hit.hp) || hit.hp.length !== 3) {
    if (hit.r) return true; // Rakete: Aufschaltung und Laufzeit wie bisher (Entfernung prüft der Aufrufer)
    if (!shooter) return false;
    if (shooter.view === 'tactical') return !victim || tacticalReach(shooter, victim);
    // 3D-Schütze mit Feuerleitrechner (gewürfelt): Opfer im 30°-Kegel um seinen Bug (+15° Verzug)
    if (hit.a && nose && victim) {
      const dx = victim.x - shooter.x, dy = (victim.y || 0) - (shooter.y || 0), dz = victim.z - shooter.z, d = Math.hypot(dx, dy, dz) || 1;
      return Math.acos(Math.max(-1, Math.min(1, (dx * nose[0] + dy * nose[1] + dz * nose[2]) / d))) <= PVP_AUTO_CONE;
    }
    return false; // 3D-Bolzen ohne Trefferpunkt: manipulierter Client
  }
  const [hx, hy, hz] = hit.hp.map((v) => num(v));
  let near = false;
  for (const h of hist) {
    if (now - h.t > 0.5) continue;
    if (Math.hypot(h.x - hx, h.y - hy, h.z - hz) <= 2 * capsule) { near = true; break; }
  }
  if (!near) return false;
  if (shooter && nose) {
    const dx = hx - shooter.x, dy = hy - (shooter.y || 0), dz = hz - shooter.z, d = Math.hypot(dx, dy, dz) || 1;
    const c = (dx * nose[0] + dy * nose[1] + dz * nose[2]) / d;
    if (Math.acos(Math.max(-1, Math.min(1, c))) > PVP_CONE) return false;
  }
  return true;
}

// ───────────────────────── Chat ─────────────────────────

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ESC[c]);

// Steuerzeichen, unsichtbare Zeichen und Schreibrichtungs-Umschalter (als Zeichenkette gebaut: ein U+2028 im
// Regex-Literal bricht nach dem Bündeln die Zeile und damit den Ausdruck)
const CTRL = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');

/** Text bereinigen: Steuerzeichen raus, Leerraum zusammenfassen, auf CHAT_MAX Zeichen kürzen. */
export function cleanText(text, max = CHAT_MAX) {
  let s = String(text ?? '');
  s = s.replace(CTRL, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  const cp = Array.from(s);
  return cp.length > max ? cp.slice(0, max).join('') : s;
}
export const cleanName = (s) => cleanText(s, 20) || 'Pilot';

// Einfacher Wortfilter (Beleidigungen, Hetze). Vergleich auf vereinfachter Form (Kleinbuchstaben, 0→o, 1→i, 3→e,
// 4→a, 5→s, @→a, $→s, Umlaute ausgeschrieben), Treffer werden durch * gleicher Länge ersetzt.
const BAD = [
  'arschloch', 'arschlöcher', 'wichser', 'hurensohn', 'hurensöhne', 'fotze', 'schlampe', 'missgeburt', 'spast', 'spasti',
  'mongo', 'schwuchtel', 'kanake', 'neger', 'nigger', 'nigga', 'judensau', 'sieg heil', 'heil hitler', 'fick dich',
  'ficken', 'fick', 'fuck', 'fucking', 'motherfucker', 'cunt', 'bitch', 'whore', 'retard', 'faggot', 'kys',
];
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
function simplify(ch) { const c = ch.toLowerCase(); return LEET[c] || (c === 'ä' ? 'a' : c === 'ö' ? 'o' : c === 'ü' ? 'u' : c === 'ß' ? 's' : c); }
const BAD_S = BAD.map((w) => Array.from(w).map(simplify).join(''));

export function filterWords(text) {
  const src = Array.from(String(text ?? ''));
  const low = src.map(simplify);
  const out = src.slice();
  const isL = (c) => c != null && /[\p{L}\p{N}]/u.test(c);
  let hit = false;
  for (const w of BAD_S) {
    const n = w.length;
    for (let i = 0; i + n <= low.length; i++) {
      let ok = true;
      for (let j = 0; j < n; j++) if (low[i + j] !== w[j]) { ok = false; break; }
      if (!ok) continue;
      // kurze Wörter nur als ganzes Wort (sonst träfe „fick“ auch harmlose Wörter, „kys“ in „Skyship“)
      if (n <= 6 && (isL(low[i - 1]) || isL(low[i + n]))) continue;
      for (let j = 0; j < n; j++) if (src[i + j] !== ' ') out[i + j] = '*';
      hit = true;
    }
  }
  return hit ? out.join('') : String(text ?? '');
}

/** Ratenbegrenzung: höchstens n Ereignisse je per Sekunden und mindestens gap Sekunden Abstand. */
export class RateLimit {
  constructor(n = 4, per = 8, gap = 0.7) { this.n = n; this.per = per; this.gap = gap; this.ts = []; }
  /** → 0 = erlaubt (und gezählt), sonst Sekunden bis zum nächsten erlaubten Ereignis */
  take(now) {
    const ts = this.ts;
    while (ts.length && now - ts[0] >= this.per) ts.shift();
    const last = ts.length ? ts[ts.length - 1] : -Infinity;
    if (now - last < this.gap) return this.gap - (now - last);
    if (ts.length >= this.n) return this.per - (now - ts[0]);
    ts.push(now);
    return 0;
  }
}

// ───────────────────────── PvP ─────────────────────────

/** Darf ich in meinem Zustand angegriffen werden bzw. angreifen? (Sektor ab 2, keine sichere Zone, kein Schutz) */
export function zoneOk(o) {
  return (o.sectorIndex || 1) >= PVP_MIN_SECTOR && !o.safe && !o.docked && o.alive !== false && !o.protectedNow;
}
/**
 * Angriff erlaubt zwischen mir (me) und einem anderen (o)? Beide mit PvP an, verschiedene Fraktionen,
 * beide außerhalb geschützter Bereiche, nicht im selben Koop.
 * me/o: { pvp, fac, zone, coop }
 */
export function canAttack(me, o) {
  if (!me || !o) return false;
  if (!me.pvp || !o.pvp) return false;
  if (!me.fac || !o.fac || me.fac === o.fac) return false;
  if (!me.zone || !o.zone) return false;
  if (me.coop && o.coop && me.coop === o.coop) return false;
  return true;
}
/** Eingehenden Treffer begrenzen → ganze Zahl 1..PVP_MAX_HIT oder 0 (verwerfen) */
export function clampHit(d) {
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return 0;
  return Math.min(PVP_MAX_HIT, Math.max(1, Math.round(d)));
}
/** Ehre für einen PvP-Abschuss: wächst mit der Stufe des Opfers, viel weniger gegen deutlich Schwächere. */
export function pvpHonor(victimLevel, myLevel) {
  const v = clamp(num(victimLevel, 1) | 0, 1, 99), m = clamp(num(myLevel, 1) | 0, 1, 99);
  let h = 40 + v * 12;
  const gap = m - v;
  if (gap > 5) h *= gap > 12 ? 0.1 : 0.35;
  else if (gap < -3) h *= 1.25;
  return Math.max(4, Math.round(h));
}
