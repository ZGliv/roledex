"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, ensureDatabaseReady } from "@/db/client";
import { jobSources } from "@/db/schema";
import { requireOwnerSession } from "@/features/auth/session";
import { OWNER_VISITOR_ID } from "@/features/auth/identity";
import { getActiveCandidateProfileForVisitor } from "@/features/candidate/queries";
import type { SourceMutationActionState } from "@/features/discovery/action-state";
import {
  discoveryRefreshSeverity,
  type DiscoveryRefreshSeverity,
} from "@/features/discovery/refresh-policy";
import {
  refreshDiscoveryJobs,
  type DiscoveryRefreshResult,
} from "@/features/discovery/service";
import { buildDiscoveryCandidateProfile } from "@/features/discovery/relevance";
import { validateJobSource } from "@/features/discovery/source-management";
import {
  normalizeCompanyDomain,
  parseJobSourceUrl,
} from "@/features/discovery/source-url";

export type RefillJobsActionState = {
  message: string;
  ok: boolean;
  result?: DiscoveryRefreshResult;
  severity: DiscoveryRefreshSeverity;
};

export async function refillJobsAction(): Promise<RefillJobsActionState> {
  await requireOwnerSession();

  try {
    const profile = await getActiveCandidateProfileForVisitor(OWNER_VISITOR_ID);
    const result = await refreshDiscoveryJobs("on_demand", {
      focus: buildDiscoveryCandidateProfile(profile),
    });
    const severity = discoveryRefreshSeverity(result);
    revalidateDiscoveryPaths();
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
      message: "The live feeds could not be checked right now. Your saved jobs are safe.",
    };
  }
}

const SourceIdSchema = z.string().uuid();
const SourceFieldsSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Enter the company name.")
    .max(120, "Keep the company name under 120 characters."),
  companyDomain: z.string().trim().max(253, "The domain is too long."),
  refreshIntervalHours: z.coerce
    .number()
    .int()
    .min(12, "Choose a refresh interval of at least 12 hours.")
    .max(168, "Choose a refresh interval no longer than one week."),
});

const AddSourceSchema = SourceFieldsSchema.extend({
  sourceUrl: z
    .string()
    .trim()
    .min(1, "Paste the company’s public job-board URL.")
    .max(2_048, "The job-board URL is too long."),
});

function sourceFields(formData: FormData) {
  return {
    companyName: formData.get("companyName"),
    companyDomain: formData.get("companyDomain") ?? "",
    refreshIntervalHours: formData.get("refreshIntervalHours") ?? "24",
  };
}

function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as SourceMutationActionState["fieldErrors"];
}

function mutationFailure(message: string): SourceMutationActionState {
  return { ok: false, message };
}

function revalidateDiscoveryPaths() {
  revalidatePath("/");
  revalidatePath("/saved");
  revalidatePath("/sources");
}

export async function addJobSourceAction(
  _previousState: SourceMutationActionState,
  formData: FormData,
): Promise<SourceMutationActionState> {
  await requireOwnerSession();

  const parsedFields = AddSourceSchema.safeParse({
    ...sourceFields(formData),
    sourceUrl: formData.get("sourceUrl"),
  });
  if (!parsedFields.success) {
    return {
      ok: false,
      message: "Check the highlighted source details.",
      fieldErrors: fieldErrors(parsedFields.error),
    };
  }

  let parsedUrl: ReturnType<typeof parseJobSourceUrl>;
  let companyDomain: string | null;
  try {
    parsedUrl = parseJobSourceUrl(parsedFields.data.sourceUrl);
    companyDomain = normalizeCompanyDomain(parsedFields.data.companyDomain);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The source details are invalid.";
    const sourceUrlError = message.toLowerCase().includes("job-board") || message.includes("HTTPS");
    return {
      ok: false,
      message,
      fieldErrors: sourceUrlError
        ? { sourceUrl: [message] }
        : { companyDomain: [message] },
    };
  }

  let validation: Awaited<ReturnType<typeof validateJobSource>>;
  try {
    validation = await validateJobSource(parsedUrl, parsedFields.data.companyName);
  } catch (error) {
    console.error("Job source validation failed.", error);
    const message =
      "That official board could not be verified. Check the URL or try again shortly.";
    return {
      ok: false,
      message,
      fieldErrors: { sourceUrl: [message] },
    };
  }

  await ensureDatabaseReady();
  const now = new Date();
  await db
    .insert(jobSources)
    .values({
      provider: validation.provider,
      providerKey: validation.providerKey,
      companyName: parsedFields.data.companyName,
      companyDomain,
      enabled: true,
      refreshIntervalHours: parsedFields.data.refreshIntervalHours,
      removedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [jobSources.provider, jobSources.providerKey],
      set: {
        companyName: parsedFields.data.companyName,
        companyDomain,
        enabled: true,
        refreshIntervalHours: parsedFields.data.refreshIntervalHours,
        lastAttemptedAt: null,
        lastError: null,
        lastErrorAt: null,
        removedAt: null,
        updatedAt: now,
      },
    });

  revalidateDiscoveryPaths();
  return {
    ok: true,
    message:
      validation.availableJobs > 0
        ? `${parsedFields.data.companyName} is connected to its live ${validation.provider} board.`
        : `${parsedFields.data.companyName} is connected. Its board currently has no open roles, so RoleDex will keep checking it.`,
  };
}

export async function updateJobSourceAction(
  sourceId: string,
  _previousState: SourceMutationActionState,
  formData: FormData,
): Promise<SourceMutationActionState> {
  await requireOwnerSession();

  const parsedId = SourceIdSchema.safeParse(sourceId);
  const parsedFields = SourceFieldsSchema.safeParse(sourceFields(formData));
  if (!parsedId.success) return mutationFailure("That source no longer exists.");
  if (!parsedFields.success) {
    return {
      ok: false,
      message: "Check the highlighted source details.",
      fieldErrors: fieldErrors(parsedFields.error),
    };
  }

  let companyDomain: string | null;
  try {
    companyDomain = normalizeCompanyDomain(parsedFields.data.companyDomain);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The company domain is invalid.";
    return {
      ok: false,
      message,
      fieldErrors: { companyDomain: [message] },
    };
  }

  await ensureDatabaseReady();
  const updated = await db
    .update(jobSources)
    .set({
      companyName: parsedFields.data.companyName,
      companyDomain,
      refreshIntervalHours: parsedFields.data.refreshIntervalHours,
      updatedAt: new Date(),
    })
    .where(and(eq(jobSources.id, parsedId.data), isNull(jobSources.removedAt)))
    .returning({ id: jobSources.id });
  if (updated.length === 0) return mutationFailure("That source no longer exists.");

  revalidateDiscoveryPaths();
  return { ok: true, message: `${parsedFields.data.companyName} was updated.` };
}

export async function setJobSourceEnabledAction(sourceId: string, enabled: boolean) {
  await requireOwnerSession();
  const input = z
    .object({ sourceId: SourceIdSchema, enabled: z.boolean() })
    .parse({ sourceId, enabled });
  await ensureDatabaseReady();
  const updated = await db
    .update(jobSources)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(and(eq(jobSources.id, input.sourceId), isNull(jobSources.removedAt)))
    .returning({ id: jobSources.id });
  if (updated.length === 0) throw new Error("That source no longer exists.");
  revalidateDiscoveryPaths();
  return { enabled: input.enabled };
}

export async function removeJobSourceAction(sourceId: string) {
  await requireOwnerSession();
  const id = SourceIdSchema.parse(sourceId);
  await ensureDatabaseReady();
  const now = new Date();
  const removed = await db
    .update(jobSources)
    .set({ enabled: false, removedAt: now, updatedAt: now })
    .where(and(eq(jobSources.id, id), isNull(jobSources.removedAt)))
    .returning({ id: jobSources.id });
  if (removed.length === 0) throw new Error("That source no longer exists.");
  revalidateDiscoveryPaths();
  return { removed: true };
}
