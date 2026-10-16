import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const migrationSource = join(process.cwd(), "drizzle");
const cleanupPaths: string[] = [];

function temporaryPath(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function databaseClient(directory: string) {
  return createClient({
    url: pathToFileURL(join(directory, "migration.db")).href,
  });
}

function migrationsThrough(index: number) {
  const folder = temporaryPath("jobswipe-migrations-");
  mkdirSync(join(folder, "meta"));
  const journal = JSON.parse(
    readFileSync(join(migrationSource, "meta", "_journal.json"), "utf8"),
  ) as {
    dialect: string;
    entries: Array<{ idx: number; tag: string }>;
    version: string;
  };
  const selectedEntries = journal.entries.filter((entry) => entry.idx <= index);
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: selectedEntries }),
  );
  for (const entry of selectedEntries) {
    cpSync(
      join(migrationSource, `${entry.tag}.sql`),
      join(folder, `${entry.tag}.sql`),
    );
  }
  return folder;
}

afterEach(() => {
  for (const path of cleanupPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("profile foundation migration", () => {
  it("migrates a new database through the current product foundation", async () => {
    const directory = temporaryPath("jobswipe-profile-fresh-");
    const client = databaseClient(directory);
    try {
      await migrate(drizzle(client), { migrationsFolder: migrationSource });
      const columns = await client.execute("PRAGMA table_info(candidate_profiles)");
      const names = columns.rows.map((row) => row.name);
      expect(names).toEqual(
        expect.arrayContaining([
          "desired_seniority_levels",
          "preferred_work_modes",
          "missing_salary_policy",
          "evidence_fingerprint",
          "search_contract_fingerprint",
        ]),
      );
      const tables = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table'",
      );
      expect(tables.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "candidate_work_experiences",
          "candidate_education_records",
          "candidate_skill_evidence",
          "portfolio_projects",
          "candidate_resume_sources",
          "candidate_resume_imports",
          "candidate_role_targets",
          "visitor_feed_queues",
          "visitor_feed_queue_entries",
          "visitor_preference_overrides",
          "feed_sessions",
          "feed_exposures",
          "job_feature_snapshots",
          "api_rate_limit_buckets",
          "job_application_details",
          "visitor_device_pairing_codes",
          "visitor_product_settings",
          "beta_feedback",
        ]),
      );
      const fitIndexes = await client.execute(
        "PRAGMA index_list('fit_score_runs')",
      );
      expect(fitIndexes.rows.map((row) => row.name)).toContain(
        "fit_score_runs_live_profile_idx",
      );
      const skillColumns = await client.execute(
        "PRAGMA table_info(candidate_skill_evidence)",
      );
      expect(skillColumns.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining(["confidence", "source_record_id"]),
      );
      const decisionColumns = await client.execute(
        "PRAGMA table_info(job_decision_events)",
      );
      expect(decisionColumns.rows.map((row) => row.name)).toContain(
        "feed_exposure_id",
      );
      const installationColumns = await client.execute(
        "PRAGMA table_info(native_installations)",
      );
      expect(installationColumns.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "previous_credential_hash",
          "previous_credential_expires_at",
        ]),
      );
      const revisionIndexes = await client.execute(
        "PRAGMA index_list('job_revisions')",
      );
      expect(revisionIndexes.rows.map((row) => row.name)).toContain(
        "job_revisions_retrieved_idx",
      );
      const snapshotIndexes = await client.execute(
        "PRAGMA index_list('job_feature_snapshots')",
      );
      expect(snapshotIndexes.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "job_feature_snapshots_version_revision_idx",
          "job_feature_snapshots_created_idx",
        ]),
      );
      const resumeImportIndexes = await client.execute(
        "PRAGMA index_list('candidate_resume_imports')",
      );
      expect(resumeImportIndexes.rows.map((row) => row.name)).toContain(
        "candidate_resume_imports_status_updated_idx",
      );
      const feedExposureIndexes = await client.execute(
        "PRAGMA index_list('feed_exposures')",
      );
      expect(feedExposureIndexes.rows.map((row) => row.name)).toContain(
        "feed_exposures_visitor_exposed_idx",
      );
    } finally {
      client.close();
    }
  });

  it("preserves the owner's edited search preferences when upgrading the deployed schema", async () => {
    const directory = temporaryPath("roledex-owner-migration-");
    const client = databaseClient(directory);
    try {
      await migrate(drizzle(client), { migrationsFolder: migrationsThrough(7) });
      const owner = "00000000-0000-4000-8000-000000000001";
      await client.execute({
        sql: "INSERT OR IGNORE INTO visitors (id, kind) VALUES (?, 'owner')",
        args: [owner],
      });
      await client.execute({
        sql: `INSERT INTO candidate_profiles (
          id, visitor_id, current_role, current_salary_cents,
          preferred_salary_minimum_cents, preferred_salary_target_cents,
          target_role_families, desired_seniority_levels, excluded_titles
        ) VALUES ('candidate-default', ?, 'Research Analyst', 5000000, 7000000,
          8000000, '["Research operations","Technical writing"]', '[]', '[]')`,
        args: [owner],
      });
      const before = await client.execute(
        "SELECT target_role_families, desired_seniority_levels, excluded_titles FROM candidate_profiles WHERE id = 'candidate-default'",
      );
      await migrate(drizzle(client), { migrationsFolder: migrationSource });
      const after = await client.execute(
        "SELECT target_role_families, desired_seniority_levels, excluded_titles FROM candidate_profiles WHERE id = 'candidate-default'",
      );
      expect(after.rows).toEqual(before.rows);
      const targets = await client.execute(
        "SELECT label FROM candidate_role_targets WHERE candidate_profile_id = 'candidate-default' ORDER BY priority_rank",
      );
      expect(targets.rows.map((row) => row.label)).toEqual([
        "Research operations",
        "Technical writing",
      ]);
    } finally {
      client.close();
    }
  });

  it("upgrades a seeded 0005 profile, safely backfills modes, and enforces checks", async () => {
    const directory = temporaryPath("jobswipe-profile-legacy-");
    const client = databaseClient(directory);
    try {
      await migrate(drizzle(client), { migrationsFolder: migrationsThrough(5) });
      const validVisitor = "10000000-0000-4000-8000-000000000001";
      const invalidVisitor = "10000000-0000-4000-8000-000000000002";
      await client.batch([
        {
          sql: "INSERT INTO visitors (id, kind) VALUES (?, 'guest')",
          args: [validVisitor],
        },
        {
          sql: "INSERT INTO visitors (id, kind) VALUES (?, 'guest')",
          args: [invalidVisitor],
        },
        {
          sql: `INSERT INTO candidate_profiles (
            id, visitor_id, current_role, current_salary_cents,
            preferred_salary_minimum_cents, preferred_salary_target_cents,
            preferred_work_arrangements, target_role_families
          ) VALUES (?, ?, 'Support Analyst', 5000000, 7000000, 8000000, ?, '["Implementation"]')`,
          args: ["legacy-valid", validVisitor, '["remote","hybrid"]'],
        },
        {
          sql: `INSERT INTO candidate_profiles (
            id, visitor_id, current_role, current_salary_cents,
            preferred_salary_minimum_cents, preferred_salary_target_cents,
            preferred_work_arrangements, target_role_families
          ) VALUES (?, ?, 'Support Analyst', 5000000, 7000000, 8000000, ?, '["Implementation"]')`,
          args: ["legacy-invalid", invalidVisitor, '["remote","unclear"]'],
        },
      ]);

      await migrate(drizzle(client), { migrationsFolder: migrationSource });
      const migrated = await client.execute(
        "SELECT id, preferred_work_modes, missing_salary_policy FROM candidate_profiles WHERE id IN ('legacy-valid', 'legacy-invalid') ORDER BY id",
      );
      expect(migrated.rows).toEqual([
        expect.objectContaining({
          id: "legacy-invalid",
          preferred_work_modes: '["remote","hybrid","on_site"]',
          missing_salary_policy: "explore_only",
        }),
        expect.objectContaining({
          id: "legacy-valid",
          preferred_work_modes: '["remote","hybrid"]',
          missing_salary_policy: "explore_only",
        }),
      ]);
      const migratedTargets = await client.execute(
        "SELECT candidate_profile_id, readiness FROM candidate_role_targets WHERE candidate_profile_id IN ('legacy-valid', 'legacy-invalid') ORDER BY candidate_profile_id, priority_rank",
      );
      expect(migratedTargets.rows).toEqual([
        expect.objectContaining({
          candidate_profile_id: "legacy-invalid",
          readiness: "ready_now",
        }),
        expect.objectContaining({
          candidate_profile_id: "legacy-valid",
          readiness: "ready_now",
        }),
      ]);

      await expect(
        client.execute({
          sql: "UPDATE candidate_profiles SET commute_radius_miles = 251 WHERE id = ?",
          args: ["legacy-valid"],
        }),
      ).rejects.toThrow();
      await expect(
        client.execute({
          sql: "UPDATE candidate_profiles SET work_authorization = 'invalid' WHERE id = ?",
          args: ["legacy-valid"],
        }),
      ).rejects.toThrow();
      await expect(
        client.execute({
          sql: "UPDATE candidate_profiles SET missing_salary_policy = 'invalid' WHERE id = ?",
          args: ["legacy-valid"],
        }),
      ).rejects.toThrow();
    } finally {
      client.close();
    }
  });
});
