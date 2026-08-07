import { describe, expect, it } from "vitest";

import {
  SALARY_BENCHMARK_SOURCE,
  SALARY_MODEL_VERSION,
  salaryPresentationForJob,
  type SalaryPresentationInput,
} from "@/features/salary/presentation";

const baseInput: SalaryPresentationInput = {
  company: "Example Systems",
  title: "Implementation Specialist",
  location: "Pittsburgh, PA",
  workArrangement: "hybrid",
  seniority: "entry",
  salaryMinimumCents: null,
  salaryMaximumCents: null,
  salaryCurrency: "USD",
  salaryPeriod: "year",
  salarySource: "unknown",
  sourceUrl: "https://example.com/jobs/implementation",
};

describe("salaryPresentationForJob", () => {
  it("always preserves an employer-posted range as the authoritative salary", () => {
    const result = salaryPresentationForJob({
      ...baseInput,
      salaryMinimumCents: 8_000_000,
      salaryMaximumCents: 10_000_000,
      salarySource: "employer_posted",
    });

    expect(result).toMatchObject({
      display: "$80,000–$100,000/yr",
      source: "employer_posted",
      isEstimate: false,
      confidence: "high",
      annualMinimumCents: 8_000_000,
      annualMaximumCents: 10_000_000,
      annualMidpointCents: 9_000_000,
      modelVersion: "employer-posted",
      benchmarkOccupation: null,
    });
    expect(result.method).not.toContain("BLS");
    expect(result.sourceUrl).toBe(baseInput.sourceUrl);
  });

  it("annualizes employer-posted hourly pay only for comparison", () => {
    const result = salaryPresentationForJob({
      ...baseInput,
      salaryMinimumCents: 4_000,
      salaryMaximumCents: 5_000,
      salaryPeriod: "hour",
      salarySource: "employer_posted",
    });

    expect(result.display).toBe("$40–$50/hr");
    expect(result.annualMinimumCents).toBe(8_320_000);
    expect(result.annualMaximumCents).toBe(10_400_000);
    expect(result.method).toContain("2,080 hours");
  });

  it("fills missing pay with an explicitly labeled, broad BLS market estimate", () => {
    const result = salaryPresentationForJob(baseInput);

    expect(result.display).toMatch(/^Est\. \$\d/);
    expect(result.display).not.toContain("Salary not posted");
    expect(result).toMatchObject({
      source: "market_estimate",
      isEstimate: true,
      confidence: "medium",
      benchmarkOccupation: "Computer Systems Analysts",
      sourceName: SALARY_BENCHMARK_SOURCE.name,
      sourceUrl: SALARY_BENCHMARK_SOURCE.url,
      modelVersion: SALARY_MODEL_VERSION,
    });
    expect(result.disclosure).toBe(
      "Estimated market base pay — not posted by Example Systems",
    );
    expect(result.method).toContain("May 2025 BLS national annual mean");
    expect(result.method).toContain("entry/associate band");
    expect(result.method).toContain("below-national-market adjustment");
    expect(result.annualMaximumCents).toBeGreaterThan(result.annualMinimumCents);
  });

  it("does not relabel a stored external estimate as employer-posted", () => {
    const result = salaryPresentationForJob({
      ...baseInput,
      salaryMinimumCents: 99_000_000,
      salaryMaximumCents: 100_000_000,
      salarySource: "external_estimate",
    });

    expect(result.source).toBe("market_estimate");
    expect(result.isEstimate).toBe(true);
    expect(result.display).not.toContain("$990,000");
    expect(result.disclosure).toContain("not posted by Example Systems");
  });

  it("uses a national baseline for remote roles rather than inventing a city premium", () => {
    const remote = salaryPresentationForJob({
      ...baseInput,
      title: "Junior Solutions Engineer",
      location: "Remote — San Francisco, CA",
      workArrangement: "remote",
    });
    const onSite = salaryPresentationForJob({
      ...baseInput,
      title: "Junior Solutions Engineer",
      location: "San Francisco, CA",
      workArrangement: "on_site",
    });

    expect(remote.benchmarkOccupation).toBe("Sales Engineers");
    expect(remote.method).toContain("remote role; no local premium assumed");
    expect(onSite.method).toContain("high-cost-market adjustment");
    expect(onSite.annualMidpointCents).toBeGreaterThan(remote.annualMidpointCents);
  });

  it("falls back honestly to a low-confidence all-occupations band", () => {
    const result = salaryPresentationForJob({
      ...baseInput,
      title: "Chief Mystery Wrangler",
      location: null,
      workArrangement: "unclear",
      seniority: null,
    });

    expect(result.source).toBe("market_estimate");
    expect(result.confidence).toBe("low");
    expect(result.benchmarkOccupation).toBe("All Occupations");
    expect(result.method).toContain("directional");
  });
});
