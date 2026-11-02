// Ablauf Konto ↔ Spiel (Planung/KONTEN.md): Konto anlegen und starten, Pilot nach der Anmeldung verknüpfen
// (Standwahl), vor dem Hub abgleichen, offene Konflikte auflösen. Verbindet net/account.js mit den Dialogen.
import { Account } from '../net/account.js';
import { progressOf, clientTag } from '../net/cloud-logic.js';
import { newProfile } from '../core/data.js';
import { VERSION } from './screens-kit.js';
import { chooseSave, toast, accountDialog } from './account-ui.js';

let instance = null;
let initP = null;

/** Konto-Instanz. Entwicklung: ?konto=attrappe nutzt die Attrappe statt Supabase (kein Netz, keine Mails). */
export async function getAccount(store) {
  if (instance) return instance;
  const params = new URLSearchParams(location.search);
  let api;
  if (import.meta.env.DEV && params.get('konto') === 'attrappe') {
    const { mockApi } = await import('../net/account-mock.js');
    const persist = { get: () => { try { return localStorage.getItem('ls.mock.server'); } catch { return null; } }, set: (v) => { try { localStorage.setItem('ls.mock.server', v); } catch { /* voll */ } } };
    api = mockApi({ persist, latency: 250 });
    window.__lsMock = api.mock;
  } else {
    const { supabaseApi } = await import('../net/account-api.js');
    api = supabaseApi();
  }
  instance = new Account({ api, local: store, client: clientTag(VERSION.replace('BUILD ', '')) });
  instance.on((type, d) => { if (type === 'notice') toast(d.text, d.kind); });
  if (import.meta.env.DEV) window.__lsAccount = instance;
  // Wieder online: ausstehenden Stand nachsichern
  window.addEventListener('online', () => { if (instance.signedIn && instance.pilot) instance.push(store.get(instance.pilot.callsign)); });
  return instance;
}

/** Sitzung prüfen. Ohne gespeicherte Sitzung (und ohne Link in der Adresse) bleibt das Netz unberührt. */
export async function initAccount(store) {
  if (initP) return initP;
  initP = (async () => {
    const a = await getAccount(store);
    const recoveryLink = /type=recovery/.test(location.hash);
    let hint = true;
    if (a.api.kind === 'supabase') { const { hasAuthHint } = await import('../net/supa.js'); hint = hasAuthHint(); }
    if (hint) await a.init(); else { a.ready = true; }
    if (recoveryLink && a.signedIn) a.recovery = true;
    return a;
  })();
  return initP;
}
/** Vor dem ersten Dialog: Client wirklich starten (falls initAccount ihn ausgelassen hat) */
export async function wakeAccount(store) {
  const a = await initAccount(store);
  if (!a._initDone) await a.init();
  return a;
}

/** Konto-Dialog mit Startvorbereitung */
export async function openAccount(store, mode = 'login', prefill = {}) {
  const a = await wakeAccount(store);
  return accountDialog(a, { mode, prefill });
}

/**
 * Nach der Anmeldung: lokalen und Server-Stand abgleichen, bei Bedarf fragen. Danach liegt der gültige Stand
 * lokal unter dem Rufnamen des Kontos. Ergebnis: Spielstand (oder null, wenn kein Pilot).
 */
export async function linkPilot(account, store) {
  if (!account.pilot) return null;
  const cs = account.pilot.callsign;
  let plan;
  try { plan = await account.loginPlan(); } catch (e) {
    // Server nicht erreichbar: lokal weiter; der nächste Abgleich klärt den Stand (Versionsprüfung)
    let p = store.get(cs);
    if (!p) { p = newProfile(cs, account.pilot.faction); store.save(p); }
    toast('Server gerade nicht erreichbar. Du spielst mit dem Stand in diesem Browser, er wird später abgeglichen.', 'warn');
    return p;
  }
  const { decision } = plan;
  if (decision === 'same' && plan.remote) return account.applyRemote(plan.remote, 'Abgleich');
  if (decision === 'remote') {
    const p = account.applyRemote(plan.remote, 'Server-Stand übernommen');
    const pr = progressOf(p);
    toast(`Server-Stand geladen: Stufe ${pr.level}, ${pr.xp.toLocaleString('de-DE')} EP.`);
    return p;
  }
  if (decision === 'local') { const p = await account.applyPlan(plan, 'local'); toast('Spielstand dieses Browsers ist jetzt mit deinem Konto verknüpft und gesichert.'); return p; }
  if (decision === 'none') return account.applyPlan(plan, 'none');
  const choice = await chooseSave({ local: plan.local, remote: plan.remote, pilot: account.pilot, fresh: plan.remote ? null : newProfile(cs, account.pilot.faction) });
  const p = await account.applyPlan(plan, plan.remote ? choice : (choice === 'remote' ? 'none' : 'local'));
  toast(choice === 'local' ? 'Lokaler Stand gilt und ist gesichert. Der Server-Stand liegt als Sicherung im Browser.' : 'Stand übernommen. Der bisherige lokale Stand liegt als Sicherung im Browser.');
  return p;
}

/** Offenen Konflikt auflösen (mehr Fortschritt gewinnt automatisch, sonst fragen) */
export async function resolvePending(account, store) {
  const pend = account.pending;
  if (!pend) return;
  if (pend.decision === 'remote') {
    const p = account.applyRemote(pend.remote, 'Stand eines anderen Geräts übernommen');
    const pr = progressOf(p);
    toast(`Ein anderes Gerät war neuer (Stufe ${pr.level}, ${pr.xp.toLocaleString('de-DE')} EP). Sein Stand gilt jetzt, dein bisheriger liegt als Sicherung im Browser.`, 'warn', 9000);
    return;
  }
  const local = store.get(account.pilot.callsign);
  const choice = await chooseSave({ local, remote: pend.remote, pilot: account.pilot, reason: 'conflict' });
  await account.resolve(choice);
  toast(choice === 'local' ? 'Dein Stand gilt und ist gesichert.' : 'Stand des anderen Geräts übernommen. Dein bisheriger liegt als Sicherung im Browser.');
}

/** Vor dem Hub: sichern und Konflikte klären */
export async function settle(account, store, callsign) {
  if (!account || !account.linked(callsign)) return;
  if (!account.pending) {
    const p = store.get(callsign);
    if (p) await account.push(p);
  }
  if (account.pending) await resolvePending(account, store);
}
