import {
  DEFAULT_EMERGENCY_PROFILE,
  type EmergencyFeedJob,
  type EmergencyFeedProfile,
} from "@/features/jobs/emergency-feed";

const PROFILE_KEY = "jobswipe:emergency-profile:v1";
const DECISIONS_KEY = "jobswipe:emergency-decisions:v1";
const SEEN_JOB_IDS_KEY = "jobswipe:emergency-seen:v1";
const SAVED_JOBS_KEY = "jobswipe:emergency-saved:v1";
const MAX_DECISIONS = 250;
const MAX_SEEN_JOB_IDS = 5_000;
const MAX_SAVED_JOBS = 250;
const MAX_SAVED_DESCRIPTION_LENGTH = 4_000;
const MAX_SAVED_REQUIREMENTS = 6;
const MAX_PROFILE_SALARY_CENTS = 50_000_000;
const MAX_PROFILE_YEARS = 50;
const MAX_ROLE_TARGETS = 30;
const MAX_ROLE_LENGTH = 100;

export const EMERGENCY_PROFILE_CHANGED_EVENT =
  "jobswipe:emergency-profile-changed";

export type EmergencyDecision = {
  decidedAt: string;
  decision: "saved" | "skipped";
  job: EmergencyFeedJob;
  syncedAt: string | null;
};

function storageAvailable() {
  return typeof window !== "undefined";
}

function readStorageItem(key: string) {
  if (!storageAvailable()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Embedded/private browser modes can expose localStorage but reject access.
    return null;
  }
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function boundedNumber(
  value: unknown,
  fallback: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(0, Math.round(value)));
}

function stringList(value: unknown, fallback: readonly string[]) {
  if (!Array.isArray(value)) return [...fallback];
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, MAX_ROLE_LENGTH))
        .filter(Boolean),
    ),
  ).slice(0, MAX_ROLE_TARGETS);
}

/**
 * The direct-feed profile crosses local storage and a public query string, so
 * both the client and route use the same small, bounded contract.
 */
export function sanitizeEmergencyProfile(
  value: unknown,
  fallback: EmergencyFeedProfile = DEFAULT_EMERGENCY_PROFILE,
): EmergencyFeedProfile {
  if (!value || typeof value !== "object") {
    return {
      ...fallback,
      desiredSeniorityLevels: [...(fallback.desiredSeniorityLevels ?? [])],
      preferredWorkModes: [...fallback.preferredWorkModes],
      targetRoleFamilies: [...fallback.targetRoleFamilies],
    };
  }

  const profile = value as Partial<EmergencyFeedProfile>;
  const desiredSeniorityLevels = Array.isArray(profile.desiredSeniorityLevels)
    ? Array.from(
        new Set(
          profile.desiredSeniorityLevels.filter(
            (level): level is "entry" | "mid" | "senior" =>
              level === "entry" || level === "mid" || level === "senior",
          ),
        ),
      )
    : [...(fallback.desiredSeniorityLevels ?? [])];
  const preferredWorkModes = Array.isArray(profile.preferredWorkModes)
    ? Array.from(
        new Set(
          profile.preferredWorkModes.filter(
            (mode): mode is "remote" | "hybrid" | "on_site" =>
              mode === "remote" || mode === "hybrid" || mode === "on_site",
          ),
        ),
      )
    : [...fallback.preferredWorkModes];
  const rawLocation =
    typeof profile.location === "string" ? profile.location.trim().slice(0, 120) : null;

  return {
    desiredSeniorityLevels,
    location: rawLocation || null,
    preferredSalaryMinimumCents: boundedNumber(
      profile.preferredSalaryMinimumCents,
      fallback.preferredSalaryMinimumCents,
      MAX_PROFILE_SALARY_CENTS,
    ),
    preferredWorkModes,
    targetRoleFamilies: stringList(
      profile.targetRoleFamilies,
      fallback.targetRoleFamilies,
    ),
    yearsExperience: boundedNumber(
      profile.yearsExperience,
      fallback.yearsExperience ?? 0,
      MAX_PROFILE_YEARS,
    ),
  };
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function isEmergencyFeedJob(value: unknown): value is EmergencyFeedJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<EmergencyFeedJob>;
  return (
    typeof job.id === "string" &&
    typeof job.externalId === "string" &&
    typeof job.sourceKey === "string" &&
    ["ashby", "greenhouse", "lever"].includes(job.provider ?? "") &&
    typeof job.title === "string" &&
    typeof job.company === "string" &&
    typeof job.location === "string" &&
    typeof job.salaryDisplay === "string" &&
    typeof job.summary === "string" &&
    isHttpUrl(job.sourceUrl)
  );
}

export function readEmergencyDecisions(): EmergencyDecision[] {
  if (!storageAvailable()) return [];
  const parsed = safeJson(readStorageItem(DECISIONS_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((value): value is EmergencyDecision => {
      if (!value || typeof value !== "object") return false;
      const item = value as Partial<EmergencyDecision>;
      return (
        (item.decision === "saved" || item.decision === "skipped") &&
        typeof item.decidedAt === "string" &&
        (item.syncedAt === null || typeof item.syncedAt === "string") &&
        isEmergencyFeedJob(item.job)
      );
    })
    .slice(-MAX_DECISIONS);
}

function writeEmergencyDecisions(decisions: readonly EmergencyDecision[]) {
  if (!storageAvailable()) return false;
  try {
    window.localStorage.setItem(
      DECISIONS_KEY,
      JSON.stringify(decisions.slice(-MAX_DECISIONS)),
    );
    return true;
  } catch {
    // Local decisions remain available in memory for this view when storage is blocked.
    return false;
  }
}

function readPersistedEmergencySavedJobs() {
  if (!storageAvailable()) return [];
  const parsed = safeJson(readStorageItem(SAVED_JOBS_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isEmergencyFeedJob)
    .map(compactSavedJob)
    .slice(-MAX_SAVED_JOBS);
}

function writeEmergencySavedJobs(jobs: readonly EmergencyFeedJob[]) {
  if (!storageAvailable()) return false;
  if (jobs.length > MAX_SAVED_JOBS) return false;
  try {
    window.localStorage.setItem(
      SAVED_JOBS_KEY,
      JSON.stringify(jobs.map(compactSavedJob)),
    );
    return true;
  } catch {
    // The bounded decision log remains a backward-compatible fallback.
    return false;
  }
}

/**
 * Lazily migrates saves from the original combined decision log. Decisions are
 * applied last because a later `skipped` record means the user removed a save.
 */
function mergedEmergencySavedJobs(
  decisions: readonly EmergencyDecision[],
  persistedJobs: readonly EmergencyFeedJob[] = readPersistedEmergencySavedJobs(),
) {
  const savedById = new Map(
    persistedJobs.map((job) => [job.id, job] as const),
  );
  for (const item of decisions) {
    if (item.decision === "saved") {
      if (!savedById.has(item.job.id)) savedById.set(item.job.id, item.job);
    } else {
      savedById.delete(item.job.id);
    }
  }
  return [...savedById.values()];
}

function compactDecisionJob(job: EmergencyFeedJob): EmergencyFeedJob {
  const compact = { ...job };
  delete compact.description;
  delete compact.requirements;
  return {
    ...compact,
    summary:
      compact.summary.length > 500
        ? `${compact.summary.slice(0, 497).trimEnd()}…`
        : compact.summary,
  };
}

function compactSavedJob(job: EmergencyFeedJob): EmergencyFeedJob {
  const description = job.description?.trim();
  return {
    ...job,
    description: description
      ? description.length > MAX_SAVED_DESCRIPTION_LENGTH
        ? `${description.slice(0, MAX_SAVED_DESCRIPTION_LENGTH - 1).trimEnd()}…`
        : description
      : undefined,
    requirements: job.requirements
      ?.map((requirement) => requirement.trim().slice(0, 320))
      .filter(Boolean)
      .slice(0, MAX_SAVED_REQUIREMENTS),
    summary:
      job.summary.length > 500
        ? `${job.summary.slice(0, 497).trimEnd()}…`
        : job.summary,
  };
}

export function readEmergencySeenJobIds() {
  if (!storageAvailable()) return [];
  const parsed = safeJson(readStorageItem(SEEN_JOB_IDS_KEY));
  if (!Array.isArray(parsed)) return [];
  return Array.from(
    new Set(
      parsed.filter(
        (value): value is string =>
          typeof value === "string" && value.length > 0 && value.length <= 500,
      ),
    ),
  ).slice(-MAX_SEEN_JOB_IDS);
}

function rememberEmergencyJob(jobId: string) {
  if (!storageAvailable()) return;
  const prior = readEmergencySeenJobIds().filter((id) => id !== jobId);
  try {
    window.localStorage.setItem(
      SEEN_JOB_IDS_KEY,
      JSON.stringify([...prior, jobId].slice(-MAX_SEEN_JOB_IDS)),
    );
  } catch {
    // The full decision entry is still retained when this compact index cannot be written.
  }
}

export function recordEmergencyDecisionWithStatus(
  job: EmergencyFeedJob,
  decision: EmergencyDecision["decision"],
) {
  const decisions = readEmergencyDecisions();
  const prior = decisions.filter((item) => item.job.id !== job.id);
  const next: EmergencyDecision = {
    decidedAt: new Date().toISOString(),
    decision,
    job: compactDecisionJob(job),
    syncedAt: null,
  };
  const persistedSavedJobs = readPersistedEmergencySavedJobs();
  const persistedIds = new Set(persistedSavedJobs.map((savedJob) => savedJob.id));
  const savedById = new Map(
    mergedEmergencySavedJobs(decisions, persistedSavedJobs).map(
      (savedJob) => [savedJob.id, savedJob] as const,
    ),
  );
  const shortlistNeedsMigration =
    savedById.size !== persistedIds.size ||
    [...savedById.keys()].some((id) => !persistedIds.has(id));
  const wasSaved = savedById.has(job.id);
  if (decision === "saved" && !wasSaved && savedById.size >= MAX_SAVED_JOBS) {
    return {
      decision: next,
      persisted: false,
      reason: "saved_limit" as const,
    };
  }
  if (decision === "saved") savedById.set(job.id, compactSavedJob(job));
  else savedById.delete(job.id);
  const decisionPersisted = writeEmergencyDecisions([...prior, next]);
  if (!decisionPersisted) {
    return { decision: next, persisted: false, reason: "storage" as const };
  }
  const shortlistPersisted =
    decision === "saved" || wasSaved || shortlistNeedsMigration
      ? writeEmergencySavedJobs([...savedById.values()])
      : true;
  if (!shortlistPersisted) {
    // The compact log fit before this attempt, so restoring it is the safest
    // available localStorage transaction rollback.
    writeEmergencyDecisions(decisions);
    return { decision: next, persisted: false, reason: "storage" as const };
  }
  rememberEmergencyJob(job.id);
  return {
    decision: next,
    persisted: decisionPersisted && shortlistPersisted,
    reason: null,
  };
}

/** Backward-compatible decision-only API for callers that do not render status. */
export function recordEmergencyDecision(
  job: EmergencyFeedJob,
  decision: EmergencyDecision["decision"],
) {
  return recordEmergencyDecisionWithStatus(job, decision).decision;
}

export function markEmergencyDecisionsSynced(ids: readonly string[]) {
  const completed = new Set(ids);
  if (completed.size === 0) return;
  const now = new Date().toISOString();
  writeEmergencyDecisions(
    readEmergencyDecisions().map((item) =>
      completed.has(item.job.id) ? { ...item, syncedAt: now } : item,
    ),
  );
}

export function pendingEmergencyDecisions() {
  return readEmergencyDecisions().filter((item) => item.syncedAt === null);
}

export function emergencySavedJobs() {
  const jobs = mergedEmergencySavedJobs(readEmergencyDecisions());
  // This also upgrades existing devices that only have the v1 decision log.
  writeEmergencySavedJobs(jobs);
  return jobs;
}

export function saveEmergencyProfileWithStatus(profile: EmergencyFeedProfile) {
  const sanitized = sanitizeEmergencyProfile(profile);
  if (!storageAvailable()) return { persisted: false, profile: sanitized };
  let persisted = false;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(sanitized));
    persisted = true;
  } catch {
    // The server's conservative default still keeps the emergency feed useful.
  }
  if (persisted) {
    try {
      window.dispatchEvent(
        new CustomEvent<EmergencyFeedProfile>(EMERGENCY_PROFILE_CHANGED_EVENT, {
          detail: sanitized,
        }),
      );
    } catch {
      // Some private browsing contexts allow storage but not custom events.
    }
  }
  return { persisted, profile: sanitized };
}

/** Backward-compatible profile-only API for callers that do not render status. */
export function saveEmergencyProfile(profile: EmergencyFeedProfile) {
  return saveEmergencyProfileWithStatus(profile).profile;
}

export function readEmergencyProfile(): EmergencyFeedProfile | null {
  if (!storageAvailable()) return null;
  const parsed = safeJson(readStorageItem(PROFILE_KEY));
  if (!parsed || typeof parsed !== "object") return null;
  return sanitizeEmergencyProfile(parsed);
}
