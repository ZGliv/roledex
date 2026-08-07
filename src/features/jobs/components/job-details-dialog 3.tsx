"use client";

import Link from "next/link";
import {
  memo,
  type RefObject,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  BookmarkPlus,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  FileText,
  Heart,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldAlert,
  UsersRound,
  X,
} from "lucide-react";

import type { DeckDecision } from "@/features/decisions/policy";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import type {
  CompanyIntelligence,
  JobCompanyPayload,
  JobDossierPayload,
} from "@/features/jobs/dossier";

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

const salarySourceLabel = {
  employer_posted: "Employer posted",
  externally_estimated: "Market estimate",
  unknown: "Estimated range",
} as const;

type RequestState<T> =
  | { jobId: string; status: "loading" }
  | { error: string; jobId: string; status: "error" }
  | { data: T; jobId: string; status: "ready" };

function readableDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function experienceRange(listing: JobDossierPayload["listing"] | null) {
  if (!listing) return null;
  const minimum = listing.yearsExperienceMinimum;
  const maximum = listing.yearsExperienceMaximum;
  if (minimum === null && maximum === null) return null;
  if (minimum !== null && maximum !== null && minimum !== maximum) {
    return `${minimum}–${maximum} years`;
  }
  const value = minimum ?? maximum;
  return value === null ? null : `${value}+ years`;
}

function DossierFact({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="min-w-0 border-t border-[#27324a]/[0.08] py-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a93a3]">
        {label}
      </dt>
      <dd className="mt-1.5 text-[13px] font-medium leading-5 text-[#384357]">
        {value}
      </dd>
    </div>
  );
}

function ExternalPill({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#283750]/[0.09] bg-white/46 px-3.5 text-[11px] font-semibold text-[#4d596c] outline-none transition-[background-color,border-color,transform] hover:border-[#283750]/[0.16] hover:bg-white/82 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      {label}
      <ArrowUpRight className="size-3" aria-hidden="true" />
    </a>
  );
}

function CompanyDossier({
  company,
  companyName,
}: {
  company: CompanyIntelligence;
  companyName: string;
}) {
  const wikipediaHref = company.wikipediaUrl ?? company.wikipediaSearchUrl;
  const researchedAt = readableDate(company.researchedAt);

  return (
    <section
      className="mt-8 overflow-hidden rounded-[1.5rem] border border-white/60 bg-white/[0.34] shadow-[0_16px_42px_rgba(30,45,67,.07)] backdrop-blur-xl"
      aria-labelledby="company-dossier-heading"
    >
      <div className="border-b border-[#27324a]/[0.08] px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-[#665fdb]">
          <Building2 className="size-4" aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em]">
            Company dossier
          </p>
        </div>
        <h3
          id="company-dossier-heading"
          className="mt-2 text-[1.35rem] font-semibold tracking-[-0.045em] text-[#172033]"
        >
          About {companyName}
        </h3>
        {company.description ? (
          <p className="mt-1 text-[12px] leading-5 text-[#7a8495]">
            {company.description}
          </p>
        ) : null}
      </div>

      <div className="px-5 py-5 sm:px-6">
        {company.overview ? (
          <p className="whitespace-pre-line text-[14px] leading-7 tracking-[-0.01em] text-[#4f5b6e]">
            {company.overview}
          </p>
        ) : (
          <p className="text-[13px] leading-6 text-[#7a8495]">
            {company.status === "unavailable"
              ? "Public company research is temporarily unavailable. The official and Wikipedia links below remain available."
              : "No verified company history was available from the public sources checked."}
          </p>
        )}

        <dl className="mt-5 grid grid-cols-2 gap-x-5">
          <DossierFact label="Founded" value={company.founded} />
          <DossierFact
            label="Headquarters"
            value={company.headquarters.length > 0 ? company.headquarters.join(", ") : null}
          />
          <DossierFact
            label="Industry"
            value={company.industries.length > 0 ? company.industries.join(", ") : null}
          />
          <DossierFact
            label="Employees"
            value={
              company.employeeCount
                ? `${company.employeeCount.value.toLocaleString()}${
                    company.employeeCount.asOf
                      ? ` (${company.employeeCount.asOf})`
                      : ""
                  }`
                : null
            }
          />
          <DossierFact label="Parent company" value={company.parentOrganization} />
        </dl>

        {company.notableFigures.length > 0 ? (
          <div className="mt-6 border-t border-[#27324a]/[0.08] pt-5">
            <div className="flex items-center gap-2 text-[#667185]">
              <UsersRound className="size-4" aria-hidden="true" />
              <h4 className="text-[11px] font-semibold">Leadership & founders</h4>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {company.notableFigures.map((figure) => {
                const body = (
                  <>
                    <span className="block text-[12px] font-semibold text-[#303b4f]">
                      {figure.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-[#858e9d]">
                      {figure.roles.join(" · ")}
                    </span>
                  </>
                );
                return figure.wikipediaUrl ? (
                  <a
                    key={figure.name}
                    href={figure.wikipediaUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-[#27324a]/[0.08] bg-white/38 px-3.5 py-3 outline-none transition-colors hover:bg-white/72 focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {body}
                  </a>
                ) : (
                  <div
                    key={figure.name}
                    className="rounded-xl border border-[#27324a]/[0.08] bg-white/30 px-3.5 py-3"
                  >
                    {body}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[9px] leading-4 text-[#939ba8]">
              Public-data leadership records can lag company changes; verify names before outreach.
            </p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-[#27324a]/[0.08] pt-5">
          {company.officialWebsite ? (
            <ExternalPill href={company.officialWebsite} label="Official website" />
          ) : null}
          <ExternalPill
            href={wikipediaHref}
            label={company.wikipediaUrl ? "Wikipedia" : "Search Wikipedia"}
          />
          {company.wikidataUrl ? (
            <ExternalPill href={company.wikidataUrl} label="Wikidata" />
          ) : null}
        </div>

        <p className="mt-4 text-[9px] leading-4 text-[#969eaa]">
          {company.overviewSource === "wikipedia"
            ? "Background from Wikipedia (CC BY-SA); structured facts from Wikidata (CC0)."
            : company.overviewSource === "employer_listing"
              ? "Background supplied by the employer in this job listing."
              : company.status === "not_found"
                ? "No exact Wikipedia company page was confidently matched."
                : "Public company data could not be refreshed."}
          {researchedAt ? ` Checked ${researchedAt}.` : ""}
        </p>
      </div>
    </section>
  );
}

function LoadingDossier({ label }: { label: string }) {
  return (
    <div
      className="mt-6 flex items-center gap-3 rounded-2xl border border-white/55 bg-white/28 px-4 py-4 text-[12px] text-[#778295]"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function DossierError({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#c88a72]/20 bg-[#fff6f1]/70 px-4 py-3.5 text-[12px] leading-5 text-[#805d4f]">
      <span className="min-w-0 flex-1">{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/55 outline-none hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label="Retry loading"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function fitLabel(verdict: JobCardViewModel["verdict"]) {
  if (verdict === "Strong Apply") return "Strong fit";
  if (verdict === "Apply") return "Worth a look";
  if (verdict === "Apply as a Stretch") return "Stretch";
  if (verdict === "Learn First") return "Learn first";
  if (verdict === "Skip") return "Low fit";
  return "Consider";
}

function DetailList({ items }: { items: readonly string[] }) {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return <p className="text-sm text-[#7b8494]">Not specified in the listing.</p>;
  }

  return (
    <ul className="space-y-3">
      {visibleItems.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="flex gap-3 text-[13px] leading-6 text-[#5c6678]"
        >
          <span
            className="mt-[0.65rem] size-1 shrink-0 rounded-full bg-[#858e9d]"
            aria-hidden="true"
          />
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
  children: ReactNode;
  title: string;
}) {
  return (
    <details className="group border-t border-[#27324a]/[0.07]">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-4 text-[13px] font-semibold text-[#263044] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="ml-auto size-3.5 text-[#929aaa] transition-transform duration-300 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-6">{children}</div>
    </details>
  );
}

function InsightRow({
  children,
  label,
  tone = "positive",
}: {
  children: ReactNode;
  label: string;
  tone?: "positive" | "caution";
}) {
  return (
    <div className="grid grid-cols-[1.75rem_1fr] gap-3 border-t border-white/10 py-4 first:border-0 first:pt-0 last:pb-0">
      <span
        className={`mt-0.5 grid size-7 place-items-center rounded-lg ${
          tone === "caution"
            ? "bg-[#ffbe6b]/12 text-[#ffcb85]"
            : "bg-[#8b82ff]/14 text-[#aaa4ff]"
        }`}
      >
        {tone === "caution" ? (
          <ShieldAlert className="size-3.5" aria-hidden="true" />
        ) : (
          <Check className="size-3.5" aria-hidden="true" />
        )}
      </span>
      <div>
        <p className="text-[11px] font-semibold text-white/48">
          {label}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-white/74">{children}</p>
      </div>
    </div>
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
  const [dossierState, setDossierState] = useState<
    RequestState<JobDossierPayload> | null
  >(null);
  const [companyState, setCompanyState] = useState<
    RequestState<JobCompanyPayload> | null
  >(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const visual = companyVisual(job.company);
  const workLabel =
    job.workArrangement !== "Unclear" ? job.workArrangement : job.employmentType;
  const strongestMatch =
    job.decisionBrief?.edge ??
    job.strongestMatches[0] ??
    job.reasonsToApply[0] ??
    "A plausible role to investigate.";
  const biggestRisk =
    job.decisionBrief?.risk ??
    job.biggestGaps[0] ??
    job.reasonsNotToApply[0] ??
    "Confirm the requirements before applying.";
  const bestMove =
    job.decisionBrief?.positioningMove ??
    job.reasonsToApply.find((reason) => reason !== strongestMatch) ??
    job.strongestMatches[1] ??
    "Lead with the closest evidence from your current work and portfolio.";
  const visibleWarnings = Array.from(
    new Set(
      job.warnings.map((warning) =>
        job.salaryIsEstimate &&
        /salary|compensation/i.test(warning) &&
        /unknown|not found|not posted/i.test(warning)
          ? "The employer did not post pay; this role uses a market estimate."
          : warning,
      ),
    ),
  );
  const dossier =
    dossierState?.jobId === job.id && dossierState.status === "ready"
      ? dossierState.data
      : null;
  const company =
    companyState?.jobId === job.id && companyState.status === "ready"
      ? companyState.data.company
      : null;
  const listingCopied = copiedJobId === job.id;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setDossierState({ jobId: job.id, status: "loading" });
      setCompanyState({ jobId: job.id, status: "loading" });
    });

    void fetch(`/api/jobs/${encodeURIComponent(job.id)}/dossier`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("The full listing could not be loaded.");
        return (await response.json()) as JobDossierPayload;
      })
      .then((data) => {
        setDossierState({ data, jobId: job.id, status: "ready" });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setDossierState({
          error:
            requestError instanceof Error
              ? requestError.message
              : "The full listing could not be loaded.",
          jobId: job.id,
          status: "error",
        });
      });

    void fetch(`/api/jobs/${encodeURIComponent(job.id)}/company`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Company research could not be loaded.");
        return (await response.json()) as JobCompanyPayload;
      })
      .then((data) => {
        setCompanyState({ data, jobId: job.id, status: "ready" });
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setCompanyState({
          error:
            requestError instanceof Error
              ? requestError.message
              : "Company research could not be loaded.",
          jobId: job.id,
          status: "error",
        });
      });

    return () => controller.abort();
  }, [job.id, open, retryVersion]);

  useEffect(() => {
    if (!copiedJobId) return;
    const timer = window.setTimeout(() => setCopiedJobId(null), 1_800);
    return () => window.clearTimeout(timer);
  }, [copiedJobId]);

  const retryDossier = () => setRetryVersion((version) => version + 1);
  const copyListing = async () => {
    if (!dossier?.listing.descriptionRaw) return;
    try {
      await navigator.clipboard.writeText(dossier.listing.descriptionRaw);
      setCopiedJobId(job.id);
    } catch {
      setCopiedJobId(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#09111f]/42 opacity-100 backdrop-blur-xl transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative isolate flex h-full w-full translate-y-0 flex-col overflow-hidden border border-white/55 bg-[#f3f6fa]/[0.8] text-[#111827] shadow-[0_32px_90px_rgba(7,14,29,.22)] backdrop-blur-[30px] transition-[transform,opacity] duration-350 ease-[cubic-bezier(.22,1,.36,1)] data-[ending-style]:translate-y-12 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-12 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:scale-100 sm:rounded-[1.75rem] sm:data-[ending-style]:translate-y-0 sm:data-[ending-style]:scale-[.97] sm:data-[starting-style]:translate-y-0 sm:data-[starting-style]:scale-[.97]"
          >
            <div className="safe-area-dialog-header relative z-20 flex shrink-0 items-center gap-3 border-b border-[#27324a]/[0.08] bg-white/[0.36] px-4 backdrop-blur-xl sm:h-15 sm:px-5 sm:pt-0">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[#8a93a3]">
                  Job dossier
                </p>
                <Dialog.Title className="mt-0.5 truncate text-[13px] font-semibold tracking-[-0.02em] text-[#20293a]">
                  {job.title}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  A complete role, company, fit, and source report for this job.
                </Dialog.Description>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Close role brief"
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#283750]/[0.07] bg-white/52 text-[#697487] shadow-[0_1px_2px_rgba(18,28,46,.04)] outline-none transition-[color,background-color,border-color,transform] duration-150 hover:border-[#283750]/[0.11] hover:bg-white/86 hover:text-[#20293a] active:scale-[.97] focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div
              className="relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25"
              tabIndex={0}
              role="region"
              aria-label="Job dossier content"
            >
              <div className="mx-auto w-full max-w-2xl px-4 pb-9 pt-4 sm:px-7 sm:pb-10 sm:pt-7">
                <section className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 border-b border-[#27324a]/[0.08] pb-5 sm:grid-cols-[4rem_1fr_auto]">
                  <div
                    className="relative grid size-14 place-items-center overflow-hidden rounded-2xl border border-white/70 px-2 shadow-[0_4px_14px_rgba(20,28,48,.06)] sm:size-16"
                    style={{ backgroundColor: visual.background, color: visual.foreground }}
                  >
                    <CompanyMark
                      compact
                      company={job.company}
                      className="relative max-h-10 max-w-11"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[10px] font-semibold text-[#7b8494]">
                      {job.company}
                    </p>
                    <h2 className="mt-1 line-clamp-2 text-[1.15rem] font-semibold leading-[1.08] tracking-[-0.04em] text-[#111827] sm:text-[1.35rem]">
                      {job.title}
                    </h2>
                  </div>
                  <div className="text-right">
                    <p className="max-w-20 text-[11px] font-bold leading-4 tracking-[-0.02em] text-[#554dcc]">
                      {fitLabel(job.verdict)}
                    </p>
                    <p className="mt-0.5 text-[9px] font-medium text-[#969eab]">
                      Profile fit
                    </p>
                  </div>
                </section>

                <section className="grid grid-cols-2 border-b border-[#27324a]/[0.08]" aria-label="Key listing facts">
                  <div className="min-w-0 border-r border-[#27324a]/[0.08] py-4 pr-4">
                    <div className="flex items-center gap-1.5 text-[#7770ec]">
                      <CircleDollarSign className="size-3.5" aria-hidden="true" />
                      <p className="text-[10px] font-semibold">
                        Compensation
                      </p>
                    </div>
                    <p className="mt-1.5 text-[11px] font-semibold leading-4 tracking-[-0.02em] text-[#263044]">
                      {job.salaryDisplay}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] text-[#8992a2]">
                      {salarySourceLabel[job.salarySource]}
                    </p>
                  </div>
                  <div className="min-w-0 py-4 pl-4">
                    <div className="flex items-center gap-1.5 text-[#7d8798]">
                      <MapPin className="size-3.5" aria-hidden="true" />
                      <p className="text-[10px] font-semibold">
                        Location
                      </p>
                    </div>
                    <p className="mt-1.5 truncate text-[12px] font-semibold tracking-[-0.02em] text-[#263044]">
                      {workLabel}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] text-[#8992a2]">
                      {job.location}
                    </p>
                  </div>
                </section>

                <dl
                  className="grid grid-cols-2 gap-x-5 border-b border-[#27324a]/[0.08] pb-1"
                  aria-label="Complete role facts"
                >
                  <DossierFact label="Employment" value={job.employmentType} />
                  <DossierFact label="Seniority" value={job.seniority} />
                  <DossierFact
                    label="Experience"
                    value={experienceRange(dossier?.listing ?? null)}
                  />
                  <DossierFact
                    label="Industry"
                    value={dossier?.listing.industry ?? null}
                  />
                  <DossierFact label="Posted" value={job.datePosted} />
                  <DossierFact
                    label="Apply by"
                    value={job.applicationDeadline}
                  />
                  <DossierFact
                    label="Travel"
                    value={job.travelRequirement}
                  />
                  <DossierFact
                    label="Remote limits"
                    value={dossier?.listing.remoteRestriction ?? null}
                  />
                </dl>

                <section className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#111a2a]/[0.92] p-5 text-white shadow-[0_12px_30px_rgba(13,22,39,.14)] sm:p-6" aria-labelledby={`brief-${job.id}`}>
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-medium text-white/45">
                          The 20-second read
                        </p>
                        <h3 id={`brief-${job.id}`} className="mt-1.5 text-xl font-semibold tracking-[-0.04em]">
                          {job.verdict}
                        </h3>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-semibold tabular-nums text-white/88">
                          {job.careerValueScore.toFixed(1)} <span className="font-medium text-white/38">career value</span>
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-[13px] leading-5 text-white/58">
                      {job.verdictExplanation}
                    </p>
                    <div className="mt-5">
                      <InsightRow label="Your edge">{strongestMatch}</InsightRow>
                      <InsightRow label="Biggest risk" tone="caution">
                        {biggestRisk}
                      </InsightRow>
                      <InsightRow label="Best move">{bestMove}</InsightRow>
                    </div>
                  </div>
                </section>

                <section className="mt-7">
                  <p className="text-[11px] font-semibold text-[#7c8595]">
                    What this role really is
                  </p>
                  <p className="mt-2 text-[15px] leading-7 tracking-[-0.01em] text-[#4f5a6d]">
                    {job.summary}
                  </p>
                </section>

                <section className="mt-7">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold text-[#7c8595]">
                      Responsibilities
                    </p>
                    <span className="text-[9px] font-medium text-[#a0a7b2]">
                      {job.readiness}
                    </span>
                  </div>
                  <div className="mt-3 border-y border-[#27324a]/[0.08] py-4">
                    <DetailList items={job.responsibilities} />
                  </div>
                </section>

                {job.technologies.length > 0 ? (
                  <section className="mt-6">
                    <p className="text-[11px] font-semibold text-[#7c8595]">
                      Skills in the listing
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {job.technologies.map((technology) => (
                        <span
                          key={technology}
                          className="rounded-lg border border-[#27324a]/[0.08] bg-white/38 px-2.5 py-1.5 text-[10px] font-medium text-[#687386]"
                        >
                          {technology}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                <button
                  type="button"
                  onClick={() => onDecision("stretch")}
                  disabled={pending}
                  className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#635ae1]/15 bg-[#eeecff]/70 px-4 text-[12px] font-semibold text-[#554dcc] shadow-[0_1px_2px_rgba(40,32,115,.05)] outline-none transition-[background-color,border-color,transform] duration-150 hover:border-[#635ae1]/22 hover:bg-[#e7e4ff]/90 active:scale-[.99] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none"
                >
                  <BookmarkPlus className="size-4" aria-hidden="true" />
                  Save as a stretch
                </button>

                <div className="mt-7">
                  <Disclosure title="What they want">
                    <div className="space-y-6">
                      <div>
                        <p className="mb-3 text-[11px] font-semibold text-[#7c8595]">
                          Required
                        </p>
                        <DetailList items={job.requiredQualifications} />
                      </div>
                      {job.preferredQualifications.length > 0 ? (
                        <div>
                          <p className="mb-3 text-[11px] font-semibold text-[#7c8595]">
                            Preferred
                          </p>
                          <DetailList items={job.preferredQualifications} />
                        </div>
                      ) : null}
                      {dossier?.listing.experienceRequirements.length ? (
                        <div>
                          <p className="mb-3 text-[11px] font-semibold text-[#7c8595]">
                            Experience
                          </p>
                          <DetailList
                            items={dossier.listing.experienceRequirements}
                          />
                        </div>
                      ) : null}
                    </div>
                  </Disclosure>

                  {dossier?.listing.benefits.length ? (
                    <Disclosure title="Benefits in the listing">
                      <DetailList items={dossier.listing.benefits} />
                    </Disclosure>
                  ) : null}

                  <Disclosure title="Reasons to pursue">
                    <DetailList items={job.reasonsToApply} />
                  </Disclosure>

                  <Disclosure title="Reasons to pause">
                    <div className="space-y-5">
                      <DetailList items={job.reasonsNotToApply} />
                      {visibleWarnings.length > 0 ? (
                        <div className="rounded-xl border border-[#d8b779]/25 bg-[#fff5e7]/75 p-4 text-[#765b31]">
                          <DetailList items={visibleWarnings} />
                        </div>
                      ) : null}
                    </div>
                  </Disclosure>

                  {job.salaryIsEstimate ? (
                    <Disclosure title="How pay was estimated">
                      <div className="border-l-2 border-[#6d64dc]/30 pl-4 text-[12px] leading-5 text-[#687386]">
                        <p>{job.salaryDisclosure}</p>
                        <p className="mt-2 text-[#858e9e]">{job.salaryMethod}</p>
                        {job.salarySourceUrl ? (
                          <a
                            href={job.salarySourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-3 inline-flex items-center gap-1.5 font-semibold text-[#5b53d4] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            {job.salarySourceName}
                            <ArrowUpRight className="size-3" aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </Disclosure>
                  ) : null}

                  <Disclosure title="Why the fit score looks this way">
                    <div className="space-y-4">
                      <div className="grid gap-5 border-b border-[#27324a]/[0.08] pb-5 sm:grid-cols-2">
                        <div>
                          <p className="mb-3 text-[11px] font-semibold text-[#7c8595]">
                            Strongest matches
                          </p>
                          <DetailList items={job.strongestMatches} />
                        </div>
                        <div>
                          <p className="mb-3 text-[11px] font-semibold text-[#7c8595]">
                            Biggest gaps
                          </p>
                          <DetailList items={job.biggestGaps} />
                        </div>
                      </div>
                      {job.scoreBreakdown.map((item) => (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 text-[12px]">
                          <div>
                            <p className="font-semibold text-[#303a4d]">{item.label}</p>
                            <p className="mt-1 leading-5 text-[#758093]">{item.note}</p>
                          </div>
                          <span className="font-semibold tabular-nums text-[#555f71]">
                            {item.score.toFixed(1)}
                          </span>
                        </div>
                      ))}
                      <p className="text-[10px] text-[#949caa]">
                        Based on {job.deterministicFitCoverage}% listing coverage.
                      </p>
                    </div>
                  </Disclosure>
                </div>

                {company ? (
                  <CompanyDossier company={company} companyName={job.company} />
                ) : companyState?.jobId === job.id &&
                  companyState.status === "error" ? (
                  <DossierError
                    label="Company research could not be refreshed. The role details are still complete."
                    onRetry={retryDossier}
                  />
                ) : (
                  <LoadingDossier label={`Researching ${job.company}…`} />
                )}

                <section
                  className="mt-8 overflow-hidden rounded-[1.5rem] border border-[#27324a]/[0.09] bg-white/[0.42] shadow-[0_14px_36px_rgba(24,38,61,.06)]"
                  aria-labelledby={`full-listing-${job.id}`}
                >
                  <div className="flex items-start gap-3 border-b border-[#27324a]/[0.08] px-5 py-5 sm:px-6">
                    <FileText className="mt-0.5 size-4 shrink-0 text-[#6d65df]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#817ae5]">
                        Full source
                      </p>
                      <h3
                        id={`full-listing-${job.id}`}
                        className="mt-1 text-[1.2rem] font-semibold tracking-[-0.04em] text-[#1c2638]"
                      >
                        Complete job listing
                      </h3>
                      <p className="mt-1 text-[10px] leading-4 text-[#8a93a3]">
                        Full wording captured from the employer source; spacing may be normalized by the feed.
                      </p>
                    </div>
                    {dossier ? (
                      <button
                        type="button"
                        onClick={() => void copyListing()}
                        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[#27324a]/[0.09] bg-white/50 px-3 text-[10px] font-semibold text-[#596579] outline-none hover:bg-white/85 focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-label="Copy the complete job listing"
                      >
                        {listingCopied ? (
                          <Check className="size-3.5" aria-hidden="true" />
                        ) : (
                          <Copy className="size-3.5" aria-hidden="true" />
                        )}
                        {listingCopied ? "Copied" : "Copy"}
                      </button>
                    ) : null}
                  </div>

                  {dossier ? (
                    <div className="px-5 py-6 sm:px-6">
                      <div className="whitespace-pre-wrap break-words text-[13px] leading-7 text-[#4f5b6e]">
                        {dossier.listing.descriptionRaw}
                      </div>
                      <div className="mt-7 flex flex-wrap gap-2 border-t border-[#27324a]/[0.08] pt-5">
                        {dossier.listing.canonicalListingUrl ? (
                          <ExternalPill
                            href={dossier.listing.canonicalListingUrl}
                            label="View original listing"
                          />
                        ) : null}
                        {job.sourceUrl &&
                        job.sourceUrl !== dossier.listing.canonicalListingUrl ? (
                          <ExternalPill href={job.sourceUrl} label="Open application" />
                        ) : null}
                      </div>
                      <dl className="mt-5 grid grid-cols-2 gap-x-5">
                        <DossierFact
                          label="Captured"
                          value={readableDate(dossier.listing.retrievedAt)}
                        />
                        <DossierFact
                          label="Source updated"
                          value={readableDate(dossier.listing.sourceUpdatedAt)}
                        />
                        <DossierFact
                          label="First seen"
                          value={readableDate(dossier.listing.firstSeenAt)}
                        />
                        <DossierFact
                          label="Last seen"
                          value={readableDate(dossier.listing.lastSeenAt)}
                        />
                      </dl>
                      <p className="mt-3 text-[9px] text-[#9aa1ad]">
                        Listing revision {dossier.listing.revisionNumber} · Parser {dossier.listing.parserVersion}
                      </p>
                    </div>
                  ) : dossierState?.jobId === job.id &&
                    dossierState.status === "error" ? (
                    <div className="px-5 pb-5 sm:px-6">
                      <DossierError
                        label="The complete source text could not be loaded."
                        onRetry={retryDossier}
                      />
                    </div>
                  ) : (
                    <div className="px-5 pb-5 sm:px-6">
                      <LoadingDossier label="Loading the complete listing…" />
                    </div>
                  )}
                </section>

                <Link
                  href={`/jobs/${job.id}`}
                  className="mt-5 flex min-h-11 items-center gap-2 rounded-xl px-2 text-[11px] font-semibold text-[#6b7587] outline-none transition-colors hover:bg-white/44 hover:text-[#353f52] focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  Open as a standalone report
                  <ArrowUpRight className="ml-auto size-3.5" aria-hidden="true" />
                </Link>

                <p className="mt-3 text-center text-[9px] text-[#a0a7b2]">
                  {job.employmentType} · {job.sourceName}
                  {job.datePosted ? ` · ${job.datePosted}` : ""}
                </p>
              </div>
            </div>

            <div className="relative z-20 grid shrink-0 grid-cols-3 gap-2 border-t border-[#27324a]/[0.08] bg-white/[0.42] px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:px-5 sm:pb-3">
              <button
                type="button"
                onClick={() => onDecision("skipped")}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#29374f]/[0.1] bg-white/60 px-3 text-[12px] font-semibold text-[#5b6678] shadow-[0_1px_2px_rgba(18,28,46,.04)] outline-none transition-[background-color,border-color,transform] duration-150 hover:border-[#29374f]/[0.15] hover:bg-white/90 active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#667085]/30 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
                Pass
              </button>
              <button
                type="button"
                onClick={() => onDecision("saved")}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#4e47c8] bg-[#5d56d8] px-3 text-[12px] font-semibold text-white shadow-[0_3px_10px_rgba(66,59,177,.2)] outline-none transition-[background-color,box-shadow,transform] duration-150 hover:bg-[#514acb] hover:shadow-[0_5px_14px_rgba(66,59,177,.24)] active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none"
              >
                <Heart className="size-4" aria-hidden="true" />
                Save
              </button>
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={() => onDecision("apply")}
                  className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#151e2e] bg-[#151e2e] px-3 text-[12px] font-semibold text-white shadow-[0_2px_7px_rgba(15,23,42,.16)] outline-none transition-[background-color,transform] duration-150 hover:bg-[#253149] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none"
                >
                  Apply
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#d8dce4] bg-[#e5e8ee] px-3 text-[12px] font-semibold text-[#959daa]">
                  <BriefcaseBusiness className="size-4" aria-hidden="true" />
                  Apply
                </span>
              )}
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
