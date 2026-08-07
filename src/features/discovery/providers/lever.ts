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
} from "@/features/discovery/providers/normalization";
import {
  parseProviderConfig,
  parseProviderPayload,
  PublicHttpUrlSchema,
} from "@/features/discovery/providers/validation";

const LeverSourceSchema = z
  .object({
    company: z.string().trim().min(1).max(180),
    site: z.string().trim().min(1).max(200).regex(/^[a-z\d_-]+$/i),
    instance: z.enum(["global", "eu"]).optional().default("global"),
  })
  .strict();

const LeverSalarySchema = z
  .object({
    currency: z.string().trim().min(1).max(12).nullable().optional(),
    interval: z.string().trim().max(100).nullable().optional(),
    min: z.number().finite().nonnegative().nullable().optional(),
    max: z.number().finite().nonnegative().nullable().optional(),
  })
  .passthrough();

const LeverJobSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(500),
    categories: z
      .object({
        location: z.string().trim().max(500).nullable().optional(),
        commitment: z.string().trim().max(200).nullable().optional(),
        allLocations: z.array(z.string().trim().max(500)).optional(),
      })
      .passthrough()
      .optional(),
    description: z.string().optional(),
    descriptionPlain: z.string().optional(),
    lists: z
      .array(
        z
          .object({
            text: z.string().optional(),
            content: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    additional: z.string().optional(),
    additionalPlain: z.string().optional(),
    hostedUrl: PublicHttpUrlSchema,
    applyUrl: PublicHttpUrlSchema,
    workplaceType: z.string().nullable().optional(),
    salaryRange: LeverSalarySchema.nullable().optional(),
    salaryDescription: z.string().optional(),
    salaryDescriptionPlain: z.string().optional(),
  })
  .passthrough();

const LeverResponseSchema = z.array(LeverJobSchema);

export type LeverSource = z.input<typeof LeverSourceSchema>;

export function leverJobsUrl(source: z.output<typeof LeverSourceSchema>, maxItems: number) {
  const host = source.instance === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const url = new URL(`https://${host}/v0/postings/${encodeURIComponent(source.site)}`);
  url.searchParams.set("mode", "json");
  url.searchParams.set("limit", String(maxItems));
  return url;
}

function combineLeverDescription(job: z.infer<typeof LeverJobSchema>) {
  const primary = job.descriptionPlain || job.description || "";
  const listText = (job.lists ?? [])
    .map((list) => [list.text, list.content].filter(Boolean).join("\n"))
    .join("\n");
  const closing = job.additionalPlain || job.additional || "";
  return normalizeDescription([primary, listText, closing].filter(Boolean).join("\n"));
}

function leverSalary(job: z.infer<typeof LeverJobSchema>): DiscoverySalary | null {
  const range = job.salaryRange;
  if (!range) return null;
  const minimum = range.min ?? null;
  const maximum = range.max ?? null;
  const description = normalizeDescription(
    job.salaryDescriptionPlain || job.salaryDescription || "",
  );
  if (minimum === null && maximum === null && !description) return null;

  return {
    minimumMajorUnits: minimum,
    maximumMajorUnits: maximum,
    currency: range.currency?.toUpperCase() ?? null,
    period: normalizeSalaryPeriod(range.interval),
    source: "employer_posted",
    description: description || null,
  };
}

export async function fetchLeverJobs(
  sourceInput: LeverSource,
  options: DiscoveryFetchOptions = {},
): Promise<DiscoveryBatch> {
  const rawInstance = sourceInput?.instance ?? "global";
  const rawSite = String(sourceInput?.site ?? "unknown").slice(0, 200);
  const context = {
    provider: "lever" as const,
    sourceId: `${rawInstance === "eu" ? "eu:" : ""}${rawSite}`,
  };
  const source = parseProviderConfig(LeverSourceSchema, sourceInput, context);
  const limits = resolveDiscoveryLimits(context, options);
  const payload = await fetchBoundedJson({
    context,
    url: leverJobsUrl(source, limits.maxItems),
    limits,
  });
  const response = parseProviderPayload(LeverResponseSchema, payload, context);
  const selected = response.slice(0, limits.maxItems);

  const jobs: DiscoveryJob[] = selected.map((job) => {
    const location = job.categories?.location || null;
    return {
      provider: "lever",
      externalId: job.id,
      title: job.text,
      company: source.company,
      location,
      descriptionText: combineLeverDescription(job),
      jobUrl: job.hostedUrl,
      applyUrl: job.applyUrl,
      // The public Lever list schema does not expose a publication timestamp.
      postedAt: null,
      updatedAt: null,
      workArrangement: inferWorkArrangement({
        explicit: job.workplaceType,
        location,
      }),
      employmentType: normalizeEmploymentType(job.categories?.commitment),
      salary: leverSalary(job),
    };
  });

  return {
    source: { provider: "lever", sourceId: context.sourceId, company: source.company },
    jobs,
    truncated: response.length > jobs.length,
    // Lever applies the requested limit without returning a total count.
    totalReported: null,
  };
}
