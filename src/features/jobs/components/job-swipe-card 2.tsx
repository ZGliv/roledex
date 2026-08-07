import { memo } from "react";
import { ArrowUpRight } from "lucide-react";

import type { JobCardViewModel } from "@/features/jobs/components/job-card";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobSwipeCardProps = {
  job: JobCardViewModel;
  preview?: boolean;
};

function matchLabel(score: number) {
  return `${Math.max(0, Math.min(10, score)).toFixed(1)} fit`;
}

function compactSalary(salary: string) {
  return salary.replace(/,000/g, "k").replace("/yr", "");
}

export const JobSwipeCard = memo(function JobSwipeCard({
  job,
  preview = false,
}: JobSwipeCardProps) {
  const visual = companyVisual(job.company);
  const meta = [
    compactSalary(job.salaryDisplay),
    job.workArrangement !== "Unclear" ? job.workArrangement : null,
    job.location,
  ].filter(Boolean);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      className="relative isolate flex h-full w-full flex-col overflow-hidden rounded-[1.75rem] bg-white text-[#15161a] shadow-[0_24px_70px_rgba(18,22,32,.14)] ring-1 ring-black/[0.055] [backface-visibility:hidden] [contain:layout_paint]"
    >
      <div
        className="relative flex min-h-0 flex-[1.55] items-center justify-center overflow-hidden"
        style={{ background: visual.background, color: visual.foreground }}
      >
        <div
          aria-hidden="true"
          className="absolute -right-16 -top-20 size-64 rounded-full border-[44px] opacity-45"
          style={{ borderColor: visual.accent }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-20 size-72 rounded-full border-[52px] opacity-35"
          style={{ borderColor: visual.accent }}
        />
        <div className="relative z-10 flex size-44 items-center justify-center overflow-hidden rounded-[2.25rem] border border-current/10 bg-white/18 px-4 shadow-[0_18px_50px_rgba(16,18,22,.1)] sm:size-48">
          <CompanyMark company={job.company} />
        </div>

        <span className="absolute right-4 top-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-[#15161a] shadow-[0_8px_24px_rgba(18,22,32,.09)]">
          <span className="size-1.5 rounded-full bg-[#13a66a]" aria-hidden="true" />
          {matchLabel(job.deterministicFitScore)}
        </span>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col justify-center px-5 py-5 sm:px-6">
        <p className="text-[13px] font-semibold text-[#71747b]">{job.company}</p>
        <h2 className="mt-1.5 line-clamp-2 text-[1.65rem] font-bold leading-[1.05] tracking-[-0.045em] text-[#15161a] sm:text-[1.8rem]">
          {job.title}
        </h2>
        <p className="mt-3 truncate text-sm font-medium text-[#555960]">
          {meta.join(" · ")}
        </p>
        {!preview ? (
          <span className="absolute bottom-5 right-5 grid size-8 place-items-center rounded-full bg-[#f1f2f4] text-[#565a61]">
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </article>
  );
});
