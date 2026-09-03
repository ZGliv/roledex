import { describe, expect, it } from "vitest";

import { savedApplicationControl } from "@/features/jobs/components/saved-shortlist";

describe("saved shortlist application marker", () => {
  it("allows the simple applied marker to be toggled", () => {
    expect(savedApplicationControl("saved")).toEqual({
      label: "Mark applied",
      next: "applied",
    });
    expect(savedApplicationControl("applied")).toEqual({
      label: "Applied",
      next: "saved",
    });
  });

  it.each([
    ["interview", "Interview"],
    ["offer", "Offer"],
    ["rejected", "Closed"],
  ])("preserves the advanced %s stage", (decision, label) => {
    expect(savedApplicationControl(decision)).toEqual({ label, next: null });
  });
});
