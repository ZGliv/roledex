import "server-only";

import { createHmac } from "node:crypto";

import { lt, sql } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { apiRateLimitBuckets } from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import { GUEST_WORKSPACE_HOURLY_ADMISSION_LIMIT } from "@/features/candidate/visitor-admission";
import { getNativeSessionSecret } from "@/features/native/session";

const INSTALLATION_WINDOW_MS = 60 * 60 * 1_000;
const INSTALLATION_NETWORK_LIMIT = 10;
const INSTALLATION_GLOBAL_LIMIT = GUEST_WORKSPACE_HOURLY_ADMISSION_LIMIT;
const RETENTION_MS = 24 * 60 * 60 * 1_000;

type InstallationBucketKind =
  | "native_installation_global"
  | "native_installation_network";

export class NativeInstallationRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many new devices were created recently. Try again in a little while.");
    this.name = "NativeInstallationRateLimitError";
  }
}

/**
 * Proxy headers are trusted only when the app is known to be behind Vercel or
 * an operator explicitly enables that trust boundary. The right-most address
 * is used so a client-prepended X-Forwarded-For value cannot create unlimited
 * buckets when a trusted proxy appends the real peer address.
 */
export function nativeInstallationNetworkHint(request: Request) {
  const trustProxy =
    Boolean(process.env.VERCEL) ||
    process.env.JOBSWIPE_TRUST_PROXY_HEADERS === "enabled";
  if (!trustProxy) return null;
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  const candidate = forwarded?.split(",").at(-1)?.trim() ?? "";
  return candidate.length > 0 &&
    candidate.length <= 64 &&
    /^[0-9a-f:.]+$/i.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function bucketId(
  secret: string,
  kind: InstallationBucketKind,
  subject: string,
  windowStartedAt: Date,
) {
  return createHmac("sha256", secret)
    .update(
      `${kind}\0${windowStartedAt.getTime()}\0${subject}`,
      "utf8",
    )
    .digest("hex");
}

export async function enforceNativeInstallationCreationRateLimit(
  networkHint: string | null,
  now = new Date(),
) {
  const secret = getNativeSessionSecret();
  // createNativeInstallation will return the canonical configuration error;
  // avoid inventing a second secret or persisting raw network identifiers.
  if (!secret) return;
  await ensureDatabaseReady();
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / INSTALLATION_WINDOW_MS) * INSTALLATION_WINDOW_MS,
  );
  const specs: Array<{
    id: string;
    kind: InstallationBucketKind;
    limit: number;
  }> = [
    {
      id: bucketId(secret, "native_installation_global", "all", windowStartedAt),
      kind: "native_installation_global",
      limit: INSTALLATION_GLOBAL_LIMIT,
    },
  ];
  if (networkHint) {
    specs.push({
      id: bucketId(
        secret,
        "native_installation_network",
        networkHint,
        windowStartedAt,
      ),
      kind: "native_installation_network",
      limit: INSTALLATION_NETWORK_LIMIT,
    });
  }

  const counts = await withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      await transaction
        .delete(apiRateLimitBuckets)
        .where(
          lt(
            apiRateLimitBuckets.windowStartedAt,
            new Date(now.getTime() - RETENTION_MS),
          ),
        );
      const results: number[] = [];
      for (const spec of specs) {
        const [bucket] = await transaction
          .insert(apiRateLimitBuckets)
          .values({
            id: spec.id,
            kind: spec.kind,
            attemptCount: 1,
            windowStartedAt,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: apiRateLimitBuckets.id,
            set: {
              attemptCount: sql`${apiRateLimitBuckets.attemptCount} + 1`,
              updatedAt: now,
            },
          })
          .returning({ attemptCount: apiRateLimitBuckets.attemptCount });
        results.push(bucket?.attemptCount ?? spec.limit + 1);
      }
      return results;
    }),
  );

  if (counts.some((count, index) => count > specs[index]!.limit)) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        (windowStartedAt.getTime() + INSTALLATION_WINDOW_MS - now.getTime()) /
          1_000,
      ),
    );
    throw new NativeInstallationRateLimitError(retryAfterSeconds);
  }
}
