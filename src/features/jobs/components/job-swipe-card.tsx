import { memo, type CSSProperties } from "react";
import { ArrowUpRight, Laptop2, MapPin, ShieldAlert, Sparkles } from "lucide-react";

import type {
  JobCardViewModel,
  JobDecisionBrief,
} from "@/features/jobs/components/job-card";
import { jobCardLayoutForJob } from "@/features/jobs/components/job-card-layouts";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
import { humanizeEvidence } from "@/features/jobs/humanize-evidence";
import type {
  JobCardAdmissionContext,
} from "@/features/jobs/queries";
import { cn } from "@/lib/utils";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobSwipeCardProps = {
  job: JobSwipeCardViewModel;
  nearMatchExplanation?: string | null;
  preview?: boolean;
};

/**
 * The premium card is deliberately presentation-only. Keeping this contract
 * small lets the database-backed deck and the direct company-feed fallback use
 * the exact same visual system without fabricating a full scoring record.
 */
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

function bestCardInsight(job: JobSwipeCardViewModel) {
  const personalized = job.personalizationReasons.find(
    (reason) =>
      !/fresh|recent|explor|variety|salary|compensation|pay|range/i.test(reason),
  );

  return humanizeEvidence(
    job.decisionBrief?.opportunity ??
      job.decisionBrief?.edge ??
      personalized ??
      job.strongestMatches[0] ??
      job.reasonsToApply[0] ??
      "Open the full listing for the strongest evidence and the biggest risk.",
  );
}

function titleScaleClass(title: string) {
  if (title.length > 78) {
    return "text-[clamp(1.2rem,5.2vw,1.45rem)] leading-[1.08]";
  }
  if (title.length > 52) {
    return "text-[clamp(1.35rem,5.8vw,1.65rem)] leading-[1.06]";
  }
  if (title.length > 34) {
    return "text-[clamp(1.5rem,6.4vw,1.82rem)] leading-[1.04]";
  }
  return "text-[clamp(1.7rem,7vw,2rem)] leading-[1.02]";
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

function salaryQualifier(job: JobSwipeCardViewModel) {
  return job.salarySource === "employer_posted"
    ? "Employer posted"
    : "Market estimate";
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
  if (!value) return "Active listing";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return `Posted ${value}`;
  const month = MONTHS[Number(match[2]) - 1];
  const day = Number(match[3]);
  return month && day > 0 ? `Posted ${month} ${day}` : "Recently posted";
}

export const JobSwipeCard = memo(function JobSwipeCard({
  job,
  nearMatchExplanation = null,
  preview = false,
}: JobSwipeCardProps) {
  const insight = job.whyItFits || bestCardInsight(job);
  const risk = nearMatchExplanation ?? job.biggestRisk;
  const feedLabel =
    job.feedTier === "ready_now"
      ? "Ready now"
      : job.feedTier === "credible_stretch"
        ? "Credible stretch"
        : job.feedTier === "discovery"
          ? "Discovery"
          : "Not in feed";
  const confidenceLabel = `${job.evidenceConfidence[0]?.toLocaleUpperCase()}${job.evidenceConfidence.slice(1)} evidence`;
  const template = jobCardTemplateForCompany(job.company);
  const layout = jobCardLayoutForJob(job);
  const visual = companyVisual(job.company);

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      data-card-layout={layout}
      data-card-template={template.id}
      className={cn(
        "obsidian-job-card job-card-float relative isolate h-full w-full overflow-hidden rounded-[1.75rem] border [backface-visibility:hidden] [contain:layout_paint]",
        preview ? "job-card-preview" : "job-card-active-surface",
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
        className="job-card-ambient pointer-events-none absolute -inset-[8%] opacity-60"
        style={{ background: template.glow }}
      />
      <div aria-hidden="true" className="job-card-gloss pointer-events-none absolute inset-px z-[1]" />
      <div aria-hidden="true" className="job-card-prism-field pointer-events-none absolute inset-0 z-[2]" />
      <div aria-hidden="true" className="job-card-layout-decor pointer-events-none absolute inset-0 z-[4]" />
      {!preview ? (
        <div
          aria-hidden="true"
          className="job-card-interactive-glare pointer-events-none absolute"
        />
      ) : null}

      <div
        aria-hidden="true"
        className="job-card-hero pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[35%] items-center justify-center px-8 pb-4 pt-4"
      >
        <div
          data-company-mark
          className="job-company-lens grid h-[clamp(4.6rem,20vw,5.25rem)] w-[clamp(6rem,28vw,6.8rem)] place-items-center rounded-[1.35rem] px-2.5"
          style={{ color: visual.foreground }}
        >
          <CompanyMark
            company={job.company}
            className="max-h-12 max-w-[5.8rem] drop-shadow-[0_10px_24px_rgba(5,10,20,.22)]"
          />
        </div>
      </div>

      <section
        data-card-sheet
        className="job-glass-sheet pointer-events-none absolute inset-x-2.5 bottom-2.5 z-20 flex flex-col rounded-[1.55rem] px-[1.15rem] pb-4 pt-4 text-[#f6f8fc]"
      >
        <div className="job-card-kicker flex min-w-0 items-center justify-between gap-3">
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

        <h2
          className={cn(
            "job-card-title mt-2.5 font-display font-semibold tracking-[-0.035em] text-[#f6f8fc]",
            titleScaleClass(job.title),
          )}
        >
          {job.title}
        </h2>

        <div className="job-card-compensation mt-3.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-[#7f8a9e]">
            Compensation
            <span className="text-[#aeb7c7]" aria-hidden="true">·</span>
            <span className="normal-case tracking-normal text-[#aeb7c7]">
              {salaryQualifier(job)}
            </span>
          </p>
          <p className="mt-1.5 whitespace-nowrap font-display text-[clamp(1.4rem,6.2vw,1.82rem)] font-semibold leading-none tracking-[-0.03em] text-[#f6f8fc] tabular-nums">
            {compactSalary(job.salaryDisplay)}
          </p>
        </div>

        <div className="job-card-logistics mt-3 grid min-h-10 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center border-y border-white/10 text-[12px] font-medium text-[#b4becf]">
          <p className="flex min-w-0 flex-1 items-center gap-2">
            <MapPin className="size-3.5 shrink-0 text-[#8176ff]" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Location: </span>
            <span className="truncate">{compactLocation(job)}</span>
          </p>
          <p className="ml-3 flex shrink-0 items-center gap-2 border-l border-white/10 pl-3">
            <Laptop2 className="size-3.5 text-[#8176ff]" strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">Work arrangement: </span>
            <span>{job.workArrangement === "Unclear" ? "Work mode TBD" : job.workArrangement}</span>
          </p>
        </div>

        <div className="job-card-tags mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-semibold">
          <span className="rounded-full border border-[#8176ff]/25 bg-[#8176ff]/[0.12] px-2.5 py-1 text-[#c5c0ff]">
            {feedLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[#aeb8ca]">
            {confidenceLabel}
          </span>
          {job.employmentType && job.employmentType !== "unknown" ? (
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[#aeb8ca]">
              {employmentLabel(job.employmentType)}
            </span>
          ) : null}
        </div>

        <div className="job-card-read mt-2.5 flex items-start gap-3 rounded-[1rem] border border-white/10 bg-white/[0.035] px-3 py-2.5">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
              <Sparkles className="mt-0.5 size-4 text-[#59d2a2]" strokeWidth={1.8} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#72dbb2]">Why it fits</p>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1rem] text-[#c3cad7]">{insight}</p>
              </div>
            </div>
            <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 border-t border-white/[0.08] pt-2">
              <ShieldAlert className="mt-0.5 size-4 text-[#aaa3ff]" strokeWidth={1.8} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#b9b3ff]">What to check</p>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1rem] text-[#aeb8c9]">{risk}</p>
              </div>
            </div>
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
            "job-card-preview-veil",
            template.previewVeilClassName,
          )}
        />
      ) : null}
    </article>
  );
});
