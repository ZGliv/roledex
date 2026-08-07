import {
  ArrowRight,
  Building2,
  Clock3,
  Layers3,
} from "lucide-react";

import type { ResearchSession } from "@/features/sessions/aggregate";
import { formatAppDateTime, formatAppTime } from "@/lib/format";

function formatPercentage(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

export function formatSessionDuration(minutes: number) {
  if (minutes === 0) return "Single decision";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function sessionTimeRange(session: ResearchSession) {
  if (session.startAt === session.endAt) return formatAppDateTime(session.startAt);
  return `${formatAppDateTime(session.startAt)} – ${formatAppTime(session.endAt)}`;
}

function TouchList({
  icon: Icon,
  items,
  label,
}: {
  icon: typeof Building2;
  items: ResearchSession["companies"];
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold text-[#666a71]">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="inline-flex max-w-full items-center gap-1.5 border-r border-black/10 pr-2 text-xs font-medium text-[#45484e] last:border-r-0"
          >
            <span className="truncate">{item.label}</span>
            {item.count > 1 ? (
              <span className="shrink-0 text-[10px] tabular-nums text-[#686c73]">
                ×{item.count}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResearchSessionCard({
  index,
  session,
}: {
  index: number;
  session: ResearchSession;
}) {
  const keptCount =
    session.savedCount + session.stretchCount + session.learnFirstCount;
  const outcomes = [
    {
      count: session.savedCount,
      label: "Saved / apply",
    },
    {
      count: session.stretchCount,
      label: "Stretch",
    },
    {
      count: session.learnFirstCount,
      label: "Learn first",
    },
    {
      count: session.passedCount,
      label: "Passed",
    },
  ] as const;

  return (
    <article className="glass-panel overflow-hidden rounded-[1.25rem]">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#666a71]">
              {index === 0 ? "Latest session" : `Session ${index + 1}`}
            </p>
            <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.025em] text-[#202226]">
              <time dateTime={session.startAt}>{sessionTimeRange(session)}</time>
            </h3>
          </div>
          <span className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-xs font-medium text-[#555960]">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {formatSessionDuration(session.durationMinutes)}
          </span>
        </div>

        <div className="mt-5 flex items-end justify-between gap-5 border-b border-black/[0.06] pb-5">
          <div>
            <p className="text-3xl font-semibold tracking-[-0.05em] text-[#15161a]">
              {session.reviewedCount}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#666a71]">
              {session.reviewedCount === 1 ? "role reviewed" : "roles reviewed"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-[-0.04em] text-[#15161a]">
              {formatPercentage(session.saveRate)}
            </p>
            <p className="mt-1 text-xs font-semibold text-[#666a71]">
              keep rate · {keptCount} kept
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 border-y border-black/[0.07] sm:grid-cols-4 sm:divide-x sm:divide-black/[0.07]">
          {outcomes.map((outcome) => (
            <div key={outcome.label} className="border-b border-black/[0.07] px-1 py-3 odd:pr-3 even:border-l even:pl-3 sm:border-b-0 sm:border-l-0 sm:px-3 sm:first:pl-1">
              <dt className="text-[11px] text-[#666a71]">{outcome.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-[#202226]">{outcome.count}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <TouchList icon={Building2} items={session.companies} label="Companies touched" />
          <TouchList icon={Layers3} items={session.roles} label="Roles touched" />
        </div>

        {session.activityDecisionCount > session.reviewedCount ? (
          <p className="mt-4 text-xs leading-5 text-[#666a71]">
            {session.activityDecisionCount} choices were consolidated into {session.reviewedCount} unique {session.reviewedCount === 1 ? "role" : "roles"}; the latest choice for each role is shown.
          </p>
        ) : null}
      </div>

      <div className="flex gap-3 border-t border-black/[0.07] bg-white/28 px-5 py-4 text-[#202226] sm:px-6">
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-[#6259df]" aria-hidden="true" />
        <div>
          <p className="text-xs font-medium text-[#6b7078]">Next step</p>
          <p className="mt-1 text-sm leading-6 text-[#353941]">{session.nextStep}</p>
        </div>
      </div>
    </article>
  );
}
