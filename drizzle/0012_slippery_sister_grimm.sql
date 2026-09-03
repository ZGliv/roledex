CREATE TABLE `api_rate_limit_buckets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`attempt_count` integer DEFAULT 1 NOT NULL,
	`window_started_at` integer NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	CONSTRAINT "api_rate_limit_buckets_attempt_count_check" CHECK("api_rate_limit_buckets"."attempt_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX `api_rate_limit_buckets_cleanup_idx` ON `api_rate_limit_buckets` (`kind`,`window_started_at`);--> statement-breakpoint
ALTER TABLE `native_installations` ADD `previous_credential_hash` text;--> statement-breakpoint
ALTER TABLE `native_installations` ADD `previous_credential_expires_at` integer;--> statement-breakpoint
CREATE INDEX `native_installations_previous_credential_idx` ON `native_installations` (`previous_credential_hash`,`previous_credential_expires_at`);