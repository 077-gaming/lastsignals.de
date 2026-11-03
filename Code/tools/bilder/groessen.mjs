// Größenstaffelung in der Verfolgersicht: gleiche Szene (Lage, Kurs, Fraktion) für mehrere Klassen, Bildanteil des
// Rumpfs messen und Bilder nebeneinander legen. Nur Entwicklung, unsichtbar (headless).
// Aufruf: node tools/bilder/groessen.mjs <ausgabeordner> [basis-url]
//   KLASSEN=s1,…,s8 · F=europa[,eris] · Q=high
//   KAMPF=1  drei Raider vor dem Schiff, Angriff an (Kamera im Kampfmodus, ck → 1)
//   HUD=1    HUD sichtbar; misst die Oberkante des unteren HUD-Bands (SYS·03 SCHIFF, Schnellleiste)
// Messwerte je Klasse (Anteile des Bildes): breite/hoehe (Hüllrechteck), flaeche (konvexe Hülle der projizierten
// Rumpfpunkte), unten (Unterkante des Rumpfs, 0 = oben … 1 = unten), hudOben (Oberkante HUD-Band), heckFrei (Rumpf
// vollständig über dem HUD-Band), mitteFrei (Bildmitte und Flugachse vor dem Bug nicht vom Rumpf verdeckt), gier
// (Kameraversatz zur Flugrichtung in Grad), zielFrei (Kampf: Zielmarke auf dem Gegner und Zielbogen – Strecke vom
// Bug zum Ziel ab 1,3 Radien – werden nicht vom Rumpf verdeckt; Strahltest je Punkt gegen die Dreiecke des Rumpfs).
// Runde 4: Abbruch (Rückgabewert 2), wenn Fläche UND Höhe nicht streng steigen: je Fraktion und Ansicht jede Klasse
// mindestens STUFE (Standard 0,08 = +8 %) größer als die vorige, bei vollständiger Reihe auch Schiff 8 die größte Fläche.
// PRUEF=0 schaltet die Prüfung ab (nur messen).
import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = process.argv[2] || 'groessen';
const base = process.argv[3] || 'http://localhost:5198';
const classes = (process.env.KLASSEN || 's1,s2,s3,s4,s5,s6,s7,s8').split(',');
const facs = (process.env.F || 'europa').split(',');
const q = process.env.Q || 'high';
const kampf = process.env.KAMPF === '1';
const hud = process.env.HUD === '1';
const tag = (kampf ? '-kampf' : '') + (hud ? '-hud' : '');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const all = [];
for (const f of facs) {
  const res = [];
  for (const sh of classes) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
    await page.addInitScript((q) => {
      let a = 1234; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: q, qualityAuto: false, rev: 2 })); localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
    }, q);
    await page.goto(`${base}/?dev=game&f=${f}`);
    await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    await page.evaluate(([sh, kampf, fr]) => {
      __ls.series?.choose('direct');
      if (fr) Object.assign(__ls.renderer.rig.frame, fr); // Entwicklung: Rahmung probeweise überschreiben (RAHMEN='{…}')
      const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.renderer._playerDirty = true; __ls.bus?.emit?.('profile', p);
      w.player.x += 900; w.player.rot = 2.4; w.player.vx = 0; w.player.vz = 0;
      if (kampf) {
        const a = w.player.rot;
        for (let i = 0; i < 3; i++) { const e = w.spawnTemp('raider', w.player.x - Math.sin(a) * (560 + i * 60) + (i - 1) * 110, w.player.z - Math.cos(a) * (560 + i * 60)); w.provoke(e); if (!i) w.setTarget(e.id); }
        w.toggleAttack();
      }
    }, [sh, kampf, process.env.RAHMEN ? JSON.parse(process.env.RAHMEN) : null]);
    if (!hud) await page.addStyleTag({ content: '#hud{display:none!important}' });
    await page.waitForTimeout(8000);
    // Kampf: warten, bis die Kamera wirklich in der Kampf-Rahmung ist (sonst Ausreißer mit ck < 1)
    if (kampf) await page.waitForFunction(() => (__ls.renderer.combatK ?? 0) > 0.95, null, { timeout: 12000 }).catch(() => {});
    // Welt anhalten (gleiche Lage für die Messung), Grafik läuft weiter
    await page.evaluate(() => { const w = __ls.world; if (w.player) { w.player.vx = 0; w.player.vz = 0; } });
    const m = await page.evaluate(() => {
      const R = __ls.renderer, v = R.views.get(__ls.world.player.id), cam = R.camera;
      const pts = [], p = new (cam.position.constructor)();
      const box = { x0: 1, x1: -1, y0: 1, y1: -1 };
      v.root.updateMatrixWorld(true);
      v.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || o.material?.isShaderMaterial || o.material?.blending === 2) return;
        for (let q = o; q; q = q.parent) if (!q.visible) return;
        const P = o.geometry.attributes.position, st = Math.max(1, Math.floor(P.count / 4000));
        for (let i = 0; i < P.count; i += st) {
          p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld).project(cam); if (p.z > 1) continue;
          box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y);
          pts.push([p.x, p.y]);
        }
      });
      // konvexe Hülle (Andrew) in NDC, Fläche als Bildanteil (NDC-Fläche 4)
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const pt of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pt) <= 0) lo.pop(); lo.push(pt); }
      for (let i = pts.length - 1; i >= 0; i--) { const pt = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pt) <= 0) up.pop(); up.push(pt); }
      const hull = lo.slice(0, -1).concat(up.slice(0, -1));
      let A = 0; for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; A += a[0] * b[1] - b[0] * a[1]; }
      const inside = (x, y) => { if (hull.length < 3) return false; for (let i = 0; i < hull.length; i++) { const a = hull[i], b = hull[(i + 1) % hull.length]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false; } return true; };
      // Flugachse vor dem Bug: Punkte 1,1 … 6 Radien vor dem Rumpf
      const e = __ls.world.player, fx = -Math.sin(v.rrot ?? e.rot), fz = -Math.cos(v.rrot ?? e.rot);
      let achse = true;
      for (let k = 1.1; k <= 6; k += 0.35) { p.set(v.root.position.x + fx * v.vr * k, v.root.position.y, v.root.position.z + fz * v.vr * k).project(cam); if (p.z < 1 && inside(p.x, p.y)) achse = false; }
      // unteres HUD-Band
      let hudTop = null;
      for (const sel of ['[data-win="ship"]', '[data-win="quick"]']) {
        const el = document.querySelector(sel); if (!el) continue;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.height < 4 || cs.display === 'none' || cs.visibility === 'hidden' || r.top < innerHeight * 0.4) continue;
        hudTop = hudTop === null ? r.top / innerHeight : Math.min(hudTop, r.top / innerHeight);
      }
      const unten = (1 - box.y0) / 2;
      // Verdeckung je Punkt (Strahl Kamera → Punkt gegen alle Dreiecke des Rumpfs samt Anbauteilen, Möller–Trumbore);
      // die konvexe Hülle wäre zu grob (Kerben und der Raum über dem Bug zählten als Rumpf)
      const tris = [];
      v.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position || o.material?.isShaderMaterial || o.material?.blending === 2) return;
        for (let q = o; q; q = q.parent) if (!q.visible) return;
        const P = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : P.count, a = new (cam.position.constructor)();
        const W = (k) => a.fromBufferAttribute(P, I ? I.getX(k) : k).applyMatrix4(o.matrixWorld).toArray();
        for (let k = 0; k + 2 < n; k += 3) tris.push(W(k), W(k + 1), W(k + 2));
      });
      const C = cam.position.toArray();
      const hidden = (pt) => {
        const d = [pt[0] - C[0], pt[1] - C[1], pt[2] - C[2]], L = Math.hypot(...d); d[0] /= L; d[1] /= L; d[2] /= L;
        for (let k = 0; k < tris.length; k += 3) {
          const A = tris[k], B = tris[k + 1], Cc = tris[k + 2];
          const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
          const pv2 = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
          const det = e1[0] * pv2[0] + e1[1] * pv2[1] + e1[2] * pv2[2]; if (Math.abs(det) < 1e-9) continue;
          const inv = 1 / det, tv = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
          const u = (tv[0] * pv2[0] + tv[1] * pv2[1] + tv[2] * pv2[2]) * inv; if (u < 0 || u > 1) continue;
          const qv = [tv[1] * e1[2] - tv[2] * e1[1], tv[2] * e1[0] - tv[0] * e1[2], tv[0] * e1[1] - tv[1] * e1[0]];
          const w2 = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv; if (w2 < 0 || u + w2 > 1) continue;
          const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv; if (t > 0 && t < L - 0.5) return true;
        }
        return false;
      };
      // Zielmarke und Zielbogen (Kampf): Ziel-Entity projizieren, Strecke Bug → Ziel ab 1,3 Radien
      let zielFrei = null, markeFrei = null, bogenFrei = null;
      const tg = __ls.world.player.targetId, tv = tg != null ? R.views.get(tg) : null;
      if (tv && tv.root) {
        const tp = tv.root.position; p.copy(tp).project(cam);
        markeFrei = !hidden(tp.toArray()); bogenFrei = true;
        const dx = tp.x - v.root.position.x, dz = tp.z - v.root.position.z, dl = Math.hypot(dx, dz) || 1;
        for (let k = 1.3; k * v.vr < dl; k += 0.25) { if (hidden([v.root.position.x + dx / dl * v.vr * k, v.root.position.y, v.root.position.z + dz / dl * v.vr * k])) { bogenFrei = false; break; } }
        zielFrei = markeFrei && bogenFrei;
      }
      const cd = new (cam.position.constructor)(); cam.getWorldDirection(cd);
      const gier = Math.atan2(fx * cd.z - fz * cd.x, fx * cd.x + fz * cd.z) * 180 / Math.PI;
      return {
        breite: +((box.x1 - box.x0) / 2).toFixed(3), hoehe: +((box.y1 - box.y0) / 2).toFixed(3), flaeche: +(Math.abs(A) / 2 / 4).toFixed(4),
        oben: +((1 - box.y1) / 2).toFixed(3), unten: +unten.toFixed(3), hudOben: hudTop === null ? null : +hudTop.toFixed(3),
        heckFrei: hudTop === null ? null : unten < hudTop, mitteFrei: !inside(0, 0) && achse, zielFrei, markeFrei, bogenFrei,
        radius: v.vr, abstand: +cam.position.distanceTo(v.root.position).toFixed(1), gier: +gier.toFixed(1), ck: +(R.combatK ?? 0).toFixed(2),
      };
    });
    const file = path.join(out, `${sh}-${f}-verfolger${tag}.png`);
    await page.screenshot({ path: file });
    res.push({ sh, f, kampf, hud, ...m, file });
    console.log(f, sh, JSON.stringify(m));
    await page.context().close();
  }
  // Zuwachs je Stufe (Fläche und Höhe)
  for (let i = 1; i < res.length; i++) { res[i].zuwachs = +(res[i].flaeche / res[i - 1].flaeche - 1).toFixed(3); res[i].zuwachsH = +(res[i].hoehe / res[i - 1].hoehe - 1).toFixed(3); }
  all.push(...res);
  // Kontaktbogen: zwei Reihen à vier Bilder mit Beschriftung
  const tw = 640, th = 360, cols = Math.min(4, res.length), rows = Math.ceil(res.length / cols);
  const tiles = await Promise.all(res.map(async (r) => {
    const lab = Buffer.from(`<svg width="${tw}" height="34"><rect width="${tw}" height="34" fill="#000" opacity="0.65"/><text x="10" y="24" font-family="Menlo" font-size="16" fill="#fff">${r.sh} ${f}${kampf ? ' KAMPF' : ''} · Fläche ${(r.flaeche * 100).toFixed(1)} %${r.zuwachs !== undefined ? ` (${r.zuwachs >= 0 ? '+' : ''}${(r.zuwachs * 100).toFixed(0)})` : ''} · Höhe ${(r.hoehe * 100).toFixed(1)} %${r.zuwachsH !== undefined ? ` (${r.zuwachsH >= 0 ? '+' : ''}${(r.zuwachsH * 100).toFixed(0)})` : ''}</text></svg>`);
    return sharp(r.file).resize(tw, th).composite([{ input: lab, left: 0, top: 0 }]).png().toBuffer();
  }));
  await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#000' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th }))).jpeg({ quality: 86 }).toFile(path.join(out, `staffelung-${f}${tag}.jpg`));
}
await browser.close();
await fs.writeFile(path.join(out, `groessen${tag}.json`), JSON.stringify(all, null, 1));
// Prüfung der Staffelung (Runde 4): Fläche und Höhe streng steigend, je Stufe mindestens STUFE
if (process.env.PRUEF !== '0') {
  const step = +(process.env.STUFE || 0.08), bad = [];
  for (const f of facs) {
    const r = all.filter((x) => x.f === f);
    for (let i = 1; i < r.length; i++) {
      if (r[i].zuwachs < step) bad.push(`${f} ${r[i - 1].sh}→${r[i].sh} Fläche ${(r[i - 1].flaeche * 100).toFixed(2)} → ${(r[i].flaeche * 100).toFixed(2)} % (${(r[i].zuwachs * 100).toFixed(1)} %)`);
      if (r[i].zuwachsH < step) bad.push(`${f} ${r[i - 1].sh}→${r[i].sh} Höhe ${(r[i - 1].hoehe * 100).toFixed(1)} → ${(r[i].hoehe * 100).toFixed(1)} % (${(r[i].zuwachsH * 100).toFixed(1)} %)`);
    }
    if (hud) for (const x of r) if (x.heckFrei === false) bad.push(`${f} ${x.sh} Heck im HUD-Band (Unterkante ${(x.unten * 100).toFixed(1)} %, HUD ${(x.hudOben * 100).toFixed(1)} %)`);
  }
  if (bad.length) { console.error('ABBRUCH Staffelung' + tag + ':\n  ' + bad.join('\n  ')); process.exit(2); }
  console.log(`Staffelung${tag} ok: Fläche und Höhe je Stufe ≥ +${(step * 100).toFixed(0)} % (${facs.join(', ')})`);
}
