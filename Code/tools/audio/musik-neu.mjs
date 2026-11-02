// Neue Musikstücke über ElevenLabs /v1/music (Schlüssel aus Code/.env.audio, nie ausgeben).
// Aufruf: node tools/audio/musik-neu.mjs <id> [<id> …]   (überspringt vorhandene Dateien)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '../../public/audio/music');
// Gemeinsame Klangidentität: tiefe analoge Synth-Flächen, entferntes Klavier, Funkrauschen und ein wiederkehrendes
// Vier-Ton-Signalmotiv. Keine Künstler- oder Werknamen.
const ID = 'recurring four-note radio signal motif on a soft analog synth, deep analog synth pads, distant felt piano, faint radio static texture, instrumental, no vocals';
export const STUECKE = {
  title: { ms: 90000, text: `slow cinematic title theme for a space game, lonely and grand, ${ID}, gentle swell, ends softly` },
  explore_2: { ms: 90000, text: `calm space exploration music, gentle arpeggios drifting, sense of distance and curiosity, ${ID}, loopable, no drums` },
  europa: { ms: 90000, text: `serene icy space ambience, crystalline bell tones, cool and hopeful, ${ID}, loopable, no drums` },
  saturn: { ms: 90000, text: `warm industrial space ambience, slow mechanical pulses and low brass, busy harbor feeling, ${ID}, loopable` },
  eris: { ms: 90000, text: `cold dark space ambience, distant metallic resonance, tense and lonely, minor key, ${ID}, loopable` },
  boss: { ms: 90000, text: `intense heavy space battle music for a huge enemy, pounding low percussion, dark synth bass, urgent strings, ${ID}, loopable` },
};

const env = await fs.readFile(path.join(HERE, '../../.env.audio'), 'utf8');
const KEY = (env.match(/ELEVENLABS_API_KEY=(.*)/) || [])[1]?.trim().replace(/^"|"$/g, '');
if (!KEY) { console.error('Kein Schlüssel in .env.audio'); process.exit(1); }
for (const id of process.argv.slice(2)) {
  const s = STUECKE[id];
  if (!s) { console.error('unbekannt:', id); continue; }
  const file = path.join(OUT, id + '.mp3');
  try { await fs.access(file); console.log('vorhanden, übersprungen:', id); continue; } catch { /* neu */ }
  const r = await fetch('https://api.elevenlabs.io/v1/music', {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ prompt: s.text, music_length_ms: s.ms }),
  });
  if (!r.ok) { console.error(id, 'Fehler', r.status, (await r.text()).slice(0, 200)); continue; }
  await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
  console.log('erzeugt:', id);
}
