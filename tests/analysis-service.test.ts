import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-analysis-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let analysisRuns: typeof import("@/db/schema")["analysisRuns"];
let jobId: string;
let buildCurrentJobGauntletInput: typeof import("@/features/analysis/service")["buildCurrentJobGauntletInput"];
let generateManualJobGauntletPrompt: typeof import("@/features/analysis/service")["generateManualJobGauntletPrompt"];
let importManualJobGauntletResponse: typeof import("@/features/analysis/service")["importManualJobGauntletResponse"];
let getJobGauntletHistory: typeof import("@/features/analysis/queries")["getJobGauntletHistory"];
let getLatestPendingJobGauntlet: typeof import("@/features/analysis/queries")["getLatestPendingJobGauntlet"];
let getLatestSuccessfulJobGauntlet: typeof import("@/features/analysis/queries")["getLatestSuccessfulJobGauntlet"];

function validEnvelope(requestId: string, inputHash: string) {
  return {
    schemaVersion: "job-gauntlet.v1",
    requestId,
    inputHash,
    analysis: {
      dayToDaySummary: "Guide customers through technical onboarding, discovery, and troubleshooting.",
      basicFit: {
        score: 7.5,
        rationale: "The role overlaps with technical support and shipped product evidence.",
        evidence: ["Hospital help desk experience", "Published mobile product"],
      },
      stretchLevel: {
        score: 4,
        rationale: "Direct enterprise implementation experience is the main stretch.",
      },
      interviewRisk: "Moderate",
      likelyInterviewFormat: ["behavioral", "customer_simulation"],
      interviewRiskExplanation: "Communication and a customer scenario are plausible interview steps.",
      resumeCredibility: {
        rating: "Needs positioning",
        rationale: "Lead with customer-facing troubleshooting and product delivery.",
      },
      callbackProbability: "Moderate",
      callbackProbabilityExplanation: "The evidence is adjacent, though direct SaaS tenure is limited.",
      careerValue: {
        score: 8,
        rationale: "The role adds implementation, customer, and AI-adjacent experience.",
      },
      compensationValue: {
        rating: "Good",
        rationale: "The posted range clears the candidate's minimum target.",
      },
      strongestMatches: ["Technical troubleshooting", "Product-building evidence"],
      qualificationGaps: ["No direct SaaS implementation title"],
      redFlags: [],
      reasonsNotToApply: ["The employer may screen for prior enterprise implementations."],
      reasonsToApply: ["The support-to-solutions narrative is coherent and evidence-backed."],
      recommendedPortfolioProject: "Parl.ai",
      readinessCategory: "Ready With Positioning",
      recommendedPreparation: ["Prepare a five-minute Parl.ai customer demo"],
      skillSprint: null,
      verdict: "Apply",
      verdictExplanation: "This is a credible growth role with a manageable positioning gap.",
      uncertaintyNotes: ["The interview format is inferred rather than employer-posted."],
    },
  };
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const jobsService = await import("@/features/jobs/service");
  const analysisService = await import("@/features/analysis/service");
  const analysisQueries = await import("@/features/analysis/queries");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  analysisRuns = schemaModule.analysisRuns;
  buildCurrentJobGauntletInput = analysisService.buildCurrentJobGauntletInput;
  generateManualJobGauntletPrompt = analysisService.generateManualJobGauntletPrompt;
  importManualJobGauntletResponse = analysisService.importManualJobGauntletResponse;
  getJobGauntletHistory = analysisQueries.getJobGauntletHistory;
  getLatestPendingJobGauntlet = analysisQueries.getLatestPendingJobGauntlet;
  getLatestSuccessfulJobGauntlet = analysisQueries.getLatestSuccessfulJobGauntlet;

  await migrateDatabase();
  await seedDatabase();
  const created = await jobsService.createManualJob({
    title: "Associate AI Implementation Consultant",
    company: "Example Systems",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceUrl: "https://example.com/careers/ai-implementation-consultant",
    salarySource: "employer_posted",
    descriptionRaw:
      "Example Systems is hiring an Associate AI Implementation Consultant. The role pays $72,000 to $88,000 per year and is remote in the United States. You will onboard customers, configure AI workflows, troubleshoot REST API integrations, run product demos, and document business requirements. One year of technical customer support experience is required. SQL familiarity is preferred.",
  });
  jobId = created.jobId;
});

beforeEach(async () => {
  await db.delete(analysisRuns);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("manual Job Gauntlet persistence", () => {
  it("refreshes an expired saved role after profile changes without reusing stale analysis", async () => {
    const { candidateProfiles, jobListings, visitorJobStates, fitScoreRuns } = await import("@/db/schema");
    const { getJobCardForVisitor } = await import("@/features/jobs/queries");
    const prompt = await generateManualJobGauntletPrompt(jobId);
    const [profile] = await db.select().from(candidateProfiles).limit(1);
    const [listing] = await db.select().from(jobListings).where(eq(jobListings.id, jobId));
    await db.insert(visitorJobStates).values({ visitorId: profile.visitorId, jobListingId: jobId, currentDecision: "applied" });
    await db.update(jobListings).set({ lifecycleStatus: "expired" }).where(eq(jobListings.id, jobId));
    await db.update(candidateProfiles).set({ revision: profile.revision + 1, fingerprint: "updated-resume-evidence" }).where(eq(candidateProfiles.id, profile.id));
    try {
      const card = await getJobCardForVisitor(profile.visitorId, jobId);
      expect(card?.title).toBe("Associate AI Implementation Consultant");
      const input = await buildCurrentJobGauntletInput(jobId);
      expect(input.candidate.revision).toBe(profile.revision + 1);
      expect(input.candidateFingerprint).not.toBe(prompt.candidateFingerprint);
      expect(await getLatestPendingJobGauntlet(jobId)).toBeNull();
      expect(await getLatestSuccessfulJobGauntlet(jobId)).toBeNull();
      const before = (await db.select().from(fitScoreRuns)).length;
      await buildCurrentJobGauntletInput(jobId);
      expect((await db.select().from(fitScoreRuns)).length).toBe(before);
      const [state] = await db.select().from(visitorJobStates).where(eq(visitorJobStates.jobListingId, jobId));
      expect(state.currentDecision).toBe("applied");
      expect((await getJobGauntletHistory(jobId))[0]?.analysisRunId).toBe(prompt.analysisRunId);
    } finally {
      await db.update(candidateProfiles).set({ revision: profile.revision, fingerprint: profile.fingerprint }).where(eq(candidateProfiles.id, profile.id));
      await db.update(jobListings).set({ lifecycleStatus: listing.lifecycleStatus }).where(eq(jobListings.id, jobId));
      await db.delete(visitorJobStates).where(eq(visitorJobStates.jobListingId, jobId));
    }
  });

  it("builds a stable frozen input from the current job and candidate evidence", async () => {
    const first = await buildCurrentJobGauntletInput(jobId);
    const second = await buildCurrentJobGauntletInput(jobId);

    expect(first).toEqual(second);
    expect(first.listingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.candidateFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.job.rawDescription).toContain("configure AI workflows");
    expect(first.candidate.currentRole).toBe("Hospital Help Desk Analyst");
    expect(first.portfolioProjects.map((project) => project.name)).toEqual([
      "Hospital 3D Map",
      "Parl.ai",
      "U-Shop",
    ]);
    expect(first.deterministicAnalysis.scoringVersion).toBeTruthy();
    expect(first.deterministicAnalysis.result).toBeTruthy();
  });

  it("persists one reusable prompt with its frozen request and cache metadata", async () => {
    const created = await generateManualJobGauntletPrompt(jobId);
    const reused = await generateManualJobGauntletPrompt(jobId);

    expect(created.created).toBe(true);
    expect(created.status).toBe("prompt_generated");
    expect(created.prompt).toContain("reasonsNotToApply is mandatory");
    expect(reused.created).toBe(false);
    expect(reused.analysisRunId).toBe(created.analysisRunId);

    const [stored] = await db.select().from(analysisRuns);
    expect(stored.promptText).toBe(created.prompt);
    expect(stored.promptVersion).toBe("manual-job-gauntlet.v1");
    expect(stored.outputSchemaVersion).toBe("job-gauntlet.v1");
    expect(stored.cacheKey).toBe(created.cacheKey);
    expect(stored.request).toMatchObject({
      requestId: created.requestId,
      inputHash: created.inputHash,
      inputSnapshot: {
        listingFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        candidateFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });

    const pending = await getLatestPendingJobGauntlet(jobId);
    expect(pending?.analysisRunId).toBe(created.analysisRunId);
    expect((await getJobGauntletHistory(jobId))[0]).toMatchObject({
      status: "prompt_generated",
      rawResponseAvailable: false,
    });
  });

  it("validates and preserves a pasted response, then exposes success and history", async () => {
    const prompt = await generateManualJobGauntletPrompt(jobId);
    const rawResponse = `\`\`\`json\n${JSON.stringify(
      validEnvelope(prompt.requestId, prompt.inputHash),
    )}\n\`\`\``;
    const imported = await importManualJobGauntletResponse(
      prompt.analysisRunId,
      rawResponse,
    );

    expect(imported.changed).toBe(true);
    expect(imported.analysis.verdict).toBe("Apply");
    expect(await getLatestPendingJobGauntlet(jobId)).toBeNull();
    expect((await getLatestSuccessfulJobGauntlet(jobId))?.analysis.verdict).toBe("Apply");

    const [stored] = await db.select().from(analysisRuns);
    expect(stored.status).toBe("succeeded");
    expect(stored.rawResponse).toBe(rawResponse);
    expect(stored.parsedResponse).toMatchObject({ verdict: "Apply" });
    expect((await getJobGauntletHistory(jobId))[0]).toMatchObject({
      status: "succeeded",
      rawResponseAvailable: true,
      analysis: { verdict: "Apply" },
    });
  });

  it("keeps the prompt retryable when pasted JSON does not match its frozen input", async () => {
    const prompt = await generateManualJobGauntletPrompt(jobId);
    const wrongHashResponse = JSON.stringify(
      validEnvelope(prompt.requestId, "a".repeat(64)),
    );

    await expect(
      importManualJobGauntletResponse(prompt.analysisRunId, wrongHashResponse),
    ).rejects.toThrow("stale");

    const [stored] = await db.select().from(analysisRuns);
    expect(stored.status).toBe("prompt_generated");
    expect(stored.rawResponse).toBeNull();
    expect((await getLatestPendingJobGauntlet(jobId))?.analysisRunId).toBe(
      prompt.analysisRunId,
    );
  });

  it("does not import an analysis run owned by another visitor profile", async () => {
    const prompt = await generateManualJobGauntletPrompt(jobId);
    const { candidateProfiles, visitors } = await import("@/db/schema");
    const [ownerProfile] = await db.select().from(candidateProfiles).limit(1);
    const otherVisitorId = randomUUID();
    const otherProfileId = randomUUID();
    await db.insert(visitors).values({ id: otherVisitorId, kind: "guest" });
    await db.insert(candidateProfiles).values({
      ...ownerProfile,
      id: otherProfileId,
      visitorId: otherVisitorId,
      fingerprint: `${ownerProfile.fingerprint ?? "profile"}-${otherVisitorId}`,
    });
    await db
      .update(analysisRuns)
      .set({ candidateProfileId: otherProfileId })
      .where(eq(analysisRuns.id, prompt.analysisRunId));

    await expect(
      importManualJobGauntletResponse(prompt.analysisRunId, "{}"),
    ).rejects.toThrow("no longer exists");
  });
});
