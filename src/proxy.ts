import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { JOBSWIPE_API_VERSION } from "@/features/api-v2/contracts";
import {
  getOwnerAuthConfig,
  localOwnerAuthBypassEnabled,
  OWNER_SESSION_COOKIE,
  verifyOwnerSessionToken,
} from "@/features/auth/session-token";
import {
  getVisitorSessionSecret,
  issueVisitorSessionToken,
  OWNER_VISITOR_ID,
  readVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_HEADER,
  VISITOR_SESSION_MAX_AGE_SECONDS,
  visitorSessionCookieSecure,
} from "@/features/auth/visitor-session-token";
import { productionDatabaseReleaseBlocked } from "@/features/production/database-release";

const CRON_REFRESH_PATH = "/api/cron/refresh";
const UNLOCK_PATH = "/unlock";
const UNLOCK_ACTION_PATH = "/api/auth/unlock";
const LOGOUT_ACTION_PATH = "/api/auth/logout";
const APPLE_APP_SITE_ASSOCIATION_PATH =
  "/.well-known/apple-app-site-association";
const EMERGENCY_FEED_PATH = "/api/emergency-feed";
const EMERGENCY_FEED_SYNC_PATH = "/api/emergency-feed/sync";
const API_V1_PREFIX = "/api/v1/";
const API_V2_PREFIX = "/api/v2/";
const API_V2_CAPABILITIES_PATH = "/api/v2/auth/capabilities";
const DATABASE_BACKED_API_PREFIXES = [
  API_V1_PREFIX,
  "/api/account/",
  "/api/jobs/",
] as const;
const DATABASE_BACKED_PAGE_PREFIXES = [
  "/drive",
  "/insights",
  "/jobs",
  "/onboarding",
  "/sessions",
  "/sources",
] as const;
const ADMIN_PATH_PREFIXES = ["/sources", "/jobs/new"] as const;
const VISITOR_RENEWAL_WINDOW_SECONDS = 60 * 60 * 24 * 90;

function privateNoStoreResponse(status: number) {
  return new NextResponse(null, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}

function productionDatabasePendingResponse(request: NextRequest) {
  const response = NextResponse.json(
    {
      error: {
        code: "database_release_pending",
        message:
          "Live workspace sync is temporarily unavailable. Jobs saved on this device remain available.",
      },
    },
    { status: 503 },
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Retry-After", "300");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-JobSwipe-API-Version", String(JOBSWIPE_API_VERSION));
  const origin = request.headers.get("origin");
  const configuredOrigins = process.env.JOBSWIPE_MOBILE_ORIGINS
    ?.split(",")
    .map((value) => value.trim());
  if (
    origin &&
    (origin === "capacitor://localhost" || configuredOrigins?.includes(origin))
  ) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

function isSchemaDependentApiRequest(request: NextRequest) {
  if (request.method === "OPTIONS") return false;
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith(API_V2_PREFIX) &&
    pathname !== API_V2_CAPABILITIES_PATH
  ) {
    return true;
  }
  return DATABASE_BACKED_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

function isDatabaseBackedPage(pathname: string) {
  return DATABASE_BACKED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isBackgroundOrMutationRequest(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";
  return (
    request.method !== "GET" ||
    request.nextUrl.pathname.startsWith("/api/") ||
    accept.includes("text/x-component") ||
    request.headers.has("next-action")
  );
}

function isAdminPath(pathname: string) {
  return ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Assigns every public request a signed, private visitor identity. Owner auth
 * remains an additional capability boundary for the hidden admin routes. */
export async function proxy(request: NextRequest) {
  const productionUiDisabled =
    process.env.VERCEL_ENV === "production" &&
    process.env.JOBSWIPE_PRODUCTION_UI !== "enabled";

  if (request.nextUrl.pathname === APPLE_APP_SITE_ASSOCIATION_PATH) {
    return NextResponse.next();
  }

  // This bounded, cached GET reads official public ATS endpoints and must stay
  // available even when the workspace database or visitor admission is down.
  if (
    request.method === "GET" &&
    request.nextUrl.pathname === EMERGENCY_FEED_PATH
  ) {
    return NextResponse.next();
  }

  const databaseReleaseBlocked = productionDatabaseReleaseBlocked();

  if (request.nextUrl.pathname === CRON_REFRESH_PATH) {
    return databaseReleaseBlocked
      ? productionDatabasePendingResponse(request)
      : NextResponse.next();
  }

  if (productionUiDisabled) {
    return privateNoStoreResponse(404);
  }

  if (
    databaseReleaseBlocked &&
    (isSchemaDependentApiRequest(request) ||
      request.nextUrl.pathname === EMERGENCY_FEED_SYNC_PATH ||
      (request.method !== "GET" &&
        request.nextUrl.pathname !== UNLOCK_ACTION_PATH &&
        request.nextUrl.pathname !== LOGOUT_ACTION_PATH))
  ) {
    return productionDatabasePendingResponse(request);
  }

  if (
    databaseReleaseBlocked &&
    request.method === "GET" &&
    isDatabaseBackedPage(request.nextUrl.pathname)
  ) {
    const fallbackUrl = request.nextUrl.clone();
    fallbackUrl.pathname = "/";
    fallbackUrl.search = "";
    const response = NextResponse.redirect(fallbackUrl, 307);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    return response;
  }

  if (
    request.nextUrl.pathname === UNLOCK_PATH ||
    request.nextUrl.pathname === UNLOCK_ACTION_PATH ||
    request.nextUrl.pathname === LOGOUT_ACTION_PATH
  ) {
    return NextResponse.next();
  }

  const ownerConfig = getOwnerAuthConfig();
  const visitorSecret = getVisitorSessionSecret();
  if (process.env.VERCEL_ENV === "production" && !visitorSecret) {
    return privateNoStoreResponse(503);
  }

  const hasOwnerSession =
    localOwnerAuthBypassEnabled() ||
    (ownerConfig
      ? await verifyOwnerSessionToken(
          request.cookies.get(OWNER_SESSION_COOKIE)?.value,
          ownerConfig.sessionSecret,
        )
      : false);

  if (isAdminPath(request.nextUrl.pathname) && !hasOwnerSession) {
    if (isBackgroundOrMutationRequest(request)) {
      return privateNoStoreResponse(401);
    }

    const unlockUrl = request.nextUrl.clone();
    unlockUrl.pathname = UNLOCK_PATH;
    unlockUrl.search = "";
    const response = NextResponse.redirect(unlockUrl, 307);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  if (!visitorSecret) return privateNoStoreResponse(503);

  const visitorSession = await readVisitorSessionToken(
    request.cookies.get(VISITOR_SESSION_COOKIE)?.value,
    visitorSecret,
  );
  const guestVisitorSession =
    visitorSession?.visitorId === OWNER_VISITOR_ID ? null : visitorSession;
  const visitorId = hasOwnerSession
    ? OWNER_VISITOR_ID
    : guestVisitorSession?.visitorId ?? randomUUID();
  const issueVisitorCookie =
    !guestVisitorSession ||
    guestVisitorSession.visitorId !== visitorId ||
    (guestVisitorSession.expiresAt - Math.floor(Date.now() / 1_000) <
      VISITOR_RENEWAL_WINDOW_SECONDS);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(VISITOR_SESSION_HEADER, visitorId);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (issueVisitorCookie) {
    response.cookies.set(
      VISITOR_SESSION_COOKIE,
      await issueVisitorSessionToken(visitorId, visitorSecret),
      {
        httpOnly: true,
        maxAge: VISITOR_SESSION_MAX_AGE_SECONDS,
        path: "/",
        priority: "high",
        sameSite: "lax",
        secure: visitorSessionCookieSecure(),
      },
    );
  }

  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.append("Vary", "Cookie");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
