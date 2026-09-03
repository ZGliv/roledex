import { describe, expect, it } from "vitest";

import {
  eligibleOnboardingCalibrationJobs,
  onboardingCalibrationGoal,
  ONBOARDING_CALIBRATION_PREFETCH,
  ONBOARDING_CALIBRATION_TARGET,
} from "@/features/candidate/onboarding-calibration";

describe("onboarding calibration", () => {
  it("keeps only qualified unseen cards and caps the rapid calibration set", () => {
    const jobs = [
      { currentDecision: "unseen", feedTier: "blocked", id: "blocked" },
      { currentDecision: "saved", feedTier: "ready_now", id: "decided" },
      ...Array.from({ length: 14 }, (_, index) => ({
        currentDecision: "unseen",
        feedTier: index % 3 === 0 ? "credible_stretch" : "ready_now",
        id: `qualified-${index}`,
      })),
    ];

    const result = eligibleOnboardingCalibrationJobs(jobs);

    expect(result).toHaveLength(ONBOARDING_CALIBRATION_PREFETCH);
    expect(result.every((job) => job.feedTier !== "blocked")).toBe(true);
    expect(result.every((job) => job.currentDecision === "unseen")).toBe(true);
  });

  it("asks for eight choices when inventory allows and never blocks on a short feed", () => {
    expect(ONBOARDING_CALIBRATION_TARGET).toBe(8);
    expect(onboardingCalibrationGoal(12)).toBe(8);
    expect(onboardingCalibrationGoal(3)).toBe(3);
    expect(onboardingCalibrationGoal(0)).toBe(0);
  });
});
