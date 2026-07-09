const CACHE = "draft-logger-v1";
const ASSETS = [
  "./draft_logger.html",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Network first for API calls, cache first for local assets
  const url = new URL(e.request.url);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (isLocal) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
  }
  // External API calls (Riot, JSONBin) always go to network
});
