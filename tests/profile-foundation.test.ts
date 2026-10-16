import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-profile-v2-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const visitorA = randomUUID();
const visitorB = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let schema: typeof import("@/db/schema");
let profileA: Awaited<
  ReturnType<
    typeof import("@/features/candidate/queries")["getActiveCandidateProfileForVisitor"]
  >
>;
let profileB: typeof profileA;

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { getActiveCandidateProfileForVisitor } = await import(
    "@/features/candidate/queries"
  );

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  await migrateDatabase();
  [profileA, profileB] = await Promise.all([
    getActiveCandidateProfileForVisitor(visitorA),
    getActiveCandidateProfileForVisitor(visitorB),
  ]);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

async function currentProfile(visitorId: string) {
  const [profile] = await db
    .select()
    .from(schema.candidateProfiles)
    .where(
      and(
        eq(schema.candidateProfiles.visitorId, visitorId),
        eq(schema.candidateProfiles.isActive, true),
      ),
    )
    .limit(1);
  if (!profile) throw new Error("Expected an active profile.");
  return profile;
}

describe.sequential("profile persistence foundation", () => {
  it("saves role directions loaded from the database view through the strict mutation contract", async () => {
    const { getCandidateProfileViewForVisitor } = await import("@/features/candidate/queries");
    const { CandidateRoleTargetsReplaceSchema } = await import("@/features/candidate/input");
    const { roleTargetInput } = await import("@/features/candidate/role-target-input");
    const { replaceCandidateRoleTargetsForVisitor } = await import("@/features/candidate/search-contract-service");
    const view = await getCandidateProfileViewForVisitor(visitorB, false);
    const input = CandidateRoleTargetsReplaceSchema.parse({
      expectedRevision: view.revision,
      targets: view.roleTargets.map((target, index) => roleTargetInput(target, index + 1)),
    });
    await replaceCandidateRoleTargetsForVisitor(visitorB, input);
    const reloaded = await getCandidateProfileViewForVisitor(visitorB, false);
    expect(reloaded.roleTargets.map((target) => target.label)).toEqual(
      view.roleTargets.map((target) => target.label),
    );
  });

  it("rejects impossible search and timeline values", async () => {
    const {
      CandidateEducationCreateSchema,
      CandidateSearchPreferencesUpdateSchema,
      CandidateWorkExperienceCreateSchema,
      DEFAULT_CANDIDATE_SEARCH_PREFERENCES,
    } = await import("@/features/candidate/input");
    expect(
      CandidateSearchPreferencesUpdateSchema.safeParse({
        ...DEFAULT_CANDIDATE_SEARCH_PREFERENCES,
        expectedRevision: profileA.revision,
        acceptedEmploymentTypes: [],
        commuteRadiusMiles: 251,
      }).success,
    ).toBe(false);
    expect(
      CandidateWorkExperienceCreateSchema.safeParse({
        expectedProfileRevision: profileA.revision,
        sortOrder: 0,
        company: "Northstar",
        title: "Analyst",
        employmentType: "full_time",
        location: null,
        workArrangement: "remote",
        startDate: "2025-01",
        endDate: "2025-12",
        isCurrent: true,
        summary: "",
        achievements: [],
        skills: [],
      }).success,
    ).toBe(false);
    expect(
      CandidateEducationCreateSchema.safeParse({
        expectedProfileRevision: profileA.revision,
        sortOrder: 0,
        institution: "Example University",
        degree: "BA",
        fieldOfStudy: "Business",
        startYear: 2024,
        endYear: 2020,
        description: "",
      }).success,
    ).toBe(false);
  });

  it("stores structured search rules and advances the optimistic revision", async () => {
    const { CandidateSearchPreferencesUpdateSchema } = await import(
      "@/features/candidate/input"
    );
    const { updateCandidateSearchPreferencesForVisitor } = await import(
      "@/features/candidate/profile-foundation-service"
    );

    const submission = CandidateSearchPreferencesUpdateSchema.parse({
      expectedRevision: profileA.revision,
      desiredSeniorityLevels: ["entry", "mid"],
      excludedTitles: ["Senior Engineer", " senior   engineer "],
      excludedCompanies: ["Example Staffing"],
      excludedIndustries: ["Gambling"],
      acceptedEmploymentTypes: ["full_time", "contract"],
      preferredWorkModes: ["remote", "hybrid"],
      strictWorkModes: true,
      commuteRadiusMiles: 25,
      maxOfficeDaysPerWeek: 2,
      relocationDestinations: ["New York, NY"],
      maxTravelPercent: 15,
      workAuthorization: "work_authorized",
      requiresSponsorship: false,
      missingSalaryPolicy: "hide",
    });

    const result = await updateCandidateSearchPreferencesForVisitor(
      visitorA,
      submission,
    );
    expect(result).toEqual({ revision: profileA.revision + 1 });

    profileA = await currentProfile(visitorA);
    expect(profileA).toMatchObject({
      desiredSeniorityLevels: ["entry", "mid"],
      excludedTitles: ["Senior Engineer"],
      acceptedEmploymentTypes: ["full_time", "contract"],
      preferredWorkModes: ["remote", "hybrid"],
      preferredWorkArrangements: ["remote", "hybrid"],
      strictWorkModes: true,
      commuteRadiusMiles: 25,
      maxOfficeDaysPerWeek: 2,
      maxTravelPercent: 15,
      workAuthorization: "work_authorized",
      requiresSponsorship: false,
      missingSalaryPolicy: "hide",
    });
    expect(profileA.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    await expect(
      updateCandidateSearchPreferencesForVisitor(visitorA, submission),
    ).rejects.toMatchObject({ name: "CandidateProfileConflictError" });
  });

  it("creates normalized evidence and binds every mutation to the visitor", async () => {
    const {
      CandidateEducationCreateSchema,
      CandidateSkillEvidenceCreateSchema,
      CandidateWorkExperienceCreateSchema,
      PortfolioProjectCreateSchema,
    } = await import("@/features/candidate/input");
    const {
      createCandidateEducationForVisitor,
      createCandidateSkillEvidenceForVisitor,
      createCandidateWorkExperienceForVisitor,
      createPortfolioProjectForVisitor,
      updateCandidateWorkExperienceForVisitor,
    } = await import("@/features/candidate/profile-foundation-service");

    const work = await createCandidateWorkExperienceForVisitor(
      visitorA,
      CandidateWorkExperienceCreateSchema.parse({
        expectedProfileRevision: profileA.revision,
        sortOrder: 0,
        company: "Northstar Health",
        title: "Support Analyst",
        employmentType: "full_time",
        location: "Pittsburgh, PA",
        workArrangement: "hybrid",
        startDate: "2024-01",
        endDate: null,
        isCurrent: true,
        summary: "Supports clinical systems.",
        achievements: ["Reduced repeat tickets", " reduced  repeat tickets "],
        skills: ["SQL", "Troubleshooting"],
      }),
    );
    profileA = await currentProfile(visitorA);
    expect(work.revision).toBe(profileA.revision);

    await expect(
      updateCandidateWorkExperienceForVisitor(visitorB, {
        id: work.id,
        expectedProfileRevision: profileB.revision,
        sortOrder: 0,
        company: "Stolen employer",
        title: "Stolen title",
        employmentType: "full_time",
        location: null,
        workArrangement: "remote",
        startDate: "2024-01",
        endDate: null,
        isCurrent: true,
        summary: "",
        achievements: [],
        skills: [],
      }),
    ).rejects.toMatchObject({ name: "CandidateProfileRecordNotFoundError" });

    const education = await createCandidateEducationForVisitor(
      visitorA,
      CandidateEducationCreateSchema.parse({
        expectedProfileRevision: profileA.revision,
        sortOrder: 0,
        institution: "Community College",
        degree: "Associate of Science",
        fieldOfStudy: "Information Technology",
        startYear: 2020,
        endYear: 2022,
        description: "Systems and networking.",
      }),
    );
    profileA = await currentProfile(visitorA);
    expect(education.revision).toBe(profileA.revision);

    const project = await createPortfolioProjectForVisitor(
      visitorA,
      PortfolioProjectCreateSchema.parse({
        expectedProfileRevision: profileA.revision,
        name: "Workflow Console",
        description: "A workflow visibility application.",
        technologies: ["TypeScript"],
        status: "shipped",
        liveUrl: "https://example.com/workflow",
        repositoryUrl: null,
        appStoreUrl: null,
        screenshots: [],
        responsibilities: ["Product design", "Implementation"],
        businessProblem: "Teams lacked workflow visibility.",
        userImpact: "Reduced handoff delays.",
        strongestEvidence: ["Used by a real team"],
        relevantRoleFamilies: ["Implementation"],
      }),
    );
    profileA = await currentProfile(visitorA);
    expect(project.revision).toBe(profileA.revision);

    const skill = await createCandidateSkillEvidenceForVisitor(
      visitorA,
      CandidateSkillEvidenceCreateSchema.parse({
        expectedProfileRevision: profileA.revision,
        name: "SQL",
        proficiency: "working",
        yearsExperience: 2,
        lastUsedYear: 2026,
        evidenceType: "work_experience",
        evidenceNote: "Used for production reporting and issue diagnosis.",
      }),
    );
    profileA = await currentProfile(visitorA);
    expect(skill.revision).toBe(profileA.revision);
    expect(profileA.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const [storedWork, storedEducation, storedProject, storedSkill] =
      await Promise.all([
        db
          .select()
          .from(schema.candidateWorkExperiences)
          .where(eq(schema.candidateWorkExperiences.id, work.id)),
        db
          .select()
          .from(schema.candidateEducationRecords)
          .where(eq(schema.candidateEducationRecords.id, education.id)),
        db
          .select()
          .from(schema.portfolioProjects)
          .where(eq(schema.portfolioProjects.id, project.id)),
        db
          .select()
          .from(schema.candidateSkillEvidence)
          .where(eq(schema.candidateSkillEvidence.id, skill.id)),
      ]);
    expect(storedWork[0]).toMatchObject({
      candidateProfileId: profileA.id,
      achievements: ["Reduced repeat tickets"],
    });
    expect(storedEducation[0]?.candidateProfileId).toBe(profileA.id);
    expect(storedProject[0]?.candidateProfileId).toBe(profileA.id);
    expect(storedSkill[0]?.candidateProfileId).toBe(profileA.id);
  });

  it("deletes only owned records and changes the evidence fingerprint", async () => {
    const { deleteCandidateWorkExperienceForVisitor } = await import(
      "@/features/candidate/profile-foundation-service"
    );
    const [work] = await db
      .select()
      .from(schema.candidateWorkExperiences)
      .where(eq(schema.candidateWorkExperiences.candidateProfileId, profileA.id))
      .limit(1);
    if (!work) throw new Error("Expected work history.");
    const fingerprintBefore = profileA.evidenceFingerprint;
    const result = await deleteCandidateWorkExperienceForVisitor(visitorA, {
      id: work.id,
      expectedProfileRevision: profileA.revision,
    });
    profileA = await currentProfile(visitorA);
    expect(result.revision).toBe(profileA.revision);
    expect(profileA.evidenceFingerprint).not.toBe(fingerprintBefore);
    expect(
      await db
        .select()
        .from(schema.candidateWorkExperiences)
        .where(eq(schema.candidateWorkExperiences.id, work.id)),
    ).toHaveLength(0);
  });
});
