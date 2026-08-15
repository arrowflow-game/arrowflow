/* ArrowFlow — Service Worker (PWA Offline) */
const CACHE = 'arrowflow-v1';
const ASSETS = ['/', '/index.html', '/css/style.css', '/css/game.css', '/css/ui.css',
  '/js/storage.js', '/js/levels.js', '/js/game.js', '/js/ui.js', '/js/main.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
