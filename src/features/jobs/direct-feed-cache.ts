import type { EmergencyFeedJob, EmergencyFeedProfile } from "./emergency-feed";
import { isEmergencyFeedJob } from "./emergency-feed-storage";

const KEY = "roledex:direct-feed:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Keep full, actionable cards warm across tab navigation; profile changes invalidate them. */
export function readDirectFeedCache(
  profile: EmergencyFeedProfile,
): EmergencyFeedJob[] {
  try {
    const cache = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (
      !cache ||
      cache.profile !== JSON.stringify(profile) ||
      typeof cache.savedAt !== "number" ||
      Date.now() - cache.savedAt > MAX_AGE_MS ||
      !Array.isArray(cache.jobs)
    )
      return [];
    return cache.jobs.filter(isEmergencyFeedJob).slice(0, 60);
  } catch {
    return [];
  }
}

export function saveDirectFeedCache(
  jobs: readonly EmergencyFeedJob[],
  profile: EmergencyFeedProfile,
) {
  if (!jobs.length) return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        profile: JSON.stringify(profile),
        savedAt: Date.now(),
        jobs: jobs
          .slice(0, 60)
          .map((job) => ({
            ...job,
            description: job.description?.slice(0, 6000),
          })),
      }),
    );
  } catch {
    /* The live feed still works when the optional cache is full. */
  }
}
