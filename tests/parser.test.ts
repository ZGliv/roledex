import { describe, expect, it } from "vitest";

import { parseJobListing } from "@/features/jobs/parser";
import { JOB_PARSER_VERSION } from "@/features/jobs/types";

describe("parseJobListing", () => {
  it("preserves raw text, creates separate clean text, and extracts a conservative summary", () => {
    const raw =
      "Acme builds workflow software for hospital teams.\r\n\r\n  You will help customers configure useful tools and solve operational problems.  \r\n\r\nRequired Qualifications:\r\n- SQL";

    const parsed = parseJobListing({
      title: "Implementation Analyst",
      company: "Acme",
      descriptionRaw: raw,
    });

    expect(parsed.parserVersion).toBe(JOB_PARSER_VERSION);
    expect(parsed.descriptionRaw).toBe(raw);
    expect(parsed.descriptionClean).not.toBe(raw);
    expect(parsed.descriptionClean).not.toContain("\r");
    expect(parsed.roleSummary.value).toBe(
      "Acme builds workflow software for hospital teams. You will help customers configure useful tools and solve operational problems.",
    );
    expect(parsed.roleSummary.evidence[0]?.source).toBe("description");
  });

  it("parses an explicit annual employer-posted base range without changing units", () => {
    const parsed = parseJobListing({
      title: "Product Analyst",
      company: "Acme",
      descriptionRaw:
        "Compensation\nThe salary range for this position is $72,000 - $88,000 per year.",
    });

    expect(parsed.salary).toMatchObject({
      minimumCents: 7_200_000,
      maximumCents: 8_800_000,
      currency: "USD",
      period: "year",
      source: "employer_posted",
      derived: false,
    });
  });

  it.each([
    ["The salary range for this position is $72,000.50 - $88,000.75 per year.", 7_200_050, 8_800_075],
    ["Salary: up to $90,000.75 per year.", null, 9_000_075],
    ["Salary: from $72,000.50 annually.", 7_200_050, null],
    ["Annual base salary: $72,000.50.", 7_200_050, 7_200_050],
    ["Annual salary range: USD 72,000.50 to USD 88,000.75.", 7_200_050, 8_800_075],
    ["Hourly rate: $22.50 to $28.75 per hour.", 2_250, 2_875],
    ["Annual salary range: $72.5k to $88.75k.", 7_250_000, 8_875_000],
  ])("preserves decimal amounts in salary evidence: %s", (descriptionRaw, minimumCents, maximumCents) => {
    const parsed = parseJobListing({ title: "Analyst", company: "Synthetic fixture", descriptionRaw });
    expect(parsed.salary).toMatchObject({ minimumCents, maximumCents, currency: "USD", derived: false });
    expect(parsed.salary.evidence[0]?.excerpt).toBeTruthy();
    expect(descriptionRaw).toContain(parsed.salary.evidence[0]?.excerpt);
  });

  it("keeps one-sided salaries one-sided and never treats OTE or benefits as base salary", () => {
    const upTo = parseJobListing({
      title: "Solutions Consultant",
      company: "Acme",
      descriptionRaw: "Compensation: up to $90k per year.",
      salarySourceHint: "employer_posted",
    });
    expect(upTo.salary.minimumCents).toBeNull();
    expect(upTo.salary.maximumCents).toBe(9_000_000);

    const noBase = parseJobListing({
      title: "Sales Engineer",
      company: "Acme",
      descriptionRaw:
        "On-target earnings (OTE) are $110k annually. Benefits include a $500 wellness stipend and 401(k).",
    });
    expect(noBase.salary.minimumCents).toBeNull();
    expect(noBase.salary.maximumCents).toBeNull();
    expect(noBase.warnings.join(" ")).toMatch(/OTE/i);
  });

  it("classifies a remote/office conflict conservatively and retains regional restrictions", () => {
    const parsed = parseJobListing({
      title: "Implementation Specialist",
      company: "Acme",
      location: "Remote",
      descriptionRaw:
        "This is a fully remote role. Team members must reside in California. You will work 3 days per week in the office.",
    });

    expect(parsed.workArrangement.value).toBe("hybrid");
    expect(parsed.remoteRestrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "region", values: ["California"] }),
      ]),
    );
    expect(parsed.warnings.join(" ")).toMatch(/conflict/i);
  });

  it("separates qualification sections and handles aliases, boundaries, and negation", () => {
    const parsed = parseJobListing({
      title: "Associate Solutions Engineer",
      company: "Acme",
      descriptionRaw: `
Required Qualifications
- 3+ years of professional SaaS implementation experience
- SQL experience
- Python is not required.

Preferred Qualifications
- 1-2 years of Azure experience preferred
- Go is nice to have

About us
The company was founded 7 years ago and works with Google.
`,
    });

    expect(parsed.requiredQualifications.map((item) => item.text)).toContain(
      "3+ years of professional SaaS implementation experience",
    );
    expect(parsed.preferredQualifications.map((item) => item.text)).toContain(
      "1-2 years of Azure experience preferred",
    );
    expect(parsed.technologies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "SQL", kind: "required" }),
        expect.objectContaining({ name: "Azure", kind: "preferred" }),
        expect.objectContaining({ name: "Go", kind: "preferred" }),
      ]),
    );
    expect(parsed.technologies.map((item) => item.name)).not.toContain("Python");
    expect(parsed.technologies.map((item) => item.name)).not.toContain("R");
    expect(parsed.experienceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minimumYears: 3, kind: "required", professionalOnly: true }),
        expect.objectContaining({ minimumYears: 1, maximumYears: 2, kind: "preferred" }),
      ]),
    );
    expect(parsed.experienceRequirements.some((item) => item.minimumYears === 7)).toBe(false);
  });

  it("recognizes common ATS headings and stops benefits from leaking into responsibilities", () => {
    const parsed = parseJobListing({
      title: "Product Manager",
      company: "Acme",
      descriptionRaw: `
What you'll do
- Own the product roadmap
- Partner with engineering

What we are looking for
- 2-5+ years of product or operations experience
- Strong analytical communication
- SQL is preferred

BENEFITS AVAILABLE TO ALL FULL-TIME EMPLOYEES (GLOBAL)
- 401(k) matching
- Wellness stipend
`,
    });

    expect(parsed.responsibilities).toEqual([
      "Own the product roadmap",
      "Partner with engineering",
    ]);
    expect(parsed.requiredQualifications.map((item) => item.text)).toEqual(
      expect.arrayContaining([
        "2-5+ years of product or operations experience",
        "Strong analytical communication",
      ]),
    );
    expect(parsed.preferredQualifications.map((item) => item.text)).toContain(
      "SQL is preferred",
    );
    expect(parsed.experienceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minimumYears: 2, maximumYears: 5, kind: "required" }),
      ]),
    );
    expect(parsed.responsibilities.join(" ")).not.toMatch(/401|wellness/i);
  });

  it("recognizes conversational requirement headings and conservative office conflicts", () => {
    const parsed = parseJobListing({
      title: "Strategic Solutions Engineer",
      company: "Acme",
      location: "Remote",
      descriptionRaw: `
We are an in-office company driven by close collaboration.

Your background looks something like this
- 4-6 years of customer-facing sales engineering experience

Even better if you have
- 2+ years of AI sales engineering experience

Benefits
- Medical and dental coverage
`,
    });

    expect(parsed.workArrangement.value).toBe("on_site");
    expect(parsed.warnings.join(" ")).toMatch(/conflict/i);
    expect(parsed.experienceRequirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minimumYears: 4, maximumYears: 6, kind: "required" }),
        expect.objectContaining({ minimumYears: 2, kind: "preferred" }),
      ]),
    );
    expect(parsed.requiredQualifications.map((item) => item.text).join(" ")).not.toMatch(
      /medical|dental/i,
    );
  });

  it("does not infer management seniority from an individual-contributor Manager title", () => {
    const manager = parseJobListing({
      title: "Customer Success Manager",
      company: "Acme",
      descriptionRaw: "Help customers adopt the product.",
    });
    const director = parseJobListing({
      title: "Associate Director, Customer Success",
      company: "Acme",
      descriptionRaw: "Lead the function.",
    });

    expect(manager.seniority.value).toBeNull();
    expect(director.seniority.value).toBe("leadership");
  });

  it("extracts employment type, industry, travel, deadline, and eligibility evidence", () => {
    const parsed = parseJobListing({
      title: "Healthcare Technology Analyst",
      company: "Acme",
      descriptionRaw: `
This is a full-time role supporting hospital software.
Travel: up to 20% travel.
Application deadline: September 30, 2026
Applicants must be U.S. citizens and hold an active Secret security clearance.
`,
    });

    expect(parsed.employmentType.value).toBe("full_time");
    expect(parsed.industry.value).toBe("Healthcare Technology");
    expect(parsed.travelRequirement?.percent).toBe(20);
    expect(parsed.applicationDeadline.value).toBe("2026-09-30");
    expect(parsed.eligibilityRequirements.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["citizenship", "security_clearance"]),
    );
  });
});
