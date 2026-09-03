import { describe, expect, it } from "vitest";

import { nextDeckCheckLabel } from "@/features/jobs/feed-copy";

describe("job feed copy", () => {
  const now = new Date("2026-08-11T17:17:00.000Z");

  it("never presents a past check time as upcoming", () => {
    expect(nextDeckCheckLabel("2026-08-11T12:46:00.000Z", now)).toBe(
      "Checking again shortly",
    );
    expect(nextDeckCheckLabel(now.toISOString(), now)).toBe(
      "Checking again shortly",
    );
  });

  it("keeps a valid future check time and handles missing data honestly", () => {
    expect(
      nextDeckCheckLabel("2026-08-11T18:30:00.000Z", now),
    ).toMatch(/^Next automatic check around /);
    expect(nextDeckCheckLabel(null, now)).toBe(
      "Watching for newly published roles",
    );
  });
});
