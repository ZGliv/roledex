import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

export const workArrangementValues = [
  "remote",
  "hybrid",
  "on_site",
  "unclear",
] as const;

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

export const employmentTypeValues = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
] as const;

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

export const resumeImportStatusValues = [
  "draft",
  "confirmed",
  "discarded",
] as const;

export const salarySourceValues = [
  "employer_posted",
  "external_estimate",
  "unknown",
] as const;

export const salaryPeriodValues = ["year", "hour", "month"] as const;

export const jobLifecycleValues = ["active", "expired", "archived"] as const;

export const jobDecisionValues = [
  "unseen",
  "saved",
  "skipped",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "rejected",
  "offer",
  "archived",
] as const;

export const jobDecisionReasonValues = [
  "wrong_role",
  "too_senior",
  "pay_too_low",
  "wrong_location",
  "wrong_work_mode",
  "company_or_industry",
  "stale_or_duplicate",
  "liked_role",
  "liked_pay",
  "liked_location",
  "liked_work_mode",
  "liked_company_or_industry",
  "growth_opportunity",
  "other",
] as const;

export const preferenceOverrideModeValues = [
  "more",
  "less",
  "ignore",
] as const;

export const jobSourceTypeValues = [
  "manual_paste",
  "manual_url",
  "public_feed",
  "company_careers",
  "api",
  "rss",
  "csv",
  "json",
] as const;

export const jobSourceProviderValues = [
  "greenhouse",
  "lever",
  "ashby",
] as const;

export const ingestionRunTriggerValues = ["on_demand", "scheduled"] as const;

export const ingestionRunStatusValues = [
  "running",
  "succeeded",
  "partial",
  "failed",
] as const;

export const analysisTypeValues = [
  "job_parse",
  "job_gauntlet",
  "job_question",
  "job_comparison",
  "spoken_summary",
] as const;

export const analysisStatusValues = [
  "prompt_generated",
  "running",
  "succeeded",
  "failed",
] as const;

export const betaFeedbackKindValues = [
  "general",
  "bug",
  "idea",
  "listing_issue",
] as const;

export type WorkArrangement = (typeof workArrangementValues)[number];
export type CandidateSeniorityLevel =
  (typeof candidateSeniorityLevelValues)[number];
export type EmploymentType = (typeof employmentTypeValues)[number];
export type WorkAuthorization = (typeof workAuthorizationValues)[number];
export type MissingSalaryPolicy = (typeof missingSalaryPolicyValues)[number];
export type SkillProficiency = (typeof skillProficiencyValues)[number];
export type SkillEvidenceType = (typeof skillEvidenceTypeValues)[number];
export type EvidenceConfidence = (typeof evidenceConfidenceValues)[number];
export type RoleTargetReadiness =
  (typeof roleTargetReadinessValues)[number];
export type ResumeImportStatus = (typeof resumeImportStatusValues)[number];
export type SalarySource = (typeof salarySourceValues)[number];
export type SalaryPeriod = (typeof salaryPeriodValues)[number];
export type JobLifecycle = (typeof jobLifecycleValues)[number];
export type JobDecision = (typeof jobDecisionValues)[number];
export type JobDecisionReason = (typeof jobDecisionReasonValues)[number];
export type PreferenceOverrideMode =
  (typeof preferenceOverrideModeValues)[number];
export type JobSourceType = (typeof jobSourceTypeValues)[number];
export type JobSourceProvider = (typeof jobSourceProviderValues)[number];
export type IngestionRunTrigger = (typeof ingestionRunTriggerValues)[number];
export type IngestionRunStatus = (typeof ingestionRunStatusValues)[number];
export type AnalysisType = (typeof analysisTypeValues)[number];
export type AnalysisStatus = (typeof analysisStatusValues)[number];
export type BetaFeedbackKind = (typeof betaFeedbackKindValues)[number];

export type JsonObject = Record<string, unknown>;

export type ExtractedFieldEvidence = {
  confidence: "high" | "medium" | "low";
  evidence?: string;
  source: "manual" | "deterministic" | "ai";
  value: unknown;
};

export type ScoreComponent = {
  contribution: number;
  coverage: number;
  evidence: string[];
  key: string;
  rationale: string;
  rawScore: number | null;
  status: "known" | "partial" | "unknown";
  weightBps: number;
};

export type IngestionError = {
  code?: string;
  jobSourceId?: string;
  message: string;
  provider?: JobSourceProvider;
};

const nowInMilliseconds = sql`(
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
)`;

export const visitorKindValues = ["guest", "owner"] as const;
export type VisitorKind = (typeof visitorKindValues)[number];

export const visitors = sqliteTable(
  "visitors",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: visitorKindValues }).notNull().default("guest"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("visitors_kind_created_idx").on(table.kind, table.createdAt),
    check("visitors_kind_check", sql`${table.kind} in ('guest', 'owner')`),
  ],
);

export const candidateProfiles = sqliteTable(
  "candidate_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    revision: integer("revision").notNull().default(1),
    currentRole: text("current_role").notNull(),
    currentSalaryCents: integer("current_salary_cents").notNull(),
    preferredSalaryMinimumCents: integer(
      "preferred_salary_minimum_cents",
    ).notNull(),
    preferredSalaryTargetCents: integer(
      "preferred_salary_target_cents",
    ).notNull(),
    preferredWorkArrangements: text("preferred_work_arrangements", {
      mode: "json",
    })
      .$type<WorkArrangement[]>()
      .notNull()
      .default(sql`'[]'`),
    preferredIndustries: text("preferred_industries", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    targetRoleFamilies: text("target_role_families", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    strengths: text("strengths", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    weaknesses: text("weaknesses", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    interests: text("interests", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    education: text("education", { mode: "json" })
      .$type<JsonObject[]>()
      .notNull()
      .default(sql`'[]'`),
    skills: text("skills", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    yearsExperience: integer("years_experience").notNull().default(0),
    location: text("location"),
    relocationPreference: text("relocation_preference"),
    careerGoals: text("career_goals", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    interviewConcerns: text("interview_concerns", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    dealBreakers: text("deal_breakers", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    desiredSeniorityLevels: text("desired_seniority_levels", { mode: "json" })
      .$type<CandidateSeniorityLevel[]>()
      .notNull()
      .default(sql`'[]'`),
    excludedTitles: text("excluded_titles", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    excludedCompanies: text("excluded_companies", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    excludedIndustries: text("excluded_industries", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    acceptedEmploymentTypes: text("accepted_employment_types", {
      mode: "json",
    })
      .$type<EmploymentType[]>()
      .notNull()
      .default(sql`'["full_time","part_time","contract","temporary","internship"]'`),
    preferredWorkModes: text("preferred_work_modes", { mode: "json" })
      .$type<WorkArrangement[]>()
      .notNull()
      .default(sql`'["remote","hybrid","on_site"]'`),
    strictWorkModes: integer("strict_work_modes", { mode: "boolean" })
      .notNull()
      .default(false),
    commuteRadiusMiles: integer("commute_radius_miles"),
    maxOfficeDaysPerWeek: integer("max_office_days_per_week"),
    relocationDestinations: text("relocation_destinations", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    maxTravelPercent: integer("max_travel_percent"),
    workAuthorization: text("work_authorization", {
      enum: workAuthorizationValues,
    })
      .notNull()
      .default("prefer_not_to_say"),
    requiresSponsorship: integer("requires_sponsorship", { mode: "boolean" }),
    missingSalaryPolicy: text("missing_salary_policy", {
      enum: missingSalaryPolicyValues,
    })
      .notNull()
      .default("explore_only"),
    evidenceFingerprint: text("evidence_fingerprint"),
    searchContractFingerprint: text("search_contract_fingerprint"),
    fingerprint: text("fingerprint"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("candidate_profiles_visitor_active_idx").on(
      table.visitorId,
      table.isActive,
    ),
    uniqueIndex("candidate_profiles_one_active_per_visitor_uidx")
      .on(table.visitorId)
      .where(sql`${table.isActive} = 1`),
    check("candidate_profiles_revision_check", sql`${table.revision} >= 1`),
    check(
      "candidate_profiles_current_salary_check",
      sql`${table.currentSalaryCents} >= 0`,
    ),
    check(
      "candidate_profiles_salary_targets_check",
      sql`${table.preferredSalaryMinimumCents} >= 0 and ${table.preferredSalaryTargetCents} >= ${table.preferredSalaryMinimumCents}`,
    ),
    check(
      "candidate_profiles_years_experience_check",
      sql`${table.yearsExperience} >= 0`,
    ),
    check(
      "candidate_profiles_commute_radius_check",
      sql`${table.commuteRadiusMiles} is null or ${table.commuteRadiusMiles} between 0 and 250`,
    ),
    check(
      "candidate_profiles_office_days_check",
      sql`${table.maxOfficeDaysPerWeek} is null or ${table.maxOfficeDaysPerWeek} between 0 and 5`,
    ),
    check(
      "candidate_profiles_travel_check",
      sql`${table.maxTravelPercent} is null or ${table.maxTravelPercent} between 0 and 100`,
    ),
    check(
      "candidate_profiles_work_authorization_check",
      sql`${table.workAuthorization} in ('citizen_or_permanent_resident', 'work_authorized', 'student_or_temporary', 'not_authorized', 'prefer_not_to_say')`,
    ),
    check(
      "candidate_profiles_missing_salary_policy_check",
      sql`${table.missingSalaryPolicy} in ('show', 'explore_only', 'hide')`,
    ),
  ],
);

export const candidateRoleTargets = sqliteTable(
  "candidate_role_targets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    canonicalFamily: text("canonical_family").notNull(),
    label: text("label").notNull(),
    aliases: text("aliases", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    priorityRank: integer("priority_rank").notNull(),
    readiness: text("readiness", { enum: roleTargetReadinessValues })
      .notNull()
      .default("ready_now"),
    allowedSeniorityLevels: text("allowed_seniority_levels", { mode: "json" })
      .$type<CandidateSeniorityLevel[]>()
      .notNull()
      .default(sql`'[]'`),
    minimumRequiredExperienceYears: integer(
      "minimum_required_experience_years",
    ),
    maximumRequiredExperienceYears: integer(
      "maximum_required_experience_years",
    ),
    exclusions: text("exclusions", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("candidate_role_targets_profile_family_uidx").on(
      table.candidateProfileId,
      table.canonicalFamily,
    ),
    index("candidate_role_targets_profile_readiness_rank_idx").on(
      table.candidateProfileId,
      table.readiness,
      table.priorityRank,
    ),
    check(
      "candidate_role_targets_priority_check",
      sql`${table.priorityRank} between 1 and 100`,
    ),
    check(
      "candidate_role_targets_readiness_check",
      sql`${table.readiness} in ('ready_now', 'stretch')`,
    ),
    check(
      "candidate_role_targets_experience_check",
      sql`(${table.minimumRequiredExperienceYears} is null or ${table.minimumRequiredExperienceYears} between 0 and 50) and (${table.maximumRequiredExperienceYears} is null or ${table.maximumRequiredExperienceYears} between 0 and 50) and (${table.minimumRequiredExperienceYears} is null or ${table.maximumRequiredExperienceYears} is null or ${table.maximumRequiredExperienceYears} >= ${table.minimumRequiredExperienceYears})`,
    ),
  ],
);

export const candidateWorkExperiences = sqliteTable(
  "candidate_work_experiences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    company: text("company").notNull(),
    title: text("title").notNull(),
    employmentType: text("employment_type", { enum: employmentTypeValues }),
    location: text("location"),
    workArrangement: text("work_arrangement", {
      enum: workArrangementValues,
    }),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    isCurrent: integer("is_current", { mode: "boolean" })
      .notNull()
      .default(false),
    summary: text("summary").notNull().default(""),
    achievements: text("achievements", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    skills: text("skills", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("candidate_work_experiences_profile_order_idx").on(
      table.candidateProfileId,
      table.sortOrder,
      table.startDate,
    ),
    check(
      "candidate_work_experiences_sort_order_check",
      sql`${table.sortOrder} between 0 and 1000`,
    ),
  ],
);

export const candidateEducationRecords = sqliteTable(
  "candidate_education_records",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    institution: text("institution").notNull(),
    degree: text("degree").notNull().default(""),
    fieldOfStudy: text("field_of_study").notNull().default(""),
    startYear: integer("start_year"),
    endYear: integer("end_year"),
    description: text("description").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("candidate_education_records_profile_order_idx").on(
      table.candidateProfileId,
      table.sortOrder,
      table.endYear,
    ),
    check(
      "candidate_education_records_sort_order_check",
      sql`${table.sortOrder} between 0 and 1000`,
    ),
    check(
      "candidate_education_records_years_check",
      sql`(${table.startYear} is null or ${table.startYear} between 1900 and 2200) and (${table.endYear} is null or ${table.endYear} between 1900 and 2200) and (${table.startYear} is null or ${table.endYear} is null or ${table.endYear} >= ${table.startYear})`,
    ),
  ],
);

export const candidateSkillEvidence = sqliteTable(
  "candidate_skill_evidence",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    proficiency: text("proficiency", { enum: skillProficiencyValues })
      .notNull()
      .default("working"),
    yearsExperience: integer("years_experience"),
    lastUsedYear: integer("last_used_year"),
    evidenceType: text("evidence_type", { enum: skillEvidenceTypeValues })
      .notNull()
      .default("self_reported"),
    confidence: text("confidence", { enum: evidenceConfidenceValues })
      .notNull()
      .default("medium"),
    sourceRecordId: text("source_record_id"),
    evidenceNote: text("evidence_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("candidate_skill_evidence_profile_name_uidx").on(
      table.candidateProfileId,
      table.name,
    ),
    index("candidate_skill_evidence_profile_idx").on(table.candidateProfileId),
    check(
      "candidate_skill_evidence_years_check",
      sql`${table.yearsExperience} is null or ${table.yearsExperience} between 0 and 50`,
    ),
    check(
      "candidate_skill_evidence_last_used_check",
      sql`${table.lastUsedYear} is null or ${table.lastUsedYear} between 1900 and 2200`,
    ),
    check(
      "candidate_skill_evidence_proficiency_check",
      sql`${table.proficiency} in ('learning', 'working', 'advanced', 'expert')`,
    ),
    check(
      "candidate_skill_evidence_type_check",
      sql`${table.evidenceType} in ('self_reported', 'work_experience', 'portfolio_project', 'education', 'certification', 'assessment', 'other')`,
    ),
    check(
      "candidate_skill_evidence_confidence_check",
      sql`${table.confidence} in ('low', 'medium', 'high', 'verified')`,
    ),
  ],
);

export const portfolioProjects = sqliteTable(
  "portfolio_projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    technologies: text("technologies", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    status: text("status").notNull(),
    liveUrl: text("live_url"),
    repositoryUrl: text("repository_url"),
    appStoreUrl: text("app_store_url"),
    screenshots: text("screenshots", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    responsibilities: text("responsibilities", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    businessProblem: text("business_problem").notNull(),
    userImpact: text("user_impact").notNull(),
    strongestEvidence: text("strongest_evidence", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    relevantRoleFamilies: text("relevant_role_families", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("portfolio_projects_profile_name_uidx").on(
      table.candidateProfileId,
      table.name,
    ),
    index("portfolio_projects_profile_idx").on(table.candidateProfileId),
  ],
);

export const jobSources = sqliteTable(
  "job_sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    provider: text("provider", { enum: jobSourceProviderValues }).notNull(),
    providerKey: text("provider_key").notNull(),
    companyName: text("company_name").notNull(),
    companyDomain: text("company_domain"),
    logoUrl: text("logo_url"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    refreshIntervalHours: integer("refresh_interval_hours")
      .notNull()
      .default(24),
    lastAttemptedAt: integer("last_attempted_at", { mode: "timestamp_ms" }),
    lastSucceededAt: integer("last_succeeded_at", { mode: "timestamp_ms" }),
    lastErrorAt: integer("last_error_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    removedAt: integer("removed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("job_sources_provider_key_uidx").on(
      table.provider,
      table.providerKey,
    ),
    index("job_sources_enabled_attempt_idx").on(
      table.enabled,
      table.lastAttemptedAt,
    ),
    index("job_sources_company_idx").on(table.companyName),
    index("job_sources_removed_idx").on(table.removedAt),
    check(
      "job_sources_provider_check",
      sql`${table.provider} in ('greenhouse', 'lever', 'ashby')`,
    ),
    check(
      "job_sources_refresh_interval_check",
      sql`${table.refreshIntervalHours} >= 1`,
    ),
  ],
);

export const ingestionRuns = sqliteTable(
  "ingestion_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    trigger: text("trigger", { enum: ingestionRunTriggerValues }).notNull(),
    status: text("status", { enum: ingestionRunStatusValues })
      .notNull()
      .default("running"),
    requestedSourceCount: integer("requested_source_count")
      .notNull()
      .default(0),
    successfulSourceCount: integer("successful_source_count")
      .notNull()
      .default(0),
    failedSourceCount: integer("failed_source_count").notNull().default(0),
    fetchedJobCount: integer("fetched_job_count").notNull().default(0),
    filteredJobCount: integer("filtered_job_count").notNull().default(0),
    newJobCount: integer("new_job_count").notNull().default(0),
    changedJobCount: integer("changed_job_count").notNull().default(0),
    unchangedJobCount: integer("unchanged_job_count").notNull().default(0),
    expiredJobCount: integer("expired_job_count").notNull().default(0),
    errors: text("errors", { mode: "json" })
      .$type<IngestionError[]>()
      .notNull()
      .default(sql`'[]'`),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("ingestion_runs_status_started_idx").on(
      table.status,
      table.startedAt,
    ),
    index("ingestion_runs_started_idx").on(table.startedAt),
    check(
      "ingestion_runs_trigger_check",
      sql`${table.trigger} in ('on_demand', 'scheduled')`,
    ),
    check(
      "ingestion_runs_status_check",
      sql`${table.status} in ('running', 'succeeded', 'partial', 'failed')`,
    ),
    check(
      "ingestion_runs_source_counts_check",
      sql`${table.requestedSourceCount} >= 0 and ${table.successfulSourceCount} >= 0 and ${table.failedSourceCount} >= 0 and ${table.successfulSourceCount} + ${table.failedSourceCount} <= ${table.requestedSourceCount}`,
    ),
    check(
      "ingestion_runs_job_counts_check",
      sql`${table.fetchedJobCount} >= 0 and ${table.filteredJobCount} >= 0 and ${table.newJobCount} >= 0 and ${table.changedJobCount} >= 0 and ${table.unchangedJobCount} >= 0 and ${table.expiredJobCount} >= 0`,
    ),
    check(
      "ingestion_runs_completed_at_check",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const jobListings = sqliteTable(
  "job_listings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    normalizedTitle: text("normalized_title").notNull(),
    normalizedCompany: text("normalized_company").notNull(),
    normalizedLocation: text("normalized_location"),
    deduplicationKey: text("deduplication_key"),
    currentRevisionId: text("current_revision_id").references(
      (): AnySQLiteColumn => jobRevisions.id,
      { onDelete: "set null" },
    ),
    currentDecision: text("current_decision", {
      enum: jobDecisionValues,
    })
      .notNull()
      .default("unseen"),
    lifecycleStatus: text("lifecycle_status", {
      enum: jobLifecycleValues,
    })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("job_listings_deduplication_key_uidx").on(
      table.deduplicationKey,
    ),
    index("job_listings_decision_idx").on(table.currentDecision),
    index("job_listings_lifecycle_idx").on(table.lifecycleStatus),
    index("job_listings_company_title_idx").on(
      table.normalizedCompany,
      table.normalizedTitle,
    ),
    check(
      "job_listings_decision_check",
      sql`${table.currentDecision} in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')`,
    ),
    check(
      "job_listings_lifecycle_check",
      sql`${table.lifecycleStatus} in ('active', 'expired', 'archived')`,
    ),
  ],
);

export const jobRevisions = sqliteTable(
  "job_revisions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull().default(1),
    sourceType: text("source_type", { enum: jobSourceTypeValues }).notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    rawDescription: text("raw_description").notNull(),
    cleanedDescription: text("cleaned_description"),
    contentHash: text("content_hash").notNull(),
    parserVersion: text("parser_version").notNull(),
    parseSchemaVersion: text("parse_schema_version").notNull(),
    parseWarnings: text("parse_warnings", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    fieldEvidence: text("field_evidence", { mode: "json" })
      .$type<Record<string, ExtractedFieldEvidence>>()
      .notNull()
      .default(sql`'{}'`),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    workArrangement: text("work_arrangement", {
      enum: workArrangementValues,
    })
      .notNull()
      .default("unclear"),
    salaryMinimumCents: integer("salary_minimum_cents"),
    salaryMaximumCents: integer("salary_maximum_cents"),
    salaryCurrency: text("salary_currency").notNull().default("USD"),
    salaryPeriod: text("salary_period", { enum: salaryPeriodValues })
      .notNull()
      .default("year"),
    salarySource: text("salary_source", { enum: salarySourceValues })
      .notNull()
      .default("unknown"),
    employmentType: text("employment_type"),
    roleSummary: text("role_summary"),
    remoteRestriction: text("remote_restriction"),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    applicationDeadline: integer("application_deadline", {
      mode: "timestamp_ms",
    }),
    seniority: text("seniority"),
    yearsExperienceMinimum: integer("years_experience_minimum"),
    yearsExperienceMaximum: integer("years_experience_maximum"),
    experienceRequirements: text("experience_requirements", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    technologies: text("technologies", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    responsibilities: text("responsibilities", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    requiredQualifications: text("required_qualifications", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    preferredQualifications: text("preferred_qualifications", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    benefits: text("benefits", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    travelRequirement: text("travel_requirement"),
    industry: text("industry"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("job_revisions_listing_revision_uidx").on(
      table.jobListingId,
      table.revisionNumber,
    ),
    index("job_revisions_retrieved_idx").on(table.retrievedAt, table.id),
    index("job_revisions_listing_created_idx").on(
      table.jobListingId,
      table.createdAt,
    ),
    index("job_revisions_content_hash_idx").on(table.contentHash),
    index("job_revisions_source_url_idx").on(table.sourceUrl),
    check("job_revisions_revision_check", sql`${table.revisionNumber} >= 1`),
    check(
      "job_revisions_source_type_check",
      sql`${table.sourceType} in ('manual_paste', 'manual_url', 'public_feed', 'company_careers', 'api', 'rss', 'csv', 'json')`,
    ),
    check(
      "job_revisions_work_arrangement_check",
      sql`${table.workArrangement} in ('remote', 'hybrid', 'on_site', 'unclear')`,
    ),
    check(
      "job_revisions_salary_source_check",
      sql`${table.salarySource} in ('employer_posted', 'external_estimate', 'unknown')`,
    ),
    check(
      "job_revisions_salary_period_check",
      sql`${table.salaryPeriod} in ('year', 'hour', 'month')`,
    ),
    check(
      "job_revisions_salary_minimum_check",
      sql`${table.salaryMinimumCents} is null or ${table.salaryMinimumCents} >= 0`,
    ),
    check(
      "job_revisions_salary_maximum_check",
      sql`${table.salaryMaximumCents} is null or ${table.salaryMaximumCents} >= 0`,
    ),
    check(
      "job_revisions_salary_range_check",
      sql`${table.salaryMinimumCents} is null or ${table.salaryMaximumCents} is null or ${table.salaryMaximumCents} >= ${table.salaryMinimumCents}`,
    ),
    check(
      "job_revisions_experience_range_check",
      sql`(${table.yearsExperienceMinimum} is null or ${table.yearsExperienceMinimum} >= 0) and (${table.yearsExperienceMaximum} is null or ${table.yearsExperienceMaximum} >= 0) and (${table.yearsExperienceMinimum} is null or ${table.yearsExperienceMaximum} is null or ${table.yearsExperienceMaximum} >= ${table.yearsExperienceMinimum})`,
    ),
  ],
);

/**
 * Candidate-independent, immutable normalization for one immutable revision.
 * A new extractor/schema version appends a row; existing snapshots are never
 * rewritten in place, which keeps historical scoring and API payloads auditable.
 */
export const jobFeatureSnapshots = sqliteTable(
  "job_feature_snapshots",
  {
    jobRevisionId: text("job_revision_id")
      .notNull()
      .references(() => jobRevisions.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    extractorVersion: text("extractor_version").notNull(),
    inputHash: text("input_hash").notNull(),
    snapshot: text("snapshot", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    primaryKey({
      columns: [
        table.jobRevisionId,
        table.schemaVersion,
        table.extractorVersion,
      ],
    }),
    index("job_feature_snapshots_version_revision_idx").on(
      table.schemaVersion,
      table.extractorVersion,
      table.jobRevisionId,
    ),
    index("job_feature_snapshots_created_idx").on(table.createdAt),
    check(
      "job_feature_snapshots_versions_check",
      sql`length(${table.schemaVersion}) > 0 and length(${table.extractorVersion}) > 0`,
    ),
    check(
      "job_feature_snapshots_input_hash_check",
      sql`length(${table.inputHash}) >= 16`,
    ),
  ],
);

export const sourceSightings = sqliteTable(
  "source_sightings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    jobSourceId: text("job_source_id")
      .notNull()
      .references(() => jobSources.id, { onDelete: "cascade" }),
    externalJobId: text("external_job_id").notNull(),
    jobListingId: text("job_listing_id").references(() => jobListings.id, {
      onDelete: "set null",
    }),
    canonicalUrl: text("canonical_url").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceUpdatedAt: integer("source_updated_at", { mode: "timestamp_ms" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    lastSeenIngestionRunId: text("last_seen_ingestion_run_id").references(
      () => ingestionRuns.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    uniqueIndex("source_sightings_source_external_uidx").on(
      table.jobSourceId,
      table.externalJobId,
    ),
    index("source_sightings_source_last_seen_idx").on(
      table.jobSourceId,
      table.lastSeenAt,
    ),
    index("source_sightings_listing_idx").on(table.jobListingId),
    index("source_sightings_canonical_url_idx").on(table.canonicalUrl),
    index("source_sightings_last_run_idx").on(
      table.lastSeenIngestionRunId,
    ),
    check(
      "source_sightings_seen_range_check",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
  ],
);

export const fitScoreRuns = sqliteTable(
  "fit_score_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    jobRevisionId: text("job_revision_id")
      .notNull()
      .references(() => jobRevisions.id, { onDelete: "cascade" }),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "restrict" }),
    inputHash: text("input_hash").notNull(),
    scoringVersion: text("scoring_version").notNull(),
    candidateSnapshot: text("candidate_snapshot", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    portfolioSnapshot: text("portfolio_snapshot", { mode: "json" })
      .$type<JsonObject[]>()
      .notNull(),
    deterministicScore: integer("deterministic_score").notNull(),
    coverageBps: integer("coverage_bps").notNull(),
    breakdown: text("breakdown", { mode: "json" })
      .$type<ScoreComponent[]>()
      .notNull(),
    result: text("result", { mode: "json" }).$type<JsonObject>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("fit_score_runs_profile_cache_key_uidx").on(
      table.candidateProfileId,
      table.inputHash,
      table.scoringVersion,
    ),
    index("fit_score_runs_job_revision_idx").on(
      table.jobRevisionId,
      table.createdAt,
    ),
    index("fit_score_runs_candidate_idx").on(table.candidateProfileId),
    index("fit_score_runs_live_profile_idx").on(
      table.candidateProfileId,
      table.scoringVersion,
      table.jobRevisionId,
      table.createdAt,
    ),
    check(
      "fit_score_runs_score_check",
      sql`${table.deterministicScore} between 0 and 100`,
    ),
    check(
      "fit_score_runs_coverage_check",
      sql`${table.coverageBps} between 0 and 10000`,
    ),
  ],
);

export const visitorJobStates = sqliteTable(
  "visitor_job_states",
  {
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    currentDecision: text("current_decision", {
      enum: jobDecisionValues,
    })
      .notNull()
      .default("unseen"),
    // Identifies the immutable event that opened the current decision epoch.
    // This prevents delayed feedback from being attached after an ABA
    // transition (for example skipped -> unseen -> skipped in another tab).
    currentDecisionEventId: text("current_decision_event_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.jobListingId] }),
    index("visitor_job_states_visitor_decision_idx").on(
      table.visitorId,
      table.currentDecision,
      table.updatedAt,
    ),
    index("visitor_job_states_listing_idx").on(table.jobListingId),
    check(
      "visitor_job_states_decision_check",
      sql`${table.currentDecision} in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')`,
    ),
  ],
);

export const visitorProductSettings = sqliteTable(
  "visitor_product_settings",
  {
    visitorId: text("visitor_id")
      .primaryKey()
      .references(() => visitors.id, { onDelete: "cascade" }),
    onboardingCompletedAt: integer("onboarding_completed_at", {
      mode: "timestamp_ms",
    }),
    dailyDigestEnabled: integer("daily_digest_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    reminderNotificationsEnabled: integer("reminder_notifications_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [index("visitor_product_settings_updated_idx").on(table.updatedAt)],
);

export const visitorDevicePairingCodes = sqliteTable(
  "visitor_device_pairing_codes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("visitor_device_pairing_codes_hash_uidx").on(table.codeHash),
    index("visitor_device_pairing_codes_visitor_idx").on(
      table.visitorId,
      table.createdAt,
    ),
    index("visitor_device_pairing_codes_expiry_idx").on(table.expiresAt),
  ],
);

export const nativeInstallations = sqliteTable(
  "native_installations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    platform: text("platform").notNull().default("ios"),
    credentialHash: text("credential_hash").notNull(),
    previousCredentialHash: text("previous_credential_hash"),
    previousCredentialExpiresAt: integer("previous_credential_expires_at", {
      mode: "timestamp_ms",
    }),
    appVersion: text("app_version").notNull(),
    buildNumber: text("build_number").notNull(),
    deviceName: text("device_name"),
    attestationState: text("attestation_state")
      .notNull()
      .default("unavailable"),
    credentialExpiresAt: integer("credential_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("native_installations_credential_hash_uidx").on(
      table.credentialHash,
    ),
    index("native_installations_previous_credential_idx").on(
      table.previousCredentialHash,
      table.previousCredentialExpiresAt,
    ),
    index("native_installations_visitor_idx").on(
      table.visitorId,
      table.createdAt,
    ),
    index("native_installations_expiry_idx").on(
      table.credentialExpiresAt,
    ),
    check("native_installations_platform_check", sql`${table.platform} = 'ios'`),
    check(
      "native_installations_attestation_check",
      sql`${table.attestationState} in ('unavailable', 'pending', 'verified', 'failed')`,
    ),
  ],
);

/**
 * Durable, privacy-preserving counters for public endpoints that can allocate
 * meaningful storage. Keys are HMACs of a short-lived bucket plus a trusted
 * network hint; raw addresses are never persisted.
 */
export const apiRateLimitBuckets = sqliteTable(
  "api_rate_limit_buckets",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    attemptCount: integer("attempt_count").notNull().default(1),
    windowStartedAt: integer("window_started_at", {
      mode: "timestamp_ms",
    }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("api_rate_limit_buckets_cleanup_idx").on(
      table.kind,
      table.windowStartedAt,
    ),
    check(
      "api_rate_limit_buckets_attempt_count_check",
      sql`${table.attemptCount} >= 1`,
    ),
  ],
);

export const jobApplicationDetails = sqliteTable(
  "job_application_details",
  {
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    applicationDeadline: integer("application_deadline", {
      mode: "timestamp_ms",
    }),
    followUpAt: integer("follow_up_at", { mode: "timestamp_ms" }),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    resumeLabel: text("resume_label"),
    nextStep: text("next_step"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.jobListingId] }),
    index("job_application_details_follow_up_idx").on(
      table.visitorId,
      table.followUpAt,
    ),
    index("job_application_details_deadline_idx").on(
      table.visitorId,
      table.applicationDeadline,
    ),
  ],
);

export const candidateResumeSources = sqliteTable(
  "candidate_resume_sources",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    sourceFileName: text("source_file_name"),
    contentHash: text("content_hash").notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("candidate_resume_sources_profile_hash_uidx").on(
      table.candidateProfileId,
      table.contentHash,
    ),
    index("candidate_resume_sources_profile_idx").on(table.candidateProfileId),
  ],
);

export const candidateResumeImports = sqliteTable(
  "candidate_resume_imports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    resumeSourceId: text("resume_source_id").references(
      () => candidateResumeSources.id,
      { onDelete: "set null" },
    ),
    status: text("status", { enum: resumeImportStatusValues })
      .notNull()
      .default("draft"),
    parserVersion: text("parser_version").notNull(),
    draftJson: text("draft_json", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    rawSourceRetained: integer("raw_source_retained", { mode: "boolean" })
      .notNull()
      .default(false),
    confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("candidate_resume_imports_profile_status_idx").on(
      table.candidateProfileId,
      table.status,
      table.createdAt,
    ),
    index("candidate_resume_imports_status_updated_idx").on(
      table.status,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex("candidate_resume_imports_source_uidx").on(table.resumeSourceId),
    check(
      "candidate_resume_imports_status_check",
      sql`${table.status} in ('draft', 'confirmed', 'discarded')`,
    ),
  ],
);

export const betaFeedback = sqliteTable(
  "beta_feedback",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    jobListingId: text("job_listing_id").references(() => jobListings.id, {
      onDelete: "set null",
    }),
    kind: text("kind", { enum: betaFeedbackKindValues }).notNull(),
    message: text("message").notNull(),
    pagePath: text("page_path"),
    status: text("status").notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("beta_feedback_created_idx").on(table.createdAt),
    index("beta_feedback_visitor_idx").on(table.visitorId, table.createdAt),
    check(
      "beta_feedback_kind_check",
      sql`${table.kind} in ('general', 'bug', 'idea', 'listing_issue')`,
    ),
    check("beta_feedback_status_check", sql`${table.status} in ('open', 'reviewed', 'closed')`),
  ],
);

export const jobDecisionEvents = sqliteTable(
  "job_decision_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    jobRevisionId: text("job_revision_id").references(() => jobRevisions.id, {
      onDelete: "set null",
    }),
    previousDecision: text("previous_decision", {
      enum: jobDecisionValues,
    }),
    decision: text("decision", { enum: jobDecisionValues }).notNull(),
    note: text("note"),
    reasonCodes: text("reason_codes", { mode: "json" })
      .$type<JobDecisionReason[]>()
      .notNull()
      .default(sql`'[]'`),
    feedExposureId: text("feed_exposure_id"),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("job_decision_events_visitor_decided_idx").on(
      table.visitorId,
      table.decidedAt,
    ),
    index("job_decision_events_listing_decided_idx").on(
      table.jobListingId,
      table.decidedAt,
    ),
    index("job_decision_events_exposure_idx").on(table.feedExposureId),
    check(
      "job_decision_events_previous_decision_check",
      sql`${table.previousDecision} is null or ${table.previousDecision} in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')`,
    ),
    check(
      "job_decision_events_decision_check",
      sql`${table.decision} in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')`,
    ),
  ],
);

/**
 * Explicit visitor intent layered over the swipe-derived preference model.
 * Absence means "use the learned baseline"; reset operations therefore delete
 * rows instead of manufacturing another model state.
 */
export const visitorPreferenceOverrides = sqliteTable(
  "visitor_preference_overrides",
  {
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    mode: text("mode", { enum: preferenceOverrideModeValues }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    primaryKey({ columns: [table.visitorId, table.featureKey] }),
    index("visitor_preference_overrides_visitor_updated_idx").on(
      table.visitorId,
      table.updatedAt,
    ),
    check(
      "visitor_preference_overrides_mode_check",
      sql`${table.mode} in ('more', 'less', 'ignore')`,
    ),
    check(
      "visitor_preference_overrides_feature_key_check",
      sql`length(${table.featureKey}) between 3 and 160 and instr(${table.featureKey}, ':') > 1 and (
        ${table.featureKey} glob 'title:*' or
        ${table.featureKey} glob 'company:*' or
        ${table.featureKey} glob 'arrangement:*' or
        ${table.featureKey} glob 'location:*' or
        ${table.featureKey} glob 'seniority:*' or
        ${table.featureKey} glob 'experience:*' or
        ${table.featureKey} glob 'salary-min:*' or
        ${table.featureKey} glob 'salary-max:*' or
        ${table.featureKey} glob 'salary-mid:*' or
        ${table.featureKey} glob 'industry:*'
      )`,
    ),
  ],
);

export const visitorFeedQueues = sqliteTable(
  "visitor_feed_queues",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "cascade" }),
    profileRevision: integer("profile_revision").notNull(),
    queueVersion: text("queue_version").notNull(),
    recommenderVersion: text("recommender_version").notNull(),
    catalogRevisionId: text("catalog_revision_id"),
    catalogRetrievedAt: integer("catalog_retrieved_at", {
      mode: "timestamp_ms",
    }),
    pendingInteractionCount: integer("pending_interaction_count")
      .notNull()
      .default(0),
    preferenceDirtyAt: integer("preference_dirty_at", {
      mode: "timestamp_ms",
    }),
    invalidatedAt: integer("invalidated_at", { mode: "timestamp_ms" }),
    generatedAt: integer("generated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    uniqueIndex("visitor_feed_queues_visitor_uidx").on(table.visitorId),
    uniqueIndex("visitor_feed_queues_id_visitor_uidx").on(
      table.id,
      table.visitorId,
    ),
    index("visitor_feed_queues_expiry_idx").on(table.expiresAt),
    check(
      "visitor_feed_queues_profile_revision_check",
      sql`${table.profileRevision} >= 1`,
    ),
    check(
      "visitor_feed_queues_pending_interactions_check",
      sql`${table.pendingInteractionCount} >= 0`,
    ),
    check(
      "visitor_feed_queues_expiry_check",
      sql`${table.expiresAt} > ${table.generatedAt}`,
    ),
  ],
);

export const visitorFeedQueueEntries = sqliteTable(
  "visitor_feed_queue_entries",
  {
    queueId: text("queue_id").notNull(),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    tier: text("tier", {
      enum: ["ready_now", "credible_stretch", "discovery"],
    }).notNull(),
    cardSnapshot: text("card_snapshot", { mode: "json" })
      .$type<JsonObject>()
      .notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    decisionEventId: text("decision_event_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    primaryKey({ columns: [table.queueId, table.position] }),
    uniqueIndex("visitor_feed_queue_entries_queue_job_uidx").on(
      table.queueId,
      table.jobListingId,
    ),
    index("visitor_feed_queue_entries_visitor_active_idx").on(
      table.visitorId,
      table.queueId,
      table.consumedAt,
      table.position,
    ),
    foreignKey({
      columns: [table.queueId, table.visitorId],
      foreignColumns: [visitorFeedQueues.id, visitorFeedQueues.visitorId],
      name: "visitor_feed_queue_entries_queue_visitor_fk",
    }).onDelete("cascade"),
    check(
      "visitor_feed_queue_entries_position_check",
      sql`${table.position} between 0 and 99`,
    ),
    check(
      "visitor_feed_queue_entries_tier_check",
      sql`${table.tier} in ('ready_now', 'credible_stretch', 'discovery')`,
    ),
  ],
);

export const feedSessions = sqliteTable(
  "feed_sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    queueId: text("queue_id").notNull(),
    queueVersion: text("queue_version").notNull(),
    profileRevision: integer("profile_revision").notNull(),
    source: text("source", { enum: ["live_ranked", "cached"] }).notNull(),
    pageStartPosition: integer("page_start_position").notNull(),
    pageSize: integer("page_size").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("feed_sessions_id_visitor_uidx").on(table.id, table.visitorId),
    index("feed_sessions_visitor_started_idx").on(
      table.visitorId,
      table.startedAt,
    ),
    index("feed_sessions_expiry_idx").on(table.expiresAt),
    check(
      "feed_sessions_source_check",
      sql`${table.source} in ('live_ranked', 'cached')`,
    ),
    check(
      "feed_sessions_page_check",
      sql`${table.pageStartPosition} >= 0 and ${table.pageSize} between 0 and 50`,
    ),
    check(
      "feed_sessions_expiry_check",
      sql`${table.expiresAt} > ${table.startedAt}`,
    ),
  ],
);

export const feedExposures = sqliteTable(
  "feed_exposures",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    visitorId: text("visitor_id")
      .notNull()
      .references(() => visitors.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    queueId: text("queue_id").notNull(),
    queueVersion: text("queue_version").notNull(),
    jobListingId: text("job_listing_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    tier: text("tier", {
      enum: ["ready_now", "credible_stretch", "discovery"],
    }).notNull(),
    exposedAt: integer("exposed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
    firstInteractionAt: integer("first_interaction_at", {
      mode: "timestamp_ms",
    }),
    lastInteractionAt: integer("last_interaction_at", {
      mode: "timestamp_ms",
    }),
  },
  (table) => [
    uniqueIndex("feed_exposures_session_job_uidx").on(
      table.sessionId,
      table.jobListingId,
    ),
    index("feed_exposures_visitor_job_idx").on(
      table.visitorId,
      table.jobListingId,
      table.exposedAt,
    ),
    index("feed_exposures_visitor_exposed_idx").on(
      table.visitorId,
      table.exposedAt,
    ),
    foreignKey({
      columns: [table.sessionId, table.visitorId],
      foreignColumns: [feedSessions.id, feedSessions.visitorId],
      name: "feed_exposures_session_visitor_fk",
    }).onDelete("cascade"),
    check(
      "feed_exposures_position_check",
      sql`${table.position} between 0 and 99`,
    ),
    check(
      "feed_exposures_tier_check",
      sql`${table.tier} in ('ready_now', 'credible_stretch', 'discovery')`,
    ),
  ],
);

export const analysisRuns = sqliteTable(
  "analysis_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    analysisType: text("analysis_type", {
      enum: analysisTypeValues,
    }).notNull(),
    jobRevisionId: text("job_revision_id")
      .notNull()
      .references(() => jobRevisions.id, { onDelete: "cascade" }),
    candidateProfileId: text("candidate_profile_id")
      .notNull()
      .references(() => candidateProfiles.id, { onDelete: "restrict" }),
    candidateFingerprint: text("candidate_fingerprint").notNull(),
    provider: text("provider").notNull(),
    modelName: text("model_name"),
    promptVersion: text("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    cacheKey: text("cache_key").notNull(),
    status: text("status", { enum: analysisStatusValues }).notNull(),
    request: text("request", { mode: "json" }).$type<JsonObject>().notNull(),
    promptText: text("prompt_text").notNull(),
    rawResponse: text("raw_response"),
    parsedResponse: text("parsed_response", { mode: "json" }).$type<JsonObject>(),
    error: text("error"),
    reusedFromAnalysisRunId: text("reused_from_analysis_run_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(nowInMilliseconds),
  },
  (table) => [
    index("analysis_runs_cache_status_idx").on(table.cacheKey, table.status),
    index("analysis_runs_job_revision_idx").on(
      table.jobRevisionId,
      table.analysisType,
      table.createdAt,
    ),
    index("analysis_runs_candidate_idx").on(table.candidateProfileId),
    check(
      "analysis_runs_type_check",
      sql`${table.analysisType} in ('job_parse', 'job_gauntlet', 'job_question', 'job_comparison', 'spoken_summary')`,
    ),
    check(
      "analysis_runs_status_check",
      sql`${table.status} in ('prompt_generated', 'running', 'succeeded', 'failed')`,
    ),
    check(
      "analysis_runs_usage_check",
      sql`(${table.inputTokens} is null or ${table.inputTokens} >= 0) and (${table.outputTokens} is null or ${table.outputTokens} >= 0) and (${table.latencyMs} is null or ${table.latencyMs} >= 0)`,
    ),
  ],
);

export type CandidateProfile = typeof candidateProfiles.$inferSelect;
export type NewCandidateProfile = typeof candidateProfiles.$inferInsert;
export type CandidateRoleTarget = typeof candidateRoleTargets.$inferSelect;
export type NewCandidateRoleTarget = typeof candidateRoleTargets.$inferInsert;
export type Visitor = typeof visitors.$inferSelect;
export type NewVisitor = typeof visitors.$inferInsert;
export type PortfolioProject = typeof portfolioProjects.$inferSelect;
export type NewPortfolioProject = typeof portfolioProjects.$inferInsert;
export type CandidateWorkExperience =
  typeof candidateWorkExperiences.$inferSelect;
export type NewCandidateWorkExperience =
  typeof candidateWorkExperiences.$inferInsert;
export type CandidateEducationRecord =
  typeof candidateEducationRecords.$inferSelect;
export type NewCandidateEducationRecord =
  typeof candidateEducationRecords.$inferInsert;
export type CandidateSkillEvidence = typeof candidateSkillEvidence.$inferSelect;
export type NewCandidateSkillEvidence = typeof candidateSkillEvidence.$inferInsert;
export type JobSource = typeof jobSources.$inferSelect;
export type NewJobSource = typeof jobSources.$inferInsert;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
export type JobListing = typeof jobListings.$inferSelect;
export type NewJobListing = typeof jobListings.$inferInsert;
export type JobRevision = typeof jobRevisions.$inferSelect;
export type NewJobRevision = typeof jobRevisions.$inferInsert;
export type JobFeatureSnapshotRecord = typeof jobFeatureSnapshots.$inferSelect;
export type NewJobFeatureSnapshotRecord =
  typeof jobFeatureSnapshots.$inferInsert;
export type SourceSighting = typeof sourceSightings.$inferSelect;
export type NewSourceSighting = typeof sourceSightings.$inferInsert;
export type FitScoreRun = typeof fitScoreRuns.$inferSelect;
export type NewFitScoreRun = typeof fitScoreRuns.$inferInsert;
export type JobDecisionEvent = typeof jobDecisionEvents.$inferSelect;
export type NewJobDecisionEvent = typeof jobDecisionEvents.$inferInsert;
export type VisitorJobState = typeof visitorJobStates.$inferSelect;
export type NewVisitorJobState = typeof visitorJobStates.$inferInsert;
export type AnalysisRun = typeof analysisRuns.$inferSelect;
export type NewAnalysisRun = typeof analysisRuns.$inferInsert;
export type VisitorProductSettings = typeof visitorProductSettings.$inferSelect;
export type NewVisitorProductSettings = typeof visitorProductSettings.$inferInsert;
export type VisitorDevicePairingCode = typeof visitorDevicePairingCodes.$inferSelect;
export type NativeInstallation = typeof nativeInstallations.$inferSelect;
export type NewVisitorDevicePairingCode = typeof visitorDevicePairingCodes.$inferInsert;
export type JobApplicationDetails = typeof jobApplicationDetails.$inferSelect;
export type NewJobApplicationDetails = typeof jobApplicationDetails.$inferInsert;
export type CandidateResumeSource = typeof candidateResumeSources.$inferSelect;
export type NewCandidateResumeSource = typeof candidateResumeSources.$inferInsert;
export type CandidateResumeImport = typeof candidateResumeImports.$inferSelect;
export type NewCandidateResumeImport = typeof candidateResumeImports.$inferInsert;
export type VisitorFeedQueue = typeof visitorFeedQueues.$inferSelect;
export type NewVisitorFeedQueue = typeof visitorFeedQueues.$inferInsert;
export type VisitorFeedQueueEntry = typeof visitorFeedQueueEntries.$inferSelect;
export type FeedSessionRecord = typeof feedSessions.$inferSelect;
export type FeedExposureRecord = typeof feedExposures.$inferSelect;
export type BetaFeedback = typeof betaFeedback.$inferSelect;
export type NewBetaFeedback = typeof betaFeedback.$inferInsert;
