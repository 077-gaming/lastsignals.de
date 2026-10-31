// Erzeugt Soundeffekte und Musik für LAST SIGNALS über die ElevenLabs-API.
// Schlüssel steht in Code/.env.audio (ELEVENLABS_API_KEY=...), die Datei gehört nicht ins Repository.
// Start: node tools/audio/erzeugen.mjs [sfx|music] (vorhandene Dateien werden übersprungen)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const code = join(here, '..', '..');
const envFile = join(code, '.env.audio');
const key = (existsSync(envFile) ? readFileSync(envFile, 'utf8') : '').match(/ELEVENLABS_API_KEY=(\S+)/)?.[1] || process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Kein Schlüssel: ELEVENLABS_API_KEY in Code/.env.audio eintragen.'); process.exit(1); }

const liste = JSON.parse(readFileSync(join(here, 'liste.json'), 'utf8'));
const nur = process.argv[2];

async function holen(url, body, ziel) {
  if (existsSync(ziel)) { console.log('vorhanden', ziel); return; }
  const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) { console.error('Fehler', r.status, (await r.text()).slice(0, 300), ziel); return; }
  writeFileSync(ziel, Buffer.from(await r.arrayBuffer()));
  console.log('erstellt', ziel);
}

if (!nur || nur === 'sfx') {
  for (const s of liste.sfx) {
    await holen('https://api.elevenlabs.io/v1/sound-generation',
      { text: s.text, duration_seconds: s.dur, prompt_influence: 0.6 },
      join(code, 'public', 'audio', 'sfx', `${s.id}.mp3`));
  }
}
if (!nur || nur === 'music') {
  for (const m of liste.music) {
    await holen('https://api.elevenlabs.io/v1/music',
      { prompt: m.text, music_length_ms: m.ms },
      join(code, 'public', 'audio', 'music', `${m.id}.mp3`));
  }
}
