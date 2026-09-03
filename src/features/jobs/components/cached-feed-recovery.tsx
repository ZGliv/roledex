"use client";

import { ArrowUpRight, BriefcaseBusiness, MapPin, RefreshCw } from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type {
  CachedJobSummary,
  JobFeedSnapshot,
} from "@/features/jobs/feed-snapshot";
import { cn } from "@/lib/utils";

function CachedJobCard({
  job,
  compact,
}: {
  job: CachedJobSummary;
  compact: boolean;
}) {
  const visual = companyVisual(job.company);

  return (
    <article
      className={cn(
        "relative overflow-hidden border border-[#2a3542] bg-[#151d27]",
        compact
          ? "rounded-2xl p-5"
          : "min-w-full snap-center rounded-[1.25rem] p-6",
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/10 px-1.5"
          style={{ backgroundColor: visual.background, color: visual.foreground }}
          aria-hidden="true"
        >
          <CompanyMark company={job.company} compact className="max-h-7 max-w-9" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#cbd2dc]">{job.company}</p>
          <h2 className={cn("mt-1 font-semibold leading-tight tracking-[-0.035em] text-white", compact ? "text-lg" : "text-[1.65rem]")}>
            {job.title}
          </h2>
        </div>
      </div>

      <p className={cn("mt-6 w-fit rounded-md bg-[#29313d] px-2.5 py-1.5 font-semibold text-[#edf1f6]", compact ? "text-sm" : "text-base")}>
        {job.salaryDisplay}
      </p>

      <div className="mt-5 space-y-2.5 text-sm font-medium text-[#aeb8c5]">
        <p className="flex items-center gap-2.5">
          <MapPin className="size-4 shrink-0 text-[#6f9bea]" aria-hidden="true" />
          <span className="truncate">{job.location}</span>
        </p>
        <p className="flex items-center gap-2.5">
          <BriefcaseBusiness className="size-4 shrink-0 text-[#6f9bea]" aria-hidden="true" />
          <span>{[job.workArrangement, job.employmentType].filter(Boolean).join(" · ")}</span>
        </p>
      </div>

      {job.sourceUrl ? (
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-flex size-11 items-center justify-center rounded-full bg-[#4f7fd8] text-white outline-none transition-colors hover:bg-[#6693e2] focus-visible:ring-2 focus-visible:ring-[#8caef0]"
          aria-label={`Open ${job.title} at ${job.company}`}
        >
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </a>
      ) : null}
    </article>
  );
}

export function CachedFeedRecovery({
  retry,
  savedView,
  snapshot,
}: {
  retry?: () => void;
  savedView: boolean;
  snapshot: JobFeedSnapshot;
}) {
  const isSavedSnapshot = snapshot.kind === "saved";

  return (
    <section className="mx-auto mt-2 w-full max-w-2xl" aria-labelledby="cached-feed-heading">
      <header className="flex min-h-12 items-center justify-between px-1">
        <h1 id="cached-feed-heading" className="text-xl font-semibold tracking-[-0.03em] text-white">
          {isSavedSnapshot ? "Saved" : "For you"}
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tabular-nums text-[#8591a1]">{snapshot.jobs.length}</span>
          {retry ? (
            <button
              type="button"
              onClick={retry}
              className="grid size-10 place-items-center rounded-full border border-[#303b49] bg-[#18212c] text-[#aeb8c5] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#6f9bea]"
              aria-label="Refresh"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>

      {savedView && isSavedSnapshot ? (
        <div className="mt-3 space-y-3" aria-label="Saved jobs">
          {snapshot.jobs.map((job) => (
            <CachedJobCard key={job.id} job={job} compact />
          ))}
        </div>
      ) : (
        <div
          className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label="Jobs"
          tabIndex={0}
        >
          {snapshot.jobs.map((job) => (
            <CachedJobCard key={job.id} job={job} compact={false} />
          ))}
        </div>
      )}
    </section>
  );
}
