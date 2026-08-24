/*
 * Parrothecary service worker.
 *
 * Deliberately conservative. This app answers "how many are left and when does
 * it expire" — a stale answer is worse than no answer, so pages are never
 * served from cache. The worker exists to make the app installable and to fail
 * honestly when the Dell is unreachable.
 *
 * Static assets are cached because they only change when a new build ships.
 */

/*
 * Bump this whenever a cached asset's *contents* change under an unchanged
 * name. Icons and other files under /icons/ are served cache-first, so a phone
 * that already holds the old bytes keeps showing them however many times the
 * PNG is replaced on the server. The activate handler deletes caches whose name
 * does not match, which is what actually clears them.
 *
 * v2: icons flattened to opaque, maskable-192 added.
 */
const VERSION = 'v2';
const SHELL = `parrothecary-shell-${VERSION}`;
const ASSETS = `parrothecary-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('parrothecary-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/parrot-')
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never touch anything that changes state. A cached POST would be a disaster
  // in an app where buttons bin boxes.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: network only. Falling back to a cached page would show yesterday's
  // quantities and expiry dates as if they were current.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build output and icons are immutable per release, so cache-first is safe
  // and makes the app open instantly.
  if (isCacheableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else (data, server actions' payloads) goes straight to the network.
});
