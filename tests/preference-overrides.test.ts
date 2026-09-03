import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const databasePath = join(
  tmpdir(),
  `jobswipe-preference-overrides-${randomUUID()}.db`,
);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

const visitorA = randomUUID();
const visitorB = randomUUID();
const profileA = randomUUID();
const profileB = randomUUID();

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let visitorFeedQueues: typeof import("@/db/schema")["visitorFeedQueues"];
let listPreferenceOverridesForVisitor: typeof import("@/features/personalization/preference-overrides")["listPreferenceOverridesForVisitor"];
let updatePreferenceOverrideForVisitor: typeof import("@/features/personalization/preference-overrides")["updatePreferenceOverrideForVisitor"];

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schema = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const service = await import(
    "@/features/personalization/preference-overrides"
  );

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  visitorFeedQueues = schema.visitorFeedQueues;
  listPreferenceOverridesForVisitor = service.listPreferenceOverridesForVisitor;
  updatePreferenceOverrideForVisitor =
    service.updatePreferenceOverrideForVisitor;

  await migrateDatabase();
  await db.insert(schema.visitors).values([
    { id: visitorA, kind: "guest" },
    { id: visitorB, kind: "guest" },
  ]);
  await db.insert(schema.candidateProfiles).values([
    {
      id: profileA,
      visitorId: visitorA,
      currentRole: "Support Analyst",
      currentSalaryCents: 5_000_000,
      preferredSalaryMinimumCents: 6_000_000,
      preferredSalaryTargetCents: 8_000_000,
    },
    {
      id: profileB,
      visitorId: visitorB,
      currentRole: "Support Analyst",
      currentSalaryCents: 5_000_000,
      preferredSalaryMinimumCents: 6_000_000,
      preferredSalaryTargetCents: 8_000_000,
    },
  ]);
  const generatedAt = new Date("2026-08-19T12:00:00.000Z");
  const expiresAt = new Date("2026-08-19T18:00:00.000Z");
  await db.insert(schema.visitorFeedQueues).values([
    {
      visitorId: visitorA,
      candidateProfileId: profileA,
      profileRevision: 1,
      queueVersion: "AAAAAAAAAAAAAAAAAAAAAAAA",
      recommenderVersion: "personal-radar-v2",
      generatedAt,
      expiresAt,
      updatedAt: generatedAt,
    },
    {
      visitorId: visitorB,
      candidateProfileId: profileB,
      profileRevision: 1,
      queueVersion: "BBBBBBBBBBBBBBBBBBBBBBBB",
      recommenderVersion: "personal-radar-v2",
      generatedAt,
      expiresAt,
      updatedAt: generatedAt,
    },
  ]);
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe("visitor preference overrides", () => {
  it("validates feature keys, isolates visitors, and invalidates only the changed queue", async () => {
    await expect(
      updatePreferenceOverrideForVisitor(visitorA, {
        action: "more",
        featureKey: "not-a-feature",
      }),
    ).rejects.toThrow("not valid");

    const changedAt = new Date("2026-08-19T12:30:00.000Z");
    const saved = await updatePreferenceOverrideForVisitor(
      visitorA,
      { action: "more", featureKey: "arrangement:remote" },
      changedAt,
    );
    expect(saved).toMatchObject({
      changed: true,
      overrides: [
        { featureKey: "arrangement:remote", mode: "more" },
      ],
    });
    expect(await listPreferenceOverridesForVisitor(visitorB)).toEqual([]);

    const [queueA] = await db
      .select({ invalidatedAt: visitorFeedQueues.invalidatedAt })
      .from(visitorFeedQueues)
      .where(eq(visitorFeedQueues.visitorId, visitorA));
    const [queueB] = await db
      .select({ invalidatedAt: visitorFeedQueues.invalidatedAt })
      .from(visitorFeedQueues)
      .where(eq(visitorFeedQueues.visitorId, visitorB));
    expect(queueA?.invalidatedAt).toEqual(changedAt);
    expect(queueB?.invalidatedAt).toBeNull();
  });

  it("treats duplicate updates as no-ops and supports per-feature and all-feature reset", async () => {
    const duplicate = await updatePreferenceOverrideForVisitor(visitorA, {
      action: "more",
      featureKey: "arrangement:remote",
    });
    expect(duplicate.changed).toBe(false);

    await updatePreferenceOverrideForVisitor(visitorA, {
      action: "less",
      featureKey: "title:engineer",
    });
    expect(await listPreferenceOverridesForVisitor(visitorA)).toHaveLength(2);

    const resetOne = await updatePreferenceOverrideForVisitor(visitorA, {
      action: "reset",
      featureKey: "arrangement:remote",
    });
    expect(resetOne.overrides).toEqual([
      expect.objectContaining({ featureKey: "title:engineer", mode: "less" }),
    ]);

    const resetAll = await updatePreferenceOverrideForVisitor(visitorA, {
      action: "reset_all",
    });
    expect(resetAll).toMatchObject({ changed: true, overrides: [] });
  });
});
