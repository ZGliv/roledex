import type { JobSource } from "@/db/schema";
import {
  fetchAshbyJobs,
  fetchGreenhouseJobs,
  fetchLeverJobs,
} from "@/features/discovery/providers";
import type {
  DiscoveryBatch,
  DiscoveryFetchOptions,
  DiscoveryProvider,
} from "@/features/discovery/types";

type FetchableSource = Pick<JobSource, "companyName" | "provider" | "providerKey">;

export async function fetchJobSourceBatch(
  source: FetchableSource,
  options: DiscoveryFetchOptions,
): Promise<DiscoveryBatch> {
  if (source.provider === "greenhouse") {
    return fetchGreenhouseJobs(
      { boardToken: source.providerKey, company: source.companyName },
      options,
    );
  }
  if (source.provider === "lever") {
    return fetchLeverJobs(
      { site: source.providerKey, company: source.companyName },
      options,
    );
  }
  return fetchAshbyJobs(
    { jobBoardName: source.providerKey, company: source.companyName },
    options,
  );
}

export function providerDisplayName(provider: DiscoveryProvider) {
  if (provider === "greenhouse") return "Greenhouse";
  if (provider === "lever") return "Lever";
  return "Ashby";
}
