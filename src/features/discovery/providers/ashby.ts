import { z } from "zod";

import type {
  DiscoveryBatch,
  DiscoveryFetchOptions,
  DiscoveryJob,
  DiscoverySalary,
} from "@/features/discovery/types";
import { fetchBoundedJson, resolveDiscoveryLimits } from "@/features/discovery/providers/http";
import {
  inferWorkArrangement,
  normalizeDescription,
  normalizeEmploymentType,
  normalizeSalaryPeriod,
  normalizeTimestamp,
} from "@/features/discovery/providers/normalization";
import {
  parseProviderConfig,
  parseProviderPayload,
  PublicHttpUrlSchema,
} from "@/features/discovery/providers/validation";

const AshbySourceSchema = z
  .object({
    company: z.string().trim().min(1).max(180),
    jobBoardName: z.string().trim().min(1).max(200).regex(/^[a-z\d_-]+$/i),
  })
  .strict();

const AshbyCompensationComponentSchema = z
  .object({
    compensationType: z.string().trim().max(100).nullable().optional(),
    interval: z.string().trim().max(100).nullable().optional(),
    currencyCode: z.string().trim().max(12).nullable().optional(),
    minValue: z.number().finite().nonnegative().nullable().optional(),
    maxValue: z.number().finite().nonnegative().nullable().optional(),
  })
  .passthrough();

const AshbyCompensationSchema = z
  .object({
    compensationTierSummary: z.string().nullish(),
    scrapeableCompensationSalarySummary: z.string().nullish(),
    summaryComponents: z.array(AshbyCompensationComponentSchema).optional(),
  })
  .passthrough();

const AshbyJobSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().min(1).max(500),
    location: z.string().trim().max(500).nullable().optional(),
    isListed: z.boolean().optional().default(true),
    isRemote: z.boolean().nullable().optional(),
    workplaceType: z.string().nullable().optional(),
    descriptionHtml: z.string().optional(),
    descriptionPlain: z.string().optional(),
    publishedAt: z.string().nullable().optional(),
    employmentType: z.string().nullable().optional(),
    jobUrl: PublicHttpUrlSchema,
    applyUrl: PublicHttpUrlSchema,
    compensation: AshbyCompensationSchema.nullable().optional(),
  })
  .passthrough();

const AshbyResponseSchema = z
  .object({
    apiVersion: z.string().optional(),
    jobs: z.array(AshbyJobSchema),
  })
  .passthrough();

export type AshbySource = z.infer<typeof AshbySourceSchema>;

export function ashbyJobsUrl(jobBoardName: string) {
  const url = new URL(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(jobBoardName)}`,
  );
  url.searchParams.set("includeCompensation", "true");
  return url;
}

function externalIdForAshbyJob(job: z.infer<typeof AshbyJobSchema>) {
  if (job.id) return job.id;
  const segments = new URL(job.jobUrl).pathname.split("/").filter(Boolean);
  return segments.at(-1) ?? job.jobUrl;
}

function ashbySalary(job: z.infer<typeof AshbyJobSchema>): DiscoverySalary | null {
  const compensation = job.compensation;
  if (!compensation) return null;
  const salaryComponent = compensation.summaryComponents?.find(
    (component) => component.compensationType?.toLowerCase() === "salary",
  );
  const description = normalizeDescription(
    compensation.scrapeableCompensationSalarySummary ||
      compensation.compensationTierSummary ||
      "",
  );
  if (!salaryComponent && !description) return null;

  return {
    minimumMajorUnits: salaryComponent?.minValue ?? null,
    maximumMajorUnits: salaryComponent?.maxValue ?? null,
    currency: salaryComponent?.currencyCode?.toUpperCase() ?? null,
    period: normalizeSalaryPeriod(salaryComponent?.interval),
    source: "employer_posted",
    description: description || null,
  };
}

export async function fetchAshbyJobs(
  sourceInput: AshbySource,
  options: DiscoveryFetchOptions = {},
): Promise<DiscoveryBatch> {
  const context = {
    provider: "ashby" as const,
    sourceId: String(sourceInput?.jobBoardName ?? "unknown").slice(0, 200),
  };
  const source = parseProviderConfig(AshbySourceSchema, sourceInput, context);
  const limits = resolveDiscoveryLimits(context, options);
  const payload = await fetchBoundedJson({
    context,
    url: ashbyJobsUrl(source.jobBoardName),
    limits,
  });
  const response = parseProviderPayload(AshbyResponseSchema, payload, context);
  const listed = response.jobs.filter((job) => job.isListed);
  const selected = listed.slice(0, limits.maxItems);

  const jobs: DiscoveryJob[] = selected.map((job) => {
    const location = job.location || null;
    return {
      provider: "ashby",
      externalId: externalIdForAshbyJob(job),
      title: job.title,
      company: source.company,
      location,
      descriptionText: normalizeDescription(job.descriptionPlain || job.descriptionHtml || ""),
      jobUrl: job.jobUrl,
      applyUrl: job.applyUrl,
      postedAt: normalizeTimestamp(job.publishedAt),
      updatedAt: null,
      workArrangement: inferWorkArrangement({
        explicit: job.workplaceType,
        isRemote: job.isRemote,
        location,
      }),
      employmentType: normalizeEmploymentType(job.employmentType),
      salary: ashbySalary(job),
    };
  });

  return {
    source: { provider: "ashby", sourceId: source.jobBoardName, company: source.company },
    jobs,
    truncated: listed.length > jobs.length,
    totalReported: listed.length,
  };
}
