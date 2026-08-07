import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  analysisRuns,
  fitScoreRuns,
  jobListings,
  jobRevisions,
  type JsonObject,
} from "@/db/schema";
import type {
  AnalyzeJobInput,
  JsonValue,
  ManualAnalysisRequest,
} from "@/features/analysis/contracts";
import {
  MANUAL_PROMPT_VERSION,
  ManualPromptProvider,
} from "@/features/analysis/manual-provider";
import {
  JOB_GAUNTLET_SCHEMA_VERSION,
  JobGauntletAnalysisSchema,
  type JobGauntletAnalysis,
} from "@/features/analysis/schema";
import { getActiveCandidateContext } from "@/features/candidate/queries";
import { hashValue } from "@/lib/hashing";

const JobIdSchema = z.string().uuid();
const AnalysisRunIdSchema = z.string().uuid();
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const jsonRecordSchema = z.record(z.string(), z.json());

const PersistedManualRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    schemaVersion: z.literal(JOB_GAUNTLET_SCHEMA_VERSION),
    promptVersion: z.literal(MANUAL_PROMPT_VERSION),
    inputHash: sha256Schema,
    listingFingerprint: z.string().min(1),
    candidateFingerprint: sha256Schema,
    createdAt: z.string().datetime(),
    inputSnapshot: z
      .object({
        listingFingerprint: z.string().min(1),
        candidateFingerprint: sha256Schema,
        job: jsonRecordSchema,
        candidate: jsonRecordSchema,
        portfolioProjects: z.array(jsonRecordSchema),
        deterministicAnalysis: jsonRecordSchema,
      })
      .strict(),
  })
  .strict();

export type PersistedManualRequest = z.infer<typeof PersistedManualRequestSchema>;

export type ManualPromptRun = {
  analysisRunId: string;
  cacheKey: string;
  candidateFingerprint: string;
  createdAt: string;
  inputHash: string;
  jobId: string;
  jobRevisionId: string;
  prompt: string;
  promptVersion: typeof MANUAL_PROMPT_VERSION;
  requestId: string;
  schemaVersion: typeof JOB_GAUNTLET_SCHEMA_VERSION;
  status: "prompt_generated" | "running" | "succeeded";
};

export type GenerateManualPromptResult = ManualPromptRun & {
  created: boolean;
};

export type ImportManualAnalysisResult = {
  analysis: JobGauntletAnalysis;
  analysisRunId: string;
  changed: boolean;
  completedAt: string;
  jobId: string;
  status: "succeeded";
};

type CurrentAnalysisContext = {
  candidateProfileId: string;
  input: AnalyzeJobInput;
  jobId: string;
  jobRevisionId: string;
};

function jsonRecord(value: unknown): Record<string, JsonValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, JsonValue>;
}

function dateValue(value: Date | null) {
  return value?.toISOString() ?? null;
}

function candidateSnapshot(
  profile: Awaited<ReturnType<typeof getActiveCandidateContext>>["profile"],
) {
  return jsonRecord({
    id: profile.id,
    revision: profile.revision,
    currentRole: profile.currentRole,
    currentSalaryCents: profile.currentSalaryCents,
    preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: profile.preferredWorkArrangements,
    preferredIndustries: profile.preferredIndustries,
    targetRoleFamilies: profile.targetRoleFamilies,
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    interests: profile.interests,
    education: profile.education,
    skills: profile.skills,
    yearsExperience: profile.yearsExperience,
    location: profile.location,
    relocationPreference: profile.relocationPreference,
    careerGoals: profile.careerGoals,
    interviewConcerns: profile.interviewConcerns,
    dealBreakers: profile.dealBreakers,
  });
}

function projectSnapshots(
  projects: Awaited<ReturnType<typeof getActiveCandidateContext>>["projects"],
) {
  return projects.map((project) =>
    jsonRecord({
      id: project.id,
      name: project.name,
      description: project.description,
      technologies: project.technologies,
      status: project.status,
      liveUrl: project.liveUrl,
      repositoryUrl: project.repositoryUrl,
      appStoreUrl: project.appStoreUrl,
      screenshots: project.screenshots,
      responsibilities: project.responsibilities,
      businessProblem: project.businessProblem,
      userImpact: project.userImpact,
      strongestEvidence: project.strongestEvidence,
      relevantRoleFamilies: project.relevantRoleFamilies,
    }),
  );
}

function jobSnapshot(row: {
  listing: typeof jobListings.$inferSelect;
  revision: typeof jobRevisions.$inferSelect;
}) {
  return jsonRecord({
    id: row.listing.id,
    revisionId: row.revision.id,
    revisionNumber: row.revision.revisionNumber,
    title: row.revision.title,
    company: row.revision.company,
    location: row.revision.location,
    workArrangement: row.revision.workArrangement,
    salary: {
      minimumCents: row.revision.salaryMinimumCents,
      maximumCents: row.revision.salaryMaximumCents,
      currency: row.revision.salaryCurrency,
      period: row.revision.salaryPeriod,
      source: row.revision.salarySource,
    },
    employmentType: row.revision.employmentType,
    source: {
      type: row.revision.sourceType,
      name: row.revision.sourceName,
      url: row.revision.sourceUrl,
      retrievedAt: row.revision.retrievedAt.toISOString(),
    },
    rawDescription: row.revision.rawDescription,
    cleanedDescription: row.revision.cleanedDescription,
    roleSummary: row.revision.roleSummary,
    remoteRestriction: row.revision.remoteRestriction,
    postedAt: dateValue(row.revision.postedAt),
    applicationDeadline: dateValue(row.revision.applicationDeadline),
    seniority: row.revision.seniority,
    yearsExperienceMinimum: row.revision.yearsExperienceMinimum,
    yearsExperienceMaximum: row.revision.yearsExperienceMaximum,
    experienceRequirements: row.revision.experienceRequirements,
    technologies: row.revision.technologies,
    responsibilities: row.revision.responsibilities,
    requiredQualifications: row.revision.requiredQualifications,
    preferredQualifications: row.revision.preferredQualifications,
    benefits: row.revision.benefits,
    travelRequirement: row.revision.travelRequirement,
    industry: row.revision.industry,
    parser: {
      version: row.revision.parserVersion,
      schemaVersion: row.revision.parseSchemaVersion,
      warnings: row.revision.parseWarnings,
      fieldEvidence: row.revision.fieldEvidence,
    },
  });
}

function deterministicSnapshot(fit: typeof fitScoreRuns.$inferSelect) {
  return jsonRecord({
    fitScoreRunId: fit.id,
    inputHash: fit.inputHash,
    scoringVersion: fit.scoringVersion,
    deterministicScore: fit.deterministicScore,
    coverageBps: fit.coverageBps,
    breakdown: fit.breakdown,
    result: fit.result,
    createdAt: fit.createdAt.toISOString(),
  });
}

async function loadCurrentAnalysisContext(rawJobId: string): Promise<CurrentAnalysisContext> {
  const jobId = JobIdSchema.parse(rawJobId);
  await ensureDatabaseReady();
  const { profile, projects } = await getActiveCandidateContext();
  const [row] = await db
    .select({ listing: jobListings, revision: jobRevisions, fit: fitScoreRuns })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(
      fitScoreRuns,
      and(
        eq(fitScoreRuns.jobRevisionId, jobRevisions.id),
        eq(fitScoreRuns.candidateProfileId, profile.id),
      ),
    )
    .where(eq(jobListings.id, jobId))
    .orderBy(desc(fitScoreRuns.createdAt))
    .limit(1);

  if (!row) {
    throw new Error("This job does not have a current fit analysis for the active profile.");
  }
  const currentPortfolioForFit = projects.map(
    (project) => JSON.parse(JSON.stringify(project)) as JsonObject,
  );
  if (
    row.fit.candidateSnapshot.revision !== profile.revision ||
    hashValue(row.fit.portfolioSnapshot) !== hashValue(currentPortfolioForFit)
  ) {
    throw new Error(
      "This job's deterministic fit is stale for the current profile or portfolio evidence.",
    );
  }

  const candidate = candidateSnapshot(profile);
  const portfolioProjects = projectSnapshots(projects);
  const candidateFingerprint = hashValue({ candidate, portfolioProjects });
  const job = jobSnapshot(row);
  const listingFingerprint = hashValue(job);

  return {
    candidateProfileId: profile.id,
    input: {
      listingFingerprint,
      candidateFingerprint,
      job,
      candidate,
      portfolioProjects,
      deterministicAnalysis: deterministicSnapshot(row.fit),
    },
    jobId,
    jobRevisionId: row.revision.id,
  };
}

export async function buildCurrentJobGauntletInput(jobId: string): Promise<AnalyzeJobInput> {
  return (await loadCurrentAnalysisContext(jobId)).input;
}

export function manualJobGauntletCacheKey(inputHash: string) {
  return hashValue({
    analysisType: "job_gauntlet",
    provider: "manual",
    inputHash,
    promptVersion: MANUAL_PROMPT_VERSION,
    outputSchemaVersion: JOB_GAUNTLET_SCHEMA_VERSION,
  });
}

export function parsePersistedManualRequest(value: unknown): PersistedManualRequest {
  return PersistedManualRequestSchema.parse(value);
}

function persistedRequest(
  request: ManualAnalysisRequest,
  inputSnapshot: AnalyzeJobInput,
): PersistedManualRequest {
  return PersistedManualRequestSchema.parse({
    requestId: request.requestId,
    schemaVersion: request.schemaVersion,
    promptVersion: request.promptVersion,
    inputHash: request.inputHash,
    listingFingerprint: request.listingFingerprint,
    candidateFingerprint: request.candidateFingerprint,
    createdAt: request.createdAt,
    inputSnapshot,
  });
}

function manualRequestFromRun(run: typeof analysisRuns.$inferSelect): ManualAnalysisRequest {
  const request = parsePersistedManualRequest(run.request);
  return {
    requestId: request.requestId,
    schemaVersion: request.schemaVersion,
    promptVersion: request.promptVersion,
    inputHash: request.inputHash,
    listingFingerprint: request.listingFingerprint,
    candidateFingerprint: request.candidateFingerprint,
    prompt: run.promptText,
    createdAt: request.createdAt,
  };
}

function promptRunView(
  run: typeof analysisRuns.$inferSelect,
  jobId: string,
): ManualPromptRun {
  const request = parsePersistedManualRequest(run.request);
  if (
    run.status !== "prompt_generated" &&
    run.status !== "running" &&
    run.status !== "succeeded"
  ) {
    throw new Error("The manual analysis run is not reusable.");
  }
  return {
    analysisRunId: run.id,
    cacheKey: run.cacheKey,
    candidateFingerprint: run.candidateFingerprint,
    createdAt: run.createdAt.toISOString(),
    inputHash: request.inputHash,
    jobId,
    jobRevisionId: run.jobRevisionId,
    prompt: run.promptText,
    promptVersion: request.promptVersion,
    requestId: request.requestId,
    schemaVersion: request.schemaVersion,
    status: run.status,
  };
}

async function findReusableRun(context: CurrentAnalysisContext, cacheKey: string) {
  const common = and(
    eq(analysisRuns.analysisType, "job_gauntlet"),
    eq(analysisRuns.jobRevisionId, context.jobRevisionId),
    eq(analysisRuns.candidateProfileId, context.candidateProfileId),
    eq(analysisRuns.candidateFingerprint, context.input.candidateFingerprint),
    eq(analysisRuns.provider, "manual"),
    eq(analysisRuns.cacheKey, cacheKey),
  );
  const [successful] = await db
    .select()
    .from(analysisRuns)
    .where(and(common, eq(analysisRuns.status, "succeeded")))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  if (successful) return successful;

  const [pending] = await db
    .select()
    .from(analysisRuns)
    .where(
      and(
        common,
        inArray(analysisRuns.status, ["prompt_generated", "running"]),
      ),
    )
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  return pending ?? null;
}

export async function generateManualJobGauntletPrompt(
  rawJobId: string,
  provider = new ManualPromptProvider(),
): Promise<GenerateManualPromptResult> {
  const context = await loadCurrentAnalysisContext(rawJobId);
  const request = provider.createAnalysisRequest(context.input);
  const cacheKey = manualJobGauntletCacheKey(request.inputHash);
  const reusable = await findReusableRun(context, cacheKey);
  if (reusable) {
    return { ...promptRunView(reusable, context.jobId), created: false };
  }

  const requestSnapshot = persistedRequest(request, context.input);
  const [run] = await db
    .insert(analysisRuns)
    .values({
      analysisType: "job_gauntlet",
      jobRevisionId: context.jobRevisionId,
      candidateProfileId: context.candidateProfileId,
      candidateFingerprint: context.input.candidateFingerprint,
      provider: "manual",
      modelName: null,
      promptVersion: request.promptVersion,
      outputSchemaVersion: request.schemaVersion,
      cacheKey,
      status: "prompt_generated",
      request: requestSnapshot as unknown as JsonObject,
      promptText: request.prompt,
      createdAt: new Date(request.createdAt),
    })
    .returning();

  return { ...promptRunView(run, context.jobId), created: true };
}

export async function importManualJobGauntletResponse(
  rawAnalysisRunId: string,
  rawResponse: string,
  provider = new ManualPromptProvider(),
): Promise<ImportManualAnalysisResult> {
  const analysisRunId = AnalysisRunIdSchema.parse(rawAnalysisRunId);
  await ensureDatabaseReady();
  const [row] = await db
    .select({ run: analysisRuns, revision: jobRevisions })
    .from(analysisRuns)
    .innerJoin(jobRevisions, eq(analysisRuns.jobRevisionId, jobRevisions.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);

  if (!row || row.run.analysisType !== "job_gauntlet" || row.run.provider !== "manual") {
    throw new Error("The manual Job Gauntlet request no longer exists.");
  }

  const { profile } = await getActiveCandidateContext();
  if (row.run.candidateProfileId !== profile.id) {
    throw new Error("The manual Job Gauntlet request no longer exists.");
  }

  if (row.run.status === "succeeded") {
    const analysis = JobGauntletAnalysisSchema.parse(row.run.parsedResponse);
    return {
      analysis,
      analysisRunId: row.run.id,
      changed: false,
      completedAt: (row.run.completedAt ?? row.run.createdAt).toISOString(),
      jobId: row.revision.jobListingId,
      status: "succeeded",
    };
  }
  if (row.run.status !== "prompt_generated") {
    throw new Error("This manual Job Gauntlet request cannot accept a response.");
  }

  const current = await loadCurrentAnalysisContext(row.revision.jobListingId);
  if (
    current.jobRevisionId !== row.run.jobRevisionId ||
    current.candidateProfileId !== row.run.candidateProfileId ||
    current.input.candidateFingerprint !== row.run.candidateFingerprint
  ) {
    throw new Error("This analysis request is stale because the job or candidate evidence changed.");
  }

  const request = manualRequestFromRun(row.run);
  const analysis = provider.importAnalysisResponse(request, rawResponse);
  const completedAt = new Date();
  const [updated] = await db
    .update(analysisRuns)
    .set({
      status: "succeeded",
      rawResponse,
      parsedResponse: analysis as unknown as JsonObject,
      error: null,
      startedAt: row.run.startedAt ?? row.run.createdAt,
      completedAt,
    })
    .where(
      and(
        eq(analysisRuns.id, row.run.id),
        eq(analysisRuns.status, "prompt_generated"),
      ),
    )
    .returning();

  if (!updated) {
    throw new Error("The analysis request changed while the response was being imported.");
  }

  return {
    analysis,
    analysisRunId: updated.id,
    changed: true,
    completedAt: completedAt.toISOString(),
    jobId: row.revision.jobListingId,
    status: "succeeded",
  };
}
