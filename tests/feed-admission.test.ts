import { describe, expect, it } from "vitest";

import type { FitEvidence } from "@/features/fit/types";
import {
  classifyFeedAdmission,
  classifyNearMatchFallback,
  type FeedAdmissionFit,
  type FeedAdmissionProfile,
  type FeedAdmissionRevision,
} from "@/features/personalization/feed-admission";

function profile(
  overrides: Partial<FeedAdmissionProfile> = {},
): FeedAdmissionProfile {
  return {
    targetRoleFamilies: ["AI implementation", "Technical customer success"],
    yearsExperience: 1,
    preferredSalaryMinimumCents: 6_000_000,
    preferredWorkArrangements: ["remote", "hybrid"],
    location: "Pittsburgh, PA",
    relocationPreference: "Not willing to relocate",
    ...overrides,
  };
}

function revision(
  overrides: Partial<FeedAdmissionRevision> = {},
): FeedAdmissionRevision {
  return {
    title: "AI Implementation Specialist",
    location: "Remote — United States",
    workArrangement: "remote",
    remoteRestriction: null,
    salaryMinimumCents: 7_000_000,
    salaryMaximumCents: 9_000_000,
    salaryCurrency: "USD",
    salaryPeriod: "year",
    salarySource: "employer_posted",
    seniority: "entry",
    yearsExperienceMinimum: 1,
    experienceRequirements: [],
    ...overrides,
  };
}

function evidence(message: string): FitEvidence {
  return { kind: "blocker", message, source: "derived" };
}

function fit(overrides: Partial<FeedAdmissionFit> = {}): FeedAdmissionFit {
  return {
    eligibility: { status: "eligible", reasons: [] },
    verdict: "apply",
    components: [{ key: "roleFamily", rawScore: 100, coverage: 1 }],
    ...overrides,
  };
}

describe("feed admission policy", () => {
  it("admits a direct, realistic, resolved match to the primary lane", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision(),
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "role_direct_match",
        "experience_aligned",
        "salary_clears_floor",
      ]),
    );
  });

  it.each([
    {
      name: "an ineligible fit",
      fit: fit({
        eligibility: {
          status: "ineligible",
          reasons: [evidence("The office location conflicts with the candidate location.")],
        },
      }),
      code: "eligibility_ineligible",
    },
    {
      name: "a Skip verdict",
      fit: fit({ verdict: "skip" }),
      code: "verdict_skip",
    },
  ])("never admits $name", ({ code, fit: fitResult }) => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision(),
      fit: fitResult,
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain(code);
  });

  it.each(["senior", "staff", "leadership"])(
    "blocks explicit %s seniority",
    (seniority) => {
      const result = classifyFeedAdmission({
        profile: profile(),
        revision: revision({ seniority }),
        fit: fit(),
      });

      expect(result.lane).toBe("blocked");
      expect(result.reasonCodes).toContain("seniority_above_scope");
    },
  );

  it("also blocks seniority stated directly in the title", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({
        title: "Principal AI Implementation Consultant",
        seniority: null,
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("seniority_above_scope");
  });

  it.each([
    "Product Marketing Manager",
    "Customer Success Manager",
    "Program Manager",
  ])("does not treat the IC-function title %s as people leadership", (title) => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({ title, seniority: null }),
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("seniority_stretch");
    expect(result.reasonCodes).not.toContain("seniority_above_scope");
    expect(result.reasonCodes).not.toContain("seniority_outside_targets");
  });

  it("does not confuse cross-functional project leadership with people management", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({
        title: "Product Manager",
        seniority: null,
        responsibilities: [
          "Lead a cross-functional team through roadmap planning and product launches.",
        ],
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("seniority_stretch");
    expect(result.reasonCodes).not.toContain("seniority_above_scope");
  });

  it("keeps an ambiguous manager title in Matches when manager is explicitly targeted", () => {
    const result = classifyFeedAdmission({
      profile: profile({ desiredSeniorityLevels: ["manager"] }),
      revision: revision({
        title: "Customer Success Manager",
        seniority: null,
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).not.toContain("seniority_stretch");
    expect(result.reasonCodes).not.toContain("seniority_outside_targets");
  });

  it.each([
    {
      name: "a strong people-manager title",
      revision: revision({ title: "Engineering Manager", seniority: null }),
    },
    {
      name: "structured manager seniority",
      revision: revision({
        title: "Customer Success Manager",
        seniority: "manager",
      }),
    },
    {
      name: "people-management evidence in the listing",
      revision: revision({
        title: "Customer Success Manager",
        seniority: null,
        responsibilities: [
          "Manage a team of six customer success specialists and own performance reviews.",
        ],
      }),
    },
  ])("still blocks $name", ({ revision: job }) => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: job,
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("seniority_above_scope");
  });

  it("uses explicit desired seniority levels instead of the legacy senior-title block", () => {
    const desired = classifyFeedAdmission({
      profile: profile({ desiredSeniorityLevels: ["senior"] }),
      revision: revision({
        title: "Senior AI Implementation Specialist",
        seniority: "senior",
      }),
      fit: fit(),
    });
    const outsideTargets = classifyFeedAdmission({
      profile: profile({ desiredSeniorityLevels: ["entry", "mid"] }),
      revision: revision({
        title: "Senior AI Implementation Specialist",
        seniority: "senior",
      }),
      fit: fit(),
    });

    expect(desired.reasonCodes).not.toContain("seniority_above_scope");
    expect(desired.reasonCodes).not.toContain("seniority_outside_targets");
    expect(desired.lane).toBe("primary");
    expect(outsideTargets.lane).toBe("blocked");
    expect(outsideTargets.reasonCodes).toContain(
      "seniority_outside_targets",
    );
  });

  it("does not let a contradictory entry field override a senior title", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({
        title: "Senior AI Implementation Specialist",
        seniority: "entry",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("seniority_above_scope");
  });

  it("blocks a required experience gap of four or more years", () => {
    const result = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({ yearsExperienceMinimum: 5 }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("required_experience_gap_too_large");
  });

  it("uses explicit years text when the structured minimum was not parsed", () => {
    const result = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({
        seniority: null,
        yearsExperienceMinimum: null,
        experienceRequirements: ["7+ years (unspecified)"],
      }),
      fit: fit({ verdict: "apply_as_stretch" }),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("required_experience_gap_too_large");
  });

  it("uses the strongest required years signal and ignores preferred years", () => {
    const strongestRequired = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({
        seniority: null,
        yearsExperienceMinimum: null,
        experienceRequirements: [
          "2+ years (required)",
          "7+ years (required)",
        ],
      }),
      fit: fit(),
    });
    const preferredOnly = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({
        seniority: null,
        yearsExperienceMinimum: null,
        experienceRequirements: ["7+ years (preferred)"],
      }),
      fit: fit(),
    });

    expect(strongestRequired.lane).toBe("blocked");
    expect(preferredOnly.reasonCodes).toContain("experience_unresolved");
    expect(preferredOnly.reasonCodes).not.toContain(
      "required_experience_gap_too_large",
    );
  });

  it("keeps a one- or two-year experience gap in Explore", () => {
    const result = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({ yearsExperienceMinimum: 3 }),
      fit: fit({ verdict: "apply_as_stretch" }),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("experience_stretch");
    expect(result.reasonCodes).not.toContain("required_experience_gap_too_large");
  });

  it("keeps a one-level mid-career seniority stretch in Explore", () => {
    const result = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({ seniority: "mid", yearsExperienceMinimum: 1 }),
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("seniority_stretch");
  });

  it("blocks experience gaps larger than the Explore allowance", () => {
    const result = classifyFeedAdmission({
      profile: profile({ yearsExperience: 1 }),
      revision: revision({ yearsExperienceMinimum: 4 }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain(
      "required_experience_gap_outside_explore",
    );
  });

  it("places an approved adjacent role in Explore", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision(),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 70, coverage: 0.8 }],
      }),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("role_adjacent_match");
  });

  it("blocks roles outside the configured target families", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({ title: "Corporate Counsel" }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 0, coverage: 0.9 }],
      }),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("role_outside_targets");
  });

  it("allows a well-ranked tangential role only as a Near Match fallback candidate", () => {
    const input = {
      profile: profile(),
      revision: revision(),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 72,
      }),
    };
    const admission = classifyFeedAdmission(input);

    expect(admission.lane).toBe("blocked");
    expect(classifyNearMatchFallback(input, admission)).toEqual({
      eligible: true,
      explanation: expect.stringContaining("tangential overlap"),
      reasonCode: "role_outside_targets",
    });
  });

  it("allows a strongly ranked unmapped title to be reviewed without pretending the role is known", () => {
    const input = {
      profile: profile(),
      revision: revision({ seniority: null, yearsExperienceMinimum: null }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: null, coverage: 0 }],
        deterministicFitScore: 78,
      }),
    };
    const admission = classifyFeedAdmission(input);

    expect(admission.reasonCodes).toContain("role_match_unresolved");
    expect(classifyNearMatchFallback(input, admission)).toEqual({
      eligible: true,
      explanation: expect.stringContaining("does not map cleanly"),
      reasonCode: "role_match_unresolved",
    });
  });

  it.each([
    {
      name: "a recognized unrelated role",
      candidateProfile: profile(),
      revision: revision(),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 0, coverage: 0.9 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "weak remaining fit evidence",
      candidateProfile: profile(),
      revision: revision(),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 54,
      }),
    },
    {
      name: "a hard posted-pay violation",
      candidateProfile: profile(),
      revision: revision({
        salaryMinimumCents: 4_000_000,
        salaryMaximumCents: 5_000_000,
      }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "an explicit seniority violation",
      candidateProfile: profile(),
      revision: revision({
        title: "Senior AI Operations Specialist",
        seniority: "senior",
      }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "an incompatible work mode",
      candidateProfile: profile({
        preferredWorkModes: ["remote"],
        strictWorkModes: true,
      }),
      revision: revision({
        location: "Pittsburgh, PA",
        workArrangement: "on_site",
      }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "an incompatible employment type",
      candidateProfile: profile({ acceptedEmploymentTypes: ["full_time"] }),
      revision: revision({ employmentType: "contract" }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "a location eligibility conflict",
      candidateProfile: profile(),
      revision: revision(),
      fit: fit({
        eligibility: {
          status: "ineligible",
          reasons: [evidence("The office location conflicts with the candidate location.")],
        },
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "an authorization conflict",
      candidateProfile: profile(),
      revision: revision(),
      fit: fit({
        eligibility: {
          status: "ineligible",
          reasons: [evidence("Work authorization requires sponsorship the employer cannot provide.")],
        },
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
    {
      name: "an experience gap outside Explore",
      candidateProfile: profile({ yearsExperience: 1 }),
      revision: revision({ yearsExperienceMinimum: 4 }),
      fit: fit({
        components: [{ key: "roleFamily", rawScore: 40, coverage: 0.7 }],
        deterministicFitScore: 82,
      }),
    },
  ])(
    "keeps $name out of Near Matches",
    ({ candidateProfile, fit: fitResult, revision: job }) => {
      const input = {
        profile: candidateProfile,
        revision: job,
        fit: fitResult,
      };

      expect(classifyNearMatchFallback(input)).toEqual({
        eligible: false,
        explanation: null,
        reasonCode: null,
      });
    },
  );

  it("blocks an employer-posted annual range entirely below the floor", () => {
    const result = classifyFeedAdmission({
      profile: profile({ preferredSalaryMinimumCents: 6_000_000 }),
      revision: revision({
        salaryMinimumCents: 4_500_000,
        salaryMaximumCents: 5_500_000,
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("salary_below_floor");
  });

  it("also blocks a below-floor employer-posted hourly range after annualization", () => {
    const result = classifyFeedAdmission({
      profile: profile({ preferredSalaryMinimumCents: 6_000_000 }),
      revision: revision({
        salaryMinimumCents: 2_000,
        salaryMaximumCents: 2_500,
        salaryPeriod: "hour",
      }),
      salaryPresentation: {
        annualMinimumCents: 4_160_000,
        annualMaximumCents: 5_200_000,
        confidence: "high",
        isEstimate: false,
      },
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("salary_below_floor");
  });

  it("does not compare non-USD posted pay to a USD profile floor", () => {
    const result = classifyFeedAdmission({
      profile: profile({ preferredSalaryMinimumCents: 6_000_000 }),
      revision: revision({
        salaryMinimumCents: 2_000,
        salaryMaximumCents: 2_500,
        salaryCurrency: "GBP",
        salaryPeriod: "hour",
      }),
      salaryPresentation: {
        annualMinimumCents: 4_160_000,
        annualMaximumCents: 5_200_000,
        confidence: "high",
        isEstimate: false,
      },
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).toContain("salary_unresolved");
    expect(result.reasonCodes).not.toContain("salary_below_floor");
  });

  it("keeps a direct match visible when pay is estimated instead of employer-posted", () => {
    const result = classifyFeedAdmission({
      profile: profile({ preferredSalaryMinimumCents: 6_000_000 }),
      revision: revision({
        salaryMinimumCents: 4_500_000,
        salaryMaximumCents: 5_500_000,
        salarySource: "external_estimate",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).toContain("salary_unresolved");
    expect(result.reasonCodes).not.toContain("salary_below_floor");
  });

  it("moves a credible below-floor market estimate to Explore without treating it as fact", () => {
    const result = classifyFeedAdmission({
      profile: profile({ preferredSalaryMinimumCents: 6_000_000 }),
      revision: revision({
        salaryMinimumCents: null,
        salaryMaximumCents: null,
        salarySource: "unknown",
      }),
      salaryPresentation: {
        annualMinimumCents: 4_500_000,
        annualMaximumCents: 5_500_000,
        confidence: "medium",
        isEstimate: true,
      },
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("salary_estimate_below_floor");
    expect(result.reasonCodes).not.toContain("salary_below_floor");
  });

  it("does not bury a direct match only because experience is unstated", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({ seniority: null, yearsExperienceMinimum: null }),
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).toContain("experience_unresolved");
  });

  it("keeps an overall stretch verdict in Explore even when the target role is direct", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({ seniority: null, yearsExperienceMinimum: null }),
      fit: fit({ verdict: "apply_as_stretch" }),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("fit_requires_review");
  });

  it("blocks a known incompatible work arrangement", () => {
    const result = classifyFeedAdmission({
      profile: profile({
        preferredWorkModes: ["remote"],
        strictWorkModes: true,
      }),
      revision: revision({
        location: "New York, NY",
        workArrangement: "on_site",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("work_arrangement_incompatible");
  });

  it("keeps non-strict work modes as a soft preference", () => {
    const result = classifyFeedAdmission({
      profile: profile({
        preferredWorkModes: ["remote"],
        strictWorkModes: false,
      }),
      revision: revision({
        location: "Pittsburgh, PA",
        workArrangement: "on_site",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("primary");
    expect(result.reasonCodes).not.toContain(
      "work_arrangement_incompatible",
    );
  });

  it("blocks an on-site role above the configured office-day limit", () => {
    const result = classifyFeedAdmission({
      profile: profile({ maxOfficeDaysPerWeek: 2 }),
      revision: revision({
        location: "Pittsburgh, PA",
        workArrangement: "on_site",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("work_arrangement_incompatible");
  });

  it("uses an explicit hybrid office cadence instead of guessing", () => {
    const result = classifyFeedAdmission({
      profile: profile({ maxOfficeDaysPerWeek: 2 }),
      revision: revision({
        cleanedDescription:
          "Work with customers remotely and join the Pittsburgh office 3 days per week in person.",
        location: "Pittsburgh, PA",
        workArrangement: "hybrid",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("work_arrangement_incompatible");
  });

  it("keeps an unspecified hybrid cadence visible as uncertainty", () => {
    const result = classifyFeedAdmission({
      profile: profile({ maxOfficeDaysPerWeek: 2 }),
      revision: revision({
        location: "Pittsburgh, PA",
        workArrangement: "hybrid",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("work_arrangement_unresolved");
  });

  it("blocks a known office outside the home and allowed relocation destinations", () => {
    const result = classifyFeedAdmission({
      profile: profile({
        commuteRadiusMiles: 35,
        relocationDestinations: ["Chicago, IL"],
      }),
      revision: revision({
        location: "New York, NY",
        workArrangement: "hybrid",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("geography_incompatible");
  });

  it("allows a configured relocation destination", () => {
    const result = classifyFeedAdmission({
      profile: profile({
        commuteRadiusMiles: 35,
        relocationDestinations: ["New York, NY"],
      }),
      revision: revision({
        location: "New York, NY",
        workArrangement: "hybrid",
      }),
      fit: fit(),
    });

    expect(result.reasonCodes).not.toContain("geography_incompatible");
  });

  it.each([
    {
      name: "title",
      profile: profile({ excludedTitles: ["implementation specialist"] }),
      revision: revision(),
      code: "title_excluded",
    },
    {
      name: "company",
      profile: profile({ excludedCompanies: ["Acme Systems"] }),
      revision: revision({ company: "Acme Systems" }),
      code: "company_excluded",
    },
    {
      name: "industry",
      profile: profile({ excludedIndustries: ["Defense"] }),
      revision: revision({ industry: "Defense" }),
      code: "industry_excluded",
    },
  ] as const)("hard-blocks an explicitly excluded $name", (testCase) => {
    const result = classifyFeedAdmission({
      profile: testCase.profile,
      revision: testCase.revision,
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain(testCase.code);
  });

  it("blocks a known employment type outside the accepted set", () => {
    const result = classifyFeedAdmission({
      profile: profile({ acceptedEmploymentTypes: ["full_time"] }),
      revision: revision({ employmentType: "contract" }),
      fit: fit(),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("employment_type_incompatible");
  });

  it.each([
    { policy: "show", lane: "primary", code: null },
    {
      policy: "explore_only",
      lane: "explore",
      code: "salary_missing_explore",
    },
    { policy: "hide", lane: "blocked", code: "salary_missing_hidden" },
  ] as const)(
    "applies the $policy missing-salary policy without inventing pay",
    ({ code, lane, policy }) => {
      const result = classifyFeedAdmission({
        profile: profile({
          missingSalaryPolicy: policy,
          preferredSalaryMinimumCents: 0,
        }),
        revision: revision({
          salaryMinimumCents: null,
          salaryMaximumCents: null,
          salarySource: "unknown",
        }),
        fit: fit(),
      });

      expect(result.lane).toBe(lane);
      if (code) expect(result.reasonCodes).toContain(code);
      else {
        expect(result.reasonCodes).not.toEqual(
          expect.arrayContaining([
            "salary_missing_explore",
            "salary_missing_hidden",
          ]),
        );
      }
    },
  );

  it.each([
    {
      message:
        "The listing explicitly rules out sponsorship, but the profile requires it.",
      code: "authorization_incompatible",
    },
    {
      message: "Travel of 50% exceeds the 25% limit.",
      code: "travel_limit_exceeded",
    },
  ] as const)(
    "surfaces structured eligibility conflicts as $code",
    ({ code, message }) => {
      const result = classifyFeedAdmission({
        profile: profile(),
        revision: revision(),
        fit: fit({
          eligibility: {
            status: "ineligible",
            reasons: [evidence(message)],
          },
        }),
      });

      expect(result.lane).toBe("blocked");
      expect(result.reasonCodes).toContain(code);
    },
  );

  it("surfaces a known geographic conflict with its own reason code", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({
        location: "New York, NY",
        workArrangement: "hybrid",
      }),
      fit: fit({
        eligibility: {
          status: "ineligible",
          reasons: [evidence("The office location conflicts with the candidate location.")],
        },
      }),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toContain("geography_incompatible");
  });

  it("keeps unresolved eligibility out of the primary lane", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({ remoteRestriction: "United States only" }),
      fit: fit({
        eligibility: {
          status: "unresolved",
          reasons: [
            {
              kind: "unknown",
              message: "Eligibility for the remote region restriction is unresolved.",
              source: "derived",
            },
          ],
        },
      }),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining(["eligibility_unresolved", "geography_unresolved"]),
    );
  });

  it("treats missing qualifying facts conservatively without fabricating blockers", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision({
        salaryMinimumCents: null,
        salaryMaximumCents: null,
        salarySource: "unknown",
        seniority: null,
        yearsExperienceMinimum: null,
        workArrangement: "unclear",
      }),
      fit: fit(),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "experience_unresolved",
        "salary_unresolved",
        "work_arrangement_unresolved",
      ]),
    );
    expect(result.reasonCodes).not.toEqual(
      expect.arrayContaining([
        "salary_below_floor",
        "work_arrangement_incompatible",
        "seniority_above_scope",
      ]),
    );
  });

  it("keeps a configured Stretch direction out of Ready Now", () => {
    const result = classifyFeedAdmission({
      profile: profile(),
      revision: revision(),
      fit: fit({
        roleTargetMatch: {
          label: "Associate solutions consultant",
          readiness: "stretch",
          priorityRank: 1,
          matchQuality: "direct",
          allowedSeniorityLevels: ["entry", "mid"],
          minimumRequiredExperienceYears: 0,
          maximumRequiredExperienceYears: 3,
          exclusions: [],
        },
      }),
    });

    expect(result.lane).toBe("explore");
    expect(result.reasonCodes).toContain("role_target_stretch");
  });

  it("hard-blocks role-specific seniority, experience, and exclusion conflicts", () => {
    const result = classifyFeedAdmission({
      profile: profile({ desiredSeniorityLevels: ["senior"] }),
      revision: revision({
        title: "Senior AI Implementation Specialist",
        seniority: "senior",
        yearsExperienceMinimum: 5,
        requiredQualifications: ["Own a quota carrying implementation territory."],
      }),
      fit: fit({
        roleTargetMatch: {
          label: "AI implementation",
          readiness: "ready_now",
          priorityRank: 1,
          matchQuality: "direct",
          allowedSeniorityLevels: ["entry", "mid"],
          minimumRequiredExperienceYears: 0,
          maximumRequiredExperienceYears: 3,
          exclusions: ["quota carrying"],
        },
      }),
    });

    expect(result.lane).toBe("blocked");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "role_target_excluded",
        "role_target_seniority_outside_scope",
        "role_target_experience_outside_scope",
      ]),
    );
  });
});
