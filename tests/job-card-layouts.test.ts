import { describe, expect, it } from "vitest";

import {
  JOB_CARD_LAYOUT_COUNT,
  JOB_CARD_LAYOUTS,
  jobCardLayoutForJob,
} from "@/features/jobs/components/job-card-layouts";

describe("job card layouts", () => {
  it("offers substantial structural variety", () => {
    expect(JOB_CARD_LAYOUT_COUNT).toBeGreaterThanOrEqual(18);
    expect(new Set(JOB_CARD_LAYOUTS).size).toBe(JOB_CARD_LAYOUT_COUNT);
  });

  it("is stable for the same normalized job identity", () => {
    const canonical = jobCardLayoutForJob({
      company: "Ashby",
      id: "job-1",
      title: "Implementation Specialist",
    });
    expect(
      jobCardLayoutForJob({
        company: "  ASHBY ",
        id: "job-1",
        title: "Implementation Specialist",
      }),
    ).toBe(canonical);
  });

  it("distributes a representative job set broadly", () => {
    const used = new Set(
      Array.from({ length: 180 }, (_, index) =>
        jobCardLayoutForJob({
          company: `Company ${index % 30}`,
          id: `job-${index}`,
          title: `Role ${index}`,
        }),
      ),
    );
    expect(used.size).toBeGreaterThanOrEqual(15);
  });
});
