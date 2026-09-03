import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_EMERGENCY_PROFILE,
  type EmergencyFeedJob,
} from "@/features/jobs/emergency-feed";
import {
  EMERGENCY_PROFILE_CHANGED_EVENT,
  emergencySavedJobs,
  readEmergencyDecisions,
  readEmergencyProfile,
  readEmergencySeenJobIds,
  recordEmergencyDecision,
  recordEmergencyDecisionWithStatus,
  sanitizeEmergencyProfile,
  saveEmergencyProfile,
  saveEmergencyProfileWithStatus,
} from "@/features/jobs/emergency-feed-storage";

function memoryBrowser() {
  const data = new Map<string, string>();
  const dispatched: unknown[] = [];
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  vi.stubGlobal("window", {
    dispatchEvent: (event: unknown) => {
      dispatched.push(event);
      return true;
    },
    localStorage: storage,
  });
  vi.stubGlobal(
    "CustomEvent",
    class MockCustomEvent<T> {
      detail: T;
      type: string;

      constructor(type: string, init: { detail: T }) {
        this.detail = init.detail;
        this.type = type;
      }
    },
  );
  return { data, dispatched, storage };
}

function job(id: string): EmergencyFeedJob {
  return {
    company: "Example",
    datePosted: "2026-08-20T12:00:00.000Z",
    employmentType: "Full time",
    estimatedSalary: false,
    externalId: id,
    id,
    location: "Remote - US",
    provider: "ashby",
    relevanceScore: 8,
    salaryDisplay: "$70K–$90K / yr",
    sourceKey: "example",
    sourceUrl: `https://jobs.example.com/${id}`,
    summary: "Help customers implement a modern platform.",
    title: "Implementation Specialist",
    workArrangement: "Remote",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emergency feed profile storage", () => {
  it("sanitizes the public device-profile contract", () => {
    const profile = sanitizeEmergencyProfile({
      desiredSeniorityLevels: ["entry", "staff", "entry"],
      location: `  Pittsburgh, PA ${"x".repeat(200)}  `,
      preferredSalaryMinimumCents: 999_999_999,
      preferredWorkModes: ["remote", "elsewhere", "remote"],
      targetRoleFamilies: [" Implementation ", "Implementation", 42],
      yearsExperience: 99,
    });

    expect(profile.desiredSeniorityLevels).toEqual(["entry"]);
    expect(profile.location).toHaveLength(120);
    expect(profile.preferredSalaryMinimumCents).toBe(50_000_000);
    expect(profile.preferredWorkModes).toEqual(["remote"]);
    expect(profile.targetRoleFamilies).toEqual(["Implementation"]);
    expect(profile.yearsExperience).toBe(50);
  });

  it("persists a bounded profile and announces the feed change", () => {
    const browser = memoryBrowser();
    const saved = saveEmergencyProfile({
      ...DEFAULT_EMERGENCY_PROFILE,
      location: "Remote, US",
      preferredSalaryMinimumCents: 7_000_000,
      preferredWorkModes: ["remote"],
    });

    expect(JSON.parse(browser.data.get("jobswipe:emergency-profile:v1") ?? "null")).toEqual(saved);
    expect(browser.dispatched).toHaveLength(1);
    expect(browser.dispatched[0]).toMatchObject({
      detail: saved,
      type: EMERGENCY_PROFILE_CHANGED_EVENT,
    });
  });

  it("keeps compact seen tombstones after full decision records roll off", () => {
    memoryBrowser();
    for (let index = 0; index < 260; index += 1) {
      recordEmergencyDecision(job(`role-${index}`), "skipped");
    }

    expect(readEmergencyDecisions()).toHaveLength(250);
    expect(readEmergencySeenJobIds()).toHaveLength(260);
    expect(readEmergencySeenJobIds()).toContain("role-0");
  });

  it("preserves saved jobs independently when pass records roll off", () => {
    memoryBrowser();
    recordEmergencyDecision(job("saved-role"), "saved");
    for (let index = 0; index < 260; index += 1) {
      recordEmergencyDecision(job(`passed-role-${index}`), "skipped");
    }

    expect(readEmergencyDecisions().some((item) => item.job.id === "saved-role")).toBe(
      false,
    );
    expect(emergencySavedJobs().map((item) => item.id)).toContain("saved-role");
  });

  it("removes a saved job when the user later passes it", () => {
    memoryBrowser();
    const saved = job("saved-role");
    recordEmergencyDecision(saved, "saved");
    recordEmergencyDecision(saved, "skipped");

    expect(emergencySavedJobs()).toEqual([]);
  });

  it("keeps useful bounded saved details outside the compact rolling decision log", () => {
    memoryBrowser();
    const richJob: EmergencyFeedJob = {
      ...job("rich-save"),
      description: "Detailed employer text ".repeat(300),
      requirements: ["At least 2 years of customer implementation experience."],
    };

    expect(recordEmergencyDecisionWithStatus(richJob, "saved").persisted).toBe(
      true,
    );
    const decisionJob = readEmergencyDecisions()[0]?.job;
    expect(decisionJob?.description).toBeUndefined();
    expect(decisionJob?.requirements).toBeUndefined();
    const savedJob = emergencySavedJobs()[0];
    expect(savedJob?.description?.length).toBeLessThanOrEqual(4_000);
    expect(savedJob?.description).toContain("Detailed employer text");
    expect(savedJob?.requirements).toEqual(richJob.requirements);
  });

  it("rejects save 251 without evicting the oldest shortlist item", () => {
    memoryBrowser();
    for (let index = 0; index < 250; index += 1) {
      expect(recordEmergencyDecisionWithStatus(job(`saved-${index}`), "saved").persisted).toBe(true);
    }

    const overflow = recordEmergencyDecisionWithStatus(job("saved-250"), "saved");
    expect(overflow).toMatchObject({ persisted: false, reason: "saved_limit" });
    const saved = emergencySavedJobs();
    expect(saved).toHaveLength(250);
    expect(saved.map((item) => item.id)).toContain("saved-0");
    expect(saved.map((item) => item.id)).not.toContain("saved-250");
  });

  it("rolls back the decision log when shortlist persistence fails", () => {
    const browser = memoryBrowser();
    const originalSetItem = browser.storage.setItem;
    browser.storage.setItem = (key: string, value: string) => {
      if (key === "jobswipe:emergency-saved:v1") {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      }
      originalSetItem(key, value);
    };

    const result = recordEmergencyDecisionWithStatus(job("atomic-save"), "saved");
    expect(result).toMatchObject({ persisted: false, reason: "storage" });
    expect(readEmergencyDecisions()).toEqual([]);
    expect(emergencySavedJobs()).toEqual([]);
  });

  it("fails closed when embedded browser storage access throws", () => {
    vi.stubGlobal("window", {
      dispatchEvent: () => true,
      localStorage: {
        getItem: () => {
          throw new DOMException("Storage blocked", "SecurityError");
        },
        setItem: () => {
          throw new DOMException("Storage blocked", "SecurityError");
        },
      },
    });

    expect(readEmergencyDecisions()).toEqual([]);
    expect(readEmergencySeenJobIds()).toEqual([]);
    expect(emergencySavedJobs()).toEqual([]);
    expect(readEmergencyProfile()).toBeNull();
    expect(saveEmergencyProfileWithStatus(DEFAULT_EMERGENCY_PROFILE)).toEqual({
      persisted: false,
      profile: DEFAULT_EMERGENCY_PROFILE,
    });
    expect(
      recordEmergencyDecisionWithStatus(job("blocked-save"), "saved").persisted,
    ).toBe(false);
  });
});
