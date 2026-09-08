/* Offline support for the games.
 *
 * Pages use NETWORK-FIRST: when there is a connection you always get the
 * current version, and the cache is only used if the network fails or is
 * slow. That costs a short round-trip on launch, but it means an update
 * you publish shows up immediately instead of one launch later.
 *
 * Static assets (icons, manifest) use cache-first, since they never change
 * without a version bump.
 */

const VERSION = "v3";
const CACHE = "games-" + VERSION;
const NET_TIMEOUT = 3000;

const ASSETS = [
  "./",
  "./index.html",
  "./battleship.html",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("slow")), ms);
    promise.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await timeout(fetch(req, { cache: "no-store" }), NET_TIMEOUT);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req) || await cache.match("./index.html");
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === "navigate" ||
                 url.pathname.endsWith(".html") ||
                 url.pathname.endsWith("/");

  e.respondWith(isPage ? networkFirst(req) : cacheFirst(req));
});
