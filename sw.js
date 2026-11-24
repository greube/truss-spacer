/* Truss Spacer service worker: precaches the whole app so it runs with no signal.
   Serves from cache straight away and refreshes the cache in the background,
   so a new version shows up on the next launch.
   Each copy of the app (the live one, and the v2 preview in /v2/) only touches its own
   files and caches, because they share one origin. The deploy stamps BUILD with the commit. */
const BUILD = "dev";
const SCOPE = new URL(self.registration.scope).pathname;   // e.g. /truss-spacer/
const PREFIX = "ts:" + SCOPE + ":";
const VERSION = PREFIX + BUILD;
// Caches named "ts-<sha>" came from the live app before this scheme; only the live app may clear them
const ownsLegacy = !SCOPE.endsWith("/v2/");
const ASSETS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "js/spacing.js",
  "js/store.js",
  "js/app.js",
  "js/power.js",
  "js/fixtures-data.js",
  "js/fixtures.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "fonts/barlow-400.woff2",
  "fonts/barlow-500.woff2",
  "fonts/barlow-600.woff2",
  "fonts/barlow-condensed-500.woff2",
  "fonts/barlow-condensed-600.woff2",
  "fonts/barlow-condensed-700.woff2",
  "fonts/jetbrains-mono.woff2"
];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's HTTP cache (GitHub Pages allows 10 minutes), so a new version
  // never gets saved with stale files
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && (k.startsWith(PREFIX) || ownsLegacy && k.startsWith("ts-"))).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Only this app's own files: anything else (like the /v2/ preview inside this scope) goes straight to the network
const OWN = new Set(ASSETS.map(a => new URL(a, self.registration.scope).pathname));

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const shell = req.mode === "navigate" && (url.pathname === SCOPE || url.pathname === SCOPE + "index.html");
  if (!shell && !OWN.has(url.pathname)) return;
  // A page load of the app gets the app shell, even with a query string
  const key = shell ? "index.html" : url.pathname;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(key, { ignoreSearch: shell });
    // "no-cache" checks with the server (a quick 304 if unchanged) instead of trusting the HTTP cache
    const net = fetch(url.href, { cache: "no-cache" }).then(res => {
      if (res && res.ok && res.type === "basic") cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response("Offline", { status: 503, statusText: "Offline" });
  }));
});
