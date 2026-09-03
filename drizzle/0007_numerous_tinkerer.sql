CREATE TABLE `beta_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`job_listing_id` text,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`page_path` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "beta_feedback_kind_check" CHECK("beta_feedback"."kind" in ('general', 'bug', 'idea', 'listing_issue')),
	CONSTRAINT "beta_feedback_status_check" CHECK("beta_feedback"."status" in ('open', 'reviewed', 'closed'))
);
--> statement-breakpoint
CREATE INDEX `beta_feedback_created_idx` ON `beta_feedback` (`created_at`);--> statement-breakpoint
CREATE INDEX `beta_feedback_visitor_idx` ON `beta_feedback` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `candidate_resume_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`label` text NOT NULL,
	`source_file_name` text,
	`content_hash` text NOT NULL,
	`raw_text` text NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_resume_sources_profile_hash_uidx` ON `candidate_resume_sources` (`candidate_profile_id`,`content_hash`);--> statement-breakpoint
CREATE INDEX `candidate_resume_sources_profile_idx` ON `candidate_resume_sources` (`candidate_profile_id`);--> statement-breakpoint
CREATE TABLE `job_application_details` (
	`visitor_id` text NOT NULL,
	`job_listing_id` text NOT NULL,
	`application_deadline` integer,
	`follow_up_at` integer,
	`contact_name` text,
	`contact_email` text,
	`resume_label` text,
	`next_step` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	PRIMARY KEY(`visitor_id`, `job_listing_id`),
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_application_details_follow_up_idx` ON `job_application_details` (`visitor_id`,`follow_up_at`);--> statement-breakpoint
CREATE INDEX `job_application_details_deadline_idx` ON `job_application_details` (`visitor_id`,`application_deadline`);--> statement-breakpoint
CREATE TABLE `visitor_device_pairing_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_device_pairing_codes_hash_uidx` ON `visitor_device_pairing_codes` (`code_hash`);--> statement-breakpoint
CREATE INDEX `visitor_device_pairing_codes_visitor_idx` ON `visitor_device_pairing_codes` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `visitor_device_pairing_codes_expiry_idx` ON `visitor_device_pairing_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `visitor_product_settings` (
	`visitor_id` text PRIMARY KEY NOT NULL,
	`onboarding_completed_at` integer,
	`daily_digest_enabled` integer DEFAULT true NOT NULL,
	`reminder_notifications_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visitor_product_settings_updated_idx` ON `visitor_product_settings` (`updated_at`);