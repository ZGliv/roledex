const CACHE_PREFIX = "jobswipe-static-";
const CACHE_NAME = `${CACHE_PREFIX}v5`;
const MAX_CACHED_ASSETS = 96;

const VERSIONED_ICON_PATHS = new Set([
  "/icons/v5/32",
  "/icons/v5/192",
  "/icons/v5/512",
  "/icons/v5/apple",
  "/icons/v5/maskable",
]);

const HASHED_NEXT_STATIC_PATH =
  /^\/_next\/static\/(?:chunks|css|media)\/(?:[^/]+\/)*(?=[^/]*[a-f0-9]{8,})[^/]+$/i;

const OFFLINE_DOCUMENT = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#f5f6f8">
  <title>Offline · RoleDex</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { align-items: center; background: #f5f6f8; color: #15161a; display: flex; justify-content: center; margin: 0; min-height: 100dvh; padding: 24px; }
    main { max-width: 360px; text-align: center; }
    .mark { align-items: center; background: linear-gradient(145deg, #151e34 0%, #0d1422 48%, #070b14 100%); border-radius: 22px; color: white; display: inline-flex; height: 72px; justify-content: center; margin-bottom: 24px; width: 72px; }
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
        <defs>
          <linearGradient id="roledex-active-card" x1="12.4" x2="25.6" y1="8" y2="25.4">
            <stop stop-color="#fbf8ff" stop-opacity="0.58"/>
            <stop offset="0.54" stop-color="#8b81df" stop-opacity="0.6"/>
            <stop offset="1" stop-color="#8d5dff" stop-opacity="0.74"/>
          </linearGradient>
          <linearGradient id="roledex-active-stroke" x1="12" x2="25.6" y1="8.2" y2="25.8">
            <stop stop-color="#ffffff"/>
            <stop offset="0.55" stop-color="#b9c6ff"/>
            <stop offset="1" stop-color="#b26cff"/>
          </linearGradient>
          <linearGradient id="roledex-swipe-arc" x1="7.35" x2="25.85" y1="25.8" y2="22.2">
            <stop stop-color="#2d4fff" stop-opacity="0"/>
            <stop offset="0.52" stop-color="#5e5bff" stop-opacity="0.76"/>
            <stop offset="1" stop-color="#b870ff"/>
          </linearGradient>
        </defs>
        <path d="M7.55 24.7c4.85 2.2 13.2 1.65 17.1-1.95" stroke="url(#roledex-swipe-arc)" stroke-linecap="round" stroke-width="0.92"/>
        <path d="m23.7 22.65 1.28-.18-.04 1.3" stroke="#b870ff" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.92"/>
        <rect x="6.55" y="9.7" width="11.4" height="16.1" rx="2.35" fill="#243145" opacity="0.78" transform="rotate(-12 12.25 17.75)"/>
        <rect x="10.2" y="7.4" width="12.15" height="17" rx="2.45" fill="#3468ff" transform="rotate(-2.5 16.275 15.9)"/>
        <rect x="13.45" y="7.15" width="12.2" height="17.4" rx="2.55" fill="url(#roledex-active-card)" transform="rotate(12 19.55 15.85)"/>
        <rect x="13.45" y="7.15" width="12.2" height="17.4" rx="2.55" fill="none" stroke="url(#roledex-active-stroke)" stroke-opacity="0.9" stroke-width="0.72" transform="rotate(12 19.55 15.85)"/>
        <path d="M15.5 9.25c2.45-.45 5.45-.15 7.45.8" stroke="#f3efff" stroke-linecap="round" stroke-opacity="0.45" stroke-width="0.74"/>
      </svg>
    </div>
    <h1>You’re offline</h1>
    <p>Reconnect to load RoleDex. No jobs or personal details are stored in this offline page.</p>
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
