import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-data-lifecycle-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const visitorA = randomUUID();
const visitorB = randomUUID();
const jobId = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let schema: typeof import("@/db/schema");

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { getActiveCandidateProfileRecordForVisitor } = await import(
    "@/features/candidate/queries"
  );
  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  await migrateDatabase();
  await Promise.all([
    getActiveCandidateProfileRecordForVisitor(visitorA),
    getActiveCandidateProfileRecordForVisitor(visitorB),
  ]);
  await db.insert(schema.jobListings).values({
    id: jobId,
    normalizedCompany: "Lifecycle Test Co",
    normalizedTitle: "Implementation Analyst",
  });
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

async function createDraft(visitorId: string, suffix: string) {
  const { createCandidateResumeImportForVisitor } = await import(
    "@/features/candidate/search-contract-service"
  );
  return createCandidateResumeImportForVisitor(visitorId, {
    label: `Résumé ${suffix}`,
    rawText: `Candidate ${suffix}\nSKILLS\nSQL, ServiceNow\n${randomUUID()}`,
    sourceFileName: `${suffix}.txt`,
  });
}

async function insertFeedSession(options: {
  expiresAt: Date;
  id: string;
  startedAt: Date;
  visitorId: string;
}) {
  await db.insert(schema.feedSessions).values({
    expiresAt: options.expiresAt,
    id: options.id,
    lastSeenAt: options.startedAt,
    pageSize: 1,
    pageStartPosition: 0,
    profileRevision: 1,
    queueId: `queue-${options.id}`,
    queueVersion: `version-${options.id}`,
    source: "cached",
    startedAt: options.startedAt,
    visitorId: options.visitorId,
  });
  const exposureId = `exposure-${options.id}`;
  await db.insert(schema.feedExposures).values({
    exposedAt: options.startedAt,
    id: exposureId,
    jobListingId: jobId,
    position: 0,
    queueId: `queue-${options.id}`,
    queueVersion: `version-${options.id}`,
    sessionId: options.id,
    tier: "ready_now",
    visitorId: options.visitorId,
  });
  return exposureId;
}

describe.sequential("server data lifecycle", () => {
  it("globally purges abandoned résumé drafts and raw text in bounded oldest-first batches", async () => {
    const now = new Date("2026-08-19T16:00:00.000Z");
    const older = await createDraft(visitorA, "oldest");
    const stale = await createDraft(visitorB, "stale");
    const fresh = await createDraft(visitorA, "fresh");
    const confirmed = await createDraft(visitorB, "confirmed-retained");
    const oldDate = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1_000);
    const oldestDate = new Date(oldDate.getTime() - 60_000);

    await db
      .update(schema.candidateResumeImports)
      .set({ updatedAt: oldestDate })
      .where(eq(schema.candidateResumeImports.id, older.importId));
    await db
      .update(schema.candidateResumeImports)
      .set({ updatedAt: oldDate })
      .where(eq(schema.candidateResumeImports.id, stale.importId));
    await db
      .update(schema.candidateResumeImports)
      .set({
        confirmedAt: oldDate,
        rawSourceRetained: true,
        status: "confirmed",
        updatedAt: oldDate,
      })
      .where(eq(schema.candidateResumeImports.id, confirmed.importId));

    const { cleanupAbandonedResumeDrafts } = await import(
      "@/features/data-lifecycle/service"
    );
    const first = await cleanupAbandonedResumeDrafts({
      now,
      resumeDraftLimit: 1,
    });
    expect(first).toMatchObject({
      deletedDrafts: 1,
      deletedRawSources: 1,
      hasMore: true,
    });
    expect(
      await db
        .select()
        .from(schema.candidateResumeImports)
        .where(eq(schema.candidateResumeImports.id, older.importId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.candidateResumeImports)
        .where(eq(schema.candidateResumeImports.id, stale.importId)),
    ).toHaveLength(1);

    const second = await cleanupAbandonedResumeDrafts({
      now,
      resumeDraftLimit: 10,
    });
    expect(second).toMatchObject({
      deletedDrafts: 1,
      deletedRawSources: 1,
      hasMore: false,
    });
    const survivors = await db
      .select({ id: schema.candidateResumeImports.id })
      .from(schema.candidateResumeImports)
      .where(
        and(
          eq(schema.candidateResumeImports.candidateProfileId, (
            await db
              .select({ id: schema.candidateProfiles.id })
              .from(schema.candidateProfiles)
              .where(eq(schema.candidateProfiles.visitorId, visitorA))
              .limit(1)
          )[0]!.id),
        ),
      );
    expect(survivors.map(({ id }) => id)).toContain(fresh.importId);
    const [confirmedRow] = await db
      .select()
      .from(schema.candidateResumeImports)
      .where(eq(schema.candidateResumeImports.id, confirmed.importId));
    expect(confirmedRow).toMatchObject({
      rawSourceRetained: true,
      status: "confirmed",
    });
    expect(confirmedRow?.resumeSourceId).toBeTruthy();
    expect(
      await db
        .select()
        .from(schema.candidateResumeSources)
        .where(eq(schema.candidateResumeSources.id, confirmedRow!.resumeSourceId!)),
    ).toHaveLength(1);
  });

  it("prunes expired feed sessions in bounded batches and cascades only their exposures", async () => {
    const now = new Date("2026-08-19T16:00:00.000Z");
    const oldA = randomUUID();
    const oldB = randomUUID();
    const freshB = randomUUID();
    const oldestExposure = await insertFeedSession({
      expiresAt: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1_000),
      id: oldA,
      startedAt: new Date(now.getTime() - 33 * 24 * 60 * 60 * 1_000),
      visitorId: visitorA,
    });
    const staleExposure = await insertFeedSession({
      expiresAt: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1_000),
      id: oldB,
      startedAt: new Date(now.getTime() - 32 * 24 * 60 * 60 * 1_000),
      visitorId: visitorB,
    });
    const freshExposure = await insertFeedSession({
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      id: freshB,
      startedAt: now,
      visitorId: visitorB,
    });

    const { cleanupExpiredFeedTelemetry } = await import(
      "@/features/data-lifecycle/service"
    );
    const first = await cleanupExpiredFeedTelemetry({
      feedSessionLimit: 1,
      now,
    });
    expect(first).toMatchObject({
      deletedExposures: 1,
      deletedSessions: 1,
      hasMore: true,
    });
    expect(
      await db
        .select()
        .from(schema.feedExposures)
        .where(eq(schema.feedExposures.id, oldestExposure)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.feedExposures)
        .where(eq(schema.feedExposures.id, staleExposure)),
    ).toHaveLength(1);

    const second = await cleanupExpiredFeedTelemetry({
      feedSessionLimit: 10,
      now,
    });
    expect(second).toMatchObject({
      deletedExposures: 1,
      deletedSessions: 1,
      hasMore: false,
    });
    expect(
      await db
        .select()
        .from(schema.feedExposures)
        .where(eq(schema.feedExposures.id, freshExposure)),
    ).toHaveLength(1);
  });

  it("keeps workspace exports visitor-scoped, recent, and hard-capped", async () => {
    const now = new Date("2026-08-19T16:00:00.000Z");
    const olderA = randomUUID();
    const latestA = randomUUID();
    const otherVisitor = randomUUID();
    await insertFeedSession({
      expiresAt: new Date(now.getTime() + 60 * 60 * 1_000),
      id: olderA,
      startedAt: new Date(now.getTime() - 60_000),
      visitorId: visitorA,
    });
    await insertFeedSession({
      expiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
      id: latestA,
      startedAt: now,
      visitorId: visitorA,
    });
    await insertFeedSession({
      expiresAt: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
      id: otherVisitor,
      startedAt: now,
      visitorId: visitorB,
    });

    const { exportVisitorWorkspace } = await import(
      "@/features/product/service"
    );
    const exported = await exportVisitorWorkspace(visitorA, {
      feedExposureLimit: 1,
      feedSessionLimit: 1,
      now,
    });
    expect(exported.feedSessions).toHaveLength(1);
    expect(exported.feedSessions[0]?.id).toBe(latestA);
    expect(exported.feedExposures).toHaveLength(1);
    expect(exported.feedExposures[0]?.sessionId).toBe(latestA);
    expect(exported.feedSessions.every(({ visitorId }) => visitorId === visitorA)).toBe(
      true,
    );
    expect(
      exported.feedExposures.every(({ visitorId }) => visitorId === visitorA),
    ).toBe(true);
    expect(exported.feedTelemetryExport).toMatchObject({
      exposureLimit: 1,
      exposuresTruncated: true,
      sessionLimit: 1,
      sessionsTruncated: true,
    });
  });
});
