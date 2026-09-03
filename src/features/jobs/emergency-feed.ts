import type { StarterJobSource } from "@/features/discovery/default-sources";
import { fetchJobSourceBatch } from "@/features/discovery/source-fetch";
import {
  isDiscoveryImportCandidate,
  scoreDiscoveryRelevance,
  type DiscoveryCandidateProfile,
} from "@/features/discovery/relevance";
import type {
  DiscoveryFetch,
  DiscoveryJob,
  DiscoverySalary,
} from "@/features/discovery/types";

const MAX_EMERGENCY_JOBS = 40;
const MINIMUM_RELEVANCE = 2;
const EXPERIENCE_STRETCH_YEARS = 2;
const ALWAYS_OUT_OF_SCOPE_TITLE =
  /\b(?:staff|principal|director|head|vice president|vp|chief)\b/i;
const SENIOR_OR_MANAGER_TITLE = /\b(?:senior|sr\.?|manager|lead)\b/i;
const TARGET_ROLE_TITLE =
  /\b(?:implementation|solutions? (?:consultant|engineer|specialist)|technical customer success|customer success|product operations?|product analyst|business systems?|business analyst|operations? analyst|automation|enablement|onboarding|integrations?|technical account|associate product|technical product|product specialist|application support|ai operations?|health(?:care|-?tech)? analyst|technology analyst)\b/i;
const HARD_EXPERIENCE_REQUIREMENTS = [
  /\b(\d+)\s*\+\s*years?\b/gi,
  /\b(?:at least|minimum(?: of)?|requires?|required|must have)\s+(\d+)\s*\+?\s*years?\b/gi,
  /\b(\d+)\s*\+?\s*years?\s+of\s+(?:relevant\s+|professional\s+|hands-on\s+)?experience\b/gi,
  /\b(\d+)\s*(?:[-–—]|to)\s*\d+\s+years?\b/gi,
] as const;
const EXPLICIT_US_LOCATION =
  /\b(?:u\.?s\.?a?|united states|pittsburgh)\b/i;
const EXPLICIT_NON_US_LOCATION =
  /\b(?:united kingdom|u\.?k\.?|england|scotland|wales|ireland|emea|europe(?:an)?|e\.?u\.?|canada|north america|latam|latin america|south america|central america|apac|asia(?:-pacific)?|australia|new zealand|india|singapore|japan|china|hong kong|taiwan|south korea|philippines|malaysia|indonesia|thailand|vietnam|pakistan|bangladesh|sri lanka|nepal|germany|france|spain|italy|netherlands|sweden|norway|denmark|poland|portugal|switzerland|austria|belgium|czechia|czech republic|romania|hungary|greece|finland|iceland|luxembourg|bulgaria|croatia|serbia|ukraine|russia|south africa|africa|middle east|mena|united arab emirates|u\.?a\.?e\.?|dubai|israel|turkey|türkiye|brazil|mexico|argentina|colombia|chile|peru|uruguay|costa rica|panama)\b/i;

/**
 * Small, profile-relevant boards that can be read directly when Turso is
 * unavailable. These are official public ATS endpoints, never scraped pages.
 */
export const EMERGENCY_JOB_SOURCES = [
  { provider: "lever", providerKey: "workwave", companyName: "WorkWave", companyDomain: "workwave.com" },
  { provider: "lever", providerKey: "aledade", companyName: "Aledade", companyDomain: "aledade.com" },
  { provider: "ashby", providerKey: "govworx", companyName: "GovWorx", companyDomain: "govworx.ai" },
  { provider: "ashby", providerKey: "aurelian", companyName: "Aurelian", companyDomain: "aurelian.com" },
  { provider: "ashby", providerKey: "hellopatient", companyName: "Hello Patient", companyDomain: "hellopatient.com" },
  { provider: "ashby", providerKey: "raspberry", companyName: "Raspberry AI", companyDomain: "raspberry.ai" },
  { provider: "ashby", providerKey: "abridge", companyName: "Abridge", companyDomain: "abridge.com" },
  { provider: "ashby", providerKey: "attio", companyName: "Attio", companyDomain: "attio.com" },
  { provider: "ashby", providerKey: "pylon", companyName: "Pylon", companyDomain: "usepylon.com" },
  { provider: "ashby", providerKey: "ashby", companyName: "Ashby", companyDomain: "ashbyhq.com" },
  { provider: "greenhouse", providerKey: "samsara", companyName: "Samsara", companyDomain: "samsara.com" },
  { provider: "greenhouse", providerKey: "gitlab", companyName: "GitLab", companyDomain: "gitlab.com" },
] as const satisfies readonly StarterJobSource[];

export type EmergencyFeedProfile = Omit<
  DiscoveryCandidateProfile,
  "desiredSeniorityLevels"
> & {
  desiredSeniorityLevels: readonly ("entry" | "mid" | "senior")[];
  preferredSalaryMinimumCents: number;
  preferredWorkModes: readonly ("remote" | "hybrid" | "on_site")[];
};

export type EmergencyFeedJob = {
  company: string;
  datePosted: string | null;
  /**
   * A bounded copy of the employer's public ATS description. Optional so
   * jobs saved by the previous on-device schema continue to open safely.
   */
  description?: string;
  employmentType: string;
  estimatedSalary: boolean;
  externalId: string;
  id: string;
  location: string;
  provider: StarterJobSource["provider"];
  relevanceScore: number;
  salaryDisplay: string;
  sourceKey: string;
  sourceUrl: string;
  summary: string;
  /** Requirement-shaped excerpts from the employer's own listing text. */
  requirements?: string[];
  title: string;
  workArrangement: "Remote" | "Hybrid" | "On-site" | "Unclear";
};

export const DEFAULT_EMERGENCY_PROFILE: EmergencyFeedProfile = {
  desiredSeniorityLevels: ["entry", "mid"],
  location: "Pittsburgh, PA",
  preferredSalaryMinimumCents: 6_000_000,
  preferredWorkModes: ["remote", "hybrid", "on_site"],
  targetRoleFamilies: [
    "AI implementation specialist",
    "AI solutions consultant",
    "Junior solutions engineer",
    "Technical customer success",
    "AI operations analyst",
    "Automation specialist",
    "AI business analyst",
    "Product analyst",
    "Associate product manager",
    "Product operations analyst",
    "AI enablement specialist",
    "Health-tech implementation specialist",
  ],
  yearsExperience: 1,
};

function compactUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function annualMultiplier(period: DiscoverySalary["period"]) {
  if (period === "hour") return 2_080;
  if (period === "day") return 260;
  if (period === "week") return 52;
  if (period === "month") return 12;
  if (period === "year") return 1;
  return null;
}

export function annualPostedSalary(salary: DiscoverySalary | null) {
  if (!salary || salary.currency?.toUpperCase() !== "USD") return null;
  const multiplier = annualMultiplier(salary.period);
  if (multiplier === null) return null;
  const minimum =
    salary.minimumMajorUnits === null
      ? null
      : Math.round(salary.minimumMajorUnits * multiplier);
  const maximum =
    salary.maximumMajorUnits === null
      ? null
      : Math.round(salary.maximumMajorUnits * multiplier);
  if (minimum === null && maximum === null) return null;
  return { minimum, maximum };
}

function estimatedAnnualRange(title: string) {
  const lower = title.toLowerCase();
  if (/\b(?:engineer|solutions architect)\b/.test(lower)) return [85_000, 125_000] as const;
  if (/\b(?:implementation|customer success|technical account)\b/.test(lower)) {
    return [70_000, 105_000] as const;
  }
  if (/\b(?:product|business|operations|automation)\b/.test(lower)) {
    return [68_000, 102_000] as const;
  }
  if (/\b(?:analyst|specialist|coordinator)\b/.test(lower)) {
    return [62_000, 90_000] as const;
  }
  return [60_000, 92_000] as const;
}

function salaryForJob(job: DiscoveryJob) {
  const posted = annualPostedSalary(job.salary);
  if (posted) {
    const minimum = posted.minimum ?? posted.maximum ?? 0;
    const maximum = posted.maximum ?? posted.minimum ?? 0;
    return {
      display:
        minimum === maximum
          ? `${compactUsd(minimum)} / yr`
          : `${compactUsd(minimum)}–${compactUsd(maximum)} / yr`,
      estimated: false,
      maximum,
    };
  }
  const [minimum, maximum] = estimatedAnnualRange(job.title);
  return {
    display: `Est. ${compactUsd(minimum)}–${compactUsd(maximum)} / yr`,
    estimated: true,
    maximum,
  };
}

function workArrangementLabel(job: DiscoveryJob): EmergencyFeedJob["workArrangement"] {
  if (job.workArrangement === "remote") return "Remote";
  if (job.workArrangement === "hybrid") return "Hybrid";
  if (job.workArrangement === "on_site") return "On-site";
  return "Unclear";
}

function employmentLabel(value: DiscoveryJob["employmentType"]) {
  const labels: Record<DiscoveryJob["employmentType"], string> = {
    contract: "Contract",
    full_time: "Full time",
    internship: "Internship",
    part_time: "Part time",
    seasonal: "Seasonal",
    temporary: "Temporary",
    unknown: "Employment type unclear",
  };
  return labels[value];
}

const GENERIC_LEGAL_COPY =
  /equal opportunity|affirmative action|privacy policy|accommodation|protected veteran|eeoc|e-verify/i;
const REQUIREMENT_LANGUAGE =
  /\b(?:requirements?|qualifications?|must have|you (?:have|bring)|minimum|at least|\d+\+?\s+years?|experience (?:with|in)|proficien(?:t|cy)|familiarity|ability to|degree)\b/i;

function boundedDescription(value: string) {
  const cleaned = value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > 8_000
    ? `${cleaned.slice(0, 7_997).trimEnd()}…`
    : cleaned;
}

function listingExcerpts(value: string) {
  return value
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((item) =>
      item
        .replace(/^[\s•*\-–—\d.)]+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((item) => item.length >= 24 && item.length <= 320);
}

function requirementsForJob(job: DiscoveryJob) {
  const seen = new Set<string>();
  const requirements: string[] = [];
  for (const excerpt of listingExcerpts(job.descriptionText)) {
    if (!REQUIREMENT_LANGUAGE.test(excerpt) || GENERIC_LEGAL_COPY.test(excerpt)) {
      continue;
    }
    const identity = excerpt.toLocaleLowerCase("en-US");
    if (seen.has(identity)) continue;
    seen.add(identity);
    requirements.push(excerpt);
    if (requirements.length >= 6) break;
  }
  return requirements;
}

function summaryForJob(job: DiscoveryJob) {
  const compact = job.descriptionText.replace(/\s+/g, " ").trim();
  if (!compact) return "Open the official listing for the complete role description.";
  return compact.length > 420 ? `${compact.slice(0, 417).trimEnd()}…` : compact;
}

function sourceKey(source: StarterJobSource) {
  return `${source.provider}:${source.providerKey}`;
}

function normalizedIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function explicitlyRequiresTooMuchExperience(
  job: DiscoveryJob,
  profile: EmergencyFeedProfile,
) {
  const yearsExperience =
    typeof profile.yearsExperience === "number" ? profile.yearsExperience : 0;
  const maximumRequiredYears = Math.max(
    0,
    yearsExperience + EXPERIENCE_STRETCH_YEARS,
  );
  for (const pattern of HARD_EXPERIENCE_REQUIREMENTS) {
    pattern.lastIndex = 0;
    for (const match of job.descriptionText.matchAll(pattern)) {
      if (Number(match[1]) > maximumRequiredYears) return true;
    }
  }
  return false;
}

function exceedsDesiredSeniority(
  job: DiscoveryJob,
  profile: EmergencyFeedProfile,
) {
  if (ALWAYS_OUT_OF_SCOPE_TITLE.test(job.title)) return true;
  const levels = new Set(profile.desiredSeniorityLevels);
  if (SENIOR_OR_MANAGER_TITLE.test(job.title)) return !levels.has("senior");
  if (/\b(?:junior|jr\.?|entry(?:-level)?|associate|coordinator)\b/i.test(job.title)) {
    return !levels.has("entry");
  }
  if (/\b(?:mid(?:-level)?|level\s*(?:2|ii))\b/i.test(job.title)) {
    return !levels.has("mid");
  }
  // Titles without an explicit level remain visible as an uncertainty.
  return false;
}

function isExplicitlyOutsideUnitedStates(job: DiscoveryJob) {
  const location = job.location?.trim() ?? "";
  return (
    EXPLICIT_NON_US_LOCATION.test(location) &&
    !EXPLICIT_US_LOCATION.test(location)
  );
}

export function buildEmergencyFeed(
  batches: readonly {
    source: StarterJobSource;
    jobs: readonly DiscoveryJob[];
  }[],
  profile: EmergencyFeedProfile = DEFAULT_EMERGENCY_PROFILE,
) {
  const seen = new Set<string>();
  const seenListings = new Set<string>();
  const preferredModes = new Set(profile.preferredWorkModes);
  const candidates: EmergencyFeedJob[] = [];

  for (const batch of batches) {
    for (const job of batch.jobs) {
      if (
        !isDiscoveryImportCandidate(job) ||
        !TARGET_ROLE_TITLE.test(job.title) ||
        exceedsDesiredSeniority(job, profile) ||
        explicitlyRequiresTooMuchExperience(job, profile) ||
        isExplicitlyOutsideUnitedStates(job)
      ) {
        continue;
      }
      const id = `${sourceKey(batch.source)}:${job.externalId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const listingIdentity = [job.company, job.title, job.location ?? ""]
        .map(normalizedIdentity)
        .join(":");
      if (seenListings.has(listingIdentity)) continue;
      seenListings.add(listingIdentity);

      const relevanceScore = scoreDiscoveryRelevance(job, profile);
      if (relevanceScore < MINIMUM_RELEVANCE) continue;
      const salary = salaryForJob(job);
      if (
        !salary.estimated &&
        profile.preferredSalaryMinimumCents > 0 &&
        salary.maximum * 100 < profile.preferredSalaryMinimumCents
      ) {
        continue;
      }
      if (
        job.workArrangement !== "unknown" &&
        profile.preferredWorkModes.length > 0 &&
        !preferredModes.has(job.workArrangement)
      ) {
        continue;
      }

      candidates.push({
        company: job.company,
        datePosted: job.postedAt,
        description: boundedDescription(job.descriptionText),
        employmentType: employmentLabel(job.employmentType),
        estimatedSalary: salary.estimated,
        externalId: job.externalId,
        id,
        location: job.location || "Location shown on listing",
        provider: batch.source.provider,
        relevanceScore,
        salaryDisplay: salary.display,
        sourceKey: batch.source.providerKey,
        sourceUrl: job.applyUrl || job.jobUrl,
        summary: summaryForJob(job),
        requirements: requirementsForJob(job),
        title: job.title,
        workArrangement: workArrangementLabel(job),
      });
    }
  }

  const sorted = candidates.sort((left, right) => {
      const relevance = right.relevanceScore - left.relevanceScore;
      if (relevance !== 0) return relevance;
      if (left.workArrangement === "Remote" && right.workArrangement !== "Remote") return -1;
      if (right.workArrangement === "Remote" && left.workArrangement !== "Remote") return 1;
      if (!left.estimatedSalary && right.estimatedSalary) return -1;
      if (!right.estimatedSalary && left.estimatedSalary) return 1;
      return left.company.localeCompare(right.company);
    });
  const companyQueues = new Map<string, EmergencyFeedJob[]>();
  for (const job of sorted) {
    const company = normalizedIdentity(job.company);
    const queue = companyQueues.get(company) ?? [];
    queue.push(job);
    companyQueues.set(company, queue);
  }
  const selected: EmergencyFeedJob[] = [];
  while (selected.length < MAX_EMERGENCY_JOBS) {
    let added = false;
    for (const queue of companyQueues.values()) {
      const job = queue.shift();
      if (!job) continue;
      selected.push(job);
      added = true;
      if (selected.length >= MAX_EMERGENCY_JOBS) break;
    }
    if (!added) break;
  }
  return selected;
}

export async function fetchEmergencyFeed(input: {
  fetcher?: DiscoveryFetch;
  profile?: EmergencyFeedProfile;
} = {}) {
  const settled = await Promise.allSettled(
    EMERGENCY_JOB_SOURCES.map(async (source) => ({
      source,
      batch: await fetchJobSourceBatch(source, {
        fetcher: input.fetcher,
        maxItems: 90,
        maxResponseBytes: 5_000_000,
        timeoutMs: 5_500,
      }),
    })),
  );
  const successful = settled.flatMap((result) =>
    result.status === "fulfilled"
      ? [{ source: result.value.source, jobs: result.value.batch.jobs }]
      : [],
  );
  return {
    failedSources: settled.length - successful.length,
    jobs: buildEmergencyFeed(successful, input.profile),
    successfulSources: successful.length,
  };
}
