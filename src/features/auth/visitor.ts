import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { db, ensureDatabaseReady } from "@/db/client";
import { eq } from "drizzle-orm";

import { visitors } from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  getOwnerAuthConfig,
  OWNER_SESSION_COOKIE,
  verifyOwnerSessionToken,
} from "@/features/auth/session-token";
import {
  getVisitorSessionSecret,
  isVisitorId,
  OWNER_VISITOR_ID,
  verifyVisitorSessionToken,
  VISITOR_SESSION_COOKIE,
  VISITOR_SESSION_HEADER,
} from "@/features/auth/visitor-session-token";
import { admitVisitorWorkspace } from "@/features/candidate/visitor-admission";

async function requestVisitorId() {
  const requestHeaders = await headers();
  const trustedHeader = requestHeaders.get(VISITOR_SESSION_HEADER);
  if (isVisitorId(trustedHeader)) return trustedHeader;

  const cookieStore = await cookies();
  const ownerConfig = getOwnerAuthConfig();
  if (
    ownerConfig &&
    (await verifyOwnerSessionToken(
      cookieStore.get(OWNER_SESSION_COOKIE)?.value,
      ownerConfig.sessionSecret,
    ))
  ) {
    return OWNER_VISITOR_ID;
  }

  const sessionSecret = getVisitorSessionSecret();
  if (!sessionSecret) return null;
  return verifyVisitorSessionToken(
    cookieStore.get(VISITOR_SESSION_COOKIE)?.value,
    sessionSecret,
  );
}

export async function getCurrentVisitorId() {
  try {
    const visitorId = await requestVisitorId();
    if (visitorId) return visitorId;
  } catch (error) {
    if (process.env.VERCEL || process.env.NODE_ENV === "production") {
      throw error;
    }
  }

  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") {
    return OWNER_VISITOR_ID;
  }
  throw new Error("A valid visitor session is required.");
}

const ensureVisitorCached = cache(async (visitorId: string) => {
  if (!isVisitorId(visitorId)) throw new TypeError("Invalid visitor ID.");
  await ensureDatabaseReady();
  const [existing] = await db
    .select({ id: visitors.id })
    .from(visitors)
    .where(eq(visitors.id, visitorId))
    .limit(1);
  if (existing) return visitorId;
  await withDatabaseWriteRetry(() =>
    db
      .insert(visitors)
      .values({
        id: visitorId,
        kind: visitorId === OWNER_VISITOR_ID ? "owner" : "guest",
      })
      .onConflictDoNothing(),
  );
  return visitorId;
});

export function ensureVisitor(visitorId: string) {
  return ensureVisitorCached(visitorId);
}

const requireVisitorIdCached = cache(async () => {
  const visitorId = await ensureVisitor(await getCurrentVisitorId());
  await admitVisitorWorkspace(visitorId);
  return visitorId;
});

export function requireVisitorId() {
  return requireVisitorIdCached();
}
