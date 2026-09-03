import "server-only";

import { randomUUID } from "node:crypto";

import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  feedExposures,
  jobDecisionEvents,
  jobListings,
  jobDecisionReasonValues,
  jobDecisionValues,
  visitorFeedQueueEntries,
  visitorFeedQueues,
  visitorJobStates,
} from "@/db/schema";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import { requireVisitorId } from "@/features/auth/visitor";
import { getActiveCandidateProfileForVisitor } from "@/features/candidate/queries";
import { canRecordDecision } from "@/features/decisions/policy";
import { MATERIALIZED_FEED_REBUILD_INTERACTION_COUNT } from "@/features/jobs/feed-queue-store";

function createReasonCodesSchema(minimum: number) {
  return z
    .array(z.enum(jobDecisionReasonValues))
    .min(minimum)
    .max(jobDecisionReasonValues.length)
    .refine((reasonCodes) => new Set(reasonCodes).size === reasonCodes.length, {
      message: "Decision reason codes must be unique.",
    });
}

export const JobDecisionReasonCodesSchema = createReasonCodesSchema(0);

const DecisionInputSchema = z.object({
  eventId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  decision: z.enum(jobDecisionValues),
  expectedDecision: z.enum(jobDecisionValues),
  expectedDecisionEventId: z.string().uuid().nullable(),
  note: z.string().trim().max(2_000).optional(),
  reasonCodes: JobDecisionReasonCodesSchema.optional(),
  exposureId: z.string().uuid().optional(),
});

const DecisionReasonsInputSchema = z.object({
  eventId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  expectedDecision: z.enum(jobDecisionValues),
  expectedDecisionEventId: z.string().uuid(),
  reasonCodes: createReasonCodesSchema(1),
  exposureId: z.string().uuid().optional(),
});

const NoteInputSchema = z.object({
  eventId: z.string().uuid().optional(),
  jobId: z.string().uuid(),
  note: z.string().trim().min(1).max(2_000),
});

export const GUEST_ACTIVITY_WRITE_HOURLY_LIMIT = 150;
export const GUEST_ACTIVITY_WRITE_HOURLY_WINDOW_MS = 60 * 60 * 1_000;

export class GuestActivityWriteRateLimitError extends Error {
  constructor() {
    super(
      "You have reached the hourly save limit. Try again in a little while.",
    );
    this.name = "GuestActivityWriteRateLimitError";
  }
}

export class DecisionIdempotencyConflictError extends Error {
  constructor() {
    super("This interaction ID was already used for a different change.");
    this.name = "DecisionIdempotencyConflictError";
  }
}

export class FeedExposureMismatchError extends Error {
  constructor() {
    super("This feed exposure does not belong to this visitor and job.");
    this.name = "FeedExposureMismatchError";
  }
}

function sameReasonCodes(
  left: readonly string[],
  right: readonly string[],
) {
  return left.length === right.length &&
    [...left].toSorted().every((value, index) => value === [...right].toSorted()[index]);
}

function shouldEnforceGuestWriteQuota(visitorId: string) {
  return (
    (Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production") &&
    visitorId !== OWNER_VISITOR_ID
  );
}

export async function recordJobDecision(rawInput: z.input<typeof DecisionInputSchema>) {
  return recordJobDecisionForVisitor(await requireVisitorId(), rawInput);
}

export async function recordJobDecisionForVisitor(
  visitorId: string,
  rawInput: z.input<typeof DecisionInputSchema>,
) {
  const input = DecisionInputSchema.parse(rawInput);
  await ensureDatabaseReady();
  await getActiveCandidateProfileForVisitor(visitorId);

  return db.transaction(async (transaction) => {
    if (input.eventId) {
      const [existingEvent] = await transaction
        .select({
          decision: jobDecisionEvents.decision,
          feedExposureId: jobDecisionEvents.feedExposureId,
          id: jobDecisionEvents.id,
          jobListingId: jobDecisionEvents.jobListingId,
          note: jobDecisionEvents.note,
          reasonCodes: jobDecisionEvents.reasonCodes,
          visitorId: jobDecisionEvents.visitorId,
        })
        .from(jobDecisionEvents)
        .where(eq(jobDecisionEvents.id, input.eventId))
        .limit(1);
      if (existingEvent) {
        if (
          existingEvent.visitorId !== visitorId ||
          existingEvent.jobListingId !== input.jobId ||
          existingEvent.decision !== input.decision ||
          (input.exposureId !== undefined &&
            existingEvent.feedExposureId !== input.exposureId) ||
          (existingEvent.note ?? null) !== (input.note ?? null) ||
          !sameReasonCodes(existingEvent.reasonCodes, input.reasonCodes ?? [])
        ) {
          throw new DecisionIdempotencyConflictError();
        }
        return {
          changed: false,
          decision: existingEvent.decision,
          decisionEventId: existingEvent.id,
          replayed: true,
        };
      }
    }
    const [listing] = await transaction
      .select()
      .from(jobListings)
      .where(eq(jobListings.id, input.jobId))
      .limit(1);

    if (!listing) throw new Error("The selected job no longer exists.");
    const [state] = await transaction
      .select()
      .from(visitorJobStates)
      .where(
        and(
          eq(visitorJobStates.visitorId, visitorId),
          eq(visitorJobStates.jobListingId, listing.id),
        ),
      )
      .limit(1);
    const currentDecision = state?.currentDecision ?? "unseen";
    const currentDecisionEventId = state?.currentDecisionEventId ?? null;

    if (
      currentDecision !== input.expectedDecision ||
      currentDecisionEventId !== input.expectedDecisionEventId
    ) {
      throw new Error(
        "This job changed in another tab or device. Refresh before changing it again.",
      );
    }
    if (currentDecision === input.decision) {
      return {
        changed: false,
        decision: currentDecision,
        decisionEventId: currentDecisionEventId,
      };
    }
    if (!canRecordDecision(currentDecision, input.decision)) {
      return {
        changed: false,
        decision: currentDecision,
        decisionEventId: currentDecisionEventId,
      };
    }

    const now = new Date();
    const exposureWindowStart = new Date(
      now.getTime() - 24 * 60 * 60 * 1_000,
    );
    const [exposure] = await transaction
      .select({ id: feedExposures.id })
      .from(feedExposures)
      .where(
        and(
          eq(feedExposures.visitorId, visitorId),
          eq(feedExposures.jobListingId, listing.id),
          input.exposureId
            ? eq(feedExposures.id, input.exposureId)
            : gte(feedExposures.exposedAt, exposureWindowStart),
        ),
      )
      .orderBy(desc(feedExposures.exposedAt), desc(feedExposures.id))
      .limit(1);
    if (input.exposureId && !exposure) {
      throw new FeedExposureMismatchError();
    }
    if (shouldEnforceGuestWriteQuota(visitorId)) {
      const [recentWrites] = await transaction
        .select({ value: count() })
        .from(jobDecisionEvents)
        .where(
          and(
            eq(jobDecisionEvents.visitorId, visitorId),
            gte(
              jobDecisionEvents.decidedAt,
              new Date(now.getTime() - GUEST_ACTIVITY_WRITE_HOURLY_WINDOW_MS),
            ),
          ),
        );
      if ((recentWrites?.value ?? 0) >= GUEST_ACTIVITY_WRITE_HOURLY_LIMIT) {
        throw new GuestActivityWriteRateLimitError();
      }
    }
    const decisionEventId = input.eventId ?? randomUUID();
    const changedState = state
      ? await transaction
          .update(visitorJobStates)
          .set({
            currentDecision: input.decision,
            currentDecisionEventId: decisionEventId,
            updatedAt: now,
          })
          .where(
            and(
              eq(visitorJobStates.visitorId, visitorId),
              eq(visitorJobStates.jobListingId, listing.id),
              eq(visitorJobStates.currentDecision, currentDecision),
              currentDecisionEventId === null
                ? isNull(visitorJobStates.currentDecisionEventId)
                : eq(
                    visitorJobStates.currentDecisionEventId,
                    currentDecisionEventId,
                  ),
            ),
          )
          .returning({ jobListingId: visitorJobStates.jobListingId })
      : await transaction
          .insert(visitorJobStates)
          .values({
            visitorId,
            jobListingId: listing.id,
            currentDecision: input.decision,
            currentDecisionEventId: decisionEventId,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning({ jobListingId: visitorJobStates.jobListingId });

    if (changedState.length !== 1) {
      throw new Error(
        "This job changed in another tab or device. Refresh before changing it again.",
      );
    }

    // Keep the legacy column synchronized only for the migrated owner. Global
    // discovery never reads this field; all product state comes from the
    // visitor/job table above.
    if (visitorId === OWNER_VISITOR_ID) {
      await transaction
        .update(jobListings)
        .set({ currentDecision: input.decision, updatedAt: now })
        .where(eq(jobListings.id, listing.id));
    }

    await transaction.insert(jobDecisionEvents).values({
      id: decisionEventId,
      visitorId,
      jobListingId: listing.id,
      jobRevisionId: listing.currentRevisionId,
      previousDecision: currentDecision,
      decision: input.decision,
      note: input.note || null,
      reasonCodes: input.reasonCodes ?? [],
      feedExposureId: exposure?.id ?? null,
      decidedAt: now,
    });

    if (exposure) {
      await transaction
        .update(feedExposures)
        .set({
          firstInteractionAt: sql`coalesce(${feedExposures.firstInteractionAt}, ${now})`,
          lastInteractionAt: now,
        })
        .where(
          and(
            eq(feedExposures.id, exposure.id),
            eq(feedExposures.visitorId, visitorId),
            eq(feedExposures.jobListingId, listing.id),
          ),
        );
    }

    if (input.decision === "unseen") {
      await transaction
        .update(visitorFeedQueues)
        .set({ invalidatedAt: now, updatedAt: now })
        .where(eq(visitorFeedQueues.visitorId, visitorId));
    } else {
      await transaction
        .update(visitorFeedQueueEntries)
        .set({ consumedAt: now, decisionEventId })
        .where(
          and(
            eq(visitorFeedQueueEntries.visitorId, visitorId),
            eq(visitorFeedQueueEntries.jobListingId, listing.id),
            isNull(visitorFeedQueueEntries.consumedAt),
          ),
        );
      await transaction
        .update(visitorFeedQueues)
        .set({
          pendingInteractionCount: sql`${visitorFeedQueues.pendingInteractionCount} + 1`,
          preferenceDirtyAt: now,
          updatedAt: now,
        })
        .where(eq(visitorFeedQueues.visitorId, visitorId));
    }

    return {
      changed: true,
      decision: input.decision,
      decisionEventId,
      replayed: false,
    };
  });
}

export async function recordJobDecisionReasons(
  rawInput: z.input<typeof DecisionReasonsInputSchema>,
) {
  return recordJobDecisionReasonsForVisitor(await requireVisitorId(), rawInput);
}

/**
 * Appends feedback to the immutable event stream without rewriting the swipe
 * that preceded it. Requiring the current decision prevents a delayed chip tap
 * from being attached after the job has changed in another tab or device.
 */
export async function recordJobDecisionReasonsForVisitor(
  visitorId: string,
  rawInput: z.input<typeof DecisionReasonsInputSchema>,
) {
  const input = DecisionReasonsInputSchema.parse(rawInput);
  await ensureDatabaseReady();
  await getActiveCandidateProfileForVisitor(visitorId);

  return db.transaction(async (transaction) => {
    if (input.eventId) {
      const [existingEvent] = await transaction
        .select({
          decision: jobDecisionEvents.decision,
          feedExposureId: jobDecisionEvents.feedExposureId,
          id: jobDecisionEvents.id,
          jobListingId: jobDecisionEvents.jobListingId,
          reasonCodes: jobDecisionEvents.reasonCodes,
          visitorId: jobDecisionEvents.visitorId,
        })
        .from(jobDecisionEvents)
        .where(eq(jobDecisionEvents.id, input.eventId))
        .limit(1);
      if (existingEvent) {
        if (
          existingEvent.visitorId !== visitorId ||
          existingEvent.jobListingId !== input.jobId ||
          existingEvent.decision !== input.expectedDecision ||
          (input.exposureId !== undefined &&
            existingEvent.feedExposureId !== input.exposureId) ||
          !sameReasonCodes(existingEvent.reasonCodes, input.reasonCodes)
        ) {
          throw new DecisionIdempotencyConflictError();
        }
        return {
          decidedAt: null,
          decision: existingEvent.decision,
          id: existingEvent.id,
          reasonCodes: existingEvent.reasonCodes,
          replayed: true,
        };
      }
    }
    const [listing] = await transaction
      .select({
        currentRevisionId: jobListings.currentRevisionId,
        id: jobListings.id,
      })
      .from(jobListings)
      .where(eq(jobListings.id, input.jobId))
      .limit(1);

    if (!listing) throw new Error("The selected job no longer exists.");

    const [state] = await transaction
      .select({
        currentDecision: visitorJobStates.currentDecision,
        currentDecisionEventId: visitorJobStates.currentDecisionEventId,
      })
      .from(visitorJobStates)
      .where(
        and(
          eq(visitorJobStates.visitorId, visitorId),
          eq(visitorJobStates.jobListingId, listing.id),
        ),
      )
      .limit(1);

    if (!state) {
      throw new Error("This job does not have a recorded decision to annotate.");
    }
    if (state.currentDecision !== input.expectedDecision) {
      throw new Error(
        "This job changed in another tab or device. Refresh before adding feedback.",
      );
    }
    if (state.currentDecisionEventId !== input.expectedDecisionEventId) {
      throw new Error(
        "This job changed in another tab or device. Refresh before adding feedback.",
      );
    }

    const [decisionEvent] = await transaction
      .select({ feedExposureId: jobDecisionEvents.feedExposureId })
      .from(jobDecisionEvents)
      .where(
        and(
          eq(jobDecisionEvents.id, input.expectedDecisionEventId),
          eq(jobDecisionEvents.visitorId, visitorId),
          eq(jobDecisionEvents.jobListingId, listing.id),
        ),
      )
      .limit(1);
    if (
      input.exposureId !== undefined &&
      decisionEvent?.feedExposureId !== input.exposureId
    ) {
      throw new FeedExposureMismatchError();
    }

    const now = new Date();
    if (shouldEnforceGuestWriteQuota(visitorId)) {
      const [recentWrites] = await transaction
        .select({ value: count() })
        .from(jobDecisionEvents)
        .where(
          and(
            eq(jobDecisionEvents.visitorId, visitorId),
            gte(
              jobDecisionEvents.decidedAt,
              new Date(now.getTime() - GUEST_ACTIVITY_WRITE_HOURLY_WINDOW_MS),
            ),
          ),
        );
      if ((recentWrites?.value ?? 0) >= GUEST_ACTIVITY_WRITE_HOURLY_LIMIT) {
        throw new GuestActivityWriteRateLimitError();
      }
    }

    const [event] = await transaction
      .insert(jobDecisionEvents)
      .values({
        id: input.eventId,
        visitorId,
        jobListingId: listing.id,
        jobRevisionId: listing.currentRevisionId,
        previousDecision: state.currentDecision,
        decision: state.currentDecision,
        reasonCodes: input.reasonCodes,
        feedExposureId: decisionEvent?.feedExposureId ?? null,
        decidedAt: now,
      })
      .returning({
        decidedAt: jobDecisionEvents.decidedAt,
        id: jobDecisionEvents.id,
      });

    if (decisionEvent?.feedExposureId) {
      await transaction
        .update(feedExposures)
        .set({
          firstInteractionAt: sql`coalesce(${feedExposures.firstInteractionAt}, ${now})`,
          lastInteractionAt: now,
        })
        .where(
          and(
            eq(feedExposures.id, decisionEvent.feedExposureId),
            eq(feedExposures.visitorId, visitorId),
            eq(feedExposures.jobListingId, listing.id),
          ),
        );
    }
    await transaction
      .update(visitorFeedQueues)
      .set({
        pendingInteractionCount: sql`max(${visitorFeedQueues.pendingInteractionCount}, ${MATERIALIZED_FEED_REBUILD_INTERACTION_COUNT})`,
        preferenceDirtyAt: now,
        updatedAt: now,
      })
      .where(eq(visitorFeedQueues.visitorId, visitorId));

    return {
      decidedAt: event.decidedAt.toISOString(),
      decision: state.currentDecision,
      id: event.id,
      reasonCodes: input.reasonCodes,
      replayed: false,
    };
  });
}

export async function recordJobNote(rawInput: z.input<typeof NoteInputSchema>) {
  return recordJobNoteForVisitor(await requireVisitorId(), rawInput);
}

export async function recordJobNoteForVisitor(
  visitorId: string,
  rawInput: z.input<typeof NoteInputSchema>,
) {
  const input = NoteInputSchema.parse(rawInput);
  await ensureDatabaseReady();
  await getActiveCandidateProfileForVisitor(visitorId);

  return db.transaction(async (transaction) => {
    if (input.eventId) {
      const [existingEvent] = await transaction
        .select({
          decision: jobDecisionEvents.decision,
          id: jobDecisionEvents.id,
          jobListingId: jobDecisionEvents.jobListingId,
          note: jobDecisionEvents.note,
          visitorId: jobDecisionEvents.visitorId,
        })
        .from(jobDecisionEvents)
        .where(eq(jobDecisionEvents.id, input.eventId))
        .limit(1);
      if (existingEvent) {
        if (
          existingEvent.visitorId !== visitorId ||
          existingEvent.jobListingId !== input.jobId ||
          existingEvent.note !== input.note
        ) {
          throw new DecisionIdempotencyConflictError();
        }
        return {
          id: existingEvent.id,
          note: existingEvent.note,
          decidedAt: null,
          replayed: true,
        };
      }
    }
    const [listing] = await transaction
      .select()
      .from(jobListings)
      .where(eq(jobListings.id, input.jobId))
      .limit(1);

    if (!listing) throw new Error("The selected job no longer exists.");
    const [state] = await transaction
      .select({ currentDecision: visitorJobStates.currentDecision })
      .from(visitorJobStates)
      .where(
        and(
          eq(visitorJobStates.visitorId, visitorId),
          eq(visitorJobStates.jobListingId, listing.id),
        ),
      )
      .limit(1);
    const currentDecision = state?.currentDecision ?? "unseen";
    const now = new Date();

    if (shouldEnforceGuestWriteQuota(visitorId)) {
      const [recentWrites] = await transaction
        .select({ value: count() })
        .from(jobDecisionEvents)
        .where(
          and(
            eq(jobDecisionEvents.visitorId, visitorId),
            gte(
              jobDecisionEvents.decidedAt,
              new Date(now.getTime() - GUEST_ACTIVITY_WRITE_HOURLY_WINDOW_MS),
            ),
          ),
        );
      if ((recentWrites?.value ?? 0) >= GUEST_ACTIVITY_WRITE_HOURLY_LIMIT) {
        throw new GuestActivityWriteRateLimitError();
      }
    }

    const [event] = await transaction
      .insert(jobDecisionEvents)
      .values({
        id: input.eventId,
        visitorId,
        jobListingId: listing.id,
        jobRevisionId: listing.currentRevisionId,
        previousDecision: currentDecision,
        decision: currentDecision,
        note: input.note,
        decidedAt: now,
      })
      .returning({ id: jobDecisionEvents.id, decidedAt: jobDecisionEvents.decidedAt });

    return {
      id: event.id,
      note: input.note,
      decidedAt: event.decidedAt.toISOString(),
      replayed: false,
    };
  });
}
