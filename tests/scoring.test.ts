import { describe, expect, it } from "vitest";

import { parseJobListing } from "@/features/jobs/parser";
import { FIT_COMPONENT_WEIGHTS } from "@/features/fit/scoring-config";
import { scoreJob } from "@/features/fit/score-job";
import type {
  CandidateFitProfile,
  PortfolioEvidence,
} from "@/features/fit/types";

const baseCandidate: CandidateFitProfile = {
  targetRoleFamilies: ["AI Implementation Specialist", "Solutions Engineer"],
  skills: [
    { name: "SQL", evidence: "professional" },
    { name: "REST APIs", evidence: "portfolio" },
  ],
  relevantProfessionalExperienceYears: 1,
  careerStage: "entry",
  currentSalaryAnnualCents: 4_900_000,
  preferredSalaryMinimumAnnualCents: 6_000_000,
  preferredSalaryTargetAnnualCents: 7_500_000,
  preferredWorkArrangements: ["remote", "hybrid", "on_site"],
  preferredIndustries: ["Healthcare Technology", "Artificial Intelligence"],
  location: {
    city: "Pittsburgh",
    region: "Pennsylvania",
    country: "United States",
    timezone: "Eastern Time",
  },
  relocationPreference: false,
  workAuthorizationCountries: ["United States"],
  citizenships: ["United States"],
  securityClearances: [],
  licenses: [],
  dealBreakers: null,
};

const portfolio: PortfolioEvidence[] = [
  {
    id: "hospital-map",
    name: "Hospital 3D Map",
    technologies: ["SQL", "REST APIs"],
    roleFamilies: ["Implementation Specialist"],
    industries: ["Healthcare Technology"],
    responsibilities: ["Built an operational tool for hospital users"],
    status: "prototype",
  },
];

describe("scoreJob", () => {
  it("uses the brief's exact eight weights", () => {
    expect(FIT_COMPONENT_WEIGHTS).toEqual({
      roleFamily: 20,
      skills: 15,
      experience: 15,
      compensation: 15,
      workArrangement: 10,
      portfolio: 10,
      careerValue: 10,
      industry: 5,
    });
    expect(Object.values(FIT_COMPONENT_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("shrinks all unknown components to 50 with zero coverage", () => {
    const job = parseJobListing({
      title: "Mystery Role",
      company: "Acme",
      descriptionRaw: "Role details are not yet available.",
    });
    const candidate: CandidateFitProfile = {
      ...baseCandidate,
      targetRoleFamilies: null,
      skills: null,
      relevantProfessionalExperienceYears: null,
      careerStage: null,
      currentSalaryAnnualCents: null,
      preferredSalaryMinimumAnnualCents: null,
      preferredSalaryTargetAnnualCents: null,
      preferredWorkArrangements: null,
      preferredIndustries: null,
      location: null,
    };

    const result = scoreJob({ job, candidate, portfolioProjects: null });

    expect(result.deterministicFitScore).toBe(50);
    expect(result.fitScoreOutOfTen).toBe(5);
    expect(result.scoreCoverage).toBe(0);
    expect(result.assessmentState).toBe("insufficient_data");
    expect(result.verdict).toBe("save_for_later");
    expect(result.reasonsNotToApply.length).toBeGreaterThan(0);
    expect(result.components).toHaveLength(8);
  });

  it("does not renormalize sparse evidence into an artificially perfect result", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      descriptionRaw: "Role details are not yet available.",
    });
    const candidate: CandidateFitProfile = {
      ...baseCandidate,
      targetRoleFamilies: ["Implementation Specialist"],
      skills: null,
      relevantProfessionalExperienceYears: null,
      careerStage: null,
      currentSalaryAnnualCents: null,
      preferredSalaryMinimumAnnualCents: null,
      preferredSalaryTargetAnnualCents: null,
      preferredWorkArrangements: null,
      preferredIndustries: null,
      location: null,
    };

    const result = scoreJob({ job, candidate, portfolioProjects: null });

    expect(result.deterministicFitScore).toBe(60);
    expect(result.scoreCoverage).toBe(0.2);
    expect(result.assessmentState).toBe("insufficient_data");
  });

  it("produces an auditable component breakdown for a credible role", () => {
    const job = parseJobListing({
      title: "Associate AI Implementation Consultant",
      company: "Acme Health",
      location: "Remote - United States",
      salarySourceHint: "employer_posted",
      descriptionRaw: `
Help hospital customers implement AI workflows, configure integrations, and launch useful products.
This is a fully remote, full-time role for United States residents only.
Base salary: $75,000 - $90,000 per year.

Required Qualifications
- 1+ years of professional customer implementation experience
- SQL
- REST API experience

Responsibilities
- Configure AI workflows for healthcare customers
- Run customer onboarding and cross-functional demos
- Own implementation plans and product launches
`,
    });

    const result = scoreJob({ job, candidate: baseCandidate, portfolioProjects: portfolio });

    expect(result.deterministicFitScore).toBeGreaterThan(70);
    expect(result.scoreCoverage).toBeGreaterThanOrEqual(0.6);
    expect(result.eligibility.status).toBe("eligible");
    expect(result.verdict).not.toBe("skip");
    expect(result.components.map((component) => component.key)).toEqual([
      "roleFamily",
      "skills",
      "experience",
      "compensation",
      "workArrangement",
      "portfolio",
      "careerValue",
      "industry",
    ]);
    expect(
      result.components.reduce((sum, component) => sum + component.weightedContribution, 0),
    ).toBeCloseTo(result.deterministicFitScore, 1);
    expect(result.reasonsNotToApply.length).toBeGreaterThan(0);
    expect(result.reasonsToApply.length).toBeGreaterThan(0);
  });

  it("keeps unknown salary neutral instead of treating it as zero or inventing an estimate", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      descriptionRaw: "This is a fully remote role helping customers configure workflows.",
    });

    const result = scoreJob({ job, candidate: baseCandidate, portfolioProjects: portfolio });
    const compensation = result.components.find(
      (component) => component.key === "compensation",
    );

    expect(compensation).toMatchObject({
      rawScore: null,
      coverage: 0,
      effectiveScore: 50,
      weightedContribution: 7.5,
    });
    expect(job.salary.minimumCents).toBeNull();
    expect(job.salary.maximumCents).toBeNull();
  });

  it("treats an incompatible remote restriction as a separate eligibility failure", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      location: "Remote",
      descriptionRaw:
        "This is a fully remote position. Employees must reside in California. Help customers implement workflows.",
    });

    const result = scoreJob({ job, candidate: baseCandidate, portfolioProjects: portfolio });
    const work = result.components.find((component) => component.key === "workArrangement");

    expect(result.eligibility.status).toBe("ineligible");
    expect(result.verdict).toBe("skip");
    expect(result.stretchScore).toBe(10);
    expect(work?.rawScore).toBe(0);
    expect(result.eligibility.reasons[0]?.kind).toBe("blocker");
  });

  it("leaves a remote restriction unresolved when candidate location is missing", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      descriptionRaw:
        "This is a fully remote position. Employees must reside in California.",
    });
    const result = scoreJob({
      job,
      candidate: { ...baseCandidate, location: null },
      portfolioProjects: portfolio,
    });

    expect(result.eligibility.status).toBe("unresolved");
    expect(result.verdict).not.toBe("strong_apply");
  });

  it("never converts portfolio work into professional experience years", () => {
    const job = parseJobListing({
      title: "Senior Software Engineer, AI Platform",
      company: "Acme",
      descriptionRaw: `
Build and deploy AI systems using Python.
Required Qualifications
- 5+ years of professional production Python experience
`,
    });
    const candidate: CandidateFitProfile = {
      ...baseCandidate,
      skills: [{ name: "Python", evidence: "portfolio" }],
      relevantProfessionalExperienceYears: 1,
    };
    const extensiveProject: PortfolioEvidence[] = [
      {
        id: "ai-project",
        name: "AI Portfolio Project",
        technologies: ["Python"],
        roleFamilies: ["Software Engineer"],
        industries: ["Artificial Intelligence"],
        responsibilities: ["Built and deployed an AI prototype"],
        status: "published",
      },
    ];

    const withPortfolio = scoreJob({ job, candidate, portfolioProjects: extensiveProject });
    const withoutPortfolio = scoreJob({ job, candidate, portfolioProjects: null });
    const withExperience = withPortfolio.components.find(
      (component) => component.key === "experience",
    );
    const withoutExperience = withoutPortfolio.components.find(
      (component) => component.key === "experience",
    );

    expect(withExperience?.rawScore).toBe(0);
    expect(withExperience?.rawScore).toBe(withoutExperience?.rawScore);
    expect(withPortfolio.stretchScore).toBe(10);
    expect(withPortfolio.readiness).toBe("not_yet_efficient");
    expect(withPortfolio.verdict).toBe("save_for_later");
  });

  it("penalizes preferred years more softly than required years", () => {
    const requiredJob = parseJobListing({
      title: "Solutions Engineer",
      company: "Acme",
      descriptionRaw: "Required Qualifications\n- 5+ years of professional solutions experience",
    });
    const preferredJob = parseJobListing({
      title: "Solutions Engineer",
      company: "Acme",
      descriptionRaw: "Preferred Qualifications\n- 5+ years of professional solutions experience",
    });

    const required = scoreJob({
      job: requiredJob,
      candidate: baseCandidate,
      portfolioProjects: portfolio,
    });
    const preferred = scoreJob({
      job: preferredJob,
      candidate: baseCandidate,
      portfolioProjects: portfolio,
    });
    const requiredScore = required.components.find(
      (component) => component.key === "experience",
    )?.rawScore;
    const preferredScore = preferred.components.find(
      (component) => component.key === "experience",
    )?.rawScore;

    expect(requiredScore).toBe(0);
    expect(preferredScore).toBe(60);
    expect(preferred.stretchScore).toBeLessThan(required.stretchScore);
  });

  it("caps a one-year required experience gap at Apply as a Stretch", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      location: "Remote - United States",
      salarySourceHint: "employer_posted",
      descriptionRaw: `
This is a fully remote full-time role implementing AI workflows.
Base salary: $80,000 - $95,000 per year.

What we are looking for
- 2+ years of professional implementation experience
- Technical support experience

What you'll do
- Configure AI workflows and onboard customers
`,
    });

    const result = scoreJob({
      job,
      candidate: baseCandidate,
      portfolioProjects: portfolio,
    });

    expect(result.components.find((component) => component.key === "experience")?.rawScore).toBe(
      75,
    );
    expect(result.verdict).toBe("apply_as_stretch");
    expect(result.readiness).toBe("ready_with_positioning");
  });

  it("does not let an external salary estimate satisfy a hard salary floor", () => {
    const job = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      descriptionRaw: "Estimated salary: $80,000 - $95,000 per year. This is a fully remote role.",
    });
    const result = scoreJob({
      job,
      candidate: {
        ...baseCandidate,
        dealBreakers: { minimumAnnualSalaryCents: 7_000_000 },
      },
      portfolioProjects: portfolio,
    });

    expect(job.salary.source).toBe("externally_estimated");
    expect(result.eligibility.status).toBe("unresolved");
    expect(result.verdict).not.toBe("strong_apply");
  });
});
