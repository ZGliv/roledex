"use client";

import { useEffect, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Heart,
  Laptop2,
  MapPin,
  X,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type { EmergencyFeedJob } from "@/features/jobs/emergency-feed";
import type { EmergencyJobRead } from "@/features/jobs/emergency-feed-presentation";

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 border-t border-white/[0.08] py-3">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7f8ba0]">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-[12.5px] font-medium text-[#d8deea]">{value}</dd>
    </div>
  );
}

function BriefSection({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <section className="border-t border-white/[0.08] py-6 first:border-t-0">
      <h3 className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8995a9]">{label}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function EmergencyJobDetails({
  job,
  onDecision,
  onOpenChange,
  onReady,
  open,
  read,
  returnFocusRef,
}: {
  job: EmergencyFeedJob;
  onDecision: (decision: "saved" | "skipped") => void;
  onOpenChange: (open: boolean) => void;
  onReady?: () => void;
  open: boolean;
  read: EmergencyJobRead;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const visual = companyVisual(job.company);
  const description = job.description?.trim() || job.summary;
  const requirements = job.requirements ?? [];

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#060a10]/84 opacity-100 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative isolate flex h-full w-full translate-y-0 flex-col overflow-hidden border border-[#2b3542] bg-[#0f151d] text-white shadow-[0_28px_80px_rgba(0,0,0,.5)] transition-[transform,opacity] duration-240 ease-[cubic-bezier(.22,1,.36,1)] data-[ending-style]:translate-y-8 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-8 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[1.25rem]"
          >
            <header className="safe-area-dialog-header relative z-30 flex shrink-0 items-center gap-3 border-b border-[#2b3542] bg-[#0f151d] px-4 sm:h-14 sm:px-5 sm:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#dce2ea]">Details</p>
                <p className="mt-0.5 truncate text-[11px] text-[#8793a3]">{read.freshness}</p>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Close job brief"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-[#303b49] bg-[#18212c] text-[#c6cedb] outline-none transition-[color,background-color,transform] hover:bg-[#202b38] hover:text-white active:scale-[.96] focus-visible:ring-2 focus-visible:ring-[#6f9bea] motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain" role="region" aria-label="Job brief details" tabIndex={0}>
              <div className="relative isolate overflow-hidden bg-[#151d27] px-5 pb-7 pt-7 sm:px-8">
                <div className="relative">
                  <div className="flex items-center gap-3.5">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-black/10 px-1.5" style={{ backgroundColor: visual.background, color: visual.foreground }}>
                      <CompanyMark compact company={job.company} className="max-h-9 max-w-10" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white/90">{job.company}</p>
                    </div>
                  </div>

                  <Dialog.Title className="mt-5 text-balance font-display text-[clamp(1.7rem,6.4vw,2.3rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-white">
                    {job.title}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    A concise in-app brief for {job.title} at {job.company}, including the employer’s description, requirements, and official listing link.
                  </Dialog.Description>

                  <p className="mt-5 font-display text-[clamp(1.4rem,5.7vw,1.85rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">{job.salaryDisplay}</p>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4">
                    <Fact icon={<MapPin className="size-3 text-[#6f9bea]" aria-hidden="true" />} label="Location" value={job.location} />
                    <Fact icon={<Laptop2 className="size-3 text-[#6f9bea]" aria-hidden="true" />} label="Work mode" value={job.workArrangement === "Unclear" ? "Not stated" : job.workArrangement} />
                    <Fact icon={<BriefcaseBusiness className="size-3 text-[#6f9bea]" aria-hidden="true" />} label="Type" value={job.employmentType} />
                    <Fact icon={<ArrowUpRight className="size-3 text-[#6f9bea]" aria-hidden="true" />} label="Source" value={read.source} />
                  </dl>
                </div>
              </div>

              <div className="mx-auto w-full max-w-xl px-5 pb-10 sm:px-8">
                <BriefSection label="Overview">
                  <p className="whitespace-pre-line text-[14px] leading-7 tracking-[-0.01em] text-[#c7cfdb]">{job.summary}</p>
                </BriefSection>

                {requirements.length > 0 ? (
                  <BriefSection label="Requirements">
                    <ul className="space-y-3">
                      {requirements.map((requirement) => (
                        <li key={requirement} className="grid grid-cols-[0.8rem_1fr] gap-2.5 text-[13px] leading-6 text-[#bec7d5]">
                          <span aria-hidden="true" className="mt-[0.72rem] h-px w-2 bg-[#4f7fd8]" />
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  </BriefSection>
                ) : null}

                <BriefSection label="Description">
                  <details className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-[12px] font-semibold text-[#d4dae5] outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 [&::-webkit-details-marker]:hidden">
                      Full description
                      <span aria-hidden="true" className="ml-auto text-lg font-light text-[#8792a5]">+</span>
                    </summary>
                    <p className="mt-4 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#aeb8c8]">{description}</p>
                  </details>
                </BriefSection>
              </div>
            </div>

            <div className="relative z-30 grid shrink-0 grid-cols-[.8fr_.8fr_1.4fr] gap-2 border-t border-[#2b3542] bg-[#0f151d] px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
              <button type="button" onClick={() => onDecision("skipped")} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#303b49] bg-[#18212c] px-3 text-[12px] font-semibold text-[#aab4c5] outline-none active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#6f9bea] motion-reduce:transition-none">
                <X className="size-4" aria-hidden="true" /> Pass
              </button>
              <button type="button" onClick={() => onDecision("saved")} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#303b49] bg-[#18212c] px-3 text-[12px] font-semibold text-white outline-none active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#6f9bea] motion-reduce:transition-none">
                <Heart className="size-4" aria-hidden="true" /> Save
              </button>
              <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#4f7fd8] px-3 text-[12px] font-semibold text-white outline-none hover:bg-[#6693e2] focus-visible:ring-2 focus-visible:ring-[#8caef0]">
                Open listing <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
