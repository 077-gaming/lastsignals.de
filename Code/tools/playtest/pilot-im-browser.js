// Test-Pilot, Teil im Browser (wird von spielen.mjs in die Seite geladen, nur Entwicklungsserver).
// Spielt über window.__ls = { world, renderer, bus, hud } (src/main.js), misst Bildzeiten, Kampfwerte und
// Gegnerverhalten und prüft die Ausrichtung aller Schiffsmodelle. Ergebnis über window.__pt.report().
// Bewusst ohne Speicher-Neuanlage pro Bild in der Bildzeit-Messung (feste Float32Arrays).
(function () {
  if (window.__pt) return;
  const PT = (window.__pt = {});
  const now = () => performance.now();
  const TAU = Math.PI * 2;
  const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
  const deg = (r) => Math.round(r * 1800 / Math.PI) / 10;
  const heading = (dx, dz) => Math.atan2(-dx, -dz); // wie sim: rot 0 = −z, Richtung (−sin, −cos)
  const r1 = (x) => Math.round(x * 10) / 10;
  const r2 = (x) => Math.round(x * 100) / 100;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let L = null, W = null, R = null, B = null;
  let DATA = null;
  const S = {
    running: false, done: false, t0: 0, durS: 120, phase: 'start', action: '', tick: 0,
    excludeUntil: 0, capturing: false, inModelCheck: false,
    orbitDir: 1, orbitAt: 0, ammoAt: 0, ammoI: 0, rocketAt: 0, roamAt: 0, roamX: 0, roamZ: 0,
    retreatUntil: 0, dockAt: 0, dockDone: false, jumpTried: 0, jumped: false, deathPhaseAt: 0,
    deadAt: 0, forcedDeath: 0, firstShotAt: -1, startSector: '', bought: [], repairs: [],
    lastTargetSwitch: 0,
  };

  // ───────── Bildschirmfotos: Anfragen an spielen.mjs ─────────
  const shotReq = [];
  const shotWait = new Map();
  let shotSeq = 0;
  const shotOnce = new Set();
  function requestShot(reason, slug, opts = {}) {
    if (opts.once) { if (shotOnce.has(opts.once)) return null; shotOnce.add(opts.once); }
    const id = ++shotSeq;
    const req = { id, reason, slug, kind: opts.kind || 'moment', t: r1(elapsed()), wait: !!opts.wait };
    shotReq.push(req);
    if (opts.wait) return new Promise((res) => shotWait.set(id, res));
    return null;
  }
  PT.takeRequests = () => shotReq.splice(0, shotReq.length);
  PT.capture = (on) => { S.capturing = !!on; if (!on) S.excludeUntil = now() + 350; };
  PT.shotDone = (id, file) => { const f = shotWait.get(id); if (f) { shotWait.delete(id); f(file); } };

  const elapsed = () => (S.t0 ? (now() - S.t0) / 1000 : 0);

  // ───────── Bildzeiten ─────────
  const FMAX = 60000;
  const fDt = new Float32Array(FMAX), fWork = new Float32Array(FMAX), fGpu = new Float32Array(FMAX), fT = new Float32Array(FMAX);
  const fFlag = new Uint8Array(FMAX); // 1 = im Kampf, 2 = ausgeschlossen (Foto/Modellprüfung), 4 = erster Kampf (10 s), 8 = angedockt
  let fN = 0, lastTs = 0, lastWork = 0;
  const longFrames = [];
  const recent = []; // letzte Bus-Ereignisse { t, type }
  let modelVer = 0;
  function onFrame(ts) {
    if (!S.running) return;
    if (lastTs && fN < FMAX) {
      const dt = ts - lastTs;
      const t = now();
      const excl = S.capturing || t < S.excludeUntil || S.inModelCheck;
      const combat = !!(W && (W.inCombat || W.player.attacking));
      const first = S.firstShotAt >= 0 && elapsed() - S.firstShotAt < 10;
      const gpu = R.gpuTimer && R.gpuTimer.ok ? R.gpuTimer.last : 0;
      fDt[fN] = dt; fWork[fN] = lastWork; fGpu[fN] = gpu; fT[fN] = elapsed();
      fFlag[fN] = (combat ? 1 : 0) | (excl ? 2 : 0) | (first ? 4 : 0) | (W.docked ? 8 : 0);
      fN++;
      if (!excl && (dt > 25 || lastWork > 25) && longFrames.length < 400) longFrames.push(situation(dt, lastWork, gpu));
      if (!excl && dt > 60) requestShot(`Hänger ${Math.round(dt)} ms (${S.action || S.phase})`, 'haenger', { once: 'hang' + (longFrames.length > 30 ? 2 : 1) });
    }
    const fv = R.factory ? R.factory.version : 0;
    if (fv !== modelVer) { modelVer = fv; noteRecent('modell-geladen'); }
    lastTs = ts;
    requestAnimationFrame(onFrame);
  }
  function noteRecent(type) {
    recent.push({ t: now(), type });
    if (recent.length > 80) recent.splice(0, recent.length - 80);
  }
  function situation(dt, work, gpu) {
    const p = W.player;
    let near = 0, attackers = 0;
    for (const e of W.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (d < 1500) near++;
      if (e.targetId === 'player' && e.state === 'attack') attackers++;
    }
    const tn = now(), ev = {};
    for (const r of recent) if (tn - r.t < 400) ev[r.type] = (ev[r.type] || 0) + 1;
    const st = R.stats || {};
    return {
      t: r1(elapsed()), bildabstandMs: r1(dt), rechenzeitMs: r1(work), gpuMs: r1(gpu), phase: S.phase, aktion: S.action,
      sektor: W.sector.id, gegnerNah: near, angreifer: attackers, imKampf: !!W.inCombat, ereignis: W.event ? W.event.type : null,
      zuletzt: ev, drawCalls: st.calls || 0, dreiecke: st.tris || 0, qualitaet: st.quality, aufloesung: st.scale,
    };
  }

  // ───────── Kampf- und Spielwerte ─────────
  const C = {
    playerShots: 0, playerHits: 0, ammoShots: {}, rockets: 0, salTried: 0,
    shotAngles: [], // Winkel Schussrichtung ↔ Schiffsnase (Grad)
    kills: {}, ttk: {}, killTrack: new Map(),
    taken: { hull: 0, shield: 0, bySource: {} },
    enemyShots: {}, enemyHits: {},
    loot: { credits: 0, tritium: 0, xp: 0, honor: 0 }, lootN: 0,
    deaths: 0, levelups: [], messages: {}, warnings: [], qualityMsgs: [], tempSpawns: 0, helpMsgs: 0,
    docked: 0, jumps: 0, crates: 0, wrecks: 0, sectors: [],
  };
  function typeOf(id) {
    if (id === 'player') return 'player';
    const e = W.entities.get(id);
    return e ? e.type || e.kind : (C.killTrack.get(id)?.type || 'unbekannt');
  }
  function onBus(type, p) {
    if (type !== 'shot') noteRecent(type);
    switch (type) {
      case 'shot': {
        if (p.from === 'player') {
          C.playerShots++; if (p.hit) C.playerHits++;
          C.ammoShots[p.ammo] = (C.ammoShots[p.ammo] || 0) + 1;
          if (S.firstShotAt < 0) { S.firstShotAt = elapsed(); setTimeout(() => requestShot('Erster Kampf (1,5 s nach dem ersten Schuss)', 'erster-kampf', { once: 'first' }), 1500); }
          const pl = W.player;
          const a = Math.abs(wrap(heading(p.dx, p.dz) - pl.rot));
          if (C.shotAngles.length < 20000) C.shotAngles.push(deg(a));
          let k = C.killTrack.get(p.to);
          if (!k) {
            const e = W.entities.get(p.to);
            k = { type: e ? e.type : '?', rank: e ? e.rank : '?', t0: W.time, shots: 0, dmg: 0, sector: W.sector.id };
            C.killTrack.set(p.to, k);
          }
          k.shots++;
        } else {
          const t = p.enemyType || typeOf(p.from);
          C.enemyShots[t] = (C.enemyShots[t] || 0) + 1;
          if (p.hit && p.to === 'player') C.enemyHits[t] = (C.enemyHits[t] || 0) + 1;
        }
        break;
      }
      case 'damage': {
        if (p.id === 'player') {
          C.taken.hull += p.hull || 0; C.taken.shield += p.shield || 0;
          const src = p.from ? typeOf(p.from) : (p.reflect ? 'spiegel' : 'sonstiges');
          C.taken.bySource[src] = (C.taken.bySource[src] || 0) + (p.hull || 0) + (p.shield || 0);
        } else if (p.from === 'player') {
          const k = C.killTrack.get(p.id); if (k) k.dmg += (p.hull || 0) + (p.shield || 0);
        }
        break;
      }
      case 'rocket': if (p.from === 'player') { C.rockets++; const k = C.killTrack.get(p.to); if (!k) { const e = W.entities.get(p.to); if (e) C.killTrack.set(p.to, { type: e.type, rank: e.rank, t0: W.time, shots: 0, dmg: 0, sector: W.sector.id }); } } break;
      case 'explode': {
        if (p.id === 'player') break;
        const k = C.killTrack.get(p.id);
        if (k) {
          const key = k.rank && k.rank !== 'normal' ? `${k.type} (${k.rank})` : k.type;
          (C.ttk[key] || (C.ttk[key] = [])).push(r1(W.time - k.t0));
          C.kills[key] = (C.kills[key] || 0) + 1;
          C.killTrack.delete(p.id);
          if (k.rank === 'elite' || k.rank === 'alpha') requestShot(`Abschuss ${key}`, 'abschuss-' + k.rank, { once: 'kill' + k.rank });
        }
        break;
      }
      case 'loot': {
        C.loot.credits += p.credits || 0; C.loot.tritium += p.tritium || 0; C.loot.xp += p.xp || 0; C.loot.honor += p.honor || 0; C.lootN++;
        break;
      }
      case 'playerDead': C.deaths++; S.deadAt = now(); requestShot('Abgeschossen: Reparatur-Auswahl', 'tod', { once: 'dead' }); break;
      case 'docked': C.docked++; break;
      case 'sector': C.jumps++; C.sectors.push({ t: r1(elapsed()), id: W.sector.id }); setTimeout(() => requestShot(`Neuer Sektor ${W.sector.id} (${W.sector.name})`, 'sektor', { once: 'sector' + W.sector.id }), 2500); break;
      case 'levelup': C.levelups.push({ t: r1(elapsed()), level: p.level }); break;
      case 'spawn': if (p.entity && p.entity.kind === 'enemy' && p.entity.temp) C.tempSpawns++; break;
      case 'message': {
        const txt = String(p.text || '');
        const key = (p.kind || 'info') + ': ' + txt.replace(/[0-9.,]+/g, '#').slice(0, 90);
        C.messages[key] = (C.messages[key] || 0) + 1;
        if (p.title === 'GRAFIK') C.qualityMsgs.push({ t: r1(elapsed()), text: txt });
        if (/Verstärkung|Hilfe|ruft/i.test(txt)) C.helpMsgs++;
        if (p.kind === 'radio' && p.title) requestShot(`Ereignis: ${p.title}`, 'ereignis', { once: 'event' });
        break;
      }
      default:
        if (/help|call|reinforce|summon|alarm/i.test(type)) C.helpMsgs++;
    }
  }

  // ───────── Gegnerverhalten ─────────
  const E = { byType: {}, prev: new Map(), overlapPairs: new Set(), overlapIncidents: {}, overlapSamples: 0, samples: 0, maxOverlapAtOnce: 0, overlapShot: false };
  function et(type) {
    return E.byType[type] || (E.byType[type] = {
      samples: 0, states: {}, dist: [], dodges: 0, joinedSelf: 0, joinedSight: 0, joinedHelp: 0, flees: 0, fireWhileFacing: 0,
      overlapSamples: 0, faceErr: [], speed: 0,
    });
  }
  function sampleEnemies() {
    const p = W.player;
    const list = W.enemies;
    E.samples++;
    const near = [];
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) { E.prev.delete(e.id); continue; }
      const dx = e.x - p.x, dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      const pv = E.prev.get(e.id);
      if (d > 2200) { if (pv) { pv.state = e.state; pv.dodgeCd = e.dodgeCd; } else E.prev.set(e.id, { state: e.state, dodgeCd: e.dodgeCd || 0, dodgeT: 0 }); continue; }
      near.push(e);
      const T = et(e.type);
      T.samples++;
      let st = e.state || '?';
      const sp = Math.hypot(e.vx || 0, e.vz || 0);
      T.speed += sp;
      const extra = [e.tactic, e.mode, e.sub, e.move, e.maneuver, e.special].find((x) => typeof x === 'string' && x);
      let label = st;
      if (st === 'attack' && e.targetId === 'player') {
        const vr = d > 1 ? (dx * (e.vx || 0) + dz * (e.vz || 0)) / d : 0; // > 0: entfernt sich
        if (sp < 25) label = 'angreifen (stehend)';
        else if (vr < -0.55 * sp) label = 'anfliegen';
        else if (vr > 0.55 * sp) label = 'abdrehen';
        else label = 'umkreisen';
        T.dist.push(Math.round(d));
      } else if (st === 'attack') label = 'angreifen (anderes Ziel)';
      else if (st === 'wander') label = 'patrouille';
      else if (st === 'flee') label = 'fliehen';
      else if (st === 'loot') label = 'beute holen';
      // Ausweichen: Ausweich-Abklingzeit ist gerade gesprungen
      let dodging = false;
      if (pv) {
        if ((e.dodgeCd || 0) > (pv.dodgeCd || 0) + 0.5) { T.dodges++; pv.dodgeT = now(); }
        dodging = now() - (pv.dodgeT || 0) < 600;
        // Eintritt in den Angriff: selbst getroffen, eigene Sicht oder mitgezogen (Rudel/Hilfe)
        if (pv.state !== 'attack' && st === 'attack' && e.targetId === 'player') {
          const hitRecently = e.hitAt != null && W.time - e.hitAt < 1.5;
          const aggro = e.aggro != null ? e.aggro : (e.def ? e.def.aggroRange : 500);
          if (hitRecently) T.joinedSelf++;
          else if (d <= aggro * 1.05 + 30) T.joinedSight++;
          else T.joinedHelp++;
        }
        if (pv.state !== 'flee' && st === 'flee') T.flees++;
        pv.state = st; pv.dodgeCd = e.dodgeCd || 0;
      } else E.prev.set(e.id, { state: st, dodgeCd: e.dodgeCd || 0, dodgeT: 0 });
      if (dodging) label = 'ausweichen';
      if (extra) label += ' / ' + extra;
      T.states[label] = (T.states[label] || 0) + 1;
      // Ausrichtung im Flug: Nase (Simulation + Modellversatz später) gegen Bewegungsrichtung
      if (sp > 60 && !(st === 'attack' && d < 900)) {
        const v = R.views.get(e.id);
        if (v) {
          const turn = Math.abs(wrap((e.rot || 0) - (e.prot ?? e.rot ?? 0)));
          if (turn < 0.005) recordFlight('enemy:' + e.type, heading(e.vx, e.vz) - v.rrot);
        }
      }
    }
    // Übereinander: Abstand kleiner als 0,75 × Summe der Trefferradien
    let over = 0;
    const seen = new Set();
    for (let i = 0; i < near.length; i++) {
      const a = near[i];
      for (let j = i + 1; j < near.length; j++) {
        const b = near[j];
        const lim = (a.radius + b.radius) * 0.75;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (dx * dx + dz * dz < lim * lim) {
          over++;
          const key = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
          seen.add(key);
          if (!E.overlapPairs.has(key)) {
            const k = a.type === b.type ? a.type : a.type + '+' + b.type;
            E.overlapIncidents[k] = (E.overlapIncidents[k] || 0) + 1;
          }
          et(a.type).overlapSamples++; et(b.type).overlapSamples++;
        }
      }
    }
    E.overlapPairs = seen;
    if (over) E.overlapSamples++;
    if (over > E.maxOverlapAtOnce) E.maxOverlapAtOnce = over;
    if (over >= 2 && !E.overlapShot) { E.overlapShot = true; requestShot(`${over} Gegnerpaare übereinander`, 'uebereinander'); }
    let attackers = 0;
    for (const e of near) if (e.targetId === 'player' && e.state === 'attack') attackers++;
    if (attackers >= 6) requestShot(`${attackers} Gegner greifen gleichzeitig an`, 'viele-gegner', { once: 'many' });
  }

  // Flugrichtung ↔ Modell: Rohwinkel (Bewegung − dargestellte Drehung), Modellversatz kommt aus der Modellprüfung
  const flight = {};
  function recordFlight(key, a) {
    const f = flight[key] || (flight[key] = []);
    if (f.length < 4000) f.push(wrap(a));
  }
  function playerFlightSample() {
    const p = W.player;
    if (!p.alive || W.docked) return;
    const v = R.views.get('player');
    if (!v || !v.model) return;
    const turn = Math.abs(wrap(p.rot - (p.prot ?? p.rot)));
    if (p.speed > 0.45 * (W.playerSpeed || 300) && turn < 0.003) {
      const key = `ship:${p.ship || W.profile.ship}:${p.faction || W.profile.faction}${v.model.placeholder ? ':platzhalter' : ''}`;
      recordFlight(key, heading(p.vx, p.vz) - v.rrot);
    }
  }

  // ───────── Bot ─────────
  const AMMO_KEYS = ['L1', 'L2', 'L3', 'L4', 'SAB', 'SAL'];
  const ammoLog = {};
  function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  function validTarget(e) { return e && e.alive && e.kind === 'enemy' && W.entities.get(e.id) === e; }
  function chooseTarget() {
    const p = W.player;
    let best = null, bd = Infinity, bestAtt = null, bad = Infinity;
    for (const e of W.enemies) {
      if (!e.alive) continue;
      const d = dist(e, p);
      if (e.type === 'nest' && d > 1600) continue;
      if (e.targetId === 'player' && e.state === 'attack' && d < 1400 && d < bad) { bad = d; bestAtt = e; }
      if (d < bd && d < 4500) { bd = d; best = e; }
    }
    return bestAtt || best;
  }
  function moveTo(x, z) { const lim = W.sector.size * 0.94; W.moveTo(Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))); }
  function switchAmmo() {
    const key = AMMO_KEYS[S.ammoI++ % AMMO_KEYS.length];
    const pr = W.profile;
    const before = pr.selectedAmmo, salBefore = W.salReadyIn;
    const have = pr.ammo[key] || 0;
    W.selectAmmo(key);
    const ok = key === 'SAL' ? W.salReadyIn > salBefore + 0.5 || W.salReadyIn > 3 : pr.selectedAmmo === key;
    const l = ammoLog[key] || (ammoLog[key] = { versuche: 0, ok: 0, vorrat: have });
    l.versuche++; if (ok) l.ok++; l.vorrat = pr.ammo[key] || 0;
    if (key === 'SAL') C.salTried++;
    void before;
  }
  function hunt(noRetreat) {
    const p = W.player;
    const t = now();
    if (!noRetreat && p.hp < p.hpMax * 0.3 && t > S.retreatUntil + 4000) S.retreatUntil = t + 7000;
    if (t < S.retreatUntil) {
      if (p.attacking) W.toggleAttack();
      let ax = 0, az = 0, n = 0;
      for (const e of W.enemies) if (e.alive && dist(e, p) < 1200) { ax += e.x; az += e.z; n++; }
      if (n) { ax /= n; az /= n; const d = Math.hypot(p.x - ax, p.z - az) || 1; moveTo(p.x + (p.x - ax) / d * 700, p.z + (p.z - az) / d * 700); }
      S.action = 'Rückzug (Hülle unter 30 %)';
      return;
    }
    let tgt = p.targetId ? W.entities.get(p.targetId) : null;
    if (!validTarget(tgt)) tgt = null;
    // Beute: eigenes Wrack oder Crate in der Nähe, wenn gerade kein Gegner bedroht
    const threat = tgt && dist(tgt, p) < 900;
    if (!threat) {
      let wr = null, wd = 1500;
      for (const w of W.wrecks) { if (!w.alive && w.alive !== undefined) continue; const d = dist(w, p); if (d < wd && (w.owner === 'player' || W.time >= w.protectedUntil)) { wd = d; wr = w; } }
      if (wr) { moveTo(wr.x, wr.z); S.action = 'Beute: Wrack einsammeln'; S.lootTarget = 'wreck'; return; }
      let cr = null, cd = 900;
      for (const c of W.crates) { if (!c.alive) continue; const d = dist(c, p); if (d < cd) { cd = d; cr = c; } }
      if (cr) { moveTo(cr.x, cr.z); S.action = 'Beute: Crate einsammeln'; return; }
    }
    if (!tgt || t - S.lastTargetSwitch > 20000) {
      const nt = chooseTarget();
      if (nt && nt !== tgt) { W.setTarget(nt.id); S.lastTargetSwitch = t; tgt = nt; }
    }
    if (!tgt) {
      if (t > S.roamAt) {
        const a = Math.random() * TAU;
        S.roamX = p.x * 0.4 + Math.cos(a) * 2200; S.roamZ = p.z * 0.4 + Math.sin(a) * 2200; S.roamAt = t + 9000;
      }
      moveTo(S.roamX, S.roamZ); S.action = 'Suchflug';
      return;
    }
    const d = dist(tgt, p);
    if (d > 620) {
      moveTo(tgt.x + (p.x - tgt.x) / d * 380, tgt.z + (p.z - tgt.z) / d * 380);
      if (d < 950 && !p.attacking) W.toggleAttack();
      S.action = `Anflug auf ${tgt.name} (${Math.round(d)} m)`;
    } else {
      if (!p.attacking) W.toggleAttack();
      if (t > S.orbitAt) {
        if (Math.random() < 0.15) S.orbitDir = -S.orbitDir;
        const a = Math.atan2(p.z - tgt.z, p.x - tgt.x) + S.orbitDir * 0.85;
        const rr = 330 + Math.random() * 120;
        moveTo(tgt.x + Math.cos(a) * rr, tgt.z + Math.sin(a) * rr);
        S.orbitAt = t + 1300;
      }
      S.action = `Kampf: ${tgt.name} umkreisen`;
      if (t > S.ammoAt) { switchAmmo(); S.ammoAt = t + 5500; }
      if (W.rocketReadyIn <= 0 && t > S.rocketAt && d < 640) { W.fireRocket(); S.rocketAt = t + 3200; }
    }
  }
  function nextPortal() {
    const idx = W.sector.index;
    let best = null;
    for (const o of W.portals) { const s = W.sectors[o.type]; if (s && s.index > idx) best = o; }
    return best || W.portals[0];
  }
  function shop() {
    const tries = [['ammo', 'L2', 1], ['rocket', 'R1', 1], ['ammo', 'L3', 1], ['ammo', 'SAL', 1], ['ammo', 'SAB', 1], ['laser', 'ion', 1]];
    for (const [k, id, n] of tries) {
      const pr = W.profile;
      const before = { credits: pr.credits, tritium: pr.tritium };
      const r = W.buy(k, id, n) || {};
      S.bought.push({ was: `${k} ${id}`, ok: !!r.ok, grund: r.reason || '', creditsAusgegeben: before.credits - pr.credits, tritiumAusgegeben: before.tritium - pr.tritium });
    }
  }
  function tick() {
    if (!S.running || S.inModelCheck) return;
    S.tick++;
    const el = elapsed();
    const f = el / S.durS;
    playerFlightSample();
    if (S.tick % 2 === 0) sampleEnemies();
    if (el >= S.durS) { S.running = false; S.playEnd = el; S.done = true; return; }
    const p = W.player;
    if (W.playerDead) {
      S.action = 'Abgeschossen, warte auf Reparatur';
      if (!S.deadAt) S.deadAt = now();
      if (now() - S.deadAt > 2500) {
        const where = ['here', 'portal', 'station'][Math.min(2, S.repairs.length)];
        const cost = W.repairCost(where);
        const ok = W.repair(where);
        S.repairs.push({ t: r1(el), wo: where, ok, kosten: cost.free ? 'kostenlos (bis Stufe 10)' : `${cost.amount} ${cost.currency}` });
        S.deadAt = 0;
        if (S.phase === 'tod') S.phase = 'jagd4';
      }
      return;
    }
    if (W.docked) {
      S.action = 'Angedockt: Shop';
      if (!S.dockAt) { S.dockAt = now(); const t0 = now(); shop(); S.shopCallMs = r1(now() - t0); setTimeout(() => requestShot('Angedockt: Station/Shop', 'station', { once: 'dock' }), 1200); }
      if (now() - S.dockAt > 4500) { const t0 = now(); W.undock(); S.undockCallMs = r1(now() - t0); S.dockDone = true; S.phase = 'sprung'; }
      return;
    }
    if (W.jump) { S.action = 'Sprung lädt'; return; }
    if (S.phase === 'start') { S.phase = 'jagd'; S.startSector = W.sector.id; }
    if (S.phase === 'jagd' && f >= 0.15) S.phase = W.station ? 'docken' : 'sprung';
    if (S.phase === 'jagd2' && f >= 0.3) S.phase = 'sprung';
    if (((S.phase === 'jagd3' && f >= 0.74) || (S.phase === 'sprung' && f >= 0.86)) && !C.deaths) { S.phase = 'tod'; S.deathPhaseAt = now(); }
    switch (S.phase) {
      case 'jagd': case 'jagd2': case 'jagd3': case 'jagd4': hunt(false); break;
      case 'docken': {
        const st = W.station;
        if (!st) { S.phase = 'jagd2'; break; }
        if (p.attacking) W.toggleAttack();
        if (W.inSafeZone) { W.stopMove(); const t0 = now(); W.dock(); S.dockCallMs = r1(now() - t0); }
        else moveTo(st.x, st.z);
        S.action = 'Flug zur Station (Andocken)';
        if (f > 0.3) S.phase = 'sprung'; // zu lange: aufgeben
        break;
      }
      case 'sprung': {
        if (S.jumped || W.sector.id !== S.startSector) { S.phase = 'jagd3'; break; }
        const o = nextPortal();
        if (!o) { S.phase = 'jagd3'; break; }
        // unterwegs angegriffen: zurückschießen, weiterfliegen
        const a = chooseTarget();
        // nur wehren, wenn ein Gegner wirklich auf uns schießt (sonst kommt man nie am Tor an)
        if (!W.nearPortal && a && a.targetId === 'player' && a.state === 'attack' && dist(a, p) < 550 && p.hp > p.hpMax * 0.35) {
          if (p.targetId !== a.id) W.setTarget(a.id);
          if (!p.attacking) W.toggleAttack();
          if (W.rocketReadyIn <= 0 && now() > S.rocketAt) { W.fireRocket(); S.rocketAt = now() + 3200; }
        } else if (p.attacking && p.targetId) { const tg = W.entities.get(p.targetId); if (!tg || !tg.alive || dist(tg, p) > 700) W.toggleAttack(); }
        if (W.nearPortal) { W.stopMove(); if (!W.jump && now() - S.jumpTried > 1000) { W.tryJump(); S.jumpTried = now(); } }
        else moveTo(o.x, o.z);
        S.action = `Flug zum Sprungtor (${Math.round(dist(o, p))} m)`;
        break;
      }
      case 'tod': {
        hunt(true);
        S.action = 'Todestest: kämpfen ohne Rückzug';
        const since = now() - S.deathPhaseAt;
        if (since > 8000 && !S.forcedDeath) { S.forcedDeath = 1; p.shield = 0; p.hp = Math.max(1, Math.min(p.hp, p.hpMax * 0.03)); }
        if (since > 14000 && S.forcedDeath === 1) { S.forcedDeath = 2; if (W._playerDie) W._playerDie(); }
        break;
      }
    }
  }

  // ───────── Modellprüfung (Ausrichtung) ─────────
  let V3 = null, M4 = null;
  function vertsOf(node, root, skip, maxN = 6000) {
    root.updateMatrixWorld(true);
    const inv = new M4().copy(root.matrixWorld).invert();
    const m = new M4(), v = new V3();
    const meshes = [];
    let total = 0;
    node.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position && !skip(o)) { meshes.push(o); total += o.geometry.attributes.position.count; } });
    const step = Math.max(1, Math.ceil(total / maxN));
    const pts = [];
    for (const o of meshes) {
      m.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push(v.x, v.z); }
    }
    return pts;
  }
  // Längsachse über Spiegelsymmetrie (Schiffe sind links/rechts symmetrisch), Bug = schmaleres Ende
  function analyzeShape(pts) {
    const n = pts.length / 2;
    if (n < 8) return null;
    let cx = 0, cz = 0, minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < n; i++) { const x = pts[2 * i], z = pts[2 * i + 1]; cx += x; cz += z; if (x < minx) minx = x; if (x > maxx) maxx = x; if (z < minz) minz = z; if (z > maxz) maxz = z; }
    const bx = (minx + maxx) / 2, bz = (minz + maxz) / 2;
    const size = Math.max(maxx - minx, maxz - minz) || 1;
    const cell = size / 40;
    const grid = new Map();
    const key = (x, z) => Math.floor(x / cell) * 100003 + Math.floor(z / cell);
    for (let i = 0; i < n; i++) { const k = key(pts[2 * i], pts[2 * i + 1]); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); }
    const nn = (x, z) => {
      const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const a = grid.get((gx + dx) * 100003 + gz + dz); if (!a) continue;
        for (const j of a) { const ex = pts[2 * j] - x, ez = pts[2 * j + 1] - z; const d = ex * ex + ez * ez; if (d < best) best = d; }
      }
      return best === Infinity ? cell * 1.5 : Math.min(Math.sqrt(best), cell * 1.5);
    };
    const stride = Math.max(1, Math.floor(n / 1500));
    // Spiegelachse durch den Mittelpunkt der Umrissbox, Winkel phi (Richtung der Achse in x/z)
    const symErr = (phi) => {
      const ux = Math.sin(phi), uz = Math.cos(phi); // Achse
      let s = 0, c = 0;
      for (let i = 0; i < n; i += stride) {
        const x = pts[2 * i] - bx, z = pts[2 * i + 1] - bz;
        const along = x * ux + z * uz;
        const px = x - along * ux, pz = z - along * uz; // senkrechter Anteil
        s += nn(bx + x - 2 * px, bz + z - 2 * pz); c++;
      }
      return s / c / size;
    };
    let bestPhi = 0, bestErr = Infinity;
    const errs = [];
    for (let a = 0; a < 180; a += 5) { const e = symErr(a * Math.PI / 180); errs.push(e); if (e < bestErr) { bestErr = e; bestPhi = a; } }
    // feiner nachsuchen
    for (let a = bestPhi - 4; a <= bestPhi + 4; a += 1) { const e = symErr(a * Math.PI / 180); if (e < bestErr) { bestErr = e; bestPhi = a; } }
    const perpErr = symErr((bestPhi + 90) * Math.PI / 180);
    const phi = bestPhi * Math.PI / 180;
    const ux = Math.sin(phi), uz = Math.cos(phi);
    // Breite an beiden Enden (je 18 % der Länge)
    let smin = Infinity, smax = -Infinity;
    for (let i = 0; i < n; i++) { const s = (pts[2 * i] - bx) * ux + (pts[2 * i + 1] - bz) * uz; if (s < smin) smin = s; if (s > smax) smax = s; }
    const len = smax - smin || 1;
    const endInfo = (sign) => {
      let lo = Infinity, hi = -Infinity, cnt = 0;
      for (let i = 0; i < n; i++) {
        const x = pts[2 * i] - bx, z = pts[2 * i + 1] - bz;
        const s = x * ux + z * uz;
        const inEnd = sign > 0 ? s > smax - 0.18 * len : s < smin + 0.18 * len;
        if (!inEnd) continue;
        const q = x * uz - z * ux; cnt++;
        if (q < lo) lo = q; if (q > hi) hi = q;
      }
      return { width: cnt ? hi - lo : 0, count: cnt };
    };
    const ePos = endInfo(1), eNeg = endInfo(-1);
    // Bug = schmaleres Ende; Richtung als Einheitsvektor in x/z
    const noseSign = ePos.width < eNeg.width ? 1 : -1;
    const taper = Math.max(ePos.width, eNeg.width) / Math.max(1e-6, Math.min(ePos.width, eNeg.width));
    const nx = ux * noseSign, nz = uz * noseSign;
    // Winkel zur Spiel-Vorwärtsrichtung (−z): wie rot (positiv = gegen den Uhrzeigersinn von oben)
    const angle = wrap(heading(nx, nz));
    const symConf = perpErr > 0 ? 1 - bestErr / perpErr : 0;
    const sortedErr = errs.slice().sort((a, b) => a - b);
    const rund = sortedErr[Math.floor(sortedErr.length / 2)] < bestErr * 1.6; // fast jede Achse spiegelt: kein Bug aus der Form
    return {
      rund, formBugWinkelGrad: deg(angle), bugWinkelGrad: deg(angle), laengsachseGrad: bestPhi, symmetrieFehler: r2(bestErr * 100), symmetrieQuer: r2(perpErr * 100),
      sicherheitAchse: r2(symConf), verjuengung: r2(taper), laenge: r1(len), breite: r1(size), mitte: [r1(bx), r1(bz)],
      bugX: r2(nx), bugZ: r2(nz),
    };
  }
  function localPos(obj, root) {
    root.updateMatrixWorld(true);
    const inv = new M4().copy(root.matrixWorld).invert();
    return new V3().setFromMatrixPosition(obj.matrixWorld).applyMatrix4(inv);
  }
  function localDir(obj, root, lx, ly, lz) {
    const a = localPos(obj, root);
    const inv = new M4().copy(root.matrixWorld).invert();
    const b = new V3(lx, ly, lz).applyMatrix4(obj.matrixWorld).applyMatrix4(inv);
    return { x: b.x - a.x, z: b.z - a.z };
  }
  // Ein Modell prüfen: Rumpf-Bug, Mündungen vorn und nach vorn gerichtet, Triebwerk und Schweif hinten
  function inspectModel(m, kind, trailGeo) {
    const root = m.root;
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
    const body = m.hull || m.spin || root;
    const skip = (o) => o.geometry === trailGeo || o.isSprite || /trail/i.test(o.name || '');
    const shape = analyzeShape(vertsOf(body, root, skip));
    const out = { form: shape, hinweise: [], muendungen: [], triebwerke: [], schweife: [], befunde: [] };
    if (!shape) { out.befunde.push('keine Geometrie gefunden'); return out; }
    const [bx, bz] = shape.mitte;
    // Bug aus mehreren Hinweisen: Cockpit-Glas (vorn), Hoheitszeichen links/rechts, eigene Laser des Modells (vorn),
    // eigene Triebwerksteile (hinten), zuletzt Verjüngung des Rumpfs (schwach). Gewichtete Summe der Richtungen.
    const meshesWhere = (re) => { const a = []; body.traverse((o) => { if (o.isMesh && !skip(o)) { let n = (o.name || '') + ' ' + ((o.material && o.material.name) || ''); for (let q = o.parent; q && q !== root; q = q.parent) n += ' ' + (q.name || ''); if (re.test(n)) a.push(o); } }); return a; };
    const centroid = (list) => { let x = 0, z = 0, k = 0; for (const o of list) { const pts = vertsOf(o, root, () => false, 600); for (let i = 0; i < pts.length; i += 2) { x += pts[i]; z += pts[i + 1]; k++; } } return k ? { x: x / k, z: z / k } : null; };
    const addCue = (name, w, dx, dz) => { const l = Math.hypot(dx, dz); if (l < 1e-4) return; out.hinweise.push({ name, gewicht: w, winkelGrad: deg(wrap(heading(dx / l, dz / l))), x: dx / l, z: dz / l }); };
    const opt = centroid(meshesWhere(/optic|glass|canopy|cockpit|window|visor/i));
    if (opt) addCue('Cockpit-Glas vorn', 3, opt.x - bx, opt.z - bz);
    const iL = centroid(meshesWhere(/Faction_Insignia_Left|Insignia_Left(?!.*Carrier)/i)), iR = centroid(meshesWhere(/Insignia_ClanSlot_Right|Insignia_Right/i));
    if (iL && iR) addCue('Hoheitszeichen links/rechts', 3, iR.z - iL.z, -(iR.x - iL.x));
    const ownL = centroid(meshesWhere(/(^|\s)Laser_/i));
    if (ownL) addCue('eigene Laser des Modells vorn', 2, ownL.x - bx, ownL.z - bz);
    const ownE = centroid(meshesWhere(/EngineLight|Thruster|Nozzle|Exhaust/i));
    if (ownE) addCue('eigene Triebwerke hinten', 2, bx - ownE.x, bz - ownE.z);
    if (!shape.rund && shape.verjuengung >= 1.15) addCue('Rumpf verjüngt sich zum Bug', 1, shape.bugX, shape.bugZ);
    let sx = 0, sz = 0;
    for (const c of out.hinweise) { sx += c.x * c.gewicht; sz += c.z * c.gewicht; }
    if (out.hinweise.length && Math.hypot(sx, sz) > 1e-4) shape.bugWinkelGrad = deg(wrap(heading(sx, sz)));
    const strong = out.hinweise.filter((c) => c.gewicht >= 2);
    const conflict = out.hinweise.filter((c) => c.gewicht >= 2 && Math.abs(wrap((c.winkelGrad - shape.bugWinkelGrad) * Math.PI / 180)) > Math.PI / 2);
    const half = shape.laenge / 2 || 1;
    if (m.lasers) for (const Lz of m.lasers) {
      const p = localPos(Lz.muzzle, root);
      const fwd = -(p.z - bz) / half; // > 0 = vor der Mitte
      let dir = null;
      if (Lz.part) { const b = localPos(Lz.part, root); dir = { x: p.x - b.x, z: p.z - b.z }; }
      else if (Lz.muzzle.parent) {
        // eigenes GLB-Laserteil: Mündung relativ zur Mitte des nächstgelegenen Laser-Knotens
        let best = null, bd = Infinity;
        for (const ch of Lz.muzzle.parent.children) {
          if (ch === Lz.muzzle || !/laser/i.test(ch.name || '')) continue;
          const pts = vertsOf(ch, root, () => false, 800);
          if (!pts.length) continue;
          let mx = 0, mz = 0; const k = pts.length / 2;
          for (let i = 0; i < k; i++) { mx += pts[2 * i]; mz += pts[2 * i + 1]; }
          mx /= k; mz /= k;
          const dd = (mx - p.x) ** 2 + (mz - p.z) ** 2;
          if (dd < bd) { bd = dd; best = { x: mx, z: mz }; }
        }
        if (best) dir = { x: p.x - best.x, z: p.z - best.z };
      }
      const dirAng = dir && Math.hypot(dir.x, dir.z) > 1e-4 ? deg(wrap(heading(dir.x, dir.z))) : null;
      out.muendungen.push({ platz: Lz.slot, laser: Lz.key, x: r1(p.x), z: r1(p.z), vorMitte: r2(fwd), laufrichtungGrad: dirAng });
    }
    if (m.engines) for (const en of m.engines) {
      const p = localPos(en.hp, root);
      const back = (p.z - bz) / half;
      let tr = null;
      if (en.trail) { const d = localDir(en.trail, root, 0, 0, 1); tr = deg(wrap(heading(d.x, d.z) - Math.PI)); } // 0 = genau nach hinten
      out.triebwerke.push({ x: r1(p.x), z: r1(p.z), hinterMitte: r2(back), groesse: en.size, schweifAbweichungGrad: tr });
    }
    if (!m.engines && m.spin) {
      // Gegner-Platzhalter: Schweif-Flächen und Triebwerksglühen
      m.spin.traverse((o) => {
        if (o.isMesh && o.geometry === trailGeo) {
          const p = localPos(o, root); const d = localDir(o, root, 0, 0, 1);
          out.schweife.push({ x: r2(p.x), z: r2(p.z), hinterMitte: r2((p.z - bz) / half), schweifAbweichungGrad: deg(wrap(heading(d.x, d.z) - Math.PI)) });
        }
      });
      if (m.glow) { const p = localPos(m.glow, root); out.leuchtpunkt = { z: r2(p.z), hinterMitte: r2((p.z - bz) / half) }; }
    }
    const ab = shape.bugWinkelGrad;
    const conf = strong.length > 0 || (!shape.rund && shape.sicherheitAchse >= 0.25 && shape.verjuengung >= 1.15);
    if (shape.rund && !strong.length) out.rundum = true;
    else if (Math.abs(ab) > 20) out.befunde.push(`Bug ${ab}° neben der Flugrichtung (${out.hinweise.map((c) => c.name).join(', ') || 'Rumpfform'})${conf ? '' : ', wenig eindeutig'}`);
    if (conflict.length) out.befunde.push(`Hinweise widersprechen sich: ${conflict.map((c) => `${c.name} ${c.winkelGrad}°`).join(', ')}${conflict.some((c) => /Hoheitszeichen/.test(c.name)) ? ' (Modell gespiegelt?)' : ''}`);
    const mzBad = out.muendungen.filter((q) => q.vorMitte < 0);
    if (mzBad.length) out.befunde.push(`${mzBad.length} Mündung(en) hinter der Rumpfmitte`);
    const mzDir = out.muendungen.filter((q) => q.laufrichtungGrad != null && Math.abs(q.laufrichtungGrad) > 25);
    if (mzDir.length) out.befunde.push(`${mzDir.length} Laserlauf/-läufe zeigen nicht nach vorn (${mzDir.map((q) => q.laufrichtungGrad + '°').join(', ')})`);
    const enBad = out.triebwerke.filter((q) => q.hinterMitte < 0);
    if (enBad.length) out.befunde.push(`${enBad.length} Triebwerk(e) vor der Rumpfmitte`);
    const trBad = out.triebwerke.concat(out.schweife).filter((q) => q.schweifAbweichungGrad != null && Math.abs(q.schweifAbweichungGrad) > 25);
    if (trBad.length) out.befunde.push(`${trBad.length} Triebwerksschweif(e) zeigen nicht nach hinten (${trBad.map((q) => q.schweifAbweichungGrad + '°').join(', ')})`);
    out.formEindeutig = conf;
    out.ok = out.befunde.length === 0;
    return out;
  }
  function stats(arr) {
    if (!arr || !arr.length) return null;
    const a = arr.slice().sort((x, y) => x - y);
    const q = (p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
    let s = 0; for (const x of a) s += x;
    return { n: a.length, mittel: r1(s / a.length), median: r1(q(0.5)), p95: r1(q(0.95)), max: r1(a[a.length - 1]), min: r1(a[0]) };
  }

  // Overlay: Pfeile für Flugrichtung (grün) und Bug laut Modell (rot) auf dem Bildschirm
  let overlay = null;
  function drawArrows(x, z, flyAng, noseAng, label) {
    removeOverlay();
    const ns = 'http://www.w3.org/2000/svg';
    overlay = document.createElementNS(ns, 'svg');
    overlay.setAttribute('style', 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:99999');
    const a = R.toScreen(x, z);
    const arrow = (ang, col, len) => {
      const b = R.toScreen(x - Math.sin(ang) * len, z - Math.cos(ang) * len);
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', a.x); l.setAttribute('y1', a.y); l.setAttribute('x2', b.x); l.setAttribute('y2', b.y);
      l.setAttribute('stroke', col); l.setAttribute('stroke-width', '3');
      overlay.appendChild(l);
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', b.x); c.setAttribute('cy', b.y); c.setAttribute('r', '6'); c.setAttribute('fill', col);
      overlay.appendChild(c);
    };
    arrow(flyAng, '#3aff8a', 160);
    arrow(noseAng, '#ff3b30', 120);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', 24); t.setAttribute('y', 40); t.setAttribute('fill', '#fff');
    t.setAttribute('style', 'font: 600 18px ui-monospace, Menlo; paint-order: stroke; stroke: #000; stroke-width: 4px');
    t.textContent = label;
    overlay.appendChild(t);
    const t2 = document.createElementNS(ns, 'text');
    t2.setAttribute('x', 24); t2.setAttribute('y', 66); t2.setAttribute('fill', '#ccc');
    t2.setAttribute('style', 'font: 14px ui-monospace, Menlo; paint-order: stroke; stroke: #000; stroke-width: 4px');
    t2.textContent = 'grün = Flugrichtung (Bewegung), rot = Bug laut Rumpfform';
    overlay.appendChild(t2);
    document.body.appendChild(overlay);
  }
  function removeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }

  async function waitFor(fn, ms = 5000) { const t = now(); while (now() - t < ms) { if (fn()) return true; await sleep(50); } return false; }

  PT.modelCheck = async (opts = {}) => {
    S.inModelCheck = true;
    const res = { modelle: {}, imFlug: {}, abweichungen: [] };
    try {
      const F = R.factory;
      const trailGeo = F.trailGeo();
      V3 = R.camera.position.constructor; M4 = R.camera.matrixWorld.constructor;
      // alle Schiffs-GLBs geladen? (werden gestaffelt bis ≈ 20 s nach Start nachgeladen)
      const factions = ['europa', 'saturn', 'eris'], ships = ['s1', 's2'];
      await waitFor(() => factions.every((f) => ships.every((s) => F.glb.has(`ship:${s}:${f}`))), 25000);
      const loadoutFor = (s) => (s === 's2' ? { lasers: ['pulse', 'ion', 'plasma', 'gamma'], gens: ['sh1', 'dr1', 'sh1'] } : { lasers: ['pulse', 'ion'], gens: ['sh1', 'dr1'] });
      // statisch: jedes Modell einzeln (GLB und Platzhalter)
      for (const f of factions) for (const s of ships) {
        const k = `ship:${s}:${f}`;
        if (F.glb.has(k)) {
          const m = F.buildShip(f, s, loadoutFor(s));
          res.modelle[k] = { art: 'GLB', ...inspectModel(m, 'ship', trailGeo) };
        } else res.modelle[k] = { art: 'GLB fehlt', ok: false, befunde: ['GLB nicht geladen'] };
        const g = F.glb.get(k); F.glb.delete(k);
        const gs = F.glb.get(`ship:${s}`); if (gs) F.glb.delete(`ship:${s}`);
        try { res.modelle[k + ':platzhalter'] = { art: 'Platzhalter', ...inspectModel(F.buildShip(f, s, loadoutFor(s)), 'ship', trailGeo) }; }
        finally { if (g) F.glb.set(k, g); if (gs) F.glb.set(`ship:${s}`, gs); }
      }
      const types = Object.keys(DATA.ENEMIES).filter((t) => t !== 'nest');
      for (const t of types) res.modelle['enemy:' + t] = { art: F.glb.has('enemy:' + t) ? 'GLB' : 'Platzhalter', ...inspectModel(F.buildEnemy(t), 'enemy', trailGeo) };

      // im Flug: Bewegungsrichtung gegen Bug laut Rumpfform (aus Spielmessung + Modellversatz)
      for (const [k, arr] of Object.entries(flight)) {
        const mm = res.modelle[k];
        const off = mm && mm.form ? mm.form.bugWinkelGrad * Math.PI / 180 : 0;
        const dev = arr.map((a) => Math.abs(deg(wrap(a - off))));
        res.imFlug[k] = { ...stats(dev), quelle: 'Spiel', modellversatzGrad: mm && mm.form ? mm.form.bugWinkelGrad : null };
      }

      // in der Szene: jedes Schiffsmodell geradeaus fliegen lassen, jeden Gegnertyp ebenso
      const p = W.player;
      const keep = { faction: p.faction, ship: p.ship, loadout: p.loadout, dist: R.targetDist };
      W._invulnUntil = W.time + 600;
      if (p.attacking) W.toggleAttack();
      W.setTarget(null);
      R.targetDist = 320;
      const own = `ship:s1:${W.profile.faction}`;
      for (const f of factions) for (const s of ships) {
        const k = `ship:${s}:${f}`;
        p.faction = f; p.ship = s; p.loadout = loadoutFor(s);
        R._playerDirty = true;
        await waitFor(() => { const v = R.views.get('player'); return v && v.sig === R._sig(p) && !v.model.placeholder; }, 4000);
        const ang = Math.random() * TAU;
        moveTo(p.x - Math.sin(ang) * 3000, p.z - Math.cos(ang) * 3000);
        await sleep(2600);
        const v = R.views.get('player');
        const mm = res.modelle[k + (v && v.model.placeholder ? ':platzhalter' : '')];
        const off = mm && mm.form ? mm.form.bugWinkelGrad * Math.PI / 180 : 0;
        const fly = heading(p.vx, p.vz);
        const nose = (v ? v.rrot : p.rot) + off;
        const dev = Math.abs(deg(wrap(fly - nose)));
        const row = { abweichungGrad: dev, tempo: Math.round(p.speed), modell: v && v.model.placeholder ? 'Platzhalter' : 'GLB' };
        (res.imFlug[k + ':szene'] = row);
        const bad = dev > 20 || (mm && !mm.ok);
        if (bad || k === own) {
          drawArrows(p.x, p.z, fly, nose, `${k}  Abweichung Bug ↔ Flug: ${dev}°${mm && mm.befunde.length ? '  · ' + mm.befunde.join('; ') : ''}`);
          await sleep(120);
          const file = await requestShot(`Ausrichtung ${k}: ${dev}°${bad ? ' (ABWEICHUNG)' : ' (Beispiel, in Ordnung)'}`, 'ausrichtung-' + k.replace(/:/g, '-'), { kind: 'ausrichtung', wait: true });
          removeOverlay();
          if (bad) res.abweichungen.push({ modell: k, abweichungGrad: dev, befunde: mm ? mm.befunde : [], bild: file });
          else row.bild = file;
        }
      }
      p.faction = keep.faction; p.ship = keep.ship; p.loadout = keep.loadout; R._playerDirty = true;
      W.stopMove();
      // Gegner: vorübergehend erzeugen, geradeaus fliegen lassen (Spieler unverwundbar → keine Feindschaft)
      for (const t of types) {
        const e = W.spawnTemp(t, p.x + 220, p.z + 60);
        const ang = Math.random() * TAU;
        e.homeX = e.wx = e.x - Math.sin(ang) * 2500; e.homeZ = e.wz = e.z - Math.cos(ang) * 2500; e.waitT = 0; e.state = 'wander';
        await sleep(1800);
        const v = R.views.get(e.id);
        const mm = res.modelle['enemy:' + t];
        const sp0 = v && v.model && v.model.spin ? v.model.spin.rotation.y : 0;
        await sleep(300);
        const spinning = !!(v && v.model && v.model.spin && Math.abs(v.model.spin.rotation.y - sp0) > 0.1);
        if (spinning && mm) { mm.rundum = true; mm.dreht = true; mm.befunde = mm.befunde.filter((b) => !/^Bug /.test(b)); mm.ok = mm.befunde.length === 0; }
        const off = mm && mm.form ? mm.form.bugWinkelGrad * Math.PI / 180 : 0;
        const fly = heading(e.vx, e.vz);
        const nose = (v ? v.rrot : e.rot) + off;
        const dev = Math.abs(deg(wrap(fly - nose)));
        res.imFlug['enemy:' + t + ':szene'] = { abweichungGrad: spinning ? null : dev, tempo: Math.round(Math.hypot(e.vx, e.vz)), zustand: e.state, dreht: spinning };
        const bad = (!spinning && !(mm && mm.rundum) && dev > 20) || (mm && !mm.ok);
        if (bad) {
          // Kamera kurz auf den Gegner: Spieler daneben stellen
          drawArrows(e.x, e.z, fly, nose, `enemy:${t}  Abweichung Bug ↔ Flug: ${dev}°${mm && mm.befunde.length ? '  · ' + mm.befunde.join('; ') : ''}`);
          await sleep(80);
          const file = await requestShot(`Ausrichtung enemy:${t}: ${dev}° (ABWEICHUNG)`, 'ausrichtung-enemy-' + t, { kind: 'ausrichtung', wait: true });
          removeOverlay();
          res.abweichungen.push({ modell: 'enemy:' + t, abweichungGrad: dev, befunde: mm ? mm.befunde : [], bild: file });
        }
        e.alive = false; W.entities.delete(e.id); B.emit('despawn', { id: e.id });
      }
      R.targetDist = keep.dist;
      // statische Befunde ohne Flugabweichung trotzdem melden
      for (const [k, mm] of Object.entries(res.modelle)) {
        if (mm.ok === false && !res.abweichungen.find((a) => a.modell === k || a.modell + ':platzhalter' === k)) res.abweichungen.push({ modell: k, abweichungGrad: mm.form ? Math.abs(mm.form.bugWinkelGrad) : null, befunde: mm.befunde, bild: null });
      }
    } catch (err) {
      res.fehler = String(err && err.stack || err);
    } finally {
      removeOverlay();
      S.inModelCheck = false;
    }
    PT.modelResult = res;
    return res;
  };

  // ───────── Start / Bericht ─────────
  PT.start = async (opts = {}) => {
    L = window.__ls; W = L.world; R = L.renderer; B = L.bus;
    DATA = await import('/src/core/data.js');
    S.durS = opts.durS || 120;
    S.t0 = now(); S.running = true; S.phase = 'start';
    S.startProfile = { credits: W.profile.credits, tritium: W.profile.tritium, xp: W.profile.xp, honor: W.profile.honor, level: W.profile.level };
    const offBus = B.on('*', onBus);
    PT._off = offBus;
    const origNote = R.noteWork.bind(R);
    R.noteWork = (ms) => { lastWork = ms; origNote(ms); };
    requestAnimationFrame(onFrame);
    S.timer = setInterval(tick, 100);
    return { ok: true, sector: W.sector.id, faction: W.profile.faction, quality: R.stats && R.stats.quality, gpuTimer: !!(R.gpuTimer && R.gpuTimer.ok) };
  };
  PT.state = () => ({ done: S.done, t: r1(elapsed()), phase: S.phase, action: S.action, hp: W ? Math.round(W.player.hp) : 0, sector: W ? W.sector.id : '', frames: fN });

  PT.report = () => {
    clearInterval(S.timer);
    S.running = false;
    const pick = (cond) => { const a = [], w = [], g = []; for (let i = 0; i < fN; i++) if (cond(fFlag[i], i)) { a.push(fDt[i]); w.push(fWork[i]); g.push(fGpu[i]); } return { a, w, g }; };
    const sets = {
      gesamt: pick((f) => !(f & 2)),
      kampf: pick((f) => !(f & 2) && (f & 1) && !(f & 8)),
      ruhe: pick((f) => !(f & 2) && !(f & 1) && !(f & 8)),
      ersterKampf: pick((f) => !(f & 2) && (f & 4) && !(f & 8)),
      angedockt: pick((f) => !(f & 2) && (f & 8)),
    };
    const frames = {};
    for (const [k, v] of Object.entries(sets)) {
      const est = v.w.map((w, i) => Math.max(w, v.g[i]));
      frames[k] = {
        bilder: v.a.length, bildabstandMs: stats(v.a), rechenzeitCpuMs: stats(v.w), gpuMs: stats(v.g), bildzeitMs: stats(est),
        ueber20ms: v.a.filter((x) => x > 20).length, ueber25ms: v.a.filter((x) => x > 25).length, ueber33ms: v.a.filter((x) => x > 33.4).length,
        fps: v.a.length ? r1(1000 / (v.a.reduce((s, x) => s + x, 0) / v.a.length)) : 0,
      };
    }
    const lf = longFrames.slice().sort((a, b) => b.bildabstandMs - a.bildabstandMs).slice(0, 12);
    const minutes = (S.playEnd || elapsed()) / 60;
    const ttk = {};
    for (const [k, arr] of Object.entries(C.ttk)) ttk[k] = { abschuesse: arr.length, ...stats(arr) };
    const behavior = {};
    for (const [t, T] of Object.entries(E.byType)) {
      const tot = Object.values(T.states).reduce((s, x) => s + x, 0) || 1;
      const share = {};
      Object.entries(T.states).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => { share[k] = Math.round(n / tot * 1000) / 10; });
      behavior[t] = {
        stichproben: T.samples, anteilProzent: share, abstandZumSpieler: stats(T.dist), ausweichmanoever: T.dodges,
        angriffsbeginn: { selbstGetroffen: T.joinedSelf, eigeneSicht: T.joinedSight, mitgezogenHilfe: T.joinedHelp }, fluchten: T.flees,
        uebereinanderAnteilProzent: Math.round(T.overlapSamples / Math.max(1, T.samples) * 1000) / 10,
        tempoMittel: Math.round(T.speed / Math.max(1, T.samples)),
        schuesse: C.enemyShots[t] || 0, treffer: C.enemyHits[t] || 0,
      };
    }
    const pr = W.profile;
    const shotA = C.shotAngles;
    return {
      dauerSpielS: r1(S.playEnd || elapsed()), faction: pr.faction, startSektor: S.startSector, endSektor: W.sector.id,
      qualitaet: { stufe: R.stats && R.stats.quality, aufloesungsFaktor: R.stats && R.stats.scale, pixeldichte: R.stats && R.stats.pr, puffer: R.stats ? `${R.stats.w}x${R.stats.h}` : '', gpuTimer: !!(R.gpuTimer && R.gpuTimer.ok), meldungen: C.qualityMsgs },
      bilder: frames, laengsteBilder: lf, haengerAnzahl: longFrames.length,
      kampf: {
        spielerSchuesse: C.playerShots, trefferquoteProzent: C.playerShots ? Math.round(C.playerHits / C.playerShots * 1000) / 10 : 0,
        schuesseJeMunition: C.ammoShots, raketen: C.rockets, munitionWechsel: ammoLog,
        abschuesse: C.kills, zeitBisAbschussS: ttk,
        eingesteckt: { huelle: Math.round(C.taken.hull), schild: Math.round(C.taken.shield), jeQuelle: Object.fromEntries(Object.entries(C.taken.bySource).map(([k, v]) => [k, Math.round(v)])) },
        tode: C.deaths, todErzwungen: S.forcedDeath, reparaturen: S.repairs,
        beute: C.loot, beuteJeMinute: { credits: Math.round(C.loot.credits / minutes), tritium: r1(C.loot.tritium / minutes), erfahrung: Math.round(C.loot.xp / minutes), ehre: r1(C.loot.honor / minutes) },
        profilVorher: S.startProfile, profilNachher: { credits: pr.credits, tritium: pr.tritium, xp: pr.xp, honor: pr.honor, level: pr.level },
        stufenAufstiege: C.levelups, einkaeufe: S.bought, aufrufDauerMs: { andocken: S.dockCallMs, einkaufen: S.shopCallMs, abdocken: S.undockCallMs }, angedockt: C.docked, spruenge: C.sectors,
        schussWinkelZurNase: { ...stats(shotA), ueber45Grad: shotA.filter((a) => a > 45).length, ueber90Grad: shotA.filter((a) => a > 90).length },
      },
      gegner: {
        verhalten: behavior,
        uebereinander: { stichprobenMitUeberlappung: E.overlapSamples, stichproben: E.samples, anteilProzent: Math.round(E.overlapSamples / Math.max(1, E.samples) * 1000) / 10, vorfaelleJeTyp: E.overlapIncidents, hoechstensGleichzeitig: E.maxOverlapAtOnce },
        hilfeMeldungen: C.helpMsgs, vorübergehendErzeugt: C.tempSpawns,
      },
      meldungen: Object.entries(C.messages).sort((a, b) => b[1] - a[1]).slice(0, 25),
      ausrichtung: PT.modelResult || null,
    };
  };
})();
