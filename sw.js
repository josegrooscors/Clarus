// Clarus · funciona sin señal: guarda la app en el teléfono
const CACHE = "clarus-v0.2.3";
const ARCHIVOS = ["./", "index.html", "styles.css", "config.js", "manifest.json", "vendor/supabase.js", "vendor/jspdf.js",
  "js/util.js", "js/db.js", "js/camara.js", "js/escaner.js", "js/vendedor.js", "js/gestion.js", "js/app.js", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase va directo a la red
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});
