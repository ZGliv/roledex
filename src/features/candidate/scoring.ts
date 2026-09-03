import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  notExists,
  notInArray,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  candidateRoleTargets,
  candidateSkillEvidence,
  fitScoreRuns,
  jobListings,
  jobRevisions,
  portfolioProjects,
  visitorJobStates,
  type CandidateProfile,
  type JobDecision,
  type JobRevision,
} from "@/db/schema";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { buildFitScoreRun } from "@/features/fit/run-builder";
import { parseJobListing } from "@/features/jobs/parser";
import type {
  EmploymentType,
  ParsedJobListing,
  SalarySource,
} from "@/features/jobs/types";

const SCORE_INSERT_BATCH_SIZE = 20;
/** Maximum revisions selected and scored by one internal database batch. */
export const VISITOR_SCORE_BATCH_SIZE = 100;
/**
 * Bounds one request to a catalog-sized repair while still covering the
 * current production inventory in a single normal page render. If a future
 * catalog exceeds this ceiling, the returned coverage reports what remains
 * and the next request resumes from the still-missing rows instead of
 * repeatedly selecting the newest jobs.
 */
export const VISITOR_SCORE_MAX_BATCHES_PER_CALL = 10;
const PERSISTED_SCORE_DECISIONS = [
  "saved",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "rejected",
  "offer",
] as const satisfies readonly JobDecision[];
const currentFitScoreRuns = alias(fitScoreRuns, "current_fit_score_runs");
const EMPLOYMENT_TYPES = new Set<EmploymentType>([
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "seasonal",
  "unknown",
]);

function storedSalarySource(source: JobRevision["salarySource"]): SalarySource {
  if (source === "external_estimate") return "externally_estimated";
  return source;
}

function storedEmploymentType(value: string | null): EmploymentType | null {
  return value && EMPLOYMENT_TYPES.has(value as EmploymentType)
    ? (value as EmploymentType)
    : null;
}

/** Rehydrates scorer input from an immutable revision without writing to it. */
export function parsedJobForRescore(revision: JobRevision): ParsedJobListing {
  const parsed = parseJobListing({
    title: revision.title,
    company: revision.company,
    descriptionRaw: revision.rawDescription,
    location: revision.location,
    salarySourceHint: storedSalarySource(revision.salarySource),
  });
  const hasStoredSalary =
    revision.salaryMinimumCents !== null || revision.salaryMaximumCents !== null;
  const employmentType = storedEmploymentType(revision.employmentType);

  return {
    ...parsed,
    warnings: hasStoredSalary
      ? parsed.warnings.filter(
          (warning) => !/No reliable base salary was found/i.test(warning),
        )
      : parsed.warnings,
    salary: hasStoredSalary
      ? {
          ...parsed.salary,
          minimumCents: revision.salaryMinimumCents,
          maximumCents: revision.salaryMaximumCents,
          currency: revision.salaryCurrency,
          period: revision.salaryPeriod,
          source: storedSalarySource(revision.salarySource),
          confidence: revision.salarySource === "unknown" ? "medium" : "high",
          derived: false,
        }
      : parsed.salary,
    workArrangement:
      revision.workArrangement === "unclear"
        ? parsed.workArrangement
        : {
            ...parsed.workArrangement,
            value: revision.workArrangement,
            confidence: "high",
          },
    employmentType: employmentType
      ? {
          ...parsed.employmentType,
          value: employmentType,
          confidence: "high",
        }
      : parsed.employmentType,
  };
}

export interface CurrentFitScoreCoverage {
  /** True when every eligible current revision has a current score. */
  complete: boolean;
  /** Current workflow rows still awaiting repair after this call. */
  pendingPersistedJobs: number;
  /** Active unseen rows still awaiting repair after this call. */
  pendingUnseenJobs: number;
  /** Rows this call actually inserted; concurrent no-op conflicts are excluded. */
  scoredJobs: number;
}

export interface CurrentFitScoreEnsureOptions {
  /** Test/maintenance override, clamped to the production safety ceiling. */
  maxBatches?: number;
}

type ScoreQueue = "persisted" | "unseen";

function missingCurrentScore(profile: CandidateProfile) {
  const snapshotRevision = sql<number>`cast(json_extract(${currentFitScoreRuns.candidateSnapshot}, '$.revision') as integer)`;
  const snapshotFingerprint = sql<string>`coalesce(json_extract(${currentFitScoreRuns.candidateSnapshot}, '$.fingerprint'), '')`;
  return notExists(
    db
      .select({ id: currentFitScoreRuns.id })
      .from(currentFitScoreRuns)
      .where(
        and(
          eq(currentFitScoreRuns.jobRevisionId, jobRevisions.id),
          eq(currentFitScoreRuns.candidateProfileId, profile.id),
          eq(currentFitScoreRuns.scoringVersion, FIT_SCORING_VERSION),
          eq(snapshotRevision, profile.revision),
          eq(snapshotFingerprint, profile.fingerprint ?? ""),
        ),
      ),
  );
}

function scoreQueueCondition(queue: ScoreQueue) {
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  return queue === "unseen"
    ? and(
        eq(jobListings.lifecycleStatus, "active"),
        eq(currentDecision, "unseen"),
      )
    : inArray(visitorJobStates.currentDecision, [
        ...PERSISTED_SCORE_DECISIONS,
      ]);
}

async function loadMissingScoreBatch(
  profile: CandidateProfile,
  queue: ScoreQueue,
  attemptedRevisionIds: ReadonlySet<string>,
) {
  const attempted = [...attemptedRevisionIds];
  const query = db
    .select({ revision: jobRevisions })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, profile.visitorId),
      ),
    )
    .where(
      and(
        scoreQueueCondition(queue),
        missingCurrentScore(profile),
        attempted.length > 0
          ? notInArray(jobRevisions.id, attempted)
          : undefined,
      ),
    );

  return queue === "unseen"
    ? query
        .orderBy(desc(jobListings.createdAt), desc(jobListings.id))
        .limit(VISITOR_SCORE_BATCH_SIZE)
    : query
        .orderBy(desc(visitorJobStates.updatedAt), desc(jobListings.id))
        .limit(VISITOR_SCORE_BATCH_SIZE);
}

async function countMissingScores(
  profile: CandidateProfile,
  queue: ScoreQueue,
) {
  const [result] = await db
    .select({ value: count() })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, profile.visitorId),
      ),
    )
    .where(
      and(scoreQueueCondition(queue), missingCurrentScore(profile)),
    );
  return result?.value ?? 0;
}

async function loadCandidateScoringEvidence(profile: CandidateProfile) {
  const [projects, roleTargets, skillEvidence] = await Promise.all([
    db
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.candidateProfileId, profile.id))
      .orderBy(asc(portfolioProjects.name)),
    db
      .select()
      .from(candidateRoleTargets)
      .where(eq(candidateRoleTargets.candidateProfileId, profile.id))
      .orderBy(asc(candidateRoleTargets.priorityRank)),
    db
      .select()
      .from(candidateSkillEvidence)
      .where(eq(candidateSkillEvidence.candidateProfileId, profile.id))
      .orderBy(asc(candidateSkillEvidence.name)),
  ]);
  return { projects, roleTargets, skillEvidence };
}

async function scoreMissingRevisionBatch(
  profile: CandidateProfile,
  revisions: Awaited<ReturnType<typeof loadMissingScoreBatch>>,
  evidence: Awaited<ReturnType<typeof loadCandidateScoringEvidence>>,
) {
  const scoreRows = revisions.map(({ revision }) => {
    const scoring = buildFitScoreRun({
      contentHash: revision.contentHash,
      job: parsedJobForRescore(revision),
      jobRevisionId: revision.id,
      profile,
      projects: evidence.projects,
      roleTargets: evidence.roleTargets,
      skillEvidence: evidence.skillEvidence,
    });
    return { jobRevisionId: revision.id, ...scoring.values };
  });
  let insertedCount = 0;
  for (
    let index = 0;
    index < scoreRows.length;
    index += SCORE_INSERT_BATCH_SIZE
  ) {
    const inserted = await db
      .insert(fitScoreRuns)
      .values(scoreRows.slice(index, index + SCORE_INSERT_BATCH_SIZE))
      .onConflictDoNothing()
      .returning({ id: fitScoreRuns.id });
    insertedCount += inserted.length;
  }
  return insertedCount;
}

/**
 * Repairs at most one unseen scoring batch for an interactive feed request.
 * Saved/workflow rows deliberately retain their latest available score, so
 * probing that second queue on every page view only spends read quota without
 * improving the visible deck.
 */
export async function repairCurrentFitScoresForInteractiveRequest(
  profile: CandidateProfile,
): Promise<void> {
  await ensureDatabaseReady();
  const revisions = await loadMissingScoreBatch(
    profile,
    "unseen",
    new Set(),
  );
  if (revisions.length === 0) return;
  await scoreMissingRevisionBatch(
    profile,
    revisions,
    await loadCandidateScoringEvidence(profile),
  );
}

/**
 * Lazily repairs current scores in bounded 100-row reads and 20-row inserts.
 * Missing rows are selected directly, so each batch advances beyond already
 * scored jobs instead of repeatedly trapping older unseen jobs behind the
 * newest 100. The default ten-batch ceiling covers 1,000 current rows in one
 * normal request and returns any remainder explicitly for a subsequent call.
 */
export async function ensureCurrentFitScoresForProfile(
  profile: CandidateProfile,
  options: CurrentFitScoreEnsureOptions = {},
): Promise<CurrentFitScoreCoverage> {
  await ensureDatabaseReady();
  const requestedBatches = Number.isSafeInteger(options.maxBatches)
    ? options.maxBatches!
    : VISITOR_SCORE_MAX_BATCHES_PER_CALL;
  const maxBatches = Math.min(
    VISITOR_SCORE_MAX_BATCHES_PER_CALL,
    Math.max(1, Math.trunc(requestedBatches)),
  );
  const attemptedRevisionIds = new Set<string>();
  let evidence:
    | Awaited<ReturnType<typeof loadCandidateScoringEvidence>>
    | undefined;
  let batches = 0;
  let scoredJobs = 0;

  // Discovery coverage comes first. Persisted workflow rows are repaired with
  // any remaining budget and are also retained by their last available score.
  for (const queue of ["unseen", "persisted"] as const) {
    while (batches < maxBatches) {
      const revisions = await loadMissingScoreBatch(
        profile,
        queue,
        attemptedRevisionIds,
      );
      if (revisions.length === 0) break;
      batches += 1;
      for (const { revision } of revisions) {
        attemptedRevisionIds.add(revision.id);
      }
      evidence ??= await loadCandidateScoringEvidence(profile);
      scoredJobs += await scoreMissingRevisionBatch(
        profile,
        revisions,
        evidence,
      );
    }
  }

  const [pendingUnseenJobs, pendingPersistedJobs] = await Promise.all([
    countMissingScores(profile, "unseen"),
    countMissingScores(profile, "persisted"),
  ]);
  return {
    complete: pendingUnseenJobs === 0 && pendingPersistedJobs === 0,
    pendingPersistedJobs,
    pendingUnseenJobs,
    scoredJobs,
  };
}
