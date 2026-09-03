import type { RoleTargetPreference, SearchContract } from "@/features/api-v2/contracts";

import type { MobileProfileData, MobileRoleTargetInput } from "./api";

export const MOBILE_ROLE_PRESETS = [
  {
    canonicalFamily: "implementation",
    label: "Implementation",
    aliases: ["Implementation Specialist", "Implementation Analyst"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "health_tech_implementation",
    label: "Health-tech implementation",
    aliases: ["Healthcare Implementation Specialist", "Clinical Systems Implementation"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "ai_enablement_operations",
    label: "AI enablement & ops",
    aliases: ["AI Operations Analyst", "AI Enablement Specialist"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "product_operations",
    label: "Product operations",
    aliases: ["Product Operations Analyst", "Product Ops Coordinator"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "technical_customer_success",
    label: "Technical success",
    aliases: ["Technical Customer Success", "Technical Success Specialist"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "business_systems_automation",
    label: "Systems & automation",
    aliases: ["Business Systems Analyst", "Automation Analyst"],
    readiness: "ready_now",
  },
  {
    canonicalFamily: "associate_solutions",
    label: "Solutions consulting",
    aliases: ["Associate Solutions Consultant", "Junior Solutions Engineer"],
    readiness: "stretch",
  },
  {
    canonicalFamily: "associate_product",
    label: "Associate product",
    aliases: ["Associate Product Manager", "Product Analyst"],
    readiness: "stretch",
  },
  {
    canonicalFamily: "technical_product_specialist",
    label: "Technical product",
    aliases: ["Technical Product Specialist", "Product Support Specialist"],
    readiness: "stretch",
  },
] as const;

export type MobileRolePreset = (typeof MOBILE_ROLE_PRESETS)[number];

export type MobileRoleOption = {
  canonicalFamily: string;
  label: string;
  readiness: "ready_now" | "stretch";
};

export type MobileRoleEditorState = {
  allowedSeniority: readonly string[];
  maximumRequiredExperienceYears: number;
  selectedFamilies: readonly string[];
};

const SHARED_ROLE_EXCLUSIONS = [
  "Senior",
  "Staff",
  "Principal",
  "Manager",
  "Director",
  "Quota-carrying",
  "Requires 4+ years",
];

export function toggleSelection<T>(
  current: readonly T[],
  value: T,
  options: { maximum?: number; minimum?: number } = {},
) {
  if (current.includes(value)) {
    return current.length <= (options.minimum ?? 0)
      ? [...current]
      : current.filter((item) => item !== value);
  }
  if (current.length >= (options.maximum ?? Number.POSITIVE_INFINITY)) {
    return [...current];
  }
  return [...current, value];
}

function storedTargetInput(target: RoleTargetPreference): MobileRoleTargetInput {
  return {
    aliases: [...target.aliases],
    allowedSeniorityLevels: [...target.allowedSeniority],
    canonicalFamily: target.canonicalFamily,
    exclusions: [...target.exclusions],
    label: target.label,
    maximumRequiredExperienceYears: target.maximumYearsExperience,
    minimumRequiredExperienceYears: target.minimumYearsExperience,
    priorityRank: target.priority,
    readiness: target.readiness,
  };
}

export function buildRoleTargetInputs(
  selectedFamilies: readonly string[],
  currentTargets: SearchContract["roleTargets"],
  allowedSeniority: readonly string[],
  maximumRequiredExperienceYears?: number,
) {
  const currentByFamily = new Map(
    currentTargets.map((target) => [target.canonicalFamily, target]),
  );
  const presetByFamily = new Map<string, MobileRolePreset>(
    MOBILE_ROLE_PRESETS.map((target) => [target.canonicalFamily, target]),
  );

  return selectedFamilies.flatMap((family, index) => {
    const current = currentByFamily.get(family);
    if (current) {
      return [{
        ...storedTargetInput(current),
        allowedSeniorityLevels:
          allowedSeniority.length > 0
            ? [...allowedSeniority]
            : [...current.allowedSeniority],
        maximumRequiredExperienceYears:
          maximumRequiredExperienceYears ?? current.maximumYearsExperience,
        minimumRequiredExperienceYears:
          maximumRequiredExperienceYears === undefined
            ? current.minimumYearsExperience
            : Math.min(
                current.minimumYearsExperience ?? 0,
                maximumRequiredExperienceYears,
              ),
        priorityRank: index + 1,
      }];
    }
    const preset = presetByFamily.get(family);
    if (!preset) return [];
    return [
      {
        aliases: [...preset.aliases],
        allowedSeniorityLevels:
          allowedSeniority.length > 0 ? [...allowedSeniority] : ["entry", "mid"],
        canonicalFamily: preset.canonicalFamily,
        exclusions: [...SHARED_ROLE_EXCLUSIONS],
        label: preset.label,
        maximumRequiredExperienceYears: maximumRequiredExperienceYears ?? 3,
        minimumRequiredExperienceYears: 0,
        priorityRank: index + 1,
        readiness: preset.readiness,
      },
    ] satisfies MobileRoleTargetInput[];
  });
}

export function roleOptionsForProfile(
  targets: SearchContract["roleTargets"],
): MobileRoleOption[] {
  const options = new Map<string, MobileRoleOption>();
  for (const target of [...targets].sort((left, right) => left.priority - right.priority)) {
    options.set(target.canonicalFamily, {
      canonicalFamily: target.canonicalFamily,
      label: target.label,
      readiness: target.readiness,
    });
  }
  for (const preset of MOBILE_ROLE_PRESETS) {
    if (!options.has(preset.canonicalFamily)) {
      options.set(preset.canonicalFamily, preset);
    }
  }
  return [...options.values()];
}

export function roleLabelsForFamilies(
  selectedFamilies: readonly string[],
  targets: SearchContract["roleTargets"],
) {
  const labels = new Map<string, string>(
    targets.map((target) => [target.canonicalFamily, target.label]),
  );
  for (const preset of MOBILE_ROLE_PRESETS) {
    if (!labels.has(preset.canonicalFamily)) {
      labels.set(preset.canonicalFamily, preset.label);
    }
  }
  return selectedFamilies.map((family) => labels.get(family) ?? family);
}

function sameOrderedValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function initialRoleEditorState(
  profile: MobileProfileData,
): MobileRoleEditorState {
  const targets = [...profile.searchContract.roleTargets].sort(
    (left, right) => left.priority - right.priority,
  );
  return {
    allowedSeniority: [...profile.searchContract.constraints.seniority],
    maximumRequiredExperienceYears: Math.min(
      10,
      Math.max(
        profile.searchContract.current.yearsExperience + 1,
        ...targets.map((target) => target.maximumYearsExperience ?? 0),
      ),
    ),
    selectedFamilies: targets.map((target) => target.canonicalFamily),
  };
}

export function roleTargetEditorChanged(
  state: MobileRoleEditorState,
  profile: MobileProfileData,
) {
  const initial = initialRoleEditorState(profile);
  return (
    !sameOrderedValues(state.selectedFamilies, initial.selectedFamilies) ||
    !sameOrderedValues(state.allowedSeniority, initial.allowedSeniority) ||
    state.maximumRequiredExperienceYears !== initial.maximumRequiredExperienceYears
  );
}

export function salaryValuesFromProfile(profile: MobileProfileData) {
  return {
    currentSalaryCents: profile.searchContract.current.salaryCents,
    preferredSalaryMinimumCents:
      profile.searchContract.constraints.salaryFloorCents,
    preferredSalaryTargetCents:
      profile.searchContract.constraints.salaryTargetCents,
  };
}

export function salaryInvariantError(values: {
  currentSalaryCents: number;
  preferredSalaryMinimumCents: number;
  preferredSalaryTargetCents: number;
}) {
  if (values.preferredSalaryMinimumCents < values.currentSalaryCents) {
    return "Your hard floor must be at least your current compensation.";
  }
  if (values.preferredSalaryTargetCents < values.preferredSalaryMinimumCents) {
    return "Your preferred target must be at least your hard floor.";
  }
  return null;
}

export function formatPairingCode(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "")
    .slice(0, 12);
  return [normalized.slice(0, 4), normalized.slice(4, 8), normalized.slice(8, 12)]
    .filter(Boolean)
    .join("-");
}

export function initialRoleFamilies(profile: MobileProfileData) {
  return initialRoleEditorState(profile).selectedFamilies;
}
