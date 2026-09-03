import { z } from "zod";

import { jobDecisionReasonValues, jobDecisionValues } from "@/db/schema";
import { DevicePairingCodeSchema } from "@/features/product/input";
import {
  CandidateProfileUpdateSchema,
  CandidateRoleTargetsReplaceSchema,
  CandidateSearchPreferencesUpdateSchema,
} from "@/features/candidate/input";

function nativeCoreProfileToFormInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const centsAsDollars = (field: string) => {
    const cents = input[field];
    return typeof cents === "number" && Number.isFinite(cents)
      ? String(cents / 100)
      : cents;
  };
  const lines = (field: string) => {
    const items = input[field];
    return Array.isArray(items) ? items.join("\n") : items;
  };
  return {
    ...input,
    expectedRevision:
      typeof input.expectedRevision === "number"
        ? String(input.expectedRevision)
        : input.expectedRevision,
    currentSalaryCents: centsAsDollars("currentSalaryCents"),
    preferredSalaryMinimumCents: centsAsDollars(
      "preferredSalaryMinimumCents",
    ),
    preferredSalaryTargetCents: centsAsDollars("preferredSalaryTargetCents"),
    yearsExperience:
      typeof input.yearsExperience === "number"
        ? String(input.yearsExperience)
        : input.yearsExperience,
    preferredIndustries: lines("preferredIndustries"),
    targetRoleFamilies: lines("targetRoleFamilies"),
    skills: lines("skills"),
    strengths: lines("strengths"),
    weaknesses: lines("weaknesses"),
    interests: lines("interests"),
    careerGoals: lines("careerGoals"),
    dealBreakers: lines("dealBreakers"),
    interviewConcerns: lines("interviewConcerns"),
  };
}

const NativeCoreProfileUpdateSchema = z.preprocess(
  nativeCoreProfileToFormInput,
  CandidateProfileUpdateSchema,
);

const shortDeviceText = z.string().trim().min(1).max(80);

export const NativeInstallationInputSchema = z
  .object({
    platform: z.literal("ios"),
    appVersion: z.string().trim().min(1).max(40),
    buildNumber: z.string().trim().min(1).max(40),
    deviceName: shortDeviceText.nullable().optional(),
  })
  .strict();

export const NativePairInputSchema = z
  .object({ code: DevicePairingCodeSchema })
  .strict();

export const NativeFeedQuerySchema = z.object({
  cursor: z.string().max(1_000).nullable().optional(),
  lane: z.enum(["matches", "stretch"]).default("matches"),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const NativeJobIdSchema = z.string().uuid();

export const NativeDecisionInputSchema = z
  .object({
    decision: z.enum(jobDecisionValues),
    expectedDecision: z.enum(jobDecisionValues),
    expectedDecisionEventId: z.string().uuid().nullable(),
    reasonCodes: z
      .array(z.enum(jobDecisionReasonValues))
      .max(jobDecisionReasonValues.length)
      .default([]),
  })
  .strict()
  .refine(
    (input) => new Set(input.reasonCodes).size === input.reasonCodes.length,
    { message: "Decision reasons must be unique.", path: ["reasonCodes"] },
  );

export const NativeDecisionReasonsInputSchema = z
  .object({
    expectedDecisionEventId: z.string().uuid(),
    reasonCodes: z
      .array(z.enum(jobDecisionReasonValues))
      .min(1)
      .max(jobDecisionReasonValues.length),
  })
  .strict()
  .refine(
    (input) => new Set(input.reasonCodes).size === input.reasonCodes.length,
    { message: "Decision reasons must be unique.", path: ["reasonCodes"] },
  );

export const NativeProfileUpdateSchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("core"),
    values: NativeCoreProfileUpdateSchema,
  }),
  z.object({
    section: z.literal("search"),
    values: CandidateSearchPreferencesUpdateSchema,
  }),
  z.object({
    section: z.literal("role_targets"),
    values: CandidateRoleTargetsReplaceSchema,
  }),
  z.object({
    section: z.literal("onboarding"),
    values: z.object({ completed: z.literal(true) }).strict(),
  }),
]);

export type NativeInstallationInput = z.output<
  typeof NativeInstallationInputSchema
>;
export type NativeDecisionInput = z.output<typeof NativeDecisionInputSchema>;
