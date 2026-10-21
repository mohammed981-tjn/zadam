/*
 * عاملُ الخدمة — الصفحاتُ العامّة تُفتح من الهاتف حين ينقطع الإنترنت.
 *
 * WHAT IT CACHES, AND WHAT IT NEVER TOUCHES
 *
 * Only pages that render the same for everyone: the homepage, the knowledge
 * base, the calculators, the studies, the news. A farmer who opened the water
 * calculator in town can open it again in the field.
 *
 * Nothing behind a login is ever stored: /dashboard, /lands, /seasons, /herds,
 * /contracts, /admin and the rest carry one person's land, money and evidence.
 * A phone is often shared in a household, and a cached copy of someone's
 * season would be readable by the next person to pick it up, offline, with no
 * session at all. So those go to the network or fail — never to the cache.
 *
 * STRATEGY
 *
 *   • Public pages   — network first; on failure, the last copy; else /offline.html.
 *   • /_next/static  — cache first: those files are content-hashed and never change.
 *   • Everything else (API, Server Actions, POST, other origins) — untouched.
 *
 * Bumping VERSION drops every old cache on the next activation.
 */
const VERSION = "sudagri-v2";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";

const PUBLIC_PAGES = [
  /^\/$/,
  /^\/knowledge(\/.*)?$/,
  /^\/tools\/(water|feasibility)$/,
  /^\/rain$/,
  /^\/arc-canal$/,
  /^\/export$/,
  /^\/export\/market$/,
  /^\/news$/,
  /^\/guide$/,
  /^\/mining$/,
  /^\/services$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build output: safe to serve from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode !== "navigate") return;

  const isPublic = PUBLIC_PAGES.some((re) => re.test(url.pathname));

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        // Only a clean, public, full-page answer is kept — never a redirect
        // (which could be a login bounce) and never a private route.
        if (isPublic && res.ok && res.type === "basic" && !res.redirected) {
          const cache = await caches.open(PAGES);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        if (isPublic) {
          const hit = await caches.match(req);
          if (hit) return hit;
        }
        return (await caches.match(OFFLINE_URL)) ?? Response.error();
      }
    })(),
  );
});

/*
 * تنبيهات الهاتف (البند ١١٩). The daily job pushes a small JSON payload —
 * title, body, url — and the browser shows it even with the site closed. A
 * tap opens the page it names, in the tab that is already open when one is.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "سوداقري";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      dir: "rtl",
      lang: "ar",
      data: { url: data.url || "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("navigate" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
