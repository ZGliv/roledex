import "server-only";

import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { ingestionRuns, jobSources } from "@/db/schema";
import { shouldAutoRefreshDiscovery } from "@/features/discovery/refresh-policy";
import {
  earliestNextSourceAttempt,
  nextSourceAttemptAt,
  selectDueJobSources,
} from "@/features/discovery/source-scheduling";
import { canonicalJobSourceUrl } from "@/features/discovery/source-url";

export async function getDiscoveryStatus() {
  await ensureDatabaseReady();
  const [[latestRun], [latestSuccessfulRun], [sourceCounts], activeSources] = await Promise.all([
    db
      .select()
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(1),
    db
      .select({ completedAt: ingestionRuns.completedAt })
      .from(ingestionRuns)
      .where(
        and(
          gt(ingestionRuns.successfulSourceCount, 0),
          isNotNull(ingestionRuns.completedAt),
        ),
      )
      .orderBy(desc(ingestionRuns.completedAt))
      .limit(1),
    db
      .select({
        configured: sql<number>`count(*)`,
        enabled: sql<number>`sum(case when ${jobSources.enabled} = 1 then 1 else 0 end)`,
      })
      .from(jobSources)
      .where(isNull(jobSources.removedAt)),
    db
      .select()
      .from(jobSources)
      .where(and(eq(jobSources.enabled, true), isNull(jobSources.removedAt))),
  ]);

  const now = new Date();
  const dueSources = selectDueJobSources(activeSources, now, activeSources.length);
  const needsRefresh =
    dueSources.length > 0 &&
    shouldAutoRefreshDiscovery({
      latestRun: latestRun ?? null,
      latestSuccessfulCompletedAt: latestSuccessfulRun?.completedAt ?? null,
      now,
    });

  return {
    configuredSources: Number(sourceCounts?.configured ?? 0),
    enabledSources: Number(sourceCounts?.enabled ?? 0),
    dueSources: dueSources.length,
    nextSourceCheckAt:
      earliestNextSourceAttempt(activeSources)?.toISOString() ?? null,
    needsRefresh,
    latestRun: latestRun
      ? {
          status: latestRun.status,
          startedAt: latestRun.startedAt.toISOString(),
          completedAt: latestRun.completedAt?.toISOString() ?? null,
          newJobs: latestRun.newJobCount,
          changedJobs: latestRun.changedJobCount,
          fetchedJobs: latestRun.fetchedJobCount,
          successfulSources: latestRun.successfulSourceCount,
          failedSources: latestRun.failedSourceCount,
          truncatedSources: latestRun.errors.filter(
            (error) => error.code === "source_truncated",
          ).length,
        }
      : null,
  };
}

export type DiscoveryStatusView = Awaited<ReturnType<typeof getDiscoveryStatus>>;

export async function getJobSourcesView() {
  await ensureDatabaseReady();
  const sources = await db
    .select()
    .from(jobSources)
    .where(isNull(jobSources.removedAt))
    .orderBy(jobSources.companyName);

  return sources.map((source) => ({
    id: source.id,
    provider: source.provider,
    providerKey: source.providerKey,
    companyName: source.companyName,
    companyDomain: source.companyDomain,
    enabled: source.enabled,
    refreshIntervalHours: source.refreshIntervalHours,
    sourceUrl: canonicalJobSourceUrl(source.provider, source.providerKey),
    nextAttemptAt: nextSourceAttemptAt(source)?.toISOString() ?? null,
    lastAttemptedAt: source.lastAttemptedAt?.toISOString() ?? null,
    lastSucceededAt: source.lastSucceededAt?.toISOString() ?? null,
    lastErrorAt: source.lastErrorAt?.toISOString() ?? null,
    lastError: source.lastError,
  }));
}

export type JobSourceView = Awaited<ReturnType<typeof getJobSourcesView>>[number];

export async function getEnabledSourceCount() {
  await ensureDatabaseReady();
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobSources)
    .where(and(eq(jobSources.enabled, true), isNull(jobSources.removedAt)));
  return Number(result?.count ?? 0);
}
