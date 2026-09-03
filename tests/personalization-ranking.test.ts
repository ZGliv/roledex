import { describe, expect, it } from "vitest";

import type { JobDecisionReason } from "@/db/schema";
import {
  buildPreferenceModel,
  rankPersonalizedJobs,
  summarizePreferenceModel,
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
  it("projects conservative, human-readable learned signals with stable keys", () => {
    const model = buildPreferenceModel(
      [
        observation({
          jobId: "remote-pass",
          decision: "skipped",
          reasonCodes: ["wrong_work_mode"],
        }),
      ],
      profileContext,
    );

    const first = summarizePreferenceModel(model);
    const second = summarizePreferenceModel(model);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      confidence: "early",
      signalCount: 1,
      positiveSignalCount: 0,
      negativeSignalCount: 1,
      signals: [
        {
          key: "preference:arrangement:remote",
          featureKey: "arrangement:remote",
          direction: "down",
          label: "Remote roles are trending down in your decisions",
          observationCount: 1,
          confidence: "early",
        },
      ],
    });
    expect(first.signals[0]?.score).toBeLessThan(0);
  });

  it("does not overstate confidence before five preference observations", () => {
    const four = buildPreferenceModel(
      [1, 2, 3, 4].map((index) =>
        observation({ jobId: `early-${index}`, decision: "saved" }),
      ),
      profileContext,
    );
    const five = buildPreferenceModel(
      [1, 2, 3, 4, 5].map((index) =>
        observation({ jobId: `developing-${index}`, decision: "saved" }),
      ),
      profileContext,
    );

    expect(summarizePreferenceModel(buildPreferenceModel([], profileContext))).toMatchObject({
      confidence: "none",
      signalCount: 0,
      signals: [],
    });
    expect(summarizePreferenceModel(four).confidence).toBe("early");
    expect(summarizePreferenceModel(five)).toMatchObject({
      confidence: "developing",
      signalCount: 5,
    });
  });

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

  it("maps structured pass reasons only to their relevant feature families", () => {
    const cases: readonly {
      expectedFeatures: readonly string[];
      reasonCode: JobDecisionReason;
    }[] = [
      {
        reasonCode: "wrong_role",
        expectedFeatures: [
          "title:ai",
          "title:implementation",
          "title:specialist",
        ],
      },
      {
        reasonCode: "too_senior",
        expectedFeatures: ["seniority:senior", "experience:6-8"],
      },
      {
        reasonCode: "pay_too_low",
        expectedFeatures: [
          "salary-min:50k-75k",
          "salary-max:50k-75k",
          "salary-mid:50k-75k",
        ],
      },
      {
        reasonCode: "wrong_location",
        expectedFeatures: ["location:remote"],
      },
      {
        reasonCode: "wrong_work_mode",
        expectedFeatures: ["arrangement:remote"],
      },
      {
        reasonCode: "company_or_industry",
        expectedFeatures: ["company:acme", "industry:financial-technology"],
      },
    ];

    for (const { expectedFeatures, reasonCode } of cases) {
      const model = buildPreferenceModel(
        [
          observation({
            jobId: reasonCode,
            decision: "skipped",
            reasonCodes: [reasonCode],
            seniority: "senior",
            yearsExperienceMinimum: 6,
            yearsExperienceMaximum: 8,
            salaryAnnualMinimumCents: 5_000_000,
            salaryAnnualMaximumCents: 6_000_000,
            industry: "Financial Technology",
          }),
        ],
        profileContext,
      );

      expect([...model.features.keys()].sort()).toEqual(
        [...expectedFeatures].sort(),
      );
      expect(model.negativeSignalCount).toBe(1);
    }
  });

  it("does not learn a preference from stale, duplicate, or unclassified passes", () => {
    for (const reasonCode of ["stale_or_duplicate", "other"] as const) {
      const model = buildPreferenceModel(
        [
          observation({
            jobId: reasonCode,
            decision: "skipped",
            reasonCodes: [reasonCode],
          }),
        ],
        profileContext,
      );

      expect(model.signalCount).toBe(0);
      expect(model.negativeSignalCount).toBe(0);
      expect(model.features.size).toBe(0);
    }
  });

  it("keeps legacy passes weak and broad while saves teach role interest only", () => {
    const legacyPass = observation({
      jobId: "legacy",
      decision: "skipped",
      seniority: "senior",
      industry: "Financial Technology",
    });
    const omittedReasons = buildPreferenceModel([legacyPass], profileContext);
    const emptyReasons = buildPreferenceModel(
      [{ ...legacyPass, reasonCodes: [] }],
      profileContext,
    );

    expect([...emptyReasons.features.entries()]).toEqual([
      ...omittedReasons.features.entries(),
    ]);
    expect(emptyReasons.features.has("company:acme")).toBe(true);
    expect(emptyReasons.features.has("arrangement:remote")).toBe(true);
    expect(emptyReasons.features.has("seniority:senior")).toBe(false);
    expect(emptyReasons.features.get("company:acme")?.signedWeight).toBe(-0.1);

    const saved = buildPreferenceModel(
      [
        observation({
          jobId: "saved-with-metadata",
          decision: "saved",
          seniority: "senior",
          yearsExperienceMinimum: 6,
          salaryAnnualMinimumCents: 5_000_000,
          salaryAnnualMaximumCents: 6_000_000,
          industry: "Financial Technology",
        }),
      ],
      profileContext,
    );
    expect([...saved.features.keys()]).toEqual([
      "title:ai",
      "title:implementation",
      "title:specialist",
    ]);
  });

  it("attributes an explained save only to what the user selected", () => {
    const model = buildPreferenceModel(
      [
        observation({
          jobId: "pay-and-mode-save",
          decision: "saved",
          reasonCodes: ["liked_pay", "liked_work_mode"],
          salaryAnnualMinimumCents: 7_500_000,
          salaryAnnualMaximumCents: 9_000_000,
          industry: "Financial Technology",
        }),
      ],
      profileContext,
    );

    expect([...model.features.keys()].sort()).toEqual([
      "arrangement:remote",
      "salary-max:75k-100k",
      "salary-mid:75k-100k",
      "salary-min:75k-100k",
    ]);
    expect(model.features.has("company:acme")).toBe(false);
    expect(model.features.has("title:implementation")).toBe(false);
    expect(model.features.has("industry:financial-technology")).toBe(false);
  });

  it("uses a work-mode pass to rerank work modes without poisoning the role", () => {
    const model = buildPreferenceModel(
      [
        observation({
          jobId: "remote-pass",
          decision: "skipped",
          reasonCodes: ["wrong_work_mode"],
        }),
      ],
      profileContext,
    );
    const ranked = rankPersonalizedJobs(
      [
        candidate({
          jobId: "remote",
          title: "AI Implementation Specialist",
          location: "Remote",
          workArrangement: "remote",
        }),
        candidate({
          jobId: "hybrid",
          title: "AI Implementation Specialist",
          location: "Pittsburgh, PA",
          workArrangement: "hybrid",
        }),
      ],
      model,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(ranked.map((item) => item.jobId)).toEqual(["hybrid", "remote"]);
    expect(model.features.has("title:implementation")).toBe(false);
  });

  it("layers More, Less, and Ignore over the learned baseline without deleting it", () => {
    const observations = [
      observation({
        jobId: "remote-pass",
        decision: "skipped",
        reasonCodes: ["wrong_work_mode"],
      }),
    ];
    const candidates = [
      candidate({
        jobId: "remote",
        title: "AI Implementation Specialist",
        location: "Remote",
        workArrangement: "remote",
      }),
      candidate({
        jobId: "hybrid",
        title: "AI Implementation Specialist",
        location: "Pittsburgh, PA",
        workArrangement: "hybrid",
      }),
    ];
    const now = new Date("2026-08-05T12:00:00.000Z");
    const baseline = buildPreferenceModel(observations, profileContext);
    const more = buildPreferenceModel(observations, {
      ...profileContext,
      preferenceOverrides: [
        { featureKey: "arrangement:remote", mode: "more" },
      ],
    });
    const less = buildPreferenceModel(observations, {
      ...profileContext,
      preferenceOverrides: [
        { featureKey: "arrangement:remote", mode: "less" },
      ],
    });
    const ignored = buildPreferenceModel(observations, {
      ...profileContext,
      preferenceOverrides: [
        { featureKey: "arrangement:remote", mode: "ignore" },
      ],
    });

    const adjustment = (model: typeof baseline) =>
      rankPersonalizedJobs(candidates, model, now).find(
        (item) => item.jobId === "remote",
      )?.personalizationAdjustment ?? 0;

    expect(adjustment(more)).toBeGreaterThan(adjustment(ignored));
    expect(adjustment(ignored)).toBeGreaterThan(adjustment(baseline));
    expect(adjustment(less)).toBeLessThan(adjustment(ignored));
    expect(more.features.get("arrangement:remote")).toEqual(
      baseline.features.get("arrangement:remote"),
    );
    expect(rankPersonalizedJobs(candidates, more, now)[0]?.jobId).toBe("remote");
  });

  it("marks effective and learned state separately in preference summaries", () => {
    const observations = [
      observation({
        jobId: "remote-pass",
        decision: "skipped",
        reasonCodes: ["wrong_work_mode"],
      }),
    ];
    const ignored = summarizePreferenceModel(
      buildPreferenceModel(observations, {
        ...profileContext,
        preferenceOverrides: [
          { featureKey: "arrangement:remote", mode: "ignore" },
        ],
      }),
    );

    expect(ignored).toMatchObject({ overrideCount: 1 });
    expect(ignored.signals[0]).toMatchObject({
      featureKey: "arrangement:remote",
      direction: "neutral",
      learnedDirection: "down",
      override: "ignore",
      score: 0,
    });
    expect(ignored.signals[0]?.learnedScore).toBeLessThan(0);
    expect(ignored.signals[0]?.label).toContain("ignored when ranking");
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

    expect(oldOnly.version).toBe("swipe-preferences-v3:profile-4");
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
