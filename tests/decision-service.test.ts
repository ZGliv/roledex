import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-decisions-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let jobDecisionEvents: typeof import("@/db/schema")["jobDecisionEvents"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let visitorJobStates: typeof import("@/db/schema")["visitorJobStates"];
let jobId: string;
let recordJobDecision: typeof import("@/features/decisions/service")["recordJobDecision"];
let recordJobDecisionForVisitor: typeof import("@/features/decisions/service")["recordJobDecisionForVisitor"];
let recordJobDecisionReasonsForVisitor: typeof import("@/features/decisions/service")["recordJobDecisionReasonsForVisitor"];
let recordJobNoteForVisitor: typeof import("@/features/decisions/service")["recordJobNoteForVisitor"];
let GuestActivityWriteRateLimitError: typeof import("@/features/decisions/service")["GuestActivityWriteRateLimitError"];
let currentDecisionEventId: string | null = null;

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { createManualJob } = await import("@/features/jobs/service");
  const decisionService = await import("@/features/decisions/service");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  jobDecisionEvents = schemaModule.jobDecisionEvents;
  jobListings = schemaModule.jobListings;
  visitorJobStates = schemaModule.visitorJobStates;
  recordJobDecision = decisionService.recordJobDecision;
  recordJobDecisionForVisitor = decisionService.recordJobDecisionForVisitor;
  recordJobDecisionReasonsForVisitor =
    decisionService.recordJobDecisionReasonsForVisitor;
  recordJobNoteForVisitor = decisionService.recordJobNoteForVisitor;
  GuestActivityWriteRateLimitError =
    decisionService.GuestActivityWriteRateLimitError;

  await migrateDatabase();
  await seedDatabase();
  const created = await createManualJob({
    title: "AI Implementation Specialist",
    company: "Example Systems",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/careers/implementation",
    salarySource: "employer_posted",
    descriptionRaw:
      "Example Systems is hiring an AI Implementation Specialist. The role is remote in the United States and pays $80,000 to $100,000 per year. You will onboard customers and configure AI workflows.",
  });
  jobId = created.jobId;
});

afterAll(() => {
  process.env.VERCEL = "";
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("decision persistence concurrency", () => {
  it("rejects a stale transition without overwriting the newer pipeline state", async () => {
    const saved = await recordJobDecision({
      jobId,
      decision: "saved",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
    });
    expect(saved).toMatchObject({ changed: true, decision: "saved" });

    const applied = await recordJobDecision({
      jobId,
      decision: "applied",
      expectedDecision: "saved",
      expectedDecisionEventId: saved.decisionEventId,
    });
    expect(applied).toMatchObject({ changed: true, decision: "applied" });
    currentDecisionEventId = applied.decisionEventId;

    await expect(
      recordJobDecision({
        jobId,
        decision: "unseen",
        expectedDecision: "saved",
        expectedDecisionEventId: saved.decisionEventId,
      }),
    ).rejects.toThrow("changed in another tab or device");

    const [listing] = await db
      .select({ currentDecision: jobListings.currentDecision })
      .from(jobListings)
      .where(eq(jobListings.id, jobId));
    const events = await db
      .select({ id: jobDecisionEvents.id })
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.jobListingId, jobId));

    expect(listing.currentDecision).toBe("applied");
    expect(events).toHaveLength(2);
  });

  it("treats a same-state request with the current revision token as a no-op", async () => {
    await expect(
      recordJobDecision({
        jobId,
        decision: "applied",
        expectedDecision: "applied",
        expectedDecisionEventId: currentDecisionEventId,
      }),
    ).resolves.toMatchObject({ changed: false, decision: "applied" });
  });

  it("rejects delayed actions after the decision cycles back through an ABA transition", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const { createManualJob } = await import("@/features/jobs/service");
    const created = await createManualJob({
      title: "Customer Implementation Associate",
      company: "ABA Systems",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/careers/aba-cas",
      salarySource: "employer_posted",
      descriptionRaw:
        "ABA Systems is hiring a Customer Implementation Associate. The role is remote in the United States and pays $75,000 to $90,000 per year. You will onboard customers and configure software workflows.",
    });

    const firstSaved = await recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
      jobId: created.jobId,
      decision: "saved",
      expectedDecision: "unseen",
      expectedDecisionEventId: null,
    });
    const stretch = await recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
      jobId: created.jobId,
      decision: "stretch",
      expectedDecision: "saved",
      expectedDecisionEventId: firstSaved.decisionEventId,
    });
    const savedAgain = await recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
      jobId: created.jobId,
      decision: "saved",
      expectedDecision: "stretch",
      expectedDecisionEventId: stretch.decisionEventId,
    });

    await expect(
      recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
        jobId: created.jobId,
        decision: "applied",
        expectedDecision: "saved",
        expectedDecisionEventId: firstSaved.decisionEventId,
      }),
    ).rejects.toThrow("changed in another tab or device");
    await expect(
      recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
        jobId: created.jobId,
        decision: "saved",
        expectedDecision: "unseen",
        expectedDecisionEventId: null,
      }),
    ).rejects.toThrow("changed in another tab or device");

    const [state] = await db
      .select({
        currentDecision: visitorJobStates.currentDecision,
        currentDecisionEventId: visitorJobStates.currentDecisionEventId,
      })
      .from(visitorJobStates)
      .where(eq(visitorJobStates.jobListingId, created.jobId));
    expect(state).toEqual({
      currentDecision: "saved",
      currentDecisionEventId: savedAgain.decisionEventId,
    });
  });

  it("validates and persists structured reason codes with a decision", async () => {
    await expect(
      recordJobDecision({
        jobId,
        decision: "interview",
        expectedDecision: "applied",
        expectedDecisionEventId: currentDecisionEventId,
        reasonCodes: ["not_a_reason" as never],
      }),
    ).rejects.toMatchObject({ name: "ZodError" });

    const interview = await recordJobDecision({
      jobId,
      decision: "interview",
      expectedDecision: "applied",
      expectedDecisionEventId: currentDecisionEventId,
      reasonCodes: ["too_senior", "wrong_role"],
    });
    expect(interview).toMatchObject({ changed: true, decision: "interview" });
    currentDecisionEventId = interview.decisionEventId;

    const [event] = await db
      .select({ reasonCodes: jobDecisionEvents.reasonCodes })
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.jobListingId, jobId))
      .orderBy(desc(jobDecisionEvents.decidedAt), desc(jobDecisionEvents.id))
      .limit(1);

    expect(event.reasonCodes).toEqual(["too_senior", "wrong_role"]);
  });

  it("appends reason feedback without mutating the original decision event", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const [state] = await db
      .select({ decisionEventId: visitorJobStates.currentDecisionEventId })
      .from(visitorJobStates)
      .where(eq(visitorJobStates.jobListingId, jobId))
      .limit(1);
    expect(state.decisionEventId).toEqual(expect.any(String));
    const annotation = await recordJobDecisionReasonsForVisitor(
      OWNER_VISITOR_ID,
      {
        jobId,
        expectedDecision: "interview",
        expectedDecisionEventId: state.decisionEventId!,
        reasonCodes: ["wrong_location", "wrong_work_mode"],
      },
    );

    const [event] = await db
      .select({
        decision: jobDecisionEvents.decision,
        previousDecision: jobDecisionEvents.previousDecision,
        reasonCodes: jobDecisionEvents.reasonCodes,
      })
      .from(jobDecisionEvents)
      .where(eq(jobDecisionEvents.id, annotation.id));

    expect(annotation).toMatchObject({
      decision: "interview",
      reasonCodes: ["wrong_location", "wrong_work_mode"],
    });
    expect(event).toEqual({
      decision: "interview",
      previousDecision: "interview",
      reasonCodes: ["wrong_location", "wrong_work_mode"],
    });

    await expect(
      recordJobDecisionReasonsForVisitor(OWNER_VISITOR_ID, {
        jobId,
        expectedDecision: "saved",
        expectedDecisionEventId: randomUUID(),
        reasonCodes: ["other"],
      }),
    ).rejects.toThrow("changed in another tab or device");

    const unseen = await recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
      jobId,
      decision: "unseen",
      expectedDecision: "interview",
      expectedDecisionEventId: state.decisionEventId,
    });
    const interviewAgain = await recordJobDecisionForVisitor(OWNER_VISITOR_ID, {
      jobId,
      decision: "interview",
      expectedDecision: "unseen",
      expectedDecisionEventId: unseen.decisionEventId,
    });
    currentDecisionEventId = interviewAgain.decisionEventId;
    await expect(
      recordJobDecisionReasonsForVisitor(OWNER_VISITOR_ID, {
        jobId,
        expectedDecision: "interview",
        expectedDecisionEventId: state.decisionEventId!,
        reasonCodes: ["other"],
      }),
    ).rejects.toThrow("changed in another tab or device");
  });

  it("caps guest decision and note writes at 150 per hour after no-op checks", async () => {
    const { visitors } = await import("@/db/schema");
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const guestVisitorId = randomUUID();
    process.env.VERCEL = "1";

    const guestDecision = await recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "saved",
        expectedDecision: "unseen",
        expectedDecisionEventId: null,
      });
    expect(guestDecision).toMatchObject({
      changed: true,
      decision: "saved",
      decisionEventId: expect.any(String),
    });
    await db.insert(jobDecisionEvents).values(
      Array.from({ length: 149 }, (_, index) => ({
        visitorId: guestVisitorId,
        jobListingId: jobId,
        decision: "saved" as const,
        note: `Quota filler ${index}`,
      })),
    );

    await expect(
      recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "saved",
        expectedDecision: "saved",
        expectedDecisionEventId: guestDecision.decisionEventId,
      }),
    ).resolves.toMatchObject({ changed: false, decision: "saved" });
    await expect(
      recordJobNoteForVisitor(guestVisitorId, {
        jobId,
        note: "This should be rate limited",
      }),
    ).rejects.toBeInstanceOf(GuestActivityWriteRateLimitError);
    await expect(
      recordJobDecisionReasonsForVisitor(guestVisitorId, {
        jobId,
        expectedDecision: "saved",
        expectedDecisionEventId: guestDecision.decisionEventId!,
        reasonCodes: ["wrong_role"],
      }),
    ).rejects.toBeInstanceOf(GuestActivityWriteRateLimitError);
    await expect(
      recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "applied",
        expectedDecision: "saved",
        expectedDecisionEventId: guestDecision.decisionEventId,
      }),
    ).rejects.toBeInstanceOf(GuestActivityWriteRateLimitError);

    const [guest] = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.id, guestVisitorId));
    expect(guest.id).toBe(guestVisitorId);

    await db.insert(jobDecisionEvents).values(
      Array.from({ length: 148 }, (_, index) => ({
        visitorId: OWNER_VISITOR_ID,
        jobListingId: jobId,
        decision: "applied" as const,
        note: `Owner quota filler ${index}`,
      })),
    );
    await expect(
      recordJobNoteForVisitor(OWNER_VISITOR_ID, {
        jobId,
        note: "Owner writes remain unrestricted",
      }),
    ).resolves.toMatchObject({ note: "Owner writes remain unrestricted" });
    process.env.VERCEL = "";
  });
});
