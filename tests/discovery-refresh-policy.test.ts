import { describe, expect, it } from "vitest";

import {
  completedDiscoveryRefreshMessage,
  discoveryRefreshSeverity,
  getDiscoveryRefreshDeferral,
  shouldAutoRefreshDiscovery,
} from "@/features/discovery/refresh-policy";

const NOW = new Date("2026-08-04T16:00:00.000Z");

function minutesBefore(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60 * 1_000);
}

function hoursBefore(hours: number) {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1_000);
}

describe("discovery refresh policy", () => {
  it("backs off briefly after total failure and releases stale running leases", () => {
    expect(
      getDiscoveryRefreshDeferral(
        {
          completedAt: minutesBefore(2),
          startedAt: minutesBefore(3),
          status: "failed",
          successfulSourceCount: 0,
        },
        NOW,
      )?.kind,
    ).toBe("backoff");

    expect(
      getDiscoveryRefreshDeferral(
        {
          completedAt: null,
          startedAt: minutesBefore(5),
          status: "running",
          successfulSourceCount: 0,
        },
        NOW,
      )?.kind,
    ).toBe("running");

    expect(
      getDiscoveryRefreshDeferral(
        {
          completedAt: null,
          startedAt: minutesBefore(16),
          status: "running",
          successfulSourceCount: 0,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("uses the normal cooldown only after at least one source succeeds", () => {
    expect(
      getDiscoveryRefreshDeferral(
        {
          completedAt: minutesBefore(1),
          startedAt: minutesBefore(1),
          status: "partial",
          successfulSourceCount: 3,
        },
        NOW,
      )?.kind,
    ).toBe("recent");

    expect(
      getDiscoveryRefreshDeferral(
        {
          completedAt: minutesBefore(3),
          startedAt: minutesBefore(3),
          status: "succeeded",
          successfulSourceCount: 3,
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("bases freshness on the latest successful completion without retry storms", () => {
    const recentFailure = {
      completedAt: minutesBefore(2),
      startedAt: minutesBefore(3),
      status: "failed" as const,
      successfulSourceCount: 0,
    };

    expect(
      shouldAutoRefreshDiscovery({
        latestRun: recentFailure,
        latestSuccessfulCompletedAt: hoursBefore(25),
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldAutoRefreshDiscovery({
        latestRun: {
          ...recentFailure,
          completedAt: minutesBefore(11),
          startedAt: minutesBefore(12),
        },
        latestSuccessfulCompletedAt: hoursBefore(25),
        now: NOW,
      }),
    ).toBe(true);

    expect(
      shouldAutoRefreshDiscovery({
        latestRun: recentFailure,
        latestSuccessfulCompletedAt: hoursBefore(2),
        now: NOW,
      }),
    ).toBe(false);
  });

  it("never describes failed or partial runs as fully current", () => {
    expect(
      completedDiscoveryRefreshMessage({
        changedJobs: 0,
        expiredJobs: 0,
        failedSources: 20,
        newJobs: 0,
        status: "failed",
        successfulSources: 0,
      }),
    ).toContain("No job feeds could be refreshed");

    const partial = completedDiscoveryRefreshMessage({
      changedJobs: 0,
      expiredJobs: 0,
      failedSources: 2,
      newJobs: 3,
      status: "partial",
      successfulSources: 18,
    });
    expect(partial).toContain("Added 3 new matches");
    expect(partial).toContain("2 feeds could not be checked");
    expect(partial).not.toContain("already current");

    const truncated = completedDiscoveryRefreshMessage({
      changedJobs: 0,
      expiredJobs: 0,
      failedSources: 0,
      newJobs: 0,
      status: "partial",
      successfulSources: 20,
      truncatedSources: 2,
    });
    expect(truncated).toContain("2 feeds were large and will be revisited safely");
    expect(truncated).not.toContain("already current");
  });

  it("classifies action results as ok, warning, or error", () => {
    expect(
      discoveryRefreshSeverity({ kind: "completed", status: "succeeded" }),
    ).toBe("ok");
    expect(
      discoveryRefreshSeverity({ kind: "completed", status: "partial" }),
    ).toBe("warning");
    expect(
      discoveryRefreshSeverity({ kind: "completed", status: "failed" }),
    ).toBe("error");
    expect(discoveryRefreshSeverity({ kind: "backoff" })).toBe("warning");
    expect(discoveryRefreshSeverity({ kind: "recent" })).toBe("ok");
    expect(discoveryRefreshSeverity({ kind: "no_sources" })).toBe("warning");
  });
});
