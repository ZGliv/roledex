import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-feed-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let getDeckJobCards: typeof import("@/features/jobs/queries")["getDeckJobCards"];
let getDeckJobCardsPage: typeof import("@/features/jobs/queries")["getDeckJobCardsPage"];
let getJobCard: typeof import("@/features/jobs/queries")["getJobCard"];
let getSavedJobCards: typeof import("@/features/jobs/queries")["getSavedJobCards"];
let updateCandidateProfileAndRescore: typeof import("@/features/candidate/service")["updateCandidateProfileAndRescore"];
let profileSubmission: Parameters<
  typeof import("@/features/candidate/service")["updateCandidateProfileAndRescore"]
>[0];
let savedJobId: string;

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { CandidateProfileUpdateSchema } = await import("@/features/candidate/input");
  const candidateService = await import("@/features/candidate/service");
  const { createManualJob } = await import("@/features/jobs/service");
  const { recordJobDecision } = await import("@/features/decisions/service");
  const queries = await import("@/features/jobs/queries");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schemaModule.candidateProfiles;
  jobListings = schemaModule.jobListings;
  getDeckJobCards = queries.getDeckJobCards;
  getDeckJobCardsPage = queries.getDeckJobCardsPage;
  getJobCard = queries.getJobCard;
  getSavedJobCards = queries.getSavedJobCards;
  updateCandidateProfileAndRescore =
    candidateService.updateCandidateProfileAndRescore;

  await migrateDatabase();
  await seedDatabase();

  const create = (title: string, company: string, description: string) =>
    createManualJob({
      title,
      company,
      location: title.includes("Remote") ? "Remote — United States" : "Pittsburgh, PA",
      sourceName: "Employer careers",
      sourceUrl: `https://example.com/jobs/${company.toLowerCase()}-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      salarySource: "unknown",
      descriptionRaw: `${description} This full-time position works with customers and cross-functional teams to deliver measurable outcomes. Candidates communicate clearly, solve operational problems, and own projects from discovery through launch.`,
    });

  const preference = await create(
    "Remote AI Implementation Specialist",
    "Preference Co",
    "Help customers configure AI workflows, manage onboarding, and launch integrations.",
  );
  await recordJobDecision({
    jobId: preference.jobId,
    decision: "saved",
    expectedDecision: "unseen",
  });
  savedJobId = preference.jobId;

  await create(
    "Remote AI Implementation Consultant",
    "Northstar",
    "Implement AI products and guide enterprise customers through technical onboarding.",
  );
  await create(
    "Product Operations Analyst",
    "Orbit",
    "Analyze product operations, improve processes, and coordinate launches across teams.",
  );
  await create(
    "Technical Support Analyst",
    "Beacon",
    "Troubleshoot software issues and help customers use complex technical products.",
  );
  await createManualJob({
    title: "Junior Solutions Engineer",
    company: "Clearpay",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/clearpay-solutions-engineer",
    salarySource: "employer_posted",
    descriptionRaw:
      "Clearpay is hiring a Junior Solutions Engineer. Employer-posted base salary is $82,000 to $96,000 per year. This remote role supports customers with technical discovery, demos, implementation planning, APIs, and successful product launches across the United States.",
  });

  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.isActive, true))
    .limit(1);
  if (!profile) throw new Error("Expected the seeded active profile.");

  profileSubmission = CandidateProfileUpdateSchema.parse({
    expectedRevision: String(profile.revision),
    currentRole: `${profile.currentRole} II`,
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
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("personalized job feed query", () => {
  it("never returns a missing salary and distinguishes modeled from posted pay", async () => {
    const jobs = await getDeckJobCards();
    const posted = jobs.find((job) => job.company === "Clearpay");
    const estimated = jobs.find((job) => job.company === "Northstar");

    expect(jobs).toHaveLength(4);
    expect(jobs.every((job) => !job.salaryDisplay.includes("not posted"))).toBe(true);
    expect(posted).toMatchObject({
      salaryDisplay: "$82,000–$96,000/yr",
      salarySource: "employer_posted",
      salaryIsEstimate: false,
      salaryDisclosure: "Employer-posted base salary",
      annualSalaryEstimateCents: 8_900_000,
    });
    expect(posted?.decisionBrief).toMatchObject({
      confidence: expect.stringMatching(/^(high|medium|low)$/),
      edge: expect.any(String),
      opportunity: expect.stringContaining("$33,000+ above your current pay"),
      positioningMove: expect.any(String),
      risk: expect.any(String),
    });
    expect(posted?.decisionBrief?.opportunity).toContain(
      "remote matches your preferred setup",
    );
    expect(estimated?.salaryDisplay).toMatch(/^Est\. /);
    expect(estimated).toMatchObject({
      salarySource: "externally_estimated",
      salaryIsEstimate: true,
      salaryBenchmarkOccupation: "Computer Systems Analysts",
      personalizationSignalCount: 1,
      personalizationModelVersion: "swipe-preferences-v1:profile-1",
    });
    expect(estimated?.salaryDisclosure).toContain("not posted by Northstar");
    expect(estimated?.salaryMethod).toContain("May 2025 BLS");
  });

  it("provides deterministic cursor pages without duplicate cards", async () => {
    const first = await getDeckJobCardsPage({ limit: 2 });
    const second = await getDeckJobCardsPage({
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(first.jobs).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.jobs).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();
    expect(second.jobs.map((job) => job.id)).not.toEqual(
      expect.arrayContaining(first.jobs.map((job) => job.id)),
    );
    expect([...first.jobs, ...second.jobs].map((job) => job.id)).toHaveLength(4);
  });

  it("safely resets an invalid cursor instead of skipping unseen jobs", async () => {
    const page = await getDeckJobCardsPage({ cursor: "invalid", limit: 2 });

    expect(page.cursorReset).toBe(true);
    expect(page.jobs).toHaveLength(2);
  });

  it("keeps saved roles available after expiry and a profile revision while the live deck stays current", async () => {
    await db
      .update(jobListings)
      .set({ lifecycleStatus: "expired" })
      .where(eq(jobListings.id, savedJobId));

    expect(await getSavedJobCards()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: savedJobId, currentDecision: "saved" }),
      ]),
    );

    const update = await updateCandidateProfileAndRescore(profileSubmission);
    expect(update).toMatchObject({
      revision: profileSubmission.expectedRevision + 1,
      rescoredJobs: 4,
    });

    const [saved, detail, deck] = await Promise.all([
      getSavedJobCards(),
      getJobCard(savedJobId),
      getDeckJobCards(),
    ]);

    expect(saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: savedJobId, currentDecision: "saved" }),
      ]),
    );
    expect(detail).toMatchObject({
      id: savedJobId,
      currentDecision: "saved",
    });
    expect(deck).toHaveLength(4);
    expect(deck.every((job) => job.id !== savedJobId)).toBe(true);
  });
});
