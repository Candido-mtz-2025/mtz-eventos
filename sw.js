// Service Worker Mínimo para Instalação
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('mtz-store').then((cache) => cache.addAll([
      './index.html',
      './manifest.json',
    ])),
  );
});

self.addEventListener('fetch', (e) => {
  console.log(e.request.url);
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request)),
  );
});