import "server-only";

import { and, eq, inArray, lte } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import {
  analysisRuns,
  candidateProfiles,
  fitScoreRuns,
  visitors,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";

export const VISITOR_ACTIVITY_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1_000;

export class OwnerWorkspaceDeletionError extends Error {
  constructor() {
    super("The owner workspace cannot be reset from the guest data controls.");
    this.name = "OwnerWorkspaceDeletionError";
  }
}

type VisitorActivityOptions = {
  now?: Date;
};

/**
 * Records activity with no more than one write per guest per day. This keeps
 * enough information for later retention cleanup without writing on every
 * page view.
 */
export async function touchGuestVisitorActivity(
  visitorId: string,
  options: VisitorActivityOptions = {},
) {
  if (visitorId === OWNER_VISITOR_ID) return false;
  await ensureDatabaseReady();
  const now = options.now ?? new Date();
  const staleBefore = new Date(
    now.getTime() - VISITOR_ACTIVITY_TOUCH_INTERVAL_MS,
  );

  return withDatabaseWriteRetry(async () => {
    const updated = await db
      .update(visitors)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(visitors.id, visitorId),
          eq(visitors.kind, "guest"),
          lte(visitors.lastSeenAt, staleBefore),
        ),
      )
      .returning({ id: visitors.id });
    return updated.length === 1;
  });
}

/**
 * Permanently removes one guest workspace. Fit and analysis rows use
 * restrictive profile foreign keys, so they are deleted explicitly before
 * the profile; decision history and job state then cascade with the visitor.
 */
export async function deleteGuestWorkspaceForVisitor(visitorId: string) {
  if (visitorId === OWNER_VISITOR_ID) {
    throw new OwnerWorkspaceDeletionError();
  }
  await ensureDatabaseReady();

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      const [visitor] = await transaction
        .select({ kind: visitors.kind })
        .from(visitors)
        .where(eq(visitors.id, visitorId))
        .limit(1);
      if (!visitor) return { deleted: false, profilesDeleted: 0 };
      if (visitor.kind === "owner") throw new OwnerWorkspaceDeletionError();

      const profiles = await transaction
        .select({ id: candidateProfiles.id })
        .from(candidateProfiles)
        .where(eq(candidateProfiles.visitorId, visitorId));
      const profileIds = profiles.map(({ id }) => id);
      if (profileIds.length > 0) {
        await transaction
          .delete(analysisRuns)
          .where(inArray(analysisRuns.candidateProfileId, profileIds));
        await transaction
          .delete(fitScoreRuns)
          .where(inArray(fitScoreRuns.candidateProfileId, profileIds));
        await transaction
          .delete(candidateProfiles)
          .where(inArray(candidateProfiles.id, profileIds));
      }

      const deleted = await transaction
        .delete(visitors)
        .where(and(eq(visitors.id, visitorId), eq(visitors.kind, "guest")))
        .returning({ id: visitors.id });
      return {
        deleted: deleted.length === 1,
        profilesDeleted: profileIds.length,
      };
    }),
  );
}
