import { memo, type CSSProperties } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Laptop2,
  MapPin,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
import type { EmergencyFeedJob } from "@/features/jobs/emergency-feed";
import type { EmergencyJobRead } from "@/features/jobs/emergency-feed-presentation";
import { cn } from "@/lib/utils";

function titleClass(title: string) {
  if (title.length > 76) return "text-[0.98rem] leading-[1.12]";
  if (title.length > 54) return "text-[1.08rem] leading-[1.1]";
  if (title.length > 34) return "text-[1.3rem] leading-[1.06]";
  return "text-[1.55rem] leading-[1.02]";
}

function salaryQualifier(job: EmergencyFeedJob) {
  return job.estimatedSalary ? "Market estimate" : "Employer posted";
}

function requirementSignal(job: EmergencyFeedJob) {
  const signal = job.requirements?.[0]?.trim() || job.summary;
  return signal.length > 96 ? `${signal.slice(0, 93).trimEnd()}…` : signal;
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
  const template = jobCardTemplateForCompany(job.company);
  const visual = companyVisual(job.company);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      className={cn(
        "obsidian-job-card emergency-job-card relative isolate h-full w-full overflow-hidden rounded-[1.75rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? "job-card-preview" : "job-card-active-surface",
        preview ? template.previewBorderClassName : template.borderClassName,
      )}
      style={
        {
          backgroundColor: template.backgroundColor,
          backgroundImage: template.backgroundImage,
          backgroundPosition: template.backgroundPosition,
          backgroundSize: template.backgroundSize,
          "--company-accent": visual.accent,
          "--company-glass": visual.background,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="job-card-ambient pointer-events-none absolute -inset-[8%] opacity-60"
        style={{ background: template.glow }}
      />
      <div aria-hidden="true" className="job-card-gloss pointer-events-none absolute inset-px z-[1]" />
      <div aria-hidden="true" className="job-card-prism-field pointer-events-none absolute inset-0 z-[2]" />
      {!preview ? <div aria-hidden="true" className="job-card-interactive-glare pointer-events-none absolute" /> : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[22%] items-center justify-center px-7 pb-2 pt-3" aria-hidden="true">
        <div
          data-company-mark
          className="job-company-lens grid h-[4.2rem] w-[5.5rem] place-items-center rounded-[1.2rem] px-2.5"
          style={{ color: visual.foreground }}
        >
          <CompanyMark company={job.company} className="max-h-10 max-w-[4.65rem] drop-shadow-[0_10px_24px_rgba(5,10,20,.22)]" />
        </div>
      </div>

      <section className="job-glass-sheet pointer-events-none absolute inset-x-2 bottom-2 top-[22%] z-20 flex min-h-0 flex-col overflow-hidden rounded-[1.45rem] px-3.5 pb-3 pt-3 text-[#f6f8fc]">
        <div className="flex min-w-0 items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-[#9da8ba]">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-[var(--company-accent)] shadow-[0_0_0_3px_rgba(255,255,255,.18)]" />
          <span className="truncate text-[#c6ceda]">{job.company}</span>
          <span aria-hidden="true" className="text-white/25">·</span>
          <span className="shrink-0">{read.source}</span>
          <span className="ml-auto shrink-0 normal-case tracking-normal text-[#7f8a9f]">{read.freshness}</span>
        </div>

        <h2 className={cn("mt-2 font-display font-semibold tracking-[-0.035em] text-white", titleClass(job.title))}>
          {job.title}
        </h2>

        <div className="mt-2 flex items-end justify-between gap-3 border-b border-white/[0.09] pb-2.5">
          <div className="min-w-0">
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.11em] text-[#7f8a9d]">Compensation · <span className="normal-case tracking-normal text-[#aab4c5]">{salaryQualifier(job)}</span></p>
            <p className="mt-1 whitespace-nowrap font-display text-[clamp(1.18rem,5.8vw,1.55rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">{job.salaryDisplay}</p>
          </div>
        </div>

        <div className="grid min-h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-white/[0.09] text-[10.5px] font-medium text-[#b7c0d0]">
          <p className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3 shrink-0 text-[#8e85ff]" strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{job.location}</span>
          </p>
          <p className="flex shrink-0 items-center gap-1.5 border-l border-white/[0.09] pl-2">
            <Laptop2 className="size-3 text-[#8e85ff]" strokeWidth={1.8} aria-hidden="true" />
            <span>{job.workArrangement === "Unclear" ? "Mode TBD" : job.workArrangement}</span>
          </p>
          <p className="hidden shrink-0 items-center gap-1.5 border-l border-white/[0.09] pl-2 min-[355px]:flex">
            <BriefcaseBusiness className="size-3 text-[#8e85ff]" strokeWidth={1.8} aria-hidden="true" />
            <span>{job.employmentType}</span>
          </p>
        </div>

        <div className="mt-2 grid min-h-0 flex-1 content-start gap-1.5 overflow-hidden">
          <div className="grid grid-cols-[0.9rem_minmax(0,1fr)] gap-2">
            <BriefcaseBusiness className="mt-0.5 size-3.5 text-[#a8b3c7]" strokeWidth={1.7} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.09em] text-[#8f9aae]">Role signal</p>
              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-[0.9rem] text-[#c3cad7]">{requirementSignal(job)}</p>
            </div>
          </div>
          <div className="job-card-fit grid grid-cols-[0.9rem_minmax(0,1fr)] gap-2 border-t border-white/[0.07] pt-1.5">
            <Sparkles className="mt-0.5 size-3.5 text-[#59d2a2]" strokeWidth={1.8} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.09em] text-[#72dbb2]">Why it surfaced</p>
              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-[0.9rem] text-[#c3cad7]">{read.fit}</p>
            </div>
          </div>
          <div className="job-card-risk grid grid-cols-[0.9rem_minmax(0,1fr)_1.6rem] gap-2 border-t border-white/[0.07] pt-1.5">
            <ShieldAlert className="mt-0.5 size-3.5 text-[#aaa3ff]" strokeWidth={1.8} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.09em] text-[#b9b3ff]">Verify</p>
              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-[0.9rem] text-[#adb7c8]">{read.risk}</p>
            </div>
            {!preview ? (
              <span className="grid size-6 place-items-center self-end rounded-full border border-white/10 bg-white/[0.05] text-[#d0d6e0]" aria-hidden="true">
                <ArrowUpRight className="size-3" strokeWidth={1.8} />
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {preview ? <span aria-hidden="true" className={cn("job-card-preview-veil pointer-events-none absolute inset-0 z-40 rounded-[inherit]", template.previewVeilClassName)} /> : null}
    </article>
  );
});
