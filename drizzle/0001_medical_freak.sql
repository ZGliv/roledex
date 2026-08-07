CREATE TABLE `ingestion_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`requested_source_count` integer DEFAULT 0 NOT NULL,
	`successful_source_count` integer DEFAULT 0 NOT NULL,
	`failed_source_count` integer DEFAULT 0 NOT NULL,
	`fetched_job_count` integer DEFAULT 0 NOT NULL,
	`filtered_job_count` integer DEFAULT 0 NOT NULL,
	`new_job_count` integer DEFAULT 0 NOT NULL,
	`changed_job_count` integer DEFAULT 0 NOT NULL,
	`unchanged_job_count` integer DEFAULT 0 NOT NULL,
	`expired_job_count` integer DEFAULT 0 NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL,
	`started_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`completed_at` integer,
	CONSTRAINT "ingestion_runs_trigger_check" CHECK("ingestion_runs"."trigger" in ('on_demand', 'scheduled')),
	CONSTRAINT "ingestion_runs_status_check" CHECK("ingestion_runs"."status" in ('running', 'succeeded', 'partial', 'failed')),
	CONSTRAINT "ingestion_runs_source_counts_check" CHECK("ingestion_runs"."requested_source_count" >= 0 and "ingestion_runs"."successful_source_count" >= 0 and "ingestion_runs"."failed_source_count" >= 0 and "ingestion_runs"."successful_source_count" + "ingestion_runs"."failed_source_count" <= "ingestion_runs"."requested_source_count"),
	CONSTRAINT "ingestion_runs_job_counts_check" CHECK("ingestion_runs"."fetched_job_count" >= 0 and "ingestion_runs"."filtered_job_count" >= 0 and "ingestion_runs"."new_job_count" >= 0 and "ingestion_runs"."changed_job_count" >= 0 and "ingestion_runs"."unchanged_job_count" >= 0 and "ingestion_runs"."expired_job_count" >= 0),
	CONSTRAINT "ingestion_runs_completed_at_check" CHECK("ingestion_runs"."completed_at" is null or "ingestion_runs"."completed_at" >= "ingestion_runs"."started_at")
);
--> statement-breakpoint
CREATE INDEX `ingestion_runs_status_started_idx` ON `ingestion_runs` (`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `ingestion_runs_started_idx` ON `ingestion_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `job_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_key` text NOT NULL,
	`company_name` text NOT NULL,
	`company_domain` text,
	`logo_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`refresh_interval_hours` integer DEFAULT 24 NOT NULL,
	`last_attempted_at` integer,
	`last_succeeded_at` integer,
	`last_error_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	CONSTRAINT "job_sources_provider_check" CHECK("job_sources"."provider" in ('greenhouse', 'lever', 'ashby')),
	CONSTRAINT "job_sources_refresh_interval_check" CHECK("job_sources"."refresh_interval_hours" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_sources_provider_key_uidx` ON `job_sources` (`provider`,`provider_key`);--> statement-breakpoint
CREATE INDEX `job_sources_enabled_attempt_idx` ON `job_sources` (`enabled`,`last_attempted_at`);--> statement-breakpoint
CREATE INDEX `job_sources_company_idx` ON `job_sources` (`company_name`);--> statement-breakpoint
CREATE TABLE `source_sightings` (
	`id` text PRIMARY KEY NOT NULL,
	`job_source_id` text NOT NULL,
	`external_job_id` text NOT NULL,
	`job_listing_id` text,
	`canonical_url` text NOT NULL,
	`content_hash` text NOT NULL,
	`source_updated_at` integer,
	`first_seen_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`last_seen_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`last_seen_ingestion_run_id` text,
	FOREIGN KEY (`job_source_id`) REFERENCES `job_sources`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`last_seen_ingestion_run_id`) REFERENCES `ingestion_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "source_sightings_seen_range_check" CHECK("source_sightings"."last_seen_at" >= "source_sightings"."first_seen_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_sightings_source_external_uidx` ON `source_sightings` (`job_source_id`,`external_job_id`);--> statement-breakpoint
CREATE INDEX `source_sightings_source_last_seen_idx` ON `source_sightings` (`job_source_id`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `source_sightings_listing_idx` ON `source_sightings` (`job_listing_id`);--> statement-breakpoint
CREATE INDEX `source_sightings_canonical_url_idx` ON `source_sightings` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `source_sightings_last_run_idx` ON `source_sightings` (`last_seen_ingestion_run_id`);