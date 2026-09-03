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

const profileRevision = z.union([
  z.number().int().positive().max(2_147_483_647),
  expectedRevision,
]);

function normalizedStringArray(label: string, maximum: number, length = 160) {
  return z
    .array(z.string())
    .transform((values) => {
      const seen = new Set<string>();
      return values.flatMap((rawValue) => {
        const value = rawValue.replace(/\s+/g, " ").trim();
        const key = value.toLocaleLowerCase();
        if (!value || seen.has(key)) return [];
        seen.add(key);
        return [value];
      });
    })
    .pipe(
      z
        .array(
          z
            .string()
            .min(1)
            .max(length, `${label} entries must be ${length} characters or fewer.`),
        )
        .max(maximum, `Keep ${label.toLowerCase()} to ${maximum} entries or fewer.`),
    );
}

const nullableInteger = (minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.coerce.number().int().min(minimum).max(maximum).nullable(),
  );

const nullableBoolean = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.boolean().nullable(),
);

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? null : value),
    z.string().trim().min(1).max(maximum).nullable(),
  );

const optionalUrl = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.url("Enter a complete URL, including https://.").max(2_000).nullable(),
);

const monthValue = z
  .string()
  .trim()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Use a YYYY-MM date.");

export const candidateSeniorityLevelValues = [
  "intern",
  "entry",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "executive",
] as const;

export const candidateEmploymentTypeValues = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
] as const;

export const candidateWorkModeValues = ["remote", "hybrid", "on_site"] as const;

export const workAuthorizationValues = [
  "citizen_or_permanent_resident",
  "work_authorized",
  "student_or_temporary",
  "not_authorized",
  "prefer_not_to_say",
] as const;

export const missingSalaryPolicyValues = [
  "show",
  "explore_only",
  "hide",
] as const;

export const skillProficiencyValues = [
  "learning",
  "working",
  "advanced",
  "expert",
] as const;

export const skillEvidenceTypeValues = [
  "self_reported",
  "work_experience",
  "portfolio_project",
  "education",
  "certification",
  "assessment",
  "other",
] as const;

export const evidenceConfidenceValues = [
  "low",
  "medium",
  "high",
  "verified",
] as const;

export const roleTargetReadinessValues = ["ready_now", "stretch"] as const;

export function normalizeRoleFamilyKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const canonicalRoleFamily = z
  .string()
  .trim()
  .min(2, "Choose a role family.")
  .max(120)
  .transform(normalizeRoleFamilyKey)
  .pipe(z.string().min(2).max(120).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/));

const CandidateRoleTargetFieldsSchema = z
  .object({
    canonicalFamily: canonicalRoleFamily,
    label: z.string().trim().min(2, "Name this role direction.").max(160),
    aliases: normalizedStringArray("Role aliases", 30, 160),
    priorityRank: z.coerce.number().int().min(1).max(100),
    readiness: z.enum(roleTargetReadinessValues),
    allowedSeniorityLevels: z
      .array(z.enum(candidateSeniorityLevelValues))
      .transform((values) => [...new Set(values)])
      .pipe(z.array(z.enum(candidateSeniorityLevelValues)).min(1).max(9)),
    minimumRequiredExperienceYears: nullableInteger(0, 50),
    maximumRequiredExperienceYears: nullableInteger(0, 50),
    exclusions: normalizedStringArray("Role exclusions", 30, 160),
  })
  .strict()
  .superRefine((target, context) => {
    if (
      target.minimumRequiredExperienceYears !== null &&
      target.maximumRequiredExperienceYears !== null &&
      target.maximumRequiredExperienceYears < target.minimumRequiredExperienceYears
    ) {
      context.addIssue({
        code: "custom",
        message: "Maximum required experience cannot be below the minimum.",
        path: ["maximumRequiredExperienceYears"],
      });
    }
  });

export const CandidateRoleTargetsReplaceSchema = z
  .object({
    expectedRevision: profileRevision,
    targets: z.array(CandidateRoleTargetFieldsSchema).min(1).max(12),
  })
  .strict()
  .superRefine((input, context) => {
    const families = new Set<string>();
    const ranks = new Set<number>();
    for (const [index, target] of input.targets.entries()) {
      if (families.has(target.canonicalFamily)) {
        context.addIssue({
          code: "custom",
          message: "Each role family can appear only once.",
          path: ["targets", index, "canonicalFamily"],
        });
      }
      if (ranks.has(target.priorityRank)) {
        context.addIssue({
          code: "custom",
          message: "Each role direction needs a unique priority.",
          path: ["targets", index, "priorityRank"],
        });
      }
      families.add(target.canonicalFamily);
      ranks.add(target.priorityRank);
    }
  });

export type CandidateRoleTargetInput = z.output<
  typeof CandidateRoleTargetFieldsSchema
>;
export type CandidateRoleTargetsReplace = z.output<
  typeof CandidateRoleTargetsReplaceSchema
>;

const CandidateSearchPreferencesFieldsSchema = z
  .object({
    desiredSeniorityLevels: z
      .array(z.enum(candidateSeniorityLevelValues))
      .transform((values) => [...new Set(values)])
      .pipe(z.array(z.enum(candidateSeniorityLevelValues)).max(9)),
    excludedTitles: normalizedStringArray("Excluded titles", 75),
    excludedCompanies: normalizedStringArray("Excluded companies", 100),
    excludedIndustries: normalizedStringArray("Excluded industries", 50),
    acceptedEmploymentTypes: z
      .array(z.enum(candidateEmploymentTypeValues))
      .transform((values) => [...new Set(values)])
      .pipe(
        z
          .array(z.enum(candidateEmploymentTypeValues))
          .min(1, "Choose at least one employment type."),
      ),
    preferredWorkModes: z
      .array(z.enum(candidateWorkModeValues))
      .transform((values) => [...new Set(values)])
      .pipe(
        z
          .array(z.enum(candidateWorkModeValues))
          .min(1, "Rank at least one work mode."),
      ),
    strictWorkModes: z.boolean(),
    commuteRadiusMiles: nullableInteger(0, 250),
    maxOfficeDaysPerWeek: nullableInteger(0, 5),
    relocationDestinations: normalizedStringArray("Relocation destinations", 25, 220),
    maxTravelPercent: nullableInteger(0, 100),
    workAuthorization: z.enum(workAuthorizationValues),
    requiresSponsorship: nullableBoolean,
    missingSalaryPolicy: z.enum(missingSalaryPolicyValues),
  })
  .strict();

export const CandidateSearchPreferencesUpdateSchema = z
  .object({
    ...CandidateSearchPreferencesFieldsSchema.shape,
    expectedRevision: profileRevision,
  })
  .strict();

export type CandidateSearchPreferences = z.output<
  typeof CandidateSearchPreferencesFieldsSchema
>;
export type CandidateSearchPreferencesSubmission = z.output<
  typeof CandidateSearchPreferencesUpdateSchema
>;

export const DEFAULT_CANDIDATE_SEARCH_PREFERENCES: CandidateSearchPreferences = {
  desiredSeniorityLevels: [],
  excludedTitles: [],
  excludedCompanies: [],
  excludedIndustries: [],
  acceptedEmploymentTypes: [...candidateEmploymentTypeValues],
  preferredWorkModes: [...candidateWorkModeValues],
  strictWorkModes: false,
  commuteRadiusMiles: null,
  maxOfficeDaysPerWeek: null,
  relocationDestinations: [],
  maxTravelPercent: null,
  workAuthorization: "prefer_not_to_say",
  requiresSponsorship: null,
  missingSalaryPolicy: "explore_only",
};

const CandidateWorkExperienceFieldsSchema = z
  .object({
    sortOrder: z.coerce.number().int().min(0).max(1_000),
    company: z.string().trim().min(1, "Enter the employer.").max(180),
    title: z.string().trim().min(1, "Enter the role title.").max(180),
    employmentType: z.enum(candidateEmploymentTypeValues).nullable(),
    location: nullableText(220),
    workArrangement: z.enum(candidateWorkModeValues).nullable(),
    startDate: monthValue,
    endDate: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      monthValue.nullable(),
    ),
    isCurrent: z.boolean(),
    summary: z.string().trim().max(2_000),
    achievements: normalizedStringArray("Achievements", 30, 500),
    skills: normalizedStringArray("Skills", 75),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.isCurrent && input.endDate !== null) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A current role cannot have an end date.",
      });
    }
    if (!input.isCurrent && input.endDate === null) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Add an end date or mark this as your current role.",
      });
    }
    if (input.endDate !== null && input.endDate < input.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date cannot be before the start date.",
      });
    }
  });

const recordMutationBase = {
  expectedProfileRevision: profileRevision,
};

// Legacy seeded portfolio projects use stable slug IDs; visitor-created records
// use UUIDs. Treat both as opaque identifiers and bind them in scoped queries.
const profileRecordId = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Invalid profile record identifier.");

export const CandidateWorkExperienceCreateSchema =
  CandidateWorkExperienceFieldsSchema.safeExtend(recordMutationBase);

export const CandidateWorkExperienceUpdateSchema =
  CandidateWorkExperienceCreateSchema.safeExtend({ id: profileRecordId });

export const CandidateProfileRecordDeleteSchema = z
  .object({
    id: profileRecordId,
    expectedProfileRevision: profileRevision,
  })
  .strict();

const CandidateEducationFieldsSchema = z
  .object({
    sortOrder: z.coerce.number().int().min(0).max(1_000),
    institution: z.string().trim().min(1, "Enter the institution.").max(220),
    degree: z.string().trim().max(180),
    fieldOfStudy: z.string().trim().max(180),
    startYear: nullableInteger(1900, 2200),
    endYear: nullableInteger(1900, 2200),
    description: z.string().trim().max(2_000),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.startYear !== null &&
      input.endYear !== null &&
      input.endYear < input.startYear
    ) {
      context.addIssue({
        code: "custom",
        path: ["endYear"],
        message: "The end year cannot be before the start year.",
      });
    }
  });

export const CandidateEducationCreateSchema =
  CandidateEducationFieldsSchema.safeExtend(recordMutationBase);

export const CandidateEducationUpdateSchema =
  CandidateEducationCreateSchema.safeExtend({ id: profileRecordId });

const PortfolioProjectFieldsSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name.").max(180),
  description: z.string().trim().min(1, "Add a project description.").max(2_000),
  technologies: normalizedStringArray("Technologies", 75),
  status: z.string().trim().min(1).max(80),
  liveUrl: optionalUrl,
  repositoryUrl: optionalUrl,
  appStoreUrl: optionalUrl,
  screenshots: z.array(z.url().max(2_000)).max(20),
  responsibilities: normalizedStringArray("Responsibilities", 30, 500),
  businessProblem: z.string().trim().max(2_000),
  userImpact: z.string().trim().max(2_000),
  strongestEvidence: normalizedStringArray("Evidence", 30, 500),
  relevantRoleFamilies: normalizedStringArray("Relevant roles", 50),
}).strict();

export const PortfolioProjectCreateSchema = z.object({
  ...PortfolioProjectFieldsSchema.shape,
  ...recordMutationBase,
}).strict();

export const PortfolioProjectUpdateSchema = z.object({
  ...PortfolioProjectCreateSchema.shape,
  id: profileRecordId,
}).strict();

const CandidateSkillEvidenceFieldsSchema = z.object({
  name: z.string().trim().min(1, "Enter a skill.").max(160),
  proficiency: z.enum(skillProficiencyValues),
  yearsExperience: nullableInteger(0, 50),
  lastUsedYear: nullableInteger(1900, 2200),
  evidenceType: z.enum(skillEvidenceTypeValues),
  confidence: z.enum(evidenceConfidenceValues).default("medium"),
  sourceRecordId: z
    .preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      profileRecordId.nullable(),
    )
    .default(null),
  evidenceNote: nullableText(1_000),
}).strict();

export const CandidateSkillEvidenceCreateSchema = z.object({
  ...CandidateSkillEvidenceFieldsSchema.shape,
  ...recordMutationBase,
}).strict();

export const CandidateSkillEvidenceUpdateSchema = z.object({
  ...CandidateSkillEvidenceCreateSchema.shape,
  id: profileRecordId,
}).strict();

export type CandidateWorkExperienceCreate = z.output<
  typeof CandidateWorkExperienceCreateSchema
>;
export type CandidateWorkExperienceUpdate = z.output<
  typeof CandidateWorkExperienceUpdateSchema
>;
export type CandidateEducationCreate = z.output<
  typeof CandidateEducationCreateSchema
>;
export type CandidateEducationUpdate = z.output<
  typeof CandidateEducationUpdateSchema
>;
export type PortfolioProjectCreate = z.output<typeof PortfolioProjectCreateSchema>;
export type PortfolioProjectUpdate = z.output<typeof PortfolioProjectUpdateSchema>;
export type CandidateSkillEvidenceCreate = z.output<
  typeof CandidateSkillEvidenceCreateSchema
>;
export type CandidateSkillEvidenceUpdate = z.output<
  typeof CandidateSkillEvidenceUpdateSchema
>;
export type CandidateProfileRecordDelete = z.output<
  typeof CandidateProfileRecordDeleteSchema
>;

const ResumeDraftConfidenceSchema = z.enum(["low", "medium", "high"]);

const ResumeDraftWorkExperienceSchema = z
  .object({
    company: z.string().trim().min(1).max(180),
    title: z.string().trim().min(1).max(180),
    startDate: monthValue,
    endDate: monthValue.nullable(),
    isCurrent: z.boolean(),
    summary: z.string().trim().max(2_000),
    achievements: normalizedStringArray("Achievements", 30, 500),
    skills: normalizedStringArray("Skills", 75),
    confidence: ResumeDraftConfidenceSchema,
    sourceExcerpt: z.string().trim().min(1).max(500),
  })
  .strict();

const ResumeDraftEducationSchema = z
  .object({
    institution: z.string().trim().min(1).max(220),
    degree: z.string().trim().max(180),
    fieldOfStudy: z.string().trim().max(180),
    startYear: z.number().int().min(1900).max(2200).nullable(),
    endYear: z.number().int().min(1900).max(2200).nullable(),
    description: z.string().trim().max(2_000),
    confidence: ResumeDraftConfidenceSchema,
    sourceExcerpt: z.string().trim().min(1).max(500),
  })
  .strict();

const ResumeDraftSkillSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    proficiency: z.enum(skillProficiencyValues),
    yearsExperience: z.number().int().min(0).max(50).nullable(),
    lastUsedYear: z.number().int().min(1900).max(2200).nullable(),
    evidenceType: z.enum(skillEvidenceTypeValues),
    confidence: ResumeDraftConfidenceSchema,
    evidenceNote: z.string().trim().max(1_000).nullable(),
    sourceExcerpt: z.string().trim().min(1).max(500),
  })
  .strict();

const ResumeDraftProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    description: z.string().trim().min(1).max(2_000),
    technologies: normalizedStringArray("Technologies", 75),
    responsibilities: normalizedStringArray("Responsibilities", 30, 500),
    strongestEvidence: normalizedStringArray("Evidence", 30, 500),
    confidence: ResumeDraftConfidenceSchema,
    sourceExcerpt: z.string().trim().min(1).max(500),
  })
  .strict();

export const CandidateResumeDraftSchema = z
  .object({
    parserVersion: z.literal("resume-deterministic-v1"),
    workHistory: z.array(ResumeDraftWorkExperienceSchema).max(30),
    education: z.array(ResumeDraftEducationSchema).max(20),
    skills: z.array(ResumeDraftSkillSchema).max(100),
    projects: z.array(ResumeDraftProjectSchema).max(20),
    warnings: z.array(z.string().trim().min(1).max(300)).max(20),
  })
  .strict();

export const CandidateResumeImportCreateSchema = z
  .object({
    label: z.string().trim().min(1, "Name this résumé.").max(120),
    sourceFileName: nullableText(255),
    rawText: z
      .string()
      .trim()
      .min(100, "Paste at least 100 characters from your résumé.")
      .max(100_000, "Keep résumé text under 100,000 characters."),
  })
  .strict();

const selectedIndexes = z
  .array(z.number().int().min(0).max(999))
  .transform((values) => [...new Set(values)])
  .pipe(z.array(z.number().int().min(0).max(999)).max(200));

export const CandidateResumeImportConfirmSchema = z
  .object({
    importId: z.uuid(),
    expectedProfileRevision: profileRevision,
    selectedWorkIndexes: selectedIndexes,
    selectedEducationIndexes: selectedIndexes,
    selectedSkillIndexes: selectedIndexes,
    selectedProjectIndexes: selectedIndexes,
    retainRawSource: z.boolean().default(false),
  })
  .strict();

export const CandidateResumeImportDiscardSchema = z
  .object({ importId: z.uuid() })
  .strict();

export type CandidateResumeDraft = z.output<
  typeof CandidateResumeDraftSchema
>;
export type CandidateResumeImportCreate = z.output<
  typeof CandidateResumeImportCreateSchema
>;
export type CandidateResumeImportConfirm = z.output<
  typeof CandidateResumeImportConfirmSchema
>;
export type CandidateResumeImportDiscard = z.output<
  typeof CandidateResumeImportDiscardSchema
>;

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

export function candidateSearchPreferencesFromSubmission(
  submission: CandidateSearchPreferencesSubmission,
): CandidateSearchPreferences {
  const { expectedRevision: _expectedRevision, ...preferences } = submission;
  void _expectedRevision;
  return preferences;
}

export function candidateProfileFingerprint(
  input: CandidateProfileUpdate,
  searchPreferences: CandidateSearchPreferences =
    DEFAULT_CANDIDATE_SEARCH_PREFERENCES,
  evidenceFingerprint: string | null = null,
  searchContractFingerprint: string | null = null,
) {
  return hashValue({
    evidenceFingerprint,
    searchContractFingerprint,
    profile: {
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
    },
    searchPreferences: {
      ...searchPreferences,
      desiredSeniorityLevels: canonicalList(
        searchPreferences.desiredSeniorityLevels,
      ),
      excludedTitles: canonicalList(searchPreferences.excludedTitles),
      excludedCompanies: canonicalList(searchPreferences.excludedCompanies),
      excludedIndustries: canonicalList(searchPreferences.excludedIndustries),
      acceptedEmploymentTypes: canonicalList(
        searchPreferences.acceptedEmploymentTypes,
      ),
      relocationDestinations: canonicalList(
        searchPreferences.relocationDestinations,
      ),
      // Ordering is intentional: the first work mode is the strongest preference.
      preferredWorkModes: searchPreferences.preferredWorkModes,
    },
  });
}
