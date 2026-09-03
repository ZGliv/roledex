import { memo, type CSSProperties } from "react";
import { BriefcaseBusiness, Laptop2, MapPin } from "lucide-react";

import type {
  JobCardViewModel,
  JobDecisionBrief,
} from "@/features/jobs/components/job-card";
import type { JobCardAdmissionContext } from "@/features/jobs/queries";
import { cn } from "@/lib/utils";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobSwipeCardProps = {
  job: JobSwipeCardViewModel;
  nearMatchExplanation?: string | null;
  preview?: boolean;
};

export type JobSwipeCardViewModel = Pick<
  JobCardViewModel,
  | "company"
  | "datePosted"
  | "employmentType"
  | "id"
  | "location"
  | "personalizationReasons"
  | "reasonsToApply"
  | "salaryDisplay"
  | "salarySource"
  | "strongestMatches"
  | "title"
  | "workArrangement"
> & {
  biggestRisk: JobCardAdmissionContext["biggestRisk"];
  decisionBrief?: JobDecisionBrief;
  evidenceConfidence: JobCardAdmissionContext["evidenceConfidence"];
  feedTier: JobCardAdmissionContext["feedTier"];
  whyItFits: JobCardAdmissionContext["whyItFits"];
};

function titleScaleClass(title: string) {
  if (title.length > 78) return "text-[clamp(1.65rem,7vw,2.05rem)] leading-[1.08]";
  if (title.length > 52) return "text-[clamp(1.85rem,7.8vw,2.3rem)] leading-[1.06]";
  if (title.length > 34) return "text-[clamp(2rem,8.4vw,2.55rem)] leading-[1.04]";
  return "text-[clamp(2.2rem,9.2vw,2.8rem)] leading-[1.02]";
}

function employmentLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function compactSalary(salary: string) {
  return salary
    .replace(/^Est\.\s*/i, "")
    .replace(/\$([0-9]{1,3}),000/g, (_match, thousands: string) => {
      return "$" + thousands + "K";
    })
    .replace(/\s*\/\s*yr\b/i, " / yr");
}

function compactLocation(job: JobSwipeCardViewModel) {
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
  if (!value) return "Active";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  return month && day > 0 ? `${month} ${day}` : "Recent";
}

export const JobSwipeCard = memo(function JobSwipeCard({
  job,
  preview = false,
}: JobSwipeCardProps) {
  const visual = companyVisual(job.company);
  const hasEmploymentType =
    job.employmentType && job.employmentType !== "unknown";

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      className={cn(
        "roledex-job-card relative isolate h-full w-full overflow-hidden rounded-[1.25rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? "job-card-preview" : "job-card-active-surface",
      )}
    >
      <span className="roledex-card-accent" aria-hidden="true" />

      <div className="flex h-full flex-col px-6 pb-6 pt-7 sm:px-7 sm:pb-7">
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
            <p className="mt-0.5 text-xs font-medium text-[#8d98a8]">
              {postingLabel(job.datePosted)}
            </p>
          </div>
        </header>

        <div className="mt-9">
          <h2
            className={cn(
              "max-w-[19rem] font-semibold tracking-[-0.045em] text-[#f7f8fa]",
              titleScaleClass(job.title),
            )}
          >
            {job.title}
          </h2>

          <p className="mt-5 w-fit rounded-md bg-[#29313d] px-2.5 py-1.5 text-base font-semibold tracking-[-0.02em] text-[#edf1f6] tabular-nums">
            {compactSalary(job.salaryDisplay)}
          </p>
        </div>

        <div className="mt-auto space-y-3 border-t border-[#2a3441] pt-5 text-[0.92rem] font-medium text-[#b8c1cc]">
          <p className="flex min-w-0 items-center gap-3">
            <MapPin className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
            <span className="truncate">{compactLocation(job)}</span>
          </p>
          <p className="flex items-center gap-3">
            <Laptop2 className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
            <span>{job.workArrangement === "Unclear" ? "Flexible" : job.workArrangement}</span>
          </p>
          {hasEmploymentType ? (
            <p className="flex items-center gap-3">
              <BriefcaseBusiness className="size-4 shrink-0 text-[#6f9bea]" strokeWidth={2} aria-hidden="true" />
              <span>{employmentLabel(job.employmentType)}</span>
            </p>
          ) : null}
        </div>
      </div>

      {preview ? <span aria-hidden="true" className="job-card-preview-veil pointer-events-none absolute inset-0 rounded-[inherit]" /> : null}
    </article>
  );
});
