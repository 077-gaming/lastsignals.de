// Ein gemeinsamer Supabase-Client für das ganze Spiel (Konto, Spielstand, Ruhmeshalle, Koop-Funk).
// Nur EIN Client, sonst warnt supabase-js vor mehreren Auth-Instanzen auf demselben Speicherschlüssel.
// Öffentlicher Schlüssel (publishable, wie auf der Website) – kein Geheimnis. Rechte regelt die Datenbank (RLS).
// Anmeldung: flowType 'implicit', damit Links aus Bestätigungs- und Passwort-Mails auch dann funktionieren, wenn
// sie in einem anderen Browser als dem Spiel geöffnet werden (Electron/Capacitor haben keinen gemeinsamen Speicher).
// Sitzung liegt in localStorage (sb-<projekt>-auth-token) – im Browser, in Electron und in Capacitor vorhanden.
import { createClient } from '@supabase/supabase-js';

export const SUPA_URL = 'https://ydvtdxvnkmjbdwxsriuv.supabase.co';
export const SUPA_KEY = 'sb_publishable_7bAvG-sHZiTgXmMI_-Oqgg_gMFC5Pnc';
export const SUPA_REF = 'ydvtdxvnkmjbdwxsriuv';
export const AUTH_KEY = `sb-${SUPA_REF}-auth-token`;

let client = null;
export function sb() {
  if (!client) {
    client = createClient(SUPA_URL, SUPA_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return client;
}

/** Gibt es eine gespeicherte Sitzung oder einen Anmelde-Link in der Adresse? Nur dann lohnt der Client beim Start. */
export function hasAuthHint() {
  try { if (localStorage.getItem(AUTH_KEY)) return true; } catch { /* privater Modus */ }
  try { return /access_token=|error_description=/.test(location.hash); } catch { return false; }
}
