// LAST SIGNALS Engine-Schicht: Einstellungs-Schema (settings.js), Fähigkeiten (caps.js), Nachbearbeitungskette aus
// Bausteinen (pipeline.js, passes/), Bildratenbegrenzer. Der Renderer (render/renderer.js) baut damit seine Kette
// und liest die wirksamen Grafikwerte; Oberflächen (Hub, Bordmenü) schreiben über ui/gfx-panel.js.
// Beschreibung und Erweiterung: Planung/ENGINE.md.
import * as THREE from 'three';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { PostChain } from './pipeline.js';
import { AoPass } from './passes/ao.js';
import { UpscalePass } from './passes/upscale.js';
import { detectCaps } from './caps.js';
import { resolveGfx, readStoredSettings, gfxSignature } from './settings.js';

export { detectCaps } from './caps.js';
export * from './settings.js';
export { PostChain, STAGES } from './pipeline.js';

/** Wirksame Grafikwerte jetzt (liest 'ls.settings', Fähigkeiten einmal je Seite) */
export function currentGfx() {
  const r = resolveGfx(readStoredSettings(), detectCaps());
  r.sig = gfxSignature(r);
  return r;
}

/**
 * Kette des Flug-Renderers: Szene, Umgebungsverdeckung, Cockpit-Ebene, Nachleuchten, Kamera-Look, SMAA,
 * LS-Hochskalierung/Schärfen. state (vom Renderer je Änderung): { g: Grafikwerte, q: Stufe 0..3, cockpit,
 * upscale (Szene kleiner als Ausgabe), ss (Szene größer: Supersampling) }.
 */
export function buildFlightChain(composer, { scene, camera, cockpit, bloom, look }) {
  const chain = new PostChain(composer);
  const renderPass = new RenderPass(scene, camera);
  chain.add({ id: 'render', stage: 'render', label: 'SZENE', pass: renderPass, active: () => true });

  const ao = new AoPass(camera);
  if (import.meta.env && import.meta.env.DEV) {
    // nur Entwicklung: ?aoview=1 zeigt nur die Verdeckung, ?aor=Radius ?aot=Dicke (m) zum Abstimmen (gilt für alle Stufen)
    try {
      const q = new URLSearchParams(location.search);
      ao.view = q.get('aoview') === '1' ? 1 : 0;
      if (+q.get('aor') || +q.get('aot')) ao.devRadius = true;
      if (+q.get('aor')) { ao.radius = +q.get('aor'); ao.gtaoMat.uniforms.radius.value = ao.radius; }
      if (+q.get('aot')) { ao.thickness = +q.get('aot'); ao.gtaoMat.uniforms.thickness.value = ao.thickness; }
    } catch { /* egal */ }
  }
  // Ohne Cockpit-Ebene rechnet der Kamera-Look die Verdeckung ein (fold); mit Cockpit eigener Durchgang davor,
  // sonst würde die Welt-Verdeckung den Cockpitrahmen abdunkeln
  chain.add({ id: 'ao', stage: 'ao', label: 'AO', pass: ao, active: (s) => s.g.ao !== 'off', apply: (s) => { ao.setLevel(s.g.ao); ao.fold = !s.cockpit; } });

  const cockpitPass = new RenderPass(cockpit.scene, cockpit.camera);
  cockpitPass.clear = false;
  cockpitPass.clearDepth = true;
  chain.add({ id: 'cockpit', stage: 'cockpit', label: 'COCKPIT', pass: cockpitPass, active: (s) => !!s.cockpit });

  chain.add({ id: 'bloom', stage: 'bloom', label: 'BLOOM', pass: bloom, active: (s) => s.g.bloom > 0 });

  // Kamera-Look ist immer aktiv, sobald die Kette läuft (Tonwertabbildung). FXAA steckt darin (ein Durchgang).
  chain.add({
    id: 'look', stage: 'look', label: 'LOOK', pass: look, active: () => true,
    apply: (s) => { look.setFxaa(s.g.aa === 'fxaa'); look.setEffects(s.g.grain, s.g.vignette, s.g.chroma); look.setAo(s.g.ao !== 'off' ? ao : null); },
  });

  const smaa = new SMAAPass(4, 4);
  // AUTO: SMAA nur unter 1,5-facher Szenendichte (wo früher FXAA lief), darüber reicht die Pixeldichte
  chain.add({ id: 'smaa', stage: 'aa', label: 'SMAA', pass: smaa, active: (s) => s.g.aa === 'smaa' || (s.g.aa === 'auto' && s.dpr < 1.5) });

  const up = new UpscalePass();
  chain.add({
    id: 'upscale', stage: 'upscale', label: 'LS', pass: up,
    active: (s) => s.upscale || s.g.sharpen > 0,
    apply: (s) => { up.upscale = !!s.upscale; up.sharp = s.g.sharpen / 100; },
  });
  chain.passes = { renderPass, ao, cockpitPass, smaa, up };
  return chain;
}

function depthTex() { const t = new THREE.DepthTexture(4, 4); t.type = THREE.UnsignedIntType; return t; }
/** Szenenziel mit Tiefentextur (Umgebungsverdeckung liest sie; ohne Mehrfachabtastung) */
export function sceneTarget() {
  return new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0, depthTexture: depthTex() });
}
/**
 * Beide Ziele des Composers brauchen EIGENE Tiefentexturen: EffectComposer klont das erste Ziel, und eine geklonte
 * Textur teilt in three.js ihre Quelle (= dieselbe GL-Textur) – AO läse dann die Tiefe des Ziels, in das sie schreibt.
 */
export function separateDepth(composer) {
  const rt = composer.renderTarget2;
  if (rt.depthTexture) rt.depthTexture.dispose();
  rt.depthTexture = depthTex();
}

/**
 * Bildratenbegrenzer (Browser): lässt Bilder des Bildschirmtakts aus, bis das Ziel-Intervall erreicht ist.
 * Fester Takt ohne Drift (nächster Zeitpunkt += Intervall), Toleranz 2 ms gegen Zittern der Zeitstempel.
 */
export class FrameLimiter {
  constructor() { this.cap = 0; this.next = 0; }
  setCap(fps) { fps = fps | 0; if (fps !== this.cap) { this.cap = fps; this.next = 0; } }
  /** true = dieses Bild rechnen und zeichnen */
  allow(now) {
    if (!this.cap) return true;
    const iv = 1000 / this.cap;
    if (!this.next || now - this.next > iv * 2) { this.next = now + iv; return true; }
    if (now + 2 < this.next) return false;
    this.next += iv;
    return true;
  }
}

/** Desktop-App: Grafikwerte an die Hülle melden (optional, siehe ENGINE.md „Schnittstelle Desktop-Hülle“) */
export function notifyDesktop(g) {
  try {
    const D = typeof window !== 'undefined' && window.lsDesktop;
    if (D && typeof D.setGraphics === 'function') D.setGraphics({ fpsCap: g.fpsCap | 0, renderScale: g.renderScale });
  } catch { /* Hülle ohne diese Funktion */ }
}
