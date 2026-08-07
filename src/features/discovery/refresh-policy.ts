import type { IngestionRunStatus } from "@/db/schema";

export const DISCOVERY_AUTO_REFRESH_AFTER_MS = 24 * 60 * 60 * 1_000;
// A short global guard prevents accidental double submissions while per-source
// due times keep repeated refills rotating through different companies.
export const DISCOVERY_REFRESH_COOLDOWN_MS = 2 * 60 * 1_000;
export const DISCOVERY_FAILED_REFRESH_BACKOFF_MS = 10 * 60 * 1_000;
export const DISCOVERY_ACTIVE_RUN_WINDOW_MS = 15 * 60 * 1_000;

type RefreshRunTiming = {
  completedAt: Date | null;
  startedAt: Date;
  status: IngestionRunStatus;
  successfulSourceCount: number;
};

export type DiscoveryRefreshDeferral = {
  kind: "backoff" | "recent" | "running";
  retryAt: Date;
};

export type DiscoveryRefreshResultLike =
  | {
      kind: "completed";
      status: IngestionRunStatus;
    }
  | {
      kind: DiscoveryRefreshDeferral["kind"] | "no_sources";
    };

export type DiscoveryRefreshSeverity = "ok" | "warning" | "error";

export function getDiscoveryRefreshDeferral(
  latestRun: RefreshRunTiming | null,
  now: Date,
): DiscoveryRefreshDeferral | null {
  if (!latestRun) return null;

  if (latestRun.status === "running") {
    const retryAt = new Date(
      latestRun.startedAt.getTime() + DISCOVERY_ACTIVE_RUN_WINDOW_MS,
    );
    return retryAt > now ? { kind: "running", retryAt } : null;
  }

  if (!latestRun.completedAt) return null;

  if (
    latestRun.successfulSourceCount > 0 &&
    (latestRun.status === "succeeded" || latestRun.status === "partial")
  ) {
    const retryAt = new Date(
      latestRun.completedAt.getTime() + DISCOVERY_REFRESH_COOLDOWN_MS,
    );
    return retryAt > now ? { kind: "recent", retryAt } : null;
  }

  const retryAt = new Date(
    latestRun.completedAt.getTime() + DISCOVERY_FAILED_REFRESH_BACKOFF_MS,
  );
  return retryAt > now ? { kind: "backoff", retryAt } : null;
}

export function shouldAutoRefreshDiscovery(input: {
  latestRun: RefreshRunTiming | null;
  latestSuccessfulCompletedAt: Date | null;
  now: Date;
}) {
  const stale =
    !input.latestSuccessfulCompletedAt ||
    input.now.getTime() - input.latestSuccessfulCompletedAt.getTime() >=
      DISCOVERY_AUTO_REFRESH_AFTER_MS;

  if (!stale) return false;
  return getDiscoveryRefreshDeferral(input.latestRun, input.now) === null;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function completedDiscoveryRefreshMessage(input: {
  changedJobs: number;
  expiredJobs: number;
  failedSources: number;
  newJobs: number;
  status: IngestionRunStatus;
  successfulSources: number;
  truncatedSources?: number;
  queuedSources?: number;
}) {
  if (input.status === "failed") {
    return "No job feeds could be refreshed. Your existing jobs are safe. Try again in a few minutes.";
  }

  const progress =
    input.newJobs > 0
      ? `Added ${countLabel(input.newJobs, "new match", "new matches")} from live company feeds`
      : input.changedJobs > 0
        ? `Updated ${countLabel(input.changedJobs, "job listing")}`
        : input.expiredJobs > 0
          ? `Removed ${countLabel(input.expiredJobs, "no-longer-relevant job")} from the active deck`
          : `Checked ${countLabel(input.successfulSources, "live company feed")} for new matches`;

  const rotation =
    (input.queuedSources ?? 0) > 0
      ? " The source rotation will keep checking more companies."
      : " JobSwipe will keep revisiting the network as companies publish roles.";

  if (input.status === "partial") {
    const warnings = [
      ...(input.failedSources > 0
        ? [`${countLabel(input.failedSources, "feed")} could not be checked`]
        : []),
      ...((input.truncatedSources ?? 0) > 0
        ? [
            `${countLabel(input.truncatedSources ?? 0, "feed")} ${
              (input.truncatedSources ?? 0) === 1 ? "was" : "were"
            } large and will be revisited safely`,
          ]
        : []),
    ];
    const warning =
      warnings.length > 0
        ? warnings.join(" and ")
        : "some listings could not be processed";
    return `${progress}, but ${warning}. Your existing jobs are safe.${rotation}`;
  }

  return `${progress}.${rotation}`;
}

export function discoveryRefreshSeverity(
  result: DiscoveryRefreshResultLike,
): DiscoveryRefreshSeverity {
  if (result.kind === "completed") {
    if (result.status === "failed") return "error";
    if (result.status === "partial") return "warning";
    return "ok";
  }
  return result.kind === "recent" ? "ok" : "warning";
}
