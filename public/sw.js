// Service Worker: NSA Serenity-Ω Edge Resilience Fabric (v1.0.0)
// Prevents 404 DEPLOYMENT_NOT_FOUND, edge outages, and network dropouts

const CACHE_NAME = 'serenity-omega-v1';
const STATIC_ASSETS = [
  '/',
  '/serenity-widget.html',
  '/index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // For API calls, try network first, then fall back to cache or grace payload
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response(
          JSON.stringify({
            status: "CACHED_GRACE_RECOVERY",
            message: "Reconnecting to Live Tape...",
            cards: []
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // For HTML shell & assets: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      }).catch(() => {
        // If network failed (e.g. 404 DEPLOYMENT_NOT_FOUND or offline), return cachedResponse
        return cachedResponse || new Response('Serenity Enclave Offline Recovery', { status: 200 });
      });

      return cachedResponse || fetchPromise;
    })
  );
});
