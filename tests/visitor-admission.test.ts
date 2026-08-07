import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { OWNER_VISITOR_ID } from "@/features/auth/identity";

vi.mock("server-only", () => ({}));

const databasePath = join(tmpdir(), `jobswipe-admission-${randomUUID()}.db`);
process.env.DATABASE_URL = databasePath;
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
process.env.VERCEL = "";

let closeDatabase: typeof import("@/db/client")["closeDatabase"];
let db: typeof import("@/db/client")["db"];
let candidateProfiles: typeof import("@/db/schema")["candidateProfiles"];
let visitors: typeof import("@/db/schema")["visitors"];
let admitVisitorWorkspace: typeof import("@/features/candidate/visitor-admission")["admitVisitorWorkspace"];
let GuestWorkspaceCapacityError: typeof import("@/features/candidate/visitor-admission")["GuestWorkspaceCapacityError"];

async function insertGuests(count: number, createdAt: Date) {
  const rows = Array.from({ length: count }, () => ({
    id: randomUUID(),
    kind: "guest" as const,
    createdAt,
    lastSeenAt: createdAt,
  }));
  if (rows.length > 0) await db.insert(visitors).values(rows);
  return rows;
}

beforeAll(async () => {
  const clientModule = await import("@/db/client");
  const schemaModule = await import("@/db/schema");
  const { migrateDatabase } = await import("@/db/migrate");
  const admission = await import("@/features/candidate/visitor-admission");

  closeDatabase = clientModule.closeDatabase;
  db = clientModule.db;
  candidateProfiles = schemaModule.candidateProfiles;
  visitors = schemaModule.visitors;
  admitVisitorWorkspace = admission.admitVisitorWorkspace;
  GuestWorkspaceCapacityError = admission.GuestWorkspaceCapacityError;
  await migrateDatabase();
});

afterAll(() => {
  closeDatabase();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
});

describe.sequential("guest workspace admission", () => {
  it("allows 30 new guests per hour and removes the 31st visitor row", async () => {
    const now = new Date("2026-08-05T16:00:00.000Z");
    await insertGuests(29, now);
    const allowedVisitorId = randomUUID();
    await db.insert(visitors).values({
      id: allowedVisitorId,
      kind: "guest",
      createdAt: now,
      lastSeenAt: now,
    });

    await expect(
      admitVisitorWorkspace(allowedVisitorId, { enforce: true, now }),
    ).resolves.toBeUndefined();
    const { STARTER_PROFILE, STARTER_PROFILE_FINGERPRINT } = await import(
      "@/features/candidate/starter-profile"
    );
    await db.insert(candidateProfiles).values({
      visitorId: allowedVisitorId,
      ...STARTER_PROFILE,
      location: null,
      relocationPreference: null,
      fingerprint: STARTER_PROFILE_FINGERPRINT,
    });

    const deniedVisitorId = randomUUID();
    await db.insert(visitors).values({
      id: deniedVisitorId,
      kind: "guest",
      createdAt: now,
      lastSeenAt: now,
    });
    await expect(
      admitVisitorWorkspace(deniedVisitorId, { enforce: true, now }),
    ).rejects.toBeInstanceOf(GuestWorkspaceCapacityError);

    const deniedRow = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.id, deniedVisitorId));
    expect(deniedRow).toHaveLength(0);

    const unadmittedOverflow = await insertGuests(1, now);
    await expect(
      admitVisitorWorkspace(allowedVisitorId, { enforce: true, now }),
    ).resolves.toBeUndefined();
    const existingWorkspaceVisitor = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.id, allowedVisitorId));
    expect(existingWorkspaceVisitor).toHaveLength(1);
    await db
      .delete(visitors)
      .where(eq(visitors.id, unadmittedOverflow[0].id));
  });

  it("allows 200 new guests per day and removes the 201st visitor row", async () => {
    const now = new Date("2026-08-07T16:00:00.000Z");
    const earlierToday = new Date(now.getTime() - 2 * 60 * 60 * 1_000);
    await insertGuests(199, earlierToday);
    const allowedVisitorId = randomUUID();
    await db.insert(visitors).values({
      id: allowedVisitorId,
      kind: "guest",
      createdAt: now,
      lastSeenAt: now,
    });

    await expect(
      admitVisitorWorkspace(allowedVisitorId, { enforce: true, now }),
    ).resolves.toBeUndefined();

    const deniedVisitorId = randomUUID();
    await db.insert(visitors).values({
      id: deniedVisitorId,
      kind: "guest",
      createdAt: now,
      lastSeenAt: now,
    });
    await expect(
      admitVisitorWorkspace(deniedVisitorId, { enforce: true, now }),
    ).rejects.toBeInstanceOf(GuestWorkspaceCapacityError);

    const deniedRow = await db
      .select({ id: visitors.id })
      .from(visitors)
      .where(eq(visitors.id, deniedVisitorId));
    expect(deniedRow).toHaveLength(0);
  });

  it("does not constrain local development or the owner workspace", async () => {
    const now = new Date("2026-08-07T16:00:00.000Z");
    const localVisitorId = randomUUID();
    await db.insert(visitors).values({
      id: localVisitorId,
      kind: "guest",
      createdAt: now,
      lastSeenAt: now,
    });

    await expect(
      admitVisitorWorkspace(localVisitorId, { enforce: false, now }),
    ).resolves.toBeUndefined();
    await expect(
      admitVisitorWorkspace(OWNER_VISITOR_ID, { enforce: true, now }),
    ).resolves.toBeUndefined();
  });
});
