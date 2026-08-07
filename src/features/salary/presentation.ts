import { formatSalaryRange } from "@/lib/format";

export const SALARY_MODEL_VERSION = "bls-oews-2025-v1" as const;

export const SALARY_BENCHMARK_SOURCE = {
  name: "U.S. Bureau of Labor Statistics OEWS, May 2025",
  url: "https://www.bls.gov/news.release/ocwage.t01.htm",
  releasedAt: "2026-05-15",
} as const;

export type SalaryConfidence = "high" | "medium" | "low";
export type SalaryPresentationSource = "employer_posted" | "market_estimate";

export interface SalaryPresentationInput {
  company: string;
  title: string;
  location: string | null;
  workArrangement: "remote" | "hybrid" | "on_site" | "unclear";
  seniority: string | null;
  salaryMinimumCents: number | null;
  salaryMaximumCents: number | null;
  salaryCurrency: string;
  salaryPeriod: "year" | "hour" | "month";
  salarySource: "employer_posted" | "external_estimate" | "unknown";
  sourceUrl: string | null;
}

export interface SalaryPresentation {
  display: string;
  source: SalaryPresentationSource;
  isEstimate: boolean;
  confidence: SalaryConfidence;
  annualMinimumCents: number;
  annualMaximumCents: number;
  annualMidpointCents: number;
  currency: string;
  period: "year" | "hour" | "month";
  disclosure: string;
  method: string;
  benchmarkOccupation: string | null;
  sourceName: string;
  sourceUrl: string | null;
  modelVersion: typeof SALARY_MODEL_VERSION | "employer-posted";
}

interface OccupationBenchmark {
  occupation: string;
  annualMeanDollars: number;
  aliases: readonly string[];
  specificity: "specific" | "broad";
}

/**
 * May 2025 national annual means from the BLS OEWS table linked above. These
 * are anchors for broad modeled bands, not claims about a specific employer.
 */
const OCCUPATION_BENCHMARKS: readonly OccupationBenchmark[] = [
  {
    occupation: "Sales Engineers",
    annualMeanDollars: 130_140,
    aliases: [
      "solutions engineer",
      "solution engineer",
      "sales engineer",
      "presales engineer",
      "pre sales engineer",
      "solutions consultant",
    ],
    specificity: "specific",
  },
  {
    occupation: "Information Security Analysts",
    annualMeanDollars: 132_510,
    aliases: [
      "information security analyst",
      "cybersecurity analyst",
      "security analyst",
      "security engineer",
    ],
    specificity: "specific",
  },
  {
    occupation: "Data Scientists",
    annualMeanDollars: 126_800,
    aliases: ["data scientist", "machine learning scientist", "applied scientist"],
    specificity: "specific",
  },
  {
    occupation: "Software Developers",
    annualMeanDollars: 148_100,
    aliases: [
      "software engineer",
      "software developer",
      "full stack",
      "fullstack",
      "front end developer",
      "frontend developer",
      "back end developer",
      "backend developer",
      "platform engineer",
      "ai engineer",
      "machine learning engineer",
      "product engineer",
    ],
    specificity: "specific",
  },
  {
    occupation: "Computer Systems Analysts",
    annualMeanDollars: 114_610,
    aliases: [
      "systems analyst",
      "implementation consultant",
      "implementation specialist",
      "implementation analyst",
      "technical consultant",
      "healthcare implementation",
      "digital transformation",
      "automation analyst",
      "automation specialist",
    ],
    specificity: "specific",
  },
  {
    occupation: "Project Management Specialists",
    annualMeanDollars: 110_740,
    aliases: [
      "project manager",
      "program manager",
      "product manager",
      "product operations",
      "implementation manager",
      "delivery manager",
    ],
    specificity: "specific",
  },
  {
    occupation: "Management Analysts",
    annualMeanDollars: 113_790,
    aliases: [
      "business analyst",
      "management analyst",
      "operations analyst",
      "strategy analyst",
      "innovation analyst",
      "ai business analyst",
    ],
    specificity: "specific",
  },
  {
    occupation: "Market Research Analysts and Marketing Specialists",
    annualMeanDollars: 89_490,
    aliases: [
      "product analyst",
      "market research analyst",
      "marketing analyst",
      "growth analyst",
      "product marketing",
    ],
    specificity: "specific",
  },
  {
    occupation: "Training and Development Specialists",
    annualMeanDollars: 75_550,
    aliases: [
      "enablement specialist",
      "training specialist",
      "learning specialist",
      "ai trainer",
      "customer education",
    ],
    specificity: "specific",
  },
  {
    occupation: "Business Operations Specialists, All Other",
    annualMeanDollars: 93_970,
    aliases: [
      "customer success manager",
      "customer success specialist",
      "technical account manager",
      "onboarding specialist",
      "ai operations",
      "business operations",
    ],
    specificity: "broad",
  },
  {
    occupation: "Computer User Support Specialists",
    annualMeanDollars: 67_330,
    aliases: [
      "technical support",
      "application support",
      "support analyst",
      "help desk",
      "service desk",
      "desktop support",
    ],
    specificity: "specific",
  },
] as const;

const ALL_OCCUPATIONS_BENCHMARK: OccupationBenchmark = {
  occupation: "All Occupations",
  annualMeanDollars: 69_770,
  aliases: [],
  specificity: "broad",
};

interface SeniorityBand {
  label: string;
  lowerMultiplier: number;
  upperMultiplier: number;
  explicit: boolean;
}

interface LocationAdjustment {
  factor: number;
  label: string;
  explicit: boolean;
}

const HIGH_COST_MARKETS = [
  "san francisco",
  "san jose",
  "new york",
  "nyc",
  "seattle",
  "boston",
  "washington dc",
  "district of columbia",
  "los angeles",
] as const;

const ABOVE_NATIONAL_MARKETS = [
  "austin",
  "denver",
  "chicago",
  "philadelphia",
  "san diego",
  "portland",
  "raleigh",
  "atlanta",
  "minneapolis",
] as const;

const BELOW_NATIONAL_MARKETS = [
  "pittsburgh",
  "cleveland",
  "detroit",
  "st louis",
  "buffalo",
  "cincinnati",
  "indianapolis",
  "kansas city",
] as const;

function normalize(value: string | null) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function includesPhrase(value: string, phrase: string) {
  return ` ${value} `.includes(` ${phrase} `);
}

function benchmarkForTitle(title: string) {
  const normalized = normalize(title);
  return (
    OCCUPATION_BENCHMARKS.find((benchmark) =>
      benchmark.aliases.some((alias) => includesPhrase(normalized, alias)),
    ) ?? ALL_OCCUPATIONS_BENCHMARK
  );
}

function seniorityBand(title: string, seniority: string | null): SeniorityBand {
  const value = normalize(`${seniority ?? ""} ${title}`);
  if (/\b(intern|internship|co op)\b/.test(value)) {
    return { label: "internship", lowerMultiplier: 0.42, upperMultiplier: 0.65, explicit: true };
  }
  if (/\b(junior|jr|entry|associate|early career|new grad)\b/.test(value)) {
    return { label: "entry/associate", lowerMultiplier: 0.65, upperMultiplier: 0.9, explicit: true };
  }
  if (/\b(vice president|vp|chief|executive)\b/.test(value)) {
    return { label: "executive", lowerMultiplier: 1.35, upperMultiplier: 2.05, explicit: true };
  }
  if (/\b(director|head)\b/.test(value)) {
    return { label: "director", lowerMultiplier: 1.2, upperMultiplier: 1.75, explicit: true };
  }
  if (/\b(staff|principal|lead|manager)\b/.test(value)) {
    return { label: "lead/manager", lowerMultiplier: 1.05, upperMultiplier: 1.5, explicit: true };
  }
  if (/\b(senior|sr)\b/.test(value)) {
    return { label: "senior", lowerMultiplier: 0.95, upperMultiplier: 1.35, explicit: true };
  }
  if (/\b(mid|intermediate)\b/.test(value)) {
    return { label: "mid-level", lowerMultiplier: 0.82, upperMultiplier: 1.18, explicit: true };
  }
  return { label: "unspecified seniority", lowerMultiplier: 0.72, upperMultiplier: 1.28, explicit: false };
}

function locationAdjustment(
  location: string | null,
  arrangement: SalaryPresentationInput["workArrangement"],
): LocationAdjustment {
  const normalized = normalize(location);
  if (arrangement === "remote" || includesPhrase(normalized, "remote")) {
    return {
      factor: 1,
      label: "national benchmark (remote role; no local premium assumed)",
      explicit: true,
    };
  }
  if (!normalized || normalized === "united states" || normalized === "us") {
    return { factor: 1, label: "national benchmark", explicit: false };
  }
  if (HIGH_COST_MARKETS.some((market) => includesPhrase(normalized, market))) {
    return { factor: 1.12, label: "coarse high-cost-market adjustment (+12%)", explicit: true };
  }
  if (ABOVE_NATIONAL_MARKETS.some((market) => includesPhrase(normalized, market))) {
    return { factor: 1.05, label: "coarse above-national-market adjustment (+5%)", explicit: true };
  }
  if (BELOW_NATIONAL_MARKETS.some((market) => includesPhrase(normalized, market))) {
    return { factor: 0.94, label: "coarse below-national-market adjustment (-6%)", explicit: true };
  }
  return { factor: 1, label: "national benchmark (no reliable local adjustment)", explicit: false };
}

function annualize(cents: number, period: SalaryPresentationInput["salaryPeriod"]) {
  if (period === "hour") return Math.round(cents * 2_080);
  if (period === "month") return Math.round(cents * 12);
  return cents;
}

function roundAnnualCents(cents: number) {
  const dollars = cents / 100;
  return Math.max(100_000, Math.round(dollars / 1_000) * 1_000 * 100);
}

function midpoint(minimum: number, maximum: number) {
  return Math.round((minimum + maximum) / 2);
}

function employerPresentation(input: SalaryPresentationInput): SalaryPresentation | null {
  if (input.salarySource !== "employer_posted") return null;
  const postedAmounts = [input.salaryMinimumCents, input.salaryMaximumCents].filter(
    (value): value is number => value !== null && value > 0,
  );
  if (postedAmounts.length === 0) return null;

  const annualValues = postedAmounts.map((value) => annualize(value, input.salaryPeriod));
  const annualMinimumCents = Math.min(...annualValues);
  const annualMaximumCents = Math.max(...annualValues);
  const completeRange =
    input.salaryMinimumCents !== null && input.salaryMaximumCents !== null;

  return {
    display: formatSalaryRange({
      minimumCents: input.salaryMinimumCents,
      maximumCents: input.salaryMaximumCents,
      currency: input.salaryCurrency,
      period: input.salaryPeriod,
    }),
    source: "employer_posted",
    isEstimate: false,
    confidence: completeRange ? "high" : "medium",
    annualMinimumCents,
    annualMaximumCents,
    annualMidpointCents: midpoint(annualMinimumCents, annualMaximumCents),
    currency: input.salaryCurrency,
    period: input.salaryPeriod,
    disclosure: "Employer-posted base salary",
    method:
      input.salaryPeriod === "year"
        ? "Shown from the employer's posting without a modeled adjustment."
        : `Shown from the employer's posting; annual comparison uses ${input.salaryPeriod === "hour" ? "2,080 hours" : "12 months"}.`,
    benchmarkOccupation: null,
    sourceName: `${input.company} job posting`,
    sourceUrl: input.sourceUrl,
    modelVersion: "employer-posted",
  };
}

/**
 * Produces an always-present compensation presentation while preserving a hard
 * boundary between employer facts and modeled market context. The estimate is
 * display/ranking context only; it must not be written into job revisions or
 * treated as employer-posted compensation by the fit scorer.
 */
export function salaryPresentationForJob(
  input: SalaryPresentationInput,
): SalaryPresentation {
  const employer = employerPresentation(input);
  if (employer) return employer;

  const benchmark = benchmarkForTitle(input.title);
  const seniority = seniorityBand(input.title, input.seniority);
  const location = locationAdjustment(input.location, input.workArrangement);
  const annualMeanCents = benchmark.annualMeanDollars * 100;
  const annualMinimumCents = roundAnnualCents(
    annualMeanCents * seniority.lowerMultiplier * location.factor,
  );
  const annualMaximumCents = Math.max(
    annualMinimumCents,
    roundAnnualCents(
      annualMeanCents * seniority.upperMultiplier * location.factor,
    ),
  );
  const confidence: SalaryConfidence =
    benchmark.specificity === "specific" && seniority.explicit && location.explicit
      ? "medium"
      : "low";

  return {
    display: `Est. ${formatSalaryRange({
      minimumCents: annualMinimumCents,
      maximumCents: annualMaximumCents,
      currency: "USD",
      period: "year",
    })}`,
    source: "market_estimate",
    isEstimate: true,
    confidence,
    annualMinimumCents,
    annualMaximumCents,
    annualMidpointCents: midpoint(annualMinimumCents, annualMaximumCents),
    currency: "USD",
    period: "year",
    disclosure: `Estimated market base pay — not posted by ${input.company}`,
    method: `Modeled from the May 2025 BLS national annual mean for ${benchmark.occupation}; ${seniority.label} band; ${location.label}. The range is directional, excludes bonus/equity, and is not employer-specific.`,
    benchmarkOccupation: benchmark.occupation,
    sourceName: SALARY_BENCHMARK_SOURCE.name,
    sourceUrl: SALARY_BENCHMARK_SOURCE.url,
    modelVersion: SALARY_MODEL_VERSION,
  };
}
