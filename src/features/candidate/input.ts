import { z } from "zod";

import { hashValue } from "@/lib/hashing";

const MAX_SALARY_DOLLARS = 10_000_000;

export function normalizeMultilineList(value: string) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const rawLine of value.replace(/\r\n?/g, "\n").split("\n")) {
    const item = rawLine
      .replace(/^\s*(?:[-*•‣▪◦]|\d+[.)])\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!item) continue;
    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}

function multilineList(label: string, maximum: number, minimum = 0) {
  return z
    .string()
    .transform(normalizeMultilineList)
    .pipe(
      z
        .array(z.string().min(1).max(220, `${label} entries must be 220 characters or fewer.`))
        .min(minimum, `Add at least ${minimum} ${label.toLowerCase()}${minimum === 1 ? "" : "s"}.`)
        .max(maximum, `Keep ${label.toLowerCase()} to ${maximum} entries or fewer.`),
    );
}

function dollars(label: string) {
  return z
    .string()
    .trim()
    .refine((value) => /^\$?[\d,]+(?:\.\d{1,2})?$/.test(value), {
      message: `Enter ${label.toLowerCase()} as a dollar amount.`,
    })
    .transform((value) => Number(value.replace(/[$,]/g, "")))
    .pipe(
      z
        .number()
        .finite()
        .nonnegative(`${label} cannot be negative.`)
        .max(MAX_SALARY_DOLLARS, `${label} is above the supported range.`),
    )
    .transform((value) => Math.round(value * 100));
}

const yearsExperience = z
  .string()
  .trim()
  .refine((value) => /^\d{1,2}$/.test(value), {
    message: "Years of experience must be a whole number.",
  })
  .transform(Number)
  .pipe(z.number().int().min(0).max(50));

const expectedRevision = z
  .string()
  .trim()
  .refine((value) => /^[1-9]\d{0,9}$/.test(value), {
    message: "Reload the profile before saving again.",
  })
  .transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647));

const CandidateProfileFieldsSchema = z.object({
  currentRole: z.string().trim().min(2, "Enter your current role.").max(180),
  location: z.string().trim().max(220),
  relocationPreference: z.string().trim().max(500),
  currentSalaryCents: dollars("Current salary"),
  preferredSalaryMinimumCents: dollars("Minimum move salary"),
  preferredSalaryTargetCents: dollars("Target salary"),
  yearsExperience,
  preferredWorkArrangements: z
    .array(z.enum(["remote", "hybrid", "on_site"]))
    .transform((items) => [...new Set(items)])
    .pipe(
      z
        .array(z.enum(["remote", "hybrid", "on_site"]))
        .min(1, "Choose at least one work arrangement."),
    ),
  preferredIndustries: multilineList("Preferred industries", 30, 1),
  targetRoleFamilies: multilineList("Target roles", 50, 1),
  skills: multilineList("Skills", 100, 1),
  strengths: multilineList("Strengths", 50),
  weaknesses: multilineList("Weaknesses", 50),
  interests: multilineList("Interests", 50),
  careerGoals: multilineList("Career goals", 50, 1),
  dealBreakers: multilineList("Deal-breakers", 50),
  interviewConcerns: multilineList("Interview concerns", 50),
});

export const CandidateProfileUpdateSchema = z
  .object({
    ...CandidateProfileFieldsSchema.shape,
    expectedRevision,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.preferredSalaryMinimumCents < input.currentSalaryCents) {
      context.addIssue({
        code: "custom",
        path: ["preferredSalaryMinimumCents"],
        message: "Minimum move salary should be at least your current salary.",
      });
    }
    if (input.preferredSalaryTargetCents < input.preferredSalaryMinimumCents) {
      context.addIssue({
        code: "custom",
        path: ["preferredSalaryTargetCents"],
        message: "Target salary must be at least the minimum move salary.",
      });
    }
  });

export type CandidateProfileSubmission = z.output<
  typeof CandidateProfileUpdateSchema
>;
export type CandidateProfileUpdate = z.output<typeof CandidateProfileFieldsSchema>;

export function profileUpdateFromSubmission(
  submission: CandidateProfileSubmission,
): CandidateProfileUpdate {
  const { expectedRevision, ...update } = submission;
  void expectedRevision;
  return update;
}

function canonicalList(items: readonly string[]) {
  return items.toSorted((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: "base" }),
  );
}

export function candidateProfileFingerprint(input: CandidateProfileUpdate) {
  return hashValue({
    ...input,
    preferredWorkArrangements: canonicalList(input.preferredWorkArrangements),
    preferredIndustries: canonicalList(input.preferredIndustries),
    targetRoleFamilies: canonicalList(input.targetRoleFamilies),
    skills: canonicalList(input.skills),
    strengths: canonicalList(input.strengths),
    weaknesses: canonicalList(input.weaknesses),
    interests: canonicalList(input.interests),
    careerGoals: canonicalList(input.careerGoals),
    dealBreakers: canonicalList(input.dealBreakers),
    interviewConcerns: canonicalList(input.interviewConcerns),
  });
}
