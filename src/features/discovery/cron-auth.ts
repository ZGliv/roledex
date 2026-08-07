import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Validates Vercel Cron's bearer token without a variable-time string compare.
 * Hashing first gives timingSafeEqual two fixed-length buffers even when the
 * supplied header is missing or has a different length.
 */
export function hasValidCronAuthorization(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
) {
  if (!cronSecret) return false;

  const supplied = digest(authorizationHeader ?? "");
  const expected = digest(`Bearer ${cronSecret}`);
  return timingSafeEqual(supplied, expected);
}
