import { Clock3, MessageSquareText } from "lucide-react";

import type { JobDecisionHistoryItem } from "@/features/jobs/queries";

const decisionLabels = {
  unseen: "Returned to deck",
  saved: "Saved to shortlist",
  skipped: "Passed",
  stretch: "Marked as stretch",
  learn_first: "Marked learn first",
  apply: "Planning to apply",
  applied: "Applied",
  interview: "Interview stage",
  rejected: "Closed",
  offer: "Offer received",
  archived: "Archived",
} as const;

function formatHistoryDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function JobHistory({ items }: { items: JobDecisionHistoryItem[] }) {
  return (
    <section className="p-2 sm:p-3" aria-labelledby="job-history-heading">
      <div className="flex items-center gap-3">
        <Clock3 className="size-4 text-[#656970]" aria-hidden="true" />
        <div>
          <h2 id="job-history-heading" className="text-base font-semibold tracking-[-0.02em]">Activity & notes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Decisions and notes for this role.</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-5 border-t border-black/[0.07] py-5 text-sm text-muted-foreground">
          No decisions or notes yet.
        </p>
      ) : (
        <ol className="mt-5 space-y-0">
          {items.map((item, index) => (
            <li key={item.id} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
              {index < items.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-black/[0.08]" aria-hidden="true" /> : null}
              <span className="relative z-10 mt-1 size-4 rounded-full border-[5px] border-white bg-[#78808a] ring-1 ring-black/10" aria-hidden="true" />
              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <p className="text-sm font-semibold text-[#292b30]">{decisionLabels[item.decision]}</p>
                  <time dateTime={item.decidedAt} className="text-[11px] text-[#92959b]">{formatHistoryDate(item.decidedAt)}</time>
                </div>
                {item.note ? (
                  <div className="mt-2 flex gap-2 border-l border-black/10 pl-3 text-sm leading-6 text-[#555960]">
                    <MessageSquareText className="mt-1 size-3.5 shrink-0 text-[#7c8087]" aria-hidden="true" />
                    <p>{item.note}</p>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
