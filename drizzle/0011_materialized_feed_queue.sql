CREATE TABLE `feed_exposures` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`session_id` text NOT NULL,
	`queue_id` text NOT NULL,
	`queue_version` text NOT NULL,
	`job_listing_id` text NOT NULL,
	`position` integer NOT NULL,
	`tier` text NOT NULL,
	`exposed_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`first_interaction_at` integer,
	`last_interaction_at` integer,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`,`visitor_id`) REFERENCES `feed_sessions`(`id`,`visitor_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "feed_exposures_position_check" CHECK("feed_exposures"."position" between 0 and 99),
	CONSTRAINT "feed_exposures_tier_check" CHECK("feed_exposures"."tier" in ('ready_now', 'credible_stretch', 'discovery'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_exposures_session_job_uidx` ON `feed_exposures` (`session_id`,`job_listing_id`);--> statement-breakpoint
CREATE INDEX `feed_exposures_visitor_job_idx` ON `feed_exposures` (`visitor_id`,`job_listing_id`,`exposed_at`);--> statement-breakpoint
CREATE TABLE `feed_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`queue_id` text NOT NULL,
	`queue_version` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`source` text NOT NULL,
	`page_start_position` integer NOT NULL,
	`page_size` integer NOT NULL,
	`started_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`last_seen_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "feed_sessions_source_check" CHECK("feed_sessions"."source" in ('live_ranked', 'cached')),
	CONSTRAINT "feed_sessions_page_check" CHECK("feed_sessions"."page_start_position" >= 0 and "feed_sessions"."page_size" between 0 and 50),
	CONSTRAINT "feed_sessions_expiry_check" CHECK("feed_sessions"."expires_at" > "feed_sessions"."started_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_sessions_id_visitor_uidx` ON `feed_sessions` (`id`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `feed_sessions_visitor_started_idx` ON `feed_sessions` (`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `feed_sessions_expiry_idx` ON `feed_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `visitor_feed_queue_entries` (
	`queue_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`position` integer NOT NULL,
	`job_listing_id` text NOT NULL,
	`tier` text NOT NULL,
	`card_snapshot` text NOT NULL,
	`consumed_at` integer,
	`decision_event_id` text,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	PRIMARY KEY(`queue_id`, `position`),
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`queue_id`,`visitor_id`) REFERENCES `visitor_feed_queues`(`id`,`visitor_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_feed_queue_entries_position_check" CHECK("visitor_feed_queue_entries"."position" between 0 and 99),
	CONSTRAINT "visitor_feed_queue_entries_tier_check" CHECK("visitor_feed_queue_entries"."tier" in ('ready_now', 'credible_stretch', 'discovery'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_feed_queue_entries_queue_job_uidx` ON `visitor_feed_queue_entries` (`queue_id`,`job_listing_id`);--> statement-breakpoint
CREATE INDEX `visitor_feed_queue_entries_visitor_active_idx` ON `visitor_feed_queue_entries` (`visitor_id`,`queue_id`,`consumed_at`,`position`);--> statement-breakpoint
CREATE TABLE `visitor_feed_queues` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`profile_revision` integer NOT NULL,
	`queue_version` text NOT NULL,
	`recommender_version` text NOT NULL,
	`catalog_revision_id` text,
	`catalog_retrieved_at` integer,
	`pending_interaction_count` integer DEFAULT 0 NOT NULL,
	`preference_dirty_at` integer,
	`invalidated_at` integer,
	`generated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`expires_at` integer NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_feed_queues_profile_revision_check" CHECK("visitor_feed_queues"."profile_revision" >= 1),
	CONSTRAINT "visitor_feed_queues_pending_interactions_check" CHECK("visitor_feed_queues"."pending_interaction_count" >= 0),
	CONSTRAINT "visitor_feed_queues_expiry_check" CHECK("visitor_feed_queues"."expires_at" > "visitor_feed_queues"."generated_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_feed_queues_visitor_uidx` ON `visitor_feed_queues` (`visitor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `visitor_feed_queues_id_visitor_uidx` ON `visitor_feed_queues` (`id`,`visitor_id`);--> statement-breakpoint
CREATE INDEX `visitor_feed_queues_expiry_idx` ON `visitor_feed_queues` (`expires_at`);--> statement-breakpoint
ALTER TABLE `job_decision_events` ADD `feed_exposure_id` text;--> statement-breakpoint
CREATE INDEX `job_decision_events_exposure_idx` ON `job_decision_events` (`feed_exposure_id`);--> statement-breakpoint
CREATE INDEX `job_revisions_retrieved_idx` ON `job_revisions` (`retrieved_at`,`id`);