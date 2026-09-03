import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import HomePage from "@/app/page";
import ProfilePage from "@/app/profile/page";
import SavedJobsPage from "@/app/saved/page";
import { ResilientFeedFallback } from "@/features/jobs/components/resilient-feed-fallback";

const originalVercelEnvironment = process.env.VERCEL_ENV;
const originalProductionDatabaseReady =
  process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restoreEnvironment("VERCEL_ENV", originalVercelEnvironment);
  restoreEnvironment(
    "JOBSWIPE_PRODUCTION_DATABASE_READY",
    originalProductionDatabaseReady,
  );
});

describe("production database fallback pages", () => {
  async function renderHomeFeed() {
    const page = HomePage();
    const suspenseChild = page.props.children as ReactElement;
    return (suspenseChild.type as () => Promise<ReactElement>)();
  }

  it.each([
    ["For You", renderHomeFeed],
    ["Saved", SavedJobsPage],
    ["Profile", ProfilePage],
  ] as const)(
    "renders the existing local-device surface for %s before importing database loaders",
    async (_label, renderPage) => {
      process.env.VERCEL_ENV = "production";
      delete process.env.JOBSWIPE_PRODUCTION_DATABASE_READY;

      const result = await renderPage();

      expect(result.type).toBe(ResilientFeedFallback);
    },
  );
});
