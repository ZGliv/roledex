import { describe, expect, it } from "vitest";

import type {
  CandidateProfile,
  CandidateRoleTarget,
  CandidateSkillEvidence,
} from "@/db/schema";
import {
  buildFitScoreRun,
  toCandidateFitProfile,
} from "@/features/fit/run-builder";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { parseJobListing } from "@/features/jobs/parser";

function profileWithoutPortfolio(
  overrides: Partial<CandidateProfile> = {},
): CandidateProfile {
  return {
    id: "profile-without-portfolio",
    visitorId: "visitor-test",
    isActive: true,
    revision: 1,
    currentRole: "Support Analyst",
    currentSalaryCents: 5_000_000,
    preferredSalaryMinimumCents: 6_000_000,
    preferredSalaryTargetCents: 7_500_000,
    preferredWorkArrangements: ["remote", "hybrid"],
    preferredIndustries: ["Software"],
    targetRoleFamilies: ["Implementation Specialist"],
    strengths: ["Customer communication"],
    weaknesses: [],
    interests: [],
    education: [],
    skills: ["Technical support"],
    yearsExperience: 1,
    location: "Pittsburgh, PA",
    relocationPreference: "Prefer remote",
    careerGoals: [],
    interviewConcerns: [],
    dealBreakers: [],
    // Newly structured profile fields do not alter this test; these values
    // mirror their migration-safe defaults.
    desiredSeniorityLevels: [],
    excludedTitles: [],
    excludedCompanies: [],
    excludedIndustries: [],
    acceptedEmploymentTypes: [
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "internship",
    ],
    preferredWorkModes: ["remote", "hybrid"],
    strictWorkModes: false,
    commuteRadiusMiles: null,
    maxOfficeDaysPerWeek: null,
    relocationDestinations: [],
    maxTravelPercent: null,
    workAuthorization: "prefer_not_to_say",
    requiresSponsorship: null,
    missingSalaryPolicy: "explore_only",
    evidenceFingerprint: null,
    searchContractFingerprint: null,
    fingerprint: "test-profile-fingerprint",
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

function skillRecord(
  name: string,
  evidenceType: CandidateSkillEvidence["evidenceType"],
): CandidateSkillEvidence {
  return {
    id: `skill-${name.toLocaleLowerCase().replaceAll(" ", "-")}`,
    candidateProfileId: "profile-without-portfolio",
    name,
    proficiency: "working",
    yearsExperience: null,
    lastUsedYear: 2026,
    evidenceType,
    confidence: "medium",
    sourceRecordId: null,
    evidenceNote: null,
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
  };
}

function roleTarget(
  overrides: Partial<CandidateRoleTarget> = {},
): CandidateRoleTarget {
  return {
    id: "role-target-implementation",
    candidateProfileId: "profile-without-portfolio",
    canonicalFamily: "ai_implementation",
    label: "Implementation Specialist",
    aliases: ["Launch Consultant"],
    priorityRank: 1,
    readiness: "ready_now",
    allowedSeniorityLevels: ["entry", "mid"],
    minimumRequiredExperienceYears: 0,
    maximumRequiredExperienceYears: 3,
    exclusions: ["quota carrying"],
    createdAt: new Date("2026-08-01T12:00:00.000Z"),
    updatedAt: new Date("2026-08-01T12:00:00.000Z"),
    ...overrides,
  };
}

describe("fit run builder", () => {
  it("keeps a missing portfolio neutral and records the new scoring version", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      descriptionRaw:
        "Help customers configure software, document requirements, and launch new workflows.",
    });
    const run = buildFitScoreRun({
      contentHash: "job-content-hash",
      job,
      profile: profileWithoutPortfolio(),
      projects: [],
    });
    const portfolio = run.fitResult.components.find(
      (component) => component.key === "portfolio",
    );

    expect(FIT_SCORING_VERSION).toBe("deterministic-fit-v5");
    expect(run.values.scoringVersion).toBe(FIT_SCORING_VERSION);
    expect(run.values.portfolioSnapshot).toEqual([]);
    expect(portfolio).toMatchObject({
      rawScore: null,
      coverage: 0,
      effectiveScore: 50,
    });
    expect(portfolio?.rationale).toContain(
      "Portfolio evidence has not been entered",
    );
  });

  it("maps structured search constraints into deterministic dealbreakers", () => {
    const candidate = toCandidateFitProfile(
      profileWithoutPortfolio({
        acceptedEmploymentTypes: ["full_time", "contract"],
        excludedIndustries: ["Defense"],
        maxTravelPercent: 15,
        preferredWorkModes: ["hybrid", "remote"],
        strictWorkModes: true,
        workAuthorization: "work_authorized",
        requiresSponsorship: true,
      }),
    );

    expect(candidate).toMatchObject({
      preferredWorkArrangements: ["hybrid", "remote"],
      workAuthorizationCountries: ["United States"],
      requiresSponsorship: true,
      dealBreakers: {
        allowedEmploymentTypes: ["full_time", "contract"],
        allowedWorkArrangements: ["hybrid", "remote"],
        excludedIndustries: ["Defense"],
        maximumTravelPercent: 15,
      },
    });
  });

  it("merges structured skill evidence with the strongest truthful source", () => {
    const candidate = toCandidateFitProfile(
      profileWithoutPortfolio({ skills: ["SQL", "Communication"] }),
      [
        skillRecord("SQL", "work_experience"),
        skillRecord("React", "portfolio_project"),
        skillRecord("Statistics", "education"),
        skillRecord("Python", "self_reported"),
      ],
    );

    expect(candidate.skills).toEqual(
      expect.arrayContaining([
        { name: "SQL", evidence: "professional" },
        { name: "React", evidence: "portfolio" },
        { name: "Statistics", evidence: "coursework" },
        { name: "Python", evidence: "self_assessed" },
        { name: "Communication", evidence: "self_assessed" },
      ]),
    );
    expect(candidate.skills?.filter((skill) => skill.name === "SQL")).toHaveLength(
      1,
    );
  });

  it("uses role aliases, readiness, and priority in the persisted fit result", () => {
    const job = parseJobListing({
      title: "Launch Consultant",
      company: "Acme",
      descriptionRaw:
        "Guide customers through launch planning, configuration, and implementation.",
    });
    const run = buildFitScoreRun({
      contentHash: "role-target-job",
      job,
      profile: profileWithoutPortfolio(),
      projects: [],
      roleTargets: [
        roleTarget({
          priorityRank: 2,
          readiness: "stretch",
        }),
      ],
    });
    const roleFamily = run.fitResult.components.find(
      (component) => component.key === "roleFamily",
    );

    expect(run.fitResult.roleTargetMatch).toMatchObject({
      label: "Implementation Specialist",
      readiness: "stretch",
      priorityRank: 2,
      matchQuality: "direct",
      matchedOn: "Launch Consultant",
    });
    expect(roleFamily?.rawScore).toBe(73.5);
    expect(run.values.candidateSnapshot).toMatchObject({
      roleTargets: [
        expect.objectContaining({
          canonicalFamily: "ai_implementation",
          readiness: "stretch",
        }),
      ],
    });
  });
});
