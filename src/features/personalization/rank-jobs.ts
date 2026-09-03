import type {
  JobDecision,
  JobDecisionReason,
  PreferenceOverrideMode,
  WorkArrangement,
} from "@/db/schema";

export const PERSONALIZATION_MODEL_VERSION = "swipe-preferences-v3" as const;

export interface StructuredPreferenceMetadata {
  industry?: string | null;
  salaryAnnualMaximumCents?: number | null;
  salaryAnnualMinimumCents?: number | null;
  seniority?: string | null;
  yearsExperienceMaximum?: number | null;
  yearsExperienceMinimum?: number | null;
}

export interface PreferenceObservation extends StructuredPreferenceMetadata {
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  workArrangement: WorkArrangement;
  decision: JobDecision;
  observedAt: Date | string;
  reasonCodes?: readonly JobDecisionReason[];
}

export interface PreferenceModelContext {
  profileRevision: number;
  profileUpdatedAt: Date | string;
  preferenceOverrides?: readonly {
    featureKey: string;
    mode: PreferenceOverrideMode;
  }[];
}

export interface PersonalizationCandidate extends StructuredPreferenceMetadata {
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
  overrides: ReadonlyMap<string, PreferenceOverrideMode>;
}

export type LearnedPreferenceConfidence =
  | "none"
  | "early"
  | "developing"
  | "confident";

export interface LearnedPreferenceSignal {
  /** Stable identifier suitable for a future per-signal reset action. */
  key: `preference:${string}`;
  /** Internal model feature retained for an auditable reset or explanation. */
  featureKey: string;
  /** Effective direction after applying the user's explicit adjustment. */
  direction: "up" | "down" | "neutral";
  /** Direction learned from decisions before an explicit adjustment. */
  learnedDirection: "up" | "down";
  label: string;
  observationCount: number;
  confidence: Exclude<LearnedPreferenceConfidence, "none">;
  /** Bayesian-shrunk signed strength on a -1 to 1 scale. */
  score: number;
  learnedScore: number;
  override: PreferenceOverrideMode | null;
}

export interface LearnedPreferenceSummary {
  modelVersion: PreferenceModel["version"];
  signalCount: number;
  positiveSignalCount: number;
  negativeSignalCount: number;
  confidence: LearnedPreferenceConfidence;
  overrideCount: number;
  signals: readonly LearnedPreferenceSignal[];
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

type PreferenceFeatureJob = StructuredPreferenceMetadata & {
  title: string;
  company: string;
  location: string | null;
  workArrangement: WorkArrangement;
};

function legacyFeaturesForJob(job: PreferenceFeatureJob) {
  return [
    ...titleTokens(job.title).map((token) => `title:${token}`),
    `company:${companyKey(job.company)}`,
    `arrangement:${job.workArrangement}`,
    `location:${locationKey(job.location, job.workArrangement)}`,
  ];
}

function seniorityFeatures(job: StructuredPreferenceMetadata) {
  const features: string[] = [];
  const seniority = normalize(job.seniority ?? null);
  if (seniority && seniority !== "unknown") {
    features.push(`seniority:${seniority.replaceAll(" ", "-")}`);
  }

  const minimumYears = job.yearsExperienceMinimum;
  const maximumYears = job.yearsExperienceMaximum;
  const representativeYears =
    typeof minimumYears === "number" && Number.isFinite(minimumYears)
      ? minimumYears
      : typeof maximumYears === "number" && Number.isFinite(maximumYears)
        ? maximumYears
        : null;
  if (representativeYears !== null && representativeYears >= 0) {
    const band =
      representativeYears <= 1
        ? "0-1"
        : representativeYears <= 3
          ? "2-3"
          : representativeYears <= 5
            ? "4-5"
            : representativeYears <= 8
              ? "6-8"
              : "9-plus";
    features.push(`experience:${band}`);
  }
  return features;
}

function salaryBand(amountCents: number) {
  const startInThousands = Math.floor(amountCents / 2_500_000) * 25;
  return `${startInThousands}k-${startInThousands + 25}k`;
}

function salaryFeatures(job: StructuredPreferenceMetadata) {
  const features: string[] = [];
  const minimum = job.salaryAnnualMinimumCents;
  const maximum = job.salaryAnnualMaximumCents;
  if (typeof minimum === "number" && Number.isFinite(minimum) && minimum >= 0) {
    features.push(`salary-min:${salaryBand(minimum)}`);
  }
  if (typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0) {
    features.push(`salary-max:${salaryBand(maximum)}`);
  }
  if (
    typeof minimum === "number" &&
    Number.isFinite(minimum) &&
    minimum >= 0 &&
    typeof maximum === "number" &&
    Number.isFinite(maximum) &&
    maximum >= minimum
  ) {
    features.push(`salary-mid:${salaryBand((minimum + maximum) / 2)}`);
  }
  return features;
}

function industryFeatures(job: StructuredPreferenceMetadata) {
  const industry = normalize(job.industry ?? null);
  return industry
    ? [`industry:${industry.split(/\s+/).slice(0, 4).join("-")}`]
    : [];
}

function structuredFeaturesForJob(job: StructuredPreferenceMetadata) {
  return [
    ...seniorityFeatures(job),
    ...salaryFeatures(job),
    ...industryFeatures(job),
  ];
}

function broadFeaturesForJob(job: PreferenceFeatureJob) {
  return [...legacyFeaturesForJob(job), ...structuredFeaturesForJob(job)];
}

function negativeFeaturesForObservation(observation: PreferenceObservation) {
  const reasonCodes = observation.reasonCodes ?? [];
  // Old rows predate reason chips. They remain broadly attributable, but the
  // model gives the ambiguous signal only one tenth of a targeted pass.
  if (reasonCodes.length === 0) return legacyFeaturesForJob(observation);

  const features: string[] = [];
  for (const reasonCode of reasonCodes) {
    switch (reasonCode) {
      case "wrong_role":
        features.push(
          ...titleTokens(observation.title).map((token) => `title:${token}`),
        );
        break;
      case "too_senior":
        features.push(...seniorityFeatures(observation));
        break;
      case "pay_too_low":
        features.push(...salaryFeatures(observation));
        break;
      case "wrong_location":
        features.push(
          `location:${locationKey(
            observation.location,
            observation.workArrangement,
          )}`,
        );
        break;
      case "wrong_work_mode":
        features.push(`arrangement:${observation.workArrangement}`);
        break;
      case "company_or_industry":
        features.push(`company:${companyKey(observation.company)}`);
        features.push(...industryFeatures(observation));
        break;
      case "liked_role":
      case "liked_pay":
      case "liked_location":
      case "liked_work_mode":
      case "liked_company_or_industry":
      case "growth_opportunity":
      case "stale_or_duplicate":
      case "other":
        break;
    }
  }
  return [...new Set(features)];
}

function positiveFeaturesForObservation(observation: PreferenceObservation) {
  const positiveReasons = (observation.reasonCodes ?? []).filter((reason) =>
    reason.startsWith("liked_") || reason === "growth_opportunity",
  );
  // A reasonless save is weak evidence for the role itself. When the user
  // names what stood out, update only those feature families.
  if (positiveReasons.length === 0) {
    return titleTokens(observation.title).map((token) => `title:${token}`);
  }

  const features: string[] = [];
  for (const reasonCode of positiveReasons) {
    switch (reasonCode) {
      case "liked_role":
      case "growth_opportunity":
        features.push(
          ...titleTokens(observation.title).map((token) => `title:${token}`),
        );
        break;
      case "liked_pay":
        features.push(...salaryFeatures(observation));
        break;
      case "liked_location":
        features.push(
          `location:${locationKey(
            observation.location,
            observation.workArrangement,
          )}`,
        );
        break;
      case "liked_work_mode":
        features.push(`arrangement:${observation.workArrangement}`);
        break;
      case "liked_company_or_industry":
        features.push(`company:${companyKey(observation.company)}`);
        features.push(...industryFeatures(observation));
        break;
    }
  }
  return [...new Set(features)];
}

function observationWeight(observation: PreferenceObservation) {
  const positive = POSITIVE_DECISION_WEIGHT[observation.decision];
  if (positive !== undefined) return positive;
  const negative = NEGATIVE_DECISION_WEIGHT[observation.decision] ?? 0;
  if (negative >= 0) return negative;
  return (observation.reasonCodes?.length ?? 0) > 0 ? negative : negative * 0.1;
}

function learnedFeaturePreference(signal: FeatureSignal | undefined) {
  if (!signal) return 0;
  // Bayesian shrinkage prevents a single swipe from dominating the feed.
  return signal.signedWeight / (2.5 + signal.totalWeight);
}

function effectiveFeaturePreference(
  signal: FeatureSignal | undefined,
  override: PreferenceOverrideMode | undefined,
) {
  const learned = learnedFeaturePreference(signal);
  if (override === "ignore") return 0;
  if (override === "more") return Math.max(0.52, learned);
  if (override === "less") return Math.min(-0.52, learned);
  return learned;
}

function preferenceForFeature(model: PreferenceModel, featureKey: string) {
  return effectiveFeaturePreference(
    model.features.get(featureKey),
    model.overrides.get(featureKey),
  );
}

const FEATURE_GROUP_PRIORITY: Readonly<Record<string, number>> = {
  arrangement: 0,
  title: 1,
  seniority: 2,
  experience: 3,
  industry: 4,
  salary: 5,
  location: 6,
  company: 7,
};

const DISPLAY_ACRONYMS: Readonly<Record<string, string>> = {
  ai: "AI",
  api: "API",
  b2b: "B2B",
  ml: "ML",
  saas: "SaaS",
  sql: "SQL",
  ui: "UI",
  ux: "UX",
};

function featureParts(feature: string) {
  const [rawKind = "other", ...rawValue] = feature.split(":");
  const kind = rawKind.startsWith("salary-") ? "salary" : rawKind;
  return { kind, rawKind, value: rawValue.join(":") };
}

function displayWords(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) =>
      DISPLAY_ACRONYMS[word] ??
      `${word.charAt(0).toLocaleUpperCase("en-US")}${word.slice(1)}`,
    )
    .join(" ");
}

function salaryBandLabel(value: string) {
  const match = /^(\d+)k-(\d+)k$/.exec(value);
  return match ? `$${match[1]}k–$${match[2]}k` : displayWords(value);
}

function learnedPreferenceSubject(feature: string) {
  const { kind, value } = featureParts(feature);
  if (kind === "arrangement") {
    return `${value === "on_site" ? "On-site" : displayWords(value)} roles`;
  }
  if (kind === "title") return `Roles mentioning ${displayWords(value)}`;
  if (kind === "company") return `Roles at ${displayWords(value)}`;
  if (kind === "location") {
    return value === "remote"
      ? "Remote-location roles"
      : `Roles around ${displayWords(value)}`;
  }
  if (kind === "seniority") return `${displayWords(value)}-level roles`;
  if (kind === "experience") {
    return `Roles asking for ${value === "9-plus" ? "9+" : value.replace("-", "–")} years`;
  }
  if (kind === "salary") return `Roles around ${salaryBandLabel(value)}`;
  if (kind === "industry") return `${displayWords(value)} roles`;
  return `${displayWords(value)} roles`;
}

function learnedPreferenceConfidence(
  modelSignalCount: number,
  featureObservationCount: number,
): Exclude<LearnedPreferenceConfidence, "none"> {
  if (modelSignalCount < 5 || featureObservationCount < 2) return "early";
  if (modelSignalCount < 12 || featureObservationCount < 5) {
    return "developing";
  }
  return "confident";
}

function overallPreferenceConfidence(
  signalCount: number,
): LearnedPreferenceConfidence {
  if (signalCount === 0) return "none";
  if (signalCount < 5) return "early";
  if (signalCount < 12) return "developing";
  return "confident";
}

/**
 * Projects the internal feature map into a small, conservative set of labels
 * for the profile dashboard. One signal per feature family avoids presenting
 * a single save as a wall of learned certainty, while the raw stable key keeps
 * each row auditable and ready for a future reset control.
 */
export function summarizePreferenceModel(
  model: PreferenceModel,
  limit = 6,
): LearnedPreferenceSummary {
  const normalizedLimit = Math.min(12, Math.max(0, Math.trunc(limit)));
  const candidates = [...model.features.entries()]
    .map(([featureKey, feature]) => ({
      feature,
      featureKey,
      learnedPreference: learnedFeaturePreference(feature),
      override: model.overrides.get(featureKey) ?? null,
      preference: preferenceForFeature(model, featureKey),
      ...featureParts(featureKey),
    }))
    .filter(({ feature, kind, learnedPreference, override }) => {
      if (!override && Math.abs(learnedPreference) < 0.08) return false;
      // One interaction with a company is not enough to call it a company
      // preference. Other categories can still be disclosed as early signals.
      return Boolean(override) || kind !== "company" || feature.observations >= 2;
    })
    .sort((left, right) => {
      if (Boolean(left.override) !== Boolean(right.override)) {
        return left.override ? -1 : 1;
      }
      const leftPriority = FEATURE_GROUP_PRIORITY[left.kind] ?? 99;
      const rightPriority = FEATURE_GROUP_PRIORITY[right.kind] ?? 99;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      if (left.feature.observations !== right.feature.observations) {
        return right.feature.observations - left.feature.observations;
      }
      if (Math.abs(left.preference) !== Math.abs(right.preference)) {
        return Math.abs(right.preference) - Math.abs(left.preference);
      }
      // Midpoint salary signals are more legible than duplicate min/max bands.
      if (left.rawKind !== right.rawKind) {
        if (left.rawKind === "salary-mid") return -1;
        if (right.rawKind === "salary-mid") return 1;
      }
      // For equally supported title tokens, the more descriptive token is a
      // better summary than a short fragment such as "AI".
      if (left.kind === "title" && left.value.length !== right.value.length) {
        return right.value.length - left.value.length;
      }
      return left.featureKey.localeCompare(right.featureKey);
    });

  const representedGroups = new Set<string>();
  const signals: LearnedPreferenceSignal[] = [];
  for (const candidate of candidates) {
    if (representedGroups.has(candidate.kind) && !candidate.override) continue;
    representedGroups.add(candidate.kind);
    const learnedDirection = candidate.learnedPreference >= 0 ? "up" : "down";
    const direction =
      candidate.override === "ignore"
        ? "neutral"
        : candidate.preference >= 0
          ? "up"
          : "down";
    const subject = learnedPreferenceSubject(candidate.featureKey);
    const label =
      candidate.override === "more"
        ? `${subject} are set to appear more often`
        : candidate.override === "less"
          ? `${subject} are set to appear less often`
          : candidate.override === "ignore"
            ? `${subject} are ignored when ranking`
            : `${subject} are trending ${learnedDirection} in your decisions`;
    signals.push({
      key: `preference:${candidate.featureKey}`,
      featureKey: candidate.featureKey,
      direction,
      learnedDirection,
      label,
      observationCount: candidate.feature.observations,
      confidence: learnedPreferenceConfidence(
        model.signalCount,
        candidate.feature.observations,
      ),
      score: round(candidate.preference, 3),
      learnedScore: round(candidate.learnedPreference, 3),
      override: candidate.override,
    });
    if (signals.length >= normalizedLimit) break;
  }

  return {
    modelVersion: model.version,
    signalCount: model.signalCount,
    positiveSignalCount: model.positiveSignalCount,
    negativeSignalCount: model.negativeSignalCount,
    confidence: overallPreferenceConfidence(model.signalCount),
    overrideCount: model.overrides.size,
    signals,
  };
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
    const decisionWeight = observationWeight(observation);
    if (decisionWeight === 0) continue;
    const observationFeatures =
      decisionWeight > 0
        ? positiveFeaturesForObservation(observation)
        : negativeFeaturesForObservation(observation);
    if (observationFeatures.length === 0) continue;
    if (decisionWeight > 0) positiveSignalCount += 1;
    else negativeSignalCount += 1;

    // Preferences collected before a profile edit remain useful, but the new
    // profile gets priority immediately rather than being trapped by old swipes.
    const profileCarryover =
      asTimestamp(observation.observedAt) < profileUpdatedAt ? 0.55 : 1;
    const signedWeight = decisionWeight * profileCarryover;
    const magnitude = Math.abs(signedWeight);
    for (const feature of new Set(observationFeatures)) {
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
    overrides: new Map(
      (context.preferenceOverrides ?? []).map((override) => [
        override.featureKey,
        override.mode,
      ]),
    ),
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

function candidateFeatureJob(
  candidate: PersonalizationCandidate,
): PreferenceFeatureJob {
  return {
    ...candidate,
    salaryAnnualMaximumCents:
      candidate.salaryAnnualMaximumCents ??
      candidate.marketSalaryAnnualMaximumCents,
    salaryAnnualMinimumCents:
      candidate.salaryAnnualMinimumCents ??
      candidate.marketSalaryAnnualMinimumCents,
  };
}

function averageFeaturePreference(
  features: readonly string[],
  model: PreferenceModel,
) {
  if (features.length === 0) return 0;
  return (
    features.reduce(
      (total, feature) =>
        total + preferenceForFeature(model, feature),
      0,
    ) / features.length
  );
}

function strongestPositiveFeature(
  candidate: PersonalizationCandidate,
  model: PreferenceModel,
) {
  return broadFeaturesForJob(candidateFeatureJob(candidate))
    .map((feature) => ({
      feature,
      override: model.overrides.get(feature) ?? null,
      preference: preferenceForFeature(model, feature),
    }))
    .filter(({ preference }) => preference > 0)
    .sort((left, right) => right.preference - left.preference || left.feature.localeCompare(right.feature))[0];
}

function strongestNegativeOverrideFeature(
  candidate: PersonalizationCandidate,
  model: PreferenceModel,
) {
  return broadFeaturesForJob(candidateFeatureJob(candidate))
    .filter((feature) => model.overrides.get(feature) === "less")
    .sort((left, right) => left.localeCompare(right))[0];
}

function preferenceAdjustment(candidate: PersonalizationCandidate, model: PreferenceModel) {
  const featureJob = candidateFeatureJob(candidate);
  const tokens = titleTokens(candidate.title);
  const titlePreference = averageFeaturePreference(
    tokens.map((token) => `title:${token}`),
    model,
  );
  const companyPreference = preferenceForFeature(
    model,
    `company:${companyKey(candidate.company)}`,
  );
  const arrangementPreference = preferenceForFeature(
    model,
    `arrangement:${candidate.workArrangement}`,
  );
  const locationPreference = preferenceForFeature(
    model,
    `location:${locationKey(candidate.location, candidate.workArrangement)}`,
  );
  const seniorityPreference = averageFeaturePreference(
    seniorityFeatures(featureJob),
    model,
  );
  const salaryPreference = averageFeaturePreference(
    salaryFeatures(featureJob),
    model,
  );
  const industryPreference = averageFeaturePreference(
    industryFeatures(featureJob),
    model,
  );

  return clamp(
    titlePreference * 9 +
      companyPreference * 3 +
      arrangementPreference * 2 +
      locationPreference * 1.5 +
      seniorityPreference * 2.5 +
      salaryPreference * 2 +
      industryPreference * 2,
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
  const strongestExplicitLess = strongestNegativeOverrideFeature(candidate, model);

  if (strongest?.override === "more") {
    reasons.push(`You asked for more ${humanizeFeature(strongest.feature)}`);
  } else if (model.signalCount > 0 && strongest && strongest.preference >= 0.12) {
    reasons.push(`Learns from your saves: ${humanizeFeature(strongest.feature)}`);
  }
  if (freshness >= 2) reasons.push("Fresh posting");
  if (exploration >= 1) reasons.push("Adds useful variety to your feed");
  if (compensation.reason) reasons.push(compensation.reason);
  if (strongestExplicitLess) {
    reasons.push(`You asked for fewer ${humanizeFeature(strongestExplicitLess)}`);
  } else if (preference <= -1.5) {
    reasons.push("Balanced against patterns in roles you passed on");
  }
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
