import type {
  CandidateProfile,
  CandidateSeniorityLevel,
  EmploymentType,
  JobRevision,
  WorkArrangement,
} from "@/db/schema";
import type {
  EligibilityResult,
  FitComponentBreakdown,
  FitVerdict,
} from "@/features/fit/types";

export const FEED_ADMISSION_LANES = ["primary", "explore", "blocked"] as const;

export type FeedAdmissionLane = (typeof FEED_ADMISSION_LANES)[number];

export const FEED_ADMISSION_REASON_CODES = [
  "eligibility_ineligible",
  "authorization_incompatible",
  "verdict_skip",
  "title_excluded",
  "company_excluded",
  "industry_excluded",
  "seniority_above_scope",
  "seniority_outside_targets",
  "required_experience_gap_too_large",
  "required_experience_gap_outside_explore",
  "salary_below_floor",
  "salary_missing_hidden",
  "salary_missing_explore",
  "salary_estimate_below_floor",
  "work_arrangement_incompatible",
  "employment_type_incompatible",
  "travel_limit_exceeded",
  "geography_incompatible",
  "target_roles_missing",
  "role_target_excluded",
  "role_target_experience_outside_scope",
  "role_target_seniority_outside_scope",
  "role_target_stretch",
  "role_outside_targets",
  "role_match_unresolved",
  "role_direct_match",
  "role_adjacent_match",
  "experience_aligned",
  "experience_stretch",
  "seniority_stretch",
  "experience_unresolved",
  "salary_clears_floor",
  "salary_straddles_floor",
  "salary_unresolved",
  "work_arrangement_unresolved",
  "geography_unresolved",
  "eligibility_unresolved",
  "fit_requires_review",
] as const;

export type FeedAdmissionReasonCode =
  (typeof FEED_ADMISSION_REASON_CODES)[number];

export type FeedAdmissionReasonKind =
  | "blocker"
  | "stretch"
  | "match"
  | "unresolved";

export type FeedAdmissionReasonSource =
  | "profile"
  | "revision"
  | "fit"
  | "derived";

export interface FeedAdmissionReason {
  code: FeedAdmissionReasonCode;
  kind: FeedAdmissionReasonKind;
  message: string;
  source: FeedAdmissionReasonSource;
}

export interface FeedAdmissionDecision {
  lane: FeedAdmissionLane;
  reasonCodes: readonly FeedAdmissionReasonCode[];
  reasons: readonly FeedAdmissionReason[];
}

export const NEAR_MATCH_FALLBACK_REASON_CODES = [
  "role_outside_targets",
  "role_match_unresolved",
] as const satisfies readonly FeedAdmissionReasonCode[];

export type NearMatchFallbackReasonCode =
  (typeof NEAR_MATCH_FALLBACK_REASON_CODES)[number];

export interface NearMatchFallbackDecision {
  eligible: boolean;
  explanation: string | null;
  reasonCode: NearMatchFallbackReasonCode | null;
}

export type FeedAdmissionProfile = Pick<
  CandidateProfile,
  | "targetRoleFamilies"
  | "yearsExperience"
  | "preferredSalaryMinimumCents"
  | "preferredWorkArrangements"
  | "location"
  | "relocationPreference"
> &
  Partial<
    Pick<
      CandidateProfile,
      | "desiredSeniorityLevels"
      | "excludedTitles"
      | "excludedCompanies"
      | "excludedIndustries"
      | "acceptedEmploymentTypes"
      | "preferredWorkModes"
      | "strictWorkModes"
      | "commuteRadiusMiles"
      | "maxOfficeDaysPerWeek"
      | "relocationDestinations"
      | "missingSalaryPolicy"
    >
  >;

export type FeedAdmissionRevision = Pick<
  JobRevision,
  | "title"
  | "location"
  | "workArrangement"
  | "remoteRestriction"
  | "salaryMinimumCents"
  | "salaryMaximumCents"
  | "salaryCurrency"
  | "salaryPeriod"
  | "salarySource"
  | "seniority"
  | "yearsExperienceMinimum"
  | "experienceRequirements"
> &
  Partial<
    Pick<
      JobRevision,
      | "company"
      | "employmentType"
      | "industry"
      | "cleanedDescription"
      | "responsibilities"
      | "requiredQualifications"
    >
  >;

export interface FeedAdmissionFit {
  eligibility: Pick<EligibilityResult, "status" | "reasons">;
  verdict: FitVerdict;
  components: readonly Pick<
    FitComponentBreakdown,
    "key" | "rawScore" | "coverage"
  >[];
  /** Overall evidence-backed fit score, used only to bound Near Match fallback. */
  deterministicFitScore?: number;
  /** Structured target selected by the deterministic role-family scorer. */
  roleTargetMatch?: {
    label: string;
    readiness: "ready_now" | "stretch";
    priorityRank: number;
    matchQuality?: "direct" | "adjacent";
    allowedSeniorityLevels: readonly CandidateSeniorityLevel[];
    minimumRequiredExperienceYears: number | null;
    maximumRequiredExperienceYears: number | null;
    exclusions: readonly string[];
  } | null;
}

export interface FeedAdmissionInput {
  profile: FeedAdmissionProfile;
  revision: FeedAdmissionRevision;
  fit: FeedAdmissionFit;
  salaryPresentation?: {
    annualMinimumCents: number;
    annualMaximumCents: number;
    confidence: "high" | "medium" | "low";
    isEstimate: boolean;
  };
}

type KnownSeniority =
  | "intern"
  | "entry"
  | "mid"
  | "senior"
  | "staff"
  | "leadership";

const SENIORITY_RANK: Readonly<Record<KnownSeniority, number>> = {
  intern: 0,
  entry: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  leadership: 5,
};

const PRIMARY_VERDICTS = new Set<FitVerdict>(["strong_apply", "apply"]);
const EXPLORE_UNRESOLVED_CODES = new Set<FeedAdmissionReasonCode>([
  "eligibility_unresolved",
  "geography_unresolved",
  "work_arrangement_unresolved",
]);
const NEAR_MATCH_SOFT_BLOCKERS = new Set<FeedAdmissionReasonCode>(
  NEAR_MATCH_FALLBACK_REASON_CODES,
);
const NEAR_MATCH_COMPOUND_UNCERTAINTY = new Set<FeedAdmissionReasonCode>([
  "eligibility_unresolved",
  "geography_unresolved",
  "work_arrangement_unresolved",
  "salary_estimate_below_floor",
]);
const NEAR_MATCH_VERDICTS = new Set<FitVerdict>([
  "strong_apply",
  "apply",
  "apply_as_stretch",
]);
const NEAR_MATCH_MINIMUM_FIT_SCORE = 60;
const NEAR_MATCH_UNMAPPED_MINIMUM_FIT_SCORE = 70;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function normalize(value: string | null) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedList(values: readonly string[] | undefined) {
  return (values ?? []).map(normalize).filter(Boolean);
}

function containsNormalizedPhrase(value: string | null, phrase: string) {
  const normalizedValue = normalize(value);
  const normalizedPhrase = normalize(phrase);
  return Boolean(
    normalizedValue &&
      normalizedPhrase &&
      ` ${normalizedValue} `.includes(` ${normalizedPhrase} `),
  );
}

function explicitlyExcludedTitle(
  revision: FeedAdmissionRevision,
  profile: FeedAdmissionProfile,
) {
  return (profile.excludedTitles ?? []).some((title) =>
    containsNormalizedPhrase(revision.title, title),
  );
}

function explicitlyExcludedCompany(
  revision: FeedAdmissionRevision,
  profile: FeedAdmissionProfile,
) {
  const company = normalize(revision.company ?? null);
  return Boolean(
    company && normalizedList(profile.excludedCompanies).includes(company),
  );
}

function explicitlyExcludedIndustry(
  revision: FeedAdmissionRevision,
  profile: FeedAdmissionProfile,
) {
  return (profile.excludedIndustries ?? []).some((industry) =>
    containsNormalizedPhrase(revision.industry ?? null, industry),
  );
}

const CONFIGURED_SENIORITY_RANK: Readonly<
  Record<CandidateSeniorityLevel, number>
> = {
  intern: 0,
  entry: 1,
  mid: 2,
  senior: 3,
  staff: 4,
  principal: 5,
  manager: 5,
  director: 6,
  executive: 7,
};

function structuredSeniority(
  value: string | null,
): CandidateSeniorityLevel | null {
  const normalized = normalize(value);
  if (normalized === "leadership") return "executive";
  if (
    normalized === "intern" ||
    normalized === "entry" ||
    normalized === "mid" ||
    normalized === "senior" ||
    normalized === "staff" ||
    normalized === "principal" ||
    normalized === "manager" ||
    normalized === "director" ||
    normalized === "executive"
  ) {
    return normalized;
  }
  return null;
}

function hasPeopleManagerEvidence(revision: FeedAdmissionRevision) {
  const title = normalize(revision.title);
  const strongManagerTitle =
    /\b(?:engineering|software development|sales|support|service|store|branch|regional|district|people|team|recruiting|human resources) manager\b/.test(
      title,
    ) ||
    /\bmanager\s+(?:of\s+)?(?:engineering|software|sales|support|operations|people|team|recruiting|human resources)\b/.test(
      title,
    );
  if (strongManagerTitle) return true;

  const evidence = normalize(
    [
      revision.cleanedDescription ?? "",
      ...(revision.responsibilities ?? []),
      ...(revision.requiredQualifications ?? []),
    ].join(" "),
  );
  const directPeopleEvidence =
    /\b(?:people manager|people management|direct reports?|performance reviews?)\b/.test(
      evidence,
    );
  if (directPeopleEvidence) return true;

  // Project and product ICs often "lead a team" without managing people.
  // Require a manager title before treating broader team-management language
  // as seniority evidence.
  return (
    /\bmanager\b/.test(title) &&
    /\b(?:manage|managing|supervise|supervising|coach|coaching)\s+(?:a|an|the|our|[0-9]+)?\s*(?:team|people|employees|direct reports?)\b/.test(
      evidence,
    )
  );
}

function inferredTitleSeniority(
  revision: FeedAdmissionRevision,
): CandidateSeniorityLevel | null {
  const title = normalize(revision.title);
  if (!title) return null;
  if (/\b(?:chief|executive|head|vice president|vp)\b/.test(title)) {
    return "executive";
  }
  if (/\bdirector\b/.test(title)) return "director";
  if (/\bprincipal\b/.test(title)) return "principal";
  if (/\bstaff\b/.test(title)) return "staff";
  if (/\b(?:senior|sr|lead)\b/.test(title)) return "senior";
  if (hasPeopleManagerEvidence(revision)) return "manager";
  if (/\b(?:mid|intermediate)\b/.test(title)) return "mid";
  if (/\b(?:entry|junior|jr|associate)\b/.test(title)) return "entry";
  if (/\b(?:intern|internship)\b/.test(title)) return "intern";
  return null;
}

function explicitConfiguredSeniority(
  revision: FeedAdmissionRevision,
): CandidateSeniorityLevel | null {
  const structured = structuredSeniority(revision.seniority);
  const inferred = inferredTitleSeniority(revision);
  if (!structured) return inferred;
  if (!inferred) return structured;
  return CONFIGURED_SENIORITY_RANK[inferred] >
    CONFIGURED_SENIORITY_RANK[structured]
    ? inferred
    : structured;
}

function hasAmbiguousManagerTitle(revision: FeedAdmissionRevision) {
  return (
    /\bmanager\b/.test(normalize(revision.title)) &&
    structuredSeniority(revision.seniority) === null &&
    inferredTitleSeniority(revision) === null
  );
}

function legacySeniority(
  seniority: CandidateSeniorityLevel | null,
): KnownSeniority | null {
  if (!seniority) return null;
  if (seniority === "principal" || seniority === "staff") return "staff";
  if (
    seniority === "manager" ||
    seniority === "director" ||
    seniority === "executive"
  ) {
    return "leadership";
  }
  return seniority;
}

function explicitJobSeniority(revision: FeedAdmissionRevision) {
  return legacySeniority(explicitConfiguredSeniority(revision));
}

function candidateSeniority(yearsExperience: number): KnownSeniority {
  if (yearsExperience < 2) return "entry";
  if (yearsExperience < 5) return "mid";
  if (yearsExperience < 8) return "senior";
  return "staff";
}

function inferredRequiredYears(requirements: readonly string[]) {
  const values = requirements.flatMap((requirement) => {
    if (/\(preferred\)\s*$/i.test(requirement.trim())) return [];
    const matches = requirement.matchAll(
      /\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*years?\b/gi,
    );
    return [...matches]
      .map((match) => Number(match[1]))
      .filter(Number.isFinite);
  });
  return values.length > 0 ? Math.max(...values) : null;
}

function eligibilityMessages(fit: FeedAdmissionFit) {
  return fit.eligibility.reasons
    .map((reason) => reason.message.trim())
    .filter(Boolean)
    .join(" ");
}

function mentionsGeography(value: string) {
  return /\b(?:geograph|location|office|region|timezone|relocat)\b/i.test(value);
}

function mentionsWorkArrangement(value: string) {
  return /\bwork[- ]arrangement\b/i.test(value);
}

function mentionsAuthorization(value: string) {
  return /\b(?:work authorization|citizenship|visa|sponsor(?:ship|ed|ing)?)\b/i.test(
    value,
  );
}

function mentionsTravel(value: string) {
  return /\btravel\b/i.test(value);
}

function configuredWorkArrangements(profile: FeedAdmissionProfile) {
  const configured =
    profile.preferredWorkModes && profile.preferredWorkModes.length > 0
      ? profile.preferredWorkModes
      : profile.preferredWorkArrangements;
  return configured.filter(
    (arrangement): arrangement is Exclude<WorkArrangement, "unclear"> =>
      arrangement !== "unclear",
  );
}

function knownEmploymentType(
  value: string | null | undefined,
): EmploymentType | "seasonal" | null {
  const normalized = normalize(value ?? null).replaceAll(" ", "_");
  if (
    normalized === "full_time" ||
    normalized === "part_time" ||
    normalized === "contract" ||
    normalized === "temporary" ||
    normalized === "internship" ||
    normalized === "seasonal"
  ) {
    return normalized;
  }
  return null;
}

function isKnownArrangement(
  arrangement: WorkArrangement,
): arrangement is Exclude<WorkArrangement, "unclear"> {
  return arrangement !== "unclear";
}

function isUsd(currency: string) {
  return normalize(currency) === "usd";
}

function locationCity(value: string | null | undefined) {
  const [city = ""] = (value ?? "").split(",");
  const normalized = normalize(city);
  if (!normalized || normalized === "remote" || normalized === "united states") {
    return null;
  }
  return normalized;
}

function isSingleKnownOfficeLocation(value: string | null | undefined) {
  const normalized = normalize(value ?? null);
  return Boolean(
    normalized &&
      !/\bremote\b/i.test(value ?? "") &&
      !/\b(?:multiple locations|various locations|locations vary)\b/i.test(
        value ?? "",
      ) &&
      !/(?:\bor\b|\/|;|\|)/i.test(value ?? ""),
  );
}

function locationMatches(
  jobLocation: string | null | undefined,
  preference: string | null | undefined,
) {
  const job = normalize(jobLocation ?? null);
  const preferred = normalize(preference ?? null);
  const preferredCity = locationCity(preference);
  return Boolean(
    job &&
      preferred &&
      (job.includes(preferred) ||
        preferred.includes(job) ||
        (preferredCity && ` ${job} `.includes(` ${preferredCity} `))),
  );
}

function explicitOfficeDaysPerWeek(revision: FeedAdmissionRevision) {
  const text = [
    revision.cleanedDescription ?? "",
    ...(revision.responsibilities ?? []),
    ...(revision.requiredQualifications ?? []),
  ].join(" ");
  const patterns = [
    /\b(?:in[- ]office|in[- ]person|on[- ]site|onsite)\D{0,30}([0-5])\s*(?:days?|x)\s*(?:per|a|each)?\s*week\b/i,
    /\b([0-5])\s*(?:days?|x)\s*(?:per|a|each)?\s*week\D{0,30}(?:in[- ]office|in[- ]person|on[- ]site|onsite)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

/**
 * Separates qualification from preference ranking. This policy is pure and
 * intentionally only acts on persisted facts. Unknown experience or pay is
 * disclosed on the card but does not bury an otherwise direct, eligible role;
 * unresolved eligibility, geography, or work mode still belongs in Explore.
 */
export function classifyFeedAdmission(
  input: FeedAdmissionInput,
): FeedAdmissionDecision {
  const { fit, profile, revision, salaryPresentation } = input;
  const reasons = new Map<FeedAdmissionReasonCode, FeedAdmissionReason>();
  let hasStretch = false;
  let hasCriticalUnresolved = false;

  const addReason = (
    code: FeedAdmissionReasonCode,
    kind: FeedAdmissionReasonKind,
    message: string,
    source: FeedAdmissionReasonSource,
  ) => {
    if (!reasons.has(code)) reasons.set(code, { code, kind, message, source });
    if (kind === "stretch") hasStretch = true;
    if (kind === "unresolved" && EXPLORE_UNRESOLVED_CODES.has(code)) {
      hasCriticalUnresolved = true;
    }
  };

  const eligibilityText = eligibilityMessages(fit);
  if (fit.eligibility.status === "ineligible") {
    addReason(
      "eligibility_ineligible",
      "blocker",
      fit.eligibility.reasons[0]?.message ||
        "The deterministic fit result contains a confirmed eligibility conflict.",
      "fit",
    );
    if (mentionsGeography(eligibilityText)) {
      addReason(
        "geography_incompatible",
        "blocker",
        "The listing's known geographic requirement conflicts with the profile.",
        "fit",
      );
    }
    if (mentionsWorkArrangement(eligibilityText)) {
      addReason(
        "work_arrangement_incompatible",
        "blocker",
        "The listing's known work arrangement violates a configured constraint.",
        "fit",
      );
    }
    if (mentionsAuthorization(eligibilityText)) {
      addReason(
        "authorization_incompatible",
        "blocker",
        "A known work-authorization or sponsorship requirement conflicts with the profile.",
        "fit",
      );
    }
    if (mentionsTravel(eligibilityText)) {
      addReason(
        "travel_limit_exceeded",
        "blocker",
        "The listing's explicit travel requirement exceeds the profile limit.",
        "fit",
      );
    }
  } else if (fit.eligibility.status === "unresolved") {
    addReason(
      "eligibility_unresolved",
      "unresolved",
      fit.eligibility.reasons[0]?.message ||
        "A required eligibility fact still needs confirmation.",
      "fit",
    );
    if (mentionsGeography(eligibilityText)) {
      addReason(
        "geography_unresolved",
        "unresolved",
        "Geographic feasibility still needs confirmation.",
        "fit",
      );
    }
  }

  if (explicitlyExcludedTitle(revision, profile)) {
    addReason(
      "title_excluded",
      "blocker",
      `${revision.title} matches an explicitly excluded title phrase.`,
      "profile",
    );
  }
  if (explicitlyExcludedCompany(revision, profile)) {
    addReason(
      "company_excluded",
      "blocker",
      `${revision.company ?? "This company"} is explicitly excluded by the profile.`,
      "profile",
    );
  }
  if (explicitlyExcludedIndustry(revision, profile)) {
    addReason(
      "industry_excluded",
      "blocker",
      `${revision.industry ?? "This industry"} is explicitly excluded by the profile.`,
      "profile",
    );
  }

  const matchedRoleTarget = fit.roleTargetMatch ?? null;
  const targetExclusionText = [
    revision.title,
    revision.cleanedDescription ?? "",
    ...(revision.responsibilities ?? []),
    ...(revision.requiredQualifications ?? []),
  ].join(" ");
  const matchedRoleExclusion = matchedRoleTarget?.exclusions.find((phrase) =>
    containsNormalizedPhrase(targetExclusionText, phrase),
  );
  if (matchedRoleExclusion) {
    addReason(
      "role_target_excluded",
      "blocker",
      `${revision.title} matches the ${matchedRoleTarget?.label ?? "selected role"} exclusion “${matchedRoleExclusion}”.`,
      "profile",
    );
  }
  if (matchedRoleTarget?.readiness === "stretch") {
    addReason(
      "role_target_stretch",
      "stretch",
      `${matchedRoleTarget.label} is intentionally configured as a Stretch direction.`,
      "profile",
    );
  }

  if (fit.verdict === "skip") {
    addReason(
      "verdict_skip",
      "blocker",
      "The current deterministic assessment says to skip this role.",
      "fit",
    );
  }

  const configuredJobSeniority = explicitConfiguredSeniority(revision);
  const jobSeniority = explicitJobSeniority(revision);
  const desiredSeniorities = profile.desiredSeniorityLevels ?? [];
  const ambiguousManagerTitle = hasAmbiguousManagerTitle(revision);
  if (
    configuredJobSeniority &&
    desiredSeniorities.length > 0 &&
    !desiredSeniorities.includes(configuredJobSeniority)
  ) {
    addReason(
      "seniority_outside_targets",
      "blocker",
      `${revision.title} is ${configuredJobSeniority}-level, outside the selected seniority levels.`,
      "profile",
    );
  } else if (
    desiredSeniorities.length === 0 &&
    (jobSeniority === "senior" ||
      jobSeniority === "staff" ||
      jobSeniority === "leadership")
  ) {
    // Preserve the original conservative policy for legacy profiles that have
    // not chosen explicit seniority targets yet.
    addReason(
      "seniority_above_scope",
      "blocker",
      `${revision.title} is explicitly ${jobSeniority}-level, outside the current feed scope.`,
      "revision",
    );
  }
  if (
    matchedRoleTarget &&
    configuredJobSeniority &&
    matchedRoleTarget.allowedSeniorityLevels.length > 0 &&
    !matchedRoleTarget.allowedSeniorityLevels.includes(configuredJobSeniority)
  ) {
    addReason(
      "role_target_seniority_outside_scope",
      "blocker",
      `${revision.title} is ${configuredJobSeniority}-level, outside the allowed seniority for ${matchedRoleTarget.label}.`,
      "profile",
    );
  }

  const candidateYears = Math.max(0, profile.yearsExperience);
  const requiredYears =
    revision.yearsExperienceMinimum ??
    inferredRequiredYears(revision.experienceRequirements);
  const experienceGap =
    requiredYears === null ? null : Math.max(0, requiredYears - candidateYears);
  if (
    matchedRoleTarget &&
    requiredYears !== null &&
    ((matchedRoleTarget.minimumRequiredExperienceYears !== null &&
      requiredYears < matchedRoleTarget.minimumRequiredExperienceYears) ||
      (matchedRoleTarget.maximumRequiredExperienceYears !== null &&
        requiredYears > matchedRoleTarget.maximumRequiredExperienceYears))
  ) {
    const minimum = matchedRoleTarget.minimumRequiredExperienceYears;
    const maximum = matchedRoleTarget.maximumRequiredExperienceYears;
    const allowedRange =
      minimum !== null && maximum !== null
        ? `${minimum}–${maximum} years`
        : minimum !== null
          ? `${minimum}+ years`
          : `up to ${maximum} years`;
    addReason(
      "role_target_experience_outside_scope",
      "blocker",
      `The ${requiredYears}-year requirement is outside the ${allowedRange} configured for ${matchedRoleTarget.label}.`,
      "profile",
    );
  }
  if (experienceGap !== null && experienceGap >= 4) {
    addReason(
      "required_experience_gap_too_large",
      "blocker",
      `The required experience exceeds the profile by ${experienceGap} years.`,
      "derived",
    );
  } else if (experienceGap !== null && experienceGap > 2) {
    addReason(
      "required_experience_gap_outside_explore",
      "blocker",
      `The ${experienceGap}-year required experience gap is larger than the Stretch lane allows.`,
      "derived",
    );
  } else if (experienceGap !== null && experienceGap > 0) {
    addReason(
      "experience_stretch",
      "stretch",
      `The role is a ${experienceGap}-year experience stretch.`,
      "derived",
    );
  }

  const candidateStage = candidateSeniority(candidateYears);
  if (
    ambiguousManagerTitle &&
    !desiredSeniorities.includes("manager")
  ) {
    addReason(
      "seniority_stretch",
      "stretch",
      "The manager title is ambiguous rather than confirmed people leadership, so it belongs in Stretch.",
      "derived",
    );
  }
  if (jobSeniority && SENIORITY_RANK[jobSeniority] > SENIORITY_RANK[candidateStage]) {
    const levelGap = SENIORITY_RANK[jobSeniority] - SENIORITY_RANK[candidateStage];
    if (levelGap === 1 && jobSeniority === "mid") {
      addReason(
        "seniority_stretch",
        "stretch",
        "The role is one seniority level above the profile and belongs in Stretch.",
        "derived",
      );
    }
  }

  if (experienceGap === 0) {
    addReason(
      "experience_aligned",
      "match",
      `The ${requiredYears}-year requirement is within the recorded professional experience.`,
      "derived",
    );
  } else if (requiredYears === null) {
    if (jobSeniority === "intern" || jobSeniority === "entry") {
      addReason(
        "experience_aligned",
        "match",
        "The explicit entry-level seniority is realistic for the profile.",
        "revision",
      );
    } else if (jobSeniority === null) {
      addReason(
        "experience_unresolved",
        "unresolved",
        "The listing does not state usable experience or seniority requirements.",
        "revision",
      );
    }
  }

  const salaryFloor = Math.max(0, profile.preferredSalaryMinimumCents);
  if (salaryFloor > 0) {
    const comparablePostedSalary =
      revision.salarySource === "employer_posted" &&
      revision.salaryPeriod === "year" &&
      isUsd(revision.salaryCurrency);
    const annualizedPostedSalary =
      revision.salarySource === "employer_posted" &&
      isUsd(revision.salaryCurrency) &&
      salaryPresentation?.isEstimate === false;
    const salaryMinimum = comparablePostedSalary
      ? revision.salaryMinimumCents
      : annualizedPostedSalary
        ? salaryPresentation.annualMinimumCents
        : null;
    const salaryMaximum = comparablePostedSalary
      ? revision.salaryMaximumCents
      : annualizedPostedSalary
        ? salaryPresentation.annualMaximumCents
        : null;
    const hasComparablePostedSalary =
      comparablePostedSalary || annualizedPostedSalary;

    if (
      hasComparablePostedSalary &&
      salaryMaximum !== null &&
      salaryMaximum < salaryFloor
    ) {
      addReason(
        "salary_below_floor",
        "blocker",
        `The employer-posted annual range tops out at ${money(salaryMaximum)}, below the ${money(salaryFloor)} profile floor.`,
        "revision",
      );
    } else if (
      hasComparablePostedSalary &&
      salaryMinimum !== null &&
      salaryMinimum >= salaryFloor
    ) {
      addReason(
        "salary_clears_floor",
        "match",
        "The employer-posted annual base range clears the profile floor.",
        "revision",
      );
    } else if (
      hasComparablePostedSalary &&
      salaryMinimum !== null &&
      salaryMaximum !== null &&
      salaryMinimum < salaryFloor &&
      salaryMaximum >= salaryFloor
    ) {
      addReason(
        "salary_straddles_floor",
        "stretch",
        "The employer-posted range straddles the profile salary floor.",
        "revision",
      );
    } else if (
      salaryPresentation?.isEstimate === true &&
      salaryPresentation.confidence !== "low" &&
      salaryPresentation.annualMaximumCents < salaryFloor
    ) {
      addReason(
        "salary_estimate_below_floor",
        "stretch",
        `The current market estimate tops out at ${money(salaryPresentation.annualMaximumCents)}, below the ${money(salaryFloor)} profile floor.`,
        "derived",
      );
    } else {
      addReason(
        "salary_unresolved",
        "unresolved",
        "No comparable employer-posted annual range confirms the profile salary floor.",
        "revision",
      );
    }
  }

  const hasEmployerPostedSalary =
    revision.salarySource === "employer_posted" &&
    (revision.salaryMinimumCents !== null ||
      revision.salaryMaximumCents !== null);
  if (!hasEmployerPostedSalary) {
    const missingSalaryPolicy = profile.missingSalaryPolicy ?? "show";
    if (missingSalaryPolicy === "hide") {
      addReason(
        "salary_missing_hidden",
        "blocker",
        "The profile hides roles without an employer-posted salary range.",
        "profile",
      );
    } else if (missingSalaryPolicy === "explore_only") {
      addReason(
        "salary_missing_explore",
        "stretch",
        "The role has no employer-posted salary range and belongs in Stretch.",
        "profile",
      );
    }
  }

  const preferredArrangements = configuredWorkArrangements(profile);
  if (
    profile.strictWorkModes === true &&
    preferredArrangements.length > 0 &&
    isKnownArrangement(revision.workArrangement) &&
    !preferredArrangements.includes(revision.workArrangement)
  ) {
    addReason(
      "work_arrangement_incompatible",
      "blocker",
      `${revision.workArrangement.replace("_", "-")} is outside the configured work arrangements.`,
      "profile",
    );
  } else if (
    preferredArrangements.length === 0 ||
    !isKnownArrangement(revision.workArrangement)
  ) {
    addReason(
      "work_arrangement_unresolved",
      "unresolved",
      "The work arrangement cannot yet be confirmed against the profile.",
      "derived",
    );
  }

  const maximumOfficeDays = profile.maxOfficeDaysPerWeek ?? null;
  if (
    maximumOfficeDays !== null &&
    (revision.workArrangement === "hybrid" ||
      revision.workArrangement === "on_site")
  ) {
    const statedOfficeDays = explicitOfficeDaysPerWeek(revision);
    if (statedOfficeDays !== null && statedOfficeDays > maximumOfficeDays) {
      addReason(
        "work_arrangement_incompatible",
        "blocker",
        `The listing requires ${statedOfficeDays} office days per week, above the configured maximum of ${maximumOfficeDays}.`,
        "profile",
      );
    } else if (
      statedOfficeDays === null &&
      revision.workArrangement === "on_site" &&
      maximumOfficeDays < 5
    ) {
      addReason(
        "work_arrangement_incompatible",
        "blocker",
        `The role is explicitly on-site, above the configured maximum of ${maximumOfficeDays} office days per week.`,
        "profile",
      );
    } else if (
      statedOfficeDays === null &&
      revision.workArrangement === "hybrid" &&
      maximumOfficeDays < 5
    ) {
      addReason(
        "work_arrangement_unresolved",
        "unresolved",
        `The listing does not state its weekly office requirement, so the ${maximumOfficeDays}-day limit still needs confirmation.`,
        "revision",
      );
    }
  }

  const acceptedEmploymentTypes = profile.acceptedEmploymentTypes ?? [];
  const employmentType = knownEmploymentType(revision.employmentType);
  if (
    acceptedEmploymentTypes.length > 0 &&
    employmentType &&
    !acceptedEmploymentTypes.some((accepted) => accepted === employmentType)
  ) {
    addReason(
      "employment_type_incompatible",
      "blocker",
      `${employmentType.replaceAll("_", "-")} is outside the accepted employment types.`,
      "profile",
    );
  }

  const hasLocationConstraint =
    revision.workArrangement === "hybrid" || revision.workArrangement === "on_site";
  if (
    hasLocationConstraint &&
    (!revision.location?.trim() || !profile.location?.trim())
  ) {
    addReason(
      "geography_unresolved",
      "unresolved",
      "The office location or candidate location is missing, so commute feasibility is unknown.",
      "derived",
    );
  }
  if (
    hasLocationConstraint &&
    revision.location?.trim() &&
    profile.location?.trim()
  ) {
    const matchesHome = locationMatches(revision.location, profile.location);
    const relocationDestinations = profile.relocationDestinations ?? [];
    const matchesRelocationDestination = relocationDestinations.some(
      (destination) => locationMatches(revision.location, destination),
    );
    if (!matchesHome && !matchesRelocationDestination) {
      const hasExplicitRelocationBoundary = relocationDestinations.length > 0;
      const hasCommuteBoundary = profile.commuteRadiusMiles !== null &&
        profile.commuteRadiusMiles !== undefined;
      if (
        isSingleKnownOfficeLocation(revision.location) &&
        (hasExplicitRelocationBoundary || profile.commuteRadiusMiles === 0)
      ) {
        addReason(
          "geography_incompatible",
          "blocker",
          hasExplicitRelocationBoundary
            ? "The known office location is outside both the home area and the configured relocation destinations."
            : "The known office location is outside the configured zero-mile commute boundary.",
          "profile",
        );
      } else if (hasCommuteBoundary) {
        addReason(
          "geography_unresolved",
          "unresolved",
          `The office is outside the recorded home city, and its distance from the ${profile.commuteRadiusMiles}-mile commute boundary cannot be verified from the listing.`,
          "derived",
        );
      }
    }
  }
  if (
    revision.workArrangement === "remote" &&
    revision.remoteRestriction &&
    fit.eligibility.status !== "eligible"
  ) {
    addReason(
      fit.eligibility.status === "ineligible"
        ? "geography_incompatible"
        : "geography_unresolved",
      fit.eligibility.status === "ineligible" ? "blocker" : "unresolved",
      fit.eligibility.status === "ineligible"
        ? "The remote geography restriction conflicts with the profile."
        : "The remote geography restriction still needs confirmation.",
      "fit",
    );
  }

  if (profile.targetRoleFamilies.length === 0) {
    addReason(
      "target_roles_missing",
      "blocker",
      "The profile needs at least one target role before the feed can be qualified.",
      "profile",
    );
  }

  const roleComponent = fit.components.find(
    (component) => component.key === "roleFamily",
  );
  const roleScore = roleComponent?.rawScore ?? null;
  const roleCoverage = roleComponent?.coverage ?? 0;
  const isDirectRole =
    matchedRoleTarget?.matchQuality === "direct" ||
    (roleScore !== null && roleScore >= 90 && roleCoverage >= 0.7);
  const isAdjacentRole =
    matchedRoleTarget?.matchQuality === "adjacent" ||
    (matchedRoleTarget?.matchQuality === undefined &&
      roleScore !== null &&
      roleScore >= 65 &&
      roleScore < 90 &&
      roleCoverage >= 0.5);

  if (profile.targetRoleFamilies.length > 0) {
    if (isDirectRole) {
      addReason(
        "role_direct_match",
        "match",
        "The listing maps directly to a configured target role family.",
        "fit",
      );
    } else if (isAdjacentRole) {
      addReason(
        "role_adjacent_match",
        "stretch",
        "The listing is an approved adjacent role rather than a direct target.",
        "fit",
      );
    } else if (roleScore === null || roleCoverage < 0.5) {
      addReason(
        "role_match_unresolved",
        "blocker",
        "The listing cannot be mapped confidently to a configured target role.",
        "fit",
      );
    } else {
      addReason(
        "role_outside_targets",
        "blocker",
        "The recognized role family is outside the configured targets.",
        "fit",
      );
    }
  }

  if (
    !PRIMARY_VERDICTS.has(fit.verdict) &&
    fit.verdict !== "skip" &&
    matchedRoleTarget?.readiness !== "stretch"
  ) {
    addReason(
      "fit_requires_review",
      "stretch",
      "The deterministic fit result recommends review rather than a standard apply.",
      "fit",
    );
  }

  const collectedReasons = [...reasons.values()];
  const hasBlocker = collectedReasons.some((reason) => reason.kind === "blocker");
  const lane: FeedAdmissionLane = hasBlocker
    ? "blocked"
    : !isDirectRole || hasStretch || hasCriticalUnresolved
      ? "explore"
      : "primary";

  return {
    lane,
    reasonCodes: collectedReasons.map((reason) => reason.code),
    reasons: collectedReasons,
  };
}

/**
 * A deliberately narrow escape hatch for an otherwise empty qualified feed.
 * Near Matches are still blocked by the normal policy: this only identifies
 * the small subset whose sole blocker is role-family relevance uncertainty.
 * The query layer decides whether the fallback is needed and keeps every hard
 * conflict out before preference ranking runs.
 */
export function classifyNearMatchFallback(
  input: FeedAdmissionInput,
  admission: FeedAdmissionDecision = classifyFeedAdmission(input),
): NearMatchFallbackDecision {
  const unavailable: NearMatchFallbackDecision = {
    eligible: false,
    explanation: null,
    reasonCode: null,
  };
  if (
    admission.lane !== "blocked" ||
    input.fit.eligibility.status !== "eligible" ||
    !NEAR_MATCH_VERDICTS.has(input.fit.verdict) ||
    admission.reasonCodes.some((code) =>
      NEAR_MATCH_COMPOUND_UNCERTAINTY.has(code),
    )
  ) {
    return unavailable;
  }

  const blockerCodes = admission.reasons
    .filter((reason) => reason.kind === "blocker")
    .map((reason) => reason.code);
  if (
    blockerCodes.length === 0 ||
    blockerCodes.some((code) => !NEAR_MATCH_SOFT_BLOCKERS.has(code))
  ) {
    return unavailable;
  }

  const roleComponent = input.fit.components.find(
    (component) => component.key === "roleFamily",
  );
  const roleScore = roleComponent?.rawScore ?? null;
  const roleCoverage = roleComponent?.coverage ?? 0;
  const overallFitScore = input.fit.deterministicFitScore ?? null;
  if (
    overallFitScore === null ||
    !Number.isFinite(overallFitScore) ||
    overallFitScore < NEAR_MATCH_MINIMUM_FIT_SCORE
  ) {
    return unavailable;
  }

  if (blockerCodes.includes("role_outside_targets")) {
    if (roleScore === null || roleScore < 40 || roleCoverage < 0.5) {
      return unavailable;
    }
    return {
      eligible: true,
      explanation:
        "The title has tangential overlap with your target roles, but not enough for Ready Now or Credible Stretch.",
      reasonCode: "role_outside_targets",
    };
  }

  if (!blockerCodes.includes("role_match_unresolved")) return unavailable;
  const hasRelevantRoleSignal = roleScore !== null && roleScore >= 65;
  const hasStrongUnmappedEvidence =
    roleScore === null &&
    overallFitScore >= NEAR_MATCH_UNMAPPED_MINIMUM_FIT_SCORE;
  if (!hasRelevantRoleSignal && !hasStrongUnmappedEvidence) {
    return unavailable;
  }

  return {
    eligible: true,
    explanation: hasRelevantRoleSignal
      ? "The title shows relevant role signals, but the role-family mapping is too uncertain for Stretch."
      : "The title does not map cleanly to your target roles, but the remaining fit evidence is strong enough for a manual review.",
    reasonCode: "role_match_unresolved",
  };
}
