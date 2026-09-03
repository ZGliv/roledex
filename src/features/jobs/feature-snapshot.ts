import type { ExtractedFieldEvidence, JobRevision } from "@/db/schema";
import { ROLE_FAMILY_TAXONOMY } from "@/features/fit/scoring-config";
import { hashValue } from "@/lib/hashing";

export const JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION =
  "job-feature-snapshot.v1" as const;
export const JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION =
  "deterministic-catalog-v1" as const;

export type JobFeatureEvidenceConfidence = "low" | "medium" | "high";

/**
 * Candidate-independent facts extracted once for an immutable job revision.
 * This is deliberately separate from user fit, preference, and feed tier.
 */
export interface JobFeatureSnapshot {
  version: 1;
  roleFamilies: readonly { family: string; probability: number }[];
  responsibilities: readonly string[];
  requiredSkills: readonly string[];
  preferredSkills: readonly string[];
  experience: {
    minimumYears: number | null;
    maximumYears: number | null;
    seniority: string | null;
  };
  compensation: {
    annualMinimumCents: number | null;
    annualMaximumCents: number | null;
    currency: string;
    source: "employer_posted" | "externally_estimated" | "unknown";
    confidence: JobFeatureEvidenceConfidence;
  };
  workplace: {
    location: string;
    mode: "remote" | "hybrid" | "on_site" | "unclear";
    employmentType: string;
    authorization: string | null;
    sponsorship: string | null;
    travelPercent: number | null;
  };
  company: {
    name: string;
    industry: string | null;
  };
  freshness: {
    postedAt: string | null;
    retrievedAt: string | null;
    isDuplicate: boolean;
  };
  extractionConfidence: JobFeatureEvidenceConfidence;
}

export interface JobFeatureSnapshotInsertValues {
  jobRevisionId: string;
  schemaVersion: typeof JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION;
  extractorVersion: typeof JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION;
  inputHash: string;
  snapshot: JobFeatureSnapshot;
}

type SnapshotRevision = Pick<
  JobRevision,
  | "id"
  | "contentHash"
  | "title"
  | "company"
  | "location"
  | "workArrangement"
  | "salaryMinimumCents"
  | "salaryMaximumCents"
  | "salaryCurrency"
  | "salaryPeriod"
  | "salarySource"
  | "employmentType"
  | "roleSummary"
  | "postedAt"
  | "retrievedAt"
  | "seniority"
  | "yearsExperienceMinimum"
  | "yearsExperienceMaximum"
  | "technologies"
  | "responsibilities"
  | "requiredQualifications"
  | "preferredQualifications"
  | "travelRequirement"
  | "industry"
  | "cleanedDescription"
  | "parseWarnings"
  | "fieldEvidence"
>;

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

function normalizedTokens(value: string) {
  return normalize(value).split(" ").filter((token) => token.length >= 2);
}

function phrasePresent(value: string, phrase: string) {
  const normalizedValue = normalize(value);
  const normalizedPhrase = normalize(phrase);
  return Boolean(
    normalizedValue &&
      normalizedPhrase &&
      ` ${normalizedValue} `.includes(` ${normalizedPhrase} `),
  );
}

function tokenOverlap(left: string, right: string) {
  const leftTokens = [...new Set(normalizedTokens(left))];
  const rightTokens = new Set(normalizedTokens(right));
  if (leftTokens.length === 0 || rightTokens.size === 0) return 0;
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
  return overlap / Math.max(leftTokens.length, rightTokens.size);
}

function roundProbability(value: number) {
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

function roleFamilyProbabilities(revision: SnapshotRevision) {
  const body = [
    revision.roleSummary ?? "",
    ...revision.responsibilities,
    ...revision.requiredQualifications,
    ...revision.preferredQualifications,
  ].join(" ");

  return Object.entries(ROLE_FAMILY_TAXONOMY)
    .flatMap(([family, aliases]) => {
      let probability = 0;
      for (const alias of aliases) {
        if (phrasePresent(revision.title, alias)) {
          probability = Math.max(probability, 0.96);
          continue;
        }
        const overlap = tokenOverlap(revision.title, alias);
        if (overlap >= 0.5) {
          probability = Math.max(probability, 0.58 + overlap * 0.3);
        }
        if (phrasePresent(body, alias)) {
          probability = Math.max(probability, 0.72);
        }
      }
      return probability > 0
        ? [{ family, probability: roundProbability(probability) }]
        : [];
    })
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.family.localeCompare(right.family),
    );
}

function cleanList(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function annualMultiplier(period: SnapshotRevision["salaryPeriod"]) {
  if (period === "hour") return 2_080;
  if (period === "month") return 12;
  return 1;
}

function annualize(
  value: number | null,
  period: SnapshotRevision["salaryPeriod"],
) {
  return value === null ? null : Math.round(value * annualMultiplier(period));
}

function fieldConfidence(
  evidence: Record<string, ExtractedFieldEvidence>,
  field: string,
): JobFeatureEvidenceConfidence | null {
  const confidence = evidence[field]?.confidence;
  return confidence === "high" || confidence === "medium" || confidence === "low"
    ? confidence
    : null;
}

function salaryConfidence(
  revision: SnapshotRevision,
): JobFeatureEvidenceConfidence {
  const recorded = fieldConfidence(revision.fieldEvidence, "salary");
  if (recorded) return recorded;
  if (
    revision.salarySource === "employer_posted" &&
    (revision.salaryMinimumCents !== null || revision.salaryMaximumCents !== null)
  ) {
    return "high";
  }
  if (revision.salarySource === "external_estimate") return "medium";
  return "low";
}

function extractionConfidence(
  revision: SnapshotRevision,
): JobFeatureEvidenceConfidence {
  const evidenceScores = Object.values(revision.fieldEvidence).map((item) =>
    item.confidence === "high" ? 1 : item.confidence === "medium" ? 0.65 : 0.3,
  );
  const evidenceMean =
    evidenceScores.length > 0
      ? evidenceScores.reduce((sum, score) => sum + score, 0) /
        evidenceScores.length
      : 0.3;
  const factSignals = [
    Boolean(revision.title && revision.company),
    Boolean(
      revision.roleSummary ||
        revision.responsibilities.length > 0 ||
        revision.requiredQualifications.length > 0,
    ),
    Boolean(revision.location || revision.workArrangement !== "unclear"),
    Boolean(
      revision.salaryMinimumCents !== null ||
        revision.salaryMaximumCents !== null,
    ),
    Boolean(
      revision.seniority || revision.yearsExperienceMinimum !== null,
    ),
  ];
  const factCoverage =
    factSignals.filter(Boolean).length / Math.max(1, factSignals.length);
  const warningPenalty = Math.min(0.25, revision.parseWarnings.length * 0.04);
  const score = evidenceMean * 0.45 + factCoverage * 0.55 - warningPenalty;
  if (score >= 0.76) return "high";
  if (score >= 0.46) return "medium";
  return "low";
}

function travelPercent(value: string | null) {
  if (!value) return null;
  const match = /\b(100|[1-9]?\d)\s*%/.exec(value);
  return match ? Number(match[1]) : null;
}

function eligibilityFacts(revision: SnapshotRevision) {
  const text = [
    revision.cleanedDescription ?? "",
    ...revision.requiredQualifications,
  ].join(" ");
  let authorization: string | null = null;
  let sponsorship: string | null = null;

  if (
    /\b(?:u\.?s\.?\s+citizen(?:ship)?|united states citizen(?:ship)?)\b/i.test(
      text,
    )
  ) {
    authorization = "us_citizenship_required";
  } else if (
    /\b(?:authorized|authorization|eligible)\s+to\s+work\s+in\s+(?:the\s+)?(?:u\.?s\.?|united states)\b|\bwork authorization required\b/i.test(
      text,
    )
  ) {
    authorization = "us_work_authorization_required";
  }

  if (
    /\b(?:no|without)\s+(?:visa\s+)?sponsorship\b|\b(?:cannot|can't|unable to|will not|won't)\s+sponsor\b/i.test(
      text,
    )
  ) {
    sponsorship = "not_available";
  } else if (
    /\b(?:visa\s+)?sponsorship\s+(?:is\s+)?(?:available|provided|offered)\b|\b(?:can|will)\s+sponsor\b/i.test(
      text,
    )
  ) {
    sponsorship = "available";
  }

  return { authorization, sponsorship };
}

export function normalizeJobFeatureSnapshot(
  revision: SnapshotRevision,
  options: { isDuplicate?: boolean } = {},
): JobFeatureSnapshot {
  const eligibility = eligibilityFacts(revision);
  return {
    version: 1,
    roleFamilies: roleFamilyProbabilities(revision),
    responsibilities: cleanList(revision.responsibilities),
    requiredSkills: cleanList(revision.requiredQualifications),
    preferredSkills: cleanList(revision.preferredQualifications),
    experience: {
      minimumYears: revision.yearsExperienceMinimum,
      maximumYears: revision.yearsExperienceMaximum,
      seniority: revision.seniority,
    },
    compensation: {
      annualMinimumCents: annualize(
        revision.salaryMinimumCents,
        revision.salaryPeriod,
      ),
      annualMaximumCents: annualize(
        revision.salaryMaximumCents,
        revision.salaryPeriod,
      ),
      currency: revision.salaryCurrency,
      source:
        revision.salarySource === "external_estimate"
          ? "externally_estimated"
          : revision.salarySource,
      confidence: salaryConfidence(revision),
    },
    workplace: {
      location: revision.location ?? "Location not listed",
      mode: revision.workArrangement,
      employmentType: revision.employmentType ?? "unknown",
      authorization: eligibility.authorization,
      sponsorship: eligibility.sponsorship,
      travelPercent: travelPercent(revision.travelRequirement),
    },
    company: {
      name: revision.company,
      industry: revision.industry,
    },
    freshness: {
      postedAt: revision.postedAt?.toISOString() ?? null,
      retrievedAt: revision.retrievedAt?.toISOString() ?? null,
      // A JobListing is the canonical survivor of ingestion deduplication.
      isDuplicate: options.isDuplicate ?? false,
    },
    extractionConfidence: extractionConfidence(revision),
  };
}

export function jobFeatureSnapshotInsertValues(
  revision: SnapshotRevision,
  options: { isDuplicate?: boolean } = {},
): JobFeatureSnapshotInsertValues {
  const snapshot = normalizeJobFeatureSnapshot(revision, options);
  return {
    jobRevisionId: revision.id,
    schemaVersion: JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
    extractorVersion: JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
    inputHash: hashValue({
      contentHash: revision.contentHash,
      extractorVersion: JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
      schemaVersion: JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
      snapshot,
    }),
    snapshot,
  };
}

export function isCurrentJobFeatureSnapshotVersion(input: {
  extractorVersion: string;
  schemaVersion: string;
}) {
  return (
    input.schemaVersion === JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION &&
    input.extractorVersion === JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION
  );
}
