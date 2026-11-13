// Feelz Run: lets the game install like an app. Everything comes from the network as normal;
// the start page is kept so the app still opens when the connection drops.
const CACHE = "feelzrun-shell-v1";
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html"])).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", e => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => caches.match("./index.html")));
});
