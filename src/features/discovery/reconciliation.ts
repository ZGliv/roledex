export type ReconciliationSourceSnapshot = {
  externalJobIds: readonly string[];
  sourceId: string;
  truncated: boolean;
};

export type ReconciliationSighting = {
  externalJobId: string;
  jobListingId: string | null;
  jobSourceId: string;
};

/**
 * Returns listings that disappeared from a source whose successful response
 * was known to be complete. A truncated response can prove presence but never
 * absence, and a listing observed through another successful source is kept.
 */
export function selectMissingListingIds(input: {
  sightings: readonly ReconciliationSighting[];
  successfulSources: readonly ReconciliationSourceSnapshot[];
}) {
  const completeExternalIdsBySource = new Map<string, ReadonlySet<string>>();
  const observedExternalIdsBySource = new Map<string, ReadonlySet<string>>();

  for (const source of input.successfulSources) {
    const externalIds = new Set(source.externalJobIds);
    observedExternalIdsBySource.set(source.sourceId, externalIds);
    if (!source.truncated) {
      completeExternalIdsBySource.set(source.sourceId, externalIds);
    }
  }

  const observedListingIds = new Set<string>();
  for (const sighting of input.sightings) {
    if (!sighting.jobListingId) continue;
    if (
      observedExternalIdsBySource
        .get(sighting.jobSourceId)
        ?.has(sighting.externalJobId)
    ) {
      observedListingIds.add(sighting.jobListingId);
    }
  }

  const missingListingIds = new Set<string>();
  for (const sighting of input.sightings) {
    if (!sighting.jobListingId || observedListingIds.has(sighting.jobListingId)) {
      continue;
    }
    const returnedExternalIds = completeExternalIdsBySource.get(
      sighting.jobSourceId,
    );
    if (
      returnedExternalIds &&
      !returnedExternalIds.has(sighting.externalJobId)
    ) {
      missingListingIds.add(sighting.jobListingId);
    }
  }

  return [...missingListingIds];
}
