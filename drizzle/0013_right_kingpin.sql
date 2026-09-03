CREATE TABLE `job_feature_snapshots` (
	`job_revision_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`extractor_version` text NOT NULL,
	`input_hash` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	PRIMARY KEY(`job_revision_id`, `schema_version`, `extractor_version`),
	FOREIGN KEY (`job_revision_id`) REFERENCES `job_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "job_feature_snapshots_versions_check" CHECK(length("job_feature_snapshots"."schema_version") > 0 and length("job_feature_snapshots"."extractor_version") > 0),
	CONSTRAINT "job_feature_snapshots_input_hash_check" CHECK(length("job_feature_snapshots"."input_hash") >= 16)
);
--> statement-breakpoint
CREATE INDEX `job_feature_snapshots_version_revision_idx` ON `job_feature_snapshots` (`schema_version`,`extractor_version`,`job_revision_id`);--> statement-breakpoint
CREATE INDEX `job_feature_snapshots_created_idx` ON `job_feature_snapshots` (`created_at`);--> statement-breakpoint
CREATE TRIGGER `job_feature_snapshots_prevent_update`
BEFORE UPDATE ON `job_feature_snapshots`
BEGIN
	SELECT RAISE(ABORT, 'job feature snapshots are immutable');
END;
