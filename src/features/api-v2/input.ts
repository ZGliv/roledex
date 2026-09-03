import { z } from "zod";

import { jobDecisionReasonValues, jobDecisionValues } from "@/db/schema";
import { NativeInstallationInputSchema } from "@/features/native/input";
import { PreferenceOverrideMutationSchema } from "@/features/personalization/preference-override-input";
import { DevicePairingCodeSchema } from "@/features/product/input";

const uniqueReasons = z
  .array(z.enum(jobDecisionReasonValues))
  .max(jobDecisionReasonValues.length)
  .refine((values) => new Set(values).size === values.length, {
    message: "Decision reasons must be unique.",
  });

const occurredAt = z.iso.datetime({ offset: true }).refine(
  (value) => {
    const timestamp = Date.parse(value);
    return timestamp <= Date.now() + 10 * 60 * 1_000;
  },
  { message: "Interaction time is too far in the future." },
);

const interactionBase = {
  id: z.uuid(),
  jobId: z.uuid(),
  occurredAt,
};

export const ApiV2FeedQuerySchema = z.object({
  cursor: z.string().max(1_000).nullable().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const ApiV2InteractionEventSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...interactionBase,
      kind: z.literal("decision"),
      exposureId: z.uuid(),
      decision: z.enum(jobDecisionValues),
      expectedDecision: z.enum(jobDecisionValues),
      expectedDecisionEventId: z.uuid().nullable(),
      reasonCodes: uniqueReasons.default([]),
    })
    .strict(),
  z
    .object({
      ...interactionBase,
      kind: z.literal("decision_feedback"),
      exposureId: z.uuid(),
      expectedDecision: z.enum(jobDecisionValues),
      expectedDecisionEventId: z.uuid(),
      reasonCodes: uniqueReasons.min(1),
    })
    .strict(),
  z
    .object({
      ...interactionBase,
      kind: z.literal("note"),
      exposureId: z.uuid().nullable().optional(),
      note: z.string().trim().min(1).max(2_000),
    })
    .strict(),
]);

export const ApiV2InteractionBatchSchema = z
  .object({
    events: z.array(ApiV2InteractionEventSchema).min(1).max(50),
  })
  .strict()
  .refine(
    ({ events }) => new Set(events.map((event) => event.id)).size === events.length,
    { message: "Interaction IDs must be unique within a batch.", path: ["events"] },
  );

export const ApiV2SavedQuerySchema = z.object({
  q: z.string().trim().max(160).default(""),
  status: z
    .enum([
      "all",
      "saved",
      "applied",
      "active",
      "archived",
    ])
    .default("all"),
  sort: z.enum(["recent", "fit", "salary", "company"]).default("recent"),
});

export const ApiV2SavedUpdateSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("note"),
      eventId: z.uuid(),
      jobId: z.uuid(),
      note: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("status"),
      eventId: z.uuid(),
      jobId: z.uuid(),
      status: z.enum([
        "saved",
        "apply",
        "applied",
        "interview",
        "offer",
        "rejected",
        "archived",
        "unseen",
      ]),
      expectedDecision: z.enum(jobDecisionValues),
      expectedDecisionEventId: z.uuid().nullable(),
    })
    .strict(),
]);

export const ApiV2InstallationSchema = NativeInstallationInputSchema;

export const ApiV2WorkspaceClaimSchema = z.discriminatedUnion("method", [
  z
    .object({
      method: z.literal("pairing_code"),
      code: DevicePairingCodeSchema,
    })
    .strict(),
  z
    .object({
      method: z.literal("sign_in_with_apple"),
      identityToken: z.string().min(1).max(16_384),
      authorizationCode: z.string().min(1).max(8_192),
      nonce: z.string().min(16).max(512),
    })
    .strict(),
]);

export const ApiV2InstallationIdSchema = z.uuid();

export const ApiV2AccountDeleteSchema = z
  .object({ confirmation: z.literal("DELETE_MY_ACCOUNT") })
  .strict();

export const ApiV2PreferenceOverrideSchema = PreferenceOverrideMutationSchema;

export type ApiV2InteractionBatch = z.output<
  typeof ApiV2InteractionBatchSchema
>;
export type ApiV2InteractionEvent = z.output<
  typeof ApiV2InteractionEventSchema
>;
export type ApiV2SavedUpdate = z.output<typeof ApiV2SavedUpdateSchema>;
