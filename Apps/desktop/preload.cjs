// Preload (contextIsolation an, nodeIntegration aus, Sandbox an): gibt dem Spiel eine schmale Desktop-Kennung.
// window.lsDesktop.platform === 'mac' | 'windows' → die Engine kann Desktop-Qualitätsstufen freischalten.
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
  relaunch: () => ipcRenderer.invoke('ls:relaunch'),
}));
