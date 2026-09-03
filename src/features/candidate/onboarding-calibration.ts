export const ONBOARDING_CALIBRATION_TARGET = 8;
export const ONBOARDING_CALIBRATION_PREFETCH = 10;

type CalibrationCandidate = {
  currentDecision: string;
  feedTier: string;
};

/**
 * The feed query has already applied the candidate's hard admission rules.
 * This final guard prevents a blocked or previously decided card from ever
 * being presented as onboarding calibration if a stale client payload is
 * accidentally supplied.
 */
export function eligibleOnboardingCalibrationJobs<
  T extends CalibrationCandidate,
>(jobs: readonly T[]) {
  return jobs
    .filter(
      (job) => job.feedTier !== "blocked" && job.currentDecision === "unseen",
    )
    .slice(0, ONBOARDING_CALIBRATION_PREFETCH);
}

export function onboardingCalibrationGoal(availableJobs: number) {
  return Math.min(
    ONBOARDING_CALIBRATION_TARGET,
    Math.max(0, Math.trunc(availableJobs)),
  );
}
