
// Draft Logger service worker.
// VERSION is rewritten with a timestamp every time the app pushes to GitHub,
// which is what makes the browser treat this file as new and run the update
// cycle. A fixed version string means the browser byte-compares, sees no
// change, and never updates anything.
const VERSION = "1786833814274";
const CACHE   = "draft-logger-" + VERSION;

const ASSETS = [
  "./draft_logger.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Cached one at a time on purpose. cache.addAll() is atomic, so a single
    // missing file aborts the whole install and the worker never activates.
    await Promise.all(ASSETS.map(a =>
      c.add(a).catch(err => console.warn("[sw] could not cache", a, err))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;

  // Never touch anything but same-origin GETs. This keeps the Cloudflare sync
  // POSTs and every external API (Riot, OpenDota, etc.) completely untouched.
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // Network first, cache as fallback: online always gets the newest deploy,
  // offline still opens. The old worker was cache-first and only for
  // localhost, so on GitHub Pages it served nothing at all.
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: "no-cache" });
      if (fresh && fresh.ok) {
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === "navigate") {
        const shell = await caches.match("./draft_logger.html");
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

// The app posts NOTIFY whenever a service worker controls the page. The old
// worker had no message listener at all, so those notifications went nowhere.
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type === "NOTIFY") {
    self.registration.showNotification(d.title || "Draft Logger", {
      body: d.body || "",
      tag: d.tag,
      icon: "./icon-192.png",
      badge: "./icon-192.png"
    });
  } else if (d.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) if ("focus" in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow("./draft_logger.html");
  })());
});
