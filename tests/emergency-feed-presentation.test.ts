import { describe, expect, it } from "vitest";

import {
  DEFAULT_EMERGENCY_PROFILE,
  type EmergencyFeedJob,
} from "@/features/jobs/emergency-feed";
import {
  emergencyJobRead,
  emergencyPostingLabel,
  emergencySourceLabel,
} from "@/features/jobs/emergency-feed-presentation";

function directJob(overrides: Partial<EmergencyFeedJob> = {}): EmergencyFeedJob {
  return {
    company: "Example",
    datePosted: "2026-08-18T12:00:00.000Z",
    description: "Help customers implement a modern software platform.",
    employmentType: "Full time",
    estimatedSalary: false,
    externalId: "role-1",
    id: "ashby:example:role-1",
    location: "Remote - US",
    provider: "ashby",
    relevanceScore: 8,
    requirements: ["You have 2+ years of implementation experience."],
    salaryDisplay: "$70K–$95K / yr",
    sourceKey: "example",
    sourceUrl: "https://jobs.example.com/role-1",
    summary: "Help customers implement and adopt a modern software platform.",
    title: "Implementation Specialist",
    workArrangement: "Remote",
    ...overrides,
  };
}

describe("direct-feed presentation", () => {
  it("labels the official ATS source and posting freshness", () => {
    expect(emergencySourceLabel("greenhouse")).toBe("Greenhouse");
    expect(
      emergencyPostingLabel(
        "2026-08-18T12:00:00.000Z",
        new Date("2026-08-20T12:00:00.000Z"),
      ),
    ).toBe("Posted 2 days ago");
  });

  it("connects the card to an explicit profile direction", () => {
    const read = emergencyJobRead(
      directJob(),
      DEFAULT_EMERGENCY_PROFILE,
      new Date("2026-08-20T12:00:00.000Z"),
    );

    expect(read.fit).toContain("implementation");
    expect(read.fit).toContain("search direction");
    expect(read.risk).toContain("Resume and skill evidence are unavailable");
    expect(read.source).toBe("Ashby");
  });

  it("plainly discloses estimated pay before generic uncertainty", () => {
    const read = emergencyJobRead(
      directJob({ estimatedSalary: true, requirements: [] }),
      null,
    );

    expect(read.risk).toBe(
      "Pay is a market estimate—the employer did not post a range.",
    );
  });
});
