"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { jobDecisionValues, type JobDecision } from "@/db/schema";
import { requireOwnerSession } from "@/features/auth/session";
import { requireVisitorId } from "@/features/auth/visitor";
import { getActiveCandidateProfileForVisitor } from "@/features/candidate/queries";
import { ensureCurrentFitScoresForProfile } from "@/features/candidate/scoring";
import type { DeckDecision } from "@/features/decisions/policy";
import {
  GuestActivityWriteRateLimitError,
  recordJobDecisionForVisitor,
  recordJobNoteForVisitor,
} from "@/features/decisions/service";
import {
  DISCOVERY_FAILED_REFRESH_BACKOFF_MS,
  DISCOVERY_REFRESH_COOLDOWN_MS,
} from "@/features/discovery/refresh-policy";
import {
  refreshDiscoveryJobs,
  type DiscoveryRefreshResult,
} from "@/features/discovery/service";
import { ManualJobInputSchema } from "@/features/jobs/input";
import { getDeckJobCardsPage } from "@/features/jobs/queries";
import { createManualJob } from "@/features/jobs/service";

export type JobEntryActionState = {
  message: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createManualJobAction(
  _previousState: JobEntryActionState,
  formData: FormData,
): Promise<JobEntryActionState> {
  await requireOwnerSession();

  const parsed = ManualJobInputSchema.safeParse({
    title: formData.get("title"),
    company: formData.get("company"),
    location: formData.get("location"),
    sourceName: formData.get("sourceName"),
    sourceUrl: formData.get("sourceUrl"),
    salarySource: formData.get("salarySource"),
    descriptionRaw: formData.get("descriptionRaw"),
  });

  if (!parsed.success) {
    return {
      message: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let jobId: string;
  try {
    ({ jobId } = await createManualJob(parsed.data));
  } catch (error) {
    console.error("Manual job import failed.", error);
    return {
      message: "The listing could not be imported. Nothing was saved.",
    };
  }

  revalidatePath("/");
  redirect(`/jobs/${jobId}`);
}

const ExpectedDecisionSchema = z.enum(jobDecisionValues);

export type JobMutationActionResult<T> =
  | { ok: true; value: T }
  | { message: string; ok: false };

async function runJobMutation<T>(
  mutation: () => Promise<T>,
): Promise<JobMutationActionResult<T>> {
  try {
    return { ok: true, value: await mutation() };
  } catch (error) {
    if (error instanceof GuestActivityWriteRateLimitError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

const DeckPageRequestSchema = z.object({
  cursor: z.string().max(1_000).nullable().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const DECK_REPLENISHMENT_THRESHOLD = 7;
const COMPLETED_REFRESH_RECHECK_BUFFER_MS = 5_000;
const RUNNING_REFRESH_RECHECK_MS = 15_000;

export type DeckReplenishmentState = {
  message: string;
  nextCheckAt: string | null;
  status: "available" | "caught_up" | "checking" | "error";
};

function nextReplenishmentCheckAt(
  result: DiscoveryRefreshResult,
  now: Date,
) {
  if (result.kind === "running") {
    return new Date(now.getTime() + RUNNING_REFRESH_RECHECK_MS).toISOString();
  }
  if (result.kind === "no_sources") {
    return new Date(
      now.getTime() + DISCOVERY_FAILED_REFRESH_BACKOFF_MS,
    ).toISOString();
  }
  if ("retryAt" in result) return result.retryAt;
  const delay =
    result.status === "failed"
      ? DISCOVERY_FAILED_REFRESH_BACKOFF_MS
      : DISCOVERY_REFRESH_COOLDOWN_MS + COMPLETED_REFRESH_RECHECK_BUFFER_MS;
  return new Date(now.getTime() + delay).toISOString();
}

function replenishmentState(
  result: DiscoveryRefreshResult,
  availableJobs: number,
  now: Date,
): DeckReplenishmentState {
  if (availableJobs > 0) {
    return {
      message: "New matches are ready.",
      nextCheckAt: nextReplenishmentCheckAt(result, now),
      status: "available",
    };
  }

  const status =
    result.kind === "running"
      ? "checking"
      : result.kind === "backoff" ||
          (result.kind === "completed" && result.status === "failed")
        ? "error"
        : "caught_up";
  return {
    message: result.message,
    nextCheckAt: nextReplenishmentCheckAt(result, now),
    status,
  };
}

function deckPagePayload(
  page: Awaited<ReturnType<typeof getDeckJobCardsPage>>,
  replenishment: DeckReplenishmentState,
) {
  return {
    hasMore: page.hasMore,
    jobs: page.jobs,
    nextCursor: page.nextCursor,
    replenishment,
  };
}

export async function loadMoreDeckJobsAction(input: {
  cursor?: string | null;
  limit?: number;
}) {
  await requireVisitorId();
  return getDeckJobCardsPage(DeckPageRequestSchema.parse(input));
}

/**
 * Public, visitor-scoped deck refill. Employer-feed refreshes remain globally
 * leased and rate-limited inside refreshDiscoveryJobs, so many empty visitors
 * cannot fan out into duplicate source scans.
 */
export async function replenishDeckJobsAction(input: { limit?: number }) {
  const visitorId = await requireVisitorId();
  const request = DeckPageRequestSchema.parse({
    cursor: null,
    limit: input.limit,
  });
  const existingPage = await getDeckJobCardsPage(request);

  if (existingPage.totalAvailable > DECK_REPLENISHMENT_THRESHOLD) {
    return deckPagePayload(existingPage, {
      message: "Matches are ready.",
      nextCheckAt: null,
      status: "available",
    });
  }

  try {
    const refreshResult = await refreshDiscoveryJobs("on_demand");
    // The active profile lookup is cached within a server request. Explicitly
    // fill scores again after ingestion so jobs created by this refresh can be
    // returned to this visitor immediately instead of waiting for navigation.
    const profile = await getActiveCandidateProfileForVisitor(visitorId);
    await ensureCurrentFitScoresForProfile(profile);
    const refreshedPage = await getDeckJobCardsPage(request);
    return deckPagePayload(
      refreshedPage,
      replenishmentState(
        refreshResult,
        refreshedPage.totalAvailable,
        new Date(),
      ),
    );
  } catch (error) {
    console.error("Automatic deck replenishment failed.", error);
    return deckPagePayload(existingPage, {
      message:
        "The live company feeds could not be checked right now. Your swipe history is safe.",
      nextCheckAt: new Date(
        Date.now() + DISCOVERY_FAILED_REFRESH_BACKOFF_MS,
      ).toISOString(),
      status: "error",
    });
  }
}

export async function decideJobAction(
  jobId: string,
  decision: DeckDecision,
  expectedDecision: JobDecision,
) {
  const visitorId = await requireVisitorId();
  const expected = ExpectedDecisionSchema.parse(expectedDecision);
  const result = await runJobMutation(() =>
    recordJobDecisionForVisitor(visitorId, {
      jobId,
      decision,
      expectedDecision: expected,
    }),
  );
  if (!result.ok) return result;
  // The deck reconciles the swipe locally. Revalidating the active home route
  // here would stream every remaining rich card back to the phone after each
  // decision. The other views are invalidated for the next time they open.
  revalidatePath("/saved");
  revalidatePath(`/jobs/${jobId}`);
  return result;
}

export async function restoreJobToDeckAction(
  jobId: string,
  expectedDecision: JobDecision,
) {
  const visitorId = await requireVisitorId();
  const expected = ExpectedDecisionSchema.parse(expectedDecision);
  const result = await runJobMutation(() =>
    recordJobDecisionForVisitor(visitorId, {
      jobId,
      decision: "unseen",
      expectedDecision: expected,
    }),
  );
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath(`/jobs/${jobId}`);
  return result;
}

const PipelineStatusSchema = z.enum([
  "saved",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "rejected",
  "offer",
  "archived",
]);

export async function updateJobStatusAction(
  jobId: string,
  status: string,
  expectedDecision: JobDecision,
) {
  const visitorId = await requireVisitorId();
  const input = z
    .object({
      expectedDecision: ExpectedDecisionSchema,
      jobId: z.string().uuid(),
      status: PipelineStatusSchema,
    })
    .parse({ expectedDecision, jobId, status });
  const result = await runJobMutation(() =>
    recordJobDecisionForVisitor(visitorId, {
      jobId: input.jobId,
      decision: input.status,
      expectedDecision: input.expectedDecision,
    }),
  );
  if (!result.ok) return result;
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath(`/jobs/${input.jobId}`);
  return result;
}

export async function addJobNoteAction(jobId: string, note: string) {
  const visitorId = await requireVisitorId();
  const input = z
    .object({ jobId: z.string().uuid(), note: z.string().trim().min(1).max(2_000) })
    .parse({ jobId, note });
  const result = await runJobMutation(() =>
    recordJobNoteForVisitor(visitorId, input),
  );
  if (!result.ok) return result;
  revalidatePath("/saved");
  revalidatePath(`/jobs/${input.jobId}`);
  return result;
}
