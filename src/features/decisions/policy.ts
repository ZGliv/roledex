import type { JobDecision } from "@/db/schema";

export const deckDecisionValues = ["saved", "skipped", "stretch", "learn_first"] as const;
export type DeckDecision = (typeof deckDecisionValues)[number];

const terminalDecisions = new Set<JobDecision>(["rejected", "offer"]);

export function canRecordDecision(current: JobDecision, next: JobDecision) {
  if (current === next) return false;
  if (terminalDecisions.has(current) && next === "unseen") return false;
  return true;
}
