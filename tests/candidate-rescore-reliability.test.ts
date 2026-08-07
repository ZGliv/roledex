import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq, inArray } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { CandidateProfile, FitScoreRun } from "@/db/schema";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import type { ManualJobInput } from "@/features/jobs/input";

vi.mock("server-only", () => ({}));

const databasePath = join(
  tmpdir(),
  `jobswipe-candidate-reliability-${randomUUID()}.db`,
);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const DESCRIPTION =
  "This full-time implementation role works with customers to deploy software, document requirements, configure integrations, and train users. The salary range is $70,000 to $90,000 per year. Candidates should communicate clearly and have experience with SQL, REST APIs, product workflows, technical support, and project delivery.";

function manualJob(
  key: string,
  title: string,
  company: string,
): ManualJobInput {
  return {
    title,
    company,
    location: "Remote — United States",
    sourceName: "Reliability test",
    sourceUrl: `https://example.com/jobs/${key}`,
    salarySource: "employer_posted",
    descriptionRaw: DESCRIPTION,
  };
}

const JOB_INPUTS = {
  relevant: manualJob("relevant", "Implementation Specialist", "Relevant Systems"),
  skipped: manualJob("skipped", "Customer Solutions Analyst", "Skipped Systems"),
  archivedDecision: manualJob(
    "archived-decision",
    "Product Operations Analyst",
    "Archived Decision Systems",
  ),
  expired: manualJob("expired", "Technical Product Analyst", "Expired Systems"),
  archivedLifecycle: manualJob(
    "archived-lifecycle",
    "Solutions Coordinator",
    "Archived Lifecycle Systems",
  ),
} as const;

type CreatedJob = Awaited<
  ReturnType<typeof import("@/features/jobs/service")["createManualJob"]>
>;

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let fitScoreRuns: typeof import("@/db/schema")["fitScoreRuns"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let visitorJobStates: typeof import("@/db/schema")["visitorJobStates"];
let CandidateProfileUpdateSchema: typeof import("@/features/candidate/input")["CandidateProfileUpdateSchema"];
let CandidateProfileConflictError: typeof import("@/features/candidate/service")["CandidateProfileConflictError"];
let updateCandidateProfileAndRescore: typeof import("@/features/candidate/service")["updateCandidateProfileAndRescore"];
let createManualJob: typeof import("@/features/jobs/service")["createManualJob"];
const createdJobs = {} as Record<keyof typeof JOB_INPUTS, CreatedJob>;

function submissionFor(
  profile: CandidateProfile,
  expectedRevision = profile.revision,
  currentRole = profile.currentRole,
) {
  return CandidateProfileUpdateSchema.parse({
    expectedRevision: String(expectedRevision),
    currentRole,
    location: profile.location ?? "",
    relocationPreference: profile.relocationPreference ?? "",
    currentSalaryCents: String(profile.currentSalaryCents / 100),
    preferredSalaryMinimumCents: String(
      profile.preferredSalaryMinimumCents / 100,
    ),
    preferredSalaryTargetCents: String(
      profile.preferredSalaryTargetCents / 100,
    ),
    yearsExperience: String(profile.yearsExperience),
    preferredWorkArrangements: profile.preferredWorkArrangements,
    preferredIndustries: profile.preferredIndustries.join("\n"),
    targetRoleFamilies: profile.targetRoleFamilies.join("\n"),
    skills: profile.skills.join("\n"),
    strengths: profile.strengths.join("\n"),
    weaknesses: profile.weaknesses.join("\n"),
    interests: profile.interests.join("\n"),
    careerGoals: profile.careerGoals.join("\n"),
    dealBreakers: profile.dealBreakers.join("\n"),
    interviewConcerns: profile.interviewConcerns.join("\n"),
  });
}

async function activeProfile() {
  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.isActive, true))
    .limit(1);
  if (!profile) throw new Error("Expected the seeded active profile.");
  return profile;
}

async function fitRunsForRevision(
  jobRevisionId: string,
  candidateProfileId: string,
) {
  return db
    .select()
    .from(fitScoreRuns)
    .where(
      and(
        eq(fitScoreRuns.jobRevisionId, jobRevisionId),
        eq(fitScoreRuns.candidateProfileId, candidateProfileId),
      ),
    );
}

function runsAtProfileRevision(runs: FitScoreRun[], revision: number) {
  return runs.filter((run) => run.candidateSnapshot.revision === revision);
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const candidateInput = await import("@/features/candidate/input");
  const candidateService = await import("@/features/candidate/service");
  const jobsService = await import("@/features/jobs/service");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schemaModule.candidateProfiles;
  fitScoreRuns = schemaModule.fitScoreRuns;
  jobListings = schemaModule.jobListings;
  visitorJobStates = schemaModule.visitorJobStates;
  CandidateProfileUpdateSchema = candidateInput.CandidateProfileUpdateSchema;
  CandidateProfileConflictError = candidateService.CandidateProfileConflictError;
  updateCandidateProfileAndRescore =
    candidateService.updateCandidateProfileAndRescore;
  createManualJob = jobsService.createManualJob;

  await migrateDatabase();
  await seedDatabase();
  for (const [key, input] of Object.entries(JOB_INPUTS) as Array<
    [keyof typeof JOB_INPUTS, ManualJobInput]
  >) {
    createdJobs[key] = await createManualJob(input);
  }

  await db
    .update(jobListings)
    .set({ currentDecision: "skipped" })
    .where(eq(jobListings.id, createdJobs.skipped.jobId));
  await db
    .update(jobListings)
    .set({ currentDecision: "archived" })
    .where(eq(jobListings.id, createdJobs.archivedDecision.jobId));
  await db.insert(visitorJobStates).values([
    {
      visitorId: OWNER_VISITOR_ID,
      jobListingId: createdJobs.skipped.jobId,
      currentDecision: "skipped",
    },
    {
      visitorId: OWNER_VISITOR_ID,
      jobListingId: createdJobs.archivedDecision.jobId,
      currentDecision: "archived",
    },
  ]);
  await db
    .update(jobListings)
    .set({ lifecycleStatus: "expired" })
    .where(eq(jobListings.id, createdJobs.expired.jobId));
  await db
    .update(jobListings)
    .set({ lifecycleStatus: "archived" })
    .where(eq(jobListings.id, createdJobs.archivedLifecycle.jobId));
}, 30_000);

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("candidate rescore reliability", () => {
  it("rejects a stale expected revision before changing profile or fit rows", async () => {
    const before = await activeProfile();
    const fitRowsBefore = await db.select({ id: fitScoreRuns.id }).from(fitScoreRuns);

    await expect(
      updateCandidateProfileAndRescore(
        submissionFor(before, before.revision + 1, "Stale browser edit"),
      ),
    ).rejects.toBeInstanceOf(CandidateProfileConflictError);

    const after = await activeProfile();
    const fitRowsAfter = await db.select({ id: fitScoreRuns.id }).from(fitScoreRuns);
    expect(after.revision).toBe(before.revision);
    expect(after.currentRole).toBe(before.currentRole);
    expect(fitRowsAfter).toHaveLength(fitRowsBefore.length);
  });

  it("rescores only active, non-skipped, non-archived current listings", async () => {
    const before = await activeProfile();
    const result = await updateCandidateProfileAndRescore(
      submissionFor(before, before.revision, `${before.currentRole} II`),
    );

    expect(result).toEqual({ revision: before.revision + 1, rescoredJobs: 1 });
    const allRuns = await db.select().from(fitScoreRuns);
    const rescoredRevisionIds = runsAtProfileRevision(
      allRuns,
      result.revision,
    ).map((run) => run.jobRevisionId);
    expect(rescoredRevisionIds).toEqual([createdJobs.relevant.revisionId]);
  });

  it("repairs a missing current-profile score when an unchanged listing returns", async () => {
    const profile = await activeProfile();
    const currentRuns = runsAtProfileRevision(
      await fitRunsForRevision(createdJobs.relevant.revisionId, profile.id),
      profile.revision,
    );
    await db.delete(fitScoreRuns).where(
      inArray(
        fitScoreRuns.id,
        currentRuns.map((run) => run.id),
      ),
    );

    const first = await createManualJob(JOB_INPUTS.relevant);
    const second = await createManualJob(JOB_INPUTS.relevant);
    const repaired = runsAtProfileRevision(
      await fitRunsForRevision(createdJobs.relevant.revisionId, profile.id),
      profile.revision,
    );

    expect(first.changed).toBe(false);
    expect(second.changed).toBe(false);
    expect(repaired).toHaveLength(1);
  });

  it("serializes an unchanged ingestion against a profile save", async () => {
    const before = await activeProfile();
    const [profileResult, ingestionResult] = await Promise.all([
      updateCandidateProfileAndRescore(
        submissionFor(before, before.revision, `${before.currentRole} III`),
      ),
      createManualJob(JOB_INPUTS.relevant),
    ]);
    const after = await activeProfile();
    const currentRuns = runsAtProfileRevision(
      await fitRunsForRevision(createdJobs.relevant.revisionId, after.id),
      after.revision,
    );

    expect(profileResult.revision).toBe(before.revision + 1);
    expect(ingestionResult.changed).toBe(false);
    expect(after.revision).toBe(profileResult.revision);
    expect(currentRuns).toHaveLength(1);
  });
});
