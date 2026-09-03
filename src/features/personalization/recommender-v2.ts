/**
 * The public feed is one product surface. Tiers describe why a card is in the
 * queue; they are not separate feeds and they never bypass hard admission.
 */
export const FOR_YOU_RECOMMENDER_VERSION = "personal-radar-v2" as const;

export const FOR_YOU_TIER_MIX = {
  readyNow: 7,
  credibleStretch: 2,
  discovery: 1,
} as const;

export type ForYouTier = "ready_now" | "credible_stretch" | "discovery";

export interface RecommendationComponents {
  /** Evidence-backed ability to do the work. */
  qualification: number;
  /** Explicit role, pay, geography, work-mode, and career preferences. */
  statedUtility: number;
  /** Behavioral preference score. Fifty is neutral. */
  learnedInterest: number;
  /** Freshness, listing completeness, and source quality. */
  opportunityQuality: number;
}

export interface ForYouCandidate {
  id: string;
  company: string;
  title: string;
  /** Must already include every non-negotiable admission check. */
  passesHardConstraints: boolean;
  components: RecommendationComponents;
  roleAffinity: number;
  experienceGapYears: number | null;
  materialGapCount: number;
  evidenceConfidence: number;
  positiveReason: string;
  riskReason: string;
}

export interface ForYouRecommendation extends ForYouCandidate {
  tier: ForYouTier;
  score: number;
  modelVersion: typeof FOR_YOU_RECOMMENDER_VERSION;
}

const WEIGHTS: Readonly<Record<keyof RecommendationComponents, number>> = {
  qualification: 0.45,
  statedUtility: 0.35,
  learnedInterest: 0.15,
  opportunityQuality: 0.05,
};

const TIER_PATTERN: readonly ForYouTier[] = [
  "ready_now",
  "ready_now",
  "ready_now",
  "credible_stretch",
  "ready_now",
  "ready_now",
  "discovery",
  "ready_now",
  "credible_stretch",
  "ready_now",
];

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
]);

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function scoreRecommendation(
  components: RecommendationComponents,
) {
  return Number(
    (
      clampScore(components.qualification) * WEIGHTS.qualification +
      clampScore(components.statedUtility) * WEIGHTS.statedUtility +
      clampScore(components.learnedInterest) * WEIGHTS.learnedInterest +
      clampScore(components.opportunityQuality) * WEIGHTS.opportunityQuality
    ).toFixed(1),
  );
}

/**
 * Unknown experience is not treated as a failure. It remains visible through
 * evidenceConfidence and the card risk instead of fabricating a blocker.
 */
export function classifyForYouTier(
  candidate: ForYouCandidate,
): ForYouTier | null {
  if (!candidate.passesHardConstraints) return null;

  const qualification = clampScore(candidate.components.qualification);
  const utility = clampScore(candidate.components.statedUtility);
  const experienceGap = candidate.experienceGapYears;
  const withinReadyExperience = experienceGap === null || experienceGap <= 1;
  const withinStretchExperience = experienceGap === null || experienceGap <= 2;

  if (
    qualification >= 70 &&
    clampScore(candidate.roleAffinity) >= 75 &&
    withinReadyExperience &&
    candidate.materialGapCount <= 1
  ) {
    return "ready_now";
  }

  if (
    qualification >= 55 &&
    withinStretchExperience &&
    candidate.materialGapCount <= 1
  ) {
    return "credible_stretch";
  }

  if (qualification >= 45 && utility >= 65) return "discovery";
  return null;
}

function normalizedCompany(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function titleTokens(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9+#.]+/)
    .filter((token) => token.length >= 2 && !TITLE_STOP_WORDS.has(token));
}

function tokenOverlap(left: readonly string[], right: readonly string[]) {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of left) {
    if (rightSet.has(token)) intersection += 1;
  }
  return intersection / Math.min(left.length, right.length);
}

function diversityPenalty(
  candidate: ForYouRecommendation,
  selected: readonly ForYouRecommendation[],
) {
  const recent = selected.slice(-4);
  let penalty = 0;
  const company = normalizedCompany(candidate.company);
  const tokens = titleTokens(candidate.title);
  if (recent.some((item) => normalizedCompany(item.company) === company)) {
    penalty += 7;
  }
  if (
    recent.some(
      (item) => tokenOverlap(titleTokens(item.title), tokens) >= 0.6,
    )
  ) {
    penalty += 2;
  }
  return penalty;
}

function stableTieBreak(candidate: ForYouRecommendation) {
  let hash = 2_166_136_261;
  for (const character of `${FOR_YOU_RECOMMENDER_VERSION}:${candidate.id}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function takeBest(
  pool: ForYouRecommendation[],
  selected: readonly ForYouRecommendation[],
) {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestTieBreak = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < pool.length; index += 1) {
    const candidate = pool[index];
    if (!candidate) continue;
    const score = candidate.score - diversityPenalty(candidate, selected);
    const tieBreak = stableTieBreak(candidate);
    if (score > bestScore || (score === bestScore && tieBreak > bestTieBreak)) {
      bestIndex = index;
      bestScore = score;
      bestTieBreak = tieBreak;
    }
  }

  if (bestIndex < 0) return null;
  const [chosen] = pool.splice(bestIndex, 1);
  return chosen ?? null;
}

function fallbackTiers(preferred: ForYouTier): readonly ForYouTier[] {
  if (preferred === "ready_now") {
    return ["ready_now", "credible_stretch", "discovery"];
  }
  if (preferred === "credible_stretch") {
    return ["credible_stretch", "ready_now", "discovery"];
  }
  return ["discovery", "ready_now", "credible_stretch"];
}

/**
 * Produces a deterministic, diverse queue whose ten-card cadence is 7/2/1
 * whenever supply allows. Missing tiers are filled by the strongest remaining
 * admitted roles; the function never manufactures cards to satisfy the mix.
 */
export function buildForYouQueue(
  candidates: readonly ForYouCandidate[],
  options: { limit?: number } = {},
): ForYouRecommendation[] {
  const pools: Record<ForYouTier, ForYouRecommendation[]> = {
    ready_now: [],
    credible_stretch: [],
    discovery: [],
  };

  for (const candidate of candidates) {
    const tier = classifyForYouTier(candidate);
    if (!tier) continue;
    pools[tier].push({
      ...candidate,
      tier,
      score: scoreRecommendation(candidate.components),
      modelVersion: FOR_YOU_RECOMMENDER_VERSION,
    });
  }

  const available =
    pools.ready_now.length +
    pools.credible_stretch.length +
    pools.discovery.length;
  const requestedLimit = options.limit ?? available;
  const limit = Math.min(available, Math.max(0, Math.trunc(requestedLimit)));
  const selected: ForYouRecommendation[] = [];

  while (selected.length < limit) {
    const preferred = TIER_PATTERN[selected.length % TIER_PATTERN.length];
    if (!preferred) break;
    let chosen: ForYouRecommendation | null = null;
    for (const tier of fallbackTiers(preferred)) {
      chosen = takeBest(pools[tier], selected);
      if (chosen) break;
    }
    if (!chosen) break;
    selected.push(chosen);
  }

  return selected;
}
