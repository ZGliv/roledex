import { describe, expect, it } from "vitest";

import type { StarterJobSource } from "@/features/discovery/default-sources";
import type { DiscoveryJob } from "@/features/discovery/types";
import {
  annualPostedSalary,
  buildEmergencyFeed,
  DEFAULT_EMERGENCY_PROFILE,
} from "@/features/jobs/emergency-feed";

const source: StarterJobSource = {
  companyDomain: "example.com",
  companyName: "Example",
  provider: "ashby",
  providerKey: "example",
};

function job(title: string, overrides: Partial<DiscoveryJob> = {}): DiscoveryJob {
  return {
    applyUrl: "https://jobs.example.com/apply/1",
    company: "Example",
    descriptionText: "Help customers implement and adopt a modern software platform.",
    employmentType: "full_time",
    externalId: title,
    jobUrl: "https://jobs.example.com/1",
    location: "Remote - US",
    postedAt: "2026-08-14T12:00:00.000Z",
    provider: "ashby",
    salary: null,
    title,
    updatedAt: null,
    workArrangement: "remote",
    ...overrides,
  };
}

describe("database-independent emergency feed", () => {
  it("keeps a relevant early-career role and supplies an explicit market estimate", () => {
    const result = buildEmergencyFeed([
      { source, jobs: [job("Implementation Specialist")] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      estimatedSalary: true,
      provider: "ashby",
      salaryDisplay: expect.stringContaining("Est."),
      sourceKey: "example",
      workArrangement: "Remote",
    });
  });

  it("does not admit unrelated clinical roles merely because the title says specialist", () => {
    const result = buildEmergencyFeed([
      {
        source,
        jobs: [
          job("LPN - Advanced Care Planning Specialist"),
          job("Implementation Specialist", { externalId: "implementation" }),
        ],
      },
    ]);

    expect(result.map((item) => item.externalId)).toEqual(["implementation"]);
  });

  it("excludes explicit senior roles and employer-posted ranges wholly below the floor", () => {
    const result = buildEmergencyFeed([
      {
        source,
        jobs: [
          job("Senior Implementation Specialist"),
          job("Implementation Manager", { externalId: "manager" }),
          job("Implementation Specialist", {
            externalId: "low-pay",
            salary: {
              currency: "USD",
              description: "$20-$25/hour",
              maximumMajorUnits: 25,
              minimumMajorUnits: 20,
              period: "hour",
              source: "employer_posted",
            },
          }),
        ],
      },
    ]);

    expect(result).toEqual([]);
  });

  it("allows senior and manager titles only when senior is selected", () => {
    const seniorProfile = {
      ...DEFAULT_EMERGENCY_PROFILE,
      desiredSeniorityLevels: ["senior" as const],
    };
    for (const title of ["Senior Implementation Specialist", "Implementation Manager"]) {
      expect(
        buildEmergencyFeed(
          [{ source, jobs: [job(title, { externalId: title })] }],
          seniorProfile,
        ),
      ).toHaveLength(1);
    }
    for (const title of [
      "Staff Implementation Specialist",
      "Principal Implementation Consultant",
      "Director of Implementation",
      "Head of Implementation",
      "VP, Implementation",
      "Chief Implementation Officer",
    ]) {
      expect(
        buildEmergencyFeed(
          [{ source, jobs: [job(title, { externalId: title })] }],
          seniorProfile,
        ),
      ).toEqual([]);
    }
  });

  it("honors explicit entry and mid-level titles while keeping unknown levels visible", () => {
    const roles = [
      job("Associate Implementation Specialist", { externalId: "entry" }),
      job("Mid-Level Implementation Specialist", { externalId: "mid" }),
      job("Implementation Specialist", { externalId: "unknown" }),
    ];

    expect(
      buildEmergencyFeed(
        [{ source, jobs: roles }],
        { ...DEFAULT_EMERGENCY_PROFILE, desiredSeniorityLevels: ["entry"] },
      ).map((item) => item.externalId),
    ).toEqual(["entry", "unknown"]);
    expect(
      buildEmergencyFeed(
        [{ source, jobs: roles }],
        { ...DEFAULT_EMERGENCY_PROFILE, desiredSeniorityLevels: ["mid"] },
      ).map((item) => item.externalId),
    ).toEqual(["mid", "unknown"]);
  });

  it("compares explicit experience requirements with the profile's experience tolerance", () => {
    const seniorProfile = {
      ...DEFAULT_EMERGENCY_PROFILE,
      desiredSeniorityLevels: ["senior" as const],
      yearsExperience: 7,
    };
    const result = buildEmergencyFeed(
      [
        {
          source,
          jobs: [
            job("Senior Implementation Consultant", {
              descriptionText: "Minimum 5 years of implementation experience required.",
              externalId: "five-years",
            }),
            job("Senior Implementation Manager", {
              descriptionText: "You must have at least 10 years in implementation.",
              externalId: "ten-years",
            }),
          ],
        },
      ],
      seniorProfile,
    );

    expect(result.map((item) => item.externalId)).toEqual(["five-years"]);
  });

  it("annualizes comparable employer-posted pay without treating other currencies as USD", () => {
    expect(
      annualPostedSalary({
        currency: "USD",
        description: null,
        maximumMajorUnits: 50,
        minimumMajorUnits: 40,
        period: "hour",
        source: "employer_posted",
      }),
    ).toEqual({ minimum: 83_200, maximum: 104_000 });
    expect(
      annualPostedSalary({
        currency: "GBP",
        description: null,
        maximumMajorUnits: 90_000,
        minimumMajorUnits: 70_000,
        period: "year",
        source: "employer_posted",
      }),
    ).toBeNull();
  });

  it("honors the cached profile's accepted work modes", () => {
    const result = buildEmergencyFeed(
      [
        {
          source,
          jobs: [
            job("Implementation Specialist", {
              externalId: "onsite",
              location: "New York, NY",
              workArrangement: "on_site",
            }),
          ],
        },
      ],
      { ...DEFAULT_EMERGENCY_PROFILE, preferredWorkModes: ["remote"] },
    );

    expect(result).toEqual([]);
  });

  it("removes explicit four-plus-year requirements without discarding later roles", () => {
    const roles = [
          job("Implementation Consultant", {
            externalId: "too-experienced",
            descriptionText: "You have 5+ years of implementation experience.",
          }),
          job("Implementation Consultant", {
            externalId: "minimum-five",
            descriptionText: "Minimum 5 years of implementation experience required.",
          }),
          job("Implementation Consultant", {
            externalId: "at-least-four",
            descriptionText: "You must have at least 4 years in customer implementation.",
          }),
      ...Array.from({ length: 6 }, (_, index) =>
        job(`Implementation Specialist ${index}`, { externalId: `role-${index}` }),
      ),
    ];

    const result = buildEmergencyFeed([{ source, jobs: roles }]);

    expect(result).toHaveLength(6);
    expect(result.some((item) => item.externalId === "too-experienced")).toBe(false);
    expect(result.some((item) => item.externalId === "minimum-five")).toBe(false);
    expect(result.some((item) => item.externalId === "at-least-four")).toBe(false);
  });

  it("rejects explicitly non-US remote locations without rejecting generic remote roles", () => {
    const result = buildEmergencyFeed([
      {
        source,
        jobs: [
          job("Implementation Specialist UK", {
            externalId: "remote-uk",
            location: "Remote - UK",
          }),
          job("Implementation Specialist EMEA", {
            externalId: "remote-emea",
            location: "Europe / EMEA",
          }),
          job("Implementation Specialist Switzerland", {
            externalId: "remote-switzerland",
            location: "Remote - Switzerland",
          }),
          job("Implementation Specialist LATAM", {
            externalId: "remote-latam",
            location: "LATAM",
          }),
          job("Implementation Specialist South Africa", {
            externalId: "remote-south-africa",
            location: "Remote - South Africa",
          }),
          job("Implementation Specialist Canada", {
            externalId: "remote-canada-north-america",
            location: "Toronto, Canada - North America",
          }),
          job("Implementation Specialist US", {
            externalId: "remote-us",
            location: "Remote - United States",
          }),
          job("Implementation Specialist Remote", {
            externalId: "remote-generic",
            location: "Remote",
          }),
        ],
      },
    ]);

    expect(result.map((item) => item.externalId).sort()).toEqual([
      "remote-generic",
      "remote-us",
    ]);
  });

  it("retains bounded official description text and requirement excerpts", () => {
    const result = buildEmergencyFeed([
      {
        source,
        jobs: [
          job("Implementation Specialist", {
            descriptionText:
              "Help customers launch our platform.\n\nRequirements\nYou have 2+ years of customer-facing implementation experience.\nAbility to translate workflows into technical requirements.\nEqual opportunity employer.",
          }),
        ],
      },
    ]);

    expect(result[0]?.description).toContain("Help customers launch");
    expect(result[0]?.requirements).toEqual([
      "You have 2+ years of customer-facing implementation experience.",
      "Ability to translate workflows into technical requirements.",
    ]);
  });
});
