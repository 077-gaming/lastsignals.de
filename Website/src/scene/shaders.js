// Shader der Startseiten-Szene. Himmel und Planetenoberfläche werden einmal in Texturen gebacken,
// danach kostet jedes Bild nur noch eine Texturabfrage plus Licht.

const NOISE = /* glsl */ `
float hash31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i), n100 = hash31(i + vec3(1,0,0)), n010 = hash31(i + vec3(0,1,0)), n110 = hash31(i + vec3(1,1,0));
  float n001 = hash31(i + vec3(0,0,1)), n101 = hash31(i + vec3(1,0,1)), n011 = hash31(i + vec3(0,1,1)), n111 = hash31(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export const RING_DENSITY = /* glsl */ `
float ringHash(float x){ return fract(sin(x * 91.345) * 47453.5453); }
float ringNoise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(ringHash(i), ringHash(i + 1.0), f); }
// Dichte der Saturnringe von innen (x = 0) nach außen (x = 1): C-Ring, B-Ring, Cassini-Teilung, A-Ring mit Encke-Lücke.
// Feine Struktur aus Rauschen in mehreren Größen statt gleichmäßiger Rillen.
float ringDensity(float r, float rin, float rout){
  float x = (r - rin) / (rout - rin);
  if (x < 0.0 || x > 1.0) return 0.0;
  float n = (ringNoise(x * 36.0) - 0.5) * 0.34 + (ringNoise(x * 140.0 + 3.0) - 0.5) * 0.2 + (ringNoise(x * 520.0 + 7.0) - 0.5) * 0.1;
  float c = 0.18 + n * 0.4;                                  // C-Ring: dünn, durchscheinend
  float bR = 0.86 + n;                                       // B-Ring: dicht und hell
  float aR = 0.62 + n * 0.8;                                 // A-Ring: mittel
  float d = mix(c, bR, smoothstep(0.17, 0.27, x));
  d = mix(d, 0.04 + n * 0.05, smoothstep(0.575, 0.592, x)); // Cassini-Teilung
  d = mix(d, aR, smoothstep(0.638, 0.655, x));
  d *= 1.0 - 0.8 * (smoothstep(0.87, 0.876, x) - smoothstep(0.884, 0.89, x)); // Encke-Lücke
  d *= smoothstep(0.0, 0.035, x) * (1.0 - smoothstep(0.93, 1.0, x));
  return clamp(d, 0.0, 1.0);
}
// Farbe der Ringe: C grau-braun, B warm cremefarben, A etwas kühler
vec3 ringColor(float r, float rin, float rout){
  float x = clamp((r - rin) / (rout - rin), 0.0, 1.0);
  vec3 cR = vec3(0.46, 0.40, 0.34), bR = vec3(0.96, 0.85, 0.66), aR = vec3(0.82, 0.76, 0.66);
  vec3 col = mix(cR, bR, smoothstep(0.17, 0.32, x));
  col = mix(col, aR, smoothstep(0.6, 0.7, x));
  return col * (0.92 + 0.16 * ringNoise(x * 90.0));
}
`;

// Vollbild-Viereck für das Backen (uv -> Richtung bzw. Breite/Länge)
export const BAKE_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Milchstraße als Equirect-Textur: Band, heller Kern, Staubbahnen, schwache Nebel
export const SKY_BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uPole; uniform vec3 uCore;
${NOISE}
void main(){
  float lon = (vUv.x - 0.5) * 6.2831853;
  float lat = (vUv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * sin(lon), sin(lat), -cos(lat) * cos(lon));
  float gl = dot(d, uPole);
  float core = max(dot(d, uCore), 0.0);
  float n1 = fbm(d * 2.6);
  float n2 = fbm(d * 7.5 + 3.1);
  float n3 = fbm(d * 18.0 + 7.7);
  float width = 0.15 + 0.05 * n1 + 0.1 * pow(core, 3.0);
  float band = exp(-pow(gl / width, 2.0));
  float glow = band * (0.32 + 0.68 * n2) * (0.45 + 1.8 * pow(core, 5.0));
  glow += exp(-pow(gl / 0.5, 2.0)) * 0.05 * n1;
  float dust = smoothstep(0.42, 0.72, fbm(d * 5.0 + 17.0) + 0.15 * n3) * exp(-pow((gl - 0.01) / 0.055, 2.0));
  glow *= 1.0 - 0.85 * dust;
  glow *= 0.8 + 0.4 * n3;
  vec3 warm = vec3(1.0, 0.82, 0.62), cool = vec3(0.6, 0.68, 0.9);
  vec3 col = mix(cool, warm, clamp(pow(core, 2.0) * 1.3 + (n2 - 0.5) * 0.4, 0.0, 1.0)) * glow * 0.2;
  // schwache Gas-Nebel abseits
  float neb = smoothstep(0.62, 0.86, fbm(d * 3.2 + 41.0)) * 0.025;
  col += neb * mix(vec3(0.5, 0.25, 0.4), vec3(0.2, 0.32, 0.5), n2);
  col += vec3(0.004, 0.006, 0.01);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }
`;
export const SKY_FRAG = /* glsl */ `
uniform sampler2D uSky;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  vec2 uv = vec2(atan(d.x, -d.z) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415927 + 0.5);
  vec3 c = texture2D(uSky, uv).rgb;
  // Ditherung gegen Stufen im Dunkeln
  float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  c += (r - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Sterne: Farbe nach Spektralklasse, Helligkeit nach Größe, leichtes Funkeln
export const STAR_VERT = /* glsl */ `
attribute float aMag; attribute vec3 aCol; attribute float aPhase;
uniform float uTime; uniform float uPR;
varying vec3 vCol; varying float vB; varying float vBig;
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  float tw = 1.0 - 0.22 * (0.5 + 0.5 * sin(uTime * (1.3 + aPhase * 2.1) + aPhase * 61.0)) * smoothstep(0.1, 0.6, aMag);
  vB = (0.18 + aMag * 1.9) * tw;
  vBig = smoothstep(0.55, 0.95, aMag);
  vCol = aCol;
  gl_PointSize = (1.6 + aMag * 5.2 + vBig * 8.0) * uPR;
}
`;
export const STAR_FRAG = /* glsl */ `
varying vec3 vCol; varying float vB; varying float vBig;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float core = exp(-r2 * mix(14.0, 34.0, vBig));
  float halo = exp(-r2 * 4.0) * 0.18 * vBig;
  float spike = (max(0.0, 1.0 - abs(p.x) * 26.0) * (1.0 - abs(p.y)) + max(0.0, 1.0 - abs(p.y) * 26.0) * (1.0 - abs(p.x))) * 0.5 * vBig;
  float a = core + halo + spike;
  gl_FragColor = vec4(vCol * a * vB, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Gasriese als Textur (Länge/Breite): Bänder, Wirbel, Polkappen
export const PLANET_BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
${NOISE}
void main(){
  float lon = vUv.x * 6.2831853;
  float lat = (vUv.y - 0.5) * 2.0; // -1..1 (sin der Breite)
  vec3 p = vec3(cos(lon), 0.0, sin(lon));
  float warp = fbm(vec3(lat * 9.0, p.x * 1.4, p.z * 1.4)) - 0.5;
  float fine = fbm(vec3(lat * 70.0 + warp * 6.0, p.x * 5.0, p.z * 5.0));
  float y = lat + warp * 0.035;
  float b1 = 0.5 + 0.5 * sin(y * 30.0);
  float b2 = 0.5 + 0.5 * sin(y * 11.0 + 1.2);
  float b3 = 0.5 + 0.5 * sin(y * 72.0 + fine * 2.0);
  vec3 cream = vec3(0.89, 0.8, 0.6), tan = vec3(0.72, 0.58, 0.38), pale = vec3(0.95, 0.9, 0.77), rust = vec3(0.62, 0.45, 0.3);
  vec3 c = mix(tan, cream, b2);
  c = mix(c, pale, b1 * 0.35);
  c = mix(c, rust, smoothstep(0.7, 1.0, b3) * 0.18 * (1.0 - abs(lat)));
  c *= 0.9 + 0.2 * fine;
  // ruhiger Äquator, kühle Pole
  c = mix(c, pale, exp(-pow(lat / 0.09, 2.0)) * 0.3);
  c = mix(c, vec3(0.5, 0.57, 0.6), smoothstep(0.78, 0.97, abs(lat)) * 0.65);
  gl_FragColor = vec4(c, 1.0);
}
`;

export const PLANET_VERT = /* glsl */ `
varying vec3 vObjN; varying vec3 vWN; varying vec3 vWP;
void main(){
  vObjN = normalize(position);
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
export const PLANET_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uCenter; uniform vec3 uRingN;
uniform float uR; uniform float uRin; uniform float uRout; uniform float uSpin; uniform vec3 uRim; uniform float uGain;
uniform float uWarm;
varying vec3 vObjN; varying vec3 vWN; varying vec3 vWP;
${RING_DENSITY}
void main(){
  float lon = atan(vObjN.z, vObjN.x) / 6.2831853 + 0.5 + uSpin;
  vec3 col = texture2D(uTex, vec2(fract(lon), vObjN.y * 0.5 + 0.5)).rgb;
  vec3 N = normalize(vWN);
  vec3 V = normalize(cameraPosition - vWP);
  float ndl = dot(N, uSun);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  // weicher Terminator, leichte Randverdunklung
  float diff = smoothstep(-0.12, 0.3, ndl) * (0.25 + 0.75 * clamp(ndl, 0.0, 1.0));
  col *= 0.42 + 0.58 * pow(mu, 0.55); // deutlichere Randverdunklung, damit der Planet als Kugel liest
  // warmer Saum an der Tag-Nacht-Grenze (Gasriesen)
  float term = exp(-pow((ndl - 0.04) / 0.14, 2.0));
  col *= mix(vec3(1.0), vec3(1.18, 0.9, 0.7), term * uWarm);
  // weicher Schatten der Ringe auf dem Planeten (drei Proben quer zur Kante)
  float sh = 1.0;
  float den = dot(uSun, uRingN);
  if (uRout > 0.0 && abs(den) > 1e-4) {
    float t = dot(uCenter - vWP, uRingN) / den;
    if (t > 0.0) {
      float r = length(vWP + uSun * t - uCenter);
      float w = uR * 0.03;
      float d = (ringDensity(r - w, uRin, uRout) + ringDensity(r, uRin, uRout) + ringDensity(r + w, uRin, uRout)) / 3.0;
      sh = 1.0 - 0.6 * d;
    }
  }
  vec3 c = col * diff * sh * uGain;
  // Umgebungslicht: auch die Nachtseite bleibt als Körper lesbar
  c += col * 0.035;
  float rimLit = pow(1.0 - mu, 2.6) * smoothstep(-0.25, 0.5, ndl);
  c += uRim * rimLit * 0.5;
  // schwaches Kantenlicht von der Kamera aus, damit kein Planet als schwarze Scheibe erscheint
  c += uRim * pow(1.0 - mu, 4.0) * 0.1;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ATMO_VERT = /* glsl */ `
varying vec3 vWN; varying vec3 vWP;
void main(){ vWN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uColor; uniform float uEdge; uniform float uFwd;
varying vec3 vWN; varying vec3 vWP;
void main(){
  vec3 N = normalize(vWN); vec3 V = normalize(cameraPosition - vWP);
  float f = pow(smoothstep(0.0, uEdge, abs(dot(N, V))), 1.7);
  float lit = smoothstep(-0.25, 0.55, dot(N, uSun));
  // Gegenlicht: Atmosphäre leuchtet am Rand, wenn die Sonne dahinter steht
  float fwd = pow(max(dot(-V, uSun), 0.0), 6.0) * uFwd * smoothstep(-0.5, 0.15, dot(N, uSun));
  gl_FragColor = vec4(uColor * f * (lit * 0.6 + fwd * 2.2), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const RING_VERT = /* glsl */ `
varying vec3 vWP;
void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }
`;
export const RING_FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uCenter; uniform vec3 uRingN; uniform float uR; uniform float uRin; uniform float uRout;
varying vec3 vWP;
${RING_DENSITY}
void main(){
  float r = length(vWP - uCenter);
  float d = ringDensity(r, uRin, uRout);
  if (d < 0.004) discard;
  // weicher Schatten des Planeten: Abstand zur Schattenachse
  vec3 oc = vWP - uCenter;
  float b = dot(oc, uSun);
  float axis = length(oc - uSun * b);
  float shadow = b < 0.0 ? smoothstep(uR * 0.9, uR * 1.08, axis) : 1.0;
  shadow = mix(0.03, 1.0, shadow);
  vec3 V = normalize(cameraPosition - vWP);
  float ndl = abs(dot(uRingN, uSun));
  float same = sign(dot(uRingN, uSun)) * sign(dot(uRingN, V));
  // beleuchtete Seite: Albedo; Rückseite: dünne Bereiche lassen Licht durch, dichte bleiben dunkel
  float front = 0.3 + 0.7 * ndl;
  float back = (1.0 - d) * 0.9 + 0.08;
  float lit = same >= 0.0 ? front : back * (0.4 + 0.6 * ndl);
  // Vorwärtsstreuung, wenn man gegen die Sonne durch die Ringe sieht
  lit += pow(max(dot(-V, uSun), 0.0), 8.0) * (1.0 - d) * 0.8;
  vec3 col = ringColor(r, uRin, uRout);
  gl_FragColor = vec4(col * lit * shadow * 1.45, clamp(d * 0.92, 0.0, 0.95));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Staub, der am Schiff vorbeizieht (Gefühl von Flug)
export const DUST_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime; uniform float uPR; uniform vec3 uBox; uniform vec3 uVel;
varying float vA;
void main(){
  vec3 p = position + uVel * uTime;
  p = mod(p + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 e = abs(p) / (uBox * 0.5);
  vA = (1.0 - smoothstep(0.7, 1.0, max(max(e.x, e.y), e.z))) * (0.35 + 0.65 * aSeed);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((1.2 + aSeed * 1.6) * uPR * 22.0 / -mv.z, 0.0, 6.0 * uPR);
}
`;
export const DUST_FRAG = /* glsl */ `
varying float vA;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(p, p) * 5.0) * vA * 0.45;
  gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, 1.0);
}
`;

// Allgemeine Planetenoberfläche: 0 Gasriese, 1 Erde, 2 Eismond/Zwergplanet, 3 Eisriese
export const SURFACE_BAKE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform int uKind; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uC4; uniform float uSeed; uniform float uBands; uniform float uSpot;
${NOISE}
void main(){
  float lon = vUv.x * 6.2831853;
  float sl = (vUv.y - 0.5) * 2.0;
  float cl = sqrt(max(0.0, 1.0 - sl * sl));
  vec3 p = vec3(cl * cos(lon), sl, cl * sin(lon)) + uSeed;
  vec3 c; float a = 0.0;
  if (uKind == 0) {
    float warp = fbm(vec3(sl * 9.0, p.x * 1.4, p.z * 1.4)) - 0.5;
    float fine = fbm(vec3(sl * 70.0 + warp * 6.0, p.x * 5.0, p.z * 5.0));
    float y = sl + warp * 0.04;
    float b1 = 0.5 + 0.5 * sin(y * uBands);
    float b2 = 0.5 + 0.5 * sin(y * uBands * 0.37 + 1.2);
    float b3 = 0.5 + 0.5 * sin(y * uBands * 2.4 + fine * 2.0);
    c = mix(uC2, uC1, smoothstep(0.15, 0.85, b2));
    c = mix(c, uC3, smoothstep(0.4, 1.0, b1) * 0.45);
    c = mix(c, uC4, smoothstep(0.7, 1.0, b3) * 0.28 * (1.0 - abs(sl)));
    c *= 0.9 + 0.2 * fine;
    c = mix(c, uC3, exp(-pow(sl / 0.09, 2.0)) * 0.3);
    c = mix(c, vec3(0.5, 0.55, 0.58) * (uC1 + uC2) * 0.6, smoothstep(0.8, 0.97, abs(sl)) * 0.55);
    // großer Wirbel (nur wenn uC4 rötlich)
    vec2 sp = vec2((fract(vUv.x + 0.18) - 0.5) * 6.0, (sl + 0.36) * 22.0);
    float spot = exp(-dot(sp, sp) * 1.4) * uSpot;
    c = mix(c, uC4 * 1.15, spot * 0.8);
  } else if (uKind == 1) {
    float n = fbm(p * 1.7);
    float d = fbm(p * 5.0 + 4.0);
    float land = smoothstep(0.515, 0.535, n + 0.04 * d);
    vec3 ocean = mix(vec3(0.015, 0.06, 0.16), vec3(0.03, 0.13, 0.28), smoothstep(0.35, 0.52, n));
    float dry = smoothstep(0.45, 0.62, fbm(p * 3.0 + 9.0)) * (1.0 - smoothstep(0.55, 0.75, abs(sl)));
    vec3 ground = mix(vec3(0.07, 0.11, 0.05), vec3(0.32, 0.25, 0.16), dry);
    ground *= 0.75 + 0.5 * d;
    c = mix(ocean, ground, land);
    float ice = smoothstep(0.84, 0.9, abs(sl) + 0.05 * d);
    c = mix(c, vec3(0.85, 0.88, 0.92), ice);
    float cw = fbm(p * 2.2 + 21.0);
    float cloud = smoothstep(0.5, 0.68, fbm(p * 4.5 + vec3(cw * 2.0, 0.0, cw)));
    c = mix(c, vec3(0.93, 0.95, 0.98), cloud * 0.85);
    a = (1.0 - land) * (1.0 - ice) * (1.0 - cloud);
  } else if (uKind == 4) {
    // Nachtlichter der Erde: Siedlungen an Land, dichter an Küsten, nicht im Eis (r = Licht, g = Flackerphase)
    float n = fbm(p * 1.7);
    float d = fbm(p * 5.0 + 4.0);
    float land = smoothstep(0.515, 0.535, n + 0.04 * d);
    float coast = 1.0 - smoothstep(0.0, 0.05, abs(n + 0.04 * d - 0.525));
    float ice = smoothstep(0.8, 0.88, abs(sl) + 0.05 * d);
    float region = smoothstep(0.48, 0.66, fbm(p * 3.4 + 13.0));
    float speck = pow(vnoise(p * 260.0), 12.0) * 6.0 + pow(vnoise(p * 90.0), 10.0) * 1.5;
    float lights = clamp(speck * land * (0.1 + region * 0.7 + coast * 0.6) * (1.0 - ice), 0.0, 1.0);
    lights *= step(0.62, hash31(floor(p * 9.0))); // ganze Regionen dunkel: die Stille
    c = vec3(lights, hash31(floor(p * 60.0)), 0.0);
  } else if (uKind == 2) {
    float n = fbm(p * 3.0);
    float cr = abs(fbm(p * 6.0 + 3.0) - 0.5);
    float lines = 1.0 - smoothstep(0.0, 0.025, cr);
    float cr2 = abs(fbm(p * 13.0 + 7.0) - 0.5);
    lines = max(lines, (1.0 - smoothstep(0.0, 0.018, cr2)) * 0.6);
    c = mix(uC1, uC2, n);
    c = mix(c, uC3, lines * uBands);
    c *= 0.88 + 0.24 * fbm(p * 24.0);
  } else {
    float n = fbm(vec3(sl * 6.0, p.x, p.z));
    float b = 0.5 + 0.5 * sin(sl * uBands + n * 1.5);
    c = mix(uC1, uC2, b * 0.35 + n * 0.2);
    c = mix(c, uC3, smoothstep(0.75, 1.0, abs(sl)) * 0.4);
  }
  gl_FragColor = vec4(c, a);
}
`;

// Erde: Tagseite mit Ozeanglanz, warmer Terminator, Nachtseite mit wenigen, flackernden Stadtlichtern,
// dünner heller Atmosphärensaum
export const EARTH_FRAG = /* glsl */ `
uniform sampler2D uTex; uniform sampler2D uNight; uniform vec3 uSun; uniform float uSpin; uniform float uTime;
varying vec3 vObjN; varying vec3 vWN; varying vec3 vWP;
void main(){
  float lon = atan(vObjN.z, vObjN.x) / 6.2831853 + 0.5 + uSpin;
  vec2 uv = vec2(fract(lon), vObjN.y * 0.5 + 0.5);
  vec4 t = texture2D(uTex, uv);
  vec4 nl = texture2D(uNight, uv);
  vec3 N = normalize(vWN); vec3 V = normalize(cameraPosition - vWP);
  float ndl = dot(N, uSun);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float day = smoothstep(-0.1, 0.2, ndl);
  float diff = clamp(ndl, 0.0, 1.0);
  vec3 c = t.rgb * (0.12 + 1.9 * diff) * day;
  float term = exp(-pow((ndl - 0.02) / 0.11, 2.0));
  c *= mix(vec3(1.0), vec3(1.35, 0.82, 0.55), term * 0.7);
  vec3 H = normalize(uSun + V);
  c += vec3(1.0, 0.93, 0.82) * pow(max(dot(N, H), 0.0), 70.0) * t.a * day * 1.4;
  // Stadtlichter: nur auf der Nachtseite, einzelne erlöschen und flackern
  float night = 1.0 - smoothstep(-0.18, 0.05, ndl);
  float flick = 0.65 + 0.35 * sin(uTime * (0.7 + nl.g * 3.0) + nl.g * 40.0);
  c += vec3(1.0, 0.7, 0.36) * nl.r * night * flick * 0.9;
  c += t.rgb * 0.012; // Erdlicht vom Mond
  // schwaches Nachthimmelleuchten: die Nachtseite bleibt ein blauer Körper, kein schwarzes Loch
  c += vec3(0.010, 0.024, 0.055) * night * (0.4 + 0.6 * pow(1.0 - mu, 1.5));
  // dünner, heller Atmosphärensaum auf der Tagseite, rötlich am Terminator
  float rim = pow(1.0 - mu, 4.0);
  float fwd = pow(max(dot(-V, uSun), 0.0), 3.0);
  vec3 sky = mix(vec3(0.32, 0.58, 1.0), vec3(1.0, 0.55, 0.35), term * 0.6);
  // Gegenlicht nur am sonnenseitigen Rand: eine Sichel statt eines gleichmäßigen Rings um die Scheibe
  c += sky * rim * (smoothstep(-0.25, 0.45, ndl) * 1.5 + fwd * 1.6 * smoothstep(-0.45, 0.12, ndl));
  c = mix(c, vec3(0.3, 0.52, 0.95) * (0.15 + diff), pow(1.0 - mu, 2.2) * 0.3 * day);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Leuchtpunkte (Sonne, Schwarm-Lichter, Gefängnisring): weiche Scheibe, Größe in Pixeln oder Welt
export const GLOW_VERT = /* glsl */ `
attribute vec3 aCol; attribute float aSize;
uniform float uPR; uniform float uScale; uniform float uTime;
varying vec3 vCol;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float fl = 0.75 + 0.25 * sin(uTime * 3.1 + position.x * 7.0 + position.y * 3.0);
  vCol = aCol * fl;
  gl_PointSize = clamp(aSize * uScale * uPR / -mv.z, 1.5 * uPR, 40.0 * uPR);
}
`;
export const GLOW_FRAG = /* glsl */ `
varying vec3 vCol;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float a = exp(-r2 * 9.0) + exp(-r2 * 2.5) * 0.15;
  gl_FragColor = vec4(vCol * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Gürtel (Asteroiden, Kuiper): viele schwache Punkte, Größe nach Entfernung
export const BELT_VERT = /* glsl */ `
attribute float aSeed;
uniform float uPR; uniform float uTime; uniform float uFade;
varying float vA;
void main(){
  float ang = uTime * (0.002 + aSeed * 0.001);
  vec3 q = vec3(position.x * cos(ang) - position.z * sin(ang), position.y, position.x * sin(ang) + position.z * cos(ang));
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = -mv.z;
  vA = (0.25 + 0.75 * aSeed) * uFade * clamp(400.0 / d, 0.15, 1.0);
  gl_PointSize = clamp((0.8 + aSeed * 2.4) * uPR * 260.0 / d, 0.8 * uPR, 3.5 * uPR);
}
`;
export const BELT_FRAG = /* glsl */ `
varying float vA;
void main(){
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(p, p) * 4.0) * vA;
  gl_FragColor = vec4(vec3(0.82, 0.8, 0.76) * a, 1.0);
}
`;
