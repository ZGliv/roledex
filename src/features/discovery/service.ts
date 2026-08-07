import "server-only";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  ingestionRuns,
  jobListings,
  jobSources,
  sourceSightings,
  type IngestionError,
  type IngestionRunStatus,
  type IngestionRunTrigger,
  type JobSource,
} from "@/db/schema";
import { DEFAULT_JOB_SOURCES } from "@/features/discovery/default-sources";
import { DiscoveryProviderError } from "@/features/discovery/providers";
import {
  isDiscoveryImportCandidate,
  scoreDiscoveryImportPriority,
} from "@/features/discovery/relevance";
import { selectMissingListingIds } from "@/features/discovery/reconciliation";
import { FIT_SCORING_VERSION } from "@/features/fit/scoring-config";
import { JOB_PARSER_VERSION } from "@/features/jobs/types";
import {
  completedDiscoveryRefreshMessage,
  getDiscoveryRefreshDeferral,
} from "@/features/discovery/refresh-policy";
import { fetchJobSourceBatch } from "@/features/discovery/source-fetch";
import {
  earliestNextSourceAttempt,
  selectDueJobSources,
} from "@/features/discovery/source-scheduling";
import type {
  DiscoveryBatch,
  DiscoveryEmploymentType,
  DiscoveryJob,
} from "@/features/discovery/types";
import {
  upsertSourcedJob,
  type StructuredJobSalary,
} from "@/features/jobs/service";
import { canonicalizeSourceUrl, hashValue } from "@/lib/hashing";

const MAX_ITEMS_PER_SOURCE = 100;
const MAX_RESPONSE_BYTES = 7_500_000;
const MAX_IMPORTS_PER_RUN = 40;
const MAX_SOURCES_PER_RUN = 20;
const FETCH_CONCURRENCY = 4;

type CandidateJob = {
  contentHash: string;
  job: DiscoveryJob;
  score: number;
  source: JobSource;
};

export type DiscoveryRefreshSummary = {
  changedJobs: number;
  expiredJobs: number;
  failedSources: number;
  fetchedJobs: number;
  filteredJobs: number;
  finishedAt: string;
  kind: "completed";
  message: string;
  newJobs: number;
  runId: string;
  status: IngestionRunStatus;
  successfulSources: number;
  networkSources: number;
  queuedSources: number;
  truncatedSources: number;
  unchangedJobs: number;
};

export type DiscoveryRefreshDeferred = {
  kind: "backoff" | "no_sources" | "recent" | "running";
  message: string;
  retryAt: string;
};

export type DiscoveryRefreshResult =
  | DiscoveryRefreshSummary
  | DiscoveryRefreshDeferred;

type IngestionProgress = {
  changedJobCount: number;
  errors: IngestionError[];
  expiredJobCount: number;
  failedSourceCount: number;
  fetchedJobCount: number;
  filteredJobCount: number;
  newJobCount: number;
  successfulSourceCount: number;
  truncatedSourceCount: number;
  unchangedJobCount: number;
};

async function ensureStarterSources() {
  await db
    .insert(jobSources)
    .values(
      DEFAULT_JOB_SOURCES.map((source) => ({
        provider: source.provider,
        providerKey: source.providerKey,
        companyName: source.companyName,
        companyDomain: source.companyDomain,
      })),
    )
    .onConflictDoNothing();
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function fetchSource(source: JobSource): Promise<DiscoveryBatch> {
  return fetchJobSourceBatch(source, {
    maxItems: MAX_ITEMS_PER_SOURCE,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    timeoutMs: 12_000,
  });
}

function ingestionError(source: JobSource, error: unknown): IngestionError {
  if (error instanceof DiscoveryProviderError) {
    return {
      code: error.code,
      jobSourceId: source.id,
      message: error.message,
      provider: source.provider,
    };
  }
  return {
    code: "unexpected",
    jobSourceId: source.id,
    message: error instanceof Error ? error.message : "The source refresh failed.",
    provider: source.provider,
  };
}

function jobContentHash(job: DiscoveryJob) {
  return hashValue({
    analysisVersions: {
      parser: JOB_PARSER_VERSION,
      scoring: FIT_SCORING_VERSION,
    },
    applyUrl: canonicalizeSourceUrl(job.applyUrl),
    company: job.company,
    descriptionText: job.descriptionText,
    employmentType: job.employmentType,
    externalId: job.externalId,
    jobUrl: canonicalizeSourceUrl(job.jobUrl),
    location: job.location,
    postedAt: job.postedAt,
    salary: job.salary,
    title: job.title,
    updatedAt: job.updatedAt,
    workArrangement: job.workArrangement,
  });
}

function asDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toStoredSalary(job: DiscoveryJob): StructuredJobSalary | null {
  const salary = job.salary;
  if (!salary || !["hour", "month", "year"].includes(salary.period)) return null;
  if (salary.minimumMajorUnits === null && salary.maximumMajorUnits === null) return null;
  const toCents = (value: number | null) =>
    value === null ? null : Math.max(0, Math.round(value * 100));
  return {
    currency: salary.currency || "USD",
    minimumCents: toCents(salary.minimumMajorUnits),
    maximumCents: toCents(salary.maximumMajorUnits),
    period: salary.period as "hour" | "month" | "year",
  };
}

function toEmploymentType(value: DiscoveryEmploymentType) {
  return value === "unknown" ? null : value;
}

function selectDiverseCandidates(
  candidates: CandidateJob[],
  limit = MAX_IMPORTS_PER_RUN,
) {
  const groups = new Map<string, CandidateJob[]>();
  for (const candidate of candidates.toSorted((left, right) => right.score - left.score)) {
    const existing = groups.get(candidate.source.id) ?? [];
    existing.push(candidate);
    groups.set(candidate.source.id, existing);
  }

  const selected: CandidateJob[] = [];
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const candidate = group.shift();
      if (!candidate) continue;
      selected.push(candidate);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

function deferredResult(
  kind: DiscoveryRefreshDeferred["kind"],
  retryAt: Date,
): DiscoveryRefreshDeferred {
  const retryTime = retryAt.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    kind,
    retryAt: retryAt.toISOString(),
    message:
      kind === "no_sources"
        ? "Connect or enable a company source to start checking live roles."
        : kind === "running"
        ? "A job refresh is already running. The deck will update when it finishes."
        : kind === "backoff"
          ? `The last refresh could not reach any feeds. You can try again after ${retryTime}.`
          : `The live source network is caught up for now. The next source check is available after ${retryTime}.`,
  };
}

function statusForProgress(progress: IngestionProgress): IngestionRunStatus {
  if (progress.successfulSourceCount === 0) return "failed";
  return progress.failedSourceCount > 0 ||
    progress.errors.length > progress.failedSourceCount
    ? "partial"
    : "succeeded";
}

function pipelineError(error: unknown): IngestionError {
  return {
    code: "refresh_pipeline",
    message: (error instanceof Error
      ? error.message
      : "The refresh pipeline stopped unexpectedly."
    ).slice(0, 1_000),
  };
}

async function finalizeIngestionRun(input: {
  finishedAt: Date;
  progress: IngestionProgress;
  runId: string;
  status: IngestionRunStatus;
}) {
  await db
    .update(ingestionRuns)
    .set({
      status: input.status,
      successfulSourceCount: input.progress.successfulSourceCount,
      failedSourceCount: input.progress.failedSourceCount,
      fetchedJobCount: input.progress.fetchedJobCount,
      filteredJobCount: input.progress.filteredJobCount,
      newJobCount: input.progress.newJobCount,
      changedJobCount: input.progress.changedJobCount,
      unchangedJobCount: input.progress.unchangedJobCount,
      expiredJobCount: input.progress.expiredJobCount,
      errors: input.progress.errors.slice(0, 50),
      completedAt: input.finishedAt,
    })
    .where(eq(ingestionRuns.id, input.runId));
}

function completedResult(input: {
  finishedAt: Date;
  networkSources: number;
  progress: IngestionProgress;
  queuedSources: number;
  runId: string;
  status: IngestionRunStatus;
}): DiscoveryRefreshSummary {
  const { progress, status } = input;
  return {
    kind: "completed",
    runId: input.runId,
    status,
    message: completedDiscoveryRefreshMessage({
      status,
      newJobs: progress.newJobCount,
      changedJobs: progress.changedJobCount,
      expiredJobs: progress.expiredJobCount,
      successfulSources: progress.successfulSourceCount,
      failedSources: progress.failedSourceCount,
      truncatedSources: progress.truncatedSourceCount,
      queuedSources: input.queuedSources,
    }),
    fetchedJobs: progress.fetchedJobCount,
    filteredJobs: progress.filteredJobCount,
    newJobs: progress.newJobCount,
    changedJobs: progress.changedJobCount,
    expiredJobs: progress.expiredJobCount,
    unchangedJobs: progress.unchangedJobCount,
    successfulSources: progress.successfulSourceCount,
    networkSources: input.networkSources,
    queuedSources: input.queuedSources,
    failedSources: progress.failedSourceCount,
    truncatedSources: progress.truncatedSourceCount,
    finishedAt: input.finishedAt.toISOString(),
  };
}

export async function refreshDiscoveryJobs(
  trigger: IngestionRunTrigger = "on_demand",
  options: { force?: boolean } = {},
): Promise<DiscoveryRefreshResult> {
  await ensureDatabaseReady();
  const now = new Date();
  // Most empty-deck checks arrive during the global cooldown. Read the lease
  // first so those calls avoid re-upserting every starter source and loading
  // the full source table. The transaction below still rechecks atomically for
  // callers that race past this fast path.
  const [latestRun] = await db
    .select()
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(1);
  const fastDeferral = getDiscoveryRefreshDeferral(latestRun ?? null, now);
  if (
    fastDeferral &&
    (!options.force || fastDeferral.kind === "running")
  ) {
    return deferredResult(fastDeferral.kind, fastDeferral.retryAt);
  }

  await ensureStarterSources();
  const allSources = await db
    .select()
    .from(jobSources)
    .where(and(eq(jobSources.enabled, true), isNull(jobSources.removedAt)))
    .orderBy(jobSources.companyName);
  const dueSources = selectDueJobSources(allSources, now, allSources.length);
  const sources = dueSources.slice(0, MAX_SOURCES_PER_RUN);
  const queuedSources = Math.max(0, dueSources.length - sources.length);

  const lease = await db.transaction(async (transaction) => {
    const [latest] = await transaction
      .select()
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(1);

    const deferral = getDiscoveryRefreshDeferral(latest ?? null, now);
    if (deferral && (!options.force || deferral.kind === "running")) {
      return deferredResult(deferral.kind, deferral.retryAt);
    }

    if (allSources.length === 0) {
      return deferredResult("no_sources", now);
    }

    if (sources.length === 0) {
      return deferredResult(
        "recent",
        earliestNextSourceAttempt(allSources) ??
          new Date(now.getTime() + 24 * 60 * 60 * 1_000),
      );
    }

    if (latest?.status === "running") {
      await transaction
        .update(ingestionRuns)
        .set({
          status: "failed",
          completedAt: now,
          errors: [
            ...latest.errors.slice(-49),
            {
              code: "run_expired",
              message:
                "The refresh did not finish inside its execution window and was released for retry.",
            },
          ],
        })
        .where(eq(ingestionRuns.id, latest.id));
    }

    const [run] = await transaction
      .insert(ingestionRuns)
      .values({ trigger, requestedSourceCount: sources.length })
      .returning();
    return run;
  });

  if ("kind" in lease) return lease;
  const run = lease;
  const progress: IngestionProgress = {
    changedJobCount: 0,
    errors: [],
    expiredJobCount: 0,
    failedSourceCount: 0,
    fetchedJobCount: 0,
    filteredJobCount: 0,
    newJobCount: 0,
    successfulSourceCount: 0,
    truncatedSourceCount: 0,
    unchangedJobCount: 0,
  };

  try {
    const fetched = await mapWithConcurrency(
      sources,
      FETCH_CONCURRENCY,
      async (source) => {
        try {
          const batch = await fetchSource(source);
          return { batch, source, error: null };
        } catch (error) {
          return { batch: null, source, error: ingestionError(source, error) };
        }
      },
    );

    const successful = fetched.filter(
      (
        result,
      ): result is (typeof fetched)[number] & {
        batch: DiscoveryBatch;
        error: null;
      } => result.batch !== null,
    );
    const failed = fetched.filter((result) => result.error !== null);
    progress.successfulSourceCount = successful.length;
    progress.failedSourceCount = failed.length;
    const truncated = successful.filter((result) => result.batch.truncated);
    progress.truncatedSourceCount = truncated.length;
    progress.fetchedJobCount = successful.reduce(
      (total, result) => total + result.batch.jobs.length,
      0,
    );
    progress.errors.push(
      ...failed
        .map((result) => result.error)
        .filter((error): error is IngestionError => error !== null),
      ...truncated.map(({ batch, source }) => ({
        code: "source_truncated",
        jobSourceId: source.id,
        message:
          batch.totalReported === null
            ? `${source.companyName} returned more jobs than the ${batch.jobs.length}-job scan limit.`
            : `${source.companyName} returned ${batch.jobs.length} of ${batch.totalReported} jobs inside the bounded scan.`,
        provider: source.provider,
      })),
    );

    for (const result of fetched) {
      await db
        .update(jobSources)
        .set(
          result.error
            ? {
                lastAttemptedAt: now,
                lastErrorAt: now,
                lastError: result.error.message.slice(0, 1_000),
                updatedAt: now,
              }
            : {
                lastAttemptedAt: now,
                lastSucceededAt: now,
                lastErrorAt: null,
                lastError: null,
                updatedAt: now,
              },
        )
        .where(eq(jobSources.id, result.source.id));
    }

    const relevant: CandidateJob[] = successful.flatMap(({ batch, source }) =>
      batch.jobs
        .filter(isDiscoveryImportCandidate)
        .map((job) => ({
          contentHash: jobContentHash(job),
          job,
          score: scoreDiscoveryImportPriority(job),
          source,
        })),
    );

    const currentSightingConditions = successful.flatMap(({ batch, source }) =>
      batch.jobs.length > 0
        ? [
            and(
              eq(sourceSightings.jobSourceId, source.id),
              inArray(
                sourceSightings.externalJobId,
                batch.jobs.map((job) => job.externalId),
              ),
            ),
          ]
        : [],
    );
    const currentSightings =
      currentSightingConditions.length > 0
        ? await db
            .select()
            .from(sourceSightings)
            .where(or(...currentSightingConditions))
        : [];
    const activeListings = await db
      .select({ id: jobListings.id })
      .from(jobListings)
      .where(eq(jobListings.lifecycleStatus, "active"));
    const successfulSourceIds = successful.map(({ source }) => source.id);
    const reconciliationSightings =
      successfulSourceIds.length > 0 && activeListings.length > 0
        ? await db
            .select()
            .from(sourceSightings)
            .where(
              and(
                inArray(sourceSightings.jobSourceId, successfulSourceIds),
                inArray(
                  sourceSightings.jobListingId,
                  activeListings.map((listing) => listing.id),
                ),
              ),
            )
        : [];
    const sightings = [
      ...new Map(
        [...currentSightings, ...reconciliationSightings].map((sighting) => [
          sighting.id,
          sighting,
        ]),
      ).values(),
    ];
    const sightingByIdentity = new Map(
      sightings.map((sighting) => [
        `${sighting.jobSourceId}:${sighting.externalJobId}`,
        sighting,
      ]),
    );

    const missingListingIds = selectMissingListingIds({
      successfulSources: successful.map(({ batch, source }) => ({
        sourceId: source.id,
        externalJobIds: batch.jobs.map((job) => job.externalId),
        truncated: batch.truncated,
      })),
      sightings,
    });
    if (missingListingIds.length > 0) {
      const expired = await db
        .update(jobListings)
        .set({ lifecycleStatus: "expired", updatedAt: now })
        .where(
          and(
            inArray(jobListings.id, missingListingIds),
            eq(jobListings.lifecycleStatus, "active"),
          ),
        )
        .returning({ id: jobListings.id });
      progress.expiredJobCount += expired.length;
    }

    const relevantIdentities = new Set(
      relevant.map(
        (candidate) => `${candidate.source.id}:${candidate.job.externalId}`,
      ),
    );
    const irrelevantListingIds = new Set<string>();
    for (const { batch, source } of successful) {
      for (const job of batch.jobs) {
        const identity = `${source.id}:${job.externalId}`;
        if (relevantIdentities.has(identity)) continue;
        const sighting = sightingByIdentity.get(identity);
        if (!sighting) continue;

        await db
          .update(sourceSightings)
          .set({
            canonicalUrl: canonicalizeSourceUrl(job.jobUrl) ?? job.jobUrl,
            lastSeenAt: now,
            lastSeenIngestionRunId: run.id,
            sourceUpdatedAt: asDate(job.updatedAt),
          })
          .where(eq(sourceSightings.id, sighting.id));
        if (sighting.jobListingId) {
          irrelevantListingIds.add(sighting.jobListingId);
        }
      }
    }

    if (irrelevantListingIds.size > 0) {
      const expired = await db
        .update(jobListings)
        .set({ lifecycleStatus: "expired", updatedAt: now })
        .where(
          and(
            inArray(jobListings.id, [...irrelevantListingIds]),
            eq(jobListings.lifecycleStatus, "active"),
          ),
        )
        .returning({ id: jobListings.id });
      progress.expiredJobCount += expired.length;
    }

    const unchanged: CandidateJob[] = [];
    const pendingExisting: CandidateJob[] = [];
    const pendingNew: CandidateJob[] = [];
    for (const candidate of relevant) {
      const identity = `${candidate.source.id}:${candidate.job.externalId}`;
      const sighting = sightingByIdentity.get(identity);
      if (
        sighting?.jobListingId &&
        sighting.contentHash === candidate.contentHash
      ) {
        unchanged.push(candidate);
      } else if (sighting?.jobListingId) {
        pendingExisting.push(candidate);
      } else {
        pendingNew.push(candidate);
      }
    }
    progress.unchangedJobCount = unchanged.length;

    for (const candidate of unchanged) {
      await db
        .update(sourceSightings)
        .set({
          canonicalUrl:
            canonicalizeSourceUrl(candidate.job.jobUrl) ?? candidate.job.jobUrl,
          lastSeenAt: now,
          lastSeenIngestionRunId: run.id,
          sourceUpdatedAt: asDate(candidate.job.updatedAt),
        })
        .where(
          and(
            eq(sourceSightings.jobSourceId, candidate.source.id),
            eq(sourceSightings.externalJobId, candidate.job.externalId),
          ),
        );

      const sighting = sightingByIdentity.get(
        `${candidate.source.id}:${candidate.job.externalId}`,
      );
      if (sighting?.jobListingId) {
        await db
          .update(jobListings)
          .set({ lifecycleStatus: "active", updatedAt: now })
          .where(eq(jobListings.id, sighting.jobListingId));
      }
    }

    // Re-run parsing/scoring upgrades for already-imported jobs before using
    // the bounded budget on brand-new candidates.
    const selectedExisting = selectDiverseCandidates(pendingExisting);
    const selected = [
      ...selectedExisting,
      ...selectDiverseCandidates(
        pendingNew,
        MAX_IMPORTS_PER_RUN - selectedExisting.length,
      ),
    ];
    progress.filteredJobCount = Math.max(
      0,
      progress.fetchedJobCount - unchanged.length - selected.length,
    );

    for (const candidate of selected) {
      try {
        const identityKey = hashValue({
          provider: candidate.source.provider,
          providerKey: candidate.source.providerKey,
          externalId: candidate.job.externalId,
        });
        const result = await upsertSourcedJob({
          company: candidate.job.company,
          contentHash: candidate.contentHash,
          deduplicationKey: identityKey,
          descriptionRaw: candidate.job.descriptionText,
          employmentType: toEmploymentType(candidate.job.employmentType),
          location: candidate.job.location,
          postedAt: asDate(candidate.job.postedAt),
          salary: toStoredSalary(candidate.job),
          // Every discovered description comes directly from the employer's
          // official ATS feed, so any salary parsed from that text is posted by
          // the employer even when the feed lacks a separate salary object.
          salarySourceHint: "employer_posted",
          sourceName: `${candidate.source.companyName} careers`,
          sourceType: "api",
          sourceUrl: candidate.job.applyUrl || candidate.job.jobUrl,
          title: candidate.job.title,
          workArrangement:
            candidate.job.workArrangement === "unknown"
              ? null
              : candidate.job.workArrangement,
        });

        await db
          .insert(sourceSightings)
          .values({
            jobSourceId: candidate.source.id,
            externalJobId: candidate.job.externalId,
            jobListingId: result.jobId,
            canonicalUrl:
              canonicalizeSourceUrl(candidate.job.jobUrl) ??
              candidate.job.jobUrl,
            contentHash: candidate.contentHash,
            sourceUpdatedAt: asDate(candidate.job.updatedAt),
            firstSeenAt: now,
            lastSeenAt: now,
            lastSeenIngestionRunId: run.id,
          })
          .onConflictDoUpdate({
            target: [sourceSightings.jobSourceId, sourceSightings.externalJobId],
            set: {
              jobListingId: result.jobId,
              canonicalUrl:
                canonicalizeSourceUrl(candidate.job.jobUrl) ??
                candidate.job.jobUrl,
              contentHash: candidate.contentHash,
              sourceUpdatedAt: asDate(candidate.job.updatedAt),
              lastSeenAt: now,
              lastSeenIngestionRunId: run.id,
            },
          });

        if (result.created) progress.newJobCount += 1;
        else if (result.changed) progress.changedJobCount += 1;
      } catch (error) {
        progress.errors.push({
          code: "job_import",
          jobSourceId: candidate.source.id,
          message: `${candidate.job.title}: ${
            error instanceof Error ? error.message : "Import failed."
          }`.slice(0, 1_000),
          provider: candidate.source.provider,
        });
      }
    }

    const status = statusForProgress(progress);
    const finishedAt = new Date();
    await finalizeIngestionRun({
      finishedAt,
      progress,
      runId: run.id,
      status,
    });
    return completedResult({
      finishedAt,
      networkSources: allSources.length,
      progress,
      queuedSources,
      runId: run.id,
      status,
    });
  } catch (error) {
    console.error("Job discovery refresh stopped before completion.", error);
    progress.errors.push(pipelineError(error));
    const status = statusForProgress(progress);
    const finishedAt = new Date();

    try {
      await finalizeIngestionRun({
        finishedAt,
        progress,
        runId: run.id,
        status,
      });
    } catch (finalizationError) {
      console.error("The failed discovery run could not be finalized.", finalizationError);
      throw error;
    }

    return completedResult({
      finishedAt,
      networkSources: allSources.length,
      progress,
      queuedSources,
      runId: run.id,
      status,
    });
  }
}
