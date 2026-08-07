export type ProfileCompletenessInput = {
  careerGoals: readonly string[] | string;
  currentRole: string;
  currentSalaryCents: number | string;
  dealBreakers: readonly string[] | string;
  location: string | null;
  preferredIndustries: readonly string[] | string;
  preferredSalaryMinimumCents: number | string;
  preferredSalaryTargetCents: number | string;
  preferredWorkArrangements: readonly string[];
  skills: readonly string[] | string;
  targetRoleFamilies: readonly string[] | string;
  yearsExperience: number | string;
};

type CompletenessSignal = {
  complete: (profile: ProfileCompletenessInput) => boolean;
  label: string;
  weight: number;
};

function hasListValue(value: readonly string[] | string) {
  return Array.isArray(value)
    ? value.some((item) => item.trim().length > 0)
    : String(value).trim().length > 0;
}

function positiveMoney(value: number | string) {
  const amount =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[$,]/g, "")) * 100;
  return Number.isFinite(amount) && amount > 0;
}

const COMPLETENESS_SIGNALS: readonly CompletenessSignal[] = [
  {
    label: "your current role",
    weight: 10,
    complete: (profile) => {
      const role = profile.currentRole.trim().toLowerCase();
      return role.length >= 2 && role !== "exploring new opportunities";
    },
  },
  {
    label: "target role directions",
    weight: 15,
    complete: (profile) => hasListValue(profile.targetRoleFamilies),
  },
  {
    label: "preferred industries",
    weight: 10,
    complete: (profile) => hasListValue(profile.preferredIndustries),
  },
  {
    label: "your location",
    weight: 10,
    complete: (profile) => Boolean(profile.location?.trim()),
  },
  {
    label: "work-mode preferences",
    weight: 10,
    complete: (profile) => profile.preferredWorkArrangements.length > 0,
  },
  {
    label: "current compensation",
    weight: 5,
    complete: (profile) => positiveMoney(profile.currentSalaryCents),
  },
  {
    label: "minimum and target compensation",
    weight: 15,
    complete: (profile) =>
      positiveMoney(profile.preferredSalaryMinimumCents) &&
      positiveMoney(profile.preferredSalaryTargetCents),
  },
  {
    label: "years of experience",
    weight: 5,
    complete: (profile) => /^\d{1,2}$/.test(String(profile.yearsExperience).trim()),
  },
  {
    label: "skills you can prove",
    weight: 15,
    complete: (profile) => hasListValue(profile.skills),
  },
  {
    label: "career priorities",
    weight: 3,
    complete: (profile) => hasListValue(profile.careerGoals),
  },
  {
    label: "deal-breakers",
    weight: 2,
    complete: (profile) => hasListValue(profile.dealBreakers),
  },
] as const;

export type ProfileCompleteness = {
  completedSignals: number;
  label: string;
  missing: string[];
  score: number;
  totalSignals: number;
};

export function calculateProfileCompleteness(
  profile: ProfileCompletenessInput,
): ProfileCompleteness {
  let score = 0;
  let completedSignals = 0;
  const missing: string[] = [];

  for (const signal of COMPLETENESS_SIGNALS) {
    if (signal.complete(profile)) {
      score += signal.weight;
      completedSignals += 1;
    } else {
      missing.push(signal.label);
    }
  }

  return {
    completedSignals,
    label:
      score >= 90
        ? "Highly tailored"
        : score >= 70
          ? "Strong context"
          : score >= 45
            ? "Useful foundation"
            : "Getting started",
    missing,
    score,
    totalSignals: COMPLETENESS_SIGNALS.length,
  };
}
