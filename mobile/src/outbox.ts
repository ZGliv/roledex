import type {
  InteractionEvent,
  InteractionResult,
} from "@/features/api-v2/contracts";

const OUTBOX_KEY = "jobswipe:mobile-outbox:v2";

function readOutbox() {
  try {
    const value = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]") as unknown;
    return Array.isArray(value) ? (value as InteractionEvent[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(events: readonly InteractionEvent[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(events));
}

export function enqueueInteraction(event: InteractionEvent) {
  const events = readOutbox();
  if (!events.some((candidate) => candidate.id === event.id)) {
    writeOutbox([...events, event]);
  }
}

export function pendingInteractions() {
  return readOutbox();
}

export function reconcileInteractions(results: readonly InteractionResult[]) {
  const resultById = new Map(results.map((result) => [result.id, result]));
  writeOutbox(
    readOutbox().filter((event) => {
      const result = resultById.get(event.id);
      return !result || (result.status === "rejected" && result.retryable);
    }),
  );
}

export function clearPendingInteractions() {
  localStorage.removeItem(OUTBOX_KEY);
}
