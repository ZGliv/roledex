export type InsightWorkArrangement = "remote" | "hybrid" | "on_site" | "unclear";

export type InsightSalaryPeriod = "year" | "month" | "hour";

export type InsightSalarySource =
  | "employer_posted"
  | "external_estimate"
  | "unknown";

export type MarketInsightJobInput = {
  company: string;
  fitCoveragePercent: number | null;
  fitScore: number | null;
  salaryCurrency: string;
  salaryMaximumCents: number | null;
  salaryMinimumCents: number | null;
  salaryPeriod: InsightSalaryPeriod;
  salarySource: InsightSalarySource;
  technologies: readonly string[];
  workArrangement: InsightWorkArrangement;
};

export type CountedInsight = {
  count: number;
  label: string;
  percentage: number;
};

export type FitBandInsight = CountedInsight & {
  key: "high" | "promising" | "stretch" | "low";
  range: string;
};

export type TechnologyInsight = CountedInsight & {
  isCandidateSkill: boolean;
};

export type SkillSprintInsight = {
  evidenceCount: number;
  evidencePercentage: number;
  rationale: string;
  skill: string;
  steps: readonly string[];
};

export type MarketInsights = {
  companies: readonly CountedInsight[];
  fit: {
    averageCoveragePercent: number | null;
    averageScore: number | null;
    bands: readonly FitBandInsight[];
    medianScore: number | null;
    scoredCount: number;
  };
  profileSkillCount: number;
  recommendedSprint: SkillSprintInsight | null;
  salary: {
    comparableAnnualUsdCount: number;
    completeAnnualRangeCount: number;
    employerPostedCount: number;
    estimatedCount: number;
    knownCount: number;
    knownPercentage: number;
    medianAnnualMidpointCents: number | null;
    observedHighestCeilingCents: number | null;
    observedLowestFloorCents: number | null;
    unknownSourceCount: number;
  };
  sampleSize: number;
  skillGaps: readonly TechnologyInsight[];
  technologies: readonly TechnologyInsight[];
  workArrangements: readonly (CountedInsight & {
    key: InsightWorkArrangement;
  })[];
};

const FIT_BANDS = [
  { key: "high", label: "High fit", minimum: 75, range: "7.5–10" },
  { key: "promising", label: "Promising", minimum: 60, range: "6.0–7.4" },
  { key: "stretch", label: "Stretch", minimum: 45, range: "4.5–5.9" },
  { key: "low", label: "Low fit", minimum: 0, range: "0–4.4" },
] as const;

const WORK_ARRANGEMENTS = [
  { key: "remote", label: "Remote" },
  { key: "hybrid", label: "Hybrid" },
  { key: "on_site", label: "On-site" },
  { key: "unclear", label: "Unclear" },
] as const;

const SKILL_ALIASES: Readonly<Record<string, string>> = {
  "amazon web services": "aws",
  "aws cloud": "aws",
  "gcp cloud": "gcp",
  "git github": "github",
  "google cloud platform": "gcp",
  javascript: "javascript",
  js: "javascript",
  "large language model": "llm",
  "large language models": "llm",
  llms: "llm",
  "node js": "node.js",
  nodejs: "node.js",
  postgres: "postgresql",
  "react js": "react",
  reactjs: "react",
  "rest api": "rest apis",
  typescript: "typescript",
  ts: "typescript",
};

const SKILL_LABELS: Readonly<Record<string, string>> = {
  aws: "AWS",
  azure: "Azure",
  figma: "Figma",
  gcp: "GCP",
  github: "GitHub",
  javascript: "JavaScript",
  llm: "LLMs",
  "node.js": "Node.js",
  postgresql: "PostgreSQL",
  python: "Python",
  react: "React",
  "rest apis": "REST APIs",
  salesforce: "Salesforce",
  sql: "SQL",
  typescript: "TypeScript",
};

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function percentage(count: number, total: number) {
  return total === 0 ? 0 : roundToOne((count / total) * 100);
}

function average(values: readonly number[]) {
  if (values.length === 0) return null;
  return roundToOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function median(values: readonly number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return roundToOne(value);
}

function normalizeSkill(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SKILL_ALIASES[normalized] ?? normalized;
}

function skillLabel(key: string, candidates: readonly string[]) {
  const configured = SKILL_LABELS[key];
  if (configured) return configured;
  return [...candidates]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }))[0] ?? key;
}

function normalizedCandidateSkills(skills: readonly string[]) {
  const normalized = new Set<string>();
  for (const skill of skills) {
    const fullSkill = normalizeSkill(skill);
    if (fullSkill) normalized.add(fullSkill);

    for (const segment of skill.split(/[\/;,]/)) {
      const segmentSkill = normalizeSkill(segment);
      if (segmentSkill) normalized.add(segmentSkill);
    }
  }
  return normalized;
}

function countLabels(values: readonly string[], total: number, limit: number) {
  const counts = new Map<string, number>();
  for (const rawValue of values) {
    const label = rawValue.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label, percentage: percentage(count, total) }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function countTechnologies(
  jobs: readonly MarketInsightJobInput[],
  candidateSkills: ReadonlySet<string>,
) {
  const counts = new Map<string, { count: number; labels: Set<string> }>();

  for (const job of jobs) {
    const uniqueForJob = new Map<string, string>();
    for (const technology of job.technologies) {
      const key = normalizeSkill(technology);
      if (key && !uniqueForJob.has(key)) uniqueForJob.set(key, technology);
    }

    for (const [key, label] of uniqueForJob) {
      const current = counts.get(key) ?? { count: 0, labels: new Set<string>() };
      current.count += 1;
      current.labels.add(label);
      counts.set(key, current);
    }
  }

  return [...counts.entries()]
    .map(([key, value]): TechnologyInsight => ({
      count: value.count,
      isCandidateSkill: candidateSkills.has(key),
      label: skillLabel(key, [...value.labels]),
      percentage: percentage(value.count, jobs.length),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function aggregateMarketInsights(input: {
  candidateSkills: readonly string[];
  jobs: readonly MarketInsightJobInput[];
}): MarketInsights {
  const { jobs } = input;
  const sampleSize = jobs.length;
  const candidateSkills = normalizedCandidateSkills(input.candidateSkills);
  const profileSkillCount = new Set(
    input.candidateSkills
      .map((skill) => skill.trim().toLocaleLowerCase("en-US"))
      .filter(Boolean),
  ).size;
  const scoredJobs = jobs.filter(
    (job): job is MarketInsightJobInput & { fitScore: number } =>
      typeof job.fitScore === "number" && Number.isFinite(job.fitScore),
  );
  const scoreValues = scoredJobs.map((job) => job.fitScore);
  const coverageValues = scoredJobs
    .map((job) => job.fitCoveragePercent)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const fitBands = FIT_BANDS.map((band) => {
    const count = scoreValues.filter((score) => {
      if (band.key === "high") return score >= band.minimum;
      const previousBand = FIT_BANDS[FIT_BANDS.findIndex((item) => item.key === band.key) - 1];
      return score >= band.minimum && score < previousBand.minimum;
    }).length;
    return {
      count,
      key: band.key,
      label: band.label,
      percentage: percentage(count, scoredJobs.length),
      range: band.range,
    };
  });

  const workArrangements = WORK_ARRANGEMENTS.map(({ key, label }) => {
    const count = jobs.filter((job) => job.workArrangement === key).length;
    return { count, key, label, percentage: percentage(count, sampleSize) };
  });

  const salaryKnown = jobs.filter(
    (job) => job.salaryMinimumCents !== null || job.salaryMaximumCents !== null,
  );
  const comparableAnnualUsd = salaryKnown.filter(
    (job) => job.salaryPeriod === "year" && job.salaryCurrency.toUpperCase() === "USD",
  );
  const completeAnnualRanges = comparableAnnualUsd.filter(
    (job): job is MarketInsightJobInput & {
      salaryMaximumCents: number;
      salaryMinimumCents: number;
    } => job.salaryMinimumCents !== null && job.salaryMaximumCents !== null,
  );
  const annualFloors = comparableAnnualUsd
    .map((job) => job.salaryMinimumCents)
    .filter((value): value is number => value !== null);
  const annualCeilings = comparableAnnualUsd
    .map((job) => job.salaryMaximumCents)
    .filter((value): value is number => value !== null);
  const annualMidpoints = completeAnnualRanges.map(
    (job) => (job.salaryMinimumCents + job.salaryMaximumCents) / 2,
  );

  const technologyCounts = countTechnologies(jobs, candidateSkills);
  const skillGaps = technologyCounts
    .filter((technology) => !technology.isCandidateSkill && technology.count >= 2)
    .slice(0, 8);
  const sprintGap = skillGaps[0] ?? null;

  return {
    companies: countLabels(
      jobs.map((job) => job.company),
      sampleSize,
      8,
    ),
    fit: {
      averageCoveragePercent: average(coverageValues),
      averageScore: average(scoreValues),
      bands: fitBands,
      medianScore: median(scoreValues),
      scoredCount: scoredJobs.length,
    },
    profileSkillCount,
    recommendedSprint: sprintGap
      ? {
          evidenceCount: sprintGap.count,
          evidencePercentage: sprintGap.percentage,
          rationale: `${sprintGap.label} appears in ${sprintGap.count} of ${sampleSize} active roles and is not listed in the active candidate profile.`,
          skill: sprintGap.label,
          steps: [
            `Learn the core vocabulary and common workflows for ${sprintGap.label}.`,
            `Build one small, explainable artifact that uses ${sprintGap.label}.`,
            `Re-read the ${sprintGap.count} matching listings and write a truthful portfolio talking point.`,
          ],
        }
      : null,
    salary: {
      comparableAnnualUsdCount: comparableAnnualUsd.length,
      completeAnnualRangeCount: completeAnnualRanges.length,
      employerPostedCount: salaryKnown.filter((job) => job.salarySource === "employer_posted").length,
      estimatedCount: salaryKnown.filter((job) => job.salarySource === "external_estimate").length,
      knownCount: salaryKnown.length,
      knownPercentage: percentage(salaryKnown.length, sampleSize),
      medianAnnualMidpointCents:
        annualMidpoints.length > 0 ? Math.round(median(annualMidpoints) as number) : null,
      observedHighestCeilingCents:
        annualCeilings.length > 0 ? Math.max(...annualCeilings) : null,
      observedLowestFloorCents:
        annualFloors.length > 0 ? Math.min(...annualFloors) : null,
      unknownSourceCount: salaryKnown.filter((job) => job.salarySource === "unknown").length,
    },
    sampleSize,
    skillGaps,
    technologies: technologyCounts.slice(0, 10),
    workArrangements,
  };
}
