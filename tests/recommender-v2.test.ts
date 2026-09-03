import { describe, expect, it } from "vitest";

import {
  buildForYouQueue,
  classifyForYouTier,
  scoreRecommendation,
  type ForYouCandidate,
} from "@/features/personalization/recommender-v2";

function candidate(
  id: string,
  overrides: Partial<ForYouCandidate> = {},
): ForYouCandidate {
  return {
    id,
    company: `Company ${id}`,
    title: `Implementation Specialist ${id}`,
    passesHardConstraints: true,
    components: {
      qualification: 82,
      statedUtility: 80,
      learnedInterest: 50,
      opportunityQuality: 75,
    },
    roleAffinity: 90,
    experienceGapYears: 0,
    materialGapCount: 0,
    evidenceConfidence: 80,
    positiveReason: "Your implementation work is relevant.",
    riskReason: "The listing leaves team scope unclear.",
    ...overrides,
  };
}

describe("personal radar recommender v2", () => {
  it("uses the approved component weights", () => {
    expect(
      scoreRecommendation({
        qualification: 100,
        statedUtility: 80,
        learnedInterest: 60,
        opportunityQuality: 40,
      }),
    ).toBe(84);
  });

  it("never admits a candidate that fails a hard constraint", () => {
    expect(
      classifyForYouTier(
        candidate("blocked", { passesHardConstraints: false }),
      ),
    ).toBeNull();
  });

  it("keeps evidence confidence separate from qualification tier", () => {
    expect(
      classifyForYouTier(candidate("unknown", { evidenceConfidence: 20 })),
    ).toBe("ready_now");
  });

  it("classifies bounded gaps as stretch and high-utility adjacency as discovery", () => {
    expect(
      classifyForYouTier(
        candidate("stretch", {
          components: {
            qualification: 62,
            statedUtility: 82,
            learnedInterest: 50,
            opportunityQuality: 70,
          },
          experienceGapYears: 2,
          roleAffinity: 68,
        }),
      ),
    ).toBe("credible_stretch");
    expect(
      classifyForYouTier(
        candidate("discovery", {
          components: {
            qualification: 48,
            statedUtility: 78,
            learnedInterest: 50,
            opportunityQuality: 70,
          },
          experienceGapYears: null,
          roleAffinity: 45,
          materialGapCount: 2,
        }),
      ),
    ).toBe("discovery");
  });

  it("builds a 7/2/1 ten-card cadence when supply allows", () => {
    const ready = Array.from({ length: 7 }, (_, index) =>
      candidate(`ready-${index}`),
    );
    const stretch = Array.from({ length: 2 }, (_, index) =>
      candidate(`stretch-${index}`, {
        components: {
          qualification: 60,
          statedUtility: 80,
          learnedInterest: 50,
          opportunityQuality: 70,
        },
        roleAffinity: 65,
        experienceGapYears: 2,
      }),
    );
    const discovery = candidate("discovery", {
      components: {
        qualification: 48,
        statedUtility: 75,
        learnedInterest: 55,
        opportunityQuality: 80,
      },
      roleAffinity: 45,
      materialGapCount: 2,
    });

    const queue = buildForYouQueue([...ready, ...stretch, discovery]);
    expect(queue.map((item) => item.tier)).toEqual([
      "ready_now",
      "ready_now",
      "ready_now",
      "credible_stretch",
      "ready_now",
      "ready_now",
      "discovery",
      "ready_now",
      "credible_stretch",
      "ready_now",
    ]);
  });

  it("fills unavailable tiers without repeating or fabricating cards", () => {
    const queue = buildForYouQueue(
      Array.from({ length: 4 }, (_, index) => candidate(`only-${index}`)),
      { limit: 20 },
    );
    expect(queue).toHaveLength(4);
    expect(new Set(queue.map((item) => item.id)).size).toBe(4);
    expect(queue.every((item) => item.tier === "ready_now")).toBe(true);
  });

  it("uses diversity to avoid consecutive duplicate companies", () => {
    const queue = buildForYouQueue([
      candidate("a-1", { company: "Same", title: "Implementation Specialist" }),
      candidate("a-2", {
        company: "Same",
        title: "Implementation Consultant",
        components: {
          qualification: 81,
          statedUtility: 80,
          learnedInterest: 50,
          opportunityQuality: 75,
        },
      }),
      candidate("b", {
        company: "Different",
        components: {
          qualification: 79,
          statedUtility: 80,
          learnedInterest: 50,
          opportunityQuality: 75,
        },
      }),
    ]);
    expect(queue[0]?.company).toBe("Same");
    expect(queue[1]?.company).toBe("Different");
  });
});
