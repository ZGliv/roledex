import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const OWNER_SESSION_COOKIE = "jobswipe_owner_session";
export const OWNER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const SESSION_ISSUER = "jobswipe";
const SESSION_AUDIENCE = "jobswipe-owner";
const MINIMUM_ACCESS_PASSWORD_LENGTH = 20;
const MINIMUM_SESSION_SECRET_BYTES = 32;

export type OwnerAuthConfig = {
  accessPassword: string;
  sessionSecret: string;
};

/** Keeps administration convenient only for a truly local non-production
 * process. Preview, Vercel, and self-hosted production runtimes must verify a
 * signed owner cookie even when deployment-level protection is also present. */
export function localOwnerAuthBypassEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    !process.env.VERCEL &&
    !process.env.VERCEL_ENV
  );
}

export function productionOwnerAuthEnabled() {
  return (
    process.env.VERCEL_ENV === "production" &&
    process.env.JOBSWIPE_PRODUCTION_UI === "enabled"
  );
}

export function getOwnerAuthConfig(): OwnerAuthConfig | null {
  const accessPassword = process.env.JOBSWIPE_ACCESS_PASSWORD ?? "";
  const sessionSecret = process.env.JOBSWIPE_SESSION_SECRET ?? "";

  if (
    accessPassword.length < MINIMUM_ACCESS_PASSWORD_LENGTH ||
    new TextEncoder().encode(sessionSecret).byteLength < MINIMUM_SESSION_SECRET_BYTES
  ) {
    return null;
  }

  return { accessPassword, sessionSecret };
}

export function accessPasswordMatches(candidate: string, expected: string) {
  if (candidate.length > 256) return false;

  const candidateDigest = createHash("sha256").update(candidate, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export async function issueOwnerSessionToken(
  sessionSecret: string,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1_000);

  return new SignJWT({ nonce: randomUUID(), scope: "owner" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + OWNER_SESSION_MAX_AGE_SECONDS)
    .sign(new TextEncoder().encode(sessionSecret));
}

export async function verifyOwnerSessionToken(
  token: string | undefined,
  sessionSecret: string,
) {
  if (!token || token.length > 2_048) return false;

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

    return (
      protectedHeader.typ === "JWT" &&
      payload.scope === "owner" &&
      typeof payload.nonce === "string" &&
      payload.nonce.length > 0
    );
  } catch {
    return false;
  }
}

export function ownerSessionCookieSecure() {
  if (process.env.JOBSWIPE_SESSION_COOKIE_SECURE === "disabled") return false;
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}
