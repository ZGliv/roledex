import "server-only";

type DatabaseReleaseEnvironment = {
  JOBSWIPE_PRODUCTION_DATABASE_READY?: string;
  VERCEL_ENV?: string;
};

function currentDatabaseReleaseEnvironment(): DatabaseReleaseEnvironment {
  return {
    JOBSWIPE_PRODUCTION_DATABASE_READY:
      process.env.JOBSWIPE_PRODUCTION_DATABASE_READY,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

/**
 * Production is deliberately fail-closed until its schema migration has been
 * verified. Preview and local builds continue to use their configured
 * databases so this release switch cannot interrupt development.
 */
export function productionDatabaseReleaseBlocked(
  environment: DatabaseReleaseEnvironment = currentDatabaseReleaseEnvironment(),
) {
  return (
    environment.VERCEL_ENV === "production" &&
    environment.JOBSWIPE_PRODUCTION_DATABASE_READY !== "true"
  );
}

export type DatabaseReleaseLoad<T> =
  | { ready: false }
  | { ready: true; value: T };

/** Run a database-backed loader only after the production release gate opens. */
export async function loadWhenProductionDatabaseReady<T>(
  loader: () => Promise<T>,
  environment: DatabaseReleaseEnvironment = currentDatabaseReleaseEnvironment(),
): Promise<DatabaseReleaseLoad<T>> {
  if (productionDatabaseReleaseBlocked(environment)) return { ready: false };
  return { ready: true, value: await loader() };
}
