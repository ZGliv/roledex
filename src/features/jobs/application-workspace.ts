import type { JobCardDecision } from "@/features/jobs/components/job-card";

export type ApplicationPlanSummary = {
  applicationDeadline: string | null;
  followUpAt: string | null;
  nextStep: string | null;
};

export type ApplicationWorkspaceJob = {
  company: string;
  currentDecision: JobCardDecision;
  id: string;
  title: string;
};

export type ApplicationWorkspaceAction = {
  description: string;
  dueAt: string | null;
  jobId: string;
  kind:
    | "deadline"
    | "follow_up"
    | "interview"
    | "next_step"
    | "plan";
  label: string;
  priority: number;
};

const DAY_MS = 86_400_000;
const CLOSED_DECISIONS = new Set<JobCardDecision>([
  "archived",
  "offer",
  "rejected",
  "skipped",
  "unseen",
]);

function validTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function startOfLocalDay(time: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function relativeDayLabel(time: number, now: number) {
  const days = Math.round(
    (startOfLocalDay(time) - startOfLocalDay(now)) / DAY_MS,
  );
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return "Overdue since yesterday";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function actionForJob(
  job: ApplicationWorkspaceJob,
  plan: ApplicationPlanSummary | null,
  now: number,
): ApplicationWorkspaceAction | null {
  if (CLOSED_DECISIONS.has(job.currentDecision)) return null;

  const followUpAt = validTime(plan?.followUpAt);
  if (followUpAt !== null && followUpAt <= now + DAY_MS) {
    return {
      description:
        followUpAt <= now ? "Follow-up is ready now" : relativeDayLabel(followUpAt, now),
      dueAt: new Date(followUpAt).toISOString(),
      jobId: job.id,
      kind: "follow_up",
      label: plan?.nextStep || `Follow up with ${job.company}`,
      priority: followUpAt <= now ? 0 : 1,
    };
  }

  const deadline = validTime(plan?.applicationDeadline);
  if (
    deadline !== null &&
    !["applied", "interview"].includes(job.currentDecision) &&
    deadline <= now + 3 * DAY_MS
  ) {
    return {
      description: relativeDayLabel(deadline, now),
      dueAt: new Date(deadline).toISOString(),
      jobId: job.id,
      kind: "deadline",
      label: `Finish ${job.company} application`,
      priority: deadline <= now ? 0 : 2,
    };
  }

  if (job.currentDecision === "interview") {
    return {
      description: "Interview stage",
      dueAt: null,
      jobId: job.id,
      kind: "interview",
      label: plan?.nextStep || `Prepare for ${job.company}`,
      priority: 2,
    };
  }

  if (plan?.nextStep) {
    return {
      description: "Next step",
      dueAt: null,
      jobId: job.id,
      kind: "next_step",
      label: plan.nextStep,
      priority: 3,
    };
  }

  if (["apply", "applied"].includes(job.currentDecision)) {
    return {
      description:
        job.currentDecision === "applied"
          ? "Add a follow-up so this does not go cold"
          : "Turn intent into a concrete next step",
      dueAt: null,
      jobId: job.id,
      kind: "plan",
      label:
        job.currentDecision === "applied"
          ? `Plan ${job.company} follow-up`
          : `Plan ${job.company} application`,
      priority: 4,
    };
  }

  return null;
}

export function buildApplicationWorkspace(
  jobs: readonly ApplicationWorkspaceJob[],
  plans: ReadonlyMap<string, ApplicationPlanSummary>,
  now = Date.now(),
) {
  const counts = {
    applying: 0,
    interviews: 0,
    offers: 0,
    shortlist: 0,
  };

  for (const job of jobs) {
    if (["saved", "stretch", "learn_first"].includes(job.currentDecision)) {
      counts.shortlist += 1;
    } else if (["apply", "applied"].includes(job.currentDecision)) {
      counts.applying += 1;
    } else if (job.currentDecision === "interview") {
      counts.interviews += 1;
    } else if (job.currentDecision === "offer") {
      counts.offers += 1;
    }
  }

  const actions = jobs
    .flatMap((job) => {
      const action = actionForJob(job, plans.get(job.id) ?? null, now);
      return action ? [{ ...action, company: job.company, title: job.title }] : [];
    })
    .toSorted((left, right) => {
      if (left.priority !== right.priority) return left.priority - right.priority;
      return (validTime(left.dueAt) ?? Number.MAX_SAFE_INTEGER) -
        (validTime(right.dueAt) ?? Number.MAX_SAFE_INTEGER);
    });

  return {
    actions,
    counts,
    urgentCount: actions.filter((action) => action.priority <= 1).length,
  };
}

export function suggestedFollowUpDate(daysFromNow: number, now = new Date()) {
  const result = new Date(now);
  result.setDate(result.getDate() + daysFromNow);
  result.setHours(9, 0, 0, 0);
  return result;
}

export function calendarFileForApplication(input: {
  company: string;
  deadline: string | null;
  followUpAt: string | null;
  jobTitle: string;
  nextStep: string | null;
  sourceUrl: string | null;
}) {
  const start = validTime(input.followUpAt) ?? validTime(input.deadline);
  if (start === null) return null;
  const end = start + 30 * 60_000;
  const stamp = (time: number) =>
    new Date(time).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const escape = (value: string) =>
    value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const description = [input.nextStep, input.sourceUrl].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobSwipe//Application Planner//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@jobswipe`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`${input.company}: ${input.nextStep || "Application follow-up"}`)}`,
    `DESCRIPTION:${escape(description || input.jobTitle)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
