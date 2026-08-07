import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { sameOriginFormOrigin } from "@/features/auth/request";
import {
  OWNER_SESSION_COOKIE,
  ownerSessionCookieSecure,
} from "@/features/auth/session-token";
import {
  getVisitorSessionSecret,
  issueVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_MAX_AGE_SECONDS,
  visitorSessionCookieSecure,
} from "@/features/auth/visitor-session-token";

export async function POST(request: Request) {
  const requestOrigin = sameOriginFormOrigin(request);
  if (!requestOrigin) {
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const visitorSessionSecret = getVisitorSessionSecret();
  if (!visitorSessionSecret) {
    return new NextResponse(null, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const response = NextResponse.redirect(new URL("/", requestOrigin), 303);
  response.cookies.set(OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    priority: "high",
    sameSite: "lax",
    secure: ownerSessionCookieSecure(),
  });
  response.cookies.set(
    VISITOR_SESSION_COOKIE,
    await issueVisitorSessionToken(randomUUID(), visitorSessionSecret),
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
