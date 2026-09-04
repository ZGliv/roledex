import type { CachedJobSummary } from "./feed-snapshot";

const KEY = "roledex:applications:v1";
export const APPLICATIONS_CHANGED_EVENT = "roledex:applications-changed";
export const APPLICATION_STAGES = [
  "saved",
  "applied",
  "interview",
  "offer",
  "archived",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
export type TrackedApplication = {
  job: CachedJobSummary;
  stage: ApplicationStage;
  note: string;
  updatedAt: string;
};

export function readTrackedApplications(): TrackedApplication[] {
  try {
    const data: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    return data
      .filter((entry): entry is TrackedApplication => {
        if (!entry || typeof entry !== "object") return false;
        const { job, stage, note, updatedAt } = entry;
        if (
          !job ||
          typeof job.id !== "string" ||
          typeof job.title !== "string" ||
          typeof job.company !== "string" ||
          typeof job.location !== "string" ||
          typeof job.salaryDisplay !== "string"
        )
          return false;
        if (
          !APPLICATION_STAGES.includes(stage) ||
          typeof note !== "string" ||
          typeof updatedAt !== "string"
        )
          return false;
        if (job.sourceUrl !== null) {
          try {
            if (!["https:", "http:"].includes(new URL(job.sourceUrl).protocol))
              return false;
          } catch {
            return false;
          }
        }
        return true;
      })
      .slice(0, 500);
  } catch {
    return [];
  }
}

export function saveTrackedApplication(
  job: CachedJobSummary,
  changes: { stage?: ApplicationStage; note?: string },
) {
  const prior = readTrackedApplications();
  const current = prior.find((entry) => entry.job.id === job.id);
  if (!current && prior.length >= 500) return false;
  const next: TrackedApplication = {
    job: {
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      salaryDisplay: job.salaryDisplay,
      employmentType: job.employmentType,
      datePosted: job.datePosted,
      workArrangement: job.workArrangement,
      sourceUrl: job.sourceUrl,
    },
    stage: changes.stage ?? current?.stage ?? "saved",
    note: (changes.note ?? current?.note ?? "").slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([
        next,
        ...prior.filter((entry) => entry.job.id !== job.id),
      ]),
    );
  } catch {
    return false;
  }
  try {
    window.dispatchEvent(new Event(APPLICATIONS_CHANGED_EVENT));
  } catch {
    /* private browser */
  }
  return true;
}

export function applicationPipeline(
  saved: readonly CachedJobSummary[],
  tracked: readonly TrackedApplication[],
) {
  const rows = new Map<string, TrackedApplication>();
  for (const job of saved)
    rows.set(job.id, { job, stage: "saved", note: "", updatedAt: "" });
  for (const entry of tracked)
    rows.set(entry.job.id, {
      ...entry,
      job: rows.get(entry.job.id)?.job ?? entry.job,
    });
  return [...rows.values()];
}
