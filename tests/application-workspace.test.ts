import { describe, expect, it } from "vitest";

import {
  buildApplicationWorkspace,
  calendarFileForApplication,
  suggestedFollowUpDate,
} from "@/features/jobs/application-workspace";

const now = new Date("2026-08-15T14:00:00.000Z").getTime();

describe("application workspace", () => {
  it("puts due follow-ups ahead of application planning prompts", () => {
    const view = buildApplicationWorkspace(
      [
        { id: "a", company: "Alpha", title: "Implementation", currentDecision: "applied" },
        { id: "b", company: "Beta", title: "Customer Success", currentDecision: "apply" },
      ],
      new Map([
        [
          "a",
          {
            applicationDeadline: null,
            followUpAt: "2026-08-15T13:00:00.000Z",
            nextStep: "Email the recruiter",
          },
        ],
      ]),
      now,
    );

    expect(view.actions.map((action) => action.jobId)).toEqual(["a", "b"]);
    expect(view.actions[0]).toMatchObject({ kind: "follow_up", priority: 0 });
    expect(view.urgentCount).toBe(1);
  });

  it("summarizes the active application pipeline without counting closed roles", () => {
    const view = buildApplicationWorkspace(
      [
        { id: "1", company: "A", title: "A", currentDecision: "saved" },
        { id: "2", company: "B", title: "B", currentDecision: "applied" },
        { id: "3", company: "C", title: "C", currentDecision: "interview" },
        { id: "4", company: "D", title: "D", currentDecision: "offer" },
        { id: "5", company: "E", title: "E", currentDecision: "rejected" },
      ],
      new Map(),
      now,
    );

    expect(view.counts).toEqual({ applying: 1, interviews: 1, offers: 1, shortlist: 1 });
  });

  it("creates follow-up presets at local 9 AM", () => {
    const result = suggestedFollowUpDate(3, new Date(2026, 7, 15, 17, 30));
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(9);
  });

  it("keeps closed roles out of the action queue and prioritizes near deadlines", () => {
    const view = buildApplicationWorkspace(
      [
        { id: "deadline", company: "Alpha", title: "Coordinator", currentDecision: "apply" },
        { id: "closed", company: "Beta", title: "Specialist", currentDecision: "rejected" },
      ],
      new Map([
        ["deadline", { applicationDeadline: "2026-08-16T12:00:00.000Z", followUpAt: null, nextStep: null }],
        ["closed", { applicationDeadline: null, followUpAt: "2026-08-15T13:00:00.000Z", nextStep: "Email" }],
      ]),
      now,
    );

    expect(view.actions).toHaveLength(1);
    expect(view.actions[0]).toMatchObject({ jobId: "deadline", kind: "deadline" });
  });

  it("builds a standards-based calendar reminder only when a date exists", () => {
    expect(
      calendarFileForApplication({
        company: "Alpha",
        deadline: null,
        followUpAt: null,
        jobTitle: "Implementation Specialist",
        nextStep: null,
        sourceUrl: null,
      }),
    ).toBeNull();

    const calendar = calendarFileForApplication({
      company: "Alpha",
      deadline: null,
      followUpAt: "2026-08-18T13:00:00.000Z",
      jobTitle: "Implementation Specialist",
      nextStep: "Email Jordan, then follow up",
      sourceUrl: "https://example.com/job",
    });
    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("SUMMARY:Alpha: Email Jordan\\, then follow up");
    expect(calendar).toContain("DTSTART:20260818T130000Z");
  });
});
