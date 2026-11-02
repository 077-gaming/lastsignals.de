// App-Hüllen (Apps/): Mac-App (Electron, window.lsDesktop aus dem Preload), iPhone/iPad und Android (Capacitor).
// In einer Hülle liegt das Spiel als Datei in der App: kein Service Worker, kein „App installieren“-Knopf.

/** Reine Logik (Selbsttest): welche Hülle? 'desktop' | 'capacitor' | '' (Browser). */
export function appShellOf({ flag = '', desktop = null, capacitor = null, protocol = '' } = {}) {
  if (desktop && typeof desktop === 'object' && desktop.platform) return 'desktop';
  if (capacitor && typeof capacitor === 'object' && (typeof capacitor.isNativePlatform !== 'function' || capacitor.isNativePlatform())) return 'capacitor';
  if (protocol === 'app:') return 'desktop'; // Mac-App: eigenes Schema app://
  if (protocol === 'capacitor:') return 'capacitor'; // iOS: capacitor://localhost
  if (flag === '1') return 'capacitor'; // App-Build ohne erkannte Brücke: trotzdem wie eine Hülle behandeln
  return '';
}

/** Hülle im laufenden Spiel ('' im Browser). VITE_APP_SHELL=1 setzt Apps/bauen.sh beim Web-Build. */
export function appShell() {
  if (typeof window === 'undefined') return '';
  let flag = '';
  try { flag = import.meta.env.VITE_APP_SHELL || ''; } catch { /* Node */ }
  return appShellOf({ flag, desktop: window.lsDesktop, capacitor: window.Capacitor, protocol: location.protocol });
}
