// LAST SIGNALS als Desktop-App für Mac und Windows (Electron-Hülle, unsigniert, nur zum Testen).
// Das Spiel liegt als fertiger Web-Build in www/ und wird über das eigene Schema app://ls/ ausgeliefert:
// So bleiben die absoluten Pfade des Spiels (/models/…, /audio/…, /fonts/…) gültig, Spielstände liegen
// dauerhaft im App-Profil, und Koop (Supabase Realtime) läuft weiter über das Netz.
'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
// Kennung für das Spiel (window.lsDesktop.platform): 'mac' | 'windows' | sonst process.platform
const PLATFORM = IS_MAC ? 'mac' : IS_WIN ? 'windows' : process.platform;
const SCHEME = 'app';
const HOST = 'ls';
const START = `${SCHEME}://${HOST}/index.html`;
// gepackte App: www/ neben main.cjs; Entwicklung (npm start in Apps/): ../www
const WWW = [path.join(__dirname, 'www'), path.join(__dirname, '..', 'www')].find((d) => fs.existsSync(path.join(d, 'index.html'))) || path.join(__dirname, 'www');

// ---------------------------------------------------------------- Einstellungen (im App-Profil)
// Nur für Tests: eigenes, leeres Profil (Spielstände, Einstellungen) statt ~/Library/Application Support/LAST SIGNALS
// (Mac) bzw. %APPDATA%\LAST SIGNALS (Windows)
if (process.env.LS_USER_DATA) app.setPath('userData', path.resolve(process.env.LS_USER_DATA));
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'einstellungen.json');
const DEFAULTS = { bounds: null, maximized: false, fullscreen: false, unlimitedFps: false };
function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) }; } catch { return { ...DEFAULTS }; }
}
function saveSettings(s) {
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true }); fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2)); } catch { /* egal */ }
}
const settings = loadSettings();

// ---------------------------------------------------------------- Chromium-Schalter (vor app.ready)
app.commandLine.appendSwitch('force_high_performance_gpu'); // Rechner mit zwei Grafikchips: den starken nehmen
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (settings.unlimitedFps || process.env.LS_UNLIMITED_FPS === '1') {
  // Bildratenbegrenzung aus (Einstellung, wirkt erst nach Neustart): kein VSync, Bildrate nach oben offen
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true },
}]);

// ---------------------------------------------------------------- Dateien ausliefern
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

async function serve(request) {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response('Nicht gefunden', { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(WWW, rel));
  if (file !== WWW && !file.startsWith(WWW + path.sep)) return new Response('Verboten', { status: 403 });
  let stat;
  try { stat = await fs.promises.stat(file); } catch { stat = null; }
  if (!stat || !stat.isFile()) return new Response('Nicht gefunden', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const headers = {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'content-length': String(stat.size),
    'cache-control': 'no-cache',
  };
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  const body = await fs.promises.readFile(file);
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------- Fenster
function visibleBounds(b) {
  if (!b || !Number.isFinite(b.width) || !Number.isFinite(b.height)) return null;
  const area = screen.getDisplayMatching(b).workArea;
  const w = Math.min(Math.max(b.width, 960), area.width), h = Math.min(Math.max(b.height, 600), area.height);
  const x = Math.min(Math.max(b.x, area.x), area.x + area.width - w), y = Math.min(Math.max(b.y, area.y), area.y + area.height - h);
  return { x, y, width: w, height: h };
}

let win = null;
function createWindow() {
  const saved = visibleBounds(settings.bounds);
  const work = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    ...(saved || { width: Math.min(1600, work.width), height: Math.min(960, work.height), center: true }),
    minWidth: 960, minHeight: 600,
    backgroundColor: '#000000', title: 'LAST SIGNALS', show: false,
    fullscreenable: true,
    // Windows: keine sichtbare Menüleiste (F10 blendet sie ein); Alt bleibt fürs Spiel frei (Alt+Zahl = Leiste wechseln)
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, spellcheck: false,
    },
  });
  if (!IS_MAC) win.setMenuBarVisibility(false);
  if (settings.maximized) win.maximize();
  if (settings.fullscreen) win.setFullScreen(true);
  win.once('ready-to-show', () => win.show());

  // Fenstergröße merken (normale Größe, dazu maximiert/Vollbild)
  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.bounds = win.getNormalBounds();
    settings.maximized = win.isMaximized();
    settings.fullscreen = win.isFullScreen();
    saveSettings(settings);
  };
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(remember, 500); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) win.on(ev, later);
  win.on('close', remember);
  win.on('closed', () => { win = null; });

  // F11 schaltet Vollbild (zusätzlich zu Ctrl+Cmd+F aus dem Menü). Windows: F10 blendet die Menüleiste ein und aus.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
    else if (input.key === 'F10' && !IS_MAC) { e.preventDefault(); win.setMenuBarVisibility(!win.isMenuBarVisible()); }
  });
  // Externe Links im normalen Browser öffnen, nie im Spielfenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(`${SCHEME}://${HOST}/`)) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });
  win.loadURL(START);
  return win;
}

// ---------------------------------------------------------------- Menü
function setUnlimitedFps(on, ask = true) {
  settings.unlimitedFps = !!on;
  saveSettings(settings);
  buildMenu();
  if (!ask) return;
  const r = dialog.showMessageBoxSync(win || undefined, {
    type: 'info', buttons: ['Jetzt neu starten', 'Später'], defaultId: 0, cancelId: 1,
    message: on ? 'Bildratenbegrenzung aus' : 'Bildratenbegrenzung an',
    detail: 'Die Änderung wirkt nach einem Neustart der App.',
  });
  if (r === 0) { app.relaunch(); app.exit(0); }
}

function buildMenu() {
  const name = 'LAST SIGNALS';
  const fpsItem = { label: 'Bildratenbegrenzung aus (Neustart nötig)', type: 'checkbox', checked: !!settings.unlimitedFps, click: (item) => setUnlimitedFps(item.checked) };
  if (!IS_MAC) {
    // Windows: schlichtes Menü (per F10 sichtbar). Bewusst ohne Ctrl-Kürzel wie Ctrl+R/Ctrl+W, die mitten im Spiel stören würden.
    const about = () => dialog.showMessageBox(win || undefined, {
      type: 'info', title: `Über ${name}`, message: `${name} ${app.getVersion()}`,
      detail: `Testversion, nicht zur Weitergabe.\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome} · ${process.arch}`,
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Spiel', submenu: [fpsItem, { type: 'separator' }, { label: `Über ${name}`, click: about }, { type: 'separator' }, { role: 'quit', label: 'Beenden', accelerator: 'Alt+F4' }] },
      { label: 'Darstellung', submenu: [
        { label: 'Vollbild', accelerator: 'F11', click: () => { if (win) win.setFullScreen(!win.isFullScreen()); } },
        { label: 'Menüleiste ausblenden', accelerator: 'F10', click: () => { if (win) win.setMenuBarVisibility(false); } },
        { type: 'separator' },
        { label: 'Neu laden', click: () => { if (win) win.webContents.reload(); } },
        { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge', accelerator: 'Ctrl+Shift+I' },
      ] },
    ]));
    return;
  }
  const template = [
    { label: name, submenu: [
      { role: 'about', label: `Über ${name}` },
      { type: 'separator' },
      fpsItem,
      { type: 'separator' },
      { role: 'hide', label: `${name} ausblenden` },
      { role: 'hideOthers', label: 'Andere ausblenden' },
      { role: 'unhide', label: 'Alle einblenden' },
      { type: 'separator' },
      { role: 'quit', label: `${name} beenden` },
    ] },
    { label: 'Bearbeiten', submenu: [
      { role: 'undo', label: 'Widerrufen' }, { role: 'redo', label: 'Wiederholen' }, { type: 'separator' },
      { role: 'cut', label: 'Ausschneiden' }, { role: 'copy', label: 'Kopieren' }, { role: 'paste', label: 'Einsetzen' },
      { role: 'selectAll', label: 'Alles auswählen' },
    ] },
    { label: 'Darstellung', submenu: [
      { role: 'togglefullscreen', label: 'Vollbild', accelerator: 'Ctrl+Cmd+F' },
      { type: 'separator' },
      { role: 'reload', label: 'Neu laden' },
      { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' },
    ] },
    { label: 'Fenster', submenu: [{ role: 'minimize', label: 'Im Dock ablegen' }, { role: 'zoom', label: 'Zoomen' }, { role: 'close', label: 'Fenster schließen' }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- Brücke für den Preload (window.lsDesktop)
ipcMain.on('ls:info', (e) => {
  e.returnValue = { platform: PLATFORM, version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, arch: process.arch, unlimitedFps: !!settings.unlimitedFps };
});
ipcMain.handle('ls:fullscreen', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  w.setFullScreen(typeof on === 'boolean' ? on : !w.isFullScreen());
  return w.isFullScreen();
});
ipcMain.handle('ls:unlimited-fps', (e, on) => { setUnlimitedFps(!!on, false); return settings.unlimitedFps; });
ipcMain.handle('ls:relaunch', () => { app.relaunch(); app.exit(0); });

// ---------------------------------------------------------------- Start
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.setName('LAST SIGNALS');
  if (IS_WIN) app.setAppUserModelId('de.lastsignals.spiel'); // Taskleiste: Fenster und Verknüpfung gehören zusammen
  app.setAboutPanelOptions({ applicationName: 'LAST SIGNALS', applicationVersion: app.getVersion(), copyright: 'Testversion, nicht zur Weitergabe' });
  app.whenReady().then(() => {
    protocol.handle(SCHEME, serve);
    buildMenu();
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}
