import { describe, expect, it } from "vitest";

import { hasValidCronAuthorization } from "@/features/discovery/cron-auth";

describe("cron authorization", () => {
  it("accepts only the exact bearer credential", () => {
    expect(hasValidCronAuthorization("Bearer test-secret", "test-secret")).toBe(
      true,
    );
    expect(hasValidCronAuthorization("Bearer wrong-secret", "test-secret")).toBe(
      false,
    );
    expect(hasValidCronAuthorization("bearer test-secret", "test-secret")).toBe(
      false,
    );
  });

  it("rejects absent, malformed, and differently sized credentials", () => {
    expect(hasValidCronAuthorization(null, "test-secret")).toBe(false);
    expect(hasValidCronAuthorization("test-secret", "test-secret")).toBe(false);
    expect(hasValidCronAuthorization("Bearer x", "test-secret")).toBe(false);
    expect(hasValidCronAuthorization("Bearer test-secret", undefined)).toBe(false);
    expect(hasValidCronAuthorization("Bearer ", "")).toBe(false);
  });
});
