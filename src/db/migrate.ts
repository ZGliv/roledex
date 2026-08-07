import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/libsql/migrator";

import { closeDatabase, db, ensureDatabaseReady } from "./client";

const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function migrateDatabase(): Promise<void> {
  await ensureDatabaseReady();
  await migrate(db, { migrationsFolder });
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  migrateDatabase()
    .then(() => {
      console.log("Applied database migrations.");
    })
    .catch((error: unknown) => {
      console.error("Database migration failed.", error);
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
