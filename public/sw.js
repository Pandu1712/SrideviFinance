const CACHE_NAME = 'sri-finance-v2.1'; // Increment version
const urlsToCache = [
  '/',
  '/manifest.json',
  '/placeholder.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force update
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // For navigation requests (like the root /), always try network first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/'))
    );
    return;
  }

  // For assets like JS/CSS/Images, try cache first, but fall back to network
  // and DON'T cache assets from other domains (like Firebase)
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(networkResponse => {
        // Only cache successful GET requests for local assets
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          event.request.method === 'GET' &&
          url.origin === self.location.origin &&
          !url.pathname.includes('firebasestorage') // Avoid caching large firebase assets
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Return a placeholder for images if offline
      if (event.request.destination === 'image') {
        return caches.match('/placeholder.svg');
      }
    })
  );
});

