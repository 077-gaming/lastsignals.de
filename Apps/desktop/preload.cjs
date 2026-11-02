// Preload (contextIsolation an, nodeIntegration aus, Sandbox an): gibt dem Spiel eine schmale Desktop-Kennung.
// window.lsDesktop.platform === 'mac' | 'windows' → die Engine schaltet Desktop-Stufen frei (EXTREM, AO VOLL …).
// unlimitedFps: läuft dieser Start ohne Bildratenbegrenzung (Schalter wirken nur ab Start).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const os = typeof process !== 'undefined' ? process.platform : '';
let info = { platform: os === 'win32' ? 'windows' : os === 'darwin' ? 'mac' : (os || 'desktop'), version: '0.0.0' };
try { info = ipcRenderer.sendSync('ls:info') || info; } catch { /* Grundwerte */ }

contextBridge.exposeInMainWorld('lsDesktop', Object.freeze({
  platform: info.platform,
  version: info.version,
  electron: info.electron,
  chrome: info.chrome,
  arch: info.arch,
  unlimitedFps: !!info.unlimitedFps,
  /** Vollbild umschalten (true/false setzt fest). Liefert den neuen Zustand. */
  fullscreen: (on) => ipcRenderer.invoke('ls:fullscreen', on),
  /** Bildratenbegrenzung aus/an merken; wirkt nach relaunch(). */
  setUnlimitedFps: (on) => ipcRenderer.invoke('ls:unlimited-fps', !!on),
  /**
   * Grafikwerte des Spiels (Engine, bei jeder Änderung): { fpsCap, renderScale }. fpsCap 0 (UNBEGRENZT) schaltet beim
   * nächsten Start VSync und Bildratenbegrenzung von Chromium ab. Liefert { unlimitedFps, active, restart }.
   */
  setGraphics: (g) => ipcRenderer.invoke('ls:graphics', { fpsCap: Number(g && g.fpsCap), renderScale: Number(g && g.renderScale) })
    .catch(() => null),
  relaunch: () => ipcRenderer.invoke('ls:relaunch'),
}));
