import type { EmergencyFeedProfile } from "@/features/jobs/emergency-feed";
import type { CandidateRoleTargetInput } from "./input";

/** Translate the old device-only direction into an editable draft, never a background overwrite. */
export function deviceSearchRoleTargets(profile: EmergencyFeedProfile): CandidateRoleTargetInput[] {
  return profile.targetRoleFamilies.filter((label) => label.length >= 2).slice(0, 12).map((label, index) => ({
    canonicalFamily: `device_role_${index + 1}`,
    label,
    aliases: [label],
    priorityRank: index + 1,
    readiness: "ready_now",
    allowedSeniorityLevels: profile.desiredSeniorityLevels.length ? [...profile.desiredSeniorityLevels] : ["entry", "mid"],
    minimumRequiredExperienceYears: 0,
    maximumRequiredExperienceYears: Math.min(50, Math.floor(profile.yearsExperience ?? 0) + 2),
    exclusions: [],
  }));
}
