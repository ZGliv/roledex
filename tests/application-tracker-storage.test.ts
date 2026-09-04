import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applicationPipeline,
  readTrackedApplications,
  saveTrackedApplication,
} from "@/features/jobs/application-tracker-storage";
import type { CachedJobSummary } from "@/features/jobs/feed-snapshot";

const job: CachedJobSummary = {
  id: "one",
  company: "Linear",
  title: "Customer Success",
  location: "Remote",
  salaryDisplay: "$90K",
  workArrangement: "Remote",
  employmentType: "Full time",
  datePosted: null,
  sourceUrl: "https://example.com/jobs/one",
};
function browser() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: vi.fn() });
  return { data, storage };
}
afterEach(() => vi.unstubAllGlobals());
describe("personal application pipeline", () => {
  it("has no seeded applications for a new visitor", () => {
    browser();
    expect(applicationPipeline([], readTrackedApplications())).toEqual([]);
  });
  it("persists a real saved role's stage and note across reloads", () => {
    browser();
    expect(saveTrackedApplication(job, { stage: "applied" })).toBe(true);
    expect(saveTrackedApplication(job, { note: "Follow up Friday" })).toBe(
      true,
    );
    expect(readTrackedApplications()).toMatchObject([
      { stage: "applied", note: "Follow up Friday", job },
    ]);
    expect(
      applicationPipeline([job, job], readTrackedApplications()),
    ).toHaveLength(1);
  });
  it("retains an application after its original shortlist entry is removed", () => {
    browser();
    saveTrackedApplication(job, { stage: "interview" });
    expect(applicationPipeline([], readTrackedApplications())[0].stage).toBe(
      "interview",
    );
  });
  it("reports storage failure without pretending a change was saved", () => {
    const { storage } = browser();
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(saveTrackedApplication(job, { stage: "applied" })).toBe(false);
    expect(readTrackedApplications()).toEqual([]);
  });
  it("ignores corrupted and unsafe local data", () => {
    const { data } = browser();
    data.set(
      "roledex:applications:v1",
      JSON.stringify([
        {
          job: { ...job, sourceUrl: "javascript:alert(1)" },
          stage: "saved",
          note: "",
          updatedAt: "today",
        },
      ]),
    );
    expect(readTrackedApplications()).toEqual([]);
  });
});
