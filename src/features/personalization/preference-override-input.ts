import { z } from "zod";

import { preferenceOverrideModeValues } from "@/db/schema";

const NORMALIZED_WORDS = /^[a-z0-9]+(?:[ -][a-z0-9]+)*$/;
const NORMALIZED_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Accept only keys the deterministic preference extractor can produce. */
export function isPreferenceFeatureKey(value: string): boolean {
  if (value.length < 3 || value.length > 160) return false;
  const separator = value.indexOf(":");
  if (separator < 1 || separator !== value.lastIndexOf(":")) return false;
  const kind = value.slice(0, separator);
  const featureValue = value.slice(separator + 1);
  if (!featureValue || featureValue.length > 128) return false;

  if (kind === "arrangement") {
    return ["remote", "hybrid", "on_site", "unclear"].includes(featureValue);
  }
  if (kind === "experience") {
    return ["0-1", "2-3", "4-5", "6-8", "9-plus"].includes(featureValue);
  }
  if (["salary-min", "salary-max", "salary-mid"].includes(kind)) {
    return /^\d{1,4}k-\d{1,4}k$/.test(featureValue);
  }
  if (kind === "title") return /^[a-z0-9]{2,40}$/.test(featureValue);
  if (kind === "company") return NORMALIZED_WORDS.test(featureValue);
  if (kind === "location") {
    return (
      featureValue === "remote" ||
      featureValue === "unknown" ||
      NORMALIZED_SLUG.test(featureValue)
    );
  }
  if (["seniority", "industry"].includes(kind)) {
    return NORMALIZED_SLUG.test(featureValue);
  }
  return false;
}

export const PreferenceFeatureKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(160)
  .refine(isPreferenceFeatureKey, {
    message: "That learned preference is not valid.",
  });

const featureAction = z
  .object({
    action: z.enum([...preferenceOverrideModeValues, "reset"]),
    featureKey: PreferenceFeatureKeySchema,
  })
  .strict();

export const PreferenceOverrideMutationSchema = z.discriminatedUnion("action", [
  featureAction,
  z.object({ action: z.literal("reset_all") }).strict(),
]);

export type PreferenceOverrideMutation = z.output<
  typeof PreferenceOverrideMutationSchema
>;
