import { memo } from "react";
import { ArrowUpRight } from "lucide-react";

import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
import { cn } from "@/lib/utils";

type JobSwipeCardProps = {
  job: JobCardViewModel;
  preview?: boolean;
};

function bestCardInsight(job: JobCardViewModel) {
  const personalized = job.personalizationReasons.find(
    (reason) => !/fresh|recent|explor|variety/i.test(reason),
  );
  const materialOpportunity = /\$|pay|compensation|salary/i.test(
    job.decisionBrief?.opportunity ?? "",
  )
    ? job.decisionBrief?.opportunity
    : null;

  return (
    personalized ??
    materialOpportunity ??
    job.decisionBrief?.edge ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    "Open the role brief to see the strongest evidence and the biggest risk."
  );
}

function compactLocation(job: JobCardViewModel) {
  const workLabel =
    job.workArrangement !== "Unclear" ? job.workArrangement : job.employmentType;
  const locationIncludesWork = job.location
    .toLocaleLowerCase()
    .includes(workLabel.toLocaleLowerCase());

  return locationIncludesWork ? job.location : `${job.location} · ${workLabel}`;
}

export const JobSwipeCard = memo(function JobSwipeCard({
  job,
  preview = false,
}: JobSwipeCardProps) {
  const insight = bestCardInsight(job);
  const template = jobCardTemplateForCompany(job.company);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
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
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background: template.glow,
        }}
      />

      <div
        className={cn(
          "absolute inset-x-6 z-10",
          template.contentClassName,
          template.contentFrameClassName,
        )}
      >
        <p
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.26em]",
            template.companyClassName,
          )}
        >
          {job.company}
        </p>
        <div className={cn("mt-4 h-px", template.dividerClassName)} />
        <h2
          className={cn(
            "mt-5 line-clamp-3 text-[2rem] leading-[0.95] tracking-[-0.055em] sm:text-[2.35rem]",
            template.titleClassName,
          )}
        >
          {job.title}
        </h2>
        <div className={cn("mt-5 h-px", template.dividerClassName)} />
        <p
          className={cn(
            "mt-4 line-clamp-2 text-[14px] font-medium leading-5 tracking-[-0.025em]",
            template.metaClassName,
          )}
        >
          {job.salaryDisplay}
          <span className={cn("px-2.5", template.separatorClassName)}>·</span>
          <span className={template.locationClassName}>
            {compactLocation(job)}
          </span>
        </p>
        <div className={cn("mt-5 h-px", template.dividerClassName)} />
        <p
          className={cn(
            "mt-4 line-clamp-2 text-[13px] leading-[1.55]",
            template.insightClassName,
          )}
        >
          {insight}
        </p>
        <div className={cn("mt-5 h-px", template.dividerClassName)} />
      </div>

      {!preview ? (
        <span
          className={cn(
            "absolute bottom-7 left-6 z-10 grid size-11 place-items-center rounded-full border",
            template.arrowClassName,
          )}
        >
          <ArrowUpRight className="size-5" strokeWidth={1.45} aria-hidden="true" />
          <span className="sr-only">View role brief</span>
        </span>
      ) : null}

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
