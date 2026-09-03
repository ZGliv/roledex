import "server-only";

import { and, asc, count, eq, inArray, lte } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  candidateResumeImports,
  candidateResumeSources,
  feedExposures,
  feedSessions,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";

export const RESUME_DRAFT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS =
  30 * 24 * 60 * 60 * 1_000;
export const FEED_TELEMETRY_MAX_EXPOSURE_AGE_MS =
  FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS + 24 * 60 * 60 * 1_000;

export const DAILY_RESUME_DRAFT_CLEANUP_LIMIT = 250;
export const DAILY_FEED_SESSION_CLEANUP_LIMIT = 1_000;

const MAX_CLEANUP_LIMIT = 5_000;

function boundedCleanupLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_CLEANUP_LIMIT, Math.max(1, Math.trunc(value)));
}

export interface DataLifecycleCleanupOptions {
  feedSessionLimit?: number;
  now?: Date;
  resumeDraftLimit?: number;
}

export interface ResumeDraftCleanupResult {
  deletedDrafts: number;
  deletedRawSources: number;
  hasMore: boolean;
  staleBefore: Date;
}

export interface FeedTelemetryCleanupResult {
  deletedExposures: number;
  deletedSessions: number;
  hasMore: boolean;
  expiredBefore: Date;
}

/**
 * Removes abandoned résumé reviews globally in a deterministic, bounded batch.
 * Confirmed imports are untouched; confirm/discard continue deleting raw text
 * immediately unless the user explicitly chose to retain it.
 */
export async function cleanupAbandonedResumeDrafts(
  options: Pick<DataLifecycleCleanupOptions, "now" | "resumeDraftLimit"> = {},
): Promise<ResumeDraftCleanupResult> {
  await ensureDatabaseReady();
  const now = options.now ?? new Date();
  const limit = boundedCleanupLimit(
    options.resumeDraftLimit,
    DAILY_RESUME_DRAFT_CLEANUP_LIMIT,
  );
  const staleBefore = new Date(now.getTime() - RESUME_DRAFT_RETENTION_MS);

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const candidates = await transaction
        .select({
          id: candidateResumeImports.id,
        })
        .from(candidateResumeImports)
        .where(
          and(
            eq(candidateResumeImports.status, "draft"),
            lte(candidateResumeImports.updatedAt, staleBefore),
          ),
        )
        .orderBy(
          asc(candidateResumeImports.updatedAt),
          asc(candidateResumeImports.id),
        )
        .limit(limit + 1);
      const selected = candidates.slice(0, limit);
      if (selected.length === 0) {
        return {
          deletedDrafts: 0,
          deletedRawSources: 0,
          hasMore: false,
          staleBefore,
        };
      }

      // Recheck status and age in the write statement. This keeps a review
      // that was confirmed between scheduler attempts from being removed.
      const deleted = await transaction
        .delete(candidateResumeImports)
        .where(
          and(
            inArray(
              candidateResumeImports.id,
              selected.map(({ id }) => id),
            ),
            eq(candidateResumeImports.status, "draft"),
            lte(candidateResumeImports.updatedAt, staleBefore),
          ),
        )
        .returning({ resumeSourceId: candidateResumeImports.resumeSourceId });
      const sourceIds = deleted.flatMap(({ resumeSourceId }) =>
        resumeSourceId ? [resumeSourceId] : [],
      );
      let deletedRawSources = 0;
      if (sourceIds.length > 0) {
        const removedSources = await transaction
          .delete(candidateResumeSources)
          .where(inArray(candidateResumeSources.id, sourceIds))
          .returning({ id: candidateResumeSources.id });
        deletedRawSources = removedSources.length;
      }

      return {
        deletedDrafts: deleted.length,
        deletedRawSources,
        hasMore: candidates.length > limit,
        staleBefore,
      };
    }),
  );
}

/**
 * Exposures are children of sessions with ON DELETE CASCADE, so deleting a
 * bounded oldest-first session batch also bounds the much larger exposure set.
 */
export async function cleanupExpiredFeedTelemetry(
  options: Pick<DataLifecycleCleanupOptions, "feedSessionLimit" | "now"> = {},
): Promise<FeedTelemetryCleanupResult> {
  await ensureDatabaseReady();
  const now = options.now ?? new Date();
  const limit = boundedCleanupLimit(
    options.feedSessionLimit,
    DAILY_FEED_SESSION_CLEANUP_LIMIT,
  );
  const expiredBefore = new Date(
    now.getTime() - FEED_TELEMETRY_POST_EXPIRY_RETENTION_MS,
  );

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const candidates = await transaction
        .select({ id: feedSessions.id })
        .from(feedSessions)
        .where(lte(feedSessions.expiresAt, expiredBefore))
        .orderBy(asc(feedSessions.expiresAt), asc(feedSessions.id))
        .limit(limit + 1);
      const selected = candidates.slice(0, limit);
      if (selected.length === 0) {
        return {
          deletedExposures: 0,
          deletedSessions: 0,
          hasMore: false,
          expiredBefore,
        };
      }
      const sessionIds = selected.map(({ id }) => id);
      const [exposureCount] = await transaction
        .select({ value: count() })
        .from(feedExposures)
        .where(inArray(feedExposures.sessionId, sessionIds));
      const deleted = await transaction
        .delete(feedSessions)
        .where(
          and(
            inArray(feedSessions.id, sessionIds),
            lte(feedSessions.expiresAt, expiredBefore),
          ),
        )
        .returning({ id: feedSessions.id });

      return {
        deletedExposures: exposureCount?.value ?? 0,
        deletedSessions: deleted.length,
        hasMore: candidates.length > limit,
        expiredBefore,
      };
    }),
  );
}

export async function runDailyDataLifecycleMaintenance(
  options: DataLifecycleCleanupOptions = {},
) {
  const resumeDrafts = await cleanupAbandonedResumeDrafts(options);
  const feedTelemetry = await cleanupExpiredFeedTelemetry(options);
  return { feedTelemetry, resumeDrafts };
}
