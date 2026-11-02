// Attrappe der Netz-Schicht (gleiche Schnittstelle wie account-api.js) für Selbsttest und Browser-Test.
// Bildet die Server-Regeln nach: Bestätigung per Mail nötig, claim_callsign (Rufname eindeutig, ohne Groß/Klein),
// save_pilot_state mit Versionsprüfung (wie die SQL-Funktion), hall_of_fame sortiert.
// Browser: ?konto=attrappe (nur Entwicklungsserver). Server-Zustand liegt dann in localStorage 'ls.mock.server',
// Hilfen unter window.__lsMock (confirm(email), bump(callsign, xp), offline(true|false), state()).
// Vorbelegt: test@attrappe.local / geheim123 (bestätigt, Rufname noch frei).

const fail = (code, message, status = 400) => { const e = { code, message, status }; throw e; };

export function mockApi({ persist = null, latency = 0 } = {}) {
  let S = null;
  const load = () => {
    if (S) return S;
    try { S = persist ? JSON.parse(persist.get() || 'null') : null; } catch { S = null; }
    if (!S) S = { users: [{ id: 'u1', email: 'test@attrappe.local', password: 'geheim123', confirmed: true, meta: {} }], pilots: [], saves: {}, seq: 1, session: null, offline: false, mails: [] };
    return S;
  };
  const save = () => { if (persist) persist.set(JSON.stringify(S)); };
  const listeners = new Set();
  const emit = (ev) => { for (const fn of listeners) { try { fn(ev, S.session); } catch { /* egal */ } } };
  const net = async () => {
    load();
    if (latency) await new Promise((r) => setTimeout(r, latency));
    if (S.offline) fail('', 'Failed to fetch', 0);
  };
  const me = () => { load(); const s = S.session; return s ? S.users.find((u) => u.id === s.user.id) : null; };
  const pilotOf = (uid) => S.pilots.find((p) => p.user_id === uid) || null;
  const sess = (u) => ({ access_token: 'mock-' + u.id, user: { id: u.id, email: u.email, user_metadata: u.meta } });

  const api = {
    kind: 'mock',
    async getSession() { load(); return S.session; },
    onAuth(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn(email, password) {
      await net();
      const u = S.users.find((x) => x.email === String(email).trim().toLowerCase());
      if (!u || u.password !== password) fail('invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) fail('email_not_confirmed', 'Email not confirmed');
      S.session = sess(u); save(); emit('SIGNED_IN');
      return S.session;
    },
    async signUp(email, password, meta, redirect) {
      await net();
      email = String(email).trim().toLowerCase();
      if (String(password).length < 6) fail('weak_password', 'Password should be at least 6 characters');
      const old = S.users.find((x) => x.email === email);
      if (old) return { user: { id: old.id, identities: [] }, session: null, existing: true };
      const u = { id: 'u' + (++S.seq), email, password, confirmed: false, meta: meta || {} };
      S.users.push(u); S.mails.push({ to: email, kind: 'confirm', redirect }); save();
      return { user: { id: u.id, identities: [{}] }, session: null, existing: false };
    },
    async resetPassword(email, redirect) { await net(); S.mails.push({ to: String(email).trim().toLowerCase(), kind: 'recovery', redirect }); save(); },
    async updatePassword(password) { await net(); const u = me(); if (!u) fail('session_missing', 'Auth session missing!'); if (u.password === password) fail('same_password', 'same'); u.password = password; save(); },
    async signOut() { load(); S.session = null; save(); emit('SIGNED_OUT'); },
    async getPilot(userId) { await net(); const p = pilotOf(userId); return p ? { id: p.id, callsign: p.callsign, faction: p.faction, title: null } : null; },
    async claim(callsign, faction) {
      await net();
      const u = me();
      if (!u) fail('P0001', 'nicht angemeldet');
      if (pilotOf(u.id)) fail('P0001', 'rufname bereits gesichert');
      if (!/^[A-Za-z0-9_-]{3,16}$/.test(callsign)) fail('23514', 'check constraint');
      if (S.pilots.some((p) => p.callsign.toLowerCase() === callsign.toLowerCase())) fail('23505', 'duplicate key value violates unique constraint "pilots_callsign_key"');
      const p = { id: ++S.seq, user_id: u.id, callsign, faction };
      S.pilots.push(p); save();
      return { id: p.id, callsign, faction, title: null };
    },
    async available(callsign) { await net(); return /^[A-Za-z0-9_-]{3,16}$/.test(callsign) && !S.pilots.some((p) => p.callsign.toLowerCase() === callsign.toLowerCase()); },
    async loadSave(pilotId) {
      await net();
      const u = me(), p = u && pilotOf(u.id);
      if (!p || p.id !== pilotId) return null; // RLS: nur eigener Pilot
      const r = S.saves[pilotId];
      return r ? JSON.parse(JSON.stringify({ data: r.data, version: r.version, level: r.level, xp: r.xp, updated_at: r.updated_at })) : null;
    },
    // wie public.save_pilot_state: kein Eintrag → anlegen (Version 1); Version passt nicht → conflict; sonst +1
    async save(a) {
      await net();
      const u = me(), p = u && pilotOf(u.id);
      if (!p) fail('P0001', 'kein Pilot für dieses Konto');
      if (JSON.stringify(a.p_data).length > 524288) fail('23514', 'pilot_saves_size');
      const cur = S.saves[p.id];
      const row = { data: JSON.parse(JSON.stringify(a.p_data)), level: Math.max(1, Math.min(50, a.p_level)), xp: Math.max(0, a.p_xp), honor: Math.max(0, a.p_honor), kills: Math.max(0, a.p_kills), client: a.p_client, updated_at: new Date().toISOString() };
      if (!cur) { S.saves[p.id] = { ...row, version: 1 }; save(); return { version: 1, conflict: false }; }
      if (a.p_version != null && a.p_version !== cur.version) return { version: cur.version, conflict: true };
      S.saves[p.id] = { ...row, version: cur.version + 1 }; save();
      return { version: cur.version + 1, conflict: false };
    },
    saveKeepalive(a) { return api.save(a).catch(() => null); },
    async hall(faction, order, limit) {
      await net();
      const key = ['xp', 'kills', 'level'].includes(order) ? order : 'honor';
      return S.pilots.filter((p) => S.saves[p.id] && (!faction || p.faction === faction))
        .map((p) => ({ callsign: p.callsign, faction: p.faction, title: null, ...S.saves[p.id], data: undefined }))
        .sort((x, y) => y[key] - x[key] || String(x.updated_at).localeCompare(String(y.updated_at)))
        .slice(0, Math.min(100, Math.max(1, limit || 50)))
        .map(({ callsign, faction: f, title, level, xp, honor, kills, updated_at }) => ({ callsign, faction: f, title, level, xp, honor, kills, updated_at }));
    },
    // ── Hilfen für Tests ──
    mock: {
      state: () => load(),
      confirm(email) { load(); const u = S.users.find((x) => x.email === String(email).trim().toLowerCase()); if (u) { u.confirmed = true; save(); } return !!u; },
      offline(v) { load(); S.offline = !!v; save(); },
      // anderes Gerät simulieren: Server-Stand mit mehr Erfahrung (oder weniger) und neuer Version
      bump(callsign, dxp = 5000, dlevel = 0) {
        load();
        const p = S.pilots.find((x) => x.callsign.toLowerCase() === String(callsign).toLowerCase());
        const r = p && S.saves[p.id];
        if (!r) return false;
        r.data.xp = Math.max(0, (r.data.xp || 0) + dxp); r.data.level = Math.max(1, (r.data.level || 1) + dlevel);
        r.xp = r.data.xp; r.level = r.data.level; r.version += 1; r.updated_at = new Date().toISOString(); save();
        return true;
      },
      reset() { S = null; if (persist) persist.set(''); load(); save(); },
    },
  };
  return api;
}
