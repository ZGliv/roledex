import "server-only";

import { randomUUID } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

export { OWNER_VISITOR_ID } from "@/features/auth/identity";
export const VISITOR_SESSION_COOKIE = "jobswipe_visitor_session";
export const VISITOR_SESSION_HEADER = "x-jobswipe-visitor-id";
export const VISITOR_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const SESSION_ISSUER = "jobswipe";
const SESSION_AUDIENCE = "jobswipe-visitor";
const MINIMUM_SESSION_SECRET_BYTES = 32;
const LOCAL_SESSION_SECRET =
  "jobswipe-local-visitor-session-secret-not-for-production";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitorId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function getVisitorSessionSecret() {
  const configured =
    process.env.JOBSWIPE_VISITOR_SESSION_SECRET?.trim() ||
    process.env.JOBSWIPE_SESSION_SECRET?.trim() ||
    "";

  if (
    new TextEncoder().encode(configured).byteLength >=
    MINIMUM_SESSION_SECRET_BYTES
  ) {
    return configured;
  }

  return process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
    ? null
    : LOCAL_SESSION_SECRET;
}

export async function issueVisitorSessionToken(
  visitorId: string,
  sessionSecret: string,
  now = new Date(),
) {
  if (!isVisitorId(visitorId)) throw new TypeError("Invalid visitor ID.");
  const issuedAt = Math.floor(now.getTime() / 1_000);

  return new SignJWT({ visitorId, scope: "visitor" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setJti(randomUUID())
    .setExpirationTime(issuedAt + VISITOR_SESSION_MAX_AGE_SECONDS)
    .sign(new TextEncoder().encode(sessionSecret));
}

export async function readVisitorSessionToken(
  token: string | undefined,
  sessionSecret: string,
) {
  if (!token || token.length > 2_048) return null;

  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(sessionSecret),
      {
        algorithms: ["HS256"],
        audience: SESSION_AUDIENCE,
        issuer: SESSION_ISSUER,
      },
    );

    return protectedHeader.typ === "JWT" &&
      payload.scope === "visitor" &&
      isVisitorId(payload.visitorId) &&
      typeof payload.exp === "number"
      ? { visitorId: payload.visitorId, expiresAt: payload.exp }
      : null;
  } catch {
    return null;
  }
}

export async function verifyVisitorSessionToken(
  token: string | undefined,
  sessionSecret: string,
) {
  return (await readVisitorSessionToken(token, sessionSecret))?.visitorId ?? null;
}

export function visitorSessionCookieSecure() {
  if (process.env.JOBSWIPE_SESSION_COOKIE_SECURE === "disabled") return false;
  return (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  );
}
