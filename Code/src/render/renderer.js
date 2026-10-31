// 3D-Grafik: Kamera, Licht, Nachbearbeitung (Bloom), Entities, Effekte, Auswahl, Bildschirm-Umrechnung.
// Leistungsregeln: keine Speicher-Neuanlage pro Bild, Geometrien/Materialien geteilt, Effekte aus Pools,
// feste Lichtanzahl, adaptive Auflösung (0.6 … 1.0 der gedeckelten Pixeldichte).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { CameraLookPass } from './post.js';
import { BloomPass } from './bloom.js';
import { FACTIONS, SHIPS, ENEMIES } from '../core/data.js';
import { ModelFactory, ENEMY_VIS, ENEMY_LEN, SHIELD_COLOR, PORTAL_VIS, preloadGLB } from './models.js';
import { store } from '../core/store.js';
import { JumpMarker } from './marker.js';
import { Environment, sectorFaction } from './environment.js';
import { Effects } from './effects.js';
import { Trails } from './trails.js';
import { disposeTextures, hashString } from './textures.js';
import { scaleRingMaterial, scaleRingGeometry } from './overlay.js';
import { GpuTimer } from '../perf/gputimer.js';
import { renderHints } from '../perf/quality.js';
import { CameraRig, FOV_TAC, FOV_CHASE } from './camrig.js';
import { Telegraph } from './telegraph.js';
import { StationLife } from './stationlife.js';
import { SpeedDust } from './speeddust.js';
import { DroneFleet, preloadDrones } from './drones.js';

// Echte Modelle (GLB) je Schlüssel. Alles andere bleibt Platzhalter.
const MODELS = [
  ['ship:s1:saturn', '/models/saturn-starter.glb'],
  ['ship:s1:europa', '/models/europa-starter.glb'],
  ['ship:s1:eris', '/models/eris-starter.glb'],
  ['ship:s2:saturn', '/models/saturn-schiff2.glb'],
  ['ship:s2:europa', '/models/europa-schiff2.glb'],
  ['ship:s2:eris', '/models/eris-schiff2.glb'],
  ['ship:s3:saturn', '/models/saturn-schiff3.glb'],
  ['ship:s3:europa', '/models/europa-schiff3.glb'],
  ['ship:s3:eris', '/models/eris-schiff3.glb'],
  ['ship:s4:saturn', '/models/saturn-schiff4.glb'],
  ['ship:s4:europa', '/models/europa-schiff4.glb'],
  ['ship:s4:eris', '/models/eris-schiff4.glb'],
  ['ship:s5:saturn', '/models/saturn-schiff5.glb'],
  ['ship:s5:europa', '/models/europa-schiff5.glb'],
  ['ship:s5:eris', '/models/eris-schiff5.glb'],
  ['ship:s6:saturn', '/models/saturn-schiff6.glb'],
  ['ship:s6:europa', '/models/europa-schiff6.glb'],
  ['ship:s6:eris', '/models/eris-schiff6.glb'],
  ['ship:s7:saturn', '/models/saturn-schiff7.glb'],
  ['ship:s7:europa', '/models/europa-schiff7.glb'],
  ['ship:s7:eris', '/models/eris-schiff7.glb'],
  ['ship:s8:saturn', '/models/saturn-schiff8.glb'],
  ['ship:s8:europa', '/models/europa-schiff8.glb'],
  ['ship:s8:eris', '/models/eris-schiff8.glb'],
];
const MODEL_URL = new Map(MODELS.map(([k, u]) => [k, u]));

/** Eigenes Schiffsmodell schon vor dem Flug laden (z. B. in der Startsequenz): beim ersten Bild steht dann das
 *  echte Modell bereit, es gibt keinen sichtbaren Wechsel vom Platzhalter. Gibt ein Promise zurück (nie Fehler). */
export function preloadShip(faction, ship = 's1', drones = null) {
  const url = MODEL_URL.get(`ship:${ship || 's1'}:${faction}`);
  if (drones) preloadDrones(faction, drones); // eigene Drohnen gleich mit (nur Fraktions-Set, nur geflogene Stufen)
  return url ? preloadGLB(url).then(() => true, () => false) : Promise.resolve(false);
}
// Gleich nach dem Laden der Seite (im Leerlauf): Schiff des zuletzt gespielten Piloten vorladen
if (typeof window !== 'undefined') {
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  idle(() => {
    try {
      const cs = store.lastCallsign();
      const pr = cs ? store.get(cs) : null;
      if (pr && pr.faction) preloadShip(pr.faction, pr.ship, pr.drones);
    } catch { /* egal */ }
  }, { timeout: 2500 });
}

// Optionale Modelle: werden nur geladen, wenn die Datei in public/models liegt (sonst bleibt das prozedurale Modell)
const OPTIONAL_MODELS = [
  ['station:europa', '/models/station-europa.glb'],
  ['station:saturn', '/models/station-saturn.glb'],
  ['station:eris', '/models/station-eris.glb'],
];

const PITCH = 55 * Math.PI / 180;
const SIN_P = Math.sin(PITCH), COS_P = Math.cos(PITCH);
const FOV = FOV_TAC;
// Verfolger-Kamera: Himmelsrahmen um 55° nach oben gedreht → Bildaufbau der Taktik-Kamera liegt vorn am Horizont
const SKY_Q_CHASE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), PITCH);
const SKY_Q_ID = new THREE.Quaternion();
const _sq = new THREE.Quaternion(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3(), _so = new THREE.Vector3(), _s2 = new THREE.Vector2();
// Schiff bei Standard-Abstand ≈ 8 % der Bildhöhe, ganz nah ≈ 25 %, ganz weit für die Übersicht
const ZOOM_MIN = 230, ZOOM_MAX = 3400, ZOOM_START = 520;
const TAN_H = Math.tan(FOV * Math.PI / 360);
const SAFE_R = 400, PORTAL_R = 148;
// Hub speichert englische Werte. Ultra = 3 (volle Pixeldichte, feinerer Himmel), alles ab 2 wie „hoch“.
const QUALITY = { niedrig: 0, mittel: 1, hoch: 2, ultra: 3, low: 0, medium: 1, high: 2 };
// Pixeldichte-Obergrenze und kleinster Auflösungsfaktor der adaptiven Auflösung je Stufe (niedrig … ultra)
// HOCH 1,75 statt 2: auf Retina kaum sichtbar, spart ≈ 23 % Bildpunkte (Kampf unter 8 ms auf Apple-Chips); ULTRA bleibt 2
const PR_CAP = [1, 1.5, 1.75, 2];
const SCALE_MIN = [0.7, 0.65, 0.6, 0.75];
// Schwache Grafik (Intel UHD/HD, ältere Radeon-APU, Software): tiefer herunterregeln dürfen (halbe Kantenlänge =
// Viertel der Pixel), sonst reicht selbst NIEDRIG auf 1080p nicht für 50 Bilder/s
const SCALE_MIN_WEAK = [0.5, 0.55, 0.6, 0.75];
function readQuality() {
  try {
    const s = JSON.parse(localStorage.getItem('ls.settings') || '{}');
    return QUALITY[s && s.quality] ?? 2;
  } catch { return 2; }
}
const MAX_PR = 2;
// Grafikzeit-Grenze je Stufe (ms, gemessen mit Zeitabfrage), nur HOCH: Ziel „Kampf unter 8 ms je Bild“ auf dem Mac
const GPU_CAP = [0, 0, 7.6, 0];
const GPU_CAP_FLOOR = 0.86;
const W_DOCKED = (r) => !!(r.world && r.world.docked);
const PICK_KINDS = { enemy: 1, crate: 1, wreck: 1, portal: 1, station: 1, ore: 1, nest: 1 }; // Frachter/Asteroiden: nicht anwählbar
// Arten, die im Kampf gerahmt werden und rot markiert sind
const HOSTILE = { enemy: 1, nest: 1 };
const TAU = Math.PI * 2;

const RING_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RING_FS = `
uniform vec3 uColor; uniform float uOpacity; uniform float uDash; uniform float uSpeed; uniform float uTime; uniform float uFill;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p);
  float a = atan(p.y, p.x) / 6.2831853;
  float dash = uDash > 0.0 ? smoothstep(0.38, 0.42, fract(a * uDash + uTime * uSpeed)) : 1.0;
  float v = (0.25 + 0.75 * dash) * uOpacity;
  gl_FragColor = vec4(uColor * v, v);
}`;

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ndc = new THREE.Vector2(), _h = new THREE.Vector3();
const _tc = new THREE.Color();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ray = new THREE.Raycaster();

function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

export class Renderer {
  constructor(canvas, bus) {
    this.canvas = canvas;
    this.bus = bus;
    this.world = null;
    // Flug erst zeigen, wenn das eigene Schiffsmodell bereit ist (höchstens 2,5 s): kein sichtbarer Wechsel
    // Platzhalter → echtes Modell. Bis dahin ist die Leinwand unsichtbar, gezeichnet wird trotzdem (wärmt vor).
    this._intro = { t0: performance.now(), done: false };
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity 0.5s ease-out';
    this._hold = null; // Sektorsprung: Shader parallel übersetzen, bis dahin letztes Bild stehen lassen
    this.time = 0;
    this.frame = 0;

    const gl = this.gl = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true,
    });
    gl.outputColorSpace = THREE.SRGBColorSpace;
    // Shader-Prüfung nur im Entwicklungsserver: sie fragt nach jedem Übersetzen synchron den Link-Status ab und
    // wartet dabei auf die ganze Grafik-Warteschlange (Hänger beim Sektorsprung). Im Spiel übersetzt der Treiber parallel.
    gl.debug.checkShaderErrors = !!(import.meta.env && import.meta.env.DEV);
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.0;
    gl.setClearColor(0x020308, 1);
    // Schatten nur bei Qualität „hoch“: eine Schattenkarte um die Station, einmal gezeichnet (statisch)
    gl.shadowMap.enabled = false;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = false;
    gl.info.autoReset = false; // je Bild einmal zurückgesetzt (render), damit Aufrufe/Dreiecke über alle Durchgänge zählen
    this.gpuTimer = new GpuTimer(gl.getContext());
    this.stats = { gpu: 0, gpuOk: this.gpuTimer.ok, calls: 0, tris: 0, pr: 1, scale: 1, w: 0, h: 0, quality: 2, low: false };

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;
    this.rig = new CameraRig();   // Taktisch / Verfolger (Taste V), Federung, Stöße
    this.camera = new THREE.PerspectiveCamera(this.rig.k > 0.5 ? FOV_CHASE : FOV, 1, 25, 95000);
    this._fov = this.camera.fov; this._tanH = Math.tan(this._fov * Math.PI / 360); this._viewD = ZOOM_START;
    this.hints = renderHints();     // Chip-Klasse und Vorhersage aus der automatischen Qualitätswahl
    this.qCap = 3;                  // Obergrenze für diese Sitzung (Absicherung im Flug bei eigener Wahl)
    this.quality = readQuality();
    this._qCheck = 0;

    this.lights = {
      sun: new THREE.DirectionalLight(0xffffff, 2.4),   // Führungslicht (Sonne)
      rim: new THREE.DirectionalLight(0x9fc4ff, 1.4),   // Kantenlicht von hinten
      fill: new THREE.DirectionalLight(0x8090b0, 0.2),  // schwaches Fülllicht aus Richtung Milchstraße
      hemi: new THREE.HemisphereLight(0x40506a, 0x050608, 0.35),
    };
    const sh = this.lights.sun.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.left = -400; sh.camera.right = 400; sh.camera.top = 400; sh.camera.bottom = -400;
    sh.camera.near = 200; sh.camera.far = 3200;
    sh.bias = -0.0004; sh.normalBias = 1.2; sh.radius = 2.5;
    this._shadowAt = null;
    this.scene.add(this.lights.sun, this.lights.sun.target, this.lights.rim, this.lights.rim.target,
      this.lights.fill, this.lights.fill.target, this.lights.hemi);

    this.factory = new ModelFactory();
    this.factory.prepare = (key, wrap) => this._prepareGLB(key, wrap);
    // Echte Modelle (GLB) lädt setWorld: das eigene Schiff und die Station zuerst, die übrigen gestaffelt später
    // (jedes Einlesen kostet Hauptthread-Zeit; fremde Schiffe braucht der Flug erst nach einem Schiffskauf).
    this.env = new Environment(this.scene, gl, this.factory, this.camera);
    this.entityGroup = new THREE.Group();
    this.entityGroup.name = 'entities';
    this.scene.add(this.entityGroup);
    this.effects = new Effects(this.scene, this);
    this.trails = new Trails(this.effects.group, this.factory.uTime);
    this.tele = new Telegraph(this.scene, this);          // Warnanzeige angekündigter Spezialangriffe
    this.speedDust = new SpeedDust(this.scene);          // Tempo-Staub und Lichtstreifen nah an der Kamera
    this.drones = new DroneFleet(this.scene, this);      // eigene Drohnen in Formation (instanziert, src/render/drones.js)
    this.env.sky.baseFov = FOV; this.env.sky.fovMargin = 5; // Taktik-Himmel mit Rand für den Sichtfeld-Kick
    this.dying = [];   // zerstörte Ansichten, die noch kurz aufglühen, bevor die Explosion sie verschluckt
    this.views = new Map();
    this.jumpMarker = new JumpMarker(this.scene);

    // Auswahlring
    this.selMat = this._ringMat(0xff4a3a, 1.0, 4, 0.25);
    this.sel = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96, 1).rotateX(-Math.PI / 2), this.selMat);
    this.sel.visible = false; this.sel.renderOrder = 15;
    this.scene.add(this.sel);
    this.selInner = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.8, 64, 1).rotateX(-Math.PI / 2), this._ringMat(0xff4a3a, 0.35, 0, 0));
    this.sel.add(this.selInner);

    // Kamera-Zustand
    this.camTarget = new THREE.Vector3();
    this.camLead = new THREE.Vector3();
    this.dist = ZOOM_START; this.targetDist = ZOOM_START;
    this.combatK = 0;          // 0 = frei, 1 = Kampf-Rahmung (Spieler und Ziel im freien Bildbereich)
    this._nav = this.factory.navMats();
    this._snap = true;

    // Auflösung
    this.basePR = Math.min(window.devicePixelRatio || 1, PR_CAP[this.quality] ?? MAX_PR);
    this._bloomCap = 1;
    this.scale = this._startScale();
    this.lowQuality = false;
    this._perf = { last: 0, winStart: 0, frames: 0, fps: 0, best: 30, slow: 0, fast: 0, cooldown: 0, blockUp: 0, lastUp: -1e9, warm: 0, lowCount: 0, cpu: 0, work: 0, cpuB: 0, lowAt: 0, lowOffs: 0 };
    this.cpuBound = false; // Prozessor bremst (nicht die Grafik): Auflösung bleibt, die Absicherung senkt die Stufe
    this.rect = { left: 0, top: 0, width: 1, height: 1 };

    // Kein MSAA auf dem HalfFloat-Ziel: ANGLE/Metal zeichnet dort bei Pixeldichte 1 nur Schwarz.
    // Kanten glättet der Kamera-Durchgang (FXAA), sobald die Pixeldichte unter 1,5 liegt.
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(gl, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new BloomPass(0.5, 0.55, 0.92);
    this.output = new CameraLookPass();
    this.output.bloom = this.bloom;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    // Bloom ist weich: auf Retina-Dichte reicht ein Viertel der Pixel (spart ≈ 6 ms Grafikzeit pro Bild)
    this._bloomScale = 1;
    const bloomSize = this.bloom.setSize.bind(this.bloom);
    this.bloom.setSize = (w, h) => bloomSize(Math.max(1, Math.round(w * this._bloomScale)), Math.max(1, Math.round(h * this._bloomScale)), w, h);

    // Ereignisse
    this._offs = [];
    const on = (t, fn) => this._offs.push(bus.on(t, fn));
    on('shot', (p) => this.effects.shot(p));
    on('rocket', (p) => this.effects.rocket(p));
    on('explode', (p) => this._onExplode(p));
    on('damage', (p) => { this.effects.damage(p); this._onDamage(p); });
    on('telegraph', (p) => this.tele.start(p));
    on('telegraphEnd', (p) => this.tele.end(p));
    on('special', (p) => this.tele.special(p));
    on('docked', () => { this._dockT = 0; this._docking = 1; });
    on('undocked', () => { this._dockT = 0; this._docking = -1; });
    on('loot', (p) => this.effects.loot(p));
    on('trap', (p) => this.effects.trap(p));
    on('jumpStart', (p) => this.effects.jumpStart(p));
    on('sector', () => { this.effects.sectorFlash(); this._arrive = true; });
    on('respawn', () => this.effects.respawn());
    on('profile', () => { this._playerDirty = true; });
    on('despawn', (p) => { if (p && p.id !== undefined) { this._removeView(p.id); this.tele.drop(p.id); } });

    this._syncCb = (e) => this._sync(e);
    this._staleCb = (v, id) => { if (v.stamp !== this.frame) this._removeView(id); };
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
    this._applyQuality();
    if (import.meta.env && import.meta.env.DEV) window.__lsRenderer = this; // nur Entwicklungsserver: Messungen
  }

  // Qualitätsstufe aus den Einstellungen (hoch | mittel | niedrig)
  _applyQuality() {
    const q = this.quality;
    this.gl.shadowMap.enabled = q >= 2;
    this.lights.sun.castShadow = false;
    this._shadowAt = null;
    this.bloom.enabled = q >= 1;
    this.bloom.strength = q >= 2 ? 0.5 : 0.42;
    // Schwache Grafik auf MITTEL: Nachleuchten in halber Auflösung und ohne breitesten Schleier
    this._bloomCap = q <= 1 && this.hints.weak ? 0.5 : 1;
    this.bloom.setLevels(q <= 1 && this.hints.weak ? 4 : 5);
    this.output.setQuality(q);
    this.effects.setQuality(q);
    // Pixeldichte der Stufe (ultra/hoch 2, mittel 1,5, niedrig 1): Puffer neu anlegen, falls sich etwas ändert
    if (this._sized) { this._sized = false; this.resize(); }
  }

  _minScale() { return (this.hints.weak ? SCALE_MIN_WEAK : SCALE_MIN)[this.quality] ?? 0.6; }
  /** Adaptive Auflösung am Boden (für die Absicherung im Flug: erst Auflösung, dann Stufe senken) */
  atFloor() { return this.scale <= this._minScale() + 0.001; }
  /** Effektive Stufe: gespeicherte Wahl, begrenzt durch die Sitzungs-Obergrenze */
  _wantQuality() { return Math.min(readQuality(), this.qCap); }
  /** Sitzungs-Obergrenze setzen (Absicherung im Flug); baut bei Änderung neu auf */
  setQualityCap(q) {
    this.qCap = Math.max(0, Math.min(3, q | 0));
    const want = this._wantQuality();
    if (want !== this.quality) { this.quality = want; this._applyQuality(); if (this.world) this.setWorld(this.world); }
  }
  // Start-Auflösung aus der Vorhersage der Qualitätswahl: passt die Stufe bei voller Auflösung nicht ins Budget,
  // gleich mit passender Auflösung beginnen (statt die ersten Sekunden ruckelnd herunterzuregeln)
  _startScale() {
    const H = this.hints, p = H.pred && H.pred[this.quality];
    if (!(p > 0)) return 1;
    let k = 1;
    if (p > H.budget) k = Math.sqrt(H.budget / p);
    return Math.max(this._minScale(), Math.min(1, Math.round(k * 20) / 20));
  }

  _ringMat(hex, opacity, dash, speed) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(hex) }, uOpacity: { value: opacity }, uDash: { value: dash },
        uSpeed: { value: speed }, uTime: this.factory.uTime, uFill: { value: 0 },
      },
      vertexShader: RING_VS, fragmentShader: RING_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }

  // ---------- Welt ----------
  setWorld(world) {
    this.views.forEach((v, id) => this._removeView(id));
    this.views.clear();
    this._clearDying();
    this.effects.clear();
    this.trails.clear();
    this.tele.clear();
    this.rig.reset = true;
    this._docking = 0; this._dockK = world && world.docked ? 1 : 0;
    this.world = world;
    if (!world) return;
    this.faction = sectorFaction(world);
    if (!this._modelsQueued) { this._modelsQueued = true; this._queueModels(world); }
    this._shadowAt = null;
    this.env.build(world, this.lights, this.quality, this.rect.width * this.basePR, this.rect.height * this.basePR);
    this.output.uniforms.uFlare.value = this.env.flareStrength;
    this.output.uniforms.uSun.value.copy(this.env.sunScreen);
    this.output.uniforms.uSunCol.value.copy(this.env.sunColor);
    this._snap = true;
    this._perf.warm = 1.5; // erste Bilder nach dem Aufbau nicht für die Auflösung werten
    // Schattenzustand je Sitzung fest (Qualität „hoch“): wechselte er zwischen Sektoren mit und ohne Station, übersetzte
    // three.js beim Sprung alle ≈ 120 beleuchteten Materialien neu (0,4–1,4 s Hänger). Ohne Station bleibt die
    // Schattenkarte leer (nichts wirft Schatten), sie wird nur einmal gezeichnet.
    this._shadowOn = this.quality >= 2;
    this.lights.sun.castShadow = this._shadowOn;
    // Erster Aufbau der Sitzung: alles sofort (hinter der unsichtbaren Leinwand). Jeder weitere (Sektorsprung,
    // Qualitätswechsel): Shader parallel übersetzen, ohne den Hauptthread anzuhalten (vorher 0,6–1,4 s Hänger).
    if (this._warmedOnce) this._warmAsync(world);
    else { this._warm(world); this._warmedOnce = true; }
  }

  // Sektorsprung: Ansichten anlegen, alle Materialien der neuen Szene parallel übersetzen (KHR_parallel_shader_compile,
  // blockiert nicht), dann einmal winzig zeichnen (Metal/ANGLE legt den Zeichenzustand beim ersten Zeichnen an),
  // erst danach wieder sichtbar zeichnen. Bis dahin bleibt das letzte Bild (Sprungblitz) stehen, höchstens 1,5 s.
  _warmAsync(world) {
    const WT = this.warmT = { views: 0, probe: 0, compile: 0, tex: 0, draw: 0, post: 0, async: 1, wait: 0 };
    let t0 = performance.now(), t1;
    this._alpha = 1; this._dt = 0;
    if (world.player) this.camTarget.set(world.player.x || 0, 0, world.player.z || 0);
    this._viewBudget = 0;
    try { if (world.entities) world.entities.forEach(this._syncCb); } catch (err) { console.warn('Ansichten unvollständig', err); }
    t1 = performance.now(); WT.views = t1 - t0; t0 = t1;
    const cam = this.camera, d = this.targetDist;
    const px = world.player ? world.player.x || 0 : 0, pz = world.player ? world.player.z || 0 : 0;
    cam.position.set(px, d * SIN_P, pz + d * COS_P); cam.lookAt(px, 0, pz); cam.updateMatrixWorld();
    const gl = this.gl, prevRT = gl.getRenderTarget();
    const useComposer = !(this.lowQuality || this.quality === 0);
    const H = this._hold = { t0: performance.now(), phase: 'compile', ready: false };
    try {
      try { this.env.planets.warmPrograms(); } catch (err) { console.warn('Planeten-Vorübersetzen', err); }
      const eqVis = this.env.sky.bgEq.visible;
      this.env.sky.bgEq.visible = true;
      gl.setRenderTarget(useComposer ? this.composer.readBuffer : null);
      const p = gl.compileAsync(this.scene, cam);
      this.env.sky.bgEq.visible = eqVis;
      p.then(() => { H.ready = true; WT.wait = performance.now() - H.t0; }, () => { H.ready = true; });
    } catch (err) { console.warn('Aufwärmen unvollständig', err); H.ready = true; }
    gl.setRenderTarget(prevRT);
    t1 = performance.now(); WT.compile = t1 - t0;
    this.gl.shadowMap.needsUpdate = true;
  }

  /** true = dieses Bild nicht zeichnen (Sektorsprung wärmt noch vor) */
  _holdStep() {
    const H = this._hold, now = performance.now();
    if (H.phase === 'compile') {
      if (!H.ready && now - H.t0 < 1500) return true;
      // fertig übersetzt: einmal winzig zeichnen (Zeichenzustände anlegen), sichtbar erst im nächsten Bild
      H.phase = 'draw';
      const t = performance.now();
      const gl = this.gl, prev = gl.getRenderTarget();
      const useComposer = !(this.lowQuality || this.quality === 0);
      if (useComposer && !this._prepRT) this._prepRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: 0 });
      const eqVis = this.env.sky.bgEq.visible;
      this.env.sky.bgEq.visible = true;
      try { gl.setRenderTarget(useComposer ? this._prepRT : null); gl.render(this.scene, this.camera); } catch { /* egal */ } finally { gl.setRenderTarget(prev); this.env.sky.bgEq.visible = eqVis; }
      if (this.warmT) this.warmT.draw = performance.now() - t;
      return true;
    }
    this._hold = null;
    if (this._arrive) this.effects.sectorFlash(); // Blitz und Streckung beginnen erst jetzt (sonst wären sie im stehenden Bild verpufft)
    return false;
  }

  // Echte Modelle von ChatGPT/Codex (GLB). Fehlt eins, bleibt der Platzhalter. Reihenfolge: eigenes Schiff und
  // Station sofort, die anderen Schiffe gestaffelt nach 6 s (je 1,5 s Abstand).
  _queueModels(world) {
    const fac = world.player?.faction || world.profile?.faction || this.faction;
    const ship = world.player?.ship || world.profile?.ship || 's1';
    const mine = `ship:${ship}:${fac}`;
    const load = (key, url) => (this._disposed ? Promise.resolve() : this.factory.registerGLB(key, url).catch((err) => console.warn('Modell nicht geladen:', key, err)));
    // Nur das eigene Schiff: fremde Schiffe zeigt der Flug nie (jedes weitere Einlesen kostete 10–30 ms Hauptthread
    // mitten im Flug). Nach einem Schiffskauf lädt _ensureMine() das neue Modell nach.
    this._loadGLB = load;
    this._mineKey = mine; this._mineUrl = MODEL_URL.get(mine) || null;
    // ownModelReady: main.js zeigt den Flug erst danach (kein sichtbarer Wechsel vom Platzhalter)
    // Drohnen (nur eigenes Fraktions-Set, nur geflogene Stufen) gehören dazu: auch sie nie sichtbar nachladen
    const drones = this.drones.setup(fac, world.drones || world.profile?.drones);
    this.ownModelReady = Promise.all([this._mineUrl ? load(mine, this._mineUrl) : Promise.resolve(), drones]);
    for (const [key, url] of OPTIONAL_MODELS) {
      fetch(url, { method: 'HEAD' }).then((r) => {
        const t = r.headers.get('content-type') || '';
        if (r.ok && !t.includes('html') && !this._disposed) return this.factory.registerGLB(key, url);
        return null;
      }).catch(() => { /* kein Modell vorhanden */ });
    }
  }

  // Alles vorab vorbereiten, was sonst beim ersten Auftreten ruckelt: Ansichten aller vorhandenen Entities,
  // je ein Modell jeder Art (alle Gegner, alle Wrack- und Erzvarianten, Kiste, Tor, Station), alle Effekt-Pools.
  // Danach Shader übersetzen, Texturen hochladen und ein Bild unsichtbar ins Zwischenziel zeichnen
  // (lädt Geometrien auf die Grafikkarte). Läuft einmal je Sektoraufbau.
  _warm(world) {
    const f = this.factory, probe = new THREE.Group();
    const WT = this.warmT = { views: 0, probe: 0, compile: 0, tex: 0, draw: 0, post: 0 }; // Zeiten (ms) für Messungen
    let t0 = performance.now(), t1;
    this._alpha = 1; this._dt = 0;
    // Kamera schon an den Spieler setzen (für die Entfernungsgrenze beim Anlegen der Ansichten)
    if (world.player) this.camTarget.set(world.player.x || 0, 0, world.player.z || 0);
    this._viewBudget = 0;
    try { if (world.entities) world.entities.forEach(this._syncCb); } catch (err) { console.warn('Ansichten unvollständig', err); }
    t1 = performance.now(); WT.views = t1 - t0; t0 = t1;
    let px = 0, pz = 0;
    const P = world.player;
    if (P) { px = P.x || 0; pz = P.z || 0; }
    // Probemodelle nur einmal je Sitzung (Fabrik, Stufe und GLB-Stand gleich): Programme und Geometrien bleiben
    // im Zwischenspeicher, ein zweiter Aufbau beim Sektorsprung kostete nur Zeit (≈ 0,3 s Hänger)
    const probeKey = f.version + ':' + this.quality + ':' + this.faction;
    if (this._probed !== probeKey) try {
      this._probed = probeKey;
      const add = (o, i) => { o.position.set(px + ((i % 6) - 2.5) * 60, 0, pz + (((i / 6) | 0) - 1) * 60); probe.add(o); };
      let i = 0;
      for (const t in ENEMIES) { const m = f.buildEnemy(t); m.root.scale.setScalar(30); add(m.root, i++); }
      for (let v = 0; v < 4; v++) add(f.buildWreck(v).root, i++);
      for (let v = 0; v < 4; v++) { const m = f.buildOre(['nickel', 'cobalt', 'platinum'][v % 3], v); m.root.scale.setScalar(12); add(m.root, i++); }
      add(f.buildCrate().root, i++);
      { const m = f.buildFreighter(0); m.root.scale.setScalar(0.3); add(m.root, i++); }
      { const m = f.buildNest(0); m.root.scale.setScalar(30); add(m.root, i++); }
      { const m = f.buildAsteroid(0); m.root.scale.setScalar(20); add(m.root, i++); }
      { const m = f.buildUnknown(); m.root.scale.setScalar(10); add(m.root, i++); }
      const portal = this._createView({ id: '__warm_portal', kind: 'portal', x: px, z: pz, rot: 0 });
      const station = this._createView({ id: '__warm_station', kind: 'station', x: px, z: pz, rot: 0 });
      this.entityGroup.remove(portal.root); this.views.delete('__warm_portal');
      this.entityGroup.remove(station.root); this.views.delete('__warm_station');
      add(portal.root, i++); add(station.root, i++);
      this._warmLife = station.life;
    } catch (err) { console.warn('Vorübersetzen unvollständig', err); }
    this.scene.add(probe);
    t1 = performance.now(); WT.probe = t1 - t0; t0 = t1;
    this.effects.warm(px, pz);
    this.tele.warm(px, pz);
    this.speedDust.warm();
    this.trails.mesh.visible = true;
    this.sel.visible = true; this.sel.position.set(px, 0, pz); this.sel.scale.setScalar(40);
    const cam = this.camera, d = this.targetDist;
    cam.position.set(px, d * SIN_P, pz + d * COS_P); cam.lookAt(px, 0, pz); cam.updateMatrixWorld();
    const prevRT = this.gl.getRenderTarget();
    const useComposer = !(this.lowQuality || this.quality === 0);
    const gl = this.gl;
    try {
      // Back-Shader der Planetenoberflächen (sonst übersetzt der erste Streifen je Typ mitten im Flug)
      try { this.env.planets.warmPrograms(); } catch (err) { console.warn('Planeten-Vorübersetzen', err); }
      this.env.sky.bgEq.visible = true; // Verfolger-Himmel mit übersetzen (sonst Ruckler beim ersten V)
      gl.setRenderTarget(useComposer ? this.composer.readBuffer : null);
      gl.compile(this.scene, cam);
      if (useComposer) { gl.setRenderTarget(null); gl.compile(this.scene, cam); } // Rückfall ohne Bloom
      t1 = performance.now(); WT.compile = t1 - t0; t0 = t1;
      // Texturen hochladen (compile lädt keine Bilder)
      const seen = new Set();
      this.scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
        if (!ms) return;
        for (const m of ms) {
          if (!m || seen.has(m)) continue;
          seen.add(m);
          for (const k of ['map', 'emissiveMap', 'normalMap', 'bumpMap', 'roughnessMap', 'alphaMap']) if (m[k] && m[k].isTexture) gl.initTexture(m[k]);
          if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) gl.initTexture(v); }
        }
      });
      t1 = performance.now(); WT.tex = t1 - t0; t0 = t1;
      // ein unsichtbares Bild ins Zwischenziel: Geometrien und Puffer liegen danach auf der Grafikkarte
      gl.setRenderTarget(useComposer ? this.composer.readBuffer : null);
      gl.render(this.scene, cam);
      t1 = performance.now(); WT.draw = t1 - t0; t0 = t1;
      // Nachbearbeitung (Nachleuchten, Kamera-Durchgang) einmal durchlaufen: übersetzt deren Shader und legt
      // die Mip-Kette an, sonst ruckelt das erste echte Bild
      if (useComposer) {
        this.composer.renderToScreen = false; // nicht sichtbar zeichnen (Probemodelle stehen noch in der Szene)
        try { this.composer.render(0); } finally { this.composer.renderToScreen = true; }
      }
      t1 = performance.now(); WT.post = t1 - t0; t0 = t1;
    } catch (err) { console.warn('Aufwärmen unvollständig', err); }
    gl.setRenderTarget(prevRT);
    this.env.sky.bgEq.visible = this.rig.k > 0.001 && !!(this.env.sky.eq && this.env.sky.eq.low);
    this.effects.clear();
    this.effects.setAllVisible(false);
    this.trails.clear();
    this.tele.clear();
    this.speedDust.mesh.visible = false;
    this.sel.visible = false;
    this.scene.remove(probe);
    if (this._warmLife) { this._warmLife.dispose(); this._warmLife = null; }
    this.gl.shadowMap.needsUpdate = true;
  }

  // GLB fertig geladen (models.js ruft das vor dem Umschalten): Ist es das Modell des Spielers oder der Station
  // dieses Sektors, ein Probemodell bauen, dessen Shader parallel übersetzen (KHR_parallel_shader_compile, blockiert
  // nicht), Texturen einzeln je Bild hochladen und es einmal winzig zeichnen (Metal/ANGLE legt den Zeichenzustand
  // erst beim ersten Zeichnen an). Danach erst schaltet die Ansicht um – vorher ruckelte das (≈ 200 ms auf M5).
  async _prepareGLB(key) {
    const W = this.world, P = W && W.player;
    if (!W || this._disposed) return;
    const fac = P?.faction || W.profile?.faction || this.faction;
    const ship = P?.ship || W.profile?.ship || 's1';
    let probe = null;
    if (key === `ship:${ship}:${fac}` || key === `ship:${ship}`) probe = this.factory.buildShip(fac, ship, P?.loadout || W.profile?.loadout);
    else if (key === `station:${this.faction}` || key === 'station') {
      let has = false;
      if (W.entities) W.entities.forEach((e) => { if (e.kind === 'station') has = true; });
      if (has) probe = this.factory.buildStation(this.faction, 0);
    }
    if (!probe) return; // für diese Sitzung nicht sichtbar: nichts vorbereiten (spart Grafikspeicher)
    const root = probe.root;
    root.position.set(this.camTarget.x, 0, this.camTarget.z);
    root.updateMatrixWorld(true);
    const gl = this.gl;
    const useComposer = !(this.lowQuality || this.quality === 0);
    const prev = gl.getRenderTarget();
    let wait = null;
    try {
      gl.setRenderTarget(useComposer ? this.composer.readBuffer : null);
      wait = gl.compileAsync(root, this.camera, this.scene);
    } finally { gl.setRenderTarget(prev); }
    await wait;
    if (this._disposed) return;
    const tex = new Set();
    root.traverse((o) => {
      for (const m of [].concat(o.material || [])) {
        if (!m) continue;
        for (const k in m) { const v = m[k]; if (v && v.isTexture) tex.add(v); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture) tex.add(v); }
      }
    });
    for (const t of tex) {
      if (this._disposed) return;
      try { gl.initTexture(t); } catch { /* egal */ }
      await new Promise((r) => setTimeout(r, 16));
    }
    if (this._disposed) return;
    // einmal im nächsten Bild mitzeichnen (vor dem echten Bild, gleiches Zielformat), danach umschalten
    await new Promise((res) => { this._prepQ = { root, res }; });
  }

  _drawPrep() {
    const { root, res } = this._prepQ;
    this._prepQ = null;
    const gl = this.gl, prev = gl.getRenderTarget();
    const useComposer = !(this.lowQuality || this.quality === 0);
    if (useComposer && !this._prepRT) this._prepRT = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType, samples: 0 });
    this.scene.add(root);
    try {
      gl.setRenderTarget(useComposer ? this._prepRT : null); // ohne Nachbearbeitung: das echte Bild überschreibt es gleich
      gl.render(this.scene, this.camera);
    } catch { /* egal */ } finally {
      this.scene.remove(root);
      gl.setRenderTarget(prev);
      res();
    }
  }

  _removeView(id) {
    const v = this.views.get(id);
    if (!v) return;
    if (v.life) { v.life.dispose(); v.life = null; }
    this.entityGroup.remove(v.root);
    this.views.delete(id);
  }

  _createView(e) {
    const f = this.factory;
    const v = {
      id: e.id, kind: e.kind, type: e.type, root: null, model: null, rx: e.x, rz: e.z, rrot: e.rot || 0, bank: 0,
      phase: (hashString(String(e.id)) % 1000) / 1000 * TAU, stamp: 0, vr: e.radius || 20, sig: '', ver: 0, gk: null,
      nextLaser: 0, engAcc: 0, extra: null, fl: 0, fdx: 0, fdz: 0, recoil: 0, dieT: 0, trailCol: null, gain: 1,
    };
    const seed = hashString(String(e.id));
    // GLB-Schlüssel, die diese Ansicht nutzen würde: nur deren Nachladen baut sie neu (nicht jedes fremde Schiff)
    if (e.kind === 'player') {
      const fac = e.faction || this.world?.profile?.faction || this.faction, sh = e.ship || this.world?.profile?.ship || 's1';
      v.gk = [`ship:${sh}:${fac}`, `ship:${sh}`];
    } else if (e.kind === 'station') v.gk = [`station:${this.faction}`, 'station'];
    if (v.gk) v.ver = f.keyVer(v.gk[0], v.gk[1]);
    switch (e.kind) {
      case 'player': {
        const fac = e.faction || this.world?.profile?.faction || this.faction;
        const lo = e.loadout || this.world?.profile?.loadout;
        const ship = e.ship || this.world?.profile?.ship || 's1';
        v.model = f.buildShip(fac, ship, lo);
        v.sig = this._sig(e);
        v.vr = v.model.radius;
        v.maxSpeed = SHIPS[ship]?.speed || 320;
        v.shieldColor = new THREE.Color(FACTIONS[fac]?.glow ?? SHIELD_COLOR).getHex();
        v.trailCol = new THREE.Color(v.model.plumeHex ?? v.shieldColor);
        break;
      }
      case 'enemy': {
        if (e.type === 'nest') {
          // Schwarm-Nest (Ereignis): organisch pulsierend statt Schiff
          v.model = f.buildNest(seed);
          v.vr = (e.radius || 55) * 1.25;
          v.model.root.scale.setScalar(v.vr);
          break;
        }
        v.model = f.buildEnemy(e.type);
        // Maßstab aus der echten Modellausdehnung: längste Rumpfkante = ENEMY_LEN × Trefferradius
        const er = e.radius || ENEMIES[e.type]?.radius || 18;
        v.vr = er * ENEMY_VIS;
        v.model.root.scale.setScalar((er * ENEMY_LEN) / this._enemyExtent(e.type, v.model));
        v.trailCol = new THREE.Color(ENEMIES[e.type]?.accent ?? 0xff5a3a);
        v.maxSpeed = ENEMIES[e.type]?.speed || 200;
        // Elite: goldener Schimmer, Alpha: rote, pulsierende Aura
        if (e.rank === 'elite' || e.rank === 'alpha') {
          const alpha = e.rank === 'alpha';
          const aura = new THREE.Sprite(f.sprite(alpha ? 0xff3a2a : 0xffc860, alpha ? 0.55 : 0.35, 'aura'));
          v.auraS = this._enemyExtent(e.type, v.model) * (alpha ? 1.55 : 1.2);
          aura.scale.setScalar(v.auraS);
          aura.renderOrder = 5;
          v.model.root.add(aura);
          v.aura = aura; v.auraK = alpha ? 1 : 0.6;
        }
        break;
      }
      case 'freighter': {
        v.model = f.buildFreighter(seed);
        const r = Math.max(30, e.radius || 90);
        v.model.root.scale.setScalar(r / 90);
        v.vr = r; v.sc = r / 90;
        v.trailCol = new THREE.Color(0xffb070);
        v.maxSpeed = 140;
        v.tkeys = [e.id + ':0', e.id + ':1', e.id + ':2'];
        break;
      }
      case 'nest': {
        v.model = f.buildNest(seed);
        const r = Math.max(20, e.radius || 60) * 1.25;
        v.model.root.scale.setScalar(r);
        v.vr = r;
        break;
      }
      case 'asteroid': {
        const r = Math.max(8, e.radius || 40);
        v.model = f.buildAsteroid(seed, r >= 100);
        v.model.root.scale.setScalar(r);
        v.vr = r;
        v.spinX = 0.02 + (seed % 7) * 0.008; v.spinY = 0.03 + (seed % 5) * 0.01;
        break;
      }
      case 'station': {
        // Solarflügel zeigen von der Kartenmitte weg
        const away = (e.x || e.z) ? Math.atan2(-(e.z || 0), e.x || 0) : 0;
        v.model = f.buildStation(this.faction, away);
        v.vr = Math.max(e.radius || 0, 160);
        // Leben an der Station: Verkehr, Andock-Leitlichter und Klammern, Schweißfunken, Suchscheinwerfer
        try { v.life = new StationLife(this.faction, v.model, away, f, this.quality); } catch (err) { console.warn('Stationsleben', err); v.life = null; }
        // Sichere Zone: Haarlinie mit Skala, nur nahe der Grenze deutlich
        v.zoneMat = f.mat('ringmat:safe', () => scaleRingMaterial(0xdfe8f2, SAFE_R, 0.03, 0.18, { dash: 120, focus: 420, floor: 0.2 }));
        const zone = new THREE.Mesh(f.geo('ring:safe', () => scaleRingGeometry(SAFE_R)), v.zoneMat);
        zone.position.y = 38; // Stationswurzel liegt bei −44 → Zone knapp unter der Spielebene
        zone.renderOrder = 4;
        v.model.root.add(zone);
        v.zoneOp = 0.03;
        break;
      }
      case 'portal': {
        v.model = f.buildPortal();
        v.vr = Math.max(e.radius || 0, 110);
        const ring = new THREE.Mesh(f.geo('ring:portal', () => scaleRingGeometry(PORTAL_R, 50, 20)),
          f.mat('ringmat:portal', () => scaleRingMaterial(0xd8f0ff, PORTAL_R, 0.12, 0.12)));
        ring.position.y = -4; ring.renderOrder = 4;
        v.model.root.add(ring);
        break;
      }
      case 'crate': v.model = f.buildCrate(); v.vr = 16; break;
      case 'wreck': v.model = f.buildWreck(seed); v.vr = 30; break;
      case 'ore': {
        v.model = f.buildOre(e.type, seed);
        const r = Math.max(8, e.radius || 12) * 1.1;
        v.model.root.scale.setScalar(r);
        v.vr = r;
        v.spinX = 0.1 + (seed % 7) * 0.03; v.spinY = 0.12 + (seed % 5) * 0.04;
        break;
      }
      default: {
        // unbekannte Art: schlichter Platzhalter statt Fehler
        v.model = f.buildUnknown();
        const r = Math.max(6, e.radius || 14);
        v.model.root.scale.setScalar(r);
        v.vr = r;
      }
    }
    v.root = v.model.root;
    this.entityGroup.add(v.root);
    this.views.set(e.id, v);
    return v;
  }

  // Ausdehnung (längste waagrechte Kante) eines Gegnermodells in Modelleinheiten, nur feste Rumpfteile
  // (keine additiven Leuchtteile/Flammen). Einmal je Typ gemessen und gemerkt.
  _enemyExtent(type, model) {
    const c = this._extC || (this._extC = new Map());
    const key = type + ':' + this.factory.version;
    let L = c.get(key);
    if (L) return L;
    const root = model.root;
    root.scale.setScalar(1); root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3(), tmp = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mt = Array.isArray(o.material) ? o.material[0] : o.material;
      if (mt && (mt.transparent || mt.blending === THREE.AdditiveBlending)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      bb.union(tmp);
    });
    L = bb.isEmpty() ? 2 : Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z, 0.5);
    c.set(key, L);
    return L;
  }

  _sig(e) {
    const lo = e.loadout || this.world?.profile?.loadout || {};
    return `${e.faction || ''}|${e.ship || ''}|${(lo.lasers || []).join(',')}|${(lo.gens || []).join(',')}`;
  }

  // ---------- jedes Bild: Entity-Abgleich ----------
  _sync(e) {
    let v = this.views.get(e.id);
    if (e.kind === 'player' && this._playerDirty && this._loadGLB) this._ensureMine(e);
    if (v && ((v.gk && v.ver !== this.factory.keyVer(v.gk[0], v.gk[1])) || (e.kind === 'player' && this._playerDirty && this._sig(e) !== v.sig))) {
      this._removeView(e.id); v = null;
    }
    if (!v) {
      // neue Ansichten fern der Kamera gestaffelt anlegen (höchstens wenige je Bild), nahe sofort
      if (this._viewBudget <= 0) {
        const dx = (e.x || 0) - this.camTarget.x, dz = (e.z || 0) - this.camTarget.z;
        if (dx * dx + dz * dz > 3200 * 3200 && e.kind !== 'player' && e.kind !== 'station' && e.kind !== 'portal') return;
      }
      this._viewBudget--;
      v = this._createView(e);
    }
    v.stamp = this.frame;
    const a = this._alpha, dt = this._dt, t = this.time;
    const px = e.px ?? e.x, pz = e.pz ?? e.z;
    v.rx = px + (e.x - px) * a;
    v.rz = pz + (e.z - pz) * a;
    const rot = e.rot || 0, prot = e.prot ?? rot;
    const dr = wrapAngle(rot - prot);
    v.rrot = prot + dr * a;
    const root = v.root;
    const alive = e.alive !== false;
    if (!alive) {
      // Spieler zerstört: Modell glüht noch kurz auf, dann verschluckt es die Explosion
      if (v.dieT > 0) { this._dieStep(v, dt); return; }
      root.visible = false;
      return;
    }
    // Verfolger-Kamera sieht bis zum Horizont: kleine Objekte weit weg nicht zeichnen (spart Aufrufe und Dreiecke;
    // auf 5 km ist ein Gegner kaum ein Bildpunkt). Station, Tore, Frachter und große Brocken bleiben.
    if (this._farCull && v.kind !== 'player' && v.kind !== 'station' && v.kind !== 'portal' && v.kind !== 'freighter') {
      const dx = v.rx - this._camX, dz = v.rz - this._camZ, lim = v.kind === 'asteroid' ? 9000 : 5200;
      if (dx * dx + dz * dz > lim * lim) { root.visible = false; return; }
    }
    root.visible = true;
    v.dieT = 0;
    const m = v.model;
    // Treffer-Zucken: kurzer Stoß in Einschlagrichtung, federt schnell zurück
    let fx = 0, fz = 0;
    if (v.fl > 0.002) {
      const a = v.fl * v.vr * 0.07;
      fx = v.fdx * a; fz = v.fdz * a;
      v.fl *= Math.exp(-dt * 10);
    } else v.fl = 0;
    switch (v.kind) {
      case 'player': {
        if (this._dockK > 0 || this._docking) this._dockGlide(v, dt);
        root.position.set(v.rx + fx, Math.sin(t * 1.2 + v.phase) * 1.2, v.rz + fz);
        const speed = typeof e.speed === 'number' ? e.speed : Math.hypot(e.vx || 0, e.vz || 0);
        const n = Math.min(1.3, speed / v.maxSpeed);
        // Schub 0..1 von der Simulation (langsames Hochbeschleunigen); fehlt er, aus der Tempoänderung geschätzt
        v.nLag = v.nLag === undefined ? n : v.nLag + (n - v.nLag) * (1 - Math.exp(-dt * 2.5));
        const est = Math.max(0, Math.min(1, (n - v.nLag) * 3));
        const thr = typeof e.thrust === 'number' ? Math.max(0, Math.min(1, e.thrust)) : Math.min(1, est + n * 0.6);
        v.thr = v.thr === undefined ? thr : v.thr + (thr - v.thr) * (1 - Math.exp(-dt * 8));
        const surge = Math.max(est, Math.max(0, v.thr - n) * 0.8);
        // ---- Fluggefühl: Gewicht und Wucht ----
        // Drehrate (rad/s) geglättet; Beschleunigung aus dem Tempo
        const rate = dt > 0 ? (dr * 60) : 0;
        v.yawRate = v.yawRate === undefined ? rate : v.yawRate + (rate - v.yawRate) * (1 - Math.exp(-dt * 9));
        if (v.lastSpd === undefined) v.lastSpd = speed;
        const acc = dt > 0 ? (speed - v.lastSpd) / dt : 0;
        v.lastSpd = speed;
        v.acc = (v.acc || 0) + (acc - (v.acc || 0)) * (1 - Math.exp(-dt * 5));
        v.nSpd = n;
        // Schräglage bis ≈ 30° in Kurven (Feder mit leichtem Überschwingen: das Schiff „legt sich hinein“).
        // Liefert die Simulation bank/pitch/turnRate (world.js _flightFeel), gelten deren Werte als Ziel.
        if (typeof e.turnRate === 'number') v.yawRate = e.turnRate;
        const bankT = typeof e.bank === 'number' ? e.bank : Math.max(-0.52, Math.min(0.52, v.yawRate * 0.36 * (0.3 + 0.7 * Math.min(1, n * 1.3))));
        v.bankV = (v.bankV || 0) + (49 * (bankT - v.bank) - 2 * 0.62 * 7 * (v.bankV || 0)) * dt;
        v.bank += v.bankV * dt;
        // Nicken: Nase hebt sich beim Beschleunigen, taucht beim Bremsen
        const ak = Math.max(-1.2, Math.min(1, v.acc / (v.maxSpeed * 0.45)));
        const pitchT = typeof e.pitch === 'number' ? e.pitch : ak > 0 ? ak * 0.065 : ak * 0.08;
        v.pitch = (v.pitch || 0) + (pitchT - (v.pitch || 0)) * (1 - Math.exp(-dt * 4));
        // Nachdriften: die Nase dreht etwas weiter in die Kurve, als die Bahn folgt
        const lead = Math.max(-0.1, Math.min(0.1, v.yawRate * 0.065));
        root.rotation.y = v.rrot + lead;
        root.rotation.x = -v.fl * 0.08;
        m.bank.rotation.z = v.bank;
        m.bank.rotation.x = v.pitch - n * 0.02;
        // Rückstoß der Laser schiebt das ganze Schiff kurz zurück
        v.recoil *= Math.exp(-dt * 9);
        m.bank.position.z = v.recoil * 1.6;
        v.boostCd = Math.max(0, (v.boostCd || 0) - dt);
        const boost = surge > 0.45 && v.boostCd <= 0;
        if (boost) v.boostCd = 1.2;
        // Nachbrenner: bei vollem Schub (≥ 0,9, also beim Hochbeschleunigen) pulsiert die Düse
        const rawThr = typeof e.thrust === 'number' ? e.thrust : thr;
        const abW = rawThr > 0.9 ? Math.min(1, (rawThr - 0.9) * 10) : 0;
        v.ab = (v.ab || 0) + (abW - (v.ab || 0)) * (1 - Math.exp(-dt * (abW > (v.ab || 0) ? 6 : 3)));
        const ab = v.ab, pulse = 0.5 + 0.5 * Math.sin(t * 17 + v.phase);
        // Steuerdüsen: Gasstöße an den Seiten beim Drehen, vorn beim harten Bremsen
        if (this.quality >= 1 && dt > 0) this._rcs(v, e, dt, ak);
        root.updateMatrixWorld(true);
        const pk = Math.max(n, v.thr * 0.85);
        let hx = 0, hy = 0, hz = 0, hn = 0, main = 0, ms = 0;
        for (let i = 0; i < m.engines.length; i++) if (m.engines[i].size >= 0.9) main++;
        const E = this._engP || (this._engP = new Float32Array(24));
        for (let i = 0; i < m.engines.length; i++) {
          const en = m.engines[i], s = en.size;
          const w = (4.4 + pk * 2.2 + surge * 1.8) * s * (1 + 0.12 * ab);
          en.trail.scale.set(w, w, (5 + pk * 40 + surge * 20 + ab * (10 + 12 * pulse)) * s);
          // Flamme pulsiert mit dem Schub (schnelles Flackern, Stärke an den Schub gekoppelt)
          const fl = 1 + v.thr * (0.07 * Math.sin(t * 31 + i * 2.1) + 0.05 * Math.sin(t * 47.3 + i));
          en.glow.scale.setScalar((4.6 + pk * 3 + surge * 3.5 + Math.sin(t * 27 + i * 1.7) * 0.35) * s * (1 + ab * (0.18 + 0.32 * pulse)) * fl);
          en.hp.getWorldPosition(_v);
          if (boost) this.effects.boost(_v.x, _v.y, _v.z, s, m.plumeHex ?? v.shieldColor);
          // Hauptdüsen sammeln: ein gemeinsames Band (zwei Strahlen, die verschmelzen)
          if ((s >= 0.9 || !main) && hn < 8) {
            E[hn * 3] = _v.x; E[hn * 3 + 1] = _v.y; E[hn * 3 + 2] = _v.z;
            hx += _v.x; hy += _v.y; hz += _v.z; hn++; ms = Math.max(ms, s);
          }
        }
        if (hn) {
          hx /= hn; hy /= hn; hz /= hn;
          let sep = 0;
          for (let k = 0; k < hn; k++) sep = Math.max(sep, Math.hypot(E[k * 3] - hx, E[k * 3 + 2] - hz));
          // Länge ans Tempo gekoppelt: bei Höchsttempo ≈ 0,8 s ≈ 250 m, im Stand nur ein kurzer Stummel
          const nn = Math.min(1, n);
          const k = (Math.min(1, n * 1.15) * (0.55 + 0.45 * v.thr) + v.thr * 0.2) * (1 + ab * 0.22 * pulse);
          // bei hohem Tempo deutlich länger (Tempo-Gefühl), im Stand ein kurzer Stummel
          const life = 0.1 + 0.56 * Math.pow(nn, 1.1) + 0.22 * Math.pow(nn, 3) + v.thr * 0.1 + ab * 0.08;
          this.trails.feed('player:0', hx, hy - 1, hz, Math.min(1.25, k), 3.8 * ms * (0.8 + 0.4 * v.thr), life, v.trailCol, 1, sep);
          // Funken an der Düse (bei Schub), dichter mit Nachbrenner
          const sr = (v.thr > 0.35 ? (v.thr - 0.35) * 30 : 0) + ab * 26;
          v.spkAcc = (v.spkAcc || 0) + dt * sr * this.effects.density;
          const col = v.trailCol, bx = Math.sin(v.rrot), bz = Math.cos(v.rrot);
          while (v.spkAcc >= 1 && hn) {
            v.spkAcc -= 1;
            const j = (Math.random() * hn) | 0;
            const sp = 60 + Math.random() * 140, lat = (Math.random() - 0.5) * 70;
            this.effects.sparks.emit(E[j * 3], E[j * 3 + 1], E[j * 3 + 2], bx * sp + bz * lat, (Math.random() - 0.5) * 30, bz * sp - bx * lat,
              1.4 + col.r, 1.1 + col.g, 0.9 + col.b, 0.1 + Math.random() * 0.18, 2.5, 0.025);
          }
        }
        // Hitzeflimmern hinter den Düsen (Kamera-Durchgang verzerrt den Bereich leicht), stärker mit Nachbrenner
        if (hn) { v.hx = hx; v.hz = hz; v.heat = Math.min(1, v.thr * 0.9 + n * 0.35 + ab * 0.3); } else v.heat = 0;
        for (let i = 0; i < m.lasers.length; i++) {
          const L = m.lasers[i];
          if (L.heat > 0) L.heat = Math.max(0, L.heat - dt * 5);
          L.flash.scale.setScalar(2.2 + L.heat * L.heat * 18);
          if (L.part) L.part.position.z = L.z0 + L.heat * L.heat * 2.2;
        }
        // feine Triebwerkspartikel und Hitzeschimmer an der Düse
        if ((n > 0.1 || v.thr > 0.2) && m.engines.length) {
          v.engAcc += dt * (22 + 34 * v.thr) * Math.max(n, v.thr) * this.effects.density;
          const P = this.effects.glowP;
          const col = v.trailCol;
          while (v.engAcc >= 1) {
            v.engAcc -= 1;
            const en = m.engines[(Math.random() * Math.min(2, m.engines.length)) | 0];
            en.hp.getWorldPosition(_v);
            // kurzer Hitzedunst direkt hinter der Düse (keine langen Perlenketten entlang des Schweifs)
            const bx = Math.sin(v.rrot) * 70, bz = Math.cos(v.rrot) * 70;
            P.emit(_v.x, _v.y, _v.z, bx + (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 14, bz + (Math.random() - 0.5) * 60,
              col.r * 0.6 + 0.2, col.g * 0.6 + 0.2, col.b * 0.6 + 0.2, 0.6, 5 * en.size, 9 * en.size, 0.1 + Math.random() * 0.14, 3);
          }
        }
        break;
      }
      case 'enemy': {
        if (typeof e.stagger === 'number' && e.stagger > v.fl * 0.8) {
          // Taumeln aus der Simulation: Richtung vom letzten Treffer, sonst seitlich
          if (!v.fdx && !v.fdz) { v.fdx = Math.cos(v.phase); v.fdz = Math.sin(v.phase); }
          v.fl = Math.min(1.6, e.stagger * 1.25);
        }
        if (v.aura) v.aura.scale.setScalar(v.auraS * (1 + Math.sin(t * (v.auraK > 0.8 ? 4.2 : 2.2) + v.phase) * 0.08));
        if (m.pods) { this._nestAnim(v, m, t, fx, fz); break; }
        root.position.set(v.rx + fx, 2 + Math.sin(t * 1.5 + v.phase) * 2, v.rz + fz);
        root.rotation.y = v.rrot;
        root.rotation.x = -v.fl * 0.12;
        // dezenter Schweif hinter Gegnern in Bildnähe
        {
          const sp = Math.hypot(e.vx || 0, e.vz || 0) / v.maxSpeed;
          if (sp > 0.06) {
            const ddx = v.rx - this.camTarget.x, ddz = v.rz - this.camTarget.z;
            if (ddx * ddx + ddz * ddz < 2600 * 2600) {
              const back = v.vr * (m.swarm ? 0.35 : 0.55);
              const k = Math.min(1, sp);
              this.trails.feed(e.id, v.rx + Math.sin(v.rrot) * back, root.position.y - 2, v.rz + Math.cos(v.rrot) * back,
                k, v.vr * (m.swarm ? 0.13 : 0.15), 0.08 + (m.swarm ? 0.25 : 0.4) * k, v.trailCol, m.swarm ? 0.22 : 0.6);
            }
          }
        }
        const tb = typeof e.bank === 'number' ? e.bank : Math.max(-0.5, Math.min(0.5, dr * 60 * 0.15));
        v.bank += (tb - v.bank) * (1 - Math.exp(-dt * 4));
        if (m.swarm) {
          const p = 1 + Math.sin(t * 3.4 + v.phase) * 0.07;
          m.spin.scale.set(p, 1 + Math.sin(t * 3.4 + v.phase + 1.2) * 0.05, 2 - p);
          if (e.type === 'spiker') m.spin.rotation.y = t * 0.7 + v.phase;
          else m.spin.rotation.z = v.bank * 0.5;
          m.glow.scale.setScalar(1.5 + Math.sin(t * 5 + v.phase) * 0.3);
        } else {
          m.spin.rotation.z = v.bank;
          m.glow.scale.setScalar(1.1 + Math.sin(t * 9 + v.phase) * 0.12);
        }
        break;
      }
      case 'crate':
        root.position.set(v.rx, 8 + Math.sin(t * 2 + v.phase) * 3, v.rz);
        m.spin.rotation.set(0.45 + Math.sin(t * 0.7 + v.phase) * 0.2, t * 0.9 + v.phase, 0.3);
        m.glow.scale.setScalar(22 + Math.sin(t * 3 + v.phase) * 4);
        break;
      case 'wreck':
        root.position.set(v.rx, 0, v.rz);
        m.spin.rotation.y = v.phase + t * 0.08;
        m.glow.scale.setScalar(20 + Math.sin(t * 4 + v.phase) * 3);
        break;
      case 'ore':
        root.position.set(v.rx, 0, v.rz);
        m.spin.rotation.set(t * v.spinX + v.phase, t * v.spinY, v.phase * 0.5);
        break;
      case 'station': {
        root.position.set(v.rx, -44, v.rz);
        if (m.spin) m.spin.rotation.y = t * (m.spinRate ?? 0.035);
        if (v.life) v.life.update(dt, t, v, this.world, this);
        if (this._shadowOn && (!this._shadowAt || this._shadowAt.distanceToSquared(root.position) > 1)) this._placeShadow(root.position);
        // Zone nur nahe der Grenze einblenden (Abstand Spieler zum Rand < 300 m)
        const P = this.world?.player;
        let want = 0.02;
        if (P && P.alive !== false) {
          const edge = Math.abs(Math.hypot((P.x || 0) - v.rx, (P.z || 0) - v.rz) - SAFE_R);
          const k = Math.max(0, 1 - edge / 300);
          want = 0.02 + 0.16 * k * k * (3 - 2 * k);
        }
        v.zoneOp += (want - v.zoneOp) * (1 - Math.exp(-dt * 4));
        v.zoneMat.uniforms.uOpacity.value = v.zoneOp;
        if (P) v.zoneMat.uniforms.uFocus.value.set((P.x || 0) - v.rx, (P.z || 0) - v.rz);
        break;
      }
      case 'portal': {
        root.position.set(v.rx, 0, v.rz);
        const d2 = (v.rx - this.camTarget.x) ** 2 + (v.rz - this.camTarget.z) ** 2;
        if (d2 < this._lensD2) { this._lensD2 = d2; this._lensV = v; }
        m.spin.rotation.y = t * 0.12;
        m.outer.rotation.y = -t * 0.05;
        if (m.layers) for (let i = 0; i < m.layers.length; i++) m.layers[i].rotation.y = t * (0.1 + i * 0.07) * (i & 1 ? -1 : 1);
        break;
      }
      case 'freighter': {
        root.position.set(v.rx + fx, -6, v.rz + fz);
        root.rotation.y = v.rrot;
        const tb = Math.max(-0.25, Math.min(0.25, dr * 60 * 0.3));
        v.bank += (tb - v.bank) * (1 - Math.exp(-dt * 2));
        m.spin.rotation.z = v.bank;
        const spd = typeof e.speed === 'number' ? e.speed : Math.hypot(e.vx || 0, e.vz || 0);
        const sp = Math.min(1.2, Math.max(spd / v.maxSpeed, typeof e.thrust === 'number' ? e.thrust * 0.8 : 0));
        if (m.engines) {
          root.updateMatrixWorld(true);
          for (let i = 0; i < m.engines.length; i++) {
            const en = m.engines[i];
            en.trail.scale.set(9 + sp * 4, 9 + sp * 4, 18 + sp * 70);
            en.glow.scale.setScalar(14 + sp * 6 + Math.sin(t * 23 + i) * 0.6);
            if (sp > 0.05) {
              en.hp.getWorldPosition(_v);
              this.trails.feed(v.tkeys[i % 3], _v.x, _v.y, _v.z, Math.min(1, sp), 5 * v.sc, 0.3 + sp * 1.1, v.trailCol, 0.55);
            }
          }
        }
        break;
      }
      case 'nest':
        this._nestAnim(v, m, t, fx, fz);
        break;
      case 'asteroid': {
        root.position.set(v.rx + fx, -10, v.rz + fz);
        const sp = typeof e.spin === 'number' ? e.spin : v.spinY;
        m.spin.rotation.set(v.phase + t * sp * 0.35, (e.rot || 0) + t * sp, v.phase * 0.5);
        break;
      }
      default:
        root.position.set(v.rx + fx, 0, v.rz + fz);
        if (m.spin) m.spin.rotation.y = t * 0.6;
    }
  }

  // Nest: langsames Atmen, Eiersäcke pulsieren versetzt, Treffer lassen es zusammenzucken
  _nestAnim(v, m, t, fx, fz) {
    v.root.position.set(v.rx + fx, -4, v.rz + fz);
    const br = 1 + Math.sin(t * 1.6 + v.phase) * 0.035 - v.fl * 0.05;
    m.spin.scale.set(br, 1 + Math.sin(t * 1.6 + v.phase + 1.1) * 0.05, br);
    m.spin.rotation.y = v.phase + t * 0.05;
    if (m.pods) for (let i = 0; i < m.pods.length; i++) {
      const pd = m.pods[i], s0 = pd.userData.s0, k = 1 + 0.18 * Math.sin(t * 2.6 + pd.userData.ph);
      pd.scale.set(s0 * k, s0 * 1.3 * k, s0 * k);
    }
    if (m.glow) m.glow.scale.setScalar(2.4 + Math.sin(t * 2.2 + v.phase) * 0.5);
  }

  // ---------- Zerstörung: Modell glüht und zittert ≈ 0,33 s, dann übernimmt die Explosion ----------
  _startDying(p) {
    const id = p && p.id;
    if (id === undefined || id === null) return;
    const v = this.views.get(id);
    if (!v || !v.root.visible) return;
    v.dieT = 0.33; v.dieX = v.root.position.x; v.dieY = v.root.position.y; v.dieZ = v.root.position.z;
    if (v.kind === 'player') return; // Spieleransicht bleibt in der Liste (wird nicht entfernt)
    this.views.delete(id);
    this.dying.push(v);
  }
  _dieStep(v, dt) {
    v.dieT -= dt;
    const root = v.root;
    if (v.dieT <= 0) { root.visible = false; return false; }
    const k = 1 - v.dieT / 0.33;
    const j = v.vr * (0.03 + 0.08 * k);
    root.visible = true;
    root.position.set(v.dieX + (Math.random() - 0.5) * j, v.dieY + (Math.random() - 0.5) * j * 0.5, v.dieZ + (Math.random() - 0.5) * j);
    root.rotation.x = (Math.random() - 0.5) * 0.12 * k;
    root.rotation.z = (Math.random() - 0.5) * 0.12 * k;
    return true;
  }
  _clearDying() {
    for (let i = 0; i < this.dying.length; i++) this.entityGroup.remove(this.dying[i].root);
    this.dying.length = 0;
  }
  _updateDying(dt) {
    let i = 0;
    while (i < this.dying.length) {
      const v = this.dying[i];
      if (!this._dieStep(v, dt)) {
        this.entityGroup.remove(v.root);
        const last = this.dying.length - 1;
        if (i < last) this.dying[i] = this.dying[last];
        this.dying.length = last;
        continue;
      }
      i++;
    }
  }

  // Treffer an einer Ansicht: kurzes Zucken in Richtung (dx, dz), Stärke amt
  flinch(id, dx, dz, amt = 1) {
    const v = this.views.get(id);
    if (!v) return;
    const L = Math.hypot(dx, dz) || 1;
    v.fdx = dx / L; v.fdz = dz / L;
    v.fl = Math.min(1.6, v.fl + amt);
  }
  // Laser des Spielers hat gefeuert: Rückstoß
  recoil(id, amt = 0.6) { const v = this.views.get(id); if (v) v.recoil = Math.min(1.2, v.recoil + amt); }

  // Steuerdüsen: kurze Gasstöße. Linkskurve (Drehrate > 0): vorn rechts nach außen, hinten links nach außen.
  // Hartes Bremsen: Gegenschub vorn beidseitig nach vorn. Kosten: wenige Teilchen je Sekunde.
  _rcs(v, e, dt, ak) {
    const yr = v.yawRate, ay = Math.abs(yr);
    const turning = ay > 0.28;
    const braking = ak < -0.3 && (v.nSpd || 0) > 0.08;
    if (!turning && !braking) { v.rcsAcc = 0; return; }
    v.rcsAcc = (v.rcsAcc || 0) + dt * (turning ? 10 + 22 * Math.min(1, ay / 1.6) : 14) * this.effects.density;
    if (v.rcsAcc < 1) return;
    const a = v.root.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
    const r = v.vr, P = this.effects.glowP, y = v.root.position.y;
    const evx = e.vx || 0, evz = e.vz || 0;
    // lokale Achsen in der Welt: x = (cos, −sin), z = (sin, cos); Bug = −z
    const puff = (lx, lz, dx, dz, k) => {
      const wx = v.rx + lx * ca + lz * sa, wz = v.rz - lx * sa + lz * ca;
      const vx = dx * ca + dz * sa, vz = -dx * sa + dz * ca;
      const sp = 70 + Math.random() * 50;
      P.emit(wx, y, wz, evx + vx * sp, (Math.random() - 0.5) * 10, evz + vz * sp,
        0.55 * k, 0.62 * k, 0.75 * k, 0.55, r * 0.05, r * 0.32, 0.2 + Math.random() * 0.14, 5);
      this.effects.sparks.emit(wx, y, wz, evx + vx * sp * 2.2, 0, evz + vz * sp * 2.2, 1.6, 1.8, 2.2, 0.06, 4, 0.012);
    };
    while (v.rcsAcc >= 1) {
      v.rcsAcc -= 1;
      if (turning) {
        const s = yr > 0 ? 1 : -1;
        puff(s * r * 0.5, -r * 0.72, s, 0, 1);
        puff(-s * r * 0.5, r * 0.55, -s, 0, 0.8);
      } else {
        puff(r * 0.36, -r * 0.82, 0.25, -1, 0.9);
        puff(-r * 0.36, -r * 0.82, -0.25, -1, 0.9);
      }
    }
  }

  // Andocken: Ansicht gleitet zum Andockpunkt der Station (Leitlichter, Klammern greifen), beim Abdocken zurück
  // zur Position der Simulation. Nur Optik; die Kamera folgt der Ansicht.
  _dockGlide(v, dt) {
    const st = this._stationView();
    const port = st && st.life && st.life.portWorld(st, _cp);
    if (!port) { this._dockK = 0; this._docking = 0; return; }
    this._dockT = (this._dockT || 0) + dt;
    const dur = this._docking > 0 ? 2.6 : 2.0;
    if (this._docking > 0) this._dockK = Math.min(1, this._dockT / dur);
    else if (this._docking < 0) { this._dockK = Math.max(0, 1 - this._dockT / dur); if (this._dockK <= 0) this._docking = 0; }
    const k = this._dockK;
    if (k <= 0) return;
    const sk = k * k * (3 - 2 * k);
    v.rx += (port.x - v.rx) * sk; v.rz += (port.z - v.rz) * sk;
    v.rrot += wrapAngle(st.life.portRot - v.rrot) * sk;
  }
  _stationView() {
    let sv = this._stView;
    if (sv && this.views.get(sv.id) === sv) return sv;
    sv = null;
    this.views.forEach((v) => { if (v.kind === 'station') sv = v; });
    this._stView = sv;
    return sv;
  }

  // Zerstörung je Typ: Piraten metallisch (Trümmer, Feuer), Schwarm grüner Schleim (Fetzen, Säurenebel)
  _onExplode(p) {
    if (!p) return;
    const v = p.id !== undefined && p.id !== null ? this.views.get(p.id) : null;
    let style = 'metal';
    const src = v || (p.id !== undefined && p.id !== null ? this.entity(p.id) : null); // Ansicht evtl. noch nicht angelegt
    if (src) {
      if (src.kind === 'enemy') style = src.type === 'nest' || ENEMIES[src.type]?.group === 'swarm' ? 'swarm' : 'metal';
      else if (src.kind === 'nest') style = 'swarm';
      else if (src.kind === 'player') style = 'ship';
    }
    this._startDying(p);
    this.effects.explode(p, style);
    this.tele.drop(p.id);
    // Druckwelle an der Kamera (nur nahe Explosionen, trifft nach Laufzeit ein)
    const P = this.world?.player;
    if (P && P.alive !== false && p.id !== P.id) {
      const dx = (P.x || 0) - (p.x || 0), dz = (P.z || 0) - (p.z || 0);
      this.rig.wave(dx, dz, Math.hypot(dx, dz), p.size || 1);
    }
  }
  // Treffer am eigenen Schiff: kurzer Kamerastoß in Trefferrichtung (Stärke nach Schadensanteil)
  _onDamage(p) {
    const P = this.world?.player;
    if (!p || !P || p.id !== P.id) return;
    const dmg = (p.hull || 0) + (p.shield || 0);
    const max = (P.hpMax || 1000) + (P.shieldMax || 0);
    const amt = Math.max(0.18, Math.min(1, dmg / (max * 0.05)));
    let dx = p.dx, dz = p.dz;
    if (!(typeof dx === 'number' && typeof dz === 'number') || (!dx && !dz)) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; }
    this.rig.hit(dx, dz, amt * (p.crit ? 1.3 : 1));
  }
  /** Taste V: Kamera wechseln (Taktisch ↔ Verfolger), Wahl wird gespeichert */
  toggleCamera() { return this.rig.toggle(); }
  get cameraMode() { return this.rig.mode; }
  /** Verfolger-Kamera zu mehr als der Hälfte eingeblendet */
  get chaseActive() { return this.rig.mode === 'chase' && this.rig.k > 0.5; }

  // Freier Bildbereich aus den HUD-Fenstern (alle 0,5 s gemessen, sonst zwischengespeichert)
  // Freie Bildfläche ohne HUD-Fenster: Ränder (top/bottom/left/right) für den Bildmittelpunkt und dazu jedes
  // Fenster als Rechteck (rects: x0, y0, x1, y1 in Canvas-Pixeln), damit Spieler und Ziel auch nicht unter
  // Eckfenstern (Funk links unten, Karte rechts unten, Ziel/Auftrag rechts oben) landen. Höchstens alle 0,5 s gemessen.
  _hudFree() {
    const f = this._hf || (this._hf = { top: 80, bottom: 170, left: 0, right: 0, t: -1e9, rects: new Float32Array(64), n: 0 });
    const now = performance.now();
    if (now - f.t < 500 || typeof document === 'undefined') return f;
    f.t = now;
    const Wd = this.rect.width, H = this.rect.height, ox = this.rect.left, oy = this.rect.top;
    const list = document.querySelectorAll('#hud [data-win]');
    if (!list.length) { f.top = 40; f.bottom = 0; f.left = 0; f.right = 0; f.n = 0; return f; }
    // Fenster noch nicht platziert (HUD-Startphase: alle liegen bei 0,0) → alte Werte behalten, bald neu messen
    if (list.length > 1) {
      const a = list[0].getBoundingClientRect(), b = list[1].getBoundingClientRect();
      if (a.left - ox < 1 && a.top - oy < 1 && b.left - ox < 1 && b.top - oy < 1) { f.t = now - 400; return f; }
    }
    f.n = 0;
    let top = 40, bottom = 0, left = 0, right = 0;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const l = r.left - ox, t = r.top - oy, rr = r.right - ox, b = r.bottom - oy;
      if (f.n < 16) { const k = f.n * 4; f.rects[k] = l; f.rects[k + 1] = t; f.rects[k + 2] = rr; f.rects[k + 3] = b; f.n++; }
      if (rr > Wd * 0.3 && l < Wd * 0.7) {
        if (t > H * 0.5) bottom = Math.max(bottom, H - t);
        else if (b < H * 0.5) top = Math.max(top, b);
      } else if (b > H * 0.25 && t < H * 0.75) {
        if (rr < Wd * 0.5) left = Math.max(left, rr);
        else if (l > Wd * 0.5) right = Math.max(right, Wd - l);
      }
    }
    f.top = Math.min(top, H * 0.35); f.bottom = Math.min(bottom, H * 0.35);
    f.left = Math.min(left, Wd * 0.3); f.right = Math.min(right, Wd * 0.3);
    return f;
  }

  // Kampf-Rahmung: Kameraziel (cx, cz) und Abstand d, so dass Spieler und Ziel (mit Radius) im freien Bereich
  // liegen und keins unter einem HUD-Fenster. Der Ankerpunkt liegt höchstens `frac` (≈ 30 %) vom Spieler zum Ziel
  // hin und sitzt in der Mitte des freien Bereichs; passt das Ziel nicht, wird leicht herausgezoomt (Bisektion),
  // statt den Spieler an den Rand zu schieben.
  _frame(px, pz, pr, ex, ez, er, HF, frac = 0.5) {
    const o = this._fr || (this._fr = { cx: 0, cz: 0, d: 0 });
    const Wd = Math.max(1, this.rect.width), H = Math.max(1, this.rect.height), asp = Wd / H;
    // Ränder knapp halten (HUD-Fenster selbst werden einzeln geprüft), damit nur wenig herausgezoomt werden muss
    const m = 24;
    const x0 = HF.left + m, x1 = Wd - HF.right - m, y0 = HF.top + m, y1 = H - HF.bottom - 30;
    // NDC: x nach rechts, y nach oben
    const nx0 = x0 / Wd * 2 - 1, nx1 = x1 / Wd * 2 - 1, ny0 = 1 - y1 / H * 2, ny1 = 1 - y0 / H * 2;
    const cxn = (nx0 + nx1) / 2, cyn = (ny0 + ny1) / 2;
    const mx = px + (ex - px) * frac, mz = pz + (ez - pz) * frac;
    const R = HF.rects, RN = HF.n, pad = 14;
    const fits = (d) => {
      const dzc = cyn * TAN_H * d / (cyn * TAN_H * COS_P - SIN_P);
      const dxc = cxn * (d - dzc * COS_P) * TAN_H * asp;
      const cx = mx - dxc, cz = mz - dzc;
      for (let k = 0; k < 2; k++) {
        const qx = (k ? ex : px) - cx, qz = (k ? ez : pz) - cz, r = k ? er : pr;
        // Bildschirm-Hüllrechteck des Objekts (Pixel)
        let sx0 = 1e9, sx1 = -1e9, sy0 = 1e9, sy1 = -1e9;
        for (let s = -1; s <= 1; s += 2) {
          const dz = qz + s * r;
          const depth = d - dz * COS_P;
          if (depth < 20) return false;
          const y = -dz * SIN_P / (depth * TAN_H);
          if (y < ny0 || y > ny1) return false;
          const dxl = (qx + s * r) / (depth * TAN_H * asp);
          if (dxl < nx0 || dxl > nx1) return false;
          const X = (dxl + 1) * 0.5 * Wd, Y = (1 - y) * 0.5 * H;
          if (X < sx0) sx0 = X; if (X > sx1) sx1 = X; if (Y < sy0) sy0 = Y; if (Y > sy1) sy1 = Y;
        }
        for (let j = 0; j < RN; j++) {
          const b = j * 4;
          if (sx1 > R[b] - pad && sx0 < R[b + 2] + pad && sy1 > R[b + 1] - pad && sy0 < R[b + 3] + pad) return false;
        }
      }
      o.cx = cx; o.cz = cz;
      return true;
    };
    let lo = this.targetDist, hi = ZOOM_MAX;
    if (fits(lo)) { o.d = lo; return o; }
    if (!fits(hi)) { o.d = hi; const dzc = cyn * TAN_H * hi / (cyn * TAN_H * COS_P - SIN_P); o.cx = mx - cxn * (hi - dzc * COS_P) * TAN_H * asp; o.cz = mz - dzc; return o; }
    for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    fits(hi); o.d = hi;
    return o;
  }

  // Schattenkarte um die Station: Licht aus Sonnenrichtung, Ziel = Station, einmal neu zeichnen
  _placeShadow(pos) {
    const L = this.lights.sun;
    this._shadowAt = (this._shadowAt || new THREE.Vector3()).copy(pos);
    L.target.position.copy(pos);
    L.position.copy(this.env.sunDir).multiplyScalar(1600).add(pos);
    L.target.updateMatrixWorld(); L.updateMatrixWorld();
    L.castShadow = !!this._shadowOn;
    L.shadow.camera.updateProjectionMatrix();
    this.gl.shadowMap.needsUpdate = true;
  }

  // ---------- Hilfen für Effekte / HUD ----------
  entity(id) { return this.world?.entities?.get(id) || null; }
  getPos(id, out) {
    const v = this.views.get(id);
    if (!v) return false;
    out.set(v.rx, v.kind === 'crate' ? v.root.position.y : 4, v.rz);
    return true;
  }
  getRadius(id) { const v = this.views.get(id); return v ? (this.entity(id)?.radius || v.vr) : 0; }
  visualRadius(id) { const v = this.views.get(id); return v ? v.vr : 0; }
  playerShieldColor() { const v = this.views.get(this.world?.player?.id ?? 'player'); return v?.shieldColor ?? SHIELD_COLOR; }
  playerPos(out) {
    const id = this.world?.player?.id ?? 'player';
    const v = this.views.get(id);
    if (!v || !v.root.visible) return null;
    out.set(v.rx, 4, v.rz);
    return out;
  }
  getMuzzle(id, laser, out, slot = -1) {
    if (typeof id === 'string' && id.charCodeAt(0) === 100 && id.startsWith('dr:')) return this.drones.muzzle(id.slice(3), out);
    const v = this.views.get(id);
    if (!v) return false;
    const L = v.model?.lasers;
    if (L && L.length) {
      let pick = -1;
      // Laserplatz aus der Simulation (idx), sonst reihum
      if (slot >= 0) for (let k = 0; k < L.length; k++) if (L[k].slot === slot) { pick = k; break; }
      if (pick < 0) for (let k = 0; k < L.length; k++) {
        const i = (v.nextLaser + k) % L.length;
        if (!laser || L[i].key === laser) { pick = i; break; }
      }
      if (pick < 0) pick = v.nextLaser % L.length;
      v.nextLaser = pick + 1;
      L[pick].muzzle.getWorldPosition(out);
      L[pick].heat = 1;
      if (v.kind === 'player') v.recoil = Math.min(1.2, v.recoil + 0.35);
      return true;
    }
    const r = v.vr * 0.8;
    out.set(v.rx - Math.sin(v.rrot) * r, 4, v.rz - Math.cos(v.rrot) * r);
    return true;
  }
  shake(a) { this.rig.shake(a); }
  // Meter pro Bildschirmpixel in der Bildmitte (für Effekte mit Mindestgröße am Bildschirm)
  metersPerPixel() { return (2 * this._viewD * this._tanH) / Math.max(1, this.rect.height); }
  _updatePointScale() {
    const pr = this.gl.getPixelRatio(), h = this.rect.height;
    this._pointScale = (h * pr) / (2 * this._tanH);
    this.effects.setPointScale(this._pointScale, pr);
    this.factory.uPointScale.value = this._pointScale;
    this.speedDust.setPointScale(this._pointScale);
  }

  /** Alle Schiffsmodelle laden (Hangar-Vorschau, Test-Pilot-Modellprüfung). Im Flug lädt nur das eigene Schiff. */
  loadAllModels() {
    if (!this._loadGLB) return;
    let i = 0;
    for (const [key, url] of MODELS) if (!this.factory.glb.has(key)) setTimeout(() => this._loadGLB(key, url), 200 * i++);
  }
  /** Schiff gewechselt (Kauf): dessen Modell laden, falls noch nicht da */
  _ensureMine(e) {
    const fac = e.faction || this.world?.profile?.faction || this.faction, sh = e.ship || this.world?.profile?.ship || 's1';
    const key = `ship:${sh}:${fac}`;
    if (key === this._mineKey) return;
    this._mineKey = key; this._mineUrl = MODEL_URL.get(key) || null;
    if (this._mineUrl && !this.factory.glb.has(key) && this._loadGLB) this._loadGLB(key, this._mineUrl);
  }
  /** Eigenes Schiff fertig (echtes Modell geladen und vorbereitet oder keins vorhanden) */
  _mineReady() {
    const D = this.world?.drones;
    if (D && D.length && !this.drones._compiled) return false;
    if (!this._mineUrl) return true;
    return (this.factory.glbKeyVers[this._mineKey] || 0) > 0;
  }
  _introStep() {
    const I = this._intro;
    if (I.done) return;
    const el = performance.now() - I.t0;
    if ((this._mineReady() && !this._hold && this.frame > 2) || el > 2500) {
      I.done = true;
      this.canvas.style.opacity = '1';
      this._snap = true; // Kamera direkt am Schiff (kein Heranfahren aus dem Aufbau)
    }
  }

  // ---------- Bild ----------
  render(dt, alpha = 1) {
    if (!(dt >= 0) || dt > 0.25) dt = 0.016;
    const _t0 = performance.now();
    this._adapt(dt);
    // Einstellungen gelegentlich prüfen (Qualitätsstufe umgestellt): vor dem Abgleich neu aufbauen
    const nowMs = performance.now();
    if (nowMs - this._qCheck > 1000) {
      this._qCheck = nowMs;
      this.rig.refresh(); // Kamerawahl, „Kamerawackeln aus“, „Bewegung reduzieren“
      const q = this._wantQuality();
      if (q !== this.quality) {
        this.quality = q; this._applyQuality();
        this.scale = Math.min(this.scale, 1); this._perf.lowCount = 0;
        if (this.world) this.setWorld(this.world);
      }
    }
    this.time += dt;
    this.frame++;
    this._dt = dt;
    this._alpha = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    this.factory.uTime.value = this.time;
    const W = this.world;

    this._lensD2 = Infinity; this._lensV = null;
    this._viewBudget = 5;
    this._farCull = this.rig.k > 0.5;
    this._camX = this.camera.position.x; this._camZ = this.camera.position.z;
    if (W && W.entities) {
      W.entities.forEach(this._syncCb);
      this.views.forEach(this._staleCb);
      this._playerDirty = false;
    }
    if (this.dying.length) this._updateDying(dt);

    // Kamera folgt dem Spieler weich. Im Kampf: Spieler und Ziel gemeinsam im freien Bildbereich, der aus den
    // echten HUD-Fenstern gemessen wird (Waffenleiste unten, Karte und Ziel seitlich). Reicht der Platz nicht,
    // wird herausgezoomt; der Spieler bleibt immer mindestens 60 px über der Waffenleiste.
    const pv = W?.player ? this.views.get(W.player.id) : null;
    this.drones.update(dt, W, pv, this.time);
    let wantDist = this.targetDist;
    const HF = this._hudFree();
    if (pv) {
      const e = W.player;
      const ctid = e.targetId;
      const cv = ctid !== null && ctid !== undefined ? this.views.get(ctid) : null;
      let cdx = 0, cdz = 0, combat = 0;
      if (cv && HOSTILE[cv.kind] && cv.root.visible && e.alive !== false && !W.docked) {
        cdx = cv.rx - pv.rx; cdz = cv.rz - pv.rz;
        const sep = Math.hypot(cdx, cdz);
        if (sep < 1500 && (e.attacking || sep < 750)) combat = 1;
      }
      this.combatK += (combat - this.combatK) * (1 - Math.exp(-dt * (combat ? 2.4 : 1.2)));
      const ck = this.combatK;
      let tx = pv.rx, tz = pv.rz;
      // Tor in der Nähe (z. B. nach dem Sprung): Spieler und Tor gemeinsam in den freien Bereich rahmen
      let gv = null, gd = Infinity;
      if (ck < 0.5 && !W.docked) this.views.forEach((v) => { if (v.kind === 'portal' && v.root.visible) { const dd = Math.hypot(v.rx - pv.rx, v.rz - pv.rz); if (dd < gd) { gd = dd; gv = v; } } });
      const gWant = gv && gd < 520 ? 1 : 0;
      this.gateK = (this.gateK || 0) + (gWant - (this.gateK || 0)) * (1 - Math.exp(-dt * 1.6));
      if (this.gateK > 0.001 && gv && ck < 0.5) {
        const G = this._frame(pv.rx, pv.rz, pv.vr, gv.rx, gv.rz, 120, HF);
        const gk = this.gateK * (1 - ck);
        wantDist = this.targetDist + (Math.min(G.d, this.targetDist * 1.6) - this.targetDist) * gk;
        tx += (G.cx - pv.rx) * gk * 0.85; tz += (G.cz - pv.rz) * gk * 0.85;
      }
      if (ck > 0.001 && cv) {
        const F = this._frame(pv.rx, pv.rz, pv.vr * 1.3, cv.rx, cv.rz, cv.vr * 1.2, HF, 0.3);
        wantDist = this.targetDist + (F.d - this.targetDist) * ck;
        tx += (F.cx - pv.rx) * ck; tz += (F.cz - pv.rz) * ck;
      }
      const lk = 1 - Math.exp(-dt * 2.5);
      const lead = 0.22 * (1 - ck);
      this.camLead.x += ((e.vx || 0) * lead - this.camLead.x) * lk;
      this.camLead.z += ((e.vz || 0) * lead - this.camLead.z) * lk;
      tx += this.camLead.x; tz += this.camLead.z;
      if (this._snap) { this.camTarget.set(pv.rx, 0, pv.rz); this.camLead.set(0, 0, 0); this.combatK = 0; this.dist = wantDist = this.targetDist; this._snap = false; }
      else {
        const k = 1 - Math.exp(-dt * (3.2 + 1.3 * (1 - ck)));
        this.camTarget.x += (tx - this.camTarget.x) * k;
        this.camTarget.z += (tz - this.camTarget.z) * k;
      }
    }
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-dt * (wantDist > this.dist + 1 ? 2.6 : 5)));
    const cam = this.camera, ct = this.camTarget;
    // harte Grenze: Spielerschiff (mit Radius) nie unter die Oberkante der Waffenleiste − 60 px
    if (pv && pv.root.visible) {
      const lim = this.rect.height - HF.bottom - 60;
      const ny = 1 - 2 * lim / this.rect.height; // NDC-y der Grenze (negativ = unten)
      const dz = (pv.rz + pv.vr * 1.3) - ct.z;
      const depth = this.dist - dz * COS_P;
      const y = -dz * SIN_P / (Math.max(1, depth) * TAN_H);
      if (y < ny) {
        // gesuchtes dz', bei dem die Unterkante genau auf der Grenze liegt
        const dzWant = ny * TAN_H * this.dist / (ny * TAN_H * COS_P - SIN_P);
        ct.z += dz - dzWant;
      }
    }
    // ---- Kamera-Pose: Taktisch (schräg von oben) und Verfolger (hinter dem Schiff), weich überblendet ----
    const d = this.dist, rig = this.rig;
    rig.step(dt, pv ? (pv.nSpd || 0) : 0, pv ? (pv.ab || 0) : 0);
    const K = rig.k;
    _cp.set(ct.x, d * SIN_P, ct.z + d * COS_P);
    _cl.set(ct.x, 0, ct.z);
    let viewD = d;
    if (K > 0.001 && pv && W && W.player) {
      const e = W.player, tid = e.targetId;
      const cv = tid !== null && tid !== undefined ? this.views.get(tid) : null;
      const hostile = cv && HOSTILE[cv.kind] && cv.root.visible && e.alive !== false && !W.docked;
      // Schiff im freien Bildbereich (zwischen oberen und unteren HUD-Fenstern), etwas unter dessen Mitte
      const Hh = Math.max(1, this.rect.height), freeTop = Math.max(40, HF.top), freeBot = Hh - Math.max(0, HF.bottom);
      const shipPx = freeTop + Math.max(80, freeBot - freeTop) * 0.6;
      const shipY = Math.max(-0.4, Math.min(0.3, 1 - 2 * shipPx / Hh));
      const tanC = Math.tan((FOV_CHASE + 9 * rig.fovKick * (0.5 + 0.5 * rig.motion)) * Math.PI / 360);
      rig.chasePose(dt, pv, e, hostile ? cv : null, hostile ? this.combatK : 0, pv.maxSpeed, shipY, tanC);
      _cp.lerp(rig._outPos, K); _cl.lerp(rig._outLook, K);
      viewD = d + (rig._outPos.distanceTo(_v.set(pv.rx, 0, pv.rz)) - d) * K;
    } else rig.reset = true;
    this._viewD = viewD;
    cam.position.copy(_cp);
    // Wackeln: Taktisch nur Verschiebung (Himmel ist ein gebackenes Bild), Verfolger auch leichte Neigung
    rig.shakeOffset(this.time, _so, (d * 0.022) * (1 - K) + Math.max(14, pv ? pv.vr : 20) * 0.16 * K);
    cam.position.add(_so);
    cam.up.set(0, 1, 0);
    cam.lookAt(_cl);
    if (K > 0.001) cam.rotateZ((-(pv ? pv.bank : 0) * 0.16 + rig.shakeRoll(this.time)) * K);
    // Sichtfeld: Kick bei hohem Tempo und Nachbrenner (Taktik nur leicht)
    const fov = FOV + 2.6 * rig.fovKick * rig.motion * (1 - K) + (FOV_CHASE - FOV + 9 * rig.fovKick * (0.5 + 0.5 * rig.motion)) * K;
    if (Math.abs(fov - this._fov) > 0.01) {
      this._fov = fov; this._tanH = Math.tan(fov * Math.PI / 360);
      cam.fov = fov; cam.updateProjectionMatrix();
      this._updatePointScale();
    }
    cam.updateMatrixWorld();
    // Himmel: Taktik = gebackenes Bild (mit Sichtfeld-Ausgleich), Verfolger = Rundumbild im gedrehten Rahmen
    {
      const sky = this.env.sky;
      sky.setFov(fov);
      _sq.slerpQuaternions(SKY_Q_ID, SKY_Q_CHASE, K);
      sky.setChase(K, _sq, cam, this.quality);
      this.env.planets.skyQ = K > 0.001 ? _sq : null;
      const OU = this.output.uniforms;
      if (K > 0.001) {
        const front = sky.sunOnScreen(cam, _s2);
        OU.uSun.value.copy(_s2);
        OU.uFlare.value = front ? this.env.flareStrength : 0;
      } else if (this._skyWasChase) { OU.uSun.value.copy(this.env.sunScreen); OU.uFlare.value = this.env.flareStrength; }
      this._skyWasChase = K > 0.001;
    }
    this.speedDust.update(dt, cam, pv, W?.player, K, this.time);

    // Auswahlring
    const tid = W?.player?.targetId;
    const tv = tid !== null && tid !== undefined ? this.views.get(tid) : null;
    if (tv && tv.root.visible) {
      this.sel.visible = true;
      const r = tv.vr * 1.3 + 12;
      this.sel.scale.setScalar(r);
      this.sel.position.set(tv.rx, tv.kind === 'station' ? -8 : -3, tv.rz);
      this.sel.rotation.y = this.time * 0.6;
      if (this._selKind !== tv.kind) {
        this._selKind = tv.kind;
        const hex = HOSTILE[tv.kind] ? 0xff4a3a : tv.kind === 'crate' ? 0xffd36a : tv.kind === 'freighter' ? 0xffb070 : 0x9fe8ff;
        this.selMat.uniforms.uColor.value.setHex(hex).multiplyScalar(2.2);
        this.selInner.material.uniforms.uColor.value.setHex(hex).multiplyScalar(1.5);
      }
      this.selMat.uniforms.uOpacity.value = W.player.attacking ? 1.0 : 0.65;
    } else this.sel.visible = false;

    this.env.chaseK = this.rig.k;
    if (W) this.env.update(cam, this.gl.getPixelRatio(), this._pointScale, this.time, this.camTarget, dt);
    // Sprungtor-Linse im Kamera-Durchgang (nächstes Tor im Bild)
    const OU = this.output.uniforms;
    let lensK = 0;
    if (this._lensV && this._lensV.root.visible) {
      const lv = this._lensV;
      cam.updateMatrixWorld();
      _v.set(lv.rx, 0, lv.rz).project(cam);
      if (_v.z < 1 && Math.abs(_v.x) < 1.6 && Math.abs(_v.y) < 1.6) {
        const cx = _v.x * 0.5 + 0.5, cy = _v.y * 0.5 + 0.5;
        _w.set(lv.rx + 86 * PORTAL_VIS, 0, lv.rz).project(cam);
        const rx = Math.abs(_w.x * 0.5 + 0.5 - cx);
        _w.set(lv.rx, 0, lv.rz + 86 * PORTAL_VIS).project(cam);
        const ry = Math.abs(_w.y * 0.5 + 0.5 - cy);
        if (rx > 0.002 && ry > 0.002) { OU.uLensC.value.set(cx, cy); OU.uLensR.value.set(rx, ry); lensK = 1; }
      }
    }
    OU.uLensK.value = lensK;
    // Leitmarke am nächsten Tor: ab 1,5-facher Sprungreichweite, darin [J] SPRINGEN
    {
      let mv = null, md = Infinity;
      if (pv && W && !W.docked) this.views.forEach((v) => { if (v.kind === 'portal' && v.root.visible) { const dd = Math.hypot(v.rx - pv.rx, v.rz - pv.rz); if (dd < md) { md = dd; mv = v; } } });
      const inRange = !!(W && W.nearPortal);
      if (mv && (md < PORTAL_R * 1.5 || inRange)) this.jumpMarker.show(mv.rx, mv.rz, pv.rx, pv.rz, md, inRange, this.metersPerPixel(), this.effects.jump.on);
      else this.jumpMarker.hide();
    }
    this.output.uniforms.uTime.value = this.time;
    // Positionslichter: rot langsam, weiß als Doppelblitz, grün versetzt
    const T = this.time, N = this._nav;
    N.red.opacity = Math.sin(T * 3.2) > 0.55 ? 1 : 0.1;
    const st = T % 1.7;
    N.white.opacity = st < 0.06 || (st > 0.2 && st < 0.26) ? 1 : 0.0;
    N.green.opacity = Math.sin(T * 3.2 + 2.2) > 0.55 ? 1 : 0.1;
    // Gefahrenzone: Vignette im Bildschirmraum wächst mit der Nähe zur Sektorgrenze
    let danger = 0;
    if (W?.player && W.sector && W.player.alive !== false) {
      const sz = W.sector.size || 2400;
      const dd = Math.max(Math.abs(W.player.x || 0), Math.abs(W.player.z || 0)) - sz;
      danger = Math.max(0, Math.min(1, (dd + 250) / 650));
    }
    this.output.uniforms.uDanger.value += (danger - this.output.uniforms.uDanger.value) * (1 - Math.exp(-dt * 3));
    this.output.uniforms.uWarp.value = this.effects.warp;
    // Sprung in der Welt abgebrochen (weggeflogen, angedockt, abgeschossen) → Lade-Effekt sofort weg
    if (this.effects.jump.on && W && !W.jump) this.effects.jumpCancel();
    this.effects.update(dt);
    this.trails.update(dt);
    this.tele.update(dt);
    this._heatHaze(pv);
    if (this._arrive && pv && !this._hold) { this._arrive = false; this.effects.arrive(); }

    // Angedockt liegt das Stationsfenster (Weichzeichner) über allem: das 3D-Bild während des Einschwebens nur jedes
    // 4. Mal zeichnen, danach (Schiff liegt in der Wiege) nur noch ≈ 2 × je Sekunde – jedes neue 3D-Bild zwingt den
    // Browser, den Weichzeichner über die ganze Fläche neu zu rechnen (angedockt vorher 25–40 Bilder/s).
    if (W && W.docked) {
      const settled = this._dockK >= 1 && this._intro.done;
      if ((this.frame & (settled ? 31 : 3)) !== 0) return;
    }
    this._introStep();
    // Sektorsprung: solange die neuen Shader parallel übersetzen, bleibt das letzte Bild (Sprungblitz) stehen
    if (this._hold && this._holdStep()) return;
    const G = this.gl;
    if (this._prepQ) this._drawPrep();
    G.info.reset();
    this.gpuTimer.begin();
    if (this.lowQuality || this.quality === 0) G.render(this.scene, cam);
    else this.composer.render(dt);
    this.gpuTimer.end();
    const S = this.stats;
    S.gpu = this.gpuTimer.gpu; S.calls = G.info.render.calls; S.tris = G.info.render.triangles;
    S.pr = G.getPixelRatio(); S.scale = this.scale; S.w = this.canvas.width; S.h = this.canvas.height;
    S.quality = this.quality; S.low = this.lowQuality;
    this._perf.cpu += (performance.now() - _t0 - this._perf.cpu) * 0.1; // Prozessorzeit je Bild (geglättet)
  }

  // Hitzeflimmern: Bereich hinter den Düsen des Spielers als Strecke im Bild (Kamera-Durchgang verzerrt dort)
  _heatHaze(pv) {
    const U = this.output.uniforms;
    if (!U.uHeatK) return;
    let k = 0;
    if (pv && pv.root.visible && pv.heat > 0.05 && this.quality >= 1 && !(this.world && this.world.docked)) {
      const back = 30 + 70 * pv.heat;
      _h.set(pv.hx, 0, pv.hz).project(this.camera);
      const ax = _h.x * 0.5 + 0.5, ay = _h.y * 0.5 + 0.5;
      _h.set(pv.hx + Math.sin(pv.rrot) * back, 0, pv.hz + Math.cos(pv.rrot) * back).project(this.camera);
      if (_h.z < 1) {
        U.uHeatA.value.set(ax, ay);
        U.uHeatB.value.set(_h.x * 0.5 + 0.5, _h.y * 0.5 + 0.5);
        U.uHeatW.value = Math.max(0.004, (pv.vr * 0.35) / (this.metersPerPixel() * Math.max(1, this.rect.width)));
        k = pv.heat;
      }
    }
    U.uHeatK.value += (k - U.uHeatK.value) * 0.2;
    if (U.uHeatK.value < 0.01 && k === 0) U.uHeatK.value = 0;
  }

  // ---------- adaptive Auflösung ----------
  _adapt(dt) {
    // Bilder pro Fenster (0,5 s) zählen: robust gegen einzelne Ausreißer.
    // best = höchste gemessene Bildrate ≈ Bildwiederholrate des Bildschirms (vergisst langsam).
    const P = this._perf;
    const now = performance.now();
    if (!P.last || now - P.last > 250 || (typeof document !== 'undefined' && document.hidden)) {
      P.last = now; P.winStart = now; P.frames = 0; return; // Pause/verstecktes Fenster: nicht werten
    }
    P.last = now;
    if (P.warm > 0) { P.warm -= dt; P.winStart = now; P.frames = 0; return; }
    P.frames++;
    const span = now - P.winStart;
    if (span < 500) return;
    const fps = P.frames * 1000 / span;
    P.winStart = now; P.frames = 0;
    P.best = Math.max(fps, P.best * 0.996);
    P.fps = fps;
    if (P.cooldown > 0) P.cooldown--;
    if (P.blockUp > 0) P.blockUp--;
    let slow = fps < P.best * 0.86 && fps < 112;
    let fast = fps >= P.best * 0.96;
    // Fester Boden: unter 50 Bilder/s immer herunterregeln (auch wenn es nie schneller war, z. B. schwacher
    // Laptop mit gleichmäßig 35 Bildern/s), hoch nur ab 55. Ausnahme: Browser drosselt fest auf ≈ 30 (Energiesparen).
    const throttled = fps > 28 && fps < 32 && P.cpu < 8;
    if (fps < 50 && !throttled) slow = true;
    if (fps < 55) fast = false;
    // Prozessor-Engpass: Bildrate niedrig, die Grafikkarte braucht aber nur einen kleinen Teil des Bildbudgets
    // (bei mindestens 60 Bildern/s). Auflösung senken brächte nur Unschärfe – die Absicherung im Flug senkt
    // stattdessen die Stufe (Partikel, Lichter). Ohne GPU-Zeitmessung nur, wenn Simulation/Oberfläche außerhalb
    // der Grafik den Großteil des Bildes belegen (Rückstau der Grafik kann dort nicht stecken).
    const T = this.gpuTimer;
    const timed = T.ok && T.samples > 30;
    const budget60 = 1000 / Math.max(60, Math.min(144, P.best));
    const cpuNow = slow && !throttled && (timed ? T.gpu < budget60 * 0.6 : P.work - P.cpu > (1000 / fps) * 0.6);
    P.cpuB = cpuNow ? Math.min(P.cpuB + 1, 4) : Math.max(P.cpuB - 2, 0);
    this.cpuBound = P.cpuB >= 2;
    if (this.cpuBound) {
      slow = false;
      // Grafik hat viel Luft: früher gesenkte Auflösung schrittweise zurückholen (kostet keine Bildrate)
      fast = timed && T.gpu < budget60 * 0.4;
    }
    // An die Messung gekoppelt: mit GPU-Zeitmessung zählt die echte Grafikkarten-Zeit gegen das Bildbudget
    // (Bildwiederholrate). Runter, sobald > 92 % des Budgets; hoch nur mit deutlichem Spielraum (< 60 %).
    if (timed) {
      const budget = 1000 / Math.max(30, Math.min(144, P.best));
      if (T.gpu > budget * 0.92) { slow = true; fast = false; }
      if (!this.cpuBound) fast = fast && T.gpu < budget * 0.6;
      // Feste Grafikzeit-Grenze für HOCH (Ziel: Kampf unter 8 ms je Bild, auch auf 60-Hz-Bildschirmen, damit bei
      // 120 Hz und in schweren Momenten Luft bleibt): über 7,6 ms Auflösung leicht senken, höchstens bis 86 %
      // (Pixeldichte bleibt ≥ 1,5, also ohne FXAA-Weichzeichnung); zurück erst unter 5,6 ms.
      const cap = GPU_CAP[this.quality];
      if (cap && !W_DOCKED(this)) {
        if (T.gpu > cap && this.scale > GPU_CAP_FLOOR + 0.001) { slow = true; fast = false; P.capped = true; }
        if (fast && T.gpu > cap * 0.74) fast = false;
      }
    }
    P.slow = slow ? P.slow + 1 : 0;
    P.fast = fast ? P.fast + 1 : 0;
    if (P.slow >= 2 && P.cooldown === 0) {
      P.slow = 0; P.cooldown = 2;
      const capOnly = P.capped && fps >= Math.min(P.best, 60) * 0.95; // nur die Zeitgrenze, Bildrate stimmt
      P.capped = false;
      if (capOnly) {
        if (this.scale > GPU_CAP_FLOOR + 0.001) { this.scale = Math.max(GPU_CAP_FLOOR, this.scale - 0.07); this._applyPR(); }
      } else if (this.scale > this._minScale() + 0.001) {
        this.scale = Math.max(this._minScale(), this.scale - (fps < P.best * 0.6 ? 0.15 : 0.08));
        if (now - P.lastUp < 4000) P.blockUp = 60; // gerade erhöht und wieder zu langsam → länger warten
        this._applyPR();
      } else if (!this.lowQuality && ++P.lowCount >= 4) {
        this.lowQuality = true; // letzte Stufe: Bloom aus
        P.lowAt = now; P.lowOffs = (P.lowOffs || 0) + 1;
      }
    } else if (P.fast >= 6 && P.cooldown === 0 && P.blockUp === 0) {
      P.fast = 0; P.cooldown = 3;
      // Nachleuchten erst nach 20 s wieder an, und nach zweimaligem Abschalten gar nicht mehr (kein Flackern)
      if (this.lowQuality) { if (P.lowOffs < 2 && now - P.lowAt > 20000) { this.lowQuality = false; P.lowCount = 0; } }
      else if (this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.08);
        P.lastUp = now;
        this._applyPR();
      }
    }
  }

  /** Arbeitszeit des ganzen Bildes (ms, Prozessor: Simulation, Grafik, Oberfläche) aus der Spielschleife */
  noteWork(ms) { const P = this._perf; P.work += (ms - P.work) * 0.1; }

  _applyPR() {
    const pr = this.basePR * this.scale;
    this._bloomScale = Math.min(this._bloomCap ?? 1, pr >= 1.5 ? 0.5 : pr > 1.15 ? 0.7 : 1);
    const w = this.rect.width, h = this.rect.height;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    // EffectComposer ruft setSize der Durchgänge mit Pufferpixeln auf; FXAA nur ohne Retina-Dichte
    this.output.setFxaa(pr < 1.5);
    this._updatePointScale();
  }

  resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width || c.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.round(r.height || c.clientHeight || window.innerHeight));
    const bpr = Math.min(window.devicePixelRatio || 1, PR_CAP[this.quality] ?? MAX_PR);
    this.rect.left = r.left; this.rect.top = r.top;
    // main.js und das eigene resize-Ereignis rufen doppelt: Render-Ziele nur bei echter Änderung neu anlegen
    if (w === this.rect.width && h === this.rect.height && bpr === this.basePR && this._sized) return;
    this._sized = true;
    this.rect.width = w; this.rect.height = h;
    this.basePR = bpr;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.output.uniforms.uAspect.value = w / h;
    this._applyPR();
    if (this.world) {
      this.env.resize(w * bpr, h * bpr);
      this.output.uniforms.uSun.value.copy(this.env.sunScreen);
    }
  }

  setZoom(delta) {
    if (!delta) return;
    const d = Math.max(-400, Math.min(400, delta));
    if (this.rig.mode === 'chase') { this.rig.zoomBy(d); return; }
    this.targetDist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.targetDist * Math.exp(d * 0.0011)));
  }

  // Welt-Punkt (Ebene y=0) → Bildschirm (CSS-Pixel wie clientX/clientY). out optional (vermeidet Speicher).
  toScreen(x, z, out) {
    const o = out || { x: 0, y: 0, visible: false };
    _v.set(x, 0, z).project(this.camera);
    o.x = this.rect.left + (_v.x + 1) * 0.5 * this.rect.width;
    o.y = this.rect.top + (1 - _v.y) * 0.5 * this.rect.height;
    o.visible = _v.z > -1 && _v.z < 1 && _v.x > -1.1 && _v.x < 1.1 && _v.y > -1.1 && _v.y < 1.1;
    return o;
  }

  // Sichtbarer Bereich auf der Spielebene (für das Rechteck auf der Minikarte). Gibt immer dasselbe Objekt zurück.
  getViewBounds() {
    const b = this._vb || (this._vb = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
    this.camera.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, hits = 0;
    for (let i = 0; i < 4; i++) {
      _ndc.set(i & 1 ? 1 : -1, i & 2 ? 1 : -1);
      _ray.setFromCamera(_ndc, this.camera);
      if (!_ray.ray.intersectPlane(_plane, _w)) continue;
      hits++;
      if (_w.x < minX) minX = _w.x; if (_w.x > maxX) maxX = _w.x;
      if (_w.z < minZ) minZ = _w.z; if (_w.z > maxZ) maxZ = _w.z;
    }
    if (hits < 4) return null;
    b.minX = minX; b.maxX = maxX; b.minZ = minZ; b.maxZ = maxZ;
    return b;
  }

  /** Verfolger-Steuerung „Maus lenkt“: Kurs (rot-Konvention der Simulation) in Richtung des Mauszeigers.
   *  Bezug ist die Schiffsnase (nicht die nachfedernde Kamera, sonst dreht das Schiff nach dem Lenken zurück):
   *  Zeiger rechts der Mitte = Kurs rechts der Nase, je weiter außen, desto enger die Kurve; Totzone in der Mitte. */
  steerHeading(clientX) {
    const R = this.rect, P = this.world && this.world.player;
    let yaw;
    if (P) yaw = P.rot || 0;
    else { this.camera.getWorldDirection(_v); yaw = Math.atan2(-_v.x, -_v.z); }
    let nx = ((clientX - R.left) / Math.max(1, R.width)) * 2 - 1;
    nx = Math.max(-1, Math.min(1, nx));
    const dz = 0.035;
    nx = Math.abs(nx) < dz ? 0 : (nx - Math.sign(nx) * dz) / (1 - dz);
    const tanW = this._tanH * (R.width / Math.max(1, R.height));
    return yaw - Math.atan(nx * tanW * 1.15);
  }

  // Verfolger: Objekte im Bild direkt anklicken (Bildschirmabstand zur projizierten Mitte, Mindestgröße 22 px).
  // Über die Bodenebene träfe man flach von hinten oft daneben.
  _pickScreen(clientX, clientY) {
    const R = this.rect, cam = this.camera;
    let best = null, bestScore = Infinity;
    const kpx = R.height / (2 * this._tanH);
    cam.getWorldDirection(_h);
    this.views.forEach((v, id) => {
      if (!PICK_KINDS[v.kind] || !v.root.visible || v.kind === 'player') return;
      const dx = v.rx - cam.position.x, dy = 2 - cam.position.y, dz = v.rz - cam.position.z;
      const depth = dx * _h.x + dy * _h.y + dz * _h.z;
      if (depth < 30) return;
      _w.set(v.rx, 2, v.rz).project(cam);
      if (_w.z > 1) return;
      const sx = R.left + (_w.x * 0.5 + 0.5) * R.width, sy = R.top + (-_w.y * 0.5 + 0.5) * R.height;
      const rpx = Math.max(22, (v.kind === 'station' ? 200 : v.vr * 1.25) * kpx / depth);
      const d = Math.hypot(sx - clientX, sy - clientY);
      if (d > rpx) return;
      const score = d / rpx + (v.kind === 'station' ? 0.8 : 0) + depth * 1e-5;
      if (score < bestScore) { bestScore = score; best = id; }
    });
    return best;
  }

  pick(clientX, clientY) {
    const R = this.rect;
    _ndc.set(((clientX - R.left) / R.width) * 2 - 1, -((clientY - R.top) / R.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    if (this.rig.k > 0.5) { const id = this._pickScreen(clientX, clientY); if (id !== null) return { kind: 'entity', id }; }
    _ray.setFromCamera(_ndc, this.camera);
    // Verfolger: Klick über den Horizont trifft die Ebene nicht → nichts tun (statt auf der Stelle anzuhalten)
    if (!_ray.ray.intersectPlane(_plane, _w)) return this.rig.k > 0.5 ? null : { kind: 'ground', x: this.camTarget.x, z: this.camTarget.z };
    // 40 Bildschirmpixel Toleranz in Meter umrechnen
    // Toleranz 40 Bildschirmpixel am Auftreffpunkt (Verfolger: Abstand Kamera → Punkt statt Zoomabstand)
    const mpp = (2 * Math.max(60, this.camera.position.distanceTo(_w)) * this._tanH) / R.height;
    const tol = 40 * mpp;
    let best = null, bestScore = Infinity;
    this.views.forEach((v, id) => {
      if (!PICK_KINDS[v.kind] || !v.root.visible) return;
      const d = Math.hypot(v.rx - _w.x, v.rz - _w.z);
      const r = v.kind === 'station' ? 200 : v.vr;
      if (d > r + tol) return;
      const score = d - r * 0.5 + (v.kind === 'station' ? 150 : 0); // Station nur, wenn nichts anderes näher ist
      if (score < bestScore) { bestScore = score; best = id; }
    });
    if (best !== null) return { kind: 'entity', id: best };
    return { kind: 'ground', x: _w.x, z: _w.z };
  }

  dispose() {
    this._disposed = true;
    try { this.drones.dispose(); } catch { /* egal */ }
    if (this._prepQ) { const r = this._prepQ.res; this._prepQ = null; r(); }
    if (this._prepRT) { this._prepRT.dispose(); this._prepRT = null; }
    for (const off of this._offs) off();
    this._offs.length = 0;
    window.removeEventListener('resize', this._onResize);
    this.views.forEach((v, id) => this._removeView(id));
    this.jumpMarker.dispose();
    this.env.dispose(false);
    if (window.__lsRenderer === this) window.__lsRenderer = null;
    this.effects.dispose();
    this.trails.dispose();
    this.tele.dispose();
    this.speedDust.dispose();
    this.views.forEach((v) => { if (v.life) v.life.dispose(); });
    this._clearDying();
    this.sel.geometry.dispose(); this.selMat.dispose();
    this.selInner.geometry.dispose(); this.selInner.material.dispose();
    this.factory.dispose();
    disposeTextures();
    this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose();
    this.bloom.dispose(); this.output.dispose?.();
    this.gpuTimer.dispose();
    this.gl.dispose();
    try { this.gl.forceContextLoss(); } catch { /* egal */ } // Leinwand wird verworfen → GPU-Speicher sofort frei
    this.world = null;
  }
}
