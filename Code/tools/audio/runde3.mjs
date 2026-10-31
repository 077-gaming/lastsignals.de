// Runde 3: Alien-Tod (organisch, Splat), besserer Sprung (Laden + Warp), Varianten zum Auswählen.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const code = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const key = readFileSync(join(code, '.env.audio'), 'utf8').match(/ELEVENLABS_API_KEY=(\S+)/)?.[1];
const ziel = join(code, 'public', 'audio', 'sfx', 'varianten'); mkdirSync(ziel, { recursive: true });
const W = 'AAA sci-fi space game sound design, cinematic, clean, no music, no voice, ';
const L = [
  ['alien_death', 1.6, 'alien creature bursting apart in space: wet organic squelch and splatter, slimy crunch of a chitin shell, short gurgling shriek fading out'],
  ['alien_death', 1.6, 'insectoid alien exploding: gooey wet pop, acidic hiss, cracking carapace, organic and disgusting but punchy'],
  ['alien_death', 1.6, 'large space bug dying: guttural screech cut short by a juicy splat, bubbling green goo, deep organic thump'],
  ['jump_warp', 2.2, 'starship engaging hyperspace jump: massive bass whoomp, space tearing open with a bright crystalline swoosh, then a deep rumble rushing away'],
  ['jump_warp', 2.2, 'warp jump: rising engine scream that snaps into a huge sub-bass boom and a doppler whoosh as the ship vanishes, epic and satisfying'],
  ['jump_warp', 2.2, 'hyperdrive jump: sharp electric crack, reality-bending phaser sweep, powerful low impact, airy tail like wind through a tunnel'],
  ['jump_charge', 3, 'starship jump drive spooling up: rising turbine whine plus pulsing sub-bass heartbeat that speeds up, metallic locks clicking into place, energy crackles, ends on a held tense peak'],
];
const n = {};
for (const [id, dur, text] of L) {
  n[id] = (n[id] || (id === 'jump_charge' ? 3 : 0)) + 1;
  const datei = join(ziel, `${id}_${n[id]}.mp3`);
  if (existsSync(datei)) continue;
  const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: W + text, duration_seconds: dur, prompt_influence: 0.7 }) });
  if (!r.ok) { console.error('Fehler', id, r.status); continue; }
  writeFileSync(datei, Buffer.from(await r.arrayBuffer()));
  console.log('erstellt', `${id}_${n[id]}`);
}
