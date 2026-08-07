"use client";

import {
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useState,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Heart,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";

import type { DeckDecision } from "@/features/decisions/policy";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import { jobCardTemplateForCompany } from "@/features/jobs/components/job-card-templates";
import type {
  CompanyIntelligence,
  JobCompanyPayload,
  JobDossierPayload,
} from "@/features/jobs/dossier";
import { humanizeEvidence } from "@/features/jobs/humanize-evidence";
import { cn } from "@/lib/utils";

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

type RequestState<T> =
  | { jobId: string; status: "loading" }
  | { error: string; jobId: string; status: "error" }
  | { data: T; jobId: string; status: "ready" };

const salarySourceLabel = {
  employer_posted: "posted by the employer",
  externally_estimated: "market estimate",
  unknown: "estimated range",
} as const;

const GENERIC_INDUSTRY_TOKENS = new Set([
  "business",
  "company",
  "industry",
  "services",
  "software",
  "technology",
]);

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

function uniqueItems(...groups: ReadonlyArray<readonly string[]>) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const group of groups) {
    for (const item of group) {
      const clean = item.trim();
      const key = clean.toLocaleLowerCase("en-US");
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      items.push(clean);
    }
  }

  return items;
}

function normalizedIndustryTokens(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .filter(
      (token) => token.length >= 4 && !GENERIC_INDUSTRY_TOKENS.has(token),
    );
}

function companySupportsIndustry(
  listingIndustry: string | null | undefined,
  company: CompanyIntelligence | null,
) {
  if (!listingIndustry || company?.status !== "verified") return false;
  const listingTokens = normalizedIndustryTokens(listingIndustry);
  if (listingTokens.length === 0) return false;

  return company.industries.some((industry) => {
    const companyTokens = new Set(normalizedIndustryTokens(industry));
    return listingTokens.some((token) => companyTokens.has(token));
  });
}

function isIndustryClaim(
  value: string,
  listingIndustry: string | null | undefined,
) {
  return (
    /\bindustr(?:y|ies)\b/i.test(value) ||
    Boolean(
      listingIndustry &&
        value
          .toLocaleLowerCase("en-US")
          .includes(listingIndustry.toLocaleLowerCase("en-US")),
    )
  );
}

function reliableWarnings(job: JobCardViewModel) {
  return job.warnings
    .filter((warning) => {
      if (
        job.workArrangement !== "Unclear" &&
        /work (?:arrangement|mode).*(?:could not|unknown|unclear|not determined)/i.test(
          warning,
        )
      ) {
        return false;
      }

      if (
        job.salarySource === "employer_posted" &&
        /(?:salary|compensation).*(?:not posted|unknown|not found)/i.test(warning)
      ) {
        return false;
      }

      return true;
    })
    .map((warning) =>
      job.salaryIsEstimate &&
      /salary|compensation/i.test(warning) &&
      /unknown|not found|not posted/i.test(warning)
        ? "The employer did not post pay; this range is a market estimate."
        : warning,
    );
}

/**
 * Mono eyebrow + divider that opens every section of the sheet. The numbering
 * is what makes the sheet scan like a printed spec instead of a chat reply.
 */
function SheetSection({
  children,
  index,
  label,
  trailing,
}: {
  children: ReactNode;
  index: string;
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <section className="detail-section border-t border-white/[0.08] py-7 first:border-t-0">
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="font-mono text-[10px] tracking-[0.14em] text-[#5d6880]"
        >
          {index}
        </span>
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#96a1b6]">
          {label}
        </h3>
        {trailing ? (
          <span className="ml-auto text-[11px] text-[#69758c]">{trailing}</span>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PlainList({
  items,
  emptyLabel = "The listing doesn’t spell this out.",
}: {
  items: readonly string[];
  emptyLabel?: string;
}) {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return <p className="text-[13px] leading-6 text-[#76819a]">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {visibleItems.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="grid grid-cols-[0.9rem_1fr] gap-2.5 text-[13.5px] leading-[1.6] text-[#c3cbd9]"
        >
          <span
            aria-hidden="true"
            className="mt-[0.72rem] h-px w-2.5 bg-[#8176ff]/80"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TechChips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((technology) => (
        <span
          key={technology}
          className="rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[12px] font-medium text-[#c3cbd9] shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
        >
          {technology}
        </span>
      ))}
    </div>
  );
}

function ExternalPill({
  emphasis = false,
  href,
  label,
}: {
  emphasis?: boolean;
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[12px] font-semibold outline-none transition-[background-color,border-color,transform] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60",
        emphasis
          ? "border border-[#8176ff]/70 bg-[#8176ff]/15 text-[#c9c4ff] hover:bg-[#8176ff]/25"
          : "border border-white/[0.1] bg-white/[0.045] text-[#c5ccda] hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white",
      )}
    >
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 py-2 text-[13px] text-[#9ca7ba]"
      role="status"
    >
      <LoaderCircle
        className="size-4 animate-spin text-[#8176ff]"
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

function ErrorRow({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#f09aa9]/20 bg-[#f09aa9]/[0.07] px-4 py-4 text-[13px] leading-5 text-[#efb3bd]">
      <span className="min-w-0 flex-1">{label}</span>
      <button
        type="button"
        onClick={onRetry}
        className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.05] text-[#dce2ed] outline-none hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
        aria-label="Retry loading"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function normalizedPrefix(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US").slice(0, 80);
}

function CompanySection({
  company,
  companyName,
  roleSummary,
}: {
  company: CompanyIntelligence;
  companyName: string;
  roleSummary: string;
}) {
  const wikipediaHref = company.wikipediaUrl ?? company.wikipediaSearchUrl;
  const researchedAt = readableDate(company.researchedAt);
  const verified = company.status === "verified";
  // The employer-listing overview is often the same boilerplate as the role
  // summary shown up top; repeating it makes the sheet read machine-assembled.
  const overviewNormalized = (company.overview ?? "").replace(/\s+/g, " ").trim();
  const summaryNormalized = roleSummary.replace(/\s+/g, " ").trim();
  const overviewRepeatsSummary = Boolean(
    overviewNormalized &&
      summaryNormalized &&
      (normalizedPrefix(overviewNormalized) === normalizedPrefix(summaryNormalized) ||
        overviewNormalized.includes(summaryNormalized.slice(0, 120)) ||
        summaryNormalized.includes(overviewNormalized.slice(0, 120))),
  );
  const overview = overviewRepeatsSummary ? null : company.overview;

  const facts: Array<[string, string | null]> = verified
    ? [
        ["Founded", company.founded],
        [
          "Headquarters",
          company.headquarters.length > 0 ? company.headquarters.join(", ") : null,
        ],
        [
          "Industry",
          company.industries.length > 0 ? company.industries.join(", ") : null,
        ],
        [
          "Employees",
          company.employeeCount
            ? `${company.employeeCount.value.toLocaleString()}${
                company.employeeCount.asOf ? ` (${company.employeeCount.asOf})` : ""
              }`
            : null,
        ],
        ["Parent company", company.parentOrganization],
      ]
    : [];
  const visibleFacts = facts.filter(([, value]) => Boolean(value));

  return (
    <div>
      {overview ? (
        <p className="whitespace-pre-line text-[14px] leading-7 tracking-[-0.01em] text-[#c1c9d6]">
          {overview}
        </p>
      ) : company.description ? (
        <p className="text-[14px] leading-7 text-[#c1c9d6]">{company.description}</p>
      ) : overviewRepeatsSummary ? null : (
        <p className="text-[13px] leading-6 text-[#8c97aa]">
          {company.status === "unavailable"
            ? "Public company research is temporarily unavailable. The links below still work."
            : `No confidently matched public record for ${companyName}.`}
        </p>
      )}

      {visibleFacts.length > 0 ? (
        <dl className="mt-6 grid grid-cols-2 gap-x-5">
          {visibleFacts.map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 border-t border-white/[0.08] py-3.5"
            >
              <dt className="text-[11px] font-medium text-[#8893a6]">{label}</dt>
              <dd className="mt-1 text-[13px] font-medium leading-5 text-[#dce2ed]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {verified && company.notableFigures.length > 0 ? (
        <div className="mt-6 border-t border-white/[0.08] pt-5">
          <p className="text-[11px] font-medium text-[#8893a6]">Leadership</p>
          <div className="mt-2 divide-y divide-white/[0.06]">
            {company.notableFigures.map((figure) => {
              const body = (
                <>
                  <span className="block text-[13px] font-semibold text-[#e2e6ee]">
                    {figure.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-5 text-[#8d98aa]">
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
                  className="block py-3 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
                >
                  {body}
                </a>
              ) : (
                <div key={figure.name} className="py-3">
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {company.officialWebsite ? (
          <ExternalPill href={company.officialWebsite} label="Website" />
        ) : null}
        <ExternalPill
          href={wikipediaHref}
          label={company.wikipediaUrl ? "Wikipedia" : "Search Wikipedia"}
        />
      </div>

      <p className="mt-5 text-[11px] leading-5 text-[#697589]">
        {company.overviewSource === "wikipedia"
          ? "Background from Wikipedia and Wikidata."
          : company.overviewSource === "employer_listing"
            ? "Background from the employer’s own listing."
            : "Public records only — nothing here is invented."}
        {researchedAt ? ` Checked ${researchedAt}.` : ""}
      </p>
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
  const [dossierState, setDossierState] =
    useState<RequestState<JobDossierPayload> | null>(null);
  const [companyState, setCompanyState] =
    useState<RequestState<JobCompanyPayload> | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [copiedJobId, setCopiedJobId] = useState(null as string | null);
  const visual = companyVisual(job.company);
  const template = jobCardTemplateForCompany(job.company);
  const workLabel =
    job.workArrangement !== "Unclear" ? job.workArrangement : job.employmentType;
  const locationLabel =
    job.location
      .replace(/\s*\((remote|hybrid|on[- ]site)\)\s*/gi, " ")
      .trim() || job.location;
  const dossier =
    dossierState?.jobId === job.id && dossierState.status === "ready"
      ? dossierState.data
      : null;
  const company =
    companyState?.jobId === job.id && companyState.status === "ready"
      ? companyState.data.company
      : null;
  const supportedIndustry = companySupportsIndustry(
    dossier?.listing.industry,
    company,
  );
  const evidenceIsReliable = (value: string) =>
    supportedIndustry || !isIndustryClaim(value, dossier?.listing.industry);
  const matches = uniqueItems(job.strongestMatches, job.reasonsToApply)
    .filter(evidenceIsReliable)
    .slice(0, 3)
    .map(humanizeEvidence);
  const checks = uniqueItems(
    job.biggestGaps,
    job.reasonsNotToApply,
    Array.from(new Set(reliableWarnings(job))),
  )
    .filter(evidenceIsReliable)
    .slice(0, 3)
    .map(humanizeEvidence);
  const listingCopied = copiedJobId === job.id;
  const applyHref = dossier?.listing.canonicalListingUrl ?? job.sourceUrl;
  const postedLabel = readableDate(job.datePosted) ?? job.datePosted;
  const heroChips = [
    locationLabel,
    workLabel,
    job.employmentType !== workLabel ? job.employmentType : null,
    job.seniority,
    experienceRange(dossier?.listing ?? null),
    postedLabel ? `Posted ${postedLabel}` : null,
  ].filter((chip): chip is string => Boolean(chip));

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

  let sectionNumber = 0;
  const nextIndex = () => String(++sectionNumber).padStart(2, "0");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#02040a]/75 opacity-100 backdrop-blur-xl transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative isolate flex h-full w-full translate-y-0 flex-col overflow-hidden border border-white/[0.1] bg-[#070b14]/[0.985] text-white shadow-[0_32px_100px_rgba(0,0,0,.55)] transition-[transform,opacity] duration-350 ease-[cubic-bezier(.22,1,.36,1)] data-[ending-style]:translate-y-12 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-12 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:scale-100 sm:rounded-[1.75rem] sm:data-[ending-style]:translate-y-0 sm:data-[ending-style]:scale-[.97] sm:data-[starting-style]:translate-y-0 sm:data-[starting-style]:scale-[.97]"
          >
            <header className="safe-area-dialog-header relative z-30 flex shrink-0 items-center gap-3 border-b border-white/[0.08] bg-[#070b14]/90 px-4 backdrop-blur-2xl sm:h-14 sm:px-5 sm:pt-0">
              <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-[#77839a]">
                {job.company}
              </p>
              <Dialog.Close
                type="button"
                aria-label="Close listing"
                className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.12] bg-white/[0.05] text-[#c6cedb] outline-none transition-[color,background-color,transform] hover:bg-white/[0.1] hover:text-white active:scale-[.96] focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div
              data-job-detail-scroll
              className="detail-reveal relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/40"
              tabIndex={0}
              role="region"
              aria-label="Job listing"
            >
              {/* Hero — the job itself, tinted by the company palette. */}
              <div
                className="detail-hero relative isolate overflow-hidden px-5 pb-7 pt-7 sm:px-8"
                style={{
                  backgroundColor: template.backgroundColor,
                  backgroundImage: template.backgroundImage,
                  backgroundPosition: template.backgroundPosition,
                  backgroundSize: template.backgroundSize,
                }}
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(178deg,rgba(5,9,17,.82)_0%,rgba(6,10,19,.66)_46%,rgba(7,11,20,.97)_96%),radial-gradient(circle_at_18%_-4%,rgba(255,255,255,.14),transparent_38%)]"
                />
                <div className="relative">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[1.05rem] border border-white/[0.2] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_14px_34px_rgba(0,0,0,.32)]"
                      style={{
                        backgroundColor: visual.background,
                        color: visual.foreground,
                      }}
                    >
                      <CompanyMark
                        compact
                        company={job.company}
                        className="max-h-9 max-w-10"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white/90">
                        {job.company}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-white/55">
                        via {job.sourceName}
                      </p>
                    </div>
                  </div>

                  <Dialog.Title className="mt-5 text-balance font-display text-[clamp(1.7rem,6.4vw,2.35rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-white">
                    {job.title}
                  </Dialog.Title>
                  <Dialog.Description className="sr-only">
                    The full job listing, the employer’s own text, and company
                    background for {job.title} at {job.company}.
                  </Dialog.Description>

                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {heroChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full border border-white/[0.14] bg-black/25 px-3 py-1.5 text-[11.5px] font-medium text-white/85 backdrop-blur-sm"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex items-end justify-between gap-4 border-t border-white/[0.12] pt-5">
                    <div className="min-w-0">
                      <p className="font-display text-[clamp(1.45rem,5.6vw,1.9rem)] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">
                        {job.salaryDisplay}
                      </p>
                      <p className="mt-1.5 text-[11.5px] text-white/55">
                        Pay {salarySourceLabel[job.salarySource]}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mx-auto w-full max-w-2xl px-5 pb-10 sm:px-8 sm:pb-12">
                <SheetSection index={nextIndex()} label="The role">
                  <p className="text-[14.5px] leading-[1.7] tracking-[-0.01em] text-[#ccd3e0]">
                    {job.summary}
                  </p>
                  {job.responsibilities.length > 0 ? (
                    <div className="mt-6">
                      <p className="text-[12px] font-semibold text-[#aab4c5]">
                        Day to day
                      </p>
                      <div className="mt-3">
                        <PlainList items={job.responsibilities} />
                      </div>
                    </div>
                  ) : null}
                </SheetSection>

                <SheetSection index={nextIndex()} label="What they’re looking for">
                  <PlainList items={job.requiredQualifications} />
                  {job.preferredQualifications.length > 0 ? (
                    <div className="mt-6 border-t border-white/[0.06] pt-5">
                      <p className="text-[12px] font-semibold text-[#aab4c5]">
                        Nice to have
                      </p>
                      <div className="mt-3">
                        <PlainList items={job.preferredQualifications} />
                      </div>
                    </div>
                  ) : null}
                  {dossier?.listing.experienceRequirements.length ? (
                    <div className="mt-6 border-t border-white/[0.06] pt-5">
                      <p className="text-[12px] font-semibold text-[#aab4c5]">
                        Experience
                      </p>
                      <div className="mt-3">
                        <PlainList items={dossier.listing.experienceRequirements} />
                      </div>
                    </div>
                  ) : null}
                  {job.technologies.length > 0 ? (
                    <div className="mt-6 border-t border-white/[0.06] pt-5">
                      <p className="text-[12px] font-semibold text-[#aab4c5]">
                        Stack
                      </p>
                      <div className="mt-3">
                        <TechChips items={job.technologies} />
                      </div>
                    </div>
                  ) : null}
                </SheetSection>

                {dossier?.listing.benefits.length ? (
                  <SheetSection index={nextIndex()} label="Benefits">
                    <PlainList items={dossier.listing.benefits} />
                  </SheetSection>
                ) : null}

                {matches.length > 0 || checks.length > 0 ? (
                  <SheetSection
                    index={nextIndex()}
                    label="Against your profile"
                    trailing="from your saved background"
                  >
                    <div className="space-y-3">
                      {matches.map((item) => (
                        <p
                          key={item}
                          className="grid grid-cols-[1.1rem_1fr] gap-2 text-[13.5px] leading-[1.6] text-[#c3cbd9]"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-px font-mono text-[13px] font-semibold text-[#59d2a2]"
                          >
                            +
                          </span>
                          <span>{item}</span>
                        </p>
                      ))}
                      {checks.map((item) => (
                        <p
                          key={item}
                          className="grid grid-cols-[1.1rem_1fr] gap-2 text-[13.5px] leading-[1.6] text-[#a9b2c2]"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-px font-mono text-[13px] font-semibold text-[#e8a275]"
                          >
                            ?
                          </span>
                          <span>{item}</span>
                        </p>
                      ))}
                    </div>
                  </SheetSection>
                ) : null}

                <SheetSection index={nextIndex()} label={`About ${job.company}`}>
                  {company ? (
                    <CompanySection
                      company={company}
                      companyName={job.company}
                      roleSummary={job.summary}
                    />
                  ) : companyState?.jobId === job.id &&
                    companyState.status === "error" ? (
                    <ErrorRow
                      label="Company research could not be refreshed."
                      onRetry={retryDossier}
                    />
                  ) : (
                    <LoadingRow label={`Looking up ${job.company}…`} />
                  )}
                </SheetSection>

                {job.salaryIsEstimate ? (
                  <SheetSection index={nextIndex()} label="How pay was estimated">
                    <p className="text-[13px] leading-6 text-[#b5becc]">
                      {job.salaryDisclosure}
                    </p>
                    <p className="mt-2 text-[12px] leading-5 text-[#818ca0]">
                      {job.salaryMethod}
                    </p>
                    {job.salarySourceUrl ? (
                      <div className="mt-4">
                        <ExternalPill
                          href={job.salarySourceUrl}
                          label={job.salarySourceName}
                        />
                      </div>
                    ) : null}
                  </SheetSection>
                ) : null}

                <SheetSection
                  index={nextIndex()}
                  label="The listing, word for word"
                  trailing={
                    dossier
                      ? `captured ${readableDate(dossier.listing.retrievedAt) ?? "recently"}`
                      : undefined
                  }
                >
                  {dossier ? (
                    <details className="group">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 text-[13px] font-semibold text-[#d8deea] outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 [&::-webkit-details-marker]:hidden">
                        Read the employer’s exact text
                        <ChevronDown
                          className="ml-auto size-4 text-[#8792a5] transition-transform group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-white/[0.08] pt-5">
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => void copyListing()}
                            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 text-[11px] font-semibold text-[#c6cedb] outline-none hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
                            aria-label="Copy the complete job listing"
                          >
                            {listingCopied ? (
                              <Check className="size-3.5" aria-hidden="true" />
                            ) : (
                              <Copy className="size-3.5" aria-hidden="true" />
                            )}
                            {listingCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <div className="mt-4 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#aeb8c8]">
                          {dossier.listing.descriptionRaw}
                        </div>
                      </div>
                    </details>
                  ) : dossierState?.jobId === job.id &&
                    dossierState.status === "error" ? (
                    <ErrorRow
                      label="The exact source text could not be loaded."
                      onRetry={retryDossier}
                    />
                  ) : (
                    <LoadingRow label="Loading the employer’s exact text…" />
                  )}

                  <div className="mt-6 flex flex-wrap gap-2">
                    {applyHref ? (
                      <ExternalPill emphasis href={applyHref} label="Original listing" />
                    ) : null}
                    {job.sourceUrl &&
                    job.sourceUrl !== dossier?.listing.canonicalListingUrl ? (
                      <ExternalPill href={job.sourceUrl} label="Application page" />
                    ) : null}
                  </div>
                </SheetSection>
              </div>
            </div>

            <div className="relative z-30 grid shrink-0 grid-cols-[1fr_1fr_1.35fr] gap-2 border-t border-white/[0.08] bg-[#070b14]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl sm:px-5 sm:pb-3">
              <button
                type="button"
                onClick={() => onDecision("skipped")}
                disabled={pending}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.1] bg-white/[0.035] px-3 text-[12.5px] font-semibold text-[#aab4c5] outline-none transition-[background-color,border-color,transform] hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white active:scale-[.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
                Pass
              </button>
              <button
                type="button"
                onClick={() => onDecision("saved")}
                disabled={pending}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-white/[0.13] bg-white/[0.07] px-3 text-[12.5px] font-semibold text-white outline-none transition-[background-color,border-color,transform] hover:border-white/[0.2] hover:bg-white/[0.11] active:scale-[.97] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none"
              >
                <Heart className="size-4" aria-hidden="true" />
                Save
              </button>
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-disabled={pending}
                  tabIndex={pending ? -1 : undefined}
                  onClick={(event) => {
                    if (pending) {
                      event.preventDefault();
                      return;
                    }
                    onDecision("apply");
                  }}
                  className={`apply-shimmer relative inline-flex h-12 items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-[#8f85ff]/80 bg-[linear-gradient(160deg,#8b80ff,#6c60ee_60%,#5d51e2)] px-3 text-[12.5px] font-semibold text-white shadow-[0_10px_30px_rgba(90,78,220,.35),inset_0_1px_0_rgba(255,255,255,.28)] outline-none transition-transform active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70 motion-reduce:transition-none ${
                    pending ? "pointer-events-none opacity-45" : ""
                  }`}
                >
                  Apply
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 text-[12.5px] font-semibold text-[#667286]">
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
