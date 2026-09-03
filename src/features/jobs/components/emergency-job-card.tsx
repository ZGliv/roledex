import { memo, type CSSProperties } from "react";
import { BriefcaseBusiness, Laptop2, MapPin } from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type { EmergencyFeedJob } from "@/features/jobs/emergency-feed";
import type { EmergencyJobRead } from "@/features/jobs/emergency-feed-presentation";
import { cn } from "@/lib/utils";

function titleClass(title: string) {
  if (title.length > 76) return "text-[1.45rem] leading-[1.1]";
  if (title.length > 54) return "text-[1.65rem] leading-[1.08]";
  if (title.length > 34) return "text-[1.9rem] leading-[1.05]";
  return "text-[2.15rem] leading-[1.02]";
}

export const EmergencyJobCard = memo(function EmergencyJobCard({
  job,
  preview = false,
  read,
}: {
  job: EmergencyFeedJob;
  preview?: boolean;
  read: EmergencyJobRead;
}) {
  const visual = companyVisual(job.company);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      className={cn(
        "roledex-job-card emergency-job-card relative isolate h-full w-full overflow-hidden rounded-[1.25rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? "job-card-preview" : "job-card-active-surface",
      )}
    >
      <span className="roledex-card-accent" aria-hidden="true" />

      <div className="flex h-full flex-col px-6 pb-6 pt-7">
        <header className="flex min-w-0 items-center gap-3.5">
          <span
            className="roledex-company-mark grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border px-1.5"
            style={
              {
                backgroundColor: visual.background,
                color: visual.foreground,
                "--company-accent": visual.accent,
              } as CSSProperties
            }
            aria-hidden="true"
          >
            <CompanyMark company={job.company} compact className="max-h-7 max-w-9" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.95rem] font-semibold text-[#f3f5f8]">
              {job.company}
            </p>
            <p className="mt-0.5 text-xs font-medium text-[#8d98a8]">{read.freshness}</p>
          </div>
        </header>

        <div className="mt-8">
          <h2 className={cn("max-w-[19rem] font-semibold tracking-[-0.045em] text-[#f7f8fa]", titleClass(job.title))}>
            {job.title}
          </h2>
          <p className="mt-5 w-fit rounded-md bg-[#29313d] px-2.5 py-1.5 text-base font-semibold tracking-[-0.02em] text-[#edf1f6] tabular-nums">
            {job.salaryDisplay}
          </p>
        </div>

        <div className="mt-auto space-y-3 border-t border-[#2a3441] pt-5 text-[0.92rem] font-medium text-[#b8c1cc]">
          <p className="flex min-w-0 items-center gap-3">
            <MapPin className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">{job.location}</span>
          </p>
          <p className="flex items-center gap-3">
            <Laptop2 className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
            <span>{job.workArrangement === "Unclear" ? "Flexible" : job.workArrangement}</span>
          </p>
          {job.employmentType ? (
            <p className="flex items-center gap-3">
              <BriefcaseBusiness className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
              <span>{job.employmentType}</span>
            </p>
          ) : null}
        </div>
      </div>

      {preview ? <span aria-hidden="true" className="job-card-preview-veil pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
    </article>
  );
});
