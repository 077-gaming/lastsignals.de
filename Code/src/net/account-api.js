// Netz-Schicht für Konto, Spielstand und Ruhmeshalle über Supabase. Austauschbar: Der Selbsttest und der
// Browser-Test (?konto=attrappe, nur Entwicklung) nutzen stattdessen account-mock.js mit derselben Schnittstelle.
// Alle Fehler kommen einheitlich als { code, message, status } (Texte: cloud-logic.js errorText).
import { sb, SUPA_URL, SUPA_KEY } from './supa.js';

const TIMEOUT = 12000;
const timed = (p, ms = TIMEOUT) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout', message: 'timeout', status: 0 }), ms))]);
const norm = (e) => (e ? { code: e.code || e.error_code || '', message: e.message || String(e), status: e.status ?? (e.name === 'AuthRetryableFetchError' ? 0 : undefined), name: e.name } : e);
async function run(p) {
  let r;
  try { r = await timed(p); } catch (e) { throw norm(e); }
  if (r && r.error) throw norm(r.error);
  return r ? r.data : null;
}

export function supabaseApi() {
  const c = () => sb();
  return {
    kind: 'supabase',
    async getSession() { const d = await run(c().auth.getSession()); return d && d.session ? d.session : null; },
    onAuth(cb) { const { data } = c().auth.onAuthStateChange((ev, session) => cb(ev, session)); return () => data.subscription.unsubscribe(); },
    async signIn(email, password) { const d = await run(c().auth.signInWithPassword({ email, password })); return d.session; },
    async signUp(email, password, meta, redirect) {
      const d = await run(c().auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: meta } }));
      // Supabase verrät aus Datenschutzgründen nicht, ob es die Adresse schon gibt: leere identities = schon vorhanden
      const existing = !!(d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0);
      return { user: d.user, session: d.session, existing };
    },
    async resetPassword(email, redirect) { await run(c().auth.resetPasswordForEmail(email, { redirectTo: redirect })); },
    async updatePassword(password) { await run(c().auth.updateUser({ password })); },
    async signOut() { try { await timed(c().auth.signOut({ scope: 'local' }), 5000); } catch { /* lokal trotzdem weg */ } },
    async getPilot(userId) {
      const d = await run(c().from('pilots').select('id, callsign, faction, title').eq('user_id', userId).maybeSingle());
      return d ? { ...d, callsign: String(d.callsign) } : null;
    },
    async claim(callsign, faction) {
      const d = await run(c().rpc('claim_callsign', { p_callsign: callsign, p_faction: faction }));
      const p = Array.isArray(d) ? d[0] : d;
      return p ? { id: p.id, callsign: String(p.callsign), faction: p.faction, title: p.title } : null;
    },
    async available(callsign) { return !!(await run(c().rpc('callsign_available', { p_callsign: callsign }))); },
    async loadSave(pilotId) {
      const d = await run(c().from('pilot_saves').select('data, version, level, xp, updated_at').eq('pilot_id', pilotId).maybeSingle());
      return d || null;
    },
    async save(args) {
      const d = await run(c().rpc('save_pilot_state', args));
      const row = Array.isArray(d) ? d[0] : d;
      return { version: row ? row.version : 0, conflict: !!(row && row.conflict) };
    },
    // Beim Verlassen der Seite: fetch mit keepalive (sendBeacon kann keinen Anmelde-Kopf senden). Grenze 64 kB.
    saveKeepalive(args, token) {
      if (!token) return null;
      const body = JSON.stringify(args);
      try {
        return fetch(`${SUPA_URL}/rest/v1/rpc/save_pilot_state`, {
          method: 'POST', keepalive: body.length < 60000,
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
        }).then((r) => (r.ok ? r.json() : null)).then((d) => { const row = Array.isArray(d) ? d[0] : d; return row ? { version: row.version, conflict: !!row.conflict } : null; }).catch(() => null);
      } catch { return null; }
    },
    async hall(faction, order, limit) {
      const d = await run(c().rpc('hall_of_fame', { p_faction: faction || null, p_order: order, p_limit: limit }));
      return Array.isArray(d) ? d : [];
    },
  };
}
