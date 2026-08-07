import { NextResponse } from "next/server";

import {
  accessPasswordMatches,
  getOwnerAuthConfig,
  issueOwnerSessionToken,
  localOwnerAuthBypassEnabled,
  OWNER_SESSION_COOKIE,
  OWNER_SESSION_MAX_AGE_SECONDS,
  ownerSessionCookieSecure,
} from "@/features/auth/session-token";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import {
  getVisitorSessionSecret,
  issueVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_MAX_AGE_SECONDS,
  visitorSessionCookieSecure,
} from "@/features/auth/visitor-session-token";
import {
  acceptsSmallUrlEncodedForm,
  sameOriginFormOrigin,
} from "@/features/auth/request";
import {
  adminUnlockAttemptAllowed,
  clearAdminUnlockFailures,
  recordAdminUnlockFailure,
} from "@/features/auth/unlock-rate-limit";

function unlockRedirect(
  requestOrigin: string,
  reason: "invalid" | "unavailable",
) {
  const url = new URL("/unlock", requestOrigin);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export async function POST(request: Request) {
  if (localOwnerAuthBypassEnabled()) {
    const requestOrigin = sameOriginFormOrigin(request);
    if (!requestOrigin) return new NextResponse(null, { status: 403 });
    return NextResponse.redirect(new URL("/", requestOrigin), 303);
  }

  const requestOrigin = sameOriginFormOrigin(request);
  if (!requestOrigin || !acceptsSmallUrlEncodedForm(request)) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const config = getOwnerAuthConfig();
  if (!config) return unlockRedirect(requestOrigin, "unavailable");
  const visitorSessionSecret = getVisitorSessionSecret();
  if (!visitorSessionSecret) return unlockRedirect(requestOrigin, "unavailable");

  const formData = await request.formData();
  const accessPassword = formData.get("accessPassword");
  const attemptAllowed = adminUnlockAttemptAllowed();

  if (
    !attemptAllowed ||
    typeof accessPassword !== "string" ||
    !accessPasswordMatches(accessPassword, config.accessPassword)
  ) {
    if (attemptAllowed) recordAdminUnlockFailure();
    return unlockRedirect(requestOrigin, "invalid");
  }

  clearAdminUnlockFailures();
  const token = await issueOwnerSessionToken(config.sessionSecret);
  const response = NextResponse.redirect(new URL("/", requestOrigin), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, token, {
    httpOnly: true,
    maxAge: OWNER_SESSION_MAX_AGE_SECONDS,
    path: "/",
    priority: "high",
    sameSite: "lax",
    secure: ownerSessionCookieSecure(),
  });
  response.cookies.set(
    VISITOR_SESSION_COOKIE,
    await issueVisitorSessionToken(OWNER_VISITOR_ID, visitorSessionSecret),
    {
      httpOnly: true,
      maxAge: VISITOR_SESSION_MAX_AGE_SECONDS,
      path: "/",
      priority: "high",
      sameSite: "lax",
      secure: visitorSessionCookieSecure(),
    },
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
