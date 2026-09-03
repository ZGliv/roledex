import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  jobFeatureSnapshots,
  jobListings,
  jobRevisions,
  type JsonObject,
} from "@/db/schema";
import {
  JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
  JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  jobFeatureSnapshotInsertValues,
} from "@/features/jobs/feature-snapshot";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_BACKFILL_LIMIT = 2_000;

async function missingCurrentRevisions(limit: number) {
  return db
    .select({ revision: jobRevisions })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(
      jobFeatureSnapshots,
      and(
        eq(jobFeatureSnapshots.jobRevisionId, jobRevisions.id),
        eq(
          jobFeatureSnapshots.schemaVersion,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
        ),
        eq(
          jobFeatureSnapshots.extractorVersion,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ),
      ),
    )
    .where(
      and(
        eq(jobListings.lifecycleStatus, "active"),
        isNull(jobFeatureSnapshots.jobRevisionId),
      ),
    )
    .orderBy(desc(jobRevisions.retrievedAt), desc(jobRevisions.id))
    .limit(limit);
}

async function missingCatalogRevisions(limit: number) {
  return db
    .select({ revision: jobRevisions })
    .from(jobRevisions)
    .leftJoin(
      jobFeatureSnapshots,
      and(
        eq(jobFeatureSnapshots.jobRevisionId, jobRevisions.id),
        eq(
          jobFeatureSnapshots.schemaVersion,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
        ),
        eq(
          jobFeatureSnapshots.extractorVersion,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ),
      ),
    )
    .where(isNull(jobFeatureSnapshots.jobRevisionId))
    .orderBy(desc(jobRevisions.retrievedAt), desc(jobRevisions.id))
    .limit(limit);
}

/**
 * Appends the current extractor version for legacy revisions. The composite
 * primary key and conflict-ignore make retries and concurrent cold starts safe.
 */
export async function backfillJobFeatureSnapshots(
  options: {
    batchSize?: number;
    currentOnly?: boolean;
    limit?: number;
  } = {},
) {
  await ensureDatabaseReady();
  const limit = Math.max(
    0,
    Math.min(25_000, Math.trunc(options.limit ?? DEFAULT_BACKFILL_LIMIT)),
  );
  const batchSize = Math.max(
    1,
    Math.min(MAX_BATCH_SIZE, Math.trunc(options.batchSize ?? DEFAULT_BATCH_SIZE)),
  );
  let processed = 0;

  while (processed < limit) {
    const pageSize = Math.min(batchSize, limit - processed);
    const rows = options.currentOnly
      ? await missingCurrentRevisions(pageSize)
      : await missingCatalogRevisions(pageSize);
    if (rows.length === 0) break;

    const values = rows.map(({ revision }) => {
      const record = jobFeatureSnapshotInsertValues(revision);
      return {
        ...record,
        snapshot: record.snapshot as unknown as JsonObject,
      };
    });
    await withDatabaseWriteRetry(() =>
      db
        .insert(jobFeatureSnapshots)
        .values(values)
        .onConflictDoNothing(),
    );
    processed += rows.length;
  }

  return { processed, complete: processed < limit };
}
