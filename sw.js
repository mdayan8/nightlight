// Nightlight service worker: app shell cache + real push notifications sent by the Mac.
const CACHE = "nightlight-v4";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./logo.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== "GET") return;   // relay traffic is never cached
  e.respondWith(
    fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

// Payload from the Mac: {title, body, url, tag?, rid?, reply?, until?}
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data.json() } catch { d = { title: "Nightlight", body: e.data && e.data.text() } }
  const approval = !!d.rid;
  e.waitUntil(self.registration.showNotification(d.title || "Nightlight", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png",
    tag: d.tag || (approval ? "ask" : "info"), renotify: true, requireInteraction: approval,
    vibrate: approval ? [60, 40, 60, 40, 120] : [40],
    data: d,
    actions: approval ? [{ action: "allow", title: "Approve" }, { action: "deny", title: "Deny" }] : [],
  }));
});

self.addEventListener("notificationclick", (e) => {
  const d = e.notification.data || {};
  e.notification.close();
  if ((e.action === "allow" || e.action === "deny") && d.reply && d.rid) {
    e.waitUntil(fetch(d.reply, { method: "POST", body: `${e.action} ${d.rid}` })
      .then(() => self.registration.showNotification(e.action === "allow" ? "Approved" : "Denied", { body: d.title, icon: "icon-192.png", tag: d.tag, data: { url: d.url } }))
      .catch(() => self.clients.openWindow(d.url || "./")));
    return;
  }
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => "focus" in c);
    return open ? open.focus() : self.clients.openWindow(d.url || "./");
  }));
});
