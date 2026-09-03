CREATE TABLE `candidate_education_records` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`institution` text NOT NULL,
	`degree` text DEFAULT '' NOT NULL,
	`field_of_study` text DEFAULT '' NOT NULL,
	`start_year` integer,
	`end_year` integer,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidate_education_records_sort_order_check" CHECK("candidate_education_records"."sort_order" between 0 and 1000),
	CONSTRAINT "candidate_education_records_years_check" CHECK(("candidate_education_records"."start_year" is null or "candidate_education_records"."start_year" between 1900 and 2200) and ("candidate_education_records"."end_year" is null or "candidate_education_records"."end_year" between 1900 and 2200) and ("candidate_education_records"."start_year" is null or "candidate_education_records"."end_year" is null or "candidate_education_records"."end_year" >= "candidate_education_records"."start_year"))
);
--> statement-breakpoint
CREATE INDEX `candidate_education_records_profile_order_idx` ON `candidate_education_records` (`candidate_profile_id`,`sort_order`,`end_year`);--> statement-breakpoint
CREATE TABLE `candidate_skill_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`name` text NOT NULL,
	`proficiency` text DEFAULT 'working' NOT NULL,
	`years_experience` integer,
	`last_used_year` integer,
	`evidence_type` text DEFAULT 'self_reported' NOT NULL,
	`evidence_note` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidate_skill_evidence_years_check" CHECK("candidate_skill_evidence"."years_experience" is null or "candidate_skill_evidence"."years_experience" between 0 and 50),
	CONSTRAINT "candidate_skill_evidence_last_used_check" CHECK("candidate_skill_evidence"."last_used_year" is null or "candidate_skill_evidence"."last_used_year" between 1900 and 2200),
	CONSTRAINT "candidate_skill_evidence_proficiency_check" CHECK("candidate_skill_evidence"."proficiency" in ('learning', 'working', 'advanced', 'expert')),
	CONSTRAINT "candidate_skill_evidence_type_check" CHECK("candidate_skill_evidence"."evidence_type" in ('self_reported', 'work_experience', 'portfolio_project', 'education', 'certification', 'assessment', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_skill_evidence_profile_name_uidx` ON `candidate_skill_evidence` (`candidate_profile_id`,`name`);--> statement-breakpoint
CREATE INDEX `candidate_skill_evidence_profile_idx` ON `candidate_skill_evidence` (`candidate_profile_id`);--> statement-breakpoint
CREATE TABLE `candidate_work_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`employment_type` text,
	`location` text,
	`work_arrangement` text,
	`start_date` text NOT NULL,
	`end_date` text,
	`is_current` integer DEFAULT false NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`achievements` text DEFAULT '[]' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidate_work_experiences_sort_order_check" CHECK("candidate_work_experiences"."sort_order" between 0 and 1000)
);
--> statement-breakpoint
CREATE INDEX `candidate_work_experiences_profile_order_idx` ON `candidate_work_experiences` (`candidate_profile_id`,`sort_order`,`start_date`);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `desired_seniority_levels` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `excluded_titles` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `excluded_companies` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `excluded_industries` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `accepted_employment_types` text DEFAULT '["full_time","part_time","contract","temporary","internship"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `preferred_work_modes` text DEFAULT '["remote","hybrid","on_site"]' NOT NULL;--> statement-breakpoint
UPDATE `candidate_profiles`
SET `preferred_work_modes` = `preferred_work_arrangements`
WHERE
	json_valid(`preferred_work_arrangements`)
	AND json_type(`preferred_work_arrangements`) = 'array'
	AND json_array_length(`preferred_work_arrangements`) > 0
	AND NOT EXISTS (
		SELECT 1
		FROM json_each(`preferred_work_arrangements`)
		WHERE json_each.value NOT IN ('remote', 'hybrid', 'on_site')
	);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `strict_work_modes` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `commute_radius_miles` integer CONSTRAINT "candidate_profiles_commute_radius_check" CHECK (`commute_radius_miles` is null or `commute_radius_miles` between 0 and 250);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `max_office_days_per_week` integer CONSTRAINT "candidate_profiles_office_days_check" CHECK (`max_office_days_per_week` is null or `max_office_days_per_week` between 0 and 5);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `relocation_destinations` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `max_travel_percent` integer CONSTRAINT "candidate_profiles_travel_check" CHECK (`max_travel_percent` is null or `max_travel_percent` between 0 and 100);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `work_authorization` text DEFAULT 'prefer_not_to_say' NOT NULL CONSTRAINT "candidate_profiles_work_authorization_check" CHECK (`work_authorization` in ('citizen_or_permanent_resident', 'work_authorized', 'student_or_temporary', 'not_authorized', 'prefer_not_to_say'));--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `requires_sponsorship` integer;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `missing_salary_policy` text DEFAULT 'explore_only' NOT NULL CONSTRAINT "candidate_profiles_missing_salary_policy_check" CHECK (`missing_salary_policy` in ('show', 'explore_only', 'hide'));--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `evidence_fingerprint` text;
