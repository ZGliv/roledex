import type {
  CandidateProfile,
  CandidateSeniorityLevel,
} from "@/db/schema";
import type { DiscoveryJob } from "@/features/discovery/types";

export type DiscoveryCandidateProfile = {
  desiredSeniorityLevels?: readonly CandidateSeniorityLevel[];
  location: string | null;
  targetRoleFamilies: readonly string[];
  yearsExperience?: number;
};

/**
 * Shared scheduled ingestion must represent the launch market, not whichever
 * individual happens to own the deployment. Personal refreshes may still use
 * the initiating profile, while the cron spends its bounded import budget on
 * realistic US technical-career-mover inventory.
 */
export const TECHNICAL_CAREER_MOVER_DISCOVERY_PROFILE: DiscoveryCandidateProfile = {
  desiredSeniorityLevels: ["entry", "mid"],
  location: null,
  targetRoleFamilies: [
    "Implementation Specialist",
    "Implementation Consultant",
    "Health-tech Implementation",
    "AI Enablement",
    "AI Operations",
    "Product Operations",
    "Technical Customer Success",
    "Business Systems Analyst",
    "Automation Analyst",
    "Associate Solutions Consultant",
    "Associate Solutions Engineer",
    "Associate Product Manager",
    "Technical Product Specialist",
  ],
  yearsExperience: 2,
};

const TITLE_SIGNALS: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bimplementation\b/i, 6],
  [/\bsolutions? (?:consultant|engineer|specialist|architect)\b/i, 6],
  [/\btechnical customer success\b/i, 7],
  [/\bcustomer success\b/i, 4],
  [/\bproduct operations?\b/i, 6],
  [/\bproduct analyst\b/i, 6],
  [/\bbusiness analyst\b/i, 5],
  [/\boperations? analyst\b/i, 5],
  [/\bautomation\b/i, 5],
  [/\benablement\b/i, 5],
  [/\bonboarding\b/i, 4],
  [/\bintegrations?\b/i, 4],
  [/\btechnical account\b/i, 4],
  [/\bassociate product manager\b/i, 7],
  [/\binnovation\b/i, 4],
  [/\bdigital transformation\b/i, 5],
  [/\b(?:product|support|operations?) specialist\b/i, 4],
  [/\b(?:product|implementation|technology) consultant\b/i, 4],
  [/\banalyst\b/i, 2],
  [/\bassociate\b/i, 2],
  [/\bcoordinator\b/i, 2],
];

const SENIOR_TITLE =
  /\b(?:senior|sr\.?|staff|principal|lead|director|head|vice president|vp)\b/i;
const ENTRY_TITLE = /\b(?:junior|jr\.?|entry|associate|coordinator|specialist|analyst)\b/i;
const GENERIC_PRODUCT_MANAGER_TITLE = /\bproduct manager\b/i;
const CLEARLY_UNRELATED_TITLE =
  /\b(?:account executive|sales development|attorney|counsel|recruiter|physician|nurse|therapist|clinical trial|tax|payroll)\b/i;
const ENGINEERING_TITLE =
  /\b(?:software|frontend|front-end|backend|back-end|mobile|machine learning|data|security|site reliability|devops) engineer\b/i;
const CLEARLY_FOREIGN_LOCATION =
  /\b(?:australia|canada|mexico|united kingdom|england|ireland|france|germany|netherlands|spain|portugal|poland|sweden|india|japan|singapore|brazil|argentina|colombia|israel)\b/i;
const UNITED_STATES_LOCATION =
  /\b(?:united states|u\.?s\.?a?\.?|new york|san francisco|pittsburgh|pennsylvania|california|texas|massachusetts|washington,? dc|remote\s*-?\s*us)\b/i;

function normalizedTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function targetTokenScore(title: string, roleFamilies: readonly string[]) {
  const titleTokens = new Set(normalizedTokens(title));
  const targetTokens = new Set(roleFamilies.flatMap(normalizedTokens));
  let score = 0;
  for (const token of targetTokens) {
    if (titleTokens.has(token)) score += 0.75;
  }
  return Math.min(4, score);
}

function locationScore(job: DiscoveryJob, profile: DiscoveryCandidateProfile) {
  const location = job.location?.toLowerCase() ?? "";
  const home = profile.location?.toLowerCase() ?? "";
  if (!home) return 0;
  if (/\bremote\b/.test(home)) {
    return job.workArrangement === "remote" ? 2 : 0;
  }
  const homeCity = home.split(",")[0]?.trim();
  if (homeCity && location.includes(homeCity)) return 2;
  if (job.workArrangement === "remote") return 1;
  if (job.workArrangement === "hybrid" && location) return -2;
  if (job.workArrangement === "on_site" && location) return -3;
  return 0;
}

function isClearlyOutsideUnitedStates(job: DiscoveryJob) {
  const location = job.location ?? "";
  return CLEARLY_FOREIGN_LOCATION.test(location) && !UNITED_STATES_LOCATION.test(location);
}

export function buildDiscoveryCandidateProfile(
  profile: Pick<
    CandidateProfile,
    | "desiredSeniorityLevels"
    | "location"
    | "targetRoleFamilies"
    | "yearsExperience"
  >,
): DiscoveryCandidateProfile {
  return {
    desiredSeniorityLevels: [...profile.desiredSeniorityLevels],
    location: profile.location,
    targetRoleFamilies: [...profile.targetRoleFamilies],
    yearsExperience: profile.yearsExperience,
  };
}

/**
 * Catalog admission is intentionally independent from any one candidate. The
 * shared discovery refresh should retain viable US roles for every visitor;
 * each visitor's deterministic fit score decides how those roles are ranked.
 */
export function isDiscoveryImportCandidate(job: DiscoveryJob) {
  return (
    job.title.trim().length > 0 &&
    job.company.trim().length > 0 &&
    Boolean(job.applyUrl.trim() || job.jobUrl.trim()) &&
    !isClearlyOutsideUnitedStates(job)
  );
}

/**
 * A profile-neutral quality signal used only to spend the bounded import
 * budget. It favors complete, actionable cards without favoring a profession.
 */
function scoreDiscoveryListingQuality(job: DiscoveryJob) {
  let score = 0;
  if (job.workArrangement === "remote") score += 2;
  else if (job.workArrangement === "hybrid") score += 1;

  if (
    job.salary &&
    (job.salary.minimumMajorUnits !== null ||
      job.salary.maximumMajorUnits !== null)
  ) {
    score += 2;
  }
  if (job.employmentType !== "unknown") score += 0.5;
  if (job.descriptionText.trim().length >= 400) score += 0.5;

  return score;
}

/**
 * Spend the bounded import budget on the profile that initiated the refresh.
 * Catalog admission stays broad and shared; this only changes which public
 * listings are parsed first when a source batch is larger than the budget.
 */
export function scoreDiscoveryImportPriority(
  job: DiscoveryJob,
  profile?: DiscoveryCandidateProfile | null,
) {
  const quality = scoreDiscoveryListingQuality(job);
  if (!profile || profile.targetRoleFamilies.length === 0) return quality;
  return quality + scoreDiscoveryRelevance(job, profile) * 4;
}

function targetsEarlyCareer(profile: DiscoveryCandidateProfile) {
  const desired = profile.desiredSeniorityLevels ?? [];
  if (desired.length > 0) {
    return desired.every((level) =>
      ["intern", "entry", "mid"].includes(level),
    );
  }
  return (profile.yearsExperience ?? 0) < 5;
}

function targetsSeniorCareer(profile: DiscoveryCandidateProfile) {
  const desired = profile.desiredSeniorityLevels ?? [];
  if (desired.length > 0) {
    return desired.some((level) =>
      [
        "senior",
        "staff",
        "principal",
        "manager",
        "director",
        "executive",
      ].includes(level),
    );
  }
  return (profile.yearsExperience ?? 0) >= 5;
}

export function scoreDiscoveryRelevance(
  job: DiscoveryJob,
  profile: DiscoveryCandidateProfile,
) {
  const title = job.title.trim();
  let score = targetTokenScore(title, profile.targetRoleFamilies);

  for (const [pattern, weight] of TITLE_SIGNALS) {
    if (pattern.test(title)) score += weight;
  }
  if (ENTRY_TITLE.test(title)) score += targetsEarlyCareer(profile) ? 3 : 1;
  if (SENIOR_TITLE.test(title)) {
    score += targetsSeniorCareer(profile)
      ? 2
      : targetsEarlyCareer(profile)
        ? -12
        : -7;
  }
  // The candidate is targeting associate product roles, not unqualified generic
  // PM openings. Those can still surface when the title carries an entry signal.
  if (GENERIC_PRODUCT_MANAGER_TITLE.test(title) && !ENTRY_TITLE.test(title)) score -= 5;
  if (CLEARLY_UNRELATED_TITLE.test(title)) score -= 8;
  if (
    ENGINEERING_TITLE.test(title) &&
    !/\b(?:solutions?|implementation|support|customer)\b/i.test(title)
  ) {
    score -= 6;
  }
  score += locationScore(job, profile);

  return Math.round(score * 100) / 100;
}

export function isDiscoveryCandidateRelevant(
  job: DiscoveryJob,
  profile: DiscoveryCandidateProfile,
) {
  return !isClearlyOutsideUnitedStates(job) && scoreDiscoveryRelevance(job, profile) >= 3;
}
