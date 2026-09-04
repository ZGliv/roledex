"use client";

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Clock3,
  MapPin,
  RefreshCw,
  WifiOff,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import {
  formatJobFeedSnapshotFreshness,
  type CachedJobSummary,
  type JobFeedSnapshot,
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
        "relative isolate overflow-hidden border border-white/[0.12] bg-[#0c1322]/82 shadow-[inset_0_1px_0_rgba(255,255,255,.11),0_24px_70px_rgba(0,0,0,.34)] backdrop-blur-2xl",
        compact
          ? "rounded-[1.4rem] p-4 sm:p-5"
          : "min-w-full snap-center rounded-[1.7rem] px-5 pb-5 pt-6",
      )}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 size-52 rounded-full opacity-25 blur-3xl"
        style={{ backgroundColor: visual.accent }}
        aria-hidden="true"
      />
      <div className="relative flex items-start gap-3.5">
        <div
          className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-[1rem] border border-white/20 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_10px_30px_rgba(0,0,0,.25)]"
          style={{ backgroundColor: visual.background, color: visual.foreground }}
          aria-hidden="true"
        >
          <CompanyMark
            company={job.company}
            compact
            className="max-h-7 max-w-9"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-white/48">
            {job.company}
          </p>
          <h2
            className={cn(
              "mt-1.5 font-semibold leading-tight tracking-[-0.035em] text-white",
              compact ? "text-[1.05rem]" : "text-[1.55rem]",
            )}
          >
            {job.title}
          </h2>
        </div>
      </div>

      <p
        className={cn(
          "relative mt-5 font-semibold tracking-[-0.035em] text-white",
          compact ? "text-lg" : "text-[1.65rem]",
        )}
      >
        {job.salaryDisplay}
      </p>

      <div className="relative mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-white/63">
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.055] px-3">
          <MapPin className="size-3.5 text-[#aaa3ff]" aria-hidden="true" />
          {job.location}
        </span>
        <span className="inline-flex min-h-8 items-center rounded-full border border-white/[0.1] bg-white/[0.055] px-3">
          {job.workArrangement}
        </span>
        {job.employmentType ? (
          <span className="inline-flex min-h-8 items-center rounded-full border border-white/[0.1] bg-white/[0.055] px-3">
            {job.employmentType}
          </span>
        ) : null}
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-[10px] font-medium text-white/38">
          <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
          {job.datePosted ? `Posted ${job.datePosted}` : "Previously active"}
        </span>
        {job.sourceUrl ? (
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[11px] font-semibold text-[#121827] outline-none transition hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/65"
            aria-label={`Open the original listing for ${job.title} at ${job.company}`}
          >
            Open listing
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        ) : (
          <span className="shrink-0 text-[10px] font-medium text-white/34">
            Link not cached
          </span>
        )}
      </div>
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
  const heading = isSavedSnapshot
    ? "Your saved jobs are still here"
    : "Your last For You feed is ready";
  const description = isSavedSnapshot
    ? "This earlier shortlist was restored from this device while live company feeds refresh."
    : savedView
      ? "Your saved shortlist was not cached, so here is the last personalized feed stored on this device."
      : "Keep browsing the last personalized jobs stored on this device while live company feeds refresh.";

  return (
    <section className="mx-auto mt-7 w-full max-w-2xl" aria-labelledby="cached-feed-heading">
      <header className="rounded-[1.55rem] border border-white/[0.11] bg-[#0b1120]/72 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,.09),0_24px_75px_rgba(0,0,0,.3)] backdrop-blur-2xl sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#aaa4ff]">
              <WifiOff className="size-3.5" aria-hidden="true" />
              Available offline
            </p>
            <h1 id="cached-feed-heading" className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-[-0.045em] text-white sm:text-3xl">
              {heading}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/53">
              {description}
            </p>
          </div>
          <div className="hidden size-11 shrink-0 place-items-center rounded-[1rem] border border-white/[0.12] bg-white/[0.06] text-[#aaa4ff] sm:grid" aria-hidden="true">
            <BriefcaseBusiness className="size-5" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] pt-4">
          <p className="text-[11px] font-medium text-white/43">
            {formatJobFeedSnapshotFreshness(snapshot.savedAt)} · {snapshot.jobs.length} {snapshot.jobs.length === 1 ? "job" : "jobs"} on this device
          </p>
          {retry ? (
            <button
              type="button"
              onClick={retry}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/[0.13] bg-white/[0.06] px-4 text-[11px] font-semibold text-white/72 outline-none transition hover:bg-white/[0.1] hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Try live feed
            </button>
          ) : null}
        </div>
      </header>

      {savedView && isSavedSnapshot ? (
        <div className="mt-4 space-y-3" aria-label="Cached saved jobs">
          {snapshot.jobs.map((job) => (
            <CachedJobCard key={job.id} job={job} compact />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <p className="px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/36">
            Swipe to browse cached cards
          </p>
          <div
            className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="region"
            aria-label="Cached For You jobs"
            tabIndex={0}
          >
            {snapshot.jobs.map((job) => (
              <CachedJobCard key={job.id} job={job} compact={false} />
            ))}
          </div>
        </div>
      )}

      <p className="mx-auto mt-3 max-w-lg text-center text-[10px] leading-4 text-white/36">
        Cached details can become outdated. Confirm pay, requirements, and availability on the original listing.
      </p>
    </section>
  );
}
