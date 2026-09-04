"use client";

import { useEffect, type RefObject } from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Heart,
  Laptop2,
  MapPin,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
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
  const template = jobCardTemplateForCompany(job.company);
  const description = job.description?.trim() || job.summary;
  const requirements = job.requirements ?? [];

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#02040a]/80 opacity-100 backdrop-blur-xl transition-opacity duration-250 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative isolate flex h-full w-full translate-y-0 flex-col overflow-hidden border border-white/[0.11] bg-[#070b14]/[0.99] text-white shadow-[0_32px_100px_rgba(0,0,0,.58)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(.22,1,.36,1)] data-[ending-style]:translate-y-10 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-10 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[1.75rem]"
          >
            <header className="safe-area-dialog-header relative z-30 flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#070b14]/90 px-4 backdrop-blur-2xl sm:h-14 sm:px-5 sm:pt-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[#77839a]">Job brief</p>
                <p className="mt-0.5 truncate text-[11px] text-[#aeb7c7]">Official {read.source} feed · {read.freshness.toLocaleLowerCase("en-US")}</p>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Close job brief"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.05] text-[#c6cedb] outline-none transition-[color,background-color,transform] hover:bg-white/[0.1] hover:text-white active:scale-[.96] focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain" role="region" aria-label="Job brief details" tabIndex={0}>
              <div
                className="relative isolate overflow-hidden px-5 pb-7 pt-7 sm:px-8"
                style={{
                  backgroundColor: template.backgroundColor,
                  backgroundImage: template.backgroundImage,
                  backgroundPosition: template.backgroundPosition,
                  backgroundSize: template.backgroundSize,
                }}
              >
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(178deg,rgba(5,9,17,.76)_0%,rgba(6,10,19,.7)_48%,rgba(7,11,20,.98)_100%),radial-gradient(circle_at_18%_-4%,rgba(255,255,255,.14),transparent_38%)]" />
                <div className="relative">
                  <div className="flex items-center gap-3.5">
                    <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[1.05rem] border border-white/[0.2] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_14px_34px_rgba(0,0,0,.32)]" style={{ backgroundColor: visual.background, color: visual.foreground }}>
                      <CompanyMark compact company={job.company} className="max-h-9 max-w-10" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white/90">{job.company}</p>
                      <p className="mt-0.5 text-[11.5px] text-white/55">Official public job board</p>
                    </div>
                  </div>

                  <Dialog.Title className="mt-5 text-balance font-display text-[clamp(1.7rem,6.4vw,2.3rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-white">
                    {job.title}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    A concise in-app brief for {job.title} at {job.company}, including the employer’s description, requirements, and official listing link.
                  </Dialog.Description>

                  <p className="mt-5 font-display text-[clamp(1.4rem,5.7vw,1.85rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">{job.salaryDisplay}</p>
                  <p className="mt-1.5 text-[11px] text-white/55">{job.estimatedSalary ? "Market estimate — employer pay not posted" : "Compensation posted by the employer"}</p>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4">
                    <Fact icon={<MapPin className="size-3 text-[#9a91ff]" aria-hidden="true" />} label="Location" value={job.location} />
                    <Fact icon={<Laptop2 className="size-3 text-[#9a91ff]" aria-hidden="true" />} label="Work setup" value={job.workArrangement === "Unclear" ? "Not stated" : job.workArrangement} />
                    <Fact icon={<BriefcaseBusiness className="size-3 text-[#9a91ff]" aria-hidden="true" />} label="Employment" value={job.employmentType} />
                    <Fact icon={<ArrowUpRight className="size-3 text-[#9a91ff]" aria-hidden="true" />} label="Source" value={read.source} />
                  </dl>
                </div>
              </div>

              <div className="mx-auto w-full max-w-xl px-5 pb-10 sm:px-8">
                <BriefSection label="Why this reached you">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#59d2a2]/15 bg-[#59d2a2]/[0.06] p-3.5">
                      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#72dbb2]"><Sparkles className="size-3.5" aria-hidden="true" /> Fit signal</p>
                      <p className="mt-2 text-[13px] leading-5 text-[#c7d0dc]">{read.fit}</p>
                    </div>
                    <div className="rounded-2xl border border-[#aaa3ff]/15 bg-[#8176ff]/[0.07] p-3.5">
                      <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#b9b3ff]"><ShieldAlert className="size-3.5" aria-hidden="true" /> Verify</p>
                      <p className="mt-2 text-[13px] leading-5 text-[#bec7d5]">{read.risk}</p>
                    </div>
                  </div>
                </BriefSection>

                <BriefSection label="Role overview">
                  <p className="whitespace-pre-line text-[14px] leading-7 tracking-[-0.01em] text-[#c7cfdb]">{job.summary}</p>
                </BriefSection>

                <BriefSection label="Requirements found in the listing">
                  {requirements.length > 0 ? (
                    <ul className="space-y-3">
                      {requirements.map((requirement) => (
                        <li key={requirement} className="grid grid-cols-[0.8rem_1fr] gap-2.5 text-[13px] leading-6 text-[#bec7d5]">
                          <span aria-hidden="true" className="mt-[0.72rem] h-px w-2 bg-[#8176ff]" />
                          <span>{requirement}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] leading-6 text-[#8692a6]">The public feed did not separate its requirements clearly. Review the employer text below before applying.</p>
                  )}
                </BriefSection>

                <BriefSection label="Employer listing text">
                  <details className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-[12px] font-semibold text-[#d4dae5] outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 [&::-webkit-details-marker]:hidden">
                      Read the ATS description
                      <span aria-hidden="true" className="ml-auto text-lg font-light text-[#8792a5]">+</span>
                    </summary>
                    <p className="mt-4 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#aeb8c8]">{description}</p>
                  </details>
                  <p className="mt-3 text-[10.5px] leading-4 text-[#68758a]">This text comes from the company’s public ATS feed. The official listing is the source of truth.</p>
                </BriefSection>
              </div>
            </div>

            <div className="relative z-30 grid shrink-0 grid-cols-[.8fr_.8fr_1.4fr] gap-2 border-t border-white/[0.08] bg-[#070b14]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl sm:px-5 sm:pb-3">
              <button type="button" onClick={() => onDecision("skipped")} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.1] bg-white/[0.035] px-3 text-[12px] font-semibold text-[#aab4c5] outline-none active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none">
                <X className="size-4" aria-hidden="true" /> Pass
              </button>
              <button type="button" onClick={() => onDecision("saved")} className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.13] bg-white/[0.07] px-3 text-[12px] font-semibold text-white outline-none active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none">
                <Heart className="size-4" aria-hidden="true" /> Save
              </button>
              <a href={job.sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-[#8f85ff]/70 bg-[#8176ff]/15 px-3 text-[12px] font-semibold text-[#d9d6ff] outline-none hover:bg-[#8176ff]/25 focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70">
                Official listing <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
