import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db, ensureDatabaseReady } from "@/db/client";
import {
  visitorFeedQueues,
  visitorPreferenceOverrides,
  type PreferenceOverrideMode,
} from "@/db/schema";
import { withDatabaseWriteRetry } from "@/db/write-retry";
import { PreferenceOverrideMutationSchema } from "@/features/personalization/preference-override-input";

export interface PreferenceOverrideRecord {
  featureKey: string;
  mode: PreferenceOverrideMode;
  updatedAt: Date;
}

export async function listPreferenceOverridesForVisitor(
  visitorId: string,
): Promise<PreferenceOverrideRecord[]> {
  await ensureDatabaseReady();
  return db
    .select({
      featureKey: visitorPreferenceOverrides.featureKey,
      mode: visitorPreferenceOverrides.mode,
      updatedAt: visitorPreferenceOverrides.updatedAt,
    })
    .from(visitorPreferenceOverrides)
    .where(eq(visitorPreferenceOverrides.visitorId, visitorId))
    .orderBy(asc(visitorPreferenceOverrides.featureKey));
}

export async function updatePreferenceOverrideForVisitor(
  visitorId: string,
  rawInput: unknown,
  now = new Date(),
) {
  const input = PreferenceOverrideMutationSchema.parse(rawInput);
  await ensureDatabaseReady();

  return withDatabaseWriteRetry(() =>
    db.transaction(async (transaction) => {
      let changed = false;

      if (input.action === "reset_all") {
        const deleted = await transaction
          .delete(visitorPreferenceOverrides)
          .where(eq(visitorPreferenceOverrides.visitorId, visitorId))
          .returning({ featureKey: visitorPreferenceOverrides.featureKey });
        changed = deleted.length > 0;
      } else {
        const [existing] = await transaction
          .select({ mode: visitorPreferenceOverrides.mode })
          .from(visitorPreferenceOverrides)
          .where(
            and(
              eq(visitorPreferenceOverrides.visitorId, visitorId),
              eq(visitorPreferenceOverrides.featureKey, input.featureKey),
            ),
          )
          .limit(1);

        if (input.action === "reset") {
          if (existing) {
            await transaction
              .delete(visitorPreferenceOverrides)
              .where(
                and(
                  eq(visitorPreferenceOverrides.visitorId, visitorId),
                  eq(visitorPreferenceOverrides.featureKey, input.featureKey),
                ),
              );
            changed = true;
          }
        } else if (existing?.mode !== input.action) {
          await transaction
            .insert(visitorPreferenceOverrides)
            .values({
              visitorId,
              featureKey: input.featureKey,
              mode: input.action,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                visitorPreferenceOverrides.visitorId,
                visitorPreferenceOverrides.featureKey,
              ],
              set: { mode: input.action, updatedAt: now },
            });
          changed = true;
        }
      }

      if (changed) {
        await transaction
          .update(visitorFeedQueues)
          .set({
            invalidatedAt: now,
            preferenceDirtyAt: now,
            updatedAt: now,
          })
          .where(eq(visitorFeedQueues.visitorId, visitorId));
      }

      return {
        changed,
        overrides: await transaction
          .select({
            featureKey: visitorPreferenceOverrides.featureKey,
            mode: visitorPreferenceOverrides.mode,
            updatedAt: visitorPreferenceOverrides.updatedAt,
          })
          .from(visitorPreferenceOverrides)
          .where(eq(visitorPreferenceOverrides.visitorId, visitorId))
          .orderBy(asc(visitorPreferenceOverrides.featureKey)),
      };
    }),
  );
}
