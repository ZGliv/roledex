import { z } from "zod";

import type {
  DiscoveryBatch,
  DiscoveryFetchOptions,
  DiscoveryJob,
} from "@/features/discovery/types";
import { fetchBoundedJson, resolveDiscoveryLimits } from "@/features/discovery/providers/http";
import {
  inferWorkArrangement,
  normalizeDescription,
  normalizeTimestamp,
} from "@/features/discovery/providers/normalization";
import {
  parseProviderConfig,
  parseProviderPayload,
  PublicHttpUrlSchema,
} from "@/features/discovery/providers/validation";

const GreenhouseSourceSchema = z
  .object({
    company: z.string().trim().min(1).max(180),
    boardToken: z.string().trim().min(1).max(200).regex(/^[a-z\d_-]+$/i),
  })
  .strict();

const GreenhouseJobSchema = z
  .object({
    id: z.union([z.number().int().nonnegative(), z.string().min(1).max(200)]),
    title: z.string().trim().min(1).max(500),
    updated_at: z.string().nullable().optional(),
    first_published: z.string().nullable().optional(),
    location: z
      .object({ name: z.string().trim().max(500).nullable().optional() })
      .nullable()
      .optional(),
    absolute_url: PublicHttpUrlSchema,
    content: z.string().optional().default(""),
  })
  .passthrough();

const GreenhouseResponseSchema = z
  .object({
    jobs: z.array(GreenhouseJobSchema),
    meta: z
      .object({ total: z.number().int().nonnegative().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type GreenhouseSource = z.infer<typeof GreenhouseSourceSchema>;

export function greenhouseJobsUrl(boardToken: string) {
  const url = new URL(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`,
  );
  url.searchParams.set("content", "true");
  return url;
}

export async function fetchGreenhouseJobs(
  sourceInput: GreenhouseSource,
  options: DiscoveryFetchOptions = {},
): Promise<DiscoveryBatch> {
  const context = {
    provider: "greenhouse" as const,
    sourceId: String(sourceInput?.boardToken ?? "unknown").slice(0, 200),
  };
  const source = parseProviderConfig(GreenhouseSourceSchema, sourceInput, context);
  const limits = resolveDiscoveryLimits(context, options);
  const payload = await fetchBoundedJson({
    context,
    url: greenhouseJobsUrl(source.boardToken),
    limits,
  });
  const response = parseProviderPayload(GreenhouseResponseSchema, payload, context);
  const selected = response.jobs.slice(0, limits.maxItems);

  const jobs: DiscoveryJob[] = selected.map((job) => {
    const location = job.location?.name || null;
    return {
      provider: "greenhouse",
      externalId: String(job.id),
      title: job.title,
      company: source.company,
      location,
      descriptionText: normalizeDescription(job.content),
      jobUrl: job.absolute_url,
      applyUrl: job.absolute_url,
      postedAt: normalizeTimestamp(job.first_published),
      updatedAt: normalizeTimestamp(job.updated_at),
      workArrangement: inferWorkArrangement({ location }),
      employmentType: "unknown",
      salary: null,
    };
  });

  const totalReported = response.meta?.total ?? response.jobs.length;
  return {
    source: { provider: "greenhouse", sourceId: source.boardToken, company: source.company },
    jobs,
    truncated: response.jobs.length > jobs.length || totalReported > jobs.length,
    totalReported,
  };
}
