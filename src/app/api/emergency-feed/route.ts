import type { DiscoveryFetch } from "@/features/discovery/types";
import { fetchJobSourceBatch } from "@/features/discovery/source-fetch";
import {
  buildEmergencyFeed,
} from "@/features/jobs/emergency-feed";
import {
  EMERGENCY_FEED_SOURCE_NETWORK,
  EMERGENCY_FEED_SOURCE_SHARD_SIZE,
  emergencyFeedSourceShard,
  parseEmergencyFeedCursor,
  parseEmergencyFeedProfile,
  type EmergencyFeedPageMeta,
} from "@/features/jobs/emergency-feed-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const SOURCE_REFRESH_SECONDS = 15 * 60;

/** Cache each public ATS response by its URL, independent of profile/cursor. */
const cachedOfficialFeedFetcher: DiscoveryFetch = (input, init) =>
  fetch(input, {
    ...init,
    cache: "force-cache",
    next: { revalidate: SOURCE_REFRESH_SECONDS },
  });

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const cursor = parseEmergencyFeedCursor(requestUrl.searchParams.get("cursor"));
  const parsedProfile = parseEmergencyFeedProfile(
    requestUrl.searchParams.get("profile"),
  );
  const sources = emergencyFeedSourceShard(cursor);

  try {
    const fetchSource = async (source: (typeof sources)[number]) => ({
        source,
        batch: await fetchJobSourceBatch(source, {
          fetcher: cachedOfficialFeedFetcher,
          maxItems: 90,
          maxResponseBytes: 5_000_000,
          timeoutMs: 5_500,
        }),
      });
    const settled = await Promise.allSettled(sources.map(fetchSource));
    const failedIndexes = settled.flatMap((result, index) =>
      result.status === "rejected" ? [index] : [],
    );
    // One immediate, bounded retry prevents a transient board failure from
    // being silently skipped while keeping route work below a fixed ceiling.
    if (failedIndexes.length > 0) {
      const retried = await Promise.allSettled(
        failedIndexes.map((index) => fetchSource(sources[index])),
      );
      failedIndexes.forEach((sourceIndex, retryIndex) => {
        settled[sourceIndex] = retried[retryIndex];
      });
    }
    const successful = settled.flatMap((result) =>
      result.status === "fulfilled"
        ? [{ source: result.value.source, jobs: result.value.batch.jobs }]
        : [],
    );
    if (sources.length > 0 && successful.length === 0) {
      return Response.json(
        { data: [], error: "The current company-board shard did not respond." },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    const nextOffset = Math.min(
      cursor + sources.length,
      EMERGENCY_FEED_SOURCE_NETWORK.length,
    );
    const hasMore = nextOffset < EMERGENCY_FEED_SOURCE_NETWORK.length;
    const meta: EmergencyFeedPageMeta = {
      checkedSources: nextOffset,
      failedSources: settled.length - successful.length,
      generatedAt: new Date().toISOString(),
      hasMore,
      nextCursor: hasMore ? String(nextOffset) : null,
      profileSource: parsedProfile.source,
      refreshAfterSeconds: SOURCE_REFRESH_SECONDS,
      source: "official_public_ats",
      sourceBatch: Math.floor(cursor / EMERGENCY_FEED_SOURCE_SHARD_SIZE) + 1,
      successfulSources: successful.length,
      totalSourceBatches: Math.ceil(
        EMERGENCY_FEED_SOURCE_NETWORK.length / EMERGENCY_FEED_SOURCE_SHARD_SIZE,
      ),
      totalSources: EMERGENCY_FEED_SOURCE_NETWORK.length,
    };

    return Response.json(
      { data: buildEmergencyFeed(successful, parsedProfile.profile), meta },
      {
        headers: {
          "Cache-Control": "private, max-age=0, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Emergency public feed failed.", error);
    return Response.json(
      { data: [], error: "The direct company feeds could not be reached." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
