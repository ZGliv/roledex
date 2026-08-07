import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  jobDecisionEvents,
  jobListings,
  jobDecisionValues,
  visitorJobStates,
} from "@/db/schema";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import { requireVisitorId } from "@/features/auth/visitor";
import { getActiveCandidateProfileForVisitor } from "@/features/candidate/queries";
import { canRecordDecision } from "@/features/decisions/policy";

const DecisionInputSchema = z.object({
  jobId: z.string().uuid(),
  decision: z.enum(jobDecisionValues),
  expectedDecision: z.enum(jobDecisionValues).optional(),
  note: z.string().trim().max(2_000).optional(),
});

const NoteInputSchema = z.object({
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

    if (currentDecision === input.decision) {
      return { changed: false, decision: currentDecision };
    }
    if (
      input.expectedDecision !== undefined &&
      currentDecision !== input.expectedDecision
    ) {
      throw new Error(
        "This job changed in another tab or device. Refresh before changing it again.",
      );
    }
    if (!canRecordDecision(currentDecision, input.decision)) {
      return { changed: false, decision: currentDecision };
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
    const changedState = state
      ? await transaction
          .update(visitorJobStates)
          .set({ currentDecision: input.decision, updatedAt: now })
          .where(
            and(
              eq(visitorJobStates.visitorId, visitorId),
              eq(visitorJobStates.jobListingId, listing.id),
              eq(visitorJobStates.currentDecision, currentDecision),
            ),
          )
          .returning({ jobListingId: visitorJobStates.jobListingId })
      : await transaction
          .insert(visitorJobStates)
          .values({
            visitorId,
            jobListingId: listing.id,
            currentDecision: input.decision,
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
      visitorId,
      jobListingId: listing.id,
      jobRevisionId: listing.currentRevisionId,
      previousDecision: currentDecision,
      decision: input.decision,
      note: input.note || null,
      decidedAt: now,
    });

    return { changed: true, decision: input.decision };
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
    };
  });
}
