CREATE TABLE `visitor_preference_overrides` (
	`visitor_id` text NOT NULL,
	`feature_key` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	PRIMARY KEY(`visitor_id`, `feature_key`),
	FOREIGN KEY (`visitor_id`) REFERENCES `visitors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "visitor_preference_overrides_mode_check" CHECK("visitor_preference_overrides"."mode" in ('more', 'less', 'ignore')),
	CONSTRAINT "visitor_preference_overrides_feature_key_check" CHECK(length("visitor_preference_overrides"."feature_key") between 3 and 160 and instr("visitor_preference_overrides"."feature_key", ':') > 1 and (
        "visitor_preference_overrides"."feature_key" glob 'title:*' or
        "visitor_preference_overrides"."feature_key" glob 'company:*' or
        "visitor_preference_overrides"."feature_key" glob 'arrangement:*' or
        "visitor_preference_overrides"."feature_key" glob 'location:*' or
        "visitor_preference_overrides"."feature_key" glob 'seniority:*' or
        "visitor_preference_overrides"."feature_key" glob 'experience:*' or
        "visitor_preference_overrides"."feature_key" glob 'salary-min:*' or
        "visitor_preference_overrides"."feature_key" glob 'salary-max:*' or
        "visitor_preference_overrides"."feature_key" glob 'salary-mid:*' or
        "visitor_preference_overrides"."feature_key" glob 'industry:*'
      ))
);
--> statement-breakpoint
CREATE INDEX `visitor_preference_overrides_visitor_updated_idx` ON `visitor_preference_overrides` (`visitor_id`,`updated_at`);