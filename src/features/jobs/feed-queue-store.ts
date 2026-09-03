import "server-only";

import { createHash, randomUUID } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import {
  feedExposures,
  feedSessions,
  fitScoreRuns,
  jobListings,
  jobRevisions,
  visitorFeedQueueEntries,
  visitorFeedQueues,
  visitorJobStates,
  type JsonObject,
} from "@/db/schema";

export const MATERIALIZED_FEED_QUEUE_SIZE = 75;
export const MATERIALIZED_FEED_QUEUE_MAX_SIZE = 100;
export const MATERIALIZED_FEED_QUEUE_TTL_MS = 6 * 60 * 60 * 1_000;
export const MATERIALIZED_FEED_SESSION_TTL_MS = 24 * 60 * 60 * 1_000;
export const MATERIALIZED_FEED_REBUILD_INTERACTION_COUNT = 10;

export type MaterializedFeedTier =
  | "ready_now"
  | "credible_stretch"
  | "discovery";

export interface FeedCatalogCheckpoint {
  revisionId: string | null;
  retrievedAt: Date | null;
}

export interface MaterializedFeedIdentity {
  candidateProfileId: string;
  profileRevision: number;
  recommenderVersion: string;
  catalog: FeedCatalogCheckpoint;
}

export interface MaterializedFeedInputCard {
  id: string;
  tier: MaterializedFeedTier;
  snapshot: JsonObject;
}

export interface MaterializedFeedPageEntry {
  jobId: string;
  position: number;
  snapshot: JsonObject;
  tier: MaterializedFeedTier;
}

export interface MaterializedFeedPage {
  cursorReset: boolean;
  entries: MaterializedFeedPageEntry[];
  generatedAt: Date;
  hasMore: boolean;
  nextCursor: string | null;
  profileRevision: number;
  queueId: string;
  queueVersion: string;
  recommenderVersion: string;
  source: "live_ranked" | "cached";
  tierCounts: Readonly<Record<MaterializedFeedTier, number>>;
  totalAvailable: number;
}

interface MaterializedFeedCursor {
  v: 1;
  q: string;
  version: string;
  after: number;
}

function encodeMaterializedFeedCursor(cursor: MaterializedFeedCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMaterializedFeedCursor(
  value: string | null | undefined,
): MaterializedFeedCursor | null {
  if (!value || value.length > 1_000) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<MaterializedFeedCursor>;
    if (
      parsed.v !== 1 ||
      typeof parsed.q !== "string" ||
      parsed.q.length < 1 ||
      parsed.q.length > 128 ||
      typeof parsed.version !== "string" ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(parsed.version) ||
      !Number.isSafeInteger(parsed.after) ||
      (parsed.after ?? -1) < 0 ||
      (parsed.after ?? 100) >= MATERIALIZED_FEED_QUEUE_MAX_SIZE
    ) {
      return null;
    }
    return parsed as MaterializedFeedCursor;
  } catch {
    return null;
  }
}

function sameInstant(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

export async function latestFeedCatalogCheckpoint(
  candidateProfileId: string,
): Promise<FeedCatalogCheckpoint> {
  await ensureDatabaseReady();
  // Visitor decisions deliberately do not participate in this checkpoint.
  // Queue reads filter current visitor state, decisions consume entries in the
  // same transaction, and the queue header carries a bounded dirty counter.
  // Including every swipe here would defeat warm reuse by rebuilding the full
  // ranked queue after each interaction.
  const [revisionRows, fitRows] = await Promise.all([
    db
      .select({
        revisionId: jobRevisions.id,
        retrievedAt: jobRevisions.retrievedAt,
      })
      .from(jobRevisions)
      // rowid is insertion-monotonic for this immutable revision table and
      // avoids missing two revisions written in the same millisecond.
      .orderBy(desc(sql`rowid`))
      .limit(1),
    db
      .select({
        id: fitScoreRuns.id,
        createdAt: fitScoreRuns.createdAt,
      })
      .from(fitScoreRuns)
      .where(eq(fitScoreRuns.candidateProfileId, candidateProfileId))
      .orderBy(desc(sql`rowid`))
      .limit(1),
  ]);
  const latestRevision = revisionRows[0];
  const latestFit = fitRows[0];
  return {
    revisionId:
      latestRevision || latestFit
        ? [
            latestRevision?.revisionId ?? "none",
            latestFit?.id ?? "none",
          ].join(":")
        : null,
    retrievedAt:
      Math.max(
        latestRevision?.retrievedAt?.getTime() ?? 0,
        latestFit?.createdAt?.getTime() ?? 0,
      ) > 0
        ? new Date(
            Math.max(
              latestRevision?.retrievedAt?.getTime() ?? 0,
              latestFit?.createdAt?.getTime() ?? 0,
            ),
          )
        : null,
  };
}

function validQueueHeader(
  queue: typeof visitorFeedQueues.$inferSelect,
  identity: MaterializedFeedIdentity,
  now: Date,
) {
  return (
    queue.candidateProfileId === identity.candidateProfileId &&
    queue.profileRevision === identity.profileRevision &&
    queue.recommenderVersion === identity.recommenderVersion &&
    queue.catalogRevisionId === identity.catalog.revisionId &&
    sameInstant(queue.catalogRetrievedAt, identity.catalog.retrievedAt) &&
    queue.invalidatedAt === null &&
    queue.expiresAt.getTime() > now.getTime() &&
    queue.pendingInteractionCount <
      MATERIALIZED_FEED_REBUILD_INTERACTION_COUNT
  );
}

async function queuePage(
  visitorId: string,
  queue: typeof visitorFeedQueues.$inferSelect,
  options: { cursor?: string | null; limit: number },
  source: MaterializedFeedPage["source"],
): Promise<MaterializedFeedPage> {
  const cursor = decodeMaterializedFeedCursor(options.cursor);
  const matchingCursor =
    cursor?.q === queue.id && cursor.version === queue.queueVersion
      ? cursor
      : null;
  const after = matchingCursor?.after ?? -1;
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit)));
  const where = and(
    eq(visitorFeedQueueEntries.visitorId, visitorId),
    eq(visitorFeedQueueEntries.queueId, queue.id),
    isNull(visitorFeedQueueEntries.consumedAt),
    eq(jobListings.lifecycleStatus, "active"),
    or(
      isNull(visitorJobStates.currentDecision),
      eq(visitorJobStates.currentDecision, "unseen"),
    ),
  );
  const [entryRows, tierRows] = await Promise.all([
    db
      .select({
        jobId: visitorFeedQueueEntries.jobListingId,
        position: visitorFeedQueueEntries.position,
        snapshot: visitorFeedQueueEntries.cardSnapshot,
        tier: visitorFeedQueueEntries.tier,
      })
      .from(visitorFeedQueueEntries)
      .innerJoin(
        jobListings,
        eq(visitorFeedQueueEntries.jobListingId, jobListings.id),
      )
      .leftJoin(
        visitorJobStates,
        and(
          eq(visitorJobStates.visitorId, visitorId),
          eq(
            visitorJobStates.jobListingId,
            visitorFeedQueueEntries.jobListingId,
          ),
        ),
      )
      .where(and(where, gt(visitorFeedQueueEntries.position, after)))
      .orderBy(asc(visitorFeedQueueEntries.position))
      .limit(limit + 1),
    db
      .select({ tier: visitorFeedQueueEntries.tier, value: count() })
      .from(visitorFeedQueueEntries)
      .innerJoin(
        jobListings,
        eq(visitorFeedQueueEntries.jobListingId, jobListings.id),
      )
      .leftJoin(
        visitorJobStates,
        and(
          eq(visitorJobStates.visitorId, visitorId),
          eq(
            visitorJobStates.jobListingId,
            visitorFeedQueueEntries.jobListingId,
          ),
        ),
      )
      .where(where)
      .groupBy(visitorFeedQueueEntries.tier),
  ]);
  const hasMore = entryRows.length > limit;
  const entries = entryRows.slice(0, limit) as MaterializedFeedPageEntry[];
  const last = entries.at(-1);
  const tierCounts: Record<MaterializedFeedTier, number> = {
    ready_now: 0,
    credible_stretch: 0,
    discovery: 0,
  };
  for (const row of tierRows) tierCounts[row.tier] = row.value;

  return {
    cursorReset: Boolean(options.cursor && !matchingCursor),
    entries,
    generatedAt: queue.generatedAt,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeMaterializedFeedCursor({
            v: 1,
            q: queue.id,
            version: queue.queueVersion,
            after: last.position,
          })
        : null,
    profileRevision: queue.profileRevision,
    queueId: queue.id,
    queueVersion: queue.queueVersion,
    recommenderVersion: queue.recommenderVersion,
    source,
    tierCounts,
    totalAvailable:
      tierCounts.ready_now +
      tierCounts.credible_stretch +
      tierCounts.discovery,
  };
}

export async function readMaterializedFeedPage(
  visitorId: string,
  identity: MaterializedFeedIdentity,
  options: { cursor?: string | null; limit: number },
  now = new Date(),
): Promise<MaterializedFeedPage | null> {
  await ensureDatabaseReady();
  const [queue] = await db
    .select()
    .from(visitorFeedQueues)
    .where(eq(visitorFeedQueues.visitorId, visitorId))
    .limit(1);
  if (!queue || !validQueueHeader(queue, identity, now)) return null;
  return queuePage(visitorId, queue, options, "cached");
}

function queueVersionFor(
  identity: MaterializedFeedIdentity,
  cards: readonly MaterializedFeedInputCard[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        catalog: [
          identity.catalog.revisionId,
          identity.catalog.retrievedAt?.getTime() ?? null,
        ],
        jobs: cards.map((card) => [card.id, card.tier]),
        profile: [identity.candidateProfileId, identity.profileRevision],
        recommender: identity.recommenderVersion,
      }),
    )
    .digest("base64url")
    .slice(0, 24);
}

export async function replaceMaterializedFeedQueue(
  visitorId: string,
  identity: MaterializedFeedIdentity,
  inputCards: readonly MaterializedFeedInputCard[],
  now = new Date(),
) {
  await ensureDatabaseReady();
  const cards = inputCards.slice(0, MATERIALIZED_FEED_QUEUE_MAX_SIZE);
  const queueVersion = queueVersionFor(identity, cards);
  const expiresAt = new Date(now.getTime() + MATERIALIZED_FEED_QUEUE_TTL_MS);

  const queue = await withDatabaseWriteRetry(() => db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: visitorFeedQueues.id })
      .from(visitorFeedQueues)
      .where(eq(visitorFeedQueues.visitorId, visitorId))
      .limit(1);
    const id = existing?.id ?? randomUUID();
    if (existing) {
      await transaction
        .update(visitorFeedQueues)
        .set({
          candidateProfileId: identity.candidateProfileId,
          profileRevision: identity.profileRevision,
          queueVersion,
          recommenderVersion: identity.recommenderVersion,
          catalogRevisionId: identity.catalog.revisionId,
          catalogRetrievedAt: identity.catalog.retrievedAt,
          pendingInteractionCount: 0,
          preferenceDirtyAt: null,
          invalidatedAt: null,
          generatedAt: now,
          expiresAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(visitorFeedQueues.id, id),
            eq(visitorFeedQueues.visitorId, visitorId),
          ),
        );
      await transaction
        .delete(visitorFeedQueueEntries)
        .where(
          and(
            eq(visitorFeedQueueEntries.queueId, id),
            eq(visitorFeedQueueEntries.visitorId, visitorId),
          ),
        );
    } else {
      await transaction.insert(visitorFeedQueues).values({
        id,
        visitorId,
        candidateProfileId: identity.candidateProfileId,
        profileRevision: identity.profileRevision,
        queueVersion,
        recommenderVersion: identity.recommenderVersion,
        catalogRevisionId: identity.catalog.revisionId,
        catalogRetrievedAt: identity.catalog.retrievedAt,
        generatedAt: now,
        expiresAt,
        updatedAt: now,
      });
    }

    for (let index = 0; index < cards.length; index += 20) {
      const batch = cards.slice(index, index + 20);
      if (batch.length === 0) continue;
      await transaction.insert(visitorFeedQueueEntries).values(
        batch.map((card, offset) => ({
          queueId: id,
          visitorId,
          position: index + offset,
          jobListingId: card.id,
          tier: card.tier,
          cardSnapshot: card.snapshot,
          createdAt: now,
        })),
      );
    }

    return {
      id,
      visitorId,
      candidateProfileId: identity.candidateProfileId,
      profileRevision: identity.profileRevision,
      queueVersion,
      recommenderVersion: identity.recommenderVersion,
      catalogRevisionId: identity.catalog.revisionId,
      catalogRetrievedAt: identity.catalog.retrievedAt,
      pendingInteractionCount: 0,
      preferenceDirtyAt: null,
      invalidatedAt: null,
      generatedAt: now,
      expiresAt,
      updatedAt: now,
    } satisfies typeof visitorFeedQueues.$inferSelect;
  }));

  return queue;
}

export async function readFreshlyMaterializedFeedPage(
  visitorId: string,
  queue: typeof visitorFeedQueues.$inferSelect,
  options: { cursor?: string | null; limit: number },
) {
  return queuePage(visitorId, queue, options, "live_ranked");
}

export interface DurableFeedPageSession {
  id: string;
  exposures: ReadonlyMap<string, string>;
  generatedAt: Date;
  profileRevision: number;
  queueVersion: string;
  source: "live_ranked" | "cached";
}

/**
 * The response is not returned to a client until this transaction commits, so
 * every learnable card has a durable, visitor-scoped exposure first.
 */
export async function recordFeedPageSession(
  visitorId: string,
  page: MaterializedFeedPage,
  now = new Date(),
): Promise<DurableFeedPageSession> {
  await ensureDatabaseReady();
  const sessionId = randomUUID();
  const expiresAt = new Date(now.getTime() + MATERIALIZED_FEED_SESSION_TTL_MS);
  const exposureRows = page.entries.map((entry) => ({
    id: randomUUID(),
    visitorId,
    sessionId,
    queueId: page.queueId,
    queueVersion: page.queueVersion,
    jobListingId: entry.jobId,
    position: entry.position,
    tier: entry.tier,
    exposedAt: now,
  }));

  await withDatabaseWriteRetry(() => db.transaction(async (transaction) => {
    await transaction.insert(feedSessions).values({
      id: sessionId,
      visitorId,
      queueId: page.queueId,
      queueVersion: page.queueVersion,
      profileRevision: page.profileRevision,
      source: page.source,
      pageStartPosition: page.entries[0]?.position ?? 0,
      pageSize: page.entries.length,
      startedAt: now,
      lastSeenAt: now,
      expiresAt,
    });
    if (exposureRows.length > 0) {
      await transaction.insert(feedExposures).values(exposureRows);
    }
  }));

  return {
    id: sessionId,
    exposures: new Map(
      exposureRows.map((exposure) => [exposure.jobListingId, exposure.id]),
    ),
    generatedAt: now,
    profileRevision: page.profileRevision,
    queueVersion: page.queueVersion,
    source: page.source,
  };
}
