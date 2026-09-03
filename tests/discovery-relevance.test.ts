import { describe, expect, it } from "vitest";

import {
  buildDiscoveryCandidateProfile,
  isDiscoveryCandidateRelevant,
  isDiscoveryImportCandidate,
  scoreDiscoveryImportPriority,
  scoreDiscoveryRelevance,
  TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE,
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
  it("defines a profile-neutral launch-market focus for scheduled ingestion", () => {
    expect(TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE).toMatchObject({
      desiredSeniorityLevels: ["entry", "mid"],
      location: null,
      yearsExperience: 2,
    });
    expect(
      TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE.targetRoleFamilies,
    ).toEqual(
      expect.arrayContaining([
        "Implementation Specialist",
        "Product Operations",
        "Technical Customer Success",
        "Automation Analyst",
      ]),
    );
  });
  it("projects only non-identifying search focus into the shared refresh", () => {
    expect(
      buildDiscoveryCandidateProfile({
        desiredSeniorityLevels: ["entry", "mid"],
        location: "Pittsburgh, PA",
        targetRoleFamilies: ["Implementation specialist"],
        yearsExperience: 1,
      }),
    ).toEqual({
      desiredSeniorityLevels: ["entry", "mid"],
      location: "Pittsburgh, PA",
      targetRoleFamilies: ["Implementation specialist"],
      yearsExperience: 1,
    });
  });

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

  it("spends a focused refresh budget on junior target roles before polished senior roles", () => {
    const earlyCareerProfile = {
      ...profile,
      desiredSeniorityLevels: ["entry", "mid"] as const,
      yearsExperience: 1,
    };
    const juniorTarget = job("Associate Implementation Specialist", {
      descriptionText: "Help customers launch the platform.",
      employmentType: "unknown",
      salary: null,
      workArrangement: "on_site",
    });
    const polishedSeniorTarget = job("Senior Implementation Consultant", {
      descriptionText: "A".repeat(500),
      salary: {
        currency: "USD",
        description: "$150,000–$190,000 per year",
        minimumMajorUnits: 150_000,
        maximumMajorUnits: 190_000,
        period: "year",
        source: "employer_posted",
      },
    });

    expect(
      scoreDiscoveryImportPriority(juniorTarget, earlyCareerProfile),
    ).toBeGreaterThan(
      scoreDiscoveryImportPriority(polishedSeniorTarget, earlyCareerProfile),
    );
  });

  it("does not hard-code the early-career preference for senior profiles", () => {
    const seniorProfile = {
      ...profile,
      desiredSeniorityLevels: ["senior"] as const,
      yearsExperience: 7,
    };
    const seniorRole = job("Senior Implementation Consultant");

    expect(scoreDiscoveryRelevance(seniorRole, seniorProfile)).toBeGreaterThan(
      scoreDiscoveryRelevance(seniorRole, {
        ...profile,
        desiredSeniorityLevels: ["entry", "mid"] as const,
        yearsExperience: 1,
      }),
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

  it("uses the selected home area instead of hard-coding Pittsburgh", () => {
    const localRole = job("Operations Coordinator", {
      location: "Pittsburgh, PA",
      workArrangement: "on_site",
    });
    const localScore = scoreDiscoveryRelevance(localRole, profile);
    const anywhereScore = scoreDiscoveryRelevance(localRole, {
      ...profile,
      location: null,
    });

    expect(localScore).toBeGreaterThan(anywhereScore);
  });

  it("only gives the full remote lift when the profile selects remote US", () => {
    const remoteRole = job("Operations Coordinator");
    const remoteScore = scoreDiscoveryRelevance(remoteRole, {
      ...profile,
      location: "Remote, US",
    });
    const anywhereScore = scoreDiscoveryRelevance(remoteRole, {
      ...profile,
      location: null,
    });

    expect(remoteScore).toBeGreaterThan(anywhereScore);
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
