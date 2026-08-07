import { defineConfig } from "drizzle-kit";

// Generation-only configuration. Remote migrations use `src/db/migrate.ts`
// with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN through the libSQL driver.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/jobswipe.db",
  },
  strict: true,
  verbose: true,
});
