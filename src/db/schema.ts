import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import {
  check,
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

export type WorkArrangement = (typeof workArrangementValues)[number];
export type SalarySource = (typeof salarySourceValues)[number];
export type SalaryPeriod = (typeof salaryPeriodValues)[number];
export type JobLifecycle = (typeof jobLifecycleValues)[number];
export type JobDecision = (typeof jobDecisionValues)[number];
export type JobSourceType = (typeof jobSourceTypeValues)[number];
export type JobSourceProvider = (typeof jobSourceProviderValues)[number];
export type IngestionRunTrigger = (typeof ingestionRunTriggerValues)[number];
export type IngestionRunStatus = (typeof ingestionRunStatusValues)[number];
export type AnalysisType = (typeof analysisTypeValues)[number];
export type AnalysisStatus = (typeof analysisStatusValues)[number];

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
export type Visitor = typeof visitors.$inferSelect;
export type NewVisitor = typeof visitors.$inferInsert;
export type PortfolioProject = typeof portfolioProjects.$inferSelect;
export type NewPortfolioProject = typeof portfolioProjects.$inferInsert;
export type JobSource = typeof jobSources.$inferSelect;
export type NewJobSource = typeof jobSources.$inferInsert;
export type IngestionRun = typeof ingestionRuns.$inferSelect;
export type NewIngestionRun = typeof ingestionRuns.$inferInsert;
export type JobListing = typeof jobListings.$inferSelect;
export type NewJobListing = typeof jobListings.$inferInsert;
export type JobRevision = typeof jobRevisions.$inferSelect;
export type NewJobRevision = typeof jobRevisions.$inferInsert;
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
