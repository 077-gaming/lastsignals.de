// Nur Entwicklungsserver: Messung „Kampfszene mit Explosionen“ (window.__bench(sekunden)).
// Sperrt die adaptive Auflösung auf 100 %, stellt den Spieler neben den nächsten Gegner, greift an und
// löst alle 0,7 s eine Explosion aus. Liefert Mittelwerte aus renderer.stats.
export function installBench(renderer, world) {
  window.__bench = async (sec = 3, opts = {}) => {
    const R = renderer, W = world, P = W.player;
    R._perf.warm = 1e9;
    if (opts.scale !== false && R.scale !== 1) { R.scale = 1; R._applyPR(); }
    R.lowQuality = false;
    if (opts.combat !== false && !R.__benchSet) {
      let best = null, bd = Infinity;
      W.entities.forEach((e) => { if (e.kind === 'enemy' && e.alive !== false) { const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2; if (d < bd) { bd = d; best = e; } } });
      if (best) { P.x = best.x + 350; P.z = best.z + 200; P.px = P.x; P.pz = P.z; W.setTarget(best.id); if (!P.attacking) W.toggleAttack(); }
      R.__benchSet = true;
    }
    const boom = setInterval(() => R.bus.emit('explode', { id: null, x: P.x - 200 + Math.random() * 100, z: P.z - 150, size: 2.2 }), 700);
    await new Promise((r) => setTimeout(r, 600));
    let n = 0, gpu = 0, calls = 0, tris = 0, cpu = 0, last = performance.now();
    const t0 = last;
    const orig = R.render;
    // opts.load: Bilder je Bildschirmtakt (Standard 1). Hinweis: bei 60-Hz-Takt taktet die GPU herunter, die
    // Zeiten sind dann höher als bei echter 120-Hz-Last – nur Vorher/Nachher im selben Lauf vergleichen.
    const load = opts.load || 1;
    R.render = function (dt, a) {
      const t = performance.now();
      orig.call(this, dt, a);
      for (let k = 1; k < load; k++) orig.call(this, 0, a);
      cpu += (performance.now() - t) / load;
    };
    await new Promise((res) => {
      const f = () => {
        n++; const s = R.stats; gpu += R.gpuTimer.last; calls += s.calls; tris += s.tris;
        if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    R.render = orig;
    clearInterval(boom);
    const el = performance.now() - t0;
    const s = R.stats;
    return { load, fps: +(n * 1000 / el).toFixed(1), cpuMs: +(cpu / n).toFixed(2), gpuMs: +(gpu / n).toFixed(2), calls: Math.round(calls / n), tris: Math.round(tris / n), q: s.quality, pr: s.pr, buf: s.w + 'x' + s.h };
  };
}

// Mehrere Messungen nacheinander im Hintergrund (Ergebnis in window.__res): [[name, vorher, nachher], …]
if (typeof window !== 'undefined') {
  window.__runExp = (list, sec = 2) => {
    window.__res = { pending: true };
    (async () => {
      const o = {};
      for (const [k, set, undo] of list) { if (set) set(); o[k] = await window.__bench(sec); if (undo) undo(); }
      window.__res = o;
    })();
    return 'gestartet';
  };
}

// Messung ohne Bildschirmtakt (window.__drive): treibt Simulation und Grafik selbst an (auch wenn der Tab im
// Hintergrund liegt) und wartet nach jedem Bild auf die Grafikkarte (1-Pixel-Auslesen). Ergebnis: echte Bildzeit
// CPU + GPU in ms je Bild, daraus die mögliche Bildrate. opts: sec, combat (Spieler greift an), boom (Explosionen),
// adapt (adaptive Auflösung zulassen), first (nur die ersten n Bilder nach dem Angriff messen → Hänger beim ersten Kampf)
if (typeof window !== 'undefined') {
  window.__drive = async (o = {}) => {
    const R = window.__lsRenderer;
    if (!R || !R.world) return 'kein Renderer';
    const W = R.world, P = W.player, gl = R.gl.getContext();
    const sec = o.sec ?? 3, px = new Uint8Array(4);
    if (!o.adapt) R._perf.warm = 1e9;
    // Spielschleife anhalten (sonst zeichnet sie zwischen den Messbildern mit), danach fortsetzen
    const raf = window.requestAnimationFrame, held = [];
    const ms = [], parts = [];
    let calls = 0, tris = 0, sim = 0, k = 0, gpu = 0;
    window.requestAnimationFrame = (cb) => { held.push(cb); return 0; };
    try {
    const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    for (let i = 0; i < (o.pre ?? 20); i++) { W.update(1 / 60); R.render(1 / 60, 1); sync(); await new Promise((r) => setTimeout(r, 0)); }
    if (o.combat !== false) {
      let best = null, bd = Infinity;
      W.entities.forEach((e) => { if (e.kind === 'enemy' && e.alive !== false && e.type !== 'nest') { const d = (e.x - P.x) ** 2 + (e.z - P.z) ** 2; if (d < bd) { bd = d; best = e; } } });
      if (best) { P.x = best.x + 350; P.z = best.z + 200; P.px = P.x; P.pz = P.z; W.setTarget(best.id); if (!P.attacking) W.toggleAttack(); }
    }
    const t0 = performance.now();
    while (performance.now() - t0 < sec * 1000 && (!o.first || ms.length < o.first)) {
      if (o.boom !== false && k++ % 42 === 41) R.bus.emit('explode', { id: null, x: P.x - 200 + Math.random() * 100, z: P.z - 150, size: 2.2 });
      if (o.at) for (const a of o.at) if (a[0] === ms.length) a[1](R, W, P);
      const ts = performance.now(); W.update(1 / 60); const t1 = performance.now(); sim += t1 - ts;
      R.render(1 / 60, 1); const t2 = performance.now(); sync();
      const t3 = performance.now();
      ms.push(t3 - ts);
      if (t3 - ts > 20 && parts.length < 12) parts.push([ms.length - 1, +(t1 - ts).toFixed(1), +(t2 - t1).toFixed(1), +(t3 - t2).toFixed(1)]);
      calls += R.stats.calls; tris += R.stats.tris; gpu += R.gpuTimer.last;
      await new Promise((r) => setTimeout(r, 0));
    }
    } finally {
      window.requestAnimationFrame = raf;
      for (const cb of held) raf(cb);
    }
    const n = ms.length, s = [...ms].sort((a, b) => a - b);
    const avg = ms.reduce((a, b) => a + b, 0) / n;
    const st = R.stats;
    return {
      q: st.quality, buf: st.w + 'x' + st.h, n, avgMs: +avg.toFixed(2), p95: +s[Math.floor(n * 0.95)].toFixed(2),
      max: +s[n - 1].toFixed(1), fpsEq: Math.round(1000 / avg), simMs: +(sim / n).toFixed(2), gpuMs: R.gpuTimer.ok ? +(gpu / n).toFixed(2) : null,
      calls: Math.round(calls / n), tris: Math.round(tris / n), parts, worst: ms.map((v, i) => [i, +v.toFixed(1)]).filter((x) => x[1] > 25).slice(0, 8),
    };
  };
}

// Schwere Kampfszene (window.__fight): Schwarm-Nest neben dem Spieler, alle Gegner des Sektors in der Nähe, Angriff
// aufs Nest, Explosionen. Danach __drive (ohne Bildschirmtakt). Für den Abgleich des Vorhersagemodells in quality.js.
if (typeof window !== 'undefined') {
  window.__fight = async (o = {}) => {
    const R = window.__lsRenderer;
    if (!R || !R.world) return 'kein Renderer';
    const W = R.world, P = W.player;
    const ev = await import('../sim/events.js');
    if (!(W._ev && W._ev.type === 'nest')) ev.startEvent(W, 'nest');
    const nest = W._ev && W._ev.nest;
    if (nest) { P.x = nest.x + 420; P.z = nest.z + 260; P.px = P.x; P.pz = P.z; W.setTarget(nest.id); if (!P.attacking) W.toggleAttack(); }
    let n = 0;
    W.entities.forEach((e) => {
      if (e.kind !== 'enemy' || e === nest || n >= (o.enemies ?? 30)) return;
      const a = n++ * 2.4, r = 250 + (n % 5) * 60;
      e.x = P.x + Math.cos(a) * r; e.z = P.z + Math.sin(a) * r; if ('px' in e) { e.px = e.x; e.pz = e.z; }
    });
    return window.__drive({ sec: o.sec ?? 4, combat: false, boom: true, pre: 30 });
  };
}

// Messreihe über mehrere Qualitätsstufen mit Neuladen (window.__suite(['low','medium'])): je Stufe frischer Start,
// erster Kampf (Hänger) und Dauerlast mit Explosionen. Ergebnis in sessionStorage 'ls.suite.res' (JSON).
if (typeof window !== 'undefined') {
  const KEY = 'ls.suite';
  window.__suite = (list, keep) => {
    sessionStorage.setItem(KEY, JSON.stringify({ list, i: 0, keep: keep ?? localStorage.getItem('ls.settings'), res: {} }));
    sessionStorage.removeItem(KEY + '.res');
    const s = JSON.parse(localStorage.getItem('ls.settings') || '{}');
    delete s.qualityAuto; localStorage.setItem('ls.settings', JSON.stringify({ ...s, quality: list[0], rev: 2 }));
    location.reload();
    return 'läuft';
  };
  const plan = (() => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } })();
  if (plan) {
    setTimeout(async () => {
      const q = plan.list[plan.i];
      const first = await window.__drive({ first: 240, sec: 8, boom: false, pre: 5 });
      const steady = await window.__drive({ sec: 3, combat: false });
      const fight = await window.__fight({ sec: 4 });
      const pick = (r) => ({ gpuMs: r.gpuMs, avgMs: r.avgMs, fpsEq: r.fpsEq, buf: r.buf });
      plan.res[q] = { first: { max: first.max, p95: first.p95, worst: first.worst.slice(0, 3) }, steady: pick(steady), fight: pick(fight) };
      plan.i++;
      if (plan.i < plan.list.length) {
        sessionStorage.setItem(KEY, JSON.stringify(plan));
        const s = JSON.parse(localStorage.getItem('ls.settings') || '{}');
        delete s.qualityAuto; localStorage.setItem('ls.settings', JSON.stringify({ ...s, quality: plan.list[plan.i], rev: 2 }));
        location.reload();
      } else {
        sessionStorage.removeItem(KEY);
        sessionStorage.setItem(KEY + '.res', JSON.stringify(plan.res));
        if (plan.keep) localStorage.setItem('ls.settings', plan.keep); else localStorage.removeItem('ls.settings');
      }
    }, 3500);
  }
}

// Vorher/Nachher im selben Lauf (window.__compare): stellt die Grafik-Einsparungen des Leistungs-Durchgangs
// abwechselnd ab (alt: Pixeldichte 2 auf HOCH, Nachleuchten 9 Proben je Stufe, Farbsaum überall, Teilchen bis 420 px)
// und an, je Zustand mehrfach, in einer eingefrorenen Kampfszene mit Explosionen, ohne Bildschirmtakt (GPU-Sync).
// Ergebnis: Median GPU-Zeit und Bildzeit (CPU + GPU) je Zustand. Gleiche Last, gleiche Szene → fairer Vergleich.
if (typeof window !== 'undefined') {
  window.__compare = async (o = {}) => {
    const R = window.__lsRenderer;
    if (!R || !R.world) return 'kein Renderer';
    const W = R.world, P = W.player, gl = R.gl.getContext(), px = new Uint8Array(4);
    const legacy = (on) => {
      R.bloom.setLegacy(on); R.output.legacy = on;
      const pr = Math.min(window.devicePixelRatio || 1, on && R.quality === 2 ? 2 : [1, 1.5, 1.75, 2][R.quality]);
      if (pr !== R.basePR) { R.basePR = pr; R._applyPR(); }
      for (const p of [R.effects.glowP, R.effects.smokeP]) p.mat.uniforms.uMaxPx.value = on ? 420 : Math.max(160, 210 * R.gl.getPixelRatio());
    };
    // Szene: Gegner um den Spieler, Angriff, dann Simulation einfrieren
    let n = 0, best = null;
    W.entities.forEach((e) => {
      if (e.kind !== 'enemy' || e.alive === false || n >= (o.enemies ?? 10)) return;
      const a = n * 0.7, r = 280 + (n % 3) * 90;
      e.x = P.x + Math.cos(a) * r; e.z = P.z - 160 + Math.sin(a) * r * 0.6; if ('px' in e) { e.px = e.x; e.pz = e.z; }
      if (!best) best = e; n++;
    });
    if (best) { W.setTarget(best.id); if (!P.attacking) W.toggleAttack(); }
    for (let i = 0; i < 90; i++) W.update(1 / 60);
    R._perf.warm = 1e9; R.scale = 1; R._applyPR();
    const raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0;
    let k = 0;
    const run = async (ms) => {
      const g = [], w = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        if (k++ % 40 === 39) R.bus.emit('explode', { id: null, x: P.x - 220 + Math.random() * 120, z: P.z - 150, size: 2.2 });
        const ts = performance.now();
        R.render(1 / 60, 1);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        w.push(performance.now() - ts); g.push(R.gpuTimer.last);
        await new Promise((r) => setTimeout(r, 0));
      }
      return [g, w];
    };
    const acc = { alt: [[], []], neu: [[], []] };
    try {
      for (let i = 0; i < (o.rounds ?? 6); i++) {
        for (const mode of i % 2 ? ['neu', 'alt'] : ['alt', 'neu']) {
          legacy(mode === 'alt');
          await run(250); // Umschalten einschwingen (Puffer, Shader)
          const [g, w] = await run(o.ms ?? 1500);
          acc[mode][0].push(...g); acc[mode][1].push(...w);
        }
      }
    } finally { legacy(false); window.requestAnimationFrame = raf; raf(() => {}); }
    const med = (v) => { v = v.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? +v[v.length >> 1].toFixed(2) : null; };
    const p95 = (v) => { v = v.filter((x) => x > 0).sort((a, b) => a - b); return v.length ? +v[Math.floor(v.length * 0.95)].toFixed(2) : null; };
    const out = {};
    for (const m of ['alt', 'neu']) out[m] = { gpu: med(acc[m][0]), gpuP95: p95(acc[m][0]), frame: med(acc[m][1]), n: acc[m][0].length };
    out.buf = R.stats.w + 'x' + R.stats.h; out.q = R.quality; out.calls = R.stats.calls; out.tris = R.stats.tris;
    return out;
  };
}
