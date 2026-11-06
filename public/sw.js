// Bloom Planner's service worker. It's here only so the web app can show notifications (Android's
// browsers and iPhone home-screen web apps show them no other way). It keeps nothing offline and
// handles no requests, so a new version of the app always loads as usual.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
