import type { JobDecision } from "@/db/schema";

export const RESEARCH_SESSION_INACTIVITY_MS = 30 * 60 * 1_000;

const RESEARCH_DECISIONS = new Set<JobDecision>([
  "saved",
  "skipped",
  "stretch",
  "learn_first",
  "apply",
]);

export type ResearchSessionEventInput = {
  company: string;
  decidedAt: string;
  decision: JobDecision;
  id: string;
  jobId: string;
  note: string | null;
  previousDecision: JobDecision | null;
  title: string;
};

export type RankedSessionTouch = {
  count: number;
  label: string;
};

export type ResearchSession = {
  activityDecisionCount: number;
  companies: readonly RankedSessionTouch[];
  durationMinutes: number;
  endAt: string;
  id: string;
  learnFirstCount: number;
  nextStep: string;
  passedCount: number;
  reviewedCount: number;
  roles: readonly RankedSessionTouch[];
  saveRate: number;
  savedCount: number;
  startAt: string;
  stretchCount: number;
};

export type ResearchSessionsAggregate = {
  ignoredEventCount: number;
  learnFirstCount: number;
  meaningfulEventCount: number;
  passedCount: number;
  reviewedCount: number;
  saveRate: number;
  savedCount: number;
  sessions: readonly ResearchSession[];
  stretchCount: number;
};

type TimedResearchEvent = ResearchSessionEventInput & {
  decidedAtMs: number;
};

function roundToOne(value: number) {
  return Math.round(value * 10) / 10;
}

function percentage(count: number, total: number) {
  return total === 0 ? 0 : roundToOne((count / total) * 100);
}

function isMeaningfulResearchDecision(event: ResearchSessionEventInput) {
  return (
    (event.previousDecision === null || event.previousDecision === "unseen") &&
    RESEARCH_DECISIONS.has(event.decision)
  );
}

function timedEvent(event: ResearchSessionEventInput): TimedResearchEvent {
  const decidedAtMs = Date.parse(event.decidedAt);
  if (!Number.isFinite(decidedAtMs)) {
    throw new TypeError(`Research event ${event.id} has an invalid timestamp.`);
  }
  return { ...event, decidedAtMs };
}

function rankTouches(values: readonly string[], limit = 3) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = value.trim() || "Not listed";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ count, label }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.label.localeCompare(right.label, "en-US", { sensitivity: "base" }),
    )
    .slice(0, limit);
}

function nextStepForSession(input: {
  learnFirstCount: number;
  passedCount: number;
  reviewedCount: number;
  savedCount: number;
  stretchCount: number;
}) {
  if (input.reviewedCount < 3) {
    const remaining = 3 - input.reviewedCount;
    return `Review ${remaining} more ${remaining === 1 ? "role" : "roles"} before treating this check-in as a pattern.`;
  }
  if (input.savedCount > 1) {
    return "Compare the roles you kept, then verify the strongest one against its original listing.";
  }
  if (input.savedCount === 1) {
    return "Re-open the role you kept and verify its salary, location, and must-have qualifications.";
  }
  if (input.learnFirstCount > 0) {
    return "Turn one learn-first gap into a small, time-boxed preparation task.";
  }
  if (input.stretchCount > 0) {
    return "Compare the most credible stretch role with one clearer-fit opportunity before applying.";
  }
  if (input.passedCount === input.reviewedCount) {
    return "Nothing in this batch needs follow-up; refill when you want a different mix of roles.";
  }
  return "Review the original listings before taking a next step.";
}

function summarizeSession(events: readonly TimedResearchEvent[]): ResearchSession {
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  if (!firstEvent || !lastEvent) {
    throw new TypeError("A research session requires at least one decision.");
  }

  // An undo followed by a different choice for the same job should describe
  // one reviewed role, not inflate the session. The latest choice wins.
  const latestByJob = new Map<string, TimedResearchEvent>();
  for (const event of events) latestByJob.set(event.jobId, event);
  const decisions = [...latestByJob.values()];

  let savedCount = 0;
  let stretchCount = 0;
  let learnFirstCount = 0;
  let passedCount = 0;
  for (const event of decisions) {
    if (event.decision === "saved" || event.decision === "apply") savedCount++;
    else if (event.decision === "stretch") stretchCount++;
    else if (event.decision === "learn_first") learnFirstCount++;
    else if (event.decision === "skipped") passedCount++;
  }

  const reviewedCount = decisions.length;
  const keptCount = savedCount + stretchCount + learnFirstCount;
  const elapsedMs = lastEvent.decidedAtMs - firstEvent.decidedAtMs;
  const durationMinutes = elapsedMs === 0 ? 0 : Math.max(1, Math.ceil(elapsedMs / 60_000));
  const counts = {
    learnFirstCount,
    passedCount,
    reviewedCount,
    savedCount,
    stretchCount,
  };

  return {
    activityDecisionCount: events.length,
    companies: rankTouches(decisions.map((event) => event.company)),
    durationMinutes,
    endAt: new Date(lastEvent.decidedAtMs).toISOString(),
    id: `${new Date(firstEvent.decidedAtMs).toISOString()}-${firstEvent.id}`,
    ...counts,
    nextStep: nextStepForSession(counts),
    roles: rankTouches(decisions.map((event) => event.title)),
    saveRate: percentage(keptCount, reviewedCount),
    startAt: new Date(firstEvent.decidedAtMs).toISOString(),
  };
}

export function aggregateResearchSessions(
  events: readonly ResearchSessionEventInput[],
  inactivityWindowMs = RESEARCH_SESSION_INACTIVITY_MS,
): ResearchSessionsAggregate {
  if (!Number.isFinite(inactivityWindowMs) || inactivityWindowMs <= 0) {
    throw new RangeError("The research-session inactivity window must be positive.");
  }

  const meaningful = events
    .filter(isMeaningfulResearchDecision)
    .map(timedEvent)
    .sort(
      (left, right) =>
        left.decidedAtMs - right.decidedAtMs || left.id.localeCompare(right.id),
    );

  const grouped: TimedResearchEvent[][] = [];
  for (const event of meaningful) {
    const current = grouped[grouped.length - 1];
    const previous = current?.[current.length - 1];
    if (!current || !previous || event.decidedAtMs - previous.decidedAtMs > inactivityWindowMs) {
      grouped.push([event]);
    } else {
      current.push(event);
    }
  }

  const sessions = grouped.map(summarizeSession).reverse();
  const totals = sessions.reduce(
    (result, session) => ({
      learnFirstCount: result.learnFirstCount + session.learnFirstCount,
      passedCount: result.passedCount + session.passedCount,
      reviewedCount: result.reviewedCount + session.reviewedCount,
      savedCount: result.savedCount + session.savedCount,
      stretchCount: result.stretchCount + session.stretchCount,
    }),
    {
      learnFirstCount: 0,
      passedCount: 0,
      reviewedCount: 0,
      savedCount: 0,
      stretchCount: 0,
    },
  );
  const keptCount = totals.savedCount + totals.stretchCount + totals.learnFirstCount;

  return {
    ignoredEventCount: events.length - meaningful.length,
    meaningfulEventCount: meaningful.length,
    ...totals,
    saveRate: percentage(keptCount, totals.reviewedCount),
    sessions,
  };
}
