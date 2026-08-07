import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
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
let jobId: string;
let recordJobDecision: typeof import("@/features/decisions/service")["recordJobDecision"];
let recordJobDecisionForVisitor: typeof import("@/features/decisions/service")["recordJobDecisionForVisitor"];
let recordJobNoteForVisitor: typeof import("@/features/decisions/service")["recordJobNoteForVisitor"];
let GuestActivityWriteRateLimitError: typeof import("@/features/decisions/service")["GuestActivityWriteRateLimitError"];

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
  recordJobDecision = decisionService.recordJobDecision;
  recordJobDecisionForVisitor = decisionService.recordJobDecisionForVisitor;
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
    await expect(
      recordJobDecision({
        jobId,
        decision: "saved",
        expectedDecision: "unseen",
      }),
    ).resolves.toMatchObject({ changed: true, decision: "saved" });

    await expect(
      recordJobDecision({
        jobId,
        decision: "applied",
        expectedDecision: "saved",
      }),
    ).resolves.toMatchObject({ changed: true, decision: "applied" });

    await expect(
      recordJobDecision({
        jobId,
        decision: "unseen",
        expectedDecision: "saved",
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

  it("treats a repeated already-applied request as an idempotent success", async () => {
    await expect(
      recordJobDecision({
        jobId,
        decision: "applied",
        expectedDecision: "saved",
      }),
    ).resolves.toEqual({ changed: false, decision: "applied" });
  });

  it("caps guest decision and note writes at 150 per hour after no-op checks", async () => {
    const { visitors } = await import("@/db/schema");
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const guestVisitorId = randomUUID();
    process.env.VERCEL = "1";

    await expect(
      recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "saved",
        expectedDecision: "unseen",
      }),
    ).resolves.toMatchObject({ changed: true, decision: "saved" });
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
        expectedDecision: "unseen",
      }),
    ).resolves.toEqual({ changed: false, decision: "saved" });
    await expect(
      recordJobNoteForVisitor(guestVisitorId, {
        jobId,
        note: "This should be rate limited",
      }),
    ).rejects.toBeInstanceOf(GuestActivityWriteRateLimitError);
    await expect(
      recordJobDecisionForVisitor(guestVisitorId, {
        jobId,
        decision: "applied",
        expectedDecision: "saved",
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
