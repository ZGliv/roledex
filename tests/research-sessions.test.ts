import { describe, expect, it } from "vitest";

import {
  aggregateResearchSessions,
  type ResearchSessionEventInput,
} from "@/features/sessions/aggregate";

const BASE_TIME = new Date("2026-08-04T12:00:00.000Z").getTime();

function event(
  id: string,
  minute: number,
  overrides: Partial<ResearchSessionEventInput> = {},
): ResearchSessionEventInput {
  return {
    company: "Acme",
    decidedAt: new Date(BASE_TIME + minute * 60_000).toISOString(),
    decision: "saved",
    id,
    jobId: `job-${id}`,
    note: null,
    previousDecision: "unseen",
    title: "Implementation Specialist",
    ...overrides,
  };
}

describe("aggregateResearchSessions", () => {
  it("returns an honest empty result when history only contains notes and pipeline maintenance", () => {
    const result = aggregateResearchSessions([
      event("note", 0, {
        decision: "saved",
        note: "Follow up after salary is confirmed.",
        previousDecision: "saved",
      }),
      event("status", 5, {
        decision: "applied",
        previousDecision: "apply",
      }),
      event("undo", 10, {
        decision: "unseen",
        previousDecision: "saved",
      }),
    ]);

    expect(result.sessions).toEqual([]);
    expect(result.reviewedCount).toBe(0);
    expect(result.saveRate).toBe(0);
    expect(result.meaningfulEventCount).toBe(0);
    expect(result.ignoredEventCount).toBe(3);
  });

  it("keeps an exact 30-minute gap together and starts a new session after longer inactivity", () => {
    const result = aggregateResearchSessions([
      event("third", 61, { decision: "stretch", company: "Gamma" }),
      event("first", 0),
      event("noise", 45, {
        decision: "saved",
        note: "A later note must not bridge sessions.",
        previousDecision: "saved",
      }),
      event("second", 30, { decision: "skipped", company: "Beta" }),
    ]);

    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toMatchObject({
      reviewedCount: 1,
      stretchCount: 1,
      durationMinutes: 0,
    });
    expect(result.sessions[1]).toMatchObject({
      reviewedCount: 2,
      savedCount: 1,
      passedCount: 1,
      durationMinutes: 30,
    });
    expect(result.sessions[0].nextStep).toContain("2 more roles");
    expect(result.ignoredEventCount).toBe(1);
  });

  it("counts a re-decided job once using its latest choice", () => {
    const result = aggregateResearchSessions([
      event("first-choice", 0, { jobId: "job-a", decision: "saved" }),
      event("reset", 5, {
        jobId: "job-a",
        decision: "unseen",
        previousDecision: "saved",
      }),
      event("final-choice", 6, { jobId: "job-a", decision: "skipped" }),
      event("direct-apply", 8, {
        jobId: "job-b",
        decision: "apply",
        company: "Beta",
        title: "Solutions Consultant",
      }),
    ]);

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      activityDecisionCount: 3,
      reviewedCount: 2,
      savedCount: 1,
      passedCount: 1,
      saveRate: 50,
    });
    expect(result.meaningfulEventCount).toBe(3);
    expect(result.ignoredEventCount).toBe(1);
  });

  it("builds complete counts, deterministic rankings, and a bounded next step", () => {
    const result = aggregateResearchSessions([
      event("one", 0, { jobId: "one", company: "Acme", title: "Implementation Specialist" }),
      event("two", 3, {
        jobId: "two",
        company: "Acme",
        decision: "stretch",
        title: "Implementation Specialist",
      }),
      event("three", 6, {
        jobId: "three",
        company: "Beta",
        decision: "learn_first",
        title: "Customer Success Engineer",
      }),
      event("four", 9, {
        jobId: "four",
        company: "Acme",
        decision: "skipped",
        title: "Support Engineer",
      }),
      event("five", 12, {
        jobId: "five",
        company: "Beta",
        decision: "skipped",
        title: "Product Analyst",
      }),
    ]);

    const [session] = result.sessions;
    expect(session).toMatchObject({
      reviewedCount: 5,
      savedCount: 1,
      stretchCount: 1,
      learnFirstCount: 1,
      passedCount: 2,
      saveRate: 60,
      durationMinutes: 12,
    });
    expect(session.companies).toEqual([
      { count: 3, label: "Acme" },
      { count: 2, label: "Beta" },
    ]);
    expect(session.roles[0]).toEqual({
      count: 2,
      label: "Implementation Specialist",
    });
    expect(session.nextStep).toContain("salary, location, and must-have qualifications");
  });

  it("rejects invalid timestamps and inactivity windows instead of inventing a session", () => {
    expect(() =>
      aggregateResearchSessions([event("bad-time", 0, { decidedAt: "not-a-date" })]),
    ).toThrow("invalid timestamp");
    expect(() => aggregateResearchSessions([], 0)).toThrow("must be positive");
  });
});
