#!/usr/bin/env node
// Meshy-Modell spielfertig machen: Meshopt + WebP 1024 (Größe ~10 MB → < 1 MB), längste Achse auf +z (Bug),
// auf Ziellänge in Metern skalieren, mittig auf den Ursprung. Aufruf:
//   node tools/models/meshy-einbau.mjs eingabe.glb ausgabe.glb <laenge_m> [--drehen 0|90|180|270]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const [inp, out, len, , rotArg] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const scene = doc.getRoot().listScenes()[0];
const b = getBounds(scene);
const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
// Bug soll nach +z: liegt die lange Achse auf x, um 90° drehen; dazu Zusatzdrehung (bei verkehrtem Bug 180)
let deg = (sx > sz ? -90 : 0) + Number(rotArg || 0);
const a = deg * Math.PI / 180;
const k = Number(len) / Math.max(sx, sz);
const cx = (b.max[0] + b.min[0]) / 2, cy = (b.max[1] + b.min[1]) / 2, cz = (b.max[2] + b.min[2]) / 2;
const root = doc.createNode('MeshyRoot').setScale([k, k, k]).setRotation([0, Math.sin(a / 2), 0, Math.cos(a / 2)]);
const inner = doc.createNode('MeshyCenter').setTranslation([-cx, -cy, -cz]);
for (const n of scene.listChildren()) { scene.removeChild(n); inner.addChild(n); }
root.addChild(inner); scene.addChild(root);
await io.write(out, doc);
console.log(out, `Länge ${len} m, Drehung ${deg}°`);
