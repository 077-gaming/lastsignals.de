// Minimaler Service Worker: macht das Spiel installierbar (Chrome/Edge), speichert nichts zwischen
// (immer der aktuelle Stand vom Server, kein veralteter Cache nach einem Deploy).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
