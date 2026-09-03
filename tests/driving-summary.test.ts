import { describe, expect, it } from "vitest";

import {
  buildSpokenJobSummary,
  type SpokenJobSummarySource,
} from "@/features/driving/summary";

function source(
  overrides: Partial<SpokenJobSummarySource> = {},
): SpokenJobSummarySource {
  return {
    biggestGaps: ["The listing asks for two years of implementation experience."],
    company: "Acme Health",
    location: "Remote — United States",
    reasonsNotToApply: ["The role may be more support-heavy than product-focused."],
    responsibilities: ["Guide customers through onboarding and workflow configuration."],
    salaryDisplay: "$70,000–$85,000/yr",
    salarySource: "employer_posted",
    strongestMatches: ["Customer support and product-building experience overlap."],
    summary: "Help customers adopt the company platform.",
    title: "Implementation Specialist",
    verdict: "Apply as a Stretch",
    verdictExplanation: "The transferable experience is credible, but positioning matters.",
    workArrangement: "Remote",
    ...overrides,
  };
}

describe("buildSpokenJobSummary", () => {
  it("builds the complete spoken gauntlet from stored job fields", () => {
    const result = buildSpokenJobSummary(source());

    expect(result.dayToDay).toBe(
      "Guide customers through onboarding and workflow configuration.",
    );
    expect(result.match).toBe(
      "Customer support and product-building experience overlap.",
    );
    expect(result.spokenText).toContain(
      "This is Implementation Specialist at Acme Health.",
    );
    expect(result.spokenText).toContain(
      "Employer-posted compensation: $70,000–$85,000/yr.",
    );
    expect(result.spokenText).toContain(
      "Biggest qualification gap: The listing asks for two years of implementation experience.",
    );
    expect(result.spokenText).toContain("RoleDex verdict: Apply as a Stretch.");
    expect(result.spokenText).toContain("Question for reflection:");
  });

  it("labels an external estimate and uses the stored summary when duties are absent", () => {
    const result = buildSpokenJobSummary(
      source({
        responsibilities: [],
        salaryDisplay: "$82,000/yr",
        salarySource: "externally_estimated",
        summary: "Investigate customer workflows and document automation opportunities.",
      }),
    );

    expect(result.dayToDay).toBe(
      "Investigate customer workflows and document automation opportunities.",
    );
    expect(result.spokenText).toContain(
      "Externally estimated compensation: $82,000/yr.",
    );
  });

  it("states missing evidence instead of manufacturing a match or qualification gap", () => {
    const result = buildSpokenJobSummary(
      source({
        biggestGaps: [],
        strongestMatches: [],
      }),
    );

    expect(result.match).toBe(
      "The stored analysis did not identify a strong candidate match",
    );
    expect(result.gap).toBe(
      "The stored analysis did not identify a specific qualification gap",
    );
    expect(result.spokenText).not.toContain("probably");
  });

  it("keeps narration concise and uses only the first populated responsibility", () => {
    const longResponsibility = `Lead ${"a detailed customer workflow ".repeat(20)}`;
    const result = buildSpokenJobSummary(
      source({
        responsibilities: ["", longResponsibility, "This second duty should not be read."],
      }),
    );

    expect(result.dayToDay.length).toBeLessThanOrEqual(171);
    expect(result.dayToDay).not.toContain("second duty");
    expect(result.spokenText).not.toContain("This second duty should not be read");
  });

  it("does not imply a salary exists when the stored listing says it is absent", () => {
    const result = buildSpokenJobSummary(
      source({ salaryDisplay: "Salary not posted", salarySource: "unknown" }),
    );

    expect(result.spokenText).toContain("Salary is not posted.");
    expect(result.spokenText).not.toContain("estimated compensation");
  });
});
