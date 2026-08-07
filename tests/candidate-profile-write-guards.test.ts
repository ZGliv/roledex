import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { CandidateProfile } from "@/db/schema";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";

vi.mock("server-only", () => ({}));

const databasePath = join(
  tmpdir(),
  `jobswipe-profile-guards-${randomUUID()}.db`,
);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const guestVisitorId = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let fitScoreRuns: typeof import("@/db/schema")["fitScoreRuns"];
let CandidateProfileUpdateSchema: typeof import("@/features/candidate/input")["CandidateProfileUpdateSchema"];
let CandidateProfileRateLimitError: typeof import("@/features/candidate/service")["CandidateProfileRateLimitError"];
let updateCandidateProfileAndRescoreForVisitor: typeof import("@/features/candidate/service")["updateCandidateProfileAndRescoreForVisitor"];

function submissionFor(profile: CandidateProfile, currentRole = profile.currentRole) {
  return CandidateProfileUpdateSchema.parse({
    expectedRevision: String(profile.revision),
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

async function profileFor(visitorId: string) {
  const [profile] = await db
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.visitorId, visitorId))
    .limit(1);
  if (!profile) throw new Error("Expected an active visitor profile.");
  return profile;
}

async function makeLastEditOldEnough(profileId: string) {
  await db
    .update(candidateProfiles)
    .set({ updatedAt: new Date(Date.now() - 16_000) })
    .where(eq(candidateProfiles.id, profileId));
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { createManualJob } = await import("@/features/jobs/service");
  const { getActiveCandidateProfileForVisitor } = await import(
    "@/features/candidate/queries"
  );
  const candidateInput = await import("@/features/candidate/input");
  const candidateService = await import("@/features/candidate/service");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schemaModule.candidateProfiles;
  fitScoreRuns = schemaModule.fitScoreRuns;
  CandidateProfileUpdateSchema = candidateInput.CandidateProfileUpdateSchema;
  CandidateProfileRateLimitError =
    candidateService.CandidateProfileRateLimitError;
  updateCandidateProfileAndRescoreForVisitor =
    candidateService.updateCandidateProfileAndRescoreForVisitor;

  await migrateDatabase();
  await seedDatabase();
  await createManualJob({
    title: "Customer Implementation Specialist",
    company: "Profile Guard Systems",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/jobs/profile-write-guards",
    salarySource: "employer_posted",
    descriptionRaw:
      "Profile Guard Systems is hiring a Customer Implementation Specialist for $80,000 to $100,000 per year. Configure software, guide launches, and support customers.",
  });
  await getActiveCandidateProfileForVisitor(guestVisitorId);
});

afterAll(() => {
  process.env.VERCEL = "";
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("candidate profile write guards", () => {
  it("limits each visitor scoring pass to the newest 100 jobs", async () => {
    const { VISITOR_SCORE_WINDOW } = await import(
      "@/features/candidate/scoring"
    );
    expect(VISITOR_SCORE_WINDOW).toBe(100);
  });

  it("returns unchanged before writing a revision or fit scores", async () => {
    process.env.VERCEL = "1";
    const before = await profileFor(guestVisitorId);
    const fitsBefore = await db
      .select({ id: fitScoreRuns.id })
      .from(fitScoreRuns)
      .where(eq(fitScoreRuns.candidateProfileId, before.id));

    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        guestVisitorId,
        submissionFor(before),
      ),
    ).resolves.toEqual({
      revision: before.revision,
      rescoredJobs: 0,
      unchanged: true,
    });

    const after = await profileFor(guestVisitorId);
    const fitsAfter = await db
      .select({ id: fitScoreRuns.id })
      .from(fitScoreRuns)
      .where(eq(fitScoreRuns.candidateProfileId, before.id));
    expect(after.revision).toBe(before.revision);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(fitsAfter).toHaveLength(fitsBefore.length);
  });

  it("allows the first customization, then enforces 15 seconds and five edits per hour", async () => {
    let profile = await profileFor(guestVisitorId);
    const first = await updateCandidateProfileAndRescoreForVisitor(
      guestVisitorId,
      submissionFor(profile, "Customer Success Specialist 1"),
    );
    expect(first.revision).toBe(profile.revision + 1);
    profile = await profileFor(guestVisitorId);

    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        guestVisitorId,
        submissionFor(profile),
      ),
    ).resolves.toMatchObject({ unchanged: true, revision: profile.revision });
    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        guestVisitorId,
        submissionFor(profile, "Customer Success Specialist too soon"),
      ),
    ).rejects.toBeInstanceOf(CandidateProfileRateLimitError);

    for (let edit = 2; edit <= 5; edit += 1) {
      await makeLastEditOldEnough(profile.id);
      profile = await profileFor(guestVisitorId);
      await expect(
        updateCandidateProfileAndRescoreForVisitor(
          guestVisitorId,
          submissionFor(profile, `Customer Success Specialist ${edit}`),
        ),
      ).resolves.toMatchObject({ revision: profile.revision + 1 });
      profile = await profileFor(guestVisitorId);
    }

    await makeLastEditOldEnough(profile.id);
    profile = await profileFor(guestVisitorId);
    const fitCountBefore = (
      await db
        .select({ id: fitScoreRuns.id })
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, profile.id))
    ).length;
    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        guestVisitorId,
        submissionFor(profile, "Customer Success Specialist 6"),
      ),
    ).rejects.toBeInstanceOf(CandidateProfileRateLimitError);

    const after = await profileFor(guestVisitorId);
    const fitCountAfter = (
      await db
        .select({ id: fitScoreRuns.id })
        .from(fitScoreRuns)
        .where(eq(fitScoreRuns.candidateProfileId, profile.id))
    ).length;
    expect(after.revision).toBe(profile.revision);
    expect(fitCountAfter).toBe(fitCountBefore);
  });

  it("preserves immediate owner and local profile editing", async () => {
    let owner = await profileFor(OWNER_VISITOR_ID);
    await updateCandidateProfileAndRescoreForVisitor(
      OWNER_VISITOR_ID,
      submissionFor(owner, `${owner.currentRole} owner edit one`),
    );
    owner = await profileFor(OWNER_VISITOR_ID);
    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        OWNER_VISITOR_ID,
        submissionFor(owner, `${owner.currentRole} owner edit two`),
      ),
    ).resolves.toMatchObject({ revision: owner.revision + 1 });

    process.env.VERCEL = "";
    const localVisitorId = randomUUID();
    const { getActiveCandidateProfileForVisitor } = await import(
      "@/features/candidate/queries"
    );
    let localProfile = await getActiveCandidateProfileForVisitor(localVisitorId);
    await updateCandidateProfileAndRescoreForVisitor(
      localVisitorId,
      submissionFor(localProfile, "Local role one"),
    );
    localProfile = await profileFor(localVisitorId);
    await expect(
      updateCandidateProfileAndRescoreForVisitor(
        localVisitorId,
        submissionFor(localProfile, "Local role two"),
      ),
    ).resolves.toMatchObject({ revision: localProfile.revision + 1 });
  });
});
