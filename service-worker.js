// Clarity service worker — caches the app shell so it works offline and
// loads instantly on repeat visits. Bump CACHE_NAME whenever any of the
// cached files change, so old clients pick up the new version instead of
// being stuck on a stale cache forever.
const CACHE_NAME = 'clarity-shell-v1';

// The app shell: everything needed for Clarity to load and run with no
// network connection. Google Fonts are intentionally NOT cached here --
// they're a separate origin, and failing open (falling back to the
// browser's default font) is better than letting a slow/failed font
// fetch block the whole app shell from installing.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // activate the new worker as soon as it's installed
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name)) // clear out old shell versions
      )
    )
  );
  self.clients.claim(); // take control of already-open tabs immediately
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests for our own origin -- let everything else
  // (Google Fonts, the Kokoro CDN, any future API calls) go straight to
  // the network untouched. Caching third-party/CDN responses here would
  // risk serving a stale voice model or font indefinitely.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          // Cache a copy of anything new from our own origin as we go,
          // so the shell self-heals if a file was added after install.
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          // Offline and not cached -- for a navigation request, fall back
          // to the cached index.html rather than showing a browser error.
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          throw new Error('Clarity: offline and resource not cached: ' + request.url);
        });
    })
  );
});
