import "server-only";

import { cache } from "react";

import { and, count, desc, eq, gt, inArray, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  fitScoreRuns,
  feedSessions,
  jobDecisionEvents,
  jobFeatureSnapshots,
  jobListings,
  jobRevisions,
  jobSources,
  sourceSightings,
  type JobDecision,
  visitorJobStates,
} from "@/db/schema";
import { requireVisitorId } from "@/features/auth/visitor";
import {
  getActiveCandidateContextForVisitor,
  getActiveCandidateProfileRecordForVisitor,
} from "@/features/candidate/queries";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { ensureCurrentFitScoreForJob } from "@/features/candidate/scoring";
import type { DeterministicFitResult, FitVerdict } from "@/features/fit/types";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { readinessLabel } from "@/features/jobs/service";
import {
  JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
  JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  type JobFeatureSnapshot,
} from "@/features/jobs/feature-snapshot";
import { backfillJobFeatureSnapshots } from "@/features/jobs/feature-snapshot-store";
import {
  MATERIALIZED_FEED_QUEUE_SIZE,
  latestFeedCatalogCheckpoint,
  readFreshlyMaterializedFeedPage,
  readMaterializedFeedPage,
  recordFeedPageSession,
  replaceMaterializedFeedQueue,
} from "@/features/jobs/feed-queue-store";
import {
  classifyFeedAdmission,
  classifyNearMatchFallback,
  type FeedAdmissionDecision,
  type FeedAdmissionReason,
  type FeedAdmissionReasonCode,
  type FeedAdmissionLane,
  type NearMatchFallbackDecision,
  type NearMatchFallbackReasonCode,
} from "@/features/personalization/feed-admission";
import {
  buildPreferenceModel,
  rankPersonalizedJobs,
  summarizePreferenceModel,
  type LearnedPreferenceSummary,
  type PreferenceObservation,
  type RankedPersonalization,
} from "@/features/personalization/rank-jobs";
import { listPreferenceOverridesForVisitor } from "@/features/personalization/preference-overrides";
import {
  FOR_YOU_RECOMMENDER_VERSION,
  buildForYouQueue,
  type ForYouRecommendation,
  type ForYouTier,
} from "@/features/personalization/recommender-v2";
import {
  salaryPresentationForJob,
  type SalaryConfidence,
  type SalaryPresentation,
} from "@/features/salary/presentation";
import { formatDate, formatMoney, titleCaseToken } from "@/lib/format";

const newerFitScoreRuns = alias(fitScoreRuns, "newer_fit_score_runs");
const eventJobRevisions = alias(jobRevisions, "event_job_revisions");

/**
 * A score input hash already includes the immutable job revision, profile
 * revision, and profile fingerprint. The unique profile/input/version index
 * therefore guarantees a single row for this exact scoring input.
 *
 * The old predicate still ran a correlated "newer score" anti-query for every
 * candidate row. On a remote SQLite database that turned a few hundred feed
 * rows into quadratic row reads. Match the exact current scoring snapshot
 * instead. Migration 0009 adds a compound profile/version/revision lookup
 * index, leaving only the small current-profile slice to inspect.
 */
function latestFitForProfile(profile: {
  fingerprint: string | null;
  id: string;
  revision: number;
}) {
  return and(
    eq(fitScoreRuns.candidateProfileId, profile.id),
    eq(fitScoreRuns.scoringVersion, FIT_SCORING_VERSION),
    sql`cast(json_extract(${fitScoreRuns.candidateSnapshot}, '$.revision') as integer) = ${profile.revision}`,
    sql`coalesce(json_extract(${fitScoreRuns.candidateSnapshot}, '$.fingerprint'), '') = ${profile.fingerprint ?? ""}`,
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
  const fitVersionPriority = sql<number>`case when ${fitScoreRuns.scoringVersion} = ${FIT_SCORING_VERSION} then 1 else 0 end`;
  const newerFitVersionPriority = sql<number>`case when ${newerFitScoreRuns.scoringVersion} = ${FIT_SCORING_VERSION} then 1 else 0 end`;

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
                  gt(newerFitVersionPriority, fitVersionPriority),
                  and(
                    eq(newerFitVersionPriority, fitVersionPriority),
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
  currentDecisionEventId: string | null;
  featureSnapshot: typeof jobFeatureSnapshots.$inferSelect | null;
  fit: typeof fitScoreRuns.$inferSelect;
  listing: typeof jobListings.$inferSelect;
  revision: typeof jobRevisions.$inferSelect;
};

function currentFeatureSnapshot(row: CurrentJobRow) {
  if (
    !row.featureSnapshot ||
    row.featureSnapshot.schemaVersion !==
      JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION ||
    row.featureSnapshot.extractorVersion !==
      JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION
  ) {
    return undefined;
  }
  return row.featureSnapshot.snapshot as unknown as JobFeatureSnapshot;
}

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

export const JOB_FEED_LANES = ["matches", "explore"] as const;
export type DeckFeedLane = (typeof JOB_FEED_LANES)[number];
export const DEFAULT_JOB_FEED_LANE: DeckFeedLane = "matches";
export type DeckFeedMode = DeckFeedLane | "near_matches" | "for_you";

export const JOB_FEED_TIERS = [
  "ready_now",
  "credible_stretch",
  "discovery",
] as const;
export type JobFeedTier = ForYouTier;
export type JobEvidenceConfidence = "high" | "medium" | "low";

export interface JobCardAdmissionContext {
  /** Internal admission provenance retained for detail and diagnostics. */
  feedLane: DeckFeedMode | "blocked";
  /** Human-facing placement in the single For You feed. */
  feedTier: JobFeedTier | "blocked";
  evidenceConfidence: JobEvidenceConfidence;
  whyItFits: string;
  biggestRisk: string;
  admissionReasonCodes: readonly FeedAdmissionReasonCode[];
  admissionReasons: readonly FeedAdmissionReason[];
  nearMatchReasonCode: NearMatchFallbackReasonCode | null;
  nearMatchExplanation: string | null;
}

export interface ProfileFeedImpactCounts {
  matches: number;
  explore: number;
  blocked: number;
  totalUnseen: number;
}

export interface ProfileFeedExclusion {
  /** Stable identifier suitable for filtering or a future profile deep link. */
  key: `exclusion:${FeedAdmissionReasonCode}`;
  code: FeedAdmissionReasonCode;
  label: string;
  count: number;
}

export interface ProfileFeedImpact {
  profileRevision: number;
  counts: ProfileFeedImpactCounts;
  topExclusions: readonly ProfileFeedExclusion[];
  learnedPreferences: LearnedPreferenceSummary;
}

export type EnrichedJobCardViewModel = JobCardViewModel &
  JobCardSalaryContext &
  JobCardPersonalizationContext &
  JobCardAdmissionContext & {
    /** Durable visitor-scoped impression that preceded any learnable action. */
    feedExposureId: string | null;
    /** Stable position in the current materialized queue. */
    feedQueuePosition?: number;
  };

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
  context: CandidateContext,
  personalization?: RankedPersonalization,
  admission?: FeedAdmissionDecision,
  feedMode?: DeckFeedMode,
  nearMatch?: NearMatchFallbackDecision,
  recommendation?: ForYouRecommendation,
): EnrichedJobCardViewModel {
  const result = row.fit.result as unknown as DeterministicFitResult;
  const salary = salaryForRevision(row.revision);
  const resolvedAdmission =
    admission ??
    classifyFeedAdmission({
      profile: context.profile,
      revision: row.revision,
      fit: result,
      salaryPresentation: salary,
    });
  const careerValue = result.components.find((component) => component.key === "careerValue");
  const decisionBrief = buildDecisionBrief(row, result, salary, context);
  const summary =
    row.revision.roleSummary?.trim() ||
    row.revision.cleanedDescription?.split(/\n\n|(?<=[.!?])\s+/).slice(0, 2).join(" ").slice(0, 520) ||
    "The listing does not include a clear role summary.";

  return {
    id: row.listing.id,
    feedExposureId: null,
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
    currentDecisionEventId: row.currentDecisionEventId,
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
    featureSnapshot: currentFeatureSnapshot(row),
    decisionBrief,
    personalizationScore:
      recommendation?.score ??
      personalization?.personalizationScore ??
      result.deterministicFitScore,
    personalizationAdjustment:
      personalization?.personalizationAdjustment ?? 0,
    personalizationReasons:
      recommendation
        ? [
            recommendation.positiveReason,
            ...(personalization?.personalizationReasons ?? []),
          ]
        : personalization?.personalizationReasons ?? [
            "Ranked from the current profile fit",
          ],
    personalizationSignalCount:
      personalization?.personalizationSignalCount ?? 0,
    personalizationModelVersion:
      recommendation?.modelVersion ??
      personalization?.personalizationModelVersion ??
      "profile-fit-only",
    isExploration:
      recommendation?.tier === "discovery" ||
      (personalization?.isExploration ?? false),
    feedLane:
      feedMode === "near_matches"
        ? "near_matches"
        : admissionLaneToFeedLane(resolvedAdmission.lane),
    feedTier:
      recommendation?.tier ??
      (feedMode === "near_matches"
        ? "discovery"
        : resolvedAdmission.lane === "primary"
          ? "ready_now"
          : resolvedAdmission.lane === "explore"
            ? "credible_stretch"
            : "blocked"),
    evidenceConfidence: decisionBrief.confidence,
    whyItFits:
      recommendation?.positiveReason ??
      (decisionBrief.opportunity || decisionBrief.edge),
    biggestRisk:
      recommendation?.riskReason ??
      (feedMode === "near_matches" && nearMatch?.explanation
        ? nearMatch.explanation
        : decisionBrief.risk),
    admissionReasonCodes: resolvedAdmission.reasonCodes,
    admissionReasons: resolvedAdmission.reasons,
    nearMatchReasonCode:
      feedMode === "near_matches" ? (nearMatch?.reasonCode ?? null) : null,
    nearMatchExplanation:
      feedMode === "near_matches" ? (nearMatch?.explanation ?? null) : null,
  };
}

function admissionLaneToFeedLane(
  lane: FeedAdmissionLane,
): JobCardAdmissionContext["feedLane"] {
  if (lane === "primary") return "matches";
  return lane;
}

type ClassifiedCurrentRow = {
  admission: FeedAdmissionDecision;
  nearMatch: NearMatchFallbackDecision;
  row: CurrentJobRow;
  salary: SalaryPresentation;
};

function classifyCurrentRows(
  rows: readonly CurrentJobRow[],
  context: CandidateContext,
): ClassifiedCurrentRow[] {
  return rows.map((row) => {
    const salary = salaryForRevision(row.revision);
    const input = {
      profile: context.profile,
      revision: row.revision,
      fit: row.fit.result as unknown as DeterministicFitResult,
      salaryPresentation: salary,
    };
    const admission = classifyFeedAdmission(input);
    return {
      admission,
      nearMatch: classifyNearMatchFallback(input, admission),
      row,
      salary,
    };
  });
}

function admissionCountsForRows(
  rows: readonly ClassifiedCurrentRow[],
): Omit<ProfileFeedImpactCounts, "totalUnseen"> {
  return rows.reduce(
    (counts, item) => {
      if (item.admission.lane === "primary") counts.matches += 1;
      else counts[item.admission.lane] += 1;
      return counts;
    },
    { matches: 0, explore: 0, blocked: 0 },
  );
}

const EXCLUSION_PRIORITY: readonly FeedAdmissionReasonCode[] = [
  "target_roles_missing",
  "title_excluded",
  "company_excluded",
  "industry_excluded",
  "geography_incompatible",
  "work_arrangement_incompatible",
  "employment_type_incompatible",
  "authorization_incompatible",
  "travel_limit_exceeded",
  "salary_missing_hidden",
  "salary_below_floor",
  "seniority_outside_targets",
  "seniority_above_scope",
  "required_experience_gap_too_large",
  "required_experience_gap_outside_explore",
  "role_outside_targets",
  "role_match_unresolved",
  "eligibility_ineligible",
  "verdict_skip",
];

const EXCLUSION_LABELS: Partial<
  Readonly<Record<FeedAdmissionReasonCode, string>>
> = {
  target_roles_missing: "Target roles need to be set",
  title_excluded: "Title matches your exclusions",
  company_excluded: "Company is on your exclusion list",
  industry_excluded: "Industry is on your exclusion list",
  geography_incompatible: "Location requirements do not fit",
  work_arrangement_incompatible: "Work mode is outside your preferences",
  employment_type_incompatible: "Employment type is not accepted",
  authorization_incompatible: "Authorization or sponsorship does not fit",
  travel_limit_exceeded: "Travel exceeds your limit",
  salary_missing_hidden: "Employer-posted salary is required",
  salary_below_floor: "Posted pay is below your floor",
  seniority_outside_targets: "Seniority is outside your selected levels",
  seniority_above_scope: "Seniority is above your current scope",
  required_experience_gap_too_large: "Required experience is too far ahead",
  required_experience_gap_outside_explore:
    "Required experience exceeds the Stretch range",
  role_outside_targets: "Role is outside your targets",
  role_match_unresolved: "Role fit cannot be confirmed",
  eligibility_ineligible: "A confirmed eligibility requirement conflicts",
  verdict_skip: "The current fit assessment says skip",
};

function primaryExclusionCode(
  admission: FeedAdmissionDecision,
): FeedAdmissionReasonCode | null {
  const blockerCodes = new Set(
    admission.reasons
      .filter((reason) => reason.kind === "blocker")
      .map((reason) => reason.code),
  );
  if (blockerCodes.size === 0) return null;
  return (
    EXCLUSION_PRIORITY.find((code) => blockerCodes.has(code)) ??
    [...blockerCodes].sort()[0] ??
    null
  );
}

function topExclusionsForRows(
  rows: readonly ClassifiedCurrentRow[],
  limit = 5,
): ProfileFeedExclusion[] {
  const counts = new Map<FeedAdmissionReasonCode, number>();
  for (const item of rows) {
    if (item.admission.lane !== "blocked") continue;
    const code = primaryExclusionCode(item.admission);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({
      key: `exclusion:${code}` as const,
      code,
      label: EXCLUSION_LABELS[code] ?? "A profile constraint is not met",
      count,
    }))
    .sort((left, right) => {
      if (left.count !== right.count) return right.count - left.count;
      const leftPriority = EXCLUSION_PRIORITY.indexOf(left.code);
      const rightPriority = EXCLUSION_PRIORITY.indexOf(right.code);
      return (
        (leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority) -
          (rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority) ||
        left.code.localeCompare(right.code)
      );
    })
    .slice(0, Math.max(0, Math.trunc(limit)));
}

async function loadCurrentRows(
  visitorId: string,
  profile: { fingerprint: string | null; id: string; revision: number },
  decisions?: readonly JobDecision[],
  limit?: number,
) {
  await ensureDatabaseReady();
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  const query = db
    .select({
      listing: jobListings,
      revision: jobRevisions,
      fit: fitScoreRuns,
      featureSnapshot: jobFeatureSnapshots,
      currentDecision,
      currentDecisionEventId: visitorJobStates.currentDecisionEventId,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .leftJoin(
      jobFeatureSnapshots,
      and(
        eq(jobFeatureSnapshots.jobRevisionId, jobRevisions.id),
        eq(
          jobFeatureSnapshots.schemaVersion,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
        ),
        eq(
          jobFeatureSnapshots.extractorVersion,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ),
      ),
    )
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
    );
  return typeof limit === "number" ? query.limit(limit) : query;
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
      featureSnapshot: jobFeatureSnapshots,
      currentDecision,
      currentDecisionEventId: visitorJobStates.currentDecisionEventId,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .leftJoin(
      jobFeatureSnapshots,
      and(
        eq(jobFeatureSnapshots.jobRevisionId, jobRevisions.id),
        eq(
          jobFeatureSnapshots.schemaVersion,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
        ),
        eq(
          jobFeatureSnapshots.extractorVersion,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ),
      ),
    )
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

export async function loadPreferenceObservationsForVisitor(
  visitorId: string,
): Promise<PreferenceObservation[]> {
  const rows = await db
    .select({
      jobId: jobListings.id,
      currentDecision: visitorJobStates.currentDecision,
      decision: jobDecisionEvents.decision,
      previousDecision: jobDecisionEvents.previousDecision,
      observedAt: jobDecisionEvents.decidedAt,
      reasonCodes: jobDecisionEvents.reasonCodes,
      currentRevision: {
        title: jobRevisions.title,
        company: jobRevisions.company,
        location: jobRevisions.location,
        workArrangement: jobRevisions.workArrangement,
        industry: jobRevisions.industry,
        salaryMinimumCents: jobRevisions.salaryMinimumCents,
        salaryMaximumCents: jobRevisions.salaryMaximumCents,
        salaryCurrency: jobRevisions.salaryCurrency,
        salaryPeriod: jobRevisions.salaryPeriod,
        seniority: jobRevisions.seniority,
        yearsExperienceMinimum: jobRevisions.yearsExperienceMinimum,
        yearsExperienceMaximum: jobRevisions.yearsExperienceMaximum,
      },
      eventRevision: {
        title: eventJobRevisions.title,
        company: eventJobRevisions.company,
        location: eventJobRevisions.location,
        workArrangement: eventJobRevisions.workArrangement,
        industry: eventJobRevisions.industry,
        salaryMinimumCents: eventJobRevisions.salaryMinimumCents,
        salaryMaximumCents: eventJobRevisions.salaryMaximumCents,
        salaryCurrency: eventJobRevisions.salaryCurrency,
        salaryPeriod: eventJobRevisions.salaryPeriod,
        seniority: eventJobRevisions.seniority,
        yearsExperienceMinimum: eventJobRevisions.yearsExperienceMinimum,
        yearsExperienceMaximum: eventJobRevisions.yearsExperienceMaximum,
      },
    })
    .from(jobDecisionEvents)
    .innerJoin(
      jobListings,
      eq(jobDecisionEvents.jobListingId, jobListings.id),
    )
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .leftJoin(
      eventJobRevisions,
      eq(jobDecisionEvents.jobRevisionId, eventJobRevisions.id),
    )
    .innerJoin(
      visitorJobStates,
      and(
        eq(visitorJobStates.jobListingId, jobListings.id),
        eq(visitorJobStates.visitorId, visitorId),
      ),
    )
    .where(
      and(
        eq(jobDecisionEvents.visitorId, visitorId),
        inArray(visitorJobStates.currentDecision, [...PREFERENCE_DECISIONS]),
        eq(jobDecisionEvents.decision, visitorJobStates.currentDecision),
        // Preserve pre-rollout history, but once durable sessions exist only
        // an event linked to an exposure is eligible to teach the recommender.
        sql`${jobDecisionEvents.feedExposureId} is not null or ${jobDecisionEvents.decidedAt} < coalesce((select min(${feedSessions.startedAt}) from ${feedSessions} where ${feedSessions.visitorId} = ${visitorId}), 9223372036854775807)`,
      ),
    )
    // The timestamp is millisecond precision. The id tie-breaker does not
    // imply chronology (events use UUIDs), but it makes equal-time reads
    // deterministic while the epoch logic below finds the actual transition.
    .orderBy(desc(jobDecisionEvents.decidedAt), desc(jobDecisionEvents.id))
    .limit(2_000);

  const rowsByJob = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = rowsByJob.get(row.jobId) ?? [];
    group.push(row);
    rowsByJob.set(row.jobId, group);
  }

  return [...rowsByJob.entries()].slice(0, 400).map(([jobId, events]) => {
    const transition = events.find(
      (event) => event.previousDecision !== event.decision,
    );
    const revision =
      transition?.eventRevision ??
      events[0]?.eventRevision ??
      events[0]?.currentRevision;
    const latestEvent = events[0];
    if (!revision || !latestEvent) {
      throw new Error(`Preference history for ${jobId} is incomplete.`);
    }
    const epochStartedAt = transition?.observedAt.getTime() ?? 0;
    const epochEvents = events.filter(
      (event) => event.observedAt.getTime() >= epochStartedAt,
    );
    const reasonCodes = [
      ...new Set(
        epochEvents.flatMap((event) => event.reasonCodes),
      ),
    ];
    const preferenceEvent =
      epochEvents.find((event) => event.reasonCodes.length > 0) ??
      transition ??
      latestEvent;
    const annualMultiplier =
      revision.salaryPeriod === "hour"
        ? 2_080
        : revision.salaryPeriod === "month"
          ? 12
          : 1;
    const hasComparableSalary = revision.salaryCurrency === "USD";

    return {
      jobId,
      title: revision.title,
      company: revision.company,
      location: revision.location,
      workArrangement: revision.workArrangement,
      decision: latestEvent.currentDecision,
      // Notes belong in the immutable event history, but must not make an old
      // swipe look like newly supplied preference feedback.
      observedAt: preferenceEvent.observedAt,
      reasonCodes,
      industry: revision.industry,
      salaryAnnualMinimumCents:
        hasComparableSalary && revision.salaryMinimumCents !== null
          ? revision.salaryMinimumCents * annualMultiplier
          : null,
      salaryAnnualMaximumCents:
        hasComparableSalary && revision.salaryMaximumCents !== null
          ? revision.salaryMaximumCents * annualMultiplier
          : null,
      seniority: revision.seniority,
      yearsExperienceMinimum: revision.yearsExperienceMinimum,
      yearsExperienceMaximum: revision.yearsExperienceMaximum,
    };
  });
}

export function resolveDeckFeedMode(
  requestedLane: DeckFeedLane,
  counts: Pick<ProfileFeedImpactCounts, "matches" | "explore">,
  nearMatchCount: number,
): DeckFeedMode {
  return requestedLane === "matches" &&
    counts.matches === 0 &&
    counts.explore === 0 &&
    nearMatchCount > 0
    ? "near_matches"
    : requestedLane;
}

export function resolveInitialDeckFeedLane(
  requestedLane: DeckFeedLane | undefined,
  counts: Pick<ProfileFeedImpactCounts, "matches" | "explore">,
  nearMatchCount = 0,
): DeckFeedLane {
  // An explicit tab choice always wins. Automatic fallback is only for the
  // initial unscoped page load, so the UI never bounces away from a tab the
  // user deliberately selected.
  if (requestedLane) return requestedLane;

  const preferredLane = DEFAULT_JOB_FEED_LANE;
  const alternateLane = preferredLane === "matches" ? "explore" : "matches";

  // A lane is a presentation choice, not an admission boundary. If the
  // requested lane has no qualified cards, open the other qualified lane
  // immediately instead of making the user pass through an empty-state CTA.
  // Both counts are produced after the same hard-filter classification.
  if (counts[preferredLane] === 0 && counts[alternateLane] > 0) {
    return alternateLane;
  }

  // Near Matches are rendered only through the Matches mode, after their own
  // bounded fallback classifier has preserved the non-negotiable filters.
  if (
    counts.matches === 0 &&
    counts.explore === 0 &&
    nearMatchCount > 0
  ) {
    return "matches";
  }

  return preferredLane;
}

async function loadPersonalizedDeckBaseForVisitor(visitorId: string) {
  await ensureDatabaseReady();
  // Ingestion persists all new/changed revisions. This bounded cold-path pass
  // only upgrades active legacy rows, and becomes a no-op after the first run.
  await backfillJobFeatureSnapshots({ currentOnly: true });
  const context = await getActiveCandidateContextForVisitor(visitorId);
  const { profile } = context;
  const [rows, observations, preferenceOverrides] = await Promise.all([
    // Admission must see the complete unseen inventory. A pre-admission cap
    // lets high-scoring blocked rows starve otherwise eligible cards.
    loadCurrentRows(visitorId, profile, ["unseen"]),
    loadPreferenceObservationsForVisitor(visitorId),
    listPreferenceOverridesForVisitor(visitorId),
  ]);
  const model = buildPreferenceModel(observations, {
    profileRevision: profile.revision,
    profileUpdatedAt: profile.updatedAt,
    preferenceOverrides,
  });
  const classifiedRows = classifyCurrentRows(rows, context);
  const admissionCounts = admissionCountsForRows(classifiedRows);
  const nearMatchCount = classifiedRows.filter(
    (item) => item.nearMatch.eligible,
  ).length;

  return {
    admissionCounts,
    classifiedRows,
    context,
    model,
    nearMatchCount,
    profile,
  };
}

async function loadPersonalizedDeckBase() {
  return loadPersonalizedDeckBaseForVisitor(await requireVisitorId());
}

function clampRecommendationComponent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function fitComponentScore(
  result: DeterministicFitResult,
  key: DeterministicFitResult["components"][number]["key"],
  fallback: number,
) {
  const component = result.components.find((item) => item.key === key);
  return clampRecommendationComponent(
    component?.rawScore ?? component?.effectiveScore ?? fallback,
  );
}

function opportunityQualityForRow(
  item: ClassifiedCurrentRow,
  now = Date.now(),
) {
  const features = currentFeatureSnapshot(item.row);
  const timestamp = new Date(
    features?.freshness.postedAt ??
      features?.freshness.retrievedAt ??
      item.row.revision.postedAt ??
      item.row.listing.createdAt,
  ).getTime();
  const ageDays = Number.isFinite(timestamp)
    ? Math.max(0, (now - timestamp) / 86_400_000)
    : 30;
  const freshness =
    ageDays <= 3 ? 100 : ageDays <= 7 ? 88 : ageDays <= 14 ? 72 : ageDays <= 30 ? 54 : 35;
  const featureSalary = features?.compensation;
  const salaryQuality = featureSalary
    ? featureSalary.source === "employer_posted"
      ? 100
      : featureSalary.confidence === "high"
        ? 72
        : featureSalary.confidence === "medium"
          ? 58
          : 42
    : item.salary.isEstimate
      ? item.salary.confidence === "high"
        ? 72
        : item.salary.confidence === "medium"
          ? 58
          : 42
      : 100;
  const extractionQuality =
    features?.extractionConfidence === "high"
      ? 100
      : features?.extractionConfidence === "medium"
        ? 70
        : features
          ? 40
          : 55;
  const sourceQuality = item.row.revision.sourceUrl ? 90 : 55;
  return Math.round(
    freshness * 0.5 +
      salaryQuality * 0.2 +
      extractionQuality * 0.15 +
      sourceQuality * 0.15,
  );
}

function buildPersonalizedDeckFromBase(
  base: Awaited<ReturnType<typeof loadPersonalizedDeckBase>>,
) {
  const {
    admissionCounts,
    classifiedRows,
    context,
    model,
    nearMatchCount,
    profile,
  } = base;
  // Blocked inventory is removed before either preference or v2 scoring. The
  // sole exception is the separately classified Discovery fallback whose only
  // blocker is bounded role-family uncertainty.
  const admittedRows = classifiedRows.filter(
    (item) => item.admission.lane !== "blocked" || item.nearMatch.eligible,
  );
  const ranked = rankPersonalizedJobs(
    admittedRows.map(({ row, salary }) => {
      const features = currentFeatureSnapshot(row);
      return {
        jobId: row.listing.id,
        title: row.revision.title,
        company: row.revision.company,
        location: features?.workplace.location ?? row.revision.location,
        workArrangement:
          features?.workplace.mode ?? row.revision.workArrangement,
        industry: features?.company.industry ?? row.revision.industry,
        salaryAnnualMinimumCents:
          features?.compensation.annualMinimumCents ??
          salary.annualMinimumCents,
        salaryAnnualMaximumCents:
          features?.compensation.annualMaximumCents ??
          salary.annualMaximumCents,
        seniority: features?.experience.seniority ?? row.revision.seniority,
        yearsExperienceMinimum:
          features?.experience.minimumYears ??
          row.revision.yearsExperienceMinimum,
        yearsExperienceMaximum:
          features?.experience.maximumYears ??
          row.revision.yearsExperienceMaximum,
        deterministicFitScoreOutOf100: row.fit.deterministicScore,
        postedAt: features?.freshness.postedAt
          ? new Date(features.freshness.postedAt)
          : row.revision.postedAt,
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
  const personalizationById = new Map(
    ranked.map((item) => [item.jobId, item]),
  );
  const rowsById = new Map(
    admittedRows.map((item) => [item.row.listing.id, item]),
  );
  const recommendations = buildForYouQueue(
    admittedRows.map((item) => {
      const result = item.row.fit.result as unknown as DeterministicFitResult;
      const personalization = personalizationById.get(item.row.listing.id);
      const brief = buildDecisionBrief(
        item.row,
        result,
        item.salary,
        context,
      );
      const baselineUtility =
        item.admission.lane === "primary"
          ? 82
          : item.admission.lane === "explore"
            ? 70
            : 66;
      const materialGapCount = item.admission.reasons.filter(
        (reason) => reason.kind === "stretch" || reason.kind === "blocker",
      ).length;

      return {
        id: item.row.listing.id,
        company: item.row.revision.company,
        title: item.row.revision.title,
        passesHardConstraints:
          item.admission.lane !== "blocked" || item.nearMatch.eligible,
        components: {
          qualification: result.deterministicFitScore,
          statedUtility: Math.max(
            baselineUtility,
            fitComponentScore(result, "careerValue", baselineUtility),
          ),
          learnedInterest: clampRecommendationComponent(
            50 + (personalization?.personalizationAdjustment ?? 0) * 4,
          ),
          opportunityQuality: opportunityQualityForRow(item),
        },
        roleAffinity: fitComponentScore(
          result,
          "roleFamily",
          item.admission.lane === "primary"
            ? 90
            : item.admission.lane === "explore"
              ? 65
              : 45,
        ),
        experienceGapYears:
          item.row.revision.yearsExperienceMinimum === null
            ? null
            : Math.max(
                0,
                item.row.revision.yearsExperienceMinimum -
                  context.profile.yearsExperience,
              ),
        materialGapCount,
        evidenceConfidence: Math.round(result.scoreCoverage * 100),
        positiveReason: brief.opportunity || brief.edge,
        riskReason: item.nearMatch.explanation ?? brief.risk,
      };
    }),
  );
  const jobs = recommendations.flatMap((recommendation) => {
    const item = rowsById.get(recommendation.id);
    const personalization = personalizationById.get(recommendation.id);
    if (!item) return [];
    const mode: Exclude<DeckFeedMode, "for_you"> = item.nearMatch.eligible
      ? "near_matches"
      : item.admission.lane === "primary"
        ? "matches"
        : "explore";
    return [
      rowToJobCard(
        item.row,
        context,
        personalization,
        item.admission,
        mode,
        item.nearMatch,
        recommendation,
      ),
    ];
  });

  return {
    admissionCounts,
    jobs,
    // Kept temporarily for v1/native callers while every client moves to the
    // single feed. Individual cards carry the real human-facing tier.
    lane: DEFAULT_JOB_FEED_LANE,
    mode: "for_you" as const,
    model,
    nearMatchCount,
    profileRevision: profile.revision,
  };
}

async function buildPersonalizedDeck() {
  return buildPersonalizedDeckFromBase(await loadPersonalizedDeckBase());
}

async function buildPersonalizedDeckForVisitor(
  visitorId: string,
) {
  return buildPersonalizedDeckFromBase(
    await loadPersonalizedDeckBaseForVisitor(visitorId),
  );
}

/**
 * Profile-dashboard projection of the exact current scored unseen inventory.
 * Unlike a deck page, this adds no second card limit: the counts explain the
 * whole active discovery window while returning only a small preference summary.
 */
export async function getProfileFeedImpactForVisitor(
  visitorId: string,
): Promise<ProfileFeedImpact> {
  await ensureDatabaseReady();
  const context = await getActiveCandidateContextForVisitor(visitorId, false);
  const { profile } = context;
  const [rows, observations, preferenceOverrides] = await Promise.all([
    loadCurrentRows(visitorId, profile, ["unseen"]),
    loadPreferenceObservationsForVisitor(visitorId),
    listPreferenceOverridesForVisitor(visitorId),
  ]);
  const classifiedRows = classifyCurrentRows(rows, context);
  const laneCounts = admissionCountsForRows(classifiedRows);
  const model = buildPreferenceModel(observations, {
    profileRevision: profile.revision,
    profileUpdatedAt: profile.updatedAt,
    preferenceOverrides,
  });

  return {
    profileRevision: profile.revision,
    counts: {
      ...laneCounts,
      totalUnseen: classifiedRows.length,
    },
    topExclusions: topExclusionsForRows(classifiedRows),
    learnedPreferences: summarizePreferenceModel(model),
  };
}

export async function getProfileFeedImpact(): Promise<ProfileFeedImpact> {
  return getProfileFeedImpactForVisitor(await requireVisitorId());
}

export interface DeckJobCardsPageOptions {
  cursor?: string | null;
  lane?: DeckFeedLane;
  limit?: number;
}

function materializedTierForJob(
  job: EnrichedJobCardViewModel,
): "ready_now" | "credible_stretch" | "discovery" {
  return job.feedTier === "blocked" ? "discovery" : job.feedTier;
}

function snapshotForMaterialization(job: EnrichedJobCardViewModel) {
  // Every field in a job card is deliberately JSON-serializable. Keep the cast
  // at the persistence boundary rather than weakening the UI contract.
  return job as unknown as Record<string, unknown>;
}

async function materializedDeckPageForVisitor(
  visitorId: string,
  options: DeckJobCardsPageOptions,
) {
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 25)));
  const profile = await getActiveCandidateProfileRecordForVisitor(visitorId);
  const catalog = await latestFeedCatalogCheckpoint(profile.id);
  const identity = {
    candidateProfileId: profile.id,
    profileRevision: profile.revision,
    recommenderVersion: FOR_YOU_RECOMMENDER_VERSION,
    catalog,
  };
  let page = await readMaterializedFeedPage(
    visitorId,
    identity,
    { cursor: options.cursor, limit },
  );
  let rebuiltDeck:
    | Awaited<ReturnType<typeof buildPersonalizedDeckForVisitor>>
    | undefined;

  if (!page) {
    rebuiltDeck = await buildPersonalizedDeckForVisitor(visitorId);
    const refreshedIdentity = {
      ...identity,
      // Interactive score repair can add the final missing fit rows while the
      // cold deck is built. Persist the post-build checkpoint so the very next
      // request is a true warm hit.
      catalog: await latestFeedCatalogCheckpoint(profile.id),
    };
    const queue = await replaceMaterializedFeedQueue(
      visitorId,
      refreshedIdentity,
      rebuiltDeck.jobs.slice(0, MATERIALIZED_FEED_QUEUE_SIZE).map((job) => ({
        id: job.id,
        tier: materializedTierForJob(job),
        snapshot: snapshotForMaterialization(job),
      })),
    );
    page = await readFreshlyMaterializedFeedPage(visitorId, queue, {
      // A cursor into an invalidated queue cannot safely index the replacement.
      cursor: null,
      limit,
    });
    if (options.cursor) page = { ...page, cursorReset: true };
  }

  const session = await recordFeedPageSession(visitorId, page);
  const jobs = page.entries.map((entry) => ({
    ...(entry.snapshot as unknown as EnrichedJobCardViewModel),
    feedExposureId: session.exposures.get(entry.jobId) ?? null,
    feedQueuePosition: entry.position,
  }));
  const inferredCounts = {
    matches: page.tierCounts.ready_now,
    explore:
      page.tierCounts.credible_stretch + page.tierCounts.discovery,
    blocked: 0,
  };
  const admissionCounts = rebuiltDeck?.admissionCounts ?? inferredCounts;
  const personalizationSignalCount =
    rebuiltDeck?.model.signalCount ?? jobs[0]?.personalizationSignalCount ?? 0;

  return {
    jobs,
    hasMore: page.hasMore,
    nextCursor: page.nextCursor,
    profileRevision: page.profileRevision,
    personalizationSignalCount,
    personalizationModelVersion: page.recommenderVersion,
    lane: DEFAULT_JOB_FEED_LANE,
    mode: "for_you" as const,
    admissionCounts,
    nearMatchCount:
      rebuiltDeck?.nearMatchCount ?? page.tierCounts.discovery,
    totalAvailable: page.totalAvailable,
    cursorReset: page.cursorReset,
    feedSession: {
      id: session.id,
      queueId: page.queueId,
      queueVersion: session.queueVersion,
      generatedAt: session.generatedAt,
      source: session.source,
    },
  };
}

/**
 * Cursor-friendly personalized slice for incremental deck prefetching. If the
 * profile or unseen set changes under a cursor, it safely restarts from the top
 * of the newly ranked remaining jobs instead of skipping unseen work.
 */
export async function getDeckJobCardsPage(
  options: DeckJobCardsPageOptions = {},
) {
  return materializedDeckPageForVisitor(await requireVisitorId(), options);
}

export async function getDeckJobCardsPageForVisitor(
  visitorId: string,
  options: DeckJobCardsPageOptions = {},
) {
  return materializedDeckPageForVisitor(visitorId, options);
}

export async function getInitialDeckJobCardPage(limit = 25) {
  return materializedDeckPageForVisitor(await requireVisitorId(), { limit });
}

/** @deprecated The product now exposes one continuous For You feed. */
export async function getInitialDeckJobCardPages(limit = 25) {
  const initial = await getInitialDeckJobCardPage(limit);

  return {
    initial,
    alternate: {
      ...initial,
      hasMore: false,
      jobs: [],
      nextCursor: null,
    },
  };
}

export async function getDeckJobCards(lane?: DeckFeedLane) {
  void lane;
  const deck = await buildPersonalizedDeck();
  return deck.jobs.slice(0, 100);
}

export async function getSavedJobCardsForVisitor(visitorId: string) {
  const context = await getActiveCandidateContextForVisitor(visitorId, false);
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
  return rows.map((row) => rowToJobCard(row, context));
}

export async function getSavedJobCards() {
  return getSavedJobCardsForVisitor(await requireVisitorId());
}

export async function getJobCardForVisitor(visitorId: string, jobId: string) {
  await ensureDatabaseReady();
  const context = await getActiveCandidateContextForVisitor(visitorId, false);
  const { profile } = context;
  await ensureCurrentFitScoreForJob(profile, jobId);
  const currentDecision = sql<JobDecision>`coalesce(${visitorJobStates.currentDecision}, 'unseen')`;
  const [row] = await db
    .select({
      listing: jobListings,
      revision: jobRevisions,
      fit: fitScoreRuns,
      featureSnapshot: jobFeatureSnapshots,
      currentDecision,
      currentDecisionEventId: visitorJobStates.currentDecisionEventId,
    })
    .from(jobListings)
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .innerJoin(fitScoreRuns, eq(fitScoreRuns.jobRevisionId, jobRevisions.id))
    .leftJoin(
      jobFeatureSnapshots,
      and(
        eq(jobFeatureSnapshots.jobRevisionId, jobRevisions.id),
        eq(
          jobFeatureSnapshots.schemaVersion,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
        ),
        eq(
          jobFeatureSnapshots.extractorVersion,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ),
      ),
    )
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

  return row ? rowToJobCard(row, context) : null;
}

export const getJobCard = cache(async function getJobCard(jobId: string) {
  return getJobCardForVisitor(await requireVisitorId(), jobId);
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
