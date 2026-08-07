"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import { jobSources } from "@/db/schema";
import {
  refreshDiscoveryJobs,
  type DiscoveryRefreshResult,
} from "@/features/discovery/service";
import {
  discoveryRefreshSeverity,
  type DiscoveryRefreshSeverity,
} from "@/features/discovery/refresh-policy";

export type RefillJobsActionState = {
  message: string;
  ok: boolean;
  result?: DiscoveryRefreshResult;
  severity: DiscoveryRefreshSeverity;
};

export async function refillJobsAction(): Promise<RefillJobsActionState> {
  try {
    const result = await refreshDiscoveryJobs("on_demand");
    const severity = discoveryRefreshSeverity(result);
    revalidatePath("/");
    revalidatePath("/saved");
    revalidatePath("/sources");
    return {
      ok: severity !== "error",
      severity,
      message: result.message,
      result,
    };
  } catch (error) {
    console.error("Job feed refresh failed.", error);
    return {
      ok: false,
      severity: "error",
      message: "The feeds could not be refreshed right now. Your existing jobs are safe.",
    };
  }
}

const ToggleSourceSchema = z.object({
  sourceId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function setJobSourceEnabledAction(sourceId: string, enabled: boolean) {
  const input = ToggleSourceSchema.parse({ sourceId, enabled });
  await ensureDatabaseReady();
  await db
    .update(jobSources)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(eq(jobSources.id, input.sourceId));
  revalidatePath("/");
  revalidatePath("/sources");
  return { enabled: input.enabled };
}
