import { describe, expect, it } from "vitest";
import { z } from "zod";

import config from "../capacitor.config";
import {
  apiV2Options,
  parseApiV2Json,
} from "@/features/api-v2/http";
import {
  ApiV2AccountDeleteSchema,
  ApiV2InteractionBatchSchema,
  ApiV2PreferenceOverrideSchema,
} from "@/features/api-v2/input";
import { JOBSWIPE_API_VERSION } from "@/features/api-v2/contracts";

const event = {
  id: "847ca264-423c-4bb3-879f-444a7d3c2692",
  kind: "decision" as const,
  jobId: "e0f6c4a5-f0d8-4fb7-971b-821ed37bbdd6",
  occurredAt: "2026-08-19T12:00:00.000Z",
  exposureId: "12812583-dbc5-4a03-b8e5-f0ce4a58cf0b",
  decision: "saved" as const,
  expectedDecision: "unseen" as const,
  expectedDecisionEventId: null,
  reasonCodes: [],
};

describe("API v2 public contracts", () => {
  it("accepts offline-safe decision events and rejects duplicate ids", () => {
    expect(ApiV2InteractionBatchSchema.safeParse({ events: [event] }).success).toBe(
      true,
    );
    const duplicate = ApiV2InteractionBatchSchema.safeParse({
      events: [event, { ...event }],
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.error?.issues[0]?.path).toEqual(["events"]);
  });

  it("exposes Capacitor CORS without opening browser origins", () => {
    const native = apiV2Options(
      new Request("https://jobswipe.example/api/v2/feed", {
        method: "OPTIONS",
        headers: { origin: "capacitor://localhost" },
      }),
    );
    expect(native.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost",
    );
    expect(native.headers.get("x-jobswipe-api-version")).toBe(
      String(JOBSWIPE_API_VERSION),
    );

    const browser = apiV2Options(
      new Request("https://jobswipe.example/api/v2/feed", {
        method: "OPTIONS",
        headers: { origin: "https://untrusted.example" },
      }),
    );
    expect(browser.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("bundles mobile assets locally rather than loading a remote server", () => {
    expect(config.webDir).toBe("mobile/dist");
    expect("server" in config).toBe(false);
  });

  it("requires an explicit destructive-account confirmation", () => {
    expect(
      ApiV2AccountDeleteSchema.safeParse({
        confirmation: "DELETE_MY_ACCOUNT",
      }).success,
    ).toBe(true);
    expect(
      ApiV2AccountDeleteSchema.safeParse({ confirmation: "delete" }).success,
    ).toBe(false);
  });

  it("accepts explicit learned-preference controls and rejects fabricated feature keys", () => {
    for (const action of ["more", "less", "ignore", "reset"] as const) {
      expect(
        ApiV2PreferenceOverrideSchema.safeParse({
          action,
          featureKey: "arrangement:remote",
        }).success,
      ).toBe(true);
    }
    expect(
      ApiV2PreferenceOverrideSchema.safeParse({ action: "reset_all" }).success,
    ).toBe(true);
    expect(
      ApiV2PreferenceOverrideSchema.safeParse({
        action: "more",
        featureKey: "arbitrary:injection",
      }).success,
    ).toBe(false);
  });

  it("caps chunked JSON bodies before parsing", async () => {
    const request = new Request("https://jobswipe.example/api/v2/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(4_096) }),
    });
    await expect(
      parseApiV2Json(request, z.object({ value: z.string() }), 1_024),
    ).rejects.toMatchObject({
      code: "payload_too_large",
      status: 413,
    });
  });
});
