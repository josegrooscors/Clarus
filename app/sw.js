// Clarus · funciona sin señal: guarda la app en el teléfono
const CACHE = "clarus-v0.14.68";
const ARCHIVOS = ["./", "index.html", "styles.css", "config.js", "manifest.json", "vendor/supabase.js", "vendor/jspdf.js",
  "js/util.js", "js/db.js", "js/camara.js", "js/escaner.js", "js/vendedor.js", "js/gestion.js", "js/resumen.js", "js/catalogos.js", "js/config.js", "js/planograma.js", "js/auditoria.js", "js/ficha.js", "js/cierre.js", "js/merma.js", "js/picking.js", "js/mensajes.js", "js/soporte.js", "js/app.js", "icons/icon-192.png", "icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Supabase va directo a la red
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});

// Notificaciones de comunicados
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: "Clarus", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "Clarus", { body: d.body || "", tag: d.tag, renotify: !!d.renotify, icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: d.url || "./#mensajes" }, requireInteraction: true, vibrate: [200, 100, 200] }),
    self.clients.matchAll({ type: "window" }).then((cs) => cs.forEach((c) => c.postMessage({ tipo: "push" }))),
  ]));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./#mensajes", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    return c ? c.focus().then(() => c.navigate(url)) : self.clients.openWindow(url);
  }));
});
