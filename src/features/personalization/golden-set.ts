import type { ForYouTier } from "@/features/personalization/recommender-v2";

export type GoldenDisposition = "ready_now" | "credible_stretch" | "exclude";

export interface GoldenJobLabel {
  jobId: string;
  disposition: GoldenDisposition;
  hardConflictReasons?: readonly string[];
}

export interface EvaluatedRecommendation {
  jobId: string;
  tier: ForYouTier;
}

export interface GoldenSetReport {
  evaluatedTopCount: number;
  expectedReadyNow: number;
  expectedCredibleStretch: number;
  expectedExcluded: number;
  unlabeled: number;
  topRelevanceRate: number;
  hardConflictLeakRate: number;
  tierAgreementRate: number;
  passedOwnerGate: boolean;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Offline acceptance harness for a human-labeled set. The owner gate is
 * intentionally stricter than general ranking metrics: at least 14 of the top
 * 20 must be Ready Now and no explicitly excluded role may leak into the deck.
 */
export function evaluateGoldenSet(
  recommendations: readonly EvaluatedRecommendation[],
  labels: readonly GoldenJobLabel[],
  topCount = 20,
): GoldenSetReport {
  const top = recommendations.slice(0, Math.max(0, Math.trunc(topCount)));
  const labelByJobId = new Map(labels.map((label) => [label.jobId, label]));
  let expectedReadyNow = 0;
  let expectedCredibleStretch = 0;
  let expectedExcluded = 0;
  let unlabeled = 0;
  let tierAgreement = 0;

  for (const recommendation of top) {
    const label = labelByJobId.get(recommendation.jobId);
    if (!label) {
      unlabeled += 1;
      continue;
    }
    if (label.disposition === "ready_now") expectedReadyNow += 1;
    if (label.disposition === "credible_stretch") {
      expectedCredibleStretch += 1;
    }
    if (label.disposition === "exclude") expectedExcluded += 1;
    if (label.disposition === recommendation.tier) tierAgreement += 1;
  }

  const labeled = top.length - unlabeled;
  const relevant = expectedReadyNow + expectedCredibleStretch;
  const hardConflictLeakRate = ratio(expectedExcluded, labeled);
  return {
    evaluatedTopCount: top.length,
    expectedReadyNow,
    expectedCredibleStretch,
    expectedExcluded,
    unlabeled,
    topRelevanceRate: ratio(relevant, labeled),
    hardConflictLeakRate,
    tierAgreementRate: ratio(tierAgreement, labeled),
    passedOwnerGate:
      top.length >= 20 && expectedReadyNow >= 14 && expectedExcluded === 0,
  };
}
