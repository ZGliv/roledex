import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { jobDecisionEvents, jobListings, jobRevisions } from "@/db/schema";
import { requireVisitorId } from "@/features/auth/visitor";
import { aggregateResearchSessions } from "@/features/sessions/aggregate";

export const RESEARCH_HISTORY_DAYS = 90;
export const RESEARCH_HISTORY_EVENT_LIMIT = 500;

export async function getRecentResearchSessions(now = new Date()) {
  await ensureDatabaseReady();
  const visitorId = await requireVisitorId();
  const rangeStart = new Date(
    now.getTime() - RESEARCH_HISTORY_DAYS * 24 * 60 * 60 * 1_000,
  );

  const rows = await db
    .select({
      company: jobRevisions.company,
      decidedAt: jobDecisionEvents.decidedAt,
      decision: jobDecisionEvents.decision,
      id: jobDecisionEvents.id,
      jobId: jobDecisionEvents.jobListingId,
      note: jobDecisionEvents.note,
      previousDecision: jobDecisionEvents.previousDecision,
      title: jobRevisions.title,
    })
    .from(jobDecisionEvents)
    .innerJoin(jobListings, eq(jobDecisionEvents.jobListingId, jobListings.id))
    .innerJoin(jobRevisions, eq(jobListings.currentRevisionId, jobRevisions.id))
    .where(
      and(
        eq(jobDecisionEvents.visitorId, visitorId),
        gte(jobDecisionEvents.decidedAt, rangeStart),
      ),
    )
    .orderBy(desc(jobDecisionEvents.decidedAt), desc(jobDecisionEvents.id))
    .limit(RESEARCH_HISTORY_EVENT_LIMIT + 1);

  const historyTruncated = rows.length > RESEARCH_HISTORY_EVENT_LIMIT;
  const boundedRows = rows.slice(0, RESEARCH_HISTORY_EVENT_LIMIT);

  return {
    ...aggregateResearchSessions(
      boundedRows.map((row) => ({
        ...row,
        decidedAt: row.decidedAt.toISOString(),
      })),
    ),
    generatedAt: now.toISOString(),
    historyTruncated,
    rangeStart: rangeStart.toISOString(),
  };
}

export type RecentResearchSessionsView = Awaited<
  ReturnType<typeof getRecentResearchSessions>
>;
