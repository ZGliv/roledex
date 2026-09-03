import { describe, expect, it } from "vitest";

import {
  evaluateGoldenSet,
  type GoldenJobLabel,
} from "@/features/personalization/golden-set";

describe("recommender golden-set acceptance", () => {
  it("passes the owner gate only with at least 14 ready roles and no exclusions", () => {
    const recommendations = Array.from({ length: 20 }, (_, index) => ({
      jobId: `job-${index}`,
      tier: index < 14 ? ("ready_now" as const) : ("credible_stretch" as const),
    }));
    const labels: GoldenJobLabel[] = recommendations.map((item) => ({
      jobId: item.jobId,
      disposition: item.tier,
    }));

    expect(evaluateGoldenSet(recommendations, labels)).toMatchObject({
      evaluatedTopCount: 20,
      expectedReadyNow: 14,
      expectedCredibleStretch: 6,
      expectedExcluded: 0,
      topRelevanceRate: 1,
      hardConflictLeakRate: 0,
      tierAgreementRate: 1,
      passedOwnerGate: true,
    });
  });

  it("fails loudly when a hard conflict leaks into the top results", () => {
    const recommendations = Array.from({ length: 20 }, (_, index) => ({
      jobId: `job-${index}`,
      tier: "ready_now" as const,
    }));
    const labels: GoldenJobLabel[] = recommendations.map((item, index) => ({
      jobId: item.jobId,
      disposition: index === 0 ? "exclude" : "ready_now",
      hardConflictReasons: index === 0 ? ["posted pay below floor"] : [],
    }));

    const report = evaluateGoldenSet(recommendations, labels);
    expect(report.expectedExcluded).toBe(1);
    expect(report.hardConflictLeakRate).toBe(0.05);
    expect(report.passedOwnerGate).toBe(false);
  });

  it("does not count unlabeled inventory as relevant evidence", () => {
    const report = evaluateGoldenSet(
      [
        { jobId: "labeled", tier: "ready_now" },
        { jobId: "unknown", tier: "discovery" },
      ],
      [{ jobId: "labeled", disposition: "ready_now" }],
      2,
    );
    expect(report.unlabeled).toBe(1);
    expect(report.topRelevanceRate).toBe(1);
    expect(report.passedOwnerGate).toBe(false);
  });
});
