import "server-only";

import type { DiscoveryFetch } from "@/features/discovery/types";
import { fetchJobSourceBatch } from "@/features/discovery/source-fetch";
import type { ParsedJobSourceUrl } from "@/features/discovery/source-url";

export type ValidatedJobSource = ParsedJobSourceUrl & {
  availableJobs: number;
  truncated: boolean;
};

/**
 * Verifies the derived provider key against a provider URL constructed by our
 * adapter. The user-submitted URL is deliberately never fetched.
 */
export async function validateJobSource(
  parsed: ParsedJobSourceUrl,
  companyName: string,
  fetcher?: DiscoveryFetch,
): Promise<ValidatedJobSource> {
  const batch = await fetchJobSourceBatch(
    {
      provider: parsed.provider,
      providerKey: parsed.providerKey,
      companyName,
    },
    {
      fetcher,
      maxItems: 1,
      maxResponseBytes: 8_000_000,
      timeoutMs: 15_000,
    },
  );

  return {
    ...parsed,
    availableJobs: batch.totalReported ?? batch.jobs.length,
    truncated: batch.truncated,
  };
}
