"use client";

import {
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Copy,
  FileText,
  Heart,
  Laptop2,
  LayoutDashboard,
  Lightbulb,
  LoaderCircle,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  UsersRound,
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

type DetailTab = "overview" | "fit" | "company" | "listing";

type RequestState<T> =
  | { jobId: string; status: "loading" }
  | { error: string; jobId: string; status: "error" }
  | { data: T; jobId: string; status: "ready" };

const DETAIL_TABS: ReadonlyArray<{
  icon: LucideIcon;
  id: DetailTab;
  label: string;
}> = [
  { id: "overview", icon: LayoutDashboard, label: "Overview" },
  { id: "fit", icon: Target, label: "Fit" },
  { id: "company", icon: Building2, label: "Company" },
  { id: "listing", icon: FileText, label: "Listing" },
];

const salarySourceLabel = {
  employer_posted: "Employer posted",
  externally_estimated: "Market estimate",
  unknown: "Estimated range",
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

function fitLabel(verdict: JobCardViewModel["verdict"]) {
  if (verdict === "Strong Apply") return "Strong fit";
  if (verdict === "Apply") return "Worth applying";
  if (verdict === "Apply as a Stretch") return "Credible stretch";
  if (verdict === "Learn First") return "Prepare first";
  if (verdict === "Skip") return "Low priority";
  return "Keep watching";
}

function confidenceLabel(value: "high" | "medium" | "low") {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} confidence`;
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
        ? "The employer did not post pay; this role uses a market estimate."
        : warning,
    );
}

function SectionHeading({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-[#8176ff]">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-white">
        {title}
      </h3>
    </div>
  );
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
    <div className="min-w-0 border-t border-white/[0.08] py-4">
      <dt className="text-[11px] font-medium text-[#8893a6]">{label}</dt>
      <dd className="mt-1.5 text-[13px] font-medium leading-5 text-[#dce2ed]">
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
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.045] px-4 text-[12px] font-semibold text-[#c5ccda] outline-none transition-[background-color,border-color,transform] hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
    >
      {label}
      <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </a>
  );
}

function LoadingDossier({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 border-y border-white/[0.08] py-5 text-[13px] text-[#9ca7ba]"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin text-[#8176ff]" aria-hidden="true" />
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

function DetailList({
  items,
  emptyLabel = "Not specified in the listing.",
  tone = "default",
}: {
  items: readonly string[];
  emptyLabel?: string;
  tone?: "default" | "positive" | "caution";
}) {
  const visibleItems = items.filter(Boolean);
  const bulletClassName =
    tone === "positive"
      ? "bg-[#59d2a2]"
      : tone === "caution"
        ? "bg-[#e89a68]"
        : "bg-[#8176ff]";

  if (visibleItems.length === 0) {
    return <p className="text-[13px] leading-6 text-[#7f899b]">{emptyLabel}</p>;
  }

  return (
    <ul className="divide-y divide-white/[0.07]">
      {visibleItems.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="grid grid-cols-[1rem_1fr] gap-3 py-3.5 text-[13px] leading-6 text-[#b9c2d1] first:pt-0 last:pb-0"
        >
          <span
            className={cn("mt-[0.65rem] size-1.5 rounded-full", bulletClassName)}
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function InsightRow({
  children,
  label,
  tone = "strategy",
}: {
  children: ReactNode;
  label: string;
  tone?: "positive" | "caution" | "strategy";
}) {
  const toneStyles = {
    positive: {
      icon: "border-[#59d2a2]/20 bg-[#59d2a2]/[0.08] text-[#67d9ac]",
      label: "text-[#72dbb2]",
      rail: "bg-[#59d2a2]",
    },
    caution: {
      icon: "border-[#eba06f]/20 bg-[#eba06f]/[0.08] text-[#f0aa7d]",
      label: "text-[#e8a275]",
      rail: "bg-[#e89a68]",
    },
    strategy: {
      icon: "border-[#8176ff]/25 bg-[#8176ff]/[0.1] text-[#a9a1ff]",
      label: "text-[#a9a1ff]",
      rail: "bg-[#8176ff]",
    },
  }[tone];

  return (
    <div className="relative grid grid-cols-[2.25rem_1fr] gap-3 border-t border-white/[0.08] py-4 pl-3 first:border-t-0">
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-4 left-0 w-px rounded-full", toneStyles.rail)}
      />
      <span className={cn("mt-0.5 grid size-9 place-items-center rounded-xl border", toneStyles.icon)}>
        {tone === "caution" ? (
          <ShieldAlert className="size-4" aria-hidden="true" />
        ) : tone === "positive" ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Lightbulb className="size-4" aria-hidden="true" />
        )}
      </span>
      <div>
        <p className={cn("text-[11px] font-semibold", toneStyles.label)}>{label}</p>
        <p className="mt-1 text-[13px] leading-6 text-[#c2cad8]">{children}</p>
      </div>
    </div>
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
  const verified = company.status === "verified";
  const showStructuredFacts = verified;

  return (
    <section aria-labelledby="company-dossier-heading">
      <div className="border-b border-white/[0.08] pb-6">
        <div className="flex items-center gap-2 text-[#8176ff]">
          <Building2 className="size-4" aria-hidden="true" />
          <p className="text-[11px] font-semibold">Company research</p>
        </div>
        <h3
          id="company-dossier-heading"
          className="mt-2 text-2xl font-semibold tracking-[-0.045em] text-white"
        >
          About {companyName}
        </h3>
        {company.description ? (
          <p className="mt-2 text-[13px] leading-6 text-[#929daf]">
            {company.description}
          </p>
        ) : null}
      </div>

      <div className="py-6">
        {company.overview ? (
          <p className="whitespace-pre-line text-[14px] leading-7 tracking-[-0.01em] text-[#c1c9d6]">
            {company.overview}
          </p>
        ) : (
          <p className="text-[13px] leading-6 text-[#8c97aa]">
            {company.status === "unavailable"
              ? "Public company research is temporarily unavailable. The official and Wikipedia links remain available below."
              : "No confidently matched public company history was available."}
          </p>
        )}
      </div>

      {showStructuredFacts ? (
        <dl className="grid grid-cols-2 gap-x-5 border-y border-white/[0.08]">
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
                    company.employeeCount.asOf ? ` (${company.employeeCount.asOf})` : ""
                  }`
                : null
            }
          />
          <DossierFact label="Parent company" value={company.parentOrganization} />
        </dl>
      ) : null}

      {verified && company.notableFigures.length > 0 ? (
        <section className="border-b border-white/[0.08] py-6" aria-labelledby="leadership-heading">
          <div className="flex items-center gap-2 text-[#aeb7c7]">
            <UsersRound className="size-4" aria-hidden="true" />
            <h4 id="leadership-heading" className="text-[12px] font-semibold">
              Leadership and founders
            </h4>
          </div>
          <div className="mt-4 divide-y divide-white/[0.08]">
            {company.notableFigures.map((figure) => {
              const body = (
                <>
                  <span className="block text-[13px] font-semibold text-[#e2e6ee]">
                    {figure.name}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-[#8d98aa]">
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
                  className="block py-4 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
                >
                  {body}
                </a>
              ) : (
                <div key={figure.name} className="py-4">
                  {body}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#717d91]">
            Public leadership records can lag company changes; verify names before outreach.
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-white/[0.08] py-6">
        {company.officialWebsite ? (
          <ExternalPill href={company.officialWebsite} label="Official website" />
        ) : null}
        <ExternalPill
          href={wikipediaHref}
          label={company.wikipediaUrl ? "Wikipedia" : "Search Wikipedia"}
        />
        {verified && company.wikidataUrl ? (
          <ExternalPill href={company.wikidataUrl} label="Wikidata" />
        ) : null}
      </div>

      <p className="pt-5 text-[11px] leading-5 text-[#717d91]">
        {company.overviewSource === "wikipedia"
          ? "Background from Wikipedia; structured facts from Wikidata."
          : company.overviewSource === "employer_listing"
            ? "Background supplied by the employer in this job listing."
            : company.status === "not_found"
              ? "No exact Wikipedia company page was confidently matched."
              : "Public company data could not be refreshed."}
        {researchedAt ? ` Checked ${researchedAt}.` : ""}
      </p>
    </section>
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
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [dossierState, setDossierState] = useState<RequestState<JobDossierPayload> | null>(
    null,
  );
  const [companyState, setCompanyState] = useState<RequestState<JobCompanyPayload> | null>(
    null,
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const tabButtonRefs = useRef(new Map<DetailTab, HTMLButtonElement>());
  const visual = companyVisual(job.company);
  const template = jobCardTemplateForCompany(job.company);
  const workLabel =
    job.workArrangement !== "Unclear" ? job.workArrangement : job.employmentType;
  const locationLabel =
    job.location
      .replace(/\s*\((remote|hybrid|on[- ]site)\)\s*/gi, " ")
      .trim() || job.location;
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
  const visibleWarnings = Array.from(new Set(reliableWarnings(job)));
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
  const positiveEvidence = uniqueItems(job.strongestMatches, job.reasonsToApply).filter(
    evidenceIsReliable,
  );
  const cautionEvidence = uniqueItems(
    job.biggestGaps,
    job.reasonsNotToApply,
    visibleWarnings,
  ).filter(evidenceIsReliable);
  const visibleScoreBreakdown = job.scoreBreakdown.filter(
    (item) => supportedIndustry || !/\bindustr(?:y|ies)\b/i.test(item.label),
  );
  const listingCopied = copiedJobId === job.id;

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setActiveTab("overview");
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

  const selectTab = (tab: DetailTab, focusSelectedTab = false) => {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-job-detail-scroll]")?.scrollTo({
        behavior: "smooth",
        top: 0,
      });
    });
    if (focusSelectedTab) {
      window.setTimeout(() => tabButtonRefs.current.get(tab)?.focus(), 60);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-[#02040a]/75 opacity-100 backdrop-blur-xl transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 motion-reduce:transition-none" />
        <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-end overflow-hidden sm:place-items-center sm:p-5">
          <Dialog.Popup
            finalFocus={returnFocusRef}
            className="relative isolate flex h-full w-full translate-y-0 flex-col overflow-hidden border border-white/[0.1] bg-[#070b14]/[0.985] text-white shadow-[0_32px_100px_rgba(0,0,0,.55)] transition-[transform,opacity] duration-350 ease-[cubic-bezier(.22,1,.36,1)] data-[ending-style]:translate-y-12 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-12 data-[starting-style]:opacity-0 motion-reduce:transition-none sm:h-auto sm:max-h-[92dvh] sm:max-w-3xl sm:scale-100 sm:rounded-[1.75rem] sm:data-[ending-style]:translate-y-0 sm:data-[ending-style]:scale-[.97] sm:data-[starting-style]:translate-y-0 sm:data-[starting-style]:scale-[.97]"
          >
            <header
              className="safe-area-dialog-header relative z-30 flex shrink-0 items-center gap-3 overflow-hidden border-b border-white/[0.1] px-4 shadow-[0_14px_36px_rgba(0,0,0,.2)] sm:h-[4.25rem] sm:px-5 sm:pt-0"
              style={{
                backgroundColor: template.backgroundColor,
                backgroundImage: template.backgroundImage,
                backgroundPosition: template.backgroundPosition,
                backgroundSize: template.backgroundSize,
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(4,8,15,.88),rgba(6,10,19,.78)_54%,rgba(6,10,19,.9)),radial-gradient(circle_at_22%_0%,rgba(255,255,255,.16),transparent_42%)] backdrop-blur-[2px]"
              />
              <div
                className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[0.85rem] border border-white/[0.18] px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_8px_24px_rgba(0,0,0,.24)]"
                style={{ backgroundColor: visual.background, color: visual.foreground }}
              >
                <CompanyMark compact company={job.company} className="max-h-7 max-w-8" />
              </div>
              <div className="relative min-w-0 flex-1">
                <p className="truncate text-[10px] font-semibold uppercase tracking-[0.11em] text-white/55">
                  {job.company} · {fitLabel(job.verdict)}
                </p>
                <Dialog.Title className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-4 tracking-[-0.02em] text-white">
                  {job.title}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  A role overview with personalized fit analysis, company research, and the original job listing.
                </Dialog.Description>
              </div>
              <Dialog.Close
                type="button"
                aria-label="Close role brief"
                className="relative grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.13] bg-black/20 text-[#c6cedb] outline-none backdrop-blur-xl transition-[color,background-color,transform] hover:bg-white/[0.1] hover:text-white active:scale-[.97] focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </header>

            <div
              data-job-detail-scroll
              className="relative z-10 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/40"
              tabIndex={0}
              role="region"
              aria-label="Job detail content"
            >
              <nav
                className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#070b14]/90 backdrop-blur-2xl"
                aria-label="Role detail sections"
              >
                <div className="mx-auto grid w-full max-w-2xl grid-cols-4 gap-1 p-1.5 sm:px-5 sm:py-2">
                  {DETAIL_TABS.map((tab) => {
                    const active = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => selectTab(tab.id)}
                        ref={(node) => {
                          if (node) tabButtonRefs.current.set(tab.id, node);
                          else tabButtonRefs.current.delete(tab.id);
                        }}
                        data-detail-tab={tab.id}
                        aria-pressed={active}
                        className={cn(
                          "relative flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8176ff]/60",
                          active
                            ? "border-white/[0.11] bg-white/[0.075] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_7px_18px_rgba(0,0,0,.14)]"
                            : "border-transparent text-[#778399] hover:bg-white/[0.04] hover:text-[#cbd2de]",
                        )}
                      >
                        <Icon
                          className={cn("size-3.5", active && "text-[#a9a1ff]")}
                          strokeWidth={active ? 2 : 1.7}
                          aria-hidden="true"
                        />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </nav>

              <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-1 sm:px-7 sm:pb-12">
                {activeTab === "overview" ? (
                  <div aria-label="Role overview">
                    <section className="border-b border-white/[0.08] py-5" aria-labelledby={`pay-${job.id}`}>
                      <div className="flex items-center justify-between gap-4">
                        <p id={`pay-${job.id}`} className="flex items-center gap-2 text-[11px] font-semibold text-[#a9a1ff]">
                          <CircleDollarSign className="size-3.5" aria-hidden="true" />
                          Role snapshot
                        </p>
                        <p className="text-[11px] text-[#828da1]">
                          {salarySourceLabel[job.salarySource]}
                          {job.salaryIsEstimate ? ` · ${confidenceLabel(job.salaryConfidence)}` : ""}
                        </p>
                      </div>
                      <p className="mt-2 text-[1.8rem] font-semibold tracking-[-0.045em] text-white tabular-nums sm:text-4xl">
                        {job.salaryDisplay}
                      </p>
                      <div className="mt-4 flex min-h-10 min-w-0 items-center border-y border-white/[0.08] text-[12px] font-medium text-[#b5becc]">
                        <p className="flex min-w-0 flex-1 items-center gap-1.5 py-2.5">
                          <MapPin className="size-3.5 shrink-0 text-[#8176ff]" aria-hidden="true" />
                          <span className="sr-only">Location: </span>
                          <span className="truncate">{locationLabel}</span>
                        </p>
                        <span className="mx-2.5 h-3.5 w-px shrink-0 bg-white/[0.09]" aria-hidden="true" />
                        <p className="flex shrink-0 items-center gap-1.5 py-2.5">
                          <Laptop2 className="size-3.5 text-[#8176ff]" aria-hidden="true" />
                          <span className="sr-only">Work arrangement: </span>
                          {workLabel}
                        </p>
                        <span className="mx-2.5 hidden h-3.5 w-px shrink-0 bg-white/[0.09] min-[360px]:block" aria-hidden="true" />
                        <p className="hidden shrink-0 items-center gap-1.5 py-2.5 text-[#8792a5] min-[360px]:flex">
                          <Clock3 className="size-3.5" aria-hidden="true" />
                          <span className="sr-only">Posted: </span>
                          {readableDate(job.datePosted) ?? job.datePosted ?? "Date not listed"}
                        </p>
                      </div>
                    </section>

                    <section className="border-b border-white/[0.08] py-5" aria-label="Recommendation">
                      <div className="role-decision-surface relative isolate overflow-hidden rounded-[1.45rem] p-5">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute -right-10 -top-14 size-44 rounded-full bg-[#8176ff]/15 blur-3xl"
                        />
                        <div className="relative flex items-center justify-between gap-4">
                          <p className="flex items-center gap-2 text-[11px] font-semibold text-[#a9a1ff]">
                            <Sparkles className="size-3.5" aria-hidden="true" />
                            Recommendation
                          </p>
                          <p className="text-[10px] font-medium text-[#8d98aa]">
                            {job.decisionBrief
                              ? confidenceLabel(job.decisionBrief.confidence)
                              : `${job.deterministicFitCoverage}% evidence`}
                          </p>
                        </div>
                        <h2 className="relative mt-3 text-[1.65rem] font-semibold leading-none tracking-[-0.045em] text-white">
                          {job.verdict}
                        </h2>
                        <p className="relative mt-3 text-[13px] leading-6 text-[#bbc4d2]">
                          {job.verdictExplanation}
                        </p>
                        <button
                          type="button"
                          onClick={() => selectTab("fit", true)}
                          className="relative mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.065] px-4 text-[12px] font-semibold text-[#d4dae5] outline-none transition hover:border-white/[0.2] hover:bg-white/[0.1] hover:text-white focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70"
                        >
                          Review fit evidence
                          <ArrowUpRight className="size-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </section>

                    <section className="border-b border-white/[0.08] py-1" aria-label="Decision guidance">
                      <InsightRow label="Your edge" tone="positive">{strongestMatch}</InsightRow>
                      <InsightRow label="Watch-out" tone="caution">{biggestRisk}</InsightRow>
                      <InsightRow label="Best positioning move">{bestMove}</InsightRow>
                    </section>

                    <section className="border-b border-white/[0.08] py-6" aria-labelledby={`summary-${job.id}`}>
                      <SectionHeading eyebrow="Role in one minute" title="What you’d be doing" />
                      <p className="mt-4 text-[14px] leading-7 tracking-[-0.01em] text-[#bdc6d4]">
                        {job.summary}
                      </p>
                    </section>

                    <details className="group border-b border-white/[0.08]" id={`facts-${job.id}`}>
                      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 text-[13px] font-semibold text-[#cbd2de] outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 [&::-webkit-details-marker]:hidden">
                        <BriefcaseBusiness className="size-4 text-[#8176ff]" aria-hidden="true" />
                        More role details
                        <ChevronDown className="ml-auto size-4 text-[#7d899d] transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <dl className="grid grid-cols-2 gap-x-5 border-t border-white/[0.08] pb-2">
                        <DossierFact label="Employment" value={job.employmentType} />
                        <DossierFact label="Seniority" value={job.seniority} />
                        <DossierFact label="Experience" value={experienceRange(dossier?.listing ?? null)} />
                        <DossierFact label="Posted" value={readableDate(job.datePosted)} />
                        <DossierFact label="Apply by" value={job.applicationDeadline} />
                        <DossierFact label="Travel" value={job.travelRequirement} />
                        <DossierFact label="Remote limits" value={dossier?.listing.remoteRestriction ?? null} />
                      </dl>
                    </details>
                  </div>
                ) : null}

                {activeTab === "fit" ? (
                  <div aria-label="Personalized fit analysis">
                    <section className="border-b border-white/[0.08] py-6">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <SectionHeading eyebrow="Your fit" title={fitLabel(job.verdict)} />
                        <div className="text-right">
                          <p className="text-[12px] font-semibold text-[#cbd2de]">{job.readiness}</p>
                          <p className="mt-1 text-[11px] text-[#7f8a9e]">
                            {job.decisionBrief
                              ? confidenceLabel(job.decisionBrief.confidence)
                              : `${job.deterministicFitCoverage}% evidence coverage`}
                          </p>
                        </div>
                      </div>
                      <p className="mt-4 text-[14px] leading-7 text-[#b6bfce]">
                        {job.verdictExplanation}
                      </p>
                    </section>

                    <section className="border-b border-white/[0.08] py-2" aria-label="Decision brief">
                      <InsightRow label="Your advantage" tone="positive">{strongestMatch}</InsightRow>
                      <InsightRow label="Main concern" tone="caution">
                        {biggestRisk}
                      </InsightRow>
                      <InsightRow label="Best positioning move">{bestMove}</InsightRow>
                    </section>

                    <section className="relative border-b border-white/[0.08] py-6 pl-4" aria-labelledby={`evidence-${job.id}`}>
                      <span className="absolute inset-y-6 left-0 w-px rounded-full bg-[#59d2a2]" aria-hidden="true" />
                      <h3 id={`evidence-${job.id}`} className="text-[12px] font-semibold text-[#72dbb2]">
                        Evidence in your favor
                      </h3>
                      <div className="mt-4">
                        <DetailList items={positiveEvidence} tone="positive" />
                      </div>
                    </section>

                    <section className="relative border-b border-white/[0.08] py-6 pl-4" aria-labelledby={`gaps-${job.id}`}>
                      <span className="absolute inset-y-6 left-0 w-px rounded-full bg-[#e89a68]" aria-hidden="true" />
                      <h3 id={`gaps-${job.id}`} className="text-[12px] font-semibold text-[#e8a275]">
                        Gaps to resolve
                      </h3>
                      <div className="mt-4">
                        <DetailList items={cautionEvidence} tone="caution" />
                      </div>
                    </section>

                    <section className="border-b border-white/[0.08] py-6" aria-labelledby={`requirements-${job.id}`}>
                      <h3 id={`requirements-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                        What they require
                      </h3>
                      <div className="mt-4">
                        <DetailList items={job.requiredQualifications} />
                      </div>
                      {job.preferredQualifications.length > 0 ? (
                        <div className="mt-6 border-t border-white/[0.08] pt-5">
                          <p className="text-[11px] font-semibold text-[#8894a7]">Preferred</p>
                          <div className="mt-3">
                            <DetailList items={job.preferredQualifications} />
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="py-6" aria-labelledby={`score-${job.id}`}>
                      <div className="flex items-end justify-between gap-4">
                        <h3 id={`score-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                          Why the recommendation looks this way
                        </h3>
                        <p className="text-[11px] text-[#768297]">
                          {job.deterministicFitCoverage}% coverage
                        </p>
                      </div>
                      <div className="mt-4 divide-y divide-white/[0.08] border-y border-white/[0.08]">
                        {visibleScoreBreakdown.map((item) => (
                          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-4 py-4">
                            <div>
                              <p className="text-[13px] font-semibold text-[#d9dfe9]">{item.label}</p>
                              <p className="mt-1 text-[12px] leading-5 text-[#8894a7]">{item.note}</p>
                            </div>
                            <span className="text-[13px] font-semibold tabular-nums text-[#a9a1ff]">
                              {item.score.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : null}

                {activeTab === "company" ? (
                  <div className="py-6" aria-label="Company research">
                    {company ? (
                      <CompanyDossier company={company} companyName={job.company} />
                    ) : companyState?.jobId === job.id && companyState.status === "error" ? (
                      <DossierError
                        label="Company research could not be refreshed. The role details are still available."
                        onRetry={retryDossier}
                      />
                    ) : (
                      <LoadingDossier label={`Researching ${job.company}…`} />
                    )}
                  </div>
                ) : null}

                {activeTab === "listing" ? (
                  <div aria-label="Employer job listing">
                    <section className="border-b border-white/[0.08] py-6">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
                        <div>
                          <p className="text-[11px] font-semibold text-[#8176ff]">Employer source</p>
                          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white">
                            Complete role requirements
                          </h3>
                          <p className="mt-2 text-[13px] leading-6 text-[#8f9aad]">
                            Structured for scanning. The exact employer wording remains available below.
                          </p>
                        </div>
                      </div>
                    </section>

                    <section className="border-b border-white/[0.08] py-6" aria-labelledby={`responsibilities-${job.id}`}>
                      <h3 id={`responsibilities-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                        Responsibilities
                      </h3>
                      <div className="mt-4">
                        <DetailList items={job.responsibilities} />
                      </div>
                    </section>

                    <section className="border-b border-white/[0.08] py-6" aria-labelledby={`listing-requirements-${job.id}`}>
                      <h3 id={`listing-requirements-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                        Qualifications
                      </h3>
                      <div className="mt-4">
                        <DetailList items={job.requiredQualifications} />
                      </div>
                      {job.preferredQualifications.length > 0 ? (
                        <div className="mt-6 border-t border-white/[0.08] pt-5">
                          <p className="text-[11px] font-semibold text-[#8894a7]">Preferred</p>
                          <div className="mt-3">
                            <DetailList items={job.preferredQualifications} />
                          </div>
                        </div>
                      ) : null}
                      {dossier?.listing.experienceRequirements.length ? (
                        <div className="mt-6 border-t border-white/[0.08] pt-5">
                          <p className="text-[11px] font-semibold text-[#8894a7]">Experience</p>
                          <div className="mt-3">
                            <DetailList items={dossier.listing.experienceRequirements} />
                          </div>
                        </div>
                      ) : null}
                    </section>

                    {job.technologies.length > 0 ? (
                      <section className="border-b border-white/[0.08] py-6" aria-labelledby={`skills-${job.id}`}>
                        <h3 id={`skills-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                          Skills and technologies
                        </h3>
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                          {job.technologies.map((technology) => (
                            <span key={technology} className="text-[12px] font-medium text-[#b6bfce]">
                              {technology}
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {dossier?.listing.benefits.length ? (
                      <section className="border-b border-white/[0.08] py-6" aria-labelledby={`benefits-${job.id}`}>
                        <h3 id={`benefits-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                          Benefits in the listing
                        </h3>
                        <div className="mt-4">
                          <DetailList items={dossier.listing.benefits} />
                        </div>
                      </section>
                    ) : null}

                    {job.salaryIsEstimate ? (
                      <section className="border-b border-white/[0.08] py-6" aria-labelledby={`salary-source-${job.id}`}>
                        <div className="flex items-center gap-2 text-[#8176ff]">
                          <CircleDollarSign className="size-4" aria-hidden="true" />
                          <h3 id={`salary-source-${job.id}`} className="text-[12px] font-semibold">
                            How pay was estimated
                          </h3>
                        </div>
                        <p className="mt-3 text-[13px] leading-6 text-[#b5becc]">{job.salaryDisclosure}</p>
                        <p className="mt-2 text-[12px] leading-5 text-[#818ca0]">{job.salaryMethod}</p>
                        {job.salarySourceUrl ? (
                          <div className="mt-4">
                            <ExternalPill href={job.salarySourceUrl} label={job.salarySourceName} />
                          </div>
                        ) : null}
                      </section>
                    ) : null}

                    <section className="border-b border-white/[0.08] py-6">
                      {dossier ? (
                        <details className="group">
                          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 text-[13px] font-semibold text-[#d8deea] outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 [&::-webkit-details-marker]:hidden">
                            Exact employer wording
                            <ChevronDown
                              className="ml-auto size-4 text-[#8792a5] transition-transform group-open:rotate-180"
                              aria-hidden="true"
                            />
                          </summary>
                          <div className="border-t border-white/[0.08] pt-5">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] leading-5 text-[#778399]">
                                Spacing may be normalized by the feed.
                              </p>
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
                            <div className="mt-5 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#aeb8c8]">
                              {dossier.listing.descriptionRaw}
                            </div>
                          </div>
                        </details>
                      ) : dossierState?.jobId === job.id && dossierState.status === "error" ? (
                        <DossierError
                          label="The exact source text could not be loaded."
                          onRetry={retryDossier}
                        />
                      ) : (
                        <LoadingDossier label="Loading the exact employer wording…" />
                      )}
                    </section>

                    <section className="py-6" aria-labelledby={`source-links-${job.id}`}>
                      <h3 id={`source-links-${job.id}`} className="text-[12px] font-semibold text-[#aab4c5]">
                        Source and application
                      </h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {dossier?.listing.canonicalListingUrl ? (
                          <ExternalPill
                            href={dossier.listing.canonicalListingUrl}
                            label="Original listing"
                          />
                        ) : job.sourceUrl ? (
                          <ExternalPill href={job.sourceUrl} label="Original listing" />
                        ) : null}
                        {job.sourceUrl && job.sourceUrl !== dossier?.listing.canonicalListingUrl ? (
                          <ExternalPill href={job.sourceUrl} label="Application" />
                        ) : null}
                      </div>
                      {dossier ? (
                        <dl className="mt-5 grid grid-cols-2 gap-x-5 border-t border-white/[0.08]">
                          <DossierFact label="Captured" value={readableDate(dossier.listing.retrievedAt)} />
                          <DossierFact label="Source updated" value={readableDate(dossier.listing.sourceUpdatedAt)} />
                          <DossierFact label="First seen" value={readableDate(dossier.listing.firstSeenAt)} />
                          <DossierFact label="Last seen" value={readableDate(dossier.listing.lastSeenAt)} />
                        </dl>
                      ) : null}
                      <p className="mt-4 text-[11px] leading-5 text-[#697589]">
                        {job.employmentType} · {job.sourceName}
                        {job.datePosted ? ` · ${job.datePosted}` : ""}
                        {dossier
                          ? ` · Listing revision ${dossier.listing.revisionNumber} · ${dossier.listing.parserVersion}`
                          : ""}
                      </p>
                    </section>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="relative z-30 grid shrink-0 grid-cols-3 gap-2 border-t border-white/[0.08] bg-[#070b14]/95 px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-2xl sm:px-5 sm:pb-3">
              <button
                type="button"
                onClick={() => onDecision("skipped")}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-[12px] font-semibold text-[#aab4c5] outline-none transition-[background-color,border-color,transform] hover:border-white/[0.16] hover:bg-white/[0.07] hover:text-white active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none"
              >
                <X className="size-4" aria-hidden="true" />
                Pass
              </button>
              <button
                type="button"
                onClick={() => onDecision("saved")}
                disabled={pending}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/[0.13] bg-white/[0.07] px-3 text-[12px] font-semibold text-white outline-none transition-[background-color,border-color,transform] hover:border-white/[0.2] hover:bg-white/[0.11] active:scale-[.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-[#8176ff]/60 motion-reduce:transition-none"
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
                  className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#8176ff] bg-[#8176f2] px-3 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(74,63,191,.24)] outline-none transition-[background-color,transform] hover:bg-[#766ae8] active:scale-[.98] focus-visible:ring-2 focus-visible:ring-[#a9a1ff]/70 motion-reduce:transition-none ${
                    pending ? "pointer-events-none opacity-45" : ""
                  }`}
                >
                  Apply
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-[12px] font-semibold text-[#667286]">
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
