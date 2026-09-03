import { describe, expect, it } from "vitest";

import { NativeProfileUpdateSchema } from "@/features/native/input";
import {
  buildRoleTargetInputs,
  formatPairingCode,
  initialRoleEditorState,
  initialRoleFamilies,
  roleLabelsForFamilies,
  roleOptionsForProfile,
  roleTargetEditorChanged,
  salaryInvariantError,
  salaryValuesFromProfile,
  toggleSelection,
} from "../mobile/src/profile-model";
import type { MobileProfileData } from "../mobile/src/api";

function profileWithCustomRole(): MobileProfileData {
  return {
    searchContract: {
      version: 2,
      revision: 8,
      current: {
        role: "Revenue systems coordinator",
        yearsExperience: 2,
        salaryCents: 73_250_00,
        location: "Pittsburgh, PA",
      },
      roleTargets: [
        {
          id: "custom-target",
          canonicalFamily: "revenue_systems_enablement",
          label: "Revenue systems enablement",
          aliases: ["Revenue Systems Analyst"],
          priority: 1,
          readiness: "ready_now",
          allowedSeniority: ["entry", "mid"],
          minimumYearsExperience: 1,
          maximumYearsExperience: 4,
          exclusions: ["Quota carrying"],
        },
      ],
      constraints: {
        salaryFloorCents: 76_125_00,
        salaryTargetCents: 91_375_00,
        seniority: ["entry", "mid"],
        workModes: ["remote", "hybrid"],
        strictWorkModes: true,
        employmentTypes: ["full_time"],
        commuteRadiusMiles: 25,
        maximumOfficeDaysPerWeek: 2,
        relocationDestinations: [],
        maximumTravelPercent: 20,
        workAuthorization: "work_authorized",
        requiresSponsorship: false,
        missingSalaryPolicy: "explore_only",
        excludedTitles: [],
        excludedCompanies: [],
        excludedIndustries: [],
      },
      preferences: { industries: [], careerGoals: [], interests: [] },
      evidence: [],
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
    onboardingCompleted: true,
    editor: {
      currentRole: "Revenue systems coordinator",
      currentSalaryCents: 73_250_00,
      location: "Pittsburgh, PA",
      relocationPreference: null,
      yearsExperience: 2,
      preferredIndustries: [],
      targetRoleFamilies: ["Revenue systems enablement"],
      skills: [],
      strengths: [],
      weaknesses: [],
      interests: [],
      careerGoals: [],
      dealBreakers: [],
      interviewConcerns: [],
    },
    improveFeed: { id: "done", title: "All set", detail: "No action needed" },
    learnedPreferences: { controls: ["more", "less", "ignore", "reset"] },
    resumes: [],
    settings: { dailyDigestEnabled: false, reminderNotificationsEnabled: false },
  };
}

describe("mobile profile productization", () => {
  it("formats recovery codes without ambiguous characters", () => {
    expect(formatPairingCode("abcd efgh jklm")).toBe("ABCD-EFGH-JKLM");
    expect(formatPairingCode("a1bc-o0de-zzzz")).toBe("ABCD-EZZZ-Z");
  });

  it("keeps selector minimums and maximums deterministic", () => {
    expect(toggleSelection(["remote"], "remote", { minimum: 1 })).toEqual([
      "remote",
    ]);
    expect(
      toggleSelection(["remote", "hybrid"], "on_site", { maximum: 2 }),
    ).toEqual(["remote", "hybrid"]);
    expect(toggleSelection(["remote", "hybrid"], "remote")).toEqual([
      "hybrid",
    ]);
  });

  it("turns selected role presets into ordered hard-bounded targets", () => {
    const targets = buildRoleTargetInputs(
      ["implementation", "associate_product"],
      [
        {
          id: "target-1",
          canonicalFamily: "implementation",
          label: "Implementation specialist / analyst",
          aliases: ["Implementation Analyst"],
          priority: 7,
          readiness: "ready_now",
          allowedSeniority: ["entry"],
          minimumYearsExperience: 2,
          maximumYearsExperience: 8,
          exclusions: ["Director"],
        },
      ],
      ["entry", "mid"],
      3,
    );

    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      canonicalFamily: "implementation",
      priorityRank: 1,
      allowedSeniorityLevels: ["entry", "mid"],
      minimumRequiredExperienceYears: 2,
      maximumRequiredExperienceYears: 3,
    });
    expect(targets[1]).toMatchObject({
      canonicalFamily: "associate_product",
      priorityRank: 2,
      readiness: "stretch",
      maximumRequiredExperienceYears: 3,
    });
  });

  it("keeps arbitrary role targets selected and unchanged during unrelated edits", () => {
    const profile = profileWithCustomRole();
    const initial = initialRoleEditorState(profile);

    expect(initialRoleFamilies(profile)).toEqual([
      "revenue_systems_enablement",
    ]);
    expect(roleTargetEditorChanged(initial, profile)).toBe(false);
    expect(
      roleLabelsForFamilies(initial.selectedFamilies, profile.searchContract.roleTargets),
    ).toEqual(["Revenue systems enablement"]);
    expect(roleOptionsForProfile(profile.searchContract.roleTargets)[0]).toMatchObject({
      canonicalFamily: "revenue_systems_enablement",
      label: "Revenue systems enablement",
    });
  });

  it("round-trips custom targets instead of replacing them with presets", () => {
    const profile = profileWithCustomRole();
    const target = buildRoleTargetInputs(
      ["revenue_systems_enablement"],
      profile.searchContract.roleTargets,
      ["entry", "mid"],
      4,
    )[0];

    expect(target).toEqual({
      aliases: ["Revenue Systems Analyst"],
      allowedSeniorityLevels: ["entry", "mid"],
      canonicalFamily: "revenue_systems_enablement",
      exclusions: ["Quota carrying"],
      label: "Revenue systems enablement",
      maximumRequiredExperienceYears: 4,
      minimumRequiredExperienceYears: 1,
      priorityRank: 1,
      readiness: "ready_now",
    });
  });

  it("keeps stored salary values exact and validates without coercing them", () => {
    const values = salaryValuesFromProfile(profileWithCustomRole());
    expect(values).toEqual({
      currentSalaryCents: 73_250_00,
      preferredSalaryMinimumCents: 76_125_00,
      preferredSalaryTargetCents: 91_375_00,
    });
    expect(salaryInvariantError(values)).toBeNull();
    expect(
      salaryInvariantError({
        ...values,
        preferredSalaryTargetCents: 70_000_00,
      }),
    ).toBe("Your preferred target must be at least your hard floor.");
  });

  it("accepts the additive mobile role-target and onboarding sections", () => {
    expect(
      NativeProfileUpdateSchema.safeParse({
        section: "role_targets",
        values: {
          expectedRevision: 1,
          targets: [
            {
              aliases: ["Implementation Analyst"],
              allowedSeniorityLevels: ["entry", "mid"],
              canonicalFamily: "implementation",
              exclusions: ["Director"],
              label: "Implementation",
              maximumRequiredExperienceYears: 3,
              minimumRequiredExperienceYears: 0,
              priorityRank: 1,
              readiness: "ready_now",
            },
          ],
        },
      }).success,
    ).toBe(true);
    expect(
      NativeProfileUpdateSchema.safeParse({
        section: "onboarding",
        values: { completed: true },
      }).success,
    ).toBe(true);
    expect(
      NativeProfileUpdateSchema.safeParse({
        section: "onboarding",
        values: { completed: false },
      }).success,
    ).toBe(false);
  });
});
