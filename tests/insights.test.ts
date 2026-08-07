import { describe, expect, it } from "vitest";

import {
  aggregateMarketInsights,
  type MarketInsightJobInput,
} from "@/features/insights/aggregate";

function job(
  overrides: Partial<MarketInsightJobInput> = {},
): MarketInsightJobInput {
  return {
    company: "Acme",
    fitCoveragePercent: 70,
    fitScore: 70,
    salaryCurrency: "USD",
    salaryMaximumCents: null,
    salaryMinimumCents: null,
    salaryPeriod: "year",
    salarySource: "unknown",
    technologies: [],
    workArrangement: "unclear",
    ...overrides,
  };
}

describe("aggregateMarketInsights", () => {
  it("returns explicit zero-data metrics without inventing a recommendation", () => {
    const result = aggregateMarketInsights({ candidateSkills: [], jobs: [] });

    expect(result.sampleSize).toBe(0);
    expect(result.fit.averageScore).toBeNull();
    expect(result.fit.bands.map((band) => band.count)).toEqual([0, 0, 0, 0]);
    expect(result.salary.knownPercentage).toBe(0);
    expect(result.technologies).toEqual([]);
    expect(result.skillGaps).toEqual([]);
    expect(result.recommendedSprint).toBeNull();
  });

  it("aggregates fit, arrangement, company, and salary metrics from the active sample", () => {
    const result = aggregateMarketInsights({
      candidateSkills: ["SQL", "AWS"],
      jobs: [
        job({
          company: "Acme",
          fitCoveragePercent: 80,
          fitScore: 82,
          salaryMaximumCents: 9_000_000,
          salaryMinimumCents: 7_000_000,
          salarySource: "employer_posted",
          technologies: ["SQL", "Docker", "Docker"],
          workArrangement: "remote",
        }),
        job({
          company: "Beta",
          fitCoveragePercent: 60,
          fitScore: 68,
          salaryMaximumCents: 5_000,
          salaryMinimumCents: 4_000,
          salaryPeriod: "hour",
          salarySource: "external_estimate",
          technologies: ["sql", "Docker", "Kubernetes"],
          workArrangement: "hybrid",
        }),
        job({
          company: "Acme",
          fitCoveragePercent: 40,
          fitScore: 52,
          technologies: ["Kubernetes", "AWS"],
        }),
      ],
    });

    expect(result.sampleSize).toBe(3);
    expect(result.fit).toMatchObject({
      averageCoveragePercent: 60,
      averageScore: 67.3,
      medianScore: 68,
      scoredCount: 3,
    });
    expect(result.fit.bands.map(({ count, key }) => [key, count])).toEqual([
      ["high", 1],
      ["promising", 1],
      ["stretch", 1],
      ["low", 0],
    ]);
    expect(result.workArrangements.map(({ count, key }) => [key, count])).toEqual([
      ["remote", 1],
      ["hybrid", 1],
      ["on_site", 0],
      ["unclear", 1],
    ]);
    expect(result.companies[0]).toMatchObject({ count: 2, label: "Acme", percentage: 66.7 });
    expect(result.salary).toMatchObject({
      comparableAnnualUsdCount: 1,
      completeAnnualRangeCount: 1,
      employerPostedCount: 1,
      estimatedCount: 1,
      knownCount: 2,
      knownPercentage: 66.7,
      medianAnnualMidpointCents: 8_000_000,
      observedHighestCeilingCents: 9_000_000,
      observedLowestFloorCents: 7_000_000,
    });
  });

  it("counts a technology once per listing and excludes normalized profile skills from gaps", () => {
    const result = aggregateMarketInsights({
      candidateSkills: ["Node.js", "Git/GitHub"],
      jobs: [
        job({ technologies: ["nodejs", "Node.js", "GitHub", "Terraform"] }),
        job({ company: "Beta", technologies: ["Terraform", "GitHub"] }),
      ],
    });

    expect(result.technologies.find((item) => item.label === "Node.js")).toMatchObject({
      count: 1,
      isCandidateSkill: true,
    });
    expect(result.technologies.find((item) => item.label === "GitHub")).toMatchObject({
      count: 2,
      isCandidateSkill: true,
    });
    expect(result.skillGaps).toEqual([
      expect.objectContaining({ count: 2, isCandidateSkill: false, label: "Terraform" }),
    ]);
  });

  it("chooses one deterministic sprint from the most repeated missing technology", () => {
    const result = aggregateMarketInsights({
      candidateSkills: [],
      jobs: [
        job({ technologies: ["Kubernetes", "Docker"] }),
        job({ company: "Beta", technologies: ["Docker", "Kubernetes"] }),
        job({ company: "Gamma", technologies: ["Terraform"] }),
      ],
    });

    expect(result.skillGaps.map((gap) => gap.label)).toEqual(["Docker", "Kubernetes"]);
    expect(result.recommendedSprint).toMatchObject({
      evidenceCount: 2,
      evidencePercentage: 66.7,
      skill: "Docker",
    });
    expect(result.recommendedSprint?.rationale).toContain("2 of 3 active roles");
  });

  it("does not manufacture a midpoint from a one-sided salary bound", () => {
    const result = aggregateMarketInsights({
      candidateSkills: [],
      jobs: [job({ salaryMinimumCents: 6_500_000, salarySource: "employer_posted" })],
    });

    expect(result.salary.comparableAnnualUsdCount).toBe(1);
    expect(result.salary.completeAnnualRangeCount).toBe(0);
    expect(result.salary.medianAnnualMidpointCents).toBeNull();
    expect(result.salary.observedLowestFloorCents).toBe(6_500_000);
    expect(result.salary.observedHighestCeilingCents).toBeNull();
  });
});
