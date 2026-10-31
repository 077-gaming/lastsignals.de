// Drei Varianten je Laser, alle aus derselben Klangwelt, aber klar unterscheidbar.
// Ergebnis: public/audio/sfx/varianten/<laser>_<n>.mp3 · Auswahl danach im Soundboard (tools/audio/soundboard.html).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const code = join(here, '..', '..');
const key = readFileSync(join(code, '.env.audio'), 'utf8').match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
const ziel = join(code, 'public', 'audio', 'sfx', 'varianten');
mkdirSync(ziel, { recursive: true });

// Gemeinsame Klangwelt: hochwertiges Sci-Fi-Sounddesign, gleicher trockener Raum, gleiche Lautheit.
const WELT = 'AAA sci-fi space shooter sound design, one weapon from a cohesive futuristic weapon family, clean punchy transient, dry close-mic, no music, no voice, ';
const LASER = {
  laser_pulse: { dur: 0.5, text: 'PULSE LASER: tiny fast high-pitched energy blip, light and snappy, bright chirp with quick pitch drop, entry-level weapon' },
  laser_ion: { dur: 0.6, text: 'ION LASER: mid-pitched electric zap with crackling ionized arc, buzzing static edge, more body than a pulse laser' },
  laser_plasma: { dur: 0.75, text: 'PLASMA LASER: thick heavy low-mid plasma bolt, hot sizzling hiss over a deep punchy thump, feels dangerous and powerful' },
  laser_gamma: { dur: 0.95, text: 'GAMMA LASER: legendary top-tier weapon, intense charged beam discharge, crystalline shimmer on top, huge sub-bass impact underneath, rare and awe-inspiring' },
};

for (const [id, l] of Object.entries(LASER)) {
  for (let n = 1; n <= 3; n++) {
    const datei = join(ziel, `${id}_${n}.mp3`);
    if (existsSync(datei)) continue;
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text: WELT + l.text, duration_seconds: l.dur, prompt_influence: 0.75 }),
    });
    if (!r.ok) { console.error('Fehler', id, n, r.status, (await r.text()).slice(0, 200)); continue; }
    writeFileSync(datei, Buffer.from(await r.arrayBuffer()));
    console.log('erstellt', datei);
  }
}
