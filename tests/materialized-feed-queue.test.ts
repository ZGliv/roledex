import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(
  tmpdir(),
  `jobswipe-materialized-feed-${randomUUID()}.db`,
);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let jobDecisionEvents: typeof import("@/db/schema")["jobDecisionEvents"];
let visitorFeedQueueEntries: typeof import("@/db/schema")["visitorFeedQueueEntries"];
let recordJobDecisionForVisitor: typeof import("@/features/decisions/service")["recordJobDecisionForVisitor"];
let FeedExposureMismatchError: typeof import("@/features/decisions/service")["FeedExposureMismatchError"];
let readMaterializedFeedPage: typeof import("@/features/jobs/feed-queue-store")["readMaterializedFeedPage"];
let recordFeedPageSession: typeof import("@/features/jobs/feed-queue-store")["recordFeedPageSession"];
let replaceMaterializedFeedQueue: typeof import("@/features/jobs/feed-queue-store")["replaceMaterializedFeedQueue"];

const ownerVisitorId = "00000000-0000-4000-8000-000000000001";
const guestVisitorId = randomUUID();
const ownerProfileId = "candidate-default";
const guestProfileId = randomUUID();
let jobId: string;

const catalog = {
  revisionId: "catalog-revision-for-test",
  retrievedAt: new Date("2026-08-19T12:00:00.000Z"),
};

function identity(candidateProfileId: string) {
  return {
    candidateProfileId,
    profileRevision: 1,
    recommenderVersion: "personal-radar-v2",
    catalog,
  };
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { createManualJob } = await import("@/features/jobs/service");
  const decisionService = await import("@/features/decisions/service");
  const queueStore = await import("@/features/jobs/feed-queue-store");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  jobDecisionEvents = schema.jobDecisionEvents;
  visitorFeedQueueEntries = schema.visitorFeedQueueEntries;
  recordJobDecisionForVisitor = decisionService.recordJobDecisionForVisitor;
  FeedExposureMismatchError = decisionService.FeedExposureMismatchError;
  readMaterializedFeedPage = queueStore.readMaterializedFeedPage;
  recordFeedPageSession = queueStore.recordFeedPageSession;
  replaceMaterializedFeedQueue = queueStore.replaceMaterializedFeedQueue;

  await migrateDatabase();
  await seedDatabase();
  await db.insert(schema.visitors).values({
    id: guestVisitorId,
    kind: "guest",
  });
  await db.insert(schema.candidateProfiles).values({
    id: guestProfileId,
    visitorId: guestVisitorId,
    currentRole: "Support Analyst",
    currentSalaryCents: 5_000_000,
    preferredSalaryMinimumCents: 6_000_000,
    preferredSalaryTargetCents: 8_000_000,
  });
  const created = await createManualJob({
    title: "Implementation Analyst",
    company: "Queue Test Company",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/materialized-queue-test",
    salarySource: "employer_posted",
    descriptionRaw:
      "Queue Test Company is hiring an Implementation Analyst. The employer-posted salary is $70,000 to $90,000 per year for this remote United States role.",
  });
  jobId = created.jobId;
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("visitor materialized feed queue", () => {
  it("reuses bounded cursor pages without leaking another visitor's cards", async () => {
    await replaceMaterializedFeedQueue(ownerVisitorId, identity(ownerProfileId), [
      {
        id: jobId,
        tier: "ready_now",
        snapshot: { id: jobId, marker: "owner-only" },
      },
    ]);
    await replaceMaterializedFeedQueue(guestVisitorId, identity(guestProfileId), [
      {
        id: jobId,
        tier: "credible_stretch",
        snapshot: { id: jobId, marker: "guest-only" },
      },
    ]);

    const ownerPage = await readMaterializedFeedPage(
      ownerVisitorId,
      identity(ownerProfileId),
      { limit: 1 },
    );
    const guestPage = await readMaterializedFeedPage(
      guestVisitorId,
      identity(guestProfileId),
      { limit: 1 },
    );

    expect(ownerPage).toMatchObject({ source: "cached", totalAvailable: 1 });
    expect(ownerPage?.entries[0]?.snapshot).toMatchObject({
      marker: "owner-only",
    });
    expect(guestPage?.entries[0]?.snapshot).toMatchObject({
      marker: "guest-only",
    });
    await expect(
      readMaterializedFeedPage(guestVisitorId, identity(ownerProfileId), {
        limit: 1,
      }),
    ).resolves.toBeNull();
  });

  it("records exposure before learning and atomically advances only that visitor", async () => {
    const ownerPage = await readMaterializedFeedPage(
      ownerVisitorId,
      identity(ownerProfileId),
      { limit: 1 },
    );
    const guestPage = await readMaterializedFeedPage(
      guestVisitorId,
      identity(guestProfileId),
      { limit: 1 },
    );
    if (!ownerPage || !guestPage) throw new Error("Expected both feed pages.");
    const ownerSession = await recordFeedPageSession(ownerVisitorId, ownerPage);
    const guestSession = await recordFeedPageSession(guestVisitorId, guestPage);
    const ownerExposureId = ownerSession.exposures.get(jobId);
    const guestExposureId = guestSession.exposures.get(jobId);
    if (!ownerExposureId || !guestExposureId) {
      throw new Error("Expected durable feed exposures.");
    }

    await expect(
      recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "saved",
        expectedDecision: "unseen",
        expectedDecisionEventId: null,
        exposureId: ownerExposureId,
      }),
    ).rejects.toBeInstanceOf(FeedExposureMismatchError);

    const saved = await recordJobDecisionForVisitor(guestVisitorId, {
      jobId,
      decision: "saved",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
      exposureId: guestExposureId,
    });
    expect(saved).toMatchObject({ changed: true, decision: "saved" });

    const [event] = await db
      .select({ exposureId: jobDecisionEvents.feedExposureId })
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.id, saved.decisionEventId!));
    const [guestEntry] = await db
      .select({ consumedAt: visitorFeedQueueEntries.consumedAt })
      .from(visitorFeedQueueEntries)
      .where(
        and(
          eq(visitorFeedQueueEntries.visitorId, guestVisitorId),
          eq(visitorFeedQueueEntries.jobListingId, jobId),
        ),
      );
    const [ownerEntry] = await db
      .select({ consumedAt: visitorFeedQueueEntries.consumedAt })
      .from(visitorFeedQueueEntries)
      .where(
        and(
          eq(visitorFeedQueueEntries.visitorId, ownerVisitorId),
          eq(visitorFeedQueueEntries.jobListingId, jobId),
        ),
      );

    expect(event?.exposureId).toBe(guestExposureId);
    expect(guestEntry?.consumedAt).toBeInstanceOf(Date);
    expect(ownerEntry?.consumedAt).toBeNull();

    const advancedGuestPage = await readMaterializedFeedPage(
      guestVisitorId,
      identity(guestProfileId),
      { limit: 1 },
    );
    const untouchedOwnerPage = await readMaterializedFeedPage(
      ownerVisitorId,
      identity(ownerProfileId),
      { limit: 1 },
    );
    expect(advancedGuestPage).toMatchObject({
      source: "cached",
      entries: [],
      totalAvailable: 0,
    });
    expect(untouchedOwnerPage?.entries).toHaveLength(1);
  });
});
