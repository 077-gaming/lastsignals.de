// Ruhmeshalle der Website mit echten Daten: öffentliche Datenbankfunktion hall_of_fame (Supabase, nur lesen).
// Ohne SDK (ein fetch genügt), damit die Seite leicht bleibt. Gleiche Werte wie im Spiel (Hub → RUHMESHALLE).
// Zugang: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY wie src/api.js; fehlen sie (lokaler Build ohne .env.local),
// gelten die öffentlichen Werte des Projekts (publishable key, steht auch im Spiel – kein Geheimnis).
const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').trim() || 'https://ydvtdxvnkmjbdwxsriuv.supabase.co';
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() || 'sb_publishable_7bAvG-sHZiTgXmMI_-Oqgg_gMFC5Pnc';
const FX_HEX = { europa: '#d8b25a', saturn: '#e0782a', eris: '#9a52ff' };
const FX_CODE = { europa: 'EU', saturn: 'SA', eris: 'ER' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

export async function fetchHall(faction, order, limit = 50) {
  const r = await fetch(`${URL_}/rest/v1/rpc/hall_of_fame`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_faction: faction || null, p_order: order, p_limit: limit }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return Array.isArray(d) ? d : [];
}

export function initHall(el) {
  const lang = el.dataset.lang || 'de';
  const T = JSON.parse(el.dataset.t || '{}');
  const num = new Intl.NumberFormat(lang === 'de' ? 'de-DE' : 'en-US');
  const rowsEl = el.querySelector('[data-hall-rows]');
  const invite = el.querySelector('template[data-hall-invite]')?.innerHTML || ''; // Einladung, solange die Tafel leer ist
  const stateEl = el.querySelector('[data-hall-state]');
  const st = { order: 'honor', fx: '' };
  const cache = new Map();
  let seq = 0;

  const mark = (attr, val) => el.querySelectorAll(`[${attr}]`).forEach((b) => {
    const on = b.getAttribute(attr) === val;
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  });
  const draw = (rows) => {
    el.classList.add('is-live');
    const k = st.order;
    const head = `<li class="hall-th" aria-hidden="true"><span>${esc(T.cols[0])}</span><span>${esc(T.cols[1])}</span><span>${esc(T.cols[2])}</span>${['level', 'honor', 'xp', 'kills'].map((c, i) => `<span class="${c === k ? 'is-sort' : ''}">${esc(T.cols[3 + i])}</span>`).join('')}</li>`;
    if (!rows.length) { el.classList.remove('is-live'); rowsEl.innerHTML = invite; return; }
    rowsEl.innerHTML = head + rows.map((r, i) => `<li class="hall-row${i === 0 ? ' is-first' : ''}" style="--c:${FX_HEX[r.faction] || '#fff'}">
      <span class="ls-num">${pad(i + 1)}</span><b>${esc(String(r.callsign).toUpperCase())}</b>
      <span class="hall-fx"><i aria-hidden="true"></i>${esc(FX_CODE[r.faction] || '--')}</span>
      ${['level', 'honor', 'xp', 'kills'].map((c) => `<span class="ls-num${c === k ? ' is-sort' : ''}">${c === 'level' ? pad(r.level || 1) : num.format(r[c] || 0)}</span>`).join('')}
    </li>`).join('');
  };
  const load = async () => {
    const key = `${st.fx}|${st.order}`;
    const my = ++seq;
    const label = (n) => (n ? `LIVE · ${pad(n)} ${T.pilots}` : T.open);
    if (cache.has(key)) { draw(cache.get(key)); stateEl.textContent = label(cache.get(key).length); return; }
    stateEl.textContent = T.loading;
    el.setAttribute('aria-busy', 'true');
    try {
      const rows = await fetchHall(st.fx, st.order, 50);
      cache.set(key, rows);
      if (my !== seq) return;
      draw(rows);
      stateEl.textContent = label(rows.length);
    } catch (e) {
      if (my !== seq) return;
      el.classList.add('is-live');
      rowsEl.innerHTML = `<li class="hall-msg">${esc(T.offline)}</li>`;
      stateEl.textContent = 'OFFLINE';
    } finally { el.removeAttribute('aria-busy'); }
  };
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-hall-order]');
    if (o) { st.order = o.dataset.hallOrder; mark('data-hall-order', st.order); load(); return; }
    const f = e.target.closest('[data-hall-fx]');
    if (f) { st.fx = f.dataset.hallFx; mark('data-hall-fx', st.fx); load(); }
  });
  load();
}
