import "server-only";

import { and, eq, gt, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  fitScoreRuns,
  jobListings,
  jobRevisions,
} from "@/db/schema";
import { getActiveCandidateProfile } from "@/features/candidate/queries";
import {
  aggregateMarketInsights,
  type MarketInsightJobInput,
} from "@/features/insights/aggregate";

const newerFitScoreRuns = alias(fitScoreRuns, "newer_market_fit_score_runs");

function latestFitForActiveProfile(profile: { id: string; revision: number }) {
  return and(
    eq(fitScoreRuns.candidateProfileId, profile.id),
    sql`json_extract(${fitScoreRuns.candidateSnapshot}, '$.revision') = ${profile.revision}`,
    notExists(
      db
        .select({ id: newerFitScoreRuns.id })
        .from(newerFitScoreRuns)
        .where(
          and(
            eq(newerFitScoreRuns.jobRevisionId, fitScoreRuns.jobRevisionId),
            eq(newerFitScoreRuns.candidateProfileId, profile.id),
            sql`json_extract(${newerFitScoreRuns.candidateSnapshot}, '$.revision') = ${profile.revision}`,
            or(
              gt(newerFitScoreRuns.createdAt, fitScoreRuns.createdAt),
              and(
                eq(newerFitScoreRuns.createdAt, fitScoreRuns.createdAt),
                gt(newerFitScoreRuns.id, fitScoreRuns.id),
              ),
            ),
          ),
        ),
    ),
  );
}

export async function getMarketInsights(
  profileOverride?: { id: string; revision: number; skills: string[] },
) {
  await ensureDatabaseReady();

  const profile = profileOverride ?? (await getActiveCandidateProfile());

  const rows = await db
    .select({
      company: jobRevisions.company,
      fitCoverageBps: fitScoreRuns.coverageBps,
      fitScore: fitScoreRuns.deterministicScore,
      salaryCurrency: jobRevisions.salaryCurrency,
      salaryMaximumCents: jobRevisions.salaryMaximumCents,
      salaryMinimumCents: jobRevisions.salaryMinimumCents,
      salaryPeriod: jobRevisions.salaryPeriod,
      salarySource: jobRevisions.salarySource,
      technologies: jobRevisions.technologies,
      workArrangement: jobRevisions.workArrangement,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(
      fitScoreRuns,
      and(
        eq(fitScoreRuns.jobRevisionId, jobRevisions.id),
        latestFitForActiveProfile(profile),
      ),
    )
    .where(eq(jobListings.lifecycleStatus, "active"));

  const jobs: MarketInsightJobInput[] = rows.map((row) => ({
    company: row.company,
    fitCoveragePercent:
      row.fitCoverageBps === null ? null : row.fitCoverageBps / 100,
    fitScore: row.fitScore,
    salaryCurrency: row.salaryCurrency,
    salaryMaximumCents: row.salaryMaximumCents,
    salaryMinimumCents: row.salaryMinimumCents,
    salaryPeriod: row.salaryPeriod,
    salarySource: row.salarySource,
    technologies: row.technologies,
    workArrangement: row.workArrangement,
  }));

  return {
    ...aggregateMarketInsights({
      candidateSkills: profile.skills,
      jobs,
    }),
    generatedAt: new Date().toISOString(),
  };
}

export type MarketInsightsView = Awaited<ReturnType<typeof getMarketInsights>>;
