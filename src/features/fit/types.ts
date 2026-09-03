import type {
  EmploymentType,
  ParsedJobListing,
  SeniorityLevel,
  WorkArrangement,
} from "@/features/jobs/types";

export type FitComponentKey =
  | "roleFamily"
  | "skills"
  | "experience"
  | "compensation"
  | "workArrangement"
  | "portfolio"
  | "careerValue"
  | "industry";

export type CandidateSkillEvidence =
  | "professional"
  | "portfolio"
  | "coursework"
  | "self_assessed";

export interface CandidateSkill {
  name: string;
  evidence: CandidateSkillEvidence;
}

export type CandidateRoleTargetReadiness = "ready_now" | "stretch";

export type CandidateRoleTargetSeniority =
  | "intern"
  | "entry"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "manager"
  | "director"
  | "executive";

/**
 * The role-specific portion of the candidate's search contract. Keeping this
 * transport type independent from the database makes the deterministic scorer
 * usable in tests and future clients without importing persistence details.
 */
export interface CandidateRoleTargetPreference {
  canonicalFamily: string;
  label: string;
  aliases: string[];
  priorityRank: number;
  readiness: CandidateRoleTargetReadiness;
  allowedSeniorityLevels: CandidateRoleTargetSeniority[];
  minimumRequiredExperienceYears: number | null;
  maximumRequiredExperienceYears: number | null;
  exclusions: string[];
}

export interface RoleTargetMatch {
  canonicalFamily: string;
  label: string;
  priorityRank: number;
  readiness: CandidateRoleTargetReadiness;
  allowedSeniorityLevels: CandidateRoleTargetSeniority[];
  minimumRequiredExperienceYears: number | null;
  maximumRequiredExperienceYears: number | null;
  exclusions: string[];
  matchQuality: "direct" | "adjacent";
  matchedOn: string;
}

export interface CandidateLocation {
  city?: string | null;
  region?: string | null;
  country?: string | null;
  timezone?: string | null;
}

export interface CandidateDealBreakers {
  minimumAnnualSalaryCents?: number | null;
  maximumTravelPercent?: number | null;
  allowedEmploymentTypes?: EmploymentType[] | null;
  allowedWorkArrangements?: WorkArrangement[] | null;
  excludedIndustries?: string[] | null;
}

export interface CandidateFitProfile {
  targetRoleFamilies: string[] | null;
  /** Structured targets supersede the legacy label list when supplied. */
  roleTargets?: CandidateRoleTargetPreference[] | null;
  /** Null means the skill inventory is incomplete/unknown; [] means known empty. */
  skills: CandidateSkill[] | null;
  /** Relevant paid/professional tenure only. Portfolio time must never be added. */
  relevantProfessionalExperienceYears: number | null;
  careerStage?: SeniorityLevel | null;
  currentSalaryAnnualCents: number | null;
  preferredSalaryMinimumAnnualCents: number | null;
  preferredSalaryTargetAnnualCents: number | null;
  preferredWorkArrangements: WorkArrangement[] | null;
  preferredIndustries: string[] | null;
  location: CandidateLocation | null;
  relocationPreference: boolean | null;
  careerGoals?: string[] | null;
  workAuthorizationCountries?: string[] | null;
  /** Whether the candidate needs current or future employer sponsorship. */
  requiresSponsorship?: boolean | null;
  citizenships?: string[] | null;
  securityClearances?: string[] | null;
  licenses?: string[] | null;
  dealBreakers?: CandidateDealBreakers | null;
}

export interface PortfolioEvidence {
  id: string;
  name: string;
  technologies: string[];
  roleFamilies: string[];
  industries: string[];
  responsibilities: string[];
  status?: "idea" | "prototype" | "shipped" | "published" | null;
}

export type FitEvidenceKind = "match" | "gap" | "unknown" | "risk" | "blocker";

export interface FitEvidence {
  kind: FitEvidenceKind;
  message: string;
  source: "candidate" | "listing" | "portfolio" | "derived";
  excerpt?: string;
}

export interface FitComponentBreakdown {
  key: FitComponentKey;
  label: string;
  weight: number;
  /** The evidence-based 0–100 judgment before neutral shrinkage. */
  rawScore: number | null;
  /** 0–1 estimate of how much of this component is actually known. */
  coverage: number;
  /** coverage × raw score + unknown share × neutral 50. */
  effectiveScore: number;
  weightedContribution: number;
  rationale: string;
  evidence: FitEvidence[];
}

export type EligibilityStatus = "eligible" | "ineligible" | "unresolved";

export interface EligibilityResult {
  status: EligibilityStatus;
  reasons: FitEvidence[];
}

export type AssessmentState = "scored" | "insufficient_data";

export type Readiness =
  | "ready_now"
  | "ready_with_positioning"
  | "ready_after_skill_sprint"
  | "not_yet_efficient";

export type FitVerdict =
  | "strong_apply"
  | "apply"
  | "apply_as_stretch"
  | "save_for_later"
  | "learn_first"
  | "skip";

export interface DeterministicFitResult {
  scoringVersion: string;
  deterministicFitScore: number;
  fitScoreOutOfTen: number;
  scoreCoverage: number;
  assessmentState: AssessmentState;
  eligibility: EligibilityResult;
  components: FitComponentBreakdown[];
  /** The best structured role direction supporting the role-family score. */
  roleTargetMatch?: RoleTargetMatch | null;
  strongestMatches: FitEvidence[];
  qualificationGaps: FitEvidence[];
  /** Always contains at least one candid risk or uncertainty. */
  reasonsNotToApply: string[];
  reasonsToApply: string[];
  stretchScore: number;
  readiness: Readiness | null;
  verdict: FitVerdict;
  verdictExplanation: string;
}

export interface ScoreJobInput {
  job: ParsedJobListing;
  candidate: CandidateFitProfile;
  /** Null means portfolio evidence has not been entered; [] means known empty. */
  portfolioProjects: PortfolioEvidence[] | null;
}
