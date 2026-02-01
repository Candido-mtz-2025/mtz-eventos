const CACHE_NAME = 'mtz-eventos-v13'; // Mude este nome (v12, v13...) sempre que atualizar o código
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  
  // Bibliotecas Externas (CDNs) identificadas no seu código
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];
];

// 1. INSTALAÇÃO: Baixa e salva os arquivos no cache
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Instalando e cacheando recursos...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Força o SW a ativar imediatamente
});

// 2. ATIVAÇÃO: Limpa caches antigos (importante para atualizações)
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Ativando e limpando caches antigos...');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// 3. INTERCEPTAÇÃO (FETCH): Serve o arquivo do cache se estiver offline
self.addEventListener('fetch', (event) => {
  // Ignora requisições do Google Login (não funcionam offline) e POSTs (API)
  if (event.request.url.includes('accounts.google.com') || 
      event.request.url.includes('script.google.com') ||
      event.request.method === 'POST') {
    return; 
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Se achou no cache, retorna o cache
      if (cachedResponse) {
        return cachedResponse;
      }
      // Se não, tenta buscar na rede
      return fetch(event.request).catch(() => {
        // Se falhar na rede (offline) e não estiver no cache, você poderia retornar uma página de erro,
        // mas como seu app é SPA (página única), isso raramente acontece se o index.html estiver cacheado.
      });
    })
  );
});
