import type { JobDecision, WorkArrangement } from "@/db/schema";

export const PERSONALIZATION_MODEL_VERSION = "swipe-preferences-v1" as const;

export interface PreferenceObservation {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  workArrangement: WorkArrangement;
  decision: JobDecision;
  observedAt: Date | string;
}

export interface PreferenceModelContext {
  profileRevision: number;
  profileUpdatedAt: Date | string;
}

export interface PersonalizationCandidate {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  workArrangement: WorkArrangement;
  /** Persisted deterministic score on the database's 0–100 scale. */
  deterministicFitScoreOutOf100: number;
  postedAt: Date | string | null;
  discoveredAt: Date | string;
  marketSalaryIsEstimate?: boolean;
  marketSalaryConfidence?: "high" | "medium" | "low";
  marketSalaryAnnualMinimumCents?: number | null;
  marketSalaryAnnualMaximumCents?: number | null;
  preferredSalaryMinimumAnnualCents?: number | null;
  preferredSalaryTargetAnnualCents?: number | null;
}

interface FeatureSignal {
  signedWeight: number;
  totalWeight: number;
  observations: number;
}

export interface PreferenceModel {
  version: `${typeof PERSONALIZATION_MODEL_VERSION}:profile-${number}`;
  profileRevision: number;
  signalCount: number;
  positiveSignalCount: number;
  negativeSignalCount: number;
  features: ReadonlyMap<string, FeatureSignal>;
}

export interface RankedPersonalization {
  jobId: string;
  personalizationScore: number;
  personalizationAdjustment: number;
  personalizationReasons: readonly string[];
  personalizationSignalCount: number;
  personalizationModelVersion: PreferenceModel["version"];
  isExploration: boolean;
}

interface CandidateDraft extends RankedPersonalization {
  companyKey: string;
  titleTokens: readonly string[];
  arrangement: WorkArrangement;
  rawRankingScore: number;
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "remote",
  "hybrid",
  "full",
  "time",
  "senior",
  "sr",
  "junior",
  "jr",
  "entry",
  "associate",
  "staff",
  "principal",
  "lead",
]);

const POSITIVE_DECISION_WEIGHT: Partial<Record<JobDecision, number>> = {
  saved: 1,
  stretch: 0.55,
  learn_first: 0.35,
  apply: 1.25,
  applied: 1.5,
  interview: 1.7,
  rejected: 1.1,
  offer: 1.8,
};

const NEGATIVE_DECISION_WEIGHT: Partial<Record<JobDecision, number>> = {
  skipped: -1,
};

function normalize(value: string | null) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(title: string) {
  return [
    ...new Set(
      normalize(title)
        .split(/\s+/)
        .filter((token) => token.length >= 2 && !TITLE_STOP_WORDS.has(token)),
    ),
  ].slice(0, 10);
}

function companyKey(company: string) {
  return normalize(company) || "unknown";
}

function locationKey(location: string | null, arrangement: WorkArrangement) {
  if (arrangement === "remote" || /\bremote\b/i.test(location ?? "")) return "remote";
  const normalized = normalize(location);
  if (!normalized) return "unknown";
  return normalized.split(/\s+/).slice(0, 3).join("-");
}

function featuresForJob(job: {
  title: string;
  company: string;
  location: string | null;
  workArrangement: WorkArrangement;
}) {
  return [
    ...titleTokens(job.title).map((token) => `title:${token}`),
    `company:${companyKey(job.company)}`,
    `arrangement:${job.workArrangement}`,
    `location:${locationKey(job.location, job.workArrangement)}`,
  ];
}

function observationWeight(decision: JobDecision) {
  return POSITIVE_DECISION_WEIGHT[decision] ?? NEGATIVE_DECISION_WEIGHT[decision] ?? 0;
}

function featurePreference(signal: FeatureSignal | undefined) {
  if (!signal) return 0;
  // Bayesian shrinkage prevents a single swipe from dominating the feed.
  return signal.signedWeight / (2.5 + signal.totalWeight);
}

function asTimestamp(value: Date | string) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function buildPreferenceModel(
  observations: readonly PreferenceObservation[],
  context: PreferenceModelContext,
): PreferenceModel {
  const features = new Map<string, FeatureSignal>();
  const profileUpdatedAt = asTimestamp(context.profileUpdatedAt);
  let positiveSignalCount = 0;
  let negativeSignalCount = 0;

  for (const observation of observations) {
    const decisionWeight = observationWeight(observation.decision);
    if (decisionWeight === 0) continue;
    if (decisionWeight > 0) positiveSignalCount += 1;
    else negativeSignalCount += 1;

    // Preferences collected before a profile edit remain useful, but the new
    // profile gets priority immediately rather than being trapped by old swipes.
    const profileCarryover =
      asTimestamp(observation.observedAt) < profileUpdatedAt ? 0.55 : 1;
    const signedWeight = decisionWeight * profileCarryover;
    const magnitude = Math.abs(signedWeight);
    for (const feature of new Set(featuresForJob(observation))) {
      const current = features.get(feature) ?? {
        signedWeight: 0,
        totalWeight: 0,
        observations: 0,
      };
      features.set(feature, {
        signedWeight: current.signedWeight + signedWeight,
        totalWeight: current.totalWeight + magnitude,
        observations: current.observations + 1,
      });
    }
  }

  return {
    version: `${PERSONALIZATION_MODEL_VERSION}:profile-${context.profileRevision}`,
    profileRevision: context.profileRevision,
    signalCount: positiveSignalCount + negativeSignalCount,
    positiveSignalCount,
    negativeSignalCount,
    features,
  };
}

function freshnessBonus(candidate: PersonalizationCandidate, now: Date) {
  const timestamp = candidate.postedAt
    ? asTimestamp(candidate.postedAt)
    : asTimestamp(candidate.discoveredAt);
  if (timestamp <= 0) return 0;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / 86_400_000);
  if (ageDays <= 3) return 4;
  if (ageDays <= 7) return 3;
  if (ageDays <= 14) return 2;
  if (ageDays <= 30) return 1;
  if (ageDays > 90) return -2;
  if (ageDays > 60) return -1;
  return 0;
}

function strongestPositiveFeature(
  candidate: PersonalizationCandidate,
  model: PreferenceModel,
) {
  return featuresForJob(candidate)
    .map((feature) => ({ feature, preference: featurePreference(model.features.get(feature)) }))
    .filter(({ preference }) => preference > 0)
    .sort((left, right) => right.preference - left.preference || left.feature.localeCompare(right.feature))[0];
}

function preferenceAdjustment(candidate: PersonalizationCandidate, model: PreferenceModel) {
  const tokens = titleTokens(candidate.title);
  const tokenPreferences = tokens.map((token) =>
    featurePreference(model.features.get(`title:${token}`)),
  );
  const titlePreference = tokenPreferences.length
    ? tokenPreferences.reduce((sum, value) => sum + value, 0) / tokenPreferences.length
    : 0;
  const companyPreference = featurePreference(
    model.features.get(`company:${companyKey(candidate.company)}`),
  );
  const arrangementPreference = featurePreference(
    model.features.get(`arrangement:${candidate.workArrangement}`),
  );
  const locationPreference = featurePreference(
    model.features.get(
      `location:${locationKey(candidate.location, candidate.workArrangement)}`,
    ),
  );

  return clamp(
    titlePreference * 9 +
      companyPreference * 3 +
      arrangementPreference * 2 +
      locationPreference * 1.5,
    -11,
    11,
  );
}

function explorationBonus(candidate: PersonalizationCandidate, model: PreferenceModel) {
  if (model.signalCount < 4) return 0;
  const tokens = titleTokens(candidate.title);
  const unseenTokenRatio = tokens.length
    ? tokens.filter((token) => !model.features.has(`title:${token}`)).length / tokens.length
    : 0;
  const unseenCompany = !model.features.has(`company:${companyKey(candidate.company)}`);
  const arrangementSignal = model.features.get(
    `arrangement:${candidate.workArrangement}`,
  );
  const underrepresentedArrangement =
    !arrangementSignal || arrangementSignal.observations <= Math.max(1, model.signalCount * 0.12);

  return clamp(
    (unseenTokenRatio >= 0.6 ? 0.9 : 0) +
      (unseenCompany ? 0.7 : 0) +
      (underrepresentedArrangement ? 0.4 : 0),
    0,
    2,
  );
}

function estimatedCompensationSignal(candidate: PersonalizationCandidate) {
  if (!candidate.marketSalaryIsEstimate) return { adjustment: 0, reason: null };
  const lower = candidate.marketSalaryAnnualMinimumCents;
  const upper = candidate.marketSalaryAnnualMaximumCents;
  const floor = candidate.preferredSalaryMinimumAnnualCents;
  const target = candidate.preferredSalaryTargetAnnualCents;
  if (
    lower === null ||
    lower === undefined ||
    upper === null ||
    upper === undefined ||
    floor === null ||
    floor === undefined ||
    floor <= 0
  ) {
    return { adjustment: 0, reason: null };
  }

  const confidenceMultiplier =
    candidate.marketSalaryConfidence === "medium"
      ? 0.8
      : candidate.marketSalaryConfidence === "high"
        ? 1
        : 0.55;
  if (upper < floor) {
    return {
      adjustment: -1.5 * confidenceMultiplier,
      reason: "Estimated range sits below your pay floor",
    };
  }
  if (target && target > 0 && lower >= target) {
    return {
      adjustment: 1.5 * confidenceMultiplier,
      reason: "Estimated range clears your pay target",
    };
  }
  if (lower >= floor) {
    return {
      adjustment: 1.1 * confidenceMultiplier,
      reason: "Estimated range clears your pay floor",
    };
  }
  return {
    adjustment: 0.55 * confidenceMultiplier,
    reason: "Estimated range reaches your pay floor",
  };
}

function humanizeFeature(feature: string) {
  const [kind, ...parts] = feature.split(":");
  const value = parts.join(":").replaceAll("-", " ");
  if (kind === "arrangement") {
    return value === "on_site" ? "on-site roles" : `${value} roles`;
  }
  if (kind === "company") return `${value} roles`;
  return `${value} roles`;
}

function candidateDraft(
  candidate: PersonalizationCandidate,
  model: PreferenceModel,
  now: Date,
): CandidateDraft {
  const preference = preferenceAdjustment(candidate, model);
  const freshness = freshnessBonus(candidate, now);
  const exploration = explorationBonus(candidate, model);
  const compensation = estimatedCompensationSignal(candidate);
  const adjustment = preference + freshness + exploration + compensation.adjustment;
  const reasons: string[] = [];
  const strongest = strongestPositiveFeature(candidate, model);

  if (model.signalCount > 0 && strongest && strongest.preference >= 0.12) {
    reasons.push(`Learns from your saves: ${humanizeFeature(strongest.feature)}`);
  }
  if (freshness >= 2) reasons.push("Fresh posting");
  if (exploration >= 1) reasons.push("Adds useful variety to your feed");
  if (compensation.reason) reasons.push(compensation.reason);
  if (preference <= -1.5) reasons.push("Balanced against patterns in roles you passed on");
  if (reasons.length === 0) {
    reasons.push(
      model.signalCount === 0
        ? "Profile fit leads until swipe preferences develop"
        : "Ranked from current profile fit and swipe history",
    );
  }

  return {
    jobId: candidate.jobId,
    personalizationScore: round(
      clamp(candidate.deterministicFitScoreOutOf100 + adjustment, 0, 100),
      1,
    ),
    personalizationAdjustment: round(adjustment, 1),
    personalizationReasons: reasons.slice(0, 3),
    personalizationSignalCount: model.signalCount,
    personalizationModelVersion: model.version,
    isExploration: exploration >= 1,
    companyKey: companyKey(candidate.company),
    titleTokens: titleTokens(candidate.title),
    arrangement: candidate.workArrangement,
    rawRankingScore: candidate.deterministicFitScoreOutOf100 + adjustment,
  };
}

function tokenOverlap(left: readonly string[], right: readonly string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  return intersection / Math.min(left.length, right.length);
}

function diversityPenalty(candidate: CandidateDraft, selected: readonly CandidateDraft[]) {
  const recent = selected.slice(-4);
  let penalty = 0;
  if (recent.some((item) => item.companyKey === candidate.companyKey)) penalty += 7;
  if (recent.some((item) => tokenOverlap(item.titleTokens, candidate.titleTokens) >= 0.6)) {
    penalty += 2;
  }
  if (
    recent.length >= 3 &&
    recent.slice(-3).every((item) => item.arrangement === candidate.arrangement)
  ) {
    penalty += 1;
  }
  return penalty;
}

function stableTieBreak(modelVersion: string, jobId: string) {
  let hash = 2_166_136_261;
  for (const character of `${modelVersion}:${jobId}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Deterministic, local ranking. No model call, random value, or inferred
 * employer fact is involved. A small exploration allowance prevents feedback
 * loops, while greedy diversity avoids repetitive adjacent cards.
 */
export function rankPersonalizedJobs(
  candidates: readonly PersonalizationCandidate[],
  model: PreferenceModel,
  now = new Date(),
): RankedPersonalization[] {
  const remaining = candidates.map((candidate) => candidateDraft(candidate, model, now));
  const selected: CandidateDraft[] = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestTieBreak = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (!candidate) continue;
      const score = candidate.rawRankingScore - diversityPenalty(candidate, selected);
      const tieBreak = stableTieBreak(model.version, candidate.jobId);
      if (score > bestScore || (score === bestScore && tieBreak > bestTieBreak)) {
        bestIndex = index;
        bestScore = score;
        bestTieBreak = tieBreak;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    if (!chosen) break;
    const diversityAdjustment = bestScore - chosen.rawRankingScore;
    selected.push({
      ...chosen,
      personalizationScore: round(clamp(bestScore, 0, 100), 1),
      personalizationAdjustment: round(
        chosen.personalizationAdjustment + diversityAdjustment,
        1,
      ),
    });
  }

  return selected.map((item) => ({
    jobId: item.jobId,
    personalizationScore: item.personalizationScore,
    personalizationAdjustment: item.personalizationAdjustment,
    personalizationReasons: item.personalizationReasons,
    personalizationSignalCount: item.personalizationSignalCount,
    personalizationModelVersion: item.personalizationModelVersion,
    isExploration: item.isExploration,
  }));
}
