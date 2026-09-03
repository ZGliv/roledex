import type {
  CandidateProfile,
  CandidateRoleTarget,
  CandidateSkillEvidence as StoredCandidateSkillEvidence,
  JsonObject,
  PortfolioProject,
  ScoreComponent,
} from "@/db/schema";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { scoreJob } from "@/features/fit/score-job";
import type {
  CandidateFitProfile,
  CandidateRoleTargetPreference,
  CandidateSkill,
  DeterministicFitResult,
  PortfolioEvidence,
} from "@/features/fit/types";
import type { ParsedJobListing } from "@/features/jobs/types";
import { hashValue } from "@/lib/hashing";

function parseCandidateLocation(location: string | null) {
  if (!location) return null;
  const [city, region] = location.split(",").map((part) => part.trim());
  return { city: city || null, region: region || null, country: "US" };
}

function candidateRoleTarget(
  target: CandidateRoleTarget,
): CandidateRoleTargetPreference {
  return {
    aliases: [...target.aliases],
    allowedSeniorityLevels: [...target.allowedSeniorityLevels],
    canonicalFamily: target.canonicalFamily,
    exclusions: [...target.exclusions],
    label: target.label,
    maximumRequiredExperienceYears: target.maximumRequiredExperienceYears,
    minimumRequiredExperienceYears: target.minimumRequiredExperienceYears,
    priorityRank: target.priorityRank,
    readiness: target.readiness,
  };
}

function candidateSkillEvidence(skill: string): CandidateSkill["evidence"] {
  return /technical support|active directory|windows imaging/i.test(skill)
    ? "professional"
    : "self_assessed";
}

function structuredSkillEvidence(
  evidenceType: StoredCandidateSkillEvidence["evidenceType"],
): CandidateSkill["evidence"] {
  if (evidenceType === "work_experience") return "professional";
  if (evidenceType === "portfolio_project") return "portfolio";
  if (evidenceType === "education" || evidenceType === "certification") {
    return "coursework";
  }
  return "self_assessed";
}

function skillEvidenceStrength(evidence: CandidateSkill["evidence"]) {
  if (evidence === "professional") return 4;
  if (evidence === "portfolio") return 3;
  if (evidence === "coursework") return 2;
  return 1;
}

function mergedCandidateSkills(
  profile: CandidateProfile,
  records: readonly StoredCandidateSkillEvidence[],
): CandidateSkill[] | null {
  const candidates: CandidateSkill[] = [
    ...profile.skills.map((name) => ({
      name,
      evidence: candidateSkillEvidence(name),
    })),
    ...records.map((record) => ({
      name: record.name,
      evidence: structuredSkillEvidence(record.evidenceType),
    })),
  ];
  if (candidates.length === 0) return null;

  const byName = new Map<string, CandidateSkill>();
  for (const skill of candidates) {
    const key = skill.name.trim().toLocaleLowerCase("en-US");
    if (!key) continue;
    const existing = byName.get(key);
    if (
      !existing ||
      skillEvidenceStrength(skill.evidence) >
        skillEvidenceStrength(existing.evidence)
    ) {
      byName.set(key, skill);
    }
  }
  return byName.size > 0 ? [...byName.values()] : null;
}

const ALL_PROFILE_EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
] as const;

function preferredWorkModes(profile: CandidateProfile) {
  const modes =
    profile.preferredWorkModes.length > 0
      ? profile.preferredWorkModes
      : profile.preferredWorkArrangements;
  return modes.map((arrangement) =>
    arrangement === "unclear" ? "unknown" as const : arrangement,
  );
}

function recordedWorkAuthorizationCountries(profile: CandidateProfile) {
  if (
    profile.workAuthorization === "citizen_or_permanent_resident" ||
    profile.workAuthorization === "work_authorized"
  ) {
    return ["United States"];
  }
  if (profile.workAuthorization === "not_authorized") return [];
  return null;
}

function recordedRelocationPreference(value: string | null) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (
    /\b(?:not willing|unwilling|do not relocate|don't relocate|cannot relocate|can't relocate|no relocation)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }
  if (/\b(?:willing|open) to relocat|\bconsider(?:ing)? relocation\b/i.test(normalized)) {
    return true;
  }
  return null;
}

export function toCandidateFitProfile(
  profile: CandidateProfile,
  skillEvidence: readonly StoredCandidateSkillEvidence[] = [],
  roleTargets: readonly CandidateRoleTarget[] = [],
): CandidateFitProfile {
  const workModes = preferredWorkModes(profile);
  const constrainedEmploymentTypes =
    profile.acceptedEmploymentTypes.length > 0 &&
    profile.acceptedEmploymentTypes.length < ALL_PROFILE_EMPLOYMENT_TYPES.length
      ? profile.acceptedEmploymentTypes
      : null;
  return {
    targetRoleFamilies: profile.targetRoleFamilies,
    roleTargets:
      roleTargets.length > 0
        ? roleTargets.map(candidateRoleTarget)
        : null,
    skills: mergedCandidateSkills(profile, skillEvidence),
    relevantProfessionalExperienceYears: profile.yearsExperience,
    // Let the scorer derive career stage from recorded professional tenure.
    // Hard-coding every profile to entry made experienced guest profiles look
    // artificially junior and made the stored years field less meaningful.
    careerStage: null,
    currentSalaryAnnualCents: profile.currentSalaryCents,
    preferredSalaryMinimumAnnualCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetAnnualCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: workModes,
    preferredIndustries: profile.preferredIndustries,
    location: parseCandidateLocation(profile.location),
    relocationPreference: recordedRelocationPreference(
      profile.relocationPreference,
    ),
    careerGoals: profile.careerGoals,
    workAuthorizationCountries: recordedWorkAuthorizationCountries(profile),
    requiresSponsorship: profile.requiresSponsorship,
    citizenships: null,
    securityClearances: null,
    licenses: null,
    dealBreakers: {
      minimumAnnualSalaryCents:
        profile.preferredSalaryMinimumCents > 0
          ? profile.preferredSalaryMinimumCents
          : null,
      maximumTravelPercent: /excessive travel/i.test(profile.dealBreakers.join(" "))
        ? (profile.maxTravelPercent ?? 25)
        : profile.maxTravelPercent,
      allowedEmploymentTypes: constrainedEmploymentTypes,
      allowedWorkArrangements: profile.strictWorkModes ? workModes : null,
      excludedIndustries:
        profile.excludedIndustries.length > 0
          ? profile.excludedIndustries
          : null,
    },
  };
}

function mapProjectStatus(status: string): PortfolioEvidence["status"] {
  if (status === "published") return "published";
  if (status === "shipped") return "shipped";
  if (status === "idea") return "idea";
  return "prototype";
}

export function toPortfolioEvidence(
  projects: readonly PortfolioProject[],
): PortfolioEvidence[] {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    technologies: project.technologies,
    roleFamilies: project.relevantRoleFamilies,
    industries: /hospital|healthcare/i.test(`${project.name} ${project.businessProblem}`)
      ? ["Healthcare technology"]
      : /ai/i.test(`${project.description} ${project.technologies.join(" ")}`)
        ? ["Artificial intelligence", "Software"]
        : ["Software"],
    responsibilities: project.responsibilities,
    status: mapProjectStatus(project.status),
  }));
}

function candidateSnapshot(
  profile: CandidateProfile,
  skillEvidence: readonly StoredCandidateSkillEvidence[],
  roleTargets: readonly CandidateRoleTarget[],
): JsonObject {
  return {
    id: profile.id,
    revision: profile.revision,
    fingerprint: profile.fingerprint,
    currentRole: profile.currentRole,
    currentSalaryCents: profile.currentSalaryCents,
    preferredSalaryMinimumCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: profile.preferredWorkArrangements,
    preferredIndustries: profile.preferredIndustries,
    targetRoleFamilies: profile.targetRoleFamilies,
    roleTargets: roleTargets.map((target) => ({
      aliases: target.aliases,
      allowedSeniorityLevels: target.allowedSeniorityLevels,
      canonicalFamily: target.canonicalFamily,
      exclusions: target.exclusions,
      label: target.label,
      maximumRequiredExperienceYears: target.maximumRequiredExperienceYears,
      minimumRequiredExperienceYears: target.minimumRequiredExperienceYears,
      priorityRank: target.priorityRank,
      readiness: target.readiness,
    })),
    skills: profile.skills,
    strengths: profile.strengths,
    weaknesses: profile.weaknesses,
    interests: profile.interests,
    yearsExperience: profile.yearsExperience,
    location: profile.location,
    relocationPreference: profile.relocationPreference,
    careerGoals: profile.careerGoals,
    interviewConcerns: profile.interviewConcerns,
    dealBreakers: profile.dealBreakers,
    desiredSeniorityLevels: profile.desiredSeniorityLevels,
    excludedTitles: profile.excludedTitles,
    excludedCompanies: profile.excludedCompanies,
    excludedIndustries: profile.excludedIndustries,
    acceptedEmploymentTypes: profile.acceptedEmploymentTypes,
    preferredWorkModes: profile.preferredWorkModes,
    strictWorkModes: profile.strictWorkModes,
    commuteRadiusMiles: profile.commuteRadiusMiles,
    maxOfficeDaysPerWeek: profile.maxOfficeDaysPerWeek,
    relocationDestinations: profile.relocationDestinations,
    maxTravelPercent: profile.maxTravelPercent,
    workAuthorization: profile.workAuthorization,
    requiresSponsorship: profile.requiresSponsorship,
    missingSalaryPolicy: profile.missingSalaryPolicy,
    evidenceFingerprint: profile.evidenceFingerprint,
    skillEvidence: skillEvidence.map((record) => ({
      evidenceNote: record.evidenceNote,
      evidenceType: record.evidenceType,
      lastUsedYear: record.lastUsedYear,
      name: record.name,
      proficiency: record.proficiency,
      yearsExperience: record.yearsExperience,
    })),
  };
}

function resultAsJson(result: DeterministicFitResult): JsonObject {
  return JSON.parse(JSON.stringify(result)) as JsonObject;
}

function breakdownForStorage(result: DeterministicFitResult): ScoreComponent[] {
  return result.components.map((component) => ({
    key: component.key,
    weightBps: component.weight * 100,
    rawScore: component.rawScore,
    coverage: component.coverage,
    status:
      component.coverage === 0 ? "unknown" : component.coverage < 1 ? "partial" : "known",
    contribution: component.weightedContribution,
    evidence: component.evidence.map((item) => item.message),
    rationale: component.rationale,
  }));
}

export function buildFitScoreRun(input: {
  contentHash: string;
  job: ParsedJobListing;
  jobRevisionId?: string;
  profile: CandidateProfile;
  projects: readonly PortfolioProject[];
  roleTargets?: readonly CandidateRoleTarget[];
  skillEvidence?: readonly StoredCandidateSkillEvidence[];
}) {
  // No attached project records means evidence has not been supplied, not
  // that the candidate has proven they have no relevant project. Keep that
  // component neutral until at least one portfolio record exists.
  const portfolioEvidence =
    input.projects.length > 0 ? toPortfolioEvidence(input.projects) : null;
  const skillEvidence = input.skillEvidence ?? [];
  const roleTargets = input.roleTargets ?? [];
  const fitResult = scoreJob({
    job: input.job,
    candidate: toCandidateFitProfile(input.profile, skillEvidence, roleTargets),
    portfolioProjects: portfolioEvidence,
  });
  const inputHash = hashValue({
    contentHash: input.contentHash,
    jobRevisionId: input.jobRevisionId ?? null,
    parsedJob: input.job,
    candidateRevision: input.profile.revision,
    candidateFingerprint: input.profile.fingerprint,
    projects: portfolioEvidence,
    skillEvidence: skillEvidence.map((record) => ({
      evidenceType: record.evidenceType,
      name: record.name,
      proficiency: record.proficiency,
      yearsExperience: record.yearsExperience,
    })),
    roleTargets: roleTargets.map((target) => candidateRoleTarget(target)),
    scoringVersion: FIT_SCORING_VERSION,
  });

  return {
    fitResult,
    values: {
      candidateProfileId: input.profile.id,
      inputHash,
      scoringVersion: FIT_SCORING_VERSION,
      candidateSnapshot: candidateSnapshot(input.profile, skillEvidence, roleTargets),
      portfolioSnapshot: input.projects.map(
        (project) => JSON.parse(JSON.stringify(project)) as JsonObject,
      ),
      deterministicScore: fitResult.deterministicFitScore,
      coverageBps: Math.round(fitResult.scoreCoverage * 10_000),
      breakdown: breakdownForStorage(fitResult),
      result: resultAsJson(fitResult),
    },
  };
}
