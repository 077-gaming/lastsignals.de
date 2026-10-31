// S01/S02 Produktionsoptimierung: verschweißen, Nullflächen entfernen, formtreu vereinfachen (meshopt, Fehlergrenze), meshopt-Kompression.
// Texturen und Knotenstruktur bleiben unverändert.
import { NodeIO } from '/Users/077-gaming/.npm/_npx/9ae6225218f85c19/node_modules/@gltf-transform/core/dist/index.js';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '/Users/077-gaming/.npm/_npx/9ae6225218f85c19/node_modules/@gltf-transform/extensions/dist/index.js';
import { weld, simplify, prune, dedup } from '/Users/077-gaming/.npm/_npx/9ae6225218f85c19/node_modules/@gltf-transform/functions/dist/index.js';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from '/Users/077-gaming/.npm/_npx/9ae6225218f85c19/node_modules/meshoptimizer/index.module.js';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [src, dst, err] = process.argv.slice(2);
const doc = await io.read(src);
const dropZero = () => (d) => { for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const ix = p.getIndices(), pos = p.getAttribute('POSITION'); if (!ix) continue;
  const A=[0,0,0],B=[0,0,0],C=[0,0,0], keep=[];
  for (let i=0;i<ix.getCount();i+=3){ const a=ix.getScalar(i),b=ix.getScalar(i+1),c=ix.getScalar(i+2); if(a===b||b===c||a===c) continue; pos.getElement(a,A);pos.getElement(b,B);pos.getElement(c,C);
    const u=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],v=[C[0]-A[0],C[1]-A[1],C[2]-A[2]]; if(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])<1e-8) continue; keep.push(a,b,c); }
  ix.setArray(pos.getCount() > 65535 ? new Uint32Array(keep) : new Uint16Array(keep)); } };
await doc.transform(dedup(), weld(), dropZero(), simplify({ simplifier: MeshoptSimplifier, error: +err, ratio: 0, lockBorder: false }), dropZero(), prune({ keepLeaves: true, keepAttributes: true }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(dst, doc);
