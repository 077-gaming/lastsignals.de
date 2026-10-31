// Planeten und Monde: Oberflächen werden einmal je Sektor auf der Grafikkarte gebacken (Rundumbild),
// Licht mit weicher Tag-Nacht-Grenze, Randverdunklung, Atmosphären-Lichtsaum, Ringe mit Cassini-Teilung,
// Planetenschatten auf den Ringen und Ringschatten auf dem Planeten.
import * as THREE from 'three';
const _pd = new THREE.Vector3();
import { NOISE, BAKE_VS } from './glsl.js';
import { rng } from './textures.js';

const PAR_LIM = 3000;

// ---------- Oberflächen (Albedo, linear) ----------
const SURF_FS = /* glsl */`
uniform float uSeed;
varying vec2 vUv;
${NOISE}
const float PI = 3.1415927;
float gH = 0.0; // Höhe für das Relief (Alpha-Kanal), nur Monde und Zwergplaneten
// Krater mit Schüssel, Rand, heller Auswurfdecke; liefert Albedo-Änderung, addiert Höhe auf gH
float crater(vec3 p, float scale, float density, float depth) {
  vec2 w = worley(p * scale);
  float r = 0.16 + 0.26 * fract(w.y * 13.7);
  float on = step(1.0 - density, fract(w.y * 7.31));
  float x = w.x / r;
  float bowl = (x * x - 1.0) * (1.0 - smoothstep(0.85, 1.0, x));
  float rim = exp(-pow((x - 1.0) / 0.22, 2.0)) * 0.35;
  float ej = exp(-max(x - 1.0, 0.0) * 2.5) * step(1.0, x) * 0.12;
  gH += on * (bowl * 0.5 + rim) * depth / scale;
  return on * (ej * 0.7 + rim * 0.25 - smoothstep(0.7, 0.0, x) * 0.07);
}
float craterField(vec3 p, float k) {
  float a = crater(p, 3.0, 0.3, 1.0) * 1.0;
  a += crater(p + 1.3, 7.0, 0.45, 0.9) * 0.8;
  a += crater(p + 2.7, 16.0, 0.55, 0.8) * 0.6;
  a += crater(p + 4.1, 38.0, 0.65, 0.7) * 0.4;
  return a * k;
}
float craters(vec3 p, float scale, float density) {
  vec2 w = worley(p * scale);
  float r = 0.18 + 0.25 * fract(w.y * 13.7);
  float on = step(1.0 - density, fract(w.y * 7.31));
  float bowl = smoothstep(r, r * 0.4, w.x);
  float rim = exp(-pow((w.x - r) / (0.16 * r), 2.0));
  return on * (rim * 0.22 - bowl * 0.2);
}
vec3 surface(vec3 p, float lat, float lon) {
  vec3 s3 = vec3(uSeed, uSeed * 0.7, uSeed * 1.3);
#if TYPE == 1
  // Jupiter: Zonen und Bänder, Domain-Warp (3 Oktaven) mit Turbulenz an den Bandgrenzen,
  // Festons am Rand des Nordäquatorbands, weiße Ovale, Großer Roter Fleck
  float d0 = degrees(lat);
  float edgeW = 0.0;
  edgeW += exp(-pow((d0 - 6.5) / 2.5, 2.0)) + exp(-pow((d0 - 18.5) / 2.5, 2.0));
  edgeW += exp(-pow((d0 + 19.5) / 2.5, 2.0)) + exp(-pow((d0 + 6.5) / 2.5, 2.0));
  edgeW += 0.6 * (exp(-pow((d0 - 25.0) / 2.0, 2.0)) + exp(-pow((d0 + 33.5) / 2.0, 2.0)));
  vec3 q = vec3(p.x * 3.0, p.y * 16.0, p.z * 3.0) + s3;
  vec3 o1 = vec3(fbm(q, 4), fbm(q + vec3(5.2, 1.3, 2.8), 4), fbm(q + vec3(1.7, 9.2, 3.1), 4));
  vec3 q2 = vec3(p.x * 7.0, p.y * 30.0, p.z * 7.0) + o1 * 2.2;
  vec3 o2 = vec3(fbm(q2 + vec3(8.3, 2.8, 4.1), 4), fbm(q2 + vec3(2.2, 6.6, 0.7), 4), 0.0);
  float w3 = fbm(vec3(p.x * 16.0, p.y * 52.0, p.z * 16.0) + vec3(o2.xy, 0.0) * 2.0, 3);
  float w1 = o1.x, w2 = o2.x;
  float la = lat + w1 * 0.02 + (o2.y * 0.05 + w3 * 0.022) * (0.25 + 1.6 * clamp(edgeW, 0.0, 1.0));
  float d = degrees(la);
  float belts = 0.0;
  belts += smoothstep(5.0, 8.0, d) * (1.0 - smoothstep(17.0, 20.0, d));
  belts += smoothstep(-21.0, -18.0, d) * (1.0 - smoothstep(-8.0, -5.0, d));
  belts += 0.6 * smoothstep(24.0, 26.0, d) * (1.0 - smoothstep(30.0, 33.0, d));
  belts += 0.5 * smoothstep(-35.0, -32.0, d) * (1.0 - smoothstep(-29.0, -26.0, d));
  belts += 0.35 * smoothstep(38.0, 40.0, d) * (1.0 - smoothstep(44.0, 47.0, d));
  belts += 0.35 * smoothstep(-47.0, -44.0, d) * (1.0 - smoothstep(-41.0, -38.0, d));
  float n = fbm(vec3(p.x * 12.0, p.y * 56.0, p.z * 12.0) + vec3(w2 * 1.6, w3, 0.0), 4) * 0.5 + 0.5;
  vec3 zone = srgb(vec3(0.92, 0.88, 0.79));
  vec3 belt = srgb(vec3(0.78, 0.64, 0.50));
  vec3 beltD = srgb(vec3(0.58, 0.43, 0.32));
  vec3 c = mix(zone, mix(belt, beltD, n), clamp(belts, 0.0, 1.0));
  c = mix(c, c * vec3(1.0, 0.9, 0.78), smoothstep(6.0, 0.0, abs(d)) * 0.5);
  float tur = fbm(vec3(p.x * 22.0, p.y * 80.0, p.z * 22.0) + vec3(o2.xy * 2.5, w1), 4) * 0.5 + 0.5;
  c *= 0.84 + 0.3 * tur;
  // Festons: dunkle blaugraue Fahnen am Südrand des Nordäquatorbands (≈ 7° N), in die Zone gezogen
  float lonF = lon * 9.0 + w2 * 2.0;
  float fest = smoothstep(0.55, 0.9, sin(lonF) * 0.5 + 0.5) * exp(-pow((d - 5.0) / 2.2, 2.0));
  fest *= smoothstep(-0.1, 0.4, fbm(vec3(lon * 3.0, d * 0.2, uSeed), 3));
  c = mix(c, srgb(vec3(0.36, 0.40, 0.48)), fest * 0.75);
  // weiße Ovale (Südliche Gemäßigte Zone) und kleine braune Barken (Nord)
  vec2 wo = worley(vec3(p.x * 11.0, p.y * 26.0, p.z * 11.0) + s3);
  float ovalBand = exp(-pow((d + 37.0) / 4.5, 2.0)) + 0.5 * exp(-pow((d - 31.0) / 4.0, 2.0));
  c = mix(c, zone * 1.1, smoothstep(0.24, 0.1, wo.x) * step(0.7, wo.y) * ovalBand);
  vec2 bk = worley(vec3(p.x * 14.0, p.y * 30.0, p.z * 14.0) + s3 * 1.7);
  c = mix(c, srgb(vec3(0.45, 0.30, 0.22)), smoothstep(0.2, 0.08, bk.x) * step(0.82, bk.y) * exp(-pow((d - 16.0) / 2.5, 2.0)));
  // Polgebiete: grau-bläulich, fleckig
  float pole = smoothstep(48.0, 68.0, abs(d));
  c = mix(c, srgb(vec3(0.58, 0.57, 0.56)) * (0.8 + 0.4 * n), pole);
  // Großer Roter Fleck bei 22° Süd
  // klein, entsättigt und über das Bandrauschen verzogen (sitzt in den Bändern statt als Aufkleber)
  float la0 = radians(-22.0), lo0 = 0.6;
  float dl = atan(sin(lon + w2 * 0.05 - lo0), cos(lon + w2 * 0.05 - lo0)) * cos(la0);
  vec2 e = vec2(dl / radians(7.0), (la - la0) / radians(3.8));
  e += vec2(o2.x, o2.y) * 0.18;
  float rr = length(e);
  float ang = atan(e.y, e.x) + (1.0 - clamp(rr, 0.0, 1.0)) * 1.2;
  vec2 sw = vec2(cos(ang), sin(ang)) * rr;
  float gn = fbm(vec3(sw * 3.0, uSeed) + vec3(w3), 4) * 0.5 + 0.5;
  vec3 grs = mix(srgb(vec3(0.70, 0.52, 0.42)), srgb(vec3(0.80, 0.66, 0.55)), gn);
  c = mix(c, zone * 1.0, smoothstep(1.45, 1.1, rr) * (1.0 - smoothstep(1.1, 0.95, rr)) * 0.35);
  c = mix(c, grs * (0.9 + 0.2 * tur), smoothstep(1.0, 0.6, rr) * 0.85);
  return c;
#elif TYPE == 2
  // Saturn: blasse, weiche Bänder, Sechseck am Nordpol
  float w = fbm(vec3(p.x * 2.0, p.y * 18.0, p.z * 2.0) + s3, 5);
  float la = lat + w * 0.012;
  float d = degrees(la);
  float b = 0.5 + 0.25 * sin(d * 0.45 + w * 1.5) + 0.25 * sin(d * 1.35 + 0.7);
  float fine = fbm(vec3(p.x * 6.0, p.y * 90.0, p.z * 6.0) + w, 3) * 0.5 + 0.5;
  vec3 c = mix(srgb(vec3(0.88, 0.79, 0.60)), srgb(vec3(0.74, 0.62, 0.44)), b * 0.7 + fine * 0.15);
  c = mix(c, srgb(vec3(0.93, 0.86, 0.68)), smoothstep(12.0, 0.0, abs(d)) * 0.5);
  float hexA = atan(p.z, p.x);
  float hexR = (PI / 2.0 - lat) / cos(mod(hexA + PI / 6.0, PI / 3.0) - PI / 6.0);
  c = mix(c, srgb(vec3(0.52, 0.56, 0.60)), smoothstep(0.24, 0.22, hexR) * step(0.0, lat) * 0.8);
  c = mix(c, srgb(vec3(0.62, 0.62, 0.64)), smoothstep(55.0, 80.0, abs(d)) * 0.6);
  return c;
#elif TYPE == 3
  // Eris: dunkler Eiszwerg, Methanfrost in hellen Feldern, alte Krater, Bruchkanten
  float n = fbm(p * 2.2 + s3, 6) * 0.5 + 0.5;
  float frost = fbm(p * 7.0 + s3 * 3.0, 4) * 0.5 + 0.5;
  vec3 c = mix(srgb(vec3(0.42, 0.42, 0.47)), srgb(vec3(0.66, 0.66, 0.72)), smoothstep(0.3, 0.75, n));
  c = mix(c, srgb(vec3(0.86, 0.87, 0.92)), smoothstep(0.62, 0.85, frost) * 0.5);
  float ridge = ridged(p * 3.4 + s3, 4);
  gH += ridge * 0.02;
  c *= 0.85 + 0.2 * ridge;
  c *= 1.0 + craterField(p, 1.0);
  return c;
#elif TYPE == 4
  // Europa: Eiskruste mit rotbraunen Linien (Lineae) und Chaos-Gebieten
  float n = fbm(p * 2.5 + s3, 6) * 0.5 + 0.5;
  vec3 c = mix(srgb(vec3(0.90, 0.86, 0.78)), srgb(vec3(0.72, 0.58, 0.46)), smoothstep(0.55, 0.8, n) * 0.8);
  // Lineae: feine, unscharfe rötliche Bruchbänder mit Doppelrand (dunkle Säume, hellere Mitte)
  vec3 q = p + 0.08 * vec3(fbm(p * 4.0 + s3, 3), fbm(p * 4.0 + s3 + 3.1, 3), fbm(p * 4.0 + s3 + 6.2, 3));
  float lines = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float w = 0.05 / (1.0 + fi * 0.7);
    float x = abs(snoise(q * (2.2 + fi * 1.9) + s3 * (1.0 + fi))) / w;
    float band = exp(-pow(x - 1.0, 2.0) * 3.0) + 0.35 * exp(-x * x * 4.0);
    lines += band * (1.0 - fi * 0.2);
  }
  c = mix(c, srgb(vec3(0.66, 0.50, 0.40)), clamp(lines, 0.0, 1.0) * 0.42);
  c *= 1.0 + craters(p, 9.0, 0.12) * 0.25;
  return c;
#elif TYPE == 5
  // Io: Schwefel gelb, rote und schwarze Vulkanflecken
  float n = fbm(p * 3.0 + s3, 6) * 0.5 + 0.5;
  vec3 c = mix(srgb(vec3(0.90, 0.84, 0.46)), srgb(vec3(0.80, 0.62, 0.30)), n);
  c = mix(c, srgb(vec3(0.95, 0.94, 0.82)), smoothstep(0.6, 0.75, fbm(p * 6.0 + s3 * 3.0, 4) * 0.5 + 0.5) * 0.6);
  vec2 v = worley(p * 7.0 + s3);
  float spot = step(0.6, v.y);
  c = mix(c, srgb(vec3(0.62, 0.22, 0.10)), smoothstep(0.38, 0.12, v.x) * spot * 0.8);
  c = mix(c, srgb(vec3(0.08, 0.07, 0.06)), smoothstep(0.1, 0.03, v.x) * spot);
  return c;
#elif TYPE == 6
  // Ganymed: dunkle alte Kruste, helle gefurchte Bänder, Krater
  float n = fbm(p * 2.0 + s3, 6) * 0.5 + 0.5;
  float groove = ridged(p * vec3(3.0, 9.0, 3.0) + s3, 4);
  vec3 c = mix(srgb(vec3(0.40, 0.36, 0.31)), srgb(vec3(0.68, 0.64, 0.58)), smoothstep(0.45, 0.6, n) * (0.6 + 0.4 * groove));
  gH += groove * 0.01;
  c *= 1.0 + craterField(p, 1.0);
  return c;
#elif TYPE == 7
  // Eismond (Enceladus, Mimas, Tethys …): fast weiß, kraterübersät
  float n = fbm(p * 3.0 + s3, 5) * 0.5 + 0.5;
  float mar = smoothstep(0.05, 0.4, fbm(p * 1.4 + s3 * 1.9, 5));
  vec3 c = mix(srgb(vec3(0.70, 0.71, 0.74)), srgb(vec3(0.90, 0.91, 0.93)), n);
  c = mix(c, srgb(vec3(0.56, 0.57, 0.60)), mar * 0.55);
  c *= 1.0 + craterField(p, 1.3);
  return c;
#elif TYPE == 8
  // Dysnomia: sehr dunkel (Albedo ≈ 0,05), leicht rötlich-grau, flache Krater
  float n = fbm(p * 3.0 + s3, 5) * 0.5 + 0.5;
  float mar = smoothstep(0.05, 0.4, fbm(p * 1.4 + s3 * 1.9, 5));
  vec3 c = mix(vec3(0.045, 0.041, 0.040), vec3(0.08, 0.072, 0.066), n) * (1.0 - mar * 0.3);
  c *= 1.0 + craterField(p, 1.4);
  return c;
#else
  // Sedna: rötlich (Tholine)
  float n = fbm(p * 3.0 + s3, 6) * 0.5 + 0.5;
  vec3 c = mix(srgb(vec3(0.52, 0.26, 0.18)), srgb(vec3(0.72, 0.42, 0.30)), n);
  c *= 1.0 + craterField(p, 1.0);
  return c;
#endif
}
void main() {
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * PI;
  vec3 p = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 col = max(surface(p, lat, lon), vec3(0.0));
  gl_FragColor = vec4(col, gH);
}`;

export const SURF = { jupiter: 1, saturn: 2, eris: 3, europa: 4, io: 5, ganymede: 6, ice: 7, dark: 8, sedna: 9 };

// ---------- Darstellung ----------
const PLANET_VS = /* glsl */`
varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
void main() {
  vP = position;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PLANET_FS = /* glsl */`
uniform sampler2D uMap; uniform sampler2D uRingTex;
uniform vec3 uL; uniform vec3 uLL; uniform vec3 uSunCol; uniform vec3 uAtmo;
uniform float uRot, uSoft, uAtmoK, uLight, uRingIn, uRingOut, uHasRing, uNight, uLimb, uRelief;
varying vec3 vP; varying vec3 vWN; varying vec3 vWP;
// Ferne: leicht abdunkeln und entsättigen (atmosphärische Tiefe), damit Spielobjekte davor stehen
vec3 depthGrade(vec3 c) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return mix(c, vec3(l), 0.2) * 0.8; }
void main() {
  vec3 n = normalize(vP);
  float u = atan(n.z, n.x) / 6.2831853 + 0.5 + uRot;
  float v = asin(clamp(n.y, -1.0, 1.0)) / 3.1415927 + 0.5;
  vec4 tx = texture2D(uMap, vec2(u, v));
  vec3 alb = tx.rgb;
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float mu = max(dot(N, V), 0.0);
  float d = dot(n, uLL);
  float lit = smoothstep(-uSoft, uSoft * 2.0 + 0.02, d) * (0.3 + 0.7 * clamp(d, 0.0, 1.0));
  // feste Körper (Monde, Zwergplaneten): weiche Terminator-Kurve über Wrap-Licht statt harter Kante
  float rocky = 1.0 - step(0.5, uLimb);
  float wrapL = pow(clamp((d + 0.16) / 1.16, 0.0, 1.0), 1.35);
  lit = mix(lit, wrapL, rocky);
  // Relief: Höhe in Lichtrichtung abtasten; am Terminator stark (Kraterränder werfen lange Schatten)
  if (uRelief > 0.0) {
    vec3 east = normalize(vec3(-n.z, 0.0, n.x) + vec3(1e-5, 0.0, 0.0));
    vec3 north = cross(east, n);
    vec2 Lt = vec2(dot(uLL, east), dot(uLL, north));
    float eps = 0.004;
    vec2 off = vec2(Lt.x / (6.2831853 * max(sqrt(1.0 - n.y * n.y), 0.05)), Lt.y / 3.1415927) * eps;
    float h1 = texture2D(uMap, vec2(u, v) + off).a;
    float slope = (tx.a - h1) / eps;
    float term = 0.5 + 2.2 * (1.0 - smoothstep(0.0, 0.6, d));
    lit *= clamp(1.0 + slope * uRelief * term, 0.1, 2.2);
  }
  // Ringschatten auf dem Planeten
  if (uHasRing > 0.5 && abs(uLL.y) > 0.001) {
    float t = -vP.y / uLL.y;
    if (t > 0.0) {
      float rr = length(vP.xz + uLL.xz * t);
      if (rr > uRingIn && rr < uRingOut) lit *= 1.0 - 0.85 * texture2D(uRingTex, vec2((rr - uRingIn) / (uRingOut - uRingIn), 0.5)).a;
    }
  }
  // Rötung an der Tag-Nacht-Grenze (Atmosphäre)
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.72, 0.5), (1.0 - smoothstep(0.0, 0.35, d)) * uAtmoK * step(-0.2, d));
  vec3 c = alb * lit * tint * uSunCol * uLight;
  c *= mix(0.88 + 0.12 * mu, 0.32 + 0.68 * pow(mu, 0.55), uLimb); // Randverdunklung (Gasriesen stark)
  c += alb * uNight;                                          // Nachtseite fast schwarz
  // Erdlicht: der Hauptplanet hellt die Nachtseite der Monde leicht auf (≈ 6 %), kühler Ton
  c += alb * vec3(0.8, 0.85, 1.0) * 0.06 * uLight * rocky * (1.0 - smoothstep(-0.2, 0.15, d));
  // feiner Lichtsaum gegen die Sonne am beleuchteten Rand
  c += uSunCol * pow(1.0 - mu, 6.0) * smoothstep(-0.05, 0.45, d) * 0.35 * uLight * rocky;
  float rim = pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.5, d);
  c += uAtmo * rim * uAtmoK * uLight * 0.7;                   // Dunst am Rand
  gl_FragColor = vec4(depthGrade(c), 1.0);
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
const ATMO_FS = /* glsl */`
uniform vec3 uAtmo; uniform vec3 uLL; uniform float uK; uniform float uLight;
varying vec3 vWN; varying vec3 vWP; varying vec3 vP;
void main() {
  vec3 N = normalize(vWN), V = normalize(cameraPosition - vWP);
  float mu = abs(dot(N, V));
  float edge = pow(1.0 - mu, 5.0) * smoothstep(0.0, 0.25, mu);
  float lit = smoothstep(-0.3, 0.4, dot(vP, uLL));
  float a = edge * lit * uK * uLight;
  gl_FragColor = vec4(uAtmo * a * 1.8, a);
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
  // Planetenschatten: Strahl zur Sonne trifft die Kugel (Radius 1)?
  float b = dot(vP, uLL);
  float closest = sqrt(max(dot(vP, vP) - b * b, 0.0));
  float sh = b < 0.0 ? smoothstep(0.96, 1.04, closest) : 1.0;
  float k = 0.35 + 0.65 * sqrt(abs(uLL.y));
  vec3 c = t.rgb * uSunCol * uLight * sh * k;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(mix(c, vec3(l), 0.2) * 0.8, t.a * 0.9);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

// Ringprofil (u = innen … außen): C-Ring schwach, B-Ring dicht, Cassini-Teilung, A-Ring mit Encke-Lücke, F-Ring
export const RING_IN = 1.23, RING_OUT = 2.34;
function ringTexture(seed) {
  const W = 2048;
  const data = new Uint8Array(W * 4);
  const R = rng(seed);
  // feine Ringlein: gefilterter Zufall
  const fine = new Float32Array(W);
  let a = 0.5;
  for (let i = 0; i < W; i++) { a += (R() - 0.5) * 0.35; a = a * 0.92 + 0.5 * 0.08; fine[i] = a; }
  const sm = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < W; i++) {
    const r = RING_IN + (RING_OUT - RING_IN) * (i + 0.5) / W;
    let dens = 0, col = [0.78, 0.70, 0.58];
    if (r < 1.525) { dens = 0.12 + 0.1 * sm(1.23, 1.5, r); col = [0.55, 0.51, 0.47]; }               // C-Ring
    else if (r < 1.95) { dens = 0.65 + 0.3 * sm(1.53, 1.75, r); col = [0.86, 0.77, 0.62]; }           // B-Ring
    else if (r < 2.025) { dens = 0.04; col = [0.5, 0.48, 0.45]; }                                      // Cassini-Teilung
    else if (r < 2.27) { dens = 0.55 - 0.15 * sm(2.05, 2.26, r); col = [0.80, 0.73, 0.62]; }          // A-Ring
    else if (r > 2.315 && r < 2.33) { dens = 0.35; col = [0.82, 0.78, 0.72]; }                         // F-Ring
    if (r > 2.209 && r < 2.218) dens *= 0.1;                                                           // Encke-Lücke
    if (r > 2.265 && r < 2.27) dens *= 0.4;
    dens *= 0.7 + 0.6 * fine[i];
    dens *= sm(1.23, 1.26, r);
    const k = 0.85 + 0.3 * fine[(i * 7) % W];
    data[i * 4] = Math.min(255, col[0] * k * 255);
    data[i * 4 + 1] = Math.min(255, col[1] * k * 255);
    data[i * 4 + 2] = Math.min(255, col[2] * k * 255);
    data[i * 4 + 3] = Math.min(255, dens * 255);
  }
  const t = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  // Mipmaps: feine Ringlein werden bei Abstand vorgefiltert (kein Flimmern, keine Treppen)
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export class PlanetSystem {
  constructor(gl, baker) {
    this.gl = gl;
    this.baker = baker;
    this.bodies = [];
    this.trash = [];
    this.group = new THREE.Group();
    this.group.name = 'planets';
    this.surfMats = new Map();
    this.jobs = [];
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

  // Oberfläche backen, in Streifen über mehrere Bilder verteilt (kein Ruckler beim Sektorwechsel).
  // Der Körper bleibt unsichtbar, bis sein Bild fertig ist.
  bakeSurface(type, seed, w, mesh) {
    const rt = new THREE.WebGLRenderTarget(w, w / 2, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping });
    rt.texture.wrapS = THREE.RepeatWrapping;
    this.trash.push(rt);
    const strips = Math.max(4, (w / 2) / 64);
    this.jobs.push({ type, seed, rt, strips, i: 0, mesh });
    return rt.texture;
  }

  // Back-Shader aller anstehenden Oberflächen jetzt übersetzen (beim Aufbau, hinter dem Ladebild): je Typ ein
  // Pixel ins Ziel (wird vom ersten Streifen überschrieben). Sonst übersetzt der erste Streifen jedes Typs mitten
  // im Flug (20–60 ms auf schwachen Chips).
  warmPrograms() {
    const seen = new Set();
    for (const J of this.jobs) {
      if (seen.has(J.type)) continue;
      seen.add(J.type);
      const m = this._surfMat(J.type);
      m.uniforms.uSeed.value = J.seed;
      J.rt.scissor.set(0, 0, 1, 1);
      J.rt.scissorTest = true;
      this.baker.run(m, J.rt);
      J.rt.scissorTest = false;
    }
  }

  _bakeStep(budget) {
    while (budget > 0 && this.jobs.length) {
      const J = this.jobs[0];
      const m = this._surfMat(J.type);
      m.uniforms.uSeed.value = J.seed;
      const h = J.rt.height / J.strips;
      J.rt.scissor.set(0, J.i * h, J.rt.width, h);
      J.rt.scissorTest = true;
      this.baker.run(m, J.rt);
      J.rt.scissorTest = false;
      J.i++; budget--;
      if (J.i >= J.strips) { this.jobs.shift(); if (J.mesh) J.mesh.visible = true; }
    }
  }

  // b: { type, dir, dist, angR, par, pole, light (Richtung), sunCol, light (Stärke), atmo, atmoK, soft, night, rings, res, seed, rot }
  add(b) {
    const R = b.dist * Math.sin(b.angR);
    const root = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.pole);
    tilt.scale.setScalar(R);
    root.add(tilt);
    // Licht in Planeten-Koordinaten
    const LL = b.L.clone().applyQuaternion(tilt.quaternion.clone().invert()).normalize();
    const map = this.bakeSurface(b.type, b.seed, b.res, root);
    root.visible = false;
    const ringTex = b.rings ? ringTexture(b.seed + 5) : null;
    if (ringTex) this.trash.push(ringTex);
    const seg = b.angR > 0.05 ? 128 : 48;
    const geo = new THREE.SphereGeometry(1, seg, seg >> 1);
    this.trash.push(geo);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map }, uRingTex: { value: ringTex }, uL: { value: b.L }, uLL: { value: LL },
        uSunCol: { value: b.sunCol }, uAtmo: { value: b.atmo }, uRot: { value: 0 }, uSoft: { value: b.soft },
        uAtmoK: { value: b.atmoK }, uLight: { value: b.light }, uRingIn: { value: RING_IN }, uRingOut: { value: RING_OUT },
        uHasRing: { value: ringTex ? 1 : 0 }, uNight: { value: b.night }, uLimb: { value: b.type <= 2 ? 1 : 0.25 },
        uRelief: { value: b.type >= 3 ? (b.relief ?? 0.026) : 0 },
      },
      vertexShader: PLANET_VS, fragmentShader: PLANET_FS,
    });
    this.trash.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = -900;
    tilt.add(mesh);
    if (b.atmoK > 0) {
      const ag = new THREE.SphereGeometry(1.022, 96, 48);
      const am = new THREE.ShaderMaterial({
        uniforms: { uAtmo: { value: b.atmo }, uLL: { value: LL }, uK: { value: b.atmoK }, uLight: { value: b.light } },
        vertexShader: ATMO_VS, fragmentShader: ATMO_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      this.trash.push(ag, am);
      const atmo = new THREE.Mesh(ag, am);
      atmo.renderOrder = -899;
      tilt.add(atmo);
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

  // Fern-Ebene: par = Winkelversatz je Meter Kamerafahrt (rad/m), beim Heranzoomen 1–3 % größer
  update(camPos, camTarget, time) {
    if (this.jobs.length) this._bakeStep(2);
    const dx = camPos.x - camTarget.x, dy = camPos.y - camTarget.y, dz = camPos.z - camTarget.z;
    const camD = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const zk = Math.min(1, Math.max(0, (camD - 230) / 2370));
    const sc = 1.03 - 0.03 * Math.sqrt(zk);
    // Parallaxe weich begrenzt (±PAR_LIM m Kamerafahrt wirken voll, darüber nur noch 12 %): Körper bleiben in ihrer
    // Bildecke und wandern nie in die Bildmitte, egal wo im Sektor man fliegt
    const tx = PAR_LIM * Math.tanh(camTarget.x / PAR_LIM) + camTarget.x * 0.12, tz = PAR_LIM * Math.tanh(camTarget.z / PAR_LIM) + camTarget.z * 0.12;
    // Verfolger-Kamera: ganzer Himmelsrahmen gedreht (skyQ), Planeten mit Ausrichtung und Licht mitgedreht
    const q = this.skyQ, rot = !!(q && (q.x || q.y || q.z));
    for (let i = 0; i < this.bodies.length; i++) {
      const B = this.bodies[i];
      const k = B.par * B.dist;
      const d = rot ? _pd.copy(B.dir).applyQuaternion(q) : B.dir;
      if (rot) B.root.quaternion.copy(q); else if (B.root.quaternion.w !== 1) B.root.quaternion.identity();
      B.root.position.set(
        camPos.x + d.x * B.dist - tx * k,
        camPos.y + d.y * B.dist,
        camPos.z + d.z * B.dist - tz * k,
      );
      B.root.scale.setScalar(sc);
      B.mat.uniforms.uRot.value = time * B.rot;
    }
  }

  clear() {
    this.jobs.length = 0;
    for (const o of this.trash) o.dispose();
    this.trash.length = 0;
    this.group.clear();
    this.bodies.length = 0;
  }

  dispose() {
    this.clear();
    this.surfMats.forEach((m) => m.dispose());
    this.surfMats.clear();
  }
}
