import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  candidateProfiles,
  fitScoreRuns,
  jobListings,
  jobRevisions,
  portfolioProjects,
  type ExtractedFieldEvidence,
  type JobSourceType,
  type SalaryPeriod as StoredSalaryPeriod,
} from "@/db/schema";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import { buildFitScoreRun } from "@/features/fit/run-builder";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import type { DeterministicFitResult, Readiness } from "@/features/fit/types";
import { ManualJobInputSchema, type ManualJobInput } from "@/features/jobs/input";
import { parseJobListing } from "@/features/jobs/parser";
import {
  JOB_PARSER_VERSION,
  type EmploymentType,
  type ParsedJobListing,
  type SalaryPeriod,
  type WorkArrangement as ParsedWorkArrangement,
} from "@/features/jobs/types";
import { canonicalizeSourceUrl, hashValue, normalizeIdentity } from "@/lib/hashing";

const PARSE_SCHEMA_VERSION = "parsed-job.v2";

function toStoredSalaryPeriod(period: SalaryPeriod, parsed: ParsedJobListing): StoredSalaryPeriod {
  if (period === "hour" || period === "month" || period === "year") return period;
  const largest = Math.max(parsed.salary.minimumCents ?? 0, parsed.salary.maximumCents ?? 0);
  return largest > 500_000 ? "year" : "hour";
}

function toFieldEvidence(parsed: ParsedJobListing) {
  const fields: Record<string, ExtractedFieldEvidence> = {};
  const register = (field: string, value: unknown) => {
    const evidence = parsed.evidence.find((item) => item.field === field);
    fields[field] = {
      confidence: evidence?.confidence ?? "low",
      evidence: evidence?.excerpt,
      source: "deterministic",
      value,
    };
  };

  register("roleSummary", parsed.roleSummary.value);
  register("workArrangement", parsed.workArrangement.value);
  register("salary", parsed.salary);
  register("employmentType", parsed.employmentType.value);
  register("seniority", parsed.seniority.value);
  register("industry", parsed.industry.value);
  register("applicationDeadline", parsed.applicationDeadline.value);
  return fields;
}

function experienceRequirementText(parsed: ParsedJobListing) {
  return parsed.experienceRequirements.map((requirement) => {
    const range = requirement.maximumYears
      ? `${requirement.minimumYears}–${requirement.maximumYears}`
      : `${requirement.minimumYears}+`;
    return `${range} years${requirement.domain ? ` in ${requirement.domain}` : ""} (${requirement.kind})`;
  });
}

function strongestRequiredExperience(parsed: ParsedJobListing) {
  const required = parsed.experienceRequirements.filter((item) => item.kind === "required");
  if (required.length === 0) return { minimum: null, maximum: null };
  return {
    minimum: Math.max(...required.map((item) => item.minimumYears)),
    maximum: Math.max(...required.map((item) => item.maximumYears ?? item.minimumYears)),
  };
}

function remoteRestrictionText(parsed: ParsedJobListing) {
  return parsed.remoteRestrictions.length > 0
    ? parsed.remoteRestrictions.map((restriction) => restriction.description).join("; ")
    : null;
}

function travelRequirementText(parsed: ParsedJobListing) {
  if (!parsed.travelRequirement) return null;
  return parsed.travelRequirement.percent === null
    ? parsed.travelRequirement.description
    : `${parsed.travelRequirement.percent}% — ${parsed.travelRequirement.description}`;
}

export type StructuredJobSalary = {
  currency: string;
  maximumCents: number | null;
  minimumCents: number | null;
  period: StoredSalaryPeriod;
};

export type SourcedJobInput = {
  company: string;
  contentHash: string;
  deduplicationKey: string;
  descriptionRaw: string;
  employmentType?: EmploymentType | null;
  location?: string | null;
  postedAt?: Date | null;
  salary?: StructuredJobSalary | null;
  salarySourceHint?: "employer_posted" | "externally_estimated" | "unknown";
  sourceName: string;
  sourceType: JobSourceType;
  sourceUrl?: string | null;
  title: string;
  workArrangement?: Exclude<ParsedWorkArrangement, "unknown"> | null;
};

function applyStructuredFacts(
  parsed: ParsedJobListing,
  input: SourcedJobInput,
): ParsedJobListing {
  const salary = input.salary
    ? {
        minimumCents: input.salary.minimumCents,
        maximumCents: input.salary.maximumCents,
        currency: input.salary.currency,
        period: input.salary.period,
        source: "employer_posted" as const,
        confidence: "high" as const,
        evidence: parsed.salary.evidence,
        derived: false,
      }
    : parsed.salary;

  const parsedArrangement = parsed.workArrangement.value;
  const structuredArrangement = input.workArrangement;
  const arrangementPriority: Record<Exclude<ParsedWorkArrangement, "unknown">, number> = {
    remote: 0,
    hybrid: 1,
    on_site: 2,
  };
  const arrangementConflict = Boolean(
    structuredArrangement &&
      parsedArrangement &&
      parsedArrangement !== "unknown" &&
      structuredArrangement !== parsedArrangement,
  );
  const resolvedArrangement = structuredArrangement
    ? parsedArrangement && parsedArrangement !== "unknown"
      ? arrangementPriority[parsedArrangement] >= arrangementPriority[structuredArrangement]
        ? parsedArrangement
        : structuredArrangement
      : structuredArrangement
    : parsedArrangement;
  const warnings = parsed.warnings.filter(
    (warning) => !(input.salary && /No reliable base salary was found/i.test(warning)),
  );
  if (arrangementConflict) {
    warnings.push(
      "Remote and office-attendance signals conflict; the more restrictive arrangement was used.",
    );
  }

  return {
    ...parsed,
    warnings: [...new Set(warnings)],
    salary,
    employmentType: input.employmentType
      ? {
          ...parsed.employmentType,
          value: input.employmentType,
          confidence: "high",
        }
      : parsed.employmentType,
    workArrangement: resolvedArrangement && resolvedArrangement !== "unknown"
      ? {
          ...parsed.workArrangement,
          value: resolvedArrangement,
          confidence: arrangementConflict
            ? (parsed.workArrangement.confidence ?? "medium")
            : "high",
        }
      : parsed.workArrangement,
  };
}

export type SourcedJobResult = {
  changed: boolean;
  created: boolean;
  fitResult: DeterministicFitResult;
  jobId: string;
  parsed: ParsedJobListing;
  revisionId: string;
};

export async function upsertSourcedJob(input: SourcedJobInput): Promise<SourcedJobResult> {
  const sourceUrl = canonicalizeSourceUrl(input.sourceUrl || null);
  const parsed = applyStructuredFacts(
    parseJobListing({
      title: input.title,
      company: input.company,
      descriptionRaw: input.descriptionRaw,
      location: input.location || null,
      salarySourceHint: input.salarySourceHint ?? "unknown",
      retrievedAt: new Date().toISOString(),
    }),
    input,
  );
  const normalizedTitle = normalizeIdentity(input.title);
  const normalizedCompany = normalizeIdentity(input.company);
  const normalizedLocation = input.location ? normalizeIdentity(input.location) : null;
  await ensureDatabaseReady();

  return withDatabaseWriteRetry(() => db.transaction(async (transaction) => {
    const [profile] = await transaction
      .select()
      .from(candidateProfiles)
      .where(
        and(
          eq(candidateProfiles.visitorId, OWNER_VISITOR_ID),
          eq(candidateProfiles.isActive, true),
        ),
      )
      .limit(1);
    if (!profile) {
      throw new Error(
        "No active candidate profile exists. Run `npm run db:seed` to create the local profile.",
      );
    }
    const projects = await transaction
      .select()
      .from(portfolioProjects)
      .where(eq(portfolioProjects.candidateProfileId, profile.id))
      .orderBy(asc(portfolioProjects.name));
    const scoreRevision = async (revisionId: string) => {
      const scoring = buildFitScoreRun({
        contentHash: input.contentHash,
        job: parsed,
        jobRevisionId: revisionId,
        profile,
        projects,
      });
      await transaction
        .insert(fitScoreRuns)
        .values({ jobRevisionId: revisionId, ...scoring.values })
        .onConflictDoNothing();
      return scoring.fitResult;
    };

    const [existing] = await transaction
      .select()
      .from(jobListings)
      .where(eq(jobListings.deduplicationKey, input.deduplicationKey))
      .limit(1);

    let listingId: string;
    let revisionNumber = 1;
    let created = false;
    if (existing) {
      listingId = existing.id;
      const [latestRevision] = await transaction
        .select()
        .from(jobRevisions)
        .where(eq(jobRevisions.jobListingId, listingId))
        .orderBy(desc(jobRevisions.revisionNumber))
        .limit(1);
      if (latestRevision?.contentHash === input.contentHash) {
        await transaction
          .update(jobListings)
          .set({ lifecycleStatus: "active", updatedAt: new Date() })
          .where(eq(jobListings.id, listingId));
        const fitResult = await scoreRevision(latestRevision.id);
        return {
          changed: false,
          created: false,
          fitResult,
          jobId: listingId,
          parsed,
          revisionId: latestRevision.id,
        };
      }
      revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;
    } else {
      const [listing] = await transaction
        .insert(jobListings)
        .values({
          normalizedTitle,
          normalizedCompany,
          normalizedLocation,
          deduplicationKey: input.deduplicationKey,
        })
        .returning();
      listingId = listing.id;
      created = true;
    }

    const requiredExperience = strongestRequiredExperience(parsed);
    const [revision] = await transaction
      .insert(jobRevisions)
      .values({
        jobListingId: listingId,
        revisionNumber,
        sourceType: input.sourceType,
        sourceName: input.sourceName,
        sourceUrl,
        rawDescription: input.descriptionRaw,
        cleanedDescription: parsed.descriptionClean,
        contentHash: input.contentHash,
        parserVersion: parsed.parserVersion,
        parseSchemaVersion: PARSE_SCHEMA_VERSION,
        parseWarnings: parsed.warnings,
        fieldEvidence: toFieldEvidence(parsed),
        title: parsed.title,
        company: parsed.company,
        location: parsed.location,
        workArrangement:
          parsed.workArrangement.value === "unknown"
            ? "unclear"
            : (parsed.workArrangement.value ?? "unclear"),
        salaryMinimumCents: parsed.salary.minimumCents,
        salaryMaximumCents: parsed.salary.maximumCents,
        salaryCurrency: parsed.salary.currency ?? "USD",
        salaryPeriod: toStoredSalaryPeriod(parsed.salary.period, parsed),
        salarySource:
          parsed.salary.source === "externally_estimated"
            ? "external_estimate"
            : parsed.salary.source,
        employmentType:
          parsed.employmentType.value === "unknown" ? null : parsed.employmentType.value,
        roleSummary: parsed.roleSummary.value,
        remoteRestriction: remoteRestrictionText(parsed),
        postedAt: input.postedAt ?? null,
        applicationDeadline: parsed.applicationDeadline.value
          ? new Date(parsed.applicationDeadline.value)
          : null,
        seniority: parsed.seniority.value === "unknown" ? null : parsed.seniority.value,
        yearsExperienceMinimum: requiredExperience.minimum,
        yearsExperienceMaximum: requiredExperience.maximum,
        experienceRequirements: experienceRequirementText(parsed),
        technologies: [...new Set(parsed.technologies.map((technology) => technology.name))],
        responsibilities: parsed.responsibilities,
        requiredQualifications: parsed.requiredQualifications.map((item) => item.text),
        preferredQualifications: parsed.preferredQualifications.map((item) => item.text),
        travelRequirement: travelRequirementText(parsed),
        industry: parsed.industry.value,
      })
      .returning();

    await transaction
      .update(jobListings)
      .set({
        currentRevisionId: revision.id,
        lifecycleStatus: "active",
        normalizedTitle,
        normalizedCompany,
        normalizedLocation,
        updatedAt: new Date(),
      })
      .where(eq(jobListings.id, listingId));

    const fitResult = await scoreRevision(revision.id);

    return {
      changed: !created,
      created,
      fitResult,
      jobId: listingId,
      parsed,
      revisionId: revision.id,
    };
  }));
}

export async function createManualJob(rawInput: ManualJobInput) {
  const input = ManualJobInputSchema.parse(rawInput);
  const sourceUrl = canonicalizeSourceUrl(input.sourceUrl || null);
  const contentHash = hashValue({
    descriptionRaw: input.descriptionRaw,
    parserVersion: JOB_PARSER_VERSION,
    scoringVersion: FIT_SCORING_VERSION,
  });
  const normalizedTitle = normalizeIdentity(input.title);
  const normalizedCompany = normalizeIdentity(input.company);
  const normalizedLocation = input.location ? normalizeIdentity(input.location) : null;
  const deduplicationKey = hashValue(
    sourceUrl
      ? { sourceUrl }
      : { title: normalizedTitle, company: normalizedCompany, location: normalizedLocation },
  );

  return upsertSourcedJob({
    company: input.company,
    contentHash,
    deduplicationKey,
    descriptionRaw: input.descriptionRaw,
    location: input.location || null,
    salarySourceHint: input.salarySource,
    sourceName: input.sourceName || "Manual paste",
    sourceType: sourceUrl ? "manual_url" : "manual_paste",
    sourceUrl,
    title: input.title,
  });
}

export function readinessLabel(readiness: Readiness | null) {
  if (readiness === "ready_now") return "Ready Now" as const;
  if (readiness === "ready_with_positioning") return "Ready With Positioning" as const;
  if (readiness === "ready_after_skill_sprint") return "Ready After Skill Sprint" as const;
  if (readiness === "not_yet_efficient") return "Not Yet Efficient" as const;
  return "Not enough information" as const;
}
