import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/emergency-feed/route";
import { DEFAULT_EMERGENCY_PROFILE } from "@/features/jobs/emergency-feed";
import {
  EMERGENCY_FEED_SOURCE_NETWORK,
  emergencyFeedSourceShard,
  parseEmergencyFeedCursor,
  parseEmergencyFeedProfile,
} from "@/features/jobs/emergency-feed-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

function encodeProfile(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("emergency feed pagination", () => {
  it("walks each verified ATS board once in bounded four-source shards", () => {
    const identities = EMERGENCY_FEED_SOURCE_NETWORK.map(
      (source) => `${source.provider}:${source.providerKey}`,
    );
    const paged: string[] = [];
    for (let cursor = 0; cursor < identities.length; cursor += 4) {
      const shard = emergencyFeedSourceShard(cursor);
      expect(shard.length).toBeLessThanOrEqual(4);
      paged.push(
        ...shard.map((source) => `${source.provider}:${source.providerKey}`),
      );
    }

    expect(EMERGENCY_FEED_SOURCE_NETWORK.length).toBeGreaterThan(12);
    expect(new Set(identities).size).toBe(identities.length);
    expect(paged).toEqual(identities);
  });

  it("rejects malformed cursors and bounds cursors to the source network", () => {
    expect(parseEmergencyFeedCursor(null)).toBe(0);
    expect(parseEmergencyFeedCursor("-1")).toBe(0);
    expect(parseEmergencyFeedCursor("1.5")).toBe(0);
    expect(parseEmergencyFeedCursor("nope")).toBe(0);
    expect(parseEmergencyFeedCursor("4")).toBe(4);
    expect(parseEmergencyFeedCursor("9999")).toBe(
      EMERGENCY_FEED_SOURCE_NETWORK.length,
    );
  });

  it("uses a complete bounded device profile and defaults malformed input", () => {
    const device = {
      ...DEFAULT_EMERGENCY_PROFILE,
      location: "Pittsburgh, PA",
      preferredSalaryMinimumCents: 999_999_999,
      targetRoleFamilies: ["Implementation", "Implementation"],
    };

    expect(parseEmergencyFeedProfile(encodeProfile(device))).toEqual({
      profile: expect.objectContaining({
        location: "Pittsburgh, PA",
        preferredSalaryMinimumCents: 50_000_000,
        targetRoleFamilies: ["Implementation"],
      }),
      source: "device",
    });
    expect(parseEmergencyFeedProfile(encodeProfile({ targetRoleFamilies: [] }))).toEqual({
      profile: DEFAULT_EMERGENCY_PROFILE,
      source: "default",
    });
    expect(parseEmergencyFeedProfile("not-base64-json")).toEqual({
      profile: DEFAULT_EMERGENCY_PROFILE,
      source: "default",
    });
  });

  it("returns a cursor and transparent source progress for each API page", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const body = url.hostname.includes("ashbyhq.com") ? { jobs: [] } : [];
      return Response.json(body);
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("https://jobswipe.example/api/emergency-feed?cursor=0"),
    );
    const payload = (await response.json()) as {
      data: unknown[];
      meta: {
        checkedSources: number;
        hasMore: boolean;
        nextCursor: string | null;
        sourceBatch: number;
        successfulSources: number;
        totalSources: number;
      };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(payload.data).toEqual([]);
    expect(payload.meta).toMatchObject({
      checkedSources: 4,
      hasMore: true,
      nextCursor: "4",
      sourceBatch: 1,
      successfulSources: 4,
      totalSources: EMERGENCY_FEED_SOURCE_NETWORK.length,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("retries a transiently failed board once before advancing the shard", async () => {
    let failedOnce = false;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      if (!failedOnce) {
        failedOnce = true;
        throw new TypeError("temporary network failure");
      }
      const url = new URL(String(input));
      return Response.json(url.hostname.includes("ashbyhq.com") ? { jobs: [] } : []);
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("https://jobswipe.example/api/emergency-feed?cursor=0"),
    );
    const payload = (await response.json()) as {
      meta: { failedSources: number; nextCursor: string | null; successfulSources: number };
    };

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(payload.meta).toMatchObject({
      failedSources: 0,
      nextCursor: "4",
      successfulSources: 4,
    });
  });

  it("returns an outage response when an entire shard fails twice", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("company board unavailable");
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      new Request("https://jobswipe.example/api/emergency-feed?cursor=0"),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.error).toContain("did not respond");
    expect(fetcher).toHaveBeenCalledTimes(8);
  });
});
