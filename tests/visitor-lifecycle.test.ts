import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { OWNER_VISITOR_ID } from "@/features/auth/identity";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-lifecycle-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const guestVisitorId = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let analysisRuns: typeof import("@/db/schema")["analysisRuns"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let fitScoreRuns: typeof import("@/db/schema")["fitScoreRuns"];
let jobDecisionEvents: typeof import("@/db/schema")["jobDecisionEvents"];
let visitorJobStates: typeof import("@/db/schema")["visitorJobStates"];
let visitors: typeof import("@/db/schema")["visitors"];
let jobId: string;
let revisionId: string;
let guestProfile: Awaited<
  ReturnType<
    typeof import("@/features/candidate/queries")["getActiveCandidateProfileForVisitor"]
  >
>;
let deleteGuestWorkspaceForVisitor: typeof import("@/features/visitor/service")["deleteGuestWorkspaceForVisitor"];
let touchGuestVisitorActivity: typeof import("@/features/visitor/service")["touchGuestVisitorActivity"];
let OwnerWorkspaceDeletionError: typeof import("@/features/visitor/service")["OwnerWorkspaceDeletionError"];

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { createManualJob } = await import("@/features/jobs/service");
  const { getActiveCandidateProfileForVisitor } = await import(
    "@/features/candidate/queries"
  );
  const visitorService = await import("@/features/visitor/service");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  analysisRuns = schemaModule.analysisRuns;
  candidateProfiles = schemaModule.candidateProfiles;
  fitScoreRuns = schemaModule.fitScoreRuns;
  jobDecisionEvents = schemaModule.jobDecisionEvents;
  visitorJobStates = schemaModule.visitorJobStates;
  visitors = schemaModule.visitors;
  deleteGuestWorkspaceForVisitor =
    visitorService.deleteGuestWorkspaceForVisitor;
  touchGuestVisitorActivity = visitorService.touchGuestVisitorActivity;
  OwnerWorkspaceDeletionError = visitorService.OwnerWorkspaceDeletionError;

  await migrateDatabase();
  await seedDatabase();
  const created = await createManualJob({
    title: "Solutions Coordinator",
    company: "Lifecycle Systems",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/visitor-lifecycle",
    salarySource: "employer_posted",
    descriptionRaw:
      "Lifecycle Systems is hiring a Solutions Coordinator for $75,000 to $95,000 per year. Coordinate launches, document requirements, and guide customers.",
  });
  jobId = created.jobId;
  revisionId = created.revisionId;

  const oldActivity = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000);
  await db.insert(visitors).values({
    id: guestVisitorId,
    kind: "guest",
    createdAt: oldActivity,
    lastSeenAt: oldActivity,
  });
  guestProfile = await getActiveCandidateProfileForVisitor(guestVisitorId);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("guest visitor lifecycle", () => {
  it("touches stale guest activity once per day and never touches the owner", async () => {
    const [afterWorkspaceAccess] = await db
      .select({ lastSeenAt: visitors.lastSeenAt })
      .from(visitors)
      .where(eq(visitors.id, guestVisitorId));
    expect(afterWorkspaceAccess.lastSeenAt.getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );

    const oneHourLater = new Date(
      afterWorkspaceAccess.lastSeenAt.getTime() + 60 * 60 * 1_000,
    );
    await expect(
      touchGuestVisitorActivity(guestVisitorId, { now: oneHourLater }),
    ).resolves.toBe(false);
    const [afterSecondTouch] = await db
      .select({ lastSeenAt: visitors.lastSeenAt })
      .from(visitors)
      .where(eq(visitors.id, guestVisitorId));
    expect(afterSecondTouch.lastSeenAt).toEqual(afterWorkspaceAccess.lastSeenAt);
    await expect(
      touchGuestVisitorActivity(OWNER_VISITOR_ID, { now: oneHourLater }),
    ).resolves.toBe(false);
  });

  it("deletes every guest-owned row in one transaction", async () => {
    const { recordJobDecisionForVisitor } = await import(
      "@/features/decisions/service"
    );
    await recordJobDecisionForVisitor(guestVisitorId, {
      jobId,
      decision: "saved",
      expectedDecision: "unseen",
      note: "A promising role",
    });
    await db.insert(analysisRuns).values({
      analysisType: "job_gauntlet",
      jobRevisionId: revisionId,
      candidateProfileId: guestProfile.id,
      candidateFingerprint: guestProfile.fingerprint ?? "starter",
      provider: "test",
      promptVersion: "test-v1",
      outputSchemaVersion: "test-v1",
      cacheKey: `visitor-reset-${randomUUID()}`,
      status: "prompt_generated",
      request: {},
      promptText: "Test prompt",
    });

    await expect(
      deleteGuestWorkspaceForVisitor(guestVisitorId),
    ).resolves.toEqual({ deleted: true, profilesDeleted: 1 });

    const [visitorRows, profileRows, fitRows, analysisRows, stateRows, eventRows] =
      await Promise.all([
        db.select().from(visitors).where(eq(visitors.id, guestVisitorId)),
        db
          .select()
          .from(candidateProfiles)
          .where(eq(candidateProfiles.visitorId, guestVisitorId)),
        db
          .select()
          .from(fitScoreRuns)
          .where(eq(fitScoreRuns.candidateProfileId, guestProfile.id)),
        db
          .select()
          .from(analysisRuns)
          .where(eq(analysisRuns.candidateProfileId, guestProfile.id)),
        db
          .select()
          .from(visitorJobStates)
          .where(eq(visitorJobStates.visitorId, guestVisitorId)),
        db
          .select()
          .from(jobDecisionEvents)
          .where(eq(jobDecisionEvents.visitorId, guestVisitorId)),
      ]);
    expect(visitorRows).toHaveLength(0);
    expect(profileRows).toHaveLength(0);
    expect(fitRows).toHaveLength(0);
    expect(analysisRows).toHaveLength(0);
    expect(stateRows).toHaveLength(0);
    expect(eventRows).toHaveLength(0);
  });

  it("refuses to delete the owner workspace", async () => {
    await expect(
      deleteGuestWorkspaceForVisitor(OWNER_VISITOR_ID),
    ).rejects.toBeInstanceOf(OwnerWorkspaceDeletionError);
    const ownerRows = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.id, OWNER_VISITOR_ID));
    expect(ownerRows).toHaveLength(1);
  });
});
