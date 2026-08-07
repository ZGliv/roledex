import { describe, expect, it } from "vitest";

import { selectLatestFitRows } from "@/features/fit/latest-run";

function row(input: {
  createdAt: string;
  id: string;
  jobRevisionId: string;
  profileRevision: number;
}) {
  return {
    marker: input.id,
    fit: {
      id: input.id,
      jobRevisionId: input.jobRevisionId,
      candidateSnapshot: { revision: input.profileRevision },
      createdAt: new Date(input.createdAt),
    },
  };
}

describe("latest fit-run selection", () => {
  it("returns exactly one newest profile run per job revision", () => {
    const selected = selectLatestFitRows([
      row({
        id: "old-a",
        jobRevisionId: "job-a",
        profileRevision: 1,
        createdAt: "2026-08-04T10:00:00.000Z",
      }),
      row({
        id: "new-a",
        jobRevisionId: "job-a",
        profileRevision: 2,
        createdAt: "2026-08-04T10:01:00.000Z",
      }),
      row({
        id: "only-b",
        jobRevisionId: "job-b",
        profileRevision: 2,
        createdAt: "2026-08-04T10:01:00.000Z",
      }),
    ]);

    expect(selected.map((item) => item.marker).sort()).toEqual([
      "new-a",
      "only-b",
    ]);
  });

  it("prefers the higher profile revision even if timestamps are skewed", () => {
    const [selected] = selectLatestFitRows([
      row({
        id: "clock-newer",
        jobRevisionId: "job-a",
        profileRevision: 3,
        createdAt: "2026-08-04T10:00:00.000Z",
      }),
      row({
        id: "clock-older",
        jobRevisionId: "job-a",
        profileRevision: 4,
        createdAt: "2026-08-04T09:59:00.000Z",
      }),
    ]);
    expect(selected.marker).toBe("clock-older");
  });

  it("can require the active profile revision instead of returning stale scores", () => {
    const selected = selectLatestFitRows(
      [
        row({
          id: "stale-a",
          jobRevisionId: "job-a",
          profileRevision: 3,
          createdAt: "2026-08-04T10:01:00.000Z",
        }),
        row({
          id: "current-b",
          jobRevisionId: "job-b",
          profileRevision: 4,
          createdAt: "2026-08-04T10:00:00.000Z",
        }),
      ],
      4,
    );

    expect(selected.map((item) => item.marker)).toEqual(["current-b"]);
  });

  it("uses the run id as a deterministic tie-breaker for equal timestamps", () => {
    const [selected] = selectLatestFitRows([
      row({
        id: "run-a",
        jobRevisionId: "job-a",
        profileRevision: 4,
        createdAt: "2026-08-04T10:00:00.000Z",
      }),
      row({
        id: "run-b",
        jobRevisionId: "job-a",
        profileRevision: 4,
        createdAt: "2026-08-04T10:00:00.000Z",
      }),
    ]);

    expect(selected.marker).toBe("run-b");
  });
});
