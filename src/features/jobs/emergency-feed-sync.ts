import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { visitorJobStates } from "@/db/schema";
import { recordJobDecisionForVisitor } from "@/features/decisions/service";
import { DEFAULT_JOB_SOURCES } from "@/features/discovery/default-sources";
import { fetchJobSourceBatch } from "@/features/discovery/source-fetch";
import type { DiscoveryJob } from "@/features/discovery/types";
import { upsertSourcedJob, type StructuredJobSalary } from "@/features/jobs/service";
import { canonicalizeSourceUrl, hashValue } from "@/lib/hashing";

export type EmergencyDecisionSyncInput = {
  decision: "saved" | "skipped";
  externalId: string;
  id: string;
  provider: "ashby" | "greenhouse" | "lever";
  sourceKey: string;
};

function sourceFor(input: EmergencyDecisionSyncInput) {
  return DEFAULT_JOB_SOURCES.find(
    (source) =>
      source.provider === input.provider && source.providerKey === input.sourceKey,
  );
}

function contentHash(job: DiscoveryJob) {
  return hashValue({
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

function storedSalary(job: DiscoveryJob): StructuredJobSalary | null {
  const salary = job.salary;
  if (!salary || salary.currency?.toUpperCase() !== "USD") return null;
  if (salary.minimumMajorUnits === null && salary.maximumMajorUnits === null) return null;
  let multiplier = 1;
  let period: StructuredJobSalary["period"] = "year";
  if (salary.period === "hour") period = "hour";
  else if (salary.period === "month") period = "month";
  else if (salary.period === "day") multiplier = 260;
  else if (salary.period === "week") multiplier = 52;
  else if (salary.period !== "year") return null;
  const cents = (value: number | null) =>
    value === null ? null : Math.round(value * multiplier * 100);
  return {
    currency: "USD",
    maximumCents: cents(salary.maximumMajorUnits),
    minimumCents: cents(salary.minimumMajorUnits),
    period,
  };
}

function dateOrNull(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function importOfficialJob(
  source: NonNullable<ReturnType<typeof sourceFor>>,
  job: DiscoveryJob,
) {
  return upsertSourcedJob({
    company: job.company,
    contentHash: contentHash(job),
    deduplicationKey: hashValue({
      externalId: job.externalId,
      provider: source.provider,
      providerKey: source.providerKey,
    }),
    descriptionRaw: job.descriptionText,
    employmentType: job.employmentType === "unknown" ? null : job.employmentType,
    location: job.location,
    postedAt: dateOrNull(job.postedAt),
    salary: storedSalary(job),
    salarySourceHint: "employer_posted",
    sourceName: `${source.companyName} careers`,
    sourceType: "api",
    sourceUrl: job.applyUrl || job.jobUrl,
    title: job.title,
    workArrangement:
      job.workArrangement === "unknown" ? null : job.workArrangement,
  });
}

export async function syncEmergencyDecisionsForVisitor(
  visitorId: string,
  decisions: readonly EmergencyDecisionSyncInput[],
) {
  const grouped = new Map<string, EmergencyDecisionSyncInput[]>();
  for (const decision of decisions) {
    const key = `${decision.provider}:${decision.sourceKey}`;
    grouped.set(key, [...(grouped.get(key) ?? []), decision]);
  }

  const syncedIds: string[] = [];
  for (const sourceDecisions of grouped.values()) {
    const source = sourceFor(sourceDecisions[0]);
    if (!source) continue;
    const batch = await fetchJobSourceBatch(source, {
      maxItems: 500,
      maxResponseBytes: 8_000_000,
      timeoutMs: 10_000,
    });
    const jobsById = new Map(batch.jobs.map((job) => [job.externalId, job]));

    for (const decision of sourceDecisions) {
      const job = jobsById.get(decision.externalId);
      if (!job) continue;
      const imported = await importOfficialJob(source, job);
      const [state] = await db
        .select({
          currentDecision: visitorJobStates.currentDecision,
          currentDecisionEventId: visitorJobStates.currentDecisionEventId,
        })
        .from(visitorJobStates)
        .where(
          and(
            eq(visitorJobStates.visitorId, visitorId),
            eq(visitorJobStates.jobListingId, imported.jobId),
          ),
        )
        .limit(1);
      if (state?.currentDecision === decision.decision) {
        syncedIds.push(decision.id);
        continue;
      }
      await recordJobDecisionForVisitor(visitorId, {
        decision: decision.decision,
        expectedDecision: state?.currentDecision ?? "unseen",
        expectedDecisionEventId: state?.currentDecisionEventId ?? null,
        jobId: imported.jobId,
      });
      syncedIds.push(decision.id);
    }
  }
  return syncedIds;
}
