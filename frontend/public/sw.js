/*
 * Service worker for the SyndicMS resident app.
 *
 * Registered with scope "/app/" so it controls the resident PWA and nothing
 * else. The admin console shares this origin, and an operator refreshing a
 * dashboard must always get the live figure — a cache tuned for a phone on a
 * patchy connection has no business in front of it. Only pages under /app/ are
 * controlled clients, so only their requests reach this file.
 *
 * Three strategies, chosen by what the request is for:
 *
 *   navigation  → network first, cache second, offline page last.
 *                 A screen you can open beats a screen that is perfectly fresh.
 *   /api/resident GET
 *               → stale-while-revalidate. Show the last balance instantly and
 *                 correct it when the network answers.
 *   static      → cache first. Hashed filenames make it safe by construction.
 *
 * Writes are never cached or replayed. A queued payment that fires days later
 * against a balance that has since changed is worse than a failed payment, so
 * unsafe methods go straight to the network and the UI blocks them offline.
 */

const VERSION = "v1";
const SHELL_CACHE = `sms-resident-shell-${VERSION}`;
const DATA_CACHE = `sms-resident-data-${VERSION}`;
const STATIC_CACHE = `sms-resident-static-${VERSION}`;
const OFFLINE_URL = "/app-offline.html";

const PRECACHE = [OFFLINE_URL, "/app.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

// Responses that are cheap to re-fetch and change often enough that a stale
// copy would mislead rather than help.
const NEVER_CACHE = ["/api/resident/auth/", "/api/auth/csrf-token"];

// Documents and PDFs are generated per request and can be large; keeping them
// out of the data cache stops one statement download evicting every screen.
const NEVER_CACHE_SUFFIX = ["/pdf", "/file"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, STATIC_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only same-origin GETs are ours to reason about.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/api/resident/")) {
    if (isUncacheable(url.pathname)) return;
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

function isUncacheable(pathname) {
  return (
    NEVER_CACHE.some((prefix) => pathname.startsWith(prefix)) ||
    NEVER_CACHE_SUFFIX.some((suffix) => pathname.endsWith(suffix))
  );
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response("You are offline.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

/**
 * Answer from cache immediately, then refresh in the background.
 *
 * The header carries `x-sms-from-cache` so a screen can tell the resident it is
 * looking at the last figure received rather than the current one — showing a
 * stale balance as though it were live is how someone underpays.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    void network;
    return withCacheMarker(cached);
  }

  const response = await network;
  if (response) return response;

  return new Response(JSON.stringify({ error: "You are offline and this has not been loaded yet." }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

async function withCacheMarker(response) {
  const headers = new Headers(response.headers);
  headers.set("x-sms-from-cache", "1");
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 504 });
  }
}
