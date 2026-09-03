import "server-only";

import { and, count, eq, gte } from "drizzle-orm";

import { db, ensureDatabaseReady } from "@/db/client";
import { candidateProfiles, visitors } from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";

export const GUEST_WORKSPACE_HOURLY_ADMISSION_LIMIT = 30;
export const GUEST_WORKSPACE_DAILY_ADMISSION_LIMIT = 200;
export const GUEST_WORKSPACE_HOURLY_ADMISSION_WINDOW_MS = 60 * 60 * 1_000;
export const GUEST_WORKSPACE_DAILY_ADMISSION_WINDOW_MS = 24 * 60 * 60 * 1_000;

export class GuestWorkspaceCapacityError extends Error {
  constructor() {
    super("RoleDex is at guest capacity right now. Try again in a little while.");
    this.name = "GuestWorkspaceCapacityError";
  }
}

type AdmissionOptions = {
  enforce?: boolean;
  now?: Date;
};

/**
 * Bounds first-time guest workspaces before the more expensive profile and fit
 * rows are created. The current visitor row already exists at this point, so it
 * participates in the hourly count and is removed when admission is denied.
 */
export async function admitVisitorWorkspace(
  visitorId: string,
  options: AdmissionOptions = {},
) {
  if (visitorId === OWNER_VISITOR_ID) return;
  const enforce =
    options.enforce ??
    (Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production");
  if (!enforce) return;

  await ensureDatabaseReady();
  const now = options.now ?? new Date();
  const hourlyWindowStart = new Date(
    now.getTime() - GUEST_WORKSPACE_HOURLY_ADMISSION_WINDOW_MS,
  );
  const dailyWindowStart = new Date(
    now.getTime() - GUEST_WORKSPACE_DAILY_ADMISSION_WINDOW_MS,
  );
  const admitted = await withDatabaseWriteRetry(() => db.transaction(async (transaction) => {
    const [visitor] = await transaction
      .select({ createdAt: visitors.createdAt, kind: visitors.kind })
      .from(visitors)
      .where(eq(visitors.id, visitorId))
      .limit(1);
    if (!visitor || visitor.kind === "owner") return true;
    const [existingWorkspace] = await transaction
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.visitorId, visitorId))
      .limit(1);
    if (existingWorkspace) return true;
    if (visitor.createdAt < dailyWindowStart) return true;

    const [recentHour] = await transaction
      .select({ value: count() })
      .from(visitors)
      .where(
        and(
          eq(visitors.kind, "guest"),
          gte(visitors.createdAt, hourlyWindowStart),
        ),
      );
    const hourlyCapacityAvailable =
      (recentHour?.value ?? 0) <= GUEST_WORKSPACE_HOURLY_ADMISSION_LIMIT;
    if (hourlyCapacityAvailable) {
      const [recentDay] = await transaction
        .select({ value: count() })
        .from(visitors)
        .where(
          and(
            eq(visitors.kind, "guest"),
            gte(visitors.createdAt, dailyWindowStart),
          ),
        );
      if ((recentDay?.value ?? 0) <= GUEST_WORKSPACE_DAILY_ADMISSION_LIMIT) {
        return true;
      }
    }

    await transaction.delete(visitors).where(eq(visitors.id, visitorId));
    return false;
  }));

  if (!admitted) throw new GuestWorkspaceCapacityError();
}
