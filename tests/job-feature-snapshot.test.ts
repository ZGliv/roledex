import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
  JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
  jobFeatureSnapshotInsertValues,
  normalizeJobFeatureSnapshot,
} from "@/features/jobs/feature-snapshot";

vi.mock("server-only", () => ({}));

const baseRevision: Parameters<typeof normalizeJobFeatureSnapshot>[0] = {
  id: "revision-feature-unit",
  contentHash: "content-feature-unit",
  title: "Associate Solutions Engineer",
  company: "Northstar Systems",
  location: "Remote — United States",
  workArrangement: "remote",
  salaryMinimumCents: 5_000,
  salaryMaximumCents: 7_000,
  salaryCurrency: "USD",
  salaryPeriod: "hour",
  salarySource: "employer_posted",
  employmentType: "full_time",
  roleSummary: "Help customers launch technical products.",
  postedAt: new Date("2026-08-18T12:00:00.000Z"),
  retrievedAt: new Date("2026-08-19T12:00:00.000Z"),
  seniority: "entry",
  yearsExperienceMinimum: 1,
  yearsExperienceMaximum: 2,
  technologies: ["REST APIs"],
  responsibilities: [
    "Lead customer implementation planning and technical discovery.",
  ],
  requiredQualifications: [
    "Must be authorized to work in the United States; we will not sponsor visas.",
  ],
  preferredQualifications: ["Experience with REST APIs is preferred."],
  travelRequirement: "20% — Travel up to 20% for customer launches.",
  industry: "B2B software",
  cleanedDescription:
    "Must be authorized to work in the United States. We will not sponsor visas. Travel up to 20%.",
  parseWarnings: [],
  fieldEvidence: {
    salary: {
      confidence: "high",
      source: "deterministic",
      value: "$50–$70/hour",
    },
    workArrangement: {
      confidence: "high",
      source: "deterministic",
      value: "remote",
    },
  },
};

describe("deterministic catalog feature normalization", () => {
  it("normalizes annual compensation, role probabilities, eligibility, and freshness", () => {
    const snapshot = normalizeJobFeatureSnapshot(baseRevision);

    expect(snapshot).toMatchObject({
      version: 1,
      compensation: {
        annualMinimumCents: 10_400_000,
        annualMaximumCents: 14_560_000,
        currency: "USD",
        source: "employer_posted",
        confidence: "high",
      },
      experience: {
        minimumYears: 1,
        maximumYears: 2,
        seniority: "entry",
      },
      workplace: {
        authorization: "us_work_authorization_required",
        sponsorship: "not_available",
        travelPercent: 20,
      },
      freshness: {
        postedAt: "2026-08-18T12:00:00.000Z",
        retrievedAt: "2026-08-19T12:00:00.000Z",
        isDuplicate: false,
      },
      extractionConfidence: "high",
    });
    expect(snapshot.roleFamilies).toContainEqual({
      family: "solutions_engineering",
      probability: 0.96,
    });
    expect(snapshot.responsibilities).toEqual([
      "Lead customer implementation planning and technical discovery.",
    ]);
  });

  it("is stable for the same immutable revision and explicitly versioned", () => {
    const first = jobFeatureSnapshotInsertValues(baseRevision);
    const second = jobFeatureSnapshotInsertValues({ ...baseRevision });

    expect(second).toEqual(first);
    expect(first.schemaVersion).toBe(JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION);
    expect(first.extractorVersion).toBe(
      JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
    );
    expect(first.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

const databasePath = join(
  tmpdir(),
  `jobswipe-feature-snapshot-${randomUUID()}.db`,
);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let client: typeof import("@/db/client")["client"];
let db: typeof import("@/db/client")["db"];
let jobFeatureSnapshots: typeof import("@/db/schema")["jobFeatureSnapshots"];
let jobListings: typeof import("@/db/schema")["jobListings"];
let jobRevisions: typeof import("@/db/schema")["jobRevisions"];
let jobId: string;
let revisionId: string;

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const { seedDatabase } = await import("@/db/seed");
  const { upsertSourcedJob } = await import("@/features/jobs/service");

  closeDatabase = clientModule.closeDatabase;
  client = clientModule.client;
  db = clientModule.db;
  jobFeatureSnapshots = schema.jobFeatureSnapshots;
  jobListings = schema.jobListings;
  jobRevisions = schema.jobRevisions;

  await migrateDatabase();
  await seedDatabase();
  const input = {
    title: "Associate Solutions Engineer",
    company: "Snapshot Integration Co",
    location: "Remote — United States",
    sourceName: "Employer careers",
    sourceType: "manual_url" as const,
    sourceUrl: "https://example.com/jobs/snapshot-integration",
    contentHash: "snapshot-integration-content-v1",
    deduplicationKey: "snapshot-integration-dedup-v1",
    salary: {
      minimumCents: 5_000,
      maximumCents: 7_000,
      currency: "USD",
      period: "hour" as const,
    },
    salarySourceHint: "employer_posted" as const,
    descriptionRaw:
      "Snapshot Integration Co is hiring an Associate Solutions Engineer. The employer-posted salary is $50 to $70 per hour. Help customers with technical discovery, APIs, implementation planning, and launches. One year of relevant experience is required. Candidates must be authorized to work in the United States; we will not sponsor visas. Travel up to 20%.",
  };
  const created = await upsertSourcedJob(input);
  await upsertSourcedJob(input);
  jobId = created.jobId;
  revisionId = created.revisionId;
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("catalog feature snapshot persistence", () => {
  it("migrates the immutable composite key and persists an unchanged revision once", async () => {
    const columns = await client.execute(
      "PRAGMA table_info(job_feature_snapshots)",
    );
    expect(
      columns.rows
        .filter((row) => Number(row.pk) > 0)
        .map((row) => row.name),
    ).toEqual(["job_revision_id", "schema_version", "extractor_version"]);

    const rows = await db
      .select()
      .from(jobFeatureSnapshots)
      .where(
        and(
          eq(jobFeatureSnapshots.jobRevisionId, revisionId),
          eq(
            jobFeatureSnapshots.schemaVersion,
            JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
          ),
          eq(
            jobFeatureSnapshots.extractorVersion,
            JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
          ),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.snapshot).toMatchObject({
      version: 1,
      roleFamilies: expect.arrayContaining([
        expect.objectContaining({ family: "solutions_engineering" }),
      ]),
    });
    await expect(
      client.execute({
        sql: `UPDATE job_feature_snapshots
              SET input_hash = ?
              WHERE job_revision_id = ?
                AND schema_version = ?
                AND extractor_version = ?`,
        args: [
          "0".repeat(64),
          revisionId,
          JOB_FEATURE_SNAPSHOT_SCHEMA_VERSION,
          JOB_FEATURE_SNAPSHOT_EXTRACTOR_VERSION,
        ],
      }),
    ).rejects.toThrow(/immutable/i);
  });

  it("feeds the stored snapshot through the current card and API v2 DTO", async () => {
    const { OWNER_VISITOR_ID } = await import("@/features/auth/identity");
    const { apiV2FeedCard } = await import("@/features/api-v2/dto");
    const { getJobCardForVisitor } = await import("@/features/jobs/queries");
    const card = await getJobCardForVisitor(OWNER_VISITOR_ID, jobId);
    if (!card) throw new Error("Expected the snapshotted job card.");
    const apiCard = apiV2FeedCard(card, "feature-test-session", 0);

    expect(card.featureSnapshot).toMatchObject({
      workplace: {
        authorization: "us_work_authorization_required",
        sponsorship: "not_available",
        travelPercent: 20,
      },
    });
    expect(apiCard.features).toEqual(card.featureSnapshot);
    expect(apiCard.features.compensation).toMatchObject({
      annualMinimumCents: 10_400_000,
      annualMaximumCents: 14_560_000,
      source: "employer_posted",
    });
  });

  it("backfills a legacy current revision once and then becomes a no-op", async () => {
    const { backfillJobFeatureSnapshots } = await import(
      "@/features/jobs/feature-snapshot-store"
    );
    await db
      .delete(jobFeatureSnapshots)
      .where(eq(jobFeatureSnapshots.jobRevisionId, revisionId));

    await expect(
      backfillJobFeatureSnapshots({ currentOnly: true, limit: 10 }),
    ).resolves.toMatchObject({ processed: 1, complete: true });
    await expect(
      backfillJobFeatureSnapshots({ currentOnly: true, limit: 10 }),
    ).resolves.toEqual({ processed: 0, complete: true });

    const [listing] = await db
      .select({ currentRevisionId: jobListings.currentRevisionId })
      .from(jobListings)
      .where(eq(jobListings.id, jobId));
    const [revision] = await db
      .select({ id: jobRevisions.id })
      .from(jobRevisions)
      .where(eq(jobRevisions.id, revisionId));
    expect(listing?.currentRevisionId).toBe(revision?.id);
  });
});
