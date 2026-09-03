import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

import { isVisitorId } from "@/features/auth/visitor-session-token";

const NATIVE_ACCESS_ISSUER = "jobswipe";
const NATIVE_ACCESS_AUDIENCE = "jobswipe-native";
const MINIMUM_SECRET_BYTES = 32;
const LOCAL_NATIVE_SECRET =
  "jobswipe-local-native-session-secret-not-for-production";

export const NATIVE_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function nativeApiEnabled() {
  return process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
    ? process.env.JOBSWIPE_NATIVE_API === "enabled"
    : true;
}

const NativeAccessPayloadSchema = z.object({
  installationId: z.string().uuid(),
  visitorId: z.string().refine(isVisitorId),
  scope: z.literal("native_access"),
  exp: z.number().int(),
});

export function getNativeSessionSecret() {
  const configured =
    process.env.JOBSWIPE_NATIVE_SESSION_SECRET?.trim() ||
    process.env.JOBSWIPE_VISITOR_SESSION_SECRET?.trim() ||
    process.env.JOBSWIPE_SESSION_SECRET?.trim() ||
    "";
  if (
    new TextEncoder().encode(configured).byteLength >= MINIMUM_SECRET_BYTES
  ) {
    return configured;
  }
  return process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
    ? null
    : LOCAL_NATIVE_SECRET;
}

export async function issueNativeAccessToken(
  input: { installationId: string; visitorId: string },
  secret: string,
  now = new Date(),
) {
  const issuedAt = Math.floor(now.getTime() / 1_000);
  return new SignJWT({ ...input, scope: "native_access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(NATIVE_ACCESS_ISSUER)
    .setAudience(NATIVE_ACCESS_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + NATIVE_ACCESS_TOKEN_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function readNativeAccessToken(
  token: string | undefined,
  secret: string,
) {
  if (!token || token.length > 4_096) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      {
        algorithms: ["HS256"],
        audience: NATIVE_ACCESS_AUDIENCE,
        issuer: NATIVE_ACCESS_ISSUER,
      },
    );
    if (protectedHeader.typ !== "JWT") return null;
    const parsed = NativeAccessPayloadSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
