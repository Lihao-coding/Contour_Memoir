// The build embeds the complete, versioned asset list in this worker.
const version = "0cd7cac669bd05b6";
const files = ["assets/Walker-APoVTzC9.js","assets/index-CjUtt5uP.css","assets/index-CmuF51nB.js","demo/maclehose.trail.json","demo/studio/east-dam-orthophoto.webp","demo/studio/long-ke-wan.webp","demo/studio/po-pin-chau.webp","demo/studio/sai-kung-orthophoto.webp","demo/studio/walker.glb","demo/surface-detail.webp","index.html"];
const scope = self.registration.scope;
const prefix = "selfspace-trail:" + scope + ":";
const cacheName = prefix + version;
const index = new URL("index.html", scope).href;
const catalog = files.map((file) => new URL(file, scope).href);
let download;

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function complete(cache) {
  return (await Promise.all(catalog.map((url) => cache.match(url)))).every(Boolean);
}

async function save() {
  const cache = await caches.open(cacheName);
  if (!await complete(cache)) {
    // Cache.addAll is atomic if a request fails or the device lacks storage.
    await cache.addAll(catalog.map((url) => new Request(url, { cache: "reload" })));
  }
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key)));
}

self.addEventListener("message", (event) => {
  const port = event.ports[0];
  if (!port || !["status", "download"].includes(event.data)) return;
  if (event.data === "download") {
    download ??= save().finally(() => { download = undefined; });
    event.waitUntil(download.then(() => port.postMessage({ ready: true })).catch(() => port.postMessage({ error: true })));
    return;
  }
  event.waitUntil((async () => {
    const cache = await caches.has(cacheName) ? await caches.open(cacheName) : null;
    port.postMessage({ ready: cache ? await complete(cache) : false });
  })().catch(() => port.postMessage({ error: true })));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  const url = new URL(request.url);
  url.search = "";
  const entry = request.mode === "navigate" && (url.href === scope || url.href === index);
  const key = entry ? index : request.url;

  event.respondWith((async () => {
    const stored = await caches.match(key, { cacheName });
    if (stored && request.url.startsWith(new URL("assets/", scope).href)) return stored;
    let response;
    try {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 6000);
      try {
        response = await fetch(request, { signal: timeout.signal });
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) return response;
    } catch {
      // A complete older pack still works if a new build was deployed while offline.
    }
    if (stored) return stored;
    const keys = await caches.keys();
    for (const name of keys.reverse()) {
      if (!name.startsWith(prefix) || name === cacheName) continue;
      const older = await caches.match(key, { cacheName: name });
      if (older) return older;
    }
    return response ?? Response.error();
  })());
});
