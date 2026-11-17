const CACHE_NAME = 'kabale-card-art-v1';
const CACHE_PREFIX = 'kabale-card-art-';
const MAX_ARTWORK_ENTRIES = 100;
const ARTWORK_PATH = /^assets\/cards\/optimized\/[a-z0-9-]+\.[a-f0-9]{8,64}\.webp$/i;

function isArtworkRequest(request, scopeUrl) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (url.origin !== scopeUrl.origin || url.search || url.hash) return false;
  if (!url.pathname.startsWith(scopeUrl.pathname)) return false;

  const relativePath = url.pathname.slice(scopeUrl.pathname.length);
  return ARTWORK_PATH.test(relativePath);
}

self.addEventListener('install', () => {
  // Let this artwork-only worker become active without waiting for every old tab to close.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name)));
    } catch {
      // Cache cleanup is best-effort. Existing pages can still load artwork from the network.
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const scopeUrl = new URL(self.registration.scope);
  if (!isArtworkRequest(event.request, scopeUrl)) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
    } catch {
      // Quota, private browsing, or storage failures should not prevent a network request.
    }

    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic' && response.url) {
      try {
        const responseUrl = new URL(response.url);
        if (responseUrl.origin === scopeUrl.origin && cache) {
          await cache.put(event.request, response.clone());
          const entries = await cache.keys();
          const excess = entries.length - MAX_ARTWORK_ENTRIES;
          if (excess > 0) {
            await Promise.all(entries.slice(0, excess).map(entry => cache.delete(entry)));
          }
        }
      } catch {
        // Browsers can evict or reject Cache API writes at any time. Keep the network response.
      }
    }
    return response;
  })());
});
