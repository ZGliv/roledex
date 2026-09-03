import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, count, desc, eq, gt, gte, inArray, isNull } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  betaFeedback,
  candidateEducationRecords,
  candidateProfiles,
  candidateResumeImports,
  candidateResumeSources,
  candidateRoleTargets,
  candidateSkillEvidence,
  candidateWorkExperiences,
  feedExposures,
  feedSessions,
  jobApplicationDetails,
  jobDecisionEvents,
  nativeInstallations,
  portfolioProjects,
  visitorDevicePairingCodes,
  visitorJobStates,
  visitorProductSettings,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  FEED_TELEMETRY_MAX_EXPOSURE_AGE_MS,
  FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS,
} from "@/features/data-lifecycle/service";
import type {
  ApplicationDetailsInput,
  BetaFeedbackInput,
  ProductSettingsInput,
  ResumeSourceInput,
} from "@/features/product/input";

const PAIRING_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PAIRING_TTL_MS = 10 * 60_000;
const FEEDBACK_WINDOW_MS = 60 * 60_000;
const FEEDBACK_WINDOW_LIMIT = 5;
export const MAX_EXPORTED_FEED_SESSIONS = 1_000;
export const MAX_EXPORTED_FEED_EXPOSURES = 10_000;

interface WorkspaceExportOptions {
  feedExposureLimit?: number;
  feedSessionLimit?: number;
  now?: Date;
}

function boundedExportLimit(value: number | undefined, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return maximum;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

export class ProductFeedbackRateLimitError extends Error {
  constructor() {
    super("You’ve sent several messages recently. Try again in about an hour.");
    this.name = "ProductFeedbackRateLimitError";
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function randomPairingCode() {
  const bytes = randomBytes(12);
  const raw = Array.from(
    bytes,
    (byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length],
  ).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export async function createDevicePairingCode(visitorId: string, now = new Date()) {
  await ensureDatabaseReady();
  const code = randomPairingCode();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);
  await withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      // Only the newest code may remain usable. This bounds storage growth and
      // makes generating a replacement invalidate a code that may have leaked.
      await transaction
        .delete(visitorDevicePairingCodes)
        .where(eq(visitorDevicePairingCodes.visitorId, visitorId));
      await transaction.insert(visitorDevicePairingCodes).values({
        visitorId,
        codeHash: sha256(code.replaceAll("-", "")),
        expiresAt,
        createdAt: now,
      });
    }),
  );
  return { code, expiresAt };
}

export async function consumeDevicePairingCode(
  normalizedCode: string,
  now = new Date(),
) {
  await ensureDatabaseReady();
  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const [pairing] = await transaction
        .select({ id: visitorDevicePairingCodes.id, visitorId: visitorDevicePairingCodes.visitorId })
        .from(visitorDevicePairingCodes)
        .where(
          and(
            eq(visitorDevicePairingCodes.codeHash, sha256(normalizedCode)),
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
      return consumed.length === 1 ? pairing.visitorId : null;
    }),
  );
}

export async function getProductSettings(visitorId: string) {
  await ensureDatabaseReady();
  const [settings] = await db
    .select()
    .from(visitorProductSettings)
    .where(eq(visitorProductSettings.visitorId, visitorId))
    .limit(1);
  return (
    settings ?? {
      visitorId,
      onboardingCompletedAt: null,
      dailyDigestEnabled: true,
      reminderNotificationsEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  );
}

export async function updateProductSettings(
  visitorId: string,
  input: ProductSettingsInput,
  now = new Date(),
) {
  await ensureDatabaseReady();
  await withDatabaseWriteRetry(() =>
    db
      .insert(visitorProductSettings)
      .values({ visitorId, ...input, updatedAt: now })
      .onConflictDoUpdate({
        target: visitorProductSettings.visitorId,
        set: { ...input, updatedAt: now },
      }),
  );
}

export async function markOnboardingComplete(visitorId: string, now = new Date()) {
  await ensureDatabaseReady();
  await withDatabaseWriteRetry(() =>
    db
      .insert(visitorProductSettings)
      .values({ visitorId, onboardingCompletedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: visitorProductSettings.visitorId,
        set: { onboardingCompletedAt: now, updatedAt: now },
      }),
  );
}

export async function getApplicationDetailsForVisitor(visitorId: string) {
  await ensureDatabaseReady();
  return db
    .select()
    .from(jobApplicationDetails)
    .where(eq(jobApplicationDetails.visitorId, visitorId));
}

export async function saveApplicationDetails(
  visitorId: string,
  input: ApplicationDetailsInput,
  now = new Date(),
) {
  await ensureDatabaseReady();
  const [state] = await db
    .select({ decision: visitorJobStates.currentDecision })
    .from(visitorJobStates)
    .where(
      and(
        eq(visitorJobStates.visitorId, visitorId),
        eq(visitorJobStates.jobListingId, input.jobListingId),
      ),
    )
    .limit(1);
  if (!state || state.decision === "unseen" || state.decision === "skipped") {
    throw new Error("Save this job before adding application details.");
  }

  const values = {
    applicationDeadline: input.applicationDeadline
      ? new Date(`${input.applicationDeadline}T12:00:00.000Z`)
      : null,
    followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
    contactName: input.contactName,
    contactEmail: input.contactEmail,
    resumeLabel: input.resumeLabel,
    nextStep: input.nextStep,
    updatedAt: now,
  };
  await withDatabaseWriteRetry(() =>
    db
      .insert(jobApplicationDetails)
      .values({ visitorId, jobListingId: input.jobListingId, ...values })
      .onConflictDoUpdate({
        target: [jobApplicationDetails.visitorId, jobApplicationDetails.jobListingId],
        set: values,
      }),
  );
}

export async function getResumeSourcesForVisitor(visitorId: string) {
  await ensureDatabaseReady();
  return db
    .select({
      id: candidateResumeSources.id,
      label: candidateResumeSources.label,
      sourceFileName: candidateResumeSources.sourceFileName,
      createdAt: candidateResumeSources.createdAt,
    })
    .from(candidateResumeSources)
    .innerJoin(
      candidateProfiles,
      eq(candidateResumeSources.candidateProfileId, candidateProfiles.id),
    )
    .where(
      and(
        eq(candidateProfiles.visitorId, visitorId),
        eq(candidateProfiles.isActive, true),
      ),
    );
}

export async function addResumeSource(
  visitorId: string,
  input: ResumeSourceInput,
) {
  await ensureDatabaseReady();
  const [profile] = await db
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .where(
      and(eq(candidateProfiles.visitorId, visitorId), eq(candidateProfiles.isActive, true)),
    )
    .limit(1);
  if (!profile) throw new Error("Your active profile could not be found.");
  const contentHash = sha256(input.rawText);
  const inserted = await withDatabaseWriteRetry(() =>
    db
      .insert(candidateResumeSources)
      .values({ candidateProfileId: profile.id, contentHash, ...input })
      .onConflictDoNothing()
      .returning({ id: candidateResumeSources.id }),
  );
  return inserted[0]?.id ?? null;
}

export async function deleteResumeSource(visitorId: string, id: string) {
  await ensureDatabaseReady();
  return withDatabaseWriteRetry(async () => {
    const deleted = await db
      .delete(candidateResumeSources)
      .where(
        and(
          eq(candidateResumeSources.id, id),
          eq(
            candidateResumeSources.candidateProfileId,
            db
              .select({ id: candidateProfiles.id })
              .from(candidateProfiles)
              .where(
                and(
                  eq(candidateProfiles.visitorId, visitorId),
                  eq(candidateProfiles.isActive, true),
                ),
              )
              .limit(1),
          ),
        ),
      )
      .returning({ id: candidateResumeSources.id });
    return deleted.length === 1;
  });
}

export async function submitBetaFeedback(
  visitorId: string,
  input: BetaFeedbackInput,
) {
  await ensureDatabaseReady();
  const windowStart = new Date(Date.now() - FEEDBACK_WINDOW_MS);
  const [recent] = await db
    .select({ value: count() })
    .from(betaFeedback)
    .where(
      and(
        eq(betaFeedback.visitorId, visitorId),
        gte(betaFeedback.createdAt, windowStart),
      ),
    );
  if ((recent?.value ?? 0) >= FEEDBACK_WINDOW_LIMIT) {
    throw new ProductFeedbackRateLimitError();
  }
  await withDatabaseWriteRetry(() =>
    db.insert(betaFeedback).values({
      visitorId,
      jobListingId: input.jobListingId ?? null,
      kind: input.kind,
      message: input.message,
      pagePath: input.pagePath,
    }),
  );
}

export async function exportVisitorWorkspace(
  visitorId: string,
  options: WorkspaceExportOptions = {},
) {
  await ensureDatabaseReady();
  const now = options.now ?? new Date();
  const feedSessionLimit = boundedExportLimit(
    options.feedSessionLimit,
    MAX_EXPORTED_FEED_SESSIONS,
  );
  const feedExposureLimit = boundedExportLimit(
    options.feedExposureLimit,
    MAX_EXPORTED_FEED_EXPOSURES,
  );
  const sessionExpiryCutoff = new Date(
    now.getTime() - FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS,
  );
  const exposureCutoff = new Date(
    now.getTime() - FEED_TELEMETRY_MAX_EXPOSURE_AGE_MS,
  );
  const profiles = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.visitorId, visitorId));
  const profileIds = profiles.map((profile) => profile.id);
  const [
    decisions,
    states,
    applications,
    settings,
    workHistory,
    education,
    skills,
    projects,
    resumes,
    resumeImports,
    roleTargets,
    feedback,
    deviceSessions,
    feedSessionEvents,
    feedExposureEvents,
  ] = await Promise.all([
    db
      .select()
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.visitorId, visitorId)),
    db
      .select()
      .from(visitorJobStates)
      .where(eq(visitorJobStates.visitorId, visitorId)),
    db
      .select()
      .from(jobApplicationDetails)
      .where(eq(jobApplicationDetails.visitorId, visitorId)),
    getProductSettings(visitorId),
    profileIds.length > 0
      ? db
          .select()
          .from(candidateWorkExperiences)
          .where(inArray(candidateWorkExperiences.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(candidateEducationRecords)
          .where(inArray(candidateEducationRecords.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(candidateSkillEvidence)
          .where(inArray(candidateSkillEvidence.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(portfolioProjects)
          .where(inArray(portfolioProjects.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(candidateResumeSources)
          .where(inArray(candidateResumeSources.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(candidateResumeImports)
          .where(inArray(candidateResumeImports.candidateProfileId, profileIds))
      : [],
    profileIds.length > 0
      ? db
          .select()
          .from(candidateRoleTargets)
          .where(inArray(candidateRoleTargets.candidateProfileId, profileIds))
      : [],
    db.select().from(betaFeedback).where(eq(betaFeedback.visitorId, visitorId)),
    db
      .select({
        appVersion: nativeInstallations.appVersion,
        attestationState: nativeInstallations.attestationState,
        buildNumber: nativeInstallations.buildNumber,
        createdAt: nativeInstallations.createdAt,
        credentialExpiresAt: nativeInstallations.credentialExpiresAt,
        deviceName: nativeInstallations.deviceName,
        id: nativeInstallations.id,
        lastUsedAt: nativeInstallations.lastUsedAt,
        platform: nativeInstallations.platform,
        revokedAt: nativeInstallations.revokedAt,
        updatedAt: nativeInstallations.updatedAt,
      })
      .from(nativeInstallations)
      .where(eq(nativeInstallations.visitorId, visitorId)),
    db
      .select()
      .from(feedSessions)
      .where(
        and(
          eq(feedSessions.visitorId, visitorId),
          gt(feedSessions.expiresAt, sessionExpiryCutoff),
        ),
      )
      .orderBy(desc(feedSessions.startedAt), desc(feedSessions.id))
      .limit(feedSessionLimit + 1),
    db
      .select()
      .from(feedExposures)
      .where(
        and(
          eq(feedExposures.visitorId, visitorId),
          gt(feedExposures.exposedAt, exposureCutoff),
        ),
      )
      .orderBy(desc(feedExposures.exposedAt), desc(feedExposures.id))
      .limit(feedExposureLimit + 1),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 2,
    profiles,
    workHistory,
    education,
    skills,
    projects,
    resumes,
    resumeImports,
    roleTargets,
    decisions,
    states,
    applications,
    settings,
    feedback,
    deviceSessions,
    feedSessions: feedSessionEvents.slice(0, feedSessionLimit),
    feedExposures: feedExposureEvents.slice(0, feedExposureLimit),
    feedTelemetryExport: {
      exposureLimit: feedExposureLimit,
      exposuresTruncated: feedExposureEvents.length > feedExposureLimit,
      retainedAfterSessionExpiryDays:
        FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS / (24 * 60 * 60 * 1_000),
      sessionLimit: feedSessionLimit,
      sessionsTruncated: feedSessionEvents.length > feedSessionLimit,
    },
  };
}
