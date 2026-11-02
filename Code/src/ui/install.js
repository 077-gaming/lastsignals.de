// „App installieren“: Spiel ohne Browserleiste wie eine eigene App starten (weniger Fehlbedienung durch Browser-Tasten).
// Chrome/Edge: echter Installationsdialog (beforeinstallprompt). Safari (iPad, Mac): kein Dialog möglich, daher eine
// kurze Anleitung (iPad: Teilen → Zum Home-Bildschirm; Mac: Ablage → Zum Dock hinzufügen).
// In den App-Hüllen (Apps/: Mac, iPhone/iPad, Android) kein Service Worker und kein Installieren-Knopf.
import { appShell } from '../core/shell.js';

let deferred = null;
if (typeof window !== 'undefined' && !appShell()) {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/play/sw.js', { scope: '/play/' }).catch(() => {});
}
export const isInstalled = () => !!appShell() || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

export function installHelp() {
  const ua = navigator.userAgent;
  const ipad = /iPad|iPhone/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  if (ipad) return 'Tippe oben in Safari auf das Teilen-Symbol (Quadrat mit Pfeil) und dann auf „Zum Home-Bildschirm“. Danach startet LAST SIGNALS vom Home-Bildschirm im Vollbild wie eine App.';
  if (safari) return 'In Safari oben im Menü „Ablage“ → „Zum Dock hinzufügen …“. Danach startet LAST SIGNALS aus dem Dock in einem eigenen Fenster ohne Browserleiste.';
  return 'Im Browsermenü „App installieren“ bzw. „LAST SIGNALS installieren“ wählen.';
}

/** Knopf verdrahten: versteckt, wenn schon installiert. */
export function wireInstall(btn, onInfo) {
  if (!btn) return;
  if (isInstalled()) { btn.hidden = true; return; }
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch { /* egal */ } deferred = null; return; }
    onInfo(installHelp());
  });
}
