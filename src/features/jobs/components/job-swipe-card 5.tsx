import { memo, type CSSProperties } from "react";
import { ArrowUpRight, Laptop2, MapPin } from "lucide-react";

import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
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

  return (
    job.decisionBrief?.edge ??
    personalized ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    "Open the role brief for the strongest evidence and the biggest risk."
  );
}

function compactSalary(salary: string) {
  return salary
    .replace(/^Est\.\s*/i, "")
    .replace(/\$([0-9]{1,3}),000/g, (_match, thousands: string) => {
      return "$" + thousands + "K";
    })
    .replace(/\/yr\b/i, " / yr");
}

function salaryQualifier(job: JobCardViewModel) {
  if (job.salarySource === "employer_posted") {
    return "Employer posted";
  }

  const confidence =
    job.salaryConfidence.charAt(0).toUpperCase() + job.salaryConfidence.slice(1);
  return "Market estimate · " + confidence + " confidence";
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

function workArrangementLabel(job: JobCardViewModel) {
  return job.workArrangement === "Unclear"
    ? "Work mode not listed"
    : job.workArrangement;
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
      aria-label={
        preview ? undefined : job.title + " at " + job.company
      }
      data-card-layout="visual-sheet"
      data-card-template={template.id}
      className={cn(
        "obsidian-job-card job-card-float relative isolate h-full w-full overflow-hidden rounded-[2rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? template.previewBorderClassName : template.borderClassName,
      )}
      style={{
        backgroundColor: template.backgroundColor,
        backgroundImage: template.backgroundImage,
        backgroundPosition: template.backgroundPosition,
        backgroundSize: template.backgroundSize,
        "--company-glass": visual.background,
        "--company-accent": visual.accent,
      } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-55"
        style={{ background: template.glow }}
      />

      <div
        aria-hidden="true"
        className="job-card-gloss pointer-events-none absolute inset-px z-[1]"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[57%] items-center justify-center px-8 pb-12 pt-6"
      >
        <div
          data-company-mark
          className="job-company-lens grid size-[clamp(7.5rem,36vw,9.25rem)] place-items-center rounded-[2rem] px-5"
          style={{ color: visual.foreground }}
        >
          <CompanyMark
            company={job.company}
            className="max-h-24 max-w-28 drop-shadow-[0_10px_24px_rgba(5,10,20,.2)]"
          />
        </div>
      </div>

      <section
        data-card-sheet
        className="job-glass-sheet pointer-events-none absolute inset-x-2.5 bottom-2.5 z-20 flex h-[18.75rem] flex-col overflow-hidden rounded-[1.75rem] px-3.5 pb-3 pt-3 text-[#111827]"
      >
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-2">
          <div className="job-glass-chip flex h-7 min-w-0 items-center gap-2 rounded-full px-2.5">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-[var(--company-accent)] shadow-[0_0_0_3px_rgba(255,255,255,.35)]"
            />
            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.15em] text-[#596579]">
              {job.company}
            </p>
          </div>
          <span className="job-glass-chip flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[9px] font-semibold text-[#6f798b]">
            Company profile
            <ArrowUpRight
              className="size-3.5"
              strokeWidth={1.7}
              aria-hidden="true"
            />
          </span>
        </div>

        <h2 className="mt-2 line-clamp-2 shrink-0 px-0.5 text-[clamp(1.45rem,6.6vw,1.78rem)] font-semibold leading-[1.01] tracking-[-0.052em] text-[#101827]">
          {job.title}
        </h2>

        <div className="job-glass-module-strong mt-2.5 shrink-0 rounded-[1.05rem] px-3 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-[#7b8697]">
              Compensation
            </p>
            <p className="job-glass-chip truncate rounded-full px-2 py-0.5 text-right text-[8px] font-medium text-[#707b8d]">
              {salaryQualifier(job)}
            </p>
          </div>
          <p className="mt-1 whitespace-nowrap text-[clamp(1.25rem,5.7vw,1.6rem)] font-semibold leading-none tracking-[-0.045em] text-[#172033] tabular-nums">
            {compactSalary(job.salaryDisplay)}
          </p>
        </div>

        <div className="mt-2 grid h-[3.15rem] shrink-0 grid-cols-2 gap-2">
          <div className="job-glass-module flex min-w-0 items-center gap-2 rounded-[1rem] px-2.5">
            <MapPin
              className="size-3.5 shrink-0 text-[#6f63dc]"
              strokeWidth={1.65}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[9px] font-medium text-[#9098a6]">Location</p>
              <p className="truncate text-[11px] font-medium text-[#485468]">
                {compactLocation(job)}
              </p>
            </div>
          </div>
          <div className="job-glass-module flex min-w-0 items-center gap-2 rounded-[1rem] px-2.5">
            <Laptop2
              className="size-3.5 shrink-0 text-[#6f63dc]"
              strokeWidth={1.65}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-[9px] font-medium text-[#9098a6]">
                Work mode
              </p>
              <p className="truncate text-[11px] font-medium text-[#485468]">
                {workArrangementLabel(job)}
              </p>
            </div>
          </div>
        </div>

        <div className="job-glass-module mt-2 flex min-h-10 shrink-0 items-center gap-2.5 rounded-[1rem] py-1.5 pl-2.5 pr-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#6f63dc]">
              Why it fits
            </p>
            <p className="mt-0.5 line-clamp-1 text-[10px] leading-3.5 text-[#657084]">
              {insight}
            </p>
          </div>
          {!preview ? (
            <span className="job-glass-action grid size-9 shrink-0 place-items-center rounded-full">
              <ArrowUpRight
                className="size-3.5"
                strokeWidth={1.6}
                aria-hidden="true"
              />
              <span className="sr-only">View full job details</span>
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
