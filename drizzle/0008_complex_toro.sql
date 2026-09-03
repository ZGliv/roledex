CREATE TABLE `native_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`visitor_id` text NOT NULL,
	`platform` text DEFAULT 'ios' NOT NULL,
	`credential_hash` text NOT NULL,
	`app_version` text NOT NULL,
	`build_number` text NOT NULL,
	`device_name` text,
	`attestation_state` text DEFAULT 'unavailable' NOT NULL,
	`credential_expires_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "native_installations_platform_check" CHECK("native_installations"."platform" = 'ios'),
	CONSTRAINT "native_installations_attestation_check" CHECK("native_installations"."attestation_state" in ('unavailable', 'pending', 'verified', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_installations_credential_hash_uidx` ON `native_installations` (`credential_hash`);--> statement-breakpoint
CREATE INDEX `native_installations_visitor_idx` ON `native_installations` (`visitor_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `native_installations_expiry_idx` ON `native_installations` (`credential_expires_at`);