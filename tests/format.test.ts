import { describe, expect, it } from "vitest";

import { formatAppDateTime, formatAppTime } from "@/lib/format";

describe("application timestamp formatting", () => {
  it("uses America/New_York consistently across standard and daylight time", () => {
    expect(formatAppDateTime("2026-01-15T17:05:00.000Z")).toBe(
      "Jan 15, 12:05 PM EST",
    );
    expect(formatAppDateTime("2026-08-04T16:05:00.000Z")).toBe(
      "Aug 4, 12:05 PM EDT",
    );
    expect(formatAppTime("2026-08-04T16:05:00.000Z")).toBe("12:05 PM EDT");
  });
});
