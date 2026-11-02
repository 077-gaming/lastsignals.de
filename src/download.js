// Download-Seite: Gerät erkennen und die passende Kachel hervorheben (nach vorn, Marke „Dein Gerät“, Empfehlung oben).
// Reine Erkennung in detectPlatform() – ohne Zugriff auf window, damit sie sich leicht prüfen lässt.

/** 'iphone' | 'ipad' | 'android' | 'windows' | 'mac' | 'browser' (Linux, ChromeOS, sonst) | '' (unbekannt) */
export function detectPlatform({ ua = '', platform = '', touch = 0 } = {}) {
  const u = String(ua);
  const p = String(platform).toLowerCase();
  // zuerst der User-Agent, dann (falls er nichts verrät) die Plattform-Angabe
  if (/iPad/.test(u)) return 'ipad';
  if (/iPhone|iPod/.test(u)) return 'iphone';
  if (/Android/.test(u)) return 'android';
  if (/Windows NT|Win64|Windows Phone|Windows/.test(u)) return 'windows';
  // iPadOS 13+ meldet sich in Safari wie ein Mac, hat aber einen Touchscreen
  if (/Macintosh|Mac OS X/.test(u)) return touch > 1 ? 'ipad' : 'mac';
  if (/CrOS|Linux|X11/.test(u)) return 'browser';
  if (p === 'android') return 'android';
  if (p === 'windows' || p.startsWith('win')) return 'windows';
  if (p === 'macos' || p.startsWith('mac')) return touch > 1 ? 'ipad' : 'mac';
  if (p === 'linux' || p === 'chrome os' || p === 'chromeos') return 'browser';
  return '';
}

export function initDownloads() {
  const grid = document.querySelector('[data-dl-grid]');
  if (!grid) return;
  let id = '';
  try {
    id = detectPlatform({
      ua: navigator.userAgent,
      platform: (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
      touch: navigator.maxTouchPoints || 0,
    });
  } catch (e) { id = ''; }
  const item = id ? grid.querySelector(`[data-dl="${id}"]`) : null;
  const rec = document.querySelector('[data-dl-rec]');
  if (!item) {
    const unknown = document.querySelector('[data-dl-unknown]');
    if (unknown) unknown.hidden = false;
    return;
  }
  document.documentElement.dataset.dlPlatform = id;
  item.classList.add('is-match');
  const badge = item.querySelector('[data-dl-yours]');
  if (badge) badge.hidden = false;
  if (!rec) return;
  const name = item.querySelector('h2')?.textContent || '';
  rec.querySelector('[data-dl-rec-name]').textContent = name;
  const act = rec.querySelector('[data-dl-rec-act]');
  const main = item.querySelector('.dl-main');
  if (main && act) {
    const copy = main.cloneNode(true);
    copy.removeAttribute('id');
    act.replaceChildren(copy);
    if (id === 'mac') intelMac(item, copy);
  }
  rec.hidden = false;
}

// Mac mit Intel-Prozessor: Die Apple-Chip-Datei startet dort nicht. Chrome/Edge verraten die Architektur
// (userAgentData), dann empfiehlt die Seite die universelle Datei. Safari verrät sie nicht: dort bleibt der Hinweis in der Kachel.
function intelMac(item, btn) {
  const uad = navigator.userAgentData;
  if (!uad || typeof uad.getHighEntropyValues !== 'function') return;
  uad.getHighEntropyValues(['architecture']).then((v) => {
    if (!v || v.architecture !== 'x86') return;
    const uni = item.querySelector('.dl-alt[data-file$="-universal.dmg"]');
    if (!uni) return;
    btn.href = uni.href;
    btn.dataset.file = uni.dataset.file;
    const em = btn.querySelector('em'), uem = uni.querySelector('em');
    if (em && uem) em.textContent = uem.textContent;
  }).catch(() => {});
}
