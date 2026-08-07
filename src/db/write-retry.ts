const WRITE_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1_600] as const;

let localWriteQueue: Promise<void> = Promise.resolve();

function retryableContention(error: unknown) {
  if (!(error instanceof Error)) return false;
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  return (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_BUSY_SNAPSHOT" ||
    /database is locked/i.test(error.message)
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/** Retries an entire idempotent write transaction after bounded SQLite contention. */
export async function withDatabaseWriteRetry<T>(operation: () => Promise<T>) {
  const predecessor = localWriteQueue;
  let release: () => void = () => undefined;
  localWriteQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await predecessor.catch(() => undefined);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const delay = WRITE_RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !retryableContention(error)) throw error;
        await wait(delay);
      }
    }
  } finally {
    release();
  }
}
