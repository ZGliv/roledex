import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-search-contract-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const visitorId = randomUUID();
let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let schema: typeof import("@/db/schema");

const RESUME = `
Taylor Candidate
taylor@example.com

PROFESSIONAL EXPERIENCE
Support Analyst | Northstar Health | January 2024 - Present
- Reduced repeat tickets by documenting clinical workflows.
- Used SQL to diagnose reporting issues.

SKILLS
SQL, ServiceNow, Technical Support, Process Documentation

EDUCATION
Example University
Bachelor of Science in Information Systems | 2020 - 2024

PROJECTS
Workflow Console
- Built a TypeScript workflow visibility tool for a real operations team.
`;

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
  await getActiveCandidateProfileForVisitor(visitorId);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

async function currentProfile() {
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

describe.sequential("candidate search contract", () => {
  it("parses a conservative, schema-constrained résumé draft", async () => {
    const { parseResumeImportDraft } = await import(
      "@/features/candidate/resume-import-parser"
    );
    const draft = parseResumeImportDraft(RESUME);
    expect(draft.parserVersion).toBe("resume-deterministic-v1");
    expect(draft.workHistory[0]).toMatchObject({
      company: "Northstar Health",
      isCurrent: true,
      startDate: "2024-01",
      title: "Support Analyst",
    });
    expect(draft.skills.map((skill) => skill.name)).toEqual(
      expect.arrayContaining(["SQL", "ServiceNow"]),
    );
    expect(draft.education[0]?.institution).toBe("Example University");
    expect(draft.projects[0]?.name).toBe("Workflow Console");
  });

  it("persists ordered Ready now and Stretch directions and syncs legacy retrieval", async () => {
    const { CandidateRoleTargetsReplaceSchema } = await import(
      "@/features/candidate/input"
    );
    const { replaceCandidateRoleTargetsForVisitor } = await import(
      "@/features/candidate/search-contract-service"
    );
    let profile = await currentProfile();
    const input = CandidateRoleTargetsReplaceSchema.parse({
      expectedRevision: profile.revision,
      targets: [
        {
          aliases: ["Implementation Analyst"],
          allowedSeniorityLevels: ["entry", "mid"],
          canonicalFamily: "Implementation",
          exclusions: ["Senior", "Requires 4+ years"],
          label: "Implementation specialist / analyst",
          maximumRequiredExperienceYears: 3,
          minimumRequiredExperienceYears: 0,
          priorityRank: 1,
          readiness: "ready_now",
        },
        {
          aliases: ["Junior Solutions Engineer"],
          allowedSeniorityLevels: ["entry", "mid"],
          canonicalFamily: "Associate Solutions",
          exclusions: ["Quota-carrying"],
          label: "Associate solutions consultant / engineer",
          maximumRequiredExperienceYears: 3,
          minimumRequiredExperienceYears: 0,
          priorityRank: 2,
          readiness: "stretch",
        },
      ],
    });
    const result = await replaceCandidateRoleTargetsForVisitor(visitorId, input);
    profile = await currentProfile();
    expect(result.revision).toBe(profile.revision);
    expect(profile.targetRoleFamilies).toEqual([
      "Implementation specialist / analyst",
      "Associate solutions consultant / engineer",
    ]);
    expect(profile.searchContractFingerprint).toMatch(/^[a-f0-9]{64}$/);
    const targets = await db
      .select()
      .from(schema.candidateRoleTargets)
      .where(eq(schema.candidateRoleTargets.candidateProfileId, profile.id))
      .orderBy(schema.candidateRoleTargets.priorityRank);
    expect(targets.map((target) => target.readiness)).toEqual([
      "ready_now",
      "stretch",
    ]);
  });

  it("requires review before importing evidence and deletes raw text by default", async () => {
    const {
      CandidateResumeImportConfirmSchema,
      CandidateResumeImportCreateSchema,
    } = await import("@/features/candidate/input");
    const {
      confirmCandidateResumeImportForVisitor,
      createCandidateResumeImportForVisitor,
    } = await import("@/features/candidate/search-contract-service");
    let profile = await currentProfile();
    const created = await createCandidateResumeImportForVisitor(
      visitorId,
      CandidateResumeImportCreateSchema.parse({
        label: "Primary résumé",
        rawText: RESUME,
        sourceFileName: "resume.txt",
      }),
    );
    expect(created.draft.workHistory).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.candidateWorkExperiences)
        .where(eq(schema.candidateWorkExperiences.candidateProfileId, profile.id)),
    ).toHaveLength(0);

    const result = await confirmCandidateResumeImportForVisitor(
      visitorId,
      CandidateResumeImportConfirmSchema.parse({
        expectedProfileRevision: profile.revision,
        importId: created.importId,
        retainRawSource: false,
        selectedEducationIndexes: [0],
        selectedProjectIndexes: [0],
        selectedSkillIndexes: created.draft.skills.map((_, index) => index),
        selectedWorkIndexes: [0],
      }),
    );
    profile = await currentProfile();
    expect(result.revision).toBe(profile.revision);
    expect(result.imported).toMatchObject({ education: 1, projects: 1, work: 1 });
    expect(profile.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const [resumeImport] = await db
      .select()
      .from(schema.candidateResumeImports)
      .where(eq(schema.candidateResumeImports.id, created.importId));
    expect(resumeImport).toMatchObject({
      rawSourceRetained: false,
      resumeSourceId: null,
      status: "confirmed",
    });
    expect(resumeImport.draftJson).toEqual({
      parserVersion: "resume-deterministic-v1",
      workHistory: [],
      education: [],
      skills: [],
      projects: [],
      warnings: [],
    });
    expect(
      await db
        .select()
        .from(schema.candidateResumeSources)
        .where(eq(schema.candidateResumeSources.candidateProfileId, profile.id)),
    ).toHaveLength(0);
    const skills = await db
      .select()
      .from(schema.candidateSkillEvidence)
      .where(eq(schema.candidateSkillEvidence.candidateProfileId, profile.id));
    expect(skills[0]).toEqual(
      expect.objectContaining({ confidence: expect.any(String), sourceRecordId: created.importId }),
    );
  });

  it("fully removes a discarded résumé draft and its raw source", async () => {
    const { CandidateResumeImportCreateSchema } = await import(
      "@/features/candidate/input"
    );
    const {
      createCandidateResumeImportForVisitor,
      discardCandidateResumeImportForVisitor,
    } = await import("@/features/candidate/search-contract-service");
    const created = await createCandidateResumeImportForVisitor(
      visitorId,
      CandidateResumeImportCreateSchema.parse({
        label: "Discarded résumé",
        rawText: `${RESUME}\nAdditional temporary draft text.`,
        sourceFileName: "discard-me.txt",
      }),
    );
    const [before] = await db
      .select({ resumeSourceId: schema.candidateResumeImports.resumeSourceId })
      .from(schema.candidateResumeImports)
      .where(eq(schema.candidateResumeImports.id, created.importId));
    expect(before?.resumeSourceId).toBeTruthy();

    await discardCandidateResumeImportForVisitor(visitorId, {
      importId: created.importId,
    });
    expect(
      await db
        .select()
        .from(schema.candidateResumeImports)
        .where(eq(schema.candidateResumeImports.id, created.importId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.candidateResumeSources)
        .where(eq(schema.candidateResumeSources.id, before!.resumeSourceId!)),
    ).toHaveLength(0);
  });
});
