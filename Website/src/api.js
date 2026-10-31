// Schnittstelle zum Konten- und Reservierungsserver von LAST SIGNALS (Supabase, Region EU Frankfurt).
// Ein Konto für Website, Wiki, Profil und Spiel. Anmeldung mit E-Mail (Bestätigungsmail, Double-Opt-in), Google oder Discord.
//
// Zugang kommt aus den Umgebungsvariablen (Datei .env.local, nie ins Repo):
//   VITE_SUPABASE_URL=https://<projekt>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<öffentlicher anon-Schlüssel>
// Fehlen die Werte, gibt es keinen Server: Die Formulare sind fertig, sagen aber ehrlich
// „Reservierung öffnet in Kürze“, speichern nichts und täuschen keine Bestätigung vor.
//
// Ablauf E-Mail: signInWithOtp schickt die Bestätigungsmail (Rufname und Fraktion stehen in den Metadaten
// und lokal als „ausstehend“). Nach dem Klick kommt der Pilot mit Sitzung zurück, dann wird der Rufname gesichert.
// Datenbank (Stand 30.10.2026): Funktionen callsign_available(p_callsign) und claim_callsign(p_callsign, p_faction),
// Tabelle pilots (id, user_id, callsign, faction, title, founder). Fällt claim_callsign weg, wird ersatzweise
// in die Tabelle reservations (callsign, faction, email) geschrieben.

const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const FACTIONS = ['europa', 'saturn', 'eris'];
export const isOnline = () => /^https:\/\/[\w.-]+$/.test(URL_) && KEY.length > 20;
// Reservierung per E-Mail offen? Nur mit Server UND VITE_RESERVATION_OPEN=true. Ohne eigenen Mailserver kommt die
// Bestätigungsmail von Supabase nicht zuverlässig bei fremden Adressen an, daher bleibt sie bis dahin ehrlich zu.
export const signupOpen = () => isOnline() && String(import.meta.env.VITE_RESERVATION_OPEN || '').trim() === 'true';

// Anbieter, die beim Bauen aktiv waren (vite.config.js fragt Supabase). Nur diese stehen in der Datenschutzerklärung.
// eslint-disable-next-line no-undef
const BUILT_OAUTH = typeof __LS_OAUTH__ !== 'undefined' ? __LS_OAUTH__ : [];

// Welche Anmeldewege der Server wirklich anbietet (GET {VITE_SUPABASE_URL}/auth/v1/settings, Header apikey → external.*).
// Google/Discord zählen nur, wenn Supabase sie jetzt meldet UND sie beim Bauen aktiv waren (sonst fehlt der Abschnitt
// in der Datenschutzerklärung). Abgeschaltete Anbieter bleiben als „bald“ ohne Klick-Aktion stehen.
let provP = null;
export function getProviders() {
  if (!isOnline()) return Promise.resolve({ email: false, google: false, discord: false });
  if (!provP) {
    provP = timeout(fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } }).then((r) => (r.ok ? r.json() : null)), 6000)
      .then((j) => {
        const ext = (j && j.external) || {};
        const allowed = (k) => ext[k] === true && BUILT_OAUTH.includes(k);
        return { email: ext.email === true, google: allowed('google'), discord: allowed('discord') };
      })
      .catch(() => ({ email: false, google: false, discord: false }));
  }
  return provP;
}

const PENDING = 'ls-pending'; // { callsign, faction, at }

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* privat */ } },
};

let clientP = null;
function client() {
  if (!isOnline()) return Promise.resolve(null);
  if (!clientP) {
    clientP = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } }))
      .catch(() => null);
  }
  return clientP;
}

// Gesperrte Rufnamen (Teamrollen, Marke). Der Server prüft zusätzlich.
const RESERVED = ['admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'team', 'system', 'server', 'gm',
  'gamemaster', 'lastsignals', 'lastsignal', 'official', 'offiziell', 'founder', 'swarm', 'schwarm', 'null', 'undefined', 'thefirstsignal'];

// Format sofort im Browser prüfen (gleiche Regel wie die Datenbank: 3–16 Zeichen, Buchstaben, Ziffern, _ und -)
// code: 'empty' | 'short' | 'long' | 'chars' | 'start' | 'double' | 'reserved' | 'ok'
export function callsignFormat(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, code: 'empty' };
  if (s.length < 3) return { ok: false, code: 'short' };
  if (s.length > 16) return { ok: false, code: 'long' };
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return { ok: false, code: 'chars' };
  if (!/^[A-Za-z]/.test(s)) return { ok: false, code: 'start' };
  if (/[_-]{2}/.test(s) || /[_-]$/.test(s)) return { ok: false, code: 'double' };
  const low = s.toLowerCase().replace(/[_-]/g, '');
  if (RESERVED.some((r) => low === r || low.startsWith(r + 'team'))) return { ok: false, code: 'reserved' };
  return { ok: true, code: 'ok' };
}
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

const timeout = (p, ms = 8000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Verfügbarkeit beim Server. Ohne Server oder bei Fehler: { known: false }
export async function callsignAvailable(name) {
  const sb = await client();
  if (!sb) return { known: false };
  try {
    const { data, error } = await timeout(sb.rpc('callsign_available', { p_callsign: name.trim() }));
    if (error) return { known: false, error: true };
    return { known: true, available: !!data };
  } catch (e) { return { known: false, error: true }; }
}

// Live-Status für die Kopfleiste. Einen Spielserver gibt es noch nicht: null = ehrlicher Status „Testphase“.
export async function getStatus() { return null; }

// Rufname für den angemeldeten Piloten sichern
async function claim(sb, user, callsign, faction) {
  const r = await sb.rpc('claim_callsign', { p_callsign: callsign, p_faction: faction });
  if (!r.error) return { ok: true, pilot: Array.isArray(r.data) ? r.data[0] : r.data };
  const msg = `${r.error.code || ''} ${r.error.message || ''}`;
  if (/23505|taken|vergeben|duplicate|unique/i.test(msg)) return { ok: false, reason: 'taken' };
  if (/PGRST202|42883|not find the function/i.test(msg)) {
    const ins = await sb.from('reservations').insert({ callsign, faction, email: user.email });
    if (!ins.error) return { ok: true, pilot: { callsign, faction, founder: true } };
    if (/23505|duplicate|unique/i.test(`${ins.error.code} ${ins.error.message}`)) return { ok: false, reason: 'taken' };
  }
  return { ok: false, reason: 'error' };
}

// Angemeldeter Pilot oder null: { callsign, faction, rank, avatar, founder, id }
// Liegt eine ausstehende Reservierung vor (nach Bestätigungsmail oder Google/Discord), wird sie hier abgeschlossen.
export async function getSession() {
  const sb = await client();
  if (!sb) return null;
  try {
    const { data } = await timeout(sb.auth.getSession());
    const user = data && data.session && data.session.user;
    if (!user) return null;
    let pilot = null;
    const q = await sb.from('pilots').select('id, callsign, faction, title, founder').eq('user_id', user.id).maybeSingle();
    if (!q.error) pilot = q.data;
    let justClaimed = false, claimError = null;
    const pend = store.get(PENDING) || (user.user_metadata && user.user_metadata.callsign ? { callsign: user.user_metadata.callsign, faction: user.user_metadata.faction } : null);
    if (!pilot && pend && callsignFormat(pend.callsign).ok && FACTIONS.includes(pend.faction)) {
      const c = await claim(sb, user, pend.callsign.trim(), pend.faction);
      if (c.ok) { pilot = c.pilot; justClaimed = true; store.set(PENDING, null); } else claimError = c.reason;
    }
    const meta = user.user_metadata || {};
    return {
      email: user.email,
      callsign: (pilot && pilot.callsign) || null,
      faction: (pilot && pilot.faction) || null,
      founder: !!(pilot && pilot.founder !== false),
      rank: (pilot && pilot.title) || null,
      avatar: meta.avatar_url || meta.picture || null,
      id: pilot && pilot.id != null ? pilot.id : null,
      justClaimed, claimError,
    };
  } catch (e) { return null; }
}

// Reservierung mit E-Mail (Double-Opt-in). Ergebnis:
// { ok: true, pending: 'confirm-email' } | { ok: false, reason: 'closed' | 'taken' | 'invalid' | 'error' }
export async function reserve({ callsign, faction, email, lang, returnTo }) {
  if (!signupOpen()) return { ok: false, reason: 'closed' };
  if (!(await getProviders()).email) return { ok: false, reason: 'closed' };
  if (!callsignFormat(callsign).ok || !FACTIONS.includes(faction) || !emailOk(email)) return { ok: false, reason: 'invalid' };
  const sb = await client();
  if (!sb) return { ok: false, reason: 'error' };
  const av = await callsignAvailable(callsign);
  if (av.known && !av.available) return { ok: false, reason: 'taken' };
  try {
    store.set(PENDING, { callsign: callsign.trim(), faction, at: Date.now() });
    const { error } = await timeout(sb.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: returnTo || location.href.split('#')[0], shouldCreateUser: true, data: { callsign: callsign.trim(), faction, lang } },
    }));
    if (error) { store.set(PENDING, null); return { ok: false, reason: 'error' }; }
    return { ok: true, pending: 'confirm-email' };
  } catch (e) { return { ok: false, reason: 'error' }; }
}

// Anmeldung bzw. Reservierung über Google oder Discord. Ohne Server: { ok: false, reason: 'closed' }
export async function startOAuth(provider, { callsign = '', faction = '', returnTo } = {}) {
  if (!isOnline() || !['google', 'discord'].includes(provider)) return { ok: false, reason: 'closed' };
  if (!(await getProviders())[provider]) return { ok: false, reason: 'closed' };
  const sb = await client();
  if (!sb) return { ok: false, reason: 'error' };
  if (callsignFormat(callsign).ok && FACTIONS.includes(faction)) store.set(PENDING, { callsign: callsign.trim(), faction, at: Date.now() });
  const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: returnTo || location.href.split('#')[0] } });
  return error ? { ok: false, reason: 'error' } : { ok: true };
}

export async function signOut() {
  const sb = await client();
  if (!sb) return;
  try { await sb.auth.signOut(); } catch (e) { /* egal */ }
}
