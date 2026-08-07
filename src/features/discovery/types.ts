export type DiscoveryProvider = "greenhouse" | "lever" | "ashby";

export type DiscoveryWorkArrangement =
  | "remote"
  | "hybrid"
  | "on_site"
  | "unknown";

export type DiscoveryEmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "seasonal"
  | "unknown";

export type DiscoverySalaryPeriod =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "unknown";

/**
 * Compensation exactly as the employer's feed represents it. Amounts are in
 * major currency units (for example, 85_000 USD), never cents.
 */
export interface DiscoverySalary {
  minimumMajorUnits: number | null;
  maximumMajorUnits: number | null;
  currency: string | null;
  period: DiscoverySalaryPeriod;
  source: "employer_posted";
  description: string | null;
}

export interface DiscoveryJob {
  provider: DiscoveryProvider;
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  descriptionText: string;
  jobUrl: string;
  applyUrl: string;
  /** The publication time, when the public feed actually supplies it. */
  postedAt: string | null;
  /** Kept separate so an update is never mislabeled as a publication. */
  updatedAt: string | null;
  workArrangement: DiscoveryWorkArrangement;
  employmentType: DiscoveryEmploymentType;
  salary: DiscoverySalary | null;
}

export interface DiscoverySourceRef {
  provider: DiscoveryProvider;
  sourceId: string;
  company: string;
}

export interface DiscoveryBatch {
  source: DiscoverySourceRef;
  jobs: DiscoveryJob[];
  /** True when the provider reported or returned more jobs than this bounded batch. */
  truncated: boolean;
  totalReported: number | null;
}

export type DiscoveryFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface DiscoveryFetchOptions {
  fetcher?: DiscoveryFetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxItems?: number;
}
