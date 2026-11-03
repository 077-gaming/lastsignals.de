// Reine Regeln für Konto und Server-Spielstand (ohne Netz, ohne DOM) – im Selbsttest (Node) prüfbar.
// Abgleich-Regeln (Planung/KONTEN.md):
//   1. Nichts wird stillschweigend weggeworfen. Wer verliert, landet vorher als Sicherung im Browser.
//   2. Lokal unverändert seit dem letzten Abgleich + Server neuer  → Server-Stand gilt (ohne Rückfrage).
//      Lokal geändert + Server unverändert                         → lokaler Stand wird hochgeladen.
//   3. Beide geändert (Konflikt): mehr Fortschritt (Stufe, dann EP) gewinnt; bei Gleichstand fragen.
//   4. Erste Verknüpfung (noch nie abgeglichen) mit zwei verschiedenen Ständen: immer fragen.

export const MAX_BYTES = 400 * 1024; // Spielstand auf dem Server: Spielgrenze 400 kB (Datenbank erlaubt 512 kB)

export const killsOf = (p) => Object.values((p && p.stats && p.stats.kills) || {}).reduce((a, b) => a + (+b || 0), 0);

/** Kennzahlen eines Spielstands für Vergleich, Anzeige und Ruhmeshalle */
export function progressOf(p) {
  if (!p) return null;
  return {
    level: Math.max(1, Math.min(50, Math.floor(+p.level || 1))),
    xp: Math.max(0, Math.floor(+p.xp || 0)),
    honor: Math.max(0, Math.floor(+p.honor || 0)),
    kills: Math.max(0, Math.floor(killsOf(p))),
    play: Math.max(0, Math.floor(+(p.stats && p.stats.playSeconds) || 0)),
    at: p.savedAt || null,
  };
}

/** Fortschritt vergleichen: Stufe, dann Erfahrung. 1 = a weiter, -1 = b weiter, 0 = gleich */
export function cmpProgress(a, b) {
  const A = progressOf(a), B = progressOf(b);
  if (A.level !== B.level) return A.level > B.level ? 1 : -1;
  if (A.xp !== B.xp) return A.xp > B.xp ? 1 : -1;
  return 0;
}

// Stabile Prüfsumme (Schlüssel sortiert: jsonb liefert Schlüssel in anderer Reihenfolge zurück). savedAt zählt nicht.
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined && k !== 'savedAt').sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
export function hashOf(p) {
  const s = stable(p);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36) + ':' + s.length.toString(36);
}

const byteLen = (s) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length * 2);

/** Daten für save_pilot_state. { ok, args, bytes } oder { ok: false, reason: 'too-big', bytes } */
export function payloadOf(profile, version, client) {
  const json = JSON.stringify(profile);
  const bytes = byteLen(json);
  if (bytes >= MAX_BYTES) return { ok: false, reason: 'too-big', bytes };
  const pr = progressOf(profile);
  return {
    ok: true, bytes, json,
    args: { p_data: profile, p_version: Math.max(0, Math.floor(+version || 0)), p_level: pr.level, p_xp: pr.xp, p_honor: pr.honor, p_kills: pr.kills, p_client: String(client || 'web').slice(0, 40) },
  };
}

/**
 * Was gilt nach der Anmeldung? local = Stand im Browser (oder null), remote = { data, version, updated_at } (oder null),
 * meta = letzter Abgleich { version, hash } für diesen Rufnamen (oder null).
 * Ergebnis: 'none' | 'local' (hochladen) | 'remote' (übernehmen) | 'same' | 'ask' (Spieler wählt)
 */
export function decideLogin(local, remote, meta) {
  const r = remote && remote.data;
  if (!local && !r) return 'none';
  if (!r) return 'local';
  if (!local) return 'remote';
  const lh = hashOf(local);
  if (lh === hashOf(r)) return 'same';
  if (meta && meta.hash) {
    const localChanged = lh !== meta.hash;
    const remoteChanged = (remote.version || 0) !== (meta.version || 0);
    if (!localChanged && remoteChanged) return 'remote';
    if (localChanged && !remoteChanged) return 'local';
    if (!localChanged && !remoteChanged) return 'local'; // nur Reihenfolge der Schlüssel anders
    return decideConflict(local, r);
  }
  return 'ask';
}

/** Versionskonflikt beim Sichern (anderes Gerät hat inzwischen gesichert): mehr Fortschritt gewinnt, sonst fragen. */
export function decideConflict(local, remoteData) {
  if (!remoteData) return 'local';
  if (hashOf(local) === hashOf(remoteData)) return 'same';
  const c = cmpProgress(local, remoteData);
  return c > 0 ? 'local' : c < 0 ? 'remote' : 'ask';
}

/** Server-Stand für dieses Konto zurechtrücken: Rufname und Fraktion kommen immer aus dem Konto */
export function adoptRemote(data, pilot) {
  const p = data && typeof data === 'object' && !Array.isArray(data) ? JSON.parse(JSON.stringify(data)) : null;
  if (!p) return null;
  if (pilot) { p.callsign = pilot.callsign; p.faction = pilot.faction; }
  return p;
}

// Rufname nach den Regeln der Datenbank (3–16 Zeichen, Buchstaben, Ziffern, _ und -) plus gesperrte Namen der Website
const RESERVED = ['admin', 'administrator', 'mod', 'moderator', 'support', 'staff', 'team', 'system', 'server', 'gm',
  'gamemaster', 'lastsignals', 'lastsignal', 'official', 'offiziell', 'founder', 'swarm', 'schwarm', 'null', 'undefined', 'thefirstsignal'];
export function callsignProblem(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'RUFNAME EINGEBEN.';
  if (s.length < 3) return 'RUFNAME: MINDESTENS 3 ZEICHEN.';
  if (s.length > 16) return 'RUFNAME: HÖCHSTENS 16 ZEICHEN.';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return 'RUFNAME: NUR A-Z, 0-9, - UND _.';
  const low = s.toLowerCase().replace(/[_-]/g, '');
  if (['__proto__', 'constructor', 'prototype'].includes(s.toLowerCase()) || RESERVED.some((r) => low === r || low.startsWith(r + 'team'))) return 'RUFNAME NICHT ERLAUBT.';
  return '';
}
export const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
export const MIN_PASSWORD = 8;

/** Ist der Fehler „keine Verbindung“? (fetch-Fehler, Zeitüberschreitung, Status 0, Browser offline) */
export function isOffline(err) {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = `${err.name || ''} ${err.message || ''} ${err.code || ''}`;
  return err.status === 0 || /AuthRetryableFetchError|Failed to fetch|NetworkError|Load failed|fetch failed|network|timeout|ECONN|ENOTFOUND/i.test(m);
}

/** Klare deutsche Fehlermeldung für Anmeldung, Konto und Abgleich */
export function errorText(err) {
  if (!err) return '';
  if (isOffline(err)) return 'KEINE VERBINDUNG ZUM SERVER. Prüfe das Internet. Ohne Konto kannst du lokal weiterspielen.';
  const code = String(err.code || err.reason || '').toLowerCase();
  const msg = String(err.message || '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'E-MAIL ODER PASSWORT FALSCH.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'E-MAIL NOCH NICHT BESTÄTIGT. Öffne den Link in der Bestätigungsmail und melde dich dann hier an.';
  if (code === 'taken' || code === '23505' || /duplicate|unique|vergeben/i.test(msg)) return 'RUFNAME VERGEBEN. Bitte einen anderen wählen.';
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(msg)) return 'ZU DIESER E-MAIL GIBT ES SCHON EIN KONTO. Melde dich an oder nutze „Passwort vergessen“.';
  if (code === 'weak_password' || /password should be/i.test(msg)) return `PASSWORT ZU SCHWACH. Mindestens ${MIN_PASSWORD} Zeichen, besser mit Ziffern und Zeichen.`;
  if (code === 'same_password') return 'DAS NEUE PASSWORT MUSS SICH VOM ALTEN UNTERSCHEIDEN.';
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(msg)) return 'E-MAIL-ADRESSE UNGÜLTIG.';
  if (code === 'signup_disabled' || /signups not allowed/i.test(msg)) return 'NEUE KONTEN SIND GERADE GESCHLOSSEN.';
  if (/rate_limit|over_.*limit/.test(code) || err.status === 429 || /rate limit/i.test(msg)) return 'ZU VIELE VERSUCHE. Bitte einige Minuten warten.';
  if (code === 'session_missing' || code === 'not-signed-in' || /session missing|nicht angemeldet|jwt expired/i.test(msg)) return 'SITZUNG ABGELAUFEN. Bitte neu anmelden.';
  if (code === 'no-pilot' || /kein pilot/i.test(msg)) return 'ZU DIESEM KONTO GIBT ES NOCH KEINEN RUFNAMEN.';
  if (code === 'too-big') return 'SPIELSTAND ZU GROSS FÜR DEN SERVER (über 400 kB). Er bleibt lokal gespeichert.';
  return `SERVER MELDET EINEN FEHLER${code ? ` (${code.toUpperCase()})` : ''}. Bitte später erneut versuchen.`;
}

/** Spielumgebung für die Spalte client (höchstens 40 Zeichen) */
export function clientTag(version = '') {
  let kind = 'web';
  try {
    if (typeof window !== 'undefined' && window.Capacitor) kind = 'capacitor';
    else if (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)) kind = 'electron';
  } catch { /* egal */ }
  return `${kind} ${version}`.trim().slice(0, 40);
}
