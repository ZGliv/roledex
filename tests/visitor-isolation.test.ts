import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-visitors-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let fitScoreRuns: typeof import("@/db/schema")["fitScoreRuns"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let jobRevisions: typeof import("@/db/schema")["jobRevisions"];
let visitorJobStates: typeof import("@/db/schema")["visitorJobStates"];
let profileA: Awaited<
  ReturnType<
    typeof import("@/features/candidate/queries")["getActiveCandidateProfileForVisitor"]
  >
>;
let profileB: typeof profileA;
let profileC: typeof profileA;
let jobId: string;
const visitorA = randomUUID();
const visitorB = randomUUID();
const visitorC = randomUUID();

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { createManualJob } = await import("@/features/jobs/service");
  const { getActiveCandidateProfileForVisitor } = await import(
    "@/features/candidate/queries"
  );

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schema.candidateProfiles;
  fitScoreRuns = schema.fitScoreRuns;
  jobListings = schema.jobListings;
  jobRevisions = schema.jobRevisions;
  visitorJobStates = schema.visitorJobStates;

  await migrateDatabase();
  await seedDatabase();
  jobId = (
    await createManualJob({
      title: "Implementation Specialist",
      company: "Example Systems",
      location: "Remote — United States",
      sourceName: "Employer careers",
      sourceUrl: "https://example.com/jobs/visitor-isolation",
      salarySource: "employer_posted",
      descriptionRaw:
        "Example Systems is hiring an Implementation Specialist for $80,000 to $100,000 per year. Configure customer workflows and coordinate launches.",
    })
  ).jobId;

  [profileA, profileB, profileC] = await Promise.all([
    getActiveCandidateProfileForVisitor(visitorA),
    getActiveCandidateProfileForVisitor(visitorB),
    getActiveCandidateProfileForVisitor(visitorC),
  ]);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("visitor data isolation", () => {
  it("gives two fresh visitors separate neutral profiles and fit rows", async () => {
    expect(profileA.id).not.toBe(profileB.id);
    expect(profileB.id).not.toBe(profileC.id);
    expect(profileA.visitorId).toBe(visitorA);
    expect(profileB.visitorId).toBe(visitorB);
    expect(profileA.currentRole).toBe("Exploring new opportunities");
    expect(profileB.currentRole).toBe("Exploring new opportunities");

    const [scoresA, scoresB] = await Promise.all([
      db
        .select()
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, profileA.id)),
      db
        .select()
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, profileB.id)),
    ]);
    expect(scoresA.length).toBeGreaterThan(0);
    expect(scoresB.length).toBe(scoresA.length);
  });

  it("keeps decisions and profile edits private to one visitor", async () => {
    const { recordJobDecisionForVisitor } = await import(
      "@/features/decisions/service"
    );
    const { updateCandidateProfileAndRescoreForVisitor } = await import(
      "@/features/candidate/service"
    );

    await recordJobDecisionForVisitor(visitorA, {
      jobId,
      decision: "saved",
      expectedDecision: "unseen",
    });
    await updateCandidateProfileAndRescoreForVisitor(visitorA, {
      expectedRevision: profileA.revision,
      currentRole: "Customer Success Specialist",
      currentSalaryCents: 0,
      preferredSalaryMinimumCents: 0,
      preferredSalaryTargetCents: 0,
      preferredWorkArrangements: ["remote"],
      preferredIndustries: ["Technology"],
      targetRoleFamilies: ["Customer success"],
      skills: ["Customer onboarding"],
      strengths: [],
      weaknesses: [],
      interests: [],
      careerGoals: ["Grow in customer success"],
      dealBreakers: [],
      interviewConcerns: [],
      location: "",
      relocationPreference: "",
      yearsExperience: 1,
    });

    const [stateA] = await db
      .select()
      .from(visitorJobStates)
      .where(
        and(
          eq(visitorJobStates.visitorId, visitorA),
          eq(visitorJobStates.jobListingId, jobId),
        ),
      );
    const [stateB] = await db
      .select()
      .from(visitorJobStates)
      .where(
        and(
          eq(visitorJobStates.visitorId, visitorB),
          eq(visitorJobStates.jobListingId, jobId),
        ),
      );
    const [updatedA] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profileA.id));
    const [unchangedB] = await db
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.id, profileB.id));

    expect(stateA.currentDecision).toBe("saved");
    expect(stateB).toBeUndefined();
    expect(updatedA.currentRole).toBe("Customer Success Specialist");
    expect(unchangedB.currentRole).toBe("Exploring new opportunities");
    expect(unchangedB.revision).toBe(profileB.revision);
  });

  it("repairs saved scores while leaving skipped jobs out of scoring", async () => {
    const { ensureCurrentFitScoresForProfile } = await import(
      "@/features/candidate/scoring"
    );
    const { recordJobDecisionForVisitor } = await import(
      "@/features/decisions/service"
    );
    await recordJobDecisionForVisitor(visitorB, {
      jobId,
      decision: "skipped",
      expectedDecision: "unseen",
    });
    const [[updatedA], [updatedB], [updatedC]] = await Promise.all([
      db
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, profileA.id))
        .limit(1),
      db
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, profileB.id))
        .limit(1),
      db
        .select()
        .from(candidateProfiles)
        .where(eq(candidateProfiles.id, profileC.id))
        .limit(1),
    ]);
    if (!updatedA || !updatedB || !updatedC) {
      throw new Error("Expected all visitor profiles.");
    }

    await db
      .delete(fitScoreRuns)
      .where(
        inArray(fitScoreRuns.candidateProfileId, [
          updatedA.id,
          updatedB.id,
          updatedC.id,
        ]),
      );
    await Promise.all([
      ensureCurrentFitScoresForProfile(updatedA),
      ensureCurrentFitScoresForProfile(updatedB),
      ensureCurrentFitScoresForProfile(updatedC),
    ]);

    const [scoresA, scoresB, scoresC] = await Promise.all([
      db
        .select()
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, updatedA.id)),
      db
        .select()
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, updatedB.id)),
      db
        .select()
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, updatedC.id)),
    ]);
    expect(scoresA).toHaveLength(1);
    expect(scoresB).toHaveLength(0);
    expect(scoresC).toHaveLength(1);
  });

  it("advances the unseen score window past decided listings", async () => {
    const { ensureCurrentFitScoresForProfile } = await import(
      "@/features/candidate/scoring"
    );
    const targetListingId = randomUUID();
    const targetRevisionId = randomUUID();
    const filler = Array.from({ length: 100 }, (_, index) => ({
      listingId: randomUUID(),
      revisionId: randomUUID(),
      index,
    }));

    await db.transaction(async (transaction) => {
      await transaction.insert(jobListings).values([
        {
          id: targetListingId,
          normalizedTitle: "old unseen role",
          normalizedCompany: "window test",
          createdAt: new Date(1_000),
          updatedAt: new Date(1_000),
        },
        ...filler.map(({ listingId, index }) => ({
          id: listingId,
          normalizedTitle: `decided role ${index}`,
          normalizedCompany: "window test",
          createdAt: new Date(10_000 + index),
          updatedAt: new Date(10_000 + index),
        })),
      ]);
      await transaction.insert(jobRevisions).values([
        {
          id: targetRevisionId,
          jobListingId: targetListingId,
          sourceType: "manual_paste",
          rawDescription: "Coordinate customer launches for $90,000 per year.",
          contentHash: "window-target",
          parserVersion: "test",
          parseSchemaVersion: "test",
          title: "Old unseen role",
          company: "Window Test",
          location: "Remote",
        },
        ...filler.map(({ listingId, revisionId, index }) => ({
          id: revisionId,
          jobListingId: listingId,
          sourceType: "manual_paste" as const,
          rawDescription: "A role that this visitor already reviewed.",
          contentHash: `window-filler-${index}`,
          parserVersion: "test",
          parseSchemaVersion: "test",
          title: `Decided role ${index}`,
          company: "Window Test",
          location: "Remote",
        })),
      ]);
      await transaction
        .update(jobListings)
        .set({ currentRevisionId: targetRevisionId })
        .where(eq(jobListings.id, targetListingId));
      for (const { listingId, revisionId } of filler) {
        await transaction
          .update(jobListings)
          .set({ currentRevisionId: revisionId })
          .where(eq(jobListings.id, listingId));
      }
      await transaction.insert(visitorJobStates).values(
        filler.map(({ listingId }) => ({
          visitorId: visitorC,
          jobListingId: listingId,
          currentDecision: "skipped" as const,
        })),
      );
    });

    await db
      .delete(fitScoreRuns)
      .where(eq(fitScoreRuns.candidateProfileId, profileC.id));
    await ensureCurrentFitScoresForProfile(profileC);

    const [targetScore, fillerScores] = await Promise.all([
      db
        .select({ id: fitScoreRuns.id })
        .from(fitScoreRuns)
        .where(
          and(
            eq(fitScoreRuns.candidateProfileId, profileC.id),
            eq(fitScoreRuns.jobRevisionId, targetRevisionId),
          ),
        ),
      db
        .select({ id: fitScoreRuns.id })
        .from(fitScoreRuns)
        .where(
          and(
            eq(fitScoreRuns.candidateProfileId, profileC.id),
            inArray(
              fitScoreRuns.jobRevisionId,
              filler.map(({ revisionId }) => revisionId),
            ),
          ),
        ),
    ]);
    expect(targetScore).toHaveLength(1);
    expect(fillerScores).toHaveLength(0);
  });
});
