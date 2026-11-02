// Konto und Server-Spielstand (Planung/KONTEN.md). Ohne DOM, Netz nur über die austauschbare Schicht `api`
// (account-api.js = Supabase, account-mock.js = Attrappe). Der lokale Spielstand (core/store.js) bleibt immer
// die Arbeitskopie: Das Spiel liest und schreibt nur lokal, dieses Modul gleicht mit dem Server ab.
//
// Sichern: push(profile) mit Versionsprüfung (save_pilot_state). Bei conflict wird der Server-Stand geladen und
// nach cloud-logic.decideConflict entschieden: mehr Fortschritt gewinnt, sonst fragt das Spiel (pending).
// Offline: Fehler „keine Verbindung“ → Stand bleibt lokal, Markierung dirty, nächster Anlass sichert nach.
import { newProfile } from '../core/data.js';
import {
  hashOf, payloadOf, decideLogin, decideConflict, adoptRemote, errorText, isOffline, callsignProblem,
  emailOk, MIN_PASSWORD, progressOf,
} from './cloud-logic.js';

const META_KEY = 'ls.cloud.v1';         // { [rufname klein]: { user, version, hash, at, dirty } }
const BACKUP_KEY = 'ls.cloud.backup.';  // + rufname klein → { at, reason, data } (ersetzter lokaler Stand)
const PENDING_KEY = 'ls.cloud.pending';
const PILOT_KEY = 'ls.cloud.pilot';     // zuletzt bekannter Pilot des Kontos (offline) // { callsign, faction, email } bis zur ersten Anmeldung nach „Konto anlegen“
export const SIGNUP_REDIRECT = 'https://lastsignals.de/';
export const RESET_REDIRECT = 'https://lastsignals.de/play/';

const lc = (s) => String(s || '').trim().toLowerCase();
const defaultKv = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* voll/privat */ } },
};

export class Account {
  /** @param {{ api, local, kv?, client?, now? }} o  local = { get(cs), save(p) } (core/store.js) */
  constructor({ api, local, kv = defaultKv, client = 'web', now = () => Date.now() }) {
    this.api = api; this.local = local; this.kv = kv; this.client = client; this.now = now;
    this.session = null; this.user = null; this.pilot = null;
    this.pending = null;   // offener Konflikt { decision: 'remote'|'ask', remote }
    this.status = { phase: 'idle', at: 0, text: '' };
    this.recovery = false; // Passwort-Link geöffnet: neues Passwort setzen
    this._fns = new Set();
    this._busy = null; this._again = null;
    this.ready = false;
  }

  on(fn) { this._fns.add(fn); return () => this._fns.delete(fn); }
  _emit(type, detail = {}) { for (const fn of this._fns) { try { fn(type, detail); } catch (e) { console.error(e); } } }
  _setStatus(phase, text = '') { this.status = { phase, at: this.now(), text }; this._emit('status', this.status); }

  get signedIn() { return !!this.user; }
  get callsign() { return this.pilot ? this.pilot.callsign : ''; }
  /** Gehört der Pilot zu diesem Konto? Nur dann wird er auf dem Server gesichert. */
  linked(callsign) { return !!(this.user && this.pilot && lc(callsign) === lc(this.pilot.callsign)); }

  // ── Speicher für Abgleich-Daten ──
  _metaAll() { try { return JSON.parse(this.kv.get(META_KEY) || '{}') || {}; } catch { return {}; } }
  meta(callsign) {
    const m = this._metaAll()[lc(callsign)];
    return m && this.user && m.user === this.user.id ? m : null; // Abgleich eines anderen Kontos zählt nicht
  }
  _setMeta(callsign, patch) {
    const all = this._metaAll();
    all[lc(callsign)] = { ...(all[lc(callsign)] || {}), ...patch, user: this.user ? this.user.id : null };
    this.kv.set(META_KEY, JSON.stringify(all));
  }
  backup(callsign, data, reason) {
    if (!data) return;
    try { this.kv.set(BACKUP_KEY + lc(callsign), JSON.stringify({ at: new Date(this.now()).toISOString(), reason, data })); } catch { /* voll */ }
  }
  lastBackup(callsign) { try { return JSON.parse(this.kv.get(BACKUP_KEY + lc(callsign)) || 'null'); } catch { return null; } }

  // ── Sitzung ──
  async init() {
    try {
      if (!this._authSub) this._authSub = this.api.onAuth?.((ev, session) => {
        if (ev === 'PASSWORD_RECOVERY') { this.recovery = true; this._emit('recovery'); }
        if (ev === 'SIGNED_OUT') { this.session = null; this.user = null; this.pilot = null; this._emit('auth'); }
        if (session) { this.session = session; this.user = session.user; }
      });
      const s = await this.api.getSession();
      if (s) {
        this.session = s; this.user = s.user;
        try { await this._loadPilot(); } catch (e) { if (!isOffline(e)) console.warn('Pilot nicht geladen', e); }
      }
    } catch (e) {
      if (!isOffline(e)) console.warn('Sitzung nicht geprüft', e);
    }
    this.ready = true; this._initDone = true;
    this._emit('auth');
    return { signedIn: this.signedIn, recovery: this.recovery };
  }
  // Pilot des Kontos; zuletzt bekannter Pilot liegt lokal, damit das Spiel auch offline weiß, wer angemeldet ist
  async _loadPilot() {
    if (!this.user) { this.pilot = null; return null; }
    try {
      this.pilot = await this.api.getPilot(this.user.id);
      this.kv.set(PILOT_KEY, this.pilot ? JSON.stringify({ user: this.user.id, ...this.pilot }) : null);
    } catch (e) {
      let c = null;
      try { c = JSON.parse(this.kv.get(PILOT_KEY) || 'null'); } catch { c = null; }
      if (!isOffline(e) || !c || c.user !== this.user.id) throw e;
      this.pilot = { id: c.id, callsign: c.callsign, faction: c.faction, title: c.title || null };
      this._setStatus('offline', 'OFFLINE · WIRD NACHGESICHERT');
    }
    return this.pilot;
  }

  /** Anmelden. Ergebnis: { ok, pilot } | { ok: true, needCallsign: true, suggest } | { ok: false, error } */
  async login(email, password) {
    if (!emailOk(email)) return { ok: false, error: 'E-MAIL-ADRESSE UNGÜLTIG.' };
    if (!password) return { ok: false, error: 'PASSWORT EINGEBEN.' };
    try {
      const s = await this.api.signIn(String(email).trim(), password);
      this.session = s; this.user = s.user;
      this._emit('auth');
      return await this.ensurePilot();
    } catch (e) { return { ok: false, error: errorText(e), offline: isOffline(e) }; }
  }

  /** Nach der Anmeldung: Pilot laden, sonst Rufname aus der Registrierung sichern (claim_callsign). */
  async ensurePilot(want = null) {
    if (!this.user) return { ok: false, error: errorText({ code: 'not-signed-in' }) };
    try {
      if (await this._loadPilot()) return { ok: true, pilot: this.pilot };
      let pend = null;
      try { pend = JSON.parse(this.kv.get(PENDING_KEY) || 'null'); } catch { pend = null; }
      const meta = this.user.user_metadata || {};
      const w = want || (meta.callsign ? { callsign: meta.callsign, faction: meta.faction } : pend);
      if (!w || !w.callsign || callsignProblem(w.callsign) || !['europa', 'saturn', 'eris'].includes(w.faction)) {
        return { ok: true, needCallsign: true, suggest: w || null };
      }
      try {
        this.pilot = await this.api.claim(w.callsign.trim(), w.faction);
      } catch (e) {
        if (/bereits gesichert/i.test(e.message || '') && await this._loadPilot()) return { ok: true, pilot: this.pilot };
        if (e.code === '23505' || /duplicate|unique/i.test(e.message || '')) return { ok: true, needCallsign: true, suggest: w, error: errorText({ code: 'taken' }) };
        throw e;
      }
      this.kv.set(PENDING_KEY, null);
      this._emit('auth');
      return { ok: true, pilot: this.pilot, claimed: true };
    } catch (e) { return { ok: false, error: errorText(e), offline: isOffline(e) }; }
  }

  /** Konto anlegen: Bestätigungsmail (emailRedirectTo lastsignals.de). Ergebnis { ok, confirm } | { ok, signedIn } | { ok: false, error } */
  async signup({ email, password, callsign, faction }) {
    if (!emailOk(email)) return { ok: false, error: 'E-MAIL-ADRESSE UNGÜLTIG.' };
    if (String(password || '').length < MIN_PASSWORD) return { ok: false, error: `PASSWORT: MINDESTENS ${MIN_PASSWORD} ZEICHEN.` };
    const cp = callsignProblem(callsign);
    if (cp) return { ok: false, error: cp, field: 'callsign' };
    if (!['europa', 'saturn', 'eris'].includes(faction)) return { ok: false, error: 'FRAKTION WÄHLEN.' };
    try {
      if (!(await this.api.available(callsign.trim()))) return { ok: false, error: errorText({ code: 'taken' }), field: 'callsign' };
      const r = await this.api.signUp(String(email).trim(), password, { callsign: callsign.trim(), faction, lang: 'de' }, SIGNUP_REDIRECT);
      if (r.existing) return { ok: false, error: errorText({ code: 'user_already_exists' }) };
      this.kv.set(PENDING_KEY, JSON.stringify({ callsign: callsign.trim(), faction, email: String(email).trim() }));
      if (r.session) { this.session = r.session; this.user = r.session.user; this._emit('auth'); return { ok: true, signedIn: true, ...(await this.ensurePilot()) }; }
      return { ok: true, confirm: true };
    } catch (e) { return { ok: false, error: errorText(e), offline: isOffline(e) }; }
  }

  async resetPassword(email) {
    if (!emailOk(email)) return { ok: false, error: 'E-MAIL-ADRESSE UNGÜLTIG.' };
    try { await this.api.resetPassword(String(email).trim(), RESET_REDIRECT); return { ok: true }; } catch (e) { return { ok: false, error: errorText(e) }; }
  }
  async setPassword(password) {
    if (String(password || '').length < MIN_PASSWORD) return { ok: false, error: `PASSWORT: MINDESTENS ${MIN_PASSWORD} ZEICHEN.` };
    try { await this.api.updatePassword(password); this.recovery = false; return { ok: true }; } catch (e) { return { ok: false, error: errorText(e) }; }
  }
  async logout() {
    await this.api.signOut();
    this.session = null; this.user = null; this.pilot = null; this.pending = null;
    this.kv.set(PILOT_KEY, null);
    this._setStatus('idle');
    this._emit('auth');
  }

  // ── Spielstand ──
  async fetchRemote() {
    if (!this.pilot) return null;
    return this.api.loadSave(this.pilot.id);
  }

  /**
   * Nach der Anmeldung: lokalen und Server-Stand vergleichen.
   * Ergebnis { decision, local, remote, mismatch } – decision: 'local' | 'remote' | 'same' | 'none' | 'ask'
   */
  async loginPlan() {
    const cs = this.pilot.callsign;
    const local = this.local.get(cs);
    const remote = await this.fetchRemote();
    let decision = decideLogin(local, remote, this.meta(cs));
    // Lokaler Pilot gleichen Namens aus einer anderen Fraktion: nie automatisch hochladen, Spieler entscheidet
    const mismatch = !!(local && local.faction !== this.pilot.faction);
    if (mismatch && (decision === 'local' || decision === 'ask' || decision === 'same')) decision = 'ask';
    return { decision, local, remote, mismatch };
  }

  /** Entscheidung umsetzen. choice: 'local' | 'remote' | 'none'. Gibt den gültigen Spielstand zurück. */
  async applyPlan(plan, choice) {
    const cs = this.pilot.callsign;
    if (choice === 'local' && plan.mismatch) choice = plan.remote ? 'remote' : 'none'; // andere Fraktion nie hochladen
    if (choice === 'remote' && plan.remote) return this.applyRemote(plan.remote, 'Server-Stand übernommen');
    if (choice === 'remote' || choice === 'none' || !plan.local) {
      // neuer Pilot (oder lokaler Stand passt nicht zur Fraktion des Kontos): frisch anlegen, alten lokal sichern
      if (plan.local) this.backup(cs, plan.local, 'Neuer Kontostand');
      const p = newProfile(cs, this.pilot.faction);
      this.local.save(p);
      await this.push(p, { base: plan.remote ? plan.remote.version : 0 });
      return p;
    }
    // lokaler Stand gilt
    const p = plan.local;
    p.callsign = cs;
    if (plan.remote && plan.remote.data) this.backup(cs, adoptRemote(plan.remote.data, this.pilot), 'Server-Stand ersetzt');
    this.local.save(p);
    await this.push(p, { base: plan.remote ? plan.remote.version : 0, always: true });
    return p;
  }

  /** Server-Stand lokal übernehmen (alter lokaler Stand bleibt als Sicherung) */
  applyRemote(remote, reason = 'Server-Stand übernommen') {
    const cs = this.pilot.callsign;
    const old = this.local.get(cs);
    if (old && hashOf(old) !== hashOf(remote.data)) this.backup(cs, old, reason);
    const p = adoptRemote(remote.data, this.pilot);
    this.local.save(p);
    this._setMeta(cs, { version: remote.version, hash: hashOf(p), at: this.now(), dirty: false });
    this.pending = null;
    this._setStatus('ok', 'SERVER-STAND GELADEN');
    return p;
  }

  /**
   * Sichern mit Versionsprüfung. opts.base = Version, auf der aufgebaut wird (sonst letzte bekannte),
   * opts.always = auch ohne Änderung. Ergebnis:
   *   { ok, version } | { unchanged } | { skipped } | { offline } | { tooBig } | { error } | { conflict, decision, remote }
   */
  async push(profile, opts = {}) {
    if (!profile || !this.linked(profile.callsign)) return { skipped: 'not-linked' };
    if (this.pending && !opts.force) return { skipped: 'pending' };
    if (this._busy) { this._again = { profile, opts }; return this._busy; }
    this._busy = this._push(profile, opts).finally(() => {
      this._busy = null;
      const a = this._again; this._again = null;
      if (a) this.push(a.profile, a.opts);
    });
    return this._busy;
  }
  async _push(profile, opts) {
    const cs = profile.callsign;
    const m = this.meta(cs);
    const h = hashOf(profile);
    if (!opts.always && m && m.hash === h && !m.dirty) return { unchanged: true };
    const base = opts.base != null ? opts.base : (m ? m.version : 0);
    const pl = payloadOf(profile, base, this.client);
    if (!pl.ok) { this._setStatus('too-big', errorText({ code: 'too-big' })); this._emit('notice', { kind: 'warn', text: errorText({ code: 'too-big' }) }); return { tooBig: true, bytes: pl.bytes }; }
    this._setStatus('saving');
    let r;
    try { r = await this.api.save(pl.args); } catch (e) { return this._failed(cs, e); }
    if (!r.conflict) {
      this._setMeta(cs, { version: r.version, hash: h, at: this.now(), dirty: false });
      this._setStatus('ok', 'GESICHERT');
      return { ok: true, version: r.version };
    }
    // Konflikt: ein anderes Gerät hat inzwischen gesichert
    let remote;
    try { remote = await this.api.loadSave(this.pilot.id); } catch (e) { return this._failed(cs, e); }
    const decision = decideConflict(profile, remote && remote.data);
    if (decision === 'same') {
      this._setMeta(cs, { version: remote.version, hash: h, at: this.now(), dirty: false });
      this._setStatus('ok', 'GESICHERT');
      return { ok: true, version: remote.version };
    }
    if (decision === 'local' && !opts.retried) {
      // eigener Stand ist weiter: auf dem neuen Server-Stand aufbauen und überschreiben (Server-Stand als Sicherung)
      this.backup(cs, adoptRemote(remote.data, this.pilot), 'Älterer Stand eines anderen Geräts');
      const pr = progressOf(remote.data);
      const again = await this._push(profile, { ...opts, base: remote.version, always: true, retried: true });
      if (again.ok) this._emit('notice', { kind: 'info', text: `Ein anderes Gerät hatte inzwischen gesichert (Stufe ${pr.level}, ${pr.xp} EP). Dein Stand hat mehr Fortschritt und gilt.` });
      return again;
    }
    this.pending = { decision: decision === 'local' ? 'ask' : decision, remote };
    this._setStatus('conflict', 'ANDERES GERÄT NEUER');
    this._emit('conflict', { decision: this.pending.decision, remote, local: profile });
    return { conflict: true, decision: this.pending.decision, remote };
  }
  _failed(cs, e) {
    if (isOffline(e)) {
      this._setMeta(cs, { dirty: true });
      this._setStatus('offline', 'OFFLINE · WIRD NACHGESICHERT');
      return { offline: true };
    }
    console.warn('Sichern fehlgeschlagen', e);
    this._setMeta(cs, { dirty: true });
    this._setStatus('error', errorText(e));
    return { error: errorText(e) };
  }

  /** Beim Verlassen der Seite: best effort ohne Warten (fetch keepalive). */
  pushLeave(profile) {
    if (!profile || !this.linked(profile.callsign) || this.pending || !this.session) return false;
    const m = this.meta(profile.callsign);
    const h = hashOf(profile);
    if (m && m.hash === h && !m.dirty) return false;
    const pl = payloadOf(profile, m ? m.version : 0, this.client);
    if (!pl.ok || !this.api.saveKeepalive) return false;
    const p = this.api.saveKeepalive(pl.args, this.session.access_token);
    if (p && p.then) p.then((r) => { if (r && !r.conflict) this._setMeta(profile.callsign, { version: r.version, hash: h, at: this.now(), dirty: false }); });
    return true;
  }

  /** Offenen Konflikt auflösen. choice 'remote' | 'local'. Gibt den gültigen Stand zurück. */
  async resolve(choice) {
    const pend = this.pending;
    if (!pend) return this.local.get(this.callsign);
    if (choice === 'remote') return this.applyRemote(pend.remote, 'Stand eines anderen Geräts übernommen');
    this.pending = null;
    const p = this.local.get(this.callsign);
    this.backup(this.callsign, adoptRemote(pend.remote.data, this.pilot), 'Server-Stand ersetzt');
    await this.push(p, { base: pend.remote.version, always: true, retried: true });
    return p;
  }

  async hall(faction, order, limit = 100) { return this.api.hall(faction, order, limit); }
}
