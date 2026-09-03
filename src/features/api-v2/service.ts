import "server-only";

import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { jobDecisionEvents, nativeInstallations } from "@/db/schema";
import type { InteractionResult } from "@/features/api-v2/contracts";
import type {
  ApiV2InteractionEvent,
  ApiV2SavedUpdate,
} from "@/features/api-v2/input";
import {
  DecisionIdempotencyConflictError,
  FeedExposureMismatchError,
  GuestActivityWriteRateLimitError,
  recordJobDecisionForVisitor,
  recordJobDecisionReasonsForVisitor,
  recordJobNoteForVisitor,
} from "@/features/decisions/service";

function interactionFailure(eventId: string, error: unknown): InteractionResult {
  if (error instanceof DecisionIdempotencyConflictError) {
    return {
      id: eventId,
      status: "rejected",
      retryable: false,
      error: { code: "idempotency_conflict", message: error.message },
    };
  }
  if (error instanceof FeedExposureMismatchError) {
    return {
      id: eventId,
      status: "rejected",
      retryable: false,
      error: { code: "invalid_exposure", message: error.message },
    };
  }
  if (error instanceof GuestActivityWriteRateLimitError) {
    return {
      id: eventId,
      status: "rejected",
      retryable: true,
      error: { code: "rate_limited", message: error.message },
    };
  }
  if (error instanceof Error) {
    const conflict = /another tab|another device|refresh before/i.test(error.message);
    const unavailable = /no longer exists|does not have a recorded decision/i.test(
      error.message,
    );
    if (conflict || unavailable) {
      return {
        id: eventId,
        status: "rejected",
        retryable: false,
        error: {
          code: conflict ? "state_conflict" : "job_unavailable",
          message: error.message,
        },
      };
    }
  }
  console.error("API v2 interaction failed.", { eventId, error });
  return {
    id: eventId,
    status: "rejected",
    retryable: true,
    error: {
      code: "temporarily_unavailable",
      message: "This interaction could not be synced yet.",
    },
  };
}

export async function applyApiV2Interaction(
  visitorId: string,
  event: ApiV2InteractionEvent,
): Promise<InteractionResult> {
  try {
    if (event.kind === "decision") {
      const result = await recordJobDecisionForVisitor(visitorId, {
        eventId: event.id,
        jobId: event.jobId,
        decision: event.decision,
        expectedDecision: event.expectedDecision,
        expectedDecisionEventId: event.expectedDecisionEventId,
        reasonCodes: event.reasonCodes,
        exposureId: event.exposureId ?? undefined,
      });
      return {
        id: event.id,
        status: result.replayed ? "replayed" : "applied",
        retryable: false,
        decision: result.decision,
        decisionEventId: result.decisionEventId,
      };
    }
    if (event.kind === "decision_feedback") {
      const result = await recordJobDecisionReasonsForVisitor(visitorId, {
        eventId: event.id,
        jobId: event.jobId,
        expectedDecision: event.expectedDecision,
        expectedDecisionEventId: event.expectedDecisionEventId,
        reasonCodes: event.reasonCodes,
        exposureId: event.exposureId ?? undefined,
      });
      return {
        id: event.id,
        status: result.replayed ? "replayed" : "applied",
        retryable: false,
        decision: result.decision,
        decisionEventId: event.expectedDecisionEventId,
      };
    }
    const result = await recordJobNoteForVisitor(visitorId, {
      eventId: event.id,
      jobId: event.jobId,
      note: event.note,
    });
    return {
      id: event.id,
      status: result.replayed ? "replayed" : "applied",
      retryable: false,
    };
  } catch (error) {
    return interactionFailure(event.id, error);
  }
}

/** Apply in client order: later offline actions may depend on the event ID created by an earlier swipe. */
export async function applyApiV2InteractionBatch(
  visitorId: string,
  events: readonly ApiV2InteractionEvent[],
) {
  const results: InteractionResult[] = [];
  for (const event of events) {
    results.push(await applyApiV2Interaction(visitorId, event));
  }
  return results;
}

export async function savedJobMetadata(
  visitorId: string,
  jobIds: readonly string[],
) {
  if (jobIds.length === 0) return new Map<string, { note: string | null; updatedAt: string | null }>();
  await ensureDatabaseReady();
  const rows = await db
    .select({
      decidedAt: jobDecisionEvents.decidedAt,
      jobId: jobDecisionEvents.jobListingId,
      note: jobDecisionEvents.note,
    })
    .from(jobDecisionEvents)
    .where(
      and(
        eq(jobDecisionEvents.visitorId, visitorId),
        inArray(jobDecisionEvents.jobListingId, [...jobIds]),
      ),
    )
    .orderBy(desc(jobDecisionEvents.decidedAt), desc(jobDecisionEvents.id));
  const metadata = new Map<string, { note: string | null; updatedAt: string | null }>();
  for (const row of rows) {
    const current = metadata.get(row.jobId);
    if (!current) {
      metadata.set(row.jobId, {
        note: row.note,
        updatedAt: row.decidedAt.toISOString(),
      });
    } else if (current.note === null && row.note !== null) {
      current.note = row.note;
    }
  }
  return metadata;
}

export async function applyApiV2SavedUpdate(
  visitorId: string,
  input: ApiV2SavedUpdate,
) {
  if (input.action === "note") {
    return recordJobNoteForVisitor(visitorId, {
      eventId: input.eventId,
      jobId: input.jobId,
      note: input.note,
    });
  }
  return recordJobDecisionForVisitor(visitorId, {
    eventId: input.eventId,
    jobId: input.jobId,
    decision: input.status,
    expectedDecision: input.expectedDecision,
    expectedDecisionEventId: input.expectedDecisionEventId,
  });
}

export async function listApiV2Sessions(visitorId: string) {
  await ensureDatabaseReady();
  const rows = await db
    .select({
      appVersion: nativeInstallations.appVersion,
      buildNumber: nativeInstallations.buildNumber,
      createdAt: nativeInstallations.createdAt,
      deviceName: nativeInstallations.deviceName,
      id: nativeInstallations.id,
      lastUsedAt: nativeInstallations.lastUsedAt,
      platform: nativeInstallations.platform,
      revokedAt: nativeInstallations.revokedAt,
    })
    .from(nativeInstallations)
    .where(eq(nativeInstallations.visitorId, visitorId))
    .orderBy(desc(nativeInstallations.lastUsedAt), desc(nativeInstallations.createdAt));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }));
}

export async function revokeApiV2Session(
  visitorId: string,
  installationId: string,
  now = new Date(),
) {
  await ensureDatabaseReady();
  const revoked = await db
    .update(nativeInstallations)
    .set({ revokedAt: now, updatedAt: now })
    .where(
      and(
        eq(nativeInstallations.id, installationId),
        eq(nativeInstallations.visitorId, visitorId),
        isNull(nativeInstallations.revokedAt),
      ),
    )
    .returning({ id: nativeInstallations.id });
  return revoked.length === 1;
}
