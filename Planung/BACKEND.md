# Backend: Supabase (Projekt „LAST SIGNALS“, eu-central-1 Frankfurt)

- URL: https://ydvtdxvnkmjbdwxsriuv.supabase.co · öffentlicher Schlüssel in `Website/.env.local` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- Organisation: 077-gaming's Org · Tarif: kostenlos

## Tabellen

- `pilots`: id (fortlaufend ab 2; **0 = Toni/Gründer**, **1 = Verlosung**, beide von Hand), user_id (Auth-Konto), callsign (3–16 Zeichen, eindeutig, Groß/Klein egal), faction (europa|saturn|eris), title, founder, created_at. Öffentlich lesbar.
- `pilot_profiles`: pilot_id, bio (max 500), avatar_url, banner_url, theme (jsonb), updated_at. Öffentlich lesbar, ändern nur der eigene Pilot.
- Speicher `profiles` (öffentlich lesbar): Hochladen nur in den eigenen Ordner `<user_id>/…`.

## Funktionen

- `callsign_available(p_callsign)` → boolean, für alle (Live-Prüfung beim Reservieren).
- `claim_callsign(p_callsign, p_faction)` → Pilot, nur angemeldet, einmal pro Konto (legt auch das Profil an).

## Ablauf Gründungspilot (Website)

1. Rufname live prüfen (`rpc('callsign_available')`).
2. Anmelden: E-Mail per Bestätigungslink (`auth.signInWithOtp`, das ist das Double-Opt-in) oder Google bzw. Discord (`auth.signInWithOAuth`).
3. Nach Rückkehr: `rpc('claim_callsign', { p_callsign, p_faction })`.

## Noch einzurichten

- Google- und Discord-Anmeldung: App-Zugänge bei Google Cloud und im Discord Developer Portal anlegen, Client-ID/Secret im Supabase-Dashboard (Authentication → Providers) eintragen.
- E-Mail-Versand: eigener Absender (z. B. Resend, wie beim Shop) statt Supabase-Standard, Absender noreply@lastsignals.de.
- Weiterleitungsadressen in Supabase (Authentication → URL Configuration): https://lastsignals.de, https://lastsignals.online, http://localhost:5180.
- Toni nach seiner ersten Anmeldung auf ID 0 setzen.
