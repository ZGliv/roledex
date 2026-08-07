"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireVisitorId } from "@/features/auth/visitor";
import {
  generateManualJobGauntletPrompt,
  importManualJobGauntletResponse,
} from "@/features/analysis/service";

const GenerateManualJobGauntletInputSchema = z
  .object({ jobId: z.string().uuid() })
  .strict();

const ImportManualJobGauntletInputSchema = z
  .object({
    analysisRunId: z.string().uuid(),
    rawResponse: z
      .string()
      .max(100_000)
      .refine((value) => value.trim().length > 0, "Paste the analysis JSON response."),
  })
  .strict();

function revalidateJobAnalysis(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/saved");
  revalidatePath("/");
}

function actionErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export async function generateManualJobGauntletAction(rawInput: unknown) {
  await requireVisitorId();

  try {
    const input = GenerateManualJobGauntletInputSchema.parse(rawInput);
    const result = await generateManualJobGauntletPrompt(input.jobId);
    revalidateJobAnalysis(result.jobId);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: actionErrorMessage(error, "The analysis prompt could not be generated."),
    };
  }
}

export async function importManualJobGauntletAction(rawInput: unknown) {
  await requireVisitorId();

  try {
    const input = ImportManualJobGauntletInputSchema.parse(rawInput);
    const result = await importManualJobGauntletResponse(
      input.analysisRunId,
      input.rawResponse,
    );
    revalidateJobAnalysis(result.jobId);
    return { ok: true as const, result };
  } catch (error) {
    return {
      ok: false as const,
      error: actionErrorMessage(error, "The analysis response could not be imported."),
    };
  }
}
