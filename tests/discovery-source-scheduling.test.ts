import { describe, expect, it } from "vitest";

import {
  earliestNextSourceAttempt,
  nextSourceAttemptAt,
  selectDueJobSources,
} from "@/features/discovery/source-scheduling";

const NOW = new Date("2026-08-05T16:00:00.000Z");

function source(
  id: string,
  overrides: Partial<Parameters<typeof nextSourceAttemptAt>[0]> = {},
) {
  return {
    id,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    enabled: true,
    lastAttemptedAt: null,
    lastErrorAt: null,
    lastSucceededAt: null,
    refreshIntervalHours: 24,
    removedAt: null,
    ...overrides,
  };
}

describe("per-source discovery scheduling", () => {
  it("prioritizes never-attempted and oldest-due sources in bounded shards", () => {
    const selected = selectDueJobSources(
      [
        source("recent", {
          lastAttemptedAt: new Date("2026-08-05T08:00:00.000Z"),
          lastSucceededAt: new Date("2026-08-05T08:00:00.000Z"),
        }),
        source("oldest", {
          lastAttemptedAt: new Date("2026-08-02T08:00:00.000Z"),
          lastSucceededAt: new Date("2026-08-02T08:00:00.000Z"),
        }),
        source("never"),
        source("older", {
          lastAttemptedAt: new Date("2026-08-03T08:00:00.000Z"),
          lastSucceededAt: new Date("2026-08-03T08:00:00.000Z"),
        }),
      ],
      NOW,
      2,
    );

    expect(selected.map(({ id }) => id)).toEqual(["never", "oldest"]);
  });

  it("honors success intervals and gives failed sources a bounded retry window", () => {
    const succeeded = source("succeeded", {
      lastAttemptedAt: new Date("2026-08-05T08:00:00.000Z"),
      lastSucceededAt: new Date("2026-08-05T08:00:00.000Z"),
      refreshIntervalHours: 24,
    });
    const failed = source("failed", {
      lastAttemptedAt: new Date("2026-08-05T08:00:00.000Z"),
      lastErrorAt: new Date("2026-08-05T08:00:00.000Z"),
    });

    expect(nextSourceAttemptAt(succeeded)?.toISOString()).toBe(
      "2026-08-06T08:00:00.000Z",
    );
    expect(nextSourceAttemptAt(failed)?.toISOString()).toBe(
      "2026-08-05T14:00:00.000Z",
    );
    expect(selectDueJobSources([succeeded, failed], NOW, 10).map(({ id }) => id)).toEqual([
      "failed",
    ]);
  });

  it("excludes paused and removed sources and reports the next active due time", () => {
    const active = source("active", {
      lastAttemptedAt: new Date("2026-08-05T08:00:00.000Z"),
      lastSucceededAt: new Date("2026-08-05T08:00:00.000Z"),
    });
    const paused = source("paused", { enabled: false });
    const removed = source("removed", { removedAt: NOW });

    expect(selectDueJobSources([active, paused, removed], NOW, 10)).toEqual([]);
    expect(earliestNextSourceAttempt([active, paused, removed])?.toISOString()).toBe(
      "2026-08-06T08:00:00.000Z",
    );
  });
});
