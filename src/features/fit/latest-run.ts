type FitRunIdentity = {
  candidateSnapshot: Record<string, unknown>;
  createdAt: Date;
  id: string;
  jobRevisionId: string;
};

function candidateRevision(run: FitRunIdentity) {
  const revision = run.candidateSnapshot.revision;
  return typeof revision === "number" && Number.isSafeInteger(revision)
    ? revision
    : 0;
}

function isLaterFitRun(candidate: FitRunIdentity, current: FitRunIdentity) {
  const candidateProfileRevision = candidateRevision(candidate);
  const currentProfileRevision = candidateRevision(current);
  if (candidateProfileRevision !== currentProfileRevision) {
    return candidateProfileRevision > currentProfileRevision;
  }

  const candidateTime = candidate.createdAt.getTime();
  const currentTime = current.createdAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.id > current.id;
}

/** Selects exactly one newest active-profile score row per immutable job revision. */
export function selectLatestFitRows<
  T extends { fit: FitRunIdentity },
>(rows: readonly T[], requiredCandidateRevision?: number) {
  const latestByRevision = new Map<string, T>();
  for (const row of rows) {
    if (
      requiredCandidateRevision !== undefined &&
      candidateRevision(row.fit) !== requiredCandidateRevision
    ) {
      continue;
    }
    const current = latestByRevision.get(row.fit.jobRevisionId);
    if (!current || isLaterFitRun(row.fit, current.fit)) {
      latestByRevision.set(row.fit.jobRevisionId, row);
    }
  }
  return [...latestByRevision.values()];
}
