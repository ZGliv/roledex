import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatJobFeedSnapshotFreshness,
  parseJobFeedSnapshot,
  readJobFeedSnapshot,
} from "@/features/jobs/feed-snapshot";

const job = {
  company: "Example",
  datePosted: "Aug 14, 2026",
  employmentType: "Full time",
  id: "job-1",
  location: "Pittsburgh, PA",
  salaryDisplay: "$70k–$90k / yr",
  sourceUrl: "https://example.com/jobs/1",
  title: "Implementation Specialist",
  workArrangement: "Hybrid",
};

describe("last-good feed snapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a compact current-version snapshot", () => {
    const snapshot = parseJobFeedSnapshot(
      JSON.stringify({
        version: 1,
        kind: "feed",
        savedAt: "2026-08-14T12:00:00.000Z",
        jobs: [job],
      }),
      "feed",
    );

    expect(snapshot).toMatchObject({
      kind: "feed",
      jobs: [expect.objectContaining({ id: "job-1" })],
    });
  });

  it("rejects corrupt, mismatched, and unsafe snapshots", () => {
    expect(parseJobFeedSnapshot("not json", "feed")).toBeNull();
    expect(
      parseJobFeedSnapshot(
        JSON.stringify({ version: 1, kind: "saved", savedAt: "now", jobs: [job] }),
        "feed",
      ),
    ).toBeNull();
    expect(
      parseJobFeedSnapshot(
        JSON.stringify({
          version: 1,
          kind: "feed",
          savedAt: "now",
          jobs: [{ ...job, sourceUrl: "javascript:alert(1)" }],
        }),
        "feed",
      ),
    ).toBeNull();
  });

  it("caps recovered snapshots to a bounded device payload", () => {
    const snapshot = parseJobFeedSnapshot(
      JSON.stringify({
        version: 1,
        kind: "feed",
        savedAt: "now",
        jobs: Array.from({ length: 50 }, (_, index) => ({
          ...job,
          id: `job-${index}`,
        })),
      }),
      "feed",
    );

    expect(snapshot?.jobs).toHaveLength(30);
  });

  it("describes cache freshness without overstating an invalid timestamp", () => {
    const now = Date.parse("2026-08-14T12:00:00.000Z");

    expect(
      formatJobFeedSnapshotFreshness("2026-08-14T11:59:45.000Z", now),
    ).toBe("Updated moments ago");
    expect(
      formatJobFeedSnapshotFreshness("2026-08-14T11:43:00.000Z", now),
    ).toBe("Updated 17 min ago");
    expect(
      formatJobFeedSnapshotFreshness("2026-08-14T09:00:00.000Z", now),
    ).toBe("Updated 3 hrs ago");
    expect(formatJobFeedSnapshotFreshness("not-a-date", now)).toBe(
      "Saved on this device",
    );
  });

  it("uses the preferred on-device snapshot without consulting a later fallback", () => {
    const savedSnapshot = JSON.stringify({
      version: 1,
      kind: "saved",
      savedAt: "2026-08-14T12:00:00.000Z",
      jobs: [job],
    });
    const getItem = vi.fn((key: string) =>
      key === "jobswipe:last-good-saved:v1" ? savedSnapshot : null,
    );
    vi.stubGlobal("window", { localStorage: { getItem } });

    expect(readJobFeedSnapshot("saved")?.kind).toBe("saved");
    expect(getItem).toHaveBeenCalledTimes(1);
    expect(getItem).not.toHaveBeenCalledWith("jobswipe:last-good-feed:v1");
  });
});
