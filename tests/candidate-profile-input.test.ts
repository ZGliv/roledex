import { describe, expect, it } from "vitest";

import {
  CandidateProfileUpdateSchema,
  candidateProfileFingerprint,
  normalizeMultilineList,
  profileUpdateFromSubmission,
} from "@/features/candidate/input";

const validInput = {
  expectedRevision: "3",
  currentRole: "Hospital Help Desk Analyst",
  location: "Pittsburgh, PA",
  relocationPreference: "Prefer remote",
  currentSalaryCents: "$49,000",
  preferredSalaryMinimumCents: "60,000",
  preferredSalaryTargetCents: "80000",
  yearsExperience: "2",
  preferredWorkArrangements: ["remote", "hybrid"],
  preferredIndustries: "Healthcare technology\nArtificial intelligence",
  targetRoleFamilies: "Implementation specialist\nProduct analyst",
  skills: "SQL\nTechnical communication",
  strengths: "Ships useful products",
  weaknesses: "Limited enterprise implementation experience",
  interests: "AI agents",
  careerGoals: "Build practical AI experience",
  dealBreakers: "Commission-heavy compensation",
  interviewConcerns: "Algorithm-heavy live coding",
};

describe("candidate profile input", () => {
  it("normalizes bullets, whitespace, and case-insensitive duplicates", () => {
    expect(
      normalizeMultilineList(" - SQL  \r\n• Product   thinking\n sql\n\n2. REST APIs"),
    ).toEqual(["SQL", "Product thinking", "REST APIs"]);
  });

  it("validates preferences and converts annual dollars to cents", () => {
    const result = CandidateProfileUpdateSchema.parse(validInput);
    expect(result).toMatchObject({
      currentSalaryCents: 4_900_000,
      expectedRevision: 3,
      preferredSalaryMinimumCents: 6_000_000,
      preferredSalaryTargetCents: 8_000_000,
      yearsExperience: 2,
      preferredWorkArrangements: ["remote", "hybrid"],
      targetRoleFamilies: ["Implementation specialist", "Product analyst"],
    });
  });

  it("rejects an inverted salary target and missing work preference", () => {
    const result = CandidateProfileUpdateSchema.safeParse({
      ...validInput,
      preferredSalaryMinimumCents: "90,000",
      preferredSalaryTargetCents: "80,000",
      preferredWorkArrangements: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors).toMatchObject({
        preferredSalaryTargetCents: expect.any(Array),
        preferredWorkArrangements: expect.any(Array),
      });
    }
  });

  it("keeps the fingerprint stable when set-like lists are reordered", () => {
    const first = CandidateProfileUpdateSchema.parse(validInput);
    const second = CandidateProfileUpdateSchema.parse({
      ...validInput,
      expectedRevision: "4",
      skills: "Technical communication\nSQL",
      targetRoleFamilies: "Product analyst\nImplementation specialist",
    });
    expect(candidateProfileFingerprint(profileUpdateFromSubmission(second))).toBe(
      candidateProfileFingerprint(profileUpdateFromSubmission(first)),
    );
  });

  it("requires a positive expected profile revision", () => {
    expect(
      CandidateProfileUpdateSchema.safeParse({
        ...validInput,
        expectedRevision: "0",
      }).success,
    ).toBe(false);
  });
});
