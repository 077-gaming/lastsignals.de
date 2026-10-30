// Laufzeit der Website: Kopfleiste, Kapitel, Kamerafahrt, Fraktionswahl, Hangar, Karte, Gründungspilot, Ton.
// Alle 3D-Szenen werden nachgeladen; Text und Standbild sind sofort da.
import './styles/theme.css';
import './styles/site.css';
import './styles/cinema.css';
import { setSound, blip, chapterCue } from './audio.js';
import { getSession, getStatus, signOut, isOnline } from './api.js';

const doc = document.documentElement;
doc.classList.add('js');
const body = document.body;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
const lang = doc.lang;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* privat */ } },
};
const idle = (fn, t = 800) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: t }) : setTimeout(fn, 200));
const near = (el, fn, margin = '600px') => {
  if (!el) return;
  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); fn(); } }, { rootMargin: margin });
  io.observe(el);
};
const visible = (el, fn) => { const io = new IntersectionObserver(([e]) => fn(e.isIntersecting), { rootMargin: '80px' }); io.observe(el); };

// Sprachwechsel und Domain-Links stehen fertig im HTML (Produktions-Build: src/site.js, href()).

// ---------- Kopfleiste und Menü ----------
const hdr = document.querySelector('[data-hdr]');
const menu = document.getElementById('menu');
const menuBtn = hdr?.querySelector('.menu-btn');
function setMenu(open) {
  if (!menu || !menuBtn) return;
  menu.hidden = !open;
  hdr.classList.toggle('is-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  menuBtn.setAttribute('aria-label', open ? menuBtn.dataset.close : menuBtn.dataset.open);
  body.style.overflow = open ? 'hidden' : '';
  if (open) menu.querySelector('a')?.focus();
}
menuBtn?.addEventListener('click', () => setMenu(menu.hidden));
menu?.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); menuBtn.focus(); } });

// ---------- Ton ----------
const snd = document.querySelector('[data-sound]');
snd?.addEventListener('click', async () => {
  const want = snd.getAttribute('aria-pressed') !== 'true';
  const on = await setSound(want);
  snd.setAttribute('aria-pressed', String(on));
  const label = on ? snd.dataset.on : snd.dataset.off;
  snd.setAttribute('aria-label', label); snd.title = label;
  if (on) blip('pick');
});
document.addEventListener('click', (e) => { if (e.target.closest('[data-click], .ls-btn, .hg-ship, .map-btn, .seg-b, .rail a')) blip('click'); });

// ---------- Einblenden und Live-Grafiken ----------
const rv = document.querySelectorAll('.rv');
if (reduce || !('IntersectionObserver' in window)) rv.forEach((el) => el.classList.add('in'));
else {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  rv.forEach((el) => io.observe(el));
}
const visIO = new IntersectionObserver((entries) => { for (const e of entries) e.target.classList.toggle('is-live', e.isIntersecting); }, { rootMargin: '40px' });
document.querySelectorAll('.vis').forEach((v) => visIO.observe(v));

const clockEl = document.querySelector('[data-clock]');
if (clockEl) { const tick = () => { clockEl.textContent = new Date().toISOString().slice(11, 19); }; tick(); setInterval(() => { if (!document.hidden) tick(); }, 1000); }

const fm = document.querySelector('[data-formations]');
near(fm, () => import('./visuals/formations.js').then((m) => m.initFormations(fm)));

// ---------- Live-Status (ehrlich: Testphase, bis der Spielserver läuft) ----------
getStatus().then((s) => {
  const el = document.querySelector('[data-live]');
  if (!el || !s) return;
  el.classList.add(s.online ? 'is-online' : 'is-offline');
});

// ---------- Fraktion ----------
let faction = store.get('ls-faction');
if (!['europa', 'saturn', 'eris'].includes(faction)) faction = null;
let cosmos = null, founderCtl = null;
const pickBtns = [...document.querySelectorAll('[data-pick-btn]')];
const pickNote = document.querySelector('[data-pick-note]');
function paint(f) { if (f) body.dataset.faction = f; else delete body.dataset.faction; }
function setFaction(f, from) {
  faction = f; store.set('ls-faction', f);
  pickBtns.forEach((b) => {
    const on = b.dataset.pickBtn === f;
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? b.dataset.picked : b.dataset.pick;
    b.closest('.fac').classList.toggle('is-picked', on);
  });
  paint(f);
  if (from !== 'form') founderCtl?.syncFaction();
  if (pickNote && from === 'pick') pickNote.hidden = false;
}
if (faction) setFaction(faction, 'init');
pickBtns.forEach((b) => b.addEventListener('click', () => { setFaction(b.dataset.pickBtn, 'pick'); blip('pick'); }));
document.querySelectorAll('.pick .fac').forEach((card) => {
  const f = card.dataset.faction;
  const enter = () => { paint(f); cosmos?.setHover(f); card.classList.add('is-hot'); };
  const leave = () => { paint(faction); cosmos?.setHover(null); card.classList.remove('is-hot'); };
  card.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') enter(); });
  card.addEventListener('pointerleave', leave);
  card.addEventListener('focusin', enter);
  card.addEventListener('focusout', (e) => { if (!card.contains(e.relatedTarget)) leave(); });
  // Handy: die Karte in der Bildmitte färbt die Seite und steuert die Kamera
  if (mobile) {
    new IntersectionObserver(([e]) => { if (e.isIntersecting) enter(); else { card.classList.remove('is-hot'); if (body.dataset.faction === f) leave(); } }, { rootMargin: '-45% 0px -45% 0px' }).observe(card);
  }
});

// ---------- Kapitel, Kamerafahrt, Anzeige ----------
const AU = [0.99, 1.0, 5.2, 9.58, 30.07, 42, 95.9, 120];
const chapters = [...document.querySelectorAll('main [data-ch]')];
const rail = [...document.querySelectorAll('[data-rail-link]')];
const hudPlace = document.querySelector('[data-hud-place]');
const hudAu = document.querySelector('[data-hud-au]');
const hudLight = document.querySelector('[data-hud-light]');
const hudBar = document.querySelector('[data-hud-bar]');
const places = hudPlace ? (lang === 'de'
  ? ['Inneres System', 'Erde', 'Jupiter · Europa', 'Saturn', 'Uranus · Neptun', 'Kuipergürtel', 'Eris', 'Rand des Systems']
  : ['Inner system', 'Earth', 'Jupiter · Europa', 'Saturn', 'Uranus · Neptune', 'Kuiper Belt', 'Eris', 'Edge of the system']) : [];
let anchors = [];
function measure() {
  const vh = innerHeight;
  const first = new Map();
  for (const s of chapters) { const i = +s.dataset.ch; if (!first.has(i)) first.set(i, s.getBoundingClientRect().top + scrollY); }
  anchors = [...first.entries()].sort((a, b) => a[0] - b[0]).map(([, top], k) => (k === 0 ? 0 : Math.max(0, top - vh * 0.12)));
}
function progressAt(y) {
  const vh = innerHeight;
  if (!anchors.length) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    if (y < b) {
      const len = Math.min(vh * 0.55, (b - a) * 0.6);
      return i + Math.min(1, Math.max(0, (y - (b - len)) / len));
    }
  }
  return anchors.length - 1;
}
const fmt = (n, d = 2) => n.toLocaleString(lang === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
let lastCh = -1;
// Kapitelwechsel: kurzer Kamerastoß und Lichtblitz (nicht bei „Bewegung reduzieren“)
let joltT = 0;
function jolt() {
  if (reduce) return;
  cosmos?.kick?.(1);
  body.classList.remove('is-jolt'); void body.offsetWidth; body.classList.add('is-jolt');
  clearTimeout(joltT); joltT = setTimeout(() => body.classList.remove('is-jolt'), 260);
}
function onScroll() {
  hdr?.classList.toggle('is-solid', scrollY > 24);
  if (!anchors.length) return;
  const p = progressAt(scrollY);
  cosmos?.setProgress(p);
  const ch = Math.round(p);
  body.dataset.ch = String(ch);
  const frac = p - Math.floor(p);
  body.classList.toggle('is-flying', frac > 0.03 && frac < 0.97);
  if (ch !== lastCh) {
    if (lastCh >= 0) { chapterCue(); jolt(); }
    lastCh = ch;
    rail.forEach((a, i) => a.classList.toggle('is-on', i + 1 === ch || (ch === 0 && false)));
    if (hudPlace) hudPlace.textContent = places[ch] || '';
  }
  if (hudAu) {
    const i = Math.floor(p), f = p - i, a = AU[i], b = AU[Math.min(AU.length - 1, i + 1)];
    const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
    const au = a + (b - a) * e;
    hudAu.textContent = fmt(au, au < 10 ? 2 : 1);
    const min = Math.abs(au - 1) * 8.317;
    hudLight.textContent = min < 60 ? `${fmt(min, 1)} min` : `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
    hudBar.style.transform = `scaleX(${(p / 7).toFixed(4)})`;
  }
}
if (chapters.length) {
  measure();
  addEventListener('resize', () => { measure(); onScroll(); });
  new ResizeObserver(() => measure()).observe(document.querySelector('main'));
}
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Positionsanzeige unten links: ausblenden, sobald Überschrift, Text oder ein Panel darunter liegt
const hudEl = document.querySelector('[data-hud]');
const CONTENT = 'h1, h2, h3, p, li, label, input, button, a, dl, table, figure, blockquote, .ls-panel, .sec-head, .fac, .reason-vis';
let hudRaf = 0;
function hudCheck() {
  hudRaf = 0;
  if (!hudEl) return;
  const r = hudEl.getBoundingClientRect();
  const pts = [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
  let hit = false;
  for (const [x, y] of pts) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (el === hudEl || hudEl.contains(el)) continue;
      if (el.closest('.cosmos, .hdr, .rail')) continue;
      if (el.matches(CONTENT) || el.closest(CONTENT)) { hit = true; break; }
    }
    if (hit) break;
  }
  hudEl.classList.toggle('is-covered', hit);
}
if (hudEl) {
  addEventListener('scroll', () => { if (!hudRaf) hudRaf = requestAnimationFrame(hudCheck); }, { passive: true });
  addEventListener('resize', () => { if (!hudRaf) hudRaf = requestAnimationFrame(hudCheck); });
  hudCheck();
}

// ---------- Warum: acht große Knöpfe, eine Szene. Jeder Wechsel schwenkt die Kamera hart um. ----------
const whyEl = document.querySelector('[data-why]');
let reasonIdx = 0;
if (whyEl) {
  const tabs = [...whyEl.querySelectorAll('[data-why-tab]')];
  const panels = [...whyEl.querySelectorAll('[data-why-panel]')];
  const show = (i, focus) => {
    reasonIdx = i;
    tabs.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    panels.forEach((p, k) => {
      const on = k === i;
      p.hidden = !on;
      if (on) { p.classList.remove('is-in'); void p.offsetWidth; p.classList.add('is-in'); }
    });
    cosmos?.setSub(tabs.length > 1 ? i / (tabs.length - 1) : 0);
    cosmos?.kick?.(0.6);
    if (focus) tabs[i].focus();
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => show(i));
    b.addEventListener('keydown', (e) => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      show((i + d + tabs.length) % tabs.length, true);
    });
  });
}

// ---------- 3D-Hintergrund ----------
const cosmosEl = document.querySelector('[data-cosmos]');
const toggle = document.querySelector('[data-scene-toggle]');
let gl2 = false;
try { gl2 = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { gl2 = false; }
const lowDevice = (navigator.deviceMemory || 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2 || (navigator.connection && navigator.connection.saveData);
const poster = import.meta.env.DEV ? params.get('poster') : null;
const marks = { sun: document.querySelector('[data-mark="sun"]'), earth: document.querySelector('[data-mark="earth"]'), swarm: document.querySelector('[data-mark="swarm"]') };

if (poster) makePoster(poster);
else if (cosmosEl && gl2 && !reduce && !lowDevice && params.get('still') === null) {
  const go = () => import('./scene/cosmos.js').then(({ startCosmos }) => {
    const canvas = cosmosEl.querySelector('.cosmos-canvas');
    cosmos = startCosmos(canvas, {
      mobile,
      onSlow() { body.classList.remove('is-3d'); if (toggle) toggle.hidden = true; },
      onFrame({ sun, earth, swarm, progress }) {
        if (progress > 0.9) return;
        place(marks.sun, sun); place(marks.earth, earth); place(marks.swarm, swarm);
      },
    });
    if (!cosmos) return;
    if (import.meta.env.DEV) window.__cosmos = cosmos;
    cosmos.setProgress(progressAt(scrollY));
    cosmos.setSub(reasonIdx / 7);
    let paused = false, others = 0;
    const sync = () => (!paused && !document.hidden ? cosmos.start() : cosmos.stop());
    document.addEventListener('visibilitychange', sync);
    requestAnimationFrame(() => requestAnimationFrame(() => body.classList.add('is-3d')));
    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        paused = !paused;
        toggle.setAttribute('aria-pressed', String(paused));
        const label = paused ? toggle.dataset.resume : toggle.dataset.pause;
        toggle.setAttribute('aria-label', label); toggle.title = label;
        sync();
      });
    }
    window.__lsOther = (on) => { others += on ? 1 : -1; cosmos.setFps(others > 0 ? 30 : 60); };
    sync();
  }).catch(() => {});
  if (document.readyState === 'complete') idle(go, 500); else addEventListener('load', () => idle(go, 500), { once: true });
}
function place(el, p) {
  if (!el) return;
  el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  el.classList.toggle('is-off', !p.vis);
  // Beschriftung nie am Bildrand abschneiden: nahe am rechten Rand nach links klappen
  el.classList.toggle('is-left', p.x > innerWidth - 150);
}

// ---------- Hangar ----------
const hangarEl = document.querySelector('[data-hangar]');
if (hangarEl) {
  const ships = [...hangarEl.querySelectorAll('[data-ship]')];
  const fxBtns = [...hangarEl.querySelectorAll('[data-hg-fx]')];
  const tag = hangarEl.querySelector('[data-hg-tag]');
  const slotBtns = [...hangarEl.querySelectorAll('[data-hg-slot]')];
  const lenEl = hangarEl.querySelector('[data-hg-len]');
  let ctl = null, state = { ship: 's1', fx: 'saturn' };
  const cur = () => ships.find((b) => b.dataset.ship === state.ship);
  function apply() {
    const b = cur();
    ships.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    fxBtns.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.hgFx === state.fx)));
    hangarEl.querySelectorAll('[data-spec]').forEach((s) => { s.hidden = s.dataset.spec !== state.ship; });
    const real = b.dataset.model === '1' && state.fx === 'saturn';
    tag.textContent = real ? tag.dataset.real : tag.dataset.bp;
    tag.classList.toggle('is-bp', !real);
    hangarEl.classList.toggle('is-bp', !real);
    hangarEl.style.setProperty('--fx', { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' }[state.fx]);
    if (lenEl) lenEl.textContent = `${b.querySelector('.ls-num').textContent} · ${state.fx.toUpperCase()}`;
    ctl?.set({ ship: state.ship, fx: state.fx, tier: +b.dataset.tier, viz: b.dataset.viz.split(',').map(Number), model: b.dataset.model === '1' });
  }
  ships.forEach((b) => b.addEventListener('click', () => { state.ship = b.dataset.ship; apply(); }));
  fxBtns.forEach((b) => b.addEventListener('click', () => { state.fx = b.dataset.hgFx; apply(); }));
  let slotKind = 'l';
  slotBtns.forEach((b) => b.addEventListener('click', () => {
    slotKind = b.dataset.hgSlot;
    slotBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    ctl?.slots(slotKind);
  }));
  if (faction) state.fx = faction;
  apply();
  if (gl2 && !lowDevice) {
    near(hangarEl, () => import('./scene/hangar.js').then(({ initHangar }) => {
      ctl = initHangar(hangarEl, { mobile, reduce, onReady() { hangarEl.classList.add('is-3d'); }, onShow({ real }) { if (!real) hangarEl.classList.add('is-3d'); } });
      if (!ctl) return;
      ctl.slots(slotKind);
      apply();
      let on = false;
      visible(hangarEl, (v) => { if (v === on) return; on = v; v ? ctl.start() : ctl.stop(); window.__lsOther?.(v); });
    }), '400px');
  } else hangarEl.querySelector('[data-nogl]').hidden = false;
}

// ---------- Systemkarte ----------
const mapEl = document.querySelector('[data-map]');
if (mapEl) {
  const btns = [...mapEl.querySelectorAll('[data-region]')];
  let ctl = null;
  const pick = (id, fly = true) => {
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.region === id)));
    mapEl.querySelectorAll('[data-info]').forEach((s) => { s.hidden = s.dataset.info !== id; });
    ctl?.select(id, fly);
  };
  btns.forEach((b) => b.addEventListener('click', () => pick(b.dataset.region)));
  mapEl.querySelector('[data-map-reset]')?.addEventListener('click', () => ctl?.reset());
  if (gl2 && !lowDevice) {
    near(mapEl, () => import('./scene/map.js').then(({ initMap }) => {
      ctl = initMap(mapEl, { mobile, reduce, onPick: (id) => { pick(id); blip('click'); } });
      if (!ctl) return;
      mapEl.classList.add('is-3d');
      let on = false;
      visible(mapEl, (v) => { if (v === on) return; on = v; v ? ctl.start() : ctl.stop(); window.__lsOther?.(v); });
    }), '400px');
  }
}

// ---------- Gründungspilot und Konto ----------
const form = document.querySelector('[data-founder]');
if (form) {
  import('./founder.js').then(({ initFounder }) => {
    founderCtl = initFounder(form, { getFaction: () => faction, setFaction });
    if (session) founderCtl.confirmed(session);
  });
}
let session = null;
const auth = document.querySelector('[data-auth]');
if (isOnline()) {
  idle(() => getSession().then((s) => {
    if (!s) return;
    session = s.callsign ? s : null;
    if (auth) {
      auth.classList.add('is-in');
      const name = s.callsign || (lang === 'de' ? 'Profil' : 'Profile');
      auth.innerHTML = `${s.avatar ? `<img src="${encodeURI(s.avatar)}" alt="" width="24" height="24" referrerpolicy="no-referrer">` : `<span class="av" aria-hidden="true">${name.slice(0, 1).toUpperCase()}</span>`}<span class="au-t"><b>${name.replace(/[<>&"]/g, '')}</b><em>${lang === 'de' ? 'Gründungspilot' : 'Founding pilot'}</em></span>`;
      auth.setAttribute('aria-label', name);
    }
    if (s.faction) setFaction(s.faction, 'session');
    if (session) founderCtl?.confirmed(session);
    if (s.justClaimed && form) form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }), 1500);
}
window.__lsSignOut = signOut;

// ---------- Standbilder erzeugen (nur Dev-Server: ?poster=wide|tall|og|icon) ----------
async function makePoster(kind) {
  const save = (blob, name) => fetch('/__poster?name=' + name, { method: 'POST', body: blob }).then((r) => r.text()).then((x) => { document.title = 'POSTER ' + name + ' ' + x; });
  if (kind === 'icon') {
    const c = document.createElement('canvas'); c.width = c.height = 180;
    const g = c.getContext('2d'); g.fillStyle = '#04060a'; g.fillRect(0, 0, 180, 180);
    const svg = document.querySelector('.brand .emblem').outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" color="#ffffff"').replace(/currentColor/g, '#ffffff');
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode(); g.drawImage(img, 30, 30, 120, 120);
    c.toBlob((b) => save(b, 'touch-icon.png'), 'image/png');
    return;
  }
  const size = kind === 'tall' ? [1080, 1920] : kind === 'og' ? [1200, 630] : [1920, 1080];
  const { startCosmos } = await import('./scene/cosmos.js');
  const canvas = document.createElement('canvas');
  canvas.width = size[0]; canvas.height = size[1];
  canvas.style.cssText = `position:fixed;left:0;top:0;width:${size[0] / 2}px;height:${size[1] / 2}px;z-index:999`;
  document.body.appendChild(canvas);
  const c = startCosmos(canvas, { forced: size, mobile: false });
  c.still(0, +(params.get('t') || 46));
  c.still(0, +(params.get('t') || 46));
  if (kind !== 'og') { canvas.toBlob((b) => save(b, kind === 'tall' ? 'hero-poster-tall.webp' : 'hero-poster.webp'), 'image/webp', 0.82); return; }
  const out = document.createElement('canvas'); out.width = 1200; out.height = 630;
  const g = out.getContext('2d'); g.drawImage(canvas, 0, 0);
  const grd = g.createLinearGradient(0, 0, 0, 630); grd.addColorStop(0, 'rgba(4,6,10,0)'); grd.addColorStop(1, 'rgba(4,6,10,.75)'); g.fillStyle = grd; g.fillRect(0, 0, 1200, 630);
  const wm = document.querySelector('.wm-hero').outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="70" color="#ffffff"').replace(/currentColor/g, '#ffffff');
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(wm);
  await img.decode(); g.drawImage(img, 220, 470, 760, 70);
  out.toBlob((b) => save(b, 'og.jpg'), 'image/jpeg', 0.86);
}
