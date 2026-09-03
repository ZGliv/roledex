import {
  DEFAULT_JOB_SOURCES,
  type StarterJobSource,
} from "@/features/discovery/default-sources";
import {
  DEFAULT_EMERGENCY_PROFILE,
  EMERGENCY_JOB_SOURCES,
  type EmergencyFeedProfile,
} from "@/features/jobs/emergency-feed";
import { sanitizeEmergencyProfile } from "@/features/jobs/emergency-feed-storage";

export const EMERGENCY_FEED_SOURCE_SHARD_SIZE = 4;
const MAX_PROFILE_QUERY_LENGTH = 8_000;

function sourceIdentity(source: StarterJobSource) {
  return `${source.provider}:${source.providerKey}`;
}

/**
 * Starts with the higher-yield fallback boards, then scans the rest of the
 * verified first-party ATS network. A board appears once in a complete pass.
 */
export const EMERGENCY_FEED_SOURCE_NETWORK: readonly StarterJobSource[] = [
  ...EMERGENCY_JOB_SOURCES,
  ...DEFAULT_JOB_SOURCES,
].filter(
  (source, index, sources) =>
    sources.findIndex(
      (candidate) => sourceIdentity(candidate) === sourceIdentity(source),
    ) === index,
);

export type EmergencyFeedPageMeta = {
  checkedSources: number;
  failedSources: number;
  generatedAt: string;
  hasMore: boolean;
  nextCursor: string | null;
  profileSource: "default" | "device";
  refreshAfterSeconds: number;
  source: "official_public_ats";
  sourceBatch: number;
  successfulSources: number;
  totalSourceBatches: number;
  totalSources: number;
};

export function parseEmergencyFeedCursor(value: string | null) {
  if (!value || !/^\d{1,4}$/.test(value)) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return 0;
  return Math.min(parsed, EMERGENCY_FEED_SOURCE_NETWORK.length);
}

function isCompleteProfile(value: unknown): value is EmergencyFeedProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<EmergencyFeedProfile>;
  return (
    Array.isArray(profile.targetRoleFamilies) &&
    profile.targetRoleFamilies.every((item) => typeof item === "string") &&
    Array.isArray(profile.desiredSeniorityLevels) &&
    typeof profile.preferredSalaryMinimumCents === "number" &&
    Array.isArray(profile.preferredWorkModes) &&
    (typeof profile.location === "string" || profile.location === null) &&
    typeof profile.yearsExperience === "number"
  );
}

export function parseEmergencyFeedProfile(value: string | null): {
  profile: EmergencyFeedProfile;
  source: "default" | "device";
} {
  if (!value || value.length > MAX_PROFILE_QUERY_LENGTH) {
    return { profile: DEFAULT_EMERGENCY_PROFILE, source: "default" };
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isCompleteProfile(decoded)) {
      return { profile: DEFAULT_EMERGENCY_PROFILE, source: "default" };
    }
    return { profile: sanitizeEmergencyProfile(decoded), source: "device" };
  } catch {
    return { profile: DEFAULT_EMERGENCY_PROFILE, source: "default" };
  }
}

export function emergencyFeedSourceShard(cursor: number) {
  return EMERGENCY_FEED_SOURCE_NETWORK.slice(
    cursor,
    cursor + EMERGENCY_FEED_SOURCE_SHARD_SIZE,
  );
}
