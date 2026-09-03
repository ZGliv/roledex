import type {
  EmergencyFeedJob,
  EmergencyFeedProfile,
} from "@/features/jobs/emergency-feed";

const SOURCE_LABELS: Record<EmergencyFeedJob["provider"], string> = {
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever",
};

const GENERIC_ROLE_TOKENS = new Set([
  "associate",
  "junior",
  "specialist",
  "consultant",
  "engineer",
  "analyst",
  "manager",
  "technical",
]);

function roleTokens(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !GENERIC_ROLE_TOKENS.has(token));
}

function matchingRoleDirection(
  job: EmergencyFeedJob,
  profile: EmergencyFeedProfile | null,
) {
  if (!profile) return null;
  const titleTokens = new Set(roleTokens(job.title));
  let best: { label: string; overlap: number } | null = null;
  for (const direction of profile.targetRoleFamilies) {
    const overlap = roleTokens(direction).filter((token) =>
      titleTokens.has(token),
    ).length;
    if (overlap > 0 && (!best || overlap > best.overlap)) {
      best = { label: direction, overlap };
    }
  }
  return best?.label ?? null;
}

export function emergencySourceLabel(provider: EmergencyFeedJob["provider"]) {
  return SOURCE_LABELS[provider];
}

export function emergencyPostingLabel(
  value: string | null,
  now: Date = new Date(),
) {
  if (!value) return "Date not supplied";
  const posted = new Date(value);
  if (Number.isNaN(posted.getTime())) return "Date not supplied";
  const elapsedDays = Math.max(
    0,
    Math.floor((now.getTime() - posted.getTime()) / 86_400_000),
  );
  if (elapsedDays === 0) return "Posted today";
  if (elapsedDays === 1) return "Posted yesterday";
  if (elapsedDays <= 30) return `Posted ${elapsedDays} days ago`;
  return `Posted ${new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(posted)}`;
}

function fallbackRoleSignal(job: EmergencyFeedJob) {
  const listing = `${job.title} ${job.summary}`.toLocaleLowerCase("en-US");
  if (/implement|onboard|adoption|launch/.test(listing)) {
    return "The listing centers on implementation, onboarding, or customer adoption.";
  }
  if (/customer success|customer-facing|client/.test(listing)) {
    return "The role has a clear customer-facing technical component.";
  }
  if (/automation|operations|workflow|business systems/.test(listing)) {
    return "The work centers on workflows, systems, or operational automation.";
  }
  if (/product|enablement|solutions/.test(listing)) {
    return "The role sits in a product-adjacent or solutions-oriented lane.";
  }
  return "The role cleared the feed’s title, seniority, pay, and geography checks.";
}

export type EmergencyJobRead = {
  fit: string;
  freshness: string;
  risk: string;
  source: string;
};

export function emergencyJobRead(
  job: EmergencyFeedJob,
  profile: EmergencyFeedProfile | null,
  now: Date = new Date(),
): EmergencyJobRead {
  const direction = matchingRoleDirection(job, profile);
  const fit = direction
    ? `Matches your “${direction}” search direction.`
    : fallbackRoleSignal(job);

  let risk: string;
  if (job.estimatedSalary) {
    risk = "Pay is a market estimate—the employer did not post a range.";
  } else if (job.workArrangement === "Unclear") {
    risk = "Work setup is not stated in the ATS feed.";
  } else if (!job.datePosted) {
    risk = "No publication date was supplied; confirm the role is active.";
  } else if (!job.requirements?.length) {
    risk = "Requirements were not separated; check experience and authorization.";
  } else {
    risk = "Resume and skill evidence are unavailable on-device; confirm the listed requirements.";
  }

  return {
    fit,
    freshness: emergencyPostingLabel(job.datePosted, now),
    risk,
    source: emergencySourceLabel(job.provider),
  };
}
