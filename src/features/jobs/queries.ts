import "server-only";

import { cache } from "react";

import { and, count, desc, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  fitScoreRuns,
  jobDecisionEvents,
  jobListings,
  jobRevisions,
  jobSources,
  sourceSightings,
  type JobDecision,
  visitorJobStates,
} from "@/db/schema";
import { requireVisitorId } from "@/features/auth/visitor";
import { getActiveCandidateContextForVisitor } from "@/features/candidate/queries";
import type { DeterministicFitResult, FitVerdict } from "@/features/fit/types";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { readinessLabel } from "@/features/jobs/service";
import {
  buildPreferenceModel,
  rankPersonalizedJobs,
  type PreferenceObservation,
  type RankedPersonalization,
} from "@/features/personalization/rank-jobs";
import {
  salaryPresentationForJob,
  type SalaryConfidence,
  type SalaryPresentation,
} from "@/features/salary/presentation";
import { formatDate, formatMoney, titleCaseToken } from "@/lib/format";

const newerFitScoreRuns = alias(fitScoreRuns, "newer_fit_score_runs");

function latestFitForProfile(profile: { id: string; revision: number }) {
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

/**
 * Saved and historical roles outlive the live discovery window. Prefer the
 * highest profile revision that was actually scored for the role, then the
 * newest run within that revision. This deliberately allows a saved role to
 * retain its last known fit after it expires and is no longer rescored.
 */
function latestAvailableFitForProfile(profileId: string) {
  const fitProfileRevision = sql<number>`cast(json_extract(${fitScoreRuns.candidateSnapshot}, '$.revision') as integer)`;
  const newerFitProfileRevision = sql<number>`cast(json_extract(${newerFitScoreRuns.candidateSnapshot}, '$.revision') as integer)`;

  return and(
    eq(fitScoreRuns.candidateProfileId, profileId),
    notExists(
      db
        .select({ id: newerFitScoreRuns.id })
        .from(newerFitScoreRuns)
        .where(
          and(
            eq(newerFitScoreRuns.jobRevisionId, fitScoreRuns.jobRevisionId),
            eq(newerFitScoreRuns.candidateProfileId, profileId),
            or(
              gt(newerFitProfileRevision, fitProfileRevision),
              and(
                eq(newerFitProfileRevision, fitProfileRevision),
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
        ),
    ),
  );
}

function verdictLabel(verdict: FitVerdict): JobCardViewModel["verdict"] {
  if (verdict === "strong_apply") return "Strong Apply";
  if (verdict === "apply") return "Apply";
  if (verdict === "apply_as_stretch") return "Apply as a Stretch";
  if (verdict === "learn_first") return "Learn First";
  if (verdict === "skip") return "Skip";
  return "Save for Later";
}

function workArrangementLabel(value: string): JobCardViewModel["workArrangement"] {
  if (value === "remote") return "Remote";
  if (value === "hybrid") return "Hybrid";
  if (value === "on_site") return "On-site";
  return "Unclear";
}

function nonEmptyReasons(reasons: string[], fallback: string): readonly [string, ...string[]] {
  const cleaned = reasons.map((reason) => reason.trim()).filter(Boolean);
  return (cleaned.length > 0 ? cleaned : [fallback]) as [string, ...string[]];
}

type CurrentJobRow = {
  currentDecision: JobDecision;
  fit: typeof fitScoreRuns.$inferSelect;
  listing: typeof jobListings.$inferSelect;
  revision: typeof jobRevisions.$inferSelect;
};

function salaryForRevision(revision: typeof jobRevisions.$inferSelect) {
  return salaryPresentationForJob({
    company: revision.company,
    title: revision.title,
    location: revision.location,
    workArrangement: revision.workArrangement,
    seniority: revision.seniority,
    salaryMinimumCents: revision.salaryMinimumCents,
    salaryMaximumCents: revision.salaryMaximumCents,
    salaryCurrency: revision.salaryCurrency,
    salaryPeriod: revision.salaryPeriod,
    salarySource: revision.salarySource,
    sourceUrl: revision.sourceUrl,
  });
}

export interface JobCardSalaryContext {
  salaryConfidence: SalaryConfidence;
  salaryDisclosure: string;
  salaryMethod: string;
  salaryBenchmarkOccupation: string | null;
  salarySourceName: string;
  salarySourceUrl: string | null;
  salaryModelVersion: SalaryPresentation["modelVersion"];
  salaryIsEstimate: boolean;
  salaryAnnualMinimumCents: number;
  salaryAnnualMaximumCents: number;
}

export interface JobCardPersonalizationContext {
  /** Personalized ranking score on a 0–100 scale, not an interview probability. */
  personalizationScore: number;
  /** Bounded point adjustment applied to deterministic profile fit for ordering. */
  personalizationAdjustment: number;
  personalizationReasons: readonly string[];
  personalizationSignalCount: number;
  personalizationModelVersion: string;
  isExploration: boolean;
}

export type EnrichedJobCardViewModel = JobCardViewModel &
  JobCardSalaryContext &
  JobCardPersonalizationContext;

type CandidateContext = Awaited<
  ReturnType<typeof getActiveCandidateContextForVisitor>
>;

function normalizedTokens(value: string) {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^a-z0-9+#.]+/)
      .filter((token) => token.length >= 2),
  );
}

function matchingProject(
  revision: typeof jobRevisions.$inferSelect,
  context: CandidateContext,
) {
  const listingTokens = normalizedTokens(
    [revision.title, ...revision.technologies].join(" "),
  );

  let strongest:
    | { overlap: string[]; project: CandidateContext["projects"][number] }
    | undefined;

  for (const project of context.projects) {
    const overlap = Array.from(
      normalizedTokens(
        [project.name, ...project.technologies, ...project.relevantRoleFamilies].join(
          " ",
        ),
      ),
    ).filter((token) => listingTokens.has(token));
    if (!strongest || overlap.length > strongest.overlap.length) {
      strongest = { overlap, project };
    }
  }

  return strongest && strongest.overlap.length > 0 ? strongest : null;
}

function buildDecisionBrief(
  row: CurrentJobRow,
  result: DeterministicFitResult,
  salary: SalaryPresentation,
  context: CandidateContext,
): NonNullable<JobCardViewModel["decisionBrief"]> {
  const currentSalary = context.profile.currentSalaryCents;
  const preferredWork = context.profile.preferredWorkArrangements.includes(
    row.revision.workArrangement,
  );
  const projectMatch = matchingProject(row.revision, context);
  const edge =
    result.strongestMatches[0]?.message ??
    result.reasonsToApply[0] ??
    "The role overlaps with at least one direction in your profile.";
  const risk =
    result.qualificationGaps[0]?.message ??
    result.reasonsNotToApply[0] ??
    "The listing leaves important requirements unclear.";

  let payDelta: string | null = null;
  if (currentSalary > 0) {
    if (salary.annualMinimumCents > currentSalary) {
      payDelta = `${formatMoney(
        salary.annualMinimumCents - currentSalary,
      )}+ above your current pay`;
    } else if (salary.annualMaximumCents < currentSalary) {
      payDelta = `${formatMoney(
        currentSalary - salary.annualMaximumCents,
      )} below your current pay at the top of the range`;
    } else {
      payDelta = "Pay overlaps your current compensation";
    }
  }

  const workSignal =
    preferredWork && row.revision.workArrangement !== "unclear"
      ? `${workArrangementLabel(row.revision.workArrangement).toLocaleLowerCase()} matches your preferred setup`
      : null;
  const opportunity =
    [payDelta, workSignal].filter(Boolean).join(" · ") || edge;
  const projectEvidence = projectMatch
    ? (projectMatch.project.strongestEvidence[0] ?? projectMatch.project.description)
        .trim()
        .replace(/[.!?]+$/, "")
    : null;
  const positioningMove = projectMatch
    ? `Lead with ${projectMatch.project.name}: ${projectEvidence}.`
    : result.reasonsToApply.find((reason) => reason !== edge) ??
      context.profile.strengths[0] ??
      "Lead with the closest proof from your current work and shipped projects.";

  return {
    confidence:
      result.scoreCoverage >= 0.75
        ? "high"
        : result.scoreCoverage >= 0.5
          ? "medium"
          : "low",
    edge,
    opportunity,
    positioningMove,
    risk,
  };
}

function rowToJobCard(
  row: CurrentJobRow,
  personalization?: RankedPersonalization,
  context?: CandidateContext,
): EnrichedJobCardViewModel {
  const result = row.fit.result as unknown as DeterministicFitResult;
  const careerValue = result.components.find((component) => component.key === "careerValue");
  const salary = salaryForRevision(row.revision);
  const summary =
    row.revision.roleSummary?.trim() ||
    row.revision.cleanedDescription?.split(/\n\n|(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 520) ||
    "The listing does not include a clear role summary.";

  return {
    id: row.listing.id,
    title: row.revision.title,
    company: row.revision.company,
    location: row.revision.location ?? "Location not listed",
    workArrangement: workArrangementLabel(row.revision.workArrangement),
    salaryDisplay: salary.display,
    salarySource:
      salary.source === "employer_posted"
        ? "employer_posted"
        : "externally_estimated",
    annualSalaryEstimateCents: salary.annualMidpointCents,
    salaryConfidence: salary.confidence,
    salaryDisclosure: salary.disclosure,
    salaryMethod: salary.method,
    salaryBenchmarkOccupation: salary.benchmarkOccupation,
    salarySourceName: salary.sourceName,
    salarySourceUrl: salary.sourceUrl,
    salaryModelVersion: salary.modelVersion,
    salaryIsEstimate: salary.isEstimate,
    salaryAnnualMinimumCents: salary.annualMinimumCents,
    salaryAnnualMaximumCents: salary.annualMaximumCents,
    currentDecision: row.currentDecision,
    employmentType: row.revision.employmentType
      ? titleCaseToken(row.revision.employmentType)
      : "Not specified",
    sourceName: row.revision.sourceName ?? titleCaseToken(row.revision.sourceType),
    sourceUrl: row.revision.sourceUrl,
    datePosted: row.revision.postedAt ? formatDate(row.revision.postedAt) : null,
    summary,
    responsibilities: row.revision.responsibilities,
    requiredQualifications: row.revision.requiredQualifications,
    preferredQualifications: row.revision.preferredQualifications,
    technologies: row.revision.technologies,
    travelRequirement: row.revision.travelRequirement,
    seniority: row.revision.seniority ? titleCaseToken(row.revision.seniority) : null,
    applicationDeadline: row.revision.applicationDeadline
      ? formatDate(row.revision.applicationDeadline)
      : null,
    deterministicFitScore: result.fitScoreOutOfTen,
    deterministicFitCoverage: Math.round(result.scoreCoverage * 100),
    stretchScore: result.stretchScore,
    careerValueScore: (careerValue?.effectiveScore ?? 50) / 10,
    verdict: verdictLabel(result.verdict),
    verdictExplanation: result.verdictExplanation,
    readiness: readinessLabel(result.readiness),
    strongestMatches: result.strongestMatches.map((item) => item.message),
    biggestGaps: result.qualificationGaps.map((item) => item.message),
    reasonsNotToApply: nonEmptyReasons(
      result.reasonsNotToApply,
      "The listing leaves too much important information unknown to justify an application yet.",
    ),
    reasonsToApply: nonEmptyReasons(
      result.reasonsToApply,
      "The role title overlaps with at least one stated target lane, but stronger evidence is needed.",
    ),
    warnings: [
      ...row.revision.parseWarnings,
      ...(row.revision.remoteRestriction
        ? [`Remote restriction: ${row.revision.remoteRestriction}`]
        : []),
    ],
    scoreBreakdown: result.components.map((component) => ({
      id: component.key,
      label: component.label,
      score: component.effectiveScore / 10,
      weightPercent: component.weight,
      coveragePercent: component.coverage * 100,
      note: component.rationale,
    })),
    decisionBrief: context
      ? buildDecisionBrief(row, result, salary, context)
      : undefined,
    personalizationScore:
      personalization?.personalizationScore ?? result.deterministicFitScore,
    personalizationAdjustment:
      personalization?.personalizationAdjustment ?? 0,
    personalizationReasons:
      personalization?.personalizationReasons ?? [
        "Ranked from the current profile fit",
      ],
    personalizationSignalCount:
      personalization?.personalizationSignalCount ?? 0,
    personalizationModelVersion:
      personalization?.personalizationModelVersion ?? "profile-fit-only",
    isExploration: personalization?.isExploration ?? false,
  };
}

async function loadCurrentRows(
  visitorId: string,
  profile: { id: string; revision: number },
  decisions?: readonly JobDecision[],
  limit = 80,
) {
  await ensureDatabaseReady();
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  return db
    .select({
      listing: jobListings,
      revision: jobRevisions,
      fit: fitScoreRuns,
      currentDecision,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .leftJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(
      and(
        latestFitForProfile(profile),
        eq(jobListings.lifecycleStatus, "active"),
        decisions
          ? inArray(currentDecision, [...decisions])
          : undefined,
      ),
    )
    .orderBy(
      desc(fitScoreRuns.deterministicScore),
      desc(jobListings.createdAt),
      desc(jobListings.id),
    )
    .limit(limit);
}

async function loadPersistedRows(
  visitorId: string,
  profileId: string,
  decisions: readonly JobDecision[],
  limit = 250,
) {
  await ensureDatabaseReady();
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  return db
    .select({
      listing: jobListings,
      revision: jobRevisions,
      fit: fitScoreRuns,
      currentDecision,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .innerJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(
      and(
        latestAvailableFitForProfile(profileId),
        inArray(visitorJobStates.currentDecision, [...decisions]),
      ),
    )
    .orderBy(
      desc(fitScoreRuns.deterministicScore),
      desc(jobListings.createdAt),
      desc(jobListings.id),
    )
    .limit(limit);
}

const PREFERENCE_DECISIONS = [
  "saved",
  "skipped",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "rejected",
  "offer",
] as const satisfies readonly JobDecision[];

async function loadPreferenceObservations(
  visitorId: string,
): Promise<PreferenceObservation[]> {
  const latestDecisionEvents = db
    .select({
      jobListingId: jobDecisionEvents.jobListingId,
      observedAt: sql<number>`max(${jobDecisionEvents.decidedAt})`.as(
        "latest_decision_at",
      ),
    })
    .from(jobDecisionEvents)
    .where(eq(jobDecisionEvents.visitorId, visitorId))
    .groupBy(jobDecisionEvents.jobListingId)
    .as("latest_preference_decisions");
  const rows = await db
    .select({
      jobId: jobListings.id,
      title: jobRevisions.title,
      company: jobRevisions.company,
      location: jobRevisions.location,
      workArrangement: jobRevisions.workArrangement,
      decision: visitorJobStates.currentDecision,
      observedAt: latestDecisionEvents.observedAt,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(
      latestDecisionEvents,
      eq(jobListings.id, latestDecisionEvents.jobListingId),
    )
    .innerJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(inArray(visitorJobStates.currentDecision, [...PREFERENCE_DECISIONS]))
    .orderBy(desc(latestDecisionEvents.observedAt), desc(jobListings.id))
    .limit(400);

  return rows.map((row) => ({
    ...row,
    observedAt: new Date(row.observedAt),
  }));
}

async function buildPersonalizedDeck(limit = 400) {
  await ensureDatabaseReady();
  const visitorId = await requireVisitorId();
  const context = await getActiveCandidateContextForVisitor(visitorId);
  const { profile } = context;
  const [rows, observations] = await Promise.all([
    loadCurrentRows(visitorId, profile, ["unseen"], limit),
    loadPreferenceObservations(visitorId),
  ]);
  const model = buildPreferenceModel(observations, {
    profileRevision: profile.revision,
    profileUpdatedAt: profile.updatedAt,
  });
  const ranked = rankPersonalizedJobs(
    rows.map((row) => {
      const salary = salaryForRevision(row.revision);
      return {
        jobId: row.listing.id,
        title: row.revision.title,
        company: row.revision.company,
        location: row.revision.location,
        workArrangement: row.revision.workArrangement,
        deterministicFitScoreOutOf100: row.fit.deterministicScore,
        postedAt: row.revision.postedAt,
        discoveredAt: row.listing.createdAt,
        marketSalaryIsEstimate: salary.isEstimate,
        marketSalaryConfidence: salary.confidence,
        marketSalaryAnnualMinimumCents: salary.annualMinimumCents,
        marketSalaryAnnualMaximumCents: salary.annualMaximumCents,
        preferredSalaryMinimumAnnualCents:
          profile.preferredSalaryMinimumCents,
        preferredSalaryTargetAnnualCents:
          profile.preferredSalaryTargetCents,
      };
    }),
    model,
  );
  const rowsById = new Map(rows.map((row) => [row.listing.id, row]));
  const jobs = ranked.flatMap((personalization) => {
    const row = rowsById.get(personalization.jobId);
    return row ? [rowToJobCard(row, personalization, context)] : [];
  });

  return { jobs, model, profileRevision: profile.revision };
}

interface DeckCursor {
  version: 1;
  profileRevision: number;
  afterJobId: string;
}

function encodeDeckCursor(cursor: DeckCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeDeckCursor(value: string | null | undefined): DeckCursor | null {
  if (!value || value.length > 1_000) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<DeckCursor>;
    if (
      parsed.version !== 1 ||
      !Number.isSafeInteger(parsed.profileRevision) ||
      typeof parsed.afterJobId !== "string" ||
      parsed.afterJobId.length === 0 ||
      parsed.afterJobId.length > 100
    ) {
      return null;
    }
    return parsed as DeckCursor;
  } catch {
    return null;
  }
}

export interface DeckJobCardsPageOptions {
  cursor?: string | null;
  limit?: number;
}

/**
 * Cursor-friendly personalized slice for incremental deck prefetching. If the
 * profile or unseen set changes under a cursor, it safely restarts from the top
 * of the newly ranked remaining jobs instead of skipping unseen work.
 */
export async function getDeckJobCardsPage(
  options: DeckJobCardsPageOptions = {},
) {
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 25)));
  const deck = await buildPersonalizedDeck();
  const cursor = decodeDeckCursor(options.cursor);
  const matchingCursor =
    cursor && cursor.profileRevision === deck.profileRevision ? cursor : null;
  const cursorIndex = matchingCursor
    ? deck.jobs.findIndex((job) => job.id === matchingCursor.afterJobId)
    : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const jobs = deck.jobs.slice(start, start + limit);
  const hasMore = start + jobs.length < deck.jobs.length;
  const lastJob = jobs.at(-1);

  return {
    jobs,
    hasMore,
    nextCursor:
      hasMore && lastJob
        ? encodeDeckCursor({
            version: 1,
            profileRevision: deck.profileRevision,
            afterJobId: lastJob.id,
          })
        : null,
    profileRevision: deck.profileRevision,
    personalizationSignalCount: deck.model.signalCount,
    personalizationModelVersion: deck.model.version,
    totalAvailable: deck.jobs.length,
    cursorReset: Boolean(options.cursor && cursorIndex < 0),
  };
}

export async function getDeckJobCards() {
  const deck = await buildPersonalizedDeck();
  return deck.jobs.slice(0, 100);
}

export async function getSavedJobCards() {
  const visitorId = await requireVisitorId();
  const context = await getActiveCandidateContextForVisitor(visitorId);
  const { profile } = context;
  const rows = await loadPersistedRows(
    visitorId,
    profile.id,
    [
      "saved",
      "stretch",
      "learn_first",
      "apply",
      "applied",
      "interview",
      "rejected",
      "offer",
      "archived",
    ],
    250,
  );
  return rows.map((row) => rowToJobCard(row, undefined, context));
}

export const getJobCard = cache(async function getJobCard(jobId: string) {
  await ensureDatabaseReady();
  const visitorId = await requireVisitorId();
  const context = await getActiveCandidateContextForVisitor(visitorId);
  const { profile } = context;
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  const [row] = await db
    .select({
      listing: jobListings,
      revision: jobRevisions,
      fit: fitScoreRuns,
      currentDecision,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .leftJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(
      and(
        eq(jobListings.id, jobId),
        latestAvailableFitForProfile(profile.id),
      ),
    )
    .orderBy(desc(fitScoreRuns.createdAt), desc(fitScoreRuns.id))
    .limit(1);

  return row ? rowToJobCard(row, undefined, context) : null;
});

export async function getJobWorkspaceStats() {
  await ensureDatabaseReady();
  const visitorId = await requireVisitorId();
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  const rows = await db
    .select({
      count: count(),
      decision: currentDecision,
    })
    .from(jobListings)
    .leftJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(eq(jobListings.lifecycleStatus, "active"))
    .groupBy(currentDecision);
  const counts: Record<JobDecision, number> = {
    unseen: 0,
    saved: 0,
    skipped: 0,
    stretch: 0,
    learn_first: 0,
    apply: 0,
    applied: 0,
    interview: 0,
    rejected: 0,
    offer: 0,
    archived: 0,
  };
  rows.forEach((row) => {
    counts[row.decision] = row.count;
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return {
    total,
    reviewed: total - counts.unseen,
    saved: counts.saved + counts.apply + counts.applied,
    stretch: counts.stretch,
    skipped: counts.skipped,
    counts,
  };
}

export async function getRawJobDescription(jobId: string) {
  await ensureDatabaseReady();
  const [row] = await db
    .select({ rawDescription: jobRevisions.rawDescription })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .where(eq(jobListings.id, jobId))
    .limit(1);
  return row?.rawDescription ?? null;
}

export async function getJobDossierSource(jobId: string) {
  await ensureDatabaseReady();
  const [row] = await db
    .select({
      benefits: jobRevisions.benefits,
      canonicalListingUrl: sourceSightings.canonicalUrl,
      company: jobRevisions.company,
      companyDomain: jobSources.companyDomain,
      descriptionRaw: jobRevisions.rawDescription,
      experienceRequirements: jobRevisions.experienceRequirements,
      firstSeenAt: sourceSightings.firstSeenAt,
      industry: jobRevisions.industry,
      lastSeenAt: sourceSightings.lastSeenAt,
      parserVersion: jobRevisions.parserVersion,
      remoteRestriction: jobRevisions.remoteRestriction,
      retrievedAt: jobRevisions.retrievedAt,
      revisionNumber: jobRevisions.revisionNumber,
      sourceUpdatedAt: sourceSightings.sourceUpdatedAt,
      sourceUrl: jobRevisions.sourceUrl,
      yearsExperienceMaximum: jobRevisions.yearsExperienceMaximum,
      yearsExperienceMinimum: jobRevisions.yearsExperienceMinimum,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(sourceSightings, eq(sourceSightings.jobListingId, jobListings.id))
    .leftJoin(jobSources, eq(sourceSightings.jobSourceId, jobSources.id))
    .where(eq(jobListings.id, jobId))
    .orderBy(desc(sourceSightings.lastSeenAt))
    .limit(1);

  if (!row) return null;

  return {
    company: row.company,
    listing: {
      benefits: row.benefits,
      canonicalListingUrl: row.canonicalListingUrl ?? row.sourceUrl,
      companyDomain: row.companyDomain,
      descriptionRaw: row.descriptionRaw,
      experienceRequirements: row.experienceRequirements,
      firstSeenAt: row.firstSeenAt?.toISOString() ?? null,
      industry: row.industry,
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      parserVersion: row.parserVersion,
      remoteRestriction: row.remoteRestriction,
      retrievedAt: row.retrievedAt.toISOString(),
      revisionNumber: row.revisionNumber,
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      yearsExperienceMaximum: row.yearsExperienceMaximum,
      yearsExperienceMinimum: row.yearsExperienceMinimum,
    },
  };
}

export async function getJobDecisionHistory(jobId: string) {
  await ensureDatabaseReady();
  const visitorId = await requireVisitorId();
  const rows = await db
    .select({
      id: jobDecisionEvents.id,
      previousDecision: jobDecisionEvents.previousDecision,
      decision: jobDecisionEvents.decision,
      note: jobDecisionEvents.note,
      decidedAt: jobDecisionEvents.decidedAt,
    })
    .from(jobDecisionEvents)
    .where(
      and(
        eq(jobDecisionEvents.visitorId, visitorId),
        eq(jobDecisionEvents.jobListingId, jobId),
      ),
    )
    .orderBy(desc(jobDecisionEvents.decidedAt))
    .limit(50);

  return rows.map((row) => ({
    ...row,
    decidedAt: row.decidedAt.toISOString(),
  }));
}

export type JobDecisionHistoryItem = Awaited<
  ReturnType<typeof getJobDecisionHistory>
>[number];
