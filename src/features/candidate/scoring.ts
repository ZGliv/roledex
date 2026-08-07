import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  fitScoreRuns,
  jobListings,
  jobRevisions,
  portfolioProjects,
  visitorJobStates,
  type CandidateProfile,
  type JobDecision,
  type JobRevision,
} from "@/db/schema";
import { buildFitScoreRun } from "@/features/fit/run-builder";
import { parseJobListing } from "@/features/jobs/parser";
import type {
  EmploymentType,
  ParsedJobListing,
  SalarySource,
} from "@/features/jobs/types";
import { hashValue } from "@/lib/hashing";

const SCORE_INSERT_BATCH_SIZE = 20;
const SCORE_LOOKUP_BATCH_SIZE = 500;
export const VISITOR_SCORE_WINDOW = 100;
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

/** Lazily fills only scores missing for the visitor's current profile revision. */
export async function ensureCurrentFitScoresForProfile(
  profile: CandidateProfile,
) {
  await ensureDatabaseReady();
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  const [persistedRevisions, unseenRevisions] = await Promise.all([
    // A listing revision can change after a visitor saves it. Repair every
    // active workflow item independently so those jobs cannot disappear from
    // Saved while leaving the bounded discovery window untouched.
    db
      .select({ revision: jobRevisions })
      .from(jobListings)
      .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
      .innerJoin(
        visitorJobStates,
        and(
          eq(visitorJobStates.jobListingId, jobListings.id),
          eq(visitorJobStates.visitorId, profile.visitorId),
        ),
      )
      .where(
        inArray(visitorJobStates.currentDecision, [
          ...PERSISTED_SCORE_DECISIONS,
        ]),
      )
      .orderBy(desc(visitorJobStates.updatedAt), desc(jobListings.id)),
    db
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
          eq(jobListings.lifecycleStatus, "active"),
          eq(currentDecision, "unseen"),
        ),
      )
      .orderBy(desc(jobListings.createdAt), desc(jobListings.id))
      .limit(VISITOR_SCORE_WINDOW),
  ]);
  const revisions = [
    ...new Map(
      [...persistedRevisions, ...unseenRevisions].map(({ revision }) => [
        revision.id,
        { revision },
      ]),
    ).values(),
  ];
  const revisionIds = revisions.map(({ revision }) => revision.id);
  const [projects, existingRuns] = await Promise.all([
    db
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.candidateProfileId, profile.id))
      .orderBy(asc(portfolioProjects.name)),
    (async () => {
      const rows: {
        jobRevisionId: string;
        candidateSnapshot: typeof fitScoreRuns.$inferSelect.candidateSnapshot;
        portfolioSnapshot: typeof fitScoreRuns.$inferSelect.portfolioSnapshot;
      }[] = [];
      for (
        let index = 0;
        index < revisionIds.length;
        index += SCORE_LOOKUP_BATCH_SIZE
      ) {
        rows.push(
          ...(await db
            .select({
              jobRevisionId: fitScoreRuns.jobRevisionId,
              candidateSnapshot: fitScoreRuns.candidateSnapshot,
              portfolioSnapshot: fitScoreRuns.portfolioSnapshot,
            })
            .from(fitScoreRuns)
            .where(
              and(
                eq(fitScoreRuns.candidateProfileId, profile.id),
                inArray(
                  fitScoreRuns.jobRevisionId,
                  revisionIds.slice(index, index + SCORE_LOOKUP_BATCH_SIZE),
                ),
              ),
            )),
        );
      }
      return rows;
    })(),
  ]);

  const currentPortfolioHash = hashValue(
    projects.map((project) => JSON.parse(JSON.stringify(project))),
  );
  const scoredRevisionIds = new Set(
    existingRuns
      .filter(
        (run) =>
          run.candidateSnapshot.revision === profile.revision &&
          hashValue(run.portfolioSnapshot) === currentPortfolioHash,
      )
      .map((run) => run.jobRevisionId),
  );
  const scoreRows = revisions.flatMap(({ revision }) => {
    if (scoredRevisionIds.has(revision.id)) return [];
    const scoring = buildFitScoreRun({
      contentHash: revision.contentHash,
      job: parsedJobForRescore(revision),
      jobRevisionId: revision.id,
      profile,
      projects,
    });
    return [{ jobRevisionId: revision.id, ...scoring.values }];
  });

  for (let index = 0; index < scoreRows.length; index += SCORE_INSERT_BATCH_SIZE) {
    await db
      .insert(fitScoreRuns)
      .values(scoreRows.slice(index, index + SCORE_INSERT_BATCH_SIZE))
      .onConflictDoNothing();
  }

  return scoreRows.length;
}
