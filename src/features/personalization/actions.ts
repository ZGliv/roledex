"use server";

import { revalidatePath } from "next/cache";

import { requireVisitorId } from "@/features/auth/visitor";
import {
  PreferenceOverrideMutationSchema,
} from "@/features/personalization/preference-override-input";
import { updatePreferenceOverrideForVisitor } from "@/features/personalization/preference-overrides";

export type PreferenceOverrideActionResult =
  | {
      ok: true;
      changed: boolean;
      message: string;
      overrides: readonly { featureKey: string; mode: "more" | "less" | "ignore" }[];
    }
  | { ok: false; message: string };

export async function updatePreferenceOverrideAction(
  rawInput: unknown,
): Promise<PreferenceOverrideActionResult> {
  const parsed = PreferenceOverrideMutationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, message: "That feed preference is not valid." };
  }

  try {
    const result = await updatePreferenceOverrideForVisitor(
      await requireVisitorId(),
      parsed.data,
    );
    if (result.changed) {
      revalidatePath("/");
      revalidatePath("/profile");
    }
    return {
      ok: true,
      changed: result.changed,
      message: result.changed
        ? parsed.data.action === "reset_all"
          ? "All feed adjustments returned to what your decisions learned."
          : parsed.data.action === "reset"
            ? "This preference returned to its learned baseline."
            : "Your feed adjustment is saved."
        : "Your feed already uses that setting.",
      overrides: result.overrides.map(({ featureKey, mode }) => ({
        featureKey,
        mode,
      })),
    };
  } catch (error) {
    console.error("Learned preference update failed.", error);
    return {
      ok: false,
      message: "That feed adjustment could not be saved. Nothing was changed.",
    };
  }
}
