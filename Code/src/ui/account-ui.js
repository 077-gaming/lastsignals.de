// Konto-Oberflächen (Planung/KONTEN.md): Anmelden, Konto anlegen, Passwort vergessen/neu, Rufname sichern,
// Standwahl (lokal oder Server), Hinweise und die Ruhmeshalle mit echten Daten (hall_of_fame).
// Dialoge liegen über allem (document.body) und schirmen Tasten vom Spiel ab (Ziffern, Enter, Esc).
import './account.css';
import { FACTIONS } from '../core/data.js';
import { esc, fmt, pad2, accentOf, FX_CODE } from './screens-kit.js';
import { progressOf, cmpProgress, MIN_PASSWORD, callsignProblem } from '../net/cloud-logic.js';

const FX_IDS = ['europa', 'saturn', 'eris'];
const when = (iso) => {
  if (!iso) return '--';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '--';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const hours = (s) => { const h = Math.floor((s || 0) / 3600), m = Math.floor(((s || 0) % 3600) / 60); return `${h} H ${pad2(m)} MIN`; };

// ---------------------------------------------------------------- Hinweis

export function toast(text, kind = 'info', ms = 5600) {
  const el = document.createElement('div');
  el.className = 'ac-toast';
  el.dataset.k = kind;
  el.setAttribute('role', kind === 'warn' ? 'alert' : 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 400);
}

// ---------------------------------------------------------------- Dialog-Grundgerüst

export const modalOpen = () => !!document.querySelector('.ac-modal');

function modal({ code, title, wide = false, closable = true }) {
  const el = document.createElement('div');
  el.className = `ac-modal${wide ? ' is-wide' : ''}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="ls-panel"><div class="ls-corners"></div>
    <header class="ls-head"><span class="ls-code">${code}</span><span class="ls-title">${esc(title)}</span><span class="ls-spacer"></span>${closable ? '<button type="button" class="ac-x" data-x aria-label="Schließen">[ESC]</button>' : ''}</header>
    <div class="ac-body" data-b></div></div>`;
  // Farbe wie der Bildschirm dahinter (Titel neutral, Hub in Fraktionsfarbe)
  const scr = document.querySelector('#screens .scr');
  const fx = (scr && getComputedStyle(scr).getPropertyValue('--fx').trim()) || (document.body.dataset.faction ? accentOf(document.body.dataset.faction) : '');
  if (fx) el.style.setProperty('--fx', fx);
  const prevFocus = document.activeElement;
  let onClose = null;
  // Tasten gehören dem Dialog: Spiel und Hub sehen sie nicht (Tippen und Absenden bleiben normal)
  const keys = (e) => {
    if (e.key === 'Escape' && closable) { e.preventDefault(); close(null); }
    else if (e.key === 'Tab') {
      const f = [...el.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((x) => x.offsetParent !== null);
      if (f.length) {
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    }
    e.stopPropagation();
  };
  const keysUp = (e) => e.stopPropagation();
  window.addEventListener('keydown', keys, true);
  window.addEventListener('keyup', keysUp, true);
  const close = (v) => {
    if (!el.isConnected) return;
    window.removeEventListener('keydown', keys, true);
    window.removeEventListener('keyup', keysUp, true);
    el.remove();
    try { prevFocus?.focus?.({ preventScroll: true }); } catch { /* egal */ }
    if (onClose) onClose(v);
  };
  el.querySelector('[data-x]')?.addEventListener('click', () => close(null));
  document.body.appendChild(el);
  return { el, body: el.querySelector('[data-b]'), close, set onClose(fn) { onClose = fn; } };
}

const field = (name, label, type = 'text', attrs = '') => `<label class="ac-f"><span>${label}</span><input name="${name}" type="${type}" spellcheck="false" autocapitalize="off" autocorrect="off" ${attrs}></label>`;
const fxPick = (cur) => `<div class="ac-f"><span>FRAKTION</span><div class="ac-fx" role="radiogroup" aria-label="Fraktion">${FX_IDS.map((id) => `<button type="button" role="radio" aria-checked="${id === cur}" class="${id === cur ? 'on' : ''}" data-fx="${id}" style="--c:${accentOf(id)}"><i></i>${esc(FACTIONS[id].name.toUpperCase())}</button>`).join('')}</div></div>`;

// ---------------------------------------------------------------- Anmelden / Konto anlegen / Passwort

/**
 * Konto-Dialog. mode: 'login' | 'signup' | 'reset' | 'claim' | 'newpw'.
 * prefill: { email, callsign, faction }. Ergebnis: { pilot } (angemeldet, Rufname gesichert), { passwordSet } oder null.
 */
export function accountDialog(account, { mode = 'login', prefill = {} } = {}) {
  return new Promise((resolve) => {
    const m = modal({ code: 'KTO·01', title: 'KONTO' });
    m.onClose = (v) => resolve(v || null);
    const st = { mode, email: prefill.email || '', callsign: prefill.callsign || '', faction: FX_IDS.includes(prefill.faction) ? prefill.faction : '', msg: prefill.msg || '', msgK: prefill.msgK || '' };
    let busy = false;

    const draw = () => {
      const tabs = st.mode === 'login' || st.mode === 'signup'
        ? `<div class="ac-tabs" role="tablist"><button type="button" role="tab" class="ac-tab${st.mode === 'login' ? ' on' : ''}" aria-selected="${st.mode === 'login'}" data-mode="login">MIT KONTO ANMELDEN</button><button type="button" role="tab" class="ac-tab${st.mode === 'signup' ? ' on' : ''}" aria-selected="${st.mode === 'signup'}" data-mode="signup">KONTO ANLEGEN</button></div>` : '';
      let inner = '';
      if (st.mode === 'login') {
        inner = `<p class="ac-lead">Ein Konto für Spiel und Website. Dein Spielstand liegt dann auf dem Server, du stehst in der Ruhmeshalle und spielst auf jedem Gerät weiter.</p>
          ${field('email', 'E-MAIL', 'email', 'autocomplete="username" inputmode="email"')}
          ${field('password', 'PASSWORT', 'password', 'autocomplete="current-password"')}
          <p class="ac-msg" data-msg></p>
          <div class="ac-row"><button type="button" class="ac-link" data-mode="reset">PASSWORT VERGESSEN</button><span class="ls-spacer"></span><button type="submit" class="ls-btn is-fx" data-go>ANMELDEN <span class="ls-key">ENTER</span></button></div>`;
      } else if (st.mode === 'signup') {
        inner = `<p class="ac-lead">Wir schicken dir eine Bestätigungsmail. Link öffnen, dann hier anmelden. Rufname und Fraktion werden bei der ersten Anmeldung gesichert.</p>
          ${field('email', 'E-MAIL', 'email', 'autocomplete="email" inputmode="email"')}
          ${field('password', `PASSWORT · MINDESTENS ${MIN_PASSWORD} ZEICHEN`, 'password', 'autocomplete="new-password"')}
          ${field('callsign', 'RUFNAME · 3–16 ZEICHEN · A-Z 0-9 - _', 'text', 'maxlength="16" autocomplete="off"')}
          ${fxPick(st.faction)}
          <p class="ac-msg" data-msg></p>
          <div class="ac-row"><p class="ac-note">Datenschutz: lastsignals.de/datenschutz</p><span class="ls-spacer"></span><button type="submit" class="ls-btn is-fx" data-go>KONTO ANLEGEN</button></div>`;
      } else if (st.mode === 'reset') {
        inner = `<p class="ac-lead">Gib die E-Mail deines Kontos ein. Du bekommst einen Link, mit dem du ein neues Passwort setzt.</p>
          ${field('email', 'E-MAIL', 'email', 'autocomplete="username" inputmode="email"')}
          <p class="ac-msg" data-msg></p>
          <div class="ac-row"><button type="button" class="ac-link" data-mode="login">ZURÜCK ZUR ANMELDUNG</button><span class="ls-spacer"></span><button type="submit" class="ls-btn is-fx" data-go>LINK SENDEN</button></div>`;
      } else if (st.mode === 'claim') {
        inner = `<p class="ac-lead">Angemeldet. Zu diesem Konto gehört noch kein Rufname. Wähle Rufname und Fraktion, sie gelten dann für Spiel und Website.</p>
          ${field('callsign', 'RUFNAME · 3–16 ZEICHEN · A-Z 0-9 - _', 'text', 'maxlength="16" autocomplete="off"')}
          ${fxPick(st.faction)}
          <p class="ac-msg" data-msg></p>
          <div class="ac-row"><span class="ls-spacer"></span><button type="submit" class="ls-btn is-fx" data-go>RUFNAME SICHERN</button></div>`;
      } else if (st.mode === 'newpw') {
        inner = `<p class="ac-lead">Link aus der Mail erkannt. Lege jetzt ein neues Passwort fest.</p>
          ${field('password', `NEUES PASSWORT · MINDESTENS ${MIN_PASSWORD} ZEICHEN`, 'password', 'autocomplete="new-password"')}
          ${field('password2', 'WIEDERHOLEN', 'password', 'autocomplete="new-password"')}
          <p class="ac-msg" data-msg></p>
          <div class="ac-row"><span class="ls-spacer"></span><button type="submit" class="ls-btn is-fx" data-go>PASSWORT SPEICHERN</button></div>`;
      }
      m.body.innerHTML = `${tabs}<form class="ac-body" style="padding:0" novalidate data-form>${inner}</form>`;
      const f = m.body.querySelector('[data-form]');
      if (f.email) f.email.value = st.email;
      if (f.callsign) f.callsign.value = st.callsign;
      setMsg(st.msg, st.msgK);
      const first = [...f.querySelectorAll('input')].find((i) => !i.value) || f.querySelector('input');
      setTimeout(() => first?.focus({ preventScroll: true }), 20);
    };
    const setMsg = (t, k = '') => {
      const el = m.body.querySelector('[data-msg]');
      if (!el) return;
      el.dataset.k = k;
      el.innerHTML = t ? `<i></i><span>${esc(t)}</span>` : '';
    };
    const keepInputs = () => {
      const f = m.body.querySelector('[data-form]');
      if (!f) return;
      if (f.email) st.email = f.email.value;
      if (f.callsign) st.callsign = f.callsign.value;
    };
    const setBusy = (b, label) => {
      busy = b;
      const go = m.body.querySelector('[data-go]');
      if (!go) return;
      go.disabled = b;
      go.classList.toggle('ac-btn-busy', b);
      if (b) { go.dataset.label = go.innerHTML; go.textContent = label || '…'; } else if (go.dataset.label) go.innerHTML = go.dataset.label;
    };

    const done = (pilot) => { m.close({ pilot }); };
    const afterLogin = (r) => {
      if (!r.ok) { setMsg(r.error, 'err'); return; }
      if (r.needCallsign) {
        st.mode = 'claim';
        st.callsign = r.suggest?.callsign || st.callsign; st.faction = r.suggest?.faction || st.faction;
        st.msg = r.error || ''; st.msgK = r.error ? 'err' : '';
        draw();
        return;
      }
      done(r.pilot);
    };

    const submit = async () => {
      if (busy) return;
      keepInputs();
      const f = m.body.querySelector('[data-form]');
      st.msg = ''; setMsg('');
      if (st.mode === 'login') {
        setBusy(true, 'VERBINDE …');
        const r = await account.login(f.email.value, f.password.value);
        setBusy(false);
        afterLogin(r);
        if (!r.ok) f.password.select();
      } else if (st.mode === 'signup') {
        if (!st.faction) { setMsg('FRAKTION WÄHLEN.', 'err'); return; }
        setBusy(true, 'SENDE …');
        const r = await account.signup({ email: f.email.value, password: f.password.value, callsign: f.callsign.value, faction: st.faction });
        setBusy(false);
        if (!r.ok) { setMsg(r.error, 'err'); (r.field === 'callsign' ? f.callsign : null)?.focus(); return; }
        if (r.signedIn) { afterLogin(r); return; }
        st.mode = 'login';
        st.msg = `BESTÄTIGUNGSMAIL GESENDET AN ${st.email.trim()}. Mail öffnen, Link anklicken, dann hier anmelden.`;
        st.msgK = 'ok';
        draw();
      } else if (st.mode === 'reset') {
        setBusy(true, 'SENDE …');
        const r = await account.resetPassword(f.email.value);
        setBusy(false);
        if (!r.ok) { setMsg(r.error, 'err'); return; }
        st.mode = 'login';
        st.msg = 'LINK GESENDET, FALLS ES DAS KONTO GIBT. Mail öffnen, neues Passwort setzen, dann hier anmelden.';
        st.msgK = 'ok';
        draw();
      } else if (st.mode === 'claim') {
        const cp = callsignProblem(f.callsign.value);
        if (cp) { setMsg(cp, 'err'); f.callsign.focus(); return; }
        if (!st.faction) { setMsg('FRAKTION WÄHLEN.', 'err'); return; }
        setBusy(true, 'SICHERE …');
        const r = await account.ensurePilot({ callsign: f.callsign.value.trim(), faction: st.faction });
        setBusy(false);
        if (r.ok && r.needCallsign) { setMsg(r.error || 'RUFNAME NICHT MÖGLICH.', 'err'); return; }
        afterLogin(r);
      } else if (st.mode === 'newpw') {
        if (f.password.value !== f.password2.value) { setMsg('PASSWÖRTER STIMMEN NICHT ÜBEREIN.', 'err'); return; }
        setBusy(true, 'SPEICHERE …');
        const r = await account.setPassword(f.password.value);
        setBusy(false);
        if (!r.ok) { setMsg(r.error, 'err'); return; }
        m.close({ passwordSet: true });
      }
    };

    m.body.addEventListener('click', (e) => {
      const md = e.target.closest('[data-mode]');
      if (md) { keepInputs(); st.mode = md.dataset.mode; st.msg = ''; draw(); return; }
      const fx = e.target.closest('[data-fx]');
      if (fx) {
        keepInputs();
        st.faction = fx.dataset.fx;
        for (const b of m.body.querySelectorAll('[data-fx]')) { const on = b === fx; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }
      }
    });
    m.body.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
    draw();
  });
}

// ---------------------------------------------------------------- Standwahl

function card(kind, title, p, sub, opts) {
  const pr = progressOf(p);
  return `<button type="button" class="ac-card${opts.rec ? ' is-rec' : ''}" data-pick="${kind}" ${opts.disabled ? 'disabled' : ''}>
    <span class="ac-card-h"><b>${title}</b>${opts.rec ? '<em>EMPFOHLEN</em>' : ''}</span>
    <span class="ls-label">${esc(sub)}</span>
    <dl class="ac-kv">
      <dt>FRAKTION</dt><dd>${esc(FACTIONS[p.faction]?.name.toUpperCase() || '--')}</dd>
      <dt>STUFE</dt><dd>${pad2(pr.level)}</dd>
      <dt>ERFAHRUNG</dt><dd>${fmt(pr.xp)}</dd>
      <dt>EHRE</dt><dd>${fmt(pr.honor)}</dd>
      <dt>CREDITS</dt><dd>${fmt(p.credits || 0)}</dd>
      <dt>SPIELZEIT</dt><dd>${hours(pr.play)}</dd>
      <dt>STAND</dt><dd>${esc(when(opts.at || pr.at))}</dd>
    </dl>
    ${opts.warn ? `<span class="ac-warn">${esc(opts.warn)}</span>` : ''}
  </button>`;
}

/**
 * Welcher Stand gilt? local = Spielstand im Browser, remote = { data, version, updated_at } oder null (dann
 * bietet die rechte Karte einen neuen Piloten im Konto an). Ergebnis 'local' | 'remote' (nie stillschweigend).
 */
export function chooseSave({ local, remote, pilot, fresh = null, reason = 'login' }) {
  return new Promise((resolve) => {
    const m = modal({ code: 'KTO·02', title: reason === 'conflict' ? 'ANDERES GERÄT WAR NEUER' : 'WELCHER SPIELSTAND GILT?', wide: true, closable: false });
    m.onClose = (v) => resolve(v || 'remote');
    const rp = remote ? remote.data : fresh;
    const mismatch = local && pilot && local.faction !== pilot.faction;
    const c = rp && local ? cmpProgress(local, rp) : 0;
    const lead = reason === 'conflict'
      ? 'Ein anderes Gerät hat inzwischen einen Spielstand gesichert. Beide haben gleich viel Fortschritt – entscheide, welcher weiterzählt. Der andere bleibt als Sicherung in diesem Browser.'
      : `Für ${esc(pilot ? pilot.callsign.toUpperCase() : '')} gibt es einen Stand in diesem Browser${remote ? ' und einen auf dem Server' : ''}. Wähle, welcher ab jetzt gilt. Der andere bleibt als Sicherung in diesem Browser.`;
    m.body.innerHTML = `<p class="ac-lead">${lead}</p>
      <div class="ac-cmp">
        ${card('local', 'DIESES GERÄT', local, 'LOKALER STAND', { rec: !mismatch && c > 0, disabled: mismatch, warn: mismatch ? `ANDERE FRAKTION ALS DAS KONTO (${FACTIONS[pilot.faction]?.name.toUpperCase()}) · KANN NICHT VERKNÜPFT WERDEN` : '' })}
        ${card('remote', remote ? 'SERVER' : 'NEUER PILOT', rp, remote ? `KONTO · VERSION ${remote.version}` : 'IM KONTO NEU BEGINNEN', { rec: mismatch || c < 0, at: remote && remote.updated_at })}
      </div>
      <p class="ac-note">Empfehlung: mehr Fortschritt (Stufe, dann Erfahrung). Bei Gleichstand entscheidest du.</p>`;
    m.body.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b && !b.disabled) m.close(b.dataset.pick); });
    setTimeout(() => m.body.querySelector('.ac-card.is-rec, .ac-card:not([disabled])')?.focus({ preventScroll: true }), 30);
  });
}

// ---------------------------------------------------------------- Kontozeile (Titel, Einstellungen)

export function statusText(account) {
  const s = account.status || {};
  const t = s.at ? new Date(s.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
  switch (s.phase) {
    case 'saving': return ['SICHERT …', ''];
    case 'ok': return [`${s.text || 'GESICHERT'} ${t}`.trim(), 'is-ok'];
    case 'offline': return ['OFFLINE · WIRD NACHGESICHERT', 'is-warn'];
    case 'conflict': return ['ANDERES GERÄT NEUER', 'is-warn'];
    case 'too-big': return ['ZU GROSS · NUR LOKAL', 'is-warn'];
    case 'error': return ['FEHLER · NUR LOKAL', 'is-warn'];
    default: return ['BEREIT', ''];
  }
}

// ---------------------------------------------------------------- Ruhmeshalle (echte Daten)

const ORDERS = [['honor', 'EHRE'], ['xp', 'ERFAHRUNG'], ['kills', 'ABSCHÜSSE'], ['level', 'STUFE']];
const hofState = { order: 'honor', fx: '' };
const hofCache = new Map(); // key → { at, rows }

/** Ruhmeshalle in einen Container zeichnen. me = aktueller Spielstand (für „DU“), onLogin = Konto-Dialog öffnen */
export function hallBoard(el, { account, me, onLogin }) {
  const linked = !!(me && account && account.linked(me.callsign));
  const draw = (rows, state = '') => {
    const meLc = linked ? String(me.callsign).toLowerCase() : '';
    const myIdx = rows ? rows.findIndex((r) => String(r.callsign).toLowerCase() === meLc) : -1;
    const sortCls = (k) => (hofState.order === k ? ' is-sort' : '');
    const row = (r, i) => `<div class="hof-tr${i === myIdx ? ' me' : ''}${i === 0 ? ' is-top1' : ''}" style="--c:${accentOf(r.faction)}">
      <span class="ls-num hof-pl">${pad2(i + 1)}</span><span class="hof-cs">${esc(String(r.callsign).toUpperCase())}</span>
      <span class="hof-f"><i></i>${esc(FX_CODE[r.faction] || '--')} ${esc(FACTIONS[r.faction]?.name.toUpperCase() || '')}</span>
      <span class="ls-num${sortCls('level')}">${pad2(r.level || 1)}</span><span class="ls-num${sortCls('honor')}">${fmt(r.honor || 0)}</span><span class="ls-num${sortCls('xp')}">${fmt(r.xp || 0)}</span><span class="ls-num${sortCls('kills')}">${fmt(r.kills || 0)}</span></div>`;
    let list = '';
    if (rows === null) list = '<div class="hof-load" aria-hidden="true"></div>';
    else if (rows === false) list = `<div class="hof-empty"><b>RUHMESHALLE NICHT ERREICHBAR</b><span>${esc(state)}</span></div>`;
    else if (!rows.length) list = `<div class="hof-empty"><b>NOCH KEIN NAME AUF DER TAFEL</b><span>Piloten mit Konto erscheinen hier, sobald ihr Spielstand auf dem Server liegt.</span></div>`;
    else {
      list = rows.map(row).join('');
      if (linked && myIdx < 0) {
        const pr = progressOf(me);
        list += `<div class="hof-gap">DEIN EINTRAG · NICHT UNTER DEN ERSTEN ${rows.length}${hofState.fx && hofState.fx !== me.faction ? ' DIESER FRAKTION' : ''}</div>`
          + `<div class="hof-tr me" style="--c:${accentOf(me.faction)}"><span class="ls-num hof-pl">--</span><span class="hof-cs">${esc(String(me.callsign).toUpperCase())}</span><span class="hof-f"><i></i>${esc(FX_CODE[me.faction] || '')} ${esc(FACTIONS[me.faction]?.name.toUpperCase() || '')}</span><span class="ls-num">${pad2(pr.level)}</span><span class="ls-num">${fmt(pr.honor)}</span><span class="ls-num">${fmt(pr.xp)}</span><span class="ls-num">${fmt(pr.kills)}</span></div>`;
      }
    }
    const who = linked ? '' : `<div class="hof-empty" style="padding:12px 10px"><b>DU STEHST NOCH NICHT AUF DER TAFEL</b><span>Nur Piloten mit Konto werden gewertet. Dein lokaler Stand bleibt, er wird beim Anmelden verknüpft.</span>${onLogin ? '<button type="button" class="ls-btn is-fx" data-hof-login>MIT KONTO ANMELDEN</button>' : ''}</div>`;
    el.innerHTML = `<div class="hof">
      <div class="hof-bar">
        <div class="hof-seg" role="tablist" aria-label="Wertung">${ORDERS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${hofState.order === k}" class="${hofState.order === k ? 'on' : ''}" data-hof-order="${k}">${t}</button>`).join('')}</div>
        <div class="hof-seg" role="group" aria-label="Fraktion"><button type="button" class="${!hofState.fx ? 'on' : ''}" data-hof-fx="">ALLE</button>${FX_IDS.map((id) => `<button type="button" class="${hofState.fx === id ? 'on' : ''}" data-hof-fx="${id}" style="--c:${accentOf(id)}"><i></i>${esc(FX_CODE[id] || id.toUpperCase())}</button>`).join('')}</div>
        <span class="hof-state" data-hof-st>${rows === null ? 'LADE …' : rows === false ? 'OFFLINE' : `LIVE · ${pad2(rows.length)} PILOTEN`}</span>
      </div>
      ${who}
      <div class="hof-tbl" role="table" aria-label="Ruhmeshalle">
        <div class="hof-tr hof-th" role="row"><span>PL</span><span>PILOT</span><span>FRAKTION</span><span class="${sortCls('level')}">ST</span><span class="${sortCls('honor')}">EHRE</span><span class="${sortCls('xp')}">EP</span><span class="${sortCls('kills')}">ABSCH.</span></div>
        ${list}
      </div>
    </div>`;
  };
  const load = async () => {
    const key = `${hofState.fx}|${hofState.order}`;
    const hit = hofCache.get(key);
    if (hit && Date.now() - hit.at < 60000) { draw(hit.rows); return; }
    draw(null);
    try {
      const rows = await account.hall(hofState.fx || null, hofState.order, 100);
      hofCache.set(key, { at: Date.now(), rows });
      if (el.isConnected) draw(rows);
    } catch (e) {
      if (el.isConnected) draw(false, 'Keine Verbindung zum Server. Später erneut öffnen.');
    }
  };
  el.addEventListener('click', (e) => {
    const o = e.target.closest('[data-hof-order]');
    if (o) { hofState.order = o.dataset.hofOrder; load(); return; }
    const f = e.target.closest('[data-hof-fx]');
    if (f) { hofState.fx = f.dataset.hofFx; load(); return; }
    if (e.target.closest('[data-hof-login]') && onLogin) onLogin();
  });
  load();
}
export function clearHallCache() { hofCache.clear(); }
