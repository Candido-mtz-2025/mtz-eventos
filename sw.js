const CACHE_NAME = 'mtz-eventos-v60';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

async function precacheShellComRede(cache) {
  const tarefas = APP_SHELL.map(async (recurso) => {
    try {
      const request = new Request(recurso, { cache: 'reload' });
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(recurso, response.clone());
      }
    } catch (_) {
      // Falha pontual de rede não deve impedir ativação do SW.
    }
  });

  await Promise.allSettled(tarefas);
}

function deveIgnorarRequisicao(request) {
  const url = new URL(request.url);
  const protocoloHttp = url.protocol === 'http:' || url.protocol === 'https:';

  return (
    !protocoloHttp ||
    request.method !== 'GET' ||
    url.protocol === 'chrome-extension:' ||
    request.url.includes('accounts.google.com') ||
    request.url.includes('script.google.com')
  );
}

function ehNavegacao(request) {
  if (request.mode === 'navigate') return true;
  return request.headers.get('accept')?.includes('text/html');
}

async function salvarNoCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function respostaNetworkFirst(request) {
  try {
    const response = await fetch(request);
    await salvarNoCache(request, response);
    return response;
  } catch (erro) {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || (await cache.match('./index.html'));
  }
}

async function respostaStaleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const atualizacao = fetch(request)
    .then(async (response) => {
      await salvarNoCache(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const respostaRede = await atualizacao;
  if (respostaRede) return respostaRede;

  return new Response('', { status: 504, statusText: 'Offline' });
}

function recursoCritico(request) {
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  return (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('/index.html')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => precacheShellComRede(cache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  const data = event?.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (deveIgnorarRequisicao(request)) return;

  if (ehNavegacao(request)) {
    event.respondWith(respostaNetworkFirst(request));
    return;
  }

  if (recursoCritico(request)) {
    event.respondWith(respostaNetworkFirst(request));
    return;
  }

  event.respondWith(respostaStaleWhileRevalidate(request));
});
