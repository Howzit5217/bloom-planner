// Bloom Planner's service worker. It shows notifications (Android's browsers and iPhone home-screen
// web apps show them no other way), and keeps the app's own files once they've been fetched, so the
// app opens without fetching them again. Only files named for their contents are kept (the app's
// code, its fonts and the drawing engine, renamed whenever they change), never the page itself, so a
// new version always loads as usual.

// The store's name: each build stamps its own (tools/web-finish.js), and a new one clears the old.
const STORE = 'bloom-files-dev';
/** A file named for its contents: its code, fonts and images (a hash in the name), and the drawing engine. */
const KEPT = /\/(?:_expo\/static\/.+-[0-9a-f]{16,}\.js|assets\/.+\.[0-9a-f]{16,}\.[a-z0-9]+|canvaskit\.[0-9a-f]{16,}\.wasm)$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== STORE) await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !KEPT.test(new URL(request.url).pathname)) return;
  event.respondWith(
    (async () => {
      const store = await caches.open(STORE);
      const kept = await store.match(request);
      if (kept) return kept;
      const response = await fetch(request);
      if (response.ok) await store.put(request, response.clone());
      return response;
    })(),
  );
});

// A tap on a notification brings the app forward, or opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
