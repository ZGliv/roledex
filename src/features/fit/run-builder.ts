import type {
  CandidateProfile,
  JsonObject,
  PortfolioProject,
  ScoreComponent,
} from "@/db/schema";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { scoreJob } from "@/features/fit/score-job";
import type {
  CandidateFitProfile,
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

function candidateSkillEvidence(skill: string): CandidateSkill["evidence"] {
  return /technical support|active directory|windows imaging/i.test(skill)
    ? "professional"
    : "self_assessed";
}

export function toCandidateFitProfile(profile: CandidateProfile): CandidateFitProfile {
  return {
    targetRoleFamilies: profile.targetRoleFamilies,
    skills: profile.skills.map((name) => ({ name, evidence: candidateSkillEvidence(name) })),
    relevantProfessionalExperienceYears: profile.yearsExperience,
    careerStage: "entry",
    currentSalaryAnnualCents: profile.currentSalaryCents,
    preferredSalaryMinimumAnnualCents: profile.preferredSalaryMinimumCents,
    preferredSalaryTargetAnnualCents: profile.preferredSalaryTargetCents,
    preferredWorkArrangements: profile.preferredWorkArrangements.map((arrangement) =>
      arrangement === "unclear" ? "unknown" : arrangement,
    ),
    preferredIndustries: profile.preferredIndustries,
    location: parseCandidateLocation(profile.location),
    relocationPreference: /willing|open to relocat/i.test(
      profile.relocationPreference ?? "",
    ),
    careerGoals: profile.careerGoals,
    workAuthorizationCountries: null,
    citizenships: null,
    securityClearances: null,
    licenses: null,
    dealBreakers: {
      minimumAnnualSalaryCents: null,
      maximumTravelPercent: /excessive travel/i.test(profile.dealBreakers.join(" "))
        ? 25
        : null,
      allowedEmploymentTypes: null,
      allowedWorkArrangements: null,
      excludedIndustries: null,
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

function candidateSnapshot(profile: CandidateProfile): JsonObject {
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
}) {
  const portfolioEvidence = toPortfolioEvidence(input.projects);
  const fitResult = scoreJob({
    job: input.job,
    candidate: toCandidateFitProfile(input.profile),
    portfolioProjects: portfolioEvidence,
  });
  const inputHash = hashValue({
    contentHash: input.contentHash,
    jobRevisionId: input.jobRevisionId ?? null,
    parsedJob: input.job,
    candidateRevision: input.profile.revision,
    candidateFingerprint: input.profile.fingerprint,
    projects: portfolioEvidence,
    scoringVersion: FIT_SCORING_VERSION,
  });

  return {
    fitResult,
    values: {
      candidateProfileId: input.profile.id,
      inputHash,
      scoringVersion: FIT_SCORING_VERSION,
      candidateSnapshot: candidateSnapshot(input.profile),
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
