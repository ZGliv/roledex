import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { OWNER_VISITOR_ID } from "@/features/auth/identity";

const databasePath = join(tmpdir(), `jobswipe-legacy-migration-${randomUUID()}.db`);
const migrationFolder = resolve(process.cwd(), "drizzle");
let client: Client;

async function applyMigration(name: string) {
  const source = readFileSync(join(migrationFolder, name), "utf8");
  const statements = source
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await client.execute(statement);
}

beforeAll(async () => {
  client = createClient({ url: `file:${databasePath}` });
  await client.execute("PRAGMA foreign_keys = ON");
  await applyMigration("0000_initial.sql");
  await applyMigration("0001_medical_freak.sql");
  await applyMigration("0002_faithful_swordsman.sql");

  await client.execute({
    sql: `INSERT INTO candidate_profiles (
      id, current_role, current_salary_cents,
      preferred_salary_minimum_cents, preferred_salary_target_cents,
      preferred_work_arrangements, preferred_industries, target_role_families,
      strengths, weaknesses, interests, education, skills,
      career_goals, interview_concerns, deal_breakers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "legacy-profile",
      "Legacy owner role",
      5_000_000,
      6_000_000,
      8_000_000,
      '["remote"]',
      '["Technology"]',
      '["Implementation"]',
      "[]",
      "[]",
      "[]",
      "[]",
      '["Communication"]',
      '["Grow"]',
      "[]",
      "[]",
    ],
  });
  await client.execute({
    sql: `INSERT INTO candidate_profiles (
      id, current_role, current_salary_cents,
      preferred_salary_minimum_cents, preferred_salary_target_cents,
      preferred_work_arrangements, preferred_industries, target_role_families,
      strengths, weaknesses, interests, education, skills,
      career_goals, interview_concerns, deal_breakers
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      "legacy-profile-newer",
      "Newer legacy owner role",
      5_500_000,
      6_500_000,
      8_500_000,
      '["hybrid"]',
      '["Technology"]',
      '["Customer success"]',
      "[]",
      "[]",
      "[]",
      "[]",
      '["Communication"]',
      '["Grow"]',
      "[]",
      "[]",
    ],
  });
  await client.execute(
    "UPDATE candidate_profiles SET updated_at = 1000 WHERE id = 'legacy-profile'",
  );
  await client.execute(
    "UPDATE candidate_profiles SET updated_at = 2000 WHERE id = 'legacy-profile-newer'",
  );
  await client.execute(
    "INSERT INTO job_listings (id, normalized_title, normalized_company, current_decision) VALUES ('saved-job', 'saved role', 'saved co', 'saved')",
  );
  await client.execute(
    "INSERT INTO job_listings (id, normalized_title, normalized_company, current_decision) VALUES ('unseen-job', 'unseen role', 'unseen co', 'unseen')",
  );
  await client.execute(
    "INSERT INTO job_decision_events (id, job_listing_id, decision, note) VALUES ('legacy-event', 'saved-job', 'saved', 'legacy note')",
  );

  await applyMigration("0003_reflective_starjammers.sql");
});

afterAll(() => {
  client.close();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("legacy visitor migration", () => {
  it("backfills the owner profile, decisions, and events without inventing unseen rows", async () => {
    const visitor = await client.execute(
      "SELECT id, kind FROM visitors WHERE id = ?",
      [OWNER_VISITOR_ID],
    );
    const profile = await client.execute(
      "SELECT visitor_id FROM candidate_profiles WHERE id = 'legacy-profile'",
    );
    const activeProfiles = await client.execute(
      "SELECT id FROM candidate_profiles WHERE is_active = 1 ORDER BY id",
    );
    const event = await client.execute(
      "SELECT visitor_id FROM job_decision_events WHERE id = 'legacy-event'",
    );
    const states = await client.execute(
      "SELECT job_listing_id, current_decision FROM visitor_job_states ORDER BY job_listing_id",
    );

    expect(visitor.rows).toEqual([
      expect.objectContaining({ id: OWNER_VISITOR_ID, kind: "owner" }),
    ]);
    expect(profile.rows[0]?.visitor_id).toBe(OWNER_VISITOR_ID);
    expect(activeProfiles.rows).toEqual([
      expect.objectContaining({ id: "legacy-profile-newer" }),
    ]);
    expect(event.rows[0]?.visitor_id).toBe(OWNER_VISITOR_ID);
    expect(states.rows).toEqual([
      expect.objectContaining({
        job_listing_id: "saved-job",
        current_decision: "saved",
      }),
    ]);
  });

  it("enforces visitor ownership on future profile and event writes", async () => {
    await expect(
      client.execute({
        sql: `INSERT INTO candidate_profiles (
          id, current_role, current_salary_cents,
          preferred_salary_minimum_cents, preferred_salary_target_cents
        ) VALUES (?, ?, ?, ?, ?)`,
        args: ["invalid-profile", "Missing visitor", 0, 0, 0],
      }),
    ).rejects.toThrow("candidate_profiles.visitor_id is required");

    await expect(
      client.execute(
        "INSERT INTO job_decision_events (id, job_listing_id, decision) VALUES ('invalid-event', 'saved-job', 'saved')",
      ),
    ).rejects.toThrow("job_decision_events.visitor_id is required");
  });

  it("leaves no broken foreign keys", async () => {
    const check = await client.execute("PRAGMA foreign_key_check");
    const profileKeys = await client.execute(
      "PRAGMA foreign_key_list(candidate_profiles)",
    );
    const eventKeys = await client.execute(
      "PRAGMA foreign_key_list(job_decision_events)",
    );
    expect(check.rows).toEqual([]);
    expect(profileKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "visitors", on_delete: "CASCADE" }),
      ]),
    );
    expect(eventKeys.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "visitors", on_delete: "CASCADE" }),
      ]),
    );
  });
});
