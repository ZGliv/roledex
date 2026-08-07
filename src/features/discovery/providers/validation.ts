import { z } from "zod";

import type { DiscoveryProvider } from "@/features/discovery/types";
import { DiscoveryProviderError } from "@/features/discovery/providers/errors";

export const PublicHttpUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "Expected an HTTP(S) URL");

interface ValidationContext {
  provider: DiscoveryProvider;
  sourceId: string;
}

function issueSummary(error: z.ZodError) {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`)
    .join("; ");
}

export function parseProviderPayload<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  context: ValidationContext,
) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new DiscoveryProviderError({
      ...context,
      code: "invalid_payload",
      message: `${context.provider} source "${context.sourceId}" returned an invalid payload (${issueSummary(result.error)}).`,
      cause: result.error,
    });
  }
  return result.data;
}

export function parseProviderConfig<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: ValidationContext,
) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new DiscoveryProviderError({
      ...context,
      code: "invalid_config",
      message: `${context.provider} source "${context.sourceId}" is misconfigured (${issueSummary(result.error)}).`,
      cause: result.error,
    });
  }
  return result.data;
}
