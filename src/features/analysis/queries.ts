import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import { analysisRuns, jobListings, jobRevisions } from "@/db/schema";
import { JOB_GAUNTLET_SCHEMA_VERSION, JobGauntletAnalysisSchema } from "@/features/analysis/schema";
import {
  buildCurrentJobGauntletInput,
  parsePersistedManualRequest,
  type ManualPromptRun,
} from "@/features/analysis/service";
import { getActiveCandidateProfile } from "@/features/candidate/queries";

const JobIdSchema = z.string().uuid();
const HistoryLimitSchema = z.number().int().min(1).max(100);

export type SuccessfulJobGauntletRun = {
  analysis: ReturnType<typeof JobGauntletAnalysisSchema.parse>;
  analysisRunId: string;
  cacheKey: string;
  candidateFingerprint: string;
  completedAt: string;
  createdAt: string;
  inputHash: string;
  jobId: string;
  jobRevisionId: string;
  promptVersion: string;
  requestId: string;
  schemaVersion: typeof JOB_GAUNTLET_SCHEMA_VERSION;
  status: "succeeded";
};

export type JobGauntletHistoryItem = {
  analysis: ReturnType<typeof JobGauntletAnalysisSchema.parse> | null;
  analysisRunId: string;
  cacheKey: string;
  candidateFingerprint: string;
  completedAt: string | null;
  createdAt: string;
  error: string | null;
  inputHash: string;
  jobRevisionId: string;
  promptVersion: string;
  rawResponseAvailable: boolean;
  requestId: string;
  revisionNumber: number;
  schemaVersion: string;
  status: "prompt_generated" | "running" | "succeeded" | "failed";
};

function pendingRunView(
  run: typeof analysisRuns.$inferSelect,
  jobId: string,
): ManualPromptRun {
  const request = parsePersistedManualRequest(run.request);
  if (run.status !== "prompt_generated" && run.status !== "running") {
    throw new Error("The latest manual request is not pending.");
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

async function currentRunBase(jobId: string) {
  const parsedJobId = JobIdSchema.parse(jobId);
  const [input, profile] = await Promise.all([
    buildCurrentJobGauntletInput(parsedJobId),
    getActiveCandidateProfile(),
  ]);
  await ensureDatabaseReady();
  return {
    parsedJobId,
    candidateFingerprint: input.candidateFingerprint,
    candidateProfileId: profile.id,
  };
}

export async function getLatestPendingJobGauntlet(
  jobId: string,
): Promise<ManualPromptRun | null> {
  const current = await currentRunBase(jobId);
  const [run] = await db
    .select({ run: analysisRuns })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(analysisRuns, eq(analysisRuns.jobRevisionId, jobRevisions.id))
    .where(
      and(
        eq(jobListings.id, current.parsedJobId),
        eq(analysisRuns.analysisType, "job_gauntlet"),
        eq(analysisRuns.provider, "manual"),
        eq(analysisRuns.candidateProfileId, current.candidateProfileId),
        eq(analysisRuns.candidateFingerprint, current.candidateFingerprint),
        inArray(analysisRuns.status, ["prompt_generated", "running"]),
      ),
    )
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  return run ? pendingRunView(run.run, current.parsedJobId) : null;
}

export async function getLatestSuccessfulJobGauntlet(
  jobId: string,
): Promise<SuccessfulJobGauntletRun | null> {
  const current = await currentRunBase(jobId);
  const [row] = await db
    .select({ run: analysisRuns })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(analysisRuns, eq(analysisRuns.jobRevisionId, jobRevisions.id))
    .where(
      and(
        eq(jobListings.id, current.parsedJobId),
        eq(analysisRuns.analysisType, "job_gauntlet"),
        eq(analysisRuns.provider, "manual"),
        eq(analysisRuns.candidateProfileId, current.candidateProfileId),
        eq(analysisRuns.candidateFingerprint, current.candidateFingerprint),
        eq(analysisRuns.status, "succeeded"),
      ),
    )
    .orderBy(desc(analysisRuns.completedAt), desc(analysisRuns.createdAt))
    .limit(1);
  if (!row) return null;

  const request = parsePersistedManualRequest(row.run.request);
  return {
    analysis: JobGauntletAnalysisSchema.parse(row.run.parsedResponse),
    analysisRunId: row.run.id,
    cacheKey: row.run.cacheKey,
    candidateFingerprint: row.run.candidateFingerprint,
    completedAt: (row.run.completedAt ?? row.run.createdAt).toISOString(),
    createdAt: row.run.createdAt.toISOString(),
    inputHash: request.inputHash,
    jobId: current.parsedJobId,
    jobRevisionId: row.run.jobRevisionId,
    promptVersion: row.run.promptVersion,
    requestId: request.requestId,
    schemaVersion: request.schemaVersion,
    status: "succeeded",
  };
}

export async function getJobGauntletHistory(
  jobId: string,
  limit = 20,
): Promise<JobGauntletHistoryItem[]> {
  const parsedJobId = JobIdSchema.parse(jobId);
  const parsedLimit = HistoryLimitSchema.parse(limit);
  const profile = await getActiveCandidateProfile();
  await ensureDatabaseReady();
  const rows = await db
    .select({ run: analysisRuns, revisionNumber: jobRevisions.revisionNumber })
    .from(analysisRuns)
    .innerJoin(jobRevisions, eq(analysisRuns.jobRevisionId, jobRevisions.id))
    .where(
      and(
        eq(jobRevisions.jobListingId, parsedJobId),
        eq(analysisRuns.analysisType, "job_gauntlet"),
        eq(analysisRuns.provider, "manual"),
        eq(analysisRuns.candidateProfileId, profile.id),
      ),
    )
    .orderBy(desc(analysisRuns.createdAt))
    .limit(parsedLimit);

  return rows.map(({ run, revisionNumber }) => {
    const request = parsePersistedManualRequest(run.request);
    return {
      analysis:
        run.status === "succeeded"
          ? JobGauntletAnalysisSchema.parse(run.parsedResponse)
          : null,
      analysisRunId: run.id,
      cacheKey: run.cacheKey,
      candidateFingerprint: run.candidateFingerprint,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      error: run.error,
      inputHash: request.inputHash,
      jobRevisionId: run.jobRevisionId,
      promptVersion: run.promptVersion,
      rawResponseAvailable: run.rawResponse !== null,
      requestId: request.requestId,
      revisionNumber,
      schemaVersion: run.outputSchemaVersion,
      status: run.status,
    };
  });
}
