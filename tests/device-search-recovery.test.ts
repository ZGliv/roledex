import { describe, expect, it } from "vitest";
import { deviceSearchRoleTargets } from "@/features/candidate/device-search-recovery";
import { CandidateRoleTargetsReplaceSchema } from "@/features/candidate/input";

describe("device-only search recovery", () => {
  it("keeps custom directions and their seniority/experience limits in a valid review draft", () => {
    const targets = deviceSearchRoleTargets({
      targetRoleFamilies: ["Museum technology specialist", "Research operations"],
      desiredSeniorityLevels: ["mid", "senior"],
      yearsExperience: 7,
      location: "Chicago, IL",
      preferredSalaryMinimumCents: 9_000_000,
      preferredWorkModes: ["remote"],
    });
    expect(CandidateRoleTargetsReplaceSchema.safeParse({expectedRevision: 1, targets}).success).toBe(true);
    expect(targets.map((target) => target.label)).toEqual(["Museum technology specialist", "Research operations"]);
    expect(targets[0]).toMatchObject({allowedSeniorityLevels: ["mid", "senior"], maximumRequiredExperienceYears: 9});
  });
});
