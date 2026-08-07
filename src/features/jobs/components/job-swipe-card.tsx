import { memo, type CSSProperties } from "react";
import { ArrowUpRight, Laptop2, MapPin, Sparkles } from "lucide-react";

import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
import { humanizeEvidence } from "@/features/jobs/humanize-evidence";
import { cn } from "@/lib/utils";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobSwipeCardProps = {
  job: JobCardViewModel;
  preview?: boolean;
};

function bestCardInsight(job: JobCardViewModel) {
  const personalized = job.personalizationReasons.find(
    (reason) =>
      !/fresh|recent|explor|variety|salary|compensation|pay|range/i.test(reason),
  );

  return humanizeEvidence(
    job.decisionBrief?.edge ??
      personalized ??
      job.strongestMatches[0] ??
      job.reasonsToApply[0] ??
      "Open the full listing for the strongest evidence and the biggest risk.",
  );
}

function compactSalary(salary: string) {
  return salary
    .replace(/^Est\.\s*/i, "")
    .replace(/\$([0-9]{1,3}),000/g, (_match, thousands: string) => {
      return "$" + thousands + "K";
    })
    .replace(/\s*\/\s*yr\b/i, " / yr");
}

function salaryQualifier(job: JobCardViewModel) {
  return job.salarySource === "employer_posted"
    ? "Employer posted"
    : "Market estimate";
}

function compactLocation(job: JobCardViewModel) {
  const arrangement = job.workArrangement.toLocaleLowerCase();
  const employment = job.employmentType
    .toLocaleLowerCase()
    .replace(/[^a-z]/g, "");
  const cleaned = job.location
    .replace(/\s*\((remote|hybrid|on[- ]site)\)\s*/gi, " ")
    .split(/\s*[·/|]\s*/)
    .filter((part) => {
      const normalized = part.toLocaleLowerCase().replace(/[^a-z]/g, "");
      return (
        normalized.length > 0 &&
        normalized !== arrangement.replace(/[^a-z]/g, "") &&
        normalized !== employment
      );
    })
    .join(" · ")
    .trim();

  return cleaned || job.location;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function postingLabel(value: string | null) {
  if (!value) return "Active listing";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return `Posted ${value}`;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  return month && day > 0 ? `Posted ${month} ${day}` : "Recently posted";
}

export const JobSwipeCard = memo(function JobSwipeCard({
  job,
  preview = false,
}: JobSwipeCardProps) {
  const insight = bestCardInsight(job);
  const template = jobCardTemplateForCompany(job.company);
  const visual = companyVisual(job.company);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      data-card-layout="editorial-glass"
      data-card-template={template.id}
      className={cn(
        "obsidian-job-card job-card-float relative isolate h-full w-full overflow-hidden rounded-[1.75rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? template.previewBorderClassName : template.borderClassName,
      )}
      style={
        {
          backgroundColor: template.backgroundColor,
          backgroundImage: template.backgroundImage,
          backgroundPosition: template.backgroundPosition,
          backgroundSize: template.backgroundSize,
          "--company-glass": visual.background,
          "--company-accent": visual.accent,
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: template.glow }}
      />
      <div aria-hidden="true" className="job-card-gloss pointer-events-none absolute inset-px z-[1]" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[45%] items-center justify-center px-8 pb-5 pt-5"
      >
        <div
          data-company-mark
          className="job-company-lens grid size-[clamp(5rem,23vw,5.75rem)] place-items-center rounded-[1.35rem] px-1.5"
          style={{ color: visual.foreground }}
        >
          <CompanyMark
            company={job.company}
            className="max-h-14 max-w-[5.25rem] drop-shadow-[0_10px_24px_rgba(5,10,20,.22)]"
          />
        </div>
      </div>

      <section
        data-card-sheet
        className="job-glass-sheet pointer-events-none absolute inset-x-2.5 bottom-2.5 z-20 flex min-h-[16.75rem] flex-col rounded-[1.55rem] px-5 pb-4 pt-4 text-[#f6f8fc]"
      >
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-[var(--company-accent)] shadow-[0_0_0_4px_rgba(255,255,255,.34)]"
            />
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#c4ccda]">
              {job.company}
            </p>
          </div>
          <p className="max-w-[7.5rem] shrink-0 truncate text-[11px] font-medium text-[#8f9aae]">
            {postingLabel(job.datePosted)}
          </p>
        </div>

        <h2 className="mt-2.5 line-clamp-2 font-display text-[clamp(1.7rem,7.1vw,2rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-[#f6f8fc]">
          {job.title}
        </h2>

        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7f8a9e]">
            Compensation
            <span className="text-[#aeb7c7]" aria-hidden="true">·</span>
            <span className="normal-case tracking-normal text-[#aeb7c7]">
              {salaryQualifier(job)}
            </span>
          </p>
          <p className="mt-1.5 whitespace-nowrap font-display text-[clamp(1.55rem,6.8vw,1.9rem)] font-semibold leading-none tracking-[-0.03em] text-[#f6f8fc] tabular-nums">
            {compactSalary(job.salaryDisplay)}
          </p>
        </div>

        <div className="mt-3 flex h-9 min-w-0 items-center border-y border-white/10 text-[12px] font-medium text-[#b4becf]">
          <p className="flex min-w-0 flex-1 items-center gap-2">
            <MapPin className="size-3.5 shrink-0 text-[#8176ff]" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Location: </span>
            <span className="truncate">{compactLocation(job)}</span>
          </p>
          <span className="mx-3 h-3 w-px shrink-0 bg-white/10" aria-hidden="true" />
          <p className="flex shrink-0 items-center gap-2">
            <Laptop2 className="size-3.5 text-[#8176ff]" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Work arrangement: </span>
            <span>{job.workArrangement === "Unclear" ? "Work mode TBD" : job.workArrangement}</span>
          </p>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Sparkles className="size-4 shrink-0 text-[#59d2a2]" strokeWidth={1.8} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[#72dbb2]">Why this role</p>
            <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.35rem] text-[#b7c0d0]">
              {insight}
            </p>
          </div>
          {!preview ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-[#cbd2de]" aria-hidden="true">
              <ArrowUpRight className="size-3.5" strokeWidth={1.7} />
            </span>
          ) : null}
        </div>
      </section>

      {preview ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 z-40 rounded-[inherit]",
            template.previewVeilClassName,
          )}
        />
      ) : null}
    </article>
  );
});
