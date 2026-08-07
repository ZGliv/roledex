import { describe, expect, it } from "vitest";

import {
  buildPreferenceModel,
  rankPersonalizedJobs,
  type PersonalizationCandidate,
  type PreferenceObservation,
} from "@/features/personalization/rank-jobs";

const profileContext = {
  profileRevision: 4,
  profileUpdatedAt: "2026-08-01T12:00:00.000Z",
};

function observation(
  overrides: Partial<PreferenceObservation> & Pick<PreferenceObservation, "jobId" | "decision">,
): PreferenceObservation {
  return {
    title: "AI Implementation Specialist",
    company: "Acme",
    location: "Remote — United States",
    workArrangement: "remote",
    observedAt: "2026-08-02T12:00:00.000Z",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<PersonalizationCandidate> & Pick<PersonalizationCandidate, "jobId">,
): PersonalizationCandidate {
  return {
    title: "Business Operations Analyst",
    company: "Example Co",
    location: "Pittsburgh, PA",
    workArrangement: "hybrid",
    deterministicFitScoreOutOf100: 70,
    postedAt: "2026-07-25T12:00:00.000Z",
    discoveredAt: "2026-07-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("swipe-informed ranking", () => {
  it("learns role and arrangement preferences from right and left decisions", () => {
    const model = buildPreferenceModel(
      [
        observation({ jobId: "saved-1", decision: "saved" }),
        observation({ jobId: "saved-2", decision: "apply", company: "Beta" }),
        observation({
          jobId: "skipped-1",
          decision: "skipped",
          title: "On-site Help Desk Technician",
          company: "Gamma",
          location: "Cleveland, OH",
          workArrangement: "on_site",
        }),
      ],
      profileContext,
    );
    const ranked = rankPersonalizedJobs(
      [
        candidate({
          jobId: "implementation",
          title: "AI Implementation Consultant",
          company: "Delta",
          location: "Remote",
          workArrangement: "remote",
        }),
        candidate({
          jobId: "help-desk",
          title: "Help Desk Technician",
          company: "Epsilon",
          location: "Cleveland, OH",
          workArrangement: "on_site",
        }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked.map((item) => item.jobId)).toEqual([
      "implementation",
      "help-desk",
    ]);
    expect(ranked[0]?.personalizationAdjustment).toBeGreaterThan(
      ranked[1]?.personalizationAdjustment ?? 0,
    );
    expect(ranked[0]?.personalizationReasons.join(" ")).toContain(
      "Learns from your saves",
    );
    expect(model.positiveSignalCount).toBe(2);
    expect(model.negativeSignalCount).toBe(1);
  });

  it("shrinks a single swipe so it cannot overpower a large fit difference", () => {
    const model = buildPreferenceModel(
      [observation({ jobId: "saved-1", decision: "saved" })],
      profileContext,
    );
    const ranked = rankPersonalizedJobs(
      [
        candidate({
          jobId: "learned",
          title: "AI Implementation Specialist",
          workArrangement: "remote",
          deterministicFitScoreOutOf100: 62,
        }),
        candidate({ jobId: "strong-fit", deterministicFitScoreOutOf100: 82 }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked[0]?.jobId).toBe("strong-fit");
  });

  it("keeps the documented 0–100 score scale and uses estimated pay only as a low-weight signal", () => {
    const model = buildPreferenceModel([], profileContext);
    const [ranked] = rankPersonalizedJobs(
      [
        candidate({
          jobId: "pay-fit",
          deterministicFitScoreOutOf100: 75,
          postedAt: "2026-06-20T12:00:00.000Z",
          marketSalaryIsEstimate: true,
          marketSalaryConfidence: "medium",
          marketSalaryAnnualMinimumCents: 9_000_000,
          marketSalaryAnnualMaximumCents: 12_000_000,
          preferredSalaryMinimumAnnualCents: 7_500_000,
          preferredSalaryTargetAnnualCents: 8_500_000,
        }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked?.personalizationScore).toBe(76.2);
    expect(ranked?.personalizationAdjustment).toBe(1.2);
    expect(ranked?.personalizationReasons).toContain(
      "Estimated range clears your pay target",
    );
    expect(ranked?.personalizationScore).toBeLessThanOrEqual(100);
  });

  it("refreshes the model version at a profile revision and discounts older swipes", () => {
    const oldObservation = observation({
      jobId: "old",
      decision: "saved",
      observedAt: "2026-07-01T12:00:00.000Z",
    });
    const newObservation = observation({
      jobId: "new",
      decision: "saved",
      observedAt: "2026-08-02T12:00:00.000Z",
    });
    const oldOnly = buildPreferenceModel([oldObservation], profileContext);
    const newOnly = buildPreferenceModel([newObservation], profileContext);
    const oldSignal = oldOnly.features.get("title:implementation");
    const newSignal = newOnly.features.get("title:implementation");

    expect(oldOnly.version).toBe("swipe-preferences-v1:profile-4");
    expect(oldSignal?.signedWeight).toBeCloseTo(0.55);
    expect(newSignal?.signedWeight).toBe(1);
  });

  it("mixes in deterministic exploration after enough observations", () => {
    const model = buildPreferenceModel(
      [
        observation({ jobId: "1", decision: "saved" }),
        observation({ jobId: "2", decision: "saved" }),
        observation({ jobId: "3", decision: "skipped" }),
        observation({ jobId: "4", decision: "saved" }),
      ],
      profileContext,
    );
    const [ranked] = rankPersonalizedJobs(
      [
        candidate({
          jobId: "novel",
          title: "Healthcare Product Analyst",
          company: "Never Seen",
          workArrangement: "hybrid",
        }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked?.isExploration).toBe(true);
    expect(ranked?.personalizationReasons).toContain(
      "Adds useful variety to your feed",
    );
  });

  it("avoids adjacent cards from the same company when comparable alternatives exist", () => {
    const model = buildPreferenceModel([], profileContext);
    const ranked = rankPersonalizedJobs(
      [
        candidate({ jobId: "acme-1", company: "Acme", deterministicFitScoreOutOf100: 80 }),
        candidate({ jobId: "acme-2", company: "Acme", deterministicFitScoreOutOf100: 79.5 }),
        candidate({ jobId: "beta", company: "Beta", deterministicFitScoreOutOf100: 77 }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked.map((item) => item.jobId)).toEqual(["acme-1", "beta", "acme-2"]);
  });

  it("is stable for the same inputs and clock", () => {
    const model = buildPreferenceModel([], profileContext);
    const candidates = [
      candidate({ jobId: "a", deterministicFitScoreOutOf100: 70 }),
      candidate({ jobId: "b", deterministicFitScoreOutOf100: 70 }),
      candidate({ jobId: "c", deterministicFitScoreOutOf100: 70 }),
    ];
    const now = new Date("2026-08-05T12:00:00.000Z");

    expect(rankPersonalizedJobs(candidates, model, now)).toEqual(
      rankPersonalizedJobs(candidates, model, now),
    );
  });
});
