// ══════════════════════════════════════════════
// WordSmart — Service Worker
// Strategy: Cache-First with Network Fallback
// ══════════════════════════════════════════════

const CACHE_NAME = 'wordsmart-v1';

// Core assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  // Google Fonts (will be cached on first network request)
];

// ── INSTALL: pre-cache core assets ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        // Don't fail install if some assets are missing (e.g. fonts offline)
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  // Immediately activate new SW without waiting for old tabs to close
  self.skipWaiting();
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// ── FETCH: Cache-First with Network Fallback ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // For navigation requests (HTML pages) — serve app shell
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => {
        return cached || fetch(request).catch(() => {
          return new Response('<h1>Offline</h1><p>Please connect to the internet to use WordSmart.</p>', {
            headers: { 'Content-Type': 'text/html' }
          });
        });
      })
    );
    return;
  }

  // Cache-First for all other assets (fonts, images, etc.)
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache it
      return fetch(request).then((response) => {
        // Only cache valid responses
        if (!response || response.status !== 200 || response.type === 'error') {
          return response;
        }

        // Clone the response (can only be consumed once)
        const responseToCache = response.clone();

        // Cache Google Fonts and same-origin assets
        const shouldCache =
          url.hostname === self.location.hostname ||
          url.hostname === 'fonts.googleapis.com' ||
          url.hostname === 'fonts.gstatic.com';

        if (shouldCache) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      }).catch(() => {
        // Network failed — nothing in cache either
        console.warn('[SW] Fetch failed for:', request.url);
      });
    })
  );
});

// ── MESSAGE: force update from client ──
self.addEventListener('message', (event) => {
  if (event.data?.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
