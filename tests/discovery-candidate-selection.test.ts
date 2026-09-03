import { describe, expect, it } from "vitest";

import { selectDiverseDiscoveryCandidates } from "@/features/discovery/candidate-selection";

function candidate(id: string, sourceId: string, score: number) {
  return { id, score, source: { id: sourceId } };
}

describe("discovery import candidate selection", () => {
  it("does not let equal company quotas crowd strong profile matches out of the budget", () => {
    const focused = Array.from({ length: 10 }, (_, index) =>
      candidate(`focused-${index}`, "focused-board", 50),
    );
    const fashionable = Array.from({ length: 20 }, (_, index) =>
      candidate(`fashionable-${index}`, `company-${index}`, 5),
    );

    const selected = selectDiverseDiscoveryCandidates(
      [...fashionable, ...focused],
      8,
    );

    expect(selected.map(({ id }) => id)).toEqual(
      focused.slice(0, 8).map(({ id }) => id),
    );
  });

  it("still rotates similarly scored jobs across public company boards", () => {
    const selected = selectDiverseDiscoveryCandidates(
      [
        candidate("a-1", "a", 5),
        candidate("a-2", "a", 5),
        candidate("b-1", "b", 5),
        candidate("b-2", "b", 5),
        candidate("c-1", "c", 5),
      ],
      3,
    );

    expect(selected.map(({ id }) => id)).toEqual(["a-1", "b-1", "c-1"]);
  });
});
