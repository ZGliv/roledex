const SOURCE_REPEAT_PENALTY = 1.5;

type SelectableDiscoveryCandidate = {
  score: number;
  source: { id: string };
};

/**
 * Keeps source diversity as a tie-breaker without reserving equal import slots
 * for boards that have no useful roles. A strong profile match can therefore
 * use several slots from one board, while similarly scored jobs still rotate
 * naturally across companies.
 */
export function selectDiverseDiscoveryCandidates<
  T extends SelectableDiscoveryCandidate,
>(candidates: readonly T[], limit: number) {
  const boundedLimit = Number.isSafeInteger(limit) ? Math.max(0, limit) : 0;
  const remaining = candidates.map((candidate, index) => ({ candidate, index }));
  const selected: T[] = [];
  const selectedBySource = new Map<string, number>();

  while (selected.length < boundedLimit && remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;
    let bestRawScore = Number.NEGATIVE_INFINITY;
    let bestOriginalIndex = Number.POSITIVE_INFINITY;

    for (let index = 0; index < remaining.length; index += 1) {
      const entry = remaining[index];
      const priorSelections = selectedBySource.get(entry.candidate.source.id) ?? 0;
      const adjustedScore =
        entry.candidate.score - priorSelections * SOURCE_REPEAT_PENALTY;

      if (
        adjustedScore > bestAdjustedScore ||
        (adjustedScore === bestAdjustedScore &&
          (entry.candidate.score > bestRawScore ||
            (entry.candidate.score === bestRawScore &&
              entry.index < bestOriginalIndex)))
      ) {
        bestIndex = index;
        bestAdjustedScore = adjustedScore;
        bestRawScore = entry.candidate.score;
        bestOriginalIndex = entry.index;
      }
    }

    const [{ candidate }] = remaining.splice(bestIndex, 1);
    selected.push(candidate);
    selectedBySource.set(
      candidate.source.id,
      (selectedBySource.get(candidate.source.id) ?? 0) + 1,
    );
  }

  return selected;
}
