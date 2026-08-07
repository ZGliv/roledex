import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";

import * as schema from "./schema";

const DEFAULT_DATABASE_PATH = "./data/jobswipe.db";

function loadLocalEnvironment(): void {
  const mode = process.env.NODE_ENV ?? "development";
  const candidates = [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"];

  for (const candidate of candidates) {
    try {
      process.loadEnvFile(resolve(process.cwd(), candidate));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
  }
}

function normalizeDatabaseUrl(configuredUrl: string): string {
  const value = configuredUrl.trim();

  if (value === ":memory:" || /^(?:libsql|https?|wss?):\/\//i.test(value)) {
    return value;
  }

  const rawPath = value.startsWith("file:") ? value.slice("file:".length) : value;
  const filePath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
  mkdirSync(dirname(filePath), { recursive: true });
  return pathToFileURL(filePath).href;
}

loadLocalEnvironment();

const tursoDatabaseUrl = process.env.TURSO_DATABASE_URL?.trim();
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (process.env.VERCEL && (!tursoDatabaseUrl || !tursoAuthToken)) {
  throw new Error(
    "JobSwipe requires both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN on Vercel.",
  );
}

const configuredDatabaseUrl =
  tursoDatabaseUrl || process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_PATH;

export const databaseUrl = normalizeDatabaseUrl(configuredDatabaseUrl);

if (databaseUrl.startsWith("libsql://") && !tursoAuthToken) {
  throw new Error("TURSO_AUTH_TOKEN is required for a remote Turso database.");
}

type JobSwipeDatabase = LibSQLDatabase<typeof schema>;

type DatabaseGlobals = typeof globalThis & {
  jobswipeDb?: JobSwipeDatabase;
  jobswipeClient?: Client;
};

const databaseGlobals = globalThis as DatabaseGlobals;

export const client =
  databaseGlobals.jobswipeClient ??
  createClient({
    url: databaseUrl,
    authToken: tursoAuthToken || undefined,
  });

export const db = databaseGlobals.jobswipeDb ?? drizzle(client, { schema });

let readinessPromise: Promise<void> | undefined;

export function ensureDatabaseReady(): Promise<void> {
  readinessPromise ??= client
    .execute("PRAGMA foreign_keys = ON")
    .then(() => undefined);
  return readinessPromise;
}

if (process.env.NODE_ENV === "development") {
  databaseGlobals.jobswipeClient = client;
  databaseGlobals.jobswipeDb = db;
}

export function closeDatabase(): void {
  client.close();
  readinessPromise = undefined;
  delete databaseGlobals.jobswipeDb;
  delete databaseGlobals.jobswipeClient;
}
