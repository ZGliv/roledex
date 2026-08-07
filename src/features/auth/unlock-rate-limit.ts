import "server-only";

const ATTEMPT_WINDOW_MS = 15 * 60 * 1_000;
const BLOCK_DURATION_MS = 15 * 60 * 1_000;
const MAX_FAILURES_PER_WINDOW = 8;

type UnlockRateLimitState = {
  blockedUntil: number;
  failures: number;
  windowStartedAt: number;
};

type AuthGlobals = typeof globalThis & {
  jobswipeUnlockRateLimit?: UnlockRateLimitState;
};

const authGlobals = globalThis as AuthGlobals;

function currentState(now: number) {
  const existing = authGlobals.jobswipeUnlockRateLimit;
  if (!existing || now - existing.windowStartedAt >= ATTEMPT_WINDOW_MS) {
    const fresh = { blockedUntil: 0, failures: 0, windowStartedAt: now };
    authGlobals.jobswipeUnlockRateLimit = fresh;
    return fresh;
  }
  return existing;
}

/** A hot-instance guard around the hidden shared-key endpoint. The production
 * key is still required to be high entropy; this prevents a single function
 * instance from becoming an unbounded password oracle. */
export function adminUnlockAttemptAllowed(now = Date.now()) {
  return currentState(now).blockedUntil <= now;
}

export function recordAdminUnlockFailure(now = Date.now()) {
  const state = currentState(now);
  state.failures += 1;
  if (state.failures >= MAX_FAILURES_PER_WINDOW) {
    state.blockedUntil = now + BLOCK_DURATION_MS;
  }
}

export function clearAdminUnlockFailures() {
  delete authGlobals.jobswipeUnlockRateLimit;
}
