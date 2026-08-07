"use client";

import Link from "next/link";
import { memo, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  CircleDollarSign,
  FileText,
  Heart,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";

import type { DeckDecision } from "@/features/decisions/policy";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";

import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";

type JobDetailsDialogProps = {
  job: JobCardViewModel;
  onDecision: (decision: DeckDecision | "apply") => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  returnFocusRef: RefObject<HTMLElement | null>;
};

function fitLabel(score: number) {
  return `${Math.max(0, Math.min(10, score)).toFixed(1)}/10 fit`;
}

const salarySourceLabel = {
  employer_posted: "Employer-posted",
  externally_estimated: "External estimate",
  unknown: "Salary source unknown",
} as const;

function DetailList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6 text-[#4f535a]">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#656970]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Disclosure({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <details className="group border-t border-black/[0.07]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-4 text-sm font-semibold text-[#202226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/35 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="ml-auto size-4 text-[#8a8d93] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-6">
        {children}
      </div>
    </details>
  );
}

export const JobDetailsDialog = memo(function JobDetailsDialog({
  job,
  onDecision,
  onOpenChange,
  open,
  pending,
  returnFocusRef,
}: JobDetailsDialogProps) {
  const visual = companyVisual(job.company);
  const matches = job.strongestMatches.slice(0, 3);
  const watchOuts = (job.biggestGaps.length > 0 ? job.biggestGaps : job.reasonsNotToApply).slice(0, 2);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[#111318]/45 opacity-100 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative flex h-[100dvh] w-full translate-y-0 flex-col overflow-hidden bg-[#f7f7f8] text-[#15161a] shadow-[0_35px_100px_rgba(18,22,32,.24)] transition-[transform,opacity] duration-250 data-[ending-style]:translate-y-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-6 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:scale-100 sm:rounded-[1.75rem] sm:ring-1 sm:ring-black/[0.06] sm:data-[ending-style]:translate-y-0 sm:data-[ending-style]:scale-[.985] sm:data-[starting-style]:translate-y-0 sm:data-[starting-style]:scale-[.985]"
          >
            <div className="safe-area-dialog-header relative z-20 flex shrink-0 items-center gap-3 border-b border-black/[0.06] bg-white/95 px-4 sm:h-16 sm:px-5 sm:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-[#7a7d83]">Opportunity details</p>
                <Dialog.Title className="mt-0.5 truncate text-sm font-semibold text-[#202226]">
                  {job.title} · {job.company}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  Job overview, fit evidence, qualifications, and application actions.
                </Dialog.Description>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Close job details"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f0f1f3] text-[#656970] transition hover:bg-[#e8e9ec] hover:text-[#202226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/40"
              >
                <X className="size-4.5" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-5 sm:px-8 sm:pb-10 sm:pt-8">
                <section className="grid gap-5 sm:grid-cols-[8rem_1fr] sm:items-center">
                  <div
                    className="flex aspect-square w-24 items-center justify-center overflow-hidden rounded-[1.5rem] sm:w-32"
                    style={{ background: visual.background, color: visual.foreground }}
                  >
                    <CompanyMark compact company={job.company} className="max-h-14 max-w-20 sm:max-h-16 sm:max-w-24" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#656970]">
                      <span>{job.company}</span>
                      <span className="size-1 rounded-full bg-[#b0b2b7]" />
                      <span className="text-[#118c5b]">{fitLabel(job.deterministicFitScore)}</span>
                      <span className="size-1 rounded-full bg-[#b0b2b7]" />
                      <span>{job.deterministicFitCoverage}% evidence</span>
                    </div>
                    <h2 className="mt-2 text-balance text-[1.75rem] font-bold leading-[1.05] tracking-[-0.045em] text-[#15161a] sm:text-4xl">
                      {job.title}
                    </h2>
                  </div>
                </section>

                <section className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-black/[0.07] py-5 text-sm sm:grid-cols-4">
                  <div className="min-w-0">
                    <CircleDollarSign className="size-4 text-[#898c92]" aria-hidden="true" />
                    <p className="mt-2 truncate font-semibold text-[#25272b]">{job.salaryDisplay}</p>
                    <p className="mt-1 truncate text-[11px] text-[#64686f]">{salarySourceLabel[job.salarySource]}</p>
                  </div>
                  <div className="min-w-0">
                    <MapPin className="size-4 text-[#898c92]" aria-hidden="true" />
                    <p className="mt-2 truncate font-semibold text-[#25272b]">{job.location}</p>
                  </div>
                  <div className="min-w-0">
                    <BriefcaseBusiness className="size-4 text-[#898c92]" aria-hidden="true" />
                    <p className="mt-2 truncate font-semibold text-[#25272b]">{job.workArrangement}</p>
                  </div>
                  <div className="min-w-0">
                    <Sparkles className="size-4 text-[#898c92]" aria-hidden="true" />
                    <p className="mt-2 truncate font-semibold text-[#25272b]">{job.readiness}</p>
                  </div>
                </section>

                <section className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium text-[#666a71]" aria-label="Listing facts">
                  <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-black/[0.06]">{job.employmentType}</span>
                  {job.seniority ? <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-black/[0.06]">{job.seniority}</span> : null}
                  {job.datePosted ? <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-black/[0.06]">Posted {job.datePosted}</span> : null}
                  <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-black/[0.06]">{job.sourceName}</span>
                </section>

                <section className="mt-8">
                  <h3 className="text-base font-bold tracking-[-0.02em] text-[#202226]">Why it fits</h3>
                  <div className="mt-4 rounded-2xl bg-[#edf8f2] p-4 sm:p-5">
                    <DetailList items={matches} />
                  </div>
                </section>

                {job.technologies.length > 0 ? (
                  <section className="mt-7">
                    <h3 className="text-base font-bold tracking-[-0.02em] text-[#202226]">Skills mentioned</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.technologies.slice(0, 12).map((technology) => (
                        <span key={technology} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#5f636a] ring-1 ring-black/[0.06]">{technology}</span>
                      ))}
                    </div>
                  </section>
                ) : null}

                {job.warnings.length > 0 ? (
                  <section className="mt-7 rounded-2xl border border-[#e2a044]/20 bg-[#fff7e9] p-4">
                    <h3 className="text-sm font-bold text-[#7d5318]">Check before applying</h3>
                    <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[#80633a]">
                      {job.warnings.slice(0, 3).map((warning) => <li key={warning}>• {warning}</li>)}
                    </ul>
                  </section>
                ) : null}

                <section className="mt-7">
                  <h3 className="text-base font-bold tracking-[-0.02em] text-[#202226]">Watch-outs</h3>
                  <div className="mt-4 rounded-2xl bg-[#fff2ee] p-4 sm:p-5">
                    <DetailList items={watchOuts} />
                  </div>
                </section>

                <section className="mt-8">
                  <h3 className="text-base font-bold tracking-[-0.02em] text-[#202226]">About the role</h3>
                  <p className="mt-3 text-sm leading-7 text-[#555960]">{job.summary}</p>
                </section>

                <div className="mt-8">
                  <Disclosure title="Role details">
                    <DetailList items={job.responsibilities} />
                  </Disclosure>
                  <Disclosure title="Qualifications">
                    <div className="space-y-7">
                      <div>
                        <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#8a8d93]">Required</p>
                        <DetailList items={job.requiredQualifications} />
                      </div>
                      {job.preferredQualifications.length > 0 ? (
                        <div>
                          <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[#8a8d93]">Preferred</p>
                          <DetailList items={job.preferredQualifications} />
                        </div>
                      ) : null}
                    </div>
                  </Disclosure>
                  <Disclosure title="How fit was calculated">
                    <div className="space-y-4">
                      {job.scoreBreakdown.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                          <div>
                            <p className="font-semibold text-[#303238]">{item.label}</p>
                            <p className="mt-1 leading-5 text-[#656970]">{item.note}</p>
                          </div>
                          <span className="font-semibold tabular-nums text-[#555960]">{item.score.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </Disclosure>
                </div>

                <Link href={`/jobs/${job.id}`} className="mt-6 flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 text-sm font-semibold text-[#25272b] ring-1 ring-black/[0.06] transition hover:bg-[#f2f3f5]">
                  <FileText className="size-4 text-[#5577ff]" aria-hidden="true" />
                  Open full research report
                  <ArrowUpRight className="ml-auto size-4 text-[#8b8e94]" aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="safe-area-bottom relative z-20 flex shrink-0 items-center justify-center gap-2 border-t border-black/[0.06] bg-white/96 px-3 pt-3 sm:gap-3 sm:px-5">
              <button
                type="button"
                onClick={() => onDecision("skipped")}
                disabled={pending}
                aria-label="Pass on this job"
                className="grid size-11 place-items-center rounded-full border border-black/[0.07] bg-white text-[#e85c68] transition hover:bg-[#fff4f5] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#eb6570]/35"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDecision("stretch")}
                disabled={pending}
                aria-label="Save as a stretch opportunity"
                className="grid size-11 place-items-center rounded-full border border-black/[0.07] bg-white text-[#5577ff] transition hover:bg-[#f3f5ff] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/30"
              >
                <Sparkles className="size-4.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onDecision("saved")}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#d63a52] px-5 text-sm font-bold text-white transition hover:bg-[#c92f49] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d63a52]/35"
              >
                <Heart className="size-4 fill-current" aria-hidden="true" />
                Save
              </button>
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => onDecision("apply")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#15161a] px-4 text-sm font-semibold text-white transition hover:bg-[#2a2c31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/35"
                >
                  Apply
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
