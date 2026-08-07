ALTER TABLE `job_sources` ADD `removed_at` integer;--> statement-breakpoint
CREATE INDEX `job_sources_removed_idx` ON `job_sources` (`removed_at`);