CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_type` text NOT NULL,
	`job_revision_id` text NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`candidate_fingerprint` text NOT NULL,
	`provider` text NOT NULL,
	`model_name` text,
	`prompt_version` text NOT NULL,
	`output_schema_version` text NOT NULL,
	`cache_key` text NOT NULL,
	`status` text NOT NULL,
	`request` text NOT NULL,
	`prompt_text` text NOT NULL,
	`raw_response` text,
	`parsed_response` text,
	`error` text,
	`reused_from_analysis_run_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`latency_ms` integer,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`job_revision_id`) REFERENCES `job_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "analysis_runs_type_check" CHECK("analysis_runs"."analysis_type" in ('job_parse', 'job_gauntlet', 'job_question', 'job_comparison', 'spoken_summary')),
	CONSTRAINT "analysis_runs_status_check" CHECK("analysis_runs"."status" in ('prompt_generated', 'running', 'succeeded', 'failed')),
	CONSTRAINT "analysis_runs_usage_check" CHECK(("analysis_runs"."input_tokens" is null or "analysis_runs"."input_tokens" >= 0) and ("analysis_runs"."output_tokens" is null or "analysis_runs"."output_tokens" >= 0) and ("analysis_runs"."latency_ms" is null or "analysis_runs"."latency_ms" >= 0))
);
--> statement-breakpoint
CREATE INDEX `analysis_runs_cache_status_idx` ON `analysis_runs` (`cache_key`,`status`);--> statement-breakpoint
CREATE INDEX `analysis_runs_job_revision_idx` ON `analysis_runs` (`job_revision_id`,`analysis_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `analysis_runs_candidate_idx` ON `analysis_runs` (`candidate_profile_id`);--> statement-breakpoint
CREATE TABLE `candidate_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`current_role` text NOT NULL,
	`current_salary_cents` integer NOT NULL,
	`preferred_salary_minimum_cents` integer NOT NULL,
	`preferred_salary_target_cents` integer NOT NULL,
	`preferred_work_arrangements` text DEFAULT '[]' NOT NULL,
	`preferred_industries` text DEFAULT '[]' NOT NULL,
	`target_role_families` text DEFAULT '[]' NOT NULL,
	`strengths` text DEFAULT '[]' NOT NULL,
	`weaknesses` text DEFAULT '[]' NOT NULL,
	`interests` text DEFAULT '[]' NOT NULL,
	`education` text DEFAULT '[]' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`years_experience` integer DEFAULT 0 NOT NULL,
	`location` text,
	`relocation_preference` text,
	`career_goals` text DEFAULT '[]' NOT NULL,
	`interview_concerns` text DEFAULT '[]' NOT NULL,
	`deal_breakers` text DEFAULT '[]' NOT NULL,
	`fingerprint` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	CONSTRAINT "candidate_profiles_revision_check" CHECK("candidate_profiles"."revision" >= 1),
	CONSTRAINT "candidate_profiles_current_salary_check" CHECK("candidate_profiles"."current_salary_cents" >= 0),
	CONSTRAINT "candidate_profiles_salary_targets_check" CHECK("candidate_profiles"."preferred_salary_minimum_cents" >= 0 and "candidate_profiles"."preferred_salary_target_cents" >= "candidate_profiles"."preferred_salary_minimum_cents"),
	CONSTRAINT "candidate_profiles_years_experience_check" CHECK("candidate_profiles"."years_experience" >= 0)
);
--> statement-breakpoint
CREATE INDEX `candidate_profiles_active_idx` ON `candidate_profiles` (`is_active`);--> statement-breakpoint
CREATE TABLE `fit_score_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_revision_id` text NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`scoring_version` text NOT NULL,
	`candidate_snapshot` text NOT NULL,
	`portfolio_snapshot` text NOT NULL,
	`deterministic_score` integer NOT NULL,
	`coverage_bps` integer NOT NULL,
	`breakdown` text NOT NULL,
	`result` text NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`job_revision_id`) REFERENCES `job_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "fit_score_runs_score_check" CHECK("fit_score_runs"."deterministic_score" between 0 and 100),
	CONSTRAINT "fit_score_runs_coverage_check" CHECK("fit_score_runs"."coverage_bps" between 0 and 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fit_score_runs_cache_key_uidx` ON `fit_score_runs` (`input_hash`,`scoring_version`);--> statement-breakpoint
CREATE INDEX `fit_score_runs_job_revision_idx` ON `fit_score_runs` (`job_revision_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `fit_score_runs_candidate_idx` ON `fit_score_runs` (`candidate_profile_id`);--> statement-breakpoint
CREATE TABLE `job_decision_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_listing_id` text NOT NULL,
	`job_revision_id` text,
	`previous_decision` text,
	`decision` text NOT NULL,
	`note` text,
	`decided_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_revision_id`) REFERENCES `job_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_decision_events_previous_decision_check" CHECK("job_decision_events"."previous_decision" is null or "job_decision_events"."previous_decision" in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')),
	CONSTRAINT "job_decision_events_decision_check" CHECK("job_decision_events"."decision" in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `job_decision_events_listing_decided_idx` ON `job_decision_events` (`job_listing_id`,`decided_at`);--> statement-breakpoint
CREATE TABLE `job_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`normalized_title` text NOT NULL,
	`normalized_company` text NOT NULL,
	`normalized_location` text,
	`deduplication_key` text,
	`current_revision_id` text,
	`current_decision` text DEFAULT 'unseen' NOT NULL,
	`lifecycle_status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`current_revision_id`) REFERENCES `job_revisions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "job_listings_decision_check" CHECK("job_listings"."current_decision" in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived')),
	CONSTRAINT "job_listings_lifecycle_check" CHECK("job_listings"."lifecycle_status" in ('active', 'expired', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_listings_deduplication_key_uidx` ON `job_listings` (`deduplication_key`);--> statement-breakpoint
CREATE INDEX `job_listings_decision_idx` ON `job_listings` (`current_decision`);--> statement-breakpoint
CREATE INDEX `job_listings_lifecycle_idx` ON `job_listings` (`lifecycle_status`);--> statement-breakpoint
CREATE INDEX `job_listings_company_title_idx` ON `job_listings` (`normalized_company`,`normalized_title`);--> statement-breakpoint
CREATE TABLE `job_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_listing_id` text NOT NULL,
	`revision_number` integer DEFAULT 1 NOT NULL,
	`source_type` text NOT NULL,
	`source_name` text,
	`source_url` text,
	`retrieved_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`raw_description` text NOT NULL,
	`cleaned_description` text,
	`content_hash` text NOT NULL,
	`parser_version` text NOT NULL,
	`parse_schema_version` text NOT NULL,
	`parse_warnings` text DEFAULT '[]' NOT NULL,
	`field_evidence` text DEFAULT '{}' NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`location` text,
	`work_arrangement` text DEFAULT 'unclear' NOT NULL,
	`salary_minimum_cents` integer,
	`salary_maximum_cents` integer,
	`salary_currency` text DEFAULT 'USD' NOT NULL,
	`salary_period` text DEFAULT 'year' NOT NULL,
	`salary_source` text DEFAULT 'unknown' NOT NULL,
	`employment_type` text,
	`role_summary` text,
	`remote_restriction` text,
	`posted_at` integer,
	`application_deadline` integer,
	`seniority` text,
	`years_experience_minimum` integer,
	`years_experience_maximum` integer,
	`experience_requirements` text DEFAULT '[]' NOT NULL,
	`technologies` text DEFAULT '[]' NOT NULL,
	`responsibilities` text DEFAULT '[]' NOT NULL,
	`required_qualifications` text DEFAULT '[]' NOT NULL,
	`preferred_qualifications` text DEFAULT '[]' NOT NULL,
	`benefits` text DEFAULT '[]' NOT NULL,
	`travel_requirement` text,
	`industry` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_revisions_revision_check" CHECK("job_revisions"."revision_number" >= 1),
	CONSTRAINT "job_revisions_source_type_check" CHECK("job_revisions"."source_type" in ('manual_paste', 'manual_url', 'public_feed', 'company_careers', 'api', 'rss', 'csv', 'json')),
	CONSTRAINT "job_revisions_work_arrangement_check" CHECK("job_revisions"."work_arrangement" in ('remote', 'hybrid', 'on_site', 'unclear')),
	CONSTRAINT "job_revisions_salary_source_check" CHECK("job_revisions"."salary_source" in ('employer_posted', 'external_estimate', 'unknown')),
	CONSTRAINT "job_revisions_salary_period_check" CHECK("job_revisions"."salary_period" in ('year', 'hour', 'month')),
	CONSTRAINT "job_revisions_salary_minimum_check" CHECK("job_revisions"."salary_minimum_cents" is null or "job_revisions"."salary_minimum_cents" >= 0),
	CONSTRAINT "job_revisions_salary_maximum_check" CHECK("job_revisions"."salary_maximum_cents" is null or "job_revisions"."salary_maximum_cents" >= 0),
	CONSTRAINT "job_revisions_salary_range_check" CHECK("job_revisions"."salary_minimum_cents" is null or "job_revisions"."salary_maximum_cents" is null or "job_revisions"."salary_maximum_cents" >= "job_revisions"."salary_minimum_cents"),
	CONSTRAINT "job_revisions_experience_range_check" CHECK(("job_revisions"."years_experience_minimum" is null or "job_revisions"."years_experience_minimum" >= 0) and ("job_revisions"."years_experience_maximum" is null or "job_revisions"."years_experience_maximum" >= 0) and ("job_revisions"."years_experience_minimum" is null or "job_revisions"."years_experience_maximum" is null or "job_revisions"."years_experience_maximum" >= "job_revisions"."years_experience_minimum"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_revisions_listing_revision_uidx` ON `job_revisions` (`job_listing_id`,`revision_number`);--> statement-breakpoint
CREATE INDEX `job_revisions_listing_created_idx` ON `job_revisions` (`job_listing_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `job_revisions_content_hash_idx` ON `job_revisions` (`content_hash`);--> statement-breakpoint
CREATE INDEX `job_revisions_source_url_idx` ON `job_revisions` (`source_url`);--> statement-breakpoint
CREATE TABLE `portfolio_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`technologies` text DEFAULT '[]' NOT NULL,
	`status` text NOT NULL,
	`live_url` text,
	`repository_url` text,
	`app_store_url` text,
	`screenshots` text DEFAULT '[]' NOT NULL,
	`responsibilities` text DEFAULT '[]' NOT NULL,
	`business_problem` text NOT NULL,
	`user_impact` text NOT NULL,
	`strongest_evidence` text DEFAULT '[]' NOT NULL,
	`relevant_role_families` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolio_projects_profile_name_uidx` ON `portfolio_projects` (`candidate_profile_id`,`name`);--> statement-breakpoint
CREATE INDEX `portfolio_projects_profile_idx` ON `portfolio_projects` (`candidate_profile_id`);
