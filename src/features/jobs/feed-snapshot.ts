import type { JobCardViewModel } from "@/features/jobs/components/job-card";

const SNAPSHOT_VERSION = 1;
const MAX_SNAPSHOT_JOBS = 30;
const SNAPSHOT_KEYS = {
  feed: "jobswipe:last-good-feed:v1",
  saved: "jobswipe:last-good-saved:v1",
} as const;

export type JobSnapshotKind = keyof typeof SNAPSHOT_KEYS;

export type CachedJobSummary = Pick<
  JobCardViewModel,
  | "company"
  | "datePosted"
  | "employmentType"
  | "id"
  | "location"
  | "salaryDisplay"
  | "sourceUrl"
  | "title"
  | "workArrangement"
>;

export interface JobFeedSnapshot {
  jobs: CachedJobSummary[];
  kind: JobSnapshotKind;
  savedAt: string;
  version: typeof SNAPSHOT_VERSION;
}

export function formatJobFeedSnapshotFreshness(
  savedAt: string,
  now = Date.now(),
) {
  const savedAtMilliseconds = Date.parse(savedAt);
  if (!Number.isFinite(savedAtMilliseconds)) return "Saved on this device";

  const elapsedMilliseconds = Math.max(0, now - savedAtMilliseconds);
  const elapsedMinutes = Math.floor(elapsedMilliseconds / 60_000);
  if (elapsedMinutes < 1) return "Updated moments ago";
  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes} min ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `Updated ${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `Updated ${elapsedDays} day${elapsedDays === 1 ? "" : "s"} ago`;
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(savedAtMilliseconds)}`;
}

function compactJob(job: CachedJobSummary): CachedJobSummary {
  return {
    company: job.company,
    datePosted: job.datePosted,
    employmentType: job.employmentType,
    id: job.id,
    location: job.location,
    salaryDisplay: job.salaryDisplay,
    sourceUrl: safeExternalUrl(job.sourceUrl),
    title: job.title,
    workArrangement: job.workArrangement,
  };
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isCachedJobSummary(value: unknown): value is CachedJobSummary {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CachedJobSummary>;
  return (
    isString(item.company) &&
    isString(item.employmentType) &&
    isString(item.id) &&
    isString(item.location) &&
    isString(item.salaryDisplay) &&
    isString(item.title) &&
    isString(item.workArrangement) &&
    (item.datePosted === null || isString(item.datePosted)) &&
    (item.sourceUrl === null || safeExternalUrl(item.sourceUrl) !== null)
  );
}

export function parseJobFeedSnapshot(
  raw: string,
  expectedKind: JobSnapshotKind,
): JobFeedSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<JobFeedSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      parsed.kind !== expectedKind ||
      !isString(parsed.savedAt) ||
      !Array.isArray(parsed.jobs)
    ) {
      return null;
    }
    const jobs = parsed.jobs
      .filter(isCachedJobSummary)
      .slice(0, MAX_SNAPSHOT_JOBS)
      .map((job) => ({ ...job, sourceUrl: safeExternalUrl(job.sourceUrl) }));
    return jobs.length > 0
      ? {
          jobs,
          kind: expectedKind,
          savedAt: parsed.savedAt,
          version: SNAPSHOT_VERSION,
        }
      : null;
  } catch {
    return null;
  }
}

export function saveJobFeedSnapshot(
  kind: JobSnapshotKind,
  jobs: readonly CachedJobSummary[],
  options: { merge?: boolean } = {},
) {
  if (typeof window === "undefined" || jobs.length === 0) return;
  const prior = options.merge
    ? (() => {
        try {
          const raw = window.localStorage.getItem(SNAPSHOT_KEYS[kind]);
          return raw ? parseJobFeedSnapshot(raw, kind)?.jobs ?? [] : [];
        } catch {
          return [];
        }
      })()
    : [];
  const deduped = new Map<string, CachedJobSummary>();
  for (const job of [...jobs, ...prior]) {
    if (!deduped.has(job.id)) deduped.set(job.id, job);
  }
  const snapshot: JobFeedSnapshot = {
    jobs: [...deduped.values()].slice(0, MAX_SNAPSHOT_JOBS).map(compactJob),
    kind,
    savedAt: new Date().toISOString(),
    version: SNAPSHOT_VERSION,
  };
  try {
    window.localStorage.setItem(SNAPSHOT_KEYS[kind], JSON.stringify(snapshot));
  } catch {
    // Private browsing and device storage pressure can disable localStorage.
    // The live app remains authoritative when a snapshot cannot be retained.
  }
}

export function readJobFeedSnapshot(
  preferredKind: JobSnapshotKind,
): JobFeedSnapshot | null {
  if (typeof window === "undefined") return null;
  for (const kind of [preferredKind, "feed"] as const) {
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEYS[kind]);
      if (!raw) continue;
      const snapshot = parseJobFeedSnapshot(raw, kind);
      if (snapshot) return snapshot;
    } catch {
      // Ignore corrupt/blocked device storage and continue to the feed fallback.
    }
  }
  return null;
}
