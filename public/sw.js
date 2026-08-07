const CACHE_PREFIX = "jobswipe-static-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const MAX_CACHED_ASSETS = 96;

const VERSIONED_ICON_PATHS = new Set([
  "/icons/v4/32",
  "/icons/v4/192",
  "/icons/v4/512",
  "/icons/v4/apple",
]);

const HASHED_NEXT_STATIC_PATH =
  /^\/_next\/static\/(?:chunks|css|media)\/(?:[^/]+\/)*(?=[^/]*[a-f0-9]{8,})[^/]+$/i;

const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f6f8">
  <title>Offline · JobSwipe</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { align-items: center; background: #f5f6f8; color: #15161a; display: flex; justify-content: center; margin: 0; min-height: 100dvh; padding: 24px; }
    main { max-width: 360px; text-align: center; }
    .mark { align-items: center; background: #0d1422; border-radius: 22px; color: white; display: inline-flex; height: 72px; justify-content: center; margin-bottom: 24px; width: 72px; }
    .mark svg { display: block; height: 100%; width: 100%; }
    h1 { font-size: 28px; letter-spacing: -0.04em; margin: 0; }
    p { color: #60646b; font-size: 15px; line-height: 1.6; margin: 12px 0 24px; }
    a { background: #15161a; border-radius: 999px; color: white; display: inline-block; font-size: 14px; font-weight: 700; padding: 12px 20px; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <div class="mark" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21.35 7.75v9.75c0 4.55-2.5 7.2-6.6 7.2-3.15 0-5.4-1.45-6.55-3.9" stroke="#f8fafc" stroke-linecap="round" stroke-linejoin="round" stroke-width="3.05"/>
        <path d="M10.15 12.45h14m0 0-2.65-2.55m2.65 2.55-2.65 2.55" stroke="#7868f6" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.7"/>
      </svg>
    </div>
    <h1>You’re offline</h1>
    <p>Reconnect to load JobSwipe. No jobs or personal details are stored in this offline page.</p>
    <a href="/">Try again</a>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkOnlyDocument(request));
    return;
  }

  // This allowlist intentionally excludes HTML, RSC payloads, APIs, profile data,
  // and all job records. Only immutable build assets and versioned app icons enter Cache Storage.
  if (!isImmutableAssetRequest(url)) {
    return;
  }

  event.respondWith(cacheFirstImmutableAsset(request));
});

function isImmutableAssetRequest(url) {
  if (url.search) {
    return false;
  }

  return VERSIONED_ICON_PATHS.has(url.pathname) || HASHED_NEXT_STATIC_PATH.test(url.pathname);
}

async function cacheFirstImmutableAsset(request) {
  let cache;

  try {
    cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }
  } catch {
    // Cache Storage is an enhancement; a normal network request still works without it.
  }

  const response = await fetch(request);

  if (cache && isSafeImmutableResponse(response)) {
    try {
      await cache.put(request, response.clone());
      await trimCache(cache);
    } catch {
      // Quota and private-mode failures must not break the asset request.
    }
  }

  return response;
}

async function trimCache(cache) {
  const requests = await cache.keys();
  const overflow = requests.length - MAX_CACHED_ASSETS;

  if (overflow <= 0) {
    return;
  }

  await Promise.all(requests.slice(0, overflow).map((request) => cache.delete(request)));
}

function isSafeImmutableResponse(response) {
  if (!response.ok || response.type !== "basic" || response.redirected) {
    return false;
  }

  const responseUrl = new URL(response.url);
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  const contentType = response.headers.get("Content-Type") ?? "";
  const isAssetContentType =
    /^(?:application\/(?:javascript|wasm)|font\/|image\/|text\/(?:css|javascript))/i.test(
      contentType,
    );

  return (
    responseUrl.origin === self.location.origin &&
    isAssetContentType &&
    /(?:^|,)\s*immutable(?:\s|,|$)/i.test(cacheControl)
  );
}

async function networkOnlyDocument(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(OFFLINE_DOCUMENT, {
      status: 503,
      statusText: "Offline",
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
