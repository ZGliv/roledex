import { describe, expect, it } from "vitest";

import { canRecordDecision } from "@/features/decisions/policy";

describe("decision policy", () => {
  it("records meaningful decision changes", () => {
    expect(canRecordDecision("unseen", "saved")).toBe(true);
    expect(canRecordDecision("saved", "stretch")).toBe(true);
  });

  it("does not duplicate an unchanged decision", () => {
    expect(canRecordDecision("saved", "saved")).toBe(false);
  });

  it("does not silently reset terminal outcomes to unseen", () => {
    expect(canRecordDecision("offer", "unseen")).toBe(false);
    expect(canRecordDecision("rejected", "unseen")).toBe(false);
  });
});
