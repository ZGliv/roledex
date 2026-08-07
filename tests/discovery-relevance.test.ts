import { describe, expect, it } from "vitest";

import {
  isDiscoveryCandidateRelevant,
  isDiscoveryImportCandidate,
  scoreDiscoveryImportPriority,
  scoreDiscoveryRelevance,
} from "@/features/discovery/relevance";
import type { DiscoveryJob } from "@/features/discovery/types";

const profile = {
  location: "Pittsburgh, PA",
  targetRoleFamilies: [
    "AI implementation specialist",
    "Technical customer success",
    "Product operations analyst",
  ],
};

function job(title: string, overrides: Partial<DiscoveryJob> = {}): DiscoveryJob {
  return {
    provider: "greenhouse",
    externalId: title,
    title,
    company: "Example",
    location: "Remote",
    descriptionText: "",
    jobUrl: "https://example.com/job",
    applyUrl: "https://example.com/apply",
    postedAt: null,
    updatedAt: null,
    workArrangement: "remote",
    employmentType: "full_time",
    salary: null,
    ...overrides,
  };
}

describe("discovery relevance", () => {
  it("admits viable roles to the shared catalog without using the owner profile", () => {
    const salesRole = job("Sales Development Representative");
    const nursingRole = job("Clinical Trial Nurse");

    expect(isDiscoveryCandidateRelevant(salesRole, profile)).toBe(false);
    expect(isDiscoveryCandidateRelevant(nursingRole, profile)).toBe(false);
    expect(isDiscoveryImportCandidate(salesRole)).toBe(true);
    expect(isDiscoveryImportCandidate(nursingRole)).toBe(true);
  });

  it("uses profile-neutral listing quality to prioritize the bounded import budget", () => {
    const complete = job("Account Executive", {
      descriptionText: "A".repeat(500),
      salary: {
        currency: "USD",
        description: "$80,000–$110,000 per year",
        minimumMajorUnits: 80_000,
        maximumMajorUnits: 110_000,
        period: "year",
        source: "employer_posted",
      },
    });
    const sparse = job("Implementation Specialist", {
      descriptionText: "Brief listing",
      employmentType: "unknown",
      salary: null,
      workArrangement: "on_site",
    });

    expect(scoreDiscoveryImportPriority(complete)).toBeGreaterThan(
      scoreDiscoveryImportPriority(sparse),
    );
  });

  it("keeps target entry and adjacent roles", () => {
    expect(isDiscoveryCandidateRelevant(job("Implementation Specialist"), profile)).toBe(true);
    expect(isDiscoveryCandidateRelevant(job("Associate Product Operations Analyst"), profile)).toBe(true);
    expect(isDiscoveryCandidateRelevant(job("Technical Customer Success Manager"), profile)).toBe(true);
  });

  it("filters clearly unrelated and senior engineering roles", () => {
    expect(isDiscoveryCandidateRelevant(job("Senior Backend Engineer"), profile)).toBe(false);
    expect(isDiscoveryCandidateRelevant(job("Clinical Trial Nurse"), profile)).toBe(false);
    expect(scoreDiscoveryRelevance(job("Account Executive"), profile)).toBeLessThan(3);
  });

  it("keeps associate product roles without promoting generic product managers", () => {
    expect(isDiscoveryCandidateRelevant(job("Associate Product Manager"), profile)).toBe(true);
    expect(isDiscoveryCandidateRelevant(job("Product Manager - Claims & Payments"), profile)).toBe(
      false,
    );
  });

  it("gives remote and local roles a modest lift", () => {
    const remote = scoreDiscoveryRelevance(job("Operations Coordinator"), profile);
    const elsewhere = scoreDiscoveryRelevance(
      job("Operations Coordinator", {
        location: "San Francisco, CA",
        workArrangement: "on_site",
      }),
      profile,
    );
    expect(remote).toBeGreaterThan(elsewhere);
  });

  it("does not surface listings explicitly restricted to another country", () => {
    const australianRole = job("Customer Success Manager", {
      location: "Sydney, Australia",
      workArrangement: "hybrid",
    });
    const mexicoRole = job("Implementation Consultant", {
      location: "Remote - Mexico",
    });

    expect(isDiscoveryCandidateRelevant(australianRole, profile)).toBe(false);
    expect(isDiscoveryCandidateRelevant(mexicoRole, profile)).toBe(false);
    expect(isDiscoveryImportCandidate(australianRole)).toBe(false);
    expect(isDiscoveryImportCandidate(mexicoRole)).toBe(false);
  });
});
