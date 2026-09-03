export const SOURCE_FAILURE_RETRY_MS = 6 * 60 * 60 * 1_000;

export type SchedulableJobSource = {
  createdAt: Date;
  enabled: boolean;
  id: string;
  lastAttemptedAt: Date | null;
  lastErrorAt: Date | null;
  lastSucceededAt: Date | null;
  refreshIntervalHours: number;
  removedAt: Date | null;
};

function validIntervalMilliseconds(hours: number) {
  const safeHours = Number.isFinite(hours) ? Math.max(1, Math.floor(hours)) : 24;
  return safeHours * 60 * 60 * 1_000;
}

export function nextSourceAttemptAt(source: SchedulableJobSource) {
  if (!source.enabled || source.removedAt) return null;
  if (!source.lastAttemptedAt) return source.createdAt;

  const lastAttempt = source.lastAttemptedAt.getTime();
  const lastSuccess = source.lastSucceededAt?.getTime() ?? 0;
  const lastError = source.lastErrorAt?.getTime() ?? 0;
  const latestAttemptFailed = lastError >= lastAttempt && lastError > lastSuccess;

  return new Date(
    lastAttempt +
      (latestAttemptFailed
        ? SOURCE_FAILURE_RETRY_MS
        : validIntervalMilliseconds(source.refreshIntervalHours)),
  );
}

/**
 * Picks the newest never-attempted sources first, then the oldest-due sources.
 * This makes a newly connected board useful on the next run; after its first
 * attempt the normal bounded rotation resumes without a global cursor.
 */
export function selectDueJobSources<T extends SchedulableJobSource>(
  sources: readonly T[],
  now: Date,
  limit: number,
) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(0, limit) : 0;
  return sources
    .map((source, index) => ({ source, dueAt: nextSourceAttemptAt(source), index }))
    .filter(
      (entry): entry is { source: T; dueAt: Date; index: number } =>
        entry.dueAt !== null && entry.dueAt.getTime() <= now.getTime(),
    )
    .toSorted(
      (left, right) => {
        const leftAttempted = left.source.lastAttemptedAt !== null;
        const rightAttempted = right.source.lastAttemptedAt !== null;
        if (leftAttempted !== rightAttempted) {
          return Number(leftAttempted) - Number(rightAttempted);
        }
        if (!leftAttempted && !rightAttempted) {
          return (
            right.source.createdAt.getTime() - left.source.createdAt.getTime() ||
            left.index - right.index
          );
        }
        return (
          left.dueAt.getTime() - right.dueAt.getTime() ||
          left.source.createdAt.getTime() - right.source.createdAt.getTime() ||
          left.index - right.index
        );
      },
    )
    .slice(0, boundedLimit)
    .map((entry) => entry.source);
}

export function earliestNextSourceAttempt(sources: readonly SchedulableJobSource[]) {
  const dueTimes = sources
    .map(nextSourceAttemptAt)
    .filter((value): value is Date => value !== null);
  if (dueTimes.length === 0) return null;
  return new Date(Math.min(...dueTimes.map((value) => value.getTime())));
}
