// Mehrspieler im Flug-HUD: Fenster CHAT (Reiter SEKTOR / FRAKTION / ALLE) und PILOTEN (Spielerliste mit Einladung,
// Stummschalten, Ziel bei PvP), dazu Namensschilder über fremden Schiffen. Daten kommen aus world.mp (net/mp.js)
// über das Bus-Ereignis 'mp'. Alles Fremde wird escaped (escapeHtml) oder als textContent gesetzt.
// Tasten: Enter öffnet das Eingabefeld (Enter sendet, Esc schließt), P blendet die Spielerliste ein/aus.
// Solange das Eingabefeld den Fokus hat, ignorieren Steuerung und Schnellleiste alle Tasten (input.js, hud-bar.js).
import './hud-mp.css';
import { FACTIONS, SHIPS } from '../core/data.js';
import { escapeHtml, CHAT_MAX } from '../net/mp-core.js';
import { CHAN_LABEL } from '../net/mp.js';
import { fmt } from './hud-parts.js';

const CHANS = ['sector', 'faction', 'all'];
const LIST_HZ = 4;
const TAG_MAX = 16;
const TAG_RANGE = 3000;

const facColor = (f) => (FACTIONS[f] ? FACTIONS[f].css.accent === '#8a8a90' ? FACTIONS[f].css.main : FACTIONS[f].css.accent : '#9fe8ff');
const hhmm = (t) => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dist = (m) => (m === Infinity ? '–' : m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' KM' : fmt(m) + ' M');

export const CHAT_BODY = `
  <div class="mc-tabs" role="tablist">${CHANS.map((c, i) => `<button type="button" class="mc-tab${i ? '' : ' on'}" role="tab" data-mpact="tab" data-ch="${c}">${CHAN_LABEL[c]}<i class="mc-un ls-num" data-un="${c}"></i></button>`).join('')}</div>
  <div class="mc-log" data-mp="log" aria-live="polite"></div>
  <label class="mc-in"><span class="ls-key mc-k">ENTER</span><input class="mc-field" data-mp="input" type="text" maxlength="${CHAT_MAX}" autocomplete="off" spellcheck="false" placeholder="Funken an SEKTOR"><span class="mc-cnt ls-num" data-mp="cnt"></span></label>
  <div class="mc-st" data-mp="st"></div>`;

export const PLAYERS_BODY = `
  <div class="mpl-inv" data-mp="inv"></div>
  <div class="mpl-list" data-mp="list"></div>
  <div class="mpl-empty" data-mp="empty">Keine anderen Piloten im Sektor.</div>
  <div class="mpl-foot">
    <button type="button" class="mpl-b mpl-pvp" data-mpact="pvp" title="PvP-Testphase: ab Sektor 2 außerhalb der sicheren Zone gegen andere Fraktionen"><span>PVP</span><b data-mp="pvp">AUS</b></button>
    <button type="button" class="mpl-b" data-mpact="leavecoop" data-mp="leave">KOOP VERLASSEN</button>
    <span class="hg-sp"></span><span class="mpl-net" data-mp="net"></span>
  </div>`;

export class HudMp {
  constructor(hud, chatEl, listEl) {
    this.hud = hud;
    this.chatEl = chatEl; this.listEl = listEl;
    this.ch = 'sector';
    this.q = (el, r) => el.querySelector(`[data-mp="${r}"]`);
    this.log = this.q(chatEl, 'log');
    this.input = this.q(chatEl, 'input');
    this.cnt = this.q(chatEl, 'cnt');
    this.st = this.q(chatEl, 'st');
    this.tabs = chatEl.querySelectorAll('.mc-tab');
    this.un = {};
    for (const c of CHANS) this.un[c] = chatEl.querySelector(`[data-un="${c}"]`);
    this.listBox = this.q(listEl, 'list');
    this.invBox = this.q(listEl, 'inv');
    this.empty = this.q(listEl, 'empty');
    this.pvpEl = this.q(listEl, 'pvp');
    this.pvpBtn = listEl.querySelector('[data-mpact="pvp"]');
    this.leaveBtn = this.q(listEl, 'leave');
    this.netEl = this.q(listEl, 'net');
    this.rows = new Map();
    this._acc = 1;
    this._invKey = '';
    this._stT = 0;
    this._shown = '';

    // Namensschilder
    this.tagLayer = document.createElement('div');
    this.tagLayer.className = 'mpn-layer';
    this.tagLayer.setAttribute('aria-hidden', 'true');
    hud.el.insertBefore(this.tagLayer, hud.el.firstChild);
    this.tags = [];
    for (let i = 0; i < TAG_MAX; i++) {
      const n = document.createElement('div');
      n.className = 'mpn';
      n.innerHTML = '<span class="mpn-n"></span><span class="mpn-l ls-num"></span><i class="mpn-b"><i></i></i>';
      this.tagLayer.appendChild(n);
      this.tags.push({ el: n, name: n.firstChild, lv: n.children[1], bar: n.children[2].firstChild, on: false, id: '', cls: '', x: NaN, y: NaN, nm: '', l: '', h: -1 });
    }
    this._scr = { x: 0, y: 0, visible: false };

    this._onClick = (e) => this._click(e);
    chatEl.addEventListener('click', this._onClick);
    listEl.addEventListener('click', this._onClick);
    this._onInput = () => this._count();
    this.input.addEventListener('input', this._onInput);
    this._onField = (e) => this._fieldKey(e);
    this.input.addEventListener('keydown', this._onField);
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
    this._off = hud.bus.on('mp', (p) => this._onMp(p));
    this._count();
    this._renderLog();
  }

  get mp() { return this.hud.world && this.hud.world.mp; }

  // ---------- Tasten ----------
  _key(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const w = this.hud.world;
    if (!w || w.docked || this.hud._menuOpen || !this.mp) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.open();
    } else if (e.code === 'KeyP' && !e.shiftKey) {
      e.preventDefault();
      this.hud.wins.toggleHidden('players');
      this.hud._syncBar();
    }
  }
  open(ch) {
    const ws = this.hud.wins;
    if (ws.isHidden('chat')) { ws.setHidden('chat', false); this.hud._syncBar(); }
    if (ws.isCollapsed('chat')) ws.setCollapsed('chat', false);
    if (ch) this.setTab(ch);
    this.input.focus();
  }
  _fieldKey(e) {
    // Eingabefeld fängt alle Tasten ab: nichts erreicht die Steuerung (input.js prüft das Ziel ohnehin)
    e.stopPropagation();
    if (e.code === 'Escape') { e.preventDefault(); this.input.blur(); return; }
    if (e.code === 'Tab') { e.preventDefault(); this.setTab(CHANS[(CHANS.indexOf(this.ch) + (e.shiftKey ? 2 : 1)) % 3]); return; }
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    e.preventDefault();
    const v = this.input.value;
    if (!v.trim()) { this.input.blur(); return; }
    const mp = this.mp;
    if (!mp) return;
    const err = mp.say(this.ch, v);
    if (err) { this._status(err); return; }
    this.input.value = '';
    this._count();
    this.input.blur();
  }
  _count() {
    const n = Array.from(this.input.value).length;
    this.cnt.textContent = n ? `${n}/${CHAT_MAX}` : '';
  }
  _status(text) { this.st.textContent = text; this._stT = 3.5; }

  setTab(ch) {
    if (!CHANS.includes(ch)) return;
    this.ch = ch;
    for (const t of this.tabs) t.classList.toggle('on', t.dataset.ch === ch);
    this.input.placeholder = `Funken an ${CHAN_LABEL[ch]}`;
    const mp = this.mp;
    if (mp) mp.unread[ch] = 0;
    this._renderLog();
    this._syncUnread();
  }

  // ---------- Ereignisse aus mp.js ----------
  _onMp(p) {
    if (!p) return;
    if (p.type === 'chat') {
      const mp = this.mp;
      if (p.ch === this.ch) {
        if (mp) mp.unread[p.ch] = 0;
        if (p.reset) this._renderLog(); else if (p.msg) this._append(p.msg);
      }
      this._syncUnread();
    } else if (p.type === 'roster') this._acc = 1;
  }
  _syncUnread() {
    const mp = this.mp;
    for (const c of CHANS) {
      const n = mp ? mp.unread[c] : 0;
      const s = n ? (n > 99 ? '99+' : String(n)) : '';
      if (this.un[c].textContent !== s) this.un[c].textContent = s;
    }
  }

  _line(m) {
    const fc = m.sys ? '' : ` style="--c:${facColor(m.fac)}"`;
    const mute = !m.self && !m.sys ? `<button type="button" class="mc-mu" data-mpact="mutecs" data-cs="${escapeHtml(m.cs)}" title="${escapeHtml(m.cs)} stummschalten">STUMM</button>` : '';
    return `<div class="mc-m${m.self ? ' is-self' : ''}${m.sys ? ' is-sys' : ''}"><span class="mc-t ls-num">${hhmm(m.t)}</span><b class="mc-cs"${fc}>${escapeHtml(m.sys ? 'SYS' : m.cs)}</b><span class="mc-x">${escapeHtml(m.text)}</span>${mute}</div>`;
  }
  _append(m) {
    const atEnd = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 24;
    this.log.insertAdjacentHTML('beforeend', this._line(m));
    while (this.log.childElementCount > 80) this.log.firstElementChild.remove();
    if (atEnd) this.log.scrollTop = this.log.scrollHeight;
  }
  _renderLog() {
    const mp = this.mp;
    const list = mp ? mp.chat[this.ch].filter((m) => m.self || m.sys || !mp.isMuted(m.cs)) : [];
    this.log.innerHTML = list.length ? list.map((m) => this._line(m)).join('') : `<div class="mc-m is-sys is-hint"><span class="mc-x">${this.ch === 'sector' ? 'Funk an alle Piloten in diesem Sektor.' : this.ch === 'faction' ? 'Funk an deine Fraktion, in allen Sektoren.' : 'Offener Funk an alle Piloten.'} Enter zum Schreiben.</span></div>`;
    this.log.scrollTop = this.log.scrollHeight;
  }

  // ---------- Klicks ----------
  _click(e) {
    const b = e.target.closest('[data-mpact]');
    if (!b) return;
    const mp = this.mp;
    const act = b.dataset.mpact;
    if (act === 'tab') { this.setTab(b.dataset.ch); return; }
    if (!mp) return;
    const sid = b.closest('[data-sid]')?.dataset.sid;
    switch (act) {
      case 'mutecs': mp.setMuted(b.dataset.cs, true); this._renderLog(); this._status(`${b.dataset.cs} ist stumm. Aufheben in der Spielerliste oder im Bordmenü.`); break;
      case 'mute': { const r = this.rows.get(sid); if (r) { mp.setMuted(r.cs, !mp.isMuted(r.cs)); this._renderLog(); } break; }
      case 'inv': if (sid) mp.invite(sid); break;
      case 'tgt': if (sid) mp.target(sid); break;
      case 'acc': if (sid) mp.answer(sid, true); break;
      case 'dec': if (sid) mp.answer(sid, false); break;
      case 'pvp': mp.setPvp(!mp.pvp); break;
      case 'leavecoop': mp.leaveCoop(); break;
      default: break;
    }
    this._acc = 1;
  }

  // ---------- jedes Bild ----------
  update(dt) {
    const mp = this.mp;
    if (this._stT > 0) { this._stT -= dt; if (this._stT <= 0) this.st.textContent = ''; }
    this._tagsUpdate(mp);
    this._acc += dt;
    if (this._acc < 1 / LIST_HZ) return;
    this._acc = 0;
    this._renderList(mp);
  }

  _renderList(mp) {
    const roster = mp ? mp.roster() : [];
    const w = this.hud.world;
    // Einladungen
    const inv = mp ? mp.invites() : [];
    const ik = inv.map((v) => v.sid + v.left).join('|');
    if (ik !== this._invKey) {
      this._invKey = ik;
      this.invBox.innerHTML = inv.map((v) => `<div class="mpl-ir" data-sid="${v.sid}"><span class="mpl-it">EINLADUNG</span><b style="--c:${facColor(v.fac)}">${escapeHtml(v.cs)}</b><span class="mpl-il ls-num">${v.left} S</span><span class="hg-sp"></span><button type="button" class="mpl-b is-fx" data-mpact="acc">ANNEHMEN</button><button type="button" class="mpl-b" data-mpact="dec">ABLEHNEN</button></div>`).join('');
    }
    // Zeilen wiederverwenden (Knöpfe bleiben beim Klicken bestehen)
    const seen = new Set();
    let prev = null;
    for (const r of roster) {
      seen.add(r.sid);
      let row = this.rows.get(r.sid);
      if (!row) {
        const el = document.createElement('div');
        el.className = 'mpl-row';
        el.dataset.sid = r.sid;
        el.innerHTML = `<i class="mpl-fx"></i><b class="mpl-cs"></b><span class="mpl-lv ls-num"></span><span class="mpl-tag"></span><span class="hg-sp"></span><span class="mpl-d ls-num"></span>
          <span class="mpl-acts"><button type="button" class="mpl-b" data-mpact="inv" title="Einladung senden: gemeinsam im Koop fliegen">ZU ZWEIT FLIEGEN</button><button type="button" class="mpl-b mpl-tg" data-mpact="tgt" title="Als Ziel erfassen (PvP)">ZIEL</button><button type="button" class="mpl-b" data-mpact="mute"></button></span>`;
        row = { el, cs: '', fx: el.querySelector('.mpl-fx'), csEl: el.querySelector('.mpl-cs'), lv: el.querySelector('.mpl-lv'), tag: el.querySelector('.mpl-tag'), d: el.querySelector('.mpl-d'), invB: el.querySelector('[data-mpact="inv"]'), tgB: el.querySelector('[data-mpact="tgt"]'), muB: el.querySelector('[data-mpact="mute"]'), k: '' };
        this.rows.set(r.sid, row);
      }
      row.cs = r.cs;
      const tag = r.coop ? 'KOOP' : r.attackable ? 'PVP' : r.docked ? 'ANGEDOCKT' : r.fac !== w?.profile?.faction ? FACTIONS[r.fac].name : '';
      const k = `${r.cs}|${r.fac}|${r.lv}|${tag}|${r.muted}|${r.invited}|${r.attackable}|${r.coop}|${!!w?.coop}`;
      if (k !== row.k) {
        row.k = k;
        row.fx.style.background = facColor(r.fac);
        row.csEl.textContent = r.cs;
        row.csEl.title = `${r.cs} · ${FACTIONS[r.fac].name} · ${(SHIPS[r.ship] || SHIPS.s1).name}`;
        row.lv.textContent = 'ST ' + r.lv;
        row.tag.textContent = tag;
        row.el.classList.toggle('is-pvp', r.attackable);
        row.el.classList.toggle('is-coop', r.coop);
        row.el.classList.toggle('is-muted', r.muted);
        row.muB.textContent = r.muted ? 'LAUT' : 'STUMM';
        row.invB.textContent = r.invited ? 'GESENDET' : 'ZU ZWEIT FLIEGEN';
        row.invB.disabled = r.invited || r.coop || !!w?.coop;
        row.tgB.hidden = !r.attackable;
      }
      const ds = dist(r.dist);
      if (row.d.textContent !== ds) row.d.textContent = ds;
      const want = prev ? prev.nextSibling : this.listBox.firstChild;
      if (want !== row.el) this.listBox.insertBefore(row.el, want);
      prev = row.el;
    }
    for (const [sid, row] of this.rows) if (!seen.has(sid)) { row.el.remove(); this.rows.delete(sid); }
    this.empty.hidden = roster.length > 0;
    // Fuß: PvP, Koop, Verbindung
    const pv = mp && mp.pvp ? 'AN' : 'AUS';
    if (this.pvpEl.textContent !== pv) { this.pvpEl.textContent = pv; this.pvpBtn.classList.toggle('is-on', pv === 'AN'); }
    this.leaveBtn.hidden = !(w && w.coop);
    const net = !mp ? 'AUS' : mp.status === 'verbunden' ? `${roster.length + 1} IM SEKTOR` : mp.status === 'getrennt' ? 'GETRENNT' : 'VERBINDE';
    if (this.netEl.textContent !== net) this.netEl.textContent = net;
  }

  // Namensschilder über fremden Schiffen (und dem Koop-Partner): Name, Stufe, Hüllenbalken; Rot = PvP-Ziel
  _tagsUpdate(mp) {
    const w = this.hud.world, r = this.hud.renderer;
    let n = 0;
    if (w && r && !w.docked && w.player) {
      const p = w.player;
      // nur fremde Schiffe und der Koop-Partner (nicht alle Entities je Bild durchsuchen)
      const list = this._tagList || (this._tagList = []);
      list.length = 0;
      const ally = w.entities.get('ally');
      if (ally) list.push(ally);
      if (mp) for (const R of mp.remotes.values()) if (R.ent && w.entities.get(R.ent.id) === R.ent) list.push(R.ent);
      for (const e of list) {
        if (n >= TAG_MAX) break;
        if (e.alive === false || e.id === p.targetId) continue; // Ziel: Name steht an der Zielklammer
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d > TAG_RANGE) continue;
        const s = r.toScreen(e.x, e.z, this._scr);
        if (!s.visible || s.behind) continue;
        const T = this.tags[n++];
        if (!T.on) { T.on = true; T.el.classList.add('on'); }
        const cls = e.pvpOk ? 'is-pvp' : e.type === 'ally' ? 'is-ally' : '';
        if (cls !== T.cls) { if (T.cls) T.el.classList.remove(T.cls); if (cls) T.el.classList.add(cls); T.cls = cls; }
        const nm = e.name || 'Pilot';
        if (nm !== T.nm) { T.nm = nm; T.name.textContent = nm; T.el.style.setProperty('--c', facColor(e.faction)); }
        const l = e.type === 'ally' ? 'KOOP' : 'ST ' + (e.level || 1);
        if (l !== T.l) { T.l = l; T.lv.textContent = l; }
        const h = e.hpMax ? Math.round((e.hp / e.hpMax) * 20) / 20 : 1;
        if (h !== T.h) { T.h = h; T.bar.style.transform = `scaleX(${h})`; }
        const x = Math.round(s.x), y = Math.round(s.y - 34 - Math.min(30, 9000 / Math.max(150, d)));
        if (x !== T.x || y !== T.y) { T.x = x; T.y = y; T.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-100%)`; }
      }
    }
    for (let i = n; i < TAG_MAX; i++) { const T = this.tags[i]; if (T.on) { T.on = false; T.el.classList.remove('on'); } }
  }

  // Bordmenü (SYSTEM · MEHRSPIELER)
  menuState() { const mp = this.mp; return { pvp: !!(mp && mp.pvp), muted: mp ? mp.muted.size : 0, on: !!mp }; }

  dispose() {
    this._off();
    window.removeEventListener('keydown', this._onKey);
    this.input.removeEventListener('keydown', this._onField);
    this.input.removeEventListener('input', this._onInput);
    this.chatEl.removeEventListener('click', this._onClick);
    this.listEl.removeEventListener('click', this._onClick);
    this.tagLayer.remove();
  }
}
