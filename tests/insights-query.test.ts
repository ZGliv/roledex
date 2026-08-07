import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getMarketInsights fit-run selection", () => {
  it("uses only the newest current-revision fit for the exact active profile revision", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", ":memory:");
    vi.stubEnv("TURSO_DATABASE_URL", "");
    vi.stubEnv("TURSO_AUTH_TOKEN", "");
    vi.stubEnv("VERCEL", "");

    const { client, closeDatabase } = await import("@/db/client");

    try {
      for (const statement of [
        `create table candidate_profiles (
          id text primary key,
          is_active integer not null,
          revision integer not null,
          skills text not null
        )`,
        `create table job_listings (
          id text primary key,
          current_revision_id text,
          lifecycle_status text not null
        )`,
        `create table job_revisions (
          id text primary key,
          title text not null,
          company text not null,
          work_arrangement text not null,
          salary_minimum_cents integer,
          salary_maximum_cents integer,
          salary_currency text not null,
          salary_period text not null,
          salary_source text not null,
          technologies text not null
        )`,
        `create table fit_score_runs (
          id text primary key,
          job_revision_id text not null,
          candidate_profile_id text not null,
          candidate_snapshot text not null,
          deterministic_score integer not null,
          coverage_bps integer not null,
          created_at integer not null
        )`,
      ]) {
        await client.execute(statement);
      }

      await client.execute({
        sql: "insert into candidate_profiles values (?, ?, ?, ?), (?, ?, ?, ?)",
        args: [
          "profile-active",
          1,
          4,
          JSON.stringify(["SQL"]),
          "profile-other",
          0,
          4,
          JSON.stringify(["Python"]),
        ],
      });

      await client.execute({
        sql: "insert into job_listings values (?, ?, ?), (?, ?, ?), (?, ?, ?)",
        args: [
          "listing-a",
          "revision-a-current",
          "active",
          "listing-b",
          "revision-b-current",
          "active",
          "listing-c",
          "revision-c-current",
          "expired",
        ],
      });

      const insertRevision = async (input: {
        company: string;
        id: string;
        title: string;
      }) => {
        await client.execute({
          sql: `insert into job_revisions (
            id, title, company, work_arrangement, salary_minimum_cents,
            salary_maximum_cents, salary_currency, salary_period,
            salary_source, technologies
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            input.id,
            input.title,
            input.company,
            "remote",
            null,
            null,
            "USD",
            "year",
            "unknown",
            JSON.stringify(["SQL"]),
          ],
        });
      };

      await insertRevision({
        id: "revision-a-current",
        company: "Acme",
        title: "Implementation Specialist",
      });
      await insertRevision({
        id: "revision-a-old",
        company: "Acme",
        title: "Old title that must not count",
      });
      await insertRevision({
        id: "revision-b-current",
        company: "Beta",
        title: "Customer Success Engineer",
      });
      await insertRevision({
        id: "revision-c-current",
        company: "Expired Co",
        title: "Inactive role",
      });

      const insertFit = async (input: {
        candidateProfileId?: string;
        createdAt: number;
        id: string;
        jobRevisionId?: string;
        profileRevision: number;
        score: number;
      }) => {
        await client.execute({
          sql: `insert into fit_score_runs (
            id, job_revision_id, candidate_profile_id, candidate_snapshot,
            deterministic_score, coverage_bps, created_at
          ) values (?, ?, ?, ?, ?, ?, ?)`,
          args: [
            input.id,
            input.jobRevisionId ?? "revision-a-current",
            input.candidateProfileId ?? "profile-active",
            JSON.stringify({ revision: input.profileRevision }),
            input.score,
            7_500,
            input.createdAt,
          ],
        });
      };

      await insertFit({ id: "run-current-old", createdAt: 100, profileRevision: 4, score: 60 });
      await insertFit({ id: "run-current-a", createdAt: 200, profileRevision: 4, score: 70 });
      await insertFit({ id: "run-current-z", createdAt: 200, profileRevision: 4, score: 82 });
      await insertFit({ id: "run-stale-newer", createdAt: 400, profileRevision: 3, score: 99 });
      await insertFit({
        id: "run-other-profile",
        candidateProfileId: "profile-other",
        createdAt: 500,
        profileRevision: 4,
        score: 100,
      });
      await insertFit({
        id: "run-old-job-revision",
        createdAt: 600,
        jobRevisionId: "revision-a-old",
        profileRevision: 4,
        score: 100,
      });
      await insertFit({
        id: "run-b-stale-only",
        createdAt: 300,
        jobRevisionId: "revision-b-current",
        profileRevision: 3,
        score: 95,
      });
      await insertFit({
        id: "run-inactive",
        createdAt: 300,
        jobRevisionId: "revision-c-current",
        profileRevision: 4,
        score: 100,
      });

      const { getMarketInsights } = await import("@/features/insights/queries");
      const insights = await getMarketInsights({
        id: "profile-active",
        revision: 4,
        skills: ["SQL"],
      });

      expect(insights.sampleSize).toBe(2);
      expect(insights.fit).toMatchObject({
        averageCoveragePercent: 75,
        averageScore: 82,
        scoredCount: 1,
      });
      expect(insights.fit.bands.map(({ count, key }) => [key, count])).toEqual([
        ["high", 1],
        ["promising", 0],
        ["stretch", 0],
        ["low", 0],
      ]);
      expect(insights.companies).toEqual([
        { count: 1, label: "Acme", percentage: 50 },
        { count: 1, label: "Beta", percentage: 50 },
      ]);
    } finally {
      closeDatabase();
    }
  });
});
