// Neue Varianten für das Laden des Sprungs (alter Sound gefiel nicht).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const code = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const key = readFileSync(join(code, '.env.audio'), 'utf8').match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
const ziel = join(code, 'public', 'audio', 'sfx', 'varianten'); mkdirSync(ziel, { recursive: true });
const WELT = 'AAA sci-fi space game sound design, cinematic, powerful, clean, no music, no voice, ';
const V = [
  'starship jump drive spooling up: deep turbine whine rising in pitch, heavy reactor hum swelling, ends in a tense held charge right before the jump',
  'massive warp core charging for a hyperspace jump: low sub bass pulse speeding up like a heartbeat, metallic resonance building, energy crackles, powerful and confident',
  'space jump engine charge: smooth rising synth sweep layered with mechanical servo clunks locking into place and a growing plasma roar',
];
for (let i = 0; i < V.length; i++) {
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: WELT + V[i], duration_seconds: 3, prompt_influence: 0.7 }) });
  if (!r.ok) { console.error('Fehler', i + 1, r.status); continue; }
  writeFileSync(join(ziel, `jump_charge_${i + 1}.mp3`), Buffer.from(await r.arrayBuffer()));
  console.log('erstellt', i + 1);
}
