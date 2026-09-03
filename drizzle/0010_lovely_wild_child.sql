CREATE TABLE `candidate_resume_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`resume_source_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`parser_version` text NOT NULL,
	`draft_json` text NOT NULL,
	`raw_source_retained` integer DEFAULT false NOT NULL,
	`confirmed_at` integer,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resume_source_id`) REFERENCES `candidate_resume_sources`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "candidate_resume_imports_status_check" CHECK("candidate_resume_imports"."status" in ('draft', 'confirmed', 'discarded'))
);
--> statement-breakpoint
CREATE INDEX `candidate_resume_imports_profile_status_idx` ON `candidate_resume_imports` (`candidate_profile_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_resume_imports_source_uidx` ON `candidate_resume_imports` (`resume_source_id`);--> statement-breakpoint
CREATE TABLE `candidate_role_targets` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_profile_id` text NOT NULL,
	`canonical_family` text NOT NULL,
	`label` text NOT NULL,
	`aliases` text DEFAULT '[]' NOT NULL,
	`priority_rank` integer NOT NULL,
	`readiness` text DEFAULT 'ready_now' NOT NULL,
	`allowed_seniority_levels` text DEFAULT '[]' NOT NULL,
	`minimum_required_experience_years` integer,
	`maximum_required_experience_years` integer,
	`exclusions` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	`updated_at` integer DEFAULT (
  cast((julianday('now') - 2440587.5) * 86400000 as integer)
) NOT NULL,
	FOREIGN KEY (`candidate_profile_id`) REFERENCES `candidate_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "candidate_role_targets_priority_check" CHECK("candidate_role_targets"."priority_rank" between 1 and 100),
	CONSTRAINT "candidate_role_targets_readiness_check" CHECK("candidate_role_targets"."readiness" in ('ready_now', 'stretch')),
	CONSTRAINT "candidate_role_targets_experience_check" CHECK(("candidate_role_targets"."minimum_required_experience_years" is null or "candidate_role_targets"."minimum_required_experience_years" between 0 and 50) and ("candidate_role_targets"."maximum_required_experience_years" is null or "candidate_role_targets"."maximum_required_experience_years" between 0 and 50) and ("candidate_role_targets"."minimum_required_experience_years" is null or "candidate_role_targets"."maximum_required_experience_years" is null or "candidate_role_targets"."maximum_required_experience_years" >= "candidate_role_targets"."minimum_required_experience_years"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `candidate_role_targets_profile_family_uidx` ON `candidate_role_targets` (`candidate_profile_id`,`canonical_family`);--> statement-breakpoint
CREATE INDEX `candidate_role_targets_profile_readiness_rank_idx` ON `candidate_role_targets` (`candidate_profile_id`,`readiness`,`priority_rank`);--> statement-breakpoint
ALTER TABLE `candidate_profiles` ADD `search_contract_fingerprint` text;--> statement-breakpoint
ALTER TABLE `candidate_skill_evidence` ADD `confidence` text DEFAULT 'medium' NOT NULL CONSTRAINT "candidate_skill_evidence_confidence_check" CHECK (`confidence` in ('low', 'medium', 'high', 'verified'));--> statement-breakpoint
ALTER TABLE `candidate_skill_evidence` ADD `source_record_id` text;--> statement-breakpoint
INSERT INTO `candidate_role_targets` (
	`id`, `candidate_profile_id`, `canonical_family`, `label`, `aliases`,
	`priority_rank`, `readiness`, `allowed_seniority_levels`,
	`minimum_required_experience_years`, `maximum_required_experience_years`,
	`exclusions`
)
SELECT
	`candidate_profiles`.`id` || '-legacy-role-' || cast(`json_each`.`key` as text),
	`candidate_profiles`.`id`,
	'legacy_' || cast(cast(`json_each`.`key` as integer) + 1 as text) || '_' ||
		lower(replace(replace(replace(trim(cast(`json_each`.`value` as text)), ' ', '_'), '-', '_'), '/', '_')),
	trim(cast(`json_each`.`value` as text)),
	'[]',
	cast(`json_each`.`key` as integer) + 1,
	'ready_now',
	CASE
		WHEN json_valid(`candidate_profiles`.`desired_seniority_levels`)
			AND json_array_length(`candidate_profiles`.`desired_seniority_levels`) > 0
		THEN `candidate_profiles`.`desired_seniority_levels`
		ELSE '["entry","mid"]'
	END,
	0,
	CASE
		WHEN `candidate_profiles`.`years_experience` + 2 > 50 THEN 50
		ELSE `candidate_profiles`.`years_experience` + 2
	END,
	'[]'
FROM `candidate_profiles`, json_each(`candidate_profiles`.`target_role_families`)
WHERE
	json_valid(`candidate_profiles`.`target_role_families`)
	AND json_type(`candidate_profiles`.`target_role_families`) = 'array'
	AND trim(cast(`json_each`.`value` as text)) <> ''
	AND cast(`json_each`.`key` as integer) < 12;--> statement-breakpoint
DELETE FROM `candidate_role_targets`
WHERE `candidate_profile_id` = 'candidate-default';--> statement-breakpoint
INSERT INTO `candidate_role_targets` (
	`id`, `candidate_profile_id`, `canonical_family`, `label`, `aliases`,
	`priority_rank`, `readiness`, `allowed_seniority_levels`,
	`minimum_required_experience_years`, `maximum_required_experience_years`,
	`exclusions`
)
SELECT
	'owner-role-' || cast(`role`.`rank` as text),
	'candidate-default',
	`role`.`family`,
	`role`.`label`,
	`role`.`aliases`,
	`role`.`rank`,
	`role`.`readiness`,
	'["entry","mid"]',
	0,
	3,
	'["Senior","Staff","Principal","Manager","Director","Quota-carrying","Requires 4+ years"]'
FROM (
	SELECT 1 AS `rank`, 'implementation' AS `family`, 'Implementation specialist / analyst' AS `label`, '["Implementation Specialist","Implementation Analyst"]' AS `aliases`, 'ready_now' AS `readiness`
	UNION ALL SELECT 2, 'health_tech_implementation', 'Health-tech implementation', '["Healthcare Implementation Specialist","Clinical Systems Implementation"]', 'ready_now'
	UNION ALL SELECT 3, 'ai_enablement_operations', 'AI enablement / operations', '["AI Operations Analyst","AI Enablement Specialist"]', 'ready_now'
	UNION ALL SELECT 4, 'product_operations', 'Product operations', '["Product Operations Analyst","Product Ops Coordinator"]', 'ready_now'
	UNION ALL SELECT 5, 'technical_customer_success', 'Technical customer success', '["Technical Customer Success","Technical Success Specialist"]', 'ready_now'
	UNION ALL SELECT 6, 'business_systems_automation', 'Business systems / automation analyst', '["Business Systems Analyst","Automation Analyst"]', 'ready_now'
	UNION ALL SELECT 7, 'associate_solutions', 'Associate solutions consultant / engineer', '["Associate Solutions Consultant","Junior Solutions Engineer"]', 'stretch'
	UNION ALL SELECT 8, 'associate_product', 'Associate product roles', '["Associate Product Manager","Product Analyst"]', 'stretch'
	UNION ALL SELECT 9, 'technical_product_specialist', 'Technical product specialist', '["Technical Product Specialist","Product Support Specialist"]', 'stretch'
) AS `role`
WHERE EXISTS (
	SELECT 1 FROM `candidate_profiles`
	WHERE `candidate_profiles`.`id` = 'candidate-default'
		AND `candidate_profiles`.`visitor_id` = '00000000-0000-4000-8000-000000000001'
);--> statement-breakpoint
UPDATE `candidate_profiles`
SET
	`target_role_families` = '["Implementation specialist / analyst","Health-tech implementation","AI enablement / operations","Product operations","Technical customer success","Business systems / automation analyst","Associate solutions consultant / engineer","Associate product roles","Technical product specialist"]',
	`desired_seniority_levels` = CASE WHEN json_array_length(`desired_seniority_levels`) = 0 THEN '["entry","mid"]' ELSE `desired_seniority_levels` END,
	`excluded_titles` = CASE WHEN json_array_length(`excluded_titles`) = 0 THEN '["Senior","Staff","Principal","Manager","Director","Software Engineer","Machine Learning Engineer","Help Desk","Desktop Support","Account Executive"]' ELSE `excluded_titles` END
WHERE
	`id` = 'candidate-default'
	AND `visitor_id` = '00000000-0000-4000-8000-000000000001';
