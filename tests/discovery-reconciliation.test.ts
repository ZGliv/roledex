import { describe, expect, it } from "vitest";

import { selectMissingListingIds } from "@/features/discovery/reconciliation";

describe("discovery source reconciliation", () => {
  it("selects a linked listing missing from a complete successful source", () => {
    expect(
      selectMissingListingIds({
        successfulSources: [
          {
            sourceId: "source-a",
            externalJobIds: ["still-live"],
            truncated: false,
          },
        ],
        sightings: [
          {
            jobSourceId: "source-a",
            externalJobId: "still-live",
            jobListingId: "listing-live",
          },
          {
            jobSourceId: "source-a",
            externalJobId: "removed",
            jobListingId: "listing-removed",
          },
        ],
      }),
    ).toEqual(["listing-removed"]);
  });

  it("never infers absence from a truncated or unsuccessful source", () => {
    expect(
      selectMissingListingIds({
        successfulSources: [
          {
            sourceId: "source-a",
            externalJobIds: ["first-page-job"],
            truncated: true,
          },
        ],
        sightings: [
          {
            jobSourceId: "source-a",
            externalJobId: "outside-first-page",
            jobListingId: "listing-a",
          },
          {
            jobSourceId: "failed-source",
            externalJobId: "not-returned",
            jobListingId: "listing-b",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("keeps a shared listing observed through another successful source", () => {
    expect(
      selectMissingListingIds({
        successfulSources: [
          { sourceId: "source-a", externalJobIds: [], truncated: false },
          {
            sourceId: "source-b",
            externalJobIds: ["live-b"],
            truncated: true,
          },
        ],
        sightings: [
          {
            jobSourceId: "source-a",
            externalJobId: "removed-a",
            jobListingId: "shared-listing",
          },
          {
            jobSourceId: "source-b",
            externalJobId: "live-b",
            jobListingId: "shared-listing",
          },
          {
            jobSourceId: "source-a",
            externalJobId: "removed-only",
            jobListingId: "removed-listing",
          },
          {
            jobSourceId: "source-a",
            externalJobId: "unlinked",
            jobListingId: null,
          },
        ],
      }),
    ).toEqual(["removed-listing"]);
  });
});
