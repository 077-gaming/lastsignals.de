// Himmelskörper der Menü-Bühne: eigene, feinere Oberflächen für Europa, Eris, Ganymed, Eismond und Dysnomia,
// einmal je Heimat auf der Grafikkarte gebacken (Farbe + Höhe im Alphakanal). Darstellung mit Relief aus der
// Höhenkarte, weicher Tag-Nacht-Grenze, Eis-Glanz, Fresnel-Saum und (Eris) violettem Glühen aus dem Eis.
// Jupiter und Saturn kommen weiter aus render/planets.js (Bänder, Ringe), gezeichnet mit derselben Darstellung.
// Gleiche Form wie PlanetSystem: group, bodies[i].root.children[0] = Kippgruppe (Größe), add(), update(), dispose().
import * as THREE from 'three';
import { NOISE, BAKE_VS } from '../render/glsl.js';
import { PlanetSystem, RING_IN, RING_OUT } from '../render/planets.js';

// ---------------------------------------------------------------- Oberflächen (linear, a = Höhe 0..1)

const SURF_FS = /* glsl */`
uniform float uSeed;
varying vec2 vUv;
${NOISE}
const float PI = 3.1415927;

// Worley mit F1, F2 und Zell-Id (für Bruchkanten zwischen Eisschollen)
vec3 worley2(vec3 p) {
  vec3 ip = floor(p), fp = fract(p);
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 h = hash33(ip + g);
    vec3 d = g + h - fp;
    float dd = dot(d, d);
    if (dd < f1) { f2 = f1; f1 = dd; id = h.z; } else if (dd < f2) { f2 = dd; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}

// Abstand zur Nulllinie eines Rauschfelds, über den Gradienten normiert: gleichmäßige Linienbreite
float lineDist(vec3 x) {
  const float e = 0.0025;
  float v = snoise(x);
  vec3 g = vec3(snoise(x + vec3(e, 0.0, 0.0)) - v, snoise(x + vec3(0.0, e, 0.0)) - v, snoise(x + vec3(0.0, 0.0, e)) - v) / e;
  return abs(v) / max(length(g), 0.25);
}

// Kraterfeld: x = Höhe, y = Helligkeit, z = Fläche
vec3 craters(vec3 p, float scale, float density, float depth) {
  vec2 w = worley(p * scale);
  float on = step(1.0 - density, fract(w.y * 7.31));
  float r = 0.14 + 0.24 * fract(w.y * 13.7);
  float x = w.x / r;
  float bowl = (x * x - 1.0) * (1.0 - step(1.0, x));
  float rim = exp(-pow((x - 1.0) / 0.2, 2.0));
  float ej = exp(-(x - 1.0) * 3.0) * step(1.0, x);
  float fresh = step(0.75, fract(w.y * 3.17));
  float h = on * depth * (bowl * 0.85 + rim * 0.5 + ej * 0.18);
  float a = on * (rim * 0.08 + ej * (0.05 + fresh * 0.12) - (1.0 - smoothstep(0.0, 0.8, x)) * 0.04);
  return vec3(h, a, on * (1.0 - step(1.4, x)));
}

// Strahlenkrater an fester Stelle c (Einheitsvektor), Winkelradius r
float rays(vec3 p, vec3 c, float r, float seed) {
  float d = acos(clamp(dot(p, c), -1.0, 1.0));
  vec3 t1 = normalize(cross(c, vec3(0.0, 1.0, 0.07)));
  vec3 t2 = cross(c, t1);
  float ang = atan(dot(p, t2), dot(p, t1));
  float n = snoise(vec3(ang * 3.0, seed, 0.0)) * 0.5 + snoise(vec3(ang * 11.0, seed * 2.0, 1.0)) * 0.5;
  float ray = smoothstep(0.35, 0.9, n) * exp(-max(d - r, 0.0) / (r * 5.0)) * step(r * 0.9, d);
  float halo = exp(-max(d - r, 0.0) / (r * 1.2)) * step(r, d);
  return clamp(ray * 0.9 + halo * 0.5, 0.0, 1.0);
}

vec4 surface(vec3 p, float lat) {
  vec3 s3 = vec3(uSeed, uSeed * 0.7, uSeed * 1.3);
  vec3 q = p + s3;
#if TYPE == 4
  // EUROPA: helle Eiskruste mit großräumiger Tönung, lange Lineae als Kreisbögen (Doppelrücken mit rotbraunem
  // Saum, einzelne zykloidisch gezackt), kleine Chaos-Gebiete aus Eisschollen, ein Strahlenkrater
  vec3 iceW = srgb(vec3(0.93, 0.915, 0.87)), iceB = srgb(vec3(0.82, 0.86, 0.90));
  vec3 tanC = srgb(vec3(0.74, 0.62, 0.48)), brown = srgb(vec3(0.55, 0.38, 0.26));
  float n1 = fbm(q * 1.6, 6) * 0.5 + 0.5;
  vec3 c = mix(iceW, iceB, smoothstep(0.3, 0.75, fbm(q * 1.1 + 4.0, 4) * 0.5 + 0.5) * 0.75);
  float reg = smoothstep(0.45, 0.85, fbm(q * 0.7 + 2.0, 4) * 0.5 + 0.5);
  c = mix(c, tanC, reg * 0.55 * (0.6 + 0.4 * n1));
  c *= 0.95 + 0.1 * (fbm(q * 24.0, 3) * 0.5 + 0.5);
  float h = 0.58 + (n1 - 0.5) * 0.05;
  // Chaos: kleine Gebiete, weicher Rand, Schollen
  float chaosM = smoothstep(0.42, 0.56, fbm(q * 2.2 + 9.0, 4) * 0.5 + 0.5) * smoothstep(0.35, 0.6, reg + 0.2);
  vec3 wq = q * 9.0 + vec3(fbm(q * 5.0, 3), fbm(q * 5.0 + 2.3, 3), fbm(q * 5.0 + 5.1, 3)) * 0.5;
  vec3 cw = worley2(wq);
  float raft = smoothstep(0.04, 0.14, cw.y - cw.x) * step(0.45, fract(cw.z * 5.3));
  float hum = fbm(q * 60.0, 3) * 0.5 + 0.5;
  vec3 chaosC = mix(brown * (0.8 + 0.4 * hum), mix(iceW, tanC, 0.4), raft);
  c = mix(c, chaosC, chaosM * 0.75);
  h = mix(h, mix(0.48 + hum * 0.05, 0.62, raft), chaosM);
  // Lineae: Kreisbögen mit Anfang und Ende, leichte Unruhe, gleichmäßige Breite
  float lin = 0.0, rid = 0.0, trough = 0.0, thin = 0.0;
  for (int k = 0; k < 72; k++) {
    float fk = float(k) + uSeed * 1.7;
    vec3 nrm = normalize(hash33(vec3(fk, fk * 1.31, 7.7)) * 2.0 - 1.0);
    vec3 mid = normalize(hash33(vec3(fk * 0.71, 3.3, fk)) * 2.0 - 1.0);
    vec3 hh = hash33(vec3(fk * 2.3, fk, 1.9));
    float off = (hh.x - 0.5) * 1.3;
    float len = 0.2 + hh.y * 0.7;
    float w = k < 16 ? 0.0045 + hh.z * 0.003 : k < 40 ? 0.0026 + hh.z * 0.0014 : 0.0013 + hh.z * 0.0008;
    // Bogen nur in der Nähe von mid (Anfang und Ende weich)
    float span = smoothstep(len - 0.25, len, dot(p, mid)) ;
    if (span <= 0.0) continue;
    // zykloidische Zacken bei einigen
    vec3 t1 = normalize(cross(nrm, mid + vec3(0.01)));
    float along = atan(dot(p, cross(nrm, t1)), dot(p, t1));
    float cyc = hh.z > 0.7 ? abs(sin(along * (14.0 + hh.x * 10.0))) * 0.014 : 0.0;
    float d = abs(dot(p, nrm) - off * 0.5 - cyc + snoise(p * 7.0 + fk) * 0.006 + snoise(p * 31.0 + fk) * 0.0012);
    if (k < 16) {
      lin = max(lin, (1.0 - smoothstep(w * 0.9, w * 2.6, d)) * span);
      rid = max(rid, exp(-pow((d - w * 0.5) / (w * 0.26), 2.0)) * span);
      trough = max(trough, (1.0 - smoothstep(0.0, w * 0.22, d)) * span);
    } else if (k < 40) {
      lin = max(lin, (1.0 - smoothstep(w * 0.6, w * 1.8, d)) * span * 0.75);
      rid = max(rid, exp(-pow((d - w * 0.4) / (w * 0.3), 2.0)) * span * 0.5);
    } else {
      thin = max(thin, (1.0 - smoothstep(w * 0.3, w, d)) * span * 0.5);
    }
  }
  // feines Bruchnetz und Lenticulae (kleine dunkle Flecken)
  float fr = ridged(q * vec3(14.0, 9.0, 14.0) + 3.0, 3);
  float frM = smoothstep(0.0, 0.4, snoise(q * 1.4 + 40.0));
  c = mix(c, tanC * 0.92, smoothstep(0.82, 0.97, fr) * frM * 0.35);
  vec2 len2 = worley(q * 26.0);
  float lent = (1.0 - smoothstep(0.08, 0.2, len2.x)) * step(0.82, len2.y) * smoothstep(0.1, 0.5, reg + 0.2);
  c = mix(c, brown * 0.95, lent * 0.6);
  c = mix(c, brown * 1.05, lin * 0.72);
  c = mix(c, iceW * 1.04, rid * 0.5);
  c = mix(c, brown * 0.7, max(trough * 0.5, thin * 0.7));
  h += rid * 0.06 - trough * 0.035 + lin * 0.012 - thin * 0.02;
  vec3 cr = craters(q, 9.0, 0.06, 0.10);
  c *= 1.0 + cr.y * 1.5; h += cr.x;
  float ry = rays(p, normalize(vec3(0.62, -0.45, 0.64)), 0.022, uSeed);
  c = mix(c, iceW * 1.06, ry * 0.7);
  return vec4(max(c, vec3(0.0)), clamp(h, 0.0, 1.0));
#elif TYPE == 3
  // ERIS: Methan- und Stickstoffreif, Eisschollen mit Spalten; ein Teil der Spalten glüht violett (Höhe sehr niedrig)
  vec3 fW = srgb(vec3(0.95, 0.955, 0.985)), fB = srgb(vec3(0.80, 0.83, 0.93)), fT = srgb(vec3(0.74, 0.70, 0.76));
  float n = fbm(q * 2.2, 6) * 0.5 + 0.5;
  vec3 c = mix(fB, fW, smoothstep(0.3, 0.72, n));
  c = mix(c, fT, smoothstep(0.58, 0.8, fbm(q * 1.4 + 3.0, 5) * 0.5 + 0.5) * 0.45);
  c *= 0.95 + 0.1 * (fbm(q * 22.0, 3) * 0.5 + 0.5);
  float h = 0.6 + (n - 0.5) * 0.06;
  // große Ebene mit Schollen (Becken)
  float basin = smoothstep(0.05, 0.25, fbm(q * 0.9 + 6.0, 4));
  vec3 wq = q * 6.0 + vec3(fbm(q * 3.0, 3), fbm(q * 3.0 + 2.0, 3), fbm(q * 3.0 + 4.0, 3)) * 0.35;
  vec3 w1 = worley2(wq);
  float e1 = w1.y - w1.x;
  float crack1 = (1.0 - smoothstep(0.008, 0.028, e1)) * basin;
  float dome = smoothstep(0.0, 0.35, e1);
  c = mix(c, fW * 1.03, basin * dome * 0.4);
  h += basin * dome * 0.06;
  // feine Bruchlinien überall
  vec3 w2 = worley2(q * 19.0 + vec3(fbm(q * 6.0, 2)) * 0.4);
  float crack2 = 1.0 - smoothstep(0.006, 0.022, w2.y - w2.x);
  crack2 *= smoothstep(0.0, 0.3, snoise(q * 2.5 + 30.0));
  // welche Spalten leuchten
  float hot = smoothstep(0.05, 0.4, snoise(q * 1.7 + 50.0)) ;
  vec3 crackC = srgb(vec3(0.55, 0.52, 0.68));
  c = mix(c, crackC, max(crack1, crack2 * 0.6) * 0.6);
  float crack = max(crack1, crack2 * 0.8);
  h = mix(h, mix(0.3, 0.06, hot), crack);
  vec3 cr = craters(q, 7.0, 0.18, 0.09);
  c *= 1.0 + cr.y * 0.8; h += cr.x * (1.0 - crack);
  return vec4(max(c, vec3(0.0)), clamp(h, 0.0, 1.0));
#elif TYPE == 6
  // GANYMED: alte dunkle Kruste und helleres Furchenterrain, mehrstufig mit weichen Übergängen (fbm statt
  // Schwellen). Krater mit Wall, flachem Boden und Innenschattierung über die Höhe, Albedo nur leicht abgesenkt.
  // Ein Strahlensystem, unter 20 % Kontrast. Reif an den Polen.
  vec3 dark = srgb(vec3(0.38, 0.35, 0.31)), mid = srgb(vec3(0.47, 0.44, 0.39));
  vec3 brt = srgb(vec3(0.60, 0.58, 0.54)), frost = srgb(vec3(0.82, 0.83, 0.84));
  vec3 wq = q * 0.9 + vec3(fbm(q * 1.4, 5), fbm(q * 1.4 + 3.1, 5), fbm(q * 1.4 + 7.7, 5)) * 0.55;
  float terr = fbm(wq, 6) * 0.5 + 0.5;
  float sulci = smoothstep(0.38, 0.72, terr);                         // weicher Übergang dunkel > hell
  float mott = fbm(q * 5.0 + 2.0, 5) * 0.5 + 0.5;
  float fine = fbm(q * 18.0, 4) * 0.5 + 0.5;
  vec3 c = mix(mix(dark, mid, mott * 0.7), brt, sulci * 0.85);
  c *= 0.93 + 0.14 * fine;
  // Furchen: parallele Rücken in den hellen Gebieten, verzerrt, geringe Höhe
  float gx = fbm(q * 1.3 + 12.0, 3);
  float gr = ridged(vec3(q.x * 2.5 + gx * 2.0, q.y * 14.0 + fbm(q * 2.0, 3) * 3.0, q.z * 2.5 - gx * 2.0), 4);
  c *= 1.0 + (gr - 0.5) * 0.12 * sulci;
  float h = 0.55 + (terr - 0.5) * 0.06 + (gr - 0.5) * 0.025 * sulci + (fine - 0.5) * 0.012;
  // Krater: Schüssel mit flachem Boden, Wall, sanfter Auswurf; Tiefe klein, Ränder ohne harte Kante
  for (int k = 0; k < 3; k++) {
    float sc = k == 0 ? 3.2 : k == 1 ? 8.0 : 19.0;
    float dep = k == 0 ? 0.045 : k == 1 ? 0.03 : 0.016;
    vec2 w = worley(q * sc + float(k) * 5.3);
    float on = smoothstep(0.62, 0.7, fract(w.y * 7.31));
    float r = 0.16 + 0.22 * fract(w.y * 13.7);
    float x = w.x / r;
    float bowl = -(1.0 - smoothstep(0.0, 1.0, x * x));
    float floorF = smoothstep(0.0, 0.45, x);
    float rim = exp(-pow((x - 1.0) / 0.28, 2.0));
    float ej = exp(-max(x - 1.0, 0.0) * 2.6) * smoothstep(0.9, 1.3, x);
    h += on * dep * (bowl * mix(0.75, 1.0, floorF) + rim * 0.55 + ej * 0.12);
    c *= 1.0 + on * (rim * 0.06 + ej * 0.05 - (1.0 - smoothstep(0.2, 0.9, x)) * 0.08);
  }
  // Strahlen dezent (unter 20 %), nur um einen jungen Krater
  float ry = rays(p, normalize(vec3(-0.4, 0.3, 0.86)), 0.025, uSeed);
  c = mix(c, brt * 1.08, ry * 0.16);
  float pole = smoothstep(55.0, 75.0, abs(degrees(lat)) + fbm(q * 4.0, 3) * 9.0);
  c = mix(c, frost, pole * 0.6);
  return vec4(max(c, vec3(0.0)), clamp(h, 0.0, 1.0));
#elif TYPE == 7
  // EISMOND (Enceladus, Mimas): fast weiß, kraterübersät, glatte Ebenen mit langen Furchen
  vec3 wht = srgb(vec3(0.93, 0.94, 0.95)), gry = srgb(vec3(0.78, 0.79, 0.81));
  float n = fbm(q * 2.5, 5) * 0.5 + 0.5;
  vec3 c = mix(gry, wht, n);
  float smooth0 = smoothstep(0.0, 0.25, fbm(q * 1.2 + 8.0, 3));
  vec3 c1 = craters(q, 5.0, 0.5, 0.14);
  vec3 c2 = craters(q + 5.0, 13.0, 0.6, 0.06);
  vec3 c3 = craters(q + 9.0, 30.0, 0.6, 0.025);
  float cr = 1.0 - smooth0;
  c *= 1.0 + (c1.y + c2.y + c3.y) * cr;
  float h = 0.55 + (c1.x + c2.x + c3.x) * cr;
  float d = lineDist(vec3(q.x * 2.0, q.y * 9.0, q.z * 2.0) + 4.0) / 5.0;
  float stripe = (1.0 - smoothstep(0.002, 0.007, d)) * smooth0 * step(lat, -0.35);
  c = mix(c, srgb(vec3(0.62, 0.70, 0.78)), stripe * 0.6);
  h += stripe * 0.04;
  return vec4(max(c, vec3(0.0)), clamp(h, 0.0, 1.0));
#elif TYPE == 8
  // DYSNOMIA: sehr dunkel, leicht rötlich-grau, Krater
  float n = fbm(q * 3.0, 5) * 0.5 + 0.5;
  vec3 c = mix(vec3(0.036, 0.033, 0.032), vec3(0.07, 0.062, 0.058), n);
  vec3 c1 = craters(q, 6.0, 0.5, 0.14);
  vec3 c2 = craters(q + 4.0, 16.0, 0.6, 0.05);
  c *= 1.0 + c1.y * 2.0 + c2.y * 1.5;
  return vec4(max(c, vec3(0.0)), clamp(0.55 + c1.x + c2.x + (n - 0.5) * 0.04, 0.0, 1.0));
#else
  return vec4(vec3(0.5), 0.5);
#endif
}

void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * PI;
  vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  gl_FragColor = surface(p, lat);
}`;

const OWN = { eris: 3, europa: 4, ganymede: 6, ice: 7, dark: 8 };
const ORIG = { jupiter: 1, saturn: 2, io: 5, sedna: 9 };

// Erscheinung je Körper: Relief, Glanz, Saum, Unterflächenleuchten, Glühen aus Spalten
const LOOK = {
  europa: { bump: 0.0055, spec: 0.32, specP: 48, rim: [0.74, 0.86, 1.0], rimK: 0.55, sss: [0.55, 0.7, 1.0], sssK: 0.1, glow: [0, 0, 0], soft: 0.05, halo: [0.6, 0.75, 1.0], haloK: 0.32 },
  eris: { bump: 0.005, spec: 0.5, specP: 70, rim: [0.66, 0.58, 1.0], rimK: 0.6, sss: [0.52, 0.36, 1.0], sssK: 0.2, glow: [0.62, 0.3, 1.0], soft: 0.06, halo: [0.6, 0.5, 1.0], haloK: 0.55 },
  ganymede: { bump: 0.007, spec: 0.06, specP: 20, rim: [0.7, 0.76, 0.86], rimK: 0.25, sss: [0, 0, 0], sssK: 0, glow: [0, 0, 0], soft: 0.035, halo: [0.6, 0.66, 0.78], haloK: 0.16 },
  ice: { bump: 0.009, spec: 0.28, specP: 40, rim: [0.8, 0.88, 1.0], rimK: 0.4, sss: [0.6, 0.75, 1.0], sssK: 0.08, glow: [0, 0, 0], soft: 0.035, halo: [0.7, 0.8, 1.0], haloK: 0.2 },
  dark: { bump: 0.012, spec: 0.02, specP: 16, rim: [0.6, 0.6, 0.66], rimK: 0.12, sss: [0, 0, 0], sssK: 0, glow: [0, 0, 0], soft: 0.03, halo: [0, 0, 0], haloK: 0 },
  jupiter: { bump: 0, spec: 0, specP: 8, rim: [0, 0, 0], rimK: 0, sss: [0, 0, 0], sssK: 0, glow: [0, 0, 0], soft: 0.1, halo: [0, 0, 0], haloK: 0, limb: 1 },
  saturn: { bump: 0, spec: 0, specP: 8, rim: [0, 0, 0], rimK: 0, sss: [0, 0, 0], sssK: 0, glow: [0, 0, 0], soft: 0.1, halo: [0, 0, 0], haloK: 0, limb: 1 },
};

// ---------------------------------------------------------------- Darstellung

const VS = /* glsl */`
varying vec3 vP; varying vec3 vWN; varying vec3 vWP; varying vec3 vVo;
void main() {
  vP = position;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  vVo = normalize(transpose(mat3(modelMatrix)) * (cameraPosition - wp.xyz));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS = /* glsl */`
uniform sampler2D uMap; uniform sampler2D uRingTex;
uniform vec3 uLL; uniform vec3 uSunCol; uniform vec3 uAtmo; uniform vec3 uRimC; uniform vec3 uSssC; uniform vec3 uGlowC;
uniform vec2 uTexel;
uniform float uRot, uSoft, uAtmoK, uLight, uRingIn, uRingOut, uHasRing, uNight, uLimb, uBump, uSpec, uSpecP, uRimK, uSssK, uDetail;
varying vec3 vP; varying vec3 vWN; varying vec3 vWP; varying vec3 vVo;
${NOISE}
void main() {
  vec3 n = normalize(vP);
  float lon = atan(n.z, n.x);
  float u = lon / 6.2831853 + 0.5 + uRot;
  float v = asin(clamp(n.y, -1.0, 1.0)) / 3.1415927 + 0.5;
  vec4 tx = texture2D(uMap, vec2(u, v));
  vec3 alb = tx.rgb;
  float h = tx.a;
  // Relief aus der Höhenkarte
  vec3 N = n;
  if (uBump > 0.0) {
    float hE = texture2D(uMap, vec2(u + uTexel.x, v)).a - texture2D(uMap, vec2(u - uTexel.x, v)).a;
    float hN = texture2D(uMap, vec2(u, v + uTexel.y)).a - texture2D(uMap, vec2(u, v - uTexel.y)).a;
    float cl = max(sqrt(1.0 - n.y * n.y), 0.08);
    vec3 east = normalize(vec3(-sin(lon), 0.0, cos(lon)));
    vec3 north = cross(east, n);
    float sE = hE / (2.0 * uTexel.x * 6.2831853 * cl);
    float sN = hN / (2.0 * uTexel.y * 3.1415927);
    // Feinrelief für Nahsicht
    float dn = snoise(n * 160.0) * 0.6 + snoise(n * 420.0) * 0.4;
    alb *= 1.0 + dn * 0.035 * uDetail;
    N = normalize(n - (east * sE + north * sN) * uBump + (east * dn) * 0.012 * uDetail);
  }
  vec3 V = normalize(vVo);
  float mu = max(dot(n, V), 0.0);
  float dG = dot(n, uLL);
  float dB = dot(N, uLL);
  float term = smoothstep(-uSoft, uSoft * 1.6 + 0.015, dG);
  float lit = term * max(dB, 0.0) * mix(1.0, 0.85 + 0.15 * smoothstep(0.0, 0.4, dG), 0.5);
  // Ringschatten
  if (uHasRing > 0.5 && abs(uLL.y) > 0.001) {
    float t = -vP.y / uLL.y;
    if (t > 0.0) {
      float rr = length(vP.xz + uLL.xz * t);
      if (rr > uRingIn && rr < uRingOut) lit *= 1.0 - 0.85 * texture2D(uRingTex, vec2((rr - uRingIn) / (uRingOut - uRingIn), 0.5)).a;
    }
  }
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.74, 0.52), (1.0 - smoothstep(0.0, 0.35, dG)) * uAtmoK * step(-0.2, dG));
  vec3 c = alb * lit * tint * uSunCol * uLight;
  c *= mix(0.9 + 0.1 * mu, 0.32 + 0.68 * pow(mu, 0.55), uLimb);
  // Eis-Glanz
  vec3 H = normalize(uLL + V);
  float sp = pow(max(dot(N, H), 0.0), uSpecP) * term * (0.4 + 0.6 * smoothstep(0.4, 0.8, h));
  c += uSunCol * uSpec * sp * uLight;
  // Licht im Eis an der Tag-Nacht-Grenze (Unterfläche)
  float sss = smoothstep(-0.2, 0.0, dG) * (1.0 - smoothstep(0.0, 0.28, dG));
  c += uSssC * sss * uSssK * uLight * (0.35 + 0.65 * alb.g);
  // Saum am beleuchteten Rand
  float rim = pow(1.0 - mu, 3.2) * smoothstep(-0.2, 0.5, dG);
  c += uRimC * rim * uRimK * uLight * 0.8;
  c += uAtmo * pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.5, dG) * uAtmoK * uLight * 0.7;
  // Nachtseite, Glühen aus tiefen Spalten (Eris)
  c += alb * uNight;
  float glow = smoothstep(0.24, 0.05, h);
  c += uGlowC * glow * (0.35 + 0.65 * (1.0 - term)) * 0.9;
  gl_FragColor = vec4(c, 1.0);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const ATMO_VS = /* glsl */`
varying vec3 vWN; varying vec3 vWP; varying vec3 vP;
void main() {
  vP = normalize(position);
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
// Lichtsaum außen: dünn bei Eiskörpern, kräftiger bei Gasriesen; folgt der Sonne mit weichem Auslauf
const ATMO_FS = /* glsl */`
uniform vec3 uAtmo; uniform vec3 uLL; uniform float uK; uniform float uLight; uniform float uPow;
varying vec3 vWN; varying vec3 vWP; varying vec3 vP;
void main() {
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float mu = abs(dot(N, V));
  float edge = pow(1.0 - mu, uPow) * smoothstep(0.0, 0.3, mu);
  float lit = smoothstep(-0.35, 0.45, dot(vP, uLL));
  float a = edge * lit * uK * uLight;
  gl_FragColor = vec4(uAtmo * a * 2.2, a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const RING_VS = /* glsl */`
varying vec3 vP;
void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = /* glsl */`
uniform sampler2D uRingTex; uniform vec3 uLL; uniform vec3 uSunCol; uniform float uRingIn, uRingOut, uLight;
varying vec3 vP;
void main() {
  float rr = length(vP.xz);
  vec4 t = texture2D(uRingTex, vec2((rr - uRingIn) / (uRingOut - uRingIn), 0.5));
  if (t.a < 0.004) discard;
  float b = dot(vP, uLL);
  float closest = sqrt(max(dot(vP, vP) - b * b, 0.0));
  float sh = b < 0.0 ? smoothstep(0.96, 1.04, closest) : 1.0;
  float k = 0.35 + 0.65 * sqrt(abs(uLL.y));
  gl_FragColor = vec4(t.rgb * uSunCol * uLight * sh * k, t.a * 0.92);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

export class MenuPlanets {
  constructor(gl, baker) {
    this.gl = gl;
    this.baker = baker;
    this.orig = new PlanetSystem(gl, baker);   // Jupiter/Saturn-Oberflächen und Ringtextur
    this.bodies = [];
    this.trash = [];
    this.group = new THREE.Group();
    this.group.name = 'menu-planets';
    this.surfMats = new Map();
  }

  _surfMat(type) {
    let m = this.surfMats.get(type);
    if (!m) {
      m = new THREE.ShaderMaterial({
        uniforms: { uSeed: { value: 0 } }, defines: { TYPE: type },
        vertexShader: BAKE_VS, fragmentShader: SURF_FS, depthTest: false, depthWrite: false,
      });
      this.surfMats.set(type, m);
    }
    return m;
  }

  /** Back-Material für einen Körper (zum Vorab-Übersetzen), null wenn aus render/planets.js */
  bakeMaterial(kind) {
    if (OWN[kind]) return this._surfMat(OWN[kind]);
    const t = ORIG[kind];
    return t && this.orig._surfMat ? this.orig._surfMat(t) : null;
  }

  _bake(kind, seed, w) {
    if (!OWN[kind]) return this.orig.bakeSurface(ORIG[kind] || 7, seed, w);
    const rt = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.HalfFloatType, depthBuffer: false });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
    const m = this._surfMat(OWN[kind]);
    m.uniforms.uSeed.value = seed;
    this.baker.run(m, rt);
    this.trash.push(rt);
    return rt.texture;
  }

  // b: { kind, dir, dist, angR, par, pole, L, sunCol, light, atmo, atmoK, soft, night, rings, res, seed, rot }
  add(b) {
    const look = LOOK[b.kind] || LOOK.ice;
    const R = b.dist * Math.sin(b.angR);
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.pole);
    tilt.scale.setScalar(R);
    root.add(tilt);
    const LL = b.L.clone().applyQuaternion(tilt.quaternion.clone().invert()).normalize();
    const map = this._bake(b.kind, b.seed, b.res);
    const ringTex = b.rings && this.orig ? this._ringTex(b.seed) : null;
    const geo = new THREE.SphereGeometry(1, 160, 96);
    this.trash.push(geo);
    const own = !!OWN[b.kind];
    const atmo = b.atmo;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map }, uRingTex: { value: ringTex }, uLL: { value: LL },
        uSunCol: { value: b.sunCol }, uAtmo: { value: atmo }, uRot: { value: 0 }, uSoft: { value: own ? look.soft : b.soft },
        uAtmoK: { value: b.atmoK }, uLight: { value: b.light }, uRingIn: { value: RING_IN }, uRingOut: { value: RING_OUT },
        uHasRing: { value: ringTex ? 1 : 0 }, uNight: { value: b.night }, uLimb: { value: look.limb ?? 0.22 },
        uTexel: { value: new THREE.Vector2(1 / b.res, 2 / b.res) },
        uBump: { value: look.bump }, uSpec: { value: look.spec }, uSpecP: { value: look.specP },
        uRimC: { value: new THREE.Color(...look.rim) }, uRimK: { value: look.rimK },
        uSssC: { value: new THREE.Color(...look.sss) }, uSssK: { value: look.sssK },
        uGlowC: { value: new THREE.Color(...look.glow) }, uDetail: { value: b.detail ?? 1 },
      },
      vertexShader: VS, fragmentShader: FS,
    });
    this.trash.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -900;
    tilt.add(mesh);
    // Lichtsaum: Gasriesen aus atmo, Eiskörper aus dem eigenen Saum
    const haloK = b.atmoK > 0.3 ? b.atmoK : look.haloK;
    const haloC = b.atmoK > 0.3 ? atmo : new THREE.Color(...look.halo);
    if (haloK > 0) {
      const ag = new THREE.SphereGeometry(b.atmoK > 0.3 ? 1.022 : 1.012, 128, 64);
      const am = new THREE.ShaderMaterial({
        uniforms: { uAtmo: { value: haloC }, uLL: { value: LL }, uK: { value: haloK }, uLight: { value: b.light }, uPow: { value: b.atmoK > 0.3 ? 5 : 7 } },
        vertexShader: ATMO_VS, fragmentShader: ATMO_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.trash.push(ag, am);
      const a = new THREE.Mesh(ag, am);
      a.renderOrder = -899;
      tilt.add(a);
    }
    if (ringTex) {
      const rg = new THREE.RingGeometry(RING_IN, RING_OUT, 256, 1).rotateX(-Math.PI / 2);
      const rm = new THREE.ShaderMaterial({
        uniforms: {
          uRingTex: { value: ringTex }, uLL: { value: LL }, uSunCol: { value: b.sunCol }, uRingIn: { value: RING_IN },
          uRingOut: { value: RING_OUT }, uLight: { value: b.light },
        },
        vertexShader: RING_VS, fragmentShader: RING_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      this.trash.push(rg, rm);
      const ring = new THREE.Mesh(rg, rm);
      ring.renderOrder = -898;
      tilt.add(ring);
    }
    root.traverse((o) => { o.frustumCulled = false; });
    this.group.add(root);
    this.bodies.push({ root, mat, dir: b.dir.clone(), dist: b.dist, par: b.par, rot: b.rot || 0 });
  }

  // Ringtextur aus dem Original holen (eigene Ringlein, Cassini-Teilung): kurz ein Original-Körper anlegen
  _ringTex(seed) {
    const o = this.orig;
    const before = o.trash.length;
    o.add({
      type: 7, dir: new THREE.Vector3(0, 0, -1), dist: 1, angR: 0.01, par: 0, pole: new THREE.Vector3(0, 1, 0),
      L: new THREE.Vector3(1, 0, 0), sunCol: new THREE.Color(1, 1, 1), light: 1, atmo: new THREE.Color(0, 0, 0), atmoK: 0,
      soft: 0.1, night: 0, rings: true, res: 8, seed, rot: 0,
    });
    // die Ringtextur liegt im Müll direkt nach der kleinen Oberflächentextur
    const tex = o.trash.slice(before).find((t) => t && t.isDataTexture);
    o.group.clear(); o.bodies.length = 0;
    return tex || null;
  }

  update(camPos, camTarget, time) {
    for (let i = 0; i < this.bodies.length; i++) {
      const B = this.bodies[i];
      B.root.position.set(
        camPos.x + B.dir.x * B.dist - camTarget.x * B.par,
        camPos.y + B.dir.y * B.dist,
        camPos.z + B.dir.z * B.dist - camTarget.z * B.par,
      );
      B.mat.uniforms.uRot.value = time * B.rot;
    }
  }

  dispose() {
    for (const o of this.trash) o.dispose();
    this.trash.length = 0;
    this.group.clear();
    this.bodies.length = 0;
    this.surfMats.forEach((m) => m.dispose());
    this.surfMats.clear();
    this.orig.dispose();
  }
}
