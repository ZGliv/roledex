import { memo } from "react";
import { ArrowUpRight, MapPin } from "lucide-react";

import type { JobCardViewModel } from "@/features/jobs/components/job-card";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobSwipeCardProps = {
  job: JobCardViewModel;
  preview?: boolean;
};

function fitLabel(verdict: JobCardViewModel["verdict"]) {
  if (verdict === "Strong Apply") return "Strong fit";
  if (verdict === "Apply") return "Worth a look";
  if (verdict === "Apply as a Stretch") return "Stretch";
  if (verdict === "Learn First") return "Learn first";
  if (verdict === "Skip") return "Low fit";
  return "Consider";
}

function salaryQualifier(source: JobCardViewModel["salarySource"]) {
  if (source === "employer_posted") return "Posted salary";
  if (source === "externally_estimated") return "Market estimate";
  return "Estimated range";
}

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
    materialOpportunity ??
    job.decisionBrief?.edge ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    personalized ??
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
  const visual = companyVisual(job.company);
  const insight = bestCardInsight(job);
  const darkVisual = visual.foreground.toLowerCase() === "#ffffff";

  return (
    <article
      aria-hidden={preview || undefined}
      aria-label={preview ? undefined : `${job.title} at ${job.company}`}
      className={`job-card-float relative isolate flex h-full w-full translate-z-0 flex-col overflow-hidden rounded-[2.25rem] text-[#111827] [backface-visibility:hidden] [contain:layout_paint] ${
        preview
          ? "border border-white/70 bg-white/30 opacity-[0.96]"
          : "glass-card"
      }`}
    >
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 pb-13 pt-14"
        style={{
          background: `color-mix(in srgb, ${visual.background} 68%, transparent)`,
          color: visual.foreground,
        }}
      >
        <div
          aria-hidden="true"
          className={darkVisual
            ? "absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.14),rgba(255,255,255,.02)_42%,rgba(255,255,255,.08))]"
            : "absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.58),rgba(255,255,255,.06)_42%,rgba(255,255,255,.3))]"}
        />
        <div
          aria-hidden="true"
          className="absolute -right-18 -top-24 size-72 rounded-full border-[42px] border-white/25 opacity-80 blur-[1px]"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -left-20 size-72 rounded-full blur-3xl"
          style={{ backgroundColor: visual.accent, opacity: 0.72 }}
        />
        <div
          aria-hidden="true"
          className="absolute -left-24 top-1/4 h-24 w-[34rem] -rotate-12 rounded-full bg-white/30 blur-2xl"
        />

        <span className={`absolute left-5 top-5 z-20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-current shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_8px_24px_rgba(22,38,62,.08)] ${darkVisual ? "border-white/24 bg-black/18" : "border-white/45 bg-white/42"}`}>
          <span className="size-1.5 rounded-full bg-[#35c7a5] shadow-[0_0_0_3px_rgba(53,199,165,.14)]" aria-hidden="true" />
          Live match
        </span>

        <span className={`absolute right-5 top-5 z-20 inline-flex items-center rounded-full border px-3 py-1.5 text-[10px] font-bold text-current shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_8px_24px_rgba(22,38,62,.08)] ${darkVisual ? "border-white/24 bg-black/18" : "border-white/45 bg-white/42"}`}>
          {fitLabel(job.verdict)}
        </span>

        <div className={`relative z-10 grid size-40 place-items-center overflow-hidden rounded-[2.35rem] border px-5 shadow-[0_28px_65px_rgba(15,23,42,.16),inset_0_1px_0_rgba(255,255,255,.36)] sm:size-44 ${darkVisual ? "border-white/28 bg-black/16" : "border-white/55 bg-white/34"}`}>
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.38),rgba(255,255,255,.08)_58%,rgba(255,255,255,.22))]"
          />
          <CompanyMark
            company={job.company}
            className="relative max-h-26 max-w-28 drop-shadow-[0_12px_24px_rgba(15,23,42,.12)] sm:max-h-30 sm:max-w-32"
          />
        </div>
      </div>

      <div className="relative z-20 mx-2 -mt-8 mb-2 flex min-h-[17rem] flex-col overflow-hidden rounded-[1.9rem] border border-white/78 bg-white/[0.78] px-5 pb-5 pt-5 shadow-[0_22px_55px_rgba(24,35,56,.13),inset_0_1px_0_rgba(255,255,255,.92)] sm:px-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,.34),transparent_48%,rgba(225,232,244,.18))]"
        />
        <p className="relative truncate text-[10px] font-bold uppercase tracking-[0.14em] text-[#737d8f]">
          {job.company}
        </p>
        <h2 className="relative mt-1.5 line-clamp-2 text-[1.65rem] font-semibold leading-[1.03] tracking-[-0.052em] text-[#111827] sm:text-[1.85rem]">
          {job.title}
        </h2>

        <div className="relative mt-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold leading-5 tracking-[-0.025em] text-[#202a3d]">
              {job.salaryDisplay}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#8992a1]">
              {salaryQualifier(job.salarySource)}
            </p>
          </div>
          <div className="flex min-w-0 max-w-[46%] shrink items-start justify-end gap-1.5 text-right text-[10px] font-semibold leading-4 text-[#697588]">
            <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="line-clamp-2">{compactLocation(job)}</span>
          </div>
        </div>

        <div className="relative mt-auto grid grid-cols-[1fr_auto] items-end gap-4 border-t border-[#25334a]/[0.07] pt-3.5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#6259df]">
              Why it stands out
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[#5d687b]">
              {insight}
            </p>
          </div>
          {!preview ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#141c2b] text-white shadow-[0_8px_20px_rgba(20,28,43,.16)]">
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
              <span className="sr-only">View role brief</span>
            </span>
          ) : null}
        </div>
      </div>

      {preview ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-40 rounded-[inherit] bg-[linear-gradient(180deg,rgba(238,243,250,.16),rgba(238,243,250,.42))] shadow-[inset_0_0_0_1px_rgba(255,255,255,.82)]"
        />
      ) : null}
    </article>
  );
});
