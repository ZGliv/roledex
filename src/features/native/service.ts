import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, count, eq, gt, isNull, or } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  candidateProfiles,
  jobDecisionEvents,
  nativeInstallations,
  visitorDevicePairingCodes,
  visitorProductSettings,
  visitors,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import { getActiveCandidateProfileRecordForVisitor } from "@/features/candidate/queries";
import { admitVisitorWorkspace } from "@/features/candidate/visitor-admission";
import type { NativeInstallationInput } from "@/features/native/input";
import {
  getNativeSessionSecret,
  issueNativeAccessToken,
  nativeApiEnabled,
  NATIVE_ACCESS_TOKEN_TTL_SECONDS,
  readNativeAccessToken,
} from "@/features/native/session";
import { deleteGuestWorkspaceForVisitor } from "@/features/visitor/service";

const INSTALLATION_CREDENTIAL_TTL_MS = 180 * 24 * 60 * 60_000;
const INSTALLATION_CREDENTIAL_GRACE_MS =
  (NATIVE_ACCESS_TOKEN_TTL_SECONDS + 5 * 60) * 1_000;
const CREDENTIAL_PREFIX = "jsi_";

export class NativeAuthenticationError extends Error {
  constructor(message = "A valid native session is required.") {
    super(message);
    this.name = "NativeAuthenticationError";
  }
}

export class NativeConfigurationError extends Error {
  constructor() {
    super("Native sessions are not configured on this server.");
    this.name = "NativeConfigurationError";
  }
}

export class NativeWorkspaceConflictError extends Error {
  constructor() {
    super(
      "This device already has search activity. Resolve which workspace to keep before reconnecting it.",
    );
    this.name = "NativeWorkspaceConflictError";
  }
}

class NativePairingRaceError extends Error {}

function credentialHash(credential: string) {
  return createHash("sha256").update(credential).digest("hex");
}

function newInstallationCredential() {
  return `${CREDENTIAL_PREFIX}${randomBytes(32).toString("base64url")}`;
}

function nativeSecret() {
  if (!nativeApiEnabled()) throw new NativeConfigurationError();
  const secret = getNativeSessionSecret();
  if (!secret) throw new NativeConfigurationError();
  return secret;
}

async function sessionResponse(
  installation: { id: string; visitorId: string; credentialExpiresAt: Date },
  installationCredential: string,
  now: Date,
) {
  return {
    accessToken: await issueNativeAccessToken(
      { installationId: installation.id, visitorId: installation.visitorId },
      nativeSecret(),
      now,
    ),
    accessTokenExpiresAt: new Date(
      now.getTime() + NATIVE_ACCESS_TOKEN_TTL_SECONDS * 1_000,
    ).toISOString(),
    installationCredential,
    installationCredentialExpiresAt:
      installation.credentialExpiresAt.toISOString(),
    installationId: installation.id,
    workspaceId: installation.visitorId,
  };
}

export async function createNativeInstallation(
  input: NativeInstallationInput,
  now = new Date(),
) {
  // Fail before allocating a visitor/profile if production credentials are
  // missing. The catch cleanup remains as defense for later write failures.
  nativeSecret();
  await ensureDatabaseReady();
  const visitorId = randomUUID();
  await withDatabaseWriteRetry(() =>
    db.insert(visitors).values({ id: visitorId, kind: "guest", createdAt: now }),
  );
  try {
    await admitVisitorWorkspace(visitorId);
    await getActiveCandidateProfileRecordForVisitor(visitorId);
    const installationCredential = newInstallationCredential();
    const credentialExpiresAt = new Date(
      now.getTime() + INSTALLATION_CREDENTIAL_TTL_MS,
    );
    const [installation] = await withDatabaseWriteRetry(() =>
      db
        .insert(nativeInstallations)
        .values({
          visitorId,
          platform: input.platform,
          credentialHash: credentialHash(installationCredential),
          appVersion: input.appVersion,
          buildNumber: input.buildNumber,
          deviceName: input.deviceName ?? null,
          attestationState: "unavailable",
          credentialExpiresAt,
          lastUsedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: nativeInstallations.id,
          visitorId: nativeInstallations.visitorId,
          credentialExpiresAt: nativeInstallations.credentialExpiresAt,
        }),
    );
    if (!installation) throw new Error("Native installation was not created.");
    return sessionResponse(installation, installationCredential, now);
  } catch (error) {
    // Preserve the original installation failure. Profile creation can add
    // restrictive child rows, so a direct visitor delete is not valid cleanup.
    try {
      await deleteGuestWorkspaceForVisitor(visitorId);
    } catch {
      // Best effort only; surfacing a cleanup error would hide the root cause.
    }
    throw error;
  }
}

export async function refreshNativeInstallation(
  installationCredential: string,
  now = new Date(),
) {
  await ensureDatabaseReady();
  if (!/^jsi_[A-Za-z0-9_-]{43}$/.test(installationCredential)) {
    throw new NativeAuthenticationError();
  }
  const oldHash = credentialHash(installationCredential);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rotation = await withDatabaseWriteRetry(() =>
      db.transaction(async (transaction) => {
        const [current] = await transaction
          .select({
            credentialHash: nativeInstallations.credentialHash,
            id: nativeInstallations.id,
            visitorId: nativeInstallations.visitorId,
          })
          .from(nativeInstallations)
          .where(
            and(
              or(
                eq(nativeInstallations.credentialHash, oldHash),
                and(
                  eq(nativeInstallations.previousCredentialHash, oldHash),
                  gt(nativeInstallations.previousCredentialExpiresAt, now),
                ),
              ),
              isNull(nativeInstallations.revokedAt),
              gt(nativeInstallations.credentialExpiresAt, now),
            ),
          )
          .limit(1);
        if (!current) return null;

        const nextCredential = newInstallationCredential();
        const nextExpiry = new Date(
          now.getTime() + INSTALLATION_CREDENTIAL_TTL_MS,
        );
        const [installation] = await transaction
          .update(nativeInstallations)
          .set({
            credentialHash: credentialHash(nextCredential),
            credentialExpiresAt: nextExpiry,
            previousCredentialHash: current.credentialHash,
            previousCredentialExpiresAt: new Date(
              now.getTime() + INSTALLATION_CREDENTIAL_GRACE_MS,
            ),
            lastUsedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(nativeInstallations.id, current.id),
              eq(nativeInstallations.credentialHash, current.credentialHash),
              isNull(nativeInstallations.revokedAt),
            ),
          )
          .returning({
            id: nativeInstallations.id,
            visitorId: nativeInstallations.visitorId,
            credentialExpiresAt: nativeInstallations.credentialExpiresAt,
          });
        return installation
          ? { installation, nextCredential }
          : { installation: null, nextCredential: null };
      }),
    );
    if (rotation === null) throw new NativeAuthenticationError();
    if (rotation.installation && rotation.nextCredential) {
      return sessionResponse(
        rotation.installation,
        rotation.nextCredential,
        now,
      );
    }
    // Another refresh won the compare-and-swap; re-read once using the grace
    // credential instead of turning a harmless retry into account loss.
  }
  throw new NativeAuthenticationError(
    "This device refreshed concurrently. Retry once more.",
  );
}

export async function authenticateNativeAccessToken(
  accessToken: string | undefined,
  now = new Date(),
) {
  const payload = await readNativeAccessToken(accessToken, nativeSecret());
  if (!payload) throw new NativeAuthenticationError();
  await ensureDatabaseReady();
  const [installation] = await db
    .select({
      id: nativeInstallations.id,
      visitorId: nativeInstallations.visitorId,
    })
    .from(nativeInstallations)
    .where(
      and(
        eq(nativeInstallations.id, payload.installationId),
        eq(nativeInstallations.visitorId, payload.visitorId),
        isNull(nativeInstallations.revokedAt),
        gt(nativeInstallations.credentialExpiresAt, now),
      ),
    )
    .limit(1);
  if (!installation) throw new NativeAuthenticationError();
  return installation;
}

/**
 * Re-authenticates a destructive operation without rotating the credential.
 * Both the active credential and its brief retry-grace predecessor are valid.
 */
export async function verifyNativeInstallationCredential(
  installationId: string,
  installationCredential: string | null,
  now = new Date(),
) {
  if (
    !installationCredential ||
    !/^jsi_[A-Za-z0-9_-]{43}$/.test(installationCredential)
  ) {
    return false;
  }
  await ensureDatabaseReady();
  const hash = credentialHash(installationCredential);
  const [installation] = await db
    .select({ id: nativeInstallations.id })
    .from(nativeInstallations)
    .where(
      and(
        eq(nativeInstallations.id, installationId),
        or(
          eq(nativeInstallations.credentialHash, hash),
          and(
            eq(nativeInstallations.previousCredentialHash, hash),
            gt(nativeInstallations.previousCredentialExpiresAt, now),
          ),
        ),
        isNull(nativeInstallations.revokedAt),
        gt(nativeInstallations.credentialExpiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(installation);
}

export async function pairNativeInstallation(
  installationId: string,
  normalizedCode: string,
  now = new Date(),
) {
  await ensureDatabaseReady();
  const [sourceInstallation] = await db
    .select({ visitorId: nativeInstallations.visitorId })
    .from(nativeInstallations)
    .where(
      and(
        eq(nativeInstallations.id, installationId),
        isNull(nativeInstallations.revokedAt),
      ),
    )
    .limit(1);
  if (!sourceInstallation) throw new NativeAuthenticationError();

  const [[profile], [decisionCount], [settings]] = await Promise.all([
    db
      .select({ revision: candidateProfiles.revision })
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.visitorId, sourceInstallation.visitorId),
          eq(candidateProfiles.isActive, true),
        ),
      )
      .limit(1),
    db
      .select({ value: count() })
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.visitorId, sourceInstallation.visitorId)),
    db
      .select({ onboardingCompletedAt: visitorProductSettings.onboardingCompletedAt })
      .from(visitorProductSettings)
      .where(eq(visitorProductSettings.visitorId, sourceInstallation.visitorId))
      .limit(1),
  ]);
  if (
    (profile?.revision ?? 1) > 1 ||
    (decisionCount?.value ?? 0) > 0 ||
    Boolean(settings?.onboardingCompletedAt)
  ) {
    throw new NativeWorkspaceConflictError();
  }

  const nextCredential = newInstallationCredential();
  const nextExpiry = new Date(now.getTime() + INSTALLATION_CREDENTIAL_TTL_MS);
  let claimed:
    | {
        installation: {
          id: string;
          visitorId: string;
          credentialExpiresAt: Date;
        };
        visitorId: string;
      }
    | null;
  try {
    claimed = await withDatabaseWriteRetry(() =>
      db.transaction(async (transaction) => {
        const [pairing] = await transaction
          .select({
            id: visitorDevicePairingCodes.id,
            visitorId: visitorDevicePairingCodes.visitorId,
          })
          .from(visitorDevicePairingCodes)
          .where(
            and(
              eq(
                visitorDevicePairingCodes.codeHash,
                credentialHash(normalizedCode),
              ),
              isNull(visitorDevicePairingCodes.consumedAt),
              gt(visitorDevicePairingCodes.expiresAt, now),
            ),
          )
          .limit(1);
        if (!pairing) return null;

        const consumed = await transaction
          .update(visitorDevicePairingCodes)
          .set({ consumedAt: now })
          .where(
            and(
              eq(visitorDevicePairingCodes.id, pairing.id),
              isNull(visitorDevicePairingCodes.consumedAt),
            ),
          )
          .returning({ id: visitorDevicePairingCodes.id });
        if (consumed.length !== 1) throw new NativePairingRaceError();

        const [installation] = await transaction
          .update(nativeInstallations)
          .set({
            visitorId: pairing.visitorId,
            credentialHash: credentialHash(nextCredential),
            credentialExpiresAt: nextExpiry,
            previousCredentialHash: null,
            previousCredentialExpiresAt: null,
            lastUsedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(nativeInstallations.id, installationId),
              eq(
                nativeInstallations.visitorId,
                sourceInstallation.visitorId,
              ),
              isNull(nativeInstallations.revokedAt),
            ),
          )
          .returning({
            id: nativeInstallations.id,
            visitorId: nativeInstallations.visitorId,
            credentialExpiresAt: nativeInstallations.credentialExpiresAt,
          });
        if (!installation) throw new NativePairingRaceError();
        return { installation, visitorId: pairing.visitorId };
      }),
    );
  } catch (error) {
    if (error instanceof NativePairingRaceError) return null;
    throw error;
  }
  if (!claimed) return null;
  const { installation, visitorId } = claimed;

  if (sourceInstallation.visitorId !== visitorId) {
    const [remaining] = await db
      .select({ value: count() })
      .from(nativeInstallations)
      .where(eq(nativeInstallations.visitorId, sourceInstallation.visitorId));
    if ((remaining?.value ?? 0) === 0) {
      // Best-effort cleanup of the untouched bootstrap workspace. Failure does
      // not invalidate the successful claim or expose another visitor's data.
      try {
        await deleteGuestWorkspaceForVisitor(sourceInstallation.visitorId);
      } catch {
        // Retention cleanup can retry independently.
      }
    }
  }
  return sessionResponse(installation, nextCredential, now);
}

export async function revokeNativeInstallation(
  installationId: string,
  now = new Date(),
) {
  const [revoked] = await db
    .update(nativeInstallations)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(nativeInstallations.id, installationId),
        isNull(nativeInstallations.revokedAt),
      ),
    )
    .returning({ id: nativeInstallations.id });
  return Boolean(revoked);
}
