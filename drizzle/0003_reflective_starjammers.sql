CREATE TABLE `visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'guest' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`last_seen_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	CONSTRAINT "visitors_kind_check" CHECK("visitors"."kind" in ('guest', 'owner'))
);
--> statement-breakpoint
CREATE INDEX `visitors_kind_created_idx` ON `visitors` (`kind`,`created_at`);--> statement-breakpoint
INSERT INTO `visitors` (`id`, `kind`)
VALUES ('00000000-0000-4000-8000-000000000001', 'owner');--> statement-breakpoint
DROP INDEX `candidate_profiles_active_idx`;--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `visitor_id` text REFERENCES visitors(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `candidate_profiles`
SET `visitor_id` = '00000000-0000-4000-8000-000000000001'
WHERE `visitor_id` IS NULL;--> statement-breakpoint
CREATE TRIGGER `candidate_profiles_visitor_required_insert`
BEFORE INSERT ON `candidate_profiles`
WHEN NEW.`visitor_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'candidate_profiles.visitor_id is required');
END;--> statement-breakpoint
CREATE TRIGGER `candidate_profiles_visitor_required_update`
BEFORE UPDATE OF `visitor_id` ON `candidate_profiles`
WHEN NEW.`visitor_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'candidate_profiles.visitor_id is required');
END;--> statement-breakpoint
CREATE INDEX `candidate_profiles_visitor_active_idx` ON `candidate_profiles` (`visitor_id`,`is_active`);--> statement-breakpoint
UPDATE `candidate_profiles`
SET `is_active` = 0
WHERE
	`visitor_id` = '00000000-0000-4000-8000-000000000001'
	AND `is_active` = 1
	AND `id` <> (
		SELECT `id`
		FROM `candidate_profiles`
		WHERE
			`visitor_id` = '00000000-0000-4000-8000-000000000001'
			AND `is_active` = 1
		ORDER BY `updated_at` DESC, `created_at` DESC, `id` DESC
		LIMIT 1
	);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_profiles_one_active_per_visitor_uidx` ON `candidate_profiles` (`visitor_id`) WHERE `is_active` = 1;--> statement-breakpoint
DROP INDEX `fit_score_runs_cache_key_uidx`;--> statement-breakpoint
CREATE UNIQUE INDEX `fit_score_runs_profile_cache_key_uidx` ON `fit_score_runs` (`candidate_profile_id`,`input_hash`,`scoring_version`);--> statement-breakpoint
ALTER TABLE `job_decision_events` ADD `visitor_id` text REFERENCES visitors(id) ON DELETE cascade;--> statement-breakpoint
UPDATE `job_decision_events`
SET `visitor_id` = '00000000-0000-4000-8000-000000000001'
WHERE `visitor_id` IS NULL;--> statement-breakpoint
CREATE TRIGGER `job_decision_events_visitor_required_insert`
BEFORE INSERT ON `job_decision_events`
WHEN NEW.`visitor_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'job_decision_events.visitor_id is required');
END;--> statement-breakpoint
CREATE TRIGGER `job_decision_events_visitor_required_update`
BEFORE UPDATE OF `visitor_id` ON `job_decision_events`
WHEN NEW.`visitor_id` IS NULL
BEGIN
	SELECT RAISE(ABORT, 'job_decision_events.visitor_id is required');
END;--> statement-breakpoint
CREATE INDEX `job_decision_events_visitor_decided_idx` ON `job_decision_events` (`visitor_id`,`decided_at`);--> statement-breakpoint
CREATE TABLE `visitor_job_states` (
	`visitor_id` text NOT NULL,
	`job_listing_id` text NOT NULL,
	`current_decision` text DEFAULT 'unseen' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	PRIMARY KEY(`visitor_id`, `job_listing_id`),
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_listing_id`) REFERENCES `job_listings`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_job_states_decision_check" CHECK("visitor_job_states"."current_decision" in ('unseen', 'saved', 'skipped', 'stretch', 'learn_first', 'apply', 'applied', 'interview', 'rejected', 'offer', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `visitor_job_states_visitor_decision_idx` ON `visitor_job_states` (`visitor_id`,`current_decision`,`updated_at`);--> statement-breakpoint
CREATE INDEX `visitor_job_states_listing_idx` ON `visitor_job_states` (`job_listing_id`);--> statement-breakpoint
INSERT INTO `visitor_job_states` (
	`visitor_id`,
	`job_listing_id`,
	`current_decision`,
	`created_at`,
	`updated_at`
)
SELECT
	'00000000-0000-4000-8000-000000000001',
	`id`,
	`current_decision`,
	`created_at`,
	`updated_at`
FROM `job_listings`
WHERE `current_decision` <> 'unseen';
