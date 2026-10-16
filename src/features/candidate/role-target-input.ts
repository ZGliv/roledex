import type { CandidateRoleTargetInput } from "./input";

/** Database views also contain IDs and timestamps; mutations accept only editable fields. */
export function roleTargetInput(
  target: CandidateRoleTargetInput,
  priorityRank: number,
): CandidateRoleTargetInput {
  return {
    canonicalFamily: target.canonicalFamily,
    label: target.label,
    aliases: [...target.aliases],
    priorityRank,
    readiness: target.readiness,
    allowedSeniorityLevels: [...target.allowedSeniorityLevels],
    minimumRequiredExperienceYears: target.minimumRequiredExperienceYears,
    maximumRequiredExperienceYears: target.maximumRequiredExperienceYears,
    exclusions: [...target.exclusions],
  };
}
