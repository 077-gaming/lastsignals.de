// Grafikspeicher der Schiffstexturen messen (nur Entwicklung, Dev-Server + Google Chrome, läuft unsichtbar).
// Zählt jede Textur-/Renderpuffer-Belegung aller WebGL-Kontexte der Seite mit (texStorage2D/texImage2D/
// renderbufferStorage, freigegeben bei deleteTexture/deleteRenderbuffer) und meldet Spitzen- und Endwert.
// Ablauf: Station andocken, Hangar öffnen, alle 8 Klassen als eigenes Schiff durchschalten (4K je eigenes Schiff),
// dann in der Schiffswerft alle Klassen durchblättern (Standbilder, ohne 4K), Hangar verlassen.
// Aufruf: node tools/bilder/speicher.mjs [basis-url]   Q=high|ultra · DESKTOP=1 (window.lsDesktop) · F=europa
import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://localhost:5198';
const q = process.env.Q || 'ultra';
const desktop = process.env.DESKTOP === '1';
const f = process.env.F || 'europa';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
await page.addInitScript(([q, desktop]) => {
  localStorage.setItem('ls.settings', JSON.stringify({ camera: 'chase', quality: q, qualityAuto: false, rev: 2 }));
  localStorage.setItem('ls.qauto', JSON.stringify({ quality: '-' }));
  if (desktop) window.lsDesktop = true;
  const BPP = { 0x8058: 4, 0x8C43: 4, 0x1908: 4, 0x8051: 3, 0x1907: 3, 0x8229: 1, 0x822B: 2, 0x881A: 8, 0x8814: 16, 0x88F0: 4, 0x81A6: 3, 0x8CAC: 4, 0x8D48: 1, 0x822E: 4, 0x8C3A: 4, 0x8C41: 3 };
  const M = (window.__gpuMem = { now: 0, peak: 0, tex: new Map(), rb: new Map(), log: [] });
  const add = (map, obj, bytes) => { M.now += bytes - (map.get(obj) || 0); map.set(obj, bytes); if (M.now > M.peak) M.peak = M.now; };
  const patch = (C) => {
    if (!C) return;
    const P = C.prototype, cur = new WeakMap();
    const bt = P.bindTexture; P.bindTexture = function (t, x) { let c = cur.get(this); if (!c) cur.set(this, (c = {})); c[t] = x; return bt.call(this, t, x); };
    const tex = (gl, t) => (cur.get(gl) || {})[t === 0x8513 || (t >= 0x8515 && t <= 0x851A) ? 0x8513 : t];
    const ts = P.texStorage2D; if (ts) P.texStorage2D = function (t, lv, fmt, w, h) {
      let b = 0; for (let i = 0; i < lv; i++) b += Math.max(1, w >> i) * Math.max(1, h >> i) * (BPP[fmt] || 4);
      const o = tex(this, t); if (o) add(M.tex, o, b * (t === 0x8513 ? 6 : 1)); return ts.apply(this, arguments);
    };
    const ti = P.texImage2D; P.texImage2D = function (t, lv, fmt, w, h) {
      const o = tex(this, t);
      if (o && lv === 0 && typeof w === 'number' && arguments.length >= 9) add(M.tex, o, w * h * (BPP[fmt] || 4) * 1.333);
      else if (o && lv === 0 && arguments.length === 6 && arguments[5] && arguments[5].width) add(M.tex, o, arguments[5].width * arguments[5].height * 4 * 1.333);
      return ti.apply(this, arguments);
    };
    const dt = P.deleteTexture; P.deleteTexture = function (o) { M.dels = (M.dels || 0) + 1; if (M.tex.has(o)) { M.now -= M.tex.get(o); M.tex.delete(o); } return dt.call(this, o); };
    const brb = P.bindRenderbuffer, rbc = new WeakMap(); P.bindRenderbuffer = function (t, r) { rbc.set(this, r); return brb.call(this, t, r); };
    const bpp = (fmt) => BPP[fmt] || 4;
    const rs = P.renderbufferStorage; P.renderbufferStorage = function (t, fmt, w, h) { const r = rbc.get(this); if (r) add(M.rb, r, w * h * bpp(fmt)); return rs.apply(this, arguments); };
    const rsm = P.renderbufferStorageMultisample; if (rsm) P.renderbufferStorageMultisample = function (t, s, fmt, w, h) { const r = rbc.get(this); if (r) add(M.rb, r, w * h * bpp(fmt) * Math.max(1, s)); return rsm.apply(this, arguments); };
    const dr = P.deleteRenderbuffer; P.deleteRenderbuffer = function (r) { if (M.rb.has(r)) { M.now -= M.rb.get(r); M.rb.delete(r); } return dr.call(this, r); };
  };
  patch(window.WebGL2RenderingContext); patch(window.WebGLRenderingContext);
}, [q, desktop]);
const MB = (b) => +(b / 1048576).toFixed(1);
const snap = async (label) => {
  const m = await page.evaluate(() => ({ big: [...window.__gpuMem.tex.values()].filter((b) => b >= 60 * 1048576).length, dels: window.__gpuMem.dels, n: window.__gpuMem.tex.size, now: window.__gpuMem.now, peak: window.__gpuMem.peak, hd: [...(window.__lsBay?.factory.glb.values() || [])].filter((w) => w.userData.hdTex).length }));
  console.log(label.padEnd(34), 'Texturen', m.n, '(4K:', m.big + ')', 'jetzt', MB(m.now), 'MB · Spitze', MB(m.peak), 'MB · 4K-Rümpfe im Hangar', m.hd);
  return m;
};
await page.goto(`${base}/?dev=dock&f=${f}`);
await page.waitForFunction(() => window.__ls?.world?.player, null, { timeout: 30000 });
await page.waitForTimeout(4000);
await snap('angedockt');
await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click());
await page.waitForTimeout(4000);
await snap('Hangar (Starter)');
for (const sh of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
  await page.evaluate((sh) => {
    const w = __ls.world, p = w.profile; p.ship = sh; w.player.ship = sh; __ls.bus?.emit?.('profile', p);
    document.querySelector('[data-act="tab"][data-tab="shop"]')?.click();
  }, sh);
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="hangar"]')?.click());
  await page.waitForFunction(() => window.__lsBay && window.__lsBay.pending.size === 0, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await snap(`eigenes Schiff ${sh}`);
}
// Schiffswerft: alle Klassen durchblättern (Standbilder der Werft, kein 4K)
await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="shop"]')?.click());
await page.waitForTimeout(1500);
const n = await page.evaluate(() => document.querySelectorAll('[data-act="pick"], [data-act="sel"], [data-ship]').length);
await page.evaluate(async (f) => {
  const b = window.__lsBay; if (!b) return;
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) { b.snapshot(f, s, 340, 190, false); await new Promise((r) => setTimeout(r, 1200)); }
  for (const s of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) { b.snapshot(f, s, 340, 190, false); await new Promise((r) => setTimeout(r, 300)); }
}, f);
await page.waitForFunction(() => window.__lsBay && window.__lsBay.pending.size === 0, null, { timeout: 60000 }).catch(() => {});
await snap(`Werft durchgeblättert (${n} Karten)`);
// Hangar verlassen (Station schließen bzw. Reiter wechseln → bay.stop)
await page.evaluate(() => document.querySelector('[data-act="tab"][data-tab="ore"]')?.click());
await page.waitForTimeout(1500);
const end = await snap('Hangar verlassen');
console.log(JSON.stringify({ q, desktop, peakMB: MB(end.peak), endMB: MB(end.now), tex4k: end.big }));
await browser.close();
