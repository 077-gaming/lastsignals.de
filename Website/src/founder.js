// Gründungspilot: Formular (Rufname live geprüft, Fraktion, E-Mail mit Bestätigungsmail), Google/Discord, Teilen-Karte.
import { callsignFormat, callsignAvailable, emailOk, reserve, startOAuth, isOnline, signupOpen, getProviders, FACTIONS } from './api.js';
import { blip } from './audio.js';

const FX = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };
const FXNAME = { europa: 'EUROPA', saturn: 'SATURN', eris: 'ERIS' };

export function initFounder(form, { getFaction, setFaction }) {
  const M = JSON.parse(form.dataset.msgs);
  const cs = form.querySelector('[data-cs]');
  const csState = form.querySelector('[data-cs-state]');
  const mail = form.querySelector('input[name="email"]');
  const consent = form.querySelector('input[name="consent"]');
  const msg = form.querySelector('[data-fd-msg]');
  const closed = form.querySelector('[data-fd-closed]');
  const link = form.querySelector('[data-fd-link]');
  const radios = [...form.querySelectorAll('[data-fd-fx]')];
  const card = document.querySelector('[data-card]');
  const cardCap = document.querySelector('[data-card-cap]');
  const actions = document.querySelector('[data-card-actions]');
  const lang = document.documentElement.lang;
  const online = isOnline();
  const open = signupOpen();
  let confirmed = null;

  link.classList.toggle('is-on', online);
  link.querySelector('span').textContent = online
    ? (open ? (lang === 'de' ? 'Server verbunden' : 'Server linked') : (lang === 'de' ? 'Namensprüfung aktiv' : 'Name check live'))
    : (lang === 'de' ? 'Server folgt' : 'Server pending');
  if (!open) closed.hidden = false;

  // Google/Discord: nur aktiv, was der Server wirklich anbietet (GET /auth/v1/settings). Sonst bleibt der Knopf „bald“,
  // gesperrt und ohne Klick-Aktion. Die E-Mail-Reservierung hängt zusätzlich an VITE_RESERVATION_OPEN.
  const oauthNote = form.querySelector('[data-oauth-note]');
  if (online) {
    getProviders().then((pv) => {
      let any = false;
      form.querySelectorAll('[data-oauth]').forEach((b) => {
        if (!pv[b.dataset.oauth]) return;
        any = true;
        b.disabled = false; b.removeAttribute('aria-disabled'); b.classList.remove('is-soon'); b.querySelector('[data-soon]')?.remove();
        b.addEventListener('click', () => oauth(b.dataset.oauth));
      });
      if (any && oauthNote) oauthNote.textContent = oauthNote.dataset.on;
      if (!pv.email) closed.hidden = false;
    });
  }

  // Fraktion aus Kapitel 2 übernehmen
  const syncFx = () => { const f = getFaction(); radios.forEach((r) => { r.checked = r.value === f; }); draw(); };
  radios.forEach((r) => r.addEventListener('change', () => { if (r.checked) { setFaction(r.value, 'form'); blip('pick'); } }));
  syncFx();

  // Rufname live prüfen: Format sofort, Verfügbarkeit nach kurzer Pause
  let seq = 0, avail = null, tmr = 0;
  function setState(text, kind) { csState.textContent = text; csState.dataset.kind = kind || ''; form.querySelector('.fld-in')?.setAttribute('data-kind', kind || ''); }
  cs.addEventListener('input', () => {
    const f = callsignFormat(cs.value);
    avail = null; clearTimeout(tmr);
    draw();
    if (!f.ok) { setState(M.check[f.code], f.code === 'empty' ? '' : 'bad'); cs.setAttribute('aria-invalid', f.code === 'empty' ? 'false' : 'true'); return; }
    cs.setAttribute('aria-invalid', 'false');
    if (!online) { setState(M.check.unknown, 'ok'); return; }
    setState(M.check.checking, 'wait');
    const my = ++seq;
    tmr = setTimeout(async () => {
      const r = await callsignAvailable(cs.value);
      if (my !== seq) return;
      if (!r.known) { setState(M.check.unknown, 'ok'); return; }
      avail = r.available;
      setState(r.available ? M.check.free : M.check.taken, r.available ? 'ok' : 'bad');
    }, 420);
  });

  function say(text, kind) { msg.textContent = text; msg.dataset.kind = kind || ''; }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = callsignFormat(cs.value);
    const faction = getFaction();
    if (!f.ok) { say(M.check[f.code] || M.err.invalid, 'bad'); cs.focus(); return; }
    if (!FACTIONS.includes(faction)) { say(M.err.invalid, 'bad'); radios[0].focus(); return; }
    if (!open || !mail) { say(M.closed, 'warn'); return; }
    if (!emailOk(mail.value)) { say(M.err.email, 'bad'); mail.focus(); return; }
    if (consent && !consent.checked) { say(M.err.consent, 'bad'); consent.focus(); return; }
    if (avail === false) { say(M.err.taken, 'bad'); cs.focus(); return; }
    form.classList.add('is-busy');
    const r = await reserve({ callsign: cs.value, faction, email: mail.value, lang, returnTo: location.origin + location.pathname });
    form.classList.remove('is-busy');
    if (r.ok) { say(M.sent, 'ok'); blip('pick'); return; }
    say(r.reason === 'closed' ? M.closed : M.err[r.reason] || M.err.error, r.reason === 'closed' ? 'warn' : 'bad');
  });

  async function oauth(provider) {
    const f = callsignFormat(cs.value);
    if (!f.ok) { say(M.check[f.code] || M.err.invalid, 'bad'); cs.focus(); return; }
    if (!consent || !consent.checked) { say(M.err.consent, 'bad'); consent?.focus(); return; }
    const r = await startOAuth(provider, { callsign: cs.value, faction: getFaction(), returnTo: location.origin + location.pathname });
    if (!r.ok) say(r.reason === 'closed' ? M.closed : M.err.error, r.reason === 'closed' ? 'warn' : 'bad');
  }

  // ---------- Teilen-Karte ----------
  function draw() {
    if (!card) return;
    const g = card.getContext('2d');
    const W = card.width, H = card.height;
    const name = (confirmed && confirmed.callsign) || (callsignFormat(cs.value).ok ? cs.value.trim() : card.dataset.placeholder);
    const f = (confirmed && confirmed.faction) || getFaction() || 'saturn';
    const c = FX[f];
    g.fillStyle = '#04060a'; g.fillRect(0, 0, W, H);
    // Sterne
    let s = 2391; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 420; i++) { const m = Math.pow(rnd(), 6); g.fillStyle = `rgba(255,255,255,${0.15 + m * 0.85})`; g.fillRect(rnd() * W, rnd() * H, 1 + m * 2.4, 1 + m * 2.4); }
    // Glühen der Fraktion
    const gr = g.createRadialGradient(W * 0.5, H * 0.42, 0, W * 0.5, H * 0.42, W * 0.7);
    gr.addColorStop(0, hexA(c, 0.22)); gr.addColorStop(1, hexA(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // Rahmen mit Anschnitt und Eckmarken
    const m = 56, cut = 40;
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(m + cut, m); g.lineTo(W - m, m); g.lineTo(W - m, H - m - cut); g.lineTo(W - m - cut, H - m); g.lineTo(m, H - m); g.lineTo(m, m + cut); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(W - m - 30, m); g.lineTo(W - m, m); g.lineTo(W - m, m + 30); g.moveTo(m, H - m - 30); g.lineTo(m, H - m); g.lineTo(m + 30, H - m); g.stroke();
    g.fillStyle = c; g.fillRect(m + cut + 20, m + 92, 90, 4);
    const cond = '"DIN Condensed","DIN Alternate","Avenir Next Condensed","Arial Narrow",sans-serif';
    const mono = '"SF Mono",ui-monospace,Menlo,monospace';
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = `500 26px ${mono}`; g.textBaseline = 'alphabetic';
    track(g, 'TRANSMISSION · 2391', m + cut + 20, m + 72, 4);
    g.textAlign = 'right'; g.fillText(FXNAME[f], W - m - 30, m + 72); g.textAlign = 'left';
    // Signal-Ausschlag
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.lineJoin = 'miter';
    const y0 = H * 0.36;
    g.beginPath(); g.moveTo(m + 40, y0); g.lineTo(W * 0.4, y0); g.lineTo(W * 0.45, y0 - 120); g.lineTo(W * 0.52, y0 + 140); g.lineTo(W * 0.56, y0); g.lineTo(W - m - 40, y0); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.18)';
    for (let x = m + 40; x < W - m - 40; x += 24) g.fillRect(x, y0 + 40, 2, 10);
    // Name
    g.fillStyle = '#fff';
    let size = 150; g.font = `700 ${size}px ${cond}`;
    while (g.measureText(name.toUpperCase()).width > W - 2 * m - 120 && size > 60) { size -= 6; g.font = `700 ${size}px ${cond}`; }
    g.fillText(name.toUpperCase(), m + cut + 20, H * 0.6);
    g.fillStyle = 'rgba(255,255,255,.78)'; g.font = `400 46px ${cond}`;
    g.fillText(card.dataset.line, m + cut + 20, H * 0.6 + 70);
    g.fillStyle = c; g.font = `500 28px ${mono}`;
    track(g, card.dataset.sub.toUpperCase() + (confirmed ? ' · FOUNDER' : ''), m + cut + 20, H * 0.6 + 140, 5);
    // Schriftzug unten
    g.fillStyle = '#fff'; g.font = `700 64px ${cond}`;
    track(g, 'LAST SIGNALS', m + cut + 20, H - m - 70, 18);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = `400 24px ${mono}`;
    g.textAlign = 'right'; g.fillText(lang === 'de' ? 'LASTSIGNALS.DE' : 'LASTSIGNALS.ONLINE', W - m - 30, H - m - 76); g.textAlign = 'left';
    if (!confirmed) {
      g.save(); g.translate(W - m - 30, m + 140); g.rotate(0); g.fillStyle = 'rgba(255,176,32,.9)'; g.font = `500 24px ${mono}`; g.textAlign = 'right';
      g.fillText(lang === 'de' ? 'VORSCHAU' : 'PREVIEW', 0, 0); g.restore();
    }
  }
  draw();

  actions?.querySelector('[data-card-save]')?.addEventListener('click', () => {
    card.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `last-signals-${(confirmed?.callsign || 'pilot').toLowerCase()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png');
  });
  actions?.querySelector('[data-card-share]')?.addEventListener('click', (e) => {
    card.toBlob(async (b) => {
      const file = new File([b], 'last-signals.png', { type: 'image/png' });
      const text = e.currentTarget?.dataset.text || 'LAST SIGNALS';
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text });
        else actions.querySelector('[data-card-save]').click();
      } catch (_) { /* abgebrochen */ }
    }, 'image/png');
  });

  return {
    syncFaction: syncFx,
    // Nach bestätigter Reservierung: echte Karte statt Vorschau
    confirmed(p) {
      if (!p || !p.callsign) return;
      confirmed = p;
      if (p.faction) setFaction(p.faction, 'session');
      cs.value = p.callsign; cs.disabled = true; if (mail) mail.closest('.fld').hidden = true;
      form.querySelector('.fd-submit').disabled = true;
      consent?.closest('.chk')?.setAttribute('hidden', '');
      say(M.done, 'ok');
      if (cardCap) cardCap.textContent = card.dataset.sub;
      if (actions) actions.hidden = false;
      draw();
    },
  };
}

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function track(g, text, x, y, sp) { for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; } }
