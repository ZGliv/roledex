import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookmarkCheck,
  Clock3,
  History,
  Layers3,
  ShieldCheck,
  Target,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  formatSessionDuration,
  ResearchSessionCard,
} from "@/features/sessions/components/research-session-card";
import {
  getRecentResearchSessions,
  RESEARCH_HISTORY_DAYS,
  RESEARCH_HISTORY_EVENT_LIMIT,
} from "@/features/sessions/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Research sessions",
  description: "A focused history of recent JobSwipe research decisions.",
};

const VISIBLE_SESSION_LIMIT = 12;

function formatPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function SummaryMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: typeof History;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-panel rounded-[1.1rem] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[#5f636a]">{label}</p>
        <Icon className="size-4 text-[#656970]" aria-hidden="true" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#15161a]">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-[#666a71]">{detail}</p>
    </div>
  );
}

export default async function ResearchSessionsPage() {
  const view = await getRecentResearchSessions();
  const latestSession = view.sessions[0] ?? null;
  const keptCount = view.savedCount + view.stretchCount + view.learnFirstCount;
  const visibleSessions = view.sessions.slice(0, VISIBLE_SESSION_LIMIT);
  const hiddenSessionCount = view.sessions.length - visibleSessions.length;

  return (
    <div className="ambient-page app-viewport">
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <header className="max-w-3xl">
          <p className="text-sm font-medium text-[#5f636a]">Research sessions</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-[#15161a] sm:text-5xl">
            See how you actually searched.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5f636a] sm:text-base">
            Deck choices are grouped after 30 minutes of inactivity. Notes, undo actions, and later pipeline updates stay out of the totals so each session reflects research—not maintenance.
          </p>
        </header>

        {view.sessions.length === 0 ? (
          <section className="glass-panel mt-8 rounded-[1.25rem] px-6 py-14 text-center sm:py-20">
            <Layers3 className="mx-auto size-5 text-[#6259df]" aria-hidden="true" />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[#202226]">
              No research sessions yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#666a71]">
              {view.ignoredEventCount > 0
                ? "Recent history contains notes or pipeline updates, but no new deck decisions. Save, stretch, learn, or pass on a role to start a session."
                : "Save, stretch, learn, or pass on a role in the deck. Your first focused session will appear here automatically."}
            </p>
            <Link href="/" className={cn(buttonVariants(), "mt-6 px-5")}>
              Browse the deck
              <ArrowRight data-icon="inline-end" />
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Research snapshot">
              <SummaryMetric
                detail="Elapsed time in the latest session"
                icon={Clock3}
                label="Latest duration"
                value={formatSessionDuration(latestSession?.durationMinutes ?? 0)}
              />
              <SummaryMetric
                detail={`Across ${view.sessions.length} ${view.sessions.length === 1 ? "session" : "sessions"}`}
                icon={Layers3}
                label="Roles reviewed"
                value={String(view.reviewedCount)}
              />
              <SummaryMetric
                detail="Saved, apply, stretch, and learn-first choices"
                icon={BookmarkCheck}
                label="Roles kept"
                value={String(keptCount)}
              />
              <SummaryMetric
                detail="Saved, apply, stretch, and learn-first choices"
                icon={Target}
                label="Keep rate"
                value={formatPercentage(view.saveRate)}
              />
            </section>

            {view.reviewedCount < 5 ? (
              <section className="mt-4 border-l-2 border-[#c3923e] py-1 pl-4 text-[#6f4b1b]">
                <div>
                  <h2 className="text-sm font-semibold">Early signal</h2>
                  <p className="mt-1 text-xs leading-5">
                    {view.reviewedCount} reviewed {view.reviewedCount === 1 ? "role is" : "roles are"} enough for a durable log, not a search pattern. The keep rate becomes more useful after at least five decisions.
                  </p>
                </div>
              </section>
            ) : null}

            {view.historyTruncated ? (
              <section className="mt-4 flex gap-3 border-l-2 border-[#7a85c8] py-1 pl-4 text-[#3f4f9b]">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold">Recent history only</h2>
                  <p className="mt-1 text-xs leading-5">
                    The newest {RESEARCH_HISTORY_EVENT_LIMIT} history events are included. The oldest visible session may be partial.
                  </p>
                </div>
              </section>
            ) : null}

            <section className="mt-8" aria-labelledby="recent-sessions-heading">
              <div className="flex items-end justify-between gap-4 px-1">
                <div>
                  <p className="text-xs text-[#666a71]">
                    Last {RESEARCH_HISTORY_DAYS} days
                  </p>
                  <h2 id="recent-sessions-heading" className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#202226]">
                    Recent sessions
                  </h2>
                </div>
                <p className="text-xs font-semibold text-[#666a71]">
                  {view.sessions.length} {view.sessions.length === 1 ? "session" : "sessions"}
                </p>
              </div>

              <ol className="mt-4 grid gap-4 lg:grid-cols-2 lg:items-start">
                {visibleSessions.map((session, index) => (
                  <li key={session.id}>
                    <ResearchSessionCard index={index} session={session} />
                  </li>
                ))}
              </ol>

              {hiddenSessionCount > 0 ? (
                <p className="mt-5 border-t border-black/[0.07] px-4 py-3 text-center text-xs leading-5 text-[#666a71]">
                  Showing the 12 most recent sessions. {hiddenSessionCount} older {hiddenSessionCount === 1 ? "session remains" : "sessions remain"} in the 90-day aggregate above.
                </p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
