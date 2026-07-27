const CACHE_NAME = "carddex-ai-v7-0-4-module-dark-fix";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./evolution.css",
  "./carddex-core.js",
  "./app.js",
  "./evolution-ui.js",
  "./collection.js",
  "./library-engine.js",
  "./set-engine.js",
  "./insights-engine.js",
  "./library-ui.js",
  "./set-ui.js",
  "./insights-ui.js",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/carddex-open-pokedex.png",
  "./icons/carddex-open-pokedex-1024.png",
  "./icons/card-placeholder.svg",
  "./icons/pixel-camera.svg",
  "./icons/pixel-gallery.svg",
  "./icons/ui-home-placeholder.svg",
  "./icons/ui-scan-placeholder.svg",
  "./icons/ui-system-placeholder.svg",
  "./icons/ui-collection-placeholder.svg",
  "./icons/ui-wishlist-placeholder.svg",
  "./icons/ui-sets-placeholder.svg",
  "./icons/ui-history-placeholder.svg",
  "./icons/ui-insights-placeholder.svg",
  "./icons/ui-settings-placeholder.svg",
  "./icons/ui-camera-placeholder.svg",
  "./icons/ui-gallery-placeholder.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  /*
   * Online immer wirklich die aktuelle GitHub-Datei abrufen. `no-store`
   * umgeht zusätzlich den normalen Browser-HTTP-Cache, damit app.js-Updates
   * auf dem iPhone nicht mehr an einer alten Version hängen bleiben.
   */
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreSearch: true });
        if (cached) return cached;
        if (event.request.mode === "navigate") return caches.match("./index.html");
        throw new Error("Nicht im Cache verfügbar");
      })
  );
});
